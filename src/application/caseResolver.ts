/**
 * UI2 S1 — shared case/run foundation: case resolver, motor binding,
 * common preflight, immutable snapshots, and result identity.
 *
 * This module is the single authority that turns user-level flight inputs
 * (vehicle + motor id + launch options) into an immutable, content-addressed
 * snapshot. Every run path (nominal, Monte Carlo, evidence comparison) must
 * resolve through here so identical physical inputs always produce identical
 * run keys — a same-ID motor edit changes the key (content identity, never
 * the bare id), and an unresolvable motor is an explicit error, never a
 * silent fallback to another motor. Monte-Carlo runs additionally capture
 * the ensemble (run count, sigmas, wind dependency, sounding profile) into
 * `mcKey` — the complete dependency identity that freshness derives from
 * everywhere (Astra P0-1).
 *
 * Mount rules mirror the Round-19 FlightSim prefilter exactly: one flagged
 * mount constrains the bore (innerDiameter, else outer − 3 mm); zero mounts
 * is the disclosed aft-end fallback (no constraint); two or more mounts is
 * ambiguity; a solid tube seats nothing. A motor seats when its diameter
 * fits the bore and at least 50% of its length is retained by the mount.
 */

import type { BodyTubeComponent, RocketVehicle } from '../core/types';
import type { DragCalibration } from './dragCalibration';
import { aeroModelKey, type AeroModelSelection } from './aeroModel';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { CERTIFIED_MOTORS, validateMotorSpec } from '../propulsion/motorDatabase';
import { resolveRecoveryChutes } from '../sim/parachuteRoles';

/** Launch options carried by a case (mirror of the FlightSim run inputs). */
export interface LaunchOptions {
  railLengthM: number;
  railElevationDeg: number;
  railAzimuthDeg: number;
  windSpeedMps: number;
  windAzimuthDeg: number;
  finCantDeg: number;
  mainDeployAltitudeM: number;
}

/** Minimal structural wind-layer record (avoids a sim→application import). */
export interface WindLayerSnapshot {
  altitudeM: number;
  speedMs: number;
  directionFromDeg: number;
  tempC: number;
  pressureHpa: number;
}

/**
 * Everything Monte-Carlo consumes beyond the flight case, captured verbatim
 * so run identity covers the complete dependency set (Astra P0-1): run
 * count, perturbation sigmas, and the full wind dependency (probe altitude,
 * manual shear rows, AND the fetched sounding profile).
 */
export interface McEnsembleInput {
  /** Clamped run count actually executed (1..200). */
  nRuns: number;
  windAzimuthDegSigma: number;
  railAngleDegSigma: number;
  impulsePctSigma: number;
  /** Complete captured wind dependency; empty sounding = manual table drive. */
  wind: {
    probeAltitudeM: number;
    windRows: ReadonlyArray<{ altitudeM: number; speedMs: number; directionFromDeg: number }>;
    soundingStatus: 'idle' | 'loading' | 'ok' | 'error';
    soundingLayers: ReadonlyArray<WindLayerSnapshot>;
  };
}

/** User-level flight case: committed engineering inputs, not results. */
export interface LaunchCase {
  vehicle: RocketVehicle;
  /** Motor reference by id; the binding pins content, not this string. */
  motorId: string;
  options: LaunchOptions;
  /**
   * Drag calibration applied to this project, when any. It scales the airframe
   * drag of every run, so it is part of the case identity: applying, changing
   * or removing it changes `runKey`. Absent keeps the pre-calibration keys.
   */
  dragCalibration?: DragCalibration;
  /**
   * Aerodynamic model selection for this run. Absent keeps the legacy path
   * and the pre-port run keys; a present selection joins the case identity so
   * changing the model (or its term sources) changes `runKey`.
   */
  aeroModel?: AeroModelSelection;
  /** Ensemble methodology + captured wind dependency (Monte-Carlo paths only). */
  ensemble?: McEnsembleInput;
  /**
   * Run identity only: set when this run flies the K3 built-up DEFAULT (the vehicle
   * made no drag choice). A result computed before the default existed has the same
   * vehicle and options, so without this it would read as current. Absent for an
   * explicit choice (the vehicle already carries it) and for the calibration fit key,
   * so no existing key and no recorded fit identity moves.
   */
  defaultDragSource?: 'built-up';
}

