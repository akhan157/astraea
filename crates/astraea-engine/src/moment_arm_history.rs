//! Legacy sampled observables. No evaluator calls, source substitution or decision gates.
use astraea_core::six_dof::{SimulationResult, StageValidity, Vec3, Vehicle};
use astraea_core::moment_arm_history::MAX_MOMENT_ARM_SAMPLES;
use serde::Serialize;
use crate::models::Vec3Dto;

pub const SCHEMA_ID: &str = "astraea-flight-moment-arm-history/1.0.0";
pub const MODEL_ID: &str = "flight-signed-normal-plus-wind-drag-v1";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentArmHistoryDto {
    pub schema_id: &'static str,
    pub report_moment_arm_history: bool,
    /// Historical assembly id; unchanged for archive compatibility.
    pub model_id: &'static str,
    /// Normal-force law identity for this run.
    pub normal_law_id: &'static str,
    /// Boattail policy in force (`suppressed`, `attached`, or `not-applicable`).
    pub boattail_policy: &'static str,
    /// Fin-interference station rule that produced the Barrowman fin slope.
    pub fin_interference_id: &'static str,
    pub mechanical_model_id: &'static str,
    pub body_frame: &'static str,
    pub station_datum: &'static str,
    pub sampling: &'static str,
    pub reference_area_m2: f64,
    pub reference_diameter_m: f64,
    pub reference_length_m: f64,
    pub burnout_time_s: f64,
    pub sample_count: usize,
    pub time_range_s: [f64; 2],
    pub max_gap_s: f64,
    pub last_sample_to_burnout_s: f64,
    pub exact_burnout_sample_exists: bool,
    pub points: Vec<MomentArmPointDto>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MomentArmPointDto {
    pub time_s: f64,
    pub mass_kg: f64,
    pub cg_from_nose_m: f64,
    pub mach: f64,
    pub incidence_deg: f64,
    pub dynamic_pressure_pa: f64,
    pub rail_bound: bool,
    pub recovery: bool,
    pub powered: bool,
    pub domain: &'static str,
    pub aero_force_body_n: Vec3Dto,
    pub static_moment_body_nm: Vec3Dto,
    pub damping_moment_body_nm: Vec3Dto,
    pub total_moment_body_nm: Vec3Dto,
    pub normal_applicability: &'static str,
    pub normal: Option<NormalArmDto>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalArmDto {
    pub c_per_rad: f64,
    pub j_m_per_rad: f64,
    pub cp_from_nose_m: f64,
    pub arm_m: f64,
    pub arm_calibers: f64,
    pub arm_percent_length: f64,
    /// J-C*CG, m/rad. NOT dM/dalpha; q*S, wind-axis drag and rates excluded.
    pub cna_weighted_arm_m_per_rad: f64,
}

fn err(what: &str) -> String { format!("reportMomentArmHistory: {what}") }
fn finite(values: &[f64]) -> Result<(), String> {
    if values.iter().all(|value| value.is_finite()) { Ok(()) }
    else { Err(err("non-finite observable; refusing requested history")) }
}
fn vector(v: Vec3) -> Result<Vec3Dto, String> {
    finite(&[v.x, v.y, v.z])?;
    Ok(Vec3Dto { x: v.x, y: v.y, z: v.z })
}

pub fn to_dto(result: &SimulationResult, vehicle: &Vehicle) -> Result<MomentArmHistoryDto, String> {
    let raw = &result.moment_arm_history;
    if raw.is_empty() || raw.len() > MAX_MOMENT_ARM_SAMPLES {
        return Err(err("requested history must contain 1..5000 committed samples"));
    }
    let area = vehicle.ref_area();
    let diameter = vehicle.ref_diameter;
    let length = vehicle.total_length;
    finite(&[area, diameter, length, result.burnout_time, result.flight_time])?;
    if area <= 0.0 || diameter <= 0.0 || length <= 0.0 || result.burnout_time <= 0.0 {
        return Err(err("invalid reference geometry or declared motor burn time"));
    }
    let mut points = Vec::with_capacity(raw.len());
    let mut max_gap: f64 = 0.0;
    let mut previous = None;
    for point in raw {
        let d = &point.diagnostic;
        finite(&[point.time_s, point.mass_kg, d.combined_cg, d.mach,
            d.alpha_total_deg, d.q_inf, d.cna, d.first_moment, d.cp])?;
        if d.model_id != MODEL_ID || point.time_s < 0.0
            || point.time_s > result.burnout_time || point.time_s > result.flight_time
            || point.mass_kg <= 0.0 || d.mach < 0.0 || d.q_inf < 0.0
            || d.powered != (point.time_s < result.burnout_time)
        { return Err(err("inconsistent committed sample/source/clock")); }
        if let Some(t) = previous {
            if point.time_s <= t { return Err(err("sample times must strictly increase")); }
            max_gap = max_gap.max(point.time_s - t);
        } else if point.time_s != 0.0 { return Err(err("initial committed sample is missing")); }
        previous = Some(point.time_s);
        // Mask inactive canopy-time airframe quantities only after the original
        // evaluator has succeeded. Never weakens its positive/conditioned-C guard.
        let normal = if d.recovery { None } else {
            let arm = d.cp - d.combined_cg;
            let weighted = d.first_moment - d.cna * d.combined_cg;
            let calibers = arm / diameter;
            let percent = 100.0 * arm / length;
            finite(&[arm, weighted, calibers, percent])?;
            Some(NormalArmDto {
                c_per_rad: d.cna, j_m_per_rad: d.first_moment, cp_from_nose_m: d.cp,
                arm_m: arm, arm_calibers: calibers, arm_percent_length: percent,
                cna_weighted_arm_m_per_rad: weighted,
            })
        };
        points.push(MomentArmPointDto {
            time_s: point.time_s, mass_kg: point.mass_kg, cg_from_nose_m: d.combined_cg,
            mach: d.mach, incidence_deg: d.alpha_total_deg, dynamic_pressure_pa: d.q_inf,
            rail_bound: d.rail_bound, recovery: d.recovery, powered: d.powered,
            domain: match d.validity {
                StageValidity::Valid => "valid", StageValidity::Extrapolated => "extrapolated",
                StageValidity::Unsupported => "unsupported",
            },
            aero_force_body_n: vector(d.aero_force_body)?,
            static_moment_body_nm: vector(d.static_moment_body)?,
            damping_moment_body_nm: vector(d.damping_moment_body)?,
            total_moment_body_nm: vector(d.total_moment_body)?,
            normal_applicability: if d.recovery { "not-applicable-live-canopy" } else { "active-airframe" },
            normal,
        });
    }
    let first = points[0].time_s;
    let last = points.last().unwrap().time_s;
    Ok(MomentArmHistoryDto {
        schema_id: SCHEMA_ID, report_moment_arm_history: true, model_id: MODEL_ID,
        normal_law_id: result.normal_law_id,
        boattail_policy: result.boattail_policy,
        fin_interference_id: result.fin_interference_id,
        mechanical_model_id: "legacy-primitive-mass-inertia/1.0.0",
        body_frame: "right-handed-+Y-noseward; rates=pitch,roll,yaw",
        station_datum: "meters-aft-of-nose; moments-about-instantaneous-combined-CG",
        sampling: "committed-macro-through-motor-burn-time-plus-initial",
        reference_area_m2: area, reference_diameter_m: diameter, reference_length_m: length,
        burnout_time_s: result.burnout_time, sample_count: points.len(), time_range_s: [first, last],
        max_gap_s: max_gap, last_sample_to_burnout_s: result.burnout_time - last,
        exact_burnout_sample_exists: points.iter().any(|p| p.time_s == result.burnout_time),
        points,
    })
}
