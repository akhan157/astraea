//! Propellant recipes and theoretical rocket performance (the ProPEP / CEA
//! "rocket" problem), built on [`crate::equilibrium`].
//!
//! Model (NASA RP-1311 Part I ch. 6, infinite-area combustor):
//! - Chamber: adiabatic equilibrium at the chamber pressure with the
//!   reactants' enthalpy (HP).
//! - Expansion is isentropic. "Equilibrium" (shifting) re-equilibrates at
//!   each pressure (SP); "frozen" keeps the chamber composition.
//! - Throat: the pressure where flow velocity equals the sound speed.
//! - Exit: a given exit pressure or a given area ratio Ae/At.
//! - u = √(2(h_c − h)); c* = Pc/(ρ_t u_t); Ae/At = ρ_t u_t/(ρ_e u_e);
//!   Ivac = u_e + p_e/(ρ_e u_e); Isp at ambient p_a = u_e + (p_e − p_a)/(ρ_e u_e).
//!   No two-phase velocity lag or nozzle losses (same as CEA).
//!
//! Validated against NASA CEA (2002 Glenn code via RocketCEA) on the corpus
//! in `scripts/cea-propellant-corpus.json`.

use crate::equilibrium::{equilibrate, Constraint, Feed, State};
use crate::thermo::{atomic_weight, database, P_STANDARD, R};

/// Standard gravity, m/s² (Isp in seconds = velocity / G0).
pub const G0: f64 = 9.80665;

/// A propellant ingredient (reactant).
#[derive(Debug, Clone, PartialEq)]
pub struct Ingredient {
    pub id: String,
    pub name: String,
    /// Element symbols (any case) and atoms per formula unit.
    pub formula: Vec<(String, f64)>,
    /// Heat of formation at 298.15 K, J/mol.
    pub hf_j_per_mol: f64,
    /// Density, kg/m³.
    pub density: f64,
    /// Where the numbers come from.
    pub source: String,
}

impl Ingredient {
    /// Molecular weight, kg/kmol.
    pub fn mol_weight(&self) -> Result<f64, String> {
        let mut mw = 0.0;
        for (e, c) in &self.formula {
            let w = atomic_weight(&e.to_uppercase())
                .ok_or_else(|| format!("ingredient {}: unsupported element {}", self.id, e))?;
            if !(c.is_finite() && *c >= 0.0) {
                return Err(format!("ingredient {}: bad atom count for {}", self.id, e));
            }
            mw += w * c;
        }
        if mw <= 0.0 {
            return Err(format!("ingredient {}: empty formula", self.id));
        }
        Ok(mw)
    }
}

fn ing(
    id: &str,
    name: &str,
    formula: &[(&str, f64)],
    hf: f64,
    density: f64,
    source: &str,
) -> Ingredient {
    Ingredient {
        id: id.into(),
        name: name.into(),
        formula: formula.iter().map(|(e, c)| (e.to_string(), *c)).collect(),
        hf_j_per_mol: hf,
        density,
        source: source.into(),
    }
}

