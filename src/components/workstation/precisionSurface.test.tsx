/**
 * RIVAL S2 — the precision/canvas-led surface (the direction the run/
 * comparison-led ui2 S2 shell does not prototype): type/scope pick filter
 * with three-state highlight, the explicit edit-commit boundary, compare vs
 * the saved revision, and the whole-design run — all keyboard-operable, all on
 * the same S1 selectors.
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkstationShell } from './WorkstationShell';
import { useRocketStore } from '../../store/rocketStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useRunStore } from '../../store/runStore';
import { useEditBufferStore } from '../../store/editBufferStore';
import type { RocketComponent, RocketVehicle } from '../../core/types';

const TWO_MOUNT_VEHICLE: RocketVehicle = {
  id: 'precision-vehicle',
  name: 'Precision Vehicle',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'pv-nc',
      name: 'Precision Nosecone',
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
      id: 'pv-bt1',
      name: 'Fore Body Tube',
      type: 'bodytube',
      length: 0.3,
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      isMotorMount: true,
      materialId: 'cardboard',
    },
    {
      id: 'pv-bt2',
      name: 'Aft Body Tube',
      type: 'bodytube',
      length: 0.3,
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      isMotorMount: true,
      materialId: 'cardboard',
    },
    {
      id: 'pv-fins',
      name: 'Precision Fins',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.07,
      tipChord: 0.028,
      span: 0.051,
      sweepLength: 0.038,
      thickness: 0.002,
      crossSection: 'rounded',
      axialOffset: 0.24,
      materialId: 'pla_3dprint',
    },
  ],
};

function renderShell(vehicleOverride: RocketVehicle | null = TWO_MOUNT_VEHICLE) {
  const rocket = useRocketStore.getState();
  rocket.resetStore();
  if (vehicleOverride) rocket.setVehicle(vehicleOverride);
  rocket.selectMotor('estes_c6');
  useWorkspaceStore.getState().selectStudio('airframe');
  useWorkspaceStore.getState().setFilter('all');
  useWorkspaceStore.getState().setCompareActive(false);
  useRunStore.getState().resetRuns();
  useEditBufferStore.getState().discardAll();
  return render(<WorkstationShell />);
}

const treeRow = (id: string): HTMLElement | null => document.querySelector(`[data-component-id="${id}"]`);

const storedComponent = (id: string) =>
  useRocketStore.getState().vehicle.components.find((c) => c.id === id) as RocketComponent;

describe('precision pick surface', () => {
  beforeEach(() => renderShell());

  it('filters the assembly tree by type family with counts', () => {
    expect(treeRow('pv-nc')).toBeTruthy();
    expect(treeRow('pv-bt1')).toBeTruthy();
    fireEvent.click(screen.getByTitle(/Body tube components/));
    expect(treeRow('pv-nc')).toBeNull();
    expect(treeRow('pv-bt1')).toBeTruthy();
    expect(treeRow('pv-bt2')).toBeTruthy();
    expect(screen.getByTitle(/Fin-set components/)).toBeTruthy();
  });

  it('marks ambiguous mounts action-needed with the three-state highlight', () => {
    // Selection starts on the first component; keep it there so both flagged
    // mount rows must surface the action-needed state (never a silent pass).
    useRocketStore.getState().selectComponent('pv-nc');
    expect(treeRow('pv-bt1')?.getAttribute('data-state')).toBe('action-needed');
    expect(treeRow('pv-bt2')?.getAttribute('data-state')).toBe('action-needed');
    expect(screen.getByText(/Action needed · 2/)).toBeTruthy();
    expect(treeRow('pv-nc')?.getAttribute('data-state')).toBe('selected');
  });

  it('marks the selected row selected and switches on click', () => {
    // pv-fins is a fin (no mount repair), so selecting it yields plain
    // 'selected' — the repair rows keep 'action-needed' (see the coexistence
    // test below for a mount that is BOTH).
    fireEvent.click(treeRow('pv-fins') as HTMLElement);
    expect(treeRow('pv-fins')?.getAttribute('data-state')).toBe('selected');
    expect(treeRow('pv-nc')?.getAttribute('data-state')).toBe('candidate');
  });

  it('keeps the repair badge and count when a mount is selected (selection never suppresses action-needed)', () => {
    // pv-bt1 is an ambiguous mount (both tubes flagged). Selecting it must
    // NOT demote the row to plain 'selected': the repair badge and the
    // legend count stay, because repair context is orthogonal to selection.
    useRocketStore.getState().selectComponent('pv-bt1');
    expect(treeRow('pv-bt1')?.getAttribute('data-state')).toBe('action-needed');
    expect(treeRow('pv-bt1')?.textContent).toMatch(/needs action/);
    expect(treeRow('pv-bt2')?.getAttribute('data-state')).toBe('action-needed');
    expect(screen.getByText(/Action needed · 2/)).toBeTruthy();
  });

  it('shows a labeled empty state when a filter hides the mount a repair targets', () => {
    // Both PV mounts are ambiguous → action-needed; the fin filter hides
    // them, so the tree must say so instead of silently dropping the rows.
    fireEvent.click(screen.getByTitle(/Fin-set components/));
    expect(treeRow('pv-bt1')).toBeNull();
    expect(treeRow('pv-bt2')).toBeNull();
    const notice = document.querySelector('[data-filter-hides-repair]');
    expect(notice).toBeTruthy();
    expect(notice?.textContent).toMatch(/2 repair targets hidden/);
    expect(notice?.textContent).toMatch(/Fore Body Tube/);
  });

  it('labels a filter that matches no rows at all', () => {
    fireEvent.click(screen.getByTitle(/Fin-set components/));
    // (there is a fin row here, so use the Mass filter which matches none)
    fireEvent.click(screen.getByTitle(/Mass components/));
    expect(document.querySelector('[data-tree-filter-empty]')).toBeTruthy();
  });
});

describe('edit commit boundary', () => {
  beforeEach(() => renderShell());

  it('stages inspector edits into a pending buffer; Apply commits one step', async () => {
    useRocketStore.getState().selectComponent('pv-bt2');
    const nameInput = (await waitFor(() => screen.getByDisplayValue('Aft Body Tube'))) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Aft Tube (revised)' } });

    await waitFor(() => {
      const strip = document.querySelector('[data-edit-pending]');
      expect(strip?.getAttribute('data-edit-pending')).toBe('1');
    });
    // The engineering store is untouched until Apply.
    expect(storedComponent('pv-bt2').name).toBe('Aft Body Tube');

    fireEvent.click(screen.getByTitle('Apply staged edits as one undoable step'));
    await waitFor(() => {
      expect(storedComponent('pv-bt2').name).toBe('Aft Tube (revised)');
      expect(document.querySelector('[data-edit-pending]')?.getAttribute('data-edit-pending')).toBe('0');
    });
  });

  it('Escape discards staged edits without touching the store', async () => {
    useRocketStore.getState().selectComponent('pv-bt1');
    const nameInput = (await waitFor(() => screen.getByDisplayValue('Fore Body Tube'))) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Draft only' } });
    await waitFor(() => {
      expect(document.querySelector('[data-edit-pending]')?.getAttribute('data-edit-pending')).toBe('1');
    });

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => {
      expect(document.querySelector('[data-edit-pending]')?.getAttribute('data-edit-pending')).toBe('0');
      expect(storedComponent('pv-bt1').name).toBe('Fore Body Tube');
    });
  });

  it('shows the pending badge in the precision bar and the discard button clears it', async () => {
    useRocketStore.getState().selectComponent('pv-bt1');
    const nameInput = (await waitFor(() => screen.getByDisplayValue('Fore Body Tube'))) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByText(/1 pending edit/)).toBeTruthy());
    fireEvent.click(screen.getByTitle('Discard staged edits (Esc)'));
    await waitFor(() => expect(screen.queryByText(/1 pending edit/)).toBeNull());
  });
});

describe('compare vs saved', () => {
  beforeEach(() => renderShell());

  it('opens the dock, lists differences, adjusts the blend, and closes', () => {
    // Modify a dimension so the current design diverges from the saved
    // revision (the newest pre-edit snapshot captured by setVehicle).
    useRocketStore.getState().updateComponent('pv-bt1', { length: 0.34 });

    fireEvent.click(screen.getByTitle(/Compare the current design/));
    const dock = document.querySelector('[data-compare-dock]');
    expect(dock).toBeTruthy();
    expect(Number(dock?.getAttribute('data-compare-rows'))).toBeGreaterThan(0);

    const blend = screen.getByLabelText('Compare blend — saved geometry opacity') as HTMLInputElement;
    fireEvent.change(blend, { target: { value: '80' } });
    expect(blend.value).toBe('80');

    fireEvent.click(screen.getByLabelText('Close compare'));
    expect(document.querySelector('[data-compare-dock]')).toBeNull();
  });

  it('reports no prior revision honestly when history is empty', () => {
    useRocketStore.getState().resetStore();
    fireEvent.click(screen.getByTitle(/Compare the current design/));
    expect(screen.getByText(/No prior revision exists yet/)).toBeTruthy();
  });
});

describe('run from selection', () => {
  beforeEach(() => renderShell());

  it('visibly scopes the precision run chip as whole-design, not title-only', () => {
    const chip = document.querySelector('[data-run-design]');
    expect(chip).toBeTruthy();
    expect(chip?.getAttribute('data-run-selection')).toBeNull();
    expect(chip?.textContent).toMatch(/Run current design/);
  });

  it('launches routine simulation from the selection chip without a modal', async () => {
    fireEvent.click(screen.getByTitle(/Run the routine ensemble/));
    await waitFor(() => expect(screen.getByRole('main').getAttribute('aria-label')).toBe('Trajectory & Weather workspace'), {
      timeout: 5000,
    });
    expect(document.querySelectorAll('[data-run-inline]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});