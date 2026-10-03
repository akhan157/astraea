/**
 * Experimental copilot — tier-1 fixes computed by running the engine.
 *
 * Each fix searches one design or launch variable with bracketed bisection,
 * rounds the answer to a buildable increment, then re-runs the engine at the
 * rounded value so the "after" numbers are exactly what the user would get.
 * Nothing here edits the design: a vehicle fix is a `ProposedEdit` that only
 * `applyFix` (on the user's click) can stage.
 */
import type {
  EllipticalFinSetComponent,
  ParachuteComponent,
  RocketComponent,
  RocketVehicle,
  StabilityAnalysis,
  TrapezoidFinSetComponent,
} from '../core/types';
import type { SixDofSimulationResult } from '../sim/sixDofSimulator';
import { bisect } from './bisect';
import type { CheckProfile } from './checks';
import {
  errorText,
  flightQuantity,
  sixDofOptionsFor,
  stabilityQuantity,
  type CopilotEngine,
  type FlightCase,
} from './engine';
import type { CheckId, FixDelta, FixOutcome } from './types';

/** Fin span is rounded to 0.5 mm, parachute diameter up to 1 cm, rail length up to 0.1 m. */
const FIN_SPAN_STEP_M = 0.0005;
const CHUTE_DIAMETER_STEP_M = 0.01;
const RAIL_LENGTH_STEP_M = 0.1;

function withComponent(vehicle: RocketVehicle, id: string, patch: Partial<RocketComponent>): RocketVehicle {
  return {
    ...vehicle,
    components: vehicle.components.map((c) => (c.id === id ? ({ ...c, ...patch } as RocketComponent) : c)),
  };
}

const roundTo = (x: number, step: number) => Math.round(x / step) * step;
const roundUpTo = (x: number, step: number) => Math.ceil(x / step - 1e-9) * step;

/**
 * Main parachute as the native engine picks it (src-tauri/src/models.rs):
 * parachutes in component order, the second is the main, and a single
 * parachute serves as both drogue and main.
 */
export function mainParachute(vehicle: RocketVehicle): { chute: ParachuteComponent; count: number } | null {
  const chutes = vehicle.components.filter((c): c is ParachuteComponent => c.type === 'parachute');
  if (chutes.length === 0) return null;
  return { chute: chutes.length > 1 ? chutes[1] : chutes[0], count: chutes.length };
}

async function flightDeltas(
  engine: CopilotEngine,
  flightCase: FlightCase | null,
  before: SixDofSimulationResult | undefined,
  afterVehicle: RocketVehicle,
  caveats: string[],
): Promise<{ deltas: FixDelta[]; calls: number }> {
  if (!flightCase || !before) {
    caveats.push('Flight results (apogee, rail exit, descent) were not re-simulated; re-run the flight after applying.');
    return { deltas: [], calls: 0 };
  }
  try {
    const after = await engine.simulate(afterVehicle, flightCase.motor, sixDofOptionsFor(flightCase.launch));
    return {
      calls: 1,
      deltas: [
        {
          label: 'Apogee',
          before: flightQuantity(before, before.apogeeAltitude, 'm'),
          after: flightQuantity(after, after.apogeeAltitude, 'm'),
        },
        {
          label: 'Rail exit velocity',
          before: flightQuantity(before, before.railExitVelocity, 'm/s'),
          after: flightQuantity(after, after.railExitVelocity, 'm/s'),
        },
      ],
    };
  } catch (err) {
    caveats.push(`Flight effect not evaluated: ${errorText(err)}`);
    return { deltas: [], calls: 1 };
  }
}

