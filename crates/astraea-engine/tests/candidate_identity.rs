//! RMP07a synthetic native identity boundaries, not numerical qualification.
use astraea_engine::{candidate_identity, native_candidate, profile_candidate};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn native_input() -> Value {
    serde_json::from_str(include_str!("fixtures/native-candidate-request.json")).unwrap()
}
fn profile_input() -> Value {
    serde_json::from_str(include_str!("fixtures/profile-candidate-request.json")).unwrap()
}
fn run(v: &Value) -> Value {
    let typed = serde_json::from_value(v.clone()).unwrap();
    native_candidate::run_request(&typed).unwrap()
}
fn digest(report: &Value) -> &Value { &report["contentIdentity"]["sha256"] }
fn assert_binding(report: &Value) {
    let c = &report["contentIdentity"];
    let preimage = c["canonicalPreimage"].as_str().unwrap();
    assert_eq!(c["sha256"], format!("{:x}", Sha256::digest(preimage.as_bytes())));
    assert_eq!(preimage, format!("{}\n{}\n{}", candidate_identity::SCHEME_ID,
        candidate_identity::ENCODING_ID, candidate_identity::canonical(&c["envelope"])));
    assert_eq!(c["envelope"]["models"], report["identities"]);
    assert_eq!(c["envelope"]["activePolicies"],report["activePolicies"]);
    assert_eq!(report["activePolicies"]["aeroNegligibility"],astraea_core::flight_provider::AERO_NEGLIGIBILITY_POLICY_ID);
    assert_eq!(report["activePolicies"]["cpCancellation"],astraea_core::aero_coefficients::CP_CANCELLATION_POLICY_ID);
    assert_eq!(report["activePolicies"]["prefixSampling"],report["trajectory"]["observedPrefix"]["samplingPolicyId"]);
    assert!(c["runtimeIdentity"].is_null());
    assert_eq!(report["status"], "experimental-unqualified");
}

#[test]
fn actual_native_report_captures_typed_inputs_and_does_not_forge_runtime_identity() {
    let input = native_input();
    let a = run(&input);
    let b = run(&input);
    assert_eq!(a,b);
    assert_binding(&a);
    assert_eq!(a["effectiveInputs"], a["contentIdentity"]["envelope"]["inputs"]);
    assert_eq!(a["effectiveInputs"]["axial"]["ca0"],input["axial"]["ca0"]);
    // Reconstructing a fresh typed request from the retained capture preserves
    // both native outputs and content identity for this synthetic fixture.
    assert_eq!(run(&a["effectiveInputs"]),a);
}

#[test]
fn same_labels_do_not_hide_changes_to_each_native_dependency() {
    let input = native_input();
    let original = run(&input);
    let cases = [
        ("/axial/ca0", json!(0.36)),
        ("/vehicle/components/2/span", json!(0.081)),
        ("/motor/thrustCurve/5/thrust", json!(14.0)),
        ("/motor/dryMass", json!(0.0124)),
        ("/environment/launchAltitudeASL", json!(1.0)),
        ("/launch/railLengthM", json!(3.1)),
        ("/launch/timeStepS", json!(0.005)),
        ("/adapter/quadrature/relativeTolerance", json!(1e-11)),
        ("/horizonSeconds", json!(1.99)),
        ("/curveMachs/0", json!(0.03)),
        ("/motorAftStationFromNoseM", json!(0.99)),
    ];
    for (path, replacement) in cases {
        let mut changed = input.clone();
        *changed.pointer_mut(path).unwrap() = replacement;
        if path == "/motor/dryMass" { changed["motor"]["totalMass"] = json!(0.0232); }
        let r = run(&changed);
        assert_ne!(digest(&original), digest(&r), "{path}");
        assert_eq!(original["identities"]["axialInputIdentity"],r["identities"]["axialInputIdentity"]);
        assert_eq!(original["identities"]["callerSourceIdentity"],r["identities"]["callerSourceIdentity"]);
        assert_binding(&r);
    }
    let mut query = input.clone();
    let sample = &original["query"]["sample"];
    query["query"] = json!({
        "stageTimeS": sample["timeS"], "state": sample["state"],
        "drogueDeployed": false, "mainDeployed": false, "railBound": false,
    });
    let r = run(&query);
    assert_ne!(digest(&original),digest(&r));
}

