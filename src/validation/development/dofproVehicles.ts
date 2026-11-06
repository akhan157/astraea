import { aggregateVehicleMass } from '../../core/mass';
import type { MassComponent, RocketComponent, RocketVehicle } from '../../core/types';

export type DofproAirframe = 'top-shot' | 'adventurer';
export interface DryAggregate { massKg: number; cgM: number }
export interface AggregateReconstruction { vehicle: RocketVehicle; modeledMassScale: number }

// Published design declarations, not individual-flight weighings. Top Shot's
// page says 26 in CG; the primary reconstruction deliberately uses its ORK's
// 25 in, selected before examining flight outcomes. Both must remain disclosed.
export const DOFPRO_DRY_AGGREGATES: Record<DofproAirframe, DryAggregate> = {
  'top-shot': { massKg: 0.1955, cgM: 0.635 },
  adventurer: { massKg: 2.04, cgM: 0.92075 },
};

/**
 * Preserve the declared dry mass and first moment without pretending to know
 * internal mass distribution. Explicit component masses stay unchanged. When
 * material-derived estimates conflict with the aggregate, only those estimates
 * are uniformly rescaled; the reported scale is a representation assumption,
 * not a fit to a flight. A positive internal point load completes the aggregate.
 * The production engine still uses cylindrical dry inertia.
 * Normal project import remains fail-closed on stage aggregate overrides.
 */
export function reconcileStageAggregate(vehicle: RocketVehicle, target: DryAggregate): AggregateReconstruction {
  let components = vehicle.components;
  let shell = aggregateVehicleMass(vehicle);
  if (!(Number.isFinite(target.massKg) && target.massKg > 0 && Number.isFinite(target.cgM))) {
    throw new Error(`${vehicle.name}: declared aggregate leaves no positive internal residual mass`);
  }
  const length = 0.001; // Schematic point-load envelope, not measured packing geometry.
  const lo = length / 2;
  const hi = shell.totalLength - length / 2;
  let mass = target.massKg - shell.totalMass;
  let globalCg = (target.massKg * target.cgM - shell.totalMass * shell.cg) / mass;
  let modeledMassScale = 1;
  if (!(mass > 0 && globalCg >= lo && globalCg <= hi)) {
    const fixed = (part: RocketComponent) => part.massOverride !== undefined || part.type === 'masscomponent' || part.type === 'parachute';
    let fixedMass = 0; let fixedMoment = 0; let modeledMass = 0; let modeledMoment = 0;
    for (let i = 0; i < components.length; i++) {
      const part = shell.components[i];
      if (fixed(components[i])) { fixedMass += part.mass; fixedMoment += part.mass * part.globalCG; }
      else { modeledMass += part.mass; modeledMoment += part.mass * part.globalCG; }
    }
    const availableMass = target.massKg - fixedMass;
    const availableMoment = target.massKg * target.cgM - fixedMoment;
    if (!(availableMass > 0 && modeledMass > 0)) {
      throw new Error(`${vehicle.name}: declared aggregate leaves no positive internal residual mass`);
    }
    // Positive residual mass and its first moment bound the feasible scale.
    // Reserve half that budget for unresolved hardware rather than pinning the
    // point load on a geometric boundary. No flight samples enter this solve.
    modeledMassScale = 0.5 * Math.min(1, availableMass / modeledMass,
      (availableMoment - availableMass * lo) / (modeledMoment - modeledMass * lo),
      (availableMass * hi - availableMoment) / (modeledMass * hi - modeledMoment));
    if (!(Number.isFinite(modeledMassScale) && modeledMassScale > 0)) {
      throw new Error(`${vehicle.name}: declared aggregate requires internal mass outside the airframe`);
    }
    components = components.map((part, i) => fixed(part) ? part : {
      ...part, massOverride: shell.components[i].mass * modeledMassScale, cgOverride: shell.components[i].localCG,
    });
    shell = aggregateVehicleMass({ ...vehicle, components });
    mass = target.massKg - shell.totalMass;
    globalCg = (target.massKg * target.cgM - shell.totalMass * shell.cg) / mass;
  }
  if (!(mass > 0 && globalCg >= lo && globalCg <= hi)) {
    throw new Error(`${vehicle.name}: declared aggregate requires internal mass outside the airframe`);
  }
  if (vehicle.components[0]?.type !== 'nosecone') {
    throw new Error(`${vehicle.name}: aggregate reconstruction requires the declared nose-first outer chain`);
  }
  const residual: MassComponent = {
    id: `${vehicle.id}-internal-residual`, name: 'Unresolved internal mass (aggregate reconstruction)',
    type: 'masscomponent', materialId: 'cardboard', mass, length,
    // Before the first body tube, the canonical rollup's parent origin is zero.
    axialOffset: globalCg - length / 2,
  };
  const mapped = { ...vehicle, components: [components[0], residual, ...components.slice(1)] };
  const result = aggregateVehicleMass(mapped);
  if (Math.abs(result.totalMass - target.massKg) > 1e-9 || Math.abs(result.cg - target.cgM) > 1e-9 || result.components.some((part) => !(part.mass > 0))) {
    throw new Error(`${vehicle.name}: aggregate reconstruction did not conserve positive mass and first moment`);
  }
  return { vehicle: mapped, modeledMassScale };
}