/** Moves the static margin to the profile's target by changing the span of the only fin set. */
export async function computeStabilityFix(
  checkId: CheckId,
  vehicle: RocketVehicle,
  before: StabilityAnalysis,
  engine: CopilotEngine,
  profile: CheckProfile,
  flightCase: FlightCase | null = null,
  beforeFlight?: SixDofSimulationResult,
): Promise<FixOutcome> {
  const finSets = vehicle.components.filter(
    (c): c is TrapezoidFinSetComponent | EllipticalFinSetComponent =>
      c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset',
  );
  if (finSets.length !== 1) {
    return {
      kind: 'no-fix',
      checkId,
      engineCalls: 0,
      reason:
        finSets.length === 0
          ? 'The design has no fin set to resize.'
          : `The design has ${finSets.length} fin sets; resizing one of them is a design choice the copilot will not make for you.`,
    };
  }
  const fin = finSets[0];
  const target = profile.stabilityFixTargetCal;
  const marginAt = async (span: number) =>
    (await engine.stability(withComponent(vehicle, fin.id, { span }))).staticMarginCalibers;

  let calls = 0;
  try {
    const search = await bisect(async (span) => (await marginAt(span)) - target, {
      lo: Math.max(0.001, fin.span * 0.25),
      hi: fin.span * 3,
      fTolerance: 0.02,
      xTolerance: FIN_SPAN_STEP_M / 2,
      maxIterations: 40,
    });
    calls = search.calls;
    if (search.kind !== 'found') {
      return {
        kind: 'no-fix',
        checkId,
        engineCalls: calls,
        reason:
          search.kind === 'not-bracketed'
            ? `Changing the span of "${fin.name}" between 25% and 300% of its current value does not reach ${target.toFixed(1)} cal.`
            : 'The span search did not converge.',
      };
    }

    const span = Math.max(FIN_SPAN_STEP_M, roundTo(search.x, FIN_SPAN_STEP_M));
    const afterVehicle = withComponent(vehicle, fin.id, { span });
    const after = await engine.stability(afterVehicle);
    calls += 1;

    const caveats = [
      'Fin flutter and fin structure were not re-checked for the new span.',
      'Fin mass changes with span; the engine result above already includes the CG shift.',
    ];
    const flight = await flightDeltas(engine, flightCase, beforeFlight, afterVehicle, caveats);
    calls += flight.calls;

    return {
      kind: 'vehicle-edit',
      checkId,
      summary: `Change the span of "${fin.name}" from ${(fin.span * 1000).toFixed(1)} mm to ${(span * 1000).toFixed(1)} mm.`,
      edit: {
        componentId: fin.id,
        componentName: fin.name,
        field: 'span',
        before: fin.span,
        after: span,
        unit: 'm',
      },
      deltas: [
        {
          label: 'Static margin',
          before: stabilityQuantity(before.staticMarginCalibers, 'cal'),
          after: stabilityQuantity(after.staticMarginCalibers, 'cal'),
        },
        { label: 'CP', before: stabilityQuantity(before.cp, 'm'), after: stabilityQuantity(after.cp, 'm') },
        { label: 'CG', before: stabilityQuantity(before.cg, 'm'), after: stabilityQuantity(after.cg, 'm') },
        ...flight.deltas,
      ],
      caveats,
      engineCalls: calls,
    };
  } catch (err) {
    return { kind: 'no-fix', checkId, engineCalls: calls, reason: `Engine error during the search: ${errorText(err)}` };
  }
}

/** Slows touchdown below the limit by enlarging the main parachute. */
export async function computeDescentFix(
  vehicle: RocketVehicle,
  before: SixDofSimulationResult,
  engine: CopilotEngine,
  profile: CheckProfile,
  flightCase: FlightCase,
): Promise<FixOutcome> {
  const checkId: CheckId = 'descent-rate';
  const main = mainParachute(vehicle);
  if (!main) return { kind: 'no-fix', checkId, engineCalls: 0, reason: 'The design has no parachute.' };
  const { chute } = main;
  const options = sixDofOptionsFor(flightCase.launch);
  const simAt = (diameter: number) =>
    engine.simulate(withComponent(vehicle, chute.id, { diameter }), flightCase.motor, options);
  // Aim slightly under the limit so rounding and run-to-run event timing keep the result passing.
  const target = profile.maxDescentMps - 0.1;

  let calls = 0;
  try {
    const search = await bisect(async (d) => (await simAt(d)).landingVelocity - target, {
      lo: chute.diameter,
      hi: chute.diameter * 4,
      fTolerance: 0.05,
      xTolerance: CHUTE_DIAMETER_STEP_M / 2,
      maxIterations: 20,
    });
    calls = search.calls;
    if (search.kind !== 'found') {
      return {
        kind: 'no-fix',
        checkId,
        engineCalls: calls,
        reason:
          search.kind === 'not-bracketed'
            ? `Up to 4× the current diameter of "${chute.name}", the engine does not bring touchdown below ${profile.maxDescentMps.toFixed(1)} m/s.`
            : 'The parachute search did not converge.',
      };
    }

    const diameter = roundUpTo(search.x, CHUTE_DIAMETER_STEP_M);
    const after = await simAt(diameter);
    calls += 1;
    if (!(after.landingVelocity <= profile.maxDescentMps)) {
      return {
        kind: 'no-fix',
        checkId,
        engineCalls: calls,
        reason: `At the rounded diameter of ${diameter.toFixed(2)} m, the engine reports ${after.landingVelocity.toFixed(2)} m/s, which still fails. No fix is proposed.`,
      };
    }

    const caveats = ['A larger parachute increases wind drift; check the landing zone.'];
    if (main.count === 1) {
      caveats.push(
        'The design has one parachute, which the engine uses for both drogue and main descent, so the drogue phase slows too.',
      );
    }
    return {
      kind: 'vehicle-edit',
      checkId,
      summary: `Increase the diameter of "${chute.name}" from ${chute.diameter.toFixed(2)} m to ${diameter.toFixed(2)} m.`,
      edit: {
        componentId: chute.id,
        componentName: chute.name,
        field: 'diameter',
        before: chute.diameter,
        after: diameter,
        unit: 'm',
      },
      deltas: [
        {
          label: 'Touchdown velocity',
          before: flightQuantity(before, before.landingVelocity, 'm/s'),
          after: flightQuantity(after, after.landingVelocity, 'm/s'),
        },
        {
          label: 'Landing drift',
          before: flightQuantity(before, before.landingDistance, 'm'),
          after: flightQuantity(after, after.landingDistance, 'm'),
        },
      ],
      caveats,
      engineCalls: calls,
    };
  } catch (err) {
    return { kind: 'no-fix', checkId, engineCalls: calls, reason: `Engine error during the search: ${errorText(err)}` };
  }
}

