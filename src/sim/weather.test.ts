import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  fetchSounding,
  parseOpenMeteoSounding,
  resolveForecastWinds,
  OPEN_METEO_FORECAST_HORIZON_DAYS,
  windAtAltitude,
  windToENU,
  type FetchLike,
  type WindLayer,
} from './weather';

const LAUNCH_TIME = '2026-10-24T16:56:00+02:00';
const FORECAST_HOUR = '2026-10-24T15:00';

describe('parseOpenMeteoSounding', () => {
  it('selects the nearest UTC launch hour instead of the first row and sorts by altitude', () => {
    const json = {
      utc_offset_seconds: 0,
      hourly: {
        time: ['2026-10-22T00:00', FORECAST_HOUR],
        temperature_850hPa: [99, 2.4],
        wind_speed_850hPa: [99, 12.0],
        wind_direction_850hPa: [0, 240],
        temperature_1000hPa: [99, 18.0],
        wind_speed_1000hPa: [99, 5.0],
        wind_direction_1000hPa: [0, 90],
        temperature_700hPa: [99, -10.5],
        wind_speed_700hPa: [99, 25.0],
        wind_direction_700hPa: [0, 300],
        hourly_units_ignored_field: 'not-a-level',
      },
    };

    const layers = parseOpenMeteoSounding(json, LAUNCH_TIME);

    expect(layers).toHaveLength(3);
    // ISA-derived altitudes: 1000 hPa ~ 110.9 m, 850 hPa ~ 1457.3 m, 700 hPa ~ 3012.2 m.
    expect(layers[0]).toMatchObject({
      pressureHpa: 1000,
      speedMs: 5,
      directionFromDeg: 90,
      tempC: 18,
    });
    expect(layers[0].altitudeM).toBeCloseTo(110.9, 1);
    expect(layers[1].pressureHpa).toBe(850);
    expect(layers[1].altitudeM).toBeCloseTo(1457.3, 1);
    expect(layers[1].speedMs).toBe(12);
    expect(layers[1].directionFromDeg).toBe(240);
    expect(layers[1].tempC).toBe(2.4);
    expect(layers[2]).toMatchObject({ pressureHpa: 700, tempC: -10.5, speedMs: 25 });
    expect(layers[2].altitudeM).toBeCloseTo(3012.2, 1);
    // Ascending altitude order regardless of declaration order.
    const altitudes = layers.map((l) => l.altitudeM);
    expect(altitudes).toEqual([...altitudes].sort((a, b) => a - b));
  });

  it('throws on invalid response shapes', () => {
    const badInputs: unknown[] = [
      null,
      'junk',
      42,
      [],
      {},
      { utc_offset_seconds: 0, hourly: {} },
      { utc_offset_seconds: 0, hourly: { time: [FORECAST_HOUR], temperature_850hPa: [1] } },
      {
        utc_offset_seconds: 0,
        hourly: {
          time: [FORECAST_HOUR],
          temperature_850hPa: [1, 2],
          wind_speed_850hPa: [3],
          wind_direction_850hPa: [90],
        },
      },
      {
        utc_offset_seconds: 0,
        hourly: {
          time: [FORECAST_HOUR],
          temperature_850hPa: [1],
          wind_speed_850hPa: ['fast'],
          wind_direction_850hPa: [90],
        },
      },
      {
        utc_offset_seconds: 0,
        hourly: {
          time: [FORECAST_HOUR],
          temperature_850hPa: [null],
          wind_speed_850hPa: [3],
          wind_direction_850hPa: [90],
        },
      },
      {
        utc_offset_seconds: 0,
        hourly: {
          time: [FORECAST_HOUR],
          temperature_850hPa: [],
          wind_speed_850hPa: [],
          wind_direction_850hPa: [],
        },
      },
    ];
    for (const input of badInputs) {
      expect(() => parseOpenMeteoSounding(input, LAUNCH_TIME)).toThrow(TypeError);
    }
  });

  it.each([
    { reason: 'missing launch hour', times: ['2026-10-24T14:00'], offset: 0 },
    { reason: 'non-UTC reference', times: [FORECAST_HOUR], offset: 3600 },
    { reason: 'values unaligned with the time grid', times: ['2026-10-24T14:00', FORECAST_HOUR], offset: 0 },
  ])('refuses $reason instead of returning another hour', ({ times, offset }) => {
    const response = {
      utc_offset_seconds: offset,
      hourly: { time: times, temperature_1000hPa: [18], wind_speed_1000hPa: [5], wind_direction_1000hPa: [90] },
    };
    expect(() => parseOpenMeteoSounding(response, LAUNCH_TIME)).toThrow(TypeError);
  });
});

