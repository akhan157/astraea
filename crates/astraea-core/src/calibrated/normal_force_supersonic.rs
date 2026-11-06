//! calibrated II supersonic normal-force / CP pass (Mach >= 1.05).
//!
//! Port of `src/aero/calibrated/normalForceSupersonic.ts`: nose CNa/CP tables,
//! supersonic fin derived geometry, the fin CNa/CP ladders, expansion/reducer
//! slots and stations, the alternate modified-Newtonian fin-load arbitration,
//! component assembly, and the aggregation into [`NormalForce`]. Floating-point
//! operation order and every engine constant mirror the TS oracle exactly.
//!
//! Clippy allowances below are load-bearing, not style: `PI_ENG = 3.14159`
//! must stay the truncated literal, and branch/if float comparisons
//! must keep TS source order.
#![allow(clippy::approx_constant, clippy::manual_range_contains)]

use super::design::{Airfoil, Design, Fin, NoseShape, PartKind};
use super::geometry::sweep_thickness_factor;
use super::normal_force_subsonic::{jorgensen_cdc, power_law_nose_parameters, NormalForce};
use super::CalibratedError;

const PI_ENG: f64 = 3.14159;
const REF_ALPHA_RAD: f64 = 0.0698131111111111;

/// Per-component supersonic slots (mirrors the subsonic ComponentCoeff).
/// TS `SupersonicComponents`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SupersonicComponents {
    /// Linear CNa sum cp = sum(o + p + q).
    pub cp_sum: f64,
    /// First-moment sum ci = sum(o*r + p*s + q*t).
    pub ci_sum: f64,
    /// Crossflow planform sum cg and first moment (for aw = ch).
    pub cg: f64,
    pub ch: f64,
}

/// Following-body length behind the nose (stopped sum, shared with subsonic).
pub fn supersonic_nose_aft_length(design: &Design) -> f64 {
    let mut aft = 0.0;
    for part in design.chain.iter().skip(1) {
        if part.kind == PartKind::Expansion || part.kind == PartKind::Reducer {
            break;
        }
        if part.kind == PartKind::Body {
            aft += part.length;
        }
    }
    aft
}

fn conical_branch(u: f64, v: f64) -> f64 {
    if u <= 0.15 {
        return 2.0;
    }
    if u <= 1.0 {
        let corr = 0.3 * v - 0.0283 * v * v + 0.0008 * v * v * v;
        return (2.0 - 0.147 * (u - 0.15)) + corr * (1.323 * (u - 0.15));
    }
    // Reciprocal bands in w = (L/D)/A2.
    let w = 1.0 / u;
    let corr = 0.3 * v - 0.0283 * v * v + 0.0008 * v * v * v;
    if w <= 0.35 {
        return 2.0 + corr * (3.443 * w);
    }
    if w <= 0.7 {
        return 2.0 + corr * (-1.117 + 9.733 * w - 9.312 * w * w + 1.305 * w * w * w);
    }
    if w < 1.0 {
        return (2.0 - 0.417 * (w - 0.7)) + corr * (1.58 - 1.518 * (w - 0.7));
    }
    // Falls through with the previous value intact for w >= 1.
    (2.0 - 0.417 * (w - 0.7)) + corr * (1.58 - 1.518 * (w - 0.7))
}

fn ogive_branch(u: f64, v: f64) -> f64 {
    let corr = 0.21 * v - 0.0111 * v * v;
    if u <= 0.5 {
        return 1.99 + 1.61 * u - 0.985 * u * u;
    }
    if u <= 0.7 {
        let base = 1.99 + 1.61 * u - 0.985 * u * u;
        return base + corr * (1.167 * (u - 0.5));
    }
    if u <= 1.0 {
        return (2.635 - 0.704 * (u - 0.7)) + corr * (0.233 + 2.3 * (u - 0.7));
    }
    let w = 1.0 / u;
    (1.735 + 0.689 * w) + corr * (2.804 * w - 1.882 * w * w)
}

fn von_karman_branch(u: f64, v: f64) -> f64 {
    let corr = 0.227 * v - 0.0128 * v * v;
    if u <= 0.5 {
        return 1.91 + 1.513 * u - 1.24 * u * u;
    }
    if u <= 0.8 {
        let base = 1.91 + 1.513 * u - 1.24 * u * u;
        return base + corr * (2.142 * (u - 0.5));
    }
    if u <= 1.0 {
        return (2.328 - 0.358 * (u - 0.8)) + corr * (0.643 + 2.4 * (u - 0.8));
    }
    let w = 1.0 / u;
    (1.757 + 0.5 * w) + corr * (-0.247 + 2.593 * w - 1.223 * w * w)
}

/// Unscaled nose supersonic CNa value for a supported nose shape. Original
/// i.cs:1889-1922 places Parabolic/Elliptical in the Group A ogive branch.
/// Power Law uses the Group A ogive CNa formula; its exponent blend is an
/// identity in the engine source, but the CDX1 exponent remains required.
pub fn nose_supersonic_cna_value(
    shape: NoseShape,
    u: f64,
    v: f64,
    power_law_exponent: Option<f64>,
) -> Result<f64, CalibratedError> {
    match shape {
        NoseShape::TangentOgive => Ok(ogive_branch(u, v)),
        NoseShape::VonKarmanOgive | NoseShape::LvHaack => Ok(von_karman_branch(u, v)),
        NoseShape::Conical => Ok(conical_branch(u, v)),
        NoseShape::Parabolic | NoseShape::Elliptical => Ok(ogive_branch(u, v)),
        NoseShape::PowerLaw => {
            let exponent = power_law_exponent.ok_or_else(|| {
                CalibratedError::Unsupported(
                    "power-law nose CNa requires its exponent".into(),
                )
            })?;
            let _ = power_law_nose_parameters(exponent)?;
            Ok(ogive_branch(u, v))
        }
    }
}

