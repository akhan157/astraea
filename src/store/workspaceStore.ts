/**
 * RIVAL S2 — workspace store: the precision workstation's preferences and
 * pick-surface state.
 *
 * Engineering inputs live in rocketStore (vehicle, motor binding) and run
 * results in runStore. This store owns ONLY workspace preferences: the
 * active studio, pane sizes, display units, plot cursor, the type/scope
 * selection filter (synthesis pattern 1: NX type-tiered filter + scope),
 * and the compare-vs-saved two-point view (pattern 3: diff list + blend). It
 * never mutates engineering state and never clears the component selection.
 *
 * Keyboard map (UI §5.3): keys 1–5 switch studios outside editable contexts;
 * `studioForKey`/`isEditableTarget` are pure and unit-tested.
 */
import { create } from 'zustand';
import type { ComponentType, RocketComponent, RocketVehicle } from '../core/types';
import { stableStringify } from '../application/caseResolver';

export type WorkstationStudio = 'airframe' | 'aero' | 'propulsion' | 'trajectory' | 'evidence';

export interface StudioMeta {
  id: WorkstationStudio;
  label: string;
  /** Keyboard shortcut (plain digit, outside editable contexts). */
  key: string;
  title: string;
}

export const STUDIOS: StudioMeta[] = [
  { id: 'airframe', label: 'Airframe', key: '1', title: 'Airframe CAD studio' },
  { id: 'aero', label: 'Aero', key: '2', title: 'Aerodynamics & flutter studio' },
  { id: 'propulsion', label: 'Propulsion', key: '3', title: 'Propulsion & motors studio' },
  { id: 'trajectory', label: 'Trajectory', key: '4', title: 'Trajectory & weather studio' },
  { id: 'evidence', label: 'Evidence', key: '5', title: 'Recovery & flight evidence studio' },
];

/** Studio for a pressed digit, or null when the key selects no studio. */
export function studioForKey(key: string): WorkstationStudio | null {
  const found = STUDIOS.find((s) => s.key === key);
  return found ? found.id : null;
}

const EDITABLE_TAGS: Record<string, true> = { INPUT: true, SELECT: true, TEXTAREA: true };

/**
 * True when a keydown target is an editable context where single-digit
 * shortcuts must not fire (contenteditable, inputs, selects, textareas).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS[target.tagName]) return true;
  if (target.isContentEditable) return true;
  return false;
}

export type DisplayUnits = 'metric' | 'imperial';

/**
 * Selection filter families (synthesis pattern 1, adapted): the fin-set
 * component types share one family so the pick surface filters by what the
 * user means, not by the internal record shape.
 */
export type ComponentFilter =
  | 'all'
  | 'nosecone'
  | 'bodytube'
  | 'transition'
  | 'fin'
  | 'parachute'
  | 'masscomponent';

export interface FilterOption {
  id: ComponentFilter;
  label: string;
  title: string;
}

export const FILTER_OPTIONS: FilterOption[] = [
  { id: 'all', label: 'All', title: 'All assembly components' },
  { id: 'nosecone', label: 'Nosecone', title: 'Nosecone components' },
  { id: 'bodytube', label: 'Body tube', title: 'Body tube components' },
  { id: 'transition', label: 'Transition', title: 'Transition components' },
  { id: 'fin', label: 'Fin set', title: 'Fin-set components' },
  { id: 'parachute', label: 'Recovery', title: 'Parachute components' },
  { id: 'masscomponent', label: 'Mass', title: 'Mass components' },
];

/** Family of a component type under the filter (fins share one family). */
export function filterFamily(type: ComponentType): ComponentFilter {
  if (type === 'trapezoidfinset' || type === 'ellipticalfinset') return 'fin';
  return type;
}

/** True when a component passes the active type filter. */
export function matchesFilter(comp: RocketComponent, filter: ComponentFilter): boolean {
  return filter === 'all' || filterFamily(comp.type) === filter;
}

/**
 * Two-point compare (synthesis pattern 3, adapted to the assembly): rows of
 * added/removed/modified components between the current vehicle and a saved
 * checkpoint, identity by stable component id. Used verbatim by the
 * compare dock; deterministic and unit-tested.
 */
