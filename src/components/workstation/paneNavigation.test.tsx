/**
 * Narrow-viewport pane routing (enterprise P0/Astra-3: WorkstationShell
 * hid the Context list below md and the Inspector below lg with NO labeled
 * alternative — task loss, not responsive design). Below the lg breakpoint
 * the shell must show a labeled single-region nav reaching Context /
 * Workspace / Inspector, keep every region mounted across switches, and
 * move focus into the revealed region.
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkstationShell } from './WorkstationShell';
import { useRocketStore } from '../../store/rocketStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useRunStore } from '../../store/runStore';
import { useEditBufferStore } from '../../store/editBufferStore';
import type { RocketVehicle } from '../../core/types';

const ALPHA_CLASS_VEHICLE: RocketVehicle = {
  id: 'narrow-alpha',
  name: 'Narrow Alpha',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'n-nc',
      name: 'Ogive Nosecone',
      type: 'nosecone',
      shape: 'ogive',
      length: 0.165,
      baseDiameter: 0.0248,
      wallThickness: 0.0015,
      isHollow: true,
      materialId: 'pla_3dprint',
      color: '#ef4444',
    },
    {
      id: 'n-bt',
      name: 'Main Body Tube',
      type: 'bodytube',
      length: 0.311,
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      isMotorMount: true,
      materialId: 'cardboard',
      color: '#ffffff',
    },
    {
      id: 'n-fins',
      name: 'Stabilizer Fins',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.07,
      tipChord: 0.028,
      span: 0.051,
      sweepLength: 0.038,
      thickness: 0.002,
      crossSection: 'rounded',
      axialOffset: 0.241,
      materialId: 'pla_3dprint',
      color: '#ef4444',
    },
  ],
};

const originalMatchMedia = window.matchMedia;

/** Forces the shell onto the narrow layout (below the lg breakpoint). */
function mockNarrowViewport(): void {
  const mql = {
    matches: true,
    media: '(max-width: 1023px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  window.matchMedia = vi.fn().mockReturnValue(mql);
}

function renderNarrowShell() {
  mockNarrowViewport();
  const rocket = useRocketStore.getState();
  rocket.resetStore();
  rocket.setVehicle(ALPHA_CLASS_VEHICLE);
  rocket.selectMotor('estes_c6');
  useWorkspaceStore.getState().selectStudio('airframe');
  useWorkspaceStore.getState().setFilter('all');
  useRunStore.getState().resetRuns();
  useEditBufferStore.getState().discardAll();
  return render(<WorkstationShell />);
}

const paneTab = (label: string) => screen.getByRole('tab', { name: label });
const panePanel = (label: string) => screen.getByRole('tabpanel', { name: label });

describe('narrow pane navigation (below lg)', () => {
  beforeEach(renderNarrowShell);
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('shows a labeled pane nav reaching Context, Workspace, and Inspector', () => {
    expect(screen.getByRole('tablist', { name: 'Pane regions' })).toBeTruthy();
    for (const label of ['Context', 'Workspace', 'Inspector']) {
      expect(paneTab(label)).toBeTruthy();
    }
  });

  it('reaches the Inspector through the nav (no orphaned pane below the breakpoint)', () => {
    // Default region is the studio Workspace; Inspector is one labeled step away.
    expect(screen.queryByRole('tabpanel', { name: 'Inspector' })).toBeNull();
    fireEvent.click(paneTab('Inspector'));
    const inspector = panePanel('Inspector');
    expect(inspector.getAttribute('data-pane-region')).toBe('inspector');
    // The RightPane surface for the active studio is reachable once routed
    // (airframe studio renders the PropertyInspector).
    expect(inspector.textContent).toMatch(/Component Name/);
    // Focus continuity: keyboard users land inside the revealed region.
    expect(document.activeElement).toBe(inspector);
  });

  it('reaches the Context list (assembly tree) through the nav', () => {
    fireEvent.click(paneTab('Context'));
    const context = panePanel('Context');
    expect(context.getAttribute('data-pane-region')).toBe('context');
    expect(context.textContent).toMatch(/Axial Assembly/);
  });

  it('keeps studio inputs mounted across pane switches (no remount wipe)', () => {
    fireEvent.keyDown(document.body, { key: '4' }); // digit shortcut still switches studios in narrow mode
    const runs = screen.getByLabelText('Monte Carlo run count') as HTMLInputElement;
    fireEvent.change(runs, { target: { value: '5' } });
    expect(runs.value).toBe('5');

    fireEvent.click(paneTab('Context'));
    const workspaceRegion = document.querySelector('[data-pane-region="workspace"]');
    // The workspace region is hidden (never unmounted) while another pane shows.
    expect(workspaceRegion?.getAttribute('hidden')).not.toBeNull();
    expect(useWorkspaceStore.getState().studio).toBe('trajectory');

    fireEvent.click(paneTab('Workspace'));
    expect(document.querySelector('[data-pane-region="workspace"]')?.getAttribute('hidden')).toBeNull();
    expect((screen.getByLabelText('Monte Carlo run count') as HTMLInputElement).value).toBe('5');
  });

  it('switches pane regions with the arrow keys and moves focus along', () => {
    const tablist = screen.getByRole('tablist', { name: 'Pane regions' });
    // Workspace is active: ArrowLeft moves to Context (wraps).
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(panePanel('Context').getAttribute('data-pane-region')).toBe('context');
    // The focused element is the newly selected tab.
    expect(document.activeElement?.getAttribute('data-pane-tab')).toBe('context');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.queryByRole('tabpanel', { name: 'Inspector' })).toBeNull(); // back to Workspace
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tabpanel', { name: 'Inspector' }).getAttribute('data-pane-region')).toBe('inspector');
  });
});