/**
 * RIVAL S2 — StudioNavigation: the five-studio tablist with the keyboard map.
 *
 * Keys 1–5 select studios outside editable contexts (UI §5.3); each tab shows
 * its shortcut digit so the map is discoverable without documentation.
 * Ctrl/Cmd+Enter is the explicit Run affordance shared by every entry
 * (routing to the inline ensemble in Trajectory — never a modal). Escape is
 * never handled here: it cancels the nearest edit (the shell's draft
 * boundary), never navigation state and never a running job.
 */
import React, { useEffect } from 'react';
import {
  STUDIOS,
  isEditableTarget,
  studioForKey,
  useWorkspaceStore,
  type WorkstationStudio,
} from '../../store/workspaceStore';

export function useStudioKeyboard(onRun: () => void): void {
  const selectStudio = useWorkspaceStore((s) => s.selectStudio);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Explicit Run: Ctrl/Cmd+Enter reaches routine simulation without a modal.
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onRun();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      const studio = studioForKey(e.key);
      if (studio) {
        e.preventDefault();
        selectStudio(studio);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectStudio, onRun]);
}

export const StudioNavigation: React.FC = () => {
  const studio = useWorkspaceStore((s) => s.studio);
  const selectStudio = useWorkspaceStore((s) => s.selectStudio);
  return (
    <nav aria-label="Studios" className="flex items-center gap-0.5 bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-700/60">
      <div role="tablist" aria-label="Studio modes" className="flex items-center gap-0.5">
        {STUDIOS.map((tab) => {
          const active = studio === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              aria-label={`${tab.title} (shortcut ${tab.key})`}
              title={`${tab.title} — press ${tab.key}`}
              data-studio={tab.id}
              onClick={() => selectStudio(tab.id as WorkstationStudio)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
                active ? 'bg-cyan-500/25 text-cyan-200' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
              }`}
            >
              {tab.label}
              <span aria-hidden="true" className="ml-1 font-mono text-[10px] opacity-60">
                {tab.key}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};