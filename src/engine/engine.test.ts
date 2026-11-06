/**
 * The shipped WebAssembly engine (src/engine/astraea_engine.wasm, built by
 * `pnpm build:engine`) behind the real bridge, checked against the
 * TypeScript oracle engines. These are the bytes the website and the desktop
 * app run.
 *
 * Tolerance, not bit equality: WebAssembly brings its own math library, and
 * no build matches V8's `Math.*` bit for bit (measured over 200k random
 * inputs per function: native glibc differs from V8 on exp/log/sin/cos/atan2,
 * WebAssembly differs on pow). Across three vehicles and three winds the
 * WebAssembly results sit within ~1e-15 relative of the oracle and Monte
 * Carlo landings within ~1e-11 m, so the project's standing telemetry
 * tolerance (relative 1e-9) applies. The WebAssembly results themselves are
 * deterministic: every OS and browser runs the same bytes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRESET_ESTES_ALPHA, PRESET_NASA_STUDENT_LAUNCH } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { computeRocketStability } from '../aero/barrowman';
import { simulate6DofFlight } from '../sim/sixDofSimulator';
import { runMonteCarloChunk } from '../sim/monteCarlo';
import { aggregateMassOf, runEnsembleChunk, simulateFlight, stabilityOf, solveChamber } from '../tauri/bridge';
import { instantiateEngine, EngineError, type EngineInstance } from './core';
import { setTestEngine, poolSize, type EngineInvoke } from './index';

let engine: EngineInstance;

beforeAll(async () => {
  const bytes = readFileSync(fileURLToPath(new URL('./astraea_engine.wasm', import.meta.url)));
  engine = await instantiateEngine(bytes);
  setTestEngine((async (cmd: string, args?: Record<string, unknown>) => engine.call(cmd, args)) as EngineInvoke);
});

afterAll(() => setTestEngine(null));

/** |a - b| <= 1e-9 * max(|b|, 1): the project's standing parity tolerance. */
function expectClose(a: number, b: number): void {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(1e-9 * Math.max(Math.abs(b), 1));
}

const OPTIONS = {
  railLength: 3,
  railElevationDeg: 85,
  railAzimuthDeg: 0,
  windSpeedSurface: 3,
  windAzimuthDeg: 0,
  finCantAngleDeg: 0,
  mainDeployAltitudeAGL: 300,
};

