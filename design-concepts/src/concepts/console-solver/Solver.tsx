import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Projector } from '../../shared/Anchors';
import * as THREE from 'three';
import { Slider } from 'radix-ui';
import { Toaster, toast } from 'sonner';
import {
  Zap, Check, ChevronDown, ChevronRight, Box, Layers, Grid3x3, Settings2, Wind, Flame, Gauge, Thermometer, Activity, FileText, Play, Pause,
  SkipBack, Folder, CircleDot, BarChart3, Info, Loader2, Square
} from 'lucide-react';
import { useDesignStore, useEngineering } from '../../shared/store';
import { MOTORS, massItems, motorById, type Design, type SimPoint } from '../../shared/model';
import { noseRadius } from '../../shared/Rocket3D';
import { LineChart, type ChartTheme } from '../../shared/charts';
import { cn, fmt, ft } from '../../shared/format';

/* Simulation workbench: slate-blue chrome, classic banded contour legend. */
const S = { app: '#0F141B', panel: '#151C25', panel2: '#1B2430', line: '#263140', fg: '#D9E1EA', muted: '#8696A8', dim: '#5B6B7D', accent: '#4FB3FF', ok: '#4ADE80', warn: '#FACC15' };
const BANDS = ['#0000FF', '#0060FF', '#00B4FF', '#00FFD0', '#00FF50', '#90FF00', '#FFF000', '#FF9000', '#FF0000'];
const chartTheme: ChartTheme = { grid: '#1F2935', axis: '#3A4757', text: '#6F8094', font: 'Source Code Pro, monospace', crosshair: '#4FB3FF', tooltipBg: '#0B1016', tooltipFg: '#D9E1EA' };

type Field = 'cp' | 'pressure' | 'temp' | 'stress';
type NodeId = 'model' | 'geometry' | 'materials' | 'mesh' | 'study' | 'settings' | 'atmosphere' | 'motor' | 'solution' | 'info' | Field | 'trajectory';

const FIELD_META: Record<Field, { label: string; unit: string; icon: typeof Gauge; digits: number }> = {
  cp: { label: 'Pressure coefficient', unit: '', icon: Gauge, digits: 3 },
  pressure: { label: 'Surface pressure (gauge)', unit: 'kPa', icon: Gauge, digits: 1 },
  temp: { label: 'Skin temperature', unit: '°C', icon: Thermometer, digits: 1 },
  stress: { label: 'Axial stress', unit: 'MPa', icon: Activity, digits: 2 }
};

/* ── field models (illustrative, along the body station x from the tip) ── */

function cpAt(d: Design, x: number, onFin: number | null): number {
  if (onFin !== null) return 0.38 - 0.5 * onFin; // onFin = 0 at LE … 1 at TE
  if (x < d.noseLength) { const u = x / d.noseLength; return 1 - 1.35 * Math.sqrt(u) + 0.12 * u; }
  const s = (x - d.noseLength) / d.diameter;
  return -0.23 * Math.exp(-s / 1.6);
}

function fieldAt(f: Field, d: Design, x: number, p: SimPoint, onFin: number | null, ctx: { cumMass: (x: number) => number; area: number }): number {
  const rho = 1.225 * Math.exp(-p.h / 8500);
  const q = 0.5 * rho * p.v * p.v;
  if (f === 'cp') return cpAt(d, x, onFin);
  if (f === 'pressure') return (cpAt(d, x, onFin) * q) / 1000;
  if (f === 'temp') { const rec = onFin !== null ? 0.9 - 0.15 * onFin : x < d.noseLength ? 1 - 0.12 * (x / d.noseLength) : 0.86; const T0 = 15 - 0.0065 * p.h; return T0 + rec * (p.v * p.v) / (2 * 1005) * 0.85; }
  // stress: inertial + nose drag load carried by the wall ahead of x
  const load = ctx.cumMass(x) * Math.abs(p.a + 9.81) + q * Math.PI * (d.diameter / 2) ** 2 * 0.3 * Math.min(1, x / d.noseLength);
  return load / ctx.area / 1e6;
}

