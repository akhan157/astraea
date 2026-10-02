import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { DropdownMenu } from 'radix-ui';
import { ChevronDown, ChevronRight, Maximize2, Minimize2 } from 'lucide-react';
import { useDesignStore, useEngineering } from '../../shared/store';
import { MOTORS, analyze, massItems, motorById, simulate, type Design, type NoseShape } from '../../shared/model';
import { RocketModel, noseRadius } from '../../shared/Rocket3D';
import { cn, fmt, ft } from '../../shared/format';

/* Classic dark drafting CAD: graphite model space, amber command accent, blue grips. */
const Q = { app: '#1F2227', model: '#17191D', panel: '#262A31', panel2: '#2C3139', line: '#363B44', grid: '#1F2328', gridMajor: '#262B32', fg: '#D5D9DF', muted: '#8D949E', dim: '#646B75', amber: '#F0A43A', grip: '#3FA9F5', geom: '#C9CED6', hidden: '#6B727C', cl: '#4F7A55', cg: '#5EC2F2', cp: '#F26D6D', red: '#EF5350', green: '#66BB6A' };

type Toggles = { GRID: boolean; SNAP: boolean; ORTHO: boolean; OSNAP: boolean; DYN: boolean };
type Part = 'nose' | 'body' | 'fins' | 'motor' | null;
type ViewId = 'front' | 'top' | 'end' | 'persp';
interface Line { kind: 'cmd' | 'out' | 'err'; text: string }

export default function Quad() {
  const design = useDesignStore((s) => s.design);
  const setRaw = useDesignStore((s) => s.set);
  const [sel, setSel] = useState<Part>('fins');
  const [active, setActive] = useState<ViewId>('front');
  const [max, setMax] = useState<ViewId | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [toggles, setToggles] = useState<Toggles>({ GRID: true, SNAP: false, ORTHO: true, OSNAP: true, DYN: true });
  const undo = useRef<Design[]>([]);
  const redo = useRef<Design[]>([]);
  const [log, setLog] = useState<Line[]>([
    { kind: 'out', text: 'Astraea 2027 · Kestrel IV.ast opened · 9 bodies, 3 studies' },
    { kind: 'out', text: 'Type HELP for commands. Click geometry to select, drag blue grips to edit.' }
  ]);

  /** All edits go through here so they land on the undo stack. */
  const apply = useCallback((patch: Partial<Design>, label?: string) => {
    undo.current.push(useDesignStore.getState().design);
    redo.current = [];
    setRaw(patch);
    if (label) setLog((l) => [...l, { kind: 'out', text: label }]);
  }, [setRaw]);
  const doUndo = useCallback(() => {
    const prev = undo.current.pop(); if (!prev) return;
    redo.current.push(useDesignStore.getState().design); setRaw(prev);
    setLog((l) => [...l, { kind: 'out', text: `UNDO · ${undo.current.length} step(s) remaining` }]);
  }, [setRaw]);
  const doRedo = useCallback(() => {
    const next = redo.current.pop(); if (!next) return;
    undo.current.push(useDesignStore.getState().design); setRaw(next);
    setLog((l) => [...l, { kind: 'out', text: 'REDO' }]);
  }, [setRaw]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
      if (e.key === 'Escape') setSel(null);
      if (e.key === 'F7') { e.preventDefault(); setToggles((t) => ({ ...t, GRID: !t.GRID })); }
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [doUndo, doRedo]);

  const views: ViewId[] = ['front', 'persp', 'top', 'end'];
  const shown = max ? [max] : views;

  return (
    <div className="flex h-full flex-col overflow-hidden font-archivo text-[12px]" style={{ background: Q.app, color: Q.fg }}>
      <MenuBar undo={doUndo} redo={doRedo} />
      <div className="flex min-h-0 flex-1">
        <div className={cn('grid min-w-0 flex-1 gap-px p-px', !max && 'grid-cols-1 md:grid-cols-2 md:grid-rows-2')} style={{ background: Q.line }}>
          {shown.map((v) => (
            <Viewport key={v} id={v} active={active === v} onActivate={() => setActive(v)} maxed={max === v} onToggleMax={() => setMax(max ? null : v)}>
              {v === 'persp' ? <Persp sel={sel} /> : <Ortho view={v} sel={sel} setSel={setSel} apply={apply} grid={toggles.GRID} onCursor={setCursor} />}
            </Viewport>
          ))}
        </div>
        <PropertiesPalette sel={sel} setSel={setSel} apply={apply} design={design} />
      </div>
      <CommandLine log={log} setLog={setLog} apply={apply} setSel={setSel} undo={doUndo} redo={doRedo} setMax={setMax} />
      <StatusBar cursor={cursor} toggles={toggles} setToggles={setToggles} />
    </div>
  );
}

/* ───────────────────────── chrome ───────────────────────── */

