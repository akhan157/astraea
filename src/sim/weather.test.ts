import { describe, it, expect } from 'vitest';
import {
  fetchSounding,
  parseOpenMeteoSounding,
  windAtAltitude,
  windToENU,
  type FetchLike,
  type WindLayer,
} from './weather';

describe('parseOpenMeteoSounding', () => {
  it('parses a well-formed sounding into layers sorted ascending by altitude', () => {
    const json = {
      hourly: {
        temperature_850hPa: [2.4],
        wind_speed_850hPa: [12.0],
        wind_direction_850hPa: [240],
        temperature_1000hPa: [18.0],
        wind_speed_1000hPa: [5.0],
        wind_direction_1000hPa: [90],
        temperature_700hPa: [-10.5],
        wind_speed_700hPa: [25.0],
        wind_direction_700hPa: [300],
        hourly_units_ignored_field: 'not-a-level',
      },
    };

    const layers = parseOpenMeteoSounding(json);

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
      { hourly: {} },
      { hourly: { temperature_850hPa: [1] } },
      {
        hourly: {
          temperature_850hPa: [1, 2],
          wind_speed_850hPa: [3],
          wind_direction_850hPa: [90],
        },
      },
      {
        hourly: {
          temperature_850hPa: [1],
          wind_speed_850hPa: ['fast'],
          wind_direction_850hPa: [90],
        },
      },
      {
        hourly: {
          temperature_850hPa: [null],
          wind_speed_850hPa: [3],
          wind_direction_850hPa: [90],
        },
      },
      {
        hourly: {
          temperature_850hPa: [],
          wind_speed_850hPa: [],
          wind_direction_850hPa: [],
        },
      },
    ];
    for (const input of badInputs) {
      expect(() => parseOpenMeteoSounding(input)).toThrow();
    }
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
});

describe('fetchSounding', () => {
  const payload = {
    hourly: {
      temperature_1000hPa: [18.0],
      wind_speed_1000hPa: [5.0],
      wind_direction_1000hPa: [90],
      temperature_850hPa: [2.4],
      wind_speed_850hPa: [12.0],
      wind_direction_850hPa: [240],
    },
  };

  it('builds the Open-Meteo request and parses the response', async () => {
    let capturedUrl = '';
    let capturedInit: Parameters<FetchLike>[1];
    const mockFetch: FetchLike = (input, init) => {
      capturedUrl = typeof input === 'string' ? input : String(input);
      capturedInit = init;
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
    };

    const layers = await fetchSounding(47.6, -122.3, mockFetch);

    expect(layers).toHaveLength(2);
    expect(layers[0].pressureHpa).toBe(1000); // ascending altitude order (111 m first)
    expect(layers[1].pressureHpa).toBe(850);

    const url = new URL(capturedUrl);
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('47.6');
    expect(url.searchParams.get('longitude')).toBe('-122.3');
    expect(url.searchParams.get('wind_speed_unit')).toBe('ms');
    const hourly = url.searchParams.get('hourly') ?? '';
    expect(hourly).toContain('temperature_1000hPa');
    expect(hourly).toContain('wind_speed_1000hPa');
    expect(hourly).toContain('wind_direction_1000hPa');
    expect(hourly).toContain('temperature_100hPa'); // full pressure grid included
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
    expect(capturedInit?.signal?.aborted).toBe(false);
  });

  it('rejects when the fetch transport fails', async () => {
    const mockFetch: FetchLike = () => Promise.reject(new TypeError('network down'));
    await expect(fetchSounding(47.6, -122.3, mockFetch)).rejects.toThrow('network down');
  });

  it('rejects on a non-2xx response', async () => {
    const mockFetch: FetchLike = () => Promise.resolve(new Response('nope', { status: 500 }));
    await expect(fetchSounding(47.6, -122.3, mockFetch)).rejects.toThrow(/HTTP 500/);
  });

  it('rejects on an invalid response body', async () => {
    const mockFetch: FetchLike = () =>
      Promise.resolve(new Response(JSON.stringify({ hourly: { temperature_850hPa: [1] } }), { status: 200 }));
    await expect(fetchSounding(47.6, -122.3, mockFetch)).rejects.toThrow();
  });

  it('rejects on non-finite coordinates', async () => {
    const mockFetch: FetchLike = () => {
      throw new Error('must not be called');
    };
    await expect(fetchSounding(NaN, -122.3, mockFetch)).rejects.toThrow();
  });
});