//! Subsonic drag pass (mirror of TS `dragSubsonic.ts`).
//!
//! Floating-point operation order matches the TS oracle exactly; do not
//! reassociate. `NoseShape`/`Airfoil` matches replace the TS string compares.

use super::design::{Airfoil, Design, Fin, NoseShape, PartKind};
use super::friction::skin_friction;
use super::atmosphere::Site;
use super::{atmosphere, CalibratedError};
use std::f64::consts::PI;

/// Truncated pi used for the reference area ce, kept bit-exact for parity.
const PI_T: f64 = 3.14159;

/// Nose wetted-area ratio (wetted / ce).
pub fn nose_wetted_ratio(shape: NoseShape, l: f64, d: f64, ce: f64) -> Result<f64, CalibratedError> {
    nose_wetted_ratio_with_exponent(shape, l, d, ce, None)
}

/// Nose wetted ratio with the CDX1 Power Law exponent when that shape is used.
pub fn nose_wetted_ratio_with_exponent(
    shape: NoseShape,
    l: f64,
    d: f64,
    ce: f64,
    power_law_exponent: Option<f64>,
) -> Result<f64, CalibratedError> {
    let r = d / 2.0;
    match shape {
        NoseShape::TangentOgive | NoseShape::VonKarmanOgive | NoseShape::LvHaack => {
            let r2 = d / 4.0 + l * l / d;
            let mut g = l - (r2 - d / 2.0) * (l / r2).asin();
            g *= 2.0 * r2 / (r * r);
            Ok(g * PI * (r * r) / ce)
        }
        NoseShape::Conical => {
            let s = (PI_T * r * (r * r + l * l).sqrt()) / (PI_T * r * r);
            Ok(s * PI * (r * r) / ce)
        }
        NoseShape::Parabolic => {
            let s = (PI_T * r * (r * r + l * l).sqrt() * 1.3286) / (PI_T * r * r);
            Ok(s * PI_T * (r * r) / ce)
        }
        NoseShape::Elliptical => {
            let mut g = (0.0f64.max(1.0 - (d * d) / (4.0 * l * l))).sqrt().asin();
            g *= (2.0 * l / d) / (1.0 - (d * d) / (4.0 * l * l)).sqrt();
            g = 1.0 + g;
            Ok(g * PI_T * (r * r) / ce)
        }
        NoseShape::PowerLaw => {
            let exponent = power_law_exponent.ok_or_else(|| {
                CalibratedError::Unsupported(
                    "power-law nose wetted area requires its exponent".into(),
                )
            })?;
            if !exponent.is_finite() || !(0.0..=1.0).contains(&exponent) {
                return Err(CalibratedError::Unsupported(format!(
                    "Power Law exponent outside the engine range [0, 1]: {exponent}"
                )));
            }
            let factor = if exponent < 0.5 {
                2.0 - 1.3428 * exponent
            } else {
                0.5 * exponent * exponent - 1.4043 * exponent + 1.9057
            };
            let cone = (PI_T * r * (r * r + l * l).sqrt()) / (PI_T * r * r);
            Ok(cone * factor * PI_T * (r * r) / ce)
        }
    }
}

/// Frustum wetted ratio for an expansion/reducer from front to rear diameter.
pub fn frustum_wetted_ratio(front: f64, rear: f64, l: f64, ce: f64) -> f64 {
    let slant = (l * l + ((front - rear) / 2.0).powf(2.0)).sqrt();
    (PI_T * (front / 2.0 + rear / 2.0) * slant) / ce
}

pub fn rail_guide(m: f64, a: f64, b: f64, ce: f64) -> f64 {
    let area = a * b;
    if m <= 0.7 {
        4.5 * (1.12 / (1.0 - m * m).sqrt()) * area / ce
    } else if m <= 0.8 {
        4.5 * (1.57 - 0.7 * (m - 0.7)) * area / ce
    } else if m <= 0.9 {
        4.5 * (1.5 + 6.0 * (m - 0.8)) * area / ce
    } else {
        0.0
    }
}

pub fn launch_lug(m: f64, dia: f64, ce: f64) -> f64 {
    if m > 0.9 {
        return 0.0;
    }
    let area = PI * (dia / 2.0).powf(2.0);
    5.75 * area / ce
}

pub fn launch_shoe(m: f64, area: f64, ce: f64) -> f64 {
    if m <= 0.5 {
        9.0 * area / ce
    } else if m <= 0.9 {
        4.5 * (2.446 - 1.864 * m + 1.917 * m * m) * area / ce
    } else {
        0.0
    }
}

/// Sweep-angle thickness factor: bevel-derived (fx1 over mean chord) for the
/// wedge-family airfoils (TS `.includes` list), 0.25 for Subsonic NACA, 0 for
/// Rounded/Square. Delegates to the shared `geometry` helper.
pub fn sweep_thickness_factor(airfoil: Airfoil, fx1: f64, chord: f64, tip: f64) -> f64 {
    super::geometry::sweep_thickness_factor(airfoil, fx1, chord, tip)
}

