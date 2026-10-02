import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Command } from 'cmdk';
import { ContextMenu, Dialog, Slider, Tabs, Tooltip } from 'radix-ui';
import { Toaster, toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import {
  Search, Play, ChevronRight, ChevronDown, GitBranch, Users, Circle, AlertTriangle, CheckCircle2, XCircle, RotateCcw, PanelLeft, PanelRight,
  Eye, Scan, Grid3x3, Scissors, Ruler, Ghost, CircleDot, Undo2, Redo2, History, Keyboard, Command as CmdIcon, Layers, Flame, Activity,
  Cpu, Package, Umbrella, Crosshair, Copy, EyeOff, Focus, Box, CornerDownLeft, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { useCommitted, useDesignStore, useEngineering } from '../../shared/store';
import { MOTORS, massItems, motorById, type Design, type NoseShape } from '../../shared/model';
import { RocketModel } from '../../shared/Rocket3D';
import { Projector } from '../../shared/Anchors';
import { Sparkline } from '../../shared/charts';
import { cn, fmt, ft } from '../../shared/format';
import { STAGES, TREE, type Part, type Stage, StabilityStrip, PropulsionView, FlightView, VerifyView, MissionView, AeroView, RecoveryView, FabView } from '../console/Console';

/* Same family as A1, tightened: warmer graphite, one accent, amber reserved for "changed". */
const C = { bg: '#0B0C0E', panel: '#101215', raised: '#16191D', hover: 'rgba(255,255,255,0.035)', line: 'rgba(255,255,255,0.065)', fg: '#E7E9EC', muted: '#8B9199', dim: '#5E646D', faint: '#3D4249', accent: '#6EE7F7', changed: '#F5B544', ok: '#3DD68C', warn: '#F5B544', bad: '#F87185', cg: '#38BDF8', cp: '#FB7185' };
const STATE = { pass: C.ok, warn: C.warn, fail: C.bad } as const;

/* ───────────────────────── units + layout state ───────────────────────── */

type Units = 'mm' | 'in';
const useUi = create<{ units: Units; setUnits: (u: Units) => void; left: number; right: number; dock: number; setSize: (k: 'left' | 'right' | 'dock', v: number) => void }>((set) => {
  let saved: Partial<{ left: number; right: number; dock: number; units: Units }> = {};
  try { saved = JSON.parse(localStorage.getItem('astraea.refined') ?? '{}'); } catch { /* storage unavailable */ }
  const persist = (s: object) => { try { localStorage.setItem('astraea.refined', JSON.stringify(s)); } catch { /* ignore */ } };
  return {
    units: saved.units ?? 'mm', left: saved.left ?? 248, right: saved.right ?? 300, dock: saved.dock ?? 220,
    setUnits: (units) => set((s) => { persist({ ...s, units }); return { units }; }),
    setSize: (k, v) => set((s) => { const n = { ...s, [k]: v }; persist({ left: n.left, right: n.right, dock: n.dock, units: n.units }); return { [k]: v }; })
  };
});
const len = (m: number, u: Units, digits?: number) => (u === 'mm' ? `${fmt(m * 1000, digits ?? 0)}` : `${(m * 39.3701).toFixed(digits ?? 2)}`);

type ViewMode = 'solid' | 'xray' | 'wire';
type Preset = 'iso' | 'side' | 'top' | 'aft';

export default function Refined() {
  const eng = useEngineering();
  const [stage, setStage] = useState<Stage>('airframe');
  const [part, setPart] = useState<Part>('fins');
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [running, setRunning] = useState(0);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [dockTab, setDockTab] = useState('mass');
  const commit = useDesignStore((s) => s.commitSim);
  const undo = useDesignStore((s) => s.undo);
  const redo = useDesignStore((s) => s.redo);

  const run = () => {
    if (running) return;
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 1200);
      setRunning(p || 0.01);
      if (p < 1) requestAnimationFrame(tick);
      else { setRunning(0); commit(); toast.success('Simulation committed', { description: `Apogee ${fmt(ft(eng.r.apogee))} ft · M ${eng.r.machMax.toFixed(2)} · ghost cleared` }); }
    };
    requestAnimationFrame(tick);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); run(); return; }
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (typing || mod) return;
      if (e.key === '?') setShortcuts(true);
      if (e.key === '[') setLeftOpen((v) => !v);
      if (e.key === ']') setRightOpen((v) => !v);
      const s = STAGES.find((x) => x.key === e.key);
      if (s) setStage(s.id);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });
  useEffect(() => { if (innerWidth < 1100) setLeftOpen(false); if (innerWidth < 820) setRightOpen(false); }, []);

  const left = useUi((s) => s.left), right = useUi((s) => s.right);

  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="flex h-full flex-col overflow-hidden font-geist text-[13px]" style={{ background: C.bg, color: C.fg }}>
        <TopBar onPalette={() => setPalette(true)} onRun={run} running={running} leftOpen={leftOpen} rightOpen={rightOpen} setLeftOpen={setLeftOpen} setRightOpen={setRightOpen} onHistory={() => { setStage('airframe'); setDockTab('history'); }} />
        <div className="flex min-h-0 flex-1">
          <StageRail stage={stage} setStage={setStage} />
          {leftOpen && <><div style={{ width: left }} className="shrink-0"><Outline part={part} setPart={(p) => { setPart(p); if (stage !== 'airframe') setStage('airframe'); }} /></div><Splitter axis="x" k="left" min={200} max={420} /></>}
          <main className="flex min-w-0 flex-1 flex-col">
            <AnimatePresence mode="wait">
              <motion.div key={stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="flex min-h-0 flex-1 flex-col">
                {stage === 'airframe' ? <Airframe part={part} setPart={setPart} dockTab={dockTab} setDockTab={setDockTab} /> : (
                  <div className="flex min-h-0 flex-1 flex-col">
                    {stage === 'propulsion' && <PropulsionView />}
                    {stage === 'flight' && <FlightView />}
                    {stage === 'verify' && <VerifyView />}
                    {stage === 'mission' && <MissionView />}
                    {stage === 'aero' && <AeroView />}
                    {stage === 'recovery' && <RecoveryView />}
                    {stage === 'fab' && <FabView />}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
          {rightOpen && <><Splitter axis="x" k="right" min={260} max={460} invert /><div style={{ width: right }} className="shrink-0"><Inspector part={part} /></div></>}
        </div>
        <StatusRail />
        <Palette open={palette} setOpen={setPalette} setStage={setStage} setPart={setPart} run={run} openShortcuts={() => setShortcuts(true)} />
        <Shortcuts open={shortcuts} setOpen={setShortcuts} />
        <Toaster theme="dark" position="bottom-right" offset={44} toastOptions={{ style: { background: C.raised, border: `1px solid ${C.line}`, color: C.fg, fontFamily: 'Geist' } }} />
      </div>
    </Tooltip.Provider>
  );
}

/* ───────────────────────── primitives ───────────────────────── */

function Splitter({ axis, k, min, max, invert }: { axis: 'x' | 'y'; k: 'left' | 'right' | 'dock'; min: number; max: number; invert?: boolean }) {
  const size = useUi((s) => s[k]);
  const setSize = useUi((s) => s.setSize);
  const start = useRef<{ p: number; v: number } | null>(null);
  const [hot, setHot] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuenow={size}
      tabIndex={0}
      onKeyDown={(e) => { const step = (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 16 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -16 : 0) * (invert ? -1 : 1); if (step) setSize(k, Math.min(max, Math.max(min, size + step))); }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { p: axis === 'x' ? e.clientX : e.clientY, v: size }; setHot(true); }}
      onPointerMove={(e) => { if (!start.current) return; const d = (axis === 'x' ? e.clientX : e.clientY) - start.current.p; setSize(k, Math.min(max, Math.max(min, start.current.v + (invert ? -d : d)))); }}
      onPointerUp={() => { start.current = null; setHot(false); }}
      onDoubleClick={() => setSize(k, k === 'left' ? 248 : k === 'right' ? 300 : 220)}
      className={cn('group relative z-10 shrink-0 outline-none', axis === 'x' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize')}
      style={{ background: C.line }}
    >
      <span className={cn('absolute transition-colors group-hover:bg-[#6EE7F7]/50 group-focus-visible:bg-[#6EE7F7]/60', axis === 'x' ? '-inset-x-1 inset-y-0' : '-inset-y-1 inset-x-0', hot && 'bg-[#6EE7F7]/70')} />
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border px-1 font-geist-mono text-[10px]" style={{ borderColor: C.line, background: 'rgba(255,255,255,0.03)', color: C.muted }}>{children}</kbd>;
}

function Tip({ label, k, children, side = 'bottom' }: { label: string; k?: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side={side} sideOffset={6} className="z-50 flex items-center gap-2 rounded-md border px-2 py-1 font-geist text-[11.5px] shadow-xl" style={{ background: '#1A1D22', borderColor: C.line, color: C.fg }}>{label}{k && <Kbd>{k}</Kbd>}</Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function IconBtn({ label, k, active, onClick, children, disabled }: { label: string; k?: string; active?: boolean; onClick?: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Tip label={label} k={k}>
      <button aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} className={cn('grid size-7 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[#6EE7F7]/50 focus-visible:outline-none disabled:opacity-30', active ? 'bg-white/[0.09] text-[#E7E9EC]' : 'text-[#7A808A] hover:bg-white/[0.04] hover:text-[#C9CDD3]')}>{children}</button>
    </Tip>
  );
}

/* ───────────────────────── chrome ───────────────────────── */

function TopBar({ onPalette, onRun, running, leftOpen, rightOpen, setLeftOpen, setRightOpen, onHistory }: { onPalette: () => void; onRun: () => void; running: number; leftOpen: boolean; rightOpen: boolean; setLeftOpen: (b: boolean) => void; setRightOpen: (b: boolean) => void; onHistory: () => void }) {
  const { stale } = useEngineering();
  const name = useDesignStore((s) => s.design.name);
  const simRev = useDesignStore((s) => s.simRev);
  const changes = useChanges();
  const past = useDesignStore((s) => s.past.length), future = useDesignStore((s) => s.future.length);
  const undo = useDesignStore((s) => s.undo), redo = useDesignStore((s) => s.redo);
  return (
    <header className="relative flex h-11 shrink-0 items-center gap-1.5 border-b px-2.5" style={{ borderColor: C.line, background: C.panel }}>
      <div className="flex items-center gap-2 pr-1"><Logo /><span className="hidden font-medium tracking-tight sm:inline">Astraea</span></div>
      <IconBtn label="Toggle outline" k="[" active={leftOpen} onClick={() => setLeftOpen(!leftOpen)}><PanelLeft size={15} /></IconBtn>
      <nav className="hidden min-w-0 items-center gap-1.5 pl-1 text-[12.5px] md:flex" style={{ color: C.muted }}>
        <span className="truncate">SA Cup 2027</span><ChevronRight size={13} style={{ color: C.faint }} />
        <span className="truncate" style={{ color: C.fg }}>{name}</span>
        <span className="flex items-center gap-1 rounded border px-1.5 py-px font-geist-mono text-[10.5px]" style={{ borderColor: C.line }}><GitBranch size={10} /> main</span>
      </nav>
      <span className="mx-1 hidden h-4 w-px md:block" style={{ background: C.line }} />
      <IconBtn label="Undo" k="⌘Z" onClick={undo} disabled={!past}><Undo2 size={14} /></IconBtn>
      <IconBtn label="Redo" k="⇧⌘Z" onClick={redo} disabled={!future}><Redo2 size={14} /></IconBtn>
      {changes.length > 0 && (
        <button onClick={onHistory} className="hidden items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] lg:flex" style={{ borderColor: 'rgba(245,181,68,.3)', color: C.changed, background: 'rgba(245,181,68,.06)' }}>
          <span className="size-1.5 rounded-full" style={{ background: C.changed }} />{changes.length} change{changes.length > 1 ? 's' : ''} since run r{simRev}
        </button>
      )}
      <div className="flex-1" />
      <button onClick={onPalette} className="flex h-7 w-full max-w-80 items-center gap-2 rounded-md border px-2 text-[12px] transition-colors hover:border-white/15" style={{ borderColor: C.line, background: C.bg, color: C.dim }}>
        <Search size={13} /><span className="truncate">Search, or type <span className="font-geist-mono" style={{ color: C.muted }}>span 120</span></span>
        <span className="ml-auto hidden gap-0.5 sm:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="flex-1" />
      <div className="hidden items-center -space-x-1.5 xl:flex">{['#F472B6', '#A78BFA', '#3DD68C'].map((c, i) => <span key={c} className="grid size-6 place-items-center rounded-full border-2 text-[9.5px] font-semibold text-black" style={{ background: c, borderColor: C.panel }}>{['MR', 'JT', 'AK'][i]}</span>)}</div>
      <button className="hidden h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] hover:bg-white/5 lg:flex" style={{ borderColor: C.line, color: '#C9CDD3' }}><Users size={13} /> Share</button>
      <button onClick={onRun} className="relative flex h-7 items-center gap-1.5 overflow-hidden rounded-md px-3 text-[12px] font-medium transition-[filter] hover:brightness-110" style={{ background: stale ? C.accent : 'rgba(110,231,247,.12)', color: stale ? C.bg : C.accent }}>
        {running > 0 && <span className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${running * 100}%` }} />}
        <Play size={12} fill="currentColor" className="relative" />
        <span className="relative hidden sm:inline">{running ? `Running ${Math.round(running * 100)}%` : stale ? 'Run simulation' : 'Up to date'}</span>
        <span className="relative hidden opacity-60 xl:inline">⌘↵</span>
      </button>
      <IconBtn label="Toggle inspector" k="]" active={rightOpen} onClick={() => setRightOpen(!rightOpen)}><PanelRight size={15} /></IconBtn>
      {running > 0 && <div className="absolute bottom-0 left-0 h-px" style={{ background: C.accent, width: `${running * 100}%` }} />}
    </header>
  );
}

function Logo() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden><path d="M12 2.5 L15.5 14 L12 12.2 L8.5 14 Z" fill={C.accent} /><path d="M5 19.5 Q12 13 19 19.5" stroke={C.fg} strokeWidth="1.6" fill="none" strokeLinecap="round" /><circle cx="12" cy="17" r="1.2" fill={C.fg} /></svg>;
}

const SHORT: Record<Stage, string> = { mission: 'Mission', airframe: 'Airframe', propulsion: 'Motor', aero: 'Aero', flight: 'Flight', recovery: 'Recovery', verify: 'Verify', fab: 'Build' };

function StageRail({ stage, setStage }: { stage: Stage; setStage: (s: Stage) => void }) {
  const { gates, stale } = useEngineering();
  const verify = gates.some((g) => g.state === 'fail') ? 'fail' : gates.some((g) => g.state === 'warn') ? 'warn' : 'pass';
  const badge: Partial<Record<Stage, string>> = { verify: STATE[verify], flight: stale ? C.changed : undefined, recovery: gates.find((g) => g.id === 'main')!.state !== 'pass' ? C.warn : undefined };
  return (
    <nav className="flex w-[60px] shrink-0 flex-col items-center gap-0.5 border-r py-2" style={{ borderColor: C.line, background: C.panel }} aria-label="Pipeline stages">
      {STAGES.map((s) => (
        <Tip key={s.id} label={s.label} k={s.key} side="right">
          <button onClick={() => setStage(s.id)} aria-label={s.label} aria-current={stage === s.id} className={cn('relative flex w-[52px] flex-col items-center gap-0.5 rounded-md py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-[#6EE7F7]/50 focus-visible:outline-none', stage === s.id ? 'bg-white/[0.07] text-[#E7E9EC]' : 'text-[#5E646D] hover:bg-white/[0.035] hover:text-[#C9CDD3]')}>
            {stage === s.id && <motion.span layoutId="ref-stage" className="absolute top-2 bottom-2 -left-1 w-[2px] rounded-full" style={{ background: C.accent }} />}
            <s.icon size={16} strokeWidth={1.6} />
            <span className="text-[9.5px] leading-none">{SHORT[s.id]}</span>
            {badge[s.id] && <span className="absolute top-1 right-2 size-1.5 rounded-full" style={{ background: badge[s.id] }} />}
          </button>
        </Tip>
      ))}
      <div className="flex-1" />
    </nav>
  );
}

function Outline({ part, setPart }: { part: Part; setPart: (p: Part) => void }) {
  const d = useDesignStore((s) => s.design);
  const items = useMemo(() => massItems(d), [d]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({ recovery: true });
  const massOf: Partial<Record<Part, number>> = { nose: items[0].mass, payload: items[1].mass, recovery: items[2].mass + items[4].mass, avionics: items[3].mass, body: items[5].mass, fins: items[6].mass, motor: items[7].mass + items[8].mass };
  const total = items.reduce((s, i) => s + i.mass, 0);
  const tree = TREE.filter((n) => !q || n.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <aside className="flex h-full flex-col" style={{ background: C.panel }}>
      <div className="flex h-9 items-center justify-between px-3"><span className="text-[11px] font-medium tracking-[0.08em] uppercase" style={{ color: C.dim }}>Assembly</span><span className="font-geist-mono text-[10.5px]" style={{ color: C.dim }}>{total.toFixed(2)} kg</span></div>
      <div className="px-2 pb-2">
        <label className="flex h-7 items-center gap-1.5 rounded-md border px-2" style={{ borderColor: C.line, background: C.bg }}>
          <Search size={12} style={{ color: C.dim }} /><input id="outline-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter parts" className="w-full bg-transparent text-[12px] outline-none placeholder:text-[#4A5058]" />
        </label>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto px-1.5 pb-3">
        <div className="flex items-center gap-1.5 px-2 py-1 text-[12.5px]" style={{ color: '#C9CDD3' }}><Layers size={13} style={{ color: C.dim }} /> {d.name}</div>
        {tree.map((n) => (
          <div key={n.id}>
            <button onClick={() => { setPart(n.id); if (n.children) setOpen((o) => ({ ...o, [n.id]: !o[n.id] })); }} className={cn('group flex h-7 w-full items-center gap-1.5 rounded-md pr-2 pl-3 text-left text-[12.5px] transition-colors focus-visible:ring-1 focus-visible:ring-[#6EE7F7]/50 focus-visible:outline-none', part === n.id ? 'bg-[#6EE7F7]/[0.08] text-[#E7E9EC]' : 'text-[#9AA0A8] hover:bg-white/[0.03]')}>
              <span className="w-3" style={{ color: C.faint }}>{n.children ? (open[n.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
              <n.icon size={13} style={{ color: part === n.id ? C.accent : C.dim }} />
              <span className="flex-1 truncate">{n.label}</span>
              <span className="relative h-1 w-10 overflow-hidden rounded-full bg-white/[0.05]"><span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((massOf[n.id] ?? 0) / total) * 100}%`, background: part === n.id ? C.accent : '#4A5058' }} /></span>
              <span className="tnum w-12 text-right font-geist-mono text-[10.5px]" style={{ color: C.dim }}>{fmt((massOf[n.id] ?? 0) * 1000)}</span>
            </button>
            {n.children && open[n.id] && n.children.map((c) => <div key={c.label} className="flex h-6 items-center gap-1.5 pl-11 text-[12px]" style={{ color: '#6B717A' }}><Circle size={5} fill="currentColor" /> {c.label}</div>)}
          </div>
        ))}
      </div>
      <div className="border-t px-3 py-2.5" style={{ borderColor: C.line }}>
        <div className="mb-1.5 text-[11px] font-medium tracking-[0.08em] uppercase" style={{ color: C.dim }}>Activity</div>
        {[['MR', '#F472B6', 'swept fins 130 mm', '4m'], ['JT', '#A78BFA', 'imported Ozark ARTS log', '1h']].map(([who, c, what, when]) => (
          <div key={what} className="flex items-center gap-2 py-0.5 text-[11.5px]" style={{ color: C.muted }}><span className="size-1.5 shrink-0 rounded-full" style={{ background: c }} /><span className="flex-1 truncate"><b className="font-medium text-[#C9CDD3]">{who}</b> {what}</span><span style={{ color: C.dim }}>{when}</span></div>
        ))}
      </div>
    </aside>
  );
}

