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
//! * Telemetry is recorded opt-in (`SixDofOptions::record_telemetry`, default
//!   off, no wire field) at the same macro-step instants as the TS oracle and
//!   returned as the FULL series on `SimulationResult::telemetry`; the Tauri
//!   shell decimates it to one bounded display series for IPC
//!   (`crate::telemetry::decimate_telemetry`). Metrics, events, and landing
//!   state are unchanged. Tolerance contribution: none — telemetry is display
//!   rounding of the same committed states.
//! * The run manifest is a fixed set of descriptive strings matching the TS
//!   manifest. Tolerance contribution: none (metadata only).
//!
//! Verified parity: zero-wind vertical Estes Alpha / C6 flight matches the TS
//! oracle apogee within 0.5% relative and landing drift within 5 m absolute
//! (both far inside the band; actual agreement is much tighter — see tests).

pub use crate::telemetry::TelemetryPoint;
use crate::telemetry::{js_to_fixed, BodyRates};
use std::f64::consts::PI;

pub(crate) const G0: f64 = 9.80665;

/// Declared launch-rail elevation domain, degrees from horizontal. The
/// trajectory kernel rejects values outside it; the Monte Carlo sampler folds
/// into the same bounds, so the two definitions cannot drift.
pub const RAIL_ELEVATION_MIN_DEG: f64 = 70.0;
pub const RAIL_ELEVATION_MAX_DEG: f64 = 90.0;

/// Incidence stops being a validity input once aerodynamics are negligible
/// (mirror of TS `AERO_NEGLIGIBLE_WEIGHT_FRACTION`): when the largest possible
/// aero force q·S·(|CNα| + |CD|) is below this fraction of weight, the
/// incidence envelope and the tail-first check do not degrade load validity.
/// Forces and moments are computed exactly as before.
/// Threshold evidence is recorded beside the TS constant in `src/dynamics/loads.ts`.
pub const AERO_NEGLIGIBLE_WEIGHT_FRACTION: f64 = 0.1;

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

/// Split-gauge threshold for the presentation extraction: both `atan2` pairs
/// have magnitude `|cos pitch|`, so inside this band the roll/yaw split is a
/// gauge (gimbal lock). It is a roundoff-level branch (~5.7e-7 deg from
/// vertical), not a display tolerance.
const EULER_LOCK_COS_EPS: f64 = 1e-8;

/// Attitude quaternion to presentation Euler angles (degrees). Mirrors TS.
///
/// Convention: `R_NB = Rz(yaw) * Rx(pitch) * Ry(roll)` (intrinsic
/// yaw -> pitch -> roll; equivalently fixed-axis Ry, Rx, Rz). `pitch` is the
/// nose elevation, `roll` the right-handed spin about the longitudinal +Y, and
/// `yaw` the right-handed rotation about +Z (a launch azimuth `a` reads
/// `yaw = -a`).
///
/// `q` and `-q` return the same angles. At `|pitch| = 90` the roll/yaw split is
/// indeterminate: the function fixes the gauge `roll = 0`, snaps `pitch` to
/// +/-90 and puts the combined z-rotation in `yaw`, so the triple still
/// reconstructs `R` instead of returning an `atan2(0, 0)` representative. The
/// triple is non-authoritative presentation data; `q` remains canonical.
pub fn quaternion_to_euler_deg(q: &Quat) -> (f64, f64, f64) {
    let (w, x, y, z) = (q.w, q.x, q.y, q.z);
    let sin_pitch = 2.0 * (w * x + y * z);
    let sin_roll = 2.0 * (w * y - z * x);
    let cos_pair = sin_roll.hypot(1.0 - 2.0 * (x * x + y * y));
    let (pitch, roll, yaw) = if cos_pair <= EULER_LOCK_COS_EPS {
        let sign = if sin_pitch < 0.0 { -1.0 } else { 1.0 };
        (sign * (PI / 2.0), 0.0,
         sign * (2.0 * (w * y + z * x)).atan2(1.0 - 2.0 * (y * y + z * z)))
    } else {
        let pitch = if sin_pitch.abs() >= 1.0 {
            sin_pitch.signum() * (PI / 2.0)
        } else {
            sin_pitch.asin()
        };
        (pitch,
         sin_roll.atan2(1.0 - 2.0 * (x * x + y * y)),
         (2.0 * (w * z - x * y)).atan2(1.0 - 2.0 * (x * x + z * z)))
    };
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

/// Strict two-choice absolute-state-tolerance policy for native candidate
/// diagnostic controls. Literal mapping lives here and nowhere else; this is
/// not a generic tolerance API and the literals are not derived budgets.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AbsoluteTolerancePolicy {
    /// The inherited production values (r1e-3, v1e-2, q1e-5, w1e-3).
    Inherited,
    /// Hundredth-scale diagnostic literals (r1e-5, v1e-4, q1e-7, w1e-5).
    Hundredth,
}

impl AbsoluteTolerancePolicy {
    pub fn tolerances(self) -> AdaptiveTolerances {
        match self {
            Self::Inherited => AdaptiveTolerances { r: 1e-3, v: 1e-2, q: 1e-5, w: 1e-3 },
            Self::Hundredth => AdaptiveTolerances { r: 1e-5, v: 1e-4, q: 1e-7, w: 1e-5 },
        }
    }
}

/// Candidate-only diagnostic controls accepted at the native candidate DTO.
/// Ordinary and legacy callers never construct this and keep inherited behavior.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CandidateDiagnosticControls {
    pub tolerance_policy: AbsoluteTolerancePolicy,
    pub split_at_thrust_knots: bool,
}

/// Mechanism evidence for one bounded candidate run. Bookkeeping only: it never
/// changes integration, and it is reported outside the compared candidate report.
#[derive(Clone, Debug, Default)]
pub struct MechanismEvidence {
    /// Exact sorted unique cut list actually applied (thrust knots + burnout).
    pub cut_knots: Vec<f64>,
    /// `(trial start, knot time)` for no-split trials whose span strictly contained a knot.
    pub straddled: Vec<(f64, f64)>,
    /// `(trial start, knot time)` for split trials clipped to land exactly on a knot.
    pub clipped: Vec<(f64, f64)>,
    /// `(trial start, proposed end)` for every trial attempt starting in [0.18, 0.25] s.
    pub step_window: Vec<(f64, f64)>,
    /// Accepted adaptive steps across every integration call in the driver.
    pub accepted_steps: u64,
    /// Rejected adaptive trials across every integration call in the driver.
    pub rejected_steps: u64,
}

impl MechanismEvidence {
    pub fn adaptive_trials(&self) -> u64 {
        self.accepted_steps + self.rejected_steps
    }
}

/// Exact sorted unique time-tabulated thrust breakpoints plus burnout.
///
/// `validate_motor_spec` rejects unsorted/duplicate/non-finite curves before
/// the driver can call this, but the normalization is kept explicit and
/// deterministic so a direct caller (or a future validated table) gets the
/// same cut list on every platform: finite values only, `total_cmp` order,
/// bitwise dedup, and burnout exactly once. An empty or one-point curve still
/// yields the burnout boundary rather than panicking.
pub(crate) fn thrust_cut_times(motor: &MotorSpec) -> Vec<f64> {
    let mut cut_knots: Vec<f64> = motor.thrust_curve.iter().map(|p| p.time)
        .chain(std::iter::once(motor.burn_time))
        .filter(|t| t.is_finite())
        .collect();
    cut_knots.sort_by(f64::total_cmp);
    cut_knots.dedup_by(|a, b| a.to_bits() == b.to_bits());
    cut_knots
}

pub(crate) struct AdaptiveDiagnostics {
    pub tolerance_policy: AbsoluteTolerancePolicy,
    pub split_at_thrust_knots: bool,
    /// Sorted unique exact f64 candidates: validated motor thrust-curve times plus burnout.
    pub cut_knots: Vec<f64>,
    pub mechanism: MechanismEvidence,
}

impl AdaptiveDiagnostics {
    pub(crate) fn for_motor(motor: &MotorSpec, controls: Option<CandidateDiagnosticControls>) -> Self {
        let cut_knots = thrust_cut_times(motor);
        let cut_knots_for_report = cut_knots.clone();
        Self {
            tolerance_policy: controls.map(|c| c.tolerance_policy).unwrap_or(AbsoluteTolerancePolicy::Inherited),
            // Absent controls now select the production default (split on).
            split_at_thrust_knots: controls.map(|c| c.split_at_thrust_knots).unwrap_or(true),
            cut_knots,
            mechanism: MechanismEvidence { cut_knots: cut_knots_for_report, ..Default::default() },
        }
    }
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
/// Reported driver limits; values are the historical literals, named only so the
/// diagnostic sidecar can report the actual applied settings.
pub const MAX_ADAPTIVE_STEP_CAP_S: f64 = 0.05;
pub const INITIAL_ADAPTIVE_STEP_CAP_S: f64 = 0.005;
/// Bisection width for localized event times. This is a numerical root width,
/// not an acceptance budget; the reported root is the bracket midpoint.
pub const EVENT_ROOT_WIDTH_S: f64 = 1e-7;

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
    loads_at: &dyn Fn(f64, &RigidState) -> Result<Loads, String>,
    t0: f64,
    t_end: f64,
    tol: &AdaptiveTolerances,
    max_step: f64,
    dt_init: f64,
    cut_knots: &[f64],
    split: bool,
    mut diagnostics: Option<&mut AdaptiveDiagnostics>,
) -> Result<AdaptiveResult, String> {
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
        let mut h = dt.min(max_step).min(remaining);
        let mut next_time = if h >= remaining { t_end } else { t + h };
        // Representable-progress floor. A knot closer to t than this is treated
        // as coincident (no split): clipping there would request a zero/near-zero
        // step and could stall the integrator. A knot at exactly t is already
        // skipped by the strict `knot > t` test.
        let floor = f64::EPSILON * 1.0f64.max(t.abs()).max(t_end.abs());
        let mut inside: Option<f64> = None;
        for &knot in cut_knots {
            if knot > t && knot < next_time {
                if split && knot - t <= floor {
                    continue;
                }
                inside = Some(knot);
                break;
            }
        }
        if let Some(knot) = inside {
            if split {
                // Land exactly on the represented boundary; no stage of this
                // trial evaluates beyond it. The growth controller formula is
                // untouched: the clipped step is the step actually taken, as
                // for any other hard boundary.
                next_time = knot;
                h = next_time - t;
                if let Some(diag) = diagnostics.as_deref_mut() {
                    diag.mechanism.clipped.push((t, knot));
                }
            } else if let Some(diag) = diagnostics.as_deref_mut() {
                diag.mechanism.straddled.push((t, knot));
            }
        }
        if let Some(diag) = diagnostics.as_deref_mut() {
            if (0.18..=0.25).contains(&t) {
                diag.mechanism.step_window.push((t, next_time));
            }
        }
        if !next_time.is_finite() || next_time <= t {
            panic!("adaptive integrator: trial cannot make representable progress");
        }

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
            let l = loads_at(ti, &sti)?;
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
            dense.push(AdaptiveDenseStep { t0: t, t1: next_time, y0: y_prev, f0: ks[0], y1, f1: ks[6] });
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

    if let Some(diag) = diagnostics.as_deref_mut() {
        diag.mechanism.accepted_steps += steps as u64;
        diag.mechanism.rejected_steps += rejected as u64;
    }
    Ok(AdaptiveResult { state: s, dense, committed_validity })
}

fn rel_quat_angle(qa: &Quat, qb: &Quat) -> f64 {
    // angle(qa ⊗ qb⁻¹)
    let w = qa.w * qb.w + qa.x * qb.x + qa.y * qb.y + qa.z * qb.z;
    let x = qa.w * qb.x - qa.x * qb.w - qa.y * qb.z + qa.z * qb.y;
    let y = qa.w * qb.y + qa.x * qb.z - qa.y * qb.w - qa.z * qb.x;
    let z = qa.w * qb.z - qa.x * qb.y + qa.y * qb.x - qa.z * qb.w;
    let s = (x * x + y * y + z * z).sqrt();
    2.0 * crate::v8_math::js_atan2(s, w.abs())
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
    wind_vector_for_speed(speed, azimuth_deg)
}