function MenuBar({ undo, redo }: { undo: () => void; redo: () => void }) {
  const menus: Record<string, [string, string?, (() => void)?][]> = {
    File: [['New', 'Ctrl+N'], ['Open…', 'Ctrl+O'], ['Save', 'Ctrl+S'], ['Export STEP…'], ['Export DXF…']],
    Edit: [['Undo', 'Ctrl+Z', undo], ['Redo', 'Ctrl+Y', redo], ['Select all', 'Ctrl+A']],
    View: [['Zoom extents', 'Z E'], ['Viewports', ''], ['Visual styles', '']],
    Insert: [['Nose cone'], ['Body tube'], ['Fin set'], ['Bulkhead'], ['Motor mount']],
    Analyze: [['Stability (Barrowman)'], ['Flight 6-DOF', 'F5'], ['Monte Carlo'], ['Mass properties']],
    Tools: [['Units…'], ['Materials library…'], ['Motor database…']],
    Help: [['Command reference'], ['About Astraea']]
  };
  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b px-2" style={{ borderColor: Q.line, background: '#191B1F' }}>
      <span className="mr-2 flex items-center gap-1.5 font-semibold tracking-wide"><span className="grid size-5 place-items-center rounded-sm text-[11px] font-bold text-black" style={{ background: Q.amber }}>A</span><span className="hidden sm:inline">ASTRAEA</span></span>
      {Object.entries(menus).map(([m, items]) => (
        <DropdownMenu.Root key={m}>
          <DropdownMenu.Trigger className="rounded px-2 py-1 text-[12px] outline-none hover:bg-white/5 data-[state=open]:bg-white/10">{m}</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={2} className="z-50 min-w-52 border py-1 font-archivo text-[12px] shadow-2xl" style={{ background: Q.panel, borderColor: Q.line, color: Q.fg }}>
              {items.map(([l, k, fn]) => (
                <DropdownMenu.Item key={l} onSelect={() => fn?.()} className="flex cursor-default justify-between gap-6 px-3 py-1.5 outline-none data-[highlighted]:bg-[#3A4250]">
                  {l}<span style={{ color: Q.dim }}>{k}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ))}
      <span className="flex-1" />
      <span className="hidden items-center gap-3 font-jb text-[11px] lg:flex" style={{ color: Q.muted }}>
        <span>Layer <span className="rounded-sm border px-1.5 py-px" style={{ borderColor: Q.line, color: Q.fg }}>■ AIRFRAME</span></span>
        <span>Kestrel IV.ast</span>
      </span>
    </div>
  );
}

const VIEW_LABEL: Record<ViewId, string> = { front: 'Front', top: 'Top', end: 'Aft', persp: 'SE Isometric' };

function Viewport({ id, active, onActivate, maxed, onToggleMax, children }: { id: ViewId; active: boolean; onActivate: () => void; maxed: boolean; onToggleMax: () => void; children: ReactNode }) {
  return (
    <div className="relative min-h-[220px] min-w-0 overflow-hidden" style={{ background: Q.model, outline: active ? `1px solid ${Q.amber}` : 'none', outlineOffset: -1 }} onPointerDownCapture={onActivate}>
      {children}
      <div className="pointer-events-auto absolute top-1 left-1.5 flex items-center gap-0.5 font-jb text-[11px]" style={{ color: active ? Q.fg : Q.muted }}>
        <span>[−]</span><span>[{VIEW_LABEL[id]}]</span><span>[{id === 'persp' ? 'Conceptual' : '2D Wireframe'}]</span>
        <button onClick={onToggleMax} aria-label={maxed ? 'Restore viewports' : 'Maximize viewport'} className="ml-1 rounded p-0.5 hover:bg-white/10">{maxed ? <Minimize2 size={11} /> : <Maximize2 size={11} />}</button>
      </div>
    </div>
  );
}

/* ───────────────────────── orthographic views ───────────────────────── */

function Ortho({ view, sel, setSel, apply, grid, onCursor }: { view: Exclude<ViewId, 'persp'>; sel: Part; setSel: (p: Part) => void; apply: (p: Partial<Design>, label?: string) => void; grid: boolean; onCursor: (c: { x: number; y: number } | null) => void }) {
  const { design: d, a } = useEngineering();
  const svg = useRef<SVGSVGElement>(null);
  const L = a.length;
  const Rr = d.diameter / 2;
  const span = Rr + d.finSpan;
  // model-space bounds in mm
  const base = useMemo(() => view === 'end' ? { x: -span * 1300, y: -span * 1300, w: span * 2600, h: span * 2600 } : { x: -120, y: -span * 1000 - 260, w: L * 1000 + 240, h: span * 2000 + 520 }, [view, span, L]);
  const [vb, setVb] = useState(base);
  const userZoomed = useRef(false);
  useEffect(() => { if (!userZoomed.current) setVb(base); }, [base]);
  const [grip, setGrip] = useState<string | null>(null);
  const pan = useRef<{ x: number; y: number; vb: typeof vb } | null>(null);

  const toModel = (e: { clientX: number; clientY: number }) => {
    const p = svg.current!.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };

  const mm = (m: number) => m * 1000;
  const outline = useMemo(() => {
    const n = 48; const top: string[] = []; const bot: string[] = [];
    for (let i = 0; i <= n; i++) { const x = (i / n) * d.noseLength; const r = noseRadius(d.noseShape, x, d.noseLength, Rr); top.push(`${mm(x)},${-mm(r)}`); bot.unshift(`${mm(x)},${mm(r)}`); }
    return `M${top.join(' L')} L${mm(L)},${-mm(Rr)} L${mm(L)},${mm(Rr)} L${bot.join(' L')}Z`;
  }, [d.noseShape, d.noseLength, Rr, L]);

  const xf = L - d.finRoot;
  const finPoly = (proj: number) => {
    const s = proj; const y0 = mm(Rr) * Math.sign(s || 1), y1 = mm(Rr + d.finSpan * Math.abs(s)) * Math.sign(s || 1);
    return [[mm(xf), -y0], [mm(xf + d.finSweep), -y1], [mm(xf + d.finSweep + d.finTip), -y1], [mm(L), -y0]].map((p) => p.join(',')).join(' ');
  };
  const angles = Array.from({ length: d.finCount }, (_, i) => (i / d.finCount) * Math.PI * 2);
  const proj = angles.map((t) => (view === 'front' ? Math.cos(t) : Math.sin(t)));
  const m = motorById(d.motorId);
  const motorLen = Math.min(d.bodyLength * 0.45, 0.25 + m.impulse / 9000);

  const onMove = (e: React.PointerEvent) => {
    const p = toModel(e);
    onCursor(view === 'end' ? { x: p.x, y: -p.y } : { x: p.x, y: -p.y });
    if (pan.current) {
      const r = svg.current!.getBoundingClientRect();
      const k = pan.current.vb.w / r.width;
      setVb({ ...pan.current.vb, x: pan.current.vb.x - (e.clientX - pan.current.x) * k, y: pan.current.vb.y - (e.clientY - pan.current.y) * k });
      return;
    }
    if (!grip) return;
    const x = p.x / 1000, y = -p.y / 1000;
    const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    if (grip === 'nose') useDesignStore.getState().set({ noseLength: c(x, 0.2, 1.1) });
    if (grip === 'tail') useDesignStore.getState().set({ bodyLength: c(x - d.noseLength, 0.8, 3) });
    if (grip === 'finLE') useDesignStore.getState().set({ finSpan: c(Math.abs(y) - Rr, 0.04, 0.25), finSweep: c(x - xf, 0, 0.35) });
    if (grip === 'finTE') useDesignStore.getState().set({ finTip: c(x - xf - d.finSweep, 0, 0.3) });
    if (grip === 'root') useDesignStore.getState().set({ finRoot: c(L - x, 0.08, 0.45) });
    if (grip === 'dia') useDesignStore.getState().set({ diameter: c(Math.abs(y) * 2, 0.054, 0.2) });
  };

  const startGrip = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    apply({}, undefined); // checkpoint for undo
    setGrip(id);
  };

  const gripSize = vb.w / 110;
  const G = ({ id, x, y }: { id: string; x: number; y: number }) => (
    <rect x={x - gripSize / 2} y={y - gripSize / 2} width={gripSize} height={gripSize} fill={grip === id ? Q.red : Q.grip} stroke="#0B1A2A" strokeWidth={vb.w / 1400} onPointerDown={startGrip(id)} style={{ cursor: 'move' }} />
  );
  const stroke = vb.w / 900;
  const selStyle = (p: Part) => (sel === p ? { stroke: Q.grip, strokeDasharray: `${stroke * 6} ${stroke * 3}` } : { stroke: Q.geom });

  const gridStep = view === 'end' ? 20 : 50;
  return (
    <svg
      ref={svg}
      className="absolute inset-0 h-full w-full"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ cursor: 'crosshair', touchAction: 'none' }}
      onPointerMove={onMove}
      onPointerDown={(e) => { if ((e.target as Element).tagName === 'svg' || (e.target as Element).getAttribute('data-bg')) { (e.currentTarget as Element).setPointerCapture(e.pointerId); pan.current = { x: e.clientX, y: e.clientY, vb }; if (e.button === 0 && !e.shiftKey) setSel(null); } }}
      onPointerUp={() => { if (grip) apply({}, `GRIP · ${grip} edited`); setGrip(null); pan.current = null; }}
      onPointerLeave={() => onCursor(null)}
      onWheel={(e) => {
        userZoomed.current = true;
        const p = toModel(e); const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
        setVb((v) => ({ x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w: v.w * k, h: v.h * k }));
      }}
      onDoubleClick={(e) => { if ((e.target as Element).tagName === 'svg') { userZoomed.current = false; setVb(base); } }}
    >
      <defs>
        <pattern id={`g-${view}`} width={gridStep} height={gridStep} patternUnits="userSpaceOnUse"><path d={`M${gridStep} 0 L0 0 0 ${gridStep}`} fill="none" stroke={Q.grid} strokeWidth={stroke} /></pattern>
        <pattern id={`G-${view}`} width={gridStep * 5} height={gridStep * 5} patternUnits="userSpaceOnUse"><rect width={gridStep * 5} height={gridStep * 5} fill={`url(#g-${view})`} /><path d={`M${gridStep * 5} 0 L0 0 0 ${gridStep * 5}`} fill="none" stroke={Q.gridMajor} strokeWidth={stroke * 1.4} /></pattern>
      </defs>
      {grid && <rect data-bg="1" x={vb.x - vb.w} y={vb.y - vb.h} width={vb.w * 3} height={vb.h * 3} fill={`url(#G-${view})`} />}

      {view !== 'end' ? (
        <g fill="none" strokeWidth={stroke * 1.4}>
          {/* centreline */}
          <line x1={-80} x2={mm(L) + 80} y1={0} y2={0} stroke={Q.cl} strokeWidth={stroke} strokeDasharray={`${stroke * 24} ${stroke * 5} ${stroke * 4} ${stroke * 5}`} />
          {/* hidden internals */}
          <g stroke={Q.hidden} strokeWidth={stroke} strokeDasharray={`${stroke * 6} ${stroke * 4}`}>
            <rect x={mm(L - motorLen)} y={-m.diameter / 2 - 4} width={mm(motorLen)} height={m.diameter + 8} style={sel === 'motor' ? { stroke: Q.grip } : undefined} />
            <line x1={mm(d.noseLength)} x2={mm(d.noseLength)} y1={-mm(Rr)} y2={mm(Rr)} />
            <line x1={mm(d.noseLength + 0.4)} x2={mm(d.noseLength + 0.4)} y1={-mm(Rr)} y2={mm(Rr)} />
          </g>
          {/* body */}
          <path d={outline} {...selStyle(sel === 'nose' ? 'nose' : 'body')} onPointerDown={(e) => { e.stopPropagation(); const p = toModel(e); setSel(p.x < mm(d.noseLength) ? 'nose' : 'body'); }} style={{ cursor: 'pointer', ...(sel === 'nose' || sel === 'body' ? selStyle(sel) : {}) }} fill="rgba(0,0,0,0.001)" />
          {/* fins (projected) */}
          {proj.map((p, i) => Math.abs(p) > 0.04 ? (
            <polygon key={i} points={finPoly(p)} fill="rgba(0,0,0,0.001)" {...selStyle('fins')} strokeOpacity={Math.abs(p) > 0.99 ? 1 : 0.7} onPointerDown={(e) => { e.stopPropagation(); setSel('fins'); }} style={{ cursor: 'pointer' }} />
          ) : (
            <line key={i} x1={mm(xf)} x2={mm(L)} y1={0} y2={0} {...selStyle('fins')} />
          ))}
          {/* CG / CP */}
          <g strokeWidth={stroke * 1.2}>
            <circle cx={mm(a.cg)} cy={0} r={mm(Rr) * 0.32} stroke={Q.cg} />
            <path d={`M${mm(a.cg) - mm(Rr) * 0.5},0 H${mm(a.cg) + mm(Rr) * 0.5} M${mm(a.cg)},${-mm(Rr) * 0.5} V${mm(Rr) * 0.5}`} stroke={Q.cg} />
            <circle cx={mm(a.cp)} cy={0} r={mm(Rr) * 0.32} stroke={Q.cp} />
            <circle cx={mm(a.cp)} cy={0} r={mm(Rr) * 0.08} fill={Q.cp} stroke="none" />
          </g>
          <text x={mm(a.cg)} y={mm(Rr) + vb.h * 0.06} fill={Q.cg} fontSize={vb.w / 70} textAnchor="middle" fontFamily="JetBrains Mono">CG {fmt(mm(a.cg))}</text>
          <text x={mm(a.cp)} y={mm(Rr) + vb.h * 0.11} fill={Q.cp} fontSize={vb.w / 70} textAnchor="middle" fontFamily="JetBrains Mono">CP {fmt(mm(a.cp))}</text>
          {/* dimensions */}
          <Dim x1={0} x2={mm(L)} y={-mm(span) - vb.h * 0.12} label={fmt(mm(L))} k={vb.w} />
          {view === 'front' && <Dim x1={mm(xf + d.finSweep)} x2={mm(xf + d.finSweep + d.finTip)} y={-mm(span) - vb.h * 0.04} label={fmt(mm(d.finTip))} k={vb.w} />}
          {/* grips */}
          {view === 'front' && sel === 'fins' && <><G id="root" x={mm(xf)} y={-mm(Rr)} /><G id="finLE" x={mm(xf + d.finSweep)} y={-mm(span)} /><G id="finTE" x={mm(xf + d.finSweep + d.finTip)} y={-mm(span)} /></>}
          {view === 'front' && sel === 'nose' && <G id="nose" x={mm(d.noseLength)} y={-mm(Rr)} />}
          {view === 'front' && sel === 'body' && <><G id="tail" x={mm(L)} y={0} /><G id="dia" x={mm(d.noseLength + d.bodyLength / 2)} y={-mm(Rr)} /></>}
          {/* UCS */}
          <Ucs x={vb.x + vb.w * 0.04} y={vb.y + vb.h * 0.92} k={vb.w} labels={view === 'front' ? ['X', 'Z'] : ['X', 'Y']} />
        </g>
      ) : (
        <g fill="none" strokeWidth={stroke * 1.4}>
          <line x1={-mm(span) * 1.2} x2={mm(span) * 1.2} y1={0} y2={0} stroke={Q.cl} strokeWidth={stroke} strokeDasharray={`${stroke * 18} ${stroke * 4} ${stroke * 3} ${stroke * 4}`} />
          <line y1={-mm(span) * 1.2} y2={mm(span) * 1.2} x1={0} x2={0} stroke={Q.cl} strokeWidth={stroke} strokeDasharray={`${stroke * 18} ${stroke * 4} ${stroke * 3} ${stroke * 4}`} />
          <circle r={mm(Rr)} {...selStyle('body')} fill="rgba(0,0,0,0.001)" onPointerDown={(e) => { e.stopPropagation(); setSel('body'); }} style={{ cursor: 'pointer' }} />
          <circle r={m.diameter / 2 + 4} stroke={sel === 'motor' ? Q.grip : Q.hidden} strokeDasharray={`${stroke * 6} ${stroke * 4}`} onPointerDown={(e) => { e.stopPropagation(); setSel('motor'); }} />
          <circle r={m.diameter * 0.2} stroke={Q.geom} strokeWidth={stroke} />
          {angles.map((t, i) => {
            const c = Math.cos(t - Math.PI / 2), s = Math.sin(t - Math.PI / 2), th = mm(d.finThickness) / 2;
            const p = [[mm(Rr) * c - th * s, mm(Rr) * s + th * c], [mm(span) * c - th * s, mm(span) * s + th * c], [mm(span) * c + th * s, mm(span) * s - th * c], [mm(Rr) * c + th * s, mm(Rr) * s - th * c]];
            return <polygon key={i} points={p.map((q) => q.join(',')).join(' ')} {...selStyle('fins')} fill={sel === 'fins' ? 'rgba(63,169,245,.25)' : 'rgba(201,206,214,.15)'} onPointerDown={(e) => { e.stopPropagation(); setSel('fins'); }} style={{ cursor: 'pointer' }} />;
          })}
          <text x={0} y={mm(span) * 1.18} fill={Q.muted} fontSize={vb.w / 34} textAnchor="middle" fontFamily="JetBrains Mono">{d.finCount} × {Math.round(360 / d.finCount)}°  ·  Ø{fmt(mm(d.diameter))}</text>
          <Ucs x={vb.x + vb.w * 0.06} y={vb.y + vb.h * 0.92} k={vb.w} labels={['Y', 'Z']} />
        </g>
      )}
    </svg>
  );
}

