//! calibrated II atmosphere (mirror of TS `atmosphere.ts` and `flightAtmosphere.ts`).
//!
//! `atmosphere(alt, None)` is the site-less atmosphere Aero Plots and Run Test
//! use (the whole engine corpus; layers per
//! docs/re/engine/supersonic-bodies-atmosphere.md §1). In flight the engine's
//! atmosphere carries launch-site offsets (docs/re/engine/flight-atmosphere.md):
//! temperature at `temperature_offset_ft + h`, density and viscosity at
//! `density_offset_ft + h`, pressure at `pressure_offset_ft + h`, h above the
//! launch site.

/// Launch-site offsets (ft) of the engine atmosphere.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Site {
    pub density_offset_ft: f64,
    pub temperature_offset_ft: f64,
    /// Pressure reference altitude m_g: the site altitude for a standard (zero-input) site pressure.
    pub pressure_offset_ft: f64,
}

/// Engine sea-level pressure (psi): the static-test datum of RASP thrust curves.
const SEA_LEVEL_PSI: f64 = 14.6958;
const SLUG_FT3_TO_KG_M3: f64 = 515.378818;
const FT_TO_M: f64 = 0.3048;
const PSI_TO_PA: f64 = 6894.757293;
const IN2_TO_M2: f64 = 0.00064516;

impl Site {
    /// Site setter with zero (standard) site pressure: pressure is standard at
    /// the site altitude, the launch density is the ideal-gas density at that
    /// pressure and the launch temperature, and the offsets place those values
    /// at h = 0. Fails on nonfinite input or a temperature at/below absolute zero.
    pub fn new(site_altitude_ft: f64, site_temperature_f: f64) -> Result<Site, String> {
        if !site_altitude_ft.is_finite() || !site_temperature_f.is_finite() {
            return Err(format!(
                "calibrated atmosphere: site altitude and temperature must be finite (got {site_altitude_ft} ft, {site_temperature_f} F)"
            ));
        }
        let temperature_r = site_temperature_f + 459.69;
        if !(temperature_r > 0.0) {
            return Err(format!("calibrated atmosphere: site temperature must be above absolute zero (got {site_temperature_f} F)"));
        }
        let site_pressure_psi = SEA_LEVEL_PSI * (1.0 - 6.8753e-6 * site_altitude_ft).powf(5.2561);
        let launch_density = 1.0 / ((1716.4829 * temperature_r) / (site_pressure_psi * 144.0));
        Ok(Site {
            density_offset_ft: (launch_density / 0.002378 - 1.0) * -40000.0,
            temperature_offset_ft: (temperature_r / 518.69 - 1.0) * -144000.0,
            pressure_offset_ft: site_altitude_ft,
        })
    }

