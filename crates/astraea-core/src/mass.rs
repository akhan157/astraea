//! Mass & center-of-gravity aggregator.
//!
//! Faithful Rust port of the TypeScript oracle `src/core/mass.ts` (which is
//! untouched — it remains the source of truth). The port mirrors the TS
//! control flow exactly, including validation *order*:
//!
//! * structural geometry validates **before** any `massOverride` branch, so an
//!   override replaces mass but never structural integrity of the axial chain;
//! * a present-but-invalid override (`NaN`/`±Inf`/nonpositive) throws rather
//!   than falling through to computed mass;
//! * absent axial offsets default to `0.0`, while a present nonfinite offset
//!   fails closed instead of hiding behind `|| 0`.
//!
//! Shape model (documented engineering approximations, same as TS):
//! conical = exact 1/3 pi r^2 l volume with 3L/4 centroid from the tip
//! (the exact solid-cone centroid, NOT the 2L/3 CP station); ogive ~ 0.57
//! volume with 0.466L centroid; parabolic = exact 1/2 paraboloid volume
//! with 2L/3 centroid; von Karman / elliptical ~ 0.55 volume, L/2 centroid.
//! Hollow parts subtract a seated cavity (base-seated for nosecones, so the
//! shell centroid moves forward of the solid value) via volume-weighted
//! remainder. Body tubes default to a 1.5 mm wall when no inner diameter
//! is given; a *present* inner diameter must be finite and nonnegative.
//!
//! Only std is used (offline-safe). All floats are `f64`, mirroring TS
//! `number` semantics (`sqrt`/`powi`/π all `f64`).

use std::collections::HashSet;
use std::f64::consts::PI;

/// Default thin wall (m) selected when a body tube omits its inner diameter.
const DEFAULT_WALL: f64 = 0.0015;
/// Placeholder axial length (m) for point-mass-like components.
const POINT_LENGTH: f64 = 0.05;
/// Fallback reference diameter (m) when no diametral part has been seen.
const DEFAULT_REFERENCE_DIAMETER: f64 = 0.05;

/// Densities (kg/m³) mirroring `STANDARD_MATERIALS` in `src/core/types.ts`.
pub const KNOWN_MATERIALS: &[(&str, f64)] = &[
    ("cardboard", 680.0),
    ("fiberglass", 1850.0),
    ("carbonfiber", 1550.0),
    ("balsa", 160.0),
    ("plywood", 680.0),
    ("aluminum", 2700.0),
    ("pla_3dprint", 1250.0),
    ("abs_3dprint", 1040.0),
    ("petg_3dprint", 1270.0),
];

/// Look up a material density by id. `None` means "unknown material" and must
/// fail closed in [`aggregate_mass`] — never silently roll up zero mass.
pub fn material_density(material_id: &str) -> Option<f64> {
    KNOWN_MATERIALS
        .iter()
        .find(|(id, _)| *id == material_id)
        .map(|(_, d)| *d)
}

/// Nosecone profile. Mirrors `NoseconeShape` in `src/core/types.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoseShape {
    Conical,
    Ogive,
    Parabolic,
    VonKarman,
    Elliptical,
}

/// One vehicle component. Field-for-field mirror of the TS component
/// interfaces, except optional numerics are `Option<f64>` (`None` = absent,
/// which selects the TS `?? default`; `Some(NaN)` fails closed like TS).
///
/// `fin_count` is `i32` because TS rejects non-integers at runtime
/// (`Number.isInteger`); the integer half of that check is enforced by the
/// type system here, the `>= 1` half is validated in the fin calculators.
///
/// [`Component::Unknown`] exists so runtime-unknown component types (outside
/// the static union, as probed by the oracle tests) fail closed with the
/// TS-equivalent `unknown component type` error instead of rolling up zero.
#[derive(Debug, Clone)]
pub enum Component {
    Nosecone {
        shape: NoseShape,
        length: f64,
        base_diameter: f64,
        wall_thickness: f64,
        is_hollow: bool,
        mass_override: Option<f64>,
        cg_override: Option<f64>,
    },
    BodyTube {
        length: f64,
        outer_diameter: f64,
        /// `None` selects the default thin wall; a present value must be
        /// finite and nonnegative (NaN/negative never silently become default).
        inner_diameter: Option<f64>,
        mass_override: Option<f64>,
        cg_override: Option<f64>,
    },
    Transition {
        length: f64,
        fore_diameter: f64,
        aft_diameter: f64,
        wall_thickness: f64,
        is_hollow: bool,
        mass_override: Option<f64>,
        cg_override: Option<f64>,
    },
    TrapezoidFin {
        fin_count: i32,
        root_chord: f64,
        tip_chord: f64,
        span: f64,
        sweep_length: f64,
        thickness: f64,
        axial_offset: Option<f64>,
        mass_override: Option<f64>,
        cg_override: Option<f64>,
    },
    EllipticalFin {
        fin_count: i32,
        root_chord: f64,
        span: f64,
        thickness: f64,
        axial_offset: Option<f64>,
        mass_override: Option<f64>,
        cg_override: Option<f64>,
    },
    MassComp {
        mass: f64,
        /// `None` selects the 50&nbsp;mm placeholder (`?? 0.05` in TS).
        length: Option<f64>,
        axial_offset: Option<f64>,
    },
    Parachute {
        mass: f64,
        diameter: f64,
        cd: f64,
        axial_offset: Option<f64>,
    },
    Unknown {
        kind: String,
    },
}

