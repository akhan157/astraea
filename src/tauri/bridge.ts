/**
 * Astraea native compute bridge -- the ONLY runtime engine path.
 *
 * Replacement build: studios call these functions; they forward to the Rust
 * core over Tauri IPC (`window.__TAURI__.core.invoke`). The TS `src/`
 * engines are a read-only oracle for parity values, never a runtime path --
 * there is no TS fallback and no routing flag.
 *
 * Outside a Tauri window (plain browser / vitest) `invoke()` throws with a
 * fail-closed message so a missing backend can never silently return
 * zero-mass or zero-aero data.
 *
 * Coarse-grained IPC only: run_ensemble, simulate_flight, solve_chamber,
 * stability, aero_curves, aggregate_mass. Never per-step serialization.
 */
import type { RocketVehicle, StabilityAnalysis } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import type { SixDofOptions, SixDofSimulationResult } from '../sim/sixDofSimulator';
import type { MonteCarloSimInput, PerturbationSigmas, DispersionResult, SamplingVersion } from '../sim/monteCarlo';
import type { ApcpEquilibrium } from '../propulsion/nozzleChemistry';
import type { AeroCurveResult } from '../aero/transonicAero';
import type { VehicleMassRollup } from '../core/mass';

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): InvokeFn {
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: InvokeFn }; invoke?: InvokeFn };
  };
  const viaCore = w.__TAURI__?.core?.invoke;
  if (typeof viaCore === 'function') return viaCore.bind(w.__TAURI__!.core);
  const legacy = w.__TAURI__?.invoke;
  if (typeof legacy === 'function') return legacy.bind(w.__TAURI__);
  throw new Error(
    'Astraea native bridge: Tauri IPC is unavailable (window.__TAURI__ missing). ' +
      'Engine calls require the Astraea workstation shell -- there is no TS fallback.',
  );
}

function componentDto(c: RocketVehicle['components'][number]): Record<string, unknown> {
  const { id, name, type, materialId, ...rest } = c as unknown as Record<string, unknown>;
  return { id, name, type, materialId, ...rest };
}

function vehicleDto(vehicle: RocketVehicle): { components: Record<string, unknown>[] } {
  return { components: vehicle.components.map(componentDto) };
}

function motorDto(motor: MotorSpec): Record<string, unknown> {
  return {
    designation: motor.designation,
    diameter: motor.diameter,
    length: motor.length,
    burnTime: motor.burnTime,
    propellantMass: motor.propellantMass,
    totalMass: motor.totalMass,
    dryMass: motor.dryMass,
    maxThrust: motor.maxThrust,
    thrustCurve: motor.thrustCurve.map((p) => ({ time: p.time, thrust: p.thrust })),
  };
}

/** Full 6-DOF flight via the Rust core (only path). */
export async function simulateFlight(
  vehicle: RocketVehicle,
  motor: MotorSpec,
  options: SixDofOptions = {},
): Promise<SixDofSimulationResult> {
  return getInvoke()<SixDofSimulationResult>('simulate_flight', {
    vehicle: vehicleDto(vehicle),
    motor: motorDto(motor),
    options,
  });
}

/** Monte Carlo dispersion ensemble via the Rust core (only path). */
export async function runEnsemble(
  baseInput: MonteCarloSimInput,
  perturbations: PerturbationSigmas,
  nRuns: number,
  seed: number,
  version: SamplingVersion = 'legacy-sequential-v1',
): Promise<DispersionResult> {
  return getInvoke()<DispersionResult>('run_ensemble', {
    req: {
      vehicle: vehicleDto(baseInput.vehicle),
      motor: motorDto(baseInput.motor),
      options: baseInput.options,
      sigmas: perturbations,
      nRuns,
      seed,
      version,
    },
  });
}

/** APCP chamber equilibrium via the Rust core (only path). */
export async function solveChamber(chamberPressure?: number): Promise<ApcpEquilibrium> {
  return getInvoke()<ApcpEquilibrium>('solve_chamber', {
    pressure: chamberPressure ?? 10_000_000,
  });
}

/** Frozen-flow nozzle isentropics via the Rust core (only path). */
export interface NozzlePerformance {
  ispVac: number;
  ispSea: number;
  cstar: number;
  cfVac: number;
  cfSea: number;
  exitMach: number;
}

export async function nozzlePerformance(
  tc: number,
  gamma: number,
  molWeight: number,
  pc: number,
  pe: number,
  pa: number,
): Promise<NozzlePerformance> {
  return getInvoke()<NozzlePerformance>('nozzle_performance', {
    tc, gamma, molWeight, pc, pe, pa,
  });
}

/** Barrowman stability assembly via the Rust core (only path). */
export async function stabilityOf(vehicle: RocketVehicle): Promise<StabilityAnalysis> {
  return getInvoke()<StabilityAnalysis>('stability', { vehicle: vehicleDto(vehicle) });
}

/** Mach 0–4 drag/CP curves via the Rust core (only path). */
export async function aeroCurvesOf(
  vehicle: RocketVehicle,
  motorBurning = false,
): Promise<AeroCurveResult> {
  return getInvoke()<AeroCurveResult>('aero_curves', {
    vehicle: vehicleDto(vehicle),
    motorBurning,
  });
}

/** Whole-vehicle mass rollup via the Rust core (only path). */
export async function aggregateMassOf(vehicle: RocketVehicle): Promise<VehicleMassRollup> {
  return getInvoke()<VehicleMassRollup>('aggregate_mass', { vehicle: vehicleDto(vehicle) });
}
