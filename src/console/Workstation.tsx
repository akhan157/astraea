import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Tooltip } from 'radix-ui';
import { X } from 'lucide-react';
import { committedRun, consoleSessionState, STAGES, useConsoleJobs, useWS } from './store';
import { useMediaQuery } from './hooks';
import { C } from './kit/theme';
import { TopBar, StageRail, PartsTree, StatusBar, Palette, Shortcuts } from './shell/Shell';
import { PartInspector } from './shell/Inspector';
import { AirframeStage } from './stages/Airframe';
import { AeroStage } from './stages/Aero';
import { FlightStage, FlightInspector } from './stages/Flight';
import { MissionStage, MissionInspector } from './stages/Mission';
import { MotorStage, MotorInspector } from './stages/Motor';
import { RecoveryStage } from './stages/Recovery';
import { VerifyStage, VerifyInspector } from './stages/Verify';
import { BuildStage, BuildInspector } from './stages/Build';
import { Caveat } from './kit/Caveat';
import { hasToured, Onboarding } from './shell/Onboarding';
import { AeroModelProvenanceDialog } from './evidence/AeroModelProvenance';
import { DropOverlay, useProjectDrop } from './shell/ProjectChrome';
import { stagedCount, useProjectStore } from '../state/project';
import { ACCURACY_URL } from '../lib/links';
import { BETA_ACCURACY_CLAIM, BETA_BANNER_SHORT } from './evidenceClaims';

function Splitter({ width, setWidth, min, max, invert }: { width: number; setWidth: (w: number) => void; min: number; max: number; invert?: boolean }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div role="separator" aria-orientation="vertical" tabIndex={0} className="w-[5px] shrink-0 cursor-col-resize hover:bg-white/10"
      style={{ [invert ? 'borderLeft' : 'borderRight']: `1px solid ${C.line}` }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { x: e.clientX, w: width }; }}
      onPointerMove={(e) => { if (start.current) setWidth(Math.max(min, Math.min(max, start.current.w + (e.clientX - start.current.x) * (invert ? -1 : 1)))); }}
      onPointerUp={() => { start.current = null; }}
      onKeyDown={(e) => { const d = e.key === 'ArrowRight' ? 16 : e.key === 'ArrowLeft' ? -16 : 0; if (d) setWidth(Math.max(min, Math.min(max, width + d * (invert ? -1 : 1)))); }} />
  );
}

/** A side panel at widths where it would otherwise squeeze the stage. */
function PanelDrawer({ side, label, width, onClose, children }: { side: 'left' | 'right'; label: string; width: number; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 z-20 bg-black/40" />
      <aside role="dialog" aria-label={label} className={`absolute inset-y-0 z-30 flex flex-col shadow-2xl ${side === 'left' ? 'left-[64px] border-r' : 'right-0 border-l'}`}
        style={{ width, maxWidth: 'calc(100% - 64px)', background: C.panel, borderColor: C.lineStrong }}>
        <div className="flex h-8 shrink-0 items-center justify-between px-2" style={{ borderBottom: `1px solid ${C.line}` }}>
          <span className="text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>{label}</span>
          <button onClick={onClose} aria-label={`Close ${label.toLowerCase()}`} className="rounded p-1 hover:bg-white/5"><X size={13} color={C.dim} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </aside>
    </>
  );
}

