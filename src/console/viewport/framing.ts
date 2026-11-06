/**
 * Camera framing for the 3D view: the points that make up the drawn
 * silhouette, the perspective distance that puts them at a chosen fraction of
 * the canvas's tighter axis, and the placement that keeps a posed model clear of
 * the chrome drawn over the canvas.
 *
 * Framing the silhouette (nose tip, hull rings, fin tips) rather than a
 * bounding box is what makes the *visible* rocket fill the frame; a box fit
 * under-fills by 5–10% at the default ISO view because the box's corners sit
 * away from the body.
 */
import * as THREE from 'three';
import type { RocketVehicle } from '../../core/types';
import { partRadius } from './appearance';
import type { Layout } from './Vehicle3D';

/** Fraction of the canvas's limiting dimension the framed model occupies. */
export const FIT_FRACTION = 0.8;
/** Breathing room between the framed model and a DOM overlay, in canvas px. */
export const OVERLAY_PAD = 4;

export type Vector = { x: number; y: number; z: number };

/** Canvas-local pixel rectangle. */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/**
 * Points on the drawn silhouette, already centred on the orbit target: hull
 * rings at every part boundary plus each fin's tip corners. Framing these
 * instead of a bounding box is what makes the *visible* rocket fill the frame
 * rather than an invisible box around it.
 *
 * Upright is the Flight pose: the model's +Y (nose) is world up, so the axial
 * coordinate runs along +Y; lying down, it runs along +X with the nose at +X.
 */
export function silhouettePoints(vehicle: RocketVehicle, layout: Layout, upright: boolean, ringSamples = 12): Vector[] {
  const half = layout.length / 2;
  const onCircle = (station: number, radius: number, angle: number): Vector => {
    const a = Math.cos(angle) * radius;
    const b = Math.sin(angle) * radius;
    // Station 0 is the nose. Both poses put it at +axial: the upright group
    // draws `y = length - station` above the floor, and the horizontal group
    // rotates the same +Y-nose model so the nose points at +X.
    const axial = half - station;
    return upright ? { x: a, y: axial, z: b } : { x: axial, y: a, z: b };
  };
  const points: Vector[] = [onCircle(0, 0, 0), onCircle(layout.length, 0, 0)];
  for (const component of vehicle.components) {
    const part = layout.parts[component.id];
    const radius = partRadius(component);
    if (part && radius !== null) {
      for (const station of [part.start, part.end]) {
        for (let i = 0; i < ringSamples; i++) points.push(onCircle(station, radius, (i / ringSamples) * Math.PI * 2));
      }
    }
    if ((component.type === 'trapezoidfinset' || component.type === 'ellipticalfinset' || component.type === 'freeformfinset') && part) {
      const root = layout.radiusAt(part.start);
      const tip = root + (component.type === 'freeformfinset'
        ? component.points.reduce((max, point) => Math.max(max, point.y), 0)
        : component.span);
      // The fin's outer edge runs over its own axial range: sample both ends.
      const axial: [number, number] = component.type === 'trapezoidfinset'
        ? [part.start + component.sweepLength, part.start + component.sweepLength + component.tipChord]
        : [part.start, part.start + (component.type === 'ellipticalfinset' ? component.rootChord : component.points.reduce((max, point) => Math.max(max, point.x), 0))];
      for (let i = 0; i < component.finCount; i++) {
        const angle = (i / component.finCount) * Math.PI * 2;
        for (const station of axial) points.push(onCircle(station, tip, angle));
      }
    }
  }
  return points;
}

/**
 * Sphere that contains the drawn model for *every* attitude about its centre:
 * a point at axial `a` and radial `ρ` sits at `hypot(a, ρ)`, and `a ≤ halfLength`,
 * `ρ ≤ radius`. Used for the Flight pose, where the drawn model is the same
 * silhouette rotated by a quaternion that changes every frame.
 *
 * Fitting this instead of the pose's instantaneous box costs 1.5% of the fill on
 * a slender rocket (hypot(1.485, 0.256) / 1.485 = 1.015) and buys two things: a
 * pose can never leave the frame, and the distance does not pulse while the
 * scrubber plays.
 */
