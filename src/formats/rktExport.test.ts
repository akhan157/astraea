import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { exportRkt, UnsupportedRktComponentError } from './rktExport';
import { parseRktString } from './rktParser';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import type {
  RocketVehicle,
  RocketComponent,
  BodyTubeComponent,
} from '../core/types';

/**
 * Round-trip comparison: the .rkt format carries geometry and mass only —
 * ids, materialId, and color are not serialized, so the comparison strips
 * them and checks every physical field the format preserves.
 */
function physicalFields(comp: RocketComponent): Record<string, unknown> {
  switch (comp.type) {
    case 'nosecone':
      return {
        name: comp.name,
        type: comp.type,
        shape: comp.shape,
        length: comp.length,
        baseDiameter: comp.baseDiameter,
        wallThickness: comp.wallThickness,
        isHollow: comp.isHollow,
      };
    case 'bodytube':
      return {
        name: comp.name,
        type: comp.type,
        length: comp.length,
        outerDiameter: comp.outerDiameter,
        innerDiameter: comp.innerDiameter,
        isMotorMount: comp.isMotorMount === true,
        assignedMotorId: comp.assignedMotorId,
      };
    case 'transition':
      return {
        name: comp.name,
        type: comp.type,
        length: comp.length,
        foreDiameter: comp.foreDiameter,
        aftDiameter: comp.aftDiameter,
        wallThickness: comp.wallThickness,
        isHollow: comp.isHollow,
      };
    case 'trapezoidfinset':
      return {
        name: comp.name,
        type: comp.type,
        finCount: comp.finCount,
        rootChord: comp.rootChord,
        tipChord: comp.tipChord,
        span: comp.span,
        sweepLength: comp.sweepLength,
        thickness: comp.thickness,
        crossSection: comp.crossSection,
        axialOffset: comp.axialOffset,
      };
    case 'masscomponent':
      return {
        name: comp.name,
        type: comp.type,
        mass: comp.mass,
        length: comp.length,
        axialOffset: comp.axialOffset,
      };
    case 'parachute':
      return {
        name: comp.name,
        type: comp.type,
        diameter: comp.diameter,
        cd: comp.cd,
        mass: comp.mass,
        axialOffset: comp.axialOffset,
      };
    default:
      return { type: comp.type };
  }
}

function expectPhysicalEqual(source: RocketComponent, roundTripped: RocketComponent): void {
  const s = physicalFields(source);
  const r = physicalFields(roundTripped);
  for (const [key, expected] of Object.entries(s)) {
    const actual = r[key];
    if (typeof expected === 'number' && typeof actual === 'number') {
      expect(actual, `field ${key} of ${source.name}`).toBeCloseTo(expected, 9);
    } else {
      expect(actual, `field ${key} of ${source.name}`).toEqual(expected);
    }
  }
}

