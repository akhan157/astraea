//! Skin-friction coefficient (mirror of TS `friction.ts`).

pub fn skin_friction(re: f64, length_over_rough: f64, mach: f64, rough_in: f64, forced_turb: bool) -> f64 {
    let mut re_val = re.max(1e4);
    if rough_in > 0.0 {
        let v = length_over_rough.powf(1.056);
        let cut = if mach < 1.0 {
            (34.8 + 7.2 * mach) * v
        } else if mach < 2.0 {
            (42.0 + 47.6 * (mach - 1.0)) * v
        } else if mach < 3.0 {
            (89.6 + 90.4 * (mach - 2.0)) * v
        } else {
            180.0 * v
        };
        if cut > 2.58e6 || forced_turb {
            re_val = re_val.min(cut);
        } else if cut < 182500.0 {
            re_val = re_val.min(cut);
        } else {
            // 182500 <= cut <= 2.58e6
            if (182500.0..500000.0).contains(&re_val) {
                re_val = 182500.0;
            }
            if re_val >= 500000.0 {
                re_val = 2.58e6;
            }
        }
    }
    let mut cf = if forced_turb || re_val >= 500000.0 {
        let turbulent = 0.455 / re_val.log10().powf(2.58);
        if forced_turb {
            turbulent
        } else {
            turbulent - 1700.0 / re_val
        }
    } else {
        1.328 / re_val.sqrt()
    };
    if mach >= 1.05 {
        if mach <= 2.0 {
            cf *= 1.0 - 0.256 * (mach - 1.0);
        } else if mach <= 10.0 {
            cf /= (1.0 + 0.144 * mach * mach).powf(0.65);
        } else {
            cf *= 0.1691;
        }
    }
    cf
}
