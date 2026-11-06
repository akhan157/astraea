//! Bounded candidate composition: prepared SB1 static provider, explicit
//! inherited rate couple, explicit mechanical carrier, shared flight driver.
//!
//! Status: experimental, unqualified candidate provider. It is **not** an
//! empirical qualification, an as-flown model, a default flight model or a
//! project field. It is reachable only through the explicit `simulate_candidate`
//! command; existing legacy projects and commands never activate it.
//!
//! Three consumers share one prepared object and one evaluator:
//! 1. the bounded trajectory (`run_bounded`), through the shared driver;
//! 2. a direct load query at an arbitrary committed/speculative state (`query`);
//! 3. a static coefficient/load curve sampler (`curves`).
//!
//! Frozen semantics come from `docs/internal/accuracy-program/first-batch-2026-10-26/P0-contract.md`
//! and `docs/internal/execution-package/INTERFACES.md`. The static coefficient law
//! is `aero_coefficients::evaluate_static` (P0 §1–5); this module composes it and
//! never re-implements it. The rate couple is the explicitly selected inherited
//! `legacy-dimensional-rate-couple/1.0.0`, shared with the legacy assembly.
//!
//! Deliberate absences: no CP denominator guard gates the wrench, no legacy drag
//! table, no legacy normal-slope preparation, no historical calibration, no
//! fallback/blending, no PASS/landing fabrication for a bounded prefix.

use crate::aero_coefficients as ac;
use crate::six_dof::{
    axial_drag_body_force, drive_candidate, legacy_dimensional_rate_couple, live_canopy,
    motor_total_impulse_value, recovered_rate_moment, stage_mechanics, validate_motor_spec,
    DriverFlags, DriverLoads, LiveCanopy, LoadContext, LoadPhase, Loads, MotorSpec, Parachute,
    RigidState, SimEvent, SixDofOptions, StageMechanics, StageValidity, Vec3, Vehicle, G0,
};
use std::cell::RefCell;
use std::fmt;
mod profile;
pub use profile::{CandidateProfileEnvironment, CandidateProfileObservation};

pub const COMPOSITION_ID: &str = "candidate-static-rate-composition/1.0.0";
pub const STATIC_PROVIDER_ID: &str = ac::PROVIDER_ID;
/// Explicitly selected inherited rate model.
///
/// Body rate order is `(q_pitch, p_roll, r_yaw)` about body X, Y, Z. The static
/// input velocity is the air-relative velocity **at the CG**. When the static
/// provider reports reduced rates they are `omega * Lref / (2V)`; the rate
/// increment is defined by subtracting the provider's zero-rate evaluation at
/// the same flow/geometry/power state. This inherited model is instead a
/// **dimensional pure couple** using vehicle length and body radius, not the SB1
/// reference length `D` and not a source-normalised derivative matrix. It adds
/// no force, is datum-invariant, and is reported separately from the static
/// wrench; its formula does not establish real damping or empirical support.
pub const RATE_MODEL_ID: &str = "legacy-dimensional-rate-couple/1.0.0";
pub const ENVIRONMENT_MODEL_ID: &str = "legacy-isa1976-powerlaw-wind/1.0.0";
pub const MECHANICAL_MODEL_ID: &str = "legacy-primitive-mass-inertia/1.0.0";
pub const RESULT_SCHEMA_ID: &str = "astraea-bounded-candidate-result/1.0.0";
pub const SUPPORT_POLICY_ID: &str = "sb1-candidate-support/1.0.0";
pub const PREFIX_POLICY_ID: &str = "committed-macro-samples/1.0.0";
pub const CALIBRATION_POLICY_ID: &str = "no-historical-calibration/1.0.0";
pub const CANOPY_MODEL_ID: &str = "declared-constant-canopy-drag/1.0.0";
/// Candidate computational support (P0 §4), not an empirical envelope.
pub const MAX_MACH_EXCLUSIVE: f64 = 0.8;
pub const MAX_INCIDENCE_DEG: f64 = 5.0;
/// Hard candidate limit for the declared canopy drag law. The legacy assembly
/// degrades above Mach 1; a candidate refuses that extrapolation instead.
pub const MAX_CANOPY_MACH_INCLUSIVE: f64 = 1.0;
/// Retained legacy ISA-1976 branch limit for the declared atmosphere policy.
pub const MAX_LAUNCH_ALTITUDE_ASL_M: f64 = 20_000.0;
/// Absolute flutter/overflow guard for a caller-supplied body rate (rad/s).
pub const MAX_ABSOLUTE_RATE_RADPS: f64 = 1.0e6;
/// Attitude policy shared by query, curves and trajectory composition. The
/// rigid-body transform assumes a unit quaternion; a near-unit input is
/// normalized once and a genuinely non-unit input is refused instead of being
/// silently used as a nonorthogonal frame.
pub const ATTITUDE_POLICY_ID: &str = "near-unit-quaternion/1.0.0";
pub const ATTITUDE_NORM_TOLERANCE: f64 = 1.0e-6;
/// Numerical aero-negligibility policy (versioned). Where the *maximum possible*
/// static aerodynamic force (`q S (|C| + CA0)`, or the declared canopy
/// `q S_cd Cd`) is at most `AERO_NEGLIGIBILITY_RELATIVE_BOUND` of the
/// instantaneous weight, load composition substitutes zero dimensional aero
/// loads and reports no flow/coefficient observation (the direction of an
/// air-relative velocity that cannot produce a measurable force is not
/// evidence). The substitution error is bounded by that same relative force
/// bound. Every state above the bound is subject to the full Mach/incidence/
/// forward-flow checks, so this cannot admit a meaningful reverse/off-axis
/// flow. It is a numerical load approximation, not an empirical or support
/// waiver; curve points use an explicit caller direction and report the bound.
pub const AERO_NEGLIGIBILITY_POLICY_ID: &str = "candidate-aero-negligibility/1.0.0";
pub const AERO_NEGLIGIBILITY_RELATIVE_BOUND: f64 = 1.0e-6;
/// Versioned contract for "the reference state makes static airframe curves
/// inapplicable": the reason is data (a `CandidateCurves::NotApplicable`
/// outcome), not a sampling error. Grid validation precedes applicability, so an
/// invalid request still refuses.
pub const CURVE_APPLICABILITY_POLICY_ID: &str = "candidate-curve-applicability/1.0.0";
/// Declared report-size bound for one curve grid.
pub const MAX_CURVE_MACHS: usize = 1024;
pub const CURVE_NOT_APPLICABLE_CANOPY_LIVE: &str =
    "airframe-curves-not-applicable-canopy-live/1.0.0";
pub const CURVE_NOT_APPLICABLE_NO_FLOW_DIRECTION: &str =
    "no-flow-direction-at-zero-airspeed/1.0.0";
pub const CURVE_NOT_APPLICABLE_CANOPY_LIVE_REASON: &str =
    "airframe static curves are not applicable while a declared canopy is live; no fallback";
pub const CURVE_NOT_APPLICABLE_NO_FLOW_DIRECTION_REASON: &str =
    "curve sampling requires a nonzero reference air-relative velocity direction; zero speed has no flow direction";
/// Declared engine-heap bound on committed macro-sample collection per run.
/// This is a resource policy, not a physical/domain limit: exceeding it refuses
/// the run with a policy-named error rather than growing without bound. It is
/// separate from the 64 MiB native / 8 MiB foreign *file* budgets.
pub const COLLECTED_SAMPLE_CAP_ID: &str = "candidate-committed-sample-collection-cap/1.0.0";
pub const COLLECTED_SAMPLE_CAP: usize = 50_000;
/// Hard ceiling for the explicit native-only research capture mode.
pub const RESEARCH_SAMPLE_HARD_MAX: usize = 250_000;
/// Report-side retained subset: the app's accepted archive policy, applied in the
/// engine so the full sample set never crosses the command boundary.
pub const REPORT_SAMPLE_POLICY_ID: &str = "candidate-archive-display-samples/1.0.0";
pub const REPORT_SAMPLE_CAP: usize = 5_000;

pub const LIMITATIONS: &[&str] = &[
    "SB1 is a small-angle static method composed with an inherited dimensional rate couple; it is not empirically qualified.",
    "Composite dynamics qualification is UNKNOWN even for a numerically complete trajectory.",
    "The mechanical carrier is the legacy primitive mass/CG/inertia model, not measured vehicle data.",
    "The retained legacy ISA-1976 atmosphere and power-law wind are identified assumptions, not qualified weather.",
    "Canopy recovery uses the declared constant canopy Cd; recovery deployment/qualification remain outside this packet.",
    "A time-limited prefix has no landing and its highest committed sample is not a predicted apogee.",
    "No historical calibration, fit or CP-based drag table is consumed or transferred.",
    "Above the versioned 1e-6-of-weight aero-negligibility bound, every evaluation enforces forward flow, Mach < 0.8 and incidence <= 5 degrees; below it dimensional aero loads are approximated as zero with flow observations absent, and support checks resume immediately above it.",
    "Caller attitudes must be near-unit (|q|-1 <= 1e-6) or the composition refuses them; accepted attitudes are normalized once.",
    "The retained ISA-1976 atmosphere is enforced at the instantaneous altitude (0..20 km ASL), not only at launch.",
    "Caller identities are retained declarations, never cryptographic content hashes.",
];

/// Provenance declarations. Caller source IDs stay separate from any content
/// hash this module does not compute.
#[derive(Clone, Debug)]
pub struct CandidateSourceDeclarations {
    pub adapter_id: String,
    pub caller_source_identity: String,
    pub mechanical_source_id: String,
    pub environment_source_id: String,
}

/// Retained legacy environment policy inputs, explicitly declared per run.
#[derive(Clone, Copy, Debug)]
pub struct CandidateEnvironment {
    pub launch_altitude_asl_m: f64,
    pub wind_speed_surface_mps: f64,
    pub wind_azimuth_deg: f64,
}

impl CandidateEnvironment {
    pub fn validate(&self) -> Result<(), CandidateLoadError> {
        let invalid = |reason: &str| CandidateLoadError { kind: CandidateFailureKind::InvalidInput, reason: reason.to_string() };
        if ![self.launch_altitude_asl_m, self.wind_speed_surface_mps, self.wind_azimuth_deg]
            .iter().all(|v| v.is_finite())
        {
            return Err(invalid("environment inputs must be finite"));
        }
        if self.wind_speed_surface_mps < 0.0 {
            return Err(invalid("windSpeedSurface must be nonnegative"));
        }
        if self.launch_altitude_asl_m < 0.0 || self.launch_altitude_asl_m > MAX_LAUNCH_ALTITUDE_ASL_M {
            return Err(CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain,
                reason: format!("retained ISA-1976 atmosphere is declared for 0..={MAX_LAUNCH_ALTITUDE_ASL_M} m ASL; launch altitude {} m is outside candidate support", self.launch_altitude_asl_m) });
        }
        Ok(())
    }
}

/// Numerical/launch policy for one bounded candidate run. Every field is
/// explicit; there is no hidden candidate default and no calibration transfer.
#[derive(Clone, Copy, Debug)]
pub struct CandidateOptions {
    pub rail_length_m: f64,
    pub rail_elevation_deg: f64,
    pub rail_azimuth_deg: f64,
    pub main_deploy_altitude_agl_m: f64,
    pub time_step_s: f64,
    /// Must be absent or exactly 1.0: historical airframe calibration is not
    /// transferable to this composition.
    pub drag_cd_scale: Option<f64>,
    /// Must be absent or exactly 0.0: SB1 excludes cant.
    pub fin_cant_angle_deg: Option<f64>,
}

impl CandidateOptions {
    fn to_six_dof(&self, environment: &CandidateEnvironment) -> Result<SixDofOptions, CandidateLoadError> {
        if let Some(scale) = self.drag_cd_scale {
            if scale != 1.0 {
                return Err(CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain,
                    reason: format!("historical airframe calibration scale {scale} is not transferable to {COMPOSITION_ID}; omit dragCdScale or pass exactly 1.0 ({} )", CALIBRATION_POLICY_ID) });
            }
        }
        if let Some(cant) = self.fin_cant_angle_deg {
            if cant != 0.0 {
                return Err(CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain,
                    reason: format!("SB1 excludes fin cant; candidate requires 0 degrees (got {cant})") });
            }
        }
        Ok(SixDofOptions {
            rail_length: Some(self.rail_length_m),
            rail_elevation_deg: Some(self.rail_elevation_deg),
            rail_azimuth_deg: Some(self.rail_azimuth_deg),
            launch_altitude_asl: Some(environment.launch_altitude_asl_m),
            wind_speed_surface: Some(environment.wind_speed_surface_mps),
            wind_azimuth_deg: Some(environment.wind_azimuth_deg),
            main_deploy_altitude_agl: Some(self.main_deploy_altitude_agl_m),
            time_step: Some(self.time_step_s),
            fin_cant_angle_deg: Some(0.0),
            drag_cd_scale: None,
            record_telemetry: false,
            record_moment_arm_history: false,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CandidateFailureKind {
    InvalidInput,
    UnsupportedDomain,
    InconsistentPreparation,
}

impl fmt::Display for CandidateFailureKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            Self::InvalidInput => "invalid-input",
            Self::UnsupportedDomain => "unsupported-domain",
            Self::InconsistentPreparation => "inconsistent-preparation",
        };
        f.write_str(label)
    }
}

/// Error from a single load/curve evaluation (no driver context yet).
#[derive(Clone, Debug)]
pub struct CandidateLoadError {
    pub kind: CandidateFailureKind,
    pub reason: String,
}

impl fmt::Display for CandidateLoadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.kind, self.reason)
    }
}

impl std::error::Error for CandidateLoadError {}

/// Purpose of one shared-driver evaluation. Labels describe the call, not
/// committed-path evidence.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CandidatePhaseLabel {
    pub label: &'static str,
    pub speculative: bool,
}

fn phase_label(phase: LoadPhase) -> CandidatePhaseLabel {
    use crate::six_dof::AstraeaEvent as E;
    match phase {
        LoadPhase::EndpointProbe => CandidatePhaseLabel { label: "adaptive-endpoint-stage", speculative: true },
        LoadPhase::ProfileBurnoutRead => CandidatePhaseLabel { label: "profile-burnout-read", speculative: false },
        LoadPhase::BurnoutRoot => CandidatePhaseLabel { label: "burnout-root", speculative: true },
        LoadPhase::EventRefinement(E::RailExit) => CandidatePhaseLabel { label: "event-root:rail-exit", speculative: true },
        LoadPhase::EventRefinement(E::MotorBurnout) => CandidatePhaseLabel { label: "event-root:burnout", speculative: true },
        LoadPhase::EventRefinement(E::ApogeeDrogue) => CandidatePhaseLabel { label: "event-root:apogee", speculative: true },
        LoadPhase::EventRefinement(E::MainDeploy) => CandidatePhaseLabel { label: "event-root:main-deploy", speculative: true },
        LoadPhase::EventRefinement(E::Touchdown) => CandidatePhaseLabel { label: "event-root:touchdown", speculative: true },
        LoadPhase::EventRefinement(E::None) => CandidatePhaseLabel { label: "event-root:none", speculative: true },
        LoadPhase::RailExit => CandidatePhaseLabel { label: "rail-exit-read", speculative: false },
        LoadPhase::MacroSample => CandidatePhaseLabel { label: "committed-macro-sample", speculative: false },
        LoadPhase::TouchdownSample => CandidatePhaseLabel { label: "touchdown-read", speculative: false },
    }
}

/// Structured record of one candidate evaluation failure, attached to the
/// shared-driver error. A speculative record is not a committed event crossing.
#[derive(Clone, Debug)]
pub struct CandidateEvaluationRecord {
    pub model_id: &'static str,
    pub composition_id: &'static str,
    pub phase: CandidatePhaseLabel,
    pub stage_time_s: f64,
    pub drogue_deployed: bool,
    pub main_deployed: bool,
    pub rail_bound: bool,
    pub state: RigidState,
    pub kind: CandidateFailureKind,
    pub reason: String,
}

/// A bounded candidate run failed. It carries both the shared driver's message
/// and, when the failure came from this composition, the structured record.
#[derive(Clone, Debug)]
pub struct CandidateRunError {
    pub reason: String,
    pub driver_message: String,
    pub record: Option<CandidateEvaluationRecord>,
    /// Declared resource policy refusal (sample collection cap). Never a
    /// physical, geometry or domain classification: no evaluation record is
    /// produced for it.
    pub resource_limit: bool,
}

impl fmt::Display for CandidateRunError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.record {
            Some(r) => write!(f, "[{}] {} at t={} s ({}; speculative={})",
                r.composition_id, r.reason, r.stage_time_s, r.phase.label, r.phase.speculative),
            None => f.write_str(&self.reason),
        }
    }
}

