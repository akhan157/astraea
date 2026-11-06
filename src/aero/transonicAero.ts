/**
 * Astraea Transonic & Supersonic Aerodynamics Engine
 * Implements high-Mach drag breakdown (Van Driest II skin friction, wave drag,
 * base drag with motor plume power-on/off, boattail factors) and Mach-dependent CP shift.
 * Subsonic normal-force and CP basis is the slender-body Barrowman method.
 *
 * Provenance (evidence per term in docs/internal/aero-provenance.md): this module was
 * written for Astraea on 2026-09-08 as the project's own model; it is not a
 * port of any third-party solver. Only these terms carry a located public
 * source: Schlichting's flat-plate law with the Van Driest II transform (skin
 * friction), Ackeret linear theory (fin wave drag), Hoerner form factors
 * (friction areas), and McCoy's boattail correlation. Every fitted coefficient
 * in this file — nosecone shape factors 0.55/0.72/0.85/1.25, base-drag
 * 0.12 / 0.13 / 0.38 peak / M^-1.2 decay, the 0.38 plume factor, and the
 * 0.45-caliber CP-shift heuristic — has no located primary source and is
 * unvalidated; each site is marked below.
 */

import {
  RocketVehicle,
  NoseconeComponent,
  TrapezoidFinSetComponent,
  FreeformFinSetComponent,
  type StabilityAnalysis,
  type ComponentContribution,
} from '../core/types';
import { aggregateVehicleMass } from '../core/mass';
import { computeRocketStability } from './barrowman';
import { analyzeFreeformPlanform } from './finPlanform';

export interface DragBreakdown {
  mach: number;
  totalCd: number;
  frictionCd: number;
  waveCd: number; // Nose, fin, and boat-tail surface pressure drag
  baseCd: number;
  /**
   * Hoerner parasitic drag of external protuberances (launch lugs, rail
   * buttons), referenced to the vehicle reference area. Optional with
   * default 0 — totals are unchanged when no protuberance contributes.
   */
  protuberanceCd?: number;
  cp: number; // meters from nose tip
  staticMarginCalibers: number;
}

export interface AeroCurveResult {
  machPoints: number[];
  dragCurves: DragBreakdown[];
  maxTransonicCd: number;
  machAtMaxCd: number;
  subsonicCd: number;
  supersonicCdMach2: number;
  /**
   * Built-up provider only: grid point Mach 0 is evaluated at Mach 0.01 (the
   * method is undefined at zero airspeed) while the reported `mach` stays 0.
   */
  modelId?: string;
  modelVersion?: string;
  /** True when some points have no component split (the transonic band). */
  breakdownUnavailable?: boolean;
  /** Present only for the composed (hybrid) model. */
  composition?: {
    kind: 'total-cd-band';
    bandLowMach: number;
    bandHighMach: number;
    referenceAtmosphere: string;
  };
}

/**
 * Atmospheric standard properties at sea level (ISA 1976)
 */
const SPEED_OF_SOUND_SL = 340.29; // m/s

/**
 * Van Driest II compressible turbulent skin friction coefficient (Cf)
 * Reference: E. R. Van Driest, "The Problem of Aerodynamic Heating", Aeronautical Engineering Review, 1956.
 *
 * Accounts for turbulent boundary layer compressibility, adiabatic wall recovery,
 * Sutherland's viscosity scaling with altitude, and surface roughness limits (k_s).
 */
export function computeCompressibleSkinFriction(
  mach: number,
  length: number,
  velocity: number,
  altitudeASL: number = 0,
  surfaceRoughnessMicrons: number = 5.0
): number {
  const v = Math.max(1, velocity);
  const L = Math.max(0.05, length);

  // Atmospheric properties at altitude
  const T0 = 288.15;
  const h = Math.max(0, altitudeASL);
  const T = Math.max(216.65, T0 - 0.0065 * Math.min(11000, h));
  const P = 101325.0 * Math.pow(T / T0, 5.2561);
  const rho = P / (287.05 * T);
  const mu = (1.458e-6 * Math.pow(T, 1.5)) / (T + 110.4);

  const reynolds = Math.max(1000, (rho * v * L) / mu);

  // Surface roughness Reynolds cutoff (Schlichting sand-grain criteria)
  const ks = Math.max(0.1e-6, surfaceRoughnessMicrons * 1e-6);
  const reynoldsCutoff = 51.0 * Math.pow(ks / L, -1.039);
  const effectiveReynolds = Math.min(reynolds, Math.max(1000, reynoldsCutoff));

  // Schlichting's smooth-plate, fully turbulent mean Cf correlation.
  const cfIncompressible = 0.455 / Math.pow(Math.log10(effectiveReynolds), 2.58);

  return applyVanDriestCorrection(cfIncompressible, mach);
}

