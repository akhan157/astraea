import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Tabs } from 'radix-ui';
import { C } from '../kit/theme';
import { useFreshness } from '../hooks';
import { FreshnessBadge } from '../kit/Status';
import { WhyStale } from '../shell/Shell';
import { useCommittedRun, type StageId } from '../store';
import { useProjectStore } from '../../state/project';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { DragCalibrationChip } from '../evidence/CalibrationChip';

/** A dock's first-use height: fixed pixels, or a share of the room the stage gives it. */
export type DockDefault = number | ((availableHeight: number) => number);

/** The height a scaled or fixed default asks for, given the stage's free height. */
export function defaultDockHeight(initial: DockDefault, availableHeight: number): number {
  return typeof initial === 'function' ? initial(availableHeight) : initial;
}

/** The separator height the user last set, or null when the first-use default still applies. */
export function storedDockHeight(storageKey: string): number | null {
  try {
    const value = Number(localStorage.getItem(`ws.dock.${storageKey}`));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch { return null; }
}

/**
 * Center column: a main area over a resizable tabbed dock.
 *
 * A scaled `initial` follows the room the stage gives the dock until the user
 * drags the separator (or uses its arrow keys); from then on the stored height
 * always wins. A window resize therefore cannot leave a dock sized for a tall
 * window inside a short one.
 */
export function WithDock({ main, tabs, initial = 260, storageKey }: { main: ReactNode; tabs: { id: string; label: ReactNode; body: ReactNode }[]; initial?: DockDefault; storageKey: string }) {
  const root = useRef<HTMLDivElement | null>(null);
  const [stored, setStored] = useState<number | null>(() => storedDockHeight(storageKey));
  const [h, setH] = useState(() => stored ?? (typeof initial === 'number' ? initial : 0));
  useLayoutEffect(() => {
    if (stored !== null) return;
    const el = root.current;
    if (!el) return;
    const apply = () => {
      const next = defaultDockHeight(initial, el.clientHeight);
      setH((prev) => (Math.abs(next - prev) < 1 ? prev : next));
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [initial, stored]);
  const [tab, setTab] = useState(tabs[0]?.id);
  const start = useRef<{ y: number; h: number } | null>(null);
  const save = (v: number) => {
    setStored(v);
    try { localStorage.setItem(`ws.dock.${storageKey}`, String(v)); } catch { /* ignore */ }
  };
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative min-h-[160px] flex-1">{main}</div>
      <div role="separator" aria-orientation="horizontal" tabIndex={0} className="h-[5px] shrink-0 cursor-row-resize hover:bg-white/10" style={{ borderTop: `1px solid ${C.line}` }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { y: e.clientY, h }; }}
        onPointerMove={(e) => { if (start.current) setH(Math.max(120, Math.min(innerHeight - 220, start.current.h - (e.clientY - start.current.y)))); }}
        onPointerUp={() => { start.current = null; save(h); }}
        onKeyDown={(e) => {
          const next = e.key === 'ArrowUp' ? h + 16 : e.key === 'ArrowDown' ? Math.max(120, h - 16) : null;
          if (next !== null) { setH(next); save(next); }
        }} />
      {/* The stored height is a preference; on short windows the main area keeps its 160 px minimum. */}
      <Tabs.Root value={tab} onValueChange={setTab} className="flex shrink-0 flex-col" style={{ height: h, maxHeight: 'calc(100% - 166px)', minHeight: 120, background: C.panel }}>
        <Tabs.List className="flex shrink-0 items-center gap-1 px-2" style={{ borderBottom: `1px solid ${C.line}` }}>
          {tabs.map((t) => (
            <Tabs.Trigger key={t.id} value={t.id} className="relative px-2.5 py-2 text-[12px] data-[state=active]:text-white" style={{ color: tab === t.id ? C.fg : C.muted }}>
              {t.label}{tab === t.id && <span className="absolute right-2 bottom-0 left-2 h-[2px] rounded-full" style={{ background: C.accent }} />}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {tabs.map((t) => <Tabs.Content key={t.id} value={t.id} className="min-h-0 flex-1 overflow-auto thin-scroll">{t.body}</Tabs.Content>)}
      </Tabs.Root>
    </div>
  );
}

/** Stage title row with freshness badge; clicking a stale badge opens the dependency view. */
export function StageHeader({ stage, title, sub, right }: { stage: StageId; title: string; sub?: ReactNode; right?: ReactNode }) {
  const { state, reasons } = useFreshness(stage);
  // Stages that show flight results say when the stored run was computed with a drag calibration.
  const candidateSelected = useProjectStore((state) => isCandidateFlightModel(resolveFlightModel(state.project.flightModel)));
  const committed = useCommittedRun();
  const calibration = candidateSelected ? undefined : committed?.run?.dragCalibration;
  const showsFlight = stage === 'flight' || stage === 'recovery' || stage === 'verify' || stage === 'build';
  const badge = <FreshnessBadge state={state} detail={state === 'stale' ? `${reasons.length} input${reasons.length > 1 ? 's' : ''} changed` : undefined} onClick={state === 'stale' ? () => undefined : undefined} />;
  return (
    <div data-stage-header tabIndex={-1} className="flex flex-wrap min-h-[42px] shrink-0 items-center gap-3 px-4 outline-none" style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
      <span className="text-[13.5px] font-medium">{title}</span>
      {state === 'stale' ? <WhyStale trigger={<span>{badge}</span>} /> : badge}
      {sub && <span className="w-full order-last min-w-0 text-[12px] leading-snug 2xl:order-none 2xl:w-auto 2xl:truncate" style={{ color: C.muted }}>{sub}</span>}
      <span className="ml-auto flex shrink-0 items-center gap-2">{showsFlight && calibration && <DragCalibrationChip calibration={calibration} />}{right}</span>
    </div>
  );
}
