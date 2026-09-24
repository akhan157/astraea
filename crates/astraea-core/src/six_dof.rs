//! 6-DOF trajectory kernel — Rust port of the TS oracle
//! (`src/sim/sixDofSimulator.ts` + `src/dynamics/{loads,rigidBody,events}.ts`).
//!
//! Faithful port strategy: the rigid-body math (quaternion, rotation,
//! DP5(4) adaptive integrator with dense output), the event FSM
//! (`detect_events`, `event_crossed_at_root`, `select_next_candidate`,
//! `selected_prereqs_met`, `clamp_rail_base_contact`), the rail-constraint
//! policy, the ISA atmosphere, wind shear, motor interpolation/depletion,
//! and the full `compute_flight_loads` force/moment/validity assembly are
//! implemented inline with the same formulas as TS.
//!
//! Documented simplifications (coarse-grained API, no per-step IPC):
//! * `Vehicle` carries **precomputed** geometry/aerodynamics (dry mass, CG,
//!   Barrowman normal-slope split, drag tables). The TS `prepareVehicle`
//!   pipeline (mass rollup, Barrowman stability, transonic curve generation)
//!   is NOT re-implemented; the parity tests embed the oracle-extracted
//!   tables for the Estes Alpha fixture, so the comparison is exact for the
//!   anchored vehicle. Tolerance contribution: zero by construction for the
//!   anchor; other vehicles must supply consistent tables.
//! * Per-step telemetry is omitted (Tauri IPC rule: coarse API only). Metrics,
//!   events, and landing state are returned. Tolerance contribution: none —
//!   telemetry is display rounding of the same committed states.
//! * The run manifest is a fixed set of descriptive strings matching the TS
//!   manifest. Tolerance contribution: none (metadata only).
//!
//! Verified parity: zero-wind vertical Estes Alpha / C6 flight matches the TS
//! oracle apogee within 0.5% relative and landing drift within 5 m absolute
//! (both far inside the band; actual agreement is much tighter — see tests).

use std::f64::consts::PI;

const G0: f64 = 9.80665;

// ---------------------------------------------------------------------------
// Small math types
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub fn zero() -> Self {
        Self { x: 0.0, y: 0.0, z: 0.0 }
    }
    fn dot(&self, o: &Vec3) -> f64 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    fn norm(&self) -> f64 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Quat {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RigidState {
    pub r: Vec3, // position, navigation frame ENU (m)
    pub v: Vec3, // velocity, navigation frame (m/s)
    pub q: Quat, // attitude body -> navigation
    pub w: Vec3, // body rate {x:pitch, y:roll, z:yaw} (rad/s)
}

/// Active-model validity reported by the loads assembly.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StageValidity {
    Valid,
    Extrapolated,
    Unsupported,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Loads {
    pub force_n: Vec3,
    pub moment_b: Vec3,
    pub inertia_b: Vec3, // {pitch, roll, yaw}
    pub inertia_dot_b: Vec3,
    pub mass: f64,
    pub validity: StageValidity,
}

// --- quaternion / rotation kernel (mirrors rigidBody.ts) ---

pub fn normalize_quaternion(q: &Quat) -> Quat {
    let len = (q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z).sqrt();
    if len < 1e-9 || !len.is_finite() {
        panic!("strict rigid-body kernel: degenerate quaternion (|q| ~ 0 or nonfinite); refusing to fabricate an attitude");
    }
    let inv = 1.0 / len;
    Quat { w: q.w * inv, x: q.x * inv, y: q.y * inv, z: q.z * inv }
}

fn add_vec(a: &Vec3, b: &Vec3, h: f64) -> Vec3 {
    Vec3 { x: a.x + b.x * h, y: a.y + b.y * h, z: a.z + b.z * h }
}

fn add_quat(q: &Quat, dq: &Quat, h: f64) -> Quat {
    normalize_quaternion(&Quat {
        w: q.w + dq.w * h,
        x: q.x + dq.x * h,
        y: q.y + dq.y * h,
        z: q.z + dq.z * h,
    })
}

fn quaternion_derivative(q: &Quat, w: &Vec3) -> Quat {
    let wx = w.x * 0.5;
    let wy = w.y * 0.5;
    let wz = w.z * 0.5;
    Quat {
        w: -q.x * wx - q.y * wy - q.z * wz,
        x: q.w * wx + q.y * wz - q.z * wy,
        y: q.w * wy - q.x * wz + q.z * wx,
        z: q.w * wz + q.x * wy - q.y * wx,
    }
}

fn angular_acceleration(w: &Vec3, moment_b: &Vec3, inertia_b: &Vec3, inertia_dot_b: &Vec3) -> Vec3 {
    let ix = inertia_b.x;
    let iy = inertia_b.y;
    let iz = inertia_b.z;
    Vec3 {
        x: (moment_b.x - inertia_dot_b.x * w.x - ((iz - iy) * w.y * w.z)) / ix,
        y: (moment_b.y - inertia_dot_b.y * w.y - ((ix - iz) * w.x * w.z)) / iy,
        z: (moment_b.z - inertia_dot_b.z * w.z - ((iy - ix) * w.x * w.y)) / iz,
    }
}

pub fn quaternion_to_matrix(q: &Quat) -> [[f64; 3]; 3] {
    let (w, x, y, z) = (q.w, q.x, q.y, q.z);
    [
        [1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y - z * w), 2.0 * (x * z + y * w)],
        [2.0 * (x * y + z * w), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z - x * w)],
        [2.0 * (x * z - y * w), 2.0 * (y * z + x * w), 1.0 - 2.0 * (x * x + y * y)],
    ]
}

pub fn rotate_body_to_world(r: &[[f64; 3]; 3], v: &Vec3) -> Vec3 {
    Vec3 {
        x: r[0][0] * v.x + r[0][1] * v.y + r[0][2] * v.z,
        y: r[1][0] * v.x + r[1][1] * v.y + r[1][2] * v.z,
        z: r[2][0] * v.x + r[2][1] * v.y + r[2][2] * v.z,
    }
}

pub fn rotate_world_to_body(r: &[[f64; 3]; 3], v: &Vec3) -> Vec3 {
    Vec3 {
        x: r[0][0] * v.x + r[1][0] * v.y + r[2][0] * v.z,
        y: r[0][1] * v.x + r[1][1] * v.y + r[2][1] * v.z,
        z: r[0][2] * v.x + r[1][2] * v.y + r[2][2] * v.z,
    }
}

/// Body-rate adapter: sim {p:roll, q:pitch, r:yaw} -> kernel {x:pitch,y:roll,z:yaw}.
pub fn sim_omega_to_kernel(p: f64, q: f64, r: f64) -> Vec3 {
    Vec3 { x: q, y: p, z: r }
}
pub fn kernel_omega_to_sim(w: &Vec3) -> (f64, f64, f64) {
    (w.y, w.x, w.z)
}

/// Attitude quaternion to presentation Euler angles (degrees). Mirrors TS.
pub fn quaternion_to_euler_deg(q: &Quat) -> (f64, f64, f64) {
    let (w, x, y, z) = (q.w, q.x, q.y, q.z);
    let sin_pitch = 2.0 * (w * x - y * z);
    let pitch = if sin_pitch.abs() >= 1.0 {
        sin_pitch.signum() * (PI / 2.0)
    } else {
        sin_pitch.asin()
    };
    let roll = (2.0 * (w * y + z * x)).atan2(1.0 - 2.0 * (x * x + y * y));
    let yaw = (2.0 * (w * z + x * y)).atan2(1.0 - 2.0 * (y * y + z * z));
    let d = 180.0 / PI;
    (pitch * d, roll * d, yaw * d)
}

// ---------------------------------------------------------------------------
// Adaptive DP5(4) integrator (mirrors rigidBody.ts integrateRigidAdaptive)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
pub struct AdaptiveTolerances {
    pub r: f64,
    pub v: f64,
    pub q: f64,
    pub w: f64,
}

#[derive(Clone, Copy, Debug)]
struct StateDerivative {
    dr: Vec3,
    dv: Vec3,
    dq: Quat,
    dw: Vec3,
}

#[derive(Clone, Debug)]
struct AdaptiveDenseStep {
    t0: f64,
    h: f64,
    t1: f64,
    y0: RigidState,
    f0: StateDerivative,
    y1: RigidState,
    f1: StateDerivative,
}

#[derive(Debug)]
struct AdaptiveResult {
    state: RigidState,
    dense: Vec<AdaptiveDenseStep>,
    committed_validity: Vec<StageValidity>,
}

const MAX_ADAPT_CONSECUTIVE_REJECTIONS: u32 = 500;
const MAX_ADAPT_TRIALS: u32 = 5_000;

const A_DP: [f64; 7] = [0.0, 1.0 / 5.0, 3.0 / 10.0, 4.0 / 5.0, 8.0 / 9.0, 1.0, 1.0];
const B_DP_0: &[f64] = &[];
const B_DP_1: &[f64] = &[1.0 / 5.0];
const B_DP_2: &[f64] = &[3.0 / 40.0, 9.0 / 40.0];
const B_DP_3: &[f64] = &[44.0 / 45.0, -56.0 / 15.0, 32.0 / 9.0];
const B_DP_4: &[f64] = &[19372.0 / 6561.0, -25360.0 / 2187.0, 64448.0 / 6561.0, -212.0 / 729.0];
const B_DP_5: &[f64] = &[9017.0 / 3168.0, -355.0 / 33.0, 46732.0 / 5247.0, 49.0 / 176.0, -5103.0 / 18656.0];
const B_DP_6: &[f64] = &[35.0 / 384.0, 0.0, 500.0 / 1113.0, 125.0 / 192.0, -2187.0 / 6784.0, 11.0 / 84.0];
const C5_DP: [f64; 7] = [35.0 / 384.0, 0.0, 500.0 / 1113.0, 125.0 / 192.0, -2187.0 / 6784.0, 11.0 / 84.0, 0.0];
const C4_DP: [f64; 7] =
    [5179.0 / 57600.0, 0.0, 7571.0 / 16695.0, 393.0 / 640.0, -92097.0 / 339200.0, 187.0 / 2100.0, 1.0 / 40.0];

fn b_dp(i: usize) -> &'static [f64] {
    match i {
        0 => B_DP_0,
        1 => B_DP_1,
        2 => B_DP_2,
        3 => B_DP_3,
        4 => B_DP_4,
        5 => B_DP_5,
        _ => B_DP_6,
    }
}

fn validate_loads(l: &Loads) {
    let finite = l.force_n.x.is_finite()
        && l.force_n.y.is_finite()
        && l.force_n.z.is_finite()
        && l.moment_b.x.is_finite()
        && l.moment_b.y.is_finite()
        && l.moment_b.z.is_finite()
        && l.inertia_b.x.is_finite()
        && l.inertia_b.y.is_finite()
        && l.inertia_b.z.is_finite()
        && l.inertia_dot_b.x.is_finite()
        && l.inertia_dot_b.y.is_finite()
        && l.inertia_dot_b.z.is_finite();
    if !finite {
        panic!("adaptive integrator: stage load callback returned a non-finite component");
    }
    if !(l.mass > 0.0 && l.mass.is_finite()) {
        panic!("adaptive integrator: stage load callback returned non-positive or non-finite mass");
    }
    if l.inertia_b.x <= 0.0 || l.inertia_b.y <= 0.0 || l.inertia_b.z <= 0.0 {
        panic!("adaptive integrator: stage load callback returned non-positive principal inertia");
    }
}

fn validate_accepted_state(st: &RigidState) {
    let finite = st.r.x.is_finite()
        && st.r.y.is_finite()
        && st.r.z.is_finite()
        && st.v.x.is_finite()
        && st.v.y.is_finite()
        && st.v.z.is_finite()
        && st.w.x.is_finite()
        && st.w.y.is_finite()
        && st.w.z.is_finite()
        && st.q.w.is_finite()
        && st.q.x.is_finite()
        && st.q.y.is_finite()
        && st.q.z.is_finite();
    if !finite {
        panic!("adaptive integrator: accepted state is non-finite");
    }
    let qn = (st.q.w * st.q.w + st.q.x * st.q.x + st.q.y * st.q.y + st.q.z * st.q.z).sqrt();
    if (qn - 1.0).abs() > 1e-6 {
        panic!("adaptive integrator: accepted attitude is not unit-norm");
    }
}

fn worst_validity(vs: &[StageValidity]) -> StageValidity {
    let mut worst = StageValidity::Valid;
    for v in vs {
        match v {
            StageValidity::Unsupported => return StageValidity::Unsupported,
            StageValidity::Extrapolated => worst = StageValidity::Extrapolated,
            StageValidity::Valid => {}
        }
    }
    worst
}

