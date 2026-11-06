/**
 * C8 thrust-curve editing engine tests.
 *
 * Contract under test: the edit ops are structural and immutable (strictly
 * increasing times, >= 2 points, never mutating inputs); validateCurve is the
 * violation-reporting gate for RASP value/convention rules; the history stack
 * snapshots immutably; and deriveEditedMotor's Q6 derivation — trapezoid
 * integral impulse, burnTime = last t, avgThrust = J/burnTime, maxThrust =
 * curve peak, caller-fixed masses — always returns a validateMotorSpec-clean
 * record or throws with the validator's detail.
 */
import { describe, it, expect } from 'vitest';
import {
  CurveEditError,
  insertPoint,
  movePoint,
  deletePoint,
  validateCurve,
  makeCurveHistory,
  deriveEditedMotor,
} from './curveEditing';
import type { MotorSpec } from './motorDatabase';
import {
  CERTIFIED_MOTORS,
  ThrustPoint,
  validateMotorSpec,
  integrateThrustCurve,
  getMotorImpulseTotal,
} from './motorDatabase';

const BASE = CERTIFIED_MOTORS.cesaroni_i205;
const BASE_CURVE = BASE.thrustCurve;

describe('insertPoint', () => {
  it('inserts in sorted position while keeping the curve strictly increasing', () => {
    const mid = insertPoint(BASE_CURVE, 0.30, 190);
    expect(mid.map((p) => p.time)).toEqual([0, 0.08, 0.18, 0.30, 0.45, 0.9, 1.4, 1.86]);

    const head = insertPoint(BASE_CURVE, 0.01, 100);
    expect(head[1].time).toBe(0.01);

    const tail = insertPoint(BASE_CURVE, 2.2, 50);
    expect(tail[tail.length - 1]).toEqual({ time: 2.2, thrust: 50 });
    // Inserting past the last point keeps the original endpoints intact.
    expect(tail[tail.length - 2]).toEqual({ time: 1.86, thrust: 0 });
  });

  it('replaces thrust when a point at that time already exists (duplicate times are structurally invalid)', () => {
    const replaced = insertPoint(BASE_CURVE, 0.18, 999);
    expect(replaced.length).toBe(BASE_CURVE.length);
    expect(replaced.find((p) => p.time === 0.18)?.thrust).toBe(999);
    // Unrelated points survive untouched (same objects, by value).
    expect(replaced.find((p) => p.time === 0.9)?.thrust).toBe(215);
  });

  it('never mutates the input curve or its points', () => {
    const input = BASE_CURVE.map((p) => ({ ...p }));
    insertPoint(input, 0.3, 1);
    expect(input).toEqual(BASE_CURVE);
    expect(input[0]).toEqual(BASE_CURVE[0]);
  });

  it('throws fail-closed on non-finite time or thrust', () => {
    expect(() => insertPoint(BASE_CURVE, NaN, 1)).toThrow(CurveEditError);
    expect(() => insertPoint(BASE_CURVE, 0.3, Infinity)).toThrow(CurveEditError);
    expect(() => insertPoint(BASE_CURVE, -Infinity, 1)).toThrow(CurveEditError);
  });
});

