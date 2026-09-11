/**
 * Astraea Thrust-Curve Editing Engine (C8)
 * Pure, fail-closed curve editing primitives: structural point edits that
 * never mutate their inputs, a violation-reporting curve validator (the
 * normative gate — edit ops guard only the structural invariants a curve
 * array cannot violate), a local undo/redo stack over ThrustPoint[] snapshots,
 * and the Q6 derivation that turns an edited curve back into a valid MotorSpec.
 *
 * Layering contract: the editing ops keep the array structurally well-formed
 * (strictly increasing finite times, >= 2 points) and reject everything else
 * that cannot be represented; thrust value rules (nonnegative, zero endpoints)
 * are reported by validateCurve, and the final authority for a MotorSpec is
 * validateMotorSpec inside deriveEditedMotor — a derived record either passes
 * or throws with the validator's detail.
 */

import {
  MotorSpec,
  ThrustPoint,
  validateMotorSpec,
  integrateThrustCurve,
  impulseClassFor,
} from './motorDatabase';

/**
 * Failure mode shared by every curve edit: the requested edit cannot be
 * represented in a structurally valid curve.
 */
export class CurveEditError extends Error {
  constructor(message: string) {
    super(`curve edit: ${message}`);
    this.name = 'CurveEditError';
  }
}

/** Deep copy of a curve — every editing boundary is value-isolated. */
function cloneCurve(curve: ThrustPoint[]): ThrustPoint[] {
  return curve.map((p) => ({ time: p.time, thrust: p.thrust }));
}

/**
 * Inserts a (t, F) point, preserving strictly increasing times (RASP
 * requirement). If a point at time `t` already exists, its thrust is replaced
 * — otherwise a duplicate time would be structurally invalid — so insert is
 * also "set the point at t". Returns a NEW array; the input is never mutated.
 * Non-finite t/F throw (fail-closed: NaN/Infinity must not enter the stack).
 */
export function insertPoint(curve: ThrustPoint[], t: number, F: number): ThrustPoint[] {
  if (!Number.isFinite(t) || !Number.isFinite(F)) {
    throw new CurveEditError('insert requires finite time and thrust');
  }
  for (let i = 0; i < curve.length; i++) {
    if (curve[i].time === t) {
      const next = cloneCurve(curve);
      next[i] = { time: t, thrust: F };
      return next;
    }
  }
  let at = curve.length;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i].time > t) {
      at = i;
      break;
    }
  }
  const next = cloneCurve(curve);
  next.splice(at, 0, { time: t, thrust: F });
  return next;
}

/**
 * Moves the point at `index` to (t, F). Times must stay strictly increasing,
 * so t is constrained to the open interval between the point's neighbors;
 * the first point is pinned at t=0 (RASP ignition) — its time cannot move,
 * only its thrust. Thrust accepts any finite value; value rules are the
 * validator's domain (negative thrust / nonzero endpoints are reported by
 * validateCurve, never silently rewritten here). Returns a NEW array.
 * Non-finite values, out-of-range indices, and order-breaking times throw.
 */
export function movePoint(curve: ThrustPoint[], index: number, t: number, F: number): ThrustPoint[] {
  if (!Number.isFinite(t) || !Number.isFinite(F)) {
    throw new CurveEditError('move requires finite time and thrust');
  }
  if (index < 0 || index >= curve.length || !Number.isInteger(index)) {
    throw new CurveEditError(`move index ${index} out of range (curve has ${curve.length} points)`);
  }
  const lo = index > 0 ? curve[index - 1].time : 0;
  const hi = index < curve.length - 1 ? curve[index + 1].time : undefined;
  if (index === 0) {
    if (t !== 0) throw new CurveEditError('the ignition point is pinned at t=0');
  } else if (hi === undefined) {
    if (!(t > lo)) throw new CurveEditError(`time must exceed the previous point (${lo} s)`);
  } else if (!(t > lo && t < hi)) {
    throw new CurveEditError(`time must fall strictly between ${lo} s and ${hi} s`);
  }
  const next = cloneCurve(curve);
  next[index] = { time: t, thrust: F };
  return next;
}

/**
 * Deletes the point at `index`. Guard: a thrust curve needs at least two
 * points, so deleting from a 2-point (or degenerate shorter) curve throws;
 * the array never drops below two points. Returns a NEW array.
 */
export function deletePoint(curve: ThrustPoint[], index: number): ThrustPoint[] {
  if (curve.length <= 2) {
    throw new CurveEditError('cannot delete: a thrust curve needs at least two points');
  }
  if (index < 0 || index >= curve.length || !Number.isInteger(index)) {
    throw new CurveEditError(`delete index ${index} out of range (curve has ${curve.length} points)`);
  }
  const next = cloneCurve(curve);
  next.splice(index, 1);
  return next;
}

export interface CurveViolation {
  /** 0-based index of the offending point, when the violation names one. */
  index?: number;
  message: string;
}

export interface CurveValidation {
  ok: boolean;
  violations: CurveViolation[];
}

/**
 * Curve validator (RASP conventions): at least two points, strictly increasing
 * finite times starting at t=0, finite non-negative thrusts, and exactly-zero
 * thrust at the first AND last points. This is the reporting layer — it never
 * throws; callers read {ok, violations[]} and decide. Motor-level rules
 * (positive impulse, wet/dry/propellant identity, burnTime agreement) are
 * enforced separately by validateMotorSpec.
 */
