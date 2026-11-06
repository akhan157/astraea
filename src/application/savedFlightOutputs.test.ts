import { describe, expect, it } from 'vitest';
import { parseSavedFlightOutputs, type SavedFlightOutput, type SavedFlightOutputs } from './savedFlightOutputs';

const entry = (): SavedFlightOutput => ({ value: 1.8, unit: 'deg', confidence: 'modeled', reason: 'fixture reason', available: true });

const valid = (): SavedFlightOutputs => ({
  dictionaryRevision: 'RMP10-C06/2',
  outputs: {
    apogee: { value: 1200, unit: 'm', confidence: 'modeled', available: true },
    maxQ: { value: 54000, unit: 'Pa', confidence: 'unknown', reason: 'sampled', available: true },
    landingSpeed: { value: null, unit: 'm/s', confidence: 'modeled', reason: 'landing basis',
      available: false, unavailableReason: 'no nominal touchdown' },
    weathercockAngleDeg: entry(),
  },
  flags: { validity: 'PASS', enveloped: true, offNominalExcursion: false, landingNominal: true, terminationReason: 'touchdown' },
  sampledMaxQ: { time: 3.2, sampleCount: 6, validSampleCount: 6, maxObservedGapS: 77.9 },
});

const parse = (mutate: (raw: any) => void) => {
  const raw = JSON.parse(JSON.stringify(valid())) as Record<string, unknown>;
  mutate(raw);
  return () => parseSavedFlightOutputs(raw);
};

describe('saved flight output dictionary parser', () => {
  it('round-trips the canonical values, qualification, availability, flags and peak context unchanged', () => {
    const before = valid();
    expect(parseSavedFlightOutputs(JSON.parse(JSON.stringify(before)))).toEqual(before);
    expect(parseSavedFlightOutputs(JSON.parse(JSON.stringify(before)))).not.toBe(before);
  });

  it('preserves an actual zero as available instead of treating it as absent', () => {
    const raw = JSON.parse(JSON.stringify(valid()));
    raw.outputs.landingSpeed = { value: 0, unit: 'm/s', confidence: 'modeled', available: true };
    const parsed = parseSavedFlightOutputs(raw);
    expect(parsed.outputs.landingSpeed).toEqual({ value: 0, unit: 'm/s', confidence: 'modeled', available: true });
    expect(parsed.outputs.landingSpeed?.available).toBe(true);
  });

  it('refuses unknown top-level or output fields instead of silently preserving schema injection', () => {
    expect(parse((raw) => { raw.extra = true; })).toThrow(/must have exactly/);
    expect(parse((raw) => { (raw.outputs as Record<string, unknown>).mystery = entry(); })).toThrow(/not a dictionary output/);
    expect(parse((raw) => { (raw.outputs.apogee as Record<string, unknown>).note = 'x'; })).toThrow(/must have exactly/);
    expect(parse((raw) => { (raw.flags as Record<string, unknown>).note = 'x'; })).toThrow(/must have exactly/);
  });

  it('refuses availability/value contradictions rather than inventing or hiding a value', () => {
    expect(parse((raw) => { (raw.outputs.apogee as Record<string, unknown>).available = true; (raw.outputs.apogee as Record<string, unknown>).value = null; }))
      .toThrow(/available output needs a finite value/);
    expect(parse((raw) => { (raw.outputs.landingSpeed as Record<string, unknown>).available = false; (raw.outputs.landingSpeed as Record<string, unknown>).value = 5; }))
      .toThrow(/unavailable output must carry a null value/);
    expect(parse((raw) => { delete (raw.outputs.landingSpeed as Record<string, unknown>).unavailableReason; }))
      .toThrow(/unavailableReason/);
    expect(parse((raw) => { (raw.outputs.apogee as Record<string, unknown>).unavailableReason = 'stale'; }))
      .toThrow(/available output cannot carry unavailableReason/);
  });

  it('refuses empty or non-object output maps and unknown qualification enums', () => {
    expect(parse((raw) => { raw.outputs = {}; })).toThrow(/outputs must not be empty/);
    expect(parse((raw) => { raw.outputs = []; })).toThrow(/outputs must be an object/);
    expect(parse((raw) => { (raw.outputs.apogee as Record<string, unknown>).confidence = 'certified'; })).toThrow(/confidence/);
    expect(parse((raw) => { (raw.flags as Record<string, unknown>).validity = 'PASSED'; })).toThrow(/validity/);
    expect(parse((raw) => { (raw.flags as Record<string, unknown>).enveloped = 'yes'; })).toThrow(/enveloped/);
    expect(parse((raw) => { (raw.flags as Record<string, unknown>).terminationReason = 'abort'; })).toThrow(/terminationReason/);
  });

  it('refuses incomplete flags and invalid sampled-peak counters', () => {
    expect(parse((raw) => { delete (raw.flags as Record<string, unknown>).offNominalExcursion; })).toThrow(/must have exactly/);
    expect(parse((raw) => { (raw.sampledMaxQ as Record<string, unknown>).validSampleCount = 7; })).toThrow(/validSampleCount/);
    expect(parse((raw) => { (raw.sampledMaxQ as Record<string, unknown>).sampleCount = -1; })).toThrow(/sampleCount/);
    expect(parse((raw) => { (raw.sampledMaxQ as Record<string, unknown>).extra = 1; })).toThrow(/must have exactly/);
  });

  it('refuses a non-string dictionary revision and a non-object payload', () => {
    expect(parse((raw) => { raw.dictionaryRevision = 2; })).toThrow(/dictionaryRevision/);
    expect(() => parseSavedFlightOutputs(null)).toThrow(/must be an object/);
    expect(() => parseSavedFlightOutputs([])).toThrow(/must be an object/);
  });
});