describe('windAtAltitude', () => {
  const layers: WindLayer[] = [
    { altitudeM: 0, speedMs: 10, directionFromDeg: 90, tempC: 20, pressureHpa: 1013 },
    { altitudeM: 100, speedMs: 20, directionFromDeg: 90, tempC: 15, pressureHpa: 1000 },
    { altitudeM: 300, speedMs: 30, directionFromDeg: 90, tempC: 10, pressureHpa: 977 },
  ];

  it('linearly interpolates at the midpoint and exact layer altitudes', () => {
    expect(windAtAltitude(layers, 50)).toEqual({ speedMs: 15, directionFromDeg: 90 });
    expect(windAtAltitude(layers, 200)).toEqual({ speedMs: 25, directionFromDeg: 90 });
    expect(windAtAltitude(layers, 0)).toEqual({ speedMs: 10, directionFromDeg: 90 });
    expect(windAtAltitude(layers, 100)).toEqual({ speedMs: 20, directionFromDeg: 90 });
  });

  it('clamps below the lowest and above the highest layer', () => {
    expect(windAtAltitude(layers, -500)).toEqual({ speedMs: 10, directionFromDeg: 90 });
    expect(windAtAltitude(layers, 1000)).toEqual({ speedMs: 30, directionFromDeg: 90 });
  });

  it('interpolates direction along the shortest arc across the 0/360 seam', () => {
    const wrap: WindLayer[] = [
      { altitudeM: 0, speedMs: 10, directionFromDeg: 350, tempC: 20, pressureHpa: 1013 },
      { altitudeM: 100, speedMs: 10, directionFromDeg: 10, tempC: 20, pressureHpa: 1000 },
    ];
    expect(windAtAltitude(wrap, 25).directionFromDeg).toBeCloseTo(355, 6);
    expect(windAtAltitude(wrap, 50).directionFromDeg).toBeCloseTo(0, 6);
    expect(windAtAltitude(wrap, 75).directionFromDeg).toBeCloseTo(5, 6);
  });

  it('throws on an empty layer list', () => {
    expect(() => windAtAltitude([], 10)).toThrow();
  });

  it('sorts a copy, never mutating the caller table', () => {
    const unsorted: WindLayer[] = [
      { altitudeM: 300, speedMs: 30, directionFromDeg: 90, tempC: 10, pressureHpa: 977 },
      { altitudeM: 0, speedMs: 10, directionFromDeg: 90, tempC: 20, pressureHpa: 1013 },
      { altitudeM: 100, speedMs: 20, directionFromDeg: 90, tempC: 15, pressureHpa: 1000 },
    ];
    const before = [...unsorted];
    // Midpoint between 0 and 100 m resolves from the sorted order.
    expect(windAtAltitude(unsorted, 50)).toEqual({ speedMs: 15, directionFromDeg: 90 });
    // Caller's array is untouched.
    expect(unsorted).toEqual(before);
    expect(unsorted[0].altitudeM).toBe(300);
  });

  it('throws on duplicate altitudes', () => {
    const dup: WindLayer[] = [
      { altitudeM: 0, speedMs: 10, directionFromDeg: 90, tempC: 20, pressureHpa: 1013 },
      { altitudeM: 100, speedMs: 20, directionFromDeg: 90, tempC: 15, pressureHpa: 1000 },
      { altitudeM: 100, speedMs: 25, directionFromDeg: 90, tempC: 12, pressureHpa: 999 },
    ];
    expect(() => windAtAltitude(dup, 50)).toThrow(/duplicate altitude/);
  });

  it('throws on non-finite layer values and altitudes', () => {
    const badSpeed = [...layers];
    badSpeed[1] = { ...badSpeed[1], speedMs: Number.NaN };
    expect(() => windAtAltitude(badSpeed, 50)).toThrow(/finite/);

    const badDir = [...layers];
    badDir[2] = { ...badDir[2], directionFromDeg: Number.POSITIVE_INFINITY };
    expect(() => windAtAltitude(badDir, 50)).toThrow(/finite/);

    const badAlt = [...layers];
    badAlt[0] = { ...badAlt[0], altitudeM: Number.NaN };
    expect(() => windAtAltitude(badAlt, 50)).toThrow(/finite/);

    expect(() => windAtAltitude(layers, Number.NaN)).toThrow(/hM/);
  });
});

