import { describe, expect, it } from 'vitest';
import {
  OVERLAY_DT_S,
  OVERLAY_MAX_POINTS,
  buildOverlaySeries,
  cursorIndexFor,
  downsample,
  simTelemetryToSamples,
} from './overlay';
import type { TrajectorySample } from './altimetry';
import type { SixDofTelemetryPoint } from '../sim/sixDofSimulator';

/**
 * Symmetric boost+coast parabola: altitude peaks exactly at `apogeeTime`
 * with `peakAlt`, vertical velocity is linear `vmax -> -vmax` (maximum at
 * t = 0 = the burnout proxy), and every critical time sits on the dt grid
 * when dt = 0.1 is used.
 */
function parabola(vmax: number, apogeeTime: number, peakAlt: number, dt = 0.1): TrajectorySample[] {
  const T = apogeeTime * 2;
  const out: TrajectorySample[] = [];
  for (let i = 0; i * dt <= T + 1e-9; i++) {
    const t = i * dt;
    const u = t / T;
    out.push({
      timeS: t,
      altitudeM: peakAlt * 4 * u * (1 - u),
      velocityMs: vmax * (1 - 2 * u),
    });
  }
  return out;
}

function stripVelocity(series: readonly TrajectorySample[]): TrajectorySample[] {
  return series.map(({ timeS, altitudeM }) => ({ timeS, altitudeM }));
}

function uniformGrid(series: readonly TrajectorySample[]): boolean {
  for (let i = 1; i < series.length; i++) {
    if (Math.abs(series[i].timeS - series[i - 1].timeS - OVERLAY_DT_S) > 1e-9) return false;
  }
  return true;
}

function maxAltitude(series: readonly TrajectorySample[]): number {
  return Math.max(...series.map((s) => s.altitudeM));
}

describe('simTelemetryToSamples', () => {
  it('maps only the presentation fields of each 6-DOF telemetry point', () => {
    const out = simTelemetryToSamples([
      {
        time: 1.25, altitude: 45.6, speed: 32.1,
        position: { x: 0, y: 0, z: 45.6 },
        velocity: { x: 0, y: 0, z: 32.1 },
        mach: 0.1, acceleration: 9.8,
        angularVelocity: { p: 0, q: 0, r: 0 },
        angleOfAttackDeg: 0, q: { w: 1, x: 0, y: 0, z: 0 },
        pitchDeg: 90, rollDeg: 0, yawDeg: 0,
        drag: 1, thrust: 5, mass: 1.5, dynamicPressure: 100,
      },
    ]);
    expect(out).toEqual([{ timeS: 1.25, altitudeM: 45.6, velocityMs: 32.1 }]);
  });

  it('preserves point count and passes empty telemetry through', () => {
    expect(simTelemetryToSamples([])).toEqual([]);
    const p = (time: number, altitude: number, speed: number): SixDofTelemetryPoint => ({
      time,
      altitude,
      speed,
      position: { x: 0, y: 0, z: altitude },
      velocity: { x: 0, y: 0, z: speed },
      mach: 0.1,
      acceleration: 9.8,
      angularVelocity: { p: 0, q: 0, r: 0 },
      angleOfAttackDeg: 0,
      q: { w: 1, x: 0, y: 0, z: 0 },
      pitchDeg: 90,
      rollDeg: 0,
      yawDeg: 0,
      drag: 1,
      thrust: 5,
      mass: 1.5,
      dynamicPressure: 100,
    });
    expect(simTelemetryToSamples([p(0, 0, 120), p(12.5, 400, 0), p(25, 0, -120)])).toEqual([
      { timeS: 0, altitudeM: 0, velocityMs: 120 },
      { timeS: 12.5, altitudeM: 400, velocityMs: 0 },
      { timeS: 25, altitudeM: 0, velocityMs: -120 },
    ]);
  });
});

