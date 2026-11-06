//! Native A1d-2 boundary checks: the actual engine DTO drives the SB1 adapter,
//! an explicit mechanical carrier and the bounded candidate trajectory; the
//! same prepared object produces the direct query and static curves; the
//! candidate is not reachable from app dispatch or the legacy path.
//!
//! Fixture: tests/fixtures/native-candidate-request.json. Synthetic geometry,
//! declared (not measured) mass/recovery, prescribed CA0 and a synthetic
//! 22-point Estes-C6-like thrust curve. It is NOT the certified 25-point C6
//! record (that record lives in the RMP09 provenance evidence and totals
//! 8.8172 N*s against a declared 8.8 N*s); nothing here is a flight claim.
//! No holdout/scoring dataset and no as-flown claim.

use astraea_engine::models;
use astraea_engine::native_candidate::{run_request_json, run_request_json_with_sidecar};
use astraea_engine::dispatch;
use serde_json::{json, Value};

fn fixture() -> String {
    std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/native-candidate-request.json"))
        .expect("native candidate fixture")
}

fn run(request: &str) -> Value {
    let text = run_request_json(request).expect("native candidate report");
    let value: Value = serde_json::from_str(&text).expect("report JSON");
    assert!(value.get("error").is_none(), "unexpected error envelope: {value}");
    value
}

fn with(mutator: impl FnOnce(&mut Value)) -> String {
    let mut value: Value = serde_json::from_str(&fixture()).unwrap();
    mutator(&mut value);
    serde_json::to_string(&value).unwrap()
}

fn args_with(mutator: impl FnOnce(&mut Value)) -> Value {
    json!({ "request": serde_json::from_str::<Value>(&with(mutator)).unwrap() })
}