fn ogive_cp_fraction(u: f64, v3: f64) -> f64 {
    let corr = 0.1236 * v3 - 0.00232 * v3 * v3;
    if u <= 0.5 {
        return 0.465 + 0.215 * u - 0.145 * u * u;
    }
    if u <= 0.7 {
        let base = 0.465 + 0.215 * u - 0.145 * u * u;
        return base + corr * (0.698 * (u - 0.5));
    }
    if u <= 1.0 {
        return (0.545 + 0.0052 * (u - 0.7)) + corr * (0.14 + 0.734 * (u - 0.7));
    }
    let w = 1.0 / u;
    (0.464 + 0.082 * w) + corr * (1.878 * w - 2.305 * w * w + 0.787 * w * w * w)
}

fn von_karman_cp_fraction(u: f64, v3: f64) -> f64 {
    let corr = 0.1242 * v3 - 0.00235 * v3 * v3;
    if u <= 0.5 {
        return 0.507 + 0.097 * u - 0.059 * u * u;
    }
    if u <= 0.8 {
        let base = 0.507 + 0.097 * u - 0.059 * u * u;
        return base + corr * (0.75 * (u - 0.5));
    }
    if u <= 1.0 {
        return 0.547 + corr * (0.226 + 0.775 * (u - 0.8));
    }
    let w = 1.0 / u;
    if w <= 0.45 {
        return 0.52 + corr * (0.09 + 0.935 * w - 0.619 * w * w);
    }
    // Falls through with the previous value intact for w >= 1.
    (0.52 + 0.049 * (w - 0.45)) + corr * (0.11 + 0.89 * w - 0.619 * w * w)
}

fn conical_cp_fraction(u: f64, v3: f64) -> f64 {
    let corr = 0.209 * v3 - 0.0109 * v3 * v3;
    if u <= 0.5 {
        return 0.666;
    }
    if u <= 1.0 {
        return 0.666 + corr * (0.468 * (u - 0.5));
    }
    let w = 1.0 / u;
    if w <= 0.25 {
        return (0.695 - 0.058 * w) + corr * (0.305 + 0.795 * w);
    }
    if w <= 0.5 {
        return (0.695 - 0.058 * w) + corr * (0.24 + 1.429 * w - 1.503 * w * w);
    }
    if w <= 0.7 {
        return 0.666 + corr * (0.269 + 1.371 * w - 1.503 * w * w);
    }
    // Falls through for w >= 1 with the w<1 value intact.
    0.666 + corr * (1.1 - 0.862 * w)
}

/// Nose supersonic CP fraction of nose length.
pub fn nose_supersonic_cp_fraction(shape: NoseShape, u: f64, v3: f64) -> Result<f64, CalibratedError> {
    match shape {
        NoseShape::VonKarmanOgive | NoseShape::LvHaack => Ok(von_karman_cp_fraction(u, v3)),
        NoseShape::Conical => Ok(conical_cp_fraction(u, v3)),
        // In i.cs:2097-2106 Tangent Ogive skips the switch; the
        // Parabolic/Elliptical `break` exits only the switch. These shapes
        // fall through to the shared ogive table at i.cs:2198-2220.
        NoseShape::TangentOgive
        | NoseShape::Parabolic
        | NoseShape::Elliptical
        | NoseShape::PowerLaw => Ok(ogive_cp_fraction(u, v3)),
    }
}

/// Round to float32 (the engine stores the derived block as floats).
fn f32x(x: f64) -> f64 {
    (x as f32) as f64
}

/// TS `SupersonicFinInputs`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SupersonicFinInputs {
    /// Adjusted chord ah (CP arm length base).
    pub ah: f64,
    /// Tip-chord-derived float ai (ao numerator).
    pub ai: f64,
    /// Adjusted sweep aj.
    pub aj: f64,
    /// Span field ak (interference ratio input).
    pub ak: f64,
    /// Origin field al (CP arm base).
    pub al: f64,
    /// Effective planform am.
    pub am: f64,
    /// Aspect an (fineness product input).
    pub an: f64,
    /// Newtonian thickness ratio ao = min(ai/ah, 1).
    pub ao: f64,
    /// Mean station ap = am/ak.
    pub ap: f64,
    /// Sweep angle m (rad, unadjusted) and corrected sweep n (rad).
    pub m: f64,
    pub n: f64,
    /// Fineness product mc = an*tan(m).
    pub mc: f64,
    /// Shielding height ag (float32) and caliber length af.
    pub ag: f64,
    pub af: f64,
    /// Local body diameter ai_d (volume-averaged equivalent on overhang).
    pub ai_d: f64,
    /// Derived exposed mean chord ae = k / span and source adjusted stations.
    pub mean_chord: f64,
    pub adjusted_sweep: f64,
    pub adjusted_span: f64,
    pub ad: f64,
}