/// Built-in ingredient table. Heats of formation come from the NASA CEA
/// database where CEA has the species; the others are literature values.
pub fn ingredient_library() -> Vec<Ingredient> {
    const CEA: &str = "NASA CEA thermo.inp";
    vec![
        ing("ammonium_perchlorate", "Ammonium perchlorate (AP)",
            &[("N", 1.0), ("H", 4.0), ("Cl", 1.0), ("O", 4.0)], -295_767.0, 1950.0,
            "Hf: NASA CEA thermo.inp NH4CLO4(I) (Chase 1998)"),
        ing("potassium_nitrate", "Potassium nitrate (KN)",
            &[("K", 1.0), ("N", 1.0), ("O", 3.0)], -494_000.0, 2109.0,
            "Hf: NASA CEA thermo.inp KNO3(a) (Gurvich 1982)"),
        ing("ammonium_nitrate", "Ammonium nitrate (AN)",
            &[("N", 2.0), ("H", 4.0), ("O", 3.0)], -365_600.0, 1725.0,
            "Hf: NASA CEA thermo.inp NH4NO3(IV) (Gurvich 1989)"),
        ing("potassium_perchlorate", "Potassium perchlorate",
            &[("K", 1.0), ("Cl", 1.0), ("O", 4.0)], -432_750.0, 2520.0,
            "Hf: NIST Chemistry WebBook (solid); not in CEA thermo.inp"),
        ing("aluminum", "Aluminum", &[("Al", 1.0)], 0.0, 2700.0, CEA),
        ing("magnesium", "Magnesium", &[("Mg", 1.0)], 0.0, 1738.0, CEA),
        ing("sulfur", "Sulfur", &[("S", 1.0)], 0.0, 2070.0, CEA),
        ing("iron_oxide", "Iron(III) oxide (catalyst)",
            &[("Fe", 2.0), ("O", 3.0)], -824_248.0, 5240.0,
            "Hf: NASA CEA thermo.inp Fe2O3(cr) (Pankratz 1983)"),
        ing("htpb", "HTPB R-45 (cured binder)",
            &[("C", 7.3165), ("H", 10.3360), ("O", 0.1063)], 5_020.8, 922.0,
            "RocketCEA card R-45 (HTPB from RPL data), 1200 cal/mol"),
        ing("sorbitol", "Sorbitol",
            &[("C", 6.0), ("H", 14.0), ("O", 6.0)], -1_353_700.0, 1489.0,
            "Hf: literature value used for KNSB (R. Nakka)"),
        ing("dextrose", "Dextrose (anhydrous glucose)",
            &[("C", 6.0), ("H", 12.0), ("O", 6.0)], -1_273_300.0, 1540.0,
            "Hf: NIST Chemistry WebBook (alpha-D-glucose, solid)"),
        ing("sucrose", "Sucrose",
            &[("C", 12.0), ("H", 22.0), ("O", 11.0)], -2_226_100.0, 1587.0,
            "Hf: NIST Chemistry WebBook (solid)"),
    ]
}

/// One line of a recipe. Fractions are by mass and are normalized, so grams
/// or percentages both work.
#[derive(Debug, Clone)]
pub struct RecipeItem {
    pub ingredient: Ingredient,
    pub mass: f64,
}

/// Elemental feed, reactant enthalpy (J/kg) and ideal mixture density.
pub fn recipe_feed(recipe: &[RecipeItem]) -> Result<(Feed, f64, f64), String> {
    if recipe.is_empty() {
        return Err("recipe: no ingredients".into());
    }
    let total: f64 = recipe.iter().map(|r| r.mass).sum();
    if recipe.iter().any(|r| !(r.mass.is_finite() && r.mass >= 0.0)) || total <= 0.0 {
        return Err("recipe: masses must be finite, ≥ 0 and not all zero".into());
    }
    let mut elements: Vec<String> = Vec::new();
    let mut b0: Vec<f64> = Vec::new();
    let (mut h0, mut inv_rho) = (0.0, 0.0);
    for r in recipe {
        let w = r.mass / total;
        if w == 0.0 {
            continue;
        }
        let i = &r.ingredient;
        if !(i.hf_j_per_mol.is_finite() && i.density.is_finite() && i.density > 0.0) {
            return Err(format!("ingredient {}: bad heat of formation or density", i.id));
        }
        let mw = i.mol_weight()?;
        for (e, c) in &i.formula {
            let e = e.to_uppercase();
            let k = match elements.iter().position(|x| *x == e) {
                Some(k) => k,
                None => {
                    elements.push(e);
                    b0.push(0.0);
                    elements.len() - 1
                }
            };
            b0[k] += w * c / mw;
        }
        h0 += w * i.hf_j_per_mol * 1000.0 / mw;
        inv_rho += w / i.density;
    }
    Ok((Feed { elements, b0 }, h0, 1.0 / inv_rho))
}

