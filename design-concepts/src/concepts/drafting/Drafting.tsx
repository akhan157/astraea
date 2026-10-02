import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog } from 'radix-ui';
import { Toaster, toast } from 'sonner';
import { PenLine, Stamp, ZoomIn, ZoomOut, FileDown, Check, X, Minus } from 'lucide-react';
import { useDesignStore, useEngineering } from '../../shared/store';
import { MOTORS, massItems, motorById, thrustAt, type Design, type NoseShape } from '../../shared/model';
import { noseRadius } from '../../shared/Rocket3D';
import { LineChart, type ChartTheme } from '../../shared/charts';
import { cn, fmt, ft } from '../../shared/format';

/* Drafting vellum, navy ink, safety-orange redline. */
const P = {
  desk: '#DCE2E9',
  paper: '#F7F8F6',
  ink: '#1B2B4B',
  ink2: '#4A5A78',
  faint: '#8E9AAE',
  hair: '#C3CCD8',
  construct: '#7F9CC9',
  red: '#D9481C',
  green: '#2E7A4E',
  amber: '#B7791F'
};
const chartTheme: ChartTheme = { grid: '#DDE3EA', axis: P.ink2, text: P.ink2, font: 'IBM Plex Mono, monospace', crosshair: P.red, tooltipBg: P.ink, tooltipFg: P.paper };

type SheetId = '01' | '02' | '03' | '04' | '05' | '06' | '07';
const SHEETS: { id: SheetId; title: string; kind: string }[] = [
  { id: '01', title: 'Mission requirements', kind: 'REQ' },
  { id: '02', title: 'General arrangement', kind: 'GA' },
  { id: '03', title: 'Propulsion', kind: 'PROP' },
  { id: '04', title: 'Flight performance', kind: 'PERF' },
  { id: '05', title: 'Recovery', kind: 'REC' },
  { id: '06', title: 'Verification matrix', kind: 'VER' },
  { id: '07', title: 'Fabrication pack', kind: 'FAB' }
];

interface Revision { rev: string; desc: string; by: string; date: string }

export default function Drafting() {
  const [sheet, setSheet] = useState<SheetId>('02');
  const [markup, setMarkup] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [revs, setRevs] = useState<Revision[]>([
    { rev: 'A', desc: 'Initial release for PDR', by: 'AK', date: '2026-08-04' },
    { rev: 'B', desc: 'Fin planform swept 130 mm; L-class to M-class', by: 'MR', date: '2026-09-11' }
  ]);
  const { gates } = useEngineering();
  const fails = gates.filter((g) => g.state !== 'pass').length;

  return (
    <div className="flex h-full flex-col font-plex text-[13px]" style={{ background: P.desk, color: P.ink }}>
      <header className="flex h-12 shrink-0 items-center gap-4 border-b px-4" style={{ borderColor: P.hair, background: P.paper }}>
        <div className="flex items-baseline gap-2">
          <span className="font-barlow text-[20px] font-bold tracking-[0.18em]">ASTRAEA</span>
          <span className="hidden font-barlow text-[13px] font-medium tracking-[0.12em] sm:inline" style={{ color: P.faint }}>DRAWING SET</span>
        </div>
        <span className="hidden h-5 w-px md:block" style={{ background: P.hair }} />
        <span className="hidden font-plex-mono text-[12px] md:inline" style={{ color: P.ink2 }}>AST-KES-004 · Kestrel IV · Rev {String.fromCharCode(65 + revs.length - 1)}</span>
        <div className="flex-1" />
        <button onClick={() => setMarkup(!markup)} className="flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-barlow text-[13px] font-semibold tracking-[0.08em] uppercase" style={{ borderColor: markup ? P.red : P.hair, color: markup ? P.red : P.ink2, background: markup ? '#D9481C0F' : 'transparent' }}>
          <PenLine size={13} /> Redlines {fails > 0 && <span className="rounded-full px-1.5 text-[11px] text-white" style={{ background: P.red }}>{fails}</span>}
        </button>
        <div className="hidden items-center rounded-sm border sm:flex" style={{ borderColor: P.hair }}>
          <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))} className="p-1.5 hover:bg-black/5"><ZoomOut size={14} /></button>
          <span className="w-11 text-center font-plex-mono text-[11px]">{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))} className="p-1.5 hover:bg-black/5"><ZoomIn size={14} /></button>
        </div>
        <IssueRevision revs={revs} onIssue={(r) => setRevs([...revs, r])} />
      </header>

      <div className="flex min-h-0 flex-1">
        <SheetIndex sheet={sheet} setSheet={setSheet} />
        <main className="thin-scroll min-w-0 flex-1 overflow-auto p-4 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={sheet}
              initial={{ opacity: 0, y: 14, rotate: -0.25 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              className="mx-auto max-w-[1180px]"
            >
              <Sheet id={sheet} revs={revs} markup={markup} />
            </motion.div>
          </AnimatePresence>
        </main>
        <CalcNotes />
      </div>
      <Toaster position="bottom-right" toastOptions={{ style: { background: P.ink, color: P.paper, border: 'none', borderRadius: 2, fontFamily: 'IBM Plex Sans' } }} />
    </div>
  );
}

function SheetIndex({ sheet, setSheet }: { sheet: SheetId; setSheet: (s: SheetId) => void }) {
  const { gates } = useEngineering();
  const verState = gates.some((g) => g.state === 'fail') ? 'fail' : gates.some((g) => g.state === 'warn') ? 'warn' : 'pass';
  return (
    <nav className="thin-scroll hidden w-56 shrink-0 overflow-y-auto border-r py-4 md:block" style={{ borderColor: P.hair, background: '#EEF1F4' }} aria-label="Sheets">
      <div className="px-4 pb-2 font-barlow text-[12px] font-semibold tracking-[0.16em]" style={{ color: P.faint }}>SHEET INDEX</div>
      {SHEETS.map((s) => (
        <button key={s.id} onClick={() => setSheet(s.id)} className={cn('group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors', sheet === s.id ? 'bg-white' : 'hover:bg-white/50')} aria-current={sheet === s.id}>
          <span className="font-barlow text-[22px] leading-none font-bold" style={{ color: sheet === s.id ? P.ink : P.faint }}>{s.id}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] leading-tight font-medium">{s.title}</span>
            <span className="mt-0.5 block font-plex-mono text-[10.5px]" style={{ color: P.faint }}>AST-KES-{s.kind}-{s.id}</span>
          </span>
          {s.id === '06' && <span className="mt-1 size-2 rounded-full" style={{ background: verState === 'pass' ? P.green : verState === 'warn' ? P.amber : P.red }} />}
          {sheet === s.id && <motion.span layoutId="sheet-mark" className="mt-1 h-4 w-[3px]" style={{ background: P.red }} />}
        </button>
      ))}
      <div className="mx-4 mt-4 border-t pt-4 text-[11.5px] leading-relaxed" style={{ borderColor: P.hair, color: P.ink2 }}>
        Sheets regenerate from the model. Drag the <span style={{ color: P.red }}>orange handles</span> on sheet 02 to edit geometry. Click any dimension to type a value.
      </div>
    </nav>
  );
}