/// Derive the supersonic fin inputs from the CDX1 fin plus carrier context.
/// nose_len/nose_dia are the nose cone length/diameter; fin_le is the
/// nose-referenced fin leading edge; fin_dia is the local parent diameter and
/// fin_rear the tapered diameter at the trailing station (equal except when
/// the root overhangs onto a following boattail, e.g. ARCAS).
/// loop_ai_d is the engine loop volume-average diameter over the root span
/// ([W5n] §4: fires iff a part origin falls strictly inside (LE, LE+Cr));
/// when supplied it replaces the parent/overhang shortcut for ai_d.
pub fn supersonic_fin_inputs(
    fin: &Fin,
    nose_len: f64,
    nose_dia: f64,
    fin_le: f64,
    fin_dia: f64,
    fin_rear: f64,
    loop_ai_d: Option<f64>,
) -> SupersonicFinInputs {
    let b = fin.chord;
    let c = fin.tip;
    let d = fin.sweep;
    let e = fin.span;
    let af = (fin_le - nose_len) / nose_dia;
    let ag = if af > 10.0 {
        f32x(0.017453277777777776_f64.tan() * (10.0 * nose_dia))
    } else {
        f32x(0.017453277777777776_f64.tan() * (fin_le - nose_len))
    };
    // Exposed planform k (equal-diameter branch).
    let num = d + c - b;
    let plan_k = (d / 2.0 + num / 2.0 + (c - num)) * e;
    // Overhang taper branch: volume-averaged equivalent diameter over the root chord.
    let overhang = (b - fin.location).max(0.0);
    let mut ai_d = loop_ai_d.unwrap_or(fin_dia);
    if loop_ai_d.is_none() && overhang > 0.0 && fin_rear != fin_dia {
        let parent_len = b - overhang;
        let r1 = fin_dia / 2.0;
        let r2 = fin_rear / 2.0;
        let vol = std::f64::consts::PI * r1 * r1 * parent_len
            + (std::f64::consts::PI / 3.0) * (r1 * r1 + r1 * r2 + r2 * r2) * overhang;
        ai_d = 2.0 * (vol / (std::f64::consts::PI * b)).sqrt();
    }
    // Decimal planform block: inputs on the equal branch; the taper-adjusted
    // branch for overhanging roots recomputes from the local front diameter
    // and the volume-averaged equivalent diameter.
    let ae: f64;
    let af_d: f64;
    let ag_d: f64;
    let ah_d: f64;
    let ad: f64;
    if overhang > 0.0 && ai_d != fin_dia {
        let num_raw = d + c - b;
        let num2 = if d != 0.0 {
            ((fin_dia - ai_d) / 2.0) / (e / d)
        } else {
            0.0
        };
        let num3 = if num_raw != 0.0 {
            ((fin_dia - ai_d) / 2.0) / (e / num_raw)
        } else {
            0.0
        };
        ae = num2 + b - num3;
        af_d = c;
        ag_d = num2 + d;
        ah_d = e + (fin_dia - ai_d) / 2.0;
        ad = fin_le - num2;
    } else {
        ae = b;
        af_d = c;
        ag_d = d;
        ah_d = e;
        ad = fin_le;
    }
    let num4 = f32x(ag_d + af_d - ae);
    let num5 = if ag_d != 0.0 {
        ag / f32x(ah_d / ag_d)
    } else {
        0.0
    };
    let num6 = if num4 != 0.0 {
        ag / (f32x(ah_d) / num4)
    } else {
        0.0
    };
    // [W14 correction] (docs/re/engine/supersonic-frustum-cp.md §8 item 3):
    // the adjusted chord reads the (possibly taper-adjusted) decimal ae,
    // not the raw chord b. Identical on the equal branch (ae == b); on
    // overhanging roots (ARCAS) the chord form under-read ah by ae-b and
    // biased every ao-dependent ladder/CP term.
    let ah = f32x(ae) - num5 + num6;
    let aiv = f32x(af_d);
    let aj = f32x(ag_d) - num5;
    let ak = f32x(ah_d) - ag;
    let al = f32x(ad) + num5;
    let am = (aj / 2.0 + (num4 - num6) / 2.0 + (aiv - (num4 - num6))) * ak;
    let an = (2.0 * ak) * (2.0 * ak) / (2.0 * am);
    let ao = if ah != 0.0 { (aiv / ah).min(1.0) } else { 0.0 };
    let ap = am / ak;
    // Sweep angles: m = atan(d/e) (tan(0.01) guard when m == 0); the corrected
    // sweep adds the bevel slope d2 = FX1/((b+c)/2) for the five wedge-family
    // sections, 0.25 for Subsonic NACA, 0 otherwise.
    let m = if d == 0.0 && e != 0.0 {
        0.01_f64.tan()
    } else {
        (d / e).atan()
    };
    let d2 = sweep_thickness_factor(fin.airfoil, fin.fx1, b, c);
    let n = ((d + d2 * c - d2 * b) / e).atan();
    let mc = an * m.tan();
    SupersonicFinInputs {
        ah,
        ai: aiv,
        aj,
        ak,
        al,
        am,
        an,
        ao,
        ap,
        m,
        n,
        mc,
        ag,
        af,
        ai_d,
        mean_chord: if e != 0.0 { plan_k / e } else { 0.0 },
        adjusted_sweep: ag_d,
        adjusted_span: ah_d,
        ad,
    }
}

/// Loop volume-average diameter over the fin root span [LE, LE + Cr].
/// Returns None when the taper loop does not fire (no body-part origin
/// strictly inside the span); otherwise the volume-averaged ai.
/// [W14 correction] (docs/re/engine/supersonic-frustum-cp.md §8 item 2):
/// callers must gate on the engine's h()==b() shortcut — the loop runs only
/// for overhanging tapered roots (parent != rear). Cylindrical FinCan roots
/// (torrent) keep ai = parent even when a part origin falls inside the span.
pub fn taper_loop_ai(design: &Design, fin_le: f64, chord: f64) -> Option<f64> {
    let span_lo = fin_le;
    let span_hi = fin_le + chord;
    let mut fires = false;
    for part in design.chain.iter().skip(1) {
        if part.kind != PartKind::Body
            && part.kind != PartKind::Expansion
            && part.kind != PartKind::Reducer
        {
            continue;
        }
        if part.location > span_lo && part.location < span_hi {
            fires = true;
            break;
        }
    }
    if !fires {
        return None;
    }
    let mut vol = 0.0;
    for part in design.chain.iter().skip(1) {
        if part.kind != PartKind::Body
            && part.kind != PartKind::Expansion
            && part.kind != PartKind::Reducer
        {
            continue;
        }
        let front = part.diameter;
        let rear = part.aft_diameter();
        let part_lo = part.location;
        let part_hi = part.location + part.length;
        let ov_lo = span_lo.max(part_lo);
        let ov_hi = span_hi.min(part_hi);
        if ov_hi <= ov_lo {
            continue;
        }
        if rear == front {
            let r = front / 2.0;
            vol += std::f64::consts::PI * r * r * (ov_hi - ov_lo);
        } else {
            let t0 = (ov_lo - part_lo) / part.length;
            let t1 = (ov_hi - part_lo) / part.length;
            let r0 = (front + (rear - front) * t0) / 2.0;
            let r1 = (front + (rear - front) * t1) / 2.0;
            vol += (std::f64::consts::PI / 3.0) * (r0 * r0 + r0 * r1 + r1 * r1) * (ov_hi - ov_lo);
        }
    }
    Some(2.0 * (vol / (std::f64::consts::PI * chord)).sqrt())
}

