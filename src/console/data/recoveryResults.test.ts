import { describe, expect, it } from 'vitest';
import { flightOutputDictionary, recordedDescentInterval, type FlightOutputRun } from './recoveryResults';
import { landingAvailability } from '../../application/flightLanding';
import type { Confidence } from './contract';

type Input = Parameters<typeof recordedDescentInterval>[0];
const clock = (value: number) => ({ value, unit: 's', confidence: 'modeled' as const });
function fixture(): Input & { summary: Required<Input['summary']> } {
  return { summary: { landingNominal: true, apogeeTime: clock(10), flightTime: clock(30) },
    terminationReason: 'touchdown', events: [
      { kind: 'apogee_drogue', t: 13, label: 'Activation', altitude: 100, velocity: 4 },
      { kind: 'touchdown', t: 30, label: 'Touchdown', altitude: 0, velocity: 5 },
    ] };
}
function outputFixture(): FlightOutputRun {
  const base = fixture();
  const result = (value: number, unit: string, confidence: Confidence = 'modeled') => ({ value, unit, confidence, reason: `fixture ${confidence}` });
  return { ...base, summary: {
    ...base.summary, validity: 'PASS', enveloped: true, offNominalExcursion: false,
    apogee: result(1200, 'm'), maxSpeed: result(322, 'm/s'), maxMach: result(0.94, '1'),
    maxAccelG: result(12.4, 'g'), maxQ: result(54000, 'Pa'), railExitSpeed: result(27.5, 'm/s'),
    burnoutAltitude: result(480, 'm'), landingSpeed: result(5.1, 'm/s'), landingEnergy: result(14.2, 'J'),
    drift: result(63.2, 'm', 'extrapolated'), weathercockAngleDeg: result(1.8, 'deg'),
  } };
}

describe('recorded recovery clock contract', () => {
  it('uses recorded peak instead of delayed recovery activation without mutating the record', () => {
    const input = fixture(), before = structuredClone(input);
    expect(recordedDescentInterval(input)).toEqual({ available: true, seconds: 20, apogeeTimeS: 10, touchdownTimeS: 30 });
    expect(input).toStrictEqual(before);
  });
  it('permits historical absent termination metadata only with recorded nominal touchdown and consistent clocks', () => {
    const input = fixture(); delete input.terminationReason;
    expect(recordedDescentInterval(input).available).toBe(true);
  });
  it('does not need a recovery marker or infer one', () => {
    const input = fixture(); input.events = input.events.filter(e => e.kind === 'touchdown');
    expect(recordedDescentInterval(input).available).toBe(true);
    expect(input.events).toHaveLength(1);
  });
  it('preserves an actually recorded zero interval instead of treating zero as absent', () => {
    const input = fixture(); input.summary.apogeeTime.value = 30;
    expect(recordedDescentInterval(input)).toMatchObject({ available: true, seconds: 0 });
  });
  it.each(['missing', 'duplicate', 'derived'] as const)('refuses %s touchdown event', which => {
    const input = fixture(), td = input.events[1];
    input.events = which === 'missing' ? [] : which === 'duplicate' ? [td, { ...td }] : [{ ...td, derived: true }];
    expect(recordedDescentInterval(input)).toEqual({ available: false, reason: 'one recorded touchdown event is required' });
  });
  it.each([NaN, Infinity, -Infinity, -1])('refuses invalid clock %s in each clock carrier', value => {
    for (const which of ['apogee', 'touchdown', 'end']) {
      const input = fixture();
      if (which === 'apogee') input.summary.apogeeTime.value = value;
      if (which === 'end') input.summary.flightTime.value = value;
      if (which === 'touchdown') input.events = [{ ...input.events[1], t: value }];
      expect(recordedDescentInterval(input)).toEqual({ available: false, reason: 'recorded event clocks are invalid' });
    }
  });
  it.each(['apogeeTime', 'flightTime'] as const)('refuses a missing %s carrier without throwing', key => {
    const input: Input = fixture(); delete input.summary[key];
    expect(recordedDescentInterval(input)).toEqual({ available: false, reason: 'recorded event clocks are invalid' });
  });
  it('does not hide reversed or mismatched clocks with a clamp or tolerance', () => {
    const input = fixture(); input.summary.apogeeTime.value = 31;
    expect(recordedDescentInterval(input)).toEqual({ available: false, reason: 'recorded event clocks are inconsistent' });
    input.summary.apogeeTime.value = 10; input.summary.flightTime.value = 30.000000000000004;
    expect(recordedDescentInterval(input)).toEqual({ available: false, reason: 'recorded event clocks are inconsistent' });
  });
  it('requires affirmative nominal flag and rejects explicit timeout even if that flag conflicts', () => {
    const input = fixture(); input.summary.landingNominal = false;
    expect(landingAvailability(input)).toEqual({ available: false, reason: 'no nominal touchdown' });
    expect(recordedDescentInterval(input)).toEqual({ available: false, reason: 'no nominal touchdown' });
    input.summary.landingNominal = true; input.terminationReason = 'timeout';
    expect(landingAvailability(input)).toEqual({ available: false, reason: 'run stopped on its time limit' });
    expect(recordedDescentInterval(input)).toEqual({ available: false, reason: 'run stopped on its time limit' });
  });
});

