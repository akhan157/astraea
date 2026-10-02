import { Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube, Line } from '@react-three/drei';
import { Projector } from '../../shared/Anchors';
import * as THREE from 'three';
import { AnimatePresence, motion } from 'motion/react';
import { DropdownMenu, Tabs } from 'radix-ui';
import { Toaster, toast } from 'sonner';
import {
  Cone, Cylinder, Triangle, Disc, Flame, Umbrella, Cpu, Ruler, Scissors, Crosshair, Scale, Activity, Dices, FileText, Wind,
  PenTool, ListChecks, Box, Eye, EyeOff, ChevronDown, ChevronRight, Folder, Move3d, Hand, ZoomIn, Maximize, Grid3x3,
  SkipBack, StepBack, StepForward, SkipForward, Undo2, Redo2, Save, Search, X, Check, Layers, Shapes, CircleDot, RotateCw, Copy, Circle, Lock
} from 'lucide-react';
import { useDesignStore, useEngineering } from '../../shared/store';
import { MOTORS, massItems, monteCarlo, motorById, type Design, type NoseShape } from '../../shared/model';
import { RocketModel } from '../../shared/Rocket3D';
import { Dispersion, LineChart, type ChartTheme } from '../../shared/charts';
import { cn, fmt, ft } from '../../shared/format';

/* Light parametric-CAD chrome: cool greys, one confident blue. */
const R = { chrome: '#ECEEF1', panel: '#FFFFFF', panel2: '#F6F7F9', line: '#D8DCE2', lineSoft: '#E7E9ED', fg: '#1D232B', muted: '#5F6873', dim: '#8A929C', blue: '#0D6EFD', blueSoft: '#E7F0FF', sel: '#F59E0B' };
const chartTheme: ChartTheme = { grid: '#ECEEF1', axis: '#B7BDC6', text: '#6B737D', font: 'JetBrains Mono, monospace', crosshair: '#0D6EFD', tooltipBg: '#1D232B', tooltipFg: '#fff' };

type FeatureId = 'origin' | 'sketch1' | 'nose' | 'body' | 'shell' | 'sketch2' | 'fin' | 'pattern' | 'motor' | 'band';
const FEATURES: { id: FeatureId; label: string; icon: typeof Box; part?: string }[] = [
  { id: 'origin', label: 'Origin', icon: Crosshair },
  { id: 'sketch1', label: 'Sketch1 · Profile', icon: PenTool },
  { id: 'nose', label: 'Revolve1 · Nose cone', icon: RotateCw, part: 'nose' },
  { id: 'body', label: 'Extrude1 · Body tube', icon: Cylinder, part: 'body' },
  { id: 'shell', label: 'Shell1 · Wall', icon: Layers },
  { id: 'sketch2', label: 'Sketch2 · Fin planform', icon: PenTool },
  { id: 'fin', label: 'Extrude2 · Fin', icon: Triangle },
  { id: 'pattern', label: 'Pattern1 · Fins', icon: Copy, part: 'fins' },
  { id: 'motor', label: 'Joint1 · Motor mount', icon: Flame, part: 'motor' },
  { id: 'band', label: 'Extrude3 · Coupler', icon: Disc, part: 'band' }
];

type Display = 'shaded' | 'edges' | 'wire';
type Drawer = null | 'stability' | 'flight' | 'mc';

