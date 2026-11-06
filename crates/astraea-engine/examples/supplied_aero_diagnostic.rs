//! Native inspection tool for the opt-in, empirically unqualified diagnostic.
//! Usage: cargo run --offline --example supplied_aero_diagnostic -- request.json
//! The file contains the full arguments to evaluate_supplied_aero_diagnostic.
use std::{env, fs, process};

fn main() {
    let mut args = env::args().skip(1);
    let path = match (args.next(), args.next()) {
        (Some(path), None) => path,
        _ => {
            eprintln!("usage: supplied_aero_diagnostic request.json");
            process::exit(2);
        }
    };
    let request = fs::read_to_string(&path).unwrap_or_else(|error| {
        eprintln!("cannot read request: {error}");
        process::exit(2);
    });
    let reply = astraea_engine::dispatch_json("evaluate_supplied_aero_diagnostic", &request);
    println!("{reply}");
    // A rejected diagnostic is not a successful evaluation. Preserve the engine's
    // error envelope on stdout so callers can retain the exact explanation.
    let value: serde_json::Value = serde_json::from_str(&reply).expect("engine JSON reply");
    if value.get("error").is_some() {
        process::exit(1);
    }
}
