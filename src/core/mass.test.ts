import { describe, it, expect } from 'vitest';
import { aggregateVehicleMass } from './mass';
import { RocketVehicle, NoseconeComponent } from './types';

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

describe('Mass fidelity: cone centroid, hollowing, and fail-closed geometry (Round-16 audit §4.3)', () => {
  const coneVehicle = (over: Partial<NoseconeComponent> = {}): RocketVehicle => ({
    id: 'cone-test',
    name: 'Cone Test Vehicle',
    version: '1.0',
    author: 'Test',
    components: [
      {
        id: 'nc',
        name: 'Nosecone',
        type: 'nosecone',
        shape: 'conical',
        length: 0.2,
        baseDiameter: 0.05,
        wallThickness: 0.002,
        isHollow: false,
        materialId: 'pla_3dprint',
        ...over,
      },
    ],
  });
  it('places the solid-cone centroid at 3L/4 from the tip, not the 2L/3 CP station', () => {
    const rollup = aggregateVehicleMass(coneVehicle());
    expect(rollup.components[0].localCG).toBeCloseTo(0.75 * 0.2, 12);
  });

  it('moves the hollow-shell centroid forward of the solid value', () => {
    const solid = aggregateVehicleMass(coneVehicle()).components[0];
    const hollow = aggregateVehicleMass(coneVehicle({ isHollow: true })).components[0];
    expect(hollow.mass).toBeLessThan(solid.mass);
    // Cavity seated at the base removes aft mass: shell CG moves forward.
    expect(hollow.localCG).toBeLessThan(solid.localCG);
    // Shell centroid is the volume-weighted remainder, inside the part.
    expect(hollow.localCG).toBeGreaterThan(0);
    expect(hollow.localCG).toBeLessThan(0.2);
  });

  it('rejects nonpositive/nonfinite structural dimensions instead of clamping nominal', () => {
    expect(() => aggregateVehicleMass(coneVehicle({ length: 0 }))).toThrow(/finite and positive/);
    expect(() => aggregateVehicleMass(coneVehicle({ baseDiameter: -0.01 }))).toThrow(/finite and positive/);
    expect(() => aggregateVehicleMass({
      id: 'bad', name: 'Bad', version: '1.0', author: 'Test',
      components: [{
        id: 'bt', name: 'Tube', type: 'bodytube', length: 0.5,
        outerDiameter: 0.05, innerDiameter: 0.05, materialId: 'cardboard',
      }],
    })).toThrow(/positive wall/);
    expect(() => aggregateVehicleMass({
      id: 'empty', name: 'Empty', version: '1.0', author: 'Test', components: [],
    })).toThrow(/no components/);
  });
});
