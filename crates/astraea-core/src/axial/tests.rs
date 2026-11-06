use super::*;
use crate::environment as env;

fn surface(id: &str, length_m: f64) -> skin_friction::SurfaceGeometry {
    skin_friction::SurfaceGeometry { identity: id.into(), length_m, roughness_m: 0.0, wetted_area_m2: 0.5, form_factor: 1.2 }
}
fn geometry() -> Geometry {
    Geometry { identity: "synthetic".into(), configuration: Configuration::CleanNoseCylinderTrapezoidFinsUnobstructedBase,
        friction_coverage: FrictionCoverage::NoseCylinderPlusAllFinFacesNoPressureInFormFactors,
        reference_area_m2: 0.02, body_diameter_m: 0.1, nose_shape: aero::NoseShape::Conical,
        nose_length_m: 0.5, cylinder_length_m: 1.5, body_friction: surface("body", 2.0),
        fins: vec![FinSet { count: 4, root_chord_m: 0.3, tip_chord_m: 0.15, span_m: 0.1, sweep_length_m: 0.1,
            thickness_m: 0.003, cross_section: aero::FinCrossSection::Square, friction: surface("fin", 0.25) }] }
}
fn prepare(g: Geometry, policy: PowerPolicy) -> PreparedAxial {
    let source = Source { identity: "inherited-synthetic".into(), geometry_identity: g.identity.clone(), condition_identity: "synthetic-only".into(), description: "not flight data".into() };
    PreparedAxial::prepare(g, source, policy).unwrap()
}
fn flow(p: &PreparedAxial, speed: f64) -> env::Evaluation {
    let m = env::Metadata { source_identity: "synthetic".into(), evidence_class: env::EvidenceClass::Synthetic, source_description: "not weather".into(),
        location_identity: "synthetic".into(), latitude_deg: 0.0, longitude_deg: 0.0, horizontal_datum_identity: "synthetic".into(),
        altitude_datum: env::AltitudeDatum::GeometricMsl, vertical_datum_identity: "synthetic".into(), issue_time_utc_unix_s: 0,
        valid_from_utc_unix_s: 0, valid_until_utc_unix_s: 10, units: env::Units::SiMetersPascalKelvinMetersPerSecondUtcUnixSeconds,
        interpolation_policy: env::InterpolationPolicy::LogPressureLinearTemperatureWind, extrapolation_policy: env::ExtrapolationPolicy::Reject };
    let knots = [0.0, 1000.0].iter().map(|h| env::Knot { altitude_m: *h, pressure_pa: 100000.0, temperature_k: 300.0, wind_toward_enu_mps: env::Enu::new(0.0, 0.0, 0.0) }).collect();
    env::EnvironmentProfile::new(m, knots).unwrap().evaluate(env::Query { altitude_m: 0.0, altitude_datum: env::AltitudeDatum::GeometricMsl, time_utc_unix_s: 5 }, env::Enu::new(speed, 0.0, 0.0), &p.surface_inputs()).unwrap()
}
fn near(a: f64, b: f64) { assert!((a-b).abs() <= 2e-12 * b.abs().max(1e-15), "{a} != {b}"); }
fn component<'a>(r: &'a Evaluation, name: &str) -> &'a Component { r.components.iter().find(|c| c.identity == name).unwrap() }

