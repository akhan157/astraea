//! Native inspection tool for the opt-in, unqualified E1b friction diagnostic.
use std::{env, fs, process};
fn main() {
    let mut args = env::args().skip(1);
    let path = match (args.next(), args.next()) {
        (Some(path), None) => path,
        _ => { eprintln!("usage: friction_diagnostic request.json"); process::exit(2); }
    };
    let request = fs::read_to_string(path).unwrap_or_else(|error| {
        eprintln!("cannot read request: {error}"); process::exit(2);
    });
    let reply = astraea_engine::dispatch_json("evaluate_skin_friction_diagnostic", &request);
    println!("{reply}");
    let value: serde_json::Value = serde_json::from_str(&reply).expect("engine JSON reply");
    if value.get("error").is_some() { process::exit(1); }
}
