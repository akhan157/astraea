/**
 * Flight-log provenance: honest record of what the Evidence studio received.
 *
 * `parseAltimeterCsv` (altimetry.ts) discards the raw text, source name, and
 * skipped lines on success. This module rebuilds exactly that discarded
 * context as an inspectable record — never inferring what the bytes do not
 * state:
 *
 * - `sourceFileName` is the picked file's name, or null for pasted text
 *   (surfaced as "pasted text", never a fabricated name);
 * - `sha256Hex` is the SHA-256 hex of the exact raw text via
 *   `crypto.subtle`, or `'unavailable'` when SubtleCrypto is missing or
 *   refuses (never a placeholder hash);
 * - `dialect` is a heuristic display hint only: `altos-csv` requires an
 *   explicit AltOS marker or AltOS-typical sensor columns beside a
 *   recognized time+altitude header; everything else is `generic-csv`.
 *   Generic CSV parsing is not native avionics support (adapter matrix
 *   row 14);
 * - units are assumptions of the tolerant parser (seconds, meters), stated
 *   as such — the CSV carries no unit authority beyond its header text.
 */

import { ALT_HEADERS, TIME_HEADERS } from './altimetry';

/** Detected CSV flavour. Heuristic display hint, not avionics support. */
export type LogDialect = 'altos-csv' | 'generic-csv';

/** Time-column unit the tolerant parser assumes. Stated, not detected. */
export const LOG_TIME_UNIT_ASSUMPTION = 'seconds (assumed)';

/** Altitude-column unit the tolerant parser assumes. Stated, not detected. */
export const LOG_ALTITUDE_UNIT_ASSUMPTION = 'meters (assumed)';

/** Hash placeholder when SubtleCrypto is missing or refuses. */
export const UNAVAILABLE_HASH = 'unavailable';

export interface LogProvenanceInput {
  /** Exact raw log text that was parsed. */
  rawText: string;
  /** Picked file name, or null for pasted text. Never fabricated. */
  fileName: string | null;
  /** Parsed data-row count (e.g. `samples.length`). */
  rowCount: number;
}

export interface LogProvenance {
  sourceFileName: string | null;
  sha256Hex: string;
  rowCount: number;
  dialect: LogDialect;
  timeUnitAssumption: string;
  altitudeUnitAssumption: string;
  skippedLineCount: number;
}

/**
 * SHA-256 hex of the exact text (UTF-8). Returns `'unavailable'` when
 * SubtleCrypto is missing or the digest rejects — a missing checksum is
 * reported, never fabricated.
 */
export async function sha256HexOfText(text: string): Promise<string> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle === undefined) return UNAVAILABLE_HASH;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return UNAVAILABLE_HASH;
  }
}

/** AltOS-typical sensor columns that a plain time+altitude log lacks. */
const ALTOS_SENSOR_COLUMNS: Record<string, true> = {
  pressure: true,
  press: true,
  temperature: true,
  temp: true,
  accel: true,
  acceleration: true,
  battery: true,
  batt: true,
  pyro: true,
  drogue: true,
  continuity: true,
};

/** First line carrying content: skips blanks and `#`/`;` comments. */
function firstContentLine(rawText: string): string | null {
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) continue;
    return line;
  }
  return null;
}

/** Split one line on CSV delimiters, honoring double-quoted fields. */
function splitHeaderCells(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells.map((c) => c.toLowerCase());
}

/**
 * Heuristic dialect hint: `altos-csv` only on an explicit AltOS marker or
 * AltOS-typical sensor columns beside a recognized time+altitude header;
 * otherwise `generic-csv`. Unknown variants stay generic — never guessed
 * into a natively supported avionics format.
 */
export function detectLogDialect(rawText: string): LogDialect {
  if (/\baltos\b/i.test(rawText)) return 'altos-csv';
  const first = firstContentLine(rawText);
  if (first !== null) {
    const cells = splitHeaderCells(first);
    const headerPair =
      cells.some((c) => TIME_HEADERS[c] === true) &&
      cells.some((c) => ALT_HEADERS[c] === true);
    if (headerPair && cells.some((c) => ALTOS_SENSOR_COLUMNS[c] === true)) {
      return 'altos-csv';
    }
  }
  return 'generic-csv';
}

/**
 * Lines that did not become parsed rows: blanks, comments, unparseable data
 * rows — plus the header row when the first content line is header-like
 * (any non-numeric cell). Never negative.
 */
export function countSkippedLines(rawText: string, rowCount: number): number {
  const lines = rawText.split(/\r?\n/);
  const first = firstContentLine(rawText);
  const headerLike =
    first !== null &&
    splitHeaderCells(first).some((c) => c.length === 0 || !Number.isFinite(Number(c)));
  return Math.max(0, lines.length - (headerLike ? 1 : 0) - rowCount);
}

/**
 * Build the provenance record for one successful ingestion. Async only
 * because the checksum goes through `crypto.subtle`; otherwise pure and
 * deterministic.
 */
export async function buildLogProvenance(input: LogProvenanceInput): Promise<LogProvenance> {
  return {
    sourceFileName: input.fileName,
    sha256Hex: await sha256HexOfText(input.rawText),
    rowCount: input.rowCount,
    dialect: detectLogDialect(input.rawText),
    timeUnitAssumption: LOG_TIME_UNIT_ASSUMPTION,
    altitudeUnitAssumption: LOG_ALTITUDE_UNIT_ASSUMPTION,
    skippedLineCount: countSkippedLines(input.rawText, input.rowCount),
  };
}
