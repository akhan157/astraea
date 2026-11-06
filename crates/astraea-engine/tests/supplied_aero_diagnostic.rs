//! Independent algebra checks of the actual JSON dispatch route. Synthetic only.
use astraea_engine::{dispatch, dispatch_json};
use serde_json::{json, Value};
const CMD: &str = "evaluate_supplied_aero_diagnostic";
fn fixture() -> Value { serde_json::from_str(include_str!("fixtures/supplied-aero-diagnostic-request.json")).unwrap() }
fn run(r: &Value) -> Value { dispatch(CMD,r).expect("supported synthetic table") }
fn close(a: f64,b: f64) { assert!((a-b).abs() <= 1e-11*(1.0+a.abs().max(b.abs())),"{a} != {b}"); }
fn number(v: &Value) -> f64 { v.as_f64().unwrap() }
fn vec(v: &Value) -> [f64;3] { [number(&v["x"]),number(&v["y"]),number(&v["z"])] }
fn assert_vec(v: &Value,expected: [f64;3]) { for (a,b) in vec(v).into_iter().zip(expected) { close(a,b); } }
fn rejected(r: &Value,reason: &str) { let error = dispatch(CMD,r).unwrap_err(); assert!(error.contains(reason),"{error}"); }
fn cross(a:[f64;3],b:[f64;3])->[f64;3] { [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]] }

