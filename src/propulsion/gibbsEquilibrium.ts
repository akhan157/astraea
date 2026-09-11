/**
 * Astraea Gibbs-equilibrium chemistry — constrained free-energy
 * minimization at fixed (T, P) for ideal-gas mixtures, solved by the
 * element-potential (Lagrange/Newton) method of the NASA CEA theory
 * (S. Gordon & B. J. McBride, "Computer Program for Calculation of Complex
 * Chemical Equilibrium Compositions and Applications", NASA RP-1311, 1994).
 *
 * ---------------------------------------------------------------------------
 * METHOD
 * ---------------------------------------------------------------------------
 * Minimize the dimensionless Gibbs free energy of an ideal-gas mixture
 *
 *     G/RT = Σ_i n_i·(g_i°(T)/RT + ln(n_i/N) + ln(P/P°))        (gases)
 *
 * subject to linear element-population constraints Σ_i a_ji·n_i = b_j
 * (a_ji = atoms of element j in species i, b_j = kmol of element j in the
 * feed). Introducing element potentials λ_j (Lagrange multipliers) and
 * y = ln N, stationarity gives, per gas species,
 *
 *     n_i = N·(P°/P)·exp(−g_i°/RT − Σ_j a_ji·λ_j)               (∗)
 *
 * and the Newton system solves the M element balances plus the mole-number
 * normalization Σ n_i = N in the unknowns (λ_1…λ_M, y). Each Newton step
 * is a Levenberg–Marquardt damped step (backtracking line search on the
 * squared residual norm) so the iteration is globally convergent and
 * tolerates the rank-deficient Jacobians of degenerate feasible problems
 * (e.g. a single species that must absorb fixed element amounts).
 *
 * Condensed species (Al2O3) enter with activity 1: their fugacity term
 * drops out of (∗), the equilibrium condition becomes
 * g_c°/RT + Σ_j a_jc·λ_j = 0, and the phase amount n_c becomes an extra
 * unknown coupled only through the element balances (CEA phase rule). This
 * is what makes condensed Al2O3 the correct Al sink at 3500 K — treating
 * it as a gas would let its −1.68 GJ/kmol formation free energy swamp the
 * mixture (unphysical "Al2O3-gas dominance").
 *
 * Thermodynamic data is imported, not duplicated, from nozzleChemistry.ts:
 * the NASA TM-4513 seven-coefficient fits (a1…a5 per 1000 K range), ΔfH°(298)
 * and molecular weights, plus sensibleEnthalpy for h°(T). The missing NASA
 * integration constants a6/a7 are fitted at the standard state:
 *
 *   h°/RT = a1 + a2T/2 + a3T²/3 + a4T³/4 + a5T⁴/5 + a6/T     a6 fitted so
 *     h°(298.15) = ΔfH°  (a6 never appears explicitly: h°(T) is built from
 *     ΔfH° + ∫cp dT via sensibleEnthalpy, which is exactly the a6 bookkeeping)
 *   s°/R  = a1·lnT + a2T + a3T²/2 + a4T³/3 + a5T⁴/4 + a7   a7 fitted so
 *     s°(298.15) = S°_298 (tabulated, see `STANDARD_ENTROPY_J_PER_MOL_K`),
 *     S°_298 = R·(a1·lnT₀ + a2T₀ + a3T₀²/2 + a4T₀³/3 + a5T₀⁴/4 + a7)
 *
 * so g°(T) = h°(T) − T·s°(T) is exact at 298.15 K and uses the same cp fit
 * for the temperature extrapolation — the standard NASA-7 construction.
 * Al2O3 entropy follows the same piecewise fits plus ΔS_fusion =
 * ΔH_fusion/T_melt at 2327 K and liquid-cp ln(T/T_melt) above, mirroring
 * sensibleEnthalpy's phase handling so g° stays thermodynamically
 * consistent (ΔG = 0 at the melting point).
 *
 * Validation cross-check (qualitative, CEA APCP trends): for a typical
 * 70 AP / 18 Al / 12 HTPB chamber at ≈3500 K / 100 bar the published CEA
 * equilibrium is dominated by CO, H2O, H2, N2, HCl and condensed Al2O3(l),
 * with CO2 and the radicals H, O, O2 present only as dissociation
 * minorities. `solveEquilibrium` on the documented feed reproduces exactly
 * that hierarchy (all Al → Al2O3, all Cl → HCl, all N → N2, C mainly CO;
 * see the acceptance test).
 *
 * The frozen-vs-equilibrium comparison helper (`chamberEquilibriumFrom
 * Propellant`) is deliberately OUT OF SCOPE — this module ships the solver
 * and its validation tests only.
 */