fn integrate_rigid_adaptive(
    s0: &RigidState,
    loads_at: &dyn Fn(f64, &RigidState) -> Loads,
    t0: f64,
    t_end: f64,
    tol: &AdaptiveTolerances,
    max_step: f64,
    dt_init: f64,
) -> AdaptiveResult {
    if !t0.is_finite() {
        panic!("adaptive integrator: t0 must be finite");
    }
    if !t_end.is_finite() || t_end <= t0 {
        panic!("adaptive integrator: tEnd must be finite and strictly greater than t0");
    }
    if !(tol.r.is_finite() && tol.r > 0.0
        && tol.v.is_finite() && tol.v > 0.0
        && tol.q.is_finite() && tol.q > 0.0
        && tol.w.is_finite() && tol.w > 0.0)
    {
        panic!("adaptive integrator: all tolerances must be finite and strictly positive");
    }
    if !(max_step.is_finite() && max_step > 0.0) {
        panic!("adaptive integrator: maxStep must be finite and strictly positive");
    }
    if !(dt_init.is_finite() && dt_init > 0.0) {
        panic!("adaptive integrator: dtInit must be finite and strictly positive");
    }
    let qn0 = (s0.q.w * s0.q.w + s0.q.x * s0.q.x + s0.q.y * s0.q.y + s0.q.z * s0.q.z).sqrt();
    if !(qn0 > 1e-9) || (qn0 - 1.0).abs() > 1e-6 {
        panic!("adaptive integrator: attitude must be a near-unit quaternion (|q|=1) at entry; normalize it at the caller boundary");
    }
    let mut s = RigidState { r: s0.r, v: s0.v, q: normalize_quaternion(&s0.q), w: s0.w };
    validate_accepted_state(&s);
    let mut t = t0;
    let mut dt = dt_init.min(max_step);
    let mut steps: u32 = 0;
    let mut rejected: u32 = 0;
    let mut reject_streak: u32 = 0;
    let mut committed_validity: Vec<StageValidity> = Vec::new();
    let mut dense: Vec<AdaptiveDenseStep> = Vec::new();

    let deriv = |st: &RigidState, l: &Loads| -> StateDerivative {
        StateDerivative {
            dr: st.v,
            dv: Vec3 {
                x: l.force_n.x / l.mass,
                y: l.force_n.y / l.mass,
                z: l.force_n.z / l.mass,
            },
            dq: quaternion_derivative(&st.q, &st.w),
            dw: angular_acceleration(&st.w, &l.moment_b, &l.inertia_b, &l.inertia_dot_b),
        }
    };

    while t < t_end {
        if steps + rejected >= MAX_ADAPT_TRIALS {
            panic!("adaptive integrator: exceeded total trial limit");
        }
        let remaining = t_end - t;
        let h = dt.min(max_step).min(remaining);
        let next_time = if h >= remaining { t_end } else { t + h };
        if !next_time.is_finite() || next_time <= t {
            panic!("adaptive integrator: trial cannot make representable progress");
        }
        let floor = f64::EPSILON * 1.0f64.max(t.abs()).max(t_end.abs());

        let mut trial_validity: Vec<StageValidity> = Vec::with_capacity(7);
        let mut ks: Vec<StateDerivative> = Vec::with_capacity(7);

        for i in 0..7 {
            let ti = if i == 0 { t } else if A_DP[i] == 1.0 { next_time } else { t + A_DP[i] * h };
            let sti: RigidState;
            if i == 0 {
                sti = s;
            } else {
                let b = b_dp(i);
                let mut rr = Vec3::zero();
                let mut vv = Vec3::zero();
                let mut ww = Vec3::zero();
                let mut qq = Quat { w: 0.0, x: 0.0, y: 0.0, z: 0.0 };
                for j in 0..i {
                    let bj = b[j];
                    rr = add_vec(&rr, &ks[j].dr, h * bj);
                    vv = add_vec(&vv, &ks[j].dv, h * bj);
                    ww = add_vec(&ww, &ks[j].dw, h * bj);
                    let dqj = ks[j].dq;
                    qq.w += h * bj * dqj.w;
                    qq.x += h * bj * dqj.x;
                    qq.y += h * bj * dqj.y;
                    qq.z += h * bj * dqj.z;
                }
                sti = RigidState {
                    r: Vec3 { x: s.r.x + rr.x, y: s.r.y + rr.y, z: s.r.z + rr.z },
                    v: Vec3 { x: s.v.x + vv.x, y: s.v.y + vv.y, z: s.v.z + vv.z },
                    q: add_quat(&s.q, &qq, 1.0),
                    w: Vec3 { x: s.w.x + ww.x, y: s.w.y + ww.y, z: s.w.z + ww.z },
                };
            }
            validate_accepted_state(&sti);
            let l = loads_at(ti, &sti);
            validate_loads(&l);
            trial_validity.push(l.validity);
            ks.push(deriv(&sti, &l));
        }

        let mut r5 = Vec3::zero();
        let mut v5 = Vec3::zero();
        let mut w5 = Vec3::zero();
        let mut q5 = Quat { w: 0.0, x: 0.0, y: 0.0, z: 0.0 };
        let mut r4 = Vec3::zero();
        let mut v4 = Vec3::zero();
        let mut w4 = Vec3::zero();
        let mut q4 = Quat { w: 0.0, x: 0.0, y: 0.0, z: 0.0 };
        for i in 0..7 {
            r5 = add_vec(&r5, &ks[i].dr, h * C5_DP[i]);
            v5 = add_vec(&v5, &ks[i].dv, h * C5_DP[i]);
            w5 = add_vec(&w5, &ks[i].dw, h * C5_DP[i]);
            q5.w += h * C5_DP[i] * ks[i].dq.w;
            q5.x += h * C5_DP[i] * ks[i].dq.x;
            q5.y += h * C5_DP[i] * ks[i].dq.y;
            q5.z += h * C5_DP[i] * ks[i].dq.z;
            r4 = add_vec(&r4, &ks[i].dr, h * C4_DP[i]);
            v4 = add_vec(&v4, &ks[i].dv, h * C4_DP[i]);
            w4 = add_vec(&w4, &ks[i].dw, h * C4_DP[i]);
            q4.w += h * C4_DP[i] * ks[i].dq.w;
            q4.x += h * C4_DP[i] * ks[i].dq.x;
            q4.y += h * C4_DP[i] * ks[i].dq.y;
            q4.z += h * C4_DP[i] * ks[i].dq.z;
        }
        let q5cand = normalize_quaternion(&Quat {
            w: s.q.w + q5.w,
            x: s.q.x + q5.x,
            y: s.q.y + q5.y,
            z: s.q.z + q5.z,
        });
        let q4cand = normalize_quaternion(&Quat {
            w: s.q.w + q4.w,
            x: s.q.x + q4.x,
            y: s.q.y + q4.y,
            z: s.q.z + q4.z,
        });

        let err_r = add_vec(&r5, &Vec3 { x: -r4.x, y: -r4.y, z: -r4.z }, 1.0).norm();
        let err_v = add_vec(&v5, &Vec3 { x: -v4.x, y: -v4.y, z: -v4.z }, 1.0).norm();
        let err_w = add_vec(&w5, &Vec3 { x: -w4.x, y: -w4.y, z: -w4.z }, 1.0).norm();
        let err_q = rel_quat_angle(&q5cand, &q4cand);

        if !(err_r.is_finite() && err_v.is_finite() && err_w.is_finite() && err_q.is_finite()) {
            rejected += 1;
            reject_streak += 1;
            if reject_streak > MAX_ADAPT_CONSECUTIVE_REJECTIONS {
                panic!("adaptive integrator: 500 consecutive rejections with non-finite error estimates; loads model is not integrable");
            }
            let shrunk = h * 0.2;
            if shrunk <= floor {
                panic!("adaptive integrator: non-finite error estimate at the representable step floor; tolerance/loads combination is not integrable");
            }
            dt = shrunk;
            continue;
        }

        let rho = (if err_r <= 0.0 { f64::INFINITY } else { (tol.r / err_r).powf(0.2) })
            .min(if err_v <= 0.0 { f64::INFINITY } else { (tol.v / err_v).powf(0.2) })
            .min(if err_w <= 0.0 { f64::INFINITY } else { (tol.w / err_w).powf(0.2) })
            .min(if err_q <= 0.0 { f64::INFINITY } else { (tol.q / err_q).powf(0.2) });

        if err_r <= tol.r && err_v <= tol.v && err_w <= tol.w && err_q <= tol.q {
            let y_prev = s;
            let y1 = RigidState {
                r: Vec3 { x: s.r.x + r5.x, y: s.r.y + r5.y, z: s.r.z + r5.z },
                v: Vec3 { x: s.v.x + v5.x, y: s.v.y + v5.y, z: s.v.z + v5.z },
                q: q5cand,
                w: Vec3 { x: s.w.x + w5.x, y: s.w.y + w5.y, z: s.w.z + w5.z },
            };
            dense.push(AdaptiveDenseStep { t0: t, h, t1: next_time, y0: y_prev, f0: ks[0], y1, f1: ks[6] });
            committed_validity.push(worst_validity(&trial_validity));
            s = y1;
            t = next_time;
            steps += 1;
            reject_streak = 0;
            let growth = if rho.is_finite() { 0.2f64.max(5.0f64.min(0.9 * rho)) } else { 5.0 };
            dt = max_step.min(h * growth);
        } else {
            rejected += 1;
            reject_streak += 1;
            if reject_streak > MAX_ADAPT_CONSECUTIVE_REJECTIONS {
                panic!("adaptive integrator: 500 consecutive rejected trials at nondecreasing size; tolerance/loads combination is not integrable");
            }
            let dt_new = h * (0.2f64.max(0.9 * rho));
            if dt_new <= floor {
                panic!("adaptive integrator: rejected step cannot make representable progress; tolerance is unachievable with this loads model");
            }
            dt = dt_new;
        }
    }

    AdaptiveResult { state: s, dense, committed_validity }
}

fn rel_quat_angle(qa: &Quat, qb: &Quat) -> f64 {
    // angle(qa ⊗ qb⁻¹)
    let w = qa.w * qb.w + qa.x * qb.x + qa.y * qb.y + qa.z * qb.z;
    let x = qa.w * qb.x - qa.x * qb.w - qa.y * qb.z + qa.z * qb.y;
    let y = qa.w * qb.y + qa.x * qb.z - qa.y * qb.w - qa.z * qb.x;
    let z = qa.w * qb.z - qa.x * qb.y + qa.y * qb.x - qa.z * qb.w;
    let s = (x * x + y * y + z * z).sqrt();
    2.0 * s.atan2(w.abs())
}

fn dense_output_at(dense: &[AdaptiveDenseStep], t: f64) -> RigidState {
    if dense.is_empty() {
        panic!("dense output: no accepted steps recorded");
    }
    let span_t0 = dense[0].t0;
    let span_t1 = dense[dense.len() - 1].t1;
    if !(t >= span_t0 && t <= span_t1) {
        panic!("dense output: query time {} is outside integration span [{}, {}]", t, span_t0, span_t1);
    }
    let mut idx = 0;
    while idx + 1 < dense.len() && t > dense[idx].t1 {
        idx += 1;
    }
    let d = &dense[idx];
    if t == d.t0 {
        return d.y0;
    }
    if t == d.t1 {
        return d.y1;
    }
    let span = d.t1 - d.t0;
    let u = if span > 0.0 { (t - d.t0) / span } else { 0.0 };
    let u2 = u * u;
    let u3 = u2 * u;
    let h00 = 2.0 * u3 - 3.0 * u2 + 1.0;
    let h10 = u3 - 2.0 * u2 + u;
    let h01 = -2.0 * u3 + 3.0 * u2;
    let h11 = u3 - u2;
    let herm = |c0: f64, dc0: f64, c1: f64, dc1: f64| -> f64 { h00 * c0 + h10 * dc0 + h01 * c1 + h11 * dc1 };
    let qh = Quat {
        w: herm(d.y0.q.w, d.f0.dq.w * span, d.y1.q.w, d.f1.dq.w * span),
        x: herm(d.y0.q.x, d.f0.dq.x * span, d.y1.q.x, d.f1.dq.x * span),
        y: herm(d.y0.q.y, d.f0.dq.y * span, d.y1.q.y, d.f1.dq.y * span),
        z: herm(d.y0.q.z, d.f0.dq.z * span, d.y1.q.z, d.f1.dq.z * span),
    };
    RigidState {
        r: Vec3 {
            x: herm(d.y0.r.x, d.f0.dr.x * span, d.y1.r.x, d.f1.dr.x * span),
            y: herm(d.y0.r.y, d.f0.dr.y * span, d.y1.r.y, d.f1.dr.y * span),
            z: herm(d.y0.r.z, d.f0.dr.z * span, d.y1.r.z, d.f1.dr.z * span),
        },
        v: Vec3 {
            x: herm(d.y0.v.x, d.f0.dv.x * span, d.y1.v.x, d.f1.dv.x * span),
            y: herm(d.y0.v.y, d.f0.dv.y * span, d.y1.v.y, d.f1.dv.y * span),
            z: herm(d.y0.v.z, d.f0.dv.z * span, d.y1.v.z, d.f1.dv.z * span),
        },
        q: normalize_quaternion(&qh),
        w: Vec3 {
            x: herm(d.y0.w.x, d.f0.dw.x * span, d.y1.w.x, d.f1.dw.x * span),
            y: herm(d.y0.w.y, d.f0.dw.y * span, d.y1.w.y, d.f1.dw.y * span),
            z: herm(d.y0.w.z, d.f0.dw.z * span, d.y1.w.z, d.f1.dw.z * span),
        },
    }
}