#[test]
fn canonicalization_uses_typed_numbers_and_preserves_null_and_array_order() {
    let input = native_input();
    let original = run(&input);
    let mut spelled = input.clone();
    spelled["launch"]["railLengthM"] = json!(3); // consumed f64: 3 and 3.0 agree
    spelled["environment"]["windSpeedSurfaceMps"] = json!(-0.0);
    spelled["launch"].as_object_mut().unwrap().remove("dragCdScale");
    assert_eq!(digest(&original),digest(&run(&spelled)));
    let mut explicit = input.clone();
    explicit["launch"]["finCantAngleDeg"] = json!(0.0);
    assert_ne!(digest(&original),digest(&run(&explicit))); // null does not become zero
    let mut ordered = input.clone();
    ordered["curveMachs"].as_array_mut().unwrap().reverse();
    assert_ne!(digest(&original),digest(&run(&ordered)));
    // Native JSON parser ignores unrecognized vehicle metadata. Never claim
    // those ignored raw fields were consumed or bind them as physical inputs.
    let mut metadata = input.clone();
    metadata["vehicle"]["unconsumedLabel"] = json!("caller-only metadata");
    assert_eq!(digest(&original),digest(&run(&metadata)));
    assert!(run(&metadata)["effectiveInputs"]["vehicle"].get("unconsumedLabel").is_none());
    let mut label=input.clone();
    label["motor"]["designation"]=json!("caller renamed motor; identical physical content");
    assert_ne!(digest(&original),digest(&run(&label))); // conservative full-input key
    let text=serde_json::to_string(&input).unwrap();
    let reordered: Value=serde_json::from_str(&text).unwrap();
    assert_eq!(digest(&original),digest(&run(&reordered)));
}

#[test]
fn optional_nonfinite_direct_dto_is_rejected_before_json_can_turn_it_into_null() {
    let mut request: native_candidate::NativeCandidateRequest = serde_json::from_value(native_input()).unwrap();
    // This descriptive optional motor field is not needed by trajectory physics;
    // it must nevertheless not collide with an absent maximum in the archive.
    request.motor.max_thrust = Some(f64::NAN);
    assert!(native_candidate::run_request(&request).unwrap_err().contains("nonfinite"));
    request.motor.max_thrust = Some(f64::INFINITY);
    assert!(native_candidate::run_request(&request).unwrap_err().contains("nonfinite"));
}

#[test]
fn profile_content_and_selection_are_bound_not_just_the_source_label() {
    let input = profile_input();
    let original = profile_candidate::evaluate(&input).unwrap();
    assert_binding(&original);
    assert_eq!(original["activePolicies"]["profileTime"],original["query"]["sample"]["profileEnvironment"]["timePolicyId"]);
    assert_eq!(original["effectiveInputs"],input); // old raw capture retained
    for (path, value) in [
        ("/environmentSelection/profile/knots/0/pressurePa",json!(99900)),
        ("/environmentSelection/profile/knots/0/temperatureK",json!(301)),
        ("/environmentSelection/profile/validity/untilUtcUnixS",json!(1792969300_i64)),
        ("/environmentSelection/launchTimeUtcUnixS",json!(1792965601_i64)),
    ] {
        let mut changed = input.clone();
        *changed.pointer_mut(path).unwrap()=value;
        let r=profile_candidate::evaluate(&changed).unwrap();
        assert_ne!(digest(&original),digest(&r),"{path}");
        assert_eq!(r["identities"]["environmentSourceId"],original["identities"]["environmentSourceId"]);
        assert_binding(&r);
    }
    let mut spelling=input.clone();
    spelling["environmentSelection"]["profile"]["knots"][0]["pressurePa"]=json!(100000.0);
    spelling["environmentSelection"]["profile"]["location"]["latitudeDeg"]=json!(0.0);
    assert_eq!(digest(&original),digest(&profile_candidate::evaluate(&spelling).unwrap()));
    let replay=&original["contentIdentity"]["envelope"]["inputs"];
    assert_eq!(digest(&original),digest(&profile_candidate::evaluate(replay).unwrap()));
}

#[test]
fn adjacent_large_epoch_integers_remain_distinct_and_exact() {
    let mut input=profile_input();
    let t=9007199254741000_i64;
    input["environmentSelection"]["launchTimeUtcUnixS"]=json!(t);
    input["environmentSelection"]["profile"]["issueTimeUtcUnixS"]=json!(t);
    input["environmentSelection"]["profile"]["validity"]["fromUtcUnixS"]=json!(t);
    input["environmentSelection"]["profile"]["validity"]["untilUtcUnixS"]=json!(t+100);
    let a=profile_candidate::evaluate(&input).unwrap();
    input["environmentSelection"]["launchTimeUtcUnixS"]=json!(t+1);
    let b=profile_candidate::evaluate(&input).unwrap();
    assert_ne!(digest(&a),digest(&b));
    assert_eq!(a["contentIdentity"]["envelope"]["inputs"]["environmentSelection"]["launchTimeUtcUnixS"],json!(t));
    assert!(a["contentIdentity"]["canonicalPreimage"].as_str().unwrap().contains("i9007199254741000;"));
    assert!(b["contentIdentity"]["canonicalPreimage"].as_str().unwrap().contains("i9007199254741001;"));
}

