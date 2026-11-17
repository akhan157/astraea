/**
 * K3 review (commit 4), finding 2: the "Nozzle back-pressure thrust" box shows the state a flight really
 * flies. Under the built-up default a declared nozzle exit is carried automatically (spec Amendment 4), so
 * the box reads ON; unticking it writes the explicit off (`false`) and a flight then sends no nozzle option;
 * ticking it again returns to the automatic default. Under an explicit drag choice the old rule holds
 * (ticked = `true`, unticked = absent). Each step goes UI -> project -> a real committed run -> the request
 * the engine receives (only the engine invoke is a test double).
 *
 * The first tests fail on edd5f88, where the box read OFF while the nozzle flew and toggling it off and on
 * still sent the nozzle.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RocketVehicle } from '../../core/types';
import { adoptProject, useProjectStore } from '../../state/project';
import { readProject, writeProject } from '../../formats/projectJson';
import { consoleActions, designOf, resolveRun, useConsoleJobs } from '../store';
import { consoleJobStub, resetConsoleState, stubEngine, type Invocation } from '../testFixtures';
import { AeroControls } from './AeroControls';

let teardown: () => void;
let calls: Invocation[];
beforeEach(() => {
  const stub = stubEngine();
  teardown = stub.teardown;
  calls = stub.calls;
  resetConsoleState({ defaultFlightDrag: true });
  consoleJobStub();
  act(() => consoleActions.setVehicle({ nozzleExitDiameter: 0.05 }, 'Nozzle exit'));
});
afterEach(() => { cleanup(); teardown(); });

const vehicle = (): RocketVehicle => useProjectStore.getState().project.vehicle;
const box = (): HTMLInputElement => screen.getByLabelText('Nozzle back-pressure thrust') as HTMLInputElement;
/** The row's hint is its title (the FieldRow tooltip text). */
const hint = (): string => document.querySelector('[title^="Adds (101,325 Pa"]')?.getAttribute('title') ?? '';
const key = (): string => {
  const store = useProjectStore.getState();
  return resolveRun(store.project, {}, designOf(store.project, store.mission))!.inputKey;
};

/** Run a committed flight from the current project and return the options the engine received. */
async function flownOptions(): Promise<Record<string, unknown>> {
  const before = calls.filter((c) => c.cmd === 'simulate_flight').length;
  await act(async () => { await useConsoleJobs.getState().run(); });
  const flights = calls.filter((c) => c.cmd === 'simulate_flight');
  expect(flights.length).toBe(before + 1);
  return flights[flights.length - 1].args?.options as Record<string, unknown>;
}

describe('built-up default (no drag choice)', () => {
  it('reads ON because the flight sends the nozzle, and says it is the default', async () => {
    render(<AeroControls />);
    expect(box().checked).toBe(true);
    expect(box().disabled).toBe(false);
    expect(hint()).toMatch(/On by default while a nozzle exit is set and built-up drag flies; untick it to turn it off\./);
    expect(hint()).toMatch(/Off leaves flights unchanged\./);
    expect((await flownOptions()).nozzleExitDiameter).toBe(0.05);
    expect(vehicle().nozzleBackPressureThrust).toBeUndefined();
  });

  it('unticking turns it off for real: the explicit off is stored, keyed, and the flight sends no nozzle', async () => {
    render(<AeroControls />);
    const automaticKey = key();
    fireEvent.click(box());
    expect(vehicle().nozzleBackPressureThrust).toBe(false);
    expect(box().checked).toBe(false);
    const options = await flownOptions();
    expect(options).not.toHaveProperty('nozzleExitDiameter');
    expect(options.flightDragSource).toBe('calibrated');   // only the nozzle changed, still the built-up default
    expect(key()).not.toBe(automaticKey);                  // different physics, different run identity
  });

  it('ticking again returns to the automatic default: field absent, nozzle sent, original run key', async () => {
    render(<AeroControls />);
    const automaticKey = key();
    fireEvent.click(box());
    fireEvent.click(box());
    expect(vehicle().nozzleBackPressureThrust).toBeUndefined();
    expect(box().checked).toBe(true);
    expect((await flownOptions()).nozzleExitDiameter).toBe(0.05);
    expect(key()).toBe(automaticKey);
  });

  it('the explicit off survives a save and reopen: the REOPENED project shows it off and its flight sends no nozzle', async () => {
    render(<AeroControls />);
    fireEvent.click(box());
    const saved = writeProject(useProjectStore.getState().project);
    expect(saved).toContain('"nozzleBackPressureThrust": false');
    // replace the open project with the automatic default (nozzle on), proving the reopen is what restores the off
    cleanup();
    resetConsoleState({ defaultFlightDrag: true });
    act(() => consoleActions.setVehicle({ nozzleExitDiameter: 0.05 }, 'Nozzle exit'));
    expect(vehicle().nozzleBackPressureThrust).toBeUndefined();
    expect((await flownOptions()).nozzleExitDiameter).toBe(0.05);
    // reopen the saved project and fly it
    act(() => adoptProject(readProject(saved)));
    expect(vehicle().nozzleBackPressureThrust).toBe(false);
    render(<AeroControls />);
    expect(box().checked).toBe(false);
    const options = await flownOptions();
    expect(options).not.toHaveProperty('nozzleExitDiameter');
    expect(options.flightDragSource).toBe('calibrated');
  });

  it('the automatic state needs no field: its saved file carries none and reopens still sending the nozzle', async () => {
    const saved = writeProject(useProjectStore.getState().project);
    expect(saved).not.toContain('nozzleBackPressureThrust');
    cleanup();
    resetConsoleState({ defaultFlightDrag: true });
    act(() => adoptProject(readProject(saved)));
    expect(vehicle().nozzleBackPressureThrust).toBeUndefined();
    expect((await flownOptions()).nozzleExitDiameter).toBe(0.05);
  });

  it('a nozzle exit above the engine flight limit is not carried, so the box reads off and ticking it is the old explicit on', () => {
    act(() => consoleActions.setVehicle({ nozzleExitDiameter: 1.5 }, 'Big nozzle'));
    render(<AeroControls />);
    expect(box().checked).toBe(false);
    expect(hint()).not.toMatch(/On by default/);
    expect(hint()).toMatch(/Adds \(101,325 Pa/);
    fireEvent.click(box());
    expect(vehicle().nozzleBackPressureThrust).toBe(true);
  });
});

describe('explicit drag choice keeps the old rule', () => {
  it("'legacy': reads off, ticking sends the nozzle (true), unticking clears it", async () => {
    act(() => consoleActions.setVehicle({ flightDragSource: 'legacy' }, 'Legacy'));
    render(<AeroControls />);
    expect(box().checked).toBe(false);
    expect(hint()).not.toMatch(/On by default/);
    expect(hint()).toMatch(/Adds \(101,325 Pa/);
    expect(await flownOptions()).not.toHaveProperty('nozzleExitDiameter');
    fireEvent.click(box());
    expect(vehicle().nozzleBackPressureThrust).toBe(true);
    expect(box().checked).toBe(true);
    expect((await flownOptions()).nozzleExitDiameter).toBe(0.05);
    fireEvent.click(box());
    expect(vehicle().nozzleBackPressureThrust).toBeUndefined();
    expect(await flownOptions()).not.toHaveProperty('nozzleExitDiameter');
  });
});
