//! Rust port of `src/aero/calibrated/fromVehicle.ts` (`calibratedDesignFromVehicle`).
//!
//! Rebuilds the calibrated method input from an Astraea vehicle: the geometric
//! inverse of `designFromCdx1` (inches, nose-referenced stations, same shapes).
//! All input lengths are SI (metres, m^2 for launch-shoe area); the TS
//! arithmetic order (metres / 0.0254) is preserved. `masscomponent` /
//! `parachute` entries are ignored. Anything with no native counterpart is
//! [`CalibratedError::Unsupported`]; missing/invalid inputs are
//! [`CalibratedError::Design`].

use super::design::{Airfoil, Design, Fin, NoseShape, Part, PartKind, SurfaceFinish};
use super::CalibratedError;

const INCH_M: f64 = 0.0254;

/// SI vehicle input (metres, m^2), camelCase JSON of `RocketVehicle`.
#[derive(Clone, Debug, Default)]
pub struct VehicleInput {
    pub surface_finish: Option<String>,
    pub force_turbulent_flow: Option<bool>,
    pub nozzle_exit_diameter: Option<f64>,
    pub components: Vec<ComponentInput>,
}

/// One SI vehicle component. Unknown/ignored TS kinds collapse to
/// `Other { kind }` / `Internal` so the adapter classifies them exactly like
/// the TS reference.
#[derive(Clone, Debug)]
pub enum ComponentInput {
    Nosecone {
        id: String,
        shape: String,
        exact_shape: Option<String>,
        length: Option<f64>,
        base_diameter: Option<f64>,
        tip_radius: Option<f64>,
        /// Native calibrated Power Law exponent (required when exact_shape is "Power Law").
        power_law_exponent: Option<f64>,
        /// Native calibrated axial station from the nose datum, meters.
        calibrated_location: Option<f64>,
    },
    BodyTube {
        id: String,
        length: Option<f64>,
        outer_diameter: Option<f64>,
        rail_guide_diameter: Option<f64>,
        rail_guide_height: Option<f64>,
        launch_lug_diameter: Option<f64>,
        launch_shoe_area: Option<f64>,
        /// Native calibrated axial station from the nose datum, meters.
        calibrated_location: Option<f64>,
    },
    Transition {
        id: String,
        length: Option<f64>,
        fore_diameter: Option<f64>,
        aft_diameter: Option<f64>,
        /// Native calibrated axial station from the nose datum, meters.
        calibrated_location: Option<f64>,
    },
    TrapezoidFinSet {
        id: String,
        fin_count: f64,
        root_chord: Option<f64>,
        tip_chord: Option<f64>,
        span: Option<f64>,
        sweep_length: Option<f64>,
        thickness: Option<f64>,
        cross_section: String,
        axial_offset: Option<f64>,
        airfoil_section: Option<String>,
        leading_edge_bevel: Option<f64>,
        trailing_edge_bevel: Option<f64>,
        leading_edge_radius: Option<f64>,
    },
    EllipticalFinSet {
        id: String,
    },
    /// `masscomponent` / `parachute`: ignored.
    Internal,
    /// Any other TS `type` (e.g. booster, stage): unsupported after the chain.
    Other {
        id: String,
        kind: String,
    },
}

fn nose_shape(shape: &str, exact_shape: Option<&str>) -> Result<NoseShape, CalibratedError> {
    if exact_shape == Some("Power Law") {
        return Ok(NoseShape::PowerLaw);
    }
    if exact_shape == Some("LV-Haack") {
        return Ok(NoseShape::LvHaack);
    }
    Ok(match shape {
        "ogive" => NoseShape::TangentOgive,
        "vonkarman" => NoseShape::VonKarmanOgive,
        "conical" => NoseShape::Conical,
        "parabolic" => NoseShape::Parabolic,
        "elliptical" => NoseShape::Elliptical,
        other => {
            return Err(CalibratedError::Unsupported(format!(
                "unsupported nose shape: {other}"
            )))
        }
    })
}

/// Finish an unset vehicle flies with: calibrated II's new-design default.
pub const DEFAULT_SURFACE_FINISH: &str = "Smooth (Zero Roughness)";

fn surface_finish(name: &str) -> Result<SurfaceFinish, CalibratedError> {
    SurfaceFinish::from_calibrated_name(name)
}

fn airfoil(cross_section: &str, airfoil_section: Option<&str>) -> Result<Airfoil, CalibratedError> {
    let derived = match cross_section {
        "square" => "Square",
        "rounded" => "Rounded",
        "double_wedge" => "Double Wedge",
        "airfoil" => "Subsonic NACA",
        _ => "",
    };
    let name = airfoil_section.unwrap_or(derived);
    Airfoil::from_calibrated_name(name).map_err(|_| {
        CalibratedError::Unsupported(format!(
            "unsupported fin airfoil section: {}",
            airfoil_section.unwrap_or(cross_section)
        ))
    })
}

