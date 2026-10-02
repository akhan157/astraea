import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DropdownMenu, Slider, Switch } from 'radix-ui';
import { Toaster, toast } from 'sonner';
import {
  Target, Shapes, Flame, Weight, Wind, Orbit, Dices, Umbrella, ShieldCheck, FileText, CloudSun, Plus, Play, Maximize2,
  Minus, X, Loader2, Check, AlertTriangle, Lock, Waves, Radio, DollarSign, Hammer, MousePointer2, Hand
} from 'lucide-react';
import { useDesignStore, useEngineering } from '../../shared/store';
import { MOTORS, monteCarlo, motorById, thrustAt, type Design, type NoseShape } from '../../shared/model';
import { noseRadius } from '../../shared/Rocket3D';
import { Sparkline } from '../../shared/charts';
import { cn, fmt, ft } from '../../shared/format';

const T = { bg: '#0D0E11', dot: '#23252B', card: '#16171B', cardHi: '#1C1E23', line: '#26282E', fg: '#ECEDEF', muted: '#8B8E96', dim: '#5A5D65' };

type NodeId = 'mission' | 'airframe' | 'motor' | 'mass' | 'aero' | 'weather' | 'flight' | 'mc' | 'recovery' | 'verify' | 'report' | string;
interface GNode { id: NodeId; title: string; kind: string; x: number; y: number; color: string; icon: typeof Target; placeholder?: boolean }

const INITIAL: GNode[] = [
  { id: 'mission', title: 'Mission requirements', kind: 'Input', x: 40, y: 250, color: '#E7E5E4', icon: Target },
  { id: 'airframe', title: 'Airframe geometry', kind: 'Parametric CAD', x: 40, y: 20, color: '#5EEAD4', icon: Shapes },
  { id: 'motor', title: 'Motor', kind: 'ThrustCurve', x: 40, y: 450, color: '#FB923C', icon: Flame },
  { id: 'mass', title: 'Mass model', kind: 'Rollup', x: 330, y: 40, color: '#C4B5FD', icon: Weight },
  { id: 'aero', title: 'Aerodynamics', kind: 'Barrowman', x: 330, y: 250, color: '#7DD3FC', icon: Wind },
  { id: 'weather', title: 'Weather', kind: 'NOAA GFS', x: 330, y: 470, color: '#A5B4FC', icon: CloudSun },
  { id: 'flight', title: '6-DOF flight', kind: 'DP5(4) solver', x: 620, y: 230, color: '#F9A8D4', icon: Orbit },
  { id: 'mc', title: 'Monte Carlo', kind: '× 200 runs', x: 910, y: 70, color: '#FDE68A', icon: Dices },
  { id: 'recovery', title: 'Recovery', kind: 'Dual deploy', x: 910, y: 380, color: '#86EFAC', icon: Umbrella },
  { id: 'verify', title: 'Verification', kind: 'SA Cup 2027 rules', x: 1200, y: 220, color: '#F4F4F5', icon: ShieldCheck },
  { id: 'report', title: 'Flight readiness packet', kind: 'Export', x: 1490, y: 250, color: '#F4F4F5', icon: FileText }
];

const EDGES: [NodeId, NodeId][] = [
  ['mission', 'verify'], ['mission', 'mass'], ['airframe', 'mass'], ['airframe', 'aero'], ['motor', 'mass'], ['motor', 'flight'], ['mass', 'aero'], ['mass', 'flight'],
  ['aero', 'flight'], ['weather', 'flight'], ['weather', 'mc'], ['flight', 'mc'], ['flight', 'recovery'], ['mc', 'verify'], ['recovery', 'verify'], ['verify', 'report']
];

const NODE_W = 236;
const PORT_Y = 22;

const EXTRA_NODES = [
  { title: 'Fin flutter', kind: 'NACA TN-4197', icon: Waves, color: '#FCA5A5' },
  { title: 'Structural FEA', kind: 'Shell + beam', icon: Hammer, color: '#FDBA74' },
  { title: 'Telemetry import', kind: 'TeleMega · CSV', icon: Radio, color: '#93C5FD' },
  { title: 'Cost model', kind: 'BOM pricing', icon: DollarSign, color: '#BBF7D0' }
];

type Status = 'fresh' | 'stale' | 'running' | 'empty';

