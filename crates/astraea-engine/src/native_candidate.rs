//! Explicit candidate runtime boundary: actual engine DTO -> SB1 geometry
//! adapter -> explicit mechanical carrier -> prepared candidate -> bounded
//! ascent, query and curves. Reachable through the explicit `simulate_candidate`
//! dispatch command on native and wasm32, and through the native helper
//! entry points. Never a project field, default flight model, GUI option or
//! ensemble provider.
//!
//! The mechanical carrier uses the existing mass rollup and the existing motor
//! primitive; it deliberately does **not** call `models::prepare_flight_vehicle`,
//! whose stability and drag-table preparation depend on the legacy CP model the
//! candidate must avoid. Legacy slope/CP/drag carrier fields are NaN-poisoned by
//! `PreparedCandidate::prepare` and never consulted.
//!
//! `run_request` also emits a *same-state equivalence* block: a direct query and
//! a static curve point at one committed trajectory sample must reproduce that
//! sample's static coefficients bit for bit. That is the observable form of the
//! single-evaluator requirement, not a separate physical validation.

use crate::models::{self, FrontendMotor, FrontendVehicle};
use crate::sb1_geometry::{
    adapt_frontend_vehicle, AdapterOptions, AftTermination, ComponentRole, OgiveInterpretation,
    SupportDeclarations, TransitionInterpretation,
};
use astraea_core::aero_coefficients::{CoefficientWrench, References};
use astraea_core::flight_provider::{
    curves_with_applicability, query, run_bounded_with_retention, validate_curve_machs,
    CandidateCurvePoint, CandidateCurves, CandidateEnvironment, CandidateFlags, CandidateOptions,
    CandidateRunRequest, CandidateRunResult, CandidateSample, PreparedCandidate, SampleRetention,
    COLLECTED_SAMPLE_CAP, COLLECTED_SAMPLE_CAP_ID, COMPOSITION_ID, CURVE_APPLICABILITY_POLICY_ID,
    MAX_INCIDENCE_DEG, MAX_MACH_EXCLUSIVE, REPORT_SAMPLE_CAP, REPORT_SAMPLE_POLICY_ID,
    RESULT_SCHEMA_ID,
};
use astraea_core::aero_profiles::QuadratureSettings;
use astraea_core::six_dof::{
    AbsoluteTolerancePolicy, CandidateDiagnosticControls, MotorSpec, Parachute, Quat, RigidState,
    Vec3, Vehicle,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const REPORT_SCHEMA_ID: &str = "astraea-native-candidate-report/3.0.0";
pub const PROFILE_REPORT_SCHEMA_ID: &str = "astraea-native-profile-candidate-report/3.0.0";
/// Name of the untagged runtime request shape, reported so a reader can tell the
/// two envelopes apart. Report metadata only; never part of the identity preimage.
pub const UNTAGGED_ENVELOPE_ID: &str = "simulate-candidate-runtime-request/1.0.0";

fn error(reason: impl Into<String>) -> String { reason.into() }

/// Explicit non-geometry carrier declarations and the identified axial source.
pub struct NativeCandidateInputs {
    pub adapter: AdapterOptions,
    pub mechanical_source_id: String,
    pub environment_source_id: String,
    pub axial_provider_id: String,
    pub axial_input_identity: String,
    pub axial_ca0: f64,
    pub environment: CandidateEnvironment,
    /// Caller-declared motor mount station (m aft of the nose). The DTO mount
    /// flag, when present, is a consistency check, not a second mechanical path.
    pub motor_aft_station_from_nose_m: f64,
}

/// Prepared candidate plus the non-geometry facts needed for a portable report.
pub struct NativeCandidate {
    pub prepared: PreparedCandidate,
    pub references: References,
    pub adapter_id: &'static str,
    pub source_identity: String,
    pub support_limits: Vec<&'static str>,
    pub component_roles: Vec<ComponentRoleReport>,
    pub carrier: MechanicalCarrierSummary,
}

#[derive(Clone, Debug)]
pub struct ComponentRoleReport {
    pub source_index: usize,
    pub id: String,
    pub kind: String,
    pub role: String,
}

#[derive(Clone, Debug)]
pub struct MechanicalCarrierSummary {
    pub dry_mass_kg: f64,
    pub cg_from_nose_m: f64,
    pub total_length_m: f64,
    pub reference_diameter_m: f64,
    pub motor_aft_station_from_nose_m: f64,
    pub drogue: Option<(f64, f64)>,
    pub main: Option<(f64, f64)>,
    pub motor_designation: String,
}

fn role_label(role: &ComponentRole) -> &'static str {
    match role {
        ComponentRole::Body { .. } => "external-body-profile",
        ComponentRole::Fins { .. } => "external-fins",
        ComponentRole::DeclaredInternalNonGeometry => "declared-internal-non-geometry",
    }
}

/// Build the candidate from the real engine DTO path. No parameter is defaulted
/// inside: every physical declaration comes from the caller.
pub fn prepare_native_candidate(
    vehicle: &FrontendVehicle,
    motor: &FrontendMotor,
    inputs: &NativeCandidateInputs,
) -> Result<NativeCandidate, String> {
    let adapted = adapt_frontend_vehicle(vehicle, &inputs.adapter).map_err(|e| {
        let location = match (e.component_index, e.component_id.as_deref()) {
            (Some(index), Some(id)) => format!("component {index} '{id}': "),
            (Some(index), None) => format!("component {index}: "),
            _ => String::new(),
        };
        format!("native candidate geometry adapter refused: {location}{}", e.reason)
    })?;
    // Mechanical carrier: the existing mass rollup only. No stability, no drag
    // table, no CP-dependent preparation.
    let mass_vehicle = models::to_mass_vehicle(vehicle)?;
    let rollup = astraea_core::mass::aggregate_mass(&mass_vehicle)?;
    let core_motor: MotorSpec = models::to_motor(motor)?;

    // Note: the existing SB1 adapter refuses a DTO that flags a motor mount as
    // ambiguous internal/external topology. The candidate preparation therefore
    // takes the motor station as an explicit mechanical declaration and only
    // validates it against length/forward-end/diameter in the core preparation.
    // A real mount-resolution adapter remains an identified later extension.
    // Legacy recovery mapping (first parachute = drogue, second-or-first = main).
    // Declared recovery is part of the mechanical carrier; RMP07 owns migration.
    let chutes: Vec<&crate::models::FrontendComponent> = vehicle.components.iter()
        .filter(|c| c.kind == "parachute").collect();
    // A declared parachute component must carry complete finite recovery data.
    // Returning `None` for a partially declared chute would silently leave the
    // airframe active after deployment flags change.
    let to_chute = |c: &crate::models::FrontendComponent| -> Result<Parachute, String> {
        match (c.diameter, c.cd) {
            (Some(diameter), Some(cd)) if diameter.is_finite() && diameter > 0.0
                && cd.is_finite() && cd >= 0.0 => Ok(Parachute { diameter, cd }),
            _ => Err(error(format!(
                "native candidate: declared parachute '{}' requires a finite positive diameter and a finite nonnegative Cd",
                c.id))),
        }
    };
    let drogue = chutes.first().map(|c| to_chute(c)).transpose()?;
    let main_chute = if chutes.len() > 1 { chutes.get(1).map(|c| to_chute(c)).transpose()? } else { drogue.clone() };

    let carrier = Vehicle {
        dry_mass: rollup.total_mass,
        cg_from_nose: rollup.cg,
        total_length: rollup.total_length,
        ref_diameter: rollup.reference_diameter,
        // Poisoned again by preparation; explicit here so no code path can
        // treat an accidental default as a legacy slope/CP/drag carrier.
        cna_body: f64::NAN,
        cna_fins: f64::NAN,
        body_first_moment: f64::NAN,
        fin_first_moment: f64::NAN,
        body_abs_cna: f64::NAN,
        fin_abs_cna: f64::NAN,
        motor_aft_station_from_nose: inputs.motor_aft_station_from_nose_m,
        drogue: drogue.clone(),
        main_chute: main_chute.clone(),
        aero_powered_cd: vec![f64::NAN],
        aero_coasting_cd: vec![f64::NAN],
        supersonic_normal: None,
    };
    let preparation = astraea_core::flight_provider::CandidatePreparation {
        geometry: adapted.geometry.clone(),
        references: adapted.references,
        datum: astraea_core::aero_coefficients::Datum::NOSE,
        axial: astraea_core::aero_coefficients::PrescribedAxial {
            ca0: inputs.axial_ca0,
            provider_id: inputs.axial_provider_id.clone(),
            input_identity: inputs.axial_input_identity.clone(),
        },
        mechanical_vehicle: carrier,
        motor: core_motor.clone(),
        environment: inputs.environment,
        source: astraea_core::flight_provider::CandidateSourceDeclarations {
            adapter_id: adapted.report.adapter_id.to_string(),
            caller_source_identity: inputs.adapter.source_identity.clone(),
            mechanical_source_id: inputs.mechanical_source_id.clone(),
            environment_source_id: inputs.environment_source_id.clone(),
        },
    };
    let prepared = PreparedCandidate::prepare(preparation)
        .map_err(|e| format!("native candidate preparation refused: {e}"))?;
    let component_roles = adapted.report.components.iter().map(|c| ComponentRoleReport {
        source_index: c.source_index,
        id: c.source.id.clone(),
        kind: c.source.kind.clone(),
        role: role_label(&c.role).to_string(),
    }).collect();
    Ok(NativeCandidate {
        prepared,
        references: adapted.references,
        adapter_id: adapted.report.adapter_id,
        source_identity: adapted.report.source_identity.clone(),
        support_limits: adapted.report.limits.clone(),
        component_roles,
        carrier: MechanicalCarrierSummary {
            dry_mass_kg: rollup.total_mass,
            cg_from_nose_m: rollup.cg,
            total_length_m: rollup.total_length,
            reference_diameter_m: rollup.reference_diameter,
            motor_aft_station_from_nose_m: inputs.motor_aft_station_from_nose_m,
            drogue: drogue.map(|c| (c.diameter, c.cd)),
            main: main_chute.map(|c| (c.diameter, c.cd)),
            motor_designation: core_motor.designation.clone(),
        },
    })
}

