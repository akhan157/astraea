//! General chemical equilibrium (Gibbs minimization) with condensed phases —
//! the NASA CEA method (Gordon & McBride, NASA RP-1311 Part I, 1994).
//!
//! Problems: fixed T and P (TP), fixed enthalpy and P (HP, adiabatic flame),
//! fixed entropy and P (SP, isentropic expansion). Unknowns are the gas
//! log-moles, condensed moles, element potentials π, ln n and (HP/SP) ln T,
//! solved by the reduced Newton iteration of RP-1311 §2.5 (eqs. 2.24–2.28)
//! with the step control of §3.3 and the condensed-phase add/remove/phase-
//! swap rules of §3.5. Equilibrium derivatives (dlnV/dlnT, dlnV/dlnP, cp,
//! γs) follow RP-1311 §2.6. Mixture quantities are per kg of reactants:
//! moles in kmol/kg, R in J/(kmol·K).
//!
//! Fails closed: non-convergence, a singular system or non-finite iterates
//! return Err rather than a guess.

use crate::thermo::{database, products_for, Species, P_STANDARD, R};

/// ln(n_j/n) below which a gas is treated as trace (RP-1311 "SIZE").
const SIZE: f64 = 18.420_681;
const MAX_NEWTON: usize = 300;
const MAX_PHASE_PASSES: usize = 40;
/// Temperature limits of the iteration, K.
const T_MIN: f64 = 160.0;
const T_MAX: f64 = 6600.0;

/// What is held fixed besides pressure.
#[derive(Debug, Clone, Copy)]
pub enum Constraint {
    /// Temperature, K.
    Temperature(f64),
    /// Mixture enthalpy, J/kg.
    Enthalpy(f64),
    /// Mixture entropy, J/(kg·K).
    Entropy(f64),
}

/// A feed: element symbols (upper case) and kg-atoms of each per kg.
#[derive(Debug, Clone)]
pub struct Feed {
    pub elements: Vec<String>,
    pub b0: Vec<f64>,
}

/// Converged equilibrium state, per kg of mixture.
#[derive(Debug, Clone)]
pub struct State {
    pub pressure: f64,
    pub temperature: f64,
    /// Database index and kmol/kg of each species present (gas and condensed).
    pub moles: Vec<(usize, f64)>,
    /// Gas kmol/kg (n); 1/n is CEA's "M".
    pub n_gas: f64,
    /// Mixture enthalpy, J/kg.
    pub enthalpy: f64,
    /// Mixture entropy, J/(kg·K).
    pub entropy: f64,
    /// Equilibrium cp, J/(kg·K).
    pub cp_eq: f64,
    /// Frozen cp, J/(kg·K).
    pub cp_frozen: f64,
    pub dlnv_dlnt: f64,
    pub dlnv_dlnp: f64,
    /// Isentropic exponent with shifting equilibrium (CEA "GAMMAs").
    pub gamma_s: f64,
    /// Frozen-composition γ = cp_f/(cp_f − nR).
    pub gamma_frozen: f64,
    pub newton_iterations: usize,
}

impl State {
    /// CEA "M, (1/n)", kg/kmol.
    pub fn m(&self) -> f64 {
        1.0 / self.n_gas
    }
    /// CEA "MW": mass over all moles (gas + condensed), kg/kmol.
    pub fn mw(&self) -> f64 {
        1.0 / self.moles.iter().map(|(_, n)| n).sum::<f64>()
    }
    /// Density, kg/m³ (mixture mass per gas volume, as CEA).
    pub fn density(&self) -> f64 {
        self.pressure / (self.n_gas * R * self.temperature)
    }
    /// Sound speed with shifting equilibrium, m/s.
    pub fn sound_speed(&self) -> f64 {
        (self.n_gas * R * self.temperature * self.gamma_s).sqrt()
    }
    /// Frozen sound speed, m/s.
    pub fn sound_speed_frozen(&self) -> f64 {
        (self.n_gas * R * self.temperature * self.gamma_frozen).sqrt()
    }
    /// Mole fractions over all species (CEA convention), sorted descending.
    pub fn mole_fractions(&self) -> Vec<(String, f64)> {
        let db = database();
        let total: f64 = self.moles.iter().map(|(_, n)| n).sum();
        let mut v: Vec<(String, f64)> = self
            .moles
            .iter()
            .map(|(i, n)| (db[*i].name.clone(), n / total))
            .collect();
        v.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        v
    }
}

