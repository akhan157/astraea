/**
 * Freeform fin planform geometry.
 *
 * A freeform fin is a polygon in the fin plane (x aft from the root leading
 * edge, y outward from the body). Everything the Barrowman, drag and mass
 * models need is a spanwise integral of the chord distribution, so the polygon
 * is cut into strips at every vertex ordinate. Inside a strip the leading and
 * trailing edges are straight lines, so each integral below is an exact
 * closed form (no sampling error). OpenRocket's `FinSetCalc` evaluates the
 * same integrals on 48 uniform strips; this is the limit of that scheme.
 *
 *   area        A      = ∫ c dy
 *   MAC length         = ∫ c² dy / A
 *   MAC lead            = ∫ x_le c dy / A         (area-weighted leading edge)
 *   centroid x          = ∫ c (x_le + x_te)/2 dy / A
 *   cos Γ (mid-chord)   = ∫ cos(angle of the mid-chord line) dy / span
 *   cos Λ (leading edge)= ∫ cos(angle of the leading edge) dy / span
 *
 * Cosines are the span-weighted mean of dy/√(dy²+dx²) per strip, the exact
 * limit of OpenRocket's `cosGamma` / `cosGammaLead` averages. A step in the
 * leading edge (a segment parallel to the body axis) has zero span weight.
 * For a trapezoid every quantity reduces to the closed forms used by
 * `computeTrapezoidFinAero` / `computeFinEdgeDrag`.
 *
 * Mirrors `crates/astraea-core/src/fin_planform.rs` operation for operation.
 */

import type { FinPoint } from '../core/types';

export interface FreeformPlanform {
  /** Largest ordinate, meters. */
  span: number;
  /** Chord at the root, meters (x of the last point). */
  rootChord: number;
  /** Chord at the outermost station, meters (0 for a pointed tip). */
  tipChord: number;
  /** Planform area of one fin, m². */
  area: number;
  /** 2·area/span — the trapezoid's (root + tip chord). */
  chordSum: number;
  /** Mid-chord line length span/cosΓ, meters. */
  midChordLength: number;
  /** Mean aerodynamic chord, meters. */
  macLength: number;
  /** x of the MAC leading edge from the root leading edge, meters. */
  macLead: number;
  /** x of the planform's area centroid from the root leading edge, meters. */
  centroidX: number;
  /** Span-weighted mean cosine of the leading-edge sweep angle. */
  cosLeadingEdge: number;
  /** Span-weighted integral of the squared local leading-edge cosine. */
  cosLeadingEdgeSquared: number;
  minX: number;
  maxX: number;
}

const fail = (msg: string): never => {
  throw new Error(`vehicle geometry: freeform fin ${msg}`);
};

function orient(a: FinPoint, b: FinPoint, c: FinPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: FinPoint, b: FinPoint, p: FinPoint): boolean {
  return (
    Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)
  );
}

function segmentsIntersect(p1: FinPoint, p2: FinPoint, p3: FinPoint, p4: FinPoint): boolean {
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  if (o1 === 0 && onSegment(p1, p2, p3)) return true;
  if (o2 === 0 && onSegment(p1, p2, p4)) return true;
  if (o3 === 0 && onSegment(p3, p4, p1)) return true;
  if (o4 === 0 && onSegment(p3, p4, p2)) return true;
  return false;
}

/** Throws a precise error unless `points` is a valid freeform fin planform. */
export function validateFreeformPoints(points: readonly FinPoint[]): void {
  if (!Array.isArray(points) || points.length < 3) {
    fail(`needs at least 3 points (got ${Array.isArray(points) ? points.length : 'none'})`);
  }
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      fail(`point ${i + 1} must have finite x and y`);
    }
  }
  if (points[0].x !== 0 || points[0].y !== 0) {
    fail(`first point must be the root leading edge (0, 0) on the body (got ${points[0].x}, ${points[0].y})`);
  }
  const last = points[n - 1];
  if (last.y !== 0) {
    fail(`last point must lie on the body at y = 0 (got y = ${last.y})`);
  }
  if (!(last.x > 0)) {
    fail(`last point must be the root trailing edge behind the leading edge (got x = ${last.x})`);
  }
  for (let i = 1; i < n - 1; i++) {
    if (points[i].y < 0) fail(`point ${i + 1} is inside the body (y = ${points[i].y} < 0)`);
    if (points[i].y === 0) fail(`point ${i + 1} lies on the root line (y = 0); only the first and last point may`);
  }
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (a.x === b.x && a.y === b.y) fail(`points ${i + 1} and ${((i + 1) % n) + 1} are identical`);
  }
  // Simple polygon: no two edges may cross or touch except at shared vertices.
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) {
        // Shared vertex only: reject a fold-back along the same line.
        const shared = j === i + 1 ? a2 : a1;
        const farA = j === i + 1 ? a1 : a2;
        const farB = j === i + 1 ? b2 : b1;
        const cross = orient(shared, farA, farB);
        const dot = (farA.x - shared.x) * (farB.x - shared.x) + (farA.y - shared.y) * (farB.y - shared.y);
        if (cross === 0 && dot > 0) fail(`edges at point ${(j === i + 1 ? j : i) + 1} fold back onto each other`);
        continue;
      }
      if (segmentsIntersect(a1, a2, b1, b2)) {
        fail(`outline is not a simple polygon: edge ${i + 1}–${((i + 1) % n) + 1} meets edge ${j + 1}–${((j + 1) % n) + 1}`);
      }
    }
  }
}

