/**
 * Sim-vs-flight overlay compare engine (audit F4; synthesis patterns 6/7/10).
 *
 * Pure, deterministic pipeline implementing the SDI four-stage compare
 * contract (simulation-study.md §6, SIM-EVID-004b/005/007):
 *
 *   1. align — apogee-match via `alignSimToFlight`; the offset is data, not
 *      state: `shiftSeries` applies it and subtracting it restores the raw
 *      log, so alignment stays reversible. With alignment off the result is
 *      flagged unaligned and delta chips are withheld — an unaligned pair
 *      says so instead of rendering a wrong number (pattern 7).
 *   2. sync — `union` (default, recommended: every sample of either series
 *      is represented) vs `intersection` (overlap only; faster, discards).
 *   3. interpolate — per-series value at each grid time, `linear` (default)
 *      or `zoh` (previous-sample hold). Points outside a series' span are
 *      `compared: false` ("Not compared", the SDI third state) — the grid
 *      never extrapolates.
 *   4. tolerance — most-lenient composite band, the documented SDI math: the
 *      time tolerance is evaluated first (baseline min/max over
 *      [t−tol, t+tol]), then abs/rel applied to those extremes:
 *      upper = max + max(absTol, relTol·|max|),
 *      lower = min − max(absTol, relTol·|min|).
 *
 * Display re-grid is the Q4 contract: both series are resampled to
 * DISPLAY_DT_S (0.1 s) before compare, so chart density never implies
 * precision the telemetry does not carry. Sim telemetry is
 * presentation-grade display data; the compare is analysis-only — it never
 * mutates the vehicle, motor, or last sim run, and calibration candidates
 * stay in the Calibration card until consumed (frontend-plan §7).
 */

import { alignSimToFlight, resample, type AltitudeSample, type TrajectorySample } from './altimetry';

/** Q4 display re-grid step: compare and charting always run on 0.1 s. */
export const DISPLAY_DT_S = 0.1;

/** Sync grid construction (stage 2). */
export type SyncMode = 'union' | 'intersection';

/** Sample interpolation (stage 3). */
export type InterpMode = 'linear' | 'zoh';

/** Composite tolerance band spec (stage 4). All non-negative, meters/—. */
export interface OverlayTolerance {
  absTolM: number;
  relTol: number;
  timeTolS: number;
}

export interface CompareOptions {
  /** Default 'union'. */
  sync: SyncMode;
  /** Default 'linear'. */
  interp: InterpMode;
  tolerance: OverlayTolerance;
  /** Default true (apogee-match). False = raw times, flagged unaligned. */
  align: boolean;
}

/** One compared grid point. */
export interface ComparePoint {
  t: number;
  baseline: number;
  compare: number;
  upper: number;
  lower: number;
  /** Signed difference: compare − baseline. */
  diff: number;
  pass: boolean;
  /** False outside either series' span: "Not compared", never extrapolated. */
  compared: boolean;
}

/** Maximal run of failing compared points, for OOT region navigation. */
export interface OutOfToleranceRegion {
  startT: number;
  endT: number;
  startIndex: number;
  endIndex: number;
  length: number;
}

export interface CompareResult {
  points: ComparePoint[];
  nMatch: number;
  nMismatch: number;
  nNotCompared: number;
  regions: OutOfToleranceRegion[];
  /** False when alignment was switched off: deltas withheld. */
  aligned: boolean;
  /** Flight→sim shift applied (0 when unaligned). Reversible. */
  timeOffsetS: number;
  /** Null when unaligned. */
  apogeeDeltaM: number | null;
  /** Null when unaligned or either series lacks velocity. */
  burnoutVelDeltaMs: number | null;
}

/**
 * Sim telemetry → altitude series. Vertical velocity comes from the
 * ground-frame Up component (presentation-grade, same contract as the
 * telemetry itself); it feeds the burnout-velocity proxy only.
 */
