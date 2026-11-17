//! L0 arm C (step-0 benchmark): calibrated drag with blank inputs (nose tipRadius
//! removed, no site temperature, no nozzle option) on the frozen R40 cohort.
//! Needs the frozen manifest outside Git; run explicitly:
//!   cargo test --offline -j 2 --manifest-path crates/astraea-engine/Cargo.toml --test l0_arm_c -- --ignored
use astraea_engine::{commands, models::{FrontendVehicle,FrontendMotor,FlightOptionsDto}};
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
#[test]
#[ignore = "needs the frozen R40 cohort manifest outside Git; run with --ignored"]
fn arm_c() {
 let bytes=std::fs::read("/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json").unwrap();
 assert_eq!(format!("{:x}",Sha256::digest(&bytes)),"3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5");
 let m:Value=serde_json::from_slice(&bytes).unwrap(); let mut rows=vec![];
 for e in m["entries"].as_array().unwrap() {
  let mut v=e["vehicle"].clone(); for c in v["components"].as_array_mut().unwrap() { if c["type"]=="nosecone" { c.as_object_mut().unwrap().remove("tipRadius"); } }
  let vehicle:FrontendVehicle=serde_json::from_value(v).unwrap(); let motor:FrontendMotor=serde_json::from_value(e["motor"].clone()).unwrap();
  let mut options:FlightOptionsDto=serde_json::from_value(e["options"].clone()).unwrap(); options.flight_drag_source=Some("calibrated".into());
  let f=commands::simulate_flight(vehicle,motor,options).unwrap(); rows.push(json!({"slug":e["slug"],"apogee":f.apogee_altitude}));
 }
 std::fs::create_dir_all(concat!(env!("CARGO_MANIFEST_DIR"),"/../../out/L0")).unwrap();
 std::fs::write(concat!(env!("CARGO_MANIFEST_DIR"),"/../../out/L0/native-c.json"),serde_json::to_string_pretty(&rows).unwrap()).unwrap();
}
