/**
 * Part-tree selection filter: type families with counts, fin-set grouping,
 * and the three-state pick where action-needed outranks selected.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { RocketComponent } from '../core/types';
import type { MountAssessment } from '../application/caseResolver';
import { FILTER_OPTIONS, familyCounts, filterFamily, matchesFilter, pickStateFor } from './selection';

const nose = (id: string): RocketComponent => ({ id, name: 'Nose', type: 'nosecone', shape: 'ogive', length: 0.15, baseDiameter: 0.05, wallThickness: 0.002, isHollow: true, materialId: 'pla_3dprint', color: '#fff' });
const tube = (id: string, isMotorMount?: boolean): RocketComponent => ({ id, name: 'Tube', type: 'bodytube', length: 0.3, outerDiameter: 0.05, innerDiameter: 0.047, isMotorMount, materialId: 'cardboard' });
const trap = (id: string): RocketComponent => ({ id, name: 'Trap fins', type: 'trapezoidfinset', finCount: 3, rootChord: 0.1, tipChord: 0.04, span: 0.06, sweepLength: 0.04, thickness: 0.003, crossSection: 'rounded', axialOffset: 0.25, materialId: 'plywood', color: '#fff' });
const ellip = (id: string): RocketComponent => ({ id, name: 'Elliptical fins', type: 'ellipticalfinset', finCount: 3, rootChord: 0.1, span: 0.06, thickness: 0.003, axialOffset: 0.25, materialId: 'plywood', color: '#fff' });

const OK: MountAssessment = { mounts: [], boreM: null, solidMount: false, ambiguous: false };
const AMBIGUOUS: MountAssessment = { mounts: [tube('t1') as never, tube('t2') as never], boreM: null, solidMount: false, ambiguous: true };

describe('selection filter families', () => {
  it('offers every family with a stable id', () => {
    expect(FILTER_OPTIONS.map((o) => o.id)).toEqual(['all', 'nosecone', 'bodytube', 'transition', 'fin', 'parachute', 'masscomponent']);
  });

  it('groups both fin-set record types under one family', () => {
    expect(filterFamily('trapezoidfinset')).toBe('fin');
    expect(filterFamily('ellipticalfinset')).toBe('fin');
    expect(matchesFilter(trap('a'), 'fin')).toBe(true);
    expect(matchesFilter(ellip('b'), 'fin')).toBe(true);
    expect(matchesFilter(trap('a'), 'all')).toBe(true);
    expect(matchesFilter(trap('a'), 'bodytube')).toBe(false);
  });

  it('counts each family, folding both fin-set types into one bucket', () => {
    const counts = familyCounts([nose('n'), tube('t1'), trap('f1'), ellip('f2')]);
    expect(counts).toEqual({ all: 4, nosecone: 1, bodytube: 1, transition: 0, fin: 2, parachute: 0, masscomponent: 0 });
  });
});

describe('three-state pick', () => {
  it('marks a flagged mount ambiguous or solid as action-needed', () => {
    expect(pickStateFor(tube('t1', true), null, AMBIGUOUS)).toBe('action-needed');
    expect(pickStateFor(tube('t1', true), null, { ...OK, solidMount: true })).toBe('action-needed');
  });

  it('keeps action-needed when the row is also the selection', () => {
    // Selection never suppresses the repair state.
    expect(pickStateFor(tube('t1', true), 't1', AMBIGUOUS)).toBe('action-needed');
  });

  it('marks the selection selected and everything else candidate', () => {
    expect(pickStateFor(nose('n'), 'n', OK)).toBe('selected');
    expect(pickStateFor(tube('t1', true), 'n', OK)).toBe('candidate');
    // An unflagged tube is never action-needed, even with an ambiguous mount set.
    expect(pickStateFor(tube('t1', false), null, AMBIGUOUS)).toBe('candidate');
  });
});
