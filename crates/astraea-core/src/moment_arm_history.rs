//! Capture-only legacy observables, not a second aerodynamic evaluator.
//! Units and limits: docs/internal/execution-runs/RMP10-flight-model-history/INTERFACE.md.
use crate::six_dof::FlightLoadsDiagnostic;

pub const MAX_MOMENT_ARM_SAMPLES: usize = 5_000;

#[derive(Clone, Debug, PartialEq)]
pub struct MomentArmSample {
    pub time_s: f64,
    pub mass_kg: f64,
    /// Exact same committed MacroSample evaluation, not display telemetry.
    pub diagnostic: FlightLoadsDiagnostic,
}

pub(crate) fn record(
    points: &mut Vec<MomentArmSample>, time_s: f64, mass_kg: f64,
    diagnostic: &FlightLoadsDiagnostic,
) -> Result<(), String> {
    if points.len() >= MAX_MOMENT_ARM_SAMPLES {
        return Err(format!(
            "reportMomentArmHistory: requested sample {} exceeds cap {}",
            points.len() + 1, MAX_MOMENT_ARM_SAMPLES,
        ));
    }
    points.push(MomentArmSample { time_s, mass_kg, diagnostic: diagnostic.clone() });
    Ok(())
}
