// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { RocketVehicle } from '../../core/types';
import { PRESET_NASA_STUDENT_LAUNCH } from '../../state/presets';
import { AERO_MODEL_VERSION, type AeroModelSelection } from '../../application/aeroModel';
import { installTestEngine, stabilityAnalysis } from '../testFixtures';
import { useLayout } from './Vehicle3D';

function vehicleWithTube(length: number, id = 'layout-vehicle'): RocketVehicle {
  return {
    ...PRESET_NASA_STUDENT_LAUNCH,
    id,
    components: PRESET_NASA_STUDENT_LAUNCH.components.map((c) =>
      c.id === 'nsl-bt2' && c.type === 'bodytube' ? { ...c, length } : c),
  };
}

function stabilityAt(totalLength: number) {
  return stabilityAnalysis({
    totalLength,
    contributions: [
      { id: 'nsl-bt2', name: 'Booster', type: 'bodytube', mass: 1.2, cg: totalLength / 2, cna: 0, axialStart: 0, axialEnd: totalLength },
    ],
  });
}

let teardown: (() => void) | null = null;

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  teardown?.();
  teardown = null;
});

describe('layout across a stability request', () => {
  it('keeps the last ready layout while the next vehicle is being solved', async () => {
    const first = vehicleWithTube(1.45, 'layout-a');
    const second = vehicleWithTube(0.5, 'layout-b');
    let calls = 0;
    const gate = { release: (): void => undefined, promise: Promise.resolve() };
    gate.promise = new Promise<void>((resolve) => { gate.release = resolve; });
    teardown = installTestEngine(async (cmd: string) => {
      if (cmd !== 'stability') return {};
      calls += 1;
      if (calls > 1) {
        await gate.promise;
        return stabilityAt(2.9);
      }
      return stabilityAt(1.2);
    }).teardown;

    const { result, rerender } = renderHook(({ vehicle }) => useLayout(vehicle), {
      initialProps: { vehicle: first },
    });
    await waitFor(() => expect(result.current?.length).toBeCloseTo(1.2, 6));

    rerender({ vehicle: second });
    // The new key has not been solved yet; the old shape must stay on screen.
    expect(result.current).not.toBeNull();
    expect(result.current?.length).toBeCloseTo(1.2, 6);

    await waitFor(() => expect(calls).toBe(2));
    gate.release();
    await waitFor(() => expect(result.current?.length).toBeCloseTo(2.9, 6));
  });

  it('requests the layout with the selected aero model', async () => {
    const vehicle = vehicleWithTube(1.45, 'layout-model');
    const model: AeroModelSelection = {
      modelId: 'aero-buildup',
      modelVersion: AERO_MODEL_VERSION,
      terms: { transonic: 'legacy' },
    };
    const seen: unknown[] = [];
    teardown = installTestEngine(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'stability') {
        seen.push(args?.aeroModel);
        return stabilityAt(1.2);
      }
      return {};
    }).teardown;

    const { result } = renderHook(() => useLayout(vehicle, model));
    await waitFor(() => expect(result.current?.length).toBeCloseTo(1.2, 6));
    expect(seen[0]).toEqual(model);
  });
});
