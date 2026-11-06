//! Aerodynamics engine: Barrowman stability + transonic/supersonic drag.
//!
//! Faithful Rust port of the TypeScript oracles `src/aero/barrowman.ts` and
//! `src/aero/transonicAero.ts`. Control flow and arithmetic mirror the TS
//! line-for-line so the `#[cfg(test)]` parity anchors below (extracted from
//! the TS via `node --experimental-strip-types`, never hand-invented) hold:
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
//! Provenance: see `docs/internal/aero-provenance.md`. The standard-method terms
//! (Schlichting/Van Driest II skin friction, Ackeret fin wave drag, Hoerner
//! form factors, McCoy boattail) carry located public sources. Every fitted
//! coefficient mirrored here — nosecone shape factors 0.55/0.72/0.85/1.25,
//! base drag 0.12 / 0.13 / 0.38 peak / `M^-1.2` decay, the 0.38 plume factor,
//! the 0.45-caliber CP shift, and the 0.45·cr body-lift station — has no
//! located primary source and is unvalidated; each site is marked below.
//!
//! Coarse public API: [`stability`] (full Barrowman assembly) and
//! [`aero_curves`] (Mach 0–4 drag/CP curves, 41 points). Fine-grained
//! `compute_*` helpers are also `pub` for parity testing.

use std::collections::{BTreeMap, HashSet};
use std::f64::consts::PI;