impl std::error::Error for CandidateRunError {}

impl From<CandidateLoadError> for CandidateRunError {
    fn from(error: CandidateLoadError) -> Self {
        Self { reason: error.reason.clone(), driver_message: String::new(), record: None,
            resource_limit: false }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CandidateFlags {
    pub drogue_deployed: bool,
    pub main_deployed: bool,
    pub rail_bound: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CandidateApplicability {
    AirframeStaticRateComposition,
    CanopyRecoveryComposition,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CandidateComputationalStatus {
    /// Flow-relative static evaluation plus the selected rate couple.
    Supported,
    /// Zero airspeed with zero body rate: zero dimensional loads only; flow
    /// angles, coefficients and CP reasons remain absent.
    ZeroSpeedStaticLoadsOnly,
    /// Maximum possible static aero force is at or below the versioned
    /// 1e-6-of-weight bound: zero dimensional aero loads, no flow observation.
    StaticLoadsBelowAeroNegligibility,
}

#[derive(Clone, Debug)]
pub struct CandidateIdentities {
    pub composition_id: &'static str,
    pub static_provider_id: &'static str,
    pub rate_model_id: &'static str,
    pub environment_model_id: &'static str,
    pub mechanical_model_id: &'static str,
    pub support_policy_id: &'static str,
    pub calibration_policy_id: &'static str,
    pub canopy_model_id: &'static str,
    pub adapter_id: String,
    pub caller_source_identity: String,
    pub geometry_identity: String,
    pub axial_provider_id: String,
    pub axial_input_identity: String,
    pub mechanical_source_id: String,
    pub environment_source_id: String,
}

#[derive(Clone, Copy, Debug)]
pub struct CandidateNormalSums {
    pub c_per_rad: f64,
    pub j_m_per_rad: f64,
    pub sum_abs_c_per_rad: f64,
    pub sum_abs_j_m_per_rad: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct CandidateCp {
    pub station_from_nose_m: Option<f64>,
    pub kappa_c: Option<f64>,
    pub reason: Option<ac::CpUnavailable>,
}

#[derive(Clone, Copy, Debug)]
pub struct CandidateMechanicsObservation {
    pub mass_kg: f64,
    pub cg_from_nose_m: f64,
    pub body_radius_m: f64,
    pub reference_area_m2: f64,
    pub reference_length_m: f64,
    pub density_kg_m3: f64,
    pub speed_of_sound_mps: f64,
    pub airspeed_mps: f64,
    pub mach: f64,
    pub dynamic_pressure_pa: f64,
    pub thrust_n: f64,
    pub wind_n_mps: Vec3,
}

/// One evaluated state. `sample_origin` says why the evaluation happened:
/// `direct-query`, `committed-macro-sample` or `committed-final-read`.
#[derive(Clone, Debug)]
pub struct CandidateSample {
    pub sample_origin: &'static str,
    pub stage_time_s: f64,
    pub state: RigidState,
    pub flags: CandidateFlags,
    pub applicability: CandidateApplicability,
    pub status: CandidateComputationalStatus,
    pub identities: CandidateIdentities,
    pub profile_environment: Option<CandidateProfileObservation>,
    pub mechanics: CandidateMechanicsObservation,
    /// `None` at exactly zero airspeed: undefined, never a zero observation.
    pub flow: Option<ac::FlowAngles>,
    /// Independent static datum wrench (coefficient space).
    pub static_coefficients_at_datum: Option<ac::CoefficientWrench>,
    /// Same static wrench translated to the instantaneous CG.
    pub static_coefficients_at_cg: Option<ac::CoefficientWrench>,
    pub wind_coefficients: Option<ac::WindCoefficients>,
    pub normal_derivatives: Option<CandidateNormalSums>,
    /// Derivative CP at the symmetric baseline; station is metres aft of the
    /// nose and independent of the prepared moment datum.
    pub cp: Option<CandidateCp>,
    pub static_force_body_n: Vec3,
    pub static_moment_cg_body_nm: Vec3,
    /// Modeled rate couple (already dimensional, body axes).
    pub rate_moment_body_nm: Vec3,
    /// Declared canopy drag force in body axes; `None` on the airframe branch.
    pub canopy_drag_force_body_n: Option<Vec3>,
    /// Total aerodynamic (not gravity/thrust) force in body axes.
    pub aero_force_body_n: Vec3,
    /// Total aerodynamic moment about the instantaneous CG in body axes.
    pub aero_moment_cg_body_nm: Vec3,
    /// `-F_aero · vhat` at the evaluation state; zero at V=0 by construction.
    pub drag_along_wind_n: f64,
    /// Declared aero-negligibility bound at this state (always reported).
    pub aero_negligibility: CandidateAeroNegligibility,
    pub unavailable: Vec<CandidateUnavailable>,
}

#[derive(Clone, Copy, Debug)]
pub struct CandidateAeroNegligibility {
    pub policy_id: &'static str,
    pub relative_bound: f64,
    pub max_possible_force_n: f64,
    pub weight_n: f64,
    pub is_negligible: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct CandidateUnavailable {
    pub quantity: &'static str,
    pub reason: &'static str,
}

/// One static curve point: same prepared object and core evaluator, rate loads
/// deliberately excluded so a static diagnostic never becomes a dynamic model.
#[derive(Clone, Debug)]
pub struct CandidateCurvePoint {
    pub mach: f64,
    pub profile_environment: Option<CandidateProfileObservation>,
    pub status: CandidateComputationalStatus,
    pub static_coefficients_at_datum: Option<ac::CoefficientWrench>,
    pub static_coefficients_at_cg: Option<ac::CoefficientWrench>,
    pub wind_coefficients: Option<ac::WindCoefficients>,
    pub normal_derivatives: Option<CandidateNormalSums>,
    pub cp: Option<CandidateCp>,
    pub static_force_body_n: Vec3,
    pub static_moment_cg_body_nm: Vec3,
    pub flow: Option<ac::FlowAngles>,
    pub dynamic_pressure_pa: f64,
    /// Reported for this explicit-direction point; coefficients and the static
    /// wrench are retained even when the dimensional loads are negligible.
    pub aero_negligibility: CandidateAeroNegligibility,
    pub unavailable: Vec<CandidateUnavailable>,
}

/// Why static airframe curves are not applicable at the reference state.
///
/// This is data, not an error: the bounded trajectory and the direct query are
/// unaffected, the reference state is never substituted and no airframe state is
/// sampled on the caller's behalf.
#[derive(Clone, Debug)]
pub struct CandidateCurveNotApplicable {
    pub reason_id: &'static str,
    pub reason: &'static str,
    /// Curve reference (last committed) stage time.
    pub reference_time_s: f64,
    pub drogue_deployed: bool,
    pub main_deployed: bool,
}

#[derive(Clone, Debug)]
pub enum CandidateCurves {
    Computed(Vec<CandidateCurvePoint>),
    NotApplicable(CandidateCurveNotApplicable),
}

#[derive(Clone, Debug)]
pub struct CandidateApogeeEvent {
    pub time_s: f64,
    pub altitude_agl_m: f64,
    pub velocity_mps: f64,
    pub description: String,
}

#[derive(Clone, Debug)]
pub struct CandidateTouchdownEvidence {
    pub time_s: f64,
    pub position_n_m: Vec3,
    pub speed_mps: f64,
    pub mass_kg: f64,
    pub event_description: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CandidateTermination {
    TimeLimit,
    Touchdown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CandidateComputationalCompletion {
    CompletedRequestedHorizon,
    CompletedTouchdown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CandidateDynamicQualification {
    Unknown,
}

#[derive(Clone, Debug)]
pub struct CandidateObservedPrefix {
    pub sampling_policy_id: &'static str,
    pub sample_count: usize,
    pub max_altitude_agl_m: f64,
    pub max_altitude_time_s: f64,
    pub max_airspeed_mps: f64,
    pub max_airspeed_time_s: f64,
    pub max_dynamic_pressure_pa: f64,
    pub max_dynamic_pressure_time_s: f64,
    pub note: &'static str,
}

#[derive(Clone, Debug)]
pub struct CandidateRunResult {
    pub schema_id: &'static str,
    pub identities: CandidateIdentities,
    pub requested_horizon_s: f64,
    pub final_time_s: f64,
    pub final_state: RigidState,
    pub final_flags: CandidateFlags,
    pub termination: CandidateTermination,
    /// Diagnostic bookkeeping from the shared driver; reported outside the
    /// compared candidate report, never part of trajectory semantics.
    pub mechanism: crate::six_dof::MechanismEvidence,
    pub computational_completion: CandidateComputationalCompletion,
    pub empirical_qualification: ac::EmpiricalQualification,
    pub dynamic_qualification: CandidateDynamicQualification,
    /// Committed macro/root samples only; rejected adaptive trials are not
    /// plotted as trajectory samples.
    pub committed_samples: Vec<CandidateSample>,
    pub events: Vec<SimEvent>,
    pub observed_prefix: CandidateObservedPrefix,
    /// Present only after a completed touchdown event.
    pub landing: Option<CandidateTouchdownEvidence>,
    /// Present only for a qualified apogee event, never for a rising prefix.
    pub apogee_event: Option<CandidateApogeeEvent>,
    pub limitations: Vec<&'static str>,
}

/// Everything the prepared candidate owns. Immutable after preparation.
#[derive(Clone, Debug)]
pub struct PreparedCandidate {
    geometry: ac::CandidateGeometry,
    references: ac::References,
    datum: ac::Datum,
    axial: ac::PrescribedAxial,
    /// Mechanical carrier. Legacy slope/CP/drag carriers are overwritten with
    /// NaN at preparation, so consulting them cannot silently produce a load.
    vehicle: Vehicle,
    motor: MotorSpec,
    environment: CandidateEnvironment,
    profile_environment: Option<CandidateProfileEnvironment>,
    source: CandidateSourceDeclarations,
    geometry_length_m: f64,
}

#[derive(Clone, Debug)]
pub struct CandidatePreparation {
    pub geometry: ac::CandidateGeometry,
    pub references: ac::References,
    pub datum: ac::Datum,
    pub axial: ac::PrescribedAxial,
    /// Only mass/CG/length/diameter/motor-station/chute fields are consumed.
    pub mechanical_vehicle: Vehicle,
    pub motor: MotorSpec,
    pub environment: CandidateEnvironment,
    pub source: CandidateSourceDeclarations,
}

fn non_empty(field: &str, value: &str) -> Result<(), CandidateLoadError> {
    if value.trim().is_empty() {
        return Err(CandidateLoadError { kind: CandidateFailureKind::InconsistentPreparation,
            reason: format!("explicit {field} is required; a candidate source identity cannot be omitted") });
    }
    Ok(())
}

fn map_aero(error: ac::Error) -> CandidateLoadError {
    let (kind, reason) = match error {
        ac::Error::InvalidInput(reason) => (CandidateFailureKind::InvalidInput, reason),
        ac::Error::UnsupportedDomain(reason) => (CandidateFailureKind::UnsupportedDomain, reason),
    };
    CandidateLoadError { kind, reason: reason.to_string() }
}

/// Candidate-specific motor validation. `validate_motor_spec` is the legacy
/// contract; it does not check finite dry/total mass or a positive integrated
/// impulse, both of which the shared mechanical primitive assumes. Refuse those
/// records here instead of reaching a legacy panic.
fn validate_candidate_motor(motor: &MotorSpec) -> Result<(), CandidateLoadError> {
    validate_motor_spec(motor).map_err(|reason| CandidateLoadError {
        kind: CandidateFailureKind::InvalidInput, reason })?;
    let invalid = |reason: String| CandidateLoadError { kind: CandidateFailureKind::InvalidInput, reason };
    if ![motor.dry_mass, motor.total_mass, motor.propellant_mass, motor.max_thrust]
        .iter().all(|v| v.is_finite())
    {
        return Err(invalid("motor dry/total/propellant mass and max thrust must be finite".to_string()));
    }
    if !(motor.dry_mass > 0.0) || !(motor.total_mass > 0.0) || !(motor.propellant_mass > 0.0) {
        return Err(invalid("motor dry, total and propellant masses must be positive".to_string()));
    }
    if !(motor.total_mass > motor.dry_mass) || !(motor.total_mass > motor.propellant_mass) {
        return Err(invalid("motor total mass must exceed its dry and propellant masses".to_string()));
    }
    if motor.max_thrust < 0.0 {
        return Err(invalid("motor max thrust must be nonnegative".to_string()));
    }
    let impulse = motor_total_impulse_value(motor);
    if !impulse.is_finite() || impulse <= 0.0 {
        return Err(invalid(format!("motor thrust curve must deliver a finite positive total impulse (got {impulse})")));
    }
    Ok(())
}

fn check_chute(label: &str, chute: &Option<Parachute>) -> Result<(), CandidateLoadError> {
    if let Some(chute) = chute {
        if !chute.diameter.is_finite() || chute.diameter <= 0.0 || !chute.cd.is_finite() || chute.cd < 0.0 {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: format!("declared {label} canopy requires a finite positive diameter and a finite nonnegative Cd") });
        }
    }
    Ok(())
}

impl PreparedCandidate {
    /// Validate and freeze the candidate. Preparation refuses every omitted,
    /// nonfinite or inconsistent physical declaration instead of defaulting it.
    pub fn prepare(input: CandidatePreparation) -> Result<Self, CandidateLoadError> {
        non_empty("adapterId", &input.source.adapter_id)?;
        non_empty("caller source identity", &input.source.caller_source_identity)?;
        non_empty("mechanicalSourceId", &input.source.mechanical_source_id)?;
        non_empty("environmentSourceId", &input.source.environment_source_id)?;
        non_empty("geometry identity", &input.geometry.identity)?;
        non_empty("geometry integral provenance", &input.geometry.integral_provenance)?;
        input.references.validate().map_err(map_aero)?;
        if !input.datum.0.is_finite() {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: "moment datum must be finite".to_string() });
        }
        if !input.axial.ca0.is_finite() || input.axial.ca0 < 0.0 {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: "prescribed CA0 must be finite and nonnegative".to_string() });
        }
        non_empty("axial provider ID", &input.axial.provider_id)?;
        non_empty("axial input identity", &input.axial.input_identity)?;
        input.environment.validate()?;

        let mut vehicle = input.mechanical_vehicle;
        if !vehicle.dry_mass.is_finite() || !(vehicle.dry_mass > 0.0)
            || !vehicle.cg_from_nose.is_finite() || !vehicle.total_length.is_finite()
            || !(vehicle.total_length > 0.0) || !vehicle.ref_diameter.is_finite()
            || !(vehicle.ref_diameter > 0.0) || !vehicle.motor_aft_station_from_nose.is_finite()
        {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: "mechanical carrier requires finite positive dry mass, total length, reference diameter, CG and motor station".to_string() });
        }
        if vehicle.cg_from_nose < 0.0 || vehicle.cg_from_nose > vehicle.total_length {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: format!("mechanical CG station {} m lies outside the declared vehicle length {} m",
                    vehicle.cg_from_nose, vehicle.total_length) });
        }
        if vehicle.motor_aft_station_from_nose < 0.0 || vehicle.motor_aft_station_from_nose > vehicle.total_length {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: "motor aft station must lie within the declared vehicle length".to_string() });
        }
        check_chute("drogue", &vehicle.drogue)?;
        check_chute("main", &vehicle.main_chute)?;
        validate_candidate_motor(&input.motor)?;
        if !input.motor.diameter.is_finite() || !input.motor.length.is_finite()
            || !(input.motor.diameter > 0.0) || !(input.motor.length > 0.0)
        {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: "motor diameter and length must be finite and positive".to_string() });
        }
        if input.motor.diameter > vehicle.ref_diameter {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InconsistentPreparation,
                reason: format!("motor diameter {} m exceeds the declared body reference diameter {} m",
                    input.motor.diameter, vehicle.ref_diameter) });
        }
        if input.motor.length > vehicle.total_length {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InconsistentPreparation,
                reason: "motor length exceeds the declared vehicle length".to_string() });
        }
        // Same expression as the legacy assembly's motor-placement assertion, so
        // the candidate refuses exactly where the driver would otherwise panic.
        let forward_end = (vehicle.motor_aft_station_from_nose - input.motor.length / 2.0) - input.motor.length / 2.0;
        if !(forward_end >= 0.0) {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InconsistentPreparation,
                reason: format!("motor forward end {} m lies outside the vehicle (mount station {} m, motor length {} m)",
                    forward_end, vehicle.motor_aft_station_from_nose, input.motor.length) });
        }
        // Structural SB1 support at the zero-Mach baseline, before any flow is
        // invented. This also checks declarations, interval continuity and fins.
        let sums = input.geometry.normal_sums(0.0, input.references).map_err(map_aero)?;
        if !sums.c_per_rad.is_finite() || !sums.j_m_per_rad.is_finite() {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: "nonfinite normal derivative sums at the zero-Mach baseline".to_string() });
        }
        let geometry_length_m = input.geometry.body.last().map(|b| b.x1_m).ok_or_else(|| CandidateLoadError {
            kind: CandidateFailureKind::UnsupportedDomain,
            reason: "body interval representation required".to_string() })?;
        // Declared-length/diameter crosscheck: the mechanical carrier and the
        // adapted geometry must describe the same vehicle. Exact equality is
        // required because both are derived from the same declared source data;
        // this is not a physical tolerance.
        if vehicle.total_length != geometry_length_m {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InconsistentPreparation,
                reason: format!("mechanical carrier total length {} m does not match adapted geometry length {} m",
                    vehicle.total_length, geometry_length_m) });
        }
        if vehicle.ref_diameter != input.references.diameter_m {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InconsistentPreparation,
                reason: format!("mechanical carrier reference diameter {} m does not match adapted geometry reference diameter {} m",
                    vehicle.ref_diameter, input.references.diameter_m) });
        }
        // Poison every legacy slope/CP/drag carrier. The candidate must never
        // consult them; a consultation yields NaN loads instead of a plausible
        // legacy number, so tests cannot pass by accident.
        vehicle.cna_body = f64::NAN;
        vehicle.cna_fins = f64::NAN;
        vehicle.body_first_moment = f64::NAN;
        vehicle.fin_first_moment = f64::NAN;
        vehicle.body_abs_cna = f64::NAN;
        vehicle.fin_abs_cna = f64::NAN;
        vehicle.aero_powered_cd = vec![f64::NAN];
        vehicle.aero_coasting_cd = vec![f64::NAN];
        Ok(Self {
            geometry: input.geometry,
            references: input.references,
            datum: input.datum,
            axial: input.axial,
            vehicle,
            motor: input.motor,
            environment: input.environment,
            profile_environment: None,
            source: input.source,
            geometry_length_m,
        })
    }

    pub fn environment(&self) -> &CandidateEnvironment { &self.environment }

    fn ident(&self) -> CandidateIdentities {
        CandidateIdentities {
            composition_id: if self.profile_environment.is_some() { profile::PROFILE_COMPOSITION_ID } else { COMPOSITION_ID },
            static_provider_id: STATIC_PROVIDER_ID,
            rate_model_id: RATE_MODEL_ID,
            environment_model_id: if self.profile_environment.is_some() { profile::ENVIRONMENT_ID } else { ENVIRONMENT_MODEL_ID },
            mechanical_model_id: MECHANICAL_MODEL_ID,
            support_policy_id: SUPPORT_POLICY_ID,
            calibration_policy_id: CALIBRATION_POLICY_ID,
            canopy_model_id: CANOPY_MODEL_ID,
            adapter_id: self.source.adapter_id.clone(),
            caller_source_identity: self.source.caller_source_identity.clone(),
            geometry_identity: self.geometry.identity.clone(),
            axial_provider_id: self.axial.provider_id.clone(),
            axial_input_identity: self.axial.input_identity.clone(),
            mechanical_source_id: self.source.mechanical_source_id.clone(),
            environment_source_id: self.source.environment_source_id.clone(),
        }
    }

    /// Declared reference values (for reporting; not a computed hash).
    pub fn references(&self) -> ac::References { self.references }
    pub fn geometry_length_m(&self) -> f64 { self.geometry_length_m }
}