describe('buildOverlaySeries', () => {
  it('re-grids both series to the Q4 dt = 0.1 grid and aligns apogees', () => {
    const sim = parabola(120, 12.5, 400, 0.05); // fine sim grid
    const flight = parabola(100, 10, 300); // plain 0.1 grid
    const m = buildOverlaySeries(sim, flight);

    expect(m.dtS).toBe(OVERLAY_DT_S);
    expect(uniformGrid(m.modeled.points)).toBe(true);
    expect(uniformGrid(m.recorded.points)).toBe(true);

    // Apogee anchor: sim peaks at 12.5 s, flight at 10 s.
    expect(Math.abs(m.timeOffsetS - 2.5)).toBeLessThanOrEqual(OVERLAY_DT_S + 1e-9);
    expect(m.recorded.timeOffsetApply).toBe(m.timeOffsetS);
    expect(m.modeled.timeOffsetApply).toBe(0);

    // Applying the offset brings the flight apogee onto the sim apogee time.
    const recAp = maxAltitude(m.recorded.points);
    const recApTime = m.recorded.points.find((s) => s.altitudeM === recAp)!.timeS;
    expect(Math.abs(recApTime + m.timeOffsetS - 12.5)).toBeLessThanOrEqual(OVERLAY_DT_S + 1e-9);
  });

  it('measures apogee and burnout-velocity deltas for a velocity-carrying log', () => {
    const m = buildOverlaySeries(parabola(120, 12.5, 400), parabola(100, 10, 300));
    expect(m.apogeeDeltaM).toBeCloseTo(100, 6);
    expect(m.burnoutVelDeltaMs).toBeCloseTo(20, 6);
  });

  it('reports a null burnout delta for a velocity-less CSV flight log', () => {
    const m = buildOverlaySeries(
      parabola(120, 12.5, 400),
      stripVelocity(parabola(100, 10, 300)),
    );
    expect(m.burnoutVelDeltaMs).toBeNull();
    // Time/altitude alignment still works without velocity data.
    expect(Math.abs(m.timeOffsetS - 2.5)).toBeLessThanOrEqual(OVERLAY_DT_S + 1e-9);
    expect(m.apogeeDeltaM).toBeCloseTo(100, 6);
  });

  it('preserves velocity on the modeled series during re-grid', () => {
    const m = buildOverlaySeries(parabola(120, 12.5, 400, 0.05), parabola(100, 10, 300));
    const first = m.modeled.points[0];
    const mid = m.modeled.points.find((s) => Math.abs(s.timeS - 6.2) < 1e-9);
    expect(first.velocityMs).toBeCloseTo(120, 4);
    // t = 6.2 s on the 0.1 grid: u = 6.2/25 = 0.248 => 120 * (1 - 0.496) = 60.48.
    expect(mid?.velocityMs).toBeCloseTo(60.48, 4);
  });

  it('classifies the overlay state from the apogee band', () => {
    const recalled = buildOverlaySeries(parabola(120, 12.5, 400), parabola(100, 10, 400));
    expect(recalled.state).toBe('nominal');

    const shortFlight = buildOverlaySeries(parabola(120, 12.5, 300), parabola(100, 10, 400));
    expect(shortFlight.state).toBe('short_apogee');

    const highFlight = buildOverlaySeries(parabola(120, 12.5, 500), parabola(100, 10, 400));
    expect(highFlight.state).toBe('high_apogee');
  });

  it('throws when either input series is empty', () => {
    const series = parabola(120, 12.5, 400);
    expect(() => buildOverlaySeries([], series)).toThrow(/modeled telemetry is empty/);
    expect(() => buildOverlaySeries(series, [])).toThrow(/recorded flight log is empty/);
  });

  it('exposes raw time spans for labeling', () => {
    const m = buildOverlaySeries(parabola(120, 12.5, 400), parabola(100, 10, 300));
    expect(m.modeled.rawStartS).toBe(0);
    expect(m.modeled.rawEndS).toBeCloseTo(25, 6);
    expect(m.modeled.label).toBe('modeled');
    expect(m.recorded.label).toBe('recorded');
  });
});

describe('downsample (Q4 cap)', () => {
  it('passes an under-cap series through unchanged, preserving the dt grid', () => {
    const series = parabola(120, 12.5, 400);
    expect(series.length).toBeLessThan(OVERLAY_MAX_POINTS);
    const out = downsample(series, OVERLAY_MAX_POINTS);
    expect(out).toHaveLength(series.length);
    expect(out.map((s) => s.timeS)).toEqual(series.map((s) => s.timeS));
  });

  it('caps a long series and keeps endpoints plus the apogee', () => {
    // 20001 points: 200 s at 0.01 s — far beyond the 1200-point cap.
    const series = parabola(300, 100, 2000, 0.01);
    expect(series.length).toBe(20001);
    const out = downsample(series, OVERLAY_MAX_POINTS);
    expect(out.length).toBeLessThanOrEqual(OVERLAY_MAX_POINTS);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].timeS).toBe(series[0].timeS);
    expect(out[out.length - 1].timeS).toBe(series[series.length - 1].timeS);
    // The exact apogee sample is a local maximum and therefore survives.
    expect(maxAltitude(out)).toBe(maxAltitude(series));
  });

  it('rejects a sub-minimum point budget', () => {
    expect(() => downsample(parabola(120, 12.5, 400), 3)).toThrow(/at least 4/);
  });
});

describe('cursorIndexFor', () => {
  const series = parabola(120, 12.5, 400); // raw times 0..25 at 0.1 => 251 pts
  const OFFSET = 2.5;

  it('maps fractions 0 and 1 to the first and last samples of the aligned span', () => {
    const lo = cursorIndexFor(series, OFFSET, 0);
    const hi = cursorIndexFor(series, OFFSET, 1);
    expect(lo).toEqual({ index: 0, timeS: 0 + OFFSET, altitudeM: series[0].altitudeM });
    expect(hi).toEqual({
      index: series.length - 1,
      timeS: 25 + OFFSET,
      altitudeM: series[series.length - 1].altitudeM,
    });
  });

  it('lands the midpoint cursor on the sample nearest the aligned center', () => {
    const mid = cursorIndexFor(series, OFFSET, 0.5);
    // Aligned center 0.5 * (0+2.5 .. 25+2.5) = 15; nearest raw time 12.5 + 2.5.
    expect(mid!.timeS).toBeCloseTo(15, 9);
    expect(series[mid!.index].timeS + OFFSET).toBeCloseTo(15, 9);
  });

  it('clamps out-of-range fractions', () => {
    expect(cursorIndexFor(series, OFFSET, -0.5)!.timeS).toBeCloseTo(OFFSET, 9);
    expect(cursorIndexFor(series, OFFSET, 1.5)!.timeS).toBeCloseTo(25 + OFFSET, 9);
  });

  it('returns null for an empty series', () => {
    expect(cursorIndexFor([], 0, 0.5)).toBeNull();
  });

  it('resolves against the aligned (offset-applied) time span', () => {
    // A fraction measured on the aligned span 2.5..27.5: 0.25 -> target 8.75.
    const c = cursorIndexFor(series, OFFSET, 0.25);
    // The 0.1-grid series only samples every 0.1 s: 8.7/8.8 are both 0.05
    // away; the tie keeps the earlier, so raw 6.2 s (index 62) resolves.
    expect(c!.index).toBe(62);
    expect(c!.timeS).toBeCloseTo(8.7, 9);
    // Float edge: 6.3 + 2.5 and 8.75 land within 0.05 of each other.
    expect(Math.abs(c!.timeS - 8.75)).toBeLessThanOrEqual(0.051);
  });
});