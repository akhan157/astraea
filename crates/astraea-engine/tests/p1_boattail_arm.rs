//! P1 sensitivity arm: `BoattailLift::Attached` (slender-body boattail term
//! kept supersonically). Report-only; the default `Suppressed` arm is gated by
//! `p1_product_supersonic.rs` and `p1_arcas_normal.rs`.
//!
//! Same R9 inputs, window and ensemble as the main harness; dispatch parity is
//! intentionally not repeated here because the product command path uses the
//! default arm. Env: ASTRAEA_P1_MANIFEST / ASTRAEA_P1_CORPUS / ASTRAEA_P1_OUT.

use astraea_core::monte_carlo::{
    apply_perturbations, sub_seed_of, Mulberry32, PerturbationSigmas, PerturbedParams,
};
use astraea_core::six_dof::{
    diagnose_flight_loads, simulate_flight, BoattailLift, MotorSpec, RigidState, SixDofOptions,
    Vec3, Vehicle,
};
use astraea_engine::models::{self, FlightOptionsDto, FrontendMotor, FrontendVehicle};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

const SEED: i64 = 20260909;
const N_RUNS: i64 = 50;
const CHUNK_RUNS: i64 = 25;
const Q_FLOOR_PA: f64 = 1000.0;
const SPEED_FLOOR_MPS: f64 = 10.0;
const ALT_FLOOR_M: f64 = 1.524;
const TIME_MARGIN_S: f64 = 0.5;
const AOAGATE_DEG: f64 = 30.0;
const RATEGATE_DPS: f64 = 200.0;
const SIGMA_WIND_DEG: f64 = 20.0;
const SIGMA_RAIL_DEG: f64 = 1.0;
const SIGMA_IMPULSE_PCT: f64 = 3.0;
const DESIGNS: [&str; 3] = ["qu8k", "dontdebatethisn5800mindia", "proteus6"];

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).map(PathBuf::from)
}

fn jnum(value: Option<f64>) -> Value {
    match value {
        Some(v) if v.is_finite() => json!(v),
        _ => Value::Null,
    }
}

fn core_options(o: &FlightOptionsDto) -> SixDofOptions {
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
        record_telemetry: true,
        record_moment_arm_history: false,
    }
}

#[derive(Default)]
struct Window {
    samples: usize,
    max_aoa: f64,
    max_rate: f64,
}

impl Window {
    fn update(&mut self, t: f64, aoa: f64, rate: f64, q: f64, apogee: f64, alt: f64, speed: f64) {
        if !(t > TIME_MARGIN_S && t < apogee - TIME_MARGIN_S) {
            return;
        }
        if !(alt > ALT_FLOOR_M) || !(speed >= SPEED_FLOOR_MPS) || !(q >= Q_FLOOR_PA) {
            return;
        }
        self.samples += 1;
        self.max_aoa = self.max_aoa.max(aoa.abs());
        self.max_rate = self.max_rate.max(rate.abs());
    }
    fn tumbles(&self) -> bool {
        self.max_aoa > AOAGATE_DEG || self.max_rate > RATEGATE_DPS
    }
    fn to_json(&self) -> Value {
        json!({
            "samples": self.samples,
            "max_abs_aoa_deg": self.max_aoa,
            "max_pitch_rate_dps": self.max_rate,
            "tumble": self.tumbles(),
        })
    }
}

fn scaled_motor(base: &MotorSpec, scale: f64) -> MotorSpec {
    let mut motor = base.clone();
    if scale != 1.0 {
        for point in &mut motor.thrust_curve {
            point.thrust *= scale;
        }
        motor.max_thrust *= scale;
    }
    motor
}

fn margin_min(
    result: &astraea_core::six_dof::SimulationResult,
    vehicle: &Vehicle,
    motor: &MotorSpec,
    launch_alt: f64,
) -> (Option<f64>, usize) {
    let mut min: Option<f64> = None;
    let mut negative = 0usize;
    for p in &result.telemetry {
        if p.time > result.apogee_time + 1e-9 {
            break;
        }
        let state = RigidState {
            r: p.position,
            v: p.velocity,
            q: p.q,
            w: Vec3 {
                x: p.angular_velocity.q,
                y: p.angular_velocity.p,
                z: p.angular_velocity.r,
            },
        };
        let Ok(d) = diagnose_flight_loads(
            p.time, &state, false, false, false, launch_alt, 0.0, 0.0, 0.0, vehicle, motor, 1.0,
        ) else {
            continue;
        };
        let m = (d.cp - d.combined_cg) / vehicle.ref_diameter;
        if m < 0.0 {
            negative += 1;
        }
        min = Some(min.map_or(m, |x: f64| x.min(m)));
    }
    (min, negative)
}