fn state_is_finite(state: &RigidState) -> bool {
    [state.r.x, state.r.y, state.r.z, state.v.x, state.v.y, state.v.z,
     state.w.x, state.w.y, state.w.z, state.q.w, state.q.x, state.q.y, state.q.z]
        .iter().all(|v| v.is_finite())
}

fn quat_norm(state: &RigidState) -> f64 {
    (state.q.w * state.q.w + state.q.x * state.q.x + state.q.y * state.q.y + state.q.z * state.q.z).sqrt()
}

/// Shared attitude validation/normalization for query, curves and trajectory
/// composition. The rigid-body transform assumes a unit quaternion, so a
/// near-unit input is normalized once; anything else is refused rather than
/// silently producing a nonorthogonal frame.
fn normalize_candidate_attitude(state: &RigidState) -> Result<RigidState, CandidateLoadError> {
    let norm = quat_norm(state);
    if !norm.is_finite() || norm <= 0.0 {
        return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
            reason: "degenerate or nonfinite attitude quaternion".to_string() });
    }
    if (norm - 1.0).abs() > ATTITUDE_NORM_TOLERANCE {
        return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
            reason: format!("attitude quaternion norm {norm} is outside {ATTITUDE_POLICY_ID} (|q|-1 <= {ATTITUDE_NORM_TOLERANCE}); refusing a nonorthogonal frame") });
    }
    let inv = 1.0 / norm;
    let mut out = *state;
    out.q = crate::six_dof::Quat { w: state.q.w * inv, x: state.q.x * inv,
        y: state.q.y * inv, z: state.q.z * inv };
    Ok(out)
}

fn to_aero(v: Vec3) -> ac::Vec3 { ac::Vec3::new(v.x, v.y, v.z) }
fn to_driver(v: ac::Vec3) -> Vec3 { Vec3 { x: v.x, y: v.y, z: v.z } }
fn add(a: Vec3, b: Vec3) -> Vec3 { Vec3 { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z } }
fn dot(a: Vec3, b: Vec3) -> f64 { a.x * b.x + a.y * b.y + a.z * b.z }

/// Per-state aero-negligibility bound. Uses the maximum possible static force
/// from the prepared geometry (`q S (|C| + CA0)`) or the declared canopy drag,
/// compared with the instantaneous mechanical weight. Geometry support errors
/// (for example Mach >= 0.8) propagate instead of being hidden by the bound.
fn aero_negligibility(
    prepared: &PreparedCandidate,
    mech: &StageMechanics,
    mach: f64,
    q_inf: f64,
    canopy: Option<LiveCanopy>,
) -> Result<CandidateAeroNegligibility, CandidateLoadError> {
    let max_possible_force_n = match canopy {
        Some(live) => q_inf * live.eff_area * live.cd,
        None => {
            let sums = prepared.geometry.normal_sums(mach, prepared.references).map_err(map_aero)?;
            let coefficient_bound = sums.c_per_rad.abs() + prepared.axial.ca0;
            q_inf * prepared.references.area_m2 * coefficient_bound
        }
    };
    let weight_n = mech.mass * G0;
    let is_negligible = max_possible_force_n.is_finite() && weight_n.is_finite() && weight_n > 0.0
        && max_possible_force_n <= AERO_NEGLIGIBILITY_RELATIVE_BOUND * weight_n;
    Ok(CandidateAeroNegligibility {
        policy_id: AERO_NEGLIGIBILITY_POLICY_ID,
        relative_bound: AERO_NEGLIGIBILITY_RELATIVE_BOUND,
        max_possible_force_n,
        weight_n,
        is_negligible,
    })
}

struct Composed {
    sample: CandidateSample,
    driver: DriverLoads,
}

fn compose(
    prepared: &PreparedCandidate,
    stage_time_s: f64,
    state: &RigidState,
    flags: CandidateFlags,
    sample_origin: &'static str,
) -> Result<Composed, CandidateLoadError> {
    if !stage_time_s.is_finite() {
        return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
            reason: "stage time must be finite".to_string() });
    }
    if !state_is_finite(state) {
        return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
            reason: "rigid state must be finite before any candidate evaluation".to_string() });
    }
    let state = normalize_candidate_attitude(state)?;
    let state = &state;
    let rate_norm = (state.w.x * state.w.x + state.w.y * state.w.y + state.w.z * state.w.z).sqrt();
    if !rate_norm.is_finite() || rate_norm > MAX_ABSOLUTE_RATE_RADPS {
        return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
            reason: "body rate must be finite and below the absolute rate guard".to_string() });
    }
    let (mech, profile_environment) = prepared.stage(stage_time_s, state)?;
    let canopy = live_canopy(&prepared.vehicle, flags.drogue_deployed, flags.main_deployed);
    // Model support is enforced before any negligibility approximation: a
    // declared canopy is never evaluated above its own Mach limit just because
    // its drag bound would be small.
    if canopy.is_some() && mech.mach > MAX_CANOPY_MACH_INCLUSIVE {
        return Err(CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain,
            reason: format!("declared canopy drag law support is Mach <= {MAX_CANOPY_MACH_INCLUSIVE}; stage Mach {} is outside candidate support (canopy support {CANOPY_MODEL_ID})", mech.mach) });
    }
    let negligibility = aero_negligibility(prepared, &mech, mech.mach, mech.q_inf, canopy)?;
    if mech.airspeed == 0.0 && rate_norm > 0.0 {
        return Err(CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain,
            reason: "zero airspeed with nonzero body rate is refused: no separately identified zero-speed rate model exists".to_string() });
    }
    let mut unavailable: Vec<CandidateUnavailable> = Vec::new();
    let zero_speed = mech.airspeed == 0.0;

    let (applicability, static_eval, canopy_force) = if negligibility.is_negligible && !zero_speed {
        unavailable.push(CandidateUnavailable { quantity: "static_aero_loads",
            reason: "maximum possible static aero force is within the declared 1e-6-of-weight aero-negligibility bound; zero dimensional loads, no flow observation" });
        if canopy.is_some() {
            unavailable.push(CandidateUnavailable { quantity: "airframe_coefficients",
                reason: "not applicable: a declared canopy is live" });
        }
        (if canopy.is_some() { CandidateApplicability::CanopyRecoveryComposition }
         else { CandidateApplicability::AirframeStaticRateComposition },
         None, None)
    } else {
    match canopy {
        Some(live) => {
            let drag_axial = mech.q_inf * live.eff_area * live.cd;
            // Candidate floor 0.0: the negligibility branch above already
            // substitutes zero below the declared force bound, and exactly-zero
            // speed is zero by construction. No hidden speed floor may suppress
            // a force above the bound.
            let force = axial_drag_body_force(drag_axial, &mech.rel_body, mech.airspeed, 0.0);
            unavailable.push(CandidateUnavailable { quantity: "airframe_coefficients",
                reason: "not applicable: a declared canopy is live and disables the SB1 airframe branch" });
            unavailable.push(CandidateUnavailable { quantity: "airframe_normal_derivatives",
                reason: "not applicable: a declared canopy is live" });
            unavailable.push(CandidateUnavailable { quantity: "cp",
                reason: "not applicable: a declared canopy is live" });
            unavailable.push(CandidateUnavailable { quantity: "canopy_model",
                reason: if live.main { "main canopy: declared constant Cd" } else { "drogue canopy: declared constant Cd" } });
            (CandidateApplicability::CanopyRecoveryComposition, None, Some(force))
        }
        None => {
            let input = ac::StaticInput {
                relative_velocity_at_cg_b_mps: to_aero(mech.rel_body),
                omega_b_radps: to_aero(state.w),
                mach: mech.mach,
                density_kg_m3: mech.density,
                cg_position_from_nose_b_m: ac::Vec3::new(0.0, -mech.cg_from_nose, 0.0),
            };
            let evaluation = ac::evaluate_static(&prepared.geometry, prepared.references,
                prepared.datum, &prepared.axial, input).map_err(map_aero)?;
            (CandidateApplicability::AirframeStaticRateComposition, Some(evaluation), None)
        }
    }
    };

    let (status, flow, coefficients_datum, coefficients_cg, wind, normal, cp) = match &static_eval {
        Some(out) => {
            let coefficients_datum = out.static_coefficients_at_datum;
            let coefficients_cg = match coefficients_datum {
                Some(wrench) => Some(wrench.translated(prepared.datum,
                    ac::Datum(ac::Vec3::new(0.0, -mech.cg_from_nose, 0.0)), prepared.references).map_err(map_aero)?),
                None => None,
            };
            let sums = out.normal_derivatives_at_zero_incidence;
            let cp = sums.derivative_cp(None).map_err(map_aero)?;
            let normal = CandidateNormalSums {
                c_per_rad: sums.c_per_rad, j_m_per_rad: sums.j_m_per_rad,
                sum_abs_c_per_rad: sums.sum_abs_c_per_rad, sum_abs_j_m_per_rad: sums.sum_abs_j_m_per_rad,
            };
            if out.status == ac::ComputationalStatus::ZeroSpeedStaticLoadsOnly {
                unavailable.push(CandidateUnavailable { quantity: "flow_angles",
                    reason: "undefined at exactly zero airspeed; not a fabricated zero observation" });
                unavailable.push(CandidateUnavailable { quantity: "coefficients",
                    reason: "not evaluated at exactly zero airspeed; zero dimensional loads only" });
                unavailable.push(CandidateUnavailable { quantity: "wind_coefficients",
                    reason: "not evaluated at exactly zero airspeed" });
            } else if out.flow_angles.is_some() {
                // Rate support never follows from a static provider alone.
                unavailable.push(CandidateUnavailable { quantity: "static_provider_rate_model",
                    reason: "SB1 is static; the returned rate couple is the separately selected inherited model" });
            }
            let status = if out.status == ac::ComputationalStatus::ZeroSpeedStaticLoadsOnly {
                CandidateComputationalStatus::ZeroSpeedStaticLoadsOnly
            } else {
                CandidateComputationalStatus::Supported
            };
            let cp = CandidateCp { station_from_nose_m: cp.station_from_nose_m,
                kappa_c: cp.kappa_c, reason: cp.reason };
            (status, out.flow_angles, coefficients_datum, coefficients_cg,
             out.wind_coefficients, Some(normal), Some(cp))
        }
        None => {
            if zero_speed {
                (CandidateComputationalStatus::ZeroSpeedStaticLoadsOnly,
                 None, None, None, None, None, None)
            } else if negligibility.is_negligible {
                (CandidateComputationalStatus::StaticLoadsBelowAeroNegligibility,
                 None, None, None, None, None, None)
            } else {
                // Canopy branch: flow is reported as a geometric observation only.
                let flow = ac::flow_angles(to_aero(mech.rel_body)).map_err(map_aero)?;
                (CandidateComputationalStatus::Supported, flow, None, None, None, None, None)
            }
        }
    };

    let (static_force, static_moment) = match &static_eval {
        Some(out) => (to_driver(out.static_loads_at_cg.force_b_n), to_driver(out.static_loads_at_cg.moment_b_nm)),
        None => (Vec3::zero(), Vec3::zero()),
    };
    let rate_moment = recovered_rate_moment(&legacy_dimensional_rate_couple(mech.density,
        mech.airspeed, prepared.vehicle.ref_area(), prepared.vehicle.total_length,
        prepared.vehicle.r_body(), &state.w));
    let (canopy_force_body, canopy_drag_force) = match canopy_force {
        Some(force) => (force, Some(force)),
        None => (Vec3::zero(), None),
    };
    let aero_force_body = add(static_force, canopy_force_body);
    let aero_moment_body = add(static_moment, rate_moment);
    let drag_along_wind_n = if zero_speed {
        unavailable.push(CandidateUnavailable { quantity: "drag_along_wind",
            reason: "no air-relative direction at exactly zero airspeed" });
        0.0
    } else if negligibility.is_negligible {
        unavailable.push(CandidateUnavailable { quantity: "drag_along_wind",
            reason: "no flow observation below the declared aero-negligibility bound" });
        0.0
    } else if mech.airspeed > 0.0 {
        let inv = 1.0 / mech.airspeed;
        let vhat = Vec3 { x: mech.rel_body.x * inv, y: mech.rel_body.y * inv, z: mech.rel_body.z * inv };
        -dot(aero_force_body, vhat)
    } else {
        0.0
    };
    let alpha_deg = mech.alpha_total * 180.0 / std::f64::consts::PI;
    let recovery = canopy.is_some();
    let envelope_alpha_deg = if recovery || flags.rail_bound { 0.0 } else { alpha_deg };

    let force_n = crate::six_dof::rotate_body_to_world(&mech.r_nb, &Vec3 {
        x: aero_force_body.x,
        y: aero_force_body.y + mech.thrust,
        z: aero_force_body.z,
    });
    let force_n = Vec3 { x: force_n.x, y: force_n.y, z: force_n.z - mech.mass * G0 };

    let sample = CandidateSample {
        sample_origin,
        stage_time_s,
        state: *state,
        flags,
        applicability,
        status,
        identities: prepared.ident(),
        profile_environment,
        mechanics: CandidateMechanicsObservation {
            mass_kg: mech.mass,
            cg_from_nose_m: mech.cg_from_nose,
            body_radius_m: prepared.vehicle.r_body(),
            reference_area_m2: prepared.vehicle.ref_area(),
            reference_length_m: prepared.vehicle.total_length,
            density_kg_m3: mech.density,
            speed_of_sound_mps: mech.speed_of_sound,
            airspeed_mps: mech.airspeed,
            mach: mech.mach,
            dynamic_pressure_pa: mech.q_inf,
            thrust_n: mech.thrust,
            wind_n_mps: mech.wind_n,
        },
        flow,
        static_coefficients_at_datum: coefficients_datum,
        static_coefficients_at_cg: coefficients_cg,
        wind_coefficients: wind,
        normal_derivatives: normal,
        cp,
        static_force_body_n: static_force,
        static_moment_cg_body_nm: static_moment,
        rate_moment_body_nm: rate_moment,
        canopy_drag_force_body_n: canopy_drag_force,
        aero_force_body_n: aero_force_body,
        aero_moment_cg_body_nm: aero_moment_body,
        drag_along_wind_n,
        aero_negligibility: negligibility,
        unavailable,
    };
    let driver = DriverLoads {
        loads: Loads {
            force_n,
            moment_b: aero_moment_body,
            inertia_b: mech.inertia_b,
            inertia_dot_b: mech.inertia_dot_b,
            mass: mech.mass,
            validity: StageValidity::Valid,
        },
        airspeed: mech.airspeed,
        mach: mech.mach,
        q_inf: mech.q_inf,
        alpha_total_deg: alpha_deg,
        envelope_alpha_deg,
        drag_axial: drag_along_wind_n,
        thrust: mech.thrust,
        legacy_diagnostic: None,
    };
    Ok(Composed { sample, driver })
}

