// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  DISPLAY_DT_S,
  compareAltitudeSeries,
  findOutOfToleranceRegions,
  regridDisplay,
  shiftSeries,
  simTelemetryToAltitude,
} from './overlay';
import type { TrajectorySample } from './altimetry';
/** Symmetric up/down flight: apogee 300 m at t=30 s, touchdown t=60 s. */

function buildFlight(apogeeM: number, apogeeT: number, endT: number, dt = DISPLAY_DT_S): TrajectorySample[] {
  const out: TrajectorySample[] = [];
  for (let t = 0; t <= endT + 1e-9; t += dt) {
    const alt = t <= apogeeT ? (apogeeM * t) / apogeeT : Math.max(0, apogeeM * (1 - (t - apogeeT) / (endT - apogeeT)));
    out.push({ timeS: t, altitudeM: alt, velocityMs: t <= apogeeT ? 20 : -10 });
  }
  return out;
}

const TOL0 = { absTolM: 0, relTol: 0, timeTolS: 0 };

describe('overlay compare pipeline', () => {
  it('matches an identical profile shifted in time after apogee alignment', () => {
    const sim = buildFlight(300, 30, 60);
    const flight = buildFlight(300, 30, 60).map((s) => ({ ...s, timeS: s.timeS - 4 }));
    // Zero-width band fails on float dust; a 1 mm band is the honest
    // "identical" gate (cf. SDI practitioner false-positive SIM-EVID-008).
    const r = compareAltitudeSeries(sim, flight, { tolerance: { absTolM: 1e-3, relTol: 0, timeTolS: 0 } });
    expect(r.aligned).toBe(true);
    expect(r.timeOffsetS).toBeCloseTo(4, 6);
    expect(r.apogeeDeltaM).toBeCloseTo(0, 6);
    expect(r.nMismatch).toBe(0);
    expect(r.nNotCompared).toBe(0);
    expect(r.nMatch).toBe(r.points.length);
    expect(r.regions).toEqual([]);
    for (const p of r.points) {
      if (p.compared) expect(Math.abs(p.diff)).toBeLessThan(1e-6);
    }
  });

  it('flags mismatch points and navigable regions for a lower flight', () => {
    const sim = buildFlight(300, 30, 60);
    const flight = buildFlight(240, 30, 60);
    const r = compareAltitudeSeries(sim, flight, { tolerance: TOL0 });
    expect(r.apogeeDeltaM).toBeCloseTo(60, 6);
    expect(r.nMismatch).toBeGreaterThan(0);
    // Symmetric ramps diverging from a shared pad: one OOT region each side.
    expect(r.regions.length).toBeGreaterThanOrEqual(1);
    for (const region of r.regions) {
      expect(region.endT).toBeGreaterThanOrEqual(region.startT);
      expect(region.length).toBe(region.endIndex - region.startIndex + 1);
      for (let i = region.startIndex; i <= region.endIndex; i++) {
        expect(r.points[i].compared).toBe(true);
        expect(r.points[i].pass).toBe(false);
      }
    }
  });
  it('applies the most-lenient composite band: abs, then rel, then time', () => {
    const sim = buildFlight(300, 30, 60);
    const flight = buildFlight(295, 30, 60);
    // Zero tolerance: 5 m low everywhere off-apogee mismatches.
    expect(compareAltitudeSeries(sim, flight, { tolerance: TOL0 }).nMismatch).toBeGreaterThan(0);
    // Absolute 10 m absorbs the 5 m deficit.
    const abs = compareAltitudeSeries(sim, flight, { tolerance: { absTolM: 10, relTol: 0, timeTolS: 0 } });
    expect(abs.nMismatch).toBe(0);
    // Relative 5% of ~295 m (~14.75 m) absorbs it without any absolute term.
    const rel = compareAltitudeSeries(sim, flight, { tolerance: { absTolM: 0, relTol: 0.05, timeTolS: 0 } });
    expect(rel.nMismatch).toBe(0);
    // Spot-check the band math at apogee (baseline 300 m): the abs run
    // widens by max(10, 0) = 10, the rel run by max(0, 5% of 300) = 15.
    const apexAbs = abs.points.reduce((a, b) => (b.baseline > a.baseline ? b : a));
    expect(apexAbs.upper).toBeCloseTo(310, 6);
    expect(apexAbs.lower).toBeCloseTo(290, 6);
    const apexRel = rel.points.reduce((a, b) => (b.baseline > a.baseline ? b : a));
    expect(apexRel.upper).toBeCloseTo(315, 6);
    expect(apexRel.lower).toBeCloseTo(285, 6);
  });

  it('time tolerance forgives a sub-tol phase lag the band alone would fail', () => {
    const sim = buildFlight(300, 30, 60);
    // 0.4 s late on raw times (alignment off isolates the time tolerance):
    // off-apogee ramps differ by ~4 m, apogee identical.
    const flight = buildFlight(300, 30, 60).map((s) => ({ ...s, timeS: s.timeS - 0.4 }));
    const strict = compareAltitudeSeries(sim, flight, { align: false, tolerance: TOL0 });
    expect(strict.nMismatch).toBeGreaterThan(0);
    const lenient = compareAltitudeSeries(sim, flight, {
      align: false,
      tolerance: { absTolM: 0, relTol: 0, timeTolS: 0.5 },
    });
    expect(lenient.nMismatch).toBe(0);
  });

  it('intersection sync restricts to the overlap; union marks the rest not-compared', () => {
    const sim = buildFlight(300, 30, 60);
    // Truncated log (first 20 s, apogee 200 m at t=10): apogee-match shifts
    // it onto sim time [20, 40], so the overlap is that window.
    const short = buildFlight(200, 10, 20);
    const inter = compareAltitudeSeries(sim, short, { sync: 'intersection', tolerance: TOL0 });
    expect(inter.points.length).toBeGreaterThan(0);
    expect(Math.min(...inter.points.map((p) => p.t))).toBeGreaterThanOrEqual(20 - DISPLAY_DT_S);
    expect(Math.max(...inter.points.map((p) => p.t))).toBeLessThanOrEqual(40 + DISPLAY_DT_S);
    const union = compareAltitudeSeries(sim, short, { sync: 'union', tolerance: TOL0 });
    expect(union.points.length).toBeGreaterThan(inter.points.length);
    expect(union.nNotCompared).toBeGreaterThan(0);
    // Union never extrapolates: every not-compared point carries no diff.
    for (const p of union.points) {
      if (!p.compared) expect(Number.isNaN(p.diff)).toBe(true);
    }
  });
  it('zoh holds the previous sample where linear interpolates between cells', () => {
    // Sharp step at t=5 in both series; the compare-to copy is shifted by
    // half a display cell, so grid times fall between its regridded nodes
    // and the interpolation contract decides the sampled value.
    const step: TrajectorySample[] = [
      { timeS: 0, altitudeM: 0 },
      { timeS: 4.9, altitudeM: 0 },
      { timeS: 5.1, altitudeM: 100 },
      { timeS: 10, altitudeM: 100 },
    ];
    const shifted = step.map((s) => ({ ...s, timeS: s.timeS + 0.05 }));
    const lin = compareAltitudeSeries(step, shifted, { align: false, interp: 'linear', tolerance: TOL0 });
    const zoh = compareAltitudeSeries(step, shifted, { align: false, interp: 'zoh', tolerance: TOL0 });
    const at5Lin = lin.points.find((p) => Math.abs(p.t - 5) < 1e-9);
    const at5Zoh = zoh.points.find((p) => Math.abs(p.t - 5) < 1e-9);
    // Linear reads mid-cell (25 m); zoh holds the prior node (0 m).
    expect(at5Lin?.compare).toBeCloseTo(25, 6);
    expect(at5Zoh?.compare).toBeCloseTo(0, 6);
    // Baseline is sampled on-grid in both runs, so only compareTo diverges.
    expect(at5Lin?.baseline).toBeCloseTo(at5Zoh?.baseline ?? Number.NaN, 6);
  });

  it('unaligned mode keeps raw times, flags the pair, and withholds deltas', () => {
    const sim = buildFlight(300, 30, 60);
    const flight = buildFlight(300, 30, 60).map((s) => ({ ...s, timeS: s.timeS - 4 }));
    const r = compareAltitudeSeries(sim, flight, { align: false, tolerance: TOL0 });
    expect(r.aligned).toBe(false);
    expect(r.timeOffsetS).toBe(0);
    expect(r.apogeeDeltaM).toBeNull();
    expect(r.burnoutVelDeltaMs).toBeNull();
    // Raw 4 s shift with zero tolerance: the pair says mismatch, not a number.
    expect(r.nMismatch).toBeGreaterThan(0);
  });

  it('reports a null burnout delta when the flight log carries no velocity', () => {
    const sim = buildFlight(300, 30, 60);
    const csvFlight = buildFlight(300, 30, 60).map(({ timeS, altitudeM }) => ({ timeS, altitudeM }));
    const r = compareAltitudeSeries(sim, csvFlight, { tolerance: TOL0 });
    expect(r.nMismatch).toBe(0);
    expect(r.burnoutVelDeltaMs).toBeNull();
  });

  it('fails closed on empty series, non-finite samples, and bad tolerances', () => {
    const sim = buildFlight(300, 30, 60);
    expect(() => compareAltitudeSeries([], sim)).toThrow(/non-empty/);
    expect(() => compareAltitudeSeries(sim, [])).toThrow(/non-empty/);
    expect(() => compareAltitudeSeries([{ timeS: 0, altitudeM: NaN }], sim)).toThrow(/finite/);
    expect(() => compareAltitudeSeries(sim, sim, { sync: 'sideways' as never })).toThrow(/sync/);
    expect(() => compareAltitudeSeries(sim, sim, { tolerance: { absTolM: -1, relTol: 0, timeTolS: 0 } })).toThrow(/absTolM/);
    expect(() => compareAltitudeSeries(sim, sim, { tolerance: { absTolM: 0, relTol: NaN, timeTolS: 0 } })).toThrow(/relTol/);
  });

  it('signed difference is compare-minus-baseline with the band around baseline', () => {
    const sim = buildFlight(300, 30, 60);
    const flight = buildFlight(280, 30, 60);
    const r = compareAltitudeSeries(sim, flight, { tolerance: { absTolM: 100, relTol: 0, timeTolS: 0 } });
    for (const p of r.points) {
      if (!p.compared) continue;
      expect(p.diff).toBeCloseTo(p.compare - p.baseline, 9);
      expect(p.lower).toBeLessThanOrEqual(p.baseline);
      expect(p.upper).toBeGreaterThanOrEqual(p.baseline);
    }
  });
});

