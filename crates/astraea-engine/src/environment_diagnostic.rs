//! Strict JSON boundary for the opt-in E1a environment diagnostic.
//! Registration is owned by integration; production flight commands do not use it.
use astraea_core::environment as core;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const SCHEMA_VERSION: &str = "e1a-environment-diagnostic/1.0.0";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema_version: String,
    input_identity: String,
    profile: Profile,
    query: Query,
    surfaces: Vec<Surface>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Profile {
    source: Source,
    location: Location,
    altitude_datum: AltitudeDatum,
    vertical_datum_identity: String,
    issue_time_utc_unix_s: i64,
    validity: Validity,
    units: Units,
    interpolation_policy: InterpolationPolicy,
    extrapolation_policy: ExtrapolationPolicy,
    closure_id: String,
    knots: Vec<Knot>,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Source { identity: String, evidence_class: EvidenceClass, description: String }
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum EvidenceClass { Synthetic, Observed, Forecast, Reference }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Location { identity: String, latitude_deg: f64, longitude_deg: f64, horizontal_datum_identity: String }
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum AltitudeDatum { GeometricMsl }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Validity { from_utc_unix_s: i64, until_utc_unix_s: i64 }
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Units { altitude: Meters, pressure: Pascal, temperature: Kelvin, wind: MetersPerSecond, time: UtcUnixSeconds }
#[derive(Deserialize, Serialize)]
enum Meters { #[serde(rename = "m")] M }
#[derive(Deserialize, Serialize)]
enum Pascal { Pa }
#[derive(Deserialize, Serialize)]
enum Kelvin { K }
#[derive(Deserialize, Serialize)]
enum MetersPerSecond { #[serde(rename = "m/s")] Mps }
#[derive(Deserialize, Serialize)]
enum UtcUnixSeconds { #[serde(rename = "UTC Unix seconds")] Seconds }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum InterpolationPolicy { LogPressureLinearTemperatureWind }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum ExtrapolationPolicy { Reject }
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Knot { altitude_m: f64, pressure_pa: f64, temperature_k: f64, wind_toward_enu_mps: Enu }
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Enu { east: f64, north: f64, up: f64 }
impl From<Enu> for core::Enu {
    fn from(value: Enu) -> Self { Self::new(value.east, value.north, value.up) }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Query { altitude_m: f64, altitude_datum: AltitudeDatum, time_utc_unix_s: i64, ground_velocity_enu_mps: Enu }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Surface { identity: String, length_m: f64, roughness_m: f64 }

impl Profile {
    fn convert(&self) -> Result<core::EnvironmentProfile, String> {
        if self.closure_id != core::CLOSURE_ID { return Err(format!("unsupported closureId '{}'; expected '{}'", self.closure_id, core::CLOSURE_ID)); }
        // Deserialization validates these explicit, single-supported policies.
        let _ = (&self.units.altitude, &self.units.pressure, &self.units.temperature, &self.units.wind, &self.units.time,
            &self.altitude_datum, &self.interpolation_policy, &self.extrapolation_policy);
        let metadata = core::Metadata {
            source_identity: self.source.identity.clone(),
            evidence_class: match self.source.evidence_class {
                EvidenceClass::Synthetic => core::EvidenceClass::Synthetic, EvidenceClass::Observed => core::EvidenceClass::Observed,
                EvidenceClass::Forecast => core::EvidenceClass::Forecast, EvidenceClass::Reference => core::EvidenceClass::Reference,
            },
            source_description: self.source.description.clone(), location_identity: self.location.identity.clone(),
            latitude_deg: self.location.latitude_deg, longitude_deg: self.location.longitude_deg,
            horizontal_datum_identity: self.location.horizontal_datum_identity.clone(),
            altitude_datum: core::AltitudeDatum::GeometricMsl, vertical_datum_identity: self.vertical_datum_identity.clone(),
            issue_time_utc_unix_s: self.issue_time_utc_unix_s,
            valid_from_utc_unix_s: self.validity.from_utc_unix_s, valid_until_utc_unix_s: self.validity.until_utc_unix_s,
            units: core::Units::SiMetersPascalKelvinMetersPerSecondUtcUnixSeconds,
            interpolation_policy: core::InterpolationPolicy::LogPressureLinearTemperatureWind,
            extrapolation_policy: core::ExtrapolationPolicy::Reject,
        };
        let knots = self.knots.iter().map(|k| core::Knot { altitude_m: k.altitude_m, pressure_pa: k.pressure_pa, temperature_k: k.temperature_k, wind_toward_enu_mps: k.wind_toward_enu_mps.into() }).collect();
        core::EnvironmentProfile::new(metadata, knots).map_err(|error| error.to_string())
    }
}
/// Return the same strict typed profile and its normalized input capture.
pub(crate) fn parse_profile_with_input(value: &Value) -> Result<(core::EnvironmentProfile, Value), String> {
    let profile: Profile = serde_json::from_value(value.clone()).map_err(|e| format!("invalid E1 profile: {e}"))?;
    let converted = profile.convert()?;
    let normalized = serde_json::to_value(&profile).map_err(|e| format!("invalid E1 profile serialization: {e}"))?;
    Ok((converted, normalized))
}
fn enu(value: core::Enu) -> Value { json!({ "east": value.east, "north": value.north, "up": value.up }) }

/// Shared typed evaluation: all consumers use this strict parser and actual profile.
pub(crate) struct TypedEvaluation {
    pub input_identity: String,
    pub environment_identity: String,
    pub evaluation: core::Evaluation,
}
pub(crate) fn evaluate_typed(args: &Value) -> Result<TypedEvaluation, String> {
    let request: Request = serde_json::from_value(args.clone()).map_err(|error| format!("invalid request: {error}"))?;
    if request.schema_version != SCHEMA_VERSION { return Err(format!("unsupported schemaVersion '{}'; expected '{SCHEMA_VERSION}'", request.schema_version)); }
    if request.input_identity.trim().is_empty() { return Err("inputIdentity must be nonempty".into()); }
    let profile = request.profile.convert()?;
    let _ = request.query.altitude_datum;
    let query = core::Query { altitude_m: request.query.altitude_m, altitude_datum: core::AltitudeDatum::GeometricMsl, time_utc_unix_s: request.query.time_utc_unix_s };
    let surfaces: Vec<_> = request.surfaces.iter().map(|surface| core::SurfaceInput { identity: surface.identity.clone(), length_m: surface.length_m, roughness_m: surface.roughness_m }).collect();
    let evaluation = profile.evaluate(query, request.query.ground_velocity_enu_mps.into(), &surfaces).map_err(|error| error.to_string())?;
    Ok(TypedEvaluation { input_identity: request.input_identity, environment_identity: profile.metadata().source_identity.clone(), evaluation })
}

/// Render the already evaluated profile without decoding any JSON result.
pub(crate) fn render(args: &Value, typed: &TypedEvaluation) -> Value {
    let result = &typed.evaluation;
    let sample = result.sample;
    json!({
        "schemaVersion": SCHEMA_VERSION,
        "diagnosticId": "explicit-tabulated-environment/1.0.0",
        "computationalStatus": "supported",
        "empiricalQualification": "unqualified",
        "qualificationNote": "Caller evidence class and validity metadata are declarations; source quality, launch applicability and closure accuracy are not assessed.",
        "inputIdentity": typed.input_identity,
        "environmentIdentity": typed.environment_identity,
        "input": args,
        "closure": {
            "id": core::CLOSURE_ID,
            "qualification": "assumed-unqualified",
            "gasConstantJPerKgK": core::GAS_CONSTANT_J_KG_K,
            "heatCapacityRatio": core::HEAT_CAPACITY_RATIO,
            "sutherlandCoefficient": core::SUTHERLAND_COEFFICIENT,
            "sutherlandTemperatureK": core::SUTHERLAND_TEMPERATURE_K,
            "thermodynamicSourceIdentity": core::THERMODYNAMIC_SOURCE_ID,
            "viscositySourceIdentity": core::VISCOSITY_SOURCE_ID,
            "equations": ["rho=P/(R*T)", "a=sqrt(gamma*R*T)", "mu=1.458e-6*T^1.5/(T+110.4)"]
        },
        "assumptionIds": ["independently-supplied-pressure-temperature-no-hydrostatic-consistency-claim", "wind-toward-ENU", "geometric-MSL-altitude-no-datum-conversion", "single-location-time-constant-within-declared-validity", "dry-ideal-air-constant-R-gamma", "Sutherland-viscosity-positive-temperature-computational-domain-only"],
        "sample": {
            "pressurePa": sample.pressure_pa, "temperatureK": sample.temperature_k,
            "windTowardEnuMps": enu(sample.wind_toward_enu_mps), "densityKgM3": sample.density_kg_m3,
            "soundSpeedMps": sample.sound_speed_mps, "dynamicViscosityPaS": sample.dynamic_viscosity_pa_s
        },
        "flow": {
            "airRelativeVelocityEnuMps": enu(result.air_relative_velocity_enu_mps), "airspeedMps": result.airspeed_mps,
            "mach": result.mach, "dynamicPressurePa": result.dynamic_pressure_pa, "reynoldsPerM": result.reynolds_per_m
        },
        "surfaces": result.surfaces.iter().map(|surface| json!({
            "identity": surface.input.identity, "lengthM": surface.input.length_m, "roughnessM": surface.input.roughness_m,
            "reynolds": surface.reynolds, "roughnessOverLength": surface.roughness_over_length
        })).collect::<Vec<_>>()
    })
}

/// Full strict request is preserved as parsed JSON; caller identity is not a hash.
pub fn evaluate(args: &Value) -> Result<Value, String> {
    evaluate_typed(args).map(|typed| render(args, &typed))
        .map_err(|message| format!("evaluate_environment_diagnostic: {message}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Value {
        serde_json::from_str(include_str!("../tests/fixtures/environment-synthetic-request.json")).unwrap()
    }
    #[test]
    fn shared_typed_renderer_preserves_pre_refactor_wire_response() {
        // Golden output retained from integrated 1e4779a actual dispatch.
        let expected: Value = serde_json::from_str(include_str!("../tests/fixtures/environment-synthetic-response.json")).unwrap();
        assert_eq!(evaluate(&request()).unwrap(), expected);
    }
    #[test]
    fn full_input_preserved_and_no_empirical_promotion() {
        let input = request(); let result = evaluate(&input).unwrap();
        assert_eq!(result["input"], input);
        assert_eq!(result["environmentIdentity"], input["profile"]["source"]["identity"]);
        assert_eq!(result["computationalStatus"], "supported");
        assert_eq!(result["empiricalQualification"], "unqualified");
        for evidence in ["synthetic", "observed", "forecast", "reference"] {
            let mut input = request(); input["profile"]["source"]["evidenceClass"] = json!(evidence);
            let result = evaluate(&input).unwrap();
            assert_eq!(result["input"]["profile"]["source"]["evidenceClass"], evidence);
            assert_eq!(result["empiricalQualification"], "unqualified");
        }
    }
    #[test]
    fn nested_unknown_fields_and_missing_required_metadata_are_rejected() {
        for path in ["", "/profile", "/profile/source", "/profile/location", "/profile/validity", "/profile/units", "/profile/knots/0", "/profile/knots/0/windTowardEnuMps", "/query", "/query/groundVelocityEnuMps", "/surfaces/0"] {
            let mut input = request(); input.pointer_mut(path).unwrap().as_object_mut().unwrap().insert("typo".into(), json!(1));
            assert!(evaluate(&input).unwrap_err().contains("unknown field"), "path {path}");
        }
        for (path, field) in [("/profile", "source"), ("/profile", "units"), ("/profile", "validity"), ("/profile", "issueTimeUtcUnixS"), ("/profile/location", "horizontalDatumIdentity"), ("/profile", "verticalDatumIdentity"), ("/query", "timeUtcUnixS")] {
            let mut input = request(); input.pointer_mut(path).unwrap().as_object_mut().unwrap().remove(field);
            assert!(evaluate(&input).is_err(), "missing {field}");
        }
    }
    #[test]
    fn unsupported_policies_and_invalid_query_are_errors() {
        for (path, value) in [("/profile/altitudeDatum", json!("geopotentialMsl")), ("/profile/extrapolationPolicy", json!("clamp")), ("/profile/interpolationPolicy", json!("linear")), ("/profile/units/temperature", json!("C")), ("/profile/closureId", json!("wetAir")), ("/query/altitudeM", json!(-1)), ("/query/timeUtcUnixS", json!(0))] {
            let mut input = request(); *input.pointer_mut(path).unwrap() = value;
            assert!(evaluate(&input).is_err(), "path {path}");
        }
    }
    #[test]
    fn isothermal_same_speed_and_mach_different_pressure_changes_reynolds() {
        let mut input = request();
        input["profile"]["knots"][1]["temperatureK"] = input["profile"]["knots"][0]["temperatureK"].clone();
        input["profile"]["knots"][1]["windTowardEnuMps"] = input["profile"]["knots"][0]["windTowardEnuMps"].clone();
        input["query"]["altitudeM"] = json!(0);
        let a = evaluate(&input).unwrap();
        input["query"]["altitudeM"] = json!(1000);
        let b = evaluate(&input).unwrap();
        assert_eq!(a["flow"]["airspeedMps"], b["flow"]["airspeedMps"]);
        assert_eq!(a["flow"]["mach"], b["flow"]["mach"]);
        let re_a = a["flow"]["reynoldsPerM"].as_f64().unwrap();
        let re_b = b["flow"]["reynoldsPerM"].as_f64().unwrap();
        assert!((re_a / re_b - 4.0).abs() < 1e-12);
    }
    #[test]
    fn zero_speed_and_overflow_return_numbers_or_errors_never_nulls() {
        let mut input = request();
        let result = evaluate(&input).unwrap();
        input["query"]["groundVelocityEnuMps"] = result["sample"]["windTowardEnuMps"].clone();
        let zero = evaluate(&input).unwrap();
        for key in ["airspeedMps", "mach", "dynamicPressurePa", "reynoldsPerM"] { assert_eq!(zero["flow"][key].as_f64(), Some(0.0)); }
        input["query"]["groundVelocityEnuMps"]["east"] = json!(1e308);
        assert!(evaluate(&input).is_err());
    }
}
