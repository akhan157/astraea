// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useProjectStore } from '../state/project';
import { flightResult, installTestEngine, resetConsoleState, stabilityAnalysis } from './testFixtures';
import { thrustToWeight, useFlightPreview } from './livePreview';
import { LivePreview } from './stages/LivePreview';
import { CancelledError } from '../engine';
import { designOf } from './store';
import type { DragCalibration } from '../application/dragCalibration';
import { LEGACY_FLIGHT_MODEL } from '../application/flightModel';

type Call = { cmd: string; signal?: AbortSignal };

function engine(onFlight?: (signal?: AbortSignal) => Promise<unknown>): { calls: Call[]; teardown: () => void } {
  const calls: Call[] = [];
  const { teardown } = installTestEngine(async (cmd, _args, options) => {
    calls.push({ cmd, signal: options?.signal });
    if (cmd === 'stability') return stabilityAnalysis();
    if (cmd === 'flight_summary') {
      if (onFlight) return onFlight(options?.signal);
      return { ...flightResult(), telemetry: [] };
    }
    return {};
  });
  return { calls, teardown };
}

/** A flight that resolves only when released, and rejects if cancelled first. */
function heldFlight(): { run: (signal?: AbortSignal) => Promise<unknown>; release: () => void } {
  let release = (): void => undefined;
  return {
    release: () => release(),
    run: (signal) =>
      new Promise((resolve, reject) => {
        release = () => resolve({ ...flightResult({ apogeeAltitude: 777 }), telemetry: [] });
        signal?.addEventListener('abort', () => reject(new CancelledError('flight_summary')));
      }),
  };
}

function renameNose(length: number): void {
  const store = useProjectStore.getState();
  const nose = store.project.vehicle.components.find((c) => c.type === 'nosecone')!;
  store.editProject({
    label: 'Nose length',
    key: `nose:${length}`,
    project: {
      ...store.project,
      vehicle: {
        ...store.project.vehicle,
        components: store.project.vehicle.components.map((c) => (c.id === nose.id ? { ...c, length } : c)),
      },
    },
  });
}

let teardown: (() => void) | null = null;

beforeEach(() => resetConsoleState());
afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
});

describe('thrust-to-weight', () => {
  it('divides thrust by the liftoff weight including the loaded motor', () => {
    const tw = thrustToWeight(9, { avgThrust: 500, maxThrust: 800, totalMass: 1 });
    expect(tw?.liftoffMassKg).toBe(10);
    expect(tw?.average).toBeCloseTo(500 / (10 * 9.80665), 12);
    expect(tw?.peak).toBeCloseTo(800 / (10 * 9.80665), 12);
  });

  it('is unknown until the mass rollup exists', () => {
    expect(thrustToWeight(null, { avgThrust: 1, maxThrust: 1, totalMass: 1 })).toBeNull();
    expect(thrustToWeight(5, null)).toBeNull();
  });
});

