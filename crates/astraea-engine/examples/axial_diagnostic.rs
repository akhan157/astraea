//! Native-only probe. Usage: axial_diagnostic request.json (or '-' for stdin).
//! Deliberately not an application dispatch command.
use std::io::{self, Read};

fn main() {
    let input = (|| -> Result<serde_json::Value, String> {
        let path = std::env::args().nth(1).ok_or("usage: axial_diagnostic request.json | -")?;
        let text = if path == "-" {
            let mut text = String::new();
            io::stdin().read_to_string(&mut text).map_err(|e| e.to_string())?;
            text
        } else { std::fs::read_to_string(path).map_err(|e| e.to_string())? };
        serde_json::from_str(&text).map_err(|e| e.to_string())
    })();
    let output = match input.and_then(|v| astraea_engine::axial_diagnostic::evaluate(&v)) {
        Ok(result) => serde_json::json!({"ok": result}),
        Err(error) => serde_json::json!({"error": error}),
    };
    println!("{output}");
    if output.get("error").is_some() { std::process::exit(1); }
}