export default function Flow() {
  const [nodes, setNodes] = useState<GNode[]>(INITIAL);
  const [edges, setEdges] = useState(EDGES);
  const [sel, setSel] = useState<NodeId | null>(null);
  const [view, setView] = useState({ x: 40, y: 90, z: 0.78 });
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [auto, setAuto] = useState(false);
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const commit = useDesignStore((s) => s.commitSim);

  const downstream = useCallback((id: NodeId) => {
    const out = new Set<NodeId>([id]);
    let grew = true;
    while (grew) { grew = false; for (const [a, b] of edges) if (out.has(a) && !out.has(b)) { out.add(b); grew = true; } }
    return out;
  }, [edges]);

  const order = useMemo(() => {
    const ids = nodes.map((n) => n.id);
    const indeg = Object.fromEntries(ids.map((i) => [i, 0]));
    edges.forEach(([, b]) => indeg[b]++);
    const q = ids.filter((i) => !indeg[i]);
    const out: NodeId[] = [];
    while (q.length) { const n = q.shift()!; out.push(n); edges.filter(([a]) => a === n).forEach(([, b]) => { if (--indeg[b] === 0) q.push(b); }); }
    return out;
  }, [nodes, edges]);

  const markStale = useCallback((id: NodeId) => {
    setStatus((s) => { const n = { ...s }; downstream(id).forEach((d) => { n[d] = 'stale'; }); return n; });
  }, [downstream]);

  const running = Object.values(status).includes('running');
  const staleCount = Object.values(status).filter((s) => s === 'stale').length;

  const runAll = useCallback(async () => {
    if (running) return;
    const todo = order.filter((id) => status[id] === 'stale');
    if (!todo.length) { toast('Everything is up to date'); return; }
    for (const id of todo) {
      setStatus((s) => ({ ...s, [id]: 'running' }));
      await new Promise((r) => setTimeout(r, id === 'mc' ? 900 : id === 'flight' ? 650 : 320));
      setStatus((s) => ({ ...s, [id]: 'fresh' }));
    }
    commit();
    toast.success(`Pipeline complete · ${todo.length} nodes recomputed`);
  }, [order, status, running, commit]);

  useEffect(() => { if (auto && staleCount && !running) { const t = setTimeout(runAll, 500); return () => clearTimeout(t); } }, [auto, staleCount, running, runAll]);

  // pan & zoom
  const panRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const onBgDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    panRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    if (tool === 'select') setSel(null);
  };
  const onBgMove = (e: React.PointerEvent) => {
    if (!panRef.current) return;
    setView((v) => ({ ...v, x: panRef.current!.vx + e.clientX - panRef.current!.x, y: panRef.current!.vy + e.clientY - panRef.current!.y }));
  };
  const onWheel = (e: React.WheelEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      const z = Math.min(1.6, Math.max(0.35, view.z * (1 - e.deltaY * 0.0015)));
      setView({ z, x: mx - ((mx - view.x) / view.z) * z, y: my - ((my - view.y) / view.z) * z });
    }
  };
  const fit = () => {
    const r = wrap.current!.getBoundingClientRect();
    const minX = Math.min(...nodes.map((n) => n.x)), maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
    const minY = Math.min(...nodes.map((n) => n.y)), maxY = Math.max(...nodes.map((n) => n.y + 180));
    const z = Math.min(1, (r.width - 80) / (maxX - minX), (r.height - 160) / (maxY - minY));
    setView({ z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z + 20 });
  };
  useEffect(() => { fit(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dragNode = useRef<{ id: string; x: number; y: number; nx: number; ny: number } | null>(null);
  const startNodeDrag = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const n = nodes.find((x) => x.id === id)!;
    dragNode.current = { id, x: e.clientX, y: e.clientY, nx: n.x, ny: n.y };
    setSel(id);
  };
  const moveNode = (e: React.PointerEvent) => {
    const d = dragNode.current; if (!d) return;
    setNodes((ns) => ns.map((n) => (n.id === d.id ? { ...n, x: d.nx + (e.clientX - d.x) / view.z, y: d.ny + (e.clientY - d.y) / view.z } : n)));
  };

  const addNode = (x: (typeof EXTRA_NODES)[number]) => {
    const r = wrap.current!.getBoundingClientRect();
    const id = `${x.title}-${Date.now()}`;
    const cx = (r.width / 2 - view.x) / view.z - NODE_W / 2, cy = (r.height / 2 - view.y) / view.z - 60;
    setNodes((ns) => [...ns, { id, title: x.title, kind: x.kind, icon: x.icon, color: x.color, x: cx, y: cy, placeholder: true }]);
    setEdges((es) => [...es, x.title === 'Fin flutter' ? ['airframe', id] : x.title === 'Telemetry import' ? [id, 'verify'] : ['mass', id]]);
    setStatus((s) => ({ ...s, [id]: 'empty' }));
    setSel(id);
    toast(`${x.title} node added`, { description: 'Wired to its natural input. Drag the header to move it.' });
  };

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const selNode = sel ? byId[sel] : null;
  const related = hoverNode ? new Set([hoverNode, ...edges.filter(([a, b]) => a === hoverNode || b === hoverNode).flat()]) : null;

  return (
    <div className="relative h-full overflow-hidden font-schibsted text-[13px]" style={{ background: T.bg, color: T.fg }}>
      {/* canvas */}
      <div
        ref={wrap}
        className={cn('absolute inset-0', tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : '')}
        style={{ backgroundImage: `radial-gradient(${T.dot} 1.2px, transparent 1.2px)`, backgroundSize: `${22 * view.z}px ${22 * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px`, touchAction: 'none' }}
        onPointerDown={onBgDown}
        onPointerMove={(e) => { onBgMove(e); moveNode(e); }}
        onPointerUp={() => { panRef.current = null; dragNode.current = null; }}
        onWheel={onWheel}
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
          <svg className="pointer-events-none absolute top-0 left-0 overflow-visible" width={1} height={1}>
            <defs>
              {edges.map(([a, b]) => byId[a] && byId[b] && (
                <linearGradient key={`${a}-${b}`} id={`g-${a}-${b}`.replace(/\s/g, '')} gradientUnits="userSpaceOnUse" x1={byId[a].x + NODE_W} x2={byId[b].x} y1={0} y2={0}>
                  <stop offset="0" stopColor={byId[a].color} />
                  <stop offset="1" stopColor={byId[b].color} />
                </linearGradient>
              ))}
            </defs>
            {edges.map(([a, b]) => {
              const s = byId[a], t = byId[b]; if (!s || !t) return null;
              const x1 = s.x + NODE_W, y1 = s.y + PORT_Y, x2 = t.x, y2 = t.y + PORT_Y;
              const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
              const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
              const active = status[b] === 'running' || status[a] === 'running';
              const dimmed = related && !(related.has(a) && related.has(b));
              const stale = status[b] === 'stale';
              return (
                <g key={`${a}-${b}`} opacity={dimmed ? 0.15 : 1} style={{ transition: 'opacity .2s' }}>
                  <path d={d} fill="none" stroke={`url(#${`g-${a}-${b}`.replace(/\s/g, '')})`} strokeWidth={1.6} opacity={stale ? 0.35 : 0.55} strokeDasharray={stale ? '4 5' : undefined} />
                  {active && <path d={d} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="3 9" className="flow-dash" opacity={0.9} />}
                </g>
              );
            })}
          </svg>
          {nodes.map((n) => (
            <NodeCard
              key={n.id}
              n={n}
              status={status[n.id] ?? 'fresh'}
              selected={sel === n.id}
              dimmed={!!related && !related.has(n.id)}
              onHeaderDown={(e) => startNodeDrag(n.id, e)}
              onSelect={() => setSel(n.id)}
              onHover={(h) => setHoverNode(h ? n.id : null)}
            />
          ))}
        </div>
      </div>

      {/* top-left project */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border px-3 py-2 backdrop-blur-md" style={{ borderColor: T.line, background: 'rgba(22,23,27,.85)' }}>
          <FlowMark />
          <div className="leading-tight">
            <div className="text-[13px] font-semibold">Kestrel IV</div>
            <div className="font-martian text-[10px]" style={{ color: T.dim }}>pipeline · 11 nodes</div>
          </div>
        </div>
      </div>

      {/* toolbar */}
      <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border p-1 backdrop-blur-md" style={{ borderColor: T.line, background: 'rgba(22,23,27,.85)' }}>
        {([['select', MousePointer2], ['pan', Hand]] as const).map(([t, I]) => (
          <button key={t} aria-label={t} onClick={() => setTool(t)} className={cn('grid size-8 place-items-center rounded-lg', tool === t ? 'bg-white/10 text-white' : 'text-[#8B8E96] hover:text-white')}><I size={15} /></button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/10" />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-[#C9CBD0] outline-none hover:bg-white/5"><Plus size={14} /> <span className="hidden sm:inline">Add node</span></DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content sideOffset={8} className="z-50 w-64 rounded-xl border p-1.5 font-schibsted shadow-2xl" style={{ borderColor: T.line, background: '#18191D', color: T.fg }}>
              <DropdownMenu.Label className="px-2 py-1 text-[11px]" style={{ color: T.dim }}>Analysis nodes</DropdownMenu.Label>
              {EXTRA_NODES.map((x) => (
                <DropdownMenu.Item key={x.title} onSelect={() => addNode(x)} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] outline-none data-[highlighted]:bg-white/[0.06]">
                  <span className="grid size-7 place-items-center rounded-md" style={{ background: `${x.color}1F`, color: x.color }}><x.icon size={14} /></span>
                  <span><span className="block">{x.title}</span><span className="block font-martian text-[10px]" style={{ color: T.dim }}>{x.kind}</span></span>
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px" style={{ background: T.line }} />
              <DropdownMenu.Item disabled className="flex items-center gap-2.5 px-2 py-2 text-[13px] opacity-50"><Lock size={13} /> CFD (RANS) · Pro</DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <label className="flex items-center gap-2 px-2 text-[12px] text-[#8B8E96]">
          <Switch.Root checked={auto} onCheckedChange={setAuto} className="relative h-[18px] w-8 rounded-full transition-colors data-[state=checked]:bg-[#FB923C]" style={{ background: auto ? undefined : '#2A2C32' }} aria-label="Auto-run">
            <Switch.Thumb className="block size-3.5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-4" />
          </Switch.Root>
          <span className="hidden sm:inline">Auto-run</span>
        </label>
        <button onClick={runAll} disabled={running} className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold text-black disabled:opacity-80" style={{ background: staleCount ? '#FB923C' : '#ECEDEF' }}>
          {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
          {running ? 'Running' : staleCount ? `Run ${staleCount} stale` : 'Up to date'}
        </button>
      </div>

      {/* zoom + minimap */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-2">
        <MiniMap nodes={nodes} view={view} wrap={wrap} status={status} />
        <div className="flex items-center gap-0.5 self-start rounded-lg border p-0.5 backdrop-blur-md" style={{ borderColor: T.line, background: 'rgba(22,23,27,.85)' }}>
          <button aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, z: Math.max(0.35, v.z - 0.1) }))} className="grid size-7 place-items-center rounded-md text-[#8B8E96] hover:text-white"><Minus size={14} /></button>
          <span className="w-10 text-center font-martian text-[10px] text-[#8B8E96]">{Math.round(view.z * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, z: Math.min(1.6, v.z + 0.1) }))} className="grid size-7 place-items-center rounded-md text-[#8B8E96] hover:text-white"><Plus size={14} /></button>
          <button aria-label="Fit view" onClick={fit} className="grid size-7 place-items-center rounded-md text-[#8B8E96] hover:text-white"><Maximize2 size={13} /></button>
        </div>
      </div>

      {/* legend */}
      <div className="absolute right-3 bottom-3 hidden items-center gap-3 rounded-lg border px-3 py-1.5 font-martian text-[10px] backdrop-blur-md md:flex" style={{ borderColor: T.line, background: 'rgba(22,23,27,.85)', color: T.muted, right: selNode ? 372 : 12 }}>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#4ADE80]" /> fresh</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#FBBF24]" /> stale</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-white" /> running</span>
        <span>scroll to zoom · drag to pan</span>
      </div>

      <AnimatePresence>
        {selNode && (
          <motion.aside
            key="panel"
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className="thin-scroll absolute top-3 right-3 bottom-3 w-[min(348px,calc(100vw-24px))] overflow-y-auto rounded-2xl border shadow-2xl backdrop-blur-xl"
            style={{ borderColor: T.line, background: 'rgba(20,21,25,.94)' }}
          >
            <Panel n={selNode} status={status[selNode.id] ?? 'fresh'} onClose={() => setSel(null)} onChange={() => markStale(selNode.id)} onRunOne={() => runAll()} />
          </motion.aside>
        )}
      </AnimatePresence>
      <Toaster theme="dark" position="top-right" offset={70} toastOptions={{ style: { background: '#18191D', border: `1px solid ${T.line}`, color: T.fg, fontFamily: 'Schibsted Grotesk', borderRadius: 12 } }} />
    </div>
  );
}

function FlowMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle cx="4" cy="11" r="2.5" fill="#5EEAD4" />
      <circle cx="18" cy="5" r="2.5" fill="#FB923C" />
      <circle cx="18" cy="17" r="2.5" fill="#F9A8D4" />
      <path d="M6.5 11 C12 11 12 5 15.5 5 M6.5 11 C12 11 12 17 15.5 17" stroke="#ECEDEF" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

/* ───────────────────────── nodes ───────────────────────── */

function NodeCard({ n, status, selected, dimmed, onHeaderDown, onSelect, onHover }: { n: GNode; status: Status; selected: boolean; dimmed: boolean; onHeaderDown: (e: React.PointerEvent) => void; onSelect: () => void; onHover: (h: boolean) => void }) {
  const ring = selected ? n.color : status === 'stale' ? '#FBBF2466' : T.line;
  return (
    <motion.div
      data-node
      layout={false}
      initial={n.placeholder ? { scale: 0.85, opacity: 0 } : false}
      animate={{ scale: 1, opacity: dimmed ? 0.35 : 1 }}
      className="absolute rounded-[14px] border"
      style={{ left: n.x, top: n.y, width: NODE_W, background: selected ? T.cardHi : T.card, borderColor: ring, boxShadow: selected ? `0 0 0 3px ${n.color}22, 0 18px 40px -12px rgba(0,0,0,.7)` : '0 10px 30px -14px rgba(0,0,0,.8)' }}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      {/* ports */}
      <span className="absolute -left-[5px] size-2.5 rounded-full border-2" style={{ top: PORT_Y - 5, background: T.bg, borderColor: n.color }} />
      <span className="absolute -right-[5px] size-2.5 rounded-full" style={{ top: PORT_Y - 5, background: n.color }} />
      <div className="flex cursor-grab items-center gap-2 px-3 pt-2.5 pb-2 active:cursor-grabbing" onPointerDown={onHeaderDown}>
        <span className="grid size-6 place-items-center rounded-md" style={{ background: `${n.color}1A`, color: n.color }}><n.icon size={13} /></span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold">{n.title}</div>
          <div className="truncate font-martian text-[9.5px]" style={{ color: T.dim }}>{n.kind}</div>
        </div>
        <StatusDot s={status} />
      </div>
      <div className={cn('border-t px-3 py-2.5 transition-opacity', status === 'stale' && 'opacity-55', status === 'running' && 'opacity-40')} style={{ borderColor: T.line }}>
        <NodeBody id={n.id} placeholder={n.placeholder} color={n.color} />
      </div>
      {status === 'running' && <div className="absolute inset-x-3 bottom-0 h-[2px] overflow-hidden rounded-full"><motion.div className="h-full w-1/3 rounded-full" style={{ background: n.color }} animate={{ x: ['-100%', '300%'] }} transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut' }} /></div>}
    </motion.div>
  );
}

function StatusDot({ s }: { s: Status }) {
  if (s === 'running') return <Loader2 size={13} className="animate-spin text-white" />;
  const c = s === 'stale' ? '#FBBF24' : s === 'empty' ? '#5A5D65' : '#4ADE80';
  return <span className="relative flex size-2"><span className="absolute inset-0 rounded-full" style={{ background: c }} />{s === 'stale' && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: c }} />}</span>;
}

function KV({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return <div className="flex items-baseline justify-between gap-2 py-[2px]"><span className="text-[12.5px]" style={{ color: T.muted }}>{k}</span><span className="tnum font-martian text-[11.5px]" style={{ color: tone ?? T.fg }}>{v}</span></div>;
}

function NodeBody({ id, placeholder, color }: { id: NodeId; placeholder?: boolean; color: string }) {
  const { design: d, a, r, gates } = useEngineering();
  const mc = useMemo(() => (id === 'mc' ? monteCarlo(d, 80) : []), [id, d]);
  if (placeholder) return <div className="py-1 text-[12px]" style={{ color: T.muted }}>Not configured · select to set inputs</div>;
  switch (id) {
    case 'mission': return <><KV k="Target apogee" v={`${fmt(ft(d.targetApogee))} ft`} /><KV k="Payload" v={`${d.payload.toFixed(1)} kg`} /><KV k="Rule set" v="SA Cup '27" /></>;
    case 'airframe': return <><Silhouette d={d} color={color} /><KV k="Length × Ø" v={`${fmt(a.length * 1000)} × ${fmt(d.diameter * 1000)}`} /><KV k="Fins" v={`${d.finCount} × ${fmt(d.finSpan * 1000)} mm`} /></>;
    case 'motor': { const m = motorById(d.motorId); return <><div className="mb-1 flex items-baseline justify-between"><span className="font-martian text-[15px]">{m.name}</span><span className="text-[11px]" style={{ color: T.muted }}>{m.maker}</span></div><Sparkline values={Array.from({ length: 30 }, (_, i) => thrustAt(m, (i / 29) * m.burn))} color={color} height={30} /><KV k="Impulse" v={`${fmt(m.impulse)} N·s`} /></>; }
    case 'mass': return <><KV k="Liftoff" v={`${a.massLiftoff.toFixed(2)} kg`} /><KV k="Burnout" v={`${(a.massLiftoff - motorById(d.motorId).prop).toFixed(2)} kg`} /><KV k="CG" v={`${fmt(a.cg * 1000)} mm`} /></>;
    case 'aero': { const st = gates.find((g) => g.id === 'stab')!; return <><KV k="CP" v={`${fmt(a.cp * 1000)} mm`} /><KV k="Cd" v={a.cd.toFixed(3)} /><KV k="Stability" v={`${a.stability.toFixed(2)} cal`} tone={st.state === 'pass' ? '#4ADE80' : '#FBBF24'} /></>; }
    case 'weather': return <><KV k="Ground wind" v={`${d.wind.toFixed(1)} m/s`} /><KV k="Source" v="GFS 06z" /><KV k="Age" v="2 h" /></>;
    case 'flight': return <><Sparkline values={r.series.filter((p) => p.t <= r.tApogee).map((p) => p.h)} color={color} height={34} /><KV k="Apogee" v={`${fmt(ft(r.apogee))} ft`} /><KV k="Max Mach" v={r.machMax.toFixed(2)} tone={r.machMax > 0.8 ? '#FBBF24' : undefined} /></>;
    case 'mc': return <><MiniScatter pts={mc} color={color} /><KV k="Apogee σ" v={`± ${fmt(ft(std(mc.map((p) => p.apogee))))} ft`} /></>;
    case 'recovery': return <><KV k="Drogue" v={`${r.descentDrogue.toFixed(1)} m/s`} /><KV k="Main" v={`${r.descentMain.toFixed(1)} m/s`} /><KV k="Drift" v={`${fmt(r.drift)} m`} /></>;
    case 'verify': { const c = { pass: 0, warn: 0, fail: 0 }; gates.forEach((g) => c[g.state]++); return <><div className="flex gap-1">{gates.map((g) => <span key={g.id} title={g.label} className="h-6 flex-1 rounded" style={{ background: g.state === 'pass' ? '#4ADE8033' : g.state === 'warn' ? '#FBBF2440' : '#F8717144', borderBottom: `2px solid ${g.state === 'pass' ? '#4ADE80' : g.state === 'warn' ? '#FBBF24' : '#F87171'}` }} />)}</div><div className="mt-2 flex gap-3 font-martian text-[10.5px]"><span className="text-[#4ADE80]">{c.pass} pass</span><span className="text-[#FBBF24]">{c.warn} caution</span><span className="text-[#F87171]">{c.fail} fail</span></div></>; }
    case 'report': return <><KV k="Pages" v="14" /><KV k="Evidence" v="7 checks · 1 log" /><KV k="Format" v="PDF + CSV" /></>;
    default: return null;
  }
}

const std = (xs: number[]) => { if (!xs.length) return 0; const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };

function Silhouette({ d, color }: { d: Design; color: string }) {
  const L = d.noseLength + d.bodyLength; const k = 210 / L; const R = (d.diameter / 2) * k * 1.6; const cy = 16;
  const pts = Array.from({ length: 16 }, (_, i) => { const x = (i / 15) * d.noseLength; return [x * k, noseRadius(d.noseShape, x, d.noseLength, R / k) * k]; });
  const xt = L * k, xf = xt - d.finRoot * k;
  const path = `M${pts.map(([x, r]) => `${x},${cy - r}`).join(' L')} L${xt},${cy - R} L${xt},${cy + R} L${pts.slice().reverse().map(([x, r]) => `${x},${cy + r}`).join(' L')}Z`;
  const fin = (s: number) => `M${xf},${cy + s * R} L${xf + d.finSweep * k},${cy + s * (R + d.finSpan * k * 1.6)} L${xf + (d.finSweep + d.finTip) * k},${cy + s * (R + d.finSpan * k * 1.6)} L${xt},${cy + s * R}Z`;
  return <svg viewBox="0 0 224 32" className="mb-1.5 w-full" aria-hidden><path d={path} fill={`${color}22`} stroke={color} strokeWidth={1} /><path d={fin(-1)} fill={`${color}44`} stroke={color} strokeWidth={1} /><path d={fin(1)} fill={`${color}44`} stroke={color} strokeWidth={1} /></svg>;
}

function MiniScatter({ pts, color }: { pts: { x: number; y: number }[]; color: string }) {
  const ext = Math.max(1, ...pts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))));
  return <svg viewBox="0 0 224 56" className="mb-1 w-full" aria-hidden><line x1="0" x2="224" y1="28" y2="28" stroke={T.line} /><line x1="112" x2="112" y1="0" y2="56" stroke={T.line} />{pts.map((p, i) => <circle key={i} cx={112 + (p.x / ext) * 100} cy={28 - (p.y / ext) * 26} r={1.4} fill={color} opacity={0.8} />)}</svg>;
}

