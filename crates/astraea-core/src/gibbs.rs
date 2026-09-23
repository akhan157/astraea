//! Astraea Gibbs-equilibrium chemistry + nozzle performance — Rust port.
//!
//! Oracles (untouched, authoritative):
//! - `src/propulsion/nozzleChemistry.ts` — NASA-7 tables, cp ratio, sensible
//!   enthalpy/cv, APCP rigid-vessel preset, frozen isentropic performance.
//! - `src/propulsion/gibbsEquilibrium.ts` — entropy integral, g°/RT, the
//!   Levenberg–Marquardt element-potential (Lagrange/Newton) solver.
//! - `scripts/cea-corpus.json` — 60 NASA-CEA TP-equilibrium regression cases.
//!
//! Model summary (mirrors the TS module headers): NASA TM-4513
//! seven-coefficient cp/R fits per species with a low/high switch at 1000 K;
//! formation enthalpies at 298.15 K; condensed Al2O3 (alpha below 2327 K,
//! constant-cp liquid above, fusion enthalpy folded into the sensible
//! integral, fusion entropy into s°/R); entropy constant a7 fitted so
//! s°(298.15 K) reproduces the tabulated S°_298; g°/RT = h°/RT − s°/R; the
//! equilibrium solver minimizes G/RT under element balances with a damped
//! Gauss–Newton step plus backtracking line search, failing closed on
//! non-convergence; the APCP preset is a rigid-vessel (constant-volume)
//! adiabatic flame at a documented frozen composition; nozzle performance is
//! frozen-chemistry isentropic flow.
//!
//! Validation against the TS oracle (anchors extracted with `node`, same
//! bands as the TS suite — 0.01 abs on mole fractions, 0.5% rel on MW):
//! - CEA corpus, all 60 cases: max |Δx| = 0.00346 (H radical, 3800 K /
//!   50 bar case), max MW relative deviation = 0.00200. Both inside the
//!   0.01 / 0.005 bands with >2x headroom.
//! - APCP chamber (10 MPa): Tc = 3522.814668872915 K,
//!   γ = 1.1817718046095134, MW = 24.60469503516949 kg/kmol.
//! - Performance anchor (3000 K, γ = 1.35, 24.6048 kg/kmol, 10 MPa →
//!   100 kPa, sea-level): c* = 1489.1143187043374 m/s,
//!   Me = 3.625335287844056, Cf_vac = 1.6561796829344495,
//!   Cf_sea = 1.5666469067221975, Isp_vac = 251.48658106538912 s,
//!   Isp_sea = 237.89126165957623 s.
//! - APCP Gibbs solve at 3500 K / 10 MPa converges in 8 iterations to the
//!   TS-anchored moles (all Al → Al2O3(l), all Cl → HCl, all N → N2).
//!
//! Field-name mapping to TS: `tc` = Tc, `mol_weight` = molWeight,
//! `isp_vac`/`isp_sea` = ispVac/ispSea, `cstar` = cstar, `cf_vac`/`cf_sea` =
//! cfVac/cfSea, `exit_mach` = exitMach, `moles` keyed by species name,
//! `iterations` = Newton iterations taken (+1 on the converging step, 0 for
//! the condensed-only closed form, matching TS `finalize`).

use std::collections::HashMap;

/** Universal gas constant, J/(kmol·K). */
pub const R_UNIVERSAL: f64 = 8_314.46261815324;
/** Reference temperature of the NASA-7 fits / formation enthalpies, K. */
pub const STANDARD_TEMPERATURE: f64 = 298.15;
/** Standard gravity, m/s² (conventional Isp basis). */
pub const G0: f64 = 9.80665;
/** NASA-7 low/high polynomial switch temperature, K. */
pub const POLY_SWITCH_K: f64 = 1000.0;
/** Melting point of condensed Al2O3, K. */
pub const AL2O3_MELT_K: f64 = 2327.0;
/** Liquid-Al2O3 cp/R (constant), NASA TM-4513 fit for 2327–6000 K. */
pub const AL2O3_LIQUID_CPR: f64 = 23.148241;
/** Al2O3 enthalpy of fusion at 2327 K, J/kmol (NASA fit enthalpy offsets). */
pub const AL2O3_FUSION_J_PER_KMOL: f64 = 111_085_912.0;
/** Standard reference pressure P° for the ln(P/P°) fugacity term, Pa (1 atm). */
pub const STANDARD_PRESSURE: f64 = 101_325.0;
/** Chamber pressure for the APCP reference preset, Pa (100 bar). */
pub const APCP_REFERENCE_PRESSURE: f64 = 10_000_000.0;
/** Newton iteration cap — fail closed beyond this (normal runs need < 30). */
const MAX_ITERATIONS: usize = 200;
/** Relative residual tolerance for the element and mole-number balances. */
const REL_TOL: f64 = 1e-12;
/** Absolute residual tolerance for the condensed-phase equilibrium. */
const ABS_TOL: f64 = 1e-12;
/** Feed formation internal energy of the 1-kg APCP charge, J. */
const APCP_FEED_U_J: f64 = -1_515_100_000.0;

/* ------------------------------------------------------------------ *
 * NASA-7 species table (verbatim coefficients from the TS oracle)     *
 * ------------------------------------------------------------------ */

struct Nasa7Species {
    /// cp/R = a1 + a2T + a3T² + a4T³ + a5T⁴, low-temperature range (≤1000 K).
    a_low: [f64; 5],
    /// cp/R coefficients, high-temperature range (≥1000 K).
    a_high: [f64; 5],
    /// Standard formation enthalpy at 298.15 K, J/kmol.
    formation_enthalpy: f64,
    /// Molar mass, kg/kmol.
    molecular_weight: f64,
    /// Condensed phase: contributes cp but no ideal-gas −R term.
    condensed: bool,
    /// Gas-mole delta of the formation reaction from the elements (U=H−RT).
    v_form_gas: f64,
}

/// Species table; index = [`species_index`]. Coefficient values are verbatim
/// from `SPECIES` in nozzleChemistry.ts (NASA TM-4513).
const TABLE: [Nasa7Species; 10] = [
    // H2O
    Nasa7Species {
        a_low: [4.19864056, -0.0020364341, 6.52040211e-06, -5.48797062e-09, 1.77197817e-12],
        a_high: [2.67703787, 0.00297318329, -7.7376969e-07, 9.44336689e-11, -4.26900959e-15],
        formation_enthalpy: -241826000.0,
        molecular_weight: 18.01528,
        condensed: false,
        v_form_gas: -0.5,
    },
    // H2
    Nasa7Species {
        a_low: [2.34433112, 0.00798052075, -1.9478151e-05, 2.01572094e-08, -7.37611761e-12],
        a_high: [2.93286579, 0.000826607967, -1.46402335e-07, 1.54100359e-11, -6.88804432e-16],
        formation_enthalpy: 0.0,
        molecular_weight: 2.01588,
        condensed: false,
        v_form_gas: 0.0,
    },
    // CO2
    Nasa7Species {
        a_low: [2.35677352, 0.00898459677, -7.12356269e-06, 2.45919022e-09, -1.43699548e-13],
        a_high: [4.63659493, 0.00274131991, -9.95828531e-07, 1.60373011e-10, -9.16103468e-15],
        formation_enthalpy: -393522000.0,
        molecular_weight: 44.00980,
        condensed: false,
        v_form_gas: 0.0,
    },
    // CO
    Nasa7Species {
        a_low: [3.57953347, -0.00061035368, 1.01681433e-06, 9.07005884e-10, -9.04424499e-13],
        a_high: [3.04848583, 0.00135172818, -4.85794075e-07, 7.88536486e-11, -4.69807489e-15],
        formation_enthalpy: -110527000.0,
        molecular_weight: 28.01012,
        condensed: false,
        v_form_gas: 0.5,
    },
    // N2
    Nasa7Species {
        a_low: [3.53100528, -0.000123660987, -5.02999437e-07, 2.43530612e-09, -1.40881235e-12],
        a_high: [2.95257626, 0.00139690057, -4.92631691e-07, 7.86010367e-11, -4.60755321e-15],
        formation_enthalpy: 0.0,
        molecular_weight: 28.01348,
        condensed: false,
        v_form_gas: 0.0,
    },
    // HCl
    Nasa7Species {
        a_low: [3.5248171, 2.9984862e-05, -8.6221891e-07, 2.0979721e-09, -9.8658191e-13],
        a_high: [2.7665884, 0.0014381883, -4.6993e-07, 7.3499408e-11, -4.3731106e-15],
        formation_enthalpy: -92312000.0,
        molecular_weight: 36.46098,
        condensed: false,
        v_form_gas: 0.0,
    },
    // O2
    Nasa7Species {
        a_low: [3.78245636, -0.00299673415, 9.847302e-06, -9.68129508e-09, 3.24372836e-12],
        a_high: [3.66096083, 0.000656365523, -1.41149485e-07, 2.05797658e-11, -1.29913248e-15],
        formation_enthalpy: 0.0,
        molecular_weight: 31.99880,
        condensed: false,
        v_form_gas: 0.0,
    },
    // O
    Nasa7Species {
        a_low: [3.1682671, -0.00327931884, 6.64306396e-06, -6.12806624e-09, 2.11265971e-12],
        a_high: [2.54363697, -2.73162486e-05, -4.1902952e-09, 4.95481845e-12, -4.79553694e-16],
        formation_enthalpy: 249170000.0,
        molecular_weight: 15.99940,
        condensed: false,
        v_form_gas: 0.0,
    },
    // H
    Nasa7Species {
        a_low: [2.5, 0.0, 0.0, 0.0, 0.0],
        a_high: [2.50000286, -5.65334214e-09, 3.63251723e-12, -9.1994972e-16, 7.95260746e-20],
        formation_enthalpy: 217999000.0,
        molecular_weight: 1.00794,
        condensed: false,
        v_form_gas: 0.0,
    },
    // Al2O3
    Nasa7Species {
        a_low: [-4.9138309, 0.079398443, -0.00013237918, 1.044675e-07, -3.156633e-11],
        a_high: [11.833666, 0.0037708878, -1.7863191e-07, -5.6008807e-10, 1.4076825e-13],
        formation_enthalpy: -1675690000.0,
        molecular_weight: 101.96123,
        condensed: true,
        v_form_gas: 0.0,
    },
];

