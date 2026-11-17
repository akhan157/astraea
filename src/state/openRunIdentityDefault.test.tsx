/**
 * K3 review, blocking 2, end to end: a project saved before the built-up default existed holds a
 * run whose recorded key is the key of the unmarked case. Reopened today the design flies the
 * default, so that run must NOT be presented as the current run; a run made by this build is.
 * Fails on e613f8a, where the two keys were equal and the old run read as current.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useProjectStore, exportableProject } from './project';
import { useAnalysisStore } from './analysis';
import { importProjectFile } from './projectIo';
import { writeProject } from '../formats/projectJson';
import { useConsoleJobs } from '../console/store';
import { useFlightQualification } from '../console/hooks';
import { activeTestEngine, installTestEngine, stubEngine } from '../console/testFixtures';
import { designOf } from '../console/design';
import { preflight, snapshotCase } from '../application/caseResolver';

describe('a run saved before the built-up default is not current after the default', () => {
  let teardown: () => void;
  beforeEach(() => {
    const stub = stubEngine();
    // The real engine always names the drag source it flew; the stub does not, and a default run archives that line.
    const base = activeTestEngine().invoke;
    const wrapped = installTestEngine(async (cmd, args) => {
      const result = await base(cmd, args) as Record<string, any>;
      return cmd === 'simulate_flight'
        ? { ...result, runManifest: { ...result.runManifest, axialDrag: 'calibrated build-up axial drag (alpha = 0); not a validated model' } }
        : result;
    });
    teardown = () => { wrapped.teardown(); stub.teardown(); };
    useProjectStore.getState().loadPreset('nasaStudent'); // no drag choice: the default
    useAnalysisStore.getState().reset();
  });
  afterEach(() => teardown());

  /** What this design's run key was in every build before the default: the case with no marker. */
  function preDefaultKey(): string {
    const store = useProjectStore.getState();
    const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
    const l = store.project.workspace.launch;
    return snapshotCase(preflight({
      vehicle: design.vehicle, motorId: design.motorId,
      options: {
        railLengthM: l.railLengthM, railElevationDeg: l.railElevationDeg, railAzimuthDeg: l.railAzimuthDeg,
        windSpeedMps: l.windSpeedMps, windAzimuthDeg: l.windAzimuthDeg, finCantDeg: l.finCantDeg, mainDeployAltitudeM: l.mainDeployAltitudeM,
      },
    }, {})).runKey;
  }

  it('a run made by this build is current after reopening (control)', async () => {
    const { result } = renderHook(() => useFlightQualification());
    await act(async () => { await useConsoleJobs.getState().run(); });
    expect(result.current.isPass).toBe(true);
    const text = writeProject(exportableProject());
    await act(async () => { await importProjectFile(new File([text], 'now.astraea.json')); });
    expect(result.current.isPass).toBe(true);
  });

  it('the same project with the run recorded the way a pre-default build recorded it is not current', async () => {
    const { result } = renderHook(() => useFlightQualification());
    await act(async () => { await useConsoleJobs.getState().run(); });
    expect(result.current.isPass).toBe(true);
    const oldKey = preDefaultKey();
    const doc = JSON.parse(writeProject(exportableProject())) as Record<string, any>;
    expect(doc.cases[0].summary.inputKey).not.toBe(oldKey); // this build's key carries the default
    // Rewrite the case as a pre-default build wrote it: the unmarked key, no drag option, no drag line.
    doc.cases[0].summary.inputKey = oldKey;
    doc.cases[0].inputs.inputKey = oldKey;
    delete doc.cases[0].inputs.engineOptions.flightDragSource;
    delete doc.cases[0].summary.axialDrag;
    await act(async () => { await importProjectFile(new File([JSON.stringify(doc)], 'before.astraea.json')); });
    expect(result.current.isPass).toBe(false);
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    // The old run is kept as history, not rewritten.
    expect(exportableProject().cases[0].summary?.inputKey).toBe(oldKey);
  });
});
