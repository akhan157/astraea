// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SimFlightOverlay } from './SimFlightOverlay';
import { useRocketStore } from '../store/rocketStore';
import { nextRunId, resetRunIdCounter, useRunStore } from '../store/runStore';
import { preflight, snapshotCase, type LaunchCase } from '../application/caseResolver';
import type { RocketVehicle } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import type { SixDofOptions, SixDofSimulationResult } from '../sim/sixDofSimulator';

type SimFlight = (vehicle: RocketVehicle, motor: MotorSpec, options?: SixDofOptions) => SixDofSimulationResult;

vi.mock('../sim/sixDofSimulator', async (importOriginal) => {
  // Vitest mock factories are untyped; the shape is restored field-by-field below.
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    simulate6DofFlight: (...args: Parameters<SimFlight>) =>
      (globalThis as unknown as { __simImpl: SimFlight }).__simImpl(...args),
  };
});

/**
 * Deterministic 60 s symmetric flight, apogee `apogee` m at t=30 s — the B
 * mirror of the frontend lane's commitSim fixture: the overlay re-derives
 * the sim curve from the mocked engine and gates it on the run store.
 */
function buildSimResult(apogee = 300): SixDofSimulationResult {
  const telemetry = [];
  for (let t = 0; t <= 60; t += 1) {
    const alt = t <= 30 ? (apogee * t) / 30 : Math.max(0, apogee * (1 - (t - 30) / 30));
    telemetry.push({
      time: t,
      position: { x: 0, y: 0, z: alt },
      velocity: { x: 0, y: 0, z: t <= 30 ? 20 : -10 },
      speed: t <= 30 ? 20 : 10,
      mach: 0,
      altitude: alt,
      acceleration: 0,
      angularVelocity: { p: 0, q: 0, r: 0 },
      angleOfAttackDeg: 0,
      q: { w: 1, x: 0, y: 0, z: 0 },
      pitchDeg: 0,
      rollDeg: 0,
      yawDeg: 0,
      drag: 0,
      thrust: 0,
      mass: 1,
      dynamicPressure: 0,
    });
  }
  return {
    apogeeAltitude: apogee,
    apogeeTime: 30,
    apogeePosition: { x: 0, y: 0, z: apogee },
    maxVelocity: 20,
    maxMach: 0.1,
    maxAccelerationG: 3,
    burnoutAltitude: 100,
    burnoutVelocity: 20,
    burnoutTime: 1,
    railExitVelocity: 15,
    isRailExitSafe: true,
    weathercockAngleDeg: 0,
    landingPosition: { x: 0, y: 0, z: 0 },
    landingDistance: 0,
    landingVelocity: 3,
    landingKineticEnergy: 5,
    isLandingSafe: true,
    isLandingVelocitySafe: true,
    terminated: true,
    terminationReason: 'touchdown',
    touchdownNominal: true,
    unsupportedHandling: 'continue-and-mark-UNKNOWN',
    runManifest: {
      frames: 'navigation/body, ground tangent-plane',
      ground: 'flat, no terrain grid',
      atmosphere: 'US76-style ICAO up to 11 km',
      depletion: 'tabular propellant depletion',
      railContact: 'rigid rail till exit, no flex',
      recovery: 'two-stage event model',
      unsupportedHandling: 'continue-and-mark-UNKNOWN',
      unsupportedScope: ['boattail drag', 'canard coupling'],
    },
    landingMass: 1,
    flightDuration: 60,
    validity: 'PASS',
    enveloped: true,
    offNominalExcursion: false,
    events: [],
    telemetry,
  };
}

/** Overlay launch conditions — must mirror SimFlightOverlay's constants. */
const OVERLAY_LAUNCH_OPTIONS = {
  railLengthM: 2.4,
  railElevationDeg: 85.0,
  railAzimuthDeg: 90.0,
  windSpeedMps: 0,
  windAzimuthDeg: 0,
  finCantDeg: 0,
  mainDeployAltitudeM: 250,
};

/** S1 snapshot key of the current resolved case, exactly as the overlay derives it. */
function currentRunKey(): string {
  const store = useRocketStore.getState();
  const launchCase: LaunchCase = { vehicle: store.vehicle, motorId: store.selectedMotorId, options: OVERLAY_LAUNCH_OPTIONS };
  return snapshotCase(preflight(launchCase, store.customMotors)).runKey;
}

