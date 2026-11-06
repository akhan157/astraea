/**
 * Round-2 blind validation vehicles (docs/flight-validation/round2-protocol.md).
 *
 * Every number below is copied from the RocketPy example notebook named in
 * `notebook` (commit 9bd6ad3a), in the notebook's own rocket coordinate system
 * (all included notebooks use "tail_to_nose"), and converted to Astraea by the
 * rules in the protocol:
 *
 *   x(c) = nose.tip - c                      distance behind the nose tip
 *   rocket aft end  = max(nozzle, fin trailing edge, tail end)
 *   one body tube from the nose base to the tail top (or the aft end); it
 *   carries all airframe mass and is solved so the rollup equals the notebook's
 *   `mass` and `center_of_mass_without_motor` exactly
 *   the motor is a uniform cylinder seated at the tube's aft end whose length is
 *   2 x (distance from that end to the notebook's loaded-motor centre of mass)
 *
 * Nothing here is taken from the team drag curves or from flight data.
 */
import type { FinCrossSection, NoseconeShape, RocketComponent, RocketVehicle } from '../../core/types';
import { aggregateVehicleMass } from '../../core/mass';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import WX from './weather-inputs.json';
import { MOTORS, motorSpec } from './motors';

type WxKey = keyof typeof WX;

export interface Atmosphere {
  /** hPa at the pad (ERA5 for the notebook's date and place, or ISA when no weather file exists). */
  padHPa: number;
  tempC: number;
  /** +/- C sampled around tempC through the density-altitude bound. */
  tempTolC: number;
  /** +/- hPa sampled around padHPa (0 when the pressure comes from a weather file). */
  padTolHPa: number;
  /** m/s at 10 m above the pad. */
  wind10: number;
  /** degrees, direction the wind comes from. */
  windFromDeg: number;
  /** +/- m/s sampled around wind10 (floored at 0). */
  windTol: number;
  /** +/- degrees sampled around windFromDeg. */
  windDirTolDeg: number;
  source: string;
}

export interface Round2Vehicle {
  id: string;
  name: string;
  notebook: string;
  radius: number;
  /** kg, notebook `mass` (airframe without motor). */
  dryMass: number;
  /** notebook `center_of_mass_without_motor`, rocket coordinate. */
  cgCoord: number;
  nose: { kind: NoseconeShape; length: number; tip: number };
  /** Aft transition (notebook add_tail): `top` is the coordinate nearest the nose. */
  tail?: { top: number; length: number; rTop: number; rBottom: number };
  fins: { n: number; root: number; tip: number; span: number; sweepLength: number; le: number };
  motor: keyof typeof MOTORS;
  /** Rocket coordinate of the motor frame origin (add_motor position). */
  motorPosition: number;
  /** Motor-frame coordinates (nozzle_to_combustion_chamber, so they add to motorPosition). */
  nozzle: number;
  propellantCg: number;
  dryCg: number;
  launch: { railLength: number; inclinationDeg: number; headingDeg: number };
  atmosphere: Atmosphere;
  /** Mass/CG uncertainty note for the protocol table. */
  note?: string;
}

const isaHPa = (altitudeM: number): number => 1013.25 * (1 - altitudeM / 44330.77) ** (1 / 0.190263);

function era5(key: WxKey, tempTolC = 3): Atmosphere {
  const w = WX[key];
  return {
    padHPa: w.padPressureHPa, tempC: w.padTemperatureC, tempTolC, padTolHPa: 0,
    wind10: w.windSpeed10m, windFromDeg: w.windFromDeg, windTol: 2, windDirTolDeg: 45,
    source: `ERA5 ${w.file} ${w.utc}Z`,
  };
}

/** Sweep length RocketPy assumes when none is given: root chord - tip chord. */
const rpSweep = (root: number, tip: number): number => root - tip;

