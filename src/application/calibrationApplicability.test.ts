import { describe, expect, it } from 'vitest';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { PRESET_ESTES_ALPHA } from '../state/presets';
import { fitDragScale } from '../evidence/dragFit';
import { buildLogProvenance } from '../evidence/logProvenance';
import { buildDragCalibration, type DragCalibration } from './dragCalibration';
import { LEGACY_FLIGHT_MODEL } from './flightModel';
import type { LaunchOptions } from './caseResolver';
import {
  activeCalibration, calibrationEngineStatus, calibrationFitInputKey,
  flightModelBindingStatus, resolveCalibrationApplicability,
} from './calibrationApplicability';

const OPTIONS: LaunchOptions = {
  railLengthM: 2.4, railElevationDeg: 85, railAzimuthDeg: 0,
  windSpeedMps: 3, windAzimuthDeg: 90, finCantDeg: 0, mainDeployAltitudeM: 150,
};
const MOTORS = { estes_c6: CERTIFIED_MOTORS.estes_c6 };
const VEHICLE = structuredClone(PRESET_ESTES_ALPHA);
const keyAt = (vehicle = VEHICLE, options: LaunchOptions = OPTIONS, motors = MOTORS): string => {
  const key = calibrationFitInputKey({ vehicle, motorId: 'estes_c6', options }, motors);
  if (key === null) throw new Error('controlled case did not key');
  return key;
};
const KEY = keyAt();

/** Real builder path: controlled synthetic coast fit, same shape the app stores. */
async function calibration(engineIdentity?: { kind: 'production-rust-wasm'; sha256: string | null }): Promise<DragCalibration> {
  const samples = Array.from({ length: 351 }, (_, i) => {
    const timeS = i / 50;
    return { timeS, altitudeM: 100 + 80 * timeS - 6 * timeS ** 2, velocityMs: 80 - 12 * timeS };
  });
  const fit = fitDragScale({
    log: samples, coastMassKg: 1, refAreaM2: 0.01, launchElevationM: 100,
    modelTelemetry: samples.filter((_, i) => i % 2 === 0).map((p) => ({ time: p.timeS, altitude: p.altitudeM, velocity: { z: p.velocityMs } })),
  });
  const side = {
    burnout: { earliestS: -1.1, latestS: -1, source: 'Controlled burnout' },
    recovery: { kind: 'first-event' as const, event: { earliestS: 7, latestS: 7.1, source: 'Controlled recovery' } },
    verticalMotion: { status: 'supported' as const, source: 'Controlled vertical' },
    constantMass: { status: 'supported' as const, source: 'Controlled mass' },
  };
  const log = await buildLogProvenance({ rawText: 'controlled fixture', fileName: 'controlled.csv', rowCount: samples.length });
  return buildDragCalibration(fit, log, '2026-10-28T00:00:00.000Z', LEGACY_FLIGHT_MODEL,
    { log: side, model: side }, KEY, 'fnv1a32:01234567', engineIdentity);
}

describe('calibration fit-input identity', () => {
  it('keys the canonical uncalibrated case and changes with every physical fit dependency', () => {
    expect(KEY).toMatch(/^[0-9a-f]{8}$/);
    expect(keyAt()).toBe(KEY);
    const cases: Array<[string, string]> = [
      ['wind', keyAt(VEHICLE, { ...OPTIONS, windSpeedMps: 13 })],
      ['rail length', keyAt(VEHICLE, { ...OPTIONS, railLengthM: 3 })],
      ['rail elevation', keyAt(VEHICLE, { ...OPTIONS, railElevationDeg: 80 })],
      ['main deploy', keyAt(VEHICLE, { ...OPTIONS, mainDeployAltitudeM: 300 })],
      ['fin cant', keyAt(VEHICLE, { ...OPTIONS, finCantDeg: 1 })],
      ['site', keyAt({ ...VEHICLE, launchSite: { altitudeM: 900 } })],
      ['geometry', keyAt({ ...VEHICLE, components: VEHICLE.components.map((c) => c.type === 'nosecone' ? { ...c, length: c.length + 0.01 } : c) })],
      ['same-id motor content', keyAt(VEHICLE, OPTIONS, { estes_c6: { ...CERTIFIED_MOTORS.estes_c6, designation: 'Edited C6' } })],
    ];
    for (const [name, key] of cases) expect(key, name).not.toBe(KEY);
    // Unkeyable preflight is never treated as compatible.
    expect(calibrationFitInputKey({ vehicle: VEHICLE, motorId: 'missing', options: OPTIONS }, MOTORS)).toBeNull();
  });
});

