//! Native-only JSON inspector of actual production preparation and local loads.
//! Input: {vehicle, motor, samples:[{state:{r,v,q,w},time,options:{...}}]}.
//! Also returns actual native stability/curve outputs for the identical vehicle.
//! Errors are emitted explicitly per sample; no undefined CP is serialized.
use astraea_core::six_dof::{Quat, RigidState, Vec3};
use astraea_engine::{commands, models::{FlightOptionsDto, FrontendMotor, FrontendVehicle}};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::Read;

#[derive(Deserialize)]
struct Input { vehicle: FrontendVehicle, motor: FrontendMotor, samples: Vec<Sample> }
#[derive(Deserialize)]
struct Sample { state: State, time: f64, options: FlightOptionsDto }
#[derive(Deserialize)]
struct V { x: f64, y: f64, z: f64 }
#[derive(Deserialize)]
struct Q { w: f64, x: f64, y: f64, z: f64 }
#[derive(Deserialize)]
struct State { r: V, v: V, q: Q, w: V }
fn vec(v: &V) -> Vec3 { Vec3 { x: v.x, y: v.y, z: v.z } }
fn jvec(v: Vec3) -> Value { json!({"x":v.x,"y":v.y,"z":v.z}) }
fn run() -> Result<Value, String> {
    let path = std::env::args().nth(1);
    let data = if let Some(p) = path { std::fs::read_to_string(p).map_err(|e|e.to_string())? }
        else { let mut s=String::new(); std::io::stdin().read_to_string(&mut s).map_err(|e|e.to_string())?; s };
    let input: Input = serde_json::from_str(&data).map_err(|e|e.to_string())?;
    let rows: Vec<Value> = input.samples.iter().map(|s| {
        let st = RigidState { r: vec(&s.state.r), v: vec(&s.state.v), w: vec(&s.state.w),
            q: Quat {w:s.state.q.w,x:s.state.q.x,y:s.state.q.y,z:s.state.q.z} };
        match commands::diagnose_flight_loads(&input.vehicle,&input.motor,&st,s.time,&s.options) {
            Err(e) => json!({"error":e}),
            Ok(d) => json!({"modelId":d.model_id,"cnaBody":d.cna_body,"cnaFins":d.cna_fins,
                "bodyFirstMoment":d.body_first_moment,"finFirstMoment":d.fin_first_moment,
                "cna":d.cna,"firstMoment":d.first_moment,"cpM":d.cp,"combinedCgM":d.combined_cg,
                "referenceAreaM2":d.ref_area,"referenceDiameterM":d.ref_diameter,
                "mach":d.mach,"alphaTotalDeg":d.alpha_total_deg,"qInfPa":d.q_inf,
                "dragWindAxisN":d.drag_wind_axis,"aeroForceBodyN":jvec(d.aero_force_body),
                "staticMomentBodyNm":jvec(d.static_moment_body),"dampingMomentBodyNm":jvec(d.damping_moment_body),
                "totalMomentBodyNm":jvec(d.total_moment_body),"validity":format!("{:?}",d.validity),
                "recovery":d.recovery,"railBound":d.rail_bound,"powered":d.powered})
        }
    }).collect();
    Ok(json!({"conventions":{"cpDatum":"meters aft of nose","forceAxes":"body +Y noseward",
        "normalModel":"added normal contribution alongside wind-axis drag; same CP arm on full lateral force"},
        "samples":rows,
        "stability":commands::stability(input.vehicle.clone(), None)?,
        "curves":commands::aero_curves(input.vehicle,false, None)?}))
}
fn main() {
    match run() { Ok(v)=>println!("{}",v), Err(e)=>{ eprintln!("{}",e);std::process::exit(1); } }
}