/**
 * Engine run options derived from the vehicle: the launch site elevation, the
 * pad air temperature and the flight back-pressure nozzle. The vehicle is the
 * single owner of all three; a caller may restate an identical value but never
 * choose a different one (see the bridge's derived-key check).
 *
 * An absent site passes nothing and the engine keeps its defaults (sea level,
 * standard day). A nozzle declared for an explicit drag choice is NOT a flight
 * option: it becomes one only with `vehicle.nozzleBackPressureThrust`. Under
 * the default (no explicit drag choice) a declared nozzle exit is carried as
 * the back-pressure option, because it is one of the inputs the improved model
 * was measured with (spec Amendment 4).
 */
export interface FlightRunOptions {
  launchAltitudeASL?: number;
  launchSiteTemperatureC?: number;
  nozzleExitDiameter?: number;
  flightDragSource?: 'calibrated';
}

/** The physics options this bundle adds, exactly as dispatched. */
export type DispatchedPhysicsOptions = Omit<FlightRunOptions, 'launchAltitudeASL'>;

/**
 * The axial-drag source a flight of this vehicle asks the engine for: the one
 * place that turns the vehicle's `flightDragSource` choice into the engine
 * option (K3: the improved model is the default).
 *
 * - absent: the **default**, built-up drag (`'calibrated'`). A project or
 *   archive written before this default existed carries no field, so a re-run
 *   of an old project now flies the new default; its recorded runs are not
 *   rewritten (see `preSwitchFlightRunOptions`).
 * - `'calibrated'`: the old explicit opt-in, unchanged.
 * - `'legacy'`: the explicit old choice, the legacy tables.
 *
 * Every reader of the vehicle field goes through this.
 */
export function effectiveFlightDragSource(vehicle: Pick<RocketVehicle, 'flightDragSource'>): 'calibrated' | undefined {
  return vehicle.flightDragSource === 'legacy' ? undefined : 'calibrated';
}

/**
 * The drag choice a flight of this project really uses: the vehicle's own choice,
 * except that a project whose drag calibration is ACTIVE (its scale rides the
 * dispatch) and which made no explicit choice stays on the **legacy** tables. A
 * calibration scale is fitted against the legacy drag model only, so it must never
 * multiply the built-up default.
 *
 * `activeCalibration` is the calibration whose scale this run really carries, i.e.
 * `activeCalibration(resolveCalibrationApplicability(...))`, or the scale that rides
 * the dispatch; it is never inspected, only its presence matters. A retained but
 * INACTIVE artifact (fit inputs or model binding no longer match, so its scale is
 * excluded) is history: it must not be passed here and changes no flight physics.
 * An explicit choice always wins, including the old explicit `'calibrated'` opt-in,
 * which already allowed a scale on top.
 */
export function resolvedDragChoice(
  vehicle: Pick<RocketVehicle, 'flightDragSource'>,
  activeCalibration: unknown,
): RocketVehicle['flightDragSource'] {
  return vehicle.flightDragSource === undefined && activeCalibration !== undefined ? 'legacy' : vehicle.flightDragSource;
}

/**
 * The vehicle with that choice written in, or the same object when nothing
 * changes. It is derived at the dispatch boundary and never stored in the
 * project, so the calibration's recorded fit identity (computed on the stored
 * vehicle) does not move.
 */
export function withResolvedDragChoice(vehicle: RocketVehicle, activeCalibration: unknown): RocketVehicle {
  const choice = resolvedDragChoice(vehicle, activeCalibration);
  return choice === vehicle.flightDragSource ? vehicle : { ...vehicle, flightDragSource: choice };
}

/**
 * The vehicle a dispatch really flies, resolved ONCE per dispatch and reused for
 * the engine request, the admission rule and the recorded metadata, so they cannot
 * disagree. The signal is the active calibration the caller passes, or else a
 * drag-scale option other than 1 (the scale of an active calibration). Idempotent:
 * an already-resolved vehicle comes back unchanged.
 */
