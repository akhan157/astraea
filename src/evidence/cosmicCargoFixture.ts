/**
 * Cosmic Cargo (Altimeter Cloud #2986) as the flight-validation record models
 * it: BT-50 envelope body on the recorded Estes C6, estimated fin planform, and
 * the recorded pad conditions. Shared by the calibration tests; the geometry is
 * an estimate (see docs/flight-validation/README.md), so nothing built on it is
 * independent validation.
 */
import type { RocketVehicle, RocketComponent } from '../core/types';

export const COSMIC_CARGO_RECORDED_APOGEE_M = 291.74;
/** Reference diameter of the BT-50 body, m. */
export const COSMIC_CARGO_DIAMETER_M = 0.0254;

/** BT-50 envelope body on the recorded motor; fin geometry is an estimate. */
export function cosmicCargoLike(): RocketVehicle {
  const components: RocketComponent[] = [
    {
      id: 'cc-nc',
      name: 'Ogive Nosecone',
      type: 'nosecone',
      materialId: 'pla_3dprint',
      color: '#14b8a6',
      shape: 'ogive',
      length: 0.07,
      baseDiameter: 0.0254,
      wallThickness: 0.0015,
      isHollow: true,
    } as RocketComponent,
    {
      id: 'cc-bt',
      name: 'Main Body Tube (BT-50)',
      type: 'bodytube',
      materialId: 'cardboard',
      color: '#ffffff',
      length: 0.28,
      outerDiameter: 0.0254,
      innerDiameter: 0.0241,
      isMotorMount: true,
      assignedMotorId: 'estes_c6',
    } as RocketComponent,
    {
      id: 'cc-fins',
      name: 'Molded Fins (3-Fin)',
      type: 'trapezoidfinset',
      materialId: 'pla_3dprint',
      color: '#14b8a6',
      finCount: 3,
      rootChord: 0.06,
      tipChord: 0.024,
      span: 0.045,
      sweepLength: 0.03,
      thickness: 0.002,
      crossSection: 'rounded',
      axialOffset: 0.24,
    } as RocketComponent,
    {
      id: 'cc-chute',
      name: '12" Parachute',
      type: 'parachute',
      materialId: 'cardboard',
      diameter: 0.305,
      cd: 0.8,
      mass: 0.008,
      axialOffset: 0.05,
    } as RocketComponent,
  ];
  return {
    id: 'cosmic-cargo-like',
    name: 'Cosmic Cargo (estimated)',
    version: '1.0',
    author: 'flight validation',
    components,
  };
}

/** Recorded pad altitude/angle; rail length and calm wind remain assumptions. */
export const COSMIC_CARGO_CONDITIONS = {
  launchAltitudeASL: 10, // site ground level, recorded
  railElevationDeg: 88.84, // 90 - recorded rail angle 1.16 deg
  railLength: 0.91, // Estes Porta-Pad II 3 ft rod (1/8 in), estimated
  windSpeedSurface: 0, // launch conditions not recorded on the flight page
  mainDeployAltitudeAGL: 150,
};
