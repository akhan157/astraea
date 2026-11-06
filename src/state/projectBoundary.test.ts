// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { adoptProject, serializeProject, useProjectStore } from './project';
import { useAnalysisStore } from './analysis';
import { createProjectEnvelope, readProject } from '../formats/projectJson';

beforeEach(() => {
  useProjectStore.getState().newProject();
  useAnalysisStore.getState().reset();
});

for (const transition of ['new', 'open', 'preset'] as const) {
  for (const completion of ['before replacement', 'after replacement'] as const) {
    it(`${transition}: run completed ${completion} must not travel with project B`, () => {
      const analysis = useAnalysisStore.getState();
      const token = analysis.start('ensemble', 'inputs-of-project-A');
      const complete = () => analysis.resolve('ensemble', token, {
        design: { motorId: 'aerotech_k550w' },
        dispersion: { landings: [], ok: 2, failed: 0 },
      });
      if (completion === 'before replacement') complete();
      if (transition === 'new') useProjectStore.getState().newProject();
      if (transition === 'preset') useProjectStore.getState().loadPreset('estesAlpha');
      if (transition === 'open') {
        const vehicle = useProjectStore.getState().project.vehicle;
        adoptProject(createProjectEnvelope({ vehicle: { ...vehicle, id: 'project-b', name: 'Project B' } }));
      }
      if (completion === 'after replacement') complete();
      // Exercise actual save serialization/validation, not just store internals.
      expect(readProject(serializeProject()).cases).toEqual([]);
    });
  }
}

it('preset undo restores completed context without resurrecting a pending rerun', () => {
  const analysis = useAnalysisStore.getState();
  const completed = analysis.start('ensemble', 'completed-A');
  analysis.resolve('ensemble', completed, {
    design: { motorId: 'aerotech_k550w' }, dispersion: { landings: [], ok: 2, failed: 0 },
  });
  const originalCases = readProject(serializeProject()).cases;
  const pending = analysis.start('ensemble', 'pending-A');
  useProjectStore.getState().loadPreset('estesAlpha');
  expect(useAnalysisStore.getState().completed.ensemble).toBeNull();
  useProjectStore.getState().undo();
  expect(useAnalysisStore.getState().completed.ensemble?.token).toBe(completed);
  expect(useAnalysisStore.getState().records.ensemble?.status).toBe('completed');
  analysis.resolve('ensemble', pending, { design: { motorId: 'aerotech_k550w' }, dispersion: { landings: [], ok: 99, failed: 0 } });
  expect(readProject(serializeProject()).cases).toEqual(originalCases);
  useProjectStore.getState().redo();
  expect(readProject(serializeProject()).cases).toEqual([]);
  expect(useAnalysisStore.getState().completed.ensemble).toBeNull();
  useProjectStore.getState().undo();
  expect(readProject(serializeProject()).cases).toEqual(originalCases);
});