#[test]
fn serialized_archive_replay_recovers_difficult_float_bits_without_changing_production_parser() {
    let difficult=51.248178375505404_f64;
    let mut request: native_candidate::NativeCandidateRequest=serde_json::from_value(native_input()).unwrap();
    request.motor.max_thrust=Some(difficult);
    let original=native_candidate::run_request(&request).unwrap();
    let serialized=serde_json::to_string(&original).unwrap();
    let replay: Value=serde_json::from_str(&candidate_identity::replay_report_json(&serialized).unwrap()).unwrap();
    assert_eq!(digest(&original),digest(&replay));
    // The authoritative bits survive even if the readable decimal envelope
    // parses one ULP differently with the unchanged serde_json defaults.
    assert_eq!(original["contentIdentity"]["canonicalPreimage"],replay["contentIdentity"]["canonicalPreimage"]);
    let mut profile=profile_input();
    profile["environmentSelection"]["profile"]["location"]["longitudeDeg"]=json!(difficult);
    let original=profile_candidate::evaluate(&profile).unwrap();
    let serialized=serde_json::to_string(&original).unwrap();
    let replay: Value=serde_json::from_str(&candidate_identity::replay_report_json(&serialized).unwrap()).unwrap();
    assert_eq!(digest(&original),digest(&replay));
    let mut corrupted=original.clone();
    corrupted["contentIdentity"]["sha256"]=json!("0".repeat(64));
    assert!(candidate_identity::replay_report_json(&corrupted.to_string()).unwrap_err().contains("digest mismatch"));
    // Even a correctly rehashed archive cannot pretend a different policy is
    // active in the current evaluator. This does not authenticate the author.
    let c=&mut corrupted["contentIdentity"];
    let old=c["canonicalPreimage"].as_str().unwrap();
    let changed=old.replace(astraea_core::flight_provider::AERO_NEGLIGIBILITY_POLICY_ID,"unavailable-policy/99");
    c["sha256"]=json!(format!("{:x}",Sha256::digest(changed.as_bytes())));
    c["canonicalPreimage"]=json!(changed);
    assert!(candidate_identity::replay_report_json(&corrupted.to_string()).unwrap_err().contains("identity differs"));
}

#[test]
fn unsupported_inputs_remain_errors_instead_of_receiving_success_identities() {
    let mut input=native_input();
    input["launch"]["dragCdScale"]=json!(1.1);
    let request=serde_json::from_value(input).unwrap();
    assert!(native_candidate::run_request(&request).is_err());
    let mut profile=profile_input();
    profile["environmentSelection"]["profile"]["units"]["pressure"]=json!("hPa");
    assert!(profile_candidate::evaluate(&profile).is_err());
}

#[test]
fn explicit_controls_replay_losslessly_and_absent_controls_use_the_new_default() {
    let original=native_input();
    let absent=run(&original);
    assert_eq!(absent["contentIdentity"]["envelope"]["numericalPolicyId"],"inherited-candidate-driver-numerics/2.0.0");
    let absent_diag=&absent["contentIdentity"]["envelope"]["numericalDiagnostics"];
    assert_eq!(absent_diag["splitAtThrustKnots"], true);
    assert_eq!(absent_diag["eventRootWidthS"].as_f64().unwrap().to_bits(), 1e-7f64.to_bits());
    let mut explicit=original.clone();
    explicit["diagnosticNumerics"]=json!({"schemaId":"candidate-native-diagnostic-controls/1.0.0","absoluteTolerancePolicy":"hundredth","splitAtThrustKnots":true});
    let typed=serde_json::from_value(explicit).unwrap();
    let report=native_candidate::run_request(&typed).unwrap();
    assert_eq!(report["contentIdentity"]["envelope"]["numericalPolicyId"],"candidate-native-diagnostic-numerics/2.0.0");
    assert_eq!(report["contentIdentity"]["envelope"]["numericalDiagnostics"]["eventRootWidthS"].as_f64().unwrap().to_bits(), 1e-7f64.to_bits());
    assert_ne!(digest(&report),digest(&absent));
    assert_binding(&report);
    let serialized=serde_json::to_string(&report).unwrap();
    let replay: Value=serde_json::from_str(&candidate_identity::replay_report_json(&serialized).unwrap()).unwrap();
    assert_eq!(digest(&report),digest(&replay));
    assert_eq!(report["contentIdentity"]["canonicalPreimage"],replay["contentIdentity"]["canonicalPreimage"]);
    assert_eq!(report["contentIdentity"]["envelope"],replay["contentIdentity"]["envelope"]);
}

#[test]
fn absent_controls_pin_the_current_policy_identity_digests() {
    // The pre-change RMP07a digests remain in
    // docs/internal/execution-runs/RMP07-content-identity/native-checks.json.
    // They are historical identities, inactive by design after the approved
    // numerical-policy change; these are the current-policy digests.
    let native = run(&native_input());
    assert_eq!(native["contentIdentity"]["sha256"],
        "80c447b8426ef64fa93509dbc07e75bba1859c01bbdfa586f0e7da8b9ffdb1b4");
    let profile = profile_candidate::evaluate(&profile_input()).unwrap();
    assert_eq!(profile["contentIdentity"]["sha256"],
        "5e07b4b7cbfbee2e56a17d34e4c2707543a34f41b38cddc7d5534e3518524769");
}
