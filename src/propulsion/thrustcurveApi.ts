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
 *   - Do not exceed 2 requests/second against the API. The text search
 *     (`searchMotorsByText`) fires several requests for one query, so it
 *     spaces them at least 500 ms apart; a request that never got a response
 *     does not hold its slot.
 *
 * Text search: the API matches `designation` exactly (case-insensitive),
 * `commonName` only for the letter-and-number pattern (K550 finds the K550W),
 * and `manufacturer` only for a listed name or abbreviation ("Aerotech" is an
 * error, "AeroTech" is not). `searchMotorsByText` therefore resolves the
 * manufacturer against /metadata.json, queries each field that can match,
 * merges by motorId, and reports which searches failed so "no matches" is
 * never confused with "request failed".
 *
 * Fail-closed contract:
 *   - HTTP errors (4xx/5xx) throw ThrustCurveApiError carrying the status and,
 *     for rate-limit responses, `retryAfterSeconds` from the Retry-After
 *     header.
 *   - Network/transport failures and non-JSON bodies throw.
 *   - A search record missing any required summary field, or carrying a
 *     non-finite/non-positive metric, is dropped (never fabricated); a
 *     structurally invalid payload throws.
 *   - `hasDataFiles` is enforced client-side on the response (kept only
 *     records whose `dataFiles` count is finite and positive) and is never
 *     part of the request: on 2026-09-27 the server-side filter reported 0
 *     matches for every query even though records carry `dataFiles` > 0, so
 *     sending it made every live search return an empty list.
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
  /**
   * Minimum spacing between network requests of a multi-request search, ms.
   * Default 500 (the API's 2 requests/second). Tests pass 0.
   */
  minRequestIntervalMs?: number;
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

/** Earliest time the next spaced request may start (ms epoch). */
let nextRequestAt = 0;

/**
 * Reserves the next request slot `intervalMs` after the previous one and
 * waits for it. Reserving before waiting serialises concurrent searches.
 * Returns a release for a request that never got a response.
 */
async function waitForSlot(intervalMs: number): Promise<() => void> {
  if (intervalMs <= 0) return () => undefined;
  const now = Date.now();
  const start = Math.max(now, nextRequestAt);
  const reserved = start + intervalMs;
  const previous = nextRequestAt;
  nextRequestAt = reserved;
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
  return () => {
    if (nextRequestAt === reserved) nextRequestAt = Math.max(previous, Date.now());
  };
}

/**
 * POSTs a JSON body, serving and storing through the TTL cache. Throws
 * ThrustCurveApiError on transport failure, non-2xx (surfacing Retry-After),
 * and non-JSON bodies. With `minIntervalMs`, a request that misses the cache
 * waits for its rate-limit slot first.
 */
async function postJson(
  url: string,
  body: unknown,
  fetchImpl: FetchImpl,
  cacheTtlMs: number,
  minIntervalMs = 0,
): Promise<unknown> {
  const key = `${url} ${JSON.stringify(body)}`;
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const release = await waitForSlot(minIntervalMs);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    release();
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
    // hasDataFiles is a client-side filter (see module header): the
    // server-side criterion matches 0 motors regardless of data-file
    // availability, so it must not reach the request.
    if (key === 'hasDataFiles') continue;
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
  return (await searchMotorsPage(query, fetchImpl, options, 0)).results;
}

