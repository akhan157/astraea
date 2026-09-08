import { describe, it, expect } from 'vitest';
import {
  computeNoseconeCP,
  computeTrapezoidFinAero,
  computeRocketStability,
} from './barrowman';
import { RocketVehicle } from '../core/types';

describe('Barrowman Aerodynamics Engine', () => {
  describe('Nosecone CP formulas', () => {
    const length = 0.3; // 300 mm

    it('calculates conical nosecone CP at 2/3 length', () => {
      const cp = computeNoseconeCP('conical', length);
      expect(cp).toBeCloseTo(0.2, 4); // 200 mm
    });

    it('calculates ogive nosecone CP at 0.466 length', () => {
      const cp = computeNoseconeCP('ogive', length);
      expect(cp).toBeCloseTo(0.1398, 4);
    });

    it('calculates parabolic nosecone CP at 0.500 length', () => {
      const cp = computeNoseconeCP('parabolic', length);
      expect(cp).toBeCloseTo(0.15, 4);
    });

    it('calculates von karman nosecone CP at 0.500 length', () => {
      const cp = computeNoseconeCP('vonkarman', length);
      expect(cp).toBeCloseTo(0.15, 4);
    });
  });

  describe('Trapezoid Fin Set Aero', () => {
    it('computes positive normal force derivative and realistic CP', () => {
      const finComp = {
        id: 'fin1',
        name: 'Main Fins',
        type: 'trapezoidfinset' as const,
        materialId: 'plywood',
        finCount: 4,
        rootChord: 0.15,     // 150mm
        tipChord: 0.05,      // 50mm
        span: 0.08,          // 80mm
        sweepLength: 0.04,   // 40mm
        thickness: 0.003,    // 3mm
        crossSection: 'square' as const,
        axialOffset: 0.4,    // near aft
      };

      const axialStart = 0.6; // attached at 600mm from nose tip
      const bodyDiameter = 0.05; // 50mm
      const refDiameter = 0.05;

      const res = computeTrapezoidFinAero(finComp, axialStart, bodyDiameter, refDiameter);

      expect(res.cna).toBeGreaterThan(0);
      expect(res.cp).toBeGreaterThan(axialStart);
      expect(res.cp).toBeLessThan(axialStart + finComp.rootChord);
    });
  });

  describe('Whole-Vehicle Stability Integration', () => {
    const testRocket: RocketVehicle = {
      id: 'test-alpha',
      name: 'Alpha Test Rocket',
      version: '1.0',
      author: 'Astraea Test',
      components: [
        {
          id: 'nc',
          name: 'Ogive Nosecone',
          type: 'nosecone',
          shape: 'ogive',
          length: 0.15,          // 150mm
          baseDiameter: 0.04,    // 40mm
          wallThickness: 0.002,  // 2mm
          isHollow: true,
          materialId: 'pla_3dprint',
        },
        {
          id: 'bt',
          name: 'Main Body Tube',
          type: 'bodytube',
          length: 0.45,          // 450mm
          outerDiameter: 0.04,   // 40mm
          innerDiameter: 0.038,  // 38mm
          materialId: 'cardboard',
        },
        {
          id: 'fins',
          name: 'Trapezoidal Fins',
          type: 'trapezoidfinset',
          finCount: 3,
          rootChord: 0.08,       // 80mm
          tipChord: 0.03,        // 30mm
          span: 0.06,            // 60mm
          sweepLength: 0.03,     // 30mm
          thickness: 0.0025,     // 2.5mm
          crossSection: 'rounded',
          axialOffset: 0.37,     // 370mm along body tube
          materialId: 'balsa',
        },
      ],
    };

    it('evaluates vehicle stability with positive margin', () => {
      const stability = computeRocketStability(testRocket);

      expect(stability.totalLength).toBeCloseTo(0.60, 2); // 150mm + 450mm = 600mm
      expect(stability.maxDiameter).toBeCloseTo(0.04, 3);
      expect(stability.totalMass).toBeGreaterThan(0.01);
      expect(stability.cg).toBeGreaterThan(0);
      expect(stability.cp).toBeGreaterThan(stability.cg); // CP aft of CG for stability
      expect(stability.staticMarginCalibers).toBeGreaterThan(1.0); // Caliber >= 1.0
      expect(stability.isStable).toBe(true);
    });

    it('guards against division by zero with zero fins', () => {
      const finlessRocket: RocketVehicle = {
        id: 'finless',
        name: 'Finless Rocket',
        version: '1.0',
        author: 'Astraea Test',
        components: [
          {
            id: 'nc',
            name: 'Ogive Nosecone',
            type: 'nosecone',
            shape: 'ogive',
            length: 0.15,
            baseDiameter: 0.04,
            wallThickness: 0.002,
            isHollow: true,
            materialId: 'pla_3dprint',
          },
          {
            id: 'bt',
            name: 'Body Tube',
            type: 'bodytube',
            length: 0.45,
            outerDiameter: 0.04,
            innerDiameter: 0.038,
            materialId: 'cardboard',
          },
        ],
      };

      const stability = computeRocketStability(finlessRocket);
      expect(Number.isFinite(stability.cp)).toBe(true);
      expect(Number.isFinite(stability.staticMarginCalibers)).toBe(true);
    });
  });
});