/// Shortest-round-trip number text matching TS `${n}` (JS prints
/// Infinity/-Infinity where Rust prints inf/-inf).
fn ts_num(n: f64) -> String {
    if n == f64::INFINITY {
        "Infinity".to_string()
    } else if n == f64::NEG_INFINITY {
        "-Infinity".to_string()
    } else {
        format!("{n}")
    }
}
/// Required finite number, converted to inches.
fn inches(value: f64, label: &str) -> Result<f64, CalibratedError> {
    if !value.is_finite() {
        return Err(CalibratedError::Design(format!("{label} must be a finite number")));
    }
    Ok(value / INCH_M)
}

fn req_inches(value: Option<f64>, label: &str) -> Result<f64, CalibratedError> {
    match value {
        Some(v) => inches(v, label),
        None => Err(CalibratedError::Design(format!("{label} must be a finite number"))),
    }
}

/// Absent optional numbers mean 0, exactly as designFromCdx1's optionalNumber does.
fn opt_inches(value: Option<f64>, label: &str) -> Result<f64, CalibratedError> {
    match value {
        None => Ok(0.0),
        Some(v) => inches(v, label),
    }
}

#[derive(Clone, Debug)]
struct AttachedFin {
    index: usize,
    tube_front: f64,
}

#[derive(Clone, Debug)]
struct MainBody {
    front: f64,
    length: f64,
    diameter: f64,
    rail_diameter: f64,
    rail_height: f64,
    lug_diameter: f64,
    shoe_area: f64,
    fin: Option<AttachedFin>,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum TailKind {
    Fincan,
    Boat,
}

/// Optional native station (meters) in inches; absent stays absent.
fn opt_station(value: Option<f64>, label: &str) -> Result<Option<f64>, CalibratedError> {
    match value {
        None => Ok(None),
        Some(m) => inches(m, label).map(Some),
    }
}

/// Tail parse state: TS `consumeFincan` / `consumeBoat` and their shared
/// cursor, in the same order and with the same refusals.
struct Tail {
    pos: usize,
    cursor: f64,
    /// Running outer diameter from the nose base (engine load-time junction
    /// rule, `ar.cs` `j()`): each section's fore diameter is this value.
    running: f64,
    expansion: Option<usize>,
    follower: Option<usize>,
    follower_front: f64,
    follower_fin: Option<AttachedFin>,
    fincan_inside: f64,
    fincan_dia: f64,
    boat: Option<usize>,
    boat_front: f64,
    standalone: Option<usize>,
    standalone_front: f64,
    order: Vec<TailKind>,
}

impl Tail {
    fn consume_fincan(&mut self, v: &VehicleInput, ext: &[usize]) -> Result<(), CalibratedError> {
        let gi = ext[self.pos];
        let (t_id, t_len, t_fore, t_aft) = match &v.components[gi] {
            ComponentInput::Transition { id, length, fore_diameter, aft_diameter, .. } => {
                (id.clone(), *length, *fore_diameter, *aft_diameter)
            }
            _ => return Ok(()),
        };
        let follower = ext
            .get(self.pos + 1)
            .copied()
            .filter(|&f| matches!(v.components[f], ComponentInput::BodyTube { .. }));
        let Some(f) = follower else {
            // A native Transition is independent geometry. Only interpret it as a
            // FinCan shoulder when its immediately following tube has the matching
            // rear diameter. The standalone W20 transition has no follower tube.
            if self.standalone.is_some() {
                return Err(CalibratedError::Unsupported(format!(
                    "multiple standalone expanding transitions are unsupported (at '{t_id}')"
                )));
            }
            self.standalone = Some(gi);
            self.standalone_front = self.running;
            self.pos += 1;
            return Ok(());
        };
        let (f_id, f_len, f_outer, f_loc) = match &v.components[f] {
            ComponentInput::BodyTube { id, length, outer_diameter, calibrated_location, .. } => {
                (id.clone(), *length, *outer_diameter, *calibrated_location)
            }
            _ => unreachable!(),
        };
        // Validated; the engine overwrites the follower with the running
        // diameter (junction rule), so the raw value never reaches the chain.
        req_inches(f_outer, &format!("bodytube '{f_id}'.outerDiameter"))?;
        let fore = req_inches(t_fore, &format!("transition '{t_id}'.foreDiameter"))?;
        let aft = req_inches(t_aft, &format!("transition '{t_id}'.aftDiameter"))?;
        // Junction rule (`j()`): FinCan inside := running; outside keeps the
        // raw wall delta (inside + raw diameter - raw inside).
        self.fincan_inside = self.running;
        self.fincan_dia = self.running + (aft - fore);
        self.running = self.fincan_dia;
        self.expansion = Some(gi);
        self.follower = Some(f);
        let exp_len = req_inches(t_len, &format!("transition '{t_id}'.length"))?;
        let follower_len = req_inches(f_len, &format!("bodytube '{f_id}'.length"))?;
        self.follower_front = match opt_station(f_loc, &format!("bodytube '{f_id}'.noseStationM"))? {
            Some(station) => station,
            None => self.cursor + exp_len,
        };
        self.cursor = self.cursor.max(self.follower_front + follower_len);
        self.pos += 2;
        if self.pos < ext.len() {
            let mgi = ext[self.pos];
            match &v.components[mgi] {
                ComponentInput::TrapezoidFinSet { .. } => {
                    self.follower_fin = Some(AttachedFin { index: mgi, tube_front: self.follower_front });
                    self.pos += 1;
                    if self.pos < ext.len()
                        && matches!(v.components[ext[self.pos]], ComponentInput::TrapezoidFinSet { .. })
                    {
                        return Err(CalibratedError::Unsupported(format!(
                            "multiple fin sets on one body part ({}, {})",
                            fin_id(&v.components, mgi),
                            fin_id(&v.components, ext[self.pos])
                        )));
                    }
                }
                ComponentInput::EllipticalFinSet { .. } => {
                    return Err(CalibratedError::Unsupported(
                        "elliptical fin sets are not supported by the calibrated method".into(),
                    ));
                }
                _ => {}
            }
        }
        self.order.push(TailKind::Fincan);
        Ok(())
    }

