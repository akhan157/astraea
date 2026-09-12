/**
 * TrajectoryOverlayChart — reusable hand-rolled SVG overlay (Q11: no chart
 * library) for the sim-vs-actual evidence surface.
 *
 * Pure presentation: the caller passes an `OverlayModel` (see
 * src/evidence/overlay.ts — re-grid, alignment, deltas already computed).
 * This component draws:
 *   - shared time axis + altitude axis with tick labels;
 *   - the modeled (cyan) and recorded (violet) series as polylines;
 *   - 'modeled' / 'recorded' identity chips (Q11 series tokens — cyan is
 *     the modeled identity, violet is the flight-log identity; no safety
 *     state is ever reproduced by these colors);
 *   - Δapogee / Δburnout chips (neutral zinc foreground; amber on a
 *     non-nominal apogee classification);
 *   - optional sim event markers (diamonds + labels along the modeled
 *     curve);
 *   - a draggable cursor that snaps to the modeled grid via
 *     cursorIndexFor and reads out both series at the pointer time.
 *
 * Everything is drawn inside one <svg> with pointer handlers; the caller
 * provides the dark container (bg-zinc-900/…).
 */

import React, { useState } from 'react';
import type { OverlayModel, CursorIndex } from '../evidence/overlay';
import { cursorIndexFor } from '../evidence/overlay';

/** Q11 modeled-series token: cyan (Tailwind cyan-400). */
export const OVERLAY_MODELED_COLOR = '#22d3ee';
/** Q11 flight-log-series token: violet (Tailwind violet-500, the avionics token). */
export const OVERLAY_RECORDED_COLOR = '#8b5cf6';

const GRID_COLOR = '#3f3f46';
const GRID_SOFT = '#27272a';
const TEXT_DIM = '#71717a';
const TEXT_MUTED = '#a1a1aa';
const CHIP_BG = '#18181b';
const AMBER = '#f59e0b';

/** Faint series line-underlay for the cursor readout. */
const CURSOR_COLOR = '#f4f4f5';

const MARGIN = { top: 34, right: 18, bottom: 30, left: 52 };

/** One sim event to mark on the modeled curve (times in sim seconds). */
export interface OverlayEventMarker {
  timeS: number;
  name: string;
}

export interface TrajectoryOverlayChartProps {
  model: OverlayModel;
  /** Sim events, drawn as labeled diamonds (clipped to the plot span). */
  events?: readonly OverlayEventMarker[];
  width?: number;
  height?: number;
}

