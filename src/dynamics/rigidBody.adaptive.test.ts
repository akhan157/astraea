/**
 * Adaptive DP5(4) solver repair — acceptance tests (Round-13 audit §3.3/3.4).
 *
 * Covers the repaired contract in src/dynamics/rigidBody.ts:
 *   1. nonzero-spin convergence (torque-free top, tight tolerance) — also with
 *      an antipodal initial attitude;
 *   2. changing-axis torque profile vs an independent fixed-step reference;
 *   3. tight-tolerance attitude-coupled translation (body-frame thrust rotated
 *      by the live attitude) vs an independent reference;
 *   4. rejection-floor termination (bounded rejection; no indefinite stall);
 *   5. invalid stage-load callback results are rejected (finite, mass,
 *      inertia);
 *   6. minimal dense-output support for event localization (4th-order cubic
 *      Hermite brackets, endpoint consistency, unit-norm interpolation).
 */
import { describe, it, expect } from 'vitest';
import {
  integrateRigidAdaptive,
  integrateRigidStep,
  denseOutputAt,
  normalizeQuaternion,
  quaternionToMatrix,
  rotateBodyToWorld,
  RigidState,
  Loads,
  AdaptiveTolerances,
} from './rigidBody';

const IDENTITY_LOADS: Loads = {
  forceN: { x: 0, y: 0, z: 0 },
  momentB: { x: 0, y: 0, z: 0 },
  inertiaB: { x: 1.0, y: 1.0, z: 1.0 },
  mass: 1.0,
};

function quatAngle(a: RigidState['q'], b: RigidState['q']): number {
  // geodesic angle between two (unit) quaternions: angle(a ⊗ b⁻¹)
  const qab = {
    w: a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z,
    x: a.w * b.x - a.x * b.w - a.y * b.z + a.z * b.y,
    y: a.w * b.y + a.x * b.z - a.y * b.w - a.z * b.x,
    z: a.w * b.z - a.x * b.y + a.y * b.x - a.z * b.w,
  };
  const s = Math.hypot(qab.x, qab.y, qab.z);
  return 2 * Math.atan2(s, Math.abs(qab.w));
}

function quatNorm(q: RigidState['q']): number {
  return Math.hypot(q.w, q.x, q.y, q.z);
}

function spinState(): RigidState {
  return {
    r: { x: 0, y: 0, z: 0 },
    v: { x: 0, y: 0, z: 0 },
    q: { w: 1, x: 0, y: 0, z: 0 },
    w: { x: 1.2, y: -0.7, z: 0.4 },
  };
}

