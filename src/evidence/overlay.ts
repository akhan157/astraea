/**
 * Sim-vs-actual telemetry overlay (WAVE-A2, Q4/Q5/Q11).
 *
 * Pure presentation-grade transforms for the TrajectoryOverlayChart:
 *   - `simTelemetryToSamples` maps a 6-DOF telemetry array onto the
 *     display's TrajectorySample[]; only presentation fields are carried
 *     (timeS, altitudeM, velocityMs).
 *   - `buildOverlaySeries` re-grids both series onto the Q4 display grid:
 *     uniform dt = 0.1 s via `resample` (the Q4-mandated re-grid), with
 *     velocity preserved by the same grid when the log carries it. Each
 *     series is then capped at OVERLAY_MAX_POINTS by stride decimation that
 *     provably keeps the endpoints, every local extremum, and the apogee.
 *   - `alignSimToFlight` (altimetry) treats both capped series as opaque
 *     altitude functions and returns the flight time offset the chart
 *     applies; alignment happens AFTER re-grid + cap so both share the
 *     dt grid the apogee anchor is resolved on.
 *   - `cursorIndexFor` maps an x fraction in [0,1] to nearest-sample
 *     indices of an aligned series — exactly what the draggable chart
 *     cursor needs. The returned time is the shared chart x (seconds, with
 *     the flight offset applied), i.e. the time label shown at the cursor.
 *
 * Charting policy (Q11): this module owns only data. Color/identity tokens
 * (cyan = modeled, violet = flight log) live in the SVG layer; no
 * safety-state color is ever a series identity here.
 */

import { resample, alignSimToFlight, type TrajectorySample } from './altimetry';
import type { SixDofTelemetryPoint } from '../sim/sixDofSimulator';

/** Q4 display grid: consumers always re-grid telemetry to dt = 0.1 s. */
export const OVERLAY_DT_S = 0.1;

/** Q4 downsample cap: a re-gridded overlay series never exceeds this many
 *  points (a 10-minute flight at dt = 0.1 s would otherwise be 6000).
 *  Decimation preserves endpoints, every local extremum of altitude, and
 *  hence the apogee. */
export const OVERLAY_MAX_POINTS = 1200;

/** Every visual state the chart can be in. The apogee chimney marks the
 *  recorded curve and therefore always uses the Q11 flight-log token
 *  (violet), never the emerald safety token. */
export type OverlayState = 'nominal' | 'short_apogee' | 'high_apogee';

/**
 * One re-gridded, downsampled, aligned display series.
 * `timeOffsetApply` is what `alignSimToFlight` says to ADD to raw flight
 * times to bring flight onto sim time; the chart applies it before plotting.
 */
export interface OverlaySeries {
  /** Derived re-gridded series (constant dt = OVERLAY_DT_S). */
  points: TrajectorySample[];
  /** Seconds. Aligned sample time = raw timeS + timeOffsetApply. */
  timeOffsetApply: number;
  /** First raw sample time, for labeling the raw span. */
  rawStartS: number;
  /** Last raw sample time, for labeling the raw span. */
  rawEndS: number;
  /** Legend label: "modeled" or "recorded". */
  label: string;
}

/** Cursor position resolved against an aligned series. */
export interface CursorIndex {
  /** Index into `points`. */
  index: number;
  /** Shared chart x (seconds, offset applied) of that sample. */
  timeS: number;
  /** y (meters) of that sample. */
  altitudeM: number;
}

/** Result of `buildOverlaySeries`; everything the chart needs to draw. */
export interface OverlayModel {
  /** The fixed Q4 re-grid step used for both series. */
  dtS: number;
  /** Modeled series, displayed cyan. */
  modeled: OverlaySeries;
  /** Recorded (flight-log) series, displayed violet. */
  recorded: OverlaySeries;
  /** Applied flight time offset (seconds). */
  timeOffsetS: number;
  /** Apogee altitude delta (modeled - recorded), meters. */
  apogeeDeltaM: number;
  /** Burnout-velocity proxy delta (modeled - recorded), m/s; null when the
   *  recorded log carries no velocity (a plain CSV export). */
  burnoutVelDeltaMs: number | null;
  /** Health verdict used for the chips and the apogee chimney. */
  state: OverlayState;
}

function maxAltitude(series: readonly TrajectorySample[]): number {
  let best = series.length ? series[0].altitudeM : Number.NEGATIVE_INFINITY;
  for (const s of series) {
    if (s.altitudeM > best) best = s.altitudeM;
  }
  return best;
}