export default function Solver() {
  const { design: d, a, r, stale } = useEngineering();
  const commit = useDesignStore((s) => s.commitSim);
  const [node, setNode] = useState<NodeId>('pressure');
  const [field, setField] = useState<Field>('pressure');
  const [ti, setTi] = useState(() => r.series.findIndex((p) => p.mach === Math.max(...r.series.map((q) => q.mach))));
  const [playing, setPlaying] = useState(false);
  const [solving, setSolving] = useState<null | number>(null);
  const [residuals, setResiduals] = useState<{ it: number; mom: number; mass: number; energy: number }[]>([]);

  const ascent = useMemo(() => r.series.filter((p) => p.t <= r.tApogee), [r]);
  const idx = Math.min(Math.max(0, ti), ascent.length - 1);
  const p = ascent[idx];

  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => setTi((i) => { if (i >= ascent.length - 1) { setPlaying(false); return i; } return i + 1; }), 40);
    return () => clearInterval(iv);
  }, [playing, ascent.length]);

  const solve = () => {
    if (solving !== null) return;
    setNode('info'); setResiduals([]); setSolving(0);
    let it = 0;
    const iv = setInterval(() => {
      it += 3;
      setResiduals((rs) => [...rs, { it, mom: Math.exp(-it / 34) * (1 + 0.25 * Math.sin(it / 3)), mass: 0.6 * Math.exp(-it / 40) * (1 + 0.2 * Math.cos(it / 4)), energy: 0.3 * Math.exp(-it / 30) * (1 + 0.3 * Math.sin(it / 5)) }]);
      setSolving(it / 240);
      if (it >= 240) { clearInterval(iv); setSolving(null); commit(); toast.success('Solution converged', { description: `240 iterations · residuals < 1e-3 · apogee ${fmt(ft(r.apogee))} ft` }); }
    }, 25);
  };

  const pick = (n: NodeId) => { setNode(n); if (n in FIELD_META) setField(n as Field); };

  return (
    <div className="flex h-full flex-col overflow-hidden font-source text-[12.5px]" style={{ background: S.app, color: S.fg }}>
      {/* toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: S.line, background: '#121821' }}>
        <span className="flex items-center gap-2 font-semibold"><span className="grid size-6 place-items-center rounded" style={{ background: 'linear-gradient(135deg,#4FB3FF,#2563EB)' }}><Zap size={13} className="text-white" /></span><span className="hidden sm:inline">Astraea Workbench</span></span>
        <span className="hidden text-[12px] md:inline" style={{ color: S.dim }}>Kestrel IV · Flight Study 1</span>
        <span className="mx-1 h-5 w-px" style={{ background: S.line }} />
        <button onClick={solve} disabled={solving !== null} className="relative flex h-7 items-center gap-1.5 overflow-hidden rounded px-3 text-[12px] font-semibold text-white" style={{ background: stale ? '#2563EB' : '#1E3A5F' }}>
          {solving !== null && <span className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${solving * 100}%` }} />}
          {solving !== null ? <Loader2 size={13} className="relative animate-spin" /> : <Zap size={13} className="relative" fill="currentColor" />}
          <span className="relative">{solving !== null ? `Solving ${Math.round(solving * 100)}%` : 'Solve'}</span>
        </button>
        {stale && solving === null && <span className="hidden items-center gap-1 text-[11.5px] sm:flex" style={{ color: S.warn }}><Zap size={12} /> Inputs changed, results need solving</span>}
        <span className="flex-1" />
        <div className="hidden items-center gap-1 rounded border px-1 md:flex" style={{ borderColor: S.line }}>
          {(Object.keys(FIELD_META) as Field[]).map((f) => {
            const I = FIELD_META[f].icon;
            return <button key={f} title={FIELD_META[f].label} onClick={() => pick(f)} className={cn('flex h-6 items-center gap-1 rounded px-2 text-[11.5px]', field === f ? 'bg-[#4FB3FF]/15 text-[#4FB3FF]' : 'text-[#8696A8] hover:text-white')}><I size={12} />{{ cp: 'Cp', pressure: 'Pressure', temp: 'Temp', stress: 'Stress' }[f]}</button>;
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <Outline node={node} pick={pick} stale={stale} solving={solving !== null} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1" style={{ background: 'linear-gradient(180deg,#3A4B66 0%,#1A2333 60%,#0F151F 100%)' }}>
            <Suspense fallback={null}><ContourView d={d} field={field} p={p} /></Suspense>
            <Legend d={d} field={field} p={p} />
            <div className="pointer-events-none absolute top-3 right-3 text-right font-source-mono text-[11px] leading-5" style={{ color: '#C5D2E0' }}>
              <div className="text-[13px] font-semibold text-white">{FIELD_META[field].label}</div>
              <div>Type: {field === 'cp' ? 'Steady' : 'Transient'} · Unit: {FIELD_META[field].unit || '—'}</div>
              <div>Time: {p.t.toFixed(2)} s · Mach {p.mach.toFixed(2)} · h {fmt(p.h)} m</div>
              {stale && <div style={{ color: S.warn }}>Preview · not yet solved</div>}
            </div>
          </div>
          {/* time bar */}
          <div className="flex h-10 shrink-0 items-center gap-2 border-y px-3" style={{ borderColor: S.line, background: S.panel }}>
            <button aria-label="Rewind" onClick={() => setTi(0)} className="rounded p-1 hover:bg-white/5"><SkipBack size={14} /></button>
            <button aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (idx >= ascent.length - 1) setTi(0); setPlaying(!playing); }} className="grid size-7 place-items-center rounded-full" style={{ background: S.accent, color: '#04111E' }}>{playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}</button>
            <span className="tnum w-20 font-source-mono text-[11.5px]">t = {p.t.toFixed(2)} s</span>
            <Slider.Root className="rs-root flex-1" value={[idx]} min={0} max={ascent.length - 1} step={1} onValueChange={([v]) => { setPlaying(false); setTi(v); }} aria-label="Time step">
              <Slider.Track className="rs-track" style={{ background: '#263140', height: 4 }}><Slider.Range className="rs-range" style={{ background: S.accent }} /></Slider.Track>
              <Slider.Thumb className="rs-thumb border-2 bg-white outline-none" style={{ borderColor: S.accent }} />
            </Slider.Root>
            <span className="hidden font-source-mono text-[11px] sm:inline" style={{ color: S.dim }}>{ascent.length} steps · 0 → {r.tApogee.toFixed(1)} s</span>
          </div>
          <BottomPanes node={node} field={field} ascent={ascent} idx={idx} setTi={setTi} residuals={residuals} solving={solving !== null} a={a} />
        </div>
      </div>
      <div className="flex h-6 shrink-0 items-center gap-4 border-t px-3 font-source-mono text-[10.5px]" style={{ borderColor: S.line, background: '#0C1117', color: S.dim }}>
        <span className="flex items-center gap-1.5">{stale ? <><Zap size={10} style={{ color: S.warn }} /> Out of date</> : <><Check size={10} style={{ color: S.ok }} /> Solved</>}</span>
        <span>Messages: 1 warning</span>
        <span className="flex-1" />
        <span className="hidden sm:inline">Metric (m, kg, N, s, °C, Pa)</span>
      </div>
      <Toaster theme="dark" position="top-right" offset={50} toastOptions={{ style: { background: '#151C25', border: `1px solid ${S.line}`, color: S.fg, fontFamily: 'Source Sans 3' } }} />
    </div>
  );
}

