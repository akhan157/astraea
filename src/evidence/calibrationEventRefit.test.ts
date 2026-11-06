// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fitDragScale, refitDragScaleWithinEvents, type DragFit } from './dragFit';
import { assessCalibrationEligibility, type CalibrationEvidence, type CalibrationSideEvidence } from './calibrationEligibility';
import { calibrateCd } from './calibration';
import type { TrajectorySample } from './altimetry';

/** Deliberately controlled kinematics: tests filtering, not aerodynamic truth. */
function samplesOf(velocity: boolean, cadence: 'regular' | 'sparse' | 'irregular', shift = 0): TrajectorySample[] {
  const samples: TrajectorySample[] = [];
  let t = 0;
  for (let i = 0; t < 7; i++) {
    samples.push({ timeS: t + shift, altitudeM: 100 + 80 * t - 6 * t ** 2, ...(velocity ? { velocityMs: 80 - 12 * t } : {}) });
    t += cadence === 'regular' ? 0.02 : cadence === 'sparse' ? 0.07 : [0.013, 0.017, 0.019][i % 3];
  }
  return samples;
}
function fitOf(velocity = true, cadence: 'regular' | 'sparse' | 'irregular' = 'regular', shift = 0): DragFit {
  const log = samplesOf(velocity, cadence, shift);
  return fitDragScale({ log, coastMassKg: 1, refAreaM2: 0.01, launchElevationM: 0,
    modelTelemetry: samplesOf(true, cadence, shift).map((s) => ({ time: s.timeS, altitude: s.altitudeM, velocity: { z: s.velocityMs! } })),
  });
}
function eventsOf(burnout = 0.32, recovery = 5.9): CalibrationEvidence {
  const side: CalibrationSideEvidence = {
    burnout: { earliestS: burnout - 0.04, latestS: burnout, source: 'Controlled final thrust/depletion complete; own clock' },
    recovery: { kind: 'first-event', event: { earliestS: recovery, latestS: recovery + 0.1, source: 'Controlled first recovery; own clock' } },
  };
  return { log: side, model: side };
}
const countInvariant = (fit: DragFit) => {
  for (const window of [fit.logWindow, fit.modelWindow]) expect(window.candidates).toBe(window.used + window.excluded.lowSpeed + (window.excluded.event ?? 0));
};