/// num2 <= 1 branch: m_c-banded cubics in num2, divided by A1 by the caller.
pub fn fin_cna_cubic_branch(mc: f64, num2: f64) -> f64 {
    if mc <= 0.25 {
        return 4.025 - 10.145 * num2 + 9.709 * num2 * num2 - 3.147 * num2 * num2 * num2;
    }
    if mc <= 0.5 {
        return 4.019 - 2.855 * num2 - 3.73 * num2 * num2 + 3.498 * num2 * num2 * num2;
    }
    if mc <= 1.0 {
        return 3.997 - 0.721 * num2 - 2.793 * num2 * num2 + 1.468 * num2 * num2 * num2;
    }
    if mc <= 2.0 {
        return 3.991 - 0.375 * num2 - 0.193 * num2 * num2 - 0.409 * num2 * num2 * num2;
    }
    if mc <= 3.0 {
        return 3.992 - 0.227 * num2 + 1.131 * num2 * num2 - 1.361 * num2 * num2 * num2;
    }
    if mc <= 4.0 {
        return 4.007 - 0.754 * num2 + 3.099 * num2 * num2 - 2.41 * num2 * num2 * num2;
    }
    if mc <= 5.0 {
        return 4.007 - 0.595 * num2 + 3.111 * num2 * num2 - 2.185 * num2 * num2 * num2;
    }
    4.017 - 0.95 * num2 + 4.661 * num2 * num2 - 3.241 * num2 * num2 * num2
}

fn cubic_band_lo(mc: f64) -> Option<f64> {
    if mc <= 0.25 {
        return None;
    }
    if mc <= 0.5 {
        return Some(0.25);
    }
    if mc <= 1.0 {
        return Some(0.5);
    }
    if mc <= 2.0 {
        return Some(1.0);
    }
    if mc <= 3.0 {
        return Some(2.0);
    }
    if mc <= 4.0 {
        return Some(3.0);
    }
    if mc <= 5.0 {
        return Some(4.0);
    }
    Some(5.0)
}

/// Cubic band-edge interpolation across each m_c band (verified on ezi65-1).
/// The TS oracle holds three lookup tables keyed by band lower edge
/// (top/span/mid maps); the match arms below encode the same table values.
pub fn fin_cna_cubic_value(mc: f64, num2: f64) -> f64 {
    let lo = match cubic_band_lo(mc) {
        None => return fin_cna_cubic_branch(mc, num2),
        Some(lo) => lo,
    };
    let (top, span, mid_lo) = if lo == 0.25 {
        (0.5, 0.25, 0.1)
    } else if lo == 0.5 {
        (1.0, 0.5, 0.3)
    } else if lo == 1.0 {
        (2.0, 1.0, 0.7)
    } else if lo == 2.0 {
        (3.0, 1.0, 1.5)
    } else if lo == 3.0 {
        (4.0, 1.0, 2.5)
    } else if lo == 4.0 {
        (5.0, 1.0, 3.5)
    } else {
        // lo == 5.0 (cubic_band_lo only returns the table keys above).
        (6.0, 1.0, 4.5)
    };
    let mid_top = if top == 0.5 {
        0.3
    } else if top == 1.0 {
        0.7
    } else if top == 2.0 {
        1.5
    } else if top == 3.0 {
        2.5
    } else if top == 4.0 {
        3.5
    } else if top == 5.0 {
        4.5
    } else {
        // top == 6.0 (lo == 5.0 band): TS midMap[6] is undefined, and every
        // `mc <= band` comparison against undefined is false, so the branch
        // helper falls through to its last cubic. NaN reproduces that here.
        f64::NAN
    };
    let w = (mc - lo) / span;
    let b = fin_cna_cubic_branch(mid_lo, num2);
    let t = fin_cna_cubic_branch(mid_top, num2);
    b + (t - b) * w
}

/// Fin-count multiplier shared by the subsonic and supersonic CNa splits.
pub fn fin_count_multiplier(count: u32) -> Result<f64, CalibratedError> {
    match count {
        3 => Ok(0.866),
        4 => Ok(1.0),
        5 => Ok(1.5388),
        6 => Ok(1.7321),
        7 => Ok(2.1906),
        8 => Ok(2.4142),
        _ => Err(CalibratedError::Unsupported(format!(
            "supersonic fin count {count}"
        ))),
    }
}

/// Interference split a8/b3 from r = (ai/2)/((ai/2)+ak).
/// TS `interferenceSplit` return.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct InterferenceSplit {
    pub a8: f64,
    pub b3: f64,
    pub r: f64,
}

pub fn interference_split(ai: f64, ak: f64) -> InterferenceSplit {
    let r = (ai / 2.0) / ((ai / 2.0) + ak);
    let a8 = 1.0 + 0.803 * r + 0.201 * r * r;
    let b3 = (1.0 + r) * (1.0 + r) - a8;
    InterferenceSplit { a8, b3, r }
}

/// ao-dependent ladder top for the (1,2] band and the capped bands above.
pub fn fin_cna_top(ao: f64, num: f64) -> f64 {
    let d6 = if 0.4 < num && num <= 1.0 {
        3.75 - 0.736 * ((num - 0.4) / 0.6)
    } else {
        3.137 + 0.613 * (num / 0.4)
    };
    if ao < 0.2 {
        return 3.014 + (d6 - 3.014) * (ao / 0.2);
    }
    if ao <= 0.5 {
        return d6;
    }
    if ao <= 1.0 {
        return d6 + (3.014 - d6) * ((ao - 0.5) / 0.5);
    }
    3.014
}

fn cap_value(anchor: f64, bf: f64, num: f64) -> f64 {
    if num > bf {
        anchor + (1.0 - num) * 0.445
    } else {
        anchor + (1.0 - bf) * 0.445
    }
}

