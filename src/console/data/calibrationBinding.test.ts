import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runEnsembleChunkRecorded, simulateFlightRecorded } from '../../tauri/bridge';
import { assertScaleMatchesCalibration, runFlight, runMonteCarlo, type LaunchConfig } from './adapter';
import { chunkLandings, flightResult } from '../testFixtures';
import { PRESET_ESTES_ALPHA } from '../../state/presets';
import { CERTIFIED_MOTORS } from '../../propulsion/motorDatabase';
import { LEGACY_FLIGHT_MODEL } from '../../application/flightModel';
import { setTestEngine } from '../../engine';
import type { DragCalibration, DragFitProvenance, FlightModelBinding } from '../../application/dragCalibration';

vi.mock('../../tauri/bridge', async (original) => ({
  ...await original<typeof import('../../tauri/bridge')>(),
  simulateFlightRecorded: vi.fn(), runEnsembleChunkRecorded: vi.fn(),
}));

const options: LaunchConfig = {
  railLength: 3, railElevationDeg: 85, railAzimuthDeg: 0, windSpeedSurface: 3,
  windAzimuthDeg: 0, finCantAngleDeg: 0, mainDeployAltitudeAGL: 200,
};
const vehicle = PRESET_ESTES_ALPHA;
const motor = CERTIFIED_MOTORS.estes_c6;
const identity = { kind: 'test-engine' as const, sha256: null };
const legacyCalibration: DragCalibration = {
  scale: 0.9, fittedCd: 0.45, modelCd: 0.5, rmseN: 0.1, coastMassKg: 0.05,
  source: { fileName: 'synthetic-guard-fixture.csv', sha256Hex: 'f'.repeat(64), rowCount: 40 },
  window: { startS: 2, endS: 7, method: 'velocity-column', pointsUsed: 30, pointsExcluded: 10 },
  appliedAt: '2026-10-27T00:00:00.000Z',
};

/** Isolate the binding boundary, not the persisted-fit parser/eligibility.
 * Other provenance fields are deliberately irrelevant to this guard fixture.
 * These mocked adapter tests establish no stored-fit or scientific eligibility. */
function withBinding(binding: FlightModelBinding): DragCalibration {
  return { ...structuredClone(legacyCalibration), fitProvenance: {
    flightModelBinding: { ...binding },
  } as DragFitProvenance };
}

beforeEach(() => {
  setTestEngine(null);
  vi.resetAllMocks();
  vi.mocked(simulateFlightRecorded).mockResolvedValue({ value: flightResult(), engineIdentity: identity });
  vi.mocked(runEnsembleChunkRecorded).mockImplementation(async (_base, _sigmas, _n, _seed, start, end) => ({
    value: chunkLandings(start, end), engineIdentity: identity,
  }));
});