/** True when the modeled apogee strays outside a 5% band of the recorded one. */
function classifyApogee(modeled: OverlaySeries, recorded: OverlaySeries): OverlayState {
  if (recorded.points.length === 0) return 'nominal';
  const simAp = maxAltitude(modeled.points);
  const recAp = maxAltitude(recorded.points);
  const band = Math.max(10, recAp * 0.05);
  if (simAp < recAp - band) return 'short_apogee';
  if (simAp > recAp + band) return 'high_apogee';
  return 'nominal';
}

/** Map raw sim telemetry (6-DOF) onto the display grade. */
export function simTelemetryToSamples(
  telemetry: readonly SixDofTelemetryPoint[],
): TrajectorySample[] {
  const out: TrajectorySample[] = new Array(telemetry.length);
  for (let i = 0; i < telemetry.length; i++) {
    const p = telemetry[i];
    out[i] = { timeS: p.time, altitudeM: p.altitude, velocityMs: p.speed };
  }
  return out;
}

/**
 * Build the two re-gridded overlay series and their derived deltas.
 *
 * Both series go through the same pipeline: `resample` at OVERLAY_DT_S
 * (Q4), velocity preservation on the same grid when the source carries it,
 * then the Q4 downsample cap. `alignSimToFlight` anchors apogees; the
 * recorded plot time is `sample.timeS + timeOffsetS`.
 *
 * Throws when either source is empty or when re-gridding invalidates
 * finite numerics — the chart must never paper over a broken ingestion.
 */
export function buildOverlaySeries(
  sim: readonly TrajectorySample[],
  recorded: readonly TrajectorySample[],
): OverlayModel {
  if (sim.length === 0) {
    throw new Error('buildOverlaySeries: modeled telemetry is empty — cannot overlay');
  }
  if (recorded.length === 0) {
    throw new Error('buildOverlaySeries: recorded flight log is empty — cannot overlay');
  }

  const modeledRaw = regridAndCap(sim);
  const recordedRaw = regridAndCap(recorded);

  const align = alignSimToFlight(modeledRaw, recordedRaw);

  const modeledSeries: OverlaySeries = {
    points: modeledRaw,
    timeOffsetApply: 0,
    rawStartS: modeledRaw[0].timeS,
    rawEndS: modeledRaw[modeledRaw.length - 1].timeS,
    label: 'modeled',
  };
  const recordedSeries: OverlaySeries = {
    points: recordedRaw,
    timeOffsetApply: align.timeOffsetS,
    rawStartS: recordedRaw[0].timeS,
    rawEndS: recordedRaw[recordedRaw.length - 1].timeS,
    label: 'recorded',
  };

  return {
    dtS: OVERLAY_DT_S,
    modeled: modeledSeries,
    recorded: recordedSeries,
    timeOffsetS: align.timeOffsetS,
    apogeeDeltaM: align.apogeeDeltaM,
    burnoutVelDeltaMs: align.burnoutVelDeltaMs,
    state: classifyApogee(modeledSeries, recordedSeries),
  };
}

/** Re-grid onto the Q4 dt grid (altitude via `resample`, velocity via the
 *  same grid), apply the downsample cap, and fail closed on non-finite
 *  numerics. */
function regridAndCap(series: readonly TrajectorySample[]): TrajectorySample[] {
  const sorted = [...series].sort((a, b) => a.timeS - b.timeS);
  const grid = resample(sorted, OVERLAY_DT_S);

  // Velocity is preserved only when EVERY sample carries it (the sim does;
  // a plain CSV flight log never does). Mixed sources degrade to
  // altitude-only rather than fabricating values.
  const carryVel = sorted.every((s) => s.velocityMs !== undefined);
  const out: TrajectorySample[] = new Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    out[i] = {
      timeS: grid[i].timeS,
      altitudeM: grid[i].altitudeM,
      velocityMs: carryVel ? interpolateVelocity(sorted, grid[i].timeS) : undefined,
    };
  }

  const capped = downsample(out, OVERLAY_MAX_POINTS);
  for (const s of capped) {
    if (!Number.isFinite(s.timeS) || !Number.isFinite(s.altitudeM)
        || (s.velocityMs !== undefined && !Number.isFinite(s.velocityMs))) {
      throw new Error(
        `buildOverlaySeries: re-gridded sample must be finite (got timeS=${s.timeS}, altitudeM=${s.altitudeM}, velocityMs=${s.velocityMs})`,
      );
    }
  }
  return capped;
}

