/**
 * Native flight / ensemble stub for tests: the shapes `simulate_flight`,
 * `run_ensemble_chunk` and `stability` put on the wire, so Console tests
 * exercise the adapter against realistic payloads instead of empty objects.
 */
import { setTestEngine, type EngineInvoke } from '../engine';
import type { StabilityAnalysis } from '../core/types';
import { useAnalysisStore } from '../state/analysis';
import { useProjectStore } from '../state/project';
import { useConsoleJobs } from './store';
import type { LandingPoint, MonteCarloChunkResult, MonteCarloRunOutcome } from '../sim/monteCarlo';
import { momentArmHistoryFixture } from '../application/momentArmHistory.fixture';
import type { SixDofSimulationResult } from '../sim/sixDofSimulator';

export interface Invocation {
  cmd: string;
  args?: Record<string, unknown>;
}

/** A passing native flight result with the engine's own event names. */
export function flightResult(overrides: Partial<SixDofSimulationResult> = {}): SixDofSimulationResult {
  return {
    apogeeAltitude: 1371,
    apogeeTime: 42.5,
    apogeePosition: { x: 3, y: 12, z: 1371 },
    maxVelocity: 322,
    maxMach: 0.94,
    maxAccelerationG: 12.4,
    burnoutAltitude: 480,
    burnoutVelocity: 300,
    burnoutTime: 3.2,
    railExitVelocity: 27.5,
    isRailExitSafe: true,
    weathercockAngleDeg: 1.8,
    landingPosition: { x: 20, y: 60, z: 0 },
    landingDistance: 63.2,
    landingVelocity: 5.1,
    landingKineticEnergy: 14.2,
    isLandingSafe: true,
    isLandingVelocitySafe: true,
    terminated: true,
    terminationReason: 'touchdown',
    touchdownNominal: true,
    unsupportedHandling: 'continue-and-mark-UNKNOWN',
    runManifest: {
      frames: 'ENU',
      atmosphere: 'ISA-1976',
      ground: 'flat z=0 AGL',
      recovery: 'canopy drag with declared empirical constant CD',
      depletion: 'impulse-proportional on the thrust-curve integral',
      railContact: 'projected unilateral base contact',
      unsupportedHandling: 'continue-and-mark-UNKNOWN',
      unsupportedScope: ['multi-stage separation'],
    },
    landingMass: 18.4,
    flightDuration: 198.2,
    validity: 'PASS',
    enveloped: true,
    offNominalExcursion: false,
    events: [
      { time: 0, name: 'Ignition & Rail Guidance', altitude: 0, velocity: 0, description: '' },
      { time: 1.4, name: 'Launch Rail Departure', altitude: 3.66, velocity: 27.5, description: '' },
      { time: 3.2, name: 'Motor Burnout', altitude: 480, velocity: 300, description: '' },
      { time: 42.5, name: 'Apogee & Drogue Deployment', altitude: 1371, velocity: 4, description: '' },
      { time: 120.4, name: 'Main Parachute Deployment', altitude: 213, velocity: 12, description: '' },
      { time: 198.2, name: 'Ground Touchdown', altitude: 0, velocity: 5.1, description: '' },
    ],
    telemetry: [0, 1.4, 3.2, 42.5, 120.4, 198.2].map((time, i) => ({
      time, altitude: [0, 3.66, 480, 1371, 213, 0][i],
      position: { x: 0, y: 0, z: [0, 3.66, 480, 1371, 213, 0][i] },
      velocity: { x: 0, y: 0, z: [0, 27.5, 300, 4, -12, -5.1][i] },
      speed: [0, 27.5, 300, 4, 12, 5.1][i], mach: [0, 0.08, 0.88, 0.01, 0.04, 0.015][i],
      acceleration: 0, angularVelocity: { p: 0, q: 0, r: 0 }, angleOfAttackDeg: 0,
      q: { w: 1, x: 0, y: 0, z: 0 }, pitchDeg: 90, rollDeg: 0, yawDeg: 0,
      drag: 0, thrust: i < 2 ? 100 : 0, mass: 18.4,
      dynamicPressure: [0, 460, 54000, 10, 80, 16][i],
    })),
    ...overrides,
  };
}

/** Explicit manufactured response to the new reporting request. Not physics. */
export function flightResultForRequest(args?: Record<string, unknown>, overrides: Partial<SixDofSimulationResult> = {}): SixDofSimulationResult {
  if (args?.reportMomentArmHistory !== true) return flightResult(overrides);
  const burn = (args.motor as { burnTime: number }).burnTime;
  const base = flightResult();
  return flightResult({ burnoutTime: burn,
    events: base.events.map(e => e.name === 'Motor Burnout' ? { ...e, time: burn } : e),
    momentArmHistory: momentArmHistoryFixture(burn), ...overrides });
}