/** One search request: the validated summaries plus the server's total match count, when it sends one. */
async function searchMotorsPage(
  query: ThrustCurveSearchQuery,
  fetchImpl: FetchImpl,
  options: ThrustCurveApiOptions,
  minIntervalMs: number,
): Promise<{ results: MotorSummary[]; matches: number | null }> {
  const body = buildSearchBody(query);
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const json = await postJson(
    `${base}/search.json`,
    body,
    fetchImpl,
    options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    minIntervalMs,
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
  // hasDataFiles was stripped from the request (module header): enforce it
  // here so "only motors whose curve can actually be imported" still holds.
  // A record without a finite, positive dataFiles count is dropped rather
  // than shown and later dead-ended at download time.
  const records = query.hasDataFiles === true
    ? results.filter((raw) => {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
        const count = (raw as Record<string, unknown>).dataFiles;
        return typeof count === 'number' && Number.isFinite(count) && count > 0;
      })
    : results;
  const matches = (json as { matches?: unknown }).matches;
  return {
    results: records.map(toMotorSummary).filter((summary): summary is MotorSummary => summary !== null),
    matches: typeof matches === 'number' && Number.isInteger(matches) && matches >= 0 ? matches : null,
  };
}

/** A manufacturer as /metadata.json lists it: the name and the abbreviation searches accept. */
export interface ManufacturerName {
  name: string;
  abbrev: string;
}

/** The manufacturer list (cached 24 h like every response). Throws on a failed or malformed reply. */
export async function fetchManufacturers(
  fetchImpl: FetchImpl,
  options: ThrustCurveApiOptions = {},
  minIntervalMs = 0,
): Promise<ManufacturerName[]> {
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const json = await postJson(`${base}/metadata.json`, {}, fetchImpl, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS, minIntervalMs);
  const list = (json as { manufacturers?: unknown } | null)?.manufacturers;
  if (!Array.isArray(list)) throw new ThrustCurveApiError('ThrustCurve metadata response has no manufacturers list');
  return list
    .filter((m): m is ManufacturerName => m !== null && typeof m === 'object' && nonEmptyString((m as ManufacturerName).name) && nonEmptyString((m as ManufacturerName).abbrev));
}

const squash = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The listed manufacturer a typed word means: an exact match on the name or
 * abbreviation ignoring case, spaces and punctuation ("aerotech", "Estes
 * Industries"), else the only one whose name or abbreviation starts with it
 * (four characters or more, so "cesar" is Cesaroni but "a" is nothing).
 */
export function matchManufacturer(text: string, list: readonly ManufacturerName[]): ManufacturerName | null {
  const key = squash(text);
  if (key.length < 2) return null;
  const exact = list.find((m) => squash(m.name) === key || squash(m.abbrev) === key);
  if (exact) return exact;
  if (key.length < 4) return null;
  const prefixed = list.filter((m) => squash(m.name).startsWith(key) || squash(m.abbrev).startsWith(key));
  return prefixed.length === 1 ? prefixed[0] : null;
}

/** The API's commonName pattern (letter class and average thrust), case-insensitive. */
const COMMON_NAME = /^(1\/8A|1\/4A|1\/2A|[A-O])[0-9]+$/i;

export interface TextSearchAttempt {
  /** What was searched, in plain words: "designation", "common name", "manufacturer"… */
  field: string;
  value: string;
  /** Server-side match count for this search, when reported (before the curve-file filter). */
  matches: number | null;
  /** Results shown from this search (after the curve-file filter). */
  shown: number;
}

export interface TextSearchOutcome {
  /** Merged by motorId, in search order. */
  results: MotorSummary[];
  attempts: TextSearchAttempt[];
  /** Searches that failed (network, HTTP or a malformed reply); results may be incomplete. */
  failures: Array<{ field: string; value: string; message: string }>;
  /** The manufacturer the text was read as, when one matched. */
  manufacturer: ManufacturerName | null;
}

/**
 * Searches by whatever the user typed: a designation (C6-5, K550W), a common
 * name (C6, K550), a manufacturer (AeroTech, estes), or a manufacturer plus a
 * designation (AeroTech K550W). Fires one request per field that can match,
 * spaced for the rate limit, and merges by motorId. Throws only when every
 * request failed, so an empty result is a real "no matches".
 */
export async function searchMotorsByText(
  text: string,
  fetchImpl: FetchImpl,
  options: ThrustCurveApiOptions & { maxResults?: number } = {},
): Promise<TextSearchOutcome> {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) throw new ThrustCurveApiError('ThrustCurve search requires at least one search criterion');
  const interval = options.minRequestIntervalMs ?? 500;
  const maxResults = options.maxResults ?? 25;
  const failures: TextSearchOutcome['failures'] = [];
  const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const tokens = trimmed.split(' ');

  // Only a word without digits can name a manufacturer; designations carry
  // digits, so "C6" or "K550W" never costs the metadata request.
  let manufacturer: ManufacturerName | null = null;
  let rest = trimmed;
  if (tokens.some((t) => /^[^0-9]{2,}$/.test(t))) {
    try {
      const list = await fetchManufacturers(fetchImpl, options, interval);
      for (let n = tokens.length; n >= 1 && manufacturer === null; n--) {
        const m = matchManufacturer(tokens.slice(0, n).join(' '), list);
        if (m) { manufacturer = m; rest = tokens.slice(n).join(' '); }
      }
      for (let n = tokens.length - 1; n >= 1 && manufacturer === null; n--) {
        const m = matchManufacturer(tokens.slice(tokens.length - n).join(' '), list);
        if (m) { manufacturer = m; rest = tokens.slice(0, tokens.length - n).join(' '); }
      }
    } catch (err) {
      failures.push({ field: 'manufacturer lookup', value: trimmed, message: reason(err) });
    }
  }

  const plans: Array<{ field: string; value: string; query: ThrustCurveSearchQuery }> = [];
  const base = { hasDataFiles: true, maxResults } as const;
  if (manufacturer !== null && rest === '') {
    plans.push({ field: 'manufacturer', value: manufacturer.name, query: { ...base, manufacturer: manufacturer.abbrev } });
  } else if (manufacturer !== null) {
    plans.push({ field: 'manufacturer and designation', value: `${manufacturer.name} ${rest}`, query: { ...base, manufacturer: manufacturer.abbrev, designation: rest } });
    if (COMMON_NAME.test(rest)) plans.push({ field: 'manufacturer and common name', value: `${manufacturer.name} ${rest}`, query: { ...base, manufacturer: manufacturer.abbrev, commonName: rest } });
  } else {
    plans.push({ field: 'designation', value: trimmed, query: { ...base, designation: trimmed } });
    if (COMMON_NAME.test(trimmed)) plans.push({ field: 'common name', value: trimmed, query: { ...base, commonName: trimmed } });
  }

  const merged = new Map<string, MotorSummary>();
  const attempts: TextSearchAttempt[] = [];
  let lastError: unknown = null;
  for (const plan of plans) {
    try {
      const page = await searchMotorsPage(plan.query, fetchImpl, options, interval);
      for (const motor of page.results) if (!merged.has(motor.id)) merged.set(motor.id, motor);
      attempts.push({ field: plan.field, value: plan.value, matches: page.matches, shown: page.results.length });
    } catch (err) {
      lastError = err;
      failures.push({ field: plan.field, value: plan.value, message: reason(err) });
    }
  }
  // Every search failed: rethrow (keeping any HTTP status), never "no matches".
  if (attempts.length === 0) throw lastError instanceof Error ? lastError : new ThrustCurveApiError('ThrustCurve search failed');
  return { results: [...merged.values()], attempts, failures, manufacturer };
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