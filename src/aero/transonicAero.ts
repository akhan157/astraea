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
const RHO_SEA_LEVEL = 1.225; // kg/m^3
const VISCOSITY_AIR = 1.789e-5; // Pa*s
const SPEED_OF_SOUND_SL = 340.29; // m/s

/**
 * Van Driest II compressible turbulent skin friction coefficient (Cf)
 * Maps compressible turbulent boundary layer data onto incompressible law of the wall.
 */
export function computeCompressibleSkinFriction(mach: number, length: number, velocity: number): number {
  const v = Math.max(1, velocity);
  const reynolds = Math.max(1000, (RHO_SEA_LEVEL * v * length) / VISCOSITY_AIR);

  // Incompressible turbulent skin friction via Schlichting formula
  const cfIncompressible = 0.074 / Math.pow(reynolds, 0.2);

  // Van Driest II compressibility correction factor
  // Cf_comp = Cf_incomp / (1 + 0.15 * M^2)^0.58
  const compressibilityFactor = Math.pow(1.0 + 0.15 * Math.pow(mach, 2), 0.58);
  return cfIncompressible / compressibilityFactor;
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
  // Boattail area reduction factor: (d_base / d_body)^2
  const boattailFactor = Math.pow(baseDiameter / Math.max(0.01, bodyDiameter), 2);

  let baseCd = 0;
  if (mach < 0.8) {
    baseCd = 0.12 + 0.13 * Math.pow(mach, 2);
  } else if (mach >= 0.8 && mach <= 1.1) {
    // Transonic base drag peak near Mach 1
    const t = (mach - 0.8) / 0.3;
    baseCd = 0.20 + 0.18 * (3 * t * t - 2 * t * t * t);
  } else {
    // Supersonic expansion base pressure drop: Cd_base ~ 0.38 / M
    baseCd = Math.min(0.38, 0.38 / Math.pow(mach, 1.1));
  }

  // Power-on plume effect: Rocket exhaust plume fills the base recirculation zone,
  // reducing base suction drag by ~60%
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

    // Total Drag Coefficient
    const totalCd = Math.max(0.15, frictionCd + waveCd + baseCd);

    if (totalCd > maxTransonicCd) {
      maxTransonicCd = totalCd;
      machAtMaxCd = mach;
    }

    // 4. Supersonic Center of Pressure Migration
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
