// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { RocketVehicle } from '../core/types';
import { useStabilityOf } from './hooks';
import { installTestEngine, stabilityAnalysis } from './testFixtures';

function vehicle(id: string, length: number): RocketVehicle {
  return {
    id,
    name: id,
    version: '1.0',
    author: 'test',
    components: [
      { id: `${id}-tube`, name: 'Tube', type: 'bodytube', length, outerDiameter: 0.1, innerDiameter: 0.09, materialId: 'fiberglass' },
    ],
  };
}

/** The engine receives the DTO (no vehicle id); identify requests by tube length. */
function requestedLength(args?: Record<string, unknown>): number {
  const dto = args?.vehicle;
  if (dto === null || typeof dto !== 'object' || !('components' in dto) || !Array.isArray(dto.components)) return Number.NaN;
  const tube = dto.components[0];
  if (tube === null || typeof tube !== 'object' || !('length' in tube) || typeof tube.length !== 'number') return Number.NaN;
  return tube.length;
}

let teardown: (() => void) | null = null;
let requested: number[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  requested = [];
  teardown = installTestEngine(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd !== 'stability') return {};
    requested.push(requestedLength(args));
    return stabilityAnalysis();
  }).teardown;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  teardown?.();
  teardown = null;
});

describe('stability request coalescing', () => {
  it('dispatches three distinct concurrently subscribed keys', async () => {
    await vi.advanceTimersByTimeAsync(1000);
    const a = vehicle('three-a', 1);
    const b = vehicle('three-b', 2);
    const c = vehicle('three-c', 3);
    renderHook(() => [useStabilityOf(a), useStabilityOf(b), useStabilityOf(c)]);
    await vi.advanceTimersByTimeAsync(1000);
    expect([...requested].sort((x, y) => x - y)).toEqual([1, 2, 3]);
  });

  it('collapses a drag burst to at most two dispatches for the dragged slot', async () => {
    await vi.advanceTimersByTimeAsync(1000);
    const vehicles = Array.from({ length: 20 }, (_, i) => vehicle(`burst-${i}`, 100 + i));
    const { rerender } = renderHook(({ v }) => useStabilityOf(v), { initialProps: { v: vehicles[0] } });
    await vi.advanceTimersByTimeAsync(0);
    act(() => {
      for (let i = 1; i < vehicles.length; i += 1) rerender({ v: vehicles[i] });
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(requested.length).toBeLessThanOrEqual(2);
    expect(requested).toContain(119);
    expect(requested.filter((length) => length > 100 && length < 119)).toEqual([]);
  });

  it('still dispatches a subscribed committed key pending during a drag burst', async () => {
    await vi.advanceTimersByTimeAsync(1000);
    const committed = vehicle('committed-key', 999);
    const drag = Array.from({ length: 20 }, (_, i) => vehicle(`drag-${i}`, 200 + i));
    const { rerender } = renderHook(({ v }) => [useStabilityOf(v), useStabilityOf(committed)], {
      initialProps: { v: drag[0] },
    });
    await vi.advanceTimersByTimeAsync(0);
    act(() => {
      for (let i = 1; i < drag.length; i += 1) rerender({ v: drag[i] });
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(requested).toContain(999);
    expect(requested).toContain(219);
    expect(requested.filter((length) => length > 200 && length < 219)).toEqual([]);
  });
});
