import { describe, expect, it } from 'vitest';
import { PRESET_NASA_STUDENT_LAUNCH } from '../../state/presets';
import type { Layout } from './Vehicle3D';
import { vehicleBounds } from './appearance';
import { viewcubeRect } from './overlays';
import {
  FIT_FRACTION, contains, convexHull, envelopePoints, envelopeRadius, fitDistance, framePoints, intersects,
  ndcBoxToPixels, projectedBox, projectedFraction, projectedPoints, rotatePoints, silhouettePoints,
  type Rect, type Vector,
} from './framing';

/** Layout for the NASA preset at its documented stations (0.65 / 1.40 / 1.52 / 2.97). */
function nasaLayout(): Layout {
  const parts = {
    'nsl-nc': { start: 0, end: 0.65, cg: 0.3, mass: 1.14 },
    'nsl-bt1': { start: 0.65, end: 1.4, cg: 1.0, mass: 2.27 },
    'nsl-trans': { start: 1.4, end: 1.52, cg: 1.46, mass: 0.455 },
    'nsl-bt2': { start: 1.52, end: 2.97, cg: 2.24, mass: 4.38 },
    'nsl-fins': { start: 2.62, end: 2.94, cg: 2.81, mass: 1.18 },
  };
  return { length: 2.97, parts, radiusAt: () => 0.076, refR: 0.076 };
}

const layout = nasaLayout();
const bounds = vehicleBounds(PRESET_NASA_STUDENT_LAUNCH, layout);
const flat = silhouettePoints(PRESET_NASA_STUDENT_LAUNCH, layout, false);
const upright = silhouettePoints(PRESET_NASA_STUDENT_LAUNCH, layout, true);
const directions = {
  iso: { x: 0.18, y: 0.32, z: 0.82 },
  side: { x: 0, y: 0, z: 1 },
  top: { x: 0, y: 1, z: 0.001 },
  aft: { x: -1, y: 0, z: 0.001 },
};
const aspects = [1600 / 1000, 1031 / 596, 1280 / 800, 1024 / 768, 0.75, 2.7];

describe('perspective projection', () => {
  it('projects a nearer point larger than one at the target or beyond it', () => {
    // Catches a flipped depth term: with `depth = d - p·forward` the near point
    // is pushed away instead of pulled closer.
    const direction = { x: 0, y: 0, z: 1 };
    const aspect = 1;
    // Two points per depth: the reported number is a span, so a single point
    // has zero extent.
    const pair = (z: number) => [{ x: -1, y: 0, z }, { x: 1, y: 0, z }];
    const near = projectedFraction(pair(1), direction, 32, aspect, 2);
    const origin = projectedFraction(pair(0), direction, 32, aspect, 2);
    const beyond = projectedFraction(pair(-1), direction, 32, aspect, 2);
    const tan = Math.tan((32 * Math.PI) / 360);
    // depth 1, 2, 3 respectively: 1/(depth·tan)
    expect(near.x).toBeCloseTo(1 / (1 * tan), 6);
    expect(origin.x).toBeCloseTo(1 / (2 * tan), 6);
    expect(beyond.x).toBeCloseTo(1 / (3 * tan), 6);
    expect(near.x).toBeGreaterThan(origin.x);
    expect(beyond.x).toBeLessThan(origin.x);
  });

  it('scales with the canvas aspect on the horizontal axis only', () => {
    const direction = { x: 0, y: 0, z: 1 };
    const wide = projectedFraction([{ x: -1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }], direction, 32, 2, 3);
    expect(wide.x).toBeCloseTo(wide.y / 2, 6);
  });

  it('moves a point by exactly the screen offset the camera shift asks for', () => {
    // The centring shift is only correct if a world shift along the camera basis
    // maps to a known NDC offset. One pixel of error here walks the model under
    // a toolbar at some canvas size.
    const canvas = { width: 800, height: 400 };
    const direction = { x: 0.3, y: 0.2, z: 0.9 };
    const length = Math.hypot(direction.z, -direction.x);
    const right = { x: -direction.z / length, y: 0, z: direction.x / length };
    const points = [{ x: 0, y: 0, z: 0 }, { x: 0.4, y: 0.2, z: -0.1 }];
    const before = ndcBoxToPixels(projectedBox(points, direction, 32, 2, 5), canvas);
    const shifted = ndcBoxToPixels(projectedBox(points, direction, 32, 2, 5, { x: right.x * 0.1, y: 0, z: right.z * 0.1 }), canvas);
    const tanV = Math.tan((32 * Math.PI) / 360);
    // 0.1 world units along `right` at depth ≈ 5 is 0.1/(5·tanH) in NDC x.
    const expected = 0.1 / (5 * tanV * 2) * canvas.width / 2;
    expect(before.x0 - shifted.x0).toBeCloseTo(expected, 0);
  });
});

