//! Independently defined external profiles for the opt-in SB1 geometry adapter.
//! Stations are meters aft of the nose. No legacy CNa/CP routines are used.
use crate::aero_coefficients::BodyIntervalIntegrals;
use std::f64::consts::PI;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Profile {
    Cone { length_m: f64, base_radius_m: f64 },
    Cylinder { length_m: f64, radius_m: f64 },
    ConicalFrustum { length_m: f64, fore_radius_m: f64, aft_radius_m: f64 },
    TangentOgive { length_m: f64, base_radius_m: f64 },
}
#[derive(Clone, Copy, Debug)]
pub struct QuadratureSettings {
    pub absolute_tolerance_m3: f64,
    pub relative_tolerance: f64,
    /// Power of two in 8..=1048576; no unbounded refinement.
    pub max_panels: usize,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum IntegrationMethod { Analytic, CompositeSimpsonRichardson }
#[derive(Clone, Copy, Debug)]
pub struct IntegrationReport {
    pub method: IntegrationMethod,
    pub integral_area_m3: f64,
    /// Richardson estimate, not a rigorous interval bound or empirical uncertainty.
    pub estimated_error_m3: f64,
    pub roundoff_indicator_m3: f64,
    pub requested_tolerance_m3: f64,
    pub panels: usize,
    pub evaluations: usize,
    pub converged: bool,
}
#[derive(Clone, Debug)]
pub enum ProfileError {
    Invalid(&'static str),
    NonConverged(IntegrationReport),
}
impl QuadratureSettings {
    pub fn validate(self) -> Result<(), ProfileError> {
        if !self.absolute_tolerance_m3.is_finite() || self.absolute_tolerance_m3 <= 0.0
            || !self.relative_tolerance.is_finite() || self.relative_tolerance < 0.0
            || !self.max_panels.is_power_of_two() || !(8..=1048576).contains(&self.max_panels) {
            return Err(ProfileError::Invalid("invalid explicit quadrature tolerance/budget"));
        }
        Ok(())
    }
}
impl Profile {
    pub fn dimensions(self) -> (f64, f64, f64) {
        match self {
            Self::Cone { length_m, base_radius_m } | Self::TangentOgive { length_m, base_radius_m } => (length_m, 0.0, base_radius_m),
            Self::Cylinder { length_m, radius_m } => (length_m, radius_m, radius_m),
            Self::ConicalFrustum { length_m, fore_radius_m, aft_radius_m } => (length_m, fore_radius_m, aft_radius_m),
        }
    }
    pub fn validate(self) -> Result<(), ProfileError> {
        let (l, a, b) = self.dimensions();
        if ![l,a,b].iter().all(|v| v.is_finite()) || l <= 0.0 || a < 0.0 || b <= 0.0 {
            return Err(ProfileError::Invalid("nonfinite/nonpositive profile dimensions"));
        }
        if matches!(self, Self::TangentOgive { .. }) && l <= b {
            return Err(ProfileError::Invalid("sharp tangent ogive requires length greater than base radius"));
        }
        Ok(())
    }
    /// Exact profile definition; explicit endpoints avoid cancellation at the tip.
    pub fn radius_at_fraction(self, u: f64) -> Result<f64, ProfileError> {
        self.validate()?;
        if !u.is_finite() || !(0.0..=1.0).contains(&u) { return Err(ProfileError::Invalid("profile coordinate outside interval")); }
        let (l,a,b) = self.dimensions();
        let r = match self {
            Self::TangentOgive { .. } => {
                // Circle radius rho=(L²+R²)/(2R), y=sqrt(rho²-(L-x)²)+R-rho.
                // Rationalized dimensionless form preserves the sharp tip.
                let k = b/l;
                let radicand = (1.0+k*k).powi(2)-4.0*k*k*(1.0-u).powi(2);
                b*2.0*u*(2.0-u)/(radicand.sqrt()+1.0-k*k)
            },
            _ => a*(1.0-u)+b*u,
        };
        if !r.is_finite() || r < 0.0 { return Err(ProfileError::Invalid("profile radius arithmetic failed")); }
        Ok(r)
    }
    pub fn integrate(self, x0_m: f64, q: QuadratureSettings) -> Result<(BodyIntervalIntegrals, IntegrationReport), ProfileError> {
        self.validate()?; q.validate()?;
        let (l,a,b) = self.dimensions();
        let x1 = x0_m+l;
        if !x0_m.is_finite() || x0_m < 0.0 || !x1.is_finite() || x1 <= x0_m {
            return Err(ProfileError::Invalid("invalid/overflowed profile stations"));
        }
        let area0 = PI*a*a; let area1 = PI*b*b;
        let mut report = if matches!(self, Self::TangentOgive { .. }) {
            let simpson = |n: usize| -> Result<f64, ProfileError> {
                let mut sum: f64 = 0.0;
                let mut correction = 0.0;
                for i in 0..=n {
                    let r = self.radius_at_fraction(i as f64/n as f64)?;
                    let weight = if i == 0 || i == n { 1.0 } else if i%2 == 0 { 2.0 } else { 4.0 };
                    // Neumaier compensation avoids O(n*epsilon) naive positive-sum
                    // accumulation at the explicit maximum panel budget. The
                    // separate roundoff indicator remains a diagnostic, not a bound
                    // on profile evaluation, quadrature or physical uncertainty.
                    let term = weight*PI*r*r;
                    let next = sum+term;
                    correction += if sum.abs() >= term.abs() { (sum-next)+term } else { (term-next)+sum };
                    sum = next;
                }
                let value = (sum+correction)*(x1-x0_m)/(3.0*n as f64);
                if !value.is_finite() || value <= 0.0 { return Err(ProfileError::Invalid("quadrature arithmetic failed")); }
                Ok(value)
            };
            let mut previous = simpson(4)?;
            let mut panels = 8;
            let mut evaluations = 5;
            loop {
                let value = simpson(panels)?; evaluations += panels+1;
                let error = (value-previous).abs()/15.0;
                let tolerance = q.absolute_tolerance_m3+q.relative_tolerance*value.abs();
                let roundoff = 64.0*f64::EPSILON*value.abs();
                if !tolerance.is_finite() { return Err(ProfileError::Invalid("quadrature tolerance overflow")); }
                let r = IntegrationReport { method: IntegrationMethod::CompositeSimpsonRichardson,
                    integral_area_m3: value, estimated_error_m3: error, roundoff_indicator_m3: roundoff,
                    requested_tolerance_m3: tolerance, panels, evaluations,
                    converged: error+roundoff <= tolerance };
                if r.converged { break r; }
                if panels == q.max_panels { return Err(ProfileError::NonConverged(r)); }
                previous = value; panels *= 2;
            }
        } else {
            // Integrate over the represented station interval, preserving cylinder
            // area directly instead of multiplying/dividing three identical terms.
            let width = x1-x0_m;
            let integral = if a == b { area1*width } else { PI*width*(a*a+a*b+b*b)/3.0 };
            IntegrationReport { method: IntegrationMethod::Analytic, integral_area_m3: integral,
                estimated_error_m3: 0.0, roundoff_indicator_m3: 64.0*f64::EPSILON*integral.abs(),
                requested_tolerance_m3: q.absolute_tolerance_m3+q.relative_tolerance*integral.abs(),
                panels: 0, evaluations: 0, converged: true }
        };
        if ![area0,area1,report.integral_area_m3,report.roundoff_indicator_m3,report.requested_tolerance_m3].iter().all(|v| v.is_finite())
            || area1 <= 0.0 || report.integral_area_m3 <= 0.0 {
            return Err(ProfileError::Invalid("profile integral overflow/underflow"));
        }
        // Analytic reports label roundoff separately; no numerical-error certification.
        report.converged = true;
        Ok((BodyIntervalIntegrals { x0_m, x1_m: x1, area0_m2: area0, area1_m2: area1,
            integral_area_m3: report.integral_area_m3 }, report))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn q() -> QuadratureSettings { QuadratureSettings { absolute_tolerance_m3: 1e-12, relative_tolerance: 1e-11, max_panels: 4096 } }
    fn near(a: f64,b: f64) { assert!((a-b).abs() < 1e-10*(1.0+b.abs()), "{a} != {b}"); }
    #[test]
    fn cone_cylinder_frustum_analytic_integrals() {
        for (p, expected) in [
            (Profile::Cone { length_m: 3.0, base_radius_m: 2.0 }, 4.0*PI),
            (Profile::Cylinder { length_m: 3.0, radius_m: 2.0 }, 12.0*PI),
            (Profile::ConicalFrustum { length_m: 3.0, fore_radius_m: 1.0, aft_radius_m: 2.0 }, 7.0*PI),
            (Profile::ConicalFrustum { length_m: 3.0, fore_radius_m: 2.0, aft_radius_m: 1.0 }, 7.0*PI),
        ] {
            let (i,r) = p.integrate(4.0,q()).unwrap(); near(i.integral_area_m3,expected);
            assert_eq!(r.method,IntegrationMethod::Analytic); near(i.x1_m,7.0);
        }
    }
    #[test]
    fn ogive_converges_to_independent_circle_antiderivative() {
        // Independent 80-digit mpmath 1.3.0 references, rounded to f64 only
        // after evaluating the circle antiderivative below at exact binary
        // inputs. This avoids cancellation in an f64 antiderivative for L/R>1.
        // rho=(L²+R²)/(2R), h=R-rho; V=pi*((h²+rho²)*L-L³/3
        //     +h*(L*sqrt(rho²-L²)+rho²*asin(L/rho))).
        // Inputs: (0x1p+1,0x1p+0) and
        // (0x1.999999999999ap-3,0x1.eb851eb851eb8p-6).
        let fixtures = [
            (2.0,1.0,3.581_229_217_335_782_4),
            (0.2,0.03,0.000_303_524_494_518_613_8),
        ];
        for (length_m,base_radius_m,expected) in fixtures {
            let p=Profile::TangentOgive { length_m,base_radius_m };
            let mut previous_panels=0;
            let mut previous_estimate=f64::INFINITY;
            for (label,settings) in [
                ("standard",q()),
                ("tight",QuadratureSettings { absolute_tolerance_m3: 1e-18,relative_tolerance: 1e-13,max_panels: 4096 }),
            ] {
                let (i,r)=p.integrate(0.0,settings).unwrap();
                let actual_error=(i.integral_area_m3-expected).abs();
                eprintln!("ogive L={length_m} R={base_radius_m} {label}: actual_abs_error={actual_error:.17e} Richardson_estimate={:.17e} roundoff_indicator={:.17e} requested_tolerance={:.17e} panels={}",
                    r.estimated_error_m3,r.roundoff_indicator_m3,r.requested_tolerance_m3,r.panels);
                assert!(actual_error <= r.requested_tolerance_m3,
                    "independent actual error {actual_error} exceeds requested {}",r.requested_tolerance_m3);
                assert!(r.converged && r.panels>=previous_panels && r.estimated_error_m3<=previous_estimate);
                assert!(r.estimated_error_m3+r.roundoff_indicator_m3<=r.requested_tolerance_m3);
                previous_panels=r.panels;previous_estimate=r.estimated_error_m3;
            }
            near(p.radius_at_fraction(0.0).unwrap(),0.0);
            near(p.radius_at_fraction(1.0).unwrap(),base_radius_m);
            // Tight tolerance with insufficient panels, and a tolerance below
            // the roundoff indicator, both fail without fabricating accuracy.
            for settings in [
                QuadratureSettings { absolute_tolerance_m3: 1e-18,relative_tolerance: 1e-13,max_panels: 8 },
                QuadratureSettings { absolute_tolerance_m3: 1e-30,relative_tolerance: 0.0,max_panels: 64 },
            ] {
                assert!(matches!(p.integrate(0.0,settings),Err(ProfileError::NonConverged(r))
                    if !r.converged && r.panels==settings.max_panels
                    && r.estimated_error_m3+r.roundoff_indicator_m3>r.requested_tolerance_m3));
            }
        }
    }
    #[test]
    fn nonconvergence_and_invalid_arithmetic_fail_closed() {
        let p=Profile::TangentOgive { length_m: 2.0, base_radius_m: 1.0 };
        let mut settings=q(); settings.max_panels=8;
        assert!(matches!(p.integrate(0.0,settings),Err(ProfileError::NonConverged(r)) if !r.converged && r.panels==8));
        for bad in [f64::NAN,f64::INFINITY,-1.0,0.0] {
            assert!(Profile::Cone { length_m: bad,base_radius_m: 1.0 }.integrate(0.0,q()).is_err());
        }
        assert!(Profile::Cone { length_m: f64::MAX,base_radius_m: 2.0 }.integrate(0.0,q()).is_err());
        assert!(p.integrate(f64::MAX,q()).is_err());
        settings=q();settings.absolute_tolerance_m3=f64::NAN;assert!(p.integrate(0.0,settings).is_err());
    }
}