export function envelopeRadius(halfLength: number, radius: number): number {
  return Math.hypot(Math.max(halfLength, 1e-3), Math.max(radius, 1e-3));
}

/** Well-distributed points on the envelope sphere, dense enough to size it exactly. */
export function envelopePoints(radius: number, count = 384): Vector[] {
  const points: Vector[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i + 0.5) / count * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push({ x: Math.cos(theta) * ring * radius, y: y * radius, z: Math.sin(theta) * ring * radius });
  }
  return points;
}

/** Rotate a point set about the origin by a quaternion. */
export function rotatePoints(points: readonly Vector[], q: { x: number; y: number; z: number; w: number }): Vector[] {
  const quaternion = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  return points.map((point) => {
    const v = new THREE.Vector3(point.x, point.y, point.z).applyQuaternion(quaternion);
    return { x: v.x, y: v.y, z: v.z };
  });
}

/** Camera up vector that stays non-degenerate when looking down an axis. */
export function upFor(direction: Vector): [number, number, number] {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  return Math.abs(direction.y / length) > 0.99
    ? [0, 0, direction.y > 0 ? -1 : 1]
    : [0, 1, 0];
}

interface ViewBasis { right: THREE.Vector3; up: THREE.Vector3; forward: THREE.Vector3; tanV: number; tanH: number }

function basisFor(direction: Vector, fovDeg: number, aspect: number): ViewBasis {
  const forward = new THREE.Vector3(direction.x, direction.y, direction.z).normalize().negate();
  const up = new THREE.Vector3(...upFor(direction)).normalize();
  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  return { right, up: new THREE.Vector3().crossVectors(forward, right).normalize(), forward, tanV, tanH: tanV * aspect };
}

/** NDC box (x, y ∈ [-1, 1]) of a point set for a camera `distance` along `direction`. */
export interface NdcBox { minX: number; maxX: number; minY: number; maxY: number }

/**
 * The shift is applied to the camera *and* its orbit target, so it leaves each
 * point's depth untouched and moves its screen position by `-shift/(depth·tan)`.
 */
function boxWith(basis: ViewBasis, points: readonly Vector[], distance: number, shift: Vector = { x: 0, y: 0, z: 0 }): NdcBox {
  const box: NdcBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const point of points) {
    const depth = distance + (point.x * basis.forward.x + point.y * basis.forward.y + point.z * basis.forward.z);
    if (depth <= 1e-6) return { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
    const x = (point.x * basis.right.x + point.y * basis.right.y + point.z * basis.right.z
      - (shift.x * basis.right.x + shift.y * basis.right.y + shift.z * basis.right.z)) / depth / basis.tanH;
    const y = (point.x * basis.up.x + point.y * basis.up.y + point.z * basis.up.z
      - (shift.x * basis.up.x + shift.y * basis.up.y + shift.z * basis.up.z)) / depth / basis.tanV;
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
  }
  return box;
}

/** Projected NDC box of a point set, for tests and the probe-facing frame report. */
export function projectedBox(points: readonly Vector[], direction: Vector, fovDeg: number, aspect: number, distance: number, shift?: Vector): NdcBox {
  return boxWith(basisFor(direction, fovDeg, aspect), points, distance, shift);
}

/**
 * Project points to canvas pixels with the same camera model as `projectedBox`.
 * Used for the silhouette hull the browser probe masks the floor against.
 */