/* ───────────────────────── deltas ───────────────────────── */

function useChanges() {
  const d = useDesignStore((s) => s.design);
  const base = useDesignStore((s) => s.simDesign);
  return useMemo(() => (Object.keys(d) as (keyof Design)[]).filter((k) => d[k] !== base[k]), [d, base]);
}

function Delta({ now, before, digits = 1, pct, invertGood, unit = '' }: { now: number; before: number; digits?: number; pct?: boolean; invertGood?: boolean; unit?: string }) {
  const diff = now - before;
  if (Math.abs(diff) < 10 ** -(digits + 1)) return null;
  const v = pct ? (diff / Math.abs(before || 1)) * 100 : diff;
  if (Number(Math.abs(v).toFixed(digits)) === 0) return null;
  const up = diff > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className="inline-flex items-center gap-px font-geist-mono text-[10.5px]" style={{ color: invertGood === undefined ? C.changed : (up !== invertGood ? C.ok : C.bad) }}><Icon size={11} />{Math.abs(v).toFixed(digits)}{pct ? '%' : unit}</span>;
}

function StatusRail() {
  const { a, r, stale, gates } = useEngineering();
  const base = useCommitted();
  const units = useUi((s) => s.units), setUnits = useUi((s) => s.setUnits);
  const g = Object.fromEntries(gates.map((x) => [x.id, x]));
  const Icon = ({ s }: { s: 'pass' | 'warn' | 'fail' }) => { const I = s === 'pass' ? CheckCircle2 : s === 'warn' ? AlertTriangle : XCircle; return <I size={11} style={{ color: STATE[s] }} />; };
  const items: [string, string, 'pass' | 'warn' | 'fail', ReactNode][] = [
    ['Stability', `${a.stability.toFixed(2)} cal`, g.stab.state, <Delta now={a.stability} before={base.a.stability} digits={2} unit="" />],
    ['Apogee', `${fmt(ft(r.apogee))} ft`, g.apogee.state, <Delta now={r.apogee} before={base.r.apogee} pct />],
    ['Rail exit', `${r.railExit.toFixed(1)} m/s`, g.rail.state, <Delta now={r.railExit} before={base.r.railExit} digits={1} invertGood={false} />],
    ['Mach', r.machMax.toFixed(2), g.mach.state, <Delta now={r.machMax} before={base.r.machMax} digits={2} />],
    ['Descent', `${r.descentMain.toFixed(1)} m/s`, g.main.state, <Delta now={r.descentMain} before={base.r.descentMain} digits={1} invertGood={true} />]
  ];
  return (
    <footer className="no-scrollbar flex h-7 shrink-0 items-center gap-4 overflow-x-auto border-t px-3 font-geist-mono text-[11px] whitespace-nowrap" style={{ borderColor: C.line, background: C.panel, color: C.muted }}>
      <span className="flex items-center gap-1.5"><Circle size={7} fill={stale ? C.changed : C.ok} stroke="none" />{stale ? 'Preview · not committed' : 'Committed'}</span>
      <span className="h-3 w-px bg-white/10" />
      {items.map(([k, v, s, delta]) => (
        <span key={k} className="flex items-center gap-1.5"><Icon s={s} /><span style={{ color: C.dim }}>{k}</span><span className="tnum" style={{ color: '#C9CDD3' }}>{v}</span>{stale && delta}</span>
      ))}
      <span className="flex-1" />
      <button onClick={() => setUnits(units === 'mm' ? 'in' : 'mm')} className="rounded border px-1.5 py-px hover:bg-white/5" style={{ borderColor: C.line }} aria-label="Toggle length units">{units === 'mm' ? 'mm · kg' : 'in · kg'}</button>
      <span className="hidden lg:inline" style={{ color: C.dim }}>Barrowman + DP5(4)</span>
      <span className="hidden items-center gap-1 lg:flex" style={{ color: C.dim }}><Keyboard size={11} /> ?</span>
    </footer>
  );
}