export function dispatchVehicle(
  vehicle: RocketVehicle,
  options: { dragCdScale?: number },
  activeCalibration?: unknown,
): RocketVehicle {
  const scaled = options.dragCdScale !== undefined && options.dragCdScale !== 1 ? options.dragCdScale : undefined;
  return withResolvedDragChoice(vehicle, activeCalibration ?? scaled);
}

/** The engine's supported flight nozzle-exit domain, metres (`NOZZLE_EXIT_DIAMETER_MAX_M`, six_dof.rs). */
export const NOZZLE_FLIGHT_EXIT_MAX_M = 1.0;

/**
 * True when the K3 default would carry a declared nozzle exit as the back-pressure
 * option by itself: no drag choice, a nozzle exit inside the engine's flight domain
 * (0 to 1 m, so a larger imported value cannot make the default flight fail) and no
 * explicit back-pressure choice. `nozzleBackPressureThrust: false` is that explicit
 * "off"; `true` is the old explicit "on", which keeps its rule for every drag choice.
 */
export function defaultCarriesNozzle(vehicle: RocketVehicle): boolean {
  return vehicle.flightDragSource === undefined && vehicle.nozzleBackPressureThrust === undefined
    && nozzleInFlightDomain(vehicle);
}

/** A declared nozzle exit inside the engine's supported flight domain (0 to 1 m). */
export function nozzleInFlightDomain(vehicle: RocketVehicle): boolean {
  const d = vehicle.nozzleExitDiameter;
  return d !== undefined && Number.isFinite(d) && d >= 0 && d <= NOZZLE_FLIGHT_EXIT_MAX_M;
}

/** Does a flight of this (resolved) vehicle send the back-pressure nozzle option? The checkbox shows exactly this. */
export function backPressureNozzleActive(vehicle: RocketVehicle): boolean {
  return flightRunOptions(vehicle).nozzleExitDiameter !== undefined;
}

function physicsOptionsFor(vehicle: RocketVehicle, defaultSwitch: boolean): FlightRunOptions {
  const site = vehicle.launchSite;
  const flightDragSource = defaultSwitch ? effectiveFlightDragSource(vehicle) : (vehicle.flightDragSource === 'calibrated' ? 'calibrated' : undefined);
  const nozzle = vehicle.nozzleExitDiameter !== undefined
    && (vehicle.nozzleBackPressureThrust === true || (defaultSwitch && defaultCarriesNozzle(vehicle)));
  return {
    ...(site === undefined ? {} : { launchAltitudeASL: site.altitudeM }),
    ...(site?.temperatureC === undefined ? {} : { launchSiteTemperatureC: site.temperatureC }),
    ...(nozzle ? { nozzleExitDiameter: vehicle.nozzleExitDiameter } : {}),
    ...(flightDragSource === undefined ? {} : { flightDragSource }),
  };
}

export function flightRunOptions(vehicle: RocketVehicle): FlightRunOptions {
  return physicsOptionsFor(vehicle, true);
}

/**
 * The derivation that was in force before the default switch: an absent field
 * meant legacy tables and the nozzle option followed only the flag. Archive
 * validation uses it for archived runs that carry no drag option, so recorded
 * runs from earlier builds keep loading exactly as recorded.
 */
export function preSwitchFlightRunOptions(vehicle: RocketVehicle): FlightRunOptions {
  return physicsOptionsFor(vehicle, false);
}

/** Shared capture/dispatch guard: callers may only restate vehicle-owned inputs. */
export function assertVehicleRunOptions(label: string, vehicle: RocketVehicle, options: Omit<FlightRunOptions, 'flightDragSource'> & { flightDragSource?: string }): void {
  const derived = flightRunOptions(vehicle);
  for (const key of ['launchAltitudeASL', 'launchSiteTemperatureC', 'nozzleExitDiameter', 'flightDragSource'] as const) {
    if (options[key] !== undefined && options[key] !== derived[key]) {
      throw new Error(`${label}: options.${key} (${String(options[key])}) disagrees with the vehicle-derived value (${String(derived[key])}) -- the launch site is derived from the vehicle`);
    }
  }
}

/**
 * The additive physics options a run actually sent, absent when none was set.
 * Display code reads this instead of guessing from engine prose, so a default
 * project renders exactly as it did before this bundle.
 */