function Dim({ x1, x2, y, label, k }: { x1: number; x2: number; y: number; label: string; k: number }) {
  const s = k / 900, a = k / 110;
  return (
    <g stroke={Q.amber} strokeWidth={s} fill="none">
      <line x1={x1} x2={x1} y1={y - a * 0.6} y2={y + a * 2} /><line x1={x2} x2={x2} y1={y - a * 0.6} y2={y + a * 2} />
      <line x1={x1} x2={x2} y1={y} y2={y} />
      <path d={`M${x1},${y} l${a},${-a / 3} v${(a / 3) * 2}Z M${x2},${y} l${-a},${-a / 3} v${(a / 3) * 2}Z`} fill={Q.amber} />
      <text x={(x1 + x2) / 2} y={y - a * 0.5} fill={Q.amber} stroke="none" fontSize={k / 62} textAnchor="middle" fontFamily="JetBrains Mono">{label}</text>
    </g>
  );
}

function Ucs({ x, y, k, labels }: { x: number; y: number; k: number; labels: [string, string] | string[] }) {
  const L = k / 22, s = k / 700;
  return (
    <g strokeWidth={s * 1.6} fontFamily="JetBrains Mono" fontSize={k / 75}>
      <line x1={x} y1={y} x2={x + L} y2={y} stroke="#E57373" /><text x={x + L + k / 160} y={y + k / 230} fill="#E57373" stroke="none">{labels[0]}</text>
      <line x1={x} y1={y} x2={x} y2={y - L} stroke="#81C784" /><text x={x - k / 220} y={y - L - k / 160} fill="#81C784" stroke="none">{labels[1]}</text>
      <rect x={x - k / 400} y={y - k / 400} width={k / 200} height={k / 200} fill="#90A4AE" stroke="none" />
    </g>
  );
}

