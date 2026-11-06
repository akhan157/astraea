/**
 * The drag calibration is part of the run identity: applying, changing or
 * removing it must change the case key (so stored results go stale), while a
 * project without one keeps exactly the keys it had before calibration existed.
 */
import { describe, expect, it } from 'vitest';
import { PRESET_ESTES_ALPHA } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import {
  freshnessReasonLabel,
  isSnapshotStale,
  preflight,
  snapshotCase,
  snapshotDivergence,
  stableStringify,
  type LaunchCase,
} from './caseResolver';
import { buildDragCalibration, describeDragCalibration, parseDragCalibration, type DragCalibration } from './dragCalibration';
import { activeCalibration, flightModelBindingStatus, resolveCalibrationApplicability } from './calibrationApplicability';
import { LEGACY_FLIGHT_MODEL } from './flightModel';
import { readProject, writeProject } from '../formats/projectJson';
import oldDocument from '../formats/__fixtures__/project-main-1.0.0.json';
import { fitDragScale, refitDragScaleWithinEvents } from '../evidence/dragFit';
import type { CalibrationEvidence } from '../evidence/calibrationEligibility';
import { buildLogProvenance } from '../evidence/logProvenance';
import type { EngineIdentity } from '../engine/identity';

const MOTOR_ID = 'estes_c6';
const OPTIONS = {
  railLengthM: 3,
  railElevationDeg: 85,
  railAzimuthDeg: 0,
  windSpeedMps: 3,
  windAzimuthDeg: 0,
  finCantDeg: 0,
  mainDeployAltitudeM: 300,
};

const CALIBRATION: DragCalibration = {
  scale: 0.881,
  fittedCd: 0.4888,
  modelCd: 0.5545,
  rmseN: 0.117,
  coastMassKg: 0.0499,
  source: { fileName: 'cosmic-cargo-2986.csv', sha256Hex: 'a'.repeat(64), rowCount: 406 },
  window: { startS: 2.31, endS: 7.28, method: 'velocity-column', pointsUsed: 385, pointsExcluded: 13 },
  appliedAt: '2026-10-21T12:00:00.000Z',
};

function resolved(calibration?: DragCalibration) {
  const launch: LaunchCase = {
    vehicle: PRESET_ESTES_ALPHA,
    motorId: MOTOR_ID,
    options: OPTIONS,
    ...(calibration === undefined ? {} : { dragCalibration: calibration }),
  };
  const r = preflight(launch, {});
  expect(r.runnable).toBe(true);
  return r;
}

describe('drag calibration in the run identity', () => {
  it('changes the run key and the full key when a calibration is applied, changed or removed', () => {
    const none = snapshotCase(resolved());
    const applied = snapshotCase(resolved(CALIBRATION));
    expect(applied.runKey).not.toBe(none.runKey);
    expect(applied.mcKey).not.toBe(none.mcKey);
    // Removing it again restores the uncalibrated key exactly.
    expect(snapshotCase(resolved(undefined)).runKey).toBe(none.runKey);

    const rescaled = snapshotCase(resolved({ ...CALIBRATION, scale: 0.9 }));
    const otherLog = snapshotCase(resolved({ ...CALIBRATION, source: { ...CALIBRATION.source, sha256Hex: 'b'.repeat(64) } }));
    const otherWindow = snapshotCase(resolved({ ...CALIBRATION, window: { ...CALIBRATION.window, endS: 7.0 } }));
    for (const other of [rescaled, otherLog, otherWindow]) {
      expect(other.runKey).not.toBe(applied.runKey);
    }
  });

  it('marks a stored snapshot stale in both directions and says why', () => {
    const uncalibrated = snapshotCase(resolved());
    const calibrated = snapshotCase(resolved(CALIBRATION));
    expect(isSnapshotStale(uncalibrated, resolved(CALIBRATION))).toBe(true);
    expect(isSnapshotStale(calibrated, resolved())).toBe(true);
    expect(isSnapshotStale(calibrated, resolved(CALIBRATION))).toBe(false);
    expect(snapshotDivergence(calibrated, uncalibrated)).toBe('calibration');
    expect(snapshotDivergence(uncalibrated, calibrated)).toBe('calibration');
    expect(freshnessReasonLabel('calibration')).toMatch(/calibration/);
  });

  it('keeps the pre-calibration key for a project without one', () => {
    const none = snapshotCase(resolved());
    expect(none.calibrationKey).toBeNull();
    expect(none.canonical).not.toContain('dragCalibration');
    const { id: _id, ...motor } = CERTIFIED_MOTORS[MOTOR_ID];
    const legacy = stableStringify({ vehicle: PRESET_ESTES_ALPHA, motor, options: OPTIONS });
    expect(none.canonical).toBe(legacy);
  });
});

