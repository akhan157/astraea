/**
 * The parts tree's structural edits as the Console exposes them: each add,
 * remove, reorder and optional-field clear is one undo step through the
 * project store, and a refused edit changes nothing.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { consoleActions } from './store';
import { useProjectStore } from '../state/project';
import { useSessionStore } from '../state/session';
import type { ParachuteComponent } from '../core/types';

describe('component operations through the project store', () => {
  beforeEach(() => {
    useProjectStore.getState().loadPreset('nasaStudent');
  });

  it('adds a part as one undo step, selects it, and undoes back', () => {
    const before = useProjectStore.getState();
    const count = before.project.vehicle.components.length;

    const op = consoleActions.addComponent('bodytube');
    expect(op.ok).toBe(true);
    const after = useProjectStore.getState();
    expect(after.project.vehicle.components).toHaveLength(count + 1);
    expect(after.past).toHaveLength(before.past.length + 1);
    expect(useSessionStore.getState().selectedId).toBe(after.project.vehicle.components[count].id);

    consoleActions.undo();
    expect(useProjectStore.getState().project.vehicle.components).toHaveLength(count);
    consoleActions.redo();
    expect(useProjectStore.getState().project.vehicle.components).toHaveLength(count + 1);
  });

  it('removes a part as one undo step and refuses the last remaining part', () => {
    const store = useProjectStore.getState();
    const components = store.project.vehicle.components;
    const pastBefore = store.past.length;

    const removed = consoleActions.removeComponent(components[1].id);
    expect(removed.ok).toBe(true);
    expect(useProjectStore.getState().project.vehicle.components.map((c) => c.id)).not.toContain(components[1].id);
    expect(useProjectStore.getState().past).toHaveLength(pastBefore + 1);

    // Fail closed: a single-part vehicle refuses, and nothing is recorded.
    const single = { ...components[0] };
    useProjectStore.setState({ project: { ...useProjectStore.getState().project, vehicle: { ...useProjectStore.getState().project.vehicle, components: [single] } }, past: [] });
    const refused = consoleActions.removeComponent(single.id);
    expect(refused).toEqual({ ok: false, reason: 'A vehicle needs at least one part; add another before removing this one.' });
    expect(useProjectStore.getState().past).toHaveLength(0);
    expect(useProjectStore.getState().project.vehicle.components).toHaveLength(1);
  });

  it('reorders a part as one undo step and refuses a move past either end', () => {
    const store = useProjectStore.getState();
    const ids = store.project.vehicle.components.map((c) => c.id);
    const pastBefore = store.past.length;

    const moved = consoleActions.moveComponent(ids[0], 1);
    expect(moved.ok).toBe(true);
    expect(useProjectStore.getState().project.vehicle.components.map((c) => c.id)).toEqual([ids[1], ids[0], ...ids.slice(2)]);
    expect(useProjectStore.getState().past).toHaveLength(pastBefore + 1);

    const refused = consoleActions.moveComponent(ids[1], -1);
    expect(refused.ok).toBe(false);
    expect(useProjectStore.getState().past).toHaveLength(pastBefore + 1);
  });

  it('never merges two structural edits into one step', () => {
    const before = useProjectStore.getState().past.length;
    consoleActions.addComponent('bodytube');
    consoleActions.addComponent('bodytube');
    consoleActions.addComponent('bodytube');
    expect(useProjectStore.getState().past).toHaveLength(before + 3);
  });

  it('clears an optional field by deleting the key, as one undo step', () => {
    const components = useProjectStore.getState().project.vehicle.components;
    const chute = components.find((c) => c.type === 'parachute')!;
    consoleActions.setComponent(chute.id, { packedLengthM: 0.08 }, 'Packed length');
    const withField = useProjectStore.getState().project.vehicle.components.find((c) => c.id === chute.id)! as ParachuteComponent;
    expect(withField.packedLengthM).toBeCloseTo(0.08, 9);

    const pastBefore = useProjectStore.getState().past.length;
    consoleActions.clearComponentField(chute.id, 'packedLengthM', 'Clear packed length');
    const cleared = useProjectStore.getState().project.vehicle.components.find((c) => c.id === chute.id)!;
    expect('packedLengthM' in cleared).toBe(false);
    expect(useProjectStore.getState().past).toHaveLength(pastBefore + 1);

    consoleActions.undo();
    expect((useProjectStore.getState().project.vehicle.components.find((c) => c.id === chute.id)! as ParachuteComponent).packedLengthM).toBeCloseTo(0.08, 9);
  });
});
