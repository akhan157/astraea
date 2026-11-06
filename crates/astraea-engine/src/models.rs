//! Astraea Tauri shell: IPC DTOs + the frontend-to-core vehicle prepare
//! pipeline. The TS `src/` tree is the read-only oracle; this shell is the
//! ONLY runtime path (replacement build, no TS fallback).
//!
//! IPC rule: seven coarse-grained commands (`run_ensemble`,
//! `run_ensemble_chunk`, `simulate_flight`, `solve_chamber`,
//! `nozzle_performance`, `stability`, `aero_curves`, `aggregate_mass`) —
//! never per-step serialization. `simulate_flight` is the
//! one bounded exception: it returns ONE display telemetry series (at most
//! `astraea_core::telemetry::MAX_TELEMETRY_POINTS` points, decimated in Rust,
//! keeping the first, terminal and event-time samples). Ensembles return
//! coarse metrics only and never carry telemetry.
//!
//! The six_dof kernel takes a PRECOMPUTED vehicle (dry mass, CG station,
//! Barrowman normal-slope split, 25-pt drag tables). The prepare pipeline
//! below assembles that from the frontend's axial component list via the
//! real engines (mass rollup → Barrowman split → transonic curves), exactly
//! mirroring `prepareVehicle` in `src/dynamics/loads.ts`.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

// ---------------------------------------------------------------------------
// Frontend vehicle DTOs (camelCase wire format, matching the TS component
// interfaces in src/core/types.ts)
// ---------------------------------------------------------------------------

