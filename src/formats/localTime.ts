/**
 * Timestamps for people: local date and time with the time zone named, e.g.
 * "Nov 17, 2026, 3:08 PM PST (UTC−08:00)".
 *
 * Machine-readable records (trace JSON, project files, provenance) keep
 * ISO-8601 UTC; this is only the shown form, so a reader never has to convert
 * a bare "Z" timestamp in their head or guess which zone a time is in.
 */

export interface LocalTimeOptions {
  /** IANA zone; defaults to the browser's own. Tests pin it. */
  timeZone?: string;
}

function offsetLabel(date: Date, timeZone: string | undefined): string | null {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (part === undefined) return null;
    // "GMT-08:00" → "UTC−08:00"; a bare "GMT" is UTC itself.
    if (part === 'GMT' || part === 'GMT+00:00' || part === 'GMT-00:00') return 'UTC';
    return part.replace(/^GMT/, 'UTC').replace('-', '−');
  } catch {
    return null;
  }
}

/**
 * Local date and time with zone and UTC offset. An unreadable input says so
 * instead of showing "Invalid Date".
 */
export function formatLocalTimestamp(value: Date | string | number, options: LocalTimeOptions = {}): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return `unreadable time (${String(value)})`;
  const { timeZone } = options;
  let text: string;
  let zone: string | undefined;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).formatToParts(date);
    zone = parts.find((p) => p.type === 'timeZoneName')?.value;
    // ICU puts a narrow no-break space before AM/PM; plain spaces keep the
    // text identical across engines and searchable.
    text = parts.filter((p) => p.type !== 'timeZoneName').map((p) => p.value).join('').replace(/[\u202f\u00a0]/g, ' ').trim();
  } catch {
    return date.toISOString();
  }
  const offset = offsetLabel(date, timeZone);
  // A zone that is only an offset ("GMT+1") is replaced by the offset label;
  // a named one ("PST") keeps its name with the offset beside it.
  if (zone === undefined || /^(GMT|UTC)/.test(zone)) return offset ? `${text} ${offset}` : text;
  return offset ? `${text} ${zone} (${offset})` : `${text} ${zone}`;
}

/** ISO-8601 instants with a zone designator, as the app writes them. */
const ISO_INSTANT = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/g;

/** Rewrites every ISO instant in a display string as a local timestamp. */
export function localizeIsoTimestamps(text: string, options: LocalTimeOptions = {}): string {
  return text.replace(ISO_INSTANT, (iso) => formatLocalTimestamp(iso, options));
}