/// Working state of the iteration.
struct Work<'a> {
    db: &'a [Species],
    feed: &'a Feed,
    /// a[i][j]: atoms of element i in gas j / condensed j.
    gases: Vec<usize>,
    a_gas: Vec<Vec<f64>>,
    candidates: Vec<usize>,
    /// Included condensed species (db index) and moles.
    cond: Vec<(usize, f64)>,
    ln_nj: Vec<f64>,
    ln_n: f64,
    t: f64,
    p: f64,
    /// Element potentials from the last solve.
    pi: Vec<f64>,
    iterations: usize,
}

fn atoms(s: &Species, elements: &[String]) -> Vec<f64> {
    elements.iter().map(|e| s.count(e)).collect()
}

/// Gaussian elimination with partial pivoting; Err on a singular matrix.
fn solve_dense(mut m: Vec<Vec<f64>>, mut rhs: Vec<f64>) -> Result<Vec<f64>, String> {
    let n = rhs.len();
    for c in 0..n {
        let piv = (c..n)
            .max_by(|&a, &b| m[a][c].abs().partial_cmp(&m[b][c].abs()).unwrap())
            .unwrap();
        let scale = m[c..n]
            .iter()
            .map(|r| r.iter().fold(0.0_f64, |s, v| s.max(v.abs())))
            .fold(0.0_f64, f64::max);
        if m[piv][c].abs() <= 1e-14 * scale.max(1e-300) {
            return Err("equilibrium: singular Newton matrix".into());
        }
        m.swap(c, piv);
        rhs.swap(c, piv);
        for r in c + 1..n {
            let f = m[r][c] / m[c][c];
            if f != 0.0 {
                for k in c..n {
                    m[r][k] -= f * m[c][k];
                }
                rhs[r] -= f * rhs[c];
            }
        }
    }
    let mut x = vec![0.0; n];
    for r in (0..n).rev() {
        let mut s = rhs[r];
        for k in r + 1..n {
            s -= m[r][k] * x[k];
        }
        x[r] = s / m[r][r];
    }
    Ok(x)
}

impl<'a> Work<'a> {
    fn new(feed: &'a Feed, p: f64, t: f64) -> Result<Self, String> {
        let db = database();
        let present: Vec<String> = feed
            .elements
            .iter()
            .zip(&feed.b0)
            .filter(|(_, b)| **b > 0.0)
            .map(|(e, _)| e.clone())
            .collect();
        let products = products_for(&present);
        let gases: Vec<usize> = products.iter().copied().filter(|&i| !db[i].condensed).collect();
        let candidates: Vec<usize> =
            products.iter().copied().filter(|&i| db[i].condensed).collect();
        if gases.is_empty() {
            return Err("equilibrium: no gaseous products for this feed".into());
        }
        let a_gas = gases.iter().map(|&j| atoms(&db[j], &feed.elements)).collect();
        let ng = gases.len() as f64;
        Ok(Work {
            db,
            feed,
            ln_nj: vec![(0.1 / ng).ln(); gases.len()],
            gases,
            a_gas,
            candidates,
            cond: Vec::new(),
            ln_n: 0.1_f64.ln(),
            t,
            p,
            pi: vec![0.0; feed.elements.len()],
            iterations: 0,
        })
    }

    fn ln_p(&self) -> f64 {
        (self.p / P_STANDARD).ln()
    }