fn species_index(name: &str) -> Option<usize> {
    match name {
        "H2O" => Some(0),
        "H2" => Some(1),
        "CO2" => Some(2),
        "CO" => Some(3),
        "N2" => Some(4),
        "HCl" => Some(5),
        "O2" => Some(6),
        "O" => Some(7),
        "H" => Some(8),
        "Al2O3" => Some(9),
        _ => None,
    }
}

/// Atoms of element `element` in one molecule of species `species`
/// (structural data mirroring `ELEMENT_COMPOSITION`).
fn stoich(species: &str, element: &str) -> f64 {
    match (species, element) {
        ("H2O", "H") => 2.0,
        ("H2O", "O") => 1.0,
        ("H2", "H") => 2.0,
        ("CO2", "C") => 1.0,
        ("CO2", "O") => 2.0,
        ("CO", "C") => 1.0,
        ("CO", "O") => 1.0,
        ("N2", "N") => 2.0,
        ("HCl", "H") => 1.0,
        ("HCl", "Cl") => 1.0,
        ("O2", "O") => 2.0,
        ("O", "O") => 1.0,
        ("H", "H") => 1.0,
        ("Al2O3", "Al") => 2.0,
        ("Al2O3", "O") => 3.0,
        _ => 0.0,
    }
}

/// Standard molar entropies S°(298.15 K), J/(mol·K) — NIST/JANAF values
/// mirrored from `STANDARD_ENTROPY_J_PER_MOL_K`.
fn standard_entropy(species: &str) -> f64 {
    match species {
        "H2O" => 188.835,
        "H2" => 130.680,
        "CO2" => 213.795,
        "CO" => 197.660,
        "N2" => 191.609,
        "HCl" => 186.902,
        "O2" => 205.152,
        "O" => 161.059,
        "H" => 114.716,
        "Al2O3" => 50.92,
        _ => f64::NAN,
    }
}

/* ------------------------------------------------------------------ *
 * cp / enthalpy / cv                                                  *
 * ------------------------------------------------------------------ */

fn cp_at(idx: usize, t: f64) -> f64 {
    let a = if t < POLY_SWITCH_K { TABLE[idx].a_low } else { TABLE[idx].a_high };
    let mut v = a[4] * t + a[3];
    v = v * t + a[2];
    v = v * t + a[1];
    v * t + a[0]
}

fn cp_al2o3(t: f64) -> f64 {
    if t >= AL2O3_MELT_K {
        AL2O3_LIQUID_CPR
    } else {
        cp_at(9, t)
    }
}

/// cp/R of a species at temperature T (K), piecewise NASA-7.
pub fn cp_ratio(species: &str, temperature: f64) -> Result<f64, String> {
    if !temperature.is_finite() || temperature <= 0.0 {
        return Err(format!(
            "cpRatio: temperature must be finite and positive, got {}",
            temperature
        ));
    }
    let idx = species_index(species)
        .ok_or_else(|| format!("unknown species: {}", species))?;
    Ok(if species == "Al2O3" {
        cp_al2o3(temperature)
    } else {
        cp_at(idx, temperature)
    })
}

/// ∫ a1 + a2x + a3x² + a4x³ + a5x⁴ dx evaluated at x.
fn poly_integral(a: &[f64; 5], x: f64) -> f64 {
    a[0] * x + a[1] * (x * x) / 2.0 + a[2] * (x * x * x) / 3.0
        + a[3] * (x * x * x * x) / 4.0
        + a[4] * (x * x * x * x * x) / 5.0
}

/// ∫cp dT from 298.15 K to T, J/kmol (includes Al2O3 melting latent heat).
pub fn sensible_enthalpy(species: &str, temperature: f64) -> Result<f64, String> {
    if !temperature.is_finite() || temperature < STANDARD_TEMPERATURE {
        return Err(format!(
            "sensibleEnthalpy: temperature must be finite and ≥ 298.15 K, got {}",
            temperature
        ));
    }
    let idx = species_index(species)
        .ok_or_else(|| format!("unknown species: {}", species))?;
    let s = &TABLE[idx];
    let r = R_UNIVERSAL;
    if species != "Al2O3" {
        if temperature <= POLY_SWITCH_K {
            return Ok(r * (poly_integral(&s.a_low, temperature)
                - poly_integral(&s.a_low, STANDARD_TEMPERATURE)));
        }
        let lo = r * (poly_integral(&s.a_low, POLY_SWITCH_K)
            - poly_integral(&s.a_low, STANDARD_TEMPERATURE));
        return Ok(lo
            + r * (poly_integral(&s.a_high, temperature)
                - poly_integral(&s.a_high, POLY_SWITCH_K)));
    }
    // Al2O3: alpha crystal (low poly) up to 1000 K, alpha (high poly)
    // 1000–2327 K, fusion at 2327 K, then constant-cp liquid above.
    if temperature <= POLY_SWITCH_K {
        return Ok(r * (poly_integral(&s.a_low, temperature)
            - poly_integral(&s.a_low, STANDARD_TEMPERATURE)));
    }
    let to_switch = r * (poly_integral(&s.a_low, POLY_SWITCH_K)
        - poly_integral(&s.a_low, STANDARD_TEMPERATURE));
    if temperature < AL2O3_MELT_K {
        return Ok(to_switch
            + r * (poly_integral(&s.a_high, temperature)
                - poly_integral(&s.a_high, POLY_SWITCH_K)));
    }
    let alpha_to_melt = r * (poly_integral(&s.a_high, AL2O3_MELT_K)
        - poly_integral(&s.a_high, POLY_SWITCH_K));
    let liquid = r * AL2O3_LIQUID_CPR * (temperature - AL2O3_MELT_K);
    Ok(to_switch + alpha_to_melt + AL2O3_FUSION_J_PER_KMOL + liquid)
}

/// ∫cv dT from 298.15 K to T, J/kmol (cv = cp − R gases; cv ≈ cp condensed).
pub fn sensible_cv(species: &str, temperature: f64) -> Result<f64, String> {
    let h = sensible_enthalpy(species, temperature)?;
    let idx = species_index(species)
        .ok_or_else(|| format!("unknown species: {}", species))?;
    Ok(if TABLE[idx].condensed {
        h
    } else {
        h - R_UNIVERSAL * (temperature - STANDARD_TEMPERATURE)
    })
}

/* ------------------------------------------------------------------ *
 * Rigid-vessel flame balance + APCP preset                            *
 * ------------------------------------------------------------------ */

/// Documented representative equilibrium mixture for 70% AP / 18% Al /
/// 12% HTPB by mass (kmol per kg of propellant).
const APCP_MIXTURE: [(&str, f64); 10] = [
    ("H2O", 2.0),
    ("H2", 11.85358),
    ("CO", 8.388),
    ("CO2", 0.5),
    ("O2", 0.3),
    ("O", 1.836),
    ("H", 3.5),
    ("N2", 2.97897),
    ("HCl", 5.95794),
    ("Al2O3", 3.3358),
];