/** Commit a completed, valid, current-keys run into the run store (pattern 8). */
function commitSim() {
  const store = useRocketStore.getState();
  const runId = nextRunId();
  useRunStore.getState().recordAttempt({
    runId,
    runKey: currentRunKey(),
    caseId: `${store.vehicle.id}::${store.selectedMotorId}`,
    valid: true,
    freshness: 'current',
    gate: 'unknown',
    label: 'MC 10 · estes_c6',
    lifecycle: 'completed',
  });
  useRunStore.getState().chooseRun(runId);
  (globalThis as unknown as { __simImpl: SimFlight }).__simImpl = ((_v, _m, _o) => buildSimResult(300));
}

const CSV_260 = (() => {
  const rows = ['time_s,altitude_m'];
  for (let t = 0; t <= 60; t += 2) {
    const alt = t <= 30 ? (260 * t) / 30 : Math.max(0, 260 * (1 - (t - 30) / 30));
    rows.push(`${t},${alt.toFixed(1)}`);
  }
  return rows.join('\n');
})();

/** Same 300 m shape with two 60 m dips: yields two OOT regions. */
const CSV_DIPS = (() => {
  const rows = ['time_s,altitude_m'];
  for (let t = 0; t <= 60; t += 2) {
    let alt = t <= 30 ? (300 * t) / 30 : Math.max(0, 300 * (1 - (t - 30) / 30));
    if ((t >= 15 && t <= 20) || (t >= 40 && t <= 45)) alt = Math.max(0, alt - 60);
    rows.push(`${t},${alt.toFixed(1)}`);
  }
  return rows.join('\n');
})();

function addFlightLog(csv: string = CSV_260) {
  fireEvent.change(screen.getByLabelText(/flight log data/i), { target: { value: csv } });
  fireEvent.click(screen.getByRole('button', { name: /add flight log/i }));
}

beforeEach(() => {
  (globalThis as unknown as { __simImpl: SimFlight }).__simImpl = ((_v, _m, _o) => buildSimResult(300));
});

afterEach(() => {
  useRocketStore.getState().resetStore();
  useRunStore.getState().resetRuns();
  resetRunIdCounter();
});

describe('SimFlightOverlay inspect pane', () => {
  it('asks for a sim run when none is committed, but still ingests logs', () => {
    render(<SimFlightOverlay />);
    expect(screen.getByText(/no committed simulation run/i)).toBeTruthy();
    addFlightLog();
    expect(screen.getByLabelText(/layer flight 1/i)).toBeTruthy();
    expect(screen.getByText(/\[current\]/)).toBeTruthy();
  });

  it('ingests a CSV log, auto-promotes it to current, and layers it', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    // Sim holds [current] on its side; the ingested log auto-promotes on its.
    expect(screen.getAllByText(/\[current\]/).length).toBe(2);
    expect(screen.getByLabelText(/layer flight 1/i)).toBeTruthy();
    expect(screen.getByRole('img', { name: /altitude overlay/i }).getAttribute('aria-label')).toMatch(/sim/i);
  });

  it('rejects garbage paste with an inline alert and keeps the archive', () => {
    commitSim();
    render(<SimFlightOverlay />);
    fireEvent.change(screen.getByLabelText(/flight log data/i), { target: { value: 'not,a,log\nzzz' } });
    fireEvent.click(screen.getByRole('button', { name: /add flight log/i }));
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(/flight 1/i)).toBeNull();
  });

  it('promotes an older log back to current on demand', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    addFlightLog(CSV_260.replaceAll('260', '200'));
    // Newest ingest auto-promoted: only Flight 1 offers promotion.
    expect(screen.getByRole('button', { name: 'Make Flight 1 (CSV) current' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make Flight 1 (CSV) current' }));
    // Promotion moved: now only Flight 2 offers it.
    expect(screen.getByRole('button', { name: 'Make Flight 2 (CSV) current' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make Flight 1 (CSV) current' })).toBeNull();
  });

  it('unchecking a layer removes the series from the plot', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    const plot = () => screen.getByRole('img', { name: /altitude overlay/i }).getAttribute('aria-label') ?? '';
    expect(plot()).toMatch(/flight 1/i);
    fireEvent.click(screen.getByLabelText(/layer flight 1/i));
    expect(plot()).not.toMatch(/flight 1/i);
  });

  it('moves the shared time cursor from the slider and reads layered values', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    const slider = screen.getByLabelText(/overlay time cursor/i) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '30' } });
    expect(screen.getByText('30.0 s')).toBeTruthy();
  });

  it('runs qualify the sim side: stale committed inputs withhold the curve', () => {
    commitSim();
    render(<SimFlightOverlay />);
    expect(screen.getByRole('checkbox', { name: /layer simulated altitude/i })).toBeTruthy();
    const store = useRocketStore.getState();
    const vehicle: RocketVehicle = structuredClone(store.vehicle);
    vehicle.name = 'edited for divergence';
    act(() => store.setVehicle(vehicle));
    // pattern 8: the committed record's key no longer matches the current
    // resolved case — STALE badge, curve withheld, no unqualified pass.
    expect(screen.getByText('Stale — rerun required')).toBeTruthy();
    expect(screen.getByText(/committed inputs differ from the current case/i)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /layer simulated altitude/i })).toBeNull();
    expect(screen.queryByRole('img', { name: /altitude overlay: sim/i })).toBeNull();
  });

  it('never renders a pass from an invalid committed run', () => {
    const store = useRocketStore.getState();
    useRunStore.getState().recordAttempt({
      runId: nextRunId(),
      runKey: currentRunKey(),
      caseId: `${store.vehicle.id}::${store.selectedMotorId}`,
      valid: false,
      freshness: 'current',
      gate: 'unknown',
      label: 'MC 10 · estes_c6',
      lifecycle: 'completed',
    });
    render(<SimFlightOverlay />);
    // The invalid attempt is never chosen: no sim curve, no pass claim.
    expect(screen.getByText(/no committed simulation run/i)).toBeTruthy();
    expect(screen.getByText(/invalid — repair inputs/i)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /layer simulated altitude/i })).toBeNull();
    expect(screen.queryByText(/\bpass\b/i)).toBeNull();
  });

  it('promotes a different committed run back to current from the archive', () => {
    commitSim();
    render(<SimFlightOverlay />);
    // A second completed run on an unrelated key (older input set) stays
    // archived; promoting it re-points the sim side at a stale record.
    act(() => {
      useRunStore.getState().recordAttempt({
        runId: nextRunId(),
        runKey: 'other-committed-key',
        caseId: 'none::none',
        valid: true,
        freshness: 'current',
        gate: 'unknown',
        label: 'MC 25 · estes_c6',
        lifecycle: 'completed',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /make mc 25 · estes_c6 current/i }));
    expect(screen.getByText('Stale — rerun required')).toBeTruthy();
    expect(screen.getByText(/committed inputs differ from the current case/i)).toBeTruthy();
    // The previously-current run remains archived and re-promotable.
    expect(screen.getByRole('button', { name: /make mc 10 · estes_c6 current/i })).toBeTruthy();
  });
});

