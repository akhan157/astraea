/**
 * Ensemble determinism on the shipped WebAssembly engine bytes: the same seed
 * gives bit-identical landings however the run range is partitioned into
 * chunks and in whatever order chunks complete; a cancelled ensemble returns
 * no cloud. Software determinism only — not a statistical or accuracy claim.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRESET_ESTES_ALPHA } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { runEnsembleChunk } from '../tauri/bridge';
import { MC_CHUNK_RUNS, runMonteCarlo } from '../console/data/adapter';
import type { LandingPoint } from '../sim/monteCarlo';
import { instantiateEngine, type EngineInstance } from './core';
import { setTestEngine, type EngineInvoke } from './index';

let engine: EngineInstance;
/** Optional per-call hook so a test can reorder chunk completion. */
let gate: ((args: Record<string, unknown> | undefined) => Promise<void>) | null = null;

beforeAll(async () => {
  engine = await instantiateEngine(readFileSync(fileURLToPath(new URL('./astraea_engine.wasm', import.meta.url))));
  setTestEngine((async (cmd: string, args?: Record<string, unknown>) => {
    const result = engine.call(cmd, args);
    if (gate) await gate(args);
    return result;
  }) as EngineInvoke);
});
afterAll(() => setTestEngine(null));

const OPTIONS = { railLength: 3, railElevationDeg: 85, railAzimuthDeg: 0, windSpeedSurface: 3, windAzimuthDeg: 0, finCantAngleDeg: 0, mainDeployAltitudeAGL: 300 };
const SIGMAS = { windAzimuthDegSigma: 20, railAngleDegSigma: 1, impulsePctSigma: 3 };
const INPUT = { vehicle: PRESET_ESTES_ALPHA, motor: CERTIFIED_MOTORS.estes_c6, options: OPTIONS };
const SEED = 4242;

/** Bit-level equality, including the sign of zero. */
function bits(points: LandingPoint[]): string[] {
  const view = new DataView(new ArrayBuffer(8));
  const hex = (v: number) => { view.setFloat64(0, v); return view.getBigUint64(0).toString(16); };
  return points.map((p) => `${hex(p.x)}:${hex(p.y)}`);
}

async function partitioned(n: number, seed: number, ranges: Array<[number, number]>) {
  const parts = await Promise.all(ranges.map(([a, b]) => runEnsembleChunk(INPUT, SIGMAS, n, seed, a, b)));
  return { landings: parts.flatMap((p) => p.landings), failed: parts.reduce((s, p) => s + p.failedRuns, 0) };
}

// Whole ensembles on real WASM bytes: ~25 s under full-suite load exceeded the 20 s default.
describe('WebAssembly ensemble determinism', { timeout: 120_000 }, () => {
  it('is bit-identical under every range partition and on repeat', async () => {
    const whole = await partitioned(12, SEED, [[0, 12]]);
    expect(whole.landings).toHaveLength(12 - whole.failed);
    for (const ranges of [[[0, 5], [5, 12]], [[0, 1], [1, 2], [2, 7], [7, 12]], [[0, 12], [12, 12]]] as Array<Array<[number, number]>>) {
      const split = await partitioned(12, SEED, ranges);
      expect(bits(split.landings)).toEqual(bits(whole.landings));
      expect(split.failed).toBe(whole.failed);
    }
    expect(bits((await partitioned(12, SEED, [[0, 12]])).landings)).toEqual(bits(whole.landings));
  });

  it('depends on the seed and the absolute run index, not on the ensemble size', async () => {
    const a = await partitioned(12, SEED, [[0, 12]]);
    const b = await partitioned(12, SEED + 1, [[0, 12]]);
    expect(bits(b.landings)).not.toEqual(bits(a.landings));
    const larger = await partitioned(30, SEED, [[0, 12]]);
    expect(bits(larger.landings)).toEqual(bits(a.landings));
  });

  it('the app ensemble host gives the same cloud whether chunks finish in order or reversed', async () => {
    const n = MC_CHUNK_RUNS * 2 + 7;
    const inOrder = await runMonteCarlo({ ...INPUT, nRuns: n, seed: SEED, sigmas: SIGMAS }, new AbortController().signal);
    expect(inOrder.normalLawId).toBe('published-supersonic-normal-v1');
    expect(inOrder.boattailPolicy).toBe('suppressed');
    // Production adapter result survives the same JSON boundary used by archives.
    expect(JSON.parse(JSON.stringify(inOrder))).toMatchObject({
      normalLawId: 'published-supersonic-normal-v1', boattailPolicy: 'suppressed',
    });
    const order: number[] = [];
    // Hold each chunk until all later ones have finished, so completion is reversed.
    const releases = new Map<number, () => void>();
    gate = async (args) => {
      const req = args?.req;
      if (typeof req !== 'object' || req === null || !('runStart' in req) || typeof req.runStart !== 'number') throw new Error('chunk request without runStart');
      const start = req.runStart;
      // tsconfig lib predates Promise.withResolvers.
      const promise = new Promise<void>((resolve) => releases.set(start, resolve));
      if (releases.size === 3) for (const s of [...releases.keys()].sort((x, y) => y - x)) { order.push(s); releases.get(s)!(); await Promise.resolve(); }
      await promise;
    };
    try {
      const reversed = await runMonteCarlo({ ...INPUT, nRuns: n, seed: SEED, sigmas: SIGMAS }, new AbortController().signal);
      expect(order).toEqual([MC_CHUNK_RUNS * 2, MC_CHUNK_RUNS, 0]);
      expect(bits(reversed.landings)).toEqual(bits(inOrder.landings));
      expect([reversed.ok, reversed.failed, reversed.r90]).toEqual([inOrder.ok, inOrder.failed, inOrder.r90]);
    } finally {
      gate = null;
    }
  });

  it('a cancelled ensemble returns no cloud', async () => {
    const abort = new AbortController();
    let progressed = 0;
    let cancelledAt = -1;
    gate = async () => { if (++progressed === 1) abort.abort(); };
    try {
      await expect(runMonteCarlo({ ...INPUT, nRuns: MC_CHUNK_RUNS * 3, seed: SEED, sigmas: SIGMAS }, abort.signal,
        { onCancelled: (done) => { cancelledAt = done; } })).rejects.toThrow(/no result recorded/);
      expect(cancelledAt).toBe(0);
    } finally {
      gate = null;
    }
  });

  it('cancelling after a chunk was recorded still returns no cloud', async () => {
    const abort = new AbortController();
    let cancelledAt = -1;
    let partial = 0;
    await expect(runMonteCarlo({ ...INPUT, nRuns: MC_CHUNK_RUNS * 3, seed: SEED, sigmas: SIGMAS }, abort.signal, {
      onProgress: (done, landings) => { partial = landings.length; if (done > 0) abort.abort(); },
      onCancelled: (done) => { cancelledAt = done; },
    })).rejects.toThrow(/no result recorded/);
    expect(partial).toBeGreaterThan(0);
    expect(cancelledAt).toBe(MC_CHUNK_RUNS);
  });
});
