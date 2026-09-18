/**
 * ComponentTree keyboard operability (enterprise P0/Astra-3): rows were
 * clickable divs with no role/tabIndex/keyboard activation, and move/delete
 * actions were hover-only. Pins: rows are treeitems with a roving tabindex,
 * Enter/Space/arrow keys select, and row actions are real buttons visible
 * without hover with keyboard equivalents.
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ComponentTree } from './ComponentTree';
import { useRocketStore } from '../store/rocketStore';
import type { RocketVehicle } from '../core/types';

const VEHICLE: RocketVehicle = {
  id: 'tree-vehicle',
  name: 'Tree Vehicle',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 't-nc',
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
      id: 't-bt',
      name: 'Main Body Tube',
      type: 'bodytube',
      length: 0.311,
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      materialId: 'cardboard',
      color: '#ffffff',
    },
    {
      id: 't-chute',
      name: '12 inch Parachute',
      type: 'parachute',
      diameter: 0.305,
      cd: 0.8,
      mass: 0.008,
      axialOffset: 0.05,
      materialId: 'cardboard',
    },
  ],
};

function renderTree() {
  const rocket = useRocketStore.getState();
  rocket.resetStore();
  rocket.setVehicle(VEHICLE);
  return render(<ComponentTree />);
}

const row = (name: string) => screen.getByRole('treeitem', { name });
const moveUpButtons = () => screen.getAllByRole('button', { name: 'Move up' });
const moveDownButtons = () => screen.getAllByRole('button', { name: 'Move down' });
const removeButtons = () => screen.getAllByRole('button', { name: 'Remove component' });
const selected = () => useRocketStore.getState().selectedComponentId;

describe('ComponentTree keyboard operation', () => {
  beforeEach(renderTree);

  it('selects a row with Enter and Space, moving the roving tabindex', () => {
    // setVehicle auto-selects the first component: exactly one tabbable row.
    expect(row('Ogive Nosecone').getAttribute('tabindex')).toBe('0');
    expect(row('Main Body Tube').getAttribute('tabindex')).toBe('-1');

    const bt = row('Main Body Tube');
    bt.focus();
    fireEvent.keyDown(bt, { key: ' ' });
    expect(selected()).toBe('t-bt');
    expect(bt.getAttribute('aria-selected')).toBe('true');
    expect(bt.getAttribute('tabindex')).toBe('0');
    expect(row('Ogive Nosecone').getAttribute('tabindex')).toBe('-1');

    const chute = row('12 inch Parachute');
    chute.focus();
    fireEvent.keyDown(chute, { key: 'Enter' });
    expect(selected()).toBe('t-chute');
    expect(chute.getAttribute('aria-selected')).toBe('true');
  });

  it('moves selection with arrow keys and home/end, focusing the moved row', () => {
    const bt = row('Main Body Tube');
    bt.focus();
    fireEvent.keyDown(bt, { key: 'ArrowDown' });
    expect(selected()).toBe('t-chute');
    expect(document.activeElement?.getAttribute('data-component-id')).toBe('t-chute');

    fireEvent.keyDown(screen.getByRole('treeitem', { name: '12 inch Parachute' }), { key: 'ArrowUp' });
    expect(selected()).toBe('t-bt');

    fireEvent.keyDown(row('Main Body Tube'), { key: 'Home' });
    expect(selected()).toBe('t-nc');
    fireEvent.keyDown(row('Ogive Nosecone'), { key: 'End' });
    expect(selected()).toBe('t-chute');
  });

  it('does not hijack Enter/Space pressed on a row action button', () => {
    useRocketStore.getState().selectComponent('t-nc');
    // Second treeitem's Move-up button (the row is t-bt).
    const markup = moveUpButtons()[1];
    fireEvent.keyDown(markup, { key: 'Enter' });
    expect(selected()).toBe('t-nc'); // the row itself must NOT have been selected
    fireEvent.keyDown(markup, { key: ' ' });
    expect(selected()).toBe('t-nc');
  });
});

describe('ComponentTree row actions', () => {
  beforeEach(renderTree);

  it('exposes move/delete actions visible without hover, with keyboard equivalents', () => {
    // Real buttons in the a11y tree: visible, not hover-gated.
    expect(moveUpButtons().length).toBe(3);
    expect(moveDownButtons().length).toBe(3);
    expect(removeButtons().length).toBe(3);
    for (const btn of [...moveUpButtons(), ...moveDownButtons(), ...removeButtons()]) {
      expect(btn.className).not.toContain('opacity-0');
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('tabindex')).not.toBe('-1'); // keyboard-reachable
    }
  });

  it('removes a component from the row button (keyboard equivalent works)', () => {
    fireEvent.click(removeButtons()[1]); // Main Body Tube
    expect(useRocketStore.getState().vehicle.components.map((c) => c.id)).toEqual(['t-nc', 't-chute']);
  });

  it('reorders with the visible move buttons', () => {
    fireEvent.click(moveDownButtons()[0]); // move nosecone down
    expect(useRocketStore.getState().vehicle.components.map((c) => c.id)).toEqual(['t-bt', 't-nc', 't-chute']);
  });
});