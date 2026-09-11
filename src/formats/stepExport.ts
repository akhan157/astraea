/**
 * Astraea STEP (ISO 10303-21, AP203) Solid-Model Exporter
 *
 * Two cooperating pieces:
 *
 * 1. `tessellateVehicle` — resolves a RocketVehicle into a list of closed
 *    faceted solids ({name, kind, profilePoints?, meshTriangles}). World
 *    +X is the axial direction with x = 0 at the nose tip; all coordinates
 *    are SI metres.
 *
 *    - Nosecone: closed body of revolution whose radius(x) law is sampled
 *      from the same five profiles as the procedural Three.js lathe in
 *      src/viewport/geometry/proceduralNosecone.ts (conical, tangent ogive,
 *      parabolic, von Kármán / Haack C=0, elliptical quarter). The samples
 *      are kept declaratively as `profilePoints`; the mesh is a triangle
 *      shell (pole fan at the tip, quad-strip mantle, base disk).
 *    - BodyTube: cylinder. Transition: cone frustum (either end may taper
 *      to a point, which becomes a pole fan). Both are two-point revolved
 *      profiles with fore/aft disk caps.
 *    - TrapezoidFinSet / EllipticalFinSet: one extruded-planform solid per
 *      fin, rotated about the axis; the root chord sits at the running body
 *      radius and the planform extrudes tangentially by `thickness`.
 *    - MassComponent / Parachute: internal payload and recovery hardware are
 *      not outer-mold-line geometry and are skipped (documented, no solid).
 *
 *    Like blueprint.ts, components are consumed nose-to-aft and a fin set
 *    MUST follow at least one body tube (its root station is measured from
 *    the enclosing tube's front station); otherwise export throws. Hollow
 *    interiors, wall thickness, body-tube inner diameter, motor mounts and
 *    fin cross-section shaping are not modeled — this is the outer mold line
 *    only.
 *
 * 2. `exportStep` — serializes the solids as one AP203 MANIFOLD_SOLID_BREP
 *    per solid: closed shells of planar FACE / EDGE_LOOP / EDGE_CURVE /
 *    VERTEX_POINT topology sharing edge instances between adjacent faces.
 *    No BREP curves beyond straight facets. The representation context
 *    declares an SI metre LENGTH_UNIT, so hosts (FreeCAD, SolidWorks) open
 *    the file at the correct physical scale. Ids are assigned in a fixed
 *    deterministic order, so repeated exports of the same solids are
 *    byte-identical (stable ids, no timestamps).
 *
 * Fail-closed: non-finite or negative dimensions, zero-volume solids,
 * degenerate (zero-area) triangles, non-finite mesh vertices, and shells
 * whose edges are not shared by exactly two faces raise RangeError / Error
 * instead of emitting corrupt geometry.
 */

import type { RocketVehicle, NoseconeShape } from '../core/types';

export type SolidKind =
  | 'nosecone'
  | 'bodytube'
  | 'transition'
  | 'trapezoidfinset'
  | 'ellipticalfinset';

export interface ProfilePoint {
  /** Axial station, metres, measured from the solid's fore station. */
  x: number;
  /** Body radius at that station, metres. */
  r: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Triangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
}

export interface TessellatedSolid {
  id: string;
  name: string;
  kind: SolidKind;
  /** Radius(x) samples of the revolved profile, fore-to-aft (revolved kinds only). */
  profilePoints?: ProfilePoint[];
  /** Closed, outward-wound manifold triangle soup, world coordinates in metres. */
  meshTriangles: Triangle[];
}

export interface TessellatedVehicle {
  solids: TessellatedSolid[];
}

export interface TessellationOptions {
  /** Resolution of the revolved profile along the axis (default 48 steps). */
  axialSteps?: number;
  /** Facets around the circumference of revolved bodies (default 32). */
  radialSlices?: number;
  /** Points along the outer elliptical arc of an elliptical fin (default 24). */
  finArcPoints?: number;
}

