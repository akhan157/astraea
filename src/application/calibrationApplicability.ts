/**
 * Whether the project's stored drag-calibration artifact may affect runs now.
 *
 * The artifact was fitted to one exact uncalibrated flight case: airframe
 * geometry, full motor content, launch site and every launch option the fit's
 * model flight read. It is active only while the supported flight-model
 * binding AND that recorded uncalibrated case identity still match. Any other
 * change retains the artifact as project history but excludes its scale from
 * design options, run identity and the run archive.
 *
 * Legacy artifacts (no `fitProvenance`) keep the original explicit legacy
 * policy: retained and applied under the supported legacy model, with their
 * eligibility unverified. No missing provenance is ever synthesized here.
 *
 * Engine identity is recorded with new fits but cannot be resolved
 * synchronously while building the design; `calibrationEngineStatus` exposes
 * the comparison and the dispatch boundary refuses a known-different engine.
 */
import { compareEngineIdentity, type EngineIdentity } from '../engine/identity';
import type { MotorSpec } from '../propulsion/motorDatabase';
import type { RocketVehicle } from '../core/types';
import { preflight, snapshotCase, type LaunchCase, type LaunchOptions } from './caseResolver';
import { LEGACY_FLIGHT_MODEL, resolveFlightModel, type FlightModelSelection } from './flightModel';
import type { DragCalibration, FlightModelBinding } from './dragCalibration';

export type CalibrationModelStatus = 'bound' | 'legacy-unverified';

export type CalibrationInactiveReason = 'flight-model' | 'fit-inputs';

export type CalibrationApplicability =
  | { status: 'none' }
  | { status: 'active'; calibration: DragCalibration; model: CalibrationModelStatus }
  | {
      status: 'inactive';
      calibration: DragCalibration;
      reason: CalibrationInactiveReason;
      /** Identity of the inputs the fit recorded; null for legacy artifacts. */
      recordedFitInputKey: string | null;
      /** Identity of the current uncalibrated inputs; null when they cannot be keyed. */
      currentFitInputKey: string | null;
    };

/** The inputs the fit's model-side flight depends on, before any calibration. */
export interface CalibrationScopeInputs {
  vehicle: RocketVehicle;
  motorId: string;
  options: LaunchOptions;
}

/**
 * Content identity of one uncalibrated flight case, using the same canonical
 * resolver as run identity (vehicle geometry/site, full motor content, launch
 * options). Null when the case cannot be keyed — callers must not treat that
 * as compatible.
 */
export function calibrationFitInputKey(
  inputs: CalibrationScopeInputs,
  motors: Record<string, MotorSpec>,
): string | null {
  const launchCase: LaunchCase = { vehicle: inputs.vehicle, motorId: inputs.motorId, options: inputs.options };
  const resolved = preflight(launchCase, motors);
  if (!resolved.runnable) return null;
  try {
    return snapshotCase(resolved).runKey;
  } catch {
    return null;
  }
}

/**
 * Fit records written by the previous store helper kept the fin-shear
 * override in the recorded key: `<baseRunKey>|shear:<Pa>`. Shear changes
 * flutter, not the fitted coast flight, so that exact documented form is
 * recognized when comparing the RECORDED key of an existing artifact. The
 * current identity remains the base key; arbitrary suffix text is never
 * truncated or treated as compatible.
 */
function recordedFitInputMatches(recorded: string, current: string | null): boolean {
  if (current === null || recorded.length === 0) return false;
  if (recorded === current) return true;
  const prefix = `${current}|shear:`;
  if (!recorded.startsWith(prefix)) return false;
  const shear = recorded.slice(prefix.length);
  return shear.length > 0 && Number.isFinite(Number(shear)) && String(Number(shear)) === shear;
}

function sameBinding(a: FlightModelBinding, b: FlightModelBinding): boolean {
  return a.schemaId === b.schemaId && a.modelId === b.modelId && a.environmentId === b.environmentId
    && a.mechanicalModelId === b.mechanicalModelId && a.calibrationPolicyId === b.calibrationPolicyId;
}

/** The narrow fact of a stored binding declaration against the current selection. */
export function flightModelBindingStatus(
  calibration: DragCalibration,
  selection: FlightModelSelection = LEGACY_FLIGHT_MODEL,
): 'bound' | 'unverified-legacy' | 'incompatible' {
  const binding = calibration.fitProvenance?.flightModelBinding;
  if (binding === undefined) {
    return sameBinding(selection, LEGACY_FLIGHT_MODEL) ? 'unverified-legacy' : 'incompatible';
  }
  return sameBinding(binding, selection) ? 'bound' : 'incompatible';
}

/**
 * Resolve the artifact's current applicability. The model binding is checked
 * first, then the recorded fit-input identity. A provenance-bearing artifact
 * with no matching identity (including a current case that cannot be keyed) is
 * inactive: unknown inputs never count as compatible. A legacy artifact keeps
 * the existing legacy policy without inventing a fit key.
 */
export function resolveCalibrationApplicability(input: {
  calibration?: DragCalibration;
  flightModel?: FlightModelSelection;
  currentFitInputKey: string | null;
}): CalibrationApplicability {
  const calibration = input.calibration;
  if (calibration === undefined) return { status: 'none' };
  const binding = flightModelBindingStatus(calibration, resolveFlightModel(input.flightModel));
  if (binding === 'incompatible') {
    return {
      status: 'inactive', calibration, reason: 'flight-model',
      recordedFitInputKey: calibration.fitProvenance?.uncalibratedRunKey ?? null,
      currentFitInputKey: input.currentFitInputKey,
    };
  }
  if (calibration.fitProvenance === undefined) {
    // Legacy artifact: explicit retained-and-applied policy, never given a
    // synthesized fit identity or conditional eligibility.
    return { status: 'active', calibration, model: 'legacy-unverified' };
  }
  const recorded = calibration.fitProvenance.uncalibratedRunKey;
  if (typeof recorded !== 'string' || !recordedFitInputMatches(recorded, input.currentFitInputKey)) {
    return {
      status: 'inactive', calibration, reason: 'fit-inputs',
      recordedFitInputKey: typeof recorded === 'string' && recorded.length > 0 ? recorded : null,
      currentFitInputKey: input.currentFitInputKey,
    };
  }
  return { status: 'active', calibration, model: binding === 'bound' ? 'bound' : 'legacy-unverified' };
}

/** The active artifact from a resolution, or undefined when none may affect runs. */
export function activeCalibration(applicability: CalibrationApplicability): DragCalibration | undefined {
  return applicability.status === 'active' ? applicability.calibration : undefined;
}

export type CalibrationEngineStatus = 'same' | 'different' | 'unknown' | 'legacy';

/**
 * Fit-engine comparison. `legacy` means no engine identity was recorded (an
 * old fit or an old artifact); `unknown` means a recorded or current identity
 * lacks a SHA-256 — it never establishes a match. Both `different` and
 * `unknown` block dispatch: a recorded engine identity is a compatibility
 * requirement, not a hint. Legacy keeps the established legacy policy.
 */
export function calibrationEngineStatus(
  calibration: DragCalibration,
  current: EngineIdentity | undefined,
): CalibrationEngineStatus {
  const recorded = calibration.fitProvenance?.engineIdentity;
  if (recorded === undefined) return 'legacy';
  return compareEngineIdentity(recorded, current);
}