export function TrajectoryOverlayChart({
  model,
  events = [],
  width = 640,
  height = 320,
}: TrajectoryOverlayChartProps): React.JSX.Element {
  const { modeled, recorded, apogeeDeltaM, burnoutVelDeltaMs, state } = model;

  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const modeledFirst = modeled.points[0];
  const modeledLast = modeled.points[modeled.points.length - 1];
  const recordedFirst = recorded.points[0];
  const recordedLast = recorded.points[recorded.points.length - 1];
  const xMin = Math.min(modeledFirst.timeS + modeled.timeOffsetApply, recordedFirst.timeS + recorded.timeOffsetApply);
  const xMax = Math.max(modeledLast.timeS + modeled.timeOffsetApply, recordedLast.timeS + recorded.timeOffsetApply);
  const xSpan = xMax - xMin;

  let maxAlt = 0;
  for (const s of modeled.points) {
    if (s.altitudeM > maxAlt) maxAlt = s.altitudeM;
  }
  for (const s of recorded.points) {
    if (s.altitudeM > maxAlt) maxAlt = s.altitudeM;
  }
  const yMax = Math.max(1e-6, maxAlt * 1.12);
  const xOf = (t: number): number => MARGIN.left + ((t - xMin) / xSpan) * plotW;
  const yOf = (a: number): number => MARGIN.top + plotH - (a / yMax) * plotH;

  const polyOf = (points: readonly { timeS: number; altitudeM: number }[], offset: number): string => {
    let d = '';
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = xOf(p.timeS + offset);
      const y = yOf(p.altitudeM);
      if (i === 0) d = `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      else d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
  };
  const modeledD = polyOf(modeled.points, modeled.timeOffsetApply);
  const recordedD = polyOf(recorded.points, recorded.timeOffsetApply);

  // --- axes ticks ---
  const yTicks: { a: number; y: number }[] = [];
  for (let i = 0; i <= 4; i++) {
    const a = (yMax * i) / 4;
    yTicks.push({ a, y: yOf(a) });
  }
  const xTicks: { t: number; x: number }[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = xMin + (xSpan * i) / 4;
    xTicks.push({ t, x: xOf(t) });
  }

  // --- draggable cursor (snapped to the modeled grid; readouts on both) ---
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  const fractionFromEvent = (e: React.MouseEvent): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const f = (e.clientX - rect.left - MARGIN.left) / plotW;
    return Math.min(1, Math.max(0, f));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    const f = fractionFromEvent(e);
    if (f === null) return;
    setDragFraction(f);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (dragFraction === null) return;
    const f = fractionFromEvent(e);
    if (f === null) return;
    setDragFraction(f);
  };
  const endDrag = () => {
    setDragFraction(null);
  };

  // Resolve the pointer to a chart time, then snap per series.
  const cursor: { cm: CursorIndex; cr: CursorIndex; t: number } | null = (() => {
    if (dragFraction === null || xSpan <= 0) return null;
    const t = xMin + dragFraction * xSpan;
    const fm = (t - (modeledFirst.timeS + modeled.timeOffsetApply)) / Math.max(1e-9, modeledLast.timeS - modeledFirst.timeS);
    const fr = (t - (recordedFirst.timeS + recorded.timeOffsetApply)) / Math.max(1e-9, recordedLast.timeS - recordedFirst.timeS);
    const cm = cursorIndexFor(modeled.points, modeled.timeOffsetApply, fm);
    const cr = cursorIndexFor(recorded.points, recorded.timeOffsetApply, fr);
    return cm === null || cr === null ? null : { cm, cr, t: cm.timeS };
  })();

  const apogeeChipClass = state === 'nominal' ? TEXT_DIM : AMBER;
  const apogeeTag = state === 'nominal' ? '' : state === 'short_apogee' ? ' LOW' : ' HIGH';
  const deltaBurnout = burnoutVelDeltaMs === null ? null : burnoutVelDeltaMs;

  const fmtAlt = (a: number): string => `${a.toFixed(0)} m`;
  const fmtT = (t: number): string => `${t.toFixed(1)} s`;
  /** Signed delta: always '+' or '-' so negative deltas stay readable. */
  const fmtSigned = (v: number, digits: number, unit: string): string =>
    `${v < 0 ? '-' : '+'}${Math.abs(v).toFixed(digits)} ${unit}`;
  const seriesChip = (x: number, y: number, color: string, label: string) => (
    <g>
      <rect x={x} y={y} width={96} height={17} rx={3} fill={CHIP_BG} stroke={color} strokeOpacity={0.5} />
      <circle cx={x + 11} cy={y + 8.5} r={3} fill={color} />
      <text x={x + 20} y={y + 11.5} fontSize={9} fill={color} {...{ fontFamily: 'monospace' }}>
        {label}
      </text>
    </g>
  );

  return (
    <svg
      ref={svgRef}
      className="w-full h-full overflow-visible touch-none"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Simulated vs recorded trajectory: recorded apogee ${fmtAlt(maxAltitudeOf(recorded))}, modeled delta ${fmtAlt(apogeeDeltaM)}`}
      style={{ cursor: dragFraction === null ? 'crosshair' : 'grabbing' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      {/* Plot frame */}
      <rect
        x={MARGIN.left}
        y={MARGIN.top}
        width={plotW}
        height={plotH}
        fill="none"
        stroke={GRID_COLOR}
        strokeWidth={0.5}
      />
      {yTicks.map(({ a, y }) => (
        <g key={`yt-${a}`}>
          <line x1={MARGIN.left} y1={y} x2={MARGIN.left + plotW} y2={y} stroke={GRID_SOFT} strokeWidth={0.5} />
          <text x={MARGIN.left - 6} y={y + 3} fontSize={8} fill={TEXT_DIM} textAnchor="end" {...{ fontFamily: 'monospace' }}>
            {a.toFixed(0)}
          </text>
        </g>
      ))}
      {xTicks.map(({ t, x }) => (
        <g key={`xt-${t}`}>
          <line x1={x} y1={MARGIN.top + plotH} x2={x} y2={MARGIN.top + plotH + 4} stroke={GRID_SOFT} strokeWidth={0.5} />
          <text x={x} y={MARGIN.top + plotH + 13} fontSize={8} fill={TEXT_DIM} textAnchor="middle" {...{ fontFamily: 'monospace' }}>
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      <text x={MARGIN.left - 20} y={MARGIN.top - 8} fontSize={8} fill={TEXT_DIM} {...{ fontFamily: 'monospace' }}>
        m
      </text>
      <text x={MARGIN.left + plotW / 2} y={MARGIN.top + plotH + 24} fontSize={8} fill={TEXT_DIM} textAnchor="middle" {...{ fontFamily: 'monospace' }}>
        s (aligned)
      </text>

      {/* Series polylines */}
      <path d={modeledD} fill="none" stroke={OVERLAY_MODELED_COLOR} strokeWidth={2} strokeLinejoin="round" />
      <path d={recordedD} fill="none" stroke={OVERLAY_RECORDED_COLOR} strokeWidth={2} strokeLinejoin="round" strokeDasharray="0.1 5" />

      {/* Sim event markers (diamonds on the modeled span) */}
      {events.map((evt, i) => {
        if (evt.timeS < xMin || evt.timeS > xMax) return null;
        const x = xOf(evt.timeS);
        const y = Math.min(yOf(maxAltitudeOf(modeled)), yOf(maxAltitudeOf(recorded)));
        return (
          <g key={`evt-${i}`}>
            <path d={`M ${x.toFixed(1)} ${y - 5} L ${x + 4} ${y} L ${x} ${y + 5} L ${x - 4} ${y} Z`} fill={TEXT_MUTED} />
            <text x={x + 6} y={y + 3} fontSize={8} fill={TEXT_MUTED} {...{ fontFamily: 'monospace' }}>
              {evt.name}
            </text>
          </g>
        );
      })}

      {/* Identity + delta chips (top row, Q11) */}
      {seriesChip(MARGIN.left, 4, OVERLAY_MODELED_COLOR, 'modeled')}
      {seriesChip(MARGIN.left + 104, 4, OVERLAY_RECORDED_COLOR, 'recorded')}
      <g>
        <rect x={width - 168} y={4} width={150} height={17} rx={3} fill={CHIP_BG} stroke={apogeeChipClass} strokeOpacity={0.6} />
        <text x={width - 162} y={15.5} fontSize={9} fill={apogeeChipClass} {...{ fontFamily: 'monospace' }}>
          {`Δapogee ${fmtSigned(apogeeDeltaM, 0, 'm')}${apogeeTag}`}
        </text>
      </g>
      {deltaBurnout !== null && (
        <g>
          <rect x={width - 168} y={23} width={150} height={15} rx={3} fill={CHIP_BG} stroke={TEXT_DIM} strokeOpacity={0.6} />
          <text x={width - 162} y={33.5} fontSize={8} fill={TEXT_MUTED} {...{ fontFamily: 'monospace' }}>
            {`Δv_burnout ${fmtSigned(deltaBurnout, 1, 'm/s')}`}
          </text>
        </g>
      )}

      {/* Draggable cursor */}
      {cursor !== null && (
        <g aria-label="Overlay cursor">
          <line x1={xOf(cursor.t)} y1={MARGIN.top} x2={xOf(cursor.t)} y2={MARGIN.top + plotH} stroke={CURSOR_COLOR} strokeWidth={1} strokeDasharray="3 3" />
          <circle cx={xOf(cursor.cm.timeS)} cy={yOf(cursor.cm.altitudeM)} r={3.5} fill={OVERLAY_MODELED_COLOR} />
          <circle cx={xOf(cursor.cr.timeS)} cy={yOf(cursor.cr.altitudeM)} r={3.5} fill={OVERLAY_RECORDED_COLOR} />
          <g>
            <rect x={MARGIN.left + 6} y={height - 44} width={252} height={34} rx={3} fill={CHIP_BG} stroke={GRID_SOFT} />
            <text x={MARGIN.left + 12} y={height - 33} fontSize={8} fill={TEXT_MUTED} {...{ fontFamily: 'monospace' }}>
              {`modeled ${fmtT(cursor.cm.timeS)} · ${fmtAlt(cursor.cm.altitudeM)}`}
            </text>
            <text x={MARGIN.left + 12} y={height - 21} fontSize={8} fill={TEXT_MUTED} {...{ fontFamily: 'monospace' }}>
              {`recorded ${fmtT(cursor.cr.timeS)} · ${fmtAlt(cursor.cr.altitudeM)}`}
            </text>
          </g>
        </g>
      )}
      {cursor === null && (
        <text x={MARGIN.left + 6} y={height - 14} fontSize={8} fill={TEXT_DIM} {...{ fontFamily: 'monospace' }}>
          drag to inspect samples
        </text>
      )}
    </svg>
  );
}

function maxAltitudeOf(series: { points: readonly { altitudeM: number }[] }): number {
  let best = 0;
  for (const s of series.points) {
    if (s.altitudeM > best) best = s.altitudeM;
  }
  return best;
}