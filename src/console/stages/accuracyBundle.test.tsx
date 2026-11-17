/**
 * Accuracy bundle: the UI surfaces (Gate 1 review, amendment 4).
 *
 * The default UI must not change. A project with none of the four physics
 * inputs renders the Flight Results tab, the Monte Carlo tab, the Build model &
 * evidence panel and the launch summary exactly as before; each new line
 * appears only for a run that actually sent a new option. One DOM test per
 * surface asserts the default first, so a future edit that shows the line
 * unconditionally fails here.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import type { RocketVehicle } from '../../core/types';
import { useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { AERO_MODEL_VERSION } from '../../application/aeroModel';
import { LEGACY_FLIGHT_MODEL } from '../../application/flightModel';
import { consoleActions, designOf, useConsoleJobs } from '../store';
import { consoleJobStub, resetConsoleState, stubEngine } from '../testFixtures';
import { flightResult } from '../testFixtures';
import { toFlightRun } from '../data/adapter';
import type { Dispersion } from '../data/contract';
import { FlightStage, ResultsTable } from './Flight';
import { ModelStatusPanel } from '../evidence/ModelStatusPanel';
import { AeroControls } from './AeroControls';
import { PartInspector } from '../shell/Inspector';
import { useSessionStore } from '../../state/session';

const BETA = Object.freeze({ modelId: 'aero-buildup' as const, modelVersion: AERO_MODEL_VERSION, terms: Object.freeze({ transonic: 'legacy' as const }) });

function vehicle(): RocketVehicle {
  return useProjectStore.getState().project.vehicle;
}

function runWith(patch: (v: RocketVehicle) => void = () => {}) {
  const v = structuredClone(vehicle());
  patch(v);
  return toFlightRun(flightResult(), v, 'certified', 'key', 1, 1);
}


/** Commit a completed legacy flight into the analysis store without a job run. */
function seedCommittedRun(design: ReturnType<typeof designOf>): void {
  useAnalysisStore.setState((state) => ({
    completed: {
      ...state.completed,
      flight: {
        kind: 'flight', status: 'completed', inputKey: 'key', token: 1,
        startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z', error: null,
        payload: { model: 'legacy', design, run: runWith(), previous: null },
      },
    },
  }));
}

let teardown: () => void;
beforeEach(() => {
  const stub = stubEngine();
  teardown = stub.teardown;
  resetConsoleState();
  consoleJobStub();
});
afterEach(() => {
  cleanup();
  teardown();
  useSessionStore.getState().setSelectedId(null);
});