const DEFAULT_AXIAL_STEPS = 48;
const DEFAULT_RADIAL_SLICES = 32;
const DEFAULT_FIN_ARC_POINTS = 24;
const TWO_PI = Math.PI * 2;
/** Radii below this many metres are treated as a collapsed pole (one vertex). */
const POLE_EPS = 1e-9;

/**
 * Radius of a nosecone profile at axial station x. The five laws are copied
 * verbatim from src/viewport/geometry/proceduralNosecone.ts so the exported
 * geometry and the viewport lathe coincide; length > 0 is enforced upstream.
 */
function noseconeRadius(shape: NoseconeShape, length: number, baseRadius: number, x: number): number {
  const t = x / length; // 0 at tip, 1 at base
  switch (shape) {
    case 'conical':
      return baseRadius * t;
    case 'ogive': {
      // Tangent ogive: circle of radius rho centered at (L, R - rho)
      const rho = (baseRadius * baseRadius + length * length) / (2 * baseRadius);
      const dx = length - x;
      const radicand = Math.max(0, rho * rho - dx * dx);
      return Math.sqrt(radicand) + baseRadius - rho;
    }
    case 'parabolic':
      // Full parabola: r(x) = R * (2*(x/L) - (x/L)^2)
      return baseRadius * (2 * t - t * t);
    case 'vonkarman': {
      // Haack series with C = 0 (Von Kármán minimal drag nosecone)
      const theta = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * t)));
      const val = Math.max(0, theta - Math.sin(2 * theta) / 2);
      return (baseRadius / Math.sqrt(Math.PI)) * Math.sqrt(val);
    }
    case 'elliptical': {
      // Quarter ellipse: (r/R)^2 + ((L-x)/L)^2 = 1
      const invT = 1 - t;
      return baseRadius * Math.sqrt(Math.max(0, 1 - invT * invT));
    }
    default:
      throw new RangeError(`tessellateVehicle: unknown nosecone shape '${String(shape)}'`);
  }
}

function sampleNoseconeProfile(
  shape: NoseconeShape,
  length: number,
  baseRadius: number,
  steps: number
): ProfilePoint[] {
  const points: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * length;
    const r = noseconeRadius(shape, length, baseRadius, x);
    if (!Number.isFinite(r) || r < 0) {
      throw new RangeError(
        `tessellateVehicle: nosecone radius law produced a non-finite or negative radius (${r}) at x=${x}`
      );
    }
    points.push({ x, r });
  }
  return points;
}

/**
 * Revolves a profile sample array into a closed, outward-wound triangle
 * shell: quad-strip mantle, disk caps (or pole fans for collapsed ends).
 * Triangles wind counter-clockwise when viewed from outside.
 */
