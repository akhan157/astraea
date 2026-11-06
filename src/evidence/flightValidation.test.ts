/**
 * Real-flight pipeline comparison (2026-09-28).
 *
 * Drives the actual evidence and simulation modules over a genuine public
 * flight (Altimeter Cloud #2986; see docs/flight-validation/README.md) and
 * records what the pipeline produces versus what was flown.
 *
 * What this establishes:
 *  - the tolerant CSV parser ingests the real log (metadata preamble, ms time);
 *  - `calibrateCd` recovers a physically plausible effective Cd from the real
 *    coast phase;
 *  - the 6-DOF solver completes on the real motor and reports an apogee.
 *
 * What it does NOT establish: an exact reconstruction. Fin geometry is not
 * public and the flown all-up mass is disputed between sources, so the
 * simulated apogee here is a class-level estimate, and the assertion below
 * pins only that behaviour (over-prediction), not accuracy.
 *
 * The coast fixture is every 5th sample of the real coast window
 * (t = 2.2 s .. 7.45 s) to keep the repository small.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { instantiateEngine } from '../engine/core';
import { setTestEngine, type EngineInvoke } from '../engine';
import { simulateFlight } from '../tauri/bridge';
import coastCsv from '../../docs/flight-validation/cosmic-cargo-2986-coast.csv?raw';
import { alignSimToFlight } from './altimetry';
import { calibrateCd, type CoastPoint } from './calibration';
import { getAtmosphereAt } from '../sim/flightSimulator';
import { compareAltitudeSeries, simTelemetryToAltitude } from './overlay';
import { simulate6DofFlight } from '../sim/sixDofSimulator';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { RocketVehicle, RocketComponent } from '../core/types';

const COAST_CSV = coastCsv;
const RECORDED_APOGEE_M = 291.74;
const RECORDED_BURNOUT_VELOCITY_MS = 83.434;
const G = 9.80665;
const REF_AREA_M2 = Math.PI * 0.0254 * 0.0254 * 0.25;
const COAST_MASS_KG = 0.047;
/**
 * Historical rounded constants: coast-fit Cd over the model's own coast Cd.
 * The current test reads the tracked coast extract, not a full-record native fit;
 * it assumes 47 g, raw three-point differences and density without pad elevation.
 * This historical scale is retained unchanged. The coefficients were
 * both from `calibrateCd` (least squares, v >= 5 m/s). The flight fit keeps
 * the SIGNED drag deceleration (2026-10-21: 0.4526 over 393 points). Earlier
 * versions dropped every non-positive raw deceleration, which on this noisy,
 * differentiated velocity keeps only the positive noise and gave 0.6118, a
 * +35 % bias; that number must not be reused. Model coast Cd 0.5533 (91 sim
 * points; noise-free, so signed and truncated agree).
 */
const CALIBRATED_CD_SCALE = 0.4526 / 0.5533;

interface Row {
  tS: number;
  altitudeM: number;
  velocityMs: number;
}

function coastRows(): Row[] {
  const out: Row[] = [];
  for (const line of COAST_CSV.split(/\r?\n/)) {
    const cells = line.split(',');
    if (cells.length < 3) continue;
    const t = Number(cells[0]);
    const alt = Number(cells[1]);
    const v = Number(cells[2]);
    if (!Number.isFinite(t) || !Number.isFinite(alt) || !Number.isFinite(v)) continue;
    out.push({ tS: t / 1000, altitudeM: alt, velocityMs: v });
  }
  return out.sort((a, b) => a.tS - b.tS);
}

