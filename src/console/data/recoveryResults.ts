import type { Confidence, FlightRun, Result, RunSummary } from './contract';
import type { SavedFlightOutputs } from '../../application/savedFlightOutputs';
import { landingAvailability, type LandingAvailability, type LandingRecord } from '../../application/flightLanding';

type RecordedRecovery = LandingRecord & {
  summary: Pick<FlightRun['summary'], 'landingNominal'> & Partial<Pick<FlightRun['summary'], 'apogeeTime' | 'flightTime'>>;
  events: ReadonlyArray<FlightRun['events'][number]>;
};
export type RecordedDescentInterval =
  | { available: true; seconds: number; apogeeTimeS: number; touchdownTimeS: number }
  | { available: false; reason: string };

export const OUTPUT_DICTIONARY_REVISION = 'RMP10-C06/2';

const SUMMARY_OUTPUT_IDS = [
  'apogee', 'apogeeTime', 'maxSpeed', 'maxMach', 'maxAccelG', 'maxQ',
  'railExitSpeed', 'burnoutAltitude', 'landingSpeed', 'landingEnergy',
  'drift', 'flightTime', 'weathercockAngleDeg',
] as const satisfies readonly (keyof RunSummary)[];
export type FlightOutputId = (typeof SUMMARY_OUTPUT_IDS)[number] | 'apogeeToTouchdown';
export interface FlightOutputTrace {
  /** Canonical SI value, or null when unavailable/non-finite. Never display-rounded. */
  value: number | null;
  unit: string;
  confidence: Confidence;
  reason?: string;
  available: boolean;
  unavailableReason?: string;
}
export type FlightOutputDictionary = Partial<Record<FlightOutputId, FlightOutputTrace>>;

const CONFIDENCE_ORDER: readonly Confidence[] = ['measured', 'calibrated', 'modeled', 'extrapolated', 'unknown'];

function tracedResult(result: Result, availability: LandingAvailability): FlightOutputTrace {
  const unavailableReason = !availability.available ? availability.reason
    : !Number.isFinite(result.value) ? 'recorded value is not finite' : undefined;
  return {
    value: unavailableReason === undefined ? result.value : null,
    unit: result.unit,
    confidence: result.confidence,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
    available: unavailableReason === undefined,
    ...(unavailableReason === undefined ? {} : { unavailableReason }),
  };
}

export type FlightOutputRun = RecordedRecovery & { summary: RunSummary };

function descentBasis(run: FlightOutputRun): Pick<Result, 'unit' | 'confidence' | 'reason'> {
  const apogee = run.summary.apogeeTime, end = run.summary.flightTime;
  if (!apogee || !end) return { unit: 's', confidence: 'unknown', reason: 'Both recorded clock results are required.' };
  // The event itself is native modeled evidence; measured clock carriers alone
  // cannot promote the interval above that terminal-event basis.
  const confidence = CONFIDENCE_ORDER[Math.max(CONFIDENCE_ORDER.indexOf(apogee.confidence),
    CONFIDENCE_ORDER.indexOf(end.confidence), CONFIDENCE_ORDER.indexOf('modeled'))];
  return {
    unit: 's', confidence,
    reason: 'Recorded touchdown event time minus recorded apogee time; recovery deployment markers are not substituted. Qualification is the least-qualified of the two retained clocks and the modeled native touchdown event.',
  };
}

/**
 * Canonical numeric outputs for the Build trace. Values and qualification come
 * from the same RunSummary and recorded-interval helpers consumed by readouts;
 * this projection adds explicit availability without recomputing physics.
 */
export function flightOutputDictionary(run: FlightOutputRun): FlightOutputDictionary {
  const outputs: FlightOutputDictionary = {};
  const landing = landingAvailability(run);
  for (const id of SUMMARY_OUTPUT_IDS) {
    const result = run.summary[id] as Result | undefined;
    if (!result) continue;
    outputs[id] = tracedResult(result, id === 'landingSpeed' || id === 'landingEnergy' ? landing : { available: true });
  }
  const descent = recordedDescentInterval(run);
  const basis = descentBasis(run);
  outputs.apogeeToTouchdown = tracedResult(
    { value: descent.available ? descent.seconds : Number.NaN, ...basis },
    descent.available ? { available: true } : { available: false, reason: descent.reason },
  );
  return outputs;
}

/**
 * The immutable canonical dictionary archived with a saved case: the same
 * values/qualification the Build trace and readouts use, plus the run flags
 * and sampled-peak context they were recorded under. Old documents simply
 * lack this field; nothing is reconstructed for them.
 */
export function savedFlightOutputs(run: FlightRun): SavedFlightOutputs {
  const events = Array.isArray(run.events) ? run.events : [];
  return {
    dictionaryRevision: OUTPUT_DICTIONARY_REVISION,
    outputs: flightOutputDictionary({ ...run, events }),
    flags: {
      validity: run.summary.validity,
      enveloped: run.summary.enveloped,
      offNominalExcursion: run.summary.offNominalExcursion,
      landingNominal: run.summary.landingNominal,
      ...(run.terminationReason === undefined ? {} : { terminationReason: run.terminationReason }),
    },
    ...(run.sampledMaxQ === undefined ? {} : { sampledMaxQ: { ...run.sampledMaxQ } }),
  };
}

/** Recorded clocks only. Deployment time is not substituted for physical-peak time. */
export function recordedDescentInterval(run: RecordedRecovery): RecordedDescentInterval {
  const unavailable = (reason: string): RecordedDescentInterval => ({ available: false, reason });
  const landing = landingAvailability(run);
  if (!landing.available) return landing;
  const touchdowns = run.events.filter(e => e.kind === 'touchdown' && e.derived !== true);
  if (touchdowns.length !== 1) return unavailable('one recorded touchdown event is required');
  const apogee = run.summary.apogeeTime?.value;
  const touchdown = touchdowns[0].t;
  const end = run.summary.flightTime?.value;
  if (typeof apogee !== 'number' || typeof end !== 'number'
    || ![apogee, touchdown, end].every(t => Number.isFinite(t) && t >= 0)) {
    return unavailable('recorded event clocks are invalid');
  }
  if (touchdown < apogee || touchdown !== end) return unavailable('recorded event clocks are inconsistent');
  return { available: true, seconds: touchdown - apogee, apogeeTimeS: apogee, touchdownTimeS: touchdown };
}
