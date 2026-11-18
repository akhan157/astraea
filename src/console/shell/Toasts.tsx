/**
 * Change announcements: the project store's toasts (removed a part, replaced
 * the design with an example, …), each with Undo when the change is
 * undoable. Polite live region; each toast dismisses itself after a while,
 * and Undo reverses the most recent undoable change.
 */
import { useEffect } from 'react';
import { Undo2, X } from 'lucide-react';
import { useProjectStore } from '../../state/project';
import { C } from '../kit/theme';

export const TOAST_MS = 8000;

export function Toasts() {
  const toasts = useProjectStore((s) => s.toasts);
  const dismiss = useProjectStore((s) => s.dismissToast);
  const depth = useProjectStore((s) => s.past.length);
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), TOAST_MS));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-10 z-50 flex w-[340px] flex-col gap-2">
      {toasts.map((t, i) => (
        <div key={t.id} role="status" data-toast className="pointer-events-auto flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px] shadow-xl" style={{ background: C.raised, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.actionLabel === 'Undo' && (t.undoDepth === undefined ? i === toasts.length - 1 : t.undoDepth === depth) && (
            <button type="button" className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12px] hover:bg-white/5" style={{ border: `1px solid ${C.line}`, color: C.accent }}
              onClick={() => { useProjectStore.getState().undo(); dismiss(t.id); }}>
              <Undo2 size={12} aria-hidden="true" />Undo
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="rounded p-0.5 hover:bg-white/5" onClick={() => dismiss(t.id)}><X size={12} color={C.dim} /></button>
        </div>
      ))}
    </div>
  );
}
