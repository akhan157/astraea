//! Adapter from the app's [`aero::Vehicle`] to the calibrated method input.
//!
//! The calibrated module keeps its own neutral [`VehicleInput`]; this file is
//! the only place the app's component model is translated. Every unsupported
//! combination refuses here with a user-facing reason; nothing is approximated.
//!
//! Units: the app is SI (metres); the adapter passes SI through and the
//! calibrated method converts once at its boundary.

use crate::aero::{Component, ComponentDesignInputs, FinCrossSection, NoseShape, Vehicle};
use crate::calibrated::{
    design_from_vehicle, CalibratedError, ComponentInput, Design, VehicleInput,
};

/// Nose profile name used by the calibrated adapter (`from_vehicle::nose_shape`).
fn nose_shape_name(shape: NoseShape) -> &'static str {
    match shape {
        NoseShape::Conical => "conical",
        NoseShape::Ogive => "ogive",
        NoseShape::Parabolic => "parabolic",
        NoseShape::VonKarman => "vonkarman",
        NoseShape::Elliptical => "elliptical",
    }
}

/// Fin cross-section name the calibrated method derives a section family from.
///
/// The app's `airfoil` label is a real section family here: the calibrated
/// method resolves it to its Subsonic NACA section unless an explicit
/// `airfoil_section` name is supplied.
fn fin_cross_section_name(section: FinCrossSection) -> &'static str {
    match section {
        FinCrossSection::Square => "square",
        FinCrossSection::Rounded => "rounded",
        FinCrossSection::DoubleWedge => "double_wedge",
        FinCrossSection::Airfoil => "airfoil",
    }
}

/// Translate one app component, or refuse it.
fn component_input(
    vc: &crate::aero::VehicleComponent,
    design: Option<&ComponentDesignInputs>,
) -> Result<ComponentInput, CalibratedError> {
    let id = vc.id.clone();
    Ok(match &vc.component {
        Component::Nosecone { shape, length, base_diameter, .. } => ComponentInput::Nosecone {
            id,
            shape: nose_shape_name(*shape).to_string(),
            exact_shape: None,
            length: Some(*length),
            base_diameter: Some(*base_diameter),
            tip_radius: None,
            power_law_exponent: None,
            calibrated_location: None,
        },
        Component::BodyTube { length, outer_diameter, .. } => ComponentInput::BodyTube {
            id,
            length: Some(*length),
            outer_diameter: Some(*outer_diameter),
            rail_guide_diameter: design.and_then(|d| d.rail_guide_diameter),
            rail_guide_height: design.and_then(|d| d.rail_guide_height),
            launch_lug_diameter: design.and_then(|d| d.launch_lug_diameter),
            launch_shoe_area: design.and_then(|d| d.launch_shoe_area),
            calibrated_location: None,
        },
        Component::Transition { length, fore_diameter, aft_diameter, .. } => {
            ComponentInput::Transition {
                id,
                length: Some(*length),
                fore_diameter: Some(*fore_diameter),
                aft_diameter: Some(*aft_diameter),
                calibrated_location: None,
            }
        }
        Component::TrapezoidFin {
            fin_count,
            root_chord,
            tip_chord,
            span,
            sweep_length,
            thickness,
            cross_section,
            axial_offset,
            ..
        } => ComponentInput::TrapezoidFinSet {
            id,
            fin_count: f64::from(*fin_count),
            root_chord: Some(*root_chord),
            tip_chord: Some(*tip_chord),
            span: Some(*span),
            sweep_length: Some(*sweep_length),
            thickness: Some(*thickness),
            cross_section: fin_cross_section_name(*cross_section).to_string(),
            axial_offset: *axial_offset,
            airfoil_section: design.and_then(|d| d.airfoil_section.clone()),
            leading_edge_bevel: design.and_then(|d| d.leading_edge_bevel),
            trailing_edge_bevel: design.and_then(|d| d.trailing_edge_bevel),
            leading_edge_radius: design.and_then(|d| d.leading_edge_radius),
        },
        Component::EllipticalFin { .. } => {
            return Err(CalibratedError::Unsupported(format!(
                "fin set '{id}' is elliptical; the calibrated method models trapezoidal fins only"
            )))
        }
        Component::FreeformFin { .. } => {
            return Err(CalibratedError::Unsupported(format!(
                "fin set '{id}' is a freeform planform; the calibrated method models trapezoidal \
                 fins only — convert it to root chord, tip chord, span and sweep to use this method"
            )))
        }
        Component::MassComp { .. } | Component::Parachute { .. } => ComponentInput::Internal,
        Component::Unknown { kind } => ComponentInput::Other {
            id,
            kind: kind.clone(),
        },
    })
}