describe('Flight Results tab', () => {
  it('shows no axial-drag line for a default run', () => {
    const run = runWith();
    render(<Tooltip.Provider><ResultsTable run={run} /></Tooltip.Provider>);
    expect(run.physicsOptions).toBeUndefined();
    expect(screen.queryByText('Axial drag')).toBeNull();
  });

  it.each([{}, 42])('safely renders malformed single-run drag %s', (bad) => {
    const run = runWith((v) => { v.flightDragSource = 'calibrated'; });
    const malformed = { ...run, manifest: { ...run.manifest, axialDrag: bad as string } };
    expect(() => render(<Tooltip.Provider><ResultsTable run={malformed} /></Tooltip.Provider>)).not.toThrow();
    // A line that is not a string is not shown at all; nothing malformed leaks into the page.
    expect(document.querySelector('[data-axial-drag]')?.textContent ?? '').not.toMatch(/\[object Object\]|42/);
  });

  it('K3: a run on the explicit legacy choice shows the engine line that says legacy drag flew', () => {
    const run = runWith((v) => { v.flightDragSource = 'legacy'; });
    expect(run.physicsOptions).toBeUndefined();
    const line = 'legacy 25-station Mach drag tables from compute_aerodynamic_curves; calibrated drag not requested';
    render(<Tooltip.Provider><ResultsTable run={{ ...run, manifest: { ...run.manifest, axialDrag: line } }} /></Tooltip.Provider>);
    expect(screen.getByText('Axial drag')).toBeTruthy();
    expect(screen.getByText(/calibrated drag not requested/)).toBeTruthy();
    expect(screen.queryByText('Built-up drag was requested but not used for this rocket.')).toBeNull();
  });

  it('K3: a default run (no drag choice) sent the built-up drag source and shows the engine line', () => {
    const run = runWith((v) => { delete v.flightDragSource; });
    expect(run.physicsOptions).toEqual({ flightDragSource: 'calibrated' });
    render(<Tooltip.Provider><ResultsTable run={{ ...run, manifest: { ...run.manifest, axialDrag: 'calibrated build-up axial drag; not a validated model' } }} /></Tooltip.Provider>);
    expect(screen.getByText(/calibrated build-up axial drag; not a validated model/)).toBeTruthy();
  });

  it('shows the engine line for a run that asked for built-up drag', () => {
    const run = runWith((v) => { v.flightDragSource = 'calibrated'; });
    const withManifest = { ...run, manifest: { ...run.manifest, axialDrag: 'calibrated build-up axial drag; not a validated model' } };
    render(<Tooltip.Provider><ResultsTable run={withManifest} /></Tooltip.Provider>);
    expect(screen.getByText('Axial drag')).toBeTruthy();
    expect(screen.getByText(/calibrated build-up axial drag; not a validated model/)).toBeTruthy();
    expect(screen.queryByText('Built-up drag was requested but not used for this rocket.')).toBeNull();
  });

  it('names a refused shape before the verbatim engine line', () => {
    const run = runWith((v) => { v.flightDragSource = 'calibrated'; });
    const refused = {
      ...run,
      manifest: { ...run.manifest, axialDrag: "legacy 25-station Mach drag tables from compute_aerodynamic_curves; legacy drag used (refused: calibrated unsupported feature: fin set 'fins' is elliptical; …)" },
    };
    render(<Tooltip.Provider><ResultsTable run={refused} /></Tooltip.Provider>);
    expect(screen.getByText('Built-up drag was requested but not used for this rocket.')).toBeTruthy();
    expect(screen.getByText(/legacy drag used \(refused:/)).toBeTruthy();
  });
});

describe('Monte Carlo tab', () => {
  function dispersion(patch: Partial<Dispersion> = {}): Dispersion {
    return {
      landings: [{ x: 1, y: 0 }, { x: 0, y: 1 }],
      mean: { x: 0.5, y: 0.5 }, sigma1: 1, sigma2: 1, thetaDeg: 0, r50: 1, r90: 1, r99: 1,
      ok: 2, failed: 0,
      ...patch,
    };
  }

  function openTab() {
    const trigger = screen.getByRole('tab', { name: 'Monte Carlo' });
    fireEvent.mouseDown(trigger);
    fireEvent.focus(trigger);
    fireEvent.click(trigger);
  }

  it.each([{}, 42])('safely omits malformed ensemble drag %s', async (bad) => {
    const design = designOf(useProjectStore.getState().project, useProjectStore.getState().mission);
    act(() => {
      seedCommittedRun(design);
      useConsoleJobs.setState({ jobs: { running: false, runError: null, mc: {
        id: 'mc', label: 'Monte Carlo', state: 'done', progress: 1, done: 2, total: 2, startedAt: 0,
        partial: dispersion({ axialDrag: bad as string, physicsOptions: { flightDragSource: 'calibrated' } }),
      } } });
    });
    render(<Tooltip.Provider><FlightStage /></Tooltip.Provider>);
    expect(() => openTab()).not.toThrow();
    await waitFor(() => expect(screen.getByText('Landing dispersion')).toBeTruthy());
    expect(document.querySelector('[data-axial-drag]')).toBeNull();
    expect(screen.queryByText(/^\[object Object\]$|^42$/)).toBeNull();
  });

  it('shows no axial-drag line for a default ensemble', async () => {
    const design = designOf(useProjectStore.getState().project, useProjectStore.getState().mission);
    act(() => {
      seedCommittedRun(design);
      useConsoleJobs.setState({
        jobs: { running: false, runError: null, mc: { id: 'mc', label: 'Monte Carlo', state: 'done', progress: 1, done: 2, total: 2, startedAt: 0, partial: dispersion() } },
      });
    });
    render(<Tooltip.Provider><FlightStage /></Tooltip.Provider>);
    openTab();
    await waitFor(() => expect(screen.getByText('Landing dispersion')).toBeTruthy());
    expect(screen.queryByText('Axial drag')).toBeNull();
  });

  it('shows the ensemble drag-source line only when the drag source was sent', async () => {
    const design = designOf(useProjectStore.getState().project, useProjectStore.getState().mission);
    act(() => {
      seedCommittedRun(design);
      useConsoleJobs.setState({
        jobs: {
          running: false, runError: null,
          mc: {
            id: 'mc', label: 'Monte Carlo', state: 'done', progress: 1, done: 2, total: 2, startedAt: 0,
            partial: dispersion({
              axialDrag: 'calibrated build-up axial drag; drag ladder from the nominal baseline flight; ensemble members share it; not a validated model',
              physicsOptions: { flightDragSource: 'calibrated' },
            }),
          },
        },
      });
    });
    render(<Tooltip.Provider><FlightStage /></Tooltip.Provider>);
    openTab();
    await waitFor(() => expect(screen.getByText('Landing dispersion')).toBeTruthy());
    expect(screen.getByText('Axial drag')).toBeTruthy();
    expect(screen.getByText(/ensemble members share it/)).toBeTruthy();
  });
});

describe('Model & evidence status panel', () => {
  it.each([{}, 42])('safely omits malformed dispersion drag %s', (bad) => {
    useAnalysisStore.setState((state) => ({ completed: { ...state.completed, ensemble: {
      kind: 'ensemble', status: 'completed', inputKey: 'key', token: 1,
      startedAt: '', finishedAt: '', error: null,
      payload: { dispersion: { axialDrag: bad, physicsOptions: { flightDragSource: 'calibrated' } } },
    } as never } }));
    expect(() => render(<ModelStatusPanel />)).not.toThrow();
    expect(document.querySelector('[data-row="axial-drag"]')).toBeNull();
    expect(screen.queryByText(/^\[object Object\]$|^42$/)).toBeNull();
  });

  it('adds no manifest rows for a default run', async () => {
    render(<ModelStatusPanel />);
    expect(screen.queryByText('Atmosphere')).toBeNull();
    expect(screen.queryByText('Thrust pressure')).toBeNull();
    expect(screen.queryByText('Axial drag')).toBeNull();
  });

  it('shows the three engine lines for a run that sent a physics option', async () => {
    act(() => consoleActions.setVehicle({ launchSite: { altitudeM: 400, temperatureC: 30 } }, 'Site'));
    await act(async () => { await useConsoleJobs.getState().run(); });
    render(<ModelStatusPanel />);
    expect(screen.getByText('Atmosphere')).toBeTruthy();
    expect(screen.getByText('Thrust pressure')).toBeTruthy();
    expect(screen.getByText('Axial drag')).toBeTruthy();
  });
});

describe('Aero controls and the flight-drag opt-in', () => {
  // K3: the Aero stage is exercised on the default (no drag choice), not on the pinned legacy flight.
  beforeEach(() => { resetConsoleState({ defaultFlightDrag: true }); });

  it('K3: the flight-drag checkbox is always shown and checked by default; unchecking is the explicit legacy choice', () => {
    render(<AeroControls />);
    const box = screen.getByLabelText('Use built-up drag in flights') as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(vehicle().flightDragSource).toBeUndefined();
    fireEvent.click(box);
    expect(vehicle().flightDragSource).toBe('legacy');
    expect((screen.getByLabelText('Use built-up drag in flights') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText('Use built-up drag in flights'));
    expect(vehicle().flightDragSource).toBeUndefined();
  });

  it('with the built-up model selected, the checkbox clears the explicit choice and the flag goes off with the model', () => {
    useProjectStore.getState().commitStructural('Beta', (project) => ({ ...project, aeroModel: BETA }));
    const { unmount } = render(<AeroControls />);
    const box = screen.getByLabelText('Use built-up drag in flights') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(vehicle().flightDragSource).toBe('legacy');
    unmount();

    const pastBefore = useProjectStore.getState().past.length;
    useProjectStore.getState().commitStructural('Beta off', (project) => {
      const { aeroModel: _removed, ...rest } = project;
      const withoutFlag = { ...rest.vehicle };
      delete withoutFlag.flightDragSource;
      return { ...rest, vehicle: withoutFlag };
    });
    expect(vehicle().flightDragSource).toBeUndefined();
    expect(useProjectStore.getState().past.length).toBe(pastBefore + 1);
  });

  const HELD_CALIBRATION = {
    scale: 0.9, fittedCd: 0.45, modelCd: 0.5, rmseN: 0.1, coastMassKg: 0.05,
    source: { fileName: 'legacy.csv', sha256Hex: 'f'.repeat(64), rowCount: 40 },
    window: { startS: 2, endS: 7, method: 'velocity-column', pointsUsed: 30, pointsExcluded: 10 },
    appliedAt: '2026-10-27T00:00:00.000Z',
  } as never;

  it('K3: a held drag calibration keeps the legacy tables, says why in one line, and choosing built-up is the explicit opt-in', () => {
    act(() => consoleActions.setDragCalibration(HELD_CALIBRATION, 'Held calibration'));
    render(<AeroControls />);
    const notice = document.querySelector('[data-drag-calibration-legacy]');
    // K3 review: the notice is about an ACTIVE calibration (a legacy artifact is always active); an inactive one is history.
    expect(notice?.textContent).toMatch(/Flying legacy drag: this project's drag calibration is active/);
    const box = screen.getByLabelText('Use built-up drag in flights') as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(vehicle().flightDragSource).toBeUndefined(); // nothing was written into the project
    fireEvent.click(box);
    expect(vehicle().flightDragSource).toBe('calibrated');
  });

  it('K3 review: an INACTIVE calibration is retained history: no legacy notice, the box stays on the built-up default', () => {
    // Provenance bound to other fit inputs: its scale is excluded, so it must change no flight physics.
    const inactive = { ...(HELD_CALIBRATION as unknown as Record<string, unknown>), fitProvenance: { uncalibratedRunKey: 'deadbeef', flightModelBinding: LEGACY_FLIGHT_MODEL } } as never;
    // The store refuses to APPLY an inactive artifact, so place it the way a reopened older file would carry it.
    act(() => useProjectStore.setState((state) => ({ project: { ...state.project, dragCalibration: inactive } })));
    expect(designOf(useProjectStore.getState().project, useProjectStore.getState().mission).calibrationApplicability.status).toBe('inactive');
    render(<AeroControls />);
    expect(document.querySelector('[data-drag-calibration-legacy]')).toBeNull();
    const box = screen.getByLabelText('Use built-up drag in flights') as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(vehicle().flightDragSource).toBe('legacy');
    fireEvent.click(screen.getByLabelText('Use built-up drag in flights'));
    expect(vehicle().flightDragSource).toBeUndefined(); // back to the plain default, not the old explicit opt-in
  });

  it('K3: without a held calibration there is no such line', () => {
    render(<AeroControls />);
    expect(document.querySelector('[data-drag-calibration-legacy]')).toBeNull();
  });

  it('K3: a nozzle exit above the engine flight limit says it is not sent as thrust', () => {
    act(() => consoleActions.setVehicle({ nozzleExitDiameter: 1.5 }, 'Big nozzle'));
    render(<AeroControls />);
    expect(document.querySelector('[data-nozzle-out-of-domain]')?.textContent).toMatch(/above the 1 m flight limit/);
    cleanup();
    act(() => consoleActions.setVehicle({ nozzleExitDiameter: 0.05 }, 'Small nozzle'));
    render(<AeroControls />);
    expect(document.querySelector('[data-nozzle-out-of-domain]')).toBeNull();
  });

  it('keeps a loaded flag visible and explains the missing model', () => {
    act(() => consoleActions.setVehicle({ flightDragSource: 'calibrated' }, 'Loaded flag'));
    render(<AeroControls />);
    const box = screen.getByLabelText('Use built-up drag in flights') as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('the built-up aero model is not selected');
  });

  it('clears the back-pressure opt-in together with the nozzle diameter', () => {
    act(() => consoleActions.setVehicle({ nozzleExitDiameter: 0.05, nozzleBackPressureThrust: true }, 'Nozzle'));
    render(<AeroControls />);
    expect((screen.getByLabelText('Nozzle back-pressure thrust') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Clear nozzle exit diameter'));
    expect(vehicle().nozzleExitDiameter).toBeUndefined();
    expect(vehicle().nozzleBackPressureThrust).toBeUndefined();
  });
});

describe('Nose tip radius inspector', () => {
  function selectNose() {
    const nose = useProjectStore.getState().project.vehicle.components.find((c) => c.type === 'nosecone');
    if (!nose) throw new Error('nose missing');
    useSessionStore.getState().setSelectedId(nose.id);
    render(<Tooltip.Provider delayDuration={250}><PartInspector /></Tooltip.Provider>);
  }

  /** The number input under a FieldRow whose label matches. */
  function inputFor(label: string): HTMLInputElement {
    const el = [...document.querySelectorAll('span')].find((s) => s.textContent?.trim() === label);
    const input = el?.parentElement?.querySelector('input') as HTMLInputElement | null;
    if (!input) throw new Error(`No input rendered for ${label}`);
    return input;
  }

  it('offers the control and stores no radius for a default nose cone', () => {
    selectNose();
    expect(screen.getByLabelText('Add Nose tip radius')).toBeTruthy();
    const nose = vehicle().components.find((c) => c.type === 'nosecone') as { tipRadius?: number };
    expect(nose.tipRadius).toBeUndefined();
  });

  it('adds, warns and clears the radius without clamping it', () => {
    selectNose();
    fireEvent.click(screen.getByLabelText('Add Nose tip radius'));
    const nose = vehicle().components.find((c) => c.type === 'nosecone') as { id: string; tipRadius?: number; baseDiameter: number };
    const stagedRadius = (): number | undefined =>
      (useProjectStore.getState().drafts.airframe.components[nose.id] as { tipRadius?: number } | undefined)?.tipRadius;
    expect(stagedRadius()).toBe(0.001);
    expect(screen.getByText('Nose tip radius')).toBeTruthy();

    // A value above the base diameter is kept exactly as typed and only warned about.
    // The field shows millimetres like every other \`len\` control: 200 mm = 0.2 m,
    // above the 0.152 m base diameter.
    fireEvent.change(inputFor('Nose tip radius'), { target: { value: '200' } });
    fireEvent.blur(inputFor('Nose tip radius'));
    expect(stagedRadius()).toBe(0.2);
    expect(screen.getByText(/outside what the engine accepts/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Clear Nose tip radius'));
    expect(stagedRadius()).toBeUndefined();
  });

  it('warns for a negative radius as well', () => {
    selectNose();
    fireEvent.click(screen.getByLabelText('Add Nose tip radius'));
    fireEvent.change(inputFor('Nose tip radius'), { target: { value: '-1' } });
    fireEvent.blur(inputFor('Nose tip radius'));
    expect(screen.getByText(/outside what the engine accepts/)).toBeTruthy();
  });
});
