/**
 * Flight altimetry ingestion: tolerant CSV parsing, uniform resampling,
 * and sim-vs-flight alignment by apogee matching.
 */

/** A single altitude sample with absolute (epoch-relative) time. */
export interface AltitudeSample {
  timeS: number;
  altitudeM: number;
}

/**
 * A trajectory sample that may also carry vertical velocity.
 * Simulation outputs and synthetic flight logs typically include velocityMs;
 * the CSV parser only recovers timeS/altitudeM.
 */
export interface TrajectorySample {
  timeS: number;
  altitudeM: number;
  velocityMs?: number;
}

/** Recognized case-insensitive column names (already unquoted). */
export const TIME_HEADERS: Record<string, true> = {
  time: true,
  t: true,
  timestamp: true,
  time_s: true,
  'time (s)': true,
  time_ms: true,
  'time(ms)': true,
  'time (ms)': true,
  t_ms: true,
  't(ms)': true,
};

/** Time headers carrying milliseconds; values are scaled to seconds. */
export const TIME_HEADERS_MS: Record<string, true> = {
  time_ms: true,
  'time(ms)': true,
  'time (ms)': true,
  t_ms: true,
  't(ms)': true,
};

export const ALT_HEADERS: Record<string, true> = {
  alt: true,
  altitude: true,
  agl: true,
  altitude_m: true,
  alt_m: true,
  'altitude (m)': true,
  'altitude(m)': true,
  'alt(m)': true,
  altitude_ft: true,
  alt_ft: true,
  agl_ft: true,
  'altitude (ft)': true,
  'altitude(ft)': true,
  'alt (ft)': true,
  'alt(ft)': true,
  'agl (ft)': true,
  'agl(ft)': true,
};

/** Altitude headers carrying feet; values are scaled to meters. */
export const ALT_HEADERS_FT: Record<string, true> = {
  altitude_ft: true,
  alt_ft: true,
  agl_ft: true,
  'altitude (ft)': true,
  'altitude(ft)': true,
  'alt (ft)': true,
  'alt(ft)': true,
  'agl (ft)': true,
  'agl(ft)': true,
};

/** Vertical-velocity column aliases (case-insensitive, already unquoted), metres per second. */
export const VELOCITY_HEADERS_MS: Record<string, true> = {
  velocity: true,
  vel: true,
  velocity_m_s: true,
  velocity_ms: true,
  'velocity (m/s)': true,
  'velocity(m/s)': true,
  'vel (m/s)': true,
  'vel(m/s)': true,
  vertical_velocity: true,
  'vertical velocity (m/s)': true,
};

/** Vertical-velocity column aliases carrying feet per second; scaled to m/s. */
export const VELOCITY_HEADERS_FPS: Record<string, true> = {
  velocity_ft_s: true,
  velocity_fps: true,
  'velocity (ft/s)': true,
  'velocity(ft/s)': true,
  'vel (ft/s)': true,
  'vel(ft/s)': true,
};

/** Headers that state seconds or meters explicitly (the unit came from the file). */
const TIME_HEADERS_S: Record<string, true> = { time_s: true, 'time (s)': true };
const ALT_HEADERS_M: Record<string, true> = {
  altitude_m: true,
  alt_m: true,
  'altitude (m)': true,
  'altitude(m)': true,
  'alt(m)': true,
};

const FEET_TO_M = 0.3048;

export type LogTimeUnit = 's' | 'ms';
export type LogAltitudeUnit = 'm' | 'ft';

/** User-chosen units; an absent field means "use the header, else assume". */
export interface LogUnitOverrides {
  time?: LogTimeUnit;
  altitude?: LogAltitudeUnit;
}

/** Where a column's unit came from: the header text, the user, or the default. */
export type LogUnitBasis = 'header' | 'override' | 'assumed';

export interface ResolvedLogUnit<U> {
  unit: U;
  basis: LogUnitBasis;
}

export interface AltimeterParse {
  samples: AltitudeSample[];
  timeUnit: ResolvedLogUnit<LogTimeUnit>;
  altitudeUnit: ResolvedLogUnit<LogAltitudeUnit>;
}

const TOLERANCE_S = 1e-9;

/**
 * Parse an altimeter/flight-log CSV into altitude samples.
 *
 * Tolerant by design:
 * - header row may use any alias from TIME_HEADERS / ALT_HEADERS, possibly quoted;
 * - blank lines and lines starting with `#` or `;` are skipped anywhere;
 * - extra columns are ignored; unparseable data rows are skipped;
 * - headerless all-numeric data uses column 0 = time, column 1 = altitude;
 * - a header-like first line (any non-numeric cell) with unrecognized
 *   aliases throws instead of guessing the column order.
 *
 * Throws if no valid data rows remain.
 */
