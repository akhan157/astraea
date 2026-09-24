// @vitest-environment jsdom
import { describe, expect, it, afterEach } from 'vitest';
import {
  aggregateMassOf,
  aeroCurvesOf,
  stabilityOf,
  solveChamber,
  nozzlePerformance,
  simulateFlight,
  runEnsemble,
} from './bridge';
import type { RocketVehicle } from '../core/types';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

/**
 * Fail-closed contract: with no Tauri IPC present (plain browser / vitest),
 * EVERY bridge entry rejects with the fail-closed message — never resolves
 * with zero-mass, zero-aero, or synthetic data. Mocked-__TAURI__ suites
 * cover the happy path; this file covers the missing-backend path.
 */
afterEach(() => {
  const win = window as unknown as { __TAURI__?: unknown };
  delete win.__TAURI__;
});

describe('native bridge fail-closed without IPC', () => {
  it('rejects every command when window.__TAURI__ is missing', async () => {
    const vehicle: RocketVehicle = PRESET_ESTES_ALPHA;
    const motor = CERTIFIED_MOTORS.estes_c6;
    await expect(aggregateMassOf(vehicle)).rejects.toThrow(/Tauri IPC is unavailable/);
    await expect(stabilityOf(vehicle)).rejects.toThrow(/Tauri IPC is unavailable/);
    await expect(aeroCurvesOf(vehicle, false)).rejects.toThrow(/Tauri IPC is unavailable/);
    await expect(solveChamber(10_000_000)).rejects.toThrow(/Tauri IPC is unavailable/);
    await expect(nozzlePerformance(3500, 1.18, 24.6, 1e7, 101325, 0)).rejects.toThrow(
      /Tauri IPC is unavailable/,
    );
    await expect(simulateFlight(vehicle, motor, {})).rejects.toThrow(/Tauri IPC is unavailable/);
    await expect(
      runEnsemble({ vehicle, motor, options: {} }, {}, 2, 1, 'per-run-v2'),
    ).rejects.toThrow(/Tauri IPC is unavailable/);
  });
});