#[test]
fn actual_dto_drives_a_finite_bounded_ascent_query_and_curves() {
    let report = run(&fixture());
    assert_eq!(report["status"], "experimental-unqualified");
    assert_eq!(report["schemaId"], "astraea-native-candidate-report/3.0.0");
    // Provenance: real adapter identity plus declared (not hashed) source IDs.
    assert_eq!(report["adapter"]["adapterId"], "frontend-external-profile-SB1/1.0.0");
    assert!(report["identities"]["geometryIdentity"].as_str().unwrap()
        .starts_with("frontend-external-profile-SB1/1.0.0:"));
    assert!(report["identities"]["axialProviderId"].as_str().unwrap().contains("prescribed-CA0"));
    assert!(report["identities"]["calibrationPolicyId"].as_str().unwrap().contains("no-historical-calibration"));
    assert_eq!(report["identities"]["staticProviderId"], "static-body-total-SB1/1.0.0");
    assert_eq!(report["identities"]["rateModelId"], "legacy-dimensional-rate-couple/1.0.0");
    // The real DTO components became the declared adapter roles.
    let roles = report["adapter"]["components"].as_array().unwrap();
    assert!(roles.iter().any(|c| c["role"] == "external-body-profile"));
    assert!(roles.iter().any(|c| c["role"] == "external-fins"));
    assert_eq!(roles.iter().filter(|c| c["role"] == "declared-internal-non-geometry").count(), 2);
    // Real bounded ascent through the shared driver.
    let trajectory = &report["trajectory"];
    assert_eq!(trajectory["termination"], "TimeLimit");
    assert_eq!(trajectory["computationalCompletion"], "CompletedRequestedHorizon");
    assert_eq!(trajectory["empiricalQualification"], "Unqualified");
    assert_eq!(trajectory["dynamicQualification"], "Unknown");
    let horizon = trajectory["requestedHorizonS"].as_f64().unwrap();
    assert_eq!(horizon, 2.0);
    assert_eq!(trajectory["finalTimeS"].as_f64().unwrap(), horizon);
    let samples = trajectory["samples"].as_array().unwrap();
    assert!(samples.len() > 150, "committed samples: {}", samples.len());
    assert_eq!(trajectory["observedPrefix"]["sampleCount"].as_u64().unwrap() as usize, samples.len());
    // Declared retention policy: this short run keeps every committed sample.
    let retention = &trajectory["retention"];
    assert_eq!(retention["policyId"], "candidate-archive-display-samples/1.0.0");
    assert_eq!(retention["mode"], "reportBounded");
    assert_eq!(retention["collectionCapId"], "candidate-committed-sample-collection-cap/1.0.0");
    assert_eq!(retention["collectionCap"].as_u64().unwrap(), 50_000);
    assert_eq!(retention["sampleCount"].as_u64().unwrap() as usize, samples.len());
    assert_eq!(retention["retainedSampleCount"].as_u64().unwrap() as usize, samples.len());
    assert_eq!(samples.last().unwrap()["timeS"].as_f64().unwrap(), horizon);
    assert!(samples.iter().all(|s| s["timeS"].as_f64().unwrap() <= horizon));
    assert!(samples.iter().all(|s| s["origin"] == "committed-macro-sample"));
    assert!(trajectory["observedPrefix"]["maxAltitudeAglM"].as_f64().unwrap() > 10.0);
    // The pad sequence is honest: exactly-zero airspeed reports zero dimensional
    // loads with absent flow, then the versioned aero-negligibility bound covers
    // the first sub-millimetre-per-second liftoff motion, then the supported
    // airframe branch. The bound is reported per sample with its force scale.
    assert_eq!(samples[0]["computationalStatus"], "ZeroSpeedStaticLoadsOnly");
    assert!(samples[0]["flow"].is_null());
    let negligible = samples.iter().find(|s| s["computationalStatus"] == "StaticLoadsBelowAeroNegligibility").unwrap();
    assert_eq!(negligible["aeroNegligibility"]["isNegligible"], true);
    assert!(negligible["aeroNegligibility"]["maxPossibleForceN"].as_f64().unwrap()
        <= negligible["aeroNegligibility"]["relativeBound"].as_f64().unwrap()
            * negligible["aeroNegligibility"]["weightN"].as_f64().unwrap());
    assert!(samples.iter().any(|s| s["computationalStatus"] == "StaticLoadsBelowAeroNegligibility"));
    assert!(samples.iter().filter(|s| s["timeS"].as_f64().unwrap() > 0.1)
        .all(|s| s["computationalStatus"] == "Supported"));
    assert!(samples.iter().filter(|s| s["timeS"].as_f64().unwrap() > 0.1)
        .all(|s| !s["flow"].is_null() && !s["cp"].is_null()));
    // Time limit never fabricates landing, apogee or a legacy PASS.
    assert!(trajectory["landing"].is_null());
    assert!(trajectory["apogeeEvent"].is_null());
    assert!(report.get("validity").is_none());
    assert!(trajectory.get("validity").is_none());
    // Real events from the shared driver, in order.
    let events = report["events"].as_array().unwrap();
    let names: Vec<&str> = events.iter().map(|e| e["name"].as_str().unwrap()).collect();
    assert_eq!(names, vec!["Ignition & Rail Guidance", "Launch Rail Departure", "Motor Burnout"]);
    // Same prepared object, same static evaluation in all three consumers.
    let equivalence = &report["equivalence"];
    assert_eq!(equivalence["queryMatchesReferenceSample"], true);
    assert_eq!(equivalence["curveComparison"]["status"], "compared");
    assert_eq!(equivalence["curveComparison"]["matchesReferenceSample"], true);
    assert!(equivalence["curveComparison"]["reasonId"].is_null());
    let query = &report["query"];
    assert_eq!(query["origin"], "last-committed-sample");
    let sample = &query["sample"];
    assert_eq!(sample["computationalStatus"], "Supported");
    assert!(sample["cp"]["stationFromNoseM"].as_f64().unwrap() > 0.0);
    assert!(sample["windCoefficients"]["cdWind"].as_f64().unwrap() > 0.0);
    assert!(sample["staticForceBodyN"][1].as_f64().is_some());
    // Curves are static plots at the requested Mach grid plus the exact
    // reference Mach; the highest requested Mach stays inside support.
    let curves = &report["curves"];
    assert_eq!(curves["status"], "computed");
    assert_eq!(curves["policyId"], "candidate-curve-applicability/1.0.0");
    assert!(curves["notApplicable"].is_null());
    assert_eq!(curves["requestedMachs"].as_array().unwrap().len(), 7);
    assert_eq!(curves["referenceMachAddedForEquivalence"], true);
    let points = curves["points"].as_array().unwrap();
    assert_eq!(points.len(), 8);
    assert!(points.iter().all(|p| p["computationalStatus"] == "Supported"));
    let highest = points.iter().find(|p| p["mach"].as_f64().unwrap() == 0.79).unwrap();
    assert!(highest["coefficients"]["datum"]["cfBody"][1].as_f64().unwrap() < 0.0);
    assert!(highest["cp"]["stationFromNoseM"].as_f64().unwrap() > 0.0);
    // Candidate carries no rate moment in any curve point (schema, not value).
    assert!(points.iter().all(|p| p.get("rateMomentBodyNm").is_none()));
}