describe('explicit event-qualified refit', () => {
  for (const velocity of [true, false]) for (const cadence of ['regular', 'sparse', 'irregular'] as const) {
    it(`preserves original ${velocity ? 'velocity-line' : 'altitude-quadratic'} fits at ${cadence} cadence`, () => {
      const original = fitOf(velocity, cadence);
      const snapshot = JSON.stringify(original);
      const refit = refitDragScaleWithinEvents(original, eventsOf());
      expect(JSON.stringify(original)).toBe(snapshot);
      expect(refit.selection?.policy).toBe('reviewed-events-v1');
      for (const side of ['logWindow', 'modelWindow'] as const) {
        const old = original[side];
        const next = refit[side];
        expect(next.used).toBeLessThan(old.used);
        expect(next.halfWidthS).toBe(old.halfWidthS);
        expect(next.method).toBe(old.method);
        expect(next.burnoutS).toBe(old.burnoutS);
        expect(next.apogeeS).toBe(old.apogeeS);
        expect(next.supportStartS).toBeGreaterThanOrEqual(0.32);
        expect(next.supportEndS).toBeLessThan(5.9);
        for (let i = 0; i < next.used; i++) {
          const originalIndex = old.pointSupport.findIndex((s) => s.timeS === next.pointSupport[i].timeS);
          expect(originalIndex).toBeGreaterThanOrEqual(0);
          // Exact reference/value identity detects recomputing/clipping raw fits.
          expect(next.pointSupport[i]).toBe(old.pointSupport[originalIndex]);
          expect(next.points[i]).toBe(old.points[originalIndex]);
        }
      }
      countInvariant(refit);
      expect(refit.selection!.logExclusions.retainedLeverageFraction).toBeGreaterThan(0);
      expect(refit.selection!.logExclusions.retainedLeverageFraction).toBeLessThan(1);
    });
  }

  it('uses actual neighborhoods and exact burnout/recovery equality, including absent-through endpoint', () => {
    const original = fitOf();
    const first = original.logWindow.pointSupport[20];
    const last = original.logWindow.pointSupport[100];
    const exact = eventsOf(first.supportStartS, last.supportEndS);
    const refit = refitDragScaleWithinEvents(original, exact);
    expect(refit.logWindow.pointSupport.some((s) => s.timeS === first.timeS)).toBe(true);
    expect(refit.logWindow.pointSupport.some((s) => s.timeS === last.timeS)).toBe(false);
    const through = { ...exact.log, recovery: { kind: 'absent-through' as const, throughS: last.supportEndS, source: 'Controlled absence through inclusive endpoint' } };
    const inclusive = refitDragScaleWithinEvents(original, { log: through, model: through });
    expect(inclusive.logWindow.pointSupport.some((s) => s.timeS === last.timeS)).toBe(true);
    // A centre inside declared coast is still removed when its raw fit crosses burnout.
    expect(original.logWindow.pointSupport.some((s) => s.timeS > first.supportStartS && s.supportStartS < first.supportStartS)).toBe(true);
  });

  it('can only remove points when event uncertainty widens, and counts overlapping reasons once', () => {
    const original = fitOf();
    const narrow = refitDragScaleWithinEvents(original, eventsOf(0.32, 5.9));
    const wide = refitDragScaleWithinEvents(original, eventsOf(0.6, 5.5));
    const narrowTimes = new Set(narrow.logWindow.pointSupport.map((s) => s.timeS));
    expect(wide.logWindow.pointSupport.every((s) => narrowTimes.has(s.timeS))).toBe(true);
    expect(wide.logWindow.used).toBeLessThan(narrow.logWindow.used);
    countInvariant(wide);
    const e = wide.selection!.logExclusions;
    expect(e.burnoutOnly + e.recoveryOnly + e.both).toBe(wide.logWindow.excluded.event);
  });

  it('requires events on both sides, refuses invalid/overlapping intervals and never widens insufficient support', () => {
    const original = fitOf();
    expect(() => refitDragScaleWithinEvents(original, { log: {}, model: eventsOf().model })).toThrow(/log needs/);
    expect(() => refitDragScaleWithinEvents(original, { log: eventsOf().log, model: {} })).toThrow(/model needs/);
    expect(() => refitDragScaleWithinEvents(original, eventsOf(5, 4))).toThrow(/overlapping/);
    expect(() => refitDragScaleWithinEvents(original, { ...eventsOf(), log: { burnout: { earliestS: 1, latestS: 0, source: 'reversed' } } })).toThrow(/reversed/);
    expect(() => refitDragScaleWithinEvents(original, { ...eventsOf(), log: { burnout: { earliestS: 0, latestS: Infinity, source: 'nonfinite' } } })).toThrow(/finite/);
    expect(() => refitDragScaleWithinEvents(original, eventsOf(100, 101))).toThrow(/only 0 qualified/);
    expect(() => refitDragScaleWithinEvents(original, { log: { ...eventsOf().log, burnout: { earliestS: 0, latestS: 0, source: ' ' } }, model: eventsOf().model })).toThrow(/source note/);
    // Sparse cadence has distinct raw neighborhood endpoints, avoiding duplicate endpoint ties.
    const minimumOriginal = fitOf(true, 'sparse');
    const start = minimumOriginal.logWindow.pointSupport[10].supportStartS;
    const nineEnd = minimumOriginal.logWindow.pointSupport[18].supportEndS;
    const tenEnd = minimumOriginal.logWindow.pointSupport[19].supportEndS;
    const through = (end: number): CalibrationEvidence => {
      const side = { burnout: { earliestS: start, latestS: start, source: 'Exact controlled complete burnout' }, recovery: { kind: 'absent-through' as const, throughS: end, source: 'Controlled inclusive absence' } };
      return { log: side, model: side };
    };
    expect(() => refitDragScaleWithinEvents(minimumOriginal, through(nineEnd))).toThrow(/only 9 qualified/);
    expect(refitDragScaleWithinEvents(minimumOriginal, through(tenEnd)).logWindow.used).toBe(10);
  });

  it('keeps signed nonpositive accelerations without outcome-dependent selection and rejects unusable signed ratios', () => {
    const original = fitOf();
    // Modify declared regression inputs to isolate signed-OLS behavior, not the polynomial derivation.
    const firstRetained = original.logWindow.pointSupport.findIndex((s) => s.supportStartS >= 0.32);
    original.logWindow.points[firstRetained] = { ...original.logWindow.points[firstRetained], accelMs2: -0.1 };
    original.logWindow.points[firstRetained + 1] = { ...original.logWindow.points[firstRetained + 1], accelMs2: 0 };
    const refit = refitDragScaleWithinEvents(original, eventsOf());
    expect(refit.logWindow.points).toContain(original.logWindow.points[firstRetained]);
    expect(refit.logWindow.points).toContain(original.logWindow.points[firstRetained + 1]);
    expect(refit.logWindow.points).not.toContain(original.logWindow.points[0]);
    expect(refit.logWindow.nonPositiveKept).toBe(2);
    expect(refit.fittedCd).toBe(calibrateCd(refit.logWindow.points, { allowNegativeAccel: true }).cdCalibrated);
    for (const accelMs2 of [-1, 0]) {
      const unusable = { ...original, logWindow: { ...original.logWindow, points: original.logWindow.points.map((p) => ({ ...p, accelMs2 })) } };
      expect(() => refitDragScaleWithinEvents(unusable, eventsOf())).toThrow(/nonpositive|zero|no usable/);
    }
    const overflow = { ...original, logWindow: { ...original.logWindow, points: original.logWindow.points.map((p) => ({ ...p, accelMs2: Number.MAX_VALUE })) } };
    expect(() => refitDragScaleWithinEvents(overflow, eventsOf())).toThrow(/nonfinite|no usable/);
  });

  it('does not combine different mass regimes and leaves event-qualified conditions unverified', () => {
    const original = fitOf();
    const events = eventsOf();
    const refit = refitDragScaleWithinEvents(original, events);
    expect(assessCalibrationEligibility({ log: refit.logWindow, model: refit.modelWindow }, events).status).toBe('unverified');
    const change = { earliestS: 3, latestS: 3.1, source: 'Known separation in retained span' };
    expect(() => refitDragScaleWithinEvents(original, { ...events, log: { ...events.log, massChanges: [change] } })).toThrow(/mass change/);
  });

  it('preserves corresponding physical centres/values under an own-clock shift', () => {
    const original = refitDragScaleWithinEvents(fitOf(true, 'irregular'), eventsOf());
    const shift = 37;
    const shifted = refitDragScaleWithinEvents(fitOf(true, 'irregular', shift), eventsOf(0.32 + shift, 5.9 + shift));
    expect(shifted.logWindow.used).toBe(original.logWindow.used);
    for (let i = 0; i < original.logWindow.used; i++) {
      expect(shifted.logWindow.pointSupport[i].timeS - shift).toBeCloseTo(original.logWindow.pointSupport[i].timeS, 10);
      expect(shifted.logWindow.points[i].velocityMs).toBeCloseTo(original.logWindow.points[i].velocityMs, 9);
      expect(shifted.logWindow.points[i].accelMs2).toBeCloseTo(original.logWindow.points[i].accelMs2, 8);
    }
    expect(shifted.scale).toBeCloseTo(original.scale, 10);
    expect(() => refitDragScaleWithinEvents(original, eventsOf())).toThrow(/original heuristic/);
  });
});
