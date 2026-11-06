/**
 * Round-2 blind flight validation harness (docs/flight-validation/round2-protocol.md).
 *
 * Opt-in research run, not an application unit test:
 *   pnpm build:engine && pnpm validate:round2
 * Every prediction goes through the shipped WebAssembly engine and the
 * production bridge, default aerodynamics, dragCdScale = 1. Nothing is tuned.
 * Set ROUND2_PREDICTIONS_OUT to a path to also write the predictions as JSON.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { instantiateEngine } from '../../engine/core';
import { setTestEngine, type EngineInvoke } from '../../engine';
import { simulateFlight } from '../../tauri/bridge';
import type { FinCrossSection } from '../../core/types';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import type { SixDofOptions } from '../../sim/sixDofSimulator';
import { MOTORS } from './motors';
import { densityAltitude, mulberry32, pressureAltitude, quantile } from './sampling';
import { NOMINAL, ROUND2_VEHICLES, buildVehicle, geometry, vehicleMotor, type Round2Vehicle, type Variation } from './vehicles';

export const RUNS = 200;
export const SEED = 20261021;
/** Wind input is the engine's 2 m reference speed; its power law gives v(10 m) = v2 * 5^0.14. */
const WIND_10M_TO_2M = 1 / 5 ** 0.14;
/** Team-measured thrust files get a wider impulse spread than catalogue curves. */
const IMPULSE_TOL: Partial<Record<keyof typeof MOTORS, number>> = { andromeda: 0.05, erebus11: 0.05, juno3: 0.05 };
/** Propellant mass multiplier range; Bella Lui spans its code value to the 1.373 kg in the notebook comment. */
const PROPELLANT_RANGE: Partial<Record<keyof typeof MOTORS, [number, number]>> = {
  bellaLui: [1, 1.373 / MOTORS.bellaLui.propellantMass],
};

export interface Round2Prediction {
  id: string;
  name: string;
  motor: string;
  commercialMotor: boolean;
  nominal: { apogeeM: number; apogeeTimeS: number; maxMach: number; railExitMs: number; liftoffMassKg: number };
  mc: { n: number; p05: number; p50: number; p95: number; tP05: number; tP50: number; tP95: number };
  elevationRangeM: [number, number];
  inputs: { padHPa: number; tempC: number; wind10: number; windFromDeg: number; atmosphere: string };
  error?: string;
}

function scaleMotor(m: MotorSpec, impulse: number, propellant: number): MotorSpec {
  return {
    ...m,
    totalImpulse: m.totalImpulse * impulse,
    avgThrust: m.avgThrust * impulse,
    maxThrust: m.maxThrust * impulse,
    propellantMass: m.propellantMass * propellant,
    totalMass: m.dryMass + m.propellantMass * propellant,
    thrustCurve: m.thrustCurve.map((p) => ({ time: p.time, thrust: p.thrust * impulse })),
  };
}

export function elevationRange(v: Round2Vehicle): [number, number] {
  const a = v.atmosphere;
  const values: number[] = [];
  for (const p of [a.padHPa - a.padTolHPa, a.padHPa, a.padHPa + a.padTolHPa]) {
    values.push(pressureAltitude(p));
    for (const t of [a.tempC - a.tempTolC, a.tempC, a.tempC + a.tempTolC]) values.push(densityAltitude(p, t));
  }
  return [Math.min(...values), Math.max(...values)];
}

