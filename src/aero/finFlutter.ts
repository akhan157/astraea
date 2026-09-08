/**
 * Astraea Aeroelasticity Engine: Fin Flutter Velocity Calculator
 * Derived from NACA Technical Note 4197:
 * "Summary of Flutter Experiences as a Guide to the Preliminary Design of Lifting Surfaces on Missiles"
 *
 * Used to predict the critical flutter speed (V_f) where aeroelastic coupling
 * between bending and torsional modes causes catastrophic fin structural failure.
 */

import { TrapezoidFinSetComponent, EllipticalFinSetComponent } from '../core/types';

export interface FinFlutterAnalysis {
  flutterVelocity: number;        // m/s (critical velocity)
  flutterMach: number;            // Mach number at sea level (a = 343 m/s)
  aspectRatio: number;            // Fin aspect ratio AR = s^2 / S_fin
  taperRatio: number;             // Tip chord / Root chord
  shearModulus: number;           // Material shear modulus G in Pascals
  thicknessToChord: number;       // t / cr
  isFlutterRiskSubsonic: boolean; // Flutter speed < 340 m/s
  safeVelocity: number;           // V_safe with 1.25 safety factor (V_f / 1.25)
}

/**
 * Standard material shear modulus (G) catalog in Pascals (N/m^2)
 */
export const MATERIAL_SHEAR_MODULI: Record<string, number> = {
  aluminum: 26.0e9,       // 26 GPa (6061-T6 Aluminum)
  fiberglass: 4.1e9,      // 4.1 GPa (G10 Garolite / FR4)
  carbonfiber: 18.0e9,    // 18.0 GPa (Quasi-isotropic carbon fiber composite)
  plywood: 0.6e9,         // 600 MPa (Aircraft Birch Plywood)
  balsa: 0.15e9,          // 150 MPa (Balsa wood)
  pla_3dprint: 1.2e9,     // 1.2 GPa (3D printed PLA 100% infill)
  abs_3dprint: 0.9e9,     // 900 MPa (3D printed ABS)
  petg_3dprint: 1.0e9,    // 1.0 GPa (3D printed PETG)
  cardboard: 0.3e9,       // 300 MPa (Heavy cardboard / Kraft)
};

/**
 * Computes critical flutter velocity (V_f) for a trapezoidal fin set using NACA TN 4197
 *
 * Formula:
 * V_f = a * sqrt( G / ( [1.337 * AR^3 * (P/P0) * (lambda + 1)] / [2 * (t/c)^3 * (AR + 2)] ) )
 *
 * @param comp Trapezoid fin set component
 * @param materialId Material identifier for shear modulus lookup
 * @param speedOfSound Local speed of sound in m/s (default: 343 m/s at sea level)
 * @param pressureRatio Ratio of static pressure to sea level P/P0 (default: 1.0)
 */
export function computeTrapezoidFinFlutter(
  comp: TrapezoidFinSetComponent,
  materialId?: string,
  speedOfSound: number = 343.0,
  pressureRatio: number = 1.0
): FinFlutterAnalysis {
  const cr = comp.rootChord;
  const ct = comp.tipChord;
  const s = comp.span;
  const t = Math.max(0.0005, comp.thickness);

  const matKey = materialId || comp.materialId;
  const G = MATERIAL_SHEAR_MODULI[matKey] || MATERIAL_SHEAR_MODULI.plywood;

  // Aspect Ratio: AR = s^2 / A_fin = 2*s / (cr + ct)
  const chordSum = Math.max(0.001, cr + ct);
  const AR = (2.0 * s) / chordSum;

  // Taper ratio: lambda = ct / cr
  const lambda = cr > 0 ? ct / cr : 1.0;

  // Thickness to chord ratio: t / cr
  const tOverC = cr > 0 ? t / cr : 0.05;

  // NACA TN 4197 Flutter Boundary Equation (Equation 18):
  // V_f = a * sqrt( [2 * G * (t/c)^3 * (AR + 2)] / [1.337 * AR^3 * P_ambient * (lambda + 1)] )
  const ambientPressure = 101325.0 * Math.max(0.01, pressureRatio); // Pa

  const numerator = 2.0 * G * Math.pow(tOverC, 3) * (AR + 2.0);
  const denominator = 1.337 * Math.pow(AR, 3) * ambientPressure * (lambda + 1.0);

  let vf = 1000;
  if (denominator > 0 && numerator > 0) {
    vf = speedOfSound * Math.sqrt(numerator / denominator);
  }
  // Cap non-physical infinity
  const flutterVelocity = Number.isFinite(vf) ? Math.max(10, vf) : 2000;
  const flutterMach = flutterVelocity / speedOfSound;
  const safeVelocity = flutterVelocity / 1.25;

  return {
    flutterVelocity,
    flutterMach,
    aspectRatio: AR,
    taperRatio: lambda,
    shearModulus: G,
    thicknessToChord: tOverC,
    isFlutterRiskSubsonic: flutterMach < 1.0,
    safeVelocity,
  };
}

/**
 * Computes critical flutter velocity for an elliptical fin set
 */
export function computeEllipticalFinFlutter(
  comp: EllipticalFinSetComponent,
  materialId?: string,
  speedOfSound: number = 343.0,
  pressureRatio: number = 1.0
): FinFlutterAnalysis {
  const cr = comp.rootChord;
  const s = comp.span;
  const t = Math.max(0.0005, comp.thickness);

  const matKey = materialId || comp.materialId;
  const G = MATERIAL_SHEAR_MODULI[matKey] || MATERIAL_SHEAR_MODULI.plywood;

  // Area of quarter-ellipse = (pi / 4) * cr * s
  // Aspect Ratio: AR = s^2 / Area = (4 / pi) * (s / cr)
  const AR = (4.0 / Math.PI) * (s / Math.max(0.001, cr));
  const lambda = 0.05; // Effective taper ratio for ellipse
  const tOverC = cr > 0 ? t / cr : 0.05;

  const ambientPressure = 101325.0 * Math.max(0.01, pressureRatio);
  const numerator = 2.0 * G * Math.pow(tOverC, 3) * (AR + 2.0);
  const denominator = 1.337 * Math.pow(AR, 3) * ambientPressure * (lambda + 1.0);

  let vf = 1000;
  if (denominator > 0 && numerator > 0) {
    vf = speedOfSound * Math.sqrt(numerator / denominator);
  }
  const flutterVelocity = Number.isFinite(vf) ? Math.max(10, vf) : 2000;
  const flutterMach = flutterVelocity / speedOfSound;
  const safeVelocity = flutterVelocity / 1.25;

  return {
    flutterVelocity,
    flutterMach,
    aspectRatio: AR,
    taperRatio: lambda,
    shearModulus: G,
    thicknessToChord: tOverC,
    isFlutterRiskSubsonic: flutterMach < 1.0,
    safeVelocity,
  };
}
