//! Explicit `simulate_candidate` command probe. Usage:
//! cargo run --offline --example candidate_command -- request.json
//! The request is the same typed candidate request used by the native helper;
//! this probe goes through the actual dispatch envelope.
use serde_json::Value;
use std::{env, fs, process};

fn main() {
    let mut args = env::args().skip(1);
    let path = match (args.next(), args.next()) {
        (Some(path), None) => path,
        _ => {
            eprintln!("usage: candidate_command request.json");
            process::exit(2);
        }
    };
    let text = fs::read_to_string(&path).unwrap_or_else(|error| {
        eprintln!("cannot read request: {error}");
        process::exit(2);
    });
    let request: Value = serde_json::from_str(&text).unwrap_or_else(|error| {
        eprintln!("invalid request JSON: {error}");
        process::exit(2);
    });
    let reply = astraea_engine::dispatch_json(
        "simulate_candidate",
        &serde_json::json!({ "request": request }).to_string(),
    );
    println!("{reply}");
    let value: Value = serde_json::from_str(&reply).expect("engine JSON reply");
    if value.get("error").is_some() {
        process::exit(1);
    }
}
