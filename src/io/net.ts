/**
 * Versioned network adapters for weather and motor search.
 *
 * This module owns no fetch calls of its own: every adapter delegates to the
 * existing injectable engines (resolveForecastWinds, searchMotors,
 * downloadMotorSimfile) with an injected fetch implementation. Typed errors
 * carry retry guidance; nothing here renders or touches the DOM.
 */

import {
  forecastHourUTC,
  resolveForecastWinds,
  type FetchLike as WeatherFetch,
  type WindLayer,
} from '../sim/weather';
import {
  downloadMotorSimfile,
  searchMotors,
  ThrustCurveApiError,
  type FetchImpl as ThrustFetch,
  type MotorSummary,
  type ThrustCurveSearchQuery,
} from '../propulsion/thrustcurveApi';

/** Open-Meteo adapter version pinned in the returned source tag. */
export const OPEN_METEO_SOURCE = 'open-meteo v2' as const;

export interface WeatherLayersResult {
  layers: WindLayer[];
  fetchedAt: string;
  forecastHourISO: string;
  source: typeof OPEN_METEO_SOURCE;
}

const RETRY_SUFFIX = 'Check the connection and retry; use the manual wind table when offline.';

function weatherError(message: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`${message}: ${detail}. ${RETRY_SUFFIX}`);
}

/**
 * Open-Meteo adapter v1: validates finite coordinates and an ISO launch
 * time, then delegates to resolveForecastWinds. The fetch seam defaults to
 * the global fetch and is injectable for tests.
 */
export async function fetchWeatherLayers(
  lat: number,
  lon: number,
  launchTimeISO: string,
  fetchImpl: WeatherFetch = fetch,
): Promise<WeatherLayersResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new TypeError(
      `fetchWeatherLayers: latitude/longitude must be finite numbers (got lat=${lat}, lon=${lon}). ${RETRY_SUFFIX}`,
    );
  }
  if (typeof launchTimeISO !== 'string' || !Number.isFinite(new Date(launchTimeISO).getTime())) {
    throw new TypeError(
      `fetchWeatherLayers: launchTimeISO must be a valid ISO-8601 timestamp (got "${launchTimeISO}"). ${RETRY_SUFFIX}`,
    );
  }
  let layers: WindLayer[];
  try {
    layers = await resolveForecastWinds(lat, lon, launchTimeISO, fetchImpl);
  } catch (err) {
    throw weatherError('fetchWeatherLayers: Open-Meteo forecast is unavailable', err);
  }
  return { layers, fetchedAt: new Date().toISOString(), forecastHourISO: forecastHourUTC(launchTimeISO), source: OPEN_METEO_SOURCE };
}

export type ThrustCurveQuery = ThrustCurveSearchQuery;

export interface ThrustCurveSearchResult {
  results: MotorSummary[];
  /** Search responses are served through the 24h ThrustCurve cache. */
  cacheNote: string;
}

function thrustError(message: string, cause: unknown): Error {
  if (cause instanceof ThrustCurveApiError && typeof cause.status === 'number') {
    return new ThrustCurveApiError(
      `${message}: ${cause.message} (HTTP ${cause.status}). If the service rate-limits, wait and retry.`,
      cause.status,
    );
  }
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(`${message}: ${detail}. If the service rate-limits, wait and retry.`);
}

/**
 * ThrustCurve search adapter: delegates to searchMotors with the shared 24h
 * response cache. The fetch seam is required so no global fetch shape leaks
 * into the slice (callers pass fetch explicitly).
 */
export async function searchThrustCurve(
  query: ThrustCurveSearchQuery,
  fetchImpl: ThrustFetch,
): Promise<ThrustCurveSearchResult> {
  let results: MotorSummary[];
  try {
    results = await searchMotors(query, fetchImpl);
  } catch (err) {
    throw thrustError('searchThrustCurve: motor search is unavailable', err);
  }
  return {
    results,
    cacheNote: 'Results served through the shared 24h ThrustCurve response cache.',
  };
}

/**
 * ThrustCurve simfile adapter: delegates to downloadMotorSimfile and returns
 * raw .eng/.rse text ready for parseRaspEng/parseRseXml.
 */
export async function downloadThrustCurveFile(
  motorId: string,
  fetchImpl: ThrustFetch,
): Promise<string> {
  try {
    return await downloadMotorSimfile(motorId, fetchImpl);
  } catch (err) {
    throw thrustError(`downloadThrustCurveFile: no simfile for motor "${motorId}"`, err);
  }
}