/// Equivalent constant body diameter over a fin root chord that overhangs a
/// tapered parent (frustum-volume match). Delegates to `geometry`.
pub fn equivalent_diameter(front: f64, rear: f64, chord: f64, overhang: f64) -> f64 {
    super::geometry::equivalent_diameter(front, rear, chord, overhang)
}

/// Taper-branch adjusted fin areas. Cylindrical parents reproduce the planform
/// values.
pub struct AdjustedFinAreas {
    pub am: f64,
    pub aj: f64,
    pub ad: f64,
}

pub fn adjusted_fin_areas(
    sweep: f64,
    tip: f64,
    chord: f64,
    span: f64,
    front: f64,
    equiv: f64,
    num: f64,
    plan_area: f64,
    leading_edge: f64,
) -> AdjustedFinAreas {
    if front == equiv {
        return AdjustedFinAreas { am: plan_area, aj: plan_area / span, ad: leading_edge };
    }
    let num2 = if sweep != 0.0 { ((front - equiv) / 2.0) / (span / sweep) } else { 0.0 };
    let num3 = if num != 0.0 { ((front - equiv) / 2.0) / (span / num) } else { 0.0 };
    let _ae = num2 + chord - num3;
    let af = tip;
    let ag = num2 + sweep;
    let ah = span + (front - equiv) / 2.0;
    let am = (ag / 2.0 + (num3 + num) / 2.0 + (af - (num3 + num))) * ah;
    AdjustedFinAreas { am, aj: am / ah, ad: leading_edge - num2 }
}

/// Subsonic fin friction+pressure, interference and base terms.
pub struct FinComponents {
    pub friction_pressure: f64,
    pub interference: f64,
    pub base: f64,
}

pub fn fin_components(
    fin: &Fin,
    body_d: f64,
    ce: f64,
    m: f64,
    re_body: f64,
    be: f64,
    rough_in: f64,
    forced_turb: bool,
) -> FinComponents {
    let cr = fin.chord;
    let ct = fin.tip;
    let sd = fin.sweep;
    let span = fin.span;
    let t = fin.thickness;
    let n = fin.count;
    let airfoil = fin.airfoil;
    let h_front = body_d;
    let h_rear = fin.rear_diameter;

    let num = sd + ct - cr;
    let k = (sd / 2.0 + num / 2.0 + (ct - num)) * span;
    let l = k + ((sd / span) * (h_front / 2.0) / 2.0 - (num / span) * (h_front / 2.0) / 2.0 + cr) * (h_front / 2.0);

    let overhang = (cr - fin.location).max(0.0);
    let ai = equivalent_diameter(h_front, h_rear, cr, overhang);

    let adj = adjusted_fin_areas(sd, ct, cr, span, h_front, ai, num, k, fin.leading_edge);
    let am = adj.am;
    let aj_mean = adj.aj;

    let d2 = sweep_thickness_factor(airfoil, fin.fx1, cr, ct);

    let nang = ((sd + d2 * ct - d2 * cr) / span).atan();
    let mean_chord = k / span;
    let r = t / aj_mean;

    let re_f = (re_body * aj_mean / be).max(1e4 * aj_mean / be);
    let cf = skin_friction(re_f, if rough_in != 0.0 { aj_mean / rough_in } else { 0.0 }, m, rough_in, forced_turb);

    let mach_mult: f64;
    if m <= 0.25 {
        mach_mult = 1.044 * nang.cos().powf(0.28);
    } else if m <= 0.6 {
        mach_mult = (1.044 + 0.231 * (m - 0.25)) * nang.cos().powf(0.28);
    } else if m <= 0.9 {
        mach_mult = (1.125 + 0.634 * (m - 0.6)) * nang.cos().powf(0.28);
    } else {
        mach_mult = 1.0;
    }

    let thick_term = 0.29 * (t * span / k);
    let nn: f64;
    if airfoil == Airfoil::Rounded {
        nn = 0.02 + 0.02 * ((r - 0.04) / 0.04) - thick_term;
    } else if airfoil == Airfoil::Square {
        nn = 0.028 + 0.06 * ((r - 0.032) / 0.068) - thick_term;
    } else if airfoil == Airfoil::SubsonicNaca {
        nn = 2.0 * cf * (1.0 + 2.0 * r + 100.0 * r.powf(4.0));
    } else if airfoil == Airfoil::Biconvex || airfoil == Airfoil::SingleWedge {
        nn = 2.0 * cf * (1.0 + 1.2 * r + 100.0 * r.powf(4.0));
    } else {
        let bevel_ratio = fin.fx1 / mean_chord;
        nn = 2.0
            * cf
            * (if bevel_ratio < 0.3 {
                1.0 + 2.0 * r + 100.0 * r.powf(4.0)
            } else {
                1.0 + 1.2 * r + 100.0 * r.powf(4.0)
            });
    }

    let cj = nn * (am * n as f64 / ce) * mach_mult;
    let ck = cj * (l - am) / am;
    let cl = if matches!(airfoil, Airfoil::SingleWedge | Airfoil::HexagonalBluntBase | Airfoil::Square | Airfoil::Rounded) {
        0.29 * (t * span * n as f64 / ce)
    } else {
        0.0
    };

    FinComponents { friction_pressure: cj, interference: ck, base: cl }
}

