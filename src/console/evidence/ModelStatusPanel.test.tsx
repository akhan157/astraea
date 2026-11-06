// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { ModelStatusPanel, engineAttribution } from './ModelStatusPanel';
import { useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { designOf, useConsoleJobs } from '../store';
import type { EngineIdentity } from '../../engine/identity';
import { LEGACY_FLIGHT_MODEL } from '../../application/flightModel';
import type { DragCalibration } from '../../application/dragCalibration';
import { stubEngine, resetConsoleState, consoleJobStub } from '../testFixtures';

let teardown: () => void;
beforeEach(() => {
  teardown = stubEngine().teardown;
  resetConsoleState();
  consoleJobStub();
  useProjectStore.getState().loadPreset('estesAlpha');
});
afterEach(() => { cleanup(); teardown(); });

const panel = () => screen.getByRole('region', { name: 'Model and evidence status' });

const fit = (binding?: Record<string, string>, inputKey?: string, engineIdentity?: EngineIdentity): DragCalibration => ({
  scale: 0.9,
  ...(binding === undefined ? {} : { fitProvenance: { flightModelBinding: binding, uncalibratedRunKey: inputKey, ...(engineIdentity === undefined ? {} : { engineIdentity }) } }),
} as unknown as DragCalibration);

describe('model & evidence status panel', () => {
  it('states the resolved model contract without presenting it as a qualification', () => {
    render(<ModelStatusPanel />);
    const region = panel();
    expect(region.querySelector('[data-model-id]')!.textContent).toBe(LEGACY_FLIGHT_MODEL.modelId);
    expect(region.textContent).toContain(LEGACY_FLIGHT_MODEL.environmentId);
    expect(region.textContent).toContain(LEGACY_FLIGHT_MODEL.mechanicalModelId);
    expect(region.textContent).toContain(LEGACY_FLIGHT_MODEL.calibrationPolicyId);
    expect(region.textContent).toContain('not an executable');
    expect(region.textContent).not.toContain('Explicitly selected');
    expect(region.textContent).toContain('Resolved against the supported legacy model contract.');
    expect(region.textContent).not.toMatch(/qualified model|validated model|\bPASS\b/);
  });

  it('states every engine-attribution outcome exactly, including the unreachable-in-stub same branch', () => {
    // The test engine reports kind 'test-engine' with a null checksum, so a
    // 'same' comparison cannot be seeded through the stub; the pure mapping is
    // the authoritative wording and all four states are pinned here.
    expect(engineAttribution('same', true)).toBe('The result was produced by the current engine bytes.');
    expect(engineAttribution('different', true)).toBe('The result used a different engine identity; differences cannot be attributed to the design alone.');
    expect(engineAttribution('unknown', true)).toBe('Engine identity comparison unknown; differences cannot be attributed to the design alone.');
    expect(engineAttribution('same', false)).toBe('Engine comparison needs a completed run.');
  });

  it('renders honest attribution for recorded runs and warns unless same', async () => {
    const view = render(<ModelStatusPanel />);
    const region = panel();
    expect(region.textContent).toContain('no completed run recorded');
    expect(region.textContent).toContain('Engine comparison needs a completed run.');
    expect(region.querySelector('[data-engine-attribution]')!.getAttribute('data-engine-tone')).toBe('muted');

    await act(async () => { await useConsoleJobs.getState().run(); });
    const seed = (engineIdentity: EngineIdentity | undefined) => {
      const completed = useAnalysisStore.getState().completed;
      const record = completed.flight!;
      const payload = structuredClone(record.payload) as { run: { engineIdentity?: EngineIdentity } };
      if (engineIdentity === undefined) delete payload.run.engineIdentity;
      else payload.run.engineIdentity = engineIdentity;
      useAnalysisStore.setState({ completed: { ...completed, flight: { ...record, payload } } });
    };
    seed({ kind: 'production-rust-wasm', sha256: 'a'.repeat(64) });
    view.rerender(<ModelStatusPanel />);
    expect(panel().querySelector('[data-engine-attribution]')!.textContent)
      .toBe(engineAttribution('different', true));
    expect(panel().querySelector('[data-engine-attribution]')!.getAttribute('data-engine-tone')).toBe('warn');

    seed({ kind: 'test-engine', sha256: null });
    view.rerender(<ModelStatusPanel />);
    expect(panel().querySelector('[data-engine-attribution]')!.textContent)
      .toBe(engineAttribution('unknown', true));
    expect(panel().querySelector('[data-engine-attribution]')!.getAttribute('data-engine-tone')).toBe('warn');

    seed(undefined);
    view.rerender(<ModelStatusPanel />);
    expect(panel().querySelector('[data-engine-attribution]')!.textContent)
      .toBe(engineAttribution('unknown', true));
    expect(panel().querySelector('[data-engine-attribution]')!.getAttribute('data-engine-tone')).toBe('warn');
  });

  it('distinguishes no artifact, active legacy fit, bound fit and inactive foreign fit', async () => {
    const { rerender } = render(<ModelStatusPanel />);
    expect(panel().textContent).toContain('No calibration artifact on this project');

    const set = (calibration: DragCalibration | undefined) =>
      useProjectStore.setState({ project: { ...useProjectStore.getState().project, dragCalibration: calibration } });

    set(fit());
    rerender(<ModelStatusPanel />);
    expect(panel().querySelector('[data-calibration-binding]')!.getAttribute('data-calibration-binding')).toBe('legacy-unverified');
    expect(panel().textContent).toContain('not a validation of the model');

    const state = useProjectStore.getState();
    const currentKey = designOf(state.project, state.mission).calibrationFitInputKey!;
    set(fit({ ...LEGACY_FLIGHT_MODEL }, currentKey));
    rerender(<ModelStatusPanel />);
    expect(panel().querySelector('[data-calibration-binding]')!.getAttribute('data-calibration-binding')).toBe('bound');

    set(fit({ ...LEGACY_FLIGHT_MODEL, modelId: 'candidate-future' }, currentKey));
    rerender(<ModelStatusPanel />);
    expect(panel().querySelector('[data-calibration-binding]')!.getAttribute('data-calibration-binding')).toBe('incompatible');
    expect(panel().textContent).toContain('does not affect runs');

    // A recorded engine identity must match exactly: the test engine has no
    // SHA-256, so this is pending and the scale is not dispatched.
    set(fit({ ...LEGACY_FLIGHT_MODEL }, currentKey, { kind: 'test-engine', sha256: null }));
    rerender(<ModelStatusPanel />);
    await waitFor(() => expect(panel().querySelector('[data-calibration-binding]')!.getAttribute('data-calibration-binding')).toBe('bound-engine-unknown'));
    expect(panel().textContent).toContain('cannot be verified');

    set(fit({ ...LEGACY_FLIGHT_MODEL }, currentKey, { kind: 'production-rust-wasm', sha256: 'a'.repeat(64) }));
    rerender(<ModelStatusPanel />);
    await waitFor(() => expect(panel().querySelector('[data-calibration-binding]')!.getAttribute('data-calibration-binding')).toBe('bound-engine-different'));
    expect(panel().textContent).toContain('differs from this engine');
  });
});
