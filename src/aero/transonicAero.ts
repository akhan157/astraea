/**
 * Astraea Transonic & Supersonic Aerodynamics Engine
 * Implements high-Mach drag breakdown (Van Driest II skin friction, wave drag,
 * base drag with motor plume power-on/off, boattail factors) and Mach-dependent CP shift.
 * Modeled after USAF Missile DATCOM and RASAero II theoretical basis.
 */

import { RocketVehicle, NoseconeComponent, TrapezoidFinSetComponent } from '../core/types';
import { aggregateVehicleMass } from '../core/mass';
import { computeRocketStability } from './barrowman';

export interface DragBreakdown {
  mach: number;
  totalCd: number;
  frictionCd: number;
  waveCd: number;
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

  // Incompressible turbulent skin friction via Schlichting formula
  const cfIncompressible = 0.455 / Math.pow(Math.log10(effectiveReynolds), 2.58);

  // Van Driest II compressibility transformation factor for adiabatic wall
  // m_param = sqrt( (gamma-1)/2 * M^2 / (1 + r * (gamma-1)/2 * M^2) ) with r = 0.89
  const mTerm = 0.2 * mach * mach;
  const mParam = Math.sqrt(mTerm / (1.0 + 0.89 * mTerm));
  const fc = mParam > 0.001 ? Math.pow(Math.asin(mParam) / mParam, 2) : 1.0;

  return cfIncompressible / fc;
}

/**
 * Calculates nosecone wave drag coefficient referenced to body tube frontal area
 */
export function computeNoseconeWaveDrag(comp: NoseconeComponent, mach: number): number {
  if (mach < 0.8) return 0.005; // Negligible wave drag in subsonic flow

  const finenessRatio = comp.length / Math.max(0.01, comp.baseDiameter);
  const invFinenessSq = 1.0 / Math.pow(finenessRatio, 2);

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
  if (mach < 0.8) return 0;

  const finArea = 0.5 * (comp.rootChord + comp.tipChord) * comp.span * comp.finCount;
  const areaRatio = finArea / Math.max(0.0001, refArea);
  const tOverC = comp.thickness / Math.max(0.01, comp.rootChord);

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
 * Calculates base drag coefficient with motor power-on plume and boattail reduction
 */
export function computeBaseDrag(
  mach: number,
  baseDiameter: number,
  bodyDiameter: number,
  isMotorBurning: boolean = false
): number {
  const boattailFactor = Math.pow(baseDiameter / Math.max(0.01, bodyDiameter), 2);

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
 * Computes complete high-Mach drag breakdown and Center of Pressure curve from M=0 to M=4.0
 */
export function computeAerodynamicCurves(
  vehicle: RocketVehicle,
  isMotorBurning: boolean = false,
  machPointsCount: number = 41
): AeroCurveResult {
  const massRollup = aggregateVehicleMass(vehicle);
  const totalLength = massRollup.totalLength;
  const refDiameter = massRollup.referenceDiameter;
  const refArea = (Math.PI / 4) * Math.pow(refDiameter, 2);

  // Subsonic baseline from Barrowman
  const subsonicStability = computeRocketStability(vehicle);
  const subsonicCP = subsonicStability.cp;
  // Wetted area approximation for skin friction
  const wettedArea = Math.PI * refDiameter * totalLength * 1.15;

  const nose = vehicle.components.find((c) => c.type === 'nosecone') as NoseconeComponent | undefined;
  const fins = vehicle.components.find((c) => c.type === 'trapezoidfinset') as TrapezoidFinSetComponent | undefined;
  const aftTransition = [...vehicle.components].reverse().find((c) => c.type === 'transition');
  const baseDiameter = aftTransition && aftTransition.type === 'transition' ? aftTransition.aftDiameter : refDiameter;

  const machPoints: number[] = [];
  const dragCurves: DragBreakdown[] = [];

  let maxTransonicCd = 0;
  let machAtMaxCd = 1.0;

  for (let i = 0; i < machPointsCount; i++) {
    const mach = (i / (machPointsCount - 1)) * 4.0; // 0.0 to 4.0 Mach
    machPoints.push(mach);

    const velocity = Math.max(10, mach * SPEED_OF_SOUND_SL);

    // 1. Compressible Skin Friction Drag
    const cf = computeCompressibleSkinFriction(mach, totalLength, velocity);
    const frictionCd = cf * (wettedArea / Math.max(0.0001, refArea));

    // 2. Wave Drag (Nosecone + Fins)
    let waveCd = 0;
    if (nose) {
      waveCd += computeNoseconeWaveDrag(nose, mach);
    }
    if (fins) {
      waveCd += computeFinWaveDrag(fins, mach, refArea);
    }

    // 3. Base Drag (with plume and boattail)
    const baseCd = computeBaseDrag(mach, baseDiameter, refDiameter, isMotorBurning);

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

    // 5. Supersonic Center of Pressure Migration
    // At supersonic speeds, fin lift slope degrades (1 / sqrt(M^2 - 1)),
    // causing the whole rocket CP to shift forward toward the nosecone!
    let cp = subsonicCP;
    if (mach > 1.0) {
      // Supersonic forward shift reaches up to 0.4 - 0.8 calibers
      const shiftCalibers = Math.min(0.8, 0.45 * (1.0 - 1.0 / Math.sqrt(mach * mach)));
      cp = Math.max(0.1, subsonicCP - shiftCalibers * refDiameter);
    }

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
