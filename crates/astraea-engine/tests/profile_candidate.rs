use astraea_engine::{profile_candidate,dispatch};
use serde_json::{json,Value};
fn input()->Value {serde_json::from_str(include_str!("fixtures/profile-candidate-request.json")).unwrap()}
fn n(v:&Value)->f64{v.as_f64().unwrap()}
fn near(a:f64,b:f64){assert!((a-b).abs()<=2e-12*a.abs().max(b.abs()).max(1.0),"{a} != {b}");}

#[test]
fn actual_profile_drives_trajectory_query_curves_and_effective_provenance() {
    let request=input();let r=profile_candidate::evaluate(&request).unwrap();
    assert_eq!(r["effectiveInputs"],request);
    assert_eq!(r["compositionId"],"candidate-static-rate-profile-composition/1.0.0");
    assert_eq!(r["schemaId"],"astraea-native-profile-candidate-report/3.0.0");
    assert_eq!(r["equivalence"]["profileObservationQueryExact"],true);
    assert_eq!(r["equivalence"]["profileSourceSharedByCurve"],true);
    assert_eq!(r["curves"]["status"],"computed");
    assert_eq!(r["curves"]["policyId"],"candidate-curve-applicability/1.0.0");
    assert_eq!(r["equivalence"]["curveComparison"]["status"],"compared");
    assert_eq!(r["equivalence"]["curveComparison"]["matchesReferenceSample"],true);
    let samples=r["trajectory"]["samples"].as_array().unwrap();
    assert_eq!(samples.len(),201);
    for sample in samples {
        let o=&sample["profileEnvironment"];
        let altitude=100.0+n(&sample["state"]["positionM"][2]);
        near(n(&o["altitudeGeometricMslM"]),altitude);
        let pressure=(100000_f64.ln()*(1.0-altitude/1000.0)+80000_f64.ln()*altitude/1000.0).exp();
        near(n(&o["pressurePa"]),pressure);
        near(n(&o["densityKgM3"]),pressure/(287.05287*300.0));
        near(n(&o["soundSpeedMps"]),(1.4_f64*287.05287*300.0).sqrt());
        near(n(&sample["mechanics"]["mach"]),n(&o["mach"]));
        near(n(&sample["mechanics"]["dynamicPressurePa"]),n(&o["dynamicPressurePa"]));
        assert_eq!(o["profileSourceIdentity"],request["candidate"]["environmentSourceId"]);
        assert_eq!(o["windTowardEnuMps"],json!([0.0,0.0,0.0]));
    }
    let q=&r["query"]["sample"];
    assert_eq!(q["profileEnvironment"],samples.last().unwrap()["profileEnvironment"]);
    assert_eq!(q["staticForceBodyN"],samples.last().unwrap()["staticForceBodyN"]);
    let reference_mach=n(&r["equivalence"]["referenceMach"]);
    let point=r["curves"]["points"].as_array().unwrap().iter().find(|p|n(&p["mach"])==reference_mach).unwrap();
    for axis in 0..3 {near(n(&point["staticForceBodyN"][axis]),n(&q["staticForceBodyN"][axis]));}
    let o=&q["profileEnvironment"];
    near(n(&o["reynoldsPerM"]),n(&o["densityKgM3"])*n(&o["airspeedMps"])/n(&o["dynamicViscosityPaS"]));
    assert!(dispatch("simulate_profile_candidate",&request).unwrap_err().contains("unknown command"));
    // The same envelope is now the runtime command's tagged profile request.
    assert_eq!(r["commands"]["dispatchRegistered"],true);
    assert_eq!(r["commands"]["commandName"],"simulate_candidate");
    assert_eq!(r["commands"]["envelopeSchemaId"],"native-E1-profile-candidate-request/1.0.0");
    assert_eq!(r["commands"]["wasmTargetIncluded"],true);
    let dispatched=dispatch("simulate_candidate",&json!({"request":request.clone()})).unwrap();
    assert_eq!(dispatched,r);
    // The JSON-text helper path must describe the same run. The whole report is
    // not compared through a text round trip: this serde_json build has no
    // `float_roundtrip` feature, so re-parsing a 17-digit decimal can move a
    // value by one ULP (observed on profileEnvironment fields). Compare the
    // exact-integer/string metadata instead.
    let text=profile_candidate::run_request_json(&serde_json::to_string(&request).unwrap()).unwrap();
    let reparsed:Value=serde_json::from_str(&text).unwrap();
    assert_eq!(reparsed["schemaId"],r["schemaId"]);
    assert_eq!(reparsed["commands"],r["commands"]);
    assert_eq!(reparsed["contentIdentity"]["sha256"],r["contentIdentity"]["sha256"]);
    assert_eq!(reparsed["trajectory"]["sampleCount"],r["trajectory"]["sampleCount"]);
    assert_eq!(reparsed["trajectory"]["retention"],r["trajectory"]["retention"]);
}