export function physicsOptionsOf(vehicle: RocketVehicle): DispatchedPhysicsOptions {
  const { launchAltitudeASL: _altitude, ...physics } = flightRunOptions(vehicle);
  return physics;
}

/** True when at least one physics option of this bundle was dispatched. */
export function hasPhysicsOptions(options: DispatchedPhysicsOptions): boolean {
  return Object.values(options).some((value) => value !== undefined);
}

/**
 * One-line launch-site identity for run summaries (manifests, record labels,
 * overlay notes). Absent site reads as the established default.
 */
export function describeLaunchSite(vehicle: RocketVehicle): string {
  const site = vehicle.launchSite;
  if (site === undefined) return 'sea level, standard day';
  const temperature = site.temperatureC === undefined ? '' : `, ${site.temperatureC} °C`;
  return `${site.altitudeM} m ASL${temperature}`;
}

export type MotorResolution =
  | { status: 'resolved'; motor: MotorSpec }
  | { status: 'unresolved'; motorId: string };

export interface MountAssessment {
  mounts: BodyTubeComponent[];
  boreM: number | null;
  solidMount: boolean;
  ambiguous: boolean;
}

export interface PreflightIssue {
  code:
    | 'motor-unresolved'
    | 'motor-invalid'
    | 'mount-ambiguous'
    | 'mount-solid'
    | 'motor-excluded'
    | 'input-nonfinite'
    | 'parachute-roles';
  severity: 'error';
  message: string;
  /** Where the user repairs this: studio surface + target description. */
  repair: { studio: 'propulsion' | 'airframe' | 'trajectory'; target: string };
}

export interface ResolvedCase {
  case: LaunchCase;
  motor: MotorSpec;
  mounts: MountAssessment;
  issues: PreflightIssue[];
  /** True when no error issue blocks a run. */
  runnable: boolean;
}

/** Immutable, content-addressed record of resolved run inputs. */
export interface RunSnapshot {
  /** CASE identity: vehicle geometry + FULL motor content + launch options. */
  readonly runKey: string;
  /**
   * COMPLETE dependency identity (Astra P0-1): the case key plus the captured
   * ensemble (run count, sigmas, wind dependency, sounding profile). Freshness
   * of an MC result derives from this key, so a wind/sigma/count edit stales
   * every surface at once. Equals `runKey` when the run carried no ensemble.
   */
  readonly mcKey: string;
  readonly vehicleId: string;
  readonly motorContentKey: string;
  /** Content key of the vehicle geometry (same-id edit detection). */
  readonly vehicleContentKey: string;
  readonly options: Readonly<LaunchOptions>;
  /** Content key of the launch options (rail / derived wind / deploy). */
  readonly optionsKey: string;
  /** Content key of the drag calibration, or null for the model's own drag. */
  readonly calibrationKey: string | null;
  /** `'built-up'` when the run flew the K3 default drag, else null. */
  readonly defaultDragSource: 'built-up' | null;
  /** Aerodynamic model selection, or null for the legacy model path. */
  readonly aeroModel: AeroModelSelection | null;
  /** Content key of the aerodynamics selection, or null for the legacy path. */
  readonly aeroModelKey: string | null;
  /** Ensemble methodology captured with the run, when the path is MC. */
  readonly ensemble?: Readonly<McEnsembleInput>;
  /** Content key of the captured wind dependency (why-diffs). */
  readonly ensembleWindKey?: string;
  /** Content key of run count + sigmas (why-diffs). */
  readonly ensemblePerturbationKey?: string;
  /** Canonical case serialization the runKey was derived from. */
  readonly canonical: string;
  /** Canonical ensemble serialization the mcKey was derived from. */
  readonly mcCanonical?: string;
}

/**
 * Resolve a motor id against the certified catalog overlaid with custom
 * imports (custom records win on id collision — the store's merge order).
 * An unknown id is unresolved; callers must not substitute another motor.
 */
export function resolveMotor(
  motorId: string,
  customMotors: Record<string, MotorSpec>
): MotorResolution {
  const catalog: Record<string, MotorSpec> = { ...CERTIFIED_MOTORS, ...customMotors };
  const motor = catalog[motorId];
  if (!motor) return { status: 'unresolved', motorId };
  return { status: 'resolved', motor };
}

