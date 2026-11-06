import { aggregateVehicleMass } from '../../core/mass';
import type { RocketComponent, RocketVehicle } from '../../core/types';

const BODY_OD = 2 * 0.020447;
const BODY_ID = BODY_OD - 2 * 0.001143;
const NOSE_LEN = 0.1651;
const BODY_LEN = 0.2032 + 0.5588;
const FIN = { root: 0.137236, tip: 0.0382016, sweep: 0.0742696, span: 0.0429006, thickness: 0.0023368, aftGap: 0.00762 };
const NOSE_OVERRIDE = { mass: 0.173641, cg: 0.1778 };

export interface AirframeMass { mass: number; cg: number }

/** Mini DX3 geometry and solved body mass/CG from the existing development protocol. */
export function miniDx3(airframe: AirframeMass, motorId: string): RocketVehicle {
  const components = (tube: { mass: number; cg: number }): RocketComponent[] => [
    {
      id: 'dx3-nose', name: 'Ogive nose (ORK override)', type: 'nosecone', materialId: 'pla_3dprint',
      shape: 'ogive', length: NOSE_LEN, baseDiameter: BODY_OD, wallThickness: 0.00207518, isHollow: true,
      massOverride: NOSE_OVERRIDE.mass, cgOverride: NOSE_OVERRIDE.cg,
    } as RocketComponent,
    {
      id: 'dx3-body', name: 'Body (two equal-radius tubes)', type: 'bodytube', materialId: 'cardboard',
      length: BODY_LEN, outerDiameter: BODY_OD, innerDiameter: BODY_ID, isMotorMount: true, assignedMotorId: motorId,
      massOverride: tube.mass, cgOverride: tube.cg,
    } as RocketComponent,
    {
      id: 'dx3-fins', name: 'Plywood fins (3)', type: 'trapezoidfinset', materialId: 'plywood',
      finCount: 3, rootChord: FIN.root, tipChord: FIN.tip, span: FIN.span, sweepLength: FIN.sweep,
      thickness: FIN.thickness, crossSection: 'square', axialOffset: BODY_LEN - FIN.aftGap - FIN.root,
      massOverride: 1e-6, cgOverride: FIN.root / 2,
    } as RocketComponent,
  ];
  const probe = aggregateVehicleMass({ id: 'probe', name: 'probe', version: '1', author: 'v', components: components({ mass: 1e-6, cg: 0 }) });
  const others = probe.components.filter((c) => c.id !== 'dx3-body');
  const othersMass = others.reduce((sum, c) => sum + c.mass, 0);
  const othersMoment = others.reduce((sum, c) => sum + c.mass * c.globalCG, 0);
  const tubeMass = airframe.mass - othersMass;
  const tubeGlobalCg = (airframe.mass * airframe.cg - othersMoment) / tubeMass;
  const vehicle: RocketVehicle = {
    id: 'mini-dx3', name: 'Madcow Mini DX3 (DOFPro)', version: '1', author: 'flight validation',
    components: components({ mass: tubeMass, cg: tubeGlobalCg - NOSE_LEN }),
  };
  const check = aggregateVehicleMass(vehicle);
  if (Math.abs(check.totalMass - airframe.mass) > 1e-9 || Math.abs(check.cg - airframe.cg) > 1e-9) {
    throw new Error(`mass solve failed: ${check.totalMass} kg @ ${check.cg} m`);
  }
  return vehicle;
}