describe('movePoint', () => {
  it('moves an interior point within its open neighbor interval', () => {
    const moved = movePoint(BASE_CURVE, 3, 0.40, 230); // was (0.45, 245)
    expect(moved[3]).toEqual({ time: 0.4, thrust: 230 });
    expect(moved.length).toBe(BASE_CURVE.length);
  });

  it('rejects times that would break strict ordering', () => {
    expect(() => movePoint(BASE_CURVE, 3, 0.08, 1)).toThrow(CurveEditError); // lands on prev
    expect(() => movePoint(BASE_CURVE, 3, 0.9, 1)).toThrow(CurveEditError); // lands on next
    expect(() => movePoint(BASE_CURVE, 3, 0.0, 1)).toThrow(CurveEditError); // before prev
    expect(() => movePoint(BASE_CURVE, 3, 2.0, 1)).toThrow(CurveEditError); // past next
  });

  it('pins the ignition point at t=0 (thrust is editable, time is not)', () => {
    expect(movePoint(BASE_CURVE, 0, 0, 7)[0]).toEqual({ time: 0, thrust: 7 });
    expect(() => movePoint(BASE_CURVE, 0, 0.5, 7)).toThrow(CurveEditError);
  });

  it('allows moving the last point to extend the burn', () => {
    const longer = movePoint(BASE_CURVE, BASE_CURVE.length - 1, 2.5, 0);
    expect(longer[longer.length - 1]).toEqual({ time: 2.5, thrust: 0 });
    expect(() => movePoint(BASE_CURVE, BASE_CURVE.length - 1, 1.39, 0)).toThrow(CurveEditError);
  });

  it('throws on bad indices and non-finite inputs', () => {
    expect(() => movePoint(BASE_CURVE, -1, 0.3, 1)).toThrow(CurveEditError);
    expect(() => movePoint(BASE_CURVE, BASE_CURVE.length, 0.3, 1)).toThrow(CurveEditError);
    expect(() => movePoint(BASE_CURVE, 1.5, 0.3, 1)).toThrow(CurveEditError);
    expect(() => movePoint(BASE_CURVE, 1, 0.3, NaN)).toThrow(CurveEditError);
  });

  it('never mutates the input', () => {
    const input = BASE_CURVE.map((p) => ({ ...p }));
    movePoint(input, 3, 0.4, 1);
    expect(input).toEqual(BASE_CURVE);
  });
});

describe('deletePoint', () => {
  it('removes the indexed point and keeps the rest in order', () => {
    const deleted = deletePoint(BASE_CURVE, 3);
    expect(deleted.length).toBe(BASE_CURVE.length - 1);
    expect(deleted.map((p) => p.time)).toEqual([0, 0.08, 0.18, 0.9, 1.4, 1.86]);
  });

  it('guards: never yields fewer than two points', () => {
    const two = [
      { time: 0, thrust: 0 },
      { time: 1.4, thrust: 0 },
    ];
    expect(() => deletePoint(two, 0)).toThrow(CurveEditError);
    expect(() => deletePoint(two, 1)).toThrow(CurveEditError);
    expect(() => deletePoint([{ time: 0, thrust: 0 }], 0)).toThrow(CurveEditError);
    expect(() => deletePoint([], 0)).toThrow(CurveEditError);
  });

  it('throws on out-of-range indices', () => {
    expect(() => deletePoint(BASE_CURVE, -1)).toThrow(CurveEditError);
    expect(() => deletePoint(BASE_CURVE, BASE_CURVE.length)).toThrow(CurveEditError);
  });

  it('never mutates the input', () => {
    const input = BASE_CURVE.map((p) => ({ ...p }));
    deletePoint(input, 3);
    expect(input).toEqual(BASE_CURVE);
  });
});

describe('validateCurve', () => {
  it('accepts every certified curve', () => {
    for (const motor of Object.values(CERTIFIED_MOTORS)) {
      const result = validateCurve(motor.thrustCurve);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    }
  });

  it('reports the full violation list without throwing', () => {
    const bad: ThrustPoint[] = [
      { time: 0.1, thrust: 5 }, // not at t=0, nonzero endpoint thrust
      { time: 0.1, thrust: -1 }, // duplicate time + negative thrust
      { time: NaN, thrust: 0 }, // non-finite time
    ];
    const result = validateCurve(bad);
    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.message)).toEqual([
      'point 1 thrust must be nonnegative (got -1)',
      'points must strictly increase in time (point 1 at 0.1 s)',
      'point 2 must carry finite time and thrust',
      'thrust curve must start at t=0',
      'first point thrust must be exactly 0 (RASP convention)',
    ]);
  });

  it('flags fewer than two points and malformed arrays', () => {
    expect(validateCurve([]).ok).toBe(false);
    expect(validateCurve([{ time: 0, thrust: 0 }]).ok).toBe(false);
    expect(validateCurve(undefined as unknown as ThrustPoint[]).ok).toBe(false);
    expect(validateCurve([{ time: 0, thrust: 0 }, { time: 1, thrust: 0 }]).ok).toBe(true);
  });

  it('requires strict monotonicity, finite values, and nonnegative thrust', () => {
    const flat = [
      { time: 0, thrust: 0 },
      { time: 1, thrust: 0 },
      { time: 1, thrust: 0 },
    ];
    const neg = [
      { time: 0, thrust: 0 },
      { time: 1, thrust: -0.5 },
      { time: 2, thrust: 0 },
    ];
    expect(validateCurve(flat).ok).toBe(false);
    const negResult = validateCurve(neg);
    expect(negResult.ok).toBe(false);
    expect(negResult.violations[0].message).toContain('nonnegative');
  });

  it('enforces exactly-zero endpoint thrust (first AND last), with no epsilon give', () => {
    const tinyEnd: ThrustPoint[] = [
      { time: 0, thrust: 0 },
      { time: 1, thrust: 5 },
      { time: 2, thrust: 1e-15 },
    ];
    const tinyStart: ThrustPoint[] = [
      { time: 0, thrust: 1e-15 },
      { time: 1, thrust: 5 },
      { time: 2, thrust: 0 },
    ];
    expect(validateCurve(tinyEnd).ok).toBe(false);
    expect(validateCurve(tinyStart).ok).toBe(false);
    // Both directions independently named.
    expect(validateCurve(tinyEnd).violations.some((v) => v.message.includes('last point'))).toBe(true);
    expect(validateCurve(tinyStart).violations.some((v) => v.message.includes('first point'))).toBe(true);
  });
});

