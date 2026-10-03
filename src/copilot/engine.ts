/**
 * Experimental copilot — engine access.
 *
 * The copilot reaches compute only through `CopilotEngine`, whose default
 * implementation forwards to the same native bridge the studios use
 * (`src/tauri/bridge.ts`). There is no TS fallback: outside the Tauri shell
 * every call rejects, and the copilot reports "not evaluated" (fail closed).
 * Tests inject their own engine.
 *
 * The confidence mapping below is PROVISIONAL until the engine branch's
 * `docs/ui-data-contract.md` lands; it is the only place that decides a
 * copilot confidence level.
 */
import type { RocketVehicle, StabilityAnalysis } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import type { SixDofOptions, SixDofSimulationResult } from '../sim/sixDofSimulator';
import type { LaunchOptions } from '../application/caseResolver';
import { simulateFlight, stabilityOf } from '../tauri/bridge';
import type { Quantity } from './types';

export interface CopilotEngine {
  stability(vehicle: RocketVehicle): Promise<StabilityAnalysis>;
  simulate(vehicle: RocketVehicle, motor: MotorSpec, options: SixDofOptions): Promise<SixDofSimulationResult>;
}

export const nativeEngine: CopilotEngine = {
  stability: (vehicle) => stabilityOf(vehicle),
  simulate: (vehicle, motor, options) => simulateFlight(vehicle, motor, options),
};

/** A flight case the flight checks run against. */
export interface FlightCase {
  motor: MotorSpec;
  launch: LaunchOptions;
}

/** Same option mapping FlightSimulationTab passes to `simulate_flight`. */
export function sixDofOptionsFor(launch: LaunchOptions): SixDofOptions {
  return {
    railLength: launch.railLengthM,
    railElevationDeg: launch.railElevationDeg,
    railAzimuthDeg: launch.railAzimuthDeg,
    windSpeedSurface: launch.windSpeedMps,
    windAzimuthDeg: launch.windAzimuthDeg,
    finCantAngleDeg: launch.finCantDeg,
    mainDeployAltitudeAGL: launch.mainDeployAltitudeM,
  };
}

/** Static-stability values: Barrowman model, never calibrated by flight data. */
export function stabilityQuantity(value: number, unit: string): Quantity {
  return {
    value,
    unit,
    confidence: 'Modeled',
    source: 'stability',
    confidenceReason: 'Barrowman static model; not calibrated against flight data.',
  };
}

/**
 * Flight values: Unknown when the run's validity is UNKNOWN, Extrapolated
 * when it left the Mach/angle-of-attack envelope, otherwise Modeled. Nothing
 * from a simulation is Measured or Calibrated until the evidence loop exists.
 */
export function flightQuantity(result: SixDofSimulationResult, value: number, unit: string): Quantity {
  if (result.validity === 'UNKNOWN') {
    return {
      value,
      unit,
      confidence: 'Unknown',
      source: 'simulate_flight',
      confidenceReason: 'The run reported validity UNKNOWN (an unsupported flight segment).',
    };
  }
  if (!result.enveloped) {
    return {
      value,
      unit,
      confidence: 'Extrapolated',
      source: 'simulate_flight',
      confidenceReason: 'The run left the modeled envelope (Mach 0–4, angle of attack ≤ 30°).',
    };
  }
  return {
    value,
    unit,
    confidence: 'Modeled',
    source: 'simulate_flight',
    confidenceReason: '6-DOF simulation within its envelope; not calibrated against flight data.',
  };
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
