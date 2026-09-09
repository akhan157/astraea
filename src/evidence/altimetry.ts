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
const TIME_HEADERS: Record<string, true> = {
  time: true,
  t: true,
  timestamp: true,
  time_s: true,
  'time (s)': true,
};

const ALT_HEADERS: Record<string, true> = {
  alt: true,
  altitude: true,
  agl: true,
  altitude_m: true,
  alt_m: true,
  'altitude (m)': true,
};

const TOLERANCE_S = 1e-9;

/**
 * Parse an altimeter/flight-log CSV into altitude samples.
 *
 * Tolerant by design:
 * - header row may use any alias from TIME_HEADERS / ALT_HEADERS, possibly quoted;
 * - blank lines and lines starting with `#` or `;` are skipped anywhere;
 * - extra columns are ignored; unparseable data rows are skipped;
 * - if no header is recognized, column 0 = time, column 1 = altitude.
 *
 * Throws if no valid data rows remain.
 */
export function parseAltimeterCsv(text: string): AltitudeSample[] {
  const samples: AltitudeSample[] = [];

  let timeIdx = -1;
  let altIdx = -1;
  let headerSeen = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }

    const cells = splitCsvLine(line);

    if (!headerSeen) {
      const lower = cells.map((c) => c.toLowerCase());
      const tIdx = lower.findIndex((c) => TIME_HEADERS[c] === true);
      const aIdx = lower.findIndex((c) => ALT_HEADERS[c] === true);
      if (tIdx !== -1 && aIdx !== -1) {
        timeIdx = tIdx;
        altIdx = aIdx;
        headerSeen = true;
        continue;
      }
      // No recognized header: treat the first non-comment line as a data row
      // with the conventional (time, altitude, ...) column order.
      headerSeen = true;
      timeIdx = 0;
      altIdx = 1;
    }

    const t = parseFinite(cells[timeIdx]);
    const a = parseFinite(cells[altIdx]);
    if (t !== null && a !== null) {
      samples.push({ timeS: t, altitudeM: a });
    }
  }

  if (samples.length === 0) {
    throw new Error(
      'parseAltimeterCsv: no valid data rows (expected a header naming time/t and alt/altitude/agl columns)',
    );
  }

  // Downstream resample/align assume ascending time.
  samples.sort((x, y) => x.timeS - y.timeS);
  return samples;
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
 * Align a simulated trajectory to a flight log by matching apogees (argmax of
 * altitude). Returns:
 * - timeOffsetS: add this to flight times to bring flight onto sim time
 *   (sim apogee time minus flight apogee time);
 * - apogeeDeltaM: sim apogee altitude minus flight apogee altitude;
 * - burnoutVelDeltaMs: sim burnout velocity minus flight burnout velocity,
 *   where burnout velocity is the maximum vertical velocity in the series
 *   (velocity peaks at motor burnout in a typical flight).
 */
export function alignSimToFlight(
  sim: readonly TrajectorySample[],
  flight: readonly TrajectorySample[],
): AlignResult {
  if (sim.length === 0 || flight.length === 0) {
    throw new Error('alignSimToFlight: both sim and flight must be non-empty');
  }

  const simApogee = findApogee(sim);
  const flightApogee = findApogee(flight);

  return {
    timeOffsetS: simApogee.timeS - flightApogee.timeS,
    apogeeDeltaM: simApogee.altitudeM - flightApogee.altitudeM,
    burnoutVelDeltaMs: burnoutVelocityMs(sim) - burnoutVelocityMs(flight),
  };
}

export interface AlignResult {
  timeOffsetS: number;
  apogeeDeltaM: number;
  burnoutVelDeltaMs: number;
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
 * Maximum vertical velocity, used as the burnout-velocity proxy.
 * Throws if no velocity data is available on either series.
 */
function burnoutVelocityMs(...series: readonly (readonly TrajectorySample[])[]): number {
  let max: number | undefined;
  for (const s of series) {
    for (const p of s) {
      if (p.velocityMs !== undefined) {
        max = max === undefined ? p.velocityMs : Math.max(max, p.velocityMs);
      }
    }
  }
  if (max === undefined) {
    throw new Error('alignSimToFlight: velocityMs required on at least one series for burnout comparison');
  }
  return max;
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