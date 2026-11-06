/**
 * Drag calibration across the Console: applying or removing it stales every
 * result, a rerun hands the scale to the engine and labels what it affects,
 * Monte Carlo and the live preview run with it, and it survives save and open
 * (including opening a 1.3.0 file that has none).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useProjectStore, exportableProject } from '../state/project';
import { useAnalysisStore } from '../state/analysis';
import { importProjectFile } from '../state/projectIo';
import { PROJECT_SCHEMA_VERSION, writeProject } from '../formats/projectJson';
import { consoleActions, committedRun, currentRunKey, uncalibratedRunKey, useConsoleJobs, designOf } from './store';
import { useAnalysisFreshness, useChanges, useFlightQualification } from './hooks';
import { useFlightPreview } from './livePreview';
import { activeTestEngine, stubEngine, resetConsoleState, consoleJobStub, flightResult } from './testFixtures';
import type { DragCalibration } from '../application/dragCalibration';
import type { LegacyRunInputs } from '../application/runInputs';
import { LEGACY_FLIGHT_MODEL } from '../application/flightModel';
import { StageHeader } from './stages/common';
import { LivePreview } from './stages/LivePreview';
import { CalibrationCard } from './evidence/CalibrationCard';
import type { ImportedLog } from './evidence/loadedLog';

const CALIBRATION: DragCalibration = {
  scale: 0.881,
  fittedCd: 0.4888,
  modelCd: 0.5545,
  rmseN: 0.117,
  coastMassKg: 0.0499,
  source: { fileName: 'cosmic-cargo-2986.csv', sha256Hex: 'd'.repeat(64), rowCount: 406 },
  window: { startS: 2.31, endS: 7.28, method: 'velocity-column', pointsUsed: 385, pointsExcluded: 13 },
  appliedAt: '2026-10-21T12:00:00.000Z',
};

let engine: ReturnType<typeof stubEngine>;

beforeEach(() => {
  engine = stubEngine();
  resetConsoleState();
  consoleJobStub();
});
afterEach(() => {
  cleanup();
  engine.teardown();
});

/** Options of the most recent call to `cmd` (flights carry them at `options`, ensemble chunks under `req.base.options`). */
function lastOptions(cmd: string): Record<string, unknown> {
  const calls = engine.calls.filter((c) => c.cmd === cmd);
  const args = calls[calls.length - 1]?.args as { options?: Record<string, unknown>; req?: { options?: Record<string, unknown> } } | undefined;
  const options = args?.options ?? args?.req?.options;
  if (options === undefined) throw new Error(`no ${cmd} call with options`);
  return options;
}

async function runFlight(): Promise<void> {
  await act(async () => {
    await useConsoleJobs.getState().run();
  });
}