fn wind_vector_for_speed(speed: f64, azimuth_deg: f64) -> Vec3 {
    let az = azimuth_deg * PI / 180.0;
    let towards = az + PI;
    Vec3 {
        x: speed * crate::v8_math::js_sin(towards),
        y: speed * crate::v8_math::js_cos(towards),
        z: 0.0,
    }
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

pub(crate) fn validate_motor_spec(motor: &MotorSpec) -> Result<(), String> {
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

/// Total curve impulse without the legacy panic. Used by candidate validation to
/// reject a motor record whose integrated thrust is nonfinite or nonpositive
/// before the shared driver's mass-flow query can reach `motor_impulse_total`.
pub(crate) fn motor_total_impulse_value(motor: &MotorSpec) -> f64 {
    integrate_thrust_curve(motor, motor.burn_time)
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

/// Supersonic treatment of a contracting afterbody (boattail).
///
/// `Attached` keeps the subsonic slender-body/area-rule term at all Mach
/// (normal force proportional to dS/dx, hence negative lift on a boattail in
/// attached flow).
///
/// `Suppressed` drops the contracting term above the blend band. This is an
/// explicitly qualified **interim model-form assumption**, not a validated
/// separation model and not a conservative stability bound. A separated base
/// wake does not establish zero pressure-derived normal force over the whole
/// boattail; MIL-HDBK-762 §5-3.1.2 (printed p. 5-12) retains negative
/// boattail loading and directs supersonic estimates to component data. No
/// source supporting zero lift for every supersonic boattail was established,
/// so the original source-supported-suppression condition is literally unmet.
/// The better ARCAS total CP does not isolate boattail physics; compensation
/// between terms is possible. Both arms are retained; no arbitrary partial
/// factor is introduced. A later general model needs geometry- and
/// Mach-dependent evidence.
///
/// Stability fix; supersonic CP not validated to the ARCAS band. ARCAS CP/CNα gate remains FAIL. Supersonic boattail lift is suppressed as an interim approximation; the attached sensitivity arm is retained.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BoattailLift {
    Suppressed,
    Attached,
}

/// One fin set's published-law inputs. `cna_per_rad` is the signed subsonic
/// Barrowman fin-group slope for this set (body interference included);
/// `cp_station_m` is its CP station from the nose.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FinNormalSet {
    pub cna_per_rad: f64,
    pub cp_station_m: f64,
    pub aspect_ratio: f64,
    pub leading_edge_cos: f64,
}

/// Prepared inputs for the published supersonic normal law (Option B).
///
/// `body_positive_*` are the non-fin contributions with positive CNalpha
/// (nose and diameter increases; the sum telescopes to 2·(dmax/dref)²).
/// `body_attached_*` are all non-fin contributions, i.e. the legacy group
/// including the boattail's negative slender-body term.
#[derive(Clone, Debug, PartialEq)]
pub struct SupersonicNormal {
    pub fin_sets: Vec<FinNormalSet>,
    pub body_positive_cna: f64,
    pub body_positive_moment: f64,
    pub body_positive_abs_cna: f64,
    pub body_attached_cna: f64,
    pub body_attached_moment: f64,
    pub body_attached_abs_cna: f64,
    pub boattail_lift: BoattailLift,
}

impl SupersonicNormal {
    pub fn body_positive_cp(&self) -> f64 {
        self.body_positive_moment / self.body_positive_cna
    }
    pub fn body_attached_cp(&self) -> f64 {
        self.body_attached_moment / self.body_attached_cna
    }
}

#[derive(Clone, Debug)]
pub struct Vehicle {
    pub dry_mass: f64,
    pub cg_from_nose: f64,
    pub total_length: f64,
    pub ref_diameter: f64,
    pub cna_body: f64,
    pub cna_fins: f64,
    /// Signed Σ(CNalpha*x), about the nose. A zero-force group may carry a couple.
    pub body_first_moment: f64,
    pub fin_first_moment: f64,
    /// Σ|CNalpha_i| within each group, retained before cancellation.
    pub body_abs_cna: f64,
    pub fin_abs_cna: f64,
    pub motor_aft_station_from_nose: f64,
    pub drogue: Option<Parachute>,
    pub main_chute: Option<Parachute>,
    /// Drag tables as Cd values at mach = i*4/(n-1) (mirrors TS dragCurves).
    pub aero_powered_cd: Vec<f64>,
    pub aero_coasting_cd: Vec<f64>,
    /// Published supersonic normal-law inputs. `None` keeps the legacy
    /// fin-only Mach law exactly (all pre-existing fixtures and call sites).
    pub supersonic_normal: Option<SupersonicNormal>,
}

impl Vehicle {
    /// Vehicle reference area. Mirrors TS `(Math.PI / 4) * Math.pow(d, 2)`:
    /// the square is rounded first, and `(PI / 4) * d * d` would differ by one ULP.
    pub fn ref_area(&self) -> f64 {
        (PI / 4.0) * (self.ref_diameter * self.ref_diameter)
    }
    pub(crate) fn r_body(&self) -> f64 {
        self.ref_diameter / 2.0
    }

    /// Normal-force law and boattail-policy identity for run metadata.
    ///
    /// The historical assembly id (`flight-signed-normal-plus-wind-drag-v1`)
    /// is deliberately unchanged; this pair names the normal-force law that
    /// the run actually evaluated and the boattail policy in force.
    pub fn normal_law_identity(&self) -> (&'static str, &'static str) {
        match self.supersonic_normal.as_ref().map(|p| p.boattail_lift) {
            None => ("legacy-finsonly-degrade-v1", "not-applicable"),
            Some(BoattailLift::Suppressed) => {
                ("published-supersonic-normal-v1", "suppressed")
            }
            Some(BoattailLift::Attached) => {
                ("published-supersonic-normal-v1", "attached")
            }
        }
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
        body_first_moment: 2.0 * 0.07689,
        fin_first_moment: 22.317876312553757 * 0.4355970197602852,
        body_abs_cna: 2.0,
        fin_abs_cna: 22.317876312553757,
        motor_aft_station_from_nose: 0.476,
        drogue: Some(Parachute { diameter: 0.305, cd: 0.8 }),
        main_chute: Some(Parachute { diameter: 0.305, cd: 0.8 }),
        aero_powered_cd: vec![
            0.8308747162958612, 0.5978521380486111, 0.5332782516853568, 0.5028174737674562,
            0.48758140855833515, 0.49651357206944885, 0.5835581504163732, 0.6794275348435146,
            0.6082405332520077, 0.5650633107611576, 0.5331522923575275, 0.5073497514449606,
            0.4854678885009126, 0.4663654193678908, 0.4493671313190954, 0.4340369003127444,
            0.4200735687677587, 0.4072577732402014, 0.3954226107179084, 0.38443646521351843,
            0.37419244967562176, 0.36460163039707094, 0.35558850222456206, 0.34708784760332406,
            0.3390424690364299,
        ],
        aero_coasting_cd: vec![
            0.9052747162958612, 0.6744910269375001, 0.6166338072409123, 0.5973674737674562,
            0.5978036307805574, 0.6306172757731525, 0.8191581504163732, 0.8721600610341156,
            0.7750607964978169, 0.7098957267245543, 0.6607834729741368, 0.6211873077489014,
            0.5880187448571961, 0.559524407737868, 0.5345992224439264, 0.5124967145782969,
            0.49268630583668216, 0.474775541855583, 0.4584645813681452, 0.44351809479167026,
            0.4297471477655911, 0.41699708742262975, 0.40513917660688703, 0.3940646425728759,
            0.38368032192016116,
        ],
        supersonic_normal: None,
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

/// Support limits of the existing CP-times-lateral-force formulation, not
/// empirical accuracy tolerances. The absolute floor inherits aero.rs's 1e-4
/// denominator policy (/rad); equality is accepted here. The relative guard
/// rejects C <= 64*epsilon*Σ|weighted CNalpha_i| before division.
pub const NORMAL_SLOPE_SUPPORT_FLOOR: f64 = 1e-4;
pub const NORMAL_CANCELLATION_ULPS: f64 = 64.0;

/// Below this Mach the legacy expression is used unchanged (bit-identical).
pub const NORMAL_LEGACY_FULL_MACH: f64 = 0.8;
/// From this Mach the published supersonic groups are used unblended.
pub const NORMAL_SUPERSONIC_FULL_MACH: f64 = 1.2;

#[derive(Clone, Copy, Debug, Default)]
struct NormalGroups {
    cna: f64,
    moment: f64,
    abs_cna: f64,
}

fn legacy_normal_groups(mach: f64, vehicle: &Vehicle) -> NormalGroups {
    // The legacy law in full: fin-only 1/sqrt(M^2-1) degradation. M <= 0.8
    // (degrade = 1) is the exact expression the pre-existing fixtures pin.
    let degrade = if !mach.is_finite() || mach <= 1.0 {
        1.0
    } else {
        1.0f64.min(1.0 / (mach * mach - 1.0).sqrt())
    };
    NormalGroups {
        cna: vehicle.cna_body + vehicle.cna_fins * degrade,
        moment: vehicle.body_first_moment + vehicle.fin_first_moment * degrade,
        abs_cna: vehicle.body_abs_cna + vehicle.fin_abs_cna * degrade.abs(),
    }
}

fn body_supersonic_groups(params: &SupersonicNormal) -> NormalGroups {
    match params.boattail_lift {
        BoattailLift::Suppressed => NormalGroups {
            cna: params.body_positive_cna,
            moment: params.body_positive_moment,
            abs_cna: params.body_positive_abs_cna,
        },
        BoattailLift::Attached => NormalGroups {
            cna: params.body_attached_cna,
            moment: params.body_attached_moment,
            abs_cna: params.body_attached_abs_cna,
        },
    }
}

fn fin_groups_at(mach: f64, sets: &[FinNormalSet]) -> NormalGroups {
    let mut out = NormalGroups::default();
    for set in sets {
        let cna = set.cna_per_rad
            * crate::aero::published_fin_lift_slope_ratio(
                mach,
                set.aspect_ratio,
                set.leading_edge_cos,
            );
        out.cna += cna;
        out.moment += cna * set.cp_station_m;
        out.abs_cna += cna.abs();
    }
    out
}

/// Shape-preserving cubic Hermite, with Mach derivatives scaled by `width`.
/// Fritsch & Carlson, "Monotone Piecewise Cubic Interpolation", SIAM J.
/// Numer. Anal. 17(2), 238–246 (1980), doi:10.1137/0717021: zero tangents
/// opposing the secant, then project (alpha, beta) into the radius-3 circle.
/// This sufficient monotonicity condition bounds each group by its endpoints.
/// Original endpoint derivatives (and C1 joins) survive when limiting is inactive;
/// a limited endpoint need not match the exterior derivative, including its cusp.
fn hermite(t: f64, q0: f64, q1: f64, mut m0: f64, mut m1: f64, width: f64) -> f64 {
    let secant = (q1 - q0) / width;
    if secant == 0.0 {
        return q0;
    }
    let mut alpha = m0 / secant;
    let mut beta = m1 / secant;
    if alpha < 0.0 {
        m0 = 0.0;
        alpha = 0.0;
    }
    if beta < 0.0 {
        m1 = 0.0;
        beta = 0.0;
    }
    let radius = (alpha * alpha + beta * beta).sqrt();
    if radius > 3.0 {
        let tau = 3.0 / radius;
        m0 = tau * alpha * secant;
        m1 = tau * beta * secant;
    }
    let t2 = t * t;
    let t3 = t2 * t;
    let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
    let h10 = t3 - 2.0 * t2 + t;
    let h01 = -2.0 * t3 + 3.0 * t2;
    let h11 = t3 - t2;
    let value = h00 * q0 + h10 * width * m0 + h01 * q1 + h11 * width * m1;
    // Roundoff guard only: the limited polynomial is analytically monotone.
    value.clamp(q0.min(q1), q0.max(q1))
}

/// Transonic blend, per fin set: cubic Hermite on CNalpha with the legacy
/// value/slope at M=0.8 (the legacy fin law is constant for M <= 1, so m0 = 0)
/// and the exterior published value/slope at M=1.2, limited for monotonicity.
/// The moment uses the same blended CNalpha and the unchanged set CP.
/// J and CP match exterior values; slopes also match where the limiter is
/// inactive. Anchoring at 1.2 avoids evaluating linear theory through its own
/// M=1 singularity.
fn fin_groups_blended(sets: &[FinNormalSet], t: f64) -> NormalGroups {
    let width = NORMAL_SUPERSONIC_FULL_MACH - NORMAL_LEGACY_FULL_MACH;
    let mut out = NormalGroups::default();
    for set in sets {
        let r1 = crate::aero::published_fin_lift_slope_ratio(
            NORMAL_SUPERSONIC_FULL_MACH,
            set.aspect_ratio,
            set.leading_edge_cos,
        );
        let dr1 = crate::aero::published_fin_lift_slope_ratio_derivative(
            NORMAL_SUPERSONIC_FULL_MACH,
            set.aspect_ratio,
            set.leading_edge_cos,
        );
        let cna = hermite(
            t,
            set.cna_per_rad,
            set.cna_per_rad * r1,
            0.0,
            set.cna_per_rad * dr1,
            width,
        );
        out.cna += cna;
        out.moment += cna * set.cp_station_m;
        out.abs_cna += cna.abs();
    }
    out
}

/// Force/moment groups at one Mach. `None` params or M <= 0.8 return the
/// legacy groups exactly; the caller's legacy branch is unchanged.
fn flight_normal_groups(
    mach: f64,
    vehicle: &Vehicle,
) -> Result<NormalGroups, String> {
    let legacy = legacy_normal_groups(mach, vehicle);
    let Some(params) = vehicle.supersonic_normal.as_ref() else {
        return Ok(legacy);
    };
    if !mach.is_finite() || mach <= NORMAL_LEGACY_FULL_MACH {
        return Ok(legacy);
    }
    let params_finite = params
        .fin_sets
        .iter()
        .all(|s| {
            s.cna_per_rad.is_finite()
                && s.cp_station_m.is_finite()
                && s.aspect_ratio.is_finite()
                && s.aspect_ratio > 0.0
                && s.leading_edge_cos.is_finite()
        })
        && [
            params.body_positive_cna,
            params.body_positive_moment,
            params.body_positive_abs_cna,
            params.body_attached_cna,
            params.body_attached_moment,
            params.body_attached_abs_cna,
        ]
        .iter()
        .all(|x| x.is_finite());
    if !params_finite {
        return Err("flight normal model: nonfinite published supersonic parameters".to_string());
    }
    let body_sup = body_supersonic_groups(params);
    let (body, fin) = if mach >= NORMAL_SUPERSONIC_FULL_MACH {
        (body_sup, fin_groups_at(mach, &params.fin_sets))
    } else {
        let width = NORMAL_SUPERSONIC_FULL_MACH - NORMAL_LEGACY_FULL_MACH;
        let t = (mach - NORMAL_LEGACY_FULL_MACH) / width;
        // Legacy body is constant at the left join and the exterior body is
        // constant at the right join, so both endpoint slopes are zero; the
        // Hermite reduces to the same smooth value transition with a zero
        // derivative on both sides.
        let body = NormalGroups {
            cna: hermite(t, vehicle.cna_body, body_sup.cna, 0.0, 0.0, width),
            moment: hermite(
                t,
                vehicle.body_first_moment,
                body_sup.moment,
                0.0,
                0.0,
                width,
            ),
            abs_cna: hermite(
                t,
                vehicle.body_abs_cna,
                body_sup.abs_cna,
                0.0,
                0.0,
                width,
            ),
        };
        (body, fin_groups_blended(&params.fin_sets, t))
    };
    Ok(NormalGroups {
        cna: body.cna + fin.cna,
        moment: body.moment + fin.moment,
        abs_cna: body.abs_cna + fin.abs_cna,
    })
}

fn normal_slope_at_mach(mach: f64, vehicle: &Vehicle) -> Result<(f64, f64, f64), String> {
    if ![vehicle.cna_body, vehicle.cna_fins, vehicle.body_first_moment,
        vehicle.fin_first_moment, vehicle.body_abs_cna, vehicle.fin_abs_cna]
        .iter().all(|x| x.is_finite())
        || vehicle.body_abs_cna < 0.0 || vehicle.fin_abs_cna < 0.0
    {
        return Err("flight normal model: nonfinite signed force/moment sums or invalid absolute slope".to_string());
    }
    // M <= 0.8 keeps the existing Mach law exactly; above it the prepared
    // published-law groups replace the fin-only 1/sqrt(M^2-1) expression.
    let groups = flight_normal_groups(mach, vehicle)?;
    let total = groups.cna;
    let moment = groups.moment;
    let abs_sum = groups.abs_cna;
    if !total.is_finite() || !moment.is_finite() || !abs_sum.is_finite()
        || total < NORMAL_SLOPE_SUPPORT_FLOOR
        || total <= NORMAL_CANCELLATION_ULPS * f64::EPSILON * abs_sum
    {
        return Err(format!("flight normal model: unsupported total CNalpha {total}; requires finite C >= {NORMAL_SLOPE_SUPPORT_FLOOR} and C > 64*epsilon*sumAbs ({abs_sum})"));
    }
    let cp = moment / total;
    if !cp.is_finite() {
        return Err("flight normal model: derived CP is nonfinite".to_string());
    }
    Ok((total, cp, moment))
}

/// Diagnostic access to the flight normal law at one Mach, without a state.
/// Returns `(CNalpha, CP, first moment)` about the nose.
pub fn flight_normal_at_mach(
    mach: f64,
    vehicle: &Vehicle,
) -> Result<(f64, f64, f64), String> {
    normal_slope_at_mach(mach, vehicle)
}

struct Refined {
    /// Reported event time: the midpoint of the final bisection bracket.
    pub time: f64,
    /// State at the reported midpoint.
    pub state: RigidState,
    /// State at the crossed side of the bracket (used for simultaneous-tie
    /// predicate checks; never reported as the event time).
    pub crossed_state: RigidState,
}
// ---------------------------------------------------------------------------

struct FlightLoads {
    loads: Loads,
    airspeed: f64,
    mach: f64,
    q_inf: f64,
    alpha_total_deg: f64,
    /// Incidence counted toward the free-flight envelope (deg): 0 on the rail,
    /// under a canopy, or while aero forces are negligible.
    envelope_alpha_deg: f64,
    drag_axial: f64,
    thrust: f64,
    diagnostic: FlightLoadsDiagnostic,
}

/// Values consumed by the flight driver, independent of legacy diagnostics.
/// Conversion moves already computed values without new physical arithmetic.
pub(crate) struct DriverLoads {
    pub(crate) loads: Loads,
    pub(crate) airspeed: f64,
    pub(crate) mach: f64,
    pub(crate) q_inf: f64,
    pub(crate) alpha_total_deg: f64,
    pub(crate) envelope_alpha_deg: f64,
    pub(crate) drag_axial: f64,
    pub(crate) thrust: f64,
    /// Capture-only legacy metadata; absent for candidate providers and probes.
    pub(crate) legacy_diagnostic: Option<FlightLoadsDiagnostic>,
}

impl From<FlightLoads> for DriverLoads {
    fn from(fl: FlightLoads) -> Self {
        fl.into_driver(false)
    }
}

impl FlightLoads {
    fn into_driver(self, record: bool) -> DriverLoads {
        let fl = self;
        DriverLoads {
            loads: fl.loads,
            airspeed: fl.airspeed,
            mach: fl.mach,
            q_inf: fl.q_inf,
            alpha_total_deg: fl.alpha_total_deg,
            envelope_alpha_deg: fl.envelope_alpha_deg,
            drag_axial: fl.drag_axial,
            thrust: fl.thrust,
            legacy_diagnostic: if record { Some(fl.diagnostic) } else { None },
        }
    }
}

/// A callback can evaluate speculative stages as well as committed-state reads.
/// These labels describe purpose, not scientific or committed-path validity.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum LoadPhase {
    EndpointProbe,
    BurnoutRoot,
    ProfileBurnoutRead,
    EventRefinement(AstraeaEvent),
    RailExit,
    MacroSample,
    TouchdownSample,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct LoadContext {
    // The unchanged legacy evaluator ignores purpose; native diagnostics may inspect it.
    pub(crate) phase: LoadPhase,
    pub(crate) time: f64,
    pub(crate) drogue_deployed: bool,
    pub(crate) main_deployed: bool,
    pub(crate) rail_bound: bool,
    pub(crate) launch_altitude_asl: f64,
    pub(crate) wind_speed_surface: f64,
    pub(crate) wind_azimuth_deg: f64,
    pub(crate) fin_cant_rad: f64,
    pub(crate) drag_cd_scale: f64,
}

/// Native-only inspection of the actual production assembly, not a second RHS.
/// Stations are meters aft of the nose; body +Y is noseward; force_n is ENU.
/// CNalpha is the added body-normal slope alongside wind-axis drag in this model.
#[derive(Clone, Debug, PartialEq)]
pub struct FlightLoadsDiagnostic {
    pub model_id: &'static str,
    /// Normal-force law identity, distinct from the historical assembly id.
    pub normal_law_id: &'static str,
    /// Boattail policy in force (`suppressed`, `attached`, or `not-applicable`).
    pub boattail_policy: &'static str,
    /// Fin-interference station rule that produced the Barrowman fin slope.
    pub fin_interference_id: &'static str,
    pub cna_body: f64,
    pub cna_fins: f64,
    pub body_first_moment: f64,
    pub fin_first_moment: f64,
    pub cna: f64,
    pub first_moment: f64,
    pub cp: f64,
    pub combined_cg: f64,
    pub ref_area: f64,
    pub ref_diameter: f64,
    pub mach: f64,
    pub alpha_total_deg: f64,
    pub q_inf: f64,
    pub drag_wind_axis: f64,
    pub aero_force_body: Vec3,
    pub static_moment_body: Vec3,
    pub damping_moment_body: Vec3,
    pub total_moment_body: Vec3,
    pub validity: StageValidity,
    pub recovery: bool,
    pub rail_bound: bool,
    pub powered: bool,
}

/// Diagnostic access only: same preparation carrier and exact production loads.
/// No browser dispatch or display-telemetry schema is added by this function.
#[allow(clippy::too_many_arguments)]
pub fn diagnose_flight_loads(
    t_stage: f64, st: &RigidState, drogue: bool, main: bool, rail_bound: bool,
    launch_altitude_asl: f64, wind_speed: f64, wind_azimuth: f64, fin_cant: f64,
    vehicle: &Vehicle, motor: &MotorSpec, drag_scale: f64,
) -> Result<FlightLoadsDiagnostic, String> {
    Ok(compute_flight_loads(t_stage, st, drogue, main, rail_bound,
        launch_altitude_asl, wind_speed, wind_azimuth, fin_cant,
        vehicle, motor, drag_scale)?.diagnostic)
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

/// Mechanical/flow state shared by the legacy assembly and the native candidate
/// provider. Arithmetic-preserving extraction: every expression keeps its
/// original form and evaluation order, so legacy output stays bit-identical.
/// It contains no aerodynamic coefficient law, no CP and no calibration.
pub(crate) struct StageMechanics {
    pub(crate) alt_asl: f64,
    pub(crate) density: f64,
    pub(crate) speed_of_sound: f64,
    pub(crate) powered: bool,
    pub(crate) thrust: f64,
    pub(crate) mass: f64,
    /// `{pitch, roll, yaw}` principal inertia about the instantaneous CG.
    pub(crate) inertia_b: Vec3,
    pub(crate) inertia_dot_b: Vec3,
    /// `R_NB` (body -> navigation) for the supplied attitude.
    pub(crate) r_nb: [[f64; 3]; 3],
    pub(crate) wind_n: Vec3,
    pub(crate) rel_body: Vec3,
    pub(crate) airspeed: f64,
    pub(crate) mach: f64,
    pub(crate) q_inf: f64,
    /// Legacy V8-`atan2` total incidence (rad), used for legacy labels/metrics.
    pub(crate) alpha_total: f64,
    pub(crate) lat_speed: f64,
    /// Instantaneous CG station (m aft of the nose), legacy mass model.
    pub(crate) cg_from_nose: f64,
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn stage_mechanics(
    t_stage: f64,
    st: &RigidState,
    launch_altitude_asl: f64,
    wind_speed_surface: f64,
    wind_azimuth_deg: f64,
    vehicle: &Vehicle,
    motor: &MotorSpec,
) -> StageMechanics {
    let alt_asl = launch_altitude_asl + st.r.z;
    let (density, sos) = atmosphere_at(alt_asl);
    let wind = wind_vector_at(st.r.z, wind_speed_surface, wind_azimuth_deg);
    stage_mechanics_with_flow(t_stage, st, alt_asl, density, sos, wind, None, vehicle, motor)
}

/// Single shared mechanical assembly; profile callers supply actual E1 flow,
/// and never evaluate the retained altitude atmosphere or wind shear.
#[allow(clippy::too_many_arguments)]
pub(crate) fn stage_mechanics_with_flow(
    t_stage: f64, st: &RigidState, alt_asl: f64, density: f64, sos: f64,
    wind: Vec3, local: Option<&crate::environment::Evaluation>, vehicle: &Vehicle, motor: &MotorSpec,
) -> StageMechanics {
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
    let rel_world = match local {
        Some(flow) => { let v = flow.air_relative_velocity_enu_mps; Vec3 { x: v.east, y: v.north, z: v.up } },
        None => Vec3 { x: st.v.x - wind.x, y: st.v.y - wind.y, z: st.v.z - wind.z },
    };
    let rel_body = rotate_world_to_body(&r_mat, &rel_world);
    let (airspeed, mach, q_inf) = match local {
        Some(flow) => (flow.airspeed_mps, flow.mach, flow.dynamic_pressure_pa),
        None => {
            let airspeed = (rel_body.x * rel_body.x + rel_body.y * rel_body.y + rel_body.z * rel_body.z).sqrt();
            (airspeed, airspeed / sos, 0.5 * density * airspeed * airspeed)
        }
    };
    let lat_speed = (rel_body.x * rel_body.x + rel_body.z * rel_body.z).sqrt();
    // TS `Math.atan2` (V8, not glibc): the loads assembly mirrors the oracle's
    // incidence computation through this shim.
    let alpha_total = crate::v8_math::js_atan2(lat_speed, rel_body.y);

    StageMechanics {
        alt_asl, density, speed_of_sound: sos, powered, thrust, mass,
        inertia_b: Vec3 { x: iyy, y: ixx, z: izz }, inertia_dot_b, r_nb: r_mat,
        wind_n: wind, rel_body, airspeed, mach, q_inf, alpha_total, lat_speed,
        cg_from_nose: x_c,
    }
}

/// Declared canopy currently live, with the unchanged legacy canopy drag law.
/// `main` wins when both are declared deployed, as in the legacy assembly.
#[derive(Clone, Copy, Debug)]
pub(crate) struct LiveCanopy {
    pub(crate) main: bool,
    pub(crate) eff_area: f64,
    pub(crate) cd: f64,
}

pub(crate) fn live_canopy(
    vehicle: &Vehicle, drogue_deployed: bool, main_deployed: bool,
) -> Option<LiveCanopy> {
    let drogue_live = drogue_deployed && vehicle.drogue.is_some();
    let main_live = main_deployed && vehicle.main_chute.is_some();
    if main_live {
        let chute = vehicle.main_chute.as_ref().unwrap();
        // TS `(Math.PI / 4) * Math.pow(diameter, 2)`: square first.
        return Some(LiveCanopy { main: true, eff_area: (PI / 4.0) * (chute.diameter * chute.diameter), cd: chute.cd });
    }
    if drogue_live {
        let chute = vehicle.drogue.as_ref().unwrap();
        return Some(LiveCanopy { main: false, eff_area: (PI / 4.0) * (chute.diameter * chute.diameter), cd: chute.cd });
    }
    None
}

/// Positive damping magnitudes of the inherited dimensional rate couple.
/// Body order `(pitch, roll, yaw)`; vehicle length for pitch/yaw, body radius
/// for roll. Sharing this expression with the candidate keeps one rate law.
pub(crate) struct RateCouple {
    pub(crate) pitch_damp: f64,
    pub(crate) roll_damp: f64,
    pub(crate) yaw_damp: f64,
}

/// The wind-axis axial drag body force. The legacy airframe assembly passes
/// the unchanged 1e-6 m/s floor; the candidate canopy branch passes an explicit
/// 0.0 floor so the candidate's own aero-negligibility policy (not a hidden
/// speed floor) decides when the force is zero. No direction is invented at
/// exactly zero speed.
pub(crate) fn axial_drag_body_force(
    drag_axial: f64, rel_body: &Vec3, airspeed: f64, speed_floor: f64,
) -> Vec3 {
    if airspeed > speed_floor {
        let inv_v = 1.0 / airspeed;
        Vec3 {
            x: -drag_axial * rel_body.x * inv_v,
            y: -drag_axial * rel_body.y * inv_v,
            z: -drag_axial * rel_body.z * inv_v,
        }
    } else {
        Vec3::zero()
    }
}

pub(crate) fn legacy_dimensional_rate_couple(
    density: f64, airspeed: f64, ref_area: f64, total_length: f64,
    body_radius: f64, omega_b: &Vec3,
) -> RateCouple {
    let roll = omega_b.y;
    let pitch = omega_b.x;
    let yaw = omega_b.z;
    let pitch_damp = 0.5
        * density
        * airspeed
        * ref_area
        * total_length
        * total_length
        * 1.5
        * pitch;
    let yaw_damp = 0.5
        * density
        * airspeed
        * ref_area
        * total_length
        * total_length
        * 1.5
        * yaw;
    let clp = 4.0;
    let roll_damp = 0.25 * density * airspeed * ref_area * body_radius * body_radius * clp * roll;
    RateCouple { pitch_damp, roll_damp, yaw_damp }
}

pub(crate) fn recovered_rate_moment(couple: &RateCouple) -> Vec3 {
    Vec3 { x: -couple.pitch_damp, y: -couple.roll_damp, z: -couple.yaw_damp }
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
    drag_cd_scale: f64,
) -> Result<FlightLoads, String> {
    if !t_stage.is_finite() {
        panic!("loads assembly: stage time must be finite");
    }
    if !fin_cant_rad.is_finite() || !wind_speed_surface.is_finite() || !wind_azimuth_deg.is_finite() {
        panic!("loads assembly: wind/cant configuration must be finite");
    }
    let mech = stage_mechanics(t_stage, st, launch_altitude_asl, wind_speed_surface,
        wind_azimuth_deg, vehicle, motor);
    let alt_asl = mech.alt_asl;
    let density = mech.density;
    let powered = mech.powered;
    let thrust = mech.thrust;
    let mass = mech.mass;
    let inertia_dot_b = mech.inertia_dot_b;
    let ixx = mech.inertia_b.y;
    let iyy = mech.inertia_b.x;
    let izz = mech.inertia_b.z;
    let r_mat = mech.r_nb;
    let rel_body = mech.rel_body;
    let airspeed = mech.airspeed;
    let mach = mech.mach;
    let q_inf = mech.q_inf;
    let lat_speed = mech.lat_speed;
    let alpha_total = mech.alpha_total;
    let alpha_total_deg = alpha_total * 180.0 / PI;
    let r_body = vehicle.r_body();

    let mut cd = aero_at_mach(mach, powered, vehicle);
    let mut eff_area = vehicle.ref_area();
    let canopy = live_canopy(vehicle, drogue_deployed, main_deployed);
    let recovery = canopy.is_some();
    if let Some(live) = canopy {
        eff_area = live.eff_area;
        cd = live.cd;
    }
    // Field drag scale (TS loads.ts `dragCdScale`): multiplies the AIRFRAME Cd
    // only. A live canopy keeps its declared constant Cd untouched.
    if !recovery && drag_cd_scale != 1.0 {
        cd *= drag_cd_scale;
    }
    let drag_axial = q_inf * eff_area * cd;
    let (cna_slope, cp, normal_first_moment) = normal_slope_at_mach(mach, vehicle)?;

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
    // Atmosphere domain: ISA-1976 branches end at 20 km.
    let altitude_class: Option<StageValidity> = if alt_asl > 100000.0 {
        Some(StageValidity::Unsupported)
    } else if alt_asl > 20000.0 {
        Some(StageValidity::Extrapolated)
    } else {
        None
    };
    // Bound on the total aero force (normal at any incidence plus axial) vs weight.
    let aero_negligible = !recovery
        && q_inf * vehicle.ref_area() * (cna_slope.abs() + cd.abs()) < AERO_NEGLIGIBLE_WEIGHT_FRACTION * mass * G0;
    let envelope_incidence = if aero_negligible { 0.0 } else { incidence_for_validity };
    let envelope: StageValidity = if mach > 6.0 || envelope_incidence > 30.0 {
        StageValidity::Unsupported
    } else if mach > 4.0 || envelope_incidence > 15.0 {
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

    let mut aero_body = axial_drag_body_force(drag_axial, &rel_body, airspeed, 1e-6);
    let tail_first = !recovery && !rail_bound && rel_body.y < 0.0 && -rel_body.y >= lat_speed;
    if tail_first && !aero_negligible {
        load_validity = StageValidity::Unsupported;
    }
    if airspeed > 1e-6 {
        if !recovery && !tail_first {
            if lat_speed > 1e-9 {
                let normal_mag =
                    q_inf * vehicle.ref_area() * cna_slope * crate::v8_math::js_sin(alpha_total);
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

    let d_static = if recovery { 0.0 } else { cp - mech.cg_from_nose };
    let rate = legacy_dimensional_rate_couple(density, airspeed, vehicle.ref_area(),
        vehicle.total_length, r_body, &st.w);
    let pitch_damp = rate.pitch_damp;
    let roll_damp = rate.roll_damp;
    let yaw_damp = rate.yaw_damp;
    let roll_torque =
        q_inf * vehicle.ref_area() * r_body * crate::v8_math::js_sin(fin_cant_rad) * 4.0;

    let moment_b = Vec3 {
        x: -(d_static * aero_body.z) - pitch_damp,
        y: roll_torque - roll_damp,
        z: d_static * aero_body.x - yaw_damp,
    };

    Ok(FlightLoads {
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
        envelope_alpha_deg: envelope_incidence,
        drag_axial,
        thrust,
        diagnostic: FlightLoadsDiagnostic {
            model_id: "flight-signed-normal-plus-wind-drag-v1",
            normal_law_id: vehicle.normal_law_identity().0,
            boattail_policy: vehicle.normal_law_identity().1,
            fin_interference_id: crate::aero::FIN_INTERFERENCE_ID,
            cna_body: vehicle.cna_body, cna_fins: vehicle.cna_fins,
            body_first_moment: vehicle.body_first_moment,
            fin_first_moment: vehicle.fin_first_moment,
            cna: cna_slope, first_moment: normal_first_moment, cp, combined_cg: mech.cg_from_nose,
            ref_area: vehicle.ref_area(), ref_diameter: vehicle.ref_diameter,
            mach, alpha_total_deg, q_inf, drag_wind_axis: drag_axial,
            aero_force_body: aero_body,
            static_moment_body: Vec3 { x: -d_static * aero_body.z, y: roll_torque, z: d_static * aero_body.x },
            damping_moment_body: recovered_rate_moment(&rate),
            total_moment_body: moment_b,
            validity: load_validity, recovery, rail_bound, powered,
        },
    })
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
    /// Airframe axial-drag multiplier (default 1.0: model curves unchanged).
    /// A field calibration applied to the airframe branch only — never to a
    /// live canopy's declared Cd. Must be a positive finite number.
    pub drag_cd_scale: Option<f64>,
    /// Internal opt-in for the per-macro-step display telemetry series
    /// (mirrors the TS recorder). Deliberately NOT a `FlightOptionsDto` wire
    /// field: ensembles and the default API path leave it `false` and pay
    /// nothing. The full series is returned as `SimulationResult::telemetry`.
    pub record_telemetry: bool,
    /// Capture exact legacy committed-macro metadata; not a physics/wire option.
    pub record_moment_arm_history: bool,
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
    /// FULL (pre-decimation) display series, empty unless
    /// `SixDofOptions::record_telemetry` was set. Exact field-for-field mirror
    /// of the TS oracle's `telemetry` array.
    pub telemetry: Vec<TelemetryPoint>,
    /// Empty unless explicitly requested; never rounded or display-decimated.
    pub moment_arm_history: Vec<crate::moment_arm_history::MomentArmSample>,
    /// Normal-force law identity for this run. The historical assembly id
    /// (`flight-signed-normal-plus-wind-drag-v1`) is unchanged; this names the
    /// law that actually evaluated the normal force.
    pub normal_law_id: &'static str,
    /// Boattail policy in force (`suppressed`, `attached`, or `not-applicable`).
    pub boattail_policy: &'static str,
    /// Fin-interference station rule that produced the Barrowman fin slope.
    /// Absent on runs written before P4; `fin-station-v2` selects the body
    /// carrying the most of the fin root chord and evaluates its local
    /// diameter at the root mid chord.
    pub fin_interference_id: &'static str,
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
    let evaluator = |context: LoadContext, state: &RigidState| {
        compute_flight_loads(
            context.time, state, context.drogue_deployed, context.main_deployed,
            context.rail_bound, context.launch_altitude_asl,
            context.wind_speed_surface, context.wind_azimuth_deg,
            context.fin_cant_rad, vehicle, motor, context.drag_cd_scale,
        ).map(|fl| fl.into_driver(options.record_moment_arm_history
            && context.phase == LoadPhase::MacroSample))
    };
    simulate_flight_with_evaluator(vehicle, motor, options, &evaluator)
}

/// Flags at the final committed state. Provenance only: never an evaluator call.
#[derive(Clone, Copy, Debug)]
pub(crate) struct DriverFlags {
    pub(crate) drogue_deployed: bool,
    pub(crate) main_deployed: bool,
    pub(crate) rail_bound: bool,
}

/// Result of one shared-driver run. `result` is the unchanged legacy result
/// (built for both policies); a bounded candidate caller uses only the final
/// committed state/time/flags plus the committed macro samples its own
/// evaluator recorded, and never exposes legacy PASS/landing labeling.
pub(crate) struct DriverOutcome {
    pub(crate) result: SimulationResult,
    pub(crate) final_time: f64,
    pub(crate) final_state: RigidState,
    pub(crate) final_flags: DriverFlags,
    pub(crate) touched_down: bool,
    pub(crate) mechanism: MechanismEvidence,
}

/// Internal mechanical seam only: all public callers still use legacy loads.
fn simulate_flight_with_evaluator(
    vehicle: &Vehicle,
    motor: &MotorSpec,
    options: &SixDofOptions,
    evaluator: &dyn Fn(LoadContext, &RigidState) -> Result<DriverLoads, String>,
) -> Result<SimulationResult, String> {
    // Legacy path: no diagnostic bookkeeping at all.
    simulate_driver(vehicle, motor, options, evaluator, None, false, None).map(|outcome| outcome.result)
}

/// Candidate-only bridge: an exact bounded stop.
///
/// The final committed macro state is integrated with a last bracket of
/// `[previous, horizon]`; no stage or event probe is evaluated beyond
/// `horizon`. The legacy wrapper above keeps its unchanged `t += dt` loop and
/// 300 s horizon, so this policy cannot move legacy behavior.
pub(crate) fn drive_candidate(
    vehicle: &Vehicle,
    motor: &MotorSpec,
    options: &SixDofOptions,
    horizon_s: f64,
    evaluator: &dyn Fn(LoadContext, &RigidState) -> Result<DriverLoads, String>,
    controls: Option<CandidateDiagnosticControls>,
) -> Result<DriverOutcome, String> {
    if !horizon_s.is_finite() || !(horizon_s > 0.0) {
        return Err(format!(
            "bounded candidate driver: horizon must be finite and positive (got {})",
            format_js_num(horizon_s)
        ));
    }
    let mut diagnostics = AdaptiveDiagnostics::for_motor(motor, controls);
    simulate_driver(vehicle, motor, options, evaluator, Some(horizon_s), false, Some(&mut diagnostics))
}

pub(crate) fn drive_profile_candidate(
    vehicle: &Vehicle, motor: &MotorSpec, options: &SixDofOptions, horizon_s: f64,
    evaluator: &dyn Fn(LoadContext, &RigidState) -> Result<DriverLoads, String>,
    controls: Option<CandidateDiagnosticControls>,
) -> Result<DriverOutcome, String> {
    if !horizon_s.is_finite() || horizon_s <= 0.0 {
        return Err("bounded profile driver: horizon must be finite and positive".into());
    }
    let mut diagnostics = AdaptiveDiagnostics::for_motor(motor, controls);
    simulate_driver(vehicle, motor, options, evaluator, Some(horizon_s), true, Some(&mut diagnostics))
}

fn simulate_driver(
    vehicle: &Vehicle,
    motor: &MotorSpec,
    options: &SixDofOptions,
    evaluator: &dyn Fn(LoadContext, &RigidState) -> Result<DriverLoads, String>,
    horizon: Option<f64>,
    profile_events: bool,
    mut diagnostics: Option<&mut AdaptiveDiagnostics>,
) -> Result<DriverOutcome, String> {
    validate_motor_spec(motor)?;
    let rail_length = finite_opt(options.rail_length, 3.0, "railLength")?;
    if !(rail_length > 0.0) {
        return Err(format!("simulate6DofFlight: railLength must be positive (got {})", format_js_num(rail_length)));
    }
    let rail_elevation_deg = finite_opt(options.rail_elevation_deg, 85.0, "railElevationDeg")?;
    if rail_elevation_deg < RAIL_ELEVATION_MIN_DEG || rail_elevation_deg > RAIL_ELEVATION_MAX_DEG {
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
    let drag_cd_scale = options.drag_cd_scale.unwrap_or(1.0);
    if !drag_cd_scale.is_finite() || !(drag_cd_scale > 0.0) {
        return Err(format!(
            "simulate6DofFlight: dragCdScale must be a positive finite number (got {})",
            format_js_num(drag_cd_scale)
        ));
    }

    if !(vehicle.dry_mass > 0.0) {
        return Err(format!("simulate6DofFlight: vehicle dry mass must be positive (got {})", vehicle.dry_mass));
    }

    let el_rad = rail_elevation_deg * PI / 180.0;
    let az_rad = rail_azimuth_deg * PI / 180.0;
    // V8 shims: the mirrored `Math.cos`/`Math.sin` of the rail angles (the
    // initial attitude fixes the flight plane).
    let cos_el = crate::v8_math::js_cos(el_rad);
    let sin_az = crate::v8_math::js_sin(az_rad);
    let rail_vector = Vec3 {
        x: cos_el * sin_az,
        y: cos_el * crate::v8_math::js_cos(az_rad),
        z: crate::v8_math::js_sin(el_rad),
    };

    let dot_y = rail_vector.y;
    let mut initial_q = Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };
    if dot_y < 0.9999 {
        let rx = rail_vector.z;
        let rz = -rail_vector.x;
        let axis_len = (rx * rx + rz * rz).sqrt();
        if axis_len > 1e-6 {
            let angle = crate::v8_math::js_acos(dot_y.max(-1.0).min(1.0));
            let sin_half = crate::v8_math::js_sin(angle / 2.0);
            initial_q = Quat {
                w: crate::v8_math::js_cos(angle / 2.0),
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
    // Display-telemetry recorder (opt-in). `has_left_rail_display` mirrors the
    // oracle's local `hasLeftRail` flag, which drives the sampling cadence.
    let mut telemetry: Vec<TelemetryPoint> = Vec::new();
    let mut moment_arm_history = Vec::new();
    let mut has_left_rail_display = false;
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

    let max_sim_time = horizon.unwrap_or(300.0f64);
    let mut saw_unsupported = false;
    let mut saw_extrapolated = false;
    let mut touchdown_tau: Option<f64> = None;
    let mut touchdown_nominal = false;
    let mut last_probe_validity: Vec<StageValidity> = Vec::new();
    let mut macro_iterations: u64 = 0;
    const MAX_MACRO_ITERATIONS: u64 = 5_000_000;

    let tol = diagnostics.as_ref()
        .map(|d| d.tolerance_policy.tolerances())
        .unwrap_or_else(|| AdaptiveTolerances { r: 1e-3, v: 1e-2, q: 1e-5, w: 1e-3 });
    // Time-tabulated thrust breakpoints are always the cut list. The only
    // legacy no-split arm is the explicit diagnostic override.
    let cut_knots = match diagnostics.as_ref() {
        Some(d) => d.cut_knots.clone(),
        None => thrust_cut_times(motor),
    };
    let apply_split = diagnostics.as_ref().map_or(true, |d| d.split_at_thrust_knots);

    loop {
        if let Some(stop) = horizon {
            if t > stop { break; }
        } else if !(t < max_sim_time) {
            break;
        }
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
                let loads = |ts: f64, st: &RigidState| -> Result<Loads, String> {
                    let fl = evaluator(LoadContext {
                        phase: LoadPhase::EndpointProbe, time: ts,
                        drogue_deployed: snap_drogue, main_deployed: snap_main,
                        rail_bound: !snap_has_rail, launch_altitude_asl,
                        wind_speed_surface, wind_azimuth_deg, fin_cant_rad, drag_cd_scale,
                    }, st)?;
                    if !snap_has_rail {
                        let s_along = st.r.dot(&rail_vector);
                        let v_along = st.v.dot(&rail_vector);
                        let fdot = fl.loads.force_n.dot(&rail_vector);
                        if s_along <= 0.0 && v_along <= 0.0 && fdot <= 0.0 {
                            return Ok(Loads {
                                force_n: Vec3::zero(),
                                moment_b: Vec3::zero(),
                                inertia_b: fl.loads.inertia_b,
                                inertia_dot_b: fl.loads.inertia_dot_b,
                                mass: fl.loads.mass,
                                validity: fl.loads.validity,
                            });
                        }
                        return Ok(Loads {
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
                        });
                    }
                    Ok(fl.loads)
                };
                integrate_rigid_adaptive(&b_state, &loads, b_t, t, &tol, MAX_ADAPTIVE_STEP_CAP_S.min(t - b_t), INITIAL_ADAPTIVE_STEP_CAP_S.min(t - b_t), &cut_knots, apply_split, diagnostics.as_deref_mut())?
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
                        snapped, drag_cd_scale, evaluator, &cut_knots, apply_split, diagnostics.as_deref_mut(),
                    )?;
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
                /// Predicate-consistent crossed endpoint; only tie checks use it.
                crossed_state: RigidState,
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
                            fin_cant_rad, snapped, drag_cd_scale, LoadPhase::BurnoutRoot, evaluator,
                        );
                        integrate_rigid_adaptive(&b_state, &loads, b_t, motor.burn_time, &tol,
                            MAX_ADAPTIVE_STEP_CAP_S.min(motor.burn_time - b_t), INITIAL_ADAPTIVE_STEP_CAP_S.min(motor.burn_time - b_t),
                            &cut_knots, apply_split, diagnostics.as_deref_mut())?.state
                    };
                    roots.push(Root { time: motor.burn_time, state: st, crossed_state: st });
                } else if *ctime <= b_t || event_crossed_at_root(name, &b_state, &rail_vector, rail_length, main_deploy_alt) {
                    roots.push(Root { time: b_t, state: b_state, crossed_state: b_state });
                } else {
                    let snapped = snap_for_refine(b_event.has_left_rail, is_drogue_deployed, is_main_deployed);
                    let refin = refine_crossing(
                        &b_state, b_t, t, name, &rail_vector, rail_length, main_deploy_alt,
                        launch_altitude_asl, wind_speed_surface, wind_azimuth_deg, fin_cant_rad,
                        snapped, drag_cd_scale, evaluator, &cut_knots, apply_split, diagnostics.as_deref_mut(),
                    )?;
                    roots.push(Root { time: refin.time, state: refin.state, crossed_state: refin.crossed_state });
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
            // Reported service state is the midpoint; the simultaneous-tie
            // predicate is evaluated at the selected event's crossed endpoint so
            // a midpoint that lies infinitesimally before the root is not
            // misread as a non-event.
            let selected_crossed = roots[serve_idx].crossed_state;
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
                    event_crossed_at_root(name, &selected_crossed, &rail_vector, rail_length, main_deploy_alt)
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
                        has_left_rail_display = true;
                        let exit = evaluator(LoadContext {
                            phase: LoadPhase::RailExit, time: serve_at,
                            drogue_deployed: is_drogue_deployed, main_deployed: is_main_deployed,
                            rail_bound: false, launch_altitude_asl,
                            wind_speed_surface, wind_azimuth_deg, fin_cant_rad, drag_cd_scale,
                        }, &serve_root)?;
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
                        let burnout_mach = if profile_events {
                            evaluator(LoadContext {
                                phase: LoadPhase::ProfileBurnoutRead, time: serve_at,
                                drogue_deployed: is_drogue_deployed, main_deployed: is_main_deployed,
                                rail_bound: !has_left_rail_display, launch_altitude_asl,
                                wind_speed_surface, wind_azimuth_deg, fin_cant_rad, drag_cd_scale,
                            }, &serve_root)?.mach
                        } else {
                            burnout_vel / atmosphere_at(launch_altitude_asl + serve_root.r.z).1
                        };
                        events.push(SimEvent {
                            time: serve_at,
                            name: "Motor Burnout".to_string(),
                            altitude: serve_root.r.z,
                            velocity: burnout_vel,
                            description: format!(
                                "Motor burnout at {:.0}m AGL. Burnout velocity: {:.0} m/s (Mach {:.2}). Transitioning to unpowered coast.",
                                serve_root.r.z, burnout_vel, burnout_mach
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
        let macro_detail = evaluator(LoadContext {
            phase: LoadPhase::MacroSample, time: t,
            drogue_deployed: is_drogue_deployed, main_deployed: is_main_deployed,
            rail_bound: !event_state.has_left_rail, launch_altitude_asl,
            wind_speed_surface, wind_azimuth_deg, fin_cant_rad, drag_cd_scale,
        }, &macro_state)?;
        if options.record_moment_arm_history && (t == 0.0 || t <= motor.burn_time) {
            let diagnostic = macro_detail.legacy_diagnostic.as_ref().ok_or(
                "reportMomentArmHistory: evaluator did not supply legacy committed-state metadata",
            )?;
            crate::moment_arm_history::record(&mut moment_arm_history, t,
                macro_detail.loads.mass, diagnostic)?;
        }
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
        // Incidence at negligible aero force (near-apogee pitch-over) is not counted.
        if event_state.has_left_rail && !is_drogue_deployed && !is_main_deployed
            && macro_detail.envelope_alpha_deg > max_alpha_deg
        {
            max_alpha_deg = macro_detail.envelope_alpha_deg;
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

        // Display telemetry (single-stage UI cadence, mirroring the TS oracle
        // at `src/sim/sixDofSimulator.ts:1182-1210`): every 0.05 s (every 5th
        // 0.01 s macro step), plus every macro step before rail exit and after
        // apogee. Nonterminal scalars carry the oracle's `toFixed` display
        // rounding; position/velocity mention no stage fields for single-stage
        // runs, exactly as in TS.
        if options.record_telemetry
            && ((t / dt).round() % 5.0 == 0.0 || is_apogee_reached || !has_left_rail_display)
        {
            let (pitch_deg, roll_deg, yaw_deg) = quaternion_to_euler_deg(&q);
            telemetry.push(TelemetryPoint {
                time: js_to_fixed(t, 3),
                position: Vec3 { x: js_to_fixed(pos.x, 1), y: js_to_fixed(pos.y, 1), z: js_to_fixed(pos.z, 1) },
                velocity: Vec3 { x: js_to_fixed(vel.x, 1), y: js_to_fixed(vel.y, 1), z: js_to_fixed(vel.z, 1) },
                speed: js_to_fixed(macro_detail.airspeed, 1),
                mach: js_to_fixed(macro_detail.mach, 3),
                altitude: js_to_fixed(pos.z, 1),
                acceleration: js_to_fixed(scalar_accel, 1),
                angular_velocity: BodyRates {
                    p: js_to_fixed(omega_p, 2),
                    q: js_to_fixed(omega_q, 2),
                    r: js_to_fixed(omega_r, 2),
                },
                angle_of_attack_deg: js_to_fixed(macro_detail.alpha_total_deg, 2),
                q,
                pitch_deg: js_to_fixed(pitch_deg, 1),
                roll_deg: js_to_fixed(roll_deg, 1),
                yaw_deg: js_to_fixed(yaw_deg, 1),
                drag: js_to_fixed(macro_detail.drag_axial, 1),
                thrust: js_to_fixed(macro_detail.thrust, 1),
                mass: js_to_fixed(macro_detail.loads.mass, 3),
                dynamic_pressure: js_to_fixed(macro_detail.q_inf, 0),
            });
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

        // Legacy control is unchanged. A bounded candidate clamps the last
        // bracket to the exact horizon and stops only after that state is
        // committed, so reported time and state cannot disagree.
        if let Some(stop) = horizon {
            if t >= stop { break; }
            t = (t + dt).min(stop);
        } else {
            t += dt;
        }
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
    let final_state = RigidState {
        r: pos,
        v: vel,
        q,
        w: sim_omega_to_kernel(omega_p, omega_q, omega_r),
    };
    let final_flags = DriverFlags {
        drogue_deployed: is_drogue_deployed,
        main_deployed: is_main_deployed,
        rail_bound: !event_state.has_left_rail,
    };
    // Terminal telemetry point (oracle `:1289-1329`): canonical FULL-PRECISION
    // state at the localized touchdown root — never the later macro-bracket
    // endpoint. The loads here are a display-only read: `saw_unsupported` /
    // `saw_extrapolated` are NOT folded from it, so recorded validity and every
    // existing oracle stay untouched.
    if options.record_telemetry && touchdown_tau.is_some() {
        let touchdown_state = RigidState {
            r: Vec3 { x: pos.x, y: pos.y, z: pos.z },
            v: vel,
            q,
            w: sim_omega_to_kernel(omega_p, omega_q, omega_r),
        };
        let touchdown_loads = evaluator(LoadContext {
            phase: LoadPhase::TouchdownSample, time: t,
            drogue_deployed: is_drogue_deployed, main_deployed: is_main_deployed,
            rail_bound: !event_state.has_left_rail, launch_altitude_asl,
            wind_speed_surface, wind_azimuth_deg, fin_cant_rad, drag_cd_scale,
        }, &touchdown_state)?;
        let (pitch_deg, roll_deg, yaw_deg) = quaternion_to_euler_deg(&q);
        let f = touchdown_loads.loads.force_n;
        let touchdown_accel =
            (f.x * f.x + f.y * f.y + f.z * f.z).sqrt() / touchdown_loads.loads.mass;
        telemetry.push(TelemetryPoint {
            time: t,
            position: Vec3 { x: pos.x, y: pos.y, z: 0.0 },
            velocity: vel,
            speed: touchdown_loads.airspeed,
            mach: touchdown_loads.mach,
            altitude: 0.0,
            acceleration: touchdown_accel,
            angular_velocity: BodyRates { p: omega_p, q: omega_q, r: omega_r },
            angle_of_attack_deg: touchdown_loads.alpha_total_deg,
            q,
            pitch_deg,
            roll_deg,
            yaw_deg,
            drag: touchdown_loads.drag_axial,
            thrust: touchdown_loads.thrust,
            mass: touchdown_loads.loads.mass,
            dynamic_pressure: touchdown_loads.q_inf,
        });
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

    Ok(DriverOutcome {
        final_time: t,
        final_state,
        final_flags,
        touched_down: event_state.touched_down,
        mechanism: diagnostics.as_deref().map(|d| d.mechanism.clone()).unwrap_or_default(),
        result: SimulationResult {
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
        telemetry,
        moment_arm_history,
        normal_law_id: vehicle.normal_law_identity().0,
        boattail_policy: vehicle.normal_law_identity().1,
        fin_interference_id: crate::aero::FIN_INTERFERENCE_ID,
        },
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
    _snap: StageSnap,
    drag_cd_scale: f64,
    phase: LoadPhase,
    evaluator: &'a dyn Fn(LoadContext, &RigidState) -> Result<DriverLoads, String>,
) -> impl Fn(f64, &RigidState) -> Result<Loads, String> + 'a {
    let rail = *rail_vector;
    move |ts: f64, st: &RigidState| -> Result<Loads, String> {
        let fl = evaluator(LoadContext {
            phase, time: ts, drogue_deployed: drogue, main_deployed: main,
            rail_bound: !has_rail, launch_altitude_asl,
            wind_speed_surface, wind_azimuth_deg, fin_cant_rad, drag_cd_scale,
        }, st)?;
        if !has_rail {
            let s_along = st.r.dot(&rail);
            let v_along = st.v.dot(&rail);
            let fdot = fl.loads.force_n.dot(&rail);
            if s_along <= 0.0 && v_along <= 0.0 && fdot <= 0.0 {
                return Ok(Loads {
                    force_n: Vec3::zero(),
                    moment_b: Vec3::zero(),
                    inertia_b: fl.loads.inertia_b,
                    inertia_dot_b: fl.loads.inertia_dot_b,
                    mass: fl.loads.mass,
                    validity: fl.loads.validity,
                });
            }
            return Ok(Loads {
                force_n: Vec3 { x: fdot * rail.x, y: fdot * rail.y, z: fdot * rail.z },
                moment_b: Vec3::zero(),
                inertia_b: fl.loads.inertia_b,
                inertia_dot_b: fl.loads.inertia_dot_b,
                mass: fl.loads.mass,
                validity: fl.loads.validity,
            });
        }
        Ok(fl.loads)
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
    snap: StageSnap,
    drag_cd_scale: f64,
    evaluator: &dyn Fn(LoadContext, &RigidState) -> Result<DriverLoads, String>,
    cut_knots: &[f64],
    split: bool,
    mut diagnostics: Option<&mut AdaptiveDiagnostics>,
) -> Result<Refined, String> {
    // Panics on unbracketed crossings with the same messages as the TS
    // restart engine.
    let crossed = |s: &RigidState| event_crossed_at_root(name, s, rail_vector, rail_length, main_deploy_alt);
    if crossed(base) {
        panic!("restart engine: crossing already satisfied at the bracket base");
    }
    let tol = diagnostics.as_ref()
        .map(|d| d.tolerance_policy.tolerances())
        .unwrap_or_else(|| AdaptiveTolerances { r: 1e-3, v: 1e-2, q: 1e-5, w: 1e-3 });
    let loads = stage_loads_closure(
        snap.has_rail, snap.drogue, snap.main, rail_vector,
        launch_altitude_asl, wind_speed_surface, wind_azimuth_deg,
        fin_cant_rad, snap, drag_cd_scale, LoadPhase::EventRefinement(*name), evaluator,
    );
    let path = integrate_rigid_adaptive(base, &loads, t0, t1, &tol, MAX_ADAPTIVE_STEP_CAP_S.min(t1 - t0), INITIAL_ADAPTIVE_STEP_CAP_S.min(t1 - t0), cut_knots, split, diagnostics.as_deref_mut())?;
    if !crossed(&path.state) {
        panic!("restart engine: crossing not bracketed by the segment end — detector mismatch");
    }
    let (mid, crossed_state) = bisect_event_time(&crossed, &path.dense, t0, t1, EVENT_ROOT_WIDTH_S);
    Ok(Refined { time: mid, state: dense_output_at(&path.dense, mid), crossed_state })
}

/// Bisection over the accepted dense path. Returns `(midpoint, crossed_state)`:
/// the midpoint is the reported root, while the crossed state is the predicate-
/// consistent endpoint used only for simultaneity checks.
fn bisect_event_time(
    crossed: &dyn Fn(&RigidState) -> bool,
    dense: &[AdaptiveDenseStep],
    t0: f64,
    t1: f64,
    tol: f64,
) -> (f64, RigidState) {
    let mut a = t0;
    let mut b = t1;
    while b - a > tol {
        let mid = (a + b) / 2.0;
        if crossed(&dense_output_at(dense, mid)) {
            b = mid;
        } else {
            a = mid;
        }
    }
    ((a + b) / 2.0, dense_output_at(dense, b))
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

    #[test]
    fn diagnostic_tolerances_map_only_the_two_frozen_choices() {
        let i = AbsoluteTolerancePolicy::Inherited.tolerances();
        assert_eq!((i.r.to_bits(), i.v.to_bits(), i.q.to_bits(), i.w.to_bits()),
            (1e-3f64.to_bits(), 1e-2f64.to_bits(), 1e-5f64.to_bits(), 1e-3f64.to_bits()));
        let h = AbsoluteTolerancePolicy::Hundredth.tolerances();
        assert_eq!((h.r.to_bits(), h.v.to_bits(), h.q.to_bits(), h.w.to_bits()),
            (1e-5f64.to_bits(), 1e-4f64.to_bits(), 1e-7f64.to_bits(), 1e-5f64.to_bits()));
    }

    #[test]
    fn cut_list_is_sorted_unique_motor_times_plus_one_exact_burnout() {
        let mut motor = estes_c6_motor();
        let burnout = motor.burn_time;
        motor.thrust_curve.push(ThrustPoint { time: burnout, thrust: 0.0 });
        let d = AdaptiveDiagnostics::for_motor(&motor, Some(CandidateDiagnosticControls {
            tolerance_policy: AbsoluteTolerancePolicy::Inherited,
            split_at_thrust_knots: true,
        }));
        assert!(d.cut_knots.windows(2).all(|w| w[0] < w[1]), "sorted unique exact values");
        assert_eq!(d.cut_knots.iter().filter(|t| t.to_bits() == burnout.to_bits()).count(), 1);
        assert_eq!(d.mechanism.cut_knots, d.cut_knots);
    }

    fn constant_loads_evaluator(times: &std::cell::RefCell<Vec<f64>>)
        -> impl Fn(LoadContext, &RigidState) -> Result<DriverLoads, String> + '_ {
        move |context: LoadContext, _: &RigidState| -> Result<DriverLoads, String> {
            times.borrow_mut().push(context.time);
            Ok(DriverLoads {
                loads: Loads {
                    force_n: Vec3 { x: 0.0, y: 0.0, z: 1.0 },
                    moment_b: Vec3::zero(),
                    inertia_b: Vec3 { x: 1.0, y: 1.0, z: 1.0 },
                    inertia_dot_b: Vec3::zero(),
                    mass: 1.0,
                    validity: StageValidity::Valid,
                },
                airspeed: 0.0, mach: 0.0, q_inf: 0.0, alpha_total_deg: 0.0,
                envelope_alpha_deg: 0.0, drag_axial: 0.0, thrust: 0.0,
                legacy_diagnostic: None,
            })
        }
    }

    #[test]
    fn split_controls_land_exactly_on_knots_and_no_split_records_the_straddle() {
        let state = RigidState { r: Vec3::zero(), v: Vec3::zero(),
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        let times = std::cell::RefCell::new(Vec::<f64>::new());
        let evaluator = constant_loads_evaluator(&times);
        let rail = Vec3 { x: 0.0, y: 0.0, z: 1.0 };
        let loads = stage_loads_closure(true, false, false, &rail,
            0.0, 0.0, 90.0, 0.0, snap_for_refine(true, false, false),
            1.0, LoadPhase::EndpointProbe, &evaluator);
        let knot = 0.035f64;
        let mut split = AdaptiveDiagnostics {
            tolerance_policy: AbsoluteTolerancePolicy::Inherited,
            split_at_thrust_knots: true,
            cut_knots: vec![knot],
            mechanism: MechanismEvidence { cut_knots: vec![knot], ..Default::default() },
        };
        let tol = split.tolerance_policy.tolerances();
        let run = integrate_rigid_adaptive(&state, &loads, 0.0, 0.1, &tol, 0.1, 0.1, &[knot], true, Some(&mut split)).unwrap();
        assert_eq!(run.dense[0].t1.to_bits(), knot.to_bits(), "accepted endpoint lands exactly on the knot");
        assert!(run.dense.iter().all(|s| !(s.t0 < knot && knot < s.t1)), "no accepted step straddles the knot");
        assert_eq!(split.mechanism.clipped, vec![(0.0, knot)]);
        assert!(split.mechanism.straddled.is_empty());
        assert!(times.borrow().iter().take(7).all(|t| *t <= knot), "first trial stages stay at/before the knot");

        let mut no_split = AdaptiveDiagnostics {
            tolerance_policy: AbsoluteTolerancePolicy::Inherited,
            split_at_thrust_knots: false,
            cut_knots: vec![knot],
            mechanism: MechanismEvidence { cut_knots: vec![knot], ..Default::default() },
        };
        let tol2 = no_split.tolerance_policy.tolerances();
        let run2 = integrate_rigid_adaptive(&state, &loads, 0.0, 0.1, &tol2, 0.1, 0.1, &[knot], false, Some(&mut no_split)).unwrap();
        assert!(run2.dense.iter().any(|s| s.t0 < knot && knot < s.t1), "without splitting a trial straddles the knot");
        assert!(no_split.mechanism.straddled.iter().any(|(t, k)| *t == 0.0 && *k == knot));
        assert!(no_split.mechanism.clipped.is_empty());
    }

    #[test]
    fn cut_list_normalizes_unsorted_duplicates_and_empty_curves() {
        let mut motor = estes_c6_motor();
        let burnout = motor.burn_time;
        motor.thrust_curve = vec![
            ThrustPoint { time: 0.2, thrust: 5.0 },
            ThrustPoint { time: 0.0, thrust: 0.0 },
            ThrustPoint { time: 0.2, thrust: 5.0 },
            ThrustPoint { time: 0.1, thrust: 2.0 },
        ];
        let knots = thrust_cut_times(&motor);
        assert_eq!(knots, vec![0.0, 0.1, 0.2, burnout]);
        assert!(knots.windows(2).all(|w| w[0] < w[1]));

        motor.thrust_curve.clear();
        assert_eq!(thrust_cut_times(&motor), vec![burnout]);

        let empty = thrust_cut_times(&estes_c6_motor());
        assert_eq!(empty.iter().filter(|t| t.to_bits() == burnout.to_bits()).count(), 1);
        let d = AdaptiveDiagnostics::for_motor(&estes_c6_motor(), None);
        assert!(d.split_at_thrust_knots, "absent controls select the split default");
        let d = AdaptiveDiagnostics::for_motor(&estes_c6_motor(), Some(CandidateDiagnosticControls {
            tolerance_policy: AbsoluteTolerancePolicy::Inherited,
            split_at_thrust_knots: false,
        }));
        assert!(!d.split_at_thrust_knots);
    }

    #[test]
    fn coincident_and_near_zero_knots_do_not_stall_or_split() {
        let state = RigidState { r: Vec3::zero(), v: Vec3::zero(),
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        let times = std::cell::RefCell::new(Vec::<f64>::new());
        let evaluator = constant_loads_evaluator(&times);
        let rail = Vec3 { x: 0.0, y: 0.0, z: 1.0 };
        let loads = stage_loads_closure(true, false, false, &rail,
            0.0, 0.0, 90.0, 0.0, snap_for_refine(true, false, false),
            1.0, LoadPhase::EndpointProbe, &evaluator);
        let tol = AdaptiveTolerances { r: 1e-3, v: 1e-2, q: 1e-5, w: 1e-3 };

        for (knot, expect_clip) in [(0.0, false), (1e-18, false), (1e-12, true), (0.035, true)] {
            let mut diag = AdaptiveDiagnostics {
                tolerance_policy: AbsoluteTolerancePolicy::Inherited,
                split_at_thrust_knots: true,
                cut_knots: vec![knot],
                mechanism: MechanismEvidence { cut_knots: vec![knot], ..Default::default() },
            };
            let run = integrate_rigid_adaptive(&state, &loads, 0.0, 0.1, &tol, 0.1, 0.1,
                &[knot], true, Some(&mut diag)).unwrap();
            assert!(run.dense[0].t1 > run.dense[0].t0, "no zero-length step at knot {knot:e}");
            if expect_clip {
                assert_eq!(run.dense[0].t1.to_bits(), knot.to_bits(), "clip at {knot:e}");
                assert!(!diag.mechanism.clipped.is_empty());
            } else {
                assert!(run.dense[0].t1 > knot, "coincident/near-zero knot is not split at {knot:e}");
                assert!(diag.mechanism.clipped.is_empty());
            }
            assert!(diag.mechanism.accepted_steps > 0);
        }
    }

    #[test]
    fn no_split_when_no_knot_lies_inside_the_trial_window() {
        let state = RigidState { r: Vec3::zero(), v: Vec3::zero(),
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        let times = std::cell::RefCell::new(Vec::<f64>::new());
        let evaluator = constant_loads_evaluator(&times);
        let rail = Vec3 { x: 0.0, y: 0.0, z: 1.0 };
        let loads = stage_loads_closure(true, false, false, &rail,
            0.0, 0.0, 90.0, 0.0, snap_for_refine(true, false, false),
            1.0, LoadPhase::EndpointProbe, &evaluator);
        let tol = AdaptiveTolerances { r: 1e-3, v: 1e-2, q: 1e-5, w: 1e-3 };
        let mut diag = AdaptiveDiagnostics {
            tolerance_policy: AbsoluteTolerancePolicy::Inherited,
            split_at_thrust_knots: true,
            cut_knots: vec![0.5],
            mechanism: MechanismEvidence { cut_knots: vec![0.5], ..Default::default() },
        };
        let run = integrate_rigid_adaptive(&state, &loads, 0.0, 0.1, &tol, 0.1, 0.1,
            &[0.5], true, Some(&mut diag)).unwrap();
        assert!(run.dense.iter().all(|s| !(s.t0 < 0.5 && 0.5 < s.t1)));
        assert!(diag.mechanism.clipped.is_empty());
        assert!(diag.mechanism.straddled.is_empty());
    }

    #[test]
    fn event_root_midpoint_is_consistent_with_the_bracket() {
        let q = Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 };
        let f = StateDerivative {
            dr: Vec3 { x: 0.0, y: 0.0, z: 1.0 },
            dv: Vec3::zero(),
            dq: quaternion_derivative(&q, &Vec3::zero()),
            dw: Vec3::zero(),
        };
        let dense = vec![AdaptiveDenseStep {
            t0: 0.0,
            t1: 1.0,
            y0: RigidState { r: Vec3 { x: 0.0, y: 0.0, z: 0.0 }, v: Vec3 { x: 0.0, y: 0.0, z: 1.0 }, q, w: Vec3::zero() },
            f0: f,
            y1: RigidState { r: Vec3 { x: 0.0, y: 0.0, z: 1.0 }, v: Vec3 { x: 0.0, y: 0.0, z: 1.0 }, q, w: Vec3::zero() },
            f1: f,
        }];
        let crossed = |s: &RigidState| s.r.z >= 0.5;
        let (mid, crossed_state) = bisect_event_time(&crossed, &dense, 0.0, 1.0, EVENT_ROOT_WIDTH_S);
        assert!((mid - 0.5).abs() <= EVENT_ROOT_WIDTH_S, "midpoint {mid}");
        assert!(crossed(&crossed_state), "bracket upper endpoint is crossed");
        assert!(mid >= 0.5 - EVENT_ROOT_WIDTH_S && mid <= 0.5 + EVENT_ROOT_WIDTH_S);
    }

    #[test]
    fn mechanism_records_the_dt_sequence_in_the_frozen_window() {
        let state = RigidState { r: Vec3::zero(), v: Vec3::zero(),
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        let times = std::cell::RefCell::new(Vec::<f64>::new());
        let evaluator = constant_loads_evaluator(&times);
        let rail = Vec3 { x: 0.0, y: 0.0, z: 1.0 };
        let loads = stage_loads_closure(true, false, false, &rail,
            0.0, 0.0, 90.0, 0.0, snap_for_refine(true, false, false),
            1.0, LoadPhase::EndpointProbe, &evaluator);
        let mut diag = AdaptiveDiagnostics {
            tolerance_policy: AbsoluteTolerancePolicy::Hundredth,
            split_at_thrust_knots: false,
            cut_knots: Vec::new(),
            mechanism: MechanismEvidence::default(),
        };
        let tol = diag.tolerance_policy.tolerances();
        integrate_rigid_adaptive(&state, &loads, 0.0, 0.3, &tol, 0.05, 0.05, &[], false, Some(&mut diag)).unwrap();
        assert!(!diag.mechanism.step_window.is_empty(), "window trials must be recorded");
        assert!(diag.mechanism.step_window.iter().all(|(a, _)| (0.18..=0.25).contains(a)));
    }

    /// The default wind profile shears with altitude: the same surface speed
    /// yields a materially different wind magnitude 10 km up.
    #[test]
    fn default_wind_shears_with_altitude() {
        let default_low = wind_vector_at(0.0, 8.0, 180.0);
        let default_high = wind_vector_at(10_000.0, 8.0, 180.0);
        assert!((default_low.norm() - default_high.norm()).abs() > 1.0);
    }

    /// 20 deg free-flight incidence: ignored for validity at ~1 m/s (aero force
    /// far below AERO_NEGLIGIBLE_WEIGHT_FRACTION of weight), classified at 60 m/s.
    #[test]
    fn incidence_validity_ignores_negligible_aero_force() {
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        let alpha = 20.0_f64.to_radians();
        let state_at = |speed: f64| RigidState {
            r: Vec3 { x: 0.0, y: 0.0, z: 300.0 },
            v: Vec3 { x: 0.0, y: speed * alpha.cos(), z: speed * alpha.sin() },
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 },
            w: Vec3::zero(),
        };
        let slow = compute_flight_loads(5.0, &state_at(1.0), false, false, false, 0.0, 0.0, 0.0, 0.0, &v, &m, 1.0).unwrap();
        assert!((slow.alpha_total_deg - 20.0).abs() < 1e-9);
        assert_eq!(slow.envelope_alpha_deg, 0.0);
        assert_eq!(slow.loads.validity, StageValidity::Valid);
        let fast = compute_flight_loads(5.0, &state_at(60.0), false, false, false, 0.0, 0.0, 0.0, 0.0, &v, &m, 1.0).unwrap();
        assert!((fast.envelope_alpha_deg - 20.0).abs() < 1e-9);
        assert_eq!(fast.loads.validity, StageValidity::Extrapolated);
    }

    /// RMP09-C06 (temporal): a real airframe-domain classification reached
    /// during free-flight ascent must remain in the summary after a later,
    /// fully valid canopy deployment. The canopy branch reclassifies its own
    /// stages (it ignores airframe incidence); it must not erase the earlier
    /// airframe excursion, and applying that label must not move the physics.
    #[test]
    fn airframe_ascent_domain_excursion_survives_later_canopy_deployment() {
        use std::cell::RefCell;
        let vehicle = estes_alpha_vehicle();
        let motor = estes_c6_motor();
        // A declared crosswind drives a genuine incidence excursion after rail
        // exit: 8 m/s stays inside the 30 deg envelope (Extrapolated only),
        // 15 m/s is outside it (Unsupported).
        for (wind, expected, enveloped) in [
            (8.0, StageValidity::Extrapolated, true),
            (15.0, StageValidity::Unsupported, false),
        ] {
            let mut options = default_opts();
            options.wind_speed_surface = Some(wind);
            // Committed macro reads are the summary's own trajectory samples.
            let samples: RefCell<Vec<(f64, bool, StageValidity)>> = RefCell::new(Vec::new());
            let evaluator = |context: LoadContext, state: &RigidState| {
                let loads = legacy_driver_loads(context, state, &vehicle, &motor)?;
                if context.phase == LoadPhase::MacroSample {
                    samples.borrow_mut().push((context.time,
                        context.drogue_deployed || context.main_deployed,
                        loads.loads.validity));
                }
                Ok(loads)
            };
            let run = simulate_flight_with_evaluator(&vehicle, &motor, &options, &evaluator).unwrap();
            let samples = samples.into_inner();
            assert!(run.terminated, "wind {wind}: divergent-label run must still land");
            for name in ["Apogee & Drogue Deployment", "Main Parachute Deployment", "Ground Touchdown"] {
                assert!(run.events.iter().any(|e| e.name == name), "wind {wind}: missing {name}");
            }
            let drogue_time = run.events.iter().find(|e| e.name == "Apogee & Drogue Deployment")
                .expect("drogue event").time;
            // Every committed sample with a live canopy is its own valid branch:
            // the UNKNOWN summary cannot be attributed to the recovered descent.
            let canopy_samples: Vec<&(f64, bool, StageValidity)> =
                samples.iter().filter(|(_, canopy, _)| *canopy).collect();
            assert!(canopy_samples.len() > 1, "wind {wind}: canopy phase must be sampled");
            assert!(canopy_samples.iter().all(|(_, _, v)| *v == StageValidity::Valid),
                "wind {wind}: a delivered canopy stage must not itself be off-nominal");
            assert!(canopy_samples.iter().all(|(t, _, _)| *t >= drogue_time));
            // The earlier airframe ascent carried the actual classification.
            let airframe_bad: Vec<f64> = samples.iter()
                .filter(|(t, canopy, v)| !*canopy && *t < drogue_time && *v != StageValidity::Valid)
                .map(|(t, _, _)| *t).collect();
            assert!(!airframe_bad.is_empty(), "wind {wind}: no committed airframe excursion");
            assert!(samples.iter().any(|(t, canopy, v)| !*canopy && *t < drogue_time && *v == expected),
                "wind {wind}: expected {expected:?} on the committed ascent");
            assert!(airframe_bad.iter().cloned().fold(f64::NEG_INFINITY, f64::max) < drogue_time,
                "wind {wind}: the excursion must be strictly before recovery");
            // Summary semantics retain the earlier failure: no PASS recovery.
            assert_eq!(run.validity, "UNKNOWN", "wind {wind}");
            assert!(run.off_nominal_excursion, "wind {wind}");
            assert_eq!(run.enveloped, enveloped,
                "wind {wind}: only the 15 m/s case leaves the free-flight envelope");
        }
    }

    /// RMP09-C06 (committed vs speculative): a validity label reported by the
    /// stage checks of a *rejected* adaptive trial is speculative. Only the
    /// accepted path may reach `committed_validity`, which the driver folds.
    #[test]
    fn rejected_adaptive_trial_validity_is_not_folded_into_the_committed_prefix() {
        use std::cell::Cell;
        // Same oscillator as `shared_stage_evaluator_observes_rejected_trials...`:
        // the initial 0.1 s trial is rejected and retried smaller.
        let state = RigidState {
            r: Vec3 { x: 1.0, y: 0.0, z: 0.0 }, v: Vec3::zero(),
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero(),
        };
        let tol = AdaptiveTolerances { r: 1e-7, v: 1e-7, q: 1e-8, w: 1e-8 };
        let poisoned = Cell::new(0usize);
        let first_trial_unsupported = |_: f64, st: &RigidState| -> Result<Loads, String> {
            let call = poisoned.get();
            poisoned.set(call + 1);
            Ok(Loads {
                force_n: Vec3 { x: -10_000.0 * st.r.x, y: 0.0, z: 0.0 },
                moment_b: Vec3::zero(), inertia_b: Vec3 { x: 1.0, y: 1.0, z: 1.0 },
                inertia_dot_b: Vec3::zero(), mass: 1.0,
                validity: if call < 7 { StageValidity::Unsupported } else { StageValidity::Valid },
            })
        };
        let run = integrate_rigid_adaptive(&state, &first_trial_unsupported, 0.0, 0.1, &tol, 0.1, 0.1, &[], true, None).unwrap();
        assert!(poisoned.get() > 7, "the first seven stage checks must have been rejected and retried");
        assert!(!run.dense.is_empty(), "the run must commit at least one step");
        assert!(run.committed_validity.iter().all(|v| *v == StageValidity::Valid),
            "a rejected trial's speculative classification reached the committed prefix");
        // Positive control: the same accepted path marked unsupported is folded,
        // so the assertion above is not merely "validity is never recorded".
        let always_unsupported = |_: f64, st: &RigidState| -> Result<Loads, String> {
            Ok(Loads {
                force_n: Vec3 { x: -10_000.0 * st.r.x, y: 0.0, z: 0.0 },
                moment_b: Vec3::zero(), inertia_b: Vec3 { x: 1.0, y: 1.0, z: 1.0 },
                inertia_dot_b: Vec3::zero(), mass: 1.0,
                validity: StageValidity::Unsupported,
            })
        };
        let run = integrate_rigid_adaptive(&state, &always_unsupported, 0.0, 0.1, &tol, 0.1, 0.1, &[], true, None).unwrap();
        assert!(!run.committed_validity.is_empty());
        assert!(run.committed_validity.iter().all(|v| *v == StageValidity::Unsupported));
    }

    /// RMP09-C06 (committed vs speculative): prefix folding stops at the
    /// localized event time. A step that starts at or after the committed root
    /// belongs to the pre-transition speculative path, so its label must not
    /// leak into the reported summary.
    #[test]
    fn fold_prefix_consumes_only_steps_starting_before_the_event_time() {
        let d = StateDerivative { dr: Vec3::zero(), dv: Vec3::zero(),
            dq: Quat { w: 0.0, x: 0.0, y: 0.0, z: 0.0 }, dw: Vec3::zero() };
        let state = RigidState { r: Vec3::zero(), v: Vec3::zero(),
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        let dense: Vec<AdaptiveDenseStep> = [0.0, 0.1, 0.2].iter().map(|t0| AdaptiveDenseStep {
            t0: *t0, t1: *t0 + 0.1, y0: state, f0: d, y1: state, f1: d,
        }).collect();
        let committed = [StageValidity::Unsupported, StageValidity::Valid, StageValidity::Extrapolated];
        let fold = |tau: f64| {
            let (mut unsupported, mut extrapolated) = (false, false);
            fold_prefix(&committed, &dense, tau, &mut unsupported, &mut extrapolated);
            (unsupported, extrapolated)
        };
        assert_eq!(fold(0.0), (false, false), "a root at the prefix start folds nothing");
        assert_eq!(fold(0.1), (true, false), "only the step before the root is prefix");
        assert_eq!(fold(0.15), (true, false));
        assert_eq!(fold(0.2), (true, false));
        assert_eq!(fold(0.35), (true, true), "all committed steps before the root are folded");
    }

    #[test]
    fn moment_arm_history_copies_only_exact_committed_reads_without_extra_calls() {
        use std::cell::RefCell;
        use crate::moment_arm_history::MomentArmSample;
        let vehicle = estes_alpha_vehicle();
        let motor = estes_c6_motor();
        let mut previous_calls = None;
        let mut previous_result = None;
        for enabled in [false, true] {
            let calls = RefCell::new(Vec::new());
            let expected = RefCell::new(Vec::new());
            let mut options = default_opts();
            options.record_moment_arm_history = enabled;
            let evaluator = |context: LoadContext, state: &RigidState| {
                calls.borrow_mut().push((context.phase, context.time.to_bits(), *state));
                let fl = compute_flight_loads(context.time, state, context.drogue_deployed,
                    context.main_deployed, context.rail_bound, context.launch_altitude_asl,
                    context.wind_speed_surface, context.wind_azimuth_deg, context.fin_cant_rad,
                    &vehicle, &motor, context.drag_cd_scale)?;
                if context.phase == LoadPhase::MacroSample && context.time <= motor.burn_time {
                    expected.borrow_mut().push(MomentArmSample { time_s: context.time,
                        mass_kg: fl.loads.mass, diagnostic: fl.diagnostic.clone() });
                }
                Ok(fl.into_driver(enabled && context.phase == LoadPhase::MacroSample))
            };
            let mut result = simulate_flight_with_evaluator(&vehicle, &motor, &options, &evaluator).unwrap();
            if enabled {
                assert!(result.moment_arm_history == *expected.borrow(), "must copy same exact diagnostic/time/mass");
                assert!(calls.borrow().len() > result.moment_arm_history.len());
                assert!(previous_calls.as_ref().unwrap() == &*calls.borrow(), "observer cannot add/reorder evaluator calls or alter states");
            } else { assert!(result.moment_arm_history.is_empty()); }
            previous_calls = Some(calls.into_inner());
            result.moment_arm_history.clear();
            let unchanged = format!("{result:?}");
            if let Some(old) = previous_result { assert!(old == unchanged, "all other result fields must be identical"); }
            previous_result = Some(unchanged);
        }
    }

    #[test]
    fn moment_arm_mechanics_matches_independent_two_mass_triangle_depletion() {
        let vehicle = estes_alpha_vehicle();
        let mut motor = estes_c6_motor();
        motor.burn_time = 2.0;
        motor.total_mass = 0.03; motor.dry_mass = 0.02; motor.propellant_mass = 0.01;
        motor.max_thrust = 10.0;
        motor.thrust_curve = vec![ThrustPoint { time: 0.0, thrust: 0.0 },
            ThrustPoint { time: 1.0, thrust: 10.0 }, ThrustPoint { time: 2.0, thrust: 0.0 }];
        validate_motor_spec(&motor).unwrap();
        let state = RigidState { r: Vec3::zero(), v: Vec3 { x: 0.0, y: 5.0, z: 0.0 },
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        for (t, motor_mass) in [(0.0, 0.03), (1.0, 0.025), (2.0, 0.02)] {
            // Equal triangular areas before/after1s: half the propellant at1s.
            let fl = compute_flight_loads(t, &state, false, false, false,
                0.0, 0.0, 0.0, 0.0, &vehicle, &motor, 1.0).unwrap();
            let mass = vehicle.dry_mass + motor_mass;
            let motor_cg = vehicle.motor_aft_station_from_nose - motor.length / 2.0;
            let cg = (vehicle.dry_mass * vehicle.cg_from_nose + motor_mass * motor_cg) / mass;
            assert!((fl.loads.mass - mass).abs() < 1e-15);
            assert!((fl.diagnostic.combined_cg - cg).abs() < 1e-15);
        }
        // Exhaustion above reaches dry motor mass; a declared zero-propellant
        // motor remains an entry-gate refusal, not invented new support.
        motor.propellant_mass = 0.0; motor.total_mass = motor.dry_mass;
        let expected_error = validate_motor_spec(&motor).unwrap_err();
        assert!(expected_error.contains("propellantMass must be finite and positive"));
        for enabled in [false, true] {
            let mut options = default_opts(); options.record_moment_arm_history = enabled;
            assert_eq!(simulate_flight(&vehicle, &motor, &options).unwrap_err(), expected_error);
        }
    }

    #[test]
    fn moment_arm_capture_cap_is_checked_before_push() {
        use crate::moment_arm_history::{record, MomentArmSample, MAX_MOMENT_ARM_SAMPLES};
        let state = RigidState { r: Vec3::zero(), v: Vec3::zero(),
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        let fl = compute_flight_loads(0.0, &state, false, false, true,
            0.0, 0.0, 0.0, 0.0, &estes_alpha_vehicle(), &estes_c6_motor(), 1.0).unwrap();
        let sample = MomentArmSample { time_s: 0.0, mass_kg: fl.loads.mass, diagnostic: fl.diagnostic };
        let mut points = vec![sample.clone(); MAX_MOMENT_ARM_SAMPLES - 1];
        record(&mut points, 1.0, sample.mass_kg, &sample.diagnostic).unwrap();
        let error = record(&mut points, 2.0, sample.mass_kg, &sample.diagnostic).unwrap_err();
        assert!(error.contains("sample 5001 exceeds cap 5000"));
        assert_eq!(points.len(), MAX_MOMENT_ARM_SAMPLES);
        assert_eq!(points.last().unwrap().time_s, 1.0);
    }

    #[test]
    fn moment_arm_request_preserves_legacy_cancellation_refusal() {
        let mut vehicle = estes_alpha_vehicle();
        vehicle.cna_body = 2.0; vehicle.cna_fins = -2.0;
        vehicle.body_abs_cna = 2.0; vehicle.fin_abs_cna = 2.0;
        for enabled in [false, true] {
            let mut options = default_opts(); options.record_moment_arm_history = enabled;
            let error = simulate_flight(&vehicle, &estes_c6_motor(), &options).unwrap_err();
            assert!(error.contains("unsupported total"));
        }
    }

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
            drag_cd_scale: None,
            record_telemetry: false,
            record_moment_arm_history: false,
        }
    }

    fn legacy_driver_loads(
        context: LoadContext, state: &RigidState, vehicle: &Vehicle, motor: &MotorSpec,
    ) -> Result<DriverLoads, String> {
        compute_flight_loads(
            context.time, state, context.drogue_deployed, context.main_deployed,
            context.rail_bound, context.launch_altitude_asl,
            context.wind_speed_surface, context.wind_azimuth_deg,
            context.fin_cant_rad, vehicle, motor, context.drag_cd_scale,
        ).map(DriverLoads::from)
    }

    #[test]
    fn driver_load_conversion_preserves_every_consumed_value() {
        let state = RigidState {
            r: Vec3 { x: 2.0, y: -3.0, z: 100.0 },
            v: Vec3 { x: 0.2, y: 40.0, z: -0.3 },
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 },
            w: Vec3 { x: 0.1, y: -0.2, z: 0.3 },
        };
        let old = compute_flight_loads(0.3, &state, false, false, false,
            25.0, 2.0, 90.0, 0.02, &estes_alpha_vehicle(), &estes_c6_motor(), 1.2).unwrap();
        let expected_loads = old.loads;
        let expected_scalars = [old.airspeed, old.mach, old.q_inf, old.alpha_total_deg,
            old.envelope_alpha_deg, old.drag_axial, old.thrust].map(f64::to_bits);
        let driver = DriverLoads::from(old);
        assert_eq!(driver.loads, expected_loads);
        assert_eq!([driver.airspeed, driver.mach, driver.q_inf, driver.alpha_total_deg,
            driver.envelope_alpha_deg, driver.drag_axial, driver.thrust].map(f64::to_bits), expected_scalars);
    }

    #[test]
    fn shared_driver_uses_one_evaluator_for_stages_roots_and_reads() {
        use std::cell::RefCell;
        let vehicle = estes_alpha_vehicle();
        let motor = estes_c6_motor();
        let mut options = default_opts();
        options.record_telemetry = true;
        let contexts = RefCell::new(Vec::new());
        let evaluator = |context: LoadContext, state: &RigidState| {
            contexts.borrow_mut().push(context);
            legacy_driver_loads(context, state, &vehicle, &motor)
        };
        let run = simulate_flight_with_evaluator(&vehicle, &motor, &options, &evaluator).unwrap();
        let public = simulate_flight(&vehicle, &motor, &options).unwrap();
        assert!(run.terminated, "fixture must exercise the terminal read");
        assert_eq!(format!("{run:?}"), format!("{public:?}"), "all metrics/events/telemetry stay exact");
        let contexts = contexts.borrow();
        for phase in [LoadPhase::EndpointProbe, LoadPhase::BurnoutRoot,
            LoadPhase::EventRefinement(AstraeaEvent::RailExit),
            LoadPhase::EventRefinement(AstraeaEvent::ApogeeDrogue),
            LoadPhase::EventRefinement(AstraeaEvent::MainDeploy),
            LoadPhase::EventRefinement(AstraeaEvent::Touchdown),
            LoadPhase::RailExit, LoadPhase::MacroSample, LoadPhase::TouchdownSample] {
            let count = contexts.iter().filter(|c| c.phase == phase).count();
            assert!(count > 0, "missing callback purpose {phase:?}");
            eprintln!("shared-driver phase {phase:?}: {count}");
        }
        assert!(contexts.iter().filter(|c| c.phase == LoadPhase::EndpointProbe).count() > 7,
            "RHS evaluations must reach intermediate adaptive stages");
        assert!(contexts.iter().any(|c| c.phase == LoadPhase::EndpointProbe && c.rail_bound));
        assert!(contexts.iter().any(|c| c.phase == LoadPhase::EndpointProbe && !c.rail_bound && !c.drogue_deployed));
        assert!(contexts.iter().any(|c| c.phase == LoadPhase::EndpointProbe && c.drogue_deployed));
        for c in contexts.iter() {
            assert!(c.time.is_finite());
            assert_eq!(c.launch_altitude_asl, 0.0);
            assert_eq!(c.wind_speed_surface, 0.0);
            assert_eq!(c.wind_azimuth_deg, 90.0);
            assert_eq!(c.fin_cant_rad, 0.0);
            assert_eq!(c.drag_cd_scale, 1.0);
            if c.phase == LoadPhase::BurnoutRoot { assert!(c.time <= motor.burn_time); }
            if c.phase == LoadPhase::RailExit { assert!(!c.rail_bound); }
            if c.phase == LoadPhase::TouchdownSample {
                assert_eq!(c.time, run.flight_time);
                assert!(!c.rail_bound && c.main_deployed);
            }
        }
        assert_eq!(contexts.iter().filter(|c| c.phase == LoadPhase::TouchdownSample).count(), 1);
    }

    #[test]
    fn shared_driver_propagates_each_evaluator_phase_error_without_fallback() {
        use std::cell::Cell;
        let vehicle = estes_alpha_vehicle();
        let motor = estes_c6_motor();
        let mut options = default_opts();
        options.record_telemetry = true;
        for target in [LoadPhase::EndpointProbe, LoadPhase::BurnoutRoot,
            LoadPhase::EventRefinement(AstraeaEvent::RailExit),
            LoadPhase::EventRefinement(AstraeaEvent::ApogeeDrogue),
            LoadPhase::EventRefinement(AstraeaEvent::MainDeploy),
            LoadPhase::EventRefinement(AstraeaEvent::Touchdown),
            LoadPhase::RailExit, LoadPhase::MacroSample, LoadPhase::TouchdownSample] {
            let failed = Cell::new(false);
            let message = format!("deliberate evaluator error at {target:?}");
            let evaluator = |context: LoadContext, state: &RigidState| {
                assert!(!failed.get(), "no callback may follow a failed evaluation");
                if context.phase == target {
                    failed.set(true);
                    return Err(message.clone());
                }
                legacy_driver_loads(context, state, &vehicle, &motor)
            };
            let error = simulate_flight_with_evaluator(&vehicle, &motor, &options, &evaluator).unwrap_err();
            assert!(failed.get(), "error phase was reached: {target:?}");
            assert_eq!(error, message);
        }
    }

    #[test]
    fn bounded_driver_stops_exactly_at_an_off_grid_horizon() {
        use std::cell::RefCell;
        let vehicle = estes_alpha_vehicle();
        let motor = estes_c6_motor();
        let options = default_opts();
        for horizon in [0.257f64, 1.0, 0.004] {
            let contexts = RefCell::new(Vec::new());
            let macro_states = RefCell::new(Vec::new());
            let evaluator = |context: LoadContext, state: &RigidState| {
                contexts.borrow_mut().push(context);
                if context.phase == LoadPhase::MacroSample {
                    macro_states.borrow_mut().push((context.time, *state));
                }
                legacy_driver_loads(context, state, &vehicle, &motor)
            };
            let outcome = drive_candidate(&vehicle, &motor, &options, horizon, &evaluator, None).unwrap();
            assert_eq!(outcome.final_time, horizon, "reported stop must be exact");
            assert_eq!(outcome.result.flight_time, horizon);
            assert!(!outcome.touched_down);
            let max_probe = contexts.borrow().iter().map(|c| c.time)
                .fold(f64::NEG_INFINITY, f64::max);
            assert!(max_probe <= horizon, "evaluated t={max_probe} beyond horizon {horizon}");
            let macro_states = macro_states.borrow();
            assert!(macro_states.len() >= 2, "initial commit plus at least one step");
            let (last_time, last_state) = *macro_states.last().unwrap();
            assert_eq!(last_time, horizon, "the committed macro state is at the stop");
            assert_eq!(last_state, outcome.final_state,
                "reported final state must be the state evaluated at the stop");
            if horizon > 0.1 {
                assert!(last_state.r.z > 0.0, "the horizon run must have ascended");
            }
        }
        let evaluator = |context: LoadContext, state: &RigidState| {
            legacy_driver_loads(context, state, &vehicle, &motor)
        };
        for bad in [0.0, -0.1, f64::NAN, f64::INFINITY] {
            assert!(drive_candidate(&vehicle, &motor, &options, bad, &evaluator, None).is_err(),
                "invalid horizon {bad} must refuse, never clamp or default");
        }
        // The public wrapper keeps the legacy horizon and is unaffected.
        let public = simulate_flight(&vehicle, &motor, &options).unwrap();
        assert!(public.flight_time > 1.0);
    }

    #[test]
    fn shared_stage_evaluator_observes_rejected_trials_and_propagates_retry_error() {
        use std::cell::{Cell, RefCell};
        let state = RigidState {
            r: Vec3 { x: 1.0, y: 0.0, z: 0.0 }, v: Vec3::zero(),
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero(),
        };
        // A synthetic harmonic oscillator makes the initial 0.1 s trial too
        // large. A time rewind marks a rejected trial, not a committed sample.
        let times = RefCell::new(Vec::new());
        let fail_on_retry = Cell::new(false);
        let evaluator = |context: LoadContext, st: &RigidState| -> Result<DriverLoads, String> {
            assert_eq!(context.phase, LoadPhase::EndpointProbe);
            let retry = times.borrow().last().map_or(false, |last| context.time < *last);
            times.borrow_mut().push(context.time);
            if retry && fail_on_retry.get() { return Err("retry stage refused".into()); }
            Ok(DriverLoads {
                loads: Loads {
                    force_n: Vec3 { x: -10_000.0 * st.r.x, y: 0.0, z: 0.0 },
                    moment_b: Vec3::zero(), inertia_b: Vec3 { x: 1.0, y: 1.0, z: 1.0 },
                    inertia_dot_b: Vec3::zero(), mass: 1.0, validity: StageValidity::Valid,
                },
                airspeed: 0.0, mach: 0.0, q_inf: 0.0, alpha_total_deg: 0.0,
                envelope_alpha_deg: 0.0, drag_axial: 0.0, thrust: 0.0,
                legacy_diagnostic: None,
            })
        };
        let rail = Vec3 { x: 0.0, y: 0.0, z: 1.0 };
        let loads = stage_loads_closure(true, false, false, &rail,
            0.0, 0.0, 90.0, 0.0, snap_for_refine(true, false, false),
            1.0, LoadPhase::EndpointProbe, &evaluator);
        let tol = AdaptiveTolerances { r: 1e-7, v: 1e-7, q: 1e-8, w: 1e-8 };
        let run = integrate_rigid_adaptive(&state, &loads, 0.0, 0.1, &tol, 0.1, 0.1, &[], true, None).unwrap();
        let count = times.borrow().len();
        assert_eq!(count % 7, 0, "every completed trial has all seven stages");
        assert!(count > 7 * run.dense.len(), "rejected trials must reach the evaluator too");
        assert!(times.borrow().windows(2).any(|pair| pair[1] < pair[0]));
        times.borrow_mut().clear();
        fail_on_retry.set(true);
        let error = integrate_rigid_adaptive(&state, &loads, 0.0, 0.1, &tol, 0.1, 0.1, &[], true, None).unwrap_err();
        assert_eq!(error, "retry stage refused");
        assert_eq!(times.borrow().len(), 8, "seven failed-trial stages, then the refusing retry stage");
    }

    #[test]
    fn touchdown_refinement_propagates_current_flags_and_callback_error() {
        use std::cell::Cell;
        // Direct abnormal-contact refinement: no canopy has deployed, and the
        // endpoint detector need not have emitted a nominal touchdown event.
        let state = RigidState {
            r: Vec3 { x: 0.0, y: 0.0, z: 1.0 },
            v: Vec3 { x: 0.0, y: 0.0, z: -6.0 },
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 },
            w: Vec3::zero(),
        };
        let calls = Cell::new(0);
        let evaluator = |context: LoadContext, _: &RigidState| -> Result<DriverLoads, String> {
            calls.set(calls.get() + 1);
            assert_eq!(context.phase, LoadPhase::EventRefinement(AstraeaEvent::Touchdown));
            assert_eq!(context.time, 10.0);
            assert!(!context.rail_bound && !context.drogue_deployed && !context.main_deployed);
            Err("abnormal touchdown RHS refused".into())
        };
        let result = refine_crossing(&state, 10.0, 10.5, &AstraeaEvent::Touchdown,
            &Vec3 { x: 0.0, y: 0.0, z: 1.0 }, 1.0, 250.0,
            0.0, 0.0, 90.0, 0.0, snap_for_refine(true, false, false), 1.0, &evaluator, &[], true, None);
        assert_eq!(result.err().as_deref(), Some("abnormal touchdown RHS refused"));
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn telemetry_recording_is_opt_in_and_leaves_metrics_untouched() {
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        let mut o = default_opts();
        let off = simulate_flight(&v, &m, &o).unwrap();
        assert!(off.telemetry.is_empty(), "recording must default off");

        o.record_telemetry = true;
        let run = simulate_flight(&v, &m, &o).unwrap();
        assert!(run.telemetry.len() > 2, "expected a populated series");
        assert_eq!(run.telemetry[0].time, 0.0, "first sample is at t=0 on the rail");
        assert!(run.telemetry.windows(2).all(|w| w[0].time < w[1].time), "display times must strictly increase");
        assert!(
            run.telemetry.windows(2).all(|w| w[0].time == js_to_fixed(w[0].time, 3)),
            "nonterminal sample times carry the oracle's 3-decimal display rounding"
        );
        let terminal = run.telemetry.last().unwrap();
        if run.terminated {
            assert_eq!(terminal.time, run.flight_time, "terminal sample sits at the touchdown root");
            assert_eq!(terminal.altitude, 0.0);
            assert!((terminal.mass - run.landing_mass).abs() < 1e-12, "terminal mass is the landing mass");
        }
        // Recording must not perturb any metric.
        assert_eq!(run.apogee_altitude, off.apogee_altitude);
        assert_eq!(run.apogee_time, off.apogee_time);
        assert_eq!(run.flight_time, off.flight_time);
        assert_eq!(run.landing_velocity, off.landing_velocity);
        assert_eq!(run.validity, off.validity);
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
    fn drag_cd_scale_validation_exact() {
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        for bad in [0.0, -0.5, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let mut o = default_opts();
            o.drag_cd_scale = Some(bad);
            let err = simulate_flight(&v, &m, &o).unwrap_err();
            assert!(
                err.starts_with("simulate6DofFlight: dragCdScale must be a positive finite number"),
                "unexpected error for {bad}: {err}"
            );
        }
    }

    #[test]
    fn drag_cd_scale_one_equals_omitted_and_scales_airframe_drag() {
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        let omitted = simulate_flight(&v, &m, &default_opts()).unwrap();
        let mut one = default_opts();
        one.drag_cd_scale = Some(1.0);
        let explicit_one = simulate_flight(&v, &m, &one).unwrap();
        assert_eq!(omitted.apogee_altitude, explicit_one.apogee_altitude);
        assert_eq!(omitted.apogee_time, explicit_one.apogee_time);
        assert_eq!(omitted.landing_position.x, explicit_one.landing_position.x);
        assert_eq!(omitted.flight_time, explicit_one.flight_time);

        let mut heavy = default_opts();
        heavy.drag_cd_scale = Some(2.0);
        let dragged = simulate_flight(&v, &m, &heavy).unwrap();
        assert!(
            dragged.apogee_altitude < omitted.apogee_altitude,
            "2x airframe Cd must lower apogee ({} vs {})",
            dragged.apogee_altitude,
            omitted.apogee_altitude
        );
    }

    /// The scale multiplies the airframe branch only; a live canopy keeps its
    /// declared constant Cd (TS `loads.ts` §"never touched").
    #[test]
    fn drag_cd_scale_leaves_a_live_canopy_cd_untouched() {
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        // Slow descent under the main canopy, well after burnout.
        let st = RigidState {
            r: Vec3 { x: 0.0, y: 0.0, z: 200.0 },
            v: Vec3 { x: 0.0, y: 0.0, z: -6.0 },
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 },
            w: Vec3::zero(),
        };
        let canopy = |scale: f64, main: bool, drogue: bool| {
            compute_flight_loads(
                10.0, &st, drogue, main, false, 0.0, 0.0, 90.0, 0.0, &v, &m, scale,
            )
            .unwrap()
        };
        let canopy_one = canopy(1.0, true, false);
        let canopy_two = canopy(2.0, true, false);
        assert_eq!(canopy_one.drag_axial, canopy_two.drag_axial);
        let drogue_two = canopy(2.0, false, true);
        assert_eq!(canopy_one.drag_axial, drogue_two.drag_axial);

        // Airframe (no live canopy): the same state scales exactly.
        let airframe_one = canopy(1.0, false, false);
        let airframe_two = canopy(2.0, false, false);
        assert!(airframe_one.drag_axial > 0.0);
        let rel = ((airframe_two.drag_axial - 2.0 * airframe_one.drag_axial)
            / airframe_one.drag_axial)
            .abs();
        assert!(rel <= 1e-12, "airframe drag did not scale 2x (rel {rel:e})");
    }

    #[test]
    fn zero_wind_landing_parity() {
        // Oracle (bun vs TS): apogee 328.8253523345511 m, drift ~0 m,
        // flight 89.69833984375896 s, landing 3.9873074760726985 m/s.
        // Kernel parity on FROZEN inputs: `estes_alpha_vehicle()` carries the
        // drag tables TS produced before the 2026-10-11 body-friction
        // correction. The live-aero oracle (320.5894538955301 m since the fin edge drag) is
        // `ipc_flight_matches_zero_wind_alpha_c6_oracle` in src-tauri.
        // Documented tolerance: apogee <= 0.5% relative, landing drift
        // <= 5 m absolute.
        let v = estes_alpha_vehicle();
        let m = estes_c6_motor();
        let r = simulate_flight(&v, &m, &default_opts()).expect("flight must run");
        assert!(r.terminated, "flight must terminate at touchdown");
        let rel = ((r.apogee_altitude - 328.8253523345511) / 328.8253523345511).abs();
        assert!(rel <= 0.005, "apogee rel err {} exceeds 0.5%", rel);
        assert!(r.landing_distance <= 5.0, "landing drift {} exceeds 5 m abs", r.landing_distance);
        assert!(r.landing_position.x.abs() <= 5.0 && r.landing_position.y.abs() <= 5.0);
        // Pin the near-exact agreement so regressions fail loudly.
        assert!(rel < 1e-6, "apogee drifted from oracle: rel err {}", rel);
        assert!((r.flight_time - 89.69833984375896).abs() < 0.05, "flight time {}", r.flight_time);
        assert!((r.landing_velocity - 3.9873074760726985).abs() < 0.05, "landing vel {}", r.landing_velocity);
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

    /// Deterministic walk over the public recovery FSM (`detect_events`).
    /// These samples are declared synthetic test inputs, not flight evidence.
    struct RecoveryFsm {
        state: EventState,
        prev: EventSamplePair,
        events: Vec<LocalizedEvent>,
    }

    impl RecoveryFsm {
        fn newton() -> Self {
            Self {
                state: EventState {
                    has_left_rail: false,
                    has_burned_out: false,
                    is_apogee_reached: false,
                    is_main_deployed: false,
                    touched_down: false,
                    pending_apogee_time: None,
                    pending_apogee_alt: None,
                },
                prev: EventSamplePair {
                    t: 0.0,
                    altitude_along_rail: 0.0,
                    vertical_velocity: 0.0,
                    altitude: 0.0,
                },
                events: Vec::new(),
            }
        }

        /// Airborne, already past rail exit and burnout. Used to seed the two
        /// recovery flags without replaying the launch.
        fn airborne(is_main_deployed: bool, is_apogee_reached: bool) -> Self {
            Self {
                state: EventState {
                    has_left_rail: true,
                    has_burned_out: true,
                    is_apogee_reached,
                    is_main_deployed,
                    touched_down: false,
                    pending_apogee_time: None,
                    pending_apogee_alt: None,
                },
                prev: EventSamplePair {
                    t: 2.0,
                    altitude_along_rail: 3.0,
                    vertical_velocity: -4.0,
                    altitude: 20.0,
                },
                events: Vec::new(),
            }
        }

        fn step(
            &mut self,
            t: f64,
            altitude_along_rail: f64,
            vertical_velocity: f64,
            altitude: f64,
            rail_length: f64,
            burn_time: f64,
            main_deploy_alt: f64,
        ) {
            let input = EventInput {
                t,
                altitude_along_rail,
                rail_length,
                burn_time,
                vertical_velocity,
                altitude,
                main_deploy_alt,
            };
            let out = detect_events(&self.state, &self.prev, &input);
            self.state = out.state;
            self.events.extend(out.events);
            self.prev = EventSamplePair {
                t,
                altitude_along_rail,
                vertical_velocity,
                altitude,
            };
        }

        fn count(&self, name: AstraeaEvent) -> usize {
            self.events.iter().filter(|e| e.name == name).count()
        }

        fn names(&self) -> Vec<AstraeaEvent> {
            self.events.iter().map(|e| e.name).collect()
        }

        fn position(&self, name: AstraeaEvent) -> usize {
            self.events
                .iter()
                .position(|e| e.name == name)
                .unwrap_or_else(|| panic!("missing {name:?} in {:?}", self.names()))
        }

        fn time(&self, name: AstraeaEvent) -> f64 {
            let found: Vec<&LocalizedEvent> =
                self.events.iter().filter(|e| e.name == name).collect();
            assert_eq!(found.len(), 1, "expected exactly one {name:?} in {:?}", self.names());
            found[0].time
        }
    }

    /// Launch and coast to apogee (3.5 s) with a selected main-deploy altitude.
    /// No descent step is taken here; each test supplies its own.
    fn launch_to_apogee(main_deploy_alt: f64) -> RecoveryFsm {
        let mut f = RecoveryFsm::newton();
        f.step(0.25, 0.20, 4.0, 0.10, 0.50, 0.80, main_deploy_alt);
        f.step(0.50, 0.60, 12.0, 0.60, 0.50, 0.80, main_deploy_alt); // rail exit 0.4375
        f.step(1.00, 1.20, 20.0, 2.00, 0.50, 0.80, main_deploy_alt); // burnout 0.8
        f.step(2.00, 2.00, 8.0, 14.0, 0.50, 0.80, main_deploy_alt);
        f.step(3.00, 2.50, 2.0, 23.0, 0.50, 0.80, main_deploy_alt);
        f.step(4.00, 3.00, -2.0, 25.0, 0.50, 0.80, main_deploy_alt); // apogee 3.5
        f
    }

    #[test]
    fn recovery_sequence_nominal_orders_drogue_before_main_and_touchdown() {
        use AstraeaEvent::*;
        let mut f = launch_to_apogee(10.0);
        assert_eq!(f.count(ApogeeDrogue), 1);
        assert_eq!(f.count(MainDeploy), 0, "main is below the apogee altitude");
        f.step(5.00, 3.20, -6.0, 18.0, 0.50, 0.80, 10.0);
        f.step(6.00, 3.30, -9.0, 9.0, 0.50, 0.80, 10.0); // main threshold crossing
        f.step(7.00, 3.40, -9.0, -1.0, 0.50, 0.80, 10.0); // touchdown
        assert_eq!(f.count(ApogeeDrogue), 1);
        assert_eq!(f.count(MainDeploy), 1);
        assert_eq!(f.count(Touchdown), 1);
        assert!(f.position(ApogeeDrogue) < f.position(MainDeploy), "{:?}", f.names());
        assert!(f.position(MainDeploy) < f.position(Touchdown), "{:?}", f.names());
        assert!(f.time(ApogeeDrogue) < f.time(MainDeploy));
        assert!(f.time(MainDeploy) < f.time(Touchdown));
        assert!(f.state.is_apogee_reached && f.state.is_main_deployed && f.state.touched_down);
    }

    #[test]
    fn recovery_sequence_main_deploys_at_apogee_when_threshold_is_above_apogee() {
        use AstraeaEvent::*;
        let f = launch_to_apogee(30.0);
        assert_eq!(f.count(ApogeeDrogue), 1);
        assert_eq!(f.count(MainDeploy), 1);
        assert!(f.position(ApogeeDrogue) < f.position(MainDeploy), "{:?}", f.names());
        assert_eq!(f.time(ApogeeDrogue), f.time(MainDeploy));
        assert!(!f.state.touched_down);
    }

    #[test]
    fn recovery_sequence_delayed_main_crossing_precedes_touchdown() {
        use AstraeaEvent::*;
        let mut f = launch_to_apogee(2.0);
        assert_eq!(f.count(MainDeploy), 0);
        f.step(4.50, 3.02, -6.0, 5.0, 0.50, 0.80, 2.0);
        f.step(5.50, 3.10, -9.0, -1.0, 0.50, 0.80, 2.0);
        assert_eq!(f.count(MainDeploy), 1);
        assert_eq!(f.count(Touchdown), 1);
        assert!(f.time(MainDeploy) > f.time(ApogeeDrogue));
        assert!(f.time(MainDeploy) < f.time(Touchdown));
        assert!(f.position(MainDeploy) < f.position(Touchdown), "{:?}", f.names());
        assert!(f.time(MainDeploy) - f.time(ApogeeDrogue) > 0.5, "main is not the apogee deployment");
    }

    #[test]
    fn recovery_sequence_failed_main_trigger_is_forced_at_touchdown() {
        use AstraeaEvent::*;
        let mut f = launch_to_apogee(-5.0); // threshold below the pad datum: never crossed
        assert_eq!(f.count(MainDeploy), 0);
        f.step(4.50, 3.02, -6.0, 5.0, 0.50, 0.80, -5.0);
        f.step(5.50, 3.10, -9.0, -1.0, 0.50, 0.80, -5.0);
        assert_eq!(f.count(MainDeploy), 1, "the failed trigger must force the main at touchdown");
        assert_eq!(f.count(Touchdown), 1);
        assert_eq!(f.time(MainDeploy), f.time(Touchdown));
        assert!(f.position(MainDeploy) < f.position(Touchdown), "{:?}", f.names());
        assert!(f.state.touched_down && f.state.is_main_deployed);
    }

    #[test]
    fn recovery_sequence_seeded_main_deployed_suppresses_duplicate_deploy() {
        use AstraeaEvent::*;
        let mut f = RecoveryFsm::airborne(true, true);
        f.step(3.00, 3.20, -9.0, 9.0, 0.50, 0.80, 10.0); // threshold crossing
        assert_eq!(f.count(MainDeploy), 0, "already deployed must not emit a second event");
        f.step(4.00, 3.30, -9.0, -1.0, 0.50, 0.80, 10.0);
        assert_eq!(f.count(MainDeploy), 0);
        assert_eq!(f.count(Touchdown), 1);
        assert!(f.state.touched_down);
    }

    #[test]
    fn recovery_sequence_seeded_apogee_reached_suppresses_duplicate_drogue() {
        use AstraeaEvent::*;
        let mut f = RecoveryFsm::airborne(false, true);
        f.step(3.00, 3.20, -9.0, 9.0, 0.50, 0.80, 10.0);
        assert_eq!(f.count(ApogeeDrogue), 0, "the seeded apogee must not be re-emitted");
        assert_eq!(f.count(MainDeploy), 1, "a seeded apogee still permits the main event");
        assert!(f.time(MainDeploy) < 3.0);
    }

    #[test]
    fn recovery_sequence_main_cannot_deploy_before_apogee() {
        use AstraeaEvent::*;
        let mut f = RecoveryFsm::airborne(false, false);
        f.step(3.00, 3.20, -4.0, 2.0, 0.50, 0.80, 10.0); // descending 10 m crossing
        assert_eq!(f.count(MainDeploy), 0, "main cannot deploy before the apogee/drogue event");
        assert_eq!(f.count(ApogeeDrogue), 0);
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

#[cfg(test)]
mod signed_normal_tests {
    use super::*;

    fn sums(b: f64, jb: f64, f: f64, jf: f64) -> Vehicle {
        let mut v = estes_alpha_vehicle();
        v.cna_body = b; v.body_first_moment = jb;
        v.cna_fins = f; v.fin_first_moment = jf;
        v.body_abs_cna = b.abs(); v.fin_abs_cna = f.abs();
        v
    }

    #[test]
    fn zero_or_negative_group_retains_its_first_moment() {
        for (b, jb, expected_c, expected_j) in [(0.0, -2.0, 4.0, 10.0), (-2.0, -3.0, 2.0, 9.0)] {
            let v = sums(b, jb, 4.0, 12.0);
            let (c, cp, j) = normal_slope_at_mach(0.3, &v).unwrap();
            assert_eq!(c, expected_c); assert_eq!(j, expected_j);
            assert_eq!(cp, j / c);
            let mut shifted = v.clone();
            let x_ref = 0.7;
            shifted.body_first_moment -= x_ref * b;
            shifted.fin_first_moment -= x_ref * 4.0;
            let (_, cp_ref, j_ref) = normal_slope_at_mach(0.3, &shifted).unwrap();
            assert!((j_ref - (j - x_ref * c)).abs() < 1e-14);
            assert!((cp_ref - (cp - x_ref)).abs() < 1e-14);
        }
    }

    #[test]
    fn total_floor_cancellation_and_nonfinite_policies_precede_cp_division() {
        let floor = NORMAL_SLOPE_SUPPORT_FLOOR;
        assert!(normal_slope_at_mach(0.0, &sums(floor, floor, 0.0, 0.0)).is_ok());
        for c in [f64::from_bits(floor.to_bits() - 1), 0.0, -1.0] {
            assert!(normal_slope_at_mach(0.0, &sums(c, 1.0, 0.0, 0.0)).unwrap_err().contains("unsupported total"));
        }
        let mut v = sums(0.0, -2.0, 1.0, 3.0);
        // Relative bound is exactly 1 here; equality rejects. A smaller scale passes.
        v.body_abs_cna = 2.0f64.powi(46) - 1.0;
        assert!(normal_slope_at_mach(0.0, &v).is_err());
        v.body_abs_cna = 2.0f64.powi(45) - 1.0;
        assert!(normal_slope_at_mach(0.0, &v).is_ok());
        v.body_first_moment = f64::NAN;
        assert!(normal_slope_at_mach(0.0, &v).is_err());
        assert!(normal_slope_at_mach(0.0, &sums(floor, f64::MAX, 0.0, 0.0)).unwrap_err().contains("derived CP"));
        // A valid positive total at low Mach may leave support after fin degradation.
        let v = sums(-2.0, -1.0, 4.0, 12.0);
        assert!(normal_slope_at_mach(0.0, &v).is_ok());
        assert!(normal_slope_at_mach(4.0, &v).is_err());
    }

    #[test]
    fn actual_loads_preserve_pitch_yaw_signs_and_static_damping_decomposition() {
        let v = sums(-2.0, -0.2, 12.0, 5.0);
        let motor = estes_c6_motor();
        for sign in [-1.0, 1.0] {
            for pitch_plane in [true, false] {
                let lateral = sign * 10.0;
                let state = RigidState { r: Vec3::zero(),
                    v: Vec3 { x: if pitch_plane {0.0} else {lateral}, y:100.0, z:if pitch_plane {lateral} else {0.0} },
                    q: Quat {w:1.0,x:0.0,y:0.0,z:0.0}, w:Vec3 {x:0.2,y:0.3,z:-0.1} };
                let d = diagnose_flight_loads(3.0,&state,false,false,false,0.0,0.0,0.0,0.0,&v,&motor,1.0).unwrap();
                let force = if pitch_plane {d.aero_force_body.z} else {d.aero_force_body.x};
                assert!(force * sign < 0.0);
                let expected = if pitch_plane {-(d.cp-d.combined_cg)*force} else {(d.cp-d.combined_cg)*force};
                let got = if pitch_plane {d.static_moment_body.x} else {d.static_moment_body.z};
                assert!((got-expected).abs() < 1e-12);
                assert!((d.total_moment_body.x-d.static_moment_body.x-d.damping_moment_body.x).abs()<1e-12);
                assert!((d.total_moment_body.z-d.static_moment_body.z-d.damping_moment_body.z).abs()<1e-12);
            }
        }
    }

    #[test]
    fn undefined_normal_station_propagates_through_actual_integrator() {
        let v = sums(0.0, 1.0, 0.0, -1.0);
        let err = simulate_flight(&v, &estes_c6_motor(), &SixDofOptions::default()).unwrap_err();
        assert!(err.contains("unsupported total CNalpha"), "{err}");
    }
}

/// RMP09-C01 analytic invariants of the legacy primitive mass/inertia model
/// (`legacy-primitive-mass-inertia/1.0.0`): declared inputs only, no measured
/// inertia. Checks the shared assembly against independent formulas.
#[cfg(test)]
mod mechanics_invariant_tests {
    use super::*;

    fn triangle_motor() -> MotorSpec {
        let mut m = estes_c6_motor();
        m.burn_time = 2.0;
        m.total_mass = 0.03; m.dry_mass = 0.02; m.propellant_mass = 0.01;
        m.max_thrust = 10.0;
        m.thrust_curve = vec![ThrustPoint { time: 0.0, thrust: 0.0 },
            ThrustPoint { time: 1.0, thrust: 10.0 }, ThrustPoint { time: 2.0, thrust: 0.0 }];
        validate_motor_spec(&m).unwrap();
        m
    }

    fn at(t: f64, vehicle: &Vehicle, motor: &MotorSpec) -> StageMechanics {
        let st = RigidState { r: Vec3::zero(), v: Vec3 { x: 0.0, y: 5.0, z: 0.0 },
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        stage_mechanics(t, &st, 0.0, 0.0, 0.0, vehicle, motor)
    }

    fn rel(a: f64, b: f64) -> f64 { (a - b).abs() / b.abs().max(1e-300) }

    #[test]
    fn depletion_limits_are_wet_then_dry_with_zero_rates_outside_the_burn() {
        let (v, m) = (estes_alpha_vehicle(), triangle_motor());
        for t in [-1.0, 0.0] {
            assert_eq!(at(t, &v, &m).mass, v.dry_mass + m.total_mass);
        }
        for t in [2.0, 2.5, 100.0] {
            let s = at(t, &v, &m);
            assert_eq!(s.mass, v.dry_mass + m.dry_mass);
            assert_eq!((s.inertia_dot_b.x, s.inertia_dot_b.y, s.inertia_dot_b.z), (0.0, 0.0, 0.0));
        }
        // Before ignition the motor delivers nothing: zero mass flow and rates.
        let s = at(-1.0, &v, &m);
        assert_eq!((s.inertia_dot_b.x, s.inertia_dot_b.y), (0.0, 0.0));
    }

    #[test]
    fn mass_inertia_and_cg_stay_physical_and_monotone_through_the_burn() {
        let (v, m) = (estes_alpha_vehicle(), triangle_motor());
        let x_mot = v.motor_aft_station_from_nose - m.length / 2.0;
        let (lo, hi) = (v.cg_from_nose.min(x_mot), v.cg_from_nose.max(x_mot));
        let mut previous = f64::INFINITY;
        for i in 0..=200 {
            let t = 2.0 * i as f64 / 200.0;
            let s = at(t, &v, &m);
            for value in [s.mass, s.inertia_b.x, s.inertia_b.y, s.inertia_b.z] {
                assert!(value.is_finite() && value > 0.0, "t={t}: {value}");
            }
            assert!(s.mass <= previous, "mass must not increase: t={t}");
            previous = s.mass;
            assert!(s.cg_from_nose >= lo && s.cg_from_nose <= hi, "t={t}: cg {} outside [{lo}, {hi}]", s.cg_from_nose);
            assert!(s.cg_from_nose > 0.0 && s.cg_from_nose < v.total_length);
            // Body frame {pitch, roll, yaw}: axisymmetric pitch == yaw (so the
            // x/z slot labels are physically indistinguishable); a slender body
            // rolls far more easily than it pitches.
            assert_eq!(s.inertia_b.x, s.inertia_b.z);
            assert!(s.inertia_b.y < s.inertia_b.x);
        }
    }

    #[test]
    fn pitch_inertia_obeys_the_parallel_axis_theorem_about_the_nose() {
        let (v, m) = (estes_alpha_vehicle(), triangle_motor());
        let x_mot = v.motor_aft_station_from_nose - m.length / 2.0;
        let (r_m, r_b) = (m.diameter / 2.0, v.ref_diameter / 2.0);
        for t in [0.0, 0.3, 1.0, 1.7, 2.0] {
            let s = at(t, &v, &m);
            let m_mot = s.mass - v.dry_mass;
            // Independent route: about the nose, then shift to the combined CG.
            let i_dry_c = v.dry_mass * (3.0 * r_b * r_b + v.total_length * v.total_length) / 12.0;
            let i_mot_c = m_mot * (3.0 * r_m * r_m + m.length * m.length) / 12.0;
            let i_nose = i_dry_c + v.dry_mass * v.cg_from_nose * v.cg_from_nose + i_mot_c + m_mot * x_mot * x_mot;
            let x_c = (v.dry_mass * v.cg_from_nose + m_mot * x_mot) / s.mass;
            assert!(rel(s.inertia_b.x, i_nose - s.mass * x_c * x_c) < 1e-10, "t={t}");
            assert!(rel(s.cg_from_nose, x_c) < 1e-14, "t={t}");
            let i_roll = 0.5 * v.dry_mass * r_b * r_b + 0.5 * m_mot * r_m * r_m;
            assert!(rel(s.inertia_b.y, i_roll) < 1e-14, "t={t}");
        }
    }

    #[test]
    fn reported_inertia_rates_match_finite_differences_of_the_inertia() {
        let (v, m) = (estes_alpha_vehicle(), triangle_motor());
        let h = 1e-6;
        // Interior points away from the thrust-curve knots (0, 1, 2 s).
        for t in [0.25, 0.6, 1.4, 1.8] {
            let (a, b, s) = (at(t - h, &v, &m), at(t + h, &v, &m), at(t, &v, &m));
            let d_pitch = (b.inertia_b.x - a.inertia_b.x) / (2.0 * h);
            let d_roll = (b.inertia_b.y - a.inertia_b.y) / (2.0 * h);
            let d_mass = (b.mass - a.mass) / (2.0 * h);
            assert!(rel(s.inertia_dot_b.x, d_pitch) < 1e-5, "t={t}: {} vs {d_pitch}", s.inertia_dot_b.x);
            assert!(rel(s.inertia_dot_b.y, d_roll) < 1e-5, "t={t}: {} vs {d_roll}", s.inertia_dot_b.y);
            assert_eq!(s.inertia_dot_b.x, s.inertia_dot_b.z);
            assert!(rel(motor_mass_flow_at(&m, t), d_mass) < 1e-5 && motor_mass_flow_at(&m, t) < 0.0, "t={t}");
        }
    }

    #[test]
    fn body_mass_properties_do_not_depend_on_attitude() {
        let (v, m) = (estes_alpha_vehicle(), triangle_motor());
        let n = (0.9f64 * 0.9 + 0.3 * 0.3 + 0.2 * 0.2 + 0.1 * 0.1).sqrt();
        let tilted = RigidState { r: Vec3::zero(), v: Vec3 { x: 1.0, y: 5.0, z: -2.0 },
            q: Quat { w: 0.9 / n, x: 0.3 / n, y: 0.2 / n, z: 0.1 / n }, w: Vec3 { x: 0.4, y: -0.2, z: 0.1 } };
        for t in [0.0, 0.7, 1.5, 2.0] {
            let (a, b) = (at(t, &v, &m), stage_mechanics(t, &tilted, 0.0, 0.0, 0.0, &v, &m));
            assert_eq!((a.mass, a.cg_from_nose), (b.mass, b.cg_from_nose));
            assert_eq!((a.inertia_b.x, a.inertia_b.y, a.inertia_b.z), (b.inertia_b.x, b.inertia_b.y, b.inertia_b.z));
            assert_eq!((a.inertia_dot_b.x, a.inertia_dot_b.y, a.inertia_dot_b.z), (b.inertia_dot_b.x, b.inertia_dot_b.y, b.inertia_dot_b.z));
        }
    }

    #[test]
    fn a_motor_outside_the_carrier_is_refused_not_clamped() {
        let (mut v, m) = (estes_alpha_vehicle(), triangle_motor());
        v.motor_aft_station_from_nose = m.length * 0.5;
        let Err(err) = std::panic::catch_unwind(|| at(0.0, &v, &m)) else { panic!("a motor outside the vehicle must be refused") };
        let text = err.downcast_ref::<String>().cloned().unwrap_or_default();
        assert!(text.contains("lies outside the vehicle"), "{text}");
    }
}

/// Presentation Euler convention (`attitude-euler/1.0.0`): `R_NB = Rz(yaw) *
/// Rx(pitch) * Ry(roll)`. These tests exercise the corrected formulas at full
/// precision, independent of the 0.1 deg display rounding.
#[cfg(test)]
mod attitude_presentation_tests {
    use super::*;

    fn quat_mul(a: &Quat, b: &Quat) -> Quat {
        Quat {
            w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
            x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        }
    }

    fn axis_angle(axis: Vec3, deg: f64) -> Quat {
        let half = deg * PI / 360.0;
        let s = half.sin();
        Quat { w: half.cos(), x: axis.x * s, y: axis.y * s, z: axis.z * s }
    }

    /// `q = qz(yaw) * qx(pitch) * qy(roll)`, matching `R = Rz * Rx * Ry`.
    fn compose(pitch_deg: f64, roll_deg: f64, yaw_deg: f64) -> Quat {
        let qx = axis_angle(Vec3 { x: 1.0, y: 0.0, z: 0.0 }, pitch_deg);
        let qy = axis_angle(Vec3 { x: 0.0, y: 1.0, z: 0.0 }, roll_deg);
        let qz = axis_angle(Vec3 { x: 0.0, y: 0.0, z: 1.0 }, yaw_deg);
        quat_mul(&qz, &quat_mul(&qx, &qy))
    }

    fn axis_matrix(axis: usize, deg: f64) -> [[f64; 3]; 3] {
        let a = deg * PI / 180.0;
        let (c, s) = (a.cos(), a.sin());
        match axis {
            0 => [[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]],
            1 => [[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]],
            _ => [[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]],
        }
    }

    fn mat_mul(a: [[f64; 3]; 3], b: [[f64; 3]; 3]) -> [[f64; 3]; 3] {
        let mut out = [[0.0; 3]; 3];
        for i in 0..3 {
            for j in 0..3 {
                out[i][j] = (0..3).map(|k| a[i][k] * b[k][j]).sum();
            }
        }
        out
    }

    fn recompose(pitch_deg: f64, roll_deg: f64, yaw_deg: f64) -> [[f64; 3]; 3] {
        mat_mul(axis_matrix(2, yaw_deg), mat_mul(axis_matrix(0, pitch_deg), axis_matrix(1, roll_deg)))
    }

    fn matrix_gap(a: [[f64; 3]; 3], b: [[f64; 3]; 3]) -> f64 {
        let mut m = 0.0f64;
        for i in 0..3 { for j in 0..3 { m = m.max((a[i][j] - b[i][j]).abs()); } }
        m
    }

    fn angle_gap(got: f64, want: f64) -> f64 {
        (((got - want + 180.0).rem_euclid(360.0)) - 180.0).abs()
    }

    fn assert_angles(q: &Quat, pitch: f64, roll: f64, yaw: f64, tol_deg: f64) {
        let got = quaternion_to_euler_deg(q);
        assert!(angle_gap(got.0, pitch) <= tol_deg, "pitch {} vs {pitch}", got.0);
        assert!(angle_gap(got.1, roll) <= tol_deg, "roll {} vs {roll}", got.1);
        assert!(angle_gap(got.2, yaw) <= tol_deg, "yaw {} vs {yaw}", got.2);
    }

    #[test]
    fn composed_attitudes_recover_at_full_precision() {
        // All three axes non-degenerate: the shipped sign-swapped forms fail by
        // degrees here; the corrected forms are exact to roundoff.
        for (pitch, roll, yaw) in [
            (23.4, -37.2, 41.5),
            (17.19, 11.46, 28.65),
            (60.0, 5.0, -120.0),
            (-45.0, 80.0, 15.0),
            (5.0, -170.0, 179.0),
        ] {
            let q = compose(pitch, roll, yaw);
            assert_angles(&q, pitch, roll, yaw, 1e-9);
            assert!(matrix_gap(recompose(pitch, roll, yaw), quaternion_to_matrix(&q)) <= 1e-12);
        }
    }

    #[test]
    fn pure_axis_attitudes_stay_unmixed() {
        for d in [0.0, 10.0, 45.0, 89.0] {
            assert_angles(&compose(d, 0.0, 0.0), d, 0.0, 0.0, 1e-9);
        }
        for d in [10.0, 89.0, 91.0, 135.0, 179.0, -100.0] {
            assert_angles(&compose(0.0, d, 0.0), 0.0, d, 0.0, 1e-9);
        }
        for d in [10.0, 89.0, 179.0, -100.0] {
            assert_angles(&compose(0.0, 0.0, d), 0.0, 0.0, d, 1e-9);
        }
    }

    /// The sim's only commanded attitude: the initial body +Y is the rail
    /// vector, so the display must read pitch = rail elevation and
    /// yaw = -rail azimuth (positive yaw turns North toward West about +Z).
    fn rail_initial_q(elevation_deg: f64, azimuth_deg: f64) -> Quat {
        let el = elevation_deg * PI / 180.0;
        let az = azimuth_deg * PI / 180.0;
        let rail = Vec3 { x: el.cos() * az.sin(), y: el.cos() * az.cos(), z: el.sin() };
        let dot_y = rail.y;
        if dot_y >= 0.9999 { return Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }; }
        let (rx, rz) = (rail.z, -rail.x);
        let len = (rx * rx + rz * rz).sqrt();
        if len <= 1e-6 { return Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }; }
        let angle = dot_y.max(-1.0).min(1.0).acos();
        let sh = (angle / 2.0).sin();
        Quat { w: (angle / 2.0).cos(), x: rx / len * sh, y: 0.0, z: rz / len * sh }
    }

    #[test]
    fn rail_attitude_reads_elevation_and_minus_azimuth() {
        for el in [70.0, 85.0, 89.0] {
            for az in [-135.0, -30.0, 0.0, 45.0, 179.0] {
                let q = rail_initial_q(el, az);
                let got = quaternion_to_euler_deg(&q);
                // pitch/yaw are the analytic rail invariants; roll is the
                // minimal-rotation twist and is checked by recomposition plus
                // the rounded end-to-end sample below.
                assert!(angle_gap(got.0, el) <= 1e-9, "pitch {} vs {el}", got.0);
                assert!(angle_gap(got.2, -az) <= 1e-9, "yaw {} vs {}", got.2, -az);
                assert!(matrix_gap(recompose(got.0, got.1, got.2), quaternion_to_matrix(&q)) <= 1e-9);
            }
        }
        // The real consumer path: the first display sample is the initial
        // attitude, rounded as the wire carries it.
        let mut options = SixDofOptions::default();
        options.rail_elevation_deg = Some(85.0);
        options.rail_azimuth_deg = Some(30.0);
        options.wind_speed_surface = Some(0.0);
        options.record_telemetry = true;
        let run = simulate_flight(&estes_alpha_vehicle(), &estes_c6_motor(), &options).expect("flight");
        let first = run.telemetry.first().expect("first display sample");
        assert_eq!((first.pitch_deg, first.roll_deg, first.yaw_deg), (85.0, 27.6, -30.0));
    }

    #[test]
    fn quaternion_and_negative_quaternion_agree() {
        for (pitch, roll, yaw) in [(23.4, -37.2, 41.5), (0.0, 90.0, 0.0), (-10.0, 0.0, 170.0)] {
            let q = compose(pitch, roll, yaw);
            let nq = Quat { w: -q.w, x: -q.x, y: -q.y, z: -q.z };
            assert_eq!(quaternion_to_euler_deg(&q), quaternion_to_euler_deg(&nq));
        }
    }

    #[test]
    fn gimbal_lock_gauge_reconstructs_the_attitude() {
        for sign in [1.0, -1.0] {
            for (roll, yaw) in [(0.0, 0.0), (30.0, 40.0), (-70.0, 160.0), (120.0, -45.0)] {
                let q = compose(sign * 90.0, roll, yaw);
                let (pitch, r, y) = quaternion_to_euler_deg(&q);
                // Documented gauge: pitch snapped to +/-90, roll pinned to 0,
                // yaw carries the combined z-rotation (yaw + roll at +90,
                // yaw - roll at -90). The pair is a gauge, not a physical
                // roll/yaw split; the triple still reconstructs R.
                assert_eq!(pitch, sign * 90.0);
                assert_eq!(r, 0.0);
                let expected = if sign > 0.0 { yaw + roll } else { yaw - roll };
                assert!(angle_gap(y, expected) <= 1e-9, "yaw {y} vs {expected}");
                assert!(matrix_gap(recompose(pitch, r, y), quaternion_to_matrix(&q)) <= 1e-9);
            }
        }
        // Just outside the gauge band the ordinary formulas are used and the
        // split is resolved (no snap).
        let q = compose(89.99, 30.0, 40.0);
        assert_angles(&q, 89.99, 30.0, 40.0, 1e-9);
    }

    #[test]
    fn random_full_range_attitudes_recompose() {
        let mut state: u64 = 0x9e37_79b9_7f4a_7c15;
        let mut next = || {
            state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            ((state >> 11) as f64) / ((1u64 << 53) as f64)
        };
        let mut checked = 0;
        while checked < 500 {
            let pitch = next() * 358.0 - 179.0;
            let roll = next() * 358.0 - 179.0;
            let yaw = next() * 358.0 - 179.0;
            let q = compose(pitch, roll, yaw);
            let (w, x, y, z) = (q.w, q.x, q.y, q.z);
            let cos_pair = (2.0 * (w * y - z * x)).hypot(1.0 - 2.0 * (x * x + y * y));
            assert!(cos_pair.is_finite());
            if cos_pair <= 1e-6 {
                // Near-lock split conditioning is documented and covered by
                // the gauge/lock test; this test covers the resolved domain.
                continue;
            }
            checked += 1;
            let got = quaternion_to_euler_deg(&q);
            assert!(matrix_gap(recompose(got.0, got.1, got.2), quaternion_to_matrix(&q)) <= 1e-9);
            assert!(got.0.abs() <= 90.0 + 1e-12);
            assert!(got.1 > -180.0 - 1e-9 && got.1 <= 180.0 + 1e-9);
            assert!(got.2 > -180.0 - 1e-9 && got.2 <= 180.0 + 1e-9);
        }
    }

    #[test]
    fn clamp_guards_roundoff_and_non_unit_input_stays_finite() {
        // Unit pitch 90 returns exactly 90 (the asin argument is 1).
        let (pitch, _, _) = quaternion_to_euler_deg(&compose(90.0, 0.0, 0.0));
        assert_eq!(pitch, 90.0);
        // A marginal overshoot only clamps the asin argument; it cannot turn a
        // real sub-vertical pitch into 90 (gauge band is ~5.7e-7 deg).
        let (pitch, _, _) = quaternion_to_euler_deg(&compose(89.999, 0.0, 0.0));
        assert!((pitch - 89.999).abs() <= 1e-9);
        // Non-unit input is not part of the contract, but the guard must not
        // produce NaN/infinity.
        let q = compose(89.9999999, 0.0, 0.0);
        let scaled = Quat { w: q.w * (1.0 + 1e-9), x: q.x * (1.0 + 1e-9), y: q.y, z: q.z };
        let got = quaternion_to_euler_deg(&scaled);
        assert!(got.0.is_finite() && got.1.is_finite() && got.2.is_finite());
    }
}

#[cfg(test)]
mod published_normal_tests {
    use super::*;

    fn fixture(boattail_lift: BoattailLift) -> Vehicle {
        let mut v = estes_alpha_vehicle();
        v.cna_body = 1.2;
        v.body_first_moment = 1.2 * 1.0;
        v.body_abs_cna = 2.0;
        v.cna_fins = 7.0;
        v.fin_first_moment = 7.0 * 3.5;
        v.fin_abs_cna = 7.0;
        v.supersonic_normal = Some(SupersonicNormal {
            fin_sets: vec![FinNormalSet {
                cna_per_rad: 7.0,
                cp_station_m: 3.5,
                aspect_ratio: 1.5,
                leading_edge_cos: 0.8,
            }],
            body_positive_cna: 2.0,
            body_positive_moment: 2.0 * 0.8,
            body_positive_abs_cna: 2.0,
            body_attached_cna: 1.2,
            body_attached_moment: 1.2 * -2.0,
            body_attached_abs_cna: 2.0,
            boattail_lift,
        });
        v
    }

    fn legacy(vehicle: &Vehicle) -> Vehicle {
        let mut v = vehicle.clone();
        v.supersonic_normal = None;
        v
    }

    #[test]
    fn subsonic_domain_is_bit_identical_to_the_legacy_expression() {
        let new = fixture(BoattailLift::Suppressed);
        let old = legacy(&new);
        for k in 0..=80 {
            let mach = k as f64 * 0.01;
            let (c_new, cp_new, j_new) = flight_normal_at_mach(mach, &new).unwrap();
            let (c_old, cp_old, j_old) = flight_normal_at_mach(mach, &old).unwrap();
            assert_eq!(c_new.to_bits(), c_old.to_bits(), "cna at M{mach}");
            assert_eq!(cp_new.to_bits(), cp_old.to_bits(), "cp at M{mach}");
            assert_eq!(j_new.to_bits(), j_old.to_bits(), "moment at M{mach}");
        }
    }

    #[test]
    fn value_is_continuous_at_both_blend_boundaries() {
        let v = fixture(BoattailLift::Suppressed);
        for boundary in [NORMAL_LEGACY_FULL_MACH, NORMAL_SUPERSONIC_FULL_MACH] {
            let d = 1e-9;
            let (c0, cp0, j0) = flight_normal_at_mach(boundary - d, &v).unwrap();
            let (c1, cp1, j1) = flight_normal_at_mach(boundary + d, &v).unwrap();
            // Value continuity only; with a C1 join the difference scales
            // with the step and the one-sided slope, so this is a bound, not
            // a bit-equality claim.
            assert!((c1 - c0).abs() < 1e-5, "cna jump at {boundary}: {} {}", c0, c1);
            assert!((cp1 - cp0).abs() < 1e-6, "cp jump at {boundary}: {} {}", cp0, cp1);
            assert!((j1 - j0).abs() < 1e-4, "moment jump at {boundary}");
        }
    }

    #[test]
    fn blend_is_c1_at_both_joins() {
        let v = fixture(BoattailLift::Suppressed);
        for boundary in [NORMAL_LEGACY_FULL_MACH, NORMAL_SUPERSONIC_FULL_MACH] {
            let h = 1e-6;
            let f = |m: f64| flight_normal_at_mach(m, &v).unwrap();
            let (c0, cp0, j0) = f(boundary);
            let (cm, cpm, jm) = f(boundary - h);
            let (c1, cp1, j1) = f(boundary + h);
            let dl_c = (c0 - cm) / h;
            let dr_c = (c1 - c0) / h;
            let dl_cp = (cp0 - cpm) / h;
            let dr_cp = (cp1 - cp0) / h;
            let dl_j = (j0 - jm) / h;
            let dr_j = (j1 - j0) / h;
            // At 0.8 both analytic derivatives are zero; the finite
            // difference carries O(h) curvature truncation, so use absolute
            // bounds. At 1.2 the exterior slope is nonzero; use a relative
            // bound (a genuine kink is order 1, not 1e-2).
            let at_left_join = (boundary - NORMAL_LEGACY_FULL_MACH).abs() < 1e-12;
            let (c_tol, cp_tol, j_tol, rel) = if at_left_join {
                (1e-2, 1e-3, 1e-2, false)
            } else {
                (1e-2, 1e-3, 1e-2, true)
            };
            let c_bound = if rel { c_tol * dr_c.abs().max(1.0) } else { c_tol };
            let cp_bound = if rel { cp_tol * dr_cp.abs().max(1e-3) } else { cp_tol };
            let j_bound = if rel { j_tol * dr_j.abs().max(1.0) } else { j_tol };
            assert!(
                (dl_c - dr_c).abs() <= c_bound,
                "dC/dM kink at {boundary}: {dl_c} vs {dr_c}"
            );
            assert!(
                (dl_cp - dr_cp).abs() <= cp_bound,
                "dCP/dM kink at {boundary}: {dl_cp} vs {dr_cp}"
            );
            assert!(
                (dl_j - dr_j).abs() <= j_bound,
                "dJ/dM kink at {boundary}: {dl_j} vs {dr_j}"
            );
        }
    }

    #[test]
    fn swept_sonic_endpoint_stays_finite() {
        // cos = 1/1.2 makes Mn = 1 exactly at the blend's right join, where
        // the exterior law has a square-root cusp. The documented one-sided
        // secant must keep the blend finite and deterministic.
        let mut v = fixture(BoattailLift::Suppressed);
        if let Some(p) = v.supersonic_normal.as_mut() {
            p.fin_sets[0].leading_edge_cos = 1.0 / NORMAL_SUPERSONIC_FULL_MACH;
        }
        let slope = crate::aero::published_fin_lift_slope_ratio_derivative(
            NORMAL_SUPERSONIC_FULL_MACH,
            1.5,
            1.0 / NORMAL_SUPERSONIC_FULL_MACH,
        );
        assert!(slope.is_finite(), "cusp slope {slope}");
        for m in [1.19, 1.2, 1.21] {
            let (c, cp, j) = flight_normal_at_mach(m, &v).unwrap();
            assert!(c.is_finite() && cp.is_finite() && j.is_finite(), "M{m}");
        }
    }

    #[test]
    fn blend_endpoints_match_the_supersonic_groups_at_one_point_two() {
        let v = fixture(BoattailLift::Suppressed);
        let (c12, cp12, _) = flight_normal_at_mach(NORMAL_SUPERSONIC_FULL_MACH, &v).unwrap();
        let r12 = crate::aero::published_fin_lift_slope_ratio(1.2, 1.5, 0.8);
        let expected_c = 2.0 + 7.0 * r12;
        let expected_cp = (2.0 * 0.8 + 7.0 * r12 * 3.5) / expected_c;
        assert!((c12 - expected_c).abs() < 1e-12);
        assert!((cp12 - expected_cp).abs() < 1e-12);
    }

    #[test]
    fn published_fin_ratio_has_the_theory_limits() {
        // Infinite aspect ratio recovers Ackeret 4/beta over the incompressible
        // slope 2*pi; finite span reduces it.
        let m: f64 = 3.0;
        let beta = (m * m - 1.0).sqrt();
        let two_d = 4.0 / beta / (2.0 * std::f64::consts::PI);
        let wide = crate::aero::published_fin_lift_slope_ratio(m, 1.0e9, 1.0);
        assert!((wide - two_d).abs() < 1e-9, "{wide} vs {two_d}");
        let finite = crate::aero::published_fin_lift_slope_ratio(m, 1.5, 1.0);
        // The finite-span incompressible slope is lower, so the *ratio* is
        // higher than the 2D Ackeret/thin-airfoil ratio while the absolute
        // finite-span slope stays below the 2D Ackeret slope.
        assert!(finite > two_d && finite < 1.0);
        let finite_slope = 4.0 / (beta + 4.0 / (std::f64::consts::PI * 1.5));
        assert!(finite_slope < 4.0 / beta);
        // Both branches meet at pi*AR at Mn=1: ratio = 2 for AR=2.
        let at_sonic = crate::aero::published_fin_lift_slope_ratio(1.0, 2.0, 1.0);
        assert!((at_sonic - 2.0).abs() < 1e-12, "{at_sonic}");
        // Sweep lowers the normal Mach, so a swept fin keeps more slope.
        let swept = crate::aero::published_fin_lift_slope_ratio(2.0, 1.5, 0.5);
        let unswept = crate::aero::published_fin_lift_slope_ratio(2.0, 1.5, 1.0);
        assert!(swept > unswept);
    }

    #[test]
    fn boattail_parameter_is_the_only_difference_between_the_two_arms() {
        let suppressed = fixture(BoattailLift::Suppressed);
        let attached = fixture(BoattailLift::Attached);
        for mach in [1.25, 2.0, 3.5] {
            let (cs, cps, _) = flight_normal_at_mach(mach, &suppressed).unwrap();
            let (ca, cpa, _) = flight_normal_at_mach(mach, &attached).unwrap();
            assert!(ca < cs, "attached body term must reduce total CNalpha");
            assert!(cpa < cps, "attached body term must move CP forward");
        }
        // Below the blend the parameter is unobservable (legacy branch).
        assert_eq!(
            flight_normal_at_mach(0.7, &suppressed).unwrap(),
            flight_normal_at_mach(0.7, &attached).unwrap()
        );
    }

    #[test]
    fn unsupported_or_nonfinite_parameters_fail_closed() {
        let mut v = fixture(BoattailLift::Suppressed);
        v.supersonic_normal.as_mut().unwrap().body_positive_cna = f64::NAN;
        assert!(flight_normal_at_mach(2.0, &v).unwrap_err().contains("published supersonic parameters"));
        // Legacy domain is unaffected by the bad parameter.
        assert!(flight_normal_at_mach(0.5, &v).is_ok());
    }
}
