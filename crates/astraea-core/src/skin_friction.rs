//! Opt-in local-state friction diagnostic; inherited equations, unqualified physics.
//! No production drag/flight consumer uses this module.
use crate::environment;

pub const MODEL_ID: &str = "local-state-inherited-turbulent-friction/1.0.0";
pub const SOURCE_ID: &str = "astraea-core:aero.rs:compute_compressible_skin_friction+apply_van_driest_correction+skin_friction_at_reynolds_per_meter@1e4779a";
/// Replacement for the inherited numerical floor, not an empirical domain claim.
pub const MIN_EFFECTIVE_REYNOLDS: f64 = 1000.0;
#[derive(Clone, Debug, PartialEq)]
pub struct SurfaceGeometry {
    pub identity: String,
    pub length_m: f64,
    pub roughness_m: f64,
    pub wetted_area_m2: f64,
    pub form_factor: f64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct SurfaceResult {
    pub geometry: SurfaceGeometry,
    pub reynolds: f64,
    pub roughness_over_length: f64,
    pub roughness_reynolds_cutoff: Option<f64>,
    pub effective_reynolds: Option<f64>,
    pub cf_incompressible: Option<f64>,
    pub compressibility_factor: Option<f64>,
    pub cf: Option<f64>,
    pub cd_friction: Option<f64>,
    pub modeled_static_resistance_n: f64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Evaluation {
    pub surfaces: Vec<SurfaceResult>,
    pub cd_friction: Option<f64>,
    pub modeled_static_resistance_n: f64,
    pub zero_speed: bool,
}
fn positive(x: f64) -> bool { x.is_finite() && x > 0.0 }
fn require(ok: bool, message: &str) -> Result<(), String> { if ok { Ok(()) } else { Err(message.into()) } }

/// Cf is undefined at zero speed; modeled static friction resistance is zero.
/// Resistance is a modeled zero-incidence/streamwise scalar contribution; no
/// geometry orientation, finite-angle force, total drag or total CA is inferred.
pub fn evaluate(flow: &environment::Evaluation, geometry: &[SurfaceGeometry], reference_area_m2: f64) -> Result<Evaluation, String> {
    require(positive(reference_area_m2), "reference area must be positive finite m2")?;
    require(!geometry.is_empty() && geometry.len() == flow.surfaces.len(), "geometry must exactly cover a nonempty E1 surface set")?;
    require(positive(flow.sample.density_kg_m3) && positive(flow.sample.dynamic_viscosity_pa_s) && positive(flow.sample.sound_speed_mps), "local density, viscosity and sound speed must be positive finite")?;
    require([flow.airspeed_mps, flow.mach, flow.dynamic_pressure_pa, flow.reynolds_per_m].iter().all(|v| v.is_finite() && *v >= 0.0), "local flow must be finite and nonnegative")?;
    let zero = flow.airspeed_mps == 0.0;
    require(if zero { flow.mach == 0.0 && flow.dynamic_pressure_pa == 0.0 && flow.reynolds_per_m == 0.0 } else { positive(flow.mach) && positive(flow.dynamic_pressure_pa) && positive(flow.reynolds_per_m) }, "inconsistent zero/nonzero local flow")?;
    require(flow.reynolds_per_m == flow.sample.density_kg_m3 * flow.airspeed_mps / flow.sample.dynamic_viscosity_pa_s, "local Reynolds per meter is inconsistent with rho V / mu")?;
    require(flow.mach == flow.airspeed_mps / flow.sample.sound_speed_mps, "local Mach is inconsistent with V / a")?;
    require(flow.dynamic_pressure_pa == (0.5 * flow.sample.density_kg_m3 * flow.airspeed_mps) * flow.airspeed_mps, "local dynamic pressure is inconsistent with rho V2 / 2")?;
    let mut seen = std::collections::HashSet::new();
    let mut results = Vec::with_capacity(geometry.len());
    let mut cd_sum = 0.0;
    let mut resistance_sum = 0.0;
    for surface in geometry {
        require(!surface.identity.trim().is_empty() && seen.insert(&surface.identity), "geometry surface identities must be nonempty and unique")?;
        require(positive(surface.length_m) && positive(surface.wetted_area_m2) && positive(surface.form_factor), "surface length, wetted area and form factor must be positive finite")?;
        require(surface.roughness_m.is_finite() && surface.roughness_m >= 0.0, "roughness must be nonnegative finite m")?;
        let local = flow.surfaces.iter().find(|s| s.input.identity == surface.identity).ok_or("geometry surface identity does not match E1")?;
        require(local.input.length_m == surface.length_m && local.input.roughness_m == surface.roughness_m, "geometry length/roughness does not match E1 surface")?;
        require(local.reynolds.is_finite() && local.reynolds >= 0.0 && local.reynolds == flow.reynolds_per_m * surface.length_m, "inconsistent surface Reynolds")?;
        require(local.roughness_over_length.is_finite() && local.roughness_over_length >= 0.0 && local.roughness_over_length == surface.roughness_m / surface.length_m, "inconsistent surface roughness ratio")?;
        require((zero || local.reynolds > 0.0) && (surface.roughness_m == 0.0 || local.roughness_over_length > 0.0), "surface result underflow")?;
        let mut result = SurfaceResult { geometry: surface.clone(), reynolds: local.reynolds, roughness_over_length: local.roughness_over_length,
            roughness_reynolds_cutoff: None, effective_reynolds: None, cf_incompressible: None, compressibility_factor: None, cf: None, cd_friction: None, modeled_static_resistance_n: 0.0 };
        if !zero {
            // Explicitly smooth surfaces have no synthetic roughness or cap.
            let cutoff = if surface.roughness_m == 0.0 { None } else {
                let value = 51.0 * local.roughness_over_length.powf(-1.039);
                require(positive(value), "roughness cutoff overflow/underflow")?;
                Some(value)
            };
            let effective = cutoff.map_or(local.reynolds, |cap| local.reynolds.min(cap));
            require(effective >= MIN_EFFECTIVE_REYNOLDS, "effective Reynolds below numerical support minimum 1000; no floor applied")?;
            let cf0 = 0.455 / effective.log10().powf(2.58);
            // Exact inherited correction and small-parameter branch. Its source
            // label is not independent verification of a Van Driest formulation.
            let m_term = 0.2 * flow.mach * flow.mach;
            require(m_term.is_finite(), "compressibility arithmetic overflow")?;
            let m_param = (m_term / (1.0 + 0.89 * m_term)).sqrt();
            require(m_param.is_finite() && m_param <= 1.0, "inherited compressibility asin domain exceeded")?;
            let fc = if m_param > 0.001 { (m_param.asin() / m_param).powi(2) } else { 1.0 };
            let cf = cf0 / fc;
            let cd = ((cf * surface.form_factor) * surface.wetted_area_m2) / reference_area_m2;
            let resistance = (flow.dynamic_pressure_pa * reference_area_m2) * cd;
            require([cf0, fc, cf, cd, resistance].iter().all(|v| positive(*v)), "friction contribution overflow/underflow")?;
            cd_sum += cd; resistance_sum += resistance;
            require(positive(cd_sum) && positive(resistance_sum), "friction sum overflow/underflow")?;
            result.roughness_reynolds_cutoff = cutoff; result.effective_reynolds = Some(effective);
            result.cf_incompressible = Some(cf0); result.compressibility_factor = Some(fc); result.cf = Some(cf);
            result.cd_friction = Some(cd); result.modeled_static_resistance_n = resistance;
        }
        results.push(result);
    }
    Ok(Evaluation { surfaces: results, cd_friction: if zero { None } else { Some(cd_sum) }, modeled_static_resistance_n: resistance_sum, zero_speed: zero })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(speed: f64, length: f64, roughness: f64) -> (environment::Evaluation, Vec<SurfaceGeometry>) {
        // Identical unfloored atmosphere to legacy at h=0; explicit here only
        // for implementation agreement, not a second production atmosphere.
        let t: f64 = 288.15;
        let rho = 101325.0 / (287.05 * t);
        let mu = 1.458e-6 * t.powf(1.5) / (t + 110.4);
        let a = (1.4 * 287.05 * t).sqrt();
        let re = rho * speed / mu;
        let g = SurfaceGeometry { identity: "s".into(), length_m: length, roughness_m: roughness, wetted_area_m2: 0.5, form_factor: 1.2 };
        let flow = environment::Evaluation { sample: environment::Sample { pressure_pa: 101325.0, temperature_k: t, density_kg_m3: rho, dynamic_viscosity_pa_s: mu, sound_speed_mps: a, wind_toward_enu_mps: environment::Enu::new(0.0, 0.0, 0.0) },
            air_relative_velocity_enu_mps: environment::Enu::new(speed, 0.0, 0.0), airspeed_mps: speed, mach: speed / a, dynamic_pressure_pa: (0.5 * rho * speed) * speed, reynolds_per_m: re,
            surfaces: vec![environment::SurfaceResult { input: environment::SurfaceInput { identity: g.identity.clone(), length_m: length, roughness_m: roughness }, reynolds: re * length, roughness_over_length: roughness / length }] };
        (flow, vec![g])
    }
    fn near(a: f64, b: f64) { assert!((a-b).abs() <= 1e-12 * b.abs(), "{a} != {b}"); }
    #[test]
    fn matches_legacy_at_identical_unclamped_local_conditions() {
        for (speed, length, ks) in [(68.0, 0.5, 5e-6), (680.0, 2.0, 50e-6), (0.1, 0.2, 1e-6)] {
            let (flow, geometry) = fixture(speed, length, ks);
            let new = evaluate(&flow, &geometry, 0.01).unwrap();
            let old = crate::aero::compute_compressible_skin_friction(flow.mach, length, speed, 0.0, ks * 1e6);
            // Third case deliberately falls below old velocity floor and is
            // checked separately below instead of claiming equivalence.
            if speed >= 1.0 { near(new.surfaces[0].cf.unwrap(), old); }
            else { assert_ne!(new.surfaces[0].cf.unwrap(), old); }
            near(new.cd_friction.unwrap(), new.surfaces[0].cf.unwrap() * 1.2 * 0.5 / 0.01);
        }
    }
    #[test]
    fn smooth_has_no_cap_and_roughness_cap_changes_cf() {
        let (smooth, gs) = fixture(680.0, 2.0, 0.0);
        let smooth = evaluate(&smooth, &gs, 0.01).unwrap();
        assert_eq!(smooth.surfaces[0].roughness_reynolds_cutoff, None);
        assert_eq!(smooth.surfaces[0].effective_reynolds, Some(smooth.surfaces[0].reynolds));
        let (rough, gr) = fixture(680.0, 2.0, 50e-6);
        let rough = evaluate(&rough, &gr, 0.01).unwrap();
        assert!(rough.surfaces[0].effective_reynolds.unwrap() < rough.surfaces[0].reynolds);
        assert!(rough.surfaces[0].cf.unwrap() > smooth.surfaces[0].cf.unwrap());
    }
    #[test]
    fn each_surface_uses_own_length_not_reference_area() {
        let (mut flow, mut geometry) = fixture(50.0, 2.0, 0.0);
        let mut short = geometry[0].clone(); short.identity = "short".into(); short.length_m = 0.25;
        flow.surfaces.push(environment::SurfaceResult { input: environment::SurfaceInput { identity: short.identity.clone(), length_m: short.length_m, roughness_m: 0.0 }, reynolds: flow.reynolds_per_m * short.length_m, roughness_over_length: 0.0 });
        geometry.push(short);
        let a = evaluate(&flow, &geometry, 0.01).unwrap(); let b = evaluate(&flow, &geometry, 0.02).unwrap();
        near(a.surfaces[0].reynolds / a.surfaces[1].reynolds, 8.0);
        assert!(a.surfaces[0].cf < a.surfaces[1].cf);
        near(a.cd_friction.unwrap(), 2.0 * b.cd_friction.unwrap()); near(a.modeled_static_resistance_n, b.modeled_static_resistance_n);
    }
    #[test]
    fn zero_speed_has_unavailable_coefficients_and_zero_static_resistance() {
        let (flow, geometry) = fixture(0.0, 0.001, 0.0); let r = evaluate(&flow, &geometry, 0.01).unwrap();
        assert!(r.zero_speed); assert_eq!(r.cd_friction, None); assert_eq!(r.modeled_static_resistance_n, 0.0);
        let s = &r.surfaces[0]; assert_eq!(s.cf, None); assert_eq!(s.effective_reynolds, None); assert_eq!(s.modeled_static_resistance_n, 0.0);
    }
    #[test]
    fn low_effective_reynolds_is_rejected_instead_of_floored() {
        let (flow, geometry) = fixture(0.01, 0.001, 0.0);
        assert!(evaluate(&flow, &geometry, 0.01).unwrap_err().contains("no floor"));
        let (flow, geometry) = fixture(50.0, 1.0, 1.0);
        assert!(evaluate(&flow, &geometry, 0.01).unwrap_err().contains("no floor"));
        let (flow, geometry) = fixture(50.0, 0.001, 0.0);
        assert!(evaluate(&flow, &geometry, 0.01).is_ok()); // no 0.05m floor
    }
    #[test]
    fn invalid_nonfinite_geometry_and_constructible_flow_fail_even_at_zero_speed() {
        let (flow, geometry) = fixture(0.0, 1.0, 0.0);
        for value in [f64::NAN, f64::INFINITY, -1.0, 0.0] {
            let mut f = flow.clone(); f.sample.density_kg_m3 = value; assert!(evaluate(&f, &geometry, 0.01).is_err());
            let mut f = flow.clone(); f.sample.dynamic_viscosity_pa_s = value; assert!(evaluate(&f, &geometry, 0.01).is_err());
            let mut f = flow.clone(); f.sample.sound_speed_mps = value; assert!(evaluate(&f, &geometry, 0.01).is_err());
            let mut g = geometry.clone(); g[0].wetted_area_m2 = value; assert!(evaluate(&flow, &g, 0.01).is_err());
            let mut g = geometry.clone(); g[0].form_factor = value; assert!(evaluate(&flow, &g, 0.01).is_err());
            assert!(evaluate(&flow, &geometry, value).is_err());
        }
        let mut f = flow.clone(); f.surfaces[0].reynolds = f64::NAN; assert!(evaluate(&f, &geometry, 0.01).is_err());
        let mut f = flow.clone(); f.dynamic_pressure_pa = 1.0; assert!(evaluate(&f, &geometry, 0.01).is_err());
        let mut g = geometry.clone(); g[0].identity = "different".into(); assert!(evaluate(&flow, &g, 0.01).is_err());
        let mut g = geometry.clone(); g[0].length_m *= 2.0; assert!(evaluate(&flow, &g, 0.01).is_err());
    }
    #[test]
    fn inherited_asin_domain_and_extreme_arithmetic_fail_explicitly() {
        let (flow, geometry) = fixture(3000.0, 1.0, 0.0);
        assert!(evaluate(&flow, &geometry, 0.01).unwrap_err().contains("asin domain"));
        let (flow, mut geometry) = fixture(50.0, 1.0, 0.0); geometry[0].form_factor = f64::MAX;
        assert!(evaluate(&flow, &geometry, 0.01).is_err());
    }
}