/* ───────────────────────── outline tree ───────────────────────── */

function Outline({ node, pick, stale, solving }: { node: NodeId; pick: (n: NodeId) => void; stale: boolean; solving: boolean }) {
  const [open, setOpen] = useState({ model: true, study: true, solution: true });
  const status = (solved: boolean) => solving ? <Loader2 size={10} className="animate-spin" style={{ color: S.accent }} /> : solved && !stale ? <Check size={11} style={{ color: S.ok }} strokeWidth={3} /> : <Zap size={10} style={{ color: S.warn }} fill={S.warn} />;
  const Row = ({ id, depth, icon: I, label, badge, caret, onCaret }: { id?: NodeId; depth: number; icon: typeof Box; label: string; badge?: ReactNode; caret?: boolean | null; onCaret?: () => void }) => (
    <div onClick={() => id && pick(id)} className={cn('flex h-[23px] cursor-default items-center gap-1.5 pr-2', id && node === id ? 'bg-[#2563EB]/35' : 'hover:bg-white/[0.04]')} style={{ paddingLeft: 6 + depth * 14 }}>
      <span className="w-3" onClick={(e) => { e.stopPropagation(); onCaret?.(); }}>{caret === null ? null : caret ? <ChevronDown size={11} /> : caret === false ? <ChevronRight size={11} /> : null}</span>
      <span className="relative"><I size={13} style={{ color: '#9FB3C8' }} />{badge && <span className="absolute -right-1.5 -bottom-1">{badge}</span>}</span>
      <span className="ml-1 truncate text-[12px]">{label}</span>
    </div>
  );
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r md:flex" style={{ borderColor: S.line, background: S.panel }}>
      <div className="flex h-7 items-center px-3 text-[11px] font-semibold tracking-[0.08em]" style={{ color: S.muted, background: S.panel2 }}>OUTLINE</div>
      <div className="thin-scroll flex-1 overflow-y-auto py-1">
        <Row depth={0} icon={Folder} label="Project" caret={null} />
        <Row id="model" depth={1} icon={Box} label="Model (Kestrel IV)" caret={open.model} onCaret={() => setOpen({ ...open, model: !open.model })} />
        {open.model && <>
          <Row id="geometry" depth={2} icon={Box} label="Geometry · 5 bodies" badge={<Check size={9} style={{ color: S.ok }} strokeWidth={3} />} />
          <Row id="materials" depth={2} icon={Layers} label="Materials" badge={<Check size={9} style={{ color: S.ok }} strokeWidth={3} />} />
          <Row id="mesh" depth={2} icon={Grid3x3} label="Panel mesh" badge={<Check size={9} style={{ color: S.ok }} strokeWidth={3} />} />
          <Row id="study" depth={2} icon={Activity} label="Flight Study 1 (6-DOF)" caret={open.study} onCaret={() => setOpen({ ...open, study: !open.study })} />
          {open.study && <>
            <Row id="settings" depth={3} icon={Settings2} label="Analysis settings" />
            <Row id="atmosphere" depth={3} icon={Wind} label="Atmosphere · ISA + GFS" />
            <Row id="motor" depth={3} icon={Flame} label="Motor thrust" />
            <Row id="solution" depth={3} icon={CircleDot} label="Solution" badge={status(true)} caret={open.solution} onCaret={() => setOpen({ ...open, solution: !open.solution })} />
            {open.solution && <>
              <Row id="info" depth={4} icon={Info} label="Solution information" />
              {(Object.keys(FIELD_META) as Field[]).map((f) => <Row key={f} id={f} depth={4} icon={FIELD_META[f].icon} label={FIELD_META[f].label} badge={status(true)} />)}
              <Row id="trajectory" depth={4} icon={BarChart3} label="Trajectory" badge={status(true)} />
            </>}
          </>}
        </>}
        <Row depth={1} icon={FileText} label="Report preview" caret={null} />
      </div>
    </aside>
  );
}