export function projectedPoints(points: readonly Vector[], direction: Vector, fovDeg: number, aspect: number, distance: number, shift: Vector, canvas: { width: number; height: number }): { x: number; y: number }[] {
  const basis = basisFor(direction, fovDeg, aspect);
  const shiftRight = shift.x * basis.right.x + shift.y * basis.right.y + shift.z * basis.right.z;
  const shiftUp = shift.x * basis.up.x + shift.y * basis.up.y + shift.z * basis.up.z;
  return points.map((point) => {
    const depth = distance + (point.x * basis.forward.x + point.y * basis.forward.y + point.z * basis.forward.z);
    if (depth <= 1e-6) return { x: Number.NaN, y: Number.NaN };
    const x = (point.x * basis.right.x + point.y * basis.right.y + point.z * basis.right.z - shiftRight) / depth / basis.tanH;
    const y = (point.x * basis.up.x + point.y * basis.up.y + point.z * basis.up.z - shiftUp) / depth / basis.tanV;
    return { x: (x + 1) / 2 * canvas.width, y: (1 - y) / 2 * canvas.height };
  });
}

/** Screen extent of a point set as a fraction of the canvas width and height. */
function spanWith(basis: ViewBasis, points: readonly Vector[], distance: number): { x: number; y: number } {
  const box = boxWith(basis, points, distance);
  if (box.maxX < box.minX) return { x: 0, y: 0 };
  return { x: (box.maxX - box.minX) / 2, y: (box.maxY - box.minY) / 2 };
}

/**
 * Screen-space extent of a point set as a fraction of the canvas width/height,
 * for a camera at `distance` along `direction` looking at the origin.
 */
export function projectedFraction(points: readonly Vector[], direction: Vector, fovDeg: number, aspect: number, distance: number): { x: number; y: number } {
  return spanWith(basisFor(direction, fovDeg, aspect), points, distance);
}

/**
 * Distance at which the point set's projected *span* is `fill` of the tighter
 * canvas axis. Solved by bisection because a perspective projection is not
 * symmetric about the target: constraining the extremes independently would
 * under-fill the frame by 5–10% at the default ISO view.
 */
export function fitDistance(points: readonly Vector[], direction: Vector, fovDeg: number, aspect: number, fill = FIT_FRACTION): number {
  const basis = basisFor(direction, fovDeg, aspect);
  let near = 1e-3;
  let far = 1e4;
  for (let i = 0; i < 32; i++) {
    const mid = Math.sqrt(near * far);
    const span = spanWith(basis, points, mid);
    if (Math.max(span.x, span.y) > fill) near = mid; else far = mid;
  }
  return far;
}

export interface CameraFrame {
  distance: number;
  /** World offset added to both the orbit target and the camera, centring the model in the region. */
  shift: Vector;
  region: Rect;
  /** Projected half-extent of the fitted point set, as a fraction of the half-canvas. */
  span: { x: number; y: number };
}

/**
 * Frames a point set inside the largest free canvas region: distance first, then
 * a lateral shift so the model's projected box is centred in that region rather
 * than in the canvas. Repeats when a fitted box still lands under an overlay
 * (the first fit does not know where the model will end up).
 */
export function framePoints(points: readonly Vector[], direction: Vector, fovDeg: number, canvas: { width: number; height: number }, overlays: readonly Rect[] = [], fill = FIT_FRACTION): CameraFrame {
  const aspect = canvas.width / Math.max(canvas.height, 1);
  const basis = basisFor(direction, fovDeg, aspect);
  let region: Rect = { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height };
  let frame: CameraFrame = { distance: 1, shift: { x: 0, y: 0, z: 0 }, region, span: { x: 0, y: 0 } };
  for (let attempt = 0; attempt < 5; attempt++) {
    const limits = {
      x: Math.max(1e-3, (region.x1 - region.x0) / Math.max(canvas.width, 1)),
      y: Math.max(1e-3, (region.y1 - region.y0) / Math.max(canvas.height, 1)),
    };
    const centre = {
      x: ((region.x0 + region.x1) / 2) / Math.max(canvas.width, 1) * 2 - 1,
      y: 1 - ((region.y0 + region.y1) / 2) / Math.max(canvas.height, 1) * 2,
    };
    let distance = bisect(points, basis, limits, fill);
    let shift: Vector = { x: 0, y: 0, z: 0 };
    let box = boxWith(basis, points, distance, shift);
    for (let pass = 0; pass < 3; pass++) {
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      // Move the camera and the target by +s along right/up: the model's screen
      // position moves by −s, so s is measured from the box centre to the target.
      // Accumulate: a pass corrects whatever offset is left, it does not replace
      // the placement with its own (zero-centred) one.
      const sx = (cx - centre.x) * distance * basis.tanH;
      const sy = (cy - centre.y) * distance * basis.tanV;
      shift = {
        x: shift.x + basis.right.x * sx + basis.up.x * sy,
        y: shift.y + basis.right.y * sx + basis.up.y * sy,
        z: shift.z + basis.right.z * sx + basis.up.z * sy,
      };
      box = boxWith(basis, points, distance, shift);
      const overshoot = Math.max(
        (box.maxX - box.minX) / 2 / limits.x,
        (box.maxY - box.minY) / 2 / limits.y,
      ) / fill;
      if (overshoot <= 1.002) break;
      distance *= overshoot;
    }
    frame = { distance, shift, region, span: { x: (box.maxX - box.minX) / 2, y: (box.maxY - box.minY) / 2 } };
    const placed = ndcBoxToPixels(box, canvas);
    const hit = overlays.find((overlay) => intersects(placed, overlay, 1));
    if (!hit) break;
    const next = shrink(region, hit);
    if (next === null) break;
    region = next;
  }
  return frame;
}

