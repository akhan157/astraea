// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CopilotPanel } from './CopilotPanel';
import { computeRocketStability } from '../../aero/barrowman';
import { useProjectStore } from '../../state/project';
import { consoleActions } from '../store';
import { resetConsoleState } from '../testFixtures';
import type { RocketVehicle, TrapezoidFinSetComponent } from '../../core/types';
import type { SixDofSimulationResult } from '../../sim/sixDofSimulator';
import { installTestEngine } from '../testFixtures';

let teardown: (() => void) | null = null;

function stubNativeBridge(flightOverrides: Partial<SixDofSimulationResult> = {}): void {
  teardown = installTestEngine(async (cmd: string, args?: Record<string, unknown>) => {
        args = args ?? {};
        if (cmd === 'stability') {
          return computeRocketStability(args.vehicle as RocketVehicle);
        }
        if (cmd === 'simulate_flight') {
          return {
            apogeeAltitude: 500,
            railExitVelocity: 25,
            landingVelocity: 5.5,
            landingDistance: 30,
            terminated: true,
            touchdownNominal: true,
            validity: 'PASS',
            enveloped: true,
            ...flightOverrides,
          };
        }
        return {};
  }).teardown;
}

beforeEach(() => {
  resetConsoleState();
});

afterEach(() => {
  if (teardown) {
    teardown();
    teardown = null;
  }
  cleanup();
  resetConsoleState();
});

describe('CopilotPanel console integration', () => {
  it('reports not-evaluated when the engine is unavailable', async () => {
    render(<CopilotPanel />);
    const submit = screen.getByRole('button', { name: 'Ask copilot' });
    fireEvent.click(submit);
    expect(await screen.findByText(/not evaluated/i)).toBeTruthy();
    expect(screen.getAllByText(/needs WebAssembly and Web Workers/i).length).toBeGreaterThan(0);
  });

  it('evaluates rule-based checks through the native bridge', async () => {
    stubNativeBridge();
    useProjectStore.getState().loadPreset('estesAlpha');
    render(<CopilotPanel />);
    const submit = screen.getByRole('button', { name: 'Ask copilot' });
    fireEvent.click(submit);
    expect(await screen.findByText(/Checks: .* passed/i)).toBeTruthy();
    expect(screen.getAllByText(/Stability margin too/i).length).toBeGreaterThan(0);
  });

  it('applies a computed vehicle fix as one undoable edit', async () => {
    stubNativeBridge();
    useProjectStore.getState().loadPreset('estesAlpha');
    const vehicle = structuredClone(useProjectStore.getState().project.vehicle);
    const fins = vehicle.components.find((c) => c.type === 'trapezoidfinset') as TrapezoidFinSetComponent;
    fins.span *= 1.8;
    useProjectStore.setState({ project: { ...useProjectStore.getState().project, vehicle }, past: [] });

    render(<CopilotPanel />);
    const input = screen.getByLabelText('Copilot question');
    fireEvent.change(input, { target: { value: 'how do I fix it' } });
    const submit = screen.getByRole('button', { name: 'Ask copilot' });
    fireEvent.click(submit);
    const applyButton = await screen.findByRole('button', { name: 'Apply suggestion' });
    expect(applyButton).toBeTruthy();
    const beforeSpan = (useProjectStore.getState().project.vehicle.components.find((c) => c.id === fins.id) as TrapezoidFinSetComponent).span;

    await act(async () => {
      fireEvent.click(applyButton);
    });
    expect(screen.getByRole('status').textContent).toMatch(/Applied as one undoable edit/i);

    const afterSpan = (useProjectStore.getState().project.vehicle.components.find((c) => c.id === fins.id) as TrapezoidFinSetComponent).span;
    expect(afterSpan).not.toBe(beforeSpan);
    expect(useProjectStore.getState().past.length).toBe(1);

    // Undo restores the previous span
    act(() => {
      consoleActions.undo();
    });
    expect((useProjectStore.getState().project.vehicle.components.find((c) => c.id === fins.id) as TrapezoidFinSetComponent).span).toBe(beforeSpan);
  });

  it('refuses to apply a fix if inputs changed since the fix was computed', async () => {
    stubNativeBridge();
    useProjectStore.getState().loadPreset('estesAlpha');
    const vehicle = structuredClone(useProjectStore.getState().project.vehicle);
    const fins = vehicle.components.find((c) => c.type === 'trapezoidfinset') as TrapezoidFinSetComponent;
    fins.span *= 1.8;
    useProjectStore.setState({ project: { ...useProjectStore.getState().project, vehicle }, past: [] });

    render(<CopilotPanel />);
    const input = screen.getByLabelText('Copilot question');
    fireEvent.change(input, { target: { value: 'how do I fix it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask copilot' }));
    const applyButton = await screen.findByRole('button', { name: 'Apply suggestion' });
    expect(applyButton).toBeTruthy();

    // Mutate an input after answer was computed
    act(() => {
      consoleActions.setOptions({ windSpeedSurface: 8 }, 'Change wind');
    });

    await act(async () => {
      fireEvent.click(applyButton);
    });
    expect(screen.getByRole('status').textContent).toMatch(/design or launch inputs changed/i);
  });
});
