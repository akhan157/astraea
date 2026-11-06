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
import type { RocketVehicle } from '../core/types';

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

/**
 * Bay layout resolver (C9 / Q1–Q3): derive recovery bays from the vehicle
 * component tree without new component types.
 *
 * Derivation rules (v1, all documented where they surface):
 * - One bay per bodytube that hosts at least one parachute. The bay is the
 *   full tube length: bulkhead stations are unknown in v1, so the drawing
 *   labels the bounds as the tube interval, never as bulkheads.
 * - Attachment follows the exporters' rule: a chute/sled belongs to the most
 *   recent bodytube in list order when its axialOffset falls inside that
 *   tube's [0, length] span. Chutes outside every span are reported in
 *   `unplacedChutes`, never silently guessed into a bay (Q1).
 * - Two or more chutes in one tube raise `ambiguityNote`: stacking order is
 *   list order and is labeled assumed wherever it is drawn (Q1).
 * - Dimension provenance is tracked per value: `entered` (user/tree value),
 *   `assumed` (documented fallback: packed diameter defaults to the bay
 *   bore — a chute packs to the bore it must fit through), `missing`
 *   (no value: excluded from clearance math, drawn schematically) (Q2/Q3).
 */

/** Provenance of one derived dimension value. */
export type DerivedProvenance = 'entered' | 'assumed' | 'missing';

/** One dimension with its value source. Null value means missing. */
export interface DerivedDim {
  value: number | null;
  provenance: DerivedProvenance;
}

/** One stacked load inside a derived bay. */
export interface DerivedBayItem {
  kind: 'chute' | 'sled';
  id: string;
  name: string;
  /** Axial extent, meters. Null when missing (excluded from clearance). */
  lengthM: DerivedDim;
  /** Cross-bore extent, meters. Null when missing (drawn schematically). */
  diameterM: DerivedDim;
  /** Packed/carried mass, grams. Null for sleds and missing chute masses. */
  massG: DerivedDim | null;
}

/** One bodytube interval hosting parachutes, with its stacked loads. */
export interface DerivedBay {
  tubeId: string;
  tubeName: string;
  /** Bay axial length = full tube length (bulkheads unknown in v1). */
  lengthM: DerivedDim;
  innerDiameterM: DerivedDim;
  items: DerivedBayItem[];
  /** Set when 2+ chutes share the tube (Q1 ambiguity, surfaced not guessed). */
  ambiguityNote: string | null;
}

/** Result of `deriveBays`: bays plus chutes that fit no tube span. */
export interface DerivedBays {
  bays: DerivedBay[];
  unplacedChutes: string[];
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function enteredOrMissing(value: unknown): DerivedDim {
  return finitePositive(value)
    ? { value, provenance: 'entered' }
    : { value: null, provenance: 'missing' };
}

/**
 * Derive recovery bays from bodytubes + chute/sled axialOffset spans.
 * Pure function of the component tree; never mutates its input.
 */
export function deriveBays(vehicle: RocketVehicle): DerivedBays {
  const bays: DerivedBay[] = [];
  const unplacedChutes: string[] = [];
  let tubeIndex = -1;

  for (const comp of vehicle.components) {
    if (comp.type === 'bodytube') {
      tubeIndex = bays.length;
      bays.push({
        tubeId: comp.id,
        tubeName: comp.name,
        lengthM: enteredOrMissing(comp.length),
        innerDiameterM: enteredOrMissing(comp.innerDiameter),
        items: [],
        ambiguityNote: null,
      });
      continue;
    }
    if (tubeIndex < 0) continue;
    if (comp.type !== 'parachute' && comp.type !== 'masscomponent') continue;
    const bay = bays[tubeIndex];
    const offset = comp.axialOffset ?? 0;
    const tubeLength = bay.lengthM.value;
    const inSpan = tubeLength !== null && offset >= 0 && offset <= tubeLength;
    if (comp.type === 'parachute') {
      if (!inSpan) {
        unplacedChutes.push(comp.name);
        continue;
      }
      const bore = bay.innerDiameterM.value;
      bay.items.push({
        kind: 'chute',
        id: comp.id,
        name: comp.name,
        lengthM: enteredOrMissing(comp.packedLengthM),
        diameterM: finitePositive(comp.packedDiameterM)
          ? { value: comp.packedDiameterM, provenance: 'entered' }
          : bore !== null
            ? { value: bore, provenance: 'assumed' }
            : { value: null, provenance: 'missing' },
        massG: finitePositive(comp.mass)
          ? { value: comp.mass * 1000, provenance: 'entered' }
          : { value: null, provenance: 'missing' },
      });
    } else {
      if (!inSpan) continue;
      const cross = [comp.widthM, comp.heightM].filter(finitePositive);
      bay.items.push({
        kind: 'sled',
        id: comp.id,
        name: comp.name,
        lengthM: enteredOrMissing(comp.length),
        diameterM: cross.length > 0
          ? { value: Math.min(...cross), provenance: 'entered' }
          : { value: null, provenance: 'missing' },
        massG: null,
      });
    }
  }

  for (const bay of bays) {
    const chuteCount = bay.items.filter((i) => i.kind === 'chute').length;
    if (chuteCount > 1) {
      bay.ambiguityNote =
        `${chuteCount} chutes share this tube — stacking order is list order (assumed), never measured`;
    }
  }

  return { bays: bays.filter((b) => b.items.some((i) => i.kind === 'chute')), unplacedChutes };
}