/**
 * RIVAL S2 — edit buffer: the precision workstation's explicit commit/cancel
 * boundary for engineering edits (synthesis pattern 4, adapted from Onshape:
 * pending-edit badges, a check/X commit boundary, non-destructive rollback —
 * this replaces silent mutation of the vehicle).
 *
 * While the Airframe inspector stages edits, the engineering store is NOT
 * touched: the draft overlay renders on top of the committed vehicle, and
 * only an explicit Apply commits the merged vehicle as ONE undoable history
 * step. Escape/Discard drops the drafts without touching the store.
 * Non-finite numeric values are rejected at stage time — invalid text is
 * never clamped into a hidden accepted value.
 */
import { create } from 'zustand';
import type { RocketComponent } from '../core/types';
import { useRocketStore } from './rocketStore';

interface EditBufferState {
  /** Component id -> staged patch (merged per id). */
  drafts: Record<string, Partial<RocketComponent>>;
  /**
   * Stage a patch for one component. Returns true when staged; false when
   * rejected (empty patch, unknown component, or any non-finite numeric
   * value — rejected edits are never silently clamped and never stored).
   */
  stage: (id: string, patch: Partial<RocketComponent>) => boolean;
  /** Drop every draft. The engineering store is untouched. */
  discardAll: () => void;
  /** Overlay for a component id, or null when nothing is staged for it. */
  draftFor: (id: string) => Partial<RocketComponent> | null;
  /** Number of component ids currently carrying drafts. */
  pendingCount: () => number;
  /**
   * Commit the drafted vehicle: merge all (still-existing) staged patches
   * into the current vehicle and apply it as one history step, then clear
   * the buffer. No-op when there is nothing staged.
   */
  applyAll: () => void;
}

/** Signature validation: reject non-finite numbers, keep strings/booleans. */
function patchIsFinite(patch: Partial<RocketComponent>): boolean {
  return Object.values(patch).every((value) => typeof value !== 'number' || Number.isFinite(value));
}

export const useEditBufferStore = create<EditBufferState>((set, get) => ({
  drafts: {},
  stage: (id, patch) => {
    if (!patch || Object.keys(patch).length === 0) return false;
    if (!patchIsFinite(patch)) return false;
    const vehicle = useRocketStore.getState().vehicle;
    if (!vehicle.components.some((c) => c.id === id)) return false;
    const drafts = { ...get().drafts };
    drafts[id] = { ...(drafts[id] ?? {}), ...patch };
    set({ drafts });
    return true;
  },
  discardAll: () => set({ drafts: {} }),
  draftFor: (id) => get().drafts[id] ?? null,
  pendingCount: () => Object.keys(get().drafts).length,
  applyAll: () => {
    const drafts = get().drafts;
    const ids = Object.keys(drafts);
    if (ids.length === 0) return;
    const vehicle = useRocketStore.getState().vehicle;
    const components = vehicle.components.map((comp) =>
      comp.id in drafts ? ({ ...comp, ...drafts[comp.id] } as RocketComponent) : comp,
    );
    useRocketStore.getState().applyVehicleDraft({ ...vehicle, components });
    set({ drafts: {} });
  },
}));