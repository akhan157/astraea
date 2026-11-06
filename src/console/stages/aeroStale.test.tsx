// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { BodyTubeComponent } from '../../core/types';
import { useProjectStore } from '../../state/project';
import { installTestEngine, stabilityAnalysis } from '../testFixtures';
import { AeroControls } from './AeroControls';

const CURVES = {
  dragCurves: [0.5, 0.9, 1.2, 2, 3].map((mach) => ({ mach, totalCd: 0.42, cp: 0.357 })),
  breakdownUnavailable: false,
};

let teardown: (() => void) | null = null;

beforeEach(() => {
  useProjectStore.getState().loadPreset('nasaStudent');
  cleanup();
});

afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
});

describe('aero coefficient preview during a live edit', () => {
  it('marks the previous rows as updating instead of presenting them as current', async () => {
    const gate = { release: (): void => undefined, promise: Promise.resolve() };
    gate.promise = new Promise<void>((resolve) => { gate.release = resolve; });
    let held = false;
    teardown = installTestEngine(async (cmd: string) => {
      if (cmd === 'stability') return stabilityAnalysis();
      if (cmd === 'aero_curves') {
        if (held) await gate.promise;
        return CURVES;
      }
      return {};
    }).teardown;

    render(<AeroControls />);
    await screen.findByRole('table', { name: 'Aerodynamic coefficient preview' });

    held = true;
    act(() => {
      useProjectStore.getState().stageComponents('airframe', 'nsl-bt2', { length: 0.9 } as Partial<BodyTubeComponent>);
    });
    await waitFor(() => expect(document.querySelector('[data-aero-preview="updating"]')).toBeTruthy());
    expect(screen.getByText(/Updating coefficients for the current geometry/)).toBeTruthy();

    gate.release();
    await waitFor(() => expect(document.querySelector('[data-aero-preview="current"]')).toBeTruthy());
  });
});