describe('camera framing', () => {
  it('fills 80% of the limiting dimension at every aspect and view', () => {
    for (const aspect of aspects) {
      for (const direction of Object.values(directions)) {
        const distance = fitDistance(flat, direction, 32, aspect, 0.8);
        const fraction = projectedFraction(flat, direction, 32, aspect, distance);
        expect(Math.max(fraction.x, fraction.y)).toBeCloseTo(0.8, 5);
        expect(Math.min(fraction.x, fraction.y)).toBeLessThanOrEqual(0.8);
      }
    }
  });

  it('keeps the drawn silhouette between 75% and 85% for every view', () => {
    for (const aspect of aspects) {
      for (const direction of Object.values(directions)) {
        const distance = fitDistance(flat, direction, 32, aspect, 0.8);
        const fraction = projectedFraction(flat, direction, 32, aspect, distance);
        expect(Math.max(fraction.x, fraction.y)).toBeGreaterThan(0.75);
        expect(Math.max(fraction.x, fraction.y)).toBeLessThan(0.85);
      }
    }
  });

  it('puts the fitted distance in a believable range for the NASA preset', () => {
    // 2.97 m rocket, 32° fov, 1031×596 canvas: the fit lands near 4 m, not the
    // 1.5 m a flipped depth term produced (which over-filled the canvas 2.6×).
    const distance = fitDistance(flat, directions.iso, 32, 1031 / 596, 0.8);
    expect(distance).toBeGreaterThan(3.4);
    expect(distance).toBeLessThan(5.2);
  });

  it('frames the upright Flight pose by its height', () => {
    for (const aspect of aspects) {
      const direction = { x: 0.62, y: 0.2, z: 0.62 };
      const distance = fitDistance(upright, direction, 32, aspect, 0.8);
      const fraction = projectedFraction(upright, direction, 32, aspect, distance);
      expect(Math.max(fraction.x, fraction.y)).toBeCloseTo(0.8, 5);
      if (aspect >= 1) expect(fraction.y).toBeCloseTo(0.8, 5);
    }
  });

  it('rejects the previous fixed-distance framing (the test can fail)', () => {
    // The pre-change rig used max(L·1.25 + 0.3, (L/2 + 0.1)/sin(halfFov)) with a
    // flat 32° fov; at this aspect that framed the same model well below 75%.
    const aspect = 1600 / 1000;
    const halfFov = Math.atan(Math.tan((32 * Math.PI) / 360) * Math.min(1, aspect));
    const legacy = Math.max(bounds.halfLength * 2 * 1.25 + 0.3, (bounds.halfLength + 0.1) / Math.sin(halfFov));
    const silhouette = projectedFraction(flat, directions.iso, 32, aspect, legacy);
    expect(Math.max(silhouette.x, silhouette.y)).toBeLessThan(0.75);
    expect(fitDistance(flat, directions.iso, 32, aspect, 0.8)).toBeLessThan(legacy);
  });

  it('frames a short, wide vehicle without putting a point behind the camera', () => {
    const short = { ...layout, length: 0.3 };
    const points = silhouettePoints(PRESET_NASA_STUDENT_LAUNCH, short, false);
    const distance = fitDistance(points, directions.iso, 32, 1.6, 0.8);
    expect(distance).toBeGreaterThan(0);
    expect(Number.isFinite(projectedFraction(points, directions.iso, 32, 1.6, distance).x)).toBe(true);
  });
});

describe('silhouette points', () => {
  it('are centred on the orbit target and reach the fin tips', () => {
    const axial = flat.map((p) => (p.x as number));
    expect(Math.min(...axial)).toBeCloseTo(-layout.length / 2, 6);
    expect(Math.max(...axial)).toBeCloseTo(layout.length / 2, 6);
    const radial = Math.max(...flat.map((p) => Math.hypot(p.y, p.z)));
    expect(radial).toBeCloseTo(0.256, 3);
    // The nose is the +axial end in both poses: the model is drawn with its nose
    // at +X lying down and at the top of the frame upright, so a fit that
    // mirrors it puts the fins where the nose is.
    const nose = flat.reduce((best, p) => (p.x > best.x ? p : best));
    expect(Math.hypot(nose.y, nose.z)).toBeCloseTo(0, 6);
    const tips = flat.filter((p) => Math.hypot(p.y, p.z) > 0.2).map((p) => p.x);
    expect(Math.min(...tips)).toBeLessThan(0);
    // Upright: the same points stand on the target, nose up.
    const vertical = upright.map((p) => p.y);
    expect(Math.max(...vertical)).toBeCloseTo(layout.length / 2, 6);
    expect(Math.min(...vertical)).toBeCloseTo(-layout.length / 2, 6);
  });
});