describe('provenance-bound applicability', () => {
  it('is active for the fitted inputs, inactive on a differing context, and active again on undo', async () => {
    const artifact = await calibration();
    const retained = structuredClone(artifact);
    const at = (options: LaunchOptions) => resolveCalibrationApplicability({
      calibration: artifact, currentFitInputKey: keyAt(VEHICLE, options),
    });
    expect(at(OPTIONS)).toMatchObject({ status: 'active', model: 'bound' });
    const changed = at({ ...OPTIONS, windSpeedMps: 13 });
    expect(changed).toMatchObject({ status: 'inactive', reason: 'fit-inputs', recordedFitInputKey: KEY });
    expect(activeCalibration(changed)).toBeUndefined();
    expect(at(OPTIONS)).toMatchObject({ status: 'active' });
    expect(artifact).toEqual(retained);
    expect(artifact.fitProvenance!.uncalibratedRunKey).toBe(KEY);
  });

  it('recognizes the documented historical shear-suffixed fit key without truncating arbitrary suffixes', async () => {
    const base = await calibration();
    const withShear = (suffix: string): DragCalibration => ({
      ...base, fitProvenance: { ...base.fitProvenance!, uncalibratedRunKey: `${KEY}${suffix}` },
    });
    const at = (artifact: DragCalibration) => resolveCalibrationApplicability({ calibration: artifact, currentFitInputKey: KEY });
    expect(at(withShear('|shear:4000000000'))).toMatchObject({ status: 'active' });
    expect(at(withShear('|shear:-0.5'))).toMatchObject({ status: 'active' });
    // Later shear changes are irrelevant: the current key carries no shear.
    expect(at(withShear('|shear:9000000000'))).toMatchObject({ status: 'active' });
    for (const unrecognized of ['|shear:', '|shear:not-a-number', '|shear:3.0', `|${KEY}`, 'x']) {
      expect(at(withShear(unrecognized)), unrecognized).toMatchObject({ status: 'inactive', reason: 'fit-inputs' });
    }
    // A real physical input change still refuses even with the historical form.
    const changed = resolveCalibrationApplicability({ calibration: withShear('|shear:4000000000'), currentFitInputKey: keyAt(VEHICLE, { ...OPTIONS, windSpeedMps: 13 }) });
    expect(changed).toMatchObject({ status: 'inactive', reason: 'fit-inputs' });
  });

  it('does not default an unkeyable or absent current identity to compatible', async () => {
    const artifact = await calibration();
    const none = resolveCalibrationApplicability({ calibration: artifact, currentFitInputKey: null });
    expect(none).toMatchObject({ status: 'inactive', reason: 'fit-inputs', currentFitInputKey: null });
    // A malformed in-memory artifact with provenance but no recorded key can
    // never be active; the persisted parser rejects it first.
    const missing = { ...artifact, fitProvenance: { ...artifact.fitProvenance!, uncalibratedRunKey: undefined } } as unknown as DragCalibration;
    expect(resolveCalibrationApplicability({ calibration: missing, currentFitInputKey: KEY })).toMatchObject({ status: 'inactive', reason: 'fit-inputs' });
  });

  it('keeps a foreign flight-model binding inactive even with matching inputs', async () => {
    const artifact = await calibration();
    const foreign: DragCalibration = {
      ...artifact,
      fitProvenance: {
        ...artifact.fitProvenance!,
        flightModelBinding: { ...LEGACY_FLIGHT_MODEL, modelId: 'candidate-future' },
      },
    };
    expect(flightModelBindingStatus(foreign)).toBe('incompatible');
    const state = resolveCalibrationApplicability({ calibration: foreign, currentFitInputKey: KEY });
    expect(state).toMatchObject({ status: 'inactive', reason: 'flight-model' });
    expect(activeCalibration(state)).toBeUndefined();
  });

  it('retains legacy artifacts under the explicit legacy policy without synthesizing a fit key', () => {
    const legacy = {
      scale: 0.9, fittedCd: 0.45, modelCd: 0.5, rmseN: 0.1, coastMassKg: 0.05,
      source: { fileName: 'legacy.csv', sha256Hex: 'f'.repeat(64), rowCount: 40 },
      window: { startS: 2, endS: 7, method: 'velocity-column', pointsUsed: 30, pointsExcluded: 10 },
      appliedAt: '2026-10-27T00:00:00.000Z',
    } as DragCalibration;
    expect(resolveCalibrationApplicability({ calibration: legacy, currentFitInputKey: null }))
      .toMatchObject({ status: 'active', model: 'legacy-unverified' });
    expect(legacy.fitProvenance).toBeUndefined();
  });
});

describe('fit-engine comparison', () => {
  const sha = (c: string): string => c.repeat(64);
  it('distinguishes same, different, unknown and legacy without inventing a hash', async () => {
    const recorded = await calibration({ kind: 'production-rust-wasm', sha256: sha('a') });
    expect(calibrationEngineStatus(recorded, { kind: 'production-rust-wasm', sha256: sha('a') })).toBe('same');
    expect(calibrationEngineStatus(recorded, { kind: 'production-rust-wasm', sha256: sha('b') })).toBe('different');
    expect(calibrationEngineStatus(recorded, { kind: 'production-rust-wasm', sha256: null })).toBe('unknown');
    expect(calibrationEngineStatus(recorded, { kind: 'unavailable', sha256: null })).toBe('different');
    expect(calibrationEngineStatus(recorded, undefined)).toBe('unknown');
    const unknownHash = await calibration({ kind: 'production-rust-wasm', sha256: null });
    expect(calibrationEngineStatus(unknownHash, { kind: 'production-rust-wasm', sha256: null })).toBe('unknown');
    const legacy = await calibration();
    expect(calibrationEngineStatus(legacy, { kind: 'production-rust-wasm', sha256: sha('a') })).toBe('legacy');
  });
});
