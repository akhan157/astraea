//! calibrated II aerodynamic method (port of the TS oracle in `src/aero/calibrated`).
//!
//! Units follow the engine: inches for lengths, stations from the nose tip,
//! feet for altitude. Unsupported geometry or regimes return
//! `CalibratedError::Unsupported`; no fallback values are produced.

pub mod atmosphere;
pub mod design;
pub mod drag_subsonic;
pub mod drag_supersonic;
pub mod drag_transonic;
pub mod evaluate;
pub mod from_vehicle;
pub mod friction;
pub mod geometry;
pub mod normal_force_subsonic;
pub mod normal_force_supersonic;
pub mod normal_force_transonic;

pub use atmosphere::{atmosphere, flight_air, nozzle_pressure_thrust, FlightAir, Site};
pub use from_vehicle::{design_from_vehicle, ComponentInput, VehicleInput};
pub use design::{altitude_for_mach, Airfoil, Design, Fin, NoseShape, Part, PartKind, SurfaceFinish};
pub use drag_subsonic::{evaluate_drag_subsonic, DragSubsonic};
pub use drag_supersonic::{evaluate_drag_supersonic, DragHighMach, DragHighMachComponents};
pub use drag_transonic::evaluate_drag_transonic;
pub use evaluate::{evaluate, CpMethod, EvalOptions, Point};
pub use friction::skin_friction;
pub use normal_force_subsonic::{
    component_values, evaluate_normal_force_subsonic, jorgensen_cdc, reference, ComponentCoeff,
    ComponentValues, NormalForce, ReferenceValues,
};
pub use normal_force_supersonic::{
    evaluate_normal_force_supersonic, expansion_supersonic_o, expansion_supersonic_station,
    fin_cna_cubic_branch, fin_cna_cubic_value, fin_cna_ladder_value, fin_cna_top,
    fin_count_multiplier, fin_cp_fraction, fin_cp_num14, fin_cp_num7, fin_sweep_angles,
    has_frustum_carrier, interference_split, nose_supersonic_cna_value,
    nose_supersonic_cp_fraction, reducer_supersonic_o, reducer_supersonic_station,
    supersonic_fin_inputs, supersonic_nose_aft_length, taper_loop_ai, FinSweepAngles,
    InterferenceSplit, SupersonicComponents, SupersonicFinInputs,
};
pub use normal_force_transonic::{
    evaluate_normal_force_transonic, transonic_blend_weight,
};

use std::fmt;

#[derive(Clone, Debug, PartialEq)]
pub enum CalibratedError {
    /// Geometry or regime the method does not cover (TS CalibratedUnsupportedError).
    Unsupported(String),
    /// A required input is missing or malformed (TS CalibratedDesignError).
    Design(String),
}

impl fmt::Display for CalibratedError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CalibratedError::Unsupported(m) => write!(f, "calibrated unsupported feature: {m}"),
            CalibratedError::Design(m) => write!(f, "calibrated design error: {m}"),
        }
    }
}

impl std::error::Error for CalibratedError {}

impl From<CalibratedError> for String {
    fn from(e: CalibratedError) -> String {
        e.to_string()
    }
}