export const ROUND2_VEHICLES: Round2Vehicle[] = [
  {
    id: 'bella-lui', name: 'Bella Lui (EPFL Rocket Team, 2020)', notebook: 'bella_lui_flight_sim.ipynb',
    radius: 156 / 2000, dryMass: 18.227 - 0.001, cgCoord: 0,
    nose: { kind: 'ogive', length: 0.242, tip: 1.3 + 0.242 },
    tail: { top: -1.0856, length: 0.05, rTop: 156 / 2000, rBottom: 135 / 2000 },
    fins: { n: 3, root: 0.28, tip: 0.125, span: 0.2, sweepLength: rpSweep(0.28, 0.125), le: -0.75 },
    motor: 'bellaLui', motorPosition: -1.1356, nozzle: 0, propellantCg: 0.3, dryCg: 0.3,
    launch: { railLength: 4.2, inclinationDeg: 89, headingDeg: 45 },
    atmosphere: era5('bella_lui'),
    note: 'notebook comment says propellant 1.373 kg; the grain geometry in the code gives 0.824 kg',
  },
  {
    id: 'andromeda', name: 'Andromeda (EuRoC 2022)', notebook: 'andromeda_flight_sim.ipynb',
    radius: 0.07535, dryMass: 20.9767, cgCoord: 1.3998,
    nose: { kind: 'vonkarman', length: 0.3, tip: 2.4996 },
    fins: { n: 3, root: 0.23, tip: 0.11, span: 0.185, sweepLength: rpSweep(0.23, 0.11), le: 0.3546 },
    motor: 'andromeda', motorPosition: 0, nozzle: 0, propellantCg: 0.5613903872259161, dryCg: 0.5,
    launch: { railLength: 12, inclinationDeg: 84, headingDeg: 133 },
    atmosphere: era5('andromeda'),
  },
  {
    id: 'astra', name: 'Astra (EuRoC 2022)', notebook: 'astra_flight_sim.ipynb',
    radius: 0.047, dryMass: 10.6462, cgCoord: 1.3957,
    nose: { kind: 'vonkarman', length: 0.27, tip: 2.5214 },
    fins: { n: 4, root: 0.2, tip: 0.118, span: 0.117, sweepLength: rpSweep(0.2, 0.118), le: 0.9134 },
    motor: 'astra', motorPosition: 0.7146163949, nozzle: 0, propellantCg: 0.243, dryCg: 0,
    launch: { railLength: 12, inclinationDeg: 84, headingDeg: 133 },
    atmosphere: era5('astra'),
  },
  {
    id: 'cavour', name: 'Cavour (PoliTo, EuRoC 2023)', notebook: 'cavour_flight_sim.ipynb',
    radius: 0.052, dryMass: 8.219, cgCoord: 1.1994,
    nose: { kind: 'vonkarman', length: 0.52, tip: 2.7224 },
    fins: { n: 4, root: 0.2, tip: 0.07, span: 0.1, sweepLength: rpSweep(0.2, 0.07), le: 0.2104 },
    motor: 'cavour', motorPosition: 0, nozzle: 0, propellantCg: 0.19966000000000006, dryCg: 1.1994,
    launch: { railLength: 12, inclinationDeg: 84, headingDeg: 133 },
    atmosphere: era5('cavour'),
  },
  {
    id: 'erebus-11', name: 'EREBUS-11 (EuRoC 2022)', notebook: 'erebus_flight_sim.ipynb',
    radius: 0.04575, dryMass: 5.82, cgCoord: 1.192,
    nose: { kind: 'vonkarman', length: 0.391113, tip: 2.3841 },
    tail: { top: 0.290787, length: 0.079119, rTop: 0.04575, rBottom: 0.03575 },
    fins: { n: 4, root: 0.12, tip: 0.05, span: 0.08, sweepLength: rpSweep(0.12, 0.05), le: 0.395787 },
    motor: 'erebus11', motorPosition: 0.211668, nozzle: 0, propellantCg: 0.3, dryCg: 0,
    launch: { railLength: 12, inclinationDeg: 84, headingDeg: 133 },
    atmosphere: era5('erebus11'),
  },
  {
    id: 'genesis', name: 'GENESIS (EuRoC 2023)', notebook: 'genesis_flight_sim.ipynb',
    radius: 0.047, dryMass: 9.214, cgCoord: 0.895,
    nose: { kind: 'vonkarman', length: 0.27, tip: 2.372 },
    fins: { n: 4, root: 0.2, tip: 0.11, span: 0.105, sweepLength: rpSweep(0.2, 0.11), le: 0.25 },
    motor: 'genesis', motorPosition: 0, nozzle: 0, propellantCg: 0.243, dryCg: 0.895,
    launch: { railLength: 12, inclinationDeg: 84, headingDeg: 133 },
    atmosphere: era5('genesis'),
  },
  {
    id: 'lince', name: 'Lince (EuRoC 2023, pre-deploy flight)', notebook: 'lince_flight_sim.ipynb',
    radius: 0.052, dryMass: 10.6851352, cgCoord: 1.061,
    nose: { kind: 'vonkarman', length: 0.28, tip: 2.109417 },
    tail: { top: 0, length: 0.022, rTop: 0.052, rBottom: 0.04852 },
    fins: { n: 4, root: 0.17, tip: 0.0425, span: 0.0825, sweepLength: rpSweep(0.17, 0.0425), le: 0.17 },
    motor: 'lince', motorPosition: 0, nozzle: 0, propellantCg: 0.315533, dryCg: 1.061,
    launch: { railLength: 12, inclinationDeg: 84, headingDeg: 133 },
    atmosphere: era5('lince'),
  },
  {
    id: 'prometheus', name: 'Prometheus (Spaceport America)', notebook: 'prometheus_2022_flight_sim.ipynb',
    radius: 0.06985, dryMass: 13.93, cgCoord: 0.9549,
    nose: { kind: 'vonkarman', length: 0.742, tip: 2.229 },
    fins: { n: 3, root: 0.268, tip: 0.136, span: 0.13, sweepLength: 0.066, le: 0.273 },
    motor: 'prometheus', motorPosition: 0, nozzle: 0, propellantCg: 0.274, dryCg: 0.274,
    launch: { railLength: 5.18, inclinationDeg: 80, headingDeg: 75 },
    atmosphere: era5('prometheus'),
  },
  {
    id: 'juno-iii', name: 'Juno III (Projeto Jupiter, Spaceport America 2023)', notebook: 'juno3_flight_sim.ipynb',
    radius: 0.0655, dryMass: 24.05, cgCoord: 0,
    nose: { kind: 'vonkarman', length: 0.565, tip: 1.477 },
    tail: { top: -1.226, length: 0.068, rTop: 0.0655, rBottom: 0.0535 },
    fins: { n: 4, root: 0.2, tip: 0.12, span: 0.13, sweepLength: rpSweep(0.2, 0.12), le: -0.928 },
    motor: 'juno3', motorPosition: 0, nozzle: -1.294, propellantCg: -0.683, dryCg: -0.683,
    launch: { railLength: 5.2, inclinationDeg: 85, headingDeg: 105 },
    atmosphere: era5('juno3'),
    note: 'team-built motor with a reshaped team curve: outside the 1.0 scope by construction',
  },
  {
    id: 'valkyrie', name: 'Valkyrie (2025/26)', notebook: 'valkyrie_flight_sim.ipynb',
    radius: 0.055, dryMass: 5.65, cgCoord: 0.844,
    nose: { kind: 'elliptical', length: 0.2, tip: 1.84 },
    tail: { top: 0, length: 0.15, rTop: 0.055, rBottom: 0.03 },
    fins: { n: 4, root: 0.17, tip: 0.14, span: 0.0768, sweepLength: 0.1, le: 0.148 },
    motor: 'valkyrie', motorPosition: 0, nozzle: 0, propellantCg: 0.246, dryCg: 0.246,
    launch: { railLength: 5, inclinationDeg: 87, headingDeg: 30 },
    atmosphere: {
      padHPa: isaHPa(592), tempC: 25, tempTolC: 10, padTolHPa: 8,
      wind10: 2, windFromDeg: 0, windTol: 3, windDirTolDeg: 180,
      source: 'no weather file (live ICON forecast): ISA at 592 m, 25 +/- 10 C, +/- 8 hPa, wind 2 +/- 3 m/s, any direction',
    },
    note: 'weather not reproducible; atmosphere and wind are bounds, not data',
  },
];

