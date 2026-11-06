import { describe, expect, it } from 'vitest';
import { useProjectStore } from '../../state/project';
import { flightResult } from '../testFixtures';
import { toFlightRun } from './adapter';

const DISPLAY_CAP = 5000;
const vehicle = useProjectStore.getState().project.vehicle;

type DisplaySample = { time: number; dynamicPressure: number };

const fixed = (value: number, digits: number) => Number.parseFloat(value.toFixed(digits));

/**
 * Independent test fixture for the native display recorder, not a production
 * runtime path. Nonterminal q/time values use the native 0/3-digit rounding;
 * the terminal touchdown sample retains full precision.
 */
function recordDisplaySamples(q: (time: number) => number, count: number, dt: number): DisplaySample[] {
  return Array.from({ length: count }, (_, index) => {
    const time = index * dt;
    const terminal = index === count - 1;
    return {
      time: terminal ? time : fixed(time, 3),
      dynamicPressure: terminal ? q(time) : fixed(q(time), 0),
    };
  });
}

/**
 * Independent transcription of telemetry.rs's bounded-retention algorithm.
 * It deliberately does not call Rust, the WASM bridge, or a TS decimator.
 * `retainRecordedPeak=false` is used only as a counterfactual to demonstrate
 * what the native forced-pressure-peak obligation contributes.
 */
function decimateLikeNative(
  full: DisplaySample[],
  eventTimes: number[] = [],
  maxPoints = DISPLAY_CAP,
  retainRecordedPeak = true,
): DisplaySample[] {
  if (full.length === 0) return [];
  const n = full.length;
  const last = n - 1;
  const rank = Array<number>(n).fill(0);
  rank[0] = 3;
  rank[last] = 3;

  for (const eventTime of eventTimes) {
    let best = 0;
    let bestDistance = Math.abs(full[0].time - eventTime);
    for (let index = 1; index < n; index += 1) {
      const distance = Math.abs(full[index].time - eventTime);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    }
    rank[best] = Math.max(rank[best], 2);
  }

  if (retainRecordedPeak) {
    let peak: number | undefined;
    for (let index = 0; index < n; index += 1) {
      const candidate = full[index].dynamicPressure;
      if (Number.isFinite(candidate) && candidate >= 0
        && (peak === undefined || candidate > full[peak].dynamicPressure)) {
        peak = index;
      }
    }
    if (peak !== undefined) rank[peak] = Math.max(rank[peak], 2);
  }

  const forced = rank.filter((value) => value >= 2).length;
  if (forced > maxPoints) throw new Error('synthetic forced points exceed display cap');
  if (n > maxPoints) {
    const free = rank.map((value, index) => ({ value, index })).filter(({ value }) => value < 2).map(({ index }) => index);
    const budget = maxPoints - forced;
    if (budget >= free.length) {
      for (const index of free) rank[index] = 1;
    } else if (budget === 1) {
      rank[free[Math.floor(free.length / 2)]] = 1;
    } else if (budget > 1) {
      for (let j = 0; j < budget; j += 1) {
        const freeIndex = Math.round(j * (free.length - 1) / (budget - 1));
        rank[free[freeIndex]] = 1;
      }
    }
  } else {
    for (let index = 0; index < n; index += 1) rank[index] = Math.max(rank[index], 1);
  }

  const kept: number[] = [];
  for (let index = 0; index < n; index += 1) {
    if (rank[index] === 0) continue;
    let keep = true;
    while (kept.length > 0) {
      const previous = kept[kept.length - 1];
      if (full[previous].time < full[index].time) break;
      if (rank[previous] >= 2 && rank[index] >= 2) throw new Error('synthetic forced display times collide');
      if (rank[previous] >= rank[index]) {
        keep = false;
        break;
      }
      kept.pop();
    }
    if (keep) kept.push(index);
  }
  return kept.map((index) => full[index]);
}

function convertDisplaySamples(samples: DisplaySample[]) {
  const template = flightResult().telemetry[0];
  const telemetry = samples.map((sample) => ({ ...template, ...sample }));
  return toFlightRun(flightResult({ events: [], telemetry }), vehicle, undefined, 'peak-evidence', 1, 0);
}

