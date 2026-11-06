/**
 * The canonical flight output dictionary exactly as archived with a saved
 * case, and its strict parser. A saved dictionary is an immutable historical
 * record: it preserves the SI value or null, unit, qualification and factual
 * reason, availability, the dictionary revision and the run flags it was
 * recorded under. Nothing here recomputes a value from the current engine or
 * backfills a field an older document never held.
 */
import type { Confidence, Validity } from '../console/data/contract';
import { landingAvailability } from './flightLanding';
import { MAX_SAVED_TELEMETRY_POINTS } from './savedTelemetry';

/** Dictionary ids in canonical presentation order. */
export const SAVED_FLIGHT_OUTPUT_IDS = [
  'apogee', 'apogeeTime', 'maxSpeed', 'maxMach', 'maxAccelG', 'maxQ',
  'railExitSpeed', 'burnoutAltitude', 'landingSpeed', 'landingEnergy',
  'drift', 'flightTime', 'weathercockAngleDeg', 'apogeeToTouchdown',
] as const;
export type SavedFlightOutputId = (typeof SAVED_FLIGHT_OUTPUT_IDS)[number];

export const SAVED_FLIGHT_OUTPUT_LABELS: Readonly<Record<SavedFlightOutputId, string>> = {
  apogee: 'Apogee',
  apogeeTime: 'Time to apogee',
  maxSpeed: 'Max speed',
  maxMach: 'Max Mach',
  maxAccelG: 'Max acceleration',
  maxQ: 'Sampled Max-Q',
  railExitSpeed: 'Rail exit speed',
  burnoutAltitude: 'Burnout altitude',
  landingSpeed: 'Landing speed',
  landingEnergy: 'Landing energy',
  drift: 'Drift from pad',
  flightTime: 'Flight time',
  weathercockAngleDeg: 'Incidence at rail exit',
  apogeeToTouchdown: 'Apogee → touchdown',
};

/**
 * Canonical SI unit each producer writes for an id. The parser enforces it and
 * Saved Runs presents/deltas only against it, so the archive contract and the
 * comparison cannot drift from the adapter's actual units.
 */
export const SAVED_FLIGHT_OUTPUT_UNITS: Readonly<Record<SavedFlightOutputId, string>> = {
  apogee: 'm',
  apogeeTime: 's',
  maxSpeed: 'm/s',
  maxMach: '1',
  maxAccelG: 'g',
  maxQ: 'Pa',
  railExitSpeed: 'm/s',
  burnoutAltitude: 'm',
  landingSpeed: 'm/s',
  landingEnergy: 'J',
  drift: 'm',
  flightTime: 's',
  weathercockAngleDeg: 'deg',
  apogeeToTouchdown: 's',
};

/** IDs whose availability must obey the shared recorded landing rule. */
export const SAVED_FLIGHT_LANDING_OUTPUT_IDS = ['landingSpeed', 'landingEnergy', 'apogeeToTouchdown'] as const;

const CONFIDENCE_LEVELS: readonly Confidence[] = ['measured', 'calibrated', 'modeled', 'extrapolated', 'unknown'];
const VALIDITY_LEVELS: readonly Validity[] = ['PASS', 'FAIL', 'UNKNOWN', 'NOT_APPLICABLE'];

export interface SavedFlightOutput {
  /** Canonical SI value, or null when unavailable. Never display-rounded. */
  value: number | null;
  unit: string;
  confidence: Confidence;
  reason?: string;
  available: boolean;
  unavailableReason?: string;
}

export interface SavedFlightOutputFlags {
  validity: Validity;
  enveloped: boolean;
  offNominalExcursion: boolean;
  landingNominal: boolean;
  terminationReason?: 'touchdown' | 'timeout';
}

export interface SavedSampledMaxQ {
  time: number;
  sampleCount: number;
  validSampleCount: number;
  maxObservedGapS?: number;
}