// ---------------------------------------------------------------------------
// Request DTOs shared by the explicit runtime command and the native helper
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedDeclarations {
    pub provenance: String,
    pub sharp_physical_tip: bool,
    pub circular_axisymmetric_body: bool,
    pub smooth_slender_profile: bool,
    pub identical_equally_spaced_thin_uncanted_fins: bool,
    pub no_other_external_features_or_unmodeled_interferences: bool,
    pub source_represents_complete_external_geometry: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedAdapter {
    pub source_identity: String,
    pub declarations: RequestedDeclarations,
    /// "conical" or null.
    pub transition_interpretation: Option<String>,
    /// "tangentOgive" or null.
    pub ogive_interpretation: Option<String>,
    pub aft_termination: String,
    pub internal_non_geometry_ids: Vec<String>,
    pub quadrature: RequestedQuadrature,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedQuadrature {
    pub absolute_tolerance_m3: f64,
    pub relative_tolerance: f64,
    pub max_panels: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedAxial {
    pub ca0: f64,
    pub provider_id: String,
    pub input_identity: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedEnvironment {
    #[serde(rename = "launchAltitudeASL")]
    pub launch_altitude_asl_m: f64,
    pub wind_speed_surface_mps: f64,
    pub wind_azimuth_deg: f64,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedLaunch {
    pub rail_length_m: f64,
    pub rail_elevation_deg: f64,
    pub rail_azimuth_deg: f64,
    pub main_deploy_altitude_agl_m: f64,
    pub time_step_s: f64,
    pub drag_cd_scale: Option<f64>,
    pub fin_cant_angle_deg: Option<f64>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedState {
    #[serde(rename = "positionM")]
    pub position_m: [f64; 3],
    #[serde(rename = "velocityMps")]
    pub velocity_mps: [f64; 3],
    #[serde(rename = "quaternionWxyz")]
    pub quaternion_wxyz: [f64; 4],
    #[serde(rename = "omegaRadps")]
    pub omega_radps: [f64; 3],
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedQuery {
    pub stage_time_s: f64,
    pub state: RequestedState,
    pub drogue_deployed: bool,
    pub main_deployed: bool,
    pub rail_bound: bool,
}

pub const DIAGNOSTIC_CONTROLS_SCHEMA_ID: &str = "candidate-native-diagnostic-controls/1.0.0";

/// Strict two-choice tolerance policy for the diagnostic controls DTO.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RequestedTolerancePolicy {
    Inherited,
    Hundredth,
}

/// Strict experiment-only diagnostic controls. The runtime command refuses
/// them; the native helper retains them for frozen experiments. All fields are
/// required inside the object; unknown keys, unknown schema and non-object/null
/// values are refused.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedDiagnosticNumerics {
    pub schema_id: String,
    pub absolute_tolerance_policy: RequestedTolerancePolicy,
    pub split_at_thrust_knots: bool,
}

/// Explicit null is never "absent": refuse before typed parsing can erase it.
pub(crate) fn refuse_null_controls(value: &Value) -> Result<(), String> {
    for (path, found) in [
        ("diagnosticNumerics", value.get("diagnosticNumerics")),
        (
            "candidate.diagnosticNumerics",
            value.get("candidate").and_then(|c| c.get("diagnosticNumerics")),
        ),
        ("sampleRetention", value.get("sampleRetention")),
        (
            "candidate.sampleRetention",
            value.get("candidate").and_then(|c| c.get("sampleRetention")),
        ),
    ] {
        if let Some(v) = found {
            if v.is_null() {
                return Err(format!(
                    "{path} must be an object when present, not null; no legacy fallback"
                ));
            }
        }
    }
    Ok(())
}

fn diagnostic_controls(
    request: &NativeCandidateRequest,
) -> Result<Option<CandidateDiagnosticControls>, String> {
    match &request.diagnostic_numerics {
        None => Ok(None),
        Some(d) => {
            if d.schema_id != DIAGNOSTIC_CONTROLS_SCHEMA_ID {
                return Err(format!(
                    "diagnosticNumerics.schemaId must be '{DIAGNOSTIC_CONTROLS_SCHEMA_ID}' (got '{}')",
                    d.schema_id
                ));
            }
            Ok(Some(CandidateDiagnosticControls {
                tolerance_policy: match d.absolute_tolerance_policy {
                    RequestedTolerancePolicy::Inherited => AbsoluteTolerancePolicy::Inherited,
                    RequestedTolerancePolicy::Hundredth => AbsoluteTolerancePolicy::Hundredth,
                },
                split_at_thrust_knots: d.split_at_thrust_knots,
            }))
        }
    }
}

/// Identity binding for the actual numerical policy of this request. Absent
/// controls keep the inherited policy ID and add no envelope fields, so old
/// preimages are preserved; explicit controls never reuse the inherited ID.
pub(crate) fn numerical_policy_descriptor(
    request: &NativeCandidateRequest,
) -> crate::candidate_identity::NumericalPolicyDescriptor {
    match &request.diagnostic_numerics {
        None => crate::candidate_identity::NumericalPolicyDescriptor::inherited(),
        Some(d) => {
            let (label, policy) = match d.absolute_tolerance_policy {
                RequestedTolerancePolicy::Inherited => ("inherited", AbsoluteTolerancePolicy::Inherited),
                RequestedTolerancePolicy::Hundredth => ("hundredth", AbsoluteTolerancePolicy::Hundredth),
            };
            let tol = policy.tolerances();
            crate::candidate_identity::NumericalPolicyDescriptor::explicit(
                label, d.split_at_thrust_knots, tol.r, tol.v, tol.q, tol.w,
            )
        }
    }
}

/// Map the native-only research control to a declared collection policy. Absent
/// is the runtime policy; a present control must be complete and inside the hard
/// ceiling, and is always refused by the runtime command.
fn retention_policy(request: &NativeCandidateRequest) -> Result<SampleRetention, String> {
    match &request.sample_retention {
        None => Ok(SampleRetention::ReportBounded),
        Some(retention) => {
            if retention.schema_id != SAMPLE_RETENTION_SCHEMA_ID {
                return Err(format!(
                    "sampleRetention.schemaId must be '{SAMPLE_RETENTION_SCHEMA_ID}' (got '{}')",
                    retention.schema_id));
            }
            if retention.mode != "declaredFull" {
                return Err(format!(
                    "sampleRetention.mode must be 'declaredFull' (got '{}'); the runtime policy is not caller-selectable",
                    retention.mode));
            }
            let policy = SampleRetention::DeclaredFull {
                max_committed_samples: retention.max_committed_samples };
            policy.collected_cap()?;
            Ok(policy)
        }
    }
}

/// Per-attempt sidecar: effective literal tolerances, driver limits and the
/// exact cut list, plus mechanism evidence. Emitted OUTSIDE the compared
/// candidate report (never into it).
fn mechanism_sidecar(
    request: &NativeCandidateRequest,
    mechanism: &astraea_core::six_dof::MechanismEvidence,
) -> Result<Value, String> {
    let controls = diagnostic_controls(request)?;
    let descriptor = numerical_policy_descriptor(request);
    let (label, split, tol) = match controls {
        None => (
            "inherited-absent-default",
            true,
            AbsoluteTolerancePolicy::Inherited.tolerances(),
        ),
        Some(c) => {
            let label = match c.tolerance_policy {
                AbsoluteTolerancePolicy::Inherited => "inherited",
                AbsoluteTolerancePolicy::Hundredth => "hundredth",
            };
            (label, c.split_at_thrust_knots, c.tolerance_policy.tolerances())
        }
    };
    Ok(json!({
        "schemaId": "candidate-native-diagnostic-mechanism-sidecar/1.0.0",
        "location": "per-attempt sidecar outside the compared candidate report",
        "numericalPolicyId": descriptor.policy_id,
        "absoluteTolerancePolicy": label,
        "appliedAbsoluteTolerances": { "rM": tol.r, "vMps": tol.v, "qUnit": tol.q, "wRadps": tol.w },
        "splitAtThrustKnots": split,
        "knotCutPolicyId": crate::candidate_identity::KNOT_CUT_POLICY_ID,
        "cutKnotsS": mechanism.cut_knots,
        "driverLimits": {
            "initialAdaptiveStepCapS": astraea_core::six_dof::INITIAL_ADAPTIVE_STEP_CAP_S,
            "maxAdaptiveStepCapS": astraea_core::six_dof::MAX_ADAPTIVE_STEP_CAP_S,
            "eventRootWidthS": astraea_core::six_dof::EVENT_ROOT_WIDTH_S,
            "maxAdaptiveTrialsPerCall": 5000,
            "maxConsecutiveRejections": 500,
        },
        "straddledTrials": mechanism.straddled.iter()
            .map(|(t, k)| json!({ "trialStartS": t, "knotTimeS": k })).collect::<Vec<_>>(),
        "clippedTrials": mechanism.clipped.iter()
            .map(|(t, k)| json!({ "trialStartS": t, "knotTimeS": k })).collect::<Vec<_>>(),
        "stepWindowTrials": mechanism.step_window.iter()
            .map(|(a, b)| json!({ "trialStartS": a, "proposedEndS": b })).collect::<Vec<_>>(),
        "adaptiveTrialTotals": {
            "acceptedSteps": mechanism.accepted_steps,
            "rejectedSteps": mechanism.rejected_steps,
            "trials": mechanism.adaptive_trials(),
        },
    }))
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeCandidateRequest {
    pub vehicle: FrontendVehicle,
    pub motor: FrontendMotor,
    pub adapter: RequestedAdapter,
    pub mechanical_source_id: String,
    pub environment_source_id: String,
    pub axial: RequestedAxial,
    pub environment: RequestedEnvironment,
    pub motor_aft_station_from_nose_m: f64,
    pub launch: RequestedLaunch,
    pub horizon_seconds: f64,
    pub curve_machs: Vec<f64>,
    pub query: Option<RequestedQuery>,
    /// Strict optional experiment-only diagnostic controls. The runtime command
    /// refuses any present value. Absent is the exact inherited path (and stays
    /// absent in normalized identity serialization); explicit null is refused
    /// before typed parsing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diagnostic_numerics: Option<RequestedDiagnosticNumerics>,
    /// Native research capture policy. The runtime command refuses any present
    /// value; absent means the runtime report-bounded collection policy and the
    /// normalized identity preimage is unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sample_retention: Option<RequestedSampleRetention>,
}

pub const SAMPLE_RETENTION_SCHEMA_ID: &str = "candidate-native-sample-retention/1.0.0";

/// Strict native-only research collection control. `declaredFull` raises the
/// collection cap up to the hard ceiling; the report stays bounded and the value
/// is never reachable through `simulate_candidate`.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestedSampleRetention {
    pub schema_id: String,
    pub mode: String,
    pub max_committed_samples: usize,
}

fn map_adapter(request: &RequestedAdapter) -> Result<AdapterOptions, String> {
    let declarations = SupportDeclarations {
        provenance: request.declarations.provenance.clone(),
        sharp_physical_tip: request.declarations.sharp_physical_tip,
        circular_axisymmetric_body: request.declarations.circular_axisymmetric_body,
        smooth_slender_profile: request.declarations.smooth_slender_profile,
        identical_equally_spaced_thin_uncanted_fins: request.declarations.identical_equally_spaced_thin_uncanted_fins,
        no_other_external_features_or_unmodeled_interferences: request.declarations.no_other_external_features_or_unmodeled_interferences,
        source_represents_complete_external_geometry: request.declarations.source_represents_complete_external_geometry,
    };
    let ogive_interpretation = match request.ogive_interpretation.as_deref() {
        None => None,
        Some("tangentOgive") => Some(OgiveInterpretation::TangentOgive),
        Some(other) => return Err(error(format!("native candidate: unsupported ogive interpretation '{other}'"))),
    };
    let transition_interpretation = match request.transition_interpretation.as_deref() {
        None => None,
        Some("conical") => Some(TransitionInterpretation::Conical),
        Some(other) => return Err(error(format!("native candidate: unsupported transition interpretation '{other}'"))),
    };
    if request.aft_termination != "flatExposedBaseAtFinalStation" {
        return Err(error(format!("native candidate: unsupported aft termination '{}'", request.aft_termination)));
    }
    Ok(AdapterOptions {
        source_identity: request.source_identity.clone(),
        declarations,
        ogive_interpretation,
        transition_interpretation,
        aft_termination: AftTermination::FlatExposedBaseAtFinalStation,
        internal_non_geometry_ids: request.internal_non_geometry_ids.clone(),
        quadrature: QuadratureSettings {
            absolute_tolerance_m3: request.quadrature.absolute_tolerance_m3,
            relative_tolerance: request.quadrature.relative_tolerance,
            max_panels: request.quadrature.max_panels,
        },
    })
}

fn b3(v: Vec3) -> Value { json!([v.x, v.y, v.z]) }
fn b4(q: Quat) -> Value { json!([q.w, q.x, q.y, q.z]) }

fn coefficients_json(datum: Option<CoefficientWrench>, cg: Option<CoefficientWrench>) -> Value {
    json!({
        "datum": datum.map(|w| json!({ "cfBody": b3(Vec3 { x: w.cf_b.x, y: w.cf_b.y, z: w.cf_b.z }),
            "cmBody": b3(Vec3 { x: w.cm_b.x, y: w.cm_b.y, z: w.cm_b.z }) })),
        "cg": cg.map(|w| json!({ "cfBody": b3(Vec3 { x: w.cf_b.x, y: w.cf_b.y, z: w.cf_b.z }),
            "cmBody": b3(Vec3 { x: w.cm_b.x, y: w.cm_b.y, z: w.cm_b.z }) })),
    })
}

fn unavailable_json(sample: &CandidateSample) -> Value {
    Value::Array(sample.unavailable.iter().map(|u| json!({
        "quantity": u.quantity, "reason": u.reason })).collect())
}

fn sample_json(sample: &CandidateSample) -> Value {
    let flow = sample.flow.map(|f| json!({
        "alphaRad": f.alpha_rad, "betaRad": f.beta_rad,
        "alphaDeg": f.alpha_rad.to_degrees(), "betaDeg": f.beta_rad.to_degrees(),
        "incidenceDeg": f.incidence_rad.to_degrees(),
    }));
    let winds = sample.wind_coefficients.map(|w| json!({
        "cdWind": w.drag, "clWind": w.lift, "cyWind": w.side }));
    let cp = sample.cp.map(|cp| json!({
        "stationFromNoseM": cp.station_from_nose_m,
        "kappaC": cp.kappa_c,
        "reason": cp.reason.map(|r| format!("{r:?}")),
    }));
    let derivatives = sample.normal_derivatives.map(|s| json!({
        "cPerRad": s.c_per_rad, "jMPerRad": s.j_m_per_rad,
        "sumAbsCPerRad": s.sum_abs_c_per_rad, "sumAbsJMPerRad": s.sum_abs_j_m_per_rad,
    }));
    let mut value = json!({
        "origin": sample.sample_origin,
        "timeS": sample.stage_time_s,
        "flags": {
            "drogueDeployed": sample.flags.drogue_deployed,
            "mainDeployed": sample.flags.main_deployed,
            "railBound": sample.flags.rail_bound,
        },
        "applicability": format!("{:?}", sample.applicability),
        "computationalStatus": format!("{:?}", sample.status),
        "identities": {
            "compositionId": sample.identities.composition_id,
            "staticProviderId": sample.identities.static_provider_id,
            "rateModelId": sample.identities.rate_model_id,
            "environmentModelId": sample.identities.environment_model_id,
            "mechanicalModelId": sample.identities.mechanical_model_id,
            "calibrationPolicyId": sample.identities.calibration_policy_id,
            "canopyModelId": sample.identities.canopy_model_id,
            "geometryIdentity": sample.identities.geometry_identity,
            "axialProviderId": sample.identities.axial_provider_id,
            "axialInputIdentity": sample.identities.axial_input_identity,
        },
        "state": {
            "positionM": b3(sample.state.r),
            "velocityMps": b3(sample.state.v),
            "quaternionWxyz": b4(sample.state.q),
            "omegaRadps": b3(sample.state.w),
        },
        "mechanics": {
            "massKg": sample.mechanics.mass_kg,
            "cgFromNoseM": sample.mechanics.cg_from_nose_m,
            "densityKgM3": sample.mechanics.density_kg_m3,
            "speedOfSoundMps": sample.mechanics.speed_of_sound_mps,
            "airspeedMps": sample.mechanics.airspeed_mps,
            "mach": sample.mechanics.mach,
            "dynamicPressurePa": sample.mechanics.dynamic_pressure_pa,
            "thrustN": sample.mechanics.thrust_n,
            "windNMps": b3(sample.mechanics.wind_n_mps),
            "referenceAreaM2": sample.mechanics.reference_area_m2,
            "referenceLengthM": sample.mechanics.reference_length_m,
        },
        "flow": flow,
        "coefficients": coefficients_json(sample.static_coefficients_at_datum, sample.static_coefficients_at_cg),
        "windCoefficients": winds,
        "normalDerivatives": derivatives,
        "cp": cp,
        "staticForceBodyN": b3(sample.static_force_body_n),
        "staticMomentCgBodyNm": b3(sample.static_moment_cg_body_nm),
        "rateMomentBodyNm": b3(sample.rate_moment_body_nm),
        "canopyDragBodyN": sample.canopy_drag_force_body_n.map(b3),
        "aeroForceBodyN": b3(sample.aero_force_body_n),
        "aeroMomentCgBodyNm": b3(sample.aero_moment_cg_body_nm),
        "dragAlongWindN": sample.drag_along_wind_n,
        "aeroNegligibility": {
            "policyId": sample.aero_negligibility.policy_id,
            "relativeBound": sample.aero_negligibility.relative_bound,
            "maxPossibleForceN": sample.aero_negligibility.max_possible_force_n,
            "weightN": sample.aero_negligibility.weight_n,
            "isNegligible": sample.aero_negligibility.is_negligible,
        },
        "unavailable": unavailable_json(sample),
    });
    if let Some(observation) = &sample.profile_environment {
        value["profileEnvironment"] = crate::profile_candidate::observation_json(observation);
    }
    value
}

fn bits_equal(a: Option<f64>, b: Option<f64>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => a.to_bits() == b.to_bits(),
        (None, None) => true,
        _ => false,
    }
}

fn wrenches_bitwise_equal(a: Option<CoefficientWrench>, b: Option<CoefficientWrench>) -> bool {
    match (a, b) {
        (Some(a), Some(b)) => {
            bits_equal(Some(a.cf_b.x), Some(b.cf_b.x)) && bits_equal(Some(a.cf_b.y), Some(b.cf_b.y))
                && bits_equal(Some(a.cf_b.z), Some(b.cf_b.z)) && bits_equal(Some(a.cm_b.x), Some(b.cm_b.x))
                && bits_equal(Some(a.cm_b.y), Some(b.cm_b.y)) && bits_equal(Some(a.cm_b.z), Some(b.cm_b.z))
        }
        (None, None) => true,
        _ => false,
    }
}

/// The report's bitwise curve assertion: the reference-Mach point must carry the
/// reference composition's static wrenches exactly. Tested against a single
/// flipped bit so the predicate can never pass vacuously.
fn curve_matches_reference(point: &CandidateCurvePoint, reference: &CandidateSample) -> bool {
    wrenches_bitwise_equal(point.static_coefficients_at_datum, reference.static_coefficients_at_datum)
        && wrenches_bitwise_equal(point.static_coefficients_at_cg, reference.static_coefficients_at_cg)
}

fn state_from(dto: &RequestedState) -> RigidState {
    RigidState {
        r: Vec3 { x: dto.position_m[0], y: dto.position_m[1], z: dto.position_m[2] },
        v: Vec3 { x: dto.velocity_mps[0], y: dto.velocity_mps[1], z: dto.velocity_mps[2] },
        q: Quat { w: dto.quaternion_wxyz[0], x: dto.quaternion_wxyz[1],
            y: dto.quaternion_wxyz[2], z: dto.quaternion_wxyz[3] },
        w: Vec3 { x: dto.omega_radps[0], y: dto.omega_radps[1], z: dto.omega_radps[2] },
    }
}

/// Report sample selection: the accepted app archive policy
/// (`candidate-archive-display-samples/1.0.0`) applied in the engine so the full
/// collected set never crosses the command boundary. Mandatory context is the
/// first and final committed sample, the three observed-prefix peak samples and
/// the samples bracketing every event; the rest is an evenly spaced fill. If the
/// mandatory context alone exceeds the cap the run is refused rather than
/// silently losing it. Deterministic: integer indices, no time rounding.
fn retained_sample_indices(
    samples: &[CandidateSample],
    mandatory_times: &[f64],
    cap: usize,
) -> Result<Vec<usize>, String> {
    if samples.is_empty() {
        return Err("candidate sample retention: no committed samples".to_string());
    }
    if cap == 0 {
        return Err("candidate sample retention: cap must be positive".to_string());
    }
    let times: Vec<f64> = samples.iter().map(|sample| sample.stage_time_s).collect();
    let mut selected: std::collections::BTreeSet<usize> = std::collections::BTreeSet::new();
    selected.insert(0);
    selected.insert(times.len() - 1);
    for &mandatory in mandatory_times {
        if !mandatory.is_finite() { continue; }
        let mut before: Option<usize> = None;
        let mut after: Option<usize> = None;
        for (index, &time) in times.iter().enumerate() {
            if time <= mandatory { before = Some(index); }
            if time >= mandatory { after = Some(index); break; }
        }
        if let Some(index) = before { selected.insert(index); }
        if let Some(index) = after { selected.insert(index); }
    }
    if selected.len() > cap {
        return Err(format!(
            "{REPORT_SAMPLE_POLICY_ID}: mandatory first/final/peak/event context needs {} committed samples, which exceeds the report cap {cap}; no subset was written", selected.len()));
    }
    if times.len() <= cap {
        return Ok((0..times.len()).collect());
    }
    let remaining = cap - selected.len();
    if remaining > 0 {
        let step = (times.len() - 1) as f64 / (remaining + 1) as f64;
        for k in 1..=remaining {
            selected.insert((k as f64 * step).round() as usize);
        }
    }
    let mut cursor = 0;
    while selected.len() < cap && cursor < times.len() {
        selected.insert(cursor);
        cursor += 1;
    }
    Ok(selected.into_iter().collect())
}

fn trajectory_json(result: &CandidateRunResult, retained: &[usize], retention: SampleRetention) -> Value {
    json!({
        "schemaId": result.schema_id,
        "termination": format!("{:?}", result.termination),
        "computationalCompletion": format!("{:?}", result.computational_completion),
        "empiricalQualification": "Unqualified",
        "dynamicQualification": "Unknown",
        "requestedHorizonS": result.requested_horizon_s,
        "finalTimeS": result.final_time_s,
        "finalState": {
            "positionM": b3(result.final_state.r),
            "velocityMps": b3(result.final_state.v),
            "quaternionWxyz": b4(result.final_state.q),
            "omegaRadps": b3(result.final_state.w),
        },
        "finalFlags": {
            "drogueDeployed": result.final_flags.drogue_deployed,
            "mainDeployed": result.final_flags.main_deployed,
            "railBound": result.final_flags.rail_bound,
        },
        "landing": result.landing.as_ref().map(|l| json!({
            "timeS": l.time_s,
            "positionNM": b3(l.position_n_m),
            "speedMps": l.speed_mps,
            "massKg": l.mass_kg,
            "eventDescription": l.event_description,
        })),
        "apogeeEvent": result.apogee_event.as_ref().map(|a| json!({
            "timeS": a.time_s, "altitudeAglM": a.altitude_agl_m,
            "velocityMps": a.velocity_mps, "description": a.description,
        })),
        "observedPrefix": {
            "samplingPolicyId": result.observed_prefix.sampling_policy_id,
            "sampleCount": result.observed_prefix.sample_count,
            "maxAltitudeAglM": result.observed_prefix.max_altitude_agl_m,
            "maxAltitudeTimeS": result.observed_prefix.max_altitude_time_s,
            "maxAirspeedMps": result.observed_prefix.max_airspeed_mps,
            "maxAirspeedTimeS": result.observed_prefix.max_airspeed_time_s,
            "maxDynamicPressurePa": result.observed_prefix.max_dynamic_pressure_pa,
            "maxDynamicPressureTimeS": result.observed_prefix.max_dynamic_pressure_time_s,
            "note": result.observed_prefix.note,
        },
        "retention": {
            "policyId": REPORT_SAMPLE_POLICY_ID,
            "mode": retention.mode_id(),
            "sampleCount": result.committed_samples.len(),
            "retainedSampleCount": retained.len(),
            "collectionCapId": COLLECTED_SAMPLE_CAP_ID,
            "collectionCap": retention.collected_cap().unwrap_or(COLLECTED_SAMPLE_CAP),
        },
        "samples": retained.iter().map(|&index| sample_json(&result.committed_samples[index]))
            .collect::<Vec<_>>(),
    })
}

/// Report limitations plus an explicit note when the reference state made the
/// static curves inapplicable, so a reader cannot mistake `notApplicable` for
/// "computed and empty".
fn limitations_with_curves(base: &[&'static str], curves: &Value) -> Vec<String> {
    let mut notes: Vec<String> = base.iter().map(|note| (*note).to_string()).collect();
    if curves["status"] == "notApplicable" {
        let reason = curves["notApplicable"]["reasonId"].as_str().unwrap_or_default();
        notes.push(format!(
            "Static airframe curves are not applicable at this reference state ({reason}); the completed trajectory and the query are unaffected and no substitute airframe state was sampled."));
    }
    notes
}

/// One static curve point as reported. Unchanged point shape; only the
/// reference-Mach point is now sampled from the reference stage.
fn curve_point_json(p: &CandidateCurvePoint) -> Value {
    let mut value = json!({
        "mach": p.mach,
        "computationalStatus": format!("{:?}", p.status),
        "dynamicPressurePa": p.dynamic_pressure_pa,
        "flow": p.flow.map(|f| json!({
            "alphaDeg": f.alpha_rad.to_degrees(),
            "betaDeg": f.beta_rad.to_degrees(),
            "incidenceDeg": f.incidence_rad.to_degrees(),
        })),
        "coefficients": coefficients_json(p.static_coefficients_at_datum, p.static_coefficients_at_cg),
        "windCoefficients": p.wind_coefficients.map(|w| json!({
            "cdWind": w.drag, "clWind": w.lift, "cyWind": w.side })),
        "normalDerivatives": p.normal_derivatives.map(|s| json!({
            "cPerRad": s.c_per_rad, "jMPerRad": s.j_m_per_rad,
            "sumAbsCPerRad": s.sum_abs_c_per_rad, "sumAbsJMPerRad": s.sum_abs_j_m_per_rad,
        })),
        "cp": p.cp.map(|cp| json!({
            "stationFromNoseM": cp.station_from_nose_m,
            "kappaC": cp.kappa_c,
            "reason": cp.reason.map(|r| format!("{r:?}")),
        })),
        "staticForceBodyN": b3(p.static_force_body_n),
        "staticMomentCgBodyNm": b3(p.static_moment_cg_body_nm),
        "aeroNegligibility": {
            "policyId": p.aero_negligibility.policy_id,
            "relativeBound": p.aero_negligibility.relative_bound,
            "maxPossibleForceN": p.aero_negligibility.max_possible_force_n,
            "weightN": p.aero_negligibility.weight_n,
            "isNegligible": p.aero_negligibility.is_negligible,
        },
        "unavailable": p.unavailable.iter().map(|u| json!({
            "quantity": u.quantity, "reason": u.reason })).collect::<Vec<_>>(),
    });
    if let Some(observation) = &p.profile_environment {
        value["profileEnvironment"] = crate::profile_candidate::observation_json(observation);
    }
    value
}

/// Static-curve block plus the reference-state comparison.
///
/// A reference state whose airframe curves are not applicable is *data*: the
/// completed trajectory and the query survive, the reason is named, and no other
/// airframe state is sampled. Real grid/state/domain/profile errors still refuse
/// the command (they are never converted into an applicability claim).
#[derive(Debug)]
struct CurvesReport {
    curves: Value,
    comparison: Value,
    /// Profile source identity observed at the reference-Mach curve point, used
    /// by the profile report's shared-source check. `None` when not applicable.
    reference_point_profile_source: Option<String>,
}

fn curves_report(
    prepared: &PreparedCandidate,
    reference: &CandidateSample,
    requested_machs: &[f64],
) -> Result<CurvesReport, String> {
    let reference_mach = reference.mechanics.mach;
    let reference_mach_added = !requested_machs.iter().any(|m| m.to_bits() == reference_mach.to_bits());
    let mut grid = requested_machs.to_vec();
    if reference_mach_added { grid.push(reference_mach); }
    let outcome = curves_with_applicability(prepared, reference.stage_time_s, &reference.state,
        reference.flags, &grid).map_err(|e| format!("native candidate curves failed: {e}"))?;
    match outcome {
        CandidateCurves::Computed(points) => {
            let curve_at_reference = points.iter().find(|p| p.mach.to_bits() == reference_mach.to_bits());
            let matches = curve_at_reference.map_or(false, |p| curve_matches_reference(p, reference));
            let curves = json!({
                "status": "computed",
                "policyId": CURVE_APPLICABILITY_POLICY_ID,
                "requestedMachs": requested_machs,
                "referenceMachAddedForEquivalence": reference_mach_added,
                "notApplicable": Value::Null,
                "points": points.iter().map(curve_point_json).collect::<Vec<_>>(),
            });
            let comparison = json!({
                "status": "compared",
                "matchesReferenceSample": matches,
                "reasonId": Value::Null,
            });
            let profile_source = curve_at_reference
                .and_then(|p| p.profile_environment.as_ref())
                .map(|o| o.profile_source_identity.clone());
            Ok(CurvesReport { curves, comparison,
                reference_point_profile_source: profile_source })
        }
        CandidateCurves::NotApplicable(reason) => {
            let curves = json!({
                "status": "notApplicable",
                "policyId": CURVE_APPLICABILITY_POLICY_ID,
                "requestedMachs": requested_machs,
                "referenceMachAddedForEquivalence": false,
                "notApplicable": {
                    "reasonId": reason.reason_id,
                    "reason": reason.reason,
                    "referenceTimeS": reason.reference_time_s,
                    "drogueDeployed": reason.drogue_deployed,
                    "mainDeployed": reason.main_deployed,
                    "referenceAirspeedMps": reference.mechanics.airspeed_mps,
                    "referenceMach": reference_mach,
                },
                "points": Value::Null,
            });
            let comparison = json!({
                "status": "not-applicable",
                "matchesReferenceSample": Value::Null,
                "reasonId": reason.reason_id,
            });
            Ok(CurvesReport { curves, comparison, reference_point_profile_source: None })
        }
    }
}

/// Dispatch entry for the explicit `simulate_candidate` command. The request is
/// the existing typed candidate request; the wrapper key keeps dispatch-only
/// metadata out of the normalized identity. Profile envelopes and experiment
/// controls are not offered here. The native helper entry points keep the
/// experiment-only `diagnosticNumerics` seam.
pub fn evaluate_dispatch(args: &Value) -> Result<Value, String> {
    let request = args
        .get("request")
        .ok_or_else(|| "simulate_candidate: missing argument 'request'".to_string())?;
    // One command, one admission path. An absent schema id is the untagged
    // runtime request; the explicit E1 profile envelope is the only accepted
    // tag; anything else is refused with the accepted set, never reinterpreted.
    match request.get("schemaId") {
        None => evaluate_untagged_dispatch(request),
        Some(Value::String(schema)) if schema == crate::profile_candidate::SCHEMA_ID => {
            crate::profile_candidate::evaluate_dispatch(args)
        }
        Some(Value::String(schema)) => Err(format!(
            "simulate_candidate: unsupported request schemaId '{schema}'; accepted: '{}' or an untagged runtime candidate request",
            crate::profile_candidate::SCHEMA_ID)),
        Some(_) => Err("simulate_candidate: request schemaId must be a string when present".to_string()),
    }
}

fn evaluate_untagged_dispatch(request: &Value) -> Result<Value, String> {
    refuse_null_controls(request)?;
    // Both controls are refused before typed parsing, so no JSON shape (a
    // partial object, an otherwise invalid request, or a nested candidate
    // envelope) can reach the experiment seam through this command.
    if [
        request.get("diagnosticNumerics"),
        request.get("candidate").and_then(|candidate| candidate.get("diagnosticNumerics")),
    ].iter().any(|found| found.is_some()) {
        return Err(
            "simulate_candidate: diagnosticNumerics is an experiment-only control and is not offered by this runtime command"
                .into(),
        );
    }
    if [
        request.get("sampleRetention"),
        request.get("candidate").and_then(|candidate| candidate.get("sampleRetention")),
    ].iter().any(|found| found.is_some()) {
        return Err(
            "simulate_candidate: sampleRetention is a native research capture control and is not offered by this runtime command"
                .into(),
        );
    }
    let request: NativeCandidateRequest = serde_json::from_value(request.clone())
        .map_err(|e| format!("simulate_candidate: invalid argument 'request': {e}"))?;
    run_request(&request)
}

/// Execute the request and return the JSON report. The caller decides where to
/// write it; this function never opens datasets or scoring inputs.
pub fn run_request(request: &NativeCandidateRequest) -> Result<Value, String> {
    run_request_with_profile(request, None).map(|(report, _sidecar)| report)
}

pub(crate) fn run_request_with_profile(request: &NativeCandidateRequest,
    profile: Option<astraea_core::flight_provider::CandidateProfileEnvironment>,
) -> Result<(Value, Value), String> {
    let effective_inputs = crate::candidate_identity::normalized(request)?;
    let inputs = NativeCandidateInputs {
        adapter: map_adapter(&request.adapter)?,
        mechanical_source_id: request.mechanical_source_id.clone(),
        environment_source_id: request.environment_source_id.clone(),
        axial_provider_id: request.axial.provider_id.clone(),
        axial_input_identity: request.axial.input_identity.clone(),
        axial_ca0: request.axial.ca0,
        environment: CandidateEnvironment {
            launch_altitude_asl_m: if profile.is_some() { 0.0 } else { request.environment.launch_altitude_asl_m },
            wind_speed_surface_mps: request.environment.wind_speed_surface_mps,
            wind_azimuth_deg: request.environment.wind_azimuth_deg,
        },
        motor_aft_station_from_nose_m: request.motor_aft_station_from_nose_m,
    };
    let mut native = prepare_native_candidate(&request.vehicle, &request.motor, &inputs)?;
    if let Some(profile) = profile {
        native.prepared = native.prepared.with_profile_environment(profile).map_err(|e| e.to_string())?;
    }
    let options = CandidateOptions {
        rail_length_m: request.launch.rail_length_m,
        rail_elevation_deg: request.launch.rail_elevation_deg,
        rail_azimuth_deg: request.launch.rail_azimuth_deg,
        main_deploy_altitude_agl_m: request.launch.main_deploy_altitude_agl_m,
        time_step_s: request.launch.time_step_s,
        drag_cd_scale: request.launch.drag_cd_scale,
        fin_cant_angle_deg: request.launch.fin_cant_angle_deg,
    };
    let run_request = CandidateRunRequest { horizon_s: request.horizon_seconds, options };
    let controls = diagnostic_controls(request)?;
    let retention = retention_policy(request)?;
    let trajectory = run_bounded_with_retention(&native.prepared, &run_request, controls, retention)
        .map_err(|error| if error.resource_limit {
            // Declared resource policy, not a physical/domain failure.
            format!("native candidate resource limit: {error}")
        } else {
            format!("native candidate bounded run failed: {error}")
        })?;
    let mandatory_times = {
        let prefix = &trajectory.observed_prefix;
        let mut times = vec![prefix.max_altitude_time_s, prefix.max_airspeed_time_s,
            prefix.max_dynamic_pressure_time_s];
        times.extend(trajectory.events.iter().map(|event| event.time));
        times
    };
    let retained_indices = retained_sample_indices(&trajectory.committed_samples,
        &mandatory_times, REPORT_SAMPLE_CAP)?;
    let reference = trajectory.committed_samples.last()
        .ok_or_else(|| error("native candidate: bounded run produced no committed samples"))?;
    let (query_state, query_time, query_flags, query_origin) = match &request.query {
        Some(q) => (state_from(&q.state), q.stage_time_s,
            CandidateFlags { drogue_deployed: q.drogue_deployed,
                main_deployed: q.main_deployed, rail_bound: q.rail_bound }, "requested"),
        None => (reference.state, reference.stage_time_s, reference.flags, "last-committed-sample"),
    };
    let queried = query(&native.prepared, query_time, &query_state, query_flags)
        .map_err(|e| format!("native candidate query failed: {e}"))?;
    // The requested grid is validated before any trajectory work: an invalid
    // grid refuses even when the eventual reference state would be reported as
    // not applicable.
    validate_curve_machs(&request.curve_machs)
        .map_err(|e| format!("native candidate curves failed: {e}"))?;
    let curves_report = curves_report(&native.prepared, reference, &request.curve_machs)?;
    let curves_json = curves_report.curves.clone();
    let curve_comparison = curves_report.comparison.clone();
    let limitations = limitations_with_curves(&native.prepared.limitations(), &curves_json);
    let equivalence = json!({
        "referenceSampleTimeS": reference.stage_time_s,
        "referenceMach": reference.mechanics.mach,
        "queryMatchesReferenceSample": query_origin == "last-committed-sample"
            && wrenches_bitwise_equal(queried.static_coefficients_at_datum, reference.static_coefficients_at_datum)
            && wrenches_bitwise_equal(queried.static_coefficients_at_cg, reference.static_coefficients_at_cg),
        "curveComparison": curve_comparison,
        "compared": "static coefficient wrenches at datum and CG (f64 bits); one prepared object and one core evaluator",
        "note": "Direct-query equality requires running the query at the last committed sample (no request query); curve equality requires the reference Mach in curveMachs.",
    });
    let identities = &trajectory.identities;
    let mut report = json!({
        "schemaId": REPORT_SCHEMA_ID,
        "status": "experimental-unqualified",
        "scopeNote": "Explicit bounded candidate runtime report. Not as-flown evidence, not a source-qualified model, not a default or released flight model.",
        "resultSchemaId": RESULT_SCHEMA_ID,
        "compositionId": COMPOSITION_ID,
        "supportPolicy": {
            "machUpperExclusive": MAX_MACH_EXCLUSIVE,
            "maxIncidenceDeg": MAX_INCIDENCE_DEG,
            "notes": [
                "Forward flow required; tail-first/lateral-only flow is unsupported.",
                "Above the versioned 1e-6-of-weight aero-negligibility bound every state is support-checked; below it dimensional aero loads are approximated as zero with no flow observation, and the checks resume immediately above it. Rail states get no domain waiver.",
                "Cant must be exactly zero and historical drag calibration is refused.",
                "Attitudes must be near-unit (|q|-1 <= 1e-6); the atmosphere is enforced at the instantaneous altitude (0..20 km ASL)."
            ],
        },
        "identities": {
            "compositionId": identities.composition_id,
            "staticProviderId": identities.static_provider_id,
            "rateModelId": identities.rate_model_id,
            "environmentModelId": identities.environment_model_id,
            "mechanicalModelId": identities.mechanical_model_id,
            "supportPolicyId": identities.support_policy_id,
            "calibrationPolicyId": identities.calibration_policy_id,
            "canopyModelId": identities.canopy_model_id,
            "adapterId": identities.adapter_id,
            "callerSourceIdentity": identities.caller_source_identity,
            "geometryIdentity": identities.geometry_identity,
            "axialProviderId": identities.axial_provider_id,
            "axialInputIdentity": identities.axial_input_identity,
            "mechanicalSourceId": identities.mechanical_source_id,
            "environmentSourceId": identities.environment_source_id,
        },
        "activePolicies": {
            "aeroNegligibility": astraea_core::flight_provider::AERO_NEGLIGIBILITY_POLICY_ID,
            "aeroNegligibilityRelativeBound": astraea_core::flight_provider::AERO_NEGLIGIBILITY_RELATIVE_BOUND,
            "attitude": astraea_core::flight_provider::ATTITUDE_POLICY_ID,
            "attitudeNormTolerance": astraea_core::flight_provider::ATTITUDE_NORM_TOLERANCE,
            "prefixSampling": trajectory.observed_prefix.sampling_policy_id,
            "cpCancellation": astraea_core::aero_coefficients::CP_CANCELLATION_POLICY_ID,
            "bodyAreaValidation": astraea_core::aero_coefficients::BODY_AREA_VALIDATION_POLICY_ID,
            "profileTime": reference.profile_environment.as_ref().map(|p| p.time_policy_id),
        },
        "adapter": {
            "adapterId": native.adapter_id,
            "sourceIdentity": native.source_identity,
            "components": native.component_roles.iter().map(|c| json!({
                "sourceIndex": c.source_index, "id": c.id, "kind": c.kind, "role": c.role,
            })).collect::<Vec<_>>(),
            "supportLimits": native.support_limits,
        },
        "geometry": {
            "identity": identities.geometry_identity,
            "areaM2": native.references.area_m2,
            "lengthM": native.references.length_m,
            "diameterM": native.references.diameter_m,
            "bodyLengthM": native.prepared.geometry_length_m(),
        },
        "mechanical": {
            "dryMassKg": native.carrier.dry_mass_kg,
            "cgFromNoseM": native.carrier.cg_from_nose_m,
            "totalLengthM": native.carrier.total_length_m,
            "referenceDiameterM": native.carrier.reference_diameter_m,
            "motorAftStationFromNoseM": native.carrier.motor_aft_station_from_nose_m,
            "motorDesignation": native.carrier.motor_designation,
            "drogue": native.carrier.drogue.map(|(d, cd)| json!({"diameterM": d, "cd": cd})),
            "main": native.carrier.main.map(|(d, cd)| json!({"diameterM": d, "cd": cd})),
            "legacyCarrierFields": "NaN-poisoned legacy slope/CP/drag fields; candidate never consults them",
        },
        "environment": {
            "launchAltitudeASL": native.prepared.environment().launch_altitude_asl_m,
            "windSpeedSurfaceMps": native.prepared.environment().wind_speed_surface_mps,
            "windAzimuthDeg": native.prepared.environment().wind_azimuth_deg,
            "environmentSourceId": identities.environment_source_id,
        },
        "launch": {
            "railLengthM": request.launch.rail_length_m,
            "railElevationDeg": request.launch.rail_elevation_deg,
            "railAzimuthDeg": request.launch.rail_azimuth_deg,
            "mainDeployAltitudeAglM": request.launch.main_deploy_altitude_agl_m,
            "timeStepS": request.launch.time_step_s,
            "dragCdScale": request.launch.drag_cd_scale,
            "finCantAngleDeg": request.launch.fin_cant_angle_deg,
        },
        "trajectory": trajectory_json(&trajectory, &retained_indices, retention),
        "query": {
            "origin": query_origin,
            "timeS": query_time,
            "sample": sample_json(&queried),
        },
        "curves": curves_json,
        "equivalence": equivalence,
        "events": trajectory.events.iter().map(|e| json!({
            "timeS": e.time, "name": e.name, "altitudeAglM": e.altitude,
            "velocityMps": e.velocity, "description": e.description,
        })).collect::<Vec<_>>(),
        "limitations": limitations,
        "commands": {
            "dispatchRegistered": true,
            "commandName": "simulate_candidate",
            "envelopeSchemaId": UNTAGGED_ENVELOPE_ID,
            "wasmTargetIncluded": true,
            "activation": "explicit request only; not a project field, default flight model, GUI option or ensemble provider",
            "outputPolicy": "all committed macro samples (no decimation, no response-size cap added) and the requested curve grid plus the reference Mach; a reference state whose airframe curves are not applicable is reported as data, not as an error",
            "artifactIdentity": "not self-reported; caller binds the executed engine artifact",
        },
    });
    if let Some(profile) = native.prepared.profile_environment() {
        report["schemaId"] = json!(PROFILE_REPORT_SCHEMA_ID);
        report["commands"] = json!({
            "dispatchRegistered": true,
            "commandName": "simulate_candidate",
            "envelopeSchemaId": crate::profile_candidate::SCHEMA_ID,
            "wasmTargetIncluded": true,
            "activation": "explicit profile envelope only; not a project field, default flight model, GUI option or ensemble provider",
            "outputPolicy": "all committed macro samples (no decimation, no response-size cap added) and the requested curve grid plus the reference Mach; a reference state whose airframe curves are not applicable is reported as data, not as an error",
            "artifactIdentity": "not self-reported; caller binds the executed engine artifact",
        });
        report["compositionId"] = json!(identities.composition_id);
        report["supportPolicy"]["notes"][3] = json!("Near-unit attitudes required; actual geometric-MSL E1 profile/time coverage enforced at every read, no retained atmosphere/wind fallback.");
        report["equivalence"]["profileObservationQueryExact"] = json!(query_origin == "last-committed-sample" && queried.profile_environment == reference.profile_environment);
        report["equivalence"]["profileSourceSharedByCurve"] = json!(
            curves_report.reference_point_profile_source.as_deref()
                == Some(identities.environment_source_id.as_str()));
        report["equivalence"]["profileCurveRoundoffNote"] = json!("Curves reconstruct a ground velocity from the requested Mach/direction; the reference-Mach point is sampled from the reference stage itself, so its coefficients are exact, while other points keep that reconstruction. Dimensional and flow equality is checked with explicit f64 roundoff tolerances, not a physical accuracy budget.");
        report["environment"] = json!({
            "environmentModelId": identities.environment_model_id,
            "profileSourceIdentity": profile.profile().metadata().source_identity,
            "launchAltitudeGeometricMslM": profile.launch_altitude_geometric_msl_m(),
            "verticalDatumIdentity": profile.vertical_datum_identity(),
            "launchTimeUtcUnixS": profile.launch_time_utc_unix_s(),
            "axialSourceNote": "Explicit prescribed CA0; local inherited low-Re axial source not integrated.",
        });
    }
    report["effectiveInputs"] = effective_inputs.clone();
    crate::candidate_identity::attach(&mut report, effective_inputs, &numerical_policy_descriptor(request));
    let sidecar = mechanism_sidecar(request, &trajectory.mechanism)?;
    Ok((report, sidecar))
}

/// Parse a request document and return the JSON report text.
pub fn run_request_json(json_text: &str) -> Result<String, String> {
    run_request_json_with_sidecar(json_text).map(|(report, _sidecar)| report)
}

/// Report text plus the per-attempt mechanism sidecar text. The sidecar is
/// diagnostic bookkeeping destined for the experiment ledger, never for the
/// compared candidate report.
pub fn run_request_json_with_sidecar(json_text: &str) -> Result<(String, String), String> {
    let value: Value = serde_json::from_str(json_text)
        .map_err(|e| format!("native candidate: invalid request JSON: {e}"))?;
    refuse_null_controls(&value)?;
    let request: NativeCandidateRequest = serde_json::from_value(value)
        .map_err(|e| format!("native candidate: invalid request JSON: {e}"))?;
    let (report, sidecar) = run_request_with_profile(&request, None)?;
    let report_text = serde_json::to_string(&report)
        .map_err(|e| format!("native candidate: report serialization failed: {e}"))?;
    let sidecar_text = serde_json::to_string(&sidecar)
        .map_err(|e| format!("native candidate: sidecar serialization failed: {e}"))?;
    Ok((report_text, sidecar_text))
}

#[cfg(test)]
mod tests {
    use super::*;
    use astraea_core::flight_provider::{
        CURVE_NOT_APPLICABLE_CANOPY_LIVE, CURVE_NOT_APPLICABLE_NO_FLOW_DIRECTION,
    };

    fn request() -> NativeCandidateRequest {
        serde_json::from_str(include_str!("../tests/fixtures/native-candidate-request.json"))
            .expect("candidate fixture")
    }

    fn options_of(request: &NativeCandidateRequest) -> CandidateOptions {
        CandidateOptions {
            rail_length_m: request.launch.rail_length_m,
            rail_elevation_deg: request.launch.rail_elevation_deg,
            rail_azimuth_deg: request.launch.rail_azimuth_deg,
            main_deploy_altitude_agl_m: request.launch.main_deploy_altitude_agl_m,
            time_step_s: request.launch.time_step_s,
            drag_cd_scale: request.launch.drag_cd_scale,
            fin_cant_angle_deg: request.launch.fin_cant_angle_deg,
        }
    }

    fn fixture_prepared(request: &NativeCandidateRequest) -> PreparedCandidate {
        let inputs = NativeCandidateInputs {
            adapter: map_adapter(&request.adapter).expect("adapter"),
            mechanical_source_id: request.mechanical_source_id.clone(),
            environment_source_id: request.environment_source_id.clone(),
            axial_provider_id: request.axial.provider_id.clone(),
            axial_input_identity: request.axial.input_identity.clone(),
            axial_ca0: request.axial.ca0,
            environment: CandidateEnvironment {
                launch_altitude_asl_m: request.environment.launch_altitude_asl_m,
                wind_speed_surface_mps: request.environment.wind_speed_surface_mps,
                wind_azimuth_deg: request.environment.wind_azimuth_deg,
            },
            motor_aft_station_from_nose_m: request.motor_aft_station_from_nose_m,
        };
        let native = prepare_native_candidate(&request.vehicle, &request.motor, &inputs)
            .expect("prepared candidate");
        native.prepared
    }

    /// The prepared candidate plus the first (exactly zero airspeed) and the last
    /// committed samples of a real bounded run of the synthetic fixture.
    fn fixture_run() -> (PreparedCandidate, CandidateSample, CandidateSample) {
        let request = request();
        let prepared = fixture_prepared(&request);
        let run = run_bounded_with_retention(&prepared,
            &CandidateRunRequest { horizon_s: 1.6, options: options_of(&request) }, None,
            SampleRetention::ReportBounded).expect("bounded run");
        let first = run.committed_samples.first().expect("first sample").clone();
        let last = run.committed_samples.last().expect("last sample").clone();
        (prepared, first, last)
    }

    /// The comparison predicate is bit-exact: a single flipped coefficient bit
    /// must make it false, so a passing report is never vacuous.
    #[test]
    fn wrench_bitwise_comparison_refuses_a_single_flipped_bit() {
        let wrench = CoefficientWrench {
            cf_b: astraea_core::aero_coefficients::Vec3::new(-0.1, -0.35, -0.02),
            cm_b: astraea_core::aero_coefficients::Vec3::new(0.3, 0.0, -0.01),
        };
        let mut flipped = wrench;
        assert!(wrenches_bitwise_equal(Some(wrench), Some(flipped)));
        flipped.cm_b.y = f64::from_bits(wrench.cm_b.y.to_bits() ^ 1);
        assert!(!wrenches_bitwise_equal(Some(wrench), Some(flipped)));
        assert!(!wrenches_bitwise_equal(Some(wrench), None));
        assert!(!wrenches_bitwise_equal(None, Some(wrench)));
        assert!(wrenches_bitwise_equal(None, None));

        let (prepared, _first, last) = fixture_run();
        let points = match curves_with_applicability(&prepared, last.stage_time_s, &last.state,
            last.flags, &[last.mechanics.mach]).expect("curves") {
            CandidateCurves::Computed(points) => points,
            CandidateCurves::NotApplicable(_) => panic!("expected computed curves"),
        };
        assert!(curve_matches_reference(&points[0], &last));
        let mut tampered = last.clone();
        let datum = tampered.static_coefficients_at_datum.as_mut().expect("datum wrench");
        datum.cf_b.y = f64::from_bits(datum.cf_b.y.to_bits() ^ 1);
        assert!(!curve_matches_reference(&points[0], &tampered));
    }

    /// The engine classifies the collection-cap refusal as a resource limit and
    /// names the policy and the limit; it is not reported as a bounded-run or
    /// domain failure. Exercised through the helper seam with a tiny declared cap
    /// so no large run is needed.
    #[test]
    fn collection_cap_surfaces_as_a_named_resource_limit() {
        let mut request = request();
        request.sample_retention = Some(RequestedSampleRetention {
            schema_id: SAMPLE_RETENTION_SCHEMA_ID.to_string(),
            mode: "declaredFull".to_string(),
            max_committed_samples: 2,
        });
        let error = run_request_with_profile(&request, None).unwrap_err();
        assert!(error.starts_with("native candidate resource limit:"), "{error}");
        assert!(error.contains(COLLECTED_SAMPLE_CAP_ID), "{error}");
        assert!(error.contains("exceed 2"), "{error}");
        assert!(!error.contains("bounded run failed"), "{error}");
        assert!(!error.contains("(committed-macro-sample"), "no phase classification: {error}");
    }

    /// The report carries the bounded retained subset, declares the full
    /// committed count, keeps first/final/observed-prefix peak sample context and
    /// computes the peaks over every committed sample (independently recomputed
    /// here from the full run).
    #[test]
    fn report_retention_keeps_mandatory_context_and_full_prefix_peaks() {
        let mut request = request();
        request.launch.time_step_s = 2.0e-4;
        request.horizon_seconds = 1.2;
        let (report, _sidecar) = run_request_with_profile(&request, None).expect("report");
        let retention = &report["trajectory"]["retention"];
        assert_eq!(retention["policyId"], REPORT_SAMPLE_POLICY_ID);
        assert_eq!(retention["mode"], "reportBounded");
        assert_eq!(retention["collectionCapId"], COLLECTED_SAMPLE_CAP_ID);
        assert_eq!(retention["collectionCap"].as_u64().unwrap() as usize, COLLECTED_SAMPLE_CAP);
        let sample_count = retention["sampleCount"].as_u64().unwrap() as usize;
        let retained_count = retention["retainedSampleCount"].as_u64().unwrap() as usize;
        assert!(sample_count > REPORT_SAMPLE_CAP, "sample count {sample_count}");
        assert_eq!(retained_count, REPORT_SAMPLE_CAP);
        let samples = report["trajectory"]["samples"].as_array().unwrap();
        assert_eq!(samples.len(), REPORT_SAMPLE_CAP);
        let times: Vec<f64> = samples.iter().map(|s| s["timeS"].as_f64().unwrap()).collect();
        assert!(times.windows(2).all(|w| w[0] < w[1]), "retained samples must be strictly ordered");
        assert_eq!(times[0], 0.0);
        let final_time = report["trajectory"]["finalTimeS"].as_f64().unwrap();
        assert_eq!(times[times.len() - 1].to_bits(), final_time.to_bits());

        // Independent full-prefix recomputation from the same prepared object.
        let prepared = fixture_prepared(&request);
        let full = run_bounded_with_retention(&prepared,
            &CandidateRunRequest { horizon_s: 1.2, options: options_of(&request) }, None,
            SampleRetention::ReportBounded).expect("full run");
        assert_eq!(full.committed_samples.len(), sample_count);
        let (mut max_alt, mut max_alt_t) = (f64::NEG_INFINITY, 0.0);
        let (mut max_speed, mut max_speed_t) = (f64::NEG_INFINITY, 0.0);
        let (mut max_q, mut max_q_t) = (f64::NEG_INFINITY, 0.0);
        for sample in &full.committed_samples {
            if sample.state.r.z > max_alt { max_alt = sample.state.r.z; max_alt_t = sample.stage_time_s; }
            if sample.mechanics.airspeed_mps > max_speed { max_speed = sample.mechanics.airspeed_mps; max_speed_t = sample.stage_time_s; }
            if sample.mechanics.dynamic_pressure_pa > max_q { max_q = sample.mechanics.dynamic_pressure_pa; max_q_t = sample.stage_time_s; }
        }
        let prefix = &report["trajectory"]["observedPrefix"];
        assert_eq!(prefix["sampleCount"].as_u64().unwrap() as usize, sample_count);
        assert_eq!(prefix["maxAltitudeAglM"].as_f64().unwrap().to_bits(), max_alt.to_bits());
        assert_eq!(prefix["maxAltitudeTimeS"].as_f64().unwrap().to_bits(), max_alt_t.to_bits());
        assert_eq!(prefix["maxAirspeedMps"].as_f64().unwrap().to_bits(), max_speed.to_bits());
        assert_eq!(prefix["maxAirspeedTimeS"].as_f64().unwrap().to_bits(), max_speed_t.to_bits());
        assert_eq!(prefix["maxDynamicPressurePa"].as_f64().unwrap().to_bits(), max_q.to_bits());
        assert_eq!(prefix["maxDynamicPressureTimeS"].as_f64().unwrap().to_bits(), max_q_t.to_bits());
        // Each mandatory peak time is retained, and its retained sample carries
        // the recomputed peak value.
        for (time, value, pointer) in [(max_alt_t, max_alt, "positionM"),
            (max_speed_t, max_speed, "airspeedMps"), (max_q_t, max_q, "dynamicPressurePa")] {
            let sample = samples.iter().find(|s| s["timeS"].as_f64().unwrap().to_bits() == time.to_bits())
                .unwrap_or_else(|| panic!("peak sample at {time} s was dropped"));
            let retained = if pointer == "positionM" {
                sample["state"]["positionM"][2].as_f64().unwrap()
            } else {
                sample["mechanics"][pointer].as_f64().unwrap()
            };
            assert_eq!(retained.to_bits(), value.to_bits(), "{pointer} at {time}");
        }
        // Every event time is bracketed by retained samples.
        let event_times: Vec<f64> = report["events"].as_array().unwrap().iter()
            .map(|e| e["timeS"].as_f64().unwrap()).collect();
        for event in event_times {
            let before = samples.iter().any(|s| s["timeS"].as_f64().unwrap() <= event);
            let after = samples.iter().any(|s| s["timeS"].as_f64().unwrap() >= event);
            assert!(before || after, "event {event} has no retained bracket");
        }
    }

    /// The runtime command refuses the research retention control in every JSON
    /// shape, including a null value and a nested candidate object.
    #[test]
    fn dispatch_never_offers_the_research_retention_control() {
        let request = || serde_json::from_str::<Value>(include_str!(
            "../tests/fixtures/native-candidate-request.json")).unwrap();
        let declared = json!({"schemaId": SAMPLE_RETENTION_SCHEMA_ID, "mode": "declaredFull",
            "maxCommittedSamples": 20_000});
        for args in [
            json!({"request": {"sampleRetention": declared}}),
            json!({"request": {"sampleRetention": null}}),
            json!({"request": {"candidate": {"sampleRetention": declared}}}),
        ] {
            let error = evaluate_dispatch(&args).unwrap_err();
            assert!(error.contains("sampleRetention"), "{error}");
        }
        let mut with_control = request();
        with_control["sampleRetention"] = declared.clone();
        let error = evaluate_dispatch(&json!({"request": with_control})).unwrap_err();
        assert!(error.contains("not offered by this runtime command"), "{error}");
        // The helper seam accepts the same control (validated inside the ceiling).
        let mut helper_request: NativeCandidateRequest = serde_json::from_value(request()).unwrap();
        helper_request.sample_retention = Some(RequestedSampleRetention {
            schema_id: SAMPLE_RETENTION_SCHEMA_ID.to_string(),
            mode: "declaredFull".to_string(),
            max_committed_samples: 20_000,
        });
        let (report, _sidecar) = run_request_with_profile(&helper_request, None).unwrap();
        assert_eq!(report["trajectory"]["retention"]["mode"], "declaredFull");
        assert_eq!(report["trajectory"]["retention"]["collectionCap"], 20_000);
        let mut too_big = helper_request.clone();
        too_big.sample_retention.as_mut().unwrap().max_committed_samples = 250_001;
        let error = run_request_with_profile(&too_big, None).unwrap_err();
        assert!(error.contains("250000"), "{error}");
        let mut wrong_mode = helper_request.clone();
        wrong_mode.sample_retention.as_mut().unwrap().mode = "reportBounded".to_string();
        assert!(run_request_with_profile(&wrong_mode, None).unwrap_err().contains("declaredFull"));
    }

    /// A canopy-live reference is reported as data at the exact production seam.
    /// A *flown* canopy-live reference is unreachable under SB1 forward-flow
    /// support (accepted RMP01 finding, re-probed here), so the flags of a real
    /// committed sample are the only honest way to exercise this branch.
    #[test]
    fn curves_report_reports_an_inapplicable_reference_as_data() {
        let (prepared, first, last) = fixture_run();
        let computed = curves_report(&prepared, &last, &[0.05, 0.2]).expect("computed");
        assert_eq!(computed.curves["status"], "computed");
        assert_eq!(computed.curves["policyId"], CURVE_APPLICABILITY_POLICY_ID);
        assert_eq!(computed.curves["referenceMachAddedForEquivalence"], true);
        assert_eq!(computed.comparison["status"], "compared");
        assert_eq!(computed.comparison["matchesReferenceSample"], true);

        // The first committed sample is a real exactly-zero-airspeed state.
        let zero_speed = curves_report(&prepared, &first, &[0.05]).expect("zero-speed report");
        assert_eq!(zero_speed.curves["status"], "notApplicable");
        assert_eq!(zero_speed.curves["notApplicable"]["reasonId"],
            CURVE_NOT_APPLICABLE_NO_FLOW_DIRECTION);
        assert!(zero_speed.curves["points"].is_null());
        assert_eq!(zero_speed.curves["referenceMachAddedForEquivalence"], false);
        assert_eq!(zero_speed.curves["requestedMachs"], json!([0.05]));
        assert_eq!(zero_speed.comparison["status"], "not-applicable");
        assert!(zero_speed.comparison["matchesReferenceSample"].is_null());
        assert_eq!(zero_speed.comparison["reasonId"],
            zero_speed.curves["notApplicable"]["reasonId"]);
        assert_eq!(zero_speed.curves["notApplicable"]["referenceTimeS"].as_f64().unwrap().to_bits(),
            first.stage_time_s.to_bits());
        assert_eq!(zero_speed.curves["notApplicable"]["referenceAirspeedMps"].as_f64().unwrap(),
            0.0);

        let mut canopy = last.clone();
        canopy.flags.drogue_deployed = true;
        canopy.flags.main_deployed = true;
        let canopy_report = curves_report(&prepared, &canopy, &[0.05, 0.2]).expect("canopy report");
        assert_eq!(canopy_report.curves["status"], "notApplicable");
        assert_eq!(canopy_report.curves["notApplicable"]["reasonId"], CURVE_NOT_APPLICABLE_CANOPY_LIVE);
        assert_eq!(canopy_report.curves["notApplicable"]["drogueDeployed"], true);
        assert_eq!(canopy_report.curves["notApplicable"]["mainDeployed"], true);
        assert_eq!(canopy_report.curves["notApplicable"]["referenceMach"].as_f64().unwrap().to_bits(),
            last.mechanics.mach.to_bits());
        assert_eq!(canopy_report.comparison["reasonId"], CURVE_NOT_APPLICABLE_CANOPY_LIVE);

        // Grid validation still refuses at an inapplicable reference state.
        let error = curves_report(&prepared, &canopy, &[0.9]).unwrap_err();
        assert!(error.contains("outside support"), "{error}");
        let error = curves_report(&prepared, &canopy, &[f64::NAN]).unwrap_err();
        assert!(error.contains("finite and nonnegative"), "{error}");
        // ... and the requested grid is validated before the trajectory in the
        // full request path (see validate_curve_machs at the run entry).

        let notes = limitations_with_curves(&prepared.limitations(), &canopy_report.curves);
        assert!(notes.iter().any(|note| note.contains(CURVE_NOT_APPLICABLE_CANOPY_LIVE)),
            "{notes:?}");
        assert_eq!(notes.len(), prepared.limitations().len() + 1);
        let notes = limitations_with_curves(&prepared.limitations(), &computed.curves);
        assert_eq!(notes, prepared.limitations().iter().map(|n| n.to_string()).collect::<Vec<_>>());
    }
}