/** Source-informed DEVELOPMENT reconstructions, not exact as-flown imports. */
export function dofproVehicle(kind: DofproAirframe, motorId: string): AggregateReconstruction {
  let components: RocketComponent[];
  if (kind === 'top-shot') {
    // ORK automatic fore-tube radius is resolved from the equal neighboring
    // nose/body radii; its cached manual 25 mm value is not the automatic radius.
    // ABS/cardboard are explicit material proxies for the source PS/paper.
    components = [
      { id: 'top-nose', name: 'Ogive nose', type: 'nosecone', materialId: 'abs_3dprint', shape: 'ogive', length: 0.23495, baseDiameter: 0.041656, wallThickness: 0.003175, isHollow: true },
      { id: 'top-forward', name: 'Forward tube', type: 'bodytube', materialId: 'cardboard', length: 0.14, outerDiameter: 0.041656, innerDiameter: 0.037656 },
      { id: 'top-main', name: 'Main tube', type: 'bodytube', materialId: 'cardboard', length: 0.499, outerDiameter: 0.041656, innerDiameter: 0.04064 },
      { id: 'top-aft', name: 'Aft tube', type: 'bodytube', materialId: 'abs_3dprint', length: 0.10795, outerDiameter: 0.041656, innerDiameter: 0.04064, isMotorMount: true, assignedMotorId: motorId },
      { id: 'top-fins', name: 'Molded freeform fins', type: 'freeformfinset', materialId: 'abs_3dprint', finCount: 4, thickness: 0.003175, crossSection: 'rounded', axialOffset: 0.00635, points: [{ x: 0, y: 0 }, { x: 0.0381, y: 0.0127 }, { x: 0.0889, y: 0.0635 }, { x: 0.1397, y: 0.0635 }, { x: 0.1016, y: 0 }] },
    ];
  } else {
    // Preserve published external-component mass/CG overrides. The malformed
    // source fin density (0.502255 kg/m³ for G10) is NOT treated as a weighing:
    // standard G10 is an explicit proxy, balanced only by the aggregate load.
    // Source tail is ogive; the supported conical transition is an explicitly
    // approximate reconstruction, so this case cannot establish exact-geometry validation.
    components = [
      { id: 'adv-nose', name: 'Haack C=0 nose', type: 'nosecone', materialId: 'fiberglass', shape: 'vonkarman', length: 0.33528, baseDiameter: 0.0575, wallThickness: 0.00254, isHollow: true, massOverride: 0.1365, cgOverride: 0.2032 },
      { id: 'adv-upper', name: 'Upper tube', type: 'bodytube', materialId: 'fiberglass', length: 0.4064, outerDiameter: 0.0575, innerDiameter: 0.055341, massOverride: 0.1693, cgOverride: 0.2032 },
      { id: 'adv-switch', name: 'Switch ring', type: 'bodytube', materialId: 'fiberglass', length: 0.0762, outerDiameter: 0.0575, innerDiameter: 0.055341, massOverride: 0.0316, cgOverride: 0.0381 },
      { id: 'adv-lower', name: 'Lower tube', type: 'bodytube', materialId: 'fiberglass', length: 0.8382, outerDiameter: 0.0575, innerDiameter: 0.055341, massOverride: 0.3457, cgOverride: 0.4191, isMotorMount: true, assignedMotorId: motorId },
      { id: 'adv-fins', name: 'Freeform fins (G10 proxy)', type: 'freeformfinset', materialId: 'fiberglass', finCount: 3, thickness: 0.0023622, crossSection: 'rounded', axialOffset: 0.57785, points: [{ x: 0, y: 0 }, { x: 0.153162, y: 0.0762 }, { x: 0.200025, y: 0.08255 }, { x: 0.230188, y: 0 }] },
      { id: 'adv-tail', name: 'Tail (conical approximation to source ogive)', type: 'transition', materialId: 'fiberglass', length: 0.0381, foreDiameter: 0.0575, aftDiameter: 0.0468376, wallThickness: 0.003175, isHollow: true, massOverride: 0.0748, cgOverride: 0.01905 },
    ];
  }
  return reconcileStageAggregate({ id: `dofpro-${kind}`, name: kind === 'top-shot' ? 'Estes Top Shot (conditional reconstruction)' : 'Madcow Adventurer (conditional reconstruction)', version: 'development-1', author: 'DOFPro source-informed development benchmark', components }, DOFPRO_DRY_AGGREGATES[kind]);
}