function displayedPeak(samples: DisplaySample[]): DisplaySample {
  return samples.reduce((best, sample) => sample.dynamicPressure > best.dynamicPressure ? sample : best);
}

describe('independent analytic and refinement evidence for sampled max-Q', () => {
  it('equals the analytic peak when a recorded sample hits it exactly', () => {
    const q = (time: number) => 40000 - 4000 * (time - 2) ** 2;
    const bounded = decimateLikeNative(recordDisplaySamples(q, 81, 0.05));
    const run = convertDisplaySamples(bounded);

    expect(run.summary.maxQ?.value).toBe(40000);
    expect(run.sampledMaxQ?.time).toBe(2);
    expect(40000 - run.summary.maxQ!.value).toBe(0);

    const refined = decimateLikeNative(recordDisplaySamples(q, 1601, 0.0025));
    expect(displayedPeak(refined).dynamicPressure).toBe(40000);
    expect(refined.find((sample) => sample.time === 2)?.dynamicPressure).toBe(40000);
  });

  it('undershoots an off-grid parabolic peak by the analytically derived amount', () => {
    const peakTime = 2.023;
    const analyticPeak = 50000;
    const q = (time: number) => analyticPeak - 100000 * (time - peakTime) ** 2;
    const bounded = decimateLikeNative(recordDisplaySamples(q, 81, 0.05));
    const run = convertDisplaySamples(bounded);

    expect(run.summary.maxQ?.value).toBe(49947);
    expect(run.sampledMaxQ?.time).toBe(2);
    expect(q(2)).toBeCloseTo(49947.1, 9);
    expect(analyticPeak - run.summary.maxQ!.value).toBe(53);
    expect(Math.abs(run.sampledMaxQ!.time - peakTime)).toBeCloseTo(0.023, 9);

    const refined = decimateLikeNative(recordDisplaySamples(q, 4001, 0.001));
    expect(displayedPeak(refined).dynamicPressure).toBe(analyticPeak);
  });

  it('has no finite missed-peak bound for a smooth narrow-peak family with identical display samples', () => {
    const baseline = 50000;
    const peakTime = 2.025;
    for (const amplitude of [1000, 1_000_000, 1_000_000_000]) {
      const q = (time: number) => baseline + amplitude * Math.exp(-0.5 * ((time - peakTime) / 0.001) ** 2);
      const full = recordDisplaySamples(q, 81, 0.05);
      const bounded = decimateLikeNative(full);
      const run = convertDisplaySamples(bounded);

      expect(new Set(full.map((sample) => sample.dynamicPressure))).toEqual(new Set([baseline]));
      expect(run.summary.maxQ?.value).toBe(baseline);
      expect(baseline + amplitude - run.summary.maxQ!.value).toBe(amplitude);
      expect(run.sampledMaxQ?.time).toBe(0);
    }
  });

  it('can overshoot the analytic maximum because nonterminal q is rounded to integer Pa', () => {
    const analyticPeak = 100.6;
    const q = (time: number) => analyticPeak - (time - 2) ** 2;
    const run = convertDisplaySamples(decimateLikeNative(recordDisplaySamples(q, 81, 0.05)));

    expect(run.summary.maxQ?.value).toBe(101);
    // The claim is directional: the displayed sample exceeds the continuous peak.
    expect(run.summary.maxQ!.value).toBeGreaterThan(analyticPeak);
    expect(run.summary.maxQ!.value - analyticPeak).toBeCloseTo(0.4, 9);
  });

  it('retains the highest recorded sample through native-cap decimation without repairing a between-sample miss', () => {
    const analyticPeak = 10000;
    const q = (time: number) => 1000 + 9000 * Math.exp(-0.5 * ((time - 0.045) / 0.02) ** 2);
    const full = recordDisplaySamples(q, 30001, 0.01);
    const recordedPeak = displayedPeak(full);
    const bounded = decimateLikeNative(full, [0, 300]);
    const withoutPeakObligation = decimateLikeNative(full, [0, 300], DISPLAY_CAP, false);

    expect(full).toHaveLength(30001);
    expect(bounded).toHaveLength(DISPLAY_CAP);
    expect(displayedPeak(bounded)).toEqual(recordedPeak);
    expect(displayedPeak(withoutPeakObligation).dynamicPressure).toBeLessThan(recordedPeak.dynamicPressure);
    expect(displayedPeak(bounded).dynamicPressure).toBeLessThan(analyticPeak);
  });

  it('states the evidenced unbounded-miss and rounding-overshoot limits in the adapter reason', () => {
    const run = convertDisplaySamples([{ time: 0, dynamicPressure: 0 }, { time: 1, dynamicPressure: 10 }]);
    expect(run.summary.maxQ?.reason).toContain('can miss the continuous-time peak by an unbounded amount');
    expect(run.summary.maxQ?.reason).toContain('rounding can also make the displayed peak exceed it');
    expect(run.summary.maxQ?.reason).toContain('No continuous-peak magnitude or timing error bound');
  });
});