function revolveProfileToTriangles(profile: ProfilePoint[], xOffset: number, slices: number): Triangle[] {
  if (profile.length < 2) {
    throw new RangeError('tessellateVehicle: revolved solids need at least two profile points');
  }
  const maxR = profile.reduce((m, p) => Math.max(m, p.r), 0);
  if (maxR < POLE_EPS) {
    throw new RangeError('tessellateVehicle: revolved solid has zero radius along its whole length (zero volume)');
  }
  const rows: Vec3[][] = profile.map((p) => {
    const row: Vec3[] = [];
    for (let j = 0; j < slices; j++) {
      const th = (j / slices) * TWO_PI;
      row.push({ x: p.x + xOffset, y: p.r * Math.cos(th), z: p.r * Math.sin(th) });
    }
    return row;
  });

  const tris: Triangle[] = [];
  const foreIsPole = profile[0].r < POLE_EPS;
  const aftIsPole = profile[profile.length - 1].r < POLE_EPS;
  // Mantle quads: (ring i, ring i+1), split so both triangles wind outward.
  // A pole row (collapsed radius) has all vertices coincident, so its quads
  // would be zero-area triangles: skip it — the pole fan closes the tip.
  let iStart = foreIsPole ? 1 : 0;
  let iEnd = rows.length - 2; // inclusive
  if (aftIsPole) iEnd -= 1;
  for (let i = iStart; i <= iEnd; i++) {
    for (let j = 0; j < slices; j++) {
      const jn = (j + 1) % slices;
      const a = rows[i][j];
      const b = rows[i + 1][j];
      const c = rows[i + 1][jn];
      const d = rows[i][jn];
      tris.push({ a, b: c, c: b });
      tris.push({ a, b: d, c });
    }
  }

  const diskCap = (ring: Vec3[], sign: 1 | -1, xWorld: number): void => {
    const center: Vec3 = { x: xWorld, y: 0, z: 0 };
    for (let j = 0; j < slices; j++) {
      const jn = (j + 1) % slices;
      if (sign === 1) tris.push({ a: center, b: ring[j], c: ring[jn] });
      else tris.push({ a: center, b: ring[jn], c: ring[j] });
    }
  };

  if (foreIsPole) {
    // Tip at x = 0 collapses all ring-0 vertices; fan ring 1 onto a pole.
    const tip: Vec3 = { x: profile[0].x + xOffset, y: 0, z: 0 };
    for (let j = 0; j < slices; j++) {
      const jn = (j + 1) % slices;
      tris.push({ a: tip, b: rows[1][jn], c: rows[1][j] });
    }
  } else {
    diskCap(rows[0], -1, profile[0].x + xOffset);
  }

  const last = rows.length - 1;
  if (aftIsPole) {
    const tip: Vec3 = { x: profile[last].x + xOffset, y: 0, z: 0 };
    for (let j = 0; j < slices; j++) {
      const jn = (j + 1) % slices;
      tris.push({ a: tip, b: rows[last - 1][j], c: rows[last - 1][jn] });
    }
  } else {
    diskCap(rows[last], 1, profile[last].x + xOffset);
  }
  return tris;
}

function cross(o: Vec3, a: Vec3, b: Vec3): Vec3 {
  return {
    x: (a.y - o.y) * (b.z - o.z) - (a.z - o.z) * (b.y - o.y),
    y: (a.z - o.z) * (b.x - o.x) - (a.x - o.x) * (b.z - o.z),
    z: (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x),
  };
}

/**
 * Extrudes a convex planform polygon along a tangent direction into a closed
 * prism. Face winding is corrected against the solid centroid so every facet
 * normal points outward.
 */
function extrudePlanform(loop: Vec3[], thickness: number, tang: Vec3): Triangle[] {
  if (loop.length < 3) {
    throw new RangeError('tessellateVehicle: fin planform needs at least three points');
  }
  if (!(Number.isFinite(thickness) && thickness > 0)) {
    throw new RangeError('tessellateVehicle: fin thickness must be a finite positive number');
  }
  const half = thickness / 2;
  const minus = loop.map((p) => ({ x: p.x - tang.x * half, y: p.y - tang.y * half, z: p.z - tang.z * half }));
  const plus = loop.map((p) => ({ x: p.x + tang.x * half, y: p.y + tang.y * half, z: p.z + tang.z * half }));
  const verts = [...minus, ...plus];
  const cx = verts.reduce((s, v) => s + v.x, 0) / verts.length;
  const cy = verts.reduce((s, v) => s + v.y, 0) / verts.length;
  const cz = verts.reduce((s, v) => s + v.z, 0) / verts.length;

  const tris: Triangle[] = [];
  const pushOriented = (a: Vec3, b: Vec3, c: Vec3): void => {
    const n = cross(a, b, c);
    if (!(Math.hypot(n.x, n.y, n.z) > 0)) {
      throw new RangeError('tessellateVehicle: degenerate (zero-area) fin facet');
    }
    const fc = {
      x: (a.x + b.x + c.x) / 3 - cx,
      y: (a.y + b.y + c.y) / 3 - cy,
      z: (a.z + b.z + c.z) / 3 - cz,
    };
    if (n.x * fc.x + n.y * fc.y + n.z * fc.z < 0) {
      tris.push({ a, b: c, c: b });
    } else {
      tris.push({ a, b, c });
    }
  };

  // Caps (convex polygon fan from vertex 0).
  for (let i = 1; i + 1 < loop.length; i++) {
    pushOriented(plus[0], plus[i], plus[i + 1]);
    pushOriented(minus[0], minus[i], minus[i + 1]);
  }
  // Side quads.
  for (let i = 0; i < loop.length; i++) {
    const j = (i + 1) % loop.length;
    pushOriented(minus[i], plus[i], plus[j]);
    pushOriented(minus[i], plus[j], minus[j]);
  }
  return tris;
}

