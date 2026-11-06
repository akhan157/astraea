// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

import { PartInspector } from './Inspector';
import Workstation from '../Workstation';
import { AirframeStage } from '../stages/Airframe';
import { RunReadiness } from './RunReadiness';
import { consoleActions } from '../store';
import { stagedCount, useProjectStore } from '../../state/project';
import { useSessionStore } from '../../state/session';
import type { BodyTubeComponent } from '../../core/types';
import { resetConsoleState, stubEngine } from '../testFixtures';

// WebGL is exercised in the browser/native smoke, not synthesized in jsdom.
vi.mock('../viewport/Viewport', () => ({ Viewport: () => null }));
beforeEach(() => {
  localStorage.setItem('astraea.workstation.toured', '1');
  resetConsoleState();
  useSessionStore.getState().setSelectedId('nsl-bt1');
});
afterEach(() => { cleanup(); resetConsoleState(); });

function field(label: string): HTMLInputElement {
  const row = [...document.querySelectorAll('span')].find((element) => element.textContent === label)?.parentElement;
  const input = row?.querySelector('input');
  if (!input) throw new Error(`Missing field ${label}`);
  return input;
}
function change(input: HTMLInputElement, value: string): void {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('Console edit boundaries', () => {
  it('previews multiple fields without mutating run inputs, then applies exactly one undo step', () => {
    const before = useProjectStore.getState().project.vehicle;
    render(<Tooltip.Provider><PartInspector /></Tooltip.Provider>);
    change(field('Length'), '800');
    change(field('Inner diameter'), '0');
    expect(useProjectStore.getState().project.vehicle).toBe(before);
    expect(useProjectStore.getState().past).toHaveLength(0);
    expect(Number(field('Inner diameter').value)).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Apply staged edits' }));
    const tube = useProjectStore.getState().project.vehicle.components.find((part) => part.id === 'nsl-bt1') as BodyTubeComponent;
    expect(tube.length).toBeCloseTo(0.8, 12);
    expect(tube.innerDiameter).toBe(0);
    expect(useProjectStore.getState().past).toHaveLength(1);
    act(() => consoleActions.undo());
    expect(useProjectStore.getState().project.vehicle).toEqual(before);
  });

  it('discards a staged edit without changing the committed vehicle or undo history', () => {
    const before = useProjectStore.getState().project.vehicle;
    render(<Tooltip.Provider><PartInspector /></Tooltip.Provider>);
    change(field('Inner diameter'), '0');
    fireEvent.click(screen.getByRole('button', { name: 'Discard staged edits' }));
    expect(useProjectStore.getState().project.vehicle).toBe(before);
    expect(useProjectStore.getState().past).toHaveLength(0);
    expect(Number(field('Inner diameter').value)).toBeGreaterThan(0);
  });

  it('offers no checkpoint blend when no prior revision exists', () => {
    render(<AirframeStage />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare revision' }));
    const comparison = within(screen.getByRole('region', { name: 'Revision comparison' }));
    expect(comparison.queryByRole('slider')).toBeNull();
    expect(comparison.getByText(/no prior revision exists/i)).toBeTruthy();
  });

  it('compares against the newest pre-edit checkpoint rather than the oldest history entry', () => {
    const before = useProjectStore.getState().project.vehicle;
    const tube = before.components.find((part) => part.id === 'nsl-bt1') as BodyTubeComponent;
    const nose = before.components.find((part) => part.id === 'nsl-nc')!;
    consoleActions.setComponent(tube.id, { length: tube.length + 0.1 }, 'First edit');
    consoleActions.setComponent(nose.id, { length: 0.4 }, 'Second edit');
    render(<AirframeStage />);
    fireEvent.click(screen.getByRole('button', { name: 'Compare revision' }));
    const comparison = within(screen.getByRole('region', { name: 'Revision comparison' }));
    expect(comparison.getByText(`${nose.name} · Length`)).toBeTruthy();
    expect(comparison.queryByText(`${tube.name} · Length`)).toBeNull();
    expect(comparison.getByText(/0 added · 0 removed · 1 modified/)).toBeTruthy();
    fireEvent.change(comparison.getByRole('slider', { name: 'Comparison blend' }), { target: { value: '75' } });
    expect((comparison.getByRole('slider') as HTMLInputElement).value).toBe('75');
    fireEvent.click(comparison.getByRole('button', { name: 'Close comparison' }));
    expect(screen.queryByRole('region', { name: 'Revision comparison' })).toBeNull();
  });

  it('routes ambiguous-mount diagnostics to the airframe repair target', () => {
    consoleActions.setComponent('nsl-bt1', { isMotorMount: true } as Partial<BodyTubeComponent>, 'Flag second mount');
    render(<RunReadiness />);
    fireEvent.click(screen.getByRole('button', { name: 'Repair motor mount flag' }));
    expect(useSessionStore.getState().stage).toBe('airframe');
    expect(useSessionStore.getState().selectedId).toBe('nsl-bt1');
    expect(useSessionStore.getState().rightOpen).toBe(true);
  });

  it('discards staged airframe edits when Escape is pressed on the page body', () => {
    useSessionStore.setState({ stage: 'airframe', rightOpen: true });
    const stub = stubEngine();
    const before = useProjectStore.getState().project.vehicle;
    render(<Workstation />);
    change(field('Inner diameter'), '0');
    expect(stagedCount('airframe')).toBe(1);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(stagedCount('airframe')).toBe(0);
    expect(useProjectStore.getState().project.vehicle).toBe(before);
    expect(Number(field('Inner diameter').value)).toBeGreaterThan(0);
    stub.teardown();
  });

  it('keeps staged airframe edits when Escape is pressed inside a field', () => {
    useSessionStore.setState({ stage: 'airframe', rightOpen: true });
    const stub = stubEngine();
    const before = useProjectStore.getState().project.vehicle;
    render(<Workstation />);
    const input = field('Inner diameter');
    change(input, '0');
    expect(stagedCount('airframe')).toBe(1);
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(stagedCount('airframe')).toBe(1);
    expect(Number(field('Inner diameter').value)).toBe(0);
    expect(useProjectStore.getState().project.vehicle).toBe(before);
    stub.teardown();
  });
});
