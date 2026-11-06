//! calibrated II subsonic normal-force / CP pass (Mach <= 0.9).
//!
//! Port of `src/aero/calibrated/normalForceSubsonic.ts`: the Rogers/barrowman
//! component slots (nose o/r, fin p/q/s/t, expansion/reducer o/r, crossflow
//! planform v/u), the Jorgensen crossflow drag, and the aggregation into
//! [`NormalForce`]. Floating-point operation order and every engine constant
//! mirror the TS oracle exactly (`Math.pow` -> `powf`).
//!
//! Clippy allowances below are load-bearing, not style: `PI_ENG = 3.14159`
//! must stay the truncated literal (std PI would shift every area
//! ratio), and branch/if float comparisons must keep TS source order.
#![allow(clippy::approx_constant, clippy::manual_range_contains)]

use super::design::{Design, Fin, NoseShape, PartKind};
use super::geometry::equivalent_diameter;
use super::CalibratedError;

const PI_ENG: f64 = 3.14159;
const REF_ALPHA_RAD: f64 = 0.0698131111111111;

/// TS `NormalForceResult` field-for-field.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NormalForce {
    pub cl: f64,
    pub cn: f64,
    pub cn_potential: f64,
    pub cn_viscous: f64,
    pub cn_alpha04: f64,
    pub cp_in: f64,
    pub cp04_in: f64,
}

/// TS `ComponentCoeff` (o/p/q linear slots with r/s/t stations, v/u planform).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ComponentCoeff {
    pub o: f64,
    pub p: f64,
    pub q: f64,
    pub r: f64,
    pub s: f64,
    pub t: f64,
    pub v: f64,
    pub u: f64,
}

/// TS `reference` return: sustainer length be, first diameter cc, max cd, area ce.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ReferenceValues {
    pub be: f64,
    pub cc: f64,
    pub cd: f64,
    pub ce: f64,
}

/// TS `componentValues` return: the component list plus its reference block.
#[derive(Clone, Debug, PartialEq)]
pub struct ComponentValues {
    pub comps: Vec<ComponentCoeff>,
    pub reference: ReferenceValues,
}

pub fn reference(design: &Design) -> ReferenceValues {
    let be = design.sustainer_length;
    let cc = design.first_diameter;
    let cd = design.max_diameter;
    let ce = PI_ENG * (cd / 2.0).powf(2.0);
    ReferenceValues { be, cc, cd, ce }
}

fn nose_cp_fraction(shape: NoseShape) -> Option<f64> {
    Some(match shape {
        NoseShape::TangentOgive => 0.466,
        NoseShape::Conical => 2.0 / 3.0,
        NoseShape::VonKarmanOgive => 0.5,
        NoseShape::LvHaack => 0.4415,
        NoseShape::Parabolic => 0.5,
        NoseShape::Elliptical => 0.333,
        NoseShape::PowerLaw => return None,
    })
}

fn nose_cp_slope(shape: NoseShape) -> Option<f64> {
    Some(match shape {
        NoseShape::TangentOgive => 1.75,
        NoseShape::Conical => 2.8,
        NoseShape::VonKarmanOgive => 1.85,
        NoseShape::LvHaack => 1.65,
        NoseShape::Parabolic => 1.85,
        NoseShape::Elliptical => 1.4,
        NoseShape::PowerLaw => return None,
    })
}

/// Engine Power Law crossflow volume/centroid and Rogers CP slope coefficients.
/// Source branches are described in geometry.md and validated by the W20
/// exponent 0.5/0.75/1.0 engine corpus rows.
pub(super) fn power_law_nose_parameters(exponent: f64) -> Result<(f64, f64, f64), CalibratedError> {
    if !exponent.is_finite() || !(0.0..=1.0).contains(&exponent) {
        return Err(CalibratedError::Unsupported(format!(
            "Power Law exponent outside the engine range [0, 1]: {exponent}"
        )));
    }
    if exponent < 0.5 {
        Ok((
            1.0 - (2.0 / 3.0) * exponent,
            0.5 + 0.2 * exponent,
            1.9 * exponent + 0.9,
        ))
    } else {
        Ok((
            2.0 / 3.0 - (exponent - 0.5) / 3.0,
            0.6 + (exponent - 0.5) / 7.5,
            1.9 * exponent + 0.9,
        ))
    }
}