/**
 * Builds one fin's triangle mesh: the planform is placed in the plane
 * through the axis at azimuth theta, extruded tangentially.
 */
function finSolidMesh(planform: Array<{ x: number; y: number }>, thickness: number, finIndex: number, finCount: number): Triangle[] {
  const theta = (finIndex / finCount) * TWO_PI;
  const loop: Vec3[] = planform.map((p) => ({
    x: p.x,
    y: p.y * Math.cos(theta),
    z: p.y * Math.sin(theta),
  }));
  const tang: Vec3 = { x: 0, y: -Math.sin(theta), z: Math.cos(theta) };
  return extrudePlanform(loop, thickness, tang);
}

function trapezoidPlanform(fx: number, rootR: number, c: { rootChord: number; tipChord: number; span: number; sweepLength: number }): Array<{ x: number; y: number }> {
  return [
    { x: fx, y: rootR },
    { x: fx + c.rootChord, y: rootR },
    { x: fx + c.sweepLength + c.tipChord, y: rootR + c.span },
    { x: fx + c.sweepLength, y: rootR + c.span },
  ];
}

function ellipticalPlanform(fx: number, rootR: number, c: { rootChord: number; span: number }, arcPoints: number): Array<{ x: number; y: number }> {
  const semiMajor = c.rootChord / 2;
  const cx = fx + semiMajor;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= arcPoints; i++) {
    const phi = Math.PI - (Math.PI * i) / arcPoints; // pi (root LE) -> 0 (root TE)
    points.push({ x: cx + semiMajor * Math.cos(phi), y: rootR + c.span * Math.sin(phi) });
  }
  return points;
}

/**
 * Tessellates a vehicle's outer mold line into closed faceted solids.
 *
 * @throws {RangeError} on non-finite/negative/dimensionless (zero-volume) geometry.
 * @throws {Error} when the vehicle has no axial body components, no components,
 *   or a fin set that precedes any body tube.
 */