    /// Gas μ/RT, H/RT, S/R (mixture partial entropy), cp/R.
    fn gas_props(&self) -> (Vec<f64>, Vec<f64>, Vec<f64>, Vec<f64>) {
        let (t, lnp) = (self.t, self.ln_p());
        let ng = self.gases.len();
        let (mut mu, mut h, mut s, mut cp) =
            (vec![0.0; ng], vec![0.0; ng], vec![0.0; ng], vec![0.0; ng]);
        for (k, &j) in self.gases.iter().enumerate() {
            let sp = &self.db[j];
            let (hj, sj) = (sp.h_rt(t), sp.s_r(t));
            let frac = self.ln_nj[k] - self.ln_n;
            h[k] = hj;
            mu[k] = hj - sj + frac + lnp;
            s[k] = sj - frac - lnp;
            cp[k] = sp.cp_r(t);
        }
        (mu, h, s, cp)
    }

    fn nl(&self) -> usize {
        self.feed.elements.len()
    }

    /// Assemble and solve one Newton system. Returns
    /// (π, Δn_cond, Δln n, Δln T) for the given constraint.
    fn newton_system(&self, constraint: Constraint) -> Result<(Vec<f64>, Vec<f64>, f64, f64), String> {
        let nl = self.nl();
        let nc = self.cond.len();
        let energy = !matches!(constraint, Constraint::Temperature(_));
        let size = nl + nc + 1 + usize::from(energy);
        let (mu, h, s, cp) = self.gas_props();
        let nj: Vec<f64> = self.ln_nj.iter().map(|v| v.exp()).collect();
        let n = self.ln_n.exp();
        let t = self.t;
        let mut m = vec![vec![0.0; size]; size];
        let mut r = vec![0.0; size];
        let i_n = nl + nc;
        let i_t = nl + nc + 1;

        // Element rows.
        for i in 0..nl {
            let mut b_i = 0.0;
            for (g, a) in self.a_gas.iter().enumerate() {
                if a[i] == 0.0 {
                    continue;
                }
                let w = a[i] * nj[g];
                b_i += w;
                for k in 0..nl {
                    m[i][k] += a[k] * w;
                }
                m[i][i_n] += w;
                if energy {
                    m[i][i_t] += w * h[g];
                }
                r[i] += w * mu[g];
            }
            for (c, &(j, ncj)) in self.cond.iter().enumerate() {
                let aic = self.db[j].count(&self.feed.elements[i]);
                m[i][nl + c] = aic;
                b_i += aic * ncj;
            }
            r[i] += self.feed.b0[i] - b_i;
        }
        // Condensed rows.
        for (c, &(j, _)) in self.cond.iter().enumerate() {
            let sp = &self.db[j];
            for k in 0..nl {
                m[nl + c][k] = sp.count(&self.feed.elements[k]);
            }
            let hc = sp.h_rt(t);
            if energy {
                m[nl + c][i_t] = hc;
            }
            r[nl + c] = hc - sp.s_r(t);
        }
        // Total-moles row.
        let sum_n: f64 = nj.iter().sum();
        for (g, a) in self.a_gas.iter().enumerate() {
            for k in 0..nl {
                m[i_n][k] += a[k] * nj[g];
            }
            if energy {
                m[i_n][i_t] += nj[g] * h[g];
            }
            r[i_n] += nj[g] * mu[g];
        }
        m[i_n][i_n] = sum_n - n;
        r[i_n] += n - sum_n;

        if energy {
            let cp_all: f64 = nj.iter().zip(&cp).map(|(a, b)| a * b).sum::<f64>()
                + self
                    .cond
                    .iter()
                    .map(|&(j, ncj)| ncj * self.db[j].cp_r(t))
                    .sum::<f64>();
            // Weight per gas: H/RT (HP) or S/R (SP).
            let wgt: &Vec<f64> = if matches!(constraint, Constraint::Enthalpy(_)) { &h } else { &s };
            for (g, a) in self.a_gas.iter().enumerate() {
                for k in 0..nl {
                    m[i_t][k] += a[k] * nj[g] * wgt[g];
                }
                m[i_t][i_n] += nj[g] * wgt[g];
                m[i_t][i_t] += nj[g] * h[g] * wgt[g];
                r[i_t] += nj[g] * wgt[g] * mu[g];
            }
            m[i_t][i_t] += cp_all;
            match constraint {
                Constraint::Enthalpy(h0) => {
                    let mut h_mix: f64 = nj.iter().zip(&h).map(|(a, b)| a * b).sum();
                    for (c, &(j, ncj)) in self.cond.iter().enumerate() {
                        let hc = self.db[j].h_rt(t);
                        m[i_t][nl + c] = hc;
                        h_mix += ncj * hc;
                    }
                    r[i_t] += h0 / (R * t) - h_mix;
                }
                Constraint::Entropy(s0) => {
                    let mut s_mix: f64 = nj.iter().zip(&s).map(|(a, b)| a * b).sum();
                    for (c, &(j, ncj)) in self.cond.iter().enumerate() {
                        let sc = self.db[j].s_r(t);
                        m[i_t][nl + c] = sc;
                        s_mix += ncj * sc;
                    }
                    r[i_t] += s0 / R - s_mix + n - sum_n;
                }
                Constraint::Temperature(_) => unreachable!(),
            }
        }

        let x = solve_dense(m, r)?;
        if x.iter().any(|v| !v.is_finite()) {
            return Err("equilibrium: non-finite Newton step".into());
        }
        let pi = x[..nl].to_vec();
        let dn = x[nl..nl + nc].to_vec();
        let dln_n = x[i_n];
        let dln_t = if energy { x[i_t] } else { 0.0 };
        Ok((pi, dn, dln_n, dln_t))
    }