export function simTelemetryToAltitude(
  telemetry: ReadonlyArray<{ time: number; altitude: number; velocity: { z: number } }>
): TrajectorySample[] {
  return telemetry.map((p) => ({ timeS: p.time, altitudeM: p.altitude, velocityMs: p.velocity.z }));
}

/** Display re-grid onto DISPLAY_DT_S (Q4): declared dt, never raw density. */
export function regridDisplay(series: readonly AltitudeSample[], dt: number = DISPLAY_DT_S): AltitudeSample[] {
  return resample(series, dt);
}

/**
 * Shift a series by dt seconds. Pure: returns a new array, input untouched.
 * Reversible: shiftSeries(shiftSeries(s, a), −a) restores s.
 */
export function shiftSeries<T extends AltitudeSample>(series: readonly T[], dt: number): T[] {
  return series.map((s) => ({ ...s, timeS: s.timeS + dt }));
}

function checkedSeries(name: string, series: readonly TrajectorySample[]): void {
  for (const s of series) {
    if (!Number.isFinite(s.timeS) || !Number.isFinite(s.altitudeM)) {
      throw new Error(`compareAltitudeSeries: ${name} samples must be finite (got t=${s.timeS}, alt=${s.altitudeM})`);
    }
  }
}

function checkedTolerance(tol: OverlayTolerance): void {
  for (const [key, value] of [['absTolM', tol.absTolM], ['relTol', tol.relTol], ['timeTolS', tol.timeTolS]] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`compareAltitudeSeries: ${key} must be a non-negative finite number (got ${value})`);
    }
  }
}

/** Ascending-time copy; resample/align/interp all assume sorted input. */
function sorted<T extends AltitudeSample>(series: readonly T[]): T[] {
  return [...series].sort((a, b) => a.timeS - b.timeS);
}

/** Interpolated altitude at t, or null outside the series span. */
function valueAt(series: readonly AltitudeSample[], t: number, interp: InterpMode): number | null {
  if (series.length === 0) return null;
  const first = series[0];
  const last = series[series.length - 1];
  if (t < first.timeS || t > last.timeS) return null;
  if (series.length === 1) return first.altitudeM;
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].timeS <= t) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  if (interp === 'zoh' || b.timeS === a.timeS) return a.altitudeM;
  const f = (t - a.timeS) / (b.timeS - a.timeS);
  return a.altitudeM + f * (b.altitudeM - a.altitudeM);
}

/**
 * Baseline min/max over [t−timeTol, t+timeTol], clamped to the span.
 * Null when the window misses the span entirely. 11 taps is exact for
 * piecewise-linear/zoh segments wider than tol/5 and a bounded,
 * documented approximation otherwise (display-grade, like the grid).
 */
function baselineWindow(
  series: readonly AltitudeSample[],
  t: number,
  timeTol: number,
  interp: InterpMode
): { min: number; max: number } | null {
  if (timeTol === 0) {
    const v = valueAt(series, t, interp);
    return v === null ? null : { min: v, max: v };
  }
  const lo = Math.max(t - timeTol, series[0].timeS);
  const hi = Math.min(t + timeTol, series[series.length - 1].timeS);
  if (lo > hi) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= 10; i++) {
    const v = valueAt(series, lo + ((hi - lo) * i) / 10, interp);
    if (v === null) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Number.POSITIVE_INFINITY ? null : { min, max };
}

function band(tol: OverlayTolerance, extreme: number, side: 1 | -1): number {
  return extreme + side * Math.max(tol.absTolM, tol.relTol * Math.abs(extreme));
}

/** Maximal runs of failing compared points (OOT navigation targets). */
export function findOutOfToleranceRegions(points: readonly ComparePoint[]): OutOfToleranceRegion[] {
  const regions: OutOfToleranceRegion[] = [];
  let start: number | null = null;
  for (let i = 0; i <= points.length; i++) {
    const failing = i < points.length && points[i].compared && !points[i].pass;
    if (failing && start === null) start = i;
    if (!failing && start !== null) {
      regions.push({
        startT: points[start].t,
        endT: points[i - 1].t,
        startIndex: start,
        endIndex: i - 1,
        length: i - start,
      });
      start = null;
    }
  }
  return regions;
}

