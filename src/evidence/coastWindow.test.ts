/**
 * Coast-window derivation against the real Cosmic Cargo flight (Altimeter Cloud
 * #2986) and against synthetic flights with a known drag coefficient.
 *
 * The real-log band is derived, not fitted to a target. The log and mass are the
 * ones `flightValidation.test.ts` uses (47 g, O 25.4 mm, 10 m pad). That test
 * documents Cd = 0.6118 for this flight, from a 3-point central difference that
 * then DROPS every non-positive deceleration. On this log 135 of 393 raw
 * differences are non-positive (the logged velocity is a filtered estimate with
 * noise comparable to the drag signal below ~40 m/s), so that estimator keeps
 * only the noise that happens to be positive and reads high. Fitting the signed
 * values instead gives 0.453-0.456 for every differencing width from 3 to 31
 * samples (`signedCentralDifferenceCd` below), and the window derivation lands
 * within 2-3 % of that. The expected band is therefore centred on that
 * independent estimate, not on 0.6118.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import coastCsv from '../../docs/flight-validation/cosmic-cargo-2986-coast.csv?raw';
import { parseAltimeterCsv, parseTrajectoryCsv } from './altimetry';
import { calibrateCd, MIN_VELOCITY_MS, type CoastPoint } from './calibration';
import { deriveCoastPoints, MIN_COAST_POINTS, STANDARD_GRAVITY_MS2 } from './coastWindow';
import { getAtmosphereAt } from '../sim/flightSimulator';

const REF_AREA_M2 = Math.PI * 0.0254 * 0.0254 * 0.25;
const COAST_MASS_KG = 0.047;
const PAD_ELEVATION_M = 10;

/** Independent estimator: signed OLS on central differences of the logged velocity, no smoothing choices. */
function signedCentralDifferenceCd(
  samples: ReadonlyArray<{ timeS: number; altitudeM: number; velocityMs?: number }>,
  halfSpan: number,
): { cd: number; nonPositive: number; used: number } {
  let xx = 0;
  let xy = 0;
  let nonPositive = 0;
  let used = 0;
  for (let i = halfSpan; i < samples.length - halfSpan; i++) {
    const dt = samples[i + halfSpan].timeS - samples[i - halfSpan].timeS;
    const decel = -((samples[i + halfSpan].velocityMs as number) - (samples[i - halfSpan].velocityMs as number)) / dt - STANDARD_GRAVITY_MS2;
    const v = samples[i].velocityMs as number;
    if (v < MIN_VELOCITY_MS) continue;
    const x = 0.5 * getAtmosphereAt(PAD_ELEVATION_M + samples[i].altitudeM).density * v * v * REF_AREA_M2;
    xx += x * x;
    xy += x * COAST_MASS_KG * decel;
    if (decel <= 0) nonPositive++;
    used++;
  }
  return { cd: xy / xx, nonPositive, used };
}

describe('parseTrajectoryCsv', () => {
  it('reads the velocity column of the real log without changing the altitude parse', () => {
    const withVelocity = parseTrajectoryCsv(coastCsv);
    expect(withVelocity.hasVelocity).toBe(true);
    expect(withVelocity.samples.length).toBe(406);
    const altitudeOnly = parseAltimeterCsv(coastCsv);
    expect(altitudeOnly.map((s) => [s.timeS, s.altitudeM])).toEqual(withVelocity.samples.map((s) => [s.timeS, s.altitudeM]));
    // parseAltimeterCsv output keeps its two-field shape.
    expect(Object.keys(altitudeOnly[0]).sort()).toEqual(['altitudeM', 'timeS']);
    expect(withVelocity.samples[0].velocityMs).toBeCloseTo(75.38, 2);
  });

  it('converts feet per second and leaves logs without a velocity column alone', () => {
    const fps = parseTrajectoryCsv('time_s,altitude_m,velocity_ft_s\n0,0,100\n1,50,50\n');
    expect(fps.samples[0].velocityMs).toBeCloseTo(30.48, 6);
    const none = parseTrajectoryCsv('time_s,altitude_m\n0,0\n1,50\n');
    expect(none.hasVelocity).toBe(false);
    expect(none.samples[0].velocityMs).toBeUndefined();
  });
});

