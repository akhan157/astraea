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
import { consoleJobStub, installTestEngine, resetConsoleState, stabilityAnalysis } from '../testFixtures';

const AMBER = 'Above generic geometry band (>3 cal). Weathercocking requires flight analysis.';
const ROLLUP = 'Component rollup only; selected motor and powered-flight margin history unavailable.';
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

/** The Airframe caveat fold: amber sentence first, grey sentence second, one More control. */
function expectAirframeFold(): void {
  const strip = stabilityCard();
  const fold = strip.querySelector('[data-fold]') as HTMLElement;
  expect(fold).not.toBeNull();
  const text = fold.querySelector('[data-fold-text]') as HTMLElement;
  expect(text.textContent).toBe(`${AMBER} ${ROLLUP}`);
  expect(text.className).toContain('truncate');
  const parts = [...fold.querySelectorAll('[data-fold-part]')] as HTMLElement[];
  expect(parts.map((part) => part.getAttribute('data-fold-part'))).toEqual(['amber', 'grey']);
  expect(getComputedStyle(parts[0]!).color).toBe('rgb(245, 181, 68)');
  expect(getComputedStyle(parts[1]!).color).toBe('rgb(94, 100, 109)');
  const more = within(fold).getByRole('button', { name: 'More' });
  expect(more.getAttribute('aria-expanded')).toBe('false');
  expect(more.getAttribute('aria-controls')).toBe(text.getAttribute('id'));
  fireEvent.click(more);
  expect(within(fold).getByRole('button', { name: 'Less' }).getAttribute('aria-expanded')).toBe('true');
  const expanded = [...fold.querySelectorAll('[data-fold-part]')] as HTMLElement[];
  expect(expanded).toHaveLength(2);
  expect(expanded[0]!.className).toContain('block');
  expect(expanded[1]!.className).toContain('block');
  expect(fold.querySelector('[data-fold-text]')!.textContent).toContain(AMBER);
  expect(fold.querySelector('[data-fold-text]')!.textContent).toContain(ROLLUP);
  expect(getComputedStyle(expanded[0]!).color).toBe('rgb(245, 181, 68)');
  expect(getComputedStyle(expanded[1]!).color).toBe('rgb(94, 100, 109)');
  fireEvent.click(within(fold).getByRole('button', { name: 'Less' }));
  expect(within(fold).getByRole('button', { name: 'More' })).toBeTruthy();
}

describe('Airframe stability card fold', () => {
  it('folds the two caveat sentences in Airframe and in Aero, then expands both in their original colours', async () => {
    stubStability();
    render(<Tooltip.Provider><AirframeStage /></Tooltip.Provider>);
    await screen.findByText(AMBER);
    expectAirframeFold();

    cleanup();
    render(<Tooltip.Provider><AeroStage /></Tooltip.Provider>);
    await screen.findByText(AMBER);
    expectAirframeFold();
    expect(screen.getByText(INTRO)).toBeTruthy();
  });

  it('leaves the single grey line unfolded when the margin is inside the band', async () => {
    useProjectStore.getState().loadPreset('estesAlpha');
    stubStability(stabilityAnalysis({ staticMarginCalibers: 2 }));
    render(<Tooltip.Provider><AirframeStage /></Tooltip.Provider>);
    await screen.findByText(ROLLUP);
    const strip = stabilityCard();
    expect(strip.querySelector('[data-fold]')).toBeNull();
    expect(within(strip).queryByRole('button', { name: 'More' })).toBeNull();
    expect(strip.textContent).toContain(ROLLUP);
    expect(strip.textContent).not.toContain(AMBER);
  });

  it('never folds the unavailable-margin warning, and never merges the grey line into it', async () => {
    useProjectStore.getState().loadPreset('spaceport');
    const reason = 'The native engine published no CP for this vehicle.';
    stubStability(stabilityAnalysis({ cpUnavailable: reason }));
    render(<Tooltip.Provider><AirframeStage /></Tooltip.Provider>);
    const warning = await screen.findByText(`No geometry margin or verdict: ${reason}`);
    const warningNode = warning.closest('[data-margin-unavailable]') as HTMLElement;
    expect(warningNode).not.toBeNull();
    expect(warningNode.closest('[data-fold]')).toBeNull();
    const strip = stabilityCard();
    expect(within(strip).queryByRole('button', { name: 'More' })).toBeNull();
    expect(warningNode.textContent).toBe(`No geometry margin or verdict: ${reason}`);
    expect(strip.textContent).toContain(ROLLUP);
  });
});

describe('Verify Validation card', () => {
  it('starts closed, opens on the heading, and stays open across a remount', () => {
    render(<VerifyStage />);
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
    render(<VerifyStage />);
    toggle = screen.getByRole('button', { name: /Validation · does the model match reality\?/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    panel = document.getElementById(toggle.getAttribute('aria-controls')!) as HTMLElement;
    expect(panel.hidden).toBe(false);
  });
});
