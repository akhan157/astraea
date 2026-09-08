/**
 * Astraea Aerodynamics Engine: Barrowman Method
 * Reference: James S. Barrowman, "The Practical Calculation of the Aerodynamic
 * Characteristics of Slender Finned Vehicles", NASA TM X-67216.
 */

import {
  NoseconeComponent,
  TransitionComponent,
  TrapezoidFinSetComponent,
  EllipticalFinSetComponent,
  RocketVehicle,
  StabilityAnalysis,
  ComponentContribution,
} from '../core/types';
import { aggregateVehicleMass } from '../core/mass';

export interface AeroSurfaceContribution {
  id: string;
  name: string;
  type: string;
  cna: number;          // Normal force coefficient derivative per radian
  cp: number;           // Center of pressure in meters from nose tip
  axialStart: number;
  axialEnd: number;
}

/**
 * Calculates nosecone Center of Pressure relative to nose tip
 */
export function computeNoseconeCP(shape: NoseconeComponent['shape'], length: number): number {
  switch (shape) {
    case 'conical':
      return (2 / 3) * length; // 0.666 * L
    case 'ogive':
      return 0.466 * length;
    case 'parabolic':
      return 0.5 * length;
    case 'elliptical':
      return (1 / 3) * length;
    case 'vonkarman':
    default:
      return 0.5 * length;
  }
}

/**
 * Calculates conical transition (shoulder or boattail) CP and CNa
 */
export function computeTransitionAero(
  comp: TransitionComponent,
  axialStart: number,
  refDiameter: number
): { cna: number; cp: number } {
  const d1 = comp.foreDiameter;
  const d2 = comp.aftDiameter;
  const l = comp.length;
  const dref = refDiameter > 0 ? refDiameter : Math.max(d1, d2);

  // CNa = 2 * ((d2/dref)^2 - (d1/dref)^2)
  const cna = 2.0 * (Math.pow(d2 / dref, 2) - Math.pow(d1 / dref, 2));

  // If cylindrical (no diameter change), CNa is zero
  if (Math.abs(d2 - d1) < 0.00001) {
    return { cna: 0, cp: axialStart + l / 2 };
  }

  // Barrowman frustum CP formula:
  // x_cp = x_front + (L/3) * [ 1 + (1 - d1/d2) / (1 - (d1/d2)^2) ]
  let cpLocal: number;
  const ratio = d1 / d2;
  const denom = 1.0 - ratio * ratio;

  if (Math.abs(denom) > 0.0001) {
    cpLocal = (l / 3.0) * (1.0 + (1.0 - ratio) / denom);
  } else {
    cpLocal = l / 2.0;
  }

  return { cna, cp: axialStart + cpLocal };
}

/**
 * Calculates trapezoidal fin set CNa and CP
 */
