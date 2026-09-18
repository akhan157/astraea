/**
 * RIVAL S2 — CompareDock: the two-point compare panel docked against the
 * canvas (synthesis pattern 3, adapted from Onshape CAD-016 / SDI §6: a
 * difference list plus a blend slider between the current design and the
 * last saved checkpoint).
 *
 * The checkpoint basis is the NEWEST pre-edit snapshot: every edit appends
 * the pre-edit vehicle to `history` (rocketStore), so the tail — never
 * `history[0]` (the oldest retained revision, silently shifted by the
 * 30-entry cap) — is what "last saved" means. The header names the
 * checkpoint's own version, not the current vehicle's, so the diff rows
 * and the blend overlay are never presented against the wrong basis.
 *
 * The diff rows enumerate added/removed/modified components; the blend slider
 * drives the opacity of the saved-geometry overlay on the RocketCanvas so
 * the engineer sees the two states superimposed. The panel is keyboard
 * operable (focusable buttons, a range input) and never fabricates a
 * comparison when no prior revision exists.
 */
import React, { useEffect } from 'react';
import type { RocketVehicle } from '../../core/types';
import { diffVehicles, useWorkspaceStore } from '../../store/workspaceStore';
import { useRocketStore } from '../../store/rocketStore';
import { useEditBufferStore } from '../../store/editBufferStore';

const KIND_LABEL: Record<'added' | 'removed' | 'modified', string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
};

const KIND_TONE: Record<'added' | 'removed' | 'modified', string> = {
  added: 'text-emerald-300',
  removed: 'text-red-300',
  modified: 'text-amber-300',
};

export interface CompareDockProps {
  /** Test seam: checkpoint override (defaults to the newest pre-edit store snapshot). */
  checkpoint?: RocketVehicle | null;
}

export const CompareDock: React.FC<CompareDockProps> = ({ checkpoint: checkpointOverride }) => {
  const vehicle = useRocketStore((s) => s.vehicle);
  const history = useRocketStore((s) => s.history);
  const compare = useWorkspaceStore((s) => s.compare);
  const setCompareActive = useWorkspaceStore((s) => s.setCompareActive);
  const setCompareBlend = useWorkspaceStore((s) => s.setCompareBlend);

  // Newest pre-edit snapshot: edits append the pre-edit vehicle to history,
  // so the tail is the "last saved" basis — never history[0] (oldest kept).
  const storedCheckpoint = history.length > 0 ? history[history.length - 1] : null;
  const checkpoint = checkpointOverride !== undefined ? checkpointOverride : storedCheckpoint;
  const rows = diffVehicles(vehicle, checkpoint);
  const count = (kind: 'added' | 'removed' | 'modified') => rows.filter((r) => r.kind === kind).length;

  // Escape closes the dock — unless an edit draft is pending, in which case
  // the shell's Escape handling discards the draft first (nearest boundary).
  useEffect(() => {
    if (!compare.active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.ctrlKey || e.metaKey) return;
      if (Object.keys(useEditBufferStore.getState().drafts).length > 0) return;
      e.preventDefault();
      setCompareActive(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [compare.active, setCompareActive]);

  if (!compare.active) return null;
  if (!checkpoint) {
    return (
      <aside
        data-compare-dock="true"
        data-compare-rows="0"
        className="absolute bottom-4 right-4 w-80 max-h-96 overflow-y-auto bg-zinc-900/90 border border-zinc-700 rounded-lg shadow-xl p-3 text-[11px] text-zinc-300"
        aria-label="Compare vs last saved"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-200">Compare vs last saved</h3>
          <button
            type="button"
            onClick={() => setCompareActive(false)}
            data-compare-close="true"
            aria-label="Close compare"
            className="px-1.5 rounded hover:bg-zinc-800 text-zinc-400"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-zinc-500">No prior revision exists yet — commit a revision first.</p>
      </aside>
    );
  }

  return (
    <aside
      data-compare-dock="true"
      data-compare-rows={String(rows.length)}
      className="absolute bottom-4 right-4 w-80 max-h-96 overflow-y-auto bg-zinc-900/90 border border-zinc-700 rounded-lg shadow-xl p-3 text-[11px] text-zinc-300"
      aria-label="Compare vs last saved"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-200">
          Compare vs last saved · <span className="font-mono">v{checkpoint.version}</span>
        </h3>
        <button
          type="button"
          onClick={() => setCompareActive(false)}
          data-compare-close="true"
          aria-label="Close compare"
          className="px-1.5 rounded hover:bg-zinc-800 text-zinc-400"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1">
        <span className={KIND_TONE.added}>+{count('added')} added</span>
        <span aria-hidden="true">·</span>
        <span className={KIND_TONE.removed}>−{count('removed')} removed</span>
        <span aria-hidden="true">·</span>
        <span className={KIND_TONE.modified}>= {count('modified')} modified</span>
      </div>

      <label className="flex items-center gap-1.5 mt-1.5 text-[10px] text-zinc-400">
        Blend saved state
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={compare.blend}
          aria-label="Compare blend — saved geometry opacity"
          data-compare-blend="true"
          onChange={(e) => setCompareBlend(parseFloat(e.target.value))}
          className="w-full min-h-6 accent-cyan-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        />
        <span className="font-mono text-cyan-300">{compare.blend}%</span>
      </label>

      <ul className="mt-1.5 space-y-0.5 max-h-44 overflow-y-auto" aria-label="Design differences">
        {rows.map((row) => (
          <li key={`${row.kind}-${row.id}`} className={`truncate ${KIND_TONE[row.kind]}`} title={row.summary}>
            <span className="font-mono text-[10px] opacity-70">{KIND_LABEL[row.kind]}</span> {row.name}
          </li>
        ))}
      </ul>
    </aside>
  );
};