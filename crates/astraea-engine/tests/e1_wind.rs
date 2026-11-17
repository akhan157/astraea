//! External published-cohort regression: set ASTRAEA_E1_MANIFEST to the R40 manifest.
use astraea_engine::{commands, models::{FlightOptionsDto, FrontendMotor, FrontendVehicle}};
use sha2::{Digest, Sha256};
#[test]
#[ignore = "requires published cohort manifest stored outside the repository"]
fn full_metal_jacket_wind_uses_cross_phase_fill() {
    let bytes = std::fs::read(std::env::var("ASTRAEA_E1_MANIFEST").expect("manifest path")).unwrap();
    assert_eq!(format!("{:x}", Sha256::digest(&bytes)), "3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5");
    let manifest: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    for slug in ["full-metal-jacket1", "full-metal-jacket2"] {
        let e = manifest["entries"].as_array().unwrap().iter().find(|e| e["slug"] == slug).unwrap();
        let vehicle: FrontendVehicle = serde_json::from_value(e["vehicle"].clone()).unwrap();
        let motor: FrontendMotor = serde_json::from_value(e["motor"].clone()).unwrap();
        let mut options: FlightOptionsDto = serde_json::from_value(e["options"].clone()).unwrap();
        options.flight_drag_source = Some("calibrated".into());
        options.wind_speed_surface = Some(3.0);
        options.nozzle_exit_diameter = e["vehicle"]["nozzleExitDiameter"].as_f64();
        options.launch_site_temperature_c = Some(e["vehicle"]["launchSite"]["temperatureK"].as_f64().unwrap() - 273.15);
        let seam = commands::evidence_calibrated_tables(&vehicle, &motor, &options).unwrap().unwrap();
        assert!(seam.1.contains("cross-phase nearest fill"), "{}", seam.1);
        let result = commands::simulate_flight(vehicle, motor, options).unwrap();
        assert!(result.run_manifest["axialDrag"].as_str().unwrap().contains("cross-phase nearest fill"));
    }
}

#[test]
#[ignore = "requires published cohort manifest stored outside the repository"]
fn cohort_wind_sweep_23_by_5() {
    let bytes = std::fs::read(std::env::var("ASTRAEA_E1_MANIFEST").expect("manifest path")).unwrap();
    assert_eq!(format!("{:x}", Sha256::digest(&bytes)), "3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5");
    let manifest: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let entries = manifest["entries"].as_array().unwrap(); assert_eq!(entries.len(), 23);
    for e in entries {
        let vehicle: FrontendVehicle = serde_json::from_value(e["vehicle"].clone()).unwrap();
        let motor: FrontendMotor = serde_json::from_value(e["motor"].clone()).unwrap();
        for wind in [0.0, 3.0, 6.0, 9.0, 10.0] {
            let mut options: FlightOptionsDto = serde_json::from_value(e["options"].clone()).unwrap();
            options.flight_drag_source = Some("calibrated".into()); options.wind_speed_surface = Some(wind);
            options.nozzle_exit_diameter = e["vehicle"]["nozzleExitDiameter"].as_f64();
            options.launch_site_temperature_c = Some(e["vehicle"]["launchSite"]["temperatureK"].as_f64().unwrap() - 273.15);
            commands::simulate_flight(vehicle.clone(), motor.clone(), options).unwrap_or_else(|err| panic!("{} wind {wind}: {err}",e["slug"]));
        }
    }
}

