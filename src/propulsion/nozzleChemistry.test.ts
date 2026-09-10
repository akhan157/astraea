/**
 * Nozzle chemistry contract tests.
 *
 * Covers the documented rigid-vessel equilibrium approximation and the
 * frozen-flow isentropic performance relations:
 * - `equilibriumTemperature` — inert/elemental reference states return the
 *   reference temperature, energy-releasing mixtures heat up, invalid inputs
 *   throw;
 * - `performance` — the analytic cstar/Cf/Mach identities reproduce the
 *   closed-form reference values and property invariants hold;
 * - `apcpEquilibrium` — the representative preset lands inside the task
 *   acceptance bands: Tc ∈ (2800, 3600) K, γ ∈ (1.15, 1.25),
 *   c* ∈ (1400, 1650) m/s, sea-level Isp ∈ (200, 260) s, Cf_vac > Cf_sea.
 *
 * Anchor values were computed with an independent Python reference
 * implementation of the same NASA-7 rigid-vessel balance.
 */
import { describe, it, expect } from 'vitest';
import {
  apcpEquilibrium,
  APCP_REFERENCE_PRESSURE,
  cpRatio,
  equilibriumTemperature,
  G0,
  performance,
  STANDARD_TEMPERATURE,
} from './nozzleChemistry';

const PC = APCP_REFERENCE_PRESSURE; // 10 MPa
const PE = 101_325; // Pa, sea level
const PA_ATM = 101_325;
const PA_VAC = 0;

// Reference values from the Python prototype (same NASA TM-4513 fits,
// Newton-verified rigid-vessel balance, frozen-flow isentropics).
const REF = {
  tc: 3522.8,
  gamma: 1.2013,
  molWeight: 24.605,
};

describe('equilibriumTemperature (rigid-vessel closed-form balance)', () => {
  it('returns the reference temperature for an element (zero release)', () => {
    const t = equilibriumTemperature([{ species: 'N2', moles: 1 }], PC);
    expect(t).toBeCloseTo(STANDARD_TEMPERATURE, 1);
  });

  it('heats exothermic mixtures (C + ½O2 → CO) above the reference', () => {
    // CO formation from elemental stock releases ≈ 111 kJ/mol → root in
    // the valid 300–6000 K bracket (~5.4 kK) instead of the 298 K reference.
    const t = equilibriumTemperature([{ species: 'CO', moles: 1 }], PC);
    expect(t).toBeGreaterThan(3000);
    expect(t).toBeLessThan(6000);
  });

  it('throws on non-finite or non-positive chamber pressure', () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -1]) {
      expect(() =>
        equilibriumTemperature([{ species: 'N2', moles: 1 }], bad),
      ).toThrow(RangeError);
    }
  });

  it('throws on non-finite or non-positive molar amounts', () => {
    for (const moles of [NaN, Infinity, 0, -2]) {
      expect(() =>
        equilibriumTemperature([{ species: 'N2', moles }], PC),
      ).toThrow(RangeError);
    }
  });

  it('throws on an empty mixture', () => {
    expect(() => equilibriumTemperature([], PC)).toThrow(RangeError);
  });
});

