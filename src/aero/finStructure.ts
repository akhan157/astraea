/**
 * Astraea Structural Engineering Engine: Fin Root Loads, Deflection, and First-Mode Frequency
 *
 * Models one fin of a fin set as a cantilever beam of linearly tapered (trapezoidal)
 * planform clamped at the body tube. The aerodynamic normal load is distributed over the
 * span in proportion to the local chord, so the resultant acts at the planform centroid:
 *
 *   root bending moment   M = N_f * y_bar,   y_bar = s (cr + 2 ct) / (3 (cr + ct))
 *   root bending stress   sigma = M / Z,     Z = cr t^2 / 6   (rectangular section)
 *   tip deflection        delta = N_f s^3 (4 cr + 11 ct) / (60 (cr + ct) E Ibar)
 *   first-mode frequency  f1 = (1.875^2 / 2 pi) * sqrt(E Ibar / (rho * A * L^4))
 *
 * The load on a single fin is the total fin-set normal force
 * (q * S_ref * CN, where CN is the Barrowman fin-set coefficient scaled by angle of
 * attack) divided evenly among the fins:
 *
 *   const { cna } = computeTrapezoidFinAero(comp, axialStart, bodyDiameter, refDiameter);
 *   normalForceCoefficient = cna * angleOfAttackRad       // or computeEllipticalFinAero
 *
 * Deflection is the exact integral of the point-load influence delta =
 * int_0^L w(y) y^2 (3L - y) / (6 EI) dy with the chord-proportional load distribution
 * w(y) = (N_f / A_plan) * c(y), evaluated with a constant (mean-chord) equivalent
 * section. For a uniform-chord fin this reduces to the classic w L^4 / (8 EI).
 *
 * Ibar and A are evaluated at the mean chord (cr + ct) / 2, so the equivalent uniform
 * cantilever conserves planform area and total mass. All cross-sections use the
 * rectangular section modulus t^2 * c / 6; tapered (double_wedge / airfoil) and rounded
 * sections carry less section modulus in reality, so verify refined margins by physical
 * pull/cantilever testing. Fails closed: any non-finite or non-positive input throws.
 */

import { FinCrossSection, STANDARD_MATERIALS } from '../core/types';

export interface FinStructuralLoadInput {
  // --- Planform (one fin) ---
  rootChord: number;         // m, root chord along the body tube
  tipChord: number;          // m, tip chord (0 for a point-tipped / elliptical planform)
  span: number;              // m, root-to-tip span (cantilever length L)
  sweepLength: number;       // m, axial leading-edge sweep root-to-tip; carried for planform completeness (not in the structural model)
  thickness: number;         // m, fin plate thickness
  crossSection: FinCrossSection;
  finCount: number;          // fins in the set; the set normal force is divided evenly
  // --- Material (resolved from STANDARD_MATERIALS; per-call overrides) ---
  materialId: string;
  youngsModulusGPa?: number; // adds/overrides the catalog Young's modulus
  yieldStrengthMPa?: number; // adds/overrides the catalog yield (or flexural proxy)
  density?: number;          // kg/m^3, adds/overrides the catalog density
  // --- Aero ---
  dynamicPressure: number;        // Pa, freestream dynamic pressure q
  normalForceCoefficient: number; // total fin-set normal-force coefficient at the flight condition (unitless), e.g. cna * alpha from barrowman.ts
  refArea: number;                // m^2, reference area used to nondimensionalize the coefficient
}

export interface FinStructuralLoads {
  rootBendingMomentNm: number;  // per-fin root bending moment, N*m
  rootBendingStressMPa: number; // peak outer-fiber bending stress at the root, MPa
  safetyFactorVsYield: number;  // yield strength / root bending stress
  tipDeflectionM: number;       // cantilever tip deflection under the distributed load, m
  firstModeFreqHz: number;      // first bending-mode frequency of the cantilever, Hz
}

const FIN_CROSS_SECTIONS: readonly FinCrossSection[] = ['square', 'rounded', 'double_wedge', 'airfoil'];

function requireFinitePositive(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`fin structure: ${what} must be a finite positive number (got ${value})`);
  }
}

function requireFiniteNonNegative(value: number, what: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`fin structure: ${what} must be a finite nonnegative number (got ${value})`);
  }
}

