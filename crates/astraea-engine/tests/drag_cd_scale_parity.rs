//! Field drag-Cd calibration (`dragCdScale`) through the Tauri command path:
//! a scaled flight must reproduce the TS `simulate6DofFlight` oracle for the
//! Estes Alpha (`PRESET_ESTES_ALPHA`) + Estes C6 (`CERTIFIED_MOTORS.estes_c6`)
//! at scales 0.6118 and 0.44.
//!
//! Fixture: tests/fixtures/drag-cd-scale-parity.json, generated from the
//! current TS sources (the wire payload `src/tauri/bridge.ts` sends, plus TS
//! oracle apogees/times from `simulate6DofFlight`). `options` is the exact
//! bridge payload, so this also pins that the native DTO accepts every field
//! the bridge sends (`#[serde(deny_unknown_fields)]`) -- a gap fails closed
//! here rather than silently dropping an option at runtime.

use astraea_engine::{commands, models};

#[test]
fn drag_cd_scale_flights_match_the_ts_oracle() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/drag-cd-scale-parity.json");
    let text = std::fs::read_to_string(path).expect("fixture");
    let doc: serde_json::Value = serde_json::from_str(&text).expect("fixture json");
    let vehicle: models::FrontendVehicle =
        serde_json::from_value(doc["vehicle"].clone()).expect("vehicle");
    let motor: models::FrontendMotor = serde_json::from_value(doc["motor"].clone()).expect("motor");
    let cases = doc["cases"].as_array().expect("cases");
    assert_eq!(cases.len(), 2, "both scales");

    for row in cases {
        let label = row["case"].as_str().expect("case");
        let options: models::FlightOptionsDto = serde_json::from_value(row["options"].clone())
            .unwrap_or_else(|e| panic!("{label}: bridge payload rejected by the DTO: {e}"));
        assert!(
            options.drag_cd_scale.is_some(),
            "{label}: fixture must carry dragCdScale"
        );
        let expected_apogee = row["tsApogeeAltitude"].as_f64().expect("oracle apogee");
        let expected_duration = row["tsFlightDuration"].as_f64().expect("oracle duration");

        let result = commands::simulate_flight(vehicle.clone(), motor.clone(), options.clone())
            .unwrap_or_else(|e| panic!("{label}: {e}"));
        let wire = serde_json::to_value(&result).expect("dto");
        let apogee = wire["apogeeAltitude"].as_f64().expect("apogee");
        let duration = wire["flightDuration"].as_f64().expect("duration");
        // Trajectory parity: the TS and native kernels are line-ported, so the
        // scaled apogee reproduces to <= 1e-12 relative. The flight-duration
        // event is the C3 midpoint of a 1e-7 s root bracket; its estimate is
        // compared to that declared numerical root width.
        let rel_apogee = (apogee - expected_apogee).abs() / expected_apogee;
        assert!(
            rel_apogee <= 1e-12,
            "{label}: rust apogee {apogee} vs TS oracle {expected_apogee} (rel {rel_apogee:e})"
        );
        // C3 reports the midpoint of a 1e-7 s event-root bracket. The
        // trajectory parity remains 1e-12; the event-time estimate is bounded
        // by the declared numerical root width, not a sub-picosecond claim.
        let duration_gap = (duration - expected_duration).abs();
        assert!(
            duration_gap <= astraea_core::six_dof::EVENT_ROOT_WIDTH_S,
            "{label}: rust duration {duration} vs TS oracle {expected_duration} (gap {duration_gap:e} s)"
        );

        // The calibration must reach the kernel: both fixture scales are below
        // 1.0, so dropping it restores the model Cd and lowers the apogee well
        // below the scaled pin (the field is honoured, never ignored).
        let unscaled = commands::simulate_flight(
            vehicle.clone(),
            motor.clone(),
            models::FlightOptionsDto { drag_cd_scale: None, ..options },
        )
        .unwrap_or_else(|e| panic!("{label}: unscaled run failed: {e}"));
        assert!(
            unscaled.apogee_altitude < apogee - 1.0,
            "{label}: dragCdScale must lift apogee below 1.0 (scaled {apogee} m, unscaled {} m)",
            unscaled.apogee_altitude
        );
    }
}
