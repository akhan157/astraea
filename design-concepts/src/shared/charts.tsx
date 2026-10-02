import { useId, useMemo, useRef, useState } from 'react';

export interface ChartTheme {
  grid: string;
  axis: string;
  text: string;
  font: string;
  crosshair: string;
  tooltipBg: string;
  tooltipFg: string;
}

export interface Series<T> {
  key: string;
  label: string;
  color: string;
  value: (d: T) => number;
  dash?: string;
  area?: boolean;
  unit?: string;
  digits?: number;
}

function niceTicks(min: number, max: number, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/** Responsive SVG line chart with a hover crosshair. */
export function LineChart<T>({
  data, x, series, theme, height = 220, xLabel, yLabel, markers = [], className
}: {
  data: T[];
  x: (d: T) => number;
  series: Series<T>[];
  theme: ChartTheme;
  height?: number;
  xLabel?: string;
  yLabel?: string;
  markers?: { x: number; label: string; color: string }[];
  className?: string;
}) {
  const W = 640;
  const H = height;
  const pad = { l: 52, r: 16, t: 14, b: 34 };
  const id = useId();
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { xs, x0, x1, y0, y1 } = useMemo(() => {
    const xs = data.map(x);
    let y0 = Infinity, y1 = -Infinity;
    for (const s of series) for (const d of data) { const v = s.value(d); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    if (y0 > 0) y0 = 0;
    const padY = (y1 - y0) * 0.08;
    return { xs, x0: Math.min(...xs), x1: Math.max(...xs), y0, y1: y1 + padY };
  }, [data, x, series]);

  const sx = (v: number) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
  const yt = niceTicks(y0, y1, 4);
  const xt = niceTicks(x0, x1, 6);

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const xv = x0 + ((px - pad.l) / (W - pad.l - pad.r)) * (x1 - x0);
    let best = 0;
    for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i] - xv) < Math.abs(xs[best] - xv)) best = i;
    setHover(best);
  };

  const hd = hover !== null ? data[hover] : null;

  return (
    <div className={className} style={{ position: 'relative', fontFamily: theme.font }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: 'block', touchAction: 'none' }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(v)} y2={sy(v)} stroke={theme.grid} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={pad.l - 8} y={sy(v) + 3.5} textAnchor="end" fontSize={10} fill={theme.text}>{Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : v}</text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={`x${v}`} x={sx(v)} y={H - pad.b + 16} textAnchor="middle" fontSize={10} fill={theme.text}>{v}</text>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={sy(0)} y2={sy(0)} stroke={theme.axis} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={sx(m.x)} x2={sx(m.x)} y1={pad.t} y2={H - pad.b} stroke={m.color} strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={sx(m.x) + 4} y={pad.t + 10} fontSize={9.5} fill={m.color}>{m.label}</text>
          </g>
        ))}
        {series.map((s) => {
          const path = data.map((d, i) => `${i ? 'L' : 'M'}${sx(x(d)).toFixed(1)},${sy(s.value(d)).toFixed(1)}`).join('');
          return (
            <g key={s.key}>
              {s.area && <path d={`${path}L${sx(x1)},${sy(0)}L${sx(x0)},${sy(0)}Z`} fill={`url(#${id}-${s.key})`} />}
              <path d={path} fill="none" stroke={s.color} strokeWidth={1.75} strokeDasharray={s.dash} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </g>
          );
        })}
        {hd && (
          <g>
            <line x1={sx(x(hd))} x2={sx(x(hd))} y1={pad.t} y2={H - pad.b} stroke={theme.crosshair} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {series.map((s) => <circle key={s.key} cx={sx(x(hd))} cy={sy(s.value(hd))} r={3.5} fill={s.color} />)}
          </g>
        )}
        {xLabel && <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize={10} fill={theme.text}>{xLabel}</text>}
        {yLabel && <text x={6} y={pad.t + 2} fontSize={10} fill={theme.text}>{yLabel}</text>}
      </svg>
      {hd && (
        <div style={{ position: 'absolute', top: 8, left: `${Math.min(70, (sx(x(hd)) / W) * 100 + 2)}%`, background: theme.tooltipBg, color: theme.tooltipFg, padding: '6px 8px', borderRadius: 6, fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>
          <div style={{ opacity: 0.7 }}>t = {x(hd).toFixed(2)} s</div>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 8, height: 2, background: s.color, display: 'inline-block' }} />
              {s.label}: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value(hd).toFixed(s.digits ?? 0)}{s.unit ?? ''}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, color, height = 28, fill = true }: { values: number[]; color: string; height?: number; fill?: boolean }) {
  const W = 100;
  const min = Math.min(...values, 0), max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, height - 2 - ((v - min) / (max - min || 1)) * (height - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      {fill && <path d={`${d}L${W},${height}L0,${height}Z`} fill={color} opacity={0.14} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  );
}

/** Landing dispersion scatter with 1σ/2σ ellipses (axis-aligned approximation). */
export function Dispersion({ pts, theme, color, size = 260, ringColor }: { pts: { x: number; y: number }[]; theme: ChartTheme; color: string; size?: number; ringColor?: string }) {
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sdx = Math.sqrt(pts.reduce((s, p) => s + (p.x - mx) ** 2, 0) / pts.length);
  const sdy = Math.sqrt(pts.reduce((s, p) => s + (p.y - my) ** 2, 0) / pts.length);
  const ext = Math.max(...pts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) * 1.15 || 1;
  const s = (v: number) => size / 2 + (v / ext) * (size / 2 - 14);
  const ringStep = niceTicks(0, ext, 3).filter((v) => v > 0);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ display: 'block', maxWidth: size, fontFamily: theme.font }}>
      {ringStep.map((r) => (
        <g key={r}>
          <circle cx={size / 2} cy={size / 2} r={(r / ext) * (size / 2 - 14)} fill="none" stroke={theme.grid} />
          <text x={size / 2 + 3} y={size / 2 - (r / ext) * (size / 2 - 14) - 3} fontSize={9} fill={theme.text}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</text>
        </g>
      ))}
      <line x1={0} x2={size} y1={size / 2} y2={size / 2} stroke={theme.grid} />
      <line y1={0} y2={size} x1={size / 2} x2={size / 2} stroke={theme.grid} />
      <ellipse cx={s(mx)} cy={s(-my)} rx={(2 * sdx / ext) * (size / 2 - 14)} ry={(2 * sdy / ext) * (size / 2 - 14)} fill={color} fillOpacity={0.06} stroke={ringColor ?? color} strokeDasharray="4 3" />
      <ellipse cx={s(mx)} cy={s(-my)} rx={(sdx / ext) * (size / 2 - 14)} ry={(sdy / ext) * (size / 2 - 14)} fill={color} fillOpacity={0.1} stroke={ringColor ?? color} />
      {pts.map((p, i) => <circle key={i} cx={s(p.x)} cy={s(-p.y)} r={1.8} fill={color} opacity={0.75} />)}
      <path d={`M${size / 2 - 5},${size / 2}L${size / 2 + 5},${size / 2}M${size / 2},${size / 2 - 5}L${size / 2},${size / 2 + 5}`} stroke={theme.axis} strokeWidth={2} />
      <text x={size - 4} y={12} textAnchor="end" fontSize={9} fill={theme.text}>N ↑</text>
    </svg>
  );
}
