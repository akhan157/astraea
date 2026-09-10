/**
 * Astraea Monte Carlo Dispersion Engine
 *
 * Runs the authoritative 6-DOF trajectory simulator (`simulate6DofFlight`)
 * under Gaussian-perturbed launch conditions and reduces the landing cloud
 * into dispersion statistics: mean impact point, 2x2 covariance, 1σ ellipse
 * semi-axes (eigenvalues of the covariance), and empirical circular
 * containment radii (CEP = r50, r90, r99) around the mean.
 *
 * Determinism contract: a fixed `seed` and fixed `perturbations` produce
 * bit-identical landing arrays — the RNG is a seeded mulberry32 and
 * Gaussian draws use Box-Muller; no source of nondeterminism (Math.random,
 * wall clock, iteration order over object keys) is used. Each run perturbs a
 * deep clone of `baseInput`; the caller's input is never mutated.
 *
 * Chunk contract (Q12): run *i* draws exclusively from the sub-seed
 * `subSeedOf(masterSeed, i)` — a pure function of the master seed and the
 * absolute run index — so any chunk partition of the same
 * `(baseInput, perturbations, nRuns, seed)` reproduces the identical
 * ensemble, run for run. `runMonteCarlo` is the single-chunk specialization
 * of `finalizeMonteCarloChunks([runMonteCarloChunk(…, 0, nRuns)], nRuns)`;
 * the chunk API is an implementation detail of the determinism contract,
 * never a new RNG stream.
 *
 * Exception contract: any per-run exception (input validation, out-of-domain
 * rail elevation, negative impulse scale, …) is caught and counted in
 * `failedRuns`; the remaining runs are reduced into the statistics. When
 * EVERY run fails, runMonteCarlo throws an Error whose message carries the
 * first per-run failure — an all-NaN cloud would otherwise mask a
 * systematic configuration error. Partial failure (n >= 1 runs succeed)
 * keeps the existing behavior.
 */

import { RocketVehicle } from '../core/types';
import { MotorSpec } from '../propulsion/motorDatabase';
import { simulate6DofFlight, SixDofOptions, SixDofSimulationResult } from './sixDofSimulator';

/** Per-run landing offset from the launch pad: East (x), North (y), meters. */
export interface LandingPoint {
  x: number;
  y: number;
}

/** Full input bundle for one trajectory simulation run. */
export interface MonteCarloSimInput {
  vehicle: RocketVehicle;
  motor: MotorSpec;
  options: SixDofOptions;
}

/**
 * 1σ spread of each Gaussian perturbation. Missing/zero fields leave the
 * corresponding input untouched (a zero-sigma run reproduces the
 * unperturbed simulation exactly).
 */
export interface PerturbationSigmas {
  /** 1σ wind-direction spread, degrees (perturbs `options.windAzimuthDeg`). */
  windAzimuthDegSigma?: number;
  /** 1σ launch-rail elevation spread, degrees (perturbs `options.railElevationDeg`). */
  railAngleDegSigma?: number;
  /** 1σ motor impulse spread, percent of nominal (scales the thrust curve). */
  impulsePctSigma?: number;
}

/** Symmetric 2x2 covariance matrix of the landing cloud (East, North). */
export interface Covariance2x2 {
  xx: number;
  xy: number;
  yy: number;
}

/** Circular containment radii about the mean, from the empirical radial CDF. */
export interface ContainmentRadii {
  r50: number;
  r90: number;
  r99: number;
}

/** Reduced dispersion statistics for a landing cloud. */
export interface DispersionStatistics {
  /** Mean impact point (East, North), meters. */
  mean: LandingPoint;
  /** Sample covariance (N-1 denominator), meters^2. */
  covariance: Covariance2x2;
  /** 1σ semi-major ellipse axis = sqrt(largest covariance eigenvalue), meters. */
  sigma1: number;
  /** 1σ semi-minor ellipse axis = sqrt(smallest covariance eigenvalue), meters. */
  sigma2: number;
  /** Orientation of the sigma1 axis, degrees from +X (East), CCW-positive. */
  thetaDeg: number;
  /** Empirical circular radii from the mean containing 50/90/99% of landings. */
  containmentRadii: ContainmentRadii;
}

export interface DispersionResult extends DispersionStatistics {
  /** Successful landings in run order (length = successfulRuns). */
  landings: LandingPoint[];
  successfulRuns: number;
  failedRuns: number;
}

/**
 * mulberry32 — 32-bit seeded PRNG returning uniform doubles on [0, 1).
 * Deterministic for a given integer seed on any IEEE-754 platform.
 *
 * State arithmetic runs in BigInt so every multiply is an exact 64-bit
 * product before the mod-2^32 wrap. JS `& 0xffffffff` on Number is a
 * SIGNED int32 op (the mask is -1), and Number products above 2^53 round,
 * so a Number-only implementation silently corrupts the top bit and the
 * low bits — hand-verified to collapse the output range to [0, 0.5).
 */
