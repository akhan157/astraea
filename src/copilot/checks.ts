/**
 * Experimental copilot — tier-1 deterministic checks.
 *
 * Thresholds are a team's design requirements, not physics, so they live in
 * an editable profile. The defaults are the owner's starting values from the
 * copilot handoff; they are stricter than the engine's own safety gates
 * (rail exit ≥ 15 m/s, landing ≤ 6 m/s in the 6-DOF result) and are labeled
 * as requirements, never as the engine's verdict.
 *
 * Fail closed: a check whose input the engine could not produce (no Tauri
 * shell, no flight case, a failed run, no apogee target) is `not-evaluated`
 * with the reason. It is never reported as a pass.
 */
import type { RocketVehicle, StabilityAnalysis } from '../core/types';
import type { SixDofSimulationResult } from '../sim/sixDofSimulator';
import {
  errorText,
  flightQuantity,
  sixDofOptionsFor,
  stabilityQuantity,
  type CopilotEngine,
  type FlightCase,
} from './engine';
import type { CheckResult } from './types';

export interface CheckProfile {
  /** Below this the vehicle is flagged understable (calibers). */
  minStabilityCal: number;
  /** Above this the vehicle is flagged overstable (calibers). */
  maxStabilityCal: number;
  /** Margin a stability fix aims for (calibers). */
  stabilityFixTargetCal: number;
  /** Minimum velocity leaving the rail (m/s). */
  minRailExitMps: number;
  /** Maximum descent rate at touchdown (m/s). */
  maxDescentMps: number;
  /** Target apogee AGL (m); absent = the apogee check is not evaluated. */
  targetApogeeM?: number;
  /** Allowed apogee deviation from the target (percent). */
  apogeeTolerancePct: number;
}

/** Owner's starting values (docs/handoff/copilot-experimental.md). */
export const DEFAULT_CHECK_PROFILE: Readonly<CheckProfile> = Object.freeze({
  minStabilityCal: 1.0,
  maxStabilityCal: 3.0,
  stabilityFixTargetCal: 2.2,
  minRailExitMps: 30,
  maxDescentMps: 7.6,
  apogeeTolerancePct: 5,
});

export interface CheckRun {
  results: CheckResult[];
  /** Engine outputs the checks judged, kept so fixes and explanations reuse them. */
  stability?: StabilityAnalysis;
  flight?: SixDofSimulationResult;
}

const STABILITY_TITLE_LOW = 'Stability margin too low';
const STABILITY_TITLE_HIGH = 'Stability margin too high';
const RAIL_TITLE = 'Rail exit velocity';
const DESCENT_TITLE = 'Descent rate at touchdown';
const APOGEE_TITLE = 'Apogee vs target';

function notEvaluated(id: CheckResult['id'], title: string, threshold: string, reason: string): CheckResult {
  return { id, title, status: 'not-evaluated', threshold, message: reason };
}

function stabilityChecks(analysis: StabilityAnalysis | null, reason: string, p: CheckProfile): CheckResult[] {
  const lowThreshold = `≥ ${p.minStabilityCal.toFixed(1)} cal`;
  const highThreshold = `≤ ${p.maxStabilityCal.toFixed(1)} cal`;
  if (!analysis) {
    return [
      notEvaluated('stability-low', STABILITY_TITLE_LOW, lowThreshold, reason),
      notEvaluated('stability-high', STABILITY_TITLE_HIGH, highThreshold, reason),
    ];
  }
  const margin = analysis.staticMarginCalibers;
  const value = stabilityQuantity(margin, 'cal');
  if (!Number.isFinite(margin)) {
    const why = 'The engine returned a non-finite stability margin.';
    return [
      notEvaluated('stability-low', STABILITY_TITLE_LOW, lowThreshold, why),
      notEvaluated('stability-high', STABILITY_TITLE_HIGH, highThreshold, why),
    ];
  }
  const low = margin < p.minStabilityCal;
  const high = margin > p.maxStabilityCal;
  return [
    {
      id: 'stability-low',
      title: STABILITY_TITLE_LOW,
      status: low ? 'fail' : 'pass',
      value,
      threshold: lowThreshold,
      message: low
        ? `Margin ${margin.toFixed(2)} cal is below the ${p.minStabilityCal.toFixed(1)} cal requirement (understable).`
        : `Margin ${margin.toFixed(2)} cal meets the ${p.minStabilityCal.toFixed(1)} cal minimum.`,
    },
    {
      id: 'stability-high',
      title: STABILITY_TITLE_HIGH,
      status: high ? 'fail' : 'pass',
      value,
      threshold: highThreshold,
      message: high
        ? `Margin ${margin.toFixed(2)} cal is above the ${p.maxStabilityCal.toFixed(1)} cal limit (overstable; weathercocking risk).`
        : `Margin ${margin.toFixed(2)} cal is within the ${p.maxStabilityCal.toFixed(1)} cal limit.`,
    },
  ];
}

