/**
 * Shared admission rule for a committed aero-model pairing (accuracy bundle).
 *
 * One rule decides whether a committed flight or a committed ensemble may be
 * dispatched:
 *  - no drag choice (the default, built-up drag): admitted whatever the
 *    selection; the flight does not read it (K3);
 *  - the explicit opt-in `vehicle.flightDragSource === 'calibrated'`: a usable
 *    built-up aero-model selection is required, with its own refusal for
 *    missing / defective / unusable pairs (unchanged);
 *  - the explicit choice `'legacy'`: any selection keeps the existing
 *    panels-only refusal (the coefficients still come from the legacy path).
 *
 * The Console store applies it before archiving a case; `src/tauri/bridge.ts`
 * applies the same function as the last gate for every committed flight and
 * every ensemble entry point. The live preview is deliberately outside this
 * rule (it never had an aero-model gate and none is added).
 *
 * The strings are fixed by the Gate 1 review's table; moving them here does not
 * change a byte. This module imports only the application aero-model registry,
 * so the bridge can use it without importing Console code.
 */
import type { RocketVehicle } from '../core/types';
import { aeroModelDefect, isUsableAeroModel, type AeroModelSelection } from './aeroModel';

/** The only supported value of the vehicle's built-up flight-drag opt-in. */
export const FLIGHT_DRAG_SOURCE_OPT_IN = 'calibrated';

/** Why a flight with a built-up aero-model selection is refused (no opt-in). */
export function legacyAeroModelFlightRefusalText(selection: AeroModelSelection): string {
  return `${selection.modelId} ${selection.modelVersion} drives stability and aero panels in this build; `
    + 'flight coefficients still come from the legacy path. Turn the beta aero model off to fly.';
}

/**
 * Why a committed run that opted in to built-up flight drag is still refused,
 * or null when the pairing is usable. Covers the missing selection, the
 * defective pair and an unknown/unusable pair.
 */
export function builtUpDragRefusalText(selection: AeroModelSelection | undefined): string | null {
  if (selection === undefined) {
    return 'Built-up flight drag is on, but the built-up aero model is not selected. '
      + 'Turn on "Use built-up aero model (beta)" in Aero, or turn built-up flight drag off.';
  }
  const defect = aeroModelDefect(selection);
  if (defect !== null) {
    return `${defect} Built-up flight drag cannot use this selection; turn it off or use the current built-up model.`;
  }
  if (!isUsableAeroModel(selection)) {
    return `Aero model ${selection.modelId} ${selection.modelVersion} with term '${selection.terms.transonic}' `
      + 'is not a usable pair in this build, so built-up flight drag cannot use it. '
      + 'Select the current built-up model, or turn built-up flight drag off.';
  }
  return null;
}

/**
 * The shared selection × opt-in admission result for a committed run: a
 * refusal string, or null when the run may be dispatched. The vehicle is the
 * single owner of the opt-in; the selection is the run's aero-model choice.
 */
export function flightAdmissionRefusal(
  vehicle: RocketVehicle,
  selection: AeroModelSelection | undefined,
): string | null {
  // The default (no drag choice) flies built-up drag whatever the aero-model
  // selection is: the flight does not read the selection, so none is required.
  if (vehicle.flightDragSource === undefined) return null;
  if (vehicle.flightDragSource === 'calibrated') return builtUpDragRefusalText(selection);
  return selection === undefined ? null : legacyAeroModelFlightRefusalText(selection);
}