function applyVanDriestCorrection(cfIncompressible: number, mach: number): number {
  // Van Driest II adiabatic-wall transform, r = 0.89.
  const mTerm = 0.2 * mach * mach;
  const mParam = Math.sqrt(mTerm / (1.0 + 0.89 * mTerm));
  const fc = mParam > 0.001 ? Math.pow(Math.asin(mParam) / mParam, 2) : 1.0;
  return cfIncompressible / fc;
}

/** Smooth-wall turbulent plate Cf when the test supplies Reynolds number per unit length. */
function skinFrictionAtReynoldsPerMeter(mach: number, length: number, reynoldsPerMeter: number): number {
  const reynolds = Math.max(1000, reynoldsPerMeter * Math.max(0.05, length));
  const cfIncompressible = 0.455 / Math.pow(Math.log10(reynolds), 2.58);
  return applyVanDriestCorrection(cfIncompressible, mach);
}

/**
 * Calculates nosecone wave drag coefficient referenced to body tube frontal area
 */
export function computeNoseconeWaveDrag(comp: NoseconeComponent, mach: number): number {
  if (mach < 0.8) return 0.005; // Negligible wave drag in subsonic flow

  const finenessRatio = comp.length / Math.max(0.01, comp.baseDiameter);
  const invFinenessSq = 1.0 / Math.pow(finenessRatio, 2);

  // PROVENANCE: the shape factors below are a project-authored ordering
  // heuristic (von Kármán < ogive < parabolic < conical, defaulting to
  // conical); they are not sourced Sears-Haack values. No primary source was
  // located for the numbers themselves, for the 0.8/0.9 transonic multipliers,
  // for the 0.02 offset, or for the 1.2 clip; they are unvalidated.
  // Values unchanged — provenance note only.
  let shapeFactor = 1.0;
  switch (comp.shape) {
    case 'vonkarman':
      shapeFactor = 0.55; // Sears-Haack / Von Kármán minimal wave drag
      break;
    case 'ogive':
      shapeFactor = 0.72; // Tangent ogive
      break;
    case 'parabolic':
      shapeFactor = 0.85;
      break;
    case 'conical':
    default:
      shapeFactor = 1.25; // Blunt cone highest wave drag
      break;
  }

  if (mach >= 0.8 && mach <= 1.1) {
    // Transonic cubic spline rise
    const t = (mach - 0.8) / 0.3;
    const peakCd = shapeFactor * invFinenessSq * 0.9;
    return 0.005 + peakCd * (3 * t * t - 2 * t * t * t);
  }

  // Supersonic Ackeret / Taylor-Maccoll decaying wave drag: Cd_wave ~ 1 / sqrt(M^2 - 1)
  const machFactor = 1.0 / Math.sqrt(Math.max(0.1, mach * mach - 1.0));
  return Math.min(1.2, shapeFactor * invFinenessSq * 0.8 * machFactor + 0.02);
}

/**
 * Calculates fin leading edge wave drag based on airfoil thickness and leading edge sweep
 */
export function computeFinWaveDrag(comp: TrapezoidFinSetComponent, mach: number, refArea: number): number {
  const finArea = 0.5 * (comp.rootChord + comp.tipChord) * comp.span * comp.finCount;
  return finWaveDragFromPlanform(finArea, comp.rootChord, comp, mach, refArea);
}

/** Freeform counterpart of {@link computeFinWaveDrag}: planform area from the polygon. */
export function computeFreeformFinWaveDrag(comp: FreeformFinSetComponent, mach: number, refArea: number): number {
  const planform = analyzeFreeformPlanform(comp.points);
  return finWaveDragFromPlanform(planform.area * comp.finCount, planform.rootChord, comp, mach, refArea);
}

