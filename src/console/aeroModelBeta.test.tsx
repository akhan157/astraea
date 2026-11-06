/**
 * Built-up aero model beta in the Console (1b):
 * - the envelope owns the selection; on writes it, off removes the key;
 * - save/reopen preserves it, and a legacy project writes no key;
 * - a flight refuses before any case, archive, analysis record or engine call;
 * - the legacy path is untouched (no selection, no new wire field).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useProjectStore, exportableProject } from '../state/project';
import { useAnalysisStore } from '../state/analysis';
import { readProject, writeProject, type ProjectEnvelope } from '../formats/projectJson';
import { committedRun, useConsoleJobs } from './store';
import { AeroControls } from './stages/AeroControls';
import { ModelStatusPanel } from './evidence/ModelStatusPanel';
import { stubEngine, resetConsoleState, consoleJobStub } from './testFixtures';
import { AERO_MODEL_VERSION, AERO_MODEL_VERSION_METHOD_ONLY, aeroModelDefect, type AeroModelSelection } from '../application/aeroModel';

const BETA: AeroModelSelection = {
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION,
  terms: { transonic: 'legacy' },
};

const DEFECTIVE: AeroModelSelection = {
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION_METHOD_ONLY,
  terms: { transonic: 'legacy' },
};

let engine: ReturnType<typeof stubEngine>;

beforeEach(() => {
  engine = stubEngine();
  resetConsoleState();
  consoleJobStub();
});
afterEach(() => {
  cleanup();
  engine.teardown();
});

function enableBeta(): void {
  useProjectStore.getState().commitStructural('Enable built-up aero model (beta)', (project) => ({
    ...project,
    aeroModel: BETA,
  }));
}

function disableBeta(): void {
  useProjectStore.getState().commitStructural('Use legacy aero model', (project) => {
    const { aeroModel: _removed, ...rest } = project;
    return rest;
  });
}

function envelope(): ProjectEnvelope {
  return useProjectStore.getState().project;
}

async function runFlight(): Promise<void> {
  await act(async () => {
    await useConsoleJobs.getState().run();
  });
}

describe('built-up aero model beta', () => {
  it('writes and clears the envelope selection and survives save/reopen', () => {
    enableBeta();
    expect(envelope().aeroModel).toEqual(BETA);

    const reopened = readProject(writeProject(exportableProject()));
    expect(reopened.aeroModel).toEqual(BETA);

    disableBeta();
    expect(Object.hasOwn(envelope(), 'aeroModel')).toBe(false);
    const legacyText = writeProject(exportableProject());
    expect(legacyText).not.toContain('"aeroModel"');
    expect(Object.hasOwn(readProject(legacyText), 'aeroModel')).toBe(false);
  });

  it('refuses a flight before any record or engine call', async () => {
    enableBeta();
    const casesBefore = envelope().cases?.length ?? 0;
    await runFlight();

    expect(engine.calls.filter((call) => call.cmd === 'simulate_flight')).toHaveLength(0);
    expect(committedRun()).toBeNull();
    expect(useAnalysisStore.getState().history).toHaveLength(0);
    expect(useConsoleJobs.getState().jobs.runError).toMatch(
      /drives stability and aero panels in this build; flight coefficients still come from the legacy path/,
    );
    expect(envelope().cases?.length ?? 0).toBe(casesBefore);
  });

  it('loads a defective 1b project without migrating it', () => {
    useProjectStore.getState().commitStructural('Restore defective selection', (project) => ({
      ...project,
      aeroModel: DEFECTIVE,
    }));
    const reopened = readProject(writeProject(exportableProject()));
    expect(reopened.aeroModel).toEqual(DEFECTIVE);
    expect(aeroModelDefect(reopened.aeroModel!)).toContain('never implemented the legacy-transonic composition');
  });

  it('shows no provenance surface without a selection and adds it with one', () => {
    render(<AeroControls />);
    expect(screen.queryByText('Aero model provenance')).toBeNull();
    expect(screen.queryByText('Aero model')).toBeNull();
    cleanup();
    enableBeta();
    render(<AeroControls />);
    expect(screen.getByText('Aero model provenance')).toBeTruthy();
    cleanup();
    render(<ModelStatusPanel />);
    expect(screen.getByText('Aero model provenance')).toBeTruthy();
  });

  it('writes and clears the vehicle aero inputs', () => {
    render(<AeroControls />);

    const finish = screen.getByLabelText('Surface finish') as HTMLSelectElement;
    expect(finish.value).toBe('');
    const finishOptions = [...finish.options].map((option) => option.value);
    expect(finishOptions).toContain('Smooth (Zero Roughness)');
    expect(finishOptions).toContain('Smooth Paint');
    fireEvent.change(finish, { target: { value: 'Smooth Paint' } });
    expect(envelope().vehicle.surfaceFinish).toBe('Smooth Paint');
    fireEvent.change(finish, { target: { value: '' } });
    expect(envelope().vehicle.surfaceFinish).toBeUndefined();

    const turbulent = screen.getByLabelText('Force turbulent flow') as HTMLInputElement;
    expect(turbulent.checked).toBe(false);
    fireEvent.click(turbulent);
    expect(envelope().vehicle.forceTurbulentFlow).toBe(true);
    fireEvent.click(turbulent);
    expect(envelope().vehicle.forceTurbulentFlow).toBeUndefined();

    expect(envelope().vehicle.nozzleExitDiameter).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Add nozzle exit diameter' }));
    expect(envelope().vehicle.nozzleExitDiameter).toBeCloseTo(0.018);
    fireEvent.click(screen.getByRole('button', { name: 'Clear nozzle exit diameter' }));
    expect(envelope().vehicle.nozzleExitDiameter).toBeUndefined();
  });

  it('lets the default airfoil-fin template enable the beta', () => {
    render(<AeroControls />);
    const toggle = screen.getByRole('checkbox', { name: 'Use built-up aero model (beta)' }) as HTMLInputElement;
    expect(toggle.disabled).toBe(false);
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(envelope().aeroModel).toEqual(BETA);
  });

  it('leaves the legacy run and its wire payload unchanged', async () => {
    await runFlight();
    const flight = engine.calls.find((call) => call.cmd === 'simulate_flight');
    expect(flight).toBeDefined();
    expect(flight!.args).not.toHaveProperty('aeroModel');
    expect(Object.hasOwn(envelope(), 'aeroModel')).toBe(false);
    expect(committedRun()).not.toBeNull();
  });
});