/// One entry of a vehicle: identity + material reference + geometry.
#[derive(Debug, Clone)]
pub struct VehicleComponent {
    pub id: String,
    pub material_id: String,
    pub component: Component,
}

/// Minimal vehicle: an ordered component list forming the axial chain.
#[derive(Debug, Clone, Default)]
pub struct Vehicle {
    pub components: Vec<VehicleComponent>,
}

/// Per-component mass result. Lengths in meters, mass in kg.
#[derive(Debug, Clone)]
pub struct ComponentMassResult {
    pub id: String,
    pub mass: f64,
    pub local_cg: f64,
    pub global_cg: f64,
    pub axial_start: f64,
    pub axial_end: f64,
    pub length: f64,
}

/// Whole-vehicle rollup: total mass, CG from the nose tip, chain length.
#[derive(Debug, Clone)]
pub struct VehicleMassRollup {
    pub total_mass: f64,
    pub cg: f64,
    pub total_length: f64,
    pub max_diameter: f64,
    pub reference_diameter: f64,
    pub components: Vec<ComponentMassResult>,
}

/// Fail-closed geometry guard: nonfinite or nonpositive structural dimensions
/// throw rather than clamping into a silently nominal mass model.
fn require_finite_positive(value: f64, what: &str) -> Result<(), String> {
    if !value.is_finite() || value <= 0.0 {
        return Err(format!(
            "vehicle geometry: {what} must be finite and positive (got {value})"
        ));
    }
    Ok(())
}

/// Axial offset that fails closed on nonfinite values: absent (`None`)
/// defaults to `0.0`, but a present nonfinite offset throws.
fn axial_offset_of(offset: Option<f64>, raw: Option<f64>, id: &str) -> Result<f64, String> {
    let v = offset.unwrap_or(0.0);
    if !v.is_finite() {
        let got = match raw {
            Some(r) => format!("{r}"),
            None => "undefined".to_string(),
        };
        return Err(format!(
            "vehicle geometry: component '{id}' axialOffset must be finite (got {got})"
        ));
    }
    Ok(v)
}
fn check_cg_override(cg_override: Option<f64>, kind: &str) -> Result<(), String> {
    if let Some(cg) = cg_override {
        if !cg.is_finite() {
            return Err(format!(
                "vehicle geometry: {kind} cgOverride must be finite (got {cg})"
            ));
        }
    }
    Ok(())
}

fn check_mass_override(mass_override: Option<f64>, kind: &str) -> Result<(), String> {
    if let Some(m) = mass_override {
        if !(m > 0.0 && m.is_finite()) {
            return Err(format!(
                "vehicle geometry: {kind} massOverride must be finite and positive (got {m})"
            ));
        }
    }
    Ok(())
}

struct MassCg {
    mass: f64,
    local_cg: f64,
}

fn compute_nosecone_mass(
    shape: NoseShape,
    length: f64,
    base_diameter: f64,
    wall_thickness: f64,
    is_hollow: bool,
    mass_override: Option<f64>,
    cg_override: Option<f64>,
) -> Result<MassCg, String> {
    // Geometry validates BEFORE any override branch: an override replaces
    // mass, never structural integrity for the axial chain.
    require_finite_positive(length, "nosecone length")?;
    require_finite_positive(base_diameter, "nosecone baseDiameter")?;
    check_cg_override(cg_override, "nosecone")?;
    check_mass_override(mass_override, "nosecone")?;
    if is_hollow && (!wall_thickness.is_finite() || !(wall_thickness > 0.0) || !(wall_thickness < base_diameter / 2.0)) {
        return Err(format!(
            "vehicle geometry: hollow nosecone needs 0 < wallThickness < radius (got {wall_thickness})"
        ));
    }
    if let Some(m) = mass_override {
        let cg = cg_override.unwrap_or(length * 0.55);
        return Ok(MassCg { mass: m, local_cg: cg });
    }

    let r = base_diameter / 2.0;
    let l = length;
    let (mut volume, centroid_frac) = match shape {
        NoseShape::Conical => ((1.0 / 3.0) * PI * r * r * l, 0.75),
        NoseShape::Ogive => (0.57 * PI * r * r * l, 0.466),
        NoseShape::Parabolic => (0.5 * PI * r * r * l, 2.0 / 3.0),
        NoseShape::VonKarman | NoseShape::Elliptical => (0.55 * PI * r * r * l, 0.5),
    };
    let mut local_cg = centroid_frac * l;

    if is_hollow {
        // Invalid hollow walls fail closed: a nonpositive, nonfinite, or
        // through-wall thickness must never silently select solid geometry.
        if !wall_thickness.is_finite() || !(wall_thickness > 0.0) || !(wall_thickness < r) {
            return Err(format!(
                "vehicle geometry: hollow nosecone needs 0 < wallThickness < radius (got {wall_thickness} vs r={r})"
            ));
        }
        let r_inner = r - wall_thickness;
        let l_inner = l - wall_thickness;
        if !(l_inner > 0.0) {
            return Err(
                "vehicle geometry: hollow nosecone wall leaves no cavity length".to_string(),
            );
        }
        let inner_volume = volume * (r_inner / r).powi(2) * (l_inner / l);
        let cavity_cg = (l - l_inner) + centroid_frac * l_inner;
        let shell_volume = volume - inner_volume;
        if !(shell_volume > 0.0) {
            return Err(
                "vehicle geometry: hollow nosecone shell has no volume".to_string(),
            );
        }
        local_cg = (volume * local_cg - inner_volume * cavity_cg) / shell_volume;
        volume = shell_volume;
    }

    Ok(MassCg {
        mass: volume, // density applied by caller
        local_cg: cg_override.unwrap_or(local_cg),
    })
}

