/**
 * RIVAL S2 — EditBufferStrip: the commit boundary for staged engineering
 * edits (synthesis pattern 4, adapted from Onshape CAD-017/019: pending-edit
 * badges, a check/X commit boundary, non-destructive rollback).
 *
 * While drafts exist the strip shows the pending count with explicit Apply
 * (one undoable history step) and Discard controls; Escape is the keyboard
 * path to Discard (handled by the shell). No staged value reaches the
 * engineering store until Apply commits.
 */
import React from 'react';
import { useEditBufferStore } from '../../store/editBufferStore';

export interface EditBufferStripProps {
  /** Override onRun hook used by the discard path (tests). */
  onDiscarded?: () => void;
}

export const EditBufferStrip: React.FC<EditBufferStripProps> = ({ onDiscarded }) => {
  const drafts = useEditBufferStore((s) => s.drafts);
  const pending = Object.keys(drafts).length;
  const applyAll = useEditBufferStore((s) => s.applyAll);
  const discardAll = useEditBufferStore((s) => s.discardAll);

  if (pending === 0) {
    return (
      <div
        data-edit-pending="0"
        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-zinc-700/60 bg-zinc-800/40 text-[11px] text-zinc-400"
      >
        <span aria-hidden="true" className="text-[10px]">
          ✓
        </span>
        <span>No pending edits — changes commit when you press Apply</span>
      </div>
    );
  }

  return (
    <div
      data-edit-pending={String(pending)}
      data-pending-edits="true"
      role="status"
      className="flex items-center gap-2 px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-200"
    >
      <span aria-hidden="true" className="text-[10px]">
        ✎
      </span>
      <span>{pending} pending edit{pending === 1 ? '' : 's'} — not committed</span>
      <button
        type="button"
        onClick={applyAll}
        data-apply-drafts="true"
        title="Apply staged edits as one undoable step"
        className="px-1.5 py-0.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold"
      >
        Apply ✓
      </button>
      <button
        type="button"
        onClick={() => {
          discardAll();
          onDiscarded?.();
        }}
        data-discard-drafts="true"
        title="Discard staged edits (Esc)"
        className="px-1.5 py-0.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/40 font-semibold"
      >
        Discard ✕
      </button>
    </div>
  );
};