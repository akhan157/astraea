/**
 * RIVAL S2 acceptance (identical to the ui2 S2 bar): the workstation shell
 * keeps five keyboard-reachable studios, runs routine simulation inline
 * (never a modal), never shows an unqualified pass for stale/invalid results,
 * and preserves editing through WebGL loss.
 *
 * Pins: digits 1–5 switch studios outside editable contexts; Ctrl+Enter
 * executes the inline ensemble; every Run entry carries data-run-inline; no
 * dialog role exists; the WebGL fallback keeps editing surfaces live.
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkstationShell } from './WorkstationShell';
import { useRocketStore } from '../../store/rocketStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useRunStore } from '../../store/runStore';
import { useEditBufferStore } from '../../store/editBufferStore';
import type { RocketVehicle } from '../../core/types';
import { runMonteCarlo, runMonteCarloChunk } from '../../sim/monteCarlo';
import { computeRocketStability } from '../../aero/barrowman';

const ALPHA_CLASS_VEHICLE: RocketVehicle = {
  id: 'shell-alpha',
  name: 'Shell Alpha',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'shell-nc',
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
      id: 'shell-bt',
      name: 'Main Body Tube (BT-50)',
      type: 'bodytube',
      length: 0.311,
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      isMotorMount: true,
      materialId: 'cardboard',
      color: '#ffffff',
    },
    {
      id: 'shell-fins',
      name: 'Stabilizer Fins (3-Fin)',
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
    {
      id: 'shell-chute',
      name: '12" Parachute',
      type: 'parachute',
      diameter: 0.305,
      cd: 0.8,
      mass: 0.008,
      axialOffset: 0.05,
      materialId: 'cardboard',
    },
  ],
};

function renderShell() {
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

const workspaceLabel = () => screen.getByRole('main').getAttribute('aria-label');
// IPC-boundary stub (a82ecee pattern): the ONLY seam under test. The real
// bridge forwards to window.__TAURI__.core.invoke; the stub answers with
// TS-oracle pass-throughs (test-only; src/ untouched) and records commands
// for payload assertions.
const seen: Array<{ cmd: string; args: Record<string, unknown> }> = [];

function installIpcStub(): void {
  seen.length = 0;
  // Named-cast window seam: bridge reads window.__TAURI__.core.invoke.
  const win = window as unknown as { __TAURI__?: unknown };
  win.__TAURI__ = {
    core: {
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        seen.push({ cmd, args });
        if (cmd === 'run_ensemble') {
          const req = args.req as {
            vehicle: unknown; motor: unknown; options: unknown;
            sigmas: unknown; nRuns: number; seed: number; version: 'legacy-sequential-v1' | 'per-run-v2';
          };
          return runMonteCarlo(
            { vehicle: req.vehicle, motor: req.motor, options: req.options } as never,
            req.sigmas as never,
            req.nRuns,
            req.seed,
            req.version,
          );
        }
        if (cmd === 'run_ensemble_chunk') {
          // S5 background host: the studio drives absolute run ranges; the
          // native chunk path shares run_chunk with the whole-ensemble call.
          const req = args.req as {
            vehicle: unknown; motor: unknown; options: unknown; sigmas: unknown;
            nRuns: number; seed: number; runStart: number; runEnd: number;
          };
          return runMonteCarloChunk(
            { vehicle: req.vehicle, motor: req.motor, options: req.options } as never,
            req.sigmas as never,
            req.nRuns,
            req.seed,
            req.runStart,
            req.runEnd,
          );
        }
        if (cmd === 'stability') {
          const vehicle = (args.vehicle ?? args) as unknown as Parameters<typeof computeRocketStability>[0];
          return computeRocketStability(vehicle);
        }
        throw new Error(`unexpected IPC command ${cmd}`);
      },
    },
  };
}

beforeEach(installIpcStub);

describe('WorkstationShell studios', () => {
  beforeEach(renderShell);

  it('exposes five studios with shortcut digits and switches on keys 1–5', () => {
    for (const [key, label] of [
      ['1', 'Airframe CAD workspace'],
      ['2', 'Aerodynamics & Flutter workspace'],
      ['3', 'Propulsion & Motors workspace'],
      ['4', 'Trajectory & Weather workspace'],
      ['5', 'Recovery Packaging & Flight Evidence Ledger workspace'],
    ] as const) {
      expect(screen.getByRole('tab', { name: new RegExp(`shortcut ${key}`) })).toBeTruthy();
      fireEvent.keyDown(document.body, { key });
      expect(workspaceLabel()).toBe(label);
    }
  });

  it('never fires studio keys inside editable contexts', () => {
    fireEvent.keyDown(document.body, { key: '3' });
    expect(workspaceLabel()).toBe('Propulsion & Motors workspace');
    const field = screen.getByLabelText('Monte Carlo run count') as HTMLInputElement;
    fireEvent.keyDown(field, { key: '1' });
    expect(workspaceLabel()).toBe('Propulsion & Motors workspace');
  });

  it('keeps trajectory case inputs across studio switches (no remount wipe)', () => {
    fireEvent.keyDown(document.body, { key: '4' });
    const runs = screen.getByLabelText('Monte Carlo run count') as HTMLInputElement;
    fireEvent.change(runs, { target: { value: '5' } });
    expect(runs.value).toBe('5');
    fireEvent.keyDown(document.body, { key: '5' });
    expect(workspaceLabel()).toBe('Recovery Packaging & Flight Evidence Ledger workspace');
    fireEvent.keyDown(document.body, { key: '4' });
    expect((screen.getByLabelText('Monte Carlo run count') as HTMLInputElement).value).toBe('5');
  });
});

describe('WorkstationShell inline run', () => {
  beforeEach(renderShell);

  it('offers Run entries that navigate to trajectory', async () => {
    // Guard: an unresolved motor disables the run control, so this click
    // exercises navigation only and cannot start a background ensemble.
    useRocketStore.getState().selectMotor('no-such-motor');
    const entries = document.querySelectorAll('[data-run-inline]');
    expect(entries.length).toBeGreaterThan(0);
    fireEvent.click(entries[0]);
    await waitFor(() => expect(workspaceLabel()).toBe('Trajectory & Weather workspace'), {
      timeout: 5000,
    });
    const runControl = document.querySelector('[data-run-control]') as HTMLButtonElement;
    expect(runControl.disabled).toBe(true);
  });

  it('runs the inline ensemble on Ctrl+Enter without any modal, recording a qualified attempt', async () => {
    fireEvent.keyDown(document.body, { key: '4' });
    fireEvent.change(screen.getByLabelText('Monte Carlo run count'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Wind direction sigma (deg)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Rail angle sigma (deg)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Impulse sigma (%)'), { target: { value: '0' } });
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(screen.getByText('5 succeeded · 0 failed')).toBeTruthy(), {
      timeout: 180000,
    });
    // IPC boundary: the ensemble crossed as ONE coarse chunk call covering the
    // whole 5-run range (S5 host) — never per-step serialization, and never a
    // whole-ensemble call once the chunked host is in use.
    const chunkCalls = seen.filter((s) => s.cmd === 'run_ensemble_chunk');
    expect(seen.filter((s) => s.cmd === 'run_ensemble')).toHaveLength(0);
    expect(chunkCalls).toHaveLength(1);
    const req = chunkCalls[0].args.req as {
      nRuns: number;
      runStart: number;
      runEnd: number;
      sigmas: Record<string, number>;
    };
    expect(req.nRuns).toBe(5);
    expect(req.runStart).toBe(0);
    expect(req.runEnd).toBe(5);
    expect(req.sigmas.windAzimuthDegSigma).toBe(0);
    expect(req.sigmas.railAngleDegSigma).toBe(0);
    expect(req.sigmas.impulsePctSigma).toBe(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelectorAll('[data-run-inline]').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Pass — current inputs/)).toBeNull();
  }, 300000);

  it('qualifies a stale attempt rather than passing it', async () => {
    fireEvent.keyDown(document.body, { key: '4' });
    fireEvent.change(screen.getByLabelText('Monte Carlo run count'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Wind direction sigma (deg)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Rail angle sigma (deg)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Impulse sigma (%)'), { target: { value: '0' } });
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(useRunStore.getState().records).toHaveLength(1), { timeout: 180000 });
    // Change a run input: the recorded result must read stale, never pass.
    fireEvent.change(screen.getByLabelText('Wind direction sigma (deg)'), { target: { value: '7' } });
    await waitFor(() => expect(screen.getAllByText(/Stale/).length).toBeGreaterThan(0), { timeout: 10000 });
    expect(screen.queryByText(/Pass — current inputs/)).toBeNull();
  }, 300000);
});

describe('WorkstationShell WebGL loss', () => {
  beforeEach(renderShell);

  it('preserves editing surfaces when no WebGL context exists', () => {
    // jsdom provides no WebGL: the fallback alert renders instead of the
    // canvas, while the tree, inspector, precision bar, and run entries stay live.
    expect(screen.getByText('3D viewport unavailable — editing preserved')).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore viewport/i })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Context list' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(document.querySelector('[data-precision-filter]')).toBeTruthy();
    expect(document.querySelectorAll('[data-run-inline]').length).toBeGreaterThan(0);
  });
});
