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
import { fireEvent, render, screen } from '@testing-library/react';
import { PropertyInspector } from './PropertyInspector';
import { useRocketStore } from '../store/rocketStore';
import type { BodyTubeComponent } from '../core/types';

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