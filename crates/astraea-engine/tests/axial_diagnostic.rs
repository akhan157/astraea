//! Portable native-only synthetic boundary checks; not measured drag/flight data.
use astraea_engine::{axial_diagnostic::evaluate, dispatch};
use serde_json::{json, Value};
fn request() -> Value { serde_json::from_str(include_str!("fixtures/axial-synthetic-request.json")).unwrap() }
fn number(v: &Value) -> f64 { v.as_f64().unwrap() }
fn near(a: f64,b: f64) { assert!((a-b).abs()<2e-12*b.abs().max(1e-15),"{a} != {b}"); }

#[test]
fn native_total_has_explicit_sources_effective_inputs_and_no_app_exposure() {
    let input=request(); let out=evaluate(&input).unwrap();
    assert_eq!(out["input"],input);
    assert_eq!(out["environment"]["input"],input["environment"]);
    assert_eq!(out["empiricalQualification"],"unqualified");
    assert_eq!(out["dynamicQualification"],"not-modeled");
    assert_eq!(out["sourceLedger"]["cachePolicy"],"direct-only-no-axial-cache");
    assert_eq!(out["components"].as_array().unwrap().len(),7);
    let sum=out["components"].as_array().unwrap().iter().map(|c|number(&c["ca0"])).sum::<f64>();
    assert_eq!(number(&out["totalCa0"]),sum);
    let resistance=out["components"].as_array().unwrap().iter().map(|c|number(&c["axialResistanceN"])).sum::<f64>();
    assert_eq!(number(&out["axialForceBodyN"][1]),-resistance);
    near(resistance,number(&out["environment"]["flow"]["dynamicPressurePa"])*0.02*sum);
    assert!(dispatch("evaluate_native_total_axial",&input).unwrap_err().contains("unknown command"));
    assert!(dispatch("evaluate_total_axial_diagnostic",&input).is_err());
}

#[test]
fn every_nested_unknown_field_and_missing_declaration_refuses() {
    for path in ["", "/source", "/geometry", "/geometry/bodyFriction", "/geometry/fins/0", "/geometry/fins/0/friction", "/environment", "/environment/profile", "/environment/profile/source", "/environment/profile/location", "/environment/profile/validity", "/environment/profile/units", "/environment/profile/knots/0", "/environment/profile/knots/0/windTowardEnuMps", "/environment/query", "/environment/query/groundVelocityEnuMps", "/environment/surfaces/0"] {
        let mut x=request(); x.pointer_mut(path).unwrap().as_object_mut().unwrap().insert("typo".into(),json!(1));
        assert!(evaluate(&x).unwrap_err().contains("unknown field"),"{path}");
    }
    for (path,key) in [("","power"),("","powerPolicy"),("/geometry","configuration"),("/geometry","frictionCoverage"),("/geometry","bodyFriction"),("/geometry","fins"),("/geometry/fins/0","sweepLengthM"),("/source","description")] {
        let mut x=request(); x.pointer_mut(path).unwrap().as_object_mut().unwrap().remove(key);
        assert!(evaluate(&x).is_err(),"{path}:{key}");
    }
    for (path,value) in [("/geometry/configuration",json!("boattail")),("/geometry/frictionCoverage",json!("cylinder-only")),("/geometry/fins/0/count",json!(3.5)),("/geometry/bodyDiameterM",json!(0.0099)),("/geometry/referenceAreaM2",json!(0.000099)),("/geometry/noseLengthM",Value::Null),("/source/geometryIdentity",json!("mismatch")),("/source/conditionIdentity",json!("mismatch")),("/environment/surfaces/1/lengthM",json!(0.26)),("/powerPolicy",json!("infer"))] {
        let mut x=request(); *x.pointer_mut(path).unwrap()=value; assert!(evaluate(&x).is_err(),"{path}");
    }
}

