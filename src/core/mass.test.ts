import { describe, it, expect } from 'vitest';
import { aggregateVehicleMass } from './mass';
import { RocketVehicle } from './types';

describe('Mass and CG Aggregator', () => {
  const baseRocket: RocketVehicle = {
    id: 'mass-test',
    name: 'Mass Test Vehicle',
    version: '1.0',
    author: 'Test',
    components: [
      {
        id: 'nc',
        name: 'Nosecone',
        type: 'nosecone',
        shape: 'conical',
        length: 0.2,          // 200mm
        baseDiameter: 0.05,   // 50mm
        wallThickness: 0.002, // 2mm
        isHollow: true,
        materialId: 'pla_3dprint', // 1250 kg/m^3
      },
      {
        id: 'bt',
        name: 'Body Tube',
        type: 'bodytube',
        length: 0.8,          // 800mm
        outerDiameter: 0.05,  // 50mm
        innerDiameter: 0.047, // 47mm (1.5mm wall)
        materialId: 'cardboard', // 680 kg/m^3
      },
    ],
  };

  it('aggregates total length and dimensions correctly', () => {
    const rollup = aggregateVehicleMass(baseRocket);
    expect(rollup.totalLength).toBeCloseTo(1.0, 3); // 200mm + 800mm = 1000mm
    expect(rollup.maxDiameter).toBeCloseTo(0.05, 3);
    expect(rollup.totalMass).toBeGreaterThan(0.05); // > 50 grams
    expect(rollup.cg).toBeGreaterThan(0.2); // CG is inside body tube
    expect(rollup.cg).toBeLessThan(1.0);
  });

  it('respects explicit massOverride values', () => {
    const overrideMass = 0.5; // 500 grams override
    const overriddenRocket: RocketVehicle = {
      ...baseRocket,
      components: [
        {
          ...baseRocket.components[0],
          massOverride: overrideMass,
        },
        baseRocket.components[1],
      ],
    };

    const rollup = aggregateVehicleMass(overriddenRocket);
    const ncResult = rollup.components.find((c) => c.id === 'nc');
    expect(ncResult?.mass).toBeCloseTo(overrideMass, 4);
    // CG should shift forward towards heavy nosecone
    const originalRollup = aggregateVehicleMass(baseRocket);
    expect(rollup.cg).toBeLessThan(originalRollup.cg);
  });
});