    /// Newton-converge with the current set of condensed species.
    fn converge(
        &mut self,
        constraint: Constraint,
        swaps: &mut Vec<(Vec<(String, f64)>, usize)>,
    ) -> Result<(), String> {
        let fixed_t = matches!(constraint, Constraint::Temperature(_));
        let element_tol = 1e-6 * self.feed.b0.iter().fold(0.0_f64, |a, b| a.max(*b));
        for it in 0..MAX_NEWTON {
            self.iterations += 1;
            // A slow solve, or T pinned at a limit, usually means the condensed
            // set is wrong (CEA stops here and asks for an "insert"): redo the
            // phase bookkeeping with the current element potentials.
            let pinned = self.t <= T_MIN * 1.0001 || self.t >= T_MAX * 0.9999;
            if it > 0 && (it % 25 == 0 || (pinned && it % 5 == 0)) {
                self.adjust_phases(fixed_t, swaps);
            }
            let (pi, dn, dln_n, dln_t) = self.newton_system(constraint)?;
            let (mu, h, _, _) = self.gas_props();
            let dln_nj: Vec<f64> = self
                .a_gas
                .iter()
                .enumerate()
                .map(|(g, a)| {
                    -mu[g]
                        + a.iter().zip(&pi).map(|(x, y)| x * y).sum::<f64>()
                        + dln_n
                        + h[g] * dln_t
                })
                .collect();

            // Step control (RP-1311 eqs. 3.1–3.3).
            let mut big = 5.0 * dln_t.abs().max(dln_n.abs());
            let mut lambda2 = 1.0_f64;
            for (g, d) in dln_nj.iter().enumerate() {
                let rel = self.ln_nj[g] - self.ln_n;
                if rel > -SIZE {
                    if *d > 0.0 {
                        big = big.max(d.abs());
                    }
                } else if *d >= 0.0 && (d - dln_n).abs() > 0.0 {
                    lambda2 = lambda2.min(((-rel - 9.210_340_4) / (d - dln_n)).abs());
                }
            }
            let lambda1 = if big > 2.0 { 2.0 / big } else { 1.0 };
            let lambda = lambda1.min(lambda2).min(1.0);

            let sum_n: f64 = self.ln_nj.iter().map(|v| v.exp()).sum::<f64>()
                + self.cond.iter().map(|c| c.1).sum::<f64>();
            let mut converged = dln_t.abs() <= 1e-4
                && self.ln_n.exp() * dln_n.abs() / sum_n <= 0.5e-5;
            for (g, d) in dln_nj.iter().enumerate() {
                if self.ln_nj[g].exp() * d.abs() / sum_n > 0.5e-5 {
                    converged = false;
                }
            }
            for d in &dn {
                if d.abs() / sum_n > 0.5e-5 {
                    converged = false;
                }
            }

            for (g, d) in dln_nj.iter().enumerate() {
                self.ln_nj[g] = (self.ln_nj[g] + lambda * d).max(self.ln_n - 80.0);
            }
            for (c, d) in dn.iter().enumerate() {
                self.cond[c].1 += lambda * d;
            }
            self.ln_n += lambda * dln_n;
            if !matches!(constraint, Constraint::Temperature(_)) {
                self.t = (self.t.ln() + lambda * dln_t).exp().clamp(T_MIN, T_MAX);
            }
            self.pi = pi;
            if !self.t.is_finite() || !self.ln_n.is_finite() {
                return Err("equilibrium: non-finite iterate".into());
            }
            if converged {
                // Element balance check (fail closed).
                for i in 0..self.nl() {
                    let b: f64 = self
                        .a_gas
                        .iter()
                        .zip(&self.ln_nj)
                        .map(|(a, l)| a[i] * l.exp())
                        .sum::<f64>()
                        + self
                            .cond
                            .iter()
                            .map(|&(j, n)| self.db[j].count(&self.feed.elements[i]) * n)
                            .sum::<f64>();
                    if (b - self.feed.b0[i]).abs() > element_tol {
                        break;
                    }
                    if i + 1 == self.nl() {
                        return Ok(());
                    }
                }
            }
        }
        Err(format!(
            "equilibrium: Newton did not converge in {} iterations (T = {:.1} K)",
            MAX_NEWTON, self.t
        ))
    }

