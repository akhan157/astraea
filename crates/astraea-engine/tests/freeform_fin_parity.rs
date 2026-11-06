//! Freeform fin sets: native engine vs the TS oracles.
//!
//! Fixture `tests/fixtures/freeform-fin-parity.json` is generated from the TS
//! sources by `pnpm fixtures:freeform` (never hand-edited). For two vehicles
//! (Estes Alpha + C6, and the NASA Student Launch vehicle + M1820, which flies
//! transonic) it holds a trapezoid, the same trapezoid written as a freeform
//! polygon, and a genuinely non-trapezoidal clipped delta with a stepped
//! leading edge. The native engine must reproduce, for every case, the mass
//! rollup, Barrowman stability, powered and coasting drag/CP curves over Mach
//! 0–4, and the flight (apogee, duration, landing, events and sampled series).
//!
//! It also pins the equivalence the feature rests on: a freeform polygon that
//! traces a trapezoid is indistinguishable from the trapezoid in the native
//! engine itself, through a complete flight.

use astraea_engine::models;

const REL: f64 = 1e-9;

fn close(got: f64, want: f64, what: &str) {
    let abs = (got - want).abs();
    assert!(
        abs <= REL * want.abs() || abs <= 1e-12,
        "{what}: native {got} vs oracle {want} (abs {abs:e})"
    );
}

fn num(v: &serde_json::Value) -> f64 {
    v.as_f64().expect("number")
}

fn load() -> serde_json::Value {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/freeform-fin-parity.json");
    serde_json::from_str(&std::fs::read_to_string(path).expect("fixture")).expect("fixture json")
}

fn options_of(v: &serde_json::Value) -> astraea_core::six_dof::SixDofOptions {
    let o: models::FlightOptionsDto = serde_json::from_value(v.clone()).expect("options");
    astraea_core::six_dof::SixDofOptions {
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
        record_telemetry: true,
        record_moment_arm_history: false,
    }
}

struct Flown {
    result: astraea_core::six_dof::SimulationResult,
}

fn fly(doc: &serde_json::Value, case: &serde_json::Value) -> Flown {
    let label = case["case"].as_str().unwrap();
    let vehicle: models::FrontendVehicle =
        serde_json::from_value(case["vehicle"].clone()).expect("vehicle");
    let motor_key = case["motorKey"].as_str().unwrap();
    let motor: models::FrontendMotor =
        serde_json::from_value(doc["motors"][motor_key].clone()).expect("motor");
    let prepared = models::prepare_flight_vehicle(&vehicle, &motor)
        .unwrap_or_else(|e| panic!("{label}: {e}"));
    let core_motor = models::to_motor(&motor).unwrap_or_else(|e| panic!("{label}: {e}"));
    let result = astraea_core::six_dof::simulate_flight(
        &prepared,
        &core_motor,
        &options_of(&case["options"]),
    )
    .unwrap_or_else(|e| panic!("{label}: {e}"));
    Flown { result }
}

