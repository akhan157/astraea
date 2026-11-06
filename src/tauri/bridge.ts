/**
 * Astraea compute bridge -- the ONLY runtime engine path.
 *
 * Studios call these functions; they forward to the Rust engine
 * (`crates/astraea-engine`) compiled to WebAssembly and run in background
 * workers (`src/engine`). The website and the desktop shell take this same
 * path, so both compute identical results. The TS `src/` engines are a
 * read-only oracle for parity values, never a runtime path -- there is no TS
 * fallback and no routing flag.
 *
 * Without WebAssembly/Worker support (plain Node, jsdom) every call fails
 * closed with a clear message, so a missing engine can never silently return
 * zero-mass or zero-aero data.
 *
 * Coarse-grained calls only: run_ensemble, run_ensemble_chunk, simulate_flight,
 * solve_chamber, nozzle_performance, ingredient_library,
 * propellant_performance, stability, aero_curves, aggregate_mass. Never
 * per-step serialization. `simulate_flight` is the one bounded exception: the
 * engine returns ONE display telemetry series (<= 5000 decimated points)
 * alongside the coarse metrics, which this bridge forwards unchanged.
 */
import type { RocketVehicle, StabilityAnalysis } from '../core/types';
import type { AeroModelSelection } from '../application/aeroModel';
import type { MotorSpec } from '../propulsion/motorDatabase';
import type { SixDofOptions, SixDofSimulationResult } from '../sim/sixDofSimulator';
import type { MonteCarloSimInput, PerturbationSigmas, DispersionResult, SamplingVersion } from '../sim/monteCarlo';
import type { ClassifiedDispersionResult, MonteCarloChunkResult } from '../sim/monteCarlo';
import type { ApcpEquilibrium } from '../propulsion/nozzleChemistry';
import type { AeroCurveResult } from '../aero/transonicAero';
import type { VehicleMassRollup } from '../core/mass';
import { flightRunOptions } from '../application/caseResolver';
import { engineInvoke, engineInvokeRecorded, type EngineInvoke, type RecordedEngineResult } from '../engine';
import { parseMomentArmHistory } from '../application/momentArmHistory';
import { qualifyGeometryStability } from '../aero/geometryCpSupport';
import type { CandidateInvocation } from '../application/candidate';
import { motorDto, vehicleDto } from './dto';

export { motorDto, vehicleDto } from './dto';

function getInvoke(): EngineInvoke {
  return engineInvoke;
}

/** Run options owned by the vehicle: derived here, never chosen by a caller. */
const DERIVED_RUN_OPTION_KEYS = ['launchAltitudeASL'] as const;

/**
 * Central run layer: every flight and every ensemble run derives its
 * launch-site inputs from the vehicle (`flightRunOptions`), so ANY caller --
 * studios, Console, copilot, workbench -- gets the same site without repeating
 * the derivation. A caller may restate a derived value (identical values are
 * allowed), but a contradictory one is a fail-closed error: the vehicle --
 * not the call site -- decides the altitude.
 */
function deriveRunOptions(
  runLabel: string,
  vehicle: RocketVehicle,
  options: SixDofOptions,
): SixDofOptions {
  const derived = flightRunOptions(vehicle);
  for (const key of DERIVED_RUN_OPTION_KEYS) {
    const given = options[key];
    if (given !== undefined && given !== derived[key]) {
      throw new Error(
        `${runLabel}: options.${key} (${String(given)}) disagrees with the vehicle-derived value ` +
          `(${String(derived[key])}) -- the launch site is derived from the vehicle`,
      );
    }
  }
  return { ...options, ...derived };
}

/** Full 6-DOF flight via the Rust core (only path). */
export async function simulateFlight(
  vehicle: RocketVehicle,
  motor: MotorSpec,
  options: SixDofOptions = {},
  aeroModel?: AeroModelSelection,
): Promise<SixDofSimulationResult> {
  return (await simulateFlightRecorded(vehicle, motor, options, undefined, aeroModel)).value;
}

