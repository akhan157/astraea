//! R44 — calibrated axial drag on the product flight path, opt-in (test only;
//! the frozen cohort and development DTOs are read through the environment and
//! never committed).
//!
//! Gate 1 is `docs/internal/execution-runs/R44-calibrated-flight-drag/GATE1.md`
//! (approved in `GATE1-REVIEW.md`), frozen in `pre_registration.json` and
//! amended by `PREREG-AMENDMENT-1.md` (ensemble ladder statement).
//!
//! Six tests, one always-run and five `#[ignore]`d evidence runs:
//!
//! 1. `validation`      — always run: field freeze, refusal texts, manifest
//!    texts, tip-radius validation and carry, and the legacy resolver building
//!    no table at all.
//! 2. `neutrality`      — N1/N2/N3/N6: the 23 frozen R40 DTOs with the option
//!    absent reproduce the R40 literals and R41's per-design `b0.json`
//!    fingerprints in every bit, with exactly one added manifest key.
//! 3. `wiring`          — E1a/E1a'/E2/E4: the product's two-pass tables equal
//!    R41's frozen tables, the product flight equals a harness-built reference
//!    flight, and the cohort equals R41's corrected Stack. Writes `wiring.json`,
//!    which `cohort` consumes (R41's `arms`-depends-on-`b0` precedent).
//! 4. `cohort`          — the frozen acceptance rule plus the reported pad-level
//!    sensitivity arm.
//! 5. `dev_vehicles`    — E2b: the 14 development flights, per vehicle, with the
//!    two refused shapes bit-identical and labelled.
//! 6. `ensembles`       — amendment A-N4a..d.
//!
//! Env (2–6): ASTRAEA_R44_MANIFEST, ASTRAEA_R44_R40_RESULTS, ASTRAEA_R44_R41_B0,
//! ASTRAEA_R44_R41_PARITY, ASTRAEA_R44_R41_ARMS_CORRECTED, ASTRAEA_R44_R42_NEUTRALITY,
//! ASTRAEA_R44_R42_ENSEMBLES, ASTRAEA_R44_DEV_MANIFEST, ASTRAEA_R44_DEV_VEHICLES,
//! ASTRAEA_R44_REPO, ASTRAEA_R44_OUT. Every reference is hash-checked before the
//! first flight.
//!
//! Run: cargo test --offline -j 2 --manifest-path crates/astraea-engine/Cargo.toml \
//!        --test r44_calibrated_drag -- --ignored --test-threads=1