/* ───────────────────────── sheet frame ───────────────────────── */

function Sheet({ id, revs, markup }: { id: SheetId; revs: Revision[]; markup: boolean }) {
  const s = SHEETS.find((x) => x.id === id)!;
  return (
    <div className="relative shadow-[0_1px_0_rgba(27,43,75,.06),0_20px_50px_-20px_rgba(27,43,75,.35)]" style={{ background: P.paper }}>
      {/* zone frame */}
      <div className="relative m-3 border-[1.5px] sm:m-4" style={{ borderColor: P.ink }}>
        <ZoneMarks />
        <div className="relative px-4 pt-7 pb-4 sm:px-8">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2" style={{ borderColor: P.hair }}>
            <h1 className="font-barlow text-[26px] leading-none font-bold tracking-[0.06em] uppercase">{s.title}</h1>
            <span className="font-plex-mono text-[11px]" style={{ color: P.ink2 }}>SHEET {s.id} OF 07</span>
          </div>
          {id === '01' && <Requirements />}
          {id === '02' && <GeneralArrangement markup={markup} />}
          {id === '03' && <PropulsionSheet />}
          {id === '04' && <PerformanceSheet />}
          {id === '05' && <RecoverySheet />}
          {id === '06' && <VerificationSheet />}
          {id === '07' && <FabSheet />}
        </div>
        <TitleBlock sheet={s.id} title={s.title} revs={revs} />
      </div>
    </div>
  );
}

function ZoneMarks() {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-4 grid-cols-8 border-b sm:grid" style={{ borderColor: P.hair }}>
        {Array.from({ length: 8 }).map((_, i) => <span key={i} className="border-r text-center font-plex-mono text-[9px] leading-4 last:border-0" style={{ borderColor: P.hair, color: P.faint }}>{8 - i}</span>)}
      </div>
    </>
  );
}

