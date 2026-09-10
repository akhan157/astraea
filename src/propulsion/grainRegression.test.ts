/**
 * Grain regression contract tests (web-based geometry lane).
 *
 * The regression traces are purely geometric: sampled per burned web depth
 * from the exact cylindrical-core formulas (BATES) or the analytic
 * star-perimeter approximation, so zero-web samples must reproduce the
 * initial geometry exactly, traces must reach burnout (remaining volume 0)
 * at the full web, and chamber pressure must follow the open-closed
 * mass balance m_dot = rho*A_b*r, Pc = m_dot * c* / A_t (positive, finite,
 * exactly linear in burn area). Fail-closed validation: degenerate or
 * non-finite inputs throw RangeError.
 */
import { describe, it, expect } from 'vitest';
import {
  chamberPressure,
  regressBates,
  regressStar,
  type BatesGrain,
  type GrainRegressionTrace,
  type StarGrain,
} from './grainRegression';

const BATES_NEUTRAL: BatesGrain = {
  outerDiameter: 0.06, // m
  length: 0.2, // m
  coreDiameter: 0.048, // m, thin web: (0.06-0.048)/2 = 6 mm
  inhibitedEnds: true,
};

const BATES_OPEN_ENDS: BatesGrain = {
  outerDiameter: 0.06,
  length: 0.2,
  coreDiameter: 0.04,
  inhibitedEnds: false,
};

const STAR: StarGrain = {
  outerDiameter: 0.07,
  length: 0.25,
  points: 5,
  valleyRadius: 0.012,
};

const BATES_STEP = 0.0005;
const STAR_STEP = 0.0008;
const RATE = 0.004; // m/s constant linear burn rate

describe('grain regression: zero web reproduces initial geometry exactly', () => {
  it('BATES with inhibited ends: core circle, lateral wall, full annulus volume', () => {
    const t = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    const coreR = BATES_NEUTRAL.coreDiameter / 2;
    const outerR = BATES_NEUTRAL.outerDiameter / 2;
    expect(t.webBurned[0]).toBe(0);
    expect(t.portArea[0]).toBeCloseTo(Math.PI * coreR * coreR, 12);
    expect(t.burnArea[0]).toBeCloseTo(2 * Math.PI * coreR * BATES_NEUTRAL.length, 12);
    expect(t.volumeRemaining[0]).toBeCloseTo(
      Math.PI * (outerR * outerR - coreR * coreR) * BATES_NEUTRAL.length,
      12,
    );
  });

  it('BATES with uninhibited ends adds both annular end faces', () => {
    const t = regressBates(BATES_OPEN_ENDS, BATES_STEP, RATE);
    const coreR = BATES_OPEN_ENDS.coreDiameter / 2;
    const outerR = BATES_OPEN_ENDS.outerDiameter / 2;
    const annulus = Math.PI * (outerR * outerR - coreR * coreR);
    expect(t.burnArea[0]).toBeCloseTo(
      2 * Math.PI * coreR * BATES_OPEN_ENDS.length + 2 * annulus,
      12,
    );
  });

  it('star: analytic perimeter 2*pi*valleyR + 2*points*(outerR - valleyR)', () => {
    const t = regressStar(STAR, STAR_STEP, RATE);
    const outerR = STAR.outerDiameter / 2;
    const perimeter = 2 * Math.PI * STAR.valleyRadius + 2 * STAR.points * (outerR - STAR.valleyRadius);
    expect(t.webBurned[0]).toBe(0);
    expect(t.burnArea[0]).toBeCloseTo(perimeter * STAR.length, 12);
    expect(t.portArea[0]).toBeCloseTo(Math.PI * STAR.valleyRadius * STAR.valleyRadius, 12);
    expect(t.volumeRemaining[0]).toBeCloseTo(
      Math.PI * (outerR * outerR - STAR.valleyRadius * STAR.valleyRadius) * STAR.length,
      12,
    );
  });
});

