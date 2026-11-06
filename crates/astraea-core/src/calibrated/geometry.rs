//! Fin/body helpers shared by the drag and normal-force passes (TS
//! `sweepThicknessFactor`, `equivalentDiameter` in dragSubsonic.ts).

use super::design::Airfoil;
use std::f64::consts::PI;

/// fx1 / mean chord for beveled sections, 0.25 for Subsonic NACA, 0 for Rounded/Square.
pub fn sweep_thickness_factor(airfoil: Airfoil, fx1: f64, chord: f64, tip: f64) -> f64 {
    if airfoil.is_beveled() {
        fx1 / ((chord + tip) / 2.0)
    } else if airfoil == Airfoil::SubsonicNaca {
        0.25
    } else {
        0.0
    }
}

/// Equivalent constant body diameter over a fin root chord that overhangs a
/// tapered parent (frustum-volume match). Zero overhang returns `front`.
pub fn equivalent_diameter(front: f64, rear: f64, chord: f64, overhang: f64) -> f64 {
    if overhang <= 0.0 || rear == front {
        return front;
    }
    let parent_len = chord - overhang;
    let r1 = front / 2.0;
    let r2 = rear / 2.0;
    let v = PI * r1 * r1 * parent_len + (PI / 3.0) * (r1 * r1 + r1 * r2 + r2 * r2) * overhang;
    2.0 * (v / (PI * chord)).sqrt()
}