describe('Adaptive DP5(4) — repaired attitude error + bounded rejection', () => {
  it('1. nonzero-spin torque-free motion converges with attitude invariants conserved (incl. antipodal initial attitude)', () => {
    const inertiaB = { x: 2.0, y: 3.0, z: 2.5 };
    const loads: Loads = {
      forceN: { x: 0, y: 0, z: 0 },
      momentB: { x: 0, y: 0, z: 0 },
      inertiaB,
      mass: 5.0,
    };
    const tEnd = 1.5;
    const tol: AdaptiveTolerances = { r: 1e-3, v: 1e-5, q: 1e-9, w: 1e-9 };

    for (const q0 of [
      { w: 1, x: 0, y: 0, z: 0 },
      { w: -1, x: 0, y: 0, z: 0 }, // antipodal: same orientation, opposite sign
    ] as RigidState['q'][]) {
      const s0: RigidState = { ...spinState(), q: q0 };
      const L0 = Math.hypot(inertiaB.x * s0.w.x, inertiaB.y * s0.w.y, inertiaB.z * s0.w.z);
      const E0 = 0.5 * (inertiaB.x * s0.w.x * s0.w.x + inertiaB.y * s0.w.y * s0.w.y + inertiaB.z * s0.w.z * s0.w.z);

      const res = integrateRigidAdaptive(s0, () => loads, 0, tEnd, tol, 0.05, 0.005);

      expect(res.finalTime).toBeCloseTo(tEnd, 6);
      expect(res.steps).toBeGreaterThan(20);
      expect(res.rejectedSteps).toBeGreaterThanOrEqual(0);

      // Torque-free invariants: ANGULAR MOMENTUM and KINETIC ENERGY are
      // conserved exactly by the continuous dynamics (|ω| is NOT an invariant
      // of a triaxial top — L precesses about the body axes), so both must
      // hold to integration tolerance. Quaternion stays unit-norm.
      const L1 = Math.hypot(inertiaB.x * res.state.w.x, inertiaB.y * res.state.w.y, inertiaB.z * res.state.w.z);
      const E1 = 0.5 * (inertiaB.x * res.state.w.x * res.state.w.x + inertiaB.y * res.state.w.y * res.state.w.y + inertiaB.z * res.state.w.z * res.state.w.z);
      expect(Math.abs(L1 - L0)).toBeLessThanOrEqual(1e-6 * L0);
      expect(Math.abs(E1 - E0)).toBeLessThanOrEqual(1e-6 * E0);
      expect(quatNorm(res.state.q)).toBeCloseTo(1, 10);

      // Independent reference: fixed-step RK4 at dt = 2e-4.
      let ref = s0;
      const dt = 2e-4;
      const n = Math.round(tEnd / dt);
      for (let i = 0; i < n; i++) ref = integrateRigidStep(ref, loads, dt);
      const wErr = Math.hypot(
        ref.w.x - res.state.w.x, ref.w.y - res.state.w.y, ref.w.z - res.state.w.z
      );
      expect(wErr).toBeLessThanOrEqual(1e-5);
      expect(quatAngle(ref.q, res.state.q)).toBeLessThanOrEqual(1e-5);
    }
  });

  it('2. changing-axis torque profile matches an independent fixed-step reference', () => {
    const inertiaB = { x: 2.0, y: 3.0, z: 2.5 };
    const tEnd = 0.6;
    const loadsAt = (_t: number) => ({
      forceN: { x: 0, y: 0, z: 0 },
      momentB: { x: 2.0 * Math.sin(3 * _t), y: 1.5 * Math.cos(3 * _t), z: 0.4 },
      inertiaB,
      mass: 5.0,
    } as Loads);

    const res = integrateRigidAdaptive(spinState(), loadsAt, 0, tEnd, {
      r: 1e-3, v: 1e-5, q: 1e-10, w: 1e-10,
    }, 0.02, 0.002);
    expect(res.finalTime).toBeCloseTo(tEnd, 6);

    let ref = spinState();
    const dt = 2e-4;
    for (let i = 0; i < Math.round(tEnd / dt); i++) {
      ref = integrateRigidStep(ref, loadsAt((i + 1) * dt), dt, loadsAt, i * dt);
    }
    const wErr = Math.hypot(ref.w.x - res.state.w.x, ref.w.y - res.state.w.y, ref.w.z - res.state.w.z);
    expect(wErr).toBeLessThanOrEqual(1e-4);
    expect(quatAngle(ref.q, res.state.q)).toBeLessThanOrEqual(1e-4);
  });

  it('3. tight-tolerance attitude-coupled translation converges (body-frame thrust via live attitude)', () => {
    // Axial body thrust whose navigation-frame direction follows the
    // attitude: F_N = R(q) · (0, Fb, 0), with a nonzero spin so the attitude
    // genuinely rotates and the force genuinely couples to it.
    const inertiaB = { x: 0.8, y: 1.2, z: 1.0 };
    const Fb = 40.0;
    const tEnd = 0.5;
    const loadsAt = (_t: number, st: RigidState) => {
      const R = quaternionToMatrix(st.q);
      const fn = rotateBodyToWorld(R, { x: 0, y: Fb, z: 0 });
      return {
        forceN: fn,
        momentB: { x: 0, y: 0, z: 0 },
        inertiaB,
        mass: 5.0,
      } as Loads;
    };
    const s0: RigidState = {
      r: { x: 0, y: 0, z: 0 },
      v: { x: 0, y: 0, z: 0 },
      q: { w: 1, x: 0, y: 0, z: 0 },
      w: { x: 0.3, y: 4.0, z: -1.0 },
    };
    const res = integrateRigidAdaptive(s0, loadsAt, 0, tEnd, {
      r: 1e-7, v: 1e-9, q: 1e-9, w: 1e-9,
    }, 0.01, 0.001);
    expect(res.finalTime).toBeCloseTo(tEnd, 6);
    expect(res.steps).toBeGreaterThan(50);

    let ref = { ...s0, q: normalizeQuaternion({ ...s0.q }) };
    const dt = 1e-4;
    for (let i = 0; i < Math.round(tEnd / dt); i++) {
      ref = integrateRigidStep(ref, loadsAt((i + 1) * dt, ref), dt, loadsAt, i * dt);
    }
    const rErr = Math.hypot(ref.r.x - res.state.r.x, ref.r.y - res.state.r.y, ref.r.z - res.state.r.z);
    const vErr = Math.hypot(ref.v.x - res.state.v.x, ref.v.y - res.state.v.y, ref.v.z - res.state.v.z);
    expect(rErr).toBeLessThanOrEqual(1e-4);
    expect(vErr).toBeLessThanOrEqual(1e-4);
    expect(quatAngle(ref.q, res.state.q)).toBeLessThanOrEqual(1e-5);
  });

  it('4. persistent rejection terminates at the representable-progress floor (no stall)', () => {
    // A load callback whose result alternates sign on every invocation keeps
    // the embedded 5th/4th discrepancy at O(1e4) at every trial size, so the
    // step can never be accepted: the integrator MUST terminate by hitting
    // the representable-progress floor instead of looping forever.
    let flip = false;
    const loadsAt = () => {
      flip = !flip;
      return {
        forceN: { x: 0, y: 0, z: 0 },
        momentB: { x: 0, y: flip ? 1e4 : -1e4, z: 0 },
        inertiaB: { x: 1, y: 1, z: 1 },
        mass: 1.0,
      } as Loads;
    };
    expect(() =>
      integrateRigidAdaptive(spinState(), loadsAt, 0, 0.1, {
        r: 1e-13, v: 1e-13, q: 1e-13, w: 1e-13,
      }, 0.05, 0.01)
    ).toThrow(/representable|floor|integrab/i);
  });

  it('5. invalid stage-load callback results are rejected', () => {
    // Entry normalization is only a drift correction, never an implicit
    // conversion of an arbitrary vector into a physical attitude.
    expect(() =>
      integrateRigidAdaptive(
        { ...spinState(), q: { w: 2, x: 0, y: 0, z: 0 } },
        () => IDENTITY_LOADS,
        0,
        0.1,
        { r: 1e-6, v: 1e-9, q: 1e-9, w: 1e-9 }
      )
    ).toThrow(/near-unit/);

    // Every state exposed to loadsAt must carry a unit attitude because
    // production loads immediately convert it to a rotation matrix.
    const observedNorms: number[] = [];
    integrateRigidAdaptive(
      spinState(),
      (_t, st) => {
        observedNorms.push(quatNorm(st.q));
        return IDENTITY_LOADS;
      },
      0,
      0.1,
      { r: 1e-6, v: 1e-9, q: 1e-9, w: 1e-9 }
    );
    expect(observedNorms.length).toBeGreaterThan(1);
    for (const norm of observedNorms) expect(norm).toBeCloseTo(1, 12);

    // Non-finite stage result (force -> NaN after t > 0.05).
    const badFinite = () => ({
      forceN: { x: Number.NaN, y: 0, z: 0 },
      momentB: { x: 0, y: 0, z: 0 },
      inertiaB: { x: 1, y: 1, z: 1 },
      mass: 1.0,
    } as Loads);
    expect(() =>
      integrateRigidAdaptive(spinState(), (_t, _st) => (_t > 0.05 ? badFinite() : IDENTITY_LOADS), 0, 0.2, {
        r: 1e-6, v: 1e-9, q: 1e-9, w: 1e-9,
      }, 0.05, 0.01)
    ).toThrow(/non-finite/);

    // Non-positive mass at a stage.
    const badMass = () => ({
      forceN: { x: 0, y: 0, z: 0 },
      momentB: { x: 0, y: 0, z: 0 },
      inertiaB: { x: 1, y: 1, z: 1 },
      mass: 0,
    } as Loads);
    expect(() =>
      integrateRigidAdaptive(spinState(), (_t, _st) => (_t > 0.05 ? badMass() : IDENTITY_LOADS), 0, 0.2, {
        r: 1e-6, v: 1e-9, q: 1e-9, w: 1e-9,
      }, 0.05, 0.01)
    ).toThrow(/mass/);

    // Non-positive principal inertia at a stage.
    const badInertia = () => ({
      forceN: { x: 0, y: 0, z: 0 },
      momentB: { x: 0, y: 0, z: 0 },
      inertiaB: { x: 0, y: 1, z: 1 },
      mass: 1.0,
    } as Loads);
    expect(() =>
      integrateRigidAdaptive(spinState(), (_t, _st) => (_t > 0.05 ? badInertia() : IDENTITY_LOADS), 0, 0.2, {
        r: 1e-6, v: 1e-9, q: 1e-9, w: 1e-9,
      }, 0.05, 0.01)
    ).toThrow(/inertia/);
  });

  it('6. dense output brackets every accepted step and interpolates for event localization', () => {
    // Constant-velocity flight: dense output must reproduce the exact linear
    // motion at interior points and stay unit-norm during spin.
    const s0: RigidState = {
      r: { x: 0, y: 0, z: 0 },
      v: { x: 20, y: 0, z: 0 },
      q: { w: 1, x: 0, y: 0, z: 0 },
      w: { x: 0, y: 0, z: 0 },
    };
    const tEnd = 2.5;
    const res = integrateRigidAdaptive(s0, () => IDENTITY_LOADS, 0, tEnd, {
      r: 1e-6, v: 1e-9, q: 1e-9, w: 1e-9,
    }, 0.5, 0.05);

    expect(res.dense.length).toBe(res.steps);
    expect(res.dense[0].t0).toBe(0);
    expect(res.dense[res.dense.length - 1].t0 + res.dense[res.dense.length - 1].h).toBeCloseTo(tEnd, 6);
    // one dense bracket per accepted step, ordered, positive sizes
    for (let i = 0; i < res.dense.length; i++) {
      expect(res.dense[i].h).toBeGreaterThan(0);
      if (i > 0) expect(res.dense[i].t0).toBeGreaterThan(res.dense[i - 1].t0 + res.dense[i - 1].h - 1e-12);
    }

    // Interior queries reproduce exact linear motion.
    for (const tc of [0.4, 1.25, 2.2]) {
      const ds = denseOutputAt(res.dense, tc);
      expect(ds.r.x).toBeCloseTo(20 * tc, 6);
      expect(ds.v.x).toBeCloseTo(20, 6);
    }

    // Endpoint consistency: dense evaluation at step boundaries returns the
    // bracketed states.
    const mid = res.dense[Math.floor(res.dense.length / 2)];
    const atStart = denseOutputAt(res.dense, mid.t0);
    expect(atStart.r.x).toBeCloseTo(mid.y0.r.x, 9);
    const atEnd = denseOutputAt(res.dense, mid.t0 + mid.h);
    expect(atEnd.r.x).toBeCloseTo(mid.y1.r.x, 9);

    // Unit-norm interpolation under nonzero spin.
    const spin = integrateRigidAdaptive(spinState(), () => IDENTITY_LOADS, 0, 1.0, {
      r: 1e-3, v: 1e-5, q: 1e-9, w: 1e-9,
    }, 0.1, 0.01);
    for (let i = 0; i < spin.dense.length; i++) {
      const d = spin.dense[i];
      const tm = d.t0 + 0.37 * d.h;
      expect(quatNorm(denseOutputAt(spin.dense, tm).q)).toBeCloseTo(1, 8);
    }

    // Out-of-span queries are rejected (strict kernel contract).
    expect(() => denseOutputAt(res.dense, -0.1)).toThrow(/outside integration span/);
    expect(() => denseOutputAt(res.dense, tEnd + 1)).toThrow(/outside integration span/);
  });
});