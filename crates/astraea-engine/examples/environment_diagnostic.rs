//! Native inspection tool for the opt-in, unqualified E1a environment diagnostic.
//! Usage: cargo run --offline --example environment_diagnostic -- request.json
use std::{env, fs, process};

fn main() {
    let mut args = env::args().skip(1);
    let path = match (args.next(), args.next()) {
        (Some(path), None) => path,
        _ => { eprintln!("usage: environment_diagnostic request.json"); process::exit(2); }
    };
    let raw = fs::read_to_string(path).unwrap_or_else(|error| { eprintln!("cannot read request: {error}"); process::exit(2); });
    let reply = astraea_engine::dispatch_json("evaluate_environment_diagnostic", &raw);
    println!("{reply}");
    let value: serde_json::Value = serde_json::from_str(&reply).expect("engine JSON reply");
    if value.get("error").is_some() {
        process::exit(1);
    }
}
