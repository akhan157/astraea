/**
 * Astraea Protuberance Drag & Boattail Flow-Separation Monitor
 *
 * Hoerner-based parasitic drag for external protuberances (launch lugs, rail
 * buttons, camera housings, conduit). A protuberance squatting inside the
 * turbulent boundary layer sees reduced dynamic pressure; the mean velocity
 * profile u/u_e = (y/delta)^(1/7) from the 1/7-power-law boundary layer
 * model gives the immersion factor used here.
 *
 * Reference: S. F. Hoerner, "Fluid-Dynamic Drag", 1965 — Ch. VI (surface
 * irregularities & protruding parts), Ch. III (blunt bodies in crossflow).
 */

export interface ProtuberanceDragInput {
  /** Projected frontal area of the protuberance normal to the flow (m^2) */
  frontalArea: number;
  /** Vehicle reference area (typically body-tube frontal area, m^2) */
  refArea: number;
  /** Protuberance height above the surface (m) */
  lugHeight: number;
  /** Turbulent boundary layer thickness at the protuberance station (m) */
  boundaryLayerThickness: number;
  /**
   * Crossflow drag coefficient of the protuberance cross-section, referenced
   * to its frontal area. Defaults to 1.2 (Hoerner finite cylinder in
   * crossflow, Re ~= 10^4–10^5).
   */
  baseCylinderCd?: number;
}

export interface BoattailSeparationResult {
  /** Cone half-angle (deg), magnitude for both converging and diverging transitions */
  halfAngleDeg: number;
  /** True when the half-angle exceeds the 10 deg separation threshold */
  separated: boolean;
}

const DEFAULT_CYLINDER_CD = 1.2;
const SEPARATION_THRESHOLD_DEG = 10.0;
const MIN_REF_AREA = 0.0001; // m^2 — floor matching the aero engine's conventions

/**
 * Computes Hoerner parasitic drag coefficient of a protuberance, referenced
 * to the vehicle reference area.
 *
 * Cd = baseCylinderCd * (frontalArea / refArea) * (y/delta)^(1/7)
 *
 * The (y/delta)^(1/7) immersion factor reflects that only the outer fraction
 * of the protuberance is exposed to the freestream velocity; it is monotonic
 * in y/delta and clamped to [0, 1].
 *
 * NOTE ON THE EXPONENT: the factor is a VELOCITY-ratio immersion model,
 * (y/delta)^(1/7), because drag scales with the reduced dynamic pressure at
 * the protuberance station via the mean velocity profile. A dynamic-pressure
 * (q-ratio) formulation would square the factor, i.e. (y/delta)^(2/7); the
 * 1/7 exponent is kept deliberately per the gap-analysis contract and must
 * not be changed to 2/7 without revisiting that analysis.
 *
 * Returns 0 for zero frontal area or zero lug height; an undefined boundary
 * layer (thickness <= 0) means the protuberance is fully immersed, factor 1.
 * Throws RangeError on non-finite or negative inputs (boundaryLayerThickness
 * and refArea must be nonnegative).
 */
export function computeProtuberanceDrag(input: ProtuberanceDragInput): number {
  const { frontalArea, lugHeight, boundaryLayerThickness, refArea } = input;
  const baseCylinderCd = input.baseCylinderCd ?? DEFAULT_CYLINDER_CD;

  const dims = [frontalArea, lugHeight, boundaryLayerThickness, refArea, baseCylinderCd];
  for (const v of dims) {
    if (!Number.isFinite(v)) {
      throw new RangeError(
        `computeProtuberanceDrag: inputs must be finite numbers (got ${v})`
      );
    }
  }
  if (boundaryLayerThickness < 0) {
    throw new RangeError(
      `computeProtuberanceDrag: boundaryLayerThickness must be nonnegative (got ${boundaryLayerThickness})`
    );
  }
  if (refArea < 0) {
    throw new RangeError(
      `computeProtuberanceDrag: refArea must be nonnegative (got ${refArea})`
    );
  }

  const frontalAreaC = Math.max(0, frontalArea);
  const lugHeightC = Math.max(0, lugHeight);
  const boundaryLayerThicknessC = Math.max(0, boundaryLayerThickness);
  const refAreaC = Math.max(MIN_REF_AREA, refArea);

  if (frontalAreaC <= 0 || lugHeightC <= 0) {
    return 0;
  }

  let immersionFactor: number;
  if (boundaryLayerThicknessC <= 0) {
    immersionFactor = 1.0; // No boundary layer — protuberance fully in freestream
  } else {
    immersionFactor = Math.min(
      1.0,
      Math.pow(lugHeightC / boundaryLayerThicknessC, 1.0 / 7.0)
    );
  }

  return Math.max(0, baseCylinderCd * (frontalAreaC / refAreaC) * immersionFactor);
}

/**
 * Monitors a conical transition for flow separation. A boattail (or flare)
 * is treated as separated when its cone half-angle exceeds 10 deg, the
 * classical threshold for separated flow on conical afterbodies.
 *
 * halfAngle = atan( |foreDiameter - aftDiameter| / (2 * length) )
 *
 * The magnitude is used so both convergent boattails and divergent flares are
 * monitored; flow separation concerns apply to both. Degenerate geometry
 * (non-positive diameters or length) yields halfAngleDeg = 0 and no flag.
 * Throws RangeError on non-finite inputs.
 */
export function boattailSeparationCheck(
  foreDiameter: number,
  aftDiameter: number,
  length: number
): BoattailSeparationResult {
  if (!Number.isFinite(foreDiameter) || !Number.isFinite(aftDiameter) || !Number.isFinite(length)) {
    throw new RangeError(
      `boattailSeparationCheck: diameters and length must be finite numbers (got fore=${foreDiameter}, aft=${aftDiameter}, length=${length})`
    );
  }
  if (foreDiameter <= 0 || aftDiameter <= 0 || length <= 0) {
    return { halfAngleDeg: 0, separated: false };
  }

  const halfAngleRad = Math.atan(Math.abs(foreDiameter - aftDiameter) / (2 * length));
  const halfAngleDeg = halfAngleRad * 180.0 / Math.PI;

  return { halfAngleDeg, separated: halfAngleDeg > SEPARATION_THRESHOLD_DEG };
}