describe('drag calibration in the Console', () => {
  it('stales the committed run on apply and on remove, and a rerun carries the scale and the label', async () => {
    const { result } = renderHook(() => ({ q: useFlightQualification(), fresh: useAnalysisFreshness(), changes: useChanges() }));
    await runFlight();
    expect(result.current.q.isPass).toBe(true);
    expect(lastOptions('simulate_flight').dragCdScale).toBeUndefined();
    expect(committedRun()?.run?.summary.apogee.confidence).toBe('modeled');
    expect(committedRun()?.run?.dragCalibration).toBeUndefined();
    const uncalibratedKey = currentRunKey();

    // Apply: the result no longer matches the inputs, and the change is named.
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    expect(result.current.q.status).toBe('stale');
    expect(result.current.fresh).toBe('stale');
    expect(result.current.changes.map((c) => c.field)).toContain('dragCalibration');
    expect(currentRunKey()).not.toBe(uncalibratedKey);

    await runFlight();
    expect(result.current.q.isPass).toBe(true);
    expect(result.current.fresh).toBe('current');
    expect(lastOptions('simulate_flight').dragCdScale).toBe(CALIBRATION.scale);
    const calibrated = committedRun()!.run!;
    expect(calibrated.dragCalibration).toEqual(CALIBRATION);
    expect(calibrated.manifest.dragCalibration).toMatch(/0\.881.*cosmic-cargo-2986\.csv/);
    // Every aero-driven number reads Calibrated, with the reason, and says it is not validation.
    expect(calibrated.summary.apogee.confidence).toBe('calibrated');
    expect(calibrated.summary.maxSpeed.confidence).toBe('calibrated');
    expect(calibrated.summary.apogee.reason).toMatch(/not a validation/);
    expect(calibrated.series.channels.drag.confidence).toBe('calibrated');
    // Things the scale does not touch keep their own level.
    expect(calibrated.summary.flightTime.confidence).toBe('modeled');
    expect(calibrated.summary.drift.confidence).toBe('extrapolated');

    // Remove: stale again, and the next run is back to the model's own drag.
    act(() => consoleActions.setDragCalibration(undefined, 'Remove drag calibration'));
    expect(result.current.q.status).toBe('stale');
    expect(currentRunKey()).toBe(uncalibratedKey);
    await runFlight();
    expect(result.current.q.isPass).toBe(true);
    expect(lastOptions('simulate_flight').dragCdScale).toBeUndefined();
    expect(committedRun()!.run!.summary.apogee.confidence).toBe('modeled');
    expect(committedRun()!.run!.dragCalibration).toBeUndefined();
    expect(committedRun()!.run!.manifest.dragCalibration).toBeUndefined();
  });

  it('never lets an unqualified run read Calibrated', async () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    // The engine reports the flight left its envelope: the scale does not rescue it.
    const stub = activeTestEngine();
    const base = stub.invoke;
    stub.invoke = async (cmd, args, options) => {
      const out = (await base(cmd, args, options)) as Record<string, unknown>;
      return cmd === 'simulate_flight' ? { ...out, enveloped: false } : out;
    };
    await runFlight();
    expect(committedRun()!.run!.dragCalibration).toEqual(CALIBRATION);
    expect(committedRun()!.run!.summary.apogee.confidence).toBe('unknown');
  });

  it('runs Monte Carlo with the scale and records the calibration on the result', async () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    act(() => useConsoleJobs.getState().runMonteCarlo(25));
    await waitFor(() => expect(useAnalysisStore.getState().completed.ensemble).not.toBeNull());
    const chunk = engine.calls.find((c) => c.cmd === 'run_ensemble_chunk');
    const req = chunk?.args?.req as { base?: { options?: Record<string, unknown> }; options?: Record<string, unknown> };
    const options = req.options ?? req.base?.options;
    expect(options?.dragCdScale).toBe(CALIBRATION.scale);
    const payload = useAnalysisStore.getState().completed.ensemble?.payload as { dispersion: { dragCalibration?: DragCalibration } };
    expect(payload.dispersion.dragCalibration).toEqual(CALIBRATION);
    // The ensemble's input key carries the calibration, so removing it stales this result.
    const keyWith = useAnalysisStore.getState().completed.ensemble?.inputKey;
    act(() => consoleActions.setDragCalibration(undefined, 'Remove drag calibration'));
    act(() => useConsoleJobs.getState().runMonteCarlo(25));
    await waitFor(() => expect(useAnalysisStore.getState().completed.ensemble?.inputKey).not.toBe(keyWith));
  });

  it('flies the live preview with the scale', async () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    const { result } = renderHook(() => useFlightPreview(10));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(lastOptions('flight_summary').dragCdScale).toBe(CALIBRATION.scale);
    // Removing it re-flies the preview without the scale.
    act(() => consoleActions.setDragCalibration(undefined, 'Remove drag calibration'));
    await waitFor(() => expect(result.current.current).toBe(true));
    expect(lastOptions('flight_summary').dragCdScale).toBeUndefined();
  });

  it('undoes and redoes an apply as one step', () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    expect(useProjectStore.getState().project.dragCalibration).toEqual(CALIBRATION);
    act(() => consoleActions.undo());
    expect(useProjectStore.getState().project.dragCalibration).toBeUndefined();
    act(() => consoleActions.redo());
    expect(useProjectStore.getState().project.dragCalibration).toEqual(CALIBRATION);
  });

  it('hands the design the scale only while a calibration is applied', () => {
    const store = useProjectStore.getState();
    expect(designOf(store.project, store.mission).options.dragCdScale).toBeUndefined();
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    const after = useProjectStore.getState();
    const design = designOf(after.project, after.mission);
    expect(design.options.dragCdScale).toBe(CALIBRATION.scale);
    expect(design.dragCalibration).toEqual(CALIBRATION);
  });
});

