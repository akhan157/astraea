/**
 * RIVAL S2 — workspace store: keyboard map, pick filter, and the
 * two-point compare diff (pure; jsdom for the editable-target checks).
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { RocketVehicle } from '../core/types';
import {
  FILTER_OPTIONS,
  STUDIOS,
  diffVehicles,
  isEditableTarget,
  matchesFilter,
  studioForKey,
  useWorkspaceStore,
} from './workspaceStore';

function vehicle(over: Partial<RocketVehicle> = {}): RocketVehicle {
  return {
    id: 'v1',
    name: 'Compare Vehicle',
    version: '1.0',
    author: 't',
    components: [
      { id: 'nc', name: 'Cone', type: 'nosecone', shape: 'ogive', length: 0.1, baseDiameter: 0.05, wallThickness: 0.002, isHollow: true, materialId: 'cardboard' },
      { id: 'bt', name: 'Tube', type: 'bodytube', length: 0.3, outerDiameter: 0.05, innerDiameter: 0.047, materialId: 'cardboard' },
      { id: 'fin', name: 'Fins', type: 'trapezoidfinset', finCount: 3, rootChord: 0.06, tipChord: 0.02, span: 0.04, sweepLength: 0.03, thickness: 0.002, crossSection: 'rounded', axialOffset: 0.2, materialId: 'cardboard' },
    ],
    ...over,
  };
}

describe('studio keyboard map', () => {
  it('lists five studios with digits 1–5 in shell order', () => {
    expect(STUDIOS.map((s) => s.id)).toEqual(['airframe', 'aero', 'propulsion', 'trajectory', 'evidence']);
    expect(STUDIOS.map((s) => s.key)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('maps digits to their studio and nothing else', () => {
    expect(studioForKey('1')).toBe('airframe');
    expect(studioForKey('5')).toBe('evidence');
    expect(studioForKey('6')).toBeNull();
    expect(studioForKey('a')).toBeNull();
  });

  it('never fires inside editable targets', () => {
    const input = document.createElement('input');
    const select = document.createElement('select');
    const button = document.createElement('button');
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(select)).toBe(true);
    expect(isEditableTarget(button)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('pick filter', () => {
  it('offers all filter families with stable labels', () => {
    expect(FILTER_OPTIONS.map((o) => o.id)).toEqual(['all', 'nosecone', 'bodytube', 'transition', 'fin', 'parachute', 'masscomponent']);
  });

  it('filters both fin-set record types under the fin family', () => {
    const fins = vehicle().components.find((c) => c.id === 'fin');
    expect(matchesFilter(fins!, 'fin')).toBe(true);
    expect(matchesFilter(fins!, 'all')).toBe(true);
    expect(matchesFilter(fins!, 'bodytube')).toBe(false);
  });
});

describe('two-point compare diff', () => {
  const patch = (base: RocketVehicle, id: string, changes: Record<string, unknown>): RocketVehicle => ({
    ...base,
    components: base.components.map((c) => (c.id === id ? { ...(c as unknown as Record<string, unknown>), ...changes } : c) as (typeof base.components)[0]),
  });

  it('reports added, removed, and modified component rows', () => {
    const base = vehicle();
    const next = patch(base, 'bt', { length: 0.35 });
    const rows = diffVehicles(next, base);
    expect(rows.filter((r) => r.kind === 'modified').map((r) => r.id)).toEqual(['bt']);
    // sanity: our next kept all three; produce a genuine added/removed pair:
    const added = patch(base, 'bt', {});
    const baseComp = base.components[0] as unknown as Record<string, unknown>;
    const addComp = { ...baseComp, id: 'nc2', name: 'Cone 2', baseDiameter: 0.06 };
    const withAdded: RocketVehicle = {
      ...added,
      components: [...added.components, addComp as (typeof added.components)[0]],
    };
    expect(diffVehicles(withAdded, base).filter((r) => r.kind === 'added').map((r) => r.id)).toEqual(['nc2']);
  });

  it('reports modified when saved state differs from current', () => {
    const base = vehicle();
    const next = patch(base, 'nc', { length: 0.15 });
    const rows = diffVehicles(next, base);
    expect(rows.find((r) => r.id === 'nc')?.kind).toBe('modified');
    expect(rows.find((r) => r.id === 'bt')).toBeUndefined();
    expect(rows.find((r) => r.id === 'fin')).toBeUndefined();
  });

  it('reports removal for components only in the saved state', () => {
    const base = vehicle();
    const next: RocketVehicle = { ...base, components: [base.components[0], base.components[2]] };
    const rows = diffVehicles(next, base);
    expect(rows.find((r) => r.id === 'bt')?.kind).toBe('removed');
  });

  it('returns no rows without a saved checkpoint', () => {
    expect(diffVehicles(vehicle(), null)).toEqual([]);
  });
});

describe('workspace store state', () => {
  beforeEach(() => {
    const ws = useWorkspaceStore.getState();
    ws.setFilter('all');
    ws.setScope('whole');
    ws.setCompareActive(false);
    ws.setCompareBlend(40);
  });

  it('clamps the compare blend into 0–100', () => {
    useWorkspaceStore.getState().setCompareBlend(150);
    expect(useWorkspaceStore.getState().compare.blend).toBe(100);
    useWorkspaceStore.getState().setCompareBlend(-5);
    expect(useWorkspaceStore.getState().compare.blend).toBe(0);
  });

  it('toggles compare activity and checkpoint', () => {
    useWorkspaceStore.getState().setCompareActive(true);
    expect(useWorkspaceStore.getState().compare.active).toBe(true);
    useWorkspaceStore.getState().setCompareCheckpoint(vehicle());
    expect(useWorkspaceStore.getState().compare.checkpoint?.id).toBe('v1');
  });
});