/// num2 > 1 branch: the m_c ladder divided by tan(m) by the caller.
pub fn fin_cna_ladder_value(mc: f64, ao: f64, num: f64) -> f64 {
    if mc <= 0.25 {
        return 0.442;
    }
    if mc <= 0.5 {
        return 0.442 + 0.49 * ((mc - 0.25) / 0.25);
    }
    if mc <= 1.0 {
        return 0.932 + 1.019 * ((mc - 0.5) / 0.5);
    }
    let top = fin_cna_top(ao, num);
    if mc <= 2.0 {
        return 1.951 + (top - 1.951) * (mc - 1.0);
    }
    if mc <= 3.0 {
        let bf = 0.017 + 0.996 * ao;
        return top + (cap_value(3.535, bf, num) - top) * (mc - 2.0);
    }
    if mc <= 4.0 {
        let bf_l = 0.017 + 0.996 * ao;
        let bf_h = 0.059 + 1.49 * ao - 0.552 * ao * ao;
        return cap_value(3.535, bf_l, num)
            + (cap_value(3.942, bf_h, num) - cap_value(3.535, bf_l, num)) * (mc - 3.0);
    }
    if mc <= 5.0 {
        let bf_l = 0.059 + 1.49 * ao - 0.552 * ao * ao;
        let bf_h = 0.21 + 1.348 * ao - 0.561 * ao * ao;
        return cap_value(3.942, bf_l, num)
            + (cap_value(4.338, bf_h, num) - cap_value(3.942, bf_l, num)) * (mc - 4.0);
    }
    if mc <= 6.0 {
        let bf_l = 0.21 + 1.348 * ao - 0.561 * ao * ao;
        let bf_h = 0.353 + 1.049 * ao - 0.403 * ao * ao;
        return cap_value(4.338, bf_l, num)
            + (cap_value(4.487, bf_h, num) - cap_value(3.942, bf_l, num)) * (mc - 5.0);
    }
    let bf = 0.353 + 1.049 * ao - 0.403 * ao * ao;
    cap_value(4.487, bf, num)
}

struct CpBand {
    edge: f64,
    a: f64,
    b: f64,
}

const NUM7_BANDS: [CpBand; 5] = [
    CpBand {
        edge: 0.0,
        a: 0.1635,
        b: 0.0109,
    },
    CpBand {
        edge: 0.25,
        a: 0.2049,
        b: 0.0171,
    },
    CpBand {
        edge: 0.33,
        a: 0.2014,
        b: 0.0637,
    },
    CpBand {
        edge: 0.5,
        a: 0.2286,
        b: 0.0388,
    },
    CpBand {
        edge: 1.0,
        a: 0.2659,
        b: 0.1148,
    },
];

const NUM14_BANDS: [CpBand; 5] = [
    CpBand {
        edge: 0.0,
        a: 0.0832,
        b: 0.3256,
    },
    CpBand {
        edge: 0.25,
        a: 0.1246,
        b: 0.338,
    },
    CpBand {
        edge: 0.33,
        a: 0.1366,
        b: 0.3588,
    },
    CpBand {
        edge: 0.5,
        a: 0.1651,
        b: 0.38,
    },
    CpBand {
        edge: 1.0,
        a: 0.2476,
        b: 0.4945,
    },
];

/// ao ladder with cross-fade over the exact spans starting at 0.
fn ao_ladder_value(ao: f64, bands: &[CpBand; 5], mc: f64) -> f64 {
    // TS maps the bands first (vals[i] = a*mc + b), then walks the edges.
    // Fixed-size array: no allocation on this hot path.
    let vals = [
        bands[0].a * mc + bands[0].b,
        bands[1].a * mc + bands[1].b,
        bands[2].a * mc + bands[2].b,
        bands[3].a * mc + bands[3].b,
        bands[4].a * mc + bands[4].b,
    ];
    if ao <= 0.0 {
        return vals[0];
    }
    let mut i = 1;
    while i < bands.len() {
        if ao <= bands[i].edge {
            let span = bands[i].edge - bands[i - 1].edge;
            let t = (ao - bands[i - 1].edge) / span;
            return vals[i - 1] + (vals[i] - vals[i - 1]) * t;
        }
        i += 1;
    }
    vals[vals.len() - 1]
}

/// num7 ladder (verified first rung on Raven; higher rungs per fin_cp.json).
pub fn fin_cp_num7(ao: f64, mc: f64) -> f64 {
    ao_ladder_value(ao, &NUM7_BANDS, mc)
}

/// num14 ladder (verified first rung on Raven; higher rungs per fin_cp.json).
pub fn fin_cp_num14(ao: f64, mc: f64) -> f64 {
    ao_ladder_value(ao, &NUM14_BANDS, mc)
}

