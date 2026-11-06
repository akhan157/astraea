// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { RocketVehicle } from '../../core/types';
import { installTestEngine, stabilityAnalysis } from '../testFixtures';
import { Viewport } from './Viewport';

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

function stabilityAt(cg: number, cp: number, length: number, partId: string) {
  return stabilityAnalysis({
    cg,
    cp,
    totalLength: length,
    contributions: [
      { id: partId, name: 'Tube', type: 'bodytube', mass: 1, cg, cna: 0, axialStart: 0, axialEnd: length },
    ],
  });
}

let teardown: (() => void) | null = null;

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
});

function shell(): HTMLElement | null {
  return document.querySelector('[data-markers]');
}

describe('CG/CP markers', () => {
  it('stays rendered from the previous breakdown while the next key is loading', async () => {
    const first = vehicle('markers-a', 1.0);
    const second = vehicle('markers-b', 2.0);
    const gate = { release: (): void => undefined, promise: Promise.resolve() };
    gate.promise = new Promise<void>((resolve) => { gate.release = resolve; });
    let calls = 0;
    teardown = installTestEngine(async (cmd: string) => {
      if (cmd !== 'stability') return {};
      calls += 1;
      if (calls > 1) {
        await gate.promise;
        return stabilityAt(0.9, 1.4, 2.0, `${second.id}-tube`);
      }
      return stabilityAt(0.6, 1.1, 1.0, `${first.id}-tube`);
    }).teardown;

    const { rerender } = render(<Viewport vehicle={first} markers />);
    await waitFor(() => expect(shell()?.getAttribute('data-markers')).toBe('present'));
    const beforeCg = shell()?.getAttribute('data-marker-cg');
    const beforeCp = shell()?.getAttribute('data-marker-cp');
    expect(Number(beforeCg)).toBeCloseTo(0.6, 6);
    expect(Number(beforeCp)).toBeCloseTo(1.1, 6);

    rerender(<Viewport vehicle={second} markers />);
    await waitFor(() => expect(shell()?.getAttribute('data-layout-state')).toBe('stale'));
    expect(shell()?.getAttribute('data-markers')).toBe('present');
    expect(shell()?.getAttribute('data-marker-cg')).toBe(beforeCg);
    expect(shell()?.getAttribute('data-marker-cp')).toBe(beforeCp);

    gate.release();
    await waitFor(() => expect(shell()?.getAttribute('data-layout-state')).toBe('ready'));
    expect(Number(shell()?.getAttribute('data-marker-cg'))).toBeCloseTo(0.9, 6);
    expect(Number(shell()?.getAttribute('data-marker-cp'))).toBeCloseTo(1.4, 6);
  });
});
