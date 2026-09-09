/**
 * Weather: live atmospheric soundings from Open-Meteo and manual wind-shear
 * profiles for trajectory simulation.
 *
 * Conventions (must stay consistent with getWindVectorAt in
 * src/dynamics/loads.ts):
 *  - Wind direction is METEOROLOGICAL: directionFromDeg is the compass
 *    bearing the wind comes FROM, clockwise from north (0 = north,
 *    90 = east).
 *  - ENU frame: East = +x, North = +y (Up = +z is unused here). A wind FROM
 *    direction d blows TOWARD d + 180 deg, so its ENU velocity is
 *    east = -v sin(d), north = -v cos(d).
 *  - Open-Meteo pressure-level soundings carry no altitude; altitudeM is
 *    derived from pressure with the ISA barometric formula.
 */

export interface WindLayer {
  /** Altitude (m, MSL), ISA-derived from the pressure level. */
  altitudeM: number;
  /** Horizontal wind speed (m/s). */
  speedMs: number;
  /** Direction the wind comes FROM, degrees from north, clockwise. */
  directionFromDeg: number;
  /** Air temperature at the level (deg C). */
  tempC: number;
  /** Atmospheric pressure at the level (hPa). */
  pressureHpa: number;
}

/** Manual (user-authored) wind shear table, e.g. for launch-site override. */
export interface ManualWindTable {
  layers: WindLayer[];
}

/** Pressure levels supported by the Open-Meteo forecast API (hPa). */
const PRESSURE_LEVELS_HPA = [
  1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700, 650, 600,
  550, 500, 450, 400, 350, 300, 250, 200, 150, 100,
] as const;

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 10_000;

const LEVEL_RE = /^(temperature|wind_speed|wind_direction)_(\d{3,4})hPa$/;

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Standard-atmosphere pressure-to-altitude conversion (m, MSL). */
function pressureToAltitudeM(pressureHpa: number): number {
  return 44330.77 * (1 - Math.pow(pressureHpa / 1013.25, 0.1902632));
}

/**
 * Parses an Open-Meteo pressure-level forecast response into a WindLayer[]
 * sounding. Each declared pressure level must carry temperature_<p>hPa,
 * wind_speed_<p>hPa and wind_direction_<p>hPa arrays of equal, non-zero
 * length of finite numbers; the sounding uses the first (nearest) hour of
 * each level. Layers are returned ascending by altitude. Throws TypeError on
 * any shape violation.
 */
export function parseOpenMeteoSounding(json: unknown): WindLayer[] {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new TypeError('parseOpenMeteoSounding: response must be a JSON object');
  }
  const root = json as Record<string, unknown>;
  const hourly = root.hourly;
  if (typeof hourly !== 'object' || hourly === null || Array.isArray(hourly)) {
    throw new TypeError('parseOpenMeteoSounding: response.hourly must be an object');
  }

  // Collect each declared pressure level across the three variable families.
  const levelFields = new Map<
    number,
    { temp?: unknown; speed?: unknown; dir?: unknown }
  >();
  for (const [key, value] of Object.entries(hourly)) {
    const match = LEVEL_RE.exec(key);
    if (!match) continue;
    const family = match[1] as 'temperature' | 'wind_speed' | 'wind_direction';
    const level = Number(match[2]);
    const entry = levelFields.get(level) ?? { temp: undefined, speed: undefined, dir: undefined };
    if (family === 'temperature') entry.temp = value;
    else if (family === 'wind_speed') entry.speed = value;
    else entry.dir = value;
    levelFields.set(level, entry);
  }
  if (levelFields.size === 0) {
    throw new TypeError('parseOpenMeteoSounding: no pressure-level variables found');
  }

  const layers: WindLayer[] = [];
  for (const [level, fields] of levelFields) {
    const { temp, speed, dir } = fields;
    if (temp === undefined || speed === undefined || dir === undefined) {
      throw new TypeError(
        `parseOpenMeteoSounding: level ${level} is missing one of temperature/wind_speed/wind_direction`
      );
    }
    for (const [family, value] of [
      ['temperature', temp],
      ['wind_speed', speed],
      ['wind_direction', dir],
    ] as const) {
      if (!Array.isArray(value) || value.length === 0 || !value.every(isFiniteNumber)) {
        throw new TypeError(
          `parseOpenMeteoSounding: hourly.${family}_${level}hPa must be a non-empty array of finite numbers`
        );
      }
    }
    const tempArr = temp as number[];
    const speedArr = speed as number[];
    const dirArr = dir as number[];
    if (tempArr.length !== speedArr.length || tempArr.length !== dirArr.length) {
      throw new TypeError(`parseOpenMeteoSounding: level ${level} arrays have mismatched lengths`);
    }
    // Sounding profile = first forecast hour (nearest time to the query).
    layers.push({
      altitudeM: pressureToAltitudeM(level),
      speedMs: speedArr[0],
      directionFromDeg: dirArr[0],
      tempC: tempArr[0],
      pressureHpa: level,
    });
  }

  layers.sort((a, b) => a.altitudeM - b.altitudeM);
  return layers;
}

