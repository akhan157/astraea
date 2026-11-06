// @vitest-environment jsdom
/**
 * The built-up (beta) aero model publishes totals but no labelled component
 * breakdown. The 3D/2D layouts must keep the full rocket from the
 * model-independent geometry rollup, while CG/CP stay the selected model's own
 * numbers. These tests run the shipped WebAssembly engine behind the real
 * bridge, so they exercise the adapter, the cache and the layout hook together.
 *
 * At the lane pin (52979f1) the first test fails with
 * `expected 1 to be close to 2.97`: the layout fell back to a 1 m body.
 */
import { readFileSync } from 'node:fs';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RocketVehicle, StabilityAnalysis } from '../../core/types';
import type { VehicleMassRollup } from '../../core/mass';
import { PRESET_NASA_STUDENT_LAUNCH } from '../../state/presets';
import { AERO_MODEL_VERSION, type AeroModelSelection } from '../../application/aeroModel';
import { stabilityAnalysis } from '../testFixtures';
import { installTestEngine } from '../testFixtures';
import { useLayout, useLayoutSnapshot } from './Vehicle3D';
import { useStabilityOf } from '../hooks';
import { instantiateEngine, type EngineInstance } from '../../engine/core';

const BETA: AeroModelSelection = {
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION,
  terms: { transonic: 'legacy' },
};

let engine: EngineInstance;
let teardown: (() => void) | null = null;

beforeAll(async () => {
  engine = await instantiateEngine(readFileSync('src/engine/astraea_engine.wasm'));
});

afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
});

function withId(vehicle: RocketVehicle, id: string): RocketVehicle {
  return { ...vehicle, id };
}

/** Provider-shaped result: totals only, no labelled component breakdown. */
function providerShape(overrides: Partial<StabilityAnalysis> = {}): StabilityAnalysis {
  return stabilityAnalysis({
    contributions: [],
    breakdownUnavailable: true,
    totalLength: 2.9699999999999998,
    referenceDiameter: 0.152,
    cg: 1.7972237541913614,
    cp: 2.4181789584971094,
    staticMarginCalibers: 4.085231607274658,
    totalCNa: 14.423438746935354,
    ...overrides,
  });
}

function rollupFor(vehicle: RocketVehicle, totalLength = 2.9699999999999998): VehicleMassRollup {
  const parts = vehicle.components.map((c, i) => ({
    id: c.id,
    mass: 1,
    localCG: 0.5,
    globalCG: 0.5 + i * 0.1,
    axialStart: i,
    axialEnd: i + 1,
    length: 1,
  }));
  return { totalMass: parts.length, cg: 1, totalLength, maxDiameter: 0.152, referenceDiameter: 0.152, components: parts };
}