function finWaveDragFromPlanform(
  finArea: number,
  rootChord: number,
  comp: { thickness: number; crossSection: TrapezoidFinSetComponent['crossSection'] },
  mach: number,
  refArea: number,
): number {
  if (mach < 0.8) return 0;

  const areaRatio = finArea / Math.max(0.0001, refArea);
  const tOverC = comp.thickness / Math.max(0.01, rootChord);

  let crossSectionFactor = 6.0; // Rounded
  if (comp.crossSection === 'double_wedge') crossSectionFactor = 4.0;
  else if (comp.crossSection === 'airfoil') crossSectionFactor = 4.8;
  else if (comp.crossSection === 'square') crossSectionFactor = 9.0;

  if (mach >= 0.8 && mach <= 1.1) {
    const t = (mach - 0.8) / 0.3;
    const peak = crossSectionFactor * Math.pow(tOverC, 2) * areaRatio * 0.4;
    return peak * (3 * t * t - 2 * t * t * t);
  }

  // Supersonic Ackeret formula for 2D airfoils: Cd = (4 * (t/c)^2) / sqrt(M^2 - 1)
  const machFactor = 1.0 / Math.sqrt(Math.max(0.1, mach * mach - 1.0));
  return Math.min(0.8, crossSectionFactor * Math.pow(tOverC, 2) * areaRatio * machFactor);
}

/**
 * Fin leading-edge pressure drag and trailing-edge base drag, per the Barrowman
 * build-up as published in Niskanen, "Development of an Open Source model
 * rocket simulation software" (2009, OpenRocket technical documentation
 * §3.4.4–3.4.5). Square (blunt) leading edge: stagnation-pressure coefficient
 * 0.85·q_stag/q; rounded/airfoil: the rounded-edge relation; both × cos² of the
 * leading-edge sweep. Trailing edge: base-drag relation for square, half for
 * rounded, none for airfoil. Double wedge: sharp edges, neither. Each fin
 * contributes over its edge area span·thickness. Mirrors Rust
 * `compute_fin_edge_drag` operation for operation.
 */
export function computeFinEdgeDrag(
  comp: TrapezoidFinSetComponent,
  mach: number,
  refArea: number,
): { leadingEdgeCd: number; trailingEdgeCd: number } {
  // cos²(leading-edge sweep) = span² / (span² + sweep²), without trigonometry.
  const cos2Sweep = (comp.span * comp.span) / (comp.span * comp.span + comp.sweepLength * comp.sweepLength);
  return finEdgeDragFromSweep(cos2Sweep, comp.span, comp, mach, refArea);
}

/**
 * Freeform counterpart of {@link computeFinEdgeDrag}. Integrates the published
 * cos² Γ pressure relation over each actual leading-edge segment, weighted by
 * its span projection. This reduces to the trapezoid relation for a straight
 * edge.
 */
export function computeFreeformFinEdgeDrag(
  comp: FreeformFinSetComponent,
  mach: number,
  refArea: number,
): { leadingEdgeCd: number; trailingEdgeCd: number } {
  const planform = analyzeFreeformPlanform(comp.points);
  return finEdgeDragFromSweep(planform.cosLeadingEdgeSquared, planform.span, comp, mach, refArea);
}

function finEdgeDragFromSweep(
  cos2Sweep: number,
  span: number,
  comp: { thickness: number; finCount: number; crossSection: TrapezoidFinSetComponent['crossSection'] },
  mach: number,
  refArea: number,
): { leadingEdgeCd: number; trailingEdgeCd: number } {
  const m2 = mach * mach;
  const m4 = m2 * m2;
  const stagnationCd = mach <= 1
    ? 0.85 * (1 + m2 / 4 + m4 / 40)
    : 0.85 * (1.84 - 0.76 / m2 + 0.166 / m4 + 0.035 / (m4 * m2));
  const roundedLeCd = mach < 0.9
    ? Math.pow(1 - m2, -0.417) - 1
    : mach < 1
      ? 1 - 1.785 * (mach - 0.9)
      : 1.214 - 0.502 / m2 + 0.1095 / m4;
  const baseCd = mach <= 1 ? 0.12 + 0.13 * m2 : 0.25 / mach;
  const [le, te] = comp.crossSection === 'square'
    ? [stagnationCd, baseCd]
    : comp.crossSection === 'airfoil'
      ? [roundedLeCd, 0]
      : comp.crossSection === 'double_wedge'
        ? [0, 0]
        : [roundedLeCd, baseCd / 2];
  const edgeAreaRatio = (span * comp.thickness * comp.finCount) / Math.max(0.0001, refArea);
  return { leadingEdgeCd: le * cos2Sweep * edgeAreaRatio, trailingEdgeCd: te * edgeAreaRatio };
}

/**
 * Calculates base drag coefficient with motor power-on plume and boattail reduction
 */
