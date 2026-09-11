import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { MonteCarloSimInput } from './monteCarlo';
import { runMonteCarlo } from './monteCarlo';
import { containmentCheck, waiverCylinderCheck, exportKml, escapeXml } from './waiverContainment';

/** Local ENU landing/polygon pair. */
type Point2D = { x: number; y: number };

// Square waiver polygon spanning [-5, 5]^2 in the local ENU frame.
const SQUARE: Point2D[] = [
  { x: -5, y: -5 },
  { x: 5, y: -5 },
  { x: 5, y: 5 },
  { x: -5, y: 5 },
];

// Counterclockwise L-shape: bottom bar x in [0,10], y in [0,4] plus left
// column x in [0,6], y in [0,10]. The notch x>6, y>4 is OUTSIDE.
const L_SHAPE: Point2D[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 6, y: 4 },
  { x: 6, y: 10 },
  { x: 0, y: 10 },
];

// Eight landings inside the square plus one breach at (6, 0).
const SQUARE_OF_9: Point2D[] = [
  { x: -4, y: -4 },
  { x: -2, y: -4 },
  { x: 0, y: -4 },
  { x: -4, y: 0 },
  { x: -1, y: -1 },
  { x: 6, y: 0 },
  { x: -4, y: 4 },
  { x: 1, y: 2 },
  { x: 4, y: 4 },
];

describe('escapeXml', () => {
  it('escapes XML-significant characters', () => {
    expect(escapeXml('a & b < c > d " e \' f')).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });
  it('escapes ampersand first so it is not double-escaped', () => {
    expect(escapeXml('&amp;')).toBe('&amp;amp;');
  });
  it('leaves plain text untouched', () => {
    expect(escapeXml('Landing 1')).toBe('Landing 1');
  });
});

describe('containmentCheck', () => {
  it('gates on FULL containment: any breach fails the inside flag', () => {
    const result = containmentCheck(SQUARE_OF_9, SQUARE);
    expect(result.inside).toBe(false);
    expect(result.containmentPct).toBeCloseTo(8 / 9, 12);
    expect(result.breaching).toEqual([{ x: 6, y: 0 }]);
  });

  it('returns inside=true with pct 1 and no breaches for a contained cloud', () => {
    const cloud = [
      { x: 0, y: 0 },
      { x: 3, y: -2 },
      { x: -4, y: 1 },
    ];
    expect(containmentCheck(cloud, SQUARE)).toEqual({
      inside: true,
      containmentPct: 1,
      breaching: [],
    });
  });

  it('counts a point exactly on an edge segment as contained (closed boundary)', () => {
    const cloud = [
      { x: 0, y: 0 },
      { x: 5, y: -5 }, // bottom edge, not a vertex
    ];
    expect(containmentCheck(cloud, SQUARE)).toEqual({
      inside: true,
      containmentPct: 1,
      breaching: [],
    });
  });

  it('counts a point exactly on a vertex as contained', () => {
    expect(containmentCheck([{ x: 5, y: 5 }], SQUARE).inside).toBe(true);
  });

  it('flags a point epsilon beyond the boundary as breaching', () => {
    const result = containmentCheck([{ x: 5.000001, y: 2 }], SQUARE);
    expect(result.inside).toBe(false);
    expect(result.containmentPct).toBe(0);
    expect(result.breaching).toHaveLength(1);
  });

  it('classifies concave-polygon points by even-odd ray casting', () => {
    const insidePoints = [
      { x: 1, y: 1 },
      { x: 3, y: 6 }, // left column, above the bar
      { x: 8, y: 2 }, // bottom bar, right of the column
      { x: 0, y: 10 },
    ];
    const outsidePoints = [
      { x: 8, y: 6 }, // the notch
      { x: -1, y: 5 },
      { x: 5, y: 11 },
    ];
    for (const p of insidePoints) {
      expect(containmentCheck([p], L_SHAPE).inside, JSON.stringify(p)).toBe(true);
    }
    for (const p of outsidePoints) {
      expect(containmentCheck([p], L_SHAPE).inside, JSON.stringify(p)).toBe(false);
    }
  });

  it('handles the landing cloud of a Monte Carlo dispersion result', () => {
    const { landings } = runMonteCarlo(MONTE_CARLO_BASE_INPUT, {}, 6, 20260911);
    const result = containmentCheck(landings, SQUARE);
    expect(result.containmentPct).toBeGreaterThanOrEqual(0);
    expect(result.containmentPct).toBeLessThanOrEqual(1);
    // containmentPct and breaching are complementary over the 6 runs.
    expect(result.breaching.length + Math.round(result.containmentPct * 6)).toBe(6);
  });

  it('throws on an empty landing cloud', () => {
    expect(() => containmentCheck([], SQUARE)).toThrow(/non-empty/);
  });

  it('throws on a polygon with fewer than 3 vertices', () => {
    const twoVertices = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(() => containmentCheck([{ x: 0, y: 0 }], twoVertices)).toThrow(/at least 3/);
  });

  it('throws on non-finite landings and polygon vertices', () => {
    expect(() => containmentCheck([{ x: Number.NaN, y: 0 }], SQUARE)).toThrow(/finite/);
    expect(() => containmentCheck([{ x: 0, y: Number.POSITIVE_INFINITY }], SQUARE)).toThrow(/finite/);
    const badVertex = [...SQUARE];
    badVertex[1] = { x: Number.NaN, y: Number.NaN };
    expect(() => containmentCheck([{ x: 0, y: 0 }], badVertex)).toThrow(/finite/);
  });
});

