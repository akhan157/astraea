//! T1a opt-in imported total static wrench diagnostic; never a flight provider.
//! Source declarations are caller assertions, not evidence of qualification.
use astraea_core::aero_coefficients as core;
use serde::Deserialize;
use serde_json::{json, Value};
use std::f64::consts::PI;

pub const SCHEMA_VERSION: &str = "supplied-aero-static-diagnostic/1.0.0";
pub const CONVENTION_ID: &str = "canonical-body-total-P0/1.0.0";

#[derive(Clone, Copy, Deserialize)]
#[serde(deny_unknown_fields)]
struct Vector { x: f64, y: f64, z: f64 }
impl From<Vector> for core::Vec3 {
    fn from(v: Vector) -> Self { Self::new(v.x, v.y, v.z) }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct References { area_m2: f64, length_m: f64, diameter_m: f64 }
impl References {
    fn core(&self) -> core::References {
        core::References { area_m2:self.area_m2, length_m:self.length_m, diameter_m:self.diameter_m }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request { schema_version: String, input_identity: String, table: Table, query: Query }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Source { identity: String, description: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Conditions {
    beta_rad: f64,
    omega_b_radps: Vector,
    roll_rad: f64,
    reynolds_per_meter: f64,
    power_nozzle_condition: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Table {
    source: Source,
    geometry_identity: String,
    conditions_identity: String,
    convention_id: String,
    velocity_reference: String,
    references: References,
    datum_position_from_nose_b_m: Vector,
    fixed_conditions: Conditions,
    interpolation_policy: String,
    domain_policy: String,
    mach_axis: Vec<f64>,
    alpha_rad_axis: Vec<f64>,
    // Outer index is Mach, inner index is alpha. Every node has all six values.
    nodes: Vec<Vec<Node>>,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Node { cf_b: Vector, cm_b: Vector }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Query {
    source_identity: String,
    geometry_identity: String,
    conditions_identity: String,
    environment_identity: String,
    fixed_conditions: Conditions,
    mach: f64,
    alpha_rad: f64,
    density_kg_m3: f64,
    speed_mps: f64,
    target_references: References,
    target_datum_position_from_nose_b_m: Vector,
    cg_position_from_nose_b_m: Vector,
}

fn nonempty(s: &str, field: &str) -> Result<(), String> {
    if s.trim().is_empty() { Err(format!("invalid_input: {field} must be a nonempty caller identity/declaration")) } else { Ok(()) }
}
fn finite(values: &[f64], field: &str) -> Result<(), String> {
    if values.iter().all(|v| v.is_finite()) { Ok(()) } else { Err(format!("invalid_input: nonfinite {field}")) }
}
fn vector_finite(v: Vector, field: &str) -> Result<(), String> {
    finite(&[v.x,v.y,v.z],field)
}
fn core_error(e: core::Error) -> String { format!("invalid_input: core wrench/transform rejected evaluation: {e:?}") }
fn validate_conditions(c: &Conditions) -> Result<(), String> {
    finite(&[c.beta_rad,c.roll_rad,c.reynolds_per_meter],"fixed conditions")?;
    vector_finite(c.omega_b_radps,"omegaBRadps")?;
    nonempty(&c.power_nozzle_condition,"powerNozzleCondition")?;
    if c.beta_rad != 0.0 || c.omega_b_radps.x != 0.0 || c.omega_b_radps.y != 0.0 || c.omega_b_radps.z != 0.0 {
        return Err("unsupported_model_domain: this schema requires beta=0 and all three rates=0".into());
    }
    if c.reynolds_per_meter <= 0.0 { return Err("invalid_input: reynoldsPerMeter must be positive".into()); }
    Ok(())
}
fn conditions_match(a: &Conditions, b: &Conditions) -> bool {
    // beta and rates already validated as zero. Remaining conditions are fixed,
    // never interpolated, fuzzily matched, or normalized modulo a roll period.
    a.roll_rad == b.roll_rad && a.reynolds_per_meter == b.reynolds_per_meter
        && a.power_nozzle_condition == b.power_nozzle_condition
}
fn validate_axis(axis: &[f64], alpha: bool) -> Result<(), String> {
    if axis.len() < 2 { return Err("invalid_input: each rectilinear axis needs at least two nodes".into()); }
    finite(axis,"table axis")?;
    for &v in axis {
        if if alpha { v <= -PI || v > PI } else { v < 0.0 } {
            return Err("invalid_input: Mach must be nonnegative; alpha must satisfy -pi < alpha <= pi".into());
        }
    }
    for pair in axis.windows(2) {
        if pair[0] >= pair[1] || !(pair[1]-pair[0]).is_finite() {
            return Err("invalid_input: axes must be strictly increasing, unique, with finite spans".into());
        }
    }
    Ok(())
}
#[derive(Clone, Copy)]
struct Bracket { lo: usize, hi: usize, t: f64 }
fn bracket(axis: &[f64], value: f64, name: &str) -> Result<Bracket, String> {
    finite(&[value],name)?;
    match axis.binary_search_by(|v| v.partial_cmp(&value).expect("finite axis/query")) {
        Ok(i) => Ok(Bracket { lo:i, hi:i, t:0.0 }),
        Err(i) if i == 0 || i == axis.len() => Err(format!("unsupported_model_domain: {name} outside supplied grid; extrapolation refused")),
        Err(i) => Ok(Bracket { lo:i-1, hi:i, t:(value-axis[i-1])/(axis[i]-axis[i-1]) }),
    }
}
fn vector(v: core::Vec3) -> Value { json!({"x":v.x,"y":v.y,"z":v.z}) }
fn wrench(w: core::CoefficientWrench) -> Value { json!({"cfB":vector(w.cf_b),"cmB":vector(w.cm_b)}) }
fn dimensional(w: core::DimensionalWrench) -> Value { json!({"forceBN":vector(w.force_b_n),"momentBNm":vector(w.moment_b_nm)}) }
fn bracket_json(b: Bracket, axis: &[f64]) -> Value {
    json!({"lowerIndex":b.lo,"upperIndex":b.hi,"lowerValue":axis[b.lo],"upperValue":axis[b.hi],"lowerWeight":1.0-b.t,"upperWeight":b.t})
}

/// Evaluate one complete, caller-declared canonical static table. No source
/// convention transform, missing-data completion, derivative/CP inference, drag
/// addition, native model evaluation, or dynamic correction occurs here.
pub fn evaluate(raw: &Value) -> Result<Value, String> {
    let r: Request = serde_json::from_value(raw.clone()).map_err(|e| format!("evaluate_supplied_aero_diagnostic: invalid_input: {e}"))?;
    if r.schema_version != SCHEMA_VERSION { return Err("invalid_input: unsupported schemaVersion".into()); }
    nonempty(&r.input_identity,"inputIdentity")?;
    let t = &r.table;
    let q = &r.query;
    for (s,field) in [(&t.source.identity,"table.source.identity"),(&t.source.description,"table.source.description"),
        (&t.geometry_identity,"table.geometryIdentity"),(&t.conditions_identity,"table.conditionsIdentity"),
        (&q.source_identity,"query.sourceIdentity"),(&q.geometry_identity,"query.geometryIdentity"),
        (&q.conditions_identity,"query.conditionsIdentity"),(&q.environment_identity,"query.environmentIdentity")] {
        nonempty(s,field)?;
    }
    if t.convention_id != CONVENTION_ID { return Err("unsupported_model_domain: unidentified/noncanonical source convention; explicit reviewed transforms required outside this route".into()); }
    if t.velocity_reference != "CG" { return Err("unsupported_model_domain: only velocityReference=CG is supported".into()); }
    if t.interpolation_policy != "piecewise-bilinear" || t.domain_policy != "reject-outside-grid" {
        return Err("unsupported_model_domain: require piecewise-bilinear interpolation and reject-outside-grid domain policies".into());
    }
    validate_conditions(&t.fixed_conditions)?;
    validate_conditions(&q.fixed_conditions)?;
    if t.source.identity != q.source_identity || t.geometry_identity != q.geometry_identity || t.conditions_identity != q.conditions_identity || !conditions_match(&t.fixed_conditions,&q.fixed_conditions) {
        return Err("unsupported_model_domain: query must exactly match source/geometry/conditions identities and fixed roll/Re/power/nozzle conditions".into());
    }
    let source_refs = t.references.core();
    let target_refs = q.target_references.core();
    source_refs.validate().map_err(core_error)?;
    target_refs.validate().map_err(core_error)?;
    let force_scale = source_refs.area_m2 / target_refs.area_m2;
    let length_scale = source_refs.length_m / target_refs.length_m;
    let moment_scale = force_scale * length_scale;
    if [force_scale,length_scale,moment_scale].iter().any(|v| !v.is_finite() || *v <= 0.0) {
        return Err("invalid_input: reference conversion overflow/underflow".into());
    }
    for (v,field) in [(t.datum_position_from_nose_b_m,"source datum"),(q.target_datum_position_from_nose_b_m,"target datum"),(q.cg_position_from_nose_b_m,"CG")] {
        vector_finite(v,field)?;
    }
    validate_axis(&t.mach_axis,false)?;
    validate_axis(&t.alpha_rad_axis,true)?;
    if t.nodes.len() != t.mach_axis.len() || t.nodes.iter().any(|row| row.len() != t.alpha_rad_axis.len()) {
        return Err("invalid_input: complete nodes[Mach index][alpha index] dimensions required; no missing corners".into());
    }
    for row in &t.nodes { for node in row { vector_finite(node.cf_b,"node.cfB")?; vector_finite(node.cm_b,"node.cmB")?; } }
    finite(&[q.mach,q.alpha_rad,q.density_kg_m3,q.speed_mps],"query state")?;
    if q.density_kg_m3 <= 0.0 || q.speed_mps <= 0.0 {
        return Err("unsupported_model_domain: positive density and speed required; zero-speed flow angles are undefined".into());
    }
    let bm = bracket(&t.mach_axis,q.mach,"Mach")?;
    let ba = bracket(&t.alpha_rad_axis,q.alpha_rad,"alphaRad")?;
    let corners = [(bm.lo,ba.lo,(1.0-bm.t)*(1.0-ba.t)),(bm.lo,ba.hi,(1.0-bm.t)*ba.t),
        (bm.hi,ba.lo,bm.t*(1.0-ba.t)),(bm.hi,ba.hi,bm.t*ba.t)];
    let mut imported = core::CoefficientWrench { cf_b:core::Vec3::ZERO, cm_b:core::Vec3::ZERO };
    for &(i,j,w) in &corners {
        imported.cf_b = imported.cf_b.plus(core::Vec3::from(t.nodes[i][j].cf_b).scaled(w));
        imported.cm_b = imported.cm_b.plus(core::Vec3::from(t.nodes[i][j].cm_b).scaled(w));
    }
    let source_datum = core::Datum(t.datum_position_from_nose_b_m.into());
    let target_datum = core::Datum(q.target_datum_position_from_nose_b_m.into());
    let cg = core::Datum(q.cg_position_from_nose_b_m.into());
    let target = imported.translated(source_datum,target_datum,source_refs).map_err(core_error)?.rereferenced(source_refs,target_refs).map_err(core_error)?;
    let at_cg = target.translated(target_datum,cg,target_refs).map_err(core_error)?;
    let pressure = 0.5*q.density_kg_m3*q.speed_mps*q.speed_mps;
    if [pressure,pressure*target_refs.area_m2,pressure*target_refs.area_m2*target_refs.length_m].iter().any(|v| !v.is_finite() || *v <= 0.0) {
        return Err("invalid_input: dimensional scaling overflow/underflow".into());
    }
    let loads_target = target.dimensional(pressure,target_refs).map_err(core_error)?;
    let loads_cg = at_cg.dimensional(pressure,target_refs).map_err(core_error)?;
    let basis = core::WindBasis::from_angles(q.alpha_rad,0.0).map_err(core_error)?;
    let wind = basis.body_to_wind(target.cf_b).map_err(core_error)?;
    let velocity = core::Vec3::new(0.0,q.speed_mps*q.alpha_rad.cos(),q.speed_mps*q.alpha_rad.sin());
    if !velocity.is_finite() { return Err("invalid_input: velocity overflow".into()); }
    let corner_json: Vec<Value> = corners.iter().map(|&(i,j,w)| json!({"machIndex":i,"alphaIndex":j,"weight":w})).collect();
    Ok(json!({
        "schemaVersion":SCHEMA_VERSION,"providerId":"supplied-body-total-static-T1a/1.0.0",
        "computationalStatus":"supported-supplied-static-evaluation",
        "empiricalStatus":"unqualified-source-not-reviewed",
        "sourceDeclarationsStatus":"caller-assertions-only; imported agreement cannot qualify native aerodynamics",
        "input":raw,
        "definitions":{"axes":"right-handed B: +Y noseward, +X pitch axis, X cross Y = Z",
            "alpha":"atan2(vB.z,vB.y), radians; -pi < alpha <= pi","betaRad":0,
            "velocityConstruction":"vCG_B=(0,speed*cos(alpha),speed*sin(alpha))",
            "momentTranslation":"M_to=M_from+(r_from-r_to) cross F",
            "totalForce":"CF_B=F_aero_B/(q_inf*S); no separate drag is added",
            "independentMoment":"CM_B=M_static_B/(q_inf*S*L), independently supplied about source datum",
            "conditions":"Re/m, Mach, density and speed are supplied assertions; no atmosphere/viscosity consistency is inferred",
            "units":"SI; radians; force N; moment N*m; datum/CG positions B meters from nose"},
        "interpolation":{"policy":t.interpolation_policy,"domainPolicy":t.domain_policy,
            "machBracket":bracket_json(bm,&t.mach_axis),"alphaRadBracket":bracket_json(ba,&t.alpha_rad_axis),"corners":corner_json},
        "relativeVelocityAtCgBMps":vector(velocity),"dynamicPressurePa":pressure,
        "staticCoefficientsAtSourceDatumAndReferences":wrench(imported),
        "staticCoefficientsAtTargetDatum":wrench(target),"staticCoefficientsAtCg":wrench(at_cg),
        "staticDimensionalAtTargetDatum":dimensional(loads_target),"staticDimensionalAtCg":dimensional(loads_cg),
        "windCoefficientsAtTargetReferences":{"side":wind.side,"drag":wind.drag,"lift":wind.lift},
        "windBasisColumnsB":{"x":vector(basis.x),"y":vector(basis.y),"z":vector(basis.z)},
        "rateCoefficients":Value::Null,"rateDimensionalLoads":Value::Null,"totalDynamicLoads":Value::Null,
        "rateUnavailableReason":"static-only table; zero rates do not qualify a dynamic model",
        "derivatives":Value::Null,"cp":Value::Null,
        "derivativesCpUnavailableReason":"not supplied or inferred by this full-static-load route"
    }))
}
