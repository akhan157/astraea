//! Native display telemetry vs the TS oracle `simulate6DofFlight`, plus the
//! bounded IPC series contract.
//!
//! Fixture: tests/fixtures/telemetry-parity.json. The trajectory, quaternion,
//! event and scalar columns are the 2026-10-16 oracle fixture
//! (`npm run fixtures:telemetry`, vitest+vite-node over the TS modules, node
//! v24.21.0) for the Estes Alpha + C6 at wind 0 and 3 m/s; the three
//! presentation Euler columns were regenerated 2026-10-29 from an independent
//! derivation (`docs/internal/execution-runs/RMP12-attitude-display/`) after
//! the shipped TS/Rust extraction was found to mix two conventions. The
//! physics and quaternions are unchanged by that regeneration. `points` rows
//! are the full telemetry array in the fixture's `fields` order; the
//! `vehicle`/`motor` blocks are the exact bridge wire payloads (copied from
//! drag-cd-scale-parity.json) so the native run is fed identical inputs.
//!
//! Presentation convention (`attitude-euler/1.0.0`):
//! `R_NB = Rz(yaw) * Rx(pitch) * Ry(roll)`, so `pitch = asin(2(wx+yz))` is the
//! nose elevation, `roll` the right-handed spin about +Y and `yaw` the
//! right-handed rotation about +Z. The triple is nonauthoritative display data;
//! `q` is canonical. At `|pitch| = 90` the roll/yaw split is a gauge.
//!
//! Asserted:
//! * the FULL native series (record_telemetry on, pre-decimation) reproduces
//!   the fixture point-for-point — equal counts, equal instants, every one of
//!   the 26 fields within rel <= 1e-9 (abs <= 1e-9 near zero) — for
//!   `astraea/wind0` and `astraea/wind3`. The kernel evaluates
//!   `Math.atan2`/`Math.sin` through the V8 shims in `astraea_core::v8_math`
//!   and mirrors TS's `(PI / 4) * d^2` rounding (`Vehicle::ref_area`), so its
//!   native state is bit-identical to the oracle's for the whole flight;
//! * `pitchDeg` is compared strictly at that bound. `rollDeg`/`yawDeg` are
//!   compared modulo 360 at the same bound (an angle at +180 and -180 is the
//!   same direction). The ONLY exemption is a `rollDeg`/`yawDeg` disagreement
//!   where `|cos pitch| <= 1e-6` in either row: that is the gimbal-lock split
//!   (a conditioning band ~5.7e-5 deg from vertical, not a display tolerance).
//!   No other field is exempted, and the corrected formulas are exercised at
//!   full precision in `astraea-core` `attitude_presentation_tests` and the TS
//!   `attitudePresentation` suite;
//! * the recording itself cannot move the physics: with the same inputs and
//!   `record_telemetry` off, apogee, apogee time, duration, landing mass,
//!   validity and every event time are BIT-IDENTICAL to the recording run, and
//!   the off run's series is empty;
//! * the WIRE series from `commands::simulate_flight` obeys the IPC contract:
//!   at most 5000 points, strictly increasing time, and the first, terminal and
//!   every event-time sample and the first recorded pressure maximum kept;
//! * ensembles/coarse callers carry no telemetry (`to_flight_dto` alone leaves
//!   the series empty).

use astraea_engine::{commands, models};

const POINT_FIELDS: usize = 26;

// Field indices into a fixture row (order = fixture `fields`); only the
// quaternion and the presentation Euler angles need names now that every
// field is asserted with the same `spacing_ok` bound.
const F_TIME: usize = 0;
const F_QW: usize = 14;
const F_QX: usize = 15;
const F_QY: usize = 16;
const F_QZ: usize = 17;
const F_PITCH: usize = 19;
const F_ROLL: usize = 20;
const F_YAW: usize = 21;

