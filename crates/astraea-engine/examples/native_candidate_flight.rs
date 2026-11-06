//! Native bounded candidate diagnostic: actual DTO -> SB1 adapter -> prepared
//! candidate -> bounded synthetic ascent, direct load query and static curves.
//!
//! Usage: cargo run --offline --example native_candidate_flight -- request.json
//! Calls the helper directly (the same request is also reachable through the
//! explicit `simulate_candidate` command). Not a GUI option, default model or
//! as-flown qualification.
use std::{env, fs, process};

fn main() {
    let mut args = env::args().skip(1);
    let path = match (args.next(), args.next()) {
        (Some(path), None) => path,
        _ => {
            eprintln!("usage: native_candidate_flight request.json");
            process::exit(2);
        }
    };
    let text = fs::read_to_string(&path).unwrap_or_else(|error| {
        eprintln!("cannot read request: {error}");
        process::exit(2);
    });
    match astraea_engine::native_candidate::run_request_json_with_sidecar(&text) {
        Ok((report, sidecar)) => {
            println!("{report}");
            // Per-attempt diagnostic sidecar: outside the compared report.
            eprintln!("MECHANISM_SIDECAR_JSON:{sidecar}");
        }
        Err(message) => {
            eprintln!("{message}");
            println!("{}", serde_json::json!({ "error": message }));
            process::exit(1);
        }
    }
}
