// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Tooltip } from 'radix-ui';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useThree: () => ({ camera: { position: { set: () => undefined } }, size: { width: 1, height: 1 }, controls: null }),
  useFrame: () => undefined,
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Grid: () => null,
  GizmoHelper: () => null,
  GizmoViewcube: () => null,
}));

import { AirframeStage } from './Airframe';
import { AeroStage } from './Aero';
import { VerifyStage } from './Verify';
import { useProjectStore } from '../../state/project';
import { useSessionStore } from '../../state/session';
import { consoleJobStub, installTestEngine, resetConsoleState, stabilityAnalysis, stabilityAnalysisFor } from '../testFixtures';
import { CERTIFIED_MOTORS } from '../../propulsion/motorDatabase';

const INTRO = 'Subsonic component geometry and mass rollup; excludes the selected motor and depletion history. Pad all-up, burnout and powered-flight minimum margins are unavailable here.';

let teardown: (() => void) | null = null;

function stubStability(analysis = stabilityAnalysis()): void {
  teardown?.();
  teardown = installTestEngine(async (cmd: string) => (cmd === 'stability' ? analysis : {})).teardown;
}

beforeEach(() => {
  resetConsoleState();
  consoleJobStub();
  useSessionStore.setState({ validationOpen: false });
});

afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
  resetConsoleState();
  useSessionStore.setState({ validationOpen: false });
});

function stabilityCard(): HTMLElement {
  return screen.getByRole('region', { name: 'Live stability and flight preview' });
}

/**
 * Liftoff margin for the current project under `analysis`, computed the way
 * the flight engine places the motor (aft end at the mount's aft end).
 */
function expectedLiftoff(analysis: ReturnType<typeof stabilityAnalysisFor>): number {
  const project = useProjectStore.getState().project;
  const motor = CERTIFIED_MOTORS[project.workspace.motorId]!;
  const mount = project.vehicle.components.find((c) => c.type === 'bodytube' && c.isMotorMount)!;
  const aft = analysis.contributions.find((c) => c.id === mount.id)!.axialEnd;
  const cg = (analysis.totalMass * analysis.cg + motor.totalMass * (aft - motor.length / 2)) / (analysis.totalMass + motor.totalMass);
  return (analysis.cp - cg) / analysis.referenceDiameter;
}

describe('Airframe stability card', () => {
  it('leads with stability at liftoff (motor loaded), says what it means and what to do, in Airframe and Aero', async () => {
    const vehicle = useProjectStore.getState().project.vehicle;
    const analysis = stabilityAnalysisFor(vehicle, { cp: 2.9, cg: 1.2, totalMass: 12, referenceDiameter: 0.152, staticMarginCalibers: (2.9 - 1.2) / 0.152 });
    const liftoff = expectedLiftoff(analysis);
    expect(liftoff).toBeGreaterThan(3);
    stubStability(analysis);
    render(<Tooltip.Provider><AirframeStage /></Tooltip.Provider>);
    await screen.findByText('More stability than needed');
    const strip = stabilityCard();
    expect(strip.textContent).toContain('Stability at liftoff');
    expect(strip.textContent).toMatch(/K550W.* loaded/);
    expect(strip.querySelector('[data-stability-advice]')!.textContent).toMatch(/smaller fins/);
    // The airframe-only margin stays visible, labelled as the secondary value.
    expect(strip.textContent).toContain('Airframe only, without the motor');
    expect(within(strip).getByLabelText(/Stability margin at liftoff/).textContent).toContain(liftoff.toFixed(2));

    cleanup();
    render(<Tooltip.Provider><AeroStage /></Tooltip.Provider>);
    await screen.findByText('More stability than needed');
    expect(screen.getByText(INTRO)).toBeTruthy();
  });

  it('reads Stable with no advice when the liftoff margin is inside 1–3 cal', async () => {
    // A different preset: native stability is cached by vehicle content across tests.
    useProjectStore.getState().loadPreset('estesAlpha');
    const vehicle = useProjectStore.getState().project.vehicle;
    const base = stabilityAnalysisFor(vehicle, { cg: 0.25, totalMass: 0.03, referenceDiameter: 0.0248 });
    // Choose the CP so the loaded margin is 2 cal.
    const cgLoaded = base.cp - expectedLiftoff(base) * base.referenceDiameter;
    const analysis = { ...base, cp: cgLoaded + 2 * 0.0248 };
    stubStability(analysis);
    render(<Tooltip.Provider><AirframeStage /></Tooltip.Provider>);
    await screen.findByText('Stability at liftoff', { exact: false });
    const strip = stabilityCard();
    await vi.waitFor(() => expect(strip.querySelector('[data-stability-verdict]')!.textContent).toMatch(/^Stable/), { timeout: 3000 });
    expect(strip.querySelector('[data-stability-advice]')).toBeNull();
    expect(strip.querySelector('[data-margin-unavailable]')).toBeNull();
  });

  it('says Not checked, with the reason, when the CP is unavailable, and never folds it away', async () => {
    useProjectStore.getState().loadPreset('spaceport');
    const reason = 'The native engine published no CP for this vehicle.';
    stubStability(stabilityAnalysisFor(useProjectStore.getState().project.vehicle, { cpUnavailable: reason }));
    render(<Tooltip.Provider><AirframeStage /></Tooltip.Provider>);
    const warning = await screen.findByText(`Not checked: The centre of pressure is unknown: ${reason}`);
    const warningNode = warning.closest('[data-margin-unavailable]') as HTMLElement;
    expect(warningNode).not.toBeNull();
    expect(warningNode.closest('[data-fold]')).toBeNull();
    expect(stabilityCard().querySelector('[data-stability-verdict]')!.textContent).toBe('Not checked');
  });
});

describe('Verify stability check', () => {
  it('shows stability at liftoff before any run, with a run button for the flight checks', async () => {
    stubStability(stabilityAnalysisFor(useProjectStore.getState().project.vehicle, { cp: 2.9, cg: 1.2, totalMass: 12, referenceDiameter: 0.152 }));
    render(<Tooltip.Provider><VerifyStage /></Tooltip.Provider>);
    const row = await screen.findByRole('button', { name: /Stability at liftoff: Caution/ });
    expect(row.querySelector('[data-gate-advice]')!.textContent).toMatch(/smaller fins/);
    expect(row.textContent).toMatch(/Safe to fly, but the rocket may turn into the wind/);
    expect(row.textContent).toContain('≥ 1 cal (1–3 ideal)');
    expect(screen.getAllByText(/1 caution/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Run simulation/ })).toBeTruthy();
    expect(screen.getByText(/Flight checks .* need a simulation/)).toBeTruthy();
  });
});

describe('Verify Validation card', () => {
  it('starts closed, opens on the heading, and stays open across a remount', () => {
    render(<Tooltip.Provider><VerifyStage /></Tooltip.Provider>);
    let toggle = screen.getByRole('button', { name: /Validation · does the model match reality\?/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    let panel = document.getElementById(toggle.getAttribute('aria-controls')!) as HTMLElement;
    expect(panel.hidden).toBe(true);
    expect(screen.getByText(/Verification above checks the design against requirements/)).toBeTruthy();
    expect(screen.getByLabelText('Flight log file')).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);

    cleanup();
    render(<Tooltip.Provider><VerifyStage /></Tooltip.Provider>);
    toggle = screen.getByRole('button', { name: /Validation · does the model match reality\?/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    panel = document.getElementById(toggle.getAttribute('aria-controls')!) as HTMLElement;
    expect(panel.hidden).toBe(false);
  });
});
