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
  inertiaDotB?: Vec3; // d(inertiaB)/dt (kg*m^2/s) — variable-inertia term (Gate 3)
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
export function addVec(a: Vec3, b: Vec3, h: number): Vec3 {
  return { x: a.x + b.x * h, y: a.y + b.y * h, z: a.z + b.z * h };
}

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
 *  Includes the variable-inertia term -I^{-1} (dI/dt) omega when inertiaDotB
 *  is provided (Gate 3). Precondition: inertiaB strictly positive
 *  (enforced by validateStateAndLoads). No silent clamping. */
export function angularAcceleration(w: Vec3, momentB: Vec3, inertiaB: Vec3, inertiaDotB?: Vec3): Vec3 {
  const Ix = inertiaB.x;
  const Iy = inertiaB.y;
  const Iz = inertiaB.z;
  const dIx = inertiaDotB?.x ?? 0;
  const dIy = inertiaDotB?.y ?? 0;
  const dIz = inertiaDotB?.z ?? 0;
  return {
    x: (momentB.x - dIx * w.x - ((Iz - Iy) * w.y * w.z)) / Ix,
    y: (momentB.y - dIy * w.y - ((Ix - Iz) * w.x * w.z)) / Iy,
    z: (momentB.z - dIz * w.z - ((Iy - Ix) * w.x * w.y)) / Iz,
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

  // Attitude invariant: enforce a validated, normalized quaternion BEFORE any
  // RHS callback. Reject quaternions whose norm deviates by more than 1e-6
  // from unity (a non-unit input would silently produce a non-orthogonal
  // first-stage rotation), then normalize ONCE and use it consistently.
  const qNorm0 = Math.sqrt(s.q.w * s.q.w + s.q.x * s.q.x + s.q.y * s.q.y + s.q.z * s.q.z);
  if (!(qNorm0 > 1e-6) || Math.abs(qNorm0 - 1) > 1e-6) {
    throw new Error(
      'strict rigid-body kernel: attitude must be a near-unit quaternion (|q|=1) at entry; use normalizeQuaternion() on the caller side'
    );
  }
  const q0n = { w: s.q.w / qNorm0, x: s.q.x / qNorm0, y: s.q.y / qNorm0, z: s.q.z / qNorm0 };

  const sNorm: RigidState = {
    r: { ...s.r },
    v: { ...s.v },
    q: q0n,
    w: { ...s.w },
  };

  const accelFor = (L: Loads): Vec3 => ({
    x: L.forceN.x / L.mass,
    y: L.forceN.y / L.mass,
    z: L.forceN.z / L.mass,
  });

  const deriv = (st: RigidState, L: Loads, _t: number): { dr: Vec3; dv: Vec3; dq: Quat; dw: Vec3 } => ({
    dr: st.v,
    dv: accelFor(L),
    dq: quaternionDerivative(st.q, st.w),
    dw: angularAcceleration(st.w, L.momentB, L.inertiaB, L.inertiaDotB),
  });


  const L0 = loadsAt ? loadsAt(startTime, sNorm) : loads;
  if (loadsAt) validateStateAndLoads(sNorm, L0, dt); // entry already validated `loads`; only factory output needs re-check
  const d1 = deriv(sNorm, L0, startTime);
  const tHalf = startTime + dt / 2;
  const tFull = startTime + dt;

  const s1: RigidState = {
    r: addVec(sNorm.r, d1.dr, dt / 2),
    v: addVec(sNorm.v, d1.dv, dt / 2),
    q: addQuat(sNorm.q, d1.dq, dt / 2),
    w: addVec(sNorm.w, d1.dw, dt / 2),
  };
  const L1 = loadsAt ? loadsAt(tHalf, s1) : loads;
  validateStateAndLoads(s1, L1, dt);
  const d2 = deriv(s1, L1, tHalf);

  const s2: RigidState = {
    r: addVec(sNorm.r, d2.dr, dt / 2),
    v: addVec(sNorm.v, d2.dv, dt / 2),
    q: addQuat(sNorm.q, d2.dq, dt / 2),
    w: addVec(sNorm.w, d2.dw, dt / 2),
  };
  const L2 = loadsAt ? loadsAt(tHalf, s2) : loads;
  validateStateAndLoads(s2, L2, dt);
  const d3 = deriv(s2, L2, tHalf);

  const s3: RigidState = {
    r: addVec(sNorm.r, d3.dr, dt),
    v: addVec(sNorm.v, d3.dv, dt),
    q: addQuat(sNorm.q, d3.dq, dt),
    w: addVec(sNorm.w, d3.dw, dt),
  };
  const L3 = loadsAt ? loadsAt(tFull, s3) : loads;
  validateStateAndLoads(s3, L3, dt);
  const d4 = deriv(s3, L3, tFull);

  const blend = (d1v: number, d2v: number, d3v: number, d4v: number): number =>
    (d1v + 2 * d2v + 2 * d3v + d4v) * dt / 6;

  const out: RigidState = {
    r: { x: sNorm.r.x + blend(d1.dr.x, d2.dr.x, d3.dr.x, d4.dr.x), y: sNorm.r.y + blend(d1.dr.y, d2.dr.y, d3.dr.y, d4.dr.y), z: sNorm.r.z + blend(d1.dr.z, d2.dr.z, d3.dr.z, d4.dr.z) },
    v: { x: sNorm.v.x + blend(d1.dv.x, d2.dv.x, d3.dv.x, d4.dv.x), y: sNorm.v.y + blend(d1.dv.y, d2.dv.y, d3.dv.y, d4.dv.y), z: sNorm.v.z + blend(d1.dv.z, d2.dv.z, d3.dv.z, d4.dv.z) },
    q: normalizeQuaternion({
      w: sNorm.q.w + blend(d1.dq.w, d2.dq.w, d3.dq.w, d4.dq.w),
      x: sNorm.q.x + blend(d1.dq.x, d2.dq.x, d3.dq.x, d4.dq.x),
      y: sNorm.q.y + blend(d1.dq.y, d2.dq.y, d3.dq.y, d4.dq.y),
      z: sNorm.q.z + blend(d1.dq.z, d2.dq.z, d3.dq.z, d4.dq.z),
    }),
    w: {
      x: sNorm.w.x + blend(d1.dw.x, d2.dw.x, d3.dw.x, d4.dw.x),
      y: sNorm.w.y + blend(d1.dw.y, d2.dw.y, d3.dw.y, d4.dw.y),
      z: sNorm.w.z + blend(d1.dw.z, d2.dw.z, d3.dw.z, d4.dw.z),
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
/**
 * Dormand-Prince RK 5(4) adaptive integration (NORMATIVE Gate 2).
 *
 * Adaptive embedded 5th/4th-order estimate over the coupled 13-component
 * state with bounded rejection. Repairs shipped in this revision:
 *   - the attitude error is the GEODESIC angle between the two full
 *     candidate attitudes q5 = normalize(q + dq5) and q4 = normalize(q + dq4)
 *     (derivative increments are not orientations; comparing the normalized
 *     candidates captures both magnitude and direction of the discrepancy);
 *   - rejection is bounded: consecutive-rejection and total-trial caps, a
 *     representable-progress floor tied to |t| (t + h must advance t), and
 *     growth/shrink step control based on the ACTUAL trial size h, never an
 *     unclipped dt;
 *   - every stage load-callback result is validated (finite components,
 *     positive finite mass, strictly positive inertias, finite inertia
 *     derivative);
 *   - finite error estimates, accepted-state validation, finite ordered
 *     t0/tEnd, positive finite tolerances, maxStep, dtInit;
 *   - minimal dense output: per accepted step a 4th-order-accurate cubic
 *     Hermite bracket (state + RHS derivative at both ends; the FSAL stage
 *     supplies the endpoint derivative at no extra evaluation) for event
 *     localization.
 * `integrateRigidStep` (fixed RK4) remains for benchmark parity; the adaptive
 * integrator supersedes it for production.
 */

export interface AdaptiveTolerances {
  r: number;   // position (m)
  v: number;   // velocity (m/s)
  q: number;   // attitude (rotation angle rad)
  w: number;   // angular rate (rad/s)
}

/** Coupled rigid-body RHS (translational + rotational derivatives). */
export interface StateDerivative {
  dr: Vec3;
  dv: Vec3;
  dq: Quat;
  dw: Vec3;
}

/** One accepted adaptive step recorded for dense output / event localization. */
export interface AdaptiveDenseStep {
  t0: number;
  /** actual trial size used for the accepted step (s) */
  h: number;
  y0: RigidState;
  /** RHS derivative at (t0, y0) — stage-1 k */
  f0: StateDerivative;
  y1: RigidState;
  /** RHS derivative at (t0+h, y1) — FSAL stage-7 k, zero extra evaluation */
  f1: StateDerivative;
}

export interface AdaptiveResult {
  state: RigidState;
  finalTime: number;
  steps: number;
  rejectedSteps: number;
  /** dense-output brackets, one per accepted step, in time order */
  dense: AdaptiveDenseStep[];
}

/** Bounded-rejection caps: a stalled step sequence fails closed promptly. */
const MAX_ADAPT_CONSECUTIVE_REJECTIONS = 500;
const MAX_ADAPT_TRIALS = 5_000;

const A_DP: number[] = [0, 1/5, 3/10, 4/5, 8/9, 1, 1];
const B_DP: number[][] = [
  [],
  [1/5],
  [3/40, 9/40],
  [44/45, -56/15, 32/9],
  [19372/6561, -25360/2187, 64448/6561, -212/729],
  [9017/3168, -355/33, 46732/5247, 49/176, -5103/18656],
  [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84],
];
const C5_DP: number[] = [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84, 0];
const C4_DP: number[] = [5179/57600, 0, 7571/16695, 393/640, -92097/339200, 187/2100, 1/40];

function normVec(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
/** Geodesic rotation angle between two unit quaternions: angle(qa ⊗ qb⁻¹). */
function relQuatAngle(qa: Quat, qb: Quat): number {
  const qab = {
    w: qa.w * qb.w + qa.x * qb.x + qa.y * qb.y + qa.z * qb.z,
    x: qa.w * qb.x - qa.x * qb.w - qa.y * qb.z + qa.z * qb.y,
    y: qa.w * qb.y + qa.x * qb.z - qa.y * qb.w - qa.z * qb.x,
    z: qa.w * qb.z - qa.x * qb.y + qa.y * qb.x - qa.z * qb.w,
  };
  const s = Math.sqrt(qab.x * qab.x + qab.y * qab.y + qab.z * qab.z);
  return 2 * Math.atan2(s, Math.abs(qab.w));
}
function subVec(a: Vec3, b: Vec3): Vec3 { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

/** Strict validation of a callback-returned load set (mass/inertia/finiteness). */
function validateLoads(L: Loads): void {
  const finite =
    Number.isFinite(L.forceN.x) && Number.isFinite(L.forceN.y) && Number.isFinite(L.forceN.z) &&
    Number.isFinite(L.momentB.x) && Number.isFinite(L.momentB.y) && Number.isFinite(L.momentB.z) &&
    Number.isFinite(L.inertiaB.x) && Number.isFinite(L.inertiaB.y) && Number.isFinite(L.inertiaB.z) &&
    (L.inertiaDotB === undefined ||
      (Number.isFinite(L.inertiaDotB.x) && Number.isFinite(L.inertiaDotB.y) && Number.isFinite(L.inertiaDotB.z)));
  if (!finite) {
    throw new Error('adaptive integrator: stage load callback returned a non-finite component');
  }
  if (!(L.mass > 0 && Number.isFinite(L.mass))) {
    throw new Error('adaptive integrator: stage load callback returned non-positive or non-finite mass');
  }
  if (L.inertiaB.x <= 0 || L.inertiaB.y <= 0 || L.inertiaB.z <= 0) {
    throw new Error('adaptive integrator: stage load callback returned non-positive principal inertia');
  }
}

/** Validate an accepted propagated state: finite, unit attitude. */
function validateAcceptedState(st: RigidState): void {
  const finite =
    Number.isFinite(st.r.x) && Number.isFinite(st.r.y) && Number.isFinite(st.r.z) &&
    Number.isFinite(st.v.x) && Number.isFinite(st.v.y) && Number.isFinite(st.v.z) &&
    Number.isFinite(st.w.x) && Number.isFinite(st.w.y) && Number.isFinite(st.w.z) &&
    Number.isFinite(st.q.w) && Number.isFinite(st.q.x) && Number.isFinite(st.q.y) && Number.isFinite(st.q.z);
  if (!finite) throw new Error('adaptive integrator: accepted state is non-finite');
  const qn = Math.sqrt(st.q.w * st.q.w + st.q.x * st.q.x + st.q.y * st.q.y + st.q.z * st.q.z);
  if (Math.abs(qn - 1) > 1e-6) {
    throw new Error('adaptive integrator: accepted attitude is not unit-norm');
  }
}

/**
 * Integrate from t0 with dynamic step sizing to reach tEnd.
 * Each accepted step records a dense-output bracket; returns the final state.
 */
export function integrateRigidAdaptive(
  s0: RigidState,
  loadsAt: LoadsAt,
  t0: number,
  tEnd: number,
  tol: AdaptiveTolerances,
  maxStep: number = 0.05,
  dtInit: number = 0.005
): AdaptiveResult {
  // Solver-control validation: finite, ordered times; positive finite
  // tolerances and step controls.
  if (!Number.isFinite(t0)) throw new Error('adaptive integrator: t0 must be finite');
  if (!Number.isFinite(tEnd) || tEnd <= t0) {
    throw new Error('adaptive integrator: tEnd must be finite and strictly greater than t0');
  }
  const tolFinitePositive =
    Number.isFinite(tol.r) && tol.r > 0 &&
    Number.isFinite(tol.v) && tol.v > 0 &&
    Number.isFinite(tol.q) && tol.q > 0 &&
    Number.isFinite(tol.w) && tol.w > 0;
  if (!tolFinitePositive) {
    throw new Error('adaptive integrator: all tolerances must be finite and strictly positive');
  }
  if (!(Number.isFinite(maxStep) && maxStep > 0)) {
    throw new Error('adaptive integrator: maxStep must be finite and strictly positive');
  }
  if (!(Number.isFinite(dtInit) && dtInit > 0)) {
    throw new Error('adaptive integrator: dtInit must be finite and strictly positive');
  }

  // Match the fixed-step strict entry contract: normalization corrects only
  // floating-point drift; it must never turn an arbitrary 4-vector into a
  // fabricated attitude before the first loads callback.
  const qNorm0 = Math.hypot(s0.q.w, s0.q.x, s0.q.y, s0.q.z);
  if (!(qNorm0 > 1e-9) || Math.abs(qNorm0 - 1) > 1e-6) {
    throw new Error(
      'adaptive integrator: attitude must be a near-unit quaternion (|q|=1) at entry; normalize it at the caller boundary'
    );
  }
  let s: RigidState = { ...s0, q: normalizeQuaternion({ ...s0.q }) };
  validateAcceptedState(s);
  let t = t0;
  let dt = Math.min(dtInit, maxStep);
  let steps = 0;
  let rejected = 0;
  let rejectStreak = 0;
  const dense: AdaptiveDenseStep[] = [];

  const accelFor = (L: Loads): Vec3 => ({ x: L.forceN.x / L.mass, y: L.forceN.y / L.mass, z: L.forceN.z / L.mass });
  const deriv = (st: RigidState, L: Loads): StateDerivative => ({
    dr: st.v,
    dv: accelFor(L),
    dq: quaternionDerivative(st.q, st.w),
    dw: angularAcceleration(st.w, L.momentB, L.inertiaB, L.inertiaDotB),
  });

  while (t < tEnd - 1e-12) {
    // Actual trial size: bounded by step control, maxStep, and remaining span.
    const h = Math.min(dt, maxStep, tEnd - t);
    // Representable-progress floor: below this, t + h cannot advance t in
    // floating point, so a rejection landing here can never converge.
    const floor = Number.EPSILON * Math.max(1, Math.abs(t), Math.abs(tEnd));

    const ks: StateDerivative[] = [];

    // Stage states + stage-load validation: the callback result at EVERY
    // stage (including stage 0) is validated before it feeds a derivative.
    for (let i = 0; i < 7; i++) {
      const ti = i === 0 ? t : t + A_DP[i] * h;
      let sti: RigidState;
      if (i === 0) {
        sti = s;
      } else {
        // accumulate k-linear combination
        const base = { r: { ...s.r }, v: { ...s.v }, q: { ...s.q }, w: { ...s.w } };
        let rr = { x: 0.0, y: 0.0, z: 0.0 };
        let vv = { x: 0.0, y: 0.0, z: 0.0 };
        let ww = { x: 0.0, y: 0.0, z: 0.0 };
        let qq = { w: 0.0, x: 0.0, y: 0.0, z: 0.0 };
        for (let j = 0; j < i; j++) {
          const b = B_DP[i][j];
          rr = addVec(rr, ks[j].dr, h * b);
          vv = addVec(vv, ks[j].dv, h * b);
          ww = addVec(ww, ks[j].dw, h * b);
          const dqj = ks[j].dq;
          qq.w += h * b * dqj.w;
          qq.x += h * b * dqj.x;
          qq.y += h * b * dqj.y;
          qq.z += h * b * dqj.z;
        }
        sti = {
          r: { x: base.r.x + rr.x, y: base.r.y + rr.y, z: base.r.z + rr.z },
          v: { x: base.v.x + vv.x, y: base.v.y + vv.y, z: base.v.z + vv.z },
          // Project every trial stage before a consumer turns q into a
          // rotation matrix. This matches fixed RK4 and keeps loadsAt on SO(3).
          q: addQuat(base.q, qq, 1.0),
          w: { x: base.w.x + ww.x, y: base.w.y + ww.y, z: base.w.z + ww.z },
        };
      }
      const L = loadsAt(ti, sti);
      validateLoads(L);
      ks.push(deriv(sti, L));
    }

    // 5th-order (C5) and 4th-order (C4) increment combinations.
    let r5 = { x: 0.0, y: 0.0, z: 0.0 };
    let v5 = { x: 0.0, y: 0.0, z: 0.0 };
    let w5 = { x: 0.0, y: 0.0, z: 0.0 };
    let q5 = { w: 0.0, x: 0.0, y: 0.0, z: 0.0 };
    let r4 = { x: 0.0, y: 0.0, z: 0.0 };
    let v4 = { x: 0.0, y: 0.0, z: 0.0 };
    let w4 = { x: 0.0, y: 0.0, z: 0.0 };
    let q4 = { w: 0.0, x: 0.0, y: 0.0, z: 0.0 };
    for (let i = 0; i < 7; i++) {
      r5 = addVec(r5, ks[i].dr, h * C5_DP[i]);
      v5 = addVec(v5, ks[i].dv, h * C5_DP[i]);
      w5 = addVec(w5, ks[i].dw, h * C5_DP[i]);
      const dqi = ks[i].dq;
      q5.w += h * C5_DP[i] * dqi.w;
      q5.x += h * C5_DP[i] * dqi.x;
      q5.y += h * C5_DP[i] * dqi.y;
      q5.z += h * C5_DP[i] * dqi.z;
      r4 = addVec(r4, ks[i].dr, h * C4_DP[i]);
      v4 = addVec(v4, ks[i].dv, h * C4_DP[i]);
      w4 = addVec(w4, ks[i].dw, h * C4_DP[i]);
      q4.w += h * C4_DP[i] * dqi.w;
      q4.x += h * C4_DP[i] * dqi.x;
      q4.y += h * C4_DP[i] * dqi.y;
      q4.z += h * C4_DP[i] * dqi.z;
    }

    // FULL candidate attitudes (normalized) — not raw derivative increments:
    // q5 = normalize(q + dq5), q4 = normalize(q + dq4).
    const q5cand = normalizeQuaternion({
      w: s.q.w + q5.w, x: s.q.x + q5.x, y: s.q.y + q5.y, z: s.q.z + q5.z,
    });
    const q4cand = normalizeQuaternion({
      w: s.q.w + q4.w, x: s.q.x + q4.x, y: s.q.y + q4.y, z: s.q.z + q4.z,
    });

    // Error vector = fifth-order estimate minus fourth-order (geodesic angle
    // for attitude).
    const errR = normVec(subVec(r5, r4));
    const errV = normVec(subVec(v5, v4));
    const errW = normVec(subVec(w5, w4));
    const errQ = relQuatAngle(q5cand, q4cand);

    // Finite-error validation: a non-finite estimate (e.g. overflowed stage
    // difference) must never drive step control; treat as a strong rejection.
    const errsFinite =
      Number.isFinite(errR) && Number.isFinite(errV) && Number.isFinite(errW) && Number.isFinite(errQ);
    if (!errsFinite) {
      rejected++;
      rejectStreak++;
      if (rejectStreak > MAX_ADAPT_CONSECUTIVE_REJECTIONS) {
        throw new Error(
          'adaptive integrator: ' + MAX_ADAPT_CONSECUTIVE_REJECTIONS +
          ' consecutive rejections with non-finite error estimates; loads model is not integrable'
        );
      }
      const shrunk = h * 0.2;
      if (shrunk <= floor) {
        throw new Error(
          'adaptive integrator: non-finite error estimate at the representable step floor (' + shrunk.toExponential(3) +
          ' s); tolerance/loads combination is not integrable'
        );
      }
      dt = shrunk;
      continue;
    }

    const rho = Math.min(
      errR <= 0 ? Infinity : Math.pow(tol.r / errR, 0.2),
      errV <= 0 ? Infinity : Math.pow(tol.v / errV, 0.2),
      errW <= 0 ? Infinity : Math.pow(tol.w / errW, 0.2),
      errQ <= 0 ? Infinity : Math.pow(tol.q / errQ, 0.2)
    );

    if (errR <= tol.r && errV <= tol.v && errW <= tol.w && errQ <= tol.q) {
      // Accepted: applied state is the normalized 5th-order candidate.
      const yPrev = s;
      const y1: RigidState = {
        r: { x: s.r.x + r5.x, y: s.r.y + r5.y, z: s.r.z + r5.z },
        v: { x: s.v.x + v5.x, y: s.v.y + v5.y, z: s.v.z + v5.z },
        q: q5cand,
        w: { x: s.w.x + w5.x, y: s.w.y + w5.y, z: s.w.z + w5.z },
      };
      validateAcceptedState(y1); // accepted-state validation: reject baked-in NaN/Inf/non-unit
      // FSAL stage (i = 6) evaluates the RHS exactly at the accepted 5th-order
      // candidate, so the dense bracket's endpoint derivative is free.
      dense.push({ t0: t, h, y0: yPrev, f0: ks[0], y1, f1: ks[6] });
      s = y1;
      t += h;
      steps++;
      rejectStreak = 0;
      // Step control ON THE ACTUAL TRIAL h (not an unclipped dt), bounded by
      // an 0.2x/5x clamp and maxStep.
      const growth = Number.isFinite(rho) ? Math.max(0.2, Math.min(5.0, 0.9 * rho)) : 5.0;
      dt = Math.min(maxStep, h * growth);
    } else {
      rejected++;
      rejectStreak++;
      if (rejectStreak > MAX_ADAPT_CONSECUTIVE_REJECTIONS) {
        throw new Error(
          'adaptive integrator: ' + MAX_ADAPT_CONSECUTIVE_REJECTIONS +
          ' consecutive rejected trials at nondecreasing size; tolerance/loads combination is not integrable'
        );
      }
      // Shrink the ACTUAL trial h; never clamp back up to a stale dt.
      const dtNew = h * Math.max(0.2, 0.9 * rho);
      if (dtNew <= floor) {
        throw new Error(
          'adaptive integrator: rejected step cannot make representable progress (h = ' +
          dtNew.toExponential(3) + ' s at floor ' + floor.toExponential(3) +
          '); tolerance is unachievable with this loads model'
        );
      }
      dt = dtNew;
    }

    if (steps + rejected > MAX_ADAPT_TRIALS) {
      throw new Error(
        'adaptive integrator: exceeded ' + MAX_ADAPT_TRIALS + ' total trials; integration did not terminate'
      );
    }
  }

  return { state: s, finalTime: t, steps, rejectedSteps: rejected, dense };
}

/**
 * Evaluate the 4th-order cubic Hermite dense output at time `t` within the
 * recorded integration span. The interpolant matches state AND RHS derivative
 * at both ends of each accepted step, so pointwise error is O(h^4) — the
 * contracted dense-output order for event localization.
 * Throws outside the span; t exactly on a step boundary reads the step that
 * ends there.
 */
export function denseOutputAt(dense: readonly AdaptiveDenseStep[], t: number): RigidState {
  if (dense.length === 0) throw new Error('dense output: no accepted steps recorded');
  const spanT0 = dense[0].t0;
  const spanT1 = dense[dense.length - 1].t0 + dense[dense.length - 1].h;
  if (!(t >= spanT0 && t <= spanT1)) {
    throw new Error('dense output: query time ' + t + ' is outside integration span [' + spanT0 + ', ' + spanT1 + ']');
  }
  let idx = dense.length - 1;
  for (let i = 0; i < dense.length; i++) {
    if (t <= dense[i].t0 + dense[i].h + 1e-12) { idx = i; break; }
  }
  const d = dense[idx];
  const u = d.h > 0 ? (t - d.t0) / d.h : 0;
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;   // weight of y0
  const h10 = u3 - 2 * u2 + u;       // weight of h*f0
  const h01 = -2 * u3 + 3 * u2;      // weight of y1
  const h11 = u3 - u2;               // weight of h*f1
  // 13 component call sites share this one lockstep Hermite formula.
  const herm = (c0: number, dc0: number, c1: number, dc1: number): number =>
    h00 * c0 + h10 * dc0 + h01 * c1 + h11 * dc1;
  const qh = {
    w: herm(d.y0.q.w, d.f0.dq.w * d.h, d.y1.q.w, d.f1.dq.w * d.h),
    x: herm(d.y0.q.x, d.f0.dq.x * d.h, d.y1.q.x, d.f1.dq.x * d.h),
    y: herm(d.y0.q.y, d.f0.dq.y * d.h, d.y1.q.y, d.f1.dq.y * d.h),
    z: herm(d.y0.q.z, d.f0.dq.z * d.h, d.y1.q.z, d.f1.dq.z * d.h),
  };
  return {
    r: {
      x: herm(d.y0.r.x, d.f0.dr.x * d.h, d.y1.r.x, d.f1.dr.x * d.h),
      y: herm(d.y0.r.y, d.f0.dr.y * d.h, d.y1.r.y, d.f1.dr.y * d.h),
      z: herm(d.y0.r.z, d.f0.dr.z * d.h, d.y1.r.z, d.f1.dr.z * d.h),
    },
    v: {
      x: herm(d.y0.v.x, d.f0.dv.x * d.h, d.y1.v.x, d.f1.dv.x * d.h),
      y: herm(d.y0.v.y, d.f0.dv.y * d.h, d.y1.v.y, d.f1.dv.y * d.h),
      z: herm(d.y0.v.z, d.f0.dv.z * d.h, d.y1.v.z, d.f1.dv.z * d.h),
    },
    q: normalizeQuaternion(qh),
    w: {
      x: herm(d.y0.w.x, d.f0.dw.x * d.h, d.y1.w.x, d.f1.dw.x * d.h),
      y: herm(d.y0.w.y, d.f0.dw.y * d.h, d.y1.w.y, d.f1.dw.y * d.h),
      z: herm(d.y0.w.z, d.f0.dw.z * d.h, d.y1.w.z, d.f1.dw.z * d.h),
    },
  };
}