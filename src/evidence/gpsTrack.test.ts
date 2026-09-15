/**
 * C12 GPS-track ingest + landing back-cast: parse, project, extract,
 * and report measured-vs-predicted touchdowns.
 */
import { describe, it, expect } from 'vitest';
import {
  backcastTouchdown,
  extractTouchdown,
  gpsAltitudeSeries,
  gpsToEnu,
  parseGpxTrack,
  InvalidGpxError,
} from './gpsTrack';

const GPX = `<?xml version="1.0" encoding="utf-8"?>
<gpx version="1.1" creator="astraea-test">
  <trk>
    <name>Flight 1</name>
    <trkseg>
      <trkpt lat="40.0000" lon="-105.0000"><ele>1650</ele><time>2026-09-01T12:00:00Z</time></trkpt>
      <trkpt lat="40.0010" lon="-105.0000"><ele>1800</ele><time>2026-09-01T12:00:10Z</time></trkpt>
      <trkpt lat="40.0010" lon="-104.9990"><time>2026-09-01T12:00:20Z</time></trkpt>
      <trkpt lat="40.0005" lon="-104.9995"><ele>1655</ele><time>2026-09-01T12:00:30Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe('parseGpxTrack', () => {
  it('parses fixes with pad-relative seconds and elevations', () => {
    const fixes = parseGpxTrack(GPX);
    expect(fixes.length).toBe(4);
    expect(fixes.map((f) => f.timeS)).toEqual([0, 10, 20, 30]);
    expect(fixes[0]).toMatchObject({ latDeg: 40, lonDeg: -105, eleM: 1650 });
    expect(fixes[2].eleM).toBeNull();
  });

  it('rejects empty, trackless, and malformed logs', () => {
    const onePoint = `<?xml version="1.0"?><gpx><trk><trkseg><trkpt lat="40" lon="-105"><ele>1</ele><time>2026-09-01T12:00:00Z</time></trkpt></trkseg></trk></gpx>`;
    expect(() => parseGpxTrack('')).toThrow(InvalidGpxError);
    expect(() => parseGpxTrack('<gpx><wpt lat="40" lon="-105"/></gpx>')).toThrow(/no trk/);
    expect(() => parseGpxTrack(GPX.replace('40.0000', '91.0'))).toThrow(/latitude/);
    expect(() =>
      parseGpxTrack(GPX.replace('2026-09-01T12:00:10Z', 'not-a-time'))
    ).toThrow(/parseable ISO time/);
    expect(() => parseGpxTrack(onePoint)).toThrow(/at least 2/);
  });
});

describe('gpsToEnu', () => {
  it('places the origin at the first fix with metric scale', () => {
    const { enu, origin } = gpsToEnu(parseGpxTrack(GPX));
    expect(origin).toEqual({ latDeg: 40, lonDeg: -105 });
    expect(enu[0].xM).toBeCloseTo(0, 9);
    expect(enu[0].yM).toBeCloseTo(0, 9);
    // 0.001° latitude ≈ 111.195 m at any latitude.
    expect(enu[1].yM).toBeCloseTo(111.195, 2);
    expect(enu[1].xM).toBeCloseTo(0, 6);
    // 0.001° longitude shrinks by cos(40°).
    expect(enu[2].xM).toBeCloseTo(111.195 * Math.cos((40 * Math.PI) / 180), 2);
  });
});

describe('gpsAltitudeSeries + extractTouchdown', () => {
  it('drops elevation-less fixes and takes the last fix as touchdown', () => {
    const { enu } = gpsToEnu(parseGpxTrack(GPX));
    const series = gpsAltitudeSeries(enu);
    expect(series.length).toBe(3);
    expect(series.map((s) => s.timeS)).toEqual([0, 10, 30]);
    const touchdown = extractTouchdown(enu);
    expect(touchdown.timeS).toBe(30);
    expect(touchdown.altM).toBe(1655);
    expect(touchdown.x).toBeCloseTo(enu[3].xM, 9);
  });
});

describe('backcastTouchdown', () => {
  const square = [
    { x: -100, y: -100 },
    { x: 100, y: -100 },
    { x: 100, y: 100 },
    { x: -100, y: 100 },
  ];

  it('reports distance, sigma radii, and polygon containment', () => {
    const report = backcastTouchdown(
      { x: 30, y: 40, timeS: 30, altM: 1655 },
      { mean: { x: 0, y: 0 }, sigma1: 50 },
      square
    );
    expect(report.distanceFromMeanM).toBeCloseTo(50, 9);
    expect(report.sigma1Radii).toBeCloseTo(1, 9);
    expect(report.insideWaiverPolygon).toBe(true);
  });

  it('marks outside points without claiming probabilities', () => {
    const report = backcastTouchdown(
      { x: 500, y: 0, timeS: 30, altM: 1650 },
      { mean: { x: 0, y: 0 }, sigma1: 50 },
      square
    );
    expect(report.insideWaiverPolygon).toBe(false);
    expect(report.sigma1Radii).toBeCloseTo(10, 9);
    const degenerate = backcastTouchdown(
      { x: 500, y: 0, timeS: 30, altM: null },
      { mean: { x: 0, y: 0 }, sigma1: 0 }
    );
    expect(degenerate.sigma1Radii).toBeNull();
    expect(degenerate.insideWaiverPolygon).toBeNull();
  });
});