/**
 * Content identity of a motor record: every physical field except the id.
 * Editing a curve under the same id MUST change this key (D03).
 */
export function motorContentKey(motor: MotorSpec): string {
  const { id: _id, ...content } = motor;
  return hashHex(stableStringify(content));
}

/** Pure mount assessment; same rules as the FlightSim prefilter. */
export function assessMounts(vehicle: RocketVehicle): MountAssessment {
  const mounts = vehicle.components.filter(
    (c): c is BodyTubeComponent => c.type === 'bodytube' && c.isMotorMount === true
  );
  if (mounts.length === 1) {
    const raw = mounts[0].innerDiameter ?? Math.max(0, mounts[0].outerDiameter - 0.003);
    const boreM = raw > 0 ? raw : null;
    return { mounts, boreM, solidMount: raw <= 0, ambiguous: false };
  }
  return { mounts, boreM: null, solidMount: false, ambiguous: mounts.length > 1 };
}
/** Why motor `m` cannot seat on this vehicle, or null if it can. */
export function reasonMotorExcluded(mounts: MountAssessment, m: MotorSpec): string | null {
  const mount = mounts.mounts[0];
  if (!mount) return null; // aft-end fallback: no bore constraint
  if (mounts.solidMount || mounts.boreM === null) {
    return `mount '${mount.name}' is a solid tube (no bore) — no motor can be seated`;
  }
  if (m.diameter > mounts.boreM) {
    return (
      `motor ⌀${(m.diameter * 1000).toFixed(0)} mm exceeds mount '${mount.name}' ` +
      `bore ⌀${(mounts.boreM * 1000).toFixed(0)} mm`
    );
  }
  const overlap = Math.min(m.length, mount.length);
  if (overlap < 0.5 * m.length) {
    return (
      `motor length ${(m.length * 1000).toFixed(0)} mm is not retained by mount ` +
      `'${mount.name}' (needs >= 50% of ${(mount.length * 1000).toFixed(0)} mm)`
    );
  }
  return null;
}

const OPTION_FIELDS: Array<{ key: keyof LaunchOptions; label: string }> = [
  { key: 'railLengthM', label: 'rail length' },
  { key: 'railElevationDeg', label: 'rail elevation' },
  { key: 'railAzimuthDeg', label: 'rail azimuth' },
  { key: 'windSpeedMps', label: 'wind speed' },
  { key: 'windAzimuthDeg', label: 'wind azimuth' },
  { key: 'finCantDeg', label: 'fin cant' },
  { key: 'mainDeployAltitudeM', label: 'main deploy altitude' },
];

/**
 * Common preflight: every run path agrees on these gates before starting
 * work. Returns all issues; `runnable` is true only with zero errors.
 */
