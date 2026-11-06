//! Strict opt-in E1b local-state friction boundary. No production load consumer.
use astraea_core::skin_friction as core;
use serde::Deserialize;
use serde_json::{json, Value};
use crate::environment_diagnostic;

pub const SCHEMA_VERSION: &str = "e1b-skin-friction-diagnostic/1.0.0";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema_version: String,
    input_identity: String,
    model_id: String,
    source: Source,
    geometry: Geometry,
    condition_identity: String,
    environment: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Source { identity: String, geometry_identity: String, condition_identity: String, description: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Geometry { identity: String, reference_area_m2: f64, surfaces: Vec<Surface> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Surface { identity: String, length_m: f64, roughness_m: f64, wetted_area_m2: f64, form_factor: f64 }

pub fn evaluate(args: &Value) -> Result<Value, String> {
    let result = (|| {
        let request: Request = serde_json::from_value(args.clone()).map_err(|error| format!("invalid request: {error}"))?;
        if request.schema_version != SCHEMA_VERSION { return Err(format!("unsupported schemaVersion; expected '{SCHEMA_VERSION}'")); }
        if request.model_id != core::MODEL_ID { return Err(format!("unsupported modelId; expected '{}'", core::MODEL_ID)); }
        for (name, value) in [("inputIdentity", &request.input_identity), ("source identity", &request.source.identity), ("source description", &request.source.description), ("geometry identity", &request.geometry.identity), ("conditionIdentity", &request.condition_identity)] {
            if value.trim().is_empty() { return Err(format!("{name} must be nonempty")); }
        }
        if request.source.geometry_identity != request.geometry.identity { return Err("source geometry identity does not match request geometry".into()); }
        if request.source.condition_identity != request.condition_identity { return Err("source condition identity does not match request condition".into()); }
        let environment = environment_diagnostic::evaluate_typed(&request.environment)?;
        let geometry: Vec<_> = request.geometry.surfaces.iter().map(|s| core::SurfaceGeometry { identity: s.identity.clone(), length_m: s.length_m, roughness_m: s.roughness_m, wetted_area_m2: s.wetted_area_m2, form_factor: s.form_factor }).collect();
        let friction = core::evaluate(&environment.evaluation, &geometry, request.geometry.reference_area_m2)?;
        let reason = if friction.zero_speed { Some("zero-airspeed-Cf-and-Cd-undefined; modeled-static-friction-resistance-zero; no-rate-model") } else { None };
        Ok(json!({
            "schemaVersion": SCHEMA_VERSION, "diagnosticId": core::MODEL_ID,
            "inputIdentity": request.input_identity, "input": args,
            "sourceIdentity": request.source.identity, "geometryIdentity": request.geometry.identity,
            "conditionIdentity": request.condition_identity,
            "computationalStatus": if friction.zero_speed { "supported-zero-static-resistance-coefficients-unavailable" } else { "supported" },
            "empiricalQualification": "unqualified",
            "qualificationNote": "Source, geometry, condition identities and form factors are caller declarations; matching labels do not qualify physical geometry, sources or equations.",
            "environment": environment_diagnostic::render(&request.environment, &environment),
            "model": {
                "id": core::MODEL_ID, "sourceIdentity": core::SOURCE_ID,
                "qualification": "inherited-equations-assumed-unqualified",
                "minimumEffectiveReynolds": core::MIN_EFFECTIVE_REYNOLDS,
                "supportPolicy": "Reject effectiveRe<1000 instead of applying inherited numerical floor; positive finite arithmetic and inherited asin domain only, not empirical turbulent/compressible validity.",
                "equations": ["Re_L=(rho*V/mu)*L from E1", "ks=0: effectiveRe=Re_L; ks>0: cap=51*(ks/L)^(-1.039), effectiveRe=min(Re_L,cap)", "Cf0=0.455/log10(effectiveRe)^2.58", "mterm=0.2*Mach^2; mparam=sqrt(mterm/(1+0.89*mterm))", "fc=(asin(mparam)/mparam)^2 when mparam>0.001; fc=1 otherwise; Cf=Cf0/fc", "Cd_i=Cf_i*formFactor_i*Swet_i/Sref", "modeledStaticResistance_i=q*Sref*Cd_i"],
                "assumptionIds": ["fully-turbulent-plate-law-no-transition-or-laminar-model", "inherited-sandgrain-cap-no-roughness-physics-qualification", "inherited-compressibility-correction-adiabatic-wall-recovery-0.89-assumed", "no-wall-temperature-or-heat-transfer-model", "E1-dry-air-Sutherland-closure-assumed", "caller-wetted-area-form-factor-no-shape-inference", "zero-incidence-streamwise-scalar-friction-no-geometry-orientation-finite-angle-or-rate-model"],
                "excludedQuantities": ["pressure-drag", "base-drag", "wave-drag", "protuberance-drag", "total-drag", "total-CA", "force-vector", "moment", "rate-loads"]
            },
            "referenceAreaM2": request.geometry.reference_area_m2,
            "coefficientUnavailableReason": reason,
            "cdFriction": friction.cd_friction,
            "modeledStaticResistanceN": friction.modeled_static_resistance_n,
            "surfaces": friction.surfaces.iter().map(|s| json!({
                "identity": s.geometry.identity, "lengthM": s.geometry.length_m, "roughnessM": s.geometry.roughness_m,
                "wettedAreaM2": s.geometry.wetted_area_m2, "formFactor": s.geometry.form_factor,
                "reynolds": s.reynolds, "roughnessOverLength": s.roughness_over_length,
                "roughnessReynoldsCutoff": s.roughness_reynolds_cutoff, "effectiveReynolds": s.effective_reynolds,
                "cfIncompressible": s.cf_incompressible, "compressibilityFactor": s.compressibility_factor,
                "cf": s.cf, "cdFriction": s.cd_friction, "modeledStaticResistanceN": s.modeled_static_resistance_n,
                "computationalStatus": if friction.zero_speed { "coefficient-unavailable-zero-speed" } else { "supported" },
                "coefficientUnavailableReason": reason
            })).collect::<Vec<_>>()
        }))
    })();
    result.map_err(|message| format!("evaluate_skin_friction_diagnostic: {message}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Value { serde_json::from_str(include_str!("../tests/fixtures/friction-synthetic-request.json")).unwrap() }
    #[test]
    fn preserves_complete_input_contributions_and_unqualified_status() {
        let input = request(); let r = evaluate(&input).unwrap();
        assert_eq!(r["input"], input); assert_eq!(r["environment"]["input"], input["environment"]);
        assert_eq!(r["environment"], environment_diagnostic::evaluate(&input["environment"]).unwrap());
        assert_eq!(r["empiricalQualification"], "unqualified");
        let total: f64 = r["surfaces"].as_array().unwrap().iter().map(|s| s["cdFriction"].as_f64().unwrap()).sum();
        assert_eq!(r["cdFriction"].as_f64().unwrap(), total);
        for class in ["synthetic", "observed", "forecast", "reference"] {
            let mut v = input.clone(); v["environment"]["profile"]["source"]["evidenceClass"] = json!(class);
            assert_eq!(evaluate(&v).unwrap()["empiricalQualification"], "unqualified");
        }
    }
    #[test]
    fn same_mach_different_pressure_changes_cf_and_cd() {
        let mut input = request();
        input["environment"]["profile"]["knots"][1]["temperatureK"] = input["environment"]["profile"]["knots"][0]["temperatureK"].clone();
        input["environment"]["profile"]["knots"][1]["windTowardEnuMps"] = input["environment"]["profile"]["knots"][0]["windTowardEnuMps"].clone();
        input["environment"]["query"]["altitudeM"] = json!(0);
        let a = evaluate(&input).unwrap(); input["environment"]["query"]["altitudeM"] = json!(1000); let b = evaluate(&input).unwrap();
        assert_eq!(a["environment"]["flow"]["mach"], b["environment"]["flow"]["mach"]);
        assert_eq!(a["environment"]["flow"]["airspeedMps"], b["environment"]["flow"]["airspeedMps"]);
        assert!(a["surfaces"][0]["cf"].as_f64().unwrap() < b["surfaces"][0]["cf"].as_f64().unwrap());
        assert!(a["cdFriction"].as_f64().unwrap() < b["cdFriction"].as_f64().unwrap());
    }
    #[test]
    fn zero_speed_returns_null_coefficients_and_explicit_zero_static_resistance() {
        let mut input = request(); let r = evaluate(&input).unwrap();
        input["environment"]["query"]["groundVelocityEnuMps"] = r["environment"]["sample"]["windTowardEnuMps"].clone();
        let zero = evaluate(&input).unwrap(); assert!(zero["cdFriction"].is_null()); assert_eq!(zero["modeledStaticResistanceN"].as_f64(), Some(0.0));
        assert!(zero["coefficientUnavailableReason"].as_str().unwrap().contains("no-rate-model"));
        for s in zero["surfaces"].as_array().unwrap() { assert!(s["cf"].is_null()); assert!(s["cdFriction"].is_null()); assert_eq!(s["modeledStaticResistanceN"].as_f64(), Some(0.0)); }
    }
    #[test]
    fn strict_nested_unknown_and_required_fields_are_rejected() {
        for path in ["", "/source", "/geometry", "/geometry/surfaces/0", "/environment", "/environment/profile", "/environment/profile/knots/0", "/environment/query", "/environment/surfaces/0"] {
            let mut input = request(); input.pointer_mut(path).unwrap().as_object_mut().unwrap().insert("typo".into(), json!(1));
            assert!(evaluate(&input).unwrap_err().contains("unknown field"), "{path}");
        }
        for (path, key) in [("", "modelId"), ("", "conditionIdentity"), ("/source", "geometryIdentity"), ("/geometry", "referenceAreaM2"), ("/geometry/surfaces/0", "wettedAreaM2"), ("/geometry/surfaces/0", "formFactor")] {
            let mut input = request(); input.pointer_mut(path).unwrap().as_object_mut().unwrap().remove(key); assert!(evaluate(&input).is_err());
        }
    }
    #[test]
    fn identity_surface_domain_and_invalid_numeric_inputs_fail() {
        for (path, value) in [("/source/geometryIdentity", json!("other")), ("/source/conditionIdentity", json!("other")), ("/modelId", json!("unknown")), ("/geometry/surfaces/0/lengthM", json!(1)), ("/geometry/surfaces/0/roughnessM", json!(0)), ("/geometry/surfaces/0/identity", json!("unknown")), ("/geometry/surfaces/0/formFactor", json!(0)), ("/geometry/referenceAreaM2", json!(-1)), ("/geometry/surfaces/0/wettedAreaM2", json!("NaN")), ("/environment/query/timeUtcUnixS", json!(0)), ("/environment/query/groundVelocityEnuMps/east", json!(1e308))] {
            let mut input = request(); *input.pointer_mut(path).unwrap() = value; assert!(evaluate(&input).is_err(), "{path}");
        }
        let mut input = request(); input["geometry"]["surfaces"].as_array_mut().unwrap().pop(); assert!(evaluate(&input).is_err());
        let mut input = request(); input["geometry"]["surfaces"][1] = input["geometry"]["surfaces"][0].clone(); assert!(evaluate(&input).is_err());
        // Valid E1 flow with too-small local Re is rejected by this model only.
        let mut input = request(); let r = evaluate(&input).unwrap();
        input["environment"]["query"]["groundVelocityEnuMps"] = r["environment"]["sample"]["windTowardEnuMps"].clone();
        let east = input["environment"]["query"]["groundVelocityEnuMps"]["east"].as_f64().unwrap();
        input["environment"]["query"]["groundVelocityEnuMps"]["east"] = json!(east + 0.001);
        assert!(evaluate(&input).unwrap_err().contains("no floor"));
    }
}
