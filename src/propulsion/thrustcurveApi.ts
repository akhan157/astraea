/**
 * Astraea ThrustCurve.org API client (engine only, no UI).
 *
 * Wraps the official ThrustCurve JSON API (https://www.thrustcurve.org/api/v1,
 * OpenAPI spec at https://www.thrustcurve.org/api/v1/swagger.json):
 *   - POST /search.json    motor search by criteria
 *   - POST /download.json  simulator file (.eng/.rse) download, Base64 payload
 *
 * ThrustCurve.org attribution + caching rules (llms.txt, AI section):
 *   - Cite the motor's ThrustCurve.org profile page, never a raw .eng/.rse
 *     download URL. UI consumers must link to
 *     https://www.thrustcurve.org/motors/<motorId>/ and may use the
 *     download response's `infoUrl` (simfile info page) for file-level
 *     citations. Do NOT hotlink `dataUrl`.
 *   - Cache API responses for at least 24 hours: this module keeps an
 *     in-memory cache with a default TTL of 86,400,000 ms
 *     (`cacheTtlMs` overrides, e.g. for tests).
 *   - Do not exceed 2 requests/second against the API.
 *
 * Fail-closed contract:
 *   - HTTP errors (4xx/5xx) throw ThrustCurveApiError carrying the status and,
 *     for rate-limit responses, `retryAfterSeconds` from the Retry-After
 *     header.
 *   - Network/transport failures and non-JSON bodies throw.
 *   - A search record missing any required summary field, or carrying a
 *     non-finite/non-positive metric, is dropped (never fabricated); a
 *     structurally invalid payload throws.
 *   - Download fails closed when no usable simfile exists for the motor.
 *
 * `fetchImpl` is injected so callers can mock, retry, or proxy requests.
 */

export interface MotorSummary {
  id: string;
  designation: string;
  manufacturer: string;
  totalImpulseNs: number;
  avgThrustN: number;
  burnTimeS: number;
  diameterMm: number;
  lengthMm: number;
}

/** Subset of the API SearchRequest; at least one criterion is required. */
export interface ThrustCurveSearchQuery {
  manufacturer?: string;
  designation?: string;
  commonName?: string;
  impulseClass?: string;
  diameter?: number;
  type?: 'SU' | 'reload' | 'hybrid';
  certOrg?: string;
  sparky?: boolean;
  hasDataFiles?: boolean;
  availability?: 'regular' | 'occasional' | 'OOP' | 'available' | 'all';
  maxResults?: number;
}

export interface ThrustCurveApiOptions {
  /** Search/download cache TTL in ms. Default 86_400_000 (24h, per llms.txt). */
  cacheTtlMs?: number;
  /** API base URL (default https://www.thrustcurve.org/api/v1). */
  baseUrl?: string;
}

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export class ThrustCurveApiError extends Error {
  /** HTTP status of the failing response; 0 = transport/validation failure. */
  readonly status: number;
  /** Seconds to wait before retrying, from the Retry-After header (rate limits). */
  readonly retryAfterSeconds?: number;

  constructor(message: string, status = 0, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ThrustCurveApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const DEFAULT_BASE_URL = 'https://www.thrustcurve.org/api/v1';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // llms.txt: cache >= 24h
const MAX_CACHE_ENTRIES = 512;

/**
 * In-memory TTL cache of raw API responses, keyed by endpoint + request body.
 * Runtime insertion/deletion with `.size` and insertion-order eviction — the
 * Map shape is load-bearing (a Record cannot express expiry or order).
 */
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Numeric summary extraction: field must be present, finite, and positive. */
function metric(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const date = Date.parse(value); // RFC 7231 HTTP-date fallback
  if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  return undefined;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of responseCache) {
    if (entry.expiresAt <= now) responseCache.delete(key);
  }
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
}

/**
 * POSTs a JSON body, serving and storing through the TTL cache. Throws
 * ThrustCurveApiError on transport failure, non-2xx (surfacing Retry-After),
 * and non-JSON bodies.
 */
async function postJson(
  url: string,
  body: unknown,
  fetchImpl: FetchImpl,
  cacheTtlMs: number,
): Promise<unknown> {
  const key = `${url} ${JSON.stringify(body)}`;
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new ThrustCurveApiError(`ThrustCurve API request failed: ${why}`);
  }
  if (!res.ok) {
    const detail = res.statusText.trim();
    throw new ThrustCurveApiError(
      `ThrustCurve API request failed: HTTP ${res.status}${detail ? ` ${detail}` : ''}`,
      res.status,
      parseRetryAfter(res.headers.get('retry-after')),
    );
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ThrustCurveApiError('ThrustCurve API returned a non-JSON response', res.status);
  }
  responseCache.set(key, { expiresAt: Date.now() + cacheTtlMs, value: json });
  if (responseCache.size > MAX_CACHE_ENTRIES) pruneCache();
  return json;
}

function buildSearchBody(query: ThrustCurveSearchQuery): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) body[key] = value;
  }
  if (Object.keys(body).length === 0) {
    throw new ThrustCurveApiError('ThrustCurve search requires at least one search criterion');
  }
  return body;
}

