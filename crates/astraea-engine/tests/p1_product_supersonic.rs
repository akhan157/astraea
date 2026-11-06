//! P1 product-path diagnostic (R9 harness adapted) (test only): does the ordinary product flight path tumble
//! supersonic designs?
//!
//! Entry points, frozen definitions, expectations, falsifiers and evidence
//! layout are in `ASSIGNMENT.md` and the frozen
//! `/home/ak/astraea-evidence/R9-product-supersonic/pre_registration.json`.
//! No product code is changed; this file is never part of a release path.
//!
//! Env:
//!   ASTRAEA_P1_MANIFEST  flight manifest (vehicle/motor/options DTOs)
//!   ASTRAEA_P1_CORPUS    corpus root (design.json + flight_trajectory.csv)
//!   ASTRAEA_P1_OUT       evidence output directory

use astraea_core::monte_carlo::{
    apply_perturbations, sub_seed_of, Mulberry32, PerturbationSigmas, PerturbedParams,
};
use astraea_core::six_dof::{
    diagnose_flight_loads, simulate_flight, FlightLoadsDiagnostic, MotorSpec, Quat, RigidState,
    SimulationResult, SixDofOptions, Vec3, Vehicle,
};
use astraea_engine::models::{self, FlightOptionsDto, FrontendMotor, FrontendVehicle};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

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

const DESIGNS: &[(&str, &str)] = &[
    ("qu8k", "supersonic index case"),
    (
        "dontdebatethisn5800mindia",
        "supersonic screen-negative-but-R1-stable case",
    ),
    ("proteus6", "supersonic margin-reduced case"),
    ("kinsel-p4935-a-601-rocket", "moderate supersonic case"),
    (
        "raven",
        "brief-transonic control (peak reference Mach 1.077)",
    ),
];

const SCREEN_DESIGNS: &[&str] = &[
    "blister",
    "dontdebatethisn5800mindia",
    "kinsel-p4935-a-601-rocket",
    "proteus6",
    "qu8k",
    "rabia",
    "rabia-shortfincan",
    "raven",
    "torrent",
];

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name).map(PathBuf::from)
}

fn jnum(value: Option<f64>) -> Value {
    match value {
        Some(v) if v.is_finite() => json!(v),
        _ => Value::Null,
    }
}

fn f64_of(v: &Value) -> Option<f64> {
    v.as_f64()
}

/// The app wire is JSON text; parse exactly what the engine will parse so the
/// kernel comparison and the dispatch command see identical f64 inputs.
fn roundtrip_value(v: &Value) -> Result<Value, String> {
    let text = serde_json::to_string(v).map_err(|e| format!("roundtrip serialize: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("roundtrip parse: {e}"))
}

fn roundtrip_entry(entry: &Value) -> Result<Value, String> {
    Ok(json!({
        "name": entry["name"],
        "vehicle": roundtrip_value(&entry["vehicle"])?,
        "motor": roundtrip_value(&entry["motor"])?,
        "options": roundtrip_value(&entry["options"])?,
    }))
}

/// Bit-level agreement up to a few ULPs. Only used for the JSON reply, whose
/// parser can differ from the in-memory f64 by one ULP; the command function
/// itself is compared bit-exactly.
fn close_f64(a: f64, b: f64) -> (bool, f64) {
    let diff = (a - b).abs();
    let scale = a.abs().max(b.abs()).max(1.0);
    (diff <= 8.0 * f64::EPSILON * scale, diff)
}

struct RefDump {
    max_mach: f64,
    max_alt_ft: f64,
    t0_weight_lb: f64,
    t0_cg_in: f64,
}

fn read_reference(path: &Path) -> Result<RefDump, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let mut lines = text.lines();
    let header_line = lines
        .next()
        .ok_or_else(|| "empty trajectory csv".to_string())?;
    let header: Vec<&str> = header_line.split(',').map(|s| s.trim()).collect();
    let col = |name: &str| -> Result<usize, String> {
        header
            .iter()
            .position(|h| *h == name)
            .ok_or_else(|| format!("column '{name}' missing in {}", path.display()))
    };
    let i_mach = col("Mach Number")?;
    let i_alt = col("Altitude (ft)")?;
    let i_weight = col("Weight (lb)")?;
    let i_cg = col("CG (in)")?;
    let mut max_mach = 0.0f64;
    let mut max_alt = 0.0f64;
    let mut first: Option<(f64, f64)> = None;
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let cells: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if cells.len() <= i_cg.max(i_weight).max(i_alt).max(i_mach) {
            continue;
        }
        let mach: f64 = cells[i_mach].parse().unwrap_or(0.0);
        let alt: f64 = cells[i_alt].parse().unwrap_or(0.0);
        let weight: f64 = cells[i_weight].parse().unwrap_or(0.0);
        let cg: f64 = cells[i_cg].parse().unwrap_or(0.0);
        if first.is_none() {
            first = Some((weight, cg));
        }
        if mach.is_finite() {
            max_mach = max_mach.max(mach);
        }
        if alt.is_finite() {
            max_alt = max_alt.max(alt);
        }
    }
    let (t0_weight_lb, t0_cg_in) = first.ok_or_else(|| "no trajectory rows".to_string())?;
    Ok(RefDump {
        max_mach,
        max_alt_ft: max_alt,
        t0_weight_lb,
        t0_cg_in,
    })
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
        record_moment_arm_history: true,
    }
}

#[derive(Clone, Default)]
struct WindowStats {
    samples: usize,
    max_abs_aoa_deg: Option<f64>,
    max_pitch_rate_dps: Option<f64>,
    max_q_pa: f64,
}