function TitleBlock({ sheet, title, revs }: { sheet: SheetId; title: string; revs: Revision[] }) {
  const cur = revs[revs.length - 1];
  const cell = 'border-l border-t px-2 py-1';
  const lab = 'block font-barlow text-[10px] font-semibold tracking-[0.14em] uppercase';
  return (
    <div className="flex flex-col border-t sm:flex-row sm:justify-end" style={{ borderColor: P.ink }}>
      <table className="w-full border-collapse text-[11px] sm:w-auto sm:min-w-[320px]" style={{ borderColor: P.ink }}>
        <thead><tr><th colSpan={4} className="border-l px-2 py-1 text-left font-barlow text-[10px] tracking-[0.14em]" style={{ borderColor: P.ink }}>REVISIONS</th></tr></thead>
        <tbody>
          {revs.slice(-3).map((r) => (
            <tr key={r.rev} className="font-plex-mono">
              <td className={cell} style={{ borderColor: P.hair }}>{r.rev}</td>
              <td className={cn(cell, 'font-plex')} style={{ borderColor: P.hair }}>{r.desc}</td>
              <td className={cell} style={{ borderColor: P.hair }}>{r.by}</td>
              <td className={cell} style={{ borderColor: P.hair }}>{r.date.slice(5)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-4 text-[11.5px] sm:w-[440px]">
        <div className={cn(cell, 'col-span-4 sm:border-t-0')} style={{ borderColor: P.ink }}>
          <span className={lab} style={{ color: P.faint }}>Title</span>
          <span className="font-barlow text-[17px] font-bold tracking-[0.05em] uppercase">Kestrel IV · {title}</span>
        </div>
        {[['Drawn', 'A. Khan'], ['Checked', 'M. Reyes'], ['Scale', sheet === '02' ? 'NTS · 1:10 nom' : 'NTS'], ['Units', 'mm · kg · s']].map(([k, v]) => (
          <div key={k} className={cell} style={{ borderColor: P.ink }}><span className={lab} style={{ color: P.faint }}>{k}</span><span className="font-plex-mono">{v}</span></div>
        ))}
        <div className={cn(cell, 'col-span-2')} style={{ borderColor: P.ink }}><span className={lab} style={{ color: P.faint }}>Dwg no.</span><span className="font-plex-mono">AST-KES-004-{sheet}</span></div>
        <div className={cell} style={{ borderColor: P.ink }}><span className={lab} style={{ color: P.faint }}>Rev</span><span className="font-barlow text-[18px] font-bold">{cur.rev}</span></div>
        <div className={cell} style={{ borderColor: P.ink }}><span className={lab} style={{ color: P.faint }}>Sheet</span><span className="font-plex-mono">{sheet} / 07</span></div>
      </div>
    </div>
  );
}

/* ───────────────────────── sheet 02: GA drawing ───────────────────────── */

function useSvgPoint(ref: React.RefObject<SVGSVGElement | null>) {
  return (e: { clientX: number; clientY: number }) => {
    const svg = ref.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };
}

function GeneralArrangement({ markup }: { markup: boolean }) {
  const { design: d, a, r, gates } = useEngineering();
  const set = useDesignStore((s) => s.set);
  const ref = useRef<SVGSVGElement>(null);
  const toSvg = useSvgPoint(ref);
  const [drag, setDrag] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const W = 1000, H = 380;
  const L = a.length;
  const k = Math.min(310, 760 / L); // px per metre
  const x0 = 70, cy = 200;
  const R = d.diameter / 2;
  const X = (m: number) => x0 + m * k; // station from nose tip
  const Y = (m: number) => cy - m * k;
  const xt = X(L); // tail
  const xfLE = xt - d.finRoot * k;

  const outline = useMemo(() => {
    const n = 40; const top: string[] = []; const bot: string[] = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * d.noseLength; const r = noseRadius(d.noseShape, x, d.noseLength, R);
      top.push(`${X(x).toFixed(1)},${Y(r).toFixed(1)}`); bot.unshift(`${X(x).toFixed(1)},${Y(-r).toFixed(1)}`);
    }
    return `M${top.join(' L')} L${xt},${Y(R)} L${xt},${Y(-R)} L${bot.join(' L')}Z`;
  }, [d.noseShape, d.noseLength, R, k, L]); // eslint-disable-line react-hooks/exhaustive-deps

  const finTop = [[xfLE, Y(R)], [xfLE + d.finSweep * k, Y(R + d.finSpan)], [xfLE + (d.finSweep + d.finTip) * k, Y(R + d.finSpan)], [xt, Y(R)]];
  const projected = d.finCount === 4 ? 1 : d.finCount === 3 ? 0.5 : Math.cos(Math.PI / d.finCount);
  const finBot = finTop.map(([x, y]) => [x, cy + (cy - y - R * k) * projected + R * k]);

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toSvg(e);
    const m = (px: number) => (px - x0) / k;
    if (drag === 'nose') set({ noseLength: clamp(m(p.x), 0.2, 1.1) });
    if (drag === 'tail') set({ bodyLength: clamp(m(p.x) - d.noseLength, 0.8, 3) });
    if (drag === 'dia') set({ diameter: clamp(((cy - p.y) / k) * 2, 0.054, 0.2) });
    if (drag === 'finLE') {
      set({ finSpan: clamp((cy - p.y) / k - R, 0.04, 0.25), finSweep: clamp((p.x - xfLE) / k, 0, 0.35) });
    }
    if (drag === 'finTE') set({ finTip: clamp((p.x - xfLE) / k - d.finSweep, 0, 0.3) });
    if (drag === 'root') set({ finRoot: clamp((xt - p.x) / k, 0.08, 0.45) });
  };

  const stab = gates.find((g) => g.id === 'stab')!;
  const dimC = P.ink2;

  const Handle = ({ id, x, y }: { id: string; x: number; y: number }) => (
    <g onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); setDrag(id); }} style={{ cursor: 'grab' }} onPointerEnter={() => setHover(id)} onPointerLeave={() => setHover(null)}>
      <circle cx={x} cy={y} r={14} fill="transparent" />
      <motion.circle cx={x} cy={y} r={drag === id || hover === id ? 7 : 5} fill={P.paper} stroke={P.red} strokeWidth={2} />
    </g>
  );

  const items = massItems(d);
  const balloons: [number, string, number][] = [[1, 'Nose cone', d.noseLength * 0.55], [2, 'Payload bay', d.noseLength + 0.2], [3, 'Avionics bay', items[3].x], [4, 'Body tube', d.noseLength + d.bodyLength * 0.75], [5, 'Fin set', L - d.finRoot * 0.35]];

  return (
    <div>
      <div className="overflow-x-auto">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[680px] select-none" onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)} style={{ touchAction: 'none', fontFamily: 'IBM Plex Mono' }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1.5 L10,5 L0,8.5 Z" fill={dimC} /></marker>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke={P.construct} strokeWidth="0.8" /></pattern>
          </defs>
          {/* centreline */}
          <line x1={x0 - 30} x2={xt + 40} y1={cy} y2={cy} stroke={P.construct} strokeWidth={0.8} strokeDasharray="22 4 3 4" />
          {/* internal hidden lines */}
          <g stroke={P.faint} strokeWidth={0.8} strokeDasharray="5 3" fill="none">
            <rect x={xt - Math.min(d.bodyLength * 0.45, 0.25 + motorById(d.motorId).impulse / 9000) * k} y={Y(motorById(d.motorId).diameter / 2000 + 0.004)} width={Math.min(d.bodyLength * 0.45, 0.25 + motorById(d.motorId).impulse / 9000) * k} height={(motorById(d.motorId).diameter / 1000 + 0.008) * k} />
            <line x1={X(d.noseLength + 0.4)} x2={X(d.noseLength + 0.4)} y1={Y(R)} y2={Y(-R)} />
            <line x1={X(items[3].x - 0.12)} x2={X(items[3].x - 0.12)} y1={Y(R)} y2={Y(-R)} />
            <line x1={X(items[3].x + 0.12)} x2={X(items[3].x + 0.12)} y1={Y(R)} y2={Y(-R)} />
          </g>
          {/* body + fins */}
          <path d={outline} fill={hover === 'body' ? '#1B2B4B0A' : 'none'} stroke={P.ink} strokeWidth={1.6} onPointerEnter={() => setHover('body')} onPointerLeave={() => setHover(null)} />
          <rect x={X(items[3].x - 0.12)} y={Y(R)} width={0.24 * k} height={d.diameter * k} fill="url(#hatch)" opacity={0.5} />
          <line x1={X(d.noseLength)} x2={X(d.noseLength)} y1={Y(R)} y2={Y(-R)} stroke={P.ink} strokeWidth={1} />
          <polygon points={finTop.map((p) => p.join(',')).join(' ')} fill={P.paper} stroke={P.ink} strokeWidth={1.6} />
          <polygon points={finBot.map((p) => p.join(',')).join(' ')} fill={P.paper} stroke={P.ink} strokeWidth={1.2} />

          {/* dimensions */}
          <Dim x1={x0} x2={xt} y={Y(R + d.finSpan) - 38} label={`${fmt(L * 1000)}`} onEdit={(v) => set({ bodyLength: clamp(v / 1000 - d.noseLength, 0.8, 3) })} />
          <Dim x1={x0} x2={X(d.noseLength)} y={Y(R) - 22} label={`${fmt(d.noseLength * 1000)}`} onEdit={(v) => set({ noseLength: clamp(v / 1000, 0.2, 1.1) })} ext={Y(R)} />
          <VDim x={X(d.noseLength) + 26} y1={Y(R)} y2={Y(-R)} label={`Ø${fmt(d.diameter * 1000)}`} onEdit={(v) => set({ diameter: clamp(v / 1000, 0.054, 0.2) })} />
          <VDim x={xt + 28} y1={Y(R)} y2={Y(R + d.finSpan)} label={`${fmt(d.finSpan * 1000)}`} onEdit={(v) => set({ finSpan: clamp(v / 1000, 0.04, 0.25) })} />
          <Dim x1={xfLE} x2={xt} y={cy + (d.finSpan * projected + R) * k + 30} label={`${fmt(d.finRoot * 1000)}`} onEdit={(v) => set({ finRoot: clamp(v / 1000, 0.08, 0.45) })} />
          <Dim x1={xfLE + d.finSweep * k} x2={xfLE + (d.finSweep + d.finTip) * k} y={Y(R + d.finSpan) - 14} label={`${fmt(d.finTip * 1000)}`} small onEdit={(v) => set({ finTip: clamp(v / 1000, 0, 0.3) })} />

          {/* CG / CP stations */}
          <g>
            <line x1={X(a.cg)} x2={X(a.cg)} y1={cy - 6} y2={cy + 118} stroke={P.ink2} strokeWidth={0.7} strokeDasharray="2 3" />
            <line x1={X(a.cp)} x2={X(a.cp)} y1={cy - 6} y2={cy + 140} stroke={P.ink2} strokeWidth={0.7} strokeDasharray="2 3" />
            <CGSymbol x={X(a.cg)} y={cy} />
            <CPSymbol x={X(a.cp)} y={cy} />
            <Dim x1={x0} x2={X(a.cg)} y={cy + 118} label={`CG ${fmt(a.cg * 1000)}`} readOnly />
            <Dim x1={x0} x2={X(a.cp)} y={cy + 140} label={`CP ${fmt(a.cp * 1000)}`} readOnly />
            <line x1={x0} x2={x0} y1={cy} y2={cy + 146} stroke={P.ink2} strokeWidth={0.6} />
          </g>

          {/* balloons */}
          {balloons.map(([n, , x], i) => (
            <g key={n}>
              <line x1={X(x)} y1={Y(R * 0.4)} x2={X(x) - 18} y2={Y(R) - 58 - (i % 2) * 22} stroke={P.ink} strokeWidth={0.7} />
              <circle cx={X(x)} cy={Y(R * 0.4)} r={1.8} fill={P.ink} />
              <circle cx={X(x) - 18} cy={Y(R) - 58 - (i % 2) * 22 - 9} r={9} fill={P.paper} stroke={P.ink} strokeWidth={1} />
              <text x={X(x) - 18} y={Y(R) - 58 - (i % 2) * 22 - 5.5} textAnchor="middle" fontSize={10} fill={P.ink} fontFamily="Barlow Condensed" fontWeight={700}>{n}</text>
            </g>
          ))}

          {/* end view */}
          <EndView cx={W - 70} cy={cy} d={d} onClick={() => set({ finCount: d.finCount >= 4 ? 3 : d.finCount + 1 })} />

          {/* handles */}
          <Handle id="nose" x={X(d.noseLength)} y={Y(-R)} />
          <Handle id="tail" x={xt} y={cy} />
          <Handle id="root" x={xfLE} y={Y(R)} />
          <Handle id="finLE" x={xfLE + d.finSweep * k} y={Y(R + d.finSpan)} />
          <Handle id="finTE" x={xfLE + (d.finSweep + d.finTip) * k} y={Y(R + d.finSpan)} />

          {/* redline */}
          <AnimatePresence>
            {markup && stab.state !== 'pass' && (
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Cloud x={Math.min(X(a.cg), X(a.cp)) - 30} y={cy - 34} w={Math.abs(X(a.cp) - X(a.cg)) + 60} h={68} />
                <text x={Math.min(X(a.cg), X(a.cp)) - 26} y={cy + 56} fontSize={13} fill={P.red} fontFamily="Barlow Condensed" fontWeight={600} letterSpacing={0.5}>
                  △ STABILITY {a.stability.toFixed(2)} CAL — {a.stability > 3 ? 'OVERSTABLE, REDUCE FIN SPAN' : 'BELOW 1.5 CAL MIN, ENLARGE FINS'}
                </text>
              </motion.g>
            )}
            {markup && gates.find((g) => g.id === 'apogee')!.state !== 'pass' && (
              <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <text x={x0} y={H - 8} fontSize={13} fill={P.red} fontFamily="Barlow Condensed" fontWeight={600} letterSpacing={0.5}>
                  △ APOGEE {fmt(ft(r.apogee))} FT VS {fmt(ft(d.targetApogee))} FT TARGET — SEE SHEET 04
                </text>
              </motion.g>
            )}
          </AnimatePresence>
        </svg>
      </div>

      <div className="mt-4 grid gap-6 2xl:grid-cols-[1fr_300px]">
        <PartsList />
        <div>
          <div className="mb-1 font-barlow text-[12px] font-semibold tracking-[0.14em]" style={{ color: P.faint }}>NOSE PROFILE</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(['ogive', 'vonkarman', 'conical', 'elliptical'] as NoseShape[]).map((s) => (
              <button key={s} onClick={() => set({ noseShape: s })} className="flex items-center gap-2 border px-2 py-1.5 text-left text-[12px]" style={{ borderColor: d.noseShape === s ? P.ink : P.hair, background: d.noseShape === s ? '#1B2B4B08' : 'transparent' }}>
                <NoseIcon shape={s} active={d.noseShape === s} />
                {{ ogive: 'Tangent ogive', vonkarman: 'Von Kármán', conical: 'Conical', elliptical: 'Elliptical' }[s]}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: P.ink2 }}>Click the end view to change fin count. Notes in <span style={{ color: P.red }}>orange</span> are automatic redlines from the verification matrix.</p>
        </div>
      </div>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function Dim({ x1, x2, y, label, onEdit, ext, small, readOnly }: { x1: number; x2: number; y: number; label: string; onEdit?: (v: number) => void; ext?: number; small?: boolean; readOnly?: boolean }) {
  const [edit, setEdit] = useState(false);
  const mid = (x1 + x2) / 2;
  const w = Math.max(44, label.length * 7.4 + 10);
  return (
    <g>
      {ext !== undefined && <><line x1={x1} x2={x1} y1={ext - 4} y2={y - 4} stroke={P.ink2} strokeWidth={0.6} /><line x1={x2} x2={x2} y1={ext - 4} y2={y - 4} stroke={P.ink2} strokeWidth={0.6} /></>}
      <line x1={x1} x2={x2} y1={y} y2={y} stroke={P.ink2} strokeWidth={0.8} markerStart="url(#arr)" markerEnd="url(#arr)" />
      {edit ? (
        <foreignObject x={mid - 40} y={y - 22} width={80} height={22}>
          <input autoFocus defaultValue={label.replace(/[^0-9.]/g, '')} aria-label="Dimension value" onBlur={(e) => { const v = parseFloat(e.target.value.replace(/,/g, '')); if (!isNaN(v)) onEdit?.(v); setEdit(false); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEdit(false); }} style={{ width: 80, height: 20, font: '12px IBM Plex Mono', border: `1px solid ${P.red}`, background: '#fff', color: P.ink, textAlign: 'center', outline: 'none' }} />
        </foreignObject>
      ) : (
        <g onClick={() => !readOnly && setEdit(true)} style={{ cursor: readOnly ? 'default' : 'text' }}>
          <rect x={mid - w / 2} y={y - 15} width={w} height={14} fill={P.paper} />
          <text x={mid} y={y - 4} textAnchor="middle" fontSize={small ? 11.5 : 13} fill={P.ink} className={readOnly ? '' : 'hover:underline'} style={{ textDecorationColor: P.red }}>{label}</text>
        </g>
      )}
    </g>
  );
}

function VDim({ x, y1, y2, label, onEdit }: { x: number; y1: number; y2: number; label: string; onEdit: (v: number) => void }) {
  const [edit, setEdit] = useState(false);
  const mid = (y1 + y2) / 2;
  return (
    <g>
      <line x1={x} x2={x} y1={y1} y2={y2} stroke={P.ink2} strokeWidth={0.8} markerStart="url(#arr)" markerEnd="url(#arr)" />
      {edit ? (
        <foreignObject x={x + 4} y={mid - 11} width={70} height={22}>
          <input autoFocus defaultValue={label.replace(/[^0-9.]/g, '')} aria-label="Dimension value" onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onEdit(v); setEdit(false); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={{ width: 66, height: 20, font: '12px IBM Plex Mono', border: `1px solid ${P.red}`, background: '#fff', color: P.ink, textAlign: 'center', outline: 'none' }} />
        </foreignObject>
      ) : (
        <text x={x + 6} y={mid + 4} fontSize={12} fill={P.ink} onClick={() => setEdit(true)} style={{ cursor: 'text' }}>{label}</text>
      )}
    </g>
  );
}

function CGSymbol({ x, y }: { x: number; y: number }) {
  const r = 9;
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={P.paper} stroke={P.ink} strokeWidth={1.2} />
      <path d={`M${x},${y} L${x + r},${y} A${r},${r} 0 0,0 ${x},${y - r} Z`} fill={P.ink} />
      <path d={`M${x},${y} L${x - r},${y} A${r},${r} 0 0,0 ${x},${y + r} Z`} fill={P.ink} />
    </g>
  );
}

