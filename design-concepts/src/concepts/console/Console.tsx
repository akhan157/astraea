import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { Command } from 'cmdk';
import { Dialog, Tabs, Tooltip } from 'radix-ui';
import { Toaster, toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  Target, Box, Flame, Wind, Activity, Umbrella, ShieldCheck, Wrench, Search, Play, ChevronRight, ChevronDown,
  Cone, Cylinder, Triangle, Cpu, Package, CircleDot, Layers, Eye, Scan, Grid3x3, Command as CmdIcon,
  GitBranch, Users, Circle, AlertTriangle, CheckCircle2, XCircle, RotateCcw, PanelLeft, PanelRight, Download
} from 'lucide-react';
import { useDesignStore, useEngineering } from '../../shared/store';
import { MOTORS, massItems, monteCarlo, motorById, thrustAt, type Design, type NoseShape } from '../../shared/model';
import { RocketModel } from '../../shared/Rocket3D';
import { LineChart, Dispersion, Sparkline, type ChartTheme } from '../../shared/charts';
import { cn, fmt, ft } from '../../shared/format';
import { Kbd, STATE_COLOR, ScrubField, Section, Segmented } from './ui';

const C = { bg: '#0A0B0D', panel: '#0F1114', raised: '#15181C', line: 'rgba(255,255,255,0.06)', fg: '#E6E8EB', muted: '#8A9099', dim: '#5D636C', accent: '#67E8F9', cg: '#38BDF8', cp: '#FB7185' };
const chartTheme: ChartTheme = { grid: 'rgba(255,255,255,0.05)', axis: 'rgba(255,255,255,0.18)', text: '#5D636C', font: 'Geist Mono, monospace', crosshair: 'rgba(255,255,255,0.25)', tooltipBg: '#1A1D22', tooltipFg: '#E6E8EB' };

type Stage = 'mission' | 'airframe' | 'propulsion' | 'aero' | 'flight' | 'recovery' | 'verify' | 'fab';
const STAGES: { id: Stage; label: string; icon: typeof Box; key: string }[] = [
  { id: 'mission', label: 'Mission', icon: Target, key: '1' },
  { id: 'airframe', label: 'Airframe', icon: Box, key: '2' },
  { id: 'propulsion', label: 'Propulsion', icon: Flame, key: '3' },
  { id: 'aero', label: 'Aerodynamics', icon: Wind, key: '4' },
  { id: 'flight', label: 'Flight', icon: Activity, key: '5' },
  { id: 'recovery', label: 'Recovery', icon: Umbrella, key: '6' },
  { id: 'verify', label: 'Verify', icon: ShieldCheck, key: '7' },
  { id: 'fab', label: 'Fabricate', icon: Wrench, key: '8' }
];

type Part = 'nose' | 'body' | 'fins' | 'motor' | 'payload' | 'recovery' | 'avionics';
type ViewMode = 'solid' | 'xray' | 'wire';

export default function Console() {
  const eng = useEngineering();
  const [stage, setStage] = useState<Stage>('airframe');
  const [part, setPart] = useState<Part>('fins');
  const [palette, setPalette] = useState(false);
  const [running, setRunning] = useState(0);
  const [view, setView] = useState<ViewMode>('solid');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const commit = useDesignStore((s) => s.commitSim);

  const run = () => {
    if (running) return;
    setRunning(1);
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 1400);
      setRunning(p || 0.01);
      if (p < 1) requestAnimationFrame(tick);
      else {
        setRunning(0);
        commit();
        toast.success('Simulation complete', { description: `Apogee ${fmt(ft(eng.r.apogee))} ft · max M ${eng.r.machMax.toFixed(2)} · 6-DOF, 1 run` });
      }
    };
    requestAnimationFrame(tick);
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
      if (e.target instanceof HTMLInputElement) return;
      const s = STAGES.find((x) => x.key === e.key);
      if (s && !e.metaKey && !e.ctrlKey) setStage(s.id);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });

  useEffect(() => {
    if (window.innerWidth < 1024) setLeftOpen(false);
    if (window.innerWidth < 768) setRightOpen(false);
  }, []);

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex h-full flex-col overflow-hidden font-geist text-[13px]" style={{ background: C.bg, color: C.fg }}>
        <TopBar onPalette={() => setPalette(true)} onRun={run} running={running} stale={eng.stale} leftOpen={leftOpen} rightOpen={rightOpen} setLeftOpen={setLeftOpen} setRightOpen={setRightOpen} />
        <div className="flex min-h-0 flex-1">
          <StageRail stage={stage} setStage={setStage} />
          {leftOpen && <Outline part={part} setPart={(p) => { setPart(p); if (stage !== 'airframe' && stage !== 'propulsion') setStage('airframe'); }} />}
          <main className="flex min-w-0 flex-1 flex-col" style={{ background: C.bg }}>
            <AnimatePresence mode="wait">
              <motion.div key={stage} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="flex min-h-0 flex-1 flex-col">
                {stage === 'airframe' && <AirframeView part={part} setPart={setPart} view={view} setView={setView} />}
                {stage === 'propulsion' && <PropulsionView />}
                {stage === 'flight' && <FlightView />}
                {stage === 'verify' && <VerifyView />}
                {stage === 'mission' && <MissionView />}
                {stage === 'aero' && <AeroView />}
                {stage === 'recovery' && <RecoveryView />}
                {stage === 'fab' && <FabView />}
              </motion.div>
            </AnimatePresence>
          </main>
          {rightOpen && <Inspector part={part} stage={stage} />}
        </div>
        <StatusRail />
        <Palette open={palette} setOpen={setPalette} setStage={setStage} setPart={setPart} run={run} setView={setView} />
        <Toaster theme="dark" position="bottom-right" toastOptions={{ style: { background: '#15181C', border: '1px solid rgba(255,255,255,.08)', color: C.fg, fontFamily: 'Geist' } }} />
      </div>
    </Tooltip.Provider>
  );
}

/* ───────────────────────── chrome ───────────────────────── */