describe('drag calibration labels', () => {
  const chipCount = (): number => document.querySelectorAll('[data-drag-calibration]').length;

  it('marks every stage that shows flight results once the committed run used a calibration', async () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    await runFlight();
    for (const stage of ['flight', 'recovery', 'verify', 'build'] as const) {
      const { unmount } = render(<StageHeader stage={stage} title={stage} />);
      expect(chipCount(), stage).toBe(1);
      unmount();
    }
    // Stages that show no flight results do not claim one.
    const { unmount } = render(<StageHeader stage="airframe" title="Airframe" />);
    expect(chipCount()).toBe(0);
    unmount();
  });

  it('describes what the stored run used, not what the project carries now', async () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    await runFlight();
    act(() => consoleActions.setDragCalibration({ ...CALIBRATION, scale: 0.95 }, 'Apply drag calibration'));
    render(<StageHeader stage="flight" title="Flight" />);
    expect(document.querySelector('[data-drag-calibration]')?.getAttribute('data-drag-calibration')).toBe('0.881');
  });

  it('shows no chip on an uncalibrated run', async () => {
    await runFlight();
    render(<StageHeader stage="flight" title="Flight" />);
    expect(chipCount()).toBe(0);
  });

  it('marks the live preview while a calibration is applied', async () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    render(<LivePreview />);
    expect(chipCount()).toBe(1);
    act(() => consoleActions.setDragCalibration(undefined, 'Remove drag calibration'));
    expect(chipCount()).toBe(0);
  });
});

describe('drag calibration survives save and open', () => {
  it('keeps the calibration, its provenance and a current run through Save then Open', async () => {
    const { result } = renderHook(() => useFlightQualification());
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    await runFlight();
    expect(result.current.isPass).toBe(true);

    const text = writeProject(exportableProject());
    expect(JSON.parse(text).dragCalibration).toEqual(CALIBRATION);
    expect(JSON.parse(text).schemaVersion).toBe(PROJECT_SCHEMA_VERSION);

    // Reopen into a project that has a different (no) calibration, then check it comes back.
    act(() => consoleActions.setDragCalibration(undefined, 'Remove drag calibration'));
    await act(async () => {
      await importProjectFile(new File([text], 'p1.astraea.json'));
    });
    expect(useProjectStore.getState().project.dragCalibration).toEqual(CALIBRATION);
    expect(result.current.isPass).toBe(true);
  });

  it('opens a 1.3.0 file as uncalibrated and migrates it', async () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    const doc = JSON.parse(writeProject(exportableProject())) as Record<string, unknown>;
    doc.schemaVersion = '1.3.0';
    delete doc.dragCalibration;
    await act(async () => {
      await importProjectFile(new File([JSON.stringify(doc)], 'old.astraea.json'));
    });
    const project = useProjectStore.getState().project;
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.dragCalibration).toBeUndefined();
    const store = useProjectStore.getState();
    expect(designOf(store.project, store.mission).options.dragCdScale).toBeUndefined();
  });
});

