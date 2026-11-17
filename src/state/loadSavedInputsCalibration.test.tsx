/**
 * K3 review (commit 5): "Load saved inputs" must not disable a provenance-bearing calibration.
 *
 * A calibration fitted with no drag choice flies the legacy tables (the resolution), but the archive must keep
 * the user's DECLARATION: the vehicle a run restores is hashed into the calibration's recorded
 * `uncalibratedRunKey`. If the archive stores the resolved `'legacy'` instead, the restored vehicle has another
 * fit key, the calibration reads "inactive", its scale is dropped and the rerun flies different physics.
 *
 * Real store, real run job, real capture, real `loadSavedRun` and `designOf`; only the engine invoke is a double.
 * The probes fail on efc43e9 (applicability inactive, scale absent, other fit key, other request).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { adoptProject, exportableProject, useProjectStore } from './project';
import { readProject, writeProject } from '../formats/projectJson';
import { consoleJobStub, resetConsoleState, stubEngine, type Invocation } from '../console/testFixtures';
import { designOf } from '../console/design';
import { resolveRun, useConsoleJobs } from '../console/store';
import { compareRunInputs } from '../application/runComparison';
import { stableStringify } from '../application/caseResolver';
import { fitDragScale } from '../evidence/dragFit';
import { buildLogProvenance } from '../evidence/logProvenance';
import { buildDragCalibration, type DragCalibration } from '../application/dragCalibration';
import { LEGACY_FLIGHT_MODEL } from '../application/flightModel';
import type { LegacyRunInputs } from '../application/runInputs';

let teardown: () => void;
let calls: Invocation[];
beforeEach(() => {
  const stub = stubEngine();
  teardown = stub.teardown;
  calls = stub.calls;
  resetConsoleState({ defaultFlightDrag: true });   // the user made no drag choice
  consoleJobStub();
});
afterEach(() => teardown());

/** A provenance-bearing artifact bound to the exact uncalibrated case `fitKey` names. */
async function provenanceArtifact(fitKey: string): Promise<DragCalibration> {
  const samples = Array.from({ length: 351 }, (_, i) => {
    const timeS = i / 50;
    return { timeS, altitudeM: 100 + 80 * timeS - 6 * timeS ** 2, velocityMs: 80 - 12 * timeS };
  });
  const fit = fitDragScale({
    log: samples, coastMassKg: 1, refAreaM2: 0.01, launchElevationM: 100,
    modelTelemetry: samples.filter((_, i) => i % 2 === 0).map((p) => ({ time: p.timeS, altitude: p.altitudeM, velocity: { z: p.velocityMs } })),
  });
  const side = {
    burnout: { earliestS: -1.1, latestS: -1, source: 'Controlled burnout' },
    recovery: { kind: 'first-event' as const, event: { earliestS: 7, latestS: 7.1, source: 'Controlled recovery' } },
    verticalMotion: { status: 'supported' as const, source: 'Controlled vertical' },
    constantMass: { status: 'supported' as const, source: 'Controlled mass' },
  };
  const log = await buildLogProvenance({ rawText: 'controlled fixture', fileName: 'controlled.csv', rowCount: samples.length });
  return buildDragCalibration(fit, log, '2026-10-28T00:00:00.000Z', LEGACY_FLIGHT_MODEL, { log: side, model: side }, fitKey, 'fnv1a32:01234567');
}

function now() {
  const store = useProjectStore.getState();
  const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
  return {
    status: design.calibrationApplicability.status,
    scale: design.options.dragCdScale,
    fitKey: design.calibrationFitInputKey,
    runKey: resolveRun(store.project, store.motors, design, store.shearPa)?.inputKey,
    drag: design.vehicle.flightDragSource,
    storedChoice: store.project.vehicle.flightDragSource,
  };
}

async function runAndGetOptions(): Promise<Record<string, unknown>> {
  const before = calls.filter((c) => c.cmd === 'simulate_flight').length;
  await act(async () => { await useConsoleJobs.getState().run(); });
  const flights = calls.filter((c) => c.cmd === 'simulate_flight');
  expect(flights.length).toBe(before + 1);
  return flights[flights.length - 1].args?.options as Record<string, unknown>;
}

async function withActiveProvenanceCalibration(): Promise<DragCalibration> {
  const fitKey = now().fitKey;
  expect(fitKey).not.toBeNull();
  const artifact = await provenanceArtifact(fitKey!);
  act(() => useProjectStore.setState((state) => ({ project: { ...state.project, dragCalibration: artifact } })));
  return artifact;
}