// ---------------------------------------------------------------------------
// Events (mirrors events.ts + sixDofSimulator event-policy helpers)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AstraeaEvent {
    None,
    RailExit,
    MotorBurnout,
    ApogeeDrogue,
    MainDeploy,
    Touchdown,
}

fn event_priority(e: &AstraeaEvent) -> i32 {
    match e {
        AstraeaEvent::None => 5,
        AstraeaEvent::RailExit => 0,
        AstraeaEvent::MotorBurnout => 1,
        AstraeaEvent::ApogeeDrogue => 2,
        AstraeaEvent::MainDeploy => 3,
        AstraeaEvent::Touchdown => 4,
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct EventState {
    pub has_left_rail: bool,
    pub has_burned_out: bool,
    pub is_apogee_reached: bool,
    pub is_main_deployed: bool,
    pub touched_down: bool,
    pub pending_apogee_time: Option<f64>,
    pub pending_apogee_alt: Option<f64>,
}

impl EventState {
    fn newton() -> Self {
        Self {
            has_left_rail: false,
            has_burned_out: false,
            is_apogee_reached: false,
            is_main_deployed: false,
            touched_down: false,
            pending_apogee_time: None,
            pending_apogee_alt: None,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct EventSamplePair {
    pub t: f64,
    pub altitude_along_rail: f64,
    pub vertical_velocity: f64,
    pub altitude: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct EventInput {
    pub t: f64,
    pub altitude_along_rail: f64,
    pub rail_length: f64,
    pub burn_time: f64,
    pub vertical_velocity: f64,
    pub altitude: f64,
    pub main_deploy_alt: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct LocalizedEvent {
    pub name: AstraeaEvent,
    pub time: f64,
}

pub struct EventResult {
    pub fires: Vec<AstraeaEvent>,
    pub events: Vec<LocalizedEvent>,
    pub state: EventState,
}

pub fn localize_crossing(t0: f64, val0: f64, t1: f64, val1: f64, target: f64) -> f64 {
    if (val1 - val0).abs() < 1e-15 {
        return t0;
    }
    let frac = (target - val0) / (val1 - val0);
    t0 + frac * (t1 - t0)
}

pub fn localize_crossing_filtered(
    t0: f64,
    val0: f64,
    t1: f64,
    val1: f64,
    target: f64,
    direction: &str,
) -> f64 {
    if direction == "ascending" && val1 <= val0 {
        return -1.0;
    }
    if direction == "descending" && val1 >= val0 {
        return -1.0;
    }
    let lo = val0.min(val1);
    let hi = val0.max(val1);
    if target < lo || target > hi {
        return -1.0;
    }
    localize_crossing(t0, val0, t1, val1, target)
}

pub fn detect_events(prev: &EventState, prev_s: &EventSamplePair, inp: &EventInput) -> EventResult {
    let mut s = EventState {
        has_left_rail: prev.has_left_rail,
        has_burned_out: prev.has_burned_out,
        is_apogee_reached: prev.is_apogee_reached,
        is_main_deployed: prev.is_main_deployed,
        touched_down: prev.touched_down,
        pending_apogee_time: prev.pending_apogee_time,
        pending_apogee_alt: prev.pending_apogee_alt,
    };
    let mut events: Vec<LocalizedEvent> = Vec::new();

    let finite = prev_s.t.is_finite()
        && prev_s.altitude_along_rail.is_finite()
        && prev_s.vertical_velocity.is_finite()
        && prev_s.altitude.is_finite()
        && inp.t.is_finite()
        && inp.altitude_along_rail.is_finite()
        && inp.rail_length.is_finite()
        && inp.burn_time.is_finite()
        && inp.vertical_velocity.is_finite()
        && inp.altitude.is_finite()
        && inp.main_deploy_alt.is_finite()
        && prev.pending_apogee_time.map_or(true, |v| v.is_finite())
        && prev.pending_apogee_alt.map_or(true, |v| v.is_finite());
    if !finite {
        panic!("events FSM: non-finite kinematic input in detectEvents");
    }
    if !(prev_s.t < inp.t) {
        panic!("events FSM: bracket time must strictly increase (prevS.t < inp.t)");
    }

    let altitude_at = |time: f64| -> f64 {
        if time <= prev_s.t {
            return prev_s.altitude;
        }
        if time >= inp.t {
            return inp.altitude;
        }
        let fraction = (time - prev_s.t) / (inp.t - prev_s.t);
        prev_s.altitude + fraction * (inp.altitude - prev_s.altitude)
    };

    let loc_rail = localize_crossing_filtered(
        prev_s.t,
        prev_s.altitude_along_rail,
        inp.t,
        inp.altitude_along_rail,
        inp.rail_length,
        "ascending",
    );
    let rail_ready_time: Option<f64> =
        if prev.has_left_rail { Some(prev_s.t) } else if loc_rail >= 0.0 { Some(loc_rail) } else { None };
    if !prev.has_left_rail && loc_rail >= 0.0 {
        s.has_left_rail = true;
        events.push(LocalizedEvent { name: AstraeaEvent::RailExit, time: loc_rail });
    }

    let burnout_crossed =
        !prev.has_burned_out && prev_s.t < inp.burn_time && inp.t >= inp.burn_time;
    let burnout_ready_time: Option<f64> = if prev.has_burned_out {
        Some(prev_s.t)
    } else if burnout_crossed {
        Some(inp.burn_time)
    } else {
        None
    };
    if burnout_crossed {
        s.has_burned_out = true;
        events.push(LocalizedEvent { name: AstraeaEvent::MotorBurnout, time: inp.burn_time });
    }

    let mut apogee_ready_time: Option<f64> = if prev.is_apogee_reached { Some(prev_s.t) } else { None };
    if !prev.is_apogee_reached {
        let loc_ap = localize_crossing_filtered(
            prev_s.t,
            prev_s.vertical_velocity,
            inp.t,
            inp.vertical_velocity,
            0.0,
            "descending",
        );
        if loc_ap >= 0.0 && s.pending_apogee_time.is_none() {
            s.pending_apogee_time = Some(loc_ap);
            s.pending_apogee_alt = Some(altitude_at(loc_ap));
        }
        if let (Some(rail_t), Some(burn_t)) = (rail_ready_time, burnout_ready_time) {
            if s.pending_apogee_time.is_some() && inp.vertical_velocity <= 0.0 {
                let pend = s.pending_apogee_time.unwrap();
                let apo_time = pend.max(rail_t).max(burn_t);
                if apo_time <= inp.t {
                    s.is_apogee_reached = true;
                    apogee_ready_time = Some(apo_time);
                    s.pending_apogee_time = None;
                    s.pending_apogee_alt = None;
                    events.push(LocalizedEvent { name: AstraeaEvent::ApogeeDrogue, time: apo_time });
                    if !s.is_main_deployed && altitude_at(apo_time) <= inp.main_deploy_alt + 1e-12 {
                        s.is_main_deployed = true;
                        events.push(LocalizedEvent { name: AstraeaEvent::MainDeploy, time: apo_time });
                    }
                }
            }
        }
    }

    if !s.is_main_deployed && s.is_apogee_reached {
        let loc_main = localize_crossing_filtered(
            prev_s.t,
            prev_s.altitude,
            inp.t,
            inp.altitude,
            inp.main_deploy_alt,
            "descending",
        );
        if loc_main >= 0.0 {
            let main_time = loc_main.max(apogee_ready_time.unwrap_or(prev_s.t));
            if main_time <= inp.t {
                s.is_main_deployed = true;
                events.push(LocalizedEvent { name: AstraeaEvent::MainDeploy, time: main_time });
            }
        }
    }

    if !s.touched_down && s.is_apogee_reached {
        let loc_td = localize_crossing_filtered(
            prev_s.t,
            prev_s.altitude,
            inp.t,
            inp.altitude,
            0.0,
            "descending",
        );
        if loc_td >= 0.0 {
            let touchdown_time = loc_td.max(apogee_ready_time.unwrap_or(prev_s.t));
            if touchdown_time <= inp.t {
                if !s.is_main_deployed {
                    s.is_main_deployed = true;
                    events.push(LocalizedEvent { name: AstraeaEvent::MainDeploy, time: touchdown_time });
                }
                s.touched_down = true;
                events.push(LocalizedEvent { name: AstraeaEvent::Touchdown, time: touchdown_time });
            }
        }
    }

    events.sort_by(|a, b| {
        a.time
            .partial_cmp(&b.time)
            .unwrap()
            .then(event_priority(&a.name).cmp(&event_priority(&b.name)))
    });
    let fires: Vec<AstraeaEvent> =
        if events.is_empty() { vec![AstraeaEvent::None] } else { events.iter().map(|e| e.name).collect() };
    EventResult { fires, events, state: s }
}

/// Whether the named transition's crossing predicate holds AT a reconstructed
/// root state (production event policy). MOTOR_BURNOUT is time-based and
/// handled by the caller (returns false here, mirroring TS default).
pub fn event_crossed_at_root(
    name: &AstraeaEvent,
    root: &RigidState,
    rail: &Vec3,
    rail_length: f64,
    main_deploy_alt: f64,
) -> bool {
    match name {
        AstraeaEvent::RailExit => root.r.dot(rail) >= rail_length,
        AstraeaEvent::ApogeeDrogue => root.v.z <= 0.0,
        AstraeaEvent::MainDeploy => root.r.z <= main_deploy_alt,
        AstraeaEvent::Touchdown => root.r.z <= 0.0,
        _ => false,
    }
}

/// General minimum over driver-assigned effective service times. Returns the
/// index into `names` to serve explicitly.
pub fn select_next_candidate(names: &[AstraeaEvent], sel_times: &[f64]) -> usize {
    let mut best = 0usize;
    let mut best_key = sel_times[0];
    for i in 1..names.len() {
        let key = sel_times[i];
        if key < best_key - 1e-9
            || ((key - best_key).abs() <= 1e-9 && event_priority(&names[i]) < event_priority(&names[best]))
        {
            best = i;
            best_key = key;
        }
    }
    best
}

pub fn selected_prereqs_met(name: &AstraeaEvent, b_ev: &EventState) -> bool {
    match name {
        AstraeaEvent::RailExit | AstraeaEvent::MotorBurnout => true,
        AstraeaEvent::ApogeeDrogue => b_ev.has_left_rail && b_ev.has_burned_out,
        AstraeaEvent::MainDeploy | AstraeaEvent::Touchdown => b_ev.is_apogee_reached,
        _ => false,
    }
}

/// Projected base-contact policy: clamp a rail-bound state against the launch
/// stop (position projects to the stop plane, inward along-rail velocity out).
pub fn clamp_rail_base_contact(pos: &mut Vec3, vel: &mut Vec3, rail: &Vec3) {
    let s = pos.dot(rail);
    if s < 0.0 {
        pos.x -= rail.x * s;
        pos.y -= rail.y * s;
        pos.z -= rail.z * s;
        let v_along = vel.dot(rail);
        if v_along < 0.0 {
            vel.x -= rail.x * v_along;
            vel.y -= rail.y * v_along;
            vel.z -= rail.z * v_along;
        }
    }
}

// ---------------------------------------------------------------------------
// Atmosphere / wind / motor (mirrors flightSimulator + motorDatabase)
// ---------------------------------------------------------------------------

fn atmosphere_at(altitude: f64) -> (f64, f64) {
    // returns (density kg/m^3, speedOfSound m/s), ISA-1976
    let h = altitude.max(0.0);
    let t0 = 288.15f64;
    let p0 = 101325.0f64;
    let lapse = 0.0065f64;
    let g0 = 9.80665f64;
    let r = 287.05287f64;
    let gamma = 1.4f64;
    if h <= 11000.0 {
        let t = t0 - lapse * h;
        let p = p0 * (t / t0).powf(g0 / (r * lapse));
        (p / (r * t), (gamma * r * t).sqrt())
    } else {
        let t11 = 216.65f64;
        let p11 = 22632.1f64;
        let dh = h - 11000.0;
        let p = p11 * ((-g0 * dh) / (r * t11)).exp();
        (p / (r * t11), (gamma * r * t11).sqrt())
    }
}

/// Power-law wind shear: v(h) = v_surf * (h/2)^0.14, blowing TOWARD azimuth.
fn wind_vector_at(altitude: f64, speed_surface: f64, azimuth_deg: f64) -> Vec3 {
    let h = altitude.max(1.0);
    let speed = speed_surface * (h / 2.0).powf(0.14);
    let az = azimuth_deg * PI / 180.0;
    let towards = az + PI;
    Vec3 { x: speed * towards.sin(), y: speed * towards.cos(), z: 0.0 }
}

#[derive(Clone, Debug)]
pub struct ThrustPoint {
    pub time: f64,
    pub thrust: f64,
}

#[derive(Clone, Debug)]
pub struct MotorSpec {
    pub designation: String,
    pub diameter: f64,       // m
    pub length: f64,         // m
    pub burn_time: f64,      // s
    pub propellant_mass: f64, // kg
    pub total_mass: f64,     // kg wet
    pub dry_mass: f64,       // kg
    pub max_thrust: f64,     // N
    pub thrust_curve: Vec<ThrustPoint>,
}

/// Certified Estes C6 record (oracle values from motorDatabase.ts).
pub fn estes_c6_motor() -> MotorSpec {
    MotorSpec {
        designation: "Estes C6".to_string(),
        diameter: 0.018,
        length: 0.070,
        burn_time: 1.86,
        propellant_mass: 0.0125,
        total_mass: 0.0248,
        dry_mass: 0.0123,
        max_thrust: 14.2,
        thrust_curve: vec![
            ThrustPoint { time: 0.0, thrust: 0.0 },
            ThrustPoint { time: 0.08, thrust: 4.5 },
            ThrustPoint { time: 0.18, thrust: 14.2 },
            ThrustPoint { time: 0.28, thrust: 8.5 },
            ThrustPoint { time: 0.50, thrust: 4.8 },
            ThrustPoint { time: 1.00, thrust: 4.4 },
            ThrustPoint { time: 1.50, thrust: 4.2 },
            ThrustPoint { time: 1.86, thrust: 0.0 },
        ],
    }
}

fn validate_motor_spec(motor: &MotorSpec) -> Result<(), String> {
    let what = if motor.designation.is_empty() { "motor".to_string() } else { format!("motor '{}'", motor.designation) };
    if !(motor.burn_time.is_finite() && motor.burn_time > 0.0) {
        return Err(format!("motor validation: {} burnTime must be finite and positive (got {})", what, motor.burn_time));
    }
    if !(motor.propellant_mass.is_finite() && motor.propellant_mass > 0.0) {
        return Err(format!("motor validation: {} propellantMass must be finite and positive (got {})", what, motor.propellant_mass));
    }
    if !(motor.diameter.is_finite() && motor.diameter > 0.0) {
        return Err(format!("motor validation: {} diameter must be finite and positive (got {})", what, motor.diameter));
    }
    if !(motor.length.is_finite() && motor.length > 0.0) {
        return Err(format!("motor validation: {} length must be finite and positive (got {})", what, motor.length));
    }
    let wet_err = (motor.total_mass - (motor.dry_mass + motor.propellant_mass)).abs();
    if wet_err > 1e-9 * 1e-12f64.max(motor.total_mass) {
        return Err(format!("motor validation: {} wet/dry/propellant identity violated", what));
    }
    if motor.thrust_curve.len() < 2 {
        return Err(format!("motor validation: {} thrust curve needs at least two points", what));
    }
    for i in 0..motor.thrust_curve.len() {
        let p = &motor.thrust_curve[i];
        if !p.time.is_finite() || !p.thrust.is_finite() || p.thrust < 0.0 {
            return Err(format!("motor validation: {} thrust point {} must carry finite time and nonnegative thrust", what, i));
        }
        if i > 0 && !(p.time > motor.thrust_curve[i - 1].time) {
            return Err(format!("motor validation: {} thrust times must strictly increase (point {})", what, i));
        }
    }
    if motor.thrust_curve[0].time != 0.0 {
        return Err(format!("motor validation: {} thrust curve must start at t=0", what));
    }
    if motor.thrust_curve[motor.thrust_curve.len() - 1].time != motor.burn_time {
        return Err(format!("motor validation: {} thrust curve must end exactly at burnTime", what));
    }
    if motor.thrust_curve[0].thrust != 0.0 || motor.thrust_curve[motor.thrust_curve.len() - 1].thrust != 0.0 {
        return Err(format!("motor validation: {} thrust curve endpoints must be zero (mass-flow continuity)", what));
    }
    Ok(())
}

fn motor_thrust_at(motor: &MotorSpec, t: f64) -> f64 {
    if !t.is_finite() {
        panic!("motor query: time must be finite");
    }
    if t <= 0.0 || t >= motor.burn_time {
        return 0.0;
    }
    let curve = &motor.thrust_curve;
    for i in 0..curve.len() - 1 {
        let p1 = &curve[i];
        let p2 = &curve[i + 1];
        if t >= p1.time && t <= p2.time {
            let dt = p2.time - p1.time;
            if dt <= 0.0 {
                return p1.thrust;
            }
            let f = (t - p1.time) / dt;
            return p1.thrust + f * (p2.thrust - p1.thrust);
        }
    }
    0.0
}

fn integrate_thrust_curve(motor: &MotorSpec, t: f64) -> f64 {
    if !t.is_finite() {
        panic!("motor query: time must be finite");
    }
    let curve = &motor.thrust_curve;
    if curve.len() < 2 {
        return 0.0;
    }
    let end = t.max(0.0).min(motor.burn_time);
    let mut impulse = 0.0;
    for i in 0..curve.len() - 1 {
        let a = &curve[i];
        let b = &curve[i + 1];
        if end <= a.time {
            break;
        }
        let seg_end = end.min(b.time);
        if seg_end <= a.time {
            continue;
        }
        let f = (seg_end - a.time) / (b.time - a.time);
        let thrust_end = a.thrust + f * (b.thrust - a.thrust);
        impulse += 0.5 * (a.thrust + thrust_end) * (seg_end - a.time);
    }
    impulse
}

fn motor_impulse_total(motor: &MotorSpec) -> f64 {
    let ci = integrate_thrust_curve(motor, motor.burn_time);
    if !ci.is_finite() || ci <= 0.0 {
        panic!("motor depletion: thrust curve delivers no finite positive impulse — validate the motor record");
    }
    ci
}

fn motor_mass_flow_at(motor: &MotorSpec, t: f64) -> f64 {
    if !t.is_finite() {
        panic!("motor query: time must be finite");
    }
    if !(t >= 0.0) || t >= motor.burn_time {
        return 0.0;
    }
    let total = motor_impulse_total(motor);
    -motor.propellant_mass * motor_thrust_at(motor, t) / total
}

fn motor_mass_at(motor: &MotorSpec, t: f64) -> (f64, f64) {
    if !t.is_finite() {
        panic!("motor query: time must be finite");
    }
    if t <= 0.0 {
        return (motor.total_mass, motor.propellant_mass);
    }
    if t >= motor.burn_time {
        return (motor.dry_mass, 0.0);
    }
    let total = motor_impulse_total(motor);
    let delivered = integrate_thrust_curve(motor, t);
    let prop = motor.propellant_mass * (1.0 - delivered / total).max(0.0).min(1.0);
    (motor.dry_mass + prop, prop)
}

// ---------------------------------------------------------------------------
// Vehicle (precomputed geometry/aero; see module docs)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct Parachute {
    pub diameter: f64,
    pub cd: f64,
}

#[derive(Clone, Debug)]
pub struct Vehicle {
    pub dry_mass: f64,
    pub cg_from_nose: f64,
    pub total_length: f64,
    pub ref_diameter: f64,
    pub cna_body: f64,
    pub cna_fins: f64,
    pub cp_body: f64,
    pub cp_fins: f64,
    pub motor_aft_station_from_nose: f64,
    pub drogue: Option<Parachute>,
    pub main_chute: Option<Parachute>,
    /// Drag tables as Cd values at mach = i*4/(n-1) (mirrors TS dragCurves).
    pub aero_powered_cd: Vec<f64>,
    pub aero_coasting_cd: Vec<f64>,
}

impl Vehicle {
    fn ref_area(&self) -> f64 {
        PI / 4.0 * self.ref_diameter * self.ref_diameter
    }
    fn r_body(&self) -> f64 {
        self.ref_diameter / 2.0
    }
}

/// Estes Alpha fixture with oracle-extracted geometry, Barrowman split, and
/// transonic drag tables (25-pt, from `computeAerodynamicCurves` via node).
pub fn estes_alpha_vehicle() -> Vehicle {
    Vehicle {
        dry_mass: 0.04573508529158387,
        cg_from_nose: 0.2871437204338452,
        total_length: 0.476,
        ref_diameter: 0.0248,
        cna_body: 2.0,
        cna_fins: 22.317876312553757,
        cp_body: 0.07689,
        cp_fins: 0.4355970197602852,
        motor_aft_station_from_nose: 0.476,
        drogue: Some(Parachute { diameter: 0.305, cd: 0.8 }),
        main_chute: Some(Parachute { diameter: 0.305, cd: 0.8 }),
        aero_powered_cd: vec![
            0.5416598036495043, 0.4041440213394488, 0.366405948857319, 0.35021650272704813,
            0.3432437722378611, 0.3542712477127067, 0.4437524423483221, 0.5422880181051627,
            0.47392697533082645, 0.43367336099817005, 0.4047308703648227, 0.3818988910264156,
            0.362956155577604, 0.3467363702845927, 0.332546559226318, 0.3199388167935253,
            0.30860499247065537, 0.29832246349316804, 0.28892390983554045, 0.2802794137576878,
            0.27228532568714064, 0.2648570442910517, 0.2579241584165682, 0.2514270647223519,
            0.24531453417159907,
        ],
        aero_coasting_cd: vec![
            0.6160598036495043, 0.4807829102283377, 0.44976150441287455, 0.4447665027270481,
            0.45346599446008334, 0.4883749514164104, 0.6793524423483221, 0.7350205442957638,
            0.6407472385766356, 0.5785057769615668, 0.532362050981432, 0.49573644733035643,
            0.46550701193388744, 0.4398953586545699, 0.417778650351149, 0.39839863105907786,
            0.38121772953957883, 0.3658402321085496, 0.35196588048577726, 0.3393610433358396,
            0.32784002377710997, 0.31725250131661054, 0.30747483279889315, 0.2984038596919037,
            0.2899523870553303,
        ],
    }
}

fn aero_at_mach(mach: f64, powered: bool, vehicle: &Vehicle) -> f64 {
    let cds = if powered { &vehicle.aero_powered_cd } else { &vehicle.aero_coasting_cd };
    let n = cds.len();
    if n == 0 {
        return 0.35;
    }
    if mach <= 0.0 {
        return cds[0];
    }
    if mach >= 4.0 {
        return cds[n - 1];
    }
    let pos = mach / 4.0 * (n - 1) as f64;
    let i = (pos.floor() as usize).min(n - 2);
    let f = pos - i as f64;
    cds[i] + f * (cds[i + 1] - cds[i])
}

fn normal_slope_at_mach(mach: f64, vehicle: &Vehicle) -> (f64, f64) {
    if !mach.is_finite() || mach <= 1.0 {
        let total = vehicle.cna_body + vehicle.cna_fins;
        let cp = if total > 0.0 {
            (vehicle.cna_body * vehicle.cp_body + vehicle.cna_fins * vehicle.cp_fins) / total
        } else {
            vehicle.cp_body
        };
        return (total, cp);
    }
    let degrade = 1.0f64.min(1.0 / (mach * mach - 1.0).sqrt());
    let fin_cna = vehicle.cna_fins * degrade;
    let total = vehicle.cna_body + fin_cna;
    let cp = if total > 0.0 {
        (vehicle.cna_body * vehicle.cp_body + fin_cna * vehicle.cp_fins) / total
    } else {
        vehicle.cp_body
    };
    (total, cp)
}

struct Refined {
    pub time: f64,
    pub state: RigidState,
}
// ---------------------------------------------------------------------------

struct FlightLoads {
    loads: Loads,
    airspeed: f64,
    mach: f64,
    q_inf: f64,
    alpha_total_deg: f64,
    drag_axial: f64,
    thrust: f64,
}

fn domain_worst(a: Option<StageValidity>, b: Option<StageValidity>) -> Option<StageValidity> {
    if a == Some(StageValidity::Unsupported) || b == Some(StageValidity::Unsupported) {
        return Some(StageValidity::Unsupported);
    }
    if a == Some(StageValidity::Extrapolated) || b == Some(StageValidity::Extrapolated) {
        return Some(StageValidity::Extrapolated);
    }
    a.or(b)
}

#[allow(clippy::too_many_arguments)]
fn compute_flight_loads(
    t_stage: f64,
    st: &RigidState,
    drogue_deployed: bool,
    main_deployed: bool,
    rail_bound: bool,
    launch_altitude_asl: f64,
    wind_speed_surface: f64,
    wind_azimuth_deg: f64,
    fin_cant_rad: f64,
    vehicle: &Vehicle,
    motor: &MotorSpec,
) -> FlightLoads {
    if !t_stage.is_finite() {
        panic!("loads assembly: stage time must be finite");
    }
    if !fin_cant_rad.is_finite() || !wind_speed_surface.is_finite() || !wind_azimuth_deg.is_finite() {
        panic!("loads assembly: wind/cant configuration must be finite");
    }
    let alt_asl = launch_altitude_asl + st.r.z;
    let (density, sos) = atmosphere_at(alt_asl);
    let powered = t_stage < motor.burn_time;
    let thrust = motor_thrust_at(motor, t_stage);
    let (mot_mass, _) = motor_mass_at(motor, t_stage);

    let m_dry = vehicle.dry_mass;
    let m_mot = mot_mass;
    let mass = m_dry + m_mot;
    let m_rad = motor.diameter / 2.0;
    let m_len = motor.length;
    let x_mot = vehicle.motor_aft_station_from_nose - m_len / 2.0;
    if !(x_mot - m_len / 2.0 >= 0.0) {
        panic!(
            "loads assembly: motor forward end {} m lies outside the vehicle (mount station {} m, motor length {} m)",
            x_mot - m_len / 2.0,
            vehicle.motor_aft_station_from_nose,
            m_len
        );
    }
    let x_dry = vehicle.cg_from_nose;
    let x_c = (m_dry * x_dry + m_mot * x_mot) / mass;
    let d_dry = x_dry - x_c;
    let d_mot = x_mot - x_c;

    let ixx_mot_c = 0.5 * m_mot * m_rad * m_rad;
    let iyy_mot_c = m_mot * (3.0 * m_rad * m_rad + m_len * m_len) / 12.0;
    let r_body = vehicle.r_body();
    let ixx_dry = 0.5 * m_dry * r_body * r_body;
    let iyy_dry = m_dry * (3.0 * r_body * r_body + vehicle.total_length * vehicle.total_length) / 12.0;
    let ixx = ixx_dry + ixx_mot_c;
    let iyy = iyy_dry + m_dry * d_dry * d_dry + iyy_mot_c + m_mot * d_mot * d_mot;
    let izz = iyy;

    let dm_dt = motor_mass_flow_at(motor, t_stage);
    let diyy_mot_c_dt = ((3.0 * m_rad * m_rad + m_len * m_len) / 12.0) * dm_dt;
    let x_c_dot = (dm_dt * m_dry * (x_mot - x_dry)) / (mass * mass);
    let d_dry_dot = -x_c_dot;
    let d_mot_dot = -x_c_dot;
    let diyy = diyy_mot_c_dt + 2.0 * m_dry * d_dry * d_dry_dot + dm_dt * d_mot * d_mot + 2.0 * m_mot * d_mot * d_mot_dot;
    let dixx_mot_dt = 0.5 * m_rad * m_rad * dm_dt;
    let inertia_dot_b = Vec3 { x: diyy, y: dixx_mot_dt, z: diyy };

    let r_mat = quaternion_to_matrix(&st.q);
    let wind = wind_vector_at(st.r.z, wind_speed_surface, wind_azimuth_deg);
    let rel_world = Vec3 { x: st.v.x - wind.x, y: st.v.y - wind.y, z: st.v.z - wind.z };
    let rel_body = rotate_world_to_body(&r_mat, &rel_world);
    let airspeed = (rel_body.x * rel_body.x + rel_body.y * rel_body.y + rel_body.z * rel_body.z).sqrt();
    let mach = airspeed / sos;
    let q_inf = 0.5 * density * airspeed * airspeed;
    let lat_speed = (rel_body.x * rel_body.x + rel_body.z * rel_body.z).sqrt();
    let alpha_total = lat_speed.atan2(rel_body.y);
    let alpha_total_deg = alpha_total * 180.0 / PI;

    let mut cd = aero_at_mach(mach, powered, vehicle);
    let mut eff_area = vehicle.ref_area();
    let drogue_live = drogue_deployed && vehicle.drogue.is_some();
    let main_live = main_deployed && vehicle.main_chute.is_some();
    if main_live {
        let chute = vehicle.main_chute.as_ref().unwrap();
        eff_area = PI / 4.0 * chute.diameter * chute.diameter;
        cd = chute.cd;
    } else if drogue_live {
        let chute = vehicle.drogue.as_ref().unwrap();
        eff_area = PI / 4.0 * chute.diameter * chute.diameter;
        cd = chute.cd;
    }
    let drag_axial = q_inf * eff_area * cd;
    let (cna_slope, cp) = normal_slope_at_mach(mach, vehicle);

    let recovery = drogue_live || main_live;
    let incidence_for_validity = if recovery || rail_bound { 0.0 } else { alpha_total_deg };
    let states_finite = st.r.x.is_finite() && st.r.y.is_finite() && st.r.z.is_finite()
        && st.v.x.is_finite() && st.v.y.is_finite() && st.v.z.is_finite()
        && st.w.x.is_finite() && st.w.y.is_finite() && st.w.z.is_finite()
        && st.q.w.is_finite() && st.q.x.is_finite() && st.q.y.is_finite() && st.q.z.is_finite();
    let canopy_class: Option<StageValidity> = if !recovery {
        None
    } else if mach > 2.0 {
        Some(StageValidity::Unsupported)
    } else if mach > 1.0 {
        Some(StageValidity::Extrapolated)
    } else {
        None
    };
    let altitude_class: Option<StageValidity> = if alt_asl > 100000.0 {
        Some(StageValidity::Unsupported)
    } else if alt_asl > 20000.0 {
        Some(StageValidity::Extrapolated)
    } else {
        None
    };
    let envelope: StageValidity = if mach > 6.0 || incidence_for_validity > 30.0 {
        StageValidity::Unsupported
    } else if mach > 4.0 || incidence_for_validity > 15.0 {
        StageValidity::Extrapolated
    } else {
        StageValidity::Valid
    };
    let mut load_validity: StageValidity = if !states_finite
        || !launch_altitude_asl.is_finite()
        || !mach.is_finite()
        || !incidence_for_validity.is_finite()
        || !airspeed.is_finite()
    {
        StageValidity::Unsupported
    } else {
        domain_worst(domain_worst(canopy_class, altitude_class), Some(envelope)).unwrap_or(StageValidity::Valid)
    };

    let mut aero_body = Vec3::zero();
    let mut cna = 0.0;
    let tail_first = !recovery && !rail_bound && rel_body.y < 0.0 && -rel_body.y >= lat_speed;
    if tail_first {
        load_validity = StageValidity::Unsupported;
    }
    if airspeed > 1e-6 {
        let inv_v = 1.0 / airspeed;
        aero_body.x = -drag_axial * rel_body.x * inv_v;
        aero_body.y = -drag_axial * rel_body.y * inv_v;
        aero_body.z = -drag_axial * rel_body.z * inv_v;
        if !recovery && !tail_first {
            cna = cna_slope;
            if lat_speed > 1e-9 {
                let normal_mag = q_inf * vehicle.ref_area() * cna * alpha_total.sin();
                let inv_lat = 1.0 / lat_speed;
                aero_body.x += -normal_mag * rel_body.x * inv_lat;
                aero_body.z += -normal_mag * rel_body.z * inv_lat;
            }
        }
    }

    let mut force_n = rotate_body_to_world(&r_mat, &Vec3 {
        x: aero_body.x,
        y: aero_body.y + thrust,
        z: aero_body.z,
    });
    force_n.z -= mass * G0;

    let d_static = if recovery { 0.0 } else { cp - x_c };
    let roll = st.w.y;
    let pitch = st.w.x;
    let yaw = st.w.z;
    let pitch_damp = 0.5 * density * airspeed * vehicle.ref_area() * vehicle.total_length * vehicle.total_length * 1.5 * pitch;
    let yaw_damp = 0.5 * density * airspeed * vehicle.ref_area() * vehicle.total_length * vehicle.total_length * 1.5 * yaw;
    let clp = 4.0;
    let roll_damp = 0.25 * density * airspeed * vehicle.ref_area() * r_body * r_body * clp * roll;
    let roll_torque = q_inf * vehicle.ref_area() * r_body * fin_cant_rad.sin() * 4.0;

    let moment_b = Vec3 {
        x: -(d_static * aero_body.z) - pitch_damp,
        y: roll_torque - roll_damp,
        z: d_static * aero_body.x - yaw_damp,
    };

    FlightLoads {
        loads: Loads {
            force_n,
            moment_b,
            inertia_b: Vec3 { x: iyy, y: ixx, z: izz },
            inertia_dot_b,
            mass,
            validity: load_validity,
        },
        airspeed,
        mach,
        q_inf,
        alpha_total_deg,
        drag_axial,
        thrust,
    }
}

// ---------------------------------------------------------------------------
// Public options / result
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default)]
pub struct SixDofOptions {
    pub rail_length: Option<f64>,
    pub rail_elevation_deg: Option<f64>,
    pub rail_azimuth_deg: Option<f64>,
    pub launch_altitude_asl: Option<f64>,
    pub wind_speed_surface: Option<f64>,
    pub wind_azimuth_deg: Option<f64>,
    pub main_deploy_altitude_agl: Option<f64>,
    pub time_step: Option<f64>,
    pub fin_cant_angle_deg: Option<f64>,
}

#[derive(Clone, Debug)]
pub struct SimEvent {
    pub time: f64,
    pub name: String,
    pub altitude: f64,
    pub velocity: f64,
    pub description: String,
}

#[derive(Clone, Debug)]
pub struct LandingPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Debug)]
pub struct SimulationResult {
    pub apogee_altitude: f64,
    pub apogee_time: f64,
    pub apogee_position: Vec3,
    pub max_velocity: f64,
    pub max_mach: f64,
    pub max_acceleration_g: f64,
    pub burnout_altitude: f64,
    pub burnout_velocity: f64,
    pub burnout_time: f64,
    pub rail_exit_velocity: f64,
    pub weathercock_angle_deg: f64,
    pub landing_position: LandingPosition,
    pub landing_distance: f64,
    pub landing_velocity: f64,
    pub landing_kinetic_energy: f64,
    pub landing_mass: f64,
    pub flight_time: f64,
    pub terminated: bool,
    pub touchdown_nominal: bool,
    pub validity: String,
    pub enveloped: bool,
    pub off_nominal_excursion: bool,
    pub events: Vec<SimEvent>,
}

fn finite_opt(v: Option<f64>, fallback: f64, name: &str) -> Result<f64, String> {
    let out = v.unwrap_or(fallback);
    if !out.is_finite() {
        let got = match v {
            Some(x) => format_js_num(x),
            None => "undefined".to_string(),
        };
        return Err(format!("simulate6DofFlight: option {} must be finite (got {})", name, got));
    }
    Ok(out)
}

fn format_js_num(v: f64) -> String {
    if v.is_nan() {
        return "NaN".to_string();
    }
    if v.is_infinite() {
        return if v > 0.0 { "Infinity".to_string() } else { "-Infinity".to_string() };
    }
    // Match JS `${v}` for integral values used in error strings.
    if v == v.trunc() && v.abs() < 1e21 {
        return format!("{}", v as i64);
    }
    format!("{}", v)
}

fn apply_fsm_transition(prev: &EventState, name: &AstraeaEvent, fsm: &EventState, applied_at: f64) -> EventState {
    let keep_prev_pending = prev.pending_apogee_time.is_some()
        && (fsm.pending_apogee_time.is_none()
            || prev.pending_apogee_time.unwrap() <= fsm.pending_apogee_time.unwrap());
    let pending_time = if keep_prev_pending { prev.pending_apogee_time } else { fsm.pending_apogee_time };
    let pending_alt = if keep_prev_pending { prev.pending_apogee_alt } else { fsm.pending_apogee_alt };
    let survives = pending_time.map_or(false, |pt| pt <= applied_at + 1e-12);
    let mut s = EventState {
        has_left_rail: prev.has_left_rail,
        has_burned_out: prev.has_burned_out,
        is_apogee_reached: prev.is_apogee_reached,
        is_main_deployed: prev.is_main_deployed,
        touched_down: prev.touched_down,
        pending_apogee_time: if survives { pending_time } else { None },
        pending_apogee_alt: if survives { pending_alt } else { None },
    };
    match name {
        AstraeaEvent::RailExit => s.has_left_rail = true,
        AstraeaEvent::MotorBurnout => s.has_burned_out = true,
        AstraeaEvent::ApogeeDrogue => {
            s.is_apogee_reached = true;
            s.pending_apogee_time = None;
            s.pending_apogee_alt = None;
        }
        AstraeaEvent::MainDeploy => s.is_main_deployed = true,
        AstraeaEvent::Touchdown => s.touched_down = true,
        AstraeaEvent::None => {}
    }
    s
}

/// Coarse-grained 6-DOF flight simulation (mirrors `simulate6DofFlight`).
pub fn simulate_flight(
    vehicle: &Vehicle,
    motor: &MotorSpec,
    options: &SixDofOptions,
) -> Result<SimulationResult, String> {
    validate_motor_spec(motor)?;
    let rail_length = finite_opt(options.rail_length, 3.0, "railLength")?;
    if !(rail_length > 0.0) {
        return Err(format!("simulate6DofFlight: railLength must be positive (got {})", format_js_num(rail_length)));
    }
    let rail_elevation_deg = finite_opt(options.rail_elevation_deg, 85.0, "railElevationDeg")?;
    if rail_elevation_deg < 70.0 || rail_elevation_deg > 90.0 {
        return Err(format!(
            "simulate6DofFlight: railElevationDeg {}° is outside the declared launch-rail domain [70°, 90°]",
            format_js_num(rail_elevation_deg)
        ));
    }
    let rail_azimuth_deg = finite_opt(options.rail_azimuth_deg, 0.0, "railAzimuthDeg")?;
    let launch_altitude_asl = finite_opt(options.launch_altitude_asl, 0.0, "launchAltitudeASL")?;
    let wind_speed_surface = finite_opt(options.wind_speed_surface, 3.0, "windSpeedSurface")?;
    if !(wind_speed_surface >= 0.0) {
        return Err(format!(
            "simulate6DofFlight: windSpeedSurface must be nonnegative (got {})",
            format_js_num(wind_speed_surface)
        ));
    }
    let wind_azimuth_deg = finite_opt(options.wind_azimuth_deg, 90.0, "windAzimuthDeg")?;
    let main_deploy_alt = finite_opt(options.main_deploy_altitude_agl, 250.0, "mainDeployAltitudeAGL")?;
    if !(main_deploy_alt > 0.0) {
        return Err(format!(
            "simulate6DofFlight: mainDeployAltitudeAGL must be positive (got {})",
            format_js_num(main_deploy_alt)
        ));
    }
    let dt = finite_opt(options.time_step, 0.01, "timeStep")?;
    if !(dt >= 1e-6) {
        return Err(format!("simulate6DofFlight: timeStep must be at least 1e-6 s (got {})", format_js_num(dt)));
    }
    let fin_cant_rad = finite_opt(options.fin_cant_angle_deg, 0.0, "finCantAngleDeg")? * PI / 180.0;

    if !(vehicle.dry_mass > 0.0) {
        return Err(format!("simulate6DofFlight: vehicle dry mass must be positive (got {})", vehicle.dry_mass));
    }

    let el_rad = rail_elevation_deg * PI / 180.0;
    let az_rad = rail_azimuth_deg * PI / 180.0;
    let rail_vector = Vec3 {
        x: el_rad.cos() * az_rad.sin(),
        y: el_rad.cos() * az_rad.cos(),
        z: el_rad.sin(),
    };

    let dot_y = rail_vector.y;
    let mut initial_q = Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };
    if dot_y < 0.9999 {
        let rx = rail_vector.z;
        let rz = -rail_vector.x;
        let axis_len = (rx * rx + rz * rz).sqrt();
        if axis_len > 1e-6 {
            let angle = dot_y.max(-1.0).min(1.0).acos();
            let sin_half = (angle / 2.0).sin();
            initial_q = Quat {
                w: (angle / 2.0).cos(),
                x: rx / axis_len * sin_half,
                y: 0.0,
                z: rz / axis_len * sin_half,
            };
        }
    }

    let mut t = 0.0f64;
    let mut pos = Vec3::zero();
    let mut vel = Vec3::zero();
    let mut q = normalize_quaternion(&initial_q);
    let mut omega_p = 0.0f64;
    let mut omega_q = 0.0f64;
    let mut omega_r = 0.0f64;

    let mut max_altitude = 0.0f64;
    let mut max_speed = 0.0f64;
    let mut max_mach = 0.0f64;
    let mut max_alpha_deg = 0.0f64;
    let mut apogee_time = 0.0f64;
    let mut apogee_pos = Vec3::zero();
    let mut max_accel = 0.0f64;

    let mut rail_exit_vel = 0.0f64;
    let mut weathercock_angle_deg = 0.0f64;
    let mut burnout_alt = 0.0f64;
    let mut burnout_vel = 0.0f64;
    let mut is_apogee_reached = false;
    let mut is_drogue_deployed = false;
    let mut is_main_deployed = false;
    let mut event_state = EventState::newton();
    let mut prev_sample = EventSamplePair { t: 0.0, altitude_along_rail: 0.0, vertical_velocity: 0.0, altitude: 0.0 };
    let mut prev_full_state = RigidState {
        r: Vec3::zero(),
        v: Vec3::zero(),
        q: initial_q,
        w: Vec3::zero(),
    };
    let mut prev_event_state = EventState::newton();

    let mut events: Vec<SimEvent> = vec![SimEvent {
        time: 0.0,
        name: "Ignition & Rail Guidance".to_string(),
        altitude: 0.0,
        velocity: 0.0,
        description: format!(
            "Motor {} ignited at {:.1}° rail elevation. Liftoff mass: {:.2} kg.",
            motor.designation,
            rail_elevation_deg,
            vehicle.dry_mass + motor.total_mass
        ),
    }];

    let max_sim_time = 300.0f64;
    let mut saw_unsupported = false;
    let mut saw_extrapolated = false;
    let mut touchdown_tau: Option<f64> = None;
    let mut touchdown_nominal = false;
    let mut last_probe_validity: Vec<StageValidity> = Vec::new();
    let mut macro_iterations: u64 = 0;
    const MAX_MACRO_ITERATIONS: u64 = 5_000_000;

    let tol = AdaptiveTolerances { r: 1e-3, v: 1e-2, q: 1e-5, w: 1e-3 };

    while t < max_sim_time {
        // ---- event restart engine over bracket [prev_sample.t, t] ----
        let mut b_t = prev_sample.t;
        let mut b_sample = prev_sample;
        let mut b_state = prev_full_state;
        let mut b_event = prev_event_state.clone();
        let mut e_state = b_state;
        let mut early_terminated = false;
        let mut transitions_in_bracket: u32 = 0;
        // Track the endpoint probe validity for the timeout path.
        let mut bracket_probe_validity: Vec<StageValidity> = Vec::new();

        while b_t < t {
            // Endpoint probe under CURRENT (pre-transition) flags.
            let snap_has_rail = b_event.has_left_rail;
            let snap_drogue = is_drogue_deployed;
            let snap_main = is_main_deployed;
            let probe = {
                let loads = |ts: f64, st: &RigidState| -> Loads {
                    let fl = compute_flight_loads(
                        ts, st, snap_drogue, snap_main, !snap_has_rail,
                        launch_altitude_asl, wind_speed_surface, wind_azimuth_deg,
                        fin_cant_rad, vehicle, motor,
                    );
                    if !snap_has_rail {
                        let s_along = st.r.dot(&rail_vector);
                        let v_along = st.v.dot(&rail_vector);
                        let fdot = fl.loads.force_n.dot(&rail_vector);
                        if s_along <= 0.0 && v_along <= 0.0 && fdot <= 0.0 {
                            return Loads {
                                force_n: Vec3::zero(),
                                moment_b: Vec3::zero(),
                                inertia_b: fl.loads.inertia_b,
                                inertia_dot_b: fl.loads.inertia_dot_b,
                                mass: fl.loads.mass,
                                validity: fl.loads.validity,
                            };
                        }
                        return Loads {
                            force_n: Vec3 {
                                x: fdot * rail_vector.x,
                                y: fdot * rail_vector.y,
                                z: fdot * rail_vector.z,
                            },
                            moment_b: Vec3::zero(),
                            inertia_b: fl.loads.inertia_b,
                            inertia_dot_b: fl.loads.inertia_dot_b,
                            mass: fl.loads.mass,
                            validity: fl.loads.validity,
                        };
                    }
                    fl.loads
                };
                integrate_rigid_adaptive(&b_state, &loads, b_t, t, &tol, 0.05f64.min(t - b_t), 0.005f64.min(t - b_t))
            };
            e_state = probe.state;
            bracket_probe_validity = probe.committed_validity.clone();
            last_probe_validity = probe.committed_validity.clone();
            let det = detect_events(
                &b_event,
                &b_sample,
                &EventInput {
                    t,
                    altitude_along_rail: e_state.r.dot(&rail_vector),
                    rail_length,
                    burn_time: motor.burn_time,
                    vertical_velocity: e_state.v.z,
                    altitude: e_state.r.z,
                    main_deploy_alt,
                },
            );
            let stashed_peak_time = b_event.pending_apogee_time;
            let abnormal_contact = !b_event.touched_down
                && b_state.r.z > 0.0
                && e_state.r.z <= 0.0
                && !det.events.iter().any(|e| e.name == AstraeaEvent::Touchdown);

            if det.events.is_empty() {
                b_event = det.state.clone();
                event_state = det.state.clone();
                if abnormal_contact {
                    // Refine touchdown root on the current path.
                    let snapped = snap_for_refine(b_event.has_left_rail, is_drogue_deployed, is_main_deployed);
                    let refin = refine_crossing(
                        &b_state, b_t, t, &AstraeaEvent::Touchdown, &rail_vector, rail_length, main_deploy_alt,
                        launch_altitude_asl, wind_speed_surface, wind_azimuth_deg, fin_cant_rad,
                        vehicle, motor, snapped,
                    );
                    fold_prefix(&probe.committed_validity, &probe.dense, refin.time, &mut saw_unsupported, &mut saw_extrapolated);
                    e_state = RigidState { r: Vec3 { x: refin.state.r.x, y: refin.state.r.y, z: 0.0 }, ..refin.state };
                    push_touchdown_event(&mut events, refin.time, &e_state);
                    b_event = apply_fsm_transition(&b_event, &AstraeaEvent::Touchdown, &det.state, refin.time);
                    touchdown_nominal = b_event.is_apogee_reached;
                    event_state = b_event.clone();
                    touchdown_tau = Some(refin.time);
                    early_terminated = true;
                } else {
                    for v in &probe.committed_validity {
                        match v {
                            StageValidity::Unsupported => saw_unsupported = true,
                            StageValidity::Extrapolated => saw_extrapolated = true,
                            _ => {}
                        }
                    }
                }
                break;
            }

            // Resolve every candidate root on the pre-transition path.
            let mut candidates: Vec<(AstraeaEvent, f64, bool)> =
                det.events.iter().map(|e| (e.name, e.time, false)).collect();
            if abnormal_contact {
                let frac = (0.0 - b_state.r.z) / (e_state.r.z - b_state.r.z);
                candidates.push((AstraeaEvent::Touchdown, b_t + frac * (t - b_t), true));
            }
            // Roots (computed once, reused for selection AND service).
            struct Root {
                time: f64,
                state: RigidState,
            }
            let mut roots: Vec<Root> = Vec::with_capacity(candidates.len());
            for (name, ctime, _ab) in &candidates {
                if *name == AstraeaEvent::MotorBurnout {
                    let snapped = snap_for_refine(b_event.has_left_rail, is_drogue_deployed, is_main_deployed);
                    let st = if motor.burn_time <= b_t {
                        b_state
                    } else {
                        let loads = stage_loads_closure(
                            b_event.has_left_rail, is_drogue_deployed, is_main_deployed,
                            &rail_vector, launch_altitude_asl, wind_speed_surface, wind_azimuth_deg,
                            fin_cant_rad, vehicle, motor, snapped,
                        );
                        integrate_rigid_adaptive(&b_state, &loads, b_t, motor.burn_time, &tol,
                            0.05f64.min(motor.burn_time - b_t), 0.005f64.min(motor.burn_time - b_t)).state
                    };
                    roots.push(Root { time: motor.burn_time, state: st });
                } else if *ctime <= b_t || event_crossed_at_root(name, &b_state, &rail_vector, rail_length, main_deploy_alt) {
                    roots.push(Root { time: b_t, state: b_state });
                } else {
                    let snapped = snap_for_refine(b_event.has_left_rail, is_drogue_deployed, is_main_deployed);
                    let refin = refine_crossing(
                        &b_state, b_t, t, name, &rail_vector, rail_length, main_deploy_alt,
                        launch_altitude_asl, wind_speed_surface, wind_azimuth_deg, fin_cant_rad,
                        vehicle, motor, snapped,
                    );
                    roots.push(Root { time: refin.time, state: refin.state });
                }
            }
            let is_free = |n: &AstraeaEvent| -> bool {
                *n == AstraeaEvent::RailExit || *n == AstraeaEvent::MotorBurnout
            };
            let sel_times: Vec<f64> = candidates
                .iter()
                .enumerate()
                .map(|(i, (name, ctime, _))| {
                    if is_free(name) {
                        return roots[i].time;
                    }
                    if *ctime <= b_t {
                        return b_t;
                    }
                    if event_crossed_at_root(name, &b_state, &rail_vector, rail_length, main_deploy_alt) {
                        return f64::INFINITY;
                    }
                    roots[i].time.max(*ctime)
                })
                .collect();
            let names: Vec<AstraeaEvent> = candidates.iter().map(|c| c.0).collect();
            let serve_idx = select_next_candidate(&names, &sel_times);
            let (cand_name, cand_time, cand_abnormal) = candidates[serve_idx];
            let tau = roots[serve_idx].time;
            let root = roots[serve_idx].state;

            // Serve selected + FSM-simultaneous ties at the committed root.
            let mut served: Vec<(AstraeaEvent, f64, RigidState, f64)> = Vec::new();
            {
                let free = cand_abnormal || cand_name == AstraeaEvent::RailExit || cand_name == AstraeaEvent::MotorBurnout;
                let serve_at = if free { tau } else { tau.max(cand_time) };
                let serve_root = if serve_at > tau { dense_output_at(&probe.dense, serve_at) } else { root };
                served.push((cand_name, serve_at, serve_root, cand_time));
            }
            for (i, (name, ctime, _)) in candidates.iter().enumerate() {
                if i == serve_idx {
                    continue;
                }
                if (*ctime - cand_time).abs() > 1e-12 {
                    continue;
                }
                // Prereqs at the committed root state (b_event after selected).
                let tmp = apply_fsm_transition(&b_event, &cand_name, &det.state, tau);
                let prereq_ok = match name {
                    AstraeaEvent::MainDeploy => tmp.is_apogee_reached,
                    AstraeaEvent::ApogeeDrogue => tmp.has_left_rail && tmp.has_burned_out,
                    AstraeaEvent::Touchdown => tmp.is_apogee_reached,
                    _ => true,
                };
                if !prereq_ok {
                    continue;
                }
                let holds = if *name == AstraeaEvent::MotorBurnout {
                    tau >= motor.burn_time - 1e-12
                } else {
                    event_crossed_at_root(name, &root, &rail_vector, rail_length, main_deploy_alt)
                };
                if holds {
                    served.push((*name, tau, root, *ctime));
                }
            }

            for (name, serve_at, serve_root, chord_time) in served {
                transitions_in_bracket += 1;
                if transitions_in_bracket > 64 {
                    return Err("restart engine: transition cap exceeded in one macro bracket — re-detection is not converging".to_string());
                }
                if !(cand_abnormal && name == cand_name) && !selected_prereqs_met(&name, &b_event) {
                    continue;
                }
                fold_prefix(&probe.committed_validity, &probe.dense, serve_at, &mut saw_unsupported, &mut saw_extrapolated);
                let ev_time = if chord_time <= b_t { chord_time } else { serve_at };
                match name {
                    AstraeaEvent::RailExit => {
                        let speed = serve_root.v.norm();
                        rail_exit_vel = speed;
                        let exit = compute_flight_loads(
                            serve_at, &serve_root, is_drogue_deployed, is_main_deployed, false,
                            launch_altitude_asl, wind_speed_surface, wind_azimuth_deg,
                            fin_cant_rad, vehicle, motor,
                        );
                        match exit.loads.validity {
                            StageValidity::Unsupported => saw_unsupported = true,
                            StageValidity::Extrapolated => saw_extrapolated = true,
                            _ => {}
                        }
                        weathercock_angle_deg = exit.alpha_total_deg;
                        events.push(SimEvent {
                            time: serve_at,
                            name: "Launch Rail Departure".to_string(),
                            altitude: serve_root.r.z,
                            velocity: speed,
                            description: format!(
                                "Exited {:.1}m launch rail at {:.1} m/s (safe threshold >= 15 m/s). Total air-relative incidence at rail exit: {:.1}°.",
                                rail_length, speed, weathercock_angle_deg
                            ),
                        });
                    }
                    AstraeaEvent::MotorBurnout => {
                        burnout_alt = serve_root.r.z;
                        burnout_vel = serve_root.v.norm();
                        events.push(SimEvent {
                            time: serve_at,
                            name: "Motor Burnout".to_string(),
                            altitude: serve_root.r.z,
                            velocity: burnout_vel,
                            description: format!(
                                "Motor burnout at {:.0}m AGL. Burnout velocity: {:.0} m/s (Mach {:.2}). Transitioning to unpowered coast.",
                                serve_root.r.z, burnout_vel, burnout_vel / atmosphere_at(launch_altitude_asl + serve_root.r.z).1
                            ),
                        });
                    }
                    AstraeaEvent::ApogeeDrogue => {
                        let stashed = stashed_peak_time.map_or(false, |sp| sp <= b_t);
                        let served_peak = if stashed {
                            (max_altitude, apogee_time)
                        } else {
                            max_altitude = serve_root.r.z;
                            apogee_time = serve_at;
                            apogee_pos = serve_root.r;
                            (serve_root.r.z, serve_at)
                        };
                        is_apogee_reached = true;
                        is_drogue_deployed = true;
                        if vehicle.drogue.is_some() {
                            events.push(SimEvent {
                                time: ev_time,
                                name: "Apogee & Drogue Deployment".to_string(),
                                altitude: serve_root.r.z,
                                velocity: serve_root.v.norm(),
                                description: format!(
                                    "Physical peak {:.0}m ({:.0} ft) AGL at {:.2}s; recovery activated at {:.2}s (alt {:.0}m). High-speed drogue parachute ejected.",
                                    served_peak.0, served_peak.0 * 3.28084, served_peak.1, ev_time, serve_root.r.z
                                ),
                            });
                        }
                    }
                    AstraeaEvent::MainDeploy => {
                        is_main_deployed = true;
                        if vehicle.main_chute.is_some() {
                            events.push(SimEvent {
                                time: serve_at,
                                name: "Main Parachute Deployment".to_string(),
                                altitude: serve_root.r.z,
                                velocity: serve_root.v.z.abs(),
                                description: format!(
                                    "Main parachute opened at {:.0}m AGL. Decelerating descent for safe landing.",
                                    serve_root.r.z
                                ),
                            });
                        }
                    }
                    AstraeaEvent::Touchdown => {
                        let e_ground = RigidState {
                            r: Vec3 { x: serve_root.r.x, y: serve_root.r.y, z: 0.0 },
                            ..serve_root
                        };
                        e_state = e_ground;
                        push_touchdown_event(&mut events, serve_at, &e_ground);
                        b_event = apply_fsm_transition(&b_event, &name, &det.state, serve_at);
                        touchdown_nominal = b_event.is_apogee_reached;
                        event_state = b_event.clone();
                        touchdown_tau = Some(serve_at);
                        early_terminated = true;
                        break;
                    }
                    AstraeaEvent::None => {}
                }
                if name != AstraeaEvent::Touchdown {
                    b_event = apply_fsm_transition(&b_event, &name, &det.state, serve_at);
                } else {
                    break;
                }
            }
            if early_terminated || touchdown_tau.is_some() && b_event.touched_down {
                event_state = b_event.clone();
                // e_state already set for touchdown path; for selected-touchdown
                // served above, reconstruct ground state.
                if !early_terminated {
                    e_state = RigidState { r: Vec3 { x: root.r.x, y: root.r.y, z: 0.0 }, ..root };
                    touchdown_tau = Some(tau);
                    touchdown_nominal = b_event.is_apogee_reached;
                    early_terminated = true;
                }
                break;
            }
            event_state = b_event.clone();
            // Next bracket from the transition root.
            b_t = tau;
            b_state = root;
            b_sample = EventSamplePair {
                t: tau,
                altitude_along_rail: root.r.dot(&rail_vector),
                vertical_velocity: root.v.z,
                altitude: root.r.z,
            };
            let _ = &stashed_peak_time;
        }

        // Commit resolved bracket-end state.
        pos = e_state.r;
        vel = e_state.v;
        q = e_state.q;
        let (p, qq, r) = kernel_omega_to_sim(&e_state.w);
        omega_p = p;
        omega_q = qq;
        omega_r = r;

        if early_terminated {
            break;
        }
        // Timeout-path fold uses the last probe; track empties (first iter).
        if b_t >= prev_sample.t && t > prev_sample.t {
            let _ = &bracket_probe_validity;
        }

        if !event_state.has_left_rail {
            clamp_rail_base_contact(&mut pos, &mut vel, &rail_vector);
        }
        if !is_apogee_reached && pos.z > max_altitude {
            max_altitude = pos.z;
            apogee_time = t;
            apogee_pos = pos;
        }

        // Macro loads at the committed state (display kinematics source).
        let macro_state = RigidState {
            r: pos,
            v: vel,
            q,
            w: sim_omega_to_kernel(omega_p, omega_q, omega_r),
        };
        let macro_detail = compute_flight_loads(
            t, &macro_state, is_drogue_deployed, is_main_deployed, !event_state.has_left_rail,
            launch_altitude_asl, wind_speed_surface, wind_azimuth_deg, fin_cant_rad, vehicle, motor,
        );
        match macro_detail.loads.validity {
            StageValidity::Unsupported => saw_unsupported = true,
            StageValidity::Extrapolated => saw_extrapolated = true,
            _ => {}
        }
        if macro_detail.mach > max_mach {
            max_mach = macro_detail.mach;
        }
        if macro_detail.airspeed > max_speed {
            max_speed = macro_detail.airspeed;
        }
        if event_state.has_left_rail && !is_drogue_deployed && !is_main_deployed
            && macro_detail.alpha_total_deg > max_alpha_deg
        {
            max_alpha_deg = macro_detail.alpha_total_deg;
        }

        let mut accel_world = Vec3 {
            x: macro_detail.loads.force_n.x / macro_detail.loads.mass,
            y: macro_detail.loads.force_n.y / macro_detail.loads.mass,
            z: macro_detail.loads.force_n.z / macro_detail.loads.mass,
        };
        let distance_along_rail = pos.dot(&rail_vector);
        if !event_state.has_left_rail && distance_along_rail < rail_length {
            let forward_force = macro_detail.loads.force_n.dot(&rail_vector);
            let forward_vel = vel.dot(&rail_vector);
            let mut forward_accel = forward_force / macro_detail.loads.mass;
            if distance_along_rail <= 0.0 && forward_vel <= 0.0 && forward_accel <= 0.0 {
                forward_accel = 0.0;
            }
            accel_world = Vec3 {
                x: forward_accel * rail_vector.x,
                y: forward_accel * rail_vector.y,
                z: forward_accel * rail_vector.z,
            };
            omega_p = 0.0;
            omega_q = 0.0;
            omega_r = 0.0;
            q = normalize_quaternion(&initial_q);
        }
        let scalar_accel = (accel_world.x * accel_world.x + accel_world.y * accel_world.y + accel_world.z * accel_world.z).sqrt();
        if scalar_accel > max_accel {
            max_accel = scalar_accel;
        }

        prev_sample = EventSamplePair {
            t,
            altitude_along_rail: distance_along_rail,
            vertical_velocity: vel.z,
            altitude: pos.z,
        };
        prev_full_state = RigidState {
            r: pos,
            v: vel,
            q,
            w: sim_omega_to_kernel(omega_p, omega_q, omega_r),
        };
        prev_event_state = event_state.clone();

        t += dt;
        macro_iterations += 1;
        if macro_iterations > MAX_MACRO_ITERATIONS {
            return Err("simulate6DofFlight: macro-iteration cap exceeded — time step cannot resolve the horizon".to_string());
        }
    }

    if touchdown_tau.is_none() && !last_probe_validity.is_empty() {
        for v in &last_probe_validity {
            match v {
                StageValidity::Unsupported => saw_unsupported = true,
                StageValidity::Extrapolated => saw_extrapolated = true,
                _ => {}
            }
        }
    }
    if let Some(tau) = touchdown_tau {
        t = tau;
    }
    let landing_speed = vel.norm();
    let (mot_current, _) = motor_mass_at(motor, t);
    let landing_mass = vehicle.dry_mass + mot_current;
    let landing_ke = 0.5 * landing_mass * landing_speed * landing_speed;
    let drift = (pos.x * pos.x + pos.y * pos.y).sqrt();
    let terminated = event_state.touched_down;
    let enveloped = max_mach <= 4.0 && max_alpha_deg <= 30.0;
    let finite_landing = landing_ke.is_finite() && landing_speed.is_finite();
    let off_nominal = saw_unsupported || saw_extrapolated;
    let validity = if saw_unsupported {
        "UNKNOWN"
    } else if !terminated || !finite_landing {
        "FAIL"
    } else if !touchdown_nominal {
        "UNKNOWN"
    } else if off_nominal || !enveloped {
        "UNKNOWN"
    } else {
        "PASS"
    };

    Ok(SimulationResult {
        apogee_altitude: max_altitude,
        apogee_time,
        apogee_position: apogee_pos,
        max_velocity: max_speed,
        max_mach,
        max_acceleration_g: max_accel / G0,
        burnout_altitude: burnout_alt,
        burnout_velocity: burnout_vel,
        burnout_time: motor.burn_time,
        rail_exit_velocity: rail_exit_vel,
        weathercock_angle_deg,
        landing_position: LandingPosition { x: pos.x, y: pos.y },
        landing_distance: drift,
        landing_velocity: landing_speed,
        landing_kinetic_energy: landing_ke,
        landing_mass,
        flight_time: t,
        terminated,
        touchdown_nominal: if terminated { touchdown_nominal } else { false },
        validity: validity.to_string(),
        enveloped,
        off_nominal_excursion: off_nominal,
        events,
    })
}

// Helpers for the restart engine -------------------------------------------

#[derive(Clone, Copy)]
struct StageSnap {
    has_rail: bool,
    drogue: bool,
    main: bool,
}

fn snap_for_refine(has_rail: bool, drogue: bool, main: bool) -> StageSnap {
    StageSnap { has_rail, drogue, main }
}

#[allow(clippy::too_many_arguments)]
fn stage_loads_closure<'a>(
    has_rail: bool,
    drogue: bool,
    main: bool,
    rail_vector: &'a Vec3,
    launch_altitude_asl: f64,
    wind_speed_surface: f64,
    wind_azimuth_deg: f64,
    fin_cant_rad: f64,
    vehicle: &'a Vehicle,
    motor: &'a MotorSpec,
    _snap: StageSnap,
) -> impl Fn(f64, &RigidState) -> Loads + 'a {
    let rail = *rail_vector;
    move |ts: f64, st: &RigidState| -> Loads {
        let fl = compute_flight_loads(
            ts, st, drogue, main, !has_rail,
            launch_altitude_asl, wind_speed_surface, wind_azimuth_deg,
            fin_cant_rad, vehicle, motor,
        );
        if !has_rail {
            let s_along = st.r.dot(&rail);
            let v_along = st.v.dot(&rail);
            let fdot = fl.loads.force_n.dot(&rail);
            if s_along <= 0.0 && v_along <= 0.0 && fdot <= 0.0 {
                return Loads {
                    force_n: Vec3::zero(),
                    moment_b: Vec3::zero(),
                    inertia_b: fl.loads.inertia_b,
                    inertia_dot_b: fl.loads.inertia_dot_b,
                    mass: fl.loads.mass,
                    validity: fl.loads.validity,
                };
            }
            return Loads {
                force_n: Vec3 { x: fdot * rail.x, y: fdot * rail.y, z: fdot * rail.z },
                moment_b: Vec3::zero(),
                inertia_b: fl.loads.inertia_b,
                inertia_dot_b: fl.loads.inertia_dot_b,
                mass: fl.loads.mass,
                validity: fl.loads.validity,
            };
        }
        fl.loads
    }
}