export function tessellateVehicle(vehicle: RocketVehicle, options: TessellationOptions = {}): TessellatedVehicle {
  if (!vehicle || !Array.isArray(vehicle.components) || vehicle.components.length === 0) {
    throw new Error('tessellateVehicle: vehicle needs at least one component');
  }
  const axialSteps = options.axialSteps ?? DEFAULT_AXIAL_STEPS;
  const radialSlices = options.radialSlices ?? DEFAULT_RADIAL_SLICES;
  const finArcPoints = options.finArcPoints ?? DEFAULT_FIN_ARC_POINTS;
  if (!Number.isInteger(axialSteps) || axialSteps < 1) {
    throw new RangeError(`tessellateVehicle: axialSteps must be a positive integer (got ${axialSteps})`);
  }
  if (!Number.isInteger(radialSlices) || radialSlices < 3) {
    throw new RangeError(`tessellateVehicle: radialSlices must be an integer >= 3 (got ${radialSlices})`);
  }
  if (!Number.isInteger(finArcPoints) || finArcPoints < 3) {
    throw new RangeError(`tessellateVehicle: finArcPoints must be an integer >= 3 (got ${finArcPoints})`);
  }

  const checkNonNegative = (dim: number, what: string, name: string): void => {
    if (!Number.isFinite(dim) || dim < 0) {
      throw new RangeError(
        `tessellateVehicle: component '${name}' has a non-finite or negative ${what} (got ${dim})`
      );
    }
  };
  const checkPositive = (dim: number, what: string, name: string): void => {
    if (!(Number.isFinite(dim) && dim > 0)) {
      throw new RangeError(`tessellateVehicle: component '${name}' needs a positive ${what} (got ${dim})`);
    }
  };

  // Validation pass: all OML dimensions finite/nonnegative, no zero-volume
  // solids, and fin sets placed after at least one body tube (blueprint.ts
  // parity — the fin root station is defined against the tube's front).
  let bodyTubeSeen = false;
  let axialSeen = false;
  for (const c of vehicle.components) {
    switch (c.type) {
      case 'nosecone':
        checkNonNegative(c.length, 'length', c.name);
        checkNonNegative(c.baseDiameter, 'base diameter', c.name);
        checkPositive(c.length, 'length', c.name);
        checkPositive(c.baseDiameter, 'base diameter', c.name);
        axialSeen = true;
        break;
      case 'bodytube':
        checkNonNegative(c.length, 'length', c.name);
        checkNonNegative(c.outerDiameter, 'outer diameter', c.name);
        checkPositive(c.length, 'length', c.name);
        checkPositive(c.outerDiameter, 'outer diameter', c.name);
        bodyTubeSeen = true;
        axialSeen = true;
        break;
      case 'transition':
        checkNonNegative(c.length, 'length', c.name);
        checkNonNegative(c.foreDiameter, 'fore diameter', c.name);
        checkNonNegative(c.aftDiameter, 'aft diameter', c.name);
        checkPositive(c.length, 'length', c.name);
        if (c.foreDiameter === 0 && c.aftDiameter === 0) {
          throw new RangeError(`tessellateVehicle: component '${c.name}' tapers to zero at both ends (zero volume)`);
        }
        axialSeen = true;
        break;
      case 'trapezoidfinset':
        if (!bodyTubeSeen) {
          throw new Error(
            'tessellateVehicle: fin sets must be assembled after at least one body tube ' +
            `(got '${c.name}' with no preceding body tube); the fin root needs an enclosing tube station`
          );
        }
        if (!Number.isInteger(c.finCount) || c.finCount < 1) {
          throw new RangeError(`tessellateVehicle: component '${c.name}' needs finCount >= 1 (got ${c.finCount})`);
        }
        checkNonNegative(c.rootChord, 'root chord', c.name);
        checkNonNegative(c.tipChord, 'tip chord', c.name);
        checkNonNegative(c.span, 'span', c.name);
        checkNonNegative(c.sweepLength, 'sweep length', c.name);
        checkNonNegative(c.thickness, 'thickness', c.name);
        checkNonNegative(c.axialOffset, 'axial offset', c.name);
        checkPositive(c.rootChord, 'root chord', c.name);
        checkPositive(c.span, 'span', c.name);
        checkPositive(c.thickness, 'thickness', c.name);
        break;
      case 'ellipticalfinset':
        if (!bodyTubeSeen) {
          throw new Error(
            'tessellateVehicle: fin sets must be assembled after at least one body tube ' +
            `(got '${c.name}' with no preceding body tube); the fin root needs an enclosing tube station`
          );
        }
        if (!Number.isInteger(c.finCount) || c.finCount < 1) {
          throw new RangeError(`tessellateVehicle: component '${c.name}' needs finCount >= 1 (got ${c.finCount})`);
        }
        checkNonNegative(c.rootChord, 'root chord', c.name);
        checkNonNegative(c.span, 'span', c.name);
        checkNonNegative(c.thickness, 'thickness', c.name);
        checkNonNegative(c.axialOffset, 'axial offset', c.name);
        checkPositive(c.rootChord, 'root chord', c.name);
        checkPositive(c.span, 'span', c.name);
        checkPositive(c.thickness, 'thickness', c.name);
        break;
      case 'masscomponent':
      case 'parachute':
        // Internal payload / recovery: not part of the outer mold line.
        break;
    }
  }
  if (!axialSeen) {
    throw new Error('tessellateVehicle: vehicle has no axial body components along the axis');
  }

  // Assembly pass (nose-to-aft), mirroring blueprint.ts station bookkeeping.
  const solids: TessellatedSolid[] = [];
  let x = 0; // aft station of the last axial component (nose tip = 0)
  let tubeFront = 0; // front station of the current enclosing body tube
  let bodyD = 0; // running body diameter for fin roots
  for (const c of vehicle.components) {
    switch (c.type) {
      case 'nosecone': {
        const R = c.baseDiameter / 2;
        const profile = sampleNoseconeProfile(c.shape, c.length, R, axialSteps);
        solids.push({
          id: c.id,
          name: c.name,
          kind: 'nosecone',
          profilePoints: profile,
          meshTriangles: revolveProfileToTriangles(profile, x, radialSlices),
        });
        x += c.length;
        bodyD = c.baseDiameter;
        break;
      }
      case 'bodytube': {
        const R = c.outerDiameter / 2;
        const profile: ProfilePoint[] = [
          { x: 0, r: R },
          { x: c.length, r: R },
        ];
        solids.push({
          id: c.id,
          name: c.name,
          kind: 'bodytube',
          profilePoints: profile,
          meshTriangles: revolveProfileToTriangles(profile, x, radialSlices),
        });
        tubeFront = x;
        x += c.length;
        bodyD = c.outerDiameter;
        break;
      }
      case 'transition': {
        const foreR = c.foreDiameter / 2;
        const aftR = c.aftDiameter / 2;
        const profile: ProfilePoint[] = [
          { x: 0, r: foreR },
          { x: c.length, r: aftR },
        ];
        solids.push({
          id: c.id,
          name: c.name,
          kind: 'transition',
          profilePoints: profile,
          meshTriangles: revolveProfileToTriangles(profile, x, radialSlices),
        });
        x += c.length;
        bodyD = c.aftDiameter;
        break;
      }
      case 'trapezoidfinset': {
        const rootR = bodyD / 2;
        const fx = tubeFront + c.axialOffset;
        const planform = trapezoidPlanform(fx, rootR, c);
        for (let k = 0; k < c.finCount; k++) {
          solids.push({
            id: `${c.id}-fin-${k + 1}`,
            name: `${c.name} (fin ${k + 1}/${c.finCount})`,
            kind: 'trapezoidfinset',
            meshTriangles: finSolidMesh(planform, c.thickness, k, c.finCount),
          });
        }
        break;
      }
      case 'ellipticalfinset': {
        const rootR = bodyD / 2;
        const fx = tubeFront + c.axialOffset;
        const planform = ellipticalPlanform(fx, rootR, c, finArcPoints);
        for (let k = 0; k < c.finCount; k++) {
          solids.push({
            id: `${c.id}-fin-${k + 1}`,
            name: `${c.name} (fin ${k + 1}/${c.finCount})`,
            kind: 'ellipticalfinset',
            meshTriangles: finSolidMesh(planform, c.thickness, k, c.finCount),
          });
        }
        break;
      }
      case 'masscomponent':
      case 'parachute':
        break;
    }
  }
  return { solids };
}

