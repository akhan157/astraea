/**
 * Astraea Component Tree Sidebar
 * Axial assembly list allowing component selection, reordering, addition, and deletion.
 */

import React, { useRef, useState } from 'react';
import { useRocketStore } from '../store/rocketStore';
import { matchesFilter, type ComponentFilter } from '../store/workspaceStore';
import { RocketComponent, ComponentType } from '../core/types';
import {
  Layers,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Compass,
  Cylinder,
  Minimize2,
  Wind,
  CircleDot,
  Weight,
} from 'lucide-react';

/**
 * RIVAL S2 — three-state pick rows (synthesis pattern 1): the tree rows
 * carry `data-state` (candidate/selected/action-needed) so the filter bar,
 * the tree, and screen readers agree on what needs action. Structural
 * reorder/delete stay enabled only at the whole-vehicle scope: a filtered
 * view is for picking, not mutating while hidden.
 */
export type TreePickState = 'candidate' | 'selected' | 'action-needed';

export interface ComponentTreeProps {
  /** Active type filter; rows outside it are hidden (pattern 1). */
  filter?: ComponentFilter;
  /** Optional three-state marker; defaults to selected/candidate. */
  highlight?: (comp: RocketComponent) => TreePickState;
}

export const ComponentTree: React.FC<ComponentTreeProps> = ({ filter, highlight }) => {
  const vehicle = useRocketStore((s) => s.vehicle);
  const stability = useRocketStore((s) => s.stability);
  const selectedComponentId = useRocketStore((s) => s.selectedComponentId);
  const selectComponent = useRocketStore((s) => s.selectComponent);
  const removeComponent = useRocketStore((s) => s.removeComponent);
  const reorderComponents = useRocketStore((s) => s.reorderComponents);
  const addComponent = useRocketStore((s) => s.addComponent);

  const [showAddMenu, setShowAddMenu] = useState(false);

  // Roving focus for the tree rows: exactly one row (the selection) is in
  // the tab order; arrows move selection+focus so keyboard users traverse
  // the axial assembly without leaving the tree.
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, comp: RocketComponent, idx: number) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Keys on an inner action button activate that button natively; never
    // hijack them into a row selection.
    if (e.target !== e.currentTarget) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectComponent(comp.id);
        return;
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const target = visible[idx + (e.key === 'ArrowDown' ? 1 : -1)];
        if (target) {
          selectComponent(target.id);
          rowRefs.current.get(target.id)?.focus();
        }
        return;
      }
      case 'Home':
      case 'End': {
        e.preventDefault();
        const target = e.key === 'Home' ? visible[0] : visible[visible.length - 1];
        if (target) {
          selectComponent(target.id);
          rowRefs.current.get(target.id)?.focus();
        }
      }
    }
  };

  const getComponentIcon = (type: ComponentType) => {
    switch (type) {
      case 'nosecone':
        return <Compass className="w-4 h-4 text-amber-400" />;
      case 'bodytube':
        return <Cylinder className="w-4 h-4 text-cyan-400" />;
      case 'transition':
        return <Minimize2 className="w-4 h-4 text-emerald-400" />;
      case 'trapezoidfinset':
      case 'ellipticalfinset':
        return <Wind className="w-4 h-4 text-rose-400" />;
      case 'parachute':
        return <CircleDot className="w-4 h-4 text-blue-400" />;
      case 'masscomponent':
      default:
        return <Weight className="w-4 h-4 text-purple-400" />;
    }
  };

  const getComponentSummary = (comp: RocketComponent) => {
    switch (comp.type) {
      case 'nosecone':
        return `${comp.shape} · ${(comp.length * 1000).toFixed(0)}mm · ⌀${(comp.baseDiameter * 1000).toFixed(0)}mm`;
      case 'bodytube':
        return `L: ${(comp.length * 1000).toFixed(0)}mm · ⌀${(comp.outerDiameter * 1000).toFixed(0)}mm`;
      case 'transition':
        return `L: ${(comp.length * 1000).toFixed(0)}mm · ⌀${(comp.foreDiameter * 1000).toFixed(0)}→${(comp.aftDiameter * 1000).toFixed(0)}mm`;
      case 'trapezoidfinset':
        return `${comp.finCount} Fins · Span: ${(comp.span * 1000).toFixed(0)}mm`;
      case 'ellipticalfinset':
        return `${comp.finCount} Fins · Span: ${(comp.span * 1000).toFixed(0)}mm`;
      case 'parachute':
        return `⌀${(comp.diameter * 1000).toFixed(0)}mm · Cd: ${comp.cd}`;
      case 'masscomponent':
        return `${(comp.mass * 1000).toFixed(1)}g`;
      default:
        return '';
    }
  };

  // Filtered pick rows; anything outside the filter is hidden, never
  // mutated (structuralLocked below).
  const visible = vehicle.components.filter((comp) => !filter || matchesFilter(comp, filter));
  // Repair targets the current filter hides (action-needed rows absent from
  // the visible set): a repair link pointing at a hidden mount/motor must
  // surface a labeled message, never a silent absence.
  const hiddenRepairTargets =
    filter && filter !== 'all' && highlight
      ? vehicle.components.filter((comp) => !matchesFilter(comp, filter) && highlight(comp) === 'action-needed')
      : [];

  const handleAddNew = (type: ComponentType) => {
    const id = `comp-${Date.now()}`;
    const defaultDia = stability.referenceDiameter || 0.05;

    let newComp: RocketComponent;
    switch (type) {
      case 'nosecone':
        newComp = {
          id,
          name: 'Ogive Nosecone',
          type: 'nosecone',
          shape: 'ogive',
          length: 0.20,
          baseDiameter: defaultDia,
          wallThickness: 0.002,
          isHollow: true,
          materialId: 'pla_3dprint',
          color: '#38bdf8',
        };
        break;
      case 'bodytube':
        newComp = {
          id,
          name: 'Airframe Tube',
          type: 'bodytube',
          length: 0.40,
          outerDiameter: defaultDia,
          innerDiameter: defaultDia - 0.003,
          materialId: 'cardboard',
          color: '#ffffff',
        };
        break;
      case 'transition':
        newComp = {
          id,
          name: 'Boattail Transition',
          type: 'transition',
          length: 0.08,
          foreDiameter: defaultDia,
          aftDiameter: defaultDia * 0.85,
          wallThickness: 0.002,
          isHollow: true,
          materialId: 'aluminum',
          color: '#71717a',
        };
        break;
      case 'trapezoidfinset':
        newComp = {
          id,
          name: 'Trapezoidal Fins',
          type: 'trapezoidfinset',
          finCount: 3,
          rootChord: 0.10,
          tipChord: 0.04,
          span: 0.06,
          sweepLength: 0.04,
          thickness: 0.003,
          crossSection: 'rounded',
          axialOffset: 0.25,
          materialId: 'plywood',
          color: '#38bdf8',
        };
        break;
      case 'ellipticalfinset':
        newComp = {
          id,
          name: 'Elliptical Fins',
          type: 'ellipticalfinset',
          finCount: 3,
          rootChord: 0.10,
          span: 0.06,
          thickness: 0.003,
          axialOffset: 0.25,
          materialId: 'plywood',
          color: '#38bdf8',
        };
        break;
      case 'parachute':
        newComp = {
          id,
          name: 'Recovery Parachute',
          type: 'parachute',
          diameter: 0.45,
          cd: 0.8,
          mass: 0.025,
          axialOffset: 0.05,
          materialId: 'cardboard',
        };
        break;
      case 'masscomponent':
      default:
        newComp = {
          id,
          name: 'Altimeter Bay Mass',
          type: 'masscomponent',
          mass: 0.05,
          length: 0.05,
          axialOffset: 0.05,
          materialId: 'cardboard',
        };
        break;
    }

    addComponent(newComp);
    setShowAddMenu(false);
  };

  return (
    <aside className="w-80 bg-zinc-900/90 border-r border-zinc-800 flex flex-col h-[calc(100vh-3.5rem)] z-20 backdrop-blur-md">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">Axial Assembly</span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
          {vehicle.components.length} parts
        </span>
      </div>

      {/* Component List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {/* Labeled empty state: a filter that hides the mount/motor a repair
            link points at must say so — absence would read as "no repair". */}
        {hiddenRepairTargets.length > 0 && (
          <div
            data-filter-hides-repair="true"
            role="status"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200 space-y-0.5"
          >
            <p className="font-semibold">
              {hiddenRepairTargets.length === 1
                ? 'Repair target hidden by the current filter'
                : `${hiddenRepairTargets.length} repair targets hidden by the current filter`}
            </p>
            <p className="text-amber-200/80">
              {hiddenRepairTargets.map((c) => c.name).join(', ')} — switch the filter to All to act on the mount.
            </p>
          </div>
        )}

        {/* Labeled empty state for a filter that matches nothing at all. */}
        {visible.length === 0 && (
          <p data-tree-filter-empty="true" role="status" className="text-[11px] text-zinc-500 px-1">
            No components match this filter — switch to All to see the assembly.
          </p>
        )}

        {/* The axial assembly as a keyboard-operable tree: rows are
            treeitems with a roving tabindex (Enter/Space/arrows select). */}
        <div role="tree" aria-label="Axial assembly components" className="space-y-1.5">
        {visible.map((comp, idx) => {
          const isSelected = comp.id === selectedComponentId;
          const state = highlight
            ? highlight(comp)
            : isSelected
              ? ('selected' as TreePickState)
              : ('candidate' as TreePickState);
          const stateRow = state === 'selected'
            ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm'
            : state === 'action-needed'
              ? 'bg-amber-500/10 border-amber-500/40'
              : 'bg-zinc-800/40 border-zinc-800/80 hover:bg-zinc-800 hover:border-zinc-700';
          const structuralLocked = filter !== undefined && filter !== 'all';
          const contrib = stability.contributions.find((c) => c.id === comp.id);
          const massDisplay = contrib ? (contrib.mass < 1 ? `${(contrib.mass * 1000).toFixed(1)}g` : `${contrib.mass.toFixed(2)}kg`) : '';

          return (
            <div
              key={comp.id}
              role="treeitem"
              aria-selected={isSelected}
              aria-label={comp.name}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectComponent(comp.id)}
              onKeyDown={(e) => onRowKeyDown(e, comp, idx)}
              ref={(el) => {
                if (el) rowRefs.current.set(comp.id, el);
                else rowRefs.current.delete(comp.id);
              }}
              data-state={state}
              data-component-id={comp.id}
              className={`p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${stateRow}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-md bg-zinc-800 border border-zinc-700/50 shrink-0">
                  {getComponentIcon(comp.type)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-zinc-200 truncate">{comp.name}</span>
                    {state === 'action-needed' && (
                      <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300" title="Needs action — inspect the motor mount">
                        needs action
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono truncate">{getComponentSummary(comp)}</div>
                </div>
              </div>

              {/* Right Details / Actions — always visible (never hover-only),
                  real buttons with keyboard equivalents (Tab + Enter/Space). */}
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <span className="text-[10px] font-mono text-zinc-500 mr-1">{massDisplay}</span>

                {/* Move Up / Down (whole-vehicle scope only) */}
                <div className={`flex flex-col ${structuralLocked ? 'hidden' : ''}`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (idx > 0) reorderComponents(idx, idx - 1);
                    }}
                    disabled={idx === 0}
                    aria-label="Move up"
                    title="Move Up"
                    className="p-0.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-20"
                  >
                    <ChevronUp className="w-3 h-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (idx < vehicle.components.length - 1) reorderComponents(idx, idx + 1);
                    }}
                    disabled={idx === vehicle.components.length - 1}
                    aria-label="Move down"
                    title="Move Down"
                    className="p-0.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-20"
                  >
                    <ChevronDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </div>

                {/* Delete (whole-vehicle scope only) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeComponent(comp.id);
                  }}
                  disabled={vehicle.components.length <= 1}
                  aria-label="Remove component"
                  title="Remove Component"
                  className={`p-1 text-zinc-500 hover:text-rose-400 ${structuralLocked ? 'hidden' : ''} disabled:opacity-30`}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Add Component Action Bar */}
      <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4 text-cyan-400" />
          <span>Add Airframe Component</span>
        </button>

        {showAddMenu && (
          <div className="absolute bottom-16 left-3 right-3 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-1.5 z-50 space-y-1">
            <button
              onClick={() => handleAddNew('nosecone')}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <Compass className="w-3.5 h-3.5 text-amber-400" />
              <span>Nosecone</span>
            </button>
            <button
              onClick={() => handleAddNew('bodytube')}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <Cylinder className="w-3.5 h-3.5 text-cyan-400" />
              <span>Body Tube</span>
            </button>
            <button
              onClick={() => handleAddNew('transition')}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Transition (Shoulder / Boattail)</span>
            </button>
            <button
              onClick={() => handleAddNew('trapezoidfinset')}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <Wind className="w-3.5 h-3.5 text-rose-400" />
              <span>Trapezoidal Fin Set</span>
            </button>
            <button
              onClick={() => handleAddNew('ellipticalfinset')}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <Wind className="w-3.5 h-3.5 text-rose-400" />
              <span>Elliptical Fin Set</span>
            </button>
            <button
              onClick={() => handleAddNew('parachute')}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <CircleDot className="w-3.5 h-3.5 text-blue-400" />
              <span>Recovery Parachute</span>
            </button>
            <button
              onClick={() => handleAddNew('masscomponent')}
              className="w-full text-left px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <Weight className="w-3.5 h-3.5 text-purple-400" />
              <span>Internal Mass / Avionics</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