describe('saved dictionary contract invariants', () => {
  it('refuses a non-canonical unit for a known output instead of letting presentation reinterpret it', () => {
    for (const [id, unit] of [['apogee', 'ft'], ['maxSpeed', 'ft/s'], ['landingEnergy', 'ft·lbf'], ['maxQ', 'psi']] as const) {
      const raw = JSON.parse(JSON.stringify(valid()));
      raw.outputs[id] = { value: 1, unit, confidence: 'modeled', available: true };
      expect(() => parseSavedFlightOutputs(raw)).toThrow(`${id}.unit must be`);
    }
  });

  it('refuses canonical landing/descent availability that contradicts timeout or non-nominal flags', () => {
    const timeout = parse((raw) => {
      raw.flags.terminationReason = 'timeout';
      raw.outputs.landingSpeed = { value: 0, unit: 'm/s', confidence: 'modeled', available: true };
    });
    expect(timeout).toThrow(/landingSpeed cannot be available when run stopped on its time limit/);
    const nonNominal = parse((raw) => {
      raw.flags.landingNominal = false;
      raw.outputs.landingEnergy = { value: 0, unit: 'J', confidence: 'modeled', available: true };
    });
    expect(nonNominal).toThrow(/landingEnergy cannot be available when no nominal touchdown/);
    const descent = parse((raw) => {
      raw.flags.terminationReason = 'timeout';
      raw.outputs.apogeeToTouchdown = { value: 0, unit: 's', confidence: 'modeled', available: true };
    });
    expect(descent).toThrow(/apogeeToTouchdown cannot be available when run stopped on its time limit/);
  });

  it('accepts an unavailable canonical landing record under timeout and a nominal zero', () => {
    const timedOut = JSON.parse(JSON.stringify(valid()));
    timedOut.flags.terminationReason = 'timeout';
    expect(() => parseSavedFlightOutputs(timedOut)).not.toThrow();
    const nominalZero = JSON.parse(JSON.stringify(valid()));
    nominalZero.outputs.landingSpeed = { value: 0, unit: 'm/s', confidence: 'modeled', available: true };
    expect(parseSavedFlightOutputs(nominalZero).outputs.landingSpeed).toMatchObject({ value: 0, available: true });
  });

  it('bounds peak metadata by the retained display-sample cap', () => {
    expect(parse((raw) => { (raw.sampledMaxQ as Record<string, unknown>).sampleCount = 5001; }))
      .toThrow(/sampleCount exceeds 5000/);
    expect(parse((raw) => { (raw.sampledMaxQ as Record<string, unknown>).sampleCount = 5000; (raw.sampledMaxQ as Record<string, unknown>).validSampleCount = 5000; }))
      .not.toThrow();
  });
});
