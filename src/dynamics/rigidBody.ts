/**
 * Astraea Production Rigid-Body Numerical Kernel (NORMATIVE)
 *
 * Single authoritative 6-DOF integration primitive. BOTH the flight simulator
 * (src/sim/sixDofSimulator.ts) and the verification benchmark suite
 * (src/sim/vv-benchmarks.test.ts) import THIS kernel — there is no parallel
 * test-local integrator. This is what Gate A requires: production is the
 * subject of the analytical acceptance tests.
 *
 * Frames (NORMATIVE, see docs/astraea-normative-physical-contract.md):
 *   N: right-handed ENU (+X East, +Y North, +Z Up)
 *   B: right-handed, +Y_B longitudinal toward nose, +X_B pitch, +Z_B yaw
 *   p(roll)=Omega_YB, q(pitch)=Omega_XB, r(yaw)=Omega_ZB
 *
 * Integrator: fixed-step RK4 on the coupled state with ADDITIVE quaternion
 * update and per-stage normalization. Dormand-Prince 5(4) adaptive with dense
 * output is the certified ascent to this kernel in the full-system build.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface RigidState {
  r: Vec3;   // position, navigation frame (m; ENU)
  v: Vec3;   // velocity, navigation frame (m/s)
  q: Quat;   // attitude, body -> navigation rotation
  w: Vec3;   // angular velocity, body frame (rad/s: x=pitch, y=roll, z=yaw)
}

export interface Loads {
  forceN: Vec3;      // total force in navigation frame (N)
  momentB: Vec3;     // total moment in body frame (N*m)
  inertiaB: Vec3;    // diagonal principal inertias (x=pitch, y=roll, z=yaw), kg*m^2
  mass: number;      // kg
}

/** Quaternion normalization (same policy as sixDofSimulator). */
export function normalizeQuaternion(q: Quat): Quat {
  const len = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
  if (len < 1e-9) return { w: 1, x: 0, y: 0, z: 0 };
  const inv = 1 / len;
  return { w: q.w * inv, x: q.x * inv, y: q.y * inv, z: q.z * inv };
}

/** qDot = 0.5 * q (x) [0, w] (body angular rate). */
export function quaternionDerivative(q: Quat, w: Vec3): Quat {
  const wx = w.x * 0.5, wy = w.y * 0.5, wz = w.z * 0.5;
  return {
    w: -q.x * wx - q.y * wy - q.z * wz,
    x: q.w * wx + q.y * wz - q.z * wy,
    y: q.w * wy - q.x * wz + q.z * wx,
    z: q.w * wz + q.x * wy - q.y * wx,
  };
}

/** Euler-Poinsot angular acceleration from body moments and diagonal inertia. */
export function angularAcceleration(w: Vec3, momentB: Vec3, inertiaB: Vec3): Vec3 {
  const Ix = Math.max(1e-9, inertiaB.x);
  const Iy = Math.max(1e-9, inertiaB.y);
  const Iz = Math.max(1e-9, inertiaB.z);
  return {
    x: momentB.x / Ix - ((Iz - Iy) * w.y * w.z) / Ix,
    y: momentB.y / Iy - ((Ix - Iz) * w.x * w.z) / Iy,
    z: momentB.z / Iz - ((Iy - Ix) * w.x * w.y) / Iz,
  };
}

/** Additive quaternion advance: normalize(q + dq * h). */
function addQuat(q: Quat, dq: Quat, h: number): Quat {
  return normalizeQuaternion({
    w: q.w + dq.w * h,
    x: q.x + dq.x * h,
    y: q.y + dq.y * h,
    z: q.z + dq.z * h,
  });
}

/**
 * Advance the rigid-body state by one RK4 step of size dt under the given loads.
 * Force is applied in the NAVIGATION frame; moment in the BODY frame.
 * Quaternion update is additive + normalized (NORMATIVE contract).
 */