    fn consume_boat(&mut self, v: &VehicleInput, ext: &[usize]) -> Result<(), CalibratedError> {
        let gi = ext[self.pos];
        let (t_id, t_len, t_loc) = match &v.components[gi] {
            ComponentInput::Transition { id, length, calibrated_location, .. } => (id.clone(), *length, *calibrated_location),
            _ => return Ok(()),
        };
        self.boat = Some(gi);
        // Junction rule: a BoatTail takes the running diameter as its front
        // diameter and passes nothing on.
        self.boat_front = self.running;
        let front = match opt_station(t_loc, &format!("transition '{t_id}'.noseStationM"))? {
            Some(station) => station,
            None => self.cursor,
        };
        self.cursor = self.cursor.max(front + req_inches(t_len, &format!("transition '{t_id}'.length"))?);
        self.pos += 1;
        self.order.push(TailKind::Boat);
        Ok(())
    }
}

fn fin_id(v: &[ComponentInput], index: usize) -> String {
    match &v[index] {
        ComponentInput::TrapezoidFinSet { id, .. } => id.clone(),
        ComponentInput::EllipticalFinSet { id } => id.clone(),
        _ => format!("component {index}"),
    }
}

fn comp_id(v: &[ComponentInput], index: usize) -> String {
    match &v[index] {
        ComponentInput::Nosecone { id, .. } => id.clone(),
        ComponentInput::BodyTube { id, .. } => id.clone(),
        ComponentInput::Transition { id, .. } => id.clone(),
        ComponentInput::TrapezoidFinSet { id, .. } => id.clone(),
        ComponentInput::EllipticalFinSet { id } => id.clone(),
        ComponentInput::Other { id, .. } => id.clone(),
        ComponentInput::Internal => format!("component {index}"),
    }
}

fn comp_kind(v: &[ComponentInput], index: usize) -> String {
    match &v[index] {
        ComponentInput::Nosecone { .. } => "nosecone".to_string(),
        ComponentInput::BodyTube { .. } => "bodytube".to_string(),
        ComponentInput::Transition { .. } => "transition".to_string(),
        ComponentInput::TrapezoidFinSet { .. } => "trapezoidfinset".to_string(),
        ComponentInput::EllipticalFinSet { .. } => "ellipticalfinset".to_string(),
        ComponentInput::Internal => "internal".to_string(),
        ComponentInput::Other { kind, .. } => kind.clone(),
    }
}

/// Rebuild the calibrated method input from an Astraea vehicle. See module docs.
pub fn design_from_vehicle(v: &VehicleInput) -> Result<Design, CalibratedError> {
    let externals: Vec<usize> = v
        .components
        .iter()
        .enumerate()
        .filter(|(_, c)| !matches!(c, ComponentInput::Internal))
        .map(|(i, _)| i)
        .collect();
    let (nose_shape_str, nose_exact, nose_len_raw, nose_dia_raw, nose_blunt_raw, nose_exponent, nose_loc) =
        match externals.first().and_then(|&i| match &v.components[i] {
            ComponentInput::Nosecone { shape, exact_shape, length, base_diameter, tip_radius, power_law_exponent, calibrated_location, .. } => Some((
                shape.clone(),
                exact_shape.clone(),
                *length,
                *base_diameter,
                *tip_radius,
                *power_law_exponent,
                *calibrated_location,
            )),
            _ => None,
        }) {
            Some(t) => t,
            None => {
                return Err(CalibratedError::Unsupported(
                    "expected a single nosecone as the first component".into(),
                ))
            }
        };
    let power_law = nose_exact.as_deref() == Some("Power Law");
    if power_law {
        match nose_exponent {
            None => {
                return Err(CalibratedError::Unsupported(
                    "Power Law nose requires the native PowerLaw exponent".into(),
                ))
            }
            Some(e) if !e.is_finite() || !(0.0..=1.0).contains(&e) => {
                return Err(CalibratedError::Design(format!(
                    "Power Law nose exponent must be in [0, 1] (got {})",
                    ts_num(e)
                )))
            }
            Some(_) => {}
        }
    }
    let nose_shape = nose_shape(&nose_shape_str, nose_exact.as_deref())?;

    // Unset finish flies calibrated II's own new-design default (mirrors TS
    // `DEFAULT_SURFACE_FINISH` in src/core/types.ts).
    let surface = surface_finish(v.surface_finish.as_deref().unwrap_or(DEFAULT_SURFACE_FINISH))?;
    let turbulence = v.force_turbulent_flow.unwrap_or(false);
    let sustainer_nozzle = opt_inches(v.nozzle_exit_diameter, "vehicle.nozzleExitDiameter")?;

    let nose_len = req_inches(nose_len_raw, "nosecone.length")?;
    let nose_dia = req_inches(nose_dia_raw, "nosecone.baseDiameter")?;
    let nose_blunt = opt_inches(nose_blunt_raw, "nosecone.tipRadius")?;

    let nose_front = opt_station(nose_loc, "nosecone.noseStationM")?.unwrap_or(0.0);
    let mut cursor = nose_front + nose_len;
    let mut body: Option<MainBody> = None;
    let mut last_tube_front = 0.0;
    let mut last_was_tube = false;
    let mut pos = 1usize;

    // Main body run: consecutive body tubes merge into one body part (lengths
    // summed, at most one fin set across them). Engine load-time junction rule
    // (`ar.cs` `j()`): each tube takes the running diameter from the nose base,
    // so a raw outer-diameter difference never forms a junction step.
    let running = nose_dia;
    while pos < externals.len() {
        let gi = externals[pos];
        match &v.components[gi] {
            ComponentInput::BodyTube { id, length, outer_diameter, rail_guide_diameter, rail_guide_height, launch_lug_diameter, launch_shoe_area, calibrated_location } => {
                let len = req_inches(*length, &format!("bodytube '{id}'.length"))?;
                // Validated; overwritten at load (junction rule).
                req_inches(*outer_diameter, &format!("bodytube '{id}'.outerDiameter"))?;
                let tube_front = opt_station(*calibrated_location, &format!("bodytube '{id}'.noseStationM"))?
                    .unwrap_or(cursor);
                if let Some(b) = &body {
                    if (tube_front - (b.front + b.length)).abs() > 1e-9 {
                        return Err(CalibratedError::Unsupported(format!(
                            "body tube '{id}' is not contiguous with the preceding normalized body run"
                        )));
                    }
                }
                let shoe = match launch_shoe_area {
                    None => 0.0,
                    Some(a) => inches(*a, &format!("bodytube '{id}'.launchShoeArea"))? / INCH_M,
                };
                let prot = (
                    opt_inches(*rail_guide_diameter, &format!("bodytube '{id}'.railGuideDiameter"))?,
                    opt_inches(*rail_guide_height, &format!("bodytube '{id}'.railGuideHeight"))?,
                    opt_inches(*launch_lug_diameter, &format!("bodytube '{id}'.launchLugDiameter"))?,
                    shoe,
                );
                let has_prot = prot.0 != 0.0 || prot.1 != 0.0 || prot.2 != 0.0 || prot.3 != 0.0;
                match &mut body {
                    None => {
                        body = Some(MainBody {
                            front: tube_front,
                            length: 0.0,
                            diameter: running,
                            rail_diameter: prot.0,
                            rail_height: prot.1,
                            lug_diameter: prot.2,
                            shoe_area: prot.3,
                            fin: None,
                        });
                    }
                    Some(b) => {
                        if has_prot {
                            // calibrated carries one rail/lug/shoe set per body part; merging two would invent a combination.
                            if b.rail_diameter != 0.0 || b.rail_height != 0.0 || b.lug_diameter != 0.0 || b.shoe_area != 0.0 {
                                return Err(CalibratedError::Unsupported(format!(
                                    "rail guide / launch lug / launch shoe inputs on more than one merged body tube (at '{id}')"
                                )));
                            }
                            b.rail_diameter = prot.0;
                            b.rail_height = prot.1;
                            b.lug_diameter = prot.2;
                            b.shoe_area = prot.3;
                        }
                    }
                }
                if let Some(b) = &mut body {
                    b.length += len;
                }
                last_tube_front = tube_front;
                cursor = cursor.max(tube_front + len);
                last_was_tube = true;
                pos += 1;
            }
            ComponentInput::TrapezoidFinSet { .. } => {
                let bad_attach = body.is_none() || !last_was_tube;
                if bad_attach {
                    if let Some(b) = &body {
                        if let Some(f) = &b.fin {
                            return Err(CalibratedError::Unsupported(format!(
                                "multiple fin sets on one body part ({}, {})",
                                fin_id(&v.components, f.index),
                                fin_id(&v.components, gi)
                            )));
                        }
                    }
                    return Err(CalibratedError::Unsupported(format!(
                        "fin set '{}' does not follow a body tube",
                        fin_id(&v.components, gi)
                    )));
                }
                if let Some(b) = &body {
                    if let Some(f) = &b.fin {
                        return Err(CalibratedError::Unsupported(format!(
                            "multiple fin sets on one body part ({}, {})",
                            fin_id(&v.components, f.index),
                            fin_id(&v.components, gi)
                        )));
                    }
                }
                if let Some(b) = &mut body {
                    b.fin = Some(AttachedFin { index: gi, tube_front: last_tube_front });
                }
                last_was_tube = false;
                pos += 1;
            }
            ComponentInput::EllipticalFinSet { .. } => {
                return Err(CalibratedError::Unsupported(
                    "elliptical fin sets are not supported by the calibrated method".into(),
                ));
            }
            _ => break,
        }
    }
    let body = match body {
        Some(b) => b,
        None => {
            return Err(CalibratedError::Unsupported(
                "expected at least one body tube after the nosecone".into(),
            ))
        }
    };

    // Tail: optionally an expanding transition immediately followed by a
    // bodytube (fin can) and/or a reducing transition (boattail), in either
    // order relative to each other, plus at most one standalone expanding
    // transition, and nothing external after.
    let mut tail = Tail {
        pos,
        cursor,
        running: nose_dia,
        expansion: None,
        follower: None,
        follower_front: 0.0,
        follower_fin: None,
        fincan_inside: 0.0,
        fincan_dia: 0.0,
        boat: None,
        boat_front: 0.0,
        standalone: None,
        standalone_front: 0.0,
        order: Vec::new(),
    };
    let at_transition = |pos: usize| -> bool {
        pos < externals.len() && matches!(v.components[externals[pos]], ComponentInput::Transition { .. })
    };
    // Junction rule: a Transition is an Expansion when its rewritten front
    // (running) is below its rear, a Reducer otherwise (a6.cs LoadRocketParts).
    let classify = |gi: usize, running: f64| -> &'static str {
        match &v.components[gi] {
            ComponentInput::Transition { aft_diameter, .. } => {
                let aft = match aft_diameter {
                    Some(m) => inches(*m, "transition.aftDiameter").unwrap_or(f64::NAN),
                    None => f64::NAN,
                };
                if aft > running {
                    "fincan"
                } else if aft < running {
                    "boat"
                } else {
                    "flat"
                }
            }
            _ => "flat",
        }
    };
    let flat_error = |gi: usize| {
        CalibratedError::Unsupported(format!(
            "transition '{}' with equal fore/aft diameters cannot be classified as a fin can or a boattail",
            comp_id(&v.components, gi)
        ))
    };