export interface SavedFlightOutputs {
  /** Dictionary contract this record was written under; preserved, never rewritten. */
  dictionaryRevision: string;
  outputs: Partial<Record<SavedFlightOutputId, SavedFlightOutput>>;
  flags: SavedFlightOutputFlags;
  /** Peak of the retained bounded display samples, when the run recorded it. */
  sampledMaxQ?: SavedSampledMaxQ;
}

const OUTPUT_KEYS = ['value', 'unit', 'confidence', 'available'] as const;
const OUTPUT_OPTIONALS = ['reason', 'unavailableReason'] as const;
const FLAG_KEYS = ['validity', 'enveloped', 'offNominalExcursion', 'landingNominal'] as const;
const PEAK_KEYS = ['time', 'sampleCount', 'validSampleCount'] as const;

type Raw = Record<string, unknown>;

function record(value: unknown, path: string): Raw {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Raw;
}

/** Exact-key check, matching the saved-events/telemetry parsers. */
function exact(raw: Raw, path: string, keys: ReadonlyArray<string>): void {
  const actual = Object.keys(raw).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new Error(`${path} must have exactly ${expected.join(', ')}`);
  }
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${path} must be a non-empty string`);
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
  return value;
}

function count(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`${path} must be a nonnegative integer`);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
}

function output(raw: unknown, path: string, id: SavedFlightOutputId): SavedFlightOutput {
  const entry = record(raw, path);
  exact(entry, path, [...OUTPUT_KEYS, ...OUTPUT_OPTIONALS.filter((key) => Object.hasOwn(entry, key))]);
  const unit = text(entry.unit, `${path}.unit`);
  if (unit !== SAVED_FLIGHT_OUTPUT_UNITS[id]) {
    throw new Error(`${path}.unit must be '${SAVED_FLIGHT_OUTPUT_UNITS[id]}' (canonical SI), not '${unit}'`);
  }
  if (!CONFIDENCE_LEVELS.includes(entry.confidence as Confidence)) throw new Error(`${path}.confidence is not a qualification level`);
  const confidence = entry.confidence as Confidence;
  const available = bool(entry.available, `${path}.available`);
  const raw_value = entry.value;
  let reason: string | undefined;
  if (Object.hasOwn(entry, 'reason')) reason = text(entry.reason, `${path}.reason`);
  let unavailableReason: string | undefined;
  if (Object.hasOwn(entry, 'unavailableReason')) unavailableReason = text(entry.unavailableReason, `${path}.unavailableReason`);
  if (available) {
    if (unavailableReason !== undefined) throw new Error(`${path}: available output cannot carry unavailableReason`);
    if (typeof raw_value !== 'number' || !Number.isFinite(raw_value)) throw new Error(`${path}: available output needs a finite value`);
    return { value: raw_value, unit, confidence, ...(reason === undefined ? {} : { reason }), available: true };
  }
  if (raw_value !== null) throw new Error(`${path}: unavailable output must carry a null value`);
  if (unavailableReason === undefined) throw new Error(`${path}: unavailable output needs an unavailableReason`);
  return { value: null, unit, confidence, ...(reason === undefined ? {} : { reason }), available: false, unavailableReason };
}

/** Strict copy of one archived canonical output dictionary. Never repairs or defaults a field. */
export function parseSavedFlightOutputs(raw: unknown): SavedFlightOutputs {
  const root = record(raw, 'flightOutputs');
  const rootKeys = ['dictionaryRevision', 'outputs', 'flags', ...(Object.hasOwn(root, 'sampledMaxQ') ? ['sampledMaxQ'] : [])];
  exact(root, 'flightOutputs', rootKeys);
  const dictionaryRevision = text(root.dictionaryRevision, 'flightOutputs.dictionaryRevision');
  const outputsRaw = record(root.outputs, 'flightOutputs.outputs');
  if (Object.keys(outputsRaw).length === 0) throw new Error('flightOutputs.outputs must not be empty');
  const outputs: Partial<Record<SavedFlightOutputId, SavedFlightOutput>> = {};
  for (const [key, value] of Object.entries(outputsRaw)) {
    if (!(SAVED_FLIGHT_OUTPUT_IDS as readonly string[]).includes(key)) throw new Error(`flightOutputs.outputs.${key} is not a dictionary output`);
    const id = key as SavedFlightOutputId;
    outputs[id] = output(value, `flightOutputs.outputs.${id}`, id);
  }
  const flagsRaw = record(root.flags, 'flightOutputs.flags');
  exact(flagsRaw, 'flightOutputs.flags', [...FLAG_KEYS, ...(Object.hasOwn(flagsRaw, 'terminationReason') ? ['terminationReason'] : [])]);
  if (!VALIDITY_LEVELS.includes(flagsRaw.validity as Validity)) throw new Error('flightOutputs.flags.validity is not a validity state');
  const flags: SavedFlightOutputFlags = {
    validity: flagsRaw.validity as Validity,
    enveloped: bool(flagsRaw.enveloped, 'flightOutputs.flags.enveloped'),
    offNominalExcursion: bool(flagsRaw.offNominalExcursion, 'flightOutputs.flags.offNominalExcursion'),
    landingNominal: bool(flagsRaw.landingNominal, 'flightOutputs.flags.landingNominal'),
  };
  if (Object.hasOwn(flagsRaw, 'terminationReason')) {
    if (flagsRaw.terminationReason !== 'touchdown' && flagsRaw.terminationReason !== 'timeout') {
      throw new Error('flightOutputs.flags.terminationReason must be touchdown or timeout');
    }
    flags.terminationReason = flagsRaw.terminationReason;
  }
  const landing = landingAvailability({ summary: { landingNominal: flags.landingNominal }, terminationReason: flags.terminationReason });
  if (!landing.available) {
    for (const id of SAVED_FLIGHT_LANDING_OUTPUT_IDS) {
      if (outputs[id]?.available) {
        throw new Error(`flightOutputs.outputs.${id} cannot be available when ${landing.reason}`);
      }
    }
  }
  let sampledMaxQ: SavedSampledMaxQ | undefined;
  if (Object.hasOwn(root, 'sampledMaxQ')) {
    const peak = record(root.sampledMaxQ, 'flightOutputs.sampledMaxQ');
    exact(peak, 'flightOutputs.sampledMaxQ', [...PEAK_KEYS, ...(Object.hasOwn(peak, 'maxObservedGapS') ? ['maxObservedGapS'] : [])]);
    const time = finite(peak.time, 'flightOutputs.sampledMaxQ.time');
    if (time < 0) throw new Error('flightOutputs.sampledMaxQ.time must be nonnegative');
    const sampleCount = count(peak.sampleCount, 'flightOutputs.sampledMaxQ.sampleCount');
    if (sampleCount > MAX_SAVED_TELEMETRY_POINTS) {
      throw new Error(`flightOutputs.sampledMaxQ.sampleCount exceeds ${MAX_SAVED_TELEMETRY_POINTS} retained samples`);
    }
    const validSampleCount = count(peak.validSampleCount, 'flightOutputs.sampledMaxQ.validSampleCount');
    if (validSampleCount > sampleCount) throw new Error('flightOutputs.sampledMaxQ.validSampleCount cannot exceed sampleCount');
    let maxObservedGapS: number | undefined;
    if (Object.hasOwn(peak, 'maxObservedGapS')) {
      maxObservedGapS = finite(peak.maxObservedGapS, 'flightOutputs.sampledMaxQ.maxObservedGapS');
      if (maxObservedGapS < 0) throw new Error('flightOutputs.sampledMaxQ.maxObservedGapS must be nonnegative');
    }
    sampledMaxQ = { time, sampleCount, validSampleCount, ...(maxObservedGapS === undefined ? {} : { maxObservedGapS }) };
  }
  return { dictionaryRevision, outputs, flags, ...(sampledMaxQ === undefined ? {} : { sampledMaxQ }) };
}