/// How the nozzle exit is specified.
#[derive(Debug, Clone, Copy)]
pub enum Exit {
    /// Exit pressure, Pa.
    Pressure(f64),
    /// Exit-to-throat area ratio.
    AreaRatio(f64),
}

/// Thermodynamic state at one nozzle station.
#[derive(Debug, Clone)]
pub struct Station {
    pub pressure: f64,
    pub temperature: f64,
    /// CEA "M" = 1/n (gas moles per kg), kg/kmol.
    pub m: f64,
    /// Isentropic exponent: γs (equilibrium) or frozen γ.
    pub gamma: f64,
    /// cp, J/(kg·K) (equilibrium or frozen to match `gamma`).
    pub cp: f64,
    pub sound_speed: f64,
    pub velocity: f64,
    pub mach: f64,
    pub density: f64,
    pub area_ratio: f64,
}

#[derive(Debug, Clone)]
pub struct Performance {
    pub chamber: Station,
    pub throat: Station,
    pub exit: Station,
    /// Characteristic velocity, m/s.
    pub cstar: f64,
    /// Thrust coefficient at optimum expansion (p_a = p_e).
    pub cf: f64,
    pub cf_vac: f64,
    /// Isp at optimum expansion, s.
    pub isp: f64,
    pub isp_vac: f64,
    /// Isp at the given ambient pressure, s.
    pub isp_ambient: f64,
    pub cf_ambient: f64,
}

#[derive(Debug, Clone)]
pub struct PropellantResult {
    /// Ideal mixture density, kg/m³.
    pub density: f64,
    /// Reactant enthalpy, J/kg.
    pub enthalpy: f64,
    /// Shifting-equilibrium expansion.
    pub equilibrium: Performance,
    /// Composition frozen at the chamber.
    pub frozen: Performance,
    /// Chamber mole fractions ≥ 1e-5 (CEA convention), largest first.
    pub chamber_species: Vec<(String, f64)>,
    /// Exit mole fractions ≥ 1e-5 (shifting equilibrium).
    pub exit_species: Vec<(String, f64)>,
}

/// A point along the frozen expansion.
struct FrozenPoint {
    t: f64,
    h: f64,
    cp: f64,
    gamma: f64,
    n: f64,
}

/// Frozen-composition state with entropy `s0` at pressure `p`.
fn frozen_at(ch: &State, p: f64, s0: f64) -> Result<FrozenPoint, String> {
    let db = database();
    let n: f64 = ch.n_gas;
    let lnp = (p / P_STANDARD).ln();
    let props = |t: f64| {
        let (mut h, mut s, mut cp) = (0.0, 0.0, 0.0);
        for &(j, nj) in &ch.moles {
            let sp = &db[j];
            h += nj * sp.h_rt(t);
            cp += nj * sp.cp_r(t);
            s += nj
                * if sp.condensed {
                    sp.s_r(t)
                } else {
                    sp.s_r(t) - (nj / n).ln() - lnp
                };
        }
        (h * R * t, s * R, cp * R)
    };
    let mut t = ch.temperature;
    for _ in 0..100 {
        let (_, s, cp) = props(t);
        let d = ((s0 - s) / cp).clamp(-0.5, 0.5);
        t *= d.exp();
        if !t.is_finite() || t < 50.0 {
            return Err("frozen expansion: temperature left the valid range".into());
        }
        if d.abs() < 1e-10 {
            let (h, _, cp) = props(t);
            return Ok(FrozenPoint { t, h, cp, gamma: cp / (cp - n * R), n });
        }
    }
    Err("frozen expansion: did not converge".into())
}

/// Thermodynamic point on an expansion.
struct Point {
    t: f64,
    h: f64,
    m: f64,
    gamma: f64,
    cp: f64,
    sound_speed: f64,
    density: f64,
}

/// Common station for either expansion model.
trait Expansion {
    fn at(&mut self, p: f64) -> Result<Point, String>;
}

struct Shifting<'a> {
    feed: &'a Feed,
    s0: f64,
    last: State,
}