/** Canonical (v0 < v1) edge of a step model, shared by the two adjacent faces. */
interface StepEdge {
  v0: number;
  v1: number;
}

interface StepModel {
  solid: TessellatedSolid;
  verts: Vec3[];
  edges: StepEdge[];
  /** Per triangle: the three oriented edge uses in winding order. */
  uses: Array<Array<{ edge: number; forward: boolean }>>;
}

/**
 * Builds the shared-vertex / shared-edge topology of one solid. Throws on
 * non-finite vertices and degenerate triangles.
 */
function buildStepModel(solid: TessellatedSolid): StepModel {
  if (!solid || !Array.isArray(solid.meshTriangles) || solid.meshTriangles.length === 0) {
    throw new Error(`exportStep: solid '${solid?.name ?? '?'}' has no triangles`);
  }
  const verts: Vec3[] = [];
  const vertMap = new Map<string, number>();
  const edges: StepEdge[] = [];
  const edgeMap = new Map<string, number>();
  const uses: StepModel['uses'] = [];

  const addVertex = (p: Vec3): number => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      throw new RangeError(`exportStep: solid '${solid.name}' has a non-finite vertex`);
    }
    const key = `${p.x}|${p.y}|${p.z}`;
    const existing = vertMap.get(key);
    if (existing !== undefined) return existing;
    const id = verts.length;
    vertMap.set(key, id);
    verts.push(p);
    return id;
  };

  for (const t of solid.meshTriangles) {
    if (!t || !t.a || !t.b || !t.c) {
      throw new Error(`exportStep: solid '${solid.name}' has a malformed triangle`);
    }
    const n = cross(t.a, t.b, t.c);
    if (!(Math.hypot(n.x, n.y, n.z) > 0)) {
      throw new RangeError(`exportStep: solid '${solid.name}' has a degenerate (zero-area) triangle`);
    }
    const ids = [addVertex(t.a), addVertex(t.b), addVertex(t.c)];
    const triUses: Array<{ edge: number; forward: boolean }> = [];
    for (let k = 0; k < 3; k++) {
      const v0 = ids[k];
      const v1 = ids[(k + 1) % 3];
      const lo = Math.min(v0, v1);
      const hi = Math.max(v0, v1);
      const forward = v0 === lo;
      const key = `${lo}|${hi}`;
      let e = edgeMap.get(key);
      if (e === undefined) {
        e = edges.length;
        edgeMap.set(key, e);
        edges.push({ v0: lo, v1: hi });
      }
      triUses.push({ edge: e, forward });
    }
    uses.push(triUses);
  }
  return { solid, verts, edges, uses };
}