/**
 * Four-stage sim-vs-flight altitude compare. Baseline is the reference the
 * band is drawn around (normally sim); compareTo is shifted by the apogee
 * offset when `align` is true. Throws fail-closed on empty/non-finite
 * input or a bad tolerance — the caller renders the error, never a number.
 */
export function compareAltitudeSeries(
  baseline: readonly TrajectorySample[],
  compareTo: readonly TrajectorySample[],
  options: Partial<CompareOptions> = {}
): CompareResult {
  const { sync = 'union', interp = 'linear', tolerance = { absTolM: 0, relTol: 0, timeTolS: 0 }, align = true } = options;
  if (baseline.length === 0 || compareTo.length === 0) {
    throw new Error('compareAltitudeSeries: baseline and compareTo must both be non-empty');
  }
  if (sync !== 'union' && sync !== 'intersection') {
    throw new Error(`compareAltitudeSeries: unknown sync mode '${sync}'`);
  }
  if (interp !== 'linear' && interp !== 'zoh') {
    throw new Error(`compareAltitudeSeries: unknown interpolation '${interp}'`);
  }
  checkedTolerance(tolerance);
  checkedSeries('baseline', baseline);
  checkedSeries('compareTo', compareTo);

  const baseGrid = sorted(regridDisplay(sorted(baseline), DISPLAY_DT_S));
  let cmpGrid = sorted(regridDisplay(sorted(compareTo), DISPLAY_DT_S));

  let timeOffsetS = 0;
  let apogeeDeltaM: number | null = null;
  let burnoutVelDeltaMs: number | null = null;
  if (align) {
    const alignment = alignSimToFlight(baseline, compareTo);
    timeOffsetS = alignment.timeOffsetS;
    apogeeDeltaM = alignment.apogeeDeltaM;
    burnoutVelDeltaMs = alignment.burnoutVelDeltaMs;
    cmpGrid = shiftSeries(cmpGrid, timeOffsetS);
  }

  const baseStart = baseGrid[0].timeS;
  const baseEnd = baseGrid[baseGrid.length - 1].timeS;
  const cmpStart = cmpGrid[0].timeS;
  const cmpEnd = cmpGrid[cmpGrid.length - 1].timeS;
  const start = sync === 'union' ? Math.min(baseStart, cmpStart) : Math.max(baseStart, cmpStart);
  const end = sync === 'union' ? Math.max(baseEnd, cmpEnd) : Math.min(baseEnd, cmpEnd);

  const points: ComparePoint[] = [];
  if (start <= end) {
    const n = Math.max(1, Math.round((end - start) / DISPLAY_DT_S) + 1);
    for (let i = 0; i < n; i++) {
      const t = i === n - 1 ? end : start + i * DISPLAY_DT_S;
      const center = valueAt(baseGrid, t, interp);
      const cmp = valueAt(cmpGrid, t, interp);
      const window = baselineWindow(baseGrid, t, tolerance.timeTolS, interp);
      if (center === null || cmp === null || window === null) {
        points.push({ t, baseline: center ?? Number.NaN, compare: cmp ?? Number.NaN, upper: Number.NaN, lower: Number.NaN, diff: Number.NaN, pass: false, compared: false });
        continue;
      }
      const upper = band(tolerance, window.max, 1);
      const lower = band(tolerance, window.min, -1);
      points.push({ t, baseline: center, compare: cmp, upper, lower, diff: cmp - center, pass: cmp >= lower && cmp <= upper, compared: true });
    }
  }

  let nMatch = 0;
  let nMismatch = 0;
  let nNotCompared = 0;
  for (const p of points) {
    if (!p.compared) nNotCompared++;
    else if (p.pass) nMatch++;
    else nMismatch++;
  }
  return {
    points,
    nMatch,
    nMismatch,
    nNotCompared,
    regions: findOutOfToleranceRegions(points),
    aligned: align,
    timeOffsetS,
    apogeeDeltaM,
    burnoutVelDeltaMs,
  };
}
