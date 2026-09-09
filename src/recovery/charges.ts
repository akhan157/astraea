/**
 * Black-powder separation charge sizing: target ejection pressure from shear
 * pin ratings, and charge mass from ideal-gas expansion.
 *
 * UNITS: pressures in Pa, forces in N, diameters/lengths in m, volumes in
 * m^3, temperatures in K, masses in grams.
 *
 * Target pressure model:
 *   The bay separates when the ejection pressure acting on the bulkhead
 *   cross-section exceeds the combined shear resistance of the pins. A 2x
 *   safety factor (SHEAR_SAFETY_FACTOR) is applied so the design pressure
 *   exceeds the pin-break pressure with margin (covers pin tolerance spread
 *   and pressure losses during the initial pressure rise).
 *     F_total = 2 * pinCount * pinShearForceN
 *     A       = pi * (bulkheadDiameter / 2)^2
 *     P_target = F_total / A                       [Pa]
 *
 * Charge mass model:
 *   Ideal-gas expansion of the combustion products into the bay volume,
 *   m = P*V / (R_specific * T), with the specific gas constant approximated
 *   by that of air, R_specific = 287 J/(kg*K). This is documented as an
 *   ideal-gas approximation (combustion products are hot, multi-species
 *   gases; 287 is a standard engineering stand-in). A +20% margin
 *   (CHARGE_MASS_MARGIN) covers real losses: seal leakage, incomplete burn,
 *   and heat transfer to the bay walls before full expansion.
 *     m_kg    = P * V / (R_specific * T)
 *     m_grams = m_kg * 1000 * CHARGE_MASS_MARGIN
 */

/** Specific gas constant (J/(kg*K)) approximated for BP combustion products. */
export const GAS_SPECIFIC_CONSTANT_AIR = 287.0;

/** Mass margin over the ideal-gas estimate to cover real expansion losses. */
export const CHARGE_MASS_MARGIN = 1.20;

/** 2x safety factor on shear-pin break force for the target pressure. */
export const SHEAR_SAFETY_FACTOR = 2.0;

export interface ShearPinPreset {
  /**
   * Nominal single-pin shear force in Newtons. These are published/typical
   * estimates, NOT certified data - validate by ground shear test before
   * relying on them for flight hardware.
   */
  shearForceN: number;
  /** Provenance / validation caveat for the estimate. */
  note: string;
}

/** 2-56 nylon shear pin: nominal ~44 N single-pin shear (documented estimate). */
export const PIN_2_56: ShearPinPreset = Object.freeze({
  shearForceN: 44,
  note: '2-56 nylon shear pin, nominal estimate; validate by shear test.',
});

/** 4-40 nylon shear pin: nominal ~110 N single-pin shear (documented estimate). */
export const PIN_4_40: ShearPinPreset = Object.freeze({
  shearForceN: 110,
  note: '4-40 nylon shear pin, nominal estimate; validate by shear test.',
});

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`recovery: ${label} must be finite, got ${value}`);
  }
  if (value <= 0) {
    throw new Error(`recovery: ${label} must be > 0, got ${value}`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  assertPositive(value, label);
  if (!Number.isInteger(value)) {
    throw new Error(`recovery: ${label} must be a whole number, got ${value}`);
  }
}

/**
 * Target bay pressure (Pa) to shear `shearPinCount` pins over a bulkhead of
 * the given diameter: P = 2 * N * F_shear / (pi * (d/2)^2).
 */
export function targetPressure(
  shearPinCount: number,
  pinShearForceN: number,
  bulkheadDiameterM: number,
): number {
  assertPositiveInteger(shearPinCount, 'shearPinCount');
  assertPositive(pinShearForceN, 'pinShearForceN');
  assertPositive(bulkheadDiameterM, 'bulkheadDiameterM');
  const area = Math.PI * Math.pow(bulkheadDiameterM / 2, 2);
  return (SHEAR_SAFETY_FACTOR * shearPinCount * pinShearForceN) / area;
}

/**
 * Black-powder charge mass (grams) for a target bay pressure:
 * m = 1.2 * (P * V / (R_specific * T_combustion)) * 1000.
 * Default combustion temperature 2000 K (typical BP burn temperature).
 */
export function bpMass(
  targetPressurePa: number,
  bayVolumeM3: number,
  combustionTK: number = 2000,
): number {
  assertPositive(targetPressurePa, 'targetPressurePa');
  assertPositive(bayVolumeM3, 'bayVolumeM3');
  assertPositive(combustionTK, 'combustionTK');
  const massKg = (targetPressurePa * bayVolumeM3) / (GAS_SPECIFIC_CONSTANT_AIR * combustionTK);
  return massKg * 1000 * CHARGE_MASS_MARGIN;
}