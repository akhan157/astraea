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
import { simulate6DofFlight, SixDofOptions, SixDofSimulationResult, RAIL_ELEVATION_MAX_DEG, RAIL_ELEVATION_MIN_DEG } from './sixDofSimulator';

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
  /**
   * 1σ motor impulse spread, percent of nominal (uniformly scales the thrust
   * curve; burn shape and burn time are unchanged).
   *
   * Declared scenario assumption, not a measured distribution: no measured
   * batch spread, certification tolerance, correlation with the other sigmas
   * or landing-probability meaning is established for this value. A non-zero
   * sigma varies this scenario's impulse only.
   */
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
  /** Absent on historical results; never inferred while loading archives. */
  normalLawId?: 'legacy-finsonly-degrade-v1' | 'published-supersonic-normal-v1';
  boattailPolicy?: 'suppressed' | 'attached' | 'not-applicable';
  /** Absent on historical results; never inferred while loading archives. */
  finInterferenceId?: 'fin-station-v1' | 'fin-station-v2';

  /**
   * Legacy meaning preserved: every finite endpoint in absolute run-index
   * order, including time-limit/unsupported/non-nominal endpoints. Use
   * `eligibleEndpoints` for the strict footprint cloud.
   */
  landings: LandingPoint[];
  successfulRuns: number;
  failedRuns: number;
  /** Classified ledger; absent on legacy/unclassified results. */
  runs?: MonteCarloRunOutcome[];
  counts?: MonteCarloOutcomeCounts;
  endpoints?: IndexedLanding[];
  eligibleEndpoints?: IndexedLanding[];
  statisticsAvailable?: boolean;
  statistics?: DispersionStatistics | null;
  outcomePolicy?: 'classified-v1';
}

/** Derived outcome label; native validity/envelope/termination semantics are carried unchanged. */
export type MonteCarloOutcomeClass =
  | 'supported-nominal-terminal'
  | 'unsupported-nominal-touchdown'
  | 'non-nominal-impact'
  | 'time-limit-endpoint'
  | 'computational-failure';

/** One requested absolute run's carried ledger entry. */
export interface MonteCarloRunOutcome {
  runIndex: number;
  outcome: MonteCarloOutcomeClass;
  /** Finite endpoint only when the engine actually returned one. */
  endpoint: LandingPoint | null;
  terminated: boolean | null;
  terminationReason: string | null;
  touchdownNominal: boolean | null;
  /** Exact native validity string (`PASS`/`FAIL`/`UNKNOWN`/...), never a new enum. */
  validity: string | null;
  enveloped: boolean | null;
  offNominalExcursion: boolean | null;
  failureMessage: string | null;
}

export interface MonteCarloOutcomeCounts {
  requested: number;
  supportedNominalTerminal: number;
  unsupportedNominalTouchdown: number;
  nonNominalImpact: number;
  timeLimitEndpoint: number;
  computationalFailure: number;
}

export interface IndexedLanding {
  runIndex: number;
  point: LandingPoint;
}

export interface ClassifiedDispersionResult extends DispersionResult {
  requestedRuns: number;
  runs: MonteCarloRunOutcome[];
  counts: MonteCarloOutcomeCounts;
  endpoints: IndexedLanding[];
  eligibleEndpoints: IndexedLanding[];
  statisticsAvailable: boolean;
  statistics: DispersionStatistics | null;
  outcomePolicy: 'classified-v1';
}

/**
 * Sampling version (Q12): `legacy-sequential-v1` is the original single
 * sequential PRNG stream — historical records replay bit-for-bit;
 * `per-run-v2` derives each run's stream from
 * `subSeedOf(masterSeed, runIndex)`, so any chunk partition reproduces the
 * identical ensemble run for run. v2 outputs do NOT match legacy draws;
 * the version is part of a run's identity, never silently migrated.
 */
export type SamplingVersion = 'legacy-sequential-v1' | 'per-run-v2';

/**
 * Per-run sub-seed (Q12): masterSeed + runIndex · STRIDE. A pure function
 * of the absolute run index — never of chunk boundaries — so every run's
 * RNG stream is stable under any partition; the golden-ratio stride
 * decorrelates adjacent runs' mulberry32 phases.
 */
export function subSeedOf(masterSeed: number, runIndex: number): number {
  return masterSeed + runIndex * 0x9e3779b9;
}