describe('run -> archive -> Load saved inputs -> rerun', () => {
  it('keeps the calibration active with the same scale, run key, fit key and dispatched options', async () => {
    const artifact = await withActiveProvenanceCalibration();
    const first = now();
    expect(first).toMatchObject({ status: 'active', scale: artifact.scale, drag: 'legacy', storedChoice: undefined });
    const optionsFirst = await runAndGetOptions();
    expect(optionsFirst).not.toHaveProperty('flightDragSource');
    expect(optionsFirst.dragCdScale).toBe(artifact.scale);

    const cases = exportableProject().cases;
    expect(cases).toHaveLength(1);
    expect(useProjectStore.getState().loadSavedRun(cases[0].id)).toBe(true);
    const restored = now();
    expect(restored).toEqual(first);   // applicability, scale, fit key, run key, resolution, declaration
    expect(useProjectStore.getState().project.dragCalibration).toEqual(artifact);

    const optionsRerun = await runAndGetOptions();
    expect(stableStringify(optionsRerun)).toBe(stableStringify(optionsFirst));
  });

  it('the archive stores the DECLARATION; what flew is in the engine options and re-derives from declaration plus calibration', async () => {
    const artifact = await withActiveProvenanceCalibration();
    await runAndGetOptions();
    const archived = exportableProject().cases[0].inputs as LegacyRunInputs;
    expect(archived.vehicle.flightDragSource).toBeUndefined();
    expect(archived.engineOptions).not.toHaveProperty('flightDragSource');
    expect(archived.engineOptions.dragCdScale).toBe(artifact.scale);
    expect(archived.dragCalibration?.scale).toBe(artifact.scale);
    // validation re-derives the legacy resolution from the archived declaration and the archived calibration
    expect((readProject(writeProject(exportableProject())).cases[0].inputs as LegacyRunInputs).vehicle.flightDragSource).toBeUndefined();
  });

  it('survives reopening the project file first: the archive is accepted and loads to the same state', async () => {
    const artifact = await withActiveProvenanceCalibration();
    const first = now();
    const optionsFirst = await runAndGetOptions();
    const text = writeProject(exportableProject());
    const reopened = readProject(text);                                   // archive validation accepts what was flown
    act(() => adoptProject(reopened));
    expect(now()).toMatchObject({ status: 'active', scale: artifact.scale, runKey: first.runKey, fitKey: first.fitKey });
    expect(useProjectStore.getState().loadSavedRun(reopened.cases[0].id)).toBe(true);
    expect(now()).toEqual(first);
    expect(stableStringify(await runAndGetOptions())).toBe(stableStringify(optionsFirst));
  });

  it('comparison: the archive of the rerun equals the archive of the first run (no phantom drag choice or scale change)', async () => {
    await withActiveProvenanceCalibration();
    await runAndGetOptions();
    const id = exportableProject().cases[0].id;
    expect(useProjectStore.getState().loadSavedRun(id)).toBe(true);
    await runAndGetOptions();
    const [a, b] = exportableProject().cases.map((c) => c.inputs!);
    expect(b).toBeDefined();
    const groups = compareRunInputs(a, b)!;
    expect(groups[0].name).toMatch(/invocation and analysis inputs/);
    expect(groups[0].total).toBe(0);
  });

  it('archives written by the earlier K3 builds (resolved legacy vehicle plus calibration, no drag option) still load', async () => {
    const artifact = await withActiveProvenanceCalibration();
    await runAndGetOptions();
    const doc = JSON.parse(writeProject(exportableProject())) as Record<string, any>;
    doc.cases[0].inputs.vehicle.flightDragSource = 'legacy';   // how commits 2 to 4 archived it
    const reopened = readProject(JSON.stringify(doc));
    expect((reopened.cases[0].inputs as LegacyRunInputs).engineOptions.dragCdScale).toBe(artifact.scale);
    // and a built-up option next to the held scale is still refused
    doc.cases[0].inputs.vehicle.flightDragSource = undefined;
    delete doc.cases[0].inputs.vehicle.flightDragSource;
    doc.cases[0].inputs.engineOptions.flightDragSource = 'calibrated';
    expect(() => readProject(JSON.stringify(doc))).toThrow(/flightDragSource is not derived/);
  });
});