    fn compound_key(&self, j: usize) -> Vec<(String, f64)> {
        let mut e = self.db[j].elements.clone();
        e.sort_by(|a, b| a.0.cmp(&b.0));
        e
    }

    fn valid_at(&self, j: usize, t: f64) -> bool {
        let (lo, hi) = self.db[j].t_range();
        t >= lo - 1e-6 && t <= hi + 1e-6
    }

    /// Condensed-phase bookkeeping after a converged solve. Returns true if
    /// the species set changed (and the solve must be repeated).
    fn adjust_phases(&mut self, fixed_t: bool, swaps: &mut Vec<(Vec<(String, f64)>, usize)>) -> bool {
        // 1. Drop condensed species that went negative (most negative first).
        if let Some((k, _)) = self
            .cond
            .iter()
            .enumerate()
            .filter(|(_, c)| c.1 <= 0.0)
            .min_by(|a, b| a.1 .1.partial_cmp(&b.1 .1).unwrap())
        {
            self.cond.remove(k);
            return true;
        }
        // 2. Phase validity: swap to the phase of the same compound valid at T,
        //    or keep both at a transition once the swap has oscillated.
        for k in 0..self.cond.len() {
            let (j, nj) = self.cond[k];
            if self.valid_at(j, self.t) {
                continue;
            }
            let key = self.compound_key(j);
            let replacement = self
                .candidates
                .iter()
                .copied()
                .find(|&c| c != j && self.compound_key(c) == key && self.valid_at(c, self.t));
            let Some(rep) = replacement else {
                // No phase of this compound has data at T: drop it.
                self.cond.remove(k);
                return true;
            };
            if self.cond.iter().any(|c| c.0 == rep) {
                continue; // both phases present: coexistence at the transition
            }
            let count = match swaps.iter_mut().find(|s| s.0 == key) {
                Some(s) => {
                    s.1 += 1;
                    s.1
                }
                None => {
                    swaps.push((key, 1));
                    1
                }
            };
            if count >= 3 && !fixed_t {
                self.cond.push((rep, 0.0)); // keep both; T settles at the transition
            } else {
                self.cond[k] = (rep, nj);
            }
            return true;
        }
        // 3. Add the condensed species with the most negative driving force.
        self.try_add_condensed()
    }