/// Direct load query at an arbitrary state. Same prepared object and same
/// evaluator as the bounded trajectory; the caller declares time and flags.
pub fn query(
    prepared: &PreparedCandidate,
    stage_time_s: f64,
    state: &RigidState,
    flags: CandidateFlags,
) -> Result<CandidateSample, CandidateLoadError> {
    Ok(compose(prepared, stage_time_s, state, flags, "direct-query")?.sample)
}

/// Static coefficient/load curve over a Mach grid.
///
/// The reference state supplies attitude, altitude, CG and air-relative flow
/// *direction*; each point keeps that direction and altitude while scaling the
/// air-relative speed to the requested Mach. Rate loads are excluded by
/// construction, so this remains a static diagnostic. A canopy-live reference
/// state is refused rather than silently returning airframe coefficients.
///
/// Reference-identical point: a requested Mach that is bit-equal to the
/// measured reference Mach *is* the reference flow state, so it is evaluated
/// from the reference stage measurements (`rel_body`/`airspeed`/`q_inf`/`mach`
/// and the reference profile observation) instead of a reconstructed velocity.
/// The reconstruction `(rel/V)*(M*a)` cancels only in exact arithmetic and
/// perturbs the last bits of the velocity, which perturbs the flow angles and
/// therefore the coefficients; skipping it at the identity point is what makes
/// the report's f64-bit wrench comparison meaningful. Every other point keeps
/// the reconstruction unchanged.
/// Curve grid validation. Shared by the report wrapper (which validates the
/// requested grid before starting a trajectory) and the sampler, which never
/// trusts a caller. Runs before applicability so an invalid grid still refuses at
/// a reference state whose curves are not applicable.
pub fn validate_curve_machs(mach_samples: &[f64]) -> Result<(), CandidateLoadError> {
    if mach_samples.len() > MAX_CURVE_MACHS {
        return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
            reason: format!("curve grid has {} samples; the declared maximum is {MAX_CURVE_MACHS} ({CURVE_APPLICABILITY_POLICY_ID})", mach_samples.len()) });
    }
    for &mach in mach_samples {
        if !mach.is_finite() || mach < 0.0 {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: format!("curve Mach sample {mach} must be finite and nonnegative") });
        }
        if mach >= MAX_MACH_EXCLUSIVE {
            return Err(CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain,
                reason: format!("candidate requires 0 <= Mach < {MAX_MACH_EXCLUSIVE}; curve sample {mach} is outside support") });
        }
    }
    Ok(())
}

/// Static curves with an explicit applicability outcome.
///
/// Order: stage time and state finiteness, attitude normalization, **grid
/// validation**, canopy applicability, the reference stage evaluation (profile
/// coverage/validity errors propagate), zero-airspeed applicability, then per
/// point evaluation. Only the two applicability conditions become
/// `NotApplicable`; every other failure stays an error, so no arbitrary error is
/// converted into data.
pub fn curves_with_applicability(
    prepared: &PreparedCandidate,
    stage_time_s: f64,
    reference_state: &RigidState,
    flags: CandidateFlags,
    mach_samples: &[f64],
) -> Result<CandidateCurves, CandidateLoadError> {
    if !stage_time_s.is_finite() {
        return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
            reason: "stage time must be finite".to_string() });
    }
    if !state_is_finite(reference_state) {
        return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
            reason: "reference state must be finite".to_string() });
    }
    let reference_state = normalize_candidate_attitude(reference_state)?;
    let reference_state = &reference_state;
    validate_curve_machs(mach_samples)?;
    if live_canopy(&prepared.vehicle, flags.drogue_deployed, flags.main_deployed).is_some() {
        return Ok(CandidateCurves::NotApplicable(CandidateCurveNotApplicable {
            reason_id: CURVE_NOT_APPLICABLE_CANOPY_LIVE,
            reason: CURVE_NOT_APPLICABLE_CANOPY_LIVE_REASON,
            reference_time_s: stage_time_s,
            drogue_deployed: flags.drogue_deployed,
            main_deployed: flags.main_deployed,
        }));
    }
    let (mech, reference_observation) = prepared.stage(stage_time_s, reference_state)?;
    if mech.airspeed == 0.0 {
        return Ok(CandidateCurves::NotApplicable(CandidateCurveNotApplicable {
            reason_id: CURVE_NOT_APPLICABLE_NO_FLOW_DIRECTION,
            reason: CURVE_NOT_APPLICABLE_NO_FLOW_DIRECTION_REASON,
            reference_time_s: stage_time_s,
            drogue_deployed: flags.drogue_deployed,
            main_deployed: flags.main_deployed,
        }));
    }
    let reference_mach = mech.mach;
    let inv = 1.0 / mech.airspeed;
    let dir = Vec3 { x: mech.rel_body.x * inv, y: mech.rel_body.y * inv, z: mech.rel_body.z * inv };
    let mut points = Vec::with_capacity(mach_samples.len());
    for &mach in mach_samples {
        let mut unavailable = Vec::new();
        if !mach.is_finite() || mach < 0.0 {
            return Err(CandidateLoadError { kind: CandidateFailureKind::InvalidInput,
                reason: format!("curve Mach sample {mach} must be finite and nonnegative") });
        }
        if mach >= MAX_MACH_EXCLUSIVE {
            return Err(CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain,
                reason: format!("candidate requires 0 <= Mach < {MAX_MACH_EXCLUSIVE}; curve sample {mach} is outside support") });
        }
        let (velocity, q_inf, evaluation_mach, profile_environment) =
            if mach.to_bits() == reference_mach.to_bits() {
                (mech.rel_body, mech.q_inf, reference_mach, reference_observation.clone())
            } else {
                let speed = mach * mech.speed_of_sound;
                let mut velocity = Vec3 { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
                let mut q_inf = 0.5 * mech.density * speed * speed;
                let mut evaluation_mach = mach;
                let profile_environment = if prepared.profile_environment.is_some() {
                    let relative_n = crate::six_dof::rotate_body_to_world(&mech.r_nb, &velocity);
                    let mut point_state = *reference_state;
                    point_state.v = add(relative_n, mech.wind_n);
                    let (point_mech, observation) = prepared.stage(stage_time_s, &point_state)?;
                    velocity = point_mech.rel_body;
                    q_inf = point_mech.q_inf;
                    evaluation_mach = point_mech.mach;
                    if evaluation_mach >= MAX_MACH_EXCLUSIVE {
                        return Err(CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain,
                            reason: "actual reconstructed profile curve Mach is outside SB1 support".into() });
                    }
                    observation
                } else { None };
                (velocity, q_inf, evaluation_mach, profile_environment)
            };
        let input = ac::StaticInput {
            relative_velocity_at_cg_b_mps: to_aero(velocity),
            omega_b_radps: ac::Vec3::ZERO,
            mach: evaluation_mach,
            density_kg_m3: mech.density,
            cg_position_from_nose_b_m: ac::Vec3::new(0.0, -mech.cg_from_nose, 0.0),
        };
        let out = ac::evaluate_static(&prepared.geometry, prepared.references, prepared.datum,
            &prepared.axial, input).map_err(map_aero)?;
        let (force, moment) = (to_driver(out.static_loads_at_cg.force_b_n), to_driver(out.static_loads_at_cg.moment_b_nm));
        let coefficients_cg = match out.static_coefficients_at_datum {
            Some(wrench) => Some(wrench.translated(prepared.datum,
                ac::Datum(ac::Vec3::new(0.0, -mech.cg_from_nose, 0.0)), prepared.references).map_err(map_aero)?),
            None => None,
        };
        let sums = out.normal_derivatives_at_zero_incidence;
        let cp = sums.derivative_cp(None).map_err(map_aero)?;
        let point_negligibility = aero_negligibility(prepared, &mech, evaluation_mach, q_inf, None)?;
        let status = if out.status == ac::ComputationalStatus::ZeroSpeedStaticLoadsOnly {
            unavailable.push(CandidateUnavailable { quantity: "flow_angles",
                reason: "undefined at exactly zero airspeed" });
            unavailable.push(CandidateUnavailable { quantity: "coefficients",
                reason: "not evaluated at exactly zero airspeed; zero dimensional loads only" });
            CandidateComputationalStatus::ZeroSpeedStaticLoadsOnly
        } else {
            CandidateComputationalStatus::Supported
        };
        points.push(CandidateCurvePoint {
            mach,
            profile_environment,
            status,
            static_coefficients_at_datum: out.static_coefficients_at_datum,
            static_coefficients_at_cg: coefficients_cg,
            wind_coefficients: out.wind_coefficients,
            normal_derivatives: Some(CandidateNormalSums {
                c_per_rad: sums.c_per_rad, j_m_per_rad: sums.j_m_per_rad,
                sum_abs_c_per_rad: sums.sum_abs_c_per_rad, sum_abs_j_m_per_rad: sums.sum_abs_j_m_per_rad,
            }),
            cp: Some(CandidateCp { station_from_nose_m: cp.station_from_nose_m, kappa_c: cp.kappa_c, reason: cp.reason }),
            static_force_body_n: force,
            static_moment_cg_body_nm: moment,
            flow: ac::flow_angles(to_aero(velocity)).map_err(map_aero)?,
            dynamic_pressure_pa: q_inf,
            aero_negligibility: point_negligibility,
            unavailable,
        });
    }
    Ok(CandidateCurves::Computed(points))
}

/// Static curves, refusing an inapplicable reference state.
///
/// Existing callers keep an error for a canopy-live or zero-direction reference;
/// only the report path uses [`curves_with_applicability`].
pub fn curves(
    prepared: &PreparedCandidate,
    stage_time_s: f64,
    reference_state: &RigidState,
    flags: CandidateFlags,
    mach_samples: &[f64],
) -> Result<Vec<CandidateCurvePoint>, CandidateLoadError> {
    match curves_with_applicability(prepared, stage_time_s, reference_state, flags, mach_samples)? {
        CandidateCurves::Computed(points) => Ok(points),
        CandidateCurves::NotApplicable(not_applicable) => Err(CandidateLoadError {
            kind: CandidateFailureKind::UnsupportedDomain,
            reason: not_applicable.reason.to_string(),
        }),
    }
}

/// How many committed macro samples a run may collect.
///
/// `ReportBounded` is the runtime policy. `DeclaredFull` exists only for native
/// research captures through the helper seam (never through `simulate_candidate`)
/// and still has a hard ceiling, so no code path is unbounded.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SampleRetention {
    ReportBounded,
    DeclaredFull { max_committed_samples: usize },
}