    if at_transition(tail.pos) {
        let gi = externals[tail.pos];
        match classify(gi, tail.running) {
            "fincan" => tail.consume_fincan(v, &externals)?,
            "boat" => tail.consume_boat(v, &externals)?,
            _ => return Err(flat_error(gi)),
        }
    }
    if at_transition(tail.pos) {
        let gi = externals[tail.pos];
        match classify(gi, tail.running) {
            "fincan" if tail.expansion.is_none() => tail.consume_fincan(v, &externals)?,
            "boat" if tail.boat.is_none() => tail.consume_boat(v, &externals)?,
            "flat" => return Err(flat_error(gi)),
            _ => {
                return Err(CalibratedError::Unsupported(format!(
                    "extra transitions are not supported by the calibrated method (at '{}')",
                    comp_id(&v.components, gi)
                )));
            }
        }
    }
    if tail.pos < externals.len() {
        let gi = externals[tail.pos];
        let rest_id = comp_id(&v.components, gi);
        match &v.components[gi] {
            ComponentInput::BodyTube { .. } => {
                if tail.boat.is_some() {
                    return Err(CalibratedError::Unsupported(format!(
                        "body tube '{rest_id}' after the boattail is not supported by the calibrated method"
                    )));
                }
                return Err(CalibratedError::Unsupported(format!(
                    "body tube '{rest_id}' after the fin can is not supported by the calibrated method"
                )));
            }
            ComponentInput::TrapezoidFinSet { .. } | ComponentInput::EllipticalFinSet { .. } => {
                return Err(CalibratedError::Unsupported(format!(
                    "fin set '{rest_id}' does not follow a body tube"
                )));
            }
            ComponentInput::Transition { .. } => {
                return Err(CalibratedError::Unsupported(format!(
                    "extra transitions are not supported by the calibrated method (at '{rest_id}')"
                )));
            }
            _ => {
                return Err(CalibratedError::Unsupported(format!(
                    "unsupported component '{rest_id}' of type '{}' after the sustainer chain",
                    comp_kind(&v.components, gi)
                )));
            }
        }
    }

