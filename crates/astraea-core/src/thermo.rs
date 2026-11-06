//! NASA Glenn thermodynamic database (NASA-9 polynomials) — the species data
//! NASA CEA uses.
//!
//! Data: `data/thermo-propellant.inp`, a verbatim subset of CEA's `thermo.inp`
//! (McBride, Zehe & Gordon, NASA/TP-2002-211556) restricted to
//! propellant-relevant elements, ions dropped. Regenerate with
//! `scripts/build-thermo-subset.py`.
//!
//! Per species and temperature interval (NASA/TP-2002-211556 eqs. 2–4):
//! - cp/R = a1 T⁻² + a2 T⁻¹ + a3 + a4 T + a5 T² + a6 T³ + a7 T⁴
//! - H°/RT = −a1 T⁻² + a2 ln T / T + a3 + a4 T/2 + a5 T²/3 + a6 T³/4 + a7 T⁴/5 + b1/T
//! - S°/R = −a1 T⁻²/2 − a2 T⁻¹ + a3 ln T + a4 T + a5 T²/2 + a6 T³/3 + a7 T⁴/4 + b2
//!
//! H° is the absolute enthalpy (formation enthalpy at 298.15 K included);
//! the standard state is 1 bar.

use std::sync::OnceLock;

const RAW: &str = include_str!("../data/thermo-propellant.inp");

/// Universal gas constant, J/(kmol·K) (CEA value).
pub const R: f64 = 8_314.51;
/// Standard-state pressure of the database, Pa (1 bar).
pub const P_STANDARD: f64 = 100_000.0;

#[derive(Debug, Clone)]
pub struct Interval {
    pub t_min: f64,
    pub t_max: f64,
    pub a: [f64; 7],
    pub b1: f64,
    pub b2: f64,
}

#[derive(Debug, Clone)]
pub struct Species {
    pub name: String,
    /// Element symbols (upper case, e.g. "AL", "CL") with atom counts.
    pub elements: Vec<(String, f64)>,
    /// True for condensed (solid or liquid) phases.
    pub condensed: bool,
    /// Molecular weight, kg/kmol.
    pub mol_weight: f64,
    /// Heat of formation at 298.15 K, J/mol.
    pub hf298: f64,
    /// Polynomial intervals, sorted by temperature. Empty for reactant-only
    /// records that carry an assigned enthalpy but no fit.
    pub intervals: Vec<Interval>,
    /// True for records from the REACTANTS section (never a product).
    pub reactant_only: bool,
}

impl Species {
    fn interval(&self, t: f64) -> &Interval {
        let iv = &self.intervals;
        if t <= iv[0].t_min {
            return &iv[0];
        }
        iv.iter().find(|i| t <= i.t_max).unwrap_or(&iv[iv.len() - 1])
    }

    /// cp/R at T.
    pub fn cp_r(&self, t: f64) -> f64 {
        let a = &self.interval(t).a;
        a[0] / (t * t) + a[1] / t + a[2] + t * (a[3] + t * (a[4] + t * (a[5] + t * a[6])))
    }

    /// H°/RT at T.
    pub fn h_rt(&self, t: f64) -> f64 {
        let i = self.interval(t);
        let a = &i.a;
        -a[0] / (t * t)
            + a[1] * t.ln() / t
            + a[2]
            + t * (a[3] / 2.0 + t * (a[4] / 3.0 + t * (a[5] / 4.0 + t * a[6] / 5.0)))
            + i.b1 / t
    }

    /// S°/R at T (1 bar).
    pub fn s_r(&self, t: f64) -> f64 {
        let i = self.interval(t);
        let a = &i.a;
        -a[0] / (2.0 * t * t) - a[1] / t
            + a[2] * t.ln()
            + t * (a[3] + t * (a[4] / 2.0 + t * (a[5] / 3.0 + t * a[6] / 4.0)))
            + i.b2
    }

    /// Temperature range covered by the fits, K.
    pub fn t_range(&self) -> (f64, f64) {
        (self.intervals[0].t_min, self.intervals[self.intervals.len() - 1].t_max)
    }

    /// Atoms of `element` (upper case) per molecule.
    pub fn count(&self, element: &str) -> f64 {
        self.elements
            .iter()
            .find(|(e, _)| e == element)
            .map(|(_, c)| *c)
            .unwrap_or(0.0)
    }
}

/// Standard atomic weights used by CEA (kg/kmol), upper-case symbols.
pub fn atomic_weight(element: &str) -> Option<f64> {
    Some(match element {
        "H" => 1.00794,
        "B" => 10.811,
        "C" => 12.0107,
        "N" => 14.0067,
        "O" => 15.9994,
        "F" => 18.9984032,
        "LI" => 6.941,
        "NA" => 22.989770,
        "MG" => 24.3050,
        "AL" => 26.981538,
        "S" => 32.065,
        "CL" => 35.453,
        "K" => 39.0983,
        "CA" => 40.078,
        "TI" => 47.867,
        "FE" => 55.845,
        "CU" => 63.546,
        "ZN" => 65.39,
        "SR" => 87.62,
        "BA" => 137.327,
        _ => return None,
    })
}

fn field(line: &str, from: usize, to: usize) -> &str {
    let end = to.min(line.len());
    if from >= end {
        ""
    } else {
        line[from..end].trim()
    }
}

fn num(s: &str) -> Result<f64, String> {
    if s.is_empty() {
        return Ok(0.0);
    }
    s.replace(['D', 'd'], "E")
        .parse::<f64>()
        .map_err(|e| format!("thermo: bad number '{}': {}", s, e))
}

