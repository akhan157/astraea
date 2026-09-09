/**
 * Recovery packing engine: dual-compartment bay sizing, packed-chute density,
 * axial stacking clearance, and pack advisories.
 *
 * UNITS (convention for the recovery subsystem):
 *  - distances and diameters: meters (m); volumes: cubic meters (m^3)
 *  - mass: grams (g)
 *  - packed density output: g/cm^3 (the conventional rocketry unit for
 *    packed chute density). Conversion: g/cm^3 = g / (m^3 * 1e6).
 *
 * Units are defined locally for the recovery subsystem: src/core/types.ts
 * holds the vehicle component-tree SSOT and does not define a units
 * convention.
 */

export interface PackItem {
  /** display name of the stacked component */
  name: string;
  /** axial length of the component along the bay axis, meters */
  length: number;
}

export interface ClearanceResult {
  /** true when the stacked items fit within the bay length */
  fits: boolean;
  /** bayLength - sum(item lengths): 0 or positive when it fits, negative when over */
  remaining: number;
}

export type PackAdvisory = 'loose' | 'ok' | 'tight' | 'jammed';

/** Below this packed density (g/cm^3) the chute is under-packed for the bay. */
export const PACK_ADVISORY_OK_MIN = 0.25;
/** Above this packed density (g/cm^3) the chute is over-packed for the bay. */
export const PACK_ADVISORY_OK_MAX = 0.35;
/**
 * Overpack limit (g/cm^3) beyond which packing is treated as jammed:
 * folded nylon/ripstop packs to roughly 0.5-0.7 g/cm^3 in practice, so
 * this ceiling flags a bay that cannot physically hold the load without
 * damage. Empirical estimate - adjust from drop/pack tests.
 */
export const PACK_ADVISORY_JAM = 0.60;

const CM3_PER_M3 = 1e6;

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`recovery: ${label} must be finite, got ${value}`);
  }
  if (value <= 0) {
    throw new Error(`recovery: ${label} must be > 0, got ${value}`);
  }
}

/** Usable volume of a cylindrical recovery bay, m^3: V = pi * (d/2)^2 * L. */
export function bayVolume(bayLengthM: number, innerDiameterM: number): number {
  assertPositive(bayLengthM, 'bayLengthM');
  assertPositive(innerDiameterM, 'innerDiameterM');
  const radius = innerDiameterM / 2;
  return Math.PI * radius * radius * bayLengthM;
}

/**
 * Packed chute density in g/cm^3 from chute mass (g) and bay volume (m^3).
 * Example: a 50 g chute in a 1 L bay (0.001 m^3) packs to 0.05 g/cm^3.
 */
export function packedDensity(chuteMassG: number, bayVolumeM3: number): number {
  assertPositive(chuteMassG, 'chuteMassG');
  assertPositive(bayVolumeM3, 'bayVolumeM3');
  return chuteMassG / (bayVolumeM3 * CM3_PER_M3);
}

/**
 * Stack items end-to-end along the bay axis and report whether they fit.
 * `remaining` is unclamped: negative when the stack overruns the bay.
 */
export function clearanceCheck(bayLengthM: number, items: readonly PackItem[]): ClearanceResult {
  assertPositive(bayLengthM, 'bayLengthM');
  let stack = 0;
  for (const item of items) {
    assertPositive(item.length, `item "${item.name}" length`);
    stack += item.length;
  }
  const remaining = bayLengthM - stack;
  return { fits: remaining >= 0, remaining };
}

/**
 * Pack advisory from packed density (g/cm^3):
 *   < 0.25          -> 'loose'  (under-packed)
 *   0.25 .. 0.35    -> 'ok'     (recommended band, inclusive)
 *   0.35 .. 0.60    -> 'tight'  (over-packed but stowable)
 *   >= 0.60         -> 'jammed' (at/above the physical packing limit)
 */
export function packAdvisory(densityGcm3: number): PackAdvisory {
  if (!Number.isFinite(densityGcm3)) {
    throw new Error(`recovery: density must be finite, got ${densityGcm3}`);
  }
  if (densityGcm3 < PACK_ADVISORY_OK_MIN) return 'loose';
  if (densityGcm3 <= PACK_ADVISORY_OK_MAX) return 'ok';
  if (densityGcm3 < PACK_ADVISORY_JAM) return 'tight';
  return 'jammed';
}