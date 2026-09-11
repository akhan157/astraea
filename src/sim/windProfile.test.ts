import { describe, it, expect } from 'vitest';
import { parseWindProfileCsv, toManualWindTable } from './windProfile';
import { windAtAltitude } from './weather';

const canonicalCsv = `# launch-site wind shear
altitude, speed, direction

100, 20, 90
0, 10, "90"
300, 30, 270
`;

describe('parseWindProfileCsv', () => {
  it('parses canonical CSV, skipping comments and blanks, stripping quotes', () => {
    const layers = parseWindProfileCsv(canonicalCsv);

    expect(layers).toHaveLength(3);
    expect(layers[0]).toEqual({ altitudeM: 100, speedMs: 20, directionFromDeg: 90 });
    expect(layers[1]).toEqual({ altitudeM: 0, speedMs: 10, directionFromDeg: 90 });
    expect(layers[2]).toEqual({ altitudeM: 300, speedMs: 30, directionFromDeg: 270 });
  });

  it('accepts every documented header alias set', () => {
    const headers = [
      'alt,wind,dir',
      'altitude,windSpeed,heading',
      'agl,wind,azimuth',
      'z,speed,heading',
      'ALT,WIND,DIR',
    ];
    for (const header of headers) {
      const layers = parseWindProfileCsv(`${header}\n0,5,90\n100,10,180`);
      expect(layers).toEqual([
        { altitudeM: 0, speedMs: 5, directionFromDeg: 90 },
        { altitudeM: 100, speedMs: 10, directionFromDeg: 180 },
      ]);
    }
  });

  it('tolerates parenthetical unit hints in the header', () => {
    const layers = parseWindProfileCsv('altitude (m), wind speed (m/s), direction (deg)\n0,5,270');
    expect(layers).toEqual([{ altitudeM: 0, speedMs: 5, directionFromDeg: 270 }]);
  });

  it('accepts an optional units column with SI values, per row or combined', () => {
    const perRow = parseWindProfileCsv(
      'altitude,speed,direction,units\n0,5,270,m\n100,10,280,m/s\n200,15,290,deg'
    );
    expect(perRow).toHaveLength(3);
    expect(perRow[1]).toEqual({ altitudeM: 100, speedMs: 10, directionFromDeg: 280 });

    const combined = parseWindProfileCsv(
      'altitude,speed,direction,units\n0,5,270,"m, m/s, deg"'
    );
    expect(combined).toHaveLength(1);
  });

  it('normalizes meteorological directions into [0, 360)', () => {
    const layers = parseWindProfileCsv('alt,wind,dir\n0,5,370\n100,10,-30');
    expect(layers[0].directionFromDeg).toBe(10);
    expect(layers[1].directionFromDeg).toBe(330);
  });

  it('throws on empty input and headers without data rows', () => {
    expect(() => parseWindProfileCsv('')).toThrow(/no header row/);
    expect(() => parseWindProfileCsv('# only a comment\n\n# another\n')).toThrow(/no header row/);
    expect(() => parseWindProfileCsv('altitude,speed,direction\n')).toThrow(/no data rows/);
    expect(() => parseWindProfileCsv('altitude,speed,direction\n# comment only\n')).toThrow(/no data rows/);
  });

  it('throws on missing or duplicated role columns', () => {
    expect(() => parseWindProfileCsv('altitude,speed\n0,5,90')).toThrow(/altitude, speed and direction/);
    expect(() => parseWindProfileCsv('altitude,speed,direction,heading\n0,5,90,90')).toThrow(/duplicate column role 'direction'/);
  });

  it('throws on malformed rows: bad numbers, wrong column count, negative speed', () => {
    expect(() => parseWindProfileCsv('alt,wind,dir\n0,abc,90')).toThrow(/not a number/);
    expect(() => parseWindProfileCsv('alt,wind,dir\n0,5,90\n1,')).toThrow(/2 columns, expected 3/);
    expect(() => parseWindProfileCsv('alt,wind,dir\n0,-5,90')).toThrow(/must be nonnegative/);
    expect(() => parseWindProfileCsv('alt,wind,dir\n0,,90')).toThrow(/empty/);
    expect(() => parseWindProfileCsv(42 as unknown as string)).toThrow(/must be a string/);
  });

  it('throws on unsupported (non-SI) units instead of silently mis-scaling', () => {
    expect(() => parseWindProfileCsv('altitude,speed,direction,units\n0,5,270,ft')).toThrow(/unsupported units/);
    expect(() => parseWindProfileCsv('altitude,speed,direction,units\n0,5,270,knots')).toThrow(/unsupported units/);
    expect(() => parseWindProfileCsv('altitude,speed,direction,units\n0,5,270,')).toThrow(/unsupported units/);
  });
});

describe('toManualWindTable', () => {
  it('sorts layers ascending by altitude into the ManualWindTable shape', () => {
    const table = toManualWindTable(parseWindProfileCsv(canonicalCsv));

    expect(table.layers.map((l) => l.altitudeM)).toEqual([0, 100, 300]);
    expect(table.layers[0]).toEqual({
      altitudeM: 0,
      speedMs: 10,
      directionFromDeg: 90,
      tempC: 15,
      pressureHpa: 1013.25,
    });
    expect(table.layers[2]).toMatchObject({ altitudeM: 300, speedMs: 30, directionFromDeg: 270 });
  });

  it('throws on duplicate altitudes', () => {
    const layers = parseWindProfileCsv('alt,wind,dir\n0,5,90\n100,10,180\n0,7,270');
    expect(() => toManualWindTable(layers)).toThrow(/duplicate altitude/);
  });

  it('throws on an empty layer list', () => {
    expect(() => toManualWindTable([])).toThrow(/no layers/);
  });
});

describe('wind profile round-trip', () => {
  it('round-trips parsed CSV layers into windAtAltitude interpolation', () => {
    const table = toManualWindTable(parseWindProfileCsv(canonicalCsv));

    expect(windAtAltitude(table.layers, 50)).toEqual({ speedMs: 15, directionFromDeg: 90 });
    // 90 -> 270 deg interpolates along the shortest arc through 0.
    expect(windAtAltitude(table.layers, 200)).toEqual({ speedMs: 25, directionFromDeg: 0 });
    expect(windAtAltitude(table.layers, 0)).toEqual({ speedMs: 10, directionFromDeg: 90 });
    expect(windAtAltitude(table.layers, 1000)).toEqual({ speedMs: 30, directionFromDeg: 270 });
    expect(windAtAltitude(table.layers, -10)).toEqual({ speedMs: 10, directionFromDeg: 90 });
  });
});