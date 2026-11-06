//! arcas_aero — ARCAS production aero smoke-test CLI.
//!
//! Reads a vehicle description from a JSON file (first argument) or stdin,
//! calls the same `stability` and `aero_curves` entry-points that Tauri
//! invokes, and emits machine-readable JSON to stdout.
//!
//! ```
//!   cargo run --manifest-path crates/astraea-core/Cargo.toml --example arcas_aero -- fixture.json
//!   cargo run --manifest-path crates/astraea-core/Cargo.toml --example arcas_aero < fixture.json
//! ```
//!
//! See `docs/internal/arcas-rust-smoke.md` for the input schema and runtime smoke command.

use std::io::Read;

use astraea_core::aero::{
    aero_curves, compute_aerodynamic_curves_at_reynolds, stability, AeroCurveResult, Component,
    FinCrossSection, NoseShape, Vehicle, VehicleComponent,
};
use serde::Deserialize;
use serde_json::{json, Value};

// ---------------------------------------------------------------------------
// JSON input schema — mirrors the TS RocketVehicle camelCase conventions.
// All field names match the TS component interfaces in src/core/types.ts.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputVehicle {
    components: Vec<InputComponent>,
    reynolds_per_meter: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InputComponent {
    id: String,
    name: String,
    material_id: String,
    #[serde(rename = "type")]
    kind: String,
    // nosecone
    shape: Option<String>,
    is_hollow: Option<bool>,
    wall_thickness: Option<f64>,
    // bodytube / nosecone
    length: Option<f64>,
    base_diameter: Option<f64>,
    outer_diameter: Option<f64>,
    inner_diameter: Option<f64>,
    // transition
    fore_diameter: Option<f64>,
    aft_diameter: Option<f64>,
    // fin sets
    fin_count: Option<i32>,
    root_chord: Option<f64>,
    tip_chord: Option<f64>,
    span: Option<f64>,
    sweep_length: Option<f64>,
    thickness: Option<f64>,
    cross_section: Option<String>,
    axial_offset: Option<f64>,
    // mass component / parachute
    mass: Option<f64>,
    diameter: Option<f64>,
    cd: Option<f64>,
    // overrides
    mass_override: Option<f64>,
    cg_override: Option<f64>,
}

fn parse_nose_shape(s: &str) -> Result<NoseShape, String> {
    match s {
        "conical" => Ok(NoseShape::Conical),
        "ogive" => Ok(NoseShape::Ogive),
        "parabolic" => Ok(NoseShape::Parabolic),
        "vonkarman" | "von_karman" | "vonKarman" => Ok(NoseShape::VonKarman),
        "elliptical" => Ok(NoseShape::Elliptical),
        other => Err(format!(
            "unknown shape '{other}' (expected: conical, ogive, parabolic, vonkarman, elliptical)"
        )),
    }
}

fn parse_cross_section(s: &str) -> FinCrossSection {
    match s {
        "doublewedge" | "double_wedge" | "doubleWedge" => FinCrossSection::DoubleWedge,
        "airfoil" => FinCrossSection::Airfoil,
        "square" => FinCrossSection::Square,
        _ => FinCrossSection::Rounded,
    }
}

fn convert_component(ic: InputComponent) -> Result<VehicleComponent, String> {
    let id = &ic.id;
    let component = match ic.kind.as_str() {
        "nosecone" => Component::Nosecone {
            shape: parse_nose_shape(ic.shape.as_deref().unwrap_or("ogive"))?,
            length: ic.length.ok_or_else(|| format!("'{id}': nosecone missing length"))?,
            base_diameter: ic
                .base_diameter
                .ok_or_else(|| format!("'{id}': nosecone missing baseDiameter"))?,
            wall_thickness: ic.wall_thickness.unwrap_or(0.002),
            is_hollow: ic.is_hollow.unwrap_or(false),
            mass_override: ic.mass_override,
            cg_override: ic.cg_override,
        },
        "bodytube" => Component::BodyTube {
            length: ic.length.ok_or_else(|| format!("'{id}': bodytube missing length"))?,
            outer_diameter: ic
                .outer_diameter
                .ok_or_else(|| format!("'{id}': bodytube missing outerDiameter"))?,
            inner_diameter: ic.inner_diameter,
            mass_override: ic.mass_override,
            cg_override: ic.cg_override,
        },
        "transition" => Component::Transition {
            length: ic.length.ok_or_else(|| format!("'{id}': transition missing length"))?,
            fore_diameter: ic
                .fore_diameter
                .ok_or_else(|| format!("'{id}': transition missing foreDiameter"))?,
            aft_diameter: ic
                .aft_diameter
                .ok_or_else(|| format!("'{id}': transition missing aftDiameter"))?,
            wall_thickness: ic.wall_thickness.unwrap_or(0.002),
            is_hollow: ic.is_hollow.unwrap_or(false),
            mass_override: ic.mass_override,
            cg_override: ic.cg_override,
        },
        "trapezoidfinset" => Component::TrapezoidFin {
            fin_count: ic
                .fin_count
                .ok_or_else(|| format!("'{id}': trapezoidfinset missing finCount"))?,
            root_chord: ic
                .root_chord
                .ok_or_else(|| format!("'{id}': trapezoidfinset missing rootChord"))?,
            tip_chord: ic.tip_chord.unwrap_or(0.0),
            span: ic
                .span
                .ok_or_else(|| format!("'{id}': trapezoidfinset missing span"))?,
            sweep_length: ic.sweep_length.unwrap_or(0.0),
            thickness: ic
                .thickness
                .ok_or_else(|| format!("'{id}': trapezoidfinset missing thickness"))?,
            cross_section: parse_cross_section(
                ic.cross_section.as_deref().unwrap_or("rounded"),
            ),
            axial_offset: ic.axial_offset,
            mass_override: ic.mass_override,
            cg_override: ic.cg_override,
        },
        "ellipticalfinset" => Component::EllipticalFin {
            fin_count: ic
                .fin_count
                .ok_or_else(|| format!("'{id}': ellipticalfinset missing finCount"))?,
            root_chord: ic
                .root_chord
                .ok_or_else(|| format!("'{id}': ellipticalfinset missing rootChord"))?,
            span: ic
                .span
                .ok_or_else(|| format!("'{id}': ellipticalfinset missing span"))?,
            thickness: ic
                .thickness
                .ok_or_else(|| format!("'{id}': ellipticalfinset missing thickness"))?,
            axial_offset: ic.axial_offset,
            mass_override: ic.mass_override,
            cg_override: ic.cg_override,
        },
        "masscomponent" => Component::MassComp {
            mass: ic.mass.ok_or_else(|| format!("'{id}': masscomponent missing mass"))?,
            length: ic.length,
            axial_offset: ic.axial_offset,
        },
        "parachute" => Component::Parachute {
            mass: ic.mass.ok_or_else(|| format!("'{id}': parachute missing mass"))?,
            diameter: ic
                .diameter
                .ok_or_else(|| format!("'{id}': parachute missing diameter"))?,
            cd: ic.cd.ok_or_else(|| format!("'{id}': parachute missing cd"))?,
            axial_offset: ic.axial_offset,
        },
        other => Component::Unknown {
            kind: other.to_string(),
        },
    };
    Ok(VehicleComponent {
        id: ic.id,
        name: ic.name,
        material_id: ic.material_id,
        component,
    })
}