#[test]
fn mechanical_carrier_matches_the_legacy_mechanical_preparation_fields() {
    let request: Value = serde_json::from_str(&fixture()).unwrap();
    let vehicle: models::FrontendVehicle = serde_json::from_value(request["vehicle"].clone()).unwrap();
    let motor: models::FrontendMotor = serde_json::from_value(request["motor"].clone()).unwrap();
    // Test-only comparison: the candidate itself never calls this CP-dependent
    // preparation; the shared mass/CG/length/diameter/recovery fields must agree.
    let legacy = models::prepare_flight_vehicle(&vehicle, &motor).unwrap();
    let report = run(&fixture());
    let mech = &report["mechanical"];
    assert_eq!(mech["dryMassKg"].as_f64().unwrap(), legacy.dry_mass);
    assert_eq!(mech["cgFromNoseM"].as_f64().unwrap(), legacy.cg_from_nose);
    assert_eq!(mech["totalLengthM"].as_f64().unwrap(), legacy.total_length);
    assert_eq!(mech["referenceDiameterM"].as_f64().unwrap(), legacy.ref_diameter);
    assert_eq!(mech["motorAftStationFromNoseM"].as_f64().unwrap(), legacy.motor_aft_station_from_nose);
    assert_eq!(mech["drogue"]["diameterM"].as_f64().unwrap(), legacy.drogue.as_ref().unwrap().diameter);
    assert_eq!(mech["main"]["diameterM"].as_f64().unwrap(), legacy.main_chute.as_ref().unwrap().diameter);
    // The prepared candidate's own carrier fields are poisoned, so the finite
    // trajectory above cannot have consulted legacy slopes/CP/drag tables.
    assert!(mech["legacyCarrierFields"].as_str().unwrap().contains("NaN-poisoned"));
}