/** Mapping from a search result record; null when a summary field is unusable. */
function toMotorSummary(raw: unknown): MotorSummary | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = record.motorId;
  const designation = record.designation;
  const manufacturer = record.manufacturer ?? record.manufacturerAbbrev;
  if (!nonEmptyString(id) || !nonEmptyString(designation) || !nonEmptyString(manufacturer)) {
    return null;
  }
  const totalImpulseNs = metric(record, 'totImpulseNs');
  const avgThrustN = metric(record, 'avgThrustN');
  const burnTimeS = metric(record, 'burnTimeS');
  const diameterMm = metric(record, 'diameter');
  const lengthMm = metric(record, 'length');
  if (
    totalImpulseNs === undefined || avgThrustN === undefined || burnTimeS === undefined ||
    diameterMm === undefined || lengthMm === undefined
  ) {
    return null;
  }
  return {
    id,
    designation,
    manufacturer,
    totalImpulseNs,
    avgThrustN,
    burnTimeS,
    diameterMm,
    lengthMm,
  };
}

/**
 * Searches the ThrustCurve motor database. At least one query criterion is
 * required (API contract). Returns validated, finite/positive summaries only.
 *
 * @param query     search criteria (passed through to POST /search.json)
 * @param fetchImpl injected fetch (mocked in tests)
 */
export async function searchMotors(
  query: ThrustCurveSearchQuery,
  fetchImpl: FetchImpl,
  options: ThrustCurveApiOptions = {},
): Promise<MotorSummary[]> {
  const body = buildSearchBody(query);
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const json = await postJson(
    `${base}/search.json`,
    body,
    fetchImpl,
    options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
  );
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new ThrustCurveApiError('ThrustCurve search response is not an object');
  }
  const { results, error } = json as { results?: unknown; error?: unknown };
  if (typeof error === 'string' && error.length > 0) {
    throw new ThrustCurveApiError(`ThrustCurve search failed: ${error}`);
  }
  if (!Array.isArray(results)) {
    throw new ThrustCurveApiError('ThrustCurve search response has no results array');
  }
  return results
    .map(toMotorSummary)
    .filter((summary): summary is MotorSummary => summary !== null);
}

/** Simfile source preference: certified data beats manufacturer, beats user. */
const SOURCE_PRIORITY: Record<string, number> = { cert: 0, mfr: 1, user: 2 };

/** Best download result for this motor/format by source priority, or null. */
function pickSimfile(results: unknown, motorId: string, format: string): { data: string } | null {
  if (!Array.isArray(results)) return null;
  let best: { data: string } | null = null;
  let bestPriority = Infinity;
  for (const result of results) {
    if (typeof result !== 'object' || result === null || Array.isArray(result)) continue;
    const record = result as Record<string, unknown>;
    if (record.motorId !== motorId || record.format !== format) continue;
    if (typeof record.data !== 'string' || record.data.length === 0) continue;
    const priority = SOURCE_PRIORITY[String(record.source)] ?? Infinity;
    if (priority < bestPriority) {
      bestPriority = priority;
      best = { data: record.data };
    }
  }
  return best;
}

function decodeSimfileData(data: string, motorId: string): string {
  try {
    const binary = atob(data);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const text = new TextDecoder('utf-8').decode(bytes);
    if (text.length === 0) throw new Error('empty');
    return text;
  } catch {
    throw new ThrustCurveApiError(
      `ThrustCurve API returned an undecodable simfile for motor ${motorId}`,
      200,
    );
  }
}

/**
 * Downloads the raw simulator file (.eng RASP, falling back to .rse RockSim)
 * for a motor as plain text, ready for parseRaspEng/parseRseXml. Fails closed
 * when the API returns no usable simfile for the motor.
 *
 * @param motorId   ThrustCurve motor id (from a search summary)
 * @param fetchImpl injected fetch (mocked in tests)
 */
export async function downloadMotorSimfile(
  motorId: string,
  fetchImpl: FetchImpl,
  options: ThrustCurveApiOptions = {},
): Promise<string> {
  if (!nonEmptyString(motorId)) {
    throw new ThrustCurveApiError('ThrustCurve download requires a motorId');
  }
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const url = `${base}/download.json`;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;

  for (const format of ['RASP', 'RockSim'] as const) {
    const json = await postJson(
      url,
      { motorIds: [motorId], format, data: 'file' },
      fetchImpl,
      cacheTtlMs,
    );
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      throw new ThrustCurveApiError('ThrustCurve download response is not an object');
    }
    const { results, error } = json as { results?: unknown; error?: unknown };
    if (typeof error === 'string' && error.length > 0) {
      throw new ThrustCurveApiError(`ThrustCurve download failed: ${error}`);
    }
    const simfile = pickSimfile(results, motorId, format);
    if (simfile) return decodeSimfileData(simfile.data, motorId);
  }
  throw new ThrustCurveApiError(`ThrustCurve has no usable simfile for motor ${motorId}`);
}