/* ───────────────────────── airframe workspace ───────────────────────── */

const PART_MESH: Record<Part, string[]> = { nose: ['nose'], body: ['body', 'band'], fins: ['fins'], motor: ['motor'], payload: ['body', 'band'], recovery: ['body', 'band'], avionics: ['body', 'band'] };
const ALL_MESH = ['nose', 'body', 'band', 'fins', 'motor'];

function Airframe({ part, setPart, dockTab, setDockTab }: { part: Part; setPart: (p: Part) => void; dockTab: string; setDockTab: (t: string) => void }) {
  const { design: d, a, stale } = useEngineering();
  const [view, setView] = useState<ViewMode>('solid');
  const [section, setSection] = useState(false);
  const [dims, setDims] = useState(true);
  const [ghost, setGhost] = useState(true);
  const [markers, setMarkers] = useState(true);
  const [hidden, setHidden] = useState<string[]>([]);
  const [preset, setPreset] = useState<{ p: Preset; n: number }>({ p: 'iso', n: 0 });
  const dock = useUi((s) => s.dock);
  const changes = useChanges();
  const go = (p: Preset) => setPreset((s) => ({ p, n: s.n + 1 }));

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className="relative min-h-0 flex-1">
            <Suspense fallback={null}>
              <Viewport part={part} setPart={setPart} view={view} section={section} dims={dims} ghost={ghost && stale} markers={markers} hidden={hidden} preset={preset} />
            </Suspense>
            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
              <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border p-0.5 backdrop-blur" style={{ borderColor: C.line, background: 'rgba(16,18,21,.82)' }}>
                <IconBtn label="Solid" k="S" active={view === 'solid'} onClick={() => setView('solid')}><Eye size={14} /></IconBtn>
                <IconBtn label="X-ray" k="X" active={view === 'xray'} onClick={() => setView('xray')}><Scan size={14} /></IconBtn>
                <IconBtn label="Wireframe" k="W" active={view === 'wire'} onClick={() => setView('wire')}><Grid3x3 size={14} /></IconBtn>
                <span className="mx-0.5 h-4 w-px" style={{ background: C.line }} />
                <IconBtn label="Section view" active={section} onClick={() => setSection(!section)}><Scissors size={14} /></IconBtn>
                <IconBtn label="Dimensions" active={dims} onClick={() => setDims(!dims)}><Ruler size={14} /></IconBtn>
                <IconBtn label="CG / CP markers" active={markers} onClick={() => setMarkers(!markers)}><CircleDot size={14} /></IconBtn>
                <IconBtn label="Ghost of last committed run" active={ghost} onClick={() => setGhost(!ghost)}><Ghost size={14} /></IconBtn>
                <span className="mx-0.5 h-4 w-px" style={{ background: C.line }} />
                {(['iso', 'side', 'top', 'aft'] as Preset[]).map((p) => (
                  <button key={p} onClick={() => go(p)} className="h-7 rounded-md px-2 font-geist-mono text-[10.5px] uppercase hover:bg-white/[0.05]" style={{ color: preset.p === p ? C.fg : C.dim }}>{p}</button>
                ))}
              </div>
              <StabilityHud />
            </div>
            {hidden.length > 0 && (
              <button onClick={() => setHidden([])} className="absolute top-14 left-3 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px]" style={{ borderColor: C.line, background: 'rgba(16,18,21,.85)', color: C.muted }}><Focus size={12} /> Isolated · show all</button>
            )}
            {stale && ghost && changes.length > 0 && (
              <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 font-geist-mono text-[10.5px]" style={{ color: C.changed }}>
                <span className="h-px w-5 border-t border-dashed" style={{ borderColor: C.changed }} /> ghost = committed run · {changes.length} field{changes.length > 1 ? 's' : ''} changed
              </div>
            )}
            {!stale && <div className="pointer-events-none absolute bottom-3 left-3 font-geist-mono text-[10.5px]" style={{ color: C.faint }}>L {len(a.length, useUi.getState().units)} · Ø {len(d.diameter, useUi.getState().units)} {useUi.getState().units} · right-click for options</div>}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="z-50 min-w-56 rounded-lg border p-1 font-geist text-[12.5px] shadow-2xl" style={{ background: '#16191D', borderColor: C.line, color: C.fg }}>
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-white/[0.07]"><Crosshair size={13} /> Select <ChevronRight size={12} className="ml-auto" /></ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="z-50 min-w-44 rounded-lg border p-1 font-geist text-[12.5px] shadow-2xl" style={{ background: '#16191D', borderColor: C.line, color: C.fg }}>
                  {TREE.map((n) => <ContextMenu.Item key={n.id} onSelect={() => setPart(n.id)} className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-white/[0.07]"><n.icon size={13} /> {n.label}</ContextMenu.Item>)}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
            <CtxItem icon={Focus} onSelect={() => setHidden(ALL_MESH.filter((m) => !PART_MESH[part].includes(m)))}>Isolate selection</CtxItem>
            <CtxItem icon={EyeOff} onSelect={() => setHidden([...hidden, ...PART_MESH[part]])}>Hide selection</CtxItem>
            <CtxItem icon={Eye} onSelect={() => setHidden([])}>Show all</CtxItem>
            <ContextMenu.Separator className="my-1 h-px" style={{ background: C.line }} />
            <CtxItem icon={Scissors} onSelect={() => setSection(!section)}>{section ? 'Exit section view' : 'Section view'}</CtxItem>
            <CtxItem icon={Ruler} onSelect={() => setDims(!dims)}>{dims ? 'Hide dimensions' : 'Show dimensions'}</CtxItem>
            <CtxItem icon={Box} onSelect={() => go('iso')}>Reset view</CtxItem>
            <ContextMenu.Separator className="my-1 h-px" style={{ background: C.line }} />
            <CtxItem icon={Copy} onSelect={() => { const txt = JSON.stringify(d, null, 2); navigator.clipboard?.writeText(txt).then(() => toast('Design parameters copied as JSON'), () => toast('Clipboard unavailable here')); }}>Copy parameters</CtxItem>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <Splitter axis="y" k="dock" min={140} max={460} invert />
      <Tabs.Root value={dockTab} onValueChange={setDockTab} className="flex shrink-0 flex-col" style={{ height: dock, background: C.panel }}>
        <Tabs.List className="flex h-9 items-center gap-0.5 border-b px-2" style={{ borderColor: C.line }}>
          {[['mass', 'Mass budget'], ['stab', 'Stability'], ['history', 'History'], ['log', 'Solver log']].map(([v, l]) => (
            <Tabs.Trigger key={v} value={v} className="relative h-9 px-2.5 text-[12px] text-[#6B717A] outline-none hover:text-[#C9CDD3] focus-visible:text-white data-[state=active]:text-[#E7E9EC] data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:-bottom-px data-[state=active]:after:h-px data-[state=active]:after:bg-[#6EE7F7]">
              {l}{v === 'history' && useDesignStore.getState().past.length > 0 && <span className="ml-1.5 rounded px-1 font-geist-mono text-[10px]" style={{ background: 'rgba(255,255,255,.06)' }}>{useDesignStore.getState().past.length}</span>}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="mass" className="thin-scroll min-h-0 flex-1 overflow-auto px-3 py-2"><MassTable /></Tabs.Content>
        <Tabs.Content value="stab" className="min-h-0 flex-1 overflow-auto px-4 py-3"><StabilityStrip /></Tabs.Content>
        <Tabs.Content value="history" className="thin-scroll min-h-0 flex-1 overflow-auto"><HistoryList /></Tabs.Content>
        <Tabs.Content value="log" className="thin-scroll min-h-0 flex-1 overflow-auto px-3 py-2 font-geist-mono text-[11px] leading-5" style={{ color: '#6B717A' }}>
          {[['info', `mass rollup · 9 components · ${a.massLiftoff.toFixed(3)} kg`], ['info', `barrowman · CNα fins ${a.finCNa.toFixed(3)} · cp ${(a.cp * 1000).toFixed(1)} mm`], ['warn', 'transonic regime reached · subsonic CNα extrapolated above M 0.8'], ['info', 'dp5(4) · rtol 1e-6 · 1 842 steps · 38 ms']].map(([lvl, msg], i) => (
            <div key={i}><span style={{ color: C.faint }}>02:14:0{i}</span> <span style={{ color: lvl === 'warn' ? C.warn : C.dim }}>{lvl.padEnd(4)}</span> {msg}</div>
          ))}
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}

function CtxItem({ icon: I, onSelect, children }: { icon: typeof Box; onSelect: () => void; children: ReactNode }) {
  return <ContextMenu.Item onSelect={onSelect} className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-white/[0.07]"><I size={13} style={{ color: C.muted }} /> {children}</ContextMenu.Item>;
}

function StabilityHud() {
  const { a } = useEngineering();
  const base = useCommitted();
  const units = useUi((s) => s.units);
  const ok = a.stability >= 1.5 && a.stability <= 3;
  const pos = Math.min(100, Math.max(0, (a.stability / 5) * 100));
  return (
    <div className="pointer-events-auto w-60 rounded-lg border px-3 py-2.5 font-geist-mono text-[11px] backdrop-blur" style={{ borderColor: C.line, background: 'rgba(16,18,21,.82)' }}>
      <div className="flex items-baseline justify-between"><span className="whitespace-nowrap" style={{ color: C.dim }}>Static margin</span><span className="flex items-center gap-1.5"><Delta now={a.stability} before={base.a.stability} digits={2} /><span className="text-[14px]" style={{ color: ok ? C.fg : C.warn }}>{a.stability.toFixed(2)}</span><span style={{ color: C.dim }}>cal</span></span></div>
      <div className="relative mt-2 h-1.5 rounded-full bg-white/[0.06]">
        <span className="absolute inset-y-0 rounded-full" style={{ left: '30%', width: '30%', background: 'rgba(61,214,140,.25)' }} />
        <motion.span className="absolute -top-[3px] h-3 w-[3px] -translate-x-1/2 rounded-full" animate={{ left: `${pos}%` }} style={{ background: ok ? C.fg : C.warn }} />
      </div>
      <div className="mt-1 flex justify-between text-[9.5px]" style={{ color: C.faint }}><span>0</span><span>1.5</span><span>3.0</span><span>5 cal</span></div>
      <div className="mt-2 grid grid-cols-2 gap-x-2 border-t pt-1.5" style={{ borderColor: C.line }}>
        <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: C.cg }} /><span style={{ color: C.dim }}>CG</span> <span className="ml-auto">{len(a.cg, units)}</span></span>
        <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: C.cp }} /><span style={{ color: C.dim }}>CP</span> <span className="ml-auto">{len(a.cp, units)}</span></span>
      </div>
    </div>
  );
}

function CameraRig({ preset, L }: { preset: { p: Preset; n: number }; L: number }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: { target: THREE.Vector3; update: () => void } | null };
  const goal = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    const dist = Math.max(3.2, L * 1.45);
    const table: Record<Preset, [number, number, number]> = { iso: [dist * 0.15, dist * 0.32, dist], side: [0, 0.15, dist], top: [0, dist, 0.001], aft: [-dist, 0.15, 0.001] };
    goal.current = new THREE.Vector3(...table[preset.p]);
  }, [preset, L]);
  useFrame(() => {
    if (!goal.current) return;
    camera.position.lerp(goal.current, 0.14);
    controls?.target.lerp(new THREE.Vector3(0, 0.15, 0), 0.14);
    controls?.update();
    if (camera.position.distanceTo(goal.current) < 0.005) goal.current = null;
  });
  return null;
}

