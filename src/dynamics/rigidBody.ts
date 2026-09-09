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

/**
 * Optional stage-dependent load factory. If provided, integrateRigidStep
 * re-evaluates force/moment at EVERY RK4 stage using that stage's true state
 * and time. This restores fourth-order accuracy for attitude-dependent
 * translational forcing (wind, body-frame rotation, mass evolution).
 * If omitted, loads are frozen at their initial values (first-order global
 * velocity error for attitude-dependent forces — valid only for the
 * constant-force benchmark class).
 */
export type LoadsAt = (tStage: number, st: RigidState) => Loads;

/** Quaternion normalization (NORMATIVE; rejects degenerate quaternions). */
export function normalizeQuaternion(q: Quat): Quat {
  const len = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
  if (len < 1e-9 || !Number.isFinite(len)) {
    throw new Error(
      'strict rigid-body kernel: degenerate quaternion (|q| ~ 0 or nonfinite); refusing to fabricate an attitude'
    );
  }
  const inv = 1 / len;
  return { w: q.w * inv, x: q.x * inv, y: q.y * inv, z: q.z * inv };
}

/** Strict validation: reject nonfinite states, nonpositive mass, invalid dt. */
export function validateStateAndLoads(s: RigidState, loads: Loads, dt: number): void {
  const finite =
    Number.isFinite(s.r.x) && Number.isFinite(s.r.y) && Number.isFinite(s.r.z) &&
    Number.isFinite(s.v.x) && Number.isFinite(s.v.y) && Number.isFinite(s.v.z) &&
    Number.isFinite(s.w.x) && Number.isFinite(s.w.y) && Number.isFinite(s.w.z) &&
    Number.isFinite(s.q.w) && Number.isFinite(s.q.x) && Number.isFinite(s.q.y) && Number.isFinite(s.q.z) &&
    Number.isFinite(loads.forceN.x) && Number.isFinite(loads.forceN.y) && Number.isFinite(loads.forceN.z) &&
    Number.isFinite(loads.momentB.x) && Number.isFinite(loads.momentB.y) && Number.isFinite(loads.momentB.z) &&
    Number.isFinite(loads.inertiaB.x) && Number.isFinite(loads.inertiaB.y) && Number.isFinite(loads.inertiaB.z);
  if (!finite) throw new Error('strict rigid-body kernel: non-finite state or load component');
  if (!(loads.mass > 0 && Number.isFinite(loads.mass))) throw new Error('strict rigid-body kernel: mass must be positive and finite');
  if (!(dt > 0 && Number.isFinite(dt))) throw new Error('strict rigid-body kernel: dt must be positive and finite');
  if (loads.inertiaB.x <= 0 || loads.inertiaB.y <= 0 || loads.inertiaB.z <= 0) {
    throw new Error('strict rigid-body kernel: principal inertias must be strictly positive');
  }
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

/** Euler-Poinsot angular acceleration from body moments and diagonal inertia.
 *  Precondition: inertiaB strictly positive (enforced by validateStateAndLoads).
 *  No silent clamping/clamping is applied — an out-of-domain value THROWS. */
export function angularAcceleration(w: Vec3, momentB: Vec3, inertiaB: Vec3): Vec3 {
  const Ix = inertiaB.x;
  const Iy = inertiaB.y;
  const Iz = inertiaB.z;
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
 *
 * If `loadsAt` is provided, force/moment/mass/inertia are re-evaluated at each
 * stage state and time tStage (restores 4th-order accuracy for attitude- and
 * time-dependent forcing). Otherwise loads are frozen (constant-force class).
 */
export function integrateRigidStep(
  s: RigidState,
  loads: Loads,
  dt: number,
  loadsAt?: LoadsAt,
  t0?: number
): RigidState {
  validateStateAndLoads(s, loads, dt);
  if (!Number.isFinite(t0 ?? 0)) {
    throw new Error('strict rigid-body kernel: t0 must be finite');
  }
  const startTime = t0 ?? 0;

  const accelFor = (L: Loads): Vec3 => ({
    x: L.forceN.x / L.mass,
    y: L.forceN.y / L.mass,
    z: L.forceN.z / L.mass,
  });

  const deriv = (st: RigidState, L: Loads, _t: number): { dr: Vec3; dv: Vec3; dq: Quat; dw: Vec3 } => ({
    dr: st.v,
    dv: accelFor(L),
    dq: quaternionDerivative(st.q, st.w),
    dw: angularAcceleration(st.w, L.momentB, L.inertiaB),
  });

  const addVec = (a: Vec3, b: Vec3, h: number): Vec3 => ({
    x: a.x + b.x * h, y: a.y + b.y * h, z: a.z + b.z * h,
  });

  const L0 = loadsAt ? loadsAt(startTime, s) : loads;
  if (loadsAt) validateStateAndLoads(s, L0, dt); // entry already validated `loads`; only factory output needs re-check
  const d1 = deriv(s, L0, startTime);
  const tHalf = startTime + dt / 2;
  const tFull = startTime + dt;

  const s1: RigidState = {
    r: addVec(s.r, d1.dr, dt / 2),
    v: addVec(s.v, d1.dv, dt / 2),
    q: addQuat(s.q, d1.dq, dt / 2),
    w: addVec(s.w, d1.dw, dt / 2),
  };
  const L1 = loadsAt ? loadsAt(tHalf, s1) : loads;
  validateStateAndLoads(s1, L1, dt);
  const d2 = deriv(s1, L1, tHalf);

  const s2: RigidState = {
    r: addVec(s.r, d2.dr, dt / 2),
    v: addVec(s.v, d2.dv, dt / 2),
    q: addQuat(s.q, d2.dq, dt / 2),
    w: addVec(s.w, d2.dw, dt / 2),
  };
  const L2 = loadsAt ? loadsAt(tHalf, s2) : loads;
  validateStateAndLoads(s2, L2, dt);
  const d3 = deriv(s2, L2, tHalf);

  const s3: RigidState = {
    r: addVec(s.r, d3.dr, dt),
    v: addVec(s.v, d3.dv, dt),
    q: addQuat(s.q, d3.dq, dt),
    w: addVec(s.w, d3.dw, dt),
  };
  const L3 = loadsAt ? loadsAt(tFull, s3) : loads;
  validateStateAndLoads(s3, L3, dt);
  const d4 = deriv(s3, L3, tFull);

  const blend = (d1v: number, d2v: number, d3v: number, d4v: number): number =>
    (d1v + 2 * d2v + 2 * d3v + d4v) * dt / 6;

  const out: RigidState = {
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
  // Final output validation: reject nonfinite propagated state.
  const outFinite =
    Number.isFinite(out.r.x) && Number.isFinite(out.r.y) && Number.isFinite(out.r.z) &&
    Number.isFinite(out.v.x) && Number.isFinite(out.v.y) && Number.isFinite(out.v.z) &&
    Number.isFinite(out.w.x) && Number.isFinite(out.w.y) && Number.isFinite(out.w.z) &&
    Number.isFinite(out.q.w) && Number.isFinite(out.q.x) && Number.isFinite(out.q.y) && Number.isFinite(out.q.z);
  if (!outFinite) {
    throw new Error('strict rigid-body kernel: non-finite output state after RK4 step');
  }
  return out;
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

/**
 * Production display adapter (NORMATIVE).
 * Display convention: {x: East (rendered left), y: Up/altitude, z: North}.
 * Kernel convention: {x: East, y: North, z: Up} (right-handed ENU).
 * The mapping is the proper rotation (det = +1):
 *   displayToKernel(v) = (-v.x, v.z, v.y)
 */
export function displayToKernel(v: Vec3): Vec3 {
  return { x: -v.x, y: v.z, z: v.y };
}

/** Inverse: kernel ENU -> display {x: East(rendered left), y: Up, z: North}. */
export function kernelToDisplay(v: Vec3): Vec3 {
  return { x: -v.x, y: v.z, z: v.y };
}

/**
 * Production body-rate + inertia adapter (NORMATIVE).
 * Display/simulator omega: {p: roll, q: pitch, r: yaw}, with principal inertia
 * I_roll-axial (Ixx) and transverse I_pitch/I_yaw (Iyy, Izz).
 * Kernel convention: w = {x: pitch, y: roll, z: yaw}, inertiaB = {pitch, roll, yaw}.
 */
export function simOmegaToKernel(o: { p: number; q: number; r: number }): Vec3 {
  return { x: o.q, y: o.p, z: o.r };
}

/** Inverse of simOmegaToKernel. */
export function kernelOmegaToSim(w: Vec3): { p: number; q: number; r: number } {
  return { p: w.y, q: w.x, r: w.z };
}

/** Simulator inertia (Ixx=roll, Iyy=pitch, Izz=yaw) -> kernel inertiaB {pitch, roll, yaw}. */
export function simInertiaToKernel(I: { x: number; y: number; z: number }): Vec3 {
  return { x: I.y, y: I.x, z: I.z };
}
/** Rotate a vector from navigation frame to body frame: v_B = R^T v_N. */
export function rotateWorldToBody(R: number[][], v: Vec3): Vec3 {
  return {
    x: R[0][0] * v.x + R[1][0] * v.y + R[2][0] * v.z,
    y: R[0][1] * v.x + R[1][1] * v.y + R[2][1] * v.z,
    z: R[0][2] * v.x + R[1][2] * v.y + R[2][2] * v.z,
  };
}