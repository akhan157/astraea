//! Astraea engine: the coarse-grained commands the app calls, as one JSON
//! dispatch over `astraea-core`.
//!
//! The same code serves two builds: natively for the parity and contract
//! tests, and as WebAssembly (`wasm` module) that the app runs in background
//! workers on the website and in the desktop shell alike. Command names and
//! argument keys are the ones `src/tauri/bridge.ts` sends.

pub mod commands;
pub mod models;
pub mod moment_arm_history;
/// Explicit candidate runtime boundary. Shared by native dispatch and the
/// WebAssembly worker; never a project/default model or implicit selection.
pub mod native_candidate;
/// Explicit E1 profile candidate envelope. Dispatched on native and wasm32
/// through the single `simulate_candidate` command.
pub mod profile_candidate;
/// Candidate input/model identity. Compiled for both targets; not a command.
pub mod candidate_identity;
/// Built-up aero model provider (stability/aero panels in this build).
pub mod aero_provider;
/// Native-only direct axial diagnostic; no app dispatch or default activation.
#[cfg(not(target_arch = "wasm32"))]
pub mod axial_diagnostic;
pub mod sb1_geometry;
pub mod sb1_diagnostic;
pub mod supplied_aero;
pub mod environment_diagnostic;
pub mod friction_diagnostic;
pub mod propellant;

#[cfg(target_arch = "wasm32")]
mod wasm;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

fn arg<T: DeserializeOwned>(args: &Value, key: &str, cmd: &str) -> Result<T, String> {
    let raw = args.get(key).cloned().unwrap_or(Value::Null);
    serde_json::from_value(raw).map_err(|e| format!("{cmd}: invalid argument '{key}': {e}"))
}

fn out<T: Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|e| format!("engine: result serialization failed: {e}"))
}

/// Run one command by name. Unknown commands and malformed arguments are
/// errors, never defaults.
pub fn dispatch(cmd: &str, args: &Value) -> Result<Value, String> {
    if cmd != "simulate_flight" && (args.get("reportMomentArmHistory").is_some()
        || args.get("req").and_then(|req| req.get("reportMomentArmHistory")).is_some())
    {
        return Err(format!("{cmd}: reportMomentArmHistory is supported only by simulate_flight"));
    }
    let report = if cmd == "simulate_flight" {
        match args.get("reportMomentArmHistory") {
            None => false,
            Some(Value::Bool(value)) => *value,
            Some(_) => return Err("simulate_flight: reportMomentArmHistory must be boolean when present".into()),
        }
    } else { false };
    match cmd {
        "evaluate_sb1_diagnostic" => sb1_diagnostic::evaluate(args),
        "evaluate_supplied_aero_diagnostic" => supplied_aero::evaluate(args),
        "evaluate_environment_diagnostic" => environment_diagnostic::evaluate(args),
        "evaluate_skin_friction_diagnostic" => friction_diagnostic::evaluate(args),
        "simulate_candidate" => native_candidate::evaluate_dispatch(args),
        "simulate_flight" => out(commands::simulate_flight_with_history(
            arg(args, "vehicle", cmd)?,
            arg(args, "motor", cmd)?,
            arg(args, "options", cmd)?,
            report,
        )?),
        "flight_summary" => out(commands::flight_summary(
            arg(args, "vehicle", cmd)?,
            arg(args, "motor", cmd)?,
            arg(args, "options", cmd)?,
        )?),
        "run_ensemble" => out(commands::run_ensemble(arg(args, "req", cmd)?)?),
        "run_ensemble_classified" => {
            out(commands::run_ensemble_classified(arg(args, "req", cmd)?)?)
        }
        "run_ensemble_chunk" => out(commands::run_ensemble_chunk(arg(args, "req", cmd)?)?),
        "solve_chamber" => out(commands::solve_chamber(arg(args, "pressure", cmd)?)?),
        "nozzle_performance" => out(commands::nozzle_performance(
            arg(args, "tc", cmd)?,
            arg(args, "gamma", cmd)?,
            arg(args, "molWeight", cmd)?,
            arg(args, "pc", cmd)?,
            arg(args, "pe", cmd)?,
            arg(args, "pa", cmd)?,
        )?),
        "ingredient_library" => out(commands::ingredient_library()),
        "propellant_performance" => out(commands::propellant_performance(arg(args, "request", cmd)?)?),
        "stability" => out(commands::stability(
            arg(args, "vehicle", cmd)?,
            arg(args, "aeroModel", cmd)?,
        )?),
        "aero_curves" => out(commands::aero_curves(
            arg(args, "vehicle", cmd)?,
            arg(args, "motorBurning", cmd)?,
            arg(args, "aeroModel", cmd)?,
        )?),
        "aero_model_status" => out(commands::aero_model_status(
            arg(args, "vehicle", cmd)?,
            arg(args, "aeroModel", cmd)?,
        )?),
        "aggregate_mass" => out(commands::aggregate_mass(arg(args, "vehicle", cmd)?)?),
        _ => Err(format!("engine: unknown command '{cmd}'")),
    }
}

/// `dispatch` over JSON text, as the WebAssembly boundary uses it: returns
/// `{"ok": result}` or `{"error": message}`.
pub fn dispatch_json(cmd: &str, args_json: &str) -> String {
    let reply = match serde_json::from_str::<Value>(args_json) {
        Ok(args) => match dispatch(cmd, &args) {
            Ok(value) => serde_json::json!({ "ok": value }),
            Err(message) => serde_json::json!({ "error": message }),
        },
        Err(e) => serde_json::json!({ "error": format!("engine: arguments are not valid JSON: {e}") }),
    };
    reply.to_string()
}