function Viewport({ part, setPart, view, section, dims, ghost, markers, hidden, preset }: { part: Part; setPart: (p: Part) => void; view: ViewMode; section: boolean; dims: boolean; ghost: boolean; markers: boolean; hidden: string[]; preset: { p: Preset; n: number } }) {
  const { design: d, a } = useEngineering();
  const base = useCommitted();
  const units = useUi((s) => s.units);
  const L = a.length;
  const clip = useMemo(() => (section ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)] : undefined), [section]);
  const grp = useRef<THREE.Group>(null);
  const t1 = useRef<HTMLSpanElement>(null), t2 = useRef<HTMLSpanElement>(null), t3 = useRef<HTMLSpanElement>(null);
  const R = d.diameter / 2;
  return (
    <>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0.5, 1.1, 3.6], fov: 34 }} gl={{ antialias: true }} onCreated={({ gl }) => { gl.localClippingEnabled = true; }}>
        <color attach="background" args={[C.bg]} />
        <fog attach="fog" args={[C.bg, 5, 11]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 2]} intensity={1.6} castShadow />
        <directionalLight position={[-3, 1, -2]} intensity={0.5} color={C.accent} />
        <group ref={grp} rotation={[0, 0, -Math.PI / 2]} position={[-L / 2, 0.15, 0]} onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          const fromNose = L - (e.point.x + L / 2);
          const off = Math.hypot(e.point.y - 0.15, e.point.z);
          setPart(fromNose < d.noseLength ? 'nose' : off > R * 1.08 ? 'fins' : fromNose > L - 0.08 ? 'motor' : 'body');
        }}>
          <RocketModel d={d} cg={a.cg} cp={a.cp} showMarkers={markers} look={{ body: '#D5D9DE', nose: '#E6E9EC', fins: '#2B3037', accent: C.accent, wireframe: view === 'wire', opacity: view === 'xray' ? 0.22 : 1, roughness: 0.38, metalness: 0.2, highlight: part === 'payload' || part === 'avionics' || part === 'recovery' ? 'body' : part, highlightColor: C.accent, hide: hidden, clip, edges: view === 'solid' ? undefined : undefined }} />
          {ghost && <group scale={[1.002, 1.002, 1.002]}><RocketModel d={base.design} look={{ body: C.changed, nose: C.changed, fins: C.changed, accent: C.changed, opacity: 0.05, edges: C.changed, hide: ['band', 'motor'] }} /></group>}
          {dims && (
            <group>
              <Line points={[[-R - 0.12, 0, 0], [-R - 0.12, L, 0]]} color="#5E646D" lineWidth={1} dashed dashSize={0.02} gapSize={0.015} />
              <Line points={[[-R - 0.16, 0, 0], [-R - 0.08, 0, 0]]} color="#5E646D" lineWidth={1} />
              <Line points={[[-R - 0.16, L, 0], [-R - 0.08, L, 0]]} color="#5E646D" lineWidth={1} />
              <Line points={[[R, -0.06, 0], [R + d.finSpan, -0.06, 0]]} color="#5E646D" lineWidth={1} />
            </group>
          )}
        </group>
        {dims && <Projector parent={grp} anchors={[{ local: [-R - 0.12, L / 2, 0], el: t1 }, { local: [0, d.noseLength + 0.05, R + 0.04], el: t2 }, { local: [R + d.finSpan / 2, -0.06, 0], el: t3 }]} />}
        <Grid position={[0, -0.14, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.6} cellColor="#191C21" sectionSize={0.5} sectionThickness={1} sectionColor="#24282E" fadeDistance={7} infiniteGrid />
        <OrbitControls makeDefault enableDamping target={[0, 0.15, 0]} minDistance={0.8} maxDistance={8} />
        <CameraRig preset={preset} L={L} />
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewcube color="#1A1D22" hoverColor="#24414A" textColor="#C9CDD3" strokeColor="#3D4249" opacity={0.95} faces={['AFT', 'NOSE', 'TOP', 'BTM', 'FRONT', 'BACK']} />
        </GizmoHelper>
      </Canvas>
      {dims && <>
        <span ref={t1} className="pointer-events-none absolute top-0 left-0"><DimTag>{len(L, units)} {units}</DimTag></span>
        <span ref={t2} className="pointer-events-none absolute top-0 left-0"><DimTag>Ø {len(d.diameter, units)}</DimTag></span>
        <span ref={t3} className="pointer-events-none absolute top-0 left-0"><DimTag>s {len(d.finSpan, units)}</DimTag></span>
      </>}
    </>
  );
}