    /// Include the condensed candidate (valid at the current T, compound not
    /// yet present) with the most negative μ°/RT − Σ a·π (RP-1311 eq. 3.7).
    fn try_add_condensed(&mut self) -> bool {
        let (t, mut best) = (self.t, None::<(usize, f64)>);
        for &c in &self.candidates {
            if self.cond.iter().any(|x| x.0 == c) || !self.valid_at(c, t) {
                continue;
            }
            let key = self.compound_key(c);
            if self.cond.iter().any(|x| self.compound_key(x.0) == key) {
                continue;
            }
            let sp = &self.db[c];
            let drive = sp.h_rt(t)
                - sp.s_r(t)
                - self
                    .feed
                    .elements
                    .iter()
                    .zip(&self.pi)
                    .map(|(e, p)| sp.count(e) * p)
                    .sum::<f64>();
            if drive < -1e-8 && best.is_none_or(|b| drive < b.1) {
                best = Some((c, drive));
            }
        }
        if let Some((c, _)) = best {
            self.cond.push((c, 0.0));
            return true;
        }
        false
    }

    fn solve(&mut self, constraint: Constraint) -> Result<(), String> {
        let fixed_t = matches!(constraint, Constraint::Temperature(_));
        let mut swaps = Vec::new();
        for _ in 0..MAX_PHASE_PASSES {
            self.converge(constraint, &mut swaps)?;
            if !self.adjust_phases(fixed_t, &mut swaps) {
                return Ok(());
            }
        }
        Err("equilibrium: condensed-phase selection did not settle".into())
    }

