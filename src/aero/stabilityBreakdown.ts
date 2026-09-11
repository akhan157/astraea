/**
 * Astraea Stability Explain Layer (C6: CP/CG transparency)
 *
 * Reporting/explanation ONLY over shipped numbers — no new physics.
 *
 * explainStability reuses:
 *   - aggregateVehicleMass   (src/core/mass.ts)      for per-component mass/CG
 *   - computeRocketStability (src/aero/barrowman.ts) for CNa/CP contributions
 *     and the whole-vehicle totals
 * and assembles deterministic plain-language sentences from those values.
 * Every numeric field must match computeRocketStability exactly; the test
 * suite asserts equality row-by-row and total-by-total.
 *
 * Linter thresholds mirror the shipped engine (computeRocketStability):
 * stable = margin >= 1.0 cal, overstable = margin > 3.0 cal (windcocking
 * risk). The sentences below are driven by the shipped isStable /
 * isOverStable booleans, never an independent recomputation.
 */

import { RocketVehicle, ComponentType, StabilityAnalysis } from '../core/types';
import { aggregateVehicleMass, ComponentMassResult } from '../core/mass';
import { computeRocketStability } from './barrowman';

/** Mirrors shipped linter thresholds in barrowman.ts computeRocketStability. */
const MIN_STABLE_MARGIN_CALIBERS = 1.0;
const OVERSTABLE_MARGIN_CALIBERS = 3.0;

/** Per-component stability breakdown row. */
export interface StabilityComponentBreakdown {
  id: string;
  name: string;
  type: ComponentType;
  massKg: number;
  /** CG distance from the nose tip, m. */
  cgM: number;
  /** Normal-force derivative per radian; 0 when the component has no aero surface. */
  cnAlpha: number;
  /** CP distance from the nose tip, m; absent when the component has no aero surface. */
  cpM?: number;
  /** Share of the vehicle's total CNa, %; 0 for non-lifting components. */
  contributionPct: number;
}

export interface StabilityExplainResult {
  components: StabilityComponentBreakdown[];
  totalCgM: number;
  totalCpM: number;
  staticMarginCalibers: number;
  plainLanguage: string[];
}

/**
 * Assembles the deterministic plain-language notes. Order: CG/CP positions,
 * margin (calibers + % of body length), fore/aft CP pullers, per-transition
 * boattail/shoulder effect, and the linter verdict.
 */
