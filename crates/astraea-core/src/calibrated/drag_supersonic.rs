//! High-Mach drag pass (mirror of TS `dragSupersonic.ts`).
//!
//! Floating-point operation order matches the TS oracle exactly; do not
//! reassociate. `NoseShape`/`Airfoil` matches replace the TS string compares.

use super::atmosphere::Site;
use super::design::{Airfoil, Design, NoseShape, PartKind};
use super::drag_subsonic::{
    adjusted_fin_areas, equivalent_diameter, frustum_wetted_ratio, nose_wetted_ratio_with_exponent,
};
use super::friction::skin_friction;
use super::{atmosphere, CalibratedError};
use std::f64::consts::PI;

/// Truncated pi used for the reference area ce, kept bit-exact for parity.
const PI_T: f64 = 3.14159;

/// High-Mach drag breakdown (TS `DragHighMachComponents`). TS-undefined slots
/// are `None` exactly where the engine omits them (body_pressure and
/// fin_friction_pressure are never filled at supersonic).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DragHighMachComponents {
    pub body_friction: f64,
    pub nose_wave: Option<f64>,
    pub body_pressure: Option<f64>,
    pub body_base: f64,
    pub fin_friction_pressure: Option<f64>,
    pub fin_friction_pressure_sup: Option<f64>,
    pub fin_interference: f64,
    pub fin_interference_sup: Option<f64>,
    pub fin_base: f64,
    pub fin_extra: Option<f64>,
    pub protuberance: f64,
}

/// High-Mach drag totals (TS `DragHighMachResult`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DragHighMach {
    pub reynolds: f64,
    pub cd_power_off: f64,
    pub cd_power_on: f64,
    pub components: Option<DragHighMachComponents>,
}

/// Isentropic stagnation pressure coefficient (shared by bluntness/lug/plate).
pub fn isentropic_cp(m: f64) -> f64 {
    let g = (2.4 / (2.8 * m * m - 0.4)).powf(2.5000000000000004)
        * (1.2 * m * m).powf(3.5000000000000004);
    (2.0 / (1.4 * m * m)) * (g - 1.0)
}

/// Base pressure number (power-off). Returns the signed number.
pub fn base_pressure_number(m: f64) -> f64 {
    if m <= 1.15 {
        -0.21
    } else if m <= 6.0 {
        -(0.34464 - 0.14358 * m + 0.024909 * m * m - 0.0015993 * m * m * m)
    } else if m < 7.0 {
        -(0.0344 - 0.0108 * (m - 6.0))
    } else {
        (2.0 / (1.4 * m * m))
            * (0.7747226539790469 * (1.0 / m).powf(2.8) * ((2.8 * m * m - 0.4) / 2.4) - 1.0)
    }
}

/// Power-on magnitude f(M) from the fixed coefficient table.
pub fn power_on_magnitude(m: f64) -> f64 {
    if m < 0.58 {
        0.0547
    } else if m < 0.925 {
        0.0547 + (m - 0.58) * 0.111304348
    } else if m < 1.0 {
        0.0931 + (m - 0.925) * 0.901333333
    } else if m < 1.1935 {
        0.1607 - (m - 1.0) * 0.066666667
    } else if m < 1.97 {
        0.1478
    } else if m < 2.45 {
        0.1478 + (m - 1.97) * 0.037916667
    } else if m < 3.0 {
        0.166 - (m - 2.45) * 0.077090909
    } else if m < 3.85 {
        0.1236 - (m - 3.0) * 0.039529412
    } else if m < 4.387 {
        0.09 - (m - 3.85) * 0.025512104
    } else if m < 7.5 {
        let iso = (2.0 / (1.4 * m * m))
            * (0.7747226539790469 * (1.0 / m).powf(2.8) * ((2.8 * m * m - 0.4) / 2.4) - 1.0);
        -iso * (-0.13413327894395483 * (m - 4.387) + 1.4175568973525314)
    } else {
        -((2.0 / (1.4 * m * m))
            * (0.7747226539790469 * (1.0 / m).powf(2.8) * ((2.8 * m * m - 0.4) / 2.4) - 1.0))
    }
}

