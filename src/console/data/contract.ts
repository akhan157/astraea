/**
 * UI data contract for the Console shell.
 *
 * Screens read only these shapes; `adapter.ts` builds every one of them from
 * native engine output over the Tauri bridge (`src/tauri/bridge.ts`). There is
 * no mock layer: a quantity the engine does not produce has no representation
 * here at all, and a level the engine cannot justify is reported as
 * `unknown` with the factual reason.
 */
import type { SixDofTelemetryPoint } from '../../sim/sixDofSimulator';
import type { EngineIdentity } from '../../engine/identity';
import type { DispatchedPhysicsOptions } from '../../application/caseResolver';
import type { DragCalibration } from '../../application/dragCalibration';
import type {
  DispersionStatistics,
  DispersionResult,
  IndexedLanding,
  MonteCarloOutcomeCounts,
  MonteCarloRunOutcome,
} from '../../sim/monteCarlo';

export type Confidence = 'measured' | 'calibrated' | 'modeled' | 'extrapolated' | 'unknown';

export interface Result<T = number> {
  value: T;
  /** SI unit on the wire; the UI converts for display. */
  unit: string;
  confidence: Confidence;
  /** Why this level was assigned, in plain language. */
  reason?: string;
}

/**
 * One rule, four outcomes: `pass`, `fail`, `unknown` (an input or the engine's
 * own qualification is missing) and `invalid` (the engine marked the run
 * itself as failed, so the check cannot be judged). `caution` meets the
 * requirement but is worth a look (more stability than needed: safe, but the
 * rocket turns into the wind). `n/a` is a check that does not apply to this
 * vehicle (no fins, say).
 */
export type GateStatus = 'pass' | 'caution' | 'fail' | 'unknown' | 'invalid' | 'n/a';
export interface Gate {
  id: string;
  label: string;
  stage: 'aero' | 'flight' | 'recovery';
  status: GateStatus;
  value: Result;
  threshold: string;
  reason: string;
  /** What to change, pointing the same way as the result; absent when nothing needs changing. */
  advice?: string;
  /** Stage to fix it in, when it differs from the check's default. */
  fixStage?: 'mission' | 'airframe' | 'motor' | 'aero' | 'flight' | 'recovery';
  /** Verdict text shown in place of the number (run validity reads "Valid", not a duration). */
  display?: string;
}

export type FlightEventKind = 'ignition' | 'rail_exit' | 'burnout' | 'max_q' | 'apogee_drogue' | 'main' | 'touchdown';
export interface FlightEvent {
  t: number;
  kind: FlightEventKind;
  label: string;
  altitude: number;
  velocity: number;
  derived?: boolean;
}

export type ChannelId = 'altitude' | 'airspeed' | 'mach' | 'aoa' | 'q' | 'accel' | 'thrust' | 'drag' | 'mass';
export interface Series {
  t: number[];
  channels: Record<ChannelId, Result<number[]>>;
  attitude: SixDofTelemetryPoint['q'][];
  position: SixDofTelemetryPoint['position'][];
}

export type Validity = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';
export interface RunSummary {
  validity: Validity;
  enveloped: boolean;
  /** Native `off_nominal = saw_unsupported || saw_extrapolated`; it already feeds validity. Historical saved records without it stay unknown. */
  offNominalExcursion: boolean;
  apogee: Result;
  apogeeTime: Result;
  maxSpeed: Result;
  maxMach: Result;
  maxAccelG: Result;
  /** Largest valid bounded native display sample only. Sampling/decimation can miss the continuous-time peak without a finite bound; nonterminal rounding may overshoot it. */
  maxQ?: Result;
  railExitSpeed: Result;
  burnoutAltitude: Result;
  landingSpeed: Result;
  landingEnergy: Result;
  drift: Result;
  flightTime: Result;
  /** Air-relative incidence at rail exit (deg). */
  weathercockAngleDeg: Result;
  landingNominal: boolean;
}

export interface StabilityRow {
  partId: string;
  name: string;
  type: string;
  mass: Result;
  cg: Result;
  cnAlpha: Result;
  cp?: Result;
  contributionPct: number;
}

export interface StabilityBreakdown {
  rows: StabilityRow[];
  cg: Result;
  cp: Result;
  margin: Result;
  /** Same geometry margin converted using the native reference diameter and length. */
  marginPercentLength?: Result;
  totalMass: Result;
  length: number;
  refDiameter: number;
  notes: string[];
  /** Engine contributions with the axial extents the 3D/2D views lay out from. */
  parts: { id: string; axialStart: number; axialEnd: number; cg: number; mass: number }[];
}