struct NosePlanform {
    v: f64,
    u: f64,
}

fn nose_planform(
    shape: NoseShape,
    l: f64,
    d: f64,
    x: f64,
    power_law_exponent: Option<f64>,
) -> Result<NosePlanform, CalibratedError> {
    match shape {
        NoseShape::Conical => Ok(NosePlanform {
            v: 0.5 * l * d,
            u: x + (2.0 / 3.0) * l,
        }),
        NoseShape::Parabolic => Ok(NosePlanform {
            v: (2.0 / 3.0) * l * d,
            u: x + 0.6 * l,
        }),
        NoseShape::Elliptical => Ok(NosePlanform {
            v: (std::f64::consts::PI * (d / 2.0) * l) / 2.0,
            u: x + (l - (4.0 * l) / (3.0 * std::f64::consts::PI)),
        }),
        NoseShape::PowerLaw => {
            let exponent = power_law_exponent.ok_or_else(|| {
                CalibratedError::Unsupported(
                    "power-law nose planform requires its exponent".into(),
                )
            })?;
            let (v_coef, u_coef, _) = power_law_nose_parameters(exponent)?;
            Ok(NosePlanform {
                v: v_coef * l * d,
                u: x + u_coef * l,
            })
        }
        // Tangent Ogive / Von Karman Ogive / LV-Haack
        NoseShape::TangentOgive | NoseShape::VonKarmanOgive | NoseShape::LvHaack => {
            Ok(NosePlanform {
                v: (2.0 / 3.0) * l * d,
                u: x + 0.625 * l,
            })
        }
    }
}

/// Subsonic fin-count multiplier table (TS `mult[N]`; designFromCdx1 guarantees
/// 3..8, so out-of-range reads mirror the TS `undefined` product as NaN).
fn subsonic_count_factor(count: u32) -> f64 {
    match count {
        3 => 0.866,
        4 => 1.0,
        5 => 1.5388,
        6 => 1.7321,
        7 => 2.1906,
        8 => 2.4142,
        _ => f64::NAN,
    }
}

struct FinSlots {
    p: f64,
    q: f64,
    s: f64,
    t: f64,
}

fn fin_coeffs(fin: &Fin, cc: f64, ce: f64, rogers: bool) -> FinSlots {
    let n = fin.count;
    let n_f = fin.count as f64;
    let cr = fin.chord;
    let ct = fin.tip;
    let span = fin.span;
    let sweep = fin.sweep;
    let h_front = fin.parent_diameter;
    let h_rear = fin.rear_diameter;
    let overhang = (cr - fin.location).max(0.0);
    // Adjusted geometry for overhanging roots. Cylindrical parents reproduce
    // the raw planform values.
    let mut ae = cr;
    let af = ct;
    let mut ag = sweep;
    let mut ah = span;
    let mut ai = h_front;
    let mut ad = fin.leading_edge;
    if overhang > 0.0 && h_rear != h_front {
        ai = equivalent_diameter(h_front, h_rear, cr, overhang);
        let num_raw = sweep + ct - cr;
        let num2 = if sweep != 0.0 {
            ((h_front - ai) / 2.0) / (span / sweep)
        } else {
            0.0
        };
        let num3 = if num_raw != 0.0 {
            ((h_front - ai) / 2.0) / (span / num_raw)
        } else {
            0.0
        };
        ae = num2 + cr - num3;
        ag = num2 + sweep;
        ah = span + (h_front - ai) / 2.0;
        ad = fin.leading_edge - num2;
    }
    let num = crate::v8_math::js_hypot(ag + 0.5 * af - 0.5 * ae, ah);
    let slope = (1.0 + (2.0 * num / (ae + af)).powf(2.0)).sqrt();
    let chord_area_ratio = PI_ENG * (cc / 2.0).powf(2.0) / ce;

    let fin_p: f64;
    let fin_q: f64;
    if rogers {
        let mut value = 16.0 * (ah / cc).powf(2.0) / (1.0 + slope);
        // designFromCdx1 guarantees N is an integer 3..8, all keys of this table.
        value *= subsonic_count_factor(n);
        let ratio = (ai / 2.0) / (ai / 2.0 + ah);
        let a8 = 1.0 + 0.803 * ratio + 0.201 * ratio * ratio;
        let b3 = (1.0 + ratio).powf(2.0) - a8;
        fin_p = a8 * value * chord_area_ratio;
        fin_q = b3 * value * chord_area_ratio;
    } else {
        let value = 4.0 * n_f * (ah / cc).powf(2.0) / (1.0 + slope);
        let d2 = if 2.5 <= n_f && n_f <= 4.5 { 1.0 } else { 0.5 };
        let a8 = 1.0 + d2 * (ai / 2.0) / (ah + ai / 2.0);
        fin_p = a8 * value * (std::f64::consts::PI * (cc / 2.0).powf(2.0) / ce);
        fin_q = 0.0;
    }

    let cp_offset =
        ag * (ae + 2.0 * af) / (3.0 * (ae + af)) + (ae + af - ae * af / (ae + af)) / 6.0;
    let fin_s = ad + cp_offset;
    let fin_t = if rogers { ad + 0.25 * ae } else { 0.0 };
    FinSlots {
        p: fin_p,
        q: fin_q,
        s: fin_s,
        t: fin_t,
    }
}