/// Rigid-vessel (constant-volume) adiabatic flame temperature of a
/// closed-form equilibrium mixture, K: Σ n_i·∫cv dT = −ΔU, solved by
/// bisection on [298.15, 6000] K (600 iterations, mirroring the oracle).
fn solve_flame(
    reactants: &[(&str, f64)],
    chamber_pressure: f64,
    feed_u: f64,
) -> Result<f64, String> {
    if !chamber_pressure.is_finite() || chamber_pressure <= 0.0 {
        return Err(format!(
            "equilibriumTemperature: chamber pressure must be finite and > 0, got {}",
            chamber_pressure
        ));
    }
    if reactants.is_empty() {
        return Err("equilibriumTemperature: empty reactants".to_string());
    }
    let mut product_u = 0.0;
    for (sp, moles) in reactants {
        if !moles.is_finite() || *moles <= 0.0 {
            return Err(format!(
                "equilibriumTemperature: moles must be finite and > 0 ({}: {})",
                sp, moles
            ));
        }
        let idx = species_index(sp)
            .ok_or_else(|| format!("unknown species: {}", sp))?;
        product_u +=
            moles * (TABLE[idx].formation_enthalpy
                - R_UNIVERSAL * STANDARD_TEMPERATURE * TABLE[idx].v_form_gas);
    }
    let delta_u = product_u - feed_u;
    let f = |t: f64| -> f64 {
        let mut sum = 0.0;
        for (sp, moles) in reactants {
            // The bracket keeps t inside the validated NASA-7 domain.
            sum += moles
                * sensible_cv(sp, t).expect("bisection bracket inside NASA-7 domain");
        }
        sum + delta_u
    };
    // The bracket is capped at 6000 K — the top of the NASA-7 high-range
    // validity; extrapolating beyond it corrupts the polynomial sign.
    let lo = STANDARD_TEMPERATURE;
    let hi = 6000.0;
    let f_lo = f(lo);
    let f_hi = f(hi);
    if f_lo == 0.0 {
        return Ok(lo);
    }
    if f_hi == 0.0 {
        return Ok(hi);
    }
    if f_lo * f_hi > 0.0 {
        return Err(format!(
            "equilibriumTemperature: no root in [298.15, 6000] K (ΔU = {} J)",
            delta_u
        ));
    }
    let mut a = lo;
    let mut b = hi;
    let mut fa = f_lo;
    for _ in 0..600 {
        let m = 0.5 * (a + b);
        let fm = f(m);
        if fm == 0.0 {
            return Ok(m);
        }
        if fa * fm < 0.0 {
            b = m;
        } else {
            a = m;
            fa = fm;
        }
    }
    Ok(0.5 * (a + b))
}

/// Rigid-vessel adiabatic flame temperature with the elements at 298.15 K
/// as the reference state (feedU = 0).
pub fn equilibrium_temperature(
    reactants: &[(&str, f64)],
    chamber_pressure: f64,
) -> Result<f64, String> {
    solve_flame(reactants, chamber_pressure, 0.0)
}

fn mixture_mol_weight(mixture: &[(&str, f64)]) -> f64 {
    let mut mass = 0.0;
    let mut moles = 0.0;
    for (sp, n) in mixture {
        let idx = species_index(sp).expect("mixture holds known species");
        mass += n * TABLE[idx].molecular_weight;
        moles += n;
    }
    mass / moles
}

fn mixture_gamma(mixture: &[(&str, f64)], temperature: f64) -> Result<f64, String> {
    let mut cp_r_sum = 0.0;
    let mut cv_r_sum = 0.0;
    let mut mass = 0.0;
    for (sp, n) in mixture {
        let idx = species_index(sp)
            .ok_or_else(|| format!("unknown species: {}", sp))?;
        let cp_r = cp_ratio(sp, temperature)?;
        cp_r_sum += n * cp_r;
        // cv = cp − R for gases; condensed phases have cv = cp (no −R term).
        cv_r_sum += n * (cp_r - if TABLE[idx].condensed { 0.0 } else { 1.0 });
        mass += n * TABLE[idx].molecular_weight;
    }
    let cp = R_UNIVERSAL * cp_r_sum / mass;
    let cv = R_UNIVERSAL * cv_r_sum / mass;
    if !(cv > 0.0) || !(cp > 0.0) {
        return Err(format!(
            "mixtureGamma: non-positive heat capacity at {} K",
            temperature
        ));
    }
    Ok(cp / cv)
}

/// Representative APCP chamber equilibrium (TS `ApcpEquilibrium`).
#[derive(Debug)]
pub struct ApcpEquilibrium {
    /// Adiabatic chamber temperature, K.
    pub tc: f64,
    /// Frozen-mixture cp/cv at Tc (incl. condensed Al2O3).
    pub gamma: f64,
    /// Mixture molar mass, kg/kmol.
    pub mol_weight: f64,
}

/// Representative APCP chamber equilibrium (70% AP / 18% Al / 12% HTPB),
/// recomputed from the documented mixture and feed energy via the
/// rigid-vessel balance.
pub fn solve_chamber(pressure: f64) -> Result<ApcpEquilibrium, String> {
    if !pressure.is_finite() || pressure <= 0.0 {
        return Err(format!(
            "apcpEquilibrium: chamber pressure must be finite and > 0, got {}",
            pressure
        ));
    }
    let tc = solve_flame(&APCP_MIXTURE, pressure, APCP_FEED_U_J)?;
    Ok(ApcpEquilibrium {
        tc,
        gamma: mixture_gamma(&APCP_MIXTURE, tc)?,
        mol_weight: mixture_mol_weight(&APCP_MIXTURE),
    })
}

/* ------------------------------------------------------------------ *
 * Frozen isentropic nozzle performance                                *
 * ------------------------------------------------------------------ */

/// Frozen-chemistry isentropic nozzle performance (TS `NozzlePerformance`).
#[derive(Debug)]
pub struct NozzlePerformance {
    /// Vacuum specific impulse, s (pa = 0).
    pub isp_vac: f64,
    /// Sea-level specific impulse, s (pa = 101325 Pa).
    pub isp_sea: f64,
    /// Characteristic velocity c*, m/s.
    pub cstar: f64,
    /// Vacuum thrust coefficient.
    pub cf_vac: f64,
    /// Sea-level thrust coefficient.
    pub cf_sea: f64,
    /// Exit-plane Mach number for the pressure ratio pc/pe.
    pub exit_mach: f64,
}

/// Frozen-chemistry isentropic nozzle performance from chamber, exit and
/// ambient pressures (all inputs SI: Pa, K, kg/kmol).
pub fn performance(
    tc: f64,
    gamma: f64,
    mol_weight: f64,
    pc: f64,
    pe: f64,
    pa: f64,
) -> Result<NozzlePerformance, String> {
    for (name, v) in [
        ("Tc", tc),
        ("gamma", gamma),
        ("molWeight", mol_weight),
        ("pc", pc),
        ("pe", pe),
    ] {
        if !v.is_finite() || v <= 0.0 {
            return Err(format!(
                "performance: {} must be finite and > 0, got {}",
                name, v
            ));
        }
    }
    // Ambient pressure may be zero (vacuum) but never negative/non-finite.
    if !pa.is_finite() || pa < 0.0 {
        return Err(format!(
            "performance: pa must be finite and ≥ 0, got {}",
            pa
        ));
    }
    if !(gamma > 1.0) {
        return Err(format!("performance: gamma must be > 1, got {}", gamma));
    }
    if !(pc > pe) {
        return Err(format!(
            "performance: requires pc > pe (choked flow), pc={}, pe={}",
            pc, pe
        ));
    }

    let gas_constant = R_UNIVERSAL / mol_weight;

    let exit_mach =
        (((pc / pe).powf((gamma - 1.0) / gamma) - 1.0) * 2.0 / (gamma - 1.0)).sqrt();

    let exp_term = (2.0 / (gamma + 1.0)).powf((gamma + 1.0) / (gamma - 1.0));
    let cstar = (gas_constant * tc).sqrt() / (gamma * exp_term).sqrt();

    let area_ratio = (1.0 / exit_mach)
        * ((2.0 / (gamma + 1.0))
            * (1.0 + (gamma - 1.0) / 2.0 * exit_mach * exit_mach))
            .powf((gamma + 1.0) / (2.0 * (gamma - 1.0)));

    let ideal_term = ((2.0 * gamma * gamma / (gamma - 1.0)) * exp_term
        * (1.0 - (pe / pc).powf((gamma - 1.0) / gamma)))
        .sqrt();

    let cf_vac = ideal_term + (pe / pc) * area_ratio;
    let cf_sea = ideal_term + ((pe - pa) / pc) * area_ratio;

    Ok(NozzlePerformance {
        isp_vac: cstar * cf_vac / G0,
        isp_sea: cstar * cf_sea / G0,
        cstar,
        cf_vac,
        cf_sea,
        exit_mach,
    })
}

/* ------------------------------------------------------------------ *
 * Gibbs equilibrium: entropy, g°/RT, Newton solver                    *
 * ------------------------------------------------------------------ */

/// Equilibrium molar amounts, kmol (one entry per requested species).
/// `converged` is always true on return — the solver fails closed (Err) on
/// non-convergence.
#[derive(Debug)]
pub struct EquilibriumResult {
    pub moles: HashMap<String, f64>,
    /// True on return — the solver fails closed on non-convergence.
    pub converged: bool,
    /// Newton iterations taken (+1 on the converging step, mirroring TS).
    pub iterations: usize,
}

/// ∫ a1/x + a2 + a3x + a4x² + a5x³ dx
/// = a1·lnx + a2x + a3x²/2 + a4x³/3 + a5x⁴/4.
fn entropy_poly_integral(a: &[f64; 5], t: f64) -> f64 {
    a[0] * t.ln() + a[1] * t + a[2] * (t * t) / 2.0 + a[3] * (t * t * t) / 3.0
        + a[4] * (t * t * t * t) / 4.0
}