// ── Geometry mapping ────────────────────────────────────────────────────────

export interface Round2Geometry {
  noseLength: number;
  tubeStart: number;
  tubeEnd: number;
  aftEnd: number;
  finLeX: number;
  finTeX: number;
  cgX: number;
  motorCgX: number;
  motorLength: number;
  tailTopX?: number;
}

export function geometry(v: Round2Vehicle): Round2Geometry {
  const x = (c: number): number => v.nose.tip - c;
  const finLeX = x(v.fins.le);
  const finTeX = finLeX + v.fins.root;
  const nozzleX = x(v.motorPosition + v.nozzle);
  const tailTopX = v.tail ? x(v.tail.top) : undefined;
  const tailEndX = v.tail && tailTopX !== undefined ? tailTopX + v.tail.length : -Infinity;
  const aftEnd = Math.max(nozzleX, finTeX, tailEndX);
  const tubeEnd = tailTopX ?? aftEnd;
  const m = MOTORS[v.motor];
  const pCoord = v.motorPosition + v.propellantCg;
  const dCoord = v.motorPosition + v.dryCg;
  const motorCoord = (m.propellantMass * pCoord + m.dryMass * dCoord) / (m.propellantMass + m.dryMass);
  const motorCgX = x(motorCoord);
  const motorLength = 2 * (tubeEnd - motorCgX);
  if (!(motorLength > 0)) throw new Error(`${v.id}: motor centre of mass lies aft of the mount end`);
  if (tubeEnd - v.nose.length <= 0) throw new Error(`${v.id}: no body tube between the nose and the aft transition`);
  return {
    noseLength: v.nose.length, tubeStart: v.nose.length, tubeEnd, aftEnd, finLeX, finTeX,
    cgX: x(v.cgCoord), motorCgX, motorLength, tailTopX,
  };
}

