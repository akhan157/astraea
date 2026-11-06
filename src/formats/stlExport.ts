/**
 * Astraea Binary STL Solid Exporter
 *
 * Serializes TessellatedSolid meshes (produced by `tessellateVehicle` in
 * ./stepExport.ts) as a binary STL file: an 80-byte ASCII header, a
 * little-endian uint32 triangle count, then one 50-byte facet record per
 * triangle (3 x float32 facet normal + 3 x float32 vertex + 2 attribute
 * bytes, which are zero).
 *
 * Units: STL has no unit declaration. Astraea exports SI metres — the
 * header text and this module document the convention, and all coordinates
 * are metres.
 *
 * Normals: each facet normal is the normalized right-hand-rule cross
 * product of the edge vectors (b-a) x (c-a), so it is by construction
 * consistent with the stored vertex winding; tessellateVehicle emits
 * outward-wound shells, so normals point out of the solid.
 *
 * Fail-closed: an empty solid list, a solid with no triangles, a malformed
 * triangle, a non-finite vertex coordinate, a degenerate (zero-area)
 * triangle, or a normal that overflows to non-finite raises RangeError /
 * Error instead of emitting a corrupt file.
 */

import type { TessellatedSolid, Triangle, Vec3 } from './stepExport';

const HEADER_BYTES = 80;
const PER_TRIANGLE_BYTES = 50;

/** Normalized right-hand-rule face normal, or throws on degenerate input. */
function faceNormal(a: Vec3, b: Vec3, c: Vec3): [number, number, number] {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 0)) {
    throw new RangeError('exportStlBinary: degenerate (zero-area) triangle');
  }
  const ux = nx / len;
  const uy = ny / len;
  const uz = nz / len;
  if (!Number.isFinite(ux) || !Number.isFinite(uy) || !Number.isFinite(uz)) {
    throw new RangeError('exportStlBinary: triangle normal overflowed to non-finite');
  }
  return [ux, uy, uz];
}

/** Validates a triangle and returns its vertices as flat numbers. */
function flattenTriangle(t: Triangle, name: string): [number, number, number, number, number, number, number, number, number] {
  if (!t || !t.a || !t.b || !t.c) {
    throw new Error(`exportStlBinary: solid '${name}' has a malformed triangle`);
  }
  for (const p of [t.a, t.b, t.c]) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      throw new RangeError(`exportStlBinary: solid '${name}' has a non-finite vertex`);
    }
  }
  faceNormal(t.a, t.b, t.c); // throws on degenerate
  return [t.a.x, t.a.y, t.a.z, t.b.x, t.b.y, t.b.z, t.c.x, t.c.y, t.c.z];
}

/**
 * Exports solids as a binary STL ArrayBuffer. Geometry is in SI metres.
 *
 * @throws {Error} on an empty solid list or a solid with no triangles.
 * @throws {RangeError} on non-finite vertices, degenerate triangles, or
 *   normal overflow.
 */
export function exportStlBinary(solids: TessellatedSolid[]): ArrayBuffer {
  if (!Array.isArray(solids) || solids.length === 0) {
    throw new Error('exportStlBinary: at least one solid is required');
  }

  // Pass 1: validate everything and count triangles.
  const flat: Array<[number, number, number, number, number, number, number, number, number]> = [];
  for (const s of solids) {
    if (!s || !Array.isArray(s.meshTriangles) || s.meshTriangles.length === 0) {
      throw new Error(`exportStlBinary: solid '${s?.name ?? '?'}' has no triangles`);
    }
    for (const t of s.meshTriangles) {
      flat.push(flattenTriangle(t, s.name));
    }
  }

  const count = flat.length;
  const buffer = new ArrayBuffer(HEADER_BYTES + 4 + PER_TRIANGLE_BYTES * count);
  const view = new DataView(buffer);

  const header = 'ASTRAEA CAD EXPORT - OML SOLID, SI METRES (M)'.padEnd(HEADER_BYTES, ' ');
  for (let i = 0; i < HEADER_BYTES; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(HEADER_BYTES, count, true);

  // Pass 2: write one 50-byte record per triangle (little-endian floats).
  let offset = HEADER_BYTES + 4;
  for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of flat) {
    const [nx, ny, nz] = faceNormal(
      { x: ax, y: ay, z: az },
      { x: bx, y: by, z: bz },
      { x: cx, y: cy, z: cz }
    );
    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);
    view.setFloat32(offset + 12, ax, true);
    view.setFloat32(offset + 16, ay, true);
    view.setFloat32(offset + 20, az, true);
    view.setFloat32(offset + 24, bx, true);
    view.setFloat32(offset + 28, by, true);
    view.setFloat32(offset + 32, bz, true);
    view.setFloat32(offset + 36, cx, true);
    view.setFloat32(offset + 40, cy, true);
    view.setFloat32(offset + 44, cz, true);
    // 2 attribute bytes stay zero.
    offset += PER_TRIANGLE_BYTES;
  }
  return buffer;
}