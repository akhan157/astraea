import { describe, it, expect } from 'vitest';
import type { RocketVehicle } from '../core/types';
import { tessellateVehicle, TessellatedSolid } from './stepExport';
import { exportStlBinary } from './stlExport';

/** Same OML shape as stepExport.test.ts so both exporters cover the same vehicle. */
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

interface ParsedTriangle {
  normal: [number, number, number];
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
}

function parseStl(buffer: ArrayBuffer): { header: string; count: number; triangles: ParsedTriangle[] } {
  const view = new DataView(buffer);
  const header = Array.from({ length: 80 }, (_, i) => String.fromCharCode(view.getUint8(i))).join('');
  const count = view.getUint32(80, true);
  const triangles: ParsedTriangle[] = [];
  for (let i = 0; i < count; i++) {
    const o = 84 + i * 50;
    triangles.push({
      normal: [view.getFloat32(o, true), view.getFloat32(o + 4, true), view.getFloat32(o + 8, true)],
      a: [view.getFloat32(o + 12, true), view.getFloat32(o + 16, true), view.getFloat32(o + 20, true)],
      b: [view.getFloat32(o + 24, true), view.getFloat32(o + 28, true), view.getFloat32(o + 32, true)],
      c: [view.getFloat32(o + 36, true), view.getFloat32(o + 40, true), view.getFloat32(o + 44, true)],
    });
  }
  return { header, count, triangles };
}

/** Signed volume of a parsed STL; positive for outward-wound shells. */
function stlVolume(tris: ParsedTriangle[]): number {
  let v = 0;
  for (const t of tris) {
    const [ax, ay, az] = t.a;
    const [bx, by, bz] = t.b;
    const [cx, cy, cz] = t.c;
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

describe('exportStlBinary', () => {
  it('writes an 80-byte header, uint32 count, and one 50-byte record per triangle', () => {
    const solids = tessellateVehicle(fixtureVehicle()).solids;
    const total = solids.reduce((n, s) => n + s.meshTriangles.length, 0);
    const buffer = exportStlBinary(solids);
    expect(buffer.byteLength).toBe(84 + 50 * total);

    const view = new DataView(buffer);
    expect(view.getUint32(80, true)).toBe(total);
    // Unit convention documented in the header text (STL has no unit field).
    const header = Array.from({ length: 80 }, (_, i) => String.fromCharCode(view.getUint8(i))).join('');
    expect(header.startsWith('ASTRAEA CAD EXPORT')).toBe(true);
    expect(header).toContain('METRES');
    // 2 attribute bytes are zero after every record.
    for (let off = 84 + 48; off < buffer.byteLength; off += 50) {
      expect(view.getUint16(off, true)).toBe(0);
    }
  });

  it('emits unit-length right-hand-rule normals for every triangle', () => {
    const parsed = parseStl(exportStlBinary(tessellateVehicle(fixtureVehicle()).solids));
    expect(parsed.count).toBeGreaterThan(0);
    for (const t of parsed.triangles) {
      const [nx, ny, nz] = t.normal;
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6);
      // Stored normal must equal the normalized cross(b-a, c-a) of the record.
      const [ax, ay, az] = t.a;
      const [bx, by, bz] = t.b;
      const [cx, cy, cz] = t.c;
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      const crx = aby * acz - abz * acy;
      const cry = abz * acx - abx * acz;
      const crz = abx * acy - aby * acx;
      const len = Math.hypot(crx, cry, crz);
      const dot = nx * (crx / len) + ny * (cry / len) + nz * (crz / len);
      expect(dot).toBeCloseTo(1, 6);
    }
  });

  it('triangulates the full vehicle into an outward-wound shell (cylinder volume sanity)', () => {
    const out = tessellateVehicle({
      id: 'r', name: 'Tube Only', version: '1', author: 't',
      components: [
        {
          id: 'tube', name: 'Tube', type: 'bodytube', materialId: 'cardboard',
          length: 0.6, outerDiameter: 0.06, innerDiameter: 0.056,
        },
      ],
    });
    const parsed = parseStl(exportStlBinary(out.solids));
    const vol = stlVolume(parsed.triangles);
    const analytic = Math.PI * 0.03 * 0.03 * 0.6;
    expect(Math.abs(vol - analytic) / analytic).toBeLessThan(0.02);
  });

  it('throws fail-closed on empty, non-finite, or degenerate input', () => {
    expect(() => exportStlBinary([])).toThrow(/at least one solid/);
    expect(() => exportStlBinary([{ id: 'e', name: 'Empty', kind: 'bodytube', meshTriangles: [] }])).toThrow(/has no triangles/);

    const nanVertex: TessellatedSolid = {
      id: 'n', name: 'NaN Vertex', kind: 'bodytube',
      meshTriangles: [
        { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 0, y: Number.NaN, z: 0 } },
      ],
    };
    expect(() => exportStlBinary([nanVertex])).toThrow(RangeError);

    const degenerate: TessellatedSolid = {
      id: 'd', name: 'Degenerate', kind: 'bodytube',
      meshTriangles: [
        { a: { x: 0, y: 0, z: 0 }, b: { x: 1, y: 0, z: 0 }, c: { x: 1, y: 0, z: 0 } },
      ],
    };
    expect(() => exportStlBinary([degenerate])).toThrow(RangeError);
  });
});