describe('parseDragCalibration', () => {
  it('round-trips a stored record', () => {
    expect(parseDragCalibration(JSON.parse(JSON.stringify(CALIBRATION)))).toEqual(CALIBRATION);
  });

  it('accepts a pasted log (no file name) and an unavailable checksum', () => {
    const pasted = { ...CALIBRATION, source: { fileName: null, sha256Hex: 'unavailable', rowCount: 10 } };
    expect(parseDragCalibration(pasted).source.fileName).toBeNull();
  });

  it('refuses a scale the engine would reject or that is implausible, and every malformed field', () => {
    for (const bad of [0, -1, 0.1, 5, Number.NaN, '0.9']) {
      expect(() => parseDragCalibration({ ...CALIBRATION, scale: bad })).toThrow(/scale/);
    }
    expect(() => parseDragCalibration({ ...CALIBRATION, source: { ...CALIBRATION.source, sha256Hex: 'xyz' } })).toThrow(/sha256Hex/);
    expect(() => parseDragCalibration({ ...CALIBRATION, window: { ...CALIBRATION.window, method: 'guess' } })).toThrow(/method/);
    expect(() => parseDragCalibration({ ...CALIBRATION, window: { ...CALIBRATION.window, endS: 1 } })).toThrow(/window/);
    expect(() => parseDragCalibration({ ...CALIBRATION, appliedAt: 'yesterday' })).toThrow(/appliedAt/);
    expect(() => parseDragCalibration({ ...CALIBRATION, fittedCd: 0 })).toThrow(/fittedCd/);
    expect(() => parseDragCalibration(null)).toThrow(/object/);
    const { source: _s, ...noSource } = CALIBRATION;
    expect(() => parseDragCalibration(noSource)).toThrow(/source/);
  });
});

