import { describe, it, expect } from 'vitest';
import { aggregateVehicleMass } from './mass';
import { RocketVehicle, NoseconeComponent, TrapezoidFinSetComponent, ParachuteComponent } from './types';

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
    expect(() => aggregateVehicleMass(coneVehicle({ wallThickness: -0.001, isHollow: true }))).toThrow(/wallThickness/);
    expect(() => aggregateVehicleMass(coneVehicle({ wallThickness: 0.05, isHollow: true }))).toThrow(/wallThickness/);
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

  it('rejects unknown materials, NaN offsets, and invalid fins/chutes', () => {
    const nanFin: TrapezoidFinSetComponent = {
      id: 'f', name: 'Fins', type: 'trapezoidfinset', finCount: 3,
      rootChord: 0.07, tipChord: 0.028, span: 0.051, sweepLength: 0.038,
      thickness: 0.002, crossSection: 'rounded', materialId: 'balsa', axialOffset: Number.NaN,
    };
    expect(() => aggregateVehicleMass({
      id: 'nanoff', name: 'NanOff', version: '1.0', author: 'Test',
      components: [coneVehicle().components[0], nanFin],
    })).toThrow(/axialOffset must be finite/);
    const badFin: TrapezoidFinSetComponent = {
      id: 'f', name: 'Fins', type: 'trapezoidfinset', finCount: 0,
      rootChord: 0.07, tipChord: 0.028, span: 0.051, sweepLength: 0.038,
      thickness: 0.002, crossSection: 'rounded', materialId: 'balsa', axialOffset: 0.2,
    };
    expect(() => aggregateVehicleMass({
      id: 'badfin', name: 'BadFin', version: '1.0', author: 'Test',
      components: [coneVehicle().components[0], badFin],
    })).toThrow(/finCount must be a positive integer/);
    const badChute: ParachuteComponent = {
      id: 'p', name: 'Chute', type: 'parachute', mass: 0.008,
      diameter: -0.3, cd: 0.8, materialId: 'cardboard', axialOffset: 0.05,
    };
    expect(() => aggregateVehicleMass({
      id: 'badchute', name: 'BadChute', version: '1.0', author: 'Test',
      components: [coneVehicle().components[0], badChute],
    })).toThrow(/diameter.*finite and positive/);
  });
});