describe('makeCurveHistory', () => {
  const a: ThrustPoint[] = [
    { time: 0, thrust: 0 },
    { time: 1, thrust: 10 },
    { time: 2, thrust: 0 },
  ];
  const b = insertPoint(a, 1.5, 8);
  const c = insertPoint(a, 0.5, 12);

  it('walks snapshots with undo/redo and reports stack edges as null', () => {
    const h = makeCurveHistory();
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();

    h.push(a);
    h.push(b);
    h.push(c);
    expect(h.undo()).toEqual(b);
    expect(h.undo()).toEqual(a);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual(b);
    expect(h.redo()).toEqual(c);
    expect(h.redo()).toBeNull();
  });

  it('clears the redo stack when a new snapshot is pushed after an undo', () => {
    const h = makeCurveHistory();
    h.push(a);
    h.push(b);
    expect(h.undo()).toEqual(a);
    h.push(c); // new branch — redo branch discarded
    expect(h.redo()).toBeNull();
    expect(h.undo()).toEqual(a);
  });

  it('snapshots are value-isolated from caller and returned arrays', () => {
    const h = makeCurveHistory();
    const live = a.map((p) => ({ ...p }));
    h.push(live);
    live[1].thrust = 999; // caller mutates its copy
    live.push({ time: 9, thrust: 9 });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();

    h.push(b);
    const undone = h.undo();
    expect(undone).toEqual(a);
    const again = h.redo();
    expect(again).toEqual(b);
    // Mutating what undo returned must not corrupt the stack.
    const poisoned = h.undo() as ThrustPoint[];
    poisoned[1].thrust = -7;
    expect(h.redo()?.[2]?.thrust).toBe(8); // b = insertPoint(a, 1.5, 8) adds at index 2
    expect(undone).toEqual(a);
    expect(poisoned[1].thrust).toBe(-7);
  });

  it('keeps independent stacks per factory call', () => {
    const h1 = makeCurveHistory();
    const h2 = makeCurveHistory();
    h1.push(a);
    h1.push(b);
    h2.push(a);
    expect(h1.undo()).toEqual(a);
    expect(h2.undo()).toBeNull();
  });
});