/// Fit a7 so the NASA-7 entropy polynomial matches S°_298 at 298.15 K.
fn fit_a7(idx: usize, s298_per_r: f64) -> f64 {
    s298_per_r - entropy_poly_integral(&TABLE[idx].a_low, STANDARD_TEMPERATURE)
}

/// s°/R of a species at temperature T (K), from the NASA-7 entropy integral.
/// The low-range a7 is fitted to the tabulated S°_298; above 1000 K the
/// high-range polynomial is attached continuously. Condensed Al2O3 adds the
/// 2327 K fusion entropy and a liquid-cp ln term, consistent with
/// `sensible_enthalpy`.
pub fn entropy_integral(species: &str, temperature: f64) -> Result<f64, String> {
    if !temperature.is_finite() || temperature < STANDARD_TEMPERATURE {
        return Err(format!(
            "entropyIntegral: temperature must be finite and ≥ 298.15 K, got {}",
            temperature
        ));
    }
    let idx = species_index(species)
        .ok_or_else(|| format!("unknown species: {}", species))?;
    let s298_per_r = (standard_entropy(species) * 1000.0) / R_UNIVERSAL;
    if species == "Al2O3" {
        return Ok(al2o3_entropy_over_r(temperature, fit_a7(idx, s298_per_r)));
    }
    if temperature <= POLY_SWITCH_K {
        return Ok(entropy_poly_integral(&TABLE[idx].a_low, temperature)
            + fit_a7(idx, s298_per_r));
    }
    Ok(fit_a7(idx, s298_per_r)
        + entropy_poly_integral(&TABLE[idx].a_low, POLY_SWITCH_K)
        + (entropy_poly_integral(&TABLE[idx].a_high, temperature)
            - entropy_poly_integral(&TABLE[idx].a_high, POLY_SWITCH_K)))
}

fn al2o3_entropy_over_r(temperature: f64, a7: f64) -> f64 {
    let s = &TABLE[9];
    if temperature <= POLY_SWITCH_K {
        return entropy_poly_integral(&s.a_low, temperature) + a7;
    }
    let at_switch = entropy_poly_integral(&s.a_low, POLY_SWITCH_K) + a7;
    if temperature < AL2O3_MELT_K {
        return at_switch
            + (entropy_poly_integral(&s.a_high, temperature)
                - entropy_poly_integral(&s.a_high, POLY_SWITCH_K));
    }
    let at_melt = at_switch
        + (entropy_poly_integral(&s.a_high, AL2O3_MELT_K)
            - entropy_poly_integral(&s.a_high, POLY_SWITCH_K));
    let fusion_entropy = AL2O3_FUSION_J_PER_KMOL / AL2O3_MELT_K / R_UNIVERSAL; // ΔS_fusion/R
    at_melt + fusion_entropy + AL2O3_LIQUID_CPR * (temperature / AL2O3_MELT_K).ln()
}

/// g°(T)/RT = h°(T)/(RT) − s°(T)/R, with h° = ΔfH°(298) + ∫cp dT.
fn g_over_rt(idx: usize, name: &str, temperature: f64) -> Result<f64, String> {
    let h = TABLE[idx].formation_enthalpy + sensible_enthalpy(name, temperature)?;
    Ok(h / (R_UNIVERSAL * temperature) - entropy_integral(name, temperature)?)
}

/// Format like JS `Number.prototype.toExponential(3)` (used in solver error
/// strings): 3 fraction digits, exponent with explicit sign, no padding.
fn js_exp3(v: f64) -> String {
    let s = format!("{:.3e}", v);
    match s.find('e') {
        Some(i) => {
            let (mant, exp) = s.split_at(i + 1);
            if exp.starts_with('-') || exp.starts_with('+') {
                s
            } else {
                format!("{}+{}", mant, exp)
            }
        }
        None => s,
    }
}

/// Levenberg–Marquardt regularization: tiny relative to the Jacobian scale
/// so full-rank problems take pure Gauss–Newton steps, but non-zero so
/// rank-deficient Jacobians still yield a finite descent direction.
fn damper_for(jac: &[Vec<f64>]) -> f64 {
    let mut scale = 0.0;
    for row in jac {
        for v in row {
            let av = v.abs();
            if av > scale {
                scale = av;
            }
        }
    }
    1e-12 * (1.0 + scale * scale)
}

/// Solve A·x = rhs by Gaussian elimination with partial pivoting; columns
/// without an acceptable pivot (rank deficiency) take x = 0.
fn solve_linear(a: &[Vec<f64>], rhs: &[f64]) -> Vec<f64> {
    let n = a.len();
    if n == 0 {
        return Vec::new();
    }
    let mut aug: Vec<Vec<f64>> = a
        .iter()
        .enumerate()
        .map(|(i, row)| {
            let mut r = row.clone();
            r.push(rhs[i]);
            r
        })
        .collect();
    let mut max0: f64 = 0.0;
    for row in &aug {
        for j in 0..n {
            max0 = max0.max(row[j].abs());
        }
    }
    let eps = 1e-13 * 1.0f64.max(max0);
    let mut pivot_row = vec![usize::MAX; n];
    let mut rank = 0usize;
    let mut col = 0usize;
    while col < n && rank < n {
        let mut p: Option<usize> = None;
        let mut best = 0.0;
        for i in rank..n {
            let v = aug[i][col].abs();
            if v > best {
                best = v;
                p = Some(i);
            }
        }
        match p {
            Some(pi) if best >= eps => {
                aug.swap(pi, rank);
                let piv = aug[rank][col];
                for i in (rank + 1)..n {
                    let factor = aug[i][col] / piv;
                    if factor == 0.0 {
                        continue;
                    }
                    for j in col..=n {
                        aug[i][j] -= factor * aug[rank][j];
                    }
                }
                pivot_row[rank] = col;
                rank += 1;
            }
            _ => {} // column is (numerically) dependent
        }
        col += 1;
    }
    let mut x = vec![0.0; n];
    for r in (0..rank).rev() {
        let c = pivot_row[r];
        let mut s = aug[r][n];
        for j in (c + 1)..n {
            s -= aug[r][j] * x[j];
        }
        x[c] = s / aug[r][c];
    }
    x
}

/// Element lookup with a 0.0 default for elements absent from the feed
/// (mirrors TS `elements['Al'] ?? 0`).
fn feed_pop(elements: &[(&str, f64)], name: &str) -> f64 {
    elements
        .iter()
        .find(|(e, _)| *e == name)
        .map(|(_, v)| *v)
        .unwrap_or(0.0)
}