    /// Thermodynamic derivatives (RP-1311 §2.6) and the final state.
    fn finish(&self) -> Result<State, String> {
        let nl = self.nl();
        // Two phases of one compound coexist only at its transition
        // temperature; there the T-derivatives are singular. Use the dominant
        // phase for the derivative system (affects γs/cp/sound speed only).
        let mut deriv_cond: Vec<(usize, f64)> = Vec::new();
        for &(j, n) in &self.cond {
            let key = self.compound_key(j);
            match deriv_cond.iter_mut().find(|c| self.compound_key(c.0) == key) {
                Some(c) => {
                    if n > c.1 {
                        *c = (j, n);
                    }
                }
                None => deriv_cond.push((j, n)),
            }
        }
        let nc = deriv_cond.len();
        let size = nl + nc + 1;
        let t = self.t;
        let (_, h, s, cp) = self.gas_props();
        let nj: Vec<f64> = self.ln_nj.iter().map(|v| v.exp()).collect();
        let mut m = vec![vec![0.0; size]; size];
        let mut rt = vec![0.0; size];
        let mut rp = vec![0.0; size];
        let i_n = nl + nc;
        for i in 0..nl {
            for (g, a) in self.a_gas.iter().enumerate() {
                if a[i] == 0.0 {
                    continue;
                }
                let w = a[i] * nj[g];
                for k in 0..nl {
                    m[i][k] += a[k] * w;
                }
                m[i][i_n] += w;
                rt[i] -= w * h[g];
                rp[i] += w;
            }
            for (c, &(j, _)) in deriv_cond.iter().enumerate() {
                m[i][nl + c] = self.db[j].count(&self.feed.elements[i]);
            }
        }
        for (c, &(j, _)) in deriv_cond.iter().enumerate() {
            for k in 0..nl {
                m[nl + c][k] = self.db[j].count(&self.feed.elements[k]);
            }
            rt[nl + c] = -self.db[j].h_rt(t);
        }
        for (g, a) in self.a_gas.iter().enumerate() {
            for k in 0..nl {
                m[i_n][k] += a[k] * nj[g];
            }
            rt[i_n] -= nj[g] * h[g];
            rp[i_n] += nj[g];
        }
        let xt = solve_dense(m.clone(), rt)?;
        let xp = solve_dense(m, rp)?;
        let dlnv_dlnt = 1.0 + xt[i_n];
        let dlnv_dlnp = -1.0 + xp[i_n];

        let cp_frozen_r: f64 = nj.iter().zip(&cp).map(|(a, b)| a * b).sum::<f64>()
            + self.cond.iter().map(|&(j, n)| n * self.db[j].cp_r(t)).sum::<f64>();
        let mut cp_eq_r = cp_frozen_r;
        for i in 0..nl {
            let w: f64 = self
                .a_gas
                .iter()
                .enumerate()
                .map(|(g, a)| a[i] * nj[g] * h[g])
                .sum();
            cp_eq_r += w * xt[i];
        }
        for (c, &(j, _)) in deriv_cond.iter().enumerate() {
            cp_eq_r += self.db[j].h_rt(t) * xt[nl + c];
        }
        cp_eq_r += nj.iter().zip(&h).map(|(a, b)| a * b).sum::<f64>() * xt[i_n];
        cp_eq_r += nj.iter().zip(&h).map(|(a, b)| a * b * b).sum::<f64>();

        let n = nj.iter().sum::<f64>();
        let cv_eq_r = cp_eq_r + n * dlnv_dlnt * dlnv_dlnt / dlnv_dlnp;
        let gamma_s = -(cp_eq_r / cv_eq_r) / dlnv_dlnp;
        let gamma_frozen = cp_frozen_r / (cp_frozen_r - n);

        let mut enthalpy = nj.iter().zip(&h).map(|(a, b)| a * b).sum::<f64>();
        let mut entropy = nj.iter().zip(&s).map(|(a, b)| a * b).sum::<f64>();
        let mut moles: Vec<(usize, f64)> = Vec::new();
        for (g, &j) in self.gases.iter().enumerate() {
            if self.ln_nj[g] - self.ln_n > -SIZE {
                moles.push((j, nj[g]));
            }
        }
        for &(j, nc) in &self.cond {
            enthalpy += nc * self.db[j].h_rt(t);
            entropy += nc * self.db[j].s_r(t);
            if nc > 0.0 {
                moles.push((j, nc));
            }
        }
        let st = State {
            pressure: self.p,
            temperature: t,
            moles,
            n_gas: n,
            enthalpy: enthalpy * R * t,
            entropy: entropy * R,
            cp_eq: cp_eq_r * R,
            cp_frozen: cp_frozen_r * R,
            dlnv_dlnt,
            dlnv_dlnp,
            gamma_s,
            gamma_frozen,
            newton_iterations: self.iterations,
        };
        if !(st.gamma_s.is_finite() && st.cp_eq.is_finite() && st.gamma_s > 0.0) {
            return Err("equilibrium: non-physical derivatives".into());
        }
        Ok(st)
    }
}

/// Solve equilibrium at pressure `p` (Pa) under `constraint`.
/// `guess` (a previous state) seeds the composition and temperature.
pub fn equilibrate(
    feed: &Feed,
    p: f64,
    constraint: Constraint,
    guess: Option<&State>,
) -> Result<State, String> {
    let (mut st, coexisting) = equilibrate_inner(feed, p, constraint, guess)?;
    if coexisting {
        // Two phases of one compound pinned at their transition temperature:
        // the analytic T-derivatives are singular, so take γs from its
        // definition along the isentrope, 1/γs = (∂ln ρ/∂ln P)_s, by central
        // difference of two SP solves (CEA reports the same limit).
        let s0 = st.entropy;
        let d = 1e-4;
        let lo = equilibrate_inner(feed, p * (1.0 - d), Constraint::Entropy(s0), Some(&st))?.0;
        let hi = equilibrate_inner(feed, p * (1.0 + d), Constraint::Entropy(s0), Some(&st))?.0;
        let dlnrho = hi.density().ln() - lo.density().ln();
        let dlnp = ((1.0 + d) / (1.0 - d)).ln();
        st.gamma_s = dlnp / dlnrho;
        if !(st.gamma_s.is_finite() && st.gamma_s > 0.0) {
            return Err("equilibrium: non-physical γs at a phase transition".into());
        }
    }
    Ok(st)
}

