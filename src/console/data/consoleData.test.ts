/**
 * Console data layer: every number comes over the Tauri bridge, and a missing
 * backend fails closed instead of substituting a test engine.
 *
 * Mirrors the legacy chunked host (`src/components/TrajectoryStudio.tsx`):
 * absolute `per-run-v2` ranges, progress per chunk, and a cancel that stops
 * before the next chunk and records nothing.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RocketVehicle } from '../../core/types';
import { CERTIFIED_MOTORS } from '../../propulsion/motorDatabase';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import { presetOf } from '../../state/project';
import { aeroConfidence, MC_CHUNK_RUNS, runFlight, runMonteCarlo, shearConfidence, stabilityOfVehicle } from '../data/adapter';
import type { Confidence } from '../data/contract';
import type { LaunchConfig } from '../data/adapter';
import { stubEngine, type Invocation } from '../testFixtures';

/** Levels the adapter may assign from real engine signals. */
const FlightLevels: Confidence[] = ['measured', 'calibrated', 'modeled', 'extrapolated', 'unknown'];

const OPTIONS: LaunchConfig = {
  railLength: 3.66,
  railElevationDeg: 88,
  railAzimuthDeg: 0,
  windSpeedSurface: 3,
  windAzimuthDeg: 90,
  finCantAngleDeg: 0,
  mainDeployAltitudeAGL: 213,
};

function fixtures(): { vehicle: RocketVehicle; motor: MotorSpec } {
  const preset = presetOf('nasaStudent');
  if (preset === null) throw new Error('the Student Launch preset is missing from the build');
  const motor = CERTIFIED_MOTORS.aerotech_k550w;
  if (motor === undefined) throw new Error('the K550W cert motor is missing from the build');
  return { vehicle: preset.vehicle, motor };
}