#[test]
fn analytic_components_and_reference_conversion_have_one_total() {
    let p = prepare(geometry(), PowerPolicy::InheritedPlumeFactor038);
    let f = flow(&p, 50.0);
    let r = p.evaluate(&f, PowerState::Coast).unwrap();
    let m2 = f.mach * f.mach;
    let ratio = (PI * 0.1_f64.powi(2) / 4.0) / 0.02;
    near(component(&r, "nose-pressure-offset").ca0.unwrap(), 0.005 * ratio);
    near(component(&r, "body-base").ca0.unwrap(), (0.12 + 0.13*m2) * ratio);
    let edge = 4.0 * 0.1 * 0.003 / 0.02;
    near(component(&r, "fin-leading-edge:fin").ca0.unwrap(), 0.85*(1.0+m2/4.0+m2*m2/40.0)*0.5*edge);
    near(component(&r, "fin-trailing-edge:fin").ca0.unwrap(), (0.12+0.13*m2)*edge);
    assert_eq!(component(&r, "fin-wave:fin").ca0, Some(0.0));
    let compression = { let t=0.2*m2; let v=(t/(1.0+0.89*t)).sqrt(); if v>0.001 {(v.asin()/v).powi(2)} else {1.0} };
    for s in &r.friction.surfaces {
        let cf = 0.455 / (f.reynolds_per_m*s.geometry.length_m).log10().powf(2.58) / compression;
        near(s.cf.unwrap(), cf);
        near(s.cd_friction.unwrap(), cf*1.2*0.5/0.02);
    }
    let sum = r.components.iter().map(|c| c.ca0.unwrap()).sum::<f64>();
    assert_eq!(r.ca0, Some(sum));
    near(-r.axial_force_body_n[1], f.dynamic_pressure_pa*0.02*sum);
    assert_eq!((r.axial_force_body_n[0], r.axial_force_body_n[2]), (0.0, 0.0));
    assert_eq!(r.components.len(), 7);
    // Deliberately unlike a body-frontal reference: both nose AND base convert.
    let mut g=geometry(); g.reference_area_m2 *= 4.0;
    let p2=prepare(g, PowerPolicy::InheritedPlumeFactor038);
    let r2=p2.evaluate(&flow(&p2, 50.0), PowerState::Coast).unwrap();
    near(r.ca0.unwrap(), 4.0*r2.ca0.unwrap());
    for (a,b) in r.components.iter().zip(&r2.components) { near(a.axial_resistance_n, b.axial_resistance_n); }
    near(r.axial_force_body_n[1], r2.axial_force_body_n[1]);
}

#[test]
fn local_pressure_viscosity_length_and_roughness_change_only_friction_coefficients() {
    let p=prepare(geometry(), PowerPolicy::CoastOnly);
    let base=flow(&p, 50.0);
    let a=p.evaluate(&base, PowerState::Coast).unwrap();
    for viscosity in [false,true] {
        // Deliberately constructed typed state isolates the consumed rho/mu
        // dependency (not a second atmosphere or a claim of E1 closure).
        let mut f=base.clone();
        if viscosity { f.sample.dynamic_viscosity_pa_s *= 2.0; } else { f.sample.pressure_pa *= 0.5; f.sample.density_kg_m3 *= 0.5; }
        f.reynolds_per_m=f.sample.density_kg_m3*f.airspeed_mps/f.sample.dynamic_viscosity_pa_s;
        f.dynamic_pressure_pa=(0.5*f.sample.density_kg_m3*f.airspeed_mps)*f.airspeed_mps;
        for s in &mut f.surfaces { s.reynolds=f.reynolds_per_m*s.input.length_m; }
        let b=p.evaluate(&f, PowerState::Coast).unwrap();
        assert!(b.friction.cd_friction>a.friction.cd_friction);
        for c in a.components.iter().filter(|c| !c.identity.starts_with("friction:")) { assert_eq!(c.ca0, component(&b,&c.identity).ca0); }
    }
    for rough in [false,true] {
        let mut g=geometry();
        if rough { g.fins[0].friction.roughness_m=0.001; } else { g.fins[0].friction.length_m *=0.5; }
        let b=prepare(g, PowerPolicy::CoastOnly);
        let b=b.evaluate(&flow(&b,50.0),PowerState::Coast).unwrap();
        assert_eq!(a.friction.surfaces[0], b.friction.surfaces[0]);
        assert!(b.friction.surfaces[1].cf>a.friction.surfaces[1].cf);
        for c in a.components.iter().filter(|c| !c.identity.starts_with("friction:")) { assert_eq!(c.ca0, component(&b,&c.identity).ca0); }
    }
}