/* ───────────────────────── contour viewport ───────────────────────── */

function useFieldRange(d: Design, field: Field, p: SimPoint) {
  return useMemo(() => {
    const ctx = fieldCtx(d);
    const L = d.noseLength + d.bodyLength;
    let lo = Infinity, hi = -Infinity, xLo = 0, xHi = 0;
    for (let i = 0; i <= 200; i++) { const x = (i / 200) * L; const v = fieldAt(field, d, x, p, null, ctx); if (v < lo) { lo = v; xLo = x; } if (v > hi) { hi = v; xHi = x; } }
    for (const u of [0, 1]) { const v = fieldAt(field, d, L - d.finRoot * (1 - u), p, u, ctx); if (v < lo) { lo = v; xLo = L - d.finRoot * (1 - u); } if (v > hi) { hi = v; xHi = L - d.finRoot * (1 - u); } }
    if (hi - lo < 1e-6) hi = lo + 1;
    return { lo, hi, xLo, xHi };
  }, [d, field, p]);
}

function fieldCtx(d: Design) {
  const items = massItems(d);
  const R = d.diameter / 2, wall = 0.0022;
  return { cumMass: (x: number) => items.filter((i) => i.x <= x).reduce((s, i) => s + i.mass, 0), area: Math.PI * ((R) ** 2 - (R - wall) ** 2) };
}

function band(v: number, lo: number, hi: number) {
  const k = Math.min(BANDS.length - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * BANDS.length)));
  return new THREE.Color(BANDS[k]);
}