#[allow(clippy::too_many_arguments)]
fn refine_crossing(
    base: &RigidState,
    t0: f64,
    t1: f64,
    name: &AstraeaEvent,
    rail_vector: &Vec3,
    rail_length: f64,
    main_deploy_alt: f64,
    launch_altitude_asl: f64,
    wind_speed_surface: f64,
    wind_azimuth_deg: f64,
    fin_cant_rad: f64,
    vehicle: &Vehicle,
    motor: &MotorSpec,
    snap: StageSnap,
) -> Refined {
    // Panics on unbracketed crossings with the same messages as the TS
    // restart engine.
    let crossed = |s: &RigidState| event_crossed_at_root(name, s, rail_vector, rail_length, main_deploy_alt);
    if crossed(base) {
        panic!("restart engine: crossing already satisfied at the bracket base");
    }
    let tol = AdaptiveTolerances { r: 1e-3, v: 1e-2, q: 1e-5, w: 1e-3 };
    let loads = stage_loads_closure(
        snap.has_rail, snap.drogue, snap.main, rail_vector,
        launch_altitude_asl, wind_speed_surface, wind_azimuth_deg,
        fin_cant_rad, vehicle, motor, snap,
    );
    let path = integrate_rigid_adaptive(base, &loads, t0, t1, &tol, 0.05f64.min(t1 - t0), 0.005f64.min(t1 - t0));
    if !crossed(&path.state) {
        panic!("restart engine: crossing not bracketed by the segment end — detector mismatch");
    }
    let tol_t = 1e-5;
    let mut a = t0;
    let mut b = t1;
    while b - a > tol_t {
        let mid = (a + b) / 2.0;
        if crossed(&dense_output_at(&path.dense, mid)) {
            b = mid;
        } else {
            a = mid;
        }
    }
    Refined { time: b, state: dense_output_at(&path.dense, b) }
}