export function parseAltimeterCsv(text: string, overrides: LogUnitOverrides = {}): AltitudeSample[] {
  return parseAltimeterCsvDetailed(text, overrides).samples;
}

/**
 * `parseAltimeterCsv` plus the units it applied and where each came from.
 * A unit named in the header (`time_ms`, `altitude (ft)`, …) is used unless
 * the user overrides it; with neither, seconds and meters are assumed and
 * reported as assumptions.
 */
export function parseAltimeterCsvDetailed(text: string, overrides: LogUnitOverrides = {}): AltimeterParse {
  const { samples, timeUnit, altitudeUnit } = parseLogCore(text, overrides);
  return {
    samples: samples.map((s) => ({ timeS: s.timeS, altitudeM: s.altitudeM })),
    timeUnit,
    altitudeUnit,
  };
}

/** A parsed log whose samples also carry the vertical velocity column, when the log has one. */
export interface TrajectoryParse {
  samples: TrajectorySample[];
  timeUnit: ResolvedLogUnit<LogTimeUnit>;
  altitudeUnit: ResolvedLogUnit<LogAltitudeUnit>;
  /** True when a recognized velocity column supplied `velocityMs` for at least one sample. */
  hasVelocity: boolean;
}

/**
 * `parseAltimeterCsvDetailed` that also reads a vertical-velocity column
 * (`Velocity(m/s)`, `velocity_ft_s`, …) into `velocityMs`. Time and altitude
 * parse exactly as in `parseAltimeterCsvDetailed`; a row whose velocity cell is
 * blank or non-numeric simply has no `velocityMs`.
 */
export function parseTrajectoryCsv(text: string, overrides: LogUnitOverrides = {}): TrajectoryParse {
  const parsed = parseLogCore(text, overrides);
  return { ...parsed, hasVelocity: parsed.samples.some((s) => s.velocityMs !== undefined) };
}

function parseLogCore(
  text: string,
  overrides: LogUnitOverrides,
): { samples: TrajectorySample[]; timeUnit: ResolvedLogUnit<LogTimeUnit>; altitudeUnit: ResolvedLogUnit<LogAltitudeUnit> } {
  const samples: TrajectorySample[] = [];
  let velIdx = -1;
  let velFeet = false;
  const lines = text.split(/\r?\n/);

  let timeIdx = -1;
  let altIdx = -1;
  let timeHeader: string | null = null;
  let altHeader: string | null = null;
  let headerSeen = false;
  let headerLineIndex = -1;
  let resolved: Omit<AltimeterParse, 'samples'> | null = null;

  // First pass: locate a recognized time+altitude header pair. Real export
  // logs (e.g. Altimeter Cloud) prefix the data with metadata rows, so the
  // header is not necessarily the first content line. If no pair exists, the
  // legacy first-line behavior below still applies (fail closed on a
  // header-like first line, accept headerless numeric data).
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) continue;
    const lower = splitCsvLine(line).map((c) => c.toLowerCase());
    const tIdx = lower.findIndex((c) => TIME_HEADERS[c] === true);
    const aIdx = lower.findIndex((c) => ALT_HEADERS[c] === true);
    if (tIdx !== -1 && aIdx !== -1) {
      timeIdx = tIdx;
      altIdx = aIdx;
      timeHeader = lower[tIdx];
      altHeader = lower[aIdx];
      ({ index: velIdx, feet: velFeet } = findVelocityColumn(lower));
      headerSeen = true;
      headerLineIndex = i;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }

    const cells = splitCsvLine(line);

    if (headerSeen) {
      // Only data rows after the recognized header become samples; metadata
      // and the header row itself are skipped.
      if (i <= headerLineIndex) continue;
    } else {
      const lower = cells.map((c) => c.toLowerCase());
      const tIdx = lower.findIndex((c) => TIME_HEADERS[c] === true);
      const aIdx = lower.findIndex((c) => ALT_HEADERS[c] === true);
      if (tIdx !== -1 && aIdx !== -1) {
        timeIdx = tIdx;
        altIdx = aIdx;
        timeHeader = lower[tIdx];
        altHeader = lower[aIdx];
        ({ index: velIdx, feet: velFeet } = findVelocityColumn(lower));
        headerSeen = true;
        continue;
      }
      // Header-like first line (any non-numeric cell) whose aliases were not
      // fully recognized: refuse to guess column order — misreading a header
      // silently corrupts every row. Headerless all-numeric data is still
      // supported in the conventional (time, altitude, ...) order.
      const headerLike = cells.some((c) => parseFinite(c) === null);
      if (headerLike) {
        throw new Error(
          'parseAltimeterCsv: unrecognized header row (expected a time/t and alt/altitude/agl column)',
        );
      }
      headerSeen = true;
      timeIdx = 0;
      altIdx = 1;
    }

    // Units resolve once the header (or its absence) is known.
    resolved ??= resolveUnits(timeHeader, altHeader, overrides);
    const t = parseFinite(cells[timeIdx]);
    const a = parseFinite(cells[altIdx]);
    if (t !== null && a !== null) {
      const sample: TrajectorySample = {
        timeS: resolved.timeUnit.unit === 'ms' ? t * 0.001 : t,
        altitudeM: resolved.altitudeUnit.unit === 'ft' ? a * FEET_TO_M : a,
      };
      const v = velIdx === -1 ? null : parseFinite(cells[velIdx]);
      if (v !== null) sample.velocityMs = velFeet ? v * FEET_TO_M : v;
      samples.push(sample);
    }
  }

  if (samples.length === 0) {
    throw new Error(
      'parseAltimeterCsv: no valid data rows (expected a header naming time/t and alt/altitude/agl columns)',
    );
  }

  // Downstream resample/align assume ascending time.
  samples.sort((x, y) => x.timeS - y.timeS);
  return { samples, ...(resolved ?? resolveUnits(timeHeader, altHeader, overrides)) };
}