/** Result of one chunk of a Monte Carlo ensemble (Q12 worker contract). */
export interface MonteCarloChunkResult {
  /** Absolute start run index (inclusive) within the master ensemble. */
  runStart: number;
  /** Absolute end run index (exclusive) within the master ensemble. */
  runEnd: number;
  /** Legacy meaning: every finite endpoint in absolute index order. */
  landings: LandingPoint[];
  /** Legacy meaning: per-run computational failures in this chunk. */
  failedRuns: number;
  /** First per-run failure message in this chunk; null when none failed. */
  firstFailureMessage: string | null;
  /** Classified ledger, one entry per absolute index; absent on legacy chunks. */
  runs?: MonteCarloRunOutcome[];
  counts?: MonteCarloOutcomeCounts;
  outcomePolicy?: 'classified-v1';
  /** Normal-force law and boattail policy evaluated by every run in the chunk. */
  normalLawId?: 'legacy-finsonly-degrade-v1' | 'published-supersonic-normal-v1';
  boattailPolicy?: 'suppressed' | 'attached' | 'not-applicable';
  /** Fin-interference station rule shared by every run in the chunk. */
  finInterferenceId?: 'fin-station-v1' | 'fin-station-v2';
}
// The TS simulator's prepareVehicle uses this fixed law/policy (loads.ts).
const TS_NORMAL_IDENTITY = {
  normalLawId: 'published-supersonic-normal-v1',
  boattailPolicy: 'suppressed',
  finInterferenceId: 'fin-station-v2',
} as const;

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

/**
 * Folds a sampled rail elevation into the kernel's declared domain by
 * reflecting it about the bound it crossed. In-domain values are returned
 * unchanged (bit-identical to the unclamped sample); a reflection that
 * overshoots the opposite bound folds again, so membership is unconditional.
 * At a nominal on a bound this is the exact Gaussian conditioned on the
 * domain (a half-normal at 90°), so it creates no point mass at the bound.
 */
export function foldRailElevationDeg(value: number): number {
  if (value >= RAIL_ELEVATION_MIN_DEG && value <= RAIL_ELEVATION_MAX_DEG) return value;
  const span = RAIL_ELEVATION_MAX_DEG - RAIL_ELEVATION_MIN_DEG;
  const period = 2 * span;
  let offset = (value - RAIL_ELEVATION_MIN_DEG) % period;
  if (offset < 0) offset += period;
  if (offset > span) offset = period - offset;
  return RAIL_ELEVATION_MIN_DEG + offset;
}

/** Nearest-rank index for percentile `pct` over `n` sorted samples. */
function percentileIndex(n: number, pct: number): number {
  const idx = Math.ceil((pct / 100.0) * n) - 1;
  return Math.min(Math.max(idx, 0), n - 1);
}

/**
 * Reduces a landing cloud (East/North, meters) into dispersion statistics.
 * Empty cloud => all-undefined statistics with zero runs; single sample =>
 * zero spread with the mean at the sample. Any non-finite coordinate throws
 * (NaN/±Infinity would otherwise propagate into every statistic silently).
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

  // Fail-closed: a non-finite coordinate (NaN/±Infinity) would poison every
  // downstream statistic (mean, covariance, eigenvalues, radii) into a silent
  // NaN cloud. Reject the input instead of reducing garbage.
  for (const p of landings) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new Error(
        `computeDispersionStatistics: landing point must be finite (got x=${p.x}, y=${p.y})`
      );
    }
  }

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
 * order wind-azimuth → rail-elevation → impulse. The rail draw is folded into
 * the kernel's declared elevation domain after the draw (no extra uniforms),
 * so every other parameter and the following stream state are unchanged.
 * Any other out-of-domain value (e.g. a nonpositive impulse scale at an
 * extreme sigma) is left for the simulator to reject.
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
    const sampled = baseRailElevation + z * sigmas.railAngleDegSigma;
    // Fold noise excursions into the kernel domain, but never repair an
    // out-of-domain nominal: that is an input error and must stay visible.
    options.railElevationDeg =
      baseRailElevation >= RAIL_ELEVATION_MIN_DEG && baseRailElevation <= RAIL_ELEVATION_MAX_DEG
        ? foldRailElevationDeg(sampled)
        : sampled;
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
 * Monte Carlo dispersion over the authoritative 6-DOF trajectory simulator.
 *
 * @param baseInput      unperturbed simulation input (never mutated)
 * @param perturbations  1σ Gaussian spreads; zero/missing sigma leaves the
 *                       corresponding field untouched. Each non-zero sigma is
 *                       an independent draw (no cross-sigma correlation); the
 *                       impulse sigma is a declared scenario scale with no
 *                       measured motor distribution behind it.
 * @param nRuns          positive integer number of simulated runs
 * @param seed           PRNG seed; identical seeds yield identical landings
 * @param version        sampling version; legacy default replays historical
 *                       records bit-for-bit, per-run-v2 enables chunked/worker
 *                       execution with identical results under any partition
 */
