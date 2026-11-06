import { describe, expect, it } from 'vitest';
import { aggregateVehicleMass } from '../../core/mass';
import type { RocketVehicle } from '../../core/types';
import { dofproVehicle, DOFPRO_DRY_AGGREGATES, reconcileStageAggregate, type DofproAirframe } from './dofproVehicles';

function shell(): RocketVehicle {
  return {
    id: 'aggregate-fixture', name: 'Aggregate fixture', version: '1', author: 'test',
    components: [
      { id: 'nose', name: 'Nose', type: 'nosecone', materialId: 'cardboard', shape: 'ogive', length: 0.1, baseDiameter: 0.04, wallThickness: 0.001, isHollow: true, massOverride: 0.02, cgOverride: 0.03 },
      { id: 'tube', name: 'Tube', type: 'bodytube', materialId: 'cardboard', length: 0.4, outerDiameter: 0.04, innerDiameter: 0.038, massOverride: 0.05, cgOverride: 0.2 },
      { id: 'fins', name: 'Fins', type: 'freeformfinset', materialId: 'balsa', finCount: 3, thickness: 0.001, axialOffset: 0.3, crossSection: 'square', points: [{ x: 0, y: 0 }, { x: 0.03, y: 0.02 }, { x: 0.04, y: 0 }] },
    ],
  };
}

describe('development aggregate reconstruction', () => {
  it('conserves requested mass and first moment without moving external geometry or changing known masses', () => {
    const original = shell();
    const before = aggregateVehicleMass(original);
    const target = { massKg: 0.15, cgM: 0.27 };
    const after = aggregateVehicleMass(reconcileStageAggregate(original, target).vehicle);
    expect(after.totalMass).toBeCloseTo(target.massKg, 12);
    expect(after.components.reduce((moment, part) => moment + part.mass * part.globalCG, 0)).toBeCloseTo(target.massKg * target.cgM, 12);
    expect(after.totalLength).toBe(before.totalLength);
    for (const part of before.components) {
      const mapped = after.components.find((candidate) => candidate.id === part.id)!;
      expect(mapped.mass).toBe(part.mass);
      expect(mapped.axialStart).toBe(part.axialStart);
      expect(mapped.globalCG).toBe(part.globalCG);
    }
    const residual = after.components.find((part) => !before.components.some((old) => old.id === part.id))!;
    expect(residual.mass).toBeGreaterThan(0);
    expect(residual.globalCG).toBeGreaterThan(0);
    expect(residual.globalCG).toBeLessThan(before.totalLength);
  });

  it('reconciles unweighed mass estimates without rescaling an explicit component mass', () => {
    const original = shell();
    delete original.components[1].massOverride;
    const before = aggregateVehicleMass(original);
    const target = { massKg: before.totalMass * 1.02, cgM: before.totalLength * 0.6 };
    const reconstruction = reconcileStageAggregate(original, target);
    const after = aggregateVehicleMass(reconstruction.vehicle);
    expect(reconstruction.modeledMassScale).toBeGreaterThan(0);
    expect(reconstruction.modeledMassScale).toBeLessThan(1);
    expect(after.totalMass).toBeCloseTo(target.massKg, 12);
    expect(after.cg).toBeCloseTo(target.cgM, 12);
    for (let i = 0; i < original.components.length; i++) {
      const part = before.components[i];
      const mapped = after.components.find((candidate) => candidate.id === part.id)!;
      expect(mapped.globalCG).toBe(part.globalCG);
      expect(mapped.axialStart).toBe(part.axialStart);
      const expectedScale = original.components[i].massOverride === undefined ? reconstruction.modeledMassScale : 1;
      expect(mapped.mass / part.mass).toBeCloseTo(expectedScale, 12);
    }
  });

  it('refuses aggregates requiring negative internal mass or a load outside the airframe', () => {
    expect(() => reconcileStageAggregate(shell(), { massKg: 0.06, cgM: 0.27 })).toThrow(/no positive internal residual mass/);
    expect(() => reconcileStageAggregate(shell(), { massKg: 0.15, cgM: 2 })).toThrow(/outside the airframe/);
    expect(() => reconcileStageAggregate(shell(), { massKg: Number.NaN, cgM: 0.27 })).toThrow(/no positive internal residual mass/);
  });

  const airframes: DofproAirframe[] = ['top-shot', 'adventurer'];
  for (const kind of airframes) {
    it(`${kind} carries its declared dry aggregate with positive component masses`, () => {
      const target = DOFPRO_DRY_AGGREGATES[kind];
      const { vehicle } = dofproVehicle(kind, 'fixture-motor');
      const rollup = aggregateVehicleMass(vehicle);
      expect(rollup.totalMass).toBeCloseTo(target.massKg, 10);
      expect(rollup.cg).toBeCloseTo(target.cgM, 10);
      for (const part of rollup.components) expect(part.mass).toBeGreaterThan(0);
      const residual = rollup.components.find((part) => part.id.endsWith('-internal-residual'))!;
      expect(residual.globalCG).toBeGreaterThan(0);
      expect(residual.globalCG).toBeLessThan(rollup.totalLength);
    });
  }
});