function flightChecks(flight: SixDofSimulationResult | null, reason: string, p: CheckProfile): CheckResult[] {
  const railThreshold = `≥ ${p.minRailExitMps.toFixed(1)} m/s`;
  const descentThreshold = `≤ ${p.maxDescentMps.toFixed(1)} m/s`;
  const apogeeThreshold =
    p.targetApogeeM !== undefined
      ? `${p.targetApogeeM.toFixed(0)} m ± ${p.apogeeTolerancePct}%`
      : 'no target set';
  if (!flight) {
    return [
      notEvaluated('rail-exit', RAIL_TITLE, railThreshold, reason),
      notEvaluated('descent-rate', DESCENT_TITLE, descentThreshold, reason),
      notEvaluated('apogee-target', APOGEE_TITLE, apogeeThreshold, reason),
    ];
  }

  const results: CheckResult[] = [];

  const rail = flight.railExitVelocity;
  if (!Number.isFinite(rail) || rail <= 0) {
    results.push(notEvaluated('rail-exit', RAIL_TITLE, railThreshold, 'The run reported no rail exit.'));
  } else {
    const ok = rail >= p.minRailExitMps;
    results.push({
      id: 'rail-exit',
      title: RAIL_TITLE,
      status: ok ? 'pass' : 'fail',
      value: flightQuantity(flight, rail, 'm/s'),
      threshold: railThreshold,
      message: ok
        ? `Leaves the rail at ${rail.toFixed(1)} m/s.`
        : `Leaves the rail at ${rail.toFixed(1)} m/s, below the ${p.minRailExitMps.toFixed(1)} m/s requirement.`,
    });
  }

  // Touchdown speed is only a descent rate when the run actually landed
  // after apogee; a timeout or abnormal impact is not judged.
  if (!flight.terminated || !flight.touchdownNominal || !Number.isFinite(flight.landingVelocity)) {
    results.push(
      notEvaluated('descent-rate', DESCENT_TITLE, descentThreshold, 'The run did not end in a nominal touchdown under recovery.'),
    );
  } else {
    const v = flight.landingVelocity;
    const ok = v <= p.maxDescentMps;
    results.push({
      id: 'descent-rate',
      title: DESCENT_TITLE,
      status: ok ? 'pass' : 'fail',
      value: flightQuantity(flight, v, 'm/s'),
      threshold: descentThreshold,
      message: ok
        ? `Touches down at ${v.toFixed(1)} m/s.`
        : `Touches down at ${v.toFixed(1)} m/s, above the ${p.maxDescentMps.toFixed(1)} m/s limit.`,
    });
  }

  if (p.targetApogeeM === undefined) {
    results.push(notEvaluated('apogee-target', APOGEE_TITLE, apogeeThreshold, 'No apogee target is set.'));
  } else {
    const apogee = flight.apogeeAltitude;
    const target = p.targetApogeeM;
    const offPct = ((apogee - target) / target) * 100;
    const ok = Math.abs(offPct) <= p.apogeeTolerancePct;
    const direction = offPct >= 0 ? 'above' : 'below';
    results.push({
      id: 'apogee-target',
      title: APOGEE_TITLE,
      status: ok ? 'pass' : 'fail',
      value: flightQuantity(flight, apogee, 'm'),
      threshold: apogeeThreshold,
      message: `Apogee ${apogee.toFixed(0)} m is ${Math.abs(offPct).toFixed(1)}% ${direction} the ${target.toFixed(0)} m target.`,
    });
  }

  return results;
}

/**
 * Runs every tier-1 check. Stability always runs; flight checks run only
 * when a flight case is supplied. Engine failures become not-evaluated
 * results with the engine's message.
 */
export async function runChecks(
  vehicle: RocketVehicle,
  engine: CopilotEngine,
  flightCase: FlightCase | null,
  profile: CheckProfile = DEFAULT_CHECK_PROFILE,
): Promise<CheckRun> {
  let stability: StabilityAnalysis | null = null;
  let stabilityReason = '';
  try {
    stability = await engine.stability(vehicle);
  } catch (err) {
    stabilityReason = `Engine unavailable: ${errorText(err)}`;
  }

  let flight: SixDofSimulationResult | null = null;
  let flightReason = 'No motor and launch setup selected, so no flight was simulated.';
  if (flightCase) {
    try {
      flight = await engine.simulate(vehicle, flightCase.motor, sixDofOptionsFor(flightCase.launch));
    } catch (err) {
      flightReason = `Simulation failed: ${errorText(err)}`;
    }
  }

  return {
    results: [...stabilityChecks(stability, stabilityReason, profile), ...flightChecks(flight, flightReason, profile)],
    stability: stability ?? undefined,
    flight: flight ?? undefined,
  };
}
