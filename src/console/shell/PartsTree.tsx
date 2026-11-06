/**
 * Parts tree: the axial assembly, its type-family filter and its structural
 * edits (add / remove / reorder).
 *
 * Rows are `treeitem`s with a roving tabindex (one tabbable row; arrows,
 * Home and End move selection and focus; Enter and Space select). Row action
 * buttons are real buttons revealed on row hover or focus-within, so Tab then
 * Enter/Space works and a key pressed on a button is never hijacked into a
 * row selection.
 *
 * The tree shows nothing the engine does not compute: masses come from the
 * laid-out parts, and a refused edit says why inline (`role="alert"`), never
 * through a dialog.
 */
import { useMemo, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { Plus, Trash2, ChevronUp, ChevronDown, LayoutTemplate, X, AlertTriangle } from 'lucide-react';
import type { RocketComponent } from '../../core/types';
import { useWS, PRESETS } from '../store';
import { useChanges, useStability } from '../hooks';
import { useLayout } from '../viewport/Vehicle3D';
import { C } from '../kit/theme';
import { show } from '../kit/units';
import { assessMounts } from '../../application/caseResolver';
import { ADDABLE_COMPONENTS, type ComponentOpResult } from '../../state/componentOps';
import {
  FILTER_OPTIONS,
  PICK_STATE_LABEL,
  familyCounts,
  matchesFilter,
  pickStateFor,
  useSelectionFilter,
  type PickState
} from '../../state/selection';
import { PART_ICON } from './partsIcons';

/** Row tint by pick state: action-needed outranks selected. */
const STATE_BG: Record<PickState, string> = {
  selected: 'rgba(110,231,247,0.08)',
  'action-needed': 'rgba(245,180,60,0.10)',
  candidate: 'transparent'
};

export function PartsTree() {
  const vehicle = useWS((s) => s.design.vehicle);
  const aeroModel = useWS((s) => s.design.aeroModel);
  const selectedId = useWS((s) => s.selectedId);
  const hoverId = useWS((s) => s.hoverId);
  const set = useWS((s) => s.set);
  const stage = useWS((s) => s.stage);
  const addComponent = useWS((s) => s.addComponent);
  const removeComponent = useWS((s) => s.removeComponent);
  const moveComponent = useWS((s) => s.moveComponent);
  const changes = useChanges();
  const stab = useStability();
  const changed = useMemo(() => new Set(changes.map((c) => c.partId)), [changes]);
  const lay = useLayout(vehicle, aeroModel);
  const total = lay ? Object.values(lay.parts).reduce((sum, p) => sum + p.mass, 0) : 0;
  const units = useWS((s) => s.units);
  const filter = useSelectionFilter((s) => s.filter);
  const setFilter = useSelectionFilter((s) => s.setFilter);
  const [nameFilter, setNameFilter] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const mounts = useMemo(() => assessMounts(vehicle), [vehicle]);
  const counts = useMemo(() => familyCounts(vehicle.components), [vehicle]);

  const stateOf = (c: RocketComponent): PickState => pickStateFor(c, selectedId, mounts);
  const byFamily = vehicle.components.filter((c) => matchesFilter(c, filter));
  const visible = byFamily.filter((c) => c.name.toLowerCase().includes(nameFilter.trim().toLowerCase()));
  const hiddenRepair = filter === 'all' ? [] : vehicle.components.filter((c) => !matchesFilter(c, filter) && stateOf(c) === 'action-needed');
  const actionNeeded = vehicle.components.filter((c) => stateOf(c) === 'action-needed');
  const structuralLocked = filter !== 'all';
  const selectedVisible = visible.some((c) => c.id === selectedId);
  const tabbableId = selectedVisible ? selectedId : (visible[0]?.id ?? null);

  const select = (id: string) => {
    const leaveStage = stage === 'flight' || stage === 'verify' || stage === 'build' || stage === 'mission';
    set({ selectedId: id, ...(leaveStage ? { stage: 'airframe' as const } : {}) });
  };

  const runOp = (op: ComponentOpResult) => {
    if (!op.ok) setMessage(op.reason);
  };

  const onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, comp: RocketComponent, idx: number) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Keys pressed on an inner action button activate that button natively.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(comp.id);
      return;
    }
    let target: RocketComponent | undefined;
    if (e.key === 'ArrowDown') target = visible[idx + 1];
    else if (e.key === 'ArrowUp') target = visible[idx - 1];
    else if (e.key === 'Home') target = visible[0];
    else if (e.key === 'End') target = visible[visible.length - 1];
    else return;
    e.preventDefault();
    if (!target) return;
    select(target.id);
    rowRefs.current.get(target.id)?.focus();
  };

  const refDiameter = stab?.refDiameter ?? 0.05;

  return (
    <div className="flex h-full flex-col" style={{ background: C.panel }}>
      <div className="flex items-center px-3 pt-3 pb-2 text-[10.5px] font-medium tracking-[0.12em] uppercase" style={{ color: C.dim }}>
        Parts<span className="ml-auto font-geist-mono tracking-normal normal-case">{lay ? `${show(total, 'mass', units).text} ${show(total, 'mass', units).unit}` : 'Mass unavailable'}</span>
      </div>

      <div className="space-y-1.5 px-2 pb-2">
        <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder="Filter parts by name" aria-label="Filter parts by name" className="w-full rounded px-2 py-1 text-[12px] outline-none" style={{ background: C.sunken, border: `1px solid ${C.line}`, color: C.fg }} />
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter parts by type">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.id;
            return (
              <button key={opt.id} type="button" aria-pressed={active} data-filter-type={opt.id} title={`${opt.title} (${counts[opt.id]})`} onClick={() => setFilter(opt.id)}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ background: active ? 'rgba(110,231,247,0.14)' : C.sunken, border: `1px solid ${active ? 'rgba(110,231,247,0.4)' : C.line}`, color: active ? C.fg : C.muted }}>
                {opt.label}<span aria-hidden="true" className="ml-1 font-geist-mono text-[10px]" style={{ color: C.dim }}>{counts[opt.id]}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[10px]" aria-label="Pick state legend" style={{ color: C.dim }}>
          <span aria-hidden="true" style={{ color: C.accent }}>●</span>
          <span>{PICK_STATE_LABEL.selected}</span>
          <span aria-hidden="true" style={{ color: C.changed }}>▲</span>
          <span>{`${PICK_STATE_LABEL['action-needed']}${actionNeeded.length > 0 ? ` · ${actionNeeded.length}` : ''}`}</span>
        </div>
      </div>

      {message !== null && (
        <div role="alert" className="mx-2 mb-2 flex items-start gap-2 rounded px-2 py-1.5 text-[11.5px]" style={{ background: 'rgba(245,180,60,0.10)', border: `1px solid rgba(245,180,60,0.4)`, color: C.fg }}>
          <AlertTriangle size={13} color={C.changed} />
          <span className="flex-1">{message}</span>
          <button onClick={() => setMessage(null)} aria-label="Dismiss message" style={{ color: C.dim }}><X size={12} /></button>
        </div>
      )}

      {hiddenRepair.length > 0 && (
        <div data-filter-hides-repair="true" role="status" className="mx-2 mb-2 rounded px-2 py-1.5 text-[11px]" style={{ background: 'rgba(245,180,60,0.10)', border: `1px solid rgba(245,180,60,0.4)`, color: C.fg }}>
          <p className="font-semibold">{hiddenRepair.length === 1 ? 'Repair target hidden by the current filter' : `${hiddenRepair.length} repair targets hidden by the current filter`}</p>
          <p style={{ color: C.muted }}>{hiddenRepair.map((c) => c.name).join(', ')} — switch the filter to All to act on the mount.</p>
        </div>
      )}

      <div role="tree" aria-label="Assembly parts" className="min-h-0 flex-1 overflow-auto thin-scroll">
        {visible.length === 0 && (
          <p data-tree-filter-empty="true" role="status" className="px-3 py-2 text-[11.5px]" style={{ color: C.muted }}>
            No parts match this filter — switch to All to see the assembly.
          </p>
        )}
        {visible.map((c, idx) => {
          const I = PART_ICON[c.type];
          const m = lay?.parts[c.id]?.mass ?? 0;
          const inside = c.type === 'parachute' || c.type === 'masscomponent';
          const state = stateOf(c);
          const isSelected = c.id === selectedId;
          return (
            <div key={c.id} role="treeitem" aria-label={c.name} aria-selected={isSelected} data-component-id={c.id} data-state={state}
              tabIndex={c.id === tabbableId ? 0 : -1}
              ref={(el) => { if (el) rowRefs.current.set(c.id, el); else rowRefs.current.delete(c.id); }}
              onClick={() => select(c.id)}
              onKeyDown={(e) => onRowKeyDown(e, c, idx)}
              onPointerEnter={() => set({ hoverId: c.id })} onPointerLeave={() => set({ hoverId: null })}
              className="group relative mx-1.5 flex cursor-pointer items-center gap-2 rounded px-2 py-[5px] text-[12.5px]"
              style={{ background: state !== 'candidate' ? STATE_BG[state] : hoverId === c.id ? C.hover : undefined, paddingLeft: inside ? 22 : 8 }}>
              <I size={13} color={isSelected ? C.accent : C.dim} strokeWidth={1.6} />
              <span title={c.name} className="min-w-0 flex-1 truncate" style={{ color: isSelected ? C.fg : '#C9CDD2' }}>{c.name}</span>
              {state === 'action-needed' && <span title="Needs action — inspect the motor mount" className="rounded px-1 text-[9px]" style={{ background: 'rgba(245,180,60,0.2)', color: C.changed }}>needs action</span>}
              {changed.has(c.id) && <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.changed }} title="Changed since the committed run" />}
              <span className="w-12 text-right font-geist-mono text-[10.5px]" style={{ color: C.dim }}>{lay ? show(m, 'mass', units).text : 'N/A'}</span>
              <span className="pointer-events-none absolute inset-y-0 right-0.5 flex items-center gap-0.5 rounded px-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100" style={{ background: C.panel, boxShadow: `-8px 0 10px ${C.panel}` }}>
                <span className="flex flex-col">
                  <button type="button" onClick={(e) => { e.stopPropagation(); runOp(moveComponent(c.id, -1)); }} disabled={structuralLocked || idx === 0} aria-label="Move up" title={structuralLocked ? 'Switch the filter to All to reorder or remove parts' : 'Move toward the nose'} className="px-0.5" style={{ color: C.muted }}><ChevronUp size={11} /></button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); runOp(moveComponent(c.id, 1)); }} disabled={structuralLocked || idx === byFamily.length - 1} aria-label="Move down" title={structuralLocked ? 'Switch the filter to All to reorder or remove parts' : 'Move toward the tail'} className="px-0.5" style={{ color: C.muted }}><ChevronDown size={11} /></button>
                </span>
                <button type="button" onClick={(e) => { e.stopPropagation(); runOp(removeComponent(c.id)); }} disabled={structuralLocked || vehicle.components.length <= 1} aria-label="Remove component" title={structuralLocked ? 'Switch the filter to All to remove parts' : 'Remove this part'} className="px-0.5" style={{ color: C.muted }}><Trash2 size={11} /></button>
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 p-2" style={{ borderTop: `1px solid ${C.line}` }}>
        <Popover.Root open={addOpen} onOpenChange={setAddOpen}>
          <Popover.Trigger asChild>
            <button className="flex flex-1 items-center justify-center gap-2 rounded px-2 py-1.5 text-[12px]" style={{ border: `1px solid ${C.line}`, color: C.muted }} title="Add a component to the assembly"><Plus size={13} />Add part</button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content side="top" align="start" sideOffset={6} className="z-50 w-[250px] rounded-md p-1 shadow-2xl" style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
              {ADDABLE_COMPONENTS.map(({ type, label }) => (
                <Popover.Close key={type} asChild>
                  <button onClick={() => runOp(addComponent(type, refDiameter))} className="block w-full rounded px-2.5 py-1.5 text-left text-[12.5px] hover:bg-white/5">{label}</button>
                </Popover.Close>
              ))}
              <div className="px-2.5 py-1.5 text-[10.5px]" style={{ color: C.dim }}>Undoable. The new part is selected for editing.</div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <TemplateMenu />
      </div>
    </div>
  );
}

function TemplateMenu() {
  const loadPreset = useWS((s) => s.loadPreset);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-white/5" style={{ border: `1px solid ${C.line}`, color: C.muted }} title="Start from a template"><LayoutTemplate size={13} /></button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="end" sideOffset={6} className="z-50 w-[260px] rounded-md p-1 shadow-2xl" style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
          {PRESETS.map((p) => (
            <Popover.Close key={p.id} asChild>
              <button onClick={() => loadPreset(p.id)} className="block w-full rounded px-2.5 py-2 text-left hover:bg-white/5">
                <div className="text-[12.5px]">{p.label}</div>
              </button>
            </Popover.Close>
          ))}
          <div className="px-2.5 py-1.5 text-[10.5px]" style={{ color: C.dim }}>Loading a template is undoable. Run to simulate the new design.</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