#[test]
fn bilinear_interior_full_wrench_and_bracket_trace() {
    let r=fixture(); let o=run(&r);
    assert_vec(&o["staticCoefficientsAtSourceDatumAndReferences"]["cfB"],[3.,-4.,-7.]);
    // CM.x includes a nonzero Mach*alpha interaction: the upper-right
    // corner is 14 rather than the affine continuation 10.
    assert_vec(&o["staticCoefficientsAtSourceDatumAndReferences"]["cmB"],[5.,7.,9.5]);
    close(number(&o["interpolation"]["machBracket"]["upperWeight"]),0.25);
    close(number(&o["interpolation"]["alphaRadBracket"]["upperWeight"]),0.5);
    let weights:Vec<f64>=o["interpolation"]["corners"].as_array().unwrap().iter().map(|c|number(&c["weight"])).collect();
    assert_eq!(weights,vec![0.375,0.375,0.125,0.125]);
    assert_vec(&o["staticDimensionalAtCg"]["forceBN"],[360.,-480.,-840.]);
    assert_vec(&o["staticDimensionalAtCg"]["momentBNm"],[1368.,2784.,3084.]);
    assert_eq!(o["empiricalStatus"],"unqualified-source-not-reviewed");
    assert_eq!(o["input"],r);
    for k in ["rateCoefficients","rateDimensionalLoads","totalDynamicLoads","derivatives","cp"] { assert!(o[k].is_null()); }
}
#[test]
fn inclusive_corners_edges_and_exact_internal_nodes() {
    let base=fixture();
    for (i,m) in [0.5,2.5].into_iter().enumerate() { for (j,a) in [-0.2,0.6].into_iter().enumerate() {
        let mut r=base.clone(); r["query"]["mach"]=json!(m); r["query"]["alphaRad"]=json!(a);
        let o=run(&r);
        for key in ["cfB","cmB"] { assert_vec(&o["staticCoefficientsAtSourceDatumAndReferences"][key],vec(&base["table"]["nodes"][i][j][key])); }
        assert_eq!(o["interpolation"]["machBracket"]["lowerIndex"],json!(i));
        assert_eq!(o["interpolation"]["machBracket"]["upperIndex"],json!(i));
    }}
    let mut r=base.clone(); r["query"]["mach"]=json!(0.5);
    assert_vec(&run(&r)["staticCoefficientsAtSourceDatumAndReferences"]["cfB"],[2.,-3.,-5.]);
    // Add a complete interior row and test a query exactly on that row.
    let row=json!([{ "cfB":{"x":3,"y":-4,"z":-7},"cmB":{"x":5,"y":7,"z":9}},
        {"cfB":{"x":5,"y":-6,"z":-11},"cmB":{"x":7,"y":11,"z":15}}]);
    r["table"]["machAxis"]=json!([0.5,1.5,2.5]);
    r["table"]["nodes"].as_array_mut().unwrap().insert(1,row);
    r["query"]["mach"]=json!(1.5); let o=run(&r);
    assert_vec(&o["staticCoefficientsAtSourceDatumAndReferences"]["cfB"],[4.,-5.,-9.]);
    assert_eq!(o["interpolation"]["machBracket"]["lowerIndex"],1);
    assert_eq!(o["interpolation"]["machBracket"]["upperIndex"],1);
}
#[test]
fn independent_pure_couple_survives_zero_force_without_cp() {
    let mut r=fixture();
    for row in r["table"]["nodes"].as_array_mut().unwrap() { for n in row.as_array_mut().unwrap() {
        n["cfB"]=json!({"x":0,"y":0,"z":0}); n["cmB"]=json!({"x":2,"y":-3,"z":5});
    }}
    let o=run(&r);
    assert_vec(&o["staticDimensionalAtCg"]["forceBN"],[0.,0.,0.]);
    assert_vec(&o["staticDimensionalAtCg"]["momentBNm"],[720.,-1080.,1800.]);
    assert!(o["cp"].is_null());
}
#[test]
fn target_rescaling_and_full_off_axis_datum_preserve_cg_wrench() {
    let mut r=fixture(); let base=run(&r);
    r["query"]["targetReferences"]=json!({"areaM2":10,"lengthM":0.75,"diameterM":2});
    r["query"]["targetDatumPositionFromNoseBM"]=json!({"x":-2,"y":1,"z":0.8});
    let o=run(&r);
    for key in ["forceBN","momentBNm"] { assert_vec(&o["staticDimensionalAtCg"][key],vec(&base["staticDimensionalAtCg"][key])); }
    assert_vec(&o["staticCoefficientsAtTargetDatum"]["cfB"],[0.6,-0.8,-1.4]);
    // Independently rewrite every source node at another full 3D datum and S/L.
    // Source old S=2,L=3; new S=5,L=2. New datum=(-.6,.2,-.7).
    let delta=[0.8,-0.6,1.0];
    for row in r["table"]["nodes"].as_array_mut().unwrap() { for n in row.as_array_mut().unwrap() {
        let f=vec(&n["cfB"]);let m=vec(&n["cmB"]);let shift=cross(delta,f);
        n["cfB"]=json!({"x":f[0]*0.4,"y":f[1]*0.4,"z":f[2]*0.4});
        n["cmB"]=json!({"x":m[0]*0.6+shift[0]*0.2,"y":m[1]*0.6+shift[1]*0.2,"z":m[2]*0.6+shift[2]*0.2});
    }}
    r["table"]["references"]=json!({"areaM2":5,"lengthM":2,"diameterM":0.1});
    r["table"]["datumPositionFromNoseBM"]=json!({"x":-0.6,"y":0.2,"z":-0.7});
    let rewritten=run(&r);
    for key in ["forceBN","momentBNm"] { assert_vec(&rewritten["staticDimensionalAtCg"][key],vec(&base["staticDimensionalAtCg"][key])); }
}
#[test]
fn total_body_force_is_not_augmented_by_wind_drag() {
    let o=run(&fixture());
    let velocity=vec(&o["relativeVelocityAtCgBMps"]);
    close(velocity[0],0.);close(velocity[1],10.*0.2_f64.cos());close(velocity[2],10.*0.2_f64.sin());
    let f=vec(&o["staticDimensionalAtCg"]["forceBN"]);
    let power:f64=f.into_iter().zip(velocity).map(|(a,b)|a*b).sum();
    let cd=number(&o["windCoefficientsAtTargetReferences"]["drag"]);
    close(cd,4.*0.2_f64.cos()+7.*0.2_f64.sin());
    close(power,-60.*2.*10.*cd);
}
#[test]
fn missing_null_partial_force_or_moment_and_drag_only_are_rejected() {
    for field in ["cfB","cmB"] {
        let mut r=fixture();r["table"]["nodes"][0][0].as_object_mut().unwrap().remove(field);rejected(&r,"missing field");
        let mut r=fixture();r["table"]["nodes"][0][0][field]=Value::Null;rejected(&r,"invalid type");
        let mut r=fixture();r["table"]["nodes"][0][0][field].as_object_mut().unwrap().remove("z");rejected(&r,"missing field");
    }
    let mut r=fixture();r["table"]["nodes"][0][0]=json!({"cd":0.5,"cp":1.2});rejected(&r,"unknown field");
}
#[test]
fn unknown_fields_at_every_schema_layer_are_rejected() {
    for path in ["","/table","/table/source","/table/references","/table/fixedConditions","/table/fixedConditions/omegaBRadps",
        "/table/datumPositionFromNoseBM","/table/nodes/0/0","/table/nodes/0/0/cmB","/query","/query/targetReferences","/query/fixedConditions"] {
        let mut r=fixture();r.pointer_mut(path).unwrap().as_object_mut().unwrap().insert("unknown".into(),json!(1));rejected(&r,"unknown field");
    }
}
#[test]
fn unidentified_conventions_references_and_unmatched_conditions_are_rejected() {
    for path in ["/table/source/identity","/table/source/description","/table/geometryIdentity","/table/conditionsIdentity","/query/environmentIdentity"] {
        let mut r=fixture();*r.pointer_mut(path).unwrap()=json!(" ");rejected(&r,"nonempty");
    }
    for path in ["/query/sourceIdentity","/query/geometryIdentity","/query/conditionsIdentity","/query/fixedConditions/rollRad","/query/fixedConditions/reynoldsPerMeter","/query/fixedConditions/powerNozzleCondition"] {
        let mut r=fixture();let v=r.pointer_mut(path).unwrap();*v=if v.is_string(){json!("other")}else{json!(2)};rejected(&r,"exactly match");
    }
    for (path,value,reason) in [("/table/conventionId",json!("vendor"),"convention"),("/table/velocityReference",json!("nose"),"velocityReference"),
        ("/table/interpolationPolicy",json!("nearest"),"policies"),("/table/domainPolicy",json!("clamp"),"policies"),
        ("/table/references/areaM2",json!(0),"positive"),("/query/targetReferences/lengthM",json!(-1),"positive"),
        ("/table/references/diameterM",json!(0),"positive"),("/query/fixedConditions/betaRad",json!(0.1),"beta=0"),
        ("/query/fixedConditions/omegaBRadps/y",json!(0.1),"rates=0")] {
        let mut r=fixture();*r.pointer_mut(path).unwrap()=value;rejected(&r,reason);
    }
    for path in ["/table/fixedConditions","/query/fixedConditions","/query/targetReferences","/table/velocityReference"] {
        let mut r=fixture();let (parent,key)=path.rsplit_once('/').unwrap();r.pointer_mut(parent).unwrap().as_object_mut().unwrap().remove(key);rejected(&r,"missing field");
    }
}
#[test]
fn malformed_grids_and_outside_queries_are_rejected_without_fallback() {
    for (path,value,reason) in [("/table/machAxis",json!([2.5,0.5]),"increasing"),("/table/machAxis",json!([0.5,0.5]),"unique"),
        ("/table/alphaRadAxis",json!([0.]),"two nodes"),("/table/machAxis",json!([-1.,2.5]),"nonnegative"),
        ("/table/alphaRadAxis",json!([-std::f64::consts::PI,0.6]),"alpha"),
        ("/table/nodes/0",json!([]),"dimensions"),("/query/mach",json!(2.5000001),"outside"),
        ("/query/alphaRad",json!(-0.2000001),"outside"),("/query/speedMps",json!(0),"zero-speed"),
        ("/query/densityKgM3",json!(-1),"positive")] {
        let mut r=fixture();*r.pointer_mut(path).unwrap()=value;rejected(&r,reason);
    }
    let mut r=fixture();r["table"]["nodes"].as_array_mut().unwrap().pop();rejected(&r,"dimensions");
    let raw=serde_json::to_string(&fixture()).unwrap().replace("2.5","1e999");
    assert!(serde_json::from_str::<Value>(&dispatch_json(CMD,&raw)).unwrap().get("error").is_some());
}
#[test]
fn supplied_route_has_no_sb1_mach_or_incidence_caps() {
    let mut r=fixture();r["table"]["alphaRadAxis"]=json!([0.5,std::f64::consts::PI]);
    r["query"]["mach"]=json!(2.5);r["query"]["alphaRad"]=json!(std::f64::consts::PI);
    let o=run(&r);assert_eq!(o["computationalStatus"],"supported-supplied-static-evaluation");
    assert_vec(&o["staticCoefficientsAtSourceDatumAndReferences"]["cfB"],[7.,-8.,-15.]);
}

#[test]
fn numerical_overflow_underflow_and_nonfinite_components_are_rejected() {
    let mut r=fixture();r["table"]["references"]["areaM2"]=json!(1e-300);
    r["query"]["targetReferences"]["areaM2"]=json!(1e300);rejected(&r,"reference conversion");
    let mut r=fixture();r["table"]["references"]["lengthM"]=json!(1e300);
    r["query"]["targetReferences"]["lengthM"]=json!(1e-300);rejected(&r,"reference conversion");
    let mut r=fixture();r["query"]["speedMps"]=json!(1e300);rejected(&r,"dimensional scaling");
    let mut r=fixture();r["query"]["speedMps"]=json!(1e-300);rejected(&r,"dimensional scaling");
    let mut r=fixture();r["table"]["nodes"][0][0]["cfB"]["x"]=Value::Null;rejected(&r,"invalid type");
    let mut r=fixture();r["query"]["targetDatumPositionFromNoseBM"]["x"]=Value::Null;rejected(&r,"invalid type");
}