function bisect(points: readonly Vector[], basis: ViewBasis, limits: { x: number; y: number }, fill: number): number {
  let near = 1e-3;
  let far = 1e4;
  for (let i = 0; i < 32; i++) {
    const mid = Math.sqrt(near * far);
    const box = boxWith(basis, points, mid);
    const fraction = Math.max(
      (box.maxX - box.minX) / 2 / limits.x,
      (box.maxY - box.minY) / 2 / limits.y,
    );
    if (Number.isNaN(fraction) || fraction > fill) near = mid; else far = mid;
  }
  return far;
}

/** Shrink a region away from the side an overlay occupies. */
function shrink(region: Rect, overlay: Rect, pad = OVERLAY_PAD): Rect | null {
  const cx = (region.x0 + region.x1) / 2;
  const cy = (region.y0 + region.y1) / 2;
  const candidates: Rect[] = [];
  if (overlay.x1 <= cx) candidates.push({ ...region, x0: overlay.x1 + pad });
  if (overlay.x0 >= cx) candidates.push({ ...region, x1: overlay.x0 - pad });
  if (overlay.y1 <= cy) candidates.push({ ...region, y0: overlay.y1 + pad });
  if (overlay.y0 >= cy) candidates.push({ ...region, y1: overlay.y0 - pad });
  let best: Rect | null = null;
  let area = -1;
  for (const candidate of candidates) {
    const w = candidate.x1 - candidate.x0;
    const h = candidate.y1 - candidate.y0;
    if (w < 24 || h < 24) continue;
    if (w * h > area) { area = w * h; best = candidate; }
  }
  return best;
}

export function contains(outer: Rect, inner: Rect, margin = 0): boolean {
  return inner.x0 >= outer.x0 - margin && inner.y0 >= outer.y0 - margin
    && inner.x1 <= outer.x1 + margin && inner.y1 <= outer.y1 + margin;
}

export function intersects(a: Rect, b: Rect, margin = 0): boolean {
  return a.x0 < b.x1 + margin && a.x1 > b.x0 - margin && a.y0 < b.y1 + margin && a.y1 > b.y0 - margin;
}

/** Convert an NDC box to canvas pixels. */
export function ndcBoxToPixels(box: NdcBox, canvas: { width: number; height: number }): Rect {
  return {
    x0: (box.minX + 1) / 2 * canvas.width,
    x1: (box.maxX + 1) / 2 * canvas.width,
    y0: (1 - box.maxY) / 2 * canvas.height,
    y1: (1 - box.minY) / 2 * canvas.height,
  };
}

/**
 * Convex hull of projected points (monotone chain). The probe uses it as the
 * rocket's on-screen silhouette, so floor pixels outside it can only be the
 * shadow — an axis-aligned box is too coarse for a tilted rocket.
 */
export function convexHull(points: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}