describe('durable reviewed calibration provenance', () => {
  const samples = Array.from({ length: 351 }, (_, i) => {
    const timeS = i / 50;
    return { timeS, altitudeM: 100 + 80 * timeS - 6 * timeS ** 2, velocityMs: 80 - 12 * timeS };
  });
  const fit = fitDragScale({ log: samples, coastMassKg: 1, refAreaM2: 0.01, launchElevationM: 100,
    modelTelemetry: samples.filter((_, i) => i % 2 === 0).map((p) => ({ time: p.timeS, altitude: p.altitudeM, velocity: { z: p.velocityMs } })),
  });
  const side = {
    burnout: { earliestS: -1.1, latestS: -1, source: 'Controlled final burnout in each trajectory clock' },
    recovery: { kind: 'first-event' as const, event: { earliestS: 7, latestS: 7.1, source: 'Controlled first recovery' } },
    verticalMotion: { status: 'supported' as const, source: 'Declared controlled vertical trajectory, calm air' },
    constantMass: { status: 'supported' as const, source: 'Declared controlled constant mass' },
  };
  const evidence: CalibrationEvidence = { log: side, model: side };
  const build = async (engineIdentity?: EngineIdentity) => buildDragCalibration(fit, await buildLogProvenance({ rawText: 'controlled fixture', fileName: 'controlled.csv', rowCount: samples.length }), CALIBRATION.appliedAt, LEGACY_FLIGHT_MODEL, evidence, 'controlled-model-input-key', 'fnv1a32:01234567', engineIdentity);

  it('preserves recorded engine identity through persistence without inventing a legacy hash', async () => {
    const identity: EngineIdentity = { kind: 'production-rust-wasm', sha256: 'a'.repeat(64) };
    const built = await build(identity);
    expect(parseDragCalibration(JSON.parse(JSON.stringify(built))).fitProvenance?.engineIdentity).toEqual(identity);
    expect(describeDragCalibration(built)).toContain(identity.sha256);
    expect((await build()).fitProvenance?.engineIdentity).toBeUndefined();
    const unknown = await build({ kind: 'production-rust-wasm', sha256: null });
    expect(parseDragCalibration(unknown).fitProvenance?.engineIdentity?.sha256).toBeNull();
    const malformed = JSON.parse(JSON.stringify(built));
    malformed.fitProvenance.engineIdentity.sha256 = 'version-0.9';
    expect(() => parseDragCalibration(malformed)).toThrow(/engineIdentity/);
  });

  it('refuses new application for missing review, unsupported support, or missing model identity', async () => {
    const log = await buildLogProvenance({ rawText: '', fileName: null, rowCount: samples.length });
    expect(() => buildDragCalibration(fit, log, CALIBRATION.appliedAt, LEGACY_FLIGHT_MODEL)).toThrow(/analysis-only.*unverified/);
    expect(() => buildDragCalibration(fit, log, CALIBRATION.appliedAt, LEGACY_FLIGHT_MODEL, { ...evidence, log: { ...side, recovery: { kind: 'first-event', event: { earliestS: fit.logWindow.supportEndS, latestS: 7, source: 'May touch filter support' } } } }, 'input-key')).toThrow(/analysis-only.*unsupported/);
    expect(() => buildDragCalibration(fit, log, CALIBRATION.appliedAt, LEGACY_FLIGHT_MODEL, evidence)).toThrow(/uncalibratedRunKey/);
    expect(() => buildDragCalibration(fit, log, CALIBRATION.appliedAt, LEGACY_FLIGHT_MODEL, evidence, 'model-key')).toThrow(/normalizedLogKey/);
  });

  it('round-trips both windows, raw support, regime, source bounds, units and exact model identity', async () => {
    const built = await build();
    expect(built.fitProvenance).toMatchObject({
      version: 1, eligibility: 'conditional', uncalibratedRunKey: 'controlled-model-input-key', normalizedLogKey: 'fnv1a32:01234567', atmosphere: 'ISA-1976',
      refAreaM2: 0.01, launchElevationM: 100, modelRmseN: fit.modelRmseN,
      logWindow: { supportStartS: fit.logWindow.supportStartS, supportEndS: fit.logWindow.supportEndS, halfWidthS: fit.logWindow.halfWidthS },
      modelWindow: { halfWidthS: fit.modelWindow.halfWidthS }, evidence,
    });
    expect(parseDragCalibration(JSON.parse(JSON.stringify(built)))).toEqual(built);
    expect(describeDragCalibration(built)).toContain('not independently verified');
  });

  it('retains legacy adjustments byte-for-byte in JSON without assigning conditional status', () => {
    expect(JSON.stringify(parseDragCalibration(CALIBRATION))).toBe(JSON.stringify(CALIBRATION));
    expect(parseDragCalibration(CALIBRATION).fitProvenance).toBeUndefined();
    expect(describeDragCalibration(CALIBRATION)).toContain('legacy adjustment; eligibility unverified');
  });

  it('rejects claimed conditional eligibility when evidence, support or applied fields disagree', async () => {
    const built = await build();
    const mutate = (change: (copy: DragCalibration) => void) => {
      const copy = JSON.parse(JSON.stringify(built)) as DragCalibration;
      change(copy);
      expect(() => parseDragCalibration(copy)).toThrow(/evidence|provenance|fitProvenance/);
    };
    mutate((c) => { delete c.fitProvenance!.evidence.log.burnout; });
    mutate((c) => { c.fitProvenance!.evidence.log.constantMass!.status = 'unsupported'; });
    mutate((c) => { c.fitProvenance!.logWindow.supportStartS = c.fitProvenance!.logWindow.windowStartS + 1; });
    mutate((c) => { c.fitProvenance!.logWindow.excluded.lowSpeed++; });
    mutate((c) => { c.window.pointsUsed++; });
    mutate((c) => { c.scale = 1.5; });
    mutate((c) => { c.fitProvenance!.version = 2 as 1; });
    mutate((c) => { c.fitProvenance!.uncalibratedRunKey = ''; });
    mutate((c) => { c.fitProvenance!.normalizedLogKey = ''; });
    mutate((c) => { c.source.rowCount = c.fitProvenance!.logWindow.used - 1; });
  });

  it('changes run identity when the review or fitted-input provenance changes', async () => {
    const built = await build();
    const changed = JSON.parse(JSON.stringify(built)) as DragCalibration;
    changed.fitProvenance!.evidence.log.constantMass!.source = 'New source review';
    expect(snapshotCase(resolved(changed)).runKey).not.toBe(snapshotCase(resolved(built)).runKey);
  });

  it('round-trips explicit selection policy, original support, unique exclusions and exact event snapshot', async () => {
    const events: CalibrationEvidence = {
      log: { ...side, burnout: { earliestS: 0.9, latestS: 1, source: 'Controlled final tail-off complete' }, recovery: { kind: 'first-event', event: { earliestS: 5.9, latestS: 6, source: 'Controlled first deployment' } } },
      model: { ...side, burnout: { earliestS: 0.9, latestS: 1, source: 'Controlled model final tail-off complete' }, recovery: { kind: 'first-event', event: { earliestS: 5.9, latestS: 6, source: 'Controlled model deployment' } } },
    };
    const refit = refitDragScaleWithinEvents(fit, events);
    const log = await buildLogProvenance({ rawText: 'controlled fixture', fileName: 'controlled.csv', rowCount: samples.length });
    const built = buildDragCalibration(refit, log, CALIBRATION.appliedAt, LEGACY_FLIGHT_MODEL, events, 'controlled-inputs', 'fnv1a32:01234567');
    expect(built.fitProvenance!.selection?.policy).toBe('reviewed-events-v1');
    expect(built.window.pointsExcluded).toBe(refit.logWindow.excluded.lowSpeed + refit.logWindow.excluded.event!);
    expect(built.fitProvenance!.selection?.originalLogWindow.used).toBe(fit.logWindow.used);
    expect(parseDragCalibration(JSON.parse(JSON.stringify(built)))).toEqual(built);
    expect(JSON.stringify(built)).not.toContain('pointSupport');
    expect(JSON.stringify(built)).not.toContain('velocityMs');
    const mutate = (change: (copy: DragCalibration) => void) => {
      const copy = JSON.parse(JSON.stringify(built)) as DragCalibration;
      change(copy);
      expect(() => parseDragCalibration(copy)).toThrow(/selection|provenance|fitProvenance/);
    };
    mutate((c) => { c.fitProvenance!.selection!.logExclusions.burnoutOnly++; });
    mutate((c) => { c.fitProvenance!.selection!.logExclusions.retainedLeverageFraction = 1.1; });
    mutate((c) => { c.fitProvenance!.selection!.originalLogWindow.halfWidthS *= 2; });
    mutate((c) => { c.fitProvenance!.selection!.policy = 'unknown-policy' as 'reviewed-events-v1'; });
    mutate((c) => { c.fitProvenance!.selection!.events.log.burnout!.source = 'Changed event source without refit'; });
    mutate((c) => { c.fitProvenance!.evidence.log.burnout!.source = 'Changed applied evidence without refit'; });
    mutate((c) => { delete c.fitProvenance!.selection; });
    expect(() => buildDragCalibration(refit, log, CALIBRATION.appliedAt, LEGACY_FLIGHT_MODEL, { ...events, log: { ...events.log, burnout: { ...events.log.burnout!, source: 'New review after refit' } } }, 'inputs', 'fnv1a32:01234567')).toThrow(/snapshot/);
    // CAL-E1 reviewed records keep their original heuristic policy meaning.
    const e1 = await build();
    expect(parseDragCalibration(e1).fitProvenance!.selection).toBeUndefined();
    expect(parseDragCalibration(e1)).toEqual(e1);
  });

  it('records the fit-time model binding and keeps foreign bindings loadable but inactive', async () => {
    const built = await build();
    expect(built.fitProvenance!.flightModelBinding).toEqual({ ...LEGACY_FLIGHT_MODEL });
    expect(flightModelBindingStatus(built)).toBe('bound');
    expect(flightModelBindingStatus(CALIBRATION)).toBe('unverified-legacy');
    expect(parseDragCalibration(JSON.parse(JSON.stringify(built))).fitProvenance!.flightModelBinding).toEqual({ ...LEGACY_FLIGHT_MODEL });
    const foreign = JSON.parse(JSON.stringify(built));
    foreign.fitProvenance.flightModelBinding = { ...LEGACY_FLIGHT_MODEL, modelId: 'candidate-future' };
    const parsed = parseDragCalibration(foreign);
    expect(flightModelBindingStatus(parsed)).toBe('incompatible');
    expect(activeCalibration(resolveCalibrationApplicability({ calibration: parsed, currentFitInputKey: 'controlled-model-input-key' }))).toBeUndefined();
    // End-to-end retention: a well-formed foreign binding survives Save/Open
    // as project history and is never active.
    const base = readProject(JSON.stringify(oldDocument));
    const saved = readProject(writeProject({ ...base, dragCalibration: parsed }));
    expect(saved.dragCalibration).toEqual(parsed);
    expect(activeCalibration(resolveCalibrationApplicability({ calibration: saved.dragCalibration, currentFitInputKey: 'controlled-model-input-key' }))).toBeUndefined();
    const legacySaved = readProject(writeProject({ ...base, dragCalibration: CALIBRATION }));
    expect(activeCalibration(resolveCalibrationApplicability({ calibration: legacySaved.dragCalibration, currentFitInputKey: null }))).toEqual(CALIBRATION);
    expect(activeCalibration(resolveCalibrationApplicability({ calibration: built, currentFitInputKey: 'controlled-model-input-key' }))).toBe(built);
  });

  it('rejects malformed binding declarations instead of guessing a model', async () => {
    const built = await build();
    for (const binding of [null, 'legacy', {}, { ...LEGACY_FLIGHT_MODEL, extra: 1 }, { ...LEGACY_FLIGHT_MODEL, modelId: '' }]) {
      const copy = JSON.parse(JSON.stringify(built));
      copy.fitProvenance.flightModelBinding = binding;
      expect(() => parseDragCalibration(copy)).toThrow(/flightModelBinding/);
    }
  });
});
