import { describe, expect, it } from 'vitest';
import {
  computeDispersionStatistics,
  gaussian,
  mulberry32,
  runMonteCarlo,
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