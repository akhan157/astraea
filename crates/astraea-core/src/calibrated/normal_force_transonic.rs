//! calibrated II transonic normal-force / CP pass (0.9 < Mach < 1.05).
//!
//! Port of `src/aero/calibrated/normalForceTransonic.ts`: evaluates the subsonic
//! pass at the Mach 0.9 endpoint and the supersonic pass at the Mach 1.05
//! endpoint (each at its own endpoint Reynolds number, rescaled from the
//! live Mach), then blends the seven reported quantities with the exact
//! float weight `(M - 0.9) / 0.15000000000000002`.

use super::design::Design;
use super::normal_force_subsonic::{evaluate_normal_force_subsonic, NormalForce};
use super::normal_force_supersonic::evaluate_normal_force_supersonic;
use super::CalibratedError;

const BLEND_DEN: f64 = 0.15000000000000002;

pub fn transonic_blend_weight(mach: f64) -> f64 {
    (mach - 0.9) / BLEND_DEN
}

/// Transonic normal-force / CP evaluation (0.9 < Mach < 1.05).
/// `re` is the caller-supplied Reynolds number at the live (mach, altitude).
pub fn evaluate_normal_force_transonic(
    design: &Design,
    mach: f64,
    alpha_deg: f64,
    rogers: bool,
    re: f64,
) -> Result<NormalForce, CalibratedError> {
    if !(mach > 0.9 && mach < 1.05) {
        return Err(CalibratedError::Unsupported(format!(
            "transonic pass requires 0.9 < Mach < 1.05 (got {mach})"
        )));
    }
    let w = transonic_blend_weight(mach);
    // Endpoint Reynolds numbers at the endpoint Mach (RE linear in Mach at
    // fixed altitude; the engine recomputes RE at each endpoint Mach).
    let re09 = (re / mach) * 0.9;
    let re105 = (re / mach) * 1.05;
    let sub = evaluate_normal_force_subsonic(design, 0.9, alpha_deg, rogers, re09)?;
    let sup = evaluate_normal_force_supersonic(design, 1.05, alpha_deg, rogers, re105)?;
    let blend = |a: f64, b: f64| a + (b - a) * w;
    // The blended outputs are exactly the linear blend of the endpoint
    // outputs (the blend applies to the aggregation quantities, and the six
    // reported CN/CP columns inherit it; verified to 4.96e-15 on the corpus).
    // cl follows the same blend for consistency with the blended cn.
    Ok(NormalForce {
        cl: blend(sub.cl, sup.cl),
        cn: blend(sub.cn, sup.cn),
        cn_potential: blend(sub.cn_potential, sup.cn_potential),
        cn_viscous: blend(sub.cn_viscous, sup.cn_viscous),
        cn_alpha04: blend(sub.cn_alpha04, sup.cn_alpha04),
        cp_in: blend(sub.cp_in, sup.cp_in),
        cp04_in: blend(sub.cp04_in, sup.cp04_in),
    })
}
