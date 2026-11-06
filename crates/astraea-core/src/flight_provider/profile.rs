//! Immutable actual E1 profile bridge. No time/datum/weather fallback.
use super::*;
use crate::environment as e1;

pub const ENVIRONMENT_ID: &str = "explicit-E1-profile-candidate-environment/1.0.0";
pub const PROFILE_COMPOSITION_ID: &str = "candidate-static-rate-profile-composition/1.0.0";
pub const TIME_POLICY_ID: &str = "integer-epoch-plus-fractional-elapsed-validity/1.0.0";

#[derive(Clone, Debug)]
pub struct CandidateProfileEnvironment {
    profile: e1::EnvironmentProfile,
    launch_time_utc_unix_s: i64,
    launch_altitude_geometric_msl_m: f64,
    vertical_datum_identity: String,
}
#[derive(Clone, Debug, PartialEq)]
pub struct CandidateProfileObservation {
    pub environment_model_id: &'static str,
    pub time_policy_id: &'static str,
    pub profile_source_identity: String,
    pub vertical_datum_identity: String,
    pub altitude_geometric_msl_m: f64,
    pub launch_time_utc_unix_s: i64,
    pub elapsed_s: f64,
    pub sampled_floor_epoch_s: i64,
    pub fractional_second: f64,
    pub evaluation: e1::Evaluation,
}
fn invalid(reason: impl Into<String>) -> CandidateLoadError {
    CandidateLoadError { kind: CandidateFailureKind::InvalidInput, reason: reason.into() }
}
fn unsupported(reason: impl Into<String>) -> CandidateLoadError {
    CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain, reason: format!("{ENVIRONMENT_ID}: {}",reason.into()) }
}
impl CandidateProfileEnvironment {
    pub fn new(profile: e1::EnvironmentProfile, launch_time_utc_unix_s: i64,
        launch_altitude_geometric_msl_m: f64, vertical_datum_identity: String,
    ) -> Result<Self, CandidateLoadError> {
        if !launch_altitude_geometric_msl_m.is_finite() { return Err(invalid("launch geometric-MSL altitude must be finite")); }
        if vertical_datum_identity.trim().is_empty() || vertical_datum_identity != profile.metadata().vertical_datum_identity {
            return Err(invalid("launch vertical datum identity must exactly match the E1 profile; no datum conversion inferred"));
        }
        let result = Self { profile, launch_time_utc_unix_s, launch_altitude_geometric_msl_m, vertical_datum_identity };
        result.evaluate(0.0, &RigidState { r: Vec3::zero(), v: Vec3::zero(), q: crate::six_dof::Quat { w:1.0,x:0.0,y:0.0,z:0.0 }, w:Vec3::zero() })?;
        Ok(result)
    }
    pub fn profile(&self) -> &e1::EnvironmentProfile { &self.profile }
    pub fn launch_time_utc_unix_s(&self) -> i64 { self.launch_time_utc_unix_s }
    pub fn launch_altitude_geometric_msl_m(&self) -> f64 { self.launch_altitude_geometric_msl_m }
    pub fn vertical_datum_identity(&self) -> &str { &self.vertical_datum_identity }

