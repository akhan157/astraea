/**
 * The bounded native display samples exactly as returned in FlightRun.telemetry.
 * Saved samples are a historical record bound to their case's archived inputs
 * and engine identity; this parser never interpolates, repairs, reorders,
 * truncates or reconstructs a trajectory.
 */
import type { SixDofTelemetryPoint } from '../sim/sixDofSimulator';

/**
 * Mirrors `MAX_TELEMETRY_POINTS` in
 * `crates/astraea-core/src/telemetry.rs:18` (the display series that crosses
 * the IPC boundary). The native constant is not importable from here, so the
 * value is duplicated; if the engine raises its cap this stays conservative
 * (a save refuses rather than truncates), and if it lowers it the parser admits
 * samples the engine never emits. Keep in step with that source line.
 */
export const MAX_SAVED_TELEMETRY_POINTS = 5000;

const POINT_KEYS = [
  'time', 'position', 'velocity', 'speed', 'mach', 'altitude', 'acceleration',
  'angularVelocity', 'angleOfAttackDeg', 'q', 'pitchDeg', 'rollDeg', 'yawDeg',
  'drag', 'thrust', 'mass', 'dynamicPressure',
] as const;
const OPTIONAL_POINT_KEYS = ['stage', 'stageTime', 'motorTime'] as const;

type ListedPointKey = (typeof POINT_KEYS)[number] | (typeof OPTIONAL_POINT_KEYS)[number];
type UnlistedPointKeys = Exclude<keyof SixDofTelemetryPoint, ListedPointKey>;
/** Compile-time exhaustiveness: must stay `never`. */
type AssertNever<T extends never> = T;
/**
 * Compile-time guard: instantiating this errors if `SixDofTelemetryPoint` grows
 * a field that neither key list covers, instead of the parser silently refusing
 * genuine engine samples at save time. Exported so the constraint is checked.
 */
export type PointKeysCoverEngineShape = AssertNever<UnlistedPointKeys>;

type Raw = Record<string, unknown>;

function object(value: unknown, path: string, keys: ReadonlyArray<string>): Raw {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const raw = value as Raw;
  const actual = Object.keys(raw).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new Error(`${path} must have exactly ${expected.join(', ')}`);
  }
  return raw;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function vector(value: unknown, path: string): { x: number; y: number; z: number } {
  const raw = object(value, path, ['x', 'y', 'z']);
  return {
    x: finite(raw.x, `${path}.x`),
    y: finite(raw.y, `${path}.y`),
    z: finite(raw.z, `${path}.z`),
  };
}

/** Strict copy of one saved display series. Absence is represented by the case, not by defaults. */
export function parseSavedTelemetry(raw: unknown): SixDofTelemetryPoint[] {
  if (!Array.isArray(raw)) throw new Error('telemetry must be an array');
  if (raw.length > MAX_SAVED_TELEMETRY_POINTS) {
    throw new Error(`telemetry exceeds ${MAX_SAVED_TELEMETRY_POINTS} samples`);
  }
  let previous = 0;
  return raw.map((entry: unknown, i) => {
    const path = `telemetry[${i}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`${path} must be an object`);
    }
    const source = entry as Raw;
    const optional = OPTIONAL_POINT_KEYS.filter((key) => Object.hasOwn(source, key));
    const point = object(source, path, [...POINT_KEYS, ...optional]);
    const time = finite(point.time, `${path}.time`);
    if (time < 0 || time < previous) {
      throw new Error(`${path}.time must be nonnegative and non-decreasing`);
    }
    previous = time;
    let stage: string | undefined;
    if (Object.hasOwn(point, 'stage')) {
      if (typeof point.stage !== 'string' || point.stage.length === 0) {
        throw new Error(`${path}.stage must be a non-empty string`);
      }
      stage = point.stage;
    }
    return {
      time,
      ...(stage === undefined ? {} : { stage }),
      ...(Object.hasOwn(point, 'stageTime') ? { stageTime: finite(point.stageTime, `${path}.stageTime`) } : {}),
      ...(Object.hasOwn(point, 'motorTime') ? { motorTime: finite(point.motorTime, `${path}.motorTime`) } : {}),
      position: vector(point.position, `${path}.position`),
      velocity: vector(point.velocity, `${path}.velocity`),
      speed: finite(point.speed, `${path}.speed`),
      mach: finite(point.mach, `${path}.mach`),
      altitude: finite(point.altitude, `${path}.altitude`),
      acceleration: finite(point.acceleration, `${path}.acceleration`),
      angularVelocity: (() => {
        const value = object(point.angularVelocity, `${path}.angularVelocity`, ['p', 'q', 'r']);
        return {
          p: finite(value.p, `${path}.angularVelocity.p`),
          q: finite(value.q, `${path}.angularVelocity.q`),
          r: finite(value.r, `${path}.angularVelocity.r`),
        };
      })(),
      angleOfAttackDeg: finite(point.angleOfAttackDeg, `${path}.angleOfAttackDeg`),
      q: (() => {
        const value = object(point.q, `${path}.q`, ['w', 'x', 'y', 'z']);
        return {
          w: finite(value.w, `${path}.q.w`),
          x: finite(value.x, `${path}.q.x`),
          y: finite(value.y, `${path}.q.y`),
          z: finite(value.z, `${path}.q.z`),
        };
      })(),
      pitchDeg: finite(point.pitchDeg, `${path}.pitchDeg`),
      rollDeg: finite(point.rollDeg, `${path}.rollDeg`),
      yawDeg: finite(point.yawDeg, `${path}.yawDeg`),
      drag: finite(point.drag, `${path}.drag`),
      thrust: finite(point.thrust, `${path}.thrust`),
      mass: finite(point.mass, `${path}.mass`),
      dynamicPressure: finite(point.dynamicPressure, `${path}.dynamicPressure`),
    };
  });
}
