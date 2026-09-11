import { describe, it, expect } from 'vitest';
import type { RocketVehicle, RocketComponent, BodyTubeComponent, TrapezoidFinSetComponent } from '../core/types';
import { tessellateVehicle, exportStep, TessellatedSolid } from './stepExport';

/**
 * A representative vehicle exercising every OML kind plus the two skipped
 * internal-kinds (mass component, parachute) and both fin-planform kinds.
 */
function fixtureVehicle(): RocketVehicle {
  return {
    id: 'rkt-1',
    name: 'Fixture Rocket',
    version: '1.0',
    author: 'test',
    components: [
      {
        id: 'nose', name: 'Ogive Nose', type: 'nosecone', materialId: 'fiberglass',
        shape: 'ogive', length: 0.2, baseDiameter: 0.05, wallThickness: 0.002, isHollow: true,
      },
      {
        id: 'tube', name: 'Main Tube', type: 'bodytube', materialId: 'cardboard',
        length: 0.6, outerDiameter: 0.06, innerDiameter: 0.056,
      },
      {
        id: 'boat', name: 'Boattail', type: 'transition', materialId: 'fiberglass',
        length: 0.15, foreDiameter: 0.06, aftDiameter: 0.04, wallThickness: 0.002, isHollow: true,
      },
      {
        id: 'fins', name: 'Tail Fins', type: 'trapezoidfinset', materialId: 'balsa',
        finCount: 4, rootChord: 0.09, tipChord: 0.04, span: 0.05, sweepLength: 0.03,
        thickness: 0.003, crossSection: 'square', axialOffset: 0.45,
      },
      {
        id: 'efins', name: 'Elliptical Fins', type: 'ellipticalfinset', materialId: 'balsa',
        finCount: 3, rootChord: 0.08, span: 0.04, thickness: 0.003, axialOffset: 0.48,
      },
      {
        id: 'payload', name: 'Altimeter Sled', type: 'masscomponent', materialId: 'aluminum',
        mass: 0.1, length: 0.12, axialOffset: 0.1,
      },
      {
        id: 'chute', name: 'Drogue', type: 'parachute', materialId: 'nylon',
        diameter: 0.4, cd: 0.8, mass: 0.025, axialOffset: 0.2,
      },
    ],
  };
}

/** Signed tetrahedron volume of a triangle soup; positive for outward winding. */
function signedVolume(tris: Array<{ a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number }; c: { x: number; y: number; z: number } }>): number {
  let v = 0;
  for (const t of tris) {
    v +=
      t.a.x * (t.b.y * t.c.z - t.b.z * t.c.y) -
      t.a.y * (t.b.x * t.c.z - t.b.z * t.c.x) +
      t.a.z * (t.b.x * t.c.y - t.b.y * t.c.x);
  }
  return v / 6;
}

function maxAbsCoord(solid: TessellatedSolid, axis: 'x' | 'y' | 'z'): number {
  let m = 0;
  for (const t of solid.meshTriangles) {
    m = Math.max(m, Math.abs(t.a[axis]), Math.abs(t.b[axis]), Math.abs(t.c[axis]));
  }
  return m;
}