describe('sampled max-Q bookkeeping', () => {
  it('counts every returned sample separately from finite nonnegative q/time samples', () => {
    const samples = [
      { time: 0, dynamicPressure: Number.NaN },
      { time: 1, dynamicPressure: Number.POSITIVE_INFINITY },
      { time: 2, dynamicPressure: Number.NEGATIVE_INFINITY },
      { time: 3, dynamicPressure: -1 },
      { time: 4, dynamicPressure: 0 },
      { time: 5, dynamicPressure: 5 },
      { time: 6, dynamicPressure: 10 },
      { time: 7, dynamicPressure: 2 },
      { time: 8, dynamicPressure: 1 },
    ];
    const run = convertDisplaySamples(samples);

    expect(run.sampledMaxQ).toMatchObject({ time: 6, sampleCount: 9, validSampleCount: 5, maxObservedGapS: 1 });
    expect(run.summary.maxQ).toMatchObject({ value: 10, confidence: 'unknown' });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1])(
    'rejects invalid timestamp %s without inventing a peak or gap',
    (invalidTime) => {
      const run = convertDisplaySamples([
        { time: 0, dynamicPressure: 1 },
        { time: invalidTime, dynamicPressure: 100 },
        { time: 2, dynamicPressure: 2 },
      ]);
      expect(run.sampledMaxQ).toMatchObject({ sampleCount: 3, validSampleCount: 2, time: 2 });
      expect(run.sampledMaxQ?.maxObservedGapS).toBeUndefined();
      expect(run.summary.maxQ).toMatchObject({ value: 2, confidence: 'unknown' });
    },
  );

  it('withholds max-Q and its derived event when no valid sample exists', () => {
    const run = convertDisplaySamples([
      { time: 0, dynamicPressure: Number.NaN },
      { time: 1, dynamicPressure: Number.POSITIVE_INFINITY },
      { time: 2, dynamicPressure: Number.NEGATIVE_INFINITY },
      { time: 3, dynamicPressure: -1 },
      { time: Number.NaN, dynamicPressure: 100 },
      { time: -1, dynamicPressure: 100 },
    ]);
    expect(run.summary.maxQ).toBeUndefined();
    expect(run.sampledMaxQ).toBeUndefined();
    expect(run.events.some((event) => event.kind === 'max_q')).toBe(false);
  });

  it('reports a gap only for at least two finite nonnegative non-decreasing timestamps', () => {
    const one = convertDisplaySamples([{ time: 1, dynamicPressure: 2 }]);
    expect(one.sampledMaxQ?.maxObservedGapS).toBeUndefined();

    const equal = convertDisplaySamples([{ time: 1, dynamicPressure: 2 }, { time: 1, dynamicPressure: 2 }]);
    expect(equal.sampledMaxQ).toMatchObject({ time: 1, maxObservedGapS: 0 });

    const reversed = convertDisplaySamples([{ time: 2, dynamicPressure: 2 }, { time: 1, dynamicPressure: 1 }]);
    expect(reversed.sampledMaxQ?.maxObservedGapS).toBeUndefined();
    expect(reversed.summary.maxQ?.confidence).toBe('unknown');
  });
});
