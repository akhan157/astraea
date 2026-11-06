/**
 * Flight-evidence ledger: immutable ingested records plus calibration
 * candidates. Raw source text is preserved verbatim (cap 2 MB); parsed and
 * derived values are stored alongside, never in place of the raw bytes.
 * Applying a calibration appends an accepted entry; it never rewrites the
 * vehicle model or earlier entries.
 */

export type LedgerKind = 'altimeter-csv' | 'gps-gpx' | 'calibration' | 'note';

export type LedgerReview = 'unreviewed' | 'accepted' | 'rejected';

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  title: string;
  /** ISO-8601 ingestion timestamp. */
  createdAt: string;
  /** Original file name, or null for pasted text. Never fabricated. */
  sourceFileName: string | null;
  /** sha256 hex of the raw source bytes, or 'unavailable'. */
  sha256Hex: string;
  /** Raw source text, preserved verbatim. */
  rawText: string;
  /** Parsed sample count, when the kind has samples. */
  sampleCount: number | null;
  /** Units and conventions statement, e.g. "time s (assumed), altitude m (assumed)". */
  unitsNote: string;
  /** Processing steps applied to derive values, e.g. "resample dt 0.1 s". */
  processingSteps: string[];
  review: LedgerReview;
  /** Run key this entry was compared or calibrated against, when any. */
  linkedRunKey: string | null;
  /** Free-form note, e.g. fitted Cd interval and diagnostics. */
  note: string | null;
}

export const LEDGER_RAW_TEXT_MAX = 2_000_000;

export const LEDGER_KINDS: ReadonlyArray<LedgerKind> = ['altimeter-csv', 'gps-gpx', 'calibration', 'note'];

export const LEDGER_REVIEWS: ReadonlyArray<LedgerReview> = ['unreviewed', 'accepted', 'rejected'];

let ledgerCounter = 0;

/** Test-only reset for the id allocator. */
export function resetLedgerIdCounter(): void {
  ledgerCounter = 0;
}

export function ledgerEntryId(): string {
  ledgerCounter += 1;
  return `ledger-${ledgerCounter}`;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const SHA_RE = /^[0-9a-f]{64}$/;

/** Fail-closed ledger validation; throws on structural violations. */
export function validateLedgerEntry(value: unknown): LedgerEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('ledger entry must be an object');
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : ledgerEntryId();
  if (!LEDGER_KINDS.includes(raw.kind as LedgerKind)) {
    throw new Error(`ledger entry '${id}' has unknown kind ${JSON.stringify(raw.kind)}`);
  }
  if (typeof raw.title !== 'string' || raw.title.length === 0) {
    throw new Error(`ledger entry '${id}' needs a non-empty title`);
  }
  if (typeof raw.createdAt !== 'string' || !ISO_RE.test(raw.createdAt)) {
    throw new Error(`ledger entry '${id}' needs an ISO-8601 createdAt`);
  }
  if (typeof raw.rawText !== 'string') {
    throw new Error(`ledger entry '${id}' needs rawText preserved verbatim`);
  }
  if (raw.rawText.length > LEDGER_RAW_TEXT_MAX) {
    throw new Error(`ledger entry '${id}' rawText exceeds the 2 MB cap`);
  }
  const sha = typeof raw.sha256Hex === 'string' ? raw.sha256Hex : 'unavailable';
  if (sha !== 'unavailable' && !SHA_RE.test(sha)) {
    throw new Error(`ledger entry '${id}' has a malformed sha256Hex`);
  }
  if (raw.sampleCount !== null && raw.sampleCount !== undefined) {
    if (typeof raw.sampleCount !== 'number' || !Number.isInteger(raw.sampleCount) || raw.sampleCount < 0) {
      throw new Error(`ledger entry '${id}' sampleCount must be a non-negative integer or null`);
    }
  }
  return {
    id,
    kind: raw.kind as LedgerKind,
    title: raw.title,
    createdAt: raw.createdAt,
    sourceFileName: typeof raw.sourceFileName === 'string' ? raw.sourceFileName : null,
    sha256Hex: sha,
    rawText: raw.rawText,
    sampleCount: typeof raw.sampleCount === 'number' ? raw.sampleCount : null,
    unitsNote: typeof raw.unitsNote === 'string' ? raw.unitsNote : '',
    processingSteps: Array.isArray(raw.processingSteps)
      ? raw.processingSteps.filter((s): s is string => typeof s === 'string')
      : [],
    review: LEDGER_REVIEWS.includes(raw.review as LedgerReview) ? (raw.review as LedgerReview) : 'unreviewed',
    linkedRunKey: typeof raw.linkedRunKey === 'string' ? raw.linkedRunKey : null,
    note: typeof raw.note === 'string' ? raw.note : null,
  };
}

function strictNullableString(raw: Record<string, unknown>, id: string, key: string): string | null {
  const v = raw[key];
  if (v !== null && typeof v !== 'string') {
    throw new Error(`ledger entry '${id}' ${key} must be a string or null`);
  }
  return v;
}

/**
 * Fail-closed ledger reader for stored documents. `validateLedgerEntry` is the
 * tolerant ingest helper (allocates ids, defaults absent optional fields); a
 * stored entry must already be complete, so nothing is allocated or defaulted.
 */
export function parseLedgerEntry(value: unknown): LedgerEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('ledger entry must be an object');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error('ledger entry needs a non-empty id');
  }
  const id = raw.id;
  if (typeof raw.sha256Hex !== 'string') {
    throw new Error(`ledger entry '${id}' needs sha256Hex (or 'unavailable')`);
  }
  if (raw.sampleCount !== null && typeof raw.sampleCount !== 'number') {
    throw new Error(`ledger entry '${id}' sampleCount must be a non-negative integer or null`);
  }
  if (typeof raw.unitsNote !== 'string') {
    throw new Error(`ledger entry '${id}' unitsNote must be a string`);
  }
  if (!Array.isArray(raw.processingSteps) || raw.processingSteps.some((s) => typeof s !== 'string')) {
    throw new Error(`ledger entry '${id}' processingSteps must be an array of strings`);
  }
  if (!LEDGER_REVIEWS.includes(raw.review as LedgerReview)) {
    throw new Error(`ledger entry '${id}' has unknown review ${JSON.stringify(raw.review)}`);
  }
  const sourceFileName = strictNullableString(raw, id, 'sourceFileName');
  const linkedRunKey = strictNullableString(raw, id, 'linkedRunKey');
  const note = strictNullableString(raw, id, 'note');
  const entry = validateLedgerEntry(raw);
  return { ...entry, sourceFileName, linkedRunKey, note };
}