describe('deriveEditedMotor (Q6 law)', () => {
  it('derives every metric from the edited curve and passes validateMotorSpec', () => {
    const edited = movePoint(BASE_CURVE, 3, 0.4, 230);
    const m = deriveEditedMotor(BASE, edited, 0.2, 0.37);

    // Masses are caller-fixed; dry mass is defined by the wet identity.
    expect(m.propellantMass).toBe(0.2);
    expect(m.totalMass).toBe(0.37);
    expect(m.dryMass).toBeCloseTo(0.17, 12);

    // Q6 law: impulse is the trapezoid integral, burnTime the last t, avg =
    // J/burnTime, max = curve peak.
    expect(m.burnTime).toBe(edited[edited.length - 1].time);
    expect(m.totalImpulse).toBe(getMotorImpulseTotal(m));
    expect(m.totalImpulse).toBe(integrateThrustCurve(m, m.burnTime));
    expect(m.avgThrust).toBeCloseTo(m.totalImpulse / m.burnTime, 12);
    expect(m.maxThrust).toBe(Math.max(...edited.map((p) => p.thrust)));

    // Identity carries over from the base; class follows the new integral.
    expect(m.designation).toBe(BASE.designation);
    expect(m.manufacturer).toBe(BASE.manufacturer);
    expect(m.diameter).toBe(BASE.diameter);
    expect(m.length).toBe(BASE.length);
    expect(m.impulseClass).toBe('I');

    expect(() => validateMotorSpec(m)).not.toThrow();
  });

  it('recomputes the impulse class when the edit shifts the integral', () => {
    // Triple every thrust of the H-class curve: ~180 N*s becomes ~540 N*s.
    const scaled = CERTIFIED_MOTORS.aerotech_h128w.thrustCurve.map((p) => ({ time: p.time, thrust: p.thrust * 3 }));
    const m = deriveEditedMotor(CERTIFIED_MOTORS.aerotech_h128w, scaled, 0.1, 0.22);
    expect(m.impulseClass).toBe('I'); // H -> I under the lettering law
    expect(m.maxThrust).toBe(188 * 3);
    expect(() => validateMotorSpec(m)).not.toThrow();
  });

  it('returns a motor whose curve is decoupled from the caller-owned array', () => {
    const edited = BASE_CURVE.map((p) => ({ ...p }));
    const m = deriveEditedMotor(BASE, edited, 0.198, 0.365);
    edited[1].thrust = 0;
    edited.push({ time: 9, thrust: 9 });
    expect(m.thrustCurve.length).toBe(BASE_CURVE.length);
    expect(m.thrustCurve[1].thrust).toBe(150);
    expect(m.burnTime).toBe(1.86);
  });

  it('throws with validator detail on degenerate curves', () => {
    const zeroImpulse: ThrustPoint[] = [
      { time: 0, thrust: 0 },
      { time: 1, thrust: 0 },
      { time: 2, thrust: 0 },
    ];
    expect(() => deriveEditedMotor(BASE, zeroImpulse, 0.198, 0.365)).toThrow(CurveEditError);
    expect(() => deriveEditedMotor(BASE, zeroImpulse, 0.198, 0.365)).toThrow(/fails validation/);
    expect(() => deriveEditedMotor(BASE, zeroImpulse, 0.198, 0.365)).toThrow(/no finite positive impulse/);
  });

  it('throws fail-closed on impossible mass orderings and bad inputs', () => {
    const ok = BASE_CURVE;
    expect(() => deriveEditedMotor(BASE, ok, 0.5, 0.3)).toThrow(CurveEditError); // prop > total
    expect(() => deriveEditedMotor(BASE, ok, 0, 0.3)).toThrow(CurveEditError); // empty propellant
    expect(() => deriveEditedMotor(BASE, ok, -0.1, 0.3)).toThrow(CurveEditError);
    expect(() => deriveEditedMotor(BASE, ok, NaN, 0.3)).toThrow(CurveEditError);
    expect(() => deriveEditedMotor(null as unknown as MotorSpec, ok, 0.2, 0.37)).toThrow(CurveEditError);
    expect(() => deriveEditedMotor(BASE, [], 0.2, 0.37)).toThrow(CurveEditError);
    expect(() => deriveEditedMotor(BASE, ok, 0.2, Infinity)).toThrow(CurveEditError);
  });

  it('edit ops compose into a validated workflow', () => {
    let curve = BASE_CURVE;
    curve = insertPoint(curve, 0.32, 220);
    curve = movePoint(curve, 1, 0.05, 165);
    curve = deletePoint(curve, 2);
    expect(validateCurve(curve).ok).toBe(true);
    const m = deriveEditedMotor(BASE, curve, 0.198, 0.365);
    expect(() => validateMotorSpec(m)).not.toThrow();
    // Editing never degraded the engine: thrust interpolation still reads the curve.
    const impulse = getMotorImpulseTotal(m);
    expect(impulse).toBeGreaterThan(0);
    expect(m.totalImpulse).toBe(impulse);
  });
});