function buildPlainLanguage(
  vehicle: RocketVehicle,
  components: readonly StabilityComponentBreakdown[],
  analysis: StabilityAnalysis
): string[] {
  const sentences: string[] = [];
  const totalLength = analysis.totalLength;
  const refDiameter = analysis.referenceDiameter;
  const margin = analysis.staticMarginCalibers;
  const marginM = analysis.cp - analysis.cg;
  const marginPct = totalLength > 0 ? (marginM / totalLength) * 100 : 0;

  sentences.push(
    `Center of gravity is ${analysis.cg.toFixed(3)} m from the nose tip; center of pressure is ${analysis.cp.toFixed(3)} m from the nose tip.`
  );
  sentences.push(
    `Static stability margin is ${margin.toFixed(2)} calibers, or ${marginPct.toFixed(1)}% of the ${totalLength.toFixed(3)} m body length.`
  );

  // Which lifting surfaces pull the resultant CP fore/aft. Removing surface i
  // moves the resultant by sign(cna_i) * (cpTotal - cp_i) (weighted by the
  // residual CNa, which is positive when any lifting surface remains), so a
  // surface pulls the CP fore exactly when (cp_i - cpTotal) * cna_i < 0.
  const lifters = components.filter(
    (c): c is StabilityComponentBreakdown & { cpM: number } => c.cnAlpha !== 0 && c.cpM !== undefined
  );
  if (lifters.length > 0) {
    const fore: string[] = [];
    const aft: string[] = [];
    for (const c of lifters) {
      const pullsFore = (c.cpM - analysis.cp) * c.cnAlpha < 0;
      (pullsFore ? fore : aft).push(`${c.name} (CP ${c.cpM.toFixed(3)} m)`);
    }
    if (aft.length > 0) sentences.push(`Pulls the CP aft: ${aft.join(', ')}.`);
    if (fore.length > 0) sentences.push(`Pulls the CP fore: ${fore.join(', ')}.`);
  }

  // Boattail/shoulder effect: CP movement direction + magnitude caused by
  // each transition, computed by removing the transition's moment and normal
  // force from the shipped totals (same weighted result used by the engine).
  for (const comp of vehicle.components) {
    if (comp.type !== 'transition') continue;
    const contrib = analysis.contributions.find((c) => c.id === comp.id);
    if (!contrib || contrib.cna === undefined || contrib.cp === undefined || contrib.cna === 0) {
      continue;
    }
    const residualCNa = analysis.totalCNa - contrib.cna;
    let cpWithout: number;
    if (Math.abs(residualCNa) > 0.0001) {
      cpWithout = (analysis.totalCNa * analysis.cp - contrib.cna * contrib.cp) / residualCNa;
    } else {
      // No lifting surface left without the transition: engine's zero-CNa
      // fallback (2/3 total length).
      cpWithout = (2 / 3) * totalLength;
    }
    const deltaM = analysis.cp - cpWithout;
    const direction = deltaM > 0 ? 'aft' : 'fore';
    const deltaCalibers = refDiameter > 0 ? Math.abs(deltaM) / refDiameter : 0;
    const qualifier =
      comp.aftDiameter < comp.foreDiameter
        ? 'Boattail'
        : comp.aftDiameter > comp.foreDiameter
          ? 'Shoulder'
          : 'Transition';
    if (Math.abs(deltaM) < 1e-9) {
      sentences.push(
        `${qualifier} "${comp.name}" (${comp.foreDiameter.toFixed(3)} to ${comp.aftDiameter.toFixed(3)} m) does not move the CP (${deltaCalibers.toFixed(2)} calibers).`
      );
    } else {
      sentences.push(
        `${qualifier} "${comp.name}" (${comp.foreDiameter.toFixed(3)} to ${comp.aftDiameter.toFixed(3)} m) moves the CP ${direction} by ${deltaCalibers.toFixed(2)} calibers (${Math.abs(deltaM).toFixed(3)} m).`
      );
    }
  }

  // Linter verdict, driven by the shipped booleans.
  if (analysis.isOverStable) {
    sentences.push(
      `Overstable: margin ${margin.toFixed(2)} calibers exceeds the ${OVERSTABLE_MARGIN_CALIBERS.toFixed(1)} caliber windcocking threshold.`
    );
  } else if (!analysis.isStable) {
    sentences.push(
      `Understable: margin ${margin.toFixed(2)} calibers is below the ${MIN_STABLE_MARGIN_CALIBERS.toFixed(1)} caliber stability minimum.`
    );
  } else {
    sentences.push(
      `Stable: margin ${margin.toFixed(2)} calibers is within the ${MIN_STABLE_MARGIN_CALIBERS.toFixed(1)}-${OVERSTABLE_MARGIN_CALIBERS.toFixed(1)} caliber band.`
    );
  }

  return sentences;
}

/**
 * Explains a vehicle's static stability from shipped numbers only.
 *
 * Mass/CG per component come from aggregateVehicleMass; CNa/CP contributions
 * and the vehicle totals come from computeRocketStability. contributionPct is
 * the component's share of the total CNa (0 for non-lifting components), so
 * the explanation can never disagree with the engine it describes.
 */
export function explainStability(vehicle: RocketVehicle): StabilityExplainResult {
  const massRollup = aggregateVehicleMass(vehicle);
  const analysis = computeRocketStability(vehicle);

  const massById: Record<string, ComponentMassResult> = Object.fromEntries(
    massRollup.components.map((c) => [c.id, c])
  );

  const components: StabilityComponentBreakdown[] = analysis.contributions.map((c) => {
    const massRes = massById[c.id];
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      massKg: massRes ? massRes.mass : c.mass,
      cgM: massRes ? massRes.globalCG : c.cg,
      cnAlpha: c.cna ?? 0,
      cpM: c.cp,
      contributionPct:
        c.cna !== undefined && c.cna !== 0 && analysis.totalCNa !== 0
          ? (c.cna / analysis.totalCNa) * 100
          : 0,
    };
  });

  return {
    components,
    totalCgM: analysis.cg,
    totalCpM: analysis.cp,
    staticMarginCalibers: analysis.staticMarginCalibers,
    plainLanguage: buildPlainLanguage(vehicle, components, analysis),
  };
}