export interface Variation {
  massScale: number;
  cgShiftM: number;
  finThicknessM: number;
  finCross: FinCrossSection;
}

/** Nominal values for the quantities the notebooks do not state (protocol, fin edge assumption). */
export const NOMINAL: Variation = { massScale: 1, cgShiftM: 0, finThicknessM: 0.004, finCross: 'rounded' };

const PLACEHOLDER_KG = 1e-6;

export function buildVehicle(v: Round2Vehicle, variation: Variation, motorId: string): RocketVehicle {
  const g = geometry(v);
  const D = 2 * v.radius;
  const mass = v.dryMass * variation.massScale;
  const cgX = g.cgX + variation.cgShiftM;
  const tubeLen = g.tubeEnd - g.tubeStart;
  const components = (tube: { mass: number; cg: number }): RocketComponent[] => {
    const list: RocketComponent[] = [
      {
        id: 'nose', name: 'Nose', type: 'nosecone', materialId: 'cardboard', shape: v.nose.kind,
        length: v.nose.length, baseDiameter: D, wallThickness: 0.002, isHollow: true,
        massOverride: PLACEHOLDER_KG, cgOverride: v.nose.length / 2,
      } as RocketComponent,
      {
        id: 'tube', name: 'Body tube', type: 'bodytube', materialId: 'cardboard', length: tubeLen,
        outerDiameter: D, innerDiameter: D - 0.004, isMotorMount: true, assignedMotorId: motorId,
        massOverride: tube.mass, cgOverride: tube.cg,
      } as RocketComponent,
    ];
    if (v.tail) {
      list.push({
        id: 'tail', name: 'Tail', type: 'transition', materialId: 'cardboard', length: v.tail.length,
        foreDiameter: 2 * v.tail.rTop, aftDiameter: 2 * v.tail.rBottom, wallThickness: 0.002, isHollow: true,
        massOverride: PLACEHOLDER_KG, cgOverride: v.tail.length / 2,
      } as RocketComponent);
    }
    list.push({
      id: 'fins', name: 'Fins', type: 'trapezoidfinset', materialId: 'cardboard', finCount: v.fins.n,
      rootChord: v.fins.root, tipChord: v.fins.tip, span: v.fins.span, sweepLength: v.fins.sweepLength,
      thickness: variation.finThicknessM, crossSection: variation.finCross, axialOffset: g.finLeX - g.tubeStart,
      massOverride: PLACEHOLDER_KG, cgOverride: v.fins.root / 2,
    } as RocketComponent);
    return list;
  };
  // All airframe mass sits on the tube; the placeholders carry 1 microgram each.
  const probe = aggregateVehicleMass({ id: 'probe', name: 'probe', version: '1', author: 'v', components: components({ mass: PLACEHOLDER_KG, cg: 0 }) });
  const others = probe.components.filter((c) => c.id !== 'tube');
  const othersMass = others.reduce((s, c) => s + c.mass, 0);
  const othersMoment = others.reduce((s, c) => s + c.mass * c.globalCG, 0);
  const tubeMass = mass - othersMass;
  const tubeGlobalCg = (mass * cgX - othersMoment) / tubeMass;
  const vehicle: RocketVehicle = {
    id: v.id, name: v.name, version: '1', author: 'flight validation round 2',
    components: components({ mass: tubeMass, cg: tubeGlobalCg - g.tubeStart }),
  };
  const check = aggregateVehicleMass(vehicle);
  if (Math.abs(check.totalMass - mass) > 1e-9 || Math.abs(check.cg - cgX) > 1e-9) {
    throw new Error(`${v.id}: mass solve failed (${check.totalMass} kg @ ${check.cg} m)`);
  }
  return vehicle;
}

export function vehicleMotor(v: Round2Vehicle, motorId: string): MotorSpec {
  return motorSpec(motorId, MOTORS[v.motor], geometry(v).motorLength);
}