describe('flight output dictionary projection', () => {
  it('copies every canonical summary value/unit/confidence and derives only the recorded descent interval', () => {
    const input = outputFixture(), before = structuredClone(input);
    const outputs = flightOutputDictionary(input);
    for (const id of ['apogee', 'apogeeTime', 'maxSpeed', 'maxMach', 'maxAccelG', 'maxQ', 'railExitSpeed',
      'burnoutAltitude', 'landingSpeed', 'landingEnergy', 'drift', 'flightTime', 'weathercockAngleDeg'] as const) {
      expect(outputs[id]).toMatchObject({ value: input.summary[id]!.value, unit: input.summary[id]!.unit,
        confidence: input.summary[id]!.confidence, available: true });
    }
    expect(outputs.apogeeToTouchdown).toMatchObject({ value: 20, unit: 's', confidence: 'modeled', available: true });
    expect(outputs.apogeeToTouchdown?.value).not.toBe(30 - 13);
    expect(input).toStrictEqual(before);
  });
  it('uses the less-qualified clock level and preserves null/unavailable semantics', () => {
    const input = outputFixture();
    input.summary.apogeeTime.confidence = 'extrapolated';
    input.summary.flightTime.confidence = 'modeled';
    input.terminationReason = 'timeout';
    const outputs = flightOutputDictionary(input);
    expect(outputs.apogeeToTouchdown).toMatchObject({ value: null, unit: 's', confidence: 'extrapolated', available: false,
      unavailableReason: 'run stopped on its time limit' });
    for (const id of ['landingSpeed', 'landingEnergy'] as const) {
      expect(outputs[id]).toMatchObject({ value: null, unit: input.summary[id].unit, confidence: input.summary[id].confidence,
        available: false, unavailableReason: 'run stopped on its time limit' });
    }
    expect(outputs.drift).toMatchObject({ value: 63.2, available: true });
  });
  it('does not promote the derived interval above the modeled native touchdown event', () => {
    const input = outputFixture();
    input.summary.apogeeTime.confidence = 'measured';
    input.summary.flightTime.confidence = 'measured';
    expect(flightOutputDictionary(input).apogeeToTouchdown).toMatchObject({ value: 20, confidence: 'modeled', available: true });
  });
  it('exports delayed-marker, missing-clock, timeout and non-nominal records without a leaked interval', () => {
    const delayed = outputFixture();
    delayed.events = [{ ...delayed.events[0], t: 27 }, delayed.events[1]];
    expect(flightOutputDictionary(delayed).apogeeToTouchdown).toMatchObject({ value: 20, available: true });
    const missing = outputFixture();
    const { apogeeTime: droppedApogeeCarrier, ...summaryWithoutApogee } = missing.summary;
    void droppedApogeeCarrier;
    missing.summary = summaryWithoutApogee as typeof missing.summary;
    expect(flightOutputDictionary(missing).apogeeToTouchdown).toMatchObject({
      value: null, available: false, unavailableReason: 'recorded event clocks are invalid' });
    const nonNominal = outputFixture();
    nonNominal.summary.landingNominal = false;
    expect(flightOutputDictionary(nonNominal).apogeeToTouchdown).toMatchObject({
      value: null, available: false, unavailableReason: 'no nominal touchdown' });
  });
  it('derives the trace interval from the one authoritative recorded interval', () => {
    const input = outputFixture();
    const interval = recordedDescentInterval(input);
    if (!interval.available) throw new Error('fixture interval must be available');
    const outputs = flightOutputDictionary(input);
    expect(outputs.apogeeToTouchdown).toMatchObject({ value: interval.seconds, unit: 's', available: true });
    // No second interval/descent entry may exist beside the canonical id.
    expect(Object.keys(outputs).filter((id) => /touchdown|descent/i.test(id))).toEqual(['apogeeToTouchdown']);
  });
  it('makes non-finite values explicitly null instead of allowing JSON to hide their availability', () => {
    const input = outputFixture(); input.summary.apogee.value = Number.NaN;
    expect(flightOutputDictionary(input).apogee).toMatchObject({ value: null, available: false,
      unavailableReason: 'recorded value is not finite', confidence: 'modeled' });
    delete input.summary.maxQ;
    expect(flightOutputDictionary(input)).not.toHaveProperty('maxQ');
  });
});
