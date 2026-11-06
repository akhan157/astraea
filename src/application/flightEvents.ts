/**
 * The flight event timeline exactly as the console adapter builds it from a
 * native result, and its strict parser for saved project cases. Saved events
 * are a historical record of one run; nothing here interpolates, repairs,
 * reorders or reconstructs an event.
 */
import type { FlightEvent, FlightEventKind } from '../console/data/contract';

/** Canonical timeline labels; the adapter and saved-case parser share them. */
export const EVENT_LABEL: Readonly<Record<FlightEventKind, string>> = {
  ignition: 'Ignition',
  rail_exit: 'Rail exit',
  burnout: 'Burnout',
  max_q: 'Sampled Max-Q',
  apogee_drogue: 'Apogee \u00b7 drogue',
  main: 'Main',
  touchdown: 'Touchdown',
};

/** Far above the seven timeline events a run produces; bounds hostile files. */
export const MAX_SAVED_EVENTS = 64;

const NATIVE_KEYS = ['altitude', 'kind', 'label', 't', 'velocity'];
const DERIVED_KEYS = ['altitude', 'derived', 'kind', 'label', 't', 'velocity'];

/**
 * Strict copy of a saved event list. Sampled Max-Q is the only derived event
 * (from bounded display samples) and must say so; native events must not.
 */
export function parseSavedFlightEvents(raw: unknown): FlightEvent[] {
  if (!Array.isArray(raw)) throw new Error('events must be an array');
  if (raw.length > MAX_SAVED_EVENTS) throw new Error(`events exceed ${MAX_SAVED_EVENTS} entries`);
  let previous = 0;
  return raw.map((entry: unknown, i) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error(`events[${i}] must be an object`);
    const kind = 'kind' in entry ? entry.kind : undefined;
    if (typeof kind !== 'string' || !Object.hasOwn(EVENT_LABEL, kind)) throw new Error(`events[${i}].kind is not a timeline event`);
    const k = kind as FlightEventKind;
    const keys = Object.keys(entry).sort();
    const expected = k === 'max_q' ? DERIVED_KEYS : NATIVE_KEYS;
    if (keys.length !== expected.length || keys.some((key, j) => key !== expected[j])) {
      throw new Error(`events[${i}] must have exactly ${expected.join(', ')}`);
    }
    const record = entry as Record<string, unknown>;
    if (k === 'max_q' && record.derived !== true) throw new Error(`events[${i}] sampled Max-Q must be marked derived`);
    if (record.label !== EVENT_LABEL[k]) throw new Error(`events[${i}].label must be '${EVENT_LABEL[k]}'`);
    const { t, altitude, velocity } = record;
    if (typeof t !== 'number' || typeof altitude !== 'number' || typeof velocity !== 'number'
      || ![t, altitude, velocity].every(Number.isFinite)) {
      throw new Error(`events[${i}] time, altitude and velocity must be finite numbers`);
    }
    if (t < 0 || t < previous) throw new Error(`events[${i}].t must be nonnegative and non-decreasing`);
    previous = t;
    return { t, kind: k, label: EVENT_LABEL[k], altitude, velocity, ...(k === 'max_q' ? { derived: true } : {}) };
  });
}