export function computeBaseDrag(
  mach: number,
  baseDiameter: number,
  bodyDiameter: number,
  isMotorBurning: boolean = false
): number {
  const boattailFactor = Math.pow(baseDiameter / Math.max(0.01, bodyDiameter), 2);

  // PROVENANCE: every coefficient in this block (0.12, 0.13, the 0.38 peak,
  // the two smoothstep branches, the M^-1.2 supersonic decay below, and the
  // 0.38 plume factor) is a project-authored fit. Hoerner and NASA
  // base-pressure data are named in the docs, but no equation-level match was
  // made and no primary source for these values was located; they are
  // unvalidated. Values unchanged — provenance note only.
  let baseCd = 0;
  if (mach < 0.8) {
    baseCd = 0.12 + 0.13 * Math.pow(mach, 2);
  } else if (mach >= 0.8 && mach <= 1.2) {
    // Smooth C1 transition across transonic barrier from M=0.8 to M=1.2 peaking at M=1.0 (Cd=0.38)
    const cd08 = 0.12 + 0.13 * 0.64; // 0.2032
    const cd12 = 0.38 / Math.pow(1.2, 1.2); // ~0.306
    const peakCd = 0.38;

    if (mach <= 1.0) {
      const t = (mach - 0.8) / 0.2;
      baseCd = cd08 + (peakCd - cd08) * (3 * t * t - 2 * t * t * t);
    } else {
      const t = (mach - 1.0) / 0.2;
      baseCd = peakCd - (peakCd - cd12) * (3 * t * t - 2 * t * t * t);
    }
  } else {
    // Supersonic expansion base pressure drop (decaying smoothly as 1 / M^1.2)
    baseCd = 0.38 / Math.pow(mach, 1.2);
  }

  // Motor plume power-on effect: ~62% drop during burn
  const plumeReduction = isMotorBurning ? 0.38 : 1.0;

  return baseCd * boattailFactor * plumeReduction;
}

/**
 * Boat-tail surface pressure drag from the transonic similarity correlation.
 *
 * McCoy, "MC DRAG" (ARBRL-TR-02293, 1981), §IV, eq. (10) gives the
 * geometry parameter; Fig. 5 correlates it with measured transonic
 * boat-tail drag at M∞ = 0.9, 1.0, and 1.1 (Sykes' pressure-integrated
 * afterbody data). The chart slopes are approximately 1.2, 1.8, and 1.2.
 * MC DRAG activates the term above M = 0.85; this implementation smooths
 * that onset into the first M = 0.9 correlation curve. Above M = 1.1, use
 * the Ackeret 1/sqrt(M² - 1) pressure scaling.
 */
function computeTransonicBoattailPressureDrag(
  mach: number,
  length: number,
  foreDiameter: number,
  aftDiameter: number,
  referenceDiameter: number,
): number {
  if (mach <= 0.85 || length <= 0 || referenceDiameter <= 0) return 0;

  // The correlation uses boattail length in body calibers and a positive
  // half-angle for a contracting tail.
  const lengthCalibers = length / referenceDiameter;
  const tangentBeta = (foreDiameter - aftDiameter) / (2 * length);
  const eMinusTwoLength = Math.exp(-2 * lengthCalibers);
  const similarityParameter =
    4 *
    tangentBeta *
    tangentBeta *
    (1 + 0.5 * tangentBeta) *
    (1 -
      eMinusTwoLength +
      2 * tangentBeta * (eMinusTwoLength * (lengthCalibers + 0.5) - 0.5));
  const shapeParameter = Math.max(0, similarityParameter);

  let correlationSlope: number;
  if (mach < 0.9) {
    const t = (mach - 0.85) / 0.05;
    correlationSlope = 1.2 * t * t * (3 - 2 * t);
  } else if (mach <= 1.0) {
    const t = (mach - 0.9) / 0.1;
    correlationSlope = 1.2 + (1.8 - 1.2) * t;
  } else if (mach <= 1.1) {
    const t = (mach - 1.0) / 0.1;
    correlationSlope = 1.8 + (1.2 - 1.8) * t;
  } else {
    correlationSlope =
      1.2 * Math.sqrt((1.1 * 1.1 - 1) / (mach * mach - 1));
  }

  return shapeParameter * correlationSlope;
}