/// One vertex of a freeform fin outline (meters).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FrontendFinPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendComponent {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub material_id: Option<String>,
    pub shape: Option<String>,
    pub length: Option<f64>,
    pub base_diameter: Option<f64>,
    pub wall_thickness: Option<f64>,
    pub is_hollow: Option<bool>,
    pub outer_diameter: Option<f64>,
    pub inner_diameter: Option<f64>,
    pub is_motor_mount: Option<bool>,
    pub fore_diameter: Option<f64>,
    pub aft_diameter: Option<f64>,
    pub fin_count: Option<f64>,
    pub root_chord: Option<f64>,
    pub tip_chord: Option<f64>,
    pub span: Option<f64>,
    pub sweep_length: Option<f64>,
    pub points: Option<Vec<FrontendFinPoint>>,
    pub thickness: Option<f64>,
    pub cross_section: Option<String>,
    pub axial_offset: Option<f64>,
    pub mass: Option<f64>,
    pub diameter: Option<f64>,
    pub cd: Option<f64>,
    pub mass_override: Option<f64>,
    pub cg_override: Option<f64>,
    /// Rail-guide button diameter (m; body tubes).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rail_guide_diameter: Option<f64>,
    /// Rail-guide standoff height (m; body tubes).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rail_guide_height: Option<f64>,
    /// Launch-lug outer diameter (m; body tubes).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_lug_diameter: Option<f64>,
    /// Launch-shoe frontal area (m^2; body tubes).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub launch_shoe_area: Option<f64>,
    /// Calibrated fin airfoil name (trapezoidal fin sets).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub airfoil_section: Option<String>,
    /// Leading-edge bevel length (m; trapezoidal fin sets).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leading_edge_bevel: Option<f64>,
    /// Trailing-edge bevel length (m; trapezoidal fin sets).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trailing_edge_bevel: Option<f64>,
    /// Leading-edge radius (m; trapezoidal fin sets).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leading_edge_radius: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendVehicle {
    pub components: Vec<FrontendComponent>,
    /// Calibrated surface-finish name; absent keeps the method default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub surface_finish: Option<String>,
    /// Force turbulent skin friction; absent keeps the method default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub force_turbulent_flow: Option<bool>,
    /// Nozzle exit diameter (m); absent keeps the method default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nozzle_exit_diameter: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendThrustPoint {
    pub time: f64,
    pub thrust: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendMotor {
    pub designation: Option<String>,
    pub diameter: f64,
    pub length: f64,
    pub burn_time: f64,
    pub propellant_mass: f64,
    pub total_mass: f64,
    pub dry_mass: f64,
    pub max_thrust: Option<f64>,
    pub thrust_curve: Vec<FrontendThrustPoint>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FlightOptionsDto {
    pub rail_length: Option<f64>,
    pub rail_elevation_deg: Option<f64>,
    pub rail_azimuth_deg: Option<f64>,
    #[serde(rename = "launchAltitudeASL")]
    pub launch_altitude_asl: Option<f64>,
    pub wind_speed_surface: Option<f64>,
    pub wind_azimuth_deg: Option<f64>,
    #[serde(rename = "mainDeployAltitudeAGL")]
    pub main_deploy_altitude_agl: Option<f64>,
    pub time_step: Option<f64>,
    pub fin_cant_angle_deg: Option<f64>,
    /// Airframe axial-drag multiplier (default 1.0). Positive finite when present.
    pub drag_cd_scale: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsembleRequest {
    pub vehicle: FrontendVehicle,
    pub motor: FrontendMotor,
    pub options: FlightOptionsDto,
    pub sigmas: SigmasDto,
    pub n_runs: i64,
    pub seed: i64,
    pub version: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigmasDto {
    pub wind_azimuth_deg_sigma: Option<f64>,
    pub rail_angle_deg_sigma: Option<f64>,
    pub impulse_pct_sigma: Option<f64>,
}

/// One absolute run range of a `per-run-v2` ensemble (S5 background host).
/// Chunk results are bit-identical to the same range inside a single
/// `run_ensemble` call, so a host may partition the ensemble freely.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsembleChunkRequest {
    pub vehicle: FrontendVehicle,
    pub motor: FrontendMotor,
    pub options: FlightOptionsDto,
    pub sigmas: SigmasDto,
    pub n_runs: i64,
    pub seed: i64,
    pub version: String,
    pub run_start: i64,
    pub run_end: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkResultDto {
    pub run_start: i64,
    pub run_end: i64,
    pub landings: Vec<LandingPointDto>,
    pub failed_runs: i64,
    pub first_failure_message: Option<String>,
    /// One classified ledger entry per absolute run index in this chunk.
    pub runs: Vec<RunOutcomeDto>,
    pub counts: OutcomeCountsDto,
    pub outcome_policy: String,
    /// Normal-force law and boattail policy evaluated by every run in the chunk.
    pub normal_law_id: String,
    pub boattail_policy: String,
    /// Fin-interference station rule shared by every run in the chunk.
    pub fin_interference_id: String,
}

/// One run's carried native classification. Fields are `null` only when the
/// native result is genuinely unknown (a command error or non-finite endpoint).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutcomeDto {
    pub run_index: i64,
    pub outcome: String,
    pub endpoint: Option<LandingPointDto>,
    pub terminated: Option<bool>,
    pub termination_reason: Option<String>,
    pub touchdown_nominal: Option<bool>,
    pub validity: Option<String>,
    pub enveloped: Option<bool>,
    pub off_nominal_excursion: Option<bool>,
    pub failure_message: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutcomeCountsDto {
    pub requested: i64,
    pub supported_nominal_terminal: i64,
    pub unsupported_nominal_touchdown: i64,
    pub non_nominal_impact: i64,
    pub time_limit_endpoint: i64,
    pub computational_failure: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedLandingDto {
    pub run_index: i64,
    pub point: LandingPointDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DispersionStatisticsDto {
    pub mean: LandingPointDto,
    pub covariance: CovarianceDto,
    pub sigma1: f64,
    pub sigma2: f64,
    pub theta_deg: f64,
    pub containment_radii: ContainmentDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassifiedDispersionResultDto {
    pub normal_law_id: String,
    pub boattail_policy: String,
    pub fin_interference_id: String,
    pub requested_runs: i64,
    pub runs: Vec<RunOutcomeDto>,
    pub counts: OutcomeCountsDto,
    /// Legacy meaning: every finite endpoint in absolute index order.
    pub landings: Vec<LandingPointDto>,
    pub endpoints: Vec<IndexedLandingDto>,
    pub eligible_endpoints: Vec<IndexedLandingDto>,
    pub successful_runs: i64,
    pub failed_runs: i64,
    pub statistics_available: bool,
    pub statistics: Option<DispersionStatisticsDto>,
    pub outcome_policy: String,
}

pub const CLASSIFIED_OUTCOME_POLICY: &str = "classified-v1";

pub fn to_run_outcome_dto(r: &astraea_core::monte_carlo::ClassifiedRun) -> RunOutcomeDto {
    RunOutcomeDto {
        run_index: r.run_index,
        outcome: r.outcome.as_str().to_string(),
        endpoint: r.endpoint.map(|p| LandingPointDto { x: p.x, y: p.y }),
        terminated: r.terminated,
        termination_reason: r.termination_reason.clone(),
        touchdown_nominal: r.touchdown_nominal,
        validity: r.validity.clone(),
        enveloped: r.enveloped,
        off_nominal_excursion: r.off_nominal_excursion,
        failure_message: r.failure_message.clone(),
    }
}

pub fn to_outcome_counts_dto(c: &astraea_core::monte_carlo::OutcomeCounts) -> OutcomeCountsDto {
    OutcomeCountsDto {
        requested: c.requested,
        supported_nominal_terminal: c.supported_nominal_terminal,
        unsupported_nominal_touchdown: c.unsupported_nominal_touchdown,
        non_nominal_impact: c.non_nominal_impact,
        time_limit_endpoint: c.time_limit_endpoint,
        computational_failure: c.computational_failure,
    }
}

fn to_indexed_endpoint_dto(e: &astraea_core::monte_carlo::IndexedEndpoint) -> IndexedLandingDto {
    IndexedLandingDto {
        run_index: e.run_index,
        point: LandingPointDto { x: e.point.x, y: e.point.y },
    }
}

pub fn to_classified_dispersion_dto(
    r: &astraea_core::monte_carlo::ClassifiedDispersionResult,
    normal_identity: (&str, &str),
) -> ClassifiedDispersionResultDto {
    ClassifiedDispersionResultDto {
        normal_law_id: normal_identity.0.to_string(),
        boattail_policy: normal_identity.1.to_string(),
        fin_interference_id: astraea_core::aero::FIN_INTERFERENCE_ID.to_string(),
        requested_runs: r.requested_runs,
        runs: r.runs.iter().map(to_run_outcome_dto).collect(),
        counts: to_outcome_counts_dto(&r.counts),
        landings: r.landings.iter().map(|p| LandingPointDto { x: p.x, y: p.y }).collect(),
        endpoints: r.endpoints.iter().map(to_indexed_endpoint_dto).collect(),
        eligible_endpoints: r.eligible_endpoints.iter().map(to_indexed_endpoint_dto).collect(),
        successful_runs: r.successful_runs,
        failed_runs: r.failed_runs,
        statistics_available: r.statistics_available,
        statistics: r.statistics.map(|s| DispersionStatisticsDto {
            mean: LandingPointDto { x: s.mean.x, y: s.mean.y },
            covariance: CovarianceDto { xx: s.covariance.xx, xy: s.covariance.xy, yy: s.covariance.yy },
            sigma1: s.sigma1,
            sigma2: s.sigma2,
            theta_deg: s.theta_deg,
            containment_radii: ContainmentDto {
                r50: s.containment.r50,
                r90: s.containment.r90,
                r99: s.containment.r99,
            },
        }),
        outcome_policy: CLASSIFIED_OUTCOME_POLICY.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Small converters (TS wire <-> core enums)
// ---------------------------------------------------------------------------

fn nose_shape(s: Option<&str>) -> Result<astraea_core::mass::NoseShape, String> {
    use astraea_core::mass::NoseShape as NS;
    match s.unwrap_or("conical") {
        "conical" => Ok(NS::Conical),
        "ogive" => Ok(NS::Ogive),
        "parabolic" => Ok(NS::Parabolic),
        "vonkarman" => Ok(NS::VonKarman),
        "elliptical" => Ok(NS::Elliptical),
        other => Err(format!("vehicle geometry: unknown nosecone shape '{other}'")),
    }
}

fn aero_nose_shape(s: Option<&str>) -> Result<astraea_core::aero::NoseShape, String> {
    use astraea_core::aero::NoseShape as NS;
    match s.unwrap_or("conical") {
        "conical" => Ok(NS::Conical),
        "ogive" => Ok(NS::Ogive),
        "parabolic" => Ok(NS::Parabolic),
        "vonkarman" => Ok(NS::VonKarman),
        "elliptical" => Ok(NS::Elliptical),
        other => Err(format!("vehicle geometry: unknown nosecone shape '{other}'")),
    }
}

fn aero_cross_section(s: Option<&str>) -> astraea_core::aero::FinCrossSection {
    use astraea_core::aero::FinCrossSection as XS;
    match s.unwrap_or("rounded") {
        "square" => XS::Square,
        "double_wedge" => XS::DoubleWedge,
        "airfoil" => XS::Airfoil,
        _ => XS::Rounded,
    }
}

fn req(value: Option<f64>, what: &str, id: &str) -> Result<f64, String> {
    match value {
        Some(v) => Ok(v),
        None => Err(format!("vehicle geometry: component '{id}' is missing {what}")),
    }
}

fn fin_points(
    points: &Option<Vec<FrontendFinPoint>>,
    id: &str,
) -> Result<Vec<astraea_core::fin_planform::FinPoint>, String> {
    match points {
        Some(p) => Ok(p
            .iter()
            .map(|q| astraea_core::fin_planform::FinPoint { x: q.x, y: q.y })
            .collect()),
        None => Err(format!(
            "vehicle geometry: component '{id}' is missing points"
        )),
    }
}

fn fin_count(value: Option<f64>, id: &str) -> Result<i32, String> {
    match value {
        Some(v) if v.is_finite() && v.fract() == 0.0 && v >= 1.0 && v <= 100.0 => Ok(v as i32),
        Some(v) => Err(format!(
            "vehicle geometry: finCount must be a positive integer (got {v})"
        )),
        None => Err(format!(
            "vehicle geometry: component '{id}' is missing finCount"
        )),
    }
}

// ---------------------------------------------------------------------------
// mass::Vehicle conversion (fails closed with TS-equivalent messages)
// ---------------------------------------------------------------------------

pub fn to_mass_vehicle(fv: &FrontendVehicle) -> Result<astraea_core::mass::Vehicle, String> {
    use astraea_core::mass::{Component as C, VehicleComponent as VC};
    let mut components = Vec::with_capacity(fv.components.len());
    for c in &fv.components {
        let material_id = c.material_id.clone().unwrap_or_else(|| "cardboard".to_string());
        let comp = match c.kind.as_str() {
            "nosecone" => C::Nosecone {
                shape: nose_shape(c.shape.as_deref())?,
                length: req(c.length, "length", &c.id)?,
                base_diameter: req(c.base_diameter, "baseDiameter", &c.id)?,
                wall_thickness: c.wall_thickness.unwrap_or(0.002),
                is_hollow: c.is_hollow.unwrap_or(false),
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "bodytube" => C::BodyTube {
                length: req(c.length, "length", &c.id)?,
                outer_diameter: req(c.outer_diameter, "outerDiameter", &c.id)?,
                inner_diameter: c.inner_diameter,
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "transition" => C::Transition {
                length: req(c.length, "length", &c.id)?,
                fore_diameter: req(c.fore_diameter, "foreDiameter", &c.id)?,
                aft_diameter: req(c.aft_diameter, "aftDiameter", &c.id)?,
                wall_thickness: c.wall_thickness.unwrap_or(0.003),
                is_hollow: c.is_hollow.unwrap_or(true),
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "trapezoidfinset" => C::TrapezoidFin {
                fin_count: fin_count(c.fin_count, &c.id)?,
                root_chord: req(c.root_chord, "rootChord", &c.id)?,
                tip_chord: req(c.tip_chord, "tipChord", &c.id)?,
                span: req(c.span, "span", &c.id)?,
                sweep_length: c.sweep_length.unwrap_or(0.0),
                thickness: req(c.thickness, "thickness", &c.id)?,
                axial_offset: c.axial_offset,
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "freeformfinset" => C::FreeformFin {
                fin_count: fin_count(c.fin_count, &c.id)?,
                points: fin_points(&c.points, &c.id)?,
                thickness: req(c.thickness, "thickness", &c.id)?,
                axial_offset: c.axial_offset,
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "ellipticalfinset" => C::EllipticalFin {
                fin_count: fin_count(c.fin_count, &c.id)?,
                root_chord: req(c.root_chord, "rootChord", &c.id)?,
                span: req(c.span, "span", &c.id)?,
                thickness: req(c.thickness, "thickness", &c.id)?,
                axial_offset: c.axial_offset,
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "masscomponent" => C::MassComp {
                mass: req(c.mass, "mass", &c.id)?,
                length: c.length,
                axial_offset: c.axial_offset,
            },
            "parachute" => C::Parachute {
                mass: req(c.mass, "mass", &c.id)?,
                diameter: req(c.diameter, "diameter", &c.id)?,
                cd: req(c.cd, "cd", &c.id)?,
                axial_offset: c.axial_offset,
            },
            other => C::Unknown {
                kind: other.to_string(),
            },
        };
        components.push(VC {
            id: c.id.clone(),
            material_id,
            component: comp,
        });
    }
    Ok(astraea_core::mass::Vehicle { components })
}

// ---------------------------------------------------------------------------
// aero::Vehicle conversion (same fields, aero module-local types)
// ---------------------------------------------------------------------------

fn component_design_inputs(c: &FrontendComponent) -> astraea_core::aero::ComponentDesignInputs {
    astraea_core::aero::ComponentDesignInputs {
        rail_guide_diameter: c.rail_guide_diameter,
        rail_guide_height: c.rail_guide_height,
        launch_lug_diameter: c.launch_lug_diameter,
        launch_shoe_area: c.launch_shoe_area,
        airfoil_section: c.airfoil_section.clone(),
        leading_edge_bevel: c.leading_edge_bevel,
        trailing_edge_bevel: c.trailing_edge_bevel,
        leading_edge_radius: c.leading_edge_radius,
    }
}

fn has_component_design_inputs(inputs: &astraea_core::aero::ComponentDesignInputs) -> bool {
    inputs.rail_guide_diameter.is_some()
        || inputs.rail_guide_height.is_some()
        || inputs.launch_lug_diameter.is_some()
        || inputs.launch_shoe_area.is_some()
        || inputs.airfoil_section.is_some()
        || inputs.leading_edge_bevel.is_some()
        || inputs.trailing_edge_bevel.is_some()
        || inputs.leading_edge_radius.is_some()
}

pub fn to_aero_vehicle(fv: &FrontendVehicle) -> Result<astraea_core::aero::Vehicle, String> {
    use astraea_core::aero::{Component as C, VehicleComponent as VC};
    let mut components = Vec::with_capacity(fv.components.len());
    let mut design_components = BTreeMap::new();
    for c in &fv.components {
        let material_id = c.material_id.clone().unwrap_or_else(|| "cardboard".to_string());
        let comp = match c.kind.as_str() {
            "nosecone" => C::Nosecone {
                shape: aero_nose_shape(c.shape.as_deref())?,
                length: req(c.length, "length", &c.id)?,
                base_diameter: req(c.base_diameter, "baseDiameter", &c.id)?,
                wall_thickness: c.wall_thickness.unwrap_or(0.002),
                is_hollow: c.is_hollow.unwrap_or(false),
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "bodytube" => C::BodyTube {
                length: req(c.length, "length", &c.id)?,
                outer_diameter: req(c.outer_diameter, "outerDiameter", &c.id)?,
                inner_diameter: c.inner_diameter,
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "transition" => C::Transition {
                length: req(c.length, "length", &c.id)?,
                fore_diameter: req(c.fore_diameter, "foreDiameter", &c.id)?,
                aft_diameter: req(c.aft_diameter, "aftDiameter", &c.id)?,
                wall_thickness: c.wall_thickness.unwrap_or(0.003),
                is_hollow: c.is_hollow.unwrap_or(true),
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "trapezoidfinset" => C::TrapezoidFin {
                fin_count: fin_count(c.fin_count, &c.id)?,
                root_chord: req(c.root_chord, "rootChord", &c.id)?,
                tip_chord: req(c.tip_chord, "tipChord", &c.id)?,
                span: req(c.span, "span", &c.id)?,
                sweep_length: c.sweep_length.unwrap_or(0.0),
                thickness: req(c.thickness, "thickness", &c.id)?,
                cross_section: aero_cross_section(c.cross_section.as_deref()),
                axial_offset: c.axial_offset,
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "freeformfinset" => C::FreeformFin {
                fin_count: fin_count(c.fin_count, &c.id)?,
                points: fin_points(&c.points, &c.id)?,
                thickness: req(c.thickness, "thickness", &c.id)?,
                cross_section: aero_cross_section(c.cross_section.as_deref()),
                axial_offset: c.axial_offset,
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "ellipticalfinset" => C::EllipticalFin {
                fin_count: fin_count(c.fin_count, &c.id)?,
                root_chord: req(c.root_chord, "rootChord", &c.id)?,
                span: req(c.span, "span", &c.id)?,
                thickness: req(c.thickness, "thickness", &c.id)?,
                axial_offset: c.axial_offset,
                mass_override: c.mass_override,
                cg_override: c.cg_override,
            },
            "masscomponent" => C::MassComp {
                mass: req(c.mass, "mass", &c.id)?,
                length: c.length,
                axial_offset: c.axial_offset,
            },
            "parachute" => C::Parachute {
                mass: req(c.mass, "mass", &c.id)?,
                diameter: req(c.diameter, "diameter", &c.id)?,
                cd: req(c.cd, "cd", &c.id)?,
                axial_offset: c.axial_offset,
            },
            other => C::Unknown {
                kind: other.to_string(),
            },
        };
        let design = component_design_inputs(c);
        if has_component_design_inputs(&design) {
            design_components.insert(c.id.clone(), design);
        }
        components.push(VC {
            id: c.id.clone(),
            name: c.name.clone(),
            material_id,
            component: comp,
        });
    }
    let design_inputs = if fv.surface_finish.is_some()
        || fv.force_turbulent_flow.is_some()
        || fv.nozzle_exit_diameter.is_some()
        || !design_components.is_empty()
    {
        Some(astraea_core::aero::VehicleDesignInputs {
            surface_finish: fv.surface_finish.clone(),
            force_turbulent_flow: fv.force_turbulent_flow,
            nozzle_exit_diameter: fv.nozzle_exit_diameter,
            components: design_components,
        })
    } else {
        None
    };
    Ok(astraea_core::aero::Vehicle {
        components,
        design_inputs,
    })
}

// ---------------------------------------------------------------------------
// Motor conversion (TS MotorSpec wire record -> six_dof::MotorSpec)
// ---------------------------------------------------------------------------

pub fn to_motor(fm: &FrontendMotor) -> Result<astraea_core::six_dof::MotorSpec, String> {
    use astraea_core::six_dof::{MotorSpec, ThrustPoint};
    if fm.thrust_curve.len() < 2 {
        let what = fm.designation.clone().unwrap_or_else(|| "motor".to_string());
        return Err(format!("motor validation: {what} thrust curve needs at least two points"));
    }
    Ok(MotorSpec {
        designation: fm
            .designation
            .clone()
            .unwrap_or_else(|| "imported_motor".to_string()),
        diameter: fm.diameter,
        length: fm.length,
        burn_time: fm.burn_time,
        propellant_mass: fm.propellant_mass,
        total_mass: fm.total_mass,
        dry_mass: fm.dry_mass,
        max_thrust: fm.max_thrust.unwrap_or(0.0),
        thrust_curve: fm
            .thrust_curve
            .iter()
            .map(|p| ThrustPoint {
                time: p.time,
                thrust: p.thrust,
            })
            .collect(),
    })
}

// ---------------------------------------------------------------------------
// Prepare pipeline: frontend axial list -> precomputed six_dof::Vehicle.
//
// Mirrors `prepareVehicle` (src/dynamics/loads.ts): mass rollup -> Barrowman
// fin/body normal-slope split -> 25-pt transonic drag tables (powered +
// coasting) -> motor-aft-station resolution with mount uniqueness, bore fit,
// and 50%-retention checks. Tables here are generated per-vehicle (not the
// Estes-Alpha fixture) by sampling `compute_aerodynamic_curves` engines at
// the 25 Mach stations the kernel interpolates over.
// ---------------------------------------------------------------------------

fn drag_table(vehicle: &astraea_core::aero::Vehicle, powered: bool) -> Result<Vec<f64>, String> {
    // 25 stations over M 0..4; kernel interpolates linearly between them.
    let curves = astraea_core::aero::compute_aerodynamic_curves(vehicle, powered, 25)?;
    Ok(curves.drag_curves.iter().map(|d| d.total_cd).collect())
}

pub fn prepare_flight_vehicle(
    fv: &FrontendVehicle,
    fm: &FrontendMotor,
) -> Result<astraea_core::six_dof::Vehicle, String> {
    let mass_v = to_mass_vehicle(fv)?;
    let rollup = astraea_core::mass::aggregate_mass(&mass_v)?;
    let aero_v = to_aero_vehicle(fv)?;
    let stab = astraea_core::aero::stability(&aero_v)?;

    // Signed Barrowman superposition: preserve force and first moment separately.
    // A zero or negative group force must not discard its nonzero moment.
    let mut cna_fins = 0.0;
    let mut cp_fins_moment = 0.0;
    let mut cna_body = 0.0;
    let mut cp_body_moment = 0.0;
    let mut body_abs_cna = 0.0;
    let mut fin_abs_cna = 0.0;
    // Published supersonic normal law (Option B): per-fin-set planform and the
    // positive non-fin area growth (nose + diameter increases). The attached
    // copy is retained so the boattail arm can be switched without a rebuild.
    let mut fin_sets: Vec<astraea_core::six_dof::FinNormalSet> = Vec::new();
    let mut body_positive_cna = 0.0;
    let mut body_positive_moment = 0.0;
    let mut body_positive_abs_cna = 0.0;
    for s in &stab.contributions {
        if is_fin_kind(&s.kind) {
            add_normal_contribution(s.cna, s.cp, &s.id,
                &mut cna_fins, &mut cp_fins_moment, &mut fin_abs_cna)?;
            if let Some(cna) = s.cna {
                if cna != 0.0 {
                    let cp = s.cp.ok_or_else(|| {
                        format!("prepareVehicle: nonzero normal slope for '{}' requires finite CP", s.id)
                    })?;
                    let component = fv
                        .components
                        .iter()
                        .find(|c| c.id == s.id)
                        .ok_or_else(|| {
                            format!("prepareVehicle: fin contribution '{}' has no component", s.id)
                        })?;
                    let (aspect_ratio, leading_edge_cos) = fin_normal_planform(component)?;
                    fin_sets.push(astraea_core::six_dof::FinNormalSet {
                        cna_per_rad: cna,
                        cp_station_m: cp,
                        aspect_ratio,
                        leading_edge_cos,
                    });
                }
            }
        } else {
            add_normal_contribution(s.cna, s.cp, &s.id,
                &mut cna_body, &mut cp_body_moment, &mut body_abs_cna)?;
            if let Some(cna) = s.cna {
                if cna > 0.0 {
                    let cp = s.cp.unwrap_or(0.0);
                    body_positive_cna += cna;
                    body_positive_moment += cna * cp;
                    body_positive_abs_cna += cna.abs();
                }
            }
        }
    }

    // Motor mount resolution (mirrors resolveMotorCentroid audit §5.5):
    // exactly one flagged mount or the aft-end fallback; bore fit + retention.
    let mounts: Vec<&FrontendComponent> = fv
        .components
        .iter()
        .filter(|c| c.kind == "bodytube" && c.is_motor_mount == Some(true))
        .collect();
    if mounts.len() > 1 {
        let ids: Vec<&str> = mounts.iter().map(|m| m.id.as_str()).collect();
        return Err(format!(
            "prepareVehicle: {} motor mounts flagged ({}) — assignment must be unique",
            mounts.len(),
            ids.join(", ")
        ));
    }
    let motor_aft_station_from_nose = match mounts.first() {
        None => rollup.total_length,
        Some(mount) => {
            let rec = rollup
                .components
                .iter()
                .find(|r| r.id == mount.id)
                .ok_or_else(|| {
                    format!("prepareVehicle: mount '{}' has no mass-rollup record", mount.id)
                })?;
            let mount_end = rec.axial_start + rec.length;
            let bore = mount
                .inner_diameter
                .unwrap_or_else(|| (mount.outer_diameter.unwrap_or(0.0) - 0.003).max(0.0));
            if !(bore > 0.0) {
                return Err(format!(
                    "prepareVehicle: mount '{}' has no bore (solid tube cannot seat a motor)",
                    mount.id
                ));
            }
            if !(fm.diameter <= bore) {
                return Err(format!(
                    "prepareVehicle: motor diameter {} m exceeds mount '{}' bore {bore} m",
                    fm.diameter, mount.id
                ));
            }
            let overlap = fm.length.min(rec.length);
            if !(overlap >= 0.5 * fm.length) {
                return Err(format!(
                    "prepareVehicle: motor length {} m is not retained by mount '{}' (overlap {overlap} m < 50%)",
                    fm.length, mount.id
                ));
            }
            mount_end
        }
    };

    let powered = drag_table(&aero_v, true)?;
    let coasting = drag_table(&aero_v, false)?;

    // Parachutes in axial order: first = drogue, second-or-first = main
    // (mirrors TS `parachutes[0]` / `parachutes[len>1?1:0]`).
    let chutes: Vec<&FrontendComponent> = fv
        .components
        .iter()
        .filter(|c| c.kind == "parachute")
        .collect();
    let to_chute = |c: &FrontendComponent| {
        Some(astraea_core::six_dof::Parachute {
            diameter: c.diameter?,
            cd: c.cd?,
        })
    };
    let drogue = chutes.first().and_then(|c| to_chute(c));
    let main_chute = if chutes.len() > 1 {
        chutes.get(1).and_then(|c| to_chute(c))
    } else {
        drogue.clone()
    };

    Ok(astraea_core::six_dof::Vehicle {
        dry_mass: rollup.total_mass,
        cg_from_nose: rollup.cg,
        total_length: rollup.total_length,
        ref_diameter: rollup.reference_diameter,
        cna_body,
        cna_fins,
        body_first_moment: cp_body_moment,
        fin_first_moment: cp_fins_moment,
        body_abs_cna,
        fin_abs_cna,
        motor_aft_station_from_nose,
        drogue,
        main_chute,
        aero_powered_cd: powered,
        aero_coasting_cd: coasting,
        supersonic_normal: Some(astraea_core::six_dof::SupersonicNormal {
            fin_sets,
            body_positive_cna,
            body_positive_moment,
            body_positive_abs_cna,
            body_attached_cna: cna_body,
            body_attached_moment: cp_body_moment,
            body_attached_abs_cna: body_abs_cna,
            boattail_lift: astraea_core::six_dof::BoattailLift::Suppressed,
        }),
    })
}

fn is_fin_kind(kind: &str) -> bool {
    matches!(kind, "trapezoidfinset" | "ellipticalfinset" | "freeformfinset")
}

/// Published-law planform inputs for one fin component.
fn fin_normal_planform(c: &FrontendComponent) -> Result<(f64, f64), String> {
    match c.kind.as_str() {
        "trapezoidfinset" => Ok(astraea_core::aero::trapezoid_fin_normal_planform(
            req(c.root_chord, "rootChord", &c.id)?,
            req(c.tip_chord, "tipChord", &c.id)?,
            req(c.span, "span", &c.id)?,
            c.sweep_length.unwrap_or(0.0),
        )),
        "ellipticalfinset" => {
            let root = req(c.root_chord, "rootChord", &c.id)?;
            let span = req(c.span, "span", &c.id)?;
            let area = std::f64::consts::PI / 4.0 * root * span;
            if !(area > 0.0) {
                return Err(format!(
                    "prepareVehicle: elliptical fin '{}' has no planform area",
                    c.id
                ));
            }
            // An elliptical planform has no straight leading-edge sweep to
            // resolve; use the unswept normal Mach (cos = 1).
            Ok(((2.0 * span * span) / area, 1.0))
        }
        "freeformfinset" => {
            let points = fin_points(&c.points, &c.id)?;
            astraea_core::aero::freeform_fin_normal_planform(&points)
        }
        other => Err(format!(
            "prepareVehicle: fin normal planform for unsupported component kind '{other}'"
        )),
    }
}

/// No aerodynamic contribution (None/zero) has zero first moment. Every
/// nonzero signed contribution requires a finite station; never substitute CG.
fn add_normal_contribution(
    cna: Option<f64>, cp: Option<f64>, id: &str,
    sum: &mut f64, moment: &mut f64, abs_sum: &mut f64,
) -> Result<(), String> {
    let cna = match cna { None => return Ok(()), Some(v) => v };
    if !cna.is_finite() {
        return Err(format!("prepareVehicle: nonfinite normal slope for '{id}'"));
    }
    if cna == 0.0 { return Ok(()); }
    let cp = cp.filter(|v| v.is_finite())
        .ok_or_else(|| format!("prepareVehicle: nonzero normal slope requires finite CP for '{id}'"))?;
    *sum += cna;
    *moment += cna * cp;
    *abs_sum += cna.abs();
    if !sum.is_finite() || !moment.is_finite() || !abs_sum.is_finite() {
        return Err(format!("prepareVehicle: nonfinite normal force/moment sum at '{id}'"));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Coarse result DTOs (snake_case core -> camelCase wire, matching the TS
// result interfaces so ported studios keep their shapes)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vec3Dto {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Body rates in the simulator convention (rad/s): roll `p`, pitch `q`, yaw `r`.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyRatesDto {
    pub p: f64,
    pub q: f64,
    pub r: f64,
}

/// Canonical body-to-nav attitude (unit quaternion).
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuatDto {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// One display telemetry sample: camelCase mirror of `SixDofTelemetryPoint`
/// (`src/sim/sixDofSimulator.ts:41-65`) — same names, units and semantics.
/// Single-stage runs set no `stage`/`stageTime`/`motorTime`, so the wire
/// carries none of them.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryPointDto {
    pub time: f64,
    pub position: Vec3Dto,
    pub velocity: Vec3Dto,
    pub speed: f64,
    pub mach: f64,
    pub altitude: f64,
    pub acceleration: f64,
    pub angular_velocity: BodyRatesDto,
    pub angle_of_attack_deg: f64,
    pub q: QuatDto,
    pub pitch_deg: f64,
    pub roll_deg: f64,
    pub yaw_deg: f64,
    pub drag: f64,
    pub thrust: f64,
    pub mass: f64,
    pub dynamic_pressure: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightEventDto {
    pub time: f64,
    pub name: String,
    pub altitude: f64,
    pub velocity: f64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlightResultDto {
    #[serde(rename = "apogeeAltitude")]
    pub apogee_altitude: f64,
    #[serde(rename = "apogeeTime")]
    pub apogee_time: f64,
    #[serde(rename = "apogeePosition")]
    pub apogee_position: Vec3Dto,
    #[serde(rename = "maxVelocity")]
    pub max_velocity: f64,
    #[serde(rename = "maxMach")]
    pub max_mach: f64,
    #[serde(rename = "maxAccelerationG")]
    pub max_acceleration_g: f64,
    #[serde(rename = "burnoutAltitude")]
    pub burnout_altitude: f64,
    #[serde(rename = "burnoutVelocity")]
    pub burnout_velocity: f64,
    #[serde(rename = "burnoutTime")]
    pub burnout_time: f64,
    #[serde(rename = "railExitVelocity")]
    pub rail_exit_velocity: f64,
    #[serde(rename = "isRailExitSafe")]
    pub is_rail_exit_safe: bool,
    #[serde(rename = "weathercockAngleDeg")]
    pub weathercock_angle_deg: f64,
    #[serde(rename = "landingPosition")]
    pub landing_position: Vec3Dto,
    #[serde(rename = "landingDistance")]
    pub landing_distance: f64,
    #[serde(rename = "landingVelocity")]
    pub landing_velocity: f64,
    #[serde(rename = "landingKineticEnergy")]
    pub landing_kinetic_energy: f64,
    #[serde(rename = "isLandingSafe")]
    pub is_landing_safe: bool,
    #[serde(rename = "isLandingVelocitySafe")]
    pub is_landing_velocity_safe: bool,
    pub terminated: bool,
    #[serde(rename = "terminationReason")]
    pub termination_reason: String,
    #[serde(rename = "touchdownNominal")]
    pub touchdown_nominal: bool,
    #[serde(rename = "unsupportedHandling")]
    /// Classified-domain continuation only; undefined normal-station errors
    /// propagate as command errors before a result can be returned.
    pub unsupported_handling: String,
    #[serde(rename = "runManifest")]
    pub run_manifest: HashMap<String, serde_json::Value>,
    #[serde(rename = "landingMass")]
    pub landing_mass: f64,
    #[serde(rename = "flightDuration")]
    pub flight_duration: f64,
    pub validity: String,
    pub enveloped: bool,
    #[serde(rename = "offNominalExcursion")]
    pub off_nominal_excursion: bool,
    pub events: Vec<FlightEventDto>,
    /// ONE bounded display telemetry series (decimated); empty for every
    /// caller that did not ask the core to record (`to_flight_dto` leaves it
    /// empty — `simulate_flight` fills it via `flight_telemetry_dto`).
    pub telemetry: Vec<TelemetryPointDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub moment_arm_history: Option<crate::moment_arm_history::MomentArmHistoryDto>,
}

pub fn to_flight_dto(r: &astraea_core::six_dof::SimulationResult) -> FlightResultDto {
    let certified = r.validity == "PASS";
    let mut manifest = HashMap::new();
    manifest.insert(
        "frames".to_string(),
        serde_json::Value::String(
            "ENU x-East y-North z-Up; body origin at instantaneous combined CG; body +Y_B along vehicle axis"
                .to_string(),
        ),
    );
    manifest.insert(
        "ground".to_string(),
        serde_json::Value::String("flat z=0 AGL touchdown plane".to_string()),
    );
    manifest.insert(
        "atmosphere".to_string(),
        serde_json::Value::String(
            "ISA-1976 via getAtmosphereAt; power-law surface wind shear".to_string(),
        ),
    );
    manifest.insert(
        "depletion".to_string(),
        serde_json::Value::String(
            "impulse-proportional on thrust-curve integral (validateMotorSpec entry gate)".to_string(),
        ),
    );
    manifest.insert(
        "railContact".to_string(),
        serde_json::Value::String(
            "projected unilateral base contact with signed along-rail sliding; moments locked on rail"
                .to_string(),
        ),
    );
    manifest.insert(
        "recovery".to_string(),
        serde_json::Value::String(
            "canopy drag with declared empirical constant CD; zero airframe-CP static moment; inflation/shock absent"
                .to_string(),
        ),
    );
    // Semantic identity of the normal-force law. The historical assembly id
    // remains `flight-signed-normal-plus-wind-drag-v1`; these keys name the
    // law and the boattail policy that actually produced the run.
    manifest.insert(
        "normalLawId".to_string(),
        serde_json::Value::String(r.normal_law_id.to_string()),
    );
    manifest.insert(
        "boattailPolicy".to_string(),
        serde_json::Value::String(r.boattail_policy.to_string()),
    );
    manifest.insert(
        "finInterferenceId".to_string(),
        serde_json::Value::String(r.fin_interference_id.to_string()),
    );
    manifest.insert(
        "unsupportedHandling".to_string(),
        serde_json::Value::String(
            "continue-and-mark-UNKNOWN: classified out-of-domain loads continue with validity UNKNOWN and safety outputs closed; undefined normal-force CP (nonfinite, C < 1e-4, or C <= 64*epsilon*sumAbs) fails the command before arm use"
                .to_string(),
        ),
    );
    manifest.insert(
        "unsupportedScope".to_string(),
        serde_json::Value::Array(
            [
                "multi-stage separation and staging events",
                "rail tip-off dynamics and rail friction",
                "canopy inflation, attachment, and opening-shock loads",
                "non-flat terrain and terrain-relative deployment",
                "ensemble, uncertainty, and containment analysis",
                "sensor, interoperability, and competition-rule engines",
            ]
            .iter()
            .map(|s| serde_json::Value::String(s.to_string()))
            .collect(),
        ),
    );
    FlightResultDto {
        apogee_altitude: r.apogee_altitude,
        apogee_time: r.apogee_time,
        apogee_position: Vec3Dto {
            x: r.apogee_position.x,
            y: r.apogee_position.y,
            z: r.apogee_position.z,
        },
        max_velocity: r.max_velocity,
        max_mach: r.max_mach,
        max_acceleration_g: r.max_acceleration_g,
        burnout_altitude: r.burnout_altitude,
        burnout_velocity: r.burnout_velocity,
        burnout_time: r.burnout_time,
        rail_exit_velocity: r.rail_exit_velocity,
        is_rail_exit_safe: certified && r.rail_exit_velocity >= 15.0,
        weathercock_angle_deg: r.weathercock_angle_deg,
        landing_position: Vec3Dto {
            x: r.landing_position.x,
            y: r.landing_position.y,
            z: 0.0,
        },
        landing_distance: r.landing_distance,
        landing_velocity: r.landing_velocity,
        landing_kinetic_energy: r.landing_kinetic_energy,
        is_landing_safe: certified && r.terminated && r.landing_kinetic_energy <= 20.0,
        is_landing_velocity_safe: certified && r.terminated && r.landing_velocity <= 6.0,
        terminated: r.terminated,
        termination_reason: if r.terminated {
            "touchdown".to_string()
        } else {
            "timeout".to_string()
        },
        touchdown_nominal: if r.terminated {
            r.touchdown_nominal
        } else {
            false
        },
        unsupported_handling: "continue-and-mark-UNKNOWN".to_string(),
        run_manifest: manifest,
        landing_mass: r.landing_mass,
        flight_duration: r.flight_time,
        validity: r.validity.clone(),
        enveloped: r.enveloped,
        off_nominal_excursion: r.off_nominal_excursion,
        events: r
            .events
            .iter()
            .map(|e| FlightEventDto {
                time: e.time,
                name: e.name.clone(),
                altitude: e.altitude,
                velocity: e.velocity,
                description: e.description.clone(),
            })
            .collect(),
        telemetry: Vec::new(),
        moment_arm_history: None,
    }
}

/// Bounded display telemetry for the wire (IPC rule: one series, never
/// per-step streaming).
///
/// Decimates the FULL native series (`SimulationResult::telemetry`, recorded
/// only when the core options asked for it) to at most
/// `astraea_core::telemetry::MAX_TELEMETRY_POINTS` points, always keeping the
/// first, terminal and event-time samples, with strictly increasing times.
/// Fails closed — never truncates silently — on a non-finite value or an
/// unsatisfiable series.
pub fn flight_telemetry_dto(
    r: &astraea_core::six_dof::SimulationResult,
) -> Result<Vec<TelemetryPointDto>, String> {
    let event_times: Vec<f64> = r.events.iter().map(|e| e.time).collect();
    let bounded = astraea_core::telemetry::decimate_telemetry(
        &r.telemetry,
        &event_times,
        astraea_core::telemetry::MAX_TELEMETRY_POINTS,
    )?;
    let mut out = Vec::with_capacity(bounded.len());
    for p in bounded {
        let finite = p.time.is_finite()
            && p.position.x.is_finite()
            && p.position.y.is_finite()
            && p.position.z.is_finite()
            && p.velocity.x.is_finite()
            && p.velocity.y.is_finite()
            && p.velocity.z.is_finite()
            && p.speed.is_finite()
            && p.mach.is_finite()
            && p.altitude.is_finite()
            && p.acceleration.is_finite()
            && p.angular_velocity.p.is_finite()
            && p.angular_velocity.q.is_finite()
            && p.angular_velocity.r.is_finite()
            && p.angle_of_attack_deg.is_finite()
            && p.q.w.is_finite()
            && p.q.x.is_finite()
            && p.q.y.is_finite()
            && p.q.z.is_finite()
            && p.pitch_deg.is_finite()
            && p.roll_deg.is_finite()
            && p.yaw_deg.is_finite()
            && p.drag.is_finite()
            && p.thrust.is_finite()
            && p.mass.is_finite()
            && p.dynamic_pressure.is_finite();
        if !finite {
            return Err(format!(
                "simulate_flight: telemetry at t={} s is non-finite; refusing to emit a display series",
                p.time
            ));
        }
        out.push(TelemetryPointDto {
            time: p.time,
            position: Vec3Dto { x: p.position.x, y: p.position.y, z: p.position.z },
            velocity: Vec3Dto { x: p.velocity.x, y: p.velocity.y, z: p.velocity.z },
            speed: p.speed,
            mach: p.mach,
            altitude: p.altitude,
            acceleration: p.acceleration,
            angular_velocity: BodyRatesDto {
                p: p.angular_velocity.p,
                q: p.angular_velocity.q,
                r: p.angular_velocity.r,
            },
            angle_of_attack_deg: p.angle_of_attack_deg,
            q: QuatDto { w: p.q.w, x: p.q.x, y: p.q.y, z: p.q.z },
            pitch_deg: p.pitch_deg,
            roll_deg: p.roll_deg,
            yaw_deg: p.yaw_deg,
            drag: p.drag,
            thrust: p.thrust,
            mass: p.mass,
            dynamic_pressure: p.dynamic_pressure,
        });
    }
    Ok(out)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LandingPointDto {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DispersionResultDto {
    pub normal_law_id: String,
    pub boattail_policy: String,
    pub fin_interference_id: String,
    pub mean: LandingPointDto,
    pub covariance: CovarianceDto,
    pub sigma1: f64,
    pub sigma2: f64,
    #[serde(rename = "thetaDeg")]
    pub theta_deg: f64,
    #[serde(rename = "containmentRadii")]
    pub containment_radii: ContainmentDto,
    pub landings: Vec<LandingPointDto>,
    #[serde(rename = "successfulRuns")]
    pub successful_runs: i64,
    #[serde(rename = "failedRuns")]
    pub failed_runs: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CovarianceDto {
    pub xx: f64,
    pub xy: f64,
    pub yy: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainmentDto {
    pub r50: f64,
    pub r90: f64,
    pub r99: f64,
}

pub fn to_dispersion_dto(
    r: &astraea_core::monte_carlo::DispersionResult,
    normal_identity: (&str, &str),
) -> DispersionResultDto {
    DispersionResultDto {
        normal_law_id: normal_identity.0.to_string(),
        boattail_policy: normal_identity.1.to_string(),
        fin_interference_id: astraea_core::aero::FIN_INTERFERENCE_ID.to_string(),
        mean: LandingPointDto {
            x: r.mean.x,
            y: r.mean.y,
        },
        covariance: CovarianceDto {
            xx: r.covariance.xx,
            xy: r.covariance.xy,
            yy: r.covariance.yy,
        },
        sigma1: r.sigma1,
        sigma2: r.sigma2,
        theta_deg: r.theta_deg,
        containment_radii: ContainmentDto {
            r50: r.containment.r50,
            r90: r.containment.r90,
            r99: r.containment.r99,
        },
        landings: r
            .landings
            .iter()
            .map(|p| LandingPointDto { x: p.x, y: p.y })
            .collect(),
        successful_runs: r.successful_runs,
        failed_runs: r.failed_runs,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChamberDto {
    #[serde(rename = "Tc")]
    pub tc: f64,
    pub gamma: f64,
    pub mol_weight: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NozzleDto {
    #[serde(rename = "ispVac")]
    pub isp_vac: f64,
    #[serde(rename = "ispSea")]
    pub isp_sea: f64,
    pub cstar: f64,
    #[serde(rename = "cfVac")]
    pub cf_vac: f64,
    #[serde(rename = "cfSea")]
    pub cf_sea: f64,
    #[serde(rename = "exitMach")]
    pub exit_mach: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MassComponentDto {
    pub id: String,
    pub mass: f64,
    #[serde(rename = "localCG")]
    pub local_cg: f64,
    #[serde(rename = "globalCG")]
    pub global_cg: f64,
    #[serde(rename = "axialStart")]
    pub axial_start: f64,
    #[serde(rename = "axialEnd")]
    pub axial_end: f64,
    pub length: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MassRollupDto {
    pub total_mass: f64,
    pub cg: f64,
    pub total_length: f64,
    pub max_diameter: f64,
    pub reference_diameter: f64,
    pub components: Vec<MassComponentDto>,
}

pub fn to_mass_dto(r: &astraea_core::mass::VehicleMassRollup) -> MassRollupDto {
    MassRollupDto {
        total_mass: r.total_mass,
        cg: r.cg,
        total_length: r.total_length,
        max_diameter: r.max_diameter,
        reference_diameter: r.reference_diameter,
        components: r
            .components
            .iter()
            .map(|c| MassComponentDto {
                id: c.id.clone(),
                mass: c.mass,
                local_cg: c.local_cg,
                global_cg: c.global_cg,
                axial_start: c.axial_start,
                axial_end: c.axial_end,
                length: c.length,
            })
            .collect(),
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContributionDto {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub mass: f64,
    pub cg: f64,
    pub cp: Option<f64>,
    pub cna: Option<f64>,
    #[serde(rename = "axialStart")]
    pub axial_start: f64,
    #[serde(rename = "axialEnd")]
    pub axial_end: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StabilityDto {
    pub total_length: f64,
    pub max_diameter: f64,
    pub reference_diameter: f64,
    pub total_mass: f64,
    pub cg: f64,
    pub cp: f64,
    #[serde(rename = "staticMarginCalibers")]
    pub static_margin_calibers: f64,
    #[serde(rename = "totalCNa")]
    pub total_cna: f64,
    #[serde(rename = "isStable")]
    pub is_stable: bool,
    #[serde(rename = "isOverStable")]
    pub is_over_stable: bool,
    pub contributions: Vec<ContributionDto>,
    /// Present only when the built-up provider produced the totals.
    #[serde(rename = "modelId", skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(rename = "modelVersion", skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,
    /// True when the totals have no labelled component breakdown (provider
    /// path). Omitted on the legacy path so its bytes stay identical.
    #[serde(rename = "breakdownUnavailable", skip_serializing_if = "is_false")]
    pub breakdown_unavailable: bool,
}

pub fn to_stability_dto(r: &astraea_core::aero::StabilityAnalysis) -> StabilityDto {
    StabilityDto {
        total_length: r.total_length,
        max_diameter: r.max_diameter,
        reference_diameter: r.reference_diameter,
        total_mass: r.total_mass,
        cg: r.cg,
        cp: r.cp,
        static_margin_calibers: r.static_margin_calibers,
        total_cna: r.total_cna,
        is_stable: r.is_stable,
        is_over_stable: r.is_over_stable,
        contributions: r
            .contributions
            .iter()
            .map(|c| ContributionDto {
                id: c.id.clone(),
                name: c.name.clone(),
                kind: c.kind.clone(),
                mass: c.mass,
                cg: c.cg,
                cp: c.cp,
                cna: c.cna,
                axial_start: c.axial_start,
                axial_end: c.axial_end,
            })
            .collect(),
        model_id: None,
        model_version: None,
        breakdown_unavailable: false,
    }
}

/// Stability DTO for the built-up provider: totals, identity, and the explicit
/// "no labelled breakdown" marker; contributions stay empty.
pub fn to_provider_stability_dto(
    r: &astraea_core::aero::StabilityAnalysis,
    model_id: &str,
    model_version: &str,
) -> StabilityDto {
    StabilityDto {
        total_length: r.total_length,
        max_diameter: r.max_diameter,
        reference_diameter: r.reference_diameter,
        total_mass: r.total_mass,
        cg: r.cg,
        cp: r.cp,
        static_margin_calibers: r.static_margin_calibers,
        total_cna: r.total_cna,
        is_stable: r.is_stable,
        is_over_stable: r.is_over_stable,
        contributions: Vec::new(),
        model_id: Some(model_id.to_string()),
        model_version: Some(model_version.to_string()),
        breakdown_unavailable: true,
    }
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DragPointDto {
    pub mach: f64,
    #[serde(rename = "totalCd")]
    pub total_cd: f64,
    #[serde(rename = "frictionCd")]
    pub friction_cd: f64,
    #[serde(rename = "waveCd")]
    pub wave_cd: f64,
    #[serde(rename = "baseCd")]
    pub base_cd: f64,
    #[serde(rename = "protuberanceCd")]
    pub protuberance_cd: f64,
    pub cp: f64,
    #[serde(rename = "staticMarginCalibers")]
    pub static_margin_calibers: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AeroCurvesDto {
    #[serde(rename = "machPoints")]
    pub mach_points: Vec<f64>,
    #[serde(rename = "dragCurves")]
    pub drag_curves: Vec<DragPointDto>,
    #[serde(rename = "maxTransonicCd")]
    pub max_transonic_cd: f64,
    #[serde(rename = "machAtMaxCd")]
    pub mach_at_max_cd: f64,
    #[serde(rename = "subsonicCd")]
    pub subsonic_cd: f64,
    #[serde(rename = "supersonicCdMach2")]
    pub supersonic_cd_mach2: f64,
    #[serde(rename = "modelId", skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(rename = "modelVersion", skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,
    #[serde(rename = "breakdownUnavailable", skip_serializing_if = "is_false")]
    pub breakdown_unavailable: bool,
    /// Present only for the composed (hybrid) model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub composition: Option<CompositionDto>,
}

/// The hybrid's band and reference state, recorded with composed curves.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompositionDto {
    pub kind: &'static str,
    pub band_low_mach: f64,
    pub band_high_mach: f64,
    pub reference_atmosphere: &'static str,
}

pub fn to_curves_dto(r: &astraea_core::aero::AeroCurveResult) -> AeroCurvesDto {
    AeroCurvesDto {
        mach_points: r.mach_points.clone(),
        drag_curves: r
            .drag_curves
            .iter()
            .map(|d| DragPointDto {
                mach: d.mach,
                total_cd: d.total_cd,
                friction_cd: d.friction_cd,
                wave_cd: d.wave_cd,
                base_cd: d.base_cd,
                protuberance_cd: d.protuberance_cd,
                cp: d.cp,
                static_margin_calibers: d.static_margin_calibers,
            })
            .collect(),
        max_transonic_cd: r.max_transonic_cd,
        mach_at_max_cd: r.mach_at_max_cd,
        subsonic_cd: r.subsonic_cd,
        supersonic_cd_mach2: r.supersonic_cd_mach2,
        model_id: None,
        model_version: None,
        breakdown_unavailable: false,
        composition: None,
    }
}

/// Curves DTO for the built-up provider (method-only or hybrid).
pub fn to_provider_curves_dto(
    r: &astraea_core::aero::AeroCurveResult,
    breakdown_available: bool,
    model_id: &str,
    model_version: &str,
    composition: Option<&crate::aero_provider::CompositionMeta>,
) -> AeroCurvesDto {
    let mut dto = to_curves_dto(r);
    dto.model_id = Some(model_id.to_string());
    dto.model_version = Some(model_version.to_string());
    dto.breakdown_unavailable = !breakdown_available;
    dto.composition = composition.map(|meta| CompositionDto {
        kind: "total-cd-band",
        band_low_mach: meta.band_low_mach,
        band_high_mach: meta.band_high_mach,
        reference_atmosphere: meta.reference_atmosphere,
    });
    dto
}

#[cfg(test)]
mod dto_tests {
    use super::*;

    fn alpha_vehicle_json() -> serde_json::Value {
        serde_json::json!({
            "components": [
                {"id":"alpha-nc","name":"Ogive Nosecone","type":"nosecone","materialId":"pla_3dprint",
                 "shape":"ogive","length":0.165,"baseDiameter":0.0248,"wallThickness":0.0015,"isHollow":true},
                {"id":"alpha-bt","name":"Main Body Tube (BT-50)","type":"bodytube",
                 "length":0.311,"outerDiameter":0.0248,"innerDiameter":0.0241,
                 "isMotorMount":true,"materialId":"cardboard"},
                {"id":"alpha-fins","name":"Stabilizer Fins (3-Fin)","type":"trapezoidfinset",
                 "finCount":3.0,"rootChord":0.070,"tipChord":0.028,"span":0.051,
                 "sweepLength":0.038,"thickness":0.002,"crossSection":"rounded",
                 "axialOffset":0.241,"materialId":"pla_3dprint"},
                {"id":"alpha-chute","name":"12in Parachute","type":"parachute",
                 "mass":0.008,"diameter":0.305,"cd":0.8,"axialOffset":0.05,"materialId":"cardboard"}
            ]
        })
    }

    fn c6_motor() -> FrontendMotor {
        FrontendMotor {
            designation: Some("Estes C6".to_string()),
            diameter: 0.018,
            length: 0.070,
            burn_time: 1.86,
            propellant_mass: 0.0125,
            total_mass: 0.0248,
            dry_mass: 0.0123,
            max_thrust: Some(14.2),
            thrust_curve: vec![
                FrontendThrustPoint { time: 0.0, thrust: 0.0 },
                FrontendThrustPoint { time: 0.08, thrust: 4.5 },
                FrontendThrustPoint { time: 0.18, thrust: 14.2 },
                FrontendThrustPoint { time: 0.28, thrust: 8.5 },
                FrontendThrustPoint { time: 0.50, thrust: 4.8 },
                FrontendThrustPoint { time: 1.00, thrust: 4.4 },
                FrontendThrustPoint { time: 1.50, thrust: 4.2 },
                FrontendThrustPoint { time: 1.86, thrust: 0.0 },
            ],
        }
    }

    #[test]
    fn signed_normal_contribution_requires_finite_station_and_keeps_couples() {
        let (mut c, mut j, mut s) = (0.0, 0.0, 0.0);
        add_normal_contribution(Some(2.0), Some(1.0), "positive", &mut c, &mut j, &mut s).unwrap();
        add_normal_contribution(Some(-2.0), Some(2.0), "negative", &mut c, &mut j, &mut s).unwrap();
        assert_eq!((c,j,s),(0.0,-2.0,4.0));
        for cp in [None, Some(f64::NAN), Some(f64::INFINITY)] {
            assert!(add_normal_contribution(Some(-1.0), cp, "bad", &mut c, &mut j, &mut s).is_err());
        }
        assert!(add_normal_contribution(Some(f64::NAN), Some(1.0), "bad", &mut c, &mut j, &mut s).is_err());
        add_normal_contribution(Some(0.0), None, "zero", &mut c, &mut j, &mut s).unwrap();
        assert_eq!((c,j,s),(0.0,-2.0,4.0));
    }

    #[test]
    fn actual_native_preparation_and_loads_match_signed_stability_at_low_mach() {
        use astraea_core::six_dof::{self, Quat, RigidState, Vec3};
        for aft in [0.023, 0.027] { // contraction and expansion controls
            let mut value = alpha_vehicle_json();
            let components = value["components"].as_array_mut().unwrap();
            components[1]["outerDiameter"] = serde_json::json!(aft);
            components[1]["innerDiameter"] = serde_json::json!(aft-0.0007);
            components.insert(1,serde_json::json!({"id":"signed-transition","name":"Signed transition","type":"transition",
                "length":0.08,"foreDiameter":0.0248,"aftDiameter":aft,"wallThickness":0.001,
                "isHollow":true,"materialId":"pla_3dprint"}));
            let fv: FrontendVehicle = serde_json::from_value(value).unwrap();
            let stab = astraea_core::aero::stability(&to_aero_vehicle(&fv).unwrap()).unwrap();
            let vehicle = prepare_flight_vehicle(&fv,&c6_motor()).unwrap();
            assert!((vehicle.cna_body+vehicle.cna_fins-stab.total_cna).abs()<1e-12);
            assert!((vehicle.body_first_moment+vehicle.fin_first_moment-stab.total_cna*stab.cp).abs()<1e-12);
            for direction in [-1.0,1.0] {
                for pitch in [true,false] {
                    let st = RigidState {r:Vec3::zero(),v:Vec3{x:if pitch{0.0}else{direction*10.0},y:100.0,z:if pitch{direction*10.0}else{0.0}},
                        q:Quat{w:1.0,x:0.0,y:0.0,z:0.0},w:Vec3::zero()};
                    let d = six_dof::diagnose_flight_loads(3.0,&st,false,false,false,0.0,0.0,0.0,0.0,&vehicle,&to_motor(&c6_motor()).unwrap(),1.0).unwrap();
                    assert!((d.cp-stab.cp).abs()<1e-12);
                    assert!((d.cna-stab.total_cna).abs()<1e-12);
                    let alpha = (10.0f64/100.0).atan();
                    let expected_f = -direction*(d.q_inf*d.ref_area*stab.total_cna+d.drag_wind_axis)*alpha.sin();
                    let force = if pitch{d.aero_force_body.z}else{d.aero_force_body.x};
                    assert!((force-expected_f).abs()<1e-10);
                    let expected_m = (d.cp-d.combined_cg)*expected_f*if pitch{-1.0}else{1.0};
                    let moment = if pitch{d.total_moment_body.x}else{d.total_moment_body.z};
                    assert!((moment-expected_m).abs()<1e-10);
                }
            }
        }
    }

    #[test]
    fn alpha_mass_oracle() {
        let fv: FrontendVehicle = serde_json::from_value(alpha_vehicle_json()).unwrap();
        let mv = to_mass_vehicle(&fv).unwrap();
        let rollup = astraea_core::mass::aggregate_mass(&mv).unwrap();
        let rel = ((rollup.total_mass - 0.04573508529158387) / 0.04573508529158387).abs();
        assert!(rel < 1e-9, "dry mass rel err {rel}");
        assert!((rollup.cg - 0.2871437204338452).abs() / 0.2871437204338452 < 1e-9);
    }

    #[test]
    fn alpha_prepare_flight_oracle() {
        let fv: FrontendVehicle = serde_json::from_value(alpha_vehicle_json()).unwrap();
        let v = prepare_flight_vehicle(&fv, &c6_motor()).unwrap();
        assert!((v.dry_mass - 0.04573508529158387).abs() / 0.04573508529158387 < 1e-9);
        assert!((v.cg_from_nose - 0.2871437204338452).abs() / 0.2871437204338452 < 1e-9);
        assert!((v.total_length - 0.476).abs() < 1e-12);
        assert!((v.ref_diameter - 0.0248).abs() < 1e-12);
        assert!((v.motor_aft_station_from_nose - 0.476).abs() < 1e-12);
        assert_eq!(v.aero_powered_cd.len(), 25);
        assert_eq!(v.aero_coasting_cd.len(), 25);
    }

    #[test]
    fn alpha_stability_oracle_via_dto() {
        let fv: FrontendVehicle = serde_json::from_value(alpha_vehicle_json()).unwrap();
        let av = to_aero_vehicle(&fv).unwrap();
        let s = astraea_core::aero::stability(&av).unwrap();
        assert!(s.static_margin_calibers >= 1.0, "alpha must be stable");
        assert!(s.total_cna > 20.0, "slender-body CNa {}", s.total_cna);
    }

    fn flight_opts_90() -> astraea_core::six_dof::SixDofOptions {
        astraea_core::six_dof::SixDofOptions {
            rail_length: Some(1.0),
            rail_elevation_deg: Some(90.0),
            rail_azimuth_deg: Some(0.0),
            launch_altitude_asl: None,
            wind_speed_surface: Some(0.0),
            wind_azimuth_deg: Some(90.0),
            main_deploy_altitude_agl: Some(250.0),
            time_step: None,
            fin_cant_angle_deg: None,
            drag_cd_scale: None,
            record_telemetry: false,
            record_moment_arm_history: false,
        }
    }

    /// IPC-boundary parity: the full DTO path (JSON wire -> prepare pipeline
    /// -> kernel -> camelCase DTO -> JSON wire) reproduces the TS oracle for
    /// this vehicle and motor. Fails here mean the IPC layer drifted; per the
    /// lane rule, fix Rust, never src/.
    ///
    /// Oracle re-derived 2026-10-16 from TS `simulate6DofFlight` on this exact
    /// vehicle/motor after the body-friction correction (0bb8cbc, applied to
    /// both `transonicAero.ts` and `aero.rs`): apogee 328.8253523345511 ->
    /// 320.5894538955301 m, flight 89.698 -> 90.863 s. Re-derived 2026-10-21
    /// after adding published fin leading-edge pressure and trailing-edge base
    /// drag (`compute_fin_edge_drag` / `computeFinEdgeDrag`): 320.5894538955301 m,
    /// flight 87.561 s. Native matched TS bit-for-bit each time. The core `zero_wind_landing_parity`
    /// fixture keeps its frozen pre-correction drag tables (kernel parity on
    /// fixed inputs); this test is the live-aero oracle.
    #[test]
    fn ipc_flight_matches_zero_wind_alpha_c6_oracle() {
        let fv: FrontendVehicle = serde_json::from_value(alpha_vehicle_json()).unwrap();
        let v = prepare_flight_vehicle(&fv, &c6_motor()).unwrap();
        let m = to_motor(&c6_motor()).unwrap();
        let r = astraea_core::six_dof::simulate_flight(&v, &m, &flight_opts_90()).unwrap();
        let dto = to_flight_dto(&r);
        let wire = serde_json::to_value(&dto).unwrap();
        let rel = ((dto.apogee_altitude - 320.5894538955301) / 320.5894538955301).abs();
        assert!(
            rel <= 0.005,
            "apogee rel err {rel} exceeds 0.5% (got {} m, expected 320.5894538955301 m)",
            dto.apogee_altitude
        );
        assert!(rel < 1e-6, "apogee drifted from oracle: rel err {rel}");
        assert!(dto.landing_distance <= 5.0, "drift {} > 5 m", dto.landing_distance);
        assert!((dto.flight_duration - 87.5610156250079).abs() < 0.05, "flight time {}", dto.flight_duration);
        assert!((dto.landing_velocity - 3.9873074781541566).abs() < 0.05, "landing vel {}", dto.landing_velocity);
        // Wire shape is camelCase and carries the TS result contract keys.
        assert!(wire.get("apogeeAltitude").is_some());
        assert_eq!(wire.get("flightDuration").unwrap().as_f64().unwrap(), dto.flight_duration);
        assert_eq!(wire.get("landingVelocity").unwrap().as_f64().unwrap(), dto.landing_velocity);
        assert_eq!(wire.get("terminationReason").unwrap().as_str().unwrap(), "touchdown");
    }

    #[test]
    fn ipc_ensemble_matches_oracle_accounting() {
        use astraea_core::monte_carlo::{
            parse_sampling_version, run_ensemble, PerturbedParams, PerturbationSigmas,
        };
        let fv: FrontendVehicle = serde_json::from_value(alpha_vehicle_json()).unwrap();
        let flight_vehicle = prepare_flight_vehicle(&fv, &c6_motor()).unwrap();
        let base_options = flight_opts_90();
        let base_motor = c6_motor();
        let fly = |p: &PerturbedParams| -> Result<astraea_core::monte_carlo::LandingPoint, String> {
            let mut o = base_options.clone();
            o.wind_azimuth_deg = p.wind_azimuth_deg;
            o.rail_elevation_deg = p.rail_elevation_deg;
            let mut motor = to_motor(&base_motor).unwrap();
            for tp in &mut motor.thrust_curve {
                tp.thrust *= p.impulse_scale;
            }
            motor.max_thrust *= p.impulse_scale;
            let r = astraea_core::six_dof::simulate_flight(&flight_vehicle, &motor, &o)?;
            Ok(astraea_core::monte_carlo::LandingPoint { x: r.landing_position.x, y: r.landing_position.y })
        };
        let sigmas = PerturbationSigmas {
            wind_azimuth_deg_sigma: 5.0,
            rail_angle_deg_sigma: 1.0,
            impulse_pct_sigma: 2.0,
        };
        let base = PerturbedParams { wind_azimuth_deg: None, rail_elevation_deg: None, impulse_scale: 1.0 };
        let version = parse_sampling_version("per-run-v2").unwrap();
        let result = run_ensemble(&base, &sigmas, 8, 7, version, &fly).unwrap();
        let dto = to_dispersion_dto(&result, flight_vehicle.normal_law_identity());
        assert_eq!(dto.successful_runs + dto.failed_runs, 8);
        assert!(dto.sigma1 >= 0.0 && dto.sigma2 >= 0.0);
        let wire = serde_json::to_value(&dto).unwrap();
        assert!(wire.get("successfulRuns").is_some());
        assert!(wire.get("containmentRadii").is_some());
        assert!(wire.get("thetaDeg").is_some());
    }

    #[test]
    fn ipc_chamber_matches_apcp_oracle() {
        let eq = astraea_core::gibbs::solve_chamber(10_000_000.0).unwrap();
        let dto = ChamberDto { tc: eq.tc, gamma: eq.gamma, mol_weight: eq.mol_weight };
        let rel_tc = ((dto.tc - 3522.814668872915) / 3522.814668872915).abs();
        let rel_g = ((dto.gamma - 1.1817718046095134) / 1.1817718046095134).abs();
        let rel_mw = ((dto.mol_weight - 24.60469503516949) / 24.60469503516949).abs();
        assert!(rel_tc <= 5e-3, "Tc rel err {rel_tc}");
        assert!(rel_g <= 5e-3, "gamma rel err {rel_g}");
        assert!(rel_mw <= 5e-3, "MW rel err {rel_mw}");
        let wire = serde_json::to_value(&dto).unwrap();
        assert!(wire.get("Tc").is_some(), "chamber wire keeps Tc key");
        assert!(wire.get("molWeight").is_some(), "chamber wire keeps molWeight key");
    }

    #[test]
    fn unknown_type_fails_closed() {
        let fv = FrontendVehicle {
            components: vec![FrontendComponent {
                id: "x".to_string(),
                name: "Warp".to_string(),
                kind: "warpdrive".to_string(),
                material_id: Some("cardboard".to_string()),
                shape: None,
                length: None,
                base_diameter: None,
                wall_thickness: None,
                is_hollow: None,
                outer_diameter: None,
                inner_diameter: None,
                is_motor_mount: None,
                fore_diameter: None,
                aft_diameter: None,
                fin_count: None,
                root_chord: None,
                tip_chord: None,
                span: None,
                sweep_length: None,
                points: None,
                thickness: None,
                cross_section: None,
                axial_offset: None,
                mass: None,
                diameter: None,
                cd: None,
                mass_override: None,
                cg_override: None,
                rail_guide_diameter: None,
                rail_guide_height: None,
                launch_lug_diameter: None,
                launch_shoe_area: None,
                airfoil_section: None,
                leading_edge_bevel: None,
                trailing_edge_bevel: None,
                leading_edge_radius: None,
            }],
            surface_finish: None,
            force_turbulent_flow: None,
            nozzle_exit_diameter: None,
        };
        let mv = to_mass_vehicle(&fv).unwrap();
        let err = astraea_core::mass::aggregate_mass(&mv).unwrap_err();
        assert!(err.contains("unknown component type"), "unexpected: {err}");
    }

    #[test]
    fn design_inputs_survive_the_wire_and_reach_the_aero_vehicle() {
        let fv: FrontendVehicle = serde_json::from_value(serde_json::json!({
            "surfaceFinish": "Polished",
            "forceTurbulentFlow": true,
            "nozzleExitDiameter": 0.02,
            "components": [
                {"id": "bt", "name": "Body", "type": "bodytube", "length": 0.6,
                 "outerDiameter": 0.0762, "railGuideDiameter": 0.004, "railGuideHeight": 0.006,
                 "launchLugDiameter": 0.005, "launchShoeArea": 0.001},
                {"id": "fins", "name": "Fins", "type": "trapezoidfinset", "finCount": 4,
                 "rootChord": 0.12, "tipChord": 0.05, "span": 0.1, "sweepLength": 0.08,
                 "thickness": 0.006, "crossSection": "airfoil", "airfoilSection": "Double Wedge",
                 "leadingEdgeBevel": 0.002, "trailingEdgeBevel": 0.003, "leadingEdgeRadius": 0.0015}
            ]
        }))
        .expect("vehicle");
        let aero = to_aero_vehicle(&fv).expect("aero vehicle");
        let inputs = aero.design_inputs.as_ref().expect("design inputs");
        assert_eq!(inputs.surface_finish.as_deref(), Some("Polished"));
        assert_eq!(inputs.force_turbulent_flow, Some(true));
        assert_eq!(inputs.nozzle_exit_diameter, Some(0.02));
        assert_eq!(inputs.components.len(), 2);
        let body = inputs.components.get("bt").expect("body inputs");
        assert_eq!(body.rail_guide_diameter, Some(0.004));
        assert_eq!(body.rail_guide_height, Some(0.006));
        assert_eq!(body.launch_lug_diameter, Some(0.005));
        assert_eq!(body.launch_shoe_area, Some(0.001));
        assert!(body.airfoil_section.is_none());
        let fins = inputs.components.get("fins").expect("fin inputs");
        assert_eq!(fins.airfoil_section.as_deref(), Some("Double Wedge"));
        assert_eq!(fins.leading_edge_bevel, Some(0.002));
        assert_eq!(fins.trailing_edge_bevel, Some(0.003));
        assert_eq!(fins.leading_edge_radius, Some(0.0015));
        assert!(fins.rail_guide_diameter.is_none());

        // A component input alone still creates the design-input carrier; the
        // absent vehicle-level fields stay None so the adapter keeps defaults.
        let component_only: FrontendVehicle = serde_json::from_value(serde_json::json!({
            "components": [{"id": "bt", "name": "Body", "type": "bodytube", "length": 0.6,
                            "outerDiameter": 0.0762, "railGuideDiameter": 0.004}]
        }))
        .expect("component-only vehicle");
        let aero = to_aero_vehicle(&component_only).expect("aero vehicle");
        let inputs = aero.design_inputs.as_ref().expect("component input");
        assert_eq!(inputs.surface_finish, None);
        assert_eq!(inputs.force_turbulent_flow, None);
        assert_eq!(inputs.nozzle_exit_diameter, None);
        assert_eq!(inputs.components.len(), 1);
        assert_eq!(inputs.components["bt"].rail_guide_diameter, Some(0.004));
    }

    #[test]
    fn absent_design_inputs_stay_absent_on_read_and_write() {
        let fv: FrontendVehicle = serde_json::from_value(serde_json::json!({
            "components": [{"id": "bt", "name": "Body", "type": "bodytube",
                            "length": 0.6, "outerDiameter": 0.0762}]
        }))
        .expect("vehicle");
        assert!(to_aero_vehicle(&fv).unwrap().design_inputs.is_none());
        // Absent optional fields must not appear on the wire: the candidate
        // identity preimage serializes this DTO exactly as before the fields.
        let wire = serde_json::to_value(&fv).unwrap();
        assert!(wire.get("surfaceFinish").is_none());
        assert!(wire.get("forceTurbulentFlow").is_none());
        assert!(wire.get("nozzleExitDiameter").is_none());
        let component = &wire["components"][0];
        for key in [
            "railGuideDiameter",
            "railGuideHeight",
            "launchLugDiameter",
            "launchShoeArea",
            "airfoilSection",
            "leadingEdgeBevel",
            "trailingEdgeBevel",
            "leadingEdgeRadius",
        ] {
            assert!(component.get(key).is_none(), "{key} must stay off the wire");
        }
    }

    #[test]
    fn flight_output_carries_the_normal_law_identity() {
        let fv: FrontendVehicle = serde_json::from_value(alpha_vehicle_json()).unwrap();
        let vehicle = prepare_flight_vehicle(&fv, &c6_motor()).unwrap();
        assert_eq!(
            vehicle.normal_law_identity(),
            ("published-supersonic-normal-v1", "suppressed")
        );
        let motor = to_motor(&c6_motor()).unwrap();
        let result = astraea_core::six_dof::simulate_flight(&vehicle, &motor, &flight_opts_90()).unwrap();
        let dto = to_flight_dto(&result);
        assert_eq!(
            dto.run_manifest.get("normalLawId").and_then(|v| v.as_str()),
            Some("published-supersonic-normal-v1")
        );
        assert_eq!(
            dto.run_manifest.get("boattailPolicy").and_then(|v| v.as_str()),
            Some("suppressed")
        );
        assert_eq!(
            dto.run_manifest.get("finInterferenceId").and_then(|v| v.as_str()),
            Some("fin-station-v2")
        );
        // The historical assembly id is unchanged in the diagnostic/history.
        assert_eq!(result.normal_law_id, "published-supersonic-normal-v1");
        assert_eq!(result.boattail_policy, "suppressed");
        assert_eq!(result.fin_interference_id, "fin-station-v2");

        let mut legacy = vehicle.clone();
        legacy.supersonic_normal = None;
        assert_eq!(
            legacy.normal_law_identity(),
            ("legacy-finsonly-degrade-v1", "not-applicable")
        );
        let mut attached = vehicle.clone();
        if let Some(p) = attached.supersonic_normal.as_mut() {
            p.boattail_lift = astraea_core::six_dof::BoattailLift::Attached;
        }
        assert_eq!(
            attached.normal_law_identity(),
            ("published-supersonic-normal-v1", "attached")
        );
    }

}