/// The fixture field order must be the order the comparing accessors produce.
const EXPECTED_FIELDS: [&str; POINT_FIELDS] = [
    "time",
    "position.x",
    "position.y",
    "position.z",
    "velocity.x",
    "velocity.y",
    "velocity.z",
    "speed",
    "mach",
    "acceleration",
    "angularVelocity.p",
    "angularVelocity.q",
    "angularVelocity.r",
    "angleOfAttackDeg",
    "q.w",
    "q.x",
    "q.y",
    "q.z",
    "altitude",
    "pitchDeg",
    "rollDeg",
    "yawDeg",
    "drag",
    "thrust",
    "mass",
    "dynamicPressure",
];

fn spacing_ok(got: f64, want: f64) -> bool {
    let abs = (got - want).abs();
    abs / want.abs() <= 1e-9 || abs <= 1e-9
}

fn row_of_native(p: &astraea_core::six_dof::TelemetryPoint) -> [f64; POINT_FIELDS] {
    [
        p.time,
        p.position.x,
        p.position.y,
        p.position.z,
        p.velocity.x,
        p.velocity.y,
        p.velocity.z,
        p.speed,
        p.mach,
        p.acceleration,
        p.angular_velocity.p,
        p.angular_velocity.q,
        p.angular_velocity.r,
        p.angle_of_attack_deg,
        p.q.w,
        p.q.x,
        p.q.y,
        p.q.z,
        p.altitude,
        p.pitch_deg,
        p.roll_deg,
        p.yaw_deg,
        p.drag,
        p.thrust,
        p.mass,
        p.dynamic_pressure,
    ]
}

fn row_of_wire(p: &models::TelemetryPointDto) -> [f64; POINT_FIELDS] {
    [
        p.time,
        p.position.x,
        p.position.y,
        p.position.z,
        p.velocity.x,
        p.velocity.y,
        p.velocity.z,
        p.speed,
        p.mach,
        p.acceleration,
        p.angular_velocity.p,
        p.angular_velocity.q,
        p.angular_velocity.r,
        p.angle_of_attack_deg,
        p.q.w,
        p.q.x,
        p.q.y,
        p.q.z,
        p.altitude,
        p.pitch_deg,
        p.roll_deg,
        p.yaw_deg,
        p.drag,
        p.thrust,
        p.mass,
        p.dynamic_pressure,
    ]
}

/// Presentation gimbal-lock band: both corrected `atan2` pairs have magnitude
/// `|cos pitch|`, so below this band the roll/yaw split is a gauge. This is a
/// numerical conditioning band (~5.7e-5 deg from vertical), not a display
/// tolerance; the corrected formulas are checked at full precision in the core
/// `attitude_presentation_tests`.
const EULER_LOCK_COS_EPS: f64 = 1e-6;

/// `|cos pitch|` of a fixture/native row, from its canonical quaternion.
fn euler_lock(row: &[f64]) -> bool {
    let (w, x, y, z) = (row[F_QW], row[F_QX], row[F_QY], row[F_QZ]);
    (2.0 * (w * y - z * x)).hypot(1.0 - 2.0 * (x * x + y * y)) <= EULER_LOCK_COS_EPS
}

/// Angle comparison modulo 360 at the same bound as `spacing_ok`: +180 and
/// -180 are the same direction.
fn angle_ok(got: f64, want: f64) -> bool {
    let gap = ((got - want + 180.0).rem_euclid(360.0)) - 180.0;
    gap.abs() <= 1e-9 * want.abs().max(1.0)
}