export type DiffKind = 'added' | 'removed' | 'modified';

export interface DiffRow {
  kind: DiffKind;
  id: string;
  name: string;
  summary: string;
}

export function diffVehicles(current: RocketVehicle, saved: RocketVehicle | null): DiffRow[] {
  if (!saved) return [];
  const rows: DiffRow[] = [];
  const byId = (v: RocketVehicle) => new Map(v.components.map((c) => [c.id, c]));
  const savedById = byId(saved);
  const currentById = byId(current);
  for (const comp of current.components) {
    const prior = savedById.get(comp.id);
    if (!prior) {
      rows.push({ kind: 'added', id: comp.id, name: comp.name, summary: 'new component' });
    } else if (stableStringify(prior) !== stableStringify(comp)) {
      rows.push({ kind: 'modified', id: comp.id, name: comp.name, summary: 'parameters changed' });
    }
  }
  for (const comp of saved.components) {
    if (!currentById.has(comp.id)) {
      rows.push({ kind: 'removed', id: comp.id, name: comp.name, summary: 'no longer in assembly' });
    }
  }
  return rows;
}

export interface CompareState {
  /** Whether the compare dock is open. */
  active: boolean;
  /** Blend 0–100: opacity of the saved geometry overlay on the canvas. */
  blend: number;
  /** The checkpoint the comparison reads against; null until a revision exists. */
  checkpoint: RocketVehicle | null;
}

export interface WorkspaceState {
  studio: WorkstationStudio;
  selectStudio: (studio: WorkstationStudio) => void;
  /** Left pane width in px (clamped 240–480 by the shell). */
  leftWidth: number;
  setLeftWidth: (px: number) => void;
  /** Right pane width in px (clamped 280–520 by the shell). */
  rightWidth: number;
  setRightWidth: (px: number) => void;
  displayUnits: DisplayUnits;
  setDisplayUnits: (units: DisplayUnits) => void;
  /** Shared plot cursor (display-only; never invalidates runs). */
  plotCursor: number | null;
  setPlotCursor: (t: number | null) => void;
  /** Precision pick-surface filter (pattern 1). */
  filter: ComponentFilter;
  setFilter: (filter: ComponentFilter) => void;
  /** Scope of the filter: whole vehicle (single-stage vehicles today). */
  scope: 'whole' | 'stage';
  setScope: (scope: 'whole' | 'stage') => void;
  /** Compare-vs-saved state (pattern 3). */
  compare: CompareState;
  setCompareActive: (active: boolean) => void;
  setCompareBlend: (blend: number) => void;
  setCompareCheckpoint: (checkpoint: RocketVehicle | null) => void;
}

const clampBlend = (raw: number): number => Math.min(100, Math.max(0, raw));

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  studio: 'airframe',
  selectStudio: (studio) => set({ studio }),
  leftWidth: 320,
  setLeftWidth: (px) => set({ leftWidth: Math.min(480, Math.max(240, Math.round(px))) }),
  rightWidth: 320,
  setRightWidth: (px) => set({ rightWidth: Math.min(520, Math.max(280, Math.round(px))) }),
  displayUnits: 'metric',
  setDisplayUnits: (units) => set({ displayUnits: units }),
  plotCursor: null,
  setPlotCursor: (t) => set({ plotCursor: t }),
  filter: 'all',
  setFilter: (filter) => set({ filter }),
  scope: 'whole',
  setScope: (scope) => set({ scope }),
  compare: { active: false, blend: 40, checkpoint: null },
  setCompareActive: (active) => {
    const compare = useWorkspaceStore.getState().compare;
    set({ compare: { ...compare, active } });
  },
  setCompareBlend: (blend) => {
    const compare = useWorkspaceStore.getState().compare;
    set({ compare: { ...compare, blend: clampBlend(blend) } });
  },
  setCompareCheckpoint: (checkpoint) => {
    const compare = useWorkspaceStore.getState().compare;
    set({ compare: { ...compare, checkpoint } });
  },
}));