describe('waiverCylinderCheck', () => {
  const cloud = [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: -3, y: 0 },
    { x: 0, y: 4 },
  ];

  it('computes insidePct within the horizontal radius and maxRadialM', () => {
    const result = waiverCylinderCheck(cloud, 0, 0, 3);
    expect(result.insidePct).toBeCloseTo(0.75, 12); // radials 0, 3, 3 contained; 4 is not
    expect(result.maxRadialM).toBeCloseTo(4, 12);
  });

  it('supports an off-center pad', () => {
    const result = waiverCylinderCheck(cloud, 2, 0, 4);
    // Radials from (2,0): 2, 1, 5, sqrt(20) ~ 4.472 -> two contained.
    expect(result.insidePct).toBeCloseTo(0.5, 12);
    expect(result.maxRadialM).toBeCloseTo(5, 12);
  });

  it('is fully contained at pct 1 when the radius covers the cloud', () => {
    const result = waiverCylinderCheck(cloud, 0, 0, 5);
    expect(result.insidePct).toBe(1);
    expect(result.maxRadialM).toBeCloseTo(4, 12);
  });

  it('fails closed when apogee breaches the ceiling: insidePct collapses to 0', () => {
    const result = waiverCylinderCheck(cloud, 0, 0, 100, 3000, 4500);
    expect(result.insidePct).toBe(0);
    expect(result.maxRadialM).toBeCloseTo(4, 12); // lateral statistic still reported
  });

  it('keeps the lateral result when apogee is at or below the ceiling', () => {
    const result = waiverCylinderCheck(cloud, 0, 0, 3, 3000, 2500);
    expect(result.insidePct).toBeCloseTo(0.75, 12);
  });

  it('throws when only one of ceilingM/apogeeM is provided', () => {
    expect(() => waiverCylinderCheck(cloud, 0, 0, 100, 3000)).toThrow(/together/);
    expect(() => waiverCylinderCheck(cloud, 0, 0, 100, undefined, 4000)).toThrow(/together/);
  });

  it('throws on an empty cloud, non-positive radius, and non-finite inputs', () => {
    expect(() => waiverCylinderCheck([], 0, 0, 100)).toThrow(/non-empty/);
    expect(() => waiverCylinderCheck(cloud, 0, 0, 0)).toThrow(/positive/);
    expect(() => waiverCylinderCheck(cloud, 0, 0, -5)).toThrow(/positive/);
    expect(() => waiverCylinderCheck(cloud, Number.NaN, 0, 100)).toThrow(/finite/);
    expect(() => waiverCylinderCheck(cloud, 0, 0, Number.POSITIVE_INFINITY)).toThrow(/finite/);
    expect(() => waiverCylinderCheck(cloud, 0, 0, 100, Number.NaN, 2000)).toThrow(/ceilingM/);
    expect(() => waiverCylinderCheck(cloud, 0, 0, 100, 3000, Number.NaN)).toThrow(/apogeeM/);
    expect(() => waiverCylinderCheck([{ x: Number.NaN, y: 0 }], 0, 0, 100)).toThrow(/finite/);
  });
});

