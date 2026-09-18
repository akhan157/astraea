/**
 * PropertyInspector BodyTubeControls contract (jsdom).
 *
 * Round-19: the "Is Motor Mount" checkbox binds to the mounted component's
 * isMotorMount field via updateComponent. Clearing a stray second mount is
 * the UI path that unblocks a multi-mount import (FlightSim disables its run
 * while ambiguity persists).
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PropertyInspector } from './PropertyInspector';
import { WorkstationShell } from './workstation/WorkstationShell';
import { useRocketStore } from '../store/rocketStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useRunStore } from '../store/runStore';
import { useEditBufferStore } from '../store/editBufferStore';
import type { BodyTubeComponent } from '../core/types';

/** The Inner Diameter number input of the bodytube controls. */
const innerDiameterInput = (): HTMLInputElement => {
  const label = [...document.querySelectorAll('span')].find((s) => s.textContent?.trim() === 'Inner Diameter');
  if (!label) throw new Error('Inner Diameter field not rendered');
  const input = label.parentElement?.querySelector('input[type="number"]') as HTMLInputElement | null;
  if (!input) throw new Error('Inner Diameter number input not rendered');
  return input;
};

const mountedTube = (): BodyTubeComponent => {
  const tube = useRocketStore
    .getState()
    .vehicle.components.find((c) => c.id === 'alpha-bt') as BodyTubeComponent;
  return tube;
};

describe('PropertyInspector motor-mount checkbox', () => {
  beforeEach(() => {
    useRocketStore.getState().resetStore();
  });

  it('binds the checkbox to updateComponent on a body tube', () => {
    const store = useRocketStore.getState();
    store.selectComponent('alpha-bt');
    render(<PropertyInspector />);

    const checkbox = screen.getByLabelText('Is motor mount') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    // Unchecking writes isMotorMount=false through the store.
    fireEvent.click(checkbox);
    const tube = useRocketStore
      .getState()
      .vehicle.components.find((c) => c.id === 'alpha-bt') as BodyTubeComponent;
    expect(tube.isMotorMount).toBe(false);

    // Re-checking restores the flag.
    const again = screen.getByLabelText('Is motor mount') as HTMLInputElement;
    expect(again.checked).toBe(false);
    fireEvent.click(again);
    const after = useRocketStore
      .getState()
      .vehicle.components.find((c) => c.id === 'alpha-bt') as BodyTubeComponent;
    expect(after.isMotorMount).toBe(true);
  });

  it('shows the checkbox for non-mount body tubes so a flag can be added', () => {
    const store = useRocketStore.getState();
    store.setVehicle({
      ...store.vehicle,
      id: 'add-mount',
      components: store.vehicle.components.map((c) =>
        c.type === 'bodytube' ? { ...c, isMotorMount: undefined } : c,
      ),
    });
    store.selectComponent('alpha-bt');
    render(<PropertyInspector />);

    const checkbox = screen.getByLabelText('Is motor mount') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    const tube = useRocketStore
      .getState()
      .vehicle.components.find((c) => c.id === 'alpha-bt') as BodyTubeComponent;
    expect(tube.isMotorMount).toBe(true);
  });
});

describe('PropertyInspector Inner Diameter solid-mount commit', () => {
  beforeEach(() => {
    useRocketStore.getState().resetStore();
  });

  it('commits a typed 0 mm Inner Diameter as exactly 0 m so the solid-mount sentinel can trigger', () => {
    const store = useRocketStore.getState();
    store.selectComponent('alpha-bt');
    render(<PropertyInspector />);

    fireEvent.change(innerDiameterInput(), { target: { value: '0' } });

    expect(mountedTube().innerDiameter).toBe(0);
  });
});

describe('solid-mount repair chain (Inner Diameter 0)', () => {
  beforeEach(() => {
    const rocket = useRocketStore.getState();
    rocket.resetStore();
    rocket.selectMotor('estes_c6');
    useWorkspaceStore.getState().selectStudio('airframe');
    useWorkspaceStore.getState().setFilter('all');
    useRunStore.getState().resetRuns();
    useEditBufferStore.getState().discardAll();
  });

  it('surfaces action-needed row, trajectory repair link, and filter-hides label after committing Inner Diameter 0', async () => {
    const rocket = useRocketStore.getState();
    rocket.selectComponent('alpha-bt');
    render(<WorkstationShell />);

    // Type 0 into Inner Diameter; Apply commits the staged edit to the store.
    fireEvent.change(innerDiameterInput(), { target: { value: '0' } });
    fireEvent.click(screen.getByTitle('Apply staged edits as one undoable step'));

    // The committed value is exactly the solid-mount sentinel (0 m).
    await waitFor(() => expect(mountedTube().innerDiameter).toBe(0));

    // 1) The tree row carries action-needed, not a silent Selected.
    await waitFor(() =>
      expect(document.querySelector('[data-component-id="alpha-bt"]')?.getAttribute('data-state')).toBe('action-needed'),
    );

    // 2) Trajectory run readiness shows the solid-mount repair link.
    await waitFor(() =>
      expect(document.querySelector('[data-run-readiness]')?.textContent).toMatch(/solid tube \(no bore\)/),
    );
    useWorkspaceStore.getState().selectStudio('trajectory');
    await waitFor(() =>
      expect(document.querySelector('[aria-label="Run readiness"]')?.textContent).toMatch(/No motor mount — mark a mount tube in Airframe/),
    );

    // 3) Filter=Recovery hides the mount -> the labeled empty state, never silence.
    useWorkspaceStore.getState().selectStudio('airframe');
    useWorkspaceStore.getState().setFilter('parachute');
    await waitFor(() =>
      expect(document.querySelector('[data-filter-hides-repair="true"]')?.textContent).toMatch(/Repair target hidden by the current filter/),
    );
  });
});
