/**
 * Drag scale fit through the shipped WebAssembly engine, on the real Cosmic
 * Cargo flight (Altimeter Cloud #2986) and the estimated-geometry model of it
 * from `cosmicCargoFixture`.
 *
 * What this pins: the scale is fitted/model with one estimator on both sides;
 * it reaches the engine as `dragCdScale` and moves the apogee the right way;
 * and re-measuring the calibrated model's own coast recovers the fitted Cd, so
 * the scale does what its label says. It does NOT validate the model: the
 * declared test coast mass (49.9 g) differs from the older record (47 g).
 * Common assumed mass cancels only for fixed trajectories; physical mass and Cd
 * remain confounded, and estimator sampling/support can bias the ratio.
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import coastCsv from '../../docs/flight-validation/cosmic-cargo-2986-coast.csv?raw';
import { instantiateEngine } from '../engine/core';
import { setTestEngine, type EngineInvoke } from '../engine';
import { simulateFlight } from '../tauri/bridge';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { SixDofSimulationResult } from '../sim/sixDofSimulator';
import { parseTrajectoryCsv } from './altimetry';
import { calibrateCd } from './calibration';
import { coastWindowSummary, deriveCoastPoints } from './coastWindow';
import { DRAG_SCALE_MAX, DRAG_SCALE_MIN, fitDragScale, refitDragScaleWithinEvents } from './dragFit';
import { assessCalibrationEligibility, modelCalibrationEventEvidence } from './calibrationEligibility';
import {
  COSMIC_CARGO_CONDITIONS,
  COSMIC_CARGO_DIAMETER_M,
  cosmicCargoLike,
} from './cosmicCargoFixture';

const REF_AREA_M2 = Math.PI * COSMIC_CARGO_DIAMETER_M ** 2 * 0.25;
const COAST_MASS_KG = 0.0499; // declared estimator assumption; not the current UI-computed coast mass
const PAD_ELEVATION_M = 10;
const vehicle = { ...cosmicCargoLike(), launchSite: { altitudeM: PAD_ELEVATION_M } };
const motor = CERTIFIED_MOTORS.estes_c6;
const log = parseTrajectoryCsv(coastCsv).samples;
let wasmSha256 = '';

async function fly(dragCdScale?: number): Promise<SixDofSimulationResult> {
  return simulateFlight(vehicle, motor, {
    ...COSMIC_CARGO_CONDITIONS,
    ...(dragCdScale === undefined ? {} : { dragCdScale }),
  });
}

function modelCoastCd(result: SixDofSimulationResult): number {
  const d = deriveCoastPoints(
    result.telemetry.map((p) => ({ timeS: p.time, altitudeM: p.altitude, velocityMs: p.velocity.z })),
    { massKg: COAST_MASS_KG, refAreaM2: REF_AREA_M2, launchElevationM: PAD_ELEVATION_M },
  );
  return calibrateCd(d.points, { allowNegativeAccel: true }).cdCalibrated;
}

describe('fitDragScale through the WASM engine', () => {
  beforeAll(async () => {
    const bytes = readFileSync(fileURLToPath(new URL('../engine/astraea_engine.wasm', import.meta.url)));
    wasmSha256 = createHash('sha256').update(bytes).digest('hex');
    const engine = await instantiateEngine(bytes);
    setTestEngine((async (command, args) => engine.call(command, args)) as EngineInvoke);
  });
  afterAll(() => setTestEngine(null));

  it('fits the log and the model with one estimator and reports their ratio', async () => {
    const baseline = await fly();
    const fit = fitDragScale({
      log,
      coastMassKg: COAST_MASS_KG,
      refAreaM2: REF_AREA_M2,
      launchElevationM: PAD_ELEVATION_M,
      modelTelemetry: baseline.telemetry,
    });
    // Model's own coast Cd: documented 0.5533 in flightValidation.test.ts (47 g assumed on the log side
    // only there); here the declared 49.9 g assumption is used on both sides, giving about 0.5545.
    expect(fit.modelCd).toBeGreaterThan(0.54);
    expect(fit.modelCd).toBeLessThan(0.57);
    // Log Cd with the same mass: 0.4603 (47 g) scaled by 49.9/47 = 0.489.
    expect(fit.fittedCd).toBeGreaterThan(0.47);
    expect(fit.fittedCd).toBeLessThan(0.51);
    expect(fit.scale).toBeCloseTo(fit.fittedCd / fit.modelCd, 12);
    // Below 1: the logged coast decelerates LESS than the model's, so the scale lowers drag.
    expect(fit.scale).toBeGreaterThan(0.84);
    expect(fit.scale).toBeLessThan(0.92);
    expect(fit.logWindow.method).toBe('velocity-column');
    expect(fit.modelWindow.used).toBeGreaterThanOrEqual(10);
    expect(fit.warning).toBeNull();
  });

  it('cancels common assumed mass for fixed input trajectories', async () => {
    const baseline = await fly();
    const at = (coastMassKg: number) =>
      fitDragScale({ log, coastMassKg, refAreaM2: REF_AREA_M2, launchElevationM: PAD_ELEVATION_M, modelTelemetry: baseline.telemetry }).scale;
    expect(at(0.035) / at(0.0499)).toBeCloseTo(1, 9);
  });

  it('retains the Cosmic preview while known source recovery makes new application unsupported', async () => {
    const baseline = await fly();
    const fit = fitDragScale({ log, coastMassKg: COAST_MASS_KG, refAreaM2: REF_AREA_M2, launchElevationM: PAD_ELEVATION_M, modelTelemetry: baseline.telemetry });
    const condition = { status: 'supported' as const, source: 'Declared development-case assumption only; not independently verified' };
    const result = assessCalibrationEligibility({ log: fit.logWindow, model: fit.modelWindow }, {
      log: {
        burnout: { earliestS: 1.887, latestS: 1.887, source: 'Tracked fixture preamble burnout; log clock' },
        recovery: { kind: 'first-event', event: { earliestS: 7.205, latestS: 7.205, source: 'Tracked fixture preamble ejection; log clock' } },
        verticalMotion: condition, constantMass: condition,
      },
      model: { ...modelCalibrationEventEvidence(baseline.events), verticalMotion: condition, constantMass: condition },
    });
    expect(result.status).toBe('unsupported');
    expect(result.reasons).toContain('log: filter support may include recovery deployment');
    console.info('CAL-E1 development support diagnostic', JSON.stringify({
      log: { selectedStartS: fit.logWindow.windowStartS, selectedEndS: fit.logWindow.windowEndS, supportStartS: fit.logWindow.supportStartS, supportEndS: fit.logWindow.supportEndS },
      model: { selectedStartS: fit.modelWindow.windowStartS, selectedEndS: fit.modelWindow.windowEndS, supportStartS: fit.modelWindow.supportStartS, supportEndS: fit.modelWindow.supportEndS, events: modelCalibrationEventEvidence(baseline.events) },
      result,
    }));
  });

  it('reports frozen Cosmic selector deltas and hypothetical applications without qualifying flown conditions', async () => {
    const baseline = await fly();
    const original = fitDragScale({ log, coastMassKg: COAST_MASS_KG, refAreaM2: REF_AREA_M2, launchElevationM: PAD_ELEVATION_M, modelTelemetry: baseline.telemetry });
    const events = {
      log: {
        burnout: { earliestS: 1.887, latestS: 1.887, source: 'Tracked public Cosmic Cargo coast CSV preamble: final burnout, source log clock' },
        recovery: { kind: 'first-event' as const, event: { earliestS: 7.205, latestS: 7.205, source: 'Tracked public Cosmic Cargo coast CSV preamble: first ejection, source log clock' } },
      },
      model: modelCalibrationEventEvidence(baseline.events),
    };
    const refit = refitDragScaleWithinEvents(original, events);
    const [oldApplied, newApplied] = await Promise.all([fly(original.scale), fly(refit.scale)]);
    const prediction = (f: SixDofSimulationResult) => ({
      apogeeM: f.apogeeAltitude, apogeeTimeS: f.apogeeTime,
      burnoutAltitudeM: f.burnoutAltitude, burnoutVelocityMs: f.burnoutVelocity, burnoutTimeS: f.burnoutTime,
      railExitVelocityMs: f.railExitVelocity, terminated: f.terminated, terminationReason: f.terminationReason,
      validity: f.validity, enveloped: f.enveloped, offNominalExcursion: f.offNominalExcursion,
    });
    const fitSummary = (f: typeof original) => ({
      fittedCd: f.fittedCd, modelCd: f.modelCd, scale: f.scale, logRmseN: f.rmseN, modelRmseN: f.modelRmseN,
      log: coastWindowSummary(f.logWindow), model: coastWindowSummary(f.modelWindow),
      eligibility: assessCalibrationEligibility({ log: f.logWindow, model: f.modelWindow }, events),
    });
    const delta = (after: number, before: number) => ({ absolute: after - before, percent: 100 * (after / before - 1) });
    expect(refit.logWindow.supportEndS).toBeLessThan(7.205);
    expect(refit.modelWindow.supportStartS).toBeGreaterThanOrEqual(baseline.burnoutTime);
    expect(refit.selection!.logExclusions.recoveryOnly).toBeGreaterThan(0);
    expect(refit.selection!.modelExclusions.burnoutOnly).toBeGreaterThan(0);
    expect(assessCalibrationEligibility({ log: refit.logWindow, model: refit.modelWindow }, events).status).toBe('unverified');
    expect([baseline.apogeeAltitude, oldApplied.apogeeAltitude, newApplied.apogeeAltitude].every(Number.isFinite)).toBe(true);
    console.info('CAL-E2_FROZEN_COMPARISON', JSON.stringify({
      purpose: 'Exposed development diagnostic; event-qualified selection with unverified flown motion/mass. Hypothetical scale application, not approved calibration or independent validation.',
      engineSha256: wasmSha256, logSha256: createHash('sha256').update(new TextEncoder().encode(coastCsv)).digest('hex'),
      estimator: 'vertical-coast-ols-v1', selectionPolicy: 'reviewed-events-v1',
      assumptions: { coastMassKg: COAST_MASS_KG, refAreaM2: REF_AREA_M2, launchElevationM: PAD_ELEVATION_M, atmosphere: 'ISA-1976', modelConditions: COSMIC_CARGO_CONDITIONS },
      events, original: fitSummary(original), refit: fitSummary(refit), selection: refit.selection,
      scaleDelta: delta(refit.scale, original.scale),
      predictions: { baseline: prediction(baseline), originalScaleHypothetical: prediction(oldApplied), refitScaleHypothetical: prediction(newApplied),
        oldToNewApogee: delta(newApplied.apogeeAltitude, oldApplied.apogeeAltitude), oldToNewBurnoutVelocity: delta(newApplied.burnoutVelocity, oldApplied.burnoutVelocity) },
      audit: {
        log: { originalPointSupport: original.logWindow.pointSupport, retainedPointSupport: refit.logWindow.pointSupport },
        model: { originalPointSupport: original.modelWindow.pointSupport, retainedPointSupport: refit.modelWindow.pointSupport },
      },
    }));
  });

  it('reaches the engine: scale < 1 raises apogee, scale > 1 lowers it, and the coast re-measures to the fitted Cd', async () => {
    const baseline = await fly();
    const fit = fitDragScale({
      log,
      coastMassKg: COAST_MASS_KG,
      refAreaM2: REF_AREA_M2,
      launchElevationM: PAD_ELEVATION_M,
      modelTelemetry: baseline.telemetry,
    });
    const calibrated = await fly(fit.scale);
    expect(fit.scale).toBeLessThan(1);
    expect(calibrated.apogeeAltitude).toBeGreaterThan(baseline.apogeeAltitude);
    const heavier = await fly(1.2);
    expect(heavier.apogeeAltitude).toBeLessThan(baseline.apogeeAltitude);
    // Omitting the scale and passing 1 are the same flight.
    expect((await fly(1)).apogeeAltitude).toBe(baseline.apogeeAltitude);
    // Closing the loop: the calibrated model's own coast now measures the logged Cd (to the estimator's ~2 %).
    const remeasured = modelCoastCd(calibrated);
    expect(Math.abs(remeasured / fit.fittedCd - 1)).toBeLessThan(0.03);
  });

  it('refuses a model with no measurable drag and a scale outside the plausible range', async () => {
    const inputs = { log, coastMassKg: COAST_MASS_KG, refAreaM2: REF_AREA_M2, launchElevationM: PAD_ELEVATION_M };
    expect(() => fitDragScale({ ...inputs, modelTelemetry: [] })).toThrow(/no telemetry/);
    // A drag-free ballistic arc has no drag to scale.
    const ballistic = Array.from({ length: 400 }, (_, i) => {
      const t = i * 0.02;
      return { time: t, altitude: 100 + 80 * t - 0.5 * 9.80665 * t * t, velocity: { z: 80 - 9.80665 * t } };
    }).filter((p) => p.velocity.z > -1);
    expect(() => fitDragScale({ ...inputs, modelTelemetry: ballistic })).toThrow(/not positive/);
    // A model flown at a fifth of its drag measures a fifth of the Cd, so the logged coast reads ~4.4x its drag.
    const slippery = await fly(0.2);
    expect(() => fitDragScale({ ...inputs, modelTelemetry: slippery.telemetry })).toThrow(
      new RegExp(`outside ${DRAG_SCALE_MIN}-${DRAG_SCALE_MAX}`),
    );
  });
});
