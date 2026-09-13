/**
 * Gibbs-equilibrium solver contract tests.
 *
 * Covers the constrained element-potential minimizer (`solveEquilibrium`)
 * and the NASA-7 entropy integral (`entropyIntegral`):
 * - mass balance — element populations are conserved to 1e-9 (relative) for
 *   the APCP feed (gas + condensed Al2O3) and for a pure-gas dissociating
 *   mixture;
 * - pure-substance limit — a single species that exactly absorbs the feed
 *   returns unit molar amount (gas and condensed);
 * - APCP convergence — the 70/18/12 chamber at ≈3500 K / 100 bar converges
 *   to a mixture major-dominated by H2O/H2/CO/N2/HCl/Al2O3(l) with only
 *   minor CO2 and radicals, matching published CEA APCP trends
 *   (cf. Gordon & McBride, NASA RP-1311; the classic SRM equilibrium has
 *   CO, H2O, H2, N2, HCl, condensed Al2O3 as the principal products);
 * - fail-closed behavior — infeasible feeds and degenerate inputs throw
 *   rather than returning a silently wrong mixture;
 * - entropyIntegral — the a7 fit reproduces the tabulated S°_298 for every
 *   species.
 */
import { describe, it, expect } from 'vitest';
import { entropyIntegral, solveEquilibrium, type EquilibriumResult } from './gibbsEquilibrium';
import { R_UNIVERSAL, STANDARD_TEMPERATURE, type SpeciesName } from './nozzleChemistry';

/** Atoms of each element in one molecule of each species (structural data). */
const ELEMENT_COMPOSITION: Record<string, Record<string, number>> = {
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

/** Recompute element populations (kmol of each element) from a solution. */
function elementBalance(elements: Record<string, number>, result: EquilibriumResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(elements)) out[key] = 0;
  for (const [species, moles] of Object.entries(result.moles)) {
    const comp = ELEMENT_COMPOSITION[species];
    for (const [el, count] of Object.entries(comp)) {
      out[el] = (out[el] ?? 0) + count * moles;
    }
  }
  return out;
}

function worstRelativeElementResidual(elements: Record<string, number>, result: EquilibriumResult): number {
  const out = elementBalance(elements, result);
  let worst = 0;
  for (const key of Object.keys(elements)) {
    worst = Math.max(worst, Math.abs(out[key] - elements[key]) / Math.max(1, Math.abs(elements[key])));
  }
  return worst;
}

// Documented APCP feed (70% AP / 18% Al / 12% HTPB, kmol per kg propellant) —
// element counts match nozzleChemistry.ts APCP_MIXTURE.
const APCP_ELEMENTS = { H: 37.165, O: 23.831, C: 8.889, N: 5.958, Cl: 5.958, Al: 6.672 };
const APCP_SPECIES = ['H2O', 'CO2', 'CO', 'N2', 'HCl', 'Al2O3', 'H2', 'O2', 'O', 'H'] as const;

describe('solveEquilibrium — mass balance (elements in = elements out)', () => {
  it('conserves every element to 1e-9 for the APCP feed at 3500 K (gas + condensed)', () => {
    const result = solveEquilibrium(APCP_ELEMENTS, [...APCP_SPECIES], 3500, 1e7);
    expect(result.converged).toBe(true);
    expect(worstRelativeElementResidual(APCP_ELEMENTS, result)).toBeLessThan(1e-9);
  });

  it('conserves elements for a pure-gas dissociating H2O mixture', () => {
    const elements = { H: 2, O: 1 };
    const result = solveEquilibrium(elements, ['H2O', 'H2', 'O2', 'O', 'H'], 2500, 1e5);
    expect(worstRelativeElementResidual(elements, result)).toBeLessThan(1e-9);
  });

  it('conserves elements across a chamber-pressure sweep', () => {
    const elements = { H: 2, O: 1 };
    for (const pressure of [1e2, 1e5, 5e7]) {
      const result = solveEquilibrium(elements, ['H2O', 'H2', 'O2', 'O', 'H'], 3000, pressure);
      expect(worstRelativeElementResidual(elements, result)).toBeLessThan(1e-9);
    }
  });
});

describe('solveEquilibrium — pure-substance limit', () => {
  it('a single gas species exactly matching the feed returns unit amount', () => {
    expect(solveEquilibrium({ H: 2, O: 1 }, ['H2O'], 1000, 1e5).moles.H2O).toBeCloseTo(1, 9);
    expect(solveEquilibrium({ C: 1, O: 2 }, ['CO2'], 2000, 1e5).moles.CO2).toBeCloseTo(1, 9);
    expect(solveEquilibrium({ N: 2 }, ['N2'], 1000, 1e5).moles.N2).toBeCloseTo(1, 9);
    expect(solveEquilibrium({ H: 2 }, ['H2'], 1000, 1e5).moles.H2).toBeCloseTo(1, 9);
  });

  it('a single condensed species exactly matching the feed returns unit amount', () => {
    const result = solveEquilibrium({ Al: 2, O: 3 }, ['Al2O3'], 3500, 1e7);
    expect(result.moles.Al2O3).toBeCloseTo(1, 9);
    expect(result.converged).toBe(true);
  });
});

