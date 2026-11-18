// @vitest-environment jsdom
/**
 * The P1 create/edit/results behaviours from the UX plan: removals and
 * replacements are announced with Undo, Run applies named staged edits, the
 * start screen, selection that keeps the stage, run numbers with a filled
 * previous-run delta, the post-run summary, and field names with units.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { useProjectStore } from '../state/project';
import { useSessionStore } from '../state/session';
import { useAnalysisStore } from '../state/analysis';
import { consoleActions, committedRun, runName, stagedAirframeEdits, useConsoleJobs } from './store';
import { stubEngine } from './testFixtures';
import { Toasts } from './shell/Toasts';
import { StartChooser, blankVehicle, openStartChooser, replaceDesign, useStartChooser } from './shell/StartChooser';
import { PartsTree, TopBar } from './shell/Shell';
import { FieldRow, NumberField } from './kit/Fields';
import { firstOpenFinding } from './stages/RunSummary';
import type { Gate } from './data/contract';

let teardown: () => void;

beforeEach(() => {
  localStorage.setItem('astraea.workstation.toured', '1');
  teardown = stubEngine().teardown;
  useProjectStore.getState().loadPreset('nasaStudent');
  useProjectStore.setState({ past: [], future: [], toasts: [], file: { kind: 'clean' } });
  useAnalysisStore.getState().reset();
  useStartChooser.setState({ open: false, pending: null });
  useSessionStore.setState({ stage: 'airframe', selectedId: null });
});

afterEach(() => {
  cleanup();
  teardown();
});

describe('no silent changes', () => {
  it('announces a removed part with Undo that brings it back', () => {
    render(<Toasts />);
    act(() => { consoleActions.removeComponent('nsl-bt1'); });
    expect(useProjectStore.getState().past.at(-1)!.label).toBe('Remove Payload & Avionics Bay');
    const toast = screen.getByText('Removed Payload & Avionics Bay').closest('[data-toast]') as HTMLElement;
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(useProjectStore.getState().project.vehicle.components.some((c) => c.id === 'nsl-bt1')).toBe(true);
    expect(screen.queryByText('Removed Payload & Avionics Bay')).toBeNull();
  });

  it('stops offering Undo on the toast once a later edit would be undone instead', () => {
    render(<Toasts />);
    act(() => { consoleActions.removeComponent('nsl-bt1'); });
    act(() => { consoleActions.setOptions({ windSpeedSurface: 6 }, 'Surface wind'); });
    const toast = screen.getByText('Removed Payload & Avionics Bay').closest('[data-toast]') as HTMLElement;
    expect(within(toast).queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('names parts in History when they are added or moved', () => {
    act(() => { consoleActions.addComponent('parachute'); });
    expect(useProjectStore.getState().past.at(-1)!.label).toMatch(/^Add /);
    expect(useProjectStore.getState().past.at(-1)!.label).not.toMatch(/parachute$/);
    act(() => { consoleActions.moveComponent('nsl-bt1', 1); });
    expect(useProjectStore.getState().past.at(-1)!.label).toBe('Move Payload & Avionics Bay aft');
  });
});

describe('Apply N edits and run', () => {
  it('names the staged edits on the Run button and in History', async () => {
    act(() => {
      useProjectStore.getState().stageComponents('airframe', 'nsl-bt1', { length: 0.8 });
      useProjectStore.getState().stageComponents('airframe', 'nsl-nc', { length: 0.7 });
    });
    expect(stagedAirframeEdits()).toEqual(['Payload & Avionics Bay length', 'Von Kármán Nosecone length']);
    render(<Tooltip.Provider><TopBar onPalette={() => undefined} /></Tooltip.Provider>);
    const run = screen.getByRole('button', { name: /Apply 2 edits and run/ });
    expect(run.hasAttribute('disabled')).toBe(false);
    expect(run.getAttribute('title')).toMatch(/Applies 2 edits: Payload & Avionics Bay length, Von Kármán Nosecone length, then runs/);
  });

  it('says why Run is unavailable next to the button, not only in its tooltip', () => {
    act(() => { consoleActions.setComponent('nsl-bt1', { isMotorMount: true } as never, 'Flag second mount'); });
    render(<Tooltip.Provider><TopBar onPalette={() => undefined} /></Tooltip.Provider>);
    expect(document.getElementById('run-blocker')!.textContent).toMatch(/^Can't run: /);
  });
});

describe('start screen', () => {
  it('starts a blank rocket with a nose, a motor-mount tube, fins and a parachute, as one undoable step', () => {
    const vehicle = blankVehicle();
    expect(vehicle.components.map((c) => c.type)).toEqual(['nosecone', 'bodytube', 'trapezoidfinset', 'parachute']);
    expect(vehicle.components.find((c) => c.type === 'bodytube')).toMatchObject({ isMotorMount: true });
    render(<StartChooser canResume={false} />);
    act(() => openStartChooser());
    fireEvent.click(screen.getByRole('button', { name: /Blank rocket/ }));
    expect(useProjectStore.getState().project.vehicle.name).toBe('Untitled rocket');
    expect(useProjectStore.getState().past.at(-1)!.label).toBe('Start a blank design');
    act(() => useProjectStore.getState().undo());
    expect(useProjectStore.getState().project.vehicle.id).toBe('preset-nasa-sl');
  });

  it('asks before replacing a design with unsaved edits, and keeps it when told to', () => {
    act(() => { consoleActions.setOptions({ windSpeedSurface: 6 }, 'Surface wind'); });
    render(<StartChooser canResume={false} />);
    let ran = false;
    act(() => replaceDesign('the Estes Alpha III example', () => { ran = true; }));
    expect(ran).toBe(false);
    expect(screen.getByRole('alertdialog', { name: 'Replace the current design?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my design' }));
    expect(ran).toBe(false);
    expect(useStartChooser.getState().open).toBe(false);
  });

  it('replaces at once when nothing unsaved would be lost', () => {
    let ran = false;
    replaceDesign('the Estes Alpha III example', () => { ran = true; });
    expect(ran).toBe(true);
  });
});

describe('selection keeps the stage', () => {
  it('highlights a part on Verify without leaving, and offers Edit in Airframe', () => {
    useSessionStore.setState({ stage: 'verify' });
    render(<Tooltip.Provider><PartsTree /></Tooltip.Provider>);
    fireEvent.click(screen.getByRole('treeitem', { name: 'Payload & Avionics Bay' }));
    expect(useSessionStore.getState()).toMatchObject({ stage: 'verify', selectedId: 'nsl-bt1' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit in Airframe' }));
    expect(useSessionStore.getState()).toMatchObject({ stage: 'airframe', selectedId: 'nsl-bt1' });
  });
});

describe('run numbers and the previous run', () => {
  it('numbers runs apart from the save revision and links each run to the one it replaced', async () => {
    await act(async () => { await useConsoleJobs.getState().run(); });
    const first = committedRun()!.run!;
    expect(first.runNumber).toBe(1);
    expect(runName(first)).toBe('Run #1');
    act(() => { consoleActions.setOptions({ windSpeedSurface: 6 }, 'Surface wind'); });
    await act(async () => { await useConsoleJobs.getState().run(); });
    const record = useAnalysisStore.getState().completed.flight!.payload as { run: { runNumber: number }; previous: { runNumber: number; summary: unknown } | null };
    expect(record.run.runNumber).toBe(2);
    // The Δ previous run column reads this; it used to be always empty.
    expect(record.previous).toMatchObject({ runNumber: 1 });
    expect(record.previous!.summary).toEqual(first.summary);
  });
});

describe('post-run summary', () => {
  const g = (id: string, status: Gate['status']): Gate => ({ id, label: id, stage: 'flight', status, value: { value: 1, unit: '', confidence: 'modeled' }, threshold: '', reason: '' });
  it('points at failures first, then invalid-run checks, then unknowns', () => {
    expect(firstOpenFinding([g('a', 'pass'), g('b', 'unknown'), g('c', 'fail')])!.id).toBe('c');
    expect(firstOpenFinding([g('a', 'unknown'), g('b', 'invalid')])!.id).toBe('b');
    expect(firstOpenFinding([g('a', 'pass'), g('b', 'n/a')])).toBeNull();
    // A caution is worth a look, but only once nothing failed or is unknown.
    expect(firstOpenFinding([g('a', 'caution'), g('b', 'unknown')])!.id).toBe('b');
    expect(firstOpenFinding([g('a', 'pass'), g('b', 'caution')])!.id).toBe('b');
  });
});

describe('fields', () => {
  it('gives every number field an accessible name with its unit, and explains a limit beside it', () => {
    render(<FieldRow label="Outer diameter"><NumberField value={0.05} kind="len" min={0.04} onChange={() => undefined} minReason="the outer diameter must be larger than the inner diameter (39.5 mm)" /></FieldRow>);
    const input = screen.getByRole('textbox', { name: 'Outer diameter (mm)' });
    fireEvent.focus(input); fireEvent.change(input, { target: { value: '10' } }); fireEvent.blur(input);
    expect(screen.getByRole('status').textContent).toBe('Limited to 40 mm: the outer diameter must be larger than the inner diameter (39.5 mm)');
  });
});

describe('implausible values are flagged, never changed', () => {
  it('warns when a wall is over a quarter of the radius', async () => {
    const { PartInspector } = await import('./shell/Inspector');
    useSessionStore.setState({ stage: 'airframe', selectedId: 'nsl-nc' });
    act(() => { useProjectStore.getState().stageComponents('airframe', 'nsl-nc', { wallThickness: 0.03 } as never); });
    render(<Tooltip.Provider><PartInspector /></Tooltip.Provider>);
    expect(screen.getByText(/over a quarter of the .* radius\. That is unusual for a rocket; check the units\./)).toBeTruthy();
    expect((useProjectStore.getState().drafts.airframe.components['nsl-nc'] as { wallThickness: number }).wallThickness).toBe(0.03);
  });
});

describe('recovery packing', () => {
  it('takes you to the chute when a packed length is missing, without leaving Recovery', async () => {
    const { RecoveryCard } = await import('./evidence/RecoveryCard');
    useSessionStore.setState({ stage: 'recovery', selectedId: null });
    render(<RecoveryCard />);
    fireEvent.click(screen.getAllByRole('button', { name: /Enter packed length for/ })[0]);
    const selected = useSessionStore.getState().selectedId;
    expect(useProjectStore.getState().project.vehicle.components.find((c) => c.id === selected)?.type).toBe('parachute');
    expect(useSessionStore.getState().stage).toBe('recovery');
  });
});
