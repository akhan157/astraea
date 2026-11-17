/**
 * Built-up flight drag display helpers (accuracy bundle).
 *
 * The admission rule and its refusal text live in
 * `src/application/flightAdmission.ts` so the bridge can enforce the same
 * selection × opt-in pairing as the Console store without importing Console
 * code. They are re-exported here for the existing display call sites and
 * tests. `builtUpDragWasRefused` is the lane's single engine-prose check: it
 * reads `runManifest.axialDrag` only to tell a refused shape from a used one,
 * never to decide what was sent.
 */
import type { DispatchedPhysicsOptions } from '../../application/caseResolver';

export {
  builtUpDragRefusalText,
  legacyAeroModelFlightRefusalText,
} from '../../application/flightAdmission';

/** The warning shown before a refused run's verbatim engine drag-source line. */
export const BUILT_UP_DRAG_REFUSED = 'Built-up drag was requested but not used for this rocket.';

/**
 * True when this run asked for built-up flight drag and the engine did not fly
 * it (a shape the method refuses). The engine always emits `axialDrag`; a
 * supported run's line starts with `calibrated `.
 */
export function builtUpDragWasRefused(
  physics: DispatchedPhysicsOptions | undefined,
  manifest: Record<string, string> | undefined,
): boolean {
  if (physics?.flightDragSource === undefined) return false;
  return builtUpDragStatus(manifest) === 'refused';
}

/** Only recorded strings can be displayed as drag provenance. */
export function axialDragText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Unknown text establishes neither a flown model nor a recorded refusal. */
export function builtUpDragStatus(manifest: Record<string, unknown> | undefined): 'used' | 'refused' | 'unknown' {
  const text = manifest?.axialDrag;
  if (typeof text !== 'string') return 'unknown';
  if (text.startsWith('calibrated build-up axial drag')) return 'used';
  if (text.startsWith('legacy 25-station Mach drag tables') && text.includes('; legacy drag used (refused: ')) return 'refused';
  return 'unknown';
}
