/**
 * Console store mapping: engineering content lives in `useProjectStore` with
 * undo coalescing and a complete undo step (project + console extras), while
 * the committed-run snapshot comes from the analysis store.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import type { BodyTubeComponent } from '../core/types';
import { useProjectStore } from '../state/project';
import { useSessionStore } from '../state/session';
import { useAnalysisStore } from '../state/analysis';
import { consoleActions, useCommittedRun, useConsoleJobs } from './store';
import { useFlightQualification } from './hooks';
import { activeTestEngine, stabilityAnalysis, stubEngine, type Invocation } from './testFixtures';
import { TopBar } from './shell/Shell';
import { FlightStage } from './stages/Flight';
import { AeroControls } from './stages/AeroControls';


describe('console store mapping', () => {
  let teardown: () => void;
  let calls: Invocation[];

  beforeEach(() => {
    localStorage.setItem('astraea.workstation.toured', '1');
    const stub = stubEngine();
    teardown = stub.teardown;
    calls = stub.calls;
    useProjectStore.getState().loadPreset('nasaStudent');
    useAnalysisStore.getState().reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    teardown();
  });

  it('merges rapid same-field edits into one undo step', () => {
    const before = useProjectStore.getState().past.length;
    consoleActions.setOptions({ railLength: 4.0 }, 'Rail length');
    vi.advanceTimersByTime(50);
    consoleActions.setOptions({ railLength: 4.4 }, 'Rail length');
    vi.advanceTimersByTime(50);
    consoleActions.setOptions({ railLength: 4.8 }, 'Rail length');
    expect(useProjectStore.getState().past.length).toBe(before + 1);
    expect(useProjectStore.getState().project.workspace.launch.railLengthM).toBeCloseTo(4.8, 6);

    // Undo returns to the pre-edit value in one step.
    consoleActions.undo();
    expect(useProjectStore.getState().project.workspace.launch.railLengthM).toBeCloseTo(3.66, 6);
  });

  it('keeps separate undo steps for distinct fields and outside the merge window', () => {
    const before = useProjectStore.getState().past.length;
    consoleActions.setOptions({ railLength: 4.0 }, 'Rail length');
    consoleActions.setOptions({ windSpeedSurface: 6 }, 'Surface wind');
    expect(useProjectStore.getState().past.length).toBe(before + 2);

    vi.advanceTimersByTime(5000);
    consoleActions.setOptions({ railLength: 5.0 }, 'Rail length');
    expect(useProjectStore.getState().past.length).toBe(before + 3);
  });

  it('restores the console extras with the project on undo', () => {
    // Distinct fields, so each edit is its own step.
    consoleActions.setMission({ targetApogeeM: 2000 }, 'Target apogee');
    consoleActions.setShear(9.5e9);
    expect(useProjectStore.getState().mission.targetApogeeM).toBe(2000);
    expect(useProjectStore.getState().shearPa).toBe(9.5e9);

    consoleActions.undo(); // undo the shear override
    expect(useProjectStore.getState().shearPa).toBeUndefined();
    expect(useProjectStore.getState().mission.targetApogeeM).toBe(2000);

    consoleActions.undo(); // undo the mission edit
    expect(useProjectStore.getState().mission.targetApogeeM).toBe(550);
    expect(useProjectStore.getState().shearPa).toBeUndefined();
  });

  it('writes a part field and reverts it to the committed value', () => {
    const vehicle = useProjectStore.getState().project.vehicle;
    const fin = vehicle.components.find((c) => c.type === 'trapezoidfinset');
    expect(fin).toBeDefined();
    const originalSpan = (fin as { span: number }).span;

    consoleActions.setComponent(fin!.id, { span: originalSpan * 1.5 }, 'Fin span');
    const after = useProjectStore.getState().project.vehicle.components.find((c) => c.id === fin!.id);
    expect((after as { span: number }).span).toBeCloseTo(originalSpan * 1.5, 9);

    consoleActions.setComponent(fin!.id, { span: originalSpan }, 'Revert span');
    const reverted = useProjectStore.getState().project.vehicle.components.find((c) => c.id === fin!.id);
    expect((reverted as { span: number }).span).toBeCloseTo(originalSpan, 9);
  });

  it('writes launch conditions to the vehicle launch site', () => {
    consoleActions.setLaunchAltitude(1400, 'Site elevation');
    const site = useProjectStore.getState().project.vehicle.launchSite;
    expect(site).toEqual({ altitudeM: 1400 });
    expect(useProjectStore.getState().project.workspace.site.altitudeASLM).toBe(1400);
    consoleActions.setLaunchAltitude(1500, 'Site elevation');
    expect(useProjectStore.getState().project.vehicle.launchSite).toEqual({ altitudeM: 1500 });
  });

  it('keeps a committed sim snapshot from the completed run record', async () => {
    const { result } = renderHook(() => useCommittedRun());
    expect(result.current).toBeNull();

    const vehicleBefore = useProjectStore.getState().project.vehicle.id;
    const setOptionsSnapshot = useProjectStore.getState().project.workspace.launch.railLengthM;
    await act(async () => {
      await useConsoleJobs.getState().run();
    });
    expect(result.current?.run?.summary.validity).toBe('PASS');
    expect(result.current?.design.vehicle.id).toBe(vehicleBefore);
    expect(result.current?.run?.inputKey.length).toBeGreaterThan(0);

    // A later edit leaves the snapshot where the run was issued: the committed
    // design keeps the old rail length, which is what the ghost view shows.
    act(() => {
      consoleActions.setOptions({ railLength: setOptionsSnapshot + 1 }, 'Rail length');
    });
    expect(result.current?.design.options.railLength).toBeCloseTo(setOptionsSnapshot, 6);
  });

  it('keeps the last completed analysis record while a re-run is in flight', () => {
    const analysis = useAnalysisStore.getState();
    const token = analysis.start('flight', 'key-a');
    expect(analysis.completed.flight).toBeNull();
    useAnalysisStore.getState().resolve('flight', token, { marker: 1 });
    expect(useAnalysisStore.getState().completed.flight?.payload).toEqual({ marker: 1 });

    // A newer run starts: the live record is running, the completed one stays.
    useAnalysisStore.getState().start('flight', 'key-b');
    expect(useAnalysisStore.getState().records.flight?.status).toBe('running');
    expect(useAnalysisStore.getState().completed.flight?.payload).toEqual({ marker: 1 });
  });

  it('qualifies the committed run through the shared rule, never as passing when stale', async () => {
    const { result } = renderHook(() => useFlightQualification());
    await act(async () => {
      await useConsoleJobs.getState().run();
    });
    expect(result.current.isPass).toBe(true);
    expect(result.current.label).toMatch(/^Pass/);

    // An edit moves the current inputs off the run's key: stale, never a pass.
    act(() => {
      consoleActions.setOptions({ railLength: 9.9 }, 'Rail length');
    });
    expect(result.current.isPass).toBe(false);
    expect(result.current.status).toBe('stale');
    expect(result.current.label).toMatch(/Stale/);

    // Without the native shell, no run may read as passing at all.
    teardown();
    act(() => {
      consoleActions.setOptions({ railLength: 4.2 }, 'Rail length');
    });
    expect(result.current.isPass).toBe(false);
    expect(result.current.status).toBe('offline');
  });

  it('selects stages through the session store', () => {
    const set = useSessionStore.getState().setConsole;
    set({ stage: 'verify' });
    expect(useSessionStore.getState().stage).toBe('verify');
    expect(useSessionStore.getState().selectedGate).toBeNull();
  });

  it('refuses to run a case with two flagged motor mounts and records the failed flight analysis', async () => {
    act(() => {
      consoleActions.setComponent('nsl-bt1', { isMotorMount: true } as Partial<BodyTubeComponent>, 'Flag second mount');
    });
    await act(async () => {
      await useConsoleJobs.getState().run();
    });
    expect(calls.filter((c) => c.cmd === 'simulate_flight')).toHaveLength(0);
    const message = useConsoleJobs.getState().jobs.runError;
    expect(message).toMatch(/multiple motor mounts flagged/);
    expect(useConsoleJobs.getState().jobs.running).toBe(false);
    expect(useAnalysisStore.getState().records.flight?.status).toBe('failed');
    expect(useAnalysisStore.getState().records.flight?.error).toBe(message);
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
  });

  it('refuses to run a solid motor mount and records the failed flight analysis', async () => {
    act(() => {
      consoleActions.setComponent('nsl-bt2', { innerDiameter: 0 }, 'Seal the mount bore');
    });
    await act(async () => {
      await useConsoleJobs.getState().run();
    });
    expect(calls.filter((c) => c.cmd === 'simulate_flight')).toHaveLength(0);
    const message = useConsoleJobs.getState().jobs.runError;
    expect(message).toMatch(/is a solid tube \(no bore\)/);
    expect(useAnalysisStore.getState().records.flight?.status).toBe('failed');
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
  });

  it('refuses to run while airframe drafts are staged and sends no invoke', async () => {
    act(() => {
      useProjectStore.getState().stageComponents('airframe', 'nsl-bt1', { length: 0.5 });
    });
    await act(async () => {
      await useConsoleJobs.getState().run();
    });
    expect(calls.filter((c) => c.cmd === 'simulate_flight')).toHaveLength(0);
    expect(useConsoleJobs.getState().jobs.runError).toBe('Apply or discard staged airframe edits before running.');
    expect(useAnalysisStore.getState().records.flight).toBeNull();
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
  });

  it('disables the TopBar run button while the case fails preflight', () => {
    act(() => {
      consoleActions.setComponent('nsl-bt1', { isMotorMount: true } as Partial<BodyTubeComponent>, 'Flag second mount');
    });
    render(<Tooltip.Provider><TopBar onPalette={() => undefined} /></Tooltip.Provider>);
    const button = screen.getByRole('button', { name: /Run simulation/ });
    expect(button.hasAttribute('disabled')).toBe(true);
    // Reverting the bad edit makes the same button live again.
    act(() => consoleActions.undo());
    expect(screen.getByRole('button', { name: /Run simulation/ }).hasAttribute('disabled')).toBe(false);
  });

  it('clears the committed flight and marks the record failed when a rerun rejects', async () => {
    await act(async () => {
      await useConsoleJobs.getState().run();
    });
    expect(useAnalysisStore.getState().completed.flight).not.toBeNull();

    activeTestEngine().invoke = async () => {
      throw new Error('native engine exploded');
    };
    await act(async () => {
      await useConsoleJobs.getState().run();
    });
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    expect(useAnalysisStore.getState().records.flight?.status).toBe('failed');
    expect(useAnalysisStore.getState().records.flight?.error).toBe('native engine exploded');
    expect(useConsoleJobs.getState().jobs.runError).toBe('native engine exploded');
    expect(useConsoleJobs.getState().jobs.running).toBe(false);
  });

  it('discards the partial Monte Carlo ensemble when the job is cancelled', async () => {
    vi.useRealTimers();
    const base = activeTestEngine().invoke;
    let chunks = 0;
    activeTestEngine().invoke = async (cmd, args) => {
      const result = await base(cmd, args);
      if (cmd === 'run_ensemble_chunk') {
        chunks += 1;
        if (chunks === 1) useConsoleJobs.getState().cancelMonteCarlo();
      }
      return result;
    };
    act(() => useConsoleJobs.getState().runMonteCarlo(150));
    await vi.waitFor(() => expect(useAnalysisStore.getState().records.ensemble?.status).toBe('failed'));
    const job = useConsoleJobs.getState().jobs.mc;
    expect(chunks).toBeGreaterThanOrEqual(1);
    expect(job?.state).toBe('cancelled');
    // The cancel fired inside the first engine call, before any chunk
    // completed, so no finished runs are reported.
    expect(job?.done).toBe(0);
    expect(job?.partial).toBeUndefined();
    expect(useConsoleJobs.getState().mcAbort).toBeNull();
    expect(useAnalysisStore.getState().completed.ensemble).toBeNull();
    expect(useAnalysisStore.getState().records.ensemble?.status).toBe('failed');
  });

  it('says a cancelled Monte Carlo recorded nothing instead of the runs that finished', () => {
    useConsoleJobs.setState({
      jobs: {
        running: false,
        runError: null,
        mc: { id: 'mc-1', label: 'Monte Carlo · 150 runs', state: 'cancelled', progress: 0.33, done: 50, total: 150, startedAt: Date.now() },
      },
    });
    render(<FlightStage />);
    const mcTab = screen.getByRole('tab', { name: /Monte Carlo/ });
    fireEvent.mouseDown(mcTab);
    fireEvent.click(mcTab);
    expect(screen.getByText(/Cancelled after 50 of 150 runs\. The partial ensemble was discarded; no result was recorded\./)).toBeTruthy();
    expect(screen.queryByText(/runs that finished/)).toBeNull();
    expect(screen.getByText(/No dispersion yet/)).toBeTruthy();
  });

  it('withholds coefficient CP for unsupported geometry without discarding drag, then restores supported CP', async () => {
    vi.useRealTimers();
    let supported = false;
    useProjectStore.setState((s) => ({ project: { ...s.project, vehicle: { ...s.project.vehicle, id: 'coefficient-cp-unsupported' } } }));
    activeTestEngine().invoke = async (cmd) => cmd === 'stability'
      ? stabilityAnalysis(supported ? {} : { totalCNa: 5e-7 })
      : { dragCurves: [{ mach: 0.5, totalCd: 0.42, cp: 0.357 }] };
    render(<AeroControls />);
    const table = await screen.findByRole('table', { name: 'Aerodynamic coefficient preview' });
    await waitFor(() => expect(table.textContent).toContain('N/A'));
    expect(table.textContent).toContain('0.420');
    expect(table.textContent).not.toContain('357');
    supported = true;
    act(() => useProjectStore.setState((s) => ({ project: { ...s.project, vehicle: { ...s.project.vehicle, id: 'coefficient-cp-supported' } } })));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Aerodynamic coefficient preview' }).textContent).toContain('357'));
    expect(screen.getByRole('table', { name: 'Aerodynamic coefficient preview' }).textContent).toContain('0.420');
  });

  it('surfaces a rejected native aero preview as an alert', async () => {
    vi.useRealTimers();
    activeTestEngine().invoke = async (cmd: string) => {
      if (cmd === 'aero_curves') throw new Error('aero core offline');
      return {};
    };
    render(<AeroControls />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Aero preview unavailable: aero core offline'));
  });
});