impl SampleRetention {
    pub fn collected_cap(self) -> Result<usize, String> {
        match self {
            SampleRetention::ReportBounded => Ok(COLLECTED_SAMPLE_CAP),
            SampleRetention::DeclaredFull { max_committed_samples } => {
                if max_committed_samples == 0 || max_committed_samples > RESEARCH_SAMPLE_HARD_MAX {
                    return Err(format!(
                        "candidate-native-sample-retention/1.0.0: maxCommittedSamples must be 1..={RESEARCH_SAMPLE_HARD_MAX} (got {max_committed_samples})"));
                }
                Ok(max_committed_samples)
            }
        }
    }
    pub fn mode_id(self) -> &'static str {
        match self {
            SampleRetention::ReportBounded => "reportBounded",
            SampleRetention::DeclaredFull { .. } => "declaredFull",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct CandidateRunRequest {
    pub horizon_s: f64,
    pub options: CandidateOptions,
}

impl CandidateRunRequest {
    pub fn validate(&self, environment: &CandidateEnvironment) -> Result<SixDofOptions, CandidateLoadError> {
        self.options.to_six_dof(environment)
    }
}

/// Bounded candidate trajectory through the shared driver.
///
/// The returned result is a separate experimental schema: no legacy validity
/// string, no PASS, no landing without touchdown, and prefix maxima labeled as
/// observed committed samples.
pub fn run_bounded(
    prepared: &PreparedCandidate,
    request: &CandidateRunRequest,
) -> Result<CandidateRunResult, CandidateRunError> {
    run_bounded_with_controls(prepared, request, None)
}

/// Candidate-only diagnostic controls seam. `controls: None` is the exact
/// inherited path; ordinary/legacy callers never pass anything else. The
/// mechanism evidence is bookkeeping for the reported run and never alters
/// integration; consumers report it outside compared candidate reports.
///
/// Collection uses the runtime `SampleRetention::ReportBounded` policy; use
/// [`run_bounded_with_retention`] to declare a bounded research capture.
pub fn run_bounded_with_controls(
    prepared: &PreparedCandidate,
    request: &CandidateRunRequest,
    controls: Option<crate::six_dof::CandidateDiagnosticControls>,
) -> Result<CandidateRunResult, CandidateRunError> {
    run_bounded_with_retention(prepared, request, controls, SampleRetention::ReportBounded)
}

/// Bounded run with an explicit declared collection policy. The cap is enforced
/// before a further macro sample is composed, so a run that cannot fit refuses
/// with the policy ID and the exact limit instead of exhausting memory.
pub fn run_bounded_with_retention(
    prepared: &PreparedCandidate,
    request: &CandidateRunRequest,
    controls: Option<crate::six_dof::CandidateDiagnosticControls>,
    retention: SampleRetention,
) -> Result<CandidateRunResult, CandidateRunError> {
    let collected_cap = retention.collected_cap().map_err(|reason| CandidateRunError {
        reason: reason.clone(), driver_message: reason, record: None, resource_limit: true })?;
    let options = request.validate(&prepared.environment)?;
    let captured: RefCell<Option<CandidateEvaluationRecord>> = RefCell::new(None);
    let committed: RefCell<Vec<CandidateSample>> = RefCell::new(Vec::new());
    let resource_refusal: RefCell<bool> = RefCell::new(false);
    let driver_result = {
    let evaluator = |context: LoadContext, state: &RigidState| -> Result<DriverLoads, String> {
        let phase = phase_label(context.phase);
        let flags = CandidateFlags {
            drogue_deployed: context.drogue_deployed,
            main_deployed: context.main_deployed,
            rail_bound: context.rail_bound,
        };
        let origin = if context.phase == LoadPhase::MacroSample {
            "committed-macro-sample"
        } else {
            "stage-evaluation"
        };
        if context.phase == LoadPhase::MacroSample && committed.borrow().len() >= collected_cap {
            *resource_refusal.borrow_mut() = true;
            return Err(format!(
                "[{COLLECTED_SAMPLE_CAP_ID}] committed macro samples would exceed {collected_cap}; increase timeStep or shorten the horizon"));
        }
        match compose(prepared, context.time, state, flags, origin) {
            Ok(composed) => {
                if context.phase == LoadPhase::MacroSample {
                    committed.borrow_mut().push(composed.sample);
                }
                Ok(composed.driver)
            }
            Err(error) => {
                let composition_id = prepared.ident().composition_id;
                let record = CandidateEvaluationRecord {
                    model_id: composition_id,
                    composition_id,
                    phase,
                    stage_time_s: context.time,
                    drogue_deployed: context.drogue_deployed,
                    main_deployed: context.main_deployed,
                    rail_bound: context.rail_bound,
                    state: *state,
                    kind: error.kind,
                    reason: error.reason.clone(),
                };
                let message = format!("[{}] {} at t={} s ({}; speculative={})",
                    composition_id, error.reason, context.time, phase.label, phase.speculative);
                *captured.borrow_mut() = Some(record);
                Err(message)
            }
        }
    };
    if prepared.profile_environment.is_some() {
        crate::six_dof::drive_profile_candidate(&prepared.vehicle, &prepared.motor, &options, request.horizon_s, &evaluator, controls)
    } else {
        drive_candidate(&prepared.vehicle, &prepared.motor, &options, request.horizon_s, &evaluator, controls)
    }
    };
    match driver_result {
        Ok(outcome) => {
            let mut samples = committed.into_inner();
            if outcome.touched_down || samples.last().map_or(true, |s| s.stage_time_s != outcome.final_time) {
                let flags = CandidateFlags {
                    drogue_deployed: outcome.final_flags.drogue_deployed,
                    main_deployed: outcome.final_flags.main_deployed,
                    rail_bound: outcome.final_flags.rail_bound,
                };
                let final_sample = compose(prepared, outcome.final_time, &outcome.final_state,
                    flags, "committed-final-read").map_err(|error| CandidateRunError {
                        reason: error.reason.clone(),
                        driver_message: String::new(),
                        record: Some(CandidateEvaluationRecord {
                            model_id: prepared.ident().composition_id,
                            composition_id: prepared.ident().composition_id,
                            phase: CandidatePhaseLabel { label: "committed-final-read", speculative: false },
                            stage_time_s: outcome.final_time,
                            drogue_deployed: flags.drogue_deployed,
                            main_deployed: flags.main_deployed,
                            rail_bound: flags.rail_bound,
                            state: outcome.final_state,
                            kind: error.kind,
                            reason: error.reason,
                        }),
                        resource_limit: false,
                    })?.sample;
                samples.push(final_sample);
            }
            let termination = if outcome.touched_down { CandidateTermination::Touchdown } else { CandidateTermination::TimeLimit };
            assemble_result(prepared, request, termination, outcome.final_time, outcome.final_state,
                outcome.final_flags, samples, outcome.result.events, outcome.mechanism)
        }
        Err(driver_message) => {
            let record = captured.into_inner();
            let reason = match &record {
                Some(r) => format!("{} ({}, t={} s)", r.reason, r.phase.label, r.stage_time_s),
                None => driver_message.clone(),
            };
            Err(CandidateRunError { reason, driver_message, record,
                resource_limit: resource_refusal.into_inner() })
        }
    }
}

fn assemble_result(
    prepared: &PreparedCandidate,
    request: &CandidateRunRequest,
    termination: CandidateTermination,
    final_time_s: f64,
    final_state: RigidState,
    final_flags: DriverFlags,
    samples: Vec<CandidateSample>,
    events: Vec<SimEvent>,
    mechanism: crate::six_dof::MechanismEvidence,
) -> Result<CandidateRunResult, CandidateRunError> {
    if !final_time_s.is_finite() {
        return Err(CandidateRunError { reason: "nonfinite final time from the shared driver".to_string(),
            driver_message: String::new(), record: None, resource_limit: false });
    }
    let flags = CandidateFlags { drogue_deployed: final_flags.drogue_deployed,
        main_deployed: final_flags.main_deployed, rail_bound: final_flags.rail_bound };
    let (mut max_alt, mut max_alt_t) = (f64::NEG_INFINITY, 0.0);
    let (mut max_speed, mut max_speed_t) = (f64::NEG_INFINITY, 0.0);
    let (mut max_q, mut max_q_t) = (f64::NEG_INFINITY, 0.0);
    for sample in &samples {
        if sample.state.r.z > max_alt { max_alt = sample.state.r.z; max_alt_t = sample.stage_time_s; }
        if sample.mechanics.airspeed_mps > max_speed { max_speed = sample.mechanics.airspeed_mps; max_speed_t = sample.stage_time_s; }
        if sample.mechanics.dynamic_pressure_pa > max_q { max_q = sample.mechanics.dynamic_pressure_pa; max_q_t = sample.stage_time_s; }
    }
    if samples.is_empty() {
        max_alt = final_state.r.z; max_speed = 0.0; max_q = 0.0;
    }
    let sample_count = samples.len();
    let landing = match termination {
        CandidateTermination::Touchdown => {
            let (mech, _) = prepared.stage(final_time_s, &final_state)?;
            let speed = (final_state.v.x * final_state.v.x + final_state.v.y * final_state.v.y
                + final_state.v.z * final_state.v.z).sqrt();
            let description = events.iter().rev()
                .find(|e| e.name == "Ground Touchdown")
                .map(|e| e.description.clone())
                .unwrap_or_else(|| "Ground Touchdown".to_string());
            Some(CandidateTouchdownEvidence {
                time_s: final_time_s,
                position_n_m: Vec3 { x: final_state.r.x, y: final_state.r.y, z: 0.0 },
                speed_mps: speed,
                mass_kg: mech.mass,
                event_description: description,
            })
        }
        CandidateTermination::TimeLimit => None,
    };
    let apogee_event = events.iter()
        .find(|e| e.name == "Apogee & Drogue Deployment")
        .map(|e| CandidateApogeeEvent { time_s: e.time, altitude_agl_m: e.altitude,
            velocity_mps: e.velocity, description: e.description.clone() });
    Ok(CandidateRunResult {
        schema_id: RESULT_SCHEMA_ID,
        identities: prepared.ident(),
        requested_horizon_s: request.horizon_s,
        final_time_s,
        final_state,
        final_flags: flags,
        termination,
        mechanism,
        computational_completion: match termination {
            CandidateTermination::Touchdown => CandidateComputationalCompletion::CompletedTouchdown,
            CandidateTermination::TimeLimit => CandidateComputationalCompletion::CompletedRequestedHorizon,
        },
        empirical_qualification: ac::EmpiricalQualification::Unqualified,
        dynamic_qualification: CandidateDynamicQualification::Unknown,
        committed_samples: samples,
        events,
        observed_prefix: CandidateObservedPrefix {
            sampling_policy_id: PREFIX_POLICY_ID,
            sample_count: sample_count,
            max_altitude_agl_m: max_alt,
            max_altitude_time_s: max_alt_t,
            max_airspeed_mps: max_speed,
            max_airspeed_time_s: max_speed_t,
            max_dynamic_pressure_pa: max_q,
            max_dynamic_pressure_time_s: max_q_t,
            note: "highest committed prefix sample, not a predicted final apogee or qualified peak",
        },
        landing,
        apogee_event,
        limitations: prepared.limitations(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;
    include!("flight_provider/profile_tests.rs");

    fn references() -> ac::References {
        ac::References::canonical(0.1).unwrap()
    }

    fn geometry() -> ac::CandidateGeometry {
        let area = PI * 0.05 * 0.05;
        ac::CandidateGeometry {
            identity: "synthetic-cone-cylinder-fin-fixture".to_string(),
            integral_provenance: "analytic cone/cylinder areas; algebra only".to_string(),
            declarations: ac::GeometryDeclarations {
                sharp_nosed_axisymmetric_circular: true,
                smooth_slender_profile: true,
                identical_equally_spaced_thin_uncanted_fins: true,
            },
            body: vec![
                ac::BodyIntervalIntegrals { x0_m: 0.0, x1_m: 0.3, area0_m2: 0.0,
                    area1_m2: area, integral_area_m3: area * 0.3 / 3.0 },
                ac::BodyIntervalIntegrals { x0_m: 0.3, x1_m: 1.0, area0_m2: area,
                    area1_m2: area, integral_area_m3: area * 0.7 },
            ],
            fins: ac::TrapezoidFinSet { count: 4, exposed_semispan_m: 0.08,
                local_body_radius_m: 0.05, root_chord_m: 0.2, tip_chord_m: 0.1,
                tip_le_sweep_m: 0.05, root_le_station_m: 0.7 },
        }
    }

    fn carrier() -> Vehicle {
        Vehicle {
            dry_mass: 0.5,
            cg_from_nose: 0.55,
            total_length: 1.0,
            ref_diameter: 0.1,
            cna_body: 2.0,
            cna_fins: 6.5,
            body_first_moment: 0.4,
            fin_first_moment: 4.9,
            body_abs_cna: 2.0,
            fin_abs_cna: 6.5,
            motor_aft_station_from_nose: 1.0,
            drogue: Some(Parachute { diameter: 0.3, cd: 0.8 }),
            main_chute: Some(Parachute { diameter: 0.3, cd: 0.8 }),
            aero_powered_cd: vec![0.5; 25],
            aero_coasting_cd: vec![0.5; 25],
            supersonic_normal: None,
        }
    }

    fn motor() -> MotorSpec {
        MotorSpec {
            designation: "synthetic-bounded-test-motor".to_string(),
            diameter: 0.018,
            length: 0.07,
            burn_time: 1.0,
            propellant_mass: 0.02,
            total_mass: 0.06,
            dry_mass: 0.04,
            max_thrust: 24.0,
            thrust_curve: vec![
                crate::six_dof::ThrustPoint { time: 0.0, thrust: 0.0 },
                crate::six_dof::ThrustPoint { time: 0.05, thrust: 18.0 },
                crate::six_dof::ThrustPoint { time: 0.9, thrust: 12.0 },
                crate::six_dof::ThrustPoint { time: 1.0, thrust: 0.0 },
            ],
        }
    }

    fn environment() -> CandidateEnvironment {
        CandidateEnvironment { launch_altitude_asl_m: 0.0, wind_speed_surface_mps: 0.0, wind_azimuth_deg: 90.0 }
    }

    fn source() -> CandidateSourceDeclarations {
        CandidateSourceDeclarations {
            adapter_id: "synthetic-test-adapter".to_string(),
            caller_source_identity: "synthetic-not-as-flown".to_string(),
            mechanical_source_id: "synthetic-test-carrier".to_string(),
            environment_source_id: "synthetic still air; retained ISA-1976".to_string(),
        }
    }

    fn axial() -> ac::PrescribedAxial {
        ac::PrescribedAxial { ca0: 0.35, provider_id: "fixture-prescribed-CA0".to_string(),
            input_identity: "constant-fixture-0.35".to_string() }
    }

    fn preparation() -> CandidatePreparation {
        CandidatePreparation { geometry: geometry(), references: references(),
            datum: ac::Datum::NOSE, axial: axial(), mechanical_vehicle: carrier(),
            motor: motor(), environment: environment(), source: source() }
    }

    fn prepared() -> PreparedCandidate { PreparedCandidate::prepare(preparation()).unwrap() }

    fn options() -> CandidateOptions {
        CandidateOptions { rail_length_m: 3.0, rail_elevation_deg: 85.0, rail_azimuth_deg: 0.0,
            main_deploy_altitude_agl_m: 250.0, time_step_s: 0.01,
            drag_cd_scale: None, fin_cant_angle_deg: None }
    }

    fn run(prepared: &PreparedCandidate, horizon_s: f64) -> CandidateRunResult {
        run_bounded(prepared, &CandidateRunRequest { horizon_s, options: options() }).unwrap()
    }

    fn state_at(velocity: Vec3, omega: Vec3) -> RigidState {
        RigidState { r: Vec3 { x: 0.0, y: 0.0, z: 60.0 }, v: velocity,
            q: crate::six_dof::Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: omega }
    }

    fn near(a: f64, b: f64) { assert!((a - b).abs() <= 1e-12 * (1.0 + a.abs().max(b.abs())), "{a} != {b}"); }
    fn vector_near(a: Vec3, b: Vec3) { near(a.x, b.x); near(a.y, b.y); near(a.z, b.z); }
    fn wrench_near(a: ac::CoefficientWrench, b: ac::CoefficientWrench) {
        vector_near(to_driver(a.cf_b), to_driver(b.cf_b));
        vector_near(to_driver(a.cm_b), to_driver(b.cm_b));
    }

    #[test]
    fn preparation_refuses_omitted_inconsistent_and_incompatible_inputs() {
        let mut input = preparation();
        input.source.adapter_id.clear();
        assert!(PreparedCandidate::prepare(input).is_err());
        let mut input = preparation();
        input.axial.input_identity.clear();
        assert!(PreparedCandidate::prepare(input).is_err());
        let mut input = preparation();
        input.references = ac::References::canonical(0.2).unwrap();
        let error = PreparedCandidate::prepare(input).unwrap_err();
        assert_eq!(error.kind, CandidateFailureKind::InconsistentPreparation);
        let mut input = preparation();
        input.mechanical_vehicle.total_length = 1.5;
        assert_eq!(PreparedCandidate::prepare(input).unwrap_err().kind, CandidateFailureKind::InconsistentPreparation);
        let mut input = preparation();
        input.mechanical_vehicle.motor_aft_station_from_nose = 0.02;
        assert_eq!(PreparedCandidate::prepare(input).unwrap_err().kind, CandidateFailureKind::InconsistentPreparation);
        let mut input = preparation();
        input.motor.diameter = 0.2;
        assert_eq!(PreparedCandidate::prepare(input).unwrap_err().kind, CandidateFailureKind::InconsistentPreparation);
        let mut input = preparation();
        input.geometry.declarations.smooth_slender_profile = false;
        assert_eq!(PreparedCandidate::prepare(input).unwrap_err().kind, CandidateFailureKind::UnsupportedDomain);
        let mut input = preparation();
        input.environment.wind_speed_surface_mps = f64::NAN;
        assert_eq!(PreparedCandidate::prepare(input).unwrap_err().kind, CandidateFailureKind::InvalidInput);
        let mut input = preparation();
        input.environment.launch_altitude_asl_m = 25_000.0;
        assert_eq!(PreparedCandidate::prepare(input).unwrap_err().kind, CandidateFailureKind::UnsupportedDomain);
        let mut input = preparation();
        input.mechanical_vehicle.dry_mass = 0.0;
        assert!(PreparedCandidate::prepare(input).is_err());
    }

    #[test]
    fn poisoned_legacy_slope_and_drag_carriers_cannot_change_a_candidate_run() {
        // A: absurd finite legacy carriers; B: NaN legacy carriers. Preparation
        // overwrites both, and the trajectory must be identical.
        let mut a = preparation();
        a.mechanical_vehicle.cna_body = 1e9;
        a.mechanical_vehicle.cna_fins = -1e9;
        a.mechanical_vehicle.body_first_moment = 1e12;
        a.mechanical_vehicle.fin_first_moment = -1e12;
        a.mechanical_vehicle.body_abs_cna = 1e12;
        a.mechanical_vehicle.fin_abs_cna = 1e12;
        a.mechanical_vehicle.aero_powered_cd = vec![1e6; 25];
        a.mechanical_vehicle.aero_coasting_cd = vec![-1e6; 25];
        let mut b = preparation();
        b.mechanical_vehicle.cna_body = f64::NAN;
        b.mechanical_vehicle.aero_powered_cd = vec![f64::NAN];
        let run_a = run_bounded(&PreparedCandidate::prepare(a).unwrap(),
            &CandidateRunRequest { horizon_s: 1.2, options: options() }).unwrap();
        let run_b = run_bounded(&PreparedCandidate::prepare(b).unwrap(),
            &CandidateRunRequest { horizon_s: 1.2, options: options() }).unwrap();
        assert_eq!(run_a.committed_samples.len(), run_b.committed_samples.len());
        for (sa, sb) in run_a.committed_samples.iter().zip(run_b.committed_samples.iter()) {
            near(sa.static_force_body_n.y, sb.static_force_body_n.y);
            near(sa.aero_moment_cg_body_nm.x, sb.aero_moment_cg_body_nm.x);
            near(sa.mechanics.mach, sb.mechanics.mach);
            assert!(sa.static_force_body_n.y.is_finite());
        }
        assert!(run_a.committed_samples.iter().all(|s| s.static_force_body_n.y.is_finite()));
    }

    /// Dimensional (tolerance) check retained as a cross-evaluator sanity test.
    /// It is *not* the reference-Mach identity proof; see
    /// `reference_mach_curve_point_reproduces_the_reference_composition_bits`.
    #[test]
    fn one_prepared_object_drives_trajectory_query_and_curve_identically() {
        let prepared = prepared();
        let result = run(&prepared, 1.2);
        assert!(result.committed_samples.len() > 50, "bounded ascent must be sampled");
        let sample = result.committed_samples.iter()
            .find(|s| s.stage_time_s > 0.5).expect("committed sample").clone();
        assert_eq!(sample.applicability, CandidateApplicability::AirframeStaticRateComposition);
        assert_eq!(sample.status, CandidateComputationalStatus::Supported);
        let queried = query(&prepared, sample.stage_time_s, &sample.state, sample.flags).unwrap();
        wrench_near(sample.static_coefficients_at_datum.unwrap(), queried.static_coefficients_at_datum.unwrap());
        wrench_near(sample.static_coefficients_at_cg.unwrap(), queried.static_coefficients_at_cg.unwrap());
        near(sample.cp.unwrap().station_from_nose_m.unwrap(), queried.cp.unwrap().station_from_nose_m.unwrap());
        vector_near(queried.static_force_body_n, sample.static_force_body_n);
        vector_near(queried.static_moment_cg_body_nm, sample.static_moment_cg_body_nm);
        let points = curves(&prepared, sample.stage_time_s, &sample.state, sample.flags,
            &[sample.mechanics.mach]).unwrap();
        let point = &points[0];
        wrench_near(point.static_coefficients_at_datum.unwrap(), queried.static_coefficients_at_datum.unwrap());
        wrench_near(point.static_coefficients_at_cg.unwrap(), queried.static_coefficients_at_cg.unwrap());
        near(point.cp.unwrap().station_from_nose_m.unwrap(), queried.cp.unwrap().station_from_nose_m.unwrap());
        // Dimensional loads differ only by the reconstructed speed's last bits.
        near(point.dynamic_pressure_pa, queried.mechanics.dynamic_pressure_pa);
        assert_eq!(point.status, CandidateComputationalStatus::Supported);
    }

    fn f64_bits_equal(a: f64, b: f64) -> bool { a.to_bits() == b.to_bits() }
    fn vec3_bits_equal(a: Vec3, b: Vec3) -> bool {
        f64_bits_equal(a.x, b.x) && f64_bits_equal(a.y, b.y) && f64_bits_equal(a.z, b.z)
    }
    fn wrench_bits_equal(a: ac::CoefficientWrench, b: ac::CoefficientWrench) -> bool {
        vec3_bits_equal(to_driver(a.cf_b), to_driver(b.cf_b))
            && vec3_bits_equal(to_driver(a.cm_b), to_driver(b.cm_b))
    }
    /// Query-only statement: the static provider does not carry rate loads; the
    /// composed query names the separately selected rate couple, a static curve
    /// excludes rate loads by construction. Removed before comparing the two
    /// `unavailable` lists, which is unrelated to the sampling rule.
    fn without_rate_note(list: &[CandidateUnavailable]) -> Vec<(&'static str, &'static str)> {
        list.iter().filter(|u| u.quantity != "static_provider_rate_model")
            .map(|u| (u.quantity, u.reason)).collect()
    }

    /// The reference-Mach curve point is the reference flow state itself: it must
    /// reproduce the composed reference sample's observations bit for bit, while
    /// a neighbouring Mach still uses the reconstruction path.
    #[test]
    fn reference_mach_curve_point_reproduces_the_reference_composition_bits() {
        let prepared = prepared();
        let result = run(&prepared, 1.2);
        let sample = result.committed_samples.iter()
            .find(|s| s.status == CandidateComputationalStatus::Supported
                && s.flow.map_or(false, |f| f.incidence_rad != 0.0))
            .expect("the fixture must produce a supported nonzero-incidence committed sample").clone();
        let queried = query(&prepared, sample.stage_time_s, &sample.state, sample.flags).unwrap();
        let reference_mach = sample.mechanics.mach;
        assert_eq!(reference_mach.to_bits(), queried.mechanics.mach.to_bits());
        let points = curves(&prepared, sample.stage_time_s, &sample.state, sample.flags,
            &[0.05, reference_mach]).unwrap();
        let point = points.iter().find(|p| p.mach.to_bits() == reference_mach.to_bits())
            .expect("the requested reference Mach must be present");
        assert_eq!(point.status, CandidateComputationalStatus::Supported);
        assert!(f64_bits_equal(point.dynamic_pressure_pa, queried.mechanics.dynamic_pressure_pa));
        assert!(wrench_bits_equal(point.static_coefficients_at_datum.expect("datum wrench"),
            queried.static_coefficients_at_datum.expect("datum wrench")));
        assert!(wrench_bits_equal(point.static_coefficients_at_cg.expect("cg wrench"),
            queried.static_coefficients_at_cg.expect("cg wrench")));
        assert!(vec3_bits_equal(point.static_force_body_n, queried.static_force_body_n));
        assert!(vec3_bits_equal(point.static_moment_cg_body_nm, queried.static_moment_cg_body_nm));
        let pf = point.flow.expect("curve flow"); let qf = queried.flow.expect("query flow");
        assert!(f64_bits_equal(pf.alpha_rad, qf.alpha_rad) && f64_bits_equal(pf.beta_rad, qf.beta_rad)
            && f64_bits_equal(pf.incidence_rad, qf.incidence_rad));
        assert!(f64_bits_equal(point.cp.expect("cp").station_from_nose_m.expect("station"),
            queried.cp.expect("cp").station_from_nose_m.expect("station")));
        assert_eq!(point.cp.expect("cp").kappa_c.map(f64::to_bits),
            queried.cp.expect("cp").kappa_c.map(f64::to_bits));
        let pn = point.normal_derivatives.expect("derivatives"); let qn = queried.normal_derivatives.expect("derivatives");
        assert!(f64_bits_equal(pn.c_per_rad, qn.c_per_rad) && f64_bits_equal(pn.j_m_per_rad, qn.j_m_per_rad)
            && f64_bits_equal(pn.sum_abs_c_per_rad, qn.sum_abs_c_per_rad)
            && f64_bits_equal(pn.sum_abs_j_m_per_rad, qn.sum_abs_j_m_per_rad));
        let pw = point.wind_coefficients.expect("wind"); let qw = queried.wind_coefficients.expect("wind");
        assert!(f64_bits_equal(pw.drag, qw.drag) && f64_bits_equal(pw.lift, qw.lift) && f64_bits_equal(pw.side, qw.side));
        assert!(f64_bits_equal(point.aero_negligibility.relative_bound, queried.aero_negligibility.relative_bound)
            && f64_bits_equal(point.aero_negligibility.max_possible_force_n, queried.aero_negligibility.max_possible_force_n)
            && f64_bits_equal(point.aero_negligibility.weight_n, queried.aero_negligibility.weight_n));
        assert_eq!(point.aero_negligibility.is_negligible, queried.aero_negligibility.is_negligible);
        assert_eq!(without_rate_note(&point.unavailable), without_rate_note(&queried.unavailable));
        // Non-vacuity: the fixture sample really is off-axis, so the removed
        // reconstruction is the only reason the bits used to differ.
        let incidence = qf.incidence_rad.to_degrees();
        assert!(incidence != 0.0 && incidence.abs() < MAX_INCIDENCE_DEG, "incidence {incidence}");
        let neighbour = points.iter().find(|p| p.mach == 0.05).expect("neighbour point");
        assert_eq!(neighbour.status, CandidateComputationalStatus::Supported);
        assert!(neighbour.mach.to_bits() != reference_mach.to_bits());
    }

    fn airframe_flags() -> CandidateFlags {
        CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: false }
    }
    fn canopy_flags() -> CandidateFlags {
        CandidateFlags { drogue_deployed: true, main_deployed: false, rail_bound: false }
    }

    fn not_applicable(outcome: CandidateCurves) -> CandidateCurveNotApplicable {
        match outcome {
            CandidateCurves::NotApplicable(reason) => reason,
            CandidateCurves::Computed(points) => panic!("expected not-applicable, got {} points", points.len()),
        }
    }

    #[test]
    fn canopy_live_and_zero_airspeed_references_are_not_applicable_not_errors() {
        let prepared = prepared();
        let flying = state_at(Vec3 { x: 0.0, y: 90.0, z: 0.0 }, Vec3::zero());
        let reason = not_applicable(curves_with_applicability(&prepared, 0.4, &flying,
            canopy_flags(), &[0.05, 0.1]).unwrap());
        assert_eq!(reason.reason_id, CURVE_NOT_APPLICABLE_CANOPY_LIVE);
        assert_eq!(reason.reference_time_s.to_bits(), 0.4f64.to_bits());
        assert!(reason.drogue_deployed && !reason.main_deployed);
        let main_only = CandidateFlags { main_deployed: true, ..canopy_flags() };
        assert_eq!(not_applicable(curves_with_applicability(&prepared, 0.4, &flying,
            main_only, &[0.1]).unwrap()).reason_id, CURVE_NOT_APPLICABLE_CANOPY_LIVE);
        let rest = state_at(Vec3::zero(), Vec3::zero());
        let reason = not_applicable(curves_with_applicability(&prepared, 0.4, &rest,
            airframe_flags(), &[0.1]).unwrap());
        assert_eq!(reason.reason_id, CURVE_NOT_APPLICABLE_NO_FLOW_DIRECTION);
        // The refusing wrapper keeps its accepted meaning and message.
        let error = curves(&prepared, 0.4, &flying, canopy_flags(), &[0.1]).unwrap_err();
        assert_eq!(error.kind, CandidateFailureKind::UnsupportedDomain);
        assert_eq!(error.reason, CURVE_NOT_APPLICABLE_CANOPY_LIVE_REASON);
        let error = curves(&prepared, 0.4, &rest, airframe_flags(), &[0.1]).unwrap_err();
        assert_eq!(error.reason, CURVE_NOT_APPLICABLE_NO_FLOW_DIRECTION_REASON);
    }

    /// An invalid grid or invalid state still refuses even when the reference
    /// state would otherwise be reported as not applicable. Grid validation runs
    /// before applicability, and applicability never swallows a real error.
    #[test]
    fn curve_grid_and_state_validation_precede_applicability() {
        let prepared = prepared();
        let flying = state_at(Vec3 { x: 0.0, y: 90.0, z: 0.0 }, Vec3::zero());
        for (grid, kind) in [(vec![0.9], CandidateFailureKind::UnsupportedDomain),
            (vec![f64::NAN], CandidateFailureKind::InvalidInput),
            (vec![-1.0], CandidateFailureKind::InvalidInput)] {
            let error = curves_with_applicability(&prepared, 0.4, &flying, canopy_flags(), &grid)
                .unwrap_err();
            assert_eq!(error.kind, kind, "grid {grid:?}");
        }
        let oversized = vec![0.1f64; MAX_CURVE_MACHS + 1];
        let error = curves_with_applicability(&prepared, 0.4, &flying, canopy_flags(), &oversized)
            .unwrap_err();
        assert_eq!(error.kind, CandidateFailureKind::InvalidInput);
        assert!(error.reason.contains(CURVE_APPLICABILITY_POLICY_ID));
        // Reference-state errors are never converted into an applicability claim.
        let mut bad_attitude = flying;
        bad_attitude.q.w = 1.1;
        for flags in [canopy_flags(), airframe_flags()] {
            let error = curves_with_applicability(&prepared, 0.4, &bad_attitude, flags, &[0.1])
                .unwrap_err();
            assert!(error.reason.contains(ATTITUDE_POLICY_ID));
            let error = curves_with_applicability(&prepared, f64::NAN, &flying, flags, &[0.1])
                .unwrap_err();
            assert_eq!(error.kind, CandidateFailureKind::InvalidInput);
        }
    }

    /// The declared collection cap is a resource policy: it refuses with the
    /// policy ID and the exact limit and is not reported as a domain/geometry
    /// failure. The hard research ceiling is enforced at the same entry point.
    #[test]
    fn collection_cap_refuses_with_the_policy_and_limit_instead_of_growing() {
        let prepared = prepared();
        let request = CandidateRunRequest { horizon_s: 1.2, options: options() };
        let error = run_bounded_with_retention(&prepared, &request, None,
            SampleRetention::DeclaredFull { max_committed_samples: 16 }).unwrap_err();
        assert!(error.reason.contains(COLLECTED_SAMPLE_CAP_ID), "{}", error.reason);
        assert!(error.reason.contains("exceed 16"), "{}", error.reason);
        assert!(error.record.is_none(), "a resource refusal must not claim a phase/domain failure");
        assert!(error.resource_limit, "the collection cap is a declared resource policy");
        assert!(SampleRetention::DeclaredFull { max_committed_samples: RESEARCH_SAMPLE_HARD_MAX + 1 }
            .collected_cap().is_err());
        assert!(SampleRetention::DeclaredFull { max_committed_samples: 0 }.collected_cap().is_err());
        assert_eq!(SampleRetention::ReportBounded.collected_cap().unwrap(), COLLECTED_SAMPLE_CAP);
        assert_eq!(SampleRetention::ReportBounded.mode_id(), "reportBounded");
        // The runtime policy accepts the same horizon and keeps every sample.
        let result = run(&prepared, 1.2);
        assert!(result.committed_samples.len() > 16);
        assert!(result.committed_samples.len() < COLLECTED_SAMPLE_CAP);
        // A declared capture above the fixture's sample count reproduces the
        // runtime result exactly (the policy only bounds collection).
        let declared = run_bounded_with_retention(&prepared, &request, None,
            SampleRetention::DeclaredFull { max_committed_samples: 20_000 }).unwrap();
        assert_eq!(declared.committed_samples.len(), result.committed_samples.len());
        assert_eq!(declared.final_state.r.z.to_bits(), result.final_state.r.z.to_bits());
    }

    #[test]
    fn signed_rate_couple_is_dimensional_and_static_diagnostics_stay_static() {
        let prepared = prepared();
        let omega = Vec3 { x: 0.3, y: -0.5, z: 0.7 };
        let with_rates = query(&prepared, 0.4, &state_at(Vec3 { x: 0.0, y: 90.0, z: 1.0 }, omega),
            CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: false }).unwrap();
        let static_only = query(&prepared, 0.4, &state_at(Vec3 { x: 0.0, y: 90.0, z: 1.0 }, Vec3::zero()),
            CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: false }).unwrap();
        // Independent recomputation from the documented inherited expression.
        let rho = with_rates.mechanics.density_kg_m3;
        let v = with_rates.mechanics.airspeed_mps;
        let area = with_rates.mechanics.reference_area_m2;
        let length = with_rates.mechanics.reference_length_m;
        let radius = with_rates.mechanics.body_radius_m;
        let pitch = 0.5 * rho * v * area * length * length * 1.5 * omega.x;
        let yaw = 0.5 * rho * v * area * length * length * 1.5 * omega.z;
        let roll = 0.25 * rho * v * area * radius * radius * 4.0 * omega.y;
        near(with_rates.rate_moment_body_nm.x, -pitch);
        near(with_rates.rate_moment_body_nm.y, -roll);
        near(with_rates.rate_moment_body_nm.z, -yaw);
        // The rate contribution is a force-free pure couple: it changes no force,
        // and the composed aerodynamic moment is the static CG moment plus that
        // separately identified increment at the same flow state.
        vector_near(with_rates.aero_force_body_n, static_only.aero_force_body_n);
        vector_near(with_rates.aero_moment_cg_body_nm,
            add(with_rates.static_moment_cg_body_nm, with_rates.rate_moment_body_nm));
        // Static coefficients and static CG moments are unchanged by omega.
        wrench_near(with_rates.static_coefficients_at_datum.unwrap(), static_only.static_coefficients_at_datum.unwrap());
        wrench_near(with_rates.static_coefficients_at_cg.unwrap(), static_only.static_coefficients_at_cg.unwrap());
        vector_near(with_rates.static_moment_cg_body_nm, static_only.static_moment_cg_body_nm);
        vector_near(with_rates.static_force_body_n, static_only.static_force_body_n);
        // Curve samples are static: no rate moment is represented or added, and
        // at the same Mach the geometry derivative is the identical evaluation.
        let points = curves(&prepared, 0.4, &with_rates.state, with_rates.flags,
            &[with_rates.mechanics.mach]).unwrap();
        assert_eq!(points.len(), 1);
        assert_eq!(points[0].status, CandidateComputationalStatus::Supported);
        assert_eq!(points[0].normal_derivatives.unwrap().c_per_rad.to_bits(),
            static_only.normal_derivatives.unwrap().c_per_rad.to_bits());
        // A pure rate change moves only its own axis, with the inherited sign.
        for (axis, label) in [(Vec3 { x: 0.2, y: 0.0, z: 0.0 }, "pitch"),
            (Vec3 { x: 0.0, y: 0.2, z: 0.0 }, "roll"), (Vec3 { x: 0.0, y: 0.0, z: 0.2 }, "yaw")] {
            let sample = query(&prepared, 0.4, &state_at(Vec3 { x: 0.0, y: 90.0, z: 1.0 }, axis),
                CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: false }).unwrap();
            let moment = sample.rate_moment_body_nm;
            match label {
                "pitch" => { assert!(moment.x < 0.0); near(moment.y, 0.0); near(moment.z, 0.0); }
                "roll" => { assert!(moment.y < 0.0); near(moment.x, 0.0); near(moment.z, 0.0); }
                _ => { assert!(moment.z < 0.0); near(moment.x, 0.0); near(moment.y, 0.0); }
            }
        }
    }

    #[test]
    fn off_axis_datum_translation_preserves_the_cg_wrench_and_pure_couple() {
        let nose = prepared();
        let mut shifted_input = preparation();
        shifted_input.datum = ac::Datum::centerline(0.2);
        let shifted = PreparedCandidate::prepare(shifted_input).unwrap();
        let state = state_at(Vec3 { x: 0.3, y: 90.0, z: 0.7 }, Vec3 { x: 0.2, y: 0.1, z: -0.3 });
        let flags = CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: false };
        let a = query(&nose, 0.4, &state, flags).unwrap();
        let b = query(&shifted, 0.4, &state, flags).unwrap();
        // The dimensional force and CG moment are datum-independent; only the
        // coefficient representation at the chosen datum moves.
        vector_near(a.static_force_body_n, b.static_force_body_n);
        vector_near(a.static_moment_cg_body_nm, b.static_moment_cg_body_nm);
        assert_ne!(a.static_coefficients_at_datum.unwrap().cm_b.x.to_bits(),
            b.static_coefficients_at_datum.unwrap().cm_b.x.to_bits());
        // The CP station is a nose-station diagnostic, independent of the datum.
        near(a.cp.unwrap().station_from_nose_m.unwrap(), b.cp.unwrap().station_from_nose_m.unwrap());
        // The inherited rate couple is an independent pure couple: force-free,
        // datum-invariant, and unaffected by any CP availability.
        vector_near(a.rate_moment_body_nm, b.rate_moment_body_nm);
        vector_near(a.aero_force_body_n, a.static_force_body_n);
        assert!(a.rate_moment_body_nm.x != 0.0 || a.rate_moment_body_nm.z != 0.0);
    }

