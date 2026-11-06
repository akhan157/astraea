/**
 * Candidate vertical-coast points between observed-feature proxies, with the
 * drag deceleration, air density, mass and reference area `calibrateCd` needs.
 *
 * Method (stated in the UI, keep both in step):
 *  1. The first maximum-altitude sample is an apogee proxy; it may be a truncated endpoint.
 *  2. Velocity and its derivative come from a local least-squares polynomial
 *     over a centred window of +-W seconds (Savitzky-Golay style smoothing):
 *       - log has a vertical-velocity column: a straight line through v(t), so
 *         v is the fitted value and dv/dt the slope (`velocity-column`);
 *       - altitude only: a parabola through h(t), so v is the slope and dv/dt
 *         is twice the quadratic coefficient (`altitude-derivative`).
 *     W is 0.10 s with a velocity column and 0.25 s from altitude alone, and is
 *     widened so every window holds at least five samples.
 *  3. The smoothed velocity peak before that altitude is a burnout proxy. The
 *     window opens one smoothing half-width later; this does not guarantee
 *     zero thrust or exclude motor tail-off or recovery from filter support.
 *  4. Drag deceleration = -dv/dt - g (vertical coast); air density is ISA at
 *     launch-site elevation + AGL altitude; mass and reference area come from
 *     the caller. Accelerometer columns are not used: their axis, sign and unit
 *     differ between devices.
 *  5. Points under `MIN_VELOCITY_MS` are excluded and counted. Points whose
 *     noisy drag deceleration comes out zero or negative are KEPT with their
 *     signed value (and counted): dropping them and keeping the positive ones
 *     biases the fitted Cd upward. The fit must use `allowNegativeAccel`.
 */
import type { TrajectorySample } from './altimetry';
import { MIN_VELOCITY_MS, type CoastPoint } from './calibration';
import { getAtmosphereAt } from '../sim/flightSimulator';

export const STANDARD_GRAVITY_MS2 = 9.80665;
/** Smoothing half-width when the log carries a velocity column, s. */
export const WINDOW_HALF_WIDTH_VELOCITY_S = 0.1;
/** Smoothing half-width when only altitude is available, s. */
export const WINDOW_HALF_WIDTH_ALTITUDE_S = 0.25;
/** Fewest usable points a fit may rest on. */
export const MIN_COAST_POINTS = 10;

export type CoastMethod = 'velocity-column' | 'altitude-derivative';

/** Transient audit metadata; the point's local fit is never recomputed by event selection. */
export interface CoastPointSupport {
  timeS: number;
  supportStartS: number;
  supportEndS: number;
}

export interface CoastOptions {
  /** Mass after burnout, kg. */
  massKg: number;
  /** Reference area, m^2. */
  refAreaM2: number;
  /** Launch-site elevation above sea level, m (log altitude is AGL). */
  launchElevationM: number;
}

export interface CoastDerivation {
  method: CoastMethod;
  /** Smoothing half-width actually used, s. */
  halfWidthS: number;
  /** Earliest/latest raw samples consumed by the selected points' local fits. */
  supportStartS: number;
  supportEndS: number;
  /** Entire imported trajectory span, before the ascent-only filter truncation. */
  sampleStartS: number;
  sampleEndS: number;
  /** Whether the observed-feature proxy occurs at an imported boundary. */
  velocityPeakAtBoundary: boolean;
  altitudePeakAtBoundary: boolean;
  /** Time of the smoothed velocity peak, s; legacy name, not verified burnout. */
  burnoutS: number;
  /** Highest recorded altitude time, s; not necessarily an observed apex. */
  apogeeS: number;
  /** First and last time of the points that were used, s. */
  windowStartS: number;
  windowEndS: number;
  /** Fastest and slowest used speed, m/s. */
  maxSpeedMs: number;
  minSpeedMs: number;
  points: CoastPoint[];
  pointSupport: CoastPointSupport[];
  /** Samples from the window opening up to the highest recorded altitude. */
  candidates: number;
  used: number;
  excluded: { lowSpeed: number; event?: number };
  /** Used points whose inferred drag deceleration was not positive; fitted as signed values. */
  nonPositiveKept: number;
}

export type CoastWindowSummary = Omit<CoastDerivation, 'points' | 'pointSupport'>;

