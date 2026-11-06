//! Unused, unqualified static SB1 foundation. No simulation dispatch calls this module.
//!
//! Implements accepted P0 §1–5 mathematics, independently written from equations in
//! OpenRocket 13.05 technical documentation (not engine source). Body +Y is forward;
//! stations are metres aft of the nose. Every vector here is right handed in B.
//! This is a candidate computational domain, never an empirical qualification.

use std::f64::consts::PI;

pub const PROVIDER_ID: &str = "static-body-total-SB1/1.0.0";
pub const SOURCE_EQUATIONS: &str = "OpenRocket 13.05 techdoc: 3.18,3.24,3.25,3.30-3.34,3.40,3.53,3.55,3.56; accepted P0 1.0.0";
pub const MAX_INCIDENCE_RAD: f64 = 5.0 * PI / 180.0;
/// Versioned diagnostic presentation policy, added at implementation review.
/// Suppresses only the CP station when cancellation reaches this relative bound;
/// never changes force, moment, derivatives or the coefficient sums.
pub const CP_CANCELLATION_POLICY_ID: &str = "cp-ratio-roundoff-cancellation/1.0.0";
pub const CP_CANCELLATION_RELATIVE_BOUND: f64 = 64.0 * f64::EPSILON;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}
impl Vec3 {
    pub const ZERO: Self = Self::new(0.0, 0.0, 0.0);
    pub const fn new(x: f64, y: f64, z: f64) -> Self { Self { x, y, z } }
    pub fn dot(self, b: Self) -> f64 { self.x*b.x + self.y*b.y + self.z*b.z }
    pub fn cross(self, b: Self) -> Self {
        Self::new(self.y*b.z-self.z*b.y, self.z*b.x-self.x*b.z, self.x*b.y-self.y*b.x)
    }
    pub fn scaled(self, s: f64) -> Self { Self::new(self.x*s, self.y*s, self.z*s) }
    pub fn plus(self, b: Self) -> Self { Self::new(self.x+b.x, self.y+b.y, self.z+b.z) }
    pub fn minus(self, b: Self) -> Self { self.plus(b.scaled(-1.0)) }
    pub fn norm(self) -> f64 { self.x.hypot(self.y).hypot(self.z) }
    pub fn is_finite(self) -> bool { self.x.is_finite() && self.y.is_finite() && self.z.is_finite() }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Error {
    InvalidInput(&'static str),
    UnsupportedDomain(&'static str),
}
type Result<T> = std::result::Result<T, Error>;
fn finite(values: &[f64], reason: &'static str) -> Result<()> {
    if values.iter().all(|x| x.is_finite()) { Ok(()) } else { Err(Error::InvalidInput(reason)) }
}

/// Explicit normalization; reference diameter is geometry metadata, not inferred from S.
#[derive(Clone, Copy, Debug)]
pub struct References {
    pub area_m2: f64,
    pub length_m: f64,
    pub diameter_m: f64,
}
impl References {
    pub fn validate(self) -> Result<()> {
        finite(&[self.area_m2, self.length_m, self.diameter_m], "nonfinite reference")?;
        if self.area_m2 <= 0.0 || self.length_m <= 0.0 || self.diameter_m <= 0.0 {
            return Err(Error::InvalidInput("references must be positive"));
        }
        Ok(())
    }
    pub fn canonical(diameter_m: f64) -> Result<Self> {
        let r = Self { area_m2: PI*diameter_m*diameter_m/4.0, length_m: diameter_m, diameter_m };
        r.validate()?; Ok(r)
    }
}

/// Full position relative to the nose, in body coordinates; not a station scalar.
#[derive(Clone, Copy, Debug)]
pub struct Datum(pub Vec3);
impl Datum {
    pub const NOSE: Self = Self(Vec3::ZERO);
    pub fn centerline(station_from_nose_m: f64) -> Self {
        Self(Vec3::new(0.0, -station_from_nose_m, 0.0))
    }
}

#[derive(Clone, Copy, Debug)]
pub struct FlowAngles {
    pub alpha_rad: f64,
    pub beta_rad: f64,
    pub incidence_rad: f64,
}
/// None means undefined at exactly zero speed, never a fabricated zero observation.
pub fn flow_angles(velocity_at_cg_b_mps: Vec3) -> Result<Option<FlowAngles>> {
    if !velocity_at_cg_b_mps.is_finite() { return Err(Error::InvalidInput("nonfinite velocity")); }
    let v = velocity_at_cg_b_mps;
    if !v.norm().is_finite() { return Err(Error::InvalidInput("speed overflow")); }
    if v.norm() == 0.0 { return Ok(None); }
    Ok(Some(FlowAngles {
        alpha_rad: v.z.atan2(v.y), beta_rad: v.x.atan2(v.y.hypot(v.z)),
        incidence_rad: v.x.hypot(v.z).atan2(v.y),
    }))
}

/// Columns of R_BW. Transform utility is exact and has no SB1 incidence restriction.
#[derive(Clone, Copy, Debug)]
pub struct WindBasis { pub x: Vec3, pub y: Vec3, pub z: Vec3 }
#[derive(Clone, Copy, Debug)]
pub struct WindCoefficients { pub side: f64, pub drag: f64, pub lift: f64 }
impl WindBasis {
    pub fn from_angles(alpha_rad: f64, beta_rad: f64) -> Result<Self> {
        finite(&[alpha_rad, beta_rad], "nonfinite wind angles")?;
        let (sa, ca) = alpha_rad.sin_cos(); let (sb, cb) = beta_rad.sin_cos();
        Ok(Self { x: Vec3::new(cb, -sb*ca, -sb*sa),
            y: Vec3::new(sb, cb*ca, cb*sa), z: Vec3::new(0.0, -sa, ca) })
    }
    pub fn body_to_wind(self, cf_b: Vec3) -> Result<WindCoefficients> {
        if !cf_b.is_finite() { return Err(Error::InvalidInput("nonfinite force coefficient")); }
        let w = WindCoefficients { side: self.x.dot(cf_b), drag: -self.y.dot(cf_b), lift: -self.z.dot(cf_b) };
        finite(&[w.side,w.drag,w.lift], "wind transform overflow")?; Ok(w)
    }
    pub fn wind_to_body(self, w: WindCoefficients) -> Result<Vec3> {
        finite(&[w.side,w.drag,w.lift], "nonfinite wind coefficients")?;
        let b = self.x.scaled(w.side).minus(self.y.scaled(w.drag)).minus(self.z.scaled(w.lift));
        if !b.is_finite() { return Err(Error::InvalidInput("wind transform overflow")); } Ok(b)
    }
}

#[derive(Clone, Copy, Debug)]
pub struct CoefficientWrench { pub cf_b: Vec3, pub cm_b: Vec3 }
impl CoefficientWrench {
    /// M_to = M_from + (r_from-r_to) cross F. Preserves independent pure couples.
    pub fn translated(self, from: Datum, to: Datum, refs: References) -> Result<Self> {
        refs.validate()?;
        if !self.cf_b.is_finite() || !self.cm_b.is_finite() || !from.0.is_finite() || !to.0.is_finite() {
            return Err(Error::InvalidInput("nonfinite wrench or datum"));
        }
        let cm_b = self.cm_b.plus(from.0.minus(to.0).scaled(1.0/refs.length_m).cross(self.cf_b));
        if !cm_b.is_finite() { return Err(Error::InvalidInput("moment translation overflow")); }
        Ok(Self { cf_b: self.cf_b, cm_b })
    }
    /// Re-referencing preserves physical F and M about the same point.
    pub fn rereferenced(self, old: References, new: References) -> Result<Self> {
        old.validate()?; new.validate()?;
        let out = Self { cf_b: self.cf_b.scaled(old.area_m2/new.area_m2),
            cm_b: self.cm_b.scaled((old.area_m2/new.area_m2)*(old.length_m/new.length_m)) };
        if !out.cf_b.is_finite() || !out.cm_b.is_finite() { return Err(Error::InvalidInput("reference scaling overflow")); }
        Ok(out)
    }
    pub fn dimensional(self, dynamic_pressure_pa: f64, refs: References) -> Result<DimensionalWrench> {
        refs.validate()?; finite(&[dynamic_pressure_pa], "nonfinite dynamic pressure")?;
        if dynamic_pressure_pa < 0.0 { return Err(Error::InvalidInput("negative dynamic pressure")); }
        let out = DimensionalWrench { force_b_n: self.cf_b.scaled(dynamic_pressure_pa*refs.area_m2),
            moment_b_nm: self.cm_b.scaled(dynamic_pressure_pa*refs.area_m2*refs.length_m) };
        if !out.force_b_n.is_finite() || !out.moment_b_nm.is_finite() { return Err(Error::InvalidInput("dimensional wrench overflow")); }
        Ok(out)
    }
}
#[derive(Clone, Copy, Debug)]
pub struct DimensionalWrench { pub force_b_n: Vec3, pub moment_b_nm: Vec3 }

#[derive(Clone, Copy, Debug)]
pub struct NormalContribution { pub c_per_rad: f64, pub j_m_per_rad: f64 }
#[derive(Clone, Copy, Debug, Default)]
pub struct NormalSums {
    pub c_per_rad: f64, pub j_m_per_rad: f64,
    pub sum_abs_c_per_rad: f64, pub sum_abs_j_m_per_rad: f64,
}
impl NormalSums {
    fn validate(self) -> Result<()> {
        finite(&[self.c_per_rad,self.j_m_per_rad,self.sum_abs_c_per_rad,self.sum_abs_j_m_per_rad], "nonfinite normal sums")?;
        if self.sum_abs_c_per_rad < self.c_per_rad.abs() || self.sum_abs_j_m_per_rad < self.j_m_per_rad.abs() {
            return Err(Error::InvalidInput("absolute contribution sums must bound signed sums"));
        }
        Ok(())
    }
    pub fn from_contributions(parts: &[NormalContribution]) -> Result<Self> {
        let mut sum = Self::default();
        for p in parts {
            finite(&[p.c_per_rad,p.j_m_per_rad], "nonfinite normal contribution")?;
            sum.c_per_rad += p.c_per_rad; sum.j_m_per_rad += p.j_m_per_rad;
            sum.sum_abs_c_per_rad += p.c_per_rad.abs(); sum.sum_abs_j_m_per_rad += p.j_m_per_rad.abs();
        }
        finite(&[sum.c_per_rad,sum.j_m_per_rad,sum.sum_abs_c_per_rad,sum.sum_abs_j_m_per_rad], "normal sum overflow")?;
        Ok(sum)
    }
    /// Derivative CP at the symmetric zero-incidence baseline, nose station.
    /// The interval is an absolute uncertainty bound on total C, if actually known.
    pub fn derivative_cp(self, c_uncertainty_interval: Option<(f64,f64)>) -> Result<CpDiagnostic> {
        self.validate()?;
        let kappa = self.sum_abs_c_per_rad/self.c_per_rad.abs();
        let kappa_c = kappa.is_finite().then_some(kappa);
        if let Some((lo,hi)) = c_uncertainty_interval {
            finite(&[lo,hi], "nonfinite C uncertainty")?;
            if lo > hi || self.c_per_rad < lo || self.c_per_rad > hi { return Err(Error::InvalidInput("C interval must enclose total C")); }
            if lo <= 0.0 && hi >= 0.0 { return Ok(CpDiagnostic { station_from_nose_m: None, kappa_c, reason: Some(CpUnavailable::UncertaintyContainsZero), sums: self }); }
        }
        if self.c_per_rad == 0.0 { return Ok(CpDiagnostic { station_from_nose_m: None, kappa_c: None, reason: Some(CpUnavailable::ZeroDenominator), sums: self }); }
        if self.c_per_rad.abs()/self.sum_abs_c_per_rad <= CP_CANCELLATION_RELATIVE_BOUND {
            return Ok(CpDiagnostic { station_from_nose_m: None, kappa_c,
                reason: Some(CpUnavailable::NumericallyIllConditioned), sums: self });
        }
        let cp = self.j_m_per_rad/self.c_per_rad;
        Ok(CpDiagnostic { station_from_nose_m: cp.is_finite().then_some(cp), kappa_c,
            reason: if cp.is_finite() { None } else { Some(CpUnavailable::NonfiniteRatio) }, sums: self })
    }
    /// First-order static limit; may be used at alpha=beta=0 without flow angles.
    /// It does not derive moment from CP, or attach any independent free couple.
    pub fn coefficient_limit(self, alpha_rad: f64, beta_rad: f64, ca0: f64, refs: References, datum: Datum) -> Result<CoefficientWrench> {
        refs.validate()?;
        self.validate()?;
        finite(&[self.c_per_rad,self.j_m_per_rad,alpha_rad,beta_rad,ca0], "nonfinite coefficient-limit input")?;
        let nose = CoefficientWrench { cf_b: Vec3::new(-self.c_per_rad*beta_rad, -ca0, -self.c_per_rad*alpha_rad),
            cm_b: Vec3::new(self.j_m_per_rad*alpha_rad/refs.length_m, 0.0, -self.j_m_per_rad*beta_rad/refs.length_m) };
        nose.translated(Datum::NOSE, datum, refs)
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CpUnavailable { ZeroDenominator, UncertaintyContainsZero, NumericallyIllConditioned, NonfiniteRatio }
#[derive(Clone, Copy, Debug)]
pub struct CpDiagnostic {
    pub station_from_nose_m: Option<f64>, pub kappa_c: Option<f64>,
    pub reason: Option<CpUnavailable>, pub sums: NormalSums,
}

/// Integrals are an input representation, NOT proof of a real smooth/slender profile.
/// Callers must retain profile identity, integration method and convergence evidence.
#[derive(Clone, Copy, Debug)]
pub struct BodyIntervalIntegrals {
    pub x0_m: f64, pub x1_m: f64, pub area0_m2: f64, pub area1_m2: f64,
    pub integral_area_m3: f64,
}
impl BodyIntervalIntegrals {
    pub fn contribution(self, refs: References) -> Result<NormalContribution> {
        refs.validate()?;
        finite(&[self.x0_m,self.x1_m,self.area0_m2,self.area1_m2,self.integral_area_m3], "nonfinite body interval")?;
        if self.x0_m < 0.0 || self.x1_m <= self.x0_m || self.area0_m2 < 0.0 || self.area1_m2 < 0.0 || self.integral_area_m3 < 0.0 {
            return Err(Error::InvalidInput("invalid body interval bounds/areas"));
        }
        let p = NormalContribution { c_per_rad: 2.0*(self.area1_m2-self.area0_m2)/refs.area_m2,
            j_m_per_rad: 2.0*(self.x1_m*self.area1_m2-self.x0_m*self.area0_m2-self.integral_area_m3)/refs.area_m2 };
        finite(&[p.c_per_rad,p.j_m_per_rad], "body integral overflow")?; Ok(p)
    }
}

/// Source s=exposed semispan, r_t=local radius, cr/ct=chords, m=tip LE sweep;
/// A_fin=(cr+ct)s/2 is ONE exposed fin's one-sided planform area.
#[derive(Clone, Copy, Debug)]
pub struct TrapezoidFinSet {
    pub count: u8, pub exposed_semispan_m: f64, pub local_body_radius_m: f64,
    pub root_chord_m: f64, pub tip_chord_m: f64, pub tip_le_sweep_m: f64,
    pub root_le_station_m: f64,
}
impl TrapezoidFinSet {
    pub fn contribution(self, mach: f64, refs: References) -> Result<NormalContribution> {
        refs.validate()?; validate_mach(mach)?;
        let s=self.exposed_semispan_m; let r=self.local_body_radius_m;
        let cr=self.root_chord_m; let ct=self.tip_chord_m; let m=self.tip_le_sweep_m;
        finite(&[s,r,cr,ct,m,self.root_le_station_m], "nonfinite fin geometry")?;
        if s <= 0.0 || r < 0.0 || cr <= 0.0 || ct < 0.0 || self.root_le_station_m < 0.0 {
            return Err(Error::InvalidInput("invalid trapezoid dimensions"));
        }
        if self.count != 3 && self.count != 4 { return Err(Error::UnsupportedDomain("requires three or four identical equally spaced fins")); }
        let area = (cr+ct)*s/2.0;
        let cos_gamma = s/s.hypot(m+(ct-cr)/2.0);
        let b = (1.0-mach*mach).sqrt();
        let ratio = b*s*s/(area*cos_gamma);
        let c_one = (2.0*PI*s*s/refs.area_m2)/(1.0+1.0_f64.hypot(ratio));
        let c = (1.0+r/(s+r))*(f64::from(self.count)/2.0)*c_one;
        // Fixed quarter-MAC: deliberate SB1 omission of source aft movement M>~0.5.
        let x = self.root_le_station_m + m*(cr+2.0*ct)/(3.0*(cr+ct)) + (cr+ct-cr*ct/(cr+ct))/6.0;
        finite(&[area,cos_gamma,ratio,c_one,c,x,c*x], "fin calculation overflow")?;
        Ok(NormalContribution { c_per_rad: c, j_m_per_rad: c*x })
    }
}
fn validate_mach(mach: f64) -> Result<()> {
    finite(&[mach], "nonfinite Mach")?;
    if !(0.0..0.8).contains(&mach) { return Err(Error::UnsupportedDomain("candidate requires 0 <= Mach < 0.8")); }
    Ok(())
}

/// Explicit declarations supplied by a geometry adapter; no shape-name CP constants.
/// These declarations cannot be verified from area integrals. Slenderness has no
/// empirically approved numeric threshold in P0; it must not be inferred here.
#[derive(Clone, Copy, Debug)]
pub struct GeometryDeclarations {
    pub sharp_nosed_axisymmetric_circular: bool,
    pub smooth_slender_profile: bool,
    pub identical_equally_spaced_thin_uncanted_fins: bool,
}
#[derive(Clone, Debug)]
pub struct CandidateGeometry {
    pub identity: String,
    pub integral_provenance: String,
    pub declarations: GeometryDeclarations,
    pub body: Vec<BodyIntervalIntegrals>,
    pub fins: TrapezoidFinSet,
}
/// Numerical validation only: independent area/width operations can differ by
/// roundoff. This is not geometry matching, dimensional padding or qualification.
pub const BODY_AREA_VALIDATION_POLICY_ID: &str = "body-area-upper-bound-roundoff/1.0.0";
pub const BODY_AREA_VALIDATION_RELATIVE_BOUND: f64 = 64.0*f64::EPSILON;
fn body_area_within_reference(value: f64, maximum: f64) -> bool {
    value.is_finite() && value >= 0.0 && maximum.is_finite() && maximum > 0.0
        && (value <= maximum || value/maximum <= 1.0+BODY_AREA_VALIDATION_RELATIVE_BOUND)
}
impl CandidateGeometry {
    pub fn normal_sums(&self, mach: f64, refs: References) -> Result<NormalSums> {
        refs.validate()?; validate_mach(mach)?;
        if self.identity.is_empty() || self.integral_provenance.is_empty() { return Err(Error::InvalidInput("geometry identity and integral provenance required")); }
        let d=self.declarations;
        if !d.sharp_nosed_axisymmetric_circular || !d.smooth_slender_profile || !d.identical_equally_spaced_thin_uncanted_fins {
            return Err(Error::UnsupportedDomain("geometry outside declared SB1 candidate class"));
        }
        if self.body.is_empty() { return Err(Error::UnsupportedDomain("body interval representation required")); }
        let max_area=PI*refs.diameter_m*refs.diameter_m/4.0;
        if !max_area.is_finite() || max_area <= 0.0 { return Err(Error::InvalidInput("reference diameter area overflow/underflow")); }
        let mut parts=Vec::with_capacity(self.body.len()+1);
        let mut last_x=0.0; let mut last_area=0.0;
        for interval in &self.body {
            let p=interval.contribution(refs)?;
            if interval.x0_m != last_x || interval.area0_m2 != last_area { return Err(Error::InvalidInput("body intervals must connect exactly from a sharp nose at station zero")); }
            if !body_area_within_reference(interval.area0_m2,max_area)
                || !body_area_within_reference(interval.area1_m2,max_area)
                || !body_area_within_reference(interval.integral_area_m3/(interval.x1_m-interval.x0_m),max_area) {
                return Err(Error::InvalidInput("body representation exceeds declared maximum diameter"));
            }
            parts.push(p); last_x=interval.x1_m; last_area=interval.area1_m2;
        }
        let f=self.fins;
        if f.local_body_radius_m > refs.diameter_m/2.0 || f.root_le_station_m+f.root_chord_m > last_x || f.root_le_station_m+f.tip_le_sweep_m < 0.0 || f.root_le_station_m+f.tip_le_sweep_m+f.tip_chord_m > last_x {
            return Err(Error::UnsupportedDomain("fins must lie within declared body length/radius"));
        }
        // Local radius/profile agreement cannot be established by interval endpoints.
        parts.push(f.contribution(mach,refs)?); NormalSums::from_contributions(&parts)
    }
}

#[derive(Clone, Debug)]
pub struct PrescribedAxial { pub ca0: f64, pub provider_id: String, pub input_identity: String }
#[derive(Clone, Copy, Debug)]
pub struct StaticInput {
    pub relative_velocity_at_cg_b_mps: Vec3,
    /// Body order (q_pitch,p_roll,r_yaw); accepted/validated but never modeled.
    pub omega_b_radps: Vec3,
    pub mach: f64, pub density_kg_m3: f64,
    pub cg_position_from_nose_b_m: Vec3,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ComputationalStatus { CandidateStaticEvaluation, ZeroSpeedStaticLoadsOnly }
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum EmpiricalQualification { Unqualified }
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RateSupport { NotModeledStaticOnly }
#[derive(Clone, Debug)]
pub struct StaticEvaluation {
    pub provider_id: &'static str,
    pub geometry_identity: String,
    pub axial_provider_id: String,
    pub axial_input_identity: String,
    pub status: ComputationalStatus,
    pub qualification: EmpiricalQualification,
    pub rate_support: RateSupport,
    pub flow_angles: Option<FlowAngles>,
    pub reduced_rates_b: Option<Vec3>,
    pub static_coefficients_at_datum: Option<CoefficientWrench>,
    pub wind_coefficients: Option<WindCoefficients>,
    /// Missing rate loads are unknown, including when the supplied rates are zero.
    pub rate_coefficients_at_datum: Option<CoefficientWrench>,
    pub static_loads_at_cg: DimensionalWrench,
    pub normal_derivatives_at_zero_incidence: NormalSums,
}

/// Prescribed CA0 adapter only: does NOT call or qualify the legacy drag provider.
/// The integration owner must supply identified zero-incidence powered/coast data.
pub fn evaluate_static(geometry: &CandidateGeometry, refs: References, datum: Datum, axial: &PrescribedAxial, input: StaticInput) -> Result<StaticEvaluation> {
    refs.validate()?;
    finite(&[axial.ca0,input.mach,input.density_kg_m3], "nonfinite static input")?;
    if !datum.0.is_finite() || !input.cg_position_from_nose_b_m.is_finite() || !input.omega_b_radps.is_finite() { return Err(Error::InvalidInput("nonfinite position or rates")); }
    if input.density_kg_m3 < 0.0 || axial.ca0 < 0.0 || axial.provider_id.is_empty() || axial.input_identity.is_empty() { return Err(Error::InvalidInput("invalid prescribed axial source or density")); }
    let angles=flow_angles(input.relative_velocity_at_cg_b_mps)?;
    let sums=geometry.normal_sums(input.mach,refs)?;
    let speed=input.relative_velocity_at_cg_b_mps.norm();
    let (coefficients,wind,loads,reduced_rates,status)=if let Some(a)=angles {
        if input.relative_velocity_at_cg_b_mps.y <= 0.0 || a.incidence_rad > MAX_INCIDENCE_RAD { return Err(Error::UnsupportedDomain("candidate requires forward flow and incidence <= 5 degrees")); }
        let w=sums.coefficient_limit(a.alpha_rad,a.beta_rad,axial.ca0,refs,datum)?;
        let wind=WindBasis::from_angles(a.alpha_rad,a.beta_rad)?.body_to_wind(w.cf_b)?;
        let cg=w.translated(datum,Datum(input.cg_position_from_nose_b_m),refs)?;
        let q=0.5*input.density_kg_m3*speed*speed;
        let loads=cg.dimensional(q,refs)?;
        let reduced=input.omega_b_radps.scaled(refs.length_m/(2.0*speed));
        if !reduced.is_finite() { return Err(Error::InvalidInput("reduced rates overflow")); }
        (Some(w),Some(wind),loads,Some(reduced),ComputationalStatus::CandidateStaticEvaluation)
    } else {
        (None,None,DimensionalWrench { force_b_n: Vec3::ZERO,moment_b_nm: Vec3::ZERO },None,ComputationalStatus::ZeroSpeedStaticLoadsOnly)
    };
    Ok(StaticEvaluation { provider_id: PROVIDER_ID,geometry_identity: geometry.identity.clone(),axial_provider_id: axial.provider_id.clone(),axial_input_identity: axial.input_identity.clone(),status,
        qualification: EmpiricalQualification::Unqualified,rate_support: RateSupport::NotModeledStaticOnly,flow_angles: angles,reduced_rates_b: reduced_rates,
        static_coefficients_at_datum: coefficients,wind_coefficients: wind,rate_coefficients_at_datum: None,
        static_loads_at_cg: loads,normal_derivatives_at_zero_incidence: sums })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn near(a: f64,b: f64) { assert!((a-b).abs() <= 2e-12*(1.0+a.abs().max(b.abs())), "{a} != {b}"); }
    fn vector(a: Vec3,b: Vec3) { near(a.x,b.x);near(a.y,b.y);near(a.z,b.z); }
    fn refs() -> References { References { area_m2: 1.0,length_m: 1.0,diameter_m: 1.0 } }
    fn fin() -> TrapezoidFinSet { TrapezoidFinSet { count: 4,exposed_semispan_m: 1.0,local_body_radius_m: 0.5,root_chord_m: 1.0,tip_chord_m: 1.0,tip_le_sweep_m: 0.0,root_le_station_m: 1.0 } }
    fn geometry() -> CandidateGeometry {
        CandidateGeometry { identity: "analytic-cone-cylinder-fixture".into(), integral_provenance: "exact area integrals; algebra only".into(),
            declarations: GeometryDeclarations { sharp_nosed_axisymmetric_circular: true,smooth_slender_profile: true,identical_equally_spaced_thin_uncanted_fins: true },
            body: vec![BodyIntervalIntegrals { x0_m: 0.0,x1_m: 1.0,area0_m2: 0.0,area1_m2: PI/4.0,integral_area_m3: PI/12.0 },
                BodyIntervalIntegrals { x0_m: 1.0,x1_m: 4.0,area0_m2: PI/4.0,area1_m2: PI/4.0,integral_area_m3: 3.0*PI/4.0 }],fins: fin() }
    }
    fn input() -> StaticInput { StaticInput { relative_velocity_at_cg_b_mps: Vec3::new(0.1,10.0,-0.2),omega_b_radps: Vec3::ZERO,mach: 0.1,density_kg_m3: 1.0,cg_position_from_nose_b_m: Vec3::new(0.0,-2.0,0.0) } }
    fn axial() -> PrescribedAxial { PrescribedAxial { ca0: 0.3,provider_id: "fixture-prescribed-CA0".into(),input_identity: "constant-fixture".into() } }

    #[test]
    fn exact_wind_basis_signed_3d_roundtrip_and_energy() {
        for a in [-2.1,-0.3,0.0,0.4,2.3] { for b in [-1.2,-0.2,0.0,0.8] {
            let basis=WindBasis::from_angles(a,b).unwrap();
            near(basis.x.dot(basis.y),0.0);near(basis.x.dot(basis.z),0.0);near(basis.y.dot(basis.z),0.0);
            near(basis.x.norm(),1.0);near(basis.y.norm(),1.0);near(basis.z.norm(),1.0);
            near(basis.x.cross(basis.y).dot(basis.z),1.0);
            let f=Vec3::new(-2.0,-1.0,3.0); let w=basis.body_to_wind(f).unwrap();
            vector(basis.wind_to_body(w).unwrap(),f); near(f.dot(basis.y.scaled(17.0)),-17.0*w.drag);
        }}
        let identity=WindBasis::from_angles(0.0,0.0).unwrap();
        vector(identity.x,Vec3::new(1.0,0.0,0.0));vector(identity.y,Vec3::new(0.0,1.0,0.0));vector(identity.z,Vec3::new(0.0,0.0,1.0));
        let w=WindBasis::from_angles(PI/6.0,0.0).unwrap().body_to_wind(Vec3::new(0.0,-2.0,-3.0)).unwrap();
        near(w.drag,3.0_f64.sqrt()+1.5);near(w.lift,3.0*3.0_f64.sqrt()/2.0-1.0);
    }
    #[test]
    fn flow_angles_from_signed_velocity() {
        for a in [-0.3,0.2] { for b in [-0.4,0.1] {
            let basis=WindBasis::from_angles(a,b).unwrap();
            let angles=flow_angles(basis.y.scaled(12.0)).unwrap().unwrap();
            near(angles.alpha_rad,a);near(angles.beta_rad,b);
        }}
        assert!(flow_angles(Vec3::ZERO).unwrap().is_none());
        assert!(flow_angles(Vec3::new(f64::NAN,0.0,0.0)).is_err());
    }
    #[test]
    fn wrench_translation_full_3d_and_independent_couple() {
        let w=CoefficientWrench { cf_b: Vec3::new(-2.0,-1.0,-3.0),cm_b: Vec3::new(6.0,0.0,-4.0) };
        let cg=w.translated(Datum::NOSE,Datum::centerline(1.0),refs()).unwrap();
        vector(cg.cm_b,Vec3::new(3.0,0.0,-2.0));
        let other=Datum(Vec3::new(0.7,-3.2,0.4));
        let back=cg.translated(Datum::centerline(1.0),other,refs()).unwrap().translated(other,Datum::NOSE,refs()).unwrap();
        vector(back.cf_b,w.cf_b);vector(back.cm_b,w.cm_b);
        let couple=CoefficientWrench { cf_b: Vec3::ZERO,cm_b: Vec3::new(2.0,-4.0,7.0) };
        let moved=couple.translated(Datum::NOSE,other,refs()).unwrap();
        vector(moved.cf_b,Vec3::ZERO);vector(moved.cm_b,couple.cm_b);
    }
    #[test]
    fn body_cone_cylinder_expansion_contraction_and_closed_bulge() {
        let cone=BodyIntervalIntegrals { x0_m: 0.0,x1_m: 3.0,area0_m2: 0.0,area1_m2: 2.0,integral_area_m3: 2.0 }.contribution(refs()).unwrap();
        near(cone.c_per_rad,4.0);near(cone.j_m_per_rad,8.0);
        near(NormalSums::from_contributions(&[cone]).unwrap().derivative_cp(None).unwrap().station_from_nose_m.unwrap(),2.0);
        let cylinder=BodyIntervalIntegrals { x0_m: 2.0,x1_m: 5.0,area0_m2: 2.0,area1_m2: 2.0,integral_area_m3: 6.0 }.contribution(refs()).unwrap();
        near(cylinder.c_per_rad,0.0);near(cylinder.j_m_per_rad,0.0);
        // A=1+(x-1) on [1,2], then A=2-(x-2) on [2,3].
        let expansion=BodyIntervalIntegrals { x0_m: 1.0,x1_m: 2.0,area0_m2: 1.0,area1_m2: 2.0,integral_area_m3: 1.5 }.contribution(refs()).unwrap();
        let contraction=BodyIntervalIntegrals { x0_m: 2.0,x1_m: 3.0,area0_m2: 2.0,area1_m2: 1.0,integral_area_m3: 1.5 }.contribution(refs()).unwrap();
        near(expansion.c_per_rad,2.0);near(expansion.j_m_per_rad,3.0);near(contraction.c_per_rad,-2.0);near(contraction.j_m_per_rad,-5.0);
        // Smooth bulge A=1+sin²(pi*(x-1)/2), x in [1,3], integral=3.
        let bulge=BodyIntervalIntegrals { x0_m: 1.0,x1_m: 3.0,area0_m2: 1.0,area1_m2: 1.0,integral_area_m3: 3.0 }.contribution(refs()).unwrap();
        near(bulge.c_per_rad,0.0);near(bulge.j_m_per_rad,-2.0);
    }
    #[test]
    fn cancellation_keeps_moment_at_all_cg_without_force_cutoff() {
        let sums=NormalSums::from_contributions(&[NormalContribution { c_per_rad: 2.0,j_m_per_rad: 2.0 },NormalContribution { c_per_rad: -2.0,j_m_per_rad: -6.0 }]).unwrap();
        assert_eq!(sums.derivative_cp(None).unwrap().reason,Some(CpUnavailable::ZeroDenominator));
        for cg in [-2.0,0.0,1.0,10.0] {
            let w=sums.coefficient_limit(0.01,0.0,0.2,refs(),Datum::NOSE).unwrap().translated(Datum::NOSE,Datum::centerline(cg),refs()).unwrap();
            near(w.cf_b.z,0.0);near(w.cm_b.x,-0.04);near(w.cf_b.y,-0.2);
        }
        let tiny=NormalSums::from_contributions(&[NormalContribution { c_per_rad: -1e-10,j_m_per_rad: 2.0 }]).unwrap();
        near(tiny.derivative_cp(None).unwrap().station_from_nose_m.unwrap(),-2e10);
        assert_eq!(tiny.derivative_cp(Some((-1e-9,1e-9))).unwrap().reason,Some(CpUnavailable::UncertaintyContainsZero));
        assert!(tiny.derivative_cp(Some((2.0,1.0))).is_err());
        let almost=NormalSums::from_contributions(&[NormalContribution { c_per_rad: 2.0,j_m_per_rad: 2.0 },NormalContribution { c_per_rad: -1.999,j_m_per_rad: -5.997 }]).unwrap();
        near(almost.derivative_cp(None).unwrap().kappa_c.unwrap(),3.999/0.001);
    }
    #[test]
    fn versioned_cp_presentation_policy_only_hides_cancelled_ratio() {
        for sign in [-1.0,1.0] {
            let sum=NormalSums::from_contributions(&[
                NormalContribution { c_per_rad: 2.0,j_m_per_rad: 2.0 },
                NormalContribution { c_per_rad: -2.0+sign*1e-15,j_m_per_rad: -6.0 },
            ]).unwrap();
            assert_ne!(sum.c_per_rad,0.0);
            let cp=sum.derivative_cp(None).unwrap();
            assert_eq!(cp.reason,Some(CpUnavailable::NumericallyIllConditioned));
            assert!(cp.station_from_nose_m.is_none());assert!(cp.kappa_c.unwrap()>1e14);
            let w=sum.coefficient_limit(0.01,0.0,0.2,refs(),Datum::NOSE).unwrap();
            assert_ne!(w.cf_b.z,0.0);near(w.cm_b.x,-0.04);
        }
        // Exactly representable boundary: equality is suppressed; next f64 above is shown.
        let boundary=CP_CANCELLATION_RELATIVE_BOUND*4.0;
        let s=NormalSums { c_per_rad: boundary,j_m_per_rad: 1.0,sum_abs_c_per_rad: 4.0,sum_abs_j_m_per_rad: 1.0 };
        assert_eq!(s.derivative_cp(None).unwrap().reason,Some(CpUnavailable::NumericallyIllConditioned));
        let above=NormalSums { c_per_rad: f64::from_bits(boundary.to_bits()+1),..s };
        assert!(above.derivative_cp(None).unwrap().station_from_nose_m.is_some());
        let tiny=NormalSums::from_contributions(&[NormalContribution { c_per_rad: 1e-100,j_m_per_rad: 2e-100 }]).unwrap();
        near(tiny.derivative_cp(None).unwrap().station_from_nose_m.unwrap(),2.0);
        let invalid=NormalSums { sum_abs_c_per_rad: -1.0,..s };
        assert!(invalid.derivative_cp(None).is_err());
        assert!(invalid.coefficient_limit(0.0,0.0,0.2,refs(),Datum::NOSE).is_err());
    }
    #[test]
    fn fin_source_normalization_and_equal_spacing_rotation() {
        let r=References::canonical(1.0).unwrap(); let f=fin();
        let p=f.contribution(0.0,r).unwrap(); let c_one=8.0/(1.0+2.0_f64.sqrt());
        near(p.c_per_rad,(8.0/3.0)*c_one);near(p.j_m_per_rad/p.c_per_rad,1.25);
        for n in [3,4] { for rotation in [-0.8,0.0,0.7] {
            let mut xx=0.0;let mut zz=0.0;let mut xz=0.0;
            for k in 0..n { let angle=rotation+2.0*PI*f64::from(k)/f64::from(n);xx+=angle.cos().powi(2);zz+=angle.sin().powi(2);xz+=angle.sin()*angle.cos(); }
            near(xx,f64::from(n)/2.0);near(zz,f64::from(n)/2.0);near(xz,0.0);
            let mut nf=f;nf.count=n;
            near(nf.contribution(0.0,r).unwrap().c_per_rad,(4.0/3.0)*f64::from(n)/2.0*c_one);
        }}
        let re=References { area_m2: 7.0*r.area_m2,..r };
        near(f.contribution(0.3,re).unwrap().c_per_rad,f.contribution(0.3,r).unwrap().c_per_rad/7.0);
        let mut swept=f;swept.root_chord_m=2.0;swept.tip_chord_m=0.5;swept.tip_le_sweep_m=0.7;
        let p=swept.contribution(0.6,r).unwrap();
        near(p.j_m_per_rad/p.c_per_rad,1.0+0.7*3.0/7.5+(2.5-1.0/2.5)/6.0);
    }
    #[test]
    fn static_signed_derivatives_ca0_independence_and_cg() {
        let s=NormalSums::from_contributions(&[NormalContribution { c_per_rad: 2.0,j_m_per_rad: 6.0 }]).unwrap();
        for a in [-0.01,0.01] { for b in [-0.02,0.02] {
            let w=s.coefficient_limit(a,b,0.2,refs(),Datum::NOSE).unwrap();
            near(w.cf_b.z,-2.0*a);near(w.cf_b.x,-2.0*b);near(w.cm_b.x,6.0*a);near(w.cm_b.z,-6.0*b);
            let other=s.coefficient_limit(a,b,0.7,refs(),Datum::NOSE).unwrap();vector(w.cm_b,other.cm_b);near(w.cf_b.z,other.cf_b.z);near(w.cf_b.x,other.cf_b.x);
            let basis=WindBasis::from_angles(a,b).unwrap();assert_ne!(basis.body_to_wind(w.cf_b).unwrap().drag,basis.body_to_wind(other.cf_b).unwrap().drag);
            let cg=w.translated(Datum::NOSE,Datum::centerline(1.0),refs()).unwrap();near(cg.cm_b.x,4.0*a);near(cg.cm_b.z,-4.0*b);
        }}
        // Distinct coefficient-limit API works without fabricating V0 observations.
        let zero=s.coefficient_limit(0.0,0.0,0.3,refs(),Datum::NOSE).unwrap();vector(zero.cm_b,Vec3::ZERO);near(zero.cf_b.y,-0.3);
    }
    #[test]
    fn reference_scaling_preserves_loads_and_cp_with_full_datum() {
        let old=References { area_m2: 2.0,length_m: 3.0,diameter_m: 1.0 };
        let new=References { area_m2: 10.0,length_m: 21.0,..old };
        let w=CoefficientWrench { cf_b: Vec3::new(-2.0,-1.0,-3.0),cm_b: Vec3::new(6.0,2.0,-4.0) };
        let re=w.rereferenced(old,new).unwrap();
        let a=w.dimensional(12.0,old).unwrap();let b=re.dimensional(12.0,new).unwrap();vector(a.force_b_n,b.force_b_n);vector(a.moment_b_nm,b.moment_b_nm);
        let datum=Datum(Vec3::new(0.2,-1.3,-0.5));
        let a=w.translated(Datum::NOSE,datum,old).unwrap().dimensional(12.0,old).unwrap();
        let b=re.translated(Datum::NOSE,datum,new).unwrap().dimensional(12.0,new).unwrap();vector(a.moment_b_nm,b.moment_b_nm);
        let p=geometry().body[0];let s1=NormalSums::from_contributions(&[p.contribution(old).unwrap()]).unwrap();let s2=NormalSums::from_contributions(&[p.contribution(new).unwrap()]).unwrap();
        near(s1.derivative_cp(None).unwrap().station_from_nose_m.unwrap(),s2.derivative_cp(None).unwrap().station_from_nose_m.unwrap());
    }
    #[test]
    fn evaluation_zero_speed_rates_missing_and_unqualified() {
        let mut i=input();i.relative_velocity_at_cg_b_mps=Vec3::ZERO;
        let out=evaluate_static(&geometry(),refs(),Datum::NOSE,&axial(),i).unwrap();
        assert_eq!(out.status,ComputationalStatus::ZeroSpeedStaticLoadsOnly);
        assert!(out.flow_angles.is_none() && out.reduced_rates_b.is_none() && out.static_coefficients_at_datum.is_none() && out.wind_coefficients.is_none());
        vector(out.static_loads_at_cg.force_b_n,Vec3::ZERO);vector(out.static_loads_at_cg.moment_b_nm,Vec3::ZERO);
        i.omega_b_radps=Vec3::new(1.0,2.0,3.0);
        assert!(evaluate_static(&geometry(),refs(),Datum::NOSE,&axial(),i).unwrap().rate_coefficients_at_datum.is_none());
        i.relative_velocity_at_cg_b_mps=input().relative_velocity_at_cg_b_mps;
        let out=evaluate_static(&geometry(),refs(),Datum::NOSE,&axial(),i).unwrap();
        assert_eq!(out.qualification,EmpiricalQualification::Unqualified);assert!(out.rate_coefficients_at_datum.is_none());assert!(out.reduced_rates_b.is_some());
        assert_eq!(out.provider_id,PROVIDER_ID);assert_eq!(out.axial_provider_id,"fixture-prescribed-CA0");
    }
    #[test]
    fn candidate_boundaries_and_nonfinite_fail_closed() {
        let g=geometry();let a=axial();let mut i=input();
        for mach in [0.0,0.799999999] { i.mach=mach;assert!(evaluate_static(&g,refs(),Datum::NOSE,&a,i).is_ok()); }
        for mach in [-0.01,0.8,1.0] { i.mach=mach;assert!(matches!(evaluate_static(&g,refs(),Datum::NOSE,&a,i),Err(Error::UnsupportedDomain(_)))); }
        i=input();
        i.relative_velocity_at_cg_b_mps=Vec3::new(0.0,1.0,MAX_INCIDENCE_RAD.tan());assert!(evaluate_static(&g,refs(),Datum::NOSE,&a,i).is_ok());
        i.relative_velocity_at_cg_b_mps=Vec3::new(0.0,1.0,(MAX_INCIDENCE_RAD+1e-10).tan());assert!(matches!(evaluate_static(&g,refs(),Datum::NOSE,&a,i),Err(Error::UnsupportedDomain(_))));
        for v in [Vec3::new(0.0,-1.0,0.0),Vec3::new(1.0,0.0,0.0)] { i.relative_velocity_at_cg_b_mps=v;assert!(matches!(evaluate_static(&g,refs(),Datum::NOSE,&a,i),Err(Error::UnsupportedDomain(_)))); }
        for bad in [f64::NAN,f64::INFINITY,f64::NEG_INFINITY] {
            i=input();i.mach=bad;assert!(matches!(evaluate_static(&g,refs(),Datum::NOSE,&a,i),Err(Error::InvalidInput(_))));
            i=input();i.density_kg_m3=bad;assert!(evaluate_static(&g,refs(),Datum::NOSE,&a,i).is_err());
            i=input();i.omega_b_radps.x=bad;assert!(evaluate_static(&g,refs(),Datum::NOSE,&a,i).is_err());
            i=input();i.relative_velocity_at_cg_b_mps.z=bad;assert!(evaluate_static(&g,refs(),Datum::NOSE,&a,i).is_err());
            let mut ar=a.clone();ar.ca0=bad;assert!(evaluate_static(&g,refs(),Datum::NOSE,&ar,input()).is_err());
        }
        assert!(References::canonical(0.0).is_err());assert!(References::canonical(f64::MAX).is_err());
    }
    #[test]
    fn body_area_roundoff_validation_boundary_is_relative_and_fail_closed() {
        let boundary=1.0+BODY_AREA_VALIDATION_RELATIVE_BOUND;
        assert!(body_area_within_reference(boundary,1.0));
        assert!(!body_area_within_reference(f64::from_bits(boundary.to_bits()+1),1.0));
        assert!(!body_area_within_reference(1.0+1e-8,1.0));
        for bad in [f64::NAN,f64::INFINITY,f64::NEG_INFINITY,-1.0] {
            assert!(!body_area_within_reference(bad,1.0));
        }
        // No absolute-area allowance for tiny geometry.
        assert!(!body_area_within_reference(2e-100,1e-100));
        assert!(body_area_within_reference(1e-100,1e-100));
        let mut g=geometry();g.body[1].integral_area_m3*=1.0+1e-8;
        assert!(g.normal_sums(0.0,References::canonical(1.0).unwrap()).is_err());
    }
    #[test]
    fn geometry_representation_checks_do_not_qualify_shape() {
        let mut g=geometry();g.declarations.smooth_slender_profile=false;
        assert!(matches!(g.normal_sums(0.0,refs()),Err(Error::UnsupportedDomain(_))));
        let mut g=geometry();g.body[1].x0_m=1.1;assert!(g.normal_sums(0.0,refs()).is_err());
        let mut g=geometry();g.body[0].area0_m2=0.1;assert!(g.normal_sums(0.0,refs()).is_err());
        let mut g=geometry();g.body[0].integral_area_m3=10.0;assert!(g.normal_sums(0.0,refs()).is_err());
        let mut g=geometry();g.fins.count=5;assert!(g.normal_sums(0.0,refs()).is_err());
        let mut g=geometry();g.fins.root_le_station_m=4.0;assert!(g.normal_sums(0.0,refs()).is_err());
        let mut g=geometry();g.integral_provenance.clear();assert!(g.normal_sums(0.0,refs()).is_err());
    }
    #[test]
    fn reduced_rates_use_reference_length_and_air_relative_speed() {
        // omega_B=(q_pitch,p_roll,r_yaw) about body X,Y,Z; omegaHat=omega*Lref/(2V).
        // V=4 m/s and Lref=2 m give an exact factor of 0.25.
        let refs=References { area_m2:PI/4.0,length_m:2.0,diameter_m:2.0 };
        let mut i=input();
        i.relative_velocity_at_cg_b_mps=Vec3::new(0.0,4.0,0.0);
        i.omega_b_radps=Vec3::new(0.5,-0.25,1.0);
        let reduced=evaluate_static(&geometry(),refs,Datum::NOSE,&axial(),i).unwrap().reduced_rates_b.unwrap();
        vector(reduced,Vec3::new(0.125,-0.0625,0.25));
        // Moving the CG is a kinematic read point, not a rate normalization change.
        let mut moved=i;moved.cg_position_from_nose_b_m=Vec3::new(0.0,-1.25,0.0);
        vector(evaluate_static(&geometry(),refs,Datum::NOSE,&axial(),moved).unwrap().reduced_rates_b.unwrap(),reduced);
        // Zero airspeed leaves the normalized rate undefined even for nonzero omega.
        let mut rest=i;rest.relative_velocity_at_cg_b_mps=Vec3::ZERO;
        let out=evaluate_static(&geometry(),refs,Datum::NOSE,&axial(),rest).unwrap();
        assert!(out.reduced_rates_b.is_none() && out.rate_coefficients_at_datum.is_none());
    }
    #[test]
    fn body_interval_partition_preserves_signed_normal_sums() {
        // A(x)=x on [1,2] has volume 1.5. Arbitrary subdivision must not change
        // the global C/J; dropping the x0*A0 term would break the upper interval.
        let whole=BodyIntervalIntegrals { x0_m:1.0,x1_m:2.0,area0_m2:1.0,area1_m2:2.0,integral_area_m3:1.5 }
            .contribution(refs()).unwrap();
        let lower=BodyIntervalIntegrals { x0_m:1.0,x1_m:1.5,area0_m2:1.0,area1_m2:1.5,integral_area_m3:0.625 }
            .contribution(refs()).unwrap();
        let upper=BodyIntervalIntegrals { x0_m:1.5,x1_m:2.0,area0_m2:1.5,area1_m2:2.0,integral_area_m3:0.875 }
            .contribution(refs()).unwrap();
        let split=NormalSums::from_contributions(&[lower,upper]).unwrap();
        near(split.c_per_rad,whole.c_per_rad);near(split.j_m_per_rad,whole.j_m_per_rad);
        near(whole.c_per_rad,2.0);near(whole.j_m_per_rad,3.0);
        // Sharp A=4x^2/9 cone over [0,3]. The nose term is zero on the whole
        // interval but nonzero on the aft part of a split representation.
        let cone=BodyIntervalIntegrals { x0_m:0.0,x1_m:3.0,area0_m2:0.0,area1_m2:4.0,integral_area_m3:4.0 }
            .contribution(refs()).unwrap();
        let front=BodyIntervalIntegrals { x0_m:0.0,x1_m:1.0,area0_m2:0.0,area1_m2:4.0/9.0,integral_area_m3:4.0/27.0 }
            .contribution(refs()).unwrap();
        let rear=BodyIntervalIntegrals { x0_m:1.0,x1_m:3.0,area0_m2:4.0/9.0,area1_m2:4.0,integral_area_m3:4.0-4.0/27.0 }
            .contribution(refs()).unwrap();
        let split=NormalSums::from_contributions(&[front,rear]).unwrap();
        near(split.c_per_rad,cone.c_per_rad);near(split.j_m_per_rad,cone.j_m_per_rad);
    }
    #[test]
    fn fin_length_is_metadata_and_sweep_is_midchord_based() {
        let r=References { area_m2:PI/4.0,length_m:1.0,diameter_m:1.0 };
        let p=fin().contribution(0.2,r).unwrap();
        // C is per rad and J is m/rad: only area may renormalize a fin contribution.
        let q=fin().contribution(0.2,References { length_m:3.5,..r }).unwrap();
        assert_eq!(p.c_per_rad.to_bits(),q.c_per_rad.to_bits());
        assert_eq!(p.j_m_per_rad.to_bits(),q.j_m_per_rad.to_bits());
        let h=fin().contribution(0.2,References { area_m2:r.area_m2/2.0,..r }).unwrap();
        near(h.c_per_rad,2.0*p.c_per_rad);near(h.j_m_per_rad,2.0*p.j_m_per_rad);
        near(h.j_m_per_rad/h.c_per_rad,p.j_m_per_rad/p.c_per_rad);
        // Equal one-sided area, zero leading-edge sweep. A leading-edge definition
        // of Gamma would make these identical; the midchord offset (ct-cr)/2 must
        // change both slope and station.
        let rect=TrapezoidFinSet { root_chord_m:1.0,tip_chord_m:1.0,..fin() };
        let tapered=TrapezoidFinSet { root_chord_m:1.4,tip_chord_m:0.6,..fin() };
        let rectangle=rect.contribution(0.2,r).unwrap();
        let taper=tapered.contribution(0.2,r).unwrap();
        assert!(taper.c_per_rad<rectangle.c_per_rad);
        assert!(taper.j_m_per_rad/taper.c_per_rad>rectangle.j_m_per_rad/rectangle.c_per_rad);
        // Aft tip-LE sweep moves the station aft and shrinks the finite-fin slope.
        let swept=TrapezoidFinSet { tip_le_sweep_m:0.4,..rect };
        let s=swept.contribution(0.2,r).unwrap();
        assert!(s.c_per_rad<rectangle.c_per_rad);
        assert!(s.j_m_per_rad/s.c_per_rad>rectangle.j_m_per_rad/rectangle.c_per_rad);
    }
    #[test]
    fn evaluator_preserves_signed_body_moment_cancellation_without_cp_guard() {
        // Linear area ramp to A=0.5 over [0,1], then a closed bulge with equal endpoint
        // area over [1,3]: body C=1 and J=-0.5. The cancelled area growth must not
        // delete the negative body moment, and the fin adds only a tiny positive C.
        let g=CandidateGeometry { identity:"signed-cancellation-fixture".into(),
            integral_provenance:"analytic area integrals; algebra only".into(),
            declarations:GeometryDeclarations { sharp_nosed_axisymmetric_circular:true,
                smooth_slender_profile:true,identical_equally_spaced_thin_uncanted_fins:true },
            body:vec![
                BodyIntervalIntegrals { x0_m:0.0,x1_m:1.0,area0_m2:0.0,area1_m2:0.5,integral_area_m3:0.25 },
                BodyIntervalIntegrals { x0_m:1.0,x1_m:3.0,area0_m2:0.5,area1_m2:0.5,integral_area_m3:1.5 },
            ],
            fins:TrapezoidFinSet { root_chord_m:0.2,tip_chord_m:0.1,exposed_semispan_m:0.01,
                local_body_radius_m:0.5,tip_le_sweep_m:0.0,root_le_station_m:1.0,..fin() } };
        let sums=g.normal_sums(0.1,refs()).unwrap();
        assert!(sums.c_per_rad>0.0);assert!(sums.j_m_per_rad<0.0);
        let cp=sums.derivative_cp(None).unwrap().station_from_nose_m.unwrap();
        assert!(cp<0.0);
        let alpha=0.02_f64;
        let mut i=input();
        i.relative_velocity_at_cg_b_mps=Vec3::new(0.0,10.0*alpha.cos(),10.0*alpha.sin());
        let nose=evaluate_static(&g,refs(),Datum::NOSE,&axial(),i).unwrap();
        let n=nose.static_coefficients_at_datum.unwrap();
        assert_eq!(n.cf_b.y,-axial().ca0);
        assert!(n.cf_b.z<0.0 && n.cm_b.x<0.0);
        // Pure datum translation: force and datum moment are CG-independent; the
        // CG moment changes by exactly -dxG*C*alpha in coefficient space.
        let aft=evaluate_static(&g,refs(),Datum::NOSE,&axial(),
            StaticInput { cg_position_from_nose_b_m:Vec3::new(0.0,-2.0,0.0),..i }).unwrap();
        let a=aft.static_coefficients_at_datum.unwrap();
        vector(a.cf_b,n.cf_b);vector(a.cm_b,n.cm_b);
        let at_cg=a.translated(Datum::NOSE,Datum::centerline(2.0),refs()).unwrap();
        if let Some(one)=nose.static_coefficients_at_datum {
            let one=one.translated(Datum::NOSE,Datum::centerline(1.0),refs()).unwrap();
            near(at_cg.cm_b.x-one.cm_b.x,-sums.c_per_rad*alpha);
        }
        // Same signed convention in yaw: J<0 reverses the sign of the yaw moment.
        let beta=0.02_f64;
        let mut yaw=i;
        yaw.relative_velocity_at_cg_b_mps=Vec3::new(10.0*beta.sin(),10.0*beta.cos(),0.0);
        let y=evaluate_static(&g,refs(),Datum::NOSE,&axial(),yaw).unwrap()
            .static_coefficients_at_datum.unwrap();
        assert!(y.cf_b.x<0.0 && y.cm_b.z>0.0);
        // Prescribed axial input cannot enter the normal moment.
        let stronger=PrescribedAxial { ca0:0.9,provider_id:"fixture-prescribed-CA0".into(),input_identity:"constant-fixture".into() };
        let changed=evaluate_static(&g,refs(),Datum::NOSE,&stronger,i).unwrap()
            .static_coefficients_at_datum.unwrap();
        near(changed.cm_b.x,n.cm_b.x);near(changed.cf_b.z,n.cf_b.z);
        assert_ne!(changed.cf_b.y,n.cf_b.y);
    }
}
