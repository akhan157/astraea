// @vitest-environment jsdom
import { Tooltip } from 'radix-ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResultsTable, LaunchInspector, FlightInspector } from './Flight';
import { SiteEditor } from './SiteEditor';
import { useProjectStore, serializeProject, openProjectJson } from '../../state/project';
import { consoleActions } from '../store';
import { toFlightRun } from '../data/adapter';
import { flightResult, pinLegacyFlightDrag } from '../testFixtures';
import { recordEvidence } from '../evidence/ProjectLedger';

afterEach(cleanup);
beforeEach(() => { useProjectStore.getState().loadPreset('estesAlpha'); pinLegacyFlightDrag(); });

describe('Console engineering boundaries', () => {
  it('commits a complete launch site, rejects empty input, and clears to engine defaults', () => {
    consoleActions.setVehicle({ launchSite: undefined }, 'Clear');
    render(<SiteEditor />);
    fireEvent.click(screen.getByText('Apply launch site'));
    expect(useProjectStore.getState().project.vehicle.launchSite).toBeUndefined();
    expect(screen.getByRole('alert').textContent).toContain('finite altitude');
    fireEvent.change(screen.getByLabelText('Launch site altitude in metres above sea level'), { target: { value: '1143' } });
    fireEvent.click(screen.getByText('Apply launch site'));
    expect(useProjectStore.getState().project.vehicle.launchSite).toEqual({ altitudeM: 1143 });
    fireEvent.click(screen.getByText('Clear launch site'));
    consoleActions.setOptions({ windSpeedSurface: 3 }, 'Wind');
    expect('launchSite' in useProjectStore.getState().project.vehicle).toBe(false);
  });

  it('rejects elevations outside the retained atmosphere range', () => {
    render(<SiteEditor />);
    const input = screen.getByLabelText('Launch site altitude in metres above sea level');
    const original = useProjectStore.getState().project.vehicle.launchSite;
    for (const value of ['-1', '1000000000']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByText('Apply launch site'));
      expect(screen.getByRole('alert').textContent).toContain('0 to 20,000');
      expect(useProjectStore.getState().project.vehicle.launchSite).toEqual(original);
    }
    fireEvent.change(input, { target: { value: '20000' } });
    fireEvent.click(screen.getByText('Apply launch site'));
    expect(useProjectStore.getState().project.vehicle.launchSite).toEqual({ altitudeM: 20000 });
  });

  it('derives Max-Q and attitude from native samples and withholds touchdown gates on an abnormal termination', () => {
    const vehicle = useProjectStore.getState().project.vehicle;
    const result = flightResult({ touchdownNominal: false });
    const run = toFlightRun(result, vehicle, 'certified', 'key', 1, 1);
    expect(run.events.find((e) => e.kind === 'max_q')?.t).toBe(3.2);
    expect(run.summary.maxQ?.value).toBe(54000);
    expect(run.series.attitude[2]).toEqual(result.telemetry[2].q);
    expect(run.gates.find((gate) => gate.id === 'landing_energy')).toBeUndefined();
    expect(run.gates.find((gate) => gate.id === 'landing_speed')?.status).toBe('unknown');
  });

  it('explains effective travel and renders old-run Max-Q metadata fallback', () => {
    const run = toFlightRun(flightResult(), useProjectStore.getState().project.vehicle, undefined, 'key', 1, 1);
    delete run.sampledMaxQ;
    const { unmount } = render(<Tooltip.Provider><ResultsTable run={run} /></Tooltip.Provider>);
    expect(screen.getByText(/Sample timing metadata is unavailable/).textContent).toContain('no continuous-peak');
    unmount();
    render(<LaunchInspector />);
    expect(screen.getByText('Effective guide travel')).toBeTruthy();
    expect(screen.getByText(/Physical rail length alone/)).toBeTruthy();
    // Guide-travel input is a scalar: the note must keep stating that partial guide
    // constraints and tip-off are unmodeled and must not imply rail-button geometry.
    const note = screen.getByText(/Partial guide constraints and tip-off are not modeled/).textContent ?? '';
    expect(note).toMatch(/Displacement from the initial position to modeled full release/);
    expect(note).not.toMatch(/button|lug/i);
  });

  it('preserves imported evidence bytes and review through a project save/open', async () => {
    const raw = 'time_s,altitude_m\n0,0\n1,20\n2,0\n';
    await recordEvidence(raw, 'altimeter-csv', 'flight.csv', 3);
    const serialized = serializeProject();
    useProjectStore.getState().loadPreset('spaceport');
    openProjectJson(serialized);
    const record = useProjectStore.getState().project.ledger[0];
    expect(record.rawText).toBe(raw);
    expect(record.sourceFileName).toBe('flight.csv');
    expect(record.sampleCount).toBe(3);
    expect(record.review).toBe('unreviewed');
  });
});

describe('Site temperature and the default launch summary (accuracy bundle)', () => {
  it('applies and clears the pad temperature together with the altitude', () => {
    render(<SiteEditor />);
    fireEvent.change(screen.getByLabelText('Launch site altitude in metres above sea level'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Launch site air temperature in degrees Celsius'), { target: { value: '30' } });
    fireEvent.click(screen.getByText('Apply launch site'));
    expect(useProjectStore.getState().project.vehicle.launchSite).toEqual({ altitudeM: 400, temperatureC: 30 });
    expect(screen.getByText('400 m ASL, 30 °C')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Launch site air temperature in degrees Celsius'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Apply launch site'));
    expect(useProjectStore.getState().project.vehicle.launchSite).toEqual({ altitudeM: 400 });
  });

  it('refuses a non-finite temperature without touching the stored site', () => {
    consoleActions.setVehicle({ launchSite: { altitudeM: 400 } }, 'Site');
    render(<SiteEditor />);
    fireEvent.change(screen.getByLabelText('Launch site air temperature in degrees Celsius'), { target: { value: 'warm' } });
    fireEvent.click(screen.getByText('Apply launch site'));
    expect(screen.getByRole('alert').textContent).toContain('Enter a finite temperature in °C, or leave it empty.');
    expect(useProjectStore.getState().project.vehicle.launchSite).toEqual({ altitudeM: 400 });
  });

  it('shows no temperature line by default and one when a temperature is set', () => {
    const defaultRun = toFlightRun(flightResult(), useProjectStore.getState().project.vehicle, 'certified', 'key', 1, 1);
    const { unmount } = render(<Tooltip.Provider><FlightInspector /></Tooltip.Provider>);
    expect(screen.queryByText('Site temperature')).toBeNull();
    expect(defaultRun.physicsOptions).toBeUndefined();
    unmount();

    consoleActions.setVehicle({ launchSite: { altitudeM: 400, temperatureC: 30 } }, 'Site');
    render(<Tooltip.Provider><FlightInspector /></Tooltip.Provider>);
    expect(screen.getByText('Site temperature')).toBeTruthy();
  });
});
