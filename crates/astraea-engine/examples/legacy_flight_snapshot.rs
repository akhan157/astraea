//! Synthetic regression probe for the ordinary legacy engine command.
//! Usage: cargo run --example legacy_flight_snapshot -- request.json
use std::{env, fs, process};
fn main() {
    let mut args = env::args().skip(1);
    let path = match (args.next(), args.next()) {
        (Some(path), None) => path,
        _ => { eprintln!("usage: legacy_flight_snapshot request.json"); process::exit(2); }
    };
    let request = fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("cannot read request: {e}"); process::exit(2);
    });
    let reply = astraea_engine::dispatch_json("simulate_flight", &request);
    println!("{reply}");
    let value: serde_json::Value = serde_json::from_str(&reply).expect("engine JSON reply");
    if value.get("error").is_some() { process::exit(1); }
}
