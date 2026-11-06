// Included inside the existing candidate tests so accepted synthetic mechanics
// and vehicle helpers are reused, not independently invented.
use crate::environment as e1;
fn e1_profile(launch:i64, until:i64, wind:e1::Enu, pressure:f64) -> e1::EnvironmentProfile {
    let m=e1::Metadata { source_identity:"synthetic-profile-bridge".into(),evidence_class:e1::EvidenceClass::Synthetic,
        source_description:"not weather or flight data".into(),location_identity:"synthetic".into(),latitude_deg:0.0,longitude_deg:0.0,
        horizontal_datum_identity:"synthetic".into(),altitude_datum:e1::AltitudeDatum::GeometricMsl,vertical_datum_identity:"synthetic-MSL".into(),
        issue_time_utc_unix_s:launch,valid_from_utc_unix_s:launch,valid_until_utc_unix_s:until,
        units:e1::Units::SiMetersPascalKelvinMetersPerSecondUtcUnixSeconds,
        interpolation_policy:e1::InterpolationPolicy::LogPressureLinearTemperatureWind,extrapolation_policy:e1::ExtrapolationPolicy::Reject };
    e1::EnvironmentProfile::new(m,[-100.0,1000.0].iter().map(|h| e1::Knot { altitude_m:*h,pressure_pa:pressure,temperature_k:300.0,wind_toward_enu_mps:wind }).collect()).unwrap()
}
fn e1_candidate(profile:e1::EnvironmentProfile, launch:i64, altitude:f64) -> PreparedCandidate {
    let mut p=preparation(); p.source.environment_source_id=profile.metadata().source_identity.clone();
    PreparedCandidate::prepare(p).unwrap().with_profile_environment(CandidateProfileEnvironment::new(profile,launch,altitude,"synthetic-MSL".into()).unwrap()).unwrap()
}
fn e1_still(until:i64) -> PreparedCandidate { e1_candidate(e1_profile(10,until,e1::Enu::new(0.0,0.0,0.0),100000.0),10,100.0) }
fn e1_flags() -> CandidateFlags { CandidateFlags {drogue_deployed:false,main_deployed:false,rail_bound:false} }

#[test]
fn profile_exact_fractional_time_large_epochs_and_datum_are_checked_before_flooring() {
    let state=state_at(Vec3{x:0.0,y:50.0,z:0.0},Vec3::zero());
    for launch in [10_i64,9_007_199_254_740_995,i64::MAX-2] {
        let p=e1_candidate(e1_profile(launch,launch+2,e1::Enu::new(0.0,0.0,0.0),100000.0),launch,100.0);
        for t in [0.0,0.125,1.999999,2.0] {
            let s=query(&p,t,&state,e1_flags()).unwrap(); let o=s.profile_environment.unwrap();
            assert_eq!(o.sampled_floor_epoch_s,launch+t.floor() as i64);
            assert_eq!(o.fractional_second,t.fract()); assert_eq!(o.elapsed_s,t);
        }
        assert!(query(&p,2.0000000001,&state,e1_flags()).unwrap_err().reason.contains("fractional stage time"));
        assert!(query(&p,3.0,&state,e1_flags()).is_err());
    }
    let p=e1_still(20);
    for t in [-0.1,f64::NAN,f64::INFINITY,9_007_199_254_740_992.0] { assert!(query(&p,t,&state,e1_flags()).is_err()); }
    assert!(CandidateProfileEnvironment::new(e1_profile(10,20,e1::Enu::new(0.0,0.0,0.0),100000.0),10,100.0,"different-geoid".into()).is_err());
}

#[test]
fn profile_msl_agl_negative_altitudes_and_toward_wind_are_actually_used() {
    let p=e1_candidate(e1_profile(10,20,e1::Enu::new(1.0,-2.0,0.5),100000.0),10,-50.0);
    let state=state_at(Vec3{x:1.0,y:48.0,z:0.5},Vec3::zero());
    let s=query(&p,0.25,&state,e1_flags()).unwrap(); let o=s.profile_environment.unwrap();
    assert_eq!(o.altitude_geometric_msl_m,10.0); // -50 MSL +60 AGL, no clamp
    assert_eq!(o.evaluation.air_relative_velocity_enu_mps,e1::Enu::new(0.0,50.0,0.0));
    assert_eq!(s.mechanics.airspeed_mps,50.0);
    assert_eq!(s.mechanics.wind_n_mps,Vec3{x:1.0,y:-2.0,z:0.5});
    near(s.mechanics.density_kg_m3,100000.0/(287.05287*300.0));
    near(o.evaluation.reynolds_per_m,o.evaluation.sample.density_kg_m3*50.0/o.evaluation.sample.dynamic_viscosity_pa_s);
    assert_eq!(s.identities.environment_model_id,profile::ENVIRONMENT_ID);
    assert_eq!(s.identities.composition_id,profile::PROFILE_COMPOSITION_ID);
    assert!(p.limitations().iter().all(|n| !n.contains("retained ISA-1976")));
}