impl WindowStats {
    fn update(
        &mut self,
        t: f64,
        aoa_deg: f64,
        pitch_rate_dps: f64,
        q_pa: f64,
        apogee_time: f64,
        alt: f64,
        speed: f64,
    ) {
        if !(t > TIME_MARGIN_S && t < apogee_time - TIME_MARGIN_S) {
            return;
        }
        if !(alt > ALT_FLOOR_M) || !(speed >= SPEED_FLOOR_MPS) || !(q_pa >= Q_FLOOR_PA) {
            return;
        }
        self.samples += 1;
        let aoa = aoa_deg.abs();
        self.max_abs_aoa_deg = Some(self.max_abs_aoa_deg.map_or(aoa, |m| m.max(aoa)));
        let rate = pitch_rate_dps.abs();
        self.max_pitch_rate_dps = Some(self.max_pitch_rate_dps.map_or(rate, |m| m.max(rate)));
        self.max_q_pa = self.max_q_pa.max(q_pa);
    }

    fn tumbles(&self) -> bool {
        self.max_abs_aoa_deg.unwrap_or(0.0) > AOAGATE_DEG
            || self.max_pitch_rate_dps.unwrap_or(0.0) > RATEGATE_DPS
    }

    fn to_json(&self) -> Value {
        json!({
            "samples": self.samples,
            "max_abs_aoa_deg": jnum(self.max_abs_aoa_deg),
            "max_pitch_rate_dps": jnum(self.max_pitch_rate_dps),
            "max_q_pa": self.max_q_pa,
            "tumble": self.tumbles(),
        })
    }
}

fn stats_from_core(result: &SimulationResult) -> WindowStats {
    let apogee_time = result.apogee_time;
    let mut w = WindowStats::default();
    for p in &result.telemetry {
        if p.time > apogee_time + 1e-9 {
            break;
        }
        w.update(
            p.time,
            p.angle_of_attack_deg,
            p.angular_velocity.q.to_degrees(),
            p.dynamic_pressure,
            apogee_time,
            p.altitude,
            p.speed,
        );
    }
    w
}

fn stats_from_wire(dto: &Value, apogee_time: f64) -> Result<WindowStats, String> {
    let arr = dto
        .get("telemetry")
        .and_then(Value::as_array)
        .ok_or_else(|| "dispatch result missing telemetry".to_string())?;
    let mut w = WindowStats::default();
    for p in arr {
        let t = f64_of(&p["time"]).ok_or_else(|| "wire telemetry time".to_string())?;
        if t > apogee_time + 1e-9 {
            break;
        }
        let aoa = f64_of(&p["angleOfAttackDeg"]).ok_or_else(|| "wire aoa".to_string())?;
        let rate = f64_of(&p["angularVelocity"]["q"]).ok_or_else(|| "wire rate".to_string())?;
        let q = f64_of(&p["dynamicPressure"]).ok_or_else(|| "wire q".to_string())?;
        let alt = f64_of(&p["altitude"]).ok_or_else(|| "wire alt".to_string())?;
        let speed = f64_of(&p["speed"]).ok_or_else(|| "wire speed".to_string())?;
        w.update(t, aoa, rate.to_degrees(), q, apogee_time, alt, speed);
    }
    Ok(w)
}

fn diagnostic_at(
    vehicle: &Vehicle,
    motor: &MotorSpec,
    options: &FlightOptionsDto,
    t: f64,
    state: &RigidState,
) -> Result<FlightLoadsDiagnostic, String> {
    diagnose_flight_loads(
        t,
        state,
        false,
        false,
        false,
        options.launch_altitude_asl.unwrap_or(0.0),
        options.wind_speed_surface.unwrap_or(0.0),
        options.wind_azimuth_deg.unwrap_or(0.0),
        options.fin_cant_angle_deg.unwrap_or(0.0).to_radians(),
        vehicle,
        motor,
        options.drag_cd_scale.unwrap_or(1.0),
    )
}

struct MarginRow {
    time: f64,
    mach_display: f64,
    q_pa: f64,
    aoa_deg: f64,
    pitch_rate_dps: f64,
    cp_m: f64,
    cg_m: f64,
    margin_cal: f64,
    in_window: bool,
}

struct Analysis {
    stats: WindowStats,
    rows: Vec<MarginRow>,
    min_margin: Option<MarginRow>,
    margin_at_max_mach: MarginRow,
    margin_at_t0: MarginRow,
    negative_window_samples: usize,
    margin_csv: String,
    max_wire_aoa: Option<f64>,
}