/// Solve the element-balanced Gibbs minimum of an ideal-gas mixture at
/// fixed temperature and pressure (NASA CEA element-potential method).
/// `elements` maps element symbols to kmol of that element in the feed;
/// `species` selects which equilibrium species may form. Fails closed with
/// an Err on invalid inputs, non-convergence, or any non-finite iterate.
pub fn solve_equilibrium(
    elements: &[(&str, f64)],
    species: &[&str],
    temperature: f64,
    pressure: f64,
) -> Result<EquilibriumResult, String> {
    if !temperature.is_finite() || temperature < STANDARD_TEMPERATURE {
        return Err(format!(
            "solveEquilibrium: temperature must be finite and ≥ 298.15 K, got {}",
            temperature
        ));
    }
    if !pressure.is_finite() || pressure <= 0.0 {
        return Err(format!(
            "solveEquilibrium: pressure must be finite and > 0 Pa, got {}",
            pressure
        ));
    }
    if elements.is_empty() {
        return Err(
            "solveEquilibrium: degenerate input — no elements supplied".to_string(),
        );
    }
    for (el, v) in elements {
        if !v.is_finite() || *v < 0.0 || !(*v >= 0.0) {
            return Err(format!(
                "solveEquilibrium: element {} population must be finite and ≥ 0, got {}",
                el, v
            ));
        }
    }
    if species.is_empty() {
        return Err("solveEquilibrium: species list is empty".to_string());
    }
    for sp in species {
        if species_index(sp).is_none() {
            return Err(format!("solveEquilibrium: unknown species {}", sp));
        }
    }

    let m = elements.len(); // number of element constraints
    let gas_species: Vec<&str> = species.iter().copied().filter(|s| *s != "Al2O3").collect();
    let wants_al2o3 = species.contains(&"Al2O3");
    let condensed_active =
        wants_al2o3 && feed_pop(elements, "Al") > 0.0 && feed_pop(elements, "O") > 0.0;

    // Degenerate limit: only condensed Al2O3 can form. The phase amount is
    // fixed by the Al balance alone; the O balance closes only if the feed
    // is stoichiometric — otherwise the problem is infeasible (fail closed).
    if gas_species.is_empty() {
        if !condensed_active {
            return Err(
                "solveEquilibrium: condensed-only mixture with Al2O3 requires Al and O in the feed"
                    .to_string(),
            );
        }
        let nc_only = feed_pop(elements, "Al") / 2.0;
        let o_residual = 3.0 * nc_only - feed_pop(elements, "O");
        if o_residual.abs() > 1e-9 * 1.0f64.max(feed_pop(elements, "O")) {
            return Err(format!(
                "solveEquilibrium: condensed-only feed violates the O balance \
                 (Al/2 = {} kmol Al2O3 leaves {} kmol O unbalanced) — infeasible",
                nc_only,
                js_exp3(o_residual)
            ));
        }
        let mut moles = HashMap::new();
        for sp in species {
            moles.insert(
                sp.to_string(),
                if *sp == "Al2O3" { nc_only } else { 0.0 },
            );
        }
        return Ok(EquilibriumResult {
            moles,
            converged: true,
            iterations: 0,
        });
    }
    let dim = m + 1 + if condensed_active { 1 } else { 0 }; // (λ_M, y) [+ n_c]

    let a: Vec<Vec<f64>> = gas_species
        .iter()
        .map(|sp| {
            elements
                .iter()
                .map(|(el, _)| stoich(sp, el))
                .collect()
        })
        .collect();
    let ac: Vec<f64> = elements
        .iter()
        .map(|(el, _)| stoich("Al2O3", el))
        .collect();
    let b: Vec<f64> = elements.iter().map(|(_, v)| *v).collect();

    // Per-species fugacity factor A_i = (P°/P)·exp(−g_i°/RT).
    let p0_over_p = STANDARD_PRESSURE / pressure;
    let mut gas_activity = Vec::with_capacity(gas_species.len());
    for sp in &gas_species {
        let idx = species_index(sp).expect("species validated above");
        gas_activity.push((-g_over_rt(idx, sp, temperature)?).exp() * p0_over_p);
    }
    let condensed_g = if condensed_active {
        g_over_rt(9, "Al2O3", temperature)?
    } else {
        0.0
    };

    // Initial guess: least-squares fit of λ so n_i ≈ element-consistent
    // targets t_i (CEA-style composition seeding), y = ln N₀.
    let n0 = 1.0f64.max(b.iter().sum::<f64>() / 2.0);
    let y0 = n0.ln();
    let total_gas_atoms: Vec<f64> = (0..m)
        .map(|j| (0..gas_species.len()).map(|i| a[i][j]).sum())
        .collect();
    let targets: Vec<f64> = (0..gas_species.len())
        .map(|i| {
            let mut t = 0.0;
            for j in 0..m {
                if a[i][j] > 0.0 && b[j] > 0.0 && total_gas_atoms[j] > 0.0 {
                    t += (b[j] / 2.0) * (a[i][j] / total_gas_atoms[j]);
                }
            }
            t
        })
        .collect();

    let mut lambda = vec![0.0; m];
    {
        // Normal equations (AᵀA)λ = Aᵀr over active species (t_i > 0).
        let mut rows: Vec<(Vec<f64>, f64)> = Vec::new();
        for i in 0..gas_species.len() {
            if targets[i] > 0.0 {
                rows.push((
                    a[i].clone(),
                    y0 + gas_activity[i].ln() - targets[i].ln(),
                ));
            }
        }
        if !rows.is_empty() {
            let mut ata = vec![vec![0.0; m]; m];
            let mut atr = vec![0.0; m];
            for (av, rhs) in &rows {
                for j in 0..m {
                    atr[j] += av[j] * rhs;
                    for k in 0..m {
                        ata[j][k] += av[j] * av[k];
                    }
                }
            }
            lambda = solve_linear(&ata, &atr); // skipped (rank-deficient) potentials stay 0
        }
    }
    let mut lam = lambda;
    let mut yy = y0;
    let mut nc = if condensed_active {
        0.0f64.max(feed_pop(elements, "Al") / 2.0)
    } else {
        0.0
    };

    let gas_moles = |lam: &[f64], yy: f64| -> Vec<f64> {
        gas_activity
            .iter()
            .enumerate()
            .map(|(i, act)| {
                let mut dot = 0.0;
                for j in 0..m {
                    dot += a[i][j] * lam[j];
                }
                yy.exp() * act * (-dot).exp()
            })
            .collect()
    };

    let evaluate = |lam: &[f64], yy: f64, n_cond: f64| -> (Vec<f64>, Vec<f64>) {
        let n = gas_moles(lam, yy);
        let mut r = vec![0.0; dim];
        for j in 0..m {
            let mut s = 0.0;
            for i in 0..gas_species.len() {
                s += a[i][j] * n[i];
            }
            if condensed_active {
                s += ac[j] * n_cond;
            }
            r[j] = s - b[j];
        }
        r[m] = n.iter().sum::<f64>() - yy.exp();
        if condensed_active {
            let mut dot = 0.0;
            for j in 0..m {
                dot += ac[j] * lam[j];
            }
            r[m + 1] = condensed_g + dot;
        }
        (n, r)
    };

    let residual_norm2 = |r: &[f64]| -> f64 {
        let mut s = 0.0;
        for v in r {
            s += v * v;
        }
        s
    };

    let converged = |r: &[f64], n: &[f64]| -> bool {
        for j in 0..m {
            if r[j].abs() > REL_TOL * 1.0f64.max(b[j].abs()) {
                return false;
            }
        }
        let n_sum: f64 = n.iter().sum();
        if r[m].abs() > REL_TOL * 1.0f64.max(n_sum) {
            return false;
        }
        if condensed_active && r[m + 1].abs() > ABS_TOL {
            return false;
        }
        true
    };

    let mut iterations = 0usize;
    loop {
        if iterations >= MAX_ITERATIONS {
            return Err(format!(
                "solveEquilibrium: failed to converge within {} iterations",
                MAX_ITERATIONS
            ));
        }
        let (n, r) = evaluate(&lam, yy, nc);
        if converged(&r, &n) {
            let mut moles = HashMap::new();
            for sp in species {
                if *sp == "Al2O3" {
                    moles.insert(sp.to_string(), if condensed_active { nc } else { 0.0 });
                } else {
                    let pos = gas_species
                        .iter()
                        .position(|g| *g == *sp)
                        .expect("gas species from requested list");
                    moles.insert(sp.to_string(), n[pos]);
                }
            }
            return Ok(EquilibriumResult {
                moles,
                converged: true,
                iterations: iterations + 1,
            });
        }
        for v in r
            .iter()
            .chain(n.iter())
            .chain(lam.iter())
            .chain([yy, nc].iter())
        {
            if !v.is_finite() {
                return Err(format!(
                    "solveEquilibrium: non-finite iterate after {} iterations",
                    iterations
                ));
            }
        }

        // Jacobian of the residuals wrt (λ, y [, n_c]).
        let mut jac = vec![vec![0.0; dim]; dim];
        for j in 0..m {
            for k in 0..m {
                let mut s = 0.0;
                for i in 0..gas_species.len() {
                    s += a[i][j] * a[i][k] * n[i];
                }
                jac[j][k] = -s;
            }
            jac[j][m] = n
                .iter()
                .enumerate()
                .map(|(i, v)| a[i][j] * v)
                .sum::<f64>();
            if condensed_active {
                jac[j][m + 1] = ac[j];
            }
        }
        for k in 0..m {
            let mut s = 0.0;
            for i in 0..gas_species.len() {
                s += a[i][k] * n[i];
            }
            jac[m][k] = -s;
        }
        // ∂(Σn − N)/∂y = Σn − N = r_N (N = exp y; both terms differentiate).
        jac[m][m] = n.iter().sum::<f64>() - yy.exp();
        if condensed_active {
            jac[m][m + 1] = 0.0;
        }
        if condensed_active {
            for k in 0..m {
                jac[m + 1][k] = ac[k];
            }
            jac[m + 1][m] = 0.0;
            jac[m + 1][m + 1] = 0.0;
        }

        // Levenberg–Marquardt damped Gauss–Newton step: solve
        // (JᵀJ + μI)δ = −Jᵀr, then backtrack on ‖r‖².
        let mu = damper_for(&jac);
        let mut jtj = vec![vec![0.0; dim]; dim];
        for j in 0..dim {
            for k in 0..dim {
                let mut s = 0.0;
                for i in 0..dim {
                    s += jac[i][j] * jac[i][k];
                }
                jtj[j][k] = s + if j == k { mu } else { 0.0 };
            }
        }
        let mut jtr = vec![0.0; dim];
        for j in 0..dim {
            for i in 0..dim {
                jtr[j] += jac[i][j] * r[i];
            }
            jtr[j] = -jtr[j];
        }
        let delta = solve_linear(&jtj, &jtr);

        let mut cur = residual_norm2(&r);
        let mut improved = false;
        let mut alpha = 1.0;
        for _ in 0..40 {
            if improved {
                break;
            }
            let cand_lam: Vec<f64> = lam
                .iter()
                .enumerate()
                .map(|(j, v)| v + alpha * delta[j])
                .collect();
            let cand_y = yy + alpha * delta[m];
            let cand_nc = if condensed_active {
                0.0f64.max(nc + alpha * delta[m + 1])
            } else {
                0.0
            };
            let (cn, cr) = evaluate(&cand_lam, cand_y, cand_nc);
            // NB: mirrors the oracle quirk — a non-finite entry halves
            // alpha but the scan continues over the remaining entries and
            // the (non-finite) candidate norm is still compared below, so
            // the step is rejected by the `cand < cur` test as well.
            for v in cr
                .iter()
                .chain(cn.iter())
                .chain(cand_lam.iter())
                .chain([cand_y, cand_nc].iter())
            {
                if !v.is_finite() {
                    alpha *= 0.5;
                }
            }
            let cand = residual_norm2(&cr);
            if cand < cur {
                lam = cand_lam;
                yy = cand_y;
                nc = cand_nc;
                cur = cand;
                improved = true;
            } else {
                alpha *= 0.5;
            }
        }
        if !improved {
            return Err(format!(
                "solveEquilibrium: no descent step found after {} iterations \
                 (residual ‖r‖² = {}) — problem may be infeasible",
                iterations + 1,
                js_exp3(cur)
            ));
        }
        iterations += 1;
    }
}

