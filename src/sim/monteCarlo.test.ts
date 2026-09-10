import { describe, expect, it } from 'vitest';
import {
  accumulateMonteCarloChunks,
  computeDispersionStatistics,
  finalizeMonteCarloChunks,
  gaussian,
  mulberry32,
  runMonteCarlo,
  runMonteCarloChunk,
  subSeedOf,
  MonteCarloSimInput,
} from './monteCarlo';
import { simulate6DofFlight } from './sixDofSimulator';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

const BASE_OPTIONS = {
  railLength: 1.2,
  railElevationDeg: 85.0,
  railAzimuthDeg: 90.0,
  windSpeedSurface: 4.0,
  windAzimuthDeg: 270.0,
};

function makeBaseInput(): MonteCarloSimInput {
  return {
    vehicle: PRESET_ESTES_ALPHA,
    motor: CERTIFIED_MOTORS.estes_c6,
    options: { ...BASE_OPTIONS },
  };
}

const snapshot = (input: MonteCarloSimInput): string => JSON.stringify(input);

describe('mulberry32 / Box-Muller RNG', () => {
  it('is deterministic for a fixed seed and emits only [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const drawsA: number[] = [];
    const drawsB: number[] = [];
    for (let i = 0; i < 64; i++) {
      const ua = a();
      const ub = b();
      drawsA.push(ua);
      drawsB.push(ub);
      expect(ua).toBeGreaterThanOrEqual(0);
      expect(ua).toBeLessThan(1);
    }
    expect(drawsA).toEqual(drawsB);
  });

  it('produces standard-normal Gaussian draws via Box-Muller', () => {
    const rng = mulberry32(20260909);
    const n = 20000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const z = gaussian(rng);
      expect(Number.isFinite(z)).toBe(true);
      sum += z;
      sumSq += z * z;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(Math.abs(mean)).toBeLessThan(0.05); // ~0.29σ sampling error envelope
    expect(variance).toBeGreaterThan(0.9);
    expect(variance).toBeLessThan(1.1);
  });
});

