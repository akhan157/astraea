// @vitest-environment jsdom
/**
 * Item A: the inspector collapses when it would only show the empty-state
 * line, reopens for a selection, and never overrides a manual choice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

import Workstation from '../Workstation';
import { stagedCount, useProjectStore } from '../../state/project';
import { useSessionStore } from '../../state/session';
import { TOURED_KEY } from './Onboarding';
import { consoleJobStub, resetConsoleState, stubEngine } from '../testFixtures';

/** cmdk (the command palette) observes its list; jsdom has no ResizeObserver. */
class ResizeObserverStub { observe(): void {} unobserve(): void {} disconnect(): void {} }

/** Keep jsdom on the wide layout unless a test asks for the drawer breakpoint. */
let restoreMatchMedia: (() => void) | null = null;
function stubMatchMedia(compact: boolean): void {
  const existing = window.matchMedia;
  const stub = (query: string) => ({
    matches: compact && /max-width: 1279px/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
  window.matchMedia = stub as unknown as typeof window.matchMedia;
  restoreMatchMedia = () => { window.matchMedia = existing; };
}

let teardown: (() => void) | null = null;
beforeEach(() => {
  localStorage.setItem(TOURED_KEY, '1');
  resetConsoleState();
  consoleJobStub();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  if (typeof Element.prototype.scrollIntoView !== 'function') Element.prototype.scrollIntoView = () => undefined;
  teardown = stubEngine().teardown;
  useSessionStore.setState({ stage: 'airframe', selectedId: null, rightOpen: true, leftOpen: true, onboarding: null });
});
afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
  restoreMatchMedia?.();
  restoreMatchMedia = null;
  vi.unstubAllGlobals();
});

const panel = (): HTMLElement | null => document.querySelector('[data-inspector-panel]');
const closed = (): boolean => panel()?.getAttribute('aria-hidden') === 'true';
const partField = (label: string): HTMLInputElement => {
  const row = [...document.querySelectorAll('span')].find((element) => element.textContent === label)?.parentElement;
  const input = row?.querySelector('input');
  if (!input) throw new Error(`Missing field ${label}`);
  return input;
};

describe('inspector auto open and close', () => {
  it('collapses an empty inspector, opens on selection, and closes again on Escape deselect', async () => {
    render(<Workstation />);
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(false));
    expect(closed()).toBe(true);
    expect(panel()?.hasAttribute('inert')).toBe(true);

    act(() => { useSessionStore.getState().setSelectedId('nsl-bt1'); });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(true));
    expect(closed()).toBe(false);
    expect(panel()?.textContent).toContain('Body tube');

    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(useSessionStore.getState().selectedId).toBeNull());
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(false));
  });

  it('keeps a manual open while empty and does not reopen after a manual close until a new selection', async () => {
    render(<Workstation />);
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(false));

    // `]` while empty: stay open and show the placeholder.
    fireEvent.keyDown(document.body, { key: ']' });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(true));
    await waitFor(() => expect(screen.getByText('Select a part in the tree or the 3D view.')).toBeTruthy());
    await act(async () => { await Promise.resolve(); });
    expect(useSessionStore.getState().rightOpen).toBe(true);

    // Manual close with content: stays closed for that selection.
    act(() => { useSessionStore.getState().setSelectedId('nsl-bt1'); });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle inspector' }));
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(false));

    // A new selection is the documented exception.
    act(() => { useSessionStore.getState().setSelectedId('nsl-bt2'); });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(true));
  });

  it('keeps a manual close with no selection across stage changes until a new selection', async () => {
    useSessionStore.setState({ stage: 'mission', selectedId: null, rightOpen: true });
    render(<Workstation />);
    await act(async () => { await Promise.resolve(); });
    expect(useSessionStore.getState().rightOpen).toBe(true);

    // Close the Mission inspector by hand: nothing is selected.
    fireEvent.click(screen.getByRole('button', { name: 'Toggle inspector' }));
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(false));

    // Moving between stages that have content must not undo that choice.
    act(() => { useSessionStore.getState().setStage('flight'); });
    await act(async () => { await Promise.resolve(); });
    expect(useSessionStore.getState().rightOpen).toBe(false);
    act(() => { useSessionStore.getState().setStage('build'); });
    await act(async () => { await Promise.resolve(); });
    expect(useSessionStore.getState().rightOpen).toBe(false);

    // A new selection is still the documented exception.
    act(() => { useSessionStore.getState().setStage('airframe'); useSessionStore.getState().setSelectedId('nsl-bt1'); });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(true));
  });

  it('keeps the inspector open while airframe edits are staged, then closes when they are discarded', async () => {
    useSessionStore.setState({ stage: 'airframe', selectedId: null, rightOpen: false });
    render(<Workstation />);
    act(() => { useSessionStore.getState().setSelectedId('nsl-bt1'); });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(true));
    const input = partField('Inner diameter');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(stagedCount('airframe')).toBe(1);

    // Deselect: the staged banner is content, so the panel stays.
    act(() => { useSessionStore.getState().setSelectedId(null); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply staged edits' })).toBeTruthy());
    expect(useSessionStore.getState().rightOpen).toBe(true);

    act(() => { useProjectStore.getState().revertStudio('airframe'); });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(false));
  });

  it('moves focus to the stage header when the selected part disappears under a focused field', async () => {
    useSessionStore.setState({ selectedId: 'nsl-bt1', rightOpen: true });
    render(<Workstation />);
    const input = partField('Length');
    input.focus();
    expect(document.activeElement).toBe(input);
    act(() => { useProjectStore.getState().loadPreset('estesAlpha'); });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(false));
    expect(document.activeElement).toBe(document.querySelector('[data-stage-header]'));
  });

  it('never auto-opens the drawer at the compact breakpoint but still auto-closes it', async () => {
    stubMatchMedia(true);
    useSessionStore.setState({ selectedId: null, rightOpen: false });
    render(<Workstation />);
    act(() => { useSessionStore.getState().setSelectedId('nsl-bt1'); });
    await act(async () => { await Promise.resolve(); });
    expect(useSessionStore.getState().rightOpen).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Inspector' })).toBeNull();

    fireEvent.keyDown(document.body, { key: ']' });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(true));
    expect(screen.getByRole('dialog', { name: 'Inspector' })).toBeTruthy();

    act(() => { useSessionStore.getState().setSelectedId(null); });
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(false));
  });
});