/** BT-50 envelope body on the recorded motor; fin geometry is an estimate. */
function cosmicCargoLike(): RocketVehicle {
  const components: RocketComponent[] = [
    {
      id: 'cc-nc',
      name: 'Ogive Nosecone',
      type: 'nosecone',
      materialId: 'pla_3dprint',
      color: '#14b8a6',
      shape: 'ogive',
      length: 0.07,
      baseDiameter: 0.0254,
      wallThickness: 0.0015,
      isHollow: true,
    } as RocketComponent,
    {
      id: 'cc-bt',
      name: 'Main Body Tube (BT-50)',
      type: 'bodytube',
      materialId: 'cardboard',
      color: '#ffffff',
      length: 0.28,
      outerDiameter: 0.0254,
      innerDiameter: 0.0241,
      isMotorMount: true,
      assignedMotorId: 'estes_c6',
    } as RocketComponent,
    {
      id: 'cc-fins',
      name: 'Molded Fins (3-Fin)',
      type: 'trapezoidfinset',
      materialId: 'pla_3dprint',
      color: '#14b8a6',
      finCount: 3,
      rootChord: 0.06,
      tipChord: 0.024,
      span: 0.045,
      sweepLength: 0.03,
      thickness: 0.002,
      crossSection: 'rounded',
      axialOffset: 0.24,
    } as RocketComponent,
    {
      id: 'cc-chute',
      name: '12" Parachute',
      type: 'parachute',
      materialId: 'cardboard',
      diameter: 0.305,
      cd: 0.8,
      mass: 0.008,
      axialOffset: 0.05,
    } as RocketComponent,
  ];
  return {
    id: 'cosmic-cargo-like',
    name: 'Cosmic Cargo (estimated)',
    version: '1.0',
    author: 'flight validation',
    components,
  };
}

/** Recorded pad altitude/angle; rail length and calm wind remain assumptions. */
const FLIGHT_CONDITIONS = {
  launchAltitudeASL: 10, // site ground level, recorded
  railElevationDeg: 88.84, // 90 - recorded rail angle 1.16 deg
  railLength: 0.91, // Estes Porta-Pad II 3 ft rod (1/8 in), estimated
  windSpeedSurface: 0, // launch conditions not recorded on the flight page
  mainDeployAltitudeAGL: 150,
};