describe('solveEquilibrium — APCP chamber validation', () => {
  it('converges and is major-dominated by H2O/H2/CO/N2/HCl/Al2O3 with no exotic dominance', () => {
    const result = solveEquilibrium(APCP_ELEMENTS, [...APCP_SPECIES], 3500, 1e7);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThan(100);

    // Element closure: all Al → Al2O3(l), all Cl → HCl, all N → N2.
    expect(result.moles.Al2O3).toBeCloseTo(APCP_ELEMENTS.Al / 2, 6);
    expect(result.moles.HCl).toBeCloseTo(APCP_ELEMENTS.Cl, 6);
    expect(result.moles.N2).toBeCloseTo(APCP_ELEMENTS.N / 2, 6);
    // All carbon in CO + CO2.
    expect(result.moles.CO + result.moles.CO2).toBeCloseTo(APCP_ELEMENTS.C, 6);

    // The documented majors dominate the mixture (> 90% by mole) — matching
    // published CEA APCP trends (Gordon & McBride, NASA RP-1311): chamber
    // products are chiefly CO, H2O, H2, N2, HCl and condensed Al2O3(l), with
    // CO2 and the H/O/O2 radicals present only as dissociation minorities.
    const total = Object.values(result.moles).reduce((s, v) => s + v, 0);
    const majors = ['H2O', 'H2', 'CO', 'N2', 'HCl', 'Al2O3'] as const;
    const majorsShare = majors.reduce((s, sp) => s + result.moles[sp], 0) / total;
    expect(majorsShare).toBeGreaterThan(0.9);

    // No exotic dominance: radicals and molecular O2 stay minor.
    expect(result.moles.O2 / total).toBeLessThan(0.05);
    expect(result.moles.O / total).toBeLessThan(0.05);
    expect(result.moles.CO2 / total).toBeLessThan(0.05);
  });
});

describe('solveEquilibrium — fail closed on non-convergence and degenerate input', () => {
  it('throws when an element has no consuming species (infeasible feed)', () => {
    // Fe appears in no listed species → element balance can never close.
    expect(() => solveEquilibrium({ Fe: 1 }, ['H2'], 1500, 1e5)).toThrow();
    // C present in the feed but absent from every selected species.
    expect(() => solveEquilibrium({ C: 1 }, ['N2', 'H2O'], 1500, 1e5)).toThrow();
  });

  it('throws on a condensed-only feed that violates the O balance', () => {
    // {Al:1,O:3} → 0.5 kmol Al2O3 consumes only 1.5 O; 1.5 O left unplaced.
    expect(() => solveEquilibrium({ Al: 1, O: 3 }, ['Al2O3'], 3500, 1e7)).toThrow();
  });

  it('throws on degenerate zero elements', () => {
    expect(() => solveEquilibrium({}, ['H2'], 1500, 1e5)).toThrow();
  });

  it('throws on non-finite or non-positive inputs', () => {
    expect(() => solveEquilibrium({ H: 2 }, ['H2'], 0, 1e5)).toThrow();
    expect(() => solveEquilibrium({ H: 2 }, ['H2'], 1500, 0)).toThrow();
    expect(() => solveEquilibrium({ H: Number.NaN }, ['H2'], 1500, 1e5)).toThrow();
    expect(() => solveEquilibrium({ H: 2 }, ['H2'], Number.POSITIVE_INFINITY, 1e5)).toThrow();
  });

  it('throws on unknown or empty species lists', () => {
    expect(() => solveEquilibrium({ H: 2 }, [] as never[], 1500, 1e5)).toThrow();
    expect(() => solveEquilibrium({ H: 2 }, ['Bogus'] as never[], 1500, 1e5)).toThrow();
  });
});

describe('entropyIntegral — NASA-7 a7 fit anchored at S°(298.15 K)', () => {
  // Fit S°_298 from NIST/JANAF: s°/R = a1·lnT + a2T + a3T²/2 + a4T³/3 +
  // a5T⁴/4 + a7 with a7 chosen so s°(298.15)/R = S°_298/R.
  const S298_J_PER_MOL_K: Record<SpeciesName, number> = {
    H2O: 188.835, H2: 130.680, CO2: 213.795, CO: 197.660, N2: 191.609,
    HCl: 186.902, O2: 205.152, O: 161.059, H: 114.716, Al2O3: 50.92,
  };
  it('reproduces S°(298.15 K) for H2O', () => {
    expect((entropyIntegral('H2O', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['H2O'], 6);
  });
  it('reproduces S°(298.15 K) for H2', () => {
    expect((entropyIntegral('H2', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['H2'], 6);
  });
  it('reproduces S°(298.15 K) for CO2', () => {
    expect((entropyIntegral('CO2', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['CO2'], 6);
  });
  it('reproduces S°(298.15 K) for CO', () => {
    expect((entropyIntegral('CO', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['CO'], 6);
  });
  it('reproduces S°(298.15 K) for N2', () => {
    expect((entropyIntegral('N2', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['N2'], 6);
  });
  it('reproduces S°(298.15 K) for HCl', () => {
    expect((entropyIntegral('HCl', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['HCl'], 6);
  });
  it('reproduces S°(298.15 K) for O2', () => {
    expect((entropyIntegral('O2', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['O2'], 6);
  });
  it('reproduces S°(298.15 K) for O', () => {
    expect((entropyIntegral('O', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['O'], 6);
  });
  it('reproduces S°(298.15 K) for H', () => {
    expect((entropyIntegral('H', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['H'], 6);
  });
  it('reproduces S°(298.15 K) for Al2O3', () => {
    expect((entropyIntegral('Al2O3', STANDARD_TEMPERATURE) * R_UNIVERSAL) / 1000).toBeCloseTo(
      S298_J_PER_MOL_K['Al2O3'], 6);
  });
});
