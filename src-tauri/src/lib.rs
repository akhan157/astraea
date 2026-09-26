//! Astraea workstation library entry: registers the coarse-grained IPC
//! commands on the Tauri app handle (flight/ensemble, chamber+nozzle,
//! stability/curves, mass — never per-step).

pub mod commands;
pub mod models;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::run_ensemble,
            commands::run_ensemble_chunk,
            commands::simulate_flight,
            commands::solve_chamber,
            commands::nozzle_performance,
            commands::stability,
            commands::aero_curves,
            commands::aggregate_mass,
        ])
        .run(tauri::generate_context!())
        .expect("error while running astraea workstation");
}