    #[test]
    fn aero_negligibility_is_a_bounded_force_approximation_only_below_the_bound() {
        let prepared = prepared();
        let flags = CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: true };
        // A reverse air-relative velocity at 5 mm/s cannot produce a measurable
        // force: zero dimensional loads with the named policy and no flow
        // observation. This is a bounded load approximation, not a support pass.
        let slow = state_at(Vec3 { x: 0.0, y: -0.005, z: 0.0 }, Vec3::zero());
        let sample = query(&prepared, 0.1, &slow, flags).unwrap();
        assert_eq!(sample.status, CandidateComputationalStatus::StaticLoadsBelowAeroNegligibility);
        assert!(sample.aero_negligibility.is_negligible);
        assert_eq!(sample.aero_negligibility.policy_id, AERO_NEGLIGIBILITY_POLICY_ID);
        assert!(sample.aero_negligibility.max_possible_force_n
            <= AERO_NEGLIGIBILITY_RELATIVE_BOUND * sample.aero_negligibility.weight_n);
        assert!(sample.flow.is_none() && sample.static_coefficients_at_datum.is_none() && sample.cp.is_none());
        vector_near(sample.static_force_body_n, Vec3::zero());
        assert!(sample.unavailable.iter().any(|u| u.quantity == "static_aero_loads"));
        // The same direction at 1 m/s is refused because the possible aero force
        // exceeds the bound: the approximation cannot admit meaningful reverse
        // flow, and there is no rail waiver.
        let faster = state_at(Vec3 { x: 0.0, y: -1.0, z: 0.0 }, Vec3::zero());
        assert_eq!(query(&prepared, 0.1, &faster, flags).unwrap_err().kind,
            CandidateFailureKind::UnsupportedDomain);
        // Exactly-zero airspeed stays a distinct status.
        let rest = query(&prepared, 0.1, &state_at(Vec3::zero(), Vec3::zero()), flags).unwrap();
        assert_eq!(rest.status, CandidateComputationalStatus::ZeroSpeedStaticLoadsOnly);
        assert!(rest.aero_negligibility.is_negligible);
        // Curve points report the bound for their explicit direction and retain
        // static coefficients even when the dimensional wrench is negligible.
        let points = curves(&prepared, 0.1,
            &state_at(Vec3 { x: 0.0, y: 20.0, z: 0.0 }, Vec3::zero()), flags, &[1.0e-5]).unwrap();
        assert!(points[0].aero_negligibility.is_negligible);
        assert!(points[0].static_coefficients_at_datum.is_some());
        assert!(points[0].static_force_body_n.y.abs() <= 1e-6);
    }

    #[test]
    fn candidate_validation_refuses_nonfinite_motor_attitude_and_altitude() {
        let invalid_input = CandidateFailureKind::InvalidInput;
        let unsupported = CandidateFailureKind::UnsupportedDomain;
        // Motor records the legacy validator cannot reject must still refuse.
        let mut input = preparation();
        input.motor.dry_mass = f64::NAN;
        assert_eq!(PreparedCandidate::prepare(input).unwrap_err().kind, invalid_input);
        let mut input = preparation();
        input.motor.total_mass = f64::NAN;
        assert_eq!(PreparedCandidate::prepare(input).unwrap_err().kind, invalid_input);
        let mut input = preparation();
        input.motor.max_thrust = f64::NAN;
        assert_eq!(PreparedCandidate::prepare(input).unwrap_err().kind, invalid_input);
        let mut input = preparation();
        for point in &mut input.motor.thrust_curve { point.thrust = 0.0; }
        let error = PreparedCandidate::prepare(input).unwrap_err();
        assert_eq!(error.kind, invalid_input);
        assert!(error.reason.contains("positive total impulse"), "{}", error.reason);
        // Shared near-unit attitude policy.
        let prepared = prepared();
        let flags = CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: false };
        let mut bad = state_at(Vec3 { x: 0.0, y: 80.0, z: 0.0 }, Vec3::zero());
        bad.q = crate::six_dof::Quat { w: 2.0, x: 0.0, y: 0.0, z: 0.0 };
        let error = query(&prepared, 0.1, &bad, flags).unwrap_err();
        assert_eq!(error.kind, invalid_input);
        assert!(error.reason.contains(ATTITUDE_POLICY_ID));
        let mut zero = state_at(Vec3 { x: 0.0, y: 80.0, z: 0.0 }, Vec3::zero());
        zero.q = crate::six_dof::Quat { w: 0.0, x: 0.0, y: 0.0, z: 0.0 };
        assert_eq!(query(&prepared, 0.1, &zero, flags).unwrap_err().kind, invalid_input);
        let mut near_unit = state_at(Vec3 { x: 0.0, y: 80.0, z: 0.0 }, Vec3::zero());
        near_unit.q = crate::six_dof::Quat { w: 1.0 + 5.0e-7, x: 0.0, y: 0.0, z: 0.0 };
        let normalized = query(&prepared, 0.1, &near_unit, flags).unwrap();
        near(quat_norm(&normalized.state), 1.0);
        // Instantaneous atmosphere support, not only the launch altitude.
        let mut high = state_at(Vec3 { x: 0.0, y: 80.0, z: 0.0 }, Vec3::zero());
        high.r.z = 25_000.0;
        assert_eq!(query(&prepared, 0.1, &high, flags).unwrap_err().kind, unsupported);
        let mut below_ground = state_at(Vec3 { x: 0.0, y: 80.0, z: 0.0 }, Vec3::zero());
        below_ground.r.z = -1.0;
        assert_eq!(query(&prepared, 0.1, &below_ground, flags).unwrap_err().kind, unsupported);
        let mut high_curve = state_at(Vec3 { x: 0.0, y: 80.0, z: 0.0 }, Vec3::zero());
        high_curve.r.z = 25_000.0;
        assert_eq!(curves(&prepared, 0.1, &high_curve, flags, &[0.1]).unwrap_err().kind, unsupported);
        let mut supported = state_at(Vec3 { x: 0.0, y: 80.0, z: 0.0 }, Vec3::zero());
        supported.r.z = 19_000.0;
        assert_eq!(query(&prepared, 0.1, &supported, flags).unwrap().status,
            CandidateComputationalStatus::Supported);
    }

    #[test]
    fn zero_speed_policy_and_nonfinite_inputs_fail_closed() {
        let prepared = prepared();
        let flags = CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: false };
        let at_rest = state_at(Vec3::zero(), Vec3::zero());
        let sample = query(&prepared, 0.0, &at_rest, flags).unwrap();
        assert_eq!(sample.status, CandidateComputationalStatus::ZeroSpeedStaticLoadsOnly);
        assert!(sample.flow.is_none() && sample.static_coefficients_at_datum.is_none()
            && sample.static_coefficients_at_cg.is_none() && sample.wind_coefficients.is_none());
        vector_near(sample.static_force_body_n, Vec3::zero());
        vector_near(sample.static_moment_cg_body_nm, Vec3::zero());
        vector_near(sample.rate_moment_body_nm, Vec3::zero());
        assert!(sample.unavailable.iter().any(|u| u.quantity == "flow_angles"));
        assert!(sample.unavailable.iter().any(|u| u.quantity == "coefficients"));
        let spinning = state_at(Vec3::zero(), Vec3 { x: 0.0, y: 2.0, z: 0.0 });
        let error = query(&prepared, 0.0, &spinning, flags).unwrap_err();
        assert_eq!(error.kind, CandidateFailureKind::UnsupportedDomain);
        let mut nonfinite = at_rest;
        nonfinite.v.y = f64::NAN;
        assert_eq!(query(&prepared, 0.0, &nonfinite, flags).unwrap_err().kind, CandidateFailureKind::InvalidInput);
        assert_eq!(query(&prepared, f64::INFINITY, &at_rest, flags).unwrap_err().kind,
            CandidateFailureKind::InvalidInput);
        let mut degenerate = at_rest;
        degenerate.q = crate::six_dof::Quat { w: 0.0, x: 0.0, y: 0.0, z: 0.0 };
        assert_eq!(query(&prepared, 0.0, &degenerate, flags).unwrap_err().kind,
            CandidateFailureKind::InvalidInput);
    }

    #[test]
    fn candidate_support_limits_fail_at_every_applicable_stage() {
        let prepared = prepared();
        let flags = CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: true };
        // Mach boundary: 0.799 passes, 0.8 and above refuse even rail-bound.
        let sos = {
            let q = query(&prepared, 0.1, &state_at(Vec3 { x: 0.0, y: 100.0, z: 0.0 }, Vec3::zero()), flags).unwrap();
            q.mechanics.speed_of_sound_mps
        };
        let at_mach = |mach: f64| state_at(Vec3 { x: 0.0, y: mach * sos, z: 0.0 }, Vec3::zero());
        assert!(query(&prepared, 0.1, &at_mach(0.799), flags).is_ok());
        for mach in [0.8, 0.9, 1.2] {
            let error = query(&prepared, 0.1, &at_mach(mach), flags).unwrap_err();
            assert_eq!(error.kind, CandidateFailureKind::UnsupportedDomain, "Mach {mach}");
        }
        // Incidence boundary: exactly 5 degrees passes, above refuses.
        let incidence = |deg: f64| state_at(Vec3 { x: 0.0,
            y: 80.0 * deg.to_radians().cos(), z: 80.0 * deg.to_radians().sin() }, Vec3::zero());
        assert!(query(&prepared, 0.1, &incidence(5.0), flags).is_ok());
        assert_eq!(query(&prepared, 0.1, &incidence(5.0001), flags).unwrap_err().kind,
            CandidateFailureKind::UnsupportedDomain);
        // Reverse and lateral-only flow refuse.
        for velocity in [Vec3 { x: 0.0, y: -50.0, z: 0.0 }, Vec3 { x: 40.0, y: 0.0, z: 0.0 }] {
            assert_eq!(query(&prepared, 0.1, &state_at(velocity, Vec3::zero()), flags).unwrap_err().kind,
                CandidateFailureKind::UnsupportedDomain);
        }
        // Rail state and negligible aero force give no waiver: a real run with
        // an unsupported initial crosswind stops with a structured record.
        let mut prep = preparation();
        prep.environment.wind_speed_surface_mps = 20.0;
        let prepared_crosswind = PreparedCandidate::prepare(prep).unwrap();
        let error = run_bounded(&prepared_crosswind,
            &CandidateRunRequest { horizon_s: 0.5, options: options() }).unwrap_err();
        let record = error.record.expect("domain failure must carry a structured record");
        assert_eq!(record.kind, CandidateFailureKind::UnsupportedDomain);
        assert!(record.stage_time_s <= 0.5 && record.stage_time_s.is_finite());
        assert!(record.phase.label.len() > 0);
        // Unsupported geometry fails at preparation, before any stage.
        let mut prep = preparation();
        prep.geometry.fins.count = 5;
        assert!(PreparedCandidate::prepare(prep).is_err());
        // Cant and a non-unit historical drag scale refuse at run validation.
        let mut cant = options();
        cant.fin_cant_angle_deg = Some(0.5);
        assert_eq!(run_bounded(&prepared, &CandidateRunRequest { horizon_s: 0.2, options: cant })
            .unwrap_err().reason.contains("SB1 excludes fin cant"), true);
        let mut scale = options();
        scale.drag_cd_scale = Some(0.9);
        assert_eq!(run_bounded(&prepared, &CandidateRunRequest { horizon_s: 0.2, options: scale })
            .unwrap_err().reason.contains("not transferable"), true);
    }

    #[test]
    fn canopy_branch_bypasses_airframe_and_retains_rate_and_canopy_models() {
        let prepared = prepared();
        let omega = Vec3 { x: 0.2, y: -0.1, z: 0.3 };
        let state = state_at(Vec3 { x: 0.0, y: 20.0, z: 0.5 }, omega);
        let airframe = CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: false };
        let canopy = CandidateFlags { drogue_deployed: false, main_deployed: true, rail_bound: false };
        let air = query(&prepared, 3.0, &state, airframe).unwrap();
        let under = query(&prepared, 3.0, &state, canopy).unwrap();
        assert_eq!(under.applicability, CandidateApplicability::CanopyRecoveryComposition);
        assert!(under.static_coefficients_at_datum.is_none() && under.static_coefficients_at_cg.is_none());
        assert!(under.normal_derivatives.is_none() && under.cp.is_none() && under.wind_coefficients.is_none());
        assert!(under.unavailable.iter().any(|u| u.quantity == "airframe_coefficients"));
        vector_near(under.static_force_body_n, Vec3::zero());
        let canopy_force = under.canopy_drag_force_body_n.expect("declared canopy force");
        vector_near(under.aero_force_body_n, canopy_force);
        // Declared canopy drag: q * (pi/4 d^2) * Cd along -vhat.
        let q = under.mechanics.dynamic_pressure_pa;
        let expected = q * (PI / 4.0 * 0.3 * 0.3) * 0.8;
        let speed = under.mechanics.airspeed_mps;
        let dir = Vec3 { x: state.v.x / speed, y: state.v.y / speed, z: state.v.z / speed };
        vector_near(canopy_force, Vec3 { x: -expected * dir.x, y: -expected * dir.y, z: -expected * dir.z });
        // The inherited rate couple is retained under a canopy.
        vector_near(under.rate_moment_body_nm, air.rate_moment_body_nm);
        assert!(under.aero_moment_cg_body_nm.x < 0.0);
        // Immature canopy support refuses an extrapolation instead of using it.
        let fast = state_at(Vec3 { x: 0.0, y: 500.0, z: 0.0 }, Vec3::zero());
        assert_eq!(query(&prepared, 3.0, &fast, canopy).unwrap_err().kind,
            CandidateFailureKind::UnsupportedDomain);
        // A canopy-live state does not excuse an unsupported airframe branch:
        // without the canopy the same state can be outside support.
        let steep = state_at(Vec3 { x: 0.0, y: 20.0 * 30.0_f64.to_radians().cos(),
            z: 20.0 * 30.0_f64.to_radians().sin() }, Vec3::zero());
        assert_eq!(query(&prepared, 3.0, &steep, airframe).unwrap_err().kind,
            CandidateFailureKind::UnsupportedDomain);
        assert!(query(&prepared, 3.0, &steep, canopy).is_ok());
        // Curves are an airframe diagnostic, never a canopy fallback.
        assert_eq!(curves(&prepared, 3.0, &state, canopy, &[0.1]).unwrap_err().kind,
            CandidateFailureKind::UnsupportedDomain);
    }

    #[test]
    fn canopy_support_precedes_negligibility_and_has_no_hidden_speed_floor() {
        let prepared = prepared();
        let canopy = CandidateFlags { drogue_deployed: false, main_deployed: true, rail_bound: false };
        // Exactly-zero speed keeps its own status for a live canopy.
        let rest = query(&prepared, 3.0, &state_at(Vec3::zero(), Vec3::zero()), canopy).unwrap();
        assert_eq!(rest.status, CandidateComputationalStatus::ZeroSpeedStaticLoadsOnly);
        vector_near(rest.aero_force_body_n, Vec3::zero());
        // Canopy model support is enforced before the negligibility bound: a
        // near-zero Cd makes the bound negligible, but Mach > 1 still refuses.
        let mut input = preparation();
        input.mechanical_vehicle.drogue = Some(Parachute { diameter: 0.3, cd: 1.0e-12 });
        input.mechanical_vehicle.main_chute = Some(Parachute { diameter: 0.3, cd: 1.0e-12 });
        let tiny_drag = PreparedCandidate::prepare(input).unwrap();
        let fast = state_at(Vec3 { x: 0.0, y: 500.0, z: 0.0 }, Vec3::zero());
        assert_eq!(query(&tiny_drag, 3.0, &fast, canopy).unwrap_err().kind,
            CandidateFailureKind::UnsupportedDomain);
        // Above the declared bound, the candidate computes the canopy force even
        // below the legacy helper's 1e-6 m/s floor: no hidden suppression.
        let mut input = preparation();
        input.mechanical_vehicle.main_chute = Some(Parachute { diameter: 50.0, cd: 1.0e9 });
        let huge = PreparedCandidate::prepare(input).unwrap();
        let slow = state_at(Vec3 { x: 0.0, y: 5.0e-7, z: 0.0 }, Vec3::zero());
        let sample = query(&huge, 3.0, &slow, canopy).unwrap();
        assert!(!sample.aero_negligibility.is_negligible);
        assert!(sample.canopy_drag_force_body_n.unwrap().y.abs() > 0.0);
        assert_eq!(sample.status, CandidateComputationalStatus::Supported);
    }

    #[test]
    fn bounded_horizon_is_exact_and_has_no_prefix_apogee_or_landing() {
        let prepared = prepared();
        let horizon = 1.234;
        let result = run(&prepared, horizon);
        assert_eq!(result.termination, CandidateTermination::TimeLimit);
        assert_eq!(result.computational_completion, CandidateComputationalCompletion::CompletedRequestedHorizon);
        assert_eq!(result.requested_horizon_s, horizon);
        assert_eq!(result.final_time_s, horizon);
        assert!(result.landing.is_none());
        assert!(result.apogee_event.is_none());
        let last = result.committed_samples.last().unwrap();
        assert_eq!(last.stage_time_s, horizon);
        assert_eq!(last.state.r.x.to_bits(), result.final_state.r.x.to_bits());
        assert_eq!(last.state.v.z.to_bits(), result.final_state.v.z.to_bits());
        assert_eq!(last.sample_origin, "committed-macro-sample");
        assert!(result.committed_samples.iter().all(|s| s.stage_time_s <= horizon));
        assert_eq!(result.observed_prefix.sampling_policy_id, PREFIX_POLICY_ID);
        assert!(result.observed_prefix.max_altitude_agl_m >= 0.0);
        assert_eq!(result.empirical_qualification, ac::EmpiricalQualification::Unqualified);
        assert_eq!(result.dynamic_qualification, CandidateDynamicQualification::Unknown);
        // Every committed sample identifies the same composition.
        assert!(result.committed_samples.iter().all(|s| s.identities.composition_id == COMPOSITION_ID));
        // A shorter-than-step horizon still reaches the stop.
        let tiny = run(&prepared, 0.004);
        assert_eq!(tiny.final_time_s, 0.004);
        assert_eq!(tiny.committed_samples.last().unwrap().stage_time_s, 0.004);
        assert!(tiny.committed_samples.len() >= 2);
        // Invalid horizons are refused by the bridge, not clamped silently.
        for bad in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            assert!(run_bounded(&prepared, &CandidateRunRequest { horizon_s: bad, options: options() }).is_err());
        }
    }

    #[test]
    fn result_schema_distinguishes_time_limit_from_completed_touchdown() {
        let prepared = prepared();
        let request = CandidateRunRequest { horizon_s: 1.0, options: options() };
        let final_state = state_at(Vec3::zero(), Vec3::zero());
        let flags = DriverFlags { drogue_deployed: true, main_deployed: true, rail_bound: false };
        let limit = assemble_result(&prepared, &request, CandidateTermination::TimeLimit, 1.0,
            final_state, flags, Vec::new(), Vec::new(), Default::default()).unwrap();
        assert_eq!(limit.termination, CandidateTermination::TimeLimit);
        assert!(limit.landing.is_none());
        assert!(limit.apogee_event.is_none());
        assert_eq!(limit.computational_completion, CandidateComputationalCompletion::CompletedRequestedHorizon);
        // A synthetic completed-touchdown outcome: landing evidence uses the
        // actual final state, never prefix maxima.
        let ground = RigidState { r: Vec3 { x: 4.0, y: -2.0, z: 0.0 },
            v: Vec3 { x: 0.5, y: 0.0, z: -6.0 },
            q: crate::six_dof::Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        let events = vec![
            SimEvent { time: 9.0, name: "Ground Touchdown".to_string(), altitude: 0.0,
                velocity: 6.0, description: "synthetic touchdown event".to_string() },
        ];
        let landed = assemble_result(&prepared, &request, CandidateTermination::Touchdown, 9.0,
            ground, flags, Vec::new(), events, Default::default()).unwrap();
        assert_eq!(landed.termination, CandidateTermination::Touchdown);
        let landing = landed.landing.expect("touchdown evidence");
        near(landing.time_s, 9.0);
        near(landing.speed_mps, (0.25 + 36.0_f64).sqrt());
        assert!(landing.mass_kg > 0.0);
        assert_eq!(landing.position_n_m.z, 0.0);
        assert_eq!(landed.computational_completion, CandidateComputationalCompletion::CompletedTouchdown);
        assert!(landed.apogee_event.is_none());
    }

    fn fast_motor() -> MotorSpec {
        let mut motor = motor();
        motor.burn_time = 0.8;
        motor.max_thrust = 800.0;
        motor.thrust_curve = vec![
            crate::six_dof::ThrustPoint { time: 0.0, thrust: 0.0 },
            crate::six_dof::ThrustPoint { time: 0.01, thrust: 800.0 },
            crate::six_dof::ThrustPoint { time: 0.7, thrust: 800.0 },
            crate::six_dof::ThrustPoint { time: 0.8, thrust: 0.0 },
        ];
        motor
    }

    #[test]
    fn candidate_errors_carry_phase_time_state_and_never_fall_back() {
        let prepared = prepared();
        // A committed initial macro state outside support stops at t=0 on a
        // real crosswind (rail/negligible-force waiver does not exist).
        let mut prep = preparation();
        prep.environment.wind_speed_surface_mps = 15.0;
        let prepared_crosswind = PreparedCandidate::prepare(prep).unwrap();
        let error = run_bounded(&prepared_crosswind,
            &CandidateRunRequest { horizon_s: 0.3, options: options() }).unwrap_err();
        let record = error.record.as_ref().unwrap();
        assert_eq!(record.model_id, COMPOSITION_ID);
        assert_eq!(record.composition_id, COMPOSITION_ID);
        assert_eq!(record.kind, CandidateFailureKind::UnsupportedDomain);
        assert_eq!(record.phase.label, "committed-macro-sample");
        assert!(!record.phase.speculative);
        assert_eq!(record.stage_time_s, 0.0);
        assert!(error.reason.contains(record.reason.as_str()));
        assert!(error.driver_message.contains(COMPOSITION_ID));
        // No recovery by legacy loads: the same call must keep failing.
        assert!(run_bounded(&prepared_crosswind,
            &CandidateRunRequest { horizon_s: 0.3, options: options() }).is_err());
        // A mid-ascent Mach limit is reached inside an adaptive endpoint stage,
        // so its record is explicitly speculative and carries the trial time.
        let mut prep = preparation();
        prep.motor = fast_motor();
        let prepared_fast = PreparedCandidate::prepare(prep).unwrap();
        let error = run_bounded(&prepared_fast,
            &CandidateRunRequest { horizon_s: 1.0, options: options() }).unwrap_err();
        let record = error.record.as_ref().unwrap();
        assert_eq!(record.kind, CandidateFailureKind::UnsupportedDomain);
        assert!(record.phase.speculative, "adaptive trial failure must be speculative");
        assert!(record.reason.contains("Mach"));
        assert!(record.stage_time_s > 0.0 && record.stage_time_s < 1.0);
        assert!(record.state.v.x.is_finite() && record.state.v.y.is_finite() && record.state.v.z.is_finite());
        // Ordinary runs never produce stage diagnostics as trajectory samples.
        assert!(run(&prepared, 0.5).committed_samples.iter().all(|s| s.sample_origin == "committed-macro-sample"));
    }

    /// RMP09-C06: the canopy support limit is the declared inclusive Mach 1 and
    /// is enforced on the computed stage Mach, with no speed floor or waiver.
    /// The airframe branch keeps its own exclusive Mach limit on the same state.
    #[test]
    fn canopy_mach_support_is_inclusive_exactly_at_the_declared_limit() {
        let prepared = prepared();
        let canopy = CandidateFlags { drogue_deployed: false, main_deployed: true, rail_bound: false };
        let airframe = CandidateFlags { drogue_deployed: false, main_deployed: false, rail_bound: false };
        let probe = state_at(Vec3 { x: 0.0, y: 10.0, z: 0.0 }, Vec3::zero());
        let sos = query(&prepared, 3.0, &probe, canopy).unwrap().mechanics.speed_of_sound_mps;
        assert!(sos > 300.0 && sos < 360.0);
        let at_speed = |speed: f64| state_at(Vec3 { x: 0.0, y: speed, z: 0.0 }, Vec3::zero());
        // Air-relative speed equal to the local speed of sound is supported.
        let at_limit = query(&prepared, 3.0, &at_speed(sos), canopy).unwrap();
        near(at_limit.mechanics.mach, MAX_CANOPY_MACH_INCLUSIVE);
        assert_eq!(at_limit.status, CandidateComputationalStatus::Supported);
        assert!(at_limit.canopy_drag_force_body_n.is_some());
        // The next representable speed above it is refused, not extrapolated.
        let above = f64::from_bits(sos.to_bits() + 1);
        let error = query(&prepared, 3.0, &at_speed(above), canopy).unwrap_err();
        assert_eq!(error.kind, CandidateFailureKind::UnsupportedDomain);
        assert!(error.reason.contains("Mach <= 1"), "{}", error.reason);
        // A live canopy never widens the airframe branch for the same state.
        assert_eq!(query(&prepared, 3.0, &at_speed(sos), airframe).unwrap_err().kind,
            CandidateFailureKind::UnsupportedDomain);
    }

    /// RMP09-C08: the candidate activates only through its explicit prepared
    /// identity. A native legacy run executed before and after the candidate on
    /// the same frozen legacy inputs is bit-identical, keeps the legacy model
    /// identity and its named oracle, while the candidate reports its own
    /// composition/static/rate identities and independently checkable physics.
    #[test]
    fn explicit_candidate_activation_leaves_the_legacy_native_run_bit_identical() {
        use crate::six_dof::{estes_alpha_vehicle, estes_c6_motor, simulate_flight, SixDofOptions};
        let vehicle = estes_alpha_vehicle();
        let motor = estes_c6_motor();
        // Frozen legacy fixture inputs (`six_dof` zero-wind parity setup).
        let legacy_options = SixDofOptions {
            rail_length: Some(1.0), rail_elevation_deg: Some(90.0), rail_azimuth_deg: Some(0.0),
            launch_altitude_asl: None, wind_speed_surface: Some(0.0), wind_azimuth_deg: Some(90.0),
            main_deploy_altitude_agl: Some(250.0), time_step: None, fin_cant_angle_deg: None,
            drag_cd_scale: None, record_telemetry: false, record_moment_arm_history: false,
        };
        let before = simulate_flight(&vehicle, &motor, &legacy_options).unwrap();
        assert_eq!(before.validity, "PASS");
        assert!(!before.off_nominal_excursion);

        // Explicit candidate activation on its own declared carrier/motor.
        let candidate = run(&prepared(), 1.0);
        assert_eq!(candidate.identities.composition_id, COMPOSITION_ID);
        assert_eq!(candidate.identities.static_provider_id, ac::PROVIDER_ID);
        assert_eq!(candidate.identities.rate_model_id, RATE_MODEL_ID);
        assert_eq!(candidate.identities.mechanical_model_id, MECHANICAL_MODEL_ID);
        assert_eq!(candidate.identities.calibration_policy_id, CALIBRATION_POLICY_ID);
        assert_eq!(candidate.empirical_qualification, ac::EmpiricalQualification::Unqualified);
        assert_eq!(candidate.dynamic_qualification, CandidateDynamicQualification::Unknown);
        assert_eq!(candidate.termination, CandidateTermination::TimeLimit);
        assert!(candidate.landing.is_none(), "a time-limited prefix has no landing");
        assert!(!candidate.committed_samples.is_empty());
        // Independent observation, not the legacy assembly: forward flight has
        // an aft body axial force and a positive wind-axis drag power loss.
        let forward = candidate.committed_samples.iter().find(|s|
            s.sample_origin == "committed-macro-sample"
                && s.mechanics.airspeed_mps > 5.0 && s.flow.is_some())
            .expect("a forward committed candidate sample");
        assert!(forward.flow.unwrap().alpha_rad.abs() < 0.1);
        assert!(forward.static_force_body_n.y < 0.0, "axial force must oppose +Y forward flight");
        assert!(forward.drag_along_wind_n > 0.0);

        // The candidate run cannot have changed the legacy native result.
        let after = simulate_flight(&vehicle, &motor, &legacy_options).unwrap();
        let summary_bits = |r: &crate::six_dof::SimulationResult| [
            r.apogee_altitude, r.apogee_time,
            r.apogee_position.x, r.apogee_position.y, r.apogee_position.z,
            r.max_velocity, r.max_mach, r.max_acceleration_g,
            r.burnout_altitude, r.burnout_velocity, r.burnout_time,
            r.rail_exit_velocity, r.weathercock_angle_deg,
            r.landing_position.x, r.landing_position.y, r.landing_distance,
            r.landing_velocity, r.landing_kinetic_energy, r.landing_mass, r.flight_time,
        ].map(f64::to_bits);
        assert_eq!(summary_bits(&before), summary_bits(&after));
        assert_eq!(
            (&before.validity, before.terminated, before.touchdown_nominal,
                before.enveloped, before.off_nominal_excursion),
            (&after.validity, after.terminated, after.touchdown_nominal,
                after.enveloped, after.off_nominal_excursion));
        assert_eq!(before.events.len(), after.events.len());
        for (a, b) in before.events.iter().zip(&after.events) {
            assert_eq!((&a.name, &a.description), (&b.name, &b.description));
            assert_eq!([a.time, a.altitude, a.velocity].map(f64::to_bits),
                [b.time, b.altitude, b.velocity].map(f64::to_bits));
        }
        // Neither run requested these optional histories.
        assert!(before.telemetry.is_empty() && after.telemetry.is_empty());
        assert!(before.moment_arm_history.is_empty() && after.moment_arm_history.is_empty());
        assert!(before.terminated && after.terminated);
        // Link that preserved run to the legacy assembly identity and its oracle.
        let state = RigidState { r: Vec3 { x: 0.0, y: 0.0, z: 100.0 },
            v: Vec3 { x: 0.0, y: 60.0, z: 2.0 },
            q: crate::six_dof::Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }, w: Vec3::zero() };
        let diag = crate::six_dof::diagnose_flight_loads(0.5, &state, false, false, false,
            0.0, 0.0, 90.0, 0.0, &vehicle, &motor, 1.0).unwrap();
        assert_eq!(diag.model_id, "flight-signed-normal-plus-wind-drag-v1");
        assert_eq!(diag.rail_bound, false);
        let rel = ((before.apogee_altitude - 328.8253523345511) / 328.8253523345511).abs();
        assert!(rel < 1e-6, "legacy oracle drift {rel:e}");
    }

    #[test]
    fn historical_calibration_is_refused_and_identities_name_the_axial_source() {
        let prepared = prepared();
        let mut scale_one = options();
        scale_one.drag_cd_scale = Some(1.0);
        let result = run_bounded(&prepared, &CandidateRunRequest { horizon_s: 0.3, options: scale_one }).unwrap();
        assert_eq!(result.identities.axial_provider_id, "fixture-prescribed-CA0");
        assert_eq!(result.identities.axial_input_identity, "constant-fixture-0.35");
        assert_eq!(result.identities.calibration_policy_id, CALIBRATION_POLICY_ID);
        assert_eq!(result.identities.static_provider_id, ac::PROVIDER_ID);
        assert_eq!(result.identities.rate_model_id, RATE_MODEL_ID);
        assert_eq!(result.identities.geometry_identity, "synthetic-cone-cylinder-fin-fixture");
        for bad in [0.0, 0.5, 1.000001, -1.0, f64::NAN] {
            let mut options = options();
            options.drag_cd_scale = Some(bad);
            let error = run_bounded(&prepared, &CandidateRunRequest { horizon_s: 0.3, options }).unwrap_err();
            assert!(error.reason.contains("not transferable"), "scale {bad}: {}", error.reason);
        }
    }
}