pub fn component_values(design: &Design, rogers: bool) -> Result<ComponentValues, CalibratedError> {
    let rf = reference(design);
    let cc = rf.cc;
    let ce = rf.ce;
    // Data-dependent length (one nose slot plus one slot per body/expansion /
    // reducer part plus one slot per fin set), so the TS ComponentCoeff[] maps
    // to a Vec here.
    let mut comps: Vec<ComponentCoeff> = Vec::new();

    let chain = &design.chain;
    let nose_part = chain
        .first()
        .ok_or_else(|| CalibratedError::Design("design chain is empty (nose part required)".into()))?;

    // Body length behind the nose station: body lengths after the nose until
    // (not including) the first expansion/reducer, skipping fin sets.
    let mut nose_aft_len: f64 = 0.0;
    for part in chain.iter().skip(1) {
        if part.kind == PartKind::Expansion || part.kind == PartKind::Reducer {
            break;
        }
        if part.kind == PartKind::Body {
            nose_aft_len += part.length;
        }
    }

    // Nose cone
    let l = nose_part.length;
    let d = nose_part.diameter;
    let x = nose_part.location;
    let nose_shape = design.nose_shape;
    let area_ratio = PI_ENG * (d / 2.0).powf(2.0) / ce;
    let nose_o: f64;
    if rogers {
        nose_o = 2.0 * ((l + nose_aft_len) / l).powf(0.1) * area_ratio;
    } else {
        nose_o = 2.0 * area_ratio;
    }

    let power_law_exponent = if nose_shape == NoseShape::PowerLaw {
        Some(design.power_law_exponent()?)
    } else {
        None
    };
    let (f, k) = if let Some(exponent) = power_law_exponent {
        let (_, _, slope) = power_law_nose_parameters(exponent)?;
        let mut vol_fraction = std::f64::consts::PI * d * d * l / (4.0 * (2.0 * exponent + 1.0));
        vol_fraction /= std::f64::consts::PI * (d / 2.0).powf(2.0);
        vol_fraction /= l;
        (1.0 - vol_fraction, slope)
    } else {
        (
            nose_cp_fraction(nose_shape).expect("non-Power-Law nose CP fraction"),
            nose_cp_slope(nose_shape).expect("non-Power-Law nose CP slope"),
        )
    };
    let nose_r: f64;
    if rogers {
        // Same stopped-sum body length as the CNa branch feeds both terms.
        nose_r = x + (-(1.0 - f) * (l + k * nose_aft_len) + l + nose_aft_len);
    } else {
        nose_r = x + f * l;
    }

    let plan = nose_planform(nose_shape, l, d, x, power_law_exponent)?;
    comps.push(ComponentCoeff {
        o: nose_o,
        p: 0.0,
        q: 0.0,
        r: nose_r,
        s: 0.0,
        t: 0.0,
        v: plan.v,
        u: plan.u,
    });

    // Body / expansion / reducer chain (axial order).
    for (i, part) in chain.iter().enumerate().skip(1) {
        if part.kind == PartKind::Body {
            comps.push(ComponentCoeff {
                o: 0.0,
                p: 0.0,
                q: 0.0,
                r: 0.0,
                s: 0.0,
                t: 0.0,
                v: part.length * part.diameter,
                u: part.location + 0.5 * part.length,
            });
            if let Some(fin) = &part.fin {
                if fin.count != 0 && fin.chord != 0.0 {
                    let fc = fin_coeffs(fin, cc, ce, rogers);
                    comps.push(ComponentCoeff {
                        o: 0.0,
                        p: fc.p,
                        q: fc.q,
                        r: 0.0,
                        s: fc.s,
                        t: fc.t,
                        v: 0.0,
                        u: 0.0,
                    });
                }
            }
        } else if part.kind == PartKind::Expansion {
            let front = part.diameter;
            let rear = part.aft_diameter();
            let o: f64;
            let r: f64;
            if rogers {
                let value = (rear / 2.0) * (part.length / ((rear - front) / 2.0));
                // Body length behind the expansion station (same stopped-sum rule).
                let mut behind: f64 = 0.0;
                for later in chain.iter().skip(i + 1) {
                    if later.kind == PartKind::Expansion || later.kind == PartKind::Reducer {
                        break;
                    }
                    if later.kind == PartKind::Body {
                        behind += later.length;
                    }
                }
                let mut value2 = 2.0 * ((value + behind) / value).powf(0.1);
                value2 *= (rear / 2.0).powf(2.0) / (front / 2.0).powf(2.0);
                o = (value2 - 2.0) * (PI_ENG * (front / 2.0).powf(2.0) / ce);
                r = part.location + part.length;
            } else {
                o = 2.0
                    * ((rear / cc).powf(2.0) - (front / cc).powf(2.0))
                    * (PI_ENG * (cc / 2.0).powf(2.0) / ce);
                // Barrowman frustum centroid from the front face. The engine forms
                // the ratio from its h()/b() getters (front/rear).
                r = part.location
                    + (part.length / 3.0)
                        * (1.0 + (1.0 - front / rear) / (1.0 - (front / rear).powf(2.0)));
            }
            let v = (part.length * (rear + front)) / 2.0;
            // Centroid of a frustum planform (engine weights the front face twice
            // in the first-moment arm: L*(front + 2*rear) / (3*(front + rear))).
            let u = part.location + (part.length * (front + 2.0 * rear)) / (3.0 * (front + rear));
            comps.push(ComponentCoeff {
                o,
                p: 0.0,
                q: 0.0,
                r,
                s: 0.0,
                t: 0.0,
                v,
                u,
            });
        } else if part.kind == PartKind::Reducer {
            let front = part.diameter;
            let rear = part.aft_diameter();
            let o = 2.0
                * ((rear / cc).powf(2.0) - (front / cc).powf(2.0))
                * (PI_ENG * (cc / 2.0).powf(2.0) / ce);
            let r = part.location
                + (part.length / 3.0)
                    * (1.0 + (1.0 - front / rear) / (1.0 - (front / rear).powf(2.0)));
            let v = (part.length * (rear + front)) / 2.0;
            let u = part.location + (part.length * (front + 2.0 * rear)) / (3.0 * (front + rear));
            comps.push(ComponentCoeff {
                o,
                p: 0.0,
                q: 0.0,
                r,
                s: 0.0,
                t: 0.0,
                v,
                u,
            });
            if part.fin.is_some() {
                return Err(CalibratedError::Unsupported(
                    "BoatTail fin sets are not proven against ground truth".into(),
                ));
            }
        }
    }

    Ok(ComponentValues {
        comps,
        reference: rf,
    })
}

