//! Explicit, static-only diagnostic boundary. Never selected by flight commands.
use crate::models::FrontendVehicle;
use crate::sb1_geometry as adapter;
use astraea_core::aero_coefficients as core;
use astraea_core::aero_profiles::{IntegrationReport, Profile, ProfileError, QuadratureSettings};
use serde::Deserialize;
use serde_json::{json, Value};

pub const SCHEMA_VERSION: &str = "sb1-static-diagnostic/1.0.0";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema_version: String,
    input_identity: String,
    vehicle: Value,
    adapter_options: Options,
    axial: Axial,
    state: State,
    datum_position_from_nose_b_m: Vector,
    cp_policy: CpPolicy,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
struct Vector { x: f64, y: f64, z: f64 }
impl From<Vector> for core::Vec3 {
    fn from(v: Vector) -> Self { Self::new(v.x, v.y, v.z) }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Options {
    source_identity: String,
    declarations: Declarations,
    ogive_interpretation: Ogive,
    transition_interpretation: Transition,
    aft_termination: Aft,
    internal_non_geometry_ids: Vec<String>,
    quadrature: Quadrature,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Declarations {
    provenance: String,
    sharp_physical_tip: bool,
    circular_axisymmetric_body: bool,
    smooth_slender_profile: bool,
    identical_equally_spaced_thin_uncanted_fins: bool,
    no_other_external_features_or_unmodeled_interferences: bool,
    source_represents_complete_external_geometry: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Ogive { NotApplicable, TangentOgive }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Transition { NotApplicable, Conical }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Aft { FlatExposedBaseAtFinalStation }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Quadrature { absolute_tolerance_m3: f64, relative_tolerance: f64, max_panels: usize }
impl Options {
    fn convert(&self) -> adapter::AdapterOptions {
        let d = &self.declarations;
        adapter::AdapterOptions {
            source_identity: self.source_identity.clone(),
            declarations: adapter::SupportDeclarations {
                provenance: d.provenance.clone(), sharp_physical_tip: d.sharp_physical_tip,
                circular_axisymmetric_body: d.circular_axisymmetric_body,
                smooth_slender_profile: d.smooth_slender_profile,
                identical_equally_spaced_thin_uncanted_fins: d.identical_equally_spaced_thin_uncanted_fins,
                no_other_external_features_or_unmodeled_interferences: d.no_other_external_features_or_unmodeled_interferences,
                source_represents_complete_external_geometry: d.source_represents_complete_external_geometry,
            },
            ogive_interpretation: match self.ogive_interpretation { Ogive::NotApplicable => None, Ogive::TangentOgive => Some(adapter::OgiveInterpretation::TangentOgive) },
            transition_interpretation: match self.transition_interpretation { Transition::NotApplicable => None, Transition::Conical => Some(adapter::TransitionInterpretation::Conical) },
            aft_termination: match self.aft_termination { Aft::FlatExposedBaseAtFinalStation => adapter::AftTermination::FlatExposedBaseAtFinalStation },
            internal_non_geometry_ids: self.internal_non_geometry_ids.clone(),
            quadrature: QuadratureSettings { absolute_tolerance_m3: self.quadrature.absolute_tolerance_m3,
                relative_tolerance: self.quadrature.relative_tolerance, max_panels: self.quadrature.max_panels },
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Axial { ca0: f64, provider_id: String, input_identity: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct State {
    relative_velocity_at_cg_b_mps: Vector,
    omega_b_radps: Vector,
    mach: f64,
    density_kg_m3: f64,
    cg_position_from_nose_b_m: Vector,
    environment_identity: String,
    power_nozzle_condition: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CpPolicy { policy_id: String, denominator_uncertainty: Uncertainty }
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
enum Uncertainty {
    NotSupplied,
    Interval { lower: f64, upper: f64, #[serde(rename = "evidenceIdentity")] evidence_identity: String },
}

// Keep this allowlist aligned with the existing DTO. Validation precedes that
// permissive DTO's deserialization, so raw geometry keys cannot disappear.
const COMPONENT_KEYS: &[&str] = &[
    "id", "name", "type", "materialId", "shape", "length", "baseDiameter", "wallThickness", "isHollow",
    "outerDiameter", "innerDiameter", "isMotorMount", "foreDiameter", "aftDiameter", "finCount", "rootChord",
    "tipChord", "span", "sweepLength", "points", "thickness", "crossSection", "axialOffset", "mass", "diameter",
    "cd", "massOverride", "cgOverride", "railGuideDiameter", "railGuideHeight", "launchLugDiameter",
    "launchShoeArea", "airfoilSection", "leadingEdgeBevel", "trailingEdgeBevel", "leadingEdgeRadius",
];
fn keys(value: &Value, allowed: &[&str], path: &str) -> Result<(), String> {
    let object = value.as_object().ok_or_else(|| format!("{path}: expected object"))?;
    for key in object.keys() {
        if !allowed.contains(&key.as_str()) { return Err(format!("{path}: unknown field '{key}'")); }
    }
    Ok(())
}
fn vehicle(raw: &Value) -> Result<FrontendVehicle, String> {
    keys(raw, &["components", "surfaceFinish", "forceTurbulentFlow", "nozzleExitDiameter"], "vehicle")?;
    let components = raw["components"].as_array().ok_or("vehicle.components: expected array")?;
    for (i, c) in components.iter().enumerate() {
        keys(c, COMPONENT_KEYS, &format!("vehicle.components[{i}]"))?;
        if let Some(points) = c.get("points").filter(|v| !v.is_null()) {
            let points = points.as_array().ok_or("component.points: expected array")?;
            for p in points { keys(p, &["x", "y"], "component.points[]")?; }
        }
    }
    serde_json::from_value(raw.clone()).map_err(|e| format!("vehicle: {e}"))
}
fn nonempty(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() { Err(format!("{label}: explicit nonempty identity/condition required")) } else { Ok(()) }
}
fn vector(v: core::Vec3) -> Value { json!({"x":v.x,"y":v.y,"z":v.z}) }
fn wrench(w: core::CoefficientWrench) -> Value { json!({"cfB":vector(w.cf_b),"cmB":vector(w.cm_b)}) }
fn integration(r: IntegrationReport) -> Value {
    json!({"method":format!("{:?}",r.method),"integralAreaM3":r.integral_area_m3,
        "estimatedErrorM3":r.estimated_error_m3,"roundoffIndicatorM3":r.roundoff_indicator_m3,
        "requestedToleranceM3":r.requested_tolerance_m3,"panels":r.panels,"evaluations":r.evaluations,"converged":r.converged})
}
fn profile(p: Profile) -> Value {
    let (length, fore, aft) = p.dimensions();
    let kind = match p { Profile::Cone {..} => "cone", Profile::Cylinder {..} => "cylinder",
        Profile::ConicalFrustum {..} => "conicalFrustum", Profile::TangentOgive {..} => "tangentOgive" };
    json!({"kind":kind,"lengthM":length,"foreRadiusM":fore,"aftRadiusM":aft})
}
fn fin(f: core::TrapezoidFinSet) -> Value {
    json!({"count":f.count,"exposedSemispanM":f.exposed_semispan_m,"localBodyRadiusM":f.local_body_radius_m,
        "rootChordM":f.root_chord_m,"tipChordM":f.tip_chord_m,"tipLeSweepM":f.tip_le_sweep_m,"rootLeStationM":f.root_le_station_m})
}
fn sums(s: core::NormalSums) -> Value {
    json!({"cPerRad":s.c_per_rad,"jMPerRad":s.j_m_per_rad,"sumAbsCPerRad":s.sum_abs_c_per_rad,"sumAbsJMPerRad":s.sum_abs_j_m_per_rad})
}
fn core_error(e: core::Error) -> String {
    match e { core::Error::InvalidInput(s) => format!("invalid_input: {s}"), core::Error::UnsupportedDomain(s) => format!("unsupported_model_domain: {s}") }
}

/// One normalized request, explicitly prescribed CA0, no legacy provider calls.
/// The exact parsed input JSON is retained (not its original textual formatting).
pub fn evaluate(raw: &Value) -> Result<Value, String> {
    let r: Request = serde_json::from_value(raw.clone()).map_err(|e| format!("evaluate_sb1_diagnostic: {e}"))?;
    if r.schema_version != SCHEMA_VERSION { return Err("unsupported diagnostic schemaVersion".into()); }
    nonempty(&r.input_identity, "inputIdentity")?;
    nonempty(&r.axial.provider_id, "axial.providerId")?;
    nonempty(&r.axial.input_identity, "axial.inputIdentity")?;
    nonempty(&r.state.environment_identity, "state.environmentIdentity")?;
    nonempty(&r.state.power_nozzle_condition, "state.powerNozzleCondition")?;
    if r.cp_policy.policy_id != core::CP_CANCELLATION_POLICY_ID { return Err("unsupported explicit CP policyId".into()); }
    let uncertainty = match &r.cp_policy.denominator_uncertainty {
        Uncertainty::NotSupplied => None,
        Uncertainty::Interval { lower, upper, evidence_identity } => {
            nonempty(evidence_identity, "cpPolicy.denominatorUncertainty.evidenceIdentity")?;
            Some((*lower, *upper))
        },
    };
    let v = vehicle(&r.vehicle)?;
    let a = adapter::adapt_frontend_vehicle(&v, &r.adapter_options.convert()).map_err(|e| {
        let detail = match e.profile_error {
            Some(ProfileError::NonConverged(report)) => json!({"nonConvergedIntegration":integration(report)}),
            Some(ProfileError::Invalid(reason)) => json!({"profileError":reason}),
            None => Value::Null,
        };
        format!("unsupported_geometry_or_invalid_adapter_input: {}; componentIndex={:?}; componentId={:?}; detail={detail}", e.reason,e.component_index,e.component_id)
    })?;
    let refs = a.references;
    let datum = core::Datum(r.datum_position_from_nose_b_m.into());
    let result = core::evaluate_static(&a.geometry, refs, datum,
        &core::PrescribedAxial { ca0:r.axial.ca0, provider_id:r.axial.provider_id, input_identity:r.axial.input_identity },
        core::StaticInput { relative_velocity_at_cg_b_mps:r.state.relative_velocity_at_cg_b_mps.into(),
            omega_b_radps:r.state.omega_b_radps.into(),mach:r.state.mach,density_kg_m3:r.state.density_kg_m3,
            cg_position_from_nose_b_m:r.state.cg_position_from_nose_b_m.into() }).map_err(core_error)?;
    let cp = result.normal_derivatives_at_zero_incidence.derivative_cp(uncertainty).map_err(core_error)?;
    let components: Vec<_> = a.report.components.iter().map(|c| {
        let role = match c.role {
            adapter::ComponentRole::Body { profile:p, integration:i, interval_index } => {
                let interval = a.geometry.body[interval_index];
                let contribution = interval.contribution(refs).expect("adapter validated body contribution");
                json!({"kind":"body","profile":profile(p),"integration":integration(i),"intervalIndex":interval_index,
                    "interval":{"x0M":interval.x0_m,"x1M":interval.x1_m,"area0M2":interval.area0_m2,
                        "area1M2":interval.area1_m2,"integralAreaM3":interval.integral_area_m3},
                    "contribution":{"cPerRad":contribution.c_per_rad,"jMPerRad":contribution.j_m_per_rad}})
            },
            adapter::ComponentRole::Fins { ref host_component_id,host_start_m,host_end_m,geometry } => {
                let contribution = geometry.contribution(r.state.mach, refs).expect("evaluation validated fin contribution");
                json!({"kind":"fins","hostComponentId":host_component_id,"hostStartM":host_start_m,
                    "hostEndM":host_end_m,"geometry":fin(geometry),
                    "contribution":{"cPerRad":contribution.c_per_rad,"jMPerRad":contribution.j_m_per_rad}})
            },
            adapter::ComponentRole::DeclaredInternalNonGeometry => json!({"kind":"declaredInternalNonGeometry"}),
        };
        json!({"sourceIndex":c.source_index,"source":raw["vehicle"]["components"][c.source_index],"role":role})
    }).collect();
    let coefficients_cg = result.static_coefficients_at_datum.map(|w| w.translated(datum, core::Datum(r.state.cg_position_from_nose_b_m.into()), refs)).transpose().map_err(core_error)?;
    let wind_basis = result.flow_angles.map(|f| core::WindBasis::from_angles(f.alpha_rad,f.beta_rad)).transpose().map_err(core_error)?;
    let speed = core::Vec3::from(r.state.relative_velocity_at_cg_b_mps).norm();
    Ok(json!({
        "schemaVersion":SCHEMA_VERSION,"input":raw,
        "provenance":{"providerId":result.provider_id,"adapterId":a.report.adapter_id,
            "geometryIdentity":result.geometry_identity,"identityKind":"caller-supplied; not a cryptographic geometry hash",
            "sourceEquationIds":core::SOURCE_EQUATIONS,"integralProvenance":a.geometry.integral_provenance,
            "axialProviderId":result.axial_provider_id,"axialInputIdentity":result.axial_input_identity,
            "rateProviderId":null,"empiricalEvidenceIds":[],"interpolationPolicy":"none; prescribed scalar CA0"},
        "conventions":{"axes":"right-handed body B: +Y noseward, +X pitch axis, X cross Y = Z",
            "positionDatum":"body position relative to nose; centerline station x aft maps to (0,-x,0)",
            "angles":"alpha=atan2(v.z,v.y); beta=atan2(v.x,hypot(v.y,v.z)); radians",
            "rateOrder":"omega_B=(q_pitch,p_roll,r_yaw), rad/s; omegaHat=omega_B*L/(2V)",
            "velocityReference":"air-relative velocity at instantaneous CG, body B",
            "forceSigns":"CA=-CF.y; CN_pitch=-CF.z; CN_yaw=-CF.x",
            "windSigns":"CF_W=(CY,-CD,-CL); R_BW columns below",
            "units":"SI: m, m2, m3, m/s, kg/m3, Pa, N, N*m; coefficients dimensionless; C 1/rad, J m/rad"},
        "references":{"areaM2":refs.area_m2,"lengthM":refs.length_m,"diameterM":refs.diameter_m,
            "datumPositionFromNoseBM":vector(datum.0),"cgPositionFromNoseBM":vector(r.state.cg_position_from_nose_b_m.into())},
        "supportReport":{"adapterId":a.report.adapter_id,"sourceIdentity":a.report.source_identity,
            "options":raw["adapterOptions"],"components":components,"limits":a.report.limits,
            "rawInputPolicy":"unknown vehicle/component/point keys rejected before existing typed DTO; exact parsed input retained; physical completeness remains caller assertion",
            "candidateDomain":{"machMinInclusive":0.0,"machMaxExclusive":0.8,"incidenceMaxRadInclusive":core::MAX_INCIDENCE_RAD,
                "flow":"forward for V>0; V=0 static loads only","geometry":"sharp smooth slender axisymmetric circular body; one 3/4 equally spaced thin uncanted trapezoidal fin set"}},
        "computationalStatus":match result.status { core::ComputationalStatus::CandidateStaticEvaluation => "candidateStaticEvaluation", core::ComputationalStatus::ZeroSpeedStaticLoadsOnly => "zeroSpeedStaticLoadsOnly" },
        "empiricalQualificationByQuantity":{"staticForce":"unqualified","staticMoment":"unqualified","derivativeCp":"unqualified","axial":"unqualified prescribed input","rateForce":"unknown","rateMoment":"unknown"},
        "rateSupport":"notModeledStaticOnly",
        "flow":{"speedMps":speed,"dynamicPressurePa":0.5*r.state.density_kg_m3*speed*speed,
            "angles":result.flow_angles.map(|f| json!({"alphaRad":f.alpha_rad,"betaRad":f.beta_rad,"incidenceRad":f.incidence_rad})),
            "windBasisBW":wind_basis.map(|b|json!({"x":vector(b.x),"y":vector(b.y),"z":vector(b.z)})),
            "reducedRatesB":result.reduced_rates_b.map(vector),
            "unavailableReason":if speed==0.0 { Some("zero speed: flow angles, wind basis, reduced rates and flow coefficients undefined") } else { None }},
        "staticCoefficientsAtDatum":result.static_coefficients_at_datum.map(wrench),
        "staticCoefficientsAtCg":coefficients_cg.map(wrench),
        "windCoefficients":result.wind_coefficients.map(|w|json!({"cyWind":w.side,"cdWind":w.drag,"clWind":w.lift})),
        "staticLoadsAtCg":{"forceBN":vector(result.static_loads_at_cg.force_b_n),"momentBNm":vector(result.static_loads_at_cg.moment_b_nm)},
        "rateCoefficientsAtDatum":null,"rateLoadsAtCg":null,"totalDynamicLoadsAtCg":null,
        "rateUnavailableReason":"SB1 evaluates static contributions only, including for nonzero supplied rates; no total dynamic prediction",
        "normalDerivativesAtZeroIncidence":sums(result.normal_derivatives_at_zero_incidence),
        "cp":{"definition":"derivative centerline CP at symmetric zero incidence: J/C, station meters aft of nose; static only",
            "stationFromNoseM":cp.station_from_nose_m,"kappaC":cp.kappa_c,"sums":sums(cp.sums),
            "unavailableReason":cp.reason.map(|r|match r {core::CpUnavailable::ZeroDenominator=>"zeroDenominator",core::CpUnavailable::UncertaintyContainsZero=>"uncertaintyContainsZero",core::CpUnavailable::NumericallyIllConditioned=>"numericallyIllConditioned",core::CpUnavailable::NonfiniteRatio=>"nonfiniteRatio"}),
            "policyId":core::CP_CANCELLATION_POLICY_ID,"relativeCancellationBound":core::CP_CANCELLATION_RELATIVE_BOUND,
            "denominatorUncertainty":raw["cpPolicy"]["denominatorUncertainty"],"accuracy":"unqualified; conditioning is not physical uncertainty"}
    }))
}