fn compute_bodytube_mass(
    length: f64,
    outer_diameter: f64,
    inner_diameter: Option<f64>,
    mass_override: Option<f64>,
    cg_override: Option<f64>,
) -> Result<MassCg, String> {
    require_finite_positive(length, "bodytube length")?;
    require_finite_positive(outer_diameter, "bodytube outerDiameter")?;
    check_cg_override(cg_override, "bodytube")?;
    check_mass_override(mass_override, "bodytube")?;
    let r_outer = outer_diameter / 2.0;
    // An absent inner diameter selects the default thin wall; a PRESENT one
    // must be finite and nonnegative — NaN/negative values must never
    // silently become a default wall.
    let r_inner = match inner_diameter {
        None => (r_outer - DEFAULT_WALL).max(0.0),
        Some(d) => {
            if !d.is_finite() || d < 0.0 {
                return Err(format!(
                    "vehicle geometry: bodytube innerDiameter must be finite and nonnegative (got {d})"
                ));
            }
            d / 2.0
        }
    };
    if !(r_inner < r_outer) {
        let got = match inner_diameter {
            Some(d) => format!("{d}"),
            None => "undefined".to_string(),
        };
        return Err(format!(
            "vehicle geometry: bodytube innerDiameter must leave positive wall (got {got} vs outer {outer_diameter})"
        ));
    }
    if let Some(m) = mass_override {
        return Ok(MassCg {
            mass: m,
            local_cg: cg_override.unwrap_or(length / 2.0),
        });
    }
    let cross_section = PI * (r_outer * r_outer - r_inner * r_inner);
    let _volume = cross_section * length;
    Ok(MassCg {
        // Density applied by caller via `with_density`.
        mass: _volume,
        local_cg: cg_override.unwrap_or(length / 2.0),
    })
}

fn compute_transition_mass(
    length: f64,
    fore_diameter: f64,
    aft_diameter: f64,
    wall_thickness: f64,
    is_hollow: bool,
    mass_override: Option<f64>,
    cg_override: Option<f64>,
) -> Result<MassCg, String> {
    require_finite_positive(length, "transition length")?;
    if !fore_diameter.is_finite() || fore_diameter < 0.0 {
        return Err(format!(
            "vehicle geometry: transition foreDiameter must be finite and nonnegative (got {fore_diameter})"
        ));
    }
    if !aft_diameter.is_finite() || aft_diameter < 0.0 {
        return Err(format!(
            "vehicle geometry: transition aftDiameter must be finite and nonnegative (got {aft_diameter})"
        ));
    }
    if !(fore_diameter > 0.0 || aft_diameter > 0.0) {
        return Err("vehicle geometry: transition needs a positive diameter".to_string());
    }
    check_cg_override(cg_override, "transition")?;
    check_mass_override(mass_override, "transition")?;
    if let Some(m) = mass_override {
        return Ok(MassCg {
            mass: m,
            local_cg: cg_override.unwrap_or(length / 2.0),
        });
    }
    let r1 = fore_diameter / 2.0;
    let r2 = aft_diameter / 2.0;
    let l = length;
    // Frustum solid volume.
    let solid_vol = (1.0 / 3.0) * PI * l * (r1 * r1 + r1 * r2 + r2 * r2);
    let mut volume = solid_vol;
    // Frustum CG from the fore face: l/4 for a cone tapering aft, l/2 for a
    // cylinder — datum matches the axial chain.
    let denom = r1 * r1 + r1 * r2 + r2 * r2;
    let mut local_cg = if denom > 0.0 {
        (l / 4.0) * ((r1 * r1 + 2.0 * r1 * r2 + 3.0 * r2 * r2) / denom)
    } else {
        l / 2.0
    };

    if is_hollow {
        if !wall_thickness.is_finite() || !(wall_thickness > 0.0) || !(wall_thickness < r1.max(r2)) {
            return Err(format!(
                "vehicle geometry: hollow transition needs 0 < wallThickness < max radius (got {wall_thickness})"
            ));
        }
        let ir1 = (r1 - wall_thickness).max(0.0);
        let ir2 = (r2 - wall_thickness).max(0.0);
        let inner_vol = (1.0 / 3.0) * PI * l * (ir1 * ir1 + ir1 * ir2 + ir2 * ir2);
        let shell_volume = solid_vol - inner_vol;
        if !(shell_volume > 0.0) {
            return Err("vehicle geometry: hollow transition shell has no volume".to_string());
        }
        let i_denom = ir1 * ir1 + ir1 * ir2 + ir2 * ir2;
        let cavity_cg = if i_denom > 0.0 {
            (l / 4.0) * ((ir1 * ir1 + 2.0 * ir1 * ir2 + 3.0 * ir2 * ir2) / i_denom)
        } else {
            l / 2.0
        };
        local_cg = (solid_vol * local_cg - inner_vol * cavity_cg) / shell_volume;
        volume = shell_volume;
    }

    Ok(MassCg {
        mass: volume, // density applied by caller
        local_cg: cg_override.unwrap_or(local_cg),
    })
}