/* ------------------------------------------------------------------ *
 * Parity tests vs the TS oracle                                       *
 * ------------------------------------------------------------------ */

#[cfg(test)]
mod tests {
    use super::*;

    const APCP_ELEMENTS: [(&str, f64); 6] = [
        ("H", 37.165),
        ("O", 23.831),
        ("C", 8.889),
        ("N", 5.958),
        ("Cl", 5.958),
        ("Al", 6.672),
    ];
    const APCP_SPECIES: [&str; 10] = [
        "H2O", "CO2", "CO", "N2", "HCl", "Al2O3", "H2", "O2", "O", "H",
    ];

    fn assert_rel(a: f64, b: f64, tol: f64, what: &str) {
        let d = (a - b).abs();
        let scale = 1.0f64.max(b.abs());
        assert!(
            d <= tol * scale,
            "{}: got {}, want {} (rel dev {})",
            what,
            a,
            b,
            d / scale
        );
    }

    fn element_residual(elements: &[(&str, f64)], r: &EquilibriumResult) -> f64 {
        let mut worst: f64 = 0.0;
        for (el, pop) in elements {
            let mut s = 0.0;
            for (sp, n) in &r.moles {
                s += stoich(sp, el) * n;
            }
            let rel = (s - pop).abs() / 1.0f64.max(pop.abs());
            worst = worst.max(rel);
        }
        worst
    }

    #[test]
    fn apcp_chamber_anchors_match_ts_oracle() {
        // Anchors extracted from the TS oracle via node.
        let eq = solve_chamber(APCP_REFERENCE_PRESSURE).expect("APCP solves");
        assert_rel(eq.tc, 3522.814668872915, 1e-9, "Tc");
        assert_rel(eq.gamma, 1.1817718046095134, 1e-9, "gamma");
        assert_rel(eq.mol_weight, 24.60469503516949, 1e-9, "molWeight");
    }

    #[test]
    fn apcp_chamber_inside_acceptance_bands() {
        let eq = solve_chamber(APCP_REFERENCE_PRESSURE).expect("APCP solves");
        assert!(eq.tc > 2800.0 && eq.tc < 3600.0, "Tc {}", eq.tc);
        assert!(eq.gamma > 1.15 && eq.gamma < 1.25, "gamma {}", eq.gamma);
        assert!(
            eq.mol_weight > 18.0 && eq.mol_weight < 30.0,
            "MW {}",
            eq.mol_weight
        );
        // ±5% performance bands around the corrected-model anchors.
        let sea = performance(eq.tc, eq.gamma, eq.mol_weight, 1e7, 101_325.0, 101_325.0)
            .expect("perf");
        let vac =
            performance(eq.tc, eq.gamma, eq.mol_weight, 1e7, 101_325.0, 0.0).expect("perf");
        assert!((vac.cstar - 1691.67).abs() < 0.05 * 1691.67, "c* {}", vac.cstar);
        assert!(
            (sea.isp_sea - 285.53).abs() < 0.05 * 285.53,
            "ispSea {}",
            sea.isp_sea
        );
        assert!(
            (vac.isp_vac - 306.93).abs() < 0.05 * 306.93,
            "ispVac {}",
            vac.isp_vac
        );
        assert!(vac.cf_vac > sea.cf_sea);
    }

    #[test]
    fn performance_anchor_matches_ts_oracle() {
        let p = performance(3000.0, 1.35, 24.6048, 1e7, 1e5, 101_325.0).expect("perf");
        assert_rel(p.cstar, 1489.1143187043374, 1e-9, "cstar");
        assert_rel(p.exit_mach, 3.625335287844056, 1e-9, "exitMach");
        assert_rel(p.cf_vac, 1.6561796829344495, 1e-9, "cfVac");
        assert_rel(p.cf_sea, 1.5666469067221975, 1e-9, "cfSea");
        assert_rel(p.isp_vac, 251.48658106538912, 1e-9, "ispVac");
        assert_rel(p.isp_sea, 237.89126165957623, 1e-9, "ispSea");
    }

    #[test]
    fn performance_identities_hold() {
        let eq = solve_chamber(APCP_REFERENCE_PRESSURE).expect("APCP solves");
        let p = performance(eq.tc, eq.gamma, eq.mol_weight, 1e7, 101_325.0, 0.0)
            .expect("perf");
        assert_rel(p.isp_vac, p.cstar * p.cf_vac / G0, 1e-12, "ispVac identity");
        assert_rel(p.isp_sea, p.cstar * p.cf_sea / G0, 1e-12, "ispSea identity");
        assert!(p.exit_mach > 1.0);
    }

    #[test]
    fn cp_ratio_anchors_match_ts_oracle() {
        assert_rel(cp_ratio("H2O", 300.0).unwrap(), 4.040724336337, 1e-9, "cp H2O@300");
        assert!(cp_ratio("Al2O3", 300.0).unwrap() > 0.0);
        for t in [300.0, 999.0, 1000.0, 1001.0, 3000.0] {
            for sp in ["H2O", "CO2", "CO", "N2", "HCl", "H2", "O2"] {
                assert!(cp_ratio(sp, t).unwrap() > 0.5, "{} @ {}", sp, t);
            }
        }
    }

    #[test]
    fn sensible_enthalpy_al2o3_piecewise_matches_oracle() {
        // TS anchors (J/kmol) extracted via node.
        assert_rel(
            sensible_enthalpy("Al2O3", 1500.0).unwrap(),
            142390904.69580224,
            1e-9,
            "hAl@1500",
        );
        assert_rel(
            sensible_enthalpy("Al2O3", 1000.0).unwrap(),
            77961970.65613069,
            1e-9,
            "hAl@1000",
        );
        assert_rel(
            sensible_enthalpy("Al2O3", 2327.0).unwrap(),
            365844994.1366803,
            1e-9,
            "hAl@2327",
        );
        assert_rel(
            sensible_enthalpy("Al2O3", 3000.0).unwrap(),
            495374063.28532827,
            1e-9,
            "hAl@3000",
        );
        // Near-continuous across the 1000 K poly switch (fit mismatch only).
        let h0 = sensible_enthalpy("Al2O3", 1000.0).unwrap();
        let h1 = sensible_enthalpy("Al2O3", 1000.0 + 1e-6).unwrap();
        assert!((h1 - h0).abs() < 1.0, "switch jump {}", (h1 - h0).abs());
        // Monotone through the melt into the liquid.
        assert!(sensible_enthalpy("Al2O3", 2327.0).unwrap() > h0);
        assert!(
            sensible_enthalpy("Al2O3", 3000.0).unwrap()
                > sensible_enthalpy("Al2O3", 2327.0).unwrap()
        );
        // Liquid branch slope = R·cpr.
        let h_a = sensible_enthalpy("Al2O3", 3000.0).unwrap();
        let h_b = sensible_enthalpy("Al2O3", 4000.0).unwrap();
        assert_rel(
            (h_b - h_a) / 1000.0,
            R_UNIVERSAL * AL2O3_LIQUID_CPR,
            1e-9,
            "liquid slope",
        );
        // Condensed cv == sensible enthalpy; gas cv subtracts R·ΔT.
        assert_rel(
            sensible_cv("Al2O3", 1500.0).unwrap(),
            sensible_enthalpy("Al2O3", 1500.0).unwrap(),
            1e-12,
            "condensed cv",
        );
        assert_rel(
            sensible_cv("N2", 1500.0).unwrap(),
            sensible_enthalpy("N2", 1500.0).unwrap() - R_UNIVERSAL * (1500.0 - 298.15),
            1e-12,
            "gas cv",
        );
    }

    #[test]
    fn rigid_vessel_reference_and_exothermic_cases() {
        // Elemental reference state releases nothing → 298.15 K.
        let t = equilibrium_temperature(&[("N2", 1.0)], APCP_REFERENCE_PRESSURE).unwrap();
        assert!((t - STANDARD_TEMPERATURE).abs() < 1e-6, "t {}", t);
        // CO formation from elemental stock releases ≈111 kJ/mol.
        let t_co = equilibrium_temperature(&[("CO", 1.0)], APCP_REFERENCE_PRESSURE).unwrap();
        assert!(t_co > 3000.0 && t_co < 6000.0, "t_co {}", t_co);
    }