describe('windToENU', () => {
  it('maps meteorological from-directions to ENU signs', () => {
    // Wind FROM north (0 deg) blows south: negative North, ~zero East.
    const fromNorth = windToENU(10, 0);
    expect(fromNorth.east).toBeCloseTo(0, 12);
    expect(fromNorth.north).toBeCloseTo(-10, 12);
    // Wind FROM east (90 deg) blows west.
    const fromEast = windToENU(10, 90);
    expect(fromEast.east).toBeCloseTo(-10, 12);
    expect(fromEast.north).toBeCloseTo(0, 12);
    // Wind FROM south (180 deg) blows north.
    const fromSouth = windToENU(10, 180);
    expect(fromSouth.east).toBeCloseTo(0, 12);
    expect(fromSouth.north).toBeCloseTo(10, 12);
    // Wind FROM west (270 deg) blows east.
    const fromWest = windToENU(10, 270);
    expect(fromWest.east).toBeCloseTo(10, 12);
    expect(fromWest.north).toBeCloseTo(0, 12);
  });

  it('splits components correctly for a diagonal from-direction (NW -> SE)', () => {
    const { east, north } = windToENU(10, 315);
    expect(east).toBeCloseTo(10 * Math.SQRT1_2, 9);
    expect(north).toBeCloseTo(-10 * Math.SQRT1_2, 9);
  });

  it('is convention-consistent with getWindVectorAt in dynamics/loads.ts', () => {
    // loads.ts: wind vector = speed * (sin(az + 180), cos(az + 180)) for a
    // from-azimuth az. windToENU must produce the identical ENU components.
    const speed = 7.5;
    const fromDeg = 140;
    const azRad = (fromDeg * Math.PI) / 180;
    expect(windToENU(speed, fromDeg)).toEqual({
      east: speed * Math.sin(azRad + Math.PI),
      north: speed * Math.cos(azRad + Math.PI),
    });
  });

  it('throws on non-finite or negative speed', () => {
    expect(() => windToENU(Number.NaN, 90)).toThrow(/speedMs/);
    expect(() => windToENU(Number.POSITIVE_INFINITY, 90)).toThrow(/speedMs/);
    expect(() => windToENU(-1, 90)).toThrow(/speedMs/);
    expect(() => windToENU(10, Number.NaN)).toThrow(/dirFromDeg/);
  });
});

