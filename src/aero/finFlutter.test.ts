import { describe, it, expect } from 'vitest';
import { computeTrapezoidFinFlutter, computeEllipticalFinFlutter } from './finFlutter';
import { TrapezoidFinSetComponent, EllipticalFinSetComponent } from '../core/types';

describe('Aeroelasticity: NACA TN 4197 Fin Flutter Analysis', () => {
  it('calculates realistic supersonic flutter boundary for G10 Fiberglass fins', () => {
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

    expect(res.flutterVelocity).toBeGreaterThan(250); // High subsonic / transonic
    expect(res.flutterMach).toBeGreaterThan(0.8);
    expect(res.aspectRatio).toBeCloseTo((2 * 0.12) / (0.25 + 0.10), 2);
    expect(res.safeVelocity).toBeCloseTo(res.flutterVelocity / 1.25, 1);
  });

  it('detects subsonic flutter risk for thin balsa fins', () => {
    const balsaFin: TrapezoidFinSetComponent = {
      id: 'fin-balsa',
      name: 'Thin Balsa Fin',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.10,     // 100mm
      tipChord: 0.05,      // 50mm
      span: 0.08,          // 80mm
      sweepLength: 0.04,   // 40mm
      thickness: 0.0015,   // Very thin 1.5mm
      crossSection: 'square',
      axialOffset: 0.3,
      materialId: 'balsa', // G = 150 MPa
    };

    const res = computeTrapezoidFinFlutter(balsaFin);

    // Thin balsa should have low flutter velocity
    expect(res.flutterVelocity).toBeLessThan(350);
  });

  it('computes flutter velocity for elliptical fin sets', () => {
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
  });
});