    let build_fin = |attached: &AttachedFin,
                     parent_aft: f64,
                     parent_diameter: f64,
                     rear_diameter: f64|
     -> Result<Fin, CalibratedError> {
        let (id, fin_count, root_chord, tip_chord, span, sweep_length, thickness, cross_section, axial_offset, airfoil_section, le_bevel, te_bevel, le_radius) =
            match &v.components[attached.index] {
                ComponentInput::TrapezoidFinSet { id, fin_count, root_chord, tip_chord, span, sweep_length, thickness, cross_section, axial_offset, airfoil_section, leading_edge_bevel, trailing_edge_bevel, leading_edge_radius } => (
                    id.clone(), *fin_count, *root_chord, *tip_chord, *span, *sweep_length, *thickness,
                    cross_section.clone(), *axial_offset, airfoil_section.clone(),
                    *leading_edge_bevel, *trailing_edge_bevel, *leading_edge_radius,
                ),
                _ => unreachable!(),
            };
        if fin_count.fract() != 0.0 || !(3.0..=8.0).contains(&fin_count) {
            // TS: Number.isInteger (+ range); NaN/Infinity fail isInteger -> Design error.
            // Rust f64::fract on NaN/Inf is defined; range check rejects them the same way.
            return Err(CalibratedError::Design(format!(
                "fin set '{id}'.finCount must be an integer from 3 through 8, as calibrated requires (got {})",
                ts_num(fin_count)
            )));
        }
        let af = airfoil(&cross_section, airfoil_section.as_deref())?;
        let chord = req_inches(root_chord, &format!("fin set '{id}'.rootChord"))?;
        let axial = req_inches(axial_offset, &format!("fin set '{id}'.axialOffset"))?;
        let leading_edge = attached.tube_front + axial;
        Ok(Fin {
            chord,
            tip: req_inches(tip_chord, &format!("fin set '{id}'.tipChord"))?,
            sweep: req_inches(sweep_length, &format!("fin set '{id}'.sweepLength"))?,
            span: req_inches(span, &format!("fin set '{id}'.span"))?,
            thickness: req_inches(thickness, &format!("fin set '{id}'.thickness"))?,
            count: fin_count as u32,
            airfoil: af,
            location: parent_aft - leading_edge,
            fx1: opt_inches(le_bevel, &format!("fin set '{id}'.leadingEdgeBevel"))?,
            fx3: opt_inches(te_bevel, &format!("fin set '{id}'.trailingEdgeBevel"))?,
            le_radius: opt_inches(le_radius, &format!("fin set '{id}'.leadingEdgeRadius"))?,
            parent_diameter,
            rear_diameter,
            leading_edge,
        })
    };

