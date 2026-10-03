/**
 * Experimental copilot — applying a fix (hard rule 2).
 *
 * Called only from a user's click. A vehicle fix is staged into the existing
 * edit buffer, so it shows as a pending edit and becomes one undoable history
 * step only when the user presses Apply there. The copilot never writes the
 * rocket store directly.
 *
 * Fail closed: the fix is refused when the design has moved since it was
 * computed (the component is gone or the field no longer holds the value the
 * engine searched from), or when other edits are pending, since those would
 * change the result the fix was computed against.
 */
import type { RocketComponent } from '../core/types';
import { useEditBufferStore } from '../store/editBufferStore';
import { useRocketStore } from '../store/rocketStore';
import type { FixOutcome } from './types';

export type ApplyResult = { ok: true } | { ok: false; reason: string };

export function applyFix(fix: FixOutcome): ApplyResult {
  if (fix.kind !== 'vehicle-edit') {
    return { ok: false, reason: 'This suggestion is not a design edit, so there is nothing to apply.' };
  }
  const { edit } = fix;
  const buffer = useEditBufferStore.getState();
  if (buffer.pendingCount() > 0) {
    return { ok: false, reason: 'Other edits are pending. Apply or discard them, then re-run the check.' };
  }
  const component = useRocketStore.getState().vehicle.components.find((c) => c.id === edit.componentId);
  if (!component) {
    return { ok: false, reason: `"${edit.componentName}" no longer exists. Re-run the check.` };
  }
  const current = (component as unknown as Record<string, unknown>)[edit.field];
  if (current !== edit.before) {
    return { ok: false, reason: `"${edit.componentName}" changed since this fix was computed. Re-run the check.` };
  }
  const staged = buffer.stage(edit.componentId, { [edit.field]: edit.after } as Partial<RocketComponent>);
  return staged ? { ok: true } : { ok: false, reason: 'The edit buffer rejected the change.' };
}