describe('Escape deselect guards', () => {
  it('discards staged edits first and keeps the selection', async () => {
    useSessionStore.setState({ selectedId: 'nsl-bt1', rightOpen: true });
    render(<Workstation />);
    const input = partField('Inner diameter');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    expect(stagedCount('airframe')).toBe(1);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(stagedCount('airframe')).toBe(0);
    expect(useSessionStore.getState().selectedId).toBe('nsl-bt1');
  });

  it('does not deselect when Escape closes the command palette', async () => {
    useSessionStore.setState({ selectedId: 'nsl-bt1', rightOpen: true });
    render(<Workstation />);
    fireEvent.click(screen.getByRole('button', { name: /Command palette/ }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull());
    expect(useSessionStore.getState().selectedId).toBe('nsl-bt1');
  });

  it('does not deselect when Escape closes the shortcuts sheet', async () => {
    useSessionStore.setState({ selectedId: 'nsl-bt1', rightOpen: true });
    render(<Workstation />);
    fireEvent.keyDown(document.body, { key: '?' });
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Keyboard' })).toBeTruthy());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Keyboard' })).toBeNull());
    expect(useSessionStore.getState().selectedId).toBe('nsl-bt1');
  });

  it('leaves the selection alone when Escape happens inside a field', async () => {
    useSessionStore.setState({ selectedId: 'nsl-bt1', rightOpen: true });
    render(<Workstation />);
    const input = partField('Inner diameter');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(stagedCount('airframe')).toBe(1);
    expect(useSessionStore.getState().selectedId).toBe('nsl-bt1');
  });
});

describe('guided tour', () => {
  it('opens the inspector when the airframe tour step selects the fin', async () => {
    localStorage.removeItem(TOURED_KEY);
    useSessionStore.setState({ onboarding: null, selectedId: null, rightOpen: false, stage: 'mission' });
    render(<Workstation />);
    await waitFor(() => expect(useSessionStore.getState().onboarding).toBe(0));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const state = useSessionStore.getState();
    expect(state.stage).toBe('airframe');
    expect(state.selectedId).toContain('fin');
    await waitFor(() => expect(useSessionStore.getState().rightOpen).toBe(true));
    expect(screen.getByText('Trapezoidal fin set')).toBeTruthy();
  });
});

describe('staged edits banner', () => {
  it('shows Apply and Discard when a part was selected, edited and then deselected', async () => {
    useSessionStore.setState({ selectedId: 'nsl-bt1', rightOpen: true });
    render(<Workstation />);
    const input = partField('Length');
    fireEvent.change(input, { target: { value: '800' } });
    fireEvent.blur(input);
    act(() => { useSessionStore.getState().setSelectedId(null); });
    expect(screen.getByText(/1 part with staged edits/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply staged edits' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Discard staged edits' })).toBeTruthy();
    expect(screen.getByText('Select a part in the tree or the 3D view.')).toBeTruthy();
    act(() => { useProjectStore.getState().revertStudio('airframe'); });
  });
});