impl Expansion for Shifting<'_> {
    fn at(&mut self, p: f64) -> Result<Point, String> {
        let st = equilibrate(self.feed, p, Constraint::Entropy(self.s0), Some(&self.last))?;
        let out = Point {
            t: st.temperature,
            h: st.enthalpy,
            m: st.m(),
            gamma: st.gamma_s,
            cp: st.cp_eq,
            sound_speed: st.sound_speed(),
            density: st.density(),
        };
        self.last = st;
        Ok(out)
    }
}

struct Frozen<'a> {
    chamber: &'a State,
}

impl Expansion for Frozen<'_> {
    fn at(&mut self, p: f64) -> Result<Point, String> {
        let f = frozen_at(self.chamber, p, self.chamber.entropy)?;
        Ok(Point {
            t: f.t,
            h: f.h,
            m: 1.0 / f.n,
            gamma: f.gamma,
            cp: f.cp,
            sound_speed: (f.n * R * f.t * f.gamma).sqrt(),
            density: p / (f.n * R * f.t),
        })
    }
}

fn station<E: Expansion>(e: &mut E, h_c: f64, p: f64) -> Result<Station, String> {
    let pt = e.at(p)?;
    let u = (2.0 * (h_c - pt.h)).max(0.0).sqrt();
    Ok(Station {
        pressure: p,
        temperature: pt.t,
        m: pt.m,
        gamma: pt.gamma,
        cp: pt.cp,
        sound_speed: pt.sound_speed,
        velocity: u,
        mach: u / pt.sound_speed,
        density: pt.density,
        area_ratio: f64::NAN,
    })
}

fn expand<E: Expansion>(
    e: &mut E,
    chamber: Station,
    h_c: f64,
    exit: Exit,
    p_ambient: f64,
) -> Result<Performance, String> {
    let pc = chamber.pressure;
    // Throat: iterate Pc/Pt with p(1 + γM²) ≈ const near M = 1 (CEA §6.3).
    let g = chamber.gamma;
    let mut ratio = ((g + 1.0) / 2.0).powf(g / (g - 1.0));
    let mut throat = station(e, h_c, pc / ratio)?;
    for _ in 0..50 {
        let m2 = throat.mach * throat.mach;
        if (m2 - 1.0).abs() < 1e-7 {
            break;
        }
        ratio *= (1.0 + throat.gamma) / (1.0 + throat.gamma * m2);
        throat = station(e, h_c, pc / ratio)?;
    }
    if (throat.mach - 1.0).abs() > 1e-4 {
        // The sonic point can fall on a phase transition (e.g. K2CO3 melting
        // at 1173 K), where the sound speed jumps and M = 1 is never hit
        // (CEA reports "discontinuity at the throat"). Fall back to the
        // general definition: the throat is where mass flux ρu peaks.
        let flux = |e: &mut E, lnp: f64| -> Result<(f64, Station), String> {
            let st = station(e, h_c, lnp.exp())?;
            Ok((st.density * st.velocity, st))
        };
        let (mut a, mut b) = ((pc / 4.0).ln(), (pc / 1.05).ln());
        let gr = 0.5 * (5.0_f64.sqrt() - 1.0);
        let (mut x1, mut x2) = (b - gr * (b - a), a + gr * (b - a));
        let (mut f1, mut f2) = (flux(e, x1)?.0, flux(e, x2)?.0);
        for _ in 0..60 {
            if f1 > f2 {
                b = x2;
                x2 = x1;
                f2 = f1;
                x1 = b - gr * (b - a);
                f1 = flux(e, x1)?.0;
            } else {
                a = x1;
                x1 = x2;
                f1 = f2;
                x2 = a + gr * (b - a);
                f2 = flux(e, x2)?.0;
            }
        }
        throat = flux(e, 0.5 * (a + b))?.1;
        if !(throat.mach > 0.5 && throat.mach < 2.0) {
            return Err("rocket: throat (maximum mass flux) not found".into());
        }
    }
    let mass_flux_t = throat.density * throat.velocity;
    throat.area_ratio = 1.0;

    let mut ex = match exit {
        Exit::Pressure(pe) => {
            if !(pe.is_finite() && pe > 0.0 && pe < throat.pressure) {
                return Err(format!(
                    "rocket: exit pressure must be between 0 and the throat pressure ({:.0} Pa)",
                    throat.pressure
                ));
            }
            station(e, h_c, pe)?
        }
        Exit::AreaRatio(eps) => {
            if !(eps.is_finite() && eps > 1.0 && eps < 1e4) {
                return Err("rocket: area ratio must be > 1".into());
            }
            // Bisection on ln p over the supersonic branch.
            let (mut lo, mut hi) = ((pc * 1e-7).ln(), throat.pressure.ln());
            let mut st = station(e, h_c, ((lo + hi) / 2.0).exp())?;
            for _ in 0..80 {
                let p = ((lo + hi) / 2.0).exp();
                st = station(e, h_c, p)?;
                let ar = mass_flux_t / (st.density * st.velocity);
                if ar > eps {
                    lo = p.ln();
                } else {
                    hi = p.ln();
                }
                if (ar / eps - 1.0).abs() < 1e-9 {
                    break;
                }
            }
            st
        }
    };
    ex.area_ratio = mass_flux_t / (ex.density * ex.velocity);
    let cstar = pc / mass_flux_t;
    let ue = ex.velocity;
    let pa_term = |pa: f64| (ex.pressure - pa) / (ex.density * ue);
    let isp_vac_v = ue + pa_term(0.0);
    let isp_amb_v = ue + pa_term(p_ambient);
    Ok(Performance {
        cstar,
        cf: ue / cstar,
        cf_vac: isp_vac_v / cstar,
        cf_ambient: isp_amb_v / cstar,
        isp: ue / G0,
        isp_vac: isp_vac_v / G0,
        isp_ambient: isp_amb_v / G0,
        chamber,
        throat,
        exit: ex,
    })
}

