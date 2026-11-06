// @vitest-environment jsdom
import { Tooltip } from 'radix-ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { RecoveryStage } from './Recovery';
import { ResultsTable } from './Flight';
import { BuildInspector } from './Build';
import { useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { currentRunKey, designOf, type FlightPayload } from '../store';
import { recordedDescentInterval, savedFlightOutputs, OUTPUT_DICTIONARY_REVISION } from '../data/recoveryResults';
import { toFlightRun } from '../data/adapter';
import type { FlightRun } from '../data/contract';
import { flightResult, resetConsoleState, stubEngine } from '../testFixtures';

let teardown: () => void;
beforeEach(() => { teardown = stubEngine().teardown; resetConsoleState(); });
afterEach(() => { cleanup(); teardown(); });

function run(): FlightRun {
  const fixture = flightResult();
  return toFlightRun(flightResult({ apogeeTime: 10, flightDuration: 30,
    events: fixture.events.map(e => ({ ...e, time: e.name === 'Apogee & Drogue Deployment' ? 13
      : e.name === 'Main Parachute Deployment' ? 20 : e.name === 'Ground Touchdown' ? 30 : e.time })),
  }), useProjectStore.getState().project.vehicle, undefined, currentRunKey()!, 2, 1);
}
function install(current: FlightRun, previous: FlightRun | null = null) {
  const s = useProjectStore.getState();
  const token = useAnalysisStore.getState().start('flight', current.inputKey);
  useAnalysisStore.getState().resolve('flight', token, {
    run: current, previous, design: designOf(s.project, s.mission, s.shearPa),
  } satisfies FlightPayload);
}
function intervalStat() { return screen.getByText('Apogee → touchdown').parentElement!; }
function landingRow(label: string) { return screen.getByText(label, { selector: '[role="cell"]' }).closest<HTMLElement>('[role="row"]')!; }
function buildTrace() {
  const view = render(<BuildInspector />);
  const trace = JSON.parse(view.container.querySelector('pre')!.textContent ?? '{}') as {
    simulation: {
      outputs: Record<string, { value: number | null; unit: string; confidence: string; available: boolean; unavailableReason?: string }>;
      outputDictionary: { revision: string; document: string };
      sampledMaxQ: unknown;
      offNominalExcursion: boolean;
    };
    gates: Array<{ id: string; value: number | null; unit: string; confidence: string; reason: string; valueReason?: string }>;
  };
  view.unmount();
  return trace;
}

describe('recorded recovery outputs', () => {
  it('uses recorded apogee, not delayed deployment, for the descent interval', () => {
    install(run()); render(<Tooltip.Provider><RecoveryStage /></Tooltip.Provider>);
    expect(intervalStat().textContent).toMatch(/20(?:\.0+)?\s*s/);
    expect(intervalStat().textContent).not.toMatch(/17(?:\.0+)?\s*s/);
  });
  it('never invents zero or negative descent time from absent touchdown', () => {
    const current = run(); current.summary.landingNominal = false;
    current.events = current.events.filter(e => e.kind !== 'touchdown');
    install(current); render(<Tooltip.Provider><RecoveryStage /></Tooltip.Provider>);
    expect(intervalStat().textContent).toContain('N/A');
  });
  it('shows the missing-touchdown reason independently of the nominal flag branch', () => {
    const current = run(); current.events = current.events.filter(e => e.kind !== 'touchdown');
    install(current); render(<Tooltip.Provider><RecoveryStage /></Tooltip.Provider>);
    expect(intervalStat().textContent).toContain('N/A — one recorded touchdown event is required');
  });
  it('does not require a chute-deployment marker to use recorded nominal apogee/touchdown', () => {
    const current = run(); current.events = current.events.filter(e => e.kind !== 'apogee_drogue');
    install(current); render(<Tooltip.Provider><RecoveryStage /></Tooltip.Provider>);
    expect(intervalStat().textContent).toMatch(/20(?:\.0+)?\s*s/);
  });
  it.each(['current', 'previous'] as const)('suppresses landing deltas when %s landing is non-nominal', which => {
    const current = run(), previous = run(); previous.rev = 1;
    previous.summary.landingSpeed.value = 10;
    previous.summary.landingEnergy.value = 30;
    (which === 'current' ? current : previous).summary.landingNominal = false;
    install(current, previous); render(<Tooltip.Provider><ResultsTable run={current} /></Tooltip.Provider>);
    for (const label of ['Landing speed', 'Landing energy']) {
      expect(landingRow(label).querySelector('[title="Change since the committed run"]')).toBeNull();
      expect(within(landingRow(label)).getAllByRole('cell')[2].textContent).toBe('N/A');
    }
  });
  it('withholds landing values and deltas on an explicit timeout despite a conflicting nominal flag', () => {
    const current = run(), previous = run(); current.terminationReason = 'timeout';
    previous.summary.landingSpeed.value = 10; previous.summary.landingEnergy.value = 30;
    current.summary.apogee.value = 1200;
    install(current, previous);
    const recovery = render(<Tooltip.Provider><RecoveryStage /></Tooltip.Provider>);
    expect(intervalStat().textContent).toContain('N/A — run stopped on its time limit');
    for (const label of ['Landing speed', 'Landing energy']) {
      expect(within(intervalStat().parentElement!).getByText(label).parentElement!.textContent).toContain('N/A — run stopped on its time limit');
    }
    recovery.unmount();
    render(<Tooltip.Provider><ResultsTable run={current} /></Tooltip.Provider>);
    for (const label of ['Landing speed', 'Landing energy']) {
      const cells = within(landingRow(label)).getAllByRole('cell');
      expect(cells[1].textContent).toBe('N/A — run stopped on its time limit');
      expect(cells[2].textContent).toBe('N/A');
    }
    const apogee = screen.getByText('Apogee', { selector: '[role="cell"]' }).closest('[role="row"]')!;
    expect(apogee.querySelector('[title="Change since the committed run"]')).not.toBeNull();
  });
  it('still renders actual landing deltas when both records report nominal touchdown', () => {
    const current = run(), previous = run(); previous.rev = 1;
    previous.summary.landingSpeed.value = 10;
    previous.summary.landingEnergy.value = 30;
    install(current, previous); render(<Tooltip.Provider><ResultsTable run={current} /></Tooltip.Provider>);
    for (const label of ['Landing speed', 'Landing energy']) {
      expect(landingRow(label).querySelector('[title="Change since the committed run"]')).not.toBeNull();
    }
  });
  it('exports the same recovery value, SI unit and confidence shown by the readout', () => {
    const current = run(); install(current);
    const recovery = render(<Tooltip.Provider><RecoveryStage /></Tooltip.Provider>);
    const grid = intervalStat().parentElement!;
    expect(within(grid).getByLabelText(/^Landing speed /).getAttribute('aria-label')).toContain('m/s, Modeled');
    expect(within(grid).getByLabelText(/^Landing energy /).getAttribute('aria-label')).toContain('J, Modeled');
    expect(within(grid).getByLabelText(/^Drift /).getAttribute('aria-label')).toContain('m, Extrapolated');
    expect(intervalStat().textContent).toMatch(/20(?:\.0+)?\s*s/);
    recovery.unmount();

    const trace = buildTrace(), outputs = trace.simulation.outputs;
    expect(trace.simulation.outputDictionary).toEqual({ revision: 'RMP10-C06/2', document: 'docs/internal/output-dictionary.md', units: 'canonical SI; null when unavailable; no display rounding' });
    expect(trace.simulation.sampledMaxQ).toEqual(current.sampledMaxQ);
    for (const id of ['landingSpeed', 'landingEnergy', 'drift'] as const) {
      expect(outputs[id]).toMatchObject({ value: current.summary[id].value, unit: current.summary[id].unit,
        confidence: current.summary[id].confidence, available: true });
    }
    expect(outputs.apogeeToTouchdown).toMatchObject({ value: 20, unit: 's', confidence: 'modeled', available: true });
  });
  it('uses one recorded interval for the readout, the exported trace and the archived dictionary', () => {
    const current = run(); install(current);
    const interval = recordedDescentInterval(current);
    if (!interval.available) throw new Error('fixture interval must be available');
    const recovery = render(<Tooltip.Provider><RecoveryStage /></Tooltip.Provider>);
    expect(screen.getAllByText('Apogee → touchdown')).toHaveLength(1);
    expect(intervalStat().textContent).toContain(`${interval.seconds}`);
    recovery.unmount();
    const outputs = buildTrace().simulation.outputs;
    expect(outputs.apogeeToTouchdown).toMatchObject({ value: interval.seconds, available: true, unit: 's' });
    const archived = savedFlightOutputs(current);
    expect(archived.outputs.apogeeToTouchdown).toEqual(outputs.apogeeToTouchdown);
    expect(archived.dictionaryRevision).toBe(OUTPUT_DICTIONARY_REVISION);
    expect(Object.keys(archived.outputs).filter((id) => /touchdown|descent/i.test(id))).toEqual(['apogeeToTouchdown']);
    // The Flight comparison has no interval row, so it cannot render a second,
    // differently-gated delta for the same recorded clocks.
    render(<Tooltip.Provider><ResultsTable run={current} /></Tooltip.Provider>);
    expect(screen.queryByText('Apogee → touchdown')).toBeNull();
  });
  it('exports the retained native off-nominal flag instead of deriving it from the badge', () => {
    const current = run();
    current.summary.offNominalExcursion = true;
    install(current);
    expect(buildTrace().simulation.offNominalExcursion).toBe(true);
  });
  it('exports null landing and descent values with the same timeout reason as the readout', () => {
    const current = run(); current.terminationReason = 'timeout'; install(current);
    const recovery = render(<Tooltip.Provider><RecoveryStage /></Tooltip.Provider>);
    expect(intervalStat().textContent).toContain('N/A — run stopped on its time limit');
    recovery.unmount();

    const outputs = buildTrace().simulation.outputs;
    for (const id of ['landingSpeed', 'landingEnergy', 'apogeeToTouchdown'] as const) {
      expect(outputs[id]).toMatchObject({ value: null, available: false, unavailableReason: 'run stopped on its time limit' });
    }
  });
  it('keeps exported gate values and qualification on the canonical result instead of independently rounding them', () => {
    const current = run();
    const gate = current.gates.find(g => g.id === 'landing_speed')!;
    gate.value.value = 5.123456789;
    install(current);
    expect(buildTrace().gates.find(g => g.id === 'landing_speed')).toMatchObject({
      value: gate.value.value, unit: gate.value.unit, confidence: gate.value.confidence, reason: gate.reason, valueReason: gate.value.reason,
    });
  });
});
