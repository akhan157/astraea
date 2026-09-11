import { describe, expect, it } from 'vitest';
import {
  describeUncertaintyDisplay,
  defaultImpulseSigma,
  sigmaForImpulseClass,
  SUPPORTED_IMPULSE_CLASSES,
} from './motorVariance';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

describe('sigmaForImpulseClass', () => {
  it(`covers every NAR class A–O with a finite positive sigma`, () => {
    expect(SUPPORTED_IMPULSE_CLASSES).toEqual('ABCDEFGHIJKLMNO'.split(''));
    for (const cls of SUPPORTED_IMPULSE_CLASSES) {
      const v = sigmaForImpulseClass(cls);
      expect(Number.isFinite(v.sigmaPct), `class ${cls} sigmaPct`).toBe(true);
      expect(v.sigmaPct, `class ${cls} sigmaPct`).toBeGreaterThan(0);
      const [lo, hi] = v.typicalRangePct;
      expect(lo, `class ${cls} range low`).toBeLessThan(0);
      expect(hi, `class ${cls} range high`).toBeGreaterThan(0);
      expect(hi, `class ${cls} range symmetric`).toBeCloseTo(-lo, 12);
      // Spec band: ±6–10% of stated total impulse.
      expect(hi, `class ${cls} range width`).toBeGreaterThanOrEqual(6);
      expect(hi, `class ${cls} range width`).toBeLessThanOrEqual(10);
      expect(v.note, `class ${cls} note`).toContain(`±${hi}%`);
    }
  });

  it('tapers sigma monotonically from the small classes toward the large ones', () => {
    const sigmas = SUPPORTED_IMPULSE_CLASSES.map((c) => sigmaForImpulseClass(c).sigmaPct);
    for (let i = 1; i < sigmas.length; i++) {
      expect(sigmas[i], `class ${SUPPORTED_IMPULSE_CLASSES[i]} sigma`).toBeLessThanOrEqual(sigmas[i - 1]);
    }
    expect(sigmas[0]).toBe(10); // A–E: full ±10% band
    expect(sigmas[sigmas.length - 1]).toBe(6); // L–O: tapered ±6%
  });

  it('throws on degenerate or out-of-domain classes', () => {
    const degenerate = ['', 'AA', 'Z', 'P', 'c', '3', 'H3', '~', 'CLASS_A'];
    for (const bad of degenerate) {
      expect(() => sigmaForImpulseClass(bad), `class ${JSON.stringify(bad)}`).toThrow();
    }
  });
});

describe('describeUncertaintyDisplay', () => {
  it('renders both the TYPICAL certification range and the ESTIMATE model assumption', () => {
    const display = describeUncertaintyDisplay('C');
    expect(display.typical).toContain('TYPICAL range');
    expect(display.typical).toContain('-10%');
    expect(display.typical).toContain('+10%');
    expect(display.typical).toContain('certification tolerance');
    expect(display.estimate).toContain('ESTIMATE');
    expect(display.estimate).toContain('1σ');
    expect(display.estimate).toContain('6.7%'); // NFPA 1125 σ ceiling named as ground truth
    // TYPICAL (certification fact) and ESTIMATE (model assumption) are distinct claims.
    expect(display.typical).not.toContain('ESTIMATE');
    expect(display.estimate).not.toContain('TYPICAL');
  });

  it('renders an honest display for every supported class', () => {
    for (const cls of SUPPORTED_IMPULSE_CLASSES) {
      const display = describeUncertaintyDisplay(cls);
      expect(display.typical).toContain(`class ${cls}`);
      expect(display.typical).toContain('TYPICAL range');
      expect(display.estimate).toContain('ESTIMATE');
    }
  });

  it('throws on degenerate classes', () => {
    expect(() => describeUncertaintyDisplay('')).toThrow();
    expect(() => describeUncertaintyDisplay('AA')).toThrow();
  });
});

describe('defaultImpulseSigma', () => {
  it('suggests the class-table sigma for a certified motor, from totalImpulse', () => {
    const motor = CERTIFIED_MOTORS.estes_c6; // 8.8 N*s => class C
    expect(defaultImpulseSigma(motor)).toBe(sigmaForImpulseClass('C').sigmaPct);
  });

  it('throws rather than guessing a class from a degenerate totalImpulse', () => {
    const base = CERTIFIED_MOTORS.estes_c6;
    for (const totalImpulse of [NaN, Infinity, 0, -5]) {
      expect(() => defaultImpulseSigma({ ...base, totalImpulse })).toThrow();
    }
  });
});