describe('grain regression: trace structure and burnout', () => {
  it('web advances by webStep from 0 to the full web and all arrays align', () => {
    const t = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    expect(t.burnArea.length).toBe(t.webBurned.length);
    expect(t.portArea.length).toBe(t.webBurned.length);
    expect(t.volumeRemaining.length).toBe(t.webBurned.length);
    for (let i = 0; i < t.webBurned.length; i++) {
      expect(t.webBurned[i]).toBeCloseTo(i * BATES_STEP, 12);
      expect(t.portArea[i]).toBeGreaterThan(0);
      expect(t.burnArea[i]).toBeGreaterThan(0);
      expect(t.volumeRemaining[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('full web burns the grain out: remaining volume 0, port at outer radius', () => {
    const bates = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    const lastB = bates.webBurned.length - 1;
    expect(bates.webBurned[lastB]).toBeCloseTo(
      BATES_NEUTRAL.outerDiameter / 2 - BATES_NEUTRAL.coreDiameter / 2,
      12,
    );
    expect(bates.volumeRemaining[lastB]).toBeCloseTo(0, 12);
    expect(bates.portArea[lastB]).toBeCloseTo(
      Math.PI * (BATES_NEUTRAL.outerDiameter / 2) ** 2,
      6,
    );

    const star = regressStar(STAR, STAR_STEP, RATE);
    const lastS = star.webBurned.length - 1;
    expect(star.webBurned[lastS]).toBeCloseTo(STAR.outerDiameter / 2 - STAR.valleyRadius, 12);
    expect(star.volumeRemaining[lastS]).toBeCloseTo(0, 12);
    expect(star.portArea[lastS]).toBeCloseTo(Math.PI * (STAR.outerDiameter / 2) ** 2, 6);
  });

  it('5-point star burns neutral-to-regressive: burn area never increases', () => {
    const t = regressStar(STAR, STAR_STEP, RATE);
    for (let i = 1; i < t.burnArea.length; i++) {
      expect(t.burnArea[i]).toBeLessThanOrEqual(t.burnArea[i - 1]);
    }
  });
});

describe('grain regression: BATES neutral trace over the first half of the web', () => {
  it('burn area varies less than 15% for a thin-web inhibited BATES grain', () => {
    const t = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    const maxWeb = (BATES_NEUTRAL.outerDiameter - BATES_NEUTRAL.coreDiameter) / 2;
    const half = t.webBurned.filter((w) => w <= maxWeb / 2).length;
    const firstHalf = t.burnArea.slice(0, half);
    const min = Math.min(...firstHalf);
    const max = Math.max(...firstHalf);
    expect(max).toBeGreaterThan(min);
    expect((max - min) / min).toBeLessThan(0.15);
  });
});

describe('chamber pressure: open-closed mass balance', () => {
  const RHO = 1800; // kg/m^3
  const CSTAR = 1500; // m/s
  const THROAT = 4e-4; // m^2

  it('reproduces Pc = rho*A_b*r*c*/A_t exactly and stays finite', () => {
    const A = 0.0314; // m^2
    const r = 0.004; // m/s
    const Pc = chamberPressure(A, r, RHO, CSTAR, THROAT);
    expect(Pc).toBeCloseTo((RHO * A * r * CSTAR) / THROAT, 12);
    expect(Number.isFinite(Pc)).toBe(true);
    expect(Pc).toBeGreaterThan(0);
  });

  it('is exactly linear in burn area: doubling A doubles Pc', () => {
    const A = 0.02;
    const Pc = chamberPressure(A, RATE, RHO, CSTAR, THROAT);
    const PcDouble = chamberPressure(2 * A, RATE, RHO, CSTAR, THROAT);
    expect(PcDouble).toBeCloseTo(2 * Pc, 12);
    // Additivity: Pc(A1) + Pc(A2) == Pc(A1 + A2).
    const A1 = 0.013;
    const A2 = 0.027;
    const sum = chamberPressure(A1, RATE, RHO, CSTAR, THROAT) + chamberPressure(A2, RATE, RHO, CSTAR, THROAT);
    expect(chamberPressure(A1 + A2, RATE, RHO, CSTAR, THROAT)).toBeCloseTo(sum, 12);
  });

  it('coupled to the regression trace: every step yields a positive finite Pc', () => {
    const t = regressBates(BATES_NEUTRAL, BATES_STEP, RATE);
    const scale = (RHO * RATE * CSTAR) / THROAT;
    for (let i = 0; i < t.burnArea.length; i++) {
      const Pc = chamberPressure(t.burnArea[i], RATE, RHO, CSTAR, THROAT);
      expect(Number.isFinite(Pc)).toBe(true);
      expect(Pc).toBeGreaterThan(0);
      expect(Pc).toBeCloseTo(scale * t.burnArea[i], 9);
    }
  });
});

describe('grain regression: fail-closed validation', () => {
  it('rejects non-positive or non-finite step and burn-rate inputs', () => {
    for (const bad of [0, -1e-4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => regressBates(BATES_NEUTRAL, bad, RATE)).toThrow(RangeError);
      expect(() => regressBates(BATES_NEUTRAL, BATES_STEP, bad)).toThrow(RangeError);
      expect(() => regressStar(STAR, bad, RATE)).toThrow(RangeError);
      expect(() => regressStar(STAR, STAR_STEP, bad)).toThrow(RangeError);
    }
  });

  it('rejects degenerate grain geometry', () => {
    expect(() =>
      regressBates({ ...BATES_NEUTRAL, coreDiameter: BATES_NEUTRAL.outerDiameter }, BATES_STEP, RATE),
    ).toThrow(RangeError);
    expect(() => regressBates({ ...BATES_NEUTRAL, coreDiameter: 0.07 }, BATES_STEP, RATE)).toThrow(RangeError);
    expect(() => regressStar({ ...STAR, points: 2 }, STAR_STEP, RATE)).toThrow(RangeError);
    expect(() => regressStar({ ...STAR, points: 5.5 }, STAR_STEP, RATE)).toThrow(RangeError);
    expect(() => regressStar({ ...STAR, valleyRadius: 0.04 }, STAR_STEP, RATE)).toThrow(RangeError);
  });

  it('rejects non-positive chamber-pressure inputs', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => chamberPressure(bad, RATE, 1800, 1500, 4e-4)).toThrow(RangeError);
      expect(() => chamberPressure(0.02, bad, 1800, 1500, 4e-4)).toThrow(RangeError);
      expect(() => chamberPressure(0.02, RATE, bad, 1500, 4e-4)).toThrow(RangeError);
      expect(() => chamberPressure(0.02, RATE, 1800, bad, 4e-4)).toThrow(RangeError);
      expect(() => chamberPressure(0.02, RATE, 1800, 1500, bad)).toThrow(RangeError);
    }
  });

  it('throws on a non-finite/overflow pressure result from finite inputs', () => {
    // Finite positive inputs whose product overflows to Infinity must fail
    // closed on the RESULT, not silently emit Infinity.
    expect(() => chamberPressure(Number.MAX_VALUE, RATE, 1800, 1500, 4e-4)).toThrow(RangeError);
    expect(() => chamberPressure(1e200, 1e200, 1e200, 1e200, 1e-200)).toThrow(RangeError);
  });
});

/** Type-level smoke: consumer receives the full regression trace shape. */
function burnTraceSummary(t: GrainRegressionTrace): string {
  return `${t.webBurned.length} samples, last burn area ${t.burnArea[t.burnArea.length - 1].toFixed(4)} m^2`;
}
void burnTraceSummary;