fn format_curves(curves: &AeroCurveResult) -> Value {
    let pts: Vec<Value> = curves
        .drag_curves
        .iter()
        .map(|d| {
            json!({
                "mach": d.mach,
                "total_cd": d.total_cd,
                "friction_cd": d.friction_cd,
                "wave_cd": d.wave_cd,
                "base_cd": d.base_cd,
                "protuberance_cd": d.protuberance_cd,
                "cp_m": d.cp,
                "static_margin_calibers": d.static_margin_calibers,
            })
        })
        .collect();
    json!({
        "subsonic_cd": curves.subsonic_cd,
        "supersonic_cd_mach2": curves.supersonic_cd_mach2,
        "max_transonic_cd": curves.max_transonic_cd,
        "mach_at_max_cd": curves.mach_at_max_cd,
        "drag_curves": pts,
    })
}

fn run(json_text: &str) -> Result<(), String> {

    let InputVehicle {
        components,
        reynolds_per_meter,
    } = serde_json::from_str(json_text).map_err(|e| format!("JSON parse error: {e}"))?;

    let vehicle = Vehicle {
        components: components
            .into_iter()
            .map(convert_component)
            .collect::<Result<Vec<_>, _>>()?,
        design_inputs: None,
    };

    let stab = stability(&vehicle)?;
    let (curves_off, curves_on) = if let Some(reynolds_per_meter) = reynolds_per_meter {
        (
            compute_aerodynamic_curves_at_reynolds(&vehicle, false, 41, reynolds_per_meter)?,
            compute_aerodynamic_curves_at_reynolds(&vehicle, true, 41, reynolds_per_meter)?,
        )
    } else {
        (aero_curves(&vehicle, false)?, aero_curves(&vehicle, true)?)
    };

    let contributions: Vec<Value> = stab
        .contributions
        .iter()
        .map(|c| {
            json!({
                "id": c.id,
                "name": c.name,
                "kind": c.kind,
                "mass_kg": c.mass,
                "cg_m": c.cg,
                "cp_m": c.cp,
                "cna": c.cna,
                "axial_start_m": c.axial_start,
                "axial_end_m": c.axial_end,
            })
        })
        .collect();

    let output = json!({
        "stability": {
            "total_length_m": stab.total_length,
            "max_diameter_m": stab.max_diameter,
            "reference_diameter_m": stab.reference_diameter,
            "total_mass_kg": stab.total_mass,
            "cg_m": stab.cg,
            "cp_m": stab.cp,
            "total_cna": stab.total_cna,
            "static_margin_calibers": stab.static_margin_calibers,
            "is_stable": stab.is_stable,
            "is_over_stable": stab.is_over_stable,
            "contributions": contributions,
        },
        "powered_off": format_curves(&curves_off),
        "powered_on": format_curves(&curves_on),
    });

    serde_json::to_writer_pretty(std::io::stdout().lock(), &output)
        .map_err(|e| format!("output serialization error: {e}"))?;
    println!();
    Ok(())
}

fn main() {
    let json_text = match std::env::args().nth(1) {
        Some(path) => std::fs::read_to_string(&path).unwrap_or_else(|e| {
            eprintln!("error reading '{path}': {e}");
            std::process::exit(1);
        }),
        None => {
            let mut buf = String::new();
            std::io::stdin()
                .read_to_string(&mut buf)
                .unwrap_or_else(|e| {
                    eprintln!("error reading stdin: {e}");
                    std::process::exit(1);
                });
            buf
        }
    };

    if let Err(e) = run(&json_text) {
        eprintln!("aero error: {e}");
        std::process::exit(1);
    }
}
