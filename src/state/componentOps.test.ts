/**
 * Pure component operations for the parts tree: add / remove / reorder, with
 * refusals that name why. The store wrapper is tested in the Console slice
 * (`src/console/componentActions.test.ts`).
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { BodyTubeComponent, RocketComponent } from '../core/types';
import {
  ADDABLE_COMPONENTS,
  addComponentOp,
  defaultComponent,
  moveComponentOp,
  nextComponentId,
  removeComponentOp,
} from './componentOps';

const TUBE = (id: string): BodyTubeComponent => ({ id, name: `Tube ${id}`, type: 'bodytube', length: 0.3, outerDiameter: 0.05, innerDiameter: 0.047, materialId: 'cardboard' });

const COMPONENTS: RocketComponent[] = [
  { id: 'nosecone-1', name: 'Nose', type: 'nosecone', shape: 'ogive', length: 0.15, baseDiameter: 0.05, wallThickness: 0.002, isHollow: true, materialId: 'pla_3dprint', color: '#fff' },
  TUBE('bodytube-1'),
  { id: 'trapezoidfinset-1', name: 'Fins', type: 'trapezoidfinset', finCount: 3, rootChord: 0.1, tipChord: 0.04, span: 0.06, sweepLength: 0.04, thickness: 0.003, crossSection: 'rounded', axialOffset: 0.25, materialId: 'plywood', color: '#fff' },
];

describe('pure component operations', () => {
  it('offers every addable component type', () => {
    expect(ADDABLE_COMPONENTS.map((c) => c.type)).toEqual([
      'nosecone',
      'bodytube',
      'transition',
      'trapezoidfinset',
      'ellipticalfinset',
      'freeformfinset',
      'parachute',
      'masscomponent',
    ]);
  });

  it('picks the smallest free id and sizes new parts from the reference diameter', () => {
    expect(nextComponentId(COMPONENTS, 'bodytube')).toBe('bodytube-2');
    expect(nextComponentId([TUBE('bodytube-2'), TUBE('bodytube-1')], 'bodytube')).toBe('bodytube-3');

    const tube = defaultComponent('bodytube', 'x', 0.054) as BodyTubeComponent;
    expect(tube.outerDiameter).toBeCloseTo(0.054, 9);
    expect(tube.innerDiameter).toBeCloseTo(0.051, 9);
    // A vehicle with no reference diameter still yields a printable part.
    expect((defaultComponent('bodytube', 'y', 0) as BodyTubeComponent).outerDiameter).toBeCloseTo(0.05, 9);
  });

  it('appends a part and refuses an unknown type', () => {
    const op = addComponentOp(COMPONENTS, 'bodytube', 0.05);
    expect(op.ok).toBe(true);
    if (!op.ok) return;
    expect(op.components).toHaveLength(4);
    expect(op.components[3].id).toBe('bodytube-2');
    expect(op.selectId).toBe('bodytube-2');

    expect(addComponentOp(COMPONENTS, 'grain' as never, 0.05)).toEqual({ ok: false, reason: `Unknown component type 'grain'.` });
  });

  it('removes a part, refusing the last one and unknown ids', () => {
    const op = removeComponentOp(COMPONENTS, 'bodytube-1', 'bodytube-1');
    expect(op.ok).toBe(true);
    if (!op.ok) return;
    expect(op.components.map((c) => c.id)).toEqual(['nosecone-1', 'trapezoidfinset-1']);
    // The selection moves to the part that took the removed one's place.
    expect(op.selectId).toBe('trapezoidfinset-1');

    const kept = removeComponentOp(COMPONENTS, 'bodytube-1', 'nosecone-1');
    expect(kept.ok && kept.selectId).toBe('nosecone-1');

    expect(removeComponentOp([TUBE('only')], 'only', 'only')).toEqual({
      ok: false,
      reason: 'A vehicle needs at least one part; add another before removing this one.',
    });
    expect(removeComponentOp(COMPONENTS, 'nope', null)).toEqual({ ok: false, reason: 'That part no longer exists.' });
  });

  it('moves a part one step and refuses both ends', () => {
    const down = moveComponentOp(COMPONENTS, 'nosecone-1', 1);
    expect(down.ok && down.components.map((c) => c.id)).toEqual(['bodytube-1', 'nosecone-1', 'trapezoidfinset-1']);

    expect(moveComponentOp(COMPONENTS, 'nosecone-1', -1)).toEqual({ ok: false, reason: 'That part is already first.' });
    expect(moveComponentOp(COMPONENTS, 'trapezoidfinset-1', 1)).toEqual({ ok: false, reason: 'That part is already last.' });
  });
});