describe('deriveCoastPoints on the real Cosmic Cargo log', () => {
  const log = parseTrajectoryCsv(coastCsv).samples;
  const options = { massKg: COAST_MASS_KG, refAreaM2: REF_AREA_M2, launchElevationM: PAD_ELEVATION_M };

  it('finds the burnout-to-apogee window from the logged velocity', () => {
    const d = deriveCoastPoints(log, options);
    expect(d.method).toBe('velocity-column');
    // The fixture opens at 2.2 s, after the 1.85-1.89 s burn: velocity is already falling, so burnout is its first sample.
    expect(d.burnoutS).toBeCloseTo(2.2, 1);
    // Logged apogee 291.74 m at 7.454 s (nearest sample 7.442 s).
    expect(d.apogeeS).toBeCloseTo(7.442, 2);
    // The window opens one smoothing half-width after burnout and runs to the last point above 5 m/s.
    expect(d.windowStartS).toBeGreaterThan(d.burnoutS);
    expect(d.windowStartS).toBeLessThan(d.burnoutS + 0.2);
    expect(d.windowEndS).toBeGreaterThan(7.0);
    expect(d.windowEndS).toBeLessThanOrEqual(d.apogeeS);
  });

  it('counts every candidate as used or excluded, never dropped silently', () => {
    const d = deriveCoastPoints(log, options);
    expect(d.used + d.excluded.lowSpeed).toBe(d.candidates);
    expect(d.points.length).toBe(d.used);
    expect(d.excluded.lowSpeed).toBeGreaterThan(0); // the last ~0.5 s before apogee is below 5 m/s
    expect(d.points.every((p) => p.velocityMs >= MIN_VELOCITY_MS)).toBe(true);
    expect(d.nonPositiveKept).toBeGreaterThan(0);
    expect(d.nonPositiveKept).toBeLessThan(d.used);
  });

  it('recovers an effective Cd within 3 % of the independent signed central-difference estimate', () => {
    const d = deriveCoastPoints(log, options);
    const fit = calibrateCd(d.points, { allowNegativeAccel: true });
    // Independent of the window logic: whole log, raw central differences, signed.
    const references = [3, 8, 15].map((k) => signedCentralDifferenceCd(log, k).cd);
    for (const reference of references) {
      expect(reference).toBeGreaterThan(0.44);
      expect(reference).toBeLessThan(0.47);
      expect(Math.abs(fit.cdCalibrated / reference - 1)).toBeLessThan(0.03);
    }
    // Absolute band: the independent estimates span 0.453-0.456 -> +-4 % around 0.46.
    expect(fit.cdCalibrated).toBeGreaterThan(0.44);
    expect(fit.cdCalibrated).toBeLessThan(0.48);
    expect(fit.rmse).toBeGreaterThan(0);
    expect(fit.rmse).toBeLessThan(0.25);
  });

  it('gives the same answer from altitude alone (smoothed differentiation) within 3 %', () => {
    const altitudeOnly = log.map((s) => ({ timeS: s.timeS, altitudeM: s.altitudeM }));
    const fromAltitude = deriveCoastPoints(altitudeOnly, options);
    expect(fromAltitude.method).toBe('altitude-derivative');
    const fromVelocity = deriveCoastPoints(log, options);
    const a = calibrateCd(fromAltitude.points, { allowNegativeAccel: true }).cdCalibrated;
    const b = calibrateCd(fromVelocity.points, { allowNegativeAccel: true }).cdCalibrated;
    expect(Math.abs(a / b - 1)).toBeLessThan(0.03);
  });

  it('shows the documented 0.6118 comes from dropping non-positive differences, not from the drag', () => {
    // The estimator behind 0.6118: raw 3-point central difference, keep only positive decelerations.
    const kept: CoastPoint[] = [];
    let dropped = 0;
    for (let i = 1; i < log.length - 1; i++) {
      const dt = log[i + 1].timeS - log[i - 1].timeS;
      const decel = -((log[i + 1].velocityMs as number) - (log[i - 1].velocityMs as number)) / dt - STANDARD_GRAVITY_MS2;
      if (!(decel > 0)) {
        dropped++;
        continue;
      }
      kept.push({
        velocityMs: Math.abs(log[i].velocityMs as number),
        density: getAtmosphereAt(log[i].altitudeM).density,
        massKg: COAST_MASS_KG,
        refAreaM2: REF_AREA_M2,
        accelMs2: decel,
      });
    }
    const truncated = calibrateCd(kept).cdCalibrated;
    const signed = signedCentralDifferenceCd(log, 1);
    expect(truncated).toBeCloseTo(0.6118, 3);
    expect(dropped).toBeGreaterThan(100);
    // The same raw differences, with the noise left in, give a much lower Cd.
    expect(truncated / signed.cd).toBeGreaterThan(1.3);
  });

  it('uses ISA density at launch elevation plus AGL altitude', () => {
    const sea = deriveCoastPoints(log, { ...options, launchElevationM: 0 });
    const high = deriveCoastPoints(log, { ...options, launchElevationM: 2000 });
    const cdSea = calibrateCd(sea.points, { allowNegativeAccel: true }).cdCalibrated;
    const cdHigh = calibrateCd(high.points, { allowNegativeAccel: true }).cdCalibrated;
    // Same measured deceleration in thinner air means a larger Cd, in proportion to the density ratio.
    const densityRatio = getAtmosphereAt(100).density / getAtmosphereAt(2100).density;
    expect(cdHigh).toBeGreaterThan(cdSea);
    expect(Math.abs(cdHigh / cdSea / densityRatio - 1)).toBeLessThan(0.04);
  });
});