describe('tessellateVehicle', () => {
  it('emits one solid per OML component and skips internal hardware', () => {
    const out = tessellateVehicle(fixtureVehicle());
    expect(out.solids.map((s) => s.kind)).toEqual([
      'nosecone',
      'bodytube',
      'transition',
      'trapezoidfinset',
      'trapezoidfinset',
      'trapezoidfinset',
      'trapezoidfinset',
      'ellipticalfinset',
      'ellipticalfinset',
      'ellipticalfinset',
    ]);
    // One per fin, named by component.
    expect(out.solids[3].name).toBe('Tail Fins (fin 1/4)');
    expect(out.solids[9].name).toBe('Elliptical Fins (fin 3/3)');
  });

  it('samples the procedural nosecone radius law into profilePoints', () => {
    const out = tessellateVehicle({
      id: 'r', name: 'Cone', version: '1', author: 't',
      components: [
        {
          id: 'nose', name: 'Cone Nose', type: 'nosecone', materialId: 'cardboard',
          shape: 'conical', length: 0.2, baseDiameter: 0.05, wallThickness: 0.001, isHollow: true,
        },
      ],
    });
    const nose = out.solids[0];
    expect(nose.kind).toBe('nosecone');
    expect(nose.profilePoints).toBeDefined();
    const p = nose.profilePoints!;
    // Default 48 axial steps -> 49 samples of radius(x).
    expect(p).toHaveLength(49);
    expect(p[0].x).toBe(0);
    expect(p[0].r).toBe(0);
    expect(p[48].x).toBeCloseTo(0.2, 9);
    expect(p[48].r).toBeCloseTo(0.025, 9);
    expect(p[24].r).toBeCloseTo(0.0125, 9); // linear conical law: r = R * x/L
  });

  it('tessellates a cylinder whose mesh volume matches the analytic value within 2%', () => {
    const out = tessellateVehicle({
      id: 'r', name: 'Tube Only', version: '1', author: 't',
      components: [
        {
          id: 'tube', name: 'Tube', type: 'bodytube', materialId: 'cardboard',
          length: 0.6, outerDiameter: 0.06, innerDiameter: 0.056,
        },
      ],
    });
    const vol = signedVolume(out.solids[0].meshTriangles);
    const analytic = Math.PI * 0.03 * 0.03 * 0.6;
    expect(Math.abs(vol - analytic) / analytic).toBeLessThan(0.02);
  });

  it('emits one fin solid per fin, rotated around the axis', () => {
    const out = tessellateVehicle(fixtureVehicle());
    const fins = out.solids.filter((s) => s.kind === 'trapezoidfinset');
    expect(fins).toHaveLength(4);
    // Fin 1 sits in the xy plane: thickness is purely tangential z = +-0.0015.
    expect(maxAbsCoord(fins[0], 'z')).toBeCloseTo(0.0015, 6);
    // Fin 2 (theta = pi/2) reaches z = sin(theta) * (rootR + span) at the tip.
    // Fins follow the transition's aft diameter (0.04), so the fin root
    // radius is 0.02 and the tip radius is 0.02 + 0.05.
    const tipRadius = 0.04 / 2 + 0.05;
    expect(maxAbsCoord(fins[1], 'z')).toBeGreaterThan(tipRadius * 0.99);
  });

  it('throws on non-finite, negative, or zero-volume dimensions', () => {
    const badTube = (patch: Partial<BodyTubeComponent>): RocketComponent => ({
      id: 'tube', name: 'Bad Tube', type: 'bodytube', materialId: 'cardboard',
      length: 0.6, outerDiameter: 0.06, innerDiameter: 0.056, ...patch,
    });
    const badFin = (patch: Partial<TrapezoidFinSetComponent>): RocketComponent => ({
      id: 'fins', name: 'Bad Fins', type: 'trapezoidfinset', materialId: 'balsa',
      finCount: 4, rootChord: 0.09, tipChord: 0.04, span: 0.05, sweepLength: 0.03,
      thickness: 0.003, crossSection: 'square', axialOffset: 0.45, ...patch,
    });
    const withTube = (c: RocketComponent): RocketVehicle => ({
      id: 'r', name: 'Bad Vehicle', version: '1', author: 't', components: [c],
    });
    expect(() => tessellateVehicle(withTube(badTube({ outerDiameter: Number.NaN })))).toThrow(RangeError);
    expect(() => tessellateVehicle(withTube(badTube({ length: -0.6 })))).toThrow(RangeError);
    expect(() => tessellateVehicle(withTube(badTube({ outerDiameter: 0 })))).toThrow(RangeError);
    // Tube first so the fin reaches the dimension checks (fin placement precondition).
    const nose: RocketComponent = {
      id: 'nose', name: 'Nose', type: 'nosecone', materialId: 'cardboard',
      shape: 'conical', length: 0.2, baseDiameter: 0.05, wallThickness: 0.001, isHollow: true,
    };
    const tube: RocketComponent = badTube({});
    const withFins = (f: RocketComponent): RocketVehicle => ({
      id: 'r', name: 'Bad Vehicle', version: '1', author: 't', components: [nose, tube, f],
    });
    expect(() => tessellateVehicle(withFins(badFin({ thickness: 0 })))).toThrow(RangeError);
    expect(() => tessellateVehicle(withFins(badFin({ span: -0.05 })))).toThrow(RangeError);
  });

  it('throws when a fin set precedes any body tube or the vehicle has no OML', () => {
    const base = fixtureVehicle();
    const noTube = {
      ...base,
      components: [
        { ...base.components[0] },
        { ...base.components[3], name: 'Fins Before Tube' },
      ],
    };
    expect(() => tessellateVehicle(noTube)).toThrow(/fin sets must be assembled after at least one body tube/);
    expect(() =>
      tessellateVehicle({
        ...base,
        components: [
          {
            id: 'chute', name: 'Chute', type: 'parachute', materialId: 'nylon',
            diameter: 0.4, cd: 0.8, mass: 0.025, axialOffset: 0,
          },
        ],
      })
    ).toThrow(/no axial body components/);
    expect(() => tessellateVehicle({ ...base, components: [] })).toThrow(/at least one component/);
  });
});

