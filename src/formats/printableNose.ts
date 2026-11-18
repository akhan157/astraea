/**
 * A printable nose cone: the hollow nose shell plus the shoulder that slips
 * into the body tube behind it, as one closed, outward-wound solid.
 *
 * The whole-vehicle STL/STEP export is an outer-mold-line solid: useful to
 * look at, not a part anyone can print. This module builds the part a
 * builder actually prints, from the design's own numbers:
 *
 *   - Outer surface: the nose's radius law (the same five profiles as the
 *     viewport and the STEP export, `noseconeRadius`).
 *   - Wall: the nose's `wallThickness`, measured perpendicular to the outer
 *     surface (radial thickness t·√(1 + (dr/dx)²), a first-order normal
 *     offset). Near the tip the two walls meet, so the tip is solid up to the
 *     station where the cavity opens; the report names that station.
 *   - Shoulder: outer diameter exactly the inner diameter of the body tube
 *     directly behind the nose, the same wall thickness, and the length the
 *     caller gives (the design model has no shoulder, so the length is an
 *     explicit input, never a hidden constant). No print clearance is
 *     subtracted: printers differ, so the report says to test-fit.
 *
 * A nose marked not hollow (or with no wall) prints as a solid nose with a
 * solid shoulder plug.
 *
 * Refusals (thrown, and returned by `planPrintableNose` as a reason): no nose
 * cone, no body tube directly behind it, a tube bore not narrower than the
 * nose base, a wall too thick for the shoulder, or a non-positive shoulder
 * length. Nothing is clamped or guessed.
 */

import type { BodyTubeComponent, NoseconeComponent, RocketVehicle } from '../core/types';
import { noseconeRadius, type ProfilePoint, type TessellatedSolid, type Triangle, type Vec3 } from './stepExport';

const DEFAULT_AXIAL_STEPS = 96;
const DEFAULT_RADIAL_SLICES = 96;
const TWO_PI = Math.PI * 2;
/** Radii below this (metres) are on the axis: a pole, not a ring. */
const AXIS_EPS = 1e-9;

export interface PrintableNosePlan {
  nose: NoseconeComponent;
  /** The body tube the shoulder slips into. */
  tube: BodyTubeComponent;
  /** True when the nose is printed as a shell; false prints it solid. */
  hollow: boolean;
  /** Wall thickness used for the shell and the shoulder, metres (0 when solid). */
  wallM: number;
  /** Shoulder outer diameter, metres: the tube's inner diameter. */
  shoulderOdM: number;
}

export type PlanResult = { ok: true; plan: PrintableNosePlan } | { ok: false; reason: string };

/** Which nose, which tube and which wall, or the plain reason it cannot be printed. */
export function planPrintableNose(vehicle: RocketVehicle): PlanResult {
  const parts = vehicle.components;
  const noseIndex = parts.findIndex((c) => c.type === 'nosecone');
  if (noseIndex < 0) return { ok: false, reason: 'The design has no nose cone to print.' };
  const nose = parts[noseIndex] as NoseconeComponent;
  if (!(Number.isFinite(nose.length) && nose.length > 0) || !(Number.isFinite(nose.baseDiameter) && nose.baseDiameter > 0)) {
    return { ok: false, reason: `Nose cone “${nose.name}” needs a positive length and base diameter.` };
  }
  // The next part on the axis decides the shoulder: internal parts (fins,
  // parachutes, masses) are not on the axis.
  const next = parts.slice(noseIndex + 1).find((c) => c.type === 'bodytube' || c.type === 'transition' || c.type === 'nosecone');
  if (next === undefined || next.type !== 'bodytube') {
    return {
      ok: false,
      reason: next === undefined
        ? 'There is no body tube behind the nose cone, so the shoulder has no inner diameter to fit.'
        : `The part behind the nose cone is “${next.name}” (${next.type}), not a body tube, so the shoulder has no inner diameter to fit.`,
    };
  }
  const tube = next;
  if (!(Number.isFinite(tube.innerDiameter) && tube.innerDiameter > 0)) {
    return { ok: false, reason: `Body tube “${tube.name}” has no inner diameter, so the shoulder cannot be sized.` };
  }
  if (tube.innerDiameter >= nose.baseDiameter) {
    return { ok: false, reason: `Body tube “${tube.name}” is not narrower inside than the nose base, so a shoulder would not seat.` };
  }
  const wall = Number.isFinite(nose.wallThickness) ? nose.wallThickness : 0;
  const hollow = nose.isHollow && wall > 0;
  if (hollow && wall >= tube.innerDiameter / 2) {
    return { ok: false, reason: `The nose wall is too thick for a hollow shoulder inside “${tube.name}”.` };
  }
  return { ok: true, plan: { nose, tube, hollow, wallM: hollow ? wall : 0, shoulderOdM: tube.innerDiameter } };
}