export interface FlutterPoint { t: number; airspeed: number; flutterSpeed: number; margin: number }

export interface FlutterHistory {
  finSetId: string;
  finSetName: string;
  points: FlutterPoint[];
  worst: { t: number; margin: Result; airspeed: number; flutterSpeed: number };
  /** Sea-level single-point value, as the engine reports it today. */
  seaLevelFlutterSpeed: Result;
  shearModulus: Result;
  disclaimer: string;
  /** Display-sample provenance and the applicable atmosphere. */
  provenance: string;
}

export interface LandingPoint { x: number; y: number }
export interface Dispersion {
  normalLawId?: DispersionResult['normalLawId'];
  boattailPolicy?: DispersionResult['boattailPolicy'];
  finInterferenceId?: DispersionResult['finInterferenceId'];
  /** Invocation-bound runtime metadata; absent on legacy records. */
  engineIdentity?: EngineIdentity;
  /** Legacy meaning: every finite endpoint in absolute run-index order. */
  landings: LandingPoint[];
  mean: LandingPoint;
  sigma1: number;
  sigma2: number;
  thetaDeg: number;
  r50: number;
  r90: number;
  r99: number;
  /** Legacy meaning: finite endpoints (all `landings`). */
  ok: number;
  /** Legacy meaning: computational failures only. */
  failed: number;
  /** Set when the ensemble ran with the project's drag calibration. */
  dragCalibration?: DragCalibration;
  /**
   * The physics options this run actually sent beyond the console's own
   * allowlist (site temperature, back-pressure nozzle, built-up drag source).
   * Absent when none was set, so default results render exactly as before.
   */
  physicsOptions?: DispatchedPhysicsOptions;
  /** Engine's axial-drag source line; present only on a completed dispersion. */
  axialDrag?: string;
  /** classified-v1 ledger; absent on legacy records. */
  runs?: MonteCarloRunOutcome[];
  counts?: MonteCarloOutcomeCounts;
  endpoints?: IndexedLanding[];
  eligibleEndpoints?: IndexedLanding[];
  statisticsAvailable?: boolean;
  statistics?: DispersionStatistics | null;
  outcomePolicy?: 'classified-v1';
}

export type JobState = 'running' | 'done' | 'cancelled' | 'failed';
export interface Job<T> {
  id: string;
  label: string;
  state: JobState;
  progress: number;
  done: number;
  total: number;
  partial?: T;
  error?: string;
  startedAt: number;
}

/** One completed 6-DOF run, converted from the native result DTO. */
export interface FlightRun {
  /** Invocation-bound runtime metadata; absent on legacy records. */
  engineIdentity?: EngineIdentity;
  /** Design (project) revision the run flew; a save counter, not a run count. */
  rev: number;
  /** Run number in this document ("Run #3"), separate from the design revision; absent on older records. */
  runNumber?: number;
  at: number;
  /** Content key of the inputs this run was issued against. */
  inputKey: string;
  summary: RunSummary;
  /** How the engine's loop ended: touched down, or stopped on its time limit. */
  terminationReason?: 'touchdown' | 'timeout';
  events: FlightEvent[];
  telemetry: SixDofTelemetryPoint[];
  series: Series;
  /** Bookkeeping for returned display samples only; supplies no continuous-peak magnitude or timing error bound. */
  sampledMaxQ?: {
    time: number;
    sampleCount: number;
    validSampleCount: number;
    /** Absent for fewer than two samples or invalid/unordered timestamps. */
    maxObservedGapS?: number;
  };
  flutter?: FlutterHistory;
  gates: Gate[];
  /** Same invocation-bound raw sampled model output; absent on old runs. */
  momentArmHistory?: import('../../application/momentArmHistory').MomentArmHistory;
  /** Engine run manifest, shown in the Build pre-export check and trace file. */
  manifest: Record<string, string>;
  /**
   * The physics options this run actually sent beyond the console's own
   * allowlist. Derived from the vehicle at conversion time; absent when none
   * was set, so a default run renders exactly as it did before this bundle.
   */
  physicsOptions?: DispatchedPhysicsOptions;
  durationMs: number;
  /** Set when this run's drag was scaled by the project's calibration; every aero-driven number then reads Calibrated. */
  dragCalibration?: DragCalibration;
}
