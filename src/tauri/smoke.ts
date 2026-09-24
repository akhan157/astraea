/**
 * Smoke harness for the Astraea native bridge (replacement build).
 *
 * Proves each ported surface matches the TS-oracle anchors in
 * crates/astraea-core/README.md — WITHOUT importing any TS engine
 * (they are read-only reference, never a runtime path). Run inside the
 * Tauri workstation window (or `bun smoke.ts` with a stubbed
 * `window.__TAURI__.core.invoke` that forwards to the shell):
 *
 *   mass      0.15084933084864577 kg / CG 0.5204404792069448 m (mass fixture)
 *   stability Barrowman Alpha: CP 0.4841833975589611 m,
 *             margin 5.5071383219085766 cal, CNa 14.81220086077251
 *   chamber   Tc 3522.814668872915 K, γ 1.1817718046095134, MW 24.60469503516949
 *   flight    Estes Alpha/C6 zero-wind: apogee 388.72144947515324 m,
 *             flight 105.28801757814196 s, landing 3.987307476131326 m/s
 *
 * Usage (browser console in the Tauri window, or bun with a stub):
 *   import { runSmoke } from './smoke'; await runSmoke();
 */
import {
  aggregateMassOf,
  stabilityOf,
  aeroCurvesOf,
  solveChamber,
  simulateFlight,
  runEnsemble,
} from './bridge';
import type { RocketVehicle } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';

export interface SmokeCase {
  name: string;
  check: () => Promise<void>;
}

function relErr(got: number, want: number): number {
  if (want === 0) return Math.abs(got);
  return Math.abs((got - want) / Math.abs(want));
}

function assertClose(got: number, want: number, tol: number, what: string): void {
  const err = relErr(got, want);
  if (!(err <= tol)) {
    throw new Error(`smoke: ${what} got ${got} want ${want} (rel err ${err} > ${tol})`);
  }
}

/** Mass-fixture vehicle behind the 0.15084933084864577 kg anchor. */
export function massFixtureVehicle(): Record<string, unknown> {
  return {
    components: [
      {
        id: 'nc', name: 'Conical Nosecone', type: 'nosecone', materialId: 'pla_3dprint',
        shape: 'conical', length: 0.2, baseDiameter: 0.05, wallThickness: 0.002, isHollow: false,
      },
      {
        id: 'bt', name: 'Body Tube', type: 'bodytube', materialId: 'cardboard',
        length: 0.5, outerDiameter: 0.05, innerDiameter: 0.048,
      },
    ],
  };
}

/** Barrowman Alpha vehicle behind the CP/margin/CNa anchors. */
export function barrowmanAlphaVehicle(): Record<string, unknown> {
  return {
    components: [
      {
        id: 'nc', name: 'Ogive Nosecone', type: 'nosecone', materialId: 'pla_3dprint',
        shape: 'ogive', length: 0.15, baseDiameter: 0.04, wallThickness: 0.002, isHollow: true,
      },
      {
        id: 'bt', name: 'Main Body Tube', type: 'bodytube', materialId: 'cardboard',
        length: 0.45, outerDiameter: 0.04, innerDiameter: 0.038,
      },
      {
        id: 'fins', name: 'Trapezoidal Fins', type: 'trapezoidfinset', materialId: 'balsa',
        finCount: 3, rootChord: 0.08, tipChord: 0.03, span: 0.06,
        sweepLength: 0.03, thickness: 0.0025, crossSection: 'rounded', axialOffset: 0.37,
      },
    ],
  };
}

/** Estes Alpha flight vehicle (preset-estes-alpha geometry). */
export function estesAlphaVehicle(): Record<string, unknown> {
  return {
    components: [
      {
        id: 'alpha-nc', name: 'Ogive Nosecone', type: 'nosecone', materialId: 'pla_3dprint',
        shape: 'ogive', length: 0.165, baseDiameter: 0.0248, wallThickness: 0.0015, isHollow: true,
      },
      {
        id: 'alpha-bt', name: 'Main Body Tube (BT-50)', type: 'bodytube', materialId: 'cardboard',
        length: 0.311, outerDiameter: 0.0248, innerDiameter: 0.0241, isMotorMount: true,
      },
      {
        id: 'alpha-fins', name: 'Stabilizer Fins (3-Fin)', type: 'trapezoidfinset',
        materialId: 'pla_3dprint', finCount: 3, rootChord: 0.07, tipChord: 0.028, span: 0.051,
        sweepLength: 0.038, thickness: 0.002, crossSection: 'rounded', axialOffset: 0.241,
      },
      {
        id: 'alpha-chute', name: '12in Parachute', type: 'parachute', materialId: 'cardboard',
        mass: 0.008, diameter: 0.305, cd: 0.8, axialOffset: 0.05,
      },
    ],
  };
}