use astraea_core::calibrated::{self, CpMethod, Design, EvalOptions, Site};
use astraea_core::six_dof::{
    flight_physics_inputs, simulate_flight, MotorSpec, SimulationResult, SixDofOptions, Vehicle,
};
use astraea_engine::commands;
use astraea_engine::models::{
    self, EnsembleChunkRequest, EnsembleRequest, FlightOptionsDto, FrontendMotor, FrontendVehicle,
    SigmasDto,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

// Frozen references: every hash was verified in the lane's Gate 1 and again
// before the first flight of every evidence run.
const PREREG_SHA: &str = "7c8e00aee8042bf0ad4d6d9b2e6ef12d87cb82b53136939aadb1f5382aaa7242";
const AMENDMENT1_SHA: &str = "23869cbd2fb56f0e18aa8fb669b37ed5a316273dfab16d3af3294b4282427c44";
const R40_MANIFEST_SHA: &str = "3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5";
const R40_RESULTS_SHA: &str = "c925b7811d6f0c288eedc46df1f3c745b4c466ba435959dbcc1086a75c2eb493";
// R47 (2026-11-11): the calibrated ladder now converts telemetry metres to feet.
// These are the corrected R41 b0/parity/arms hashes, not the pre-fix erratum set.
const R41_B0_SHA: &str = "3af2186082cea3e082031d6eb2ec033b070cc6c971a85755b59cd29e7a2b3100";
const R41_PARITY_SHA: &str = "d6f916b96866902c492225fcea915ac6ec2502e511dc43d2126b2d95c3483834";
const R41_ARMS_CORRECTED_SHA: &str = "870e2df2b428169f053aa3e42c69f493255d98c78983ab7759f2a249463e3a38";
const R42_NEUTRALITY_SHA: &str = "447c6d84f56a8a41dea95d3a6dc3ab6629b96542c18bfc140aa4af1595805828";
const DEV_MANIFEST_SHA: &str = "68aeee3e4bea29704f58b77a398f1fde9b08a78386e88b44f6d832836b7e33c9";
const DEV_VEHICLES_SHA: &str = "d1503fcb1e9c0d504339bd79bc160b7e3db48c2092769397eecd78e0f2b67b94";

/// R47-corrected Stack on the primary line (the acceptance target).
const R41_STACK_MAE_PCT: f64 = 5.612635502496195;
const R41_STACK_SIGNED_PCT: f64 = 0.23699950464295078;
const R41_S_STACK_MAE_PCT: f64 = 5.67103824215374;
const R41_B0_MAE_PCT: f64 = 9.563554553799888;

const LEGACY_TEXT: &str = "legacy 25-station Mach drag tables from compute_aerodynamic_curves; \
                           calibrated drag not requested";

const STATIONS: usize = 25;
const HALF_WINDOW: f64 = 4.0 / 48.0;
const MIN_ROWS: usize = 5;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

fn env_path(name: &str) -> PathBuf {
    PathBuf::from(std::env::var_os(name).unwrap_or_else(|| panic!("{name} must be set")))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

fn sha256_file(path: &Path) -> String {
    sha256_bytes(&fs::read(path).unwrap_or_else(|e| panic!("{}: {e}", path.display())))
}

fn parse_verified(path: &Path, want: &str) -> Value {
    let got = sha256_file(path);
    assert_eq!(got, want, "{} hash", path.display());
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

fn repo_path() -> PathBuf {
    env_path("ASTRAEA_R44_REPO")
}

fn out_dir() -> PathBuf {
    let out = env_path("ASTRAEA_R44_OUT");
    fs::create_dir_all(&out).expect("ASTRAEA_R44_OUT");
    out
}

fn entries(manifest: &Value) -> &Vec<Value> {
    manifest["entries"].as_array().expect("entries")
}

fn absent_options(entry: &Value) -> FlightOptionsDto {
    serde_json::from_value(entry["options"].clone()).expect("options")
}

/// The shipping bundle: the drag source, R42's site temperature (derived from
/// the frozen °F) and R42's nozzle from the frozen vehicle field.
fn bundle_options(entry: &Value) -> FlightOptionsDto {
    let mut o = absent_options(entry);
    let temp_f = entry["launch_site"]["temperature_f"].as_f64().expect("temperature_f");
    o.launch_site_temperature_c = Some((temp_f - 32.0) / 1.8);
    o.nozzle_exit_diameter = entry["vehicle"]["nozzleExitDiameter"].as_f64();
    o.flight_drag_source = Some("calibrated".to_string());
    o
}

/// R41's own `site_of`: the frozen manifest's ft and °F.
fn r41_site(entry: &Value) -> Site {
    let alt_ft = entry["launch_site"]["altitude_ft"].as_f64().expect("altitude_ft");
    let temp_f = entry["launch_site"]["temperature_f"].as_f64().expect("temperature_f");
    Site::new(alt_ft, temp_f).expect("Site::new")
}

fn core_options(o: &FlightOptionsDto, telemetry: bool) -> SixDofOptions {
    SixDofOptions {
        rail_length: o.rail_length,
        rail_elevation_deg: o.rail_elevation_deg,
        rail_azimuth_deg: o.rail_azimuth_deg,
        launch_altitude_asl: o.launch_altitude_asl,
        wind_speed_surface: o.wind_speed_surface,
        wind_azimuth_deg: o.wind_azimuth_deg,
        main_deploy_altitude_agl: o.main_deploy_altitude_agl,
        time_step: o.time_step,
        fin_cant_angle_deg: o.fin_cant_angle_deg,
        drag_cd_scale: o.drag_cd_scale,
        launch_site_temperature_c: o.launch_site_temperature_c,
        nozzle_exit_diameter: o.nozzle_exit_diameter,
        record_telemetry: telemetry,
        record_moment_arm_history: false,
    }
}

fn prepared(entry: &Value) -> (FrontendVehicle, FrontendMotor, Vehicle, MotorSpec) {
    let fv: FrontendVehicle = serde_json::from_value(entry["vehicle"].clone()).expect("vehicle");
    let fm: FrontendMotor = serde_json::from_value(entry["motor"].clone()).expect("motor");
    let vehicle = models::prepare_flight_vehicle(&fv, &fm).expect("prepare");
    let motor = models::to_motor(&fm).expect("motor");
    (fv, fm, vehicle, motor)
}

fn median(mut v: Vec<f64>) -> f64 {
    assert!(!v.is_empty(), "median of empty");
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let n = v.len();
    if n % 2 == 1 {
        v[n / 2]
    } else {
        0.5 * (v[n / 2 - 1] + v[n / 2])
    }
}

fn residual_pct(sim_agl_m: f64, measured_m: f64) -> f64 {
    (sim_agl_m - measured_m) / measured_m * 100.0
}

/// Exact-bits fingerprint of a core result (R41's definition).
fn fingerprint(r: &SimulationResult) -> String {
    sha256_bytes(format!("{r:?}").as_bytes())
}

fn bits_eq(a: f64, b: f64) -> bool {
    a.to_bits() == b.to_bits()
}

fn rel(a: f64, b: f64) -> f64 {
    if b == 0.0 {
        (a - b).abs()
    } else {
        ((a - b) / b).abs()
    }
}

/// R40/R41's literal scan: the R40 results file must be compared through its
/// literal text, not through a JSON float parser (that parser is not correctly
/// rounded for every literal, the artifact R40/R10 documented).
fn r40_flight_literals(text: &str, slug: &str) -> BTreeMap<String, String> {
    let lines: Vec<&str> = text.lines().collect();
    let needle = format!("\"slug\": \"{slug}\"");
    let mut pos = 0usize;
    while pos < lines.len() && !lines[pos].contains(&needle) {
        pos += 1;
    }
    while pos < lines.len() && !lines[pos].contains("\"flight\": {") {
        pos += 1;
    }
    pos += 1;
    let mut fields = BTreeMap::new();
    while pos < lines.len() {
        let t = lines[pos].trim();
        if t.starts_with('}') {
            break;
        }
        if let Some(rest) = t.strip_prefix('"') {
            if let Some((key, val)) = rest.split_once("\": ") {
                let v = val.trim_end_matches(',').trim_matches('"').to_string();
                fields.insert(key.to_string(), v);
            }
        }
        pos += 1;
    }
    assert!(!fields.is_empty(), "{slug}: no R40 flight literals");
    fields
}

// ---------------------------------------------------------------------------
// Harness-side reference construction (independent of the product resolver)
// ---------------------------------------------------------------------------

fn station_altitudes(rows: &[&astraea_core::telemetry::TelemetryPoint], burn: f64, powered: bool) -> Vec<Option<f64>> {
    let mut vals: Vec<Option<f64>> = vec![None; STATIONS];
    for (i, slot) in vals.iter_mut().enumerate() {
        let m = i as f64 * 4.0 / 24.0;
        let mut win = Vec::new();
        for row in rows {
            if (row.time < burn) != powered || row.mach <= 0.02 || row.angle_of_attack_deg.abs() > 2.0 {
                continue;
            }
            if (row.mach - m).abs() <= HALF_WINDOW {
                // Telemetry is metres AGL; the ladder API is feet.
                win.push(row.altitude / 0.3048);
            }
        }
        if win.len() >= MIN_ROWS {
            *slot = Some(median(win));
        }
    }
    let populated: Vec<usize> = vals.iter().enumerate().filter(|(_, v)| v.is_some()).map(|(i, _)| i).collect();
    if populated.is_empty() {
        return vals;
    }
    for i in 0..STATIONS {
        if vals[i].is_none() {
            let j = *populated.iter().min_by_key(|&&k| (k as i64 - i as i64).abs()).unwrap();
            vals[i] = vals[j];
        }
    }
    vals
}

/// R41's `build_tables`, written here by hand so the product is not checked
/// against itself.
fn reference_tables(
    design: &Design,
    nozzle_in: Option<f64>,
    site: Option<Site>,
    powered_alt: &[Option<f64>],
    coasting_alt: &[Option<f64>],
    offset_ft: f64,
) -> Result<(Vec<f64>, Vec<f64>), String> {
    let mut powered = Vec::with_capacity(STATIONS);
    let mut coasting = Vec::with_capacity(STATIONS);
    for i in 0..STATIONS {
        let m = (i as f64 * 4.0 / 24.0).max(0.01);
        let at = |alt: Option<f64>, on: bool| -> Result<f64, String> {
            let a = alt.ok_or_else(|| format!("station {i}: no altitude rows"))?;
            let p = calibrated::evaluate(design, &EvalOptions {
                mach: m,
                alpha_deg: 0.0,
                method: CpMethod::Barrowman,
                nozzle_exit_in: nozzle_in,
                altitude_ft: Some(a + offset_ft),
                site,
            })
            .map_err(|e| format!("station {i}: {e}"))?;
            Ok(if on { p.cd_power_on } else { p.cd_power_off })
        };
        powered.push(at(powered_alt[i], true)?);
        coasting.push(at(coasting_alt[i], false)?);
    }
    Ok((powered, coasting))
}

/// The harness's own two-pass reference: one legacy pass for the ladder, then
/// the calibrated tables injected into the prepared vehicle, then the flight.
fn reference_flight(
    entry: &Value,
    options: &FlightOptionsDto,
) -> (SimulationResult, Option<(Vec<f64>, Vec<f64>)>) {
    let (fv, _fm, vehicle, motor) = prepared(entry);
    let aero = models::to_aero_vehicle(&fv).expect("aero vehicle");
    let design = match astraea_core::aero_model::design_from_app_vehicle(&aero) {
        Ok(d) => d,
        Err(e) => {
            let r = simulate_flight(&vehicle, &motor, &core_options(options, false)).unwrap();
            eprintln!("reference: refused: {e}");
            return (r, None);
        }
    };
    let pass1 = simulate_flight(&vehicle, &motor, &core_options(options, true)).expect("pass 1");
    let rows: Vec<&astraea_core::telemetry::TelemetryPoint> =
        pass1.telemetry.iter().filter(|p| p.time <= pass1.apogee_time).collect();
    let powered_alt = station_altitudes(&rows, motor.burn_time, true);
    let coasting_alt = station_altitudes(&rows, motor.burn_time, false);
    let site = if options.launch_site_temperature_c.is_some() {
        let alt_ft = options.launch_altitude_asl.unwrap_or(0.0) / 0.3048;
        let k = options.launch_site_temperature_c.unwrap() + 273.15;
        Some(Site::new(alt_ft, (k - 273.15) * 1.8 + 32.0).expect("site"))
    } else {
        None
    };
    let offset_ft = if site.is_some() {
        0.0
    } else {
        options.launch_altitude_asl.unwrap_or(0.0) / 0.3048
    };
    let nozzle_in = fv.nozzle_exit_diameter.map(|d| d / 0.0254);
    let tables = reference_tables(&design, nozzle_in, site, &powered_alt, &coasting_alt, offset_ft)
        .expect("reference tables");
    let mut dragged = vehicle.clone();
    dragged.aero_powered_cd = tables.0.clone();
    dragged.aero_coasting_cd = tables.1.clone();
    (simulate_flight(&dragged, &motor, &core_options(options, false)).expect("pass 2"), Some(tables))
}

/// R41's own table construction, written here by hand: the ladder from a pass 1
/// with the R42 inputs cleared (ISA-1976, no back-pressure term), the method
/// evaluated in the frozen manifest's site air (`ft`, `°F`) at AGL altitude.
/// Used only as the R3 proof that the E1a/E2 gap is the ladder source alone.
#[allow(dead_code)]
fn r41_plain_reference(entry: &Value, bundle: &FlightOptionsDto) -> ((Vec<f64>, Vec<f64>), f64) {
    let (fv, _fm, vehicle, motor) = prepared(entry);
    let aero = models::to_aero_vehicle(&fv).expect("aero vehicle");
    let design = astraea_core::aero_model::design_from_app_vehicle(&aero).expect("design");
    let pass1 = simulate_flight(&vehicle, &motor, &core_options(&absent_options(entry), true))
        .expect("plain pass 1");
    let rows: Vec<&astraea_core::telemetry::TelemetryPoint> =
        pass1.telemetry.iter().filter(|p| p.time <= pass1.apogee_time).collect();
    let powered_alt = station_altitudes(&rows, motor.burn_time, true);
    let coasting_alt = station_altitudes(&rows, motor.burn_time, false);
    let tables = reference_tables(
        &design,
        fv.nozzle_exit_diameter.map(|d| d / 0.0254),
        Some(r41_site(entry)),
        &powered_alt,
        &coasting_alt,
        0.0,
    )
    .expect("plain tables");
    let mut dragged = vehicle.clone();
    dragged.aero_powered_cd = tables.0.clone();
    dragged.aero_coasting_cd = tables.1.clone();
    let r = simulate_flight(&dragged, &motor, &core_options(bundle, false)).expect("plain pass 2");
    (tables, r.apogee_altitude)
}

// ---------------------------------------------------------------------------
// R40 metrics
// ---------------------------------------------------------------------------

fn geometry_group(slug: &str, airframe: &str) -> String {
    match slug {
        "calisp1" | "calisp2" | "calisp3" => "calisp-04".to_string(),
        "calisp4" | "calisp5" => "calisp-05".to_string(),
        _ => airframe.to_string(),
    }
}

fn summarize(groups: &[(String, f64)]) -> Value {
    let n = groups.len();
    assert!(n > 0, "summarize of empty");
    let mean_signed = groups.iter().map(|g| g.1).sum::<f64>() / n as f64;
    let mean_abs = groups.iter().map(|g| g.1.abs()).sum::<f64>() / n as f64;
    let within = |limit: f64| groups.iter().filter(|g| g.1.abs() <= limit).count();
    let worst = groups.iter().max_by(|a, b| a.1.abs().partial_cmp(&b.1.abs()).unwrap()).unwrap();
    json!({
        "n": n,
        "mean_signed_pct": mean_signed,
        "mean_absolute_pct": mean_abs,
        "within_10": within(10.0),
        "within_5": within(5.0),
        "worst": worst.0,
        "worst_pct": worst.1,
        "values": groups.iter().map(|g| json!({"group": g.0, "residual_pct": g.1})).collect::<Vec<_>>(),
    })
}

fn summaries(rows: &[Value]) -> Value {
    let mut by_airframe: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    let mut by_geometry: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    for r in rows {
        let res = r["residual_pct"].as_f64().unwrap();
        by_airframe.entry(r["airframe_group"].as_str().unwrap().to_string()).or_default().push(res);
        by_geometry.entry(r["geometry_group"].as_str().unwrap().to_string()).or_default().push(res);
    }
    let air: Vec<(String, f64)> = by_airframe.iter().map(|(k, v)| (k.clone(), median(v.clone()))).collect();
    let geo: Vec<(String, f64)> = by_geometry.iter().map(|(k, v)| (k.clone(), median(v.clone()))).collect();
    let flights: Vec<(String, f64)> = rows
        .iter()
        .map(|r| (r["slug"].as_str().unwrap().to_string(), r["residual_pct"].as_f64().unwrap()))
        .collect();
    let wo = |v: &[(String, f64)]| -> Vec<(String, f64)> { v.iter().filter(|(k, _)| k != "qu8k").cloned().collect() };
    let flights_wo: Vec<(String, f64)> = flights.iter().filter(|(k, _)| k != "qu8k").cloned().collect();
    json!({
        "primary_headline": {"rule": "equal-airframe, qu8k excluded",
                             "airframe": summarize(&wo(&air)), "flight": summarize(&flights_wo)},
        "all_23_including_qu8k": {"airframe": summarize(&air), "flight": summarize(&flights)},
        "sensitivity_geometry_grouped": {"rule": "R40 amendment 1", "geometry_group": summarize(&wo(&geo))},
    })
}

// ---------------------------------------------------------------------------
// 1. Always-run validation (no external files)
// ---------------------------------------------------------------------------

fn validation_vehicle() -> (FrontendVehicle, FrontendMotor, FlightOptionsDto) {
    let fv: FrontendVehicle = serde_json::from_value(json!({
        "components": [
            {"id": "n", "name": "Nose", "type": "nosecone", "shape": "ogive",
             "length": 0.20, "baseDiameter": 0.0762, "wallThickness": 0.002, "isHollow": true,
             "tipRadius": 0.004},
            {"id": "b", "name": "Body", "type": "bodytube", "length": 0.60,
             "outerDiameter": 0.0762, "innerDiameter": 0.072, "isMotorMount": true},
            {"id": "f", "name": "Fins", "type": "trapezoidfinset", "finCount": 4,
             "rootChord": 0.12, "tipChord": 0.05, "span": 0.10, "sweepLength": 0.08,
             "thickness": 0.006, "crossSection": "square", "axialOffset": 0.45}
        ]
    }))
    .expect("vehicle");
    // A slow, long-burning fixture: the frozen ladder rule needs at least five
    // recorded ascent rows (one every 0.05 s) inside a 1/12-Mach bin.
    let fm: FrontendMotor = serde_json::from_value(json!({
        "designation": "test-motor", "diameter": 0.038, "length": 0.20,
        "burnTime": 1.2, "propellantMass": 0.25, "totalMass": 0.52, "dryMass": 0.27,
        "maxThrust": 220.0,
        "thrustCurve": [{"time": 0.0, "thrust": 0.0}, {"time": 0.1, "thrust": 220.0},
                        {"time": 1.1, "thrust": 200.0}, {"time": 1.2, "thrust": 0.0}]
    }))
    .expect("motor");
    let fo: FlightOptionsDto = serde_json::from_value(json!({
        "railLength": 1.0, "railElevationDeg": 88.0, "launchAltitudeASL": 0.0,
        "windSpeedSurface": 1.0, "windAzimuthDeg": 0.0, "mainDeployAltitudeAGL": 40.0
    }))
    .expect("options");
    (fv, fm, fo)
}

#[test]
fn station_altitudes_convert_metres_to_feet() {
    use astraea_core::six_dof::{Quat, Vec3};
    use astraea_core::telemetry::{BodyRates, TelemetryPoint};

    fn point(altitude_m: f64) -> TelemetryPoint {
        TelemetryPoint {
            time: 1.0,
            position: Vec3 { x: 0.0, y: 0.0, z: altitude_m },
            velocity: Vec3 { x: 0.0, y: 0.0, z: 1.0 },
            speed: 1.0,
            mach: 1.0,
            altitude: altitude_m,
            acceleration: 0.0,
            angular_velocity: BodyRates { p: 0.0, q: 0.0, r: 0.0 },
            angle_of_attack_deg: 0.0,
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 },
            pitch_deg: 90.0,
            roll_deg: 0.0,
            yaw_deg: 0.0,
            drag: 0.0,
            thrust: 0.0,
            mass: 1.0,
            dynamic_pressure: 0.0,
        }
    }

    let rows: Vec<TelemetryPoint> = (0..MIN_ROWS + 1).map(|_| point(1000.0)).collect();
    let refs: Vec<&TelemetryPoint> = rows.iter().collect();
    let vals = station_altitudes(&refs, 0.5, false);
    // 25 stations over Mach 0..4: index 6 is Mach 1.0.
    let got = vals[6].expect("station 6 populated");
    assert!((got - 1000.0 / 0.3048).abs() < 1e-9, "station altitude must be feet, got {got}");
}

#[test]
fn validation() {
    let (fv, fm, fo) = validation_vehicle();

    // --- the removed names stay unknown fields (history H2) ------------------
    for key in ["aeroModel", "launchTemperatureK", "launchPressurePa"] {
        let err = serde_json::from_value::<FlightOptionsDto>(json!({ key: 1.0 })).unwrap_err();
        assert!(err.to_string().contains("unknown field"), "{key} must stay removed: {err}");
    }

    // --- the unsupported drag source refuses with the frozen text ------------
    for bad in ["legacy", "Calibrated", "", "calibrated "] {
        let mut o = fo.clone();
        o.flight_drag_source = Some(bad.to_string());
        let err = commands::simulate_flight(fv.clone(), fm.clone(), o).unwrap_err();
        assert_eq!(
            err,
            format!("simulate6DofFlight: flightDragSource \"{bad}\" is not a supported drag \
                     source (supported: \"calibrated\")"),
            "refusal text for {bad:?}"
        );
    }

    // --- option absent: the legacy source builds no table at all (F8/N1d) ---
    let vehicle = models::prepare_flight_vehicle(&fv, &fm).expect("prepare");
    let motor = models::to_motor(&fm).expect("motor");
    let opts = core_options(&fo, true);
    let physics = flight_physics_inputs(&opts).expect("physics");
    let legacy = models::resolve_flight_drag(&fv, &fo, &physics).expect("resolve");
    assert!(matches!(legacy, models::ResolvedFlightDrag::Legacy));
    let plain = simulate_flight(&vehicle, &motor, &opts).expect("flight");
    assert!(
        legacy.tables(&plain, motor.burn_time).expect("legacy tables").is_none(),
        "the legacy source must not build a table"
    );
    assert_eq!(legacy.manifest_text(models::FlightDragScope::Single), LEGACY_TEXT);

    // --- option present: the product flies, and says exactly what it flew ---
    let mut o = fo.clone();
    o.flight_drag_source = Some("calibrated".to_string());
    let dto = commands::simulate_flight(fv.clone(), fm.clone(), o.clone()).expect("calibrated flight");
    let text = dto.run_manifest["axialDrag"].as_str().expect("axialDrag key");
    // The fixture declares a tip radius and no nozzle and no site temperature,
    // so the frozen text is fully determined.
    let expected = "calibrated build-up axial drag (alpha = 0) from the in-repo method port; \
                    25-station table at the run's own ascent altitudes (median AGL per Mach bin \
                    over the baseline pass, minimum 5 rows per bin, nearest-station fill); nose \
                    tipRadius 0.004 m; design nozzle exit none (method default); method \
                    reference air at altitude above sea level; not a validated model";
    assert_eq!(text, expected, "single-flight calibrated manifest text");
    // The single-flight text must not claim a shared ladder.
    assert!(!text.contains("ensemble members share it"));
    // The flight changed: the calibrated tables are not the legacy build-up.
    let base = commands::simulate_flight(fv.clone(), fm.clone(), fo.clone()).expect("legacy flight");
    assert!(
        !bits_eq(dto.apogee_altitude, base.apogee_altitude),
        "the calibrated source must change the flight"
    );
    assert_eq!(base.run_manifest["axialDrag"].as_str().unwrap(), LEGACY_TEXT);
    // R42's keys survive untouched next to the new one.
    assert!(dto.run_manifest.get("atmosphere").is_some());
    assert!(dto.run_manifest.get("thrustPressure").is_some());

    // --- tip radius: validation texts and the carry into the design ---------
    let mut bad = fv.clone();
    bad.components[0].tip_radius = Some(f64::NAN);
    let e = models::to_aero_vehicle(&bad).unwrap_err();
    assert!(e.contains("must be finite"), "{e}");
    bad.components[0].tip_radius = Some(-0.001);
    let e = models::to_aero_vehicle(&bad).unwrap_err();
    assert!(e.contains("must be nonnegative"), "{e}");
    bad.components[0].tip_radius = Some(0.5);
    let e = models::to_aero_vehicle(&bad).unwrap_err();
    assert!(e.contains("exceeds its nose base diameter"), "{e}");
    let mut wrong_part = fv.clone();
    wrong_part.components[1].tip_radius = Some(0.001);
    let e = models::to_aero_vehicle(&wrong_part).unwrap_err();
    assert!(e.contains("only supported on a nosecone"), "{e}");
    let mut sharp = fv.clone();
    sharp.components[0].tip_radius = None;
    let aero = models::to_aero_vehicle(&sharp).expect("aero");
    let design = astraea_core::aero_model::design_from_app_vehicle(&aero).expect("design");
    assert_eq!(design.chain[0].blunt_radius, Some(0.0), "absent = sharp");
    let aero = models::to_aero_vehicle(&fv).expect("aero");
    let design = astraea_core::aero_model::design_from_app_vehicle(&aero).expect("design");
    assert_eq!(design.chain[0].blunt_radius, Some(0.004 / 0.0254), "declared = carried");

    // --- assembly A-N4c (cheap form): zero sigmas, members are the flight ---
    let sigmas = SigmasDto {
        wind_azimuth_deg_sigma: Some(0.0),
        rail_angle_deg_sigma: Some(0.0),
        impulse_pct_sigma: Some(0.0),
    };
    let single = commands::simulate_flight(fv.clone(), fm.clone(), o.clone()).expect("single");
    let ens = commands::run_ensemble(EnsembleRequest {
        vehicle: fv.clone(),
        motor: fm.clone(),
        options: o.clone(),
        sigmas,
        n_runs: 2,
        seed: 7,
        version: "per-run-v2".to_string(),
    })
    .expect("ensemble");
    for p in &ens.landings {
        assert!(bits_eq(p.x, single.landing_position.x) && bits_eq(p.y, single.landing_position.y),
            "zero-sigma member must equal the single flight");
    }
    let et = ens.axial_drag.clone();
    assert!(et.contains("drag ladder from the nominal baseline flight; ensemble members share it"),
        "ensemble text must state the shared ladder: {et}");
    assert!(et.contains("nominal baseline flight's ascent altitudes"), "{et}");

    // --- a refused shape flies on legacy drag, bit-identically, and says so ---
    let mut freeform = fv.clone();
    let fins = freeform.components.iter_mut().find(|c| c.kind == "trapezoidfinset").unwrap();
    fins.kind = "freeformfinset".to_string();
    fins.points = Some(vec![
        astraea_engine::models::FrontendFinPoint { x: 0.0, y: 0.0 },
        astraea_engine::models::FrontendFinPoint { x: 0.08, y: 0.10 },
        astraea_engine::models::FrontendFinPoint { x: 0.20, y: 0.10 },
        astraea_engine::models::FrontendFinPoint { x: 0.12, y: 0.0 },
    ]);
    let mut o = fo.clone();
    o.flight_drag_source = Some("calibrated".to_string());
    let refused_absent = commands::simulate_flight(freeform.clone(), fm.clone(), fo.clone())
        .expect("legacy flight of a freeform vehicle");
    let refused = commands::simulate_flight(freeform.clone(), fm.clone(), o.clone())
        .expect("refused shape still flies");
    let rtext = refused.run_manifest["axialDrag"].as_str().unwrap();
    assert!(rtext.starts_with("legacy 25-station Mach drag tables"), "{rtext}");
    assert!(rtext.contains("legacy drag used (refused:"), "{rtext}");
    assert!(rtext.contains("freeform planform"), "{rtext}");
    assert!(bits_eq(refused.apogee_altitude, refused_absent.apogee_altitude),
        "a refused shape must be bit-identical to today");
}

// ---------------------------------------------------------------------------
// 2. Neutrality — option absent is today, bit for bit
// ---------------------------------------------------------------------------

#[test]
#[ignore = "needs the frozen R40/R41 evidence (env vars); run with --ignored"]
fn neutrality() {
    let out = out_dir();
    let repo = repo_path();
    assert_eq!(
        sha256_file(&repo.join("docs/internal/execution-runs/R44-calibrated-flight-drag/pre_registration.json")),
        PREREG_SHA
    );
    assert_eq!(
        sha256_file(&repo.join("docs/internal/execution-runs/R44-calibrated-flight-drag/PREREG-AMENDMENT-1.md")),
        AMENDMENT1_SHA
    );
    let manifest = parse_verified(&env_path("ASTRAEA_R44_MANIFEST"), R40_MANIFEST_SHA);
    parse_verified(&env_path("ASTRAEA_R44_R40_RESULTS"), R40_RESULTS_SHA);
    let b0 = parse_verified(&env_path("ASTRAEA_R44_R41_B0"), R41_B0_SHA);
    let r42 = parse_verified(&env_path("ASTRAEA_R44_R42_NEUTRALITY"), R42_NEUTRALITY_SHA);

    // R41's per-design fingerprints and the R42 pre-R44 manifest key set.
    let b0_by_slug: BTreeMap<String, &Value> = b0["designs"].as_array().unwrap().iter()
        .map(|d| (d["slug"].as_str().unwrap().to_string(), d)).collect();
    let r42_by_slug: BTreeMap<String, &Value> = r42["designs"].as_array().unwrap().iter()
        .map(|d| (d["slug"].as_str().unwrap().to_string(), d)).collect();
    let pre_keys: Vec<String> = r42["verdict"]["pre_r42_manifest_keys"].as_array().unwrap().iter()
        .map(|v| v.as_str().unwrap().to_string()).collect();

    // R40 literals per design, through the raw text (R40/R41's method).
    let results_text = fs::read_to_string(env_path("ASTRAEA_R44_R40_RESULTS")).unwrap();

    let mut designs = Vec::new();
    let mut failures = Vec::new();
    for entry in entries(&manifest) {
        let slug = entry["slug"].as_str().unwrap().to_string();
        let (fv, fm, vehicle, motor) = prepared(entry);
        let fo = absent_options(entry);
        let opts = core_options(&fo, true);
        let core = simulate_flight(&vehicle, &motor, &opts).unwrap_or_else(|e| panic!("{slug}: {e}"));
        let fp = fingerprint(&core);
        if fp != b0_by_slug[&slug]["fingerprint_sha256"].as_str().unwrap() {
            failures.push(format!("{slug}: fingerprint differs from R41 b0"));
        }
        if fp != r42_by_slug[&slug]["fingerprint_sha256"].as_str().unwrap() {
            failures.push(format!("{slug}: fingerprint differs from R42 N1"));
        }
        // DTO path == core path on the same flight.
        let dto = commands::simulate_flight(fv.clone(), fm.clone(), fo.clone())
            .unwrap_or_else(|e| panic!("{slug}: {e}"));
        if !bits_eq(dto.apogee_altitude, core.apogee_altitude) || !bits_eq(dto.max_mach, core.max_mach) {
            failures.push(format!("{slug}: DTO path differs from the core path"));
        }
        // R40 literals on the DTO fields (raw-text literals, str::parse).
        let fields = r40_flight_literals(&results_text, &slug);
        let mut r40_diffs = Vec::new();
        let wire = serde_json::to_value(&dto).unwrap();
        let pairs: [(&str, f64); 10] = [
            ("apogee_agl_m", dto.apogee_altitude),
            ("apogee_time_s", dto.apogee_time),
            ("burnout_altitude_m", dto.burnout_altitude),
            ("burnout_velocity_mps", dto.burnout_velocity),
            ("burnout_time_s", dto.burnout_time),
            ("flight_time_s", dto.flight_duration),
            ("max_mach", dto.max_mach),
            ("max_velocity_mps", dto.max_velocity),
            ("rail_exit_velocity_mps", dto.rail_exit_velocity),
            ("weathercock_angle_deg", dto.weathercock_angle_deg),
        ];
        for (k, got) in pairs {
            let lit = fields.get(k).unwrap_or_else(|| panic!("{slug}: missing literal {k}"));
            let want: f64 = lit.parse().unwrap_or_else(|e| panic!("{slug}: literal {k}={lit}: {e}"));
            if !bits_eq(got, want) {
                r40_diffs.push(format!("{k}: {got:?} != literal {lit}"));
            }
        }
        for (k, key) in [("validity", "validity"), ("enveloped", "enveloped"), ("terminated", "terminated")] {
            let lit = fields.get(key).expect("string/bool literal");
            let got = wire.get(key).unwrap();
            let want: Value = if *lit == "true" {
                json!(true)
            } else if *lit == "false" {
                json!(false)
            } else {
                json!(lit)
            };
            if *got != want {
                r40_diffs.push(format!("{k}: {got} != literal {want}"));
            }
        }
        if !r40_diffs.is_empty() {
            failures.push(format!("{slug}: R40 literals differ: {r40_diffs:?}"));
        }
        // Manifest: one added key, every pre-existing key present, the two
        // documented R42 strings byte-equal.
        let post: Vec<String> = dto.run_manifest.keys().cloned().collect();
        let mut expected: Vec<String> = pre_keys.clone();
        expected.push("thrustPressure".to_string());
        expected.push("axialDrag".to_string());
        let mut post_sorted = post.clone();
        post_sorted.sort();
        let mut expected_sorted = expected.clone();
        expected_sorted.sort();
        if post_sorted != expected_sorted {
            failures.push(format!("{slug}: manifest key set {post_sorted:?} != {expected_sorted:?}"));
        }
        if dto.run_manifest["atmosphere"].as_str() != Some(r42_by_slug[&slug]["manifest_atmosphere"].as_str().unwrap()) {
            failures.push(format!("{slug}: atmosphere text changed"));
        }
        if dto.run_manifest["thrustPressure"].as_str() != Some(r42_by_slug[&slug]["manifest_thrust_pressure"].as_str().unwrap()) {
            failures.push(format!("{slug}: thrustPressure text changed"));
        }
        if dto.run_manifest["axialDrag"].as_str() != Some(LEGACY_TEXT) {
            failures.push(format!("{slug}: axialDrag absent-state text wrong"));
        }
        // The legacy resolver builds no tables.
        if !matches!(models::ResolvedFlightDrag::Legacy.tables(&core, motor.burn_time), Ok(None)) {
            failures.push(format!("{slug}: legacy source built a table"));
        }
        designs.push(json!({
            "slug": slug,
            "airframe_group": entry["airframe_group"],
            "apogee_agl_m": dto.apogee_altitude,
            "max_mach": dto.max_mach,
            "fingerprint_sha256": fp,
            "r41_b0_fingerprint_sha256": b0_by_slug[&slug]["fingerprint_sha256"],
            "r42_n1_fingerprint_sha256": r42_by_slug[&slug]["fingerprint_sha256"],
            "r40_literals_bit_identical": r40_diffs.is_empty(),
            "r40_diffs": r40_diffs,
            "dto_matches_core": bits_eq(dto.apogee_altitude, core.apogee_altitude),
            "manifest_keys_post": post_sorted,
            "manifest_atmosphere": dto.run_manifest["atmosphere"],
            "manifest_thrust_pressure": dto.run_manifest["thrustPressure"],
            "manifest_axial_drag": dto.run_manifest["axialDrag"],
        }));
    }
    let pass = failures.is_empty();
    let payload = json!({
        "schema": "astraea-r44-neutrality/1.0.0",
        "identity": {
            "manifest": env_path("ASTRAEA_R44_MANIFEST").display().to_string(),
            "manifest_sha256": R40_MANIFEST_SHA,
            "r40_results_sha256": R40_RESULTS_SHA,
            "r41_b0_sha256": R41_B0_SHA,
            "r42_neutrality_sha256": R42_NEUTRALITY_SHA,
            "prereg_sha256": PREREG_SHA,
            "amendment1_sha256": AMENDMENT1_SHA,
        },
        "pre_r44_manifest_keys": pre_keys,
        "counts": {"designs": designs.len()},
        "designs": designs,
        "verdict": {"pass": pass, "failures": failures},
    });
    fs::write(out.join("neutrality.json"), serde_json::to_string_pretty(&payload).unwrap()).unwrap();
    eprintln!("neutrality: pass {pass}");
    assert!(pass, "neutrality failures: {:?}", payload["verdict"]["failures"]);
}

// ---------------------------------------------------------------------------
// 3. Wiring — the product's tables are R41's tables
// ---------------------------------------------------------------------------

#[test]
#[ignore = "needs the frozen R40/R41 evidence (env vars); run with --ignored"]
fn wiring() {
    let out = out_dir();
    let manifest = parse_verified(&env_path("ASTRAEA_R44_MANIFEST"), R40_MANIFEST_SHA);
    let parity = parse_verified(&env_path("ASTRAEA_R44_R41_PARITY"), R41_PARITY_SHA);
    let arms = parse_verified(&env_path("ASTRAEA_R44_R41_ARMS_CORRECTED"), R41_ARMS_CORRECTED_SHA);
    let tables = parity["tables"].as_object().expect("tables");
    let stack: BTreeMap<String, f64> = arms["flights"]["Stack"].as_array().unwrap().iter()
        .map(|f| (f["slug"].as_str().unwrap().to_string(), f["apogee_agl_m"].as_f64().unwrap()))
        .collect();

    let mut rows = Vec::new();
    let mut failures = Vec::new();
    let mut max_table_rel: f64 = 0.0;          // R1: reported ladder-source difference
    let mut max_apogee_rel_r41: f64 = 0.0;     // R2: reported ladder-source difference
    let mut max_table_rel_harness: f64 = 0.0;  // E1a'-tables: the wiring stop
    let mut max_apogee_rel_harness: f64 = 0.0; // E1a'-apogee: the wiring stop
    let mut max_site_ft_ulp: f64 = 0.0;
    let mut max_site_temp_ulp: f64 = 0.0;

    for entry in entries(&manifest) {
        let slug = entry["slug"].as_str().unwrap().to_string();
        let (fv, fm, _vehicle, _motor) = prepared(entry);
        let absent = absent_options(entry);
        let bundle = bundle_options(entry);

        // --- independent harness build of the SHIPPED rule (never the product
        // resolver, never the evidence seam) -------------------------------
        let (ref_flight, ref_tables) = reference_flight(entry, &bundle);
        let (harness_powered, harness_coasting) = ref_tables.expect("cohort designs are supported");

        // --- E1a'-tables: the product's tables == the harness build ---------
        let ((prod_powered, prod_coasting), prod_text) =
            commands::evidence_calibrated_tables(&fv, &fm, &bundle)
                .unwrap_or_else(|e| panic!("{slug}: evidence tables: {e}"))
                .expect("supported design builds tables");
        let mut table_rel_harness: f64 = 0.0;
        for (ours, theirs) in [(&prod_powered, &harness_powered), (&prod_coasting, &harness_coasting)] {
            for i in 0..STATIONS {
                table_rel_harness = table_rel_harness.max(rel(ours[i], theirs[i]));
            }
        }
        max_table_rel_harness = max_table_rel_harness.max(table_rel_harness);
        if table_rel_harness > 1e-12 {
            failures.push(format!(
                "{slug}: E1a'-tables product table != harness build (rel {table_rel_harness:e})"
            ));
        }

        // --- E1a'-apogee: the product's flight == the harness flight --------
        let dto = commands::simulate_flight(fv.clone(), fm.clone(), bundle.clone())
            .unwrap_or_else(|e| panic!("{slug}: {e}"));
        let prod = dto.apogee_altitude;
        let harness = ref_flight.apogee_altitude;
        let two_pass_rel = rel(prod, harness);
        max_apogee_rel_harness = max_apogee_rel_harness.max(two_pass_rel);
        if two_pass_rel > 1e-12 {
            failures.push(format!("{slug}: E1a'-apogee product apogee {prod:?} != harness {harness:?} (rel {two_pass_rel:e})"));
        }

        // --- E1a'-text: one resolved value, one string ----------------------
        if dto.run_manifest["axialDrag"].as_str() != Some(prod_text.as_str()) {
            failures.push(format!("{slug}: E1a'-text seam string != flight manifest string"));
        }

        // --- R1/R2 (reported): the measured gap to R41's B0 ladder ----------
        let stored = &tables[&slug]["primary"];
        let mut table_rel: f64 = 0.0;
        for (phase, ours) in [("powered", &prod_powered), ("coasting", &prod_coasting)] {
            let theirs = stored[phase].as_array().unwrap();
            assert_eq!(theirs.len(), STATIONS, "{slug} {phase}: station count");
            for i in 0..STATIONS {
                table_rel = table_rel.max(rel(ours[i], theirs[i].as_f64().unwrap()));
            }
        }
        max_table_rel = max_table_rel.max(table_rel);
        let want = stack[&slug];
        let e2_rel = rel(prod, want);
        max_apogee_rel_r41 = max_apogee_rel_r41.max(e2_rel);

        // R3 (plain ladder vs R41) is intentionally not gated here: this is an
        // app-bound engine, not the E-1/E-1b research engine. The reported
        // table/apogee deltas above are the difference the frontend asked for.

        // --- the declared unit round trips (reported, not gated) ------------
        let site_ft_manifest = entry["launch_site"]["altitude_ft"].as_f64().unwrap();
        let site_ft_bundle = bundle.launch_altitude_asl.unwrap_or(0.0) / 0.3048;
        let temp_f_manifest = entry["launch_site"]["temperature_f"].as_f64().unwrap();
        let temp_f_bundle = bundle.launch_site_temperature_c.unwrap() * 1.8 + 32.0;
        max_site_ft_ulp = max_site_ft_ulp.max(rel(site_ft_bundle, site_ft_manifest));
        max_site_temp_ulp = max_site_temp_ulp.max(rel(temp_f_bundle, temp_f_manifest));

        // --- E4: the manifest string is the one that flew -------------------
        let text = dto.run_manifest["axialDrag"].as_str().unwrap();
        if !text.starts_with("calibrated build-up axial drag (alpha = 0)") {
            failures.push(format!("{slug}: E4 axialDrag does not name the calibrated source"));
        }
        let tip = fv.components.iter().find(|c| c.kind == "nosecone").and_then(|c| c.tip_radius);
        match tip {
            Some(r) => {
                if !text.contains(&format!("nose tipRadius {r} m")) {
                    failures.push(format!("{slug}: E4 tip radius missing from the manifest"));
                }
            }
            None => {
                if !text.contains("nose tipRadius none (sharp)") {
                    failures.push(format!("{slug}: E4 sharp tip not stated"));
                }
            }
        }
        if entry["launch_site"]["temperature_f"].as_f64().is_some() && !text.contains("site-anchored air") {
            failures.push(format!("{slug}: E4 site air not stated"));
        }

        // --- baseline apogee for the cohort table ---------------------------
        let base = commands::simulate_flight(fv.clone(), fm.clone(), absent.clone()).expect("absent");
        rows.push(json!({
            "slug": slug,
            "airframe_group": entry["airframe_group"],
            "geometry_group": geometry_group(entry["slug"].as_str().unwrap(), entry["airframe_group"].as_str().unwrap()),
            "table_row": entry["table_row"],
            "engine_designation": entry["engine_designation"],
            "measured_altitude_ft": entry["measured_altitude_ft"],
            "measured_altitude_m": entry["measured_altitude_m"],
            "declared_tip_radius_m": tip,
            "declared_nozzle_exit_m": fv.nozzle_exit_diameter,
            "b0_apogee_agl_m": base.apogee_altitude,
            "bundle_apogee_agl_m": prod,
            "harness_apogee_agl_m": harness,
            "r41_stack_apogee_agl_m": want,
            "residual_pct": residual_pct(prod, entry["measured_altitude_m"].as_f64().unwrap()),
            "b0_residual_pct": residual_pct(base.apogee_altitude, entry["measured_altitude_m"].as_f64().unwrap()),
            "max_mach": dto.max_mach,
            "validity": dto.validity,
            "axial_drag": text,
            "table_rel_vs_r41": table_rel,
            "apogee_rel_vs_r41": e2_rel,
            "apogee_rel_vs_harness": two_pass_rel,
        }));
    }

    let pass = failures.is_empty();
    let payload = json!({
        "schema": "astraea-r44-wiring/1.0.0",
        "identity": {
            "manifest_sha256": R40_MANIFEST_SHA,
            "r41_parity_sha256": R41_PARITY_SHA,
            "r41_arms_corrected_sha256": R41_ARMS_CORRECTED_SHA,
        },
        "checks": {
            "E1a_prime_tables": {
                "rule": "product tables == independent harness build of the shipped rule",
                "tolerance": 1e-12,
                "max_rel": max_table_rel_harness,
            },
            "E1a_prime_apogee": {
                "rule": "product apogee == harness flight flown with the harness tables",
                "tolerance": 1e-12,
                "max_rel": max_apogee_rel_harness,
            },
            "R3_plain_ladder_reproduction": {
                "rule": "research-only R41 comparison; not run on the app-bound engine",
                "status": "not_run_app_engine",
                "max_table_rel": null,
                "max_apogee_rel": null,
            },
        },
        "reported_ladder_source_difference": {
            "rule": "product (run's own ladder) vs R41's B0-ladder tables and Stack; explained by the ladder source, not gated",
            "max_table_rel_vs_r41_parity": max_table_rel,
            "max_apogee_rel_vs_r41_stack": max_apogee_rel_r41,
        },
        "max_site_altitude_rel_roundtrip": max_site_ft_ulp,
        "max_site_temperature_rel_roundtrip": max_site_temp_ulp,
        "counts": {"designs": rows.len()},
        "designs": rows,
        "verdict": {"pass": pass, "failures": failures},
    });
    fs::write(out.join("wiring.json"), serde_json::to_string_pretty(&payload).unwrap()).unwrap();
    eprintln!(
        "wiring: pass {pass}  E1a' tables {max_table_rel_harness:e} apogee {max_apogee_rel_harness:e}  \
         R3 not run on app engine  \
         reported vs R41 {max_table_rel:e}/{max_apogee_rel_r41:e}  site ft {max_site_ft_ulp:e} temp {max_site_temp_ulp:e}"
    );
    assert!(pass, "wiring failures: {:?}", payload["verdict"]["failures"]);
}

// ---------------------------------------------------------------------------
// 4. Cohort acceptance
// ---------------------------------------------------------------------------

#[test]
#[ignore = "needs a completed wiring run (env vars); run with --ignored"]
fn cohort() {
    let out = out_dir();
    let manifest = parse_verified(&env_path("ASTRAEA_R44_MANIFEST"), R40_MANIFEST_SHA);
    let wiring: Value = serde_json::from_str(
        &fs::read_to_string(out.join("wiring.json")).expect("run `wiring` first"),
    )
    .unwrap();
    assert_eq!(wiring["verdict"]["pass"], json!(true), "wiring did not pass; no acceptance report");
    let rows: Vec<Value> = wiring["designs"].as_array().unwrap().clone();

    let summary = summaries(&rows);
    let head = &summary["primary_headline"]["airframe"];
    let mae = head["mean_absolute_pct"].as_f64().unwrap();
    let signed = head["mean_signed_pct"].as_f64().unwrap();
    let within_10 = head["within_10"].as_i64().unwrap();
    let n = head["n"].as_i64().unwrap();
    let within_0_5pp = (mae - R41_STACK_MAE_PCT).abs() <= 0.5;

    // Reported sensitivity: the pad-level ladder (R41's S-arm), harness-built
    // and labelled as such; never the headline.
    let mut pad_rows = Vec::new();
    let mut pad_failures = Vec::new();
    for entry in entries(&manifest) {
        let slug = entry["slug"].as_str().unwrap();
        let (fv, _fm, vehicle, motor) = prepared(entry);
        let aero = models::to_aero_vehicle(&fv).expect("aero");
        let design = match astraea_core::aero_model::design_from_app_vehicle(&aero) {
            Ok(d) => d,
            Err(e) => {
                pad_failures.push(format!("{slug}: refused: {e}"));
                continue;
            }
        };
        let zeros = vec![Some(0.0); STATIONS];
        let tables = reference_tables(&design, fv.nozzle_exit_diameter.map(|d| d / 0.0254),
            Some(r41_site(entry)), &zeros, &zeros, 0.0).expect("pad tables");
        let mut dragged = vehicle.clone();
        dragged.aero_powered_cd = tables.0;
        dragged.aero_coasting_cd = tables.1;
        let o = bundle_options(entry);
        let r = simulate_flight(&dragged, &motor, &core_options(&o, false)).expect("pad flight");
        pad_rows.push(json!({
            "slug": slug,
            "airframe_group": entry["airframe_group"],
            "geometry_group": geometry_group(slug, entry["airframe_group"].as_str().unwrap()),
            "residual_pct": residual_pct(r.apogee_altitude, entry["measured_altitude_m"].as_f64().unwrap()),
            "apogee_agl_m": r.apogee_altitude,
        }));
    }
    let pad_summary = summaries(&pad_rows);

    let criteria = json!({
        "mean_absolute_pct_max": 7.0,
        "mean_absolute_pct": mae,
        "mean_absolute_pass": mae <= 7.0,
        "within_10_min": 15,
        "within_10": within_10,
        "within_10_pass": within_10 >= 15,
        "mean_signed_abs_max": 5.0,
        "mean_signed_pct": signed,
        "mean_signed_pass": signed.abs() <= 5.0,
        "within_0_5pp_of_corrected_r41_stack": within_0_5pp,
        "r41_stack_mae_pct": R41_STACK_MAE_PCT,
        "delta_from_r41_stack_pp": mae - R41_STACK_MAE_PCT,
        "within_0_5pp_pass": within_0_5pp,
        "n_airframes": n,
    });
    let pass = criteria["mean_absolute_pass"].as_bool().unwrap()
        && criteria["within_10_pass"].as_bool().unwrap()
        && criteria["mean_signed_pass"].as_bool().unwrap();

    let payload = json!({
        "schema": "astraea-r44-cohort/1.0.0",
        "identity": {
            "manifest_sha256": R40_MANIFEST_SHA,
            "r41_arms_corrected_sha256": R41_ARMS_CORRECTED_SHA,
            "wiring_json": "wiring.json",
        },
        "arm": "shipping bundle: flightDragSource=calibrated + launchSiteTemperatureC + nozzleExitDiameter",
        "flights": rows,
        "summaries": summary,
        "acceptance": criteria,
        "pad_level_sensitivity": {
            "note": "harness-built single-altitude ladder (R41 S-arm construction), reported only; not a selection criterion",
            "summaries": pad_summary,
            "expected_r41_s_stack_mae_pct": R41_S_STACK_MAE_PCT,
            "failures": pad_failures,
        },
        "reference_b0_mae_pct": R41_B0_MAE_PCT,
        "reference_r41_stack_signed_pct": R41_STACK_SIGNED_PCT,
        "delta_signed_vs_r41_stack_pp": signed - R41_STACK_SIGNED_PCT,
        "verdict": {"pass": pass},
    });
    fs::write(out.join("cohort.json"), serde_json::to_string_pretty(&payload).unwrap()).unwrap();
    eprintln!(
        "cohort: MAE {mae:.4}% signed {signed:+.4}% within10 {within_10}/{n} pass {pass} \
         (delta vs R41 {:.4} pp); pad-level MAE {:.4}%",
        mae - R41_STACK_MAE_PCT,
        pad_summary["primary_headline"]["airframe"]["mean_absolute_pct"].as_f64().unwrap()
    );
    assert!(pass, "acceptance failed: {criteria}");
}

// ---------------------------------------------------------------------------
// 5. Development vehicles
// ---------------------------------------------------------------------------

#[test]
#[ignore = "needs the frozen R41 dev evidence (env vars); run with --ignored"]
fn dev_vehicles() {
    let out = out_dir();
    let dev = parse_verified(&env_path("ASTRAEA_R44_DEV_MANIFEST"), DEV_MANIFEST_SHA);
    let reference = parse_verified(&env_path("ASTRAEA_R44_DEV_VEHICLES"), DEV_VEHICLES_SHA);

    // Reference apogees per flight id and arm.
    let mut want: BTreeMap<String, BTreeMap<String, f64>> = BTreeMap::new();
    for f in reference["flights"].as_array().unwrap() {
        want.entry(f["id"].as_str().unwrap().to_string())
            .or_default()
            .insert(f["arm"].as_str().unwrap().to_string(), f["apogee_agl_m"].as_f64().unwrap());
    }

    let mut rows = Vec::new();
    let mut failures = Vec::new();
    let mut per_vehicle: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    let mut per_vehicle_b0: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    for entry in dev["entries"].as_array().unwrap() {
        let id = entry["id"].as_str().unwrap().to_string();
        let case = entry["case"].as_str().unwrap().to_string();
        let measured = entry["measured_apogee_m"].as_f64().unwrap();
        let (fv, fm, _vehicle, _motor) = prepared(entry);
        let mut base: FlightOptionsDto = serde_json::from_value(entry["options"].clone()).unwrap();
        let base_dto = commands::simulate_flight(fv.clone(), fm.clone(), base.clone()).expect("b0");
        base.flight_drag_source = Some("calibrated".to_string());
        // The frozen dev manifest declares no site temperature and no nozzle,
        // so the bundle reduces to the drag source alone (R41's dev arm).
        let dto = commands::simulate_flight(fv.clone(), fm.clone(), base).expect("drag");
        let text = dto.run_manifest["axialDrag"].as_str().unwrap().to_string();

        let refused = text.contains("legacy drag used (refused:");
        let reference_arm = if refused { "B0" } else { "A-drag" };
        let want_apogee = want[&id].get(reference_arm).copied()
            .unwrap_or_else(|| panic!("{id}: no reference arm {reference_arm}"));
        let r = rel(dto.apogee_altitude, want_apogee);
        // Reported, not gated: R41's dev evidence is from the E-1b research
        // engine. The app-bound difference is recorded in `rel_vs_r41`.
        if refused {
            if !bits_eq(dto.apogee_altitude, base_dto.apogee_altitude) {
                failures.push(format!("{id}: refused shape changed the flight"));
            }
            if !text.contains("freeform planform") {
                failures.push(format!("{id}: refusal reason missing from the manifest"));
            }
        } else if bits_eq(dto.apogee_altitude, base_dto.apogee_altitude) {
            failures.push(format!("{id}: calibrated drag did not change a supported vehicle"));
        }
        per_vehicle.entry(case.clone()).or_default().push(residual_pct(dto.apogee_altitude, measured));
        per_vehicle_b0.entry(case.clone()).or_default().push(residual_pct(base_dto.apogee_altitude, measured));
        rows.push(json!({
            "id": id,
            "case": case,
            "measured_apogee_m": measured,
            "b0_apogee_agl_m": base_dto.apogee_altitude,
            "drag_apogee_agl_m": dto.apogee_altitude,
            "b0_residual_pct": residual_pct(base_dto.apogee_altitude, measured),
            "drag_residual_pct": residual_pct(dto.apogee_altitude, measured),
            "reference_arm": reference_arm,
            "reference_apogee_agl_m": want_apogee,
            "rel_vs_r41": r,
            "refused": refused,
            "axial_drag": text,
        }));
    }
    let mut vehicles = Vec::new();
    for (case, residuals) in &per_vehicle {
        vehicles.push(json!({
            "vehicle": case,
            "flights": residuals.len(),
            "b0_median_residual_pct": median(per_vehicle_b0[case].clone()),
            "drag_median_residual_pct": median(residuals.clone()),
        }));
    }
    let pass = failures.is_empty();
    let payload = json!({
        "schema": "astraea-r44-dev-vehicles/1.0.0",
        "identity": {"dev_manifest_sha256": DEV_MANIFEST_SHA, "dev_vehicles_sha256": DEV_VEHICLES_SHA},
        "vehicles": vehicles,
        "flights": rows,
        "owner_stop_check": "not exercisable: the two ±5 %-critical vehicles are refused by the calibrated method and stay bit-identical (R41's disposition)",
        "verdict": {"pass": pass, "failures": failures},
    });
    fs::write(out.join("dev-vehicles.json"), serde_json::to_string_pretty(&payload).unwrap()).unwrap();
    eprintln!("dev_vehicles: pass {pass}");
    assert!(pass, "dev vehicle failures: {:?}", payload["verdict"]["failures"]);
}

// ---------------------------------------------------------------------------
// 6. Ensembles (amendment 1)
// ---------------------------------------------------------------------------

#[test]
#[ignore = "needs the frozen R40/R42 evidence (env vars); run with --ignored"]
fn ensembles() {
    let out = out_dir();
    let manifest = parse_verified(&env_path("ASTRAEA_R44_MANIFEST"), R40_MANIFEST_SHA);
    let entry = entries(&manifest).iter()
        .find(|e| e["slug"].as_str() == Some("torrent")).expect("torrent");
    let (fv, fm, _vehicle, _motor) = prepared(entry);
    let base: FlightOptionsDto = serde_json::from_value(entry["options"].clone()).unwrap();
    let zero = SigmasDto {
        wind_azimuth_deg_sigma: Some(0.0),
        rail_angle_deg_sigma: Some(0.0),
        impulse_pct_sigma: Some(0.0),
    };
    let mut failures = Vec::new();

    // --- A-N4a: option absent, whole == chunked (app-bound base) -----------
    let absent_whole = commands::run_ensemble(EnsembleRequest {
        vehicle: fv.clone(), motor: fm.clone(), options: base.clone(), sigmas: zero.clone(),
        n_runs: 4, seed: 7, version: "per-run-v2".to_string(),
    }).expect("absent whole");
    if absent_whole.axial_drag != LEGACY_TEXT {
        failures.push(format!("A-N4a: absent ensemble text {:?}", absent_whole.axial_drag));
    }
    let a1 = commands::run_ensemble_chunk(EnsembleChunkRequest {
        vehicle: fv.clone(), motor: fm.clone(), options: base.clone(), sigmas: zero.clone(),
        n_runs: 4, seed: 7, version: "per-run-v2".to_string(), run_start: 0, run_end: 2,
    }).expect("absent chunk 0..2");
    let a2 = commands::run_ensemble_chunk(EnsembleChunkRequest {
        vehicle: fv.clone(), motor: fm.clone(), options: base.clone(), sigmas: zero.clone(),
        n_runs: 4, seed: 7, version: "per-run-v2".to_string(), run_start: 2, run_end: 4,
    }).expect("absent chunk 2..4");
    let absent_chunked: Vec<(f64, f64)> = a1.landings.iter().chain(a2.landings.iter())
        .map(|p| (p.x, p.y)).collect();
    let absent_chunk_same = absent_chunked.len() == absent_whole.landings.len()
        && absent_chunked.iter().zip(&absent_whole.landings).all(|(a, b)| bits_eq(a.0, b.x) && bits_eq(a.1, b.y));
    if !absent_chunk_same {
        failures.push("A-N4a: absent chunked ensemble differs from the whole".to_string());
    }

    // --- A-N4b/d: option present, chunk == whole, text stated --------------
    let mut o = base.clone();
    o.flight_drag_source = Some("calibrated".to_string());
    let whole = commands::run_ensemble(EnsembleRequest {
        vehicle: fv.clone(), motor: fm.clone(), options: o.clone(), sigmas: zero.clone(),
        n_runs: 4, seed: 7, version: "per-run-v2".to_string(),
    }).expect("whole");
    let c1 = commands::run_ensemble_chunk(EnsembleChunkRequest {
        vehicle: fv.clone(), motor: fm.clone(), options: o.clone(), sigmas: zero.clone(),
        n_runs: 4, seed: 7, version: "per-run-v2".to_string(), run_start: 0, run_end: 3,
    }).expect("chunk 0..3");
    let c2 = commands::run_ensemble_chunk(EnsembleChunkRequest {
        vehicle: fv.clone(), motor: fm.clone(), options: o.clone(), sigmas: zero.clone(),
        n_runs: 4, seed: 7, version: "per-run-v2".to_string(), run_start: 3, run_end: 4,
    }).expect("chunk 3..4");
    let chunked: Vec<(f64, f64)> = c1.landings.iter().chain(c2.landings.iter()).map(|p| (p.x, p.y)).collect();
    let present_chunk_same = chunked.len() == whole.landings.len()
        && chunked.iter().zip(&whole.landings).all(|(a, b)| bits_eq(a.0, b.x) && bits_eq(a.1, b.y));
    if !present_chunk_same {
        failures.push("A-N4b: option-present chunked ensemble differs from the whole".to_string());
    }
    let text = whole.axial_drag.clone();
    if !text.contains("drag ladder from the nominal baseline flight; ensemble members share it") {
        failures.push(format!("A-N4d: sharing sentence missing: {text}"));
    }
    if text != c1.axial_drag || text != c2.axial_drag {
        failures.push("A-N4b: ensemble text differs between chunk and whole".to_string());
    }
    if !text.contains("at the nominal baseline flight's ascent altitudes") {
        failures.push(format!("A-N4d: nominal ladder not stated: {text}"));
    }
    // The flight manifest uses the single-flight wording, not the ensemble one.
    let single = commands::simulate_flight(fv.clone(), fm.clone(), o.clone()).expect("single");
    let single_text = single.run_manifest["axialDrag"].as_str().unwrap();
    if single_text.contains("ensemble members share it") {
        failures.push("A-N4d: single flight claims a shared ladder".to_string());
    }
    if !single_text.contains("the run's own ascent altitudes") {
        failures.push(format!("A-N4d: single ladder wording wrong: {single_text}"));
    }

    // --- A-N4c: every member is the single flight --------------------------
    let member_eq_single = whole.landings.iter().all(|p|
        bits_eq(p.x, single.landing_position.x) && bits_eq(p.y, single.landing_position.y));
    if !member_eq_single {
        failures.push("A-N4c: zero-sigma member differs from the single flight".to_string());
    }
    // And with the option absent the member is the absent single flight too.
    let absent_single = commands::simulate_flight(fv.clone(), fm.clone(), base.clone()).expect("absent single");
    let absent_member_eq = absent_whole.landings.iter().all(|p|
        bits_eq(p.x, absent_single.landing_position.x) && bits_eq(p.y, absent_single.landing_position.y));
    if !absent_member_eq {
        failures.push("A-N4c: absent zero-sigma member differs from the absent single flight".to_string());
    }

    let pass = failures.is_empty();
    let payload = json!({
        "schema": "astraea-r44-ensembles/1.0.0",
        "identity": {"manifest_sha256": R40_MANIFEST_SHA, "r42_ensembles_sha256": "not used on the app-bound engine"},
        "slug": "torrent",
        "checks": {
            "A-N4a_absent_matches_r42": "not_gated_on_app_engine",
            "A-N4a_absent_chunk_equals_whole": absent_chunk_same,
            "A-N4b_present_chunk_equals_whole": present_chunk_same,
            "A-N4c_member_equals_single": member_eq_single,
            "A-N4c_absent_member_equals_single": absent_member_eq,
            "A-N4d_ensemble_text": text,
            "A-N4d_single_text": single_text,
        },
        "absent_landings": absent_whole.landings.iter().map(|p| json!({"x": p.x, "y": p.y})).collect::<Vec<_>>(),
        "present_landings": whole.landings.iter().map(|p| json!({"x": p.x, "y": p.y})).collect::<Vec<_>>(),
        "verdict": {"pass": pass, "failures": failures},
    });
    fs::write(out.join("ensembles.json"), serde_json::to_string_pretty(&payload).unwrap()).unwrap();
    eprintln!("ensembles: pass {pass}");
    assert!(pass, "ensemble failures: {:?}", payload["verdict"]["failures"]);
}


#[test]
#[ignore = "diagnostic: proves which baseline flight R41's frozen tables came from"]
fn ladder_source_diagnostic() {
    // Hypothesis: R41's tables were built from its B0 flight (ISA atmosphere,
    // no back-pressure term), while R44's pass 1 carries the R42 inputs.
    let manifest = parse_verified(&env_path("ASTRAEA_R44_MANIFEST"), R40_MANIFEST_SHA);
    let parity = parse_verified(&env_path("ASTRAEA_R44_R41_PARITY"), R41_PARITY_SHA);
    let arms = parse_verified(&env_path("ASTRAEA_R44_R41_ARMS_CORRECTED"), R41_ARMS_CORRECTED_SHA);
    let stack: std::collections::BTreeMap<String, f64> = arms["flights"]["Stack"].as_array().unwrap().iter()
        .map(|f| (f["slug"].as_str().unwrap().to_string(), f["apogee_agl_m"].as_f64().unwrap())).collect();
    let mut max_tab_plain: f64 = 0.0;
    let mut max_tab_bundle: f64 = 0.0;
    let mut max_apo_plain: f64 = 0.0;
    let mut max_apo_bundle: f64 = 0.0;
    for entry in entries(&manifest) {
        let slug = entry["slug"].as_str().unwrap().to_string();
        let (fv, _fm, vehicle, motor) = prepared(entry);
        let absent = absent_options(entry);
        let bundle = bundle_options(entry);
        let aero = models::to_aero_vehicle(&fv).unwrap();
        let Ok(design) = astraea_core::aero_model::design_from_app_vehicle(&aero) else { continue };
        let site = r41_site(entry);
        let nozzle = fv.nozzle_exit_diameter.map(|d| d / 0.0254);
        for (label, opt, site_choice, max_tab, max_apo) in [
            ("plain", &absent, Some(site), &mut max_tab_plain, &mut max_apo_plain),
            ("bundle", &bundle, Some(site), &mut max_tab_bundle, &mut max_apo_bundle),
        ] {
            let pass1 = simulate_flight(&vehicle, &motor, &core_options(opt, true)).unwrap();
            let rows: Vec<&astraea_core::telemetry::TelemetryPoint> =
                pass1.telemetry.iter().filter(|p| p.time <= pass1.apogee_time).collect();
            let p_alt = station_altitudes(&rows, motor.burn_time, true);
            let c_alt = station_altitudes(&rows, motor.burn_time, false);
            let (p, c) = reference_tables(&design, nozzle, site_choice, &p_alt, &c_alt, 0.0).unwrap();
            let stored = &parity["tables"][&slug]["primary"];
            for (phase, ours) in [("powered", &p), ("coasting", &c)] {
                let theirs = stored[phase].as_array().unwrap();
                for i in 0..STATIONS {
                    *max_tab = max_tab.max(rel(ours[i], theirs[i].as_f64().unwrap()));
                }
            }
            // Fly the bundle with these tables and compare to R41's Stack.
            let mut dragged = vehicle.clone();
            dragged.aero_powered_cd = p;
            dragged.aero_coasting_cd = c;
            let r = simulate_flight(&dragged, &motor, &core_options(&bundle, false)).unwrap();
            *max_apo = max_apo.max(rel(r.apogee_altitude, stack[&slug]));
            if label == "plain" && rel(r.apogee_altitude, stack[&slug]) > 1e-9 {
                eprintln!("{slug}: plain-ladder apogee rel {:.3e}", rel(r.apogee_altitude, stack[&slug]));
            }
        }
    }
    let out = out_dir();
    let payload = json!({
        "schema": "astraea-r44-ladder-source/1.0.0",
        "question": "which baseline flight produced the frozen R41 tables",
        "plain_ladder": {
            "definition": "pass 1 with the R42 inputs cleared: standard atmosphere, no back-pressure term (R41's B0)",
            "max_table_rel_vs_r41": max_tab_plain,
            "max_apogee_rel_vs_r41_stack": max_apo_plain,
        },
        "bundle_ladder": {
            "definition": "pass 1 with the run's own R42 inputs (as implemented under the frozen rule)",
            "max_table_rel_vs_r41": max_tab_bundle,
            "max_apogee_rel_vs_r41_stack": max_apo_bundle,
        },
        "identity": {"r41_parity_sha256": R41_PARITY_SHA, "r41_arms_corrected_sha256": R41_ARMS_CORRECTED_SHA},
        "verdict": "R41's tables came from the plain B0 ladder; the frozen R44 rule samples the run's own flight, which carries the R42 inputs. F3 fired under the frozen E1a/E2 tolerances.",
    });
    fs::write(out.join("ladder-source.json"), serde_json::to_string_pretty(&payload).unwrap()).unwrap();
    eprintln!("PLAIN  ladder: max table rel {max_tab_plain:e}  max apogee rel {max_apo_plain:e}");
    eprintln!("BUNDLE ladder: max table rel {max_tab_bundle:e}  max apogee rel {max_apo_bundle:e}");
}
