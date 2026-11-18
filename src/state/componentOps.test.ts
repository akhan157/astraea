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

/**
 * Plan #8: a new part joins the rocket it is added to. Before this, every new
 * fin set sat 250 mm from its tube's front whatever the tube's length, and a new
 * tube or nose took the reference diameter even when it followed a different
 * one.
 */
describe('new parts fit their neighbours', () => {
  const added = (components: readonly RocketComponent[], type: Parameters<typeof addComponentOp>[1], ref = 0.05): RocketComponent => {
    const op = addComponentOp(components, type, ref);
    if (!op.ok) throw new Error(op.reason);
    return op.components[op.components.length - 1];
  };
  const LONG: BodyTubeComponent = { id: 'long', name: 'Long', type: 'bodytube', length: 0.9, outerDiameter: 0.098, innerDiameter: 0.094, materialId: 'cardboard' };
  const NOSE: RocketComponent = { id: 'nose', name: 'Nose', type: 'nosecone', shape: 'ogive', length: 0.3, baseDiameter: 0.098, wallThickness: 0.002, isHollow: true, materialId: 'pla_3dprint' };

  it('puts every fin type flush with the aft end of its parent tube', () => {
    const vehicle = [NOSE, LONG];
    for (const type of ['trapezoidfinset', 'ellipticalfinset', 'freeformfinset'] as const) {
      const fin = added(vehicle, type);
      if (!('axialOffset' in fin)) throw new Error('fin has no offset');
      // Root chord 0.1 m on a 0.9 m tube: the root trailing edge meets the aft end.
      expect(fin.axialOffset).toBeCloseTo(0.8, 9);
    }
    // The parent is the last tube before the new part, not the first one.
    const fin = added([NOSE, TUBE('short'), LONG], 'trapezoidfinset');
    expect('axialOffset' in fin && fin.axialOffset).toBeCloseTo(0.8, 9);
  });

  it('never gives a fin a negative offset on a tube shorter than its root chord', () => {
    const stub: BodyTubeComponent = { ...LONG, id: 'stub', length: 0.06 };
    const fin = added([NOSE, stub], 'trapezoidfinset');
    expect('axialOffset' in fin && fin.axialOffset).toBe(0);
  });

  it('matches a new body tube to the part before it and copies the tube wall', () => {
    const tube = added([NOSE, LONG], 'bodytube', 0.05) as BodyTubeComponent;
    expect(tube.outerDiameter).toBeCloseTo(0.098, 9);
    expect(tube.innerDiameter).toBeCloseTo(0.094, 9);
    // After a transition, the tube follows the transition's aft end; fins and
    // chutes in between are not hull and do not count.
    const boattail: RocketComponent = { id: 'tr', name: 'Shoulder', type: 'transition', length: 0.05, foreDiameter: 0.098, aftDiameter: 0.054, wallThickness: 0.002, isHollow: true, materialId: 'aluminum' };
    const fins = added([NOSE, LONG], 'trapezoidfinset');
    const after = added([NOSE, LONG, boattail, fins], 'bodytube', 0.098) as BodyTubeComponent;
    expect(after.outerDiameter).toBeCloseTo(0.054, 9);
    // Behind only a nose cone, the starter wall applies.
    const first = added([NOSE], 'bodytube', 0.05) as BodyTubeComponent;
    expect(first.outerDiameter).toBeCloseTo(0.098, 9);
    expect(first.innerDiameter).toBeCloseTo(0.095, 9);
  });

  it('matches a new nose cone to the first tube and a transition to the part before it', () => {
    const nose = added([LONG, TUBE('aft')], 'nosecone', 0.05);
    expect(nose.type === 'nosecone' && nose.baseDiameter).toBeCloseTo(0.098, 9);
    const transition = added([NOSE, LONG], 'transition', 0.05);
    expect(transition.type === 'transition' && transition.foreDiameter).toBeCloseTo(0.098, 9);
  });

  it('places a new parachute or mass item inside its parent tube', () => {
    for (const type of ['parachute', 'masscomponent'] as const) {
      // A roomy tube keeps the starter's 50 mm from its front.
      const roomy = added([NOSE, LONG], type);
      expect('axialOffset' in roomy && roomy.axialOffset).toBeCloseTo(0.05, 9);
      // A 70 mm tube cannot hold a 50 mm pack at 50 mm: it is pulled forward to end at the aft end.
      const tight = added([NOSE, { ...LONG, id: 'tight', length: 0.07 }], type);
      expect('axialOffset' in tight && tight.axialOffset).toBeCloseTo(0.02, 9);
    }
    // The packed envelope stays unknown: the type promises it is user-entered.
    const chute = added([NOSE, LONG], 'parachute');
    expect(chute.type === 'parachute' && chute.packedDiameterM).toBeUndefined();
    expect(chute.type === 'parachute' && chute.packedLengthM).toBeUndefined();
  });

  it('keeps the reference-diameter starter when there is no neighbour to follow', () => {
    expect(added([], 'bodytube', 0.054)).toEqual(defaultComponent('bodytube', 'bodytube-1', 0.054));
    expect(added([], 'trapezoidfinset', 0.054)).toEqual(defaultComponent('trapezoidfinset', 'trapezoidfinset-1', 0.054));
    expect(added([], 'parachute', 0.054)).toEqual(defaultComponent('parachute', 'parachute-1', 0.054));
  });

  it('keeps the add contract: one appended part, selected, nothing else touched', () => {
    const before = [NOSE, LONG];
    const op = addComponentOp(before, 'trapezoidfinset', 0.05);
    expect(op.ok).toBe(true);
    if (!op.ok) return;
    expect(op.components.slice(0, 2)).toEqual(before);
    expect(op.components).toHaveLength(3);
    expect(op.selectId).toBe('trapezoidfinset-1');
  });
});