/**
 * Finds the rail length that reaches the minimum rail exit velocity. The rail
 * is launch setup, not design, so this is advice: the copilot cannot apply it.
 */
export async function computeRailExitFix(
  vehicle: RocketVehicle,
  before: SixDofSimulationResult,
  engine: CopilotEngine,
  profile: CheckProfile,
  flightCase: FlightCase,
): Promise<FixOutcome> {
  const checkId: CheckId = 'rail-exit';
  const rail0 = flightCase.launch.railLengthM;
  const simAt = (railLengthM: number) =>
    engine.simulate(vehicle, flightCase.motor, sixDofOptionsFor({ ...flightCase.launch, railLengthM }));
  const target = profile.minRailExitMps + 0.3;

  let calls = 0;
  try {
    const search = await bisect(async (l) => (await simAt(l)).railExitVelocity - target, {
      lo: rail0,
      hi: rail0 * 4,
      fTolerance: 0.2,
      xTolerance: RAIL_LENGTH_STEP_M / 2,
      maxIterations: 20,
    });
    calls = search.calls;
    if (search.kind !== 'found') {
      return {
        kind: 'no-fix',
        checkId,
        engineCalls: calls,
        reason:
          search.kind === 'not-bracketed'
            ? `Even a ${(rail0 * 4).toFixed(1)} m rail does not reach ${profile.minRailExitMps.toFixed(1)} m/s with this motor; a higher-thrust motor or a lighter vehicle is needed.`
            : 'The rail-length search did not converge.',
      };
    }
    const railLengthM = roundUpTo(search.x, RAIL_LENGTH_STEP_M);
    const after = await simAt(railLengthM);
    calls += 1;
    if (!(after.railExitVelocity >= profile.minRailExitMps)) {
      return {
        kind: 'no-fix',
        checkId,
        engineCalls: calls,
        reason: `At the rounded rail length of ${railLengthM.toFixed(1)} m, the engine reports ${after.railExitVelocity.toFixed(1)} m/s, which still fails. No advice is given.`,
      };
    }
    return {
      kind: 'advice',
      checkId,
      summary: `Use a rail of at least ${railLengthM.toFixed(1)} m (currently ${rail0.toFixed(1)} m). Change it in the flight setup.`,
      deltas: [
        {
          label: 'Rail exit velocity',
          before: flightQuantity(before, before.railExitVelocity, 'm/s'),
          after: flightQuantity(after, after.railExitVelocity, 'm/s'),
        },
      ],
      caveats: [
        'Check that the launch site offers a rail this long.',
        'A higher-thrust motor is the other lever; the copilot has not evaluated motor changes.',
      ],
      engineCalls: calls,
    };
  } catch (err) {
    return { kind: 'no-fix', checkId, engineCalls: calls, reason: `Engine error during the search: ${errorText(err)}` };
  }
}