fn chamber_station(st: &State, frozen: bool) -> Station {
    let (gamma, cp, a) = if frozen {
        (st.gamma_frozen, st.cp_frozen, st.sound_speed_frozen())
    } else {
        (st.gamma_s, st.cp_eq, st.sound_speed())
    };
    Station {
        pressure: st.pressure,
        temperature: st.temperature,
        m: st.m(),
        gamma,
        cp,
        sound_speed: a,
        velocity: 0.0,
        mach: 0.0,
        density: st.density(),
        area_ratio: f64::INFINITY,
    }
}

fn significant(x: Vec<(String, f64)>) -> Vec<(String, f64)> {
    x.into_iter().filter(|(_, v)| *v >= 1e-5).collect()
}

/// Theoretical performance of `recipe` at chamber pressure `pc` (Pa).
pub fn rocket_performance(
    recipe: &[RecipeItem],
    pc: f64,
    exit: Exit,
    p_ambient: f64,
) -> Result<PropellantResult, String> {
    if !(pc.is_finite() && pc > 0.0) {
        return Err("rocket: chamber pressure must be > 0 Pa".into());
    }
    if !(p_ambient.is_finite() && p_ambient >= 0.0) {
        return Err("rocket: ambient pressure must be ≥ 0 Pa".into());
    }
    let (feed, h0, density) = recipe_feed(recipe)?;
    let ch = equilibrate(&feed, pc, Constraint::Enthalpy(h0), None).map_err(|e| {
        format!("chamber: {e} (check the recipe: it may be too far from a burnable mix)")
    })?;
    let h_c = ch.enthalpy;

    let mut shifting = Shifting { feed: &feed, s0: ch.entropy, last: ch.clone() };
    let equilibrium = expand(&mut shifting, chamber_station(&ch, false), h_c, exit, p_ambient)?;
    let exit_species = significant(shifting.last.mole_fractions());
    let mut fz = Frozen { chamber: &ch };
    let frozen = expand(&mut fz, chamber_station(&ch, true), h_c, exit, p_ambient)?;
    Ok(PropellantResult {
        density,
        enthalpy: h0,
        equilibrium,
        frozen,
        chamber_species: significant(ch.mole_fractions()),
        exit_species,
    })
}

