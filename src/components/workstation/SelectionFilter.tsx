/**
 * RIVAL S2 — SelectionFilter: the type-tiered pick filter over the assembly
 * (synthesis pattern 1, adapted from NX CAD-001/005: entity type × scope with
 * a three-state highlight shared by every edit surface).
 *
 * The filter is a workspace preference: it narrows which components the
 * pick surface (assembly tree + canvas) presents as candidates and never
 * mutates the vehicle. The three states are enumerated here so the tree and
 * the legend agree:
 *
 *   candidate       — passes the filter, not selected, no repair pending
 *   selected        — passes the filter and is the active selection
 *   action-needed   — passes the filter and carries a repair action
 *                     (e.g. an ambiguous/solid motor mount); takes
 *                     precedence over selected so the badge/count stay
 *                     visible even for the row currently selected
 */
import React, { useMemo } from 'react';
import { assessMounts, type MountAssessment } from '../../application/caseResolver';
import { useRocketStore } from '../../store/rocketStore';
import { useWorkspaceStore, type ComponentFilter, FILTER_OPTIONS } from '../../store/workspaceStore';
import type { RocketComponent } from '../../core/types';

export type PickState = 'candidate' | 'selected' | 'action-needed';

/** Structural defects that flag a pick row as needing action (S1 mount rules). */
export function pickStateFor(
  comp: RocketComponent,
  selectedId: string | null,
  mounts: MountAssessment,
): PickState {
  // Repair context is ORTHOGONAL to selection: a selected mount that needs
  // action keeps the action-needed badge and count (critique — selection
  // must never suppress the repair state). The selection identity itself
  // still lives in rocketStore.selectedComponentId; the state label just
  // answers "what must I do here" first.
  const needsAction = comp.type === 'bodytube' && comp.isMotorMount === true && (mounts.ambiguous || mounts.solidMount);
  if (needsAction) return 'action-needed';
  if (comp.id === selectedId) return 'selected';
  return 'candidate';
}

export const PICK_STATE_LABEL: Record<PickState, string> = {
  candidate: 'Candidate',
  selected: 'Selected',
  'action-needed': 'Action needed',
};

export interface SelectionFilterProps {
  /** Override for the S1 mount assessment (tests inject deterministic state). */
  mounts?: MountAssessment;
}

export const SelectionFilter: React.FC<SelectionFilterProps> = ({ mounts: mountsOverride }) => {
  const vehicle = useRocketStore((s) => s.vehicle);
  const selectedComponentId = useRocketStore((s) => s.selectedComponentId);
  const filter = useWorkspaceStore((s) => s.filter);
  const setFilter = useWorkspaceStore((s) => s.setFilter);
  const scope = useWorkspaceStore((s) => s.scope);
  const setScope = useWorkspaceStore((s) => s.setScope);
  const mounts = mountsOverride ?? assessMounts(vehicle);

  const counts = useMemo(() => {
    const out: Record<ComponentFilter, number> = { all: 0, nosecone: 0, bodytube: 0, transition: 0, fin: 0, parachute: 0, masscomponent: 0 };
    for (const comp of vehicle.components) {
      const fam = comp.type === 'trapezoidfinset' || comp.type === 'ellipticalfinset' ? 'fin' : comp.type;
      out.all += 1;
      out[fam] += 1;
    }
    return out;
  }, [vehicle]);

  const needed = useMemo(
    () =>
      vehicle.components
        .filter((c) => pickStateFor(c, selectedComponentId, mounts) === 'action-needed')
        .map((c) => c.name),
    [vehicle, selectedComponentId, mounts],
  );

  return (
    <div
      data-precision-filter="true"
      className="flex items-center gap-2 px-2 py-1 rounded-md border border-zinc-700/60 bg-zinc-800/40 text-[11px]"
    >
      <span className="text-zinc-400 uppercase tracking-wide text-[10px]" id="filter-label">
        Filter
      </span>
      <div role="group" aria-labelledby="filter-label" className="flex items-center gap-1">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={active}
              title={`${opt.title} (${counts[opt.id]})`}
              data-filter-type={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`px-1.5 py-0.5 rounded-md font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                active ? 'bg-cyan-500/25 text-cyan-200' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
              }`}
            >
              {opt.label}
              <span aria-hidden="true" className="ml-0.5 font-mono text-[10px] opacity-70">
                {counts[opt.id]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="w-px h-4 bg-zinc-700" />

      <label className="flex items-center gap-1 text-[10px] text-zinc-500 uppercase tracking-wide">
        Scope
        <select
          aria-label="Selection scope"
          value={scope}
          onChange={(e) => setScope(e.target.value === 'stage' ? 'stage' : 'whole')}
          className="bg-zinc-800/60 text-[11px] text-zinc-300 rounded border border-zinc-700/60 focus:outline-none"
        >
          <option value="whole">Whole vehicle</option>
          <option value="stage" disabled>
            Stage (future)
          </option>
        </select>
      </label>

      <div className="w-px h-4 bg-zinc-700" />
      <div className="flex items-center gap-1 text-[10px]" aria-label="Pick state legend">
        {(['candidate', 'selected', 'action-needed'] as PickState[]).map((state) => (
          <span key={state} className={`flex items-center gap-0.5 ${state === 'selected' ? 'text-cyan-300' : state === 'action-needed' ? 'text-amber-300' : 'text-zinc-400'}`}>
            <span aria-hidden="true" className="text-[9px]">
              {state === 'selected' ? '●' : state === 'action-needed' ? '▲' : '○'}
            </span>
            {PICK_STATE_LABEL[state]}
            {needed.length > 0 && state === 'action-needed' ? ` · ${needed.length}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
};