import {
  AL2O3_FUSION_J_PER_KMOL,
  AL2O3_LIQUID_CPR,
  AL2O3_MELT_K,
  POLY_SWITCH_K,
  R_UNIVERSAL,
  SPECIES,
  STANDARD_TEMPERATURE,
  sensibleEnthalpy,
  type Nasa7Species,
  type SpeciesName,
} from './nozzleChemistry';

/** Standard reference pressure P° for the ln(P/P°) fugacity term, Pa (1 atm). */
export const STANDARD_PRESSURE = 101_325;

/** Newton iteration cap — fail closed beyond this (normal runs need < 30). */
const MAX_ITERATIONS = 200;
/** Relative residual tolerance for the element and mole-number balances. */
const REL_TOL = 1e-12;
/** Absolute residual tolerance for the condensed-phase equilibrium (dimensionless). */
const ABS_TOL = 1e-12;

/**
 * Standard molar entropies S°(298.15 K), J/(mol·K), used to fit the NASA-7
 * entropy integration constant a7. Sources: NIST Chemistry WebBook /
 * JANAF thermochemical tables (H2O(g), O(g), H(g), Al2O3 α-corundum).
 */
const STANDARD_ENTROPY_J_PER_MOL_K: Record<SpeciesName, number> = {
  H2O: 188.835,
  H2: 130.680,
  CO2: 213.795,
  CO: 197.660,
  N2: 191.609,
  HCl: 186.902,
  O2: 205.152,
  O: 161.059,
  H: 114.716,
  Al2O3: 50.92,
};

/** Atoms of element j in one molecule of species i (structural data). */
const ELEMENT_COMPOSITION: Record<SpeciesName, Readonly<Record<string, number>>> = {
  H2O: { H: 2, O: 1 },
  H2: { H: 2 },
  CO2: { C: 1, O: 2 },
  CO: { C: 1, O: 1 },
  N2: { N: 2 },
  HCl: { H: 1, Cl: 1 },
  O2: { O: 2 },
  O: { O: 1 },
  H: { H: 1 },
  Al2O3: { Al: 2, O: 3 },
};

export interface EquilibriumResult {
  /** equilibrium molar amounts, kmol (one entry per requested species) */
  moles: Record<SpeciesName, number>;
  /** true on return — the solver fails closed (throws) on non-convergence */
  converged: boolean;
  /** Newton iterations taken */
  iterations: number;
}

/** ∫ a1/x + a2 + a3x + a4x² + a5x³ dx = a1·lnx + a2x + a3x²/2 + a4x³/3 + a5x⁴/4. */
function entropyPolyIntegral(a: readonly number[], t: number): number {
  return (a[0] as number) * Math.log(t)
    + (a[1] as number) * t
    + (a[2] as number) * (t * t) / 2
    + (a[3] as number) * (t ** 3) / 3
    + (a[4] as number) * (t ** 4) / 4;
}

/** Fit a7 so the NASA-7 entropy polynomial matches S°_298 at 298.15 K. */
function fitA7(s: Nasa7Species, s298PerR: number): number {
  return s298PerR - entropyPolyIntegral(s.aLow, STANDARD_TEMPERATURE);
}

/**
 * s°/R of a species at temperature T (K), from the NASA-7 entropy integral
 * s°/R = a1·lnT + a2T + a3T²/2 + a4T³/3 + a5T⁴/4 + a7. The low-range a7 is
 * fitted to the tabulated S°_298 (see module header); above 1000 K the
 * high-range polynomial is attached continuously. Condensed Al2O3 adds the
 * 2327 K fusion entropy and a liquid-cp ln term, consistent with
 * sensibleEnthalpy. Throws on non-finite or out-of-range temperature.
 */
export function entropyIntegral(species: SpeciesName, temperature: number): number {
  if (!Number.isFinite(temperature) || temperature < STANDARD_TEMPERATURE) {
    throw new RangeError(
      `entropyIntegral: temperature must be finite and ≥ ${STANDARD_TEMPERATURE} K, got ${temperature}`,
    );
  }
  const s = SPECIES[species];
  const s298PerR = (STANDARD_ENTROPY_J_PER_MOL_K[species] * 1000) / R_UNIVERSAL;
  if (species === 'Al2O3') {
    return al2o3EntropyOverR(temperature, fitA7(s, s298PerR));
  }
  if (temperature <= POLY_SWITCH_K) {
    return entropyPolyIntegral(s.aLow, temperature) + fitA7(s, s298PerR);
  }
  return fitA7(s, s298PerR)
    + entropyPolyIntegral(s.aLow, POLY_SWITCH_K)
    + (entropyPolyIntegral(s.aHigh, temperature) - entropyPolyIntegral(s.aHigh, POLY_SWITCH_K));
}