/// Solve and report whether two phases of one compound coexist.
fn equilibrate_inner(
    feed: &Feed,
    p: f64,
    constraint: Constraint,
    guess: Option<&State>,
) -> Result<(State, bool), String> {
    if !(p.is_finite() && p > 0.0) {
        return Err(format!("equilibrium: pressure must be > 0 Pa, got {}", p));
    }
    if feed.elements.len() != feed.b0.len()
        || feed.b0.iter().any(|b| !b.is_finite() || *b < 0.0)
        || feed.b0.iter().all(|b| *b == 0.0)
    {
        return Err("equilibrium: invalid feed".into());
    }
    let t0 = match constraint {
        Constraint::Temperature(t) => {
            if !(T_MIN..=T_MAX).contains(&t) {
                return Err(format!("equilibrium: temperature out of range: {}", t));
            }
            t
        }
        _ => guess.map_or(3800.0, |g| g.temperature),
    };
    let mut w = Work::new(feed, p, t0)?;
    if let Some(g) = guess {
        let total: f64 = g.n_gas;
        let floor = (total * 1e-12).ln();
        for (k, &j) in w.gases.iter().enumerate() {
            w.ln_nj[k] = g
                .moles
                .iter()
                .find(|m| m.0 == j)
                .map_or(floor, |m| m.1.ln().max(floor));
        }
        w.ln_n = total.ln();
        w.cond = g
            .moles
            .iter()
            .filter(|m| database()[m.0].condensed)
            .copied()
            .collect();
    }
    w.solve(constraint)?;
    let coexisting = w
        .cond
        .iter()
        .enumerate()
        .any(|(i, a)| w.cond[..i].iter().any(|b| w.compound_key(b.0) == w.compound_key(a.0)));
    Ok((w.finish()?, coexisting))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed(pairs: &[(&str, f64)]) -> Feed {
        Feed {
            elements: pairs.iter().map(|p| p.0.to_string()).collect(),
            b0: pairs.iter().map(|p| p.1).collect(),
        }
    }

    #[test]
    fn water_dissociation_tp() {
        // 1 kg of H2O at 3000 K, 1 bar. Independent check (Cantera 3.2 with the
        // older NASA-7 data): x_H2O = 0.643, x_H2 = 0.135.
        let mw = 18.01528;
        let f = feed(&[("H", 2.0 / mw), ("O", 1.0 / mw)]);
        let st = equilibrate(&f, 1e5, Constraint::Temperature(3000.0), None).unwrap();
        let x = st.mole_fractions();
        assert_eq!(x[0].0, "H2O");
        assert!((x[0].1 - 0.643).abs() < 0.01, "{:?}", &x[..4]);
        assert_eq!(x[1].0, "H2");
        assert!((x[1].1 - 0.135).abs() < 0.005, "{:?}", &x[..4]);
        assert!(st.gamma_s > 1.0 && st.gamma_s < 1.3);
    }

    #[test]
    fn rejects_bad_input() {
        let f = feed(&[("H", 1.0)]);
        assert!(equilibrate(&f, -1.0, Constraint::Temperature(3000.0), None).is_err());
        assert!(equilibrate(&f, 1e5, Constraint::Temperature(f64::NAN), None).is_err());
        assert!(equilibrate(&feed(&[("H", 0.0)]), 1e5, Constraint::Temperature(3000.0), None).is_err());
    }
}