pub fn jorgensen_cdc(mach_cf: f64, re_cf: f64) -> f64 {
    let ay = mach_cf;
    if ay <= 0.6 && re_cf >= 200000.0 {
        if ay <= 0.1 {
            return 1.2;
        }
        if ay <= 0.25 {
            return 1.2 - 0.95 * ((ay - 0.1) / 0.15);
        }
        if ay <= 0.4 {
            return 0.25;
        }
        if ay <= 0.5 {
            return 0.25 + 1.107 * ((ay - 0.4) / 0.1);
        }
        return 1.329 - 1.097 * ay + 2.307 * ay * ay;
    }
    if ay <= 0.6 && re_cf < 200000.0 {
        if ay <= 0.2 {
            return 1.2;
        }
        return 1.329 - 1.097 * ay + 2.307 * ay * ay;
    }
    if ay <= 0.8 {
        return 1.5;
    }
    if ay <= 1.6 {
        return -0.5135 * ay.powf(3.0) + 2.2825 * ay.powf(2.0) - 3.5508 * ay + 3.1381;
    }
    1.2
}

pub fn evaluate_normal_force_subsonic(
    design: &Design,
    mach: f64,
    alpha_deg: f64,
    rogers: bool,
    re: f64,
) -> Result<NormalForce, CalibratedError> {
    let cv = component_values(design, rogers)?;
    let comps = &cv.comps;
    let ce = cv.reference.ce;
    let be = cv.reference.be;
    let cd = cv.reference.cd;
    let alpha = alpha_deg * std::f64::consts::PI / 180.0;

    let cp_sum: f64 = comps.iter().fold(0.0, |acc, c| acc + c.o + c.p + c.q);
    let ci: f64 = comps
        .iter()
        .fold(0.0, |acc, c| acc + c.o * c.r + c.p * c.s + c.q * c.t);
    let m_aa = cp_sum * alpha; // potential linear CN

    let m_ag: f64;
    let aj: f64;
    let aw: f64;
    let au: f64;
    let cn_alpha04: f64;
    let cp04_in: f64;

    if !rogers {
        m_ag = m_aa;
        aj = 0.0;
        // TS assigns aw = 0.0 here but never reads it on this branch
        // (only the Rogers crossflow moment feeds cr_sum/cr4).
        aw = 0.0;
        let _ = aw;
        au = if cp_sum != 0.0 { ci / cp_sum } else { 0.0 };
        cn_alpha04 = cp_sum;
        cp04_in = au;
    } else {
        let cg: f64 = comps.iter().fold(0.0, |acc, c| acc + c.v);
        let ch: f64 = if cg != 0.0 {
            comps.iter().fold(0.0, |acc, c| acc + c.v * c.u) / cg
        } else {
            0.0
        };
        let az = 0.509 + 0.183 * (be / cd).log10();
        let ay = mach * alpha.sin();
        let a0 = re * alpha.sin();
        let ax = jorgensen_cdc(ay, a0);
        aj = az * ax * (cg / ce) * alpha.sin().powf(2.0);
        aw = ch;
        m_ag = m_aa + aj;

        if alpha == 0.0 {
            let ci0: f64 = comps
                .iter()
                .fold(0.0, |acc, c| acc + c.o * c.r + c.p * c.s + c.q * c.t);
            au = if cp_sum != 0.0 { ci0 / cp_sum } else { 0.0 };
        } else {
            let cr_sum: f64 = comps.iter().fold(0.0, |acc, c| {
                acc + c.o * alpha * c.r + c.p * alpha * c.s + c.q * alpha * c.t
            }) + aj * aw;
            au = if m_ag != 0.0 { cr_sum / m_ag } else { 0.0 };
        }

        let m_f = REF_ALPHA_RAD;
        let ay4 = mach * m_f.sin();
        let a04 = re * m_f.sin();
        let ak = az * jorgensen_cdc(ay4, a04) * (cg / ce) * m_f.sin().powf(2.0);
        let ah = cp_sum * m_f + ak;
        cn_alpha04 = ah / m_f;

        let cr4: f64 = comps.iter().fold(0.0, |acc, c| {
            acc + c.o * m_f * c.r + c.p * m_f * c.s + c.q * m_f * c.t
        }) + ak * aw;
        cp04_in = if ah != 0.0 { cr4 / ah } else { 0.0 };
    }

    let cn_potential = m_aa;
    let cn_viscous = aj;
    let cn = m_ag;
    let cl = cn * alpha.sin();
    let cp_in = au;

    Ok(NormalForce {
        cl,
        cn,
        cn_potential,
        cn_viscous,
        cn_alpha04,
        cp_in,
        cp04_in,
    })
}
