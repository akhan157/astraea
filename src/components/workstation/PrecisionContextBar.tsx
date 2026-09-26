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
    <div className="flex items-center gap-2 flex-wrap px-3 py-1 bg-[#08090A] border-b border-white/8">
      <SelectionFilter />
      <div className="w-px h-5 bg-white/8" />
      <EditBufferStrip />
      <div className="w-px h-5 bg-white/8" />
      {/* Whole-design run: the ensemble consumes the CURRENT DESIGN + case
          (never the selection). The chip sits outside the Selection group so
          the visible label "Run current design" is the scoping statement;
          data-run-design keeps the contract testable. */}
      <button
        type="button"
        onClick={onRun}
        data-run-design="true"
        title="Run the routine ensemble for the whole current design (Ctrl+Enter)"
        className="px-2 py-0.5 rounded-md bg-white hover:bg-zinc-200 text-black font-semibold"
      >
        Run current design ⏎
      </button>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
        <span className="text-[10px] uppercase tracking-wide text-zinc-400">Selection</span>
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
              ? 'bg-[#4C8DFF]/15 text-[#4C8DFF] border-[#4C8DFF]/40'
              : 'bg-white/5 text-zinc-200 border-white/8 hover:bg-white/10'
          }`}
        >
          Compare vs saved ⧉
        </button>
      </div>
    </div>
  );
};