function Persp({ sel }: { sel: Part }) {
  const { design: d, a } = useEngineering();
  return (
    <Suspense fallback={null}>
      <Canvas dpr={[1, 2]} camera={{ position: [1.6, 1.1, 2.6], fov: 30 }} style={{ position: 'absolute', inset: 0 }}>
        <color attach="background" args={[Q.model]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 4, 3]} intensity={1.1} />
        <directionalLight position={[-3, -1, -2]} intensity={0.35} color="#9FB4D8" />
        <group rotation={[0, 0, -Math.PI / 2]} position={[-a.length / 2, 0.1, 0]}>
          <RocketModel d={d} look={{ body: '#7B838E', nose: '#8B939E', fins: '#6E7681', accent: '#4B525C', roughness: 0.8, metalness: 0, edges: '#C9CED6', highlight: sel === 'motor' ? null : sel, highlightColor: '#3FA9F5' }} />
        </group>
        <Grid position={[0, -0.14, 0]} args={[10, 10]} cellSize={0.1} cellThickness={0.5} cellColor="#22262C" sectionSize={0.5} sectionThickness={0.9} sectionColor="#2D333B" fadeDistance={6} infiniteGrid />
        <OrbitControls makeDefault enableDamping target={[0, 0.1, 0]} />
      </Canvas>
    </Suspense>
  );
}