    fn evaluate(&self, elapsed_s: f64, state: &RigidState) -> Result<CandidateProfileObservation, CandidateLoadError> {
        if !elapsed_s.is_finite() || !(0.0..9_007_199_254_740_992.0).contains(&elapsed_s) {
            return Err(invalid(format!("{TIME_POLICY_ID}: elapsed stage time must be finite, nonnegative and <2^53 seconds")));
        }
        // Never convert the epoch to f64. Full fractional validity is checked
        // before calling the integer-time E1 API (profile constant in time).
        let floor = elapsed_s.floor() as i64;
        let fraction = elapsed_s.fract();
        let epoch = self.launch_time_utc_unix_s.checked_add(floor)
            .ok_or_else(|| unsupported("integer epoch addition overflow"))?;
        let metadata = self.profile.metadata();
        if epoch < metadata.valid_from_utc_unix_s || epoch > metadata.valid_until_utc_unix_s
            || (epoch == metadata.valid_until_utc_unix_s && fraction > 0.0) {
            return Err(unsupported("full fractional stage time is outside profile validity; no floor/clamp/fallback"));
        }
        let altitude = self.launch_altitude_geometric_msl_m + state.r.z;
        if !altitude.is_finite() { return Err(invalid("launch MSL + AGL altitude overflow/nonfinite")); }
        let evaluation = self.profile.evaluate(e1::Query { altitude_m:altitude, altitude_datum:e1::AltitudeDatum::GeometricMsl, time_utc_unix_s:epoch },
            e1::Enu::new(state.v.x,state.v.y,state.v.z), &[]).map_err(|e|unsupported(e.to_string()))?;
        Ok(CandidateProfileObservation { environment_model_id:ENVIRONMENT_ID,time_policy_id:TIME_POLICY_ID,
            profile_source_identity:metadata.source_identity.clone(), vertical_datum_identity:self.vertical_datum_identity.clone(),
            altitude_geometric_msl_m:altitude,launch_time_utc_unix_s:self.launch_time_utc_unix_s,elapsed_s,
            sampled_floor_epoch_s:epoch,fractional_second:fraction,evaluation })
    }
}
impl PreparedCandidate {
    /// Explicitly select the owned E1 environment, never enabled by old inputs.
    /// A retained nonzero wind declaration is refused, not silently ignored.
    pub fn with_profile_environment(mut self, profile: CandidateProfileEnvironment) -> Result<Self,CandidateLoadError> {
        if self.environment.wind_speed_surface_mps != 0.0 { return Err(invalid("profile selection conflicts with nonzero retained wind; no combined wind model")); }
        if self.source.environment_source_id != profile.profile.metadata().source_identity {
            return Err(invalid("candidate environment source identity must match actual E1 profile source"));
        }
        self.environment.launch_altitude_asl_m = profile.launch_altitude_geometric_msl_m;
        self.profile_environment = Some(profile);
        Ok(self)
    }
    pub fn profile_environment(&self) -> Option<&CandidateProfileEnvironment> { self.profile_environment.as_ref() }
    pub fn limitations(&self) -> Vec<&'static str> {
        if self.profile_environment.is_none() { return LIMITATIONS.to_vec(); }
        let mut notes:Vec<_>=LIMITATIONS.iter().copied().filter(|s| !s.contains("ISA-1976")).collect();
        notes.extend([
            "Actual supplied E1 geometric-MSL P/T/toward-ENU wind profile is consumed; dry ideal-air/Sutherland closure, time-constant within declared validity, empirically unqualified.",
            "Full fractional elapsed-time validity is enforced before integer profile sampling; launch geometric-MSL and profile vertical datum must agree. No extrapolation, retained atmosphere or wind-shear fallback.",
            "Axial source remains explicitly prescribed CA0; the RMP06a low-Re-limited local total axial source is not integrated by this bridge.",
        ]);
        notes
    }
    pub(super) fn stage(&self,time:f64,state:&RigidState) -> Result<(StageMechanics,Option<CandidateProfileObservation>),CandidateLoadError> {
        match &self.profile_environment {
            Some(profile)=>{
                let observation=profile.evaluate(time,state)?;
                let f=&observation.evaluation;
                let w=f.sample.wind_toward_enu_mps;
                let mech=crate::six_dof::stage_mechanics_with_flow(time,state,observation.altitude_geometric_msl_m,
                    f.sample.density_kg_m3,f.sample.sound_speed_mps,Vec3{x:w.east,y:w.north,z:w.up},Some(f),&self.vehicle,&self.motor);
                Ok((mech,Some(observation)))
            }
            None=>{
                let e=&self.environment;
                let mech=stage_mechanics(time,state,e.launch_altitude_asl_m,e.wind_speed_surface_mps,e.wind_azimuth_deg,&self.vehicle,&self.motor);
                if !mech.alt_asl.is_finite() || mech.alt_asl<0.0 || mech.alt_asl>MAX_LAUNCH_ALTITUDE_ASL_M {
                    return Err(CandidateLoadError { kind: CandidateFailureKind::UnsupportedDomain,
                        reason: format!("instantaneous altitude {} m ASL is outside the retained ISA-1976 atmosphere support 0..={} m",mech.alt_asl,MAX_LAUNCH_ALTITUDE_ASL_M) });
                }
                Ok((mech,None))
            }
        }
    }
}