fn analyze(
    result: &SimulationResult,
    vehicle: &Vehicle,
    motor: &MotorSpec,
    options: &FlightOptionsDto,
) -> Result<Analysis, String> {
    let ref_dia = vehicle.ref_diameter;
    if !(ref_dia > 0.0) {
        return Err("nonpositive reference diameter".to_string());
    }
    let apogee_time = result.apogee_time;
    let mut rows: Vec<MarginRow> = Vec::new();
    let mut stats = WindowStats::default();
    for p in &result.telemetry {
        if p.time > apogee_time + 1e-9 {
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
        let d = diagnostic_at(vehicle, motor, options, p.time, &state)?;
        let margin = (d.cp - d.combined_cg) / ref_dia;
        let in_window = p.time > TIME_MARGIN_S
            && p.time < apogee_time - TIME_MARGIN_S
            && p.altitude > ALT_FLOOR_M
            && p.speed >= SPEED_FLOOR_MPS
            && p.dynamic_pressure >= Q_FLOOR_PA;
        stats.update(
            p.time,
            p.angle_of_attack_deg,
            p.angular_velocity.q.to_degrees(),
            p.dynamic_pressure,
            apogee_time,
            p.altitude,
            p.speed,
        );
        rows.push(MarginRow {
            time: p.time,
            mach_display: p.mach,
            q_pa: p.dynamic_pressure,
            aoa_deg: p.angle_of_attack_deg,
            pitch_rate_dps: p.angular_velocity.q.to_degrees(),
            cp_m: d.cp,
            cg_m: d.combined_cg,
            margin_cal: margin,
            in_window,
        });
    }
    if rows.is_empty() {
        return Err("telemetry series empty".to_string());
    }
    let mut max_mach_idx = 0usize;
    for (i, r) in rows.iter().enumerate() {
        if r.mach_display > rows[max_mach_idx].mach_display {
            max_mach_idx = i;
        }
    }
    let mut min_margin: Option<MarginRow> = None;
    let mut negative_window_samples = 0usize;
    for r in &rows {
        if !r.in_window {
            continue;
        }
        if r.margin_cal < 0.0 {
            negative_window_samples += 1;
        }
        if min_margin
            .as_ref()
            .map_or(true, |m| r.margin_cal < m.margin_cal)
        {
            min_margin = Some(MarginRow {
                time: r.time,
                mach_display: r.mach_display,
                q_pa: r.q_pa,
                aoa_deg: r.aoa_deg,
                pitch_rate_dps: r.pitch_rate_dps,
                cp_m: r.cp_m,
                cg_m: r.cg_m,
                margin_cal: r.margin_cal,
                in_window: true,
            });
        }
    }
    let margin_at_max_mach = MarginRow {
        time: rows[max_mach_idx].time,
        mach_display: rows[max_mach_idx].mach_display,
        q_pa: rows[max_mach_idx].q_pa,
        aoa_deg: rows[max_mach_idx].aoa_deg,
        pitch_rate_dps: rows[max_mach_idx].pitch_rate_dps,
        cp_m: rows[max_mach_idx].cp_m,
        cg_m: rows[max_mach_idx].cg_m,
        margin_cal: rows[max_mach_idx].margin_cal,
        in_window: rows[max_mach_idx].in_window,
    };
    let t0 = MarginRow {
        time: rows[0].time,
        mach_display: rows[0].mach_display,
        q_pa: rows[0].q_pa,
        aoa_deg: rows[0].aoa_deg,
        pitch_rate_dps: rows[0].pitch_rate_dps,
        cp_m: rows[0].cp_m,
        cg_m: rows[0].cg_m,
        margin_cal: rows[0].margin_cal,
        in_window: false,
    };
    let mut csv =
        String::from("time_s,mach,q_pa,aoa_deg,pitch_rate_dps,cp_m,cg_m,margin_cal,in_window\n");
    for r in &rows {
        csv.push_str(&format!(
            "{:.6},{:.6},{:.3},{:.4},{:.4},{:.6},{:.6},{:.6},{}\n",
            r.time,
            r.mach_display,
            r.q_pa,
            r.aoa_deg,
            r.pitch_rate_dps,
            r.cp_m,
            r.cg_m,
            r.margin_cal,
            if r.in_window { 1 } else { 0 }
        ));
    }
    Ok(Analysis {
        stats,
        rows,
        min_margin,
        margin_at_max_mach,
        margin_at_t0: t0,
        negative_window_samples,
        margin_csv: csv,
        max_wire_aoa: None,
    })
}

fn history_crosscheck(
    dto: &Value,
    rows: &[MarginRow],
    ref_dia: f64,
) -> Result<(usize, f64), String> {
    let history = match dto.get("momentArmHistory") {
        Some(Value::Object(_)) => &dto["momentArmHistory"],
        _ => return Err("dispatch result missing momentArmHistory".to_string()),
    };
    let points = history
        .get("points")
        .and_then(Value::as_array)
        .ok_or_else(|| "momentArmHistory points missing".to_string())?;
    let mut checked = 0usize;
    let mut max_diff = 0.0f64;
    for p in points {
        let Some(normal) = p.get("normal") else {
            continue;
        };
        if normal.is_null() {
            continue;
        }
        let Some(arm_cal) = f64_of(&normal["armCalibers"]) else {
            continue;
        };
        let Some(t) = f64_of(&p["timeS"]) else {
            continue;
        };
        let nearest = rows
            .iter()
            .min_by(|a, b| {
                (a.time - t)
                    .abs()
                    .partial_cmp(&(b.time - t).abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .ok_or_else(|| "no telemetry rows for history cross-check".to_string())?;
        // Only exact-time samples: non-5th macro steps are not in the display
        // telemetry, and a 0.025 s offset would move Mach enough to change CP
        // by ~0.1 cal. Coincident samples test the reconstructed margin itself.
        if (nearest.time - t).abs() > 0.0015 {
            continue;
        }
        let diff = (nearest.margin_cal - arm_cal).abs();
        max_diff = max_diff.max(diff);
        checked += 1;
    }
    let _ = ref_dia;
    if checked < 20 {
        return Err(format!(
            "momentArmHistory margin cross-check matched only {checked} exact-time samples"
        ));
    }
    Ok((checked, max_diff))
}

fn dispatch_call(cmd: &str, args: &Value) -> Result<Value, String> {
    let reply = astraea_engine::dispatch_json(cmd, &args.to_string());
    let parsed: Value =
        serde_json::from_str(&reply).map_err(|e| format!("{cmd}: reply is not JSON: {e}"))?;
    if let Some(err) = parsed.get("error").and_then(Value::as_str) {
        return Err(format!("{cmd}: {err}"));
    }
    parsed
        .get("ok")
        .cloned()
        .ok_or_else(|| format!("{cmd}: reply has no ok/error"))
}

fn dispatch_flight(
    vehicle_json: &Value,
    motor_json: &Value,
    options_json: &Value,
) -> Result<Value, String> {
    dispatch_call(
        "simulate_flight",
        &json!({
            "vehicle": vehicle_json,
            "motor": motor_json,
            "options": options_json,
            "reportMomentArmHistory": true,
        }),
    )
}

fn exact_f64(what: &str, a: f64, b: f64) -> Result<(), String> {
    if a == b {
        Ok(())
    } else {
        Err(format!(
            "parity mismatch {what}: dispatch {a:.17e} vs kernel {b:.17e}"
        ))
    }
}

fn single_flight(
    name: &str,
    role: &str,
    entry: &Value,
    ref_dump: &RefDump,
    out_dir: &Path,
    wind_override: Option<f64>,
    suffix: &str,
) -> Result<Value, String> {
    let vehicle: FrontendVehicle = serde_json::from_value(entry["vehicle"].clone())
        .map_err(|e| format!("{name}: vehicle dto: {e}"))?;
    let motor_dto: FrontendMotor = serde_json::from_value(entry["motor"].clone())
        .map_err(|e| format!("{name}: motor dto: {e}"))?;
    let mut options: FlightOptionsDto = serde_json::from_value(entry["options"].clone())
        .map_err(|e| format!("{name}: options dto: {e}"))?;
    let mut options_json = entry["options"].clone();
    if let Some(wind) = wind_override {
        options.wind_speed_surface = Some(wind);
        options_json["windSpeedSurface"] = json!(wind);
    }
    let vehicle_json = entry["vehicle"].clone();
    let prepared = models::prepare_flight_vehicle(&vehicle, &motor_dto)
        .map_err(|e| format!("{name}: prepare_flight_vehicle: {e}"))?;
    let core_motor = models::to_motor(&motor_dto)?;
    let core_opts = core_options(&options);
    let kernel = simulate_flight(&prepared, &core_motor, &core_opts)
        .map_err(|e| format!("{name}: kernel flight: {e}"))?;
    // The command function the dispatch invokes: bit-identical product path.
    let direct = astraea_engine::commands::simulate_flight_with_history(
        vehicle.clone(),
        motor_dto.clone(),
        options.clone(),
        true,
    )
    .map_err(|e| format!("{name}: command flight: {e}"))?;
    let dto = dispatch_flight(&vehicle_json, &entry["motor"], &options_json)
        .map_err(|e| format!("{name}: dispatch flight: {e}"))?;

    let dto_apogee = f64_of(&dto["apogeeAltitude"]).ok_or_else(|| format!("{name}: dto apogee"))?;
    let dto_max_mach = f64_of(&dto["maxMach"]).ok_or_else(|| format!("{name}: dto maxMach"))?;
    let dto_max_vel = f64_of(&dto["maxVelocity"]).ok_or_else(|| format!("{name}: dto maxVel"))?;
    let dto_burnout = f64_of(&dto["burnoutTime"]).ok_or_else(|| format!("{name}: dto burnout"))?;
    let dto_flight_time =
        f64_of(&dto["flightDuration"]).ok_or_else(|| format!("{name}: dto flightDuration"))?;
    let dto_landing_x =
        f64_of(&dto["landingPosition"]["x"]).ok_or_else(|| format!("{name}: dto landing x"))?;
    let dto_landing_y =
        f64_of(&dto["landingPosition"]["y"]).ok_or_else(|| format!("{name}: dto landing y"))?;

    // Command function <-> kernel: bit-exact (same prepared vehicle/motor/options).
    exact_f64("apogee", direct.apogee_altitude, kernel.apogee_altitude)?;
    exact_f64("maxMach", direct.max_mach, kernel.max_mach)?;
    exact_f64("maxVelocity", direct.max_velocity, kernel.max_velocity)?;
    exact_f64("burnoutTime", direct.burnout_time, kernel.burnout_time)?;
    exact_f64("flightDuration", direct.flight_duration, kernel.flight_time)?;
    exact_f64(
        "landingX",
        direct.landing_position.x,
        kernel.landing_position.x,
    )?;
    exact_f64(
        "landingY",
        direct.landing_position.y,
        kernel.landing_position.y,
    )?;

    // Dispatch wire reply: same command through JSON text. serde_json's float
    // parser can differ from the in-memory value by one ULP on a reply field;
    // require <= 8 ULP and record the observed difference.
    let mut wire_max_diff = 0.0f64;
    for (what, a, b) in [
        ("apogee", dto_apogee, direct.apogee_altitude),
        ("maxMach", dto_max_mach, direct.max_mach),
        ("maxVelocity", dto_max_vel, direct.max_velocity),
        ("burnoutTime", dto_burnout, direct.burnout_time),
        ("flightDuration", dto_flight_time, direct.flight_duration),
        ("landingX", dto_landing_x, direct.landing_position.x),
        ("landingY", dto_landing_y, direct.landing_position.y),
    ] {
        let (ok, diff) = close_f64(a, b);
        if !ok {
            return Err(format!(
                "{name}: dispatch wire parity {what} differs beyond 8 ULP ({a:.17e} vs {b:.17e})"
            ));
        }
        wire_max_diff = wire_max_diff.max(diff);
    }

    let mut analysis = analyze(&kernel, &prepared, &core_motor, &options)?;
    let wire = stats_from_wire(&dto, kernel.apogee_time)?;
    if wire.tumbles() != analysis.stats.tumbles() {
        return Err(format!(
            "{name}: wire-vs-full tumble classification mismatch (wire {} full {})",
            wire.tumbles(),
            analysis.stats.tumbles()
        ));
    }
    analysis.max_wire_aoa = wire.max_abs_aoa_deg;
    let (history_samples, history_max_diff) =
        history_crosscheck(&dto, &analysis.rows, prepared.ref_diameter)?;
    if history_max_diff > 0.01 {
        return Err(format!(
            "{name}: momentArmHistory margin cross-check {history_max_diff:.6} cal > 0.01"
        ));
    }

    let csv_name = format!("single_flight_{name}{suffix}.csv");
    fs::write(out_dir.join(&csv_name), &analysis.margin_csv)
        .map_err(|e| format!("write {csv_name}: {e}"))?;

    let ref_apogee_m = ref_dump.max_alt_ft * 0.3048;
    let apogee_residual_pct = (kernel.apogee_altitude - ref_apogee_m) / ref_apogee_m * 100.0;
    let min = analysis.min_margin.as_ref();
    let mut out = Map::new();
    out.insert("design".into(), json!(name));
    out.insert("role".into(), json!(role));
    out.insert("suffix".into(), json!(suffix));
    out.insert(
        "inputs".into(),
        json!({
            "wind_speed_mps": options.wind_speed_surface.unwrap_or(0.0),
            "rail_length_m": options.rail_length,
            "rail_elevation_deg": options.rail_elevation_deg,
            "launch_altitude_asl_m": options.launch_altitude_asl,
            "motor": core_motor.designation,
            "motor_burn_time_s": core_motor.burn_time,
            "prepared_dry_mass_kg": prepared.dry_mass,
            "prepared_cg_from_nose_m": prepared.cg_from_nose,
            "prepared_ref_diameter_m": prepared.ref_diameter,
            "reference_t0_weight_lb": ref_dump.t0_weight_lb,
            "reference_t0_cg_in": ref_dump.t0_cg_in,
            "loaded_mass_kg": loaded_mass(&prepared, &core_motor),
            "loaded_cg_m": analysis.margin_at_t0.cg_m,
        }),
    );
    out.insert(
        "reference".into(),
        json!({
            "apogee_m": ref_apogee_m,
            "apogee_ft": ref_dump.max_alt_ft,
            "max_mach": ref_dump.max_mach,
        }),
    );
    out.insert(
        "flight".into(),
        json!({
            "apogee_m": kernel.apogee_altitude,
            "apogee_residual_pct": apogee_residual_pct,
            "max_mach": kernel.max_mach,
            "max_velocity_mps": kernel.max_velocity,
            "burnout_time_s": kernel.burnout_time,
            "flight_time_s": kernel.flight_time,
            "terminated": kernel.terminated,
            "validity": kernel.validity,
            "enveloped": kernel.enveloped,
            "wire_telemetry_points": dto["telemetry"].as_array().map(|a| a.len()).unwrap_or(0),
            "full_telemetry_points": kernel.telemetry.len(),
            "window": analysis.stats.to_json(),
            "max_mach_sample": margin_row_json(&analysis.margin_at_max_mach),
            "margin_at_t0": margin_row_json(&analysis.margin_at_t0),
            "margin_min_window": min.map(margin_row_json),
            "negative_window_samples": analysis.negative_window_samples,
            "margin_samples": analysis.rows.len(),
            "wire_max_abs_aoa_deg": jnum(analysis.max_wire_aoa),
            "wire_vs_full_tumble_match": true,
            "history_crosscheck_samples": history_samples,
            "history_crosscheck_max_abs_diff_cal": history_max_diff,
            "parity_command_function_exact": true,
            "dispatch_wire_parity_max_abs_diff": wire_max_diff,
            "dispatch_wire_parity_ok": true,
        }),
    );
    Ok(Value::Object(out))
}

fn loaded_mass(vehicle: &Vehicle, motor: &MotorSpec) -> f64 {
    vehicle.dry_mass + motor.total_mass
}

fn margin_row_json(r: &MarginRow) -> Value {
    json!({
        "time_s": r.time,
        "mach": r.mach_display,
        "q_pa": r.q_pa,
        "aoa_deg": r.aoa_deg,
        "pitch_rate_dps": r.pitch_rate_dps,
        "cp_m": r.cp_m,
        "cg_m": r.cg_m,
        "margin_cal": r.margin_cal,
        "in_window": r.in_window,
    })
}

fn scaled_motor(base: &MotorSpec, scale: f64) -> Result<MotorSpec, String> {
    if !(scale > 0.0) || !scale.is_finite() {
        return Err(format!(
            "runMonteCarlo: impulse scale must be finite and positive (got {scale})"
        ));
    }
    let mut motor = base.clone();
    if scale != 1.0 {
        for point in &mut motor.thrust_curve {
            point.thrust *= scale;
        }
        motor.max_thrust *= scale;
    }
    Ok(motor)
}

fn monte_carlo(
    name: &str,
    entry: &Value,
    prepared: &Vehicle,
    base_motor: &MotorSpec,
    options: &FlightOptionsDto,
    options_json: &Value,
    out_dir: &Path,
) -> Result<Value, String> {
    let vehicle_json = &entry["vehicle"];
    let motor_json = &entry["motor"];
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
    let core_base = core_options(options);
    let mut per_run: Vec<Value> = Vec::new();
    let mut tumble_count = 0usize;
    let mut failure_count = 0usize;
    let mut aoa_values: Vec<f64> = Vec::new();
    let mut rate_values: Vec<f64> = Vec::new();
    let mut endpoint_max_diff = 0.0f64;
    let mut failure_messages: std::collections::BTreeMap<String, usize> =
        std::collections::BTreeMap::new();
    let mut first_failure_message: Option<String> = None;
    let mut csv = String::from(
        "run_index,tumble,max_abs_aoa_deg,max_pitch_rate_dps,window_samples,endpoint_x,endpoint_y,outcome,endpoint_match\n",
    );
    for start in (0..N_RUNS).step_by(CHUNK_RUNS as usize) {
        let end = (start + CHUNK_RUNS).min(N_RUNS);
        let req = json!({
            "vehicle": vehicle_json,
            "motor": motor_json,
            "options": options_json,
            "sigmas": {
                "windAzimuthDegSigma": SIGMA_WIND_DEG,
                "railAngleDegSigma": SIGMA_RAIL_DEG,
                "impulsePctSigma": SIGMA_IMPULSE_PCT,
            },
            "nRuns": N_RUNS,
            "seed": SEED,
            "version": "per-run-v2",
            "runStart": start,
            "runEnd": end,
        });
        let chunk = dispatch_call("run_ensemble_chunk", &json!({ "req": req }))
            .map_err(|e| format!("{name}: run_ensemble_chunk {start}..{end}: {e}"))?;
        if first_failure_message.is_none() {
            if let Some(msg) = chunk.get("firstFailureMessage").and_then(Value::as_str) {
                first_failure_message = Some(msg.to_string());
            }
        }
        let ledger = chunk
            .get("runs")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("{name}: chunk {start}..{end} missing runs"))?;
        if ledger.len() as i64 != end - start {
            return Err(format!(
                "{name}: chunk {start}..{end} returned {} runs",
                ledger.len()
            ));
        }
        for (offset, run) in ledger.iter().enumerate() {
            let index = start + offset as i64;
            if run["runIndex"].as_i64() != Some(index) {
                return Err(format!("{name}: chunk run index mismatch at {index}"));
            }
            let mut rng = Mulberry32::new(sub_seed_of(SEED, index));
            let perturbed = apply_perturbations(&base, &sigmas, &mut rng);
            let mut run_opts = core_base.clone();
            run_opts.wind_azimuth_deg = perturbed.wind_azimuth_deg;
            run_opts.rail_elevation_deg = perturbed.rail_elevation_deg;
            run_opts.record_telemetry = true;
            run_opts.record_moment_arm_history = false;
            let motor = scaled_motor(base_motor, perturbed.impulse_scale)?;
            let flight = simulate_flight(prepared, &motor, &run_opts);
            let outcome = run["outcome"].as_str().unwrap_or("").to_string();
            let ledger_endpoint = if run["endpoint"].is_null() {
                None
            } else {
                Some((
                    f64_of(&run["endpoint"]["x"]).ok_or_else(|| format!("{name}: ledger x"))?,
                    f64_of(&run["endpoint"]["y"]).ok_or_else(|| format!("{name}: ledger y"))?,
                ))
            };
            match flight {
                Ok(result) => {
                    let Some((lx, ly)) = ledger_endpoint else {
                        return Err(format!(
                            "{name}: run {index} instrumented success but ledger endpoint null (outcome {outcome})"
                        ));
                    };
                    let (ok_x, dx) = close_f64(result.landing_position.x, lx);
                    let (ok_y, dy) = close_f64(result.landing_position.y, ly);
                    if !ok_x || !ok_y {
                        return Err(format!(
                            "{name}: run {index} endpoint mismatch beyond 8 ULP ({:.17e},{:.17e}) vs ({:.17e},{:.17e})",
                            result.landing_position.x, result.landing_position.y, lx, ly
                        ));
                    }
                    endpoint_max_diff = endpoint_max_diff.max(dx).max(dy);
                    let stats = stats_from_core(&result);
                    let tumbles = stats.tumbles();
                    if tumbles {
                        tumble_count += 1;
                    }
                    if let Some(a) = stats.max_abs_aoa_deg {
                        aoa_values.push(a);
                    }
                    if let Some(r) = stats.max_pitch_rate_dps {
                        rate_values.push(r);
                    }
                    csv.push_str(&format!(
                        "{index},{},{:.6},{:.6},{},{:.6},{:.6},{},1\n",
                        tumbles as i32,
                        stats.max_abs_aoa_deg.unwrap_or(f64::NAN),
                        stats.max_pitch_rate_dps.unwrap_or(f64::NAN),
                        stats.samples,
                        result.landing_position.x,
                        result.landing_position.y,
                        outcome,
                    ));
                    per_run.push(json!({
                        "run_index": index,
                        "outcome": outcome,
                        "tumble": tumbles,
                        "max_abs_aoa_deg": jnum(stats.max_abs_aoa_deg),
                        "max_pitch_rate_dps": jnum(stats.max_pitch_rate_dps),
                        "window_samples": stats.samples,
                        "endpoint": [result.landing_position.x, result.landing_position.y],
                        "endpoint_match": true,
                        "rail_elevation_deg": perturbed.rail_elevation_deg,
                        "wind_azimuth_deg": perturbed.wind_azimuth_deg,
                        "impulse_scale": perturbed.impulse_scale,
                    }));
                }
                Err(err) => {
                    if ledger_endpoint.is_some() {
                        return Err(format!(
                            "{name}: run {index} instrumented failure '{err}' but ledger has endpoint"
                        ));
                    }
                    if outcome != "computational-failure" {
                        return Err(format!(
                            "{name}: run {index} instrumented failure but ledger outcome '{outcome}'"
                        ));
                    }
                    failure_count += 1;
                    let message = run["failureMessage"].as_str().unwrap_or("").to_string();
                    *failure_messages.entry(message.clone()).or_insert(0) += 1;
                    csv.push_str(&format!("{index},,,,0,,,{},1\n", outcome));
                    per_run.push(json!({
                        "run_index": index,
                        "outcome": outcome,
                        "tumble": Value::Null,
                        "max_abs_aoa_deg": Value::Null,
                        "max_pitch_rate_dps": Value::Null,
                        "window_samples": 0,
                        "endpoint": Value::Null,
                        "endpoint_match": true,
                        "failure_message": message,
                        "rail_elevation_deg": perturbed.rail_elevation_deg,
                        "wind_azimuth_deg": perturbed.wind_azimuth_deg,
                        "impulse_scale": perturbed.impulse_scale,
                    }));
                }
            }
        }
    }
    let tumble_fraction = tumble_count as f64 / N_RUNS as f64;
    let evaluable_runs = N_RUNS - failure_count as i64;
    let tumble_fraction_evaluable = if evaluable_runs > 0 {
        Some(tumble_count as f64 / evaluable_runs as f64)
    } else {
        None
    };
    let mut aoa_sorted = aoa_values.clone();
    aoa_sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mut rate_sorted = rate_values.clone();
    rate_sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = |v: &[f64]| -> Option<f64> {
        if v.is_empty() {
            None
        } else if v.len() % 2 == 1 {
            Some(v[v.len() / 2])
        } else {
            Some(0.5 * (v[v.len() / 2 - 1] + v[v.len() / 2]))
        }
    };
    let csv_name = format!("mc_{name}.csv");
    fs::write(out_dir.join(&csv_name), &csv).map_err(|e| format!("write {csv_name}: {e}"))?;
    Ok(json!({
        "design": name,
        "n_runs": N_RUNS,
        "seed": SEED,
        "version": "per-run-v2",
        "sigmas": {
            "wind_azimuth_deg": SIGMA_WIND_DEG,
            "rail_angle_deg": SIGMA_RAIL_DEG,
            "impulse_pct": SIGMA_IMPULSE_PCT,
        },
        "tumbles": tumble_count,
        "tumble_fraction": tumble_fraction,
        "evaluable_runs": evaluable_runs,
        "tumble_fraction_evaluable": jnum(tumble_fraction_evaluable),
        "failures": failure_count,
        "first_failure_message": first_failure_message,
        "failure_messages": json!(failure_messages),
        "aoa_min": jnum(aoa_sorted.first().copied()),
        "aoa_median": jnum(median(&aoa_sorted)),
        "aoa_max": jnum(aoa_sorted.last().copied()),
        "pitch_rate_min": jnum(rate_sorted.first().copied()),
        "pitch_rate_median": jnum(median(&rate_sorted)),
        "pitch_rate_max": jnum(rate_sorted.last().copied()),
        "endpoint_parity_mismatches": 0,
        "endpoint_parity_max_abs_diff": endpoint_max_diff,
        "runs": per_run,
    }))
}

fn diag_at_mach(
    vehicle: &Vehicle,
    motor: &MotorSpec,
    launch_alt: f64,
    t_stage: f64,
    target_mach: f64,
) -> Result<FlightLoadsDiagnostic, String> {
    let mut state = RigidState {
        r: Vec3::zero(),
        v: Vec3::zero(),
        q: Quat {
            w: 1.0,
            x: 0.0,
            y: 0.0,
            z: 0.0,
        },
        w: Vec3::zero(),
    };
    if target_mach > 0.0 {
        state.v = Vec3 {
            x: 0.0,
            y: 340.0 * target_mach,
            z: 0.0,
        };
        let first = diagnose_flight_loads(
            t_stage, &state, false, false, false, launch_alt, 0.0, 0.0, 0.0, vehicle, motor, 1.0,
        )?;
        if !(first.mach > 0.0) {
            return Err("screen: zero Mach at nonzero speed".to_string());
        }
        state.v.y *= target_mach / first.mach;
    }
    diagnose_flight_loads(
        t_stage, &state, false, false, false, launch_alt, 0.0, 0.0, 0.0, vehicle, motor, 1.0,
    )
}

fn screen_basis(
    vehicle: &Vehicle,
    motor: &MotorSpec,
    launch_alt: f64,
    t_stage: f64,
) -> Result<Value, String> {
    let ref_dia = vehicle.ref_diameter;
    let mut cg_m = f64::NAN;
    let mut margin_m0 = f64::NAN;
    let mut margin_m4 = f64::NAN;
    let mut m_cross: Option<f64> = None;
    let mut body_only_margin = f64::NAN;
    let mut body_cp_m = f64::NAN;
    for k in 0..=80 {
        let target = 0.05 * k as f64;
        let d = diag_at_mach(vehicle, motor, launch_alt, t_stage, target)?;
        let margin = (d.cp - d.combined_cg) / ref_dia;
        cg_m = d.combined_cg;
        if k == 0 {
            margin_m0 = margin;
        }
        if k == 80 {
            margin_m4 = margin;
            if d.cna_body.abs() > 0.0 {
                body_cp_m = d.body_first_moment / d.cna_body;
                body_only_margin = (body_cp_m - d.combined_cg) / ref_dia;
            }
        }
        if m_cross.is_none() && margin <= 0.0 {
            m_cross = Some(target);
        }
    }
    Ok(json!({
        "t_stage_s": t_stage,
        "cg_m": cg_m,
        "margin_m0_cal": margin_m0,
        "m_cross_negative": jnum(m_cross),
        "margin_m4_cal": margin_m4,
        "body_cp_m": jnum(Some(body_cp_m)),
        "body_only_margin_cal": jnum(Some(body_only_margin)),
    }))
}

fn screen_entry(name: &str, entry: &Value, ref_dump: &RefDump) -> Result<Value, String> {
    let vehicle: FrontendVehicle = serde_json::from_value(entry["vehicle"].clone())
        .map_err(|e| format!("{name}: screen vehicle dto: {e}"))?;
    let motor_dto: FrontendMotor = serde_json::from_value(entry["motor"].clone())
        .map_err(|e| format!("{name}: screen motor dto: {e}"))?;
    let options: FlightOptionsDto = serde_json::from_value(entry["options"].clone())
        .map_err(|e| format!("{name}: screen options dto: {e}"))?;
    let prepared = models::prepare_flight_vehicle(&vehicle, &motor_dto)
        .map_err(|e| format!("{name}: screen prepare: {e}"))?;
    let motor = models::to_motor(&motor_dto)?;
    let launch_alt = options.launch_altitude_asl.unwrap_or(0.0);
    let loaded = screen_basis(&prepared, &motor, launch_alt, 0.0)?;
    let burnout = screen_basis(&prepared, &motor, launch_alt, motor.burn_time)?;
    Ok(json!({
        "design": name,
        "reference_max_mach": ref_dump.max_mach,
        "reference_apogee_m": ref_dump.max_alt_ft * 0.3048,
        "loaded": loaded,
        "burnout": burnout,
    }))
}

fn find_entry<'a>(manifest: &'a Value, name: &str) -> Result<&'a Value, String> {
    manifest["entries"]
        .as_array()
        .ok_or_else(|| "manifest entries missing".to_string())?
        .iter()
        .find(|e| e["name"].as_str() == Some(name))
        .ok_or_else(|| format!("manifest entry '{name}' missing"))
}

fn run() -> Result<(), String> {
    let Some(manifest_path) = env_path("ASTRAEA_P1_MANIFEST") else {
        eprintln!("SKIP P1: ASTRAEA_P1_MANIFEST is not set.");
        return Ok(());
    };
    let Some(corpus) = env_path("ASTRAEA_P1_CORPUS") else {
        eprintln!("SKIP P1: ASTRAEA_P1_CORPUS is not set.");
        return Ok(());
    };
    let Some(out_dir) = env_path("ASTRAEA_P1_OUT") else {
        eprintln!("SKIP P1: ASTRAEA_P1_OUT is not set.");
        return Ok(());
    };
    fs::create_dir_all(&out_dir).map_err(|e| format!("create {}: {e}", out_dir.display()))?;
    let manifest: Value = serde_json::from_str(
        &fs::read_to_string(&manifest_path)
            .map_err(|e| format!("read {}: {e}", manifest_path.display()))?,
    )
    .map_err(|e| format!("manifest json: {e}"))?;

    let pre_reg_sha = fs::read_to_string(out_dir.join("pre_registration.sha256"))
        .map_err(|e| format!("read pre_registration.sha256: {e}"))?;
    let pre_reg_sha = pre_reg_sha
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_string();
    if pre_reg_sha.len() != 64 {
        return Err("pre-registration hash missing; refusing to run".to_string());
    }
    let pre_reg_bytes = fs::read(out_dir.join("pre_registration.json"))
        .map_err(|e| format!("read pre_registration.json: {e}"))?;
    let actual_sha = format!("{:x}", Sha256::digest(&pre_reg_bytes));
    if actual_sha != pre_reg_sha {
        return Err(format!(
            "pre-registration changed after freeze: file {actual_sha} vs frozen {pre_reg_sha}"
        ));
    }

    let mut design_results: Vec<Value> = Vec::new();
    let mut mc_results: Vec<Value> = Vec::new();

    for (name, role) in DESIGNS.iter().copied() {
        let entry = roundtrip_entry(find_entry(&manifest, name)?)?;
        let ref_dump = read_reference(&corpus.join(name).join("flight_trajectory.csv"))?;
        let record = single_flight(name, role, &entry, &ref_dump, &out_dir, None, "")?;
        design_results.push(record);
        let vehicle: FrontendVehicle = serde_json::from_value(entry["vehicle"].clone())
            .map_err(|e| format!("{name}: mc vehicle dto: {e}"))?;
        let motor_dto: FrontendMotor = serde_json::from_value(entry["motor"].clone())
            .map_err(|e| format!("{name}: mc motor dto: {e}"))?;
        let options: FlightOptionsDto = serde_json::from_value(entry["options"].clone())
            .map_err(|e| format!("{name}: mc options dto: {e}"))?;
        let prepared = models::prepare_flight_vehicle(&vehicle, &motor_dto)?;
        let core_motor = models::to_motor(&motor_dto)?;
        let mc = monte_carlo(
            name,
            &entry,
            &prepared,
            &core_motor,
            &options,
            &entry["options"],
            &out_dir,
        )?;
        mc_results.push(mc);
    }

    // Amendment: dontdebatethis is also flown at zero wind.
    let dd_name = "dontdebatethisn5800mindia";
    let dd_entry = roundtrip_entry(find_entry(&manifest, dd_name)?)?;
    let dd_ref = read_reference(&corpus.join(dd_name).join("flight_trajectory.csv"))?;
    let zero_wind = single_flight(
        dd_name,
        "supersonic screen-negative-but-R1-stable case (zero-wind isolation)",
        &dd_entry,
        &dd_ref,
        &out_dir,
        Some(0.0),
        "__zero_wind",
    )?;

    let mut screen: Vec<Value> = Vec::new();
    for name in SCREEN_DESIGNS.iter().copied() {
        let entry = roundtrip_entry(find_entry(&manifest, name)?)?;
        let ref_dump = read_reference(&corpus.join(name).join("flight_trajectory.csv"))?;
        screen.push(screen_entry(name, &entry, &ref_dump)?);
    }

    let mut summary = Map::new();
    summary.insert("pre_registration_sha256".into(), json!(pre_reg_sha));
    summary.insert("lane".into(), json!("r9/product-supersonic-check"));
    summary.insert(
        "pin".into(),
        json!({
            "head": "17a9c0621981929cb2318c6cc7ceb3470a3991b5",
            "base": "17a9c0621981929cb2318c6cc7ceb3470a3991b5",
            "law": "published-supersonic-normal-v1",
            "boattail": std::env::var("ASTRAEA_P1_BOATTAIL").unwrap_or_else(|_| "suppressed".to_string()),
        }),
    );
    summary.insert(
        "manifest".into(),
        json!(manifest_path.display().to_string()),
    );
    summary.insert("corpus".into(), json!(corpus.display().to_string()));
    let n_mc = mc_results.len();
    summary.insert("designs".into(), Value::Array(design_results));
    summary.insert("zero_wind_extra".into(), zero_wind);
    summary.insert("monte_carlo".into(), Value::Array(mc_results));
    summary.insert("screen".into(), Value::Array(screen));
    let result = Value::Object(summary);
    fs::write(
        out_dir.join("results.json"),
        serde_json::to_string_pretty(&result).map_err(|e| format!("results json: {e}"))?,
    )
    .map_err(|e| format!("write results.json: {e}"))?;
    eprintln!(
        "P1 complete: {} single flights, {} MC ensembles, {} screen rows -> {}",
        DESIGNS.len() + 1,
        n_mc,
        SCREEN_DESIGNS.len(),
        out_dir.display()
    );
    Ok(())
}

#[test]
fn p1_product_supersonic() {
    if let Err(err) = run() {
        panic!("P1 harness failed: {err}");
    }
}