/* ───────────────────────── properties palette ───────────────────────── */

function PropertiesPalette({ sel, setSel, apply, design: d }: { sel: Part; setSel: (p: Part) => void; apply: (p: Partial<Design>, label?: string) => void; design: Design }) {
  const { a, r } = useEngineering();
  const items = massItems(d);
  const [open, setOpen] = useState<Record<string, boolean>>({ General: true, Geometry: true, Mass: true, Analysis: true });
  const Cat = ({ name, children }: { name: string; children: ReactNode }) => (
    <div>
      <button onClick={() => setOpen({ ...open, [name]: !open[name] })} className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-semibold tracking-wide" style={{ background: Q.panel2, color: Q.fg }}>{open[name] ? <ChevronDown size={11} /> : <ChevronRight size={11} />}{name}</button>
      {open[name] && <div>{children}</div>}
    </div>
  );
  const Row = ({ k, v }: { k: string; v: ReactNode }) => (
    <div className="grid grid-cols-[46%_54%] border-b text-[11.5px]" style={{ borderColor: Q.line }}>
      <div className="truncate border-r px-2 py-[3px]" style={{ borderColor: Q.line, color: Q.muted }}>{k}</div>
      <div className="truncate px-2 py-[3px] font-jb">{v}</div>
    </div>
  );
  const Edit = ({ k, v, unit = 'mm', on, scale = 1000, digits = 0 }: { k: string; v: number; unit?: string; on: (n: number) => void; scale?: number; digits?: number }) => {
    const [draft, setDraft] = useState<string | null>(null);
    return (
      <div className="grid grid-cols-[46%_54%] border-b text-[11.5px]" style={{ borderColor: Q.line }}>
        <div className="truncate border-r px-2 py-[3px]" style={{ borderColor: Q.line, color: Q.muted }}>{k}</div>
        <input aria-label={k} className="tnum min-w-0 bg-transparent px-2 py-[3px] font-jb outline-none focus:bg-[#1A2836] focus:text-white" value={draft ?? `${(v * scale).toFixed(digits)} ${unit}`} onFocus={(e) => { setDraft((v * scale).toFixed(digits)); setTimeout(() => e.target.select()); }} onChange={(e) => setDraft(e.target.value)} onBlur={() => { const n = parseFloat(draft ?? ''); if (!isNaN(n) && n / scale !== v) on(n / scale); setDraft(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </div>
    );
  };
  const name = sel ? { nose: 'Nose cone', body: 'Body tube', fins: 'Fin set', motor: 'Motor' }[sel] : 'No selection';
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l lg:flex" style={{ borderColor: Q.line, background: Q.panel }}>
      <div className="flex h-7 items-center px-2 text-[11px] font-semibold tracking-[0.1em]" style={{ color: Q.muted, background: '#202329' }}>PROPERTIES</div>
      <div className="p-1.5">
        <select aria-label="Selected object" value={sel ?? ''} onChange={(e) => setSel((e.target.value || null) as Part)} className="h-6 w-full border px-1 text-[11.5px] outline-none" style={{ background: Q.model, borderColor: Q.line, color: Q.fg }}>
          <option value="">No selection</option><option value="nose">Nose cone (1)</option><option value="body">Body tube (1)</option><option value="fins">Fin set ({d.finCount})</option><option value="motor">Motor (1)</option>
        </select>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto">
        <Cat name="General">
          <Row k="Object" v={name} />
          <Row k="Layer" v={sel === 'motor' ? 'PROPULSION' : 'AIRFRAME'} />
          <Row k="Material" v={sel === 'motor' ? 'APCP' : sel === 'fins' ? 'G10' : { fiberglass: 'G12 FG', carbon: 'CF', bluetube: 'Blue Tube' }[d.material]} />
        </Cat>
        <Cat name="Geometry">
          {sel === 'nose' && <>
            <div className="grid grid-cols-[46%_54%] border-b text-[11.5px]" style={{ borderColor: Q.line }}>
              <div className="border-r px-2 py-[3px]" style={{ borderColor: Q.line, color: Q.muted }}>Profile</div>
              <select aria-label="Nose profile" value={d.noseShape} onChange={(e) => apply({ noseShape: e.target.value as NoseShape }, `PROPERTIES · nose profile = ${e.target.value}`)} className="bg-transparent px-1 font-jb text-[11.5px] outline-none" style={{ color: Q.fg }}>
                {['ogive', 'vonkarman', 'conical', 'elliptical'].map((s) => <option key={s} value={s} style={{ background: Q.panel }}>{s}</option>)}
              </select>
            </div>
            <Edit k="Length" v={d.noseLength} on={(n) => apply({ noseLength: n }, `PROPERTIES · nose length = ${fmt(n * 1000)}`)} />
          </>}
          {(sel === 'body' || sel === 'nose') && <Edit k="Diameter" v={d.diameter} on={(n) => apply({ diameter: n }, `PROPERTIES · diameter = ${fmt(n * 1000)}`)} />}
          {sel === 'body' && <Edit k="Length" v={d.bodyLength} on={(n) => apply({ bodyLength: n }, `PROPERTIES · body length = ${fmt(n * 1000)}`)} />}
          {sel === 'fins' && <>
            <Edit k="Count" v={d.finCount} unit="" scale={1} on={(n) => apply({ finCount: Math.max(3, Math.min(6, Math.round(n))) }, `PROPERTIES · fin count = ${Math.round(n)}`)} />
            <Edit k="Root chord" v={d.finRoot} on={(n) => apply({ finRoot: n }, `PROPERTIES · root = ${fmt(n * 1000)}`)} />
            <Edit k="Tip chord" v={d.finTip} on={(n) => apply({ finTip: n }, `PROPERTIES · tip = ${fmt(n * 1000)}`)} />
            <Edit k="Semi-span" v={d.finSpan} on={(n) => apply({ finSpan: n }, `PROPERTIES · span = ${fmt(n * 1000)}`)} />
            <Edit k="LE sweep" v={d.finSweep} on={(n) => apply({ finSweep: n }, `PROPERTIES · sweep = ${fmt(n * 1000)}`)} />
            <Edit k="Thickness" v={d.finThickness} digits={1} on={(n) => apply({ finThickness: n }, `PROPERTIES · thickness = ${(n * 1000).toFixed(1)}`)} />
          </>}
          {sel === 'motor' && (
            <div className="grid grid-cols-[46%_54%] border-b text-[11.5px]" style={{ borderColor: Q.line }}>
              <div className="border-r px-2 py-[3px]" style={{ borderColor: Q.line, color: Q.muted }}>Designation</div>
              <select aria-label="Motor" value={d.motorId} onChange={(e) => apply({ motorId: e.target.value }, `PROPERTIES · motor = ${e.target.value}`)} className="bg-transparent px-1 font-jb text-[11.5px] outline-none" style={{ color: Q.fg }}>
                {MOTORS.map((x) => <option key={x.id} value={x.id} style={{ background: Q.panel }}>{x.name}</option>)}
              </select>
            </div>
          )}
          {!sel && <div className="px-2 py-2 text-[11.5px]" style={{ color: Q.dim }}>Select geometry in any viewport.</div>}
        </Cat>
        <Cat name="Mass">
          {sel && <Row k="Mass" v={`${fmt(({ nose: items[0].mass, body: items[5].mass, fins: items[6].mass, motor: items[8].mass })[sel] * 1000)} g`} />}
          <Row k="Assembly mass" v={`${a.massLiftoff.toFixed(3)} kg`} />
          <Row k="CG from tip" v={`${fmt(a.cg * 1000)} mm`} />
        </Cat>
        <Cat name="Analysis">
          <Row k="CP from tip" v={`${fmt(a.cp * 1000)} mm`} />
          <Row k="Static margin" v={<span style={{ color: a.stability >= 1.5 && a.stability <= 3 ? Q.green : Q.amber }}>{a.stability.toFixed(2)} cal</span>} />
          <Row k="Apogee" v={`${fmt(ft(r.apogee))} ft`} />
          <Row k="Max Mach" v={<span style={{ color: r.machMax > 0.8 ? Q.amber : Q.fg }}>{r.machMax.toFixed(2)}</span>} />
          <Row k="Rail exit" v={`${r.railExit.toFixed(1)} m/s`} />
        </Cat>
      </div>
    </aside>
  );
}

/* ───────────────────────── command line ───────────────────────── */

const COMMANDS: { name: string; args: string; help: string }[] = [
  { name: 'SPAN', args: '<mm>', help: 'Fin semi-span' },
  { name: 'ROOT', args: '<mm>', help: 'Fin root chord' },
  { name: 'TIP', args: '<mm>', help: 'Fin tip chord' },
  { name: 'SWEEP', args: '<mm>', help: 'Fin leading-edge sweep' },
  { name: 'FINS', args: '<3-6>', help: 'Fin count' },
  { name: 'NOSE', args: '<mm>', help: 'Nose cone length' },
  { name: 'SHAPE', args: '<ogive|vonkarman|conical|elliptical>', help: 'Nose profile' },
  { name: 'DIA', args: '<mm>', help: 'Body outer diameter' },
  { name: 'BODY', args: '<mm>', help: 'Body tube length' },
  { name: 'MOTOR', args: '<designation>', help: 'Load motor from database' },
  { name: 'SELECT', args: '<nose|body|fins|motor>', help: 'Select an object' },
  { name: 'MASSPROP', args: '', help: 'List mass properties' },
  { name: 'STABILITY', args: '', help: 'Barrowman static margin' },
  { name: 'SIM', args: '', help: 'Run 6-DOF flight' },
  { name: 'UNDO', args: '', help: 'Undo last edit' },
  { name: 'REDO', args: '', help: 'Redo' },
  { name: 'VIEW', args: '<front|top|aft|iso|quad>', help: 'Maximize a viewport' },
  { name: 'HELP', args: '', help: 'List commands' }
];

function CommandLine({ log, setLog, apply, setSel, undo, redo, setMax }: { log: Line[]; setLog: React.Dispatch<React.SetStateAction<Line[]>>; apply: (p: Partial<Design>, label?: string) => void; setSel: (p: Part) => void; undo: () => void; redo: () => void; setMax: (v: ViewId | null) => void }) {
  const [input, setInput] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [pick, setPick] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 1e6 }); }, [log]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) ref.current?.focus();
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);

  const word = input.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
  const matches = input && !input.includes(' ') ? COMMANDS.filter((c) => c.name.startsWith(word)) : [];

  const out = (text: string, kind: Line['kind'] = 'out') => setLog((l) => [...l, { kind, text }]);
  const run = (raw: string) => {
    const [cmdRaw, ...rest] = raw.trim().split(/\s+/);
    const cmd = cmdRaw.toUpperCase(); const arg = rest.join(' '); const n = parseFloat(arg);
    setLog((l) => [...l, { kind: 'cmd', text: raw }]);
    setHist((h) => [...h, raw]); setHi(-1);
    const st = useEngineering_static();
    const need = (ok: boolean, msg: string) => { if (!ok) out(msg, 'err'); return ok; };
    const mmCmd: Record<string, keyof Design> = { SPAN: 'finSpan', ROOT: 'finRoot', TIP: 'finTip', SWEEP: 'finSweep', NOSE: 'noseLength', DIA: 'diameter', BODY: 'bodyLength' };
    if (mmCmd[cmd]) { if (need(!isNaN(n) && n > 0, `${cmd}: enter a length in mm, e.g. ${cmd} 120`)) { apply({ [mmCmd[cmd]]: n / 1000 } as Partial<Design>, `${cmd} set to ${fmt(n)} mm · regenerated 4 views`); setSel(['NOSE'].includes(cmd) ? 'nose' : ['DIA', 'BODY'].includes(cmd) ? 'body' : 'fins'); } return; }
    switch (cmd) {
      case 'FINS': if (need(n >= 3 && n <= 6, 'FINS: 3 to 6')) apply({ finCount: Math.round(n) }, `FINS = ${Math.round(n)}`); break;
      case 'SHAPE': if (need(['ogive', 'vonkarman', 'conical', 'elliptical'].includes(arg.toLowerCase()), 'SHAPE: ogive | vonkarman | conical | elliptical')) apply({ noseShape: arg.toLowerCase() as NoseShape }, `SHAPE = ${arg.toLowerCase()}`); break;
      case 'MOTOR': { const m = MOTORS.find((x) => x.id.toLowerCase() === arg.toLowerCase()); if (need(!!m, `MOTOR: unknown designation. Available: ${MOTORS.map((x) => x.id).join(', ')}`)) apply({ motorId: m!.id }, `MOTOR loaded · ${m!.maker} ${m!.name} · ${fmt(m!.impulse)} N·s`); break; }
      case 'SELECT': if (need(['nose', 'body', 'fins', 'motor'].includes(arg.toLowerCase()), 'SELECT: nose | body | fins | motor')) { setSel(arg.toLowerCase() as Part); out(`1 found · ${arg.toLowerCase()}`); } break;
      case 'MASSPROP': out(`Mass ${st.a.massLiftoff.toFixed(3)} kg · CG ${fmt(st.a.cg * 1000)} mm · burnout ${(st.a.massLiftoff - motorById(st.design.motorId).prop).toFixed(3)} kg`); break;
      case 'STABILITY': out(`CP ${fmt(st.a.cp * 1000)} mm · CG ${fmt(st.a.cg * 1000)} mm · margin ${st.a.stability.toFixed(3)} cal (${st.a.stability >= 1.5 && st.a.stability <= 3 ? 'OK' : 'OUT OF RANGE 1.5–3.0'})`); break;
      case 'SIM': out(`6-DOF · apogee ${fmt(ft(st.r.apogee))} ft · vmax ${fmt(st.r.vmax)} m/s · M ${st.r.machMax.toFixed(2)} · rail exit ${st.r.railExit.toFixed(1)} m/s · ${st.r.series.length} samples`); useDesignStore.getState().commitSim(); break;
      case 'UNDO': case 'U': undo(); break;
      case 'REDO': redo(); break;
      case 'VIEW': { const v = ({ front: 'front', top: 'top', aft: 'end', iso: 'persp', quad: null } as Record<string, ViewId | null>)[arg.toLowerCase()]; if (need(v !== undefined, 'VIEW: front | top | aft | iso | quad')) { setMax(v); out(`VIEW ${arg.toLowerCase()}`); } break; }
      case 'HELP': case '?': COMMANDS.forEach((c) => out(`  ${c.name.padEnd(10)} ${c.args.padEnd(36)} ${c.help}`)); break;
      case '': break;
      default: out(`Unknown command "${cmdRaw}". Press F1 or type HELP.`, 'err');
    }
  };

  return (
    <div className="relative shrink-0 border-t font-jb text-[11.5px]" style={{ borderColor: Q.line, background: '#15171A' }}>
      <div ref={scroller} className="thin-scroll h-[78px] overflow-y-auto px-3 py-1 whitespace-pre-wrap">
        {log.slice(-60).map((l, i) => <div key={i} style={{ color: l.kind === 'cmd' ? Q.fg : l.kind === 'err' ? Q.red : Q.muted }}>{l.kind === 'cmd' ? <><span style={{ color: Q.amber }}>Command: </span>{l.text}</> : l.text}</div>)}
      </div>
      {matches.length > 0 && (
        <div className="absolute bottom-[34px] left-3 z-20 w-[min(520px,calc(100vw-24px))] border shadow-2xl" style={{ background: Q.panel, borderColor: Q.line }}>
          {matches.slice(0, 7).map((c, i) => (
            <button key={c.name} onMouseDown={(e) => { e.preventDefault(); setInput(c.name + ' '); ref.current?.focus(); }} className="flex w-full gap-3 px-2.5 py-1 text-left" style={{ background: i === pick ? '#3A4250' : undefined }}>
              <span style={{ color: Q.amber }} className="w-24">{c.name}</span><span className="w-44 truncate" style={{ color: Q.dim }}>{c.args}</span><span style={{ color: Q.muted }}>{c.help}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex h-[30px] items-center gap-2 border-t px-3" style={{ borderColor: Q.line, background: '#1B1E22' }}>
        <ChevronRight size={13} style={{ color: Q.amber }} />
        <input
          ref={ref}
          id="cad-command"
          value={input}
          onChange={(e) => { setInput(e.target.value); setPick(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { if (matches.length && !input.includes(' ') && matches[pick]?.name !== word) { setInput(matches[pick].name + ' '); return; } run(input); setInput(''); }
            if (e.key === 'Tab' && matches.length) { e.preventDefault(); setInput(matches[pick].name + ' '); }
            if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); setPick((p) => (p + 1) % Math.min(7, matches.length)); }
            else if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); setPick((p) => (p - 1 + Math.min(7, matches.length)) % Math.min(7, matches.length)); }
            else if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); const j = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); setHi(j); setInput(hist[j]); }
            if (e.key === 'Escape') { setInput(''); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder="Type a command  (try: SPAN 110 · MOTOR K550W · STABILITY · VIEW aft · HELP)"
          className="h-full flex-1 bg-transparent outline-none placeholder:text-[#555C66]"
          style={{ color: Q.fg }}
          aria-label="Command line"
        />
      </div>
    </div>
  );
}

// Command handlers read the latest values synchronously.
function useEngineering_static() {
  const design = useDesignStore.getState().design;
  const a = analyze(design);
  return { design, a, r: simulate(design, a) };
}

function StatusBar({ cursor, toggles, setToggles }: { cursor: { x: number; y: number } | null; toggles: Toggles; setToggles: (t: Toggles) => void }) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-1 border-t px-2 font-jb text-[10.5px]" style={{ borderColor: Q.line, background: '#191B1F', color: Q.muted }}>
      <span className="tnum w-48 truncate">{cursor ? `${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)}, 0.0  mm` : '—'}</span>
      <span className="mx-1 hidden gap-px sm:flex">
        {['Model', 'Sheet 1', 'Sheet 2'].map((t, i) => <span key={t} className="px-2" style={{ background: i === 0 ? Q.panel2 : 'transparent', color: i === 0 ? Q.fg : Q.dim }}>{t}</span>)}
      </span>
      <span className="flex-1" />
      {Object.keys(toggles).map((k) => (
        <button key={k} onClick={() => setToggles({ ...toggles, [k]: !toggles[k as keyof Toggles] })} className="px-1.5 py-0.5" style={{ color: toggles[k as keyof Toggles] ? Q.grip : Q.dim, background: toggles[k as keyof Toggles] ? 'rgba(63,169,245,.1)' : 'transparent' }}>{k}</button>
      ))}
      <span className="hidden pl-2 md:inline">Units: mm · kg</span>
    </div>
  );
}