describe('flight preview', () => {
  it('waits for edits to settle, then flies once', async () => {
    const e = engine();
    teardown = e.teardown;
    const { result } = renderHook(() => useFlightPreview(20));
    expect(result.current.status).toBe('waiting');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.current).toBe(true);
    expect(result.current.result?.apogeeAltitude).toBe(1371);
    expect(e.calls.filter((c) => c.cmd === 'flight_summary')).toHaveLength(1);
  });

  it('cancels a superseded preview and keeps the old result marked stale', async () => {
    const first = heldFlight();
    let flights = 0;
    const e = engine((signal) => {
      flights += 1;
      // Only the second flight is held open, so the third can supersede it.
      return flights === 2 ? first.run(signal) : Promise.resolve({ ...flightResult({ apogeeAltitude: 500 + flights }), telemetry: [] });
    });
    teardown = e.teardown;
    const { result } = renderHook(() => useFlightPreview(10));
    await waitFor(() => expect(result.current.result?.apogeeAltitude).toBe(501));

    act(() => renameNose(0.5));
    await waitFor(() => expect(flights).toBe(2));
    // The old result stays visible but is no longer current.
    expect(result.current.result?.apogeeAltitude).toBe(501);
    expect(result.current.current).toBe(false);

    act(() => renameNose(0.6));
    const superseded = e.calls.filter((c) => c.cmd === 'flight_summary')[1];
    expect(superseded.signal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.current).toBe(true));
    expect(flights).toBe(3);
    expect(result.current.result?.apogeeAltitude).toBe(503);
  });

  it('shows the preview against the committed run, labeled as not committed', async () => {
    const e = engine();
    teardown = e.teardown;
    render(<LivePreview />);
    expect(screen.getByLabelText('Live flight preview').textContent).toMatch(/not committed/);
    await waitFor(() => expect(screen.getByLabelText('Live flight preview').getAttribute('data-preview-status')).toBe('ready'));
    expect(screen.getByText('Apogee')).toBeTruthy();
    expect(screen.getByText('Thrust : weight')).toBeTruthy();
  });

  it('invalidates a ready preview when retained provenance becomes engine-incompatible and refreshes when compatible', async () => {
    const e = engine();
    teardown = e.teardown;
    const store = useProjectStore.getState();
    const fitKey = designOf(store.project, store.mission).calibrationFitInputKey!;
    const base = {
      scale: 0.9, fittedCd: 0.45, modelCd: 0.5, rmseN: 0.1, coastMassKg: 0.05,
      source: { fileName: 'synthetic.csv', sha256Hex: 'f'.repeat(64), rowCount: 10 },
      window: { startS: 1, endS: 2, method: 'velocity-column' as const, pointsUsed: 5, pointsExcluded: 0 },
      appliedAt: '2026-10-28T00:00:00.000Z',
    };
    const legacy = base as DragCalibration;
    const bound = (engineIdentity: { kind: 'test-engine' | 'production-rust-wasm'; sha256: string | null }): DragCalibration => ({
      ...base,
      fitProvenance: { flightModelBinding: { ...LEGACY_FLIGHT_MODEL }, uncalibratedRunKey: fitKey, engineIdentity },
    }) as DragCalibration;
    const setCalibration = (calibration: DragCalibration): void =>
      useProjectStore.setState({ project: { ...useProjectStore.getState().project, dragCalibration: calibration } });
    const flights = (): number => e.calls.filter((c) => c.cmd === 'flight_summary').length;

    setCalibration(legacy);
    const { result } = renderHook(() => useFlightPreview(10));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.current).toBe(true);
    expect(flights()).toBe(1);

    // Same scale and options, but the recorded engine is now unverifiable.
    act(() => setCalibration(bound({ kind: 'test-engine', sha256: null })));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.current).toBe(false);
    expect(result.current.message).toMatch(/cannot be verified/);
    expect(flights()).toBe(1);

    // Same again with a recorded engine that differs from the running one.
    act(() => setCalibration(bound({ kind: 'production-rust-wasm', sha256: 'a'.repeat(64) })));
    await waitFor(() => expect(result.current.message).toMatch(/different engine/));
    expect(result.current.current).toBe(false);
    expect(flights()).toBe(1);

    // A different compatible artifact (identical scale/options, different
    // provenance) refreshes a current preview instead of reusing a refusal.
    const compatible = { ...base, appliedAt: '2026-10-28T01:00:00.000Z' } as DragCalibration;
    act(() => setCalibration(compatible));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.current).toBe(true);
    expect(flights()).toBe(2);
  });

  it('says why there is no preview when the inputs cannot fly', async () => {
    const e = engine();
    teardown = e.teardown;
    const store = useProjectStore.getState();
    store.editProject({ label: 'Bad motor', key: 'motor', project: { ...store.project, workspace: { ...store.project.workspace, motorId: 'no_such_motor' } } });
    const { result } = renderHook(() => useFlightPreview(10));
    await waitFor(() => expect(result.current.status).toBe('invalid'));
    expect(e.calls.some((c) => c.cmd === 'flight_summary')).toBe(false);
  });
});