export default function Ribbon() {
  const eng = useEngineering();
  const [tab, setTab] = useState('design');
  const [edit, setEdit] = useState<FeatureId | null>('pattern');
  const [rollback, setRollback] = useState(FEATURES.length);
  const [hidden, setHidden] = useState<string[]>([]);
  const [display, setDisplay] = useState<Display>('edges');
  const [section, setSection] = useState(false);
  const [measure, setMeasure] = useState(false);
  const [markers, setMarkers] = useState(true);
  const [grid, setGrid] = useState(true);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [selected, setSelected] = useState<string | null>('fins');

  const rolledBack = FEATURES.slice(rollback).map((f) => f.part).filter(Boolean) as string[];
  const hide = [...hidden, ...rolledBack];

  const openFeature = (f: FeatureId) => { setEdit(f); const p = FEATURES.find((x) => x.id === f)?.part; if (p) setSelected(p); };

  return (
    <div className="flex h-full flex-col overflow-hidden font-instrument text-[12.5px]" style={{ background: R.chrome, color: R.fg }}>
      {/* title bar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2" style={{ borderColor: R.line, background: '#E3E6EA' }}>
        <div className="flex items-center gap-1.5 px-1.5"><AstraeaGlyph /><span className="hidden text-[12px] font-semibold sm:inline">Astraea</span></div>
        <div className="flex items-center gap-0.5 pl-1">
          {[Save, Undo2, Redo2].map((I, i) => <button key={i} aria-label={['Save', 'Undo', 'Redo'][i]} className="grid size-7 place-items-center rounded text-[#4C5560] hover:bg-black/5" onClick={() => i === 0 && toast('Saved · version 15')}><I size={14} /></button>)}
        </div>
        <div className="ml-2 flex h-full items-end gap-px">
          <div className="flex h-[30px] items-center gap-2 rounded-t-md border border-b-0 px-3 text-[12px]" style={{ background: R.chrome, borderColor: R.line }}><Box size={12} style={{ color: R.blue }} /> Kestrel IV <span style={{ color: R.dim }}>v14</span></div>
          <div className="hidden h-[30px] items-center gap-2 px-3 text-[12px] sm:flex" style={{ color: R.muted }}><Box size={12} /> Fin can jig</div>
        </div>
        <div className="flex-1" />
        <div className="hidden h-6 w-56 items-center gap-1.5 rounded-md border bg-white px-2 text-[11.5px] md:flex" style={{ borderColor: R.line, color: R.dim }}><Search size={12} /> Search commands</div>
        <span className="ml-2 grid size-6 place-items-center rounded-full bg-[#A78BFA] text-[10px] font-semibold text-white">AK</span>
      </div>

      {/* ribbon */}
      <Tabs.Root value={tab} onValueChange={setTab} className="shrink-0 border-b" style={{ borderColor: R.line, background: R.chrome }}>
        <Tabs.List className="flex gap-0.5 px-2 pt-1">
          {[['design', 'DESIGN'], ['simulate', 'SIMULATE'], ['inspect', 'INSPECT'], ['manufacture', 'MANUFACTURE']].map(([v, l]) => (
            <Tabs.Trigger key={v} value={v} className="rounded-t-md px-3 py-1 text-[11.5px] font-semibold tracking-wide text-[#5F6873] data-[state=active]:bg-white data-[state=active]:text-[#0D6EFD] data-[state=active]:shadow-[0_-1px_0_#D8DCE2,1px_0_0_#D8DCE2,-1px_0_0_#D8DCE2]">{l}</Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="no-scrollbar flex h-[78px] items-stretch gap-0 overflow-x-auto border-t bg-white px-1" style={{ borderColor: R.line }}>
          {tab === 'design' && <>
            <Group label="CREATE">
              <Tool icon={Cone} label="Nose" onClick={() => openFeature('nose')} />
              <Tool icon={Cylinder} label="Body" onClick={() => openFeature('body')} />
              <Tool icon={Triangle} label="Fins" onClick={() => openFeature('pattern')} />
              <Tool icon={Shapes} label="Transition" onClick={() => toast('Transition: select two body tubes of different diameter')} />
              <Tool icon={Disc} label="Bulkhead" onClick={() => toast('Bulkhead: pick a station on the body tube')} />
            </Group>
            <Group label="ASSEMBLE">
              <Tool icon={Flame} label="Motor" onClick={() => openFeature('motor')} />
              <Tool icon={Umbrella} label="Recovery" onClick={() => toast('Recovery bay inserted at 830 mm')} />
              <Tool icon={Cpu} label="Avionics" onClick={() => toast('Avionics sled: choose a template')} />
            </Group>
            <Group label="MODIFY">
              <Tool icon={Move3d} label="Press pull" small onClick={() => toast('Press pull: select a face')} />
              <Tool icon={Scale} label="Material" small onClick={() => openFeature('body')} />
            </Group>
          </>}
          {tab === 'simulate' && <>
            <Group label="STUDIES">
              <Tool icon={Crosshair} label="Stability" onClick={() => setDrawer('stability')} active={drawer === 'stability'} />
              <Tool icon={Activity} label="Flight" onClick={() => setDrawer('flight')} active={drawer === 'flight'} />
              <Tool icon={Dices} label="Monte Carlo" onClick={() => setDrawer('mc')} active={drawer === 'mc'} />
              <Tool icon={Wind} label="CFD" onClick={() => toast('CFD study requires the solver add-in')} lock />
            </Group>
            <Group label="RESULTS"><Tool icon={ListChecks} label="Checks" onClick={() => setDrawer('stability')} /><Tool icon={FileText} label="Report" onClick={() => toast.success('Report generated', { description: 'Kestrel-IV-v14-FRR.pdf' })} /></Group>
          </>}
          {tab === 'inspect' && <>
            <Group label="INSPECT">
              <Tool icon={Ruler} label="Measure" onClick={() => setMeasure(!measure)} active={measure} />
              <Tool icon={Scissors} label="Section" onClick={() => setSection(!section)} active={section} />
              <Tool icon={CircleDot} label="CG / CP" onClick={() => setMarkers(!markers)} active={markers} />
              <Tool icon={Scale} label="Mass props" onClick={() => setDrawer('stability')} />
            </Group>
          </>}
          {tab === 'manufacture' && <>
            <Group label="OUTPUT">
              <Tool icon={Triangle} label="Fin template" onClick={() => toast.success('fin-template.dxf exported at 1:1')} />
              <Tool icon={ListChecks} label="Cut list" onClick={() => toast.success('cut-list.csv exported')} />
              <Tool icon={Box} label="STEP" onClick={() => toast.success('kestrel-iv.step exported')} />
              <Tool icon={Box} label="STL" onClick={() => toast.success('nose-cone.stl exported')} />
            </Group>
          </>}
        </div>
      </Tabs.Root>

      <div className="flex min-h-0 flex-1">
        <Browser hide={hide} hidden={hidden} setHidden={setHidden} selected={selected} setSelected={setSelected} openFeature={openFeature} />
        <div className="relative min-w-0 flex-1">
          <Suspense fallback={null}>
            <Viewport hide={hide} display={display} section={section} measure={measure} markers={markers} grid={grid} selected={selected} setSelected={setSelected} />
          </Suspense>
          <div className="pointer-events-none absolute top-3 left-3 font-jb text-[10.5px]" style={{ color: R.dim }}>{section ? 'SECTION · XY plane' : 'HOME'}</div>
          <AnimatePresence>{edit && <FeatureDialog key={edit} id={edit} onClose={() => setEdit(null)} />}</AnimatePresence>
          <NavBar display={display} setDisplay={setDisplay} section={section} setSection={setSection} grid={grid} setGrid={setGrid} />
          <PropsCard />
          <AnimatePresence>{drawer && <ResultsDrawer kind={drawer} setKind={setDrawer} />}</AnimatePresence>
          {rollback < FEATURES.length && <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-[#1D232B] px-3 py-1.5 text-[11.5px] text-white shadow-lg">Rolled back to {FEATURES[rollback - 1]?.label ?? 'start'} · features after the marker are suppressed</div>}
        </div>
      </div>

      <Timeline rollback={rollback} setRollback={setRollback} edit={edit} openFeature={openFeature} />
      <div className="flex h-6 shrink-0 items-center gap-4 border-t px-3 font-jb text-[10.5px]" style={{ borderColor: R.line, background: '#E3E6EA', color: R.muted }}>
        <span>{selected ? `1 body selected · ${({ nose: 'Nose cone', body: 'Body tube', fins: 'Fin set', motor: 'Motor mount', band: 'Coupler' } as Record<string, string>)[selected] ?? selected}` : 'Nothing selected'}</span>
        <span className="flex-1" />
        <span className="hidden sm:inline">Mass {eng.a.massLiftoff.toFixed(3)} kg</span>
        <span className="hidden sm:inline">Units mm</span>
        <span>{eng.stale ? 'Studies out of date' : 'Studies current'}</span>
      </div>
      <Toaster position="bottom-right" offset={60} toastOptions={{ style: { fontFamily: 'Instrument Sans', borderRadius: 8, border: `1px solid ${R.line}` } }} />
    </div>
  );
}

function AstraeaGlyph() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M12 2 L16 15 L12 13 L8 15 Z" fill={R.blue} /><path d="M5 20 Q12 13.5 19 20" stroke={R.fg} strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col border-r px-1.5 pt-1.5 last:border-0" style={{ borderColor: R.lineSoft }}>
      <div className="flex flex-1 items-start gap-0.5">{children}</div>
      <div className="flex items-center justify-center gap-0.5 pb-1 text-[9.5px] font-semibold tracking-[0.08em]" style={{ color: R.dim }}>{label} <ChevronDown size={9} /></div>
    </div>
  );
}

function Tool({ icon: I, label, onClick, active, lock, small }: { icon: typeof Box; label: string; onClick?: () => void; active?: boolean; lock?: boolean; small?: boolean }) {
  return (
    <button onClick={onClick} className={cn('relative flex min-w-[54px] flex-col items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] leading-tight whitespace-nowrap transition-colors', active ? 'bg-[#E7F0FF] text-[#0D6EFD]' : 'text-[#2E3640] hover:bg-[#F1F3F6]')}>
      <I size={small ? 18 : 22} strokeWidth={1.4} style={{ color: active ? R.blue : undefined }} />
      <span className="text-center">{label}</span>
      {lock && <Lock size={9} className="absolute top-1 right-2" style={{ color: R.dim }} />}
    </button>
  );
}

/* ───────────────────────── browser ───────────────────────── */

function Browser({ hide, hidden, setHidden, selected, setSelected, openFeature }: { hide: string[]; hidden: string[]; setHidden: (h: string[]) => void; selected: string | null; setSelected: (s: string) => void; openFeature: (f: FeatureId) => void }) {
  const d = useDesignStore((s) => s.design);
  const items = massItems(d);
  const [open, setOpen] = useState<Record<string, boolean>>({ bodies: true, sketches: false, studies: true });
  const bodies: [string, string, FeatureId, number][] = [['nose', 'Nose cone', 'nose', items[0].mass], ['body', 'Body tube', 'body', items[5].mass], ['fins', `Fin set (${d.finCount})`, 'pattern', items[6].mass], ['motor', `Motor · ${d.motorId}`, 'motor', items[8].mass], ['band', 'Coupler band', 'band', 0.04]];
  const toggle = (p: string) => setHidden(hidden.includes(p) ? hidden.filter((x) => x !== p) : [...hidden, p]);
  const Row = ({ depth, icon: I, label, children, onClick, active, right }: { depth: number; icon: typeof Box; label: string; children?: ReactNode; onClick?: () => void; active?: boolean; right?: ReactNode }) => (
    <div onClick={onClick} className={cn('group flex h-[24px] cursor-default items-center gap-1.5 pr-2 text-[12px]', active ? 'bg-[#E7F0FF]' : 'hover:bg-[#F1F3F6]')} style={{ paddingLeft: 8 + depth * 14 }}>
      {children}
      <I size={13} strokeWidth={1.5} style={{ color: active ? R.blue : R.muted }} />
      <span className="flex-1 truncate">{label}</span>
      {right}
    </div>
  );
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r md:flex" style={{ borderColor: R.line, background: R.panel }}>
      <div className="flex h-8 items-center justify-between border-b px-3 text-[11px] font-semibold tracking-[0.06em]" style={{ borderColor: R.lineSoft, color: R.muted }}>BROWSER <ChevronDown size={12} /></div>
      <div className="thin-scroll flex-1 overflow-y-auto py-1">
        <Row depth={0} icon={Box} label="Kestrel IV v14" />
        <Row depth={1} icon={Folder} label="Document settings"><span className="w-3" /></Row>
        <Row depth={1} icon={Crosshair} label="Origin"><span className="w-3" /></Row>
        <Row depth={1} icon={Folder} label="Bodies" onClick={() => setOpen({ ...open, bodies: !open.bodies })}>{open.bodies ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</Row>
        {open.bodies && bodies.map(([id, label, f, m]) => (
          <Row key={id} depth={2} icon={Box} label={label} active={selected === id} onClick={() => { setSelected(id); openFeature(f); }}
            right={<>
              <span className="font-jb text-[10px] opacity-0 group-hover:opacity-100" style={{ color: R.dim }}>{fmt(m * 1000)} g</span>
              <button aria-label={`Toggle ${label}`} onClick={(e) => { e.stopPropagation(); toggle(id); }} className="grid size-5 place-items-center rounded hover:bg-black/5" style={{ color: hide.includes(id) ? R.dim : R.muted }}>{hide.includes(id) ? <EyeOff size={12} /> : <Eye size={12} />}</button>
            </>}
          ><span className="w-3" /></Row>
        ))}
        <Row depth={1} icon={Folder} label="Sketches" onClick={() => setOpen({ ...open, sketches: !open.sketches })}>{open.sketches ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</Row>
        {open.sketches && ['Profile', 'Fin planform'].map((s, i) => <Row key={s} depth={2} icon={PenTool} label={s} onClick={() => openFeature(i ? 'sketch2' : 'sketch1')}><span className="w-3" /></Row>)}
        <Row depth={1} icon={Folder} label="Studies" onClick={() => setOpen({ ...open, studies: !open.studies })}>{open.studies ? <ChevronDown size={11} /> : <ChevronRight size={11} />}</Row>
        {open.studies && ['Stability · static', 'Flight · 6-DOF', 'Dispersion · 200 runs'].map((s) => <Row key={s} depth={2} icon={Activity} label={s}><span className="w-3" /></Row>)}
      </div>
      <div className="border-t p-3 text-[11px]" style={{ borderColor: R.lineSoft, color: R.muted }}>
        <div className="mb-1 font-semibold tracking-[0.06em]">COMMENTS</div>
        <div className="rounded-md p-2" style={{ background: R.panel2 }}><b className="font-semibold text-[#1D232B]">MR</b> Can we get the fin LE sweep under 120? Flutter margin is thin.</div>
      </div>
    </aside>
  );
}

/* ───────────────────────── viewport ───────────────────────── */

function Viewport({ hide, display, section, measure, markers, grid, selected, setSelected }: { hide: string[]; display: Display; section: boolean; measure: boolean; markers: boolean; grid: boolean; selected: string | null; setSelected: (s: string) => void }) {
  const { design: d, a } = useEngineering();
  const L = a.length;
  const clip = useMemo(() => (section ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)] : []), [section]);
  const grp = useRef<THREE.Group>(null);
  const t1 = useRef<HTMLSpanElement>(null), t2 = useRef<HTMLSpanElement>(null), t3 = useRef<HTMLSpanElement>(null);
  return (
    <>
    <Canvas shadows dpr={[1, 2]} camera={{ position: [1.6, 1.3, 3.2], fov: 32 }} onCreated={({ gl }) => { gl.localClippingEnabled = true; }} style={{ background: 'linear-gradient(180deg,#F8F9FB 0%,#E4E8EE 100%)' }}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 5, 4]} intensity={1.3} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.45} />
      <group ref={grp} rotation={[0, 0, -Math.PI / 2]} position={[-L / 2, 0.2, 0]} onPointerDown={(e) => {
        e.stopPropagation();
        const fromNose = L - (e.point.x + L / 2);
        setSelected(fromNose < d.noseLength ? 'nose' : Math.abs(e.point.y - 0.2) > (d.diameter / 2) * 1.05 || Math.abs(e.point.z) > (d.diameter / 2) * 1.05 ? 'fins' : 'body');
      }}>
        <RocketModel d={d} cg={a.cg} cp={a.cp} showMarkers={markers} look={{ body: '#C9CED6', nose: '#D6DAE0', fins: '#B4BBC5', accent: '#8C95A1', roughness: 0.55, metalness: 0.05, wireframe: display === 'wire', edges: display === 'edges' ? '#2A313A' : undefined, hide, clip, highlight: selected, highlightColor: '#5B9BFF' }} />
        {measure && (
          <group>
            <Line points={[[d.diameter * 1.6, 0, 0], [d.diameter * 1.6, L, 0]]} color={R.blue} lineWidth={1.5} />
            <Line points={[[-d.diameter / 2, d.bodyLength * 0.4, 0], [d.diameter / 2, d.bodyLength * 0.4, 0]]} color={R.blue} lineWidth={1.5} />
          </group>
        )}
      </group>
      {grid && <Grid position={[0, -0.12, 0]} args={[10, 10]} cellSize={0.05} cellThickness={0.5} cellColor="#CDD3DB" sectionSize={0.25} sectionThickness={0.9} sectionColor="#B3BBC6" fadeDistance={7} infiniteGrid />}
      <OrbitControls makeDefault enableDamping target={[0, 0.2, 0]} minDistance={0.6} maxDistance={7} />
      <GizmoHelper alignment="top-right" margin={[70, 70]}>
        <GizmoViewcube color="#F4F6F9" hoverColor="#BFD6FF" textColor="#3A434E" strokeColor="#9AA3AE" opacity={1} faces={['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK']} />
      </GizmoHelper>
      {measure && <Projector parent={grp} anchors={[{ local: [d.diameter * 1.9, L / 2, 0], el: t1 }, { local: [0, d.bodyLength * 0.4 - 0.08, 0], el: t2 }, { local: [d.diameter / 2 + d.finSpan, d.finRoot / 2, 0], el: t3 }]} />}
    </Canvas>
    {measure && <>
      <span ref={t1} className="pointer-events-none absolute top-0 left-0"><MeasureTag>{fmt(L * 1000)} mm</MeasureTag></span>
      <span ref={t2} className="pointer-events-none absolute top-0 left-0"><MeasureTag>Ø {fmt(d.diameter * 1000)} mm</MeasureTag></span>
      <span ref={t3} className="pointer-events-none absolute top-0 left-0"><MeasureTag>span {fmt(d.finSpan * 1000)}</MeasureTag></span>
    </>}
    </>
  );
}