#[test]
fn powered_coast_transition_changes_only_base_and_never_falls_back() {
    let p=prepare(geometry(),PowerPolicy::InheritedPlumeFactor038);
    let f=flow(&p,50.0);
    let coast=p.evaluate(&f,PowerState::Coast).unwrap();
    let on=p.evaluate(&f,PowerState::Powered).unwrap();
    for (c,b) in coast.components.iter().zip(&on.components) {
        if c.identity=="body-base" { near(b.ca0.unwrap(),0.38*c.ca0.unwrap()); }
        else { assert_eq!(c,b); }
    }
    assert_eq!(p.evaluate(&f,PowerState::Coast).unwrap(),coast);
    let no=prepare(geometry(),PowerPolicy::CoastOnly);
    for v in [0.0,50.0] { assert!(no.evaluate(&flow(&no,v),PowerState::Powered).unwrap_err().contains("no coast fallback")); }
}

#[test]
fn zero_and_low_re_are_distinct_and_all_invalid_consumed_fields_refuse() {
    let p=prepare(geometry(),PowerPolicy::CoastOnly);
    let f=flow(&p,0.0);
    let r=p.evaluate(&f,PowerState::Coast).unwrap();
    assert_eq!(r.ca0,None); assert_eq!(r.axial_force_body_n,[0.0;3]); assert!(r.unavailable_reason.is_some());
    assert!(r.components.iter().all(|c| c.ca0.is_none() && c.axial_resistance_n==0.0));
    assert!(p.evaluate(&flow(&p,1e-5),PowerState::Coast).unwrap_err().contains("no floor"));
    for value in [0.0,-1.0,f64::NAN,f64::INFINITY] {
        for field in 0..5 {
            let mut f=f.clone();
            match field { 0=>f.sample.pressure_pa=value, 1=>f.sample.temperature_k=value, 2=>f.sample.dynamic_viscosity_pa_s=value, 3=>f.sample.density_kg_m3=value, _=>f.sample.sound_speed_mps=value }
            assert!(p.evaluate(&f,PowerState::Coast).is_err());
        }
    }
    let mut bad=f.clone(); bad.sample.wind_toward_enu_mps.up=f64::NAN; assert!(p.evaluate(&bad,PowerState::Coast).is_err());
    let mut bad=f.clone(); bad.air_relative_velocity_enu_mps.up=1.0; assert!(p.evaluate(&bad,PowerState::Coast).is_err());
    let mut bad=f.clone(); bad.dynamic_pressure_pa=1.0; assert!(p.evaluate(&bad,PowerState::Coast).is_err());
    let mut bad=f.clone(); bad.surfaces[1]=bad.surfaces[0].clone(); assert!(p.evaluate(&bad,PowerState::Coast).is_err());
}

#[test]
fn geometry_bounds_identity_sets_and_extreme_arithmetic_fail_without_floors() {
    for change in 0..10 {
        let mut g=geometry();
        match change { 0=>g.body_diameter_m=0.00999, 1=>g.reference_area_m2=0.00009999,
            2=>g.fins[0].root_chord_m=0.00999, 3=>g.body_friction.length_m=1.5,
            4=>g.fins[0].friction.identity="body".into(), 5=>g.fins[0].count=0,
            6=>g.fins[0].sweep_length_m=f64::MAX, 7=>g.body_diameter_m=f64::MAX,
            8=>g.body_friction.roughness_m=-1.0, _=>g.identity.clear() }
        let source=Source { identity:"s".into(),geometry_identity:g.identity.clone(),condition_identity:"c".into(),description:"d".into() };
        assert!(PreparedAxial::prepare(g,source,PowerPolicy::CoastOnly).is_err(),"case {change}");
    }
    let p=prepare(geometry(),PowerPolicy::CoastOnly);
    let mut f=flow(&p,50.0); f.surfaces[1].input.identity="missing".into(); assert!(p.evaluate(&f,PowerState::Coast).is_err());
    let mut g=geometry(); g.body_friction.form_factor=f64::MAX;
    let p=prepare(g,PowerPolicy::CoastOnly); assert!(p.evaluate(&flow(&p,50.0),PowerState::Coast).is_err());
}