function DimTag({ children }: { children: ReactNode }) {
  return <span className="inline-block -translate-x-1/2 -translate-y-1/2 rounded border px-1.5 py-px font-geist-mono text-[10.5px] whitespace-nowrap" style={{ background: 'rgba(11,12,14,.85)', borderColor: C.line, color: '#C9CDD3' }}>{children}</span>;
}

function MassTable() {
  const d = useDesignStore((s) => s.design);
  const base = useDesignStore((s) => s.simDesign);
  const items = useMemo(() => massItems(d), [d]);
  const before = useMemo(() => Object.fromEntries(massItems(base).map((i) => [i.id, i.mass])), [base]);
  const total = items.reduce((s, i) => s + i.mass, 0);
  const col = (g: string) => (g === 'Propulsion' ? '#FB923C' : g === 'Payload' || g === 'Avionics' ? '#A78BFA' : g === 'Recovery' ? C.ok : C.accent);
  return (
    <table className="w-full text-[12px]">
      <thead><tr className="text-left text-[10.5px]" style={{ color: C.dim }}><th className="pb-1 font-normal">Component</th><th className="pb-1 font-normal">Share</th><th className="pb-1 text-right font-normal">Mass</th><th className="w-16 pb-1 text-right font-normal">Δ run</th></tr></thead>
      <tbody>
        {[...items].sort((x, y) => y.mass - x.mass).map((i) => (
          <tr key={i.id}>
            <td className="w-44 py-1 pr-3" style={{ color: '#9AA0A8' }}><span className="mr-2 inline-block size-1.5 rounded-full" style={{ background: col(i.group) }} />{i.label}</td>
            <td className="py-1"><div className="h-1 rounded-full bg-white/[0.04]"><motion.div className="h-full rounded-full" animate={{ width: `${(i.mass / total) * 100}%` }} style={{ background: col(i.group), opacity: 0.75 }} /></div></td>
            <td className="tnum w-20 py-1 text-right font-geist-mono" style={{ color: '#C9CDD3' }}>{fmt(i.mass * 1000)} g</td>
            <td className="w-16 py-1 text-right"><Delta now={i.mass * 1000} before={(before[i.id] ?? i.mass) * 1000} digits={0} unit="g" /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoryList() {
  const past = useDesignStore((s) => s.past);
  const future = useDesignStore((s) => s.future);
  const jumpTo = useDesignStore((s) => s.jumpTo);
  const redo = useDesignStore((s) => s.redo);
  const ago = (t: number) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };
  if (!past.length && !future.length) return <div className="grid h-full place-items-center px-6 text-center text-[12px]" style={{ color: C.dim }}><span className="flex items-center gap-2"><History size={14} /> Edits appear here. ⌘Z undoes, click a row to jump back to it.</span></div>;
  return (
    <ol className="py-1 text-[12px]">
      {past.map((e, i) => (
        <li key={`p${i}`}>
          <button onClick={() => jumpTo(i)} className="group flex h-7 w-full items-center gap-2.5 px-3 text-left hover:bg-white/[0.03]">
            <span className="w-5 text-right font-geist-mono text-[10.5px]" style={{ color: C.faint }}>{i + 1}</span>
            <span className="size-1.5 rounded-full" style={{ background: C.accent }} />
            <span className="flex-1 truncate" style={{ color: '#C9CDD3' }}>{e.label}</span>
            <span className="font-geist-mono text-[10.5px] opacity-0 group-hover:opacity-100" style={{ color: C.muted }}>revert to before</span>
            <span className="w-14 text-right font-geist-mono text-[10.5px]" style={{ color: C.dim }}>{ago(e.at)}</span>
          </button>
        </li>
      ))}
      <li className="flex h-7 items-center gap-2.5 px-3 font-geist-mono text-[10.5px]" style={{ color: C.accent }}><span className="w-5" /><CornerDownLeft size={11} /> current state</li>
      {future.map((e, i) => (
        <li key={`f${i}`}><button onClick={() => { for (let k = 0; k <= i; k++) redo(); }} className="flex h-7 w-full items-center gap-2.5 px-3 text-left opacity-45 hover:bg-white/[0.03] hover:opacity-80"><span className="w-5" /><span className="size-1.5 rounded-full border" style={{ borderColor: C.dim }} /><span className="flex-1 truncate">{e.label}</span><span className="font-geist-mono text-[10.5px]">redo</span></button></li>
      ))}
    </ol>
  );
}

/* ───────────────────────── inspector ───────────────────────── */

type Dim = 'len' | 'mass' | 'count' | 'deg' | 'mps' | 'm' | 'ft';

function Field({ label, k, min, max, step, dim, digits, hint, warn }: { label: string; k: keyof Design; min: number; max: number; step: number; dim: Dim; digits?: number; hint?: string; warn?: string | null }) {
  const value = useDesignStore((s) => s.design[k]) as number;
  const base = useDesignStore((s) => s.simDesign[k]) as number;
  const set = useDesignStore((s) => s.set);
  const units = useUi((s) => s.units);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const drag = useRef<{ x: number; v: number } | null>(null);
  const conv = dim === 'len' ? (units === 'mm' ? { s: 1000, u: 'mm', dg: 0 } : { s: 39.3701, u: 'in', dg: 2 }) : dim === 'mass' ? { s: 1, u: 'kg', dg: 2 } : dim === 'count' ? { s: 1, u: '', dg: 0 } : dim === 'deg' ? { s: 1, u: '°', dg: 1 } : dim === 'mps' ? { s: 1, u: 'm/s', dg: 1 } : dim === 'ft' ? { s: 3.28084, u: 'ft', dg: 0 } : { s: 1, u: 'm', dg: 2 };
  const dg = digits ?? conv.dg;
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const changed = Math.abs(value - base) > step / 4;
  const commit = (s: string) => { const n = parseFloat(s); if (!isNaN(n)) set({ [k]: clamp(n / conv.s) } as Partial<Design>); setEditing(false); };
  return (
    <div className="group py-1.5">
      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2">
        <Tip label={hint ?? 'Drag to scrub · Shift for fine · ↑↓ in field'} side="left">
          <span
            className="flex cursor-ew-resize items-center gap-1.5 truncate text-[12px] select-none"
            style={{ color: C.muted }}
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, v: value }; }}
            onPointerMove={(e) => { if (drag.current) set({ [k]: clamp(drag.current.v + (e.clientX - drag.current.x) * step * (e.shiftKey ? 0.2 : 1)) } as Partial<Design>); }}
            onPointerUp={() => (drag.current = null)}
          >
            {changed && <span className="size-1.5 shrink-0 rounded-full" style={{ background: C.changed }} aria-label="Changed since last run" />}
            {label}
          </span>
        </Tip>
        <span className="flex items-center gap-1">
          {changed && (
            <Tip label={`Revert to ${(base * conv.s).toFixed(dg)} ${conv.u}`} side="left">
              <button onClick={() => set({ [k]: base } as Partial<Design>, `Revert ${label.toLowerCase()}`)} aria-label={`Revert ${label}`} className="grid size-5 place-items-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/5 focus-visible:opacity-100" style={{ color: C.changed }}><RotateCcw size={11} /></button>
            </Tip>
          )}
          {editing ? (
            <input autoFocus aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditing(false); if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const nv = clamp(value + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)); set({ [k]: nv } as Partial<Design>); setDraft((nv * conv.s).toFixed(dg)); } }}
              className="tnum h-6 w-24 rounded border px-1.5 text-right font-geist-mono text-[12px] outline-none" style={{ borderColor: 'rgba(110,231,247,.5)', background: C.bg, color: C.fg }} />
          ) : (
            <button onClick={() => { setDraft((value * conv.s).toFixed(dg)); setEditing(true); }} className="tnum h-6 w-24 rounded border border-transparent px-1.5 text-right font-geist-mono text-[12px] hover:border-white/10 hover:bg-white/[0.03] focus-visible:border-[#6EE7F7]/50 focus-visible:outline-none" style={{ color: changed ? C.changed : C.fg }}>
              {(value * conv.s).toFixed(dg)}<span className="ml-1" style={{ color: C.dim }}>{conv.u}</span>
            </button>
          )}
        </span>
      </div>
      <Slider.Root className="rs-root mt-1" value={[value]} min={min} max={max} step={step} onValueChange={([v]) => set({ [k]: v } as Partial<Design>)} aria-label={label}>
        <Slider.Track className="rs-track bg-white/[0.06]">
          <span className="absolute inset-y-0 w-px bg-[#F5B544]" style={{ left: `${((base - min) / (max - min)) * 100}%`, opacity: changed ? 0.9 : 0 }} />
          <Slider.Range className="rs-range" style={{ background: changed ? 'rgba(245,181,68,.7)' : 'rgba(110,231,247,.6)' }} />
        </Slider.Track>
        <Slider.Thumb className="rs-thumb border-2 bg-[#0B0C0E] outline-none focus-visible:shadow-[0_0_0_5px_rgba(110,231,247,0.25)]" style={{ borderColor: changed ? C.changed : C.accent }} />
      </Slider.Root>
      {warn && <div className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: C.warn }}><AlertTriangle size={11} /> {warn}</div>}
    </div>
  );
}