/**
 * Fetches a live sounding for a coordinate from Open-Meteo. Requests the
 * full pressure-level grid with wind speed in m/s and aborts after 10 s via
 * AbortSignal. Throws on non-2xx responses, transport failure, and invalid
 * response shapes (see parseOpenMeteoSounding).
 */
export async function fetchSounding(
  lat: number,
  lon: number,
  fetchImpl: FetchLike = fetch
): Promise<WindLayer[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new TypeError(`fetchSounding: latitude/longitude must be finite numbers (got lat=${lat}, lon=${lon})`);
  }
  const url = new URL(OPEN_METEO_ENDPOINT);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('wind_speed_unit', 'ms');
  const hourly = PRESSURE_LEVELS_HPA.flatMap((p) => [
    `temperature_${p}hPa`,
    `wind_speed_${p}hPa`,
    `wind_direction_${p}hPa`,
  ]);
  url.searchParams.set('hourly', hourly.join(','));

  const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`fetchSounding: Open-Meteo responded with HTTP ${res.status}`);
  }
  return parseOpenMeteoSounding(await res.json());
}

/**
 * Returns the wind (speed, from-direction) at altitude hM by linear
 * interpolation over the layer table. Altitudes below the lowest layer clamp
 * to the lowest layer, above the highest layer clamp to the highest. Wind
 * direction is circular: it interpolates along the shortest arc (350 -> 10
 * deg passes through 0, not 180). Throws RangeError on an empty table.
 */
export function windAtAltitude(
  layers: readonly WindLayer[],
  hM: number
): { speedMs: number; directionFromDeg: number } {
  if (layers.length === 0) {
    throw new RangeError('windAtAltitude: no wind layers provided');
  }
  const first = layers[0];
  const last = layers[layers.length - 1];
  if (layers.length === 1 || hM <= first.altitudeM) {
    return { speedMs: first.speedMs, directionFromDeg: first.directionFromDeg };
  }
  if (hM >= last.altitudeM) {
    return { speedMs: last.speedMs, directionFromDeg: last.directionFromDeg };
  }

  let i = 0;
  while (i + 1 < layers.length && layers[i + 1].altitudeM < hM) i++;
  const a = layers[i];
  const b = layers[i + 1];
  const t = (hM - a.altitudeM) / (b.altitudeM - a.altitudeM);

  const speedMs = a.speedMs + t * (b.speedMs - a.speedMs);

  // Shortest-arc delta in [-180, 180); direction stays a bearing in [0, 360).
  const delta = ((b.directionFromDeg - a.directionFromDeg + 540) % 360) - 180;
  const directionFromDeg = ((a.directionFromDeg + t * delta) % 360 + 360) % 360;

  return { speedMs, directionFromDeg };
}

/**
 * Converts a meteorological from-direction to ENU horizontal components
 * (east = +x, north = +y). A wind FROM direction d blows toward d + 180 deg,
 * so east = -v sin(d), north = -v cos(d).
 */
export function windToENU(
  speedMs: number,
  dirFromDeg: number
): { east: number; north: number } {
  const fromRad = (dirFromDeg * Math.PI) / 180;
  const toward = fromRad + Math.PI;
  return {
    east: speedMs * Math.sin(toward),
    north: speedMs * Math.cos(toward),
  };
}