    let frustum = |kind: PartKind, length: f64, diameter: f64, rear: f64, location: f64| Part {
        kind,
        length,
        diameter,
        rear_diameter: Some(rear),
        blunt_radius: None,
        location,
        rail_diameter: None,
        rail_height: None,
        lug_diameter: None,
        shoe_area: None,
        fin: None,
    };
    // The front station after everything pushed so far (TS `boatLocation`).
    let next_station = |chain: &[Part]| -> f64 { chain.iter().map(|p| p.length).sum() };

    let mut chain: Vec<Part> = vec![
        Part {
            kind: PartKind::Nose,
            length: nose_len,
            diameter: nose_dia,
            rear_diameter: None,
            blunt_radius: Some(nose_blunt),
            location: nose_front,
            rail_diameter: None,
            rail_height: None,
            lug_diameter: None,
            shoe_area: None,
            fin: None,
        },
        Part {
            kind: PartKind::Body,
            length: body.length,
            diameter: body.diameter,
            rear_diameter: None,
            blunt_radius: None,
            location: body.front,
            rail_diameter: Some(body.rail_diameter),
            rail_height: Some(body.rail_height),
            lug_diameter: Some(body.lug_diameter),
            shoe_area: Some(body.shoe_area),
            fin: None,
        },
    ];