export function preflight(
  launchCase: LaunchCase,
  customMotors: Record<string, MotorSpec>
): ResolvedCase {
  const issues: PreflightIssue[] = [];
  const mounts = assessMounts(launchCase.vehicle);

  const resolution = resolveMotor(launchCase.motorId, customMotors);
  let motor: MotorSpec | null = null;
  if (resolution.status === 'unresolved') {
    issues.push({
      code: 'motor-unresolved',
      severity: 'error',
      message: `motor '${launchCase.motorId}' is not in the catalog — assign a resolved motor, never a fallback`,
      repair: { studio: 'propulsion', target: 'motor assignment' },
    });
  } else {
    motor = resolution.motor;
    try {
      validateMotorSpec(motor);
    } catch (err) {
      issues.push({
        code: 'motor-invalid',
        severity: 'error',
        message: `motor '${motor.designation}' is invalid: ${(err as Error).message}`,
        repair: { studio: 'propulsion', target: 'motor editor' },
      });
      motor = null;
    }
  }

  if (mounts.ambiguous) {
    const names = mounts.mounts.map((m) => `'${m.name}'`).join(', ');
    issues.push({
      code: 'mount-ambiguous',
      severity: 'error',
      message: `multiple motor mounts flagged (${names}) — flag exactly one mount tube`,
      repair: { studio: 'airframe', target: 'motor mount flag' },
    });
  } else if (mounts.mounts.length === 1 && mounts.solidMount) {
    issues.push({
      code: 'mount-solid',
      severity: 'error',
      message: `mount '${mounts.mounts[0].name}' is a solid tube (no bore) — no motor can be seated`,
      repair: { studio: 'airframe', target: 'mount geometry' },
    });
  } else if (motor) {
    const exclusion = reasonMotorExcluded(mounts, motor);
    if (exclusion) {
      issues.push({
        code: 'motor-excluded',
        severity: 'error',
        message: exclusion,
        repair: { studio: 'propulsion', target: 'motor assignment' },
      });
    }
  }

  // Two chutes declaring one role: the engine refuses to choose between them
  // (`recovery_chutes`), so say so before dispatch instead of after a failed run.
  const chutes = resolveRecoveryChutes(launchCase.vehicle.components);
  if (!chutes.ok) {
    issues.push({
      code: 'parachute-roles',
      severity: 'error',
      message: chutes.clash === undefined
        ? chutes.reason
        : `${chutes.clash.chutes[0].name} and ${chutes.clash.chutes[1].name} are both set as the ${chutes.clash.role} parachute; a flight opens one ${chutes.clash.role}. Set one of them to the other role or to Automatic`,
      repair: { studio: 'airframe', target: 'parachute roles' },
    });
  }

  for (const { key, label } of OPTION_FIELDS) {
    const value = launchCase.options[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push({
        code: 'input-nonfinite',
        severity: 'error',
        message: `${label} must be a finite number, got '${String(value)}'`,
        repair: { studio: 'trajectory', target: label },
      });
    }
  }

  return {
    case: launchCase,
    motor: motor ?? CERTIFIED_PLACEHOLDER,
    mounts,
    issues,
    runnable: issues.length === 0,
  };
}

/**
 * Placeholder motor carried on unresolvable cases so the resolved shape is
 * total. It MUST NOT be run: `runnable` is false whenever it is present
 * (an unresolved or invalid motor always raises an issue above).
 */
const CERTIFIED_PLACEHOLDER: MotorSpec = CERTIFIED_MOTORS.estes_c6;

/**
 * Freeze resolved inputs into an immutable snapshot. The run key is the
 * hash of the canonical serialization of vehicle geometry, FULL motor
 * content, and launch options — never bare ids — so any physical change
 * (including a same-id motor edit) produces a new key. The mcKey folds the
 * captured Monte-Carlo ensemble (run count, sigmas, wind dependency,
 * sounding profile) into the identity: it is the freshness key — everywhere.
 */
export function snapshotCase(resolved: ResolvedCase): RunSnapshot {
  const { id: _id, ...motorContent } = resolved.motor;
  const calibration = resolved.case.dragCalibration;
  const aeroModel = resolved.case.aeroModel;
  const canonical = stableStringify({
    vehicle: resolved.case.vehicle,
    motor: motorContent,
    options: resolved.case.options,
    // Absent when uncalibrated, so keys of existing results do not move.
    ...(calibration === undefined ? {} : { dragCalibration: calibration }),
    // Absent for the legacy model path, so pre-port keys do not move.
    ...(aeroModel === undefined ? {} : { aeroModel }),
    // Absent for an explicit drag choice, so those keys do not move.
    ...(resolved.case.defaultDragSource === undefined ? {} : { defaultDragSource: resolved.case.defaultDragSource }),
  });
  const ensemble = resolved.case.ensemble;
  const mcCanonical = ensemble === undefined ? undefined : stableStringify(ensemble);
  // Case identity stays ensemble-free (runKey): the SimFlight-overlay
  // re-derivation compares case inputs; freshness (mcKey) is the full key.
  const snapshot: RunSnapshot = {
    runKey: hashHex(canonical),
    mcKey:
      ensemble === undefined
        ? hashHex(canonical)
        : hashHex(JSON.stringify([canonical, mcCanonical])),
    vehicleId: resolved.case.vehicle.id,
    motorContentKey: motorContentKey(resolved.motor),
    vehicleContentKey: hashHex(stableStringify(resolved.case.vehicle)),
    optionsKey: hashHex(stableStringify(resolved.case.options)),
    calibrationKey: calibration === undefined ? null : hashHex(stableStringify(calibration)),
    defaultDragSource: resolved.case.defaultDragSource ?? null,
    aeroModel: aeroModel === undefined ? null : Object.freeze(aeroModel),
    aeroModelKey: aeroModel === undefined ? null : aeroModelKey(aeroModel),
    options: Object.freeze({ ...resolved.case.options }),
    canonical,
    ...(ensemble === undefined
      ? {}
      : {
          ensemble: deepFreezeEnsemble(ensemble),
          ensembleWindKey: hashHex(stableStringify(ensemble.wind)),
          ensemblePerturbationKey: hashHex(
            stableStringify({
              nRuns: ensemble.nRuns,
              windAzimuthDegSigma: ensemble.windAzimuthDegSigma,
              railAngleDegSigma: ensemble.railAngleDegSigma,
              impulsePctSigma: ensemble.impulsePctSigma,
            }),
          ),
          mcCanonical,
        }),
  };
  return Object.freeze(snapshot);
}

