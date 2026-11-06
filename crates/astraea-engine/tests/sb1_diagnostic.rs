//! Synthetic command-boundary checks only, not empirical accuracy evidence.
use astraea_engine::dispatch_json;
use serde_json::{json, Value};

fn request() -> Value { serde_json::from_str(include_str!("fixtures/sb1-diagnostic-request.json")).unwrap() }
fn reply(r: &Value) -> Value { serde_json::from_str(&dispatch_json("evaluate_sb1_diagnostic", &r.to_string())).unwrap() }
fn ok(r: &Value) -> Value {
    let v = reply(r);
    assert!(v.get("error").is_none(), "{v}");
    v["ok"].clone()
}
fn error(r: &Value, contains: &str) {
    let v = reply(r);
    assert!(v["error"].as_str().unwrap().contains(contains), "{v}");
    assert!(v.get("ok").is_none());
}
fn f(v: &Value) -> f64 { v.as_f64().unwrap() }
fn near(a: f64, b: f64) { assert!((a-b).abs() < 2e-11*(1.0+a.abs().max(b.abs())), "{a} != {b}"); }

#[test]
fn real_dispatch_retains_raw_known_fields_options_and_support_roundtrip() {
    let r=request(); let v=ok(&r);
    assert_eq!(v["input"], r);
    assert_eq!(v["supportReport"]["options"], r["adapterOptions"]);
    assert_eq!(v["supportReport"]["components"][1]["source"], r["vehicle"]["components"][1]);
    assert_eq!(v["supportReport"]["components"][2]["role"]["hostComponentId"], "tube");
    near(f(&v["supportReport"]["components"][2]["role"]["geometry"]["rootLeStationM"]),1.4);
    assert_eq!(v["supportReport"]["components"][0]["role"]["profile"]["kind"],"cone");
    assert_eq!(v["supportReport"]["components"][0]["role"]["integration"]["method"],"Analytic");
    assert_eq!(v["empiricalQualificationByQuantity"]["staticForce"],"unqualified");
    assert_eq!(v["rateSupport"],"notModeledStaticOnly");
    assert!(v["rateCoefficientsAtDatum"].is_null());
    assert!(v["rateLoadsAtCg"].is_null());assert!(v["totalDynamicLoadsAtCg"].is_null());
    let roundtrip=ok(&serde_json::from_str::<Value>(&v["input"].to_string()).unwrap());
    assert_eq!(v,roundtrip);
}
#[test]
fn signed_pitch_yaw_and_exact_power_identity_survive_dispatch() {
    for x in [-1.0_f64,1.0] { for z in [-2.0_f64,2.0] {
        let mut r=request();r["state"]["relativeVelocityAtCgBMps"]=json!({"x":x,"y":100.0,"z":z});
        let v=ok(&r);let c=f(&v["normalDerivativesAtZeroIncidence"]["cPerRad"]);
        let j=f(&v["normalDerivativesAtZeroIncidence"]["jMPerRad"]);
        let alpha=f(&v["flow"]["angles"]["alphaRad"]);let beta=f(&v["flow"]["angles"]["betaRad"]);
        let cf=&v["staticCoefficientsAtDatum"]["cfB"];let cm=&v["staticCoefficientsAtDatum"]["cmB"];
        near(f(&cf["x"]),-c*beta);near(f(&cf["z"]),-c*alpha);
        near(f(&cm["x"]),j*alpha/0.1);near(f(&cm["z"]),-j*beta/0.1);
        assert_eq!(f(&cf["x"]).signum(),-x.signum());assert_eq!(f(&cf["z"]).signum(),-z.signum());
        let force=&v["staticLoadsAtCg"]["forceBN"];
        let power=f(&force["x"])*x+f(&force["y"])*100.0+f(&force["z"])*z;
        near(power,-f(&v["flow"]["dynamicPressurePa"])*f(&v["references"]["areaM2"])*f(&v["flow"]["speedMps"])*f(&v["windCoefficients"]["cdWind"]));
    }}
}
#[test]
fn independent_datum_cg_and_prescribed_ca0_do_not_change_normal_derivatives() {
    let r=request();let a=ok(&r);let mut moved=r.clone();
    moved["state"]["cgPositionFromNoseBM"]=json!({"x":0.2,"y":-1.2,"z":-0.1});let b=ok(&moved);
    assert_eq!(a["staticCoefficientsAtDatum"],b["staticCoefficientsAtDatum"]);
    assert_ne!(a["staticLoadsAtCg"]["momentBNm"],b["staticLoadsAtCg"]["momentBNm"]);
    moved["datumPositionFromNoseBM"]=json!({"x":0.4,"y":-0.8,"z":0.3});let d=ok(&moved);
    for axis in ["x","y","z"] { near(f(&b["staticLoadsAtCg"]["momentBNm"][axis]),f(&d["staticLoadsAtCg"]["momentBNm"][axis])); }
    assert_ne!(b["staticCoefficientsAtDatum"]["cmB"],d["staticCoefficientsAtDatum"]["cmB"]);
    moved["axial"]["ca0"]=json!(0.7);let axial=ok(&moved);
    assert_eq!(d["normalDerivativesAtZeroIncidence"],axial["normalDerivativesAtZeroIncidence"]);
    assert_eq!(d["cp"],axial["cp"]);
    assert_ne!(d["windCoefficients"],axial["windCoefficients"]);
}
#[test]
fn zero_speed_null_flow_coefficients_zero_static_loads_and_unknown_rates() {
    let mut r=request();r["state"]["relativeVelocityAtCgBMps"]=json!({"x":0,"y":0,"z":0});
    for rates in [json!({"x":0,"y":0,"z":0}),json!({"x":0.1,"y":0.2,"z":0.3})] {
        r["state"]["omegaBRadps"]=rates;let v=ok(&r);
        assert_eq!(v["computationalStatus"],"zeroSpeedStaticLoadsOnly");
        for key in ["staticCoefficientsAtDatum","staticCoefficientsAtCg","windCoefficients","rateLoadsAtCg","totalDynamicLoadsAtCg"] { assert!(v[key].is_null(),"{key}"); }
        for key in ["angles","windBasisBW","reducedRatesB"] { assert!(v["flow"][key].is_null(),"{key}"); }
        for key in ["forceBN","momentBNm"] { for axis in ["x","y","z"] { near(f(&v["staticLoadsAtCg"][key][axis]),0.0); } }
        assert!(v["cp"]["stationFromNoseM"].is_number());
    }
}
#[test]
fn nonzero_rates_are_retained_but_never_fabricate_rate_or_total_loads() {
    let mut r=request();let a=ok(&r);r["state"]["omegaBRadps"]=json!({"x":0.1,"y":-0.2,"z":0.3});let b=ok(&r);
    assert_eq!(a["staticLoadsAtCg"],b["staticLoadsAtCg"]);
    assert!(b["rateCoefficientsAtDatum"].is_null());assert!(b["rateLoadsAtCg"].is_null());assert!(b["totalDynamicLoadsAtCg"].is_null());
    near(f(&b["flow"]["reducedRatesB"]["y"]),-0.2*0.1/(2.0*f(&b["flow"]["speedMps"])));
}
#[test]
fn unsupported_state_and_geometry_have_errors_without_fallback() {
    for mach in [-0.1,0.8,1.0] { let mut r=request();r["state"]["mach"]=json!(mach);error(&r,"unsupported_model_domain"); }
    for velocity in [json!({"x":0,"y":-100,"z":0}),json!({"x":100,"y":0,"z":0}),json!({"x":0,"y":100,"z":10})] {
        let mut r=request();r["state"]["relativeVelocityAtCgBMps"]=velocity;error(&r,"unsupported_model_domain");
    }
    let mut r=request();r["vehicle"]["components"][0]["shape"]=json!("parabolic");error(&r,"unsupported_geometry");
    let mut r=request();r["state"]["densityKgM3"]=json!(-1);error(&r,"invalid_input");
    let mut r=request();r["axial"]["ca0"]=json!(-1);error(&r,"invalid_input");
    let mut r=request();r["state"]["omegaBRadps"]["x"]=Value::Null;error(&r,"invalid type");
    let raw=include_str!("fixtures/sb1-diagnostic-request.json").replace("\"mach\":0.3","\"mach\":1e999");
    let response:Value=serde_json::from_str(&dispatch_json("evaluate_sb1_diagnostic",&raw)).unwrap();
    assert!(response["error"].as_str().unwrap().contains("number out of range"));
}
#[test]
fn every_option_is_explicit_and_unknown_keys_fail_before_typed_dto() {
    for key in ["sourceIdentity","declarations","ogiveInterpretation","transitionInterpretation","aftTermination","internalNonGeometryIds","quadrature"] {
        let mut r=request();r["adapterOptions"].as_object_mut().unwrap().remove(key);error(&r,"missing field");
    }
    for (pointer,key) in [("","extra"),("/state","rateProviderId"),("/adapterOptions","extra"),("/adapterOptions/declarations","extra"),("/adapterOptions/quadrature","extra"),("/axial","extra"),("/cpPolicy","extra"),("/datumPositionFromNoseBM","extra"),("/vehicle","externalAttachments"),("/vehicle/components/0","tipRadius")] {
        let mut r=request();r.pointer_mut(pointer).unwrap().as_object_mut().unwrap().insert(key.into(),json!(true));error(&r,"unknown field");
    }
    let mut r=request();r["vehicle"]["components"][2]["points"]=json!([{"x":0,"y":0,"unknown":1}]);error(&r,"unknown field");
    let mut r=request();r["adapterOptions"]["declarations"]["sharpPhysicalTip"]=json!(false);error(&r,"explicit physical support declarations");
}
#[test]
fn cp_policy_and_uncertainty_are_explicit_retaining_moments_and_sums() {
    let mut r=request();let a=ok(&r);let c=f(&a["cp"]["sums"]["cPerRad"]);
    assert_eq!(a["cp"]["policyId"],astraea_core::aero_coefficients::CP_CANCELLATION_POLICY_ID);
    assert!(a["cp"]["unavailableReason"].is_null());
    r["cpPolicy"]["denominatorUncertainty"]=json!({"kind":"interval","lower":-1.0,"upper":c+1.0,"evidenceIdentity":"synthetic-interval-only"});
    let b=ok(&r);assert!(b["cp"]["stationFromNoseM"].is_null());assert_eq!(b["cp"]["unavailableReason"],"uncertaintyContainsZero");
    assert_eq!(a["staticLoadsAtCg"],b["staticLoadsAtCg"]);assert_eq!(a["cp"]["sums"],b["cp"]["sums"]);
    r["cpPolicy"]["denominatorUncertainty"]["upper"]=json!(c-1.0);error(&r,"C interval must enclose");
    let mut r=request();r["cpPolicy"]["policyId"]=json!("none");error(&r,"unsupported explicit CP policyId");
    let mut r=request();r["cpPolicy"].as_object_mut().unwrap().remove("denominatorUncertainty");error(&r,"missing field");
}