#[test]
fn off_grid_horizon_and_run_level_refusals_are_exact() {
    let off_grid = run(&with(|v| v["horizonSeconds"] = json!(1.234)));
    assert_eq!(off_grid["trajectory"]["finalTimeS"].as_f64().unwrap(), 1.234);
    let samples = off_grid["trajectory"]["samples"].as_array().unwrap();
    assert_eq!(samples.last().unwrap()["timeS"].as_f64().unwrap(), 1.234);
    // Historical calibration is refused, not transferred.
    let error = run_request_json(&with(|v| v["launch"]["dragCdScale"] = json!(0.9))).unwrap_err();
    assert!(error.contains("not transferable"), "{error}");
    // Exact-1.0 is accepted as "no calibration".
    let accepted = run(&with(|v| v["launch"]["dragCdScale"] = json!(1.0)));
    assert_eq!(accepted["launch"]["dragCdScale"], 1.0);
    // SB1 excludes cant.
    let error = run_request_json(&with(|v| v["launch"]["finCantAngleDeg"] = json!(0.5))).unwrap_err();
    assert!(error.contains("SB1 excludes fin cant"), "{error}");
    // A crosswind outside the candidate support stops the run with a reason;
    // the rail state gets no waiver and there is no legacy fallback.
    let error = run_request_json(&with(|v| v["environment"]["windSpeedSurfaceMps"] = json!(15.0))).unwrap_err();
    assert!(error.contains("forward flow and incidence"), "{error}");
    // Unsupported geometry refuses before any flight evaluation.
    let error = run_request_json(&with(|v| v["adapter"]["declarations"]["smoothSlenderProfile"] = json!(false))).unwrap_err();
    assert!(error.contains("declarations"), "{error}");
    // A flagged motor mount is an identified adapter blocker, not silently guessed.
    let error = run_request_json(&with(|v| v["vehicle"]["components"][1]["isMotorMount"] = json!(true))).unwrap_err();
    assert!(error.contains("motor-mount internal/external topology ambiguous"), "{error}");
    // Missing declared CA0 identity refuses instead of inventing a source.
    let error = run_request_json(&with(|v| v["axial"]["inputIdentity"] = json!(""))).unwrap_err();
    assert!(error.contains("axial input identity"), "{error}");
    // An incomplete declared parachute is an error, never a silent absence that
    // would leave the airframe active after a deployment flag. The existing mass
    // model refuses it first; the helper mapping also refuses incomplete chutes.
    let error = run_request_json(&with(|v| { v["vehicle"]["components"][3].as_object_mut().unwrap().remove("cd"); })).unwrap_err();
    assert!(error.contains("syn-drogue") && error.contains("cd"), "{error}");
    // A non-unit attitude in a direct query is refused by the shared policy.
    let mut request: Value = serde_json::from_str(&fixture()).unwrap();
    request["query"] = json!({
        "stageTimeS": 1.0,
        "state": { "positionM": [0, 0, 20], "velocityMps": [0, 20, 0],
                   "quaternionWxyz": [2, 0, 0, 0], "omegaRadps": [0, 0, 0] },
        "drogueDeployed": false, "mainDeployed": false, "railBound": false
    });
    let error = run_request_json(&serde_json::to_string(&request).unwrap()).unwrap_err();
    assert!(error.contains("near-unit-quaternion"), "{error}");
    // An instantaneous altitude outside the retained atmosphere domain refuses.
    let mut request: Value = serde_json::from_str(&fixture()).unwrap();
    request["query"] = json!({
        "stageTimeS": 1.0,
        "state": { "positionM": [0, 0, 25000], "velocityMps": [0, 20, 0],
                   "quaternionWxyz": [1, 0, 0, 0], "omegaRadps": [0, 0, 0] },
        "drogueDeployed": false, "mainDeployed": false, "railBound": false
    });
    let error = run_request_json(&serde_json::to_string(&request).unwrap()).unwrap_err();
    assert!(error.contains("instantaneous altitude"), "{error}");
}