describe('real flight 2986 pipeline comparison', () => {
  it('builds usable coast points from the real log', () => {
    const data = coastRows();
    expect(data.length).toBeGreaterThan(300);
    expect(data[0].tS).toBeCloseTo(2.2, 1);
    expect(data[data.length - 1].tS).toBeGreaterThan(7.4);
  });

  it('recovers a physically plausible effective Cd from the real coast', () => {
    const data = coastRows();
    const points: CoastPoint[] = [];
    for (let i = 1; i < data.length - 1; i++) {
      const dt = data[i + 1].tS - data[i - 1].tS;
      if (!(dt > 0)) continue;
      if (Math.abs(data[i].velocityMs) < 5) continue;
      const dvdt = (data[i + 1].velocityMs - data[i - 1].velocityMs) / dt;
      const atm = getAtmosphereAt(data[i].altitudeM);
      points.push({
        velocityMs: Math.abs(data[i].velocityMs),
        density: atm.density,
        massKg: COAST_MASS_KG,
        refAreaM2: REF_AREA_M2,
        accelMs2: -dvdt - G,
      });
    }
    expect(points.length).toBeGreaterThan(300);
    const fit = calibrateCd(points, { allowNegativeAccel: true });
    // 2026-10-21: Cd 0.4526 (47 g, Ø 25.4 mm). The window-based derivation in
    // coastWindow.test.ts independently lands at 0.453-0.464.
    expect(fit.cdCalibrated).toBeGreaterThan(0.43);
    expect(fit.cdCalibrated).toBeLessThan(0.48);
    // Discarding non-positive decelerations biases the same data high.
    const truncated = calibrateCd(points.filter((p) => p.accelMs2 > 0));
    expect(truncated.cdCalibrated).toBeGreaterThan(fit.cdCalibrated * 1.25);
  });

  it('reports the same incomplete flight comparison through the shipped WebAssembly engine', async () => {
    const bytes = readFileSync(fileURLToPath(new URL('../engine/astraea_engine.wasm', import.meta.url)));
    const engine = await instantiateEngine(bytes);
    setTestEngine((async (command, args) => engine.call(command, args)) as EngineInvoke);
    try {
      const vehicle = { ...cosmicCargoLike(), launchSite: { altitudeM: FLIGHT_CONDITIONS.launchAltitudeASL } };
      const motor = CERTIFIED_MOTORS.estes_c6;
      const result = await simulateFlight(vehicle, motor, FLIGHT_CONDITIONS);
      const oracle = simulate6DofFlight(vehicle, motor, FLIGHT_CONDITIONS);
      expect(result.terminationReason).toBe('touchdown');
      expect(Math.abs(result.apogeeAltitude - oracle.apogeeAltitude)).toBeLessThan(1e-9 * Math.max(oracle.apogeeAltitude, 1));
      expect(result.apogeeAltitude).toBeGreaterThan(RECORDED_APOGEE_M);
      console.log(`Cosmic Cargo candidate, production WASM: apogee ${result.apogeeAltitude.toFixed(2)} m vs ${RECORDED_APOGEE_M} m (${((result.apogeeAltitude / RECORDED_APOGEE_M - 1) * 100).toFixed(1)}%); burnout velocity ${result.burnoutVelocity.toFixed(2)} m/s vs ${RECORDED_BURNOUT_VELOCITY_MS} m/s. Estimated geometry/mass and missing weather: NOT independent validation.`);
    } finally {
      setTestEngine(null);
    }
  });

  it('runs the 6-DOF solver on the recorded motor and over-predicts apogee (documented bias)', () => {
    const result = simulate6DofFlight(cosmicCargoLike(), CERTIFIED_MOTORS.estes_c6, FLIGHT_CONDITIONS);

    // The workflow completes with a sane, safety-gated result.
    expect(result.apogeeAltitude).toBeGreaterThan(0);
    expect(result.terminationReason).toBe('touchdown');
    expect(Number.isFinite(result.railExitVelocity)).toBe(true);

    // Documented finding (2026-09-28): with estimated geometry the solver
    // over-predicts both burnout velocity and apogee versus the flown values.
    // Actual fin geometry, flown mass, motor performance, sensor reconstruction,
    // attitude and weather remain unresolved; this does not identify a sole cause.
    expect(result.burnoutVelocity).toBeGreaterThan(RECORDED_BURNOUT_VELOCITY_MS);
    expect(result.apogeeAltitude).toBeGreaterThan(RECORDED_APOGEE_M);
  });

  it('brackets recorded apogee in a conditional payload-mass sensitivity', () => {
    // The kit carries a payload section and the flown all-up mass is disputed;
    // the modelled airframe alone is only ~39 g dry. Adding mass monotonically
    // lowers apogee, and ~20-25 g of payload brackets the recorded 291.74 m
    // (2026-10-21, with fin edge drag: 20 g 307.1 m, 25 g 289.7 m; the
    // 2026-10-16 engine without it bracketed at 25/30 g).
    const withBallast = (g: number) => {
      const v = cosmicCargoLike();
      v.components = [
        ...v.components,
        {
          id: 'cc-ballast',
          name: 'Payload ballast',
          type: 'masscomponent',
          materialId: 'plywood',
          mass: g / 1000,
          length: 0.03,
          axialOffset: 0.1,
        } as RocketComponent,
      ];
      return simulate6DofFlight(v, CERTIFIED_MOTORS.estes_c6, FLIGHT_CONDITIONS).apogeeAltitude;
    };

    const light = withBallast(10);
    const heavy = withBallast(40);
    expect(heavy).toBeLessThan(light); // more mass, lower apogee
    // Brackets the recorded apogee: 20 g over, 25 g under.
    expect(withBallast(20)).toBeGreaterThan(RECORDED_APOGEE_M);
    expect(withBallast(25)).toBeLessThan(RECORDED_APOGEE_M);
  });

  it('the historical coast scale raises apogee and leaves the flight mismatch unresolved', () => {
    // The real coast decelerated LESS than the model (Cd 0.4526 vs 0.5533), so
    // the calibrated scale (0.818) raises apogee further above the recorded
    // 291.74 m (2026-10-21: 371.7 m -> 411.6 m). The over-prediction is
    // not explained by this coast objective. This does not rule out drag-model
    // errors or establish mass as the cause; geometry, motor, sensors and weather
    // remain competing explanations.
    const vehicle = cosmicCargoLike();
    const motor = CERTIFIED_MOTORS.estes_c6;
    const baseline = simulate6DofFlight(vehicle, motor, FLIGHT_CONDITIONS).apogeeAltitude;
    const calibrated = simulate6DofFlight(vehicle, motor, {
      ...FLIGHT_CONDITIONS,
      dragCdScale: CALIBRATED_CD_SCALE,
    }).apogeeAltitude;
    expect(calibrated).toBeGreaterThan(baseline);
    expect(calibrated).toBeGreaterThan(RECORDED_APOGEE_M);
  });

  it('aligns the real coast against sim telemetry through the compare pipeline', () => {
    // End-to-end workflow closure: the real coast-window flight series and the
    // certified-motor sim telemetry meet in alignSimToFlight + compareAltitudeSeries
    // (the same modules the Evidence studio renders). Re-measured 2026-10-21 with
    // fin edge drag: sim apogee 371.7 m, so alignment reports apogeeDeltaM = +80.0 m
    // (sim minus flight) and burnoutVelDeltaMs = +38.4 m/s (2026-10-16: +97.5 m,
    // +40.6 m/s). With the generous abs 50 m / rel 20% / time 1 s band, the
    // apogee-aligned compare now yields 51 matches, 1 mismatch, 1 out-of-tolerance
    // region: the remaining apogee bias still surfaces in the studio compare path,
    // not only in scalar asserts.
    const flight = coastRows().map((r) => ({
      timeS: r.tS,
      altitudeM: r.altitudeM,
      velocityMs: r.velocityMs,
    }));
    const sim = simulate6DofFlight(cosmicCargoLike(), CERTIFIED_MOTORS.estes_c6, FLIGHT_CONDITIONS);
    const simSeries = simTelemetryToAltitude(sim.telemetry);
    expect(flight.length).toBeGreaterThan(300);
    expect(simSeries.length).toBeGreaterThan(1000);

    const alignment = alignSimToFlight(simSeries, flight);
    // Sim over-predicts both apogee and burnout velocity on estimated geometry.
    expect(alignment.apogeeDeltaM).toBeGreaterThan(60);
    expect(alignment.apogeeDeltaM).toBeLessThan(140);
    expect(alignment.burnoutVelDeltaMs).not.toBeNull();
    expect(alignment.burnoutVelDeltaMs!).toBeGreaterThan(30);
    expect(alignment.burnoutVelDeltaMs!).toBeLessThan(70);

    const compared = compareAltitudeSeries(simSeries, flight, {
      tolerance: { absTolM: 50, relTol: 0.2, timeTolS: 1 },
      align: true,
    });
    expect(compared.aligned).toBe(true);
    expect(compared.apogeeDeltaM).toBeCloseTo(alignment.apogeeDeltaM, 6);
    expect(compared.regions.length).toBeGreaterThanOrEqual(1);
    expect(compared.nMismatch).toBeGreaterThan(0);
  });

  it('fails closed on invalid dragCdScale values', () => {
    const vehicle = cosmicCargoLike();
    const motor = CERTIFIED_MOTORS.estes_c6;
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        simulate6DofFlight(vehicle, motor, { ...FLIGHT_CONDITIONS, dragCdScale: bad }),
      ).toThrow(/dragCdScale/);
    }
    // Omitting it and passing 1.0 must be identical (no silent default drift).
    const a = simulate6DofFlight(vehicle, motor, FLIGHT_CONDITIONS).apogeeAltitude;
    const b = simulate6DofFlight(vehicle, motor, { ...FLIGHT_CONDITIONS, dragCdScale: 1 }).apogeeAltitude;
    expect(b).toBe(a);
  });

  it('calibrated drag plus payload brackets the recorded apogee', () => {
    // With the flight-calibrated drag scale, payload mass brackets the recorded
    // 291.74 m (2026-10-21: 25 g 311.0 m, 30 g 290.8 m). This pins the solver,
    // the calibration and their coupling; it is not an accuracy claim (the
    // payload is fitted to this flight).
    const withPayload = (g: number) => {
      const v = cosmicCargoLike();
      v.components = [
        ...v.components,
        {
          id: 'cc-payload',
          name: 'Estimated payload',
          type: 'masscomponent',
          materialId: 'plywood',
          mass: g / 1000,
          length: 0.03,
          axialOffset: 0.1,
        } as RocketComponent,
      ];
      return simulate6DofFlight(v, CERTIFIED_MOTORS.estes_c6, {
        ...FLIGHT_CONDITIONS,
        dragCdScale: CALIBRATED_CD_SCALE,
      }).apogeeAltitude;
    };
    expect(withPayload(25)).toBeGreaterThan(RECORDED_APOGEE_M);
    expect(withPayload(30)).toBeLessThan(RECORDED_APOGEE_M);
  });
});
