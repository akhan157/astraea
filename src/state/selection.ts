/**
 * Part-tree selection filter: the type families, their counts, and the
 * three-state pick (candidate / selected / action-needed).
 *
 * UI-only preference. It narrows which parts the tree presents and never
 * mutates the vehicle or enters a run key. Fin-set record types share one
 * family so the filter follows what the user means, not the record shape.
 */
import { create } from 'zustand';
import type { ComponentType, RocketComponent } from '../core/types';
import type { MountAssessment } from '../application/caseResolver';

export type ComponentFilter = 'all' | 'nosecone' | 'bodytube' | 'transition' | 'fin' | 'parachute' | 'masscomponent';

export interface FilterOption {
  id: ComponentFilter;
  label: string;
  title: string;
}

export const FILTER_OPTIONS: FilterOption[] = [
  { id: 'all', label: 'All', title: 'All assembly components' },
  { id: 'nosecone', label: 'Nose', title: 'Nosecone components' },
  { id: 'bodytube', label: 'Tube', title: 'Body tube components' },
  { id: 'transition', label: 'Transition', title: 'Transition components' },
  { id: 'fin', label: 'Fins', title: 'Fin-set components' },
  { id: 'parachute', label: 'Recovery', title: 'Parachute components' },
  { id: 'masscomponent', label: 'Mass', title: 'Mass components' }
];

/** Family of a component type under the filter (fin sets share one). */
export function filterFamily(type: ComponentType): ComponentFilter {
  return type === 'trapezoidfinset' || type === 'ellipticalfinset' || type === 'freeformfinset' ? 'fin' : type;
}

export function matchesFilter(comp: RocketComponent, filter: ComponentFilter): boolean {
  return filter === 'all' || filterFamily(comp.type) === filter;
}

/** Component count per family; `all` counts every component. */
export function familyCounts(components: readonly RocketComponent[]): Record<ComponentFilter, number> {
  const out: Record<ComponentFilter, number> = { all: 0, nosecone: 0, bodytube: 0, transition: 0, fin: 0, parachute: 0, masscomponent: 0 };
  for (const c of components) {
    out.all += 1;
    out[filterFamily(c.type)] += 1;
  }
  return out;
}

export type PickState = 'candidate' | 'selected' | 'action-needed';

export const PICK_STATE_LABEL: Record<PickState, string> = { candidate: 'Candidate', selected: 'Selected', 'action-needed': 'Action needed' };

/**
 * Pick state of a row. A flagged motor mount that is ambiguous or solid needs
 * action, and that outranks selection: choosing the row never hides the repair.
 */
export function pickStateFor(comp: RocketComponent, selectedId: string | null, mounts: MountAssessment): PickState {
  if (comp.type === 'bodytube' && comp.isMotorMount === true && (mounts.ambiguous || mounts.solidMount)) return 'action-needed';
  return comp.id === selectedId ? 'selected' : 'candidate';
}

interface SelectionFilterState {
  filter: ComponentFilter;
  setFilter: (filter: ComponentFilter) => void;
}

export const useSelectionFilter = create<SelectionFilterState>((set) => ({
  filter: 'all',
  setFilter: (filter) => set({ filter })
}));
