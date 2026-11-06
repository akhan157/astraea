/**
 * Opening a saved project must not change what the committed run is judged
 * against: a run made on a design, saved, and reopened stays "current", and a
 * run that belongs to a different project is never presented as committed.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useProjectStore, exportableProject } from './project';
import { useAnalysisStore } from './analysis';
import { importProjectFile } from './projectIo';
import { writeProject } from '../formats/projectJson';
import { consoleActions, useConsoleJobs } from '../console/store';
import { useFlightQualification } from '../console/hooks';
import { stubEngine } from '../console/testFixtures';

describe('open project keeps the committed run honest', () => {
  let teardown: () => void;
  beforeEach(() => {
    teardown = stubEngine().teardown;
    useProjectStore.getState().loadPreset('nasaStudent');
    useAnalysisStore.getState().reset();
  });
  afterEach(() => teardown());

  it('a run saved with the project is still current after reopening it', async () => {
    const { result } = renderHook(() => useFlightQualification());
    await act(async () => {
      await useConsoleJobs.getState().run();
    });
    expect(result.current.isPass).toBe(true);
    const text = writeProject(exportableProject());

    await act(async () => {
      await importProjectFile(new File([text], 'p1.astraea.json'));
    });
    expect(result.current.isPass).toBe(true);
  });

  it('a run made with a fin shear override is still current after reopening', async () => {
    consoleActions.setShear(9.5e9);
    const { result } = renderHook(() => useFlightQualification());
    await act(async () => {
      await useConsoleJobs.getState().run();
    });
    expect(result.current.isPass).toBe(true);
    const text = writeProject(exportableProject());
    await act(async () => {
      await importProjectFile(new File([text], 'p1.astraea.json'));
    });
    expect(result.current.isPass).toBe(true);
  });

  for (const mismatch of ['absent case', 'case id', 'input key'] as const) {
    it(`does not inherit a same-geometry run when the incoming document has ${mismatch}`, async () => {
      const { result } = renderHook(() => useFlightQualification());
      await act(async () => { await useConsoleJobs.getState().run(); });
      const incoming = exportableProject();
      const cases = mismatch === 'absent case' ? [] : incoming.cases.map((entry) => ({
        ...entry,
        ...(mismatch === 'case id' ? { id: `${entry.id}-other` } : {
          summary: { ...entry.summary, inputKey: 'other-input' },
          ...(entry.inputs ? { inputs: { ...entry.inputs, inputKey: 'other-input' } } : {}),
        }),
      }));
      const text = writeProject({ ...incoming, cases });
      await act(async () => { await importProjectFile(new File([text], 'other.astraea.json')); });
      expect(result.current.isPass).toBe(false);
      expect(useAnalysisStore.getState().completed.flight).toBeNull();
      expect(exportableProject().cases).toEqual(cases);
    });
  }
});