fn compute_trapezoid_fin_mass(
    fin_count: i32,
    root_chord: f64,
    tip_chord: f64,
    span: f64,
    sweep_length: f64,
    thickness: f64,
    mass_override: Option<f64>,
    cg_override: Option<f64>,
) -> Result<MassCg, String> {
    // Longitudinal CG of trapezoid relative to root leading edge.
    let cr = root_chord;
    let ct = tip_chord;
    let s = sweep_length;
    require_finite_positive(cr, "fin rootChord")?;
    if !ct.is_finite() || ct < 0.0 {
        return Err(format!(
            "vehicle geometry: fin tipChord must be finite and nonnegative (got {ct})"
        ));
    }
    require_finite_positive(span, "fin span")?;
    require_finite_positive(thickness, "fin thickness")?;
    if fin_count < 1 {
        return Err(format!(
            "vehicle geometry: finCount must be a positive integer (got {fin_count})"
        ));
    }
    if !s.is_finite() || s < 0.0 {
        return Err(format!(
            "vehicle geometry: fin sweepLength must be finite and nonnegative (got {s})"
        ));
    }
    check_cg_override(cg_override, "fin")?;
    check_mass_override(mass_override, "fin")?;
    if let Some(m) = mass_override {
        return Ok(MassCg {
            mass: m,
            local_cg: cg_override.unwrap_or(root_chord / 2.0),
        });
    }
    let fin_area = 0.5 * (cr + ct) * span;
    let volume = fin_area * thickness * f64::from(fin_count);
    let denom = 3.0 * (cr + ct);
    let local_cg = if denom > 0.0 {
        (cr * cr + cr * ct + ct * ct + (cr + 2.0 * ct) * s) / denom
    } else {
        cr / 2.0
    };
    Ok(MassCg {
        mass: volume, // density applied by caller
        local_cg: cg_override.unwrap_or(local_cg),
    })
}

fn compute_elliptical_fin_mass(
    fin_count: i32,
    root_chord: f64,
    span: f64,
    thickness: f64,
    mass_override: Option<f64>,
    cg_override: Option<f64>,
) -> Result<MassCg, String> {
    // Quarter ellipse area = (pi / 4) * rootChord * span.
    require_finite_positive(root_chord, "fin rootChord")?;
    require_finite_positive(span, "fin span")?;
    require_finite_positive(thickness, "fin thickness")?;
    if fin_count < 1 {
        return Err(format!(
            "vehicle geometry: finCount must be a positive integer (got {fin_count})"
        ));
    }
    check_cg_override(cg_override, "fin")?;
    check_mass_override(mass_override, "fin")?;
    if let Some(m) = mass_override {
        return Ok(MassCg {
            mass: m,
            local_cg: cg_override.unwrap_or(root_chord / 2.0),
        });
    }
    let fin_area = (PI / 4.0) * root_chord * span;
    let volume = fin_area * thickness * f64::from(fin_count);
    let local_cg = (4.0 / (3.0 * PI)) * root_chord;
    Ok(MassCg {
        mass: volume, // density applied by caller
        local_cg: cg_override.unwrap_or(local_cg),
    })
}