describe('flight envelope', () => {
  const radius = envelopeRadius(bounds.halfLength, bounds.radius);

  it('contains the whole drawn model from every attitude', () => {
    expect(radius).toBeCloseTo(Math.hypot(1.485, 0.256), 9);
    // A slender rocket pays 1.5% of fill for a pose-invariant fit.
    expect(radius / bounds.halfLength).toBeLessThan(1.02);
    for (const point of envelopePoints(radius)) expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(radius, 6);
    for (const point of upright) expect(Math.hypot(point.x, point.y, point.z)).toBeLessThanOrEqual(radius + 1e-9);
    for (const point of flat) expect(Math.hypot(point.x, point.y, point.z)).toBeLessThanOrEqual(radius + 1e-9);
  });

  /** The chrome Flight draws over the canvas, measured from the built app. */
  const flightChrome = (width: number, height: number): Rect[] => [
    { x0: 8, y0: 8, x1: 220, y1: 34 },                    // Play / Full flight / ISO strip
    { x0: width - 220, y0: 48, x1: width - 12, y1: 198 }, // pose readout card
    { x0: 12, y0: height - 30, x1: width - 12, y1: height - 10 }, // scrubber
  ];

  const attitudes = [0, 20, 45, 70, 90, 135, 180].flatMap((deg) => {
    const half = (deg * Math.PI) / 360;
    return [
      { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) },
      { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) },
      { x: Math.sin(half) * 0.7, y: Math.sin(half) * 0.5, z: Math.sin(half) * 0.5, w: Math.cos(half) },
    ];
  });

  it('keeps the posed rocket inside the free region at every attitude', () => {
    for (const canvas of [{ width: 956, height: 378 }, { width: 636, height: 168 }, { width: 520, height: 320 }]) {
      const overlays = flightChrome(canvas.width, canvas.height);
      const frame = framePoints(envelopePoints(radius), { x: 0.62, y: 0.2, z: 0.62 }, 32, canvas, overlays);
      expect(frame.region.x1 - frame.region.x0).toBeGreaterThan(24);
      expect(frame.region.y1 - frame.region.y0).toBeGreaterThan(24);
      // The envelope — the worst case over attitudes — fills 80% of the
      // region's limiting axis.
      const envelopeBox = ndcBoxToPixels(projectedBox(envelopePoints(radius), { x: 0.62, y: 0.2, z: 0.62 }, 32, canvas.width / canvas.height, frame.distance, frame.shift), canvas);
      const limiting = Math.min(frame.region.x1 - frame.region.x0, frame.region.y1 - frame.region.y0);
      const envelopeSpan = Math.max(envelopeBox.x1 - envelopeBox.x0, envelopeBox.y1 - envelopeBox.y0);
      // The sampled sphere is a couple of percent off square, so it fills the
      // limiting axis to within that, and never exceeds the axis with more room.
      expect(envelopeSpan).toBeGreaterThan(0.95 * 0.8 * limiting);
      expect(Math.min(envelopeBox.x1 - envelopeBox.x0, envelopeBox.y1 - envelopeBox.y0)).toBeLessThanOrEqual(0.8 * Math.max(frame.region.x1 - frame.region.x0, frame.region.y1 - frame.region.y0) + 1);
      for (const attitude of attitudes) {
        const posed = rotatePoints(upright, attitude);
        const box = ndcBoxToPixels(projectedBox(posed, { x: 0.62, y: 0.2, z: 0.62 }, 32, canvas.width / canvas.height, frame.distance, frame.shift), canvas);
        expect(contains(frame.region, box, 0.5), `${canvas.width}×${canvas.height} attitude ${JSON.stringify(attitude)} box ${JSON.stringify(box)} region ${JSON.stringify(frame.region)}`).toBe(true);
        for (const overlay of overlays) expect(intersects(box, overlay, -1)).toBe(false);
        expect(box.x0).toBeGreaterThanOrEqual(0);
        expect(box.y0).toBeGreaterThanOrEqual(0);
        expect(box.x1).toBeLessThanOrEqual(canvas.width);
        expect(box.y1).toBeLessThanOrEqual(canvas.height);
        // Never a speck: even a pose that points along the view axis still
        // draws the body, so the distance cannot be inflated to hide a clip.
        expect(Math.max(box.x1 - box.x0, box.y1 - box.y0)).toBeGreaterThan(0.2 * limiting);
      }
    }
  });

  it('keeps the posed rocket out of the bottom-right viewcube corner', () => {
    // Flight draws the viewcube in the HUD, so the fit must reserve its
    // footprint explicitly. On a wide canvas the fitted envelope never reaches
    // the corner, so reserving it must not cost the frame; on a narrow one the
    // region has to give way.
    const direction = { x: 0.62, y: 0.2, z: 0.62 };
    const chrome = (canvas: { width: number; height: number }): Rect[] => [
      { x0: 8, y0: 8, x1: 220, y1: 34 },
      { x0: 12, y0: canvas.height - 30, x1: canvas.width - 12, y1: canvas.height - 10 },
    ];
    for (const canvas of [{ width: 956, height: 326 }, { width: 1031, height: 480 }]) {
      const cube = viewcubeRect(canvas.width, canvas.height);
      const framed = framePoints(envelopePoints(radius), direction, 32, canvas, [...chrome(canvas), cube]);
      const bare = framePoints(envelopePoints(radius), direction, 32, canvas, chrome(canvas));
      expect(framed.distance).toBeCloseTo(bare.distance, 6);
      expect(framed.region).toEqual(bare.region);
      for (const attitude of attitudes) {
        const posed = rotatePoints(upright, attitude);
        const box = ndcBoxToPixels(projectedBox(posed, direction, 32, canvas.width / canvas.height, framed.distance, framed.shift), canvas);
        expect(intersects(box, cube, -1), `${canvas.width}×${canvas.height} attitude ${JSON.stringify(attitude)} box ${JSON.stringify(box)} cube ${JSON.stringify(cube)}`).toBe(false);
        expect(contains(framed.region, box, 0.5)).toBe(true);
        expect(box.x1).toBeLessThanOrEqual(cube.x0);
      }
    }
    // Narrower than the fitted box plus the corner: the region must shrink so a
    // tilt can never cross the cube, and every pose must stay inside it.
    const canvas = { width: 420, height: 320 };
    const cube = viewcubeRect(canvas.width, canvas.height);
    const framed = framePoints(envelopePoints(radius), direction, 32, canvas, [...chrome(canvas), cube]);
    expect(framed.region.x1).toBeLessThanOrEqual(cube.x0);
    for (const attitude of attitudes) {
      const posed = rotatePoints(upright, attitude);
      const box = ndcBoxToPixels(projectedBox(posed, direction, 32, canvas.width / canvas.height, framed.distance, framed.shift), canvas);
      expect(intersects(box, cube, -1), `narrow attitude ${JSON.stringify(attitude)} box ${JSON.stringify(box)} cube ${JSON.stringify(cube)}`).toBe(false);
      expect(contains(framed.region, box, 0.5)).toBe(true);
    }
  });

  it('does not shrink the frame for a card the upright rocket never reaches', () => {
    // The pose card sits at the top right of a wide canvas; an upright rocket is
    // thin and centred, so reserving the card's full width would make the model
    // needlessly small. The no-overlay fit must survive.
    const canvas = { width: 956, height: 378 };
    const direction = { x: 0.62, y: 0.2, z: 0.62 };
    const bare = framePoints(envelopePoints(radius), direction, 32, canvas, []);
    const carded = framePoints(envelopePoints(radius), direction, 32, canvas, [{ x0: 736, y0: 48, x1: 944, y1: 198 }]);
    expect(carded.distance).toBeCloseTo(bare.distance, 6);
    expect(carded.region).toEqual(bare.region);
  });

  it('drops below the compact pose strip when it covers the canvas', () => {
    // 1280×800 Flight: a 636×168 canvas with a full-width pose strip at the top
    // and the scrubber at the bottom. The strip at y 44–72 is what clipped the
    // rocket's fins in the review.
    const canvas = { width: 636, height: 168 };
    const strip: Rect = { x0: 12, y0: 44, x1: 624, y1: 72 };
    const scrubber: Rect = { x0: 12, y0: 138, x1: 624, y1: 158 };
    const frame = framePoints(envelopePoints(radius), { x: 0.62, y: 0.2, z: 0.62 }, 32, canvas, [strip, scrubber]);
    expect(frame.region.y0).toBeGreaterThanOrEqual(strip.y1 + 3);
    expect(frame.region.y1).toBeLessThanOrEqual(scrubber.y0 - 3);
    const box = ndcBoxToPixels(projectedBox(envelopePoints(radius), { x: 0.62, y: 0.2, z: 0.62 }, 32, canvas.width / canvas.height, frame.distance, frame.shift), canvas);
    expect(intersects(box, strip)).toBe(false);
    expect(intersects(box, scrubber)).toBe(false);
    expect(contains(frame.region, box, 1)).toBe(true);
  });

  it('proves the unposed fit could leave the frame (the test can fail)', () => {
    // Before the fix: fit the *unposed* silhouette to the whole canvas, then
    // pose the model. A tilted pose magnified by perspective escapes the top.
    const canvas = { width: 636, height: 168 };
    const direction = { x: 0.62, y: 0.2, z: 0.62 };
    const distance = fitDistance(upright, direction, 32, canvas.width / canvas.height, FIT_FRACTION);
    const box = ndcBoxToPixels(projectedBox(rotatePoints(upright, { x: 0.4, y: 0.2, z: 0.3, w: 0.84 }), direction, 32, canvas.width / canvas.height, distance), canvas);
    const strip: Rect = { x0: 12, y0: 44, x1: 624, y1: 72 };
    expect(intersects(box, strip)).toBe(true);
  });
});