#[test]
fn changed_same_label_profile_changes_real_dynamics_and_never_uses_a_stale_mach_cache() {
    let x=input();let a=profile_candidate::evaluate(&x).unwrap();
    let mut changed=x.clone();
    for knot in changed["environmentSelection"]["profile"]["knots"].as_array_mut().unwrap(){knot["pressurePa"]=json!(n(&knot["pressurePa"])*0.5);}
    let b=profile_candidate::evaluate(&changed).unwrap();
    assert_ne!(a["trajectory"]["finalState"],b["trajectory"]["finalState"]);
    assert_ne!(a["effectiveInputs"],b["effectiveInputs"]);
    assert_eq!(a["identities"]["environmentSourceId"],b["identities"]["environmentSourceId"]);
    let mut wind=x.clone();
    for k in wind["environmentSelection"]["profile"]["knots"].as_array_mut().unwrap(){k["windTowardEnuMps"]["up"]=json!(-0.1);}
    // Pure vertical wind is at the exact 5-degree SB1 boundary on the 85deg
    // rail, and rounding can put a speculative stage beyond support: preserve
    // that refusal, then use an explicitly along-rail synthetic scenario.
    assert!(profile_candidate::evaluate(&wind).unwrap_err().contains("incidence"));
    let elevation=n(&x["candidate"]["launch"]["railElevationDeg"]).to_radians();
    for k in wind["environmentSelection"]["profile"]["knots"].as_array_mut().unwrap(){
        k["windTowardEnuMps"]["north"]=json!(-0.1*elevation.cos());
        k["windTowardEnuMps"]["up"]=json!(-0.1*elevation.sin());
    }
    let w=profile_candidate::evaluate(&wind).unwrap();
    assert_ne!(a["trajectory"]["finalState"],w["trajectory"]["finalState"]);
    assert_eq!(profile_candidate::evaluate(&x).unwrap(),a);
}

#[test]
fn strict_profile_selection_rejects_mixed_wind_source_datum_units_and_fractional_expiry() {
    for (path,value) in [("/candidate/environment/windSpeedSurfaceMps",json!(1)),("/candidate/environmentSourceId",json!("not-the-profile")),("/environmentSelection/verticalDatumIdentity",json!("wrong-geoid")),("/candidate/environment/launchAltitudeASL",json!(0)),("/environmentSelection/profile/units/pressure",json!("hPa")),("/environmentSelection/profile/extrapolationPolicy",json!("clamp")),("/environmentSelection/profile/knots",json!([]))] {
        let mut x=input();*x.pointer_mut(path).unwrap()=value;assert!(profile_candidate::evaluate(&x).is_err(),"{path}");
    }
    for path in ["","/environmentSelection","/environmentSelection/profile","/environmentSelection/profile/knots/0","/environmentSelection/profile/knots/0/windTowardEnuMps"] {
        let mut x=input();x.pointer_mut(path).unwrap().as_object_mut().unwrap().insert("typo".into(),json!(1));
        assert!(profile_candidate::evaluate(&x).unwrap_err().contains("unknown field"));
    }
    let mut x=input();let launch=x["environmentSelection"]["launchTimeUtcUnixS"].as_i64().unwrap();
    x["environmentSelection"]["profile"]["validity"]["untilUtcUnixS"]=json!(launch+2);
    assert!(profile_candidate::evaluate(&x).is_ok());
    x["candidate"]["horizonSeconds"]=json!(2.0000000001);
    assert!(profile_candidate::evaluate(&x).unwrap_err().contains("fractional stage time"));
}

#[test]
fn outer_envelope_never_overwrites_the_selected_numerical_policy() {
    let mut req=input();
    req["candidate"]["diagnosticNumerics"]=json!({"schemaId":"candidate-native-diagnostic-controls/1.0.0","absoluteTolerancePolicy":"inherited","splitAtThrustKnots":false});
    let (report,sidecar)=profile_candidate::evaluate_with_sidecar(&req).unwrap();
    assert_eq!(report["contentIdentity"]["envelope"]["numericalPolicyId"],"candidate-native-diagnostic-numerics/2.0.0");
    assert_eq!(report["contentIdentity"]["envelope"]["numericalDiagnostics"]["appliedAbsoluteTolerances"]["rM"].as_f64().unwrap().to_bits(),1e-3f64.to_bits());
    assert_eq!(sidecar["absoluteTolerancePolicy"],"inherited");
    assert_eq!(sidecar["splitAtThrustKnots"],false);
    assert!(report.get("clippedTrials").is_none()&&report.get("cutKnotsS").is_none());
    let (plain,_sidecar)=profile_candidate::evaluate_with_sidecar(&input()).unwrap();
    assert_eq!(plain["contentIdentity"]["envelope"]["numericalPolicyId"],"inherited-candidate-driver-numerics/2.0.0");
    let plain_diag=&plain["contentIdentity"]["envelope"]["numericalDiagnostics"];
    assert_eq!(plain_diag["splitAtThrustKnots"],true);
    assert_eq!(plain_diag["eventRootWidthS"].as_f64().unwrap().to_bits(),1e-7f64.to_bits());
    let mut bad=input();bad["candidate"]["diagnosticNumerics"]=Value::Null;
    assert!(profile_candidate::evaluate(&bad).unwrap_err().contains("not null"));
}

