//! RMP10 capture/report software tests, not a numerical qualification experiment.
use astraea_engine::dispatch;
use serde_json::{json, Value};

fn core_recorded() -> (astraea_core::six_dof::SimulationResult, astraea_core::six_dof::Vehicle) {
    let args = input();
    let vehicle = serde_json::from_value(args["vehicle"].clone()).unwrap();
    let motor = serde_json::from_value(args["motor"].clone()).unwrap();
    let prepared = astraea_engine::models::prepare_flight_vehicle(&vehicle, &motor).unwrap();
    let motor = astraea_engine::models::to_motor(&motor).unwrap();
    let options = astraea_core::six_dof::SixDofOptions {
        rail_length: Some(1.0), rail_elevation_deg: Some(90.0), wind_speed_surface: Some(0.0),
        time_step: Some(0.03125), record_moment_arm_history: true, ..Default::default()
    };
    (astraea_core::six_dof::simulate_flight(&prepared, &motor, &options).unwrap(), prepared)
}

#[test]
fn dto_preserves_raw_same_state_fields_algebra_and_sample_disclosures() {
    let (result, vehicle) = core_recorded();
    let dto = astraea_engine::moment_arm_history::to_dto(&result, &vehicle).unwrap();
    assert_eq!(dto.fin_interference_id, result.fin_interference_id);
    assert_eq!(dto.fin_interference_id, "fin-station-v2");
    let wire = serde_json::to_value(&dto).unwrap();
    assert_eq!(wire["finInterferenceId"], "fin-station-v2");
    assert_eq!(dto.points.len(), result.moment_arm_history.len());
    for (point, raw) in dto.points.iter().zip(&result.moment_arm_history) {
        let d = &raw.diagnostic;
        let n = point.normal.as_ref().unwrap();
        assert_eq!(point.time_s.to_bits(), raw.time_s.to_bits());
        assert_eq!(point.mass_kg.to_bits(), raw.mass_kg.to_bits());
        assert_eq!(point.incidence_deg.to_bits(), d.alpha_total_deg.to_bits());
        assert_eq!(point.mach.to_bits(), d.mach.to_bits());
        assert_eq!(point.cg_from_nose_m.to_bits(), d.combined_cg.to_bits());
        assert_eq!(point.dynamic_pressure_pa.to_bits(), d.q_inf.to_bits());
        assert_eq!(n.cp_from_nose_m.to_bits(), d.cp.to_bits());
        assert_eq!(d.cp.to_bits(), (d.first_moment / d.cna).to_bits(), "real evaluator CP must satisfy the strict TS parser");
        assert!(d.cna >= astraea_core::six_dof::NORMAL_SLOPE_SUPPORT_FLOOR);
        assert_eq!(astraea_core::six_dof::NORMAL_SLOPE_SUPPORT_FLOOR.to_bits(), (1e-4_f64).to_bits());
        assert_eq!(n.c_per_rad.to_bits(), d.cna.to_bits());
        assert_eq!(n.j_m_per_rad.to_bits(), d.first_moment.to_bits());
        assert_eq!(n.arm_m.to_bits(), (d.cp-d.combined_cg).to_bits());
        assert_eq!(n.arm_calibers, n.arm_m / vehicle.ref_diameter);
        assert_eq!(n.arm_percent_length, 100.0*n.arm_m / vehicle.total_length);
        assert_eq!(n.cna_weighted_arm_m_per_rad, d.first_moment-d.cna*d.combined_cg);
        assert_eq!(point.static_moment_body_nm.x, d.static_moment_body.x);
        assert_eq!(point.damping_moment_body_nm.y, d.damping_moment_body.y);
        assert_eq!(point.total_moment_body_nm.z, d.total_moment_body.z);
    }
    let last = dto.points.last().unwrap().time_s;
    assert_eq!(dto.time_range_s, [0.0,last]);
    assert_eq!(dto.last_sample_to_burnout_s, result.burnout_time-last);
    assert_eq!(dto.max_gap_s, dto.points.windows(2).map(|p|p[1].time_s-p[0].time_s).fold(0.0_f64,f64::max));
    assert!(!dto.exact_burnout_sample_exists, "this binary-step fixture is off declared1.86s burnout");
    assert!(dto.points.iter().any(|p| p.mach != (p.mach*1000.0).round()/1000.0), "not display-rounded");
}