/** The shoulder length the export starts from: one tube inner diameter, or null without a tube. */
export function startingShoulderLengthM(vehicle: RocketVehicle): number | null {
  const plan = planPrintableNose(vehicle);
  return plan.ok ? plan.plan.shoulderOdM : null;
}

export interface PrintableNoseOptions {
  /** Shoulder length, metres; must be positive. */
  shoulderLengthM: number;
  axialSteps?: number;
  radialSlices?: number;
}

export interface PrintableNose {
  solid: TessellatedSolid;
  plan: PrintableNosePlan;
  shoulderLengthM: number;
  /** Axial station (m from the tip) where the cavity opens; null for a solid nose. */
  cavityStartM: number | null;
}

/**
 * Revolves a closed profile loop (x, r), counter-clockwise with the solid on
 * its left, into an outward-wound triangle shell. Edges on the axis are
 * skipped; an end on the axis becomes a pole fan.
 */
function revolveClosedProfile(loop: ProfilePoint[], slices: number): Triangle[] {
  const ring = (p: ProfilePoint): Vec3[] => {
    if (p.r < AXIS_EPS) return Array.from({ length: slices }, () => ({ x: p.x, y: 0, z: 0 }));
    return Array.from({ length: slices }, (_, j) => {
      const th = (j / slices) * TWO_PI;
      return { x: p.x, y: p.r * Math.cos(th), z: p.r * Math.sin(th) };
    });
  };
  const rings = loop.map(ring);
  const tris: Triangle[] = [];
  for (let i = 0; i < loop.length; i++) {
    const k = (i + 1) % loop.length;
    const pOnAxis = loop[i].r < AXIS_EPS;
    const qOnAxis = loop[k].r < AXIS_EPS;
    if (pOnAxis && qOnAxis) continue;
    const P = rings[i];
    const Q = rings[k];
    for (let j = 0; j < slices; j++) {
      const jn = (j + 1) % slices;
      if (!qOnAxis) tris.push({ a: P[j], b: Q[j], c: Q[jn] });
      if (!pOnAxis) tris.push({ a: P[j], b: Q[jn], c: P[jn] });
    }
  }
  return tris;
}

/** Drops consecutive duplicate points (a zero-length edge would revolve to zero-area triangles). */
function dedupe(loop: ProfilePoint[]): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (const p of loop) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-12 && Math.abs(last.r - p.r) < 1e-12) continue;
    out.push(p);
  }
  if (out.length > 1) {
    const first = out[0], last = out[out.length - 1];
    if (Math.abs(first.x - last.x) < 1e-12 && Math.abs(first.r - last.r) < 1e-12) out.pop();
  }
  return out;
}