function ContourView({ d, field, p }: { d: Design; field: Field; p: SimPoint }) {
  const L = d.noseLength + d.bodyLength;
  const R = d.diameter / 2;
  const { lo, hi, xLo, xHi } = useFieldRange(d, field, p);
  const ctx = useMemo(() => fieldCtx(d), [d]);

  const body = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const nN = 60, nB = 90;
    pts.push(new THREE.Vector2(0.0001, L));
    for (let i = 1; i <= nN; i++) { const x = (i / nN) * d.noseLength; pts.push(new THREE.Vector2(Math.max(noseRadius(d.noseShape, x, d.noseLength, R), 0.0005), L - x)); }
    for (let i = 1; i <= nB; i++) { const x = d.noseLength + (i / nB) * d.bodyLength; pts.push(new THREE.Vector2(R, L - x)); }
    pts.push(new THREE.Vector2(0.0001, 0));
    const g = new THREE.LatheGeometry(pts, 72);
    return g;
  }, [d.noseShape, d.noseLength, d.bodyLength, R, L]);

  const fin = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0, d.finRoot); s.lineTo(d.finSpan, d.finRoot - d.finSweep); s.lineTo(d.finSpan, Math.max(d.finRoot - d.finSweep - d.finTip, -0.05)); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d.finThickness, bevelEnabled: false, curveSegments: 1 });
    // subdivide visually by tessellation is not needed: colour by vertex chord position
    g.translate(R * 0.98, 0, -d.finThickness / 2);
    return g;
  }, [d.finRoot, d.finTip, d.finSpan, d.finSweep, d.finThickness, R]);

  useEffect(() => {
    const pos = body.attributes.position; const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const c = band(fieldAt(field, d, L - pos.getY(i), p, null, ctx), lo, hi); col.set([c.r, c.g, c.b], i * 3); }
    body.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const fp = fin.attributes.position; const fc = new Float32Array(fp.count * 3);
    for (let i = 0; i < fp.count; i++) { const y = fp.getY(i); const u = 1 - Math.min(1, Math.max(0, y / d.finRoot)); const c = band(fieldAt(field, d, L - y, p, u, ctx), lo, hi); fc.set([c.r, c.g, c.b], i * 3); }
    fin.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  }, [body, fin, field, d, p, lo, hi, L, ctx]);

  const meta = FIELD_META[field];
  const grp = useRef<THREE.Group>(null);
  const maxEl = useRef<HTMLDivElement>(null);
  const minEl = useRef<HTMLDivElement>(null);
  return (
    <>
    <Canvas dpr={[1, 2]} camera={{ position: [0.3, 0.9, 3.1], fov: 32 }} style={{ position: 'absolute', inset: 0 }}>
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, 3, 3]} intensity={0.9} />
      <group ref={grp} rotation={[0, 0, -Math.PI / 2]} position={[-L / 2, 0.05, 0]}>
        <mesh geometry={body}><meshLambertMaterial vertexColors /></mesh>
        <lineSegments><edgesGeometry args={[body, 50]} /><lineBasicMaterial color="#0B1016" transparent opacity={0.35} /></lineSegments>
        {Array.from({ length: d.finCount }).map((_, i) => <mesh key={i} geometry={fin} rotation={[0, (i / d.finCount) * Math.PI * 2, 0]}><meshLambertMaterial vertexColors /></mesh>)}
      </group>
      <OrbitControls makeDefault enableDamping target={[0, 0.05, 0]} />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}><GizmoViewport axisColors={['#F87171', '#4ADE80', '#60A5FA']} labelColor="#0B1016" /></GizmoHelper>
      <Projector parent={grp} anchors={[{ local: [R * 1.1, L - xHi, 0], el: maxEl }, { local: [-R * 1.1, L - xLo, 0], el: minEl }]} />
    </Canvas>
    <div ref={maxEl} className="pointer-events-none absolute top-0 left-0"><Probe tone="#FF4040" label="Max" v={`${hi.toFixed(meta.digits)} ${meta.unit}`} /></div>
    <div ref={minEl} className="pointer-events-none absolute top-0 left-0"><Probe tone="#3B6BFF" label="Min" v={`${lo.toFixed(meta.digits)} ${meta.unit}`} /></div>
    </>
  );
}