#[test]
fn profile_coverage_never_gets_a_zero_speed_rail_canopy_or_negligibility_waiver() {
    let p=e1_still(11);
    let state=state_at(Vec3::zero(),Vec3::zero());
    for flags in [e1_flags(),CandidateFlags{rail_bound:true,..e1_flags()},CandidateFlags{drogue_deployed:true,..e1_flags()}] {
        assert!(query(&p,1.00001,&state,flags).unwrap_err().reason.contains("validity"));
        let mut outside=state; outside.r.z=1000.0;
        assert!(query(&p,0.5,&outside,flags).unwrap_err().reason.contains("tabulated coverage"));
    }
    assert!(curves(&p,1.00001,&state,e1_flags(),&[0.1]).unwrap_err().reason.contains("validity"));
    let mut bad=preparation(); bad.source.environment_source_id="wrong-profile".into();
    let env=CandidateProfileEnvironment::new(e1_profile(10,20,e1::Enu::new(0.0,0.0,0.0),100000.0),10,100.0,"synthetic-MSL".into()).unwrap();
    assert!(PreparedCandidate::prepare(bad).unwrap().with_profile_environment(env).is_err());
}

#[test]
fn profile_changes_dimensional_loads_and_trajectory_not_prescribed_coefficients() {
    let a=e1_still(20);
    let b=e1_candidate(e1_profile(10,20,e1::Enu::new(0.0,0.0,0.0),50000.0),10,100.0);
    let state=state_at(Vec3{x:0.0,y:50.0,z:0.0},Vec3::zero());
    let qa=query(&a,0.5,&state,e1_flags()).unwrap();let qb=query(&b,0.5,&state,e1_flags()).unwrap();
    wrench_near(qa.static_coefficients_at_datum.unwrap(),qb.static_coefficients_at_datum.unwrap());
    near(qa.static_force_body_n.y,2.0*qb.static_force_body_n.y);
    let ra=run(&a,1.234);let rb=run(&b,1.234);
    assert_ne!(ra.final_state,rb.final_state);
    assert_eq!(ra.final_time_s,1.234); assert!(ra.committed_samples.iter().all(|s|s.profile_environment.is_some()));
    // A vertical toward-wind scenario also changes real RHS/trajectory.
    let w=e1_candidate(e1_profile(10,20,e1::Enu::new(0.0,0.0,-0.1),100000.0),10,100.0);
    assert_ne!(run(&w,1.234).final_state,ra.final_state);
}

#[test]
fn profile_shared_consumers_have_matching_effective_state_identities_and_axial_loads() {
    let p=e1_still(20); let r=run(&p,1.234); let sample=r.committed_samples.last().unwrap();
    let q=query(&p,sample.stage_time_s,&sample.state,sample.flags).unwrap();
    assert_eq!(q.profile_environment,sample.profile_environment);
    assert_eq!(q.identities.composition_id,sample.identities.composition_id);
    assert_eq!(q.identities.environment_model_id,sample.identities.environment_model_id);
    assert_eq!(q.identities.environment_source_id,sample.identities.environment_source_id);
    assert_eq!(q.identities.axial_input_identity,sample.identities.axial_input_identity);
    assert_eq!(q.static_force_body_n,sample.static_force_body_n);
    let c=curves(&p,sample.stage_time_s,&sample.state,sample.flags,&[sample.mechanics.mach]).unwrap();
    vector_near(c[0].static_force_body_n,sample.static_force_body_n);
    let a=q.profile_environment.unwrap();let b=c[0].profile_environment.as_ref().unwrap();
    assert_eq!(a.profile_source_identity,b.profile_source_identity);
    assert_eq!(a.altitude_geometric_msl_m,b.altitude_geometric_msl_m);
    assert_eq!(a.sampled_floor_epoch_s,b.sampled_floor_epoch_s);
    assert_eq!(a.evaluation.sample,b.evaluation.sample);
    near(a.evaluation.mach,b.evaluation.mach);
    near(a.evaluation.reynolds_per_m,b.evaluation.reynolds_per_m);
}

#[test]
fn profile_failure_retains_stage_context_and_burnout_uses_actual_profile_mach() {
    let p=e1_still(11);let error=run_bounded(&p,&CandidateRunRequest{horizon_s:1.234,options:options()}).unwrap_err();
    let record=error.record.unwrap();assert!(record.stage_time_s>1.0);assert!(record.reason.contains("fractional stage time"));assert!(record.phase.speculative);
    assert_eq!(record.composition_id,profile::PROFILE_COMPOSITION_ID);
    let p=e1_still(20);let r=run(&p,1.234);
    let burnout=r.events.iter().find(|e|e.name=="Motor Burnout").unwrap();
    // Synthetic isothermal profile sound speed, not retained ISA; no wind here.
    let expected=format!("Mach {:.2}",burnout.velocity/(1.4_f64*287.05287*300.0).sqrt());
    assert!(burnout.description.contains(&expected),"{} expected {}",burnout.description,expected);
}