/// Aggregate all components into an axial chain: total mass and CG.
///
/// Nosecone/bodytube/transition segments advance the chain; fin sets, mass
/// components and parachutes anchor at `lastBodyTubeStart + axialOffset`.
///
/// # Errors
///
/// Fails closed with TS-equivalent messages on: empty vehicle, duplicate
/// component ids, unknown materials, nonpositive material density, unknown
/// component types, and any invalid geometry (see module docs).
pub fn aggregate_mass(vehicle: &Vehicle) -> Result<VehicleMassRollup, String> {
    if vehicle.components.is_empty() {
        return Err(
            "vehicle geometry: vehicle has no components — mass rollup is undefined".to_string(),
        );
    }
    // Duplicate component identities fail closed: silent zero-mass
    // fallthrough is not a rollup.
    let mut seen = HashSet::new();
    for comp in &vehicle.components {
        if !seen.insert(comp.id.as_str()) {
            return Err(format!(
                "vehicle geometry: duplicate component id '{}'",
                comp.id
            ));
        }
    }

    let mut current_axial_x = 0.0;
    let mut last_body_tube_start = 0.0;
    let mut max_diameter = 0.0;
    let mut reference_diameter = DEFAULT_REFERENCE_DIAMETER;
    let mut results: Vec<ComponentMassResult> = Vec::with_capacity(vehicle.components.len());
    let mut known_ids: Vec<&str> = Vec::new();

    for entry in &vehicle.components {
        let density = match material_density(&entry.material_id) {
            Some(d) => d,
            None => {
                if known_ids.is_empty() {
                    known_ids = KNOWN_MATERIALS.iter().map(|(id, _)| *id).collect();
                }
                return Err(format!(
                    "vehicle geometry: unknown materialId '{}' (known: {})",
                    entry.material_id,
                    known_ids.join(", ")
                ));
            }
        };
        if !density.is_finite() || density <= 0.0 {
            return Err(format!(
                "vehicle geometry: material '{}' has nonpositive density",
                entry.material_id
            ));
        }

        let id = entry.id.as_str();
        let (mass, local_cg, axial_start, length) = match &entry.component {
            Component::Nosecone {
                shape,
                length,
                base_diameter,
                wall_thickness,
                is_hollow,
                mass_override,
                cg_override,
            } => {
                let mut res = compute_nosecone_mass(
                    *shape,
                    *length,
                    *base_diameter,
                    *wall_thickness,
                    *is_hollow,
                    *mass_override,
                    *cg_override,
                )?;
                if mass_override.is_none() {
                    res.mass *= density;
                }
                let axial_start = current_axial_x;
                current_axial_x += *length;
                if *base_diameter > max_diameter {
                    max_diameter = *base_diameter;
                }
                reference_diameter = *base_diameter;
                (res.mass, res.local_cg, axial_start, *length)
            }
            Component::BodyTube {
                length,
                outer_diameter,
                inner_diameter,
                mass_override,
                cg_override,
            } => {
                let mut res = compute_bodytube_mass(
                    *length,
                    *outer_diameter,
                    *inner_diameter,
                    *mass_override,
                    *cg_override,
                )?;
                if mass_override.is_none() {
                    res.mass *= density;
                }
                let axial_start = current_axial_x;
                last_body_tube_start = current_axial_x;
                current_axial_x += *length;
                if *outer_diameter > max_diameter {
                    max_diameter = *outer_diameter;
                }
                reference_diameter = *outer_diameter;
                (res.mass, res.local_cg, axial_start, *length)
            }
            Component::Transition {
                length,
                fore_diameter,
                aft_diameter,
                wall_thickness,
                is_hollow,
                mass_override,
                cg_override,
            } => {
                let mut res = compute_transition_mass(
                    *length,
                    *fore_diameter,
                    *aft_diameter,
                    *wall_thickness,
                    *is_hollow,
                    *mass_override,
                    *cg_override,
                )?;
                if mass_override.is_none() {
                    res.mass *= density;
                }
                let axial_start = current_axial_x;
                current_axial_x += *length;
                let comp_max = fore_diameter.max(*aft_diameter);
                if comp_max > max_diameter {
                    max_diameter = comp_max;
                }
                (res.mass, res.local_cg, axial_start, *length)
            }
            Component::TrapezoidFin {
                fin_count,
                root_chord,
                tip_chord,
                span,
                sweep_length,
                thickness,
                axial_offset,
                mass_override,
                cg_override,
            } => {
                let mut res = compute_trapezoid_fin_mass(
                    *fin_count,
                    *root_chord,
                    *tip_chord,
                    *span,
                    *sweep_length,
                    *thickness,
                    *mass_override,
                    *cg_override,
                )?;
                if mass_override.is_none() {
                    res.mass *= density;
                }
                let axial_start =
                    last_body_tube_start + axial_offset_of(*axial_offset, *axial_offset, id)?;
                (res.mass, res.local_cg, axial_start, *root_chord)
            }
            Component::EllipticalFin {
                fin_count,
                root_chord,
                span,
                thickness,
                axial_offset,
                mass_override,
                cg_override,
            } => {
                let mut res = compute_elliptical_fin_mass(
                    *fin_count,
                    *root_chord,
                    *span,
                    *thickness,
                    *mass_override,
                    *cg_override,
                )?;
                if mass_override.is_none() {
                    res.mass *= density;
                }
                let axial_start =
                    last_body_tube_start + axial_offset_of(*axial_offset, *axial_offset, id)?;
                (res.mass, res.local_cg, axial_start, *root_chord)
            }
            Component::MassComp {
                mass,
                length,
                axial_offset,
            } => {
                require_finite_positive(*mass, &format!("masscomponent '{id}' mass"))?;
                let comp_length = length.unwrap_or(POINT_LENGTH);
                require_finite_positive(
                    comp_length,
                    &format!("masscomponent '{id}' length"),
                )?;
                let axial_start =
                    last_body_tube_start + axial_offset_of(*axial_offset, *axial_offset, id)?;
                (*mass, comp_length / 2.0, axial_start, comp_length)
            }
            Component::Parachute {
                mass,
                diameter,
                cd,
                axial_offset,
            } => {
                require_finite_positive(*mass, &format!("parachute '{id}' mass"))?;
                require_finite_positive(*diameter, &format!("parachute '{id}' diameter"))?;
                require_finite_positive(*cd, &format!("parachute '{id}' cd"))?;
                let axial_start =
                    last_body_tube_start + axial_offset_of(*axial_offset, *axial_offset, id)?;
                (*mass, POINT_LENGTH / 2.0, axial_start, POINT_LENGTH)
            }
            Component::Unknown { kind } => {
                return Err(format!(
                    "vehicle geometry: unknown component type '{kind}' (id '{id}')"
                ));
            }
        };

        results.push(ComponentMassResult {
            id: entry.id.clone(),
            mass,
            local_cg,
            global_cg: axial_start + local_cg,
            axial_start,
            axial_end: axial_start + length,
            length,
        });
    }

    let total_mass: f64 = results.iter().map(|r| r.mass).sum();
    let total_moment: f64 = results.iter().map(|r| r.mass * r.global_cg).sum();
    // Every component mass is validated positive above: a nonpositive total
    // is unreachable through valid inputs, and falls closed instead of
    // halving the vehicle length as a nominal CG.
    if !(total_mass > 0.0) {
        return Err("vehicle geometry: total mass must be positive".to_string());
    }
    Ok(VehicleMassRollup {
        total_mass,
        cg: total_moment / total_mass,
        total_length: current_axial_x,
        max_diameter: if max_diameter != 0.0 {
            max_diameter
        } else {
            reference_diameter
        },
        reference_diameter: if reference_diameter != 0.0 {
            reference_diameter
        } else {
            DEFAULT_REFERENCE_DIAMETER
        },
        components: results,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const REL: f64 = 1e-9;

    fn assert_rel(got: f64, want: f64) {
        let denom = want.abs().max(1e-300);
        let rel = ((got - want) / denom).abs();
        assert!(
            rel <= REL,
            "got {} want {} (rel err {} > {})", got, want, rel, REL
        );
    }

    fn nosecone(over: Option<(Option<f64>, Option<f64>, bool, NoseShape)>) -> VehicleComponent {
        let (mass_override, cg_override, is_hollow, shape) =
            over.unwrap_or((None, None, false, NoseShape::Conical));
        VehicleComponent {
            id: "nc".to_string(),
            material_id: "pla_3dprint".to_string(),
            component: Component::Nosecone {
                shape,
                length: 0.2,
                base_diameter: 0.05,
                wall_thickness: 0.002,
                is_hollow,
                mass_override,
                cg_override,
            },
        }
    }

    fn base_vehicle() -> Vehicle {
        Vehicle {
            components: vec![
                VehicleComponent {
                    id: "nc".to_string(),
                    material_id: "pla_3dprint".to_string(),
                    component: Component::Nosecone {
                        shape: NoseShape::Conical,
                        length: 0.2,
                        base_diameter: 0.05,
                        wall_thickness: 0.002,
                        is_hollow: true,
                        mass_override: None,
                        cg_override: None,
                    },
                },
                VehicleComponent {
                    id: "bt".to_string(),
                    material_id: "cardboard".to_string(),
                    component: Component::BodyTube {
                        length: 0.8,
                        outer_diameter: 0.05,
                        inner_diameter: Some(0.047),
                        mass_override: None,
                        cg_override: None,
                    },
                },
            ],
        }
    }

    fn single(component: Component, id: &str, material: &str) -> Vehicle {
        Vehicle {
            components: vec![VehicleComponent {
                id: id.to_string(),
                material_id: material.to_string(),
                component,
            }],
        }
    }

    #[test]
    fn solid_cone_centroid_at_three_quarters_not_two_thirds() {
        // Oracle anchor: node-computed solid conical nosecone, L=0.2 D=0.05 PLA.
        let rollup = aggregate_mass(&Vehicle {
            components: vec![nosecone(None)],
        })
        .unwrap();
        assert_rel(rollup.components[0].mass, 0.1636246173744684);
        assert_rel(rollup.components[0].local_cg, 0.75 * 0.2);
    }

    #[test]
    fn hollow_shell_lighter_with_forward_centroid() {
        let solid = aggregate_mass(&Vehicle {
            components: vec![nosecone(None)],
        })
        .unwrap();
        let hollow = aggregate_mass(&Vehicle {
            components: vec![nosecone(Some((None, None, true, NoseShape::Conical)))],
        })
        .unwrap();
        assert_rel(hollow.components[0].mass, 0.026517659990175885);
        assert_rel(hollow.components[0].local_cg, 0.14741479909171692);
        assert!(hollow.components[0].mass < solid.components[0].mass);
        assert!(hollow.components[0].local_cg < solid.components[0].local_cg);
        assert!(hollow.components[0].local_cg > 0.0);
        assert!(hollow.components[0].local_cg < 0.2);
    }

    #[test]
    fn other_profiles_match_oracle_volumes_and_centroids() {
        for (shape, mass, cg) in [
            (NoseShape::Ogive, 0.279798095710341, 0.466 * 0.2),
            (NoseShape::Parabolic, 0.24543692606170264, (2.0 / 3.0) * 0.2),
            (NoseShape::VonKarman, 0.26998061866787293, 0.5 * 0.2),
            (NoseShape::Elliptical, 0.26998061866787293, 0.5 * 0.2),
        ] {
            let rollup = aggregate_mass(&Vehicle {
                components: vec![nosecone(Some((None, None, false, shape)))],
            })
            .unwrap();
            assert_rel(rollup.components[0].mass, mass);
            assert_rel(rollup.components[0].local_cg, cg);
        }
    }

    #[test]
    fn hollow_bodytube_matches_oracle() {
        let rollup = aggregate_mass(&single(
            Component::BodyTube {
                length: 0.8,
                outer_diameter: 0.05,
                inner_diameter: Some(0.047),
                mass_override: None,
                cg_override: None,
            },
            "bt",
            "cardboard",
        ))
        .unwrap();
        assert_rel(rollup.components[0].mass, 0.12433167085846987);
        assert_rel(rollup.components[0].local_cg, 0.4);
    }

    #[test]
    fn absent_inner_diameter_selects_default_wall() {
        // Oracle anchor: L=0.5, outer=0.05, cardboard, wall defaults to 1.5mm.
        let rollup = aggregate_mass(&single(
            Component::BodyTube {
                length: 0.5,
                outer_diameter: 0.05,
                inner_diameter: None,
                mass_override: None,
                cg_override: None,
            },
            "bt",
            "cardboard",
        ))
        .unwrap();
        assert_rel(rollup.components[0].mass, 0.07770729428654366);
        assert_rel(rollup.components[0].local_cg, 0.25);
    }

    #[test]
    fn frustum_transition_matches_oracle() {
        let rollup = aggregate_mass(&single(
            Component::Transition {
                length: 0.1,
                fore_diameter: 0.05,
                aft_diameter: 0.03,
                wall_thickness: 0.002,
                is_hollow: false,
                mass_override: None,
                cg_override: None,
            },
            "tr",
            "cardboard",
        ))
        .unwrap();
        assert_rel(rollup.components[0].mass, 0.08723155601467658);
        assert_rel(rollup.components[0].local_cg, 0.04183673469387756);
    }

    #[test]
    fn hollow_transition_subtracts_shell() {
        let rollup = aggregate_mass(&single(
            Component::Transition {
                length: 0.1,
                fore_diameter: 0.05,
                aft_diameter: 0.03,
                wall_thickness: 0.002,
                is_hollow: true,
                mass_override: None,
                cg_override: None,
            },
            "tr",
            "cardboard",
        ))
        .unwrap();
        assert_rel(rollup.components[0].mass, 0.01623575083375204);
        assert_rel(rollup.components[0].local_cg, 0.04561403508771935);
    }

    #[test]
    fn trapezoid_fin_matches_oracle() {
        let rollup = aggregate_mass(&single(
            Component::TrapezoidFin {
                fin_count: 3,
                root_chord: 0.07,
                tip_chord: 0.028,
                span: 0.051,
                sweep_length: 0.038,
                thickness: 0.002,
                axial_offset: Some(0.2),
                mass_override: None,
                cg_override: None,
            },
            "f",
            "balsa",
        ))
        .unwrap();
        assert_rel(rollup.components[0].mass, 0.0023990400000000003);
        assert_rel(rollup.components[0].local_cg, 0.04228571428571429);
    }

    #[test]
    fn elliptical_fin_matches_oracle() {
        let rollup = aggregate_mass(&single(
            Component::EllipticalFin {
                fin_count: 3,
                root_chord: 0.07,
                span: 0.051,
                thickness: 0.002,
                axial_offset: Some(0.2),
                mass_override: None,
                cg_override: None,
            },
            "f",
            "balsa",
        ))
        .unwrap();
        assert_rel(rollup.components[0].mass, 0.002691716585595735);
        assert_rel(rollup.components[0].local_cg, 0.029708922710487133);
    }

    #[test]
    fn full_vehicle_rollup_matches_oracle() {
        // Oracle anchor: hollow conical nose + hollow bodytube.
        let rollup = aggregate_mass(&base_vehicle()).unwrap();
        assert_rel(rollup.total_length, 1.0);
        assert_rel(rollup.max_diameter, 0.05);
        assert_rel(rollup.total_mass, 0.15084933084864577);
        assert_rel(rollup.cg, 0.5204404792069448);
        assert!(rollup.total_mass > 0.05);
        assert!(rollup.cg > 0.2 && rollup.cg < 1.0);
    }

    #[test]
    fn fins_anchor_at_last_body_tube_start_plus_offset() {
        let mut vehicle = base_vehicle();
        vehicle.components.push(VehicleComponent {
            id: "f".to_string(),
            material_id: "balsa".to_string(),
            component: Component::TrapezoidFin {
                fin_count: 3,
                root_chord: 0.07,
                tip_chord: 0.028,
                span: 0.051,
                sweep_length: 0.038,
                thickness: 0.002,
                axial_offset: Some(0.5),
                mass_override: None,
                cg_override: None,
            },
        });
        let rollup = aggregate_mass(&vehicle).unwrap();
        let fin = rollup.components.iter().find(|c| c.id == "f").unwrap();
        // Last body tube starts at x=0.2; offset 0.5 -> axial start 0.7.
        assert_rel(fin.axial_start, 0.7);
        assert_rel(fin.global_cg, 0.7 + 0.04228571428571429);
        // Chain length is unchanged by anchored components.
        assert_rel(rollup.total_length, 1.0);
    }

    #[test]
    fn mass_override_replaces_mass_and_shifts_cg_forward() {
        let mut overridden = base_vehicle();
        if let Component::Nosecone { mass_override, .. } =
            &mut overridden.components[0].component
        {
            *mass_override = Some(0.5);
        } else {
            panic!("expected nosecone");
        }
        let rollup = aggregate_mass(&overridden).unwrap();
        let nc = rollup.components.iter().find(|c| c.id == "nc").unwrap();
        assert_rel(nc.mass, 0.5);
        let original = aggregate_mass(&base_vehicle()).unwrap();
        assert!(rollup.cg < original.cg);
    }

    #[test]
    fn override_branches_honor_cg_override() {
        let rollup = aggregate_mass(&Vehicle {
            components: vec![nosecone(Some((Some(0.5), Some(0.07), false, NoseShape::Conical)))],
        })
        .unwrap();
        assert_rel(rollup.components[0].mass, 0.5);
        assert_rel(rollup.components[0].local_cg, 0.07);
    }

    #[test]
    fn rejects_nonpositive_and_nonfinite_dimensions() {
        // Zero nosecone length.
        let mut bad = Vehicle {
            components: vec![nosecone(None)],
        };
        if let Component::Nosecone { length, .. } = &mut bad.components[0].component {
            *length = 0.0;
        }
        assert!(aggregate_mass(&bad).unwrap_err().contains("finite and positive"));

        // Negative base diameter.
        let mut bad = Vehicle {
            components: vec![nosecone(None)],
        };
        if let Component::Nosecone { base_diameter, .. } = &mut bad.components[0].component {
            *base_diameter = -0.01;
        }
        assert!(aggregate_mass(&bad).unwrap_err().contains("finite and positive"));

        // Negative hollow wall.
        let mut bad = Vehicle {
            components: vec![nosecone(Some((None, None, true, NoseShape::Conical)))],
        };
        if let Component::Nosecone { wall_thickness, .. } = &mut bad.components[0].component {
            *wall_thickness = -0.001;
        }
        assert!(aggregate_mass(&bad).unwrap_err().contains("wallThickness"));

        // Through-wall hollow wall (0.05 > r=0.025).
        let mut bad = Vehicle {
            components: vec![nosecone(Some((None, None, true, NoseShape::Conical)))],
        };
        if let Component::Nosecone { wall_thickness, .. } = &mut bad.components[0].component {
            *wall_thickness = 0.05;
        }
        assert!(aggregate_mass(&bad).unwrap_err().contains("wallThickness"));

        // Body tube with no wall (inner == outer).
        let err = aggregate_mass(&single(
            Component::BodyTube {
                length: 0.5,
                outer_diameter: 0.05,
                inner_diameter: Some(0.05),
                mass_override: None,
                cg_override: None,
            },
            "bt",
            "cardboard",
        ))
        .unwrap_err();
        assert!(err.contains("positive wall"), "unexpected: {}", err);

        // Empty vehicle.
        let err = aggregate_mass(&Vehicle { components: vec![] }).unwrap_err();
        assert!(err.contains("no components"), "unexpected: {}", err);
    }

    #[test]
    fn rejects_unknown_materials_nan_offsets_and_bad_fins_chutes() {
        // NaN axial offset on a fin.
        let mut vehicle = base_vehicle();
        vehicle.components.push(VehicleComponent {
            id: "f".to_string(),
            material_id: "balsa".to_string(),
            component: Component::TrapezoidFin {
                fin_count: 3,
                root_chord: 0.07,
                tip_chord: 0.028,
                span: 0.051,
                sweep_length: 0.038,
                thickness: 0.002,
                axial_offset: Some(f64::NAN),
                mass_override: None,
                cg_override: None,
            },
        });
        let err = aggregate_mass(&vehicle).unwrap_err();
        assert!(err.contains("axialOffset must be finite"), "unexpected: {}", err);

        // Zero fin count.
        let mut vehicle = base_vehicle();
        vehicle.components.push(VehicleComponent {
            id: "f".to_string(),
            material_id: "balsa".to_string(),
            component: Component::TrapezoidFin {
                fin_count: 0,
                root_chord: 0.07,
                tip_chord: 0.028,
                span: 0.051,
                sweep_length: 0.038,
                thickness: 0.002,
                axial_offset: Some(0.2),
                mass_override: None,
                cg_override: None,
            },
        });
        let err = aggregate_mass(&vehicle).unwrap_err();
        assert!(
            err.contains("finCount must be a positive integer"),
            "unexpected: {}", err
        );

        // Negative parachute diameter.
        let mut vehicle = base_vehicle();
        vehicle.components.push(VehicleComponent {
            id: "p".to_string(),
            material_id: "cardboard".to_string(),
            component: Component::Parachute {
                mass: 0.008,
                diameter: -0.3,
                cd: 0.8,
                axial_offset: Some(0.05),
            },
        });
        let err = aggregate_mass(&vehicle).unwrap_err();
        assert!(err.contains("diameter"), "unexpected: {}", err);
        assert!(err.contains("finite and positive"), "unexpected: {}", err);

        // Unknown material.
        let err = aggregate_mass(&single(
            Component::BodyTube {
                length: 0.5,
                outer_diameter: 0.05,
                inner_diameter: Some(0.047),
                mass_override: None,
                cg_override: None,
            },
            "bt",
            "unobtanium",
        ))
        .unwrap_err();
        assert!(err.contains("unknown materialId"), "unexpected: {}", err);
    }

    #[test]
    fn validates_geometry_before_overrides_and_rejects_bad_identities() {
        // Bad wall still throws under a mass override.
        let err = aggregate_mass(&single(
            Component::BodyTube {
                length: 0.5,
                outer_diameter: 0.05,
                inner_diameter: Some(0.05),
                mass_override: Some(0.4),
                cg_override: None,
            },
            "bt",
            "cardboard",
        ))
        .unwrap_err();
        assert!(err.contains("positive wall"), "unexpected: {}", err);

        // Nonpositive override throws rather than falling through.
        let err = aggregate_mass(&Vehicle {
            components: vec![nosecone(Some((Some(0.0), None, false, NoseShape::Conical)))],
        })
        .unwrap_err();
        assert!(
            err.contains("massOverride must be finite and positive"),
            "unexpected: {}", err
        );

        // Duplicate component ids throw.
        let dup = nosecone(None);
        let err = aggregate_mass(&Vehicle {
            components: vec![dup.clone(), dup],
        })
        .unwrap_err();
        assert!(err.contains("duplicate component id"), "unexpected: {}", err);

        // Unknown component types throw instead of rolling up zero mass.
        let err = aggregate_mass(&Vehicle {
            components: vec![VehicleComponent {
                id: "x".to_string(),
                material_id: "cardboard".to_string(),
                component: Component::Unknown {
                    kind: "warpdrive".to_string(),
                },
            }],
        })
        .unwrap_err();
        assert!(err.contains("unknown component type"), "unexpected: {}", err);
    }
}