function xOnEdge(a: FinPoint, b: FinPoint, y: number): number {
  if (y === a.y) return a.x;
  if (y === b.y) return b.x;
  return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
}

/** Validates the polygon and integrates the planform quantities above. */
export function analyzeFreeformPlanform(points: readonly FinPoint[]): FreeformPlanform {
  validateFreeformPoints(points);
  const n = points.length;

  const ys: number[] = [];
  for (const p of points) if (!ys.includes(p.y)) ys.push(p.y);
  ys.sort((a, b) => a - b);
  const span = ys[ys.length - 1];

  let area = 0;
  let chordSquared = 0;
  let leadMoment = 0;
  let cosMid = 0;
  let cosLead = 0;
  let cosLeadSquared = 0;
  let rootChord = 0;
  let tipChord = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }

  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k];
    const y1 = ys[k + 1];
    const h = y1 - y0;
    const crossing: Array<{ x0: number; x1: number }> = [];
    for (let i = 0; i < n; i++) {
      const a = points[i];
      const b = points[(i + 1) % n];
      if (a.y === b.y) continue;
      const lo = Math.min(a.y, b.y);
      const hi = Math.max(a.y, b.y);
      if (lo <= y0 && hi >= y1) crossing.push({ x0: xOnEdge(a, b, y0), x1: xOnEdge(a, b, y1) });
    }
    if (crossing.length !== 2) {
      fail(
        `has ${crossing.length} outline edges across span ${y0}–${y1} m; ` +
          'notches, holes and detached sections are not supported (one material interval per span station)',
      );
    }
    crossing.sort((p, q) => p.x0 + p.x1 - (q.x0 + q.x1));
    const le0 = crossing[0].x0;
    const le1 = crossing[0].x1;
    const te0 = crossing[1].x0;
    const te1 = crossing[1].x1;
    const c0 = te0 - le0;
    const c1 = te1 - le1;
    if (c0 < 0 || c1 < 0) fail(`outline crosses itself near span ${y0}–${y1} m`);
    if (k === 0) rootChord = c0;
    tipChord = c1;
    area += (h * (c0 + c1)) / 2;
    chordSquared += (h * (c0 * c0 + c0 * c1 + c1 * c1)) / 3;
    leadMoment += h * (le0 * c0 + (le0 * (c1 - c0) + (le1 - le0) * c0) / 2 + ((le1 - le0) * (c1 - c0)) / 3);
    const mid0 = (le0 + te0) / 2;
    const mid1 = (le1 + te1) / 2;
    cosMid += (h * h) / Math.hypot(h, mid1 - mid0);
    cosLead += (h * h) / Math.hypot(h, le1 - le0);
    cosLeadSquared += (h * h * h) / (h * h + (le1 - le0) * (le1 - le0));
  }
  if (!(area > 0)) fail('has no area');
  cosMid /= span;
  cosLead /= span;
  cosLeadSquared /= span;

  return {
    span,
    rootChord,
    tipChord,
    area,
    chordSum: (2 * area) / span,
    midChordLength: span / cosMid,
    macLength: chordSquared / area,
    macLead: leadMoment / area,
    centroidX: (leadMoment + chordSquared / 2) / area,
    cosLeadingEdge: cosLead,
    cosLeadingEdgeSquared: cosLeadSquared,
    minX,
    maxX,
  };
}

/** Freeform points that describe exactly the trapezoid of the given dimensions. */
export function trapezoidPlanformPoints(
  rootChord: number,
  tipChord: number,
  span: number,
  sweepLength: number,
): FinPoint[] {
  const pts: FinPoint[] = [{ x: 0, y: 0 }, { x: sweepLength, y: span }];
  if (tipChord > 0) pts.push({ x: sweepLength + tipChord, y: span });
  pts.push({ x: rootChord, y: 0 });
  return pts;
}

/**
 * Display-only extents of a raw (possibly not yet valid) freeform outline:
 * the viewport must still draw a polygon the user is mid-way through editing.
 */
export function freeformExtents(points: readonly FinPoint[]): { span: number; rootChord: number } {
  let span = 0;
  for (const p of points) if (Number.isFinite(p.y) && p.y > span) span = p.y;
  const last = points[points.length - 1];
  return { span, rootChord: last && Number.isFinite(last.x) ? Math.max(0, last.x) : 0 };
}