/// Mirror of the private `commands::opts` mapping (plus the opt-in flag) so the
/// full series can be read straight off the core result.
fn core_options(o: &models::FlightOptionsDto) -> astraea_core::six_dof::SixDofOptions {
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

#[test]
fn full_native_series_matches_ts_and_the_wire_series_is_bounded() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/telemetry-parity.json");
    let text = std::fs::read_to_string(path).expect("fixture");
    let doc: serde_json::Value = serde_json::from_str(&text).expect("fixture json");

    let fields: Vec<String> = doc["fields"]
        .as_array()
        .expect("fields")
        .iter()
        .map(|v| v.as_str().expect("field name").to_string())
        .collect();
    assert_eq!(
        fields,
        EXPECTED_FIELDS.to_vec(),
        "fixture field order drifted from the comparing accessors"
    );

    let vehicle: models::FrontendVehicle =
        serde_json::from_value(doc["vehicle"].clone()).expect("vehicle");
    let motor: models::FrontendMotor = serde_json::from_value(doc["motor"].clone()).expect("motor");
    let cases = doc["cases"].as_array().expect("cases");
    assert_eq!(cases.len(), 2, "both wind speeds");

    let mut alpha_wind0: Option<(usize, usize, usize)> = None;

    for case in cases {
        let label = case["case"].as_str().expect("case");
        let options: models::FlightOptionsDto = serde_json::from_value(case["options"].clone())
            .unwrap_or_else(|e| panic!("{label}: bridge payload rejected by the DTO: {e}"));
        let want_points = case["points"].as_array().expect("points");
        let want_count = case["tsPointCount"].as_u64().expect("tsPointCount") as usize;
        assert_eq!(want_points.len(), want_count, "{label}: fixture point count");
        let want_event_times: Vec<f64> = case["tsEventTimes"]
            .as_array()
            .expect("tsEventTimes")
            .iter()
            .map(|v| v.as_f64().expect("event time"))
            .collect();

        let prepared = models::prepare_flight_vehicle(&vehicle, &motor)
            .unwrap_or_else(|e| panic!("{label}: {e}"));
        let core_motor = models::to_motor(&motor).unwrap_or_else(|e| panic!("{label}: {e}"));
        let full =
            astraea_core::six_dof::simulate_flight(&prepared, &core_motor, &core_options(&options))
                .unwrap_or_else(|e| panic!("{label}: {e}"));

        // ---- recording must not move the trajectory -----------------------
        let mut off_options = core_options(&options);
        off_options.record_telemetry = false;
        let off = astraea_core::six_dof::simulate_flight(&prepared, &core_motor, &off_options)
            .unwrap_or_else(|e| panic!("{label}: {e}"));
        assert!(off.telemetry.is_empty(), "{label}: recording must be opt-in");
        assert_eq!(off.apogee_altitude, full.apogee_altitude, "{label}: recording moved apogee");
        assert_eq!(off.apogee_time, full.apogee_time, "{label}: recording moved apogee time");
        assert_eq!(off.flight_time, full.flight_time, "{label}: recording moved duration");
        assert_eq!(off.landing_mass, full.landing_mass, "{label}: recording moved landing mass");
        assert_eq!(off.max_mach, full.max_mach, "{label}: recording moved max mach");
        assert_eq!(off.validity, full.validity, "{label}: recording moved validity");
        assert_eq!(off.terminated, full.terminated, "{label}: recording moved termination");
        assert_eq!(off.events.len(), full.events.len(), "{label}: recording moved the event set");
        for (a, b) in off.events.iter().zip(full.events.iter()) {
            assert_eq!(a.time, b.time, "{label}: recording moved event {}", a.name);
        }

        // ---- oracle metrics ----------------------------------------------
        let want_apogee = case["tsApogeeAltitude"].as_f64().expect("ts apogee");
        let want_duration = case["tsFlightDuration"].as_f64().expect("ts duration");
        assert_eq!(
            full.terminated,
            case["tsTerminated"].as_bool().expect("terminated"),
            "{label}"
        );
        let rel_apogee = (full.apogee_altitude - want_apogee).abs() / want_apogee;
        // The reported event time is the C3 midpoint of a 1e-7 s bracket. The
        // two kernels agree on the trajectory to ~1e-15, but their root
        // estimates may differ by up to the declared numerical root width;
        // the trajectory (apogee) remains at the 1e-12 parity bound.
        let duration_gap = (full.flight_time - want_duration).abs();
        assert!(
            rel_apogee <= 1e-12,
            "{label}: apogee {} vs TS {want_apogee} (rel {rel_apogee:e})",
            full.apogee_altitude
        );
        assert!(
            duration_gap <= astraea_core::six_dof::EVENT_ROOT_WIDTH_S,
            "{label}: duration {} vs TS {want_duration} (gap {duration_gap:e} s)",
            full.flight_time
        );

        // ---- FULL series, point for point ---------------------------------
        assert_eq!(
            full.telemetry.len(),
            want_count,
            "{label}: native full series has {} points, TS has {want_count}",
            full.telemetry.len()
        );
        let mut lock_exempted_angles = 0usize;
        for (i, native_point) in full.telemetry.iter().enumerate() {
            let got = row_of_native(native_point);
            let want: Vec<f64> = want_points[i]
                .as_array()
                .expect("row")
                .iter()
                .map(|v| v.as_f64().expect("value"))
                .collect();
            assert_eq!(want.len(), POINT_FIELDS, "{label}: row {i} width");
            assert!(
                spacing_ok(got[F_TIME], want[F_TIME]),
                "{label}: point {i} instant {} vs fixture {}",
                got[F_TIME],
                want[F_TIME]
            );
            for (f, (g, w)) in got.iter().zip(want.iter()).enumerate() {
                if f == F_PITCH {
                    assert!(g.is_finite() && w.is_finite(), "{label}: point {i} {}", fields[f]);
                    assert!(spacing_ok(*g, *w), "{label}: point {i} pitchDeg {g} vs fixture {w}");
                    continue;
                }
                if f == F_ROLL || f == F_YAW {
                    assert!(g.is_finite() && w.is_finite(), "{label}: point {i} {}", fields[f]);
                    if !angle_ok(*g, *w) {
                        // Only the gimbal-lock roll/yaw split is exempt; pitch
                        // and every other field stay strict above. This fixture
                        // must not need the exemption at all.
                        assert!(
                            euler_lock(&got) || euler_lock(&want),
                            "{label}: point {i} {} native {g} vs fixture {w} at a \
                             well-conditioned attitude",
                            fields[f]
                        );
                        lock_exempted_angles += 1;
                    }
                    continue;
                }
                assert!(
                    spacing_ok(*g, *w),
                    "{label}: point {i} field {} = {g} vs fixture {w} (abs {:e})",
                    fields[f],
                    (g - w).abs()
                );
            }
        }
        assert_eq!(
            lock_exempted_angles, 0,
            "{label}: the gimbal-lock roll/yaw exemption was used {lock_exempted_angles} times; \
             the frozen fixture requires none"
        );

        // Event times agree between the two engines (they drive decimation).
        assert_eq!(full.events.len(), want_event_times.len(), "{label}: event count");
        for (e, want_t) in full.events.iter().zip(want_event_times.iter()) {
            assert!(
                spacing_ok(e.time, *want_t),
                "{label}: event {} at {} vs TS {want_t}",
                e.name,
                e.time
            );
        }

        // ---- WIRE series contract ----------------------------------------
        let wire = commands::simulate_flight(vehicle.clone(), motor.clone(), options.clone())
            .unwrap_or_else(|e| panic!("{label}: command failed: {e}"));
        let wire_json = serde_json::to_string(&wire).expect("wire json");
        assert!(
            wire.telemetry.len() <= astraea_core::telemetry::MAX_TELEMETRY_POINTS,
            "{label}: wire series {} exceeds the 5000-point cap",
            wire.telemetry.len()
        );
        assert!(
            wire.telemetry.windows(2).all(|w| w[0].time < w[1].time),
            "{label}: wire series times must strictly increase"
        );
        // First and terminal samples survive decimation.
        let first = row_of_wire(&wire.telemetry[0]);
        let full_first = row_of_native(&full.telemetry[0]);
        assert_eq!(first, full_first, "{label}: wire series must keep the first sample");
        let last = row_of_wire(wire.telemetry.last().expect("last"));
        let full_last = row_of_native(full.telemetry.last().expect("last"));
        assert_eq!(last, full_last, "{label}: wire series must keep the terminal sample");
        // Every event time has its nearest sample kept.
        for want_t in &want_event_times {
            let nearest = full
                .telemetry
                .iter()
                .min_by(|a, b| {
                    (a.time - want_t).abs().partial_cmp(&(b.time - want_t).abs()).expect("finite")
                })
                .expect("sample");
            assert!(
                wire.telemetry.iter().any(|p| p.time == nearest.time),
                "{label}: event time {want_t} lost by decimation (nearest sample {})",
                nearest.time
            );
        }
        // Coarse callers never carry a series: `to_flight_dto` alone leaves it
        // empty (only `simulate_flight` fills it), so ensembles stay coarse.
        let coarse = models::to_flight_dto(&full);
        assert!(coarse.telemetry.is_empty(), "{label}: the coarse DTO path must not carry a series");

        let recorded_peak = full.telemetry.iter()
            .filter(|p| p.dynamic_pressure.is_finite() && p.dynamic_pressure >= 0.0)
            .reduce(|a, b| if b.dynamic_pressure > a.dynamic_pressure { b } else { a })
            .expect("finite recorded peak");
        let wire_peak = wire.telemetry.iter()
            .filter(|p| p.dynamic_pressure.is_finite() && p.dynamic_pressure >= 0.0)
            .reduce(|a, b| if b.dynamic_pressure > a.dynamic_pressure { b } else { a })
            .expect("finite wire peak");
        assert_eq!(row_of_wire(wire_peak), row_of_native(recorded_peak),
            "{label}: decimation lost the first recorded pressure maximum");
        eprintln!(
            "{label}: recorded peak {} Pa at {} s; wire peak {} Pa at {} s; apogee {} m at {} s; duration {} s; landing mass {} kg; max Mach {}",
            recorded_peak.dynamic_pressure, recorded_peak.time,
            wire_peak.dynamic_pressure, wire_peak.time,
            full.apogee_altitude, full.apogee_time, full.flight_time, full.landing_mass, full.max_mach
        );

        eprintln!(
            "{label}: full {} points -> wire {} points, wire JSON {} bytes, lock-exempted angle fields {lock_exempted_angles}",
            full.telemetry.len(),
            wire.telemetry.len(),
            wire_json.len()
        );
        if label == "astraea/wind0" {
            alpha_wind0 = Some((full.telemetry.len(), wire.telemetry.len(), wire_json.len()));
        }
    }

    let (full_n, wire_n, bytes) = alpha_wind0.expect("astraea/wind0 case present");
    assert!(full_n > astraea_core::telemetry::MAX_TELEMETRY_POINTS, "the cap must bind");
    assert_eq!(
        wire_n,
        astraea_core::telemetry::MAX_TELEMETRY_POINTS,
        "a long Alpha run must fill the cap exactly"
    );
    assert!(bytes > 0);
}

/// The live-preview command flies the same flight as `simulate_flight` and
/// differs only by carrying no display telemetry.
#[test]
fn flight_summary_matches_simulate_flight_without_telemetry() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/telemetry-parity.json")).expect("fixture json");
    let case = &fixture["cases"][0];
    let vehicle: models::FrontendVehicle = serde_json::from_value(fixture["vehicle"].clone()).expect("vehicle");
    let motor: models::FrontendMotor = serde_json::from_value(fixture["motor"].clone()).expect("motor");
    let options: models::FlightOptionsDto = serde_json::from_value(case["options"].clone()).expect("options");
    let full = commands::simulate_flight(vehicle.clone(), motor.clone(), options.clone()).expect("full");
    let summary = commands::flight_summary(vehicle, motor, options).expect("summary");
    assert!(summary.telemetry.is_empty());
    assert!(!full.telemetry.is_empty());
    let mut a = serde_json::to_value(&full).unwrap();
    let mut b = serde_json::to_value(&summary).unwrap();
    a.as_object_mut().unwrap().remove("telemetry");
    b.as_object_mut().unwrap().remove("telemetry");
    assert_eq!(a, b, "flight_summary must equal simulate_flight apart from telemetry");
}
