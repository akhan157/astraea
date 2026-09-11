import { describe, it, expect } from 'vitest';
import { computeFinStructuralLoads, FinStructuralLoadInput } from './finStructure';
import { computeTrapezoidFinAero } from './barrowman';
import { FinCrossSection, STANDARD_MATERIALS, TrapezoidFinSetComponent } from '../core/types';

const validInput: FinStructuralLoadInput = {
  rootChord: 0.1,
  tipChord: 0.1,
  span: 0.2,
  sweepLength: 0.0,
  thickness: 0.003,
  crossSection: 'square',
  finCount: 4,
  materialId: 'aluminum',
  dynamicPressure: 10000.0,
  normalForceCoefficient: 2.0,
  refArea: 0.01,
};

describe('Finite-Structural: fin root loads, deflection, frequency', () => {
  it('matches the closed-form uniform cantilever solution', () => {
    const res = computeFinStructuralLoads(validInput);

    // N_total = q * S_ref * CN = 200 N; per fin N_f = 50 N; uniform-chord arm = s / 2.
    const forcePerFin = 10000.0 * 0.01 * 2.0 / 4.0;
    expect(res.rootBendingMomentNm).toBeCloseTo(forcePerFin * 0.1, 9);

    // sigma = M / Z, Z = cr t^2 / 6.
    const stressPa = 6.0 * (forcePerFin * 0.1) / (0.1 * 0.003 * 0.003);
    expect(res.rootBendingStressMPa).toBeCloseTo(stressPa / 1e6, 6);
    expect(res.safetyFactorVsYield).toBeCloseTo(276.0e6 / stressPa, 6);

    // Uniform cantilever, distributed load: delta = N_f s^3 / (8 E I), I = c t^3 / 12.
    const E = 68.9e9;
    const inertia = 0.1 * 0.003 ** 3 / 12.0;
    expect(res.tipDeflectionM).toBeCloseTo(forcePerFin * 0.2 ** 3 / (8.0 * E * inertia), 6);

    // f1 = (1.875^2 / 2 pi) sqrt(E I / (rho A L^4)), A = mean chord * t.
    const expectedFreq =
      (1.875 ** 2 / (2.0 * Math.PI)) *
      Math.sqrt(E * inertia / (2700.0 * 0.1 * 0.003 * 0.2 ** 4));
    expect(res.firstModeFreqHz).toBeCloseTo(expectedFreq, 6);
  });

  it('scales linearly in dynamic pressure and as 1/t^3 in thickness', () => {
    const base = computeFinStructuralLoads(validInput);

    const q2 = computeFinStructuralLoads({ ...validInput, dynamicPressure: 2 * validInput.dynamicPressure });
    expect(q2.rootBendingMomentNm).toBeCloseTo(2 * base.rootBendingMomentNm, 9);
    expect(q2.rootBendingStressMPa).toBeCloseTo(2 * base.rootBendingStressMPa, 9);
    expect(q2.tipDeflectionM).toBeCloseTo(2 * base.tipDeflectionM, 9);
    expect(q2.safetyFactorVsYield).toBeCloseTo(base.safetyFactorVsYield / 2, 9);

    // deflection ~ 1/t^3, stress ~ 1/t^2, moment independent of t, frequency ~ t.
    const thin = computeFinStructuralLoads({ ...validInput, thickness: validInput.thickness / 2 });
    expect(thin.tipDeflectionM).toBeCloseTo(8 * base.tipDeflectionM, 9);
    expect(thin.rootBendingStressMPa).toBeCloseTo(4 * base.rootBendingStressMPa, 9);
    expect(thin.rootBendingMomentNm).toBeCloseTo(base.rootBendingMomentNm, 9);
    expect(thin.firstModeFreqHz).toBeCloseTo(base.firstModeFreqHz / 2, 9);
  });

  it('scales the safety factor with yield strength and modulus', () => {
    const base = computeFinStructuralLoads(validInput);

    const stronger = computeFinStructuralLoads({ ...validInput, yieldStrengthMPa: 2 * 276 });
    expect(stronger.safetyFactorVsYield).toBeCloseTo(2 * base.safetyFactorVsYield, 9);

    // Stiffer material: deflection ~ 1/E, frequency ~ sqrt(E); loads unchanged.
    const stiffer = computeFinStructuralLoads({ ...validInput, youngsModulusGPa: 2 * 68.9 });
    expect(stiffer.tipDeflectionM).toBeCloseTo(base.tipDeflectionM / 2, 9);
    expect(stiffer.firstModeFreqHz).toBeCloseTo(base.firstModeFreqHz * Math.SQRT2, 9);
    expect(stiffer.rootBendingMomentNm).toBeCloseTo(base.rootBendingMomentNm, 9);
    expect(stiffer.rootBendingStressMPa).toBeCloseTo(base.rootBendingStressMPa, 9);
  });

  it('accepts a Barrowman fin-set normal-force coefficient (trapezoid wiring)', () => {
    const fin: TrapezoidFinSetComponent = {
      id: 'fins',
      name: 'Fins',
      type: 'trapezoidfinset',
      materialId: 'plywood',
      finCount: 4,
      rootChord: 0.08,
      tipChord: 0.05,
      span: 0.07,
      sweepLength: 0.02,
      thickness: 0.003,
      crossSection: 'square',
      axialOffset: 1.5,
    };
    const refDiameter = 0.076;
    const refArea = Math.PI * refDiameter * refDiameter / 4.0;
    const alpha = 0.2; // rad
    const { cna } = computeTrapezoidFinAero(fin, 1.5, refDiameter, refDiameter);
    expect(cna).toBeGreaterThan(0);

    const res = computeFinStructuralLoads({
      rootChord: 0.08,
      tipChord: 0.05,
      span: 0.07,
      sweepLength: 0.02,
      thickness: 0.003,
      crossSection: 'square',
      finCount: 4,
      materialId: 'plywood',
      dynamicPressure: 7548.0,
      normalForceCoefficient: cna * alpha,
      refArea,
    });

    const forcePerFin = 7548.0 * refArea * (cna * alpha) / 4.0;
    const arm = 0.07 * (0.08 + 2 * 0.05) / (3 * (0.08 + 0.05));
    expect(res.rootBendingMomentNm).toBeCloseTo(forcePerFin * arm, 9);

    const stressPa = 6.0 * (forcePerFin * arm) / (0.003 * 0.003 * 0.08);
    expect(res.rootBendingStressMPa).toBeCloseTo(stressPa / 1e6, 6);
    expect(res.safetyFactorVsYield).toBeCloseTo(69.0e6 / stressPa, 6);
    expect(res.tipDeflectionM).toBeGreaterThan(0);
    expect(res.firstModeFreqHz).toBeGreaterThan(0);
  });

  it('catalogs finite positive structural properties for every standard material', () => {
    for (const [id, mat] of Object.entries(STANDARD_MATERIALS)) {
      expect(id).toBe(mat.id);
      expect(Number.isFinite(mat.youngsModulusGPa)).toBe(true);
      expect(Number.isFinite(mat.yieldStrengthMPa)).toBe(true);
      expect(mat.youngsModulusGPa).toBeGreaterThan(0);
      expect(mat.yieldStrengthMPa).toBeGreaterThan(0);
    }
  });

  it('fails closed on non-finite, non-positive, unknown, or invalid inputs', () => {
    const degenerate: Array<{ patch: Partial<FinStructuralLoadInput>; message: string }> = [
      { patch: { dynamicPressure: 0 }, message: 'dynamicPressure' },
      { patch: { dynamicPressure: -1 }, message: 'dynamicPressure' },
      { patch: { dynamicPressure: Number.NaN }, message: 'dynamicPressure' },
      { patch: { span: 0 }, message: 'span' },
      { patch: { span: Number.POSITIVE_INFINITY }, message: 'span' },
      { patch: { thickness: 0 }, message: 'thickness' },
      { patch: { thickness: -0.001 }, message: 'thickness' },
      { patch: { thickness: Number.NaN }, message: 'thickness' },
      { patch: { normalForceCoefficient: 0 }, message: 'normalForceCoefficient' },
      { patch: { normalForceCoefficient: -0.5 }, message: 'normalForceCoefficient' },
      { patch: { refArea: 0 }, message: 'refArea' },
      { patch: { refArea: Number.NaN }, message: 'refArea' },
      { patch: { rootChord: 0 }, message: 'rootChord' },
      { patch: { tipChord: -0.01 }, message: 'tipChord' },
      { patch: { sweepLength: -0.1 }, message: 'sweepLength' },
      { patch: { finCount: 0 }, message: 'finCount' },
      { patch: { finCount: 2.5 }, message: 'finCount' },
      { patch: { finCount: Number.NaN }, message: 'finCount' },
    ];
    for (const { patch, message } of degenerate) {
      expect(() => computeFinStructuralLoads({ ...validInput, ...patch })).toThrow(
        new RegExp(`fin structure: ${message}`)
      );
    }

    expect(() => computeFinStructuralLoads({ ...validInput, materialId: 'unobtainium' })).toThrow(
      /fin structure: unknown materialId/
    );

    const invalidSection = 'hexagonal' as unknown as FinCrossSection; // runtime-invalid enum sentinel
    expect(() => computeFinStructuralLoads({ ...validInput, crossSection: invalidSection })).toThrow(
      /fin structure: unsupported crossSection/
    );
  });
});