/** Flight plus the identity captured by its actual invocation. */
export async function simulateFlightRecorded(
  vehicle: RocketVehicle, motor: MotorSpec, options: SixDofOptions = {},
  reportMomentArmHistory?: boolean,
  aeroModel?: AeroModelSelection,
): Promise<RecordedEngineResult<SixDofSimulationResult>> {
  if (reportMomentArmHistory !== undefined && typeof reportMomentArmHistory !== 'boolean') {
    throw new Error('simulateFlight: reportMomentArmHistory must be boolean when present');
  }
  if (aeroModel !== undefined) {
    throw new Error(
      `${aeroModel.modelId} ${aeroModel.modelVersion} drives stability and aero panels in this build; `
        + 'flight coefficients still come from the legacy path. Choose the legacy model to fly.',
    );
  }
  const recorded = await engineInvokeRecorded<SixDofSimulationResult>('simulate_flight', {
    vehicle: vehicleDto(vehicle),
    motor: motorDto(motor),
    options: deriveRunOptions('simulateFlight', vehicle, options),
    ...(reportMomentArmHistory === undefined ? {} : { reportMomentArmHistory }),
  });
  const hasHistory = Object.hasOwn(recorded.value, 'momentArmHistory');
  if (hasHistory !== (reportMomentArmHistory === true)) {
    throw new Error('simulateFlight: requested momentArmHistory missing or unrequested history returned');
  }
  if (!hasHistory) return recorded;
  return { ...recorded, value: { ...recorded.value,
    momentArmHistory: parseMomentArmHistory(recorded.value.momentArmHistory) } };
}

/**
 * Explicit candidate invocation (untagged request or the E1 profile envelope)
 * plus the invocation-bound executable identity.
 */
export async function simulateCandidateRecorded(
  request: CandidateInvocation,
  signal?: AbortSignal,
): Promise<RecordedEngineResult<unknown>> {
  return engineInvokeRecorded<unknown>('simulate_candidate', { request }, { lane: 'interactive', signal });
}

/**
 * The same flight as `simulateFlight`, without the display telemetry: the
 * live preview's call. Interactive lane; `signal` cancels a superseded one.
 */
export async function previewFlight(
  vehicle: RocketVehicle,
  motor: MotorSpec,
  options: SixDofOptions = {},
  signal?: AbortSignal,
): Promise<SixDofSimulationResult> {
  return getInvoke()<SixDofSimulationResult>(
    'flight_summary',
    {
      vehicle: vehicleDto(vehicle),
      motor: motorDto(motor),
      options: deriveRunOptions('previewFlight', vehicle, options),
    },
    { lane: 'interactive', signal },
  );
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
      options: deriveRunOptions('runEnsemble', baseInput.vehicle, baseInput.options),
      sigmas: perturbations,
      nRuns,
      seed,
      version,
    },
  }, { lane: 'batch' });
}

/**
 * Classified whole-ensemble result from the separate engine entry point. The
 * legacy `runEnsemble` contract above is unchanged, including its all-failed
 * error; this path returns the complete ledger even when no run is eligible.
 */
export async function runEnsembleClassified(
  baseInput: MonteCarloSimInput,
  perturbations: PerturbationSigmas,
  nRuns: number,
  seed: number,
  version: SamplingVersion = 'legacy-sequential-v1',
): Promise<ClassifiedDispersionResult> {
  return getInvoke()<ClassifiedDispersionResult>('run_ensemble_classified', {
    req: {
      vehicle: vehicleDto(baseInput.vehicle),
      motor: motorDto(baseInput.motor),
      options: deriveRunOptions('runEnsembleClassified', baseInput.vehicle, baseInput.options),
      sigmas: perturbations,
      nRuns,
      seed,
      version,
    },
  }, { lane: 'batch' });
}

/**
 * One absolute run range of a `per-run-v2` ensemble (S5 background host).
 *
 * A chunk is bit-identical to the same range inside `runEnsemble`, so a host
 * may partition an ensemble to report progress and stop early on cancel
 * without changing the numbers a completed run would produce. The native
 * command refuses `legacy-sequential-v1`, whose RNG stream is order-dependent.
 */
export async function runEnsembleChunk(
  baseInput: MonteCarloSimInput,
  perturbations: PerturbationSigmas,
  nRuns: number,
  seed: number,
  runStart: number,
  runEnd: number,
  version: SamplingVersion = 'per-run-v2',
  signal?: AbortSignal,
): Promise<MonteCarloChunkResult> {
  return (await runEnsembleChunkRecorded(baseInput, perturbations, nRuns, seed, runStart, runEnd, version, signal)).value;
}