export function integrateRigidStep(
  s: RigidState,
  loads: Loads,
  dt: number
): RigidState {
  const accel = (): Vec3 => ({
    x: loads.forceN.x / loads.mass,
    y: loads.forceN.y / loads.mass,
    z: loads.forceN.z / loads.mass,
  });

  const deriv = (st: RigidState): { dr: Vec3; dv: Vec3; dq: Quat; dw: Vec3 } => ({
    dr: st.v,
    dv: accel(),
    dq: quaternionDerivative(st.q, st.w),
    dw: angularAcceleration(st.w, loads.momentB, loads.inertiaB),
  });

  const addVec = (a: Vec3, b: Vec3, h: number): Vec3 => ({
    x: a.x + b.x * h, y: a.y + b.y * h, z: a.z + b.z * h,
  });

  const d1 = deriv(s);
  const s1: RigidState = {
    r: addVec(s.r, d1.dr, dt / 2),
    v: addVec(s.v, d1.dv, dt / 2),
    q: addQuat(s.q, d1.dq, dt / 2),
    w: addVec(s.w, d1.dw, dt / 2),
  };
  const d2 = deriv(s1);
  const s2: RigidState = {
    r: addVec(s.r, d2.dr, dt / 2),
    v: addVec(s.v, d2.dv, dt / 2),
    q: addQuat(s.q, d2.dq, dt / 2),
    w: addVec(s.w, d2.dw, dt / 2),
  };
  const d3 = deriv(s2);
  const s3: RigidState = {
    r: addVec(s.r, d3.dr, dt),
    v: addVec(s.v, d3.dv, dt),
    q: addQuat(s.q, d3.dq, dt),
    w: addVec(s.w, d3.dw, dt),
  };
  const d4 = deriv(s3);

  const blend = (d1v: number, d2v: number, d3v: number, d4v: number): number =>
    (d1v + 2 * d2v + 2 * d3v + d4v) * dt / 6;

  return {
    r: { x: s.r.x + blend(d1.dr.x, d2.dr.x, d3.dr.x, d4.dr.x), y: s.r.y + blend(d1.dr.y, d2.dr.y, d3.dr.y, d4.dr.y), z: s.r.z + blend(d1.dr.z, d2.dr.z, d3.dr.z, d4.dr.z) },
    v: { x: s.v.x + blend(d1.dv.x, d2.dv.x, d3.dv.x, d4.dv.x), y: s.v.y + blend(d1.dv.y, d2.dv.y, d3.dv.y, d4.dv.y), z: s.v.z + blend(d1.dv.z, d2.dv.z, d3.dv.z, d4.dv.z) },
    q: normalizeQuaternion({
      w: s.q.w + blend(d1.dq.w, d2.dq.w, d3.dq.w, d4.dq.w),
      x: s.q.x + blend(d1.dq.x, d2.dq.x, d3.dq.x, d4.dq.x),
      y: s.q.y + blend(d1.dq.y, d2.dq.y, d3.dq.y, d4.dq.y),
      z: s.q.z + blend(d1.dq.z, d2.dq.z, d3.dq.z, d4.dq.z),
    }),
    w: {
      x: s.w.x + blend(d1.dw.x, d2.dw.x, d3.dw.x, d4.dw.x),
      y: s.w.y + blend(d1.dw.y, d2.dw.y, d3.dw.y, d4.dw.y),
      z: s.w.z + blend(d1.dw.z, d2.dw.z, d3.dw.z, d4.dw.z),
    },
  };
}

/** Quaternion -> rotation matrix (body to navigation). */
export function quaternionToMatrix(q: Quat): number[][] {
  const { w, x, y, z } = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

/** Rotate a vector from body frame to navigation frame: v_N = R v_B. */
export function rotateBodyToWorld(R: number[][], v: Vec3): Vec3 {
  return {
    x: R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
    y: R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
    z: R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z,
  };
}

/** Rotate a vector from navigation frame to body frame: v_B = R^T v_N. */
export function rotateWorldToBody(R: number[][], v: Vec3): Vec3 {
  return {
    x: R[0][0] * v.x + R[1][0] * v.y + R[2][0] * v.z,
    y: R[0][1] * v.x + R[1][1] * v.y + R[2][1] * v.z,
    z: R[0][2] * v.x + R[1][2] * v.y + R[2][2] * v.z,
  };
}