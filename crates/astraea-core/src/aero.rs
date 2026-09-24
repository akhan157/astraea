//! Aerodynamics engine: Barrowman stability + transonic/supersonic drag.
//!
//! Faithful Rust port of the TypeScript oracles `src/aero/barrowman.ts` and
//! `src/aero/transonicAero.ts` (both untouched — they remain the source of
//! truth). Control flow and arithmetic mirror the TS line-for-line so the
//! `#[cfg(test)]` parity anchors below (extracted from the TS via
//! `node --experimental-strip-types`, never hand-invented) hold:
//!
//! * exact-integer / fail-closed geometry (duplicate ids, unknown materials
//!   or component types, nonfinite dimensions) propagates TS-equivalent
//!   `vehicle geometry: …` errors instead of clamping;
//! * Barrowman CNa/CP/static-margin anchors assert at 1e-9 relative;
//! * transonic curve anchors (skin friction, wave/base drag, Mach curves)
//!   assert at 0.5% relative.
//!
//! Module-local types only (minimal geometry structs mirroring the TS
//! component fields; small duplication with the mass module is intentional —
//! no cross-module dependency). Only std is used (offline-safe); all floats
//! are `f64`, mirroring TS `number` (`sqrt`/`log10`/`asin`/`powf`).
//!
//! Coarse public API: [`stability`] (full Barrowman assembly) and
//! [`aero_curves`] (Mach 0–4 drag/CP curves, 41 points). Fine-grained
//! `compute_*` helpers are also `pub` for parity testing.

use std::collections::HashSet;
use std::f64::consts::PI;

/// Sea-level speed of sound, ISA 1976 (m/s). Mirrors `SPEED_OF_SOUND_SL`.
const SPEED_OF_SOUND_SL: f64 = 340.29;
/// Default thin wall (m) when a body tube omits its inner diameter.
const DEFAULT_WALL: f64 = 0.0015;
/// Placeholder axial length (m) for point-mass-like components.
const POINT_LENGTH: f64 = 0.05;
/// Fallback reference diameter (m) when no diametral part has been seen.
const DEFAULT_REFERENCE_DIAMETER: f64 = 0.05;

/// Densities (kg/m³) mirroring `STANDARD_MATERIALS` in `src/core/types.ts`.
/// Order matches the TS insertion order (used by the unknown-material error).
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
/// fail closed — never silently roll up zero mass.
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

/// Fin cross-section. Mirrors `FinCrossSection` in `src/core/types.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FinCrossSection {
    Square,
    Rounded,
    DoubleWedge,
    Airfoil,
}

/// One vehicle component. Field-for-field mirror of the TS component
/// interfaces, except optional numerics are `Option<f64>` (`None` = absent,
/// which selects the TS `?? default`; `Some(NaN)` fails closed like TS).
///
/// `fin_count` is `i32` because TS rejects non-integers at runtime
/// (`Number.isInteger`); the integer half is enforced by the type system,
/// the `>= 1` half is validated in the calculators.
///
/// [`Component::Unknown`] exists so runtime-unknown component types fail
/// closed with the TS-equivalent `unknown component type` error.
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
        cross_section: FinCrossSection,
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
        /// `None` selects the 50 mm placeholder (`?? 0.05` in TS).
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

impl Component {
    /// TS `type` discriminator string, echoed in contributions and errors.
    pub fn kind_str(&self) -> String {
        match self {
            Component::Nosecone { .. } => "nosecone".to_string(),
            Component::BodyTube { .. } => "bodytube".to_string(),
            Component::Transition { .. } => "transition".to_string(),
            Component::TrapezoidFin { .. } => "trapezoidfinset".to_string(),
            Component::EllipticalFin { .. } => "ellipticalfinset".to_string(),
            Component::MassComp { .. } => "masscomponent".to_string(),
            Component::Parachute { .. } => "parachute".to_string(),
            Component::Unknown { kind } => kind.clone(),
        }
    }
}

/// One entry of a vehicle: identity + material reference + geometry.
#[derive(Debug, Clone)]
pub struct VehicleComponent {
    pub id: String,
    pub name: String,
    pub material_id: String,
    pub component: Component,
}

/// Minimal vehicle: an ordered component list forming the axial chain.
#[derive(Debug, Clone, Default)]
pub struct Vehicle {
    pub components: Vec<VehicleComponent>,
}

// ---------------------------------------------------------------------------
// Internal mass rollup (duplicated from the mass module on purpose: this
// module stays independent — no cross-module dependency).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct ComponentMassResult {
    id: String,
    mass: f64,
    local_cg: f64,
    global_cg: f64,
    axial_start: f64,
    axial_end: f64,
    length: f64,
}

#[derive(Debug, Clone)]
struct VehicleMassRollup {
    total_mass: f64,
    cg: f64,
    total_length: f64,
    max_diameter: f64,
    reference_diameter: f64,
    components: Vec<ComponentMassResult>,
}

