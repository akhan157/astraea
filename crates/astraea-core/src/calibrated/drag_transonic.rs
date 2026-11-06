//! Transonic drag pass (mirror of TS `dragTransonic.ts`).

use super::design::{altitude_for_mach, Design};
use super::drag_subsonic::evaluate_drag_subsonic;
use super::drag_supersonic::{evaluate_drag_supersonic, DragHighMach};
use super::atmosphere::Site;
use super::{atmosphere, CalibratedError};

const W_LINEAR: f64 = 0.15000000000000002;
const BUMP: f64 = 1.0425;

/// calibrated's transonic blend of a drag total between its M0.9 and M1.05
/// endpoint values.
pub fn blend_transonic_total(m_o: f64, m_s: f64, m: f64) -> f64 {
    let bp = BUMP * m_o;
    if m_s < bp {
        m_o + (m_s - m_o) * ((m - 0.9) / W_LINEAR)
    } else if m <= 0.925 {
        m_o * (1.0 + 68.0 * (m - 0.9) * (m - 0.9))
    } else {
        bp + (m_s - bp) * ((m - 0.925) / 0.125)
    }
}

pub fn evaluate_drag_transonic(
    design: &Design,
    mach: f64,
    nozzle_exit_in: Option<f64>,
    altitude_ft: f64,
    site: Option<&Site>,
) -> Result<DragHighMach, CalibratedError> {
    if !(mach > 0.9 && mach < 1.05) {
        return Err(CalibratedError::Unsupported(format!(
            "transonic drag requires 0.9 < Mach < 1.05 (got {mach})"
        )));
    }
    // Aero Plots / Run Test (no site): endpoints at their OWN ladder
    // altitudes. In flight (site present): both endpoints at the live
    // altitude in the site atmosphere. Reynolds is recomputed at the live
    // Mach/altitude either way.
    let (alt09, alt105) = match site {
        None => (altitude_for_mach(design, 0.9), altitude_for_mach(design, 1.05)),
        Some(_) => (altitude_ft, altitude_ft),
    };
    let sub = evaluate_drag_subsonic(design, 0.9, nozzle_exit_in, alt09, site)?;
    let sup = evaluate_drag_supersonic(design, 1.05, nozzle_exit_in, alt105, site)?;
    let cd_power_off = blend_transonic_total(sub.cd_power_off, sup.cd_power_off, mach);
    let cd_power_on = blend_transonic_total(sub.cd_power_on, sup.cd_power_on, mach);
    let (a_sound, nu) = atmosphere(altitude_ft, site);
    let reynolds = mach * a_sound * (design.sustainer_length / 12.0) / nu;
    Ok(DragHighMach { reynolds, cd_power_off, cd_power_on, components: None })
}