/** Deep-freeze the captured ensemble so historical payloads never mutate. */
function deepFreezeEnsemble(ensemble: McEnsembleInput): Readonly<McEnsembleInput> {
  const windRows = Object.freeze(ensemble.wind.windRows.map((r) => Object.freeze({ ...r })));
  return Object.freeze({
    ...ensemble,
    wind: Object.freeze({
      ...ensemble.wind,
      windRows,
      soundingLayers: Object.freeze(ensemble.wind.soundingLayers.map((l) => Object.freeze({ ...l }))),
    }),
  });
}

/** Dependency-section identities, for exposing WHY a run went stale. */
export type SnapshotSection =
  | 'vehicle'
  | 'motor'
  | 'ensemble-wind'
  | 'ensemble-perturbation'
  | 'calibration'
  | 'drag-source'
  | 'aero-model'
  | 'options';

/**
 * First captured section that changed between `stored` (run-time capture)
 * and `current` (live capture), or null when the identities match. The
 * wind dependency is detected before derived launch options so a wind-edit
 * reports the true cause, not the derived wind slot it flows into.
 */
export function snapshotDivergence(
  current: RunSnapshot,
  stored: RunSnapshot,
): SnapshotSection | null {
  if (stored.mcKey === current.mcKey) return null;
  if (stored.vehicleContentKey !== current.vehicleContentKey) return 'vehicle';
  if (stored.motorContentKey !== current.motorContentKey) return 'motor';
  if (stored.calibrationKey !== current.calibrationKey) return 'calibration';
  if (stored.defaultDragSource !== current.defaultDragSource) return 'drag-source';
  if (stored.aeroModelKey !== current.aeroModelKey) return 'aero-model';
  if (stored.ensembleWindKey !== current.ensembleWindKey) return 'ensemble-wind';
  if (stored.ensemblePerturbationKey !== current.ensemblePerturbationKey) {
    return 'ensemble-perturbation';
  }
  if (stored.optionsKey !== current.optionsKey) return 'options';
  // All sections match yet the full key differs (mixed ensemble capture):
  // attribute to the derived options rather than guessing.
  return 'options';
}

/** Human-readable reason for a divergence section (Astra P0-1 "WHY stale"). */
export function freshnessReasonLabel(section: SnapshotSection | null): string | null {
  switch (section) {
    case 'vehicle':
      return 'vehicle changed since run';
    case 'motor':
      return 'motor content changed';
    case 'ensemble-wind':
      return 'wind inputs changed (manual table / probe / sounding)';
    case 'ensemble-perturbation':
      return 'run count or sigma changed';
    case 'calibration':
      return 'drag calibration applied, changed or removed';
    case 'drag-source':
      return 'flight drag model changed (built-up drag is now the default)';
    case 'aero-model':
      return 'aero model or term source changed';
    case 'options':
      return 'launch options changed (rail / wind / deploy)';
    default:
      return null;
  }
}

/** A stored snapshot is stale exactly when its FULL identity differs. */
export function isSnapshotStale(snapshot: RunSnapshot, current: ResolvedCase): boolean {
  return snapshot.mcKey !== snapshotCase(current).mcKey;
}

/** Deterministic serialization: sorted keys, fail-closed on nonfinite. */
export function stableStringify(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('run identity: nonfinite number cannot be keyed');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** FNV-1a 32-bit, hex. Deterministic identity hashing, not security. */
export function hashHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