/** Controlled kinematics exercise application mechanics; no empirical validation. */
const REVIEW_SAMPLES = Array.from({ length: 351 }, (_, i) => {
  const timeS = i / 50;
  return { timeS, altitudeM: 100 + 80 * timeS - 6 * timeS ** 2, velocityMs: 80 - 12 * timeS };
});
const REVIEW_LOG: ImportedLog = {
  samples: REVIEW_SAMPLES, hasVelocity: true, originalBytes: new TextEncoder().encode('controlled fixture'),
  provenance: { sourceFileName: 'controlled.csv', sha256Hex: 'unavailable', rowCount: REVIEW_SAMPLES.length, dialect: 'generic-csv',
    timeUnitAssumption: 'seconds (declared controlled fixture)', altitudeUnitAssumption: 'meters (declared controlled fixture)', skippedLineCount: 0 },
};

function controlledFitEngine(): void {
  const stub = activeTestEngine();
  const base = stub.invoke;
  const template = flightResult();
  stub.invoke = async (cmd, args, options) => cmd === 'simulate_flight' ? flightResult({
    events: [
      { time: -1, name: 'Motor Burnout', altitude: 0, velocity: 80, description: 'Controlled motor event' },
      { time: 7, name: 'Apogee & Drogue Deployment', altitude: 0, velocity: 0, description: 'Controlled recovery event' },
    ],
    telemetry: REVIEW_SAMPLES.map((p) => ({ ...template.telemetry[0], time: p.timeS, altitude: p.altitudeM, velocity: { x: 0, y: 0, z: p.velocityMs } })),
  }) : base(cmd, args, options);
}
async function previewControlledFit(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Fit drag to this log' }));
  await waitFor(() => expect(document.querySelector('[data-drag-fit]')).not.toBeNull());
}
function reviewControlledFit(): void {
  const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  change('Log final burnout earliest (s)', '-1.1');
  change('Log final burnout latest (s)', '-1');
  change('Log recovery evidence', 'first-event');
  change('Log first recovery earliest (s)', '7');
  change('Log first recovery latest (s)', '7.1');
  change('Log event source and clock basis', 'Controlled fixture specification; imported time origin; no alignment');
  change('Motion and mass evidence note', 'Controlled vertical, calm, constant-mass fixture on both sides');
  for (const label of ['Log approximately vertical air-relative motion', 'Log constant mass across filter support', 'Model approximately vertical air-relative motion', 'Model constant mass across filter support']) change(label, 'supported');
}
const applyReviewButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Apply to this project' });