export function mulberry32(seed: number): () => number {
  if (!Number.isInteger(seed)) {
    throw new Error(`mulberry32: seed must be an integer (got ${seed})`);
  }
  const MASK = 0xffffffffn;
  const INCR = 0x6d2b79f5n;
  let state = BigInt(seed) & MASK;
  return function next(): number {
    state = (state + INCR) & MASK;
    let v = state;
    v = (v ^ (v >> 15n)) & MASK;
    v = (v * 0x2c1b3c6dn) & MASK;
    v = (v ^ (v >> 12n)) & MASK;
    v = (v * 0x297a2d39n) & MASK;
    v = (v ^ (v >> 15n)) & MASK;
    return Number(v) / 4294967296.0;
  };
}

/**
 * Standard normal sample via Box-Muller. Consumes exactly two uniforms from
 * `rng`; `1 - rng()` maps [0, 1) onto (0, 1] so log(0) can never occur.
 */
export function gaussian(rng: () => number): number {
  const u1 = 1.0 - rng();
  const u2 = rng();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// Defaults mirror `simulate6DofFlight`'s `finiteOpt` fallbacks so that
// perturbs of unset options perturb the values the simulation would default.
const DEFAULT_WIND_AZIMUTH_DEG = 90.0;
const DEFAULT_RAIL_ELEVATION_DEG = 85.0;

/** Nearest-rank index for percentile `pct` over `n` sorted samples. */
function percentileIndex(n: number, pct: number): number {
  const idx = Math.ceil((pct / 100.0) * n) - 1;
  return Math.min(Math.max(idx, 0), n - 1);
}

/**
 * Reduces a landing cloud (East/North, meters) into dispersion statistics.
 * Empty cloud => all-undefined statistics with zero runs; single sample =>
 * zero spread with the mean at the sample.
 */
export function computeDispersionStatistics(landings: readonly LandingPoint[]): DispersionStatistics {
  const n = landings.length;
  const undefinedStats: DispersionStatistics = {
    mean: { x: NaN, y: NaN },
    covariance: { xx: NaN, xy: NaN, yy: NaN },
    sigma1: NaN,
    sigma2: NaN,
    thetaDeg: NaN,
    containmentRadii: { r50: NaN, r90: NaN, r99: NaN },
  };
  if (n === 0) return undefinedStats;

  let sx = 0;
  let sy = 0;
  for (const p of landings) {
    sx += p.x;
    sy += p.y;
  }
  const mean: LandingPoint = { x: sx / n, y: sy / n };

  if (n === 1) {
    return {
      mean,
      covariance: { xx: 0, xy: 0, yy: 0 },
      sigma1: 0,
      sigma2: 0,
      thetaDeg: 0,
      containmentRadii: { r50: 0, r90: 0, r99: 0 },
    };
  }

  // Sample covariance (N-1 denominator): [[xx, xy], [xy, yy]] in East/North.
  let accX2 = 0;
  let accXY = 0;
  let accY2 = 0;
  for (const p of landings) {
    const dx = p.x - mean.x;
    const dy = p.y - mean.y;
    accX2 += dx * dx;
    accXY += dx * dy;
    accY2 += dy * dy;
  }
  const inv = 1.0 / (n - 1);
  const xx = accX2 * inv;
  const xy = accXY * inv;
  const yy = accY2 * inv;

  // Eigenvalues of the 2x2 symmetric matrix [[xx, xy], [xy, yy]]:
  // λ = tr/2 ± sqrt(((xx-yy)/2)^2 + xy^2). sqrt(!) of each gives the 1σ axes.
  const mid = (xx - yy) / 2.0;
  const hyp = Math.sqrt(mid * mid + xy * xy);
  const lambda1 = (xx + yy) / 2.0 + hyp;
  const lambda2 = (xx + yy) / 2.0 - hyp;
  const sigma1 = Math.sqrt(Math.max(0.0, lambda1));
  const sigma2 = Math.sqrt(Math.max(0.0, lambda2));
  // 0.5·atan2(2·xy, xx−yy) is the angle of the λ1 eigenvector (sigma1 axis).
  const thetaDeg = (0.5 * Math.atan2(2.0 * xy, xx - yy)) * (180.0 / Math.PI);

  const distances = landings.map((p) => Math.hypot(p.x - mean.x, p.y - mean.y)).sort((u, v) => u - v);
  const containmentRadii: ContainmentRadii = {
    r50: distances[percentileIndex(n, 50)],
    r90: distances[percentileIndex(n, 90)],
    r99: distances[percentileIndex(n, 99)],
  };

  return {
    mean,
    covariance: { xx, xy, yy },
    sigma1,
    sigma2,
    thetaDeg,
    containmentRadii,
  };
}

function validateSigmas(perturbations: PerturbationSigmas): Required<PerturbationSigmas> {
  const resolved = {
    windAzimuthDegSigma: perturbations.windAzimuthDegSigma ?? 0,
    railAngleDegSigma: perturbations.railAngleDegSigma ?? 0,
    impulsePctSigma: perturbations.impulsePctSigma ?? 0,
  };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`runMonteCarlo: ${name} must be a finite nonnegative number (got ${value})`);
    }
  }
  return resolved;
}