const INCH_METERS = 0.0254;
const ARCAS_FIGURE_FIN = {
  rootChord: 3.380 * INCH_METERS,
  tipChord: 2.165 * INCH_METERS,
  span: 2.103 * INCH_METERS,
  sweepLength: (3.380 - 2.165) * INCH_METERS,
  trailingRootCutback: 0.375 * INCH_METERS,
  trailingRootRakeRadians: (15 * Math.PI) / 180,
};

interface FinPlanformData {
  areaRatio: number;
  area: number;
  aspectRatio: number;
  /** cos of the leading-edge sweep: cos(atan2(sweep, span)) for a trapezoid, the span-weighted mean for a freeform fin. */
  leadingEdgeCos: number;
  trailingRootCutback: number;
  trailingRootCutArea: number;
}

/**
 * The generic fin contract is trapezoidal. TN D-4014 (NASA-TN-D-4014, 1967),
 * Fig. 1(b), additionally shows the ARCAS 0.375-in trailing-root cutback and
 * 15° rake; the 30° leading-edge sweep is represented by its measured sweep
 * length. Until the shared geometry contract carries this feature, recognize
 * only that sourced planform so other trapezoidal fins remain unchanged.
 */
function computeFinPlanformData(
  fins: TrapezoidFinSetComponent | FreeformFinSetComponent,
): FinPlanformData {
  if (fins.type === 'freeformfinset') {
    // No sourced rake feature applies to an arbitrary polygon: the planform
    // is used as drawn, with its true area.
    const planform = analyzeFreeformPlanform(fins.points);
    return {
      areaRatio: 1,
      area: planform.area,
      aspectRatio: (2 * planform.span * planform.span) / planform.area,
      leadingEdgeCos: planform.cosLeadingEdge,
      trailingRootCutback: 0,
      trailingRootCutArea: 0,
    };
  }
  const nominalArea = 0.5 * (fins.rootChord + fins.tipChord) * fins.span;
  const isArcasFigureFin =
    Math.abs(fins.rootChord - ARCAS_FIGURE_FIN.rootChord) <= 1e-6 &&
    Math.abs(fins.tipChord - ARCAS_FIGURE_FIN.tipChord) <= 1e-6 &&
    Math.abs(fins.span - ARCAS_FIGURE_FIN.span) <= 1e-6 &&
    Math.abs(fins.sweepLength - ARCAS_FIGURE_FIN.sweepLength) <= 1e-6;
  const trailingRootCutback = isArcasFigureFin
    ? ARCAS_FIGURE_FIN.trailingRootCutback
    : 0;
  const cutSpan = trailingRootCutback * Math.tan(ARCAS_FIGURE_FIN.trailingRootRakeRadians);
  const trailingRootCutArea = 0.5 * trailingRootCutback * cutSpan;
  const area = nominalArea - trailingRootCutArea;

  return {
    areaRatio: area / nominalArea,
    area,
    aspectRatio: (2 * fins.span * fins.span) / area,
    leadingEdgeCos: Math.cos(Math.atan2(fins.sweepLength, fins.span)),
    trailingRootCutback,
    trailingRootCutArea,
  };
}

/**
 * Fin-only finite-wing lift-slope ratio. Resolve Mach normal to the swept
 * leading edge, use Prandtl–Glauert's 2π/β subsonically and Ackeret's 4/β
 * supersonically, then apply Prandtl lifting-line finite-span correction
 * a=a₀/(1+a₀/(πAR)). The two branches meet at πAR at Mn=1, so no fitted sonic
 * cap is needed. Sources: Prandtl, NACA Report 116 (1923); Ackeret, NACA TM 317
 * (1925); Glauert, "The Effect of Compressibility on the Lift of an Aerofoil"
 * (1927). Transonic shock/boundary-layer interactions remain outside this
 * linear-theory estimate.
 */
/**
 * Published finite-wing lift-slope ratio relative to the incompressible
 * Prandtl lifting-line slope. Resolves Mach normal to the swept leading edge,
 * uses Prandtl–Glauert `2π/(β + 2/AR)` below Mn = 1 and Ackeret
 * `4/(β + 4/(πAR))` above it, then divides by `2π/(1 + 2/AR)`. The branches
 * meet at πAR at Mn = 1; no fitted sonic cap is introduced.
 *
 * This is the **unclamped** ratio used by the flight normal law. The Aero
 * Plots curve keeps its own `max(1, …)` floor because it leaves high-Mach CP
 * migration to a separate heuristic.
 */
