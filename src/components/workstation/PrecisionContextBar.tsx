/**
 * RIVAL S2 — PrecisionContextBar: the workstation's persistent precision
 * chrome (the run/comparison-led S2 shell emphasizes a mission status rail;
 * this rival shell leads with the pick/edit surface instead).
 *
 * The bar composes the type/scope filter (pattern 1), the edit-commit
 * boundary (pattern 4), the whole-design run affordance, and the
 * compare-vs-saved toggle (pattern 3). Selection here is first-class
 * persistable state (pattern 10): the current component is named, but the
 * run chip is visibly scoped to the whole current design — selection is
 * context, never a partial-simulation claim.
 */
import React from 'react';
import { useRocketStore } from '../../store/rocketStore';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { SelectionFilter } from './SelectionFilter';
import { EditBufferStrip } from './EditBufferStrip';

export interface PrecisionContextBarProps {
  onRun: () => void;
}

export const PrecisionContextBar: React.FC<PrecisionContextBarProps> = ({ onRun }) => {
  const vehicle = useRocketStore((s) => s.vehicle);
  const selectedComponentId = useRocketStore((s) => s.selectedComponentId);
  const compare = useWorkspaceStore((s) => s.compare);
  const setCompareActive = useWorkspaceStore((s) => s.setCompareActive);
  const selected = vehicle.components.find((c) => c.id === selectedComponentId);

  return (
    <div className="flex items-center gap-2 flex-wrap px-3 py-1 bg-zinc-950 border-b border-zinc-800">
      <SelectionFilter />
      <div className="w-px h-5 bg-zinc-700" />
      <EditBufferStrip />
      <div className="w-px h-5 bg-zinc-700" />
      {/* Whole-design run: the ensemble consumes the CURRENT DESIGN + case
          (never the selection). The chip sits outside the Selection group so
          the visible label "Run current design" is the scoping statement;
          data-run-design keeps the contract testable. */}
      <button
        type="button"
        onClick={onRun}
        data-run-design="true"
        title="Run the routine ensemble for the whole current design (Ctrl+Enter)"
        className="px-2 py-0.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 font-semibold"
      >
        Run current design ⏎
      </button>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">Selection</span>
        <span data-selection-name="true" className="font-medium text-zinc-200 truncate max-w-40">
          {selected ? selected.name : 'none'}
        </span>
        <button
          type="button"
          onClick={() => setCompareActive(!compare.active)}
          data-compare-toggle="true"
          aria-pressed={compare.active}
          title="Compare the current design against the last saved revision"
          className={`px-2 py-0.5 rounded-md border font-semibold ${
            compare.active
              ? 'bg-cyan-500/25 text-cyan-200 border-cyan-500/40'
              : 'bg-zinc-800/60 text-zinc-300 border-zinc-700/60 hover:bg-zinc-800'
          }`}
        >
          Compare vs saved ⧉
        </button>
      </div>
    </div>
  );
};