/**
 * Deep-clones `baseInput` and applies one Gaussian perturbation per active
 * sigma, consuming exactly two uniforms per active perturbation in the fixed
 * order wind-azimuth → rail-elevation → impulse. The caller's input is never
 * modified. Out-of-domain values (rail elevation outside [70°, 90°],
 * nonpositive impulse scale, …) are left for the simulator to reject.
 */
function applyPerturbations(
  baseInput: MonteCarloSimInput,
  sigmas: Required<PerturbationSigmas>,
  rng: () => number
): MonteCarloSimInput {
  const input: MonteCarloSimInput = structuredClone(baseInput);
  const options = input.options;

  if (sigmas.windAzimuthDegSigma > 0) {
    const z = gaussian(rng);
    const baseWindAzimuth = options.windAzimuthDeg ?? DEFAULT_WIND_AZIMUTH_DEG;
    options.windAzimuthDeg = baseWindAzimuth + z * sigmas.windAzimuthDegSigma;
  }
  if (sigmas.railAngleDegSigma > 0) {
    const z = gaussian(rng);
    const baseRailElevation = options.railElevationDeg ?? DEFAULT_RAIL_ELEVATION_DEG;
    options.railElevationDeg = baseRailElevation + z * sigmas.railAngleDegSigma;
  }
  if (sigmas.impulsePctSigma > 0) {
    const z = gaussian(rng);
    const scale = 1.0 + (sigmas.impulsePctSigma / 100.0) * z;
    const motor = input.motor;
    motor.totalImpulse *= scale;
    motor.avgThrust *= scale;
    motor.maxThrust *= scale;
    for (const point of motor.thrustCurve) {
      point.thrust *= scale;
    }
  }

  return input;
}

/**
 * Per-run sub-seed derivation (Q12): subSeedOf(masterSeed, runIndex) =
 * masterSeed + runIndex · STRIDE. A pure function of (master seed, absolute
 * run index), so every run's RNG stream is a function of its absolute
 * position in the ensemble — never of chunk boundaries. Any chunk partition
 * of the same (inputs, nRuns, seed) reproduces the identical landing
 * ensemble, run for run; the golden-ratio stride decorrelates adjacent
 * runs' mulberry32 phases.
 */
export function subSeedOf(masterSeed: number, runIndex: number): number {
  return masterSeed + runIndex * 0x9e3779b9;
}

/** Result of one chunk of a Monte Carlo ensemble (Q12). */
export interface MonteCarloChunkResult {
  /** Absolute start run index (inclusive) within the master ensemble. */
  runStart: number;
  /** Absolute end run index (exclusive) within the master ensemble. */
  runEnd: number;
  /** Successful landings of this chunk, in run order. */
  landings: LandingPoint[];
  /** Runs in this chunk that failed (per-run exceptions). */
  failedRuns: number;
  /** First per-run failure message in this chunk; null when none failed. */
  firstFailureMessage: string | null;
}