/** Seeded generator so the noise is the same on every run. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
function gaussian(next: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
}

/** Vertical coast from `v0` under gravity and drag with a known Cd, sampled at `rateHz` with measurement noise. */
function syntheticCoast(opts: { cd: number; v0: number; rateHz: number; velocityNoise: number; altitudeNoise: number; seed: number }) {
  const next = lcg(opts.seed);
  const dt = 1e-3;
  let t = 0;
  let h = 100;
  let v = opts.v0;
  const out: Array<{ timeS: number; altitudeM: number; velocityMs: number }> = [];
  // A short powered ramp first so the velocity has a peak to find.
  for (let i = 0; i < 20; i++) out.push({ timeS: -2 + i * 0.1, altitudeM: 100 - (20 - i) * 6, velocityMs: opts.v0 * (i / 20) });
  const every = Math.round(1 / (opts.rateHz * dt));
  for (let step = 0; v > -1; step++) {
    if (step % every === 0) {
      out.push({
        timeS: t,
        altitudeM: h + opts.altitudeNoise * gaussian(next),
        velocityMs: v + opts.velocityNoise * gaussian(next),
      });
    }
    const rho = getAtmosphereAt(PAD_ELEVATION_M + h).density;
    const decel = STANDARD_GRAVITY_MS2 + (0.5 * rho * opts.cd * REF_AREA_M2 * v * v) / COAST_MASS_KG;
    v -= decel * dt;
    h += v * dt;
    t += dt;
  }
  return out;
}

describe('deriveCoastPoints on synthetic flights with a known Cd', () => {
  const options = { massKg: COAST_MASS_KG, refAreaM2: REF_AREA_M2, launchElevationM: PAD_ELEVATION_M };

  it('recovers the true Cd from a noisy velocity column without upward bias', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const log = syntheticCoast({ cd: 0.5, v0: 80, rateHz: 80, velocityNoise: 0.35, altitudeNoise: 0.05, seed });
      const d = deriveCoastPoints(log, options);
      const cd = calibrateCd(d.points, { allowNegativeAccel: true }).cdCalibrated;
      expect(Math.abs(cd / 0.5 - 1)).toBeLessThan(0.05);
    }
  });

  it('recovers the true Cd from altitude alone', () => {
    for (const seed of [1, 2, 3]) {
      const log = syntheticCoast({ cd: 0.5, v0: 80, rateHz: 80, velocityNoise: 0, altitudeNoise: 0.03, seed }).map((s) => ({
        timeS: s.timeS,
        altitudeM: s.altitudeM,
      }));
      const d = deriveCoastPoints(log, options);
      expect(d.method).toBe('altitude-derivative');
      const cd = calibrateCd(d.points, { allowNegativeAccel: true }).cdCalibrated;
      expect(Math.abs(cd / 0.5 - 1)).toBeLessThan(0.06);
    }
  });

  it('rejects a log that never coasts and a log too short to fit', () => {
    const climbing = Array.from({ length: 60 }, (_, i) => ({ timeS: i * 0.1, altitudeM: i * 2, velocityMs: 20 }));
    expect(() => deriveCoastPoints(climbing, options)).toThrow(/coast points|burnout/);
    expect(() => deriveCoastPoints(climbing.slice(0, 10), options)).toThrow(/at least 20/);
    const coast = syntheticCoast({ cd: 0.5, v0: 80, rateHz: 80, velocityNoise: 0.3, altitudeNoise: 0.05, seed: 1 });
    expect(() => deriveCoastPoints(coast, { ...options, massKg: 0 })).toThrow(/mass/);
    expect(() => deriveCoastPoints(coast, { ...options, refAreaM2: -1 })).toThrow(/area/);
    expect(MIN_COAST_POINTS).toBeGreaterThanOrEqual(10);
  });
});