describe('SimFlightOverlay compare pane', () => {
  function openCompare() {
    fireEvent.click(screen.getByRole('tab', { name: /compare/i }));
  }

  it('summarizes match/mismatch with deltas for sim vs a lower log', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    openCompare();
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-1' } });
    expect(screen.getByText(/mismatch/i)).toBeTruthy();
    expect(screen.getByText(/Δapogee 40\.0 m/)).toBeTruthy();
  });

  it('withholds deltas and flags the pair when alignment is removed', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    openCompare();
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-1' } });
    fireEvent.click(screen.getByRole('button', { name: /aligned/i }));
    expect(screen.getByText(/unaligned — raw times/i)).toBeTruthy();
    expect(screen.queryByText(/Δapogee/i)).toBeNull();
  });

  it('re-runs on tolerance blur: widening the band clears mismatches', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog();
    openCompare();
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-1' } });
    expect(screen.getByText(/\d+ match \/ [1-9]\d* mismatch/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/absolute tolerance/i), { target: { value: '100' } });
    fireEvent.blur(screen.getByLabelText(/absolute tolerance/i));
    expect(screen.getByText(/0 mismatch/i)).toBeTruthy();
  });

  it('navigates out-of-tolerance regions and reports position', () => {
    commitSim();
    render(<SimFlightOverlay />);
    addFlightLog(CSV_DIPS);
    openCompare();
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-1' } });
    expect(screen.getByText(/region 1 of/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /next out-of-tolerance/i }));
    expect(screen.getByText(/region 2 of/i)).toBeTruthy();
  });

  it('stays empty-state until both pickers resolve', () => {
    commitSim();
    render(<SimFlightOverlay />);
    openCompare();
    expect(screen.getByText(/pick a baseline and a compare-to/i)).toBeTruthy();
  });

  it('compares two flight logs when no committed sim run has telemetry', () => {
    // No committed run: the sim side is absent, but the pattern-7 contract
    // still compares log-vs-log end to end.
    render(<SimFlightOverlay />);
    addFlightLog();
    addFlightLog(CSV_DIPS);
    openCompare();
    fireEvent.change(screen.getByLabelText(/baseline series/i), { target: { value: 'flight-1' } });
    fireEvent.change(screen.getByLabelText(/compare-to series/i), { target: { value: 'flight-2' } });
    expect(screen.getByText(/\d+ match \//i)).toBeTruthy();
    expect(screen.getByRole('img', { name: /signed difference/i })).toBeTruthy();
  });
});