/// Nose wave-drag fit (without bluntness), divided by 0.7*M^2.
pub fn nose_wave_fit(shape: NoseShape, m: f64, d: f64, l: f64) -> Result<f64, CalibratedError> {
    nose_wave_fit_with_exponent(shape, m, d, l, None)
}

/// Nose wave-drag fit with the CDX1 Power Law exponent when that shape is used.
pub fn nose_wave_fit_with_exponent(
    shape: NoseShape,
    m: f64,
    d: f64,
    l: f64,
    power_law_exponent: Option<f64>,
) -> Result<f64, CalibratedError> {
    let x = (m * d) / l;
    let num: f64 = match shape {
        NoseShape::TangentOgive => {
            if x <= 1.1053 {
                0.013881 + 0.016821 * x + 0.57574 * x * x
            } else {
                0.098737 + 0.043618 * x + 0.48204 * x * x
            }
        }
        NoseShape::Conical => {
            if x <= 1.4792 {
                0.016351 + 0.11179 * x + 0.38354 * x * x
            } else {
                0.080555 + 0.12364 * x + 0.34619 * x * x
            }
        }
        NoseShape::VonKarmanOgive => {
            if x <= 1.8203 {
                -0.0070281 + 0.084717 * x + 0.40673 * x * x
            } else {
                0.1653 - 0.045249 * x + 0.42612 * x * x
            }
        }
        NoseShape::LvHaack => {
            if x <= 1.3725 {
                0.5407 * x * x + 0.1113 * x + 0.0027
            } else {
                0.5776 * x * x - 0.1035 * x + 0.228
            }
        }
        NoseShape::Parabolic => 0.4955 * x * x + 0.1139 * x + 0.0097,
        NoseShape::Elliptical => 0.5395 * x * x + 0.0501 * x + 0.1088,
        NoseShape::PowerLaw => return power_law_wave_fit(m, x, power_law_exponent),
    };
    Ok(num / (0.7 * m * m))
}

/// Power Law quadratic interpolation over the source knots in `i.cs:1765-1830`.
fn power_law_wave_fit(
    m: f64,
    x: f64,
    power_law_exponent: Option<f64>,
) -> Result<f64, CalibratedError> {
    let d = power_law_exponent.ok_or_else(|| {
        CalibratedError::Unsupported(
            "power-law nose wave drag requires its exponent".into(),
        )
    })?;
    if !d.is_finite() || !(0.0..=1.0).contains(&d) {
        return Err(CalibratedError::Unsupported(format!(
            "Power Law exponent outside the engine range [0, 1]: {d}"
        )));
    }
    let q = |a: f64, b: f64, c: f64| (a * x * x + b * x + c) / (0.7 * m * m);
    let q0 = q(5.977, 0.2237, 0.5396);
    let q1 = q(3.4669, -0.0915, 0.1349);
    let q2 = q(1.6917, 0.0982, 0.0221);
    let q3 = q(0.8582, 0.108, 0.0106);
    let q4 = q(0.4955, 0.1139, 0.0097);
    let q5 = q(0.3994, -0.1705, 0.1332);
    let q6 = q(0.3152, 0.092, 0.0126);
    let q7 = q(0.305, 0.1146, 0.0096);
    let q8 = q(0.3198, 0.1189, 0.0165);
    if d <= 0.1 {
        let cp = isentropic_cp(m);
        let stagnation = if m <= 2.67 {
            0.9 * cp - 0.2
        } else {
            0.9 * cp - 1.43 / (m * m)
        };
        return Ok(stagnation + ((q0 - stagnation) / 0.1) * d);
    }
    if d <= 0.2 {
        return Ok(q0 + ((q1 - q0) / 0.1) * (d - 0.1));
    }
    if d <= 0.3 {
        return Ok(q1 + ((q2 - q1) / 0.09999999999999998) * (d - 0.2));
    }
    if d <= 0.4 {
        return Ok(q2 + ((q3 - q2) / 0.10000000000000003) * (d - 0.3));
    }
    if d <= 0.5 {
        return Ok(q3 + ((q4 - q3) / 0.09999999999999998) * (d - 0.4));
    }
    if d <= 0.666 {
        return Ok(q4 + ((q5 - q4) / 0.16600000000000004) * (d - 0.5));
    }
    if d <= 0.75 {
        return Ok(q5 + ((q6 - q5) / 0.08399999999999996) * (d - 0.666));
    }
    if d <= 0.8 {
        return Ok(q6 + ((q7 - q6) / 0.050000000000000044) * (d - 0.75));
    }
    if d <= 0.9 {
        return Ok(q7 + ((q8 - q7) / 0.09999999999999998) * (d - 0.8));
    }
    let conical = if x <= 1.4792 {
        (0.016351 + 0.11179 * x + 0.38354 * x * x) / (0.7 * m * m)
    } else {
        (0.080555 + 0.12364 * x + 0.34619 * x * x) / (0.7 * m * m)
    };
    Ok(q8 + ((conical - q8) / 0.09999999999999998) * (d - 0.9))
}