/// Build the calibrated method input from an app vehicle.
///
/// Vehicle-level inputs absent from [`Vehicle::design_inputs`] stay absent so
/// the method's documented defaults apply. Fins attach to the preceding body
/// part by the adapter's own order rules (one fin set per body).
pub fn design_from_app_vehicle(vehicle: &Vehicle) -> Result<Design, CalibratedError> {
    let inputs = vehicle.design_inputs.as_ref();
    let mut components = Vec::with_capacity(vehicle.components.len());
    for vc in &vehicle.components {
        let design = inputs.and_then(|i| i.components.get(&vc.id));
        components.push(component_input(vc, design)?);
    }
    design_from_vehicle(&VehicleInput {
        surface_finish: inputs.and_then(|i| i.surface_finish.clone()),
        force_turbulent_flow: inputs.and_then(|i| i.force_turbulent_flow),
        nozzle_exit_diameter: inputs.and_then(|i| i.nozzle_exit_diameter),
        components,
    })
}

/// Pre-run support status for the calibrated provider.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AeroSupportStatus {
    /// The method models this vehicle; assumptions still apply.
    Supported,
    /// The method models part of the vehicle; a named term uses another source.
    Fallback,
    /// The method cannot model this vehicle; no result is produced.
    Refused,
}

/// What the UI shows before a run.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AeroSupport {
    pub status: AeroSupportStatus,
    /// Refusal or fallback reasons, in user-facing wording.
    pub reasons: Vec<String>,
    /// Defaults the run applies because the app vehicle carries no such input.
    /// The status surface must show these; they are not silent.
    pub assumptions: Vec<String>,
}

/// Defaults the run applies because the vehicle does not record them.
///
/// Only an absent vehicle-level input produces an assumption; a recorded input
/// is an explicit choice, not a default.
fn default_assumptions(vehicle: &Vehicle) -> Vec<String> {
    let inputs = vehicle.design_inputs.as_ref();
    let mut assumptions = Vec::new();
    if inputs.and_then(|i| i.surface_finish.as_ref()).is_none() {
        assumptions.push("surface finish assumed smooth (zero roughness)".to_string());
    }
    if inputs.and_then(|i| i.force_turbulent_flow).is_none() {
        assumptions.push("turbulent flow not forced".to_string());
    }
    if inputs.and_then(|i| i.nozzle_exit_diameter).is_none() {
        assumptions.push(
            "nozzle exit diameter unknown; power-on drag uses the method default".to_string(),
        );
    }
    assumptions
}

/// Classify a vehicle for the calibrated provider.
///
/// `Fallback` is not produced yet: the term-level transonic switch arrives with
/// the selection surface. Until then a supported vehicle uses the build-up for
/// every term, and an unsupported one refuses.
pub fn support(vehicle: &Vehicle) -> AeroSupport {
    match design_from_app_vehicle(vehicle) {
        Ok(_) => AeroSupport {
            status: AeroSupportStatus::Supported,
            reasons: Vec::new(),
            assumptions: default_assumptions(vehicle),
        },
        Err(CalibratedError::Unsupported(message)) => AeroSupport {
            status: AeroSupportStatus::Refused,
            reasons: vec![message],
            assumptions: Vec::new(),
        },
        Err(CalibratedError::Design(message)) => AeroSupport {
            status: AeroSupportStatus::Refused,
            reasons: vec![message],
            assumptions: Vec::new(),
        },
    }
}