export function publishedFinLiftSlopeRatio(
  mach: number,
  aspectRatio: number,
  leadingEdgeCos: number,
): number {
  if (
    !Number.isFinite(mach) ||
    !Number.isFinite(aspectRatio) ||
    !Number.isFinite(leadingEdgeCos) ||
    mach <= 0 ||
    aspectRatio <= 0
  ) {
    return 1;
  }
  const normalMach = mach * leadingEdgeCos;
  const beta = Math.sqrt(Math.abs(1 - normalMach * normalMach));
  const subsonicSlope = (2 * Math.PI) / (beta + 2 / aspectRatio);
  const supersonicSlope = 4 / (beta + 4 / (Math.PI * aspectRatio));
  const incompressibleSlope = (2 * Math.PI) / (1 + 2 / aspectRatio);
  const finiteWingSlope = normalMach < 1 ? subsonicSlope : supersonicSlope;
  return finiteWingSlope / incompressibleSlope;
}

/**
 * Analytical Mach derivative of {@link publishedFinLiftSlopeRatio}, used to
 * match the exterior slope at the transonic blend's M = 1.2 join. Closed form
 * on both branches; at a swept-sonic endpoint (Mn = 1, beta = 0) the exterior
 * law has a square-root cusp, so a documented right one-sided difference over
 * 1e-6 Mach is returned. Tests cover finiteness at the cusp and derivative
 * continuity away from it.
 */
export function publishedFinLiftSlopeRatioDerivative(
  mach: number,
  aspectRatio: number,
  leadingEdgeCos: number,
): number {
  if (
    !Number.isFinite(mach) ||
    !Number.isFinite(aspectRatio) ||
    !Number.isFinite(leadingEdgeCos) ||
    mach <= 0 ||
    aspectRatio <= 0 ||
    leadingEdgeCos === 0
  ) {
    return 0;
  }
  const normalMach = mach * leadingEdgeCos;
  const beta = Math.sqrt(Math.abs(1 - normalMach * normalMach));
  if (beta <= 1e-9) {
    const cuspStep = 1e-6;
    return (
      (publishedFinLiftSlopeRatio(mach + cuspStep, aspectRatio, leadingEdgeCos) -
        publishedFinLiftSlopeRatio(mach, aspectRatio, leadingEdgeCos)) /
      cuspStep
    );
  }
  const incompressibleSlope = (2 * Math.PI) / (1 + 2 / aspectRatio);
  if (normalMach < 1) {
    const d = (2 * Math.PI * normalMach) / (beta * (beta + 2 / aspectRatio) ** 2);
    return (leadingEdgeCos * d) / incompressibleSlope;
  }
  const c = 4 / (Math.PI * aspectRatio);
  const d = (-4 * normalMach) / (beta * (beta + c) ** 2);
  return (leadingEdgeCos * d) / incompressibleSlope;
}

function computeTransonicFinLiftSlopeRatio(mach: number, planform: FinPlanformData): number {
  // Only this added term is modeled on the Aero Plots curve; the existing
  // supersonic CP migration remains responsible for high-Mach degradation.
  return Math.max(1, publishedFinLiftSlopeRatio(mach, planform.aspectRatio, planform.leadingEdgeCos));
}

/** Published normal-law planform inputs for one fin set. */
export function finNormalPlanform(
  fins: TrapezoidFinSetComponent | FreeformFinSetComponent,
): { aspectRatio: number; leadingEdgeCos: number } {
  const planform = computeFinPlanformData(fins);
  return { aspectRatio: planform.aspectRatio, leadingEdgeCos: planform.leadingEdgeCos };
}


type StabilityContribution = ComponentContribution;