describe('computeDispersionStatistics', () => {
  it('reduces an anisotropic cloud to mean, covariance, and eigen axes', () => {
    const stats = computeDispersionStatistics([
      { x: 2, y: 0 },
      { x: -2, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]);
    expect(stats.mean).toEqual({ x: 0, y: 0 });
    expect(stats.covariance.xx).toBeCloseTo(8 / 3, 12);
    expect(stats.covariance.xy).toBeCloseTo(0, 12);
    expect(stats.covariance.yy).toBeCloseTo(2 / 3, 12);
    expect(stats.sigma1).toBeCloseTo(Math.sqrt(8 / 3), 12);
    expect(stats.sigma2).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect(stats.thetaDeg).toBeCloseTo(0, 12); // major axis along +X (East)
  });

  it('orients the major axis along the dominant eigenvector', () => {
    const stats = computeDispersionStatistics([
      { x: 0, y: 3 },
      { x: 0, y: -3 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
    ]);
    expect(stats.sigma1).toBeCloseTo(Math.sqrt(6), 12); // yy=6 dominates
    expect(stats.sigma2).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect(Math.abs(stats.thetaDeg)).toBeCloseTo(90, 12); // major axis along +Y (North)
  });

  it('computes empirical containment radii from the radial CDF', () => {
    const stats = computeDispersionStatistics([
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 40, y: 0 },
    ]);
    expect(stats.mean).toEqual({ x: 25, y: 0 });
    expect(stats.containmentRadii).toEqual({ r50: 5, r90: 15, r99: 15 });
    expect(stats.sigma2).toBeCloseTo(0, 12); // degenerate line cloud
    expect(stats.sigma1).toBeCloseTo(Math.sqrt(500 / 3), 12); // Σdx²=500 over N-1=3
  });

  it('degenerates cleanly for empty and single-sample clouds', () => {
    const empty = computeDispersionStatistics([]);
    expect(Number.isNaN(empty.mean.x)).toBe(true);
    expect(Number.isNaN(empty.sigma1)).toBe(true);
    expect(Number.isNaN(empty.containmentRadii.r50)).toBe(true);

    const single = computeDispersionStatistics([{ x: 7.5, y: -2 }]);
    expect(single.mean).toEqual({ x: 7.5, y: -2 });
    expect(single.covariance).toEqual({ xx: 0, xy: 0, yy: 0 });
    expect(single.sigma1).toBe(0);
    expect(single.sigma2).toBe(0);
    expect(single.containmentRadii).toEqual({ r50: 0, r90: 0, r99: 0 });
  });
});

describe('runMonteCarlo input contract', () => {
  it('rejects invalid nRuns, seed, and sigma arguments', () => {
    const base = makeBaseInput();
    expect(() => runMonteCarlo(base, {}, 0, 1)).toThrow(/nRuns must be a positive integer/);
    expect(() => runMonteCarlo(base, {}, 2.5, 1)).toThrow(/nRuns must be a positive integer/);
    expect(() => runMonteCarlo(base, {}, 1, Number.NaN)).toThrow(/seed must be an integer/);
    expect(() => runMonteCarlo(base, {}, 1, 2.5)).toThrow(/seed must be an integer/);
    expect(() => runMonteCarlo(base, { windAzimuthDegSigma: -1 }, 1, 1)).toThrow(/windAzimuthDegSigma/);
    expect(() => runMonteCarlo(base, { impulsePctSigma: Number.POSITIVE_INFINITY }, 1, 1)).toThrow(/impulsePctSigma/);
  });
});

describe('runMonteCarlo dispersion engine', () => {
  it('zero-sigma single run matches the unperturbed simulator within 1e-9', () => {
    const base = makeBaseInput();
    const direct = simulate6DofFlight(base.vehicle, base.motor, base.options).landingPosition;

    const result = runMonteCarlo(base, {}, 1, 42);
    expect(result.landings).toHaveLength(1);
    expect(Math.abs(result.landings[0].x - direct.x)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(result.landings[0].y - direct.y)).toBeLessThanOrEqual(1e-9);
    expect(result.mean.x).toBe(result.landings[0].x);
    expect(result.mean.y).toBe(result.landings[0].y);
    expect(result.covariance).toEqual({ xx: 0, xy: 0, yy: 0 });
    expect(result.sigma1).toBe(0);
    expect(result.sigma2).toBe(0);
    expect(result.successfulRuns).toBe(1);
    expect(result.failedRuns).toBe(0);
    // Base input survives deep-cloning untouched.
    expect(snapshot(base)).toBe(snapshot(makeBaseInput()));
  });

  it('same seed reproduces identical landing arrays; different seeds diverge', () => {
    const base = makeBaseInput();
    const perturbations = { windAzimuthDegSigma: 12, railAngleDegSigma: 1.2, impulsePctSigma: 4 };
    const before = snapshot(base);

    const runA = runMonteCarlo(base, perturbations, 4, 12345);
    const runB = runMonteCarlo(base, perturbations, 4, 12345);
    const runC = runMonteCarlo(base, perturbations, 4, 54321);

    expect(runA.landings).toEqual(runB.landings);
    expect(runA.successfulRuns).toBe(4);
    expect(runA.failedRuns).toBe(0);
    expect(runC.landings).not.toEqual(runA.landings);
    expect(snapshot(base)).toBe(before); // never mutate the caller's input
  }, 30000);

  it('disperses landings under nonzero perturbations', () => {
    const result = runMonteCarlo(
      makeBaseInput(),
      { windAzimuthDegSigma: 12, railAngleDegSigma: 1.2, impulsePctSigma: 4 },
      6,
      98765
    );
    expect(result.successfulRuns).toBe(6);
    expect(result.failedRuns).toBe(0);
    const distinct = new Set(result.landings.map((p) => `${p.x},${p.y}`));
    expect(distinct.size).toBeGreaterThan(1);
    expect(result.sigma1 + result.sigma2).toBeGreaterThan(0);
  });

  it('throws with the first failure message when every run fails', () => {
    // simulate6DofFlight rejects nonpositive rail length, so all runs share
    // the same systematic failure; the all-NaN cloud would hide it.
    const bad = makeBaseInput();
    bad.options.railLength = 0;
    expect(() => runMonteCarlo(bad, {}, 3, 1)).toThrow(
      /runMonteCarlo: all 3 runs failed; first failure: simulate6DofFlight: railLength must be positive \(got 0\)/
    );
  });

  it('counts only out-of-domain perturbed runs as failed', () => {
    // Rail elevation at the 90° domain boundary: any positive Gaussian draw
    // pushes it out of [70°, 90°] and the run is rejected; negative draws
    // stay in domain, so failures mix with successes.
    const base = makeBaseInput();
    base.options.railElevationDeg = 90.0;
    const result = runMonteCarlo(base, { railAngleDegSigma: 0.5 }, 6, 7);
    expect(result.successfulRuns + result.failedRuns).toBe(6);
    expect(result.failedRuns).toBeGreaterThan(0);
    expect(result.failedRuns).toBeLessThan(6);
  });
});

describe('runMonteCarlo chunk determinism (Q12)', () => {
  it('derives per-run sub-seeds purely from master seed and absolute run index', () => {
    expect(subSeedOf(20260909, 0)).toBe(20260909);
    expect(subSeedOf(20260909, 1)).toBe(20260909 + 0x9e3779b9);
    expect(subSeedOf(20260909, 4)).toBe(subSeedOf(20260909, 4)); // pure: same args ⇒ same sub-seed
    // Distinct absolute indices never collide over a realistic ensemble.
    const seeds = new Set(Array.from({ length: 64 }, (_, i) => subSeedOf(20260909, i)));
    expect(seeds.size).toBe(64);
    // A different master seed shifts every sub-seed off the original stream.
    expect(subSeedOf(7, 3)).not.toBe(subSeedOf(20260909, 3));
  });

  it('chunked accumulation ≡ runMonteCarlo for the same inputs, runs, and seed', () => {
    // Boundary-sigma config mixes successes and failures across runs, so the
    // equivalence is asserted for landings, stats, AND failure bookkeeping.
    const base = makeBaseInput();
    base.options.railElevationDeg = 90.0;
    const perturbations = { windAzimuthDegSigma: 12, railAngleDegSigma: 0.5, impulsePctSigma: 4 };
    const seed = 424242;

    const full = runMonteCarlo(base, perturbations, 6, seed);
    const chunks = [0, 1, 2].map((i) => runMonteCarloChunk(base, perturbations, 6, seed, i, 2));
    const chunked = finalizeMonteCarloChunks(chunks, 6);

    expect(chunked.landings).toEqual(full.landings);
    expect(chunked.successfulRuns).toBe(full.successfulRuns);
    expect(chunked.failedRuns).toBe(full.failedRuns);
    expect(chunked.failedRuns).toBeGreaterThan(0); // boundary config must mix
    expect(chunked.mean).toEqual(full.mean);
    expect(chunked.covariance).toEqual(full.covariance);
    expect(chunked.sigma1).toBe(full.sigma1);
    expect(chunked.sigma2).toBe(full.sigma2);
    expect(chunked.thetaDeg).toBe(full.thetaDeg);
    expect(chunked.containmentRadii).toEqual(full.containmentRadii);
  }, 60000);

  it('finalization is order-insensitive and partial accumulation merges in run order', () => {
    const base = makeBaseInput();
    base.options.railElevationDeg = 90.0;
    const perturbations = { railAngleDegSigma: 0.5 };
    const seed = 99;
    const chunks = [0, 1, 2].map((i) => runMonteCarloChunk(base, perturbations, 6, seed, i, 2));

    // Reverse delivery order changes nothing at the final result.
    const forward = finalizeMonteCarloChunks(chunks, 6);
    expect(finalizeMonteCarloChunks([...chunks].reverse(), 6).landings).toEqual(forward.landings);

    // Partial accumulation merges the received chunks' landings in run order
    // and sums their failure bookkeeping — no stats are folded in early.
    const partial = accumulateMonteCarloChunks(chunks.slice(0, 2));
    const expectedLandings = [...chunks[0].landings, ...chunks[1].landings];
    expect(partial.landings).toEqual(expectedLandings);
    expect(partial.failedRuns).toBe(chunks[0].failedRuns + chunks[1].failedRuns);
    expect(partial.firstFailureMessage).toBe(chunks[0].firstFailureMessage ?? chunks[1].firstFailureMessage);
    // Successes + failures over the received runs exhaust the slice's spans.
    expect(partial.landings.length + partial.failedRuns).toBe(4);
    // Partial stats are the stats over exactly the merged landings.
    const partialStats = computeDispersionStatistics(partial.landings);
    expect(partialStats.sigma1).toBe(
      computeDispersionStatistics([...chunks[0].landings, ...chunks[1].landings]).sigma1,
    );
  }, 60000);

  it('chunks past the ensemble are empty and never throw', () => {
    const base = makeBaseInput();
    const chunk = runMonteCarloChunk(base, {}, 6, 1, 9, 2); // runStart 18 ≥ 6
    expect(chunk.runStart).toBe(18);
    expect(chunk.runEnd).toBe(18);
    expect(chunk.landings).toEqual([]);
    expect(chunk.failedRuns).toBe(0);
    expect(chunk.firstFailureMessage).toBeNull();
  });

  it('validates chunk arguments fail-closed', () => {
    const base = makeBaseInput();
    expect(() => runMonteCarloChunk(base, {}, 0, 1, 0, 1)).toThrow(/nRuns must be a positive integer/);
    expect(() => runMonteCarloChunk(base, {}, 6, 1.5, 0, 1)).toThrow(/seed must be an integer/);
    expect(() => runMonteCarloChunk(base, {}, 6, 1, -1, 1)).toThrow(/chunkIndex must be a nonnegative integer/);
    expect(() => runMonteCarloChunk(base, {}, 6, 1, 0, 0)).toThrow(/chunkSize must be a positive integer/);
  });

  it('throws the identical all-failed error through the chunked path', () => {
    // simulate6DofFlight rejects nonpositive rail length, so every run fails
    // in both paths; the chunked path must surface the same systematic error
    // instead of a silently empty cloud.
    const bad = makeBaseInput();
    bad.options.railLength = 0;
    const chunks = [0, 1].map((i) => runMonteCarloChunk(bad, {}, 3, 1, i, 2));
    expect(() => finalizeMonteCarloChunks(chunks, 3)).toThrow(
      /runMonteCarlo: all 3 runs failed; first failure: simulate6DofFlight: railLength must be positive \(got 0\)/
    );
  });
});