/// Supersonic compressibility factor: multiplies the Rounded/Square fin
/// profile term (wedge sections carry it inside Cf).
pub fn supersonic_compressibility(m: f64) -> f64 {
    if m <= 2.0 {
        1.0 - 0.256 * (m - 1.0)
    } else if m <= 10.0 {
        1.0 / (1.0 + 0.144 * m * m).powf(0.65)
    } else {
        0.1691
    }
}

/// Supersonic fin interference rise: per-fin-set selection between the
/// leading-edge vacuum term y and the Newtonian strip term z.
pub struct FinRiseTerm {
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

#[allow(clippy::too_many_arguments)]
pub fn fin_rise_term(
    m: f64,
    m_sw: f64,
    n_sw: f64,
    aa: f64,
    r: f64,
    thick: f64,
    span_eff: f64,
    k: f64,
    am_d: f64,
    ah_d: f64,
    s_bevel: f64,
    x: f64,
    ler: f64,
    n: f64,
    ce: f64,
    airfoil: Airfoil,
) -> FinRiseTerm {
    let a2 = (m * m - 1.0).sqrt();
    let num = if n_sw.abs() < 1.57 {
        0.9 / n_sw.cos().sqrt()
    } else {
        0.9 / (1.569f64.cos()).sqrt()
    };
    let y0: f64;
    if m <= num {
        y0 = 0.0;
    } else if m < aa {
        y0 = ((x * r * r * ((am_d * n) / ce)) / (aa * aa - 1.0).sqrt())
            * ((m * m - num * num).powf(1.5) / (aa * aa - num * num).powf(1.5));
    } else {
        y0 = (x / a2) * r * r * ((am_d * n) / ce);
    }
    let cm = m_sw.cos();
    let base = (1.28 * m * m * m * cm.powf(6.0)) / (1.0 + m * m * m * cm.powf(3.0));
    let mut v2: f64;
    if airfoil == Airfoil::SubsonicNaca || airfoil == Airfoil::Rounded {
        v2 = base * thick * ((2.0 * ah_d) / cm) / (2.0 * am_d);
        v2 *= ((2.0 * am_d) / ce) * (n / 2.0);
    } else if airfoil == Airfoil::Square {
        v2 = base * (2.0 * thick) * ((2.0 * ah_d) / cm) / (2.0 * am_d);
        v2 *= ((2.0 * am_d) / ce) * (n / 2.0);
    } else if ler > 0.0 {
        v2 = base * (2.0 * ler) * ((2.0 * ah_d) / cm) / (2.0 * am_d);
        v2 *= ((2.0 * am_d) / ce) * (n / 2.0);
    } else {
        v2 = 0.0;
    }
    let y = y0 + v2;
    let cp = isentropic_cp(m);
    let mut z: f64;
    if matches!(
        airfoil,
        Airfoil::DoubleWedge
            | Airfoil::Hexagonal
            | Airfoil::SingleWedge
            | Airfoil::HexagonalBluntBase
            | Airfoil::Biconvex
    ) {
        if ler > 0.0 {
            let th = ((0.5 * thick) / s_bevel).atan();
            let cs = 4.0 * th.sin().powf(3.0);
            z = (cp / 2.0) * cs * ((s_bevel * span_eff * n) / ce);
            let mut ct = base * (2.0 * ler) * ((2.0 * span_eff) / cm) / (2.0 * k);
            ct *= ((2.0 * k) / ce) * (n / 2.0);
            z += ct;
        } else if s_bevel > 0.0 {
            let th = ((0.5 * thick) / s_bevel).atan();
            let cs = 4.0 * th.sin().powf(3.0);
            z = (cp / 2.0) * cs * ((s_bevel * span_eff * n) / ce);
        } else {
            z = 0.0;
        }
    } else if airfoil == Airfoil::SubsonicNaca || airfoil == Airfoil::Rounded {
        let mut ct = base * thick * ((2.0 * span_eff) / cm) / (2.0 * k);
        ct *= ((2.0 * k) / ce) * (n / 2.0);
        z = ct;
    } else {
        let mut ct = base * (2.0 * thick) * ((2.0 * ah_d) / cm) / (2.0 * am_d);
        ct *= ((2.0 * am_d) / ce) * (n / 2.0);
        z = ct * ((thick * span_eff * n) / (ce * cm));
    }
    let w = if y < z && m >= aa { z } else { y };
    FinRiseTerm { y, z, w }
}

/// Bevel station s and airfoil factor x.
pub struct FinBevel {
    pub s: f64,
    pub x: f64,
}

pub fn fin_bevel(airfoil: Airfoil, mean_chord: f64, fx1: f64, fx3: f64) -> FinBevel {
    if airfoil == Airfoil::DoubleWedge {
        let mut s = fx1;
        if s == mean_chord {
            s = mean_chord - 0.01;
        }
        if s == 0.0 {
            s = 0.01;
        }
        return FinBevel {
            s,
            x: mean_chord / s / (1.0 - s / mean_chord),
        };
    }
    if airfoil == Airfoil::Biconvex {
        return FinBevel {
            s: mean_chord / 2.0,
            x: 5.33333333333333,
        };
    }
    if airfoil == Airfoil::Hexagonal {
        let s = if fx1 != 0.0 { fx1 } else { 0.01 };
        let u = if fx3 != 0.0 { fx3 } else { 0.01 };
        let t = mean_chord - s - u;
        return FinBevel {
            s,
            x: (mean_chord * (mean_chord - t)) / (s * u),
        };
    }
    if airfoil == Airfoil::SingleWedge {
        return FinBevel {
            s: mean_chord,
            x: 1.0,
        };
    }
    if airfoil == Airfoil::HexagonalBluntBase {
        let s = if fx1 != 0.0 { fx1 } else { 0.01 };
        let t = mean_chord - 2.0 * s;
        let x = (mean_chord * (mean_chord - t)) / (s * s);
        return FinBevel { s, x };
    }
    FinBevel {
        s: fx1,
        x: 5.33333333333333,
    }
}

/// Sweep-correction factor d2 (delegates to the shared subsonic helper).
pub fn fin_sweep_factor(airfoil: Airfoil, fx1: f64, chord: f64, tip: f64) -> f64 {
    super::drag_subsonic::sweep_thickness_factor(airfoil, fx1, chord, tip)
}

/// Expansion pressure slot an: Df front, Dr > Df rear, L shoulder length.
pub fn expansion_pressure_an(m: f64, df: f64, dr: f64, l: f64, ce: f64) -> f64 {
    let slant = (dr / 2.0) * (l / ((dr - df) / 2.0));
    let num = m * (dr / slant);
    let q = if num <= 1.4792 {
        (0.016351 + 0.11179 * num + 0.38354 * num * num) / (0.7 * m * m)
    } else {
        (0.080555 + 0.12364 * num + 0.34619 * num * num) / (0.7 * m * m)
    };
    q * (((dr / 2.0).powf(2.0) / (df / 2.0).powf(2.0) - 1.0) * ((PI_T * (df / 2.0).powf(2.0)) / ce))
}

/// Reducer/boattail pressure slot ao: Df front, Dr < Df rear, L length.
/// has_prior is true when any earlier Expansion or Reducer exists on the
/// vehicle; tube_len is the total tube length.
pub fn reducer_pressure_ao(
    m: f64,
    df: f64,
    dr: f64,
    l: f64,
    ce: f64,
    has_prior: bool,
    nose_len: f64,
    nose_dia: f64,
    nose_shape: NoseShape,
    tube_len: f64,
) -> f64 {
    let db = ((df - dr) / 2.0 / l).atan() * 180.0 / PI;
    let pw: f64;
    if m <= 3.0 {
        pw = 4.0;
    } else if m >= 4.0 {
        pw = 3.0;
    } else {
        pw = 4.0 - (m - 3.0);
    }
    let t1: f64;
    if db > 17.5 {
        let num3 = -(2.0 * (0.30543236111111105f64).tan() * l - df);
        t1 = ((0.001 * 17.5 + 0.00071 * 17.5 * 17.5) / m) * (1.0 - (num3 / df).powf(pw));
    } else {
        t1 = ((0.001 * db + 0.00071 * db * db) / m) * (1.0 - (dr / df).powf(pw));
    }
    let mut t2 = 0.0;
    if !has_prior {
        let l1 = tube_len - nose_len;
        let v = l1 / df;
        let f = nose_len / nose_dia;
        if v < 2.5 {
            if matches!(
                nose_shape,
                NoseShape::TangentOgive
                    | NoseShape::VonKarmanOgive
                    | NoseShape::LvHaack
                    | NoseShape::Parabolic
                    | NoseShape::Elliptical
            ) {
                let k = ((0.002 * f * f - 0.0218 * f + 0.0704) / 0.0152)
                    * (if m >= 1.25 {
                        0.0226 * m.powf(-1.4677)
                    } else {
                        0.01629
                    });
                t2 = k * (1.0 - v / 2.5);
            } else if nose_shape == NoseShape::Conical {
                let k = ((0.0016 * f * f - 0.0198 * f + 0.0879) / 0.0343)
                    * (if m >= 1.25 {
                        0.0513 * m.powf(-1.9502)
                    } else {
                        0.0332
                    });
                t2 = k * (1.0 - v / 2.5);
            }
        }
    }
    (t1 + t2) * ((PI_T * (df / 2.0).powf(2.0)) / ce)
}

/// Fin base pressure number d2. Returns the signed number.
pub fn fin_base_pressure_number(m: f64) -> f64 {
    if m < 1.19 {
        -0.46
    } else if m <= 3.0 {
        -(1.2622 - 0.98895 * m + 0.30409 * m * m - 0.033885 * m * m * m)
    } else if m <= 5.0 {
        -(0.117 - (0.06 * (m - 3.0)) / 2.0)
    } else {
        -(1.43 / (m * m))
    }
}

pub fn rail_guide_sup(m: f64, a: f64, b: f64, ce: f64) -> f64 {
    let area = a * b;
    if m >= 1.05 && m <= 1.8 {
        (4.5 * (4.715 - 3.7 * m + 0.986 * m * m) * area) / ce
    } else {
        (5.625 * area) / ce
    }
}

pub fn launch_shoe_sup(m: f64, area: f64, ce: f64) -> f64 {
    let a = area;
    if m <= 1.83 {
        (4.5 * (7.146 - 7.709 * m + 3.604 * m * m - 0.546 * m * m * m) * a) / ce
    } else {
        (7.92 * a) / ce
    }
}

pub fn launch_lug_sup(m: f64, dia: f64, ce: f64) -> f64 {
    let area = PI * (dia / 2.0).powf(2.0);
    let value = (5.75 * area) / ce;
    let cp = isentropic_cp(m);
    let d2 = cp / 2.0;
    let d3 = base_pressure_number(m);
    value + 3.0 * (d2 - d3) * (area / ce)
}

pub fn evaluate_drag_supersonic(
    design: &Design,
    mach: f64,
    nozzle_exit_in: Option<f64>,
    altitude_ft: f64,
    site: Option<&Site>,
) -> Result<DragHighMach, CalibratedError> {
    if !(mach >= 1.05) {
        return Err(CalibratedError::Unsupported(format!(
            "supersonic drag requires Mach >= 1.05 (got {mach})"
        )));
    }
    let chain = &design.chain;
    let nose = &chain[0];
    let be = design.sustainer_length;
    let cd_max = design.max_diameter;
    let ce = PI_T * (cd_max / 2.0).powf(2.0);
    let cb = design.base_diameter;
    let rough = design.surface.roughness_in();
    let forced = design.turbulence;

    let (a_sound, nu) = atmosphere(altitude_ft, site);
    let re = mach * a_sound * (be / 12.0) / nu;

    let cf_body = skin_friction(
        re,
        if rough != 0.0 { be / rough } else { 0.0 },
        mach,
        rough,
        forced,
    );
    let mut wetted = 0.0;
    for part in chain.iter() {
        if part.kind == PartKind::Nose {
            wetted += nose_wetted_ratio_with_exponent(
                design.nose_shape,
                part.length,
                part.diameter,
                ce,
                design.nose_power_law_exponent,
            )?;
        } else if part.kind == PartKind::Body {
            wetted += (PI_T * part.diameter * part.length) / ce;
        } else if part.kind == PartKind::Expansion || part.kind == PartKind::Reducer {
            wetted += frustum_wetted_ratio(part.diameter, part.aft_diameter(), part.length, ce);
        }
    }
    let body_friction = cf_body * wetted;

    // Nose wave drag.
    let nose_shape = design.nose_shape;
    let fit = nose_wave_fit_with_exponent(
        nose_shape,
        mach,
        nose.diameter,
        nose.length,
        design.nose_power_law_exponent,
    )?;
    let mut blunt = 0.0;
    let blunt_r = nose.blunt_radius.unwrap_or(0.0);
    if blunt_r > 0.0 {
        let cp = isentropic_cp(mach);
        blunt = (cp / 2.0) * ((PI_T * blunt_r * blunt_r) / (PI * (nose.diameter / 2.0).powf(2.0)));
    }
    let nose_wave = (fit + blunt) * ((PI_T * (nose.diameter / 2.0).powf(2.0)) / ce);

    // Base drag power-off, with the boattail shoulder branch.
    let num = base_pressure_number(mach);
    let body_base: f64;
    let mut dc: Option<f64> = None;
    let mut h_last: Option<f64> = None;
    let mut c_last = 0.0;
    for part in chain.iter() {
        if part.kind == PartKind::Reducer {
            dc = Some(part.diameter);
            h_last = Some(part.diameter);
            c_last = part.length;
        }
    }
    if let (Some(dc_v), Some(h_v)) = (dc, h_last) {
        if cb < h_v {
            let db_deg = ((h_v - cb) / 2.0 / c_last).atan() * 180.0 / PI;
            let ratio: f64;
            if db_deg > 17.5 {
                let num2 = -(2.0 * (0.30543236111111105f64).tan() * c_last - h_v);
                ratio = num2 / 2.0 / (h_v / 2.0);
            } else {
                ratio = cb / 2.0 / (h_v / 2.0);
            }
            body_base = -num * ratio.powf(3.0) * ((PI_T * (dc_v / 2.0).powf(2.0)) / ce);
        } else {
            body_base = -num * ((PI * (cb / 2.0).powf(2.0)) / ce);
        }
    } else {
        body_base = -num * ((PI * (cb / 2.0).powf(2.0)) / ce);
    }

    // Fin friction+pressure (sup), interference (sub-style), supersonic rise
    // (c0), base.
    let mut fin_fric_sup = 0.0;
    let mut fin_interf = 0.0;
    let mut fin_rise = 0.0;
    let mut fin_base = 0.0;
    let d2 = fin_base_pressure_number(mach);
    for part in chain.iter() {
        if (part.kind == PartKind::Body || part.kind == PartKind::Reducer) && part.fin.is_some() {
            let fin = part.fin.as_ref().unwrap();
            let body_d = fin.parent_diameter;
            let cr = fin.chord;
            let ct = fin.tip;
            let sd = fin.sweep;
            let span = fin.span;
            let t = fin.thickness;
            let n = fin.count;
            let airfoil = fin.airfoil;
            let h_front = body_d;
            let h_rear = fin.rear_diameter;

            let num_f = sd + ct - cr;
            let k = (sd / 2.0 + num_f / 2.0 + (ct - num_f)) * span;
            let l = k
                + ((sd / span) * (h_front / 2.0) / 2.0 - (num_f / span) * (h_front / 2.0) / 2.0
                    + cr)
                    * (h_front / 2.0);
            let overhang = (cr - fin.location).max(0.0);
            let ai = equivalent_diameter(h_front, h_rear, cr, overhang);
            let adj = adjusted_fin_areas(sd, ct, cr, span, h_front, ai, num_f, k, fin.leading_edge);
            let am = adj.am;
            let aj_mean = adj.aj;

            let r = t / aj_mean;
            let re_f = (re * aj_mean / be).max(1e4 * aj_mean / be);
            let cf = skin_friction(
                re_f,
                if rough != 0.0 { aj_mean / rough } else { 0.0 },
                mach,
                rough,
                forced,
            );

            let mut nn: f64;
            if airfoil == Airfoil::Rounded {
                nn = 0.02 + 0.02 * ((r - 0.04) / 0.04) - 0.29 * ((t * span) / k);
                nn *= supersonic_compressibility(mach);
                if forced {
                    let mult: f64;
                    if re_f <= 500000.0 {
                        mult = 2.7;
                    } else if re_f < 2580000.0 {
                        mult = 2.7 - 8.173076923076924e-7 * (re_f - 500000.0);
                    } else {
                        mult = 1.0;
                    }
                    nn *= mult;
                }
            } else if airfoil == Airfoil::Square {
                nn = 0.028 + 0.06 * ((r - 0.032) / 0.068) - 0.29 * ((t * span) / k);
                nn *= supersonic_compressibility(mach);
                if forced {
                    let mult: f64;
                    if re_f <= 500000.0 {
                        mult = 2.7;
                    } else if re_f < 2580000.0 {
                        mult = 2.7 - 8.173076923076924e-7 * (re_f - 500000.0);
                    } else {
                        mult = 1.0;
                    }
                    nn *= mult;
                }
            } else {
                nn = 2.0 * cf;
            }
            let fi = nn * ((am * n as f64) / ce);
            fin_fric_sup += fi;
            fin_interf += fi * ((l - am) / am);
            {
                let m_sw = (sd / span).atan();
                let d2s = fin_sweep_factor(airfoil, fin.fx1, cr, ct);
                let n_sw = ((sd + d2s * ct - d2s * cr) / span).atan();
                let aa = if m_sw == 0.0 {
                    1.0
                } else {
                    (m_sw.tan().powf(2.0) + 1.0).sqrt()
                };
                let tapered = h_front != ai;
                let ah_d = if tapered {
                    span + (h_front - ai) / 2.0
                } else {
                    span
                };
                let am_d = if tapered { am } else { k };
                let mean_chord = k / span;
                let bev = fin_bevel(airfoil, mean_chord, fin.fx1, fin.fx3);
                fin_rise += fin_rise_term(
                    mach,
                    m_sw,
                    n_sw,
                    aa,
                    r,
                    t,
                    span,
                    k,
                    am_d,
                    ah_d,
                    bev.s,
                    bev.x,
                    fin.le_radius,
                    n as f64,
                    ce,
                    airfoil,
                )
                .w;
            }
            if matches!(
                airfoil,
                Airfoil::SingleWedge
                    | Airfoil::HexagonalBluntBase
                    | Airfoil::Square
                    | Airfoil::Rounded
            ) {
                fin_base += -d2 * (t * span * n as f64) / ce;
            }
        }
    }

    // Protuberances (supersonic bands; engine stores 0 when sizes are 0).
    let mut protub = 0.0;
    for part in chain.iter() {
        if part.kind != PartKind::Body {
            continue;
        }
        if part.rail_diameter.unwrap_or(0.0) > 0.0 || part.rail_height.unwrap_or(0.0) > 0.0 {
            protub += rail_guide_sup(
                mach,
                part.rail_diameter.unwrap_or(0.0),
                part.rail_height.unwrap_or(0.0),
                ce,
            );
        }
        if part.lug_diameter.unwrap_or(0.0) > 0.0 {
            protub += launch_lug_sup(mach, part.lug_diameter.unwrap_or(0.0), ce);
        }
        if part.shoe_area.unwrap_or(0.0) > 0.0 {
            protub += launch_shoe_sup(mach, part.shoe_area.unwrap_or(0.0), ce);
        }
    }

    // Fin extra (c2 = sum an + sum ao), in wiring order.
    let mut fin_extra = 0.0;
    {
        let mut has_prior = false;
        let mut tube_len = 0.0;
        for part in chain.iter() {
            if part.kind == PartKind::Body {
                tube_len += part.length;
            }
        }
        let nose_shape_v = design.nose_shape;
        for part in chain.iter() {
            if part.kind == PartKind::Expansion {
                fin_extra += expansion_pressure_an(
                    mach,
                    part.diameter,
                    part.aft_diameter(),
                    part.length,
                    ce,
                );
                has_prior = true;
            } else if part.kind == PartKind::Reducer {
                fin_extra += reducer_pressure_ao(
                    mach,
                    part.diameter,
                    part.aft_diameter(),
                    part.length,
                    ce,
                    has_prior,
                    nose.length,
                    nose.diameter,
                    nose_shape_v,
                    tube_len,
                );
                has_prior = true;
            }
        }
    }

    let cd_off = body_friction
        + nose_wave
        + body_base
        + fin_fric_sup
        + fin_rise
        + fin_interf
        + fin_base
        + fin_extra
        + protub;

    let nozzle_dia = nozzle_exit_in.unwrap_or(design.sustainer_nozzle);
    let f_m = power_on_magnitude(mach);
    let mut mi = 0.0;
    if cb != 0.0 && nozzle_dia > 0.0 {
        mi = (-f_m * (PI * (nozzle_dia / 2.0).powf(2.0))) / (PI_T * (cb / 2.0).powf(2.0));
        mi *= (PI * (cb / 2.0).powf(2.0)) / ce;
    }
    let cd_on = cd_off + mi;

    Ok(DragHighMach {
        reynolds: re,
        cd_power_off: cd_off,
        cd_power_on: cd_on,
        components: Some(DragHighMachComponents {
            body_friction,
            nose_wave: Some(nose_wave),
            body_pressure: None,
            body_base,
            fin_friction_pressure: None,
            fin_friction_pressure_sup: Some(fin_fric_sup),
            fin_interference: fin_interf,
            fin_interference_sup: Some(fin_rise),
            fin_base,
            fin_extra: Some(fin_extra),
            protuberance: protub,
        }),
    })
}
