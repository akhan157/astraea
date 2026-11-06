/**
 * Motors for the round-2 blind validation (docs/flight-validation/round2-protocol.md).
 *
 * Thrust samples are the RocketPy data files each notebook loads
 * (motorSources.generated.ts). Processing mirrors RocketPy's own
 * (Motor.reshape_thrust_curve, Motor.clip_thrust) and then adds only what
 * Astraea's motor contract requires: a zero-thrust sample at t = 0 and at
 * burnout, each placed 1 microsecond away from the data so no impulse is
 * invented or removed. Negative samples are clipped to zero.
 */
import type { MotorSpec } from '../../propulsion/motorDatabase';
import {
  RAW_ANDROMEDA, RAW_EREBUS11, RAW_K650, RAW_K828FJ, RAW_L1350, RAW_L995, RAW_M1101, RAW_M1520,
  RAW_MANDIOCA, type RawCurve,
} from './motorSources.generated';

const EPS_S = 1e-6;

export interface ThrustProcessing {
  /** Notebook burn_time (end of the clipped window); the file end when absent or later. */
  burnTime?: number;
  /** Notebook reshape_thrust_curve = [new burn time s, new total impulse N*s]. */
  reshape?: readonly [number, number];
}

export interface NotebookMotor {
  designation: string;
  manufacturer: string;
  impulseClass: string;
  raw: RawCurve;
  processing: ThrustProcessing;
  /** kg, from the notebook (grain geometry x density, or the stated propellant mass). */
  propellantMass: number;
  /** kg, the notebook's motor dry_mass (0 when the casing is part of the rocket mass). */
  dryMass: number;
  /** m, outer diameter used for the motor inertia and the bore check. */
  diameter: number;
  /** true for a commercial (catalogue) motor, false for a team-built one. */
  commercial: boolean;
}

/** n grains of annular propellant: n * pi * (Ro^2 - Ri^2) * h * rho (RocketPy SolidMotor). */
export function grainMass(n: number, outerRadius: number, innerRadius: number, height: number, density: number): number {
  return n * Math.PI * (outerRadius ** 2 - innerRadius ** 2) * height * density;
}