export function runMonteCarlo(
  baseInput: MonteCarloSimInput,
  perturbations: PerturbationSigmas,
  nRuns: number,
  seed: number,
  version: SamplingVersion = 'legacy-sequential-v1'
): DispersionResult {
  if (!Number.isInteger(nRuns) || nRuns < 1) {
    throw new Error(`runMonteCarlo: nRuns must be a positive integer (got ${nRuns})`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`runMonteCarlo: seed must be an integer (got ${seed})`);
  }
  if (version !== 'legacy-sequential-v1' && version !== 'per-run-v2') {
    throw new Error(`runMonteCarlo: unknown sampling version '${version}'`);
  }
  if (version === 'per-run-v2') {
    return finalizeMonteCarloChunks([runMonteCarloChunk(baseInput, perturbations, nRuns, seed, 0, nRuns)], nRuns);
  }
  const sigmas = validateSigmas(perturbations);

  const rng = mulberry32(seed);
  const landings: LandingPoint[] = [];
  const runs: MonteCarloRunOutcome[] = [];
  let failedRuns = 0;
  let firstFailureMessage: string | null = null;
  for (let i = 0; i < nRuns; i++) {
    const outcome = runSingleLanding(baseInput, sigmas, rng, `run ${i + 1}/${nRuns}`, i);
    runs.push(outcome.run);
    if (outcome.landing) landings.push(outcome.landing);
    else {
      failedRuns++;
      if (firstFailureMessage === null) firstFailureMessage = outcome.failureMessage;
    }
  }

  if (failedRuns === nRuns && firstFailureMessage !== null) {
    // Every run failed: the all-NaN cloud would silently hide a systematic
    // configuration error. Surface the first failure instead.
    throw new Error(`runMonteCarlo: all ${nRuns} runs failed; first failure: ${firstFailureMessage}`);
  }

  const stats = computeDispersionStatistics(landings);
  return {
    ...stats,
    ...TS_NORMAL_IDENTITY,
    landings,
    successfulRuns: landings.length,
    failedRuns,
    runs,
    counts: countOutcomes(runs, nRuns),
    endpoints: indexedEndpoints(runs),
    eligibleEndpoints: eligibleIndexedEndpoints(runs),
    statisticsAvailable: true,
    statistics: stats,
    outcomePolicy: 'classified-v1',
  };
}

/**
 * One deterministic per-run dispatch shared by the legacy and chunked
 * paths. `rng` is the run's own stream (sequential parent or per-run
 * sub-seed); `runLabel` identifies the run in failure messages.
 */
function classifyObservation(result: SixDofSimulationResult): MonteCarloOutcomeClass {
  // Carry the native termination/envelope/validity semantics; derive only the
  // explicit outcome label. A timeout terminal position is never a landing.
  if (result.terminationReason === 'timeout' || result.terminated !== true) return 'time-limit-endpoint';
  if (result.touchdownNominal !== true) return 'non-nominal-impact';
  if (result.validity === 'PASS' && result.enveloped === true && result.offNominalExcursion !== true) return 'supported-nominal-terminal';
  return 'unsupported-nominal-touchdown';
}

function computationalFailure(runIndex: number, message: string): MonteCarloRunOutcome {
  return {
    runIndex,
    outcome: 'computational-failure',
    endpoint: null,
    terminated: null,
    terminationReason: null,
    touchdownNominal: null,
    validity: null,
    enveloped: null,
    offNominalExcursion: null,
    failureMessage: message,
  };
}