#[test]
fn manufactured_applicability_boundary_and_corruption_are_explicit() {
    let (mut result, vehicle) = core_recorded();
    // Exact-boundary disclosure test on manufactured saved values, not an
    // assertion that the real solver produced an exact burnout root sample.
    result.burnout_time = result.moment_arm_history.last().unwrap().time_s;
    result.moment_arm_history.last_mut().unwrap().diagnostic.powered = false;
    let dto = astraea_engine::moment_arm_history::to_dto(&result, &vehicle).unwrap();
    assert!(dto.exact_burnout_sample_exists);
    assert_eq!(dto.last_sample_to_burnout_s, 0.0);
    assert!(!dto.points.last().unwrap().powered);
    // Actual legacy canopy load evaluator, but a manufactured report carrier;
    // isolates applicability mapping, not a flight-event qualification.
    let state = astraea_core::six_dof::RigidState {
        r: astraea_core::six_dof::Vec3::zero(), v: astraea_core::six_dof::Vec3::zero(),
        q: astraea_core::six_dof::Quat { w:1.0,x:0.0,y:0.0,z:0.0 },
        w: astraea_core::six_dof::Vec3::zero(),
    };
    result.moment_arm_history.truncate(1);
    result.moment_arm_history[0].diagnostic = astraea_core::six_dof::diagnose_flight_loads(
        0.0,&state,true,false,false,0.0,0.0,0.0,0.0,&vehicle,
        &astraea_core::six_dof::estes_c6_motor(),1.0).unwrap();
    let dto = astraea_engine::moment_arm_history::to_dto(&result, &vehicle).unwrap();
    assert_eq!(dto.points[0].normal_applicability,"not-applicable-live-canopy");
    assert!(dto.points[0].normal.is_none());
    assert!(dto.points[0].cg_from_nose_m.is_finite());
    result.moment_arm_history[0].diagnostic.alpha_total_deg = f64::NAN;
    assert!(astraea_engine::moment_arm_history::to_dto(&result,&vehicle).unwrap_err().contains("non-finite"));
}

#[test]
fn real_legacy_evaluator_powered_flag_is_exclusive_at_declared_burn_time() {
    let (_, vehicle) = core_recorded();
    let motor = astraea_core::six_dof::estes_c6_motor();
    let state = astraea_core::six_dof::RigidState {
        r: astraea_core::six_dof::Vec3::zero(), v: astraea_core::six_dof::Vec3::zero(),
        q: astraea_core::six_dof::Quat { w:1.0,x:0.0,y:0.0,z:0.0 },
        w: astraea_core::six_dof::Vec3::zero(),
    };
    // Actual load evaluator at explicit states/times, not a claim that a
    // trajectory contains a root or committed sample at declared burn time.
    for (time, powered) in [(f64::from_bits(motor.burn_time.to_bits()-1),true),(motor.burn_time,false)] {
        let d = astraea_core::six_dof::diagnose_flight_loads(
            time,&state,false,false,false,0.0,0.0,0.0,0.0,&vehicle,&motor,1.0).unwrap();
        assert_eq!(d.powered,powered);
    }
}

#[test]
fn reporting_failure_never_returns_a_partial_success_object() {
    let mut args = input(); args["reportMomentArmHistory"] = json!(true);
    args["motor"]["propellantMass"] = json!(0.0);
    let reply: Value = serde_json::from_str(&astraea_engine::dispatch_json("simulate_flight",&args.to_string())).unwrap();
    assert!(reply.get("ok").is_none());
    assert!(reply["error"].as_str().unwrap().contains("propellantMass"));
    let (mut result,vehicle) = core_recorded();
    result.moment_arm_history = vec![result.moment_arm_history[0].clone();5001];
    assert!(astraea_engine::moment_arm_history::to_dto(&result,&vehicle).is_err());
    result.moment_arm_history.clear();
    assert!(astraea_engine::moment_arm_history::to_dto(&result,&vehicle).is_err());
}

fn input() -> Value {
    // Existing explicitly synthetic legacy preservation fixture, no team outcomes.
    serde_json::from_str(include_str!("../../../docs/internal/execution-runs/RMP12c-regime-expansion/LEGACY-INPUT.json")).unwrap()
}

#[test]
fn requested_history_is_present_and_off_path_is_unchanged() {
    let mut args = input();
    let ordinary = dispatch("simulate_flight", &args).unwrap();
    assert!(ordinary.get("momentArmHistory").is_none());
    args["reportMomentArmHistory"] = json!(false);
    assert!(dispatch("simulate_flight", &args).unwrap().to_string() == ordinary.to_string(), "false request changed old output bytes");
    args["reportMomentArmHistory"] = json!(true);
    let mut recorded = dispatch("simulate_flight", &args).unwrap();
    let history = recorded.as_object_mut().unwrap().remove("momentArmHistory")
        .expect("explicit requested history must not be silently ignored");
    assert!(recorded.to_string() == ordinary.to_string(), "capture cannot alter any old output bytes");
    assert_eq!(history["schemaId"], "astraea-flight-moment-arm-history/1.0.0");
    assert_eq!(history["reportMomentArmHistory"], true);
    let points = history["points"].as_array().unwrap();
    assert!(!points.is_empty());
    assert_eq!(history["sampleCount"].as_u64().unwrap() as usize, points.len());
    assert_eq!(points[0]["timeS"], 0.0);
    assert_eq!(history["burnoutTimeS"], ordinary["burnoutTime"]);
}

#[test]
fn malformed_and_unsupported_reporting_requests_refuse() {
    for malformed in [Value::Null, json!(1), json!("true"), json!({})] {
        let mut args = input();
        args["reportMomentArmHistory"] = malformed;
        let result = dispatch("simulate_flight", &args);
        assert!(result.is_err(), "malformed reporting request was silently accepted");
        assert!(result.err().unwrap().contains("reportMomentArmHistory"));
    }
    for cmd in ["flight_summary", "run_ensemble", "run_ensemble_chunk"] {
        let mut args = input();
        args["reportMomentArmHistory"] = json!(false);
        assert!(dispatch(cmd, &args).unwrap_err().contains("reportMomentArmHistory"));
        assert!(dispatch(cmd, &json!({"req": args})).unwrap_err().contains("reportMomentArmHistory"));
    }
}