/// The single command's tagged union: the exact profile envelope is dispatched,
/// every other schema id is refused with the accepted set, a malformed envelope
/// never degrades to the untagged reading, and no experiment/research control is
/// reachable through either shape.
#[test]
fn candidate_command_accepts_exactly_the_profile_envelope() {
    let request = input();
    let accepted = dispatch("simulate_candidate", &json!({ "request": request.clone() })).unwrap();
    assert_eq!(accepted["schemaId"], "astraea-native-profile-candidate-report/3.0.0");
    assert_eq!(accepted["effectiveInputs"], request);

    let error = dispatch("simulate_candidate",
        &json!({ "request": { "schemaId": "profile/9.9.9" } })).unwrap_err();
    assert!(error.contains("unsupported request schemaId 'profile/9.9.9'"), "{error}");
    assert!(error.contains("native-E1-profile-candidate-request/1.0.0"), "{error}");
    let error = dispatch("simulate_candidate",
        &json!({ "request": { "schemaId": 7 } })).unwrap_err();
    assert!(error.contains("schemaId must be a string"), "{error}");

    // A tagged envelope missing its required members is refused as an envelope,
    // not reinterpreted as an untagged candidate request.
    let mut truncated = request.clone();
    truncated.as_object_mut().unwrap().remove("environmentSelection");
    let error = dispatch("simulate_candidate", &json!({ "request": truncated })).unwrap_err();
    assert!(error.contains("environmentSelection"), "{error}");
    let mut truncated = request.clone();
    truncated.as_object_mut().unwrap().remove("candidate");
    let error = dispatch("simulate_candidate", &json!({ "request": truncated })).unwrap_err();
    assert!(error.contains("candidate"), "{error}");

    // Experiment and research controls are refused inside the envelope too.
    let mut controls = request.clone();
    controls["candidate"]["diagnosticNumerics"] = json!({
        "schemaId": "candidate-native-diagnostic-controls/1.0.0",
        "absoluteTolerancePolicy": "hundredth", "splitAtThrustKnots": true });
    let error = dispatch("simulate_candidate", &json!({ "request": controls })).unwrap_err();
    assert!(error.contains("diagnosticNumerics") && error.contains("not offered"), "{error}");
    let mut retention = request.clone();
    retention["candidate"]["sampleRetention"] = json!({
        "schemaId": "candidate-native-sample-retention/1.0.0",
        "mode": "declaredFull", "maxCommittedSamples": 20000 });
    let error = dispatch("simulate_candidate", &json!({ "request": retention })).unwrap_err();
    assert!(error.contains("sampleRetention") && error.contains("not offered"), "{error}");
    // The helper seam still owns both controls.
    let mut helper = request.clone();
    helper["candidate"]["sampleRetention"] = json!({
        "schemaId": "candidate-native-sample-retention/1.0.0",
        "mode": "declaredFull", "maxCommittedSamples": 20000 });
    let report = profile_candidate::evaluate(&helper).unwrap();
    assert_eq!(report["trajectory"]["retention"]["mode"], "declaredFull");
}

/// Item-j proof: the profile identity point is exact at a *nonzero-incidence,
/// wind-bearing* reference state (beta != 0 from the declared profile cross wind
/// aloft, zero wind at the launch altitude so t=0 stays supported). The axis-
/// aligned fixture cannot show this because beta is exactly zero there.
#[test]
fn profile_reference_mach_curve_point_is_exact_with_cross_wind() {
    let request: Value = serde_json::from_str(include_str!(
        "fixtures/profile-candidate-request-wind.json")).unwrap();
    let report = profile_candidate::evaluate(&request).unwrap();
    let equivalence = &report["equivalence"];
    assert_eq!(equivalence["curveComparison"]["status"], "compared");
    assert_eq!(equivalence["curveComparison"]["matchesReferenceSample"], true);
    let query = &report["query"]["sample"];
    let incidence = query["flow"]["incidenceDeg"].as_f64().unwrap();
    let beta = query["flow"]["betaDeg"].as_f64().unwrap();
    assert!(incidence != 0.0 && incidence.abs() < 5.0, "incidence {incidence}");
    assert!(beta != 0.0, "the profile cross wind must produce a nonzero sideslip (beta {beta})");
    let reference_mach = equivalence["referenceMach"].as_f64().unwrap();
    let point = report["curves"]["points"].as_array().unwrap().iter()
        .find(|p| p["mach"].as_f64().unwrap().to_bits() == reference_mach.to_bits())
        .expect("reference Mach point");
    assert_eq!(point["coefficients"], query["coefficients"]);
    assert_eq!(point["profileEnvironment"], query["profileEnvironment"]);
    assert_eq!(point["windCoefficients"], query["windCoefficients"]);
    assert_eq!(point["normalDerivatives"], query["normalDerivatives"]);
    assert_eq!(point["cp"], query["cp"]);
    assert_eq!(point["staticForceBodyN"], query["staticForceBodyN"]);
    assert_eq!(point["dynamicPressurePa"].as_f64().unwrap().to_bits(),
        query["mechanics"]["dynamicPressurePa"].as_f64().unwrap().to_bits());
}
