/**
 * Mini DX3 flight validation harness (docs/flight-validation/mini-dx3-protocol.md).
 *
 * Opt-in research run, not an application unit test:
 *   pnpm build:engine && pnpm validate:mini-dx3
 * Every prediction goes through the shipped WebAssembly engine and the
 * production bridge. Inputs are frozen by the protocol; nothing here is tuned
 * to measured flights (dragCdScale stays 1).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { instantiateEngine } from '../../engine/core';
import { setTestEngine, type EngineInvoke } from '../../engine';
import { simulateFlight } from '../../tauri/bridge';
import { aggregateVehicleMass } from '../../core/mass';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import type { SixDofOptions } from '../../sim/sixDofSimulator';
import { G69N, G77RL, G79WL, H128W } from './motors';
import { miniDx3, type AirframeMass } from './miniDx3-vehicle';

// ── Atmosphere bounds (protocol: ISA engine, temperature bounded via elevation) ──
const ISA_P0 = 1013.25;
const ISA_RHO0 = 1.225;
export function pressureAltitude(hPa: number): number {
  return 44330.77 * (1 - (hPa / ISA_P0) ** 0.190263);
}
export function densityAltitude(hPa: number, tempC: number): number {
  const rho = (hPa * 100) / (287.05287 * (tempC + 273.15));
  return (288.15 / 0.0065) * (1 - (rho / ISA_RHO0) ** (1 / 4.2558797));
}

// ── Seeded sampling ─────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scaleImpulse(motor: MotorSpec, k: number, loadedDeltaKg: number): MotorSpec {
  return {
    ...motor,
    totalImpulse: motor.totalImpulse * k,
    avgThrust: motor.avgThrust * k,
    maxThrust: motor.maxThrust * k,
    totalMass: motor.totalMass + loadedDeltaKg,
    dryMass: motor.dryMass + loadedDeltaKg,
    thrustCurve: motor.thrustCurve.map((p) => ({ time: p.time, thrust: p.thrust * k })),
  };
}

export interface CaseSpec {
  label: string;
  airframe: AirframeMass;
  motor: MotorSpec;
  impulseTol: number;
  padHPa: number;
  tempC: number | null;
  tempTolC: number;
  windNominal: number;
  windRange: [number, number];
}

export interface Prediction {
  nominal: { apogeeM: number; apogeeTimeS: number; maxMach: number; railExitMs: number };
  mc: { n: number; p05: number; p50: number; p95: number; tP50: number };
  elevationRange: [number, number];
}

const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
};

export async function predict(spec: CaseSpec, runs = 200, seed = 20261021): Promise<Prediction> {
  const hP = pressureAltitude(spec.padHPa);
  const bounds = spec.tempC === null
    ? [hP]
    : [hP, densityAltitude(spec.padHPa, spec.tempC - spec.tempTolC), densityAltitude(spec.padHPa, spec.tempC + spec.tempTolC)];
  const elevationRange: [number, number] = [Math.min(...bounds), Math.max(...bounds)];
  const fly = async (af: AirframeMass, motor: MotorSpec, elevation: number, opts: SixDofOptions) => {
    const vehicle = { ...miniDx3(af, motor.id), launchSite: { altitudeM: elevation } };
    const r = await simulateFlight(vehicle, motor, { ...opts, launchAltitudeASL: elevation, mainDeployAltitudeAGL: 150 });
    if (r.terminationReason !== 'touchdown') throw new Error(`${spec.label}: run did not touch down`);
    return r;
  };
  const nominal = await fly(spec.airframe, spec.motor, hP, {
    railLength: 1.83, railElevationDeg: 88, railAzimuthDeg: 0, windSpeedSurface: spec.windNominal, windAzimuthDeg: 0,
  });
  const rnd = mulberry32(seed);
  const u = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const apogees: number[] = [];
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const af = { mass: spec.airframe.mass + u(-0.002, 0.002), cg: spec.airframe.cg + u(-0.01, 0.01) };
    const motor = scaleImpulse(spec.motor, u(1 - spec.impulseTol, 1 + spec.impulseTol), u(-0.01, 0.01));
    const r = await fly(af, motor, u(elevationRange[0], elevationRange[1]), {
      railLength: u(1.2, 2.4), railElevationDeg: u(85, 90), railAzimuthDeg: u(0, 360),
      windSpeedSurface: u(spec.windRange[0], spec.windRange[1]), windAzimuthDeg: u(0, 360),
    });
    apogees.push(r.apogeeAltitude);
    times.push(r.apogeeTime);
  }
  return {
    nominal: { apogeeM: nominal.apogeeAltitude, apogeeTimeS: nominal.apogeeTime, maxMach: nominal.maxMach, railExitMs: nominal.railExitVelocity },
    mc: { n: runs, p05: quantile(apogees, 0.05), p50: quantile(apogees, 0.5), p95: quantile(apogees, 0.95), tP50: quantile(times, 0.5) },
    elevationRange,
  };
}

// ── Cases (inputs frozen by the protocol) ───────────────────────────────────
const DEV_AIRFRAME: AirframeMass = { mass: 0.34471, cg: 0.508 };
export const HOLDOUT_AIRFRAME: AirframeMass = { mass: 0.33355, cg: 0.4826 };

export const DEV_2017: CaseSpec = {
  label: 'G69N 30 Jun 2017 (development)', airframe: DEV_AIRFRAME, motor: G69N, impulseTol: 0.03,
  padHPa: 915.76, tempC: 20.0, tempTolC: 3, windNominal: 0, windRange: [0, 1],
};
export const DEV_2018: CaseSpec = {
  label: 'G69N 22 Oct 2018 (development)', airframe: DEV_AIRFRAME, motor: G69N, impulseTol: 0.03,
  padHPa: 915.17, tempC: null, tempTolC: 0, windNominal: 1, windRange: [0, 4],
};

// Holdout (Amendment 3): pad pressures are the median MS5 reading in the 5 s
// before liftoff, extracted before this prediction was committed.
export const HOLDOUT: CaseSpec[] = [
  { label: 'G77R/L 5 Feb 2021 (holdout)', airframe: HOLDOUT_AIRFRAME, motor: G77RL, impulseTol: 0.03,
    padHPa: 922.84, tempC: 18.9, tempTolC: 3, windNominal: 0, windRange: [0, 1] },
  { label: 'G79W/L 5 Feb 2021 (holdout)', airframe: HOLDOUT_AIRFRAME, motor: G79WL, impulseTol: 0.03,
    padHPa: 922.7, tempC: 18.9, tempTolC: 3, windNominal: 0, windRange: [0, 1] },
  { label: 'H128W 10 Apr 2021 (holdout)', airframe: HOLDOUT_AIRFRAME, motor: H128W, impulseTol: 0.03,
    padHPa: 914.77, tempC: 19.4, tempTolC: 3, windNominal: 4.0, windRange: [2.5, 5.5] },
];

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

describe('Mini DX3 validation (pre-registered)', () => {
  it('reproduces the measured airframe mass and CG exactly', () => {
    for (const af of [DEV_AIRFRAME, HOLDOUT_AIRFRAME]) {
      const m = aggregateVehicleMass(miniDx3(af, 'x'));
      expect(m.totalMass).toBeCloseTo(af.mass, 12);
      expect(m.cg).toBeCloseTo(af.cg, 12);
    }
  });

  it('predicts the G69N development groups and the holdout flights', async () => {
    await withEngine(async () => {
      for (const spec of [DEV_2017, DEV_2018, ...HOLDOUT]) {
        const p = await predict(spec);
        console.log(
          `${spec.label}: nominal ${p.nominal.apogeeM.toFixed(1)} m at ${p.nominal.apogeeTimeS.toFixed(2)} s ` +
          `(Mach ${p.nominal.maxMach.toFixed(3)}, rail exit ${p.nominal.railExitMs.toFixed(1)} m/s); ` +
          `MC n=${p.mc.n} p05 ${p.mc.p05.toFixed(1)} p50 ${p.mc.p50.toFixed(1)} p95 ${p.mc.p95.toFixed(1)} m, ` +
          `t50 ${p.mc.tP50.toFixed(2)} s; elevation ${p.elevationRange[0].toFixed(0)}–${p.elevationRange[1].toFixed(0)} m`,
        );
        expect(p.mc.p05).toBeLessThanOrEqual(p.mc.p95);
      }
    });
  }, 600_000);
});