function runSingleLanding(
  baseInput: MonteCarloSimInput,
  sigmas: Required<PerturbationSigmas>,
  rng: () => number,
  runLabel: string,
  runIndex: number
): { landing: LandingPoint | null; failureMessage: string | null; run: MonteCarloRunOutcome } {
  try {
    const runInput = applyPerturbations(baseInput, sigmas, rng);
    const result: SixDofSimulationResult = simulate6DofFlight(runInput.vehicle, runInput.motor, runInput.options);
    const landing: LandingPoint = { x: result.landingPosition.x, y: result.landingPosition.y };
    // Fail-closed: a non-finite touchdown (NaN/±Infinity) is a failed run,
    // not a datum — counting it would poison every dispersion statistic.
    if (!Number.isFinite(landing.x) || !Number.isFinite(landing.y)) {
      const message = `runMonteCarlo: ${runLabel} produced a non-finite landing (x=${landing.x}, y=${landing.y})`;
      return { landing: null, failureMessage: message, run: computationalFailure(runIndex, message) };
    }
    return {
      landing,
      failureMessage: null,
      run: {
        runIndex,
        outcome: classifyObservation(result),
        endpoint: landing,
        terminated: typeof result.terminated === 'boolean' ? result.terminated : null,
        terminationReason: typeof result.terminationReason === 'string' ? result.terminationReason : null,
        touchdownNominal: typeof result.touchdownNominal === 'boolean' ? result.touchdownNominal : null,
        validity: typeof result.validity === 'string' ? result.validity : null,
        enveloped: typeof result.enveloped === 'boolean' ? result.enveloped : null,
        offNominalExcursion: typeof result.offNominalExcursion === 'boolean' ? result.offNominalExcursion : null,
        failureMessage: null,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { landing: null, failureMessage: message, run: computationalFailure(runIndex, message) };
  }
}

/**
 * Runs one absolute run range `[runStart, runEnd)` of an `nRuns`-run
 * `per-run-v2` ensemble. Each run draws from
 * `mulberry32(subSeedOf(seed, absoluteIndex))`, so any partition of the
 * same (inputs, nRuns, seed) — equal or ragged — reproduces the identical
 * ensemble run for run. Ranges address absolute indices precisely so
 * schedulers can split unevenly; chunks never throw: per-run failures are
 * counted in the result so a single bad chunk cannot kill a worker stream.
 * An empty range yields an empty result.
 */
export function runMonteCarloChunk(
  baseInput: MonteCarloSimInput,
  perturbations: PerturbationSigmas,
  nRuns: number,
  seed: number,
  runStart: number,
  runEnd: number
): MonteCarloChunkResult {
  if (!Number.isInteger(nRuns) || nRuns < 1) {
    throw new Error(`runMonteCarloChunk: nRuns must be a positive integer (got ${nRuns})`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`runMonteCarloChunk: seed must be an integer (got ${seed})`);
  }
  if (!Number.isInteger(runStart) || runStart < 0 || runStart > nRuns) {
    throw new Error(`runMonteCarloChunk: runStart must be an integer in [0, nRuns] (got ${runStart})`);
  }
  if (!Number.isInteger(runEnd) || runEnd < runStart || runEnd > nRuns) {
    throw new Error(`runMonteCarloChunk: runEnd must be an integer in [runStart, nRuns] (got ${runEnd})`);
  }
  const sigmas = validateSigmas(perturbations);
  const landings: LandingPoint[] = [];
  const runs: MonteCarloRunOutcome[] = [];
  let failedRuns = 0;
  let firstFailureMessage: string | null = null;
  for (let i = runStart; i < runEnd; i++) {
    const outcome = runSingleLanding(baseInput, sigmas, mulberry32(subSeedOf(seed, i)), `run ${i + 1}/${nRuns}`, i);
    runs.push(outcome.run);
    if (outcome.landing) landings.push(outcome.landing);
    else {
      failedRuns++;
      if (firstFailureMessage === null) firstFailureMessage = outcome.failureMessage;
    }
  }
  return {
    ...TS_NORMAL_IDENTITY,
    runStart,
    runEnd,
    landings,
    failedRuns,
    firstFailureMessage,
    runs,
    counts: countOutcomes(runs, runEnd - runStart),
    outcomePolicy: 'classified-v1',
  };
}

/**
 * Merges chunk results into one ordered landing cloud (sorted by runStart
 * so late/out-of-order worker replies cannot scramble run order) with
 * reconciled failure bookkeeping. Pure accumulation — no statistics.
 */
export function accumulateMonteCarloChunks(
  chunks: readonly MonteCarloChunkResult[]
): { landings: LandingPoint[]; failedRuns: number; firstFailureMessage: string | null } {
  const ordered = [...chunks].sort((a, b) => a.runStart - b.runStart);
  const landings: LandingPoint[] = [];
  let failedRuns = 0;
  let firstFailureMessage: string | null = null;
  for (const chunk of ordered) {
    landings.push(...chunk.landings);
    failedRuns += chunk.failedRuns;
    if (firstFailureMessage === null) firstFailureMessage = chunk.firstFailureMessage;
  }
  return { landings, failedRuns, firstFailureMessage };
}

/** Preserve one declared identity, including absence on historical chunks. */
function ensembleNormalIdentity(
  chunks: readonly MonteCarloChunkResult[],
): Pick<DispersionResult, 'normalLawId' | 'boattailPolicy' | 'finInterferenceId'> {
  const first = chunks[0];
  for (const chunk of chunks) {
    if ((chunk.normalLawId === undefined) !== (chunk.boattailPolicy === undefined)) {
      throw new Error('runMonteCarlo: incomplete normal-law identity');
    }
    if (chunk.normalLawId !== first.normalLawId || chunk.boattailPolicy !== first.boattailPolicy) {
      throw new Error('runMonteCarlo: inconsistent normal-law identity across chunks');
    }
    if (chunk.finInterferenceId !== first.finInterferenceId) {
      throw new Error('runMonteCarlo: inconsistent fin-interference identity across chunks');
    }
  }
  return {
    ...(first?.normalLawId === undefined ? {} : {
      normalLawId: first.normalLawId,
      boattailPolicy: first.boattailPolicy,
    }),
    ...(first?.finInterferenceId === undefined ? {} : { finInterferenceId: first.finInterferenceId }),
  };
}

/**
 * Finalizes an ensemble from its chunks: accumulation plus the all-failed
 * fail-closed gate and dispersion reduction. `nRuns` is the master ensemble
 * size the chunks belong to.
 */
export function finalizeMonteCarloChunks(
  chunks: readonly MonteCarloChunkResult[],
  nRuns: number
): DispersionResult {
  const identity = ensembleNormalIdentity(chunks);
  const { landings, failedRuns, firstFailureMessage } = accumulateMonteCarloChunks(chunks);
  if (failedRuns === nRuns && firstFailureMessage !== null) {
    throw new Error(`runMonteCarlo: all ${nRuns} runs failed; first failure: ${firstFailureMessage}`);
  }
  const stats = computeDispersionStatistics(landings);
  return {
    ...stats,
    ...identity,
    landings,
    successfulRuns: landings.length,
    failedRuns,
  };
}

/* ───────────── classified-v1 outcome ledger (strict footprint) ───────────── */

/** Counts every requested outcome class. The five class counts sum to requested. */
export function countOutcomes(
  runs: readonly MonteCarloRunOutcome[],
  requested = runs.length
): MonteCarloOutcomeCounts {
  const counts: MonteCarloOutcomeCounts = {
    requested,
    supportedNominalTerminal: 0,
    unsupportedNominalTouchdown: 0,
    nonNominalImpact: 0,
    timeLimitEndpoint: 0,
    computationalFailure: 0,
  };
  for (const run of runs) {
    switch (run.outcome) {
      case 'supported-nominal-terminal': counts.supportedNominalTerminal += 1; break;
      case 'unsupported-nominal-touchdown': counts.unsupportedNominalTouchdown += 1; break;
      case 'non-nominal-impact': counts.nonNominalImpact += 1; break;
      case 'time-limit-endpoint': counts.timeLimitEndpoint += 1; break;
      case 'computational-failure': counts.computationalFailure += 1; break;
    }
  }
  return counts;
}

/** Every finite endpoint, in absolute run-index order (legacy `landings` meaning). */
export function indexedEndpoints(runs: readonly MonteCarloRunOutcome[]): IndexedLanding[] {
  return runs
    .filter((run): run is MonteCarloRunOutcome & { endpoint: LandingPoint } => run.endpoint !== null)
    .map((run) => ({ runIndex: run.runIndex, point: run.endpoint }));
}

/** Strict footprint denominator: supported nominal terminals only. */
export function eligibleIndexedEndpoints(runs: readonly MonteCarloRunOutcome[]): IndexedLanding[] {
  return indexedEndpoints(runs.filter((run) => run.outcome === 'supported-nominal-terminal'));
}

function unavailableStatistics(): DispersionStatistics {
  return {
    mean: { x: NaN, y: NaN },
    covariance: { xx: NaN, xy: NaN, yy: NaN },
    sigma1: NaN,
    sigma2: NaN,
    thetaDeg: NaN,
    containmentRadii: { r50: NaN, r90: NaN, r99: NaN },
  };
}

export function accumulateClassifiedMonteCarloChunks(
  chunks: readonly MonteCarloChunkResult[],
  nRuns: number
): {
  runs: MonteCarloRunOutcome[];
  landings: LandingPoint[];
  endpoints: IndexedLanding[];
  eligibleEndpoints: IndexedLanding[];
  counts: MonteCarloOutcomeCounts;
  firstFailureMessage: string | null;
} {
  if (!Number.isInteger(nRuns) || nRuns < 1) {
    throw new Error(`runMonteCarlo: nRuns must be a positive integer (got ${nRuns})`);
  }
  const ordered = [...chunks].sort((a, b) => a.runStart - b.runStart);
  const runs: MonteCarloRunOutcome[] = [];
  let expectedStart = 0;
  let firstFailureMessage: string | null = null;
  for (const chunk of ordered) {
    if (!Number.isInteger(chunk.runStart) || !Number.isInteger(chunk.runEnd)
      || chunk.runStart < 0 || chunk.runEnd < chunk.runStart || chunk.runEnd > nRuns) {
      throw new Error(`runMonteCarlo: chunk range [${chunk.runStart}, ${chunk.runEnd}) is outside [0, ${nRuns})`);
    }
    if (chunk.runStart !== expectedStart) {
      throw new Error(
        `runMonteCarlo: chunks must cover each absolute run once; expected run ${expectedStart}, got [${chunk.runStart}, ${chunk.runEnd})`
      );
    }
    if (!chunk.runs) {
      throw new Error('runMonteCarlo: chunk is missing its classified outcome ledger');
    }
    if (chunk.runs.length !== chunk.runEnd - chunk.runStart) {
      throw new Error(
        `runMonteCarlo: chunk [${chunk.runStart}, ${chunk.runEnd}) carries ${chunk.runs.length} classified runs, expected ${chunk.runEnd - chunk.runStart}`
      );
    }
    for (let i = 0; i < chunk.runs.length; i += 1) {
      const expectedIndex = chunk.runStart + i;
      if (chunk.runs[i].runIndex !== expectedIndex) {
        throw new Error(`runMonteCarlo: classified run index ${chunk.runs[i].runIndex} is not the expected ${expectedIndex}`);
      }
      runs.push(chunk.runs[i]);
    }
    expectedStart = chunk.runEnd;
    if (firstFailureMessage === null) {
      firstFailureMessage = chunk.runs.find((run) => run.failureMessage !== null)?.failureMessage ?? null;
    }
  }
  if (expectedStart !== nRuns) {
    throw new Error(`runMonteCarlo: classified ensemble is incomplete; missing absolute runs [${expectedStart}, ${nRuns})`);
  }
  const endpoints = indexedEndpoints(runs);
  return {
    runs,
    landings: endpoints.map((entry) => entry.point),
    endpoints,
    eligibleEndpoints: eligibleIndexedEndpoints(runs),
    counts: countOutcomes(runs, nRuns),
    firstFailureMessage,
  };
}

/**
 * Completes a classified ensemble only when every absolute index is present
 * exactly once. Statistics use only supported nominal terminals; zero such
 * samples yields `statisticsAvailable: false` and null statistics, never a
 * zero-filled cloud. All-failure/all-timeout ledgers return instead of being
 * replaced by an error.
 */
export function finalizeClassifiedMonteCarloChunks(
  chunks: readonly MonteCarloChunkResult[],
  nRuns: number
): ClassifiedDispersionResult {
  const identity = ensembleNormalIdentity(chunks);
  const acc = accumulateClassifiedMonteCarloChunks(chunks, nRuns);
  const statistics = acc.eligibleEndpoints.length === 0
    ? null
    : computeDispersionStatistics(acc.eligibleEndpoints.map((entry) => entry.point));
  return {
    ...(statistics ?? unavailableStatistics()),
    ...identity,
    requestedRuns: nRuns,
    landings: acc.landings,
    successfulRuns: acc.landings.length,
    failedRuns: acc.counts.computationalFailure,
    runs: acc.runs,
    counts: acc.counts,
    endpoints: acc.endpoints,
    eligibleEndpoints: acc.eligibleEndpoints,
    statisticsAvailable: statistics !== null,
    statistics,
    outcomePolicy: 'classified-v1',
  };
}