export async function predictVehicle(v: Round2Vehicle, runs = RUNS, seed = SEED): Promise<Round2Prediction> {
  const a = v.atmosphere;
  const motorId = `${v.id}_motor`;
  const baseMotor = vehicleMotor(v, motorId);
  const hP = pressureAltitude(a.padHPa);
  const range = elevationRange(v);
  const length = geometry(v).aftEnd;
  const fly = async (variation: Variation, motor: MotorSpec, elevation: number, opts: SixDofOptions) => {
    const vehicle = { ...buildVehicle(v, variation, motorId), launchSite: { altitudeM: elevation } };
    const r = await simulateFlight(vehicle, motor, { ...opts, launchAltitudeASL: elevation, mainDeployAltitudeAGL: 150 });
    if (r.terminationReason !== 'touchdown') throw new Error(`${v.id}: run did not touch down (${r.terminationReason})`);
    return r;
  };
  const nominal = await fly(NOMINAL, baseMotor, hP, {
    railLength: v.launch.railLength, railElevationDeg: v.launch.inclinationDeg, railAzimuthDeg: v.launch.headingDeg,
    windSpeedSurface: a.wind10 * WIND_10M_TO_2M, windAzimuthDeg: a.windFromDeg,
  });
  const rnd = mulberry32(seed);
  const u = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const impulseTol = IMPULSE_TOL[v.motor] ?? 0.03;
  const [pLo, pHi] = PROPELLANT_RANGE[v.motor] ?? [0.95, 1.05];
  const apogees: number[] = [];
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const variation: Variation = {
      massScale: u(0.98, 1.02),
      cgShiftM: u(-0.02 * length, 0.02 * length),
      finThicknessM: u(0.002, 0.006),
      finCross: (rnd() < 0.5 ? 'square' : 'rounded') as FinCrossSection,
    };
    const motor = scaleMotor(baseMotor, u(1 - impulseTol, 1 + impulseTol), u(pLo, pHi));
    const r = await fly(variation, motor, u(range[0], range[1]), {
      railLength: v.launch.railLength * u(0.9, 1.1),
      railElevationDeg: Math.min(90, v.launch.inclinationDeg + u(-2, 2)),
      railAzimuthDeg: v.launch.headingDeg + u(-10, 10),
      windSpeedSurface: Math.max(0, a.wind10 + u(-a.windTol, a.windTol)) * WIND_10M_TO_2M,
      windAzimuthDeg: a.windFromDeg + u(-a.windDirTolDeg, a.windDirTolDeg),
    });
    apogees.push(r.apogeeAltitude);
    times.push(r.apogeeTime);
  }
  return {
    id: v.id, name: v.name, motor: baseMotor.designation, commercialMotor: MOTORS[v.motor].commercial,
    nominal: {
      apogeeM: nominal.apogeeAltitude, apogeeTimeS: nominal.apogeeTime, maxMach: nominal.maxMach,
      railExitMs: nominal.railExitVelocity, liftoffMassKg: v.dryMass + baseMotor.totalMass,
    },
    mc: {
      n: runs, p05: quantile(apogees, 0.05), p50: quantile(apogees, 0.5), p95: quantile(apogees, 0.95),
      tP05: quantile(times, 0.05), tP50: quantile(times, 0.5), tP95: quantile(times, 0.95),
    },
    elevationRangeM: range,
    inputs: { padHPa: a.padHPa, tempC: a.tempC, wind10: a.wind10, windFromDeg: a.windFromDeg, atmosphere: a.source },
  };
}

async function withEngine<T>(fn: () => Promise<T>): Promise<T> {
  const bytes = readFileSync(fileURLToPath(new URL('../../engine/astraea_engine.wasm', import.meta.url)));
  const engine = await instantiateEngine(bytes);
  setTestEngine((async (command, args) => engine.call(command, args)) as EngineInvoke);
  try {
    return await fn();
  } finally {
    setTestEngine(null);
  }
}

describe('Round 2 validation predictions (pre-registered)', () => {
  it('predicts every registered vehicle', async () => {
    await withEngine(async () => {
      const out: Round2Prediction[] = [];
      for (const v of ROUND2_VEHICLES) {
        try {
          const p = await predictVehicle(v);
          out.push(p);
          console.log(
            `${v.id}: nominal ${p.nominal.apogeeM.toFixed(1)} m at ${p.nominal.apogeeTimeS.toFixed(2)} s ` +
            `(Mach ${p.nominal.maxMach.toFixed(3)}, rail exit ${p.nominal.railExitMs.toFixed(1)} m/s, liftoff ${p.nominal.liftoffMassKg.toFixed(2)} kg); ` +
            `MC n=${p.mc.n} p05 ${p.mc.p05.toFixed(1)} p50 ${p.mc.p50.toFixed(1)} p95 ${p.mc.p95.toFixed(1)} m; ` +
            `elevation ${p.elevationRangeM[0].toFixed(0)}–${p.elevationRangeM[1].toFixed(0)} m`,
          );
          expect(p.mc.p05).toBeLessThanOrEqual(p.mc.p95);
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          console.log(`${v.id}: ENGINE ERROR ${error}`);
          out.push({ id: v.id, name: v.name, error } as Round2Prediction);
        }
      }
      const path = process.env.ROUND2_PREDICTIONS_OUT;
      if (path) writeFileSync(path, JSON.stringify({ seed: SEED, runs: RUNS, predictions: out }, null, 2) + '\n');
      expect(out.filter((p) => p.error)).toEqual([]);
    });
  }, 7_200_000);
});