    let exp_len = match tail.expansion {
        Some(gi) => match &v.components[gi] {
            ComponentInput::Transition { id, length, .. } => {
                req_inches(*length, &format!("transition '{id}'.length"))?
            }
            _ => unreachable!(),
        },
        None => 0.0,
    };
    let follower_len = match tail.follower {
        Some(f) => match &v.components[f] {
            ComponentInput::BodyTube { id, length, .. } => {
                req_inches(*length, &format!("bodytube '{id}'.length"))?
            }
            _ => unreachable!(),
        },
        None => 0.0,
    };
    // For a fin on the main body when a fin can follows, the parent aft end is
    // the RAW body end (body aft + shoulder + fin-can length), matching the
    // engine's raw-length wiring.
    let body_parent_aft = if tail.expansion.is_some() && tail.follower.is_some() {
        body.front + body.length + exp_len + follower_len
    } else {
        body.front + body.length
    };

    let (mut boat_front, mut boat_rear, mut boat_len, mut boat_loc) = (0.0, 0.0, 0.0, None);
    if let Some(gi) = tail.boat {
        match &v.components[gi] {
            ComponentInput::Transition { id, length, aft_diameter, calibrated_location, .. } => {
                boat_front = tail.boat_front;
                boat_rear = req_inches(*aft_diameter, &format!("transition '{id}'.aftDiameter"))?;
                boat_len = req_inches(*length, &format!("transition '{id}'.length"))?;
                boat_loc = opt_station(*calibrated_location, &format!("transition '{id}'.noseStationM"))?;
            }
            _ => unreachable!(),
        }
    }
    if let Some(attached) = &body.fin {
        let (fin_id_str, root_chord, axial_offset) = match &v.components[attached.index] {
            ComponentInput::TrapezoidFinSet { id, root_chord, axial_offset, .. } => {
                (id.clone(), *root_chord, *axial_offset)
            }
            _ => unreachable!(),
        };
        let chord = req_inches(root_chord, &format!("fin set '{fin_id_str}'.rootChord"))?;
        // Fin overhang taper: when the root chord extends past the parent's aft
        // end onto a following boattail, the rear diameter is the boattail
        // diameter at the trailing station (overhang = max(chord - location, 0)).
        let mut rear = body.diameter;
        if tail.boat.is_some() {
            let location = body_parent_aft
                - (attached.tube_front
                    + req_inches(axial_offset, &format!("fin set '{fin_id_str}'.axialOffset"))?);
            let overhang = (chord - location).max(0.0);
            if overhang > 0.0 {
                rear = boat_front - ((boat_front - boat_rear) / boat_len) * overhang;
            }
        }
        chain[1].fin = Some(build_fin(attached, body_parent_aft, body.diameter, rear)?);
    }

