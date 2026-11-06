//! Astraea compute engines — Tauri-ready Rust core.
//!
//! The TypeScript frontend in `src/` is the untouched oracle; TS stays
//! authoritative and these modules are verified against it by parity tests.
//! Public API is coarse-grained (run_ensemble, simulate_flight,
//! solve_chamber, stability/aero_curves, aggregate_mass) — never per-step
//! serialization, per the Tauri IPC rule. `simulate_flight` is the one
//! bounded exception: it returns a single display telemetry series
//! (`telemetry::decimate_telemetry`, at most
//! `telemetry::MAX_TELEMETRY_POINTS` points); ensembles return coarse
//! metrics only.

pub mod aero;
pub mod aero_model;
pub mod aero_coefficients;
pub mod aero_profiles;
pub mod calibrated;
pub mod axial;
pub mod equilibrium;
pub mod environment;
pub mod fin_planform;
pub mod flight_provider;
pub mod gibbs;
pub mod mass;
pub mod thermo;
#[cfg(test)]
mod test_json;
pub mod monte_carlo;
pub mod propellant;
pub mod six_dof;
pub mod skin_friction;
pub mod telemetry;
pub mod moment_arm_history;
pub mod v8_math;
