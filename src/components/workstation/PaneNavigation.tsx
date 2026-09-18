/**
 * RIVAL S2 — PaneNavigation: the labeled single-region route to the Context
 * list, the studio Workspace, and the Inspector at viewports below the lg
 * breakpoint, where the side panes would otherwise be CSS-hidden with no
 * labeled alternative (enterprise P0/Astra-3: task loss at narrow widths).
 *
 * This is a Studios-style tab/panel switch: the shell keeps every region
 * mounted behind the `hidden` toggle (studio inputs survive pane switches)
 * and moves focus into the revealed region so a keyboard user is never
 * dropped mid-task.
 */
import React, { useRef } from 'react';

export type PaneRegion = 'context' | 'workspace' | 'inspector';

export const PANE_REGIONS: ReadonlyArray<{ id: PaneRegion; label: string; title: string }> = [
  { id: 'context', label: 'Context', title: 'Context list — assembly tree and case inputs' },
  { id: 'workspace', label: 'Workspace', title: 'Studio workspace' },
  { id: 'inspector', label: 'Inspector', title: 'Inspector — properties, readiness, settings' },
];

export interface PaneNavigationProps {
  value: PaneRegion;
  /** Arrow-key activation: selection moves, focus stays on the tab (roving). */
  onSelect: (region: PaneRegion) => void;
  /** Click activation: select and move focus into the revealed region. */
  onActivate: (region: PaneRegion) => void;
}

export const PaneNavigation: React.FC<PaneNavigationProps> = ({ value, onSelect, onActivate }) => {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onTablistKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const idx = PANE_REGIONS.findIndex((r) => r.id === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const next = (idx + delta + PANE_REGIONS.length) % PANE_REGIONS.length;
      const nextId = PANE_REGIONS[next].id;
      onSelect(nextId);
      tabRefs.current[next]?.focus();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      onSelect(PANE_REGIONS[0].id);
      tabRefs.current[0]?.focus();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      onSelect(PANE_REGIONS[PANE_REGIONS.length - 1].id);
      tabRefs.current[PANE_REGIONS.length - 1]?.focus();
    }
  };

  return (
    <div data-pane-nav="true" className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950 border-b border-zinc-800">
      <span aria-hidden="true" className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">
        Pane
      </span>
      <div
        role="tablist"
        aria-label="Pane regions"
        onKeyDown={onTablistKeyDown}
        className="flex items-center gap-0.5 bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-700/60"
      >
        {PANE_REGIONS.map((region, i) => {
          const active = value === region.id;
          return (
            <button
              key={region.id}
              type="button"
              role="tab"
              id={`pane-tab-${region.id}`}
              aria-selected={active}
              aria-controls={`pane-region-${region.id}`}
              data-pane-tab={region.id}
              title={region.title}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              tabIndex={active ? 0 : -1}
              onClick={() => onActivate(region.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                active ? 'bg-cyan-500/25 text-cyan-200' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
              }`}
            >
              {region.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};