fn run() -> Result<(), String> {
    let Some(manifest_path) = env_path("ASTRAEA_P1_MANIFEST") else {
        eprintln!("SKIP P1 boattail arm: ASTRAEA_P1_MANIFEST is not set.");
        return Ok(());
    };
    let Some(out_dir) = env_path("ASTRAEA_P1_OUT") else {
        eprintln!("SKIP P1 boattail arm: ASTRAEA_P1_OUT is not set.");
        return Ok(());
    };
    fs::create_dir_all(&out_dir).map_err(|e| format!("create {}: {e}", out_dir.display()))?;
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(&manifest_path).map_err(|e| format!("read manifest: {e}"))?,
    )
    .map_err(|e| format!("manifest json: {e}"))?;
    let entries = manifest["entries"]
        .as_array()
        .ok_or_else(|| "manifest entries missing".to_string())?;
    let mut rows: Vec<Value> = Vec::new();
    for name in DESIGNS {
        let entry = entries
            .iter()
            .find(|e| e["name"].as_str() == Some(name))
            .ok_or_else(|| format!("{name}: manifest entry missing"))?;
        let vehicle_dto: FrontendVehicle =
            serde_json::from_value(entry["vehicle"].clone()).map_err(|e| format!("{name}: vehicle: {e}"))?;
        let motor_dto: FrontendMotor =
            serde_json::from_value(entry["motor"].clone()).map_err(|e| format!("{name}: motor: {e}"))?;
        let options: FlightOptionsDto =
            serde_json::from_value(entry["options"].clone()).map_err(|e| format!("{name}: options: {e}"))?;
        let mut prepared = models::prepare_flight_vehicle(&vehicle_dto, &motor_dto)?;
        if let Some(p) = prepared.supersonic_normal.as_mut() {
            p.boattail_lift = BoattailLift::Attached;
        }
        let motor = models::to_motor(&motor_dto)?;
        let opts = core_options(&options);
        let launch_alt = options.launch_altitude_asl.unwrap_or(0.0);
        let nominal = simulate_flight(&prepared, &motor, &opts).map_err(|e| format!("{name}: nominal: {e}"))?;
        let mut w = Window::default();
        for p in &nominal.telemetry {
            w.update(
                p.time,
                p.angle_of_attack_deg,
                p.angular_velocity.q.to_degrees(),
                p.dynamic_pressure,
                nominal.apogee_time,
                p.altitude,
                p.speed,
            );
        }
        let (min_margin, negative) = margin_min(&nominal, &prepared, &motor, launch_alt);

        let sigmas = PerturbationSigmas {
            wind_azimuth_deg_sigma: SIGMA_WIND_DEG,
            rail_angle_deg_sigma: SIGMA_RAIL_DEG,
            impulse_pct_sigma: SIGMA_IMPULSE_PCT,
        };
        let base = PerturbedParams {
            wind_azimuth_deg: options.wind_azimuth_deg,
            rail_elevation_deg: options.rail_elevation_deg,
            impulse_scale: 1.0,
        };
        let mut mc_aoa: Vec<f64> = Vec::new();
        let mut mc_rate: Vec<f64> = Vec::new();
        let mut mc_tumbles = 0usize;
        let mut mc_failures = 0usize;
        let mut start = 0;
        while start < N_RUNS {
            let end = (start + CHUNK_RUNS).min(N_RUNS);
            for index in start..end {
                let mut rng = Mulberry32::new(sub_seed_of(SEED, index));
                let perturbed = apply_perturbations(&base, &sigmas, &mut rng);
                let mut run_opts = opts.clone();
                run_opts.wind_azimuth_deg = perturbed.wind_azimuth_deg;
                run_opts.rail_elevation_deg = perturbed.rail_elevation_deg;
                run_opts.record_telemetry = true;
                let run_motor = scaled_motor(&motor, perturbed.impulse_scale);
                match simulate_flight(&prepared, &run_motor, &run_opts) {
                    Ok(result) => {
                        let mut rw = Window::default();
                        for p in &result.telemetry {
                            rw.update(
                                p.time,
                                p.angle_of_attack_deg,
                                p.angular_velocity.q.to_degrees(),
                                p.dynamic_pressure,
                                result.apogee_time,
                                p.altitude,
                                p.speed,
                            );
                        }
                        if rw.tumbles() {
                            mc_tumbles += 1;
                        }
                        mc_aoa.push(rw.max_aoa);
                        mc_rate.push(rw.max_rate);
                    }
                    Err(_) => mc_failures += 1,
                }
            }
            start = end;
        }
        mc_aoa.sort_by(f64::total_cmp);
        mc_rate.sort_by(f64::total_cmp);
        rows.push(json!({
            "design": name,
            "arm": "attached",
            "nominal": {
                "apogee_m": nominal.apogee_altitude,
                "max_mach": nominal.max_mach,
                "window": w.to_json(),
                "min_margin_cal": jnum(min_margin),
                "negative_window_samples": negative,
            },
            "monte_carlo": {
                "n_runs": N_RUNS,
                "tumbles": mc_tumbles,
                "failures": mc_failures,
                "aoa_max": mc_aoa.last().copied(),
                "aoa_median": mc_aoa.get(mc_aoa.len()/2).copied(),
                "rate_max": mc_rate.last().copied(),
            }
        }));
        eprintln!("{name}: attached arm done");
    }
    let out = json!({
        "arm": "boattail_lift=attached",
        "note": "report-only sensitivity; default arm is suppressed",
        "designs": rows
    });
    let path = out_dir.join("boattail_attached.json");
    fs::write(&path, serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?)
        .map_err(|e| format!("write {}: {e}", path.display()))?;
    println!("{}", serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?);
    Ok(())
}

#[test]
fn p1_boattail_attached_arm() {
    if let Err(err) = run() {
        panic!("P1 boattail arm failed: {err}");
    }
}
