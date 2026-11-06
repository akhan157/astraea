// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import {
  aggregateMassOf,
  aeroCurvesOf,
  stabilityOf,
  solveChamber,
  nozzlePerformance,
  ingredientLibrary,
  propellantPerformance,
  simulateFlight,
  runEnsemble,
  runEnsembleChunk,
} from './bridge';
import type { RocketVehicle } from '../core/types';
import type { SixDofOptions } from '../sim/sixDofSimulator';
import { PRESET_ESTES_ALPHA, PRESET_NASA_STUDENT_LAUNCH } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { setTestEngine, type EngineInvoke } from '../engine';

/**
 * Fail-closed contract: with no engine (no WebAssembly workers, no test
 * engine), EVERY bridge entry rejects with the fail-closed message — never
 * resolves with zero-mass, zero-aero, or synthetic data. Stubbed-engine
 * suites cover the happy path; this file covers the missing-engine path.
 */
afterEach(() => {
  setTestEngine(null);
});

describe('bridge fail-closed without an engine', () => {
  it('rejects every command when the engine cannot run', async () => {
    const vehicle: RocketVehicle = PRESET_ESTES_ALPHA;
    const motor = CERTIFIED_MOTORS.estes_c6;
    await expect(aggregateMassOf(vehicle)).rejects.toThrow(/needs WebAssembly and Web Workers/);
    await expect(stabilityOf(vehicle)).rejects.toThrow(/needs WebAssembly and Web Workers/);
    await expect(aeroCurvesOf(vehicle, false)).rejects.toThrow(/needs WebAssembly and Web Workers/);
    await expect(solveChamber(10_000_000)).rejects.toThrow(/needs WebAssembly and Web Workers/);
    await expect(nozzlePerformance(3500, 1.18, 24.6, 1e7, 101325, 0)).rejects.toThrow(
      /needs WebAssembly and Web Workers/,
    );
    await expect(ingredientLibrary()).rejects.toThrow(/needs WebAssembly and Web Workers/);
    await expect(
      propellantPerformance({
        recipe: [{ ingredientId: 'potassium_nitrate', mass: 65 }, { ingredientId: 'sorbitol', mass: 35 }],
        chamberPressure: 6.9e6,
        exitPressure: 101_325,
      }),
    ).rejects.toThrow(/needs WebAssembly and Web Workers/);
    await expect(simulateFlight(vehicle, motor, {})).rejects.toThrow(/needs WebAssembly and Web Workers/);
    await expect(
      runEnsemble({ vehicle, motor, options: {} }, {}, 2, 1, 'per-run-v2'),
    ).rejects.toThrow(/needs WebAssembly and Web Workers/);
  });
});