function al2o3EntropyOverR(temperature: number, a7: number): number {
  const s = SPECIES.Al2O3;
  if (temperature <= POLY_SWITCH_K) {
    return entropyPolyIntegral(s.aLow, temperature) + a7;
  }
  const atSwitch = entropyPolyIntegral(s.aLow, POLY_SWITCH_K) + a7;
  if (temperature < AL2O3_MELT_K) {
    return atSwitch + (entropyPolyIntegral(s.aHigh, temperature) - entropyPolyIntegral(s.aHigh, POLY_SWITCH_K));
  }
  const atMelt = atSwitch
    + (entropyPolyIntegral(s.aHigh, AL2O3_MELT_K) - entropyPolyIntegral(s.aHigh, POLY_SWITCH_K));
  const fusionEntropy = AL2O3_FUSION_J_PER_KMOL / AL2O3_MELT_K / R_UNIVERSAL; // ΔS_fusion/R
  return atMelt + fusionEntropy + AL2O3_LIQUID_CPR * Math.log(temperature / AL2O3_MELT_K);
}

/** g°(T)/RT = h°(T)/(RT) − s°(T)/R, with h° = ΔfH°(298) + ∫cp dT. */
function gOverRT(species: SpeciesName, temperature: number): number {
  const h = (SPECIES[species] as Nasa7Species).formationEnthalpy + sensibleEnthalpy(species, temperature);
  return h / (R_UNIVERSAL * temperature) - entropyIntegral(species, temperature);
}

/**
 * Solve the element-balanced Gibbs minimum of an ideal-gas mixture at fixed
 * temperature and pressure (NASA CEA element-potential method, module
 * header). `elements` maps element symbols to kmol of that element in the
 * feed (e.g. { H: 37.165, C: 8.889, O: 23.831, N: 5.958, Cl: 5.958,
 * Al: 6.672 }); `species` selects which equilibrium species may form.
 *
 * Throws on invalid inputs (non-finite/non-positive T or P, zero or
 * non-finite element populations, empty species list, unknown species) and
 * fails closed with an Error on non-convergence within MAX_ITERATIONS or on
 * any non-finite iterate — callers get either an element-balanced
 * equilibrium or an exception, never a silently wrong mix.
 */