/// Fail-closed geometry guard: nonfinite or nonpositive structural dimensions
/// throw rather than clamping into a silently nominal model.
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
fn axial_offset_of(offset: Option<f64>, id: &str) -> Result<f64, String> {
    let v = offset.unwrap_or(0.0);
    if !v.is_finite() {
        let got = match offset {
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

#[allow(clippy::too_many_arguments)]
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
    if is_hollow
        && (!wall_thickness.is_finite()
            || !(wall_thickness > 0.0)
            || !(wall_thickness < base_diameter / 2.0))
    {
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
    let volume = cross_section * length;
    Ok(MassCg {
        mass: volume, // density applied by caller
        local_cg: cg_override.unwrap_or(length / 2.0),
    })
}

#[allow(clippy::too_many_arguments)]
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
        if !wall_thickness.is_finite()
            || !(wall_thickness > 0.0)
            || !(wall_thickness < r1.max(r2))
        {
            return Err(format!(
                "vehicle geometry: hollow transition needs 0 < wallThickness < max radius (got {wall_thickness})"
            ));
        }
        let ir1 = (r1 - wall_thickness).max(0.0);
        let ir2 = (r2 - wall_thickness).max(0.0);
        let inner_vol = (1.0 / 3.0) * PI * l * (ir1 * ir1 + ir1 * ir2 + ir2 * ir2);
        let shell_volume = solid_vol - inner_vol;
        if !(shell_volume > 0.0) {
            return Err(
                "vehicle geometry: hollow transition shell has no volume".to_string(),
            );
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

#[allow(clippy::too_many_arguments)]
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
/// Fails closed with TS-equivalent messages on: empty vehicle, duplicate
/// component ids, unknown materials, unknown component types, and any
/// invalid geometry.
fn aggregate_mass_rollup(vehicle: &Vehicle) -> Result<VehicleMassRollup, String> {
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
    let mut results: Vec<ComponentMassResult> =
        Vec::with_capacity(vehicle.components.len());
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
                ..
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
                let axial_start = last_body_tube_start + axial_offset_of(*axial_offset, id)?;
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
                let axial_start = last_body_tube_start + axial_offset_of(*axial_offset, id)?;
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
                let axial_start = last_body_tube_start + axial_offset_of(*axial_offset, id)?;
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
                let axial_start = last_body_tube_start + axial_offset_of(*axial_offset, id)?;
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

// ---------------------------------------------------------------------------
// Barrowman outputs
// ---------------------------------------------------------------------------

/// Normal-force / CP contribution of one lifting surface.
#[derive(Debug, Clone)]
pub struct AeroSurfaceContribution {
    pub id: String,
    pub name: String,
    pub kind: String,
    /// Normal force coefficient derivative per radian.
    pub cna: f64,
    /// Center of pressure, meters from nose tip.
    pub cp: f64,
    pub axial_start: f64,
    pub axial_end: f64,
}

/// Per-component stability + mass contribution (mirrors TS
/// `ComponentContribution`).
#[derive(Debug, Clone)]
pub struct ComponentContribution {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub mass: f64,
    /// Component CG, meters from nose tip.
    pub cg: f64,
    /// Center of pressure, meters from nose tip (`None` = non-lifting part).
    pub cp: Option<f64>,
    /// Normal force derivative per radian (`None` = non-lifting part).
    pub cna: Option<f64>,
    pub axial_start: f64,
    pub axial_end: f64,
}

/// Whole-vehicle Barrowman result (mirrors TS `StabilityAnalysis`).
#[derive(Debug, Clone)]
pub struct StabilityAnalysis {
    pub total_length: f64,
    pub max_diameter: f64,
    pub reference_diameter: f64,
    pub total_mass: f64,
    /// Vehicle CG, meters from nose tip.
    pub cg: f64,
    /// Vehicle CP, meters from nose tip.
    pub cp: f64,
    /// `(cp - cg) / reference_diameter`.
    pub static_margin_calibers: f64,
    pub total_cna: f64,
    /// Margin >= 1.0 caliber.
    pub is_stable: bool,
    /// Margin > 3.0 calibers (windcocking risk).
    pub is_over_stable: bool,
    pub contributions: Vec<ComponentContribution>,
}

/// CNa + CP pair returned by the frustum/fin calculators.
#[derive(Debug, Clone, Copy)]
pub struct CnaCp {
    pub cna: f64,
    pub cp: f64,
}

/// Nosecone center of pressure relative to the nose tip.
///
/// * conical → 2/3 L; ogive → 0.466 L; parabolic / von Kármán → L/2;
///   elliptical → L/3.
pub fn compute_nosecone_cp(shape: NoseShape, length: f64) -> f64 {
    match shape {
        NoseShape::Conical => (2.0 / 3.0) * length,
        NoseShape::Ogive => 0.466 * length,
        NoseShape::Parabolic => 0.5 * length,
        NoseShape::Elliptical => (1.0 / 3.0) * length,
        NoseShape::VonKarman => 0.5 * length,
    }
}

/// Conical transition (shoulder or boattail) CP and CNa.
///
/// `axial_start` is the frustum front station; `ref_diameter` the vehicle
/// reference diameter. Pure arithmetic mirror of the TS — including the
/// cylindrical (`|d2-d1| < 1e-5`) early-out and the near-degenerate
/// `|denom| <= 1e-4` fallback to `l/2`.
pub fn compute_transition_aero(
    fore_diameter: f64,
    aft_diameter: f64,
    length: f64,
    axial_start: f64,
    ref_diameter: f64,
) -> CnaCp {
    let d1 = fore_diameter;
    let d2 = aft_diameter;
    let l = length;
    let dref = if ref_diameter > 0.0 {
        ref_diameter
    } else {
        d1.max(d2)
    };

    // CNa = 2 * ((d2/dref)^2 - (d1/dref)^2)
    let cna = 2.0 * ((d2 / dref).powi(2) - (d1 / dref).powi(2));

    // Cylindrical (no diameter change): no normal force.
    if (d2 - d1).abs() < 0.00001 {
        return CnaCp {
            cna: 0.0,
            cp: axial_start + l / 2.0,
        };
    }

    // Barrowman frustum CP:
    // x_cp = x_front + (L/3) * [ 1 + (1 - d1/d2) / (1 - (d1/d2)^2) ]
    let ratio = d1 / d2;
    let denom = 1.0 - ratio * ratio;
    let cp_local = if denom.abs() > 0.0001 {
        (l / 3.0) * (1.0 + (1.0 - ratio) / denom)
    } else {
        l / 2.0
    };
    CnaCp {
        cna,
        cp: axial_start + cp_local,
    }
}

/// Trapezoidal fin set CNa and CP, including Rogers modified-Barrowman
/// fin-body interference (`K_fb`, `K_bf` per NACA Report 1307).
pub fn compute_trapezoid_fin_aero(
    fin_count: i32,
    root_chord: f64,
    tip_chord: f64,
    span: f64,
    sweep_length: f64,
    axial_start: f64,
    body_diameter: f64,
    ref_diameter: f64,
) -> CnaCp {
    let n = f64::from(fin_count);
    let cr = root_chord;
    let ct = tip_chord;
    let s = span;
    let m = sweep_length;
    let d = if body_diameter > 0.0 {
        body_diameter
    } else {
        ref_diameter
    };
    let dref = if ref_diameter > 0.0 {
        ref_diameter
    } else {
        d
    };
    let r = d / 2.0;

    // Mid-chord line length: L_F = sqrt(s^2 + (m + ct/2 - cr/2)^2)
    let sweep_mid = m + 0.5 * ct - 0.5 * cr;
    let lf = sweep_mid.hypot(s);

    // Single fin lift slope (CNa)1
    let chord_sum = cr + ct;
    let mut cna1 = 0.0;
    if chord_sum > 0.0 && dref > 0.0 {
        let denom = 1.0 + (1.0 + ((2.0 * lf) / chord_sum).powi(2)).sqrt();
        cna1 = (2.0 * PI * (s / dref).powi(2)) / denom;
    }

    // Fin-body mutual interference (Rogers Modified Barrowman):
    // 1. K_fb: fin in presence of body = 1 + R / (s + R)
    let kfb = 1.0 + r / (s + r);
    // 2. K_bf: body lift induced in presence of fins
    let kbf = if r > 0.0 {
        (r / (s + r)).powi(2) * (1.0 + s / r)
    } else {
        0.0
    };

    let cna_fb = kfb * (n / 2.0) * cna1;
    let cna_bf = kbf * (n / 2.0) * cna1;
    let cna = cna_fb + cna_bf;

    // CP of the isolated trapezoidal fin:
    // x_cp,fin = x_le + m*(cr + 2*ct)/(3*(cr + ct))
    //          + (1/6)*[cr + ct - (cr*ct)/(cr + ct)]
    let fin_cp_offset = if chord_sum > 0.0 {
        let term1 = (m * (cr + 2.0 * ct)) / (3.0 * chord_sum);
        let term2 = (1.0 / 6.0) * (chord_sum - (cr * ct) / chord_sum);
        term1 + term2
    } else {
        cr / 2.0
    };
    let cp_fin = axial_start + fin_cp_offset;

    // CP of the body lift induced by fins: along the body cylinder adjacent
    // to the fin root chord at ~0.45 * cr.
    let cp_body = axial_start + 0.45 * cr;

    // Combined CP weighted by normal force contributions.
    let cp = if cna > 0.0 {
        (cna_fb * cp_fin + cna_bf * cp_body) / cna
    } else {
        cp_fin
    };

    CnaCp { cna, cp }
}

/// Elliptical fin set CNa and CP (effective tip chord 0, quarter-ellipse
/// centroid at `(4/(3π))·cr`).
pub fn compute_elliptical_fin_aero(
    fin_count: i32,
    root_chord: f64,
    span: f64,
    axial_start: f64,
    body_diameter: f64,
    ref_diameter: f64,
) -> CnaCp {
    let n = f64::from(fin_count);
    let cr = root_chord;
    let s = span;
    let d = if body_diameter > 0.0 {
        body_diameter
    } else {
        ref_diameter
    };
    let dref = if ref_diameter > 0.0 {
        ref_diameter
    } else {
        d
    };
    let r = d / 2.0;

    // Elliptical fin mid-chord approximation (no chord-sum guard in TS —
    // a zero root chord flows through IEEE division to cna1 = 0).
    let lf = (s * s + (cr / 4.0) * (cr / 4.0)).sqrt();
    let chord_sum = cr; // effective tip chord = 0

    let denom = 1.0 + (1.0 + ((2.0 * lf) / chord_sum).powi(2)).sqrt();
    let cna1 = (2.0 * PI * (s / dref).powi(2)) / denom;

    // Rogers Modified Barrowman interference factors (NACA Report 1307).
    let kfb = 1.0 + r / (s + r);
    let kbf = if r > 0.0 {
        (r / (s + r)).powi(2) * (1.0 + s / r)
    } else {
        0.0
    };

    let cna_fb = kfb * (n / 2.0) * cna1;
    let cna_bf = kbf * (n / 2.0) * cna1;
    let cna = cna_fb + cna_bf;

    // Centroid of quarter-ellipse is (4 / (3*pi)) * cr.
    let cp_fin = axial_start + (4.0 / (3.0 * PI)) * cr;
    let cp_body = axial_start + 0.45 * cr;
    let cp = if cna > 0.0 {
        (cna_fb * cp_fin + cna_bf * cp_body) / cna
    } else {
        cp_fin
    };

    CnaCp { cna, cp }
}

/// Complete Barrowman stability evaluation for an entire rocket assembly.
///
/// Advances an axial chain over nosecone/bodytube/transition segments,
/// anchors fin sets at `lastBodyTubeStart + axialOffset`, accumulates
/// `CP = Σ(CNaᵢ·CPᵢ)/ΣCNaᵢ` with the `|ΣCNa| <= 1e-4 → 2/3·L` fallback, and
/// derives static margin in calibers with the `>= 1.0` / `> 3.0` stability
/// gates. Fails closed (mass validation runs first, so a present-but-NaN
/// fin offset throws there rather than hiding behind `|| 0`).
pub fn compute_rocket_stability(vehicle: &Vehicle) -> Result<StabilityAnalysis, String> {
    let mass_rollup = aggregate_mass_rollup(vehicle)?;
    let ref_diameter = mass_rollup.reference_diameter;

    let mut current_axial_x = 0.0;
    let mut last_body_tube_start = 0.0;
    let mut last_body_diameter = ref_diameter;

    let mut aero_surfaces: Vec<AeroSurfaceContribution> = Vec::new();

    for comp in &vehicle.components {
        match &comp.component {
            Component::Nosecone {
                shape,
                length,
                base_diameter,
                ..
            } => {
                let cp_local = compute_nosecone_cp(*shape, *length);
                let cp_global = current_axial_x + cp_local;
                // Nosecone normal force derivative: CNa = 2.0 * (d_base / d_ref)^2
                let cna = 2.0 * (*base_diameter / ref_diameter).powi(2);
                aero_surfaces.push(AeroSurfaceContribution {
                    id: comp.id.clone(),
                    name: comp.name.clone(),
                    kind: "nosecone".to_string(),
                    cna,
                    cp: cp_global,
                    axial_start: current_axial_x,
                    axial_end: current_axial_x + *length,
                });
                last_body_diameter = *base_diameter;
                current_axial_x += *length;
            }
            Component::BodyTube {
                length,
                outer_diameter,
                ..
            } => {
                last_body_tube_start = current_axial_x;
                last_body_diameter = *outer_diameter;
                current_axial_x += *length;
                // Slender body tubes have approximately CNa = 0 at alpha = 0
                // in Barrowman theory.
            }
            Component::Transition {
                length,
                fore_diameter,
                aft_diameter,
                ..
            } => {
                let res = compute_transition_aero(
                    *fore_diameter,
                    *aft_diameter,
                    *length,
                    current_axial_x,
                    ref_diameter,
                );
                aero_surfaces.push(AeroSurfaceContribution {
                    id: comp.id.clone(),
                    name: comp.name.clone(),
                    kind: "transition".to_string(),
                    cna: res.cna,
                    cp: res.cp,
                    axial_start: current_axial_x,
                    axial_end: current_axial_x + *length,
                });
                last_body_diameter = *aft_diameter;
                current_axial_x += *length;
            }
            Component::TrapezoidFin {
                fin_count,
                root_chord,
                tip_chord,
                span,
                sweep_length,
                axial_offset,
                ..
            } => {
                // Mass validation already failed closed on a present nonfinite
                // offset, so `unwrap_or(0.0)` here matches TS `|| 0` exactly.
                let fin_axial_start =
                    last_body_tube_start + axial_offset.unwrap_or(0.0);
                let res = compute_trapezoid_fin_aero(
                    *fin_count,
                    *root_chord,
                    *tip_chord,
                    *span,
                    *sweep_length,
                    fin_axial_start,
                    last_body_diameter,
                    ref_diameter,
                );
                aero_surfaces.push(AeroSurfaceContribution {
                    id: comp.id.clone(),
                    name: comp.name.clone(),
                    kind: "trapezoidfinset".to_string(),
                    cna: res.cna,
                    cp: res.cp,
                    axial_start: fin_axial_start,
                    axial_end: fin_axial_start + *root_chord,
                });
            }
            Component::EllipticalFin {
                fin_count,
                root_chord,
                span,
                axial_offset,
                ..
            } => {
                let fin_axial_start =
                    last_body_tube_start + axial_offset.unwrap_or(0.0);
                let res = compute_elliptical_fin_aero(
                    *fin_count,
                    *root_chord,
                    *span,
                    fin_axial_start,
                    last_body_diameter,
                    ref_diameter,
                );
                aero_surfaces.push(AeroSurfaceContribution {
                    id: comp.id.clone(),
                    name: comp.name.clone(),
                    kind: "ellipticalfinset".to_string(),
                    cna: res.cna,
                    cp: res.cp,
                    axial_start: fin_axial_start,
                    axial_end: fin_axial_start + *root_chord,
                });
            }
            Component::MassComp { .. }
            | Component::Parachute { .. }
            | Component::Unknown { .. } => {
                // Non-aerodynamic (or unknown — mass already threw) parts
                // contribute no lifting surface.
            }
        }
    }

    // Total CNa and weighted CP: CP = Σ(CNa_i · CP_i) / ΣCNa_i.
    let total_cna: f64 = aero_surfaces.iter().map(|s| s.cna).sum();
    let total_moment: f64 = aero_surfaces.iter().map(|s| s.cna * s.cp).sum();

    let cp = if total_cna.abs() > 0.0001 {
        total_moment / total_cna
    } else {
        // No fins or lifting surfaces: fallback to 2/3 total length.
        (2.0 / 3.0) * mass_rollup.total_length
    };

    let static_margin_calibers = if ref_diameter > 0.0 {
        (cp - mass_rollup.cg) / ref_diameter
    } else {
        0.0
    };
    let is_stable = static_margin_calibers >= 1.0;
    let is_over_stable = static_margin_calibers > 3.0;

    // Unified contribution list (mass chain stations + aero where present).
    let contributions: Vec<ComponentContribution> = vehicle
        .components
        .iter()
        .map(|comp| {
            let mass_data = mass_rollup
                .components
                .iter()
                .find(|m| m.id == comp.id);
            let aero = aero_surfaces.iter().find(|s| s.id == comp.id);
            ComponentContribution {
                id: comp.id.clone(),
                name: comp.name.clone(),
                kind: comp.component.kind_str(),
                mass: mass_data.map_or(0.0, |m| m.mass),
                cg: mass_data.map_or(0.0, |m| m.global_cg),
                cp: aero.map(|a| a.cp),
                cna: aero.map(|a| a.cna),
                axial_start: mass_data.map_or(0.0, |m| m.axial_start),
                axial_end: mass_data.map_or(0.0, |m| m.axial_end),
            }
        })
        .collect();

    Ok(StabilityAnalysis {
        total_length: mass_rollup.total_length,
        max_diameter: mass_rollup.max_diameter,
        reference_diameter: mass_rollup.reference_diameter,
        total_mass: mass_rollup.total_mass,
        cg: mass_rollup.cg,
        cp,
        static_margin_calibers,
        total_cna,
        is_stable,
        is_over_stable,
        contributions,
    })
}

/// Coarse stability API: full Barrowman assembly for a vehicle.
pub fn stability(vehicle: &Vehicle) -> Result<StabilityAnalysis, String> {
    compute_rocket_stability(vehicle)
}

// ---------------------------------------------------------------------------
// Transonic & supersonic drag
// ---------------------------------------------------------------------------

/// Van Driest II compressible turbulent skin friction coefficient (Cf).
///
/// Accounts for turbulent boundary-layer compressibility (adiabatic-wall
/// recovery, `r = 0.89`), Sutherland viscosity scaling with altitude, and the
/// Schlichting sand-grain roughness Reynolds cutoff.
pub fn compute_compressible_skin_friction(
    mach: f64,
    length: f64,
    velocity: f64,
    altitude_asl: f64,
    surface_roughness_microns: f64,
) -> f64 {
    let v = velocity.max(1.0);
    let l = length.max(0.05);

    // Atmospheric properties at altitude.
    let t0 = 288.15;
    let h = altitude_asl.max(0.0);
    let t = (t0 - 0.0065 * h.min(11000.0)).max(216.65);
    let p = 101325.0 * (t / t0).powf(5.2561);
    let rho = p / (287.05 * t);
    let mu = (1.458e-6 * t.powf(1.5)) / (t + 110.4);

    let reynolds = ((rho * v * l) / mu).max(1000.0);

    // Surface roughness Reynolds cutoff (Schlichting sand-grain criteria).
    let ks = (surface_roughness_microns * 1e-6).max(0.1e-6);
    let reynolds_cutoff = 51.0 * (ks / l).powf(-1.039);
    let effective_reynolds = reynolds.min(reynolds_cutoff.max(1000.0));

    // Incompressible turbulent skin friction via Schlichting formula.
    let cf_incompressible = 0.455 / effective_reynolds.log10().powf(2.58);

    // Van Driest II compressibility transformation for adiabatic wall:
    // m = sqrt((γ-1)/2 · M² / (1 + r·(γ-1)/2 · M²)) with r = 0.89.
    let m_term = 0.2 * mach * mach;
    let m_param = (m_term / (1.0 + 0.89 * m_term)).sqrt();
    let fc = if m_param > 0.001 {
        (m_param.asin() / m_param).powi(2)
    } else {
        1.0
    };

    cf_incompressible / fc
}

/// Nosecone wave drag coefficient referenced to body-tube frontal area.
///
/// Subsonic (`mach < 0.8`): negligible 0.005. Transonic: cubic-spline rise
/// to the shape/fineness peak. Supersonic: Ackeret/Taylor-Maccoll
/// `1/sqrt(M²-1)` decay. Shape branches: von Kármán 0.55 (Sears-Haack
/// minimum), ogive 0.72, parabolic 0.85, conical (and anything else,
/// including elliptical) 1.25.
pub fn compute_nosecone_wave_drag(
    shape: NoseShape,
    length: f64,
    base_diameter: f64,
    mach: f64,
) -> f64 {
    if mach < 0.8 {
        return 0.005;
    }

    let fineness_ratio = length / base_diameter.max(0.01);
    let inv_fineness_sq = 1.0 / fineness_ratio.powi(2);

    let shape_factor = match shape {
        NoseShape::VonKarman => 0.55,
        NoseShape::Ogive => 0.72,
        NoseShape::Parabolic => 0.85,
        NoseShape::Conical | NoseShape::Elliptical => 1.25,
    };

    if (0.8..=1.1).contains(&mach) {
        // Transonic cubic spline rise.
        let t = (mach - 0.8) / 0.3;
        let peak_cd = shape_factor * inv_fineness_sq * 0.9;
        return 0.005 + peak_cd * (3.0 * t * t - 2.0 * t * t * t);
    }

    // Supersonic decaying wave drag: Cd_wave ~ 1 / sqrt(M^2 - 1).
    let mach_factor = 1.0 / (mach * mach - 1.0).max(0.1).sqrt();
    (shape_factor * inv_fineness_sq * 0.8 * mach_factor + 0.02).min(1.2)
}

/// Fin leading-edge wave drag from airfoil thickness and planform.
///
/// Cross-section branches: rounded 6.0 (default), double-wedge 4.0,
/// airfoil 4.8, square 9.0. Transonic cubic rise, supersonic Ackeret
/// `4·(t/c)²/sqrt(M²-1)` scaled by fin/reference area ratio.
#[allow(clippy::too_many_arguments)]
pub fn compute_fin_wave_drag(
    fin_count: i32,
    root_chord: f64,
    tip_chord: f64,
    span: f64,
    thickness: f64,
    cross_section: FinCrossSection,
    mach: f64,
    ref_area: f64,
) -> f64 {
    if mach < 0.8 {
        return 0.0;
    }

    let fin_area = 0.5 * (root_chord + tip_chord) * span * f64::from(fin_count);
    let area_ratio = fin_area / ref_area.max(0.0001);
    let t_over_c = thickness / root_chord.max(0.01);

    let cross_section_factor = match cross_section {
        FinCrossSection::DoubleWedge => 4.0,
        FinCrossSection::Airfoil => 4.8,
        FinCrossSection::Square => 9.0,
        FinCrossSection::Rounded => 6.0,
    };

    if (0.8..=1.1).contains(&mach) {
        let t = (mach - 0.8) / 0.3;
        let peak = cross_section_factor * t_over_c.powi(2) * area_ratio * 0.4;
        return peak * (3.0 * t * t - 2.0 * t * t * t);
    }

    // Supersonic Ackeret formula for 2D airfoils.
    let mach_factor = 1.0 / (mach * mach - 1.0).max(0.1).sqrt();
    (cross_section_factor * t_over_c.powi(2) * area_ratio * mach_factor).min(0.8)
}

/// Base drag coefficient with motor power-on plume and boattail reduction.
///
/// Subsonic quadratic rise, C1-continuous transonic spline peaking at
/// Cd = 0.38 at M = 1.0, supersonic `0.38/M^1.2` decay; motor plume cuts
/// ~62% during burn; boattail scales by `(base/body)²`.
pub fn compute_base_drag(
    mach: f64,
    base_diameter: f64,
    body_diameter: f64,
    is_motor_burning: bool,
) -> f64 {
    let boattail_factor = (base_diameter / body_diameter.max(0.01)).powi(2);

    let base_cd = if mach < 0.8 {
        0.12 + 0.13 * mach.powi(2)
    } else if (0.8..=1.2).contains(&mach) {
        // Smooth C1 transition across the transonic barrier peaking at M=1.0.
        let cd08 = 0.12 + 0.13 * 0.64; // 0.2032
        let cd12 = 0.38 / 1.2_f64.powf(1.2); // ~0.306
        let peak_cd = 0.38;
        if mach <= 1.0 {
            let t = (mach - 0.8) / 0.2;
            cd08 + (peak_cd - cd08) * (3.0 * t * t - 2.0 * t * t * t)
        } else {
            let t = (mach - 1.0) / 0.2;
            peak_cd - (peak_cd - cd12) * (3.0 * t * t - 2.0 * t * t * t)
        }
    } else {
        // Supersonic expansion base pressure drop.
        0.38 / mach.powf(1.2)
    };

    // Motor plume power-on effect: ~62% drop during burn.
    let plume_reduction = if is_motor_burning { 0.38 } else { 1.0 };

    base_cd * boattail_factor * plume_reduction
}

/// One Mach station of the drag/CP breakdown (mirrors TS `DragBreakdown`;
/// `protuberance_cd` is 0 by default — the vehicle model carries no
/// protuberance geometry yet, so totals are unchanged).
#[derive(Debug, Clone)]
pub struct DragBreakdown {
    pub mach: f64,
    pub total_cd: f64,
    pub friction_cd: f64,
    pub wave_cd: f64,
    pub base_cd: f64,
    pub protuberance_cd: f64,
    /// Meters from nose tip.
    pub cp: f64,
    pub static_margin_calibers: f64,
}

/// Complete high-Mach drag breakdown + CP curve (mirrors TS
/// `AeroCurveResult`).
#[derive(Debug, Clone)]
pub struct AeroCurveResult {
    pub mach_points: Vec<f64>,
    pub drag_curves: Vec<DragBreakdown>,
    pub max_transonic_cd: f64,
    pub mach_at_max_cd: f64,
    pub subsonic_cd: f64,
    pub supersonic_cd_mach2: f64,
}

/// Complete high-Mach drag breakdown and CP curve from M = 0 to M = 4.0.
///
/// Subsonic baseline comes from Barrowman; skin friction is Van Driest II
/// over the wetted area; wave drag covers the (first) nosecone and the
/// (first) trapezoid fin set; base drag carries plume + boattail; above
/// M = 1 the fin lift-slope degradation shifts CP forward up to 0.8
/// calibers.
pub fn compute_aerodynamic_curves(
    vehicle: &Vehicle,
    is_motor_burning: bool,
    mach_points_count: usize,
) -> Result<AeroCurveResult, String> {
    let mass_rollup = aggregate_mass_rollup(vehicle)?;
    let total_length = mass_rollup.total_length;
    let ref_diameter = mass_rollup.reference_diameter;
    let ref_area = (PI / 4.0) * ref_diameter.powi(2);

    // Subsonic baseline from Barrowman.
    let subsonic_stability = compute_rocket_stability(vehicle)?;
    let subsonic_cp = subsonic_stability.cp;
    // Wetted area approximation for skin friction.
    let wetted_area = PI * ref_diameter * total_length * 1.15;

    let nose = vehicle.components.iter().find_map(|c| match &c.component {
        Component::Nosecone {
            shape,
            length,
            base_diameter,
            ..
        } => Some((*shape, *length, *base_diameter)),
        _ => None,
    });
    let fins = vehicle.components.iter().find_map(|c| match &c.component {
        Component::TrapezoidFin {
            fin_count,
            root_chord,
            tip_chord,
            span,
            thickness,
            cross_section,
            ..
        } => Some((
            *fin_count,
            *root_chord,
            *tip_chord,
            *span,
            *thickness,
            *cross_section,
        )),
        _ => None,
    });
    let aft_transition = vehicle
        .components
        .iter()
        .rev()
        .find_map(|c| match &c.component {
            Component::Transition { aft_diameter, .. } => Some(*aft_diameter),
            _ => None,
        });
    let base_diameter = aft_transition.unwrap_or(ref_diameter);

    let mut mach_points: Vec<f64> = Vec::with_capacity(mach_points_count);
    let mut drag_curves: Vec<DragBreakdown> = Vec::with_capacity(mach_points_count);

    let mut max_transonic_cd = 0.0;
    let mut mach_at_max_cd = 1.0;

    for i in 0..mach_points_count {
        // Mirror TS exactly (`(i / (count - 1)) * 4.0`, IEEE division).
        let mach = (i as f64 / (mach_points_count as f64 - 1.0)) * 4.0;
        mach_points.push(mach);

        let velocity = (mach * SPEED_OF_SOUND_SL).max(10.0);

        // 1. Compressible skin friction drag.
        let cf = compute_compressible_skin_friction(mach, total_length, velocity, 0.0, 5.0);
        let friction_cd = cf * (wetted_area / ref_area.max(0.0001));

        // 2. Wave drag (nosecone + fins).
        let mut wave_cd = 0.0;
        if let Some((shape, length, base)) = nose {
            wave_cd += compute_nosecone_wave_drag(shape, length, base, mach);
        }
        if let Some((count, root, tip, span, thick, xs)) = fins {
            wave_cd +=
                compute_fin_wave_drag(count, root, tip, span, thick, xs, mach, ref_area);
        }

        // 3. Base drag (with plume and boattail).
        let base_cd = compute_base_drag(mach, base_diameter, ref_diameter, is_motor_burning);

        // 4. Protuberance parasitic drag (Hoerner model): 0 by default.
        let protuberance_cd = 0.0;

        // Total drag coefficient.
        let total_cd = (friction_cd + wave_cd + base_cd + protuberance_cd).max(0.15);

        if total_cd > max_transonic_cd {
            max_transonic_cd = total_cd;
            mach_at_max_cd = mach;
        }

        // 5. Supersonic center-of-pressure migration: fin lift slope degrades
        // as 1/sqrt(M²-1), shifting whole-rocket CP forward toward the nose.
        let mut cp = subsonic_cp;
        if mach > 1.0 {
            let shift_calibers =
                (0.45 * (1.0 - 1.0 / (mach * mach).sqrt())).min(0.8);
            cp = (subsonic_cp - shift_calibers * ref_diameter).max(0.1);
        }

        let static_margin_calibers = if ref_diameter > 0.0 {
            (cp - mass_rollup.cg) / ref_diameter
        } else {
            0.0
        };

        drag_curves.push(DragBreakdown {
            mach,
            total_cd,
            friction_cd,
            wave_cd,
            base_cd,
            protuberance_cd,
            cp,
            static_margin_calibers,
        });
    }

    let subsonic_cd = drag_curves.first().map_or(0.35, |d| d.total_cd);
    let supersonic_cd_mach2 = drag_curves
        .iter()
        .find(|d| (d.mach - 2.0).abs() < 0.1)
        .map_or(0.45, |d| d.total_cd);

    Ok(AeroCurveResult {
        mach_points,
        drag_curves,
        max_transonic_cd,
        mach_at_max_cd,
        subsonic_cd,
        supersonic_cd_mach2,
    })
}

/// Coarse drag-curve API: Mach 0–4 breakdown with the default 41 stations.
pub fn aero_curves(
    vehicle: &Vehicle,
    motor_burning: bool,
) -> Result<AeroCurveResult, String> {
    compute_aerodynamic_curves(vehicle, motor_burning, 41)
}

// ---------------------------------------------------------------------------
// Parity tests vs the TS oracles (anchors extracted with `node -e`
// one-liners against the TS sources; never hand-invented).
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 1e-9 relative assert for Barrowman anchors (exact f64 mirrors).
    fn assert_rel(got: f64, want: f64) {
        if want == 0.0 {
            assert!(
                got.abs() <= 1e-12,
                "got {got} want {want} (abs err exceeds 1e-12)"
            );
            return;
        }
        let rel = ((got - want) / want.abs()).abs();
        assert!(
            rel <= 1e-9,
            "got {got} want {want} (rel err {rel} > 1e-9)"
        );
    }

    /// 0.5% relative assert for transonic anchors (documented band).
    fn assert_transonic(got: f64, want: f64) {
        if want == 0.0 {
            assert!(
                got.abs() <= 1e-12,
                "got {got} want {want} (abs err exceeds 1e-12)"
            );
            return;
        }
        let rel = ((got - want) / want.abs()).abs();
        assert!(
            rel <= 5e-3,
            "got {got} want {want} (rel err {rel} > 0.5%)"
        );
    }

    fn vc(
        id: &str,
        name: &str,
        material_id: &str,
        component: Component,
    ) -> VehicleComponent {
        VehicleComponent {
            id: id.to_string(),
            name: name.to_string(),
            material_id: material_id.to_string(),
            component,
        }
    }

    /// Mirrors the `testRocket` in `src/aero/barrowman.test.ts`.
    fn alpha_vehicle() -> Vehicle {
        Vehicle {
            components: vec![
                vc(
                    "nc",
                    "Ogive Nosecone",
                    "pla_3dprint",
                    Component::Nosecone {
                        shape: NoseShape::Ogive,
                        length: 0.15,
                        base_diameter: 0.04,
                        wall_thickness: 0.002,
                        is_hollow: true,
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "bt",
                    "Main Body Tube",
                    "cardboard",
                    Component::BodyTube {
                        length: 0.45,
                        outer_diameter: 0.04,
                        inner_diameter: Some(0.038),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "fins",
                    "Trapezoidal Fins",
                    "balsa",
                    Component::TrapezoidFin {
                        fin_count: 3,
                        root_chord: 0.08,
                        tip_chord: 0.03,
                        span: 0.06,
                        sweep_length: 0.03,
                        thickness: 0.0025,
                        cross_section: FinCrossSection::Rounded,
                        axial_offset: Some(0.37),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
            ],
        }
    }

    /// Mirrors `PRESET_NASA_STUDENT_LAUNCH` in `src/store/rocketStore.ts`.
    fn nsl_vehicle() -> Vehicle {
        Vehicle {
            components: vec![
                vc(
                    "nsl-nc",
                    "Von Karman Nosecone",
                    "fiberglass",
                    Component::Nosecone {
                        shape: NoseShape::VonKarman,
                        length: 0.65,
                        base_diameter: 0.152,
                        wall_thickness: 0.0035,
                        is_hollow: true,
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "nsl-bt1",
                    "Payload & Avionics Bay",
                    "fiberglass",
                    Component::BodyTube {
                        length: 0.75,
                        outer_diameter: 0.152,
                        inner_diameter: Some(0.145),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "nsl-trans",
                    "Airframe Transition",
                    "aluminum",
                    Component::Transition {
                        length: 0.12,
                        fore_diameter: 0.152,
                        aft_diameter: 0.152,
                        wall_thickness: 0.003,
                        is_hollow: true,
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "nsl-bt2",
                    "Booster & Motor Section",
                    "fiberglass",
                    Component::BodyTube {
                        length: 1.45,
                        outer_diameter: 0.152,
                        inner_diameter: Some(0.145),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "nsl-fins",
                    "High-Power Clipped Delta Fins",
                    "carbonfiber",
                    Component::TrapezoidFin {
                        fin_count: 4,
                        root_chord: 0.32,
                        tip_chord: 0.12,
                        span: 0.18,
                        sweep_length: 0.18,
                        thickness: 0.0048,
                        cross_section: FinCrossSection::Airfoil,
                        axial_offset: Some(1.10),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "nsl-drogue",
                    "Drogue Parachute (Apogee)",
                    "cardboard",
                    Component::Parachute {
                        mass: 0.18,
                        diameter: 0.60,
                        cd: 1.2,
                        axial_offset: Some(0.20),
                    },
                ),
                vc(
                    "nsl-main",
                    "Main Parachute (700ft AGL)",
                    "cardboard",
                    Component::Parachute {
                        mass: 0.75,
                        diameter: 2.40,
                        cd: 1.5,
                        axial_offset: Some(0.85),
                    },
                ),
            ],
        }
    }

    // -- Nosecone CP formulas (barrowman.test.ts: conical 2/3, ogive 0.466,
    // parabolic / von Karman 0.5; oracle adds elliptical 1/3) --------------

    #[test]
    fn nosecone_cp_shapes_match_oracle() {
        // Oracle anchors: node-computed computeNoseconeCP(shape, 0.3).
        assert_rel(compute_nosecone_cp(NoseShape::Conical, 0.3), 0.19999999999999998);
        assert_rel(compute_nosecone_cp(NoseShape::Ogive, 0.3), 0.1398);
        assert_rel(compute_nosecone_cp(NoseShape::Parabolic, 0.3), 0.15);
        assert_rel(compute_nosecone_cp(NoseShape::VonKarman, 0.3), 0.15);
        assert_rel(compute_nosecone_cp(NoseShape::Elliptical, 0.3), 0.09999999999999999);
        assert_rel(
            compute_nosecone_cp(NoseShape::Conical, 0.65),
            0.43333333333333335,
        );
    }

    // -- Transition aero -----------------------------------------------

    #[test]
    fn transition_aero_matches_oracle() {
        // Shoulder (expanding): fore 0.04, aft 0.06, L 0.1 @ x=0.5, ref 0.04.
        let s = compute_transition_aero(0.04, 0.06, 0.1, 0.5, 0.04);
        assert_rel(s.cna, 2.5);
        assert_rel(s.cp, 0.5533333333333333);
        // Boattail (contracting): fore 0.152, aft 0.1, L 0.2 @ x=1.0.
        let b = compute_transition_aero(0.152, 0.1, 0.2, 1.0, 0.152);
        assert_rel(b.cna, -1.134349030470914);
        assert_rel(b.cp, 1.0931216931216932);
        // Cylindrical (no diameter change): zero CNa, mid-length CP.
        let c = compute_transition_aero(0.152, 0.152, 0.12, 0.75, 0.152);
        assert_rel(c.cna, 0.0);
        assert_rel(c.cp, 0.81);
    }

    // -- Trapezoid fin aero (barrowman.test.ts anchor vehicle) ---------

    #[test]
    fn trapezoid_fin_aero_matches_oracle() {
        // barrowman.test.ts fin: 4x root 0.15 / tip 0.05 / span 0.08 /
        // sweep 0.04 @ x=0.6, body/ref 0.05.
        let r = compute_trapezoid_fin_aero(4, 0.15, 0.05, 0.08, 0.04, 0.6, 0.05, 0.05);
        assert_rel(r.cna, 20.787231115612837);
        assert_rel(r.cp, 0.6475806451612902);
        // CP sits on the fin (aft of LE, fwd of trailing edge).
        assert!(r.cna > 0.0);
        assert!(r.cp > 0.6 && r.cp < 0.6 + 0.15);
        // Alpha-vehicle fins: 3x root 0.08 / tip 0.03 / span 0.06 /
        // sweep 0.03 @ x=0.52.
        let a = compute_trapezoid_fin_aero(3, 0.08, 0.03, 0.06, 0.03, 0.52, 0.04, 0.04);
        assert_rel(a.cna, 12.81220086077251);
        assert_rel(a.cp, 0.5488535353535354);
        // NSL high-power fins: 4x root 0.32 / tip 0.12 / span 0.18 /
        // sweep 0.18 @ x=2.5.
        let n = compute_trapezoid_fin_aero(4, 0.32, 0.12, 0.18, 0.18, 2.5, 0.152, 0.152);
        assert_rel(n.cna, 11.990945166157932);
        assert_rel(n.cp, 2.636799762329174);
    }

    // -- Elliptical fin aero -------------------------------------------

    #[test]
    fn elliptical_fin_aero_matches_oracle() {
        let e = compute_elliptical_fin_aero(3, 0.1, 0.07, 0.5, 0.05, 0.05);
        assert_rel(e.cna, 10.09975990348629);
        assert_rel(e.cp, 0.5428824701995907);
    }

    // -- Whole-vehicle stability ---------------------------------------

    #[test]
    fn stability_alpha_matches_oracle() {
        // barrowman.test.ts: 600 mm vehicle, CP aft of CG, margin >= 1.
        let s = stability(&alpha_vehicle()).unwrap();
        assert_rel(s.total_length, 0.6);
        assert_rel(s.max_diameter, 0.04);
        assert_rel(s.reference_diameter, 0.04);
        assert_rel(s.total_mass, 0.06841982638488608);
        assert_rel(s.cg, 0.26389786468261806);
        assert_rel(s.cp, 0.4841833975589611);
        assert_rel(s.static_margin_calibers, 5.5071383219085766);
        assert_rel(s.total_cna, 14.81220086077251);
        assert!(s.cp > s.cg);
        assert!(s.is_stable);
        assert!(s.is_over_stable);
        assert_eq!(s.contributions.len(), 3);
    }

    #[test]
    fn stability_finless_guards_division_by_zero() {
        // barrowman.test.ts finless rocket: finite CP and margin.
        let v = Vehicle {
            components: vec![
                vc(
                    "nc",
                    "Ogive Nosecone",
                    "pla_3dprint",
                    Component::Nosecone {
                        shape: NoseShape::Ogive,
                        length: 0.15,
                        base_diameter: 0.04,
                        wall_thickness: 0.002,
                        is_hollow: true,
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "bt",
                    "Body Tube",
                    "cardboard",
                    Component::BodyTube {
                        length: 0.45,
                        outer_diameter: 0.04,
                        inner_diameter: Some(0.038),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
            ],
        };
        let s = stability(&v).unwrap();
        assert!(s.cp.is_finite());
        assert!(s.static_margin_calibers.is_finite());
        assert_rel(s.total_mass, 0.06445982638488608);
        assert_rel(s.cg, 0.24557692709886852);
        assert_rel(s.cp, 0.0699);
        assert_rel(s.static_margin_calibers, -4.391923177471712);
        assert_rel(s.total_cna, 2.0);
        assert!(!s.is_stable);
    }

    #[test]
    fn stability_tube_only_uses_two_thirds_fallback() {
        // No lifting surfaces at all: ΣCNa = 0 → CP = 2/3 · L.
        let v = Vehicle {
            components: vec![vc(
                "bt",
                "b",
                "cardboard",
                Component::BodyTube {
                    length: 0.5,
                    outer_diameter: 0.05,
                    inner_diameter: Some(0.048),
                    mass_override: None,
                    cg_override: None,
                },
            )],
        };
        let s = stability(&v).unwrap();
        assert_rel(s.total_cna, 0.0);
        assert_rel(s.cp, 0.3333333333333333);
        assert_rel(s.static_margin_calibers, 1.6666666666666663);
    }

    #[test]
    fn stability_boattail_matches_oracle() {
        // Contracting transition contributes negative CNa.
        let v = Vehicle {
            components: vec![
                vc(
                    "nc",
                    "n",
                    "pla_3dprint",
                    Component::Nosecone {
                        shape: NoseShape::Conical,
                        length: 0.2,
                        base_diameter: 0.06,
                        wall_thickness: 0.002,
                        is_hollow: false,
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "bt1",
                    "b",
                    "cardboard",
                    Component::BodyTube {
                        length: 0.4,
                        outer_diameter: 0.06,
                        inner_diameter: Some(0.058),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "tr",
                    "t",
                    "cardboard",
                    Component::Transition {
                        length: 0.1,
                        fore_diameter: 0.06,
                        aft_diameter: 0.04,
                        wall_thickness: 0.002,
                        is_hollow: false,
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "fins",
                    "f",
                    "balsa",
                    Component::TrapezoidFin {
                        fin_count: 4,
                        root_chord: 0.1,
                        tip_chord: 0.05,
                        span: 0.06,
                        sweep_length: 0.03,
                        thickness: 0.003,
                        cross_section: FinCrossSection::Rounded,
                        axial_offset: Some(0.3),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
            ],
        };
        let s = stability(&v).unwrap();
        assert_rel(s.total_cna, 9.147693239199372);
        assert_rel(s.cp, 0.43345124980363564);
        assert_rel(s.static_margin_calibers, 1.5132111450929835);
        assert!(s.is_stable);
        assert!(!s.is_over_stable);
    }

    #[test]
    fn stability_elliptical_vehicle_matches_oracle() {
        let v = Vehicle {
            components: vec![
                vc(
                    "nc",
                    "n",
                    "pla_3dprint",
                    Component::Nosecone {
                        shape: NoseShape::Ogive,
                        length: 0.15,
                        base_diameter: 0.04,
                        wall_thickness: 0.002,
                        is_hollow: true,
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "bt",
                    "b",
                    "cardboard",
                    Component::BodyTube {
                        length: 0.45,
                        outer_diameter: 0.04,
                        inner_diameter: Some(0.038),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "fins",
                    "f",
                    "balsa",
                    Component::EllipticalFin {
                        fin_count: 3,
                        root_chord: 0.08,
                        span: 0.06,
                        thickness: 0.0025,
                        axial_offset: Some(0.37),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
            ],
        };
        let s = stability(&v).unwrap();
        assert_rel(s.total_mass, 0.06898371980605539);
        assert_rel(s.cg, 0.26579997013042206);
        assert_rel(s.cp, 0.48022751051150425);
        assert_rel(s.static_margin_calibers, 5.360688509527055);
        assert_rel(s.total_cna, 13.079945554002808);
    }

    #[test]
    fn stability_nsl_matches_oracle() {
        let s = stability(&nsl_vehicle()).unwrap();
        assert_rel(s.total_length, 2.9699999999999998);
        assert_rel(s.max_diameter, 0.152);
        assert_rel(s.reference_diameter, 0.152);
        assert_rel(s.total_mass, 10.34788500549315);
        assert_rel(s.cg, 1.7972237541913614);
        assert_rel(s.cp, 2.409174961652899);
        assert_rel(s.static_margin_calibers, 4.025994785931167);
        assert_rel(s.total_cna, 13.990945166157932);
        assert!(s.is_stable);
        assert_eq!(s.contributions.len(), 7);
    }

    // -- Fail-closed geometry (exact TS-equivalent messages) -----------

    fn expect_err(vehicle: Vehicle, want: &str) {
        let err = stability(&vehicle).unwrap_err();
        assert_eq!(err, want, "wrong fail-closed message");
    }

    #[test]
    fn stability_fails_closed_with_oracle_messages() {
        // Empty vehicle.
        expect_err(
            Vehicle { components: vec![] },
            "vehicle geometry: vehicle has no components — mass rollup is undefined",
        );
        // Duplicate ids.
        let tube = |id: &str| {
            vc(
                id,
                id,
                "cardboard",
                Component::BodyTube {
                    length: 0.4,
                    outer_diameter: 0.05,
                    inner_diameter: Some(0.048),
                    mass_override: None,
                    cg_override: None,
                },
            )
        };
        expect_err(
            Vehicle {
                components: vec![tube("a"), tube("a")],
            },
            "vehicle geometry: duplicate component id 'a'",
        );
        // Unknown material.
        expect_err(
            Vehicle {
                components: vec![vc(
                    "a",
                    "a",
                    "unobtanium",
                    Component::BodyTube {
                        length: 0.4,
                        outer_diameter: 0.05,
                        inner_diameter: Some(0.048),
                        mass_override: None,
                        cg_override: None,
                    },
                )],
            },
            "vehicle geometry: unknown materialId 'unobtanium' (known: cardboard, fiberglass, carbonfiber, balsa, plywood, aluminum, pla_3dprint, abs_3dprint, petg_3dprint)",
        );
        // Unknown component type.
        expect_err(
            Vehicle {
                components: vec![vc(
                    "a",
                    "a",
                    "cardboard",
                    Component::Unknown {
                        kind: "warpdrive".to_string(),
                    },
                )],
            },
            "vehicle geometry: unknown component type 'warpdrive' (id 'a')",
        );
        // Zero / NaN nosecone length.
        let nose = |length: f64| {
            vc(
                "nc",
                "n",
                "pla_3dprint",
                Component::Nosecone {
                    shape: NoseShape::Ogive,
                    length,
                    base_diameter: 0.04,
                    wall_thickness: 0.002,
                    is_hollow: false,
                    mass_override: None,
                    cg_override: None,
                },
            )
        };
        expect_err(
            Vehicle {
                components: vec![nose(0.0)],
            },
            "vehicle geometry: nosecone length must be finite and positive (got 0)",
        );
        expect_err(
            Vehicle {
                components: vec![nose(f64::NAN)],
            },
            "vehicle geometry: nosecone length must be finite and positive (got NaN)",
        );
        // Degenerate fin count.
        expect_err(
            Vehicle {
                components: vec![
                    nose(0.15),
                    vc(
                        "bt",
                        "b",
                        "cardboard",
                        Component::BodyTube {
                            length: 0.4,
                            outer_diameter: 0.04,
                            inner_diameter: Some(0.038),
                            mass_override: None,
                            cg_override: None,
                        },
                    ),
                    vc(
                        "f",
                        "f",
                        "balsa",
                        Component::TrapezoidFin {
                            fin_count: 0,
                            root_chord: 0.08,
                            tip_chord: 0.03,
                            span: 0.06,
                            sweep_length: 0.03,
                            thickness: 0.0025,
                            cross_section: FinCrossSection::Rounded,
                            axial_offset: Some(0.3),
                            mass_override: None,
                            cg_override: None,
                        },
                    ),
                ],
            },
            "vehicle geometry: finCount must be a positive integer (got 0)",
        );
        // NaN axial offset fails closed (never hides behind `|| 0`).
        expect_err(
            Vehicle {
                components: vec![
                    nose(0.15),
                    vc(
                        "bt",
                        "b",
                        "cardboard",
                        Component::BodyTube {
                            length: 0.4,
                            outer_diameter: 0.04,
                            inner_diameter: Some(0.038),
                            mass_override: None,
                            cg_override: None,
                        },
                    ),
                    vc(
                        "f",
                        "f",
                        "balsa",
                        Component::TrapezoidFin {
                            fin_count: 3,
                            root_chord: 0.08,
                            tip_chord: 0.03,
                            span: 0.06,
                            sweep_length: 0.03,
                            thickness: 0.0025,
                            cross_section: FinCrossSection::Rounded,
                            axial_offset: Some(f64::NAN),
                            mass_override: None,
                            cg_override: None,
                        },
                    ),
                ],
            },
            "vehicle geometry: component 'f' axialOffset must be finite (got NaN)",
        );
        // Through-wall body tube.
        expect_err(
            Vehicle {
                components: vec![vc(
                    "bt",
                    "b",
                    "cardboard",
                    Component::BodyTube {
                        length: 0.4,
                        outer_diameter: 0.05,
                        inner_diameter: Some(0.06),
                        mass_override: None,
                        cg_override: None,
                    },
                )],
            },
            "vehicle geometry: bodytube innerDiameter must leave positive wall (got 0.06 vs outer 0.05)",
        );
        // Negative fin tip chord.
        expect_err(
            Vehicle {
                components: vec![
                    nose(0.15),
                    vc(
                        "bt",
                        "b",
                        "cardboard",
                        Component::BodyTube {
                            length: 0.4,
                            outer_diameter: 0.04,
                            inner_diameter: Some(0.038),
                            mass_override: None,
                            cg_override: None,
                        },
                    ),
                    vc(
                        "f",
                        "f",
                        "balsa",
                        Component::TrapezoidFin {
                            fin_count: 3,
                            root_chord: 0.08,
                            tip_chord: -0.01,
                            span: 0.06,
                            sweep_length: 0.03,
                            thickness: 0.0025,
                            cross_section: FinCrossSection::Rounded,
                            axial_offset: Some(0.3),
                            mass_override: None,
                            cg_override: None,
                        },
                    ),
                ],
            },
            "vehicle geometry: fin tipChord must be finite and nonnegative (got -0.01)",
        );
        // Transition with no positive diameter.
        expect_err(
            Vehicle {
                components: vec![vc(
                    "t",
                    "t",
                    "cardboard",
                    Component::Transition {
                        length: 0.1,
                        fore_diameter: 0.0,
                        aft_diameter: 0.0,
                        wall_thickness: 0.002,
                        is_hollow: false,
                        mass_override: None,
                        cg_override: None,
                    },
                )],
            },
            "vehicle geometry: transition needs a positive diameter",
        );
    }

    // -- Van Driest II skin friction (transonicAero.test.ts) -----------

    #[test]
    fn skin_friction_matches_oracle() {
        // transonicAero.test.ts: compressibility lowers Cf; thin high-alt
        // air (lower Reynolds) raises it.
        let sub = compute_compressible_skin_friction(0.2, 0.5, 68.0, 0.0, 5.0);
        let sup = compute_compressible_skin_friction(2.0, 0.5, 680.0, 0.0, 5.0);
        assert_transonic(sub, 0.0038257875268377);
        assert_transonic(sup, 0.0025688976919247437);
        assert!(sub > 0.002);
        assert!(sup < sub);
        let high = compute_compressible_skin_friction(1.5, 1.0, 500.0, 8000.0, 0.1);
        let sea = compute_compressible_skin_friction(1.5, 1.0, 500.0, 0.0, 0.1);
        assert_transonic(high, 0.002439796290547939);
        assert_transonic(sea, 0.0021978218130430465);
        assert!(high > sea);
    }

    // -- Nosecone wave drag --------------------------------------------

    #[test]
    fn nosecone_wave_drag_matches_oracle() {
        // Subsonic floor.
        assert_transonic(
            compute_nosecone_wave_drag(NoseShape::VonKarman, 0.5, 0.1, 0.5),
            0.005,
        );
        // M = 1.0 anchors (L 0.5, D 0.1, fineness 5).
        assert_transonic(
            compute_nosecone_wave_drag(NoseShape::VonKarman, 0.5, 0.1, 1.0),
            0.019666666666666666,
        );
        assert_transonic(
            compute_nosecone_wave_drag(NoseShape::Conical, 0.5, 0.1, 1.0),
            0.03833333333333333,
        );
        assert_transonic(
            compute_nosecone_wave_drag(NoseShape::Ogive, 0.5, 0.1, 1.0),
            0.024199999999999996,
        );
        assert_transonic(
            compute_nosecone_wave_drag(NoseShape::Parabolic, 0.5, 0.1, 1.0),
            0.027666666666666666,
        );
        // M = 2.0 anchors.
        assert_transonic(
            compute_nosecone_wave_drag(NoseShape::VonKarman, 0.5, 0.1, 2.0),
            0.030161364737737416,
        );
        assert_transonic(
            compute_nosecone_wave_drag(NoseShape::Conical, 0.5, 0.1, 2.0),
            0.04309401076758504,
        );
        assert_transonic(
            compute_nosecone_wave_drag(NoseShape::Ogive, 0.5, 0.1, 2.0),
            0.03330215020212898,
        );
        assert_transonic(
            compute_nosecone_wave_drag(NoseShape::Parabolic, 0.5, 0.1, 2.0),
            0.035703927321957825,
        );
        // transonicAero.test.ts: Von Karman beats conical at Mach 2.
        let vk = compute_nosecone_wave_drag(NoseShape::VonKarman, 0.5, 0.1, 2.0);
        let cone = compute_nosecone_wave_drag(NoseShape::Conical, 0.5, 0.1, 2.0);
        assert!(vk < cone);
    }

    // -- Fin wave drag -------------------------------------------------

    #[test]
    fn fin_wave_drag_matches_oracle() {
        let ref_area = PI / 4.0 * 0.05 * 0.05;
        // Subsonic: no wave drag.
        assert_transonic(
            compute_fin_wave_drag(
                4,
                0.15,
                0.05,
                0.08,
                0.003,
                FinCrossSection::Square,
                0.5,
                ref_area,
            ),
            0.0,
        );
        // Square section anchors.
        assert_transonic(
            compute_fin_wave_drag(
                4,
                0.15,
                0.05,
                0.08,
                0.003,
                FinCrossSection::Square,
                1.0,
                ref_area,
            ),
            0.017383963917450753,
        );
        assert_transonic(
            compute_fin_wave_drag(
                4,
                0.15,
                0.05,
                0.08,
                0.003,
                FinCrossSection::Square,
                2.0,
                ref_area,
            ),
            0.03387364733471491,
        );
        // Section branches at M = 2 (thinner shock loss for the wedge).
        assert_transonic(
            compute_fin_wave_drag(
                4,
                0.15,
                0.05,
                0.08,
                0.003,
                FinCrossSection::DoubleWedge,
                2.0,
                ref_area,
            ),
            0.015054954370984405,
        );
        assert_transonic(
            compute_fin_wave_drag(
                4,
                0.15,
                0.05,
                0.08,
                0.003,
                FinCrossSection::Airfoil,
                2.0,
                ref_area,
            ),
            0.018065945245181285,
        );
    }

    // -- Base drag (transonicAero.test.ts) -----------------------------

    #[test]
    fn base_drag_matches_oracle() {
        // Peak at Mach 1.0; C1-continuous falloff either side.
        assert_transonic(compute_base_drag(1.0, 0.05, 0.05, false), 0.38);
        assert_transonic(compute_base_drag(2.0, 0.05, 0.05, false), 0.1654046070262636);
        let peak = compute_base_drag(1.0, 0.05, 0.05, false);
        assert!(compute_base_drag(0.9, 0.05, 0.05, false) < peak);
        assert!(compute_base_drag(1.1, 0.05, 0.05, false) < peak);
        // Power-on plume: ~62% drop during burn.
        let off = compute_base_drag(1.5, 0.05, 0.05, false);
        let on = compute_base_drag(1.5, 0.05, 0.05, true);
        assert_transonic(on, 0.08876825494530766);
        assert!(on < off * 0.5);
        // Boattail reduction (base 0.1 on body 0.152).
        assert_transonic(
            compute_base_drag(1.5, 0.1, 0.152, false),
            0.10110832362738245,
        );
    }

    // -- Full Mach curves (transonicAero.test.ts) ----------------------

    #[test]
    fn aero_curves_nsl_match_oracle() {
        // transonicAero.test.ts uses 21 points; the default coarse API uses 41.
        let c21 = compute_aerodynamic_curves(&nsl_vehicle(), false, 21).unwrap();
        assert_eq!(c21.drag_curves.len(), 21);
        assert_transonic(c21.max_transonic_cd, 0.6061411780693076);
        assert_transonic(c21.mach_at_max_cd, 1.0);
        assert_transonic(c21.subsonic_cd, 0.47812384222069065);
        assert_transonic(c21.supersonic_cd_mach2, 0.37850690107567664);
        // Transonic drag rise + Mach of peak inside the barrier band.
        assert!(c21.max_transonic_cd > c21.subsonic_cd);
        assert!(c21.mach_at_max_cd >= 0.9 && c21.mach_at_max_cd <= 1.3);

        let c41 = aero_curves(&nsl_vehicle(), false).unwrap();
        assert_eq!(c41.mach_points.len(), 41);
        assert_eq!(c41.drag_curves.len(), 41);
        assert_transonic(c41.mach_points[0], 0.0);
        assert_transonic(c41.mach_points[40], 4.0);
        assert_transonic(c41.max_transonic_cd, 0.6061411780693076);
        assert_transonic(c41.mach_at_max_cd, 1.0);
        assert_transonic(c41.subsonic_cd, 0.47812384222069065);
        assert_transonic(c41.supersonic_cd_mach2, 0.37850690107567664);

        // M = 1.0 station breakdown.
        let m1 = &c41.drag_curves[10];
        assert_transonic(m1.mach, 1.0);
        assert_transonic(m1.total_cd, 0.6061411780693076);
        assert_transonic(m1.friction_cd, 0.19829700174695553);
        assert_transonic(m1.wave_cd, 0.027844176322352088);
        assert_transonic(m1.base_cd, 0.38);
        assert_transonic(m1.protuberance_cd, 0.0);
        // M = 2.0 station breakdown.
        let m2 = &c41.drag_curves[20];
        assert_transonic(m2.mach, 2.0);
        assert_transonic(m2.total_cd, 0.37850690107567664);
        assert_transonic(m2.friction_cd, 0.17376764978502013);
        assert_transonic(m2.wave_cd, 0.03933464426439289);
        assert_transonic(m2.base_cd, 0.1654046070262636);

        // CP migrates forward above Mach 1.
        let sub_cp = c41.drag_curves[0].cp;
        let super_cp = c41
            .drag_curves
            .iter()
            .find(|d| d.mach >= 2.0)
            .map(|d| d.cp)
            .unwrap();
        assert!(super_cp < sub_cp);
    }

    #[test]
    fn aero_curves_alpha_and_power_on_match_oracle() {
        let a = compute_aerodynamic_curves(&alpha_vehicle(), false, 41).unwrap();
        assert_transonic(a.max_transonic_cd, 0.6483339112996576);
        assert_transonic(a.mach_at_max_cd, 1.2);
        assert_transonic(a.subsonic_cd, 0.4912854764882226);
        assert_transonic(a.supersonic_cd_mach2, 0.40762159174626356);

        // Power-on plume lowers the whole NSL curve.
        let on = compute_aerodynamic_curves(&nsl_vehicle(), true, 41).unwrap();
        assert_transonic(on.max_transonic_cd, 0.4037238422206907);
        assert_transonic(on.subsonic_cd, 0.4037238422206907);
        assert_transonic(on.supersonic_cd_mach2, 0.27595604471939317);

        // Boattail vehicle curve anchors.
        let v = Vehicle {
            components: vec![
                vc(
                    "nc",
                    "n",
                    "pla_3dprint",
                    Component::Nosecone {
                        shape: NoseShape::Conical,
                        length: 0.2,
                        base_diameter: 0.06,
                        wall_thickness: 0.002,
                        is_hollow: false,
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "bt1",
                    "b",
                    "cardboard",
                    Component::BodyTube {
                        length: 0.4,
                        outer_diameter: 0.06,
                        inner_diameter: Some(0.058),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "tr",
                    "t",
                    "cardboard",
                    Component::Transition {
                        length: 0.1,
                        fore_diameter: 0.06,
                        aft_diameter: 0.04,
                        wall_thickness: 0.002,
                        is_hollow: false,
                        mass_override: None,
                        cg_override: None,
                    },
                ),
                vc(
                    "fins",
                    "f",
                    "balsa",
                    Component::TrapezoidFin {
                        fin_count: 4,
                        root_chord: 0.1,
                        tip_chord: 0.05,
                        span: 0.06,
                        sweep_length: 0.03,
                        thickness: 0.003,
                        cross_section: FinCrossSection::Rounded,
                        axial_offset: Some(0.3),
                        mass_override: None,
                        cg_override: None,
                    },
                ),
            ],
        };
        let b = compute_aerodynamic_curves(&v, false, 41).unwrap();
        assert_transonic(b.max_transonic_cd, 0.48851812653801235);
        assert_transonic(b.mach_at_max_cd, 1.2);
        assert_transonic(b.subsonic_cd, 0.33464015979048106);
        assert_transonic(b.supersonic_cd_mach2, 0.29566104956039135);
    }

    #[test]
    fn aero_curves_fail_closed_on_bad_geometry() {
        let err = aero_curves(&Vehicle { components: vec![] }, false).unwrap_err();
        assert_eq!(
            err,
            "vehicle geometry: vehicle has no components — mass rollup is undefined"
        );
    }
}
