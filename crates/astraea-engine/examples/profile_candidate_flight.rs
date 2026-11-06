//! Usage: profile_candidate_flight synthetic-request.json (or '-' for stdin).
use std::io::{self,Read};
fn main() {
    let output=(||->Result<(String,String),String>{
        let path=std::env::args().nth(1).ok_or("expected request path or -")?;
        let input=if path=="-" { let mut s=String::new();io::stdin().read_to_string(&mut s).map_err(|e|e.to_string())?;s }
            else { std::fs::read_to_string(path).map_err(|e|e.to_string())? };
        astraea_engine::profile_candidate::run_request_json_with_sidecar(&input)
    })();
    match output { Ok((text,sidecar))=>{ println!("{text}"); eprintln!("MECHANISM_SIDECAR_JSON:{sidecar}"); }, Err(e)=>{ eprintln!("{e}");std::process::exit(1); } }
}