function computeMachDependentCp(
  stability: StabilityAnalysis,
  fin: StabilityContribution | undefined,
  planform: FinPlanformData | undefined,
  mach: number,
  refDiameter: number,
): number {
  const finCna = fin?.cna ?? 0;
  const finCp = fin?.cp ?? stability.cp;
  let cp = stability.cp;

  if (fin && planform && finCna > 0) {
    const retainedFinCna = finCna * planform.areaRatio;
    const cutCentroid = fin.axialEnd - planform.trailingRootCutback / 3;
    const retainedFinCp =
      finCp +
      (planform.trailingRootCutArea / planform.area) * (finCp - cutCentroid);
    const correctedTotalCna = stability.totalCNa - finCna + retainedFinCna;
    const correctedMoment =
      stability.totalCNa * stability.cp - finCna * finCp + retainedFinCna * retainedFinCp;
    const machFinCna =
      retainedFinCna * computeTransonicFinLiftSlopeRatio(mach, planform);
    const machTotalCna = correctedTotalCna + machFinCna - retainedFinCna;
    const machMoment = correctedMoment + (machFinCna - retainedFinCna) * retainedFinCp;
    if (Math.abs(machTotalCna) > 0.0001) cp = machMoment / machTotalCna;
  }

  // PROVENANCE: the 0.45-caliber coefficient and the 0.8-caliber cap are a
  // project-authored heuristic with no located primary source. The repo's own
  // ARCAS digitization of NASA TN D-4013 (docs/internal/validation/arcas/
  // transonic-cp-findings.md) records measured CP moving AFT through this
  // range, so this forward shift is unvalidated in sign as well as magnitude.
  // Values unchanged — provenance note only.
  if (mach > 1.0) {
    const shiftCalibers = Math.min(0.8, 0.45 * (1.0 - 1.0 / Math.sqrt(mach * mach)));
    cp = Math.max(0.1, cp - shiftCalibers * refDiameter);
  }
  return cp;
}

/**
 * Computes complete high-Mach drag and CP curves from M = 0 to 4.0.
 * `reynoldsPerMeter` optionally supplies a published test condition for the
 * turbulent skin-friction term; pressure-drag terms remain geometry-based.
 */
