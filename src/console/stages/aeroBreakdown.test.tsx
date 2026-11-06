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

import { AeroStage } from './Aero';
import { NON_LIFTING_FOOTNOTE } from './aeroBreakdownText';
import { useProjectStore } from '../../state/project';
import { consoleJobStub, installTestEngine, resetConsoleState, stabilityAnalysis } from '../testFixtures';
import type { ComponentContribution, StabilityAnalysis } from '../../core/types';

/** Body tubes and parachutes publish no CNα; one coupler publishes an exact zero. */
const contributions: ComponentContribution[] = [
  { id: 'nsl-nc', name: 'Von Kármán Nosecone', type: 'nosecone', mass: 1.14, cg: 0.3, cna: 2, cp: 0.3, axialStart: 0, axialEnd: 0.65 },
  { id: 'nsl-bt1', name: 'Payload & Avionics Bay', type: 'bodytube', mass: 2.27, cg: 1.02, axialStart: 0.65, axialEnd: 1.4 },
  { id: 'nsl-trans', name: 'Airframe Coupler', type: 'bodytube', mass: 0.455, cg: 1.46, cna: 0, axialStart: 1.4, axialEnd: 1.52 },
  { id: 'nsl-bt2', name: 'Booster & Motor Section', type: 'bodytube', mass: 4.38, cg: 2.2, axialStart: 1.52, axialEnd: 2.97 },
  { id: 'nsl-fins', name: 'High-Power Clipped Delta Fins', type: 'trapezoidfinset', mass: 1.18, cg: 2.8, cna: 18, cp: 2.8, axialStart: 2.6, axialEnd: 2.92 },
  { id: 'nsl-drogue', name: 'Drogue Parachute (Apogee)', type: 'parachute', mass: 0.18, cg: 1.7, axialStart: 1.6, axialEnd: 1.8 },
  { id: 'nsl-main', name: 'Main Parachute (700ft AGL)', type: 'parachute', mass: 0.75, cg: 2.3, axialStart: 2.2, axialEnd: 2.4 },
  // An unsupported outline the vehicle cannot type: it must stay a distinct warning row.
  { id: 'nsl-unsupported', name: 'Unsupported fin set', type: 'freeformfinset', mass: 0.2, cg: 2.8, axialStart: 2.6, axialEnd: 2.9 },
];

let teardown: (() => void) | null = null;

const INTRO = 'Subsonic component geometry and mass rollup; excludes the selected motor and depletion history. Pad all-up, burnout and powered-flight minimum margins are unavailable here.';

/** jsdom lays nothing out; this stubs both metrics on fold text nodes only. */
function stubFoldWidth(scrollWidth: number, clientWidth: number): () => void {
  const proto = HTMLElement.prototype;
  const originalScroll = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
  const originalClient = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.dataset.foldText === undefined ? 0 : scrollWidth; },
  });
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.dataset.foldText === undefined ? 0 : clientWidth; },
  });
  return () => {
    if (originalScroll === undefined) Reflect.deleteProperty(proto, 'scrollWidth');
    else Object.defineProperty(proto, 'scrollWidth', originalScroll);
    if (originalClient === undefined) Reflect.deleteProperty(proto, 'clientWidth');
    else Object.defineProperty(proto, 'clientWidth', originalClient);
  };
}

beforeEach(() => {
  resetConsoleState();
  consoleJobStub();
  useProjectStore.getState().loadPreset('nasaStudent');
  teardown = installTestEngine(async (cmd: string) => (
    cmd === 'stability' ? stabilityAnalysis({ contributions } as Partial<StabilityAnalysis>) : {}
  )).teardown;
});

afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
});

describe('Aero stability breakdown presentation', () => {
  it('presents non-lifting parts as secondary table rows with dashes, one footnote and no sentences', async () => {
    render(<Tooltip.Provider><AeroStage /></Tooltip.Provider>);
    await screen.findByText(/Subsonic component geometry and mass rollup/);

    // The first column is the part, not "lifting surface".
    expect(screen.getByRole('columnheader', { name: 'Part' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Lifting surface' })).toBeNull();

    // One quiet group divider, then one row per secondary part (body tubes, parachutes, exact zero).
    expect(screen.getByText('Not lifting surfaces')).toBeTruthy();
    const secondaryRows = [...document.querySelectorAll('[data-table-section="secondary"]')];
    expect(secondaryRows).toHaveLength(5);
    const secondaryNames = secondaryRows.map((r) => r.textContent ?? '').join(' ');
    for (const name of ['Payload & Avionics Bay', 'Airframe Coupler', 'Booster & Motor Section', 'Drogue Parachute (Apogee)', 'Main Parachute (700ft AGL)']) {
      expect(secondaryNames).toContain(name);
    }

    // An unknown CNα is never printed as zero; an engine exact zero is.
    const avionics = secondaryRows.find((r) => r.textContent?.includes('Payload & Avionics Bay'))!;
    expect(within(avionics as HTMLElement).getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(avionics.textContent).not.toContain('0.00');
    const coupler = secondaryRows.find((r) => r.textContent?.includes('Airframe Coupler'))!;
    expect(coupler.textContent).toContain('0.00');
    expect(coupler.textContent).toContain('/rad');

    // One footnote replaces the per-type sentences.
    expect(screen.getByText(NON_LIFTING_FOOTNOTE)).toBeTruthy();
    expect(screen.queryByText(/engine reports no CNα or CP/)).toBeNull();
    expect(screen.queryByText(/carries no lift|carry no lift/)).toBeNull();
    expect(screen.queryByText(/CNα N\/A/)).toBeNull();

    // An unknown row outside the non-lifting types keeps the engine's reason.
    const warning = document.querySelector('[data-unknown-row]');
    expect(warning?.textContent).toContain('Unsupported fin set');
    expect(warning?.textContent).toContain('CNα and CP are not reported.');
    expect(warning?.textContent).toContain('The native engine did not publish a normal-force slope for this part.');
  });

  it('folds the stability-breakdown intro to one ellipsized line with More only when it overflows', async () => {
    const restore = stubFoldWidth(500, 100);
    try {
      render(<Tooltip.Provider><AeroStage /></Tooltip.Provider>);
      const text = await screen.findByText(/Subsonic component geometry and mass rollup/);
      expect(text.textContent).toBe(INTRO);
      expect(text.className).toContain('truncate');
      const fold = text.closest('[data-fold]') as HTMLElement;
      const more = within(fold).getByRole('button', { name: 'More' });
      expect(more.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(more);
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(text.className).not.toContain('truncate');
      expect(text.textContent).toBe(INTRO);
    } finally {
      cleanup();
      restore();
    }
  });

  it('leaves the intro unchanged with no More when it fits', async () => {
    const restore = stubFoldWidth(100, 100);
    try {
      render(<Tooltip.Provider><AeroStage /></Tooltip.Provider>);
      const text = await screen.findByText(/Subsonic component geometry and mass rollup/);
      expect(text.textContent).toBe(INTRO);
      const fold = text.closest('[data-fold]') as HTMLElement;
      expect(fold.querySelector('[data-fold-toggle]')).toBeNull();
      expect(within(fold).queryByRole('button', { name: 'More' })).toBeNull();
    } finally {
      cleanup();
      restore();
    }
  });
});