#[test]
fn design_input_keys_pass_sb1_validation_and_roundtrip() {
    let mut r = request();
    r["vehicle"]["surfaceFinish"] = json!("Polished");
    r["vehicle"]["forceTurbulentFlow"] = json!(true);
    r["vehicle"]["nozzleExitDiameter"] = json!(0.02);
    r["vehicle"]["components"][1]["railGuideDiameter"] = json!(0.004);
    r["vehicle"]["components"][1]["railGuideHeight"] = json!(0.006);
    r["vehicle"]["components"][1]["launchLugDiameter"] = json!(0.005);
    r["vehicle"]["components"][1]["launchShoeArea"] = json!(0.001);
    r["vehicle"]["components"][2]["airfoilSection"] = json!("Double Wedge");
    r["vehicle"]["components"][2]["leadingEdgeBevel"] = json!(0.002);
    r["vehicle"]["components"][2]["trailingEdgeBevel"] = json!(0.003);
    r["vehicle"]["components"][2]["leadingEdgeRadius"] = json!(0.0015);
    let v = ok(&r);
    assert_eq!(v["input"], r);
    assert_eq!(v["supportReport"]["components"][1]["source"], r["vehicle"]["components"][1]);
    assert_eq!(v["supportReport"]["components"][2]["source"], r["vehicle"]["components"][2]);
}
