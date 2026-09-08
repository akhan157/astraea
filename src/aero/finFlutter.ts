/**
 * Astraea Aeroelasticity Engine: Fin Flutter Boundary Calculator
 * Reference: NACA Technical Note 4197:
 * "Summary of Flutter Experiences as a Guide to the Preliminary Design of Lifting Surfaces on Missiles"
 *
 * Predicts the critical flutter velocity (V_f) where aeroelastic coupling between
 * bending and torsional modes induces catastrophic fin flutter failure.
 *
 * NOTE: NACA TN 4197 provides preliminary design guidance. It assumes isotropic homogeneous
 * material properties and rigid root attachment. A safety factor of at least 1.5x is recommended
 * for competition high-power rocketry flights.
 */

import { TrapezoidFinSetComponent, EllipticalFinSetComponent } from '../core/types';

export interface FinFlutterAnalysis {
  flutterVelocity: number;        // m/s (critical flutter velocity)
  flutterMach: number;            // Mach number at reference altitude
  aspectRatio: number;            // AR = 2*s / (cr + ct)
  taperRatio: number;             // lambda = ct / cr
  shearModulus: number;           // G in Pascals
  thicknessToChord: number;       // t / cr
  isFlutterRiskSubsonic: boolean; // V_f < local speed of sound
  safeVelocity125: number;        // V_f / 1.25 (minimal margin)
  safeVelocity150: number;        // V_f / 1.50 (recommended competition margin)
  disclaimer: string;
}

/**
 * Standard material shear modulus (G) catalog in Pascals (N/m^2)
 * Sourced from MIL-HDBK-5 and composite structural testing literature.
 */
export const MATERIAL_SHEAR_MODULI: Record<string, number> = {
  aluminum: 26.0e9,       // 26 GPa (6061-T6 Aluminum)
  fiberglass: 4.1e9,      // 4.1 GPa (G10 Garolite / FR4 woven composite)
  carbonfiber: 18.0e9,    // 18.0 GPa (Quasi-isotropic 0/90/+-45 carbon fiber laminate)
  plywood: 0.6e9,         // 600 MPa (Aircraft Birch Plywood)
  balsa: 0.15e9,          // 150 MPa (Balsa wood)
  pla_3dprint: 1.2e9,     // 1.2 GPa (3D printed PLA 100% infill)
  abs_3dprint: 0.9e9,     // 900 MPa (3D printed ABS)
  petg_3dprint: 1.0e9,    // 1.0 GPa (3D printed PETG)
  cardboard: 0.3e9,       // 300 MPa (Heavy Kraft cardboard)
};

const FLUTTER_DISCLAIMER =
  'Preliminary design estimate based on NACA TN 4197. Assumes isotropic shear modulus and rigid root attachment. Composite layups and flexible fin joints require physical ground vibration / pull testing. Maintain >= 1.5x safety factor.';

/**
 * Computes critical flutter velocity (V_f) for a trapezoidal fin set
 *
 * NACA TN 4197 Equation 18:
 * V_f = a * sqrt( [2 * G * (t/c)^3 * (AR + 2)] / [1.337 * AR^3 * P_ambient * (lambda + 1)] )
 *
 * @param comp Trapezoid fin set component
 * @param customShearModulus Optional user-defined shear modulus in Pascals
 * @param speedOfSound Local speed of sound in m/s (default 340.3 m/s)
 * @param ambientPressure Local static atmospheric pressure in Pascals (default 101325 Pa)
 */
export function computeTrapezoidFinFlutter(
  comp: TrapezoidFinSetComponent,
  customShearModulus?: number,
  speedOfSound: number = 340.3,
  ambientPressure: number = 101325.0
): FinFlutterAnalysis {
  const cr = Math.max(0.005, comp.rootChord);
  const ct = Math.max(0.001, comp.tipChord);
  const s = Math.max(0.005, comp.span);
  const t = Math.max(0.0005, comp.thickness);

  const G = customShearModulus && customShearModulus > 0
    ? customShearModulus
    : MATERIAL_SHEAR_MODULI[comp.materialId] || MATERIAL_SHEAR_MODULI.plywood;

  // Aspect Ratio: AR = s^2 / A_fin = 2*s / (cr + ct)
  const chordSum = cr + ct;
  const AR = (2.0 * s) / chordSum;

  // Taper ratio: lambda = ct / cr
  const lambda = ct / cr;

  // Thickness to chord ratio: t / cr
  const tOverC = t / cr;

  // Dimensionally consistent NACA TN 4197 Equation 18
  // Numerator has units of Pa (G), Denominator has units of Pa (ambientPressure) -> Dimensionless inside sqrt
  const numerator = 2.0 * G * Math.pow(tOverC, 3) * (AR + 2.0);
  const denominator = 1.337 * Math.pow(AR, 3) * Math.max(100, ambientPressure) * (lambda + 1.0);

  let vf = 1000;
  if (denominator > 0 && numerator > 0) {
    vf = speedOfSound * Math.sqrt(numerator / denominator);
  }

  const flutterVelocity = Number.isFinite(vf) ? Math.max(10, vf) : 2000;
  const flutterMach = flutterVelocity / speedOfSound;

  return {
    flutterVelocity,
    flutterMach,
    aspectRatio: AR,
    taperRatio: lambda,
    shearModulus: G,
    thicknessToChord: tOverC,
    isFlutterRiskSubsonic: flutterMach < 1.0,
    safeVelocity125: flutterVelocity / 1.25,
    safeVelocity150: flutterVelocity / 1.50,
    disclaimer: FLUTTER_DISCLAIMER,
  };
}

/**
 * Computes critical flutter velocity for an elliptical fin set
 */
export function computeEllipticalFinFlutter(
  comp: EllipticalFinSetComponent,
  customShearModulus?: number,
  speedOfSound: number = 340.3,
  ambientPressure: number = 101325.0
): FinFlutterAnalysis {
  const cr = Math.max(0.005, comp.rootChord);
  const s = Math.max(0.005, comp.span);
  const t = Math.max(0.0005, comp.thickness);

  const G = customShearModulus && customShearModulus > 0
    ? customShearModulus
    : MATERIAL_SHEAR_MODULI[comp.materialId] || MATERIAL_SHEAR_MODULI.plywood;

  // Quarter-ellipse aspect ratio: AR = s^2 / ((pi/4) * cr * s) = (4 / pi) * (s / cr)
  const AR = (4.0 / Math.PI) * (s / cr);
  // Elliptical effective taper ratio ~ 0.05
  const lambda = 0.05;
  const tOverC = t / cr;

  const numerator = 2.0 * G * Math.pow(tOverC, 3) * (AR + 2.0);
  const denominator = 1.337 * Math.pow(AR, 3) * Math.max(100, ambientPressure) * (lambda + 1.0);

  let vf = 1000;
  if (denominator > 0 && numerator > 0) {
    vf = speedOfSound * Math.sqrt(numerator / denominator);
  }

  const flutterVelocity = Number.isFinite(vf) ? Math.max(10, vf) : 2000;
  const flutterMach = flutterVelocity / speedOfSound;

  return {
    flutterVelocity,
    flutterMach,
    aspectRatio: AR,
    taperRatio: lambda,
    shearModulus: G,
    thicknessToChord: tOverC,
    isFlutterRiskSubsonic: flutterMach < 1.0,
    safeVelocity125: flutterVelocity / 1.25,
    safeVelocity150: flutterVelocity / 1.50,
    disclaimer: FLUTTER_DISCLAIMER,
  };
}