describe('fetchSounding', () => {
  const payload = {
    utc_offset_seconds: 0,
    hourly: {
      time: [FORECAST_HOUR],
      temperature_1000hPa: [18.0],
      wind_speed_1000hPa: [5.0],
      wind_direction_1000hPa: [90],
      temperature_850hPa: [2.4],
      wind_speed_850hPa: [12.0],
      wind_direction_850hPa: [240],
    },
  };

  it.each([
    [LAUNCH_TIME, FORECAST_HOUR],
    ['2026-10-24T23:45:00Z', '2026-10-25T00:00'],
  ])('requests the nearest UTC hour for %s, including offset and day rollover', async (launch, expectedHour) => {
    let capturedUrl = '';
    const response = { ...payload, hourly: { ...payload.hourly, time: [expectedHour] } };
    const mockFetch: FetchLike = (input) => {
      capturedUrl = String(input);
      return Promise.resolve(new Response(JSON.stringify(response), { status: 200 }));
    };
    const layers = await fetchSounding(47.6, -122.3, launch, mockFetch);
    const url = new URL(capturedUrl);
    expect(url.searchParams.get('start_hour')).toBe(expectedHour);
    expect(url.searchParams.get('end_hour')).toBe(expectedHour);
    expect(url.searchParams.get('timezone')).toBe('UTC');
    expect(layers[0]).toMatchObject({ pressureHpa: 1000, speedMs: 5, tempC: 18 });
  });

  it('rejects on a non-2xx response', async () => {
    const mockFetch: FetchLike = () => Promise.resolve(new Response(JSON.stringify(payload), { status: 500 }));
    await expect(fetchSounding(47.6, -122.3, LAUNCH_TIME, mockFetch)).rejects.toThrow();
  });

  it('rejects on an invalid response body', async () => {
    const mockFetch: FetchLike = () =>
      Promise.resolve(new Response(JSON.stringify({ hourly: { temperature_850hPa: [1] } }), { status: 200 }));
    await expect(fetchSounding(47.6, -122.3, LAUNCH_TIME, mockFetch)).rejects.toThrow(TypeError);
  });

  it('rejects on non-finite coordinates', async () => {
    const mockFetch: FetchLike = () => {
      throw new Error('must not be called');
    };
    await expect(fetchSounding(NaN, -122.3, LAUNCH_TIME, mockFetch)).rejects.toThrow(TypeError);
  });

  it('refuses an unreferenced local launch clock before requesting weather', async () => {
    const mockFetch: FetchLike = () => { throw new Error('must not be called'); };
    await expect(fetchSounding(47.6, -122.3, '2026-10-24T14:56:00', mockFetch)).rejects.toThrow(TypeError);
  });
});

describe('resolveForecastWinds', () => {
  afterEach(() => vi.useRealTimers());
  const payload = {
    utc_offset_seconds: 0,
    hourly: {
      time: ['2026-10-21T00:00', FORECAST_HOUR],
      temperature_1000hPa: [99, 18.0],
      wind_speed_1000hPa: [99, 5.0],
      wind_direction_1000hPa: [0, 90],
      temperature_850hPa: [99, 2.4],
      wind_speed_850hPa: [99, 12.0],
      wind_direction_850hPa: [0, 240],
    },
  };

  const hourMs = 3_600_000;
  const dayMs = 86_400_000;

  const futureISO = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString();

  it('returns launch-day winds rather than the first hour of the query day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T14:56:00Z'));
    const mockFetch: FetchLike = () =>
      Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    const layers = await resolveForecastWinds(47.6, -122.3, futureISO(3 * dayMs), mockFetch);
    expect(layers[0]).toMatchObject({ pressureHpa: 1000, speedMs: 5, tempC: 18 });
    expect(layers[1]).toMatchObject({ pressureHpa: 850, speedMs: 12, tempC: 2.4 });
  });

  it('rejects launches in the past', async () => {
    const mockFetch: FetchLike = () => {
      throw new Error('must not be called');
    };
    await expect(resolveForecastWinds(47.6, -122.3, futureISO(-2 * hourMs), mockFetch)).rejects.toThrow(RangeError);
  });

  it('rejects launches at or beyond the documented forecast horizon', async () => {
    const mockFetch: FetchLike = () => {
      throw new Error('must not be called');
    };
    const beyond = (OPEN_METEO_FORECAST_HORIZON_DAYS + 1) * dayMs + hourMs;
    await expect(resolveForecastWinds(47.6, -122.3, futureISO(beyond), mockFetch)).rejects.toThrow(RangeError);
  });

  it('rejects an unparsable launch time and non-finite coordinates', async () => {
    const mockFetch: FetchLike = () => {
      throw new Error('must not be called');
    };
    await expect(resolveForecastWinds(47.6, -122.3, 'not-a-date', mockFetch)).rejects.toThrow(TypeError);
    await expect(resolveForecastWinds(NaN, -122.3, futureISO(dayMs), mockFetch)).rejects.toThrow(TypeError);
    await expect(resolveForecastWinds(47.6, Number.POSITIVE_INFINITY, futureISO(dayMs), mockFetch)).rejects.toThrow(TypeError);
  });
});