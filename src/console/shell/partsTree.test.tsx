/**
 * Parts tree: keyboard operation, visible row actions, the add menu, and the
 * type-family filter with its repair-target disclosure.
 *
 * Ported from the legacy `ComponentTree` / `precisionSurface` assertions:
 * rows are treeitems with a roving tabindex, row buttons are real buttons
 * revealed on hover/focus-within yet reachable by Tab, structural edits reach
 * the store, and a filter that hides a repair target says so instead of going
 * silent.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartsTree } from './PartsTree';
import { consoleActions } from '../store';
import { useProjectStore } from '../../state/project';
import { useSessionStore } from '../../state/session';
import { useSelectionFilter } from '../../state/selection';
import { stubEngine } from '../testFixtures';

let teardown: () => void;

const components = () => useProjectStore.getState().project.vehicle.components;
const tubeIds = () => components().filter((c) => c.type === 'bodytube').map((c) => c.id);
const row = (id: string) => document.querySelector(`[data-component-id="${id}"]`) as HTMLElement;
const selected = () => useSessionStore.getState().selectedId;

beforeEach(() => {
  const stub = stubEngine();
  teardown = stub.teardown;
  useProjectStore.getState().loadPreset('nasaStudent');
  useSelectionFilter.getState().setFilter('all');
  useSessionStore.getState().setSelectedId(components()[0].id);
});

afterEach(() => {
  teardown();
  cleanup();
});

function renderTree() {
  return render(<PartsTree />);
}

describe('parts tree keyboard operation', () => {
  it('keeps a roving tabindex: exactly one tabbable row, on the selection', () => {
    renderTree();
    const rows = screen.getAllByRole('treeitem');
    expect(rows.length).toBe(components().length);
    const tabbable = rows.filter((r) => r.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0].getAttribute('data-component-id')).toBe(selected());
  });

  it('selects with Enter and Space and moves the roving tabindex', () => {
    renderTree();
    const ids = components().map((c) => c.id);
    const second = row(ids[1]);
    second.focus();
    fireEvent.keyDown(second, { key: ' ' });
    expect(selected()).toBe(ids[1]);
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(second.getAttribute('tabindex')).toBe('0');
    expect(row(ids[0]).getAttribute('tabindex')).toBe('-1');

    const third = row(ids[2]);
    third.focus();
    fireEvent.keyDown(third, { key: 'Enter' });
    expect(selected()).toBe(ids[2]);
    expect(third.getAttribute('aria-selected')).toBe('true');
  });

  it('moves selection and focus with arrows, Home and End', () => {
    renderTree();
    const ids = components().map((c) => c.id);
    const first = row(ids[0]);
    first.focus();

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(selected()).toBe(ids[1]);
    expect(document.activeElement?.getAttribute('data-component-id')).toBe(ids[1]);

    fireEvent.keyDown(row(ids[1]), { key: 'ArrowUp' });
    expect(selected()).toBe(ids[0]);

    fireEvent.keyDown(row(ids[0]), { key: 'End' });
    expect(selected()).toBe(ids[ids.length - 1]);
    fireEvent.keyDown(row(ids[ids.length - 1]), { key: 'Home' });
    expect(selected()).toBe(ids[0]);
  });

  it('never hijacks Enter or Space pressed on a row action button', () => {
    renderTree();
    const ids = components().map((c) => c.id);
    useSessionStore.getState().setSelectedId(ids[0]);
    const moveDown = screen.getAllByRole('button', { name: 'Move down' })[1];
    fireEvent.keyDown(moveDown, { key: 'Enter' });
    fireEvent.keyDown(moveDown, { key: ' ' });
    expect(selected()).toBe(ids[0]);
  });
});

describe('parts tree row actions', () => {
  it('exposes move and remove buttons as real buttons reachable by keyboard', () => {
    renderTree();
    const count = components().length;
    const moveUp = screen.getAllByRole('button', { name: 'Move up' });
    const moveDown = screen.getAllByRole('button', { name: 'Move down' });
    const remove = screen.getAllByRole('button', { name: 'Remove component' });
    expect(moveUp).toHaveLength(count);
    expect(moveDown).toHaveLength(count);
    expect(remove).toHaveLength(count);
    for (const btn of [...moveUp, ...moveDown, ...remove]) {
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  it('reorders through the visible move buttons as one undo step', () => {
    renderTree();
    const before = components().map((c) => c.id);
    const pastBefore = useProjectStore.getState().past.length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]);
    expect(components().map((c) => c.id)).toEqual([before[1], before[0], ...before.slice(2)]);
    expect(useProjectStore.getState().past).toHaveLength(pastBefore + 1);
  });

  it('removes through the row button, moving the selection, as one undo step', () => {
    renderTree();
    const ids = components().map((c) => c.id);
    const pastBefore = useProjectStore.getState().past.length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove component' })[1]);
    expect(components().map((c) => c.id)).not.toContain(ids[1]);
    expect(useProjectStore.getState().past).toHaveLength(pastBefore + 1);
    expect(selected()).not.toBeNull();
    expect(components().some((c) => c.id === selected())).toBe(true);
  });

  it('refuses to remove the last remaining part with an inline alert, not a dialog', () => {
    const only = components()[0];
    useProjectStore.setState({
      project: { ...useProjectStore.getState().project, vehicle: { ...useProjectStore.getState().project.vehicle, components: [only] } },
      past: [],
    });
    useSessionStore.getState().setSelectedId(only.id);
    renderTree();
    const remove = screen.getByRole('button', { name: 'Remove component' });
    expect((remove as HTMLButtonElement).disabled).toBe(true);

    // The store refuses too, and says why without throwing.
    expect(consoleActions.removeComponent(only.id)).toEqual({ ok: false, reason: 'A vehicle needs at least one part; add another before removing this one.' });
    expect(components()).toHaveLength(1);
  });

  it('locks structural edits while a filter hides parts, and says how to unlock them', () => {
    renderTree();
    fireEvent.click(screen.getByTitle(/Fin-set components/));
    for (const btn of screen.getAllByRole('button', { name: /Move up|Move down|Remove component/ })) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      expect(btn.getAttribute('title')).toMatch(/Switch the filter to All/);
    }
  });
});

describe('parts tree add menu', () => {
  it('adds every offered component type as one undo step and selects the new part', async () => {
    renderTree();
    const count = components().length;
    fireEvent.click(screen.getByRole('button', { name: /Add part/ }));
    const item = await screen.findByRole('button', { name: 'Body tube' });
    const pastBefore = useProjectStore.getState().past.length;
    fireEvent.click(item);
    await waitFor(() => expect(components()).toHaveLength(count + 1));
    expect(useProjectStore.getState().past).toHaveLength(pastBefore + 1);
    expect(components()[count].type).toBe('bodytube');
    expect(selected()).toBe(components()[count].id);
  });
});

describe('parts tree filter and mount repair', () => {
  it('filters by type family with counts', () => {
    renderTree();
    const ids = components().map((c) => c.id);
    const tubes = tubeIds();
    expect(row(ids[0])).toBeTruthy();

    const allCount = components().length;
    expect(screen.getByTitle(new RegExp(`All assembly components \\(${allCount}\\)`))).toBeTruthy();
    expect(screen.getByTitle(new RegExp(`Body tube components \\(${tubes.length}\\)`))).toBeTruthy();

    fireEvent.click(screen.getByTitle(/Body tube components/));
    expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(tubes.length);
    for (const id of tubes) expect(row(id)).toBeTruthy();
    expect(row(ids[0])).toBeNull();
  });

  it('marks a solid mount action-needed and keeps that state when the row is selected', () => {
    const tubes = tubeIds();
    for (const id of tubes) consoleActions.setComponent(id, { isMotorMount: false }, 'Clear mount flag');
    const tube = tubes[0];
    consoleActions.setComponent(tube, { isMotorMount: true, innerDiameter: 0 }, 'Solid mount');
    useSessionStore.getState().setSelectedId(tube);
    renderTree();
    expect(row(tube).getAttribute('data-state')).toBe('action-needed');
    expect(row(tube).textContent).toMatch(/needs action/);
    expect(screen.getByText(/Action needed · 1/)).toBeTruthy();
  });

  it('marks both ambiguous mounts action-needed without suppressing either', () => {
    const tubes = tubeIds();
    for (const id of tubes) consoleActions.setComponent(id, { isMotorMount: false }, 'Clear mount flag');
    const flagged = tubes.slice(0, 2);
    for (const id of flagged) consoleActions.setComponent(id, { isMotorMount: true }, 'Mount flag');
    useSessionStore.getState().setSelectedId(flagged[0]);
    renderTree();
    expect(row(flagged[0]).getAttribute('data-state')).toBe('action-needed');
    expect(row(flagged[1]).getAttribute('data-state')).toBe('action-needed');
    expect(screen.getByText(/Action needed · 2/)).toBeTruthy();
  });

  it('shows a labeled message when the filter hides a repair target', () => {
    const tubes = tubeIds();
    for (const id of tubes) consoleActions.setComponent(id, { isMotorMount: false }, 'Clear mount flag');
    const flagged = tubes.slice(0, 2);
    for (const id of flagged) consoleActions.setComponent(id, { isMotorMount: true }, 'Mount flag');
    renderTree();
    fireEvent.click(screen.getByTitle(/Fin-set components/));
    const notice = document.querySelector('[data-filter-hides-repair="true"]');
    expect(notice).toBeTruthy();
    expect(notice?.textContent).toMatch(/2 repair targets hidden by the current filter/);
    expect(notice?.textContent).toMatch(/switch the filter to All/);
  });

  it('marks the selected row selected and switches on click', () => {
    renderTree();
    const ids = components().map((c) => c.id);
    expect(row(ids[0]).getAttribute('data-state')).toBe('selected');
    fireEvent.click(row(ids[2]));
    expect(row(ids[2]).getAttribute('data-state')).toBe('selected');
    expect(row(ids[0]).getAttribute('data-state')).toBe('candidate');
    expect(selected()).toBe(ids[2]);
  });

  it('labels a filter that matches no part at all', () => {
    for (const c of components().filter((x) => x.type === 'parachute')) consoleActions.removeComponent(c.id);
    renderTree();
    fireEvent.click(screen.getByTitle(/Parachute components/));
    expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(0);
    expect(document.querySelector('[data-tree-filter-empty="true"]')).toBeTruthy();
  });

  it('labels the empty state for a name filter that matches nothing', () => {
    renderTree();
    fireEvent.change(screen.getByLabelText('Filter parts by name'), { target: { value: 'zzz-no-such-part' } });
    expect(document.querySelector('[data-tree-filter-empty="true"]')).toBeTruthy();
  });
});
