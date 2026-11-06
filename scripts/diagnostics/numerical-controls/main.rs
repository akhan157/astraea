// Native executable in the generated external engine crate only.
use astraea_core::six_dof::{self, N1Controls, N1Counts, N1Errors};
use serde_json::{json,Value};
use std::io::Read;
fn errors(e:N1Errors)->Value {json!({"positionM":e.position,"velocityMs":e.velocity,"attitudeRad":e.attitude_rad,"rateRadS":e.rate})}
fn counts(c:N1Counts)->Value {
    let phase=|p:six_dof::N1PhaseCounts|json!({"attempted":p.attempted,"accepted":p.accepted,"rejected":p.rejected,"segments":p.segments});
    json!({"ordinary":phase(c.ordinary),"event":phase(c.event),"rootIterations":c.root_iterations,"observedStates":c.observed_states,"maxQuaternionNormError":c.max_quaternion_norm_error})
}
fn run()->Result<Value,String> {
    let mode=std::env::args().nth(1).ok_or("mode required")?;
    if mode=="analytic" {
        let rows=six_dof::n1_analytic_suite()?;
        return Ok(json!({"wholeFlightCalls":0,"analyticCases":rows.iter().map(|r|json!({"fixture":r.fixture,"integrationPhase":r.integration_phase,"toleranceScale":r.tolerance_scale,"maxStepS":r.max_step_s,"endpointMaxError":errors(r.endpoint_max_error),"offNodeMaxError":errors(r.off_node_max_error),"rootChecks":r.roots.iter().map(|x|json!({"toleranceS":x.tolerance_s,"expectedS":x.expected_s,"returnedS":x.returned_s,"signedErrorS":x.signed_error_s,"stateError":errors(x.state_error)})).collect::<Vec<_>>(),"counts":counts(r.counts)})).collect::<Vec<_>>() }));
    }
    if mode!="flight" {return Err("choose analytic or flight".into());}
    let mut text=String::new();std::io::stdin().read_to_string(&mut text).map_err(|e|e.to_string())?;
    let request:Value=serde_json::from_str(&text).map_err(|e|e.to_string())?;
    let c=&request["controls"];
    let number=|key:&str|c[key].as_f64().ok_or_else(||format!("missing control {key}"));
    let controls=N1Controls{ordinary_scale:number("ordinaryScale")?,event_scale:number("eventScale")?,event_time_tolerance:number("eventTimeToleranceS")?};
    six_dof::n1_set_controls(controls);
    // One and only one whole-flight call; caller reserves ledger entry first.
    let result=astraea_engine::dispatch("simulate_flight",&request["wire"]);
    Ok(json!({"result":result.as_ref().ok(),"error":result.as_ref().err(),"counts":counts(six_dof::n1_counts())}))
}
fn main(){match run(){Ok(v)=>println!("{v}"),Err(e)=>{eprintln!("{e}");std::process::exit(1);}}}