function findVelocityColumn(lowerCells: readonly string[]): { index: number; feet: boolean } {
  const ms = lowerCells.findIndex((c) => VELOCITY_HEADERS_MS[c] === true);
  if (ms !== -1) return { index: ms, feet: false };
  const fps = lowerCells.findIndex((c) => VELOCITY_HEADERS_FPS[c] === true);
  return { index: fps, feet: fps !== -1 };
}

function resolveUnits(
  timeHeader: string | null,
  altHeader: string | null,
  overrides: LogUnitOverrides,
): Omit<AltimeterParse, 'samples'> {
  const timeUnit: ResolvedLogUnit<LogTimeUnit> = overrides.time
    ? { unit: overrides.time, basis: 'override' }
    : timeHeader !== null && TIME_HEADERS_MS[timeHeader] === true
      ? { unit: 'ms', basis: 'header' }
      : timeHeader !== null && TIME_HEADERS_S[timeHeader] === true
        ? { unit: 's', basis: 'header' }
        : { unit: 's', basis: 'assumed' };
  const altitudeUnit: ResolvedLogUnit<LogAltitudeUnit> = overrides.altitude
    ? { unit: overrides.altitude, basis: 'override' }
    : altHeader !== null && ALT_HEADERS_FT[altHeader] === true
      ? { unit: 'ft', basis: 'header' }
      : altHeader !== null && ALT_HEADERS_M[altHeader] === true
        ? { unit: 'm', basis: 'header' }
        : { unit: 'm', basis: 'assumed' };
  return { timeUnit, altitudeUnit };
}

/**
 * Resample an (optionally irregular) series onto a uniform time grid starting
 * at the first sample and stepping by `dt`, using linear interpolation.
 * Values outside the sample span are clamped to the nearest endpoint.
 */
export function resample(series: readonly AltitudeSample[], dt: number): AltitudeSample[] {
  if (series.length === 0) {
    return [];
  }
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new Error(`resample: dt must be a positive finite number (got ${dt})`);
  }
  for (const s of series) {
    if (!Number.isFinite(s.timeS) || !Number.isFinite(s.altitudeM)) {
      throw new Error(
        `resample: sample values must be finite numbers (got timeS=${s.timeS}, altitudeM=${s.altitudeM})`,
      );
    }
  }

  const sorted = [...series].sort((x, y) => x.timeS - y.timeS);
  const t0 = sorted[0].timeS;
  const t1 = sorted[sorted.length - 1].timeS;

  const out: AltitudeSample[] = [];
  for (let i = 0; t0 + i * dt <= t1 + TOLERANCE_S; i++) {
    const t = t0 + i * dt;
    out.push({ timeS: t, altitudeM: interpolateAltitude(sorted, t) });
  }
  return out;
}

