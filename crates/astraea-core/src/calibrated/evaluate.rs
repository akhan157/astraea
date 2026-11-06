//! One aerodynamic point of the calibrated II method (mirror of TS `evaluate.ts`).

use super::atmosphere::Site;
use super::design::{altitude_for_mach, Design};
use super::drag_subsonic::evaluate_drag_subsonic;
use super::drag_supersonic::{evaluate_drag_supersonic, DragHighMachComponents};
use super::drag_transonic::evaluate_drag_transonic;
use super::normal_force_subsonic::evaluate_normal_force_subsonic;
use super::normal_force_supersonic::evaluate_normal_force_supersonic;
use super::normal_force_transonic::evaluate_normal_force_transonic;
use super::CalibratedError;

/// calibrated's regime boundaries (supersonic.md §1).
const SUBSONIC_MAX_MACH: f64 = 0.9;
const SUPERSONIC_MIN_MACH: f64 = 1.05;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CpMethod {
    Barrowman,
    Rogers,
}

#[derive(Clone, Copy, Debug)]
pub struct EvalOptions {
    pub mach: f64,
    pub alpha_deg: f64,
    pub method: CpMethod,
    pub nozzle_exit_in: Option<f64>,
    /// Evaluation altitude (ft); `None` interpolates the design's Mach-altitude ladder (0 without one).
    pub altitude_ft: Option<f64>,
    /// Launch-site offsets of the flight atmosphere. `Some` = evaluate as the
    /// engine's flight does (Reynolds at `altitude_ft` above the site in the
    /// site air, transonic endpoints at that altitude); `None` = the site-less
    /// Aero Plots / Run Test atmosphere (the engine corpus).
    pub site: Option<Site>,
}

/// TS `CalibratedPoint`. Subsonic points fill body_pressure/fin_friction_pressure;
/// supersonic points fill the wave/sup slots; transonic points have no breakdown.
#[derive(Clone, Debug)]
pub struct Point {
    /// Zero-lift power-off drag (alpha independent).
    pub cd: f64,
    pub cd_power_off: f64,
    pub cd_power_on: f64,
    pub cl: f64,
    pub cn: f64,
    pub cn_potential: f64,
    pub cn_viscous: f64,
    pub cn_alpha04: f64,
    pub cp_in: f64,
    pub cp04_in: f64,
    pub ca_power_off: f64,
    pub ca_power_on: f64,
    pub reynolds: f64,
    pub components: Option<DragHighMachComponents>,
}

/// Unsupported geometry or regimes return `CalibratedError::Unsupported`; no fallback values.
pub fn evaluate(design: &Design, options: &EvalOptions) -> Result<Point, CalibratedError> {
    let EvalOptions { mach, alpha_deg, nozzle_exit_in, .. } = *options;
    let rogers = options.method == CpMethod::Rogers;
    let alt_ft = options.altitude_ft.unwrap_or_else(|| altitude_for_mach(design, mach));

    let (cd_off, cd_on, reynolds, components, nf) = if mach <= SUBSONIC_MAX_MACH {
        let drag = evaluate_drag_subsonic(design, mach, nozzle_exit_in, alt_ft, options.site.as_ref())?;
        let components = DragHighMachComponents {
            body_friction: drag.body_friction,
            nose_wave: None,
            body_pressure: Some(drag.body_pressure),
            body_base: drag.body_base,
            fin_friction_pressure: Some(drag.fin_friction_pressure),
            fin_friction_pressure_sup: None,
            fin_interference: drag.fin_interference,
            fin_interference_sup: None,
            fin_base: drag.fin_base,
            fin_extra: None,
            protuberance: drag.protuberance,
        };
        let nf = evaluate_normal_force_subsonic(design, mach, alpha_deg, rogers, drag.reynolds)?;
        (drag.cd_power_off, drag.cd_power_on, drag.reynolds, Some(components), nf)
    } else {
        let transonic = mach < SUPERSONIC_MIN_MACH;
        let drag = if transonic {
            evaluate_drag_transonic(design, mach, nozzle_exit_in, alt_ft, options.site.as_ref())?
        } else {
            evaluate_drag_supersonic(design, mach, nozzle_exit_in, alt_ft, options.site.as_ref())?
        };
        let nf = if transonic {
            evaluate_normal_force_transonic(design, mach, alpha_deg, rogers, drag.reynolds)?
        } else {
            evaluate_normal_force_supersonic(design, mach, alpha_deg, rogers, drag.reynolds)?
        };
        (drag.cd_power_off, drag.cd_power_on, drag.reynolds, drag.components, nf)
    };

    let alpha_rad = alpha_deg * std::f64::consts::PI / 180.0;
    let cos_alpha = alpha_rad.cos();
    let sin_alpha = alpha_rad.sin();
    let cos2_alpha = cos_alpha * cos_alpha;

    let ca_power_off = cd_off / cos2_alpha;
    let ca_power_on = cd_on / cos2_alpha;
    // The lift combination uses the power-ON axial coefficient in both rows.
    let cl = nf.cn * cos_alpha - ca_power_on * sin_alpha;

    Ok(Point {
        cd: cd_off,
        cd_power_off: ca_power_off * cos_alpha + nf.cn * sin_alpha,
        cd_power_on: ca_power_on * cos_alpha + nf.cn * sin_alpha,
        cl,
        cn: nf.cn,
        cn_potential: nf.cn_potential,
        cn_viscous: nf.cn_viscous,
        cn_alpha04: nf.cn_alpha04,
        cp_in: nf.cp_in,
        cp04_in: nf.cp04_in,
        ca_power_off,
        ca_power_on,
        reynolds,
        components,
    })
}