    #[test]
    fn entropy_integral_reproduces_s298_for_all_species() {
        // The a7 fit is exact at 298.15 K by construction.
        for (sp, s298) in [
            ("H2O", 188.835),
            ("H2", 130.680),
            ("CO2", 213.795),
            ("CO", 197.660),
            ("N2", 191.609),
            ("HCl", 186.902),
            ("O2", 205.152),
            ("O", 161.059),
            ("H", 114.716),
            ("Al2O3", 50.92),
        ] {
            let s = entropy_integral(sp, STANDARD_TEMPERATURE).unwrap() * R_UNIVERSAL / 1000.0;
            assert!((s - s298).abs() < 1e-9, "{}: {} vs {}", sp, s, s298);
        }
        // Off-reference anchors (s°/R units) from the TS oracle via node.
        assert_rel(
            entropy_integral("H2O", 1500.0).unwrap(),
            30.15127971142053,
            1e-9,
            "s H2O@1500",
        );
        assert_rel(
            entropy_integral("Al2O3", 1500.0).unwrap(),
            27.939638905499038,
            1e-9,
            "s Al2O3@1500",
        );
        assert_rel(
            entropy_integral("Al2O3", 3000.0).unwrap(),
            46.72511676995592,
            1e-9,
            "s Al2O3@3000",
        );
    }

    #[test]
    fn apcp_gibbs_solve_matches_ts_anchors() {
        let r = solve_equilibrium(&APCP_ELEMENTS, &APCP_SPECIES, 3500.0, 1e7).expect("APCP");
        assert!(r.converged);
        assert!(r.iterations < 100, "iters {}", r.iterations);
        for (sp, want) in [
            ("H2O", 4.482317818090945),
            ("CO2", 0.43353991505817785),
            ("CO", 8.455460084941837),
            ("N2", 2.9790000000000045),
            ("HCl", 5.957999999999977),
            ("Al2O3", 3.3359999999999994),
            ("H2", 10.558110434690159),
            ("O2", 0.0022334399402383948),
            ("O", 0.013675386970397265),
            ("H", 1.1261434944377353),
        ] {
            assert_rel(r.moles[sp], want, 1e-6, sp);
        }
        // Element closure: all Al → Al2O3(l), all Cl → HCl, all N → N2.
        assert_rel(r.moles["Al2O3"], 6.672 / 2.0, 1e-9, "Al closure");
        assert_rel(r.moles["HCl"], 5.958, 1e-9, "Cl closure");
        assert_rel(r.moles["N2"], 5.958 / 2.0, 1e-9, "N closure");
        assert_rel(r.moles["CO"] + r.moles["CO2"], 8.889, 1e-9, "C closure");
        // Majors dominate (>90% by mole); radicals stay minor.
        let total: f64 = r.moles.values().sum();
        let majors: f64 = ["H2O", "H2", "CO", "N2", "HCl", "Al2O3"]
            .iter()
            .map(|s| r.moles[*s])
            .sum();
        assert!(majors / total > 0.9, "majors share {}", majors / total);
        assert!(r.moles["O2"] / total < 0.05);
        assert!(r.moles["O"] / total < 0.05);
        assert!(r.moles["CO2"] / total < 0.05);
        assert!(element_residual(&APCP_ELEMENTS, &r) < 1e-9);
    }

    #[test]
    fn mass_balance_and_pressure_sweep() {
        let h2o: [(&str, f64); 2] = [("H", 2.0), ("O", 1.0)];
        let sp = ["H2O", "H2", "O2", "O", "H"];
        let r = solve_equilibrium(&h2o, &sp, 2500.0, 1e5).expect("H2O");
        assert!(element_residual(&h2o, &r) < 1e-9);
        // TS-anchored dissociation state.
        for (s, want) in [
            ("H2O", 0.956922910926072),
            ("H2", 0.04049927076001497),
            ("O2", 0.02048180582258489),
            ("O", 0.002113477428763028),
            ("H", 0.00515563662783508),
        ] {
            assert_rel(r.moles[s], want, 1e-6, s);
        }
        for p in [1e2, 1e5, 5e7] {
            let r = solve_equilibrium(&h2o, &sp, 3000.0, p).expect("sweep");
            assert!(element_residual(&h2o, &r) < 1e-9, "p {}", p);
        }
    }

    #[test]
    fn pure_substance_limits() {
        let r = solve_equilibrium(&[("H", 2.0), ("O", 1.0)], &["H2O"], 1000.0, 1e5).unwrap();
        assert_rel(r.moles["H2O"], 1.0, 1e-9, "pure H2O");
        let r = solve_equilibrium(&[("C", 1.0), ("O", 2.0)], &["CO2"], 2000.0, 1e5).unwrap();
        assert_rel(r.moles["CO2"], 1.0, 1e-9, "pure CO2");
        let r = solve_equilibrium(&[("N", 2.0)], &["N2"], 1000.0, 1e5).unwrap();
        assert_rel(r.moles["N2"], 1.0, 1e-9, "pure N2");
        let r = solve_equilibrium(&[("H", 2.0)], &["H2"], 1000.0, 1e5).unwrap();
        assert_rel(r.moles["H2"], 1.0, 1e-9, "pure H2");
        // Condensed-only closed form: exact stoichiometry returns unit amount.
        let r = solve_equilibrium(&[("Al", 2.0), ("O", 3.0)], &["Al2O3"], 3500.0, 1e7).unwrap();
        assert!(r.converged);
        assert_eq!(r.iterations, 0);
        assert_rel(r.moles["Al2O3"], 1.0, 1e-9, "pure Al2O3");
    }

