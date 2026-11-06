import { describe, it, expect } from 'vitest';
import { computeTrapezoidFinFlutter, computeEllipticalFinFlutter } from './finFlutter';
import { TrapezoidFinSetComponent, EllipticalFinSetComponent } from '../core/types';

describe('Aeroelasticity: NACA TN 4197 Fin Flutter Analysis', () => {
  it('calculates realistic flutter boundary for G10 Fiberglass fins with competition margins', () => {
    const highPowerFin: TrapezoidFinSetComponent = {
      id: 'fin-g10',
      name: 'High-Power G10 Fin',
      type: 'trapezoidfinset',
      finCount: 4,
      rootChord: 0.25,     // 250mm
      tipChord: 0.10,      // 100mm
      span: 0.12,          // 120mm
      sweepLength: 0.10,   // 100mm
      thickness: 0.0032,   // 1/8" (3.2mm)
      crossSection: 'rounded',
      axialOffset: 1.0,
      materialId: 'fiberglass', // G = 4.1 GPa
    };

    const res = computeTrapezoidFinFlutter(highPowerFin);

    expect(res.flutterVelocity).toBeGreaterThan(250);
    expect(res.flutterMach).toBeGreaterThan(0.8);
    expect(res.aspectRatio).toBeCloseTo((2 * 0.12) / (0.25 + 0.10), 2);
    expect(res.safeVelocity125).toBeCloseTo(res.flutterVelocity / 1.25, 1);
    expect(res.safeVelocity150).toBeCloseTo(res.flutterVelocity / 1.50, 1);
    expect(res.disclaimer).toContain('NACA TN 4197');
  });

  it('supports custom shear modulus override for custom carbon layups', () => {
    const customFin: TrapezoidFinSetComponent = {
      id: 'fin-custom',
      name: 'Custom Carbon Fin',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.20,
      tipChord: 0.08,
      span: 0.10,
      sweepLength: 0.08,
      thickness: 0.003,
      crossSection: 'airfoil',
      axialOffset: 0.8,
      materialId: 'plywood', // Base is plywood
    };

    // Override with stiff 22 GPa high-modulus carbon
    const resCustom = computeTrapezoidFinFlutter(customFin, 22.0e9);
    const resBase = computeTrapezoidFinFlutter(customFin);

    expect(resCustom.shearModulus).toBe(22.0e9);
    expect(resCustom.flutterVelocity).toBeGreaterThan(resBase.flutterVelocity * 4.0);
  });

  it('models altitude atmospheric pressure effect on flutter boundary', () => {
    const fin: TrapezoidFinSetComponent = {
      id: 'fin-alt',
      name: 'Altitude Fin',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.15,
      tipChord: 0.05,
      span: 0.08,
      sweepLength: 0.05,
      thickness: 0.0025,
      crossSection: 'rounded',
      axialOffset: 0.5,
      materialId: 'fiberglass',
    };

    // Flutter at sea level (101.3 kPa) vs 10km altitude (26.5 kPa)
    const resSL = computeTrapezoidFinFlutter(fin, undefined, 340.3, 101325.0);
    const resHigh = computeTrapezoidFinFlutter(fin, undefined, 299.5, 26500.0);

    // In thinner air, critical flutter airspeed is higher (less dynamic pressure per m/s)
    expect(resHigh.flutterVelocity).toBeGreaterThan(resSL.flutterVelocity);
  });

  it('computes elliptical fin flutter with safety margins', () => {
    const ellipticalFin: EllipticalFinSetComponent = {
      id: 'fin-ellipse',
      name: 'Elliptical Fin',
      type: 'ellipticalfinset',
      finCount: 3,
      rootChord: 0.15,
      span: 0.08,
      thickness: 0.003,
      axialOffset: 0.5,
      materialId: 'plywood',
    };

    const res = computeEllipticalFinFlutter(ellipticalFin);

    expect(Number.isFinite(res.flutterVelocity)).toBe(true);
    expect(res.flutterVelocity).toBeGreaterThan(50);
    expect(res.safeVelocity150).toBeCloseTo(res.flutterVelocity / 1.5, 1);
  });
});