/** The printable nose cone solid (metres), or throws the plan's reason. */
export function printableNoseSolid(vehicle: RocketVehicle, options: PrintableNoseOptions): PrintableNose {
  const result = planPrintableNose(vehicle);
  if (!result.ok) throw new Error(`Nose cone print file: ${result.reason}`);
  const { plan } = result;
  const Ls = options.shoulderLengthM;
  if (!(Number.isFinite(Ls) && Ls > 0)) throw new RangeError('Nose cone print file: the shoulder length must be a positive number.');
  const steps = options.axialSteps ?? DEFAULT_AXIAL_STEPS;
  const slices = options.radialSlices ?? DEFAULT_RADIAL_SLICES;
  if (!Number.isInteger(steps) || steps < 4) throw new RangeError(`Nose cone print file: axialSteps must be an integer >= 4 (got ${steps})`);
  if (!Number.isInteger(slices) || slices < 8) throw new RangeError(`Nose cone print file: radialSlices must be an integer >= 8 (got ${slices})`);

  const { nose } = plan;
  const L = nose.length;
  const R = nose.baseDiameter / 2;
  const Rs = plan.shoulderOdM / 2;
  const t = plan.wallM;
  const radius = (x: number): number => noseconeRadius(nose.shape, L, R, Math.min(L, Math.max(0, x)));
  const outer: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * L;
    const r = radius(x);
    if (!Number.isFinite(r) || r < 0) throw new RangeError(`Nose cone print file: the ${nose.shape} radius law gave ${r} at ${x} m`);
    outer.push({ x, r: i === 0 ? 0 : r });
  }

  // Loop, counter-clockwise (solid on the left): along the bottom toward +x
  // (axis, cavity, shoulder bore), up the shoulder's aft face, back along the
  // top toward the tip (shoulder outside, the seat step, the nose outside).
  const loop: ProfilePoint[] = [{ x: 0, r: 0 }];
  let cavityStartM: number | null = null;
  if (t > 0) {
    const h = L / (steps * 50);
    const inner: ProfilePoint[] = [];
    // At the tip the outer radius is 0, so the inner offset starts at -t or below.
    let previous: ProfilePoint = { x: 0, r: -t };
    for (let i = 1; i <= steps; i++) {
      const x = outer[i].x;
      const xa = Math.max(0, x - h), xb = Math.min(L, x + h);
      const slope = (radius(xb) - radius(xa)) / (xb - xa);
      const rIn = outer[i].r - t * Math.sqrt(1 + slope * slope);
      if (rIn > AXIS_EPS) {
        if (inner.length === 0) {
          // The cavity opens between the last closed station and this one.
          const x0 = previous.x, r0 = previous.r;
          const xc = r0 >= 0 ? x0 : x0 + (x - x0) * (-r0 / (rIn - r0));
          cavityStartM = xc;
          inner.push({ x: xc, r: 0 });
        }
        inner.push({ x, r: rIn });
      } else if (inner.length > 0) {
        // The wall pinches the cavity shut again (a very thick wall on a
        // blunt base); keep it closed rather than emit a self-crossing loop.
        throw new RangeError(`Nose cone print file: the ${(t * 1000).toFixed(1)} mm wall closes the cavity again at ${(x * 1000).toFixed(1)} mm; use a thinner wall.`);
      }
      previous = { x, r: rIn };
    }
    if (inner.length === 0) {
      // The wall is thicker than the nose anywhere: it prints solid, with a bored shoulder.
      loop.push({ x: L, r: 0 });
    } else {
      loop.push(...inner);
    }
    loop.push({ x: L, r: Rs - t }, { x: L + Ls, r: Rs - t });
  } else {
    loop.push({ x: L + Ls, r: 0 });
  }
  loop.push({ x: L + Ls, r: Rs }, { x: L, r: Rs }, { x: L, r: R });
  for (let i = steps - 1; i >= 1; i--) loop.push(outer[i]);

  const meshTriangles = revolveClosedProfile(dedupe(loop), slices);
  return {
    solid: { id: `${nose.id}-print`, name: `${nose.name} (print)`, kind: 'nosecone', meshTriangles },
    plan,
    shoulderLengthM: Ls,
    cavityStartM,
  };
}

/** Millimetres with one decimal, for the notes (a print file is built in millimetres). */
const mm = (m: number): string => `${(m * 1000).toFixed(1)} mm`;

/**
 * What the print file contains and what it does not, in plain words, or the
 * reason it cannot be made. Shown before the download.
 */
export function describePrintableNose(vehicle: RocketVehicle, shoulderLengthM: number): { refused: string[]; omissions: string[] } {
  let built: PrintableNose;
  try {
    built = printableNoseSolid(vehicle, { shoulderLengthM, axialSteps: 24, radialSlices: 16 });
  } catch (err) {
    return { refused: [(err instanceof Error ? err.message : String(err)).replace(/^Nose cone print file: /, '')], omissions: [] };
  }
  const { plan } = built;
  const notes: string[] = [];
  notes.push(plan.hollow
    ? `Hollow nose: ${mm(plan.wallM)} wall (the nose’s wall thickness), measured perpendicular to the surface; solid tip for the first ${mm(built.cavityStartM ?? plan.nose.length)}, where the walls meet.`
    : `Solid nose and shoulder: “${plan.nose.name}” is not marked hollow (or has no wall thickness).`);
  notes.push(`Shoulder: ${mm(plan.shoulderOdM)} outside, exactly the inside of “${plan.tube.name}”, with no print clearance, so test-fit and sand. ${mm(built.shoulderLengthM)} long${plan.hollow ? `, ${mm(plan.wallM)} wall` : ''}.`);
  notes.push('Millimetres, which slicers expect. The nose cone only: tubes, fins and internal parts are not in this file.');
  if (plan.nose.tipRadius !== undefined && plan.nose.tipRadius > 0) notes.push('The blunt tip radius is not modelled: the tip prints sharp.');
  return { refused: [], omissions: notes };
}