#[test]
fn profile_time_msl_units_and_toward_wind_are_actually_consumed() {
    let x=request(); let out=evaluate(&x).unwrap();
    assert_eq!(out["environment"]["flow"]["airRelativeVelocityEnuMps"],json!({"east":30.0,"north":40.0,"up":0.0}));
    near(number(&out["environment"]["sample"]["pressurePa"]),50000.0);
    assert_eq!(out["environment"]["sample"]["temperatureK"],250.0);
    for (path,value) in [("/environment/query/altitudeDatum",json!("agl")),("/environment/profile/units/pressure",json!("hPa")),("/environment/query/timeUtcUnixS",json!(1792965599_i64)),("/environment/query/timeUtcUnixS",json!(1792969201_i64)),("/environment/query/altitudeM",json!(1000.0001)),("/environment/query/altitudeM",json!(-0.001)),("/environment/profile/knots",json!([]))] {
        let mut bad=x.clone(); *bad.pointer_mut(path).unwrap()=value; assert!(evaluate(&bad).is_err(),"{path}");
    }
    for t in [1792965600_i64,1792969200_i64] {
        let mut endpoint=x.clone(); endpoint["environment"]["query"]["timeUtcUnixS"]=json!(t); assert!(evaluate(&endpoint).is_ok());
    }
    // Evidence class remains a declaration, not a qualification switch.
    let mut x=x; x["environment"]["profile"]["source"]["evidenceClass"]=json!("observed");
    assert_eq!(evaluate(&x).unwrap()["empiricalQualification"],"unqualified");
}

#[test]
fn same_mach_different_pressure_changes_friction_not_pressure_coefficients() {
    let mut x=request();
    for k in x["environment"]["profile"]["knots"].as_array_mut().unwrap() {
        k["temperatureK"]=json!(300.0); k["windTowardEnuMps"]=json!({"east":0.0,"north":0.0,"up":0.0});
    }
    x["environment"]["query"]["altitudeM"]=json!(0.0);
    let a=evaluate(&x).unwrap();
    x["environment"]["query"]["altitudeM"]=json!(1000.0);
    let b=evaluate(&x).unwrap();
    assert_eq!(a["environment"]["flow"]["mach"],b["environment"]["flow"]["mach"]);
    near(number(&a["environment"]["flow"]["reynoldsPerM"]),4.0*number(&b["environment"]["flow"]["reynoldsPerM"]));
    assert!(number(&b["totalCa0"])>number(&a["totalCa0"]));
    for (c,d) in a["components"].as_array().unwrap().iter().zip(b["components"].as_array().unwrap()) {
        if !c["identity"].as_str().unwrap().starts_with("friction:") { assert_eq!(c["ca0"],d["ca0"]); }
    }
}

#[test]
fn zero_low_re_mach_and_power_boundaries_fail_closed_without_cached_results() {
    let mut x=request();
    x["environment"]["query"]["groundVelocityEnuMps"]=json!({"east":4.0,"north":2.0,"up":-1.0});
    let r=evaluate(&x).unwrap(); assert_eq!(r["totalCa0"],Value::Null);
    assert_eq!(r["axialForceBodyN"],json!([0.0,-0.0,0.0])); assert!(r["unavailableReason"].is_string());
    for c in r["components"].as_array().unwrap() { assert!(c["ca0"].is_null()); assert_eq!(c["axialResistanceN"],0.0); }
    x["powerPolicy"]=json!("coast-only"); x["power"]=json!("powered");
    assert!(evaluate(&x).unwrap_err().contains("powered flow requires"));
    x["power"]=json!("coast"); x["environment"]["query"]["groundVelocityEnuMps"]["east"]=json!(4.000001);
    assert!(evaluate(&x).unwrap_err().contains("no floor"));
    let mut x=request(); x["environment"]["query"]["groundVelocityEnuMps"]["east"]=json!(1000.0);
    assert!(evaluate(&x).unwrap_err().contains("0<=Mach<.8"));
    let a=request(); let before=evaluate(&a).unwrap();
    let mut changed=a.clone(); changed["geometry"]["referenceAreaM2"]=json!(0.08);
    let b=evaluate(&changed).unwrap(); near(number(&before["totalCa0"]),4.0*number(&b["totalCa0"]));
    for i in 0..3 { near(number(&before["axialForceBodyN"][i]),number(&b["axialForceBodyN"][i])); }
    assert_eq!(evaluate(&a).unwrap(),before);
}
