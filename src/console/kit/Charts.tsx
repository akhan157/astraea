/**
 * Hand-rolled SVG charts. One y-axis per pane (stack panes instead of dual
 * axes), 1.75px lines, recessive grid, shared time cursor, direct labels.
 * Series colors are the validated s1/s2/s3; text stays in ink colors.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { FlightEvent, FlutterPoint } from '../data/contract';
import { useSessionStore } from '../../state/session';
import { C } from './theme';
import { show, type Kind } from './units';

function ticks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
const nearest = (arr: number[], x: number) => {
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid; else hi = mid; }
  return Math.abs(arr[lo] - x) <= Math.abs(arr[hi] - x) ? lo : hi;
};
const PAD = { l: 48, r: 14 };
const axisText = { fontSize: 10, fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fill: C.dim } as const;

/* ───────────── stacked time panes ───────────── */

export interface Pane { id: string; label: string; kind: Kind; values: number[]; color: string; digits?: number; note?: ReactNode; threshold?: { value: number; label: string } }

export function TimeStack({ t, panes, events = [], cursor, onCursor, paneHeight = 74, tMax, highlight }: {
  t: number[]; panes: Pane[]; events?: FlightEvent[]; cursor: number | null; onCursor: (t: number | null) => void; paneHeight?: number; tMax?: number; highlight?: [number, number];
}) {
  const units = useSessionStore((s) => s.units);
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const t1 = tMax ?? t[t.length - 1] ?? 1;
  const inner = Math.max(100, w - PAD.l - PAD.r);
  const X = (x: number) => PAD.l + (x / t1) * inner;
  const tFromPx = (px: number) => Math.max(0, Math.min(t1, ((px - PAD.l) / inner) * t1));
  const shownT = hover ?? cursor;
  const idx = shownT === null ? null : nearest(t, shownT);
  const dragging = useRef(false);

  const conv = useMemo(() => panes.map((p) => {
    const f = show(1, p.kind, units).value; // linear scale factor for display (all kinds here are linear)
    const vals = p.values.map((v) => v * f);
    let lo = Math.min(0, ...vals), hi = Math.max(...vals);
    if (p.threshold) hi = Math.max(hi, p.threshold.value * f);
    if (hi === lo) hi = lo + 1;
    return { ...p, f, vals, lo, hi: hi + (hi - lo) * 0.06, unit: show(1, p.kind, units).unit };
  }), [panes, units]);

  const xt = ticks(0, t1, 8);
  const totalH = panes.length * paneHeight + 24;

  return (
    <div ref={(el) => { (ref as { current: HTMLDivElement | null }).current = el; if (el && Math.abs(el.clientWidth - w) > 2) setW(el.clientWidth); }}
      className="relative select-none"
      onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); const tt = tFromPx(e.clientX - r.left); setHover(tt); if (dragging.current) onCursor(tt); }}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const r = ref.current!.getBoundingClientRect(); onCursor(tFromPx(e.clientX - r.left)); }}
      onPointerUp={() => { dragging.current = false; }}
      onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); onCursor(Math.max(0, Math.min(t1, (cursor ?? 0) + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 0.1)))); } }}
      tabIndex={0} role="slider" aria-label="Flight time" aria-valuemin={0} aria-valuemax={t1} aria-valuenow={cursor ?? 0}
      style={{ cursor: 'crosshair', outline: 'none' }}>
      <svg width={w} height={totalH} style={{ display: 'block' }}>
        {highlight && <rect x={X(highlight[0])} y={0} width={Math.max(1, X(highlight[1]) - X(highlight[0]))} height={totalH - 24} fill="rgba(255,255,255,0.025)" />}
        {conv.map((p, i) => {
          const y0 = i * paneHeight + 6, h = paneHeight - 22, top = y0 + 8;
          const Y = (v: number) => top + h - ((v - p.lo) / (p.hi - p.lo)) * h;
          const yt = ticks(p.lo, p.hi, 2);
          let d = '';
          for (let k = 0; k < t.length; k++) { if (t[k] > t1) break; d += `${k ? 'L' : 'M'}${X(t[k]).toFixed(1)} ${Y(p.vals[k]).toFixed(1)}`; }
          return (
            <g key={p.id}>
              {yt.map((v) => <g key={v}><line x1={PAD.l} x2={w - PAD.r} y1={Y(v)} y2={Y(v)} stroke={C.line} /><text x={PAD.l - 6} y={Y(v) + 3} textAnchor="end" style={axisText}>{v.toLocaleString('en-US', { maximumFractionDigits: 2 })}</text></g>)}
              {p.threshold && <g><line x1={PAD.l} x2={w - PAD.r} y1={Y(p.threshold.value * p.f)} y2={Y(p.threshold.value * p.f)} stroke={C.bad} strokeDasharray="4 3" strokeWidth={1} /><text x={w - PAD.r - 2} y={Y(p.threshold.value * p.f) - 3} textAnchor="end" style={{ ...axisText, fill: C.bad }}>{p.threshold.label}</text></g>}
              <path d={d} fill="none" stroke={p.color} strokeWidth={1.75} strokeLinejoin="round" />
              <text x={PAD.l + 6} y={y0 + 9} style={{ fontSize: 11, fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif", fill: C.muted }}>{p.label}<tspan style={{ ...axisText }} dx={6}>{p.unit}</tspan></text>
            </g>
          );
        })}
        {events.filter((e) => e.t <= t1).map((e) => (
          <g key={e.kind}>
            <line x1={X(e.t)} x2={X(e.t)} y1={0} y2={totalH - 24} stroke="rgba(255,255,255,0.10)" />
          </g>
        ))}
        {xt.map((v) => <text key={v} x={X(v)} y={totalH - 8} textAnchor="middle" style={axisText}>{v}s</text>)}
        {cursor !== null && <line x1={X(cursor)} x2={X(cursor)} y1={0} y2={totalH - 24} stroke={C.accent} strokeWidth={1.25} />}
        {hover !== null && hover !== cursor && <line x1={X(hover)} x2={X(hover)} y1={0} y2={totalH - 24} stroke="rgba(255,255,255,0.25)" />}
        {idx !== null && conv.map((p, i) => {
          const y0 = i * paneHeight + 6, h = paneHeight - 22, top = y0 + 8;
          const Y = (v: number) => top + h - ((v - p.lo) / (p.hi - p.lo)) * h;
          return <circle key={p.id} cx={X(t[idx])} cy={Y(p.vals[idx])} r={3.5} fill={p.color} stroke={C.panel} strokeWidth={2} />;
        })}
      </svg>
      {idx !== null && (
        <div className="pointer-events-none absolute top-1 rounded px-2 py-1.5 text-[11px] shadow-lg" style={{ left: Math.min(X(t[idx]) + 10, w - 170), background: C.raised, border: `1px solid ${C.lineStrong}` }}>
          <div className="mb-0.5 font-geist-mono" style={{ color: C.muted }}>t = {t[idx].toFixed(2)} s</div>
          {conv.map((p) => (
            <div key={p.id} className="flex items-center gap-2 font-geist-mono tnum">
              <span className="h-[2px] w-2.5" style={{ background: p.color }} /><span style={{ color: C.muted }}>{p.label}</span>
              <span className="ml-auto pl-3" style={{ color: C.fg }}>{show(p.values[idx], p.kind, units, p.digits).text} <span style={{ color: C.dim }}>{p.unit}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────── events strip (sits above a TimeStack, same x scale) ───────────── */

/* Conservative text estimate for a 10.5px Geist label; overestimates slightly
 * so placement never relies on a glyph being narrower than predicted. */
const LABEL_CHAR_W = 6.8;
const LABEL_PAD = 14;
const LABEL_GAP = 3;
const LABEL_ROW_H = 18;
const MAX_LABEL_ROWS = 3;
/** Label placement order: the events that define the flight win the space. */
const LABEL_PRIORITY: readonly FlightEvent['kind'][] = ['apogee_drogue', 'burnout', 'main', 'touchdown', 'rail_exit', 'ignition', 'max_q'];

export function EventStrip({ events, tMax, cursor, onPick, width }: { events: FlightEvent[]; tMax: number; cursor: number | null; onPick: (t: number) => void; width: number }) {
  const [w, setW] = useState(width);
  const inner = Math.max(100, w - PAD.l - PAD.r);
  const X = (x: number) => PAD.l + (x / tMax) * inner;
  const shown = events.filter((e) => e.t <= tMax);
  // Place labels in priority order (flight-defining events first). Each label
  // takes the first row with a free slot that still covers its event time,
  // sliding up to its own width; labels that fit nowhere become a tick with
  // the text in the tooltip and accessible name, never an overlapping box.
  const rows: Array<Array<[number, number]>> = Array.from({ length: MAX_LABEL_ROWS }, () => []);
  const placed: { e: FlightEvent; left: number; row: number }[] = [];
  const ticks: FlightEvent[] = [];
  const byPriority = [...shown].sort((a, b) => LABEL_PRIORITY.indexOf(a.kind) - LABEL_PRIORITY.indexOf(b.kind));
  for (const e of byPriority) {
    const label = `${e.label} ${e.t.toFixed(1)}s`;
    const width = Math.min(w, Math.ceil(label.length * LABEL_CHAR_W) + LABEL_PAD);
    const x = X(e.t);
    const lo = Math.max(0, x - width), hi = Math.min(w - width, x);
    const ideal = Math.max(lo, Math.min(hi, x - width / 2));
    let slot: { left: number; row: number } | null = null;
    for (let r = 0; r < MAX_LABEL_ROWS && slot === null; r++) {
      const candidates = [ideal, ...rows[r].flatMap(([a, b]) => [b + LABEL_GAP, a - LABEL_GAP - width])]
        .filter((left) => left >= lo && left <= hi)
        .sort((p, q) => Math.abs(p - ideal) - Math.abs(q - ideal));
      const left = candidates.find((c) => rows[r].every(([a, b]) => c + width + LABEL_GAP <= a || c >= b + LABEL_GAP));
      if (left !== undefined) slot = { left, row: r };
    }
    if (slot === null) ticks.push(e);
    else { placed.push({ e, ...slot }); rows[slot.row].push([slot.left, slot.left + width]); }
  }
  const labelRows = rows.reduce((n, row, i) => (row.length ? i + 1 : n), 0);
  const tickRow = labelRows;
  const height = Math.max(20, labelRows * LABEL_ROW_H + (ticks.length ? 14 : 2));
  return (
    <div
      ref={(el) => { if (el && el.clientWidth > 0 && Math.abs(el.clientWidth - w) > 2) setW(el.clientWidth); }}
      className="relative" style={{ width: '100%', height }}
    >
      {placed.map(({ e, left, row }) => {
        const active = cursor !== null && Math.abs(cursor - e.t) < tMax / 400;
        return (
          <button key={e.kind} onClick={() => onPick(e.t)} className="absolute rounded px-1.5 py-[1px] text-[10.5px] leading-none whitespace-nowrap hover:bg-white/5"
            style={{ left, top: row * LABEL_ROW_H + 1, color: active ? C.accent : C.muted, border: `1px solid ${active ? 'rgba(110,231,247,.5)' : C.line}`, background: C.panel }}
            title={`${e.label} · t = ${e.t.toFixed(2)} s`}>
            {e.label} <span className="font-geist-mono" style={{ color: C.dim }}>{e.t.toFixed(1)}s</span>
          </button>
        );
      })}
      {ticks.map((e) => {
        const active = cursor !== null && Math.abs(cursor - e.t) < tMax / 400;
        return (
          <button key={e.kind} onClick={() => onPick(e.t)} aria-label={`${e.label} · t = ${e.t.toFixed(2)} s`}
            title={`${e.label} · t = ${e.t.toFixed(2)} s`}
            className="absolute flex h-3 w-2 items-end justify-center rounded-sm hover:bg-white/10"
            style={{ left: X(e.t) - 4, top: tickRow * LABEL_ROW_H + 1 }}>
            <span className="block h-2 w-[2px] rounded-full" style={{ background: active ? C.accent : C.lineStrong }} />
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── flutter: speeds and margin vs time ───────────── */

export function FlutterChart({ points, gate, cursor, onCursor, worstT }: { points: FlutterPoint[]; gate: number; cursor: number | null; onCursor: (t: number | null) => void; worstT: number }) {
  const t = points.map((p) => p.t);
  const panes: Pane[] = [
    { id: 'air', label: 'Airspeed', kind: 'speed', values: points.map((p) => p.airspeed), color: C.s1 },
    { id: 'vf', label: 'Flutter speed', kind: 'speed', values: points.map((p) => p.flutterSpeed), color: C.s2 },
    { id: 'margin', label: 'Margin', kind: 'ratio', values: points.map((p) => Math.min(p.margin, 12)), color: C.s3, threshold: { value: gate, label: `${gate}× gate` } }
  ];
  return <TimeStack t={t} panes={panes} cursor={cursor ?? worstT} onCursor={onCursor} paneHeight={70} />;
}

/* ───────────── landing scatter with containment rings ───────────── */

export function LandingScatter({ landings, mean, rings, height = 300 }: { landings: { x: number; y: number }[]; mean: { x: number; y: number }; rings: { r: number; label: string }[]; height?: number }) {
  const units = useSessionStore((s) => s.units);
  const [hover, setHover] = useState<number | null>(null);
  const ext = Math.max(50, ...landings.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))), ...rings.map((r) => Math.hypot(mean.x, mean.y) + r.r)) * 1.1;
  const S = height, half = S / 2;
  const P = (x: number, y: number) => [half + (x / ext) * (half - 14), half - (y / ext) * (half - 14)] as const;
  const tk = ticks(0, ext, 3).filter((v) => v > 0);
  const f = show(1, 'dist', units);
  return (
    <div className="relative" style={{ width: S }}>
      <svg width={S} height={S} role="img" aria-label={`${landings.length} simulated landing points`}>
        {tk.map((v) => <g key={v}><circle cx={half} cy={half} r={(v / ext) * (half - 14)} fill="none" stroke={C.line} /><text x={half + 3} y={half - (v / ext) * (half - 14) - 3} style={axisText}>{(v * f.value).toFixed(0)} {f.unit}</text></g>)}
        <line x1={half} x2={half} y1={8} y2={S - 8} stroke={C.line} /><line x1={8} x2={S - 8} y1={half} y2={half} stroke={C.line} />
        <text x={half + 4} y={16} style={axisText}>N</text>
        {rings.map((r, i) => { const [cx, cy] = P(mean.x, mean.y); return <circle key={r.label} cx={cx} cy={cy} r={(r.r / ext) * (half - 14)} fill="none" stroke={[C.s1, C.s2, C.s3][i]} strokeWidth={1.5} strokeDasharray={i === 2 ? '4 3' : undefined} />; })}
        {landings.map((p, i) => { const [x, y] = P(p.x, p.y); return <circle key={i} cx={x} cy={y} r={hover === i ? 4 : 2.5} fill={C.fg} fillOpacity={0.55} stroke={C.panel} strokeWidth={1} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />; })}
        <g><rect x={half - 4} y={half - 4} width={8} height={8} fill={C.accent} transform={`rotate(45 ${half} ${half})`} /></g>
      </svg>
      <div className="mt-1 flex justify-center gap-4 text-[11px]" style={{ color: C.muted }}>
        {rings.map((r, i) => <span key={r.label} className="inline-flex items-center gap-1.5"><svg width="14" height="6" aria-hidden><line x1="0" y1="3" x2="14" y2="3" stroke={[C.s1, C.s2, C.s3][i]} strokeWidth="1.5" strokeDasharray={i === 2 ? '4 3' : undefined} /></svg>{r.label} of samples within {(r.r * f.value).toFixed(0)} {f.unit}</span>)}
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45" style={{ background: C.accent }} />Pad</span>
      </div>
      {hover !== null && (() => { const [x, y] = P(landings[hover].x, landings[hover].y); return <div className="pointer-events-none absolute rounded px-2 py-1 font-geist-mono text-[11px]" style={{ left: x + 8, top: y - 30, background: C.raised, border: `1px solid ${C.lineStrong}` }}>{(landings[hover].x * f.value).toFixed(0)} E, {(landings[hover].y * f.value).toFixed(0)} N {f.unit}</div>; })()}
    </div>
  );
}

/* ───────────── horizontal share bar (used in lists) ───────────── */

export function ShareBar({ pct, color = C.s1, max = 100 }: { pct: number; color?: string; max?: number }) {
  return (
    <span className="relative block h-[6px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(0, Math.min(100, (Math.abs(pct) / max) * 100))}%`, background: color }} />
    </span>
  );
}