export function coastWindowSummary({ points: _points, pointSupport: _support, ...window }: CoastDerivation): CoastWindowSummary {
  return window;
}

interface LocalFit {
  /** Fitted value at the window centre. */
  value: number;
  /** Fitted first derivative at the window centre. */
  slope: number;
  /** Fitted second derivative at the window centre (order 2 only). */
  curvature: number;
}

/** Least-squares polynomial of `order` (1 or 2) over samples[lo..hi], centred on `centerS`. */
function localFit(
  times: readonly number[],
  values: readonly number[],
  lo: number,
  hi: number,
  centerS: number,
  scaleS: number,
  order: 1 | 2,
): LocalFit | null {
  const s = [0, 0, 0, 0, 0];
  const t = [0, 0, 0];
  for (let i = lo; i <= hi; i++) {
    const x = (times[i] - centerS) / scaleS;
    const y = values[i];
    let xp = 1;
    for (let k = 0; k <= 4; k++) {
      s[k] += xp;
      if (k <= 2) t[k] += xp * y;
      xp *= x;
    }
  }
  if (order === 1) {
    const det = s[0] * s[2] - s[1] * s[1];
    if (!(Math.abs(det) > 1e-12)) return null;
    const c0 = (t[0] * s[2] - t[1] * s[1]) / det;
    const c1 = (s[0] * t[1] - s[1] * t[0]) / det;
    return { value: c0, slope: c1 / scaleS, curvature: 0 };
  }
  // Normal equations for c0 + c1 x + c2 x^2 (Cramer's rule on the 3x3 Hankel system).
  const a = [
    [s[0], s[1], s[2]],
    [s[1], s[2], s[3]],
    [s[2], s[3], s[4]],
  ];
  const det3 = (m: number[][]): number =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const det = det3(a);
  if (!(Math.abs(det) > 1e-12)) return null;
  const col = (k: number): number[][] => a.map((row, r) => row.map((v, c) => (c === k ? t[r] : v)));
  const c0 = det3(col(0)) / det;
  const c1 = det3(col(1)) / det;
  const c2 = det3(col(2)) / det;
  return { value: c0, slope: c1 / scaleS, curvature: (2 * c2) / (scaleS * scaleS) };
}

function medianStep(times: readonly number[]): number {
  const steps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0) steps.push(d);
  }
  if (steps.length === 0) return 0;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

/**
 * Derive coast-phase fit points from a flight log or a model trajectory.
 * Throws a plain-language error when no coast phase can be identified or fewer
 * than `MIN_COAST_POINTS` points survive.
 */
