// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SavedRuns } from './SavedRuns';
import { FlightStage } from './Flight';
import { committedRun, consoleActions, useConsoleJobs } from '../store';
import { exportableProject, adoptProject, useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { useSessionStore } from '../../state/session';
import { readProject, writeProject } from '../../formats/projectJson';
import { CERTIFIED_MOTORS } from '../../propulsion/motorDatabase';
import { activeTestEngine, chunkLandings, consoleJobStub, flightResult, flightResultForRequest, stubEngine } from '../testFixtures';
import type { DragCalibration } from '../../application/dragCalibration';
import { savedTelemetryFixture } from '../../application/savedTelemetry.fixture';
import type { SavedFlightOutputs } from '../../application/savedFlightOutputs';
import type { LegacyRunInputs } from '../../application/runInputs';

let teardown: () => void;
beforeEach(() => {
  teardown = stubEngine().teardown;
  useProjectStore.getState().loadPreset('estesAlpha');
  useAnalysisStore.getState().reset();
  consoleJobStub();
});
afterEach(() => { cleanup(); teardown(); });

const imported = () => {
  const motor = { ...structuredClone(CERTIFIED_MOTORS.estes_c6), id: 'my_c6', designation: 'My C6' };
  return useProjectStore.getState().addMotorRecord({ id: motor.id, motor,
    provenance: { source: 'import', sourceFile: 'team.eng', sourceSha256: 'c'.repeat(64), note: 'Original curve' } }, 'Import', true);
};

describe('saved run vertical slice', () => {
  it('clears completed ensemble display on load; undo restores terminal analysis without resurrecting job chrome', async () => {
    useConsoleJobs.getState().runMonteCarlo(4);
    await waitFor(() => expect(useAnalysisStore.getState().completed.ensemble?.status).toBe('completed'));
    const completed = useAnalysisStore.getState().completed.ensemble;
    expect(useConsoleJobs.getState().jobs.mc?.partial?.landings).toHaveLength(4);
    const saved = exportableProject().cases[0];
    const epoch = useProjectStore.getState().projectEpoch;
    render(<FlightStage />);
    const tab = screen.getByRole('tab', { name: /Monte Carlo/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    const ledger = document.querySelector('[data-mc-outcome-counts]');
    expect(ledger?.textContent).toContain('Requested 4');
    expect(ledger?.textContent).toContain('Supported nominal 4');
    expect(ledger?.textContent).toContain('Time-limit endpoint 0');
    expect(ledger?.textContent).toContain('Computational failure 0');
    act(() => { expect(useProjectStore.getState().loadSavedRun(saved.id)).toBe(true); });
    expect(useProjectStore.getState().projectEpoch).toBe(epoch + 1);
    expect(useAnalysisStore.getState().records.ensemble).toBeNull();
    expect(useAnalysisStore.getState().completed.ensemble).toBeNull();
    expect(useConsoleJobs.getState().jobs.mc).toBeNull();
    expect(useConsoleJobs.getState().mcAbort).toBeNull();
    expect(screen.getByText('No dispersion yet')).toBeTruthy();
    expect(exportableProject().cases).toHaveLength(1);
    act(() => useProjectStore.getState().undo());
    expect(useProjectStore.getState().projectEpoch).toBe(epoch + 2);
    expect(useAnalysisStore.getState().completed.ensemble).toBe(completed);
    expect(useConsoleJobs.getState().jobs.mc).toBeNull();
    expect(screen.getByText('No dispersion yet')).toBeTruthy();
    act(() => useProjectStore.getState().redo());
    expect(useProjectStore.getState().projectEpoch).toBe(epoch + 3);
    expect(useAnalysisStore.getState().records.ensemble).toBeNull();
    expect(useAnalysisStore.getState().completed.ensemble).toBeNull();
    expect(useAnalysisStore.getState().history).toHaveLength(1);
    expect(useConsoleJobs.getState().jobs.mc).toBeNull();
    expect(screen.getByText('No dispersion yet')).toBeTruthy();
  });

  it('detaches a just-completed result on load, retaining history; undo intentionally restores the old terminal context', async () => {
    await useConsoleJobs.getState().run();
    const completed = useAnalysisStore.getState().completed.flight;
    const saved = exportableProject().cases[0];
    consoleActions.setOptions({ railLength: 8 }, 'Variant');
    expect(useProjectStore.getState().loadSavedRun(saved.id)).toBe(true);
    expect(committedRun()).toBeNull();
    expect(useAnalysisStore.getState().records.flight).toBeNull();
    expect(useAnalysisStore.getState().history).toHaveLength(1);
    expect(exportableProject().cases).toHaveLength(1);
    useProjectStore.getState().undo();
    expect(useAnalysisStore.getState().completed.flight).toBe(completed);
    expect(useProjectStore.getState().project.workspace.launch.railLengthM).toBe(8);
    useProjectStore.getState().redo();
    expect(committedRun()).toBeNull();
    expect(useAnalysisStore.getState().history).toHaveLength(1);
  });
  it('freezes exact dispatch inputs while the vehicle, same-ID curve, calibration and settings change in flight', async () => {
    const id = imported();
    const calibration: DragCalibration = { scale: 0.9, fittedCd: 0.5, modelCd: 0.55, rmseN: 0.1, coastMassKg: 0.05,
      source: { fileName: 'reviewed.csv', sha256Hex: 'e'.repeat(64), rowCount: 400 },
      window: { startS: 2.3, endS: 7.2, method: 'velocity-column', pointsUsed: 300, pointsExcluded: 10 }, appliedAt: '2026-10-20T10:00:00Z' };
    const before = useProjectStore.getState();
    useProjectStore.setState({ project: { ...before.project, dragCalibration: calibration }, shearPa: 4e9 });
    let finish!: (value: ReturnType<typeof flightResult>) => void;
    let dispatched: Record<string, unknown> | undefined;
    activeTestEngine().invoke = async (cmd, args) => {
      if (cmd !== 'simulate_flight') throw new Error(`Unexpected ${cmd}`);
      dispatched = structuredClone(args);
      return new Promise<ReturnType<typeof flightResult>>((resolve) => { finish = resolve; });
    };
    const pending = useConsoleJobs.getState().run();
    // Dispatch now checks the fit engine identity at the async boundary.
    await waitFor(() => expect(dispatched).toBeDefined());
    const started = useAnalysisStore.getState().records.flight!.runInputs!;
    consoleActions.setOptions({ railLength: 8, windSpeedSurface: 19 }, 'Changed after dispatch');
    consoleActions.setMission({ name: 'Later mission' }, 'Mission');
    const current = useProjectStore.getState();
    const alteredMotor = structuredClone(current.motors[id]);
    alteredMotor.motor.thrustCurve[1].thrust += 3;
    useProjectStore.setState({ motors: { ...current.motors, [id]: alteredMotor },
      project: { ...current.project, vehicle: { ...current.project.vehicle, name: 'Later airframe' }, dragCalibration: { ...calibration, scale: 1.1 } }, shearPa: 9e9 });
    finish(flightResultForRequest(dispatched));
    await pending;
    const reopened = readProject(writeProject(exportableProject()));
    const archive = reopened.cases[0].inputs as LegacyRunInputs;
    expect(archive).toEqual(started);
    expect(archive.motorRecord.motor).toEqual(dispatched!.motor);
    expect(archive.motorRecord.provenance).toMatchObject({ sourceFile: 'team.eng', sourceSha256: 'c'.repeat(64) });
    expect(archive.dragCalibration).toEqual(calibration);
    expect(archive.finShearModulusPa).toBe(4e9);
    expect(archive.engineOptions).toMatchObject(dispatched!.options!);
    expect(archive.reportMomentArmHistory).toBe(true);
    expect(archive.reportMomentArmHistory).toBe(dispatched!.reportMomentArmHistory);
    expect(reopened.cases[0].momentArmHistory).toEqual(flightResultForRequest(dispatched).momentArmHistory);
    expect(archive.vehicle.name).not.toBe('Later airframe');
    expect(archive.context.mission.name).not.toBe('Later mission');
  });

  it('captures vehicle-derived defaults when workspace site altitude differs and the vehicle has no site', async () => {
    const state = useProjectStore.getState();
    const { launchSite: _site, ...vehicle } = state.project.vehicle;
    useProjectStore.setState({ project: { ...state.project, vehicle,
      workspace: { ...state.project.workspace, site: { ...state.project.workspace.site, altitudeASLM: 1500 } } } });
    await useConsoleJobs.getState().run();
    const inputs = exportableProject().cases[0].inputs as LegacyRunInputs;
    expect(inputs.engineOptions.launchAltitudeASL).toBe(0);
    expect(inputs.context.workspace.site.altitudeASLM).toBe(1500);
    expect(inputs.engineOptions.dragCdScale).toBe(1);
    expect(inputs.dragCalibration).toBeUndefined();
    expect(() => writeProject(exportableProject())).not.toThrow();
  });

  it('reopens, compares saved baseline/variant values and explicitly loads and reruns the old custom curve', async () => {
    const id = imported();
    await useConsoleJobs.getState().run();
    const firstCurve = structuredClone((exportableProject().cases[0].inputs as LegacyRunInputs).motorRecord.motor.thrustCurve);
    const state = useProjectStore.getState();
    const edited = structuredClone(state.motors[id]);
    edited.motor.thrustCurve[1].thrust += 4;
    useProjectStore.setState({ motors: { ...state.motors, [id]: edited } });
    activeTestEngine().invoke = async (_cmd,args) => flightResultForRequest(args,{ apogeeAltitude: 1400 });
    await useConsoleJobs.getState().run();
    const saved = readProject(writeProject(exportableProject()));
    useAnalysisStore.getState().reset();
    adoptProject(saved);
    render(<SavedRuns />);
    fireEvent.change(screen.getByLabelText('Saved baseline'), { target: { value: saved.cases[0].id } });
    fireEvent.change(screen.getByLabelText('Saved variant'), { target: { value: saved.cases[1].id } });
    expect(screen.getByRole('table', { name: /Canonical flight outputs/ })).toBeTruthy();
    expect(screen.getByText(/Engine identity comparison unknown/)).toBeTruthy();
    const apogeeRow = [...within(screen.getByRole('table', { name: /Canonical flight outputs/ }))
      .getByText('Apogee').closest('tr')!.querySelectorAll('td')].map(td => td.textContent ?? '');
    expect(apogeeRow[2]).toBe('+29 m');
    expect(screen.getByRole('region', { name: 'Saved input comparison' })).toBeTruthy();
    expect(screen.getByText(/\["motor"\]\["thrustCurve"\]\[1\]\["thrust"\]/)).toBeTruthy();
    expect(screen.getAllByText('Explicit recorded legacy model selection; not physical qualification.')).toHaveLength(2);
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Load saved inputs' })[0]);
    expect(screen.getByRole('status').textContent).toMatch(/compute a fresh result/);
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    let rerunMotor: any;
    activeTestEngine().invoke = async (_cmd, args) => { rerunMotor = args?.motor; return flightResultForRequest(args); };
    await act(async () => { await useConsoleJobs.getState().run(); });
    expect(rerunMotor.thrustCurve).toEqual(firstCurve);
    expect(useAnalysisStore.getState().history).toHaveLength(1);
    expect(exportableProject().cases).toHaveLength(3);
  });

  it('shows original archived options rather than later live values, without changing history', async () => {
    await useConsoleJobs.getState().run();
    const saved = structuredClone(exportableProject().cases);
    const inputs = saved[0].inputs as LegacyRunInputs;
    consoleActions.setOptions({ windSpeedSurface: 27, railLength: 14 }, 'Later live inputs');
    render(<SavedRuns />);
    const assumptions = document.querySelector('[data-archived-assumptions]')!;
    expect(assumptions.textContent).toContain(`surface wind ${inputs.engineOptions.windSpeedSurface} m/s`);
    expect(assumptions.textContent).not.toContain('surface wind 27 m/s');
    expect(assumptions.textContent).toContain(`${inputs.engineOptions.launchAltitudeASL} m ASL`);
    expect(assumptions.textContent).toContain('legacy global powered/coast airframe adjustment');
    expect(assumptions.textContent).toContain('profiles/mission/requested settings are context');
    expect(exportableProject().cases).toEqual(saved);
    expect(useAnalysisStore.getState().history).toHaveLength(1);
  });

  it('does not invent a v1 declaration or compare unlike run kinds as numerical deltas', async () => {
    await useConsoleJobs.getState().run();
    const saved = structuredClone(exportableProject());
    const original = saved.cases[0];
    // Construct a genuine old-format fixture: v1 could not record this new
    // request/history. Real migrations never strip these fields to make it fit.
    const legacyOriginal = original.inputs as LegacyRunInputs;
    const { flightModel: _model, reportMomentArmHistory: _request, ...payload } = legacyOriginal;
    original.inputs = { ...payload, version: 1 } as LegacyRunInputs;
    delete original.momentArmHistory;
    delete original.flightOutputs;
    // An ensemble never carried flight telemetry or a timeline; do not copy the flight's.
    const { inputs: _inputs, events: _events, telemetry: _telemetry, ...summaryOnly } = original;
    saved.cases.push({ ...summaryOnly, id: 'legacy-ensemble', kind: 'monteCarlo',
      summary: { ...original.summary, apogeeM: Number(original.summary!.apogeeM) + 25 } });
    useAnalysisStore.getState().reset(); adoptProject(readProject(writeProject(saved)));
    render(<SavedRuns />);
    expect(screen.getByText('Legacy model implied by archive v1; original selection not recorded.')).toBeTruthy();
    expect(screen.getByText(/Historical model and assumptions unknown/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Saved baseline'), { target: { value: original.id } });
    fireEvent.change(screen.getByLabelText('Saved variant'), { target: { value: 'legacy-ensemble' } });
    expect(screen.getByText(/Input comparison is unknown/)).toBeTruthy();
    expect(screen.getByText(/Different run kinds/)).toBeTruthy();
    expect(within(screen.getByRole('table', { name: /Historical summaries/ })).queryByText('25.0000')).toBeNull();
    expect(exportableProject().cases[0].inputs).not.toHaveProperty('flightModel');
    expect(exportableProject().cases[1].inputs).toBeUndefined();
    expect(useAnalysisStore.getState().history).toHaveLength(0);
  });

  it('archives actual MC seed/count/sigmas/version and reruns them after later settings change', async () => {
    const initial = useProjectStore.getState();
    useProjectStore.setState({ project: { ...initial.project, workspace: { ...initial.project.workspace,
      ensemble: { ...initial.project.workspace.ensemble, seed: 12345, version: 'legacy-sequential-v1', windAzimuthDegSigma: 7 } } } });
    let argsFirst: any;
    activeTestEngine().invoke = async (_cmd, args) => { argsFirst = args; const req = args!.req as any; return chunkLandings(req.runStart, req.runEnd); };
    useConsoleJobs.getState().runMonteCarlo(4);
    await waitFor(() => expect(useAnalysisStore.getState().history).toHaveLength(1));
    const saved = readProject(writeProject(exportableProject()));
    expect((saved.cases[0].inputs as LegacyRunInputs).ensemble).toMatchObject({ seed: 12345, nRuns: 4, version: 'per-run-v2', windAzimuthDegSigma: 7 });
    expect((saved.cases[0].inputs as LegacyRunInputs).context.workspace.ensemble.version).toBe('legacy-sequential-v1');
    useAnalysisStore.getState().reset();
    adoptProject(saved);
    expect(useProjectStore.getState().loadSavedRun(saved.cases[0].id)).toBe(true);
    let argsRerun: any;
    activeTestEngine().invoke = async (_cmd, args) => { argsRerun = args; const req = args!.req as any; return chunkLandings(req.runStart, req.runEnd); };
    useConsoleJobs.getState().runMonteCarlo(4);
    await waitFor(() => expect(useAnalysisStore.getState().history).toHaveLength(1));
    expect(argsRerun).toEqual(argsFirst);
    expect(() => writeProject(exportableProject())).not.toThrow();
  });

  it('withholds saved landing values and deltas for non-nominal or timed-out runs, with the recorded reason', async () => {
    const outcomes = [{}, { touchdownNominal: false, landingVelocity: 30, landingKineticEnergy: 900 },
      { terminated: false, terminationReason: 'timeout' as const, touchdownNominal: false, landingVelocity: 41, landingKineticEnergy: 1600 },
      { landingVelocity: 6.1, landingKineticEnergy: 20.2 }];
    for (const overrides of outcomes) {
      activeTestEngine().invoke = async (_cmd, args) => flightResultForRequest(args, overrides);
      await useConsoleJobs.getState().run();
    }
    const saved = readProject(writeProject(exportableProject()));
    expect(saved.cases).toHaveLength(4);
    expect(saved.cases.map(c => c.summary?.terminationReason)).toEqual(['touchdown', 'touchdown', 'timeout', 'touchdown']);
    expect(saved.cases.map(c => c.summary?.landingEnergyJ)).toEqual([14.2, 900, 1600, 20.2]);
    useAnalysisStore.getState().reset(); adoptProject(saved);
    render(<SavedRuns />);
    const compare = (variant: number) => {
      fireEvent.change(screen.getByLabelText('Saved baseline'), { target: { value: saved.cases[0].id } });
      fireEvent.change(screen.getByLabelText('Saved variant'), { target: { value: saved.cases[variant].id } });
      const table = screen.getByRole('table', { name: /Canonical flight outputs/ });
      return (metric: string) => [...within(table).getByText(metric).closest('tr')!.querySelectorAll('td')].map(td => td.textContent ?? '');
    };
    // The archive keeps ONE interval in the canonical dictionary, never in summary.
    expect(saved.cases[0].summary).not.toHaveProperty('apogeeToTouchdown');
    expect(Object.keys(saved.cases[0].flightOutputs!.outputs)).toEqual(expect.arrayContaining(['apogeeToTouchdown']));
    let row = compare(1);
    expect(row('Landing speed')).toEqual(['5.1m/s', 'N/A — no nominal touchdown', 'N/A']);
    expect(row('Landing energy')).toEqual(['14J', 'N/A — no nominal touchdown', 'N/A']);
    expect(row('Apogee → touchdown')).toEqual(['155.7s', 'N/A — no nominal touchdown', 'N/A']);
    row = compare(2);
    expect(row('Landing speed')).toEqual(['5.1m/s', 'N/A — run stopped on its time limit', 'N/A']);
    expect(row('Landing energy')[2]).toBe('N/A');
    expect(row('Apogee → touchdown')).toEqual(['155.7s', 'N/A — run stopped on its time limit', 'N/A']);
    row = compare(3);
    expect(row('Landing speed')).toEqual(['5.1m/s', '6.1m/s', '+1.0 m/s']);
    expect(row('Landing energy')).toEqual(['14J', '20J', '+6 J']);
    // A suppressed small/equal delta stays blank rather than showing a fabricated zero.
    expect(row('Apogee')[2]).toBe('');
  });

  it('keeps old saved runs without termination metadata comparable only on an affirmative nominal flag', async () => {
    await useConsoleJobs.getState().run();
    activeTestEngine().invoke = async (_cmd, args) => flightResultForRequest(args, { landingVelocity: 7.1 });
    await useConsoleJobs.getState().run();
    const saved = structuredClone(exportableProject());
    for (const entry of saved.cases) { delete entry.summary!.terminationReason; delete entry.flightOutputs; }
    delete saved.cases[1].summary!.landingNominal;
    useAnalysisStore.getState().reset(); adoptProject(readProject(writeProject(saved)));
    render(<SavedRuns />);
    fireEvent.change(screen.getByLabelText('Saved baseline'), { target: { value: saved.cases[0].id } });
    fireEvent.change(screen.getByLabelText('Saved variant'), { target: { value: saved.cases[1].id } });
    const table = screen.getByRole('table', { name: /Historical summaries/ });
    const cells = [...within(table).getByText('landingSpeedMps').closest('tr')!.querySelectorAll('td')].map(td => td.textContent);
    expect(cells).toEqual(['5.1', 'N/A — no nominal touchdown', 'N/A — no nominal touchdown']);
    // Legacy summaries never gain an interval row and therefore never leak an
    // interval delta from a record whose clocks were not archived.
    expect(within(table).queryByText('Apogee → touchdown')).toBeNull();
  });

  it('plots only retained historical samples and leaves an older case explicitly unavailable', async () => {
    await useConsoleJobs.getState().run();
    const saved = structuredClone(exportableProject());
    const current = saved.cases[0];
    current.engineIdentity = { kind: 'production-rust-wasm', sha256: 'd'.repeat(64) };
    current.telemetry = savedTelemetryFixture();
    const old = structuredClone(current);
    old.id = 'old-summary-only';
    delete old.telemetry;
    saved.cases.push(old);
    useAnalysisStore.getState().reset();
    adoptProject(readProject(writeProject(saved)));
    render(<SavedRuns />);

    const card = (id: string) => document.querySelector(`[data-saved-run-id="${id}"]`) as HTMLElement;
    const plot = within(card(current.id)).getByRole('img', { name: /Historical trajectory/ });
    expect(plot.getAttribute('data-sample-count')).toBe('2');
    expect(plot.textContent).toContain('historical record, not a fresh simulation');
    expect(card(current.id).textContent).toContain('last 1.40 s');
    expect(within(card(old.id)).queryByRole('img', { name: /Historical trajectory/ })).toBeNull();
    expect(card(old.id).textContent).toContain('Historical telemetry unavailable — not retained');
    expect(card(old.id).textContent).toContain('never reconstructed');
    expect(useAnalysisStore.getState().history).toHaveLength(0);
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
  });

  it('shows exact recorded events of a reopened saved flight and never fills them in for an older record', async () => {
    await useConsoleJobs.getState().run();
    await useConsoleJobs.getState().run();
    const saved = readProject(writeProject(exportableProject()));
    expect(saved.cases[0].events?.map(e => e.kind)).toEqual(['ignition', 'rail_exit', 'burnout', 'max_q', 'apogee_drogue', 'main', 'touchdown']);
    delete saved.cases[1].events;
    useAnalysisStore.getState().reset(); adoptProject(readProject(writeProject(saved)));
    render(<SavedRuns />);
    const card = (id: string) => document.querySelector(`[data-saved-run-id="${id}"]`) as HTMLElement;
    const table = within(card(saved.cases[0].id)).getByRole('table', { name: /Recorded events/ });
    const row = (label: string) => [...within(table).getByText(label).closest('tr')!.querySelectorAll('td')].map(td => td.textContent);
    expect(row('Rail exit')).toEqual(['1.4', '3.66', '27.5']);
    expect(row('Sampled Max-Q')).toEqual(['3.2', '480', '300']);
    expect(row('Touchdown')).toEqual(['198.2', '0', '5.1']);
    expect(card(saved.cases[0].id).textContent).toMatch(/recovery activation marker/);
    expect(within(card(saved.cases[1].id)).queryByRole('table', { name: /Recorded events/ })).toBeNull();
    expect(card(saved.cases[1].id).textContent).toContain('Recorded events unavailable for this run');
    expect(useAnalysisStore.getState().history).toHaveLength(0);
  });

  it('compares canonical flight outputs with the live unit, qualification and delta policy', async () => {
    await useConsoleJobs.getState().run();
    activeTestEngine().invoke = async (_cmd, args) => flightResultForRequest(args, {
      apogeeAltitude: 1400, landingVelocity: 0, landingKineticEnergy: 0 });
    await useConsoleJobs.getState().run();
    const saved = readProject(writeProject(exportableProject()));
    useAnalysisStore.getState().reset();
    adoptProject(saved);
    useSessionStore.getState().setUnits('imperial');
    render(<SavedRuns />);
    fireEvent.change(screen.getByLabelText('Saved baseline'), { target: { value: saved.cases[0].id } });
    fireEvent.change(screen.getByLabelText('Saved variant'), { target: { value: saved.cases[1].id } });
    const table = screen.getByRole('table', { name: /Canonical flight outputs/ });
    const row = (label: string) => [...within(table).getByText(label).closest('tr')!.querySelectorAll('td')].map(td => td.textContent ?? '');
    expect(screen.queryByRole('table', { name: /Historical summaries/ })).toBeNull();
    expect(row('Apogee')[0]).toMatch(/4,498\s*ft/);
    expect(row('Apogee')[1]).toMatch(/4,593\s*ft/);
    expect(row('Apogee')[2]).toMatch(/\+95\s*ft/);
    // An actual zero is available and shown; it is not confused with unavailable null.
    expect(row('Landing speed')[1]).toMatch(/^0\s*ft\/s/);
    expect(row('Landing speed')[2]).toMatch(/−17\s*ft\/s/);
    expect(row('Landing energy')[1]).toMatch(/^0\s*ft·lbf/);
    // Outputs that only exist in the canonical dictionary are compared too.
    expect(row('Burnout altitude')[0]).toMatch(/\s*ft/);
    expect(row('Incidence at rail exit')[0]).toMatch(/°/);
    expect(row('Sampled Max-Q')[0]).toMatch(/psi/);
    expect(within(table).getByLabelText(/^Landing speed 0 ft\/s, Modeled/)).toBeTruthy();
    useSessionStore.getState().setUnits('metric');
  });

  it('withholds canonical landing values and deltas when either record is unavailable', async () => {
    await useConsoleJobs.getState().run();
    activeTestEngine().invoke = async (_cmd, args) => flightResultForRequest(args, {
      touchdownNominal: false, landingVelocity: 30, landingKineticEnergy: 900 });
    await useConsoleJobs.getState().run();
    const saved = readProject(writeProject(exportableProject()));
    useAnalysisStore.getState().reset();
    adoptProject(saved);
    render(<SavedRuns />);
    fireEvent.change(screen.getByLabelText('Saved baseline'), { target: { value: saved.cases[0].id } });
    fireEvent.change(screen.getByLabelText('Saved variant'), { target: { value: saved.cases[1].id } });
    const table = screen.getByRole('table', { name: /Canonical flight outputs/ });
    const row = (label: string) => [...within(table).getByText(label).closest('tr')!.querySelectorAll('td')].map(td => td.textContent ?? '');
    expect(row('Landing speed')[1]).toBe('N/A — no nominal touchdown');
    expect(row('Landing speed')[2]).toBe('N/A');
    expect(row('Landing energy')[1]).toBe('N/A — no nominal touchdown');
    expect(row('Apogee')[2]).toBe('');
  });

  it('keeps summary-only records historical and unqualified instead of upgrading them with current defaults', async () => {
    await useConsoleJobs.getState().run();
    await useConsoleJobs.getState().run();
    const saved = structuredClone(exportableProject());
    delete saved.cases[1].flightOutputs;
    useAnalysisStore.getState().reset();
    adoptProject(readProject(writeProject(saved)));
    render(<SavedRuns />);
    fireEvent.change(screen.getByLabelText('Saved baseline'), { target: { value: saved.cases[0].id } });
    fireEvent.change(screen.getByLabelText('Saved variant'), { target: { value: saved.cases[1].id } });
    expect(screen.queryByRole('table', { name: /Canonical flight outputs/ })).toBeNull();
    const historical = screen.getByRole('table', { name: /Historical summaries/ });
    expect(within(historical).getByText(/historical/i)).toBeTruthy();
    expect(screen.getByText(/No canonical per-output dictionary was archived/)).toBeTruthy();
    expect(exportableProject().cases[1]).not.toHaveProperty('flightOutputs');
  });

  it('discloses a retained empty telemetry series as its own user-visible state', async () => {
    await useConsoleJobs.getState().run();
    const saved = structuredClone(exportableProject());
    saved.cases[0].engineIdentity = { kind: 'production-rust-wasm', sha256: 'd'.repeat(64) };
    saved.cases[0].telemetry = [];
    useAnalysisStore.getState().reset();
    adoptProject(readProject(writeProject(saved)));
    render(<SavedRuns />);
    const card = document.querySelector(`[data-saved-run-id="${saved.cases[0].id}"]`) as HTMLElement;
    expect(card.textContent).toContain('retained as an empty series');
    expect(within(card).queryByRole('img', { name: /Historical trajectory/ })).toBeNull();
  });

  it('shows the archived off-nominal flag and dictionary revision without inventing a value for old records', async () => {
    activeTestEngine().invoke = async (_cmd, args) => flightResultForRequest(args, { offNominalExcursion: true, validity: 'UNKNOWN' });
    await useConsoleJobs.getState().run();
    await useConsoleJobs.getState().run();
    const saved = structuredClone(exportableProject());
    delete saved.cases[1].flightOutputs;
    useAnalysisStore.getState().reset();
    adoptProject(readProject(writeProject(saved)));
    render(<SavedRuns />);
    const card = (id: string) => document.querySelector(`[data-saved-run-id="${id}"]`) as HTMLElement;
    expect(card(saved.cases[0].id).textContent).toContain('RMP10-C06/2');
    const flags = card(saved.cases[0].id).querySelector('[data-output-flags]')!;
    expect(flags.textContent).toContain('off-nominal excursion yes');
    expect(flags.textContent).toContain('Validity UNKNOWN');
    expect(card(saved.cases[1].id).querySelector('[data-output-flags]')).toBeNull();
    expect(card(saved.cases[1].id).textContent).not.toContain('off-nominal excursion no');
  });

  it('withholds a delta when stored canonical units disagree instead of subtracting unlike units', async () => {
    await useConsoleJobs.getState().run();
    await useConsoleJobs.getState().run();
    const saved = structuredClone(exportableProject());
    saved.cases[0].flightOutputs!.outputs.apogee = { ...saved.cases[0].flightOutputs!.outputs.apogee!, value: 1000, unit: 'm' };
    saved.cases[1].flightOutputs!.outputs.apogee = { ...saved.cases[1].flightOutputs!.outputs.apogee!, value: 3000, unit: 'ft' };
    useAnalysisStore.getState().reset();
    adoptProject(saved);
    render(<SavedRuns />);
    fireEvent.change(screen.getByLabelText('Saved baseline'), { target: { value: saved.cases[0].id } });
    fireEvent.change(screen.getByLabelText('Saved variant'), { target: { value: saved.cases[1].id } });
    const table = screen.getByRole('table', { name: /Canonical flight outputs/ });
    const cells = [...within(table).getByText('Apogee').closest('tr')!.querySelectorAll('td')].map(td => td.textContent ?? '');
    expect(cells[0]).toBe('1,000m');
    expect(cells[1]).toContain('3000 ft');
    expect(cells[1]).toContain('non-canonical unit');
    expect(cells[2]).toBe('—');
    expect(within(table).getByTitle(/delta withheld/)).toBeTruthy();
  });

  it.each([
    ['timeout', (outputs: SavedFlightOutputs) => { outputs.flags.terminationReason = 'timeout'; }, 'N/A — run stopped on its time limit'],
    ['non-nominal', (outputs: SavedFlightOutputs) => { outputs.flags.landingNominal = false; }, 'N/A — no nominal touchdown'],
  ] as const)('withholds canonical landing values advertised as available when flags say %s', async (_label, mutate, reason) => {
    await useConsoleJobs.getState().run();
    await useConsoleJobs.getState().run();
    const saved = structuredClone(exportableProject());
    const variant = saved.cases[1].flightOutputs!;
    mutate(variant);
    variant.outputs.landingSpeed = { value: 0, unit: 'm/s', confidence: 'modeled', available: true };
    variant.outputs.landingEnergy = { value: 0, unit: 'J', confidence: 'modeled', available: true };
    variant.outputs.apogeeToTouchdown = { value: 0, unit: 's', confidence: 'modeled', available: true };
    useAnalysisStore.getState().reset();
    adoptProject(saved);
    render(<SavedRuns />);
    fireEvent.change(screen.getByLabelText('Saved baseline'), { target: { value: saved.cases[0].id } });
    fireEvent.change(screen.getByLabelText('Saved variant'), { target: { value: saved.cases[1].id } });
    const table = screen.getByRole('table', { name: /Canonical flight outputs/ });
    const row = (label: string) => [...within(table).getByText(label).closest('tr')!.querySelectorAll('td')].map(td => td.textContent ?? '');
    expect(row('Landing speed')).toEqual(['5.1m/s', reason, 'N/A']);
    expect(row('Landing energy')).toEqual(['14J', reason, 'N/A']);
    // A record that advertises an available numeric interval cannot override the
    // archived flags: neither the value nor a delta may appear.
    expect(row('Apogee → touchdown')).toEqual(['155.7s', reason, 'N/A']);
    const card = document.querySelector(`[data-saved-run-id="${saved.cases[1].id}"]`) as HTMLElement;
    expect(within(card).getAllByText(reason).length).toBeGreaterThan(0);
  });
});