export function solveEquilibrium(
  elements: Record<string, number>,
  species: SpeciesName[],
  temperature: number,
  pressure: number,
): EquilibriumResult {
  if (!Number.isFinite(temperature) || temperature < STANDARD_TEMPERATURE) {
    throw new RangeError(
      `solveEquilibrium: temperature must be finite and ≥ ${STANDARD_TEMPERATURE} K, got ${temperature}`,
    );
  }
  if (!Number.isFinite(pressure) || pressure <= 0) {
    throw new RangeError(`solveEquilibrium: pressure must be finite and > 0 Pa, got ${pressure}`);
  }
  const elementNames = Object.keys(elements);
  if (elementNames.length === 0) {
    throw new RangeError('solveEquilibrium: degenerate input — no elements supplied');
  }
  for (const el of elementNames) {
    const v = elements[el];
    if (!Number.isFinite(v) || v < 0 || !(v >= 0)) {
      throw new RangeError(`solveEquilibrium: element ${el} population must be finite and ≥ 0, got ${v}`);
    }
  }
  if (species.length === 0) {
    throw new RangeError('solveEquilibrium: species list is empty');
  }
  for (const sp of species) {
    if (!SPECIES[sp]) {
      throw new TypeError(`solveEquilibrium: unknown species ${sp}`);
    }
  }

  const m = elementNames.length; // number of element constraints
  const gasSpecies = species.filter((sp) => sp !== 'Al2O3');
  const wantsAl2O3 = species.includes('Al2O3');
  const condensedActive = wantsAl2O3 && (elements['Al'] ?? 0) > 0 && (elements['O'] ?? 0) > 0;

  // Degenerate limit: only condensed Al2O3 can form. The phase amount is
  // fixed by the Al balance alone; the O balance closes only if the feed is
  // stoichiometric — otherwise the problem is infeasible (fail closed).
  if (gasSpecies.length === 0) {
    if (!condensedActive) {
      throw new Error(
        'solveEquilibrium: condensed-only mixture with Al2O3 requires Al and O in the feed',
      );
    }
    const ncOnly = (elements['Al'] ?? 0) / 2;
    const oResidual = 3 * ncOnly - (elements['O'] ?? 0);
    if (Math.abs(oResidual) > 1e-9 * Math.max(1, elements['O'] ?? 0)) {
      throw new Error(
        `solveEquilibrium: condensed-only feed violates the O balance ` +
        `(Al/2 = ${ncOnly} kmol Al2O3 leaves ${oResidual.toExponential(3)} kmol O unbalanced) — infeasible`,
      );
    }
    const moles = {} as Record<SpeciesName, number>;
    for (const sp of species) moles[sp] = sp === 'Al2O3' ? ncOnly : 0;
    return { moles, converged: true, iterations: 0 };
  }
  const dim = m + 1 + (condensedActive ? 1 : 0); // (λ_M, y) [+ n_c]

  const a: number[][] = gasSpecies.map((sp) =>
    elementNames.map((el) => (ELEMENT_COMPOSITION[sp] as Record<string, number>)[el] ?? 0),
  );
  const ac = elementNames.map((el) => (ELEMENT_COMPOSITION.Al2O3 as Record<string, number>)[el] ?? 0);
  const b = elementNames.map((el) => elements[el]);

  // Per-species fugacity factor A_i = (P°/P)·exp(−g_i°/RT): n_i = N·A_i·exp(−a_i·λ).
  const p0OverP = STANDARD_PRESSURE / pressure;
  const gasActivity = gasSpecies.map((sp) => Math.exp(-gOverRT(sp, temperature)) * p0OverP);
  const condensedG = condensedActive ? gOverRT('Al2O3', temperature) : 0;

  // ---- Initial guess: least-squares fit of λ so n_i ≈ element-consistent
  // targets t_i (CEA-style composition seeding), y = ln N₀. This puts the
  // iterate in the Newton basin even when a species' fugacity factor is
  // astronomically large at λ = 0.
  const n0 = Math.max(1, b.reduce((s, v) => s + v, 0) / 2);
  const y0 = Math.log(n0);
  const totalGasAtoms = elementNames.map((_, j) => {
    let s = 0;
    for (let i = 0; i < gasSpecies.length; i++) s += a[i]![j]!;
    return s;
  });
  const targets = gasSpecies.map((_, i) => {
    let t = 0;
    for (let j = 0; j < m; j++) {
      const atoms = a[i]![j]!;
      if (atoms > 0 && b[j]! > 0 && totalGasAtoms[j]! > 0) {
        t += (b[j]! / 2) * (atoms / totalGasAtoms[j]!);
      }
    }
    return t;
  });

  let lambda = new Array<number>(m).fill(0);
  {
    // Normal equations (AᵀA)λ = Aᵀr over active species (t_i > 0).
    const rows: { av: number[]; rhs: number }[] = [];
    for (let i = 0; i < gasSpecies.length; i++) {
      if (targets[i]! > 0) {
        rows.push({ av: a[i]!, rhs: y0 + Math.log(gasActivity[i]!) - Math.log(targets[i]!) });
      }
    }
    if (rows.length > 0) {
      const ata: number[][] = [];
      const atr = new Array<number>(m).fill(0);
      for (let j = 0; j < m; j++) {
        ata.push(new Array<number>(m).fill(0));
      }
      for (const { av, rhs } of rows) {
        for (let j = 0; j < m; j++) {
          atr[j] = (atr[j] ?? 0) + av[j]! * rhs;
          for (let k = 0; k < m; k++) {
            (ata[j] as number[])[k] = (ata[j]![k] as number) + av[j]! * av[k]!;
          }
        }
      }
      const sol = solveLinear(ata, atr);
      lambda = sol.x; // skipped (rank-deficient) potentials stay 0
    }
  }
  let y = y0;
  let nc = condensedActive ? Math.max(0, (elements['Al'] ?? 0) / 2) : 0;

  const gasMoles = (lam: readonly number[], yy: number): number[] =>
    gasActivity.map((act, i) => {
      let dot = 0;
      for (let j = 0; j < m; j++) dot += a[i]![j]! * lam[j]!;
      return Math.exp(yy) * act * Math.exp(-dot);
    });

  const evaluate = (
    lam: readonly number[],
    yy: number,
    nCond: number,
  ): { n: number[]; r: number[] } => {
    const n = gasMoles(lam, yy);
    const r = new Array<number>(dim).fill(0);
    for (let j = 0; j < m; j++) {
      let s = 0;
      for (let i = 0; i < gasSpecies.length; i++) s += a[i]![j]! * n[i]!;
      if (condensedActive) s += ac[j]! * nCond;
      r[j] = s - b[j]!;
    }
    r[m] = n.reduce((s, v) => s + v, 0) - Math.exp(yy);
    if (condensedActive) {
      let dot = 0;
      for (let j = 0; j < m; j++) dot += ac[j]! * lam[j]!;
      r[m + 1] = condensedG + dot;
    }
    return { n, r };
  };

  const residualNorm2 = (r: readonly number[]): number => {
    let s = 0;
    for (const v of r) s += v * v;
    return s;
  };

  const converged = (r: readonly number[], n: readonly number[]): boolean => {
    for (let j = 0; j < m; j++) {
      if (Math.abs(r[j]!) > REL_TOL * Math.max(1, Math.abs(b[j]!))) return false;
    }
    const nSum = n.reduce((s, v) => s + v, 0);
    if (Math.abs(r[m]!) > REL_TOL * Math.max(1, nSum)) return false;
    if (condensedActive && Math.abs(r[m + 1]!) > ABS_TOL) return false;
    return true;
  };

  let iterations = 0;
  let state = { lam: lambda, yy: y, nC: nc };
  for (; iterations < MAX_ITERATIONS; iterations++) {
    const { n, r } = evaluate(state.lam, state.yy, state.nC);
    if (converged(r, n)) {
      return finalize(n, state.nC, iterations, gasSpecies, condensedActive, species);
    }
    for (const v of [...r, ...n, ...state.lam, state.yy, state.nC]) {
      if (!Number.isFinite(v)) {
        throw new Error(`solveEquilibrium: non-finite iterate after ${iterations} iterations`);
      }
    }

    // Jacobian of the residuals wrt (λ, y [, n_c]).
    const jac: number[][] = [];
    for (let j = 0; j < dim; j++) jac.push(new Array<number>(dim).fill(0));
    for (let j = 0; j < m; j++) {
      for (let k = 0; k < m; k++) {
        let s = 0;
        for (let i = 0; i < gasSpecies.length; i++) s += a[i]![j]! * a[i]![k]! * n[i]!;
        (jac[j] as number[])[k] = -s;
      }
      (jac[j] as number[])[m] = n.reduce((s, v, i) => s + a[i]![j]! * v, 0);
      if (condensedActive) (jac[j] as number[])[m + 1] = ac[j]!;
    }
    for (let k = 0; k < m; k++) {
      let s = 0;
      for (let i = 0; i < gasSpecies.length; i++) s += a[i]![k]! * n[i]!;
      (jac[m] as number[])[k] = -s;
    }
    // ∂(Σn − N)/∂y = Σn − N = r_N (N = exp y; both terms differentiate).
    (jac[m] as number[])[m] = n.reduce((s, v) => s + v, 0) - Math.exp(state.yy);
    if (condensedActive) (jac[m] as number[])[m + 1] = 0;
    if (condensedActive) {
      for (let k = 0; k < m; k++) (jac[m + 1] as number[])[k] = ac[k]!;
      (jac[m + 1] as number[])[m] = 0;
      (jac[m + 1] as number[])[m + 1] = 0;
    }

    // Levenberg–Marquardt damped Gauss–Newton step: solve
    // (JᵀJ + μI)δ = −Jᵀr, then backtrack on ‖r‖².
    const mu = damperFor(jac);
    const jtj: number[][] = [];
    for (let j = 0; j < dim; j++) {
      const row: number[] = [];
      for (let k = 0; k < dim; k++) {
        let s = 0;
        for (let i = 0; i < dim; i++) s += jac[i]![j]! * jac[i]![k]!;
        row.push(s + (j === k ? mu : 0));
      }
      jtj.push(row);
    }
    const jtr = (() => {
      const v = new Array<number>(dim).fill(0);
      for (let j = 0; j < dim; j++) {
        for (let i = 0; i < dim; i++) v[j] = (v[j] ?? 0) + jac[i]![j]! * r[i]!;
        v[j] = -(v[j] ?? 0);
      }
      return v;
    })();
    const delta = solveLinear(jtj, jtr).x;

    let cur = residualNorm2(r);
    let improved = false;
    let alpha = 1;
    for (let k = 0; k < 40 && !improved; k++) {
      const candLam = state.lam.map((v, j) => v + alpha * (delta[j] ?? 0));
      const candY = state.yy + alpha * (delta[m] ?? 0);
      const candNc = condensedActive ? Math.max(0, state.nC + alpha * (delta[m + 1] ?? 0)) : 0;
      const { n: cn, r: cr } = evaluate(candLam, candY, candNc);
      for (const v of [...cr, ...cn, ...candLam, candY, candNc]) {
        if (!Number.isFinite(v)) {
          alpha *= 0.5;
          continue;
        }
      }
      const cand = residualNorm2(cr);
      if (cand < cur) {
        state = { lam: candLam, yy: candY, nC: candNc };
        cur = cand;
        improved = true;
      } else {
        alpha *= 0.5;
      }
    }
    if (!improved) {
      throw new Error(
        `solveEquilibrium: no descent step found after ${iterations + 1} iterations ` +
        `(residual ‖r‖² = ${cur.toExponential(3)}) — problem may be infeasible`,
      );
    }
  }
  throw new Error(`solveEquilibrium: failed to converge within ${MAX_ITERATIONS} iterations`);
}