export function validateCurve(curve: ThrustPoint[]): CurveValidation {
  const violations: CurveViolation[] = [];
  if (!Array.isArray(curve) || curve.length < 2) {
    return { ok: false, violations: [{ message: 'thrust curve needs at least two points' }] };
  }
  for (let i = 0; i < curve.length; i++) {
    const p = curve[i];
    if (!p || !Number.isFinite(p.time) || !Number.isFinite(p.thrust)) {
      violations.push({ index: i, message: `point ${i} must carry finite time and thrust` });
      continue;
    }
    if (p.thrust < 0) {
      violations.push({ index: i, message: `point ${i} thrust must be nonnegative (got ${p.thrust})` });
    }
    if (i > 0 && !(p.time > curve[i - 1].time)) {
      violations.push({ index: i, message: `points must strictly increase in time (point ${i} at ${p.time} s)` });
    }
  }
  if (curve.length > 0 && curve[0].time !== 0) {
    violations.push({ index: 0, message: 'thrust curve must start at t=0' });
  }
  if (curve.length > 0) {
    const first = curve[0];
    const last = curve[curve.length - 1];
    if (!(first.thrust === 0)) {
      violations.push({ index: 0, message: 'first point thrust must be exactly 0 (RASP convention)' });
    }
    if (!(last.thrust === 0)) {
      violations.push({ index: curve.length - 1, message: 'last point thrust must be exactly 0 (RASP convention)' });
    }
  }
  return { ok: violations.length === 0, violations };
}

export interface CurveHistory {
  /** Commits a snapshot; the first push is the baseline, later pushes move
   *  the previous current onto the undo stack and clear the redo stack. */
  push(snapshot: ThrustPoint[]): void;
  /** Returns the previous snapshot, or null when the undo stack is empty. */
  undo(): ThrustPoint[] | null;
  /** Returns the next snapshot, or null when the redo stack is empty. */
  redo(): ThrustPoint[] | null;
}

/**
 * Local undo/redo stack over immutable ThrustPoint[] snapshots (the same
 * history/future pattern the vehicle store uses). Every boundary copies:
 * push stores a clone and undo/redo return clones, so caller-side mutation
 * can never corrupt the stacks. The undo stack is capped at 30 entries.
 */
export function makeCurveHistory(): CurveHistory {
  let current: ThrustPoint[] | null = null;
  const past: ThrustPoint[][] = [];
  const future: ThrustPoint[][] = [];

  return {
    push(snapshot) {
      if (current !== null) {
        past.push(current);
        if (past.length > 30) past.shift();
      }
      current = cloneCurve(snapshot);
      future.length = 0;
    },
    undo() {
      if (current === null || past.length === 0) return null;
      future.unshift(current);
      current = past.pop() ?? null;
      return current === null ? null : cloneCurve(current);
    },
    redo() {
      if (current === null || future.length === 0) return null;
      past.push(current);
      current = future.shift() ?? null;
      return current === null ? null : cloneCurve(current);
    },
  };
}

/**
 * Q6 law: derives a complete, validated MotorSpec from an edited curve.
 * totalImpulse is the trapezoidal integral of the curve (the same law the
 * depletion model consumes — getMotorImpulseTotal), burnTime is the last
 * point's time, avgThrust = totalImpulse / burnTime, maxThrust is the curve
 * peak, and the propellant/total/dry masses are fixed by the caller
 * (dry = total - propellant). Identity/geometry/impulse class come from the
 * base record except the recomputed class, which follows the curve integral.
 *
 * Fail-closed: the assembled record MUST pass validateMotorSpec — generation
 * violations (degenerate curves, mass ordering, geometry) throw with the
 * validator's detail rather than ever returning an invalid motor.
 */
export function deriveEditedMotor(
  base: MotorSpec,
  curve: ThrustPoint[],
  propellantMassKg: number,
  totalMassKg: number,
): MotorSpec {
  if (!base || typeof base !== 'object') {
    throw new CurveEditError('derive requires a base MotorSpec record');
  }
  if (!Number.isFinite(propellantMassKg) || !Number.isFinite(totalMassKg)) {
    throw new CurveEditError('propellant and total mass must be finite');
  }
  if (!Array.isArray(curve) || curve.length === 0) {
    throw new CurveEditError('derive requires a thrust curve');
  }

  const thrustCurve = cloneCurve(curve);
  const burnTime = thrustCurve[thrustCurve.length - 1].time;
  const motor: MotorSpec = {
    id: base.id,
    designation: base.designation,
    manufacturer: base.manufacturer,
    impulseClass: '?',
    diameter: base.diameter,
    length: base.length,
    totalImpulse: 0,
    avgThrust: 0,
    maxThrust: 0,
    burnTime,
    propellantMass: propellantMassKg,
    totalMass: totalMassKg,
    dryMass: totalMassKg - propellantMassKg,
    thrustCurve,
  };

  const totalImpulse = integrateThrustCurve(motor, burnTime);
  motor.totalImpulse = totalImpulse;
  motor.avgThrust = burnTime > 0 ? totalImpulse / burnTime : 0;
  motor.maxThrust = Math.max(...thrustCurve.map((p) => p.thrust));
  motor.impulseClass = impulseClassFor(totalImpulse);

  try {
    validateMotorSpec(motor);
  } catch (err) {
    throw new CurveEditError(`derived motor fails validation: ${(err as Error).message}`);
  }
  return motor;
}