export function deriveCoastPoints(
  samples: readonly TrajectorySample[],
  options: CoastOptions,
): CoastDerivation {
  if (!(options.massKg > 0) || !Number.isFinite(options.massKg)) {
    throw new Error('coast window: the coast mass must be a positive number');
  }
  if (!(options.refAreaM2 > 0) || !Number.isFinite(options.refAreaM2)) {
    throw new Error('coast window: reference area must be a positive number');
  }
  if (!Number.isFinite(options.launchElevationM)) {
    throw new Error('coast window: launch-site elevation must be a finite number');
  }
  const sorted = [...samples].sort((a, b) => a.timeS - b.timeS);
  if (sorted.length < 20) {
    throw new Error(`coast window: the log has only ${sorted.length} samples; at least 20 are needed to find a coast phase`);
  }
  let apogeeIdx = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].altitudeM > sorted[apogeeIdx].altitudeM) apogeeIdx = i;
  }
  const apogeeS = sorted[apogeeIdx].timeS;
  const ascent = sorted.slice(0, apogeeIdx + 1);
  if (ascent.length < 20) {
    throw new Error('coast window: too few samples before apogee to find a coast phase');
  }

  const withVelocity = ascent.filter((s) => s.velocityMs !== undefined).length >= 0.8 * ascent.length;
  const method: CoastMethod = withVelocity ? 'velocity-column' : 'altitude-derivative';
  const times = ascent.map((s) => s.timeS);
  const signal = ascent.map((s) => (withVelocity ? (s.velocityMs as number) : s.altitudeM));
  if (!signal.every(Number.isFinite)) {
    throw new Error('coast window: the log has non-finite values before apogee');
  }

  const baseHalfWidth = withVelocity ? WINDOW_HALF_WIDTH_VELOCITY_S : WINDOW_HALF_WIDTH_ALTITUDE_S;
  const halfWidthS = Math.max(baseHalfWidth, 2.5 * medianStep(times));
  const order: 1 | 2 = withVelocity ? 1 : 2;

  // Smooth velocity and acceleration at every ascent sample.
  const v = new Array<number>(ascent.length);
  const dvdt = new Array<number>(ascent.length);
  const supportLo = new Array<number>(ascent.length);
  const supportHi = new Array<number>(ascent.length);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < ascent.length; i++) {
    while (times[lo] < times[i] - halfWidthS) lo++;
    while (hi + 1 < ascent.length && times[hi + 1] <= times[i] + halfWidthS) hi++;
    const fit = hi - lo + 1 >= 3 ? localFit(times, signal, lo, hi, times[i], halfWidthS, order) : null;
    supportLo[i] = times[lo];
    supportHi[i] = times[hi];
    if (fit === null) {
      v[i] = Number.NaN;
      dvdt[i] = Number.NaN;
    } else if (withVelocity) {
      v[i] = fit.value;
      dvdt[i] = fit.slope;
    } else {
      v[i] = fit.slope;
      dvdt[i] = fit.curvature;
    }
  }

  let burnoutIdx = -1;
  for (let i = 0; i < ascent.length; i++) {
    if (!Number.isFinite(v[i])) continue;
    if (burnoutIdx === -1 || v[i] > v[burnoutIdx]) burnoutIdx = i;
  }
  if (burnoutIdx === -1 || !(v[burnoutIdx] > MIN_VELOCITY_MS)) {
    throw new Error('coast window: no burnout found - the log never exceeds the minimum coast speed before apogee');
  }
  const burnoutS = times[burnoutIdx];
  const windowOpenS = burnoutS + halfWidthS;

  const points: CoastPoint[] = [];
  const pointTimes: number[] = [];
  const pointSupport: CoastPointSupport[] = [];
  let candidates = 0;
  let lowSpeed = 0;
  let nonPositiveKept = 0;
  let supportStartS = Infinity;
  let supportEndS = -Infinity;
  for (let i = burnoutIdx; i < ascent.length; i++) {
    if (times[i] < windowOpenS || !Number.isFinite(v[i]) || !Number.isFinite(dvdt[i])) continue;
    candidates++;
    const speed = Math.abs(v[i]);
    if (speed < MIN_VELOCITY_MS) {
      lowSpeed++;
      continue;
    }
    const dragDecel = -dvdt[i] - STANDARD_GRAVITY_MS2;
    if (!(dragDecel > 0)) nonPositiveKept++;
    points.push({
      velocityMs: speed,
      density: getAtmosphereAt(options.launchElevationM + ascent[i].altitudeM).density,
      massKg: options.massKg,
      refAreaM2: options.refAreaM2,
      accelMs2: dragDecel,
    });
    pointTimes.push(times[i]);
    pointSupport.push({ timeS: times[i], supportStartS: supportLo[i], supportEndS: supportHi[i] });
    supportStartS = Math.min(supportStartS, supportLo[i]);
    supportEndS = Math.max(supportEndS, supportHi[i]);
  }
  if (points.length < MIN_COAST_POINTS) {
    throw new Error(
      `coast window: only ${points.length} usable coast points between burnout (${burnoutS.toFixed(2)} s) and apogee ` +
        `(${apogeeS.toFixed(2)} s); at least ${MIN_COAST_POINTS} are needed. The log may be too sparse or the coast too short.`,
    );
  }
  return {
    method,
    halfWidthS,
    supportStartS,
    supportEndS,
    sampleStartS: sorted[0].timeS,
    sampleEndS: sorted[sorted.length - 1].timeS,
    velocityPeakAtBoundary: burnoutIdx === 0 || burnoutIdx === sorted.length - 1,
    altitudePeakAtBoundary: apogeeIdx === 0 || apogeeIdx === sorted.length - 1,
    burnoutS,
    apogeeS,
    windowStartS: pointTimes[0],
    windowEndS: pointTimes[pointTimes.length - 1],
    maxSpeedMs: Math.max(...points.map((p) => p.velocityMs)),
    minSpeedMs: Math.min(...points.map((p) => p.velocityMs)),
    points,
    pointSupport,
    candidates,
    used: points.length,
    excluded: { lowSpeed },
    nonPositiveKept,
  };
}