function CPSymbol({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={P.paper} stroke={P.red} strokeWidth={1.4} />
      <circle cx={x} cy={y} r={2.4} fill={P.red} />
    </g>
  );
}

function Cloud({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const bump = 12;
  const arcs: string[] = [`M${x},${y}`];
  for (let i = bump; i <= w; i += bump) arcs.push(`A${bump / 2},${bump / 2} 0 0,1 ${x + i},${y}`);
  for (let i = bump; i <= h; i += bump) arcs.push(`A${bump / 2},${bump / 2} 0 0,1 ${x + w},${y + i}`);
  for (let i = w - bump; i >= 0; i -= bump) arcs.push(`A${bump / 2},${bump / 2} 0 0,1 ${x + i},${y + h}`);
  for (let i = h - bump; i >= 0; i -= bump) arcs.push(`A${bump / 2},${bump / 2} 0 0,1 ${x},${y + i}`);
  return <motion.path d={arcs.join(' ')} fill="none" stroke={P.red} strokeWidth={1.4} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeInOut' }} />;
}

function EndView({ cx, cy, d, onClick }: { cx: number; cy: number; d: Design; onClick: () => void }) {
  const r = 26, span = 26 * (d.finSpan / (d.diameter / 2)) * 0.5;
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <text x={cx} y={cy - r - span - 14} textAnchor="middle" fontSize={10} fill={P.faint} fontFamily="Barlow Condensed" letterSpacing={1.2}>VIEW A–A</text>
      <circle cx={cx} cy={cy} r={r} fill={P.paper} stroke={P.ink} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={r * 0.55} fill="none" stroke={P.faint} strokeDasharray="4 3" />
      {Array.from({ length: d.finCount }).map((_, i) => {
        const t = (i / d.finCount) * Math.PI * 2 - Math.PI / 2;
        return <line key={i} x1={cx + Math.cos(t) * r} y1={cy + Math.sin(t) * r} x2={cx + Math.cos(t) * (r + span)} y2={cy + Math.sin(t) * (r + span)} stroke={P.ink} strokeWidth={2.4} />;
      })}
      <text x={cx} y={cy + r + span + 18} textAnchor="middle" fontSize={10.5} fill={P.ink2}>{d.finCount} FINS @ {Math.round(360 / d.finCount)}°</text>
    </g>
  );
}