function MeasureTag({ children }: { children: ReactNode }) {
  return <span className="inline-block -translate-x-1/2 -translate-y-1/2 rounded bg-[#0D6EFD] px-1.5 py-0.5 font-jb text-[10.5px] whitespace-nowrap text-white shadow">{children}</span>;
}

function NavBar({ display, setDisplay, section, setSection, grid, setGrid }: { display: Display; setDisplay: (d: Display) => void; section: boolean; setSection: (b: boolean) => void; grid: boolean; setGrid: (b: boolean) => void }) {
  const btn = (active?: boolean) => cn('grid size-7 place-items-center rounded', active ? 'bg-[#E7F0FF] text-[#0D6EFD]' : 'text-[#4C5560] hover:bg-[#F1F3F6]');
  return (
    <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-white p-0.5 shadow-[0_4px_14px_rgba(29,35,43,.12)]" style={{ borderColor: R.line }}>
      <button aria-label="Orbit" className={btn(true)}><RotateCw size={14} /></button>
      <button aria-label="Pan" className={btn()}><Hand size={14} /></button>
      <button aria-label="Zoom" className={btn()}><ZoomIn size={14} /></button>
      <button aria-label="Fit" className={btn()}><Maximize size={14} /></button>
      <span className="mx-0.5 h-4 w-px" style={{ background: R.line }} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className="flex h-7 items-center gap-1 rounded px-2 text-[11.5px] text-[#2E3640] outline-none hover:bg-[#F1F3F6]"><Box size={13} /> {({ shaded: 'Shaded', edges: 'Shaded + edges', wire: 'Wireframe' } as const)[display]} <ChevronDown size={11} /></DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content side="top" sideOffset={6} className="z-50 min-w-40 rounded-md border bg-white p-1 font-instrument text-[12px] shadow-xl" style={{ borderColor: R.line }}>
            {(['shaded', 'edges', 'wire'] as Display[]).map((m) => (
              <DropdownMenu.Item key={m} onSelect={() => setDisplay(m)} className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-[#E7F0FF]">
                <span className="w-3">{display === m && <Check size={12} />}</span>{({ shaded: 'Shaded', edges: 'Shaded with visible edges', wire: 'Wireframe' } as const)[m]}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <button aria-label="Section" onClick={() => setSection(!section)} className={btn(section)}><Scissors size={14} /></button>
      <button aria-label="Grid" onClick={() => setGrid(!grid)} className={btn(grid)}><Grid3x3 size={14} /></button>
    </div>
  );
}

function PropsCard() {
  const { a, r, gates } = useEngineering();
  const fail = gates.filter((g) => g.state !== 'pass').length;
  return (
    <div className="absolute right-3 bottom-3 hidden w-52 rounded-lg border bg-white/95 text-[11.5px] shadow-[0_4px_14px_rgba(29,35,43,.1)] lg:block" style={{ borderColor: R.line }}>
      <div className="border-b px-3 py-1.5 text-[10.5px] font-semibold tracking-[0.06em]" style={{ borderColor: R.lineSoft, color: R.muted }}>PHYSICAL PROPERTIES</div>
      <div className="px-3 py-2 font-jb">
        {[['Mass', `${a.massLiftoff.toFixed(3)} kg`], ['CG (x)', `${fmt(a.cg * 1000)} mm`], ['CP (x)', `${fmt(a.cp * 1000)} mm`], ['Margin', `${a.stability.toFixed(2)} cal`], ['Apogee', `${fmt(ft(r.apogee))} ft`]].map(([k, v]) => (
          <div key={k} className="flex justify-between py-[1px]"><span style={{ color: R.muted }}>{k}</span><span className="tnum">{v}</span></div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 border-t px-3 py-1.5" style={{ borderColor: R.lineSoft, color: fail ? '#B45309' : '#15803D' }}><Circle size={7} fill="currentColor" /> {fail ? `${fail} checks need attention` : 'All checks pass'}</div>
    </div>
  );
}

/* ───────────────────────── feature dialog ───────────────────────── */

function NumField({ label, value, onChange, unit = 'mm', scale = 1000, digits = 0, step = 1 }: { label: string; value: number; onChange: (v: number) => void; unit?: string; scale?: number; digits?: number; step?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = (value * scale).toFixed(digits);
  const commit = (s: string) => { const n = parseFloat(s); if (!isNaN(n)) onChange(n / scale); setDraft(null); };
  return (
    <label className="grid grid-cols-[1fr_128px] items-center gap-2 py-1">
      <span style={{ color: R.muted }}>{label}</span>
      <span className="flex h-7 items-center rounded border bg-white focus-within:border-[#0D6EFD] focus-within:ring-2 focus-within:ring-[#0D6EFD]/15" style={{ borderColor: R.line }}>
        <input value={draft ?? shown} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onChange(value + (e.key === 'ArrowUp' ? step : -step) / scale); } }} className="tnum w-full min-w-0 bg-transparent px-2 font-jb text-[12px] outline-none" />
        <span className="pr-2 font-jb text-[11px]" style={{ color: R.dim }}>{unit}</span>
      </span>
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="grid grid-cols-[1fr_128px] items-center gap-2 py-1">
      <span style={{ color: R.muted }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="h-7 rounded border bg-white px-1.5 text-[12px] outline-none focus:border-[#0D6EFD]" style={{ borderColor: R.line }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function FeatureDialog({ id, onClose }: { id: FeatureId; onClose: () => void }) {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  const snapshot = useRef<Design>(d);
  const [pos, setPos] = useState({ x: 16, y: 40 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const f = FEATURES.find((x) => x.id === id)!;
  const cancel = () => { set(snapshot.current); onClose(); };
  const ok = () => { onClose(); toast(`${f.label.split(' · ')[1] ?? f.label} updated`, { description: 'Downstream features and studies regenerated' }); };
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
      className="absolute z-10 w-[300px] rounded-lg border bg-white shadow-[0_12px_40px_-8px_rgba(29,35,43,.3)]" style={{ left: pos.x, top: pos.y, borderColor: R.line }}
    >
      <div className="flex h-8 cursor-move items-center gap-2 rounded-t-lg border-b px-3" style={{ borderColor: R.lineSoft, background: R.panel2 }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
        onPointerMove={(e) => { if (drag.current) setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }); }}
        onPointerUp={() => (drag.current = null)}
      >
        <f.icon size={13} style={{ color: R.blue }} />
        <span className="flex-1 text-[11.5px] font-semibold tracking-[0.04em] uppercase">{f.label.split(' · ')[1] ?? f.label}</span>
        <button onClick={cancel} aria-label="Close" className="rounded p-0.5 hover:bg-black/5"><X size={13} /></button>
      </div>
      <div className="px-3 py-2">
        {id === 'nose' && <>
          <Select<NoseShape> label="Profile" value={d.noseShape} onChange={(v) => set({ noseShape: v })} options={[['ogive', 'Tangent ogive'], ['vonkarman', 'Von Kármán (LD-Haack)'], ['conical', 'Conical'], ['elliptical', 'Elliptical']]} />
          <NumField label="Length" value={d.noseLength} onChange={(v) => set({ noseLength: v })} step={5} />
          <NumField label="Base diameter" value={d.diameter} onChange={(v) => set({ diameter: v })} />
        </>}
        {id === 'body' && <>
          <NumField label="Outer diameter" value={d.diameter} onChange={(v) => set({ diameter: v })} />
          <NumField label="Length" value={d.bodyLength} onChange={(v) => set({ bodyLength: v })} step={10} />
          <Select label="Material" value={d.material} onChange={(v) => set({ material: v })} options={[['fiberglass', 'G12 fiberglass'], ['carbon', 'Carbon fiber'], ['bluetube', 'Blue Tube 2.0']]} />
        </>}
        {(id === 'sketch2' || id === 'fin' || id === 'pattern') && <>
          {id === 'pattern' && <NumField label="Quantity" value={d.finCount} onChange={(v) => set({ finCount: Math.max(3, Math.min(6, Math.round(v))) })} unit="×" scale={1} />}
          <NumField label="Root chord" value={d.finRoot} onChange={(v) => set({ finRoot: v })} />
          <NumField label="Tip chord" value={d.finTip} onChange={(v) => set({ finTip: v })} />
          <NumField label="Semi-span" value={d.finSpan} onChange={(v) => set({ finSpan: v })} />
          <NumField label="LE sweep" value={d.finSweep} onChange={(v) => set({ finSweep: v })} />
          <NumField label="Thickness" value={d.finThickness} onChange={(v) => set({ finThickness: v })} digits={1} step={0.1} />
        </>}
        {id === 'motor' && <Select label="Motor" value={d.motorId} onChange={(v) => set({ motorId: v })} options={MOTORS.map((m) => [m.id, `${m.maker} ${m.name}`] as [string, string])} />}
        {id === 'motor' && <div className="mt-1 rounded p-2 font-jb text-[11px]" style={{ background: R.panel2, color: R.muted }}>{fmt(motorById(d.motorId).impulse)} N·s · {motorById(d.motorId).burn} s · Ø{motorById(d.motorId).diameter} mm</div>}
        {['origin', 'sketch1', 'shell', 'band'].includes(id) && <div className="py-3 text-[12px]" style={{ color: R.muted }}>This feature has no editable parameters in the preview. Edit the profile through Revolve1 or Extrude1.</div>}
      </div>
      <div className="flex justify-end gap-1.5 border-t px-3 py-2" style={{ borderColor: R.lineSoft }}>
        <button onClick={cancel} className="h-7 rounded border px-3 text-[12px] hover:bg-[#F1F3F6]" style={{ borderColor: R.line }}>Cancel</button>
        <button onClick={ok} className="h-7 rounded px-4 text-[12px] font-semibold text-white" style={{ background: R.blue }}>OK</button>
      </div>
    </motion.div>
  );
}

/* ───────────────────────── timeline ───────────────────────── */

function Timeline({ rollback, setRollback, edit, openFeature }: { rollback: number; setRollback: (n: number) => void; edit: FeatureId | null; openFeature: (f: FeatureId) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pick = (clientX: number) => {
    const chips = Array.from(track.current!.querySelectorAll('[data-chip]')) as HTMLElement[];
    let n = 0;
    chips.forEach((c, i) => { const r = c.getBoundingClientRect(); if (clientX > r.left + r.width / 2) n = i + 1; });
    setRollback(Math.max(1, n));
  };
  const btn = 'grid size-6 place-items-center rounded text-[#4C5560] hover:bg-black/5';
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-t px-2" style={{ borderColor: R.line, background: R.chrome }}>
      <button aria-label="Start" className={btn} onClick={() => setRollback(1)}><SkipBack size={13} /></button>
      <button aria-label="Step back" className={btn} onClick={() => setRollback(Math.max(1, rollback - 1))}><StepBack size={13} /></button>
      <button aria-label="Step forward" className={btn} onClick={() => setRollback(Math.min(FEATURES.length, rollback + 1))}><StepForward size={13} /></button>
      <button aria-label="End" className={btn} onClick={() => setRollback(FEATURES.length)}><SkipForward size={13} /></button>
      <div ref={track} className="no-scrollbar relative flex flex-1 items-center gap-1 overflow-x-auto py-1" onPointerMove={(e) => dragging.current && pick(e.clientX)} onPointerUp={() => (dragging.current = false)} onPointerLeave={() => (dragging.current = false)}>
        {FEATURES.map((f, i) => (
          <div key={f.id} className="flex items-center gap-1">
            <button data-chip title={f.label} onDoubleClick={() => openFeature(f.id)} onClick={() => openFeature(f.id)} className={cn('grid size-7 shrink-0 place-items-center rounded border transition-opacity', i >= rollback && 'opacity-35')} style={{ borderColor: edit === f.id ? R.blue : R.line, background: edit === f.id ? R.blueSoft : '#fff', color: edit === f.id ? R.blue : '#3A434E' }}>
              <f.icon size={14} strokeWidth={1.5} />
            </button>
            {i === rollback - 1 && (
              <span role="slider" aria-label="Rollback marker" aria-valuenow={rollback} tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowLeft') setRollback(Math.max(1, rollback - 1)); if (e.key === 'ArrowRight') setRollback(Math.min(FEATURES.length, rollback + 1)); }} onPointerDown={(e) => { e.preventDefault(); dragging.current = true; }} className="h-7 w-1.5 shrink-0 cursor-ew-resize rounded-sm" style={{ background: R.sel }} />
            )}
          </div>
        ))}
      </div>
      <span className="hidden font-jb text-[10.5px] lg:inline" style={{ color: R.dim }}>Drag the marker to roll back history</span>
    </div>
  );
}

/* ───────────────────────── results drawer ───────────────────────── */

function ResultsDrawer({ kind, setKind }: { kind: Exclude<Drawer, null>; setKind: (k: Drawer) => void }) {
  const { design: d, a, r, gates } = useEngineering();
  const mc = useMemo(() => (kind === 'mc' ? monteCarlo(d, 160) : []), [kind, d]);
  const ascent = r.series.filter((p) => p.t <= r.tApogee + 1);
  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 38 }} className="absolute inset-x-0 bottom-0 z-20 h-[46%] min-h-[260px] border-t bg-white shadow-[0_-10px_30px_rgba(29,35,43,.1)]" style={{ borderColor: R.line }}>
      <div className="flex h-8 items-center gap-1 border-b px-2" style={{ borderColor: R.lineSoft, background: R.panel2 }}>
        {(['stability', 'flight', 'mc'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('h-6 rounded px-2.5 text-[11.5px]', kind === k ? 'bg-white font-semibold text-[#0D6EFD] shadow-[0_0_0_1px_#D8DCE2]' : 'text-[#5F6873]')}>{({ stability: 'Stability & checks', flight: 'Flight · 6-DOF', mc: 'Dispersion' } as const)[k]}</button>
        ))}
        <span className="flex-1" />
        <button onClick={() => setKind(null)} aria-label="Close results" className="rounded p-1 hover:bg-black/5"><X size={14} /></button>
      </div>
      <div className="thin-scroll h-[calc(100%-32px)] overflow-auto p-3">
        {kind === 'stability' && (
          <div className="grid gap-4 md:grid-cols-[260px_1fr]">
            <div className="font-jb text-[11.5px]">
              {[['Static margin', `${a.stability.toFixed(2)} cal`], ['Margin at burnout', `${a.stabilityBurnout.toFixed(2)} cal`], ['CNα total', (2 + a.finCNa).toFixed(2)], ['Cd', a.cd.toFixed(3)], ['T/W', `${a.twr.toFixed(1)}:1`]].map(([k, v]) => <div key={k} className="flex justify-between border-b py-1" style={{ borderColor: R.lineSoft }}><span style={{ color: R.muted }}>{k}</span><span>{v}</span></div>)}
            </div>
            <table className="w-full text-[12px]">
              <tbody>{gates.map((g) => (
                <tr key={g.id} className="border-b" style={{ borderColor: R.lineSoft }}>
                  <td className="py-1.5"><span className="mr-2 inline-block size-2 rounded-full" style={{ background: g.state === 'pass' ? '#16A34A' : g.state === 'warn' ? '#F59E0B' : '#DC2626' }} />{g.label}</td>
                  <td className="py-1.5 text-right font-jb">{g.value}</td>
                  <td className="hidden py-1.5 pl-4 text-right font-jb sm:table-cell" style={{ color: R.dim }}>{g.rule}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {kind === 'flight' && <LineChart data={ascent} x={(p) => p.t} series={[{ key: 'h', label: 'Altitude', color: R.blue, value: (p) => p.h, area: true, unit: ' m' }, { key: 'v', label: 'Velocity', color: '#F59E0B', value: (p) => p.v, dash: '4 3', unit: ' m/s' }]} theme={chartTheme} height={200} xLabel="t (s)" markers={[{ x: r.tBurnout, label: 'burnout', color: '#F59E0B' }]} />}
        {kind === 'mc' && <div className="flex flex-wrap items-start gap-6"><Dispersion pts={mc} theme={chartTheme} color={R.blue} size={220} /><div className="font-jb text-[11.5px]" style={{ color: R.muted }}>200 runs · wind ±25 % · thrust ±3 % · Cd ±6 %<br />Mean drift {fmt(r.drift)} m</div></div>}
      </div>
    </motion.div>
  );
}