/// Look up a built-in ingredient by id.
pub fn ingredient(id: &str) -> Option<Ingredient> {
    ingredient_library().into_iter().find(|i| i.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn recipe(items: &[(&str, f64)]) -> Vec<RecipeItem> {
        items
            .iter()
            .map(|(id, m)| RecipeItem { ingredient: ingredient(id).unwrap(), mass: *m })
            .collect()
    }

    #[test]
    fn library_is_consistent() {
        let lib = ingredient_library();
        for i in &lib {
            assert!(i.mol_weight().unwrap() > 0.0, "{}", i.id);
            assert!(i.density > 500.0, "{}", i.id);
        }
        // AP molecular weight matches CEA's NH4CLO4(I) record.
        let ap = ingredient("ammonium_perchlorate").unwrap();
        assert!((ap.mol_weight().unwrap() - 117.48906).abs() < 1e-3);
    }

    #[test]
    fn recipe_feed_normalizes_masses() {
        let (_, h_pct, rho_pct) = recipe_feed(&recipe(&[("potassium_nitrate", 65.0), ("sorbitol", 35.0)])).unwrap();
        let (_, h_g, rho_g) = recipe_feed(&recipe(&[("potassium_nitrate", 130.0), ("sorbitol", 70.0)])).unwrap();
        assert!((h_pct - h_g).abs() < 1e-6 && (rho_pct - rho_g).abs() < 1e-9);
        // CEA reports 1840.74 kg/m³ for KNSB 65/35 with these densities.
        assert!((rho_pct - 1840.74).abs() < 0.05, "{}", rho_pct);
    }

    #[test]
    fn rejects_bad_recipes() {
        assert!(recipe_feed(&[]).is_err());
        assert!(recipe_feed(&recipe(&[("sorbitol", -1.0)])).is_err());
        let mut bad = recipe(&[("sorbitol", 1.0)]);
        bad[0].ingredient.formula = vec![("Xx".into(), 1.0)];
        assert!(recipe_feed(&bad).is_err());
        let r = recipe(&[("potassium_nitrate", 65.0), ("sorbitol", 35.0)]);
        assert!(rocket_performance(&r, -1.0, Exit::Pressure(101_325.0), 101_325.0).is_err());
        assert!(rocket_performance(&r, 6.9e6, Exit::Pressure(9e6), 101_325.0).is_err());
    }

    use crate::test_json::{CorpusParser, Json};

    /// Worst relative / absolute deviations against CEA, for the report.
    #[derive(Default)]
    struct Worst(Vec<(String, f64, String)>);
    impl Worst {
        fn rel(&mut self, what: &str, ours: f64, cea: f64, band: f64, case: &str) {
            let d = (ours - cea).abs() / cea.abs();
            self.push(what, d, case);
            assert!(d <= band, "{case}: {what} ours {ours} vs CEA {cea} (rel {d:.2e} > {band})");
        }
        fn abs(&mut self, what: &str, ours: f64, cea: f64, band: f64, case: &str) {
            let d = (ours - cea).abs();
            self.push(what, d, case);
            assert!(d <= band, "{case}: {what} ours {ours} vs CEA {cea} (abs {d:.2e} > {band})");
        }
        fn push(&mut self, what: &str, d: f64, case: &str) {
            match self.0.iter_mut().find(|w| w.0 == what) {
                Some(w) if d > w.1 => {
                    w.1 = d;
                    w.2 = case.into();
                }
                Some(_) => {}
                None => self.0.push((what.into(), d, case.into())),
            }
        }
    }

    fn col(j: &Json, key: &str, i: usize) -> f64 {
        j.get(key).arr()[i].num()
    }

    fn check(perf: &Performance, cea: &Json, case: &str, frozen: bool, w: &mut Worst) {
        let tag = if frozen { "frozen " } else { "eq " };
        let k = |s: &str| format!("{tag}{s}");
        // CEA columns: stations 0 chamber, 1 throat, 2 exit; performance rows
        // (Ae/At, c*, Cf, Ivac, Isp) start at the throat: 0 throat, 1 exit.
        let stations = [&perf.chamber, &perf.throat, &perf.exit];
        // CEA stops a frozen expansion once T leaves a condensed product's
        // data range (e.g. K2CO3(L) below 1174 K), so some frozen cases only
        // have chamber and throat columns; compare what CEA reports.
        let n_cols = cea.get("t").arr().len().min(3);
        for (i, st) in stations.iter().enumerate().take(n_cols) {
            w.rel(&k("T"), st.temperature, col(cea, "t", i), 5e-4, case);
            w.rel(&k("P"), st.pressure / 1e5, col(cea, "p_bar", i), 2e-3, case);
            w.rel(&k("M"), st.m, col(cea, "m", i), 1e-3, case);
            // Frozen γ at a chamber pinned on a melting point (AP/Mg: MgO at
            // 3100 K) differs by ~2e-3; elsewhere agreement is ~5e-5.
            w.abs(&k("gamma"), st.gamma, col(cea, "gamma", i), if frozen { 5e-3 } else { 1e-3 }, case);
            w.rel(&k("sound speed"), st.sound_speed, col(cea, "son", i), 2e-3, case);
        }
        if n_cols < 2 {
            return; // CEA gave the chamber only (e.g. chamber at MgO's melting point)
        }
        w.rel(&k("c*"), perf.cstar, col(cea, "cstar", 0), 5e-4, case);
        if n_cols < 3 {
            return;
        }
        w.rel(&k("Cf"), perf.cf, col(cea, "cf", 1), 5e-4, case);
        w.rel(&k("Isp"), perf.isp * G0, col(cea, "isp", 1), 5e-4, case);
        w.rel(&k("Ivac"), perf.isp_vac * G0, col(cea, "ivac", 1), 5e-4, case);
        w.rel(&k("Ae/At"), perf.exit.area_ratio, col(cea, "ae_at", 1), 2e-3, case);
    }

    #[test]
    fn ingredient_table_matches_cea_corpus() {
        let root = CorpusParser::parse(include_str!("../../../scripts/cea-propellant-corpus.json"));
        for (id, def) in root.get("ingredients").obj() {
            let ing = ingredient(id).unwrap_or_else(|| panic!("missing ingredient {id}"));
            assert_eq!(ing.hf_j_per_mol, def.get("hf_j_per_mol").num(), "{id}");
            assert_eq!(ing.density, def.get("density").num(), "{id}");
            for (e, c) in def.get("formula").obj() {
                let ours = ing
                    .formula
                    .iter()
                    .find(|(x, _)| x.to_uppercase() == *e)
                    .map(|x| x.1)
                    .unwrap_or_else(|| panic!("{id}: missing element {e}"));
                assert_eq!(ours, c.num(), "{id} {e}");
            }
            assert_eq!(ing.formula.len(), def.get("formula").obj().len(), "{id}");
        }
    }

    #[test]
    fn cea_propellant_corpus_within_bands() {
        let root = CorpusParser::parse(include_str!("../../../scripts/cea-propellant-corpus.json"));
        let cases = root.get("cases").arr();
        assert!(cases.len() >= 14);
        let mut w = Worst::default();
        for c in cases {
            let name = match c.get("name") {
                Json::Str(s) => s.clone(),
                _ => panic!("case name"),
            };
            let rec: Vec<RecipeItem> = c
                .get("recipe")
                .obj()
                .iter()
                .map(|(id, m)| RecipeItem { ingredient: ingredient(id).unwrap(), mass: m.num() })
                .collect();
            let exit = match c.get("exit").get("pressure_pa") {
                Json::Num(p) => Exit::Pressure(*p),
                _ => Exit::AreaRatio(c.get("exit").get("area_ratio").num()),
            };
            let pc = c.get("pc_pa").num();
            let r = rocket_performance(&rec, pc, exit, 101_325.0)
                .unwrap_or_else(|e| panic!("{name}: {e}"));
            let eq = c.get("equilibrium");
            check(&r.equilibrium, eq, &name, false, &mut w);
            check(&r.frozen, c.get("frozen"), &name, true, &mut w);
            // Chamber composition: every CEA species above 1e-3 matches to 2e-3.
            for (sp, vals) in eq.get("species").obj() {
                let x = vals.arr()[0].num();
                if x < 1e-3 {
                    continue;
                }
                let ours = r
                    .chamber_species
                    .iter()
                    .find(|(n, _)| n.to_uppercase() == sp.to_uppercase())
                    .map_or(0.0, |v| v.1);
                w.abs("chamber mole fraction", ours, x, 2e-3, &name);
            }
        }
        for (what, d, case) in &w.0 {
            println!("max deviation {what:22} {d:.2e}  ({case})");
        }
    }

    #[test]
    fn sweep_converges_or_fails_cleanly() {
        let mut failures = Vec::new();
        let mut runs = 0;
        for (ox, fuel) in [
            ("potassium_nitrate", "sorbitol"),
            ("potassium_nitrate", "dextrose"),
            ("ammonium_perchlorate", "htpb"),
            ("ammonium_nitrate", "htpb"),
        ] {
            for pct in [50.0, 60.0, 70.0, 80.0, 85.0] {
                for pc in [0.5e6, 2e6, 7e6, 20e6] {
                    runs += 1;
                    let r = recipe(&[(ox, pct), (fuel, 100.0 - pct)]);
                    match rocket_performance(&r, pc, Exit::Pressure(101_325.0_f64.min(pc / 3.0)), 101_325.0) {
                        Ok(res) => {
                            let e = &res.equilibrium;
                            assert!(e.isp > 0.0 && e.cstar > 0.0 && e.exit.area_ratio > 1.0);
                            assert!(e.chamber.temperature > 298.0);
                        }
                        Err(err) => failures.push(format!("{ox}/{fuel} {pct}% @ {pc} Pa: {err}")),
                    }
                }
            }
        }
        println!("{} of {} runs failed: {:#?}", failures.len(), runs, failures);
        assert!(failures.is_empty());
        // 90 % KN barely burns; CEA and Cantera both fail on it. It must fail
        // cleanly, not hang or panic.
        let r = recipe(&[("potassium_nitrate", 90.0), ("sorbitol", 10.0)]);
        assert!(rocket_performance(&r, 7e6, Exit::Pressure(101_325.0), 101_325.0).is_err());
    }
    #[test]
    fn throat_on_a_melting_point_uses_peak_mass_flux() {
        // KNDX 50/50 at 20 MPa: the sonic point sits on K2CO3 melting
        // (1173 K). CEA 2002 flags "discontinuity at the throat" but still
        // reports c* 862.2 m/s, Isp 1564.8 m/s, Ivac 1677.8 m/s, Ae/At 25.873,
        // Tc 1228.45 K, Te 802.30 K (exit to 1 atm).
        let r = recipe(&[("potassium_nitrate", 50.0), ("dextrose", 50.0)]);
        let e = rocket_performance(&r, 20e6, Exit::Pressure(101_325.0), 101_325.0)
            .unwrap()
            .equilibrium;
        let near = |a: f64, b: f64| (a - b).abs() / b < 5e-4;
        assert!(near(e.chamber.temperature, 1228.45));
        assert!(near(e.throat.temperature, 1173.00));
        assert!(near(e.exit.temperature, 802.30));
        assert!(near(e.cstar, 862.2));
        assert!(near(e.isp * G0, 1564.8));
        assert!(near(e.isp_vac * G0, 1677.8));
        assert!(near(e.exit.area_ratio, 25.873));
    }
}