function TopBar({ onPalette, onRun, running, stale, leftOpen, rightOpen, setLeftOpen, setRightOpen }: { onPalette: () => void; onRun: () => void; running: number; stale: boolean; leftOpen: boolean; rightOpen: boolean; setLeftOpen: (b: boolean) => void; setRightOpen: (b: boolean) => void }) {
  const name = useDesignStore((s) => s.design.name);
  const rev = useDesignStore((s) => s.rev);
  return (
    <header className="relative flex h-11 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: C.line, background: C.panel }}>
      <div className="flex items-center gap-2 pr-2">
        <Logo />
        <span className="hidden font-medium tracking-tight sm:inline">Astraea</span>
      </div>
      <button onClick={() => setLeftOpen(!leftOpen)} className={cn('rounded p-1.5 hover:bg-white/5', leftOpen ? 'text-[#C9CDD3]' : 'text-[#5D636C]')} aria-label="Toggle outline"><PanelLeft size={15} /></button>
      <nav className="hidden min-w-0 items-center gap-1.5 text-[12.5px] text-[#8A9099] md:flex">
        <span className="truncate">Spaceport America Cup 2027</span>
        <ChevronRight size={13} className="text-[#3F444B]" />
        <span className="truncate text-[#E6E8EB]">{name}</span>
        <span className="flex items-center gap-1 rounded border border-white/[0.07] px-1.5 py-px font-geist-mono text-[10.5px] text-[#8A9099]"><GitBranch size={10} /> main · r{rev}</span>
      </nav>
      <div className="flex-1" />
      <button onClick={onPalette} className="flex h-7 w-full max-w-72 items-center gap-2 rounded-md border px-2 text-[12px] text-[#5D636C] hover:border-white/15 hover:text-[#8A9099]" style={{ borderColor: C.line, background: C.bg }}>
        <Search size={13} /> <span className="truncate">Search commands, parts, motors…</span>
        <span className="ml-auto hidden gap-0.5 sm:flex"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="flex-1" />
      <div className="hidden items-center -space-x-1.5 lg:flex" title="3 collaborators online">
        {['#F472B6', '#A78BFA', '#34D399'].map((c, i) => (
          <span key={c} className="grid size-6 place-items-center rounded-full border-2 text-[10px] font-semibold text-black" style={{ background: c, borderColor: C.panel }}>{['MR', 'JT', 'AK'][i]}</span>
        ))}
      </div>
      <button className="hidden h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] text-[#C9CDD3] hover:bg-white/5 sm:flex" style={{ borderColor: C.line }}><Users size={13} /> Share</button>
      <button onClick={onRun} className="relative flex h-7 items-center gap-1.5 overflow-hidden rounded-md px-3 text-[12px] font-medium text-[#0A0B0D] transition-[filter] hover:brightness-110" style={{ background: C.accent }}>
        {running > 0 && <span className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${running * 100}%` }} />}
        <Play size={12} fill="currentColor" className="relative" />
        <span className="relative hidden sm:inline">{running ? `Simulating ${Math.round(running * 100)}%` : stale ? 'Run simulation' : 'Re-run'}</span>
        <span className="relative hidden opacity-60 lg:inline">⌘↵</span>
      </button>
      <button onClick={() => setRightOpen(!rightOpen)} className={cn('rounded p-1.5 hover:bg-white/5', rightOpen ? 'text-[#C9CDD3]' : 'text-[#5D636C]')} aria-label="Toggle inspector"><PanelRight size={15} /></button>
      {running > 0 && <motion.div className="absolute bottom-0 left-0 h-px" style={{ background: C.accent, width: `${running * 100}%` }} />}
    </header>
  );
}

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.5 L15.5 14 L12 12.2 L8.5 14 Z" fill={C.accent} />
      <path d="M5 19.5 Q12 13 19 19.5" stroke={C.fg} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.2" fill={C.fg} />
    </svg>
  );
}

function StageRail({ stage, setStage }: { stage: Stage; setStage: (s: Stage) => void }) {
  const { gates, stale } = useEngineering();
  const badge: Partial<Record<Stage, string>> = {
    verify: gates.some((g) => g.state === 'fail') ? STATE_COLOR.fail : gates.some((g) => g.state === 'warn') ? STATE_COLOR.warn : STATE_COLOR.pass,
    flight: stale ? STATE_COLOR.warn : undefined
  };
  return (
    <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2" style={{ borderColor: C.line, background: C.panel }} aria-label="Pipeline stages">
      {STAGES.map((s, i) => (
        <Tooltip.Root key={s.id}>
          <Tooltip.Trigger asChild>
            <button onClick={() => setStage(s.id)} aria-label={s.label} aria-current={stage === s.id} className={cn('relative grid size-9 place-items-center rounded-md transition-colors', stage === s.id ? 'bg-white/[0.08] text-[#E6E8EB]' : 'text-[#5D636C] hover:bg-white/[0.04] hover:text-[#C9CDD3]')}>
              {stage === s.id && <motion.span layoutId="stage-ind" className="absolute -left-[7px] h-5 w-[2px] rounded-full" style={{ background: C.accent }} />}
              <s.icon size={17} strokeWidth={1.6} />
              {badge[s.id] && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full" style={{ background: badge[s.id] }} />}
              {i < STAGES.length - 1 && <span className="absolute -bottom-1 h-1 w-px bg-white/[0.06]" />}
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="right" sideOffset={8} className="z-50 flex items-center gap-2 rounded-md border border-white/10 bg-[#1A1D22] px-2 py-1 font-geist text-[11.5px] text-[#E6E8EB] shadow-xl">
              {s.label} <Kbd>{s.key}</Kbd>
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      ))}
    </nav>
  );
}

const TREE: { id: Part; label: string; icon: typeof Box; children?: { label: string; id: Part }[] }[] = [
  { id: 'nose', label: 'Nose cone', icon: Cone },
  { id: 'payload', label: 'Payload bay', icon: Package, children: [{ label: 'CubeSat payload (4.0 kg)', id: 'payload' }] },
  { id: 'recovery', label: 'Recovery', icon: Umbrella, children: [{ label: 'Main · 84 in toroidal', id: 'recovery' }, { label: 'Drogue · 24 in cruciform', id: 'recovery' }] },
  { id: 'avionics', label: 'Avionics bay', icon: Cpu, children: [{ label: 'Flight computer', id: 'avionics' }, { label: 'GPS tracker', id: 'avionics' }] },
  { id: 'body', label: 'Body tube', icon: Cylinder },
  { id: 'fins', label: 'Fin can', icon: Triangle },
  { id: 'motor', label: 'Motor mount', icon: Flame }
];

function Outline({ part, setPart }: { part: Part; setPart: (p: Part) => void }) {
  const d = useDesignStore((s) => s.design);
  const items = useMemo(() => massItems(d), [d]);
  const [open, setOpen] = useState<Record<string, boolean>>({ recovery: true, avionics: false, payload: false });
  const massOf: Partial<Record<Part, number>> = {
    nose: items[0].mass, payload: items[1].mass, recovery: items[2].mass + items[4].mass, avionics: items[3].mass, body: items[5].mass, fins: items[6].mass, motor: items[7].mass + items[8].mass
  };
  return (
    <aside className="thin-scroll flex w-60 shrink-0 flex-col overflow-y-auto border-r" style={{ borderColor: C.line, background: C.panel }}>
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-medium tracking-[0.08em] text-[#5D636C] uppercase">Assembly</span>
        <span className="font-geist-mono text-[10.5px] text-[#5D636C]">{items.length} parts</span>
      </div>
      <div className="px-1.5 pb-3">
        <div className="flex items-center gap-1.5 px-2 py-1 text-[12.5px] text-[#C9CDD3]"><Layers size={13} className="text-[#5D636C]" /> {d.name}</div>
        {TREE.map((n) => (
          <div key={n.id}>
            <button
              onClick={() => { setPart(n.id); if (n.children) setOpen((o) => ({ ...o, [n.id]: !o[n.id] })); }}
              className={cn('group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 pl-4 text-left text-[12.5px]', part === n.id ? 'bg-[#67E8F9]/10 text-[#E6E8EB]' : 'text-[#9AA0A8] hover:bg-white/[0.03]')}
            >
              <span className="w-3 text-[#3F444B]">{n.children ? (open[n.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
              <n.icon size={13} className={part === n.id ? 'text-[#67E8F9]' : 'text-[#5D636C]'} />
              <span className="flex-1 truncate">{n.label}</span>
              <span className="tnum font-geist-mono text-[10.5px] text-[#5D636C]">{fmt((massOf[n.id] ?? 0) * 1000)} g</span>
            </button>
            {n.children && open[n.id] && n.children.map((c) => (
              <div key={c.label} className="flex items-center gap-1.5 py-0.5 pl-12 text-[12px] text-[#6B717A]"><CircleDot size={9} /> {c.label}</div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-auto border-t p-3" style={{ borderColor: C.line }}>
        <div className="mb-2 text-[11px] font-medium tracking-[0.08em] text-[#5D636C] uppercase">Activity</div>
        {[
          ['MR', '#F472B6', 'swept fins 130 mm', '4m'],
          ['JT', '#A78BFA', 'imported Ozark ARTS log', '1h'],
          ['AK', '#34D399', 'set target 10,000 ft', '3h']
        ].map(([who, c, what, when]) => (
          <div key={what} className="flex items-start gap-2 py-1 text-[11.5px] text-[#8A9099]">
            <span className="mt-0.5 size-2 shrink-0 rounded-full" style={{ background: c }} />
            <span className="flex-1"><b className="font-medium text-[#C9CDD3]">{who}</b> {what}</span>
            <span className="text-[#5D636C]">{when}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function StatusRail() {
  const { a, r, stale, gates } = useEngineering();
  const pill = (state: 'pass' | 'warn' | 'fail') => {
    const Icon = state === 'pass' ? CheckCircle2 : state === 'warn' ? AlertTriangle : XCircle;
    return <Icon size={11} style={{ color: STATE_COLOR[state] }} />;
  };
  const g = Object.fromEntries(gates.map((x) => [x.id, x]));
  const items: [string, string, 'pass' | 'warn' | 'fail'][] = [
    ['Stability', `${a.stability.toFixed(2)} cal`, g.stab.state],
    ['Apogee', `${fmt(ft(r.apogee))} ft`, g.apogee.state],
    ['Rail exit', `${r.railExit.toFixed(1)} m/s`, g.rail.state],
    ['Max Mach', r.machMax.toFixed(2), g.mach.state],
    ['Descent', `${r.descentMain.toFixed(1)} m/s`, g.main.state]
  ];
  return (
    <footer className="no-scrollbar flex h-7 shrink-0 items-center gap-4 overflow-x-auto border-t px-3 font-geist-mono text-[11px] whitespace-nowrap" style={{ borderColor: C.line, background: C.panel, color: C.muted }}>
      <span className="flex items-center gap-1.5">
        <Circle size={7} fill={stale ? STATE_COLOR.warn : STATE_COLOR.pass} stroke="none" />
        {stale ? 'Results stale · design changed' : 'Results current'}
      </span>
      <span className="h-3 w-px bg-white/10" />
      {items.map(([k, v, s]) => (
        <span key={k} className={cn('flex items-center gap-1.5', stale && 'opacity-50')}>{pill(s)} <span className="text-[#5D636C]">{k}</span> <span className="tnum text-[#C9CDD3]">{v}</span></span>
      ))}
      <span className="flex-1" />
      <span className="hidden text-[#5D636C] lg:inline">Wind 4.5 m/s · NOAA GFS 06z · 2 h old</span>
      <span className="hidden text-[#5D636C] lg:inline">Model: Barrowman + DP5(4)</span>
    </footer>
  );
}

/* ───────────────────────── airframe ───────────────────────── */

function Viewport({ part, setPart, view, showMarkers = true }: { part: Part; setPart?: (p: Part) => void; view: ViewMode; showMarkers?: boolean }) {
  const { design: d, a } = useEngineering();
  const L = a.length;
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0.35, 1.0, 3.7], fov: 34 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={[C.bg]} />
      <fog attach="fog" args={[C.bg, 4, 9]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 2]} intensity={1.6} castShadow />
      <directionalLight position={[-3, 1, -2]} intensity={0.5} color="#67E8F9" />
      <group rotation={[0, 0, -Math.PI / 2]} position={[-L / 2, 0.15, 0]} onPointerDown={(e) => {
        if (!setPart) return;
        e.stopPropagation();
        const y = e.point.x + L / 2; // tail→nose
        const fromNose = L - y;
        setPart(fromNose < d.noseLength ? 'nose' : fromNose > L - d.finRoot && Math.abs(e.point.y - 0.15) > d.diameter / 2 * 0.9 ? 'fins' : fromNose > L - d.finRoot * 1.3 ? 'motor' : 'body');
      }}>
        <RocketModel
          d={d}
          cg={a.cg}
          cp={a.cp}
          showMarkers={showMarkers}
          look={{ body: '#D7DBE0', nose: '#E8EBEE', fins: '#2A2F36', accent: '#67E8F9', wireframe: view === 'wire', opacity: view === 'xray' ? 0.25 : 1, roughness: 0.38, metalness: 0.2, highlight: part, highlightColor: '#67E8F9' }}
        />
      </group>
      <Grid position={[0, -0.12, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.6} cellColor="#1B1F24" sectionSize={0.5} sectionThickness={1} sectionColor="#262B31" fadeDistance={6} infiniteGrid />
      <OrbitControls makeDefault enableDamping target={[0, 0.15, 0]} minDistance={0.8} maxDistance={6} />
    </Canvas>
  );
}

function AirframeView({ part, setPart, view, setView }: { part: Part; setPart: (p: Part) => void; view: ViewMode; setView: (v: ViewMode) => void }) {
  const { design: d, a } = useEngineering();
  const items = useMemo(() => massItems(d), [d]);
  const total = items.reduce((s, i) => s + i.mass, 0);
  return (
    <>
      <div className="relative min-h-0 flex-1">
        <Suspense fallback={null}><Viewport part={part} setPart={setPart} view={view} /></Suspense>
        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border p-0.5 backdrop-blur" style={{ borderColor: C.line, background: 'rgba(15,17,20,.8)' }}>
            {([['solid', Eye, 'Solid'], ['xray', Scan, 'X-ray'], ['wire', Grid3x3, 'Wireframe']] as const).map(([v, I, l]) => (
              <Tooltip.Root key={v}>
                <Tooltip.Trigger asChild>
                  <button aria-label={l} onClick={() => setView(v)} className={cn('grid size-7 place-items-center rounded-md', view === v ? 'bg-white/10 text-[#E6E8EB]' : 'text-[#6B717A] hover:text-[#C9CDD3]')}><I size={14} /></button>
                </Tooltip.Trigger>
                <Tooltip.Portal><Tooltip.Content side="bottom" sideOffset={6} className="z-50 rounded-md border border-white/10 bg-[#1A1D22] px-2 py-1 text-[11px] text-[#E6E8EB]">{l}</Tooltip.Content></Tooltip.Portal>
              </Tooltip.Root>
            ))}
          </div>
          <div className="pointer-events-auto rounded-lg border px-3 py-2 font-geist-mono text-[11px] backdrop-blur" style={{ borderColor: C.line, background: 'rgba(15,17,20,.8)' }}>
            <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: C.cg }} /><span className="text-[#5D636C]">CG</span><span className="tnum ml-auto pl-4 text-[#C9CDD3]">{fmt(a.cg * 1000)} mm</span></div>
            <div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: C.cp }} /><span className="text-[#5D636C]">CP</span><span className="tnum ml-auto pl-4 text-[#C9CDD3]">{fmt(a.cp * 1000)} mm</span></div>
            <div className="mt-1 border-t pt-1" style={{ borderColor: C.line }}><span className="text-[#5D636C]">Margin</span> <span className="tnum float-right text-[#E6E8EB]">{a.stability.toFixed(2)} cal</span></div>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 font-geist-mono text-[10.5px] text-[#3F444B]">L {fmt(a.length * 1000)} mm · Ø {fmt(d.diameter * 1000)} mm · drag to orbit · click part to select</div>
      </div>
      <Tabs.Root defaultValue="mass" className="flex h-56 shrink-0 flex-col border-t" style={{ borderColor: C.line, background: C.panel }}>
        <Tabs.List className="flex items-center gap-1 border-b px-2" style={{ borderColor: C.line }}>
          {[['mass', 'Mass budget'], ['stab', 'Stability'], ['log', 'Solver log']].map(([v, l]) => (
            <Tabs.Trigger key={v} value={v} className="relative px-2.5 py-2 text-[12px] text-[#6B717A] hover:text-[#C9CDD3] data-[state=active]:text-[#E6E8EB] data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:-bottom-px data-[state=active]:after:h-px data-[state=active]:after:bg-[#67E8F9]">{l}</Tabs.Trigger>
          ))}
          <span className="ml-auto font-geist-mono text-[11px] text-[#5D636C]">Liftoff <span className="text-[#C9CDD3]">{total.toFixed(2)} kg</span></span>
        </Tabs.List>
        <Tabs.Content value="mass" className="thin-scroll min-h-0 flex-1 overflow-auto px-3 py-2">
          <table className="w-full text-[12px]">
            <tbody>
              {[...items].sort((x, y) => y.mass - x.mass).map((i) => (
                <tr key={i.id} className="group">
                  <td className="w-44 py-1 pr-3 text-[#9AA0A8]">{i.label}</td>
                  <td className="py-1"><div className="h-1.5 rounded-full bg-white/[0.04]"><motion.div className="h-full rounded-full" animate={{ width: `${(i.mass / total) * 100}%` }} style={{ background: i.group === 'Propulsion' ? '#FB923C' : i.group === 'Payload' || i.group === 'Avionics' ? '#A78BFA' : i.group === 'Recovery' ? '#34D399' : C.accent, opacity: 0.8 }} /></div></td>
                  <td className="tnum w-20 py-1 text-right font-geist-mono text-[#C9CDD3]">{fmt(i.mass * 1000)} g</td>
                  <td className="tnum w-14 py-1 text-right font-geist-mono text-[#5D636C]">{((i.mass / total) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tabs.Content>
        <Tabs.Content value="stab" className="min-h-0 flex-1 px-4 py-3">
          <StabilityStrip />
        </Tabs.Content>
        <Tabs.Content value="log" className="thin-scroll min-h-0 flex-1 overflow-auto px-3 py-2 font-geist-mono text-[11px] leading-5 text-[#6B717A]">
          {[
            ['info', 'mass rollup · 9 components · ' + total.toFixed(3) + ' kg'],
            ['info', `barrowman · CNα nose 2.000 · fins ${a.finCNa.toFixed(3)} · interference K=1+r/(s+r)`],
            ['info', `cp ${(a.cp * 1000).toFixed(1)} mm · cg ${(a.cg * 1000).toFixed(1)} mm · margin ${a.stability.toFixed(3)} cal`],
            ['warn', 'transonic regime reached · subsonic CNα extrapolated above M 0.8'],
            ['info', 'dp5(4) adaptive · rtol 1e-6 · 1 842 steps · 38 ms']
          ].map(([lvl, msg], i) => (
            <div key={i}><span className="text-[#3F444B]">02:14:0{i}</span> <span style={{ color: lvl === 'warn' ? STATE_COLOR.warn : '#5D636C' }}>{lvl.padEnd(4)}</span> {msg}</div>
          ))}
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}

function StabilityStrip() {
  const { a } = useEngineering();
  const L = a.length;
  const pos = (x: number) => `${(x / L) * 100}%`;
  return (
    <div>
      <div className="relative h-14">
        <div className="absolute inset-x-0 top-6 h-2 rounded-full bg-white/[0.05]" />
        <motion.div className="absolute top-6 h-2 rounded-full" animate={{ left: pos(a.cg), width: `${((a.cp - a.cg) / L) * 100}%` }} style={{ background: 'linear-gradient(90deg,#38BDF8,#FB7185)', opacity: 0.5 }} />
        {[['CG', a.cg, C.cg], ['CG burnout', a.cgBurnout, '#7DD3FC'], ['CP', a.cp, C.cp]].map(([l, x, c]) => (
          <motion.div key={l as string} className="absolute top-0 -translate-x-1/2 text-center" animate={{ left: pos(x as number) }}>
            <div className="font-geist-mono text-[10px] whitespace-nowrap" style={{ color: c as string }}>{l as string}</div>
            <div className="mx-auto mt-1 h-6 w-px" style={{ background: c as string }} />
          </motion.div>
        ))}
      </div>
      <div className="flex justify-between font-geist-mono text-[10.5px] text-[#5D636C]"><span>nose tip 0</span><span>{fmt(L * 1000)} mm tail</span></div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
        {[['Margin at liftoff', `${a.stability.toFixed(2)} cal`], ['Margin at burnout', `${a.stabilityBurnout.toFixed(2)} cal`], ['Fin CNα', a.finCNa.toFixed(2)]].map(([k, v]) => (
          <div key={k}><div className="text-[#5D636C]">{k}</div><div className="tnum font-geist-mono text-[15px] text-[#E6E8EB]">{v}</div></div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── inspector ───────────────────────── */

function Inspector({ part, stage }: { part: Part; stage: Stage }) {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  const reset = useDesignStore((s) => s.reset);
  const f = (k: keyof Design) => (v: number) => set({ [k]: v } as Partial<Design>);
  const title = { nose: 'Nose cone', body: 'Body tube', fins: 'Fin set', motor: 'Motor mount', payload: 'Payload bay', recovery: 'Recovery', avionics: 'Avionics bay' }[part];
  return (
    <aside className="thin-scroll flex w-72 shrink-0 flex-col overflow-y-auto border-l" style={{ borderColor: C.line, background: C.panel }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: C.line }}>
        <div>
          <div className="text-[11px] text-[#5D636C]">{stage === 'airframe' || stage === 'propulsion' ? 'Selected component' : 'Inspector'}</div>
          <div className="text-[14px] font-medium">{title}</div>
        </div>
        <button onClick={() => { reset(); toast('Design reset to r14 baseline'); }} className="rounded p-1.5 text-[#5D636C] hover:bg-white/5 hover:text-[#C9CDD3]" aria-label="Reset design"><RotateCcw size={14} /></button>
      </div>
      {part === 'nose' && (
        <Section title="Geometry">
          <div className="py-1.5"><Segmented<NoseShape> value={d.noseShape} onChange={(v) => set({ noseShape: v })} options={[{ value: 'ogive', label: 'Ogive' }, { value: 'vonkarman', label: 'Von K' }, { value: 'conical', label: 'Cone' }, { value: 'elliptical', label: 'Ellip' }]} /></div>
          <ScrubField label="Length" value={d.noseLength} onChange={f('noseLength')} min={0.2} max={1} step={0.005} unit="mm" scale={1000} />
          <ScrubField label="Fineness" value={d.noseLength / d.diameter} onChange={(v) => set({ noseLength: v * d.diameter })} min={2} max={8} step={0.1} unit=":1" digits={1} hint="Length ÷ diameter" />
        </Section>
      )}
      {(part === 'body' || part === 'nose') && (
        <Section title="Body">
          <ScrubField label="Outer diameter" value={d.diameter} onChange={f('diameter')} min={0.054} max={0.2} step={0.001} unit="mm" scale={1000} />
          <ScrubField label="Body length" value={d.bodyLength} onChange={f('bodyLength')} min={0.8} max={3} step={0.01} unit="mm" scale={1000} />
          <div className="py-1.5"><Segmented value={d.material} onChange={(v) => set({ material: v })} options={[{ value: 'fiberglass', label: 'G12 FG' }, { value: 'carbon', label: 'Carbon' }, { value: 'bluetube', label: 'Blue Tube' }]} /></div>
        </Section>
      )}
      {part === 'fins' && (
        <>
          <Section title="Planform" right={<FinThumb d={d} />}>
            <ScrubField label="Root chord" value={d.finRoot} onChange={f('finRoot')} min={0.08} max={0.4} step={0.001} unit="mm" scale={1000} />
            <ScrubField label="Tip chord" value={d.finTip} onChange={f('finTip')} min={0} max={0.25} step={0.001} unit="mm" scale={1000} />
            <ScrubField label="Semi-span" value={d.finSpan} onChange={f('finSpan')} min={0.04} max={0.25} step={0.001} unit="mm" scale={1000} />
            <ScrubField label="LE sweep" value={d.finSweep} onChange={f('finSweep')} min={0} max={0.3} step={0.001} unit="mm" scale={1000} />
          </Section>
          <Section title="Construction">
            <ScrubField label="Count" value={d.finCount} onChange={f('finCount')} min={3} max={6} step={1} unit="fins" />
            <ScrubField label="Thickness" value={d.finThickness} onChange={f('finThickness')} min={0.0015} max={0.008} step={0.0001} unit="mm" scale={1000} digits={1} />
          </Section>
        </>
      )}
      {part === 'motor' && <MotorPicker compact />}
      {part === 'payload' && (
        <Section title="Payload">
          <ScrubField label="Payload mass" value={d.payload} onChange={f('payload')} min={0} max={8} step={0.05} unit="kg" digits={2} hint="SA Cup minimum: 8.8 lb (4.0 kg)" />
        </Section>
      )}
      {part === 'recovery' && <RecoveryFields />}
      {part === 'avionics' && (
        <Section title="Flight computers">
          {['Primary · Altus TeleMega · baro+IMU', 'Redundant · PerfectFlite StratoLoggerCF', 'Tracker · Featherweight GPS'].map((x) => (
            <div key={x} className="flex items-center gap-2 py-1.5 text-[12px] text-[#9AA0A8]"><Cpu size={12} className="text-[#A78BFA]" /> {x}</div>
          ))}
        </Section>
      )}
      <Section title="Launch">
        <ScrubField label="Rail length" value={d.railLength} onChange={f('railLength')} min={1.5} max={8} step={0.1} unit="m" digits={1} />
        <ScrubField label="Launch angle" value={d.launchAngle} onChange={f('launchAngle')} min={0} max={15} step={0.5} unit="°" digits={1} />
        <ScrubField label="Wind (ground)" value={d.wind} onChange={f('wind')} min={0} max={12} step={0.1} unit="m/s" digits={1} />
      </Section>
    </aside>
  );
}

function FinThumb({ d }: { d: Design }) {
  const s = 40 / Math.max(d.finRoot, d.finSpan + 0.02);
  const p = [[0, 0], [d.finSweep, d.finSpan], [d.finSweep + d.finTip, d.finSpan], [d.finRoot, 0]].map(([x, y]) => `${x * s + 2},${44 - y * s}`).join(' ');
  return <svg width="48" height="46" aria-hidden><line x1="0" x2="48" y1="44" y2="44" stroke="#3F444B" /><polygon points={p} fill="rgba(103,232,249,.12)" stroke={C.accent} strokeWidth="1" /></svg>;
}

function RecoveryFields() {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  return (
    <Section title="Parachutes">
      <ScrubField label="Main Ø" value={d.mainChute} onChange={(v) => set({ mainChute: v })} min={0.8} max={4} step={0.02} unit="m" digits={2} />
      <ScrubField label="Drogue Ø" value={d.drogueChute} onChange={(v) => set({ drogueChute: v })} min={0.2} max={1.5} step={0.02} unit="m" digits={2} />
      <ScrubField label="Main deploy" value={d.mainDeploy} onChange={(v) => set({ mainDeploy: v })} min={150} max={600} step={5} unit="ft" scale={3.28084} />
    </Section>
  );
}

function MotorPicker({ compact }: { compact?: boolean }) {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  return (
    <Section title="Motor">
      <div className={cn('flex flex-col gap-1', compact ? '' : 'sm:grid sm:grid-cols-2')}>
        {MOTORS.map((m) => {
          const pts = Array.from({ length: 24 }, (_, i) => thrustAt(m, (i / 23) * m.burn));
          return (
            <button key={m.id} onClick={() => set({ motorId: m.id })} className={cn('flex items-center gap-3 rounded-md border px-2.5 py-2 text-left', d.motorId === m.id ? 'border-[#67E8F9]/40 bg-[#67E8F9]/[0.06]' : 'border-white/[0.05] hover:border-white/10')}>
              <span className="grid size-7 shrink-0 place-items-center rounded font-geist-mono text-[12px] font-medium" style={{ background: d.motorId === m.id ? C.accent : 'rgba(255,255,255,.06)', color: d.motorId === m.id ? C.bg : C.muted }}>{m.cls}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-geist-mono text-[12px] text-[#E6E8EB]">{m.name}</span>
                <span className="block truncate text-[11px] text-[#5D636C]">{m.maker} · {m.diameter} mm · {fmt(m.impulse)} N·s</span>
              </span>
              <span className="w-14"><Sparkline values={pts} color={d.motorId === m.id ? C.accent : '#4B5058'} height={22} /></span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/* ───────────────────────── other stages ───────────────────────── */

function PageHead({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4" style={{ borderColor: C.line }}>
      <div><h1 className="text-[17px] font-medium tracking-tight">{title}</h1><p className="mt-0.5 text-[12.5px] text-[#6B717A]">{sub}</p></div>
      {right}
    </div>
  );
}

function Stat({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border px-3.5 py-3" style={{ borderColor: C.line, background: C.panel }}>
      <div className="text-[11.5px] text-[#6B717A]">{k}</div>
      <div className="tnum mt-1 font-geist-mono text-[20px] tracking-tight" style={{ color: tone ?? C.fg }}>{v}</div>
      {sub && <div className="mt-0.5 text-[11px] text-[#5D636C]">{sub}</div>}
    </div>
  );
}

function PropulsionView() {
  const { design: d, a } = useEngineering();
  const m = motorById(d.motorId);
  const curve = useMemo(() => Array.from({ length: 120 }, (_, i) => { const t = (i / 119) * (m.burn + 0.2); return { t, F: thrustAt(m, t) }; }), [m]);
  return (
    <div className="thin-scroll flex-1 overflow-y-auto">
      <PageHead title="Propulsion" sub={`${m.maker} ${m.name} · ${m.note} · curve from ThrustCurve.org (cached)`} right={<button className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] text-[#C9CDD3] hover:bg-white/5" style={{ borderColor: C.line }}><Download size={13} /> Import .eng / .rse</button>} />
      <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
        <Stat k="Total impulse" v={`${fmt(m.impulse)} N·s`} sub={`${m.cls}-class · ${m.diameter} mm`} />
        <Stat k="Average thrust" v={`${fmt(m.avg)} N`} sub={`Burn ${m.burn.toFixed(2)} s`} />
        <Stat k="Thrust-to-weight" v={`${a.twr.toFixed(1)} : 1`} tone={a.twr >= 5 ? STATE_COLOR.pass : STATE_COLOR.warn} sub="Minimum 5 : 1" />
        <Stat k="Propellant" v={`${fmt(m.prop * 1000)} g`} sub={`Loaded ${fmt(m.mass * 1000)} g`} />
      </div>
      <div className="mx-5 rounded-lg border p-3" style={{ borderColor: C.line, background: C.panel }}>
        <div className="mb-1 flex items-center justify-between px-1 text-[12px] text-[#8A9099]"><span>Thrust curve</span><span className="font-geist-mono text-[11px] text-[#5D636C]">N vs s</span></div>
        <LineChart data={curve} x={(p) => +p.t.toFixed(2)} series={[{ key: 'F', label: 'Thrust', color: '#FB923C', value: (p) => p.F, area: true, unit: ' N' }]} theme={chartTheme} height={220} xLabel="time (s)" />
      </div>
      <div className="p-2"><MotorPicker /></div>
    </div>
  );
}

function FlightView() {
  const { design: d, r, stale } = useEngineering();
  const mc = useMemo(() => monteCarlo(d, 120), [d]);
  const ascent = r.series.filter((p) => p.t <= r.tApogee + 0.5);
  const events = [
    ['Liftoff', 0], ['Rail exit', 0.25], ['Burnout', r.tBurnout], ['Max-Q', r.tBurnout * 0.9], ['Apogee · drogue', r.tApogee], ['Main deploy', r.tApogee + (r.apogee - d.mainDeploy) / r.descentDrogue], ['Landing', r.tLanding]
  ].sort((x, y) => (x[1] as number) - (y[1] as number));
  return (
    <div className="thin-scroll flex-1 overflow-y-auto">
      <PageHead title="Flight simulation" sub="6-DOF · DP5(4) adaptive · ISA atmosphere + GFS wind profile" right={stale ? <span className="flex items-center gap-1.5 rounded-md border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-2.5 py-1 text-[12px] text-[#FBBF24]"><AlertTriangle size={13} /> Preview — design changed since last run</span> : <span className="flex items-center gap-1.5 text-[12px] text-[#34D399]"><CheckCircle2 size={13} /> Committed run r{useDesignStore.getState().simRev}</span>} />
      <div className={cn('grid grid-cols-2 gap-3 p-5 lg:grid-cols-5', stale && 'opacity-75')}>
        <Stat k="Apogee" v={`${fmt(ft(r.apogee))} ft`} sub={`${fmt(r.apogee)} m AGL`} />
        <Stat k="Max velocity" v={`${fmt(r.vmax)} m/s`} sub={`Mach ${r.machMax.toFixed(2)}`} tone={r.machMax > 0.8 ? STATE_COLOR.warn : undefined} />
        <Stat k="Max accel" v={`${(r.amax / 9.81).toFixed(1)} g`} />
        <Stat k="Time to apogee" v={`${r.tApogee.toFixed(1)} s`} />
        <Stat k="Flight time" v={`${r.tLanding.toFixed(0)} s`} sub={`Drift ${fmt(r.drift)} m`} />
      </div>
      <div className="grid gap-3 px-5 pb-5 xl:grid-cols-[1fr_300px]">
        <div className="rounded-lg border p-3" style={{ borderColor: C.line, background: C.panel }}>
          <div className="mb-1 flex items-center justify-between px-1 text-[12px] text-[#8A9099]"><span>Altitude</span><span className="font-geist-mono text-[11px] text-[#5D636C]">m AGL</span></div>
          <LineChart data={ascent} x={(p) => p.t} series={[{ key: 'h', label: 'Altitude', color: C.accent, value: (p) => p.h, area: true, unit: ' m' }]} theme={chartTheme} height={170} markers={[{ x: r.tBurnout, label: 'burnout', color: '#FB923C' }, { x: r.tApogee, label: 'apogee', color: C.accent }]} />
          <div className="mt-2 mb-1 flex items-center gap-4 px-1 text-[12px] text-[#8A9099]"><span className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-[#A78BFA]" />Velocity m/s</span><span className="flex items-center gap-1.5"><i className="h-0.5 w-3 bg-[#FB923C]" />Acceleration m/s²</span></div>
          <LineChart data={ascent} x={(p) => p.t} series={[{ key: 'v', label: 'Velocity', color: '#A78BFA', value: (p) => p.v, unit: ' m/s' }, { key: 'a', label: 'Accel', color: '#FB923C', value: (p) => p.a, dash: '4 3', unit: ' m/s²' }]} theme={chartTheme} height={130} xLabel="t (s)" />
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: C.line, background: C.panel }}>
          <div className="mb-2 flex justify-between px-1 text-[12px] text-[#8A9099]"><span>Landing dispersion</span><span className="font-geist-mono text-[11px] text-[#5D636C]">n=120 · 1σ/2σ</span></div>
          <Dispersion pts={mc} theme={chartTheme} color={C.accent} size={270} />
        </div>
      </div>
      <div className="mx-5 mb-6 rounded-lg border" style={{ borderColor: C.line, background: C.panel }}>
        <div className="border-b px-4 py-2.5 text-[12px] text-[#8A9099]" style={{ borderColor: C.line }}>Event timeline</div>
        {events.map(([n, t]) => (
          <div key={n} className="flex items-center gap-3 border-b px-4 py-2 text-[12.5px] last:border-0" style={{ borderColor: C.line }}>
            <span className="tnum w-16 font-geist-mono text-[#5D636C]">T+{(t as number).toFixed(1)}s</span>
            <span className="size-1.5 rounded-full" style={{ background: C.accent }} />
            <span className="text-[#C9CDD3]">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VerifyView() {
  const { gates, stale } = useEngineering();
  const counts = { pass: 0, warn: 0, fail: 0 };
  gates.forEach((g) => counts[g.state]++);
  return (
    <div className="thin-scroll flex-1 overflow-y-auto">
      <PageHead title="Verification" sub="Spaceport America Cup 2027 · DTEG v1.6 rule set · gates are modelled checks, not certification" right={<button onClick={() => toast.success('Flight readiness report queued', { description: 'PDF + CSV evidence bundle · 14 pages' })} className="rounded-md px-3 py-1.5 text-[12px] font-medium text-[#0A0B0D]" style={{ background: C.accent }}>Generate FRR packet</button>} />
      <div className="flex gap-6 px-5 pt-4 text-[12.5px]">
        {(['pass', 'warn', 'fail'] as const).map((s) => <span key={s} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: STATE_COLOR[s] }} />{counts[s]} {s === 'pass' ? 'passing' : s === 'warn' ? 'caution' : 'failing'}</span>)}
        {stale && <span className="text-[#FBBF24]">· evaluated against preview results</span>}
      </div>
      <div className="m-5 overflow-hidden rounded-lg border" style={{ borderColor: C.line }}>
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-left text-[11px] text-[#5D636C]" style={{ background: C.panel }}><th className="px-4 py-2 font-normal">Gate</th><th className="px-4 py-2 font-normal">Value</th><th className="hidden px-4 py-2 font-normal sm:table-cell">Criterion</th><th className="px-4 py-2 font-normal">Status</th></tr></thead>
          <tbody>
            {gates.map((g) => (
              <tr key={g.id} className="border-t" style={{ borderColor: C.line }}>
                <td className="px-4 py-2.5 text-[#C9CDD3]">{g.label}</td>
                <td className="tnum px-4 py-2.5 font-geist-mono">{g.value}</td>
                <td className="hidden px-4 py-2.5 font-geist-mono text-[#6B717A] sm:table-cell">{g.rule}</td>
                <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium" style={{ color: STATE_COLOR[g.state], background: `${STATE_COLOR[g.state]}14` }}>{g.state === 'pass' ? <CheckCircle2 size={11} /> : g.state === 'warn' ? <AlertTriangle size={11} /> : <XCircle size={11} />}{g.state === 'pass' ? 'Pass' : g.state === 'warn' ? 'Caution' : 'Fail'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MissionView() {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  return (
    <div className="thin-scroll flex-1 overflow-y-auto">
      <PageHead title="Mission requirements" sub="These drive every downstream gate. Changing them re-evaluates Verify." />
      <div className="grid gap-3 p-5 md:grid-cols-3">
        {[['SA Cup · 10k COTS', 3048], ['SA Cup · 30k SRAD', 9144], ['NASA Student Launch', 1372]].map(([n, h]) => (
          <button key={n} onClick={() => set({ targetApogee: h as number })} className={cn('rounded-lg border p-4 text-left', Math.abs(d.targetApogee - (h as number)) < 1 ? 'border-[#67E8F9]/40 bg-[#67E8F9]/[0.05]' : 'hover:border-white/15')} style={{ borderColor: Math.abs(d.targetApogee - (h as number)) < 1 ? undefined : C.line }}>
            <div className="text-[13px] font-medium">{n}</div>
            <div className="mt-1 font-geist-mono text-[12px] text-[#6B717A]">Target {fmt(ft(h as number))} ft AGL</div>
          </button>
        ))}
      </div>
      <div className="mx-5 max-w-md rounded-lg border" style={{ borderColor: C.line, background: C.panel }}>
        <Section title="Targets">
          <ScrubField label="Target apogee" value={d.targetApogee} onChange={(v) => set({ targetApogee: v })} min={300} max={10000} step={10} unit="ft" scale={3.28084} />
          <ScrubField label="Payload mass" value={d.payload} onChange={(v) => set({ payload: v })} min={0} max={8} step={0.05} unit="kg" digits={2} />
        </Section>
        <Section title="Launch site">
          <div className="py-1 text-[12.5px] text-[#C9CDD3]">Spaceport America · Vertical Launch Area</div>
          <div className="font-geist-mono text-[11.5px] text-[#5D636C]">32.94°N 106.92°W · 1 401 m MSL</div>
        </Section>
      </div>
    </div>
  );
}

function AeroView() {
  const { a } = useEngineering();
  const data = useMemo(() => Array.from({ length: 60 }, (_, i) => { const M = i * 0.03; const cd = a.cd * (M < 0.8 ? 1 : M < 1.05 ? 1 + 1.6 * (M - 0.8) / 0.25 : M < 1.4 ? 2.6 - 1.4 * (M - 1.05) / 0.35 : 1.2); return { M, cd }; }), [a.cd]);
  return (
    <div className="thin-scroll flex-1 overflow-y-auto">
      <PageHead title="Aerodynamics" sub="Drag build-up and normal-force slope. Above M 0.8 values are extrapolated." />
      <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
        <Stat k="Cd (subsonic)" v={a.cd.toFixed(3)} />
        <Stat k="CNα total" v={(2 + a.finCNa).toFixed(2)} sub="per rad" />
        <Stat k="CP from nose" v={`${fmt(a.cp * 1000)} mm`} />
        <Stat k="Fin CNα" v={a.finCNa.toFixed(2)} />
      </div>
      <div className="mx-5 rounded-lg border p-3" style={{ borderColor: C.line, background: C.panel }}>
        <div className="mb-1 px-1 text-[12px] text-[#8A9099]">Cd vs Mach</div>
        <LineChart data={data} x={(p) => +p.M.toFixed(2)} series={[{ key: 'cd', label: 'Cd', color: C.accent, value: (p) => p.cd, digits: 3 }]} theme={chartTheme} height={240} xLabel="Mach" markers={[{ x: 0.8, label: 'model limit', color: STATE_COLOR.warn }]} />
      </div>
    </div>
  );
}

function RecoveryView() {
  const { r } = useEngineering();
  return (
    <div className="thin-scroll flex-1 overflow-y-auto">
      <PageHead title="Recovery" sub="Dual-deploy · drogue at apogee, main at altitude" />
      <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
        <Stat k="Drogue descent" v={`${r.descentDrogue.toFixed(1)} m/s`} />
        <Stat k="Main descent" v={`${r.descentMain.toFixed(1)} m/s`} tone={r.descentMain <= 7.6 ? STATE_COLOR.pass : STATE_COLOR.warn} sub="Limit 7.6 m/s" />
        <Stat k="Descent time" v={`${(r.tLanding - r.tApogee).toFixed(0)} s`} />
        <Stat k="Drift" v={`${fmt(r.drift)} m`} />
      </div>
      <div className="mx-5 max-w-md rounded-lg border" style={{ borderColor: C.line, background: C.panel }}><RecoveryFields /></div>
    </div>
  );
}

function FabView() {
  const d = useDesignStore((s) => s.design);
  const items = useMemo(() => massItems(d), [d]);
  const cost: Record<string, number> = { nose: 189, payload: 0, main: 245, avionics: 610, drogue: 72, body: 312, fins: 96, mount: 58, motor: 365 };
  return (
    <div className="thin-scroll flex-1 overflow-y-auto">
      <PageHead title="Fabrication" sub="Bill of materials, cut list and fin templates from the current revision" right={<button onClick={() => toast.success('Build package exported', { description: 'BOM.csv · fin-template.dxf · airframe.step' })} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] text-[#C9CDD3] hover:bg-white/5" style={{ borderColor: C.line }}><Download size={13} /> Export build package</button>} />
      <div className="m-5 overflow-hidden rounded-lg border" style={{ borderColor: C.line }}>
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-left text-[11px] text-[#5D636C]" style={{ background: C.panel }}><th className="px-4 py-2 font-normal">Item</th><th className="px-4 py-2 text-right font-normal">Mass</th><th className="px-4 py-2 text-right font-normal">Est. cost</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t" style={{ borderColor: C.line }}><td className="px-4 py-2 text-[#C9CDD3]">{i.label}</td><td className="tnum px-4 py-2 text-right font-geist-mono">{fmt(i.mass * 1000)} g</td><td className="tnum px-4 py-2 text-right font-geist-mono text-[#8A9099]">${fmt(cost[i.id] ?? 0)}</td></tr>
            ))}
            <tr className="border-t" style={{ borderColor: C.line, background: C.panel }}><td className="px-4 py-2 font-medium">Total</td><td /><td className="tnum px-4 py-2 text-right font-geist-mono font-medium">${fmt(Object.values(cost).reduce((a, b) => a + b, 0))}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── command palette ───────────────────────── */

function Palette({ open, setOpen, setStage, setPart, run, setView }: { open: boolean; setOpen: (b: boolean) => void; setStage: (s: Stage) => void; setPart: (p: Part) => void; run: () => void; setView: (v: ViewMode) => void }) {
  const set = useDesignStore((s) => s.set);
  const reset = useDesignStore((s) => s.reset);
  const go = (fn: () => void) => () => { fn(); setOpen(false); };
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-[#C9CDD3] data-[selected=true]:bg-white/[0.07] data-[selected=true]:text-white';
  const group = 'px-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:text-[#5D636C]';
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-[14vh] left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-white/10 bg-[#121417] font-geist shadow-2xl" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command loop>
            <div className="flex items-center gap-2 border-b border-white/[0.07] px-3.5">
              <CmdIcon size={15} className="text-[#5D636C]" />
              <Command.Input autoFocus placeholder="Type a command or search…" className="h-12 flex-1 bg-transparent text-[14px] text-[#E6E8EB] outline-none placeholder:text-[#5D636C]" />
            </div>
            <Command.List className="thin-scroll max-h-[360px] overflow-y-auto pb-2">
              <Command.Empty className="px-4 py-6 text-center text-[13px] text-[#5D636C]">No matches.</Command.Empty>
              <Command.Group heading="Actions" className={group}>
                <Command.Item onSelect={go(run)} className={item}><Play size={14} /> Run 6-DOF simulation <span className="ml-auto"><Kbd>⌘↵</Kbd></span></Command.Item>
                <Command.Item onSelect={go(() => { setStage('flight'); toast('Monte Carlo · 500 runs queued on 12 threads'); })} className={item}><Activity size={14} /> Run Monte Carlo dispersion (500)</Command.Item>
                <Command.Item onSelect={go(() => setView('xray'))} className={item}><Scan size={14} /> Viewport: X-ray</Command.Item>
                <Command.Item onSelect={go(() => setView('solid'))} className={item}><Eye size={14} /> Viewport: Solid</Command.Item>
                <Command.Item onSelect={go(() => { reset(); toast('Design reset'); })} className={item}><RotateCcw size={14} /> Reset to baseline</Command.Item>
              </Command.Group>
              <Command.Group heading="Go to" className={group}>
                {STAGES.map((s) => <Command.Item key={s.id} onSelect={go(() => setStage(s.id))} className={item}><s.icon size={14} /> {s.label} <span className="ml-auto"><Kbd>{s.key}</Kbd></span></Command.Item>)}
              </Command.Group>
              <Command.Group heading="Select part" className={group}>
                {TREE.map((n) => <Command.Item key={n.id} onSelect={go(() => { setStage('airframe'); setPart(n.id); })} className={item}><n.icon size={14} /> {n.label}</Command.Item>)}
              </Command.Group>
              <Command.Group heading="Swap motor" className={group}>
                {MOTORS.map((m) => <Command.Item key={m.id} value={`motor ${m.name} ${m.maker} ${m.cls}`} onSelect={go(() => { set({ motorId: m.id }); toast(`Motor set to ${m.maker} ${m.name}`); })} className={item}><Flame size={14} /> {m.maker} {m.name} <span className="ml-auto font-geist-mono text-[11px] text-[#5D636C]">{fmt(m.impulse)} N·s</span></Command.Item>)}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