    for kind in &tail.order {
        match kind {
            TailKind::Fincan => {
                let exp_gi = tail.expansion.unwrap();
                let fol_gi = tail.follower.unwrap();
                let (exp_id, exp_loc) = match &v.components[exp_gi] {
                    ComponentInput::Transition { id, calibrated_location, .. } => {
                        (id.clone(), *calibrated_location)
                    }
                    _ => unreachable!(),
                };
                // Junction rule: inside := running, outside keeps the raw wall
                // delta; the follower tube takes the outside diameter (`j()`).
                let inside = tail.fincan_inside;
                let fc_dia = tail.fincan_dia;
                let (fol_id, fol_rail_d, fol_rail_h, fol_lug, fol_shoe) = match &v.components[fol_gi] {
                    ComponentInput::BodyTube { id, rail_guide_diameter, rail_guide_height, launch_lug_diameter, launch_shoe_area, .. } => (
                        id.clone(), *rail_guide_diameter, *rail_guide_height,
                        *launch_lug_diameter, *launch_shoe_area,
                    ),
                    _ => unreachable!(),
                };
                let shoe = match fol_shoe {
                    None => 0.0,
                    Some(a) => inches(a, &format!("bodytube '{fol_id}'.launchShoeArea"))? / INCH_M,
                };
                let exp_location = opt_station(exp_loc, &format!("transition '{exp_id}'.noseStationM"))?
                    .unwrap_or(body.front + body.length);
                chain.push(frustum(PartKind::Expansion, exp_len, inside, fc_dia, exp_location));
                chain.push(Part {
                    kind: PartKind::Body,
                    length: follower_len,
                    diameter: fc_dia,
                    rear_diameter: None,
                    blunt_radius: None,
                    location: tail.follower_front,
                    rail_diameter: Some(opt_inches(
                        fol_rail_d,
                        &format!("bodytube '{fol_id}'.railGuideDiameter"),
                    )?),
                    rail_height: Some(opt_inches(
                        fol_rail_h,
                        &format!("bodytube '{fol_id}'.railGuideHeight"),
                    )?),
                    lug_diameter: Some(opt_inches(
                        fol_lug,
                        &format!("bodytube '{fol_id}'.launchLugDiameter"),
                    )?),
                    shoe_area: Some(shoe),
                    fin: match &tail.follower_fin {
                        Some(a) => Some(build_fin(a, tail.follower_front + follower_len, fc_dia, fc_dia)?),
                        None => None,
                    },
                });
            }
            TailKind::Boat => {
                let location = boat_loc.unwrap_or_else(|| next_station(&chain));
                chain.push(frustum(PartKind::Reducer, boat_len, boat_front, boat_rear, location));
            }
        }
    }
    // designFromCdx1 appends the native Transition after the standard BoatTail
    // and FinCan entries, independent of its XML key's position.
    if let Some(gi) = tail.standalone {
        match &v.components[gi] {
            ComponentInput::Transition { id, length, aft_diameter, calibrated_location, .. } => {
                let len = req_inches(*length, &format!("transition '{id}'.length"))?;
                let fore = tail.standalone_front;
                let aft = req_inches(*aft_diameter, &format!("transition '{id}'.aftDiameter"))?;
                let location = opt_station(*calibrated_location, &format!("transition '{id}'.noseStationM"))?
                    .unwrap_or_else(|| next_station(&chain));
                chain.push(frustum(PartKind::Expansion, len, fore, aft, location));
            }
            _ => unreachable!(),
        }
    }

    let sustainer_length: f64 = chain.iter().map(|p| p.length).sum();
    let mut max_diameter: f64 = 0.0;
    for part in &chain {
        max_diameter = max_diameter.max(part.diameter).max(part.aft_diameter());
    }
    let first_diameter = chain[0].diameter;
    let base_diameter = chain.last().map_or(first_diameter, Part::aft_diameter);

    Ok(Design {
        nose_shape,
        nose_power_law_exponent: if power_law { nose_exponent } else { None },
        surface,
        turbulence,
        sustainer_nozzle,
        chain,
        sustainer_length,
        max_diameter,
        first_diameter,
        base_diameter,
        mach_alt: Vec::new(),
    })
}

#[cfg(test)]
mod from_vehicle_unit_tests {
    use super::*;

    fn simple_vehicle() -> VehicleInput {
        VehicleInput {
            surface_finish: Some("Smooth (Zero Roughness)".to_string()),
            force_turbulent_flow: Some(false),
            nozzle_exit_diameter: None,
            components: vec![
                ComponentInput::Nosecone {
                    id: "nose".to_string(),
                    shape: "ogive".to_string(),
                    exact_shape: None,
                    length: Some(0.3),
                    base_diameter: Some(0.075),
                    tip_radius: None,
                    power_law_exponent: None,
                    calibrated_location: None,
                },
                ComponentInput::BodyTube {
                    id: "a".to_string(),
                    length: Some(1.0),
                    outer_diameter: Some(0.075),
                    rail_guide_diameter: None,
                    rail_guide_height: None,
                    launch_lug_diameter: None,
                    launch_shoe_area: None,
                    calibrated_location: None,
                },
            ],
        }
    }

    #[test]
    fn minimal_vehicle_builds_chain() {
        let d = design_from_vehicle(&simple_vehicle()).unwrap();
        assert_eq!(d.chain.len(), 2);
        assert_eq!(d.mach_alt.len(), 0);
        assert!(!d.turbulence);
    }

    #[test]
    fn junction_step_normalizes_to_the_running_diameter() {
        let mut v = simple_vehicle();
        match &mut v.components[1] {
            // Nose base 0.075 against a 0.0712 body: a raw junction step.
            ComponentInput::BodyTube { outer_diameter, .. } => *outer_diameter = Some(0.0712),
            _ => unreachable!(),
        }
        // Engine load-time junction rule (ar.cs j()): the body tube takes the
        // running diameter (the nose base), so the step never reaches the chain.
        let d = design_from_vehicle(&v).unwrap();
        assert!((d.chain[1].diameter - d.chain[0].diameter).abs() < 1e-12);
        assert!((d.chain[1].diameter - 0.075 / INCH_M).abs() < 1e-9);
    }
}
