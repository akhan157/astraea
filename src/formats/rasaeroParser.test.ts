import { describe, it, expect } from 'vitest';
import {
  parseCdx1,
  InvalidCdx1FileError,
  exportCdx1,
  METERS_TO_INCHES,
} from './rasaero';
import { RocketComponent } from '../core/types';

/**
 * Parse direction of the RASAero II (.cdx1) adapter (matrix row 8):
 * export-to-import station fidelity plus fail-closed malformed-input
 * rejection. Import is reference/display geometry only — station rows
 * underdetermine component part types, so no editable part fitting is
 * invented or asserted here.
 */

function fixtureComponents(): RocketComponent[] {
  return [
    {
      id: 'nose',
      name: 'Ogive Nose',
      type: 'nosecone',
      materialId: 'fiberglass',
      shape: 'ogive',
      length: 0.3,
      baseDiameter: 0.06,
      wallThickness: 0.002,
      isHollow: true,
    },
    {
      id: 'tube',
      name: 'Main Tube',
      type: 'bodytube',
      materialId: 'cardboard',
      length: 0.6,
      outerDiameter: 0.06,
      innerDiameter: 0.056,
    },
    {
      id: 'boat',
      name: 'Boattail',
      type: 'transition',
      materialId: 'fiberglass',
      length: 0.15,
      foreDiameter: 0.06,
      aftDiameter: 0.04,
      wallThickness: 0.002,
      isHollow: true,
    },
    {
      id: 'fins',
      name: 'Tail Fins',
      type: 'trapezoidfinset',
      materialId: 'balsa',
      finCount: 4,
      rootChord: 0.09,
      tipChord: 0.04,
      span: 0.05,
      sweepLength: 0.03,
      thickness: 0.003,
      crossSection: 'square',
      axialOffset: 0.45,
    },
    {
      id: 'payload',
      name: 'Altimeter Sled',
      type: 'masscomponent',
      materialId: 'aluminum',
      mass: 0.1,
      length: 0.12,
      axialOffset: 0.1,
    },
    {
      id: 'chute',
      name: 'Drogue',
      type: 'parachute',
      materialId: 'nylon',
      diameter: 0.4,
      cd: 0.8,
      mass: 0.025,
      axialOffset: 0.2,
    },
  ];
}

describe('RASAero II (.cdx1) Outer Mold Line Import', () => {
  it('round-trips exported OML stations with station fidelity', () => {
    const cdx1 = exportCdx1(fixtureComponents());
    const parsed = parseCdx1(cdx1);

    expect(parsed.stations.length).toBe(6);
    // OML stations the exporter must emit for the fixture, in meters (the
    // nose cone base, tube aft, then boattail aft with co-located fins,
    // payload, and parachute stations repeating the same X).
    const expectedMeters: Array<[number, number]> = [
      [0.3, 0.06],
      [0.9, 0.06],
      [1.05, 0.04],
      [1.05, 0.04],
      [1.05, 0.04],
      [1.05, 0.04],
    ];
    const expected = expectedMeters.map(
      ([xM, dM]) => [xM * METERS_TO_INCHES, dM * METERS_TO_INCHES] as [number, number],
    );
    parsed.stations.forEach((station, i) => {
      expect(station.xInches).toBeCloseTo(expected[i][0], 4);
      expect(station.diameterInches).toBeCloseTo(expected[i][1], 4);
    });
    // Nose-to-aft ordering survives the round trip: co-located components
    // keep equal X, and the OML never travels backward.
    for (let i = 1; i < parsed.stations.length; i++) {
      expect(parsed.stations[i].xInches).toBeGreaterThanOrEqual(parsed.stations[i - 1].xInches);
    }
    // OML extent: aft end of the last station is the full vehicle length and
    // the boattail aft diameter.
    const aft = parsed.stations[parsed.stations.length - 1];
    expect(aft.xInches).toBeCloseTo(1.05 * METERS_TO_INCHES, 4);
    expect(aft.diameterInches).toBeCloseTo(0.04 * METERS_TO_INCHES, 4);
  });

  it('preserves header comments and declared units', () => {
    const cdx1 = exportCdx1(fixtureComponents());
    const parsed = parseCdx1(cdx1);

    expect(parsed.metadata.unit).toBe('inches');
    expect(parsed.metadata.commentLines).toEqual([
      'Astraea RASAero II (.cdx1) outer mold line export',
      'X station (inches from nose tip), Diameter (inches)',
      'x = 0 is the nose tip; one station per component, in assembly order',
    ]);
  });

  it('parses tolerant hand-written station rows', () => {
    const text = [
      '# hand-written profile',
      '',
      '  2.0 , 0.5 ',
      '# mid-file comment',
      '+3.5, 4e-1',
      '4.5, 0.2',
      '',
    ].join('\r\n'); // CRLF line endings with embedded blanks

    const parsed = parseCdx1(text);
    expect(parsed.stations).toEqual([
      { xInches: 2.0, diameterInches: 0.5 },
      { xInches: 3.5, diameterInches: 0.4 },
      { xInches: 4.5, diameterInches: 0.2 },
    ]);
    expect(parsed.metadata.commentLines).toEqual(['hand-written profile', 'mid-file comment']);
    expect(parsed.metadata.unit).toBe('inches');
  });

  it('accepts comment-only documents as zero-station geometry', () => {
    const parsed = parseCdx1('# no stations yet\n# second comment');
    expect(parsed.stations).toEqual([]);
    expect(parsed.metadata.commentLines).toEqual(['no stations yet', 'second comment']);
  });

  it('rejects empty and whitespace-only input', () => {
    expect(() => parseCdx1('')).toThrow(InvalidCdx1FileError);
    expect(() => parseCdx1('   \n\n  ')).toThrow(/no OML station or comment content/);
  });

  it('rejects rows that are not exactly x and diameter pairs', () => {
    expect(() => parseCdx1('1, 2, 3')).toThrow(/two comma-separated numbers/);
    expect(() => parseCdx1('1')).toThrow(/two comma-separated numbers/);
    expect(() => parseCdx1('1, 2\n3')).toThrow(/two comma-separated numbers/);
  });

  it('rejects non-numeric station tokens', () => {
    expect(() => parseCdx1('abc, 1')).toThrow(InvalidCdx1FileError);
    expect(() => parseCdx1('1, xyz')).toThrow(InvalidCdx1FileError);
    expect(() => parseCdx1('1.2.3, 1')).toThrow(/not a number/);
    expect(() => parseCdx1('NaN, 1')).toThrow(/not a number/);
  });

  it('rejects non-finite station values', () => {
    // 1e999 lexes as a number token but overflows to Infinity.
    expect(() => parseCdx1('1e999, 1')).toThrow(/must be finite/);
    expect(() => parseCdx1('1, -1e999')).toThrow(/must be finite/);
  });

  it('rejects negative x or diameter stations', () => {
    expect(() => parseCdx1('-0.5, 1')).toThrow(/station X must be non-negative/);
    expect(() => parseCdx1('0.5, -1')).toThrow(/diameter must be non-negative/);
  });

  it('rejects stations out of nose-to-aft order', () => {
    const err = () => parseCdx1('3.0, 1\n2.0, 1');
    expect(err).toThrow(InvalidCdx1FileError);
    expect(err).toThrow(/non-decreasing/);
    expect(err).toThrow(/line 2/);
  });

  it('reports the offending line number for malformed rows', () => {
    expect(() => parseCdx1('0.5, 1\njunk')).toThrow(/line 2/);
    expect(() => parseCdx1('junk\n0.5, 1')).toThrow(/line 1/);
  });
});