describe('WebAssembly engine against the TypeScript oracle', () => {
  it.each([
    ['Estes Alpha + C6', PRESET_ESTES_ALPHA, 'estes_c6'],
    ['NASA Student Launch + K550W', PRESET_NASA_STUDENT_LAUNCH, 'aerotech_k550w'],
  ] as const)('flies %s like the oracle', async (_label, vehicle, motorId) => {
    const motor = CERTIFIED_MOTORS[motorId];
    const wasm = await simulateFlight(vehicle, motor, OPTIONS);
    const oracle = simulate6DofFlight(vehicle, motor, OPTIONS);
    expectClose(wasm.apogeeAltitude, oracle.apogeeAltitude);
    expectClose(wasm.railExitVelocity, oracle.railExitVelocity);
    expectClose(wasm.landingVelocity, oracle.landingVelocity);
    expectClose(wasm.landingDistance, oracle.landingDistance);
    expect(wasm.events.map((e) => e.name)).toEqual(oracle.events.map((e) => e.name));
    expect(wasm.telemetry.length).toBeGreaterThan(100);
    expect(wasm.telemetry.length).toBeLessThanOrEqual(5000);
  });

  it('matches the Barrowman stability oracle', async () => {
    const wasm = await stabilityOf(PRESET_NASA_STUDENT_LAUNCH);
    const oracle = computeRocketStability(PRESET_NASA_STUDENT_LAUNCH);
    expect(wasm.staticMarginCalibers).toBeCloseTo(oracle.staticMarginCalibers, 9);
  });

  it('reproduces a Monte Carlo chunk run for run', async () => {
    const motor = CERTIFIED_MOTORS.estes_c6;
    const sigmas = { windAzimuthDegSigma: 20, railAngleDegSigma: 1, impulsePctSigma: 3 };
    const input = { vehicle: PRESET_ESTES_ALPHA, motor, options: OPTIONS };
    const wasm = await runEnsembleChunk(input, sigmas, 100, 42, 10, 14);
    const oracle = runMonteCarloChunk(input, sigmas, 100, 42, 10, 14);
    expect(wasm.landings).toHaveLength(oracle.landings.length);
    wasm.landings.forEach((p, i) => {
      expectClose(p.x, oracle.landings[i].x);
      expectClose(p.y, oracle.landings[i].y);
    });
    expect(wasm.failedRuns).toBe(oracle.failedRuns);
  });

  it('reproduces a bound-touching Monte Carlo chunk run for run', async () => {
    const motor = CERTIFIED_MOTORS.estes_c6;
    const sigmas = { windAzimuthDegSigma: 20, railAngleDegSigma: 1, impulsePctSigma: 3 };
    const input = { vehicle: PRESET_ESTES_ALPHA, motor, options: { ...OPTIONS, railElevationDeg: 90 } };
    const wasm = await runEnsembleChunk(input, sigmas, 100, 42, 10, 14);
    const oracle = runMonteCarloChunk(input, sigmas, 100, 42, 10, 14);
    expect(wasm.failedRuns).toBe(0);
    expect(oracle.failedRuns).toBe(0);
    expect(wasm.landings).toHaveLength(oracle.landings.length);
    wasm.landings.forEach((p, i) => {
      expectClose(p.x, oracle.landings[i].x);
      expectClose(p.y, oracle.landings[i].y);
    });
  });

  it('carries the classified outcome ledger for every absolute chunk index', async () => {
    const motor = CERTIFIED_MOTORS.estes_c6;
    const sigmas = { windAzimuthDegSigma: 20, railAngleDegSigma: 1, impulsePctSigma: 3 };
    const input = { vehicle: PRESET_ESTES_ALPHA, motor, options: OPTIONS };
    const wasm = await runEnsembleChunk(input, sigmas, 100, 42, 10, 14);
    expect(wasm.runs?.map((run) => run.runIndex)).toEqual([10, 11, 12, 13]);
    expect(wasm.counts?.requested).toBe(4);
    expect(wasm.outcomePolicy).toBe('classified-v1');
    const counts = wasm.counts!;
    const total = counts.supportedNominalTerminal + counts.unsupportedNominalTouchdown
      + counts.nonNominalImpact + counts.timeLimitEndpoint + counts.computationalFailure;
    expect(total).toBe(4);
    for (const run of wasm.runs ?? []) {
      expect(run.endpoint === null).toBe(run.outcome === 'computational-failure');
    }
  });

  it('serves the mass rollup and chamber chemistry', async () => {
    const mass = await aggregateMassOf(PRESET_NASA_STUDENT_LAUNCH);
    expect(mass.totalMass).toBeGreaterThan(1);
    const chamber = await solveChamber(6.9e6);
    expect(chamber.gamma).toBeGreaterThan(1);
  });
});

describe('engine boundary', () => {
  it('rejects unknown commands and malformed arguments with a message', () => {
    expect(() => engine.call('no_such_command')).toThrow(EngineError);
    expect(() => engine.call('no_such_command')).toThrow(/unknown command 'no_such_command'/);
    expect(() => engine.call('stability', { vehicle: 'not a vehicle' })).toThrow(/stability: invalid argument 'vehicle'/);
    // The instance stays usable after an engine error.
    expect(engine.poisoned).toBe(false);
  });

  it('sizes the worker pool from the core count', () => {
    expect(poolSize(16)).toBe(8);
    expect(poolSize(4)).toBe(3);
    expect(poolSize(2)).toBe(2);
    expect(poolSize(undefined)).toBe(3);
  });
});
