//! Strict E1 profile candidate envelope, dispatched by the single
//! `simulate_candidate` command on native and wasm32.
//!
//! The envelope schema id keeps its historical "native" wording because the
//! string is inside the hashed content-identity preimage; it no longer describes
//! the build target. The E1 profile parse contract (`parse_profile_with_input`)
//! is shared by both targets, so the same typed evaluation runs in the app's
//! WebAssembly worker.
use crate::{environment_diagnostic, native_candidate};
use astraea_core::flight_provider::CandidateProfileObservation;
use astraea_core::flight_provider::CandidateProfileEnvironment;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const SCHEMA_ID: &str = "native-E1-profile-candidate-request/1.0.0";
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Request {
    schema_id: String,
    candidate: native_candidate::NativeCandidateRequest,
    environment_selection: Selection,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Selection {
    launch_time_utc_unix_s: i64,
    launch_altitude_geometric_msl_m: f64,
    vertical_datum_identity: String,
    profile: Value,
}

pub(crate) fn observation_json(o: &CandidateProfileObservation) -> Value {
    let f=&o.evaluation; let s=f.sample;
    json!({
        "environmentModelId":o.environment_model_id,"timePolicyId":o.time_policy_id,
        "profileSourceIdentity":o.profile_source_identity,"verticalDatumIdentity":o.vertical_datum_identity,
        "altitudeGeometricMslM":o.altitude_geometric_msl_m,"launchTimeUtcUnixS":o.launch_time_utc_unix_s,
        "elapsedS":o.elapsed_s,"sampledFloorEpochS":o.sampled_floor_epoch_s,"fractionalSecond":o.fractional_second,
        "pressurePa":s.pressure_pa,"temperatureK":s.temperature_k,"densityKgM3":s.density_kg_m3,
        "soundSpeedMps":s.sound_speed_mps,"dynamicViscosityPaS":s.dynamic_viscosity_pa_s,
        "windTowardEnuMps":[s.wind_toward_enu_mps.east,s.wind_toward_enu_mps.north,s.wind_toward_enu_mps.up],
        "airRelativeVelocityEnuMps":[f.air_relative_velocity_enu_mps.east,f.air_relative_velocity_enu_mps.north,f.air_relative_velocity_enu_mps.up],
        "airspeedMps":f.airspeed_mps,"mach":f.mach,"dynamicPressurePa":f.dynamic_pressure_pa,"reynoldsPerM":f.reynolds_per_m,
    })
}

pub fn evaluate(value:&Value) -> Result<Value,String> {
    evaluate_with_sidecar(value).map(|(report, _sidecar)| report)
}
pub fn evaluate_with_sidecar(value:&Value) -> Result<(Value,Value),String> {
    native_candidate::refuse_null_controls(value)?;
    let mut r:Request=serde_json::from_value(value.clone()).map_err(|e|format!("invalid profile candidate request: {e}"))?;
    if r.schema_id!=SCHEMA_ID { return Err(format!("expected schemaId {SCHEMA_ID}")); }
    if r.candidate.environment.wind_speed_surface_mps!=0.0 { return Err("profile selection conflicts with retained surface wind; no combined wind model".into()); }
    let selection=&mut r.environment_selection;
    if r.candidate.environment.launch_altitude_asl_m!=selection.launch_altitude_geometric_msl_m {
        return Err("candidate launch altitude must match explicit launch geometric-MSL declaration".into());
    }
    let (profile, normalized_profile)=environment_diagnostic::parse_profile_with_input(&selection.profile)?;
    selection.profile = normalized_profile;
    let environment=CandidateProfileEnvironment::new(profile,selection.launch_time_utc_unix_s,
        selection.launch_altitude_geometric_msl_m,selection.vertical_datum_identity.clone()).map_err(|e|e.to_string())?;
    let effective_inputs=crate::candidate_identity::normalized(&r)?;
    let (mut report,sidecar)=native_candidate::run_request_with_profile(&r.candidate,Some(environment))?;
    report["effectiveInputs"]=value.clone();
    // The outer envelope never overwrites the selected numerical policy: the
    // identity binds the inner candidate request's actual controls.
    crate::candidate_identity::attach(&mut report,effective_inputs,&native_candidate::numerical_policy_descriptor(&r.candidate));
    Ok((report,sidecar))
}
/// Dispatch entry for the explicit profile envelope. The runtime command offers
/// no experiment-only control in any shape, and a malformed envelope never
/// degrades to the untagged runtime request.
pub fn evaluate_dispatch(args:&Value) -> Result<Value,String> {
    let request=args.get("request")
        .ok_or_else(||"simulate_candidate: missing argument 'request'".to_string())?;
    native_candidate::refuse_null_controls(request)?;
    if [request.get("diagnosticNumerics"),
        request.get("candidate").and_then(|candidate|candidate.get("diagnosticNumerics"))]
        .iter().any(|found|found.is_some()) {
        return Err("simulate_candidate: diagnosticNumerics is an experiment-only control and is not offered by this runtime command".into());
    }
    if [request.get("sampleRetention"),
        request.get("candidate").and_then(|candidate|candidate.get("sampleRetention"))]
        .iter().any(|found|found.is_some()) {
        return Err("simulate_candidate: sampleRetention is a native research capture control and is not offered by this runtime command".into());
    }
    evaluate_with_sidecar(request).map(|(report,_sidecar)|report)
}

pub fn run_request_json(input:&str) -> Result<String,String> {
    run_request_json_with_sidecar(input).map(|(report, _sidecar)| report)
}
pub fn run_request_json_with_sidecar(input:&str) -> Result<(String,String),String> {
    let value:Value=serde_json::from_str(input).map_err(|e|format!("invalid profile candidate JSON: {e}"))?;
    let (report,sidecar)=evaluate_with_sidecar(&value)?;
    Ok((report.to_string(),sidecar.to_string()))
}