export default function Workstation() {
  const s = useWS();
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [left, setLeft] = useState(250);
  const [right, setRight] = useState(320);
  const [smallDismissed, setSmallDismissed] = useState(false);
  // The inspector's own empty rule (item A): Airframe, Aero and Recovery show
  // the part inspector; with no selected part and nothing staged it only holds
  // the "Select a part…" line. Motor and Verify placeholders are diagnostics
  // (a broken motor reference, no gates yet), so they count as content.
  const airframeDraft = useProjectStore((state) => state.drafts.airframe);
  const stagedAirframe = Object.keys(airframeDraft.components).length + airframeDraft.added.length + airframeDraft.removed.length;
  const selectedPart = s.design.vehicle.components.find((component) => component.id === s.selectedId);
  const inspectorEmpty = (s.stage === 'airframe' || s.stage === 'aero' || s.stage === 'recovery')
    && selectedPart === undefined
    && stagedAirframe === 0;
  // Layout breakpoints: the inspector becomes a drawer before it starts
  // squeezing results, then the parts tree, then the workstation stops
  // pretending a phone-sized window can hold three columns.
  const compact = useMediaQuery('(max-width: 1279px)');
  const narrow = useMediaQuery('(max-width: 1023px)');
  const phone = useMediaQuery('(max-width: 719px)');
  // Once the user toggles a panel in this session, width changes leave it alone.
  const explicitLeft = useRef(false);
  const explicitRight = useRef(false);
  // The layout's own collapse is not a user choice. Every other panel-state
  // transition is, so a later resize never undoes it.
  const autoCollapse = useRef({ left: false, right: false });
  const lastOpen = useRef({ left: s.leftOpen, right: s.rightOpen });
  // Panel-state transitions made by the empty rule, not by the user: the
  // breakpoint logic and the manual pins below must ignore them. The pins are
  // what makes manual control win over the auto rule.
  const autoRight = useRef(false);
  const manualOpenEmpty = useRef(false);
  // A user close while the inspector had content holds until the next new
  // selection. A boolean, not the selected id: Mission/Flight/Build have
  // content with nothing selected, and null must not read as "no pin".
  const manualClosed = useRef(false);
  const lastSelection = useRef<string | null>(s.selectedId);
  const inspectorPanel = useRef<HTMLDivElement>(null);
  // Focus can be unmounted before the auto-close effect runs (a preset swap
  // replaces the fields), so remember whether it was last inside the panel.
  const focusWasInside = useRef(false);
  useEffect(() => {
    const onFocusIn = (event: FocusEvent): void => {
      focusWasInside.current = inspectorPanel.current?.contains(event.target as Node) ?? false;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  // The Escape handler is registered once; these mirror its overlay state.
  const paletteOpen = useRef(false);
  const shortcutsOpen = useRef(false);
  useEffect(() => { paletteOpen.current = palette; shortcutsOpen.current = shortcuts; }, [palette, shortcuts]);
  // A file dropped anywhere in the window imports into the unified project.
  const { dragging } = useProjectDrop();

  // One real run on load, so there is a committed baseline to compare against.
  // A run without the native backend fails closed and surfaces its error.
  useEffect(() => { if (!committedRun()) void useConsoleJobs.getState().run(); }, []);

  // Collapse into a drawer at the moment the breakpoint is crossed. Layout
  // effects run before paint, so the wide layout never flashes under the
  // overlay. An explicit toggle in this session always wins.
  useLayoutEffect(() => {
    if (!compact) return;
    const st = consoleSessionState();
    if (!explicitRight.current && st.rightOpen) { autoCollapse.current.right = true; st.set({ rightOpen: false }); }
  }, [compact]);
  useLayoutEffect(() => {
    if (!narrow) return;
    const st = consoleSessionState();
    if (!explicitLeft.current && st.leftOpen) { autoCollapse.current.left = true; st.set({ leftOpen: false }); }
  }, [narrow]);
  useEffect(() => {
    if (s.leftOpen !== lastOpen.current.left) {
      lastOpen.current.left = s.leftOpen;
      if (autoCollapse.current.left) autoCollapse.current.left = false;
      else explicitLeft.current = true;
    }
    if (s.rightOpen !== lastOpen.current.right) {
      lastOpen.current.right = s.rightOpen;
      if (autoCollapse.current.right) autoCollapse.current.right = false;
      else if (autoRight.current) autoRight.current = false;
      else {
        // A real user action: remember what it means for the auto rule.
        explicitRight.current = true;
        if (s.rightOpen) {
          manualClosed.current = false;
          if (inspectorEmpty) manualOpenEmpty.current = true;
        } else {
          manualOpenEmpty.current = false;
          if (!inspectorEmpty) manualClosed.current = true;
        }
      }
    }
  }, [s.leftOpen, s.rightOpen, inspectorEmpty, s.selectedId]);

  /**
   * Auto rule for the inspector: collapse it when it is empty, and open it
   * inline when a part becomes selected. The drawer never auto-opens because
   * it would cover the canvas. Manual opens while empty and manual closes with
   * content win until the selection changes.
   */
  useEffect(() => {
    const st = consoleSessionState();
    if (s.selectedId !== lastSelection.current) {
      lastSelection.current = s.selectedId;
      manualClosed.current = false;
    }
    if (inspectorEmpty) {
      if (!st.rightOpen || manualOpenEmpty.current) return;
      // Focus must not be lost into a panel that is about to collapse.
      const active = document.activeElement as HTMLElement | null;
      const insidePanel = focusWasInside.current
        || (inspectorPanel.current !== null && active !== null && inspectorPanel.current.contains(active))
        || (active?.closest('aside[aria-label="Inspector"]') ?? null) !== null;
      if (insidePanel) {
        const treeItem = [...document.querySelectorAll<HTMLElement>('[data-component-id]')]
          .find((element) => element.dataset.componentId === s.selectedId);
        (treeItem ?? document.querySelector<HTMLElement>('[data-stage-header]') ?? document.querySelector<HTMLElement>('[aria-label="Toggle inspector"]'))?.focus();
        focusWasInside.current = false;
      }
      autoRight.current = true;
      st.set({ rightOpen: false });
      return;
    }
    manualOpenEmpty.current = false;
    if (st.rightOpen || compact) return;
    if (manualClosed.current) return;
    autoRight.current = true;
    st.set({ rightOpen: true });
  }, [inspectorEmpty, compact, s.selectedId, s.stage]);

  useEffect(() => {
    if (!hasToured()) s.set({ onboarding: 0 });
    const sc = () => setShortcuts(true);
    addEventListener('ws:shortcuts', sc);
    return () => removeEventListener('ws:shortcuts', sc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLeft = () => {
    explicitLeft.current = true;
    const st = consoleSessionState();
    st.set({ leftOpen: !st.leftOpen });
  };
  const toggleRight = () => {
    explicitRight.current = true;
    const st = consoleSessionState();
    st.set({ rightOpen: !st.rightOpen });
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const st = consoleSessionState();
      const mod = e.metaKey || e.ctrlKey;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === 'Escape') {
        // Escape inside a field belongs to the field (a select closes its
        // dropdown, a number input cancels its own edit): it must not reach
        // past it and wipe the staged airframe edits.
        if (typing) return;
        const staged = stagedCount('airframe');
        useProjectStore.getState().revertStudio('airframe');
        setPalette(false); setShortcuts(false);
        // Second step, only when Escape was not consumed by an overlay and
        // there was nothing to discard: clear the selection. This is the
        // deselect gesture the empty inspector needs.
        const overlayOpen = paletteOpen.current || shortcutsOpen.current || document.querySelector('[role="dialog"]') !== null;
        if (staged === 0 && !overlayOpen) st.set({ selectedId: null });
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); st.set({ stage: 'flight' }); void st.run(); return; }
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); st.redo(); return; }
      if (typing || mod || e.altKey) return;
      if (e.key === '?') setShortcuts(true);
      if (e.key === '[') { explicitLeft.current = true; st.set({ leftOpen: !st.leftOpen }); }
      if (e.key === ']') { explicitRight.current = true; st.set({ rightOpen: !st.rightOpen }); }
      const stage = STAGES.find((x) => x.key === e.key);
      if (stage) st.set({ stage: stage.id });
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);

  const center: Record<typeof s.stage, ReactNode> = {
    mission: <MissionStage />, airframe: <AirframeStage />, motor: <MotorStage />, aero: <AeroStage />,
    flight: <FlightStage />, recovery: <RecoveryStage />, verify: <VerifyStage />, build: <BuildStage />
  };
  const inspector: Record<typeof s.stage, ReactNode> = {
    mission: <MissionInspector />, airframe: <PartInspector />, motor: <MotorInspector />, aero: <PartInspector />,
    flight: <FlightInspector />, recovery: <PartInspector />, verify: <VerifyInspector />, build: <BuildInspector />
  };

  if (phone && !smallDismissed) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: C.bg, color: C.fg }}>
        <div role="dialog" aria-modal="true" aria-labelledby="desktop-window-notice" className="w-full max-w-sm rounded-lg p-6 text-center shadow-2xl" style={{ background: C.panel, border: `1px solid ${C.lineStrong}` }}>
          <h1 id="desktop-window-notice" className="text-[15px] font-medium">Astraea is designed for a desktop-size window</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>The workstation needs room for the parts tree, the stage workspace and the inspector. Widen the window for the intended layout.</p>
          <button autoFocus onClick={() => setSmallDismissed(true)} className="mt-4 rounded-md px-3 py-1.5 text-[12.5px] font-medium" style={{ background: C.accent, color: '#06222A' }}>Continue anyway</button>
        </div>
      </div>
    );
  }

  const leftInline = !narrow && s.leftOpen;
  const leftDrawer = narrow && s.leftOpen;
  const rightDrawer = compact && s.rightOpen;

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden font-geist text-[13px]" style={{ background: C.bg, color: C.fg }}>
        {dragging && <DropOverlay />}
        <TopBar onPalette={() => setPalette(true)} onToggleLeft={toggleLeft} onToggleRight={toggleRight} />
        <div data-beta-notice className="shrink-0 border-b border-white/10 px-3 py-1 text-[11px] [&>[data-caveat]]:flex [&>[data-caveat]]:flex-wrap [&>[data-caveat]]:items-center [&>[data-caveat]]:gap-x-2 [&>[data-caveat]>button]:shrink-0 [&>[data-caveat]>div]:w-full [&>[data-caveat]>span]:min-w-0 [&>[data-caveat]>span]:flex-1">
          <Caveat tone="warn" summary={
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate" title={BETA_ACCURACY_CLAIM}>{BETA_BANNER_SHORT}</span>
              <a href={ACCURACY_URL} target="_blank" rel="noreferrer" className="shrink-0 underline">How accurate is it?</a>
            </span>
          }>
            {BETA_ACCURACY_CLAIM}
          </Caveat>
        </div>
        <div className="relative flex min-h-0 flex-1">
          <StageRail />
          {leftInline && <><div style={{ width: left }} className="shrink-0"><PartsTree /></div><Splitter width={left} setWidth={setLeft} min={200} max={420} /></>}
          <main className="relative flex min-w-0 flex-1 flex-col">
            {/* Render only the active stage: visited stages must unmount so
              their R3F viewports release GL contexts instead of lingering
              hidden with live contexts that steal probe and event targets. */}
            <div key={s.stage} className="min-h-0 flex-1 flex-col" style={{ display: 'flex' }}>
              {center[s.stage]}
            </div>
            <Onboarding />
          </main>
          {!compact && <>
            {s.rightOpen && <Splitter width={right} setWidth={setRight} min={270} max={480} invert />}
            {/* Always mounted while wide so width/opacity can animate; closed means zero width, inert and hidden from AT. */}
            <div ref={inspectorPanel} data-inspector-panel aria-hidden={s.rightOpen ? undefined : true} inert={!s.rightOpen}
              className="h-full shrink-0 overflow-hidden transition-[width,opacity] duration-[160ms] ease-out motion-reduce:transition-none"
              style={{ width: s.rightOpen ? right : 0, opacity: s.rightOpen ? 1 : 0 }}>
              <div style={{ width: right }} className="h-full">{inspector[s.stage]}</div>
            </div>
          </>}
          {leftDrawer && <PanelDrawer side="left" label="Parts panel" width={Math.min(left, 320)} onClose={toggleLeft}><PartsTree /></PanelDrawer>}
          {rightDrawer && <PanelDrawer side="right" label="Inspector" width={Math.min(right, 400)} onClose={toggleRight}>{inspector[s.stage]}</PanelDrawer>}
        </div>
        <StatusBar />
        <Palette open={palette} setOpen={setPalette} openShortcuts={() => setShortcuts(true)} />
        <Shortcuts open={shortcuts} setOpen={setShortcuts} />
        <AeroModelProvenanceDialog />
      </div>
    </Tooltip.Provider>
  );
}