describe('RockSim (.rkt) export', () => {
  it('round-trips the Estes Alpha preset through import(export(v)) preserving every physical field', () => {
    const xml = exportRkt(PRESET_ESTES_ALPHA);
    const vehicle = parseRktString(xml);

    expect(vehicle.name).toBe(PRESET_ESTES_ALPHA.name);
    expect(vehicle.author).toBe(PRESET_ESTES_ALPHA.author);
    expect(vehicle.components.length).toBe(PRESET_ESTES_ALPHA.components.length);

    PRESET_ESTES_ALPHA.components.forEach((source, i) => {
      expectPhysicalEqual(source, vehicle.components[i]);
    });
  });

  it('carries the motor mount flag and assigned motor reference through the round trip', () => {
    const tube = PRESET_ESTES_ALPHA.components.find((c) => c.type === 'bodytube') as BodyTubeComponent;
    const withMotor: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      id: 'alpha-with-motor',
      components: PRESET_ESTES_ALPHA.components.map((c) =>
        c.type === 'bodytube' ? { ...tube, id: c.id, assignedMotorId: 'estes_c6' } : c,
      ),
    };

    const vehicle = parseRktString(exportRkt(withMotor));
    const roundTripped = vehicle.components.find((c) => c.type === 'bodytube') as BodyTubeComponent;
    expect(roundTripped.isMotorMount).toBe(true);
    expect(roundTripped.assignedMotorId).toBe('estes_c6');
  });

  it('round-trips transitions and multi-tube vehicles, attaching parts to the last body tube', () => {
    // Two tubes split by a transition; fins/chute attach to the second tube,
    // mirroring how the importer's traverseAttached locates them. All values
    // are chosen to be exactly representable in .rkt units.
    //
    // The importer groups stage children by tag, so it emits both body tubes
    // (with their attached parts) before the transition regardless of XML
    // order; assert value fidelity and type coverage, not that ordering.
    const multiTube: RocketVehicle = {
      id: 'multi-tube',
      name: 'Multi-Tube Test',
      version: '1.0',
      author: 'Astraea Test',
      components: [
        {
          id: 'm-nc',
          name: 'Nose',
          type: 'nosecone',
          shape: 'ogive',
          length: 0.1,
          baseDiameter: 0.03,
          wallThickness: 0.002,
          isHollow: true,
          materialId: 'pla_3dprint',
        },
        {
          id: 'm-bt1',
          name: 'Forward Tube',
          type: 'bodytube',
          length: 0.2,
          outerDiameter: 0.03,
          innerDiameter: 0.028,
          materialId: 'cardboard',
        },
        {
          id: 'm-tr',
          name: 'Boat Tail',
          type: 'transition',
          length: 0.05,
          foreDiameter: 0.03,
          aftDiameter: 0.024,
          wallThickness: 0.002,
          isHollow: true,
          materialId: 'cardboard',
        },
        {
          id: 'm-bt2',
          name: 'Aft Tube',
          type: 'bodytube',
          length: 0.3,
          outerDiameter: 0.024,
          innerDiameter: 0.022,
          isMotorMount: true,
          assignedMotorId: 'estes_c6',
          materialId: 'cardboard',
        },
        {
          id: 'm-fins',
          name: 'Fins',
          type: 'trapezoidfinset',
          finCount: 3,
          rootChord: 0.06,
          tipChord: 0.02,
          span: 0.04,
          sweepLength: 0.03,
          thickness: 0.002,
          crossSection: 'rounded',
          axialOffset: 0.24,
          materialId: 'plywood',
        },
        {
          id: 'm-chute',
          name: 'Chute',
          type: 'parachute',
          diameter: 0.25,
          cd: 0.8,
          mass: 0.01,
          axialOffset: 0.05,
          materialId: 'cardboard',
        },
      ],
    };

    const vehicle = parseRktString(exportRkt(multiTube));
    expect(vehicle.components.length).toBe(multiTube.components.length);
    const types = (arr: RocketComponent[]) => arr.map((c) => c.type).sort();
    expect(types(vehicle.components)).toEqual(types(multiTube.components));
    // Every source component must come back with identical physical fields
    // (matched by name; names are unique in this fixture).
    for (const source of multiTube.components) {
      const roundTripped = vehicle.components.find((c) => c.name === source.name);
      expect(roundTripped, `missing round-tripped ${source.name}`).toBeDefined();
      if (roundTripped) expectPhysicalEqual(source, roundTripped);
    }
  });

  it('fails closed on unsupported component types, listing the component', () => {
    const unsupported: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      id: 'alpha-with-elliptical-fins',
      components: [
        ...PRESET_ESTES_ALPHA.components,
        {
          id: 'bad-efs',
          name: 'Elliptical Fins',
          type: 'ellipticalfinset',
          finCount: 3,
          rootChord: 0.07,
          span: 0.05,
          thickness: 0.002,
          axialOffset: 0.24,
          materialId: 'plywood',
        },
      ],
    };

    expect(() => exportRkt(unsupported)).toThrow(UnsupportedRktComponentError);
    expect(() => exportRkt(unsupported)).toThrow(/Elliptical Fins/);
    expect(() => exportRkt(unsupported)).toThrow(/ellipticalfinset/);
  });

  it('emits well-formed RockSim XML when parsed by fast-xml-parser', () => {
    const xml = exportRkt(PRESET_ESTES_ALPHA);
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);

    const design = parsed.RockSimDocument.DesignInformation.RocketDesign;
    expect(design.Name).toBe(PRESET_ESTES_ALPHA.name);
    expect(design.Stage3Parts).toBeTruthy();
    expect(design.Stage3Parts.NoseCone).toBeTruthy();
    expect(design.Stage3Parts.BodyTube).toBeTruthy();
    const bodyTube = design.Stage3Parts.BodyTube;
    // Empty leaf nodes parse to "" — assert key presence, not truthiness.
    expect(Object.keys(bodyTube)).toContain('MotorMount');
    expect(Object.keys(bodyTube.AttachedParts)).toContain('FinSet');
    expect(Object.keys(bodyTube.AttachedParts)).toContain('Parachute');
  });
});