/** Chunk plus invocation-bound identity; cancellation stays in the pool. */
export async function runEnsembleChunkRecorded(
  baseInput: MonteCarloSimInput, perturbations: PerturbationSigmas, nRuns: number, seed: number,
  runStart: number, runEnd: number, version: SamplingVersion = 'per-run-v2', signal?: AbortSignal,
): Promise<RecordedEngineResult<MonteCarloChunkResult>> {
  return engineInvokeRecorded<MonteCarloChunkResult>('run_ensemble_chunk', {
    req: {
      vehicle: vehicleDto(baseInput.vehicle),
      motor: motorDto(baseInput.motor),
      options: deriveRunOptions('runEnsembleChunk', baseInput.vehicle, baseInput.options),
      sigmas: perturbations,
      nRuns,
      seed,
      version,
      runStart,
      runEnd,
    },
  }, { lane: 'batch', signal });
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

/** Propellant ingredient (SI: J/mol, kg/m³). Formula maps element → atoms. */
export interface PropellantIngredient {
  id: string;
  name: string;
  formula: Record<string, number>;
  hfJPerMol: number;
  density: number;
  source: string;
}

/** One recipe line: a built-in ingredient id or a custom ingredient; mass or %. */
export type RecipeLine =
  | { ingredientId: string; mass: number }
  | { ingredient: PropellantIngredient; mass: number };

export interface PropellantRequest {
  recipe: RecipeLine[];
  /** Pa. */
  chamberPressure: number;
  /** Pa — give this or `areaRatio`. */
  exitPressure?: number;
  areaRatio?: number;
  /** Pa, default 101 325. */
  ambientPressure?: number;
}

export interface NozzleStation {
  pressure: number;
  temperature: number;
  /** CEA "M" (1/n), kg/kmol. */
  molWeight: number;
  gamma: number;
  cp: number;
  soundSpeed: number;
  velocity: number;
  mach: number;
  density: number;
  /** Ae/At; null in the chamber. */
  areaRatio: number | null;
}

export interface RocketPerformance {
  chamber: NozzleStation;
  throat: NozzleStation;
  exit: NozzleStation;
  cstar: number;
  cf: number;
  cfVac: number;
  cfAmbient: number;
  /** Seconds. */
  isp: number;
  ispVac: number;
  ispAmbient: number;
}

export interface PropellantResult {
  density: number;
  enthalpy: number;
  /** Shifting-equilibrium expansion. */
  equilibrium: RocketPerformance;
  /** Composition frozen at the chamber. */
  frozen: RocketPerformance;
  chamberSpecies: { name: string; moleFraction: number }[];
  exitSpecies: { name: string; moleFraction: number }[];
}

/** Built-in propellant ingredient table via the Rust core (only path). */
export async function ingredientLibrary(): Promise<PropellantIngredient[]> {
  return getInvoke()<PropellantIngredient[]>('ingredient_library');
}

/** Theoretical rocket performance of any recipe via the Rust core (only path). */
export async function propellantPerformance(request: PropellantRequest): Promise<PropellantResult> {
  return getInvoke()<PropellantResult>('propellant_performance', { request });
}

/** Barrowman stability assembly via the Rust core (only path). */
export async function stabilityOf(
  vehicle: RocketVehicle,
  aeroModel?: AeroModelSelection,
): Promise<StabilityAnalysis> {
  return (await stabilityOfRecorded(vehicle, aeroModel)).value;
}

export async function stabilityOfRecorded(
  vehicle: RocketVehicle,
  aeroModel?: AeroModelSelection,
): Promise<RecordedEngineResult<StabilityAnalysis>> {
  const recorded = await engineInvokeRecorded<StabilityAnalysis>(
    'stability',
    aeroModel === undefined
      ? { vehicle: vehicleDto(vehicle) }
      : { vehicle: vehicleDto(vehicle), aeroModel },
  );
  return { ...recorded, value: qualifyGeometryStability(recorded.value) };
}

/** Mach 0–4 drag/CP curves via the Rust core (only path). */
export async function aeroCurvesOf(
  vehicle: RocketVehicle,
  motorBurning = false,
  aeroModel?: AeroModelSelection,
): Promise<AeroCurveResult> {
  return getInvoke()<AeroCurveResult>('aero_curves', {
    vehicle: vehicleDto(vehicle),
    motorBurning,
    ...(aeroModel === undefined ? {} : { aeroModel }),
  });
}

/** Scoped pre-run status for a selected aero model (panels vs flight). */
export interface AeroModelStatus {
  panels: 'supported' | 'fallback' | 'refused';
  flight: 'supported' | 'fallback' | 'refused';
  reasons: string[];
  assumptions: string[];
}

export async function aeroModelStatusOf(
  vehicle: RocketVehicle,
  aeroModel: AeroModelSelection,
): Promise<AeroModelStatus> {
  return getInvoke()<AeroModelStatus>('aero_model_status', {
    vehicle: vehicleDto(vehicle),
    aeroModel,
  });
}

/** Whole-vehicle mass rollup via the Rust core (only path). */
export async function aggregateMassOf(vehicle: RocketVehicle): Promise<VehicleMassRollup> {
  return getInvoke()<VehicleMassRollup>('aggregate_mass', { vehicle: vehicleDto(vehicle) });
}