#[test]
fn explicit_candidate_command_runs_the_bounded_candidate_and_preserves_legacy() {
    let request: Value = serde_json::from_str(&fixture()).unwrap();
    let report = dispatch("simulate_candidate", &json!({ "request": request.clone() }))
        .expect("explicit candidate command");
    assert_eq!(report["schemaId"], "astraea-native-candidate-report/3.0.0");
    assert_eq!(report["status"], "experimental-unqualified");
    // Exact horizon and absent landing/apogee remain the bounded-prefix semantics.
    assert_eq!(report["trajectory"]["requestedHorizonS"], 2.0);
    assert_eq!(report["trajectory"]["finalTimeS"], 2.0);
    assert!(report["trajectory"]["landing"].is_null());
    assert!(report["trajectory"]["apogeeEvent"].is_null());
    assert_eq!(
        report["trajectory"]["samples"].as_array().unwrap().last().unwrap()["timeS"],
        2.0
    );
    assert_eq!(report["equivalence"]["queryMatchesReferenceSample"], true);
    assert_eq!(report["equivalence"]["curveComparison"]["matchesReferenceSample"], true);
    // The unknown-command contract is unchanged.
    let error = dispatch("evaluate_native_candidate", &json!({}))
        .expect_err("unregistered candidate command name still fails");
    assert!(error.contains("unknown command"), "{error}");
    // The legacy command still returns its own result schema for the same DTO;
    // it does not gain candidate termination/qualification fields.
    let args = json!({ "vehicle": request["vehicle"], "motor": request["motor"], "options": {
        "railLength": 3, "railElevationDeg": 85, "railAzimuthDeg": 0,
        "windSpeedSurface": 0, "windAzimuthDeg": 90, "mainDeployAltitudeAGL": 250,
        "launchAltitudeASL": 0 } });
    let legacy = astraea_engine::dispatch("flight_summary", &args).unwrap();
    assert!(legacy.get("validity").is_some(), "legacy result keeps its validity labeling");
    assert!(legacy.get("termination").is_none());
    assert!(legacy.get("empiricalQualification").is_none());
    assert!(legacy.get("computationalCompletion").is_none());
}

#[test]
fn candidate_command_refuses_controls_unknown_envelopes_and_unsupported_domains() {
    let calls = [
        ("missing request", json!({}), "missing argument 'request'"),
        (
            "explicit null controls",
            args_with(|v| v["diagnosticNumerics"] = Value::Null),
            "not null",
        ),
        (
            "non-null controls",
            args_with(|v| {
                v["diagnosticNumerics"] = json!({
                    "schemaId":"candidate-native-diagnostic-controls/1.0.0",
                    "absoluteTolerancePolicy":"inherited","splitAtThrustKnots":true })
            }),
            "experiment-only control",
        ),
        (
            "unknown envelope version",
            json!({ "request": { "schemaId": "native-E1-profile-candidate-request/2.0.0" } }),
            "unsupported request schemaId",
        ),
        (
            "unsupported curve Mach",
            args_with(|v| v["curveMachs"] = json!([0.8])),
            "outside support",
        ),
        (
            "historical calibration",
            args_with(|v| v["launch"]["dragCdScale"] = json!(0.9)),
            "not transferable",
        ),
        (
            "fin cant",
            args_with(|v| v["launch"]["finCantAngleDeg"] = json!(0.5)),
            "SB1 excludes fin cant",
        ),
    ];
    for (name, args, expected) in calls {
        let error = dispatch("simulate_candidate", &args).unwrap_err();
        assert!(error.contains(expected), "{name}: {error}");
    }
}

#[test]
fn candidate_command_preserves_identity_for_equivalent_accepted_inputs() {
    let request: Value = serde_json::from_str(&fixture()).unwrap();
    let a = dispatch("simulate_candidate", &json!({ "request": request })).unwrap();
    // Consumed f64 spelling, absent versus explicit-null optionals and an
    // integer spelling of a consumed f64 normalize to the same typed identity.
    let mut equivalent: Value = serde_json::from_str(&fixture()).unwrap();
    equivalent["launch"]["railLengthM"] = json!(3);
    equivalent["environment"]["windSpeedSurfaceMps"] = json!(-0.0);
    equivalent["launch"].as_object_mut().unwrap().remove("dragCdScale");
    equivalent["launch"].as_object_mut().unwrap().remove("finCantAngleDeg");
    let b = dispatch("simulate_candidate", &json!({ "request": equivalent })).unwrap();
    assert_eq!(a["contentIdentity"], b["contentIdentity"]);
    assert_eq!(a["effectiveInputs"], b["effectiveInputs"]);
    // A changed consumed physical declaration changes the digest.
    let mut changed: Value = serde_json::from_str(&fixture()).unwrap();
    changed["axial"]["ca0"] = json!(0.36);
    let c = dispatch("simulate_candidate", &json!({ "request": changed })).unwrap();
    assert_ne!(a["contentIdentity"]["sha256"], c["contentIdentity"]["sha256"]);
}