/**
 * Cap a uniform sample count to `maxPoints` while preserving the first,
 * the last, and every local extremum of altitude — the features the overlay
 * exists to compare. Under the cap the series passes through unchanged (the
 * dt grid stays exact); decimation strides interior samples evenly.
 */
export function downsample(
  sorted: readonly TrajectorySample[],
  maxPoints: number,
): TrajectorySample[] {
  if (maxPoints < 4) {
    throw new Error(`downsample: maxPoints must be at least 4 (got ${maxPoints})`);
  }
  if (sorted.length <= maxPoints) {
    return sorted.map((s) => ({ ...s }));
  }
  const keep = new Array<boolean>(sorted.length);
  keep[0] = true;
  keep[sorted.length - 1] = true;
  for (let i = 1; i < sorted.length - 1; i++) {
    const a = sorted[i - 1].altitudeM;
    const b = sorted[i].altitudeM;
    const c = sorted[i + 1].altitudeM;
    if ((a <= b && b >= c) || (a >= b && b <= c)) {
      keep[i] = true;
    }
  }
  const stride = Math.max(1, Math.floor(sorted.length / maxPoints));
  for (let i = stride; i < sorted.length - 1; i += stride) {
    keep[i] = true;
  }
  let out: TrajectorySample[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (keep[i]) out.push(sorted[i]);
  }
  // Extremum runs can still exceed the budget (e.g. a dense sawtooth). Ever
  // decimate (never drop) from monotone interiors until the cap holds —
  // endpoints are kept unconditionally, and extremum samples survive until
  // the very last resort (a maxed sawtooth sacrifices its least-prominent
  // extremum last).
  while (out.length > maxPoints) {
    let dropIdx = -1;
    for (let i = 1; i < out.length - 1; i++) {
      if (!isStrictExtremumOfTriple(out[i - 1], out[i], out[i + 1])) {
        dropIdx = i;
        break;
      }
    }
    if (dropIdx === -1) dropIdx = 1;
    out = out.slice(0, dropIdx).concat(out.slice(dropIdx + 1));
  }
  return out;
}

/** True when `b` is a strict local extremum of the altitude triple. */
function isStrictExtremumOfTriple(
  a: TrajectorySample,
  b: TrajectorySample,
  c: TrajectorySample,
): boolean {
  return (a.altitudeM < b.altitudeM && b.altitudeM > c.altitudeM)
    || (a.altitudeM > b.altitudeM && b.altitudeM < c.altitudeM);
}

/**
 * Convert a cursor x fraction in [0,1] into the nearest sample index of an
 * aligned series. The fraction maps across the ALIGNED time span — the
 * caller plots flight samples at `timeS + timeOffsetS`, so the fraction
 * space is the shared chart x axis. Out-of-range fractions clamp.
 */
export function cursorIndexFor(
  series: readonly TrajectorySample[],
  timeOffsetS: number,
  fraction: number,
): CursorIndex | null {
  if (series.length === 0) return null;
  const lower = series[0].timeS + timeOffsetS;
  const upper = series[series.length - 1].timeS + timeOffsetS;
  const target = lower + Math.min(1, Math.max(0, fraction)) * (upper - lower);
  return nearestSample(series, timeOffsetS, target);
}

/** Nearest sample (by aligned time) to `targetS`; ties keep the earlier. */
function nearestSample(
  series: readonly TrajectorySample[],
  timeOffsetS: number,
  targetS: number,
): CursorIndex {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < series.length; i++) {
    const d = Math.abs(series[i].timeS + timeOffsetS - targetS);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  const s = series[best];
  return { index: best, timeS: s.timeS + timeOffsetS, altitudeM: s.altitudeM };
}

/**
 * Piecewise-linear interpolation of velocityMs at time `t`, with the same
 * endpoint-clamping semantics resample() uses for altitude. Caller
 * guarantees every sample carries velocityMs. */
function interpolateVelocity(sorted: readonly TrajectorySample[], t: number): number {
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (t <= first.timeS) return first.velocityMs ?? Number.NaN;
  if (t >= last.timeS) return last.velocityMs ?? Number.NaN;

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
  if (span <= 0) return a.velocityMs ?? Number.NaN;
  const f = (t - a.timeS) / span;
  const va = a.velocityMs ?? Number.NaN;
  const vb = b.velocityMs ?? Number.NaN;
  return va + f * (vb - va);
}