describe('exportStep', () => {
  it('emits a balanced AP203 header with the required sections', () => {
    const step = exportStep(tessellateVehicle(fixtureVehicle()).solids);
    expect(step.startsWith('ISO-10303-21;\nHEADER;')).toBe(true);
    expect(step).toContain('FILE_DESCRIPTION(');
    expect(step).toContain("FILE_NAME('astraea-export.step'");
    expect(step).toContain("FILE_SCHEMA(('AP203'));");
    // HEADER and DATA each close with ENDSEC; file ends with the terminator.
    expect(step.split('ENDSEC;')).toHaveLength(3);
    expect(step.endsWith('END-ISO-10303-21;')).toBe(true);
  });

  it('emits exactly one MANIFOLD_SOLID_BREP per solid, with stable ids', () => {
    const solids = tessellateVehicle(fixtureVehicle()).solids;
    const step = exportStep(solids);
    const breps = step.match(/MANIFOLD_SOLID_BREP\(/g) ?? [];
    expect(breps).toHaveLength(solids.length);

    // Deterministic: same input, byte-identical output (no timestamps/randomness).
    expect(exportStep(solids)).toBe(step);

    // Every referenced entity id is defined.
    const defined = new Set([...step.matchAll(/#(\d+)=/g)].map((m) => m[1]));
    for (const m of step.matchAll(/#(\d+)/g)) {
      expect(defined.has(m[1]), `missing entity #${m[1]}`).toBe(true);
    }
    // Solid may not be defined before its first reference? Definitions come first:
    expect(defined.size).toBeGreaterThan(100);
  });

  it('declares SI-metre units in the representation context', () => {
    const step = exportStep(tessellateVehicle(fixtureVehicle()).solids);
    expect(step).toContain('SI_UNIT($,.METRE.)');
    expect(step).toContain('UNCERTAINTY_MEASURE_WITH_UNIT');
    expect(step).toContain('ADVANCED_BREP_SHAPE_REPRESENTATION');
  });

  it('keeps every triangle loop a closed 3-edge loop', () => {
    const step = exportStep(tessellateVehicle(fixtureVehicle()).solids);
    const loops = step.split('\n').filter((line) => line.includes('=EDGE_LOOP('));
    expect(loops.length).toBeGreaterThan(0);
    for (const line of loops) {
      expect(line).toMatch(/^#\d+=EDGE_LOOP\('',\(#\d+,#\d+,#\d+\)\);$/);
    }
  });

  it('throws on a non-closed shell (edge not shared by exactly two faces)', () => {
    const singleTriangle: TessellatedSolid = {
      id: 'tri', name: 'Open Triangle', kind: 'bodytube',
      meshTriangles: [
        { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 0, y: 1, z: 0 } },
      ],
    };
    expect(() => exportStep([singleTriangle])).toThrow(/not a closed manifold shell/);
  });

  it('throws fail-closed on degenerate input', () => {
    const degenerate: TessellatedSolid = {
      id: 'd', name: 'Degenerate', kind: 'bodytube',
      meshTriangles: [
        { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 1, y: 0, z: 0 } },
      ],
    };
    expect(() => exportStep([degenerate])).toThrow(RangeError);
    const nanVertex: TessellatedSolid = {
      id: 'n', name: 'NaN Vertex', kind: 'bodytube',
      meshTriangles: [
        { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 0, y: Number.NaN, z: 0 } },
      ],
    };
    expect(() => exportStep([nanVertex])).toThrow(RangeError);
    expect(() => exportStep([])).toThrow(/at least one solid/);
  });
});