/// Planform CP fraction blend. Branches on num2 = A1/tan(m) <= 1 (same num2
/// as the CNa routine): weights by num2, else by 1 + (1 - num3) with
/// num3 = tan(m)/A1. Verified on Raven to ~8e-8.
pub fn fin_cp_fraction(num7: f64, num14: f64, num2: f64, num3: f64) -> f64 {
    if num2 <= 1.0 {
        num7 + ((num14 - num7) / 2.0) * num2
    } else {
        num7 + ((num14 - num7) / 2.0) * (1.0 + (1.0 - num3))
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct ModifiedNewtonianFinLoad {
    coefficient: f64,
    station: f64,
}

/// Source i.cs:3319-3494 alternate modified-Newtonian fin load (`ap`,`aq`).
/// The caller applies the engine's `ap*aq > p*s + q*t && M >= aa` arbitration.
fn modified_newtonian_fin_load(
    fin: &Fin,
    inputs: &SupersonicFinInputs,
    mach: f64,
    ce: f64,
    count_multiplier: f64,
) -> Option<ModifiedNewtonianFinLoad> {
    if !(mach > 0.0) || !(ce > 0.0) {
        return None;
    }

    let m2 = mach * mach;
    let mut g = (2.4 / (2.8 * m2 - 1.4 + 1.0)).powf(2.5000000000000004) as f32;
    g = ((g as f64) * (1.2 * m2).powf(3.5000000000000004)) as f32;
    let cp = (2.0 / (1.4 * m2) * ((g - 1.0) as f64)) as f32;
    let alpha4 = 0.0698131111111111;
    let alpha4_sin: f64 = 0.069813;
    let equal_or_expanding = fin.parent_diameter >= fin.rear_diameter;

    let wedge_family = matches!(
        fin.airfoil,
        Airfoil::DoubleWedge
            | Airfoil::Hexagonal
            | Airfoil::SingleWedge
            | Airfoil::HexagonalBluntBase
            | Airfoil::Biconvex
    );

    if wedge_family {
        let mean_chord = inputs.mean_chord;
        let (s, t) = match fin.airfoil {
            Airfoil::DoubleWedge => {
                let mut s = fin.fx1;
                if s == mean_chord {
                    s = mean_chord - 0.01;
                }
                if s == 0.0 {
                    s = 0.01;
                }
                (s, 0.0)
            }
            Airfoil::Hexagonal => {
                let s = if fin.fx1 != 0.0 { fin.fx1 } else { 0.01 };
                let u = if fin.fx3 != 0.0 { fin.fx3 } else { 0.01 };
                (s, mean_chord - s - u)
            }
            Airfoil::SingleWedge => (mean_chord, 0.0),
            Airfoil::HexagonalBluntBase => {
                let s = if fin.fx1 != 0.0 { fin.fx1 } else { 0.01 };
                (s, mean_chord - s)
            }
            Airfoil::Biconvex => (mean_chord / 2.0, 0.0),
            _ => return None,
        };
        if s == 0.0 {
            return None;
        }
        let theta = (0.5 * fin.thickness / s).atan();
        let num3 = ((theta * 57.295827908797776 + 4.0) * 0.017453277777777776) as f32;
        let num4 = ((theta * 57.295827908797776 - 4.0) * 0.017453277777777776) as f32;
        let cp_twice = ((cp / 2.0_f32) * 2.0_f32) as f64;
        let mut alpha_load = if (theta as f32) <= 0.06981311_f32 {
            cp_twice * (num3 as f64).sin().powi(2) * theta.cos() / alpha4
        } else {
            let top = cp_twice * (num3 as f64).sin().powi(2) * theta.cos();
            let bottom = cp_twice * (num4 as f64).sin().powi(2) * theta.cos();
            (top - bottom) / alpha4
        };
        let mut fixed_load = cp_twice * alpha4_sin.sin().powi(2) / alpha4;
        let span = if equal_or_expanding {
            fin.span
        } else {
            inputs.adjusted_span
        };
        let area_factor = (2.0 * span) / ce * count_multiplier;
        alpha_load *= s * area_factor;
        fixed_load *= t * area_factor;

        let sweep = if equal_or_expanding {
            fin.sweep
        } else {
            inputs.adjusted_sweep
        };
        let d3 = inputs.ad + sweep / 2.0 + s / 2.0;
        let d4 = inputs.ad + sweep / 2.0 + s + t / 2.0;
        let coefficient = alpha_load + fixed_load;
        if coefficient == 0.0 {
            return None;
        }
        return Some(ModifiedNewtonianFinLoad {
            coefficient,
            station: (alpha_load * d3 + fixed_load * d4) / coefficient,
        });
    }

    // Rounded, Square, and Subsonic NACA use the exposed/effective planform
    // 4-degree strip term from the non-wedge source branch.
    let mut fixed_load = ((cp / 2.0_f32) * 2.0_f32) as f64 * alpha4_sin.sin().powi(2) / alpha4;
    let planform = if equal_or_expanding {
        inputs.mean_chord * fin.span
    } else {
        inputs.am
    };
    fixed_load *= (2.0 * planform / ce) * count_multiplier;
    if fixed_load == 0.0 {
        return None;
    }
    let sweep = if equal_or_expanding {
        fin.sweep
    } else {
        inputs.adjusted_sweep
    };
    let station = inputs.ad + sweep / 2.0 + inputs.mean_chord / 2.0;
    Some(ModifiedNewtonianFinLoad {
        coefficient: fixed_load,
        station,
    })
}

/// Conical-ladder evaluation shared by the nose and the expansion-o.
fn cone_eval(u: f64, v3: f64) -> f64 {
    let c = 0.3 * v3 - 0.0283 * v3 * v3 + 0.0008 * v3 * v3 * v3;
    if u <= 0.15 {
        return 2.0;
    }
    if u <= 1.0 {
        return (2.0 - 0.147 * (u - 0.15)) + c * (1.323 * (u - 0.15));
    }
    let w = 1.0 / u;
    if w <= 0.35 {
        return 2.0 + c * (3.443 * w);
    }
    if w <= 0.7 {
        return 2.0 + c * (-1.117 + 9.733 * w - 9.312 * w * w + 1.305 * w * w * w);
    }
    (2.0 - 0.417 * (w - 0.7)) + c * (1.58 - 1.518 * (w - 0.7))
}

/// Expansion supersonic CNa slot o (barrowman conical-difference ladder).
/// [W14 correction] (docs/re/engine/supersonic-frustum-cp.md §8 item 1):
/// the two cone inputs share one divisor (L/((Dr-Df)/2))/2 — the (b/2)/b
/// and (h/2)/h factors both cancel to /2, so u1 == u2 always.
pub fn expansion_supersonic_o(
    length: f64,
    front_dia: f64,
    rear_dia: f64,
    mach: f64,
    follower: f64,
    ce: f64,
) -> f64 {
    let a2 = (mach * mach - 1.0).sqrt();
    let eff = (length / ((rear_dia - front_dia) / 2.0)) / 2.0;
    let u = a2 / eff;
    let v3a = (follower / rear_dia).min(10.0);
    let v1 = cone_eval(u, v3a);
    let v2 = cone_eval(u, 0.0);
    (v1 * (rear_dia / front_dia).powf(2.0) - v2) * (PI_ENG * (front_dia / 2.0).powf(2.0) / ce)
}

/// Expansion supersonic CP station: the follower origin org + L.
pub fn expansion_supersonic_station(origin: f64, length: f64) -> f64 {
    origin + length
}

/// Reducer/boattail supersonic CNa slot o (negative suction for boattails).
pub fn reducer_supersonic_o(length: f64, front_dia: f64, rear_dia: f64, mach: f64, ce: f64) -> f64 {
    let a2 = (mach * mach - 1.0).sqrt();
    let n = (length / front_dia) / a2;
    let q = rear_dia / front_dia;
    let cv = if n >= 2.1491 {
        -2.0 * (1.0 - q * q)
    } else {
        -(0.0084969 + 2.0498 * n - 0.68455 * n * n + 0.075355 * n * n * n) * (1.0 - q * q)
    };
    cv * (PI_ENG * (front_dia / 2.0).powf(2.0) / ce)
}

/// Reducer/boattail supersonic CP station (origin + 0.55*L).
pub fn reducer_supersonic_station(origin: f64, length: f64) -> f64 {
    origin + 0.55 * length
}

/// True when the design carries any expansion/reducer (fin-can/boattail).
pub fn has_frustum_carrier(design: &Design) -> bool {
    design
        .chain
        .iter()
        .any(|part| part.kind == PartKind::Expansion || part.kind == PartKind::Reducer)
}

/// Sweep angles m (unadjusted) and n (bevel-corrected) for a fin.
/// TS `finSweepAngles` return.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FinSweepAngles {
    pub m: f64,
    pub n: f64,
}

pub fn fin_sweep_angles(fin: &Fin) -> FinSweepAngles {
    let m = if fin.sweep == 0.0 && fin.span != 0.0 {
        0.01_f64.tan()
    } else {
        (fin.sweep / fin.span).atan()
    };
    let d2 = sweep_thickness_factor(fin.airfoil, fin.fx1, fin.chord, fin.tip);
    let n = ((fin.sweep + d2 * fin.tip - d2 * fin.chord) / fin.span).atan();
    FinSweepAngles { m, n }
}

// ARCAS M20/M25 ([W15]): the fin loads at the carrier's fin station leave the
// num2 cubic. The alternate modified-Newtonian load (i.cs:3327-3494) wins the
// engine's arbitration (i.cs:4080-4089: p = ap, s = aq, q = t = 0 when
// ap*aq > p*s + q*t and Mach >= aa = sec(m), i.cs:2701-2708). Both loads in ap
// are already scaled by their planform factors (i.cs:3360-3434) and aq weights
// those scaled loads (i.cs:3491-3493), giving aq ~ 38.70: ap*aq ~ 23.78 beats
// the cubic (~21.95 at M20, ~17.58 at M25) but loses at M15 (~29.4, the corpus
// row stays cubic-exact). All 72 ARCAS M20/M25 rows reproduce at the 2e-6 tier.
fn component_sums(design: &Design, mach: f64) -> Result<SupersonicComponents, CalibratedError> {
    let chain = &design.chain;
    let nose_part = chain
        .first()
        .ok_or_else(|| CalibratedError::Design("design chain is empty (nose part required)".into()))?;
    let l = nose_part.length;
    let d = nose_part.diameter;
    let x = nose_part.location;
    let nose_shape = design.nose_shape;
    let cd = design.max_diameter;
    let ce = PI_ENG * (cd / 2.0).powf(2.0);
    let a2 = (mach * mach - 1.0).sqrt();
    let u = a2 / (l / d);
    let aft_len = supersonic_nose_aft_length(design);
    // Ratio caps (corpus-verified): CNa v = min(aftLen/D, 10), CP v3 likewise
    // with the 25 cap (see [W3c correction] notes above).
    let v = (aft_len / d).min(10.0);
    // [W5n correction] (§5 item 1): the nose-CP length cap is per shape —
    // Conical reads min(len, 10), Von Karman/LV-Haack and ogive read 25.
    let v3_cap = if nose_shape == NoseShape::Conical {
        10.0
    } else {
        25.0
    };
    let v3 = (aft_len / d).min(v3_cap);

    // Nose o/r (fully specified sections 3.1/3.2).
    let power_law_exponent = if nose_shape == NoseShape::PowerLaw {
        Some(design.power_law_exponent()?)
    } else {
        None
    };
    let nose_value = nose_supersonic_cna_value(nose_shape, u, v, power_law_exponent)?;
    let nose_o = nose_value * (PI_ENG * (d / 2.0).powf(2.0) / ce);
    let nose_r = x + nose_supersonic_cp_fraction(nose_shape, u, v3)? * l;

    let mut cp_sum = nose_o;
    let mut ci_sum = nose_o * nose_r;

    // Crossflow nose volume/station from the shape-specific engine branches
    // in i.cs:1203-1262. Body tubes and frusta follow below.
    let (nose_vol, nose_station) = match nose_shape {
        NoseShape::Conical => (0.5 * l * d, x + (2.0 / 3.0) * l),
        NoseShape::Parabolic => ((2.0 / 3.0) * l * d, x + 0.6 * l),
        NoseShape::Elliptical => (
            (PI_ENG * (d / 2.0) * l) / 2.0,
            x + (l - (4.0 * l) / 9.424769999999999),
        ),
        NoseShape::PowerLaw => {
            let exponent = design.power_law_exponent()?;
            let (v_coef, u_coef, _) = power_law_nose_parameters(exponent)?;
            (v_coef * l * d, x + u_coef * l)
        }
        _ => ((2.0 / 3.0) * l * d, x + 0.625 * l),
    };
    let mut cg = nose_vol;
    let mut first_moment = cg * nose_station;
    for part in chain.iter().skip(1) {
        if part.kind == PartKind::Body {
            let pv = part.length * part.diameter;
            cg += pv;
            first_moment += pv * (part.location + 0.5 * part.length);
        } else if part.kind == PartKind::Expansion || part.kind == PartKind::Reducer {
            let front = part.diameter;
            let rear = part.aft_diameter();
            let pv = (part.length * (rear + front)) / 2.0;
            cg += pv;
            first_moment += pv
                * (part.location + (part.length * (front + 2.0 * rear)) / (3.0 * (front + rear)));
        }
    }
    let ch = if cg != 0.0 { first_moment / cg } else { 0.0 };

    let nose_len = l;
    let nose_dia = d;
    for (i, part) in chain.iter().enumerate().skip(1) {
        if part.kind == PartKind::Expansion {
            let front = part.diameter;
            let rear = part.aft_diameter();
            let mut follower = 0.0;
            for later in chain.iter().skip(i + 1) {
                if later.kind == PartKind::Body {
                    follower += later.length;
                }
            }
            let o = expansion_supersonic_o(part.length, front, rear, mach, follower, ce);
            let st = expansion_supersonic_station(part.location, part.length);
            cp_sum += o;
            ci_sum += o * st;
        } else if part.kind == PartKind::Reducer {
            let front = part.diameter;
            let rear = part.aft_diameter();
            let o = reducer_supersonic_o(part.length, front, rear, mach, ce);
            let st = reducer_supersonic_station(part.location, part.length);
            cp_sum += o;
            ci_sum += o * st;
        }
        if (part.kind == PartKind::Body || part.kind == PartKind::Reducer) && part.fin.is_some() {
            let fin = part.fin.as_ref().expect("fin checked");
            // [W14 correction] (docs/re/engine/supersonic-frustum-cp.md §8
            // item 2): the interference-ai loop is guarded by the h()==b()
            // shortcut — cylindrical FinCan roots (parent == rear) keep
            // ai = parent and never run the loop, even if a part origin
            // falls inside the root span (torrent). Only overhanging
            // tapered roots (ARCAS) take the loop.
            let tapered = (fin.chord - fin.location).max(0.0) > 0.0
                && fin.rear_diameter != fin.parent_diameter;
            let loop_ai = if tapered {
                taper_loop_ai(design, fin.leading_edge, fin.chord)
            } else {
                None
            };
            let r = supersonic_fin_inputs(
                fin,
                nose_len,
                nose_dia,
                fin.leading_edge,
                fin.parent_diameter,
                fin.rear_diameter,
                loop_ai,
            );
            let a1 = (mach * mach - 1.0).sqrt();
            let tanm = r.m.tan();
            let num = a1 / tanm;
            let num2 = tanm / a1;
            let d4 = if num2 <= 1.0 {
                fin_cna_cubic_value(r.mc, num2) / a1
            } else {
                fin_cna_ladder_value(r.mc, r.ao, num) / tanm
            };
            let mult = fin_count_multiplier(fin.count)?;
            let split = interference_split(r.ai_d, r.ak);
            let area_scale = (2.0 * r.am) / ce;
            let mut p = split.a8 * d4 * area_scale * mult;
            let mut q = split.b3 * d4 * area_scale * mult;
            let num7 = fin_cp_num7(r.ao, r.mc);
            let num14 = fin_cp_num14(r.ao, r.mc);
            let frac = fin_cp_fraction(num7, num14, num, num2);
            let mut s = r.al + frac * r.ah;
            let mut t = s;
            if let Some(alternate) = modified_newtonian_fin_load(fin, &r, mach, ce, mult) {
                let aa = (r.m.tan().powi(2) + 1.0).sqrt();
                if alternate.coefficient * alternate.station > p * s + q * t && mach >= aa {
                    p = alternate.coefficient;
                    s = alternate.station;
                    q = 0.0;
                    t = 0.0;
                }
            }
            cp_sum += p + q;
            ci_sum += p * s + q * t;
        }
    }

    Ok(SupersonicComponents {
        cp_sum,
        ci_sum,
        cg,
        ch,
    })
}

/// Supersonic normal-force / CP evaluation (Mach >= 1.05).
/// `re` is the caller-supplied Reynolds number at (mach, altitude).
pub fn evaluate_normal_force_supersonic(
    design: &Design,
    mach: f64,
    alpha_deg: f64,
    rogers: bool,
    re: f64,
) -> Result<NormalForce, CalibratedError> {
    if !(mach >= 1.05) {
        return Err(CalibratedError::Unsupported(format!(
            "supersonic pass requires Mach >= 1.05 (got {mach})"
        )));
    }
    let _ = rogers;
    let sums = component_sums(design, mach)?;
    let cp_sum = sums.cp_sum;
    let ci_sum = sums.ci_sum;
    let cg = sums.cg;
    let ch = sums.ch;
    let ce = PI_ENG * (design.max_diameter / 2.0).powf(2.0);
    let be = design.sustainer_length;
    let cd = design.max_diameter;
    let alpha = alpha_deg * std::f64::consts::PI / 180.0;

    // Unconditional crossflow aggregation (supersonic.md sections 3.6/3.8).
    let az = 0.509 + 0.183 * (be / cd).log10();
    let ay = mach * alpha.sin();
    let a0 = re * alpha.sin();
    let ax = jorgensen_cdc(ay, a0);
    let aj = az * ax * (cg / ce) * alpha.sin().powf(2.0);
    let aw = ch;
    let m_aa = cp_sum * alpha;
    let m_ag = m_aa + aj;

    let au: f64;
    if alpha == 0.0 {
        au = if cp_sum != 0.0 { ci_sum / cp_sum } else { 0.0 };
    } else {
        au = if m_ag != 0.0 {
            (ci_sum * alpha + aj * aw) / m_ag
        } else {
            0.0
        };
    }

    // Fixed-4-degree pair (section 3.7): same ax evaluated at m_f.
    let m_f = REF_ALPHA_RAD;
    let ak = az * jorgensen_cdc(mach * m_f.sin(), re * m_f.sin()) * (cg / ce) * m_f.sin().powf(2.0);
    let ah = cp_sum * m_f + ak;
    let cn_alpha04 = ah / m_f;
    let cp04_in = if ah != 0.0 {
        (ci_sum * m_f + ak * aw) / ah
    } else {
        0.0
    };

    Ok(NormalForce {
        cl: m_ag * alpha.sin(),
        cn: m_ag,
        cn_potential: m_aa,
        cn_viscous: aj,
        cn_alpha04,
        cp_in: au,
        cp04_in,
    })
}