function MiniMap({ nodes, view, wrap, status }: { nodes: GNode[]; view: { x: number; y: number; z: number }; wrap: React.RefObject<HTMLDivElement | null>; status: Record<string, Status> }) {
  const W = 168, H = 92;
  const minX = Math.min(...nodes.map((n) => n.x)) - 40, maxX = Math.max(...nodes.map((n) => n.x + NODE_W)) + 40;
  const minY = Math.min(...nodes.map((n) => n.y)) - 40, maxY = Math.max(...nodes.map((n) => n.y + 150)) + 40;
  const s = Math.min(W / (maxX - minX), H / (maxY - minY));
  const r = wrap.current?.getBoundingClientRect();
  const vx = (-view.x / view.z - minX) * s, vy = (-view.y / view.z - minY) * s;
  const vw = r ? (r.width / view.z) * s : 0, vh = r ? (r.height / view.z) * s : 0;
  return (
    <svg width={W} height={H} className="hidden rounded-lg border sm:block" style={{ borderColor: T.line, background: 'rgba(22,23,27,.85)' }} aria-hidden>
      {nodes.map((n) => <rect key={n.id} x={(n.x - minX) * s} y={(n.y - minY) * s} width={NODE_W * s} height={110 * s} rx={2} fill={status[n.id] === 'stale' ? '#FBBF24' : n.color} opacity={0.55} />)}
      <rect x={vx} y={vy} width={vw} height={vh} fill="none" stroke="#ECEDEF" strokeOpacity={0.5} rx={2} />
    </svg>
  );
}

