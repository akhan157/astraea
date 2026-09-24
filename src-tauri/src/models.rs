//! Astraea Tauri shell: IPC DTOs + the frontend-to-core vehicle prepare
//! pipeline. The TS `src/` tree is the read-only oracle; this shell is the
//! ONLY runtime path (replacement build, no TS fallback).
//!
//! IPC rule: six coarse-grained commands only (`run_ensemble`,
//! `simulate_flight`, `solve_chamber`, `stability`, `aero_curves`,
//! `aggregate_mass`) — never per-step serialization. Telemetry stays
//! in-Rust; only coarse metrics cross the bridge.
//!
//! The six_dof kernel takes a PRECOMPUTED vehicle (dry mass, CG station,
//! Barrowman normal-slope split, 25-pt drag tables). The prepare pipeline
//! below assembles that from the frontend's axial component list via the
//! real engines (mass rollup → Barrowman split → transonic curves), exactly
//! mirroring `prepareVehicle` in `src/dynamics/loads.ts`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Frontend vehicle DTOs (camelCase wire format, matching the TS component
// interfaces in src/core/types.ts)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
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
    pub thickness: Option<f64>,
    pub cross_section: Option<String>,
    pub axial_offset: Option<f64>,
    pub mass: Option<f64>,
    pub diameter: Option<f64>,
    pub cd: Option<f64>,
    pub mass_override: Option<f64>,
    pub cg_override: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendVehicle {
    pub components: Vec<FrontendComponent>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendThrustPoint {
    pub time: f64,
    pub thrust: f64,
}

#[derive(Debug, Clone, Deserialize)]
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
#[serde(rename_all = "camelCase")]
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

pub fn to_aero_vehicle(fv: &FrontendVehicle) -> Result<astraea_core::aero::Vehicle, String> {
    use astraea_core::aero::{Component as C, VehicleComponent as VC};
    let mut components = Vec::with_capacity(fv.components.len());
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
            name: c.name.clone(),
            material_id,
            component: comp,
        });
    }
    Ok(astraea_core::aero::Vehicle { components })
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

    // Fin/body normal-slope split (mirrors loads.ts prepareVehicle §5.2).
    let mut cna_fins = 0.0;
    let mut cp_fins_moment = 0.0;
    let mut cna_body = 0.0;
    let mut cp_body_moment = 0.0;
    for s in &stab.contributions {
        let cna = s.cna.unwrap_or(0.0);
        if !(cna > 0.0) || !cna.is_finite() {
            continue;
        }
        let cp = s.cp.unwrap_or(rollup.cg);
        if s.kind == "trapezoidfinset" || s.kind == "ellipticalfinset" {
            cna_fins += cna;
            cp_fins_moment += cna * cp;
        } else {
            cna_body += cna;
            cp_body_moment += cna * cp;
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
        cp_body: if cna_body > 0.0 {
            cp_body_moment / cna_body
        } else {
            rollup.cg
        },
        cp_fins: if cna_fins > 0.0 {
            cp_fins_moment / cna_fins
        } else {
            rollup.cg
        },
        motor_aft_station_from_nose,
        drogue,
        main_chute,
        aero_powered_cd: powered,
        aero_coasting_cd: coasting,
    })
}

// ---------------------------------------------------------------------------
// Coarse result DTOs (snake_case core -> camelCase wire, matching the TS
// result interfaces so ported studios keep their shapes)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vec3Dto {
    pub x: f64,
    pub y: f64,
    pub z: f64,
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
    manifest.insert(
        "unsupportedHandling".to_string(),
        serde_json::Value::String(
            "continue-and-mark-UNKNOWN: out-of-domain segments continue; validity UNKNOWN; all safety outputs closed"
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
    }
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

pub fn to_dispersion_dto(r: &astraea_core::monte_carlo::DispersionResult) -> DispersionResultDto {
    DispersionResultDto {
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
    }
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
    }
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
                thickness: None,
                cross_section: None,
                axial_offset: None,
                mass: None,
                diameter: None,
                cd: None,
                mass_override: None,
                cg_override: None,
            }],
        };
        let mv = to_mass_vehicle(&fv).unwrap();
        let err = astraea_core::mass::aggregate_mass(&mv).unwrap_err();
        assert!(err.contains("unknown component type"), "unexpected: {err}");
    }
}