export function computeTrapezoidFinAero(
  comp: TrapezoidFinSetComponent,
  axialStart: number,
  bodyDiameter: number,
  refDiameter: number
): { cna: number; cp: number } {
  const n = comp.finCount;
  const cr = comp.rootChord;
  const ct = comp.tipChord;
  const s = comp.span;
  const m = comp.sweepLength;
  const d = bodyDiameter > 0 ? bodyDiameter : refDiameter;
  const dref = refDiameter > 0 ? refDiameter : d;
  const r = d / 2.0;

  // Mid-chord line length: L_F = sqrt(s^2 + (m + ct/2 - cr/2)^2)
  const sweepMid = m + 0.5 * ct - 0.5 * cr;
  const lf = Math.sqrt(s * s + sweepMid * sweepMid);

  // Single fin lift slope (CNa)1
  const chordSum = cr + ct;
  let cna1 = 0;
  if (chordSum > 0 && dref > 0) {
    const denom = 1.0 + Math.sqrt(1.0 + Math.pow((2.0 * lf) / chordSum, 2));
    cna1 = (2.0 * Math.PI * Math.pow(s / dref, 2)) / denom;
  }

  // Fin-body mutual interference (Rogers Modified Barrowman / NACA Report 1307):
  // 1. K_fb: Fin in presence of body = 1 + R / (s + R)
  const kfb = 1.0 + r / (s + r);
  // 2. K_bf: Body lift induced in presence of fins = (R / (s + R))^2 * (1 + s / R)
  const kbf = r > 0 ? Math.pow(r / (s + r), 2) * (1.0 + s / r) : 0;

  const cna_fb = kfb * (n / 2.0) * cna1;
  const cna_bf = kbf * (n / 2.0) * cna1;
  const cna = cna_fb + cna_bf;

  // Center of pressure of isolated trapezoidal fin (NACA TM X-67216):
  // x_cp,fin = x_le + m*(cr + 2*ct) / (3*(cr + ct)) + (1/6)*[cr + ct - (cr*ct)/(cr + ct)]
  let finCpOffset = 0;
  if (chordSum > 0) {
    const term1 = (m * (cr + 2.0 * ct)) / (3.0 * chordSum);
    const term2 = (1.0 / 6.0) * (chordSum - (cr * ct) / chordSum);
    finCpOffset = term1 + term2;
  } else {
    finCpOffset = cr / 2.0;
  }
  const cp_fin = axialStart + finCpOffset;

  // Center of pressure of body lift induced by fins (NACA Report 1307 / Rogers):
  // Acts along the body cylinder adjacent to the fin root chord at ~0.45 * cr
  const cp_body = axialStart + 0.45 * cr;

  // Combined center of pressure weighted by normal force contributions:
  const cp = cna > 0 ? (cna_fb * cp_fin + cna_bf * cp_body) / cna : cp_fin;

  return { cna, cp };
}
/**
 * Calculates elliptical fin set CNa and CP
 */
export function computeEllipticalFinAero(
  comp: EllipticalFinSetComponent,
  axialStart: number,
  bodyDiameter: number,
  refDiameter: number
): { cna: number; cp: number } {
  const n = comp.finCount;
  const cr = comp.rootChord;
  const s = comp.span;
  const d = bodyDiameter > 0 ? bodyDiameter : refDiameter;
  const dref = refDiameter > 0 ? refDiameter : d;
  const r = d / 2.0;

  // Elliptical fin mid-chord approximation
  const lf = Math.sqrt(s * s + (cr / 4.0) * (cr / 4.0));
  const chordSum = cr; // effective tip chord = 0

  const denom = 1.0 + Math.sqrt(1.0 + Math.pow((2.0 * lf) / chordSum, 2));
  const cna1 = (2.0 * Math.PI * Math.pow(s / dref, 2)) / denom;

  // Rogers Modified Barrowman interference factors (NACA Report 1307):
  const kfb = 1.0 + r / (s + r);
  const kbf = r > 0 ? Math.pow(r / (s + r), 2) * (1.0 + s / r) : 0;

  const cna_fb = kfb * (n / 2.0) * cna1;
  const cna_bf = kbf * (n / 2.0) * cna1;
  const cna = cna_fb + cna_bf;

  // Centroid of quarter-ellipse is (4 / (3*pi)) * cr
  const cp_fin = axialStart + (4.0 / (3.0 * Math.PI)) * cr;
  const cp_body = axialStart + 0.45 * cr;
  const cp = cna > 0 ? (cna_fb * cp_fin + cna_bf * cp_body) / cna : cp_fin;

  return { cna, cp };
}
/**
 * Complete Barrowman stability evaluation for an entire rocket assembly.
 */