function finalize(
  n: number[],
  nC: number,
  iterations: number,
  gasSpecies: SpeciesName[],
  condensedActive: boolean,
  requested: SpeciesName[],
): EquilibriumResult {
  const moles = {} as Record<SpeciesName, number>;
  for (const sp of requested) {
    if (sp === 'Al2O3') {
      moles[sp] = condensedActive ? nC : 0;
    } else {
      moles[sp] = n[gasSpecies.indexOf(sp)]!;
    }
  }
  return { moles, converged: true, iterations: iterations + 1 };
}

/**
 * Levenberg–Marquardt regularization: tiny relative to the Jacobian scale so
 * full-rank problems take pure Gauss–Newton steps, but non-zero so
 * rank-deficient Jacobians (degenerate feasible limits, structurally
 * missing elements) still yield a finite descent direction.
 */
function damperFor(jac: readonly (readonly number[])[]): number {
  let scale = 0;
  for (const row of jac) {
    for (const v of row) {
      const av = Math.abs(v);
      if (av > scale) scale = av;
    }
  }
  return 1e-12 * (1 + scale * scale);
}

/** Solve A·x = rhs by Gaussian elimination with partial pivoting; columns
 *  without an acceptable pivot (rank deficiency) take x = 0. */
function solveLinear(a: number[][], rhs: number[]): { x: number[] } {
  const n = a.length;
  if (n === 0) return { x: [] };
  const aug = a.map((row, i) => [...row, rhs[i] as number]);
  let max0 = 0;
  for (const row of aug) {
    for (let j = 0; j < n; j++) max0 = Math.max(max0, Math.abs(row[j] as number));
  }
  const eps = 1e-13 * Math.max(1, max0);
  const pivotRow = new Array<number>(n).fill(-1);
  const pivotCol = new Array<number>(n).fill(-1);
  let rank = 0;
  for (let col = 0; col < n && rank < n; col++) {
    let p = -1;
    let best = 0;
    for (let i = rank; i < n; i++) {
      const v = Math.abs(aug[i]![col] as number);
      if (v > best) {
        best = v;
        p = i;
      }
    }
    if (p < 0 || best < eps) continue; // column is (numerically) dependent
    if (p !== rank) {
      const tmp = aug[p];
      aug[p] = aug[rank] as number[];
      aug[rank] = tmp;
    }
    const piv = aug[rank]![col] as number;
    for (let i = rank + 1; i < n; i++) {
      const factor = (aug[i]![col] as number) / piv;
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) {
        (aug[i] as number[])[j] = (aug[i]![j] as number) - factor * (aug[rank]![j] as number);
      }
    }
    pivotRow[rank] = col;
    pivotCol[col] = rank;
    rank++;
  }
  const x = new Array<number>(n).fill(0);
  for (let r = rank - 1; r >= 0; r--) {
    const col = pivotRow[r]!;
    let s = aug[r]![n] as number;
    for (let j = col + 1; j < n; j++) {
      s -= (aug[r]![j] as number) * x[j]!;
    }
    x[col] = s / (aug[r]![col] as number);
  }
  return { x };
}