describe('reviewed calibration preview and application', () => {
  beforeEach(controlledFitEngine);

  it('previews without review, blocks full-support recovery overlap, then applies and persists declared provenance', async () => {
    render(<CalibrationCard log={REVIEW_LOG} />);
    await previewControlledFit();
    expect(applyReviewButton().disabled).toBe(true);
    expect(document.querySelector('[data-calibration-eligibility]')?.getAttribute('data-calibration-eligibility')).toBe('unverified');
    expect(useProjectStore.getState().project.dragCalibration).toBeUndefined();
    reviewControlledFit();
    expect(applyReviewButton().disabled).toBe(false);
    // Deployment lies after the last fitted centre but within its filter support.
    fireEvent.change(screen.getByLabelText('Log first recovery earliest (s)'), { target: { value: '6.3' } });
    expect(document.querySelector('[data-calibration-eligibility]')?.getAttribute('data-calibration-eligibility')).toBe('unsupported');
    expect(applyReviewButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Log first recovery earliest (s)'), { target: { value: '7' } });
    fireEvent.click(applyReviewButton());
    const applied = useProjectStore.getState().project.dragCalibration!;
    expect(applied.fitProvenance?.eligibility).toBe('conditional');
    expect(applied.fitProvenance?.engineIdentity).toEqual({ kind: 'test-engine', sha256: null });
    expect(applied.fitProvenance?.evidence.log.burnout).toMatchObject({ earliestS: -1.1, latestS: -1 });
    expect(applied.fitProvenance?.evidence.model.burnout?.source).toContain('Native model event');
    expect(applyReviewButton().disabled).toBe(true);
    const text = writeProject(exportableProject());
    await act(async () => { await importProjectFile(new File([text], 'controlled.astraea.json')); });
    expect(useProjectStore.getState().project.dragCalibration).toEqual(applied);
    // The test engine has no SHA-256, so the recorded fit engine is pending
    // verification; the card must not claim the scale is actually active.
    expect(screen.getByText(/Input-compatible and conditionally eligible, but the recorded fit engine is not verified/)).toBeTruthy();
    expect(document.querySelector('[data-calibration-applicability="active-bound"]')).not.toBeNull();
  });

  it('permits explicit legacy upgrade and evidence-note updates without removing an identical multiplier', async () => {
    render(<CalibrationCard log={REVIEW_LOG} />);
    await previewControlledFit();
    reviewControlledFit();
    fireEvent.click(applyReviewButton());
    const { fitProvenance: _provenance, ...legacy } = useProjectStore.getState().project.dragCalibration!;
    act(() => consoleActions.setDragCalibration(legacy, 'Load legacy adjustment'));
    expect(screen.getByText(/Legacy adjustment retained/)).toBeTruthy();
    expect(applyReviewButton().disabled).toBe(false);
    fireEvent.click(applyReviewButton());
    expect(useProjectStore.getState().project.dragCalibration?.fitProvenance).toBeDefined();
    expect(applyReviewButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motion and mass evidence note'), { target: { value: 'Revised controlled fixture evidence source' } });
    expect(applyReviewButton().disabled).toBe(false);
    fireEvent.click(applyReviewButton());
    expect(useProjectStore.getState().project.dragCalibration?.fitProvenance?.evidence.log.constantMass?.source).toContain('Revised controlled fixture evidence source');
  });

  it('recognizes a historical shear-suffixed fit key and ignores later shear-only changes', () => {
    const store = useProjectStore.getState();
    const base = designOf(store.project, store.mission).calibrationFitInputKey!;
    // The previous store helper recorded `<base>|shear:<Pa>` for fits made
    // while the override was set; the artifact itself is never rewritten.
    const historical = {
      ...CALIBRATION,
      fitProvenance: {
        flightModelBinding: { ...LEGACY_FLIGHT_MODEL },
        uncalibratedRunKey: `${base}|shear:4000000000`,
      },
    } as unknown as DragCalibration;
    useProjectStore.setState({ project: { ...store.project, dragCalibration: historical }, shearPa: 4e9 });
    const at = () => {
      const state = useProjectStore.getState();
      return designOf(state.project, state.mission, state.shearPa, undefined, state.motors);
    };
    expect(at().calibrationApplicability).toMatchObject({ status: 'active' });
    expect(at().options.dragCdScale).toBe(CALIBRATION.scale);
    // Shear changes flutter only; the fit stays compatible.
    act(() => consoleActions.setShear(9e9));
    expect(at().calibrationApplicability).toMatchObject({ status: 'active' });
    expect(useProjectStore.getState().project.dragCalibration).toEqual(historical);
    // Unknown suffix text is not truncated into compatibility.
    useProjectStore.setState({ project: { ...useProjectStore.getState().project, dragCalibration: {
      ...historical,
      fitProvenance: { ...historical.fitProvenance!, uncalibratedRunKey: `${base}|shear:not-a-number` },
    } } });
    expect(at().calibrationApplicability).toMatchObject({ status: 'inactive', reason: 'fit-inputs' });
    // A real physical-input change still refuses the recognized historical form.
    useProjectStore.setState({ project: { ...useProjectStore.getState().project, dragCalibration: historical } });
    act(() => consoleActions.setOptions({ windSpeedSurface: 9 }, 'Changed wind'));
    expect(at().calibrationApplicability).toMatchObject({ status: 'inactive', reason: 'fit-inputs' });
    expect(at().options.dragCdScale).toBeUndefined();
  });

  it('uses the vehicle-derived launch altitude for design and fit, never a stale workspace site', () => {
    const store = useProjectStore.getState();
    const withoutSite = {
      ...store.project,
      vehicle: { ...store.project.vehicle, launchSite: undefined },
      workspace: { ...store.project.workspace, site: { ...store.project.workspace.site, altitudeASLM: 1400 } },
    };
    const base = designOf(withoutSite, store.mission);
    expect(base.options.launchAltitudeASL).toBe(0);
    const key = base.calibrationFitInputKey!;
    // workspace.site is not an engine input: it cannot move the design key or
    // the fit's actual model-flight altitude.
    const movedSite = {
      ...withoutSite,
      workspace: { ...withoutSite.workspace, site: { ...withoutSite.workspace.site, altitudeASLM: 2500 } },
    };
    const moved = designOf(movedSite, store.mission);
    expect(moved.options.launchAltitudeASL).toBe(0);
    expect(moved.calibrationFitInputKey).toBe(key);
    // The vehicle site IS the actual input.
    const withSite = { ...withoutSite, vehicle: { ...withoutSite.vehicle, launchSite: { altitudeM: 1400 } } };
    const sited = designOf(withSite, store.mission);
    expect(sited.options.launchAltitudeASL).toBe(1400);
    expect(sited.calibrationFitInputKey).not.toBe(key);
    // A provenance fit recorded at the no-site altitude is inactive after the
    // vehicle site changes, while its artifact stays in the document.
    const fitted = {
      ...CALIBRATION,
      fitProvenance: { flightModelBinding: { ...LEGACY_FLIGHT_MODEL }, uncalibratedRunKey: key },
    } as unknown as DragCalibration;
    const project = { ...withoutSite, dragCalibration: fitted };
    expect(designOf(project, store.mission).calibrationApplicability).toMatchObject({ status: 'active' });
    const projectSited = { ...withSite, dragCalibration: fitted };
    expect(designOf(projectSited, store.mission).calibrationApplicability).toMatchObject({ status: 'inactive', reason: 'fit-inputs' });
    expect(projectSited.dragCalibration).toEqual(fitted);
  });

  it('invalidates review on interior log changes with unavailable checksum and on each refit', async () => {
    const { rerender } = render(<CalibrationCard log={REVIEW_LOG} />);
    await previewControlledFit();
    reviewControlledFit();
    expect(applyReviewButton().disabled).toBe(false);
    const changed = { ...REVIEW_LOG, samples: REVIEW_LOG.samples.map((s, i) => i === 100 ? { ...s, velocityMs: s.velocityMs! + 0.1 } : s) };
    rerender(<CalibrationCard log={changed} />);
    expect(document.querySelector('[data-drag-fit]')).toBeNull();
    expect(screen.getByText(/result is stale, fit again/)).toBeTruthy();
    await previewControlledFit();
    expect((screen.getByLabelText('Log final burnout earliest (s)') as HTMLInputElement).value).toBe('');
    expect(applyReviewButton().disabled).toBe(true);
    reviewControlledFit();
    expect(applyReviewButton().disabled).toBe(false);
    await previewControlledFit();
    expect(applyReviewButton().disabled).toBe(true);
  });

  it('retains an adjustment as inactive history when inputs change, and reactivates on exact undo', async () => {
    render(<CalibrationCard log={REVIEW_LOG} />);
    await previewControlledFit();
    reviewControlledFit();
    fireEvent.click(applyReviewButton());
    const applied = useProjectStore.getState().project.dragCalibration!;
    const fittedWind = useProjectStore.getState().project.workspace.launch.windSpeedMps;
    const fittedKey = applied.fitProvenance!.uncalibratedRunKey;
    expect(fittedKey).toBe(uncalibratedRunKey());

    act(() => consoleActions.setOptions({ windSpeedSurface: fittedWind + 1 }, 'Changed model wind'));
    const project = useProjectStore.getState().project;
    expect(project.dragCalibration).toEqual(applied);
    const inactive = designOf(project, useProjectStore.getState().mission);
    expect(inactive.calibrationApplicability).toMatchObject({
      status: 'inactive', reason: 'fit-inputs', recordedFitInputKey: fittedKey,
    });
    expect(inactive.calibrationFitInputKey).not.toBe(fittedKey);
    expect(inactive.options.dragCdScale).toBeUndefined();
    expect(inactive.dragCalibration).toBeUndefined();
    expect(document.querySelector('[data-calibration-applicability="inactive-fit-inputs"]')).not.toBeNull();
    expect(screen.queryByText(/remains applied/)).toBeNull();
    expect(document.querySelector('[data-drag-fit]')).toBeNull();

    // The archive records what the engine actually received: no scale, no artifact.
    await runFlight();
    const archived = useAnalysisStore.getState().history.at(-1)!;
    expect((archived.runInputs as LegacyRunInputs).dragCalibration).toBeUndefined();
    expect((archived.runInputs as LegacyRunInputs).engineOptions.dragCdScale).toBe(1);
    expect(archived.inputKey).toBe(currentRunKey());
    expect(currentRunKey()).not.toBe(fittedKey);

    // Undoing the wind change restores the exact fitted inputs and the fit.
    act(() => consoleActions.undo());
    const restored = useProjectStore.getState();
    expect(restored.project.workspace.launch.windSpeedMps).toBe(fittedWind);
    const active = designOf(restored.project, restored.mission);
    expect(active.calibrationApplicability).toMatchObject({ status: 'active', model: 'bound' });
    expect(active.options.dragCdScale).toBe(applied.scale);
    expect(active.dragCalibration).toEqual(applied);
    await previewControlledFit();
    expect(applyReviewButton().disabled).toBe(true);
  });

  it('requires a fresh preview and review after reimporting identical samples', async () => {
    const { rerender } = render(<CalibrationCard log={REVIEW_LOG} />);
    await previewControlledFit();
    reviewControlledFit();
    expect(applyReviewButton().disabled).toBe(false);
    rerender(<CalibrationCard log={{ ...REVIEW_LOG }} />);
    expect(document.querySelector('[data-drag-fit]')).toBeNull();
    await previewControlledFit();
    expect(applyReviewButton().disabled).toBe(true);
    expect((screen.getByLabelText('Log event source and clock basis') as HTMLInputElement).value).toBe('');
  });

  it('explicitly refits whole neighborhoods, reassesses conditions, invalidates event edits and persists the selected fit', async () => {
    render(<CalibrationCard log={REVIEW_LOG} />);
    await previewControlledFit();
    reviewControlledFit();
    fireEvent.change(screen.getByLabelText('Log final burnout latest (s)'), { target: { value: '0.32' } });
    fireEvent.change(screen.getByLabelText('Log first recovery earliest (s)'), { target: { value: '6.3' } });
    expect(applyReviewButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Refit within reviewed events' }));
    expect(document.querySelector('[data-coast-selection]')?.getAttribute('data-coast-selection')).toBe('reviewed-events-v1');
    expect(applyReviewButton().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Log approximately vertical air-relative motion'), { target: { value: 'unverified' } });
    expect(applyReviewButton().disabled).toBe(true);
    expect(document.querySelector('[data-coast-selection]')?.getAttribute('data-coast-selection')).toBe('reviewed-events-v1');
    fireEvent.change(screen.getByLabelText('Log approximately vertical air-relative motion'), { target: { value: 'supported' } });
    fireEvent.change(screen.getByLabelText('Motion and mass evidence note'), { target: { value: 'Conditions reviewed over retained support' } });
    expect(applyReviewButton().disabled).toBe(false);
    expect(document.querySelector('[data-coast-selection]')?.getAttribute('data-coast-selection')).toBe('reviewed-events-v1');
    fireEvent.change(screen.getByLabelText('Log event source and clock basis'), { target: { value: 'Corrected event clock/source note' } });
    expect(document.querySelector('[data-coast-selection]')?.getAttribute('data-coast-selection')).toBe('heuristic-v1');
    expect(screen.getByText(/previous refit is stale/)).toBeTruthy();
    expect(applyReviewButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Refit within reviewed events' }));
    expect(applyReviewButton().disabled).toBe(false);
    fireEvent.click(applyReviewButton());
    const applied = useProjectStore.getState().project.dragCalibration!;
    expect(applied.fitProvenance!.selection?.policy).toBe('reviewed-events-v1');
    expect(applied.fitProvenance?.engineIdentity).toEqual({ kind: 'test-engine', sha256: null });
    expect(applied.fitProvenance!.selection!.logExclusions.burnoutOnly).toBeGreaterThan(0);
    expect(applied.fitProvenance!.selection!.logExclusions.recoveryOnly).toBeGreaterThan(0);
    const text = writeProject(exportableProject());
    await act(async () => { await importProjectFile(new File([text], 'event-refit.astraea.json')); });
    expect(useProjectStore.getState().project.dragCalibration).toEqual(applied);
    // An insufficient-support refit never replaces the applied adjustment or exposes stale coefficients.
    fireEvent.change(screen.getByLabelText('Log final burnout latest (s)'), { target: { value: '6.29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refit within reviewed events' }));
    expect(screen.getByRole('alert').textContent).toMatch(/only 0 qualified/);
    expect(useProjectStore.getState().project.dragCalibration).toEqual(applied);
    expect(document.querySelector('[data-coast-selection]')?.getAttribute('data-coast-selection')).toBe('heuristic-v1');
    expect(applyReviewButton().disabled).toBe(true);
  });
});

const foreignFit = (): DragCalibration => ({ ...CALIBRATION, fitProvenance: { flightModelBinding: {
  schemaId: 'astraea-flight-model-selection/1.0.0', modelId: 'candidate-future',
  environmentId: 'env', mechanicalModelId: 'mech', calibrationPolicyId: 'policy' } } } as unknown as DragCalibration);

describe('calibration model binding', () => {
  it('refuses applying a foreign-bound fit without any state change', () => {
    const foreign = foreignFit();
    const before = useProjectStore.getState().project;
    expect(() => consoleActions.setDragCalibration(foreign, 'Apply foreign fit')).toThrow(/bound to a different flight model/);
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.getState().project.dragCalibration).toBeUndefined();
  });

  it('keeps incompatible artifacts out of run identity and dispatched inputs', async () => {
    useProjectStore.setState({ project: { ...useProjectStore.getState().project, dragCalibration: foreignFit() } });
    const state = useProjectStore.getState();
    const design = designOf(state.project, state.mission);
    expect(design.options.dragCdScale).toBeUndefined();
    expect(design.dragCalibration).toBeUndefined();
    expect(state.project.dragCalibration).toBeDefined();
    const keyWithArtifact = currentRunKey();
    await useConsoleJobs.getState().run();
    const record = useAnalysisStore.getState().history.at(-1)!;
    expect((record.runInputs as LegacyRunInputs).dragCalibration).toBeUndefined();
    expect((record.runInputs as LegacyRunInputs).engineOptions.dragCdScale).toBe(1);
    expect(record.inputKey).toBe(keyWithArtifact);
    const without = { ...useProjectStore.getState().project };
    delete without.dragCalibration;
    useProjectStore.setState({ project: without });
    expect(currentRunKey()).toBe(keyWithArtifact);
  });
});