#[test]
fn native_engine_matches_the_ts_oracle_for_every_case() {
    let doc = load();
    for case in doc["cases"].as_array().unwrap() {
        let label = case["case"].as_str().unwrap();
        let vehicle: models::FrontendVehicle =
            serde_json::from_value(case["vehicle"].clone()).expect("vehicle");

        // ---- mass rollup ---------------------------------------------------
        let rollup = astraea_core::mass::aggregate_mass(&models::to_mass_vehicle(&vehicle).unwrap())
            .unwrap_or_else(|e| panic!("{label}: {e}"));
        let want = &case["mass"];
        close(rollup.total_mass, num(&want["totalMass"]), &format!("{label} total mass"));
        close(rollup.cg, num(&want["cg"]), &format!("{label} cg"));
        close(rollup.total_length, num(&want["totalLength"]), &format!("{label} length"));
        for (got, want) in rollup.components.iter().zip(want["components"].as_array().unwrap()) {
            assert_eq!(got.id, want["id"].as_str().unwrap());
            close(got.mass, num(&want["mass"]), &format!("{label} {} mass", got.id));
            close(got.local_cg, num(&want["localCG"]), &format!("{label} {} local cg", got.id));
            close(got.global_cg, num(&want["globalCG"]), &format!("{label} {} global cg", got.id));
            close(got.axial_end, num(&want["axialEnd"]), &format!("{label} {} end", got.id));
        }

        // ---- stability -----------------------------------------------------
        let aero_v = models::to_aero_vehicle(&vehicle).unwrap();
        let stab = astraea_core::aero::stability(&aero_v).unwrap_or_else(|e| panic!("{label}: {e}"));
        let want = &case["stability"];
        close(stab.cp, num(&want["cp"]), &format!("{label} cp"));
        close(stab.total_cna, num(&want["totalCNa"]), &format!("{label} CNa"));
        close(
            stab.static_margin_calibers,
            num(&want["staticMarginCalibers"]),
            &format!("{label} margin"),
        );
        for (got, want) in stab.contributions.iter().zip(want["contributions"].as_array().unwrap()) {
            assert_eq!(got.kind, want["type"].as_str().unwrap());
            if let Some(w) = want["cna"].as_f64() {
                close(got.cna.unwrap(), w, &format!("{label} {} cna", got.id));
            }
            if let Some(w) = want["cp"].as_f64() {
                close(got.cp.unwrap(), w, &format!("{label} {} cp", got.id));
            }
        }

        // ---- drag/CP curves, powered and coasting ---------------------------
        for (key, burning) in [("curves", true), ("coastCurves", false)] {
            let got = astraea_core::aero::aero_curves(&aero_v, burning).unwrap();
            let rows = case[key].as_array().unwrap();
            assert_eq!(got.drag_curves.len(), rows.len());
            for (g, row) in got.drag_curves.iter().zip(rows) {
                let r: Vec<f64> = row.as_array().unwrap().iter().map(num).collect();
                let at = format!("{label} {key} M{:.2}", r[0]);
                close(g.mach, r[0], &at);
                close(g.total_cd, r[1], &format!("{at} totalCd"));
                close(g.friction_cd, r[2], &format!("{at} frictionCd"));
                close(g.wave_cd, r[3], &format!("{at} waveCd"));
                close(g.base_cd, r[4], &format!("{at} baseCd"));
                close(g.cp, r[5], &format!("{at} cp"));
                close(g.static_margin_calibers, r[6], &format!("{at} margin"));
            }
        }

        // ---- flight --------------------------------------------------------
        let flown = fly(&doc, case).result;
        let want = &case["flight"];
        close(flown.apogee_altitude, num(&want["apogeeAltitude"]), &format!("{label} apogee"));
        close(flown.flight_time, num(&want["flightDuration"]), &format!("{label} duration"));
        close(flown.landing_velocity, num(&want["landingVelocity"]), &format!("{label} landing v"));
        assert_eq!(flown.telemetry.len() as u64, want["pointCount"].as_u64().unwrap(), "{label}: points");
        let events: Vec<f64> = want["eventTimes"].as_array().unwrap().iter().map(num).collect();
        assert_eq!(flown.events.len(), events.len(), "{label}: event count");
        for (e, t) in flown.events.iter().zip(events) {
            close(e.time, t, &format!("{label} event {}", e.name));
        }
        for (k, row) in want["samples"].as_array().unwrap().iter().enumerate() {
            let r: Vec<f64> = row.as_array().unwrap().iter().map(num).collect();
            let p = &flown.telemetry[k * 7];
            let at = format!("{label} sample {k}");
            close(p.time, r[0], &format!("{at} time"));
            close(p.altitude, r[1], &format!("{at} altitude"));
            close(p.speed, r[2], &format!("{at} speed"));
            close(p.mach, r[3], &format!("{at} mach"));
            close(p.drag, r[4], &format!("{at} drag"));
            close(p.mass, r[5], &format!("{at} mass"));
        }
    }
}

#[test]
fn native_freeform_trapezoid_flies_like_the_native_trapezoid() {
    let doc = load();
    let cases = doc["cases"].as_array().unwrap();
    let by = |name: &str| cases.iter().find(|c| c["case"] == name).unwrap();
    for (trap, free) in [
        ("alpha/trapezoid", "alpha/freeform-trapezoid"),
        ("nsl/trapezoid", "nsl/freeform-trapezoid"),
    ] {
        let a = fly(&doc, by(trap)).result;
        let b = fly(&doc, by(free)).result;
        close(b.apogee_altitude, a.apogee_altitude, &format!("{free} apogee"));
        close(b.flight_time, a.flight_time, &format!("{free} duration"));
        close(b.max_mach, a.max_mach, &format!("{free} max Mach"));
        close(b.landing_distance, a.landing_distance, &format!("{free} landing distance"));
        assert_eq!(a.telemetry.len(), b.telemetry.len(), "{free}: points");
        for (p, q) in a.telemetry.iter().zip(b.telemetry.iter()) {
            close(q.altitude, p.altitude, &format!("{free} altitude"));
            close(q.drag, p.drag, &format!("{free} drag"));
        }
    }
}

#[test]
fn invalid_freeform_outlines_are_refused_by_the_native_engine() {
    let doc = load();
    let case = doc["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["case"] == "alpha/freeform-clipped-delta")
        .unwrap();
    let mut json = case["vehicle"].clone();
    let fin = json["components"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|c| c["type"] == "freeformfinset")
        .unwrap();
    fin["points"] = serde_json::json!([{"x":0,"y":0},{"x":0.03,"y":-0.02},{"x":0.07,"y":0}]);
    let vehicle: models::FrontendVehicle = serde_json::from_value(json.clone()).unwrap();
    let err = astraea_core::mass::aggregate_mass(&models::to_mass_vehicle(&vehicle).unwrap())
        .unwrap_err();
    assert!(err.contains("point 2 is inside the body"), "{err}");
    let err = astraea_core::aero::stability(&models::to_aero_vehicle(&vehicle).unwrap()).unwrap_err();
    assert!(err.contains("point 2 is inside the body"), "{err}");

    // A missing outline is a clear wire error, not a default.
    json["components"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|c| c["type"] == "freeformfinset")
        .unwrap()
        .as_object_mut()
        .unwrap()
        .remove("points");
    let vehicle: models::FrontendVehicle = serde_json::from_value(json).unwrap();
    let err = models::to_mass_vehicle(&vehicle).unwrap_err();
    assert!(err.contains("missing points"), "{err}");
}