fn parse(raw: &str) -> Result<Vec<Species>, String> {
    let lines: Vec<&str> = raw.lines().collect();
    let start = lines
        .iter()
        .position(|l| l.starts_with("thermo"))
        .ok_or("thermo: missing 'thermo' header")?
        + 2;
    let mut out = Vec::new();
    let mut reactants = false;
    let mut i = start;
    while i < lines.len() {
        let line = lines[i];
        if line.starts_with("END PRODUCTS") {
            reactants = true;
            i += 1;
            continue;
        }
        if line.starts_with("END REACTANTS") {
            break;
        }
        if line.starts_with('!') || line.trim().is_empty() {
            i += 1;
            continue;
        }
        let name = line.split_whitespace().next().unwrap_or("").to_string();
        let head = lines.get(i + 1).ok_or("thermo: truncated record")?;
        let n_int = num(field(head, 0, 2))? as usize;
        let mut elements = Vec::new();
        for k in 0..5 {
            let sym = field(head, 10 + 8 * k, 12 + 8 * k).to_uppercase();
            let cnt = num(field(head, 12 + 8 * k, 18 + 8 * k))?;
            if !sym.is_empty() && cnt != 0.0 {
                elements.push((sym, cnt));
            }
        }
        let condensed = num(field(head, 50, 52))? != 0.0;
        let mol_weight = num(field(head, 52, 65))?;
        let hf298 = num(field(head, 65, 80))?;
        let mut intervals = Vec::with_capacity(n_int);
        for k in 0..n_int {
            let base = i + 2 + 3 * k;
            let (tl, c1, c2) = (
                lines.get(base).ok_or("thermo: truncated interval")?,
                lines.get(base + 1).ok_or("thermo: truncated interval")?,
                lines.get(base + 2).ok_or("thermo: truncated interval")?,
            );
            let exps = field(tl, 23, 63);
            if !exps.starts_with("-2.0 -1.0  0.0  1.0  2.0  3.0  4.0") {
                return Err(format!("thermo: {} has non-standard exponents", name));
            }
            let mut a = [0.0; 7];
            for (j, slot) in a.iter_mut().enumerate().take(5) {
                *slot = num(field(c1, 16 * j, 16 * j + 16))?;
            }
            a[5] = num(field(c2, 0, 16))?;
            a[6] = num(field(c2, 16, 32))?;
            intervals.push(Interval {
                t_min: num(field(tl, 0, 11))?,
                t_max: num(field(tl, 11, 22))?,
                a,
                b1: num(field(c2, 48, 64))?,
                b2: num(field(c2, 64, 80))?,
            });
        }
        i += 2 + if n_int > 0 { 3 * n_int } else { 1 };
        out.push(Species {
            name,
            elements,
            condensed,
            mol_weight,
            hf298,
            intervals,
            reactant_only: reactants,
        });
    }
    Ok(out)
}

/// The parsed database (parsed once on first use).
pub fn database() -> &'static [Species] {
    static DB: OnceLock<Vec<Species>> = OnceLock::new();
    DB.get_or_init(|| parse(RAW).expect("embedded thermo database parses"))
}

/// Product species (gas and condensed with fits) built only from `elements`.
pub fn products_for(elements: &[String]) -> Vec<usize> {
    database()
        .iter()
        .enumerate()
        .filter(|(_, s)| {
            !s.reactant_only
                && !s.intervals.is_empty()
                && s.elements.iter().all(|(e, _)| elements.iter().any(|x| x == e))
        })
        .map(|(i, _)| i)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn find(name: &str) -> &'static Species {
        database().iter().find(|s| s.name == name).unwrap()
    }

    #[test]
    fn parses_whole_subset() {
        let db = database();
        assert!(db.len() > 900, "species parsed: {}", db.len());
        assert!(db.iter().any(|s| s.reactant_only));
        for s in db {
            assert!(s.mol_weight > 0.0, "{}", s.name);
            assert!(!s.elements.is_empty(), "{}", s.name);
        }
    }

    #[test]
    fn enthalpy_at_298_equals_heat_of_formation() {
        // H°(298.15)/R·T must reproduce the tabulated ΔHf (J/mol).
        for name in ["H2O", "CO2", "KCL(cr)", "AL2O3(a)", "N2", "KOH"] {
            let s = find(name);
            let h = s.h_rt(298.15) * R * 298.15 / 1000.0;
            assert!((h - s.hf298).abs() < 5.0, "{}: {} vs {}", name, h, s.hf298);
        }
    }

    #[test]
    fn known_values() {
        // JANAF: H2O(g) cp(1000 K) = 41.268 J/mol/K, S°(298.15) = 188.834.
        let w = find("H2O");
        assert!((w.cp_r(1000.0) * R / 1000.0 - 41.268).abs() < 0.05);
        assert!((w.s_r(298.15) * R / 1000.0 - 188.834).abs() < 0.05);
        let k = find("KNO3(a)");
        assert!(k.condensed);
        assert!((k.mol_weight - 101.1032).abs() < 1e-4);
    }

    #[test]
    fn molecular_weights_match_atomic_weights() {
        for s in database().iter().filter(|s| !s.reactant_only) {
            let mw: f64 = s
                .elements
                .iter()
                .map(|(e, c)| atomic_weight(e).unwrap() * c)
                .sum();
            assert!((mw - s.mol_weight).abs() / s.mol_weight < 1e-4, "{}", s.name);
        }
    }
}