export function computeRocketStability(vehicle: RocketVehicle): StabilityAnalysis {
  const massRollup = aggregateVehicleMass(vehicle);
  const refDiameter = massRollup.referenceDiameter;

  let currentAxialX = 0;
  let lastBodyTubeStart = 0;
  let lastBodyDiameter = refDiameter;

  const aeroSurfaces: AeroSurfaceContribution[] = [];
  const componentMap = new Map<string, { mass: number; cg: number; axialStart: number; axialEnd: number }>();

  for (const comp of massRollup.components) {
    componentMap.set(comp.id, {
      mass: comp.mass,
      cg: comp.globalCG,
      axialStart: comp.axialStart,
      axialEnd: comp.axialEnd,
    });
  }

  for (const comp of vehicle.components) {
    switch (comp.type) {
      case 'nosecone': {
        const cpLocal = computeNoseconeCP(comp.shape, comp.length);
        const cpGlobal = currentAxialX + cpLocal;
        // Nosecone normal force derivative: CNa = 2.0 * (d_base / d_ref)^2
        const cna = 2.0 * Math.pow(comp.baseDiameter / refDiameter, 2);

        aeroSurfaces.push({
          id: comp.id,
          name: comp.name,
          type: comp.type,
          cna,
          cp: cpGlobal,
          axialStart: currentAxialX,
          axialEnd: currentAxialX + comp.length,
        });

        lastBodyDiameter = comp.baseDiameter;
        currentAxialX += comp.length;
        break;
      }

      case 'bodytube': {
        lastBodyTubeStart = currentAxialX;
        lastBodyDiameter = comp.outerDiameter;
        currentAxialX += comp.length;
        // Slender body tubes have approximately CNa = 0 at alpha = 0 in Barrowman theory
        break;
      }

      case 'transition': {
        const transRes = computeTransitionAero(comp, currentAxialX, refDiameter);

        aeroSurfaces.push({
          id: comp.id,
          name: comp.name,
          type: comp.type,
          cna: transRes.cna,
          cp: transRes.cp,
          axialStart: currentAxialX,
          axialEnd: currentAxialX + comp.length,
        });

        lastBodyDiameter = comp.aftDiameter;
        currentAxialX += comp.length;
        break;
      }

      case 'trapezoidfinset': {
        const finAxialStart = lastBodyTubeStart + (comp.axialOffset || 0);
        const finRes = computeTrapezoidFinAero(comp, finAxialStart, lastBodyDiameter, refDiameter);

        aeroSurfaces.push({
          id: comp.id,
          name: comp.name,
          type: comp.type,
          cna: finRes.cna,
          cp: finRes.cp,
          axialStart: finAxialStart,
          axialEnd: finAxialStart + comp.rootChord,
        });
        break;
      }

      case 'ellipticalfinset': {
        const finAxialStart = lastBodyTubeStart + (comp.axialOffset || 0);
        const finRes = computeEllipticalFinAero(comp, finAxialStart, lastBodyDiameter, refDiameter);

        aeroSurfaces.push({
          id: comp.id,
          name: comp.name,
          type: comp.type,
          cna: finRes.cna,
          cp: finRes.cp,
          axialStart: finAxialStart,
          axialEnd: finAxialStart + comp.rootChord,
        });
        break;
      }
    }
  }

  // Sum total CNa and weighted CP: CP = sum(CNa_i * CP_i) / sum(CNa_i)
  const totalCNa = aeroSurfaces.reduce((sum, s) => sum + s.cna, 0);
  const totalMoment = aeroSurfaces.reduce((sum, s) => sum + s.cna * s.cp, 0);

  let cp = 0;
  if (Math.abs(totalCNa) > 0.0001) {
    cp = totalMoment / totalCNa;
  } else {
    // If no fins or lifting surfaces, fallback to 2/3 total length
    cp = (2 / 3) * massRollup.totalLength;
  }

  const staticMarginCalibers = refDiameter > 0 ? (cp - massRollup.cg) / refDiameter : 0;
  const isStable = staticMarginCalibers >= 1.0;
  const isOverStable = staticMarginCalibers > 3.0;

  // Build unified contribution list
  const contributions: ComponentContribution[] = vehicle.components.map((comp) => {
    const massData = componentMap.get(comp.id) || { mass: 0, cg: 0, axialStart: 0, axialEnd: 0 };
    const aero = aeroSurfaces.find((s) => s.id === comp.id);

    return {
      id: comp.id,
      name: comp.name,
      type: comp.type,
      mass: massData.mass,
      cg: massData.cg,
      cp: aero?.cp,
      cna: aero?.cna,
      axialStart: massData.axialStart,
      axialEnd: massData.axialEnd,
    };
  });

  return {
    totalLength: massRollup.totalLength,
    maxDiameter: massRollup.maxDiameter,
    referenceDiameter: massRollup.referenceDiameter,
    totalMass: massRollup.totalMass,
    cg: massRollup.cg,
    cp,
    staticMarginCalibers,
    totalCNa,
    isStable,
    isOverStable,
    contributions,
  };
}