describe('beta model keeps the full rocket', () => {
  it('lays out the vehicle from model-independent geometry and keeps the beta CP', async () => {
    teardown = installTestEngine((async (cmd: string, args?: Record<string, unknown>) => engine.call(cmd, args)) as never).teardown;
    const { result } = renderHook(() => useLayoutSnapshot(PRESET_NASA_STUDENT_LAUNCH, BETA));
    await waitFor(() => expect(result.current).not.toBeNull());
    const snapshot = result.current!;

    expect(snapshot.layout.length).toBeCloseTo(2.97, 9);
    expect(Object.keys(snapshot.layout.parts)).toHaveLength(7);
    expect(snapshot.layout.parts['nsl-bt2']).toEqual({
      start: 1.52,
      end: expect.closeTo(2.97, 9),
      cg: 2.245,
      mass: expect.closeTo(4.380100761919091, 9),
    });
    expect(snapshot.layout.refR).toBeCloseTo(0.076, 12);

    // The markers stay the selected model's own totals, never the legacy ones.
    expect(snapshot.breakdown.cg.value).toBeCloseTo(1.7972237541913614, 9);
    expect(snapshot.breakdown.cp.value).toBeCloseTo(2.4181789584971094, 9);
    expect(snapshot.breakdown.cp.value).not.toBeCloseTo(2.409174961652899, 6);
  });

  it('uses the legacy contributions unchanged and asks for no geometry rollup', async () => {
    const seen: string[] = [];
    teardown = installTestEngine((async (cmd: string, args?: Record<string, unknown>) => {
      seen.push(cmd);
      return engine.call(cmd, args);
    }) as never).teardown;

    const { result } = renderHook(() => useStabilityOf(PRESET_NASA_STUDENT_LAUNCH));
    await waitFor(() => expect(result.current.breakdown).not.toBeNull());
    expect(result.current.breakdown!.parts).toHaveLength(7);
    expect(result.current.breakdown!.cp.value).toBeCloseTo(2.409174961652899, 9);
    expect(result.current.geometry).toBeNull();
    expect(seen).not.toContain('aggregate_mass');
  });

  it('keeps the last good layout when the geometry rollup fails', async () => {
    const vehicle = withId(PRESET_NASA_STUDENT_LAUNCH, 'beta-fail-keep-last');
    const legacy = await engine.call<StabilityAnalysis>('stability', { vehicle: { ...vehicle, components: vehicle.components } });
    teardown = installTestEngine(async (cmd, args?: Record<string, unknown>) => {
      if (cmd === 'aggregate_mass') throw new Error('aggregate_mass: geometry unavailable');
      if (cmd === 'stability') return (args?.aeroModel === undefined ? legacy : providerShape());
      return {};
    }).teardown;

    const { result, rerender } = renderHook(({ model }: { model?: AeroModelSelection }) => useLayout(vehicle, model), {
      initialProps: { model: undefined as AeroModelSelection | undefined },
    });
    await waitFor(() => expect(result.current?.length).toBeCloseTo(2.97, 9));

    rerender({ model: BETA });
    // Wait until the provider stability result and the failing rollup have both landed.
    await waitFor(() => expect(teardown).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current?.length).toBeCloseTo(2.97, 9);
    expect(Object.keys(result.current?.parts ?? {})).toHaveLength(7);
  });

  it('shows the honest empty state when the first rollup fails, never a fake shape', async () => {
    const vehicle = withId(PRESET_NASA_STUDENT_LAUNCH, 'beta-fail-empty');
    let massCalls = 0;
    teardown = installTestEngine(async (cmd) => {
      if (cmd === 'aggregate_mass') {
        massCalls += 1;
        throw new Error('aggregate_mass: geometry unavailable');
      }
      if (cmd === 'stability') return providerShape();
      return {};
    }).teardown;

    const { result } = renderHook(() => useLayout(vehicle, BETA));
    await waitFor(() => expect(massCalls).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current).toBeNull();
  });

  it('requests one geometry rollup per landed provider result, not one per slider step', async () => {
    const vehicles = Array.from({ length: 8 }, (_, i) => withId(PRESET_NASA_STUDENT_LAUNCH, `beta-drag-${i}`));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const calls: string[] = [];
    let stabilityCalls = 0;
    let massCalls = 0;
    teardown = installTestEngine(async (cmd, args?: Record<string, unknown>) => {
      calls.push(cmd);
      if (cmd === 'stability') {
        stabilityCalls += 1;
        if (stabilityCalls === 1) await gate;
        return providerShape();
      }
      if (cmd === 'aggregate_mass') {
        massCalls += 1;
        return rollupFor((args?.vehicle as RocketVehicle | undefined) ?? vehicles[vehicles.length - 1]);
      }
      return {};
    }).teardown;

    const { rerender } = renderHook(({ vehicle }) => useLayout(vehicle, BETA), { initialProps: { vehicle: vehicles[0] } });
    // The first solve is held open; the drag updates the vehicle repeatedly.
    for (const vehicle of vehicles.slice(1)) {
      rerender({ vehicle });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    release();
    await waitFor(() => expect(massCalls).toBeGreaterThanOrEqual(1));
    // Let the trailing dispatch (120 ms coalescing window) settle.
    await new Promise((resolve) => setTimeout(resolve, 400));
    // Leading + trailing at most: the intermediate steps were dropped by the
    // pump, and each landed provider result asks for at most one rollup.
    expect(stabilityCalls).toBeLessThanOrEqual(2);
    expect(massCalls).toBeLessThanOrEqual(stabilityCalls);
    expect(massCalls).toBeLessThan(vehicles.length);
    expect(calls.filter((c) => c === 'aggregate_mass')).toHaveLength(massCalls);
  });
});