#[test]
fn lost_positive_sweep_and_rounded_edge_terms_refuse_but_structural_zeros_remain() {
    let mut g=geometry();
    g.fins[0].span_m=1e-100; g.fins[0].sweep_length_m=1e100; g.fins[0].thickness_m=1e100;
    let s=Source { identity:"s".into(),geometry_identity:g.identity.clone(),condition_identity:"c".into(),description:"d".into() };
    assert!(PreparedAxial::prepare(g,s,PowerPolicy::CoastOnly).unwrap_err().contains("sweep quotient underflow"));
    for cross in [aero::FinCrossSection::Rounded,aero::FinCrossSection::Airfoil,aero::FinCrossSection::Square,aero::FinCrossSection::DoubleWedge] {
        let mut g=geometry(); g.fins[0].cross_section=cross;
        let p=prepare(g,PowerPolicy::CoastOnly);
        let mut f=flow(&p,1e-6);
        // Very dense synthetic typed flow isolates low-Mach cancellation while
        // remaining above E1b Re support. No atmosphere qualification implied.
        f.sample.pressure_pa *=1e12; f.sample.density_kg_m3 *=1e12;
        f.dynamic_pressure_pa=(0.5*f.sample.density_kg_m3*f.airspeed_mps)*f.airspeed_mps;
        f.reynolds_per_m=f.sample.density_kg_m3*f.airspeed_mps/f.sample.dynamic_viscosity_pa_s;
        for s in &mut f.surfaces { s.reynolds=f.reynolds_per_m*s.input.length_m; }
        if matches!(cross,aero::FinCrossSection::Rounded|aero::FinCrossSection::Airfoil) {
            assert!(p.evaluate(&f,PowerState::Coast).unwrap_err().contains("lost positive leading-edge"));
        } else {
            let r=p.evaluate(&f,PowerState::Coast).unwrap();
            assert_eq!(component(&r,"fin-wave:fin").ca0,Some(0.0));
            if cross==aero::FinCrossSection::DoubleWedge {
                assert_eq!(component(&r,"fin-leading-edge:fin").ca0,Some(0.0));
                assert_eq!(component(&r,"fin-trailing-edge:fin").ca0,Some(0.0));
            } else { assert!(component(&r,"fin-leading-edge:fin").ca0.unwrap()>0.0); }
        }
    }
}

#[test]
fn mach_boundary_and_every_fin_set_are_explicit() {
    let p=prepare(geometry(),PowerPolicy::CoastOnly);
    let f=flow(&p,50.0);
    assert!(p.evaluate(&flow(&p,0.799*f.sample.sound_speed_mps),PowerState::Coast).is_ok());
    for m in [0.8,0.9,1.0,2.0] { assert!(p.evaluate(&flow(&p,m*f.sample.sound_speed_mps),PowerState::Coast).unwrap_err().contains("0<=Mach<.8")); }
    let mut g=geometry(); let mut fin=g.fins[0].clone(); fin.friction.identity="second-fin".into(); g.fins.push(fin);
    let b=prepare(g,PowerPolicy::CoastOnly); let r=b.evaluate(&flow(&b,50.0),PowerState::Coast).unwrap();
    let a=p.evaluate(&f,PowerState::Coast).unwrap();
    assert_eq!(r.components.len(),a.components.len()+4);
    near(component(&r,"fin-leading-edge:second-fin").ca0.unwrap(), component(&a,"fin-leading-edge:fin").ca0.unwrap());
    assert_eq!(component(&r,"body-base"),component(&a,"body-base"));
}
