//! Native-only diagnostic replay from an archived bit-exact input/model
//! preimage. Usage: replay_candidate_report REPORT.json (or '-' for stdin).
//! Does not establish executable equality or empirical/numerical qualification.
use std::io::{self, Read};
fn main() {
    let result = (|| -> Result<String, String> {
        let path = std::env::args().nth(1).ok_or("expected archived report path or -")?;
        let input = if path == "-" {
            let mut text = String::new();
            io::stdin().read_to_string(&mut text).map_err(|e| e.to_string())?;
            text
        } else { std::fs::read_to_string(path).map_err(|e| e.to_string())? };
        astraea_engine::candidate_identity::replay_report_json(&input)
    })();
    match result {
        Ok(report) => println!("{report}"),
        Err(e) => { eprintln!("{e}"); std::process::exit(1); }
    }
}