    /// Site setter with an optional measured launch pressure in Pa. The engine
    /// accepts inHg and converts with 0.49117 psi/inHg; the TS-to-IPC adapter
    /// supplies Pa using that same conversion, so dividing by PSI_TO_PA here
    /// preserves the engine's measured-pressure path. `None` and zero retain
    /// the established standard-pressure behavior.
    pub fn with_pressure_pa(
        site_altitude_ft: f64,
        site_temperature_f: f64,
        launch_pressure_pa: Option<f64>,
    ) -> Result<Site, String> {
        let Some(pressure_pa) = launch_pressure_pa else {
            return Self::new(site_altitude_ft, site_temperature_f);
        };
        if !pressure_pa.is_finite() || pressure_pa < 0.0 {
            return Err(format!(
                "calibrated atmosphere: launch pressure must be a nonnegative finite value in Pa (got {pressure_pa})"
            ));
        }
        if pressure_pa == 0.0 {
            return Self::new(site_altitude_ft, site_temperature_f);
        }
        if !site_altitude_ft.is_finite() || !site_temperature_f.is_finite() {
            return Err(format!(
                "calibrated atmosphere: site altitude and temperature must be finite (got {site_altitude_ft} ft, {site_temperature_f} F)"
            ));
        }
        let temperature_r = site_temperature_f + 459.69;
        if !(temperature_r > 0.0) {
            return Err(format!("calibrated atmosphere: site temperature must be above absolute zero (got {site_temperature_f} F)"));
        }

        let input_pressure_psi = pressure_pa / PSI_TO_PA;
        let pressure_offset_ft = site_altitude_ft
            + ((input_pressure_psi / SEA_LEVEL_PSI).powf(0.19026) - 1.0) / -6.87535e-6;
        let site_pressure_psi = pressure_psi(pressure_offset_ft);
        let launch_density = 1.0 / ((1716.4829 * temperature_r) / (site_pressure_psi * 144.0));
        Ok(Site {
            density_offset_ft: (launch_density / 0.002378 - 1.0) * -40000.0,
            temperature_offset_ft: (temperature_r / 518.69 - 1.0) * -144000.0,
            pressure_offset_ft,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn measured_pressure_zero_preserves_standard_site() {
        let standard = Site::new(3750.0, 80.0).unwrap();
        assert_eq!(
            Site::with_pressure_pa(3750.0, 80.0, Some(0.0)).unwrap(),
            standard
        );
        assert_eq!(
            Site::with_pressure_pa(3750.0, 80.0, None).unwrap(),
            standard
        );
    }

    #[test]
    fn measured_pressure_changes_reference_altitude_and_launch_air() {
        let pressure_pa = 30.05 * 0.49117 * PSI_TO_PA;
        let site = Site::with_pressure_pa(0.0, 80.0, Some(pressure_pa)).unwrap();
        assert!(site.pressure_offset_ft < 0.0);
        let air = flight_air(&site, 0.0);
        assert!(air.pressure > SEA_LEVEL_PSI * PSI_TO_PA);
        assert!(air.density > 0.0);
    }

    #[test]
    fn measured_pressure_rejects_invalid_values() {
        assert!(Site::with_pressure_pa(0.0, 59.0, Some(-1.0))
            .unwrap_err()
            .contains("nonnegative finite"));
        assert!(Site::with_pressure_pa(0.0, 59.0, Some(f64::NAN))
            .unwrap_err()
            .contains("nonnegative finite"));
    }
}

fn temperature_r(n: f64) -> f64 {
    if n < 36000.0 {
        518.69 * (1.0 - n * 6.944e-6)
    } else if n <= 65800.0 {
        389.97
    } else if n < 105000.0 {
        389.97 + 0.000543852 * (n - 65800.0)
    } else if n < 155500.0 {
        411.289 + 0.001502594 * (n - 105000.0)
    } else if n <= 172000.0 {
        487.17
    } else if n < 200000.0 {
        487.17 - 0.0010775 * (n - 172000.0)
    } else if n < 262500.0 {
        457.0 - 0.00210928 * (n - 200000.0)
    } else if n <= 295000.0 {
        325.17
    } else if n >= 300000.0 {
        332.9
    } else {
        325.17 + 0.001546 * (n - 295000.0)
    }
}

fn kinematic_viscosity(n: f64) -> f64 {
    if n <= 29500.0 {
        0.00015723 + 5.7908e-09 * n
    } else if n < 80000.0 {
        8.2492e-05 * 10f64.powf(2.0265e-05 * n)
    } else if n < 146000.0 {
        7.4809e-05 * 10f64.powf(2.0971e-05 * n)
    } else {
        0.00039234 * 10f64.powf(1.6057e-05 * n)
    }
}

fn density_slug_ft3(n: f64) -> f64 {
    if n <= 16000.0 {
        0.002378 * (1.0 - 2.5e-5 * n)
    } else if n <= 36000.0 {
        0.002378 * (1.0 - 6.944e-6 * n).powf(4.2561)
    } else if n < 46000.0 {
        0.002378 * (0.3 - 1.1579e-5 * (n - 36000.0))
    } else {
        0.00046227 * (-4.7823e-5 * (n - 45000.0)).exp()
    }
}

fn pressure_psi(n: f64) -> f64 {
    if n <= 36089.0 {
        SEA_LEVEL_PSI * (1.0 - 6.8735e-6 * n).powf(5.2561)
    } else if n <= 82021.0 {
        3.2824244964 * (-4.80634e-5 * (n - 36089.24)).exp()
    } else if n <= 160000.0 {
        3.2824244964 * (-4.80634e-5 * (n - 36089.24 - 0.128239654 * (n - 82021.0))).exp()
    } else {
        3.2824244964 * (-4.80634e-5 * (n - 46098.24)).exp()
    }
}

/// Speed of sound (ft/s) and kinematic viscosity (ft²/s) at `alt_ft`
/// (site-less without offsets; above the site with them).
pub fn atmosphere(alt_ft: f64, site: Option<&Site>) -> (f64, f64) {
    let (t_arg, nu_arg) = match site {
        None => (alt_ft, alt_ft),
        Some(s) => (s.temperature_offset_ft + alt_ft, s.density_offset_ft + alt_ft),
    };
    ((2403.07606 * temperature_r(t_arg)).sqrt(), kinematic_viscosity(nu_arg))
}

/// Engine flight air at an AGL altitude (m), SI.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FlightAir {
    /// kg/m³
    pub density: f64,
    /// m/s
    pub speed_of_sound: f64,
    /// Pa
    pub pressure: f64,
}

/// The air the engine's flight solver flies through (density profile, not the
/// ideal-gas form; verified against the engine's per-step flight dumps).
pub fn flight_air(site: &Site, altitude_agl_m: f64) -> FlightAir {
    let h_ft = altitude_agl_m / FT_TO_M;
    FlightAir {
        density: density_slug_ft3(site.density_offset_ft + h_ft) * SLUG_FT3_TO_KG_M3,
        speed_of_sound: (2403.07606 * temperature_r(site.temperature_offset_ft + h_ft)).sqrt() * FT_TO_M,
        pressure: pressure_psi(site.pressure_offset_ft + h_ft) * PSI_TO_PA,
    }
}

/// calibrated's altitude thrust correction (N) while the motor burns: the RASP
/// curve is a sea-level static thrust and the engine adds the nozzle-exit
/// pressure term A_e * (14.6958 psi - p(h)) with the design's nozzle diameter.
pub fn nozzle_pressure_thrust(nozzle_exit_diameter_in: f64, ambient_pressure_pa: f64) -> f64 {
    let exit_area_m2 = std::f64::consts::PI * (nozzle_exit_diameter_in / 2.0).powi(2) * IN2_TO_M2;
    exit_area_m2 * (SEA_LEVEL_PSI * PSI_TO_PA - ambient_pressure_pa)
}