/// Subsonic drag breakdown (TS `DragResult`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DragSubsonic {
    pub body_friction: f64,
    pub body_pressure: f64,
    pub body_base: f64,
    pub fin_friction_pressure: f64,
    pub fin_interference: f64,
    pub fin_base: f64,
    pub protuberance: f64,
    pub cd_power_off: f64,
    pub cd_power_on: f64,
    pub reynolds: f64,
}

pub fn evaluate_drag_subsonic(
    design: &Design,
    m: f64,
    nozzle_exit_in: Option<f64>,
    alt_ft: f64,
    site: Option<&Site>,
) -> Result<DragSubsonic, CalibratedError> {
    let chain = &design.chain;
    let be = design.sustainer_length;
    let cd_max = design.max_diameter;
    let ce = PI_T * (cd_max / 2.0).powf(2.0);
    let cb = design.base_diameter;
    let rough = design.surface.roughness_in();
    let forced = design.turbulence;

    let (a_sound, nu) = atmosphere(alt_ft, site);
    let re = m * a_sound * (be / 12.0) / nu;

    let cf_body = skin_friction(re, if rough != 0.0 { be / rough } else { 0.0 }, m, rough, forced);
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
    let ms = cf_body * wetted;
    let mut mt = ms * (60.0 / (be / cd_max).powf(3.0) + 0.0025 * (be / cd_max));
    if design.nose_shape == NoseShape::PowerLaw {
        let exponent = design.power_law_exponent()?;
        if exponent <= 0.1 {
            mt = 0.8 - 30.000000000000007 * (exponent - 0.1);
        } else if exponent <= 0.3 {
            mt = 0.2 + ((mt - 0.2) / 0.19999999999999998) * (exponent - 0.1);
        }
    }
    let mr = (0.029 * (cb / cd_max).powf(3.0) / (ms + mt).sqrt()) * (PI_T * (cd_max / 2.0).powf(2.0) / ce);

    let mut cj = 0.0;
    let mut ck = 0.0;
    let mut cl = 0.0;
    for part in chain.iter() {
        if (part.kind == PartKind::Body || part.kind == PartKind::Reducer) && part.fin.is_some() {
            let fin = part.fin.as_ref().unwrap();
            let local_d = fin.parent_diameter;
            let fc = fin_components(fin, local_d, ce, m, re, be, rough, forced);
            cj += fc.friction_pressure;
            ck += fc.interference;
            cl += fc.base;
        }
    }

    let mut dh = 0.0;
    for part in chain.iter() {
        if part.kind != PartKind::Body {
            continue;
        }
        if part.rail_diameter.unwrap_or(0.0) > 0.0 || part.rail_height.unwrap_or(0.0) > 0.0 {
            dh += rail_guide(m, part.rail_diameter.unwrap_or(0.0), part.rail_height.unwrap_or(0.0), ce);
        }
        if part.lug_diameter.unwrap_or(0.0) > 0.0 {
            dh += launch_lug(m, part.lug_diameter.unwrap_or(0.0), ce);
        }
        if part.shoe_area.unwrap_or(0.0) > 0.0 {
            dh += launch_shoe(m, part.shoe_area.unwrap_or(0.0), ce);
        }
    }

    let body_friction = ms;
    let body_pressure = mt;
    let body_base = mr;
    let fin_friction_pressure = cj;
    let fin_interference = ck;
    let fin_base = cl;
    let protuberance = dh;

    let cd_off = body_friction + body_pressure + body_base + fin_friction_pressure + fin_interference + fin_base + protuberance;

    let nozzle_dia = nozzle_exit_in.unwrap_or(design.sustainer_nozzle);
    let mut f_m = if m >= 0.58 { 0.0547 + (m - 0.58) * 0.111304348 } else { 0.0547 };
    if m >= 0.925 {
        f_m = if m < 1.0 { 0.0931 + (m - 0.925) * 0.901333333 } else { 0.1607 - (m - 1.0) * 0.066666667 };
    }
    let mut mi = 0.0;
    if cb != 0.0 && nozzle_dia > 0.0 {
        mi = -f_m * (PI * (nozzle_dia / 2.0).powf(2.0)) / (PI_T * (cb / 2.0).powf(2.0));
        mi *= (PI * (cb / 2.0).powf(2.0)) / ce;
    }
    let cd_on = cd_off + mi;

    Ok(DragSubsonic {
        body_friction,
        body_pressure,
        body_base,
        fin_friction_pressure,
        fin_interference,
        fin_base,
        protuberance,
        cd_power_off: cd_off,
        cd_power_on: cd_on,
        reynolds: re,
    })
}