describe('native bridge central run layer (vehicle-derived options)', () => {
  const alpha = { ...PRESET_ESTES_ALPHA, launchSite: { altitudeM: 1143 } };

  function stubInvoke(): Array<{ cmd: string; args: Record<string, unknown> }> {
    const seen: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    setTestEngine((async (cmd: string, args?: Record<string, unknown>) => {
      seen.push({ cmd, args: args ?? {} });
      return {};
    }) as EngineInvoke);
    return seen;
  }

  /** Options the bridge sent for `cmd`: top level for simulate_flight, under `req` for ensembles. */
  function sentOptions(
    seen: Array<{ cmd: string; args: Record<string, unknown> }>,
    cmd: string,
  ): SixDofOptions {
    const call = seen.find((s) => s.cmd === cmd);
    expect(call).toBeTruthy();
    const req = call!.args.req;
    const payload = req === undefined ? call!.args : (req as Record<string, unknown>);
    // Stub-owned payload shape: the test drives the exact args the bridge built.
    const options = payload.options as SixDofOptions;
    expect(options).toBeTruthy();
    return options;
  }

  it('derives the launch altitude for a caller that passes none', async () => {
    const seen = stubInvoke();
    await simulateFlight(alpha, CERTIFIED_MOTORS.estes_c6, { mainDeployAltitudeAGL: 250 });
    const options = sentOptions(seen, 'simulate_flight');
    expect(options.launchAltitudeASL).toBe(1143);
    expect(options.mainDeployAltitudeAGL).toBe(250);
    expect(options).not.toHaveProperty('aeroModel');
    expect(options).not.toHaveProperty('launchTemperatureK');
    expect(options).not.toHaveProperty('launchPressurePa');
  });

  it('derives them for runEnsemble and runEnsembleChunk too', async () => {
    const seen = stubInvoke();
    const base = { vehicle: alpha, motor: CERTIFIED_MOTORS.estes_c6, options: { railLength: 1.0 } };
    await runEnsemble(base, {}, 2, 7, 'per-run-v2');
    await runEnsembleChunk(base, {}, 2, 7, 0, 2, 'per-run-v2');
    for (const cmd of ['run_ensemble', 'run_ensemble_chunk']) {
      const options = sentOptions(seen, cmd);
      expect(options.launchAltitudeASL).toBe(1143);
      expect(options.railLength).toBe(1.0);
      expect(options).not.toHaveProperty('aeroModel');
    }
  });

  it('never sends a removed aero-model, temperature, or pressure field', async () => {
    const seen = stubInvoke();
    await simulateFlight(
      { ...PRESET_NASA_STUDENT_LAUNCH, launchSite: { altitudeM: 1143 } },
      CERTIFIED_MOTORS.estes_c6,
      {},
    );
    const options = sentOptions(seen, 'simulate_flight');
    expect(options.launchAltitudeASL).toBe(1143);
    expect(options).not.toHaveProperty('aeroModel');
    expect(options).not.toHaveProperty('launchTemperatureK');
    expect(options).not.toHaveProperty('launchPressurePa');
  });

  it('allows a caller to restate the derived values verbatim', async () => {
    const seen = stubInvoke();
    await simulateFlight(alpha, CERTIFIED_MOTORS.estes_c6, { launchAltitudeASL: 1143 });
    const options = sentOptions(seen, 'simulate_flight');
    expect(options.launchAltitudeASL).toBe(1143);
  });

  it('fails closed when a caller contradicts the derived launch site', async () => {
    const seen = stubInvoke();
    await expect(
      simulateFlight(alpha, CERTIFIED_MOTORS.estes_c6, { launchAltitudeASL: 0 }),
    ).rejects.toThrow(/options\.launchAltitudeASL \(0\) disagrees with the vehicle-derived value \(1143\)/);
    // A site-less vehicle derives no site inputs: supplying one contradicts it.
    await expect(
      simulateFlight(PRESET_NASA_STUDENT_LAUNCH, CERTIFIED_MOTORS.estes_c6, {
        launchAltitudeASL: 500,
      }),
    ).rejects.toThrow(/options\.launchAltitudeASL \(500\) disagrees with the vehicle-derived value \(undefined\)/);
    expect(seen).toHaveLength(0);
  });
});

describe('native bridge telemetry (bounded display series)', () => {
  function stubResult(
    result: Record<string, unknown>,
  ): Array<{ cmd: string; args: Record<string, unknown> }> {
    const seen: Array<{ cmd: string; args: Record<string, unknown> }> = [];
    setTestEngine((async (cmd: string, args?: Record<string, unknown>) => {
      seen.push({ cmd, args: args ?? {} });
      return result;
    }) as EngineInvoke);
    return seen;
  }

  const sample = {
    time: 0,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    mach: 0,
    altitude: 0,
    acceleration: 0,
    angularVelocity: { p: 0, q: 0, r: 0 },
    angleOfAttackDeg: 0,
    q: { w: 1, x: 0, y: 0, z: 0 },
    pitchDeg: 90,
    rollDeg: 0,
    yawDeg: 0,
    drag: 0,
    thrust: 0,
    mass: 0.15084933084864577,
    dynamicPressure: 0,
  };

  it('forwards the native display series unchanged in a single call', async () => {
    const telemetry = [sample, { ...sample, time: 0.05, altitude: 0.1 }];
    const seen = stubResult({ telemetry, events: [], validity: 'PASS' });
    const res = await simulateFlight(PRESET_ESTES_ALPHA, CERTIFIED_MOTORS.estes_c6, {});
    expect(res.telemetry).toEqual(telemetry);
    // One coarse-grained call: telemetry is a payload field, never a per-step command.
    expect(seen.map((s) => s.cmd)).toEqual(['simulate_flight']);
    // `recordTelemetry` is internal to the shell: it must never be a wire field.
    expect(seen[0].args.options).not.toHaveProperty('recordTelemetry');
  });

  it('sends no telemetry-shaped option and receives none from ensembles', async () => {
    const seen = stubResult({ landingPoints: [], nRuns: 2 });
    const res = await runEnsemble(
      { vehicle: PRESET_ESTES_ALPHA, motor: CERTIFIED_MOTORS.estes_c6, options: {} },
      {},
      2,
      7,
      'per-run-v2',
    );
    expect(seen.map((s) => s.cmd)).toEqual(['run_ensemble']);
    expect(seen[0].args.req).toHaveProperty('options');
    expect(seen[0].args.req).not.toHaveProperty('options.recordTelemetry');
    // Ensemble paths never carry a telemetry series.
    expect(res).not.toHaveProperty('telemetry');
  });
});