/** Resolves an optional material property, failing closed when missing or non-positive. */
function requireMaterialProp(value: number | undefined, what: string, materialId: string): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`fin structure: ${what} (material '${materialId}') must be a finite positive number (got ${value})`);
  }
  return value;
}

/**
 * Computes per-fin root bending moment and stress, yield safety factor, cantilever tip
 * deflection, and first bending-mode frequency for a fin set.
 */
export function computeFinStructuralLoads(input: FinStructuralLoadInput): FinStructuralLoads {
  const { rootChord, tipChord, span, sweepLength, thickness, finCount } = input;

  requireFinitePositive(rootChord, 'rootChord');
  requireFiniteNonNegative(tipChord, 'tipChord');
  requireFinitePositive(span, 'span');
  requireFiniteNonNegative(sweepLength, 'sweepLength');
  requireFinitePositive(thickness, 'thickness');
  requireFinitePositive(finCount, 'finCount');
  requireFinitePositive(input.dynamicPressure, 'dynamicPressure');
  requireFinitePositive(input.normalForceCoefficient, 'normalForceCoefficient');
  requireFinitePositive(input.refArea, 'refArea');
  if (!Number.isInteger(finCount)) {
    throw new Error(`fin structure: finCount must be a positive integer (got ${finCount})`);
  }
  if (!FIN_CROSS_SECTIONS.includes(input.crossSection)) {
    throw new Error(
      `fin structure: unsupported crossSection '${input.crossSection}' (expected one of ${FIN_CROSS_SECTIONS.join(', ')})`
    );
  }

  // Resolve material props: per-call override wins over the catalog. Missing or
  // non-finite values fail closed rather than silently stiffening a fin.
  const material = STANDARD_MATERIALS[input.materialId];
  if (!material) {
    throw new Error(
      `fin structure: unknown materialId '${input.materialId}' (add a STANDARD_MATERIALS entry or pass explicit overrides)`
    );
  }
  const youngsModulusGPa = input.youngsModulusGPa ?? material.youngsModulusGPa;
  const yieldStrengthMPa = input.yieldStrengthMPa ?? material.yieldStrengthMPa;
  const density = input.density ?? material.density;

  const E = requireMaterialProp(youngsModulusGPa, 'youngsModulusGPa', input.materialId) * 1e9;      // Pa
  const yieldPa = requireMaterialProp(yieldStrengthMPa, 'yieldStrengthMPa', input.materialId) * 1e6; // Pa
  requireMaterialProp(density, 'density', input.materialId);

  // Total fin-set normal force N = q * S_ref * CN, divided evenly among the fins.
  const totalForce = input.dynamicPressure * input.refArea * input.normalForceCoefficient;
  const forcePerFin = totalForce / finCount;

  // Trapezoidal planform centroid: resultant spanwise station of the chord-proportional load.
  const chordSum = rootChord + tipChord;
  const yBar = (span * (rootChord + 2.0 * tipChord)) / (3.0 * chordSum);
  const rootBendingMomentNm = forcePerFin * yBar; // N*m

  // Rectangular section modulus at the root, Z = cr t^2 / 6 (m^3).
  const rootSectionModulus = (thickness * thickness * rootChord) / 6.0;
  const rootBendingStressPa = rootBendingMomentNm / rootSectionModulus;
  const rootBendingStressMPa = rootBendingStressPa / 1e6;
  const safetyFactorVsYield = yieldPa / rootBendingStressPa;

  // Equivalent uniform cantilever on the mean chord (conserves area and mass).
  const meanChord = (rootChord + tipChord) / 2.0;
  const secondMoment = (meanChord * thickness * thickness * thickness) / 12.0; // m^4
  const tipDeflectionM =
    (forcePerFin * span * span * span * (4.0 * rootChord + 11.0 * tipChord)) /
    (60.0 * chordSum * E * secondMoment);

  const massPerLength = density * meanChord * thickness; // kg/m
  const firstModeFreqHz =
    ((1.875 * 1.875) / (2.0 * Math.PI)) *
    Math.sqrt((E * secondMoment) / (massPerLength * span * span * span * span));

  return {
    rootBendingMomentNm,
    rootBendingStressMPa,
    safetyFactorVsYield,
    tipDeflectionM,
    firstModeFreqHz,
  };
}