#[test]
fn diagnostic_controls_dto_is_strict_and_never_falls_back() {
    let cases = [
        ("explicit null", with(|v| v["diagnosticNumerics"] = Value::Null), "not null"),
        ("unknown key", with(|v| v["diagnosticNumerics"] = json!({"schemaId":"candidate-native-diagnostic-controls/1.0.0","absoluteTolerancePolicy":"inherited","splitAtThrustKnots":false,"extra":1})), "invalid request JSON"),
        ("partial object", with(|v| v["diagnosticNumerics"] = json!({"schemaId":"candidate-native-diagnostic-controls/1.0.0","absoluteTolerancePolicy":"inherited"})), "invalid request JSON"),
        ("unknown schema", with(|v| v["diagnosticNumerics"] = json!({"schemaId":"future/9","absoluteTolerancePolicy":"inherited","splitAtThrustKnots":false})), "schemaId"),
        ("unknown policy", with(|v| v["diagnosticNumerics"] = json!({"schemaId":"candidate-native-diagnostic-controls/1.0.0","absoluteTolerancePolicy":"tenth","splitAtThrustKnots":false})), "invalid request JSON"),
    ];
    for (name, request, expected) in cases {
        let err = run_request_json(&request).unwrap_err();
        assert!(err.contains(expected), "{name}: {err}");
    }
}

#[test]
fn absent_controls_use_the_new_split_default_and_explicit_controls_never_reuse_it() {
    let a = run(&fixture());
    assert_eq!(a["contentIdentity"]["envelope"]["numericalPolicyId"], "inherited-candidate-driver-numerics/2.0.0");
    let absent_diag = &a["contentIdentity"]["envelope"]["numericalDiagnostics"];
    assert_eq!(absent_diag["splitAtThrustKnots"], true);
    assert_eq!(absent_diag["eventRootWidthS"].as_f64().unwrap().to_bits(), 1e-7f64.to_bits());
    let b = run(&with(|v| v["diagnosticNumerics"] = json!({"schemaId":"candidate-native-diagnostic-controls/1.0.0","absoluteTolerancePolicy":"inherited","splitAtThrustKnots":true})));
    assert_eq!(b["contentIdentity"]["envelope"]["numericalPolicyId"], "candidate-native-diagnostic-numerics/2.0.0");
    let d = &b["contentIdentity"]["envelope"]["numericalDiagnostics"];
    assert_eq!(d["absoluteTolerancePolicy"], "inherited");
    assert_eq!(d["splitAtThrustKnots"], true);
    assert_eq!(d["knotCutPolicyId"], "candidate-thrust-knot-cut/1.0.0");
    assert_eq!(d["eventRootWidthS"].as_f64().unwrap().to_bits(), 1e-7f64.to_bits());
    let applied = &d["appliedAbsoluteTolerances"];
    assert_eq!(applied["rM"].as_f64().unwrap().to_bits(), 1e-3f64.to_bits());
    assert_eq!(applied["vMps"].as_f64().unwrap().to_bits(), 1e-2f64.to_bits());
    assert_eq!(applied["qUnit"].as_f64().unwrap().to_bits(), 1e-5f64.to_bits());
    assert_eq!(applied["wRadps"].as_f64().unwrap().to_bits(), 1e-3f64.to_bits());
    let legacy = run(&with(|v| v["diagnosticNumerics"] = json!({"schemaId":"candidate-native-diagnostic-controls/1.0.0","absoluteTolerancePolicy":"inherited","splitAtThrustKnots":false})));
    assert_eq!(legacy["contentIdentity"]["envelope"]["numericalPolicyId"], "candidate-native-diagnostic-numerics/2.0.0");
    let strip = |r: &Value| {
        let mut v = r.clone();
        let obj = v.as_object_mut().unwrap();
        obj.remove("contentIdentity"); obj.remove("activePolicies"); obj.remove("effectiveInputs");
        v
    };
    assert_eq!(strip(&a), strip(&b), "explicit split equals the absent default physically");
    assert_ne!(strip(&a), strip(&legacy), "explicit legacy no-split is a distinct physical arm");
    assert_ne!(a["contentIdentity"]["sha256"], b["contentIdentity"]["sha256"]);
}