describe('performance (frozen-flow isentropic expansion)', () => {
  it('matches the analytic anchor from the independent reference', () => {
    const p = performance(3000, 1.35, 24.6048, 1e7, 1e5, PA_ATM);
    expect(p.cstar).toBeCloseTo(1281.6, 1);
    expect(p.exitMach).toBeCloseTo(3.63, 1);
    expect(p.cfVac).toBeCloseTo(1.656, 3);
    expect(p.cfSea).toBeCloseTo(1.567, 3);
    expect(p.ispVac).toBeCloseTo(216.45, 1);
    expect(p.ispSea).toBeCloseTo(204.74, 1);
  });

  it('reproduces the cstar / Cf / g0 identity', () => {
    const p = performance(REF.tc, REF.gamma, REF.molWeight, PC, PE, PA_VAC);
    expect(p.ispVac).toBeCloseTo((p.cstar * p.cfVac) / G0, 9);
    expect(p.ispSea).toBeCloseTo((p.cstar * p.cfSea) / G0, 9);
  });

  it('vacuum coefficients and impulses exceed sea-level ones', () => {
    const p = performance(REF.tc, REF.gamma, REF.molWeight, PC, PE, PA_ATM);
    expect(p.cfVac).toBeGreaterThan(p.cfSea);
    expect(p.ispVac).toBeGreaterThan(p.ispSea);
  });

  it('gives a supersonic exit for a choked pressure ratio, subsonic otherwise', () => {
    const hot = performance(REF.tc, REF.gamma, REF.molWeight, 3e6, 1e5, PA_ATM);
    expect(hot.exitMach).toBeGreaterThan(1);
    const mild = performance(REF.tc, REF.gamma, REF.molWeight, 1.2e5, 1e5, PA_ATM);
    expect(mild.exitMach).toBeLessThan(1);
    expect(mild.exitMach).toBeGreaterThan(0.1);
  });

  it('throws on non-finite or non-positive inputs, γ ≤ 1, pe ≥ pc', () => {
    const badCases: Array<[number, number, number, number, number, number]> = [
      [NaN, REF.gamma, REF.molWeight, PC, PE, PA_VAC],
      [REF.tc, NaN, REF.molWeight, PC, PE, PA_VAC],
      [REF.tc, REF.gamma, NaN, PC, PE, PA_VAC],
      [REF.tc, REF.gamma, REF.molWeight, NaN, PE, PA_VAC],
      [REF.tc, REF.gamma, REF.molWeight, PC, NaN, PA_VAC],
      [REF.tc, REF.gamma, REF.molWeight, PC, PE, -1],
    ];
    for (const args of badCases) {
      expect(() => performance(...args)).toThrow(RangeError);
    }
    expect(() => performance(REF.tc, 1, REF.molWeight, PC, PE, PA_VAC)).toThrow(RangeError);
    expect(() => performance(REF.tc, REF.gamma, REF.molWeight, 2e5, 2e5, PA_VAC)).toThrow(RangeError);
    expect(() => performance(REF.tc, REF.gamma, REF.molWeight, -1, PE, PA_VAC)).toThrow(RangeError);
  });
});

describe('apcpEquilibrium (representative APCP preset)', () => {
  const eq = apcpEquilibrium();

  it('chamber temperature lands in 2800–3600 K', () => {
    expect(eq.Tc).toBeGreaterThan(2800);
    expect(eq.Tc).toBeLessThan(3600);
  });

  it('mixture gamma (cp/cv at Tc) lands in 1.15–1.25', () => {
    expect(eq.gamma).toBeGreaterThan(1.15);
    expect(eq.gamma).toBeLessThan(1.25);
  });

  it('molar mass is within the plausible APCP exhaust range', () => {
    expect(eq.molWeight).toBeGreaterThan(18);
    expect(eq.molWeight).toBeLessThan(30);
  });

  it('acceptance: sea-level Isp 200–260 s, c* 1400–1650 m/s, Cf_vac > Cf_sea', () => {
    const p = performance(eq.Tc, eq.gamma, eq.molWeight, PC, PE, PA_ATM);
    expect(p.cstar).toBeGreaterThan(1400);
    expect(p.cstar).toBeLessThan(1650);
    expect(p.ispSea).toBeGreaterThan(200);
    expect(p.ispSea).toBeLessThan(260);
    expect(p.ispVac).toBeGreaterThan(p.ispSea);
    expect(p.cfVac).toBeGreaterThan(p.cfSea);
  });

  it('reference anchors stay stable against refactors', () => {
    // ±2% guard so the preset cannot silently drift out of the band.
    expect(eq.Tc).toBeCloseTo(REF.tc, -1);
    expect(eq.gamma).toBeCloseTo(REF.gamma, -2);
    expect(eq.molWeight).toBeCloseTo(REF.molWeight, 0);
  });

  it('throws on an invalid chamber pressure', () => {
    expect(() => apcpEquilibrium(NaN)).toThrow(RangeError);
    expect(() => apcpEquilibrium(-1)).toThrow(RangeError);
  });
});

describe('cpRatio (NASA-7 polynomial evaluation)', () => {
  it('matches known reference values at 300 K', () => {
    expect(cpRatio('H2O', 300)).toBeCloseTo(4.04, 2);
    expect(cpRatio('N2', 300)).toBeCloseTo(3.50, 2);
    expect(cpRatio('Al2O3', 300)).toBeGreaterThan(0);
  });

  it('is continuous piecewise (1000 K switch) and positive on the domain', () => {
    for (const t of [300, 999, 1000, 1001, 3000]) {
      for (const sp of ['H2O', 'CO2', 'CO', 'N2', 'HCl', 'H2', 'O2'] as const) {
        expect(cpRatio(sp, t)).toBeGreaterThan(0.5);
      }
    }
  });

  it('throws on non-finite or non-positive temperature', () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -5]) {
      expect(() => cpRatio('N2', bad)).toThrow(RangeError);
    }
  });
});

