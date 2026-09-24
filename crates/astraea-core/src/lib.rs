//! Astraea compute engines — Tauri-ready Rust core.
//!
//! The TypeScript frontend in `src/` is the untouched oracle; TS stays
//! authoritative and these modules are verified against it by parity tests.
//! Public API is coarse-grained (run_ensemble, simulate_flight,
//! solve_chamber, stability/aero_curves, aggregate_mass) — never per-step
//! serialization, per the Tauri IPC rule.

pub mod aero;
pub mod gibbs;
pub mod mass;
pub mod monte_carlo;
pub mod six_dof;