/** One deterministic per-run dispatch shared by the full and chunked paths. */
function runSingleLanding(
  baseInput: MonteCarloSimInput,
  sigmas: Required<PerturbationSigmas>,
  subSeed: number
): { landing: LandingPoint | null; failureMessage: string | null } {
  try {
    const runInput = applyPerturbations(baseInput, sigmas, mulberry32(subSeed));
    const result: SixDofSimulationResult = simulate6DofFlight(runInput.vehicle, runInput.motor, runInput.options);
    return { landing: { x: result.landingPosition.x, y: result.landingPosition.y }, failureMessage: null };
  } catch (err) {
    return { landing: null, failureMessage: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Runs one chunk `chunkIndex` of size `chunkSize` of an `nRuns`-run ensemble.
 * Chunks never throw: per-run failures are counted in the result so a single
 * bad chunk cannot kill a worker stream — failure bookkeeping is merged by
 * the accumulator. A chunk whose start falls at/after `nRuns` is empty.
 */
export function runMonteCarloChunk(
  baseInput: MonteCarloSimInput,
  perturbations: PerturbationSigmas,
  nRuns: number,
  seed: number,
  chunkIndex: number,
  chunkSize: number
): MonteCarloChunkResult {
  if (!Number.isInteger(nRuns) || nRuns < 1) {
    throw new Error(`runMonteCarloChunk: nRuns must be a positive integer (got ${nRuns})`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`runMonteCarloChunk: seed must be an integer (got ${seed})`);
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error(`runMonteCarloChunk: chunkIndex must be a nonnegative integer (got ${chunkIndex})`);
  }
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error(`runMonteCarloChunk: chunkSize must be a positive integer (got ${chunkSize})`);
  }
  const sigmas = validateSigmas(perturbations);

  const runStart = chunkIndex * chunkSize;
  const runEnd = Math.min(runStart + chunkSize, nRuns);
  if (runStart >= nRuns) {
    return { runStart, runEnd: runStart, landings: [], failedRuns: 0, firstFailureMessage: null };
  }

  const landings: LandingPoint[] = [];
  let failedRuns = 0;
  let firstFailureMessage: string | null = null;
  for (let i = runStart; i < runEnd; i++) {
    const outcome = runSingleLanding(baseInput, sigmas, subSeedOf(seed, i));
    if (outcome.landing !== null) {
      landings.push(outcome.landing);
    } else {
      failedRuns++;
      if (firstFailureMessage === null) {
        firstFailureMessage = outcome.failureMessage;
      }
    }
  }
  return { runStart, runEnd, landings, failedRuns, firstFailureMessage };
}

/**
 * Merges chunks into one run-ordered landing stream plus failure
 * bookkeeping. Order-insensitive: chunks are sorted by absolute run index,
 * so out-of-order arrival from a worker changes nothing. Statistical
 * reduction is NOT done here — partial clouds must be reduced from the
 * merged landings (see finalizeMonteCarloChunks) so any accumulated subset
 * of chunks equals the stats over exactly those runs.
 */
export function accumulateMonteCarloChunks(chunks: readonly MonteCarloChunkResult[]): {
  landings: LandingPoint[];
  failedRuns: number;
  firstFailureMessage: string | null;
} {
  const ordered = [...chunks].sort((a, b) => a.runStart - b.runStart);
  const landings: LandingPoint[] = [];
  let failedRuns = 0;
  let firstFailureMessage: string | null = null;
  for (const chunk of ordered) {
    landings.push(...chunk.landings);
    failedRuns += chunk.failedRuns;
    if (firstFailureMessage === null && chunk.firstFailureMessage !== null) {
      firstFailureMessage = chunk.firstFailureMessage;
    }
  }
  return { landings, failedRuns, firstFailureMessage };
}

/**
 * Reduces a complete set of chunks into the ensemble's DispersionResult —
 * identical to `runMonteCarlo` over the same (inputs, nRuns, seed). When
 * EVERY run of the ensemble failed, throws the same all-failed error as the
 * full path so a completely dark cloud can never hide a systematic failure.
 */
export function finalizeMonteCarloChunks(
  chunks: readonly MonteCarloChunkResult[],
  nRuns: number
): DispersionResult {
  const acc = accumulateMonteCarloChunks(chunks);
  if (acc.failedRuns === nRuns && acc.firstFailureMessage !== null) {
    // Every run failed: the all-NaN cloud would silently hide a systematic
    // configuration error. Surface the first failure instead.
    throw new Error(`runMonteCarlo: all ${nRuns} runs failed; first failure: ${acc.firstFailureMessage}`);
  }
  const stats = computeDispersionStatistics(acc.landings);
  return {
    ...stats,
    landings: acc.landings,
    successfulRuns: acc.landings.length,
    failedRuns: acc.failedRuns,
  };
}

/**
 * Monte Carlo dispersion over the authoritative 6-DOF trajectory simulator.
 *
 * @param baseInput      unperturbed simulation input (never mutated)
 * @param perturbations  1σ Gaussian spreads; zero/missing sigma leaves the
 *                       corresponding field untouched
 * @param nRuns          positive integer number of simulated runs
 * @param seed           PRNG seed; identical seeds yield identical landings
 */
export function runMonteCarlo(
  baseInput: MonteCarloSimInput,
  perturbations: PerturbationSigmas,
  nRuns: number,
  seed: number
): DispersionResult {
  if (!Number.isInteger(nRuns) || nRuns < 1) {
    throw new Error(`runMonteCarlo: nRuns must be a positive integer (got ${nRuns})`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`runMonteCarlo: seed must be an integer (got ${seed})`);
  }
  // Single-chunk specialization: the whole ensemble IS one chunk, so the
  // chunked and full paths are the same code by construction (Q12).
  return finalizeMonteCarloChunks([runMonteCarloChunk(baseInput, perturbations, nRuns, seed, 0, nRuns)], nRuns);
}