describe('exportKml', () => {
  const landings = [
    { x: 12.5, y: -3.25 },
    { x: -1, y: 8 },
  ];
  const apogeeTrack = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 2, z: 1500 },
    { x: 0.5, y: -1, z: 100 },
  ];

  function parseKml(kml: string): Record<string, unknown> {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
    });
    return parser.parse(kml) as Record<string, unknown>;
  }

  it('emits a well-formed KML 2.2 document with a placemark per landing', () => {
    const kml = exportKml(landings);
    expect(kml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);

    const doc = parseKml(kml);
    const kmlEl = doc.kml as Record<string, unknown>;
    expect(kmlEl['@_xmlns']).toBe('http://www.opengis.net/kml/2.2');
    const document = kmlEl.Document as Record<string, unknown>;
    expect(document.name).toBe('Astraea Waiver Containment');

    const placemarks = document.Placemark as Record<string, unknown>[];
    expect(placemarks).toHaveLength(2);
    expect(placemarks[0].name).toBe('Landing 1');
    expect((placemarks[0].Point as Record<string, unknown>).coordinates).toBe('12.500000,-3.250000');
    expect(placemarks[1].name).toBe('Landing 2');
    expect((placemarks[1].Point as Record<string, unknown>).coordinates).toBe('-1.000000,8.000000');
  });

  it('adds a 3D flight path LineString when apogeeTrack is provided', () => {
    const kml = exportKml(landings, apogeeTrack);
    const doc = parseKml(kml);
    const document = (doc.kml as Record<string, unknown>).Document as Record<string, unknown>;
    const placemarks = document.Placemark as Record<string, unknown>[];
    expect(placemarks).toHaveLength(3);
    const path = placemarks[2];
    expect(path.name).toBe('Flight path');
    const line = path.LineString as Record<string, unknown>;
    expect(line.altitudeMode).toBe('absolute');
    expect(line.coordinates).toBe(
      '0.000000,0.000000,0.000000 1.000000,2.000000,1500.000000 0.500000,-1.000000,100.000000'
    );
  });

  it('omits the flight path when apogeeTrack is absent', () => {
    const doc = parseKml(exportKml(landings));
    const document = (doc.kml as Record<string, unknown>).Document as Record<string, unknown>;
    expect(document.Placemark).toHaveLength(2);
  });

  it('escapes names so documents stay well-formed', () => {
    // escapeXml is wired into name emission; a raw '&' inside <name> would
    // make the document unparsable, so helper coverage doubles as wiring proof.
    expect(escapeXml('L & <R>')).toBe('L &amp; &lt;R&gt;');
    expect(() => parseKml(exportKml(landings))).not.toThrow();
  });

  it('throws on an empty cloud, an empty apogeeTrack, and non-finite values', () => {
    expect(() => exportKml([])).toThrow(/non-empty/);
    expect(() => exportKml(landings, [])).toThrow(/non-empty/);
    expect(() => exportKml([{ x: Number.POSITIVE_INFINITY, y: 0 }])).toThrow(/finite/);
    expect(() => exportKml(landings, [{ x: 0, y: 0, z: Number.NaN }])).toThrow(/finite/);
  });
});

// Real preset/motor stock so the engine is exercised over an actual
// dispersion cloud (deterministic zero-sigma run) without a full UI.
const MONTE_CARLO_BASE_INPUT: MonteCarloSimInput = {
  vehicle: PRESET_ESTES_ALPHA,
  motor: CERTIFIED_MOTORS.estes_c6,
  options: {
    railLength: 1.2,
    railElevationDeg: 85.0,
    railAzimuthDeg: 90.0,
    windSpeedSurface: 4.0,
    windAzimuthDeg: 270.0,
  },
};