use crate::fin_planform::{analyze_freeform_planform, FinPoint, FreeformPlanform};

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
    /// Fin set with an arbitrary planform polygon (see `fin_planform`).
    FreeformFin {
        fin_count: i32,
        points: Vec<FinPoint>,
        thickness: f64,
        cross_section: FinCrossSection,
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
            Component::FreeformFin { .. } => "freeformfinset".to_string(),
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

/// Calibrated design inputs for one component (metres, m^2).
///
/// These carry the calibrated method's part-level inputs the app geometry does
/// not: rail/lug/shoe hardware on body tubes and an explicit section family on
/// trapezoidal fin sets. All-`None` is exactly a vehicle without design inputs.
#[derive(Debug, Clone, Default)]
pub struct ComponentDesignInputs {
    /// Rail-guide button diameter (m).
    pub rail_guide_diameter: Option<f64>,
    /// Rail-guide standoff height (m).
    pub rail_guide_height: Option<f64>,
    /// Launch-lug outer diameter (m).
    pub launch_lug_diameter: Option<f64>,
    /// Launch-shoe frontal area (m^2).
    pub launch_shoe_area: Option<f64>,
    /// Calibrated fin airfoil name (see `calibrated::design::Airfoil`).
    pub airfoil_section: Option<String>,
    /// Leading-edge bevel length (m).
    pub leading_edge_bevel: Option<f64>,
    /// Trailing-edge bevel length (m).
    pub trailing_edge_bevel: Option<f64>,
    /// Leading-edge radius (m).
    pub leading_edge_radius: Option<f64>,
}

/// Vehicle-level calibrated design inputs the app geometry does not carry.
///
/// An absent field keeps the method's documented default; the calibrated
/// adapter reports that default as an assumption.
#[derive(Debug, Clone, Default)]
pub struct VehicleDesignInputs {
    /// Calibrated surface-finish name; absent = "Smooth (Zero Roughness)".
    pub surface_finish: Option<String>,
    /// Force turbulent skin friction; absent = not forced.
    pub force_turbulent_flow: Option<bool>,
    /// Nozzle exit diameter (m); absent = the method's power-on default.
    pub nozzle_exit_diameter: Option<f64>,
    /// Per-component inputs keyed by [`VehicleComponent::id`].
    pub components: BTreeMap<String, ComponentDesignInputs>,
}

/// Minimal vehicle: an ordered component list forming the axial chain.
#[derive(Debug, Clone, Default)]
pub struct Vehicle {
    pub components: Vec<VehicleComponent>,
    /// Calibrated design inputs the geometry does not carry. `None` selects
    /// every method default (byte-identical to a vehicle without design inputs).
    pub design_inputs: Option<VehicleDesignInputs>,
}

// ---------------------------------------------------------------------------
// Internal mass rollup (duplicated from the mass module on purpose: this
// module stays independent — no cross-module dependency).
// ---------------------------------------------------------------------------

// `local_cg` and `length` mirror the TypeScript rollup record; nothing in the
// Rust port reads them yet.
#[allow(dead_code)]
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

#[allow(clippy::too_many_arguments)]
fn compute_freeform_fin_mass(
    fin_count: i32,
    points: &[FinPoint],
    thickness: f64,
    mass_override: Option<f64>,
    cg_override: Option<f64>,
) -> Result<MassCg, String> {
    let planform = analyze_freeform_planform(points)?;
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
            local_cg: cg_override.unwrap_or(planform.root_chord / 2.0),
        });
    }
    let volume = planform.area * thickness * f64::from(fin_count);
    Ok(MassCg {
        mass: volume, // density applied by caller
        local_cg: cg_override.unwrap_or(planform.centroid_x),
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
            Component::FreeformFin {
                fin_count,
                points,
                thickness,
                axial_offset,
                mass_override,
                cg_override,
                ..
            } => {
                let mut res = compute_freeform_fin_mass(
                    *fin_count,
                    points,
                    *thickness,
                    *mass_override,
                    *cg_override,
                )?;
                if mass_override.is_none() {
                    res.mass *= density;
                }
                let axial_start = last_body_tube_start + axial_offset_of(*axial_offset, id)?;
                (res.mass, res.local_cg, axial_start, analyze_freeform_planform(points)?.root_chord)
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
    let lf = (s * s + sweep_mid * sweep_mid).sqrt();

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

    // CP of the body lift induced by fins. PROVENANCE: the 0.45·cr station is
    // a project approximation; it was not verified against the cited report and
    // no primary-source equation for this fraction was located. Unresolved.
    let cp_body = axial_start + 0.45 * cr;

    // Combined CP weighted by normal force contributions.
    let cp = if cna > 0.0 {
        (cna_fb * cp_fin + cna_bf * cp_body) / cna
    } else {
        cp_fin
    };

    CnaCp { cna, cp }
}

/// Freeform fin set CNa and CP. Same Barrowman / Rogers build-up as the
/// trapezoid with its planform terms taken from the polygon: (root + tip
/// chord) → `2·area/span`, mid-chord line length → `span/cosΓ`, and the
/// isolated-fin CP at the quarter chord of the MAC (`mac_lead + 0.25·mac`).
pub fn compute_freeform_fin_aero(
    fin_count: i32,
    planform: &FreeformPlanform,
    axial_start: f64,
    body_diameter: f64,
    ref_diameter: f64,
) -> CnaCp {
    let n = f64::from(fin_count);
    let s = planform.span;
    let cr = planform.root_chord;
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

    let lf = planform.mid_chord_length;
    let chord_sum = planform.chord_sum;
    let mut cna1 = 0.0;
    if chord_sum > 0.0 && dref > 0.0 {
        let denom = 1.0 + (1.0 + ((2.0 * lf) / chord_sum).powi(2)).sqrt();
        cna1 = (2.0 * PI * (s / dref).powi(2)) / denom;
    }

    let kfb = 1.0 + r / (s + r);
    let kbf = if r > 0.0 {
        (r / (s + r)).powi(2) * (1.0 + s / r)
    } else {
        0.0
    };

    let cna_fb = kfb * (n / 2.0) * cna1;
    let cna_bf = kbf * (n / 2.0) * cna1;
    let cna = cna_fb + cna_bf;

    let cp_fin = axial_start + planform.mac_lead + 0.25 * planform.mac_length;
    let cp_body = axial_start + 0.45 * cr;
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
    // Same unverified 0.45·cr body-lift station as the trapezoid path (above).
    let cp_body = axial_start + 0.45 * cr;
    let cp = if cna > 0.0 {
        (cna_fb * cp_fin + cna_bf * cp_body) / cna
    } else {
        cp_fin
    };

    CnaCp { cna, cp }
}

/// Cross-section of one body span for the fin-mounting rule.
#[derive(Debug, Clone, Copy)]
enum BodySection {
    /// Cylindrical body tube: one diameter over the span.
    Constant(f64),
    /// Conical transition: linear diameter between the fore and aft ends.
    Taper { fore: f64, aft: f64 },
    /// Nosecone: published profile law from the tip (zero radius) to the base.
    Nose { shape: NoseShape, base: f64 },
}

/// One body component's axial span and local diameter law.
#[derive(Debug, Clone, Copy)]
struct BodySpan {
    start: f64,
    end: f64,
    section: BodySection,
}

/// Published nose profile radius at fractional station `u` (0 tip, 1 base).
///
/// The five laws mirror the app's procedural nose geometry
/// (`src/console/viewport/Vehicle3D.tsx::noseR` and
/// `src/formats/stepExport.ts::noseconeRadius`); ogive is a tangent ogive.
fn nose_profile_radius(shape: NoseShape, length: f64, base_radius: f64, u: f64) -> f64 {
    let u = u.clamp(0.0, 1.0);
    match shape {
        NoseShape::Conical => base_radius * u,
        NoseShape::Ogive => {
            // Tangent ogive: circle of radius rho centred at (L, R - rho).
            let rho = (base_radius * base_radius + length * length) / (2.0 * base_radius);
            let dx = length * (1.0 - u);
            (rho * rho - dx * dx).max(0.0).sqrt() + base_radius - rho
        }
        NoseShape::Parabolic => base_radius * (2.0 * u - u * u),
        NoseShape::VonKarman => {
            let theta = (1.0 - 2.0 * u).clamp(-1.0, 1.0).acos();
            let value = (theta - (2.0 * theta).sin() / 2.0).max(0.0);
            (base_radius / PI.sqrt()) * value.sqrt()
        }
        NoseShape::Elliptical => {
            let inv = 1.0 - u;
            base_radius * (1.0 - inv * inv).max(0.0).sqrt()
        }
    }
}

impl BodySpan {
    /// Body diameter at axial station `x`, clamped to the span ends.
    fn diameter_at(&self, x: f64) -> f64 {
        let length = self.end - self.start;
        let u = if length > 0.0 {
            ((x - self.start) / length).clamp(0.0, 1.0)
        } else {
            0.0
        };
        match self.section {
            BodySection::Constant(diameter) => diameter,
            BodySection::Taper { fore, aft } => fore + (aft - fore) * u,
            BodySection::Nose { shape, base } => {
                2.0 * nose_profile_radius(shape, length, base * 0.5, u)
            }
        }
    }
}

/// Identity of the fin-interference station rule carried by new run records.
/// Absent means a pre-P4 build (last-body-in-array diameter).
/// `fin-station-v2` adds root-local taper/nose diameters and scale-aware ties.
pub const FIN_INTERFERENCE_ID: &str = "fin-station-v2";

/// Interference body diameter for a fin root.
///
/// Barrowman (1967, NASA TM X-67216) makes the fin-body interference factors
/// `K_fb = 1 + R/(s+R)` and `K_bf = (R/(s+R))²(1+s/R)` functions of the body
/// radius `R` at the fin root — the body the fin is mounted on. OpenRocket
/// technical documentation §3.2.2 (eq. 3.56) likewise evaluates the radius at
/// the fin position. The running `last_body_diameter` of the component walk is
/// not that body when a later transition in array order precedes the fin set
/// (boattail after the tube), so the mounting body is resolved from geometry:
///
/// * each aerodynamic body component owns the axial span `[start, end]` and a
///   local diameter law: body tube constant `outerDiameter`, conical
///   transition linear between `foreDiameter` and `aftDiameter`, nosecone the
///   published profile law from tip to `baseDiameter`;
/// * the fin root span is `[root_start, root_start + root_chord]`;
/// * the mounting body is the span overlapping the most of the root chord
///   (full containment is the special case overlap = chord). This is an
///   approved geometric heuristic for a root that crosses a joint, not a
///   derivation for tapered bodies;
/// * overlaps within `1e-9 * root_chord` of the maximum are treated as a tie
///   and resolve to the forward body, so decimal joints are not decided by
///   floating-point noise;
/// * the interference diameter is the selected span's **local** diameter at
///   the root mid-chord station (clamped to the span). Tube-mounted roots are
///   therefore unchanged; tapered and nose-mounted roots no longer use the
///   component's far-end diameter;
/// * if no body span overlaps the root (unmounted geometry, e.g. an offset
///   past the vehicle's end) the pre-fix running diameter is kept. That
///   preserves legacy behaviour for invalid geometry; it does not establish a
///   valid attachment.
///
/// The fin's axial station is not changed; only the interference radius is.
/// Mass components, parachutes and unknown parts occupy no span (they do not
/// advance the aerodynamic chain that defines the fin datum).
fn mounting_body_diameter(
    spans: &[BodySpan],
    root_start: f64,
    root_chord: f64,
    fallback: f64,
) -> f64 {
    if !(root_chord > 0.0) || !root_start.is_finite() {
        return fallback;
    }
    let root_end = root_start + root_chord;
    if !root_end.is_finite() {
        return fallback;
    }
    let tolerance = 1e-9 * root_chord;
    let mut best_overlap = 0.0;
    for span in spans {
        let overlap = span.end.min(root_end) - span.start.max(root_start);
        if overlap > best_overlap {
            best_overlap = overlap;
        }
    }
    if !(best_overlap > 0.0) {
        return fallback;
    }
    let mid_chord = root_start + 0.5 * root_chord;
    for span in spans {
        let overlap = span.end.min(root_end) - span.start.max(root_start);
        if overlap > 0.0 && best_overlap - overlap <= tolerance {
            return span.diameter_at(mid_chord);
        }
    }
    fallback
}

/// Complete Barrowman stability evaluation for an entire rocket assembly.
///
/// Advances an axial chain over nosecone/bodytube/transition segments,
/// anchors fin sets at `lastBodyTubeStart + axialOffset`, and resolves each
/// fin set's interference diameter from the body span that carries the most
/// of its root chord (see [`mounting_body_diameter`]) rather than from the
/// last body component in array order. Accumulates
/// `CP = Σ(CNaᵢ·CPᵢ)/ΣCNaᵢ` with the `|ΣCNa| <= 1e-4 → 2/3·L` fallback, and
/// derives static margin in calibers with the `>= 1.0` / `> 3.0` stability
/// gates. Fails closed (mass validation runs first, so a present-but-NaN
/// fin offset throws there rather than hiding behind `|| 0`).
pub fn compute_rocket_stability(vehicle: &Vehicle) -> Result<StabilityAnalysis, String> {
    let mass_rollup = aggregate_mass_rollup(vehicle)?;
    let ref_diameter = mass_rollup.reference_diameter;

    // Body spans for the fin-mounting rule, in the same aerodynamic chain the
    // loop below advances (mass items, parachutes and unknowns own no span).
    let mut body_spans: Vec<BodySpan> = Vec::new();
    let mut span_x = 0.0;
    for comp in &vehicle.components {
        match &comp.component {
            Component::Nosecone {
                shape,
                length,
                base_diameter,
                ..
            } => {
                body_spans.push(BodySpan {
                    start: span_x,
                    end: span_x + *length,
                    section: BodySection::Nose {
                        shape: *shape,
                        base: *base_diameter,
                    },
                });
                span_x += *length;
            }
            Component::BodyTube {
                length,
                outer_diameter,
                ..
            } => {
                body_spans.push(BodySpan {
                    start: span_x,
                    end: span_x + *length,
                    section: BodySection::Constant(*outer_diameter),
                });
                span_x += *length;
            }
            Component::Transition {
                length,
                fore_diameter,
                aft_diameter,
                ..
            } => {
                body_spans.push(BodySpan {
                    start: span_x,
                    end: span_x + *length,
                    section: BodySection::Taper {
                        fore: *fore_diameter,
                        aft: *aft_diameter,
                    },
                });
                span_x += *length;
            }
            _ => {}
        }
    }

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
                let body_diameter = mounting_body_diameter(
                    &body_spans,
                    fin_axial_start,
                    *root_chord,
                    last_body_diameter,
                );
                let res = compute_trapezoid_fin_aero(
                    *fin_count,
                    *root_chord,
                    *tip_chord,
                    *span,
                    *sweep_length,
                    fin_axial_start,
                    body_diameter,
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
            Component::FreeformFin {
                fin_count,
                points,
                axial_offset,
                ..
            } => {
                let fin_axial_start =
                    last_body_tube_start + axial_offset.unwrap_or(0.0);
                let planform = analyze_freeform_planform(points)?;
                let body_diameter = mounting_body_diameter(
                    &body_spans,
                    fin_axial_start,
                    planform.root_chord,
                    last_body_diameter,
                );
                let res = compute_freeform_fin_aero(
                    *fin_count,
                    &planform,
                    fin_axial_start,
                    body_diameter,
                    ref_diameter,
                );
                aero_surfaces.push(AeroSurfaceContribution {
                    id: comp.id.clone(),
                    name: comp.name.clone(),
                    kind: "freeformfinset".to_string(),
                    cna: res.cna,
                    cp: res.cp,
                    axial_start: fin_axial_start,
                    axial_end: fin_axial_start + planform.root_chord,
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
                let body_diameter = mounting_body_diameter(
                    &body_spans,
                    fin_axial_start,
                    *root_chord,
                    last_body_diameter,
                );
                let res = compute_elliptical_fin_aero(
                    *fin_count,
                    *root_chord,
                    *span,
                    fin_axial_start,
                    body_diameter,
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

    apply_van_driest_correction(cf_incompressible, mach)
}
fn apply_van_driest_correction(cf_incompressible: f64, mach: f64) -> f64 {
    // Van Driest II compressibility transformation for an adiabatic wall.
    let m_term = 0.2 * mach * mach;
    let m_param = (m_term / (1.0 + 0.89 * m_term)).sqrt();
    let fc = if m_param > 0.001 {
        (m_param.asin() / m_param).powi(2)
    } else {
        1.0
    };
    cf_incompressible / fc
}

/// Smooth-wall turbulent plate Cf with a published Reynolds number per unit length.
fn skin_friction_at_reynolds_per_meter(mach: f64, length: f64, reynolds_per_meter: f64) -> f64 {
    let reynolds = (reynolds_per_meter * length.max(0.05)).max(1000.0);
    let cf_incompressible = 0.455 / reynolds.log10().powf(2.58);
    apply_van_driest_correction(cf_incompressible, mach)
}

#[derive(Debug, Clone, Copy)]
struct FinPlanformData {
    area_ratio: f64,
    area: f64,
    aspect_ratio: f64,
    /// cos of the leading-edge sweep: `cos(atan2(sweep, span))` for a trapezoid,
    /// the span-weighted mean cosine for a freeform fin.
    leading_edge_cos: f64,
    trailing_root_cutback: f64,
    trailing_root_cut_area: f64,
}

/// TN D-4014 (NASA-TN-D-4014, 1967), Fig. 1(b) gives the ARCAS 0.375-in
/// trailing-root cutback and 15° rake; its 30° leading-edge sweep is already
/// represented by the measured root-to-tip sweep. Since the shared component
/// schema has no rake field, apply the sourced polygon only to that complete
/// figure geometry; all other trapezoidal fins retain their original planform.
fn compute_fin_planform_data(
    root_chord: f64,
    tip_chord: f64,
    span: f64,
    sweep_length: f64,
) -> FinPlanformData {
    const INCH_METERS: f64 = 0.0254;
    const GEOMETRY_TOLERANCE: f64 = 1e-6;
    const FIGURE_ROOT_CHORD: f64 = 3.380 * INCH_METERS;
    const FIGURE_TIP_CHORD: f64 = 2.165 * INCH_METERS;
    const FIGURE_SPAN: f64 = 2.103 * INCH_METERS;
    const FIGURE_SWEEP: f64 = (3.380 - 2.165) * INCH_METERS;

    let nominal_area = 0.5 * (root_chord + tip_chord) * span;
    let is_arcas_figure_fin = (root_chord - FIGURE_ROOT_CHORD).abs() <= GEOMETRY_TOLERANCE
        && (tip_chord - FIGURE_TIP_CHORD).abs() <= GEOMETRY_TOLERANCE
        && (span - FIGURE_SPAN).abs() <= GEOMETRY_TOLERANCE
        && (sweep_length - FIGURE_SWEEP).abs() <= GEOMETRY_TOLERANCE;
    let trailing_root_cutback = if is_arcas_figure_fin {
        0.375 * INCH_METERS
    } else {
        0.0
    };
    let trailing_root_cut_area =
        0.5 * trailing_root_cutback * (trailing_root_cutback * 15.0_f64.to_radians().tan());
    let area = nominal_area - trailing_root_cut_area;

    FinPlanformData {
        area_ratio: area / nominal_area,
        area,
        aspect_ratio: 2.0 * span * span / area,
        leading_edge_cos: sweep_length.atan2(span).cos(),
        trailing_root_cutback,
        trailing_root_cut_area,
    }
}

/// Planform data for a freeform fin: no sourced rake feature applies to an
/// arbitrary polygon, so the outline is used as drawn with its true area.
fn freeform_fin_planform_data(planform: &FreeformPlanform) -> FinPlanformData {
    FinPlanformData {
        area_ratio: 1.0,
        area: planform.area,
        aspect_ratio: 2.0 * planform.span * planform.span / planform.area,
        leading_edge_cos: planform.cos_leading_edge,
        trailing_root_cutback: 0.0,
        trailing_root_cut_area: 0.0,
    }
}

/// Published finite-wing lift-slope ratio relative to the incompressible
/// Prandtl lifting-line slope.
///
/// Resolves Mach normal to the swept leading edge (`mach * cos(LE sweep)`),
/// uses Prandtl–Glauert `2π/(β + 2/AR)` below Mn = 1 and Ackeret
/// `4/(β + 4/(πAR))` above it, then divides by the incompressible
/// `2π/(1 + 2/AR)`. The two branches meet at πAR at Mn = 1, so no fitted sonic
/// cap is introduced. This is the **unclamped** ratio used by the flight
/// normal law; the Aero Plots curve keeps its own `max(1, …)` floor because
/// that curve leaves high-Mach CP migration to a separate heuristic.
///
/// Sources: Prandtl, NACA Report 116 (1923); Ackeret, NACA TM 317 (1925);
/// Glauert, "The Effect of Compressibility on the Lift of an Aerofoil" (1927).
/// The ratio carries no vehicle-fitted or reference-engine coefficient.
pub fn published_fin_lift_slope_ratio(
    mach: f64,
    aspect_ratio: f64,
    leading_edge_cos: f64,
) -> f64 {
    if !mach.is_finite()
        || !aspect_ratio.is_finite()
        || !leading_edge_cos.is_finite()
        || mach <= 0.0
        || aspect_ratio <= 0.0
    {
        return 1.0;
    }
    let normal_mach = mach * leading_edge_cos;
    let beta = (1.0 - normal_mach * normal_mach).abs().sqrt();
    let subsonic_slope = 2.0 * PI / (beta + 2.0 / aspect_ratio);
    let supersonic_slope = 4.0 / (beta + 4.0 / (PI * aspect_ratio));
    let incompressible_slope = 2.0 * PI / (1.0 + 2.0 / aspect_ratio);
    let finite_wing_slope = if normal_mach < 1.0 {
        subsonic_slope
    } else {
        supersonic_slope
    };
    finite_wing_slope / incompressible_slope
}

/// Analytical Mach derivative of [`published_fin_lift_slope_ratio`].
///
/// Used by the transonic blend to match the exterior law's slope at M = 1.2
/// as well as its value. Both branches differentiate in closed form:
/// `d/dMn [2π/(β+2/AR)] = 2π·Mn/(β·(β+2/AR)²)` subsonically and
/// `d/dMn [4/(β+4/(πAR))] = −4·Mn/(β·(β+4/(πAR))²)` supersonically, with
/// `dMn/dM = cos(LE sweep)`.
///
/// At a swept-sonic endpoint (`Mn = 1`, `β = 0`) the exterior law has a
/// square-root cusp and no finite derivative exists. That is a model-form
/// limit of the PG/Ackeret composition, not a blend defect: the function then
/// returns a documented right one-sided secant over `1e-6` Mach so the blend
/// stays finite and deterministic. Tests cover finiteness at the cusp and
/// derivative continuity away from it.
pub fn published_fin_lift_slope_ratio_derivative(
    mach: f64,
    aspect_ratio: f64,
    leading_edge_cos: f64,
) -> f64 {
    if !mach.is_finite()
        || !aspect_ratio.is_finite()
        || !leading_edge_cos.is_finite()
        || mach <= 0.0
        || aspect_ratio <= 0.0
        || leading_edge_cos == 0.0
    {
        return 0.0;
    }
    let normal_mach = mach * leading_edge_cos;
    let beta = (1.0 - normal_mach * normal_mach).abs().sqrt();
    if beta <= 1.0e-9 {
        // Swept-sonic cusp: no finite exterior derivative. Use the right
        // one-sided secant over a fixed, documented step.
        const CUSP_STEP: f64 = 1.0e-6;
        return (published_fin_lift_slope_ratio(
            mach + CUSP_STEP,
            aspect_ratio,
            leading_edge_cos,
        ) - published_fin_lift_slope_ratio(mach, aspect_ratio, leading_edge_cos))
            / CUSP_STEP;
    }
    let incompressible_slope = 2.0 * PI / (1.0 + 2.0 / aspect_ratio);
    let slope = if normal_mach < 1.0 {
        let d = 2.0 * PI * normal_mach
            / (beta * (beta + 2.0 / aspect_ratio).powi(2));
        leading_edge_cos * d / incompressible_slope
    } else {
        let c = 4.0 / (PI * aspect_ratio);
        let d = -4.0 * normal_mach / (beta * (beta + c).powi(2));
        leading_edge_cos * d / incompressible_slope
    };
    slope
}

/// Aero Plots curve variant: only the added fin term is modelled there; the
/// existing supersonic CP migration remains responsible for high-Mach
/// degradation, so the ratio is floored at 1.
fn transonic_fin_lift_slope_ratio(mach: f64, planform: FinPlanformData) -> f64 {
    published_fin_lift_slope_ratio(mach, planform.aspect_ratio, planform.leading_edge_cos)
        .max(1.0)
}

/// Published normal-law planform inputs for a trapezoidal fin set:
/// `(aspect_ratio, cos leading-edge sweep)`. Shares the sourced ARCAS figure
/// fin area correction with the Aero Plots curve.
pub fn trapezoid_fin_normal_planform(
    root_chord: f64,
    tip_chord: f64,
    span: f64,
    sweep_length: f64,
) -> (f64, f64) {
    let planform = compute_fin_planform_data(root_chord, tip_chord, span, sweep_length);
    (planform.aspect_ratio, planform.leading_edge_cos)
}

/// Published normal-law planform inputs for a freeform fin set.
pub fn freeform_fin_normal_planform(
    points: &[FinPoint],
) -> Result<(f64, f64), String> {
    let planform = analyze_freeform_planform(points)?;
    Ok((
        (2.0 * planform.span * planform.span) / planform.area,
        planform.cos_leading_edge,
    ))
}


/// Nosecone wave drag coefficient referenced to body-tube frontal area.
///
/// Subsonic (`mach < 0.8`): negligible 0.005. Transonic: cubic-spline rise
/// to the shape/fineness peak. Supersonic: Ackeret/Taylor-Maccoll
/// `1/sqrt(M²-1)` decay. Shape branches: von Kármán 0.55, ogive 0.72,
/// parabolic 0.85, conical (and anything else, including elliptical) 1.25.
///
/// PROVENANCE: the shape factors are a project-authored ordering heuristic;
/// no primary source was located for them, for the 0.8/0.9 transonic
/// multipliers, for the 0.02 offset, or for the 1.2 clip. Unvalidated.
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
    let fin_area = 0.5 * (root_chord + tip_chord) * span * f64::from(fin_count);
    fin_wave_drag_from_planform(fin_area, root_chord, thickness, cross_section, mach, ref_area)
}

/// Freeform counterpart of [`compute_fin_wave_drag`]: planform area from the polygon.
pub fn compute_freeform_fin_wave_drag(
    fin_count: i32,
    planform: &FreeformPlanform,
    thickness: f64,
    cross_section: FinCrossSection,
    mach: f64,
    ref_area: f64,
) -> f64 {
    fin_wave_drag_from_planform(
        planform.area * f64::from(fin_count),
        planform.root_chord,
        thickness,
        cross_section,
        mach,
        ref_area,
    )
}

fn fin_wave_drag_from_planform(
    fin_area: f64,
    root_chord: f64,
    thickness: f64,
    cross_section: FinCrossSection,
    mach: f64,
    ref_area: f64,
) -> f64 {
    if mach < 0.8 {
        return 0.0;
    }

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

/// Fin leading-edge pressure drag and trailing-edge base drag, per the
/// Barrowman build-up as published in Niskanen, "Development of an Open Source
/// model rocket simulation software" (2009, OpenRocket technical documentation
/// §3.4.4–3.4.5): a square (blunt) leading edge takes the stagnation-pressure
/// coefficient 0.85·q_stag/q; a rounded or airfoil edge takes the rounded-edge
/// relation; both scale with cos² of the leading-edge sweep. The trailing edge
/// takes the body base-drag relation for a square edge, half of it for a
/// rounded edge and none for an airfoil. A double wedge has sharp edges and
/// gets neither (its thickness drag is the supersonic wave term above). Each
/// fin contributes over its edge area `span·thickness`.
///
/// Returns `(leading_edge_cd, trailing_edge_cd)` on `ref_area`.
#[allow(clippy::too_many_arguments)]
pub fn compute_fin_edge_drag(
    fin_count: i32,
    span: f64,
    sweep_length: f64,
    thickness: f64,
    cross_section: FinCrossSection,
    mach: f64,
    ref_area: f64,
) -> (f64, f64) {
    // cos²(leading-edge sweep) = span² / (span² + sweep²), without trigonometry.
    let cos2_sweep = (span * span) / (span * span + sweep_length * sweep_length);
    fin_edge_drag_from_sweep(cos2_sweep, fin_count, span, thickness, cross_section, mach, ref_area)
}

/// Freeform counterpart of [`compute_fin_edge_drag`]. Integrates the published
/// cos² Γ pressure relation over each actual leading-edge segment, weighted by
/// its span projection. This reduces to the trapezoid relation for a straight
/// edge.
pub fn compute_freeform_fin_edge_drag(
    fin_count: i32,
    planform: &FreeformPlanform,
    thickness: f64,
    cross_section: FinCrossSection,
    mach: f64,
    ref_area: f64,
) -> (f64, f64) {
    fin_edge_drag_from_sweep(
        planform.cos_leading_edge_squared,
        fin_count,
        planform.span,
        thickness,
        cross_section,
        mach,
        ref_area,
    )
}

fn fin_edge_drag_from_sweep(
    cos2_sweep: f64,
    fin_count: i32,
    span: f64,
    thickness: f64,
    cross_section: FinCrossSection,
    mach: f64,
    ref_area: f64,
) -> (f64, f64) {
    let m2 = mach * mach;
    let m4 = m2 * m2;
    let stagnation_cd = if mach <= 1.0 {
        0.85 * (1.0 + m2 / 4.0 + m4 / 40.0)
    } else {
        0.85 * (1.84 - 0.76 / m2 + 0.166 / m4 + 0.035 / (m4 * m2))
    };
    let rounded_le_cd = if mach < 0.9 {
        (1.0 - m2).powf(-0.417) - 1.0
    } else if mach < 1.0 {
        1.0 - 1.785 * (mach - 0.9)
    } else {
        1.214 - 0.502 / m2 + 0.1095 / m4
    };
    let base_cd = if mach <= 1.0 { 0.12 + 0.13 * m2 } else { 0.25 / mach };
    let (le, te) = match cross_section {
        FinCrossSection::Square => (stagnation_cd, base_cd),
        FinCrossSection::Rounded => (rounded_le_cd, base_cd / 2.0),
        FinCrossSection::Airfoil => (rounded_le_cd, 0.0),
        FinCrossSection::DoubleWedge => (0.0, 0.0),
    };
    let edge_area_ratio = span * thickness * f64::from(fin_count) / ref_area.max(0.0001);
    (le * cos2_sweep * edge_area_ratio, te * edge_area_ratio)
}

/// Base drag coefficient with motor power-on plume and boattail reduction.
///
/// Subsonic quadratic rise, C1-continuous transonic spline peaking at
/// Cd = 0.38 at M = 1.0, supersonic `0.38/M^1.2` decay; motor plume cuts
/// ~62% during burn; boattail scales by `(base/body)²`.
///
/// PROVENANCE: every coefficient below (0.12, 0.13, the 0.38 peak, both
/// smoothstep branches, the `M^-1.2` decay, the 0.38 plume factor) is a
/// project-authored fit. Hoerner/NASA base-pressure data are named in the
/// docs, but no equation-level match or primary source for these values was
/// located. Unvalidated.
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

/// Transonic boat-tail surface pressure drag from McCoy's similarity
/// correlation, separate from pressure force on the blunt base.
///
/// McCoy, "MC DRAG" (ARBRL-TR-02293, 1981), §IV, eq. (10) gives the
/// geometry parameter; Fig. 5 correlates it with Sykes' measured transonic
/// boat-tail drag at M∞ = 0.9, 1.0, and 1.1 (pressure-integrated
/// afterbody data). The chart slopes are approximately 1.2, 1.8, and 1.2.
/// MC DRAG activates the term above M = 0.85; this implementation smooths
/// that onset into the first M = 0.9 correlation curve. Above M = 1.1, use
/// Ackeret's 1/sqrt(M² - 1) pressure scaling.
fn compute_transonic_boattail_pressure_drag(
    mach: f64,
    length: f64,
    fore_diameter: f64,
    aft_diameter: f64,
    reference_diameter: f64,
) -> f64 {
    if mach <= 0.85 || length <= 0.0 || reference_diameter <= 0.0 {
        return 0.0;
    }

    let length_calibers = length / reference_diameter;
    let tangent_beta = (fore_diameter - aft_diameter) / (2.0 * length);
    let e_minus_two_length = (-2.0 * length_calibers).exp();
    let similarity_parameter = 4.0
        * tangent_beta
        * tangent_beta
        * (1.0 + 0.5 * tangent_beta)
        * (1.0 - e_minus_two_length
            + 2.0
                * tangent_beta
                * (e_minus_two_length * (length_calibers + 0.5) - 0.5));
    let shape_parameter = similarity_parameter.max(0.0);

    let correlation_slope = if mach < 0.9 {
        let t = (mach - 0.85) / 0.05;
        1.2 * t * t * (3.0 - 2.0 * t)
    } else if mach <= 1.0 {
        let t = (mach - 0.9) / 0.1;
        1.2 + (1.8 - 1.2) * t
    } else if mach <= 1.1 {
        let t = (mach - 1.0) / 0.1;
        1.8 + (1.2 - 1.8) * t
    } else {
        1.2 * ((1.1_f64 * 1.1 - 1.0) / (mach * mach - 1.0)).sqrt()
    };

    shape_parameter * correlation_slope
}


/// One Mach station of the drag/CP breakdown (mirrors TS `DragBreakdown`;
/// `protuberance_cd` is 0 by default — the vehicle model carries no
/// protuberance geometry yet, so totals are unchanged).
#[derive(Debug, Clone)]
pub struct DragBreakdown {
    pub mach: f64,
    pub total_cd: f64,
    pub friction_cd: f64,
    /// Nose, fin, and boat-tail surface pressure drag.
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
/// Uses the default sea-level atmosphere for skin friction. A tunnel condition
/// with a published Reynolds number per unit length can use
/// [`compute_aerodynamic_curves_at_reynolds`] instead.
pub fn compute_aerodynamic_curves(
    vehicle: &Vehicle,
    is_motor_burning: bool,
    mach_points_count: usize,
) -> Result<AeroCurveResult, String> {
    compute_aerodynamic_curves_inner(vehicle, is_motor_burning, mach_points_count, None)
}

/// Aerodynamic curves at a tunnel's published Reynolds number per unit length.
pub fn compute_aerodynamic_curves_at_reynolds(
    vehicle: &Vehicle,
    is_motor_burning: bool,
    mach_points_count: usize,
    reynolds_per_meter: f64,
) -> Result<AeroCurveResult, String> {
    compute_aerodynamic_curves_inner(
        vehicle,
        is_motor_burning,
        mach_points_count,
        Some(reynolds_per_meter),
    )
}

fn compute_mach_dependent_cp(
    stability: &StabilityAnalysis,
    fin: Option<&ComponentContribution>,
    planform: Option<FinPlanformData>,
    mach: f64,
    ref_diameter: f64,
) -> f64 {
    let fin_cna = fin.and_then(|contribution| contribution.cna).unwrap_or(0.0);
    let fin_cp = fin.and_then(|contribution| contribution.cp).unwrap_or(stability.cp);
    let mut cp = stability.cp;

    if let (Some(contribution), Some(planform)) = (fin, planform) {
        if fin_cna > 0.0 {
            let retained_fin_cna = fin_cna * planform.area_ratio;
            let cut_centroid = contribution.axial_end - planform.trailing_root_cutback / 3.0;
            let retained_fin_cp = fin_cp
                + (planform.trailing_root_cut_area / planform.area) * (fin_cp - cut_centroid);
            let corrected_total_cna = stability.total_cna - fin_cna + retained_fin_cna;
            let corrected_moment = stability.total_cna * stability.cp - fin_cna * fin_cp
                + retained_fin_cna * retained_fin_cp;
            let mach_fin_cna =
                retained_fin_cna * transonic_fin_lift_slope_ratio(mach, planform);
            let mach_total_cna = corrected_total_cna + mach_fin_cna - retained_fin_cna;
            let mach_moment =
                corrected_moment + (mach_fin_cna - retained_fin_cna) * retained_fin_cp;
            if mach_total_cna.abs() > 0.0001 {
                cp = mach_moment / mach_total_cna;
            }
        }
    }

    // PROVENANCE: the 0.45-caliber coefficient and the 0.8-caliber cap are a
    // project-authored heuristic with no located primary source. The repo's own
    // ARCAS digitization of NASA TN D-4013 (docs/internal/validation/arcas/
    // transonic-cp-findings.md) records measured CP moving AFT through this
    // range, so the forward shift is unvalidated in sign and magnitude.
    if mach > 1.0 {
        let shift_calibers = (0.45 * (1.0 - 1.0 / (mach * mach).sqrt())).min(0.8);
        cp = (cp - shift_calibers * ref_diameter).max(0.1);
    }
    cp
}

/// Planform description of the fin set that drives the drag terms.
enum FinGeom {
    Trapezoid { tip_chord: f64, sweep_length: f64 },
    Freeform(FreeformPlanform),
}

struct DragFin<'a> {
    id: &'a str,
    count: i32,
    root_chord: f64,
    span: f64,
    thickness: f64,
    cross_section: FinCrossSection,
    geom: FinGeom,
}

fn fin_wave_drag_for(f: &DragFin, mach: f64, ref_area: f64) -> f64 {
    match &f.geom {
        FinGeom::Trapezoid { tip_chord, .. } => compute_fin_wave_drag(
            f.count,
            f.root_chord,
            *tip_chord,
            f.span,
            f.thickness,
            f.cross_section,
            mach,
            ref_area,
        ),
        FinGeom::Freeform(planform) => compute_freeform_fin_wave_drag(
            f.count,
            planform,
            f.thickness,
            f.cross_section,
            mach,
            ref_area,
        ),
    }
}

fn fin_edge_drag_for(f: &DragFin, mach: f64, ref_area: f64) -> (f64, f64) {
    match &f.geom {
        FinGeom::Trapezoid { sweep_length, .. } => compute_fin_edge_drag(
            f.count,
            f.span,
            *sweep_length,
            f.thickness,
            f.cross_section,
            mach,
            ref_area,
        ),
        FinGeom::Freeform(planform) => compute_freeform_fin_edge_drag(
            f.count,
            planform,
            f.thickness,
            f.cross_section,
            mach,
            ref_area,
        ),
    }
}

fn compute_aerodynamic_curves_inner(
    vehicle: &Vehicle,
    is_motor_burning: bool,
    mach_points_count: usize,
    reynolds_per_meter: Option<f64>,
) -> Result<AeroCurveResult, String> {
    let mass_rollup = aggregate_mass_rollup(vehicle)?;
    let total_length = mass_rollup.total_length;
    let ref_diameter = mass_rollup.reference_diameter;
    let ref_area = (PI / 4.0) * ref_diameter.powi(2);

    // Subsonic Barrowman baseline, with the figure-supported trailing-root
    // rake applied only to the matching TN D-4014 fin dimensions.
    let subsonic_stability = compute_rocket_stability(vehicle)?;
    let body_wetted_area = PI * ref_diameter * total_length;

    let nose = vehicle.components.iter().find_map(|c| match &c.component {
        Component::Nosecone {
            shape,
            length,
            base_diameter,
            ..
        } => Some((*shape, *length, *base_diameter)),
        _ => None,
    });
    // First trapezoid or freeform fin set drives the fin drag terms.
    let mut fins: Option<DragFin> = None;
    for c in &vehicle.components {
        match &c.component {
            Component::TrapezoidFin {
                fin_count,
                root_chord,
                tip_chord,
                span,
                sweep_length,
                thickness,
                cross_section,
                ..
            } => {
                fins = Some(DragFin {
                    id: c.id.as_str(),
                    count: *fin_count,
                    root_chord: *root_chord,
                    span: *span,
                    thickness: *thickness,
                    cross_section: *cross_section,
                    geom: FinGeom::Trapezoid {
                        tip_chord: *tip_chord,
                        sweep_length: *sweep_length,
                    },
                });
                break;
            }
            Component::FreeformFin {
                fin_count,
                points,
                thickness,
                cross_section,
                ..
            } => {
                let planform = analyze_freeform_planform(points)?;
                fins = Some(DragFin {
                    id: c.id.as_str(),
                    count: *fin_count,
                    root_chord: planform.root_chord,
                    span: planform.span,
                    thickness: *thickness,
                    cross_section: *cross_section,
                    geom: FinGeom::Freeform(planform),
                });
                break;
            }
            _ => {}
        }
    }
    let aft_transition = vehicle
        .components
        .iter()
        .rev()
        .find_map(|c| match &c.component {
            Component::Transition {
                length,
                fore_diameter,
                aft_diameter,
                ..
            } => Some((*length, *fore_diameter, *aft_diameter)),
            _ => None,
        });
    let base_diameter = aft_transition.map_or(ref_diameter, |(_, _, aft)| aft);
    let fin_planform = fins.as_ref().map(|f| match &f.geom {
        FinGeom::Trapezoid { tip_chord, sweep_length } => {
            compute_fin_planform_data(f.root_chord, *tip_chord, f.span, *sweep_length)
        }
        FinGeom::Freeform(planform) => freeform_fin_planform_data(planform),
    });
    let fin_contribution = fins.as_ref().and_then(|f| {
        subsonic_stability
            .contributions
            .iter()
            .find(|contribution| contribution.id == f.id)
    });

    // Smooth-plate skin friction uses the classical body and airfoil form
    // factors (Hoerner, Fluid-Dynamic Drag, 1965, ch. III), derived from geometry.
    // A freeform fin's wetted area is both faces of the polygon (2·A·n) and
    // its mean chord the polygon's MAC; a trapezoid keeps its closed forms.
    let (fin_wetted_area, fin_mean_chord) = fins.as_ref().map_or((0.0, 0.0), |f| match &f.geom {
        FinGeom::Trapezoid { tip_chord, .. } => {
            let (root, tip, span, count) = (f.root_chord, *tip_chord, f.span, f.count);
            let taper_ratio = tip / root;
            let area_ratio = fin_planform.map_or(1.0, |planform| planform.area_ratio);
            (
                (root + tip) * span * f64::from(count) * area_ratio,
                (2.0 / 3.0) * root * (1.0 + taper_ratio + taper_ratio * taper_ratio)
                    / (1.0 + taper_ratio),
            )
        }
        FinGeom::Freeform(planform) => (
            2.0 * planform.area * f64::from(f.count),
            planform.mac_length,
        ),
    });
    let body_fineness_ratio = total_length / ref_diameter.max(0.01);
    let body_skin_friction_form_factor =
        1.0 + 60.0 / body_fineness_ratio.powi(3) + body_fineness_ratio / 400.0;
    // Apply the complete-body form factor once, not again to the isolated
    // nose at the whole-body mean skin-friction coefficient.
    let body_friction_wetted_area = body_wetted_area * body_skin_friction_form_factor;
    let fin_thickness_ratio = fins
        .as_ref()
        .map_or(0.0, |f| f.thickness / fin_mean_chord.max(0.01));
    let fin_skin_friction_form_factor =
        1.0 + 2.0 * fin_thickness_ratio + 60.0 * fin_thickness_ratio.powi(4);

    let mut mach_points: Vec<f64> = Vec::with_capacity(mach_points_count);
    let mut drag_curves: Vec<DragBreakdown> = Vec::with_capacity(mach_points_count);

    let mut max_transonic_cd = 0.0;
    let mut mach_at_max_cd = 1.0;

    for i in 0..mach_points_count {
        // Mirror TS exactly (`(i / (count - 1)) * 4.0`, IEEE division).
        let mach = (i as f64 / (mach_points_count as f64 - 1.0)) * 4.0;
        mach_points.push(mach);


        // Schlichting's mean turbulent-plate law (0.455/log10(Re_L)^2.58),
        // with Van Driest II, is evaluated at each surface's own length. TN D-4013
        // §Apparatus and Tests—Model supplies Re per meter for the tunnel case.
        let cf = if let Some(reynolds_per_meter) = reynolds_per_meter {
            skin_friction_at_reynolds_per_meter(mach, total_length, reynolds_per_meter)
        } else {
            let velocity = (mach * SPEED_OF_SOUND_SL).max(10.0);
            compute_compressible_skin_friction(mach, total_length, velocity, 0.0, 5.0)
        };
        let fin_cf = if fins.is_some() {
            if let Some(reynolds_per_meter) = reynolds_per_meter {
                skin_friction_at_reynolds_per_meter(mach, fin_mean_chord, reynolds_per_meter)
            } else {
                let velocity = (mach * SPEED_OF_SOUND_SL).max(10.0);
                compute_compressible_skin_friction(mach, fin_mean_chord, velocity, 0.0, 5.0)
            }
        } else {
            0.0
        };
        let friction_cd = cf * (body_friction_wetted_area / ref_area.max(0.0001))
            + fin_cf * (fin_wetted_area / ref_area.max(0.0001))
                * fin_skin_friction_form_factor;

        // 2. Pressure drag (nosecone, fins, and transonic boat-tail surface).
        let mut wave_cd = 0.0;
        if let Some((shape, length, base)) = nose {
            wave_cd += compute_nosecone_wave_drag(shape, length, base, mach);
        }
        if let Some(f) = &fins {
            let area_ratio = fin_planform.map_or(1.0, |planform| planform.area_ratio);
            wave_cd += fin_wave_drag_for(f, mach, ref_area) * area_ratio;
            wave_cd += fin_edge_drag_for(f, mach, ref_area).0;
        }
        if let Some((length, fore_diameter, aft_diameter)) = aft_transition {
            wave_cd += compute_transonic_boattail_pressure_drag(
                mach,
                length,
                fore_diameter,
                aft_diameter,
                ref_diameter,
            );
        }

        // 3. Base drag (with plume and boattail).
        let base_cd = compute_base_drag(mach, base_diameter, ref_diameter, is_motor_burning)
            + fins
                .as_ref()
                .map_or(0.0, |f| fin_edge_drag_for(f, mach, ref_area).1);

        // 4. Protuberance parasitic drag (Hoerner model): 0 by default.
        let protuberance_cd = 0.0;

        // Total drag coefficient.
        let total_cd = (friction_cd + wave_cd + base_cd + protuberance_cd).max(0.15);

        if total_cd > max_transonic_cd {
            max_transonic_cd = total_cd;
            mach_at_max_cd = mach;
        }

        let cp = compute_mach_dependent_cp(
            &subsonic_stability,
            fin_contribution,
            fin_planform,
            mach,
            ref_diameter,
        );

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
            design_inputs: None,
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
            design_inputs: None,
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
            design_inputs: None,
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
            design_inputs: None,
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
            design_inputs: None,
        };
        let s = stability(&v).unwrap();
        // P4: this fixture's fin root (0.5..0.6 m) ends exactly at the tube /
        // boattail joint, so the mounting body is the 0.06 m tube. The pre-P4
        // oracle (total_cna 9.147693239199372, cp 0.43345124980363564) was
        // produced by the boattail aft diameter 0.04 m; the interference
        // radius is corrected here, not the geometry or the formula.
        assert_rel(s.total_cna, 10.065338167011646);
        assert_rel(s.cp, 0.4430638741488553);
        assert_rel(s.static_margin_calibers, 1.6734215508466441);
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
            design_inputs: None,
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
            Vehicle {
                components: vec![],
                design_inputs: None,
            },
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
                design_inputs: None,
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
                design_inputs: None,
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
                design_inputs: None,
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
                design_inputs: None,
            },
            "vehicle geometry: nosecone length must be finite and positive (got 0)",
        );
        expect_err(
            Vehicle {
                components: vec![nose(f64::NAN)],
                design_inputs: None,
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
                design_inputs: None,
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
                design_inputs: None,
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
                design_inputs: None,
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
                design_inputs: None,
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
                design_inputs: None,
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

    #[test]
    fn tunnel_reynolds_changes_friction_without_changing_pressure_drag() {
        let vehicle = alpha_vehicle();
        let sea_level = compute_aerodynamic_curves(&vehicle, false, 41).unwrap();
        let tunnel =
            compute_aerodynamic_curves_at_reynolds(&vehicle, false, 41, 9.8e6).unwrap();

        assert!(tunnel.drag_curves[8].friction_cd > sea_level.drag_curves[8].friction_cd);
        assert_rel(tunnel.drag_curves[8].wave_cd, sea_level.drag_curves[8].wave_cd);
    }

    #[test]
    fn fin_friction_uses_mean_chord_reynolds_length() {
        let vehicle = alpha_vehicle();
        let standard = compute_aerodynamic_curves_at_reynolds(&vehicle, false, 41, 9.8e6).unwrap();

        let mut shorter_chord = vehicle.clone();
        for component in &mut shorter_chord.components {
            if let Component::TrapezoidFin {
                root_chord,
                tip_chord,
                span,
                ..
            } = &mut component.component
            {
                *root_chord /= 2.0;
                *tip_chord /= 2.0;
                *span *= 2.0;
            }
        }
        let shorter = compute_aerodynamic_curves_at_reynolds(&shorter_chord, false, 41, 9.8e6)
            .unwrap();

        // Equal fin planform area but lower chord means lower Re and higher Cf.
        assert!(
            shorter.drag_curves[6].friction_cd > standard.drag_curves[6].friction_cd
        );
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

    // -- Fin edge drag (Niskanen 2009 §3.4.4–3.4.5) ---------------------

    #[test]
    fn fin_edge_drag_follows_the_published_build_up() {
        let ref_area = PI / 4.0 * 0.05 * 0.05;
        // Unswept square fins at M = 0: stagnation 0.85 and base 0.12, each over
        // the edge area span·thickness·count.
        let (span, thick, count) = (0.08, 0.003, 4);
        let edge = span * thick * f64::from(count) / ref_area;
        let (le, te) = compute_fin_edge_drag(count, span, 0.0, thick, FinCrossSection::Square, 0.0, ref_area);
        assert!((le - 0.85 * edge).abs() < 1e-15, "square LE {le}");
        assert!((te - 0.12 * edge).abs() < 1e-15, "square TE {te}");
        // Leading-edge term scales with cos² of the leading-edge sweep; the
        // trailing-edge term does not.
        let (le_swept, te_swept) =
            compute_fin_edge_drag(count, span, span, thick, FinCrossSection::Square, 0.0, ref_area);
        assert!((le_swept - 0.5 * le).abs() < 1e-15, "45° sweep halves LE drag: {le_swept}");
        assert_eq!(te_swept, te);
        // Cross-section precedence at M = 0.5: square > rounded > airfoil > wedge.
        let at = |xs| compute_fin_edge_drag(count, span, 0.03, thick, xs, 0.5, ref_area);
        let total = |(a, b): (f64, f64)| a + b;
        let (sq, ro, af, dw) = (
            total(at(FinCrossSection::Square)),
            total(at(FinCrossSection::Rounded)),
            total(at(FinCrossSection::Airfoil)),
            total(at(FinCrossSection::DoubleWedge)),
        );
        assert!(sq > ro && ro > af && af > dw && dw == 0.0, "{sq} {ro} {af} {dw}");
        assert_eq!(at(FinCrossSection::Airfoil).1, 0.0, "airfoil has no base drag");
        // Published branches meet at M = 1 (rounded LE and both base forms).
        let below = compute_fin_edge_drag(count, span, 0.0, thick, FinCrossSection::Rounded, 1.0 - 1e-9, ref_area);
        let above = compute_fin_edge_drag(count, span, 0.0, thick, FinCrossSection::Rounded, 1.0 + 1e-9, ref_area);
        assert!((below.0 - above.0).abs() < 1e-6 && (below.1 - above.1).abs() < 1e-6, "{below:?} {above:?}");
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
    fn aero_curves_cover_transonic_and_supersonic_range() {
        let c = compute_aerodynamic_curves(&nsl_vehicle(), false, 41).unwrap();
        assert_eq!(c.mach_points.len(), 41);
        assert_eq!(c.drag_curves.len(), 41);
        assert_transonic(c.mach_points[0], 0.0);
        assert_transonic(c.mach_points[40], 4.0);
        assert!(c.max_transonic_cd > c.subsonic_cd);
        assert!((0.9..=1.3).contains(&c.mach_at_max_cd));
        let sub_cp = c.drag_curves[0].cp;
        let super_cp = c.drag_curves[20].cp;
        assert!(super_cp < sub_cp);
    }
    #[test]
    fn raked_arcas_planform_and_transonic_fin_slope_are_geometry_based() {
        let root = 3.380 * 0.0254;
        let tip = 2.165 * 0.0254;
        let span = 2.103 * 0.0254;
        let sweep = (3.380 - 2.165) * 0.0254;
        let raked = compute_fin_planform_data(root, tip, span, sweep);
        let generic = compute_fin_planform_data(root + 2e-6, tip, span, sweep);

        assert!(raked.area_ratio < 1.0);
        assert_transonic(generic.area_ratio, 1.0);
        let at_09 = transonic_fin_lift_slope_ratio(0.9, raked);
        let at_10 = transonic_fin_lift_slope_ratio(1.0, raked);
        assert!(at_09 > 1.0);
        assert!(at_10 > at_09);

        let curves = compute_aerodynamic_curves(&nsl_vehicle(), false, 41).unwrap();
        assert!(curves.drag_curves[10].cp > curves.drag_curves[9].cp);
    }



    #[test]
    fn boat_tail_surface_drag_is_separate_from_base_pressure_drag() {
        let vehicle = Vehicle {
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
            design_inputs: None,
        };
        let with_boattail = compute_aerodynamic_curves(&vehicle, false, 41).unwrap();
        let mut without_boattail = vehicle.clone();
        without_boattail
            .components
            .retain(|component| !matches!(&component.component, Component::Transition { .. }));
        let without_boattail =
            compute_aerodynamic_curves(&without_boattail, false, 41).unwrap();

        assert!(
            with_boattail.drag_curves[10].wave_cd
                > without_boattail.drag_curves[10].wave_cd
        );
        assert_transonic(
            with_boattail.drag_curves[8].wave_cd,
            without_boattail.drag_curves[8].wave_cd,
        );
        assert!(
            with_boattail.drag_curves[10].base_cd
                < without_boattail.drag_curves[10].base_cd
        );
    }

    #[test]
    fn motor_plume_reduces_base_drag_without_changing_boattail_pressure_drag() {
        let vehicle = nsl_vehicle();
        let off = compute_aerodynamic_curves(&vehicle, false, 41).unwrap();
        let on = compute_aerodynamic_curves(&vehicle, true, 41).unwrap();
        assert!(on.drag_curves[10].base_cd < off.drag_curves[10].base_cd);
        assert!(on.drag_curves[10].total_cd < off.drag_curves[10].total_cd);
        assert_transonic(
            on.drag_curves[10].wave_cd,
            off.drag_curves[10].wave_cd,
        );
    }

    #[test]
    fn aero_curves_fail_closed_on_bad_geometry() {
        let err = aero_curves(&Vehicle {
            components: vec![],
            design_inputs: None,
        }, false).unwrap_err();
        assert_eq!(
            err,
            "vehicle geometry: vehicle has no components — mass rollup is undefined"
        );
    }

    // --- P4 fin-interference station rule ----------------------------------

    fn constant_span(start: f64, end: f64, diameter: f64) -> BodySpan {
        BodySpan { start, end, section: BodySection::Constant(diameter) }
    }

    fn taper_span(start: f64, end: f64, fore: f64, aft: f64) -> BodySpan {
        BodySpan { start, end, section: BodySection::Taper { fore, aft } }
    }

    #[test]
    fn fin_mounting_body_uses_the_largest_root_chord_overlap() {
        // 1 m tube at 0.10 followed by a 1 m boattail at 0.06.
        let spans = [constant_span(0.0, 1.0, 0.10), constant_span(1.0, 2.0, 0.06)];
        // Wholly on the tube: the pre-fix value (the boattail is seen last).
        assert_eq!(mounting_body_diameter(&spans, 0.5, 0.4, 0.06), 0.10);
        // Ends exactly at the joint: still the tube.
        assert_eq!(mounting_body_diameter(&spans, 0.6, 0.4, 0.06), 0.10);
        // 60/40 onto the boattail: the boattail.
        assert_eq!(mounting_body_diameter(&spans, 0.9, 0.5, 0.06), 0.06);
        // 60/40 onto the tube: the tube.
        assert_eq!(mounting_body_diameter(&spans, 0.7, 0.5, 0.06), 0.10);
        // Exact 50/50 (binary-exact values): forward body wins.
        assert_eq!(mounting_body_diameter(&spans, 0.75, 0.5, 0.06), 0.10);
        // No overlap at all: the documented pre-fix fallback.
        assert_eq!(mounting_body_diameter(&spans, 2.5, 0.4, 0.06), 0.06);
        // Degenerate root: fallback rather than a new failure.
        assert_eq!(mounting_body_diameter(&spans, 0.5, 0.0, 0.06), 0.06);
        assert_eq!(
            mounting_body_diameter(&spans, f64::NAN, 0.4, 0.06),
            0.06
        );
    }

    #[test]
    fn fin_mounting_body_treats_near_equal_overlaps_as_a_forward_tie() {
        // Decimal joint: 0.4..0.6 around 0.5 gives overlaps that differ only
        // in the last bits. Within 1e-9 * chord they are a tie -> forward.
        let spans = [constant_span(0.0, 0.5, 0.10), constant_span(0.5, 1.0, 0.04)];
        assert_eq!(mounting_body_diameter(&spans, 0.4, 0.2, 0.04), 0.10);
        // Just outside the tolerance the larger overlap must still win.
        let tol = 1e-9 * 0.2;
        let root_start = 0.4;
        let root_end = 0.6 + 4.0 * tol; // aft overlap exceeds forward by 4x tol
        assert_eq!(
            mounting_body_diameter(&spans, root_start, root_end - root_start, 0.04),
            0.04
        );
    }

    #[test]
    fn fin_mounting_body_handles_a_negative_offset_root() {
        // Nose 0..0.2 at 0.02, tube 0.2..1.0 at 0.10; root starts before the
        // tube datum (the torrent pattern) and is mostly on the tube.
        let spans = [constant_span(0.0, 0.2, 0.02), constant_span(0.2, 1.0, 0.10)];
        assert_eq!(mounting_body_diameter(&spans, 0.15, 0.3, 0.02), 0.10);
        // Mostly on the nose -> the nose span diameter.
        assert_eq!(mounting_body_diameter(&spans, 0.1, 0.14, 0.10), 0.02);
    }

    #[test]
    fn fin_mounting_body_uses_the_local_taper_diameter_at_the_root_mid_chord() {
        // Tube 0..1 at 0.10 followed by a conical transition 1..1.2 0.10->0.06.
        let spans = [constant_span(0.0, 1.0, 0.10), taper_span(1.0, 1.2, 0.10, 0.06)];
        // Root 1.05..1.15: mid chord 1.10 is half way down the taper -> 0.08.
        let d = mounting_body_diameter(&spans, 1.05, 0.1, 0.06);
        assert!((d - 0.08).abs() < 1e-12, "local taper diameter {d} != 0.08");
        // A root ending at the joint is still on the tube.
        assert_eq!(mounting_body_diameter(&spans, 0.9, 0.1, 0.06), 0.10);
        // A root that only grazes the aft end: mid-chord lies past the span,
        // so it clamps to the aft diameter.
        let d = mounting_body_diameter(&spans, 1.19, 0.2, 0.10);
        assert_eq!(d, 0.06);
    }

    #[test]
    fn fin_mounting_body_uses_the_nose_profile_radius_at_the_root_mid_chord() {
        // Cone: diameter is linear from 0 at the tip to 0.08 at the base.
        let cone = [BodySpan {
            start: 0.0, end: 0.4,
            section: BodySection::Nose { shape: NoseShape::Conical, base: 0.08 },
        }];
        assert!((mounting_body_diameter(&cone, 0.1, 0.2, 0.08) - 0.04).abs() < 1e-12);
        // Von Karman at u = 0.5: r = R / sqrt(2), diameter = 0.08 / sqrt(2).
        let vk = [BodySpan {
            start: 0.0, end: 0.4,
            section: BodySection::Nose { shape: NoseShape::VonKarman, base: 0.08 },
        }];
        let expected = 0.08 / 2.0_f64.sqrt();
        assert!((mounting_body_diameter(&vk, 0.1, 0.2, 0.08) - expected).abs() < 1e-12);
        // Elliptical at u = 0.5: r = R * sqrt(3) / 2.
        let ell = [BodySpan {
            start: 0.0, end: 0.4,
            section: BodySection::Nose { shape: NoseShape::Elliptical, base: 0.08 },
        }];
        let expected = 0.08 * 3.0_f64.sqrt() / 2.0;
        assert!((mounting_body_diameter(&ell, 0.1, 0.2, 0.08) - expected).abs() < 1e-12);
        // Tangent ogive at u = 0.5, L = 0.4, R = 0.04:
        // rho = (R^2 + L^2) / 2R; r = sqrt(rho^2 - (L/2)^2) + R - rho.
        let ogive = [BodySpan {
            start: 0.0, end: 0.4,
            section: BodySection::Nose { shape: NoseShape::Ogive, base: 0.08 },
        }];
        let (l, r) = (0.4_f64, 0.04_f64);
        let rho = (r * r + l * l) / (2.0 * r);
        let expected = 2.0 * ((rho * rho - (l * 0.5) * (l * 0.5)).sqrt() + r - rho);
        assert!((mounting_body_diameter(&ogive, 0.1, 0.2, 0.08) - expected).abs() < 1e-12);
    }
}