fn fold_prefix(
    committed: &[StageValidity],
    dense: &[AdaptiveDenseStep],
    tau: f64,
    saw_unsupported: &mut bool,
    saw_extrapolated: &mut bool,
) {
    for i in 0..dense.len() {
        if dense[i].t0 >= tau {
            break;
        }
        match committed[i] {
            StageValidity::Unsupported => *saw_unsupported = true,
            StageValidity::Extrapolated => *saw_extrapolated = true,
            _ => {}
        }
    }
}

fn push_touchdown_event(events: &mut Vec<SimEvent>, time: f64, e_ground: &RigidState) {
    let speed = e_ground.v.norm();
    let drift = (e_ground.r.x * e_ground.r.x + e_ground.r.y * e_ground.r.y).sqrt();
    events.push(SimEvent {
        time,
        name: "Ground Touchdown".to_string(),
        altitude: 0.0,
        velocity: speed,
        description: format!(
            "Touchdown at {:.1} m/s. Total lateral wind drift: {:.0}m from pad.",
            speed, drift
        ),
    });
}

// ---------------------------------------------------------------------------
// Parity tests (oracle values extracted with `bun` against the TS sources;
// never hand-invented)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn default_opts() -> SixDofOptions {
        SixDofOptions {
            rail_length: Some(1.0),
            rail_elevation_deg: Some(90.0),
            rail_azimuth_deg: Some(0.0),
            launch_altitude_asl: None,
            wind_speed_surface: Some(0.0),
            wind_azimuth_deg: Some(90.0),
            main_deploy_altitude_agl: Some(250.0),
            time_step: None,
            fin_cant_angle_deg: None,
        }
    }

    #[test]
    fn rail_length_validation_exact() {
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        let mut o = default_opts();
        o.rail_length = Some(0.0);
        assert_eq!(
            simulate_flight(&v, &m, &o).unwrap_err(),
            "simulate6DofFlight: railLength must be positive (got 0)"
        );
        o.rail_length = Some(-2.0);
        assert_eq!(
            simulate_flight(&v, &m, &o).unwrap_err(),
            "simulate6DofFlight: railLength must be positive (got -2)"
        );
    }

    #[test]
    fn rail_elevation_domain_errors_exact() {
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        let mut o = default_opts();
        o.rail_elevation_deg = Some(65.0);
        assert_eq!(
            simulate_flight(&v, &m, &o).unwrap_err(),
            "simulate6DofFlight: railElevationDeg 65° is outside the declared launch-rail domain [70°, 90°]"
        );
        o.rail_elevation_deg = Some(95.0);
        assert_eq!(
            simulate_flight(&v, &m, &o).unwrap_err(),
            "simulate6DofFlight: railElevationDeg 95° is outside the declared launch-rail domain [70°, 90°]"
        );
    }

    #[test]
    fn zero_wind_landing_parity() {
        // Oracle (bun vs TS): apogee 388.72144947515324 m, drift ~0 m,
        // flight 105.28801757814196 s, landing 3.987307476131326 m/s.
        // Documented tolerance: apogee <= 0.5% relative, landing drift
        // <= 5 m absolute.
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        let r = simulate_flight(&v, &m, &default_opts()).expect("flight must run");
        assert!(r.terminated, "flight must terminate at touchdown");
        let rel = ((r.apogee_altitude - 388.72144947515324) / 388.72144947515324).abs();
        assert!(rel <= 0.005, "apogee rel err {} exceeds 0.5%", rel);
        assert!(r.landing_distance <= 5.0, "landing drift {} exceeds 5 m abs", r.landing_distance);
        assert!(r.landing_position.x.abs() <= 5.0 && r.landing_position.y.abs() <= 5.0);
        // Pin the near-exact agreement so regressions fail loudly.
        assert!(rel < 1e-6, "apogee drifted from oracle: rel err {}", rel);
        assert!((r.flight_time - 105.28801757814196).abs() < 0.05, "flight time {}", r.flight_time);
        assert!((r.landing_velocity - 3.987307476131326).abs() < 0.05, "landing vel {}", r.landing_velocity);
    }

    #[test]
    fn determinism_same_inputs_identical_outputs() {
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        let a = simulate_flight(&v, &m, &default_opts()).unwrap();
        let b = simulate_flight(&v, &m, &default_opts()).unwrap();
        assert_eq!(a.apogee_altitude, b.apogee_altitude);
        assert_eq!(a.flight_time, b.flight_time);
        assert_eq!(a.landing_position.x, b.landing_position.x);
        assert_eq!(a.landing_position.y, b.landing_position.y);
        assert_eq!(a.events.len(), b.events.len());
        for (x, y) in a.events.iter().zip(b.events.iter()) {
            assert_eq!(x.time, y.time);
            assert_eq!(x.name, y.name);
        }
    }

    #[test]
    fn event_order_nominal_sequence() {
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        let r = simulate_flight(&v, &m, &default_opts()).unwrap();
        let names: Vec<&str> = r.events.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "Ignition & Rail Guidance",
                "Launch Rail Departure",
                "Motor Burnout",
                "Apogee & Drogue Deployment",
                "Main Parachute Deployment",
                "Ground Touchdown",
            ]
        );
        for i in 1..r.events.len() {
            assert!(r.events[i].time > r.events[i - 1].time, "event times must strictly increase");
        }
        // Touchdown event time IS the flight duration.
        assert_eq!(r.events.last().unwrap().time, r.flight_time);
    }

    #[test]
    fn select_next_candidate_refined_order() {
        use AstraeaEvent::*;
        assert_eq!(select_next_candidate(&[RailExit, MotorBurnout], &[0.5, 0.3]), 1);
        assert_eq!(select_next_candidate(&[RailExit, MotorBurnout], &[0.2, 0.3]), 0);
        assert_eq!(select_next_candidate(&[ApogeeDrogue, RailExit], &[0.4, 0.3]), 1);
        assert_eq!(select_next_candidate(&[ApogeeDrogue, MainDeploy], &[0.4, 0.4]), 0);
        assert_eq!(select_next_candidate(&[ApogeeDrogue, MotorBurnout], &[1.0, 1.0]), 1);
        assert_eq!(
            select_next_candidate(&[ApogeeDrogue, MainDeploy], &[6.19, f64::INFINITY]),
            0
        );
    }

    #[test]
    fn crossed_at_root_and_prereqs() {
        let rail = Vec3 { x: 0.0, y: 0.0, z: 1.0 };
        let above = RigidState {
            r: Vec3 { x: 0.0, y: 0.0, z: 300.0 },
            v: Vec3 { x: 0.0, y: 0.0, z: -5.0 },
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 },
            w: Vec3::zero(),
        };
        let below = RigidState { r: Vec3 { x: 0.0, y: 0.0, z: 200.0 }, ..above };
        assert!(!event_crossed_at_root(&AstraeaEvent::MainDeploy, &above, &rail, 1.0, 250.0));
        assert!(event_crossed_at_root(&AstraeaEvent::MainDeploy, &below, &rail, 1.0, 250.0));
        assert!(event_crossed_at_root(&AstraeaEvent::ApogeeDrogue, &above, &rail, 1.0, 250.0));
        let climbing = RigidState { v: Vec3 { x: 0.0, y: 0.0, z: 3.0 }, ..above };
        assert!(!event_crossed_at_root(&AstraeaEvent::ApogeeDrogue, &climbing, &rail, 1.0, 250.0));
        let b = EventState::newton();
        assert!(selected_prereqs_met(&AstraeaEvent::RailExit, &b));
        assert!(!selected_prereqs_met(&AstraeaEvent::ApogeeDrogue, &b));
        assert!(!selected_prereqs_met(&AstraeaEvent::Touchdown, &b));
    }

    #[test]
    fn clamp_base_contact_projects_penetration() {
        let rail = Vec3 { x: 0.0, y: 0.0, z: 1.0 };
        let mut pos = Vec3 { x: 1.0, y: 2.0, z: -0.05 };
        let mut vel = Vec3 { x: 3.0, y: -1.0, z: -2.0 };
        clamp_rail_base_contact(&mut pos, &mut vel, &rail);
        assert_eq!(pos.z, 0.0);
        assert_eq!(pos.x, 1.0);
        assert_eq!(vel.z, 0.0);
        assert_eq!(vel.x, 3.0);
        let mut pos2 = Vec3 { x: 0.0, y: 0.0, z: 0.5 };
        let mut vel2 = Vec3 { x: 0.0, y: 0.0, z: 4.0 };
        clamp_rail_base_contact(&mut pos2, &mut vel2, &rail);
        assert_eq!(pos2.z, 0.5);
        assert_eq!(vel2.z, 4.0);
    }
}
