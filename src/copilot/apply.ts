/** Explicit, undoable application of an engine-computed fix to the unified project. */
import type { RocketComponent } from '../core/types';
import { useProjectStore } from '../state/project';
import { consoleActions, currentRunKey } from '../console/store';
import type { FixOutcome } from './types';

export type ApplyResult = { ok: true } | { ok: false; reason: string };

export function applyFix(fix: FixOutcome, expectedInputKey: string | null): ApplyResult {
  if (fix.kind !== 'vehicle-edit') {
    return { ok: false, reason: 'This suggestion is not a design edit, so there is nothing to apply.' };
  }
  const { edit } = fix;
  if (expectedInputKey === null || expectedInputKey !== currentRunKey()) {
    return { ok: false, reason: 'The design or launch inputs changed. Re-run the check.' };
  }
  const component = useProjectStore.getState().project.vehicle.components.find((c) => c.id === edit.componentId);
  if (!component) {
    return { ok: false, reason: `"${edit.componentName}" no longer exists. Re-run the check.` };
  }
  const current = (component as unknown as Record<string, unknown>)[edit.field];
  if (current !== edit.before) {
    return { ok: false, reason: `"${edit.componentName}" changed since this fix was computed. Re-run the check.` };
  }
  consoleActions.setComponent(edit.componentId, { [edit.field]: edit.after } as Partial<RocketComponent>, `Copilot: ${fix.summary}`);
  return { ok: true };
}
