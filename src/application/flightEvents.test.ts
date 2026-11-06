import { describe, expect, it } from 'vitest';
import { EVENT_LABEL, parseSavedFlightEvents } from './flightEvents';

type Raw = Record<string, unknown>[];

function savedEventsFixture(): Raw {
  return [
    { t: 0, kind: 'ignition', label: 'Ignition', altitude: 0, velocity: 0 },
    { t: 0.31, kind: 'rail_exit', label: 'Rail exit', altitude: 3, velocity: 18.9 },
    { t: 2.82, kind: 'burnout', label: 'Burnout', altitude: 160, velocity: 98.9 },
    { t: 3.1, kind: 'max_q', label: 'Sampled Max-Q', altitude: 190, velocity: 97, derived: true },
    { t: 12.4, kind: 'apogee_drogue', label: 'Apogee · drogue', altitude: 532, velocity: 4.1 },
    { t: 50, kind: 'main', label: 'Main', altitude: 213, velocity: 14.6 },
    { t: 67.85, kind: 'touchdown', label: 'Touchdown', altitude: 0, velocity: 5.95 },
  ];
}

describe('saved flight events', () => {
  it('accepts the adapter timeline exactly, including signed zero and equal times', () => {
    const events = savedEventsFixture();
    events[1].t = 0; events[0].velocity = -0;
    const parsed = parseSavedFlightEvents(events);
    expect(parsed).toEqual(events);
    expect(Object.is(parsed[0].velocity, -0)).toBe(true);
    expect(parsed).not.toBe(events);
    expect(parseSavedFlightEvents([])).toEqual([]);
  });

  it('labels come from one canonical map', () => {
    for (const e of savedEventsFixture()) expect(EVENT_LABEL[e.kind as keyof typeof EVENT_LABEL]).toBe(e.label);
  });

  it.each([
    ['not an array', (_e: Raw) => ({})],
    ['unknown kind', (e: Raw) => { e[1].kind = 'stage'; return e; }],
    ['relabelled kind', (e: Raw) => { e[2].label = 'Motor burnout'; return e; }],
    ['extra key', (e: Raw) => { e[2].note = 'x'; return e; }],
    ['missing key', (e: Raw) => { delete e[2].altitude; return e; }],
    ['non-finite value', (e: Raw) => { e[2].velocity = null; return e; }],
    ['negative time', (e: Raw) => { e[0].t = -1; return e; }],
    ['out of order', (e: Raw) => { e[2].t = 0.1; return e; }],
    ['derived flag on a native event', (e: Raw) => { e[2].derived = true; return e; }],
    ['max_q without derived flag', (e: Raw) => { delete e[3].derived; return e; }],
    ['derived false', (e: Raw) => { e[3].derived = false; return e; }],
    ['over cap', (_e: Raw) => Array.from({ length: 65 }, () => ({ t: 0, kind: 'ignition', label: 'Ignition', altitude: 0, velocity: 0 }))],
  ])('refuses %s', (_name, mutate) => {
    expect(() => parseSavedFlightEvents(mutate(savedEventsFixture()))).toThrow();
  });
});