function NoseIcon({ shape, active }: { shape: NoseShape; active: boolean }) {
  const pts = Array.from({ length: 16 }, (_, i) => { const x = (i / 15) * 30; return [x, noseRadius(shape, x, 30, 8)]; });
  const dpath = `M${pts.map(([x, r]) => `${x},${10 - r}`).join(' L')} L${pts.slice().reverse().map(([x, r]) => `${x},${10 + r}`).join(' L')}Z`;
  return <svg width="32" height="20" aria-hidden><path d={dpath} fill="none" stroke={active ? P.ink : P.faint} strokeWidth={1.2} /></svg>;
}

function PartsList() {
  const d = useDesignStore((s) => s.design);
  const items = massItems(d);
  const rows: [number, string, string, string, number][] = [
    [1, 'Nose cone', `${d.material === 'carbon' ? 'CF' : 'G12 FG'} · ${d.noseShape}`, '1', items[0].mass],
    [2, 'Payload bay', 'Al 6061 bulkheads', '1', items[1].mass],
    [3, 'Avionics bay', 'Sled + 2× altimeter', '1', items[3].mass],
    [4, 'Body tube', d.material === 'bluetube' ? 'Blue Tube 2.0' : d.material === 'carbon' ? 'CF roll-wrap' : 'G12 filament wound', '1', items[5].mass],
    [5, 'Fin set', `G10 ${(d.finThickness * 1000).toFixed(1)} mm`, String(d.finCount), items[6].mass]
  ];
  const th = 'border-b px-2 py-1 text-left font-barlow text-[11px] font-semibold tracking-[0.14em]';
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border text-[12px]" style={{ borderColor: P.ink }}>
        <thead><tr style={{ borderColor: P.ink }}>{['ITEM', 'DESCRIPTION', 'MATERIAL / SPEC', 'QTY', 'MASS'].map((h) => <th key={h} className={th} style={{ borderColor: P.ink }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(([n, desc, mat, q, m]) => (
            <tr key={n} className="border-b" style={{ borderColor: P.hair }}>
              <td className="px-2 py-1 font-barlow text-[14px] font-bold">{n}</td>
              <td className="px-2 py-1">{desc}</td>
              <td className="px-2 py-1" style={{ color: P.ink2 }}>{mat}</td>
              <td className="px-2 py-1 font-plex-mono">{q}</td>
              <td className="tnum px-2 py-1 font-plex-mono">{fmt(m * 1000)} g</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────────── calc notes ───────────────────────── */

function CalcNotes() {
  const { design: d, a, r } = useEngineering();
  const line = (lhs: ReactNode, rhs: ReactNode, note?: string) => (
    <div className="grid grid-cols-[1fr_auto] gap-x-2 py-[3px]">
      <span className="font-plex-mono text-[11.5px]" style={{ color: P.ink2 }}>{lhs}</span>
      <span className="tnum text-right font-plex-mono text-[12px] font-medium">{rhs}</span>
      {note && <span className="col-span-2 text-[10.5px] italic" style={{ color: P.faint }}>{note}</span>}
    </div>
  );
  return (
    <aside className="thin-scroll hidden w-80 shrink-0 overflow-y-auto border-l px-5 py-4 xl:block" style={{ borderColor: P.hair, background: P.paper, backgroundImage: `linear-gradient(${P.hair}55 1px, transparent 1px)`, backgroundSize: '100% 22px' }}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-barlow text-[16px] font-bold tracking-[0.1em]">CALCULATION NOTES</span>
        <span className="font-plex-mono text-[10px]" style={{ color: P.faint }}>CN-004</span>
      </div>
      <div className="mb-1 font-barlow text-[12px] font-semibold tracking-[0.14em]" style={{ color: P.red }}>1 · CENTRE OF PRESSURE (BARROWMAN)</div>
      {line(<>CN<sub>α,n</sub></>, '2.000', `${d.noseShape} nose, any fineness`)}
      {line(<>X<sub>n</sub> = {d.noseShape === 'conical' ? '0.666' : d.noseShape === 'elliptical' ? '0.333' : d.noseShape === 'vonkarman' ? '0.500' : '0.466'}·L<sub>n</sub></>, `${fmt(({ ogive: 0.466, vonkarman: 0.5, conical: 0.666, elliptical: 0.333 }[d.noseShape]) * d.noseLength * 1000)} mm`)}
      {line(<>K<sub>fb</sub> = 1 + r/(s+r)</>, (1 + d.diameter / 2 / (d.finSpan + d.diameter / 2)).toFixed(3))}
      {line(<>CN<sub>α,f</sub></>, a.finCNa.toFixed(3), `N=${d.finCount}, s/d=${(d.finSpan / d.diameter).toFixed(2)}`)}
      {line(<>X<sub>cp</sub> = ΣCN·X / ΣCN</>, `${fmt(a.cp * 1000)} mm`)}
      <div className="mt-3 mb-1 font-barlow text-[12px] font-semibold tracking-[0.14em]" style={{ color: P.red }}>2 · MASS & CENTRE OF GRAVITY</div>
      {line('Σm (liftoff)', `${a.massLiftoff.toFixed(3)} kg`)}
      {line('Σm (burnout)', `${(a.massLiftoff - motorById(d.motorId).prop).toFixed(3)} kg`)}
      {line(<>X<sub>cg</sub> = Σm·x / Σm</>, `${fmt(a.cg * 1000)} mm`)}
      <div className="mt-3 mb-1 font-barlow text-[12px] font-semibold tracking-[0.14em]" style={{ color: P.red }}>3 · STATIC MARGIN</div>
      {line(<>SM = (X<sub>cp</sub> − X<sub>cg</sub>) / d</>, <span style={{ color: a.stability >= 1.5 && a.stability <= 3 ? P.green : P.red }}>{a.stability.toFixed(2)} cal</span>, 'Required 1.5 – 3.0 cal at rail exit')}
      {line('SM at burnout', `${a.stabilityBurnout.toFixed(2)} cal`)}
      <div className="mt-3 mb-1 font-barlow text-[12px] font-semibold tracking-[0.14em]" style={{ color: P.red }}>4 · PERFORMANCE</div>
      {line('Apogee', `${fmt(ft(r.apogee))} ft`)}
      {line('V max / Mach', `${fmt(r.vmax)} m/s · ${r.machMax.toFixed(2)}`)}
      {line('Rail exit', `${r.railExit.toFixed(1)} m/s`)}
      <div className="mt-6 flex items-end justify-between border-t pt-2" style={{ borderColor: P.ink }}>
        <div><div className="font-barlow text-[10px] tracking-[0.14em]" style={{ color: P.faint }}>PREPARED</div><div className="font-plex-mono text-[11px]">AK · 2026-10-02</div></div>
        <div className="text-right"><div className="font-barlow text-[10px] tracking-[0.14em]" style={{ color: P.faint }}>CHECKED</div><div className="font-plex-mono text-[11px]">— pending —</div></div>
      </div>
    </aside>
  );
}

/* ───────────────────────── other sheets ───────────────────────── */

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 font-barlow text-[12px] font-semibold tracking-[0.14em] uppercase" style={{ color: P.faint }}>{children}</div>;
}

function StampMark({ state }: { state: 'pass' | 'warn' | 'fail' }) {
  const c = state === 'pass' ? P.green : state === 'warn' ? P.amber : P.red;
  return (
    <motion.span initial={{ scale: 1.6, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} className="inline-block border-2 px-1.5 font-barlow text-[13px] leading-5 font-bold tracking-[0.12em]" style={{ borderColor: c, color: c }}>
      {state === 'pass' ? 'PASS' : state === 'warn' ? 'REVIEW' : 'FAIL'}
    </motion.span>
  );
}

function Requirements() {
  const { design: d, gates } = useEngineering();
  const set = useDesignStore((s) => s.set);
  const g = Object.fromEntries(gates.map((x) => [x.id, x]));
  const reqs: [string, string, string, string][] = [
    ['REQ-001', `The vehicle shall reach an apogee of ${fmt(ft(d.targetApogee))} ft AGL ± 5 %.`, 'Analysis + Test', 'apogee'],
    ['REQ-002', 'The vehicle shall carry a payload of not less than 4.0 kg (8.8 lb).', 'Inspection', 'payload'],
    ['REQ-003', 'Static margin shall be between 1.5 and 3.0 calibers at rail exit.', 'Analysis', 'stab'],
    ['REQ-004', 'Rail exit velocity shall be at least 30 m/s (100 ft/s).', 'Analysis', 'rail'],
    ['REQ-005', 'Thrust-to-weight ratio shall be at least 5 : 1.', 'Analysis', 'twr'],
    ['REQ-006', 'Main parachute descent rate shall not exceed 7.6 m/s (25 ft/s).', 'Analysis + Test', 'main']
  ];
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-6">
        <div>
          <Label>Competition</Label>
          <div className="text-[15px] font-medium">Spaceport America Cup 2027 · 10k ft COTS</div>
        </div>
        <div>
          <Label>Target apogee</Label>
          <div className="flex items-center gap-1">
            {[1372, 3048, 9144].map((h) => <button key={h} onClick={() => set({ targetApogee: h })} className="border px-2 py-1 font-plex-mono text-[12px]" style={{ borderColor: d.targetApogee === h ? P.ink : P.hair, background: d.targetApogee === h ? P.ink : 'transparent', color: d.targetApogee === h ? P.paper : P.ink }}>{fmt(ft(h))} ft</button>)}
          </div>
        </div>
      </div>
      <table className="w-full border-collapse border text-[12.5px]" style={{ borderColor: P.ink }}>
        <thead><tr>{['ID', 'REQUIREMENT', 'VERIFICATION', 'STATUS'].map((h) => <th key={h} className="border-b px-3 py-1.5 text-left font-barlow text-[11px] tracking-[0.14em]" style={{ borderColor: P.ink }}>{h}</th>)}</tr></thead>
        <tbody>
          {reqs.map(([id, txt, ver, gid]) => (
            <tr key={id} className="border-b" style={{ borderColor: P.hair }}>
              <td className="px-3 py-2.5 font-plex-mono text-[11.5px]">{id}</td>
              <td className="px-3 py-2.5">{txt}</td>
              <td className="px-3 py-2.5" style={{ color: P.ink2 }}>{ver}</td>
              <td className="px-3 py-2.5">{gid === 'payload' ? <StampMark state={d.payload >= 4 ? 'pass' : 'fail'} /> : <StampMark state={g[gid].state} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PropulsionSheet() {
  const { design: d, a } = useEngineering();
  const set = useDesignStore((s) => s.set);
  const m = motorById(d.motorId);
  const data = useMemo(() => Array.from({ length: 100 }, (_, i) => { const t = (i / 99) * (m.burn + 0.2); return { t, F: thrustAt(m, t) }; }), [m]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <Label>Thrust–time · {m.maker} {m.name}</Label>
        <div className="border p-2" style={{ borderColor: P.hair }}>
          <LineChart data={data} x={(p) => +p.t.toFixed(2)} series={[{ key: 'F', label: 'Thrust', color: P.ink, value: (p) => p.F, unit: ' N' }]} theme={chartTheme} height={260} xLabel="TIME, s" yLabel="THRUST, N" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {[['Total impulse', `${fmt(m.impulse)} N·s`], ['Avg thrust', `${fmt(m.avg)} N`], ['Burn', `${m.burn} s`], ['T/W', `${a.twr.toFixed(1)}:1`]].map(([k, v]) => <div key={k}><div className="text-[11px]" style={{ color: P.faint }}>{k}</div><div className="font-plex-mono text-[14px]">{v}</div></div>)}
        </div>
      </div>
      <div>
        <Label>Motor schedule</Label>
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {MOTORS.map((x) => (
              <tr key={x.id} onClick={() => { set({ motorId: x.id }); toast(`Motor ${x.name} selected — sheets regenerated`); }} className="cursor-pointer border-b hover:bg-black/[0.03]" style={{ borderColor: P.hair, background: d.motorId === x.id ? '#1B2B4B0C' : undefined }}>
                <td className="w-5 py-1.5">{d.motorId === x.id ? <Check size={13} style={{ color: P.red }} /> : null}</td>
                <td className="py-1.5 font-plex-mono">{x.name}</td>
                <td className="py-1.5" style={{ color: P.ink2 }}>{x.maker}</td>
                <td className="py-1.5 text-right font-plex-mono">{fmt(x.impulse)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerformanceSheet() {
  const { design: d, r } = useEngineering();
  return (
    <div>
      <Label>Altitude & velocity vs time</Label>
      <div className="border p-2" style={{ borderColor: P.hair }}>
        <LineChart data={r.series.filter((p) => p.t < r.tApogee + 40)} x={(p) => p.t} series={[{ key: 'h', label: 'Altitude', color: P.ink, value: (p) => p.h, unit: ' m' }]} theme={chartTheme} height={240} xLabel="TIME, s" yLabel="ALTITUDE, m" markers={[{ x: r.tApogee, label: 'APOGEE', color: P.red }, { x: r.tBurnout, label: 'BURNOUT', color: P.ink2 }]} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
        {[['Apogee', `${fmt(ft(r.apogee))} ft`], ['Target', `${fmt(ft(d.targetApogee))} ft`], ['Max velocity', `${fmt(r.vmax)} m/s`], ['Max Mach', r.machMax.toFixed(2)], ['Max accel', `${(r.amax / 9.81).toFixed(1)} g`], ['Max Q', `${fmt(r.qmax / 1000)} kPa`], ['Time to apogee', `${r.tApogee.toFixed(1)} s`], ['Landing', `T+${r.tLanding.toFixed(0)} s`]].map(([k, v]) => (
          <div key={k} className="border-t pt-1.5" style={{ borderColor: P.ink }}><div className="font-barlow text-[11px] tracking-[0.12em] uppercase" style={{ color: P.faint }}>{k}</div><div className="font-plex-mono text-[17px]">{v}</div></div>
        ))}
      </div>
    </div>
  );
}

function RecoverySheet() {
  const { design: d, r } = useEngineering();
  const set = useDesignStore((s) => s.set);
  const row = (label: string, value: number, min: number, max: number, step: number, unit: string, key: keyof Design) => (
    <div className="grid grid-cols-[140px_1fr_80px] items-center gap-3 py-1.5">
      <span>{label}</span>
      <input type="range" id={`rec-${key}`} min={min} max={max} step={step} value={value} onChange={(e) => set({ [key]: +e.target.value } as Partial<Design>)} style={{ accentColor: P.red }} />
      <span className="text-right font-plex-mono">{value.toFixed(2)} {unit}</span>
    </div>
  );
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <Label>Parachute schedule</Label>
        {row('Drogue Ø', d.drogueChute, 0.2, 1.5, 0.02, 'm', 'drogueChute')}
        {row('Main Ø', d.mainChute, 0.8, 4, 0.02, 'm', 'mainChute')}
        <div className="grid grid-cols-[140px_1fr_80px] items-center gap-3 py-1.5"><span>Main deploy</span><input type="range" id="rec-deploy" min={150} max={600} step={5} value={d.mainDeploy} onChange={(e) => set({ mainDeploy: +e.target.value })} style={{ accentColor: P.red }} /><span className="text-right font-plex-mono">{fmt(ft(d.mainDeploy))} ft</span></div>
      </div>
      <div>
        <Label>Descent</Label>
        {[['Under drogue', `${r.descentDrogue.toFixed(1)} m/s`], ['Under main', `${r.descentMain.toFixed(1)} m/s`], ['Descent time', `${(r.tLanding - r.tApogee).toFixed(0)} s`], ['Drift', `${fmt(r.drift)} m`]].map(([k, v]) => <div key={k} className="flex justify-between border-b py-1.5" style={{ borderColor: P.hair }}><span>{k}</span><span className="font-plex-mono">{v}</span></div>)}
      </div>
    </div>
  );
}

function VerificationSheet() {
  const { gates } = useEngineering();
  return (
    <table className="w-full border-collapse border text-[12.5px]" style={{ borderColor: P.ink }}>
      <thead><tr>{['CHECK', 'PREDICTED', 'CRITERION', 'METHOD', 'RESULT'].map((h) => <th key={h} className="border-b px-3 py-1.5 text-left font-barlow text-[11px] tracking-[0.14em]" style={{ borderColor: P.ink }}>{h}</th>)}</tr></thead>
      <tbody>
        {gates.map((g) => (
          <tr key={g.id} className="border-b" style={{ borderColor: P.hair }}>
            <td className="px-3 py-2.5">{g.label}</td>
            <td className="px-3 py-2.5 font-plex-mono">{g.value}</td>
            <td className="px-3 py-2.5 font-plex-mono" style={{ color: P.ink2 }}>{g.rule}</td>
            <td className="px-3 py-2.5" style={{ color: P.ink2 }}>{g.id === 'main' || g.id === 'drift' ? 'Analysis + Test' : 'Analysis'}</td>
            <td className="px-3 py-2.5"><StampMark state={g.state} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FabSheet() {
  const d = useDesignStore((s) => s.design);
  const k = 1100; // px per metre at this sheet scale
  const pts = [[0, 0], [d.finSweep, d.finSpan], [d.finSweep + d.finTip, d.finSpan], [d.finRoot, 0]];
  const w = Math.max(d.finRoot, d.finSweep + d.finTip) * k + 60;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <Label>Fin template · cut {d.finCount}× from G10 {(d.finThickness * 1000).toFixed(1)} mm</Label>
        <div className="overflow-x-auto border p-3" style={{ borderColor: P.hair }}>
          <svg viewBox={`-30 -20 ${w} ${d.finSpan * k + 60}`} className="w-full" style={{ maxHeight: 280 }}>
            <polygon points={pts.map(([x, y]) => `${x * k},${(d.finSpan - y) * k}`).join(' ')} fill="none" stroke={P.ink} strokeWidth={1.5} />
            <line x1={-20} x2={d.finRoot * k + 20} y1={d.finSpan * k} y2={d.finSpan * k} stroke={P.construct} strokeDasharray="10 3 2 3" />
            <text x={(d.finRoot * k) / 2} y={d.finSpan * k + 24} textAnchor="middle" fontSize={12} fill={P.ink} fontFamily="IBM Plex Mono">ROOT {fmt(d.finRoot * 1000)}</text>
            <text x={(d.finSweep + d.finTip / 2) * k} y={-6} textAnchor="middle" fontSize={12} fill={P.ink} fontFamily="IBM Plex Mono">TIP {fmt(d.finTip * 1000)}</text>
          </svg>
        </div>
        <button onClick={() => toast('Fabrication pack exported', { description: 'fin-template.dxf · cut-list.pdf · BOM.csv' })} className="mt-3 flex items-center gap-2 px-3 py-2 font-barlow text-[14px] font-semibold tracking-[0.1em] uppercase" style={{ background: P.ink, color: P.paper }}><FileDown size={15} /> Export DXF + cut list</button>
      </div>
      <div>
        <Label>Cut list</Label>
        {[['Airframe tube', `${fmt(d.bodyLength * 1000)} mm`, '1'], ['Coupler', `${fmt(d.diameter * 2000)} mm`, '2'], ['Motor mount tube', `${motorById(d.motorId).diameter} mm × 640`, '1'], ['Centering rings', `Ø${fmt(d.diameter * 1000 - 4)}`, '3'], ['Bulkheads', `Ø${fmt(d.diameter * 1000 - 4)}`, '4'], ['Fins', 'see template', String(d.finCount)]].map(([a, b, c]) => (
          <div key={a} className="grid grid-cols-[1fr_auto_32px] gap-2 border-b py-1.5" style={{ borderColor: P.hair }}><span>{a}</span><span className="font-plex-mono text-[12px]" style={{ color: P.ink2 }}>{b}</span><span className="text-right font-plex-mono">{c}</span></div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── issue revision ───────────────────────── */

function IssueRevision({ revs, onIssue }: { revs: Revision[]; onIssue: (r: Revision) => void }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState('');
  const next = String.fromCharCode(65 + revs.length);
  const { gates } = useEngineering();
  const blocking = gates.filter((g) => g.state === 'fail');
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-1.5 px-3 py-1.5 font-barlow text-[14px] font-semibold tracking-[0.08em] uppercase" style={{ background: P.ink, color: P.paper }}><Stamp size={14} /> Issue Rev {next}</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50" style={{ background: 'rgba(27,43,75,.35)' }} />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 border-[1.5px] p-6 font-plex" style={{ background: P.paper, borderColor: P.ink, color: P.ink }}>
          <div className="flex items-start justify-between">
            <Dialog.Title className="font-barlow text-[24px] font-bold tracking-[0.06em] uppercase">Issue revision {next}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="p-1"><X size={16} /></Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-[12.5px]" style={{ color: P.ink2 }}>Freezes all seven sheets, the model, and the simulation results under one revision letter.</Dialog.Description>
          <label htmlFor="rev-desc" className="mt-5 block font-barlow text-[11px] font-semibold tracking-[0.14em]" style={{ color: P.faint }}>DESCRIPTION OF CHANGE</label>
          <textarea id="rev-desc" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="e.g. Fin span reduced to 120 mm for stability" className="mt-1 w-full border bg-white p-2 text-[13px] outline-none focus:border-[#D9481C]" style={{ borderColor: P.hair }} />
          {blocking.length > 0 && (
            <div className="mt-3 border-l-2 px-3 py-2 text-[12px]" style={{ borderColor: P.red, background: '#D9481C0D' }}>
              <div className="font-medium" style={{ color: P.red }}>{blocking.length} open redline{blocking.length > 1 ? 's' : ''}</div>
              {blocking.map((b) => <div key={b.id} className="flex items-center gap-1.5" style={{ color: P.ink2 }}><Minus size={10} /> {b.label}: {b.value}</div>)}
              <div className="mt-1" style={{ color: P.ink2 }}>The revision will be issued with these noted as open items.</div>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close className="border px-3 py-1.5 text-[13px]" style={{ borderColor: P.hair }}>Cancel</Dialog.Close>
            <button
              onClick={() => { onIssue({ rev: next, desc: desc || 'Design update', by: 'AK', date: '2026-10-02' }); setOpen(false); setDesc(''); toast(`Rev ${next} issued`, { description: '7 sheets frozen · PDF set generated' }); }}
              className="px-3 py-1.5 font-barlow text-[14px] font-semibold tracking-[0.08em] uppercase"
              style={{ background: P.ink, color: P.paper }}
            >
              Issue Rev {next}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