function fmtNum(n: number): string {
  if (n === 0) return '0';
  const s = n.toFixed(12).replace(/(\.\d*?)0+$/, '$1');
  return s.endsWith('.') ? s.slice(0, -1) : s;
}

/** STEP REAL values keep an explicit decimal point for strict parsers. */
function fmtReal(n: number): string {
  const s = fmtNum(n);
  return s.includes('.') ? s : `${s}.`;
}

/**
 * Serializes tessellated solids as an AP203 STEP file with one
 * MANIFOLD_SOLID_BREP per solid.
 *
 * @throws {RangeError} on non-finite vertices or degenerate triangles.
 * @throws {Error} on empty input or a shell that is not a closed manifold
 *   (some edge is not shared by exactly two faces).
 */
export function exportStep(solids: TessellatedSolid[]): string {
  if (!Array.isArray(solids) || solids.length === 0) {
    throw new Error('exportStep: at least one solid is required');
  }
  const models = solids.map(buildStepModel);

  // Closure invariant: every edge of a closed manifold shell is shared by
  // exactly two faces (with opposite orientation).
  for (const m of models) {
    const counts = new Array<number>(m.edges.length).fill(0);
    for (const tri of m.uses) {
      for (const u of tri) counts[u.edge] += 1;
    }
    for (let e = 0; e < counts.length; e++) {
      if (counts[e] !== 2) {
        throw new Error(
          `exportStep: solid '${m.solid.name}' is not a closed manifold shell ` +
          `(edge used ${counts[e]} time(s)); refusing to write a corrupt BREP`
        );
      }
    }
  }

  // Id allocation: 14 header entities, then one contiguous block per solid:
  // MANIFOLD_SOLID_BREP + CLOSED_SHELL (2) + per face FACE/FACE_OUTER_BOUND/
  // EDGE_LOOP (3F) + per triangle 3 ORIENTED_EDGE (3F) + per edge
  // EDGE_CURVE/LINE/CARTESIAN_POINT/VECTOR/DIRECTION (5E) + per vertex
  // VERTEX_POINT/CARTESIAN_POINT (2V).
  const starts: number[] = [];
  let next = 15;
  for (const m of models) {
    starts.push(next);
    next += 2 + 6 * m.uses.length + 5 * m.edges.length + 2 * m.verts.length;
  }

  const lines: string[] = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('Astraea STEP AP203 export: faceted outer-mold-line solids, SI metres'),'2;1');",
    "FILE_NAME('astraea-export.step','',('Astraea'),('Astraea'),'','Astraea CAD Export','');",
    "FILE_SCHEMA(('AP203'));",
    'ENDSEC;',
    'DATA;',
    "#1=APPLICATION_CONTEXT('automotive_design');",
    "#2=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2003,#1);",
    "#3=PRODUCT('ASTRAEA-VEHICLE','Astraea Vehicle','',(#4));",
    "#4=PRODUCT_CONTEXT('',#1,'mechanical');",
    "#5=PRODUCT_DEFINITION_FORMATION('','',#3);",
    "#6=PRODUCT_DEFINITION('design','',#5,#7);",
    "#7=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');",
    "#8=PRODUCT_DEFINITION_SHAPE('','',#6);",
    '#9=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT($,.METRE.));',
    '#10=(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());',
    "#11=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),#9,'distance_accuracy_value','confusion accuracy');",
    "#12=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#11)) GLOBAL_UNIT_ASSIGNED_CONTEXT((#9,#10)) REPRESENTATION_CONTEXT('Context','3D'));",
    '#13=SHAPE_DEFINITION_REPRESENTATION(#8,#14);',
    `#14=ADVANCED_BREP_SHAPE_REPRESENTATION('astraea brep',(${starts.map((s) => `#${s}`).join(',')}),#12);`,
  ];

  for (let mi = 0; mi < models.length; mi++) {
    const m = models[mi];
    const F = m.uses.length;
    const E = m.edges.length;
    const V = m.verts.length;
    const sId = starts[mi];
    const shellId = sId + 1;
    const faceBase = shellId + 1;
    const oeBase = faceBase + 3 * F;
    const edgeBase = oeBase + 3 * F;
    const vertBase = edgeBase + 5 * E;
    const esc = (s: string): string => s.replace(/"/g, "''");

    lines.push(`#${sId}=MANIFOLD_SOLID_BREP('${esc(m.solid.name)}',#${shellId});`);
    const faceIds = Array.from({ length: F }, (_, k) => `#${faceBase + 3 * k}`).join(',');
    lines.push(`#${shellId}=CLOSED_SHELL('',(${faceIds}));`);

    for (let k = 0; k < F; k++) {
      const fId = faceBase + 3 * k;
      lines.push(`#${fId}=FACE('',(#${fId + 1}));`);
      lines.push(`#${fId + 1}=FACE_OUTER_BOUND('',#${fId + 2},.T.);`);
      const oes = `#${oeBase + 3 * k},#${oeBase + 3 * k + 1},#${oeBase + 3 * k + 2}`;
      lines.push(`#${fId + 2}=EDGE_LOOP('',(${oes}));`);
    }
    for (let k = 0; k < F; k++) {
      const tri = m.uses[k];
      for (let q = 0; q < 3; q++) {
        const u = tri[q];
        lines.push(`#${oeBase + 3 * k + q}=ORIENTED_EDGE('',*,*,#${edgeBase + 5 * u.edge},${u.forward ? '.T.' : '.F.'});`);
      }
    }
    for (let e = 0; e < E; e++) {
      const edge = m.edges[e];
      const v0 = m.verts[edge.v0];
      const v1 = m.verts[edge.v1];
      const dx = v1.x - v0.x;
      const dy = v1.y - v0.y;
      const dz = v1.z - v0.z;
      const len = Math.hypot(dx, dy, dz);
      const base = edgeBase + 5 * e;
      lines.push(`#${base}=EDGE_CURVE('',#${vertBase + 2 * edge.v0},#${vertBase + 2 * edge.v1},#${base + 1},.T.);`);
      lines.push(`#${base + 1}=LINE('',#${base + 2},#${base + 3});`);
      lines.push(`#${base + 2}=CARTESIAN_POINT('',(${fmtReal(v0.x)},${fmtReal(v0.y)},${fmtReal(v0.z)}));`);
      lines.push(`#${base + 3}=VECTOR('',#${base + 4},${fmtReal(len)});`);
      lines.push(`#${base + 4}=DIRECTION('',(${fmtReal(dx / len)},${fmtReal(dy / len)},${fmtReal(dz / len)}));`);
    }
    for (let v = 0; v < V; v++) {
      const p = m.verts[v];
      const vid = vertBase + 2 * v;
      lines.push(`#${vid}=VERTEX_POINT('',#${vid + 1});`);
      lines.push(`#${vid + 1}=CARTESIAN_POINT('',(${fmtReal(p.x)},${fmtReal(p.y)},${fmtReal(p.z)}));`);
    }
  }

  lines.push('ENDSEC;', 'END-ISO-10303-21;');
  return lines.join('\n');
}