function Section({ title, children, right, defaultOpen = true }: { title: string; children: ReactNode; right?: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b" style={{ borderColor: C.line }}>
      <header className="flex h-9 items-center justify-between px-4">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[11px] font-medium tracking-[0.08em] uppercase outline-none focus-visible:text-white" style={{ color: C.dim }} aria-expanded={open}>{open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}{title}</button>
        {right}
      </header>
      {open && <div className="px-4 pb-3">{children}</div>}
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border p-0.5" style={{ borderColor: C.line, background: C.bg }}>
      {options.map(([v, l]) => <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn('flex-1 rounded px-2 py-1 text-[11.5px] transition-colors', value === v ? 'bg-white/[0.09] text-[#E7E9EC]' : 'text-[#7A808A] hover:text-[#C9CDD3]')}>{l}</button>)}
    </div>
  );
}

function Inspector({ part }: { part: Part }) {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  const reset = useDesignStore((s) => s.reset);
  const { a, r } = useEngineering();
  const changes = useChanges();
  const meta: Record<Part, { title: string; icon: typeof Box; group: string }> = {
    nose: { title: 'Nose cone', icon: TREE[0].icon, group: 'Airframe' }, body: { title: 'Body tube', icon: TREE[4].icon, group: 'Airframe' }, fins: { title: 'Fin set', icon: TREE[5].icon, group: 'Airframe' },
    motor: { title: 'Motor mount', icon: Flame, group: 'Propulsion' }, payload: { title: 'Payload bay', icon: Package, group: 'Payload' }, recovery: { title: 'Recovery', icon: Umbrella, group: 'Recovery' }, avionics: { title: 'Avionics bay', icon: Cpu, group: 'Avionics' }
  };
  const m = meta[part];
  const flutter = d.finThickness < 0.003 && r.vmax > 250 ? 'Thin fins at this speed: check flutter margin' : null;
  return (
    <aside className="thin-scroll flex h-full flex-col overflow-y-auto" style={{ background: C.panel }}>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 backdrop-blur" style={{ borderColor: C.line, background: 'rgba(16,18,21,.92)' }}>
        <span className="grid size-8 place-items-center rounded-md" style={{ background: 'rgba(110,231,247,.08)', color: C.accent }}><m.icon size={15} /></span>
        <div className="min-w-0 flex-1"><div className="text-[11px]" style={{ color: C.dim }}>{m.group}</div><div className="truncate text-[14px] font-medium">{m.title}</div></div>
        <Tip label="Reset all to baseline" side="left"><button onClick={() => { reset(); toast('Reset to r14 baseline', { action: { label: 'Undo', onClick: () => useDesignStore.getState().undo() } }); }} aria-label="Reset design" className="rounded p-1.5 hover:bg-white/5" style={{ color: C.dim }}><RotateCcw size={14} /></button></Tip>
      </div>
      {part === 'nose' && (
        <Section title="Geometry">
          <div className="py-1.5"><Seg<NoseShape> label="Nose profile" value={d.noseShape} onChange={(v) => set({ noseShape: v })} options={[['ogive', 'Ogive'], ['vonkarman', 'Von K'], ['conical', 'Cone'], ['elliptical', 'Ellip']]} /></div>
          <Field label="Length" k="noseLength" min={0.2} max={1.1} step={0.005} dim="len" />
          <div className="flex justify-between py-1 font-geist-mono text-[11px]" style={{ color: C.dim }}><span>Fineness</span><span style={{ color: C.muted }}>{(d.noseLength / d.diameter).toFixed(2)} : 1</span></div>
        </Section>
      )}
      {(part === 'body' || part === 'nose' || part === 'payload' || part === 'avionics') && (
        <Section title="Body">
          <Field label="Outer diameter" k="diameter" min={0.054} max={0.2} step={0.001} dim="len" />
          <Field label="Body length" k="bodyLength" min={0.8} max={3} step={0.01} dim="len" />
          <div className="py-1.5"><Seg label="Material" value={d.material} onChange={(v) => set({ material: v })} options={[['fiberglass', 'G12 FG'], ['carbon', 'Carbon'], ['bluetube', 'Blue Tube']]} /></div>
        </Section>
      )}
      {part === 'fins' && (
        <>
          <Section title="Planform" right={<FinThumb d={d} />}>
            <Field label="Root chord" k="finRoot" min={0.08} max={0.45} step={0.001} dim="len" />
            <Field label="Tip chord" k="finTip" min={0} max={0.3} step={0.001} dim="len" />
            <Field label="Semi-span" k="finSpan" min={0.04} max={0.25} step={0.001} dim="len" hint="Largest lever on static margin" />
            <Field label="LE sweep" k="finSweep" min={0} max={0.35} step={0.001} dim="len" />
          </Section>
          <Section title="Construction">
            <div className="flex items-center justify-between py-1.5"><span className="text-[12px]" style={{ color: C.muted }}>Count</span><Seg label="Fin count" value={String(d.finCount)} onChange={(v) => set({ finCount: +v })} options={[['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']]} /></div>
            <Field label="Thickness" k="finThickness" min={0.0015} max={0.008} step={0.0001} dim="len" digits={1} warn={flutter} />
          </Section>
        </>
      )}
      {part === 'motor' && (
        <Section title="Motor">
          <div className="flex flex-col gap-1">
            {MOTORS.map((mo) => {
              const pts = Array.from({ length: 24 }, (_, i) => (i / 23 < 0.06 ? i / 23 / 0.06 * 1.35 : i / 23 < 0.85 ? 1.35 - 0.45 * ((i / 23 - 0.06) / 0.79) : 0.9 * (1 - (i / 23 - 0.85) / 0.15)) * mo.avg);
              const active = d.motorId === mo.id;
              return (
                <button key={mo.id} onClick={() => set({ motorId: mo.id }, `Motor → ${mo.name}`)} className={cn('flex items-center gap-2.5 rounded-md border px-2 py-1.5 text-left transition-colors', active ? 'border-[#6EE7F7]/35 bg-[#6EE7F7]/[0.05]' : 'border-transparent hover:bg-white/[0.03]')}>
                  <span className="grid size-6 shrink-0 place-items-center rounded font-geist-mono text-[11px]" style={{ background: active ? C.accent : 'rgba(255,255,255,.05)', color: active ? C.bg : C.muted }}>{mo.cls}</span>
                  <span className="min-w-0 flex-1"><span className="block font-geist-mono text-[12px]">{mo.name}</span><span className="block truncate text-[10.5px]" style={{ color: C.dim }}>{mo.maker} · {fmt(mo.impulse)} N·s</span></span>
                  <span className="w-12"><Sparkline values={pts} color={active ? C.accent : '#3D4249'} height={18} fill={false} /></span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 font-geist-mono text-[11px]" style={{ color: C.dim }}><span>T/W <b className="font-normal" style={{ color: a.twr >= 5 ? C.fg : C.warn }}>{a.twr.toFixed(1)}:1</b></span><span>Burn <b className="font-normal" style={{ color: C.fg }}>{motorById(d.motorId).burn} s</b></span></div>
        </Section>
      )}
      {(part === 'payload') && <Section title="Payload"><Field label="Payload mass" k="payload" min={0} max={8} step={0.05} dim="mass" hint="SA Cup minimum 4.0 kg (8.8 lb)" warn={d.payload < 4 ? 'Below the 4.0 kg competition minimum' : null} /></Section>}
      {part === 'recovery' && (
        <Section title="Parachutes">
          <Field label="Main Ø" k="mainChute" min={0.8} max={4} step={0.02} dim="m" warn={r.descentMain > 7.6 ? `Lands at ${r.descentMain.toFixed(1)} m/s, above 7.6 limit` : null} />
          <Field label="Drogue Ø" k="drogueChute" min={0.2} max={1.5} step={0.02} dim="m" />
          <Field label="Main deploy" k="mainDeploy" min={150} max={600} step={5} dim="ft" />
        </Section>
      )}
      {part === 'avionics' && <Section title="Flight computers">{['Altus TeleMega · baro + IMU', 'StratoLoggerCF · redundant', 'Featherweight GPS'].map((x) => <div key={x} className="flex items-center gap-2 py-1 text-[12px]" style={{ color: '#9AA0A8' }}><Cpu size={12} style={{ color: '#A78BFA' }} /> {x}</div>)}</Section>}
      <Section title="Launch" defaultOpen={false}>
        <Field label="Rail length" k="railLength" min={1.5} max={8} step={0.1} dim="m" digits={1} />
        <Field label="Launch angle" k="launchAngle" min={0} max={15} step={0.5} dim="deg" />
        <Field label="Ground wind" k="wind" min={0} max={12} step={0.1} dim="mps" />
      </Section>
      <div className="mt-auto border-t px-4 py-3 text-[11.5px]" style={{ borderColor: C.line, color: C.dim }}>
        {changes.length ? <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full" style={{ background: C.changed }} />{changes.length} parameter{changes.length > 1 ? 's' : ''} differ from the committed run. Hover a field to revert it.</span> : <span className="flex items-center gap-1.5"><Activity size={12} /> Matches the committed run.</span>}
      </div>
    </aside>
  );
}

function FinThumb({ d }: { d: Design }) {
  const s = 40 / Math.max(d.finRoot, d.finSpan + 0.02, d.finSweep + d.finTip);
  const p = [[0, 0], [d.finSweep, d.finSpan], [d.finSweep + d.finTip, d.finSpan], [d.finRoot, 0]].map(([x, y]) => `${x * s + 2},${30 - y * s * 0.6}`).join(' ');
  return <svg width="48" height="32" aria-hidden><line x1="0" x2="48" y1="30" y2="30" stroke="#3D4249" /><polygon points={p} fill="rgba(110,231,247,.1)" stroke={C.accent} strokeWidth="1" /></svg>;
}

/* ───────────────────────── palette + shortcuts ───────────────────────── */

const PARAMS: { words: string[]; k: keyof Design; scale: number; unit: string; label: string }[] = [
  { words: ['span', 'finspan'], k: 'finSpan', scale: 1000, unit: 'mm', label: 'Fin span' },
  { words: ['root'], k: 'finRoot', scale: 1000, unit: 'mm', label: 'Root chord' },
  { words: ['tip'], k: 'finTip', scale: 1000, unit: 'mm', label: 'Tip chord' },
  { words: ['sweep'], k: 'finSweep', scale: 1000, unit: 'mm', label: 'Fin sweep' },
  { words: ['nose'], k: 'noseLength', scale: 1000, unit: 'mm', label: 'Nose length' },
  { words: ['dia', 'diameter'], k: 'diameter', scale: 1000, unit: 'mm', label: 'Diameter' },
  { words: ['body', 'length'], k: 'bodyLength', scale: 1000, unit: 'mm', label: 'Body length' },
  { words: ['fins', 'count'], k: 'finCount', scale: 1, unit: '', label: 'Fin count' },
  { words: ['payload'], k: 'payload', scale: 1, unit: 'kg', label: 'Payload' },
  { words: ['wind'], k: 'wind', scale: 1, unit: 'm/s', label: 'Wind' },
  { words: ['rail'], k: 'railLength', scale: 1, unit: 'm', label: 'Rail length' }
];

function Palette({ open, setOpen, setStage, setPart, run, openShortcuts }: { open: boolean; setOpen: (b: boolean) => void; setStage: (s: Stage) => void; setPart: (p: Part) => void; run: () => void; openShortcuts: () => void }) {
  const set = useDesignStore((s) => s.set);
  const undo = useDesignStore((s) => s.undo);
  const [q, setQ] = useState('');
  const go = (fn: () => void) => () => { fn(); setOpen(false); setQ(''); };
  const parsed = useMemo(() => {
    const m = q.trim().toLowerCase().match(/^([a-z]+)\s*=?\s*(-?[\d.]+)$/);
    if (!m) return null;
    const p = PARAMS.find((x) => x.words.includes(m[1]));
    return p ? { p, v: parseFloat(m[2]) } : null;
  }, [q]);
  const motor = MOTORS.find((m) => q.trim().toLowerCase() === m.id.toLowerCase());
  const item = 'flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-[#C9CDD3] data-[selected=true]:bg-white/[0.07] data-[selected=true]:text-white';
  const group = 'px-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-[#5E646D]';
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-[14vh] left-1/2 z-50 w-[min(580px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border font-geist shadow-2xl" style={{ background: '#121417', borderColor: 'rgba(255,255,255,.1)' }} aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command loop shouldFilter={!parsed && !motor}>
            <div className="flex items-center gap-2 border-b px-3.5" style={{ borderColor: C.line }}>
              <CmdIcon size={15} style={{ color: C.dim }} />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Search, or set a value: span 120, fins 4, K550W" className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[#5E646D]" style={{ color: C.fg }} />
            </div>
            <Command.List className="thin-scroll max-h-[380px] overflow-y-auto pb-2">
              <Command.Empty className="px-4 py-6 text-center text-[13px]" style={{ color: C.dim }}>No matches. Try “span 120” or a motor like “K550W”.</Command.Empty>
              {parsed && (
                <Command.Group heading="Set parameter" className={group}>
                  <Command.Item value={`set-${q}`} onSelect={go(() => { set({ [parsed.p.k]: parsed.v / parsed.p.scale } as Partial<Design>, `${parsed.p.label} = ${parsed.v}${parsed.p.unit ? ' ' + parsed.p.unit : ''}`); toast(`${parsed.p.label} set to ${parsed.v} ${parsed.p.unit}`, { action: { label: 'Undo', onClick: () => undo() } }); })} className={item}>
                    <CornerDownLeft size={14} /> Set {parsed.p.label.toLowerCase()} to <b className="font-geist-mono font-medium">{parsed.v} {parsed.p.unit}</b>
                    <span className="ml-auto font-geist-mono text-[11px]" style={{ color: C.dim }}>now {(useDesignStore.getState().design[parsed.p.k] as number * parsed.p.scale).toFixed(parsed.p.scale === 1 ? 1 : 0)}</span>
                  </Command.Item>
                </Command.Group>
              )}
              {motor && (
                <Command.Group heading="Swap motor" className={group}>
                  <Command.Item value={`motor-${motor.id}`} onSelect={go(() => { set({ motorId: motor.id }, `Motor → ${motor.name}`); toast(`Motor set to ${motor.maker} ${motor.name}`, { action: { label: 'Undo', onClick: () => undo() } }); })} className={item}><Flame size={14} /> Use {motor.maker} {motor.name}<span className="ml-auto font-geist-mono text-[11px]" style={{ color: C.dim }}>{fmt(motor.impulse)} N·s</span></Command.Item>
                </Command.Group>
              )}
              {!parsed && !motor && <>
                <Command.Group heading="Actions" className={group}>
                  <Command.Item onSelect={go(run)} className={item}><Play size={14} /> Run 6-DOF simulation <span className="ml-auto"><Kbd>⌘↵</Kbd></span></Command.Item>
                  <Command.Item onSelect={go(undo)} className={item}><Undo2 size={14} /> Undo <span className="ml-auto"><Kbd>⌘Z</Kbd></span></Command.Item>
                  <Command.Item onSelect={go(openShortcuts)} className={item}><Keyboard size={14} /> Keyboard shortcuts <span className="ml-auto"><Kbd>?</Kbd></span></Command.Item>
                </Command.Group>
                <Command.Group heading="Go to" className={group}>
                  {STAGES.map((s) => <Command.Item key={s.id} onSelect={go(() => setStage(s.id))} className={item}><s.icon size={14} /> {s.label} <span className="ml-auto"><Kbd>{s.key}</Kbd></span></Command.Item>)}
                </Command.Group>
                <Command.Group heading="Select part" className={group}>
                  {TREE.map((n) => <Command.Item key={n.id} onSelect={go(() => { setStage('airframe'); setPart(n.id); })} className={item}><n.icon size={14} /> {n.label}</Command.Item>)}
                </Command.Group>
                <Command.Group heading="Motors" className={group}>
                  {MOTORS.map((m) => <Command.Item key={m.id} value={`motor ${m.name} ${m.maker}`} onSelect={go(() => set({ motorId: m.id }, `Motor → ${m.name}`))} className={item}><Flame size={14} /> {m.maker} {m.name}<span className="ml-auto font-geist-mono text-[11px]" style={{ color: C.dim }}>{fmt(m.impulse)} N·s</span></Command.Item>)}
                </Command.Group>
              </>}
            </Command.List>
            <div className="flex items-center gap-3 border-t px-3 py-2 text-[11px]" style={{ borderColor: C.line, color: C.dim }}><span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span><span className="flex items-center gap-1"><Kbd>↵</Kbd> run</span><span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span><span className="ml-auto">Values use mm, kg, m/s</span></div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Shortcuts({ open, setOpen }: { open: boolean; setOpen: (b: boolean) => void }) {
  const rows: [string, string[]][] = [['Command palette', ['⌘', 'K']], ['Run simulation', ['⌘', '↵']], ['Undo / redo', ['⌘', 'Z']], ['Pipeline stage 1–8', ['1', '…', '8']], ['Toggle outline / inspector', ['[', ']']], ['Scrub a value', ['drag label']], ['Fine scrub', ['⇧', 'drag']], ['Nudge value', ['↑', '↓']], ['Viewport options', ['right-click']], ['Resize panel', ['drag edge']]];
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 font-geist shadow-2xl" style={{ background: '#121417', borderColor: 'rgba(255,255,255,.1)', color: C.fg }}>
          <Dialog.Title className="flex items-center gap-2 text-[15px] font-medium"><Keyboard size={16} /> Keyboard shortcuts</Dialog.Title>
          <Dialog.Description className="mt-1 text-[12px]" style={{ color: C.dim }}>Everything in the workstation is reachable without the mouse.</Dialog.Description>
          <div className="mt-4">{rows.map(([l, ks]) => <div key={l} className="flex items-center justify-between border-b py-2 text-[12.5px]" style={{ borderColor: C.line }}><span style={{ color: '#C9CDD3' }}>{l}</span><span className="flex gap-1">{ks.map((k) => <Kbd key={k}>{k}</Kbd>)}</span></div>)}</div>
          <Dialog.Close className="mt-4 h-8 w-full rounded-md border text-[12.5px] hover:bg-white/5" style={{ borderColor: C.line }}>Close</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
