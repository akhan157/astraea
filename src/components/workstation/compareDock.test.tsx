/**
 * RIVAL S2 trust pass — CompareDock recency + no-fabrication pins
 * (mirrors A's `compareDock.test.tsx` in the ui2 lane and fixes the
 * B-blocking `history[0]` basis: enterprise critique must-fix #5, Astra
 * critique P0 #4).
 *
 * Pins: the dock stays closed until toggled; with no checkpoint it reports
 * the absent basis instead of fabricating a comparison (dock rows 0, shell
 * overlay null); after TWO commits the diff basis is the LATEST pre-edit
 * snapshot (history tail) — never the oldest retained one — and the header
 * names the checkpoint's own version, not the current vehicle's.
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { WorkstationShell } from './WorkstationShell';
import { useRocketStore } from '../../store/rocketStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useRunStore } from '../../store/runStore';
import { useEditBufferStore } from '../../store/editBufferStore';
import type { RocketVehicle } from '../../core/types';

const BASE: RocketVehicle = {
  id: 'recency-vehicle',
  name: 'Recency Vehicle',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'rv-x',
      name: 'Original X',
      type: 'bodytube',
      length: 0.2,
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      materialId: 'cardboard',
    },
    {
      id: 'rv-y',
      name: 'Original Y',
      type: 'nosecone',
      shape: 'ogive',
      length: 0.1,
      baseDiameter: 0.0248,
      wallThickness: 0.0015,
      isHollow: true,
      materialId: 'pla_3dprint',
      color: '#ef4444',
    },
  ],
};

// Two commits, each touching a DIFFERENT component, so the diff-basis
// regression discriminates cleanly:
//   history = [BASE, one]; vehicle = two
//   tail (correct) = one   → 1 modified row (rv-y)
//   history[0] (old bug) = BASE → 2 modified rows (rv-x AND rv-y)
function seedTwoCommits() {
  const rocket = useRocketStore.getState();
  rocket.resetStore();
  useRocketStore.setState({ vehicle: BASE, history: [], future: [] });
  const one: RocketVehicle = {
    ...BASE,
    version: '1.1',
    components: BASE.components.map((c) => (c.id === 'rv-x' ? { ...c, name: 'Commit One X' } : c)),
  };
  const two: RocketVehicle = {
    ...one,
    version: '1.2',
    components: one.components.map((c) => (c.id === 'rv-y' ? { ...c, name: 'Commit Two Y' } : c)),
  };
  rocket.applyVehicleDraft(one);
  rocket.applyVehicleDraft(two);
}

function renderShell() {
  useRocketStore.getState().selectMotor('estes_c6');
  useWorkspaceStore.getState().selectStudio('airframe');
  useWorkspaceStore.getState().setFilter('all');
  useWorkspaceStore.getState().setCompareActive(false);
  useWorkspaceStore.getState().setCompareBlend(40);
  useRunStore.getState().resetRuns();
  useEditBufferStore.getState().discardAll();
  return render(<WorkstationShell />);
}

describe('CompareDock recency + no fabrication', () => {
  beforeEach(() => {
    useRocketStore.getState().resetStore();
    useWorkspaceStore.getState().selectStudio('airframe');
    useWorkspaceStore.getState().setCompareActive(false);
    useRunStore.getState().resetRuns();
    useEditBufferStore.getState().discardAll();
  });

  it('stays closed until the compare toggle opens it', () => {
    useRocketStore.setState({ vehicle: BASE, history: [], future: [] });
    renderShell();
    expect(screen.queryByLabelText('Compare vs last saved')).toBeNull();
    fireEvent.click(screen.getByTitle(/Compare the current design/));
    expect(screen.getByLabelText('Compare vs last saved')).toBeTruthy();
  });

  it('REGRESSION — commits twice and diffs against the LATEST pre-edit snapshot (history tail), header shows the checkpoint version', () => {
    seedTwoCommits();
    renderShell();

    fireEvent.click(screen.getByTitle(/Compare the current design/));
    const dock = document.querySelector('[data-compare-dock]');
    expect(dock).toBeTruthy();

    // Tail basis (vehicle `one`) flags only the rv-y change; the old
    // history[0] basis (BASE) would flag rv-x as well → rows would be 2.
    expect(dock?.getAttribute('data-compare-rows')).toBe('1');
    expect(dock?.textContent).toMatch(/Commit Two Y/);
    expect(dock?.textContent).not.toMatch(/Commit One X/);

    // The header names the checkpoint version (1.1 = `one`), never the
    // current vehicle's version (1.2 = `two`).
    expect(dock?.textContent).toMatch(/v1\.1/);
    expect(dock?.textContent).not.toMatch(/v1\.2/);
  });

  it('never fabricates a blend overlay when no checkpoint exists (mirror of A no-fabrication test)', () => {
    // Empty history → checkpoint null even with the dock open and a blend set.
    renderShell();
    act(() => {
      useWorkspaceStore.getState().setCompareActive(true);
      useWorkspaceStore.getState().setCompareBlend(80);
    });

    const dock = document.querySelector('[data-compare-dock]');
    expect(dock?.getAttribute('data-compare-rows')).toBe('0');
    expect(screen.getByText(/No prior revision exists yet/)).toBeTruthy();

    // The viewport receives NO ghost overlay: vehicle null, opacity 0.
    const viewport = document.querySelector('[data-overlay-vehicle]');
    expect(viewport?.getAttribute('data-overlay-vehicle')).toBe('false');
    expect(viewport?.getAttribute('data-overlay-opacity')).toBe('0');
  });

  it('supplies the saved overlay only when a checkpoint exists', () => {
    // One committed edit → the checkpoint exists and the blend applies.
    useRocketStore.setState({ vehicle: BASE, history: [], future: [] });
    useRocketStore.getState().updateComponent('rv-x', { length: 0.34 });
    renderShell();
    act(() => {
      useWorkspaceStore.getState().setCompareActive(true);
      useWorkspaceStore.getState().setCompareBlend(80);
    });

    const viewport = document.querySelector('[data-overlay-vehicle]');
    expect(viewport?.getAttribute('data-overlay-vehicle')).toBe('true');
    expect(viewport?.getAttribute('data-overlay-opacity')).toBe('80');
  });
});