import { describe, expect, it, vi } from 'vitest';
import {
  accumulateMonteCarloChunks,
  computeDispersionStatistics,
  finalizeClassifiedMonteCarloChunks,
  finalizeMonteCarloChunks,
  foldRailElevationDeg,
  gaussian,
  mulberry32,
  runMonteCarlo,
  runMonteCarloChunk,
  subSeedOf,
  MonteCarloSimInput,
  type MonteCarloChunkResult,
  type MonteCarloRunOutcome,
} from './monteCarlo';
import { simulate6DofFlight, type SixDofSimulationResult } from './sixDofSimulator';
import type * as SixDofModule from './sixDofSimulator';
import { PRESET_ESTES_ALPHA } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

// Pass-through spy: the non-finite-landing contract needs a synthetic
// touchdown, which no physical motor/vehicle pair in the catalog produces.
vi.mock('./sixDofSimulator', async (importOriginal) => {
  const actual = await importOriginal<typeof SixDofModule>();
  return { ...actual, simulate6DofFlight: vi.fn(actual.simulate6DofFlight) };
});

const mockedSimulate = vi.mocked(simulate6DofFlight);

const syntheticLanding = (x: number, y: number): SixDofSimulationResult =>
  ({ landingPosition: { x, y } }) as unknown as SixDofSimulationResult;

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

  it('rejects non-finite coordinates instead of reducing them into NaN statistics', () => {
    expect(() => computeDispersionStatistics([{ x: Number.NaN, y: 0 }, { x: 1, y: 1 }])).toThrow(
      /landing point must be finite \(got x=NaN, y=0\)/
    );
    expect(() => computeDispersionStatistics([{ x: 0, y: Number.POSITIVE_INFINITY }])).toThrow(
      /landing point must be finite/
    );
    expect(() => computeDispersionStatistics([{ x: 0, y: Number.NEGATIVE_INFINITY }])).toThrow(
      /landing point must be finite/
    );
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

  it('keeps every perturbed rail elevation inside the solver domain at both bounds', () => {
    for (const nominal of [70, 90]) {
      const base = makeBaseInput();
      base.options.railElevationDeg = nominal;
      mockedSimulate.mockClear();
      const result = runMonteCarlo(base, { railAngleDegSigma: 1 }, 200, 7);
      expect(result.failedRuns).toBe(0);
      expect(result.successfulRuns).toBe(200);
      const sampled = mockedSimulate.mock.calls.map(([, , options]) => options?.railElevationDeg as number);
      expect(sampled).toHaveLength(200);
      for (const value of sampled) {
        expect(value).toBeGreaterThanOrEqual(70);
        expect(value).toBeLessThanOrEqual(90);
      }
    }
  }, 300000);

  it('folds the bound distribution to the truncated normal without a point mass', () => {
    const n = 20000;
    const rng = mulberry32(20260909);
    const values: number[] = [];
    for (let i = 0; i < n; i++) values.push(foldRailElevationDeg(90 + gaussian(rng)));
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const meanSq = values.reduce((a, b) => a + b * b, 0) / n;
    const variance = meanSq - mean * mean;
    expect(mean).toBeCloseTo(90 - Math.sqrt(2 / Math.PI), 1); // 89.2021
    expect(variance).toBeCloseTo(1 - 2 / Math.PI, 1); // 0.3634
    expect(values.every((v) => v >= 70 && v <= 90)).toBe(true);
    expect(values.filter((v) => v === 90).length / n).toBeLessThan(0.001);
  });

  it('counts a non-finite landing as a failed run and keeps it out of the cloud', () => {
    const base = makeBaseInput();
    // First run touches down at NaN: it must be counted failed, not pushed.
    mockedSimulate.mockReturnValueOnce(syntheticLanding(Number.NaN, 0));
    const result = runMonteCarlo(base, {}, 3, 11);
    expect(result.failedRuns).toBe(1);
    expect(result.successfulRuns).toBe(2);
    expect(result.landings.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('surfaces the non-finite landing message when every run lands non-finite', () => {
    const base = makeBaseInput();
    mockedSimulate.mockReturnValueOnce(syntheticLanding(Number.POSITIVE_INFINITY, 0));
    mockedSimulate.mockReturnValueOnce(syntheticLanding(0, Number.NaN));
    expect(() => runMonteCarlo(base, {}, 2, 11)).toThrow(/non-finite landing \(x=Infinity, y=0\)/);
  });

  it('default studio config yields zero failed runs on the preset vehicle', () => {
    // Mirrors TrajectoryStudio's MC defaults: rail 85°, nRuns 50, sigmas 5/1/3,
    // fixed studio seed. At 90° a 1σ rail perturbation is domain-rejected for
    // roughly half the draws; at 85° the whole cloud stays inside [70°, 90°].
    const base = makeBaseInput();
    base.options = {
      railLength: 2.4,
      railElevationDeg: 85.0,
      railAzimuthDeg: 90.0,
      windSpeedSurface: 0,
      windAzimuthDeg: 0,
      mainDeployAltitudeAGL: 250,
      finCantAngleDeg: 0.0,
    };
    const result = runMonteCarlo(
      base,
      { windAzimuthDegSigma: 5.0, railAngleDegSigma: 1.0, impulsePctSigma: 3.0 },
      50,
      20260909
    );
    expect(result.successfulRuns).toBe(50);
    expect(result.failedRuns).toBe(0);
  }, 300000);
});

describe('classified-v1 outcome ledger and strict footprint', () => {
  function run(index: number, outcome: MonteCarloRunOutcome['outcome'], endpoint: { x: number; y: number } | null): MonteCarloRunOutcome {
    return {
      runIndex: index,
      outcome,
      endpoint,
      terminated: outcome === 'computational-failure' || outcome === 'time-limit-endpoint' ? false : true,
      terminationReason: outcome === 'time-limit-endpoint' ? 'timeout' : 'touchdown',
      touchdownNominal: outcome === 'non-nominal-impact' ? false : true,
      validity: outcome === 'unsupported-nominal-touchdown' ? 'UNKNOWN' : 'PASS',
      enveloped: outcome !== 'unsupported-nominal-touchdown',
      offNominalExcursion: false,
      failureMessage: outcome === 'computational-failure' ? 'synthetic engine failure' : null,
    };
  }

  function chunk(start: number, end: number, runs: MonteCarloRunOutcome[]): MonteCarloChunkResult {
    const landings = runs.flatMap((r) => (r.endpoint === null ? [] : [r.endpoint]));
    return {
      runStart: start,
      runEnd: end,
      landings,
      failedRuns: runs.filter((r) => r.outcome === 'computational-failure').length,
      firstFailureMessage: runs.find((r) => r.failureMessage !== null)?.failureMessage ?? null,
      runs,
      outcomePolicy: 'classified-v1',
    };
  }

  it('preserves declared identity through both finalizers, including archived absence', () => {
    const identity = {
      normalLawId: 'published-supersonic-normal-v1', boattailPolicy: 'suppressed', finInterferenceId: 'fin-station-v2',
    } as const;
    const a = chunk(0, 1, [run(0, 'supported-nominal-terminal', { x: 1, y: 2 })]);
    const b = chunk(1, 2, [run(1, 'supported-nominal-terminal', { x: 2, y: 3 })]);
    for (const finalize of [finalizeMonteCarloChunks, finalizeClassifiedMonteCarloChunks]) {
      expect(finalize([{ ...b, ...identity }, { ...a, ...identity }], 2)).toMatchObject(identity);
      const archived = finalize([a, b], 2);
      expect(archived).not.toHaveProperty('normalLawId');
      expect(archived).not.toHaveProperty('boattailPolicy');
      expect(archived).not.toHaveProperty('finInterferenceId');
      expect(() => finalize([{ ...a, ...identity }, b], 2)).toThrow(/inconsistent normal-law identity/);
      expect(() => finalize([{ ...a, normalLawId: identity.normalLawId }, b], 2)).toThrow(/incomplete normal-law identity/);
      expect(() => finalize([{ ...a, ...identity }, { ...b, ...identity, boattailPolicy: 'attached' }], 2)).toThrow(/inconsistent normal-law identity/);
      expect(() => finalize([{ ...a, ...identity }, { ...b, ...identity, finInterferenceId: undefined }], 2)).toThrow(/inconsistent fin-interference identity/);
      // P1-era chunks carry the normal-law pair but no fin-station key: still
      // accepted, and the missing key is never invented.
      const p1 = { normalLawId: 'published-supersonic-normal-v1', boattailPolicy: 'suppressed' } as const;
      expect(finalize([{ ...a, ...p1 }, { ...b, ...p1 }], 2)).toMatchObject(p1);
      const legacy = { normalLawId: 'legacy-finsonly-degrade-v1', boattailPolicy: 'not-applicable' } as const;
      expect(finalize([{ ...a, ...legacy }, { ...b, ...legacy }], 2)).toMatchObject(legacy);
    }
    const failed = chunk(0, 1, [run(0, 'computational-failure', null)]);
    expect(finalizeClassifiedMonteCarloChunks([{ ...failed, ...identity }], 1)).toMatchObject(identity);
  });

  it('labels newly simulated TS ensembles and chunks for both sampling versions', () => {
    for (const version of ['legacy-sequential-v1', 'per-run-v2'] as const) {
      expect(runMonteCarlo(makeBaseInput(), {}, 1, 42, version)).toMatchObject({
        normalLawId: 'published-supersonic-normal-v1', boattailPolicy: 'suppressed',
        finInterferenceId: 'fin-station-v2',
      });
    }
    expect(runMonteCarloChunk(makeBaseInput(), {}, 1, 42, 0, 1)).toMatchObject({
      normalLawId: 'published-supersonic-normal-v1', boattailPolicy: 'suppressed',
      finInterferenceId: 'fin-station-v2',
    });
  });

  it('keeps every index, all five counts, and reduces only supported nominal terminals', () => {
    const c = chunk(0, 5, [
      run(0, 'supported-nominal-terminal', { x: 1, y: 0 }),
      run(1, 'unsupported-nominal-touchdown', { x: 2, y: 0 }),
      run(2, 'non-nominal-impact', { x: 3, y: 0 }),
      run(3, 'time-limit-endpoint', { x: 4, y: 0 }),
      run(4, 'computational-failure', null),
    ]);
    const result = finalizeClassifiedMonteCarloChunks([c], 5);
    expect(result.counts).toEqual({
      requested: 5,
      supportedNominalTerminal: 1,
      unsupportedNominalTouchdown: 1,
      nonNominalImpact: 1,
      timeLimitEndpoint: 1,
      computationalFailure: 1,
    });
    expect(result.landings).toHaveLength(4); // legacy finite endpoints, including timeout
    expect(result.eligibleEndpoints).toEqual([{ runIndex: 0, point: { x: 1, y: 0 } }]);
    expect(result.statisticsAvailable).toBe(true);
    expect(result.statistics?.mean).toEqual({ x: 1, y: 0 });
    expect(result.failedRuns).toBe(1);
    expect(result.outcomePolicy).toBe('classified-v1');
  });

  it('does not qualify a PASS/enveloped nominal touchdown with an off-nominal excursion', () => {
    mockedSimulate.mockReturnValueOnce({
      landingPosition: { x: 1, y: 2 },
      terminated: true,
      terminationReason: 'touchdown',
      touchdownNominal: true,
      validity: 'PASS',
      enveloped: true,
      offNominalExcursion: true,
    } as unknown as SixDofSimulationResult);
    const chunk = runMonteCarloChunk(makeBaseInput(), {}, 1, 1, 0, 1);
    expect(chunk.runs?.[0]).toMatchObject({
      outcome: 'unsupported-nominal-touchdown',
      offNominalExcursion: true,
      validity: 'PASS',
      enveloped: true,
    });
  });

  it('returns absent statistics, never zero-filled, when no sample is eligible', () => {
    const c = chunk(0, 2, [
      run(0, 'time-limit-endpoint', { x: 4, y: 0 }),
      run(1, 'unsupported-nominal-touchdown', { x: 5, y: 0 }),
    ]);
    const result = finalizeClassifiedMonteCarloChunks([c], 2);
    expect(result.counts.timeLimitEndpoint).toBe(1);
    expect(result.counts.unsupportedNominalTouchdown).toBe(1);
    expect(result.landings).toHaveLength(2);
    expect(result.eligibleEndpoints).toEqual([]);
    expect(result.statisticsAvailable).toBe(false);
    expect(result.statistics).toBeNull();
    expect(Number.isNaN(result.sigma1)).toBe(true);
  });

  it('rejects missing, duplicate, overlapping and mismatched absolute coverage', () => {
    const a = chunk(0, 2, [run(0, 'supported-nominal-terminal', { x: 1, y: 0 }), run(1, 'supported-nominal-terminal', { x: 2, y: 0 })]);
    const b = chunk(2, 4, [run(2, 'supported-nominal-terminal', { x: 3, y: 0 }), run(3, 'supported-nominal-terminal', { x: 4, y: 0 })]);
    expect(finalizeClassifiedMonteCarloChunks([b, a], 4).landings).toHaveLength(4);
    expect(() => finalizeClassifiedMonteCarloChunks([a], 4)).toThrow(/incomplete/);
    expect(() => finalizeClassifiedMonteCarloChunks([a, a, b], 4)).toThrow(/expected run/);
    const overlap = chunk(1, 3, [run(1, 'supported-nominal-terminal', { x: 2, y: 0 }), run(2, 'supported-nominal-terminal', { x: 3, y: 0 })]);
    expect(() => finalizeClassifiedMonteCarloChunks([a, overlap, b], 4)).toThrow(/expected run/);
    const mismatched = chunk(2, 4, [run(3, 'supported-nominal-terminal', { x: 3, y: 0 }), run(4, 'supported-nominal-terminal', { x: 4, y: 0 })]);
    expect(() => finalizeClassifiedMonteCarloChunks([a, mismatched], 4)).toThrow(/not the expected/);
  });

  it('retains an all-failure ledger instead of replacing it with an error', () => {
    const c = chunk(0, 2, [run(0, 'computational-failure', null), run(1, 'computational-failure', null)]);
    const result = finalizeClassifiedMonteCarloChunks([c], 2);
    expect(result.counts.computationalFailure).toBe(2);
    expect(result.runs).toHaveLength(2);
    expect(result.landings).toEqual([]);
    expect(result.statisticsAvailable).toBe(false);
  });
});

describe('Q12 versioned sampling and chunked execution (E1)', () => {
  const SIGMAS = { windAzimuthDegSigma: 5.0, railAngleDegSigma: 1.0, impulsePctSigma: 3.0 };
  const N = 9;
  const SEED = 20260909;

  function v2Full() {
    return runMonteCarlo(makeBaseInput(), SIGMAS, N, SEED, 'per-run-v2');
  }

  function chunked(ranges: Array<[number, number]>) {
    return ranges.map(([start, end]) => runMonteCarloChunk(makeBaseInput(), SIGMAS, N, SEED, start, end));
  }

  it('derives stable per-run sub-seeds from (master seed, absolute index)', () => {
    expect(subSeedOf(SEED, 3)).toBe(subSeedOf(SEED, 3));
    expect(subSeedOf(SEED, 3)).not.toBe(subSeedOf(SEED, 4));
    expect(subSeedOf(SEED, 3)).not.toBe(subSeedOf(SEED + 1, 3));
  });

  it('reproduces the identical ensemble under any range partition', () => {
    const full = v2Full();
    const partitions: Array<Array<[number, number]>> = [
      [[0, 9]],
      [[0, 4], [4, 9]],
      [[0, 3], [3, 6], [6, 9]],
      [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9]],
      [[0, 5], [5, 6], [6, 9]],
      [[0, 9], [9, 9]],
    ];
    for (const ranges of partitions) {
      const merged = finalizeMonteCarloChunks(chunked(ranges), N);
      expect(merged.landings).toEqual(full.landings);
      expect(merged.failedRuns).toBe(full.failedRuns);
      expect(merged.successfulRuns).toBe(full.successfulRuns);
    }
  }, 300000);

  it('merges out-of-order worker replies into run order', () => {
    const full = v2Full();
    const [a, b] = chunked([[0, 4], [4, 9]]);
    const accumulated = accumulateMonteCarloChunks([b, a]);
    expect(accumulated.landings).toEqual(full.landings);
    const merged = finalizeMonteCarloChunks([b, a], N);
    expect(merged.landings).toEqual(full.landings);
  }, 300000);

  it('keeps the legacy default stream replayable and version-gated', () => {
    const first = runMonteCarlo(makeBaseInput(), SIGMAS, N, SEED);
    const second = runMonteCarlo(makeBaseInput(), SIGMAS, N, SEED);
    expect(second.landings).toEqual(first.landings);
    expect(() =>
      runMonteCarlo(makeBaseInput(), SIGMAS, N, SEED, 'bogus-version' as 'legacy-sequential-v1')
    ).toThrow(/unknown sampling version/);
  }, 300000);

  it('returns empty results for empty ranges and validates range args', () => {
    for (const [start, end] of [[9, 9], [4, 4], [0, 0]] as Array<[number, number]>) {
      const empty = runMonteCarloChunk(makeBaseInput(), SIGMAS, N, SEED, start, end);
      expect(empty.landings).toEqual([]);
      expect(empty.failedRuns).toBe(0);
      expect(empty.runStart).toBe(start);
      expect(empty.runEnd).toBe(end);
    }
    expect(() => runMonteCarloChunk(makeBaseInput(), SIGMAS, N, SEED, -1, 3)).toThrow(/runStart/);
    expect(() => runMonteCarloChunk(makeBaseInput(), SIGMAS, N, SEED, 5, 3)).toThrow(/runEnd/);
    expect(() => runMonteCarloChunk(makeBaseInput(), SIGMAS, N, SEED, 0, N + 1)).toThrow(/runEnd/);
  });

  it('preserves the all-failed fail-closed gate on the chunked path', () => {
    const original = mockedSimulate.getMockImplementation();
    mockedSimulate.mockImplementation(() => {
      throw new Error('synthetic total failure');
    });
    try {
      expect(() =>
        finalizeMonteCarloChunks(
          [runMonteCarloChunk(makeBaseInput(), SIGMAS, 3, SEED, 0, 3)],
          3
        )
      ).toThrow(/all 3 runs failed/);
    } finally {
      mockedSimulate.mockImplementation(original as typeof mockedSimulate);
    }
  });
});