export function estesC6Motor(): Record<string, unknown> {
  return {
    designation: 'Estes C6',
    diameter: 0.018, length: 0.07, burnTime: 1.86,
    propellantMass: 0.0125, totalMass: 0.0248, dryMass: 0.0123, maxThrust: 14.2,
    thrustCurve: [
      { time: 0.0, thrust: 0.0 }, { time: 0.08, thrust: 4.5 },
      { time: 0.18, thrust: 14.2 }, { time: 0.28, thrust: 8.5 },
      { time: 0.5, thrust: 4.8 }, { time: 1.0, thrust: 4.4 },
      { time: 1.5, thrust: 4.2 }, { time: 1.86, thrust: 0.0 },
    ],
  };
}

// Bridge DTOs accept the domain types directly; these helpers only relabel
// the fixture records as domain-typed inputs (shapes are asserted by the
// shell's serde layer, not here).
const V = (v: Record<string, unknown>): RocketVehicle => v as unknown as RocketVehicle;
const M = (m: Record<string, unknown>): MotorSpec => m as unknown as MotorSpec;

export const smokeCases: SmokeCase[] = [
  {
    name: 'aggregate_mass matches mass-fixture anchor',
    check: async () => {
      const r = await aggregateMassOf(V(massFixtureVehicle()));
      assertClose(r.totalMass, 0.15084933084864577, 1e-9, 'totalMass');
      assertClose(r.cg, 0.5204404792069448, 1e-9, 'cg');
    },
  },
  {
    name: 'stability matches Barrowman Alpha anchors',
    check: async () => {
      const s = await stabilityOf(V(barrowmanAlphaVehicle()));
      assertClose(s.cp, 0.4841833975589611, 1e-9, 'cp');
      assertClose(s.staticMarginCalibers, 5.5071383219085766, 1e-9, 'staticMarginCalibers');
      assertClose(s.totalCNa, 14.81220086077251, 1e-9, 'totalCNa');
    },
  },
  {
    name: 'aero_curves carries the base-drag peak',
    check: async () => {
      const c = await aeroCurvesOf(V(barrowmanAlphaVehicle()), false);
      if (c.machPoints.length !== 41) throw new Error(`smoke: machPoints ${c.machPoints.length} != 41`);
      if (!(c.maxTransonicCd > 0.3)) throw new Error(`smoke: maxTransonicCd ${c.maxTransonicCd} too small`);
    },
  },
  {
    name: 'solve_chamber matches APCP anchors',
    check: async () => {
      const eq = await solveChamber(10_000_000);
      assertClose(eq.Tc, 3522.814668872915, 5e-3, 'Tc');
      assertClose(eq.gamma, 1.1817718046095134, 5e-3, 'gamma');
      assertClose(eq.molWeight, 24.60469503516949, 5e-3, 'molWeight');
    },
  },
  {
    name: 'simulate_flight matches zero-wind Alpha/C6 anchors',
    check: async () => {
      const r = await simulateFlight(V(estesAlphaVehicle()), M(estesC6Motor()), {
        railLength: 1.0, railElevationDeg: 90.0, railAzimuthDeg: 0.0,
        windSpeedSurface: 0.0, windAzimuthDeg: 90.0, mainDeployAltitudeAGL: 250.0,
      });
      if (!r.terminated) throw new Error('smoke: flight did not terminate at touchdown');
      assertClose(r.apogeeAltitude, 388.72144947515324, 0.005, 'apogeeAltitude');
      if (r.landingDistance > 5.0) throw new Error(`smoke: landing drift ${r.landingDistance} > 5 m`);
      if (Math.abs(r.flightDuration - 105.28801757814196) > 0.05) {
        throw new Error(`smoke: flightDuration ${r.flightDuration} off anchor`);
      }
      if (Math.abs(r.landingVelocity - 3.987307476131326) > 0.05) {
        throw new Error(`smoke: landingVelocity ${r.landingVelocity} off anchor`);
      }
    },
  },
  {
    name: 'run_ensemble returns a coherent dispersion',
    check: async () => {
      const d = await runEnsemble(
        { vehicle: V(estesAlphaVehicle()), motor: M(estesC6Motor()), options: { railLength: 1.0 } },
        { windAzimuthDegSigma: 5.0, railAngleDegSigma: 1.0, impulsePctSigma: 2.0 },
        8, 7, 'per-run-v2',
      );
      if (d.successfulRuns + d.failedRuns !== 8) {
        throw new Error(`smoke: run accounting ${d.successfulRuns}+${d.failedRuns} != 8`);
      }
      if (!(d.sigma1 >= 0 && d.sigma2 >= 0)) throw new Error('smoke: negative dispersion axis');
    },
  },
];

/** Runs every smoke case in order; throws on the first failure. */
export async function runSmoke(): Promise<string[]> {
  const passed: string[] = [];
  for (const c of smokeCases) {
    await c.check();
    passed.push(c.name);
  }
  return passed;
}
