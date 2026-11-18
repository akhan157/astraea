/**
 * Printable nose cone: a closed, outward-wound shell whose wall, shoulder
 * diameter and shoulder length come from the design (and the one explicit
 * shoulder-length input), checked by volume against closed-form solids.
 */
import { describe, expect, it } from 'vitest';
import type { RocketVehicle } from '../core/types';
import { describePrintableNose, planPrintableNose, printableNoseSolid, startingShoulderLengthM } from './printableNose';
import { exportStlBinary } from './stlExport';
import type { Triangle } from './stepExport';

function vehicle(nose: Partial<Extract<RocketVehicle['components'][number], { type: 'nosecone' }>> = {}, tubeId = 0.048): RocketVehicle {
  return {
    id: 'v', name: 'Print test', version: '1', author: 't',
    components: [
      { id: 'nc', name: 'Nose', type: 'nosecone', shape: 'conical', length: 0.2, baseDiameter: 0.05, wallThickness: 0.002, isHollow: true, materialId: 'pla_3dprint', ...nose },
      { id: 'bt', name: 'Main tube', type: 'bodytube', length: 0.5, outerDiameter: 0.05, innerDiameter: tubeId, materialId: 'cardboard' },
    ],
  };
}

/** Signed volume by the divergence theorem: positive iff the shell is outward-wound. */
function signedVolume(tris: Triangle[]): number {
  let v = 0;
  for (const { a, b, c } of tris) v += (a.x * (b.y * c.z - b.z * c.y) - a.y * (b.x * c.z - b.z * c.x) + a.z * (b.x * c.y - b.y * c.x)) / 6;
  return v;
}

/** Every undirected edge is shared by exactly two triangles, once in each direction. */
function isClosedManifold(tris: Triangle[]): boolean {
  const key = (p: { x: number; y: number; z: number }) => `${p.x.toFixed(12)},${p.y.toFixed(12)},${p.z.toFixed(12)}`;
  const directed = new Map<string, number>();
  for (const { a, b, c } of tris) {
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const k = `${key(p)}>${key(q)}`;
      directed.set(k, (directed.get(k) ?? 0) + 1);
    }
  }
  for (const [k, n] of directed) {
    if (n !== 1) return false;
    const [p, q] = k.split('>');
    if (directed.get(`${q}>${p}`) !== 1) return false;
  }
  return true;
}

describe('printable nose cone', () => {
  it('is a closed, outward-wound hollow shell with a shoulder sized to the tube bore', () => {
    const built = printableNoseSolid(vehicle(), { shoulderLengthM: 0.04, radialSlices: 64, axialSteps: 64 });
    const tris = built.solid.meshTriangles;
    expect(isClosedManifold(tris)).toBe(true);
    const volume = signedVolume(tris);
    expect(volume).toBeGreaterThan(0);

    // Closed form for the same parts: cone shell (outer cone minus the inner
    // cone offset by the wall) plus the shoulder tube; the faceting makes the
    // mesh slightly smaller than the true solid.
    const R = 0.025, L = 0.2, t = 0.002, Rs = 0.024, Ls = 0.04;
    const sec = Math.sqrt(1 + (R / L) ** 2);
    const rInBase = R - t * sec;
    const xc = L * (1 - rInBase / R); // inner cone apex station
    const outerCone = (Math.PI * R * R * L) / 3;
    const innerCone = (Math.PI * rInBase * rInBase * (L - xc)) / 3;
    const shoulder = Math.PI * (Rs * Rs - (Rs - t) ** 2) * Ls;
    const step = Math.PI * (rInBase * rInBase - (Rs - t) ** 2) * 0; // the seat ring has no length
    const exact = outerCone - innerCone + shoulder + step;
    expect(volume / exact).toBeGreaterThan(0.98);
    expect(volume / exact).toBeLessThan(1.0001);

    expect(built.cavityStartM).toBeCloseTo(xc, 3);
    expect(built.plan.shoulderOdM).toBe(0.048);
    const xs = tris.flatMap((tr) => [tr.a.x, tr.b.x, tr.c.x]);
    expect(Math.max(...xs)).toBeCloseTo(L + Ls, 12);
    const radii = tris.flatMap((tr) => [tr.a, tr.b, tr.c]).filter((p) => p.x > L + 1e-9).map((p) => Math.hypot(p.y, p.z));
    expect(Math.max(...radii)).toBeCloseTo(Rs, 12);
    expect(Math.min(...radii)).toBeCloseTo(Rs - t, 12);
  });

  it.each(['ogive', 'parabolic', 'vonkarman', 'elliptical'] as const)('closes the %s shell too', (shape) => {
    const built = printableNoseSolid(vehicle({ shape }), { shoulderLengthM: 0.03, radialSlices: 32, axialSteps: 48 });
    expect(isClosedManifold(built.solid.meshTriangles)).toBe(true);
    expect(signedVolume(built.solid.meshTriangles)).toBeGreaterThan(0);
    // Hollow: less material than the same nose printed solid.
    const solid = printableNoseSolid(vehicle({ shape, isHollow: false }), { shoulderLengthM: 0.03, radialSlices: 32, axialSteps: 48 });
    expect(signedVolume(built.solid.meshTriangles)).toBeLessThan(signedVolume(solid.solid.meshTriangles) * 0.6);
    expect(solid.cavityStartM).toBeNull();
  });

  it('writes millimetres for slicers and says so in the header', () => {
    const built = printableNoseSolid(vehicle(), { shoulderLengthM: 0.04 });
    const buffer = exportStlBinary([built.solid], { units: 'mm' });
    const view = new DataView(buffer);
    const header = Array.from({ length: 80 }, (_, i) => String.fromCharCode(view.getUint8(i))).join('');
    expect(header).toContain('MILLIMETRES');
    let maxX = 0;
    for (let i = 0, off = 84; i < view.getUint32(80, true); i++, off += 50) {
      for (const v of [12, 24, 36]) maxX = Math.max(maxX, view.getFloat32(off + v, true));
    }
    expect(maxX).toBeCloseTo(240, 2); // 200 mm nose + 40 mm shoulder
  });

  it('starts the shoulder length at one tube inner diameter and names the wall, bore and units', () => {
    expect(startingShoulderLengthM(vehicle())).toBe(0.048);
    const notes = describePrintableNose(vehicle(), 0.048);
    expect(notes.refused).toEqual([]);
    expect(notes.omissions.join('\n')).toMatch(/2\.0 mm wall/);
    expect(notes.omissions.join('\n')).toMatch(/48\.0 mm outside, exactly the inside of “Main tube”, with no print clearance/);
    expect(notes.omissions.join('\n')).toMatch(/Millimetres/);
  });

  it('refuses instead of guessing: no tube behind the nose, a bore not narrower than the base, or a bad length', () => {
    const noTube: RocketVehicle = { ...vehicle(), components: [vehicle().components[0]] };
    expect(planPrintableNose(noTube)).toEqual({ ok: false, reason: 'There is no body tube behind the nose cone, so the shoulder has no inner diameter to fit.' });
    expect(describePrintableNose(vehicle({}, 0.05), 0.04).refused[0]).toMatch(/not narrower inside than the nose base/);
    expect(() => printableNoseSolid(vehicle(), { shoulderLengthM: 0 })).toThrow(/shoulder length must be a positive number/);
    expect(describePrintableNose(vehicle({ wallThickness: 0.03 }), 0.04).refused[0]).toMatch(/too thick/);
  });
});