#[test]
#[ignore = "requires published cohort manifest stored outside the repository"]
fn byrum_exact_aft_diameter_is_allowed() {
    let bytes = std::fs::read(std::env::var("ASTRAEA_E1_MANIFEST").expect("manifest path")).unwrap();
    assert_eq!(format!("{:x}", Sha256::digest(&bytes)), "3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5");
    let manifest: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let e = manifest["entries"].as_array().unwrap().iter().find(|e| e["slug"] == "byrum").unwrap();
    let mut v: FrontendVehicle = serde_json::from_value(e["vehicle"].clone()).unwrap();
    let aft = v.components.iter().rev().find_map(|c| if c.kind == "bodytube" { c.outer_diameter } else { None }).unwrap();
    assert_eq!(aft, 0.07619999999999999);
    v.nozzle_exit_diameter = Some(aft);
    let m: FrontendMotor = serde_json::from_value(e["motor"].clone()).unwrap();
    let mut o: FlightOptionsDto = serde_json::from_value(e["options"].clone()).unwrap(); o.nozzle_exit_diameter = Some(aft);
    assert!(commands::simulate_flight(v.clone(),m,o.clone()).is_ok());
    o.nozzle_exit_diameter = Some(f64::from_bits(aft.to_bits() + 1));
    let error = astraea_engine::models::validate_nozzle_geometry(&v, &o).unwrap_err();
    println!("{error}");
    assert!(error.contains("options.nozzleExitDiameter 0.0762 m"), "{error}");
    assert!(error.contains("0..=0.07619999999999999 m (aft-body diameter)"), "{error}");
}

#[test]
#[ignore = "requires published cohort manifest stored outside the repository"]
fn calisp1_motor_beyond_mount_returns_error() {
    let bytes = std::fs::read(std::env::var("ASTRAEA_E1_MANIFEST").unwrap()).unwrap();
    assert_eq!(format!("{:x}", Sha256::digest(&bytes)), "3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5");
    let manifest: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let e = manifest["entries"].as_array().unwrap().iter().find(|e| e["slug"] == "calisp1").unwrap();
    let vehicle: FrontendVehicle = serde_json::from_value(e["vehicle"].clone()).unwrap();
    let mut motor: FrontendMotor = serde_json::from_value(e["motor"].clone()).unwrap();
    let options: FlightOptionsDto = serde_json::from_value(e["options"].clone()).unwrap();
    motor.length = 1.55;
    let result = std::panic::catch_unwind(|| commands::simulate_flight(vehicle, motor, options));
    let error = result.expect("must not panic").unwrap_err();
    assert!(error.contains("motor forward end") && error.contains("outside the vehicle"), "{error}");
}

#[test]
#[ignore = "requires published cohort manifest stored outside the repository"]
fn zero_impulse_refused_by_all_legacy_commands() {
    let bytes = std::fs::read(std::env::var("ASTRAEA_E1_MANIFEST").unwrap()).unwrap();
    assert_eq!(format!("{:x}", Sha256::digest(&bytes)), "3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5");
    let manifest: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    let e = manifest["entries"].as_array().unwrap().iter().find(|e| e["slug"] == "calisp1").unwrap();
    let mut motor = e["motor"].clone();
    motor["thrustCurve"] = serde_json::json!([{ "time":0, "thrust":0 },{ "time":1.88, "thrust":0 }]);
    motor["maxThrust"] = serde_json::json!(0);
    let args = serde_json::json!({"vehicle":e["vehicle"],"motor":motor,"options":e["options"]});
    let req = serde_json::json!({"vehicle":e["vehicle"],"motor":motor,"options":e["options"],"sigmas":{},"nRuns":1,"seed":1,"version":"per-run-v2","runStart":0,"runEnd":1});
    for cmd in ["simulate_flight", "flight_summary", "run_ensemble", "run_ensemble_classified", "run_ensemble_chunk"] {
        let input = if cmd.starts_with("run_ensemble") { serde_json::json!({"req":req}) } else { args.clone() };
        let result = std::panic::catch_unwind(|| astraea_engine::dispatch(cmd, &input));
        let error = result.unwrap_or_else(|_| panic!("{cmd} panicked")).unwrap_err();
        assert!(error.contains("motor thrust curve must deliver a finite positive total impulse (got 0)"), "{cmd}: {error}");
    }
}
