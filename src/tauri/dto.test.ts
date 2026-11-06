import { describe, expect, it } from 'vitest';
import type { RocketVehicle } from '../core/types';
import { componentDto, vehicleDto } from './dto';

const VEHICLE: RocketVehicle = {
  id: 'v-1',
  name: 'Design Inputs',
  version: '1.0',
  author: 'Test Rig',
  surfaceFinish: 'Smooth Paint',
  forceTurbulentFlow: true,
  nozzleExitDiameter: 0.018,
  components: [
    {
      id: 'bt-1',
      name: 'Tube',
      type: 'bodytube',
      materialId: 'cardboard',
      length: 0.5,
      outerDiameter: 0.1,
      innerDiameter: 0.095,
      railGuideDiameter: 0.006,
      railGuideHeight: 0.004,
      launchLugDiameter: 0.008,
      launchShoeArea: 0.0009,
    },
    {
      id: 'fin-1',
      name: 'Fins',
      type: 'trapezoidfinset',
      materialId: 'balsa',
      finCount: 3,
      rootChord: 0.08,
      tipChord: 0.04,
      span: 0.05,
      sweepLength: 0.01,
      thickness: 0.003,
      crossSection: 'airfoil',
      axialOffset: 0.42,
      airfoilSection: 'Subsonic NACA',
      leadingEdgeBevel: 0.001,
      trailingEdgeBevel: 0.0005,
      leadingEdgeRadius: 0.0008,
    },
  ],
};

describe('dto vehicle projection', () => {
  it('forwards the vehicle-level design inputs when defined', () => {
    expect(vehicleDto(VEHICLE)).toEqual({
      components: [
        componentDto(VEHICLE.components[0]),
        componentDto(VEHICLE.components[1]),
      ],
      surfaceFinish: 'Smooth Paint',
      forceTurbulentFlow: true,
      nozzleExitDiameter: 0.018,
    });
  });

  it('omits undefined vehicle-level design inputs instead of emitting the keys', () => {
    const dto = vehicleDto({
      ...VEHICLE,
      surfaceFinish: undefined,
      forceTurbulentFlow: undefined,
      nozzleExitDiameter: undefined,
    });
    expect('surfaceFinish' in dto).toBe(false);
    expect('forceTurbulentFlow' in dto).toBe(false);
    expect('nozzleExitDiameter' in dto).toBe(false);
  });

  it('retains every component field through the rest projection', () => {
    expect(componentDto(VEHICLE.components[0])).toMatchObject({
      railGuideDiameter: 0.006,
      railGuideHeight: 0.004,
      launchLugDiameter: 0.008,
      launchShoeArea: 0.0009,
    });
    expect(componentDto(VEHICLE.components[1])).toMatchObject({
      airfoilSection: 'Subsonic NACA',
      leadingEdgeBevel: 0.001,
      trailingEdgeBevel: 0.0005,
      leadingEdgeRadius: 0.0008,
    });
  });
});