/** A native stability analysis for the two-stage fixture vehicle. */
export function stabilityAnalysis(overrides: Partial<StabilityAnalysis> = {}): StabilityAnalysis {
  return {
    totalLength: 1.2,
    maxDiameter: 0.102,
    referenceDiameter: 0.102,
    totalMass: 12,
    cg: 0.72,
    cp: 1.05,
    staticMarginCalibers: 3.235,
    totalCNa: 20,
    isStable: true,
    isOverStable: false,
    contributions: [
      { id: 'nc', name: 'Nose cone', type: 'nosecone', mass: 0.4, cg: 0.1, cna: 2, cp: 0.1, axialStart: 0, axialEnd: 0.3 },
      { id: 'body', name: 'Body tube', type: 'bodytube', mass: 1.2, cg: 0.6, cna: 0, axialStart: 0.3, axialEnd: 1.2 },
      { id: 'fin', name: 'Fin set', type: 'trapezoidfinset', mass: 0.6, cg: 1.08, cna: 18, cp: 1.16, axialStart: 1.0, axialEnd: 1.2 },
    ],
    ...overrides,
  };
}

/** Landings on a ring of radius `r`, deterministic per run index. */
export function chunkLandings(start: number, end: number, radius = 60): MonteCarloChunkResult {
  const landings: LandingPoint[] = [];
  const runs: MonteCarloRunOutcome[] = [];
  for (let i = start; i < end; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const point = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    landings.push(point);
    runs.push({
      runIndex: i,
      outcome: 'supported-nominal-terminal',
      endpoint: point,
      terminated: true,
      terminationReason: 'touchdown',
      touchdownNominal: true,
      validity: 'PASS',
      enveloped: true,
      offNominalExcursion: false,
      failureMessage: null,
    });
  }
  return {
    runStart: start,
    runEnd: end,
    landings,
    failedRuns: 0,
    firstFailureMessage: null,
    runs,
    counts: {
      requested: end - start,
      supportedNominalTerminal: end - start,
      unsupportedNominalTouchdown: 0,
      nonNominalImpact: 0,
      timeLimitEndpoint: 0,
      computationalFailure: 0,
    },
    outcomePolicy: 'classified-v1',
  };
}

// Any stub signature: stubs often take `args` as required.
type TestInvoke = (cmd: string, args?: any, options?: { signal?: AbortSignal; lane?: string }) => Promise<unknown>;

let activeStub: { invoke: TestInvoke } | null = null;

/**
 * Replace the engine with `invoke` for one test. The returned stub's `invoke`
 * may be reassigned mid-test (e.g. to make the next call reject).
 */
export function installTestEngine(invoke: TestInvoke): { stub: { invoke: TestInvoke }; teardown: () => void } {
  const stub = { invoke };
  activeStub = stub;
  setTestEngine(((cmd: string, args?: Record<string, unknown>, options?: { signal?: AbortSignal; lane?: string }) =>
    stub.invoke(cmd, args, options)) as EngineInvoke);
  return {
    stub,
    teardown: () => {
      if (activeStub === stub) {
        activeStub = null;
        setTestEngine(null);
      }
    },
  };
}

/** The engine stub the current test installed. */
export function activeTestEngine(): { invoke: TestInvoke } {
  if (!activeStub) throw new Error('no test engine installed');
  return activeStub;
}

/**
 * Install an engine stub that answers the Console's commands from the
 * fixtures above and records every invocation. Returns the log plus a
 * teardown that restores the real engine.
 */
export function stubEngine(overrides: { onInvoke?: (cmd: string) => void } = {}): {
  calls: Invocation[];
  teardown: () => void;
} {
  const calls: Invocation[] = [];
  const { teardown } = installTestEngine(async (cmd, args) => {
    calls.push({ cmd, args });
    overrides.onInvoke?.(cmd);
    switch (cmd) {
      case 'simulate_flight':
        return flightResultForRequest(args);
      case 'flight_summary':
        return { ...flightResult(), telemetry: [] };
      case 'stability':
        return stabilityAnalysis();
      case 'run_ensemble_chunk': {
        const req = (args?.req ?? {}) as { runStart?: number; runEnd?: number };
        return chunkLandings(req.runStart ?? 0, req.runEnd ?? 0);
      }
      case 'run_ensemble':
        return { landings: [], mean: { x: 0, y: 0 }, covariance: { xx: 0, xy: 0, yy: 0 }, sigma1: 0, sigma2: 0, thetaDeg: 0, containmentRadii: { r50: 0, r90: 0, r99: 0 }, successfulRuns: 0, failedRuns: 0 };
      case 'aero_curves':
        return { machPoints: [], cdPowerOff: [], cdPowerOn: [], cnAlpha: [], cpFromNose: [], maxTransonicCd: 0 };
      case 'aggregate_mass':
        return { totalMass: 12, cg: 0.72, totalLength: 1.2, maxDiameter: 0.102, referenceDiameter: 0.102, components: [] };
      default:
        return {};
    }
  });
  return { calls, teardown };
}

/** Reset the Console's stores to a clean preset project with no run history. */
export function resetConsoleState(): void {
  useProjectStore.getState().loadPreset('nasaStudent');
  useProjectStore.setState({ past: [], future: [] });
  useAnalysisStore.getState().reset();
}

/** Clear any in-flight or finished Console job so a render starts from idle. */
export function consoleJobStub(): void {
  useConsoleJobs.setState({ jobs: { running: false, runError: null, mc: null }, mcAbort: null });
}