describe('shared legacy adapter calibration-binding boundary', () => {
  it.each(Object.keys(LEGACY_FLIGHT_MODEL) as Array<keyof FlightModelBinding>)(
    'refuses a foreign %s before flight or any ensemble chunk/progress, despite matching scale', async (key) => {
      const calibration = withBinding({ ...LEGACY_FLIGHT_MODEL, [key]: 'unsupported-foreign-declaration' });
      const retained = structuredClone(calibration);
      const scaled = { ...options, dragCdScale: calibration.scale };
      const onProgress = vi.fn();
      const onCancelled = vi.fn();
      await expect(runFlight(vehicle, motor, scaled, 'synthetic', 'inputs', 1, undefined, calibration))
        .rejects.toThrow(/incompatible.*flight.model.*binding/i);
      await expect(runMonteCarlo({ vehicle, motor, options: scaled, nRuns: 50, dragCalibration: calibration },
        new AbortController().signal, { onProgress, onCancelled }))
        .rejects.toThrow(/incompatible.*flight.model.*binding/i);
      expect(simulateFlightRecorded).not.toHaveBeenCalled();
      expect(runEnsembleChunkRecorded).not.toHaveBeenCalled();
      expect(onProgress).not.toHaveBeenCalled();
      expect(onCancelled).not.toHaveBeenCalled();
      expect(calibration).toEqual(retained);
    },
  );

  it.each(['none', 'unbound legacy', 'unbound provenance legacy', 'bound legacy'] as const)(
    'preserves %s flight and ensemble dispatch arguments and artifact labels', async (kind) => {
      const calibration = kind === 'none' ? undefined
        : kind === 'unbound legacy' ? structuredClone(legacyCalibration)
          : kind === 'unbound provenance legacy'
            ? { ...structuredClone(legacyCalibration), fitProvenance: {} as DragFitProvenance }
            : withBinding(LEGACY_FLIGHT_MODEL);
      const retained = structuredClone(calibration);
      const scaled = { ...options, ...(calibration === undefined ? {} : { dragCdScale: calibration.scale }) };
      const run = await runFlight(vehicle, motor, scaled, 'synthetic', 'inputs', 1, undefined, calibration);
      const dispersion = await runMonteCarlo({ vehicle, motor, options: scaled, nRuns: 3, dragCalibration: calibration },
        new AbortController().signal);
      expect(simulateFlightRecorded).toHaveBeenCalledTimes(1);
      expect(runEnsembleChunkRecorded).toHaveBeenCalledTimes(1);
      const flightOptions = vi.mocked(simulateFlightRecorded).mock.calls[0][2];
      const ensembleOptions = vi.mocked(runEnsembleChunkRecorded).mock.calls[0][0].options;
      expect(flightOptions).toEqual(ensembleOptions);
      expect(flightOptions?.dragCdScale).toBe(calibration?.scale);
      expect(run.dragCalibration).toEqual(calibration);
      if (calibration === undefined) expect(run.manifest.dragCalibration).toBeUndefined();
      else expect(run.manifest.dragCalibration).toContain('drag scale 0.900 fitted to synthetic-guard-fixture.csv');
      expect(dispersion.dragCalibration).toEqual(calibration);
      expect(calibration).toEqual(retained);
      expect(scaled).toEqual({ ...options, ...(calibration === undefined ? {} : { dragCdScale: calibration.scale }) });
    },
  );

  it('refuses a recorded fit engine that differs from the dispatching engine, before any flight or chunk', async () => {
    const calibration: DragCalibration = {
      ...structuredClone(legacyCalibration),
      fitProvenance: {
        flightModelBinding: { ...LEGACY_FLIGHT_MODEL },
        engineIdentity: { kind: 'production-rust-wasm', sha256: 'a'.repeat(64) },
      } as DragFitProvenance,
    };
    const scaled = { ...options, dragCdScale: calibration.scale };
    const onProgress = vi.fn();
    await expect(runFlight(vehicle, motor, scaled, 'synthetic', 'inputs', 1, undefined, calibration))
      .rejects.toThrow(/different engine/);
    await expect(runMonteCarlo({ vehicle, motor, options: scaled, nRuns: 5, dragCalibration: calibration },
      new AbortController().signal, { onProgress }))
      .rejects.toThrow(/different engine/);
    expect(simulateFlightRecorded).not.toHaveBeenCalled();
    expect(runEnsembleChunkRecorded).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('refuses a recorded fit engine whose identity is unknown rather than inferring a match', async () => {
    // Same test-engine kind on both sides still has no SHA-256: unknown, not same.
    setTestEngine(<T,>() => Promise.resolve(flightResult() as T));
    const calibration: DragCalibration = {
      ...structuredClone(legacyCalibration),
      fitProvenance: {
        flightModelBinding: { ...LEGACY_FLIGHT_MODEL },
        engineIdentity: { kind: 'test-engine', sha256: null },
      } as DragFitProvenance,
    };
    const scaled = { ...options, dragCdScale: calibration.scale };
    await expect(runFlight(vehicle, motor, scaled, 'synthetic', 'inputs', 1, undefined, calibration))
      .rejects.toThrow(/cannot be verified/);
    await expect(runMonteCarlo({ vehicle, motor, options: scaled, nRuns: 5, dragCalibration: calibration },
      new AbortController().signal))
      .rejects.toThrow(/cannot be verified/);
    expect(simulateFlightRecorded).not.toHaveBeenCalled();
    expect(runEnsembleChunkRecorded).not.toHaveBeenCalled();
  });

  it('retains strict scale/artifact matching for no artifact, legacy and matching-bound artifacts', () => {
    expect(() => assertScaleMatchesCalibration('test', { ...options, dragCdScale: 1 }, undefined))
      .toThrow(/does not match/);
    for (const calibration of [legacyCalibration, withBinding(LEGACY_FLIGHT_MODEL)]) {
      expect(() => assertScaleMatchesCalibration('test', options, calibration)).toThrow(/does not match/);
      expect(() => assertScaleMatchesCalibration('test', { ...options, dragCdScale: 1.1 }, calibration))
        .toThrow(/does not match/);
    }
  });
});