describe('screen helpers', () => {
  it('converts an NDC box to pixels', () => {
    expect(ndcBoxToPixels({ minX: -0.5, maxX: 0.5, minY: -0.5, maxY: 0.5 }, { width: 100, height: 50 }))
      .toEqual({ x0: 25, x1: 75, y0: 12.5, y1: 37.5 });
  });

  it('projects points to pixels with the same camera as the box fit', () => {
    const canvas = { width: 800, height: 400 };
    const direction = { x: 0, y: 0, z: 1 };
    const points = [{ x: -1, y: -0.5, z: 0 }, { x: 1, y: 0.5, z: 0 }];
    const px = projectedPoints(points, direction, 32, 2, 4, { x: 0, y: 0, z: 0 }, canvas);
    const box = ndcBoxToPixels(projectedBox(points, direction, 32, 2, 4), canvas);
    expect(Math.min(...px.map((p) => p.x))).toBeCloseTo(box.x0, 6);
    expect(Math.max(...px.map((p) => p.x))).toBeCloseTo(box.x1, 6);
    expect(Math.min(...px.map((p) => p.y))).toBeCloseTo(box.y0, 6);
    expect(Math.max(...px.map((p) => p.y))).toBeCloseTo(box.y1, 6);
    // A shift moves the pixels by the offset the fit asked for. For this view
    // the camera's right is −X, so a −X shift moves the model left on screen.
    const shifted = projectedPoints(points, direction, 32, 2, 4, { x: -0.2, y: 0, z: 0 }, canvas);
    expect(shifted[0].x).toBeLessThan(px[0].x);
  });

  it('hulls a point cloud and degrades to the points themselves', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }];
    const hull = convexHull(square);
    expect(hull).toHaveLength(4);
    for (const corner of [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]) {
      expect(hull.some((p) => p.x === corner.x && p.y === corner.y)).toBe(true);
    }
    expect(hull.some((p) => p.x === 5 && p.y === 5)).toBe(false);
    // Collinear and degenerate inputs must not throw or drop the extremes.
    expect(convexHull([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }])).toHaveLength(2);
    expect(convexHull([{ x: 3, y: 4 }])).toEqual([{ x: 3, y: 4 }]);
  });

  it('reports containment and overlap strictly, with an optional margin', () => {
    const outer: Rect = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(contains(outer, { x0: 1, y0: 1, x1: 9, y1: 9 })).toBe(true);
    expect(contains(outer, { x0: -1, y0: 1, x1: 9, y1: 9 })).toBe(false);
    expect(intersects(outer, { x0: 9, y0: 0, x1: 20, y1: 10 })).toBe(true);
    expect(intersects(outer, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(false);
    expect(intersects(outer, { x0: 21, y0: 0, x1: 30, y1: 10 }, 12)).toBe(true);
  });
});

export type { Vector };