/* ───────────────────────── properties panel ───────────────────────── */

function Field({ label, value, min, max, step, unit, scale = 1, digits = 0, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; scale?: number; digits?: number; onChange: (v: number) => void }) {
  return (
    <div className="py-2">
      <div className="mb-2 flex items-baseline justify-between"><span className="text-[12.5px]" style={{ color: T.muted }}>{label}</span><span className="tnum font-martian text-[12px]">{(value * scale).toFixed(digits)} <span style={{ color: T.dim }}>{unit}</span></span></div>
      <Slider.Root className="rs-root" value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label}>
        <Slider.Track className="rs-track" style={{ background: '#26282E' }}><Slider.Range className="rs-range bg-white" /></Slider.Track>
        <Slider.Thumb className="rs-thumb border-[3px] bg-white shadow-lg outline-none focus-visible:ring-4 focus-visible:ring-white/20" style={{ borderColor: '#0D0E11' }} />
      </Slider.Root>
    </div>
  );
}

function Panel({ n, status, onClose, onChange, onRunOne }: { n: GNode; status: Status; onClose: () => void; onChange: () => void; onRunOne: () => void }) {
  const d = useDesignStore((s) => s.design);
  const setD = useDesignStore((s) => s.set);
  const { a, r, gates } = useEngineering();
  const set = (p: Partial<Design>) => { setD(p); onChange(); };
  const chip = (active: boolean) => cn('rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors', active ? 'border-white/30 bg-white/10 text-white' : 'border-white/[0.06] text-[#8B8E96] hover:text-white');
  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3.5 backdrop-blur-xl" style={{ borderColor: T.line, background: 'rgba(20,21,25,.9)' }}>
        <span className="grid size-9 place-items-center rounded-xl" style={{ background: `${n.color}1A`, color: n.color }}><n.icon size={17} /></span>
        <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-semibold">{n.title}</div><div className="font-martian text-[10px]" style={{ color: T.dim }}>{n.kind}</div></div>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-[#8B8E96] hover:bg-white/5 hover:text-white"><X size={16} /></button>
      </div>
      {status === 'stale' && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px]" style={{ borderColor: '#FBBF2433', background: '#FBBF240D', color: '#FCD34D' }}>
          <AlertTriangle size={13} /> Inputs changed upstream. <button onClick={onRunOne} className="ml-auto font-semibold underline-offset-2 hover:underline">Recompute</button>
        </div>
      )}
      <div className="flex-1 px-4 py-2">
        {n.placeholder && <div className="py-6 text-center text-[13px]" style={{ color: T.muted }}>This node is a preview of the plug-in analysis library. It would take inputs from its upstream nodes automatically.</div>}
        {n.id === 'mission' && <>
          <div className="flex flex-wrap gap-1.5 py-2">{[['NASA SL', 1372], ['10k COTS', 3048], ['30k SRAD', 9144]].map(([l, h]) => <button key={l} onClick={() => set({ targetApogee: h as number })} className={chip(d.targetApogee === h)}>{l}</button>)}</div>
          <Field label="Target apogee" value={d.targetApogee} min={300} max={10000} step={10} unit="ft" scale={3.28084} onChange={(v) => set({ targetApogee: v })} />
          <Field label="Payload" value={d.payload} min={0} max={8} step={0.05} unit="kg" digits={2} onChange={(v) => set({ payload: v })} />
        </>}
        {n.id === 'airframe' && <>
          <div className="grid grid-cols-2 gap-1.5 py-2">{(['ogive', 'vonkarman', 'conical', 'elliptical'] as NoseShape[]).map((s) => <button key={s} onClick={() => set({ noseShape: s })} className={chip(d.noseShape === s)}>{{ ogive: 'Ogive', vonkarman: 'Von Kármán', conical: 'Conical', elliptical: 'Elliptical' }[s]}</button>)}</div>
          <Field label="Nose length" value={d.noseLength} min={0.2} max={1.1} step={0.005} unit="mm" scale={1000} onChange={(v) => set({ noseLength: v })} />
          <Field label="Diameter" value={d.diameter} min={0.054} max={0.2} step={0.001} unit="mm" scale={1000} onChange={(v) => set({ diameter: v })} />
          <Field label="Body length" value={d.bodyLength} min={0.8} max={3} step={0.01} unit="mm" scale={1000} onChange={(v) => set({ bodyLength: v })} />
          <div className="mt-2 mb-1 text-[11px] font-semibold tracking-wide uppercase" style={{ color: T.dim }}>Fins</div>
          <div className="flex gap-1.5 py-1">{[3, 4, 5, 6].map((c) => <button key={c} onClick={() => set({ finCount: c })} className={chip(d.finCount === c)}>{c}</button>)}</div>
          <Field label="Semi-span" value={d.finSpan} min={0.04} max={0.25} step={0.001} unit="mm" scale={1000} onChange={(v) => set({ finSpan: v })} />
          <Field label="Root chord" value={d.finRoot} min={0.08} max={0.45} step={0.001} unit="mm" scale={1000} onChange={(v) => set({ finRoot: v })} />
          <Field label="Tip chord" value={d.finTip} min={0} max={0.3} step={0.001} unit="mm" scale={1000} onChange={(v) => set({ finTip: v })} />
          <Field label="Sweep" value={d.finSweep} min={0} max={0.35} step={0.001} unit="mm" scale={1000} onChange={(v) => set({ finSweep: v })} />
        </>}
        {n.id === 'motor' && <div className="flex flex-col gap-1.5 py-2">{MOTORS.map((m) => (
          <button key={m.id} onClick={() => set({ motorId: m.id })} className={cn('flex items-center gap-3 rounded-xl border p-2.5 text-left', d.motorId === m.id ? 'border-[#FB923C]/50 bg-[#FB923C]/[0.07]' : 'border-white/[0.06] hover:border-white/15')}>
            <span className="grid size-8 place-items-center rounded-lg font-martian text-[13px]" style={{ background: d.motorId === m.id ? '#FB923C' : '#26282E', color: d.motorId === m.id ? '#000' : T.muted }}>{m.cls}</span>
            <span className="flex-1"><span className="block font-martian text-[12px]">{m.name}</span><span className="block text-[11px]" style={{ color: T.dim }}>{m.maker} · {fmt(m.impulse)} N·s</span></span>
            {d.motorId === m.id && <Check size={14} className="text-[#FB923C]" />}
          </button>
        ))}</div>}
        {n.id === 'mass' && <>
          <div className="flex gap-1.5 py-2">{(['fiberglass', 'carbon', 'bluetube'] as const).map((m) => <button key={m} onClick={() => set({ material: m })} className={chip(d.material === m)}>{{ fiberglass: 'Fiberglass', carbon: 'Carbon', bluetube: 'Blue Tube' }[m]}</button>)}</div>
          <KV k="Liftoff mass" v={`${a.massLiftoff.toFixed(2)} kg`} /><KV k="CG (liftoff)" v={`${fmt(a.cg * 1000)} mm`} /><KV k="CG (burnout)" v={`${fmt(a.cgBurnout * 1000)} mm`} />
        </>}
        {n.id === 'aero' && <>
          <div className="flex flex-wrap gap-1.5 py-2"><button className={chip(true)}>Barrowman</button><button className={chip(false)} onClick={() => toast('Transonic tables need a licence key in this preview')}>Transonic tables</button><button className={chip(false)} disabled><Lock size={11} className="mr-1 inline" />CFD</button></div>
          <KV k="CNα nose" v="2.000" /><KV k="CNα fins" v={a.finCNa.toFixed(3)} /><KV k="CP" v={`${fmt(a.cp * 1000)} mm`} /><KV k="Static margin" v={`${a.stability.toFixed(2)} cal`} />
        </>}
        {n.id === 'weather' && <Field label="Ground wind" value={d.wind} min={0} max={12} step={0.1} unit="m/s" digits={1} onChange={(v) => set({ wind: v })} />}
        {n.id === 'flight' && <>
          <Field label="Rail length" value={d.railLength} min={1.5} max={8} step={0.1} unit="m" digits={1} onChange={(v) => set({ railLength: v })} />
          <Field label="Launch angle" value={d.launchAngle} min={0} max={15} step={0.5} unit="°" digits={1} onChange={(v) => set({ launchAngle: v })} />
          <div className="mt-2 rounded-xl border p-3" style={{ borderColor: T.line }}><Sparkline values={r.series.filter((p) => p.t <= r.tApogee).map((p) => p.h)} color={n.color} height={60} /></div>
          <div className="mt-2"><KV k="Apogee" v={`${fmt(ft(r.apogee))} ft`} /><KV k="Max velocity" v={`${fmt(r.vmax)} m/s`} /><KV k="Rail exit" v={`${r.railExit.toFixed(1)} m/s`} /><KV k="Max accel" v={`${(r.amax / 9.81).toFixed(1)} g`} /></div>
        </>}
        {n.id === 'mc' && <div className="py-2 text-[12.5px]" style={{ color: T.muted }}>Perturbs wind (±25 %), thrust (±3 %), and drag (±6 %). Increase runs for tighter confidence bounds.<div className="mt-3 flex gap-1.5">{[100, 200, 500, 1000].map((x) => <button key={x} className={chip(x === 200)} onClick={() => { onChange(); toast(`${x} runs queued`); }}>{x}</button>)}</div></div>}
        {n.id === 'recovery' && <>
          <Field label="Drogue Ø" value={d.drogueChute} min={0.2} max={1.5} step={0.02} unit="m" digits={2} onChange={(v) => set({ drogueChute: v })} />
          <Field label="Main Ø" value={d.mainChute} min={0.8} max={4} step={0.02} unit="m" digits={2} onChange={(v) => set({ mainChute: v })} />
          <Field label="Main deploy" value={d.mainDeploy} min={150} max={600} step={5} unit="ft" scale={3.28084} onChange={(v) => set({ mainDeploy: v })} />
        </>}
        {n.id === 'verify' && <div className="flex flex-col gap-1 py-2">{gates.map((g) => (
          <div key={g.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
            <span className="size-2 rounded-full" style={{ background: g.state === 'pass' ? '#4ADE80' : g.state === 'warn' ? '#FBBF24' : '#F87171' }} />
            <span className="flex-1 text-[12.5px]">{g.label}</span><span className="font-martian text-[11px]" style={{ color: T.muted }}>{g.value}</span>
          </div>
        ))}</div>}
        {n.id === 'report' && <button onClick={() => toast.success('Packet generated', { description: 'kestrel-iv-FRR-r14.pdf · 14 pages' })} className="mt-3 w-full rounded-xl bg-white py-2.5 text-[13px] font-semibold text-black">Generate packet</button>}
      </div>
      <div className="border-t px-4 py-3 font-martian text-[10px]" style={{ borderColor: T.line, color: T.dim }}>Changes mark this node and everything downstream as stale.</div>
    </div>
  );
}
