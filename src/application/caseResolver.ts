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
 * silent fallback to another motor.
 *
 * Mount rules mirror the Round-19 FlightSim prefilter exactly: one flagged
 * mount constrains the bore (innerDiameter, else outer − 3 mm); zero mounts
 * is the disclosed aft-end fallback (no constraint); two or more mounts is
 * ambiguity; a solid tube seats nothing. A motor seats when its diameter
 * fits the bore and at least 50% of its length is retained by the mount.
 */

import type { BodyTubeComponent, RocketVehicle } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { CERTIFIED_MOTORS, validateMotorSpec } from '../propulsion/motorDatabase';

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

/** User-level flight case: committed engineering inputs, not results. */
export interface LaunchCase {
  vehicle: RocketVehicle;
  /** Motor reference by id; the binding pins content, not this string. */
  motorId: string;
  options: LaunchOptions;
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
    | 'input-nonfinite';
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
  readonly runKey: string;
  readonly vehicleId: string;
  readonly motorId: string;
  readonly motorContentKey: string;
  readonly options: Readonly<LaunchOptions>;
  /** Canonical input serialization the key was derived from. */
  readonly canonical: string;
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
 * (including a same-id motor edit) produces a new key.
 */
export function snapshotCase(resolved: ResolvedCase): RunSnapshot {
  const { id: _id, ...motorContent } = resolved.motor;
  const canonical = stableStringify({
    vehicle: resolved.case.vehicle,
    motor: motorContent,
    options: resolved.case.options,
  });
  const snapshot: RunSnapshot = {
    runKey: hashHex(canonical),
    vehicleId: resolved.case.vehicle.id,
    motorId: resolved.case.motorId,
    motorContentKey: motorContentKey(resolved.motor),
    options: Object.freeze({ ...resolved.case.options }),
    canonical,
  };
  return Object.freeze(snapshot);
}

/** A stored snapshot is stale exactly when its key differs from current. */
export function isSnapshotStale(snapshot: RunSnapshot, current: ResolvedCase): boolean {
  return snapshot.runKey !== snapshotCase(current).runKey;
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