    #[test]
    fn solver_fails_closed() {
        // Infeasible feeds (element with no consuming species).
        assert!(solve_equilibrium(&[("Fe", 1.0)], &["H2"], 1500.0, 1e5).is_err());
        assert!(solve_equilibrium(&[("C", 1.0)], &["N2", "H2O"], 1500.0, 1e5).is_err());
        // Condensed-only feed violating the O balance.
        let e = solve_equilibrium(&[("Al", 1.0), ("O", 3.0)], &["Al2O3"], 3500.0, 1e7)
            .expect_err("O imbalance");
        assert!(
            e.contains("condensed-only feed violates the O balance"),
            "msg: {}",
            e
        );
        // Condensed-only without Al/O in the feed.
        assert!(solve_equilibrium(&[("H", 2.0)], &["Al2O3"], 3500.0, 1e7).is_err());
        // Degenerate / invalid inputs with TS-equivalent messages.
        assert_eq!(
            solve_equilibrium(&[], &["H2"], 1500.0, 1e5).unwrap_err(),
            "solveEquilibrium: degenerate input — no elements supplied"
        );
        assert_eq!(
            solve_equilibrium(&[("H", 2.0)], &[], 1500.0, 1e5).unwrap_err(),
            "solveEquilibrium: species list is empty"
        );
        assert_eq!(
            solve_equilibrium(&[("H", 2.0)], &["Bogus"], 1500.0, 1e5).unwrap_err(),
            "solveEquilibrium: unknown species Bogus"
        );
        for bad_t in [0.0, 200.0, f64::NAN, f64::INFINITY] {
            let e = solve_equilibrium(&[("H", 2.0)], &["H2"], bad_t, 1e5).unwrap_err();
            assert!(e.contains("temperature must be finite and ≥ 298.15 K"), "msg: {}", e);
        }
        for bad_p in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            let e = solve_equilibrium(&[("H", 2.0)], &["H2"], 1500.0, bad_p).unwrap_err();
            assert!(e.contains("pressure must be finite and > 0 Pa"), "msg: {}", e);
        }
        let e = solve_equilibrium(&[("H", f64::NAN)], &["H2"], 1500.0, 1e5).unwrap_err();
        assert!(e.contains("population must be finite and ≥ 0"), "msg: {}", e);
        // Thermo + flame + chamber + performance validators.
        assert_eq!(
            cp_ratio("N2", 0.0).unwrap_err(),
            "cpRatio: temperature must be finite and positive, got 0"
        );
        assert_eq!(
            sensible_enthalpy("H2O", 200.0).unwrap_err(),
            "sensibleEnthalpy: temperature must be finite and ≥ 298.15 K, got 200"
        );
        assert_eq!(
            entropy_integral("H2O", 200.0).unwrap_err(),
            "entropyIntegral: temperature must be finite and ≥ 298.15 K, got 200"
        );
        assert!(equilibrium_temperature(&[], 1e7).is_err());
        assert!(equilibrium_temperature(&[("N2", 1.0)], 0.0).is_err());
        assert!(solve_chamber(f64::NAN).is_err());
        assert!(solve_chamber(-1.0).is_err());
        assert_eq!(
            performance(3000.0, 1.0, 24.6, 1e7, 1e5, 101_325.0).unwrap_err(),
            "performance: gamma must be > 1, got 1"
        );
        assert_eq!(
            performance(3000.0, 1.35, 24.6, 2e5, 2e5, 0.0).unwrap_err(),
            "performance: requires pc > pe (choked flow), pc=200000, pe=200000"
        );
        assert!(performance(3000.0, 1.35, 24.6, 1e7, 1e5, -1.0).is_err());
    }

    #[test]
    fn linear_solver_rank_deficiency_yields_zero() {
        // Full-rank identity.
        let x = solve_linear(
            &[vec![2.0, 1.0], vec![1.0, 3.0]],
            &[5.0, 7.0],
        );
        assert_rel(x[0], 1.6, 1e-12, "x0");
        assert_rel(x[1], 1.8, 1e-12, "x1");
        // Rank-deficient: dependent column takes x = 0.
        let x = solve_linear(&[vec![1.0, 1.0], vec![1.0, 1.0]], &[2.0, 2.0]);
        assert_rel(x[0], 2.0, 1e-12, "rank x0");
        assert_eq!(x[1], 0.0);
        // Empty system.
        assert!(solve_linear(&[], &[]).is_empty());
    }

    #[test]
    fn damper_scale_matches_oracle() {
        assert_rel(damper_for(&[vec![3.0, 0.0], vec![0.0, 4.0]]), 1e-12 * 17.0, 1e-9, "mu");
        assert_rel(damper_for(&[vec![0.0]]), 1e-12, 1e-9, "mu0");
    }

    /* ----- CEA corpus regression (scripts/cea-corpus.json) ----- */

    #[derive(Debug)]
    enum Json {
        Null,
        Bool(bool),
        Num(f64),
        Str(String),
        Arr(Vec<Json>),
        Obj(Vec<(String, Json)>),
    }

    impl Json {
        fn get(&self, key: &str) -> &Json {
            match self {
                Json::Obj(pairs) => pairs
                    .iter()
                    .find(|(k, _)| k == key)
                    .map(|(_, v)| v)
                    .unwrap_or(&Json::Null),
                _ => &Json::Null,
            }
        }
        fn num(&self) -> f64 {
            match self {
                Json::Num(v) => *v,
                _ => panic!("expected number, got {:?}", self),
            }
        }
        fn arr(&self) -> &Vec<Json> {
            match self {
                Json::Arr(v) => v,
                _ => panic!("expected array, got {:?}", self),
            }
        }
        fn obj(&self) -> &Vec<(String, Json)> {
            match self {
                Json::Obj(v) => v,
                _ => panic!("expected object, got {:?}", self),
            }
        }
    }

    struct CorpusParser {
        chars: Vec<char>,
        pos: usize,
    }

    impl CorpusParser {
        fn parse(text: &str) -> Json {
            let mut p = CorpusParser {
                chars: text.chars().collect(),
                pos: 0,
            };
            let v = p.value();
            p.ws();
            assert!(p.pos == p.chars.len(), "trailing JSON content");
            v
        }
        fn ws(&mut self) {
            while self.pos < self.chars.len() && self.chars[self.pos].is_whitespace() {
                self.pos += 1;
            }
        }
        fn peek(&self) -> char {
            self.chars[self.pos]
        }
        fn value(&mut self) -> Json {
            self.ws();
            match self.peek() {
                '{' => self.object(),
                '[' => self.array(),
                '"' => Json::Str(self.string()),
                't' => {
                    self.lit("true");
                    Json::Bool(true)
                }
                'f' => {
                    self.lit("false");
                    Json::Bool(false)
                }
                'n' => {
                    self.lit("null");
                    Json::Null
                }
                _ => Json::Num(self.number()),
            }
        }
        fn lit(&mut self, s: &str) {
            for c in s.chars() {
                assert_eq!(self.chars[self.pos], c);
                self.pos += 1;
            }
        }
        fn object(&mut self) -> Json {
            self.pos += 1; // {
            let mut pairs = Vec::new();
            self.ws();
            if self.peek() == '}' {
                self.pos += 1;
                return Json::Obj(pairs);
            }
            loop {
                self.ws();
                let k = self.string();
                self.ws();
                assert_eq!(self.chars[self.pos], ':');
                self.pos += 1;
                let v = self.value();
                pairs.push((k, v));
                self.ws();
                match self.chars[self.pos] {
                    ',' => {
                        self.pos += 1;
                    }
                    '}' => {
                        self.pos += 1;
                        break;
                    }
                    c => panic!("unexpected object char {}", c),
                }
            }
            Json::Obj(pairs)
        }
        fn array(&mut self) -> Json {
            self.pos += 1; // [
            let mut items = Vec::new();
            self.ws();
            if self.peek() == ']' {
                self.pos += 1;
                return Json::Arr(items);
            }
            loop {
                items.push(self.value());
                self.ws();
                match self.chars[self.pos] {
                    ',' => {
                        self.pos += 1;
                    }
                    ']' => {
                        self.pos += 1;
                        break;
                    }
                    c => panic!("unexpected array char {}", c),
                }
            }
            Json::Arr(items)
        }
        fn string(&mut self) -> String {
            assert_eq!(self.chars[self.pos], '"');
            self.pos += 1;
            let mut out = String::new();
            loop {
                let c = self.chars[self.pos];
                self.pos += 1;
                match c {
                    '"' => break,
                    '\\' => {
                        let e = self.chars[self.pos];
                        self.pos += 1;
                        match e {
                            '"' => out.push('"'),
                            '\\' => out.push('\\'),
                            '/' => out.push('/'),
                            'b' => out.push('\u{0008}'),
                            'f' => out.push('\u{000C}'),
                            'n' => out.push('\n'),
                            'r' => out.push('\r'),
                            't' => out.push('\t'),
                            'u' => {
                                let h: String =
                                    self.chars[self.pos..self.pos + 4].iter().collect();
                                self.pos += 4;
                                let cp = u32::from_str_radix(&h, 16).expect("hex escape");
                                out.push(char::from_u32(cp).expect("scalar"));
                            }
                            _ => panic!("bad escape {}", e),
                        }
                    }
                    _ => out.push(c),
                }
            }
            out
        }
        fn number(&mut self) -> f64 {
            let start = self.pos;
            while self.pos < self.chars.len()
                && matches!(
                    self.chars[self.pos],
                    '-' | '+' | '0'..='9' | '.' | 'e' | 'E'
                )
            {
                self.pos += 1;
            }
            self.chars[start..self.pos]
                .iter()
                .collect::<String>()
                .parse()
                .expect("number")
        }
    }

    fn cea_name(name: &str) -> &str {
        match name {
            "HCL" => "HCl",
            "AL2O3" => "Al2O3",
            _ => name,
        }
    }

    #[test]
    fn cea_corpus_within_bands_on_every_case() {
        let root = CorpusParser::parse(include_str!("../../../scripts/cea-corpus.json"));
        let cases = root.get("cases").arr();
        assert!(cases.len() >= 60, "corpus has {} cases", cases.len());
        let mut max_abs = 0.0;
        let mut max_abs_at = String::new();
        let mut max_rel = 0.0;
        let mut max_rel_at = String::new();
        for c in cases {
            // Exact element feeds (kmol per kg propellant): AP NH4ClO4
            // MW 117.49, HTPB C4H6 MW 54.092, Al 26.9815 — same
            // stoichiometry the CEA cases ran (mirrors the TS suite).
            let n_ap = (c.get("ap").num() / 117.49) * 1000.0;
            let n_ht = (c.get("htpb").num() / 54.092) * 1000.0;
            let n_al = (c.get("al").num() / 26.9815) * 1000.0;
            let feed = [
                ("H", 4.0 * n_ap + 6.0 * n_ht),
                ("O", 4.0 * n_ap),
                ("C", 4.0 * n_ht),
                ("N", n_ap),
                ("Cl", n_ap),
                ("Al", n_al),
            ];
            let r = solve_equilibrium(
                &feed,
                &APCP_SPECIES,
                c.get("T_K").num(),
                c.get("pc_bar").num() * 1e5,
            )
            .unwrap_or_else(|e| panic!("case {:?} failed: {}", c.get("T_K"), e));
            assert!(r.converged);
            let total: f64 = r.moles.values().sum();
            for (cea_key, frac) in c.get("mole_fractions").obj() {
                let sp = cea_name(cea_key);
                let dev = (r.moles[sp] / total - frac.num()).abs();
                if dev > max_abs {
                    max_abs = dev;
                    max_abs_at = format!("{} @ T={}K", cea_key, c.get("T_K").num());
                }
                assert!(
                    dev < 0.01,
                    "case T={}K pc={}bar species {} dev {}",
                    c.get("T_K").num(),
                    c.get("pc_bar").num(),
                    cea_key,
                    dev
                );
            }
            let mut mass = 0.0;
            for (sp, n) in &r.moles {
                mass += n * TABLE[species_index(sp).unwrap()].molecular_weight;
            }
            let mw = mass / total;
            let rel = (mw - c.get("MW").num()).abs() / c.get("MW").num();
            if rel > max_rel {
                max_rel = rel;
                max_rel_at = format!("T={}K", c.get("T_K").num());
            }
            assert!(
                rel < 0.005,
                "case T={}K MW rel dev {}",
                c.get("T_K").num(),
                rel
            );
        }
        // Pinned for the module-header validation record.
        println!(
            "cea-corpus: {} cases, max |Δx| = {:.5} ({}), max MW rel = {:.5} ({})",
            cases.len(),
            max_abs,
            max_abs_at,
            max_rel,
            max_rel_at
        );
        assert!(max_abs < 0.01 && max_rel < 0.005);
    }
}