describe('console data layer against the native bridge', () => {
  let calls: Invocation[];
  let teardown: () => void;

  beforeEach(() => {
    const stub = stubEngine();
    calls = stub.calls;
    teardown = stub.teardown;
  });

  afterEach(() => teardown());

  it('runs a flight through simulate_flight and never passes vehicle-derived options', async () => {
    const { vehicle, motor } = fixtures();
    const run = await runFlight(vehicle, motor, OPTIONS, 'certified', 'key-1', 3);

    const options = calls[0].args?.options as Record<string, unknown>;
    expect(calls[0].cmd).toBe('simulate_flight');
    // The caller never chooses these: the run layer derives them from the
    // vehicle, and the removed aero-model/temperature/pressure fields are gone.
    expect(options).not.toHaveProperty('launchAltitudeASL');
    expect(options).not.toHaveProperty('launchTemperatureK');
    expect(options).not.toHaveProperty('aeroModel');
    expect(options).not.toHaveProperty('launchPressurePa');
    expect(options.railLength).toBe(3.66);
    expect(options.mainDeployAltitudeAGL).toBe(213);

    expect(run.rev).toBe(3);
    expect(run.inputKey).toBe('key-1');
    expect(run.summary.apogee.value).toBeCloseTo(1371, 6);
    expect(run.summary.validity).toBe('PASS');
    expect(run.gates.find((g) => g.id === 'rail_exit')?.status).toBe('pass');
    expect(run.gates.find((g) => g.id === 'validity')?.status).toBe('pass');
  });

  it('carries the engine manifest and the motor-curve basis into the run', async () => {
    const { vehicle, motor } = fixtures();
    const run = await runFlight(vehicle, motor, OPTIONS, 'certified', 'key-2', 4);
    expect(run.manifest.atmosphere).toBe('ISA-1976');
    expect(run.manifest.motorCurve).toMatch(/certified motor library/);

    const imported = await runFlight(vehicle, motor, OPTIONS, 'import', 'key-3', 5);
    expect(imported.manifest.motorCurve).toMatch(/not a certified static-test record/);
  });

  it('takes the aero level from the modeled aerodynamic basis, with its reason', async () => {
    const { vehicle, motor } = fixtures();
    const run = await runFlight(vehicle, motor, OPTIONS, 'certified', 'key-4', 6);
    const aero = aeroConfidence();
    expect(run.summary.apogee.confidence).toBe(aero.confidence);
    expect(run.summary.apogee.reason).toBe(aero.reason);
    expect(FlightLevels).toContain(aero.confidence);
    // Confidence is never invented: the level always carries a plain-language basis.
    for (const key of ['apogee', 'maxMach', 'railExitSpeed', 'drift', 'landingEnergy'] as const) {
      expect(run.summary[key].reason ?? '').not.toBe('');
    }
  });

  it('fails closed when the engine is absent', async () => {
    teardown();
    const { vehicle, motor } = fixtures();
    await expect(runFlight(vehicle, motor, OPTIONS, 'certified', 'key-5', 7)).rejects.toThrow(/needs WebAssembly and Web Workers/);
    await expect(stabilityOfVehicle(vehicle)).rejects.toThrow(/needs WebAssembly and Web Workers/);
    await expect(runMonteCarlo({ vehicle, motor, options: OPTIONS, nRuns: 2 }, new AbortController().signal)).rejects.toThrow(/needs WebAssembly and Web Workers/);
  });

  it('runs Monte Carlo in absolute per-run-v2 chunks with progress', async () => {
    const { vehicle, motor } = fixtures();
    const nRuns = MC_CHUNK_RUNS + 10;
    const progress: number[] = [];
    const dispersion = await runMonteCarlo({ vehicle, motor, options: OPTIONS, nRuns, seed: 7 }, new AbortController().signal, {
      onProgress: (done) => progress.push(done),
    });

    const chunks = calls.filter((c) => c.cmd === 'run_ensemble_chunk');
    expect(chunks).toHaveLength(2);
    const first = chunks[0].args?.req as Record<string, unknown>;
    const second = chunks[1].args?.req as Record<string, unknown>;
    expect(first.runStart).toBe(0);
    expect(first.runEnd).toBe(MC_CHUNK_RUNS);
    expect(second.runStart).toBe(MC_CHUNK_RUNS);
    expect(second.runEnd).toBe(nRuns);
    for (const req of [first, second]) {
      expect(req.version).toBe('per-run-v2');
      expect(req.nRuns).toBe(nRuns);
      expect(req.seed).toBe(7);
      expect(req.sigmas).toEqual({ windAzimuthDegSigma: 20, railAngleDegSigma: 1, impulsePctSigma: 3 });
      const options = req.options as Record<string, unknown>;
      expect(options).not.toHaveProperty('aeroModel');
      expect(options).not.toHaveProperty('launchAltitudeASL');
    }
    expect(progress).toEqual([MC_CHUNK_RUNS, nRuns]);
    expect(dispersion.ok).toBe(nRuns);
    expect(dispersion.landings).toHaveLength(nRuns);
    expect(dispersion.r50).toBeGreaterThan(0);
  });

  it('cancels mid-ensemble and records no result', async () => {
    const { vehicle, motor } = fixtures();
    const controller = new AbortController();
    const cancelled: number[] = [];
    const promise = runMonteCarlo({ vehicle, motor, options: OPTIONS, nRuns: MC_CHUNK_RUNS * 3 }, controller.signal, {
      onProgress: (done) => {
        if (done === MC_CHUNK_RUNS) controller.abort();
      },
      onCancelled: (done) => cancelled.push(done),
    });

    // Every chunk is dispatched at once (the pool spreads them over cores and
    // drops or terminates the rest on abort); chunks finishing after the
    // abort are ignored.
    await expect(promise).rejects.toThrow(new RegExp(`cancelled after ${MC_CHUNK_RUNS} of ${MC_CHUNK_RUNS * 3} runs`));
    expect(cancelled).toEqual([MC_CHUNK_RUNS]);
    expect(calls.filter((c) => c.cmd === 'run_ensemble_chunk')).toHaveLength(3);
  });

  it('builds stability from the native assembly, not a TS model', async () => {
    const { vehicle } = fixtures();
    const breakdown = await stabilityOfVehicle(vehicle);
    expect(calls.some((c) => c.cmd === 'stability')).toBe(true);
    expect(breakdown.rows.map((r) => r.partId)).toEqual(['nc', 'body', 'fin']);
    expect(breakdown.margin.value).toBeCloseTo(3.235, 6);
    expect(breakdown.parts.find((p) => p.id === 'fin')).toEqual({ id: 'fin', axialStart: 1.0, axialEnd: 1.2, cg: 1.08, mass: 0.6 });
    expect(breakdown.notes.length).toBeGreaterThan(0);
  });

  it('derives confidence from the modeled aero basis and the shear-modulus source', async () => {
    const aero = aeroConfidence();
    expect(aero.confidence).toBe('modeled');
    expect(aero.reason.length).toBeGreaterThan(0);

    expect(shearConfidence(true, 'fiberglass', aero).confidence).toBe('measured');
    expect(shearConfidence(false, 'fiberglass', aero).confidence).toBe('modeled');
    expect(shearConfidence(false, 'unobtainium', aero).confidence).toBe('unknown');
  });

});