/**
 * Align a simulated trajectory to a flight log by matching apogees.
 *
 * Apogee is the argmax of altitude with ties broken toward the first
 * occurrence: on a flat plateau of equal maximum altitudes the anchor is the
 * plateau floor (the first sample reaching the max), not its midpoint or end.
 *
 * Returns:
 * - timeOffsetS: add this to flight times to bring flight onto sim time
 *   (sim apogee time minus flight apogee time);
 * - apogeeDeltaM: sim apogee altitude minus flight apogee altitude;
 * - burnoutVelDeltaMs: sim burnout-velocity proxy minus flight proxy, where
 *   each proxy is the maximum vertical velocity of that series (velocity
 *   peaks at motor burnout in a typical flight). Null when either series
 *   carries no velocityMs, e.g. a plain CSV flight log; time/altitude
 *   alignment still works in that case.
 */
export function alignSimToFlight(
  sim: readonly TrajectorySample[],
  flight: readonly TrajectorySample[],
): AlignResult {
  if (sim.length === 0 || flight.length === 0) {
    throw new Error('alignSimToFlight: both sim and flight must be non-empty');
  }
  for (const s of sim) {
    if (!Number.isFinite(s.altitudeM)) {
      throw new Error(`alignSimToFlight: sim altitudes must be finite numbers (got ${s.altitudeM})`);
    }
    if (!Number.isFinite(s.timeS)) {
      throw new Error(`alignSimToFlight: sim times must be finite numbers (got ${s.timeS})`);
    }
  }
  for (const s of flight) {
    if (!Number.isFinite(s.altitudeM)) {
      throw new Error(`alignSimToFlight: flight altitudes must be finite numbers (got ${s.altitudeM})`);
    }
    if (!Number.isFinite(s.timeS)) {
      throw new Error(`alignSimToFlight: flight times must be finite numbers (got ${s.timeS})`);
    }
  }

  const simApogee = findApogee(sim);
  const flightApogee = findApogee(flight);

  const simBurnout = maxVelocityMs(sim);
  const flightBurnout = maxVelocityMs(flight);

  return {
    timeOffsetS: simApogee.timeS - flightApogee.timeS,
    apogeeDeltaM: simApogee.altitudeM - flightApogee.altitudeM,
    burnoutVelDeltaMs:
      simBurnout === null || flightBurnout === null ? null : simBurnout - flightBurnout,
  };
}

export interface AlignResult {
  timeOffsetS: number;
  apogeeDeltaM: number;
  /** Null when either series carries no velocityMs. */
  burnoutVelDeltaMs: number | null;
}

/** Sample with the maximum altitude; ties break toward the first occurrence. */
function findApogee(series: readonly TrajectorySample[]): TrajectorySample {
  let best = series[0];
  for (const s of series) {
    if (s.altitudeM > best.altitudeM) {
      best = s;
    }
  }
  return best;
}

/**
 * Maximum vertical velocity of one series, used as its burnout-velocity
 * proxy. Returns null when the series carries no velocityMs (e.g. a plain
 * CSV flight log).
 */
function maxVelocityMs(series: readonly TrajectorySample[]): number | null {
  let max: number | undefined;
  for (const p of series) {
    if (p.velocityMs !== undefined) {
      // A present-but-non-finite velocity would poison the max (NaN) or
      // fabricate a bogus proxy (Infinity); only genuine absence is allowed.
      if (!Number.isFinite(p.velocityMs)) {
        throw new Error(
          `alignSimToFlight: velocityMs must be a finite number when present (got ${p.velocityMs})`,
        );
      }
      max = max === undefined ? p.velocityMs : Math.max(max, p.velocityMs);
    }
  }
  return max === undefined ? null : max;
}

function interpolateAltitude(sorted: readonly AltitudeSample[], t: number): number {
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (t <= first.timeS) {
    return first.altitudeM;
  }
  if (t >= last.timeS) {
    return last.altitudeM;
  }

  // Binary search for the bracketing pair.
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].timeS <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const a = sorted[lo];
  const b = sorted[hi];
  const span = b.timeS - a.timeS;
  if (span <= TOLERANCE_S) {
    return a.altitudeM;
  }
  const f = (t - a.timeS) / span;
  return a.altitudeM + f * (b.altitudeM - a.altitudeM);
}

/** Split a CSV line, honoring double-quoted fields and `""` escapes. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';' || ch === '\t') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/** Parse a number, mapping empty/garbage to null instead of NaN/0. */
function parseFinite(cell: string | undefined): number | null {
  if (cell === undefined) {
    return null;
  }
  const trimmed = cell.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}