#[test]
fn mechanism_sidecar_reports_actual_controls_outside_the_compared_report() {
    let text = with(|v| v["diagnosticNumerics"] = json!({"schemaId":"candidate-native-diagnostic-controls/1.0.0","absoluteTolerancePolicy":"hundredth","splitAtThrustKnots":true}));
    let (report_text, sidecar_text) = run_request_json_with_sidecar(&text).unwrap();
    let report: Value = serde_json::from_str(&report_text).unwrap();
    let sidecar: Value = serde_json::from_str(&sidecar_text).unwrap();
    assert!(report.get("cutKnotsS").is_none() && report.get("clippedTrials").is_none()
        && report.get("stepWindowTrials").is_none() && report.get("mechanism").is_none());
    assert_eq!(sidecar["schemaId"], "candidate-native-diagnostic-mechanism-sidecar/1.0.0");
    assert_eq!(sidecar["location"], "per-attempt sidecar outside the compared candidate report");
    assert_eq!(sidecar["numericalPolicyId"], "candidate-native-diagnostic-numerics/2.0.0");
    assert_eq!(sidecar["absoluteTolerancePolicy"], "hundredth");
    assert_eq!(sidecar["appliedAbsoluteTolerances"]["rM"].as_f64().unwrap().to_bits(), 1e-5f64.to_bits());
    assert_eq!(sidecar["splitAtThrustKnots"], true);
    assert_eq!(sidecar["knotCutPolicyId"], "candidate-thrust-knot-cut/1.0.0");
    assert_eq!(sidecar["driverLimits"]["eventRootWidthS"].as_f64().unwrap().to_bits(), 1e-7f64.to_bits());
    assert!(sidecar["adaptiveTrialTotals"]["trials"].as_u64().unwrap() > 0);
    assert_eq!(sidecar["adaptiveTrialTotals"]["trials"].as_u64().unwrap(),
        sidecar["adaptiveTrialTotals"]["acceptedSteps"].as_u64().unwrap()
        + sidecar["adaptiveTrialTotals"]["rejectedSteps"].as_u64().unwrap());
    let knots: Vec<f64> = sidecar["cutKnotsS"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
    assert!(knots.len() >= 22, "all thrust knots plus burnout");
    assert!(knots.windows(2).all(|w| w[0] < w[1]));
    assert_eq!(knots.iter().filter(|t| t.to_bits() == 1.86f64.to_bits()).count(), 1);
    let clips = sidecar["clippedTrials"].as_array().unwrap();
    assert!(!clips.is_empty(), "split controls must clip at thrust knots");
    assert!(clips.iter().all(|c| c["trialStartS"].as_f64().unwrap() < c["knotTimeS"].as_f64().unwrap()));
    assert!(sidecar["straddledTrials"].as_array().unwrap().is_empty());
    assert!(sidecar["stepWindowTrials"].as_array().unwrap().iter()
        .all(|s| { let a = s["trialStartS"].as_f64().unwrap(); (0.18..=0.25).contains(&a) }));
    let (_report0, sidecar0_text) = run_request_json_with_sidecar(&fixture()).unwrap();
    let sidecar0: Value = serde_json::from_str(&sidecar0_text).unwrap();
    assert_eq!(sidecar0["absoluteTolerancePolicy"], "inherited-absent-default");
    assert_eq!(sidecar0["numericalPolicyId"], "inherited-candidate-driver-numerics/2.0.0");
    assert_eq!(sidecar0["splitAtThrustKnots"], true);
    assert!(sidecar0["straddledTrials"].as_array().unwrap().is_empty(), "split default never straddles knots");
    assert!(!sidecar0["clippedTrials"].as_array().unwrap().is_empty(), "split default clips at knots");
    assert!(sidecar0["adaptiveTrialTotals"]["trials"].as_u64().unwrap() > 0);
    let (_report1, sidecar1_text) = run_request_json_with_sidecar(&with(|v| v["diagnosticNumerics"] = json!({"schemaId":"candidate-native-diagnostic-controls/1.0.0","absoluteTolerancePolicy":"inherited","splitAtThrustKnots":false}))).unwrap();
    let sidecar1: Value = serde_json::from_str(&sidecar1_text).unwrap();
    assert_eq!(sidecar1["splitAtThrustKnots"], false);
    assert!(!sidecar1["straddledTrials"].as_array().unwrap().is_empty(), "explicit legacy no-split records straddles");
    assert!(sidecar1["clippedTrials"].as_array().unwrap().is_empty());
}

/// Reference-Mach identity point. At a supported *nonzero-incidence* reference
/// state the curve point must reproduce the direct query's static observations
/// exactly (f64 bits), not merely within a tolerance. On `24fc8dc` this fixture
/// reported `curveMatchesReferenceSample: false` with datum bit differences at
/// indices 2 and 3 and a CG difference at index 2; that failing-before probe is
/// retained outside the repository.
#[test]
fn reference_mach_curve_point_matches_the_query_at_nonzero_incidence() {
    let fixture = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/native-candidate-request-incidence-16.json")).expect("incidence fixture");
    let report = run(&fixture);
    let equivalence = &report["equivalence"];
    assert_eq!(equivalence["queryMatchesReferenceSample"], true);
    assert_eq!(equivalence["curveComparison"]["status"], "compared");
    assert_eq!(equivalence["curveComparison"]["matchesReferenceSample"], true);
    assert!(equivalence["curveComparison"]["reasonId"].is_null());
    let reference_mach = equivalence["referenceMach"].as_f64().unwrap();
    let points = report["curves"]["points"].as_array().unwrap();
    let point = points.iter()
        .find(|p| p["mach"].as_f64().unwrap().to_bits() == reference_mach.to_bits())
        .expect("reference Mach point");
    let query = &report["query"]["sample"];
    // Independent value comparison, not a re-read of the engine's own boolean.
    assert_eq!(point["coefficients"], query["coefficients"]);
    assert_eq!(point["windCoefficients"], query["windCoefficients"]);
    assert_eq!(point["normalDerivatives"], query["normalDerivatives"]);
    assert_eq!(point["cp"], query["cp"]);
    assert_eq!(point["staticForceBodyN"], query["staticForceBodyN"]);
    assert_eq!(point["staticMomentCgBodyNm"], query["staticMomentCgBodyNm"]);
    assert_eq!(point["aeroNegligibility"], query["aeroNegligibility"]);
    for key in ["alphaDeg", "betaDeg", "incidenceDeg"] {
        assert_eq!(point["flow"][key].as_f64().unwrap().to_bits(),
            query["flow"][key].as_f64().unwrap().to_bits(), "{key}");
    }
    assert_eq!(point["dynamicPressurePa"].as_f64().unwrap().to_bits(),
        query["mechanics"]["dynamicPressurePa"].as_f64().unwrap().to_bits());
    assert_eq!(query["mechanics"]["mach"].as_f64().unwrap().to_bits(), reference_mach.to_bits());
    // Non-vacuity: the reference flow is genuinely off-axis.
    let incidence = query["flow"]["incidenceDeg"].as_f64().unwrap();
    assert!(incidence != 0.0 && incidence.abs() < 5.0, "incidence {incidence}");
    // Every other requested point still evaluates through the reconstruction.
    assert_eq!(points.len(), 8);
    assert!(points.iter().filter(|p| p["mach"].as_f64().unwrap().to_bits() != reference_mach.to_bits())
        .count() == 7);
}