function Probe({ tone, label, v }: { tone: string; label: string; v: string }) {
  return (
    <div className="pointer-events-none flex items-center gap-1 font-source-mono text-[10.5px] whitespace-nowrap" style={{ transform: 'translate(4px,-50%)' }}>
      <span className="size-2 rotate-45" style={{ background: tone }} />
      <span className="rounded-sm border px-1 py-px" style={{ background: 'rgba(11,16,22,.85)', borderColor: tone, color: '#fff' }}>{label} {v}</span>
    </div>
  );
}

function Legend({ d, field, p }: { d: Design; field: Field; p: SimPoint }) {
  const { lo, hi } = useFieldRange(d, field, p);
  const meta = FIELD_META[field];
  const ticks = Array.from({ length: BANDS.length + 1 }, (_, i) => hi - ((hi - lo) * i) / BANDS.length);
  return (
    <div className="pointer-events-none absolute top-3 left-3 font-source-mono text-[11px]" style={{ color: '#E2EAF3' }}>
      <div className="mb-1 font-source text-[12.5px] font-semibold text-white">{meta.label}</div>
      <div className="mb-2 text-[10.5px]" style={{ color: '#A9B8C9' }}>Unit: {meta.unit || '—'} · Banded, {BANDS.length} levels</div>
      <div className="flex">
        <div className="flex flex-col border border-black/50">{BANDS.slice().reverse().map((c) => <span key={c} className="h-5 w-4" style={{ background: c }} />)}</div>
        <div className="relative ml-1.5" style={{ height: BANDS.length * 20 + 2 }}>
          {ticks.map((t, i) => <span key={i} className="tnum absolute left-0 -translate-y-1/2 whitespace-nowrap" style={{ top: i * 20 + 1 }}>{t.toFixed(meta.digits)}{i === 0 ? ' Max' : i === ticks.length - 1 ? ' Min' : ''}</span>)}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── bottom panes ───────────────────────── */

function BottomPanes({ node, field, ascent, idx, setTi, residuals, solving, a }: { node: NodeId; field: Field; ascent: SimPoint[]; idx: number; setTi: (i: number) => void; residuals: { it: number; mom: number; mass: number; energy: number }[]; solving: boolean; a: ReturnType<typeof useEngineering>['a'] }) {
  const d = useDesignStore((s) => s.design);
  const set = useDesignStore((s) => s.set);
  const { r } = useEngineering();
  const ctx = useMemo(() => fieldCtx(d), [d]);
  const meta = FIELD_META[field];
  const series = useMemo(() => ascent.filter((_, i) => i % 2 === 0).map((p) => {
    let hi = -Infinity, lo = Infinity;
    const L = d.noseLength + d.bodyLength;
    for (let k = 0; k <= 40; k++) { const v = fieldAt(field, d, (k / 40) * L, p, null, ctx); hi = Math.max(hi, v); lo = Math.min(lo, v); }
    return { t: p.t, hi, lo };
  }), [ascent, field, d, ctx]);
  const cur = ascent[idx];

  const Detail = ({ k, v }: { k: string; v: ReactNode }) => (
    <div className="grid grid-cols-[48%_52%] border-b text-[12px]" style={{ borderColor: S.line }}>
      <div className="truncate border-r px-2 py-[3px]" style={{ borderColor: S.line, color: S.muted }}>{k}</div>
      <div className="truncate px-2 py-[3px]">{v}</div>
    </div>
  );
  const Num = ({ k, v, on, unit, scale = 1, digits = 1 }: { k: string; v: number; on: (n: number) => void; unit: string; scale?: number; digits?: number }) => {
    const [draft, setDraft] = useState<string | null>(null);
    return (
      <div className="grid grid-cols-[48%_52%] border-b text-[12px]" style={{ borderColor: S.line, background: 'rgba(250,204,21,.05)' }}>
        <div className="truncate border-r px-2 py-[3px]" style={{ borderColor: S.line, color: S.muted }}>{k}</div>
        <input aria-label={k} value={draft ?? `${(v * scale).toFixed(digits)} ${unit}`} onFocus={() => setDraft((v * scale).toFixed(digits))} onChange={(e) => setDraft(e.target.value)} onBlur={() => { const n = parseFloat(draft ?? ''); if (!isNaN(n)) on(n / scale); setDraft(null); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="min-w-0 bg-transparent px-2 py-[3px] font-source-mono outline-none focus:bg-[#0B1016]" />
      </div>
    );
  };

  return (
    <div className="grid h-[34%] min-h-[200px] shrink-0 grid-cols-1 md:grid-cols-[320px_1fr]" style={{ background: S.panel }}>
      <div className="thin-scroll hidden overflow-y-auto border-r md:block" style={{ borderColor: S.line }}>
        <div className="sticky top-0 z-10 px-2 py-1 text-[11px] font-semibold tracking-[0.06em]" style={{ background: S.panel2, color: S.muted }}>DETAILS OF “{labelOf(node)}”</div>
        {(node in FIELD_META) && <>
          <div className="px-2 pt-2 pb-1 text-[11px] font-semibold" style={{ color: S.dim }}>Definition</div>
          <Detail k="Type" v={meta.label} />
          <Detail k="By" v="Time" />
          <Detail k="Display time" v={`${cur.t.toFixed(3)} s`} />
          <Detail k="Scope" v="All bodies" />
          <div className="px-2 pt-2 pb-1 text-[11px] font-semibold" style={{ color: S.dim }}>Results at display time</div>
          <Detail k="Minimum" v={`${series.length ? Math.min(...series.filter((s) => Math.abs(s.t - cur.t) < 0.2).map((s) => s.lo), Infinity).toFixed(meta.digits) : '—'} ${meta.unit}`} />
          <Detail k="Maximum" v={`${series.length ? Math.max(...series.filter((s) => Math.abs(s.t - cur.t) < 0.2).map((s) => s.hi), -Infinity).toFixed(meta.digits) : '—'} ${meta.unit}`} />
          <Detail k="Peak over flight" v={`${Math.max(...series.map((s) => s.hi)).toFixed(meta.digits)} ${meta.unit}`} />
        </>}
        {(node === 'model' || node === 'geometry') && <>
          <Num k="Diameter" v={d.diameter} on={(n) => set({ diameter: n })} unit="mm" scale={1000} digits={0} />
          <Num k="Body length" v={d.bodyLength} on={(n) => set({ bodyLength: n })} unit="mm" scale={1000} digits={0} />
          <Num k="Fin span" v={d.finSpan} on={(n) => set({ finSpan: n })} unit="mm" scale={1000} digits={0} />
          <Detail k="Mass" v={`${a.massLiftoff.toFixed(3)} kg`} />
          <Detail k="Static margin" v={`${a.stability.toFixed(2)} cal`} />
        </>}
        {node === 'materials' && ['G12 fiberglass · 1850 kg/m³', 'G10 laminate · 1850 kg/m³', 'Al 6061-T6 · 2700 kg/m³', 'APCP propellant · 1750 kg/m³'].map((m) => <Detail key={m} k={m.split(' · ')[0]} v={m.split(' · ')[1]} />)}
        {node === 'mesh' && <><Detail k="Method" v="Axisymmetric panels" /><Detail k="Body stations" v="151" /><Detail k="Circumferential" v="72" /><Detail k="Quality" v="Preview" /></>}
        {(node === 'study' || node === 'settings') && <><Detail k="Solver" v="DP5(4) adaptive" /><Detail k="Relative tolerance" v="1e-6" /><Detail k="End condition" v="Landing" /><Num k="Rail length" v={d.railLength} on={(n) => set({ railLength: n })} unit="m" /><Num k="Launch angle" v={d.launchAngle} on={(n) => set({ launchAngle: n })} unit="°" /></>}
        {node === 'atmosphere' && <><Detail k="Model" v="ISA 1976 + GFS 06z" /><Num k="Ground wind" v={d.wind} on={(n) => set({ wind: n })} unit="m/s" /><Detail k="Site elevation" v="1 401 m MSL" /></>}
        {node === 'motor' && (
          <div className="grid grid-cols-[48%_52%] border-b text-[12px]" style={{ borderColor: S.line, background: 'rgba(250,204,21,.05)' }}>
            <div className="border-r px-2 py-[3px]" style={{ borderColor: S.line, color: S.muted }}>Motor</div>
            <select aria-label="Motor" value={d.motorId} onChange={(e) => set({ motorId: e.target.value })} className="bg-transparent px-1 font-source-mono text-[12px] outline-none">{MOTORS.map((m) => <option key={m.id} value={m.id} style={{ background: S.panel }}>{m.name}</option>)}</select>
          </div>
        )}
        {node === 'motor' && <><Detail k="Total impulse" v={`${fmt(motorById(d.motorId).impulse)} N·s`} /><Detail k="Burn time" v={`${motorById(d.motorId).burn} s`} /></>}
        {(node === 'solution' || node === 'info' || node === 'trajectory') && <><Detail k="Status" v={solving ? 'Solving…' : 'Done'} /><Detail k="Apogee" v={`${fmt(ft(r.apogee))} ft`} /><Detail k="Max Mach" v={r.machMax.toFixed(3)} /><Detail k="Max q" v={`${fmt(r.qmax / 1000)} kPa`} /><Detail k="Iterations" v={residuals.length ? residuals[residuals.length - 1].it : 240} /></>}
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex h-7 items-center gap-3 border-b px-2 text-[11px] font-semibold tracking-[0.06em]" style={{ borderColor: S.line, background: S.panel2, color: S.muted }}>
          {node === 'info' ? 'SOLUTION INFORMATION · RESIDUALS' : node === 'trajectory' ? 'GRAPH · TRAJECTORY' : `GRAPH · ${meta.label.toUpperCase()} vs TIME`}
          {solving && <Loader2 size={11} className="animate-spin" style={{ color: S.accent }} />}
        </div>
        <div className="min-h-0 flex-1 px-2 pt-1">
          {node === 'info' ? (
            residuals.length ? <LineChart data={residuals} x={(p) => p.it} series={[{ key: 'mom', label: 'Momentum', color: '#60A5FA', value: (p) => Math.log10(p.mom), digits: 2 }, { key: 'mass', label: 'Mass', color: '#F87171', value: (p) => Math.log10(p.mass), digits: 2 }, { key: 'energy', label: 'Energy', color: '#4ADE80', value: (p) => Math.log10(p.energy), digits: 2 }]} theme={chartTheme} height={170} xLabel="iteration" yLabel="log₁₀ residual" />
              : <div className="grid h-full place-items-center text-[12px]" style={{ color: S.dim }}><span className="flex items-center gap-2"><Square size={12} /> Press Solve to stream residuals here.</span></div>
          ) : node === 'trajectory' ? (
            <LineChart data={ascent} x={(p) => p.t} series={[{ key: 'h', label: 'Altitude', color: S.accent, value: (p) => p.h, area: true, unit: ' m' }]} theme={chartTheme} height={170} xLabel="t (s)" markers={[{ x: cur.t, label: 'display time', color: S.warn }]} />
          ) : (
            <div onClick={(e) => { const r2 = (e.currentTarget as HTMLElement).getBoundingClientRect(); const u = (e.clientX - r2.left - 52 * (r2.width / 640)) / (r2.width * (572 / 640)); setTi(Math.round(Math.min(1, Math.max(0, u)) * (ascent.length - 1))); }}>
              <LineChart data={series} x={(p) => p.t} series={[{ key: 'hi', label: 'Max', color: '#F87171', value: (p) => p.hi, unit: ` ${meta.unit}`, digits: meta.digits }, { key: 'lo', label: 'Min', color: '#60A5FA', value: (p) => p.lo, dash: '4 3', unit: ` ${meta.unit}`, digits: meta.digits }]} theme={chartTheme} height={170} xLabel="t (s) · click to set display time" markers={[{ x: cur.t, label: `t=${cur.t.toFixed(1)}`, color: S.warn }]} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function labelOf(n: NodeId) {
  return ({ model: 'Model', geometry: 'Geometry', materials: 'Materials', mesh: 'Panel mesh', study: 'Flight Study 1', settings: 'Analysis settings', atmosphere: 'Atmosphere', motor: 'Motor thrust', solution: 'Solution', info: 'Solution information', trajectory: 'Trajectory', ...Object.fromEntries(Object.entries(FIELD_META).map(([k, v]) => [k, v.label])) } as Record<string, string>)[n];
}