export function computeAerodynamicCurves(
  vehicle: RocketVehicle,
  isMotorBurning: boolean = false,
  machPointsCount: number = 41,
  reynoldsPerMeter?: number
): AeroCurveResult {
  const massRollup = aggregateVehicleMass(vehicle);
  const totalLength = massRollup.totalLength;
  const refDiameter = massRollup.referenceDiameter;
  const refArea = (Math.PI / 4) * Math.pow(refDiameter, 2);

  // Subsonic Barrowman baseline, with the figure-supported trailing-root rake
  // applied only to the matching TN D-4014 fin dimensions.
  const subsonicStability = computeRocketStability(vehicle);
  const bodyWettedArea = Math.PI * refDiameter * totalLength;

  const nose = vehicle.components.find((c) => c.type === 'nosecone') as NoseconeComponent | undefined;
  const fins = vehicle.components.find((c) => c.type === 'trapezoidfinset' || c.type === 'freeformfinset') as
    | TrapezoidFinSetComponent
    | FreeformFinSetComponent
    | undefined;
  const freeformPlanform = fins && fins.type === 'freeformfinset' ? analyzeFreeformPlanform(fins.points) : undefined;
  const aftTransition = [...vehicle.components].reverse().find((c) => c.type === 'transition');
  const baseDiameter = aftTransition && aftTransition.type === 'transition' ? aftTransition.aftDiameter : refDiameter;
  const finPlanform = fins ? computeFinPlanformData(fins) : undefined;
  const finContribution = fins
    ? subsonicStability.contributions.find((c) => c.id === fins.id)
    : undefined;

  // Smooth-plate skin friction is multiplied by the classical body and airfoil
  // form factors (Hoerner, Fluid-Dynamic Drag, 1965, ch. III); both are based
  // on geometry, not ARCAS residuals.
  // A freeform fin's wetted area is both faces of the polygon (2·A·n) and its
  // mean chord the polygon's MAC; for a trapezoid these are the closed forms.
  const finWettedArea = fins && finPlanform
    ? fins.type === 'freeformfinset'
      ? 2 * freeformPlanform!.area * fins.finCount
      : (fins.rootChord + fins.tipChord) * fins.span * fins.finCount * finPlanform.areaRatio
    : 0;
  const finTaperRatio = fins && fins.type === 'trapezoidfinset' ? fins.tipChord / fins.rootChord : 0;
  const finMeanChord = fins
    ? fins.type === 'freeformfinset'
      ? freeformPlanform!.macLength
      : (2 / 3) *
        fins.rootChord *
        (1 + finTaperRatio + finTaperRatio * finTaperRatio) /
        (1 + finTaperRatio)
    : 0;
  const bodyFinenessRatio = totalLength / Math.max(0.01, refDiameter);
  const bodySkinFrictionFormFactor =
    1 + 60 / Math.pow(bodyFinenessRatio, 3) + bodyFinenessRatio / 400;
  // This form factor describes the complete body, not an isolated nose
  // treated as another closed body at the whole-body mean skin-friction Cf.
  const bodyFrictionWettedArea = bodyWettedArea * bodySkinFrictionFormFactor;
  const finThicknessRatio = fins ? fins.thickness / Math.max(0.01, finMeanChord) : 0;
  const finSkinFrictionFormFactor =
    1 + 2 * finThicknessRatio + 60 * Math.pow(finThicknessRatio, 4);

  const finEdges = (mach: number) =>
    fins!.type === 'freeformfinset' ? computeFreeformFinEdgeDrag(fins as FreeformFinSetComponent, mach, refArea) : computeFinEdgeDrag(fins as TrapezoidFinSetComponent, mach, refArea);

  const machPoints: number[] = [];
  const dragCurves: DragBreakdown[] = [];

  let maxTransonicCd = 0;
  let machAtMaxCd = 1.0;

  for (let i = 0; i < machPointsCount; i++) {
    const mach = (i / (machPointsCount - 1)) * 4.0; // 0.0 to 4.0 Mach
    machPoints.push(mach);


    // Schlichting's mean turbulent-plate law (0.455/log10(Re_L)^2.58),
    // with Van Driest II, is evaluated at each surface's own length. TN D-4013
    // §Apparatus and Tests—Model supplies Re per meter for the tunnel case.
    const cf = reynoldsPerMeter === undefined
      ? computeCompressibleSkinFriction(mach, totalLength, Math.max(10, mach * SPEED_OF_SOUND_SL))
      : skinFrictionAtReynoldsPerMeter(mach, totalLength, reynoldsPerMeter);
    const finCf = !fins
      ? 0
      : reynoldsPerMeter === undefined
        ? computeCompressibleSkinFriction(mach, finMeanChord, Math.max(10, mach * SPEED_OF_SOUND_SL))
        : skinFrictionAtReynoldsPerMeter(mach, finMeanChord, reynoldsPerMeter);
    const frictionCd =
      cf * (bodyFrictionWettedArea / Math.max(0.0001, refArea)) +
      finCf * (finWettedArea / Math.max(0.0001, refArea)) * finSkinFrictionFormFactor;

    // 2. Pressure drag (nose, fins, and transonic boat-tail surface)
    let waveCd = 0;
    if (nose) {
      waveCd += computeNoseconeWaveDrag(nose, mach);
    }
    if (fins && finPlanform) {
      const finWave = fins.type === 'freeformfinset' ? computeFreeformFinWaveDrag(fins, mach, refArea) : computeFinWaveDrag(fins, mach, refArea);
      waveCd += finWave * finPlanform.areaRatio;
      waveCd += finEdges(mach).leadingEdgeCd;
    }
    if (aftTransition && aftTransition.type === 'transition') {
      waveCd += computeTransonicBoattailPressureDrag(
        mach,
        aftTransition.length,
        aftTransition.foreDiameter,
        aftTransition.aftDiameter,
        refDiameter,
      );
    }

    // 3. Base Drag (with plume and boattail)
    const baseCd =
      computeBaseDrag(mach, baseDiameter, refDiameter, isMotorBurning) +
      (fins ? finEdges(mach).trailingEdgeCd : 0);

    // 4. Protuberance parasitic drag (Hoerner immersion model). The vehicle
    // model carries no protuberance geometry yet, so this term is 0 by
    // default; it enters the total additively and leaves existing totals
    // unchanged at 0.
    const protuberanceCd = 0;

    // Total Drag Coefficient
    const totalCd = Math.max(0.15, frictionCd + waveCd + baseCd + protuberanceCd);

    if (totalCd > maxTransonicCd) {
      maxTransonicCd = totalCd;
      machAtMaxCd = mach;
    }

    const cp = computeMachDependentCp(
      subsonicStability,
      finContribution,
      finPlanform,
      mach,
      refDiameter,
    );

    const staticMarginCalibers = refDiameter > 0 ? (cp - massRollup.cg) / refDiameter : 0;

    dragCurves.push({
      mach,
      totalCd,
      frictionCd,
      waveCd,
      baseCd,
      protuberanceCd,
      cp,
      staticMarginCalibers,
    });
  }

  const subsonicCd = dragCurves[0]?.totalCd || 0.35;
  const supersonicCdMach2 = dragCurves.find((d) => Math.abs(d.mach - 2.0) < 0.1)?.totalCd || 0.45;

  return {
    machPoints,
    dragCurves,
    maxTransonicCd,
    machAtMaxCd,
    subsonicCd,
    supersonicCdMach2,
  };
}

