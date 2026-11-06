//! Immutable, explicitly supplied environment tables. Opt-in diagnostic only.
//!
//! No weather, hydrostatic consistency, or empirical applicability is inferred
//! from caller metadata. SI quantities and ENU wind **toward** are required.

pub const CLOSURE_ID: &str = "dry-ideal-air-sutherland/1.0.0";
pub const GAS_CONSTANT_J_KG_K: f64 = 287.05287;
pub const HEAT_CAPACITY_RATIO: f64 = 1.4;
pub const SUTHERLAND_COEFFICIENT: f64 = 1.458e-6;
pub const SUTHERLAND_TEMPERATURE_K: f64 = 110.4;
pub const THERMODYNAMIC_SOURCE_ID: &str = "astraea-core:six_dof.rs:atmosphere_at@f387132";
pub const VISCOSITY_SOURCE_ID: &str = "astraea-core:aero.rs:compute_compressible_skin_friction@f387132";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EvidenceClass { Synthetic, Observed, Forecast, Reference }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AltitudeDatum { GeometricMsl }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InterpolationPolicy { LogPressureLinearTemperatureWind }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExtrapolationPolicy { Reject }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Units { SiMetersPascalKelvinMetersPerSecondUtcUnixSeconds }

/// Caller declarations, not an assessment of source quality or applicability.
#[derive(Clone, Debug, PartialEq)]
pub struct Metadata {
    pub source_identity: String,
    pub evidence_class: EvidenceClass,
    pub source_description: String,
    pub location_identity: String,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub horizontal_datum_identity: String,
    pub altitude_datum: AltitudeDatum,
    pub vertical_datum_identity: String,
    pub issue_time_utc_unix_s: i64,
    pub valid_from_utc_unix_s: i64,
    pub valid_until_utc_unix_s: i64,
    pub units: Units,
    pub interpolation_policy: InterpolationPolicy,
    pub extrapolation_policy: ExtrapolationPolicy,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Enu { pub east: f64, pub north: f64, pub up: f64 }
impl Enu {
    pub const fn new(east: f64, north: f64, up: f64) -> Self { Self { east, north, up } }
    fn is_finite(self) -> bool { self.east.is_finite() && self.north.is_finite() && self.up.is_finite() }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Knot {
    pub altitude_m: f64,
    pub pressure_pa: f64,
    pub temperature_k: f64,
    pub wind_toward_enu_mps: Enu,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Query {
    pub altitude_m: f64,
    pub altitude_datum: AltitudeDatum,
    pub time_utc_unix_s: i64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct SurfaceInput { pub identity: String, pub length_m: f64, pub roughness_m: f64 }
#[derive(Clone, Debug, PartialEq)]
pub struct SurfaceResult {
    pub input: SurfaceInput,
    pub reynolds: f64,
    pub roughness_over_length: f64,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sample {
    pub pressure_pa: f64,
    pub temperature_k: f64,
    pub wind_toward_enu_mps: Enu,
    pub density_kg_m3: f64,
    pub sound_speed_mps: f64,
    pub dynamic_viscosity_pa_s: f64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Evaluation {
    pub sample: Sample,
    pub air_relative_velocity_enu_mps: Enu,
    pub airspeed_mps: f64,
    pub mach: f64,
    pub dynamic_pressure_pa: f64,
    pub reynolds_per_m: f64,
    pub surfaces: Vec<SurfaceResult>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct EnvironmentError(pub String);
impl std::fmt::Display for EnvironmentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result { f.write_str(&self.0) }
}
impl std::error::Error for EnvironmentError {}
type Result<T> = std::result::Result<T, EnvironmentError>;
fn require(ok: bool, message: &str) -> Result<()> {
    if ok { Ok(()) } else { Err(EnvironmentError(message.into())) }
}
fn positive(value: f64) -> bool { value.is_finite() && value > 0.0 }

/// Owned input and private fields prevent mutation after validation.
#[derive(Clone, Debug)]
pub struct EnvironmentProfile { metadata: Metadata, knots: Vec<Knot> }
impl EnvironmentProfile {
    pub fn new(metadata: Metadata, knots: Vec<Knot>) -> Result<Self> {
        for (name, value) in [
            ("source identity", &metadata.source_identity),
            ("source description", &metadata.source_description),
            ("location identity", &metadata.location_identity),
            ("horizontal datum identity", &metadata.horizontal_datum_identity),
            ("vertical datum identity", &metadata.vertical_datum_identity),
        ] {
            require(!value.trim().is_empty(), &format!("{name} must be nonempty"))?;
        }
        require(metadata.latitude_deg.is_finite() && (-90.0..=90.0).contains(&metadata.latitude_deg), "latitude must be finite in [-90, 90] degrees")?;
        require(metadata.longitude_deg.is_finite() && (-180.0..=180.0).contains(&metadata.longitude_deg), "longitude must be finite in [-180, 180] degrees")?;
        require(metadata.valid_from_utc_unix_s <= metadata.valid_until_utc_unix_s, "validity interval must be ordered")?;
        require(knots.len() >= 2, "at least two altitude knots are required")?;
        for (i, knot) in knots.iter().enumerate() {
            require(knot.altitude_m.is_finite(), "knot altitude must be finite")?;
            require(positive(knot.pressure_pa), "knot pressure must be positive finite Pa")?;
            require(positive(knot.temperature_k), "knot temperature must be positive finite K")?;
            require(knot.wind_toward_enu_mps.is_finite(), "all wind components must be finite")?;
            if i > 0 {
                require(knots[i - 1].altitude_m < knot.altitude_m, "altitude knots must be strictly increasing and unique")?;
                require(positive(knot.altitude_m - knots[i - 1].altitude_m), "altitude interval must have finite positive span")?;
            }
            // Reject a table whose closure already fails at a declared endpoint.
            close(*knot)?;
        }
        Ok(Self { metadata, knots })
    }
    pub fn metadata(&self) -> &Metadata { &self.metadata }
    pub fn knots(&self) -> &[Knot] { &self.knots }

    /// Inclusive endpoint sampling; no altitude or time extrapolation.
    pub fn sample(&self, query: Query) -> Result<Sample> {
        require(query.altitude_m.is_finite(), "query altitude must be finite")?;
        require(query.altitude_datum == self.metadata.altitude_datum, "query altitude datum differs from profile")?;
        require((self.metadata.valid_from_utc_unix_s..=self.metadata.valid_until_utc_unix_s).contains(&query.time_utc_unix_s), "query time is outside profile validity")?;
        require(query.altitude_m >= self.knots[0].altitude_m && query.altitude_m <= self.knots[self.knots.len() - 1].altitude_m, "query altitude is outside tabulated coverage; extrapolation rejected")?;
        let index = self.knots.partition_point(|k| k.altitude_m < query.altitude_m);
        if self.knots[index].altitude_m == query.altitude_m { return close(self.knots[index]); }
        let a = self.knots[index - 1];
        let b = self.knots[index];
        let span = b.altitude_m - a.altitude_m;
        require(positive(span), "altitude interval is not representable as a finite positive span")?;
        let fraction = (query.altitude_m - a.altitude_m) / span;
        let linear = |x, y| (1.0 - fraction) * x + fraction * y;
        close(Knot {
            altitude_m: query.altitude_m,
            pressure_pa: linear(a.pressure_pa.ln(), b.pressure_pa.ln()).exp(),
            temperature_k: linear(a.temperature_k, b.temperature_k),
            wind_toward_enu_mps: Enu::new(
                linear(a.wind_toward_enu_mps.east, b.wind_toward_enu_mps.east),
                linear(a.wind_toward_enu_mps.north, b.wind_toward_enu_mps.north),
                linear(a.wind_toward_enu_mps.up, b.wind_toward_enu_mps.up),
            ),
        })
    }

    /// Supplies environmental inputs only; evaluates no friction or drag law.
    pub fn evaluate(&self, query: Query, ground_velocity_enu_mps: Enu, surfaces: &[SurfaceInput]) -> Result<Evaluation> {
        require(ground_velocity_enu_mps.is_finite(), "ground velocity components must be finite")?;
        let sample = self.sample(query)?;
        let wind = sample.wind_toward_enu_mps;
        let air = Enu::new(ground_velocity_enu_mps.east - wind.east, ground_velocity_enu_mps.north - wind.north, ground_velocity_enu_mps.up - wind.up);
        require(air.is_finite(), "air-relative velocity overflow")?;
        let speed = air.east.hypot(air.north).hypot(air.up);
        let mach = speed / sample.sound_speed_mps;
        let dynamic_pressure = (0.5 * sample.density_kg_m3 * speed) * speed;
        let re_per_m = (sample.density_kg_m3 * speed) / sample.dynamic_viscosity_pa_s;
        require([speed, mach, dynamic_pressure, re_per_m].iter().all(|v| v.is_finite() && *v >= 0.0), "derived flow quantity is nonfinite")?;
        require(speed == 0.0 || (mach > 0.0 && dynamic_pressure > 0.0 && re_per_m > 0.0), "nonzero flow quantity underflow")?;
        let mut results = Vec::with_capacity(surfaces.len());
        let mut identities = std::collections::HashSet::new();
        for surface in surfaces {
            require(!surface.identity.trim().is_empty() && identities.insert(&surface.identity), "surface identities must be nonempty and unique")?;
            require(positive(surface.length_m), "surface length must be positive finite m")?;
            require(surface.roughness_m.is_finite() && surface.roughness_m >= 0.0, "surface roughness must be nonnegative finite m")?;
            let reynolds = re_per_m * surface.length_m;
            let roughness_over_length = surface.roughness_m / surface.length_m;
            require(reynolds.is_finite() && roughness_over_length.is_finite(), "surface result overflow")?;
            require((re_per_m == 0.0 || reynolds > 0.0) && (surface.roughness_m == 0.0 || roughness_over_length > 0.0), "surface result underflow")?;
            results.push(SurfaceResult { input: surface.clone(), reynolds, roughness_over_length });
        }
        Ok(Evaluation { sample, air_relative_velocity_enu_mps: air, airspeed_mps: speed, mach, dynamic_pressure_pa: dynamic_pressure, reynolds_per_m: re_per_m, surfaces: results })
    }
}

fn close(knot: Knot) -> Result<Sample> {
    require(positive(knot.pressure_pa) && positive(knot.temperature_k) && knot.wind_toward_enu_mps.is_finite(), "sample pressure/temperature must be positive finite and wind finite")?;
    let t = knot.temperature_k;
    let density = knot.pressure_pa / (GAS_CONSTANT_J_KG_K * t);
    let sound = (HEAT_CAPACITY_RATIO * GAS_CONSTANT_J_KG_K * t).sqrt();
    let viscosity = SUTHERLAND_COEFFICIENT * t.powf(1.5) / (t + SUTHERLAND_TEMPERATURE_K);
    require(positive(density) && positive(sound) && positive(viscosity), "dry-air closure requires finite positive density, sound speed and viscosity")?;
    Ok(Sample { pressure_pa: knot.pressure_pa, temperature_k: t, wind_toward_enu_mps: knot.wind_toward_enu_mps, density_kg_m3: density, sound_speed_mps: sound, dynamic_viscosity_pa_s: viscosity })
}

/// Import helper only: meteorological azimuth is clockwise from north, naming
/// where horizontal wind comes FROM. Vertical velocity is already toward-up.
/// Existing toward-ENU profiles must not be passed through this helper again.
pub fn meteorological_from_to_toward_enu(horizontal_speed_mps: f64, from_azimuth_deg: f64, toward_up_mps: f64) -> Result<Enu> {
    require(horizontal_speed_mps.is_finite() && horizontal_speed_mps >= 0.0, "horizontal wind speed must be nonnegative finite")?;
    require(from_azimuth_deg.is_finite() && toward_up_mps.is_finite(), "wind azimuth and vertical velocity must be finite")?;
    let radians = from_azimuth_deg.rem_euclid(360.0).to_radians();
    Ok(Enu::new(-horizontal_speed_mps * radians.sin(), -horizontal_speed_mps * radians.cos(), toward_up_mps))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn metadata() -> Metadata {
        Metadata { source_identity: "synthetic-test-v1".into(), evidence_class: EvidenceClass::Synthetic,
            source_description: "arbitrary synthetic interpolation fixture".into(), location_identity: "synthetic location".into(), latitude_deg: 0.0, longitude_deg: 0.0,
            horizontal_datum_identity: "synthetic coordinates".into(), altitude_datum: AltitudeDatum::GeometricMsl, vertical_datum_identity: "synthetic MSL".into(),
            issue_time_utc_unix_s: 0, valid_from_utc_unix_s: 10, valid_until_utc_unix_s: 20, units: Units::SiMetersPascalKelvinMetersPerSecondUtcUnixSeconds,
            interpolation_policy: InterpolationPolicy::LogPressureLinearTemperatureWind, extrapolation_policy: ExtrapolationPolicy::Reject }
    }
    fn knots() -> Vec<Knot> { vec![
        Knot { altitude_m: 0.0, pressure_pa: 100000.0, temperature_k: 300.0, wind_toward_enu_mps: Enu::new(2.0, -4.0, 1.0) },
        Knot { altitude_m: 1000.0, pressure_pa: 25000.0, temperature_k: 200.0, wind_toward_enu_mps: Enu::new(6.0, 8.0, -3.0) },
    ] }
    fn profile() -> EnvironmentProfile { EnvironmentProfile::new(metadata(), knots()).unwrap() }
    fn query(altitude_m: f64) -> Query { Query { altitude_m, altitude_datum: AltitudeDatum::GeometricMsl, time_utc_unix_s: 15 } }
    fn near(a: f64, b: f64) { assert!((a - b).abs() <= 1e-12 * b.abs().max(1.0), "{a} != {b}"); }

    #[test]
    fn log_pressure_linear_temperature_and_all_wind_components() {
        let s = profile().sample(query(500.0)).unwrap();
        near(s.pressure_pa, 50000.0); near(s.temperature_k, 250.0);
        assert_eq!(s.wind_toward_enu_mps, Enu::new(4.0, 2.0, -1.0));
        near(s.density_kg_m3, 50000.0 / (287.05287 * 250.0));
        near(s.sound_speed_mps, (1.4_f64 * 287.05287 * 250.0).sqrt());
        near(s.dynamic_viscosity_pa_s, 1.458e-6 * 250.0_f64.powf(1.5) / 360.4);
    }
    #[test]
    fn inclusive_endpoints_and_no_altitude_or_time_extrapolation() {
        let p = profile();
        for (altitude, time) in [(0.0, 10), (1000.0, 20)] {
            let mut q = query(altitude); q.time_utc_unix_s = time;
            let s = p.sample(q).unwrap(); assert_eq!(s.pressure_pa, if altitude == 0.0 { 100000.0 } else { 25000.0 });
        }
        for altitude in [-1.0, 1000.0001, f64::NAN, f64::INFINITY] { assert!(p.sample(query(altitude)).is_err()); }
        for time in [9, 21] { let mut q = query(500.0); q.time_utc_unix_s = time; assert!(p.sample(q).is_err()); }
    }
    #[test]
    fn zero_air_speed_has_no_reynolds_floor() {
        let p = profile(); let q = query(500.0);
        let wind = p.sample(q).unwrap().wind_toward_enu_mps;
        let result = p.evaluate(q, wind, &[SurfaceInput { identity: "tiny smooth surface".into(), length_m: 0.001, roughness_m: 0.0 }]).unwrap();
        assert_eq!([result.airspeed_mps, result.mach, result.dynamic_pressure_pa, result.reynolds_per_m, result.surfaces[0].reynolds, result.surfaces[0].roughness_over_length], [0.0; 6]);
    }
    #[test]
    fn ground_minus_wind_surface_scaling_and_same_speed_different_atmosphere() {
        let p = profile();
        let surfaces = [SurfaceInput { identity: "body".into(), length_m: 2.0, roughness_m: 5e-6 }, SurfaceInput { identity: "fin".into(), length_m: 0.25, roughness_m: 1e-6 }];
        let evaluate = |h| { let q = query(h); let w = p.sample(q).unwrap().wind_toward_enu_mps; p.evaluate(q, Enu::new(w.east + 30.0, w.north + 40.0, w.up), &surfaces).unwrap() };
        let low = evaluate(0.0); let high = evaluate(1000.0);
        assert_eq!(low.air_relative_velocity_enu_mps, Enu::new(30.0, 40.0, 0.0));
        assert_eq!(low.airspeed_mps, high.airspeed_mps); assert_eq!(low.airspeed_mps, 50.0);
        assert!(low.reynolds_per_m > high.reynolds_per_m);
        near(low.surfaces[0].reynolds, low.reynolds_per_m * 2.0);
        near(low.surfaces[1].reynolds, low.reynolds_per_m * 0.25);
        near(low.surfaces[0].roughness_over_length, 2.5e-6);
        near(low.dynamic_pressure_pa, 0.5 * low.sample.density_kg_m3 * 2500.0);
    }
    #[test]
    fn meteorological_cardinals_and_already_toward_profile_signs() {
        for (degrees, expected) in [(0.0, Enu::new(0.0, -5.0, 2.0)), (90.0, Enu::new(-5.0, 0.0, 2.0)), (180.0, Enu::new(0.0, 5.0, 2.0)), (270.0, Enu::new(5.0, 0.0, 2.0))] {
            let actual = meteorological_from_to_toward_enu(5.0, degrees, 2.0).unwrap();
            near(actual.east, expected.east); near(actual.north, expected.north); near(actual.up, expected.up);
        }
        assert_eq!(profile().sample(query(0.0)).unwrap().wind_toward_enu_mps, knots()[0].wind_toward_enu_mps);
        assert!(meteorological_from_to_toward_enu(-1.0, 0.0, 0.0).is_err());
        assert!(meteorological_from_to_toward_enu(1.0, f64::NAN, 0.0).is_err());
    }
    #[test]
    fn invalid_table_metadata_and_surface_inputs_fail_closed() {
        let invalid_knots = |k| assert!(EnvironmentProfile::new(metadata(), k).is_err());
        invalid_knots(vec![]); invalid_knots(vec![knots()[0]]);
        for value in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            let mut k = knots(); k[0].pressure_pa = value; invalid_knots(k);
            let mut k = knots(); k[0].temperature_k = value; invalid_knots(k);
        }
        let mut k = knots(); k[1].altitude_m = 0.0; invalid_knots(k);
        let mut k = knots(); k.swap(0, 1); invalid_knots(k);
        let mut k = knots(); k[0].wind_toward_enu_mps.up = f64::NAN; invalid_knots(k);
        let mut m = metadata(); m.valid_from_utc_unix_s = 30; assert!(EnvironmentProfile::new(m, knots()).is_err());
        let mut m = metadata(); m.source_identity.clear(); assert!(EnvironmentProfile::new(m, knots()).is_err());
        for (length_m, roughness_m) in [(0.0, 0.0), (-1.0, 0.0), (f64::INFINITY, 0.0), (1.0, -1.0), (1.0, f64::NAN)] {
            assert!(profile().evaluate(query(0.0), Enu::new(0.0, 0.0, 0.0), &[SurfaceInput { identity: "s".into(), length_m, roughness_m }]).is_err());
        }
        assert!(profile().evaluate(query(0.0), Enu::new(f64::NAN, 0.0, 0.0), &[]).is_err());
    }
    #[test]
    fn analytic_isothermal_table_checks_interpolation_and_closure_only() {
        // Test-provided hydrostatic values, not atmosphere generation in the API.
        let t = 280.0;
        let p0 = 100000.0;
        let at = |h: f64| p0 * (-9.80665 * h / (GAS_CONSTANT_J_KG_K * t)).exp();
        let mut k = knots();
        for knot in &mut k { knot.temperature_k = t; knot.pressure_pa = at(knot.altitude_m); }
        let p = EnvironmentProfile::new(metadata(), k).unwrap();
        near(p.sample(query(250.0)).unwrap().pressure_pa, at(250.0));
    }
    #[test]
    fn extreme_arithmetic_is_rejected_without_floors_or_nonfinite_results() {
        let invalid_knots = |k| assert!(EnvironmentProfile::new(metadata(), k).is_err());
        let mut k = knots(); k[0].temperature_k = f64::MAX; invalid_knots(k);
        let mut k = knots(); k[0].pressure_pa = f64::from_bits(1); invalid_knots(k);
        let mut k = knots(); k[0].altitude_m = -f64::MAX; k[1].altitude_m = f64::MAX; invalid_knots(k);
        let mut k = knots();
        for knot in &mut k { knot.wind_toward_enu_mps = Enu::new(0.0, 0.0, 0.0); }
        let p = EnvironmentProfile::new(metadata(), k).unwrap();
        assert!(p.evaluate(query(0.0), Enu::new(f64::MAX, 0.0, 0.0), &[]).is_err());
        assert!(p.evaluate(query(0.0), Enu::new(f64::from_bits(1), 0.0, 0.0), &[]).is_err());
        let tiny_surface = SurfaceInput { identity: "underflow roughness".into(), length_m: f64::MAX, roughness_m: f64::from_bits(1) };
        assert!(p.evaluate(query(0.0), Enu::new(0.0, 0.0, 0.0), &[tiny_surface]).is_err());
        let huge_surface = SurfaceInput { identity: "overflow Reynolds".into(), length_m: f64::MAX, roughness_m: 0.0 };
        assert!(p.evaluate(query(0.0), Enu::new(10.0, 0.0, 0.0), &[huge_surface]).is_err());
        // Density may be tiny but positive; losing its nonzero Reynolds at a
        // surface length is an error, not a numerical floor or a false zero.
        let mut k = knots();
        for knot in &mut k { knot.pressure_pa = 1e-250; knot.wind_toward_enu_mps = Enu::new(0.0, 0.0, 0.0); }
        let p = EnvironmentProfile::new(metadata(), k).unwrap();
        let surface = SurfaceInput { identity: "underflow Reynolds".into(), length_m: 1e-100, roughness_m: 0.0 };
        assert!(p.evaluate(query(0.0), Enu::new(1.0, 0.0, 0.0), &[surface]).is_err());
    }
}
