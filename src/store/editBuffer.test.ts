/**
 * RIVAL S2 — edit buffer semantics (synthesis pattern 4): staged edits never
 * touch the engineering store; Apply commits one undoable history step;
 * Discard/Escape drops drafts; non-finite values are rejected, never clamped.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { BodyTubeComponent, RocketVehicle } from '../core/types';
import { useRocketStore } from './rocketStore';
import { useEditBufferStore } from './editBufferStore';

function bodyTube(vehicle: RocketVehicle): BodyTubeComponent {
  return vehicle.components.find((c) => c.id === 'alpha-bt') as BodyTubeComponent;
}

describe('edit buffer', () => {
  beforeEach(() => {
    useRocketStore.getState().resetStore();
    useEditBufferStore.getState().discardAll();
  });

  it('stages patches as a draft overlay without touching the store', () => {
    const store = useRocketStore.getState();
    const before = bodyTube(store.vehicle);
    const staged = useEditBufferStore.getState().stage('alpha-bt', { length: 0.9 });
    expect(staged).toBe(true);
    // Draft renders the staged value…
    const draft = useEditBufferStore.getState().draftFor('alpha-bt') as Partial<BodyTubeComponent>;
    expect(draft.length).toBe(0.9);
    useEditBufferStore.getState().stage('alpha-bt', { outerDiameter: 0.03 });
    const merged = useEditBufferStore.getState().draftFor('alpha-bt') as Partial<BodyTubeComponent>;
    expect(merged.length).toBe(0.9);
    expect(merged.outerDiameter).toBe(0.03);
    // …while the store still carries the committed value.
    expect(bodyTube(store.vehicle).length).toBe(before.length);
    expect(useEditBufferStore.getState().pendingCount()).toBe(1);
  });

  it('rejects non-finite numeric patches and unknown component ids', () => {
    expect(useEditBufferStore.getState().stage('alpha-bt', { length: Number.NaN })).toBe(false);
    expect(useEditBufferStore.getState().stage('alpha-bt', { outerDiameter: Number.POSITIVE_INFINITY })).toBe(false);
    expect(useEditBufferStore.getState().stage('nope-missing', { length: 0.1 })).toBe(false);
    expect(useEditBufferStore.getState().stage('alpha-bt', {})).toBe(false);
    expect(useEditBufferStore.getState().pendingCount()).toBe(0);
  });

  it('applies drafts as ONE undoable history step and clears the buffer', () => {
    const store = useRocketStore.getState();
    useEditBufferStore.getState().stage('alpha-bt', { length: 0.9 });
    const historyBefore = store.history.length;

    useEditBufferStore.getState().applyAll();

    expect(bodyTube(useRocketStore.getState().vehicle).length).toBe(0.9);
    expect(useEditBufferStore.getState().pendingCount()).toBe(0);
    // Exactly one history entry for the whole session.
    expect(useRocketStore.getState().history.length).toBe(historyBefore + 1);
    // Undo rolls the whole session back.
    useRocketStore.getState().undo();
    expect(bodyTube(useRocketStore.getState().vehicle).length).not.toBe(0.9);
  });

  it('discard drops every draft and leaves the store untouched', () => {
    const store = useRocketStore.getState();
    const before = store.vehicle;
    useEditBufferStore.getState().stage('alpha-bt', { length: 0.9 });
    useEditBufferStore.getState().stage('alpha-fins', { span: 0.2 });
    useEditBufferStore.getState().discardAll();
    expect(useEditBufferStore.getState().pendingCount()).toBe(0);
    expect(useRocketStore.getState().vehicle).toBe(before);
  });

  it('drops drafts for components that no longer exist at apply time', () => {
    useEditBufferStore.getState().stage('alpha-bt', { length: 0.9 });
    useRocketStore.getState().removeComponent('alpha-bt');
    useEditBufferStore.getState().applyAll();
    expect(useRocketStore.getState().vehicle.components.find((c) => c.id === 'alpha-bt')).toBeUndefined();
    expect(useEditBufferStore.getState().pendingCount()).toBe(0);
  });
});