function interp(points: ReadonlyArray<readonly [number, number]>, t: number): number {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0]) {
      const [t0, f0] = points[i - 1];
      const [t1, f1] = points[i];
      return t1 === t0 ? f1 : f0 + ((f1 - f0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

export function trapezoid(points: ReadonlyArray<readonly [number, number]>): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += ((points[i][0] - points[i - 1][0]) * (points[i][1] + points[i - 1][1])) / 2;
  return sum;
}

/** The thrust curve the notebook's RocketPy motor flies, as [time, thrust] pairs. */
export function notebookThrust(raw: RawCurve, p: ThrustProcessing): Array<[number, number]> {
  let pts: Array<[number, number]> = raw.map(([t, f]) => [t, f]);
  if (p.reshape) {
    const [newBurn, newImpulse] = p.reshape;
    const scale = newBurn / (pts[pts.length - 1][0] - pts[0][0]);
    const t0 = pts[0][0] * scale;
    pts = pts.map(([t, f]) => [t * scale - t0, f]);
    const old = trapezoid(pts);
    pts = pts.map(([t, f]) => [t, (newImpulse / old) * f]);
  }
  const end = Math.min(p.burnTime ?? Infinity, pts[pts.length - 1][0]);
  const clipped = pts.filter(([t]) => t < end);
  clipped.push([end, interp(pts, end)]);
  return clipped;
}

/** Astraea's contract: starts at (0, 0), ends at (burnTime, 0), strictly increasing, no negatives. */
export function astraeaThrust(pts: ReadonlyArray<readonly [number, number]>): Array<{ time: number; thrust: number }> {
  const out: Array<{ time: number; thrust: number }> = [{ time: 0, thrust: 0 }];
  const first = pts[0];
  if (first[0] > 2 * EPS_S) {
    out.push({ time: first[0] - EPS_S, thrust: 0 });
    out.push({ time: first[0], thrust: Math.max(0, first[1]) });
  } else {
    out.push({ time: EPS_S, thrust: Math.max(0, first[1]) });
  }
  for (let i = 1; i < pts.length; i++) out.push({ time: pts[i][0], thrust: Math.max(0, pts[i][1]) });
  const last = out[out.length - 1];
  if (last.thrust !== 0) out.push({ time: last.time + EPS_S, thrust: 0 });
  return out;
}

export function motorSpec(id: string, m: NotebookMotor, length: number): MotorSpec {
  const curve = astraeaThrust(notebookThrust(m.raw, m.processing));
  const burnTime = curve[curve.length - 1].time;
  const totalImpulse = trapezoid(curve.map((p) => [p.time, p.thrust] as const));
  return {
    id,
    designation: m.designation,
    manufacturer: m.manufacturer,
    impulseClass: m.impulseClass,
    diameter: m.diameter,
    length,
    totalImpulse,
    avgThrust: totalImpulse / burnTime,
    maxThrust: Math.max(...curve.map((p) => p.thrust)),
    burnTime,
    propellantMass: m.propellantMass,
    totalMass: m.propellantMass + m.dryMass,
    dryMass: m.dryMass,
    thrustCurve: curve,
  };
}

// ── Notebook motor definitions (values copied from the notebooks' SolidMotor / GenericMotor calls) ──

export const MOTORS = {
  bellaLui: {
    designation: 'AeroTech K828FJ', manufacturer: 'AeroTech', impulseClass: 'K',
    raw: RAW_K828FJ, processing: { burnTime: 2.43 },
    propellantMass: grainMass(3, 85.598 / 2000, 33.147 / 1000, 152.4 / 1000, 782.4), dryMass: 0.001,
    diameter: 85.598 / 1000, commercial: true,
  },
  andromeda: {
    designation: 'Cesaroni Pro75 M2020 (team curve)', manufacturer: 'Cesaroni', impulseClass: 'M',
    raw: RAW_ANDROMEDA, processing: { burnTime: 3.76 },
    propellantMass: grainMass(1, 0.0375, 0.01875, 0.893, 1468.9079097925262), dryMass: 0,
    diameter: 0.075, commercial: true,
  },
  astra: {
    designation: 'Cesaroni 4263L1350-P', manufacturer: 'Cesaroni', impulseClass: 'L',
    raw: RAW_L1350, processing: { burnTime: 3.284 },
    propellantMass: grainMass(1, 0.0375, 0.01875, 0.486, 1256.7753406541794), dryMass: 0,
    diameter: 0.075, commercial: true,
  },
  cavour: {
    designation: 'Cesaroni 3618L995-P', manufacturer: 'Cesaroni', impulseClass: 'L',
    raw: RAW_L995, processing: { burnTime: 3.8 },
    propellantMass: grainMass(3, 0.0325, 0.011375, 0.13244, 1653.53), dryMass: 0,
    diameter: 0.065, commercial: true,
  },
  erebus11: {
    designation: 'Cesaroni Pro54 K (team curve)', manufacturer: 'Cesaroni', impulseClass: 'K',
    raw: RAW_EREBUS11, processing: { burnTime: 3.657 },
    propellantMass: grainMass(1, 0.027, 0.0135, 0.572, 1196.6353410211093), dryMass: 0,
    diameter: 0.054, commercial: true,
  },
  genesis: {
    designation: 'Cesaroni 3618L995-P', manufacturer: 'Cesaroni', impulseClass: 'L',
    raw: RAW_L995, processing: { burnTime: 3.8 },
    propellantMass: grainMass(3, 0.033, 0.015, 0.12, 1815), dryMass: 0,
    diameter: 0.066, commercial: true,
  },
  lince: {
    designation: 'Cesaroni M1101', manufacturer: 'Cesaroni', impulseClass: 'M',
    raw: RAW_M1101, processing: { burnTime: 4.736 },
    propellantMass: grainMass(4, 0.035, 0.01, 0.16, 1363), dryMass: 0,
    diameter: 0.07, commercial: true,
  },
  prometheus: {
    designation: 'Cesaroni 7579M1520-P', manufacturer: 'Cesaroni', impulseClass: 'M',
    raw: RAW_M1520, processing: { burnTime: 4.897 },
    propellantMass: 3.737, dryMass: 2.981,
    diameter: 0.128, commercial: true,
  },
  juno3: {
    designation: 'Projeto Jupiter Mandioca (team-built)', manufacturer: 'Projeto Jupiter', impulseClass: 'M',
    raw: RAW_MANDIOCA, processing: { reshape: [5.8, 8800] },
    propellantMass: grainMass(5, 0.0465, 0.016, 0.156, 1748.9), dryMass: 0,
    diameter: 0.093, commercial: false,
  },
  valkyrie: {
    designation: 'Cesaroni 1997K650-21A', manufacturer: 'Cesaroni', impulseClass: 'K',
    raw: RAW_K650, processing: { burnTime: 3.5 },
    propellantMass: grainMass(5, 0.025, 0.01, 0.0966, 1170), dryMass: 0.6449,
    diameter: 0.05, commercial: true,
  },
} satisfies Record<string, NotebookMotor>;
