// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup, within } from '@testing-library/react';
import { SimFlightOverlay } from './SimFlightOverlay';
import { useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { consoleActions, currentRunKey, designOf, type FlightPayload } from '../store';
import { toFlightRun } from '../data/adapter';
import { flightResult, resetConsoleState } from '../testFixtures';
import realExcerptCsv from '../../../docs/flight-validation/cosmic-cargo-2986-excerpt.csv?raw';

function commitSim(inputKey = currentRunKey()!, validity: 'PASS' | 'FAIL' | 'UNKNOWN' = 'PASS'): number {
  const store = useProjectStore.getState();
  const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
  const fixture = flightResult();
  const result = flightResult({
    apogeeAltitude: 300, apogeeTime: 30, flightDuration: 60, validity,
    telemetry: Array.from({ length: 61 }, (_, time) => ({
      ...fixture.telemetry![0], time,
      altitude: time <= 30 ? 10 * time : 10 * (60 - time),
      position: { x: 0, y: 0, z: time <= 30 ? 10 * time : 10 * (60 - time) },
    })),
  });
  const token = useAnalysisStore.getState().start('flight', inputKey);
  const payload: FlightPayload = { design, run: toFlightRun(result, design.vehicle, undefined, inputKey, 1, 1), previous: null };
  useAnalysisStore.getState().resolve('flight', token, payload);
  return token;
}

const CSV_260 = (() => {
  const rows = ['time_s,altitude_m'];
  for (let t = 0; t <= 60; t += 2) {
    const alt = t <= 30 ? (260 * t) / 30 : Math.max(0, 260 * (1 - (t - 30) / 30));
    rows.push(`${t},${alt.toFixed(1)}`);
  }
  return rows.join('\n');
})();

const CSV_DIPS = (() => {
  const rows = ['time_s,altitude_m'];
  for (let t = 0; t <= 60; t += 2) {
    let alt = t <= 30 ? (300 * t) / 30 : Math.max(0, 300 * (1 - (t - 30) / 30));
    if ((t >= 15 && t <= 20) || (t >= 40 && t <= 45)) alt = Math.max(0, alt - 60);
    rows.push(`${t},${alt.toFixed(1)}`);
  }
  return rows.join('\n');
})();

function addFlightLog(csv: string = CSV_260): void {
  fireEvent.change(screen.getByLabelText(/flight log data/i), { target: { value: csv } });
  fireEvent.click(screen.getByRole('button', { name: /add flight log/i }));
}

beforeEach(() => resetConsoleState());
afterEach(() => { cleanup(); resetConsoleState(); });

describe('SimFlightOverlay inspect pane', () => {
  it('layers an ingested CSV alongside the recorded native curve', async () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    await screen.findByLabelText(/layer simulated altitude/i);
    expect(screen.getByLabelText(/layer flight 1/i)).toBeTruthy();
    const plot = screen.getByRole('img', { name: /altitude overlay/i });
    expect(plot.getAttribute('aria-label')).toMatch(/sim.*flight 1/i);
  });

  it('rejects garbage without discarding a previously ingested log', () => {
    render(<SimFlightOverlay />);
    addFlightLog();
    addFlightLog('not,a,log\nzzz');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText(/layer flight 1/i)).toBeTruthy();
    expect(screen.queryByLabelText(/layer flight 2/i)).toBeNull();
  });

  it('promotes an older log back to current on demand', () => {
    render(<SimFlightOverlay />);
    addFlightLog();
    addFlightLog(CSV_DIPS);
    fireEvent.click(screen.getByRole('button', { name: 'Make Flight 1 (CSV) current' }));
    expect(screen.getByRole('button', { name: 'Make Flight 2 (CSV) current' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make Flight 1 (CSV) current' })).toBeNull();
  });

  it('unchecking a layer removes that series from the plot', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    const plot = () => screen.getByRole('img', { name: /altitude overlay/i }).getAttribute('aria-label') ?? '';
    expect(plot()).toMatch(/flight 1/i);
    fireEvent.click(screen.getByLabelText(/layer flight 1/i));
    expect(plot()).not.toMatch(/flight 1/i);
    expect(plot()).toMatch(/sim/i);
  });

  it('moves the shared time cursor from the slider', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    fireEvent.change(screen.getByLabelText(/overlay time cursor/i), { target: { value: '30' } });
    expect((screen.getByLabelText(/overlay time cursor/i) as HTMLInputElement).value).toBe('30');
  });

  it('withholds stale telemetry after a launch-input edit and restores it on undo', () => {
    commitSim();
    render(<SimFlightOverlay />);
    expect(screen.getByRole('checkbox', { name: /layer simulated altitude/i })).toBeTruthy();
    const wind = useProjectStore.getState().project.workspace.launch.windSpeedMps;
    act(() => consoleActions.setOptions({ windSpeedSurface: wind + 3 }, 'Change wind'));
    expect(screen.queryByRole('checkbox', { name: /layer simulated altitude/i })).toBeNull();
    act(() => consoleActions.undo());
    expect(screen.getByRole('checkbox', { name: /layer simulated altitude/i })).toBeTruthy();
  });

  it('renders each run record with separate execution, validity, freshness and gate labels', () => {
    commitSim();
    render(<SimFlightOverlay />);
    const fields = document.querySelector('[data-run-record-fields="true"]');
    expect(fields).not.toBeNull();
    const labels = within(fields as HTMLElement);
    expect(labels.getByText('Execution: completed')).toBeTruthy();
    expect(labels.getByText('Validity: PASS')).toBeTruthy();
    expect(labels.getByText('Freshness: current')).toBeTruthy();
    expect(labels.getByText('No gate evaluated')).toBeTruthy();
  });

  it('relabels the chosen record freshness from current to stale after an input edit', () => {
    commitSim();
    render(<SimFlightOverlay />);
    const currentFields = within(document.querySelector('[data-run-record-fields="true"]') as HTMLElement);
    expect(currentFields.getByText('Freshness: current')).toBeTruthy();
    const wind = useProjectStore.getState().project.workspace.launch.windSpeedMps;
    act(() => consoleActions.setOptions({ windSpeedSurface: wind + 3 }, 'Change wind'));
    const staleFields = within(document.querySelector('[data-run-record-fields="true"]') as HTMLElement);
    expect(staleFields.queryByText('Freshness: current')).toBeNull();
    expect(staleFields.getByText('Freshness: stale')).toBeTruthy();
  });

  it('never draws a FAIL native run as a valid comparison baseline', () => {
    commitSim(currentRunKey()!, 'FAIL');
    render(<SimFlightOverlay />);
    expect(screen.queryByRole('checkbox', { name: /layer simulated altitude/i })).toBeNull();
    expect(screen.queryByRole('img', { name: /altitude overlay: sim/i })).toBeNull();
    expect(screen.queryByText(/^pass$/i)).toBeNull();
  });

  it('never draws an UNKNOWN native run as a valid comparison baseline', () => {
    commitSim(currentRunKey()!, 'UNKNOWN');
    render(<SimFlightOverlay />);
    expect(screen.queryByRole('checkbox', { name: /layer simulated altitude/i })).toBeNull();
    expect(screen.queryByRole('img', { name: /altitude overlay: sim/i })).toBeNull();
    expect(screen.queryByText(/^pass$/i)).toBeNull();
  });

  it('selects immutable archived telemetry and requalifies it against current inputs', () => {
    const current = commitSim();
    const stale = commitSim('other-input-key');
    render(<SimFlightOverlay />);
    expect(screen.queryByRole('checkbox', { name: /layer simulated altitude/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: `Make Flight ${current} current` }));
    expect(screen.getByRole('checkbox', { name: /layer simulated altitude/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `Make Flight ${stale} current` }));
    expect(screen.queryByRole('checkbox', { name: /layer simulated altitude/i })).toBeNull();
    expect(useAnalysisStore.getState().history.map((record) => record.inputKey)).toEqual([currentRunKey(), 'other-input-key']);
  });
});
describe('SimFlightOverlay compare pane', () => {
  function openCompare() {
    fireEvent.click(screen.getByRole('tab', { name: /compare/i }));
  }

  it('summarizes match/mismatch with deltas for sim vs a lower log', async () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    await screen.findByRole('checkbox', { name: /layer simulated altitude/i });
    openCompare();
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-1' } });
    expect(screen.getByText(/mismatch/i)).toBeTruthy();
    expect(screen.getByText(/Δapogee 40\.0 m/)).toBeTruthy();
  });

  it('withholds deltas and flags the pair when alignment is removed', async () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    await screen.findByRole('checkbox', { name: /layer simulated altitude/i });
    openCompare();
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-1' } });
    fireEvent.click(screen.getByRole('button', { name: /aligned/i }));
    expect(screen.getByText(/unaligned — raw times/i)).toBeTruthy();
    expect(screen.queryByText(/Δapogee/i)).toBeNull();
  });

  it('re-runs on tolerance blur: widening the band clears mismatches', async () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    await screen.findByRole('checkbox', { name: /layer simulated altitude/i });
    openCompare();
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-1' } });
    expect(screen.getByText(/\d+ match \/ [1-9]\d* mismatch/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/absolute tolerance/i), { target: { value: '100' } });
    fireEvent.blur(screen.getByLabelText(/absolute tolerance/i));
    expect(screen.getByText(/0 mismatch/i)).toBeTruthy();
  });

  it('navigates out-of-tolerance regions and reports position', async () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog(CSV_DIPS);
    await screen.findByRole('checkbox', { name: /layer simulated altitude/i });
    openCompare();
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-1' } });
    expect(screen.getByText(/region 1 of/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next out-of-tolerance/i }));
    expect(screen.getByText(/region 2 of/i)).toBeTruthy();
  });

  it('stays empty-state until both pickers resolve', () => {
    commitSim();
    render(<SimFlightOverlay />);
    openCompare();
    expect(screen.getByText(/pick a baseline and a compare-to/i)).toBeTruthy();
  });

  it('ingests the real Altimeter Cloud excerpt (metadata + ms) and compares it to sim', async () => {
    // Workflow closure at the UI surface: the committed real-log excerpt — 15
    // metadata rows, `Time(ms),Altitude(m)` header, millisecond times — pastes
    // through the same ingest path as any flight log, then meets the committed
    // sim run in the compare pane. Recorded 2026-09-28: the excerpt parses to a
    // 59-sample pad-idle series (t = -8.766..-7.567 s, max 0.014 m), so against
    // the 300 m sim apogee the aligned deltas read Δapogee 300.0 m and the pair
    // reports mismatch with an out-of-tolerance region — the UI renders the real
    // format end to end instead of only synthetic CSVs.
    commitSim();
    render(<SimFlightOverlay />);
    fireEvent.change(screen.getByLabelText(/flight log data/i), {
      target: { value: realExcerptCsv as unknown as string },
    });
    fireEvent.click(screen.getByRole('button', { name: /add flight log/i }));
    await screen.findByRole('checkbox', { name: /layer flight 1/i });
    expect(screen.queryByRole('alert')).toBeNull();
    await screen.findByRole('checkbox', { name: /layer simulated altitude/i });
    openCompare();
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-1' } });
    expect(screen.getByText(/mismatch/i)).toBeTruthy();
    expect(screen.getByText(/300\.0 m/)).toBeTruthy();
    expect(screen.getByText(/region 1 of/i)).toBeTruthy();
  });

  it('compares two flight logs when no committed sim run has telemetry', () => {
    // No committed run: the sim side is absent, but the pattern-7 contract
    // still compares log-vs-log end to end.
    render(<SimFlightOverlay />);
    addFlightLog();
    addFlightLog(CSV_DIPS);
    openCompare();
    fireEvent.change(screen.getByLabelText(/baseline series/i), { target: { value: 'flight-1' } });
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-2' } });
    expect(screen.getByText(/\d+ match \//i)).toBeTruthy();
    expect(screen.getByRole('img', { name: /signed difference/i })).toBeTruthy();
  });
});
