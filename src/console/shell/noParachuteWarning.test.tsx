// @vitest-environment jsdom
/**
 * Lane no-parachute-warning: the note describes the current design's component
 * inventory only. It must not appear for a design with any parachute, must not
 * read a committed run's events or recorded design, must not block a run, and
 * must be present in Flight readiness and every Recovery branch.
 */
import { Tooltip } from 'radix-ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { RunReadiness } from './RunReadiness';
import { FlightStage } from '../stages/Flight';
import { RecoveryStage } from '../stages/Recovery';
import {
  consoleActions, currentPreflight, designOf, type FlightPayload,
} from '../store';
import { useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { flightResult, resetConsoleState, stubEngine } from '../testFixtures';
import { toFlightRun } from '../data/adapter';
import { candidateSelection } from '../../application/candidate.fixture';

const NOTE = 'No parachute in this design.';
const AMBER = 'rgb(245, 181, 68)';

let teardown: () => void;

beforeEach(() => {
  teardown = stubEngine().teardown;
  resetConsoleState();
});
afterEach(() => {
  cleanup();
  teardown();
});

function parachutes() {
  return useProjectStore.getState().project.vehicle.components.filter((component) => component.type === 'parachute');
}

function removeAllParachutes(): void {
  for (const chute of [...parachutes()]) {
    const result = consoleActions.removeComponent(chute.id);
    if (!result.ok) throw new Error(result.reason);
  }
}

function addParachute(): void {
  const result = consoleActions.addComponent('parachute');
  if (!result.ok) throw new Error(result.reason);
}

function currentDesign() {
  const { project, mission, shearPa } = useProjectStore.getState();
  return designOf(project, mission, shearPa);
}

/** Install a completed flight exactly as the run layer does, with its own design snapshot. */
function installFlight(design: ReturnType<typeof designOf>): void {
  const inputKey = 'no-parachute-warning-test';
  const run = toFlightRun(flightResult(), design.vehicle, undefined, inputKey, 2, 1);
  const token = useAnalysisStore.getState().start('flight', inputKey);
  useAnalysisStore.getState().resolve('flight', token, { run, previous: null, design } satisfies FlightPayload);
}

function note() {
  return screen.queryByText(NOTE, { exact: true });
}

function renderRecovery() {
  return render(<Tooltip.Provider><RecoveryStage /></Tooltip.Provider>);
}

describe('no-parachute note', () => {
  it('shows the exact amber readiness note only when the current design has no parachute', () => {
    render(<RunReadiness />);
    const readiness = screen.getByLabelText('Run readiness');
    expect(within(readiness).queryByText(NOTE, { exact: true })).toBeNull();

    act(() => removeAllParachutes());
    expect(parachutes()).toHaveLength(0);
    expect(within(readiness).getByText(NOTE, { exact: true })).toBeTruthy();
    expect(within(readiness).getByText(/ready to run/)).toBeTruthy();
    expect(within(readiness).getByText(NOTE, { exact: true }).style.color).toBe(AMBER);
    expect(readiness.querySelector('[data-no-parachute-note]')).toBeTruthy();
    expect(currentPreflight().runnable).toBe(true);
    expect(currentPreflight().issues).toEqual([]);

    const workspace = structuredClone(useProjectStore.getState().project.workspace);
    const mission = structuredClone(useProjectStore.getState().mission);
    const shearPa = useProjectStore.getState().shearPa;
    const motorId = useProjectStore.getState().project.workspace.motorId;
    const motorRecords = structuredClone(useProjectStore.getState().project.motorRecords);
    act(() => addParachute());
    expect(within(readiness).queryByText(NOTE, { exact: true })).toBeNull();
    expect(useProjectStore.getState().project.workspace).toEqual(workspace);
    expect(useProjectStore.getState().mission).toEqual(mission);
    expect(useProjectStore.getState().shearPa).toBe(shearPa);
    expect(useProjectStore.getState().project.workspace.motorId).toBe(motorId);
    expect(useProjectStore.getState().project.motorRecords).toEqual(motorRecords);
  });

  it('keeps the readiness note when a stale committed run recorded parachutes', () => {
    installFlight(currentDesign());
    act(() => removeAllParachutes());

    render(<RunReadiness />);
    expect(screen.getByText(NOTE, { exact: true })).toBeTruthy();
  });

  it('shows the note in Recovery with no run and removes it when a parachute returns', () => {
    act(() => removeAllParachutes());
    renderRecovery();
    const empty = screen.getByText('No flight yet', { exact: true });
    const line = screen.getByText(NOTE, { exact: true });
    expect(line.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    act(() => addParachute());
    expect(note()).toBeNull();
    expect(screen.getByText('No flight yet', { exact: true })).toBeTruthy();
  });

  it('shows the Recovery note when the committed run recorded chutes but the current design has none', () => {
    installFlight(currentDesign());
    act(() => removeAllParachutes());

    renderRecovery();
    const line = screen.getByText(NOTE, { exact: true });
    expect(line).toBeTruthy();
    const stat = screen.getAllByLabelText(/^Landing speed /)[0];
    expect(line.compareDocumentPosition(stat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Descent events', { exact: true })).toBeTruthy();
  });

  it('hides the Recovery note when the current design has a chute even if the run did not', () => {
    act(() => removeAllParachutes());
    installFlight(currentDesign());
    act(() => addParachute());

    renderRecovery();
    expect(note()).toBeNull();
    expect(screen.getAllByLabelText(/^Landing speed /).length).toBeGreaterThan(0);
  });

  it('leaves run authorization unchanged with no parachute', () => {
    act(() => removeAllParachutes());
    render(<FlightStage />);
    expect(screen.getByText(NOTE, { exact: true })).toBeTruthy();
    const run = screen.getByRole('button', { name: 'Run simulation' }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    expect(currentPreflight().runnable).toBe(true);
  });

  it('shows the note in the candidate Recovery refusal branch', () => {
    act(() => {
      removeAllParachutes();
      consoleActions.setFlightModel(candidateSelection(), 'Enable candidate model for test');
    });
    renderRecovery();
    expect(screen.getByText('Legacy recovery readout not evaluated', { exact: true })).toBeTruthy();
    expect(screen.getByText(NOTE, { exact: true })).toBeTruthy();
  });
});