describe('overlay series helpers', () => {
  it('shifts and unshifts a series reversibly', () => {
    const s = buildFlight(300, 30, 60);
    const shifted = shiftSeries(s, 4.2);
    expect(shifted[0].timeS).toBeCloseTo(s[0].timeS + 4.2, 9);
    expect(s[0].timeS).toBeCloseTo(0, 12); // input untouched
    const restored = shiftSeries(shifted, -4.2);
    for (let i = 0; i < s.length; i++) {
      expect(restored[i].timeS).toBeCloseTo(s[i].timeS, 9);
      expect(restored[i].altitudeM).toBe(s[i].altitudeM);
    }
  });

  it('regrids onto the 0.1 s display grid', () => {
    const irregular = [
      { timeS: 0, altitudeM: 0 },
      { timeS: 0.33, altitudeM: 33 },
      { timeS: 1, altitudeM: 100 },
    ];
    const out = regridDisplay(irregular);
    expect(out.length).toBe(11);
    expect(out[0].timeS).toBeCloseTo(0, 9);
    expect(out[10].timeS).toBeCloseTo(1, 9);
  });

  it('maps sim telemetry time/altitude/vertical-velocity', () => {
    const samples = simTelemetryToAltitude([
      { time: 0, altitude: 0, velocity: { z: 0 } },
      { time: 5, altitude: 250, velocity: { z: 60 } },
    ]);
    expect(samples).toEqual([
      { timeS: 0, altitudeM: 0, velocityMs: 0 },
      { timeS: 5, altitudeM: 250, velocityMs: 60 },
    ]);
  });

  it('finds maximal failing runs and ignores passing/not-compared gaps', () => {
    const points = [
      { t: 0, compared: true, pass: true },
      { t: 0.1, compared: true, pass: false },
      { t: 0.2, compared: true, pass: false },
      { t: 0.3, compared: false, pass: false },
      { t: 0.4, compared: true, pass: false },
      { t: 0.5, compared: true, pass: true },
    ];
    const regions = findOutOfToleranceRegions(points as never);
    expect(regions.length).toBe(2);
    expect(regions[0]).toMatchObject({ startT: 0.1, endT: 0.2, startIndex: 1, endIndex: 2, length: 2 });
    expect(regions[1]).toMatchObject({ startT: 0.4, endT: 0.4, startIndex: 4, endIndex: 4, length: 1 });
  });
});
