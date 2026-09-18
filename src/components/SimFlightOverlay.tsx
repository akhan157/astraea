/**
 * Sim-vs-flight overlay studio (audit F4; synthesis patterns 6/7/10) — B port.
 *
 * Sibling Inspect/Compare panes over one flight-evidence model:
 *
 * - Inspect: checkbox signal layering (sim + every archived flight log),
 *   shared cross-pane time cursor, apogee markers, run archive with
 *   current-log promotion (newest ingest auto-promotes, any entry can be
 *   re-promoted).
 * - Compare: the overlay compare contract from `../evidence/overlay`
 *   (align → sync → interpolate → tolerance) with band + signed difference
 *   + pass/fail strip + out-of-tolerance region navigation.
 *
 * B adaptation (shell-alt: no telemetry-bearing lastSimRun field exists):
 * the sim side is the run store's CHOSEN completed run record, qualified by
 * the existing pattern-8 contract (`qualifyResult`/`displayFor`). The run
 * store persists identities, not telemetry payloads (S4 job service pending),
 * so the sim curve is a deterministic re-derivation of the current resolved
 * case via the same 6-DOF engine — drawn ONLY while the committed record is
 * completed, valid, freshness-current, and its snapshot key matches the
 * current resolved case. A stale, invalid, failed, or input-diverged record
 * renders its qualified badge instead of a curve, so an unqualified pass can
 * never be drawn. Run-archive promotion maps onto `chooseRun`.
 *
 * Data flow: CSV via `parseAltimeterCsv`, GPX via `parseGpxTrack` →
 * `gpsToEnu` → `gpsAltitudeSeries`; everything is regridded to the Q4
 * 0.1 s display grid at ingest. The compare is analysis-only: it never
 * writes the vehicle, motor, or sim run, and calibration candidates stay in
 * the Calibration card until consumed (frontend-plan §7).
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Layers,
  Link2,
  Scale,
  Unlink,
} from 'lucide-react';
import { parseAltimeterCsv, type AltitudeSample, type TrajectorySample } from '../evidence/altimetry';
import { gpsAltitudeSeries, gpsToEnu, parseGpxTrack } from '../evidence/gpsTrack';
import {
  DISPLAY_DT_S,
  compareAltitudeSeries,
  simTelemetryToAltitude,
  type CompareResult,
  type InterpMode,
  type SyncMode,
} from '../evidence/overlay';
import { useRocketStore } from '../store/rocketStore';
import { displayFor, useRunStore } from '../store/runStore';
import { preflight, snapshotCase, type LaunchCase, type RunSnapshot } from '../application/caseResolver';
import { simulate6DofFlight, type SixDofSimulationResult } from '../sim/sixDofSimulator';
import { StatusBadge } from './ui/StatusBadge';

/** One ingested flight log in the run archive. */
export interface FlightLog {
  id: string;
  name: string;
  source: 'csv' | 'gpx';
  /** Regridded to DISPLAY_DT_S at ingest (Q4 display contract). */
  samples: AltitudeSample[];
  apogeeM: number;
  apogeeS: number;
}

type Pane = 'inspect' | 'compare';

const LOG_COLORS = ['#a78bfa', '#fb923c', '#34d399', '#f472b6', '#facc15'];
const SIM_COLOR = '#22d3ee';

const PLOT_W = 560;

/**
 * Overlay launch conditions for the sim re-derivation: the trajectory
 * studio's Monte-Carlo defaults (TrajectoryStudio: rail 2.4 m, elev 85°,
 * az 90°, surface wind 0/0, no fin cant, main deploy 250 m AGL). The
 * committed record's snapshot key was computed from the same shape, so a
 * key match proves the overlay re-flies the exact committed inputs.
 */
const OVERLAY_LAUNCH_OPTIONS = {
  railLengthM: 2.4,
  railElevationDeg: 85.0,
  railAzimuthDeg: 90.0,
  windSpeedMps: 0,
  windAzimuthDeg: 0,
  finCantDeg: 0,
  mainDeployAltitudeM: 250,
};

function fmt(value: number | null | undefined, digits = 1, fallback = '—'): string {
  return value === null || value === undefined || !Number.isFinite(value) ? fallback : value.toFixed(digits);
}

function apogeeOf(samples: readonly AltitudeSample[]): { apogeeM: number; apogeeS: number } {
  let best = samples[0];
  for (const s of samples) {
    if (s.altitudeM > best.altitudeM) best = s;
  }
  return { apogeeM: best.altitudeM, apogeeS: best.timeS };
}

/** Display decimation: stride-sample paths over the cap (charting only). */
function decimate<T>(pts: readonly T[], cap = 1200): readonly T[] {
  if (pts.length <= cap) return pts;
  const stride = Math.ceil(pts.length / cap);
  const out: T[] = [];
  for (let i = 0; i < pts.length; i += stride) out.push(pts[i]);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

interface Scales {
  x: (t: number) => number;
  y: (v: number) => number;
  minT: number;
  maxT: number;
  minV: number;
  maxV: number;
}

function makeScales(t0: number, t1: number, v0: number, v1: number, h: number, pad = 28): Scales {
  const spanT = t1 - t0 || 1;
  const spanV = v1 - v0 || 1;
  const top = 10;
  const bottom = h - 20;
  return {
    x: (t) => pad + ((t - t0) / spanT) * (PLOT_W - pad - 8),
    y: (v) => top + (1 - (v - v0) / spanV) * (bottom - top),
    minT: t0,
    maxT: t1,
    minV: v0,
    maxV: v1,
  };
}

function pathOf(pts: readonly { t: number; v: number }[], s: Scales): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${s.x(p.t).toFixed(1)},${s.y(p.v).toFixed(1)}`).join(' ');
}

/** Linear read of a grid series at t (cursor readout; grid is uniform). */
function readAt(series: readonly AltitudeSample[], t: number): number | null {
  if (series.length === 0) return null;
  if (t <= series[0].timeS) return series[0].altitudeM;
  if (t >= series[series.length - 1].timeS) return series[series.length - 1].altitudeM;
  let lo = 0;
  let hi = series.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (series[mid].timeS <= t) lo = mid;
    else hi = mid;
  }
  const a = series[lo];
  const b = series[hi];
  if (b.timeS === a.timeS) return a.altitudeM;
  return a.altitudeM + ((t - a.timeS) / (b.timeS - a.timeS)) * (b.altitudeM - a.altitudeM);
}

function AxisLabels({ s, h, unit }: { s: Scales; h: number; unit: string }): React.JSX.Element {
  return (
    <g fontSize="9" fill="#71717a" fontFamily="monospace">
      <text x={4} y={14}>{fmt(s.maxV, 0)}{unit}</text>
      <text x={4} y={h - 22}>{fmt(s.minV, 0)}{unit}</text>
      <text x={30} y={h - 6}>{fmt(s.minT, 0)}s</text>
      <text x={PLOT_W - 44} y={h - 6}>{fmt(s.maxT, 0)}s</text>
    </g>
  );
}

export function SimFlightOverlay(): React.JSX.Element {
  // ---- B commitment source: run store + S1 snapshot identity (pattern 8) ----
  const vehicle = useRocketStore((s) => s.vehicle);
  const selectedMotorId = useRocketStore((s) => s.selectedMotorId);
  const customMotors = useRocketStore((s) => s.customMotors);
  const runRecords = useRunStore((s) => s.records);
  const chosenRunId = useRunStore((s) => s.chosenRunId);
  // Registry freshness re-derives against the studio's published COMPLETE
  // dependency snapshot; subscribing keeps the archive honest the moment
  // inputs change (Astra P0-1), not only after a rerun.
  const currentSnapshot = useRunStore((s) => s.currentSnapshot);
  const chosen = runRecords.find((r) => r.runId === chosenRunId) ?? null;

  const [pane, setPane] = useState<Pane>('inspect');
  const [logs, setLogs] = useState<FlightLog[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<string, boolean>>({ sim: true });
  const [cursorT, setCursorT] = useState<number | null>(null);
  const idRef = useRef(0);

  // Compare controls (pattern 7: the contract is explicit and editable).
  const [baselineSel, setBaselineSel] = useState('sim');
  const [compareSel, setCompareSel] = useState('');
  const [sync, setSync] = useState<SyncMode>('union');
  const [interp, setInterp] = useState<InterpMode>('linear');
  const [alignOn, setAlignOn] = useState(true);
  const [absText, setAbsText] = useState('5');
  const [relText, setRelText] = useState('0.02');
  const [timeTolText, setTimeTolText] = useState('0.5');
  const [tol, setTol] = useState({ absTolM: 5, relTol: 0.02, timeTolS: 0.5 });
  const [tolError, setTolError] = useState<string | null>(null);
  const [ootIndex, setOotIndex] = useState(0);

  // Current resolved case key (S1): the overlay re-derives the same
  // snapshot the run store keys records by. Non-finite inputs fail closed.
  const overlaySnapshot: RunSnapshot | null = useMemo(() => {
    try {
      const case0: LaunchCase = { vehicle, motorId: selectedMotorId, options: OVERLAY_LAUNCH_OPTIONS };
      return snapshotCase(preflight(case0, customMotors));
    } catch {
      return null;
    }
  }, [vehicle, selectedMotorId, customMotors]);
  const overlayRunKey = overlaySnapshot?.runKey ?? 'unkeyable-invalid-inputs';

  // Qualification of the committed run, routed through the existing
  // pattern-8 contract: a pass badge requires valid + current inputs +
  // gate-pass; anything else carries its own qualified label. The overlay
  // attests the CASE inputs it re-derives (its fixed launch conditions), so
  // freshness compares the case-level runKey — ensemble methodology lives in
  // the capturing surface's snapshot, not the overlay's re-derivation.
  const chosenQual = chosen && overlaySnapshot !== null ? displayFor(chosen, overlaySnapshot) : null;
  const simBadge = chosenQual?.status ?? null;

  // The sim curve is drawn only for a completed, valid, freshness-current,
  // key-matched committed run — never for a stale/invalid/failed record.
  const simEligible =
    chosen !== null &&
    chosen.lifecycle === 'completed' &&
    chosen.valid &&
    chosen.freshness === 'current' &&
    chosen.runKey === overlayRunKey;

  const simCurve: { raw: TrajectorySample[]; grid: AltitudeSample[] } | null = useMemo(() => {
    if (!simEligible || chosen === null) return null;
    try {
      const launchCase: LaunchCase = { vehicle, motorId: selectedMotorId, options: OVERLAY_LAUNCH_OPTIONS };
      const resolved = preflight(launchCase, customMotors);
      if (!resolved.runnable) return null;
      const result: SixDofSimulationResult = simulate6DofFlight(vehicle, resolved.motor, {
        railLength: OVERLAY_LAUNCH_OPTIONS.railLengthM,
        railElevationDeg: OVERLAY_LAUNCH_OPTIONS.railElevationDeg,
        railAzimuthDeg: OVERLAY_LAUNCH_OPTIONS.railAzimuthDeg,
        windSpeedSurface: OVERLAY_LAUNCH_OPTIONS.windSpeedMps,
        windAzimuthDeg: OVERLAY_LAUNCH_OPTIONS.windAzimuthDeg,
        finCantAngleDeg: OVERLAY_LAUNCH_OPTIONS.finCantDeg,
        mainDeployAltitudeAGL: OVERLAY_LAUNCH_OPTIONS.mainDeployAltitudeM,
      });
      const raw = simTelemetryToAltitude(result.telemetry);
      const sorted = [...raw].sort((a, b) => a.timeS - b.timeS);
      const grid: AltitudeSample[] = [];
      let lastT = Number.NEGATIVE_INFINITY;
      for (const s of sorted) {
        const t = Math.round(s.timeS / DISPLAY_DT_S) * DISPLAY_DT_S;
        if (t > lastT) {
          grid.push({ timeS: t, altitudeM: s.altitudeM });
          lastT = t;
        }
      }
      return grid.length > 0 ? { raw, grid } : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle, selectedMotorId, customMotors, simEligible, chosenRunId, runRecords]);

  const simGrid: AltitudeSample[] | null = simCurve?.grid ?? null;
  const simRaw: TrajectorySample[] | null = simCurve?.raw ?? null;
  const simApogee = useMemo(() => (simGrid && simGrid.length > 0 ? apogeeOf(simGrid) : null), [simGrid]);

  const ingest = (): void => {
    const text = paste.trim();
    if (text === '') {
      setIngestError('Paste a flight log first — altimeter CSV or GPX track XML.');
      return;
    }
    try {
      let samples: AltitudeSample[];
      let source: FlightLog['source'];
      if (text.startsWith('<')) {
        const fixes = parseGpxTrack(text);
        if (fixes.length === 0) throw new Error('parseGpxTrack: no track points found');
        const { enu } = gpsToEnu(fixes);
        samples = gpsAltitudeSeries(enu).map((s) => ({ timeS: s.timeS, altitudeM: s.altitudeM }));
        source = 'gpx';
      } else {
        samples = parseAltimeterCsv(text);
        source = 'csv';
      }
      if (samples.length === 0) throw new Error('ingest: no usable altitude samples');
      const sorted = [...samples].sort((a, b) => a.timeS - b.timeS);
      const t0 = sorted[0].timeS;
      const norm = sorted.map((s) => ({ timeS: s.timeS - t0, altitudeM: s.altitudeM }));
      // Q4: regrid to the display grid at ingest; keep first occurrence per cell.
      const grid: AltitudeSample[] = [];
      let lastCell = Number.NEGATIVE_INFINITY;
      for (const s of norm) {
        const cell = Math.round(s.timeS / DISPLAY_DT_S);
        if (cell > lastCell) {
          grid.push({ timeS: cell * DISPLAY_DT_S, altitudeM: s.altitudeM });
          lastCell = cell;
        }
      }
      idRef.current += 1;
      const id = `flight-${idRef.current}`;
      const { apogeeM, apogeeS } = apogeeOf(grid);
      const name = `Flight ${logs.length + 1} (${source.toUpperCase()})`;
      setLogs((prev) => [...prev, { id, name, source, samples: grid, apogeeM, apogeeS }]);
      setCurrentId(id); // newest ingest auto-promotes to current (pattern 6)
      setLayers((prev) => ({ ...prev, [id]: true }));
      if (compareSel === '' && baselineSel !== id) setCompareSel(id);
      setPaste('');
      setIngestError(null);
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleLayer = (key: string): void => setLayers((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }));

  // ---- inspect plot model ----
  const inspectSeries = useMemo(() => {
    const list: Array<{ key: string; label: string; color: string; dashed: boolean; samples: AltitudeSample[]; apogee: { apogeeM: number; apogeeS: number } | null }> = [];
    if (simGrid && simApogee && (layers.sim ?? false)) {
      list.push({ key: 'sim', label: `Sim (${chosen?.runKey.slice(0, 8) ?? 'run'})`, color: SIM_COLOR, dashed: false, samples: simGrid, apogee: simApogee });
    }
    logs.forEach((log, i) => {
      if (layers[log.id] ?? false) {
        list.push({ key: log.id, label: log.name, color: LOG_COLORS[i % LOG_COLORS.length], dashed: true, samples: log.samples, apogee: { apogeeM: log.apogeeM, apogeeS: log.apogeeS } });
      }
    });
    return list;
  }, [simGrid, simApogee, logs, layers, chosen]);

  const inspectDomain = useMemo(() => {
    let t0 = Number.POSITIVE_INFINITY;
    let t1 = Number.NEGATIVE_INFINITY;
    let v1 = Number.NEGATIVE_INFINITY;
    for (const s of inspectSeries) {
      for (const p of s.samples) {
        if (p.timeS < t0) t0 = p.timeS;
        if (p.timeS > t1) t1 = p.timeS;
        if (p.altitudeM > v1) v1 = p.altitudeM;
      }
    }
    if (t0 === Number.POSITIVE_INFINITY) return null;
    return { t0, t1, v0: 0, v1: v1 * 1.05 || 1 };
  }, [inspectSeries]);

  const plotClick = (e: React.MouseEvent<SVGSVGElement>, s: Scales): void => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const t = s.minT + frac * (s.maxT - s.minT);
    setCursorT(Math.round(t / DISPLAY_DT_S) * DISPLAY_DT_S);
  };

  // ---- compare model ----
  const seriesFor = (sel: string): TrajectorySample[] | null => {
    if (sel === 'sim') return simRaw;
    return logs.find((l) => l.id === sel)?.samples ?? null;
  };
  const compareOutcome: { result: CompareResult } | { error: string } | null = useMemo(() => {
    const base = seriesFor(baselineSel);
    const cmp = seriesFor(compareSel);
    if (!base || !cmp || base.length === 0 || cmp.length === 0) return null;
    try {
      return {
        result: compareAltitudeSeries(base, cmp, {
          sync,
          interp,
          tolerance: tol,
          align: alignOn,
        }),
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineSel, compareSel, sync, interp, tol, alignOn, simGrid, logs]);

  const result = compareOutcome && 'result' in compareOutcome ? compareOutcome.result : null;
  const compareError = compareOutcome && 'error' in compareOutcome ? compareOutcome.error : null;
  const safeOot = result && result.regions.length > 0 ? Math.min(ootIndex, result.regions.length - 1) : 0;

  const applyTol = (field: 'absTolM' | 'relTol' | 'timeTolS', text: string): void => {
    const v = Number(text);
    if (text.trim() === '' || !Number.isFinite(v) || v < 0) {
      setTolError('Tolerances must be non-negative numbers (meters, fraction, seconds).');
      return;
    }
    setTolError(null);
    setTol((prev) => ({ ...prev, [field]: v }));
  };

  const gotoRegion = (i: number): void => {
    if (!result || result.regions.length === 0) return;
    const clamped = Math.max(0, Math.min(result.regions.length - 1, i));
    setOotIndex(clamped);
    setCursorT(Math.round(((result.regions[clamped].startT + result.regions[clamped].endT) / 2 / DISPLAY_DT_S)) * DISPLAY_DT_S);
  };

  const pickerOptions = (
    <>
      {simGrid && <option value="sim">Sim — committed run ({simApogee?.apogeeM.toFixed(0)} m apogee)</option>}
      {logs.map((l) => (
        <option key={l.id} value={l.id}>{l.name} — {l.apogeeM.toFixed(0)} m apogee</option>
      ))}
    </>
  );
  const selectClass =
    'bg-zinc-900/80 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-700 text-[10px] font-mono focus-visible:border-cyan-400 focus-visible:outline-none';

  return (
    <section aria-label="Sim versus flight overlay" className="bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Scale className="w-4 h-4 text-cyan-300" />
        <h3 className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">Sim vs Flight Overlay</h3>
        <span className="text-[9px] text-zinc-500 font-mono">audit F4 · analysis-only, never mutates the model</span>
        <div role="tablist" aria-label="Overlay panes" className="ml-auto flex gap-1">
          <button
            role="tab"
            aria-selected={pane === 'inspect'}
            aria-controls="overlay-inspect-panel"
            onClick={() => setPane('inspect')}
            className={`min-h-8 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider font-mono cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${pane === 'inspect' ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200' : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}
          >
            <Layers className="w-3 h-3 inline mr-1" />Inspect
          </button>
          <button
            role="tab"
            aria-selected={pane === 'compare'}
            aria-controls="overlay-compare-panel"
            onClick={() => setPane('compare')}
            className={`min-h-8 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider font-mono cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${pane === 'compare' ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200' : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}
          >
            <Scale className="w-3 h-3 inline mr-1" />Compare
          </button>
        </div>
      </div>

      {!simGrid && !chosen && (
        <div role="status" className="p-2.5 bg-amber-950/40 rounded-xl border border-amber-500/30 text-amber-300 text-[10px] font-mono">
          No committed simulation run yet — open Trajectory and run a case. Flight logs can still be ingested below.
        </div>
      )}

      {pane === 'inspect' && (
        <div id="overlay-inspect-panel" role="tabpanel" aria-label="Inspect runs" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider font-mono inline-flex items-center gap-1">
                <Archive className="w-3 h-3" />Run archive
              </h4>
              {runRecords.length === 0 && <p className="text-[10px] text-zinc-500 font-mono">No sim runs yet — run a case in Trajectory Studio.</p>}
              {simGrid && (
                <label className="flex items-center gap-2 p-2 bg-zinc-900/90 rounded-lg border border-cyan-500/30 text-[10px] font-mono cursor-pointer">
                  <input type="checkbox" checked={layers.sim ?? false} onChange={() => toggleLayer('sim')} aria-label="Layer simulated altitude" className="accent-cyan-400" />
                  <span className="inline-block w-4 h-0 border-t-2" style={{ borderColor: SIM_COLOR }} />
                  <span className="text-zinc-200">Sim [current]</span>
                </label>
              )}
              {chosen && (
                <div className={`p-2 rounded-lg border text-[10px] font-mono space-y-1 ${simEligible ? 'bg-zinc-900/90 border-cyan-500/40' : 'bg-zinc-900/60 border-zinc-800'}`}>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={simBadge?.status ?? 'unknown'} label={simBadge?.label ?? 'No gate evaluated'} />
                  </div>
                  {chosenQual && (
                    <div data-run-record-fields="true" className="flex flex-wrap gap-1.5">
                      <StatusBadge status={chosenQual.fields.execution.status} label={chosenQual.fields.execution.label} />
                      <StatusBadge status={chosenQual.fields.validity.status} label={chosenQual.fields.validity.label} />
                      <StatusBadge status={chosenQual.fields.freshness.status} label={chosenQual.fields.freshness.label} />
                      <StatusBadge status={chosenQual.fields.gate.status} label={chosenQual.fields.gate.label} />
                    </div>
                  )}
                  <p className="text-zinc-500">key {chosen.runKey.slice(0, 16)}… · {chosen.label}</p>
                  {simEligible
                    ? <p className="text-emerald-400">sim curve: deterministic re-derivation of the committed case (key-matched)</p>
                    : <p role="status" className="text-amber-300">Sim curve withheld — {simMoreoverNote(chosen, overlayRunKey)}</p>}
                </div>
              )}
              {runRecords.filter((r) => r.runId !== chosenRunId).length > 0 && (
                <p className="text-[9px] text-zinc-600 font-mono">Archived runs (append-only, never rewritten):</p>
              )}
              {runRecords.filter((r) => r.runId !== chosenRunId).map((r) => {
                // Registry freshness derives from the published COMPLETE
                // dependency snapshot (Astra P0-1): an MC input edit stales
                // every row with a reason, never only after a rerun.
                const q = displayFor(r, currentSnapshot ?? undefined);
                return (
                  <div key={r.runId} className="p-2 rounded-lg border bg-zinc-900/60 border-zinc-800 text-[10px] font-mono space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-zinc-300 truncate">{r.label}</span>
                      <div className="flex gap-2">
                        <StatusBadge status={q.status.status} label={q.status.label} />
                        {r.lifecycle === 'completed' && (
                          <button onClick={() => { useRunStore.getState().chooseRun(r.runId); }} aria-label={`Make ${r.label} current`} className="text-violet-300 hover:text-violet-100 underline underline-offset-2 cursor-pointer">Make current</button>
                        )}
                      </div>
                    </div>
                    <div data-run-registry-fields="true" className="flex flex-wrap gap-1.5">
                      <StatusBadge status={q.fields.execution.status} label={q.fields.execution.label} />
                      <StatusBadge status={q.fields.validity.status} label={q.fields.validity.label} />
                      <StatusBadge status={q.fields.freshness.status} label={q.fields.freshness.label} />
                      <StatusBadge status={q.fields.gate.status} label={q.fields.gate.label} />
                    </div>
                    <p className="text-zinc-500">key {r.runKey.slice(0, 16)}… · {r.caseId}</p>
                  </div>
                );
              })}
              {logs.length === 0 && <p className="text-[10px] text-zinc-500 font-mono">No flight logs yet — paste one below.</p>}
              {logs.map((log, i) => (
                <div key={log.id} className={`p-2 rounded-lg border text-[10px] font-mono space-y-1 ${log.id === currentId ? 'bg-zinc-900/90 border-violet-500/40' : 'bg-zinc-900/60 border-zinc-800'}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={layers[log.id] ?? false} onChange={() => toggleLayer(log.id)} aria-label={`Layer ${log.name}`} className="accent-violet-400" />
                    <span className="inline-block w-4 h-0 border-t-2 border-dashed" style={{ borderColor: LOG_COLORS[i % LOG_COLORS.length] }} />
                    <span className="text-zinc-200">{log.name}{log.id === currentId ? ' [current]' : ''}</span>
                  </label>
                  <p className="text-zinc-500 pl-6">apogee {log.apogeeM.toFixed(1)} m @ {log.apogeeS.toFixed(1)} s · {log.samples.length} pts</p>
                  <div className="flex gap-2 pl-6">
                    {log.id !== currentId && (
                      <button onClick={() => setCurrentId(log.id)} aria-label={`Make ${log.name} current`} className="text-violet-300 hover:text-violet-100 underline underline-offset-2 cursor-pointer">Make current</button>
                    )}
                    <button
                      onClick={() => {
                        setLogs((prev) => prev.filter((l) => l.id !== log.id));
                        if (currentId === log.id) setCurrentId(null);
                        if (compareSel === log.id) setCompareSel('');
                        if (baselineSel === log.id) setBaselineSel('sim');
                      }}
                      className="text-zinc-500 hover:text-rose-300 underline underline-offset-2 cursor-pointer"
                      aria-label={`Remove ${log.name}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="space-y-2">
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  aria-label="Flight log data (CSV or GPX)"
                  placeholder={'time_s,altitude_m\n0.0,12.0\n…  — or paste GPX track XML'}
                  spellCheck={false}
                  className="w-full min-h-20 h-20 bg-zinc-900/80 text-zinc-100 px-2.5 py-2 rounded-lg border border-zinc-700 focus-visible:border-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 text-[10px] font-mono resize-y"
                />
                <button
                  onClick={ingest}
                  className="min-h-8 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 hover:bg-violet-500/25 text-[10px] font-bold uppercase tracking-wider font-mono cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                >
                  Add flight log
                </button>
                {ingestError && <div role="alert" className="p-2 bg-rose-950/60 rounded-lg border border-rose-500/40 text-rose-300 text-[10px] font-mono">{ingestError}</div>}
              </div>
            </div>

            <div className="space-y-2">
              {inspectDomain ? (
                <>
                  <InspectPlot series={inspectSeries} domain={inspectDomain} cursorT={cursorT} onPlotClick={plotClick} />
                  <CursorControl
                    domain={inspectDomain}
                    cursorT={cursorT}
                    onChange={setCursorT}
                    series={inspectSeries}
                  />
                </>
              ) : (
                <p role="status" className="text-[10px] text-zinc-500 font-mono p-4 border border-dashed border-zinc-800 rounded-lg">
                  Nothing layered — layer the sim or a flight log to plot.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {pane === 'compare' && (
        <div id="overlay-compare-panel" role="tabpanel" aria-label="Compare runs" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[10px] text-zinc-400 font-mono space-y-1">
              <span className="block font-semibold">Baseline</span>
              <select value={baselineSel} onChange={(e) => setBaselineSel(e.target.value)} aria-label="Baseline series" className={selectClass}>{pickerOptions}</select>
            </label>
            <label className="text-[10px] text-zinc-400 font-mono space-y-1">
              <span className="block font-semibold">Compare to</span>
              <select value={compareSel} onChange={(e) => { setCompareSel(e.target.value); setOotIndex(0); }} aria-label="Compare-to series" className={selectClass}>
                <option value="">— pick —</option>
                {pickerOptions}
              </select>
            </label>
            <button
              onClick={() => setAlignOn((v) => !v)}
              aria-pressed={alignOn}
              title={alignOn ? 'Alignment on: apogee-match. Switch off to show raw times.' : 'Alignment off: raw times. Switch on for apogee-match.'}
              className="min-h-8 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 text-[10px] font-bold font-mono inline-flex items-center gap-1 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              {alignOn ? <Link2 className="w-3 h-3 text-emerald-400" /> : <Unlink className="w-3 h-3 text-amber-400" />}
              {alignOn ? 'Aligned' : 'Unaligned'}
            </button>
            <label className="text-[10px] text-zinc-400 font-mono space-y-1">
              <span className="block font-semibold">Sync</span>
              <select value={sync} onChange={(e) => setSync(e.target.value as SyncMode)} aria-label="Synchronization mode" className={selectClass}>
                <option value="union">union (recommended)</option>
                <option value="intersection">intersection</option>
              </select>
            </label>
            <label className="text-[10px] text-zinc-400 font-mono space-y-1">
              <span className="block font-semibold">Interpolate</span>
              <select value={interp} onChange={(e) => setInterp(e.target.value as InterpMode)} aria-label="Interpolation mode" className={selectClass}>
                <option value="linear">linear</option>
                <option value="zoh">zero-order hold</option>
              </select>
            </label>
            <label className="text-[10px] text-zinc-400 font-mono space-y-1">
              <span className="block font-semibold">Abs tol (m)</span>
              <input value={absText} onChange={(e) => setAbsText(e.target.value)} onBlur={(e) => applyTol('absTolM', e.target.value)} aria-label="Absolute tolerance meters" inputMode="decimal" className="w-20 bg-zinc-900/80 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-700 text-[10px] font-mono" />
            </label>
            <label className="text-[10px] text-zinc-400 font-mono space-y-1">
              <span className="block font-semibold">Rel tol</span>
              <input value={relText} onChange={(e) => setRelText(e.target.value)} onBlur={(e) => applyTol('relTol', e.target.value)} aria-label="Relative tolerance fraction" inputMode="decimal" className="w-20 bg-zinc-900/80 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-700 text-[10px] font-mono" />
            </label>
            <label className="text-[10px] text-zinc-400 font-mono space-y-1">
              <span className="block font-semibold">Time tol (s)</span>
              <input value={timeTolText} onChange={(e) => setTimeTolText(e.target.value)} onBlur={(e) => applyTol('timeTolS', e.target.value)} aria-label="Time tolerance seconds" inputMode="decimal" className="w-20 bg-zinc-900/80 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-700 text-[10px] font-mono" />
            </label>
          </div>
          {tolError && <div role="alert" className="p-2 bg-rose-950/60 rounded-lg border border-rose-500/40 text-rose-300 text-[10px] font-mono">{tolError}</div>}

          {!result && !compareError && (
            <p role="status" className="text-[10px] text-zinc-500 font-mono p-4 border border-dashed border-zinc-800 rounded-lg">
              Pick a baseline and a compare-to series to run the four-stage compare (align → sync → interpolate → tolerance).
            </p>
          )}
          {compareError && <div role="alert" className="p-2 bg-rose-950/60 rounded-lg border border-rose-500/40 text-rose-300 text-[10px] font-mono">{compareError}</div>}
          {result && (
            <CompareView
              result={result}
              cursorT={cursorT}
              onPlotClick={plotClick}
              ootIndex={safeOot}
              onGotoRegion={gotoRegion}
            />
          )}
        </div>
      )}

      <p className="text-[9px] text-zinc-600 font-mono leading-snug">
        Display grid {DISPLAY_DT_S.toFixed(1)} s (Q4). Tolerance edits re-run on blur. Sim curve = deterministic re-derivation of the
        committed case, drawn only while the committed run record is valid, current, and key-matched ({chosen && simBadge ? simBadge.label.toLowerCase() : 'no committed run'}).
        Calibration candidates stay analysis-only until consumed in the Calibration card — this surface never writes the vehicle, motor, or sim run.
      </p>
    </section>
  );
}

/** Why the committed run's curve is withheld (pattern-8 honesty, no guessing). */
function simMoreoverNote(chosen: { lifecycle: string; valid: boolean; freshness: string; runKey: string }, overlayRunKey: string): string {
  if (chosen.lifecycle !== 'completed') return 'the committed run did not complete';
  if (!chosen.valid) return 'inputs are invalid — repair and rerun';
  if (chosen.freshness !== 'current') return 'a newer run superseded it — rerun to restore';
  if (chosen.runKey !== overlayRunKey) return 'committed inputs differ from the current case — rerun to restore';
  return 'engine could not reproduce it';
}

function InspectPlot(props: {
  series: Array<{ key: string; label: string; color: string; dashed: boolean; samples: AltitudeSample[]; apogee: { apogeeM: number; apogeeS: number } | null }>;
  domain: { t0: number; t1: number; v0: number; v1: number };
  cursorT: number | null;
  onPlotClick: (e: React.MouseEvent<SVGSVGElement>, s: Scales) => void;
}): React.JSX.Element {
  const h = 240;
  const s = makeScales(props.domain.t0, props.domain.t1, props.domain.v0, props.domain.v1, h);
  return (
    <svg
      viewBox={`0 0 ${PLOT_W} ${h}`}
      role="img"
      aria-label={`Altitude overlay: ${props.series.map((x) => x.label).join(', ')}`}
      onClick={(e) => props.onPlotClick(e, s)}
      className="w-full bg-zinc-900/80 rounded-lg border border-zinc-800 cursor-crosshair"
    >
      <AxisLabels s={s} h={h} unit="m" />
      {props.series.map((entry) => (
        <g key={entry.key}>
          <path
            d={pathOf(decimate(entry.samples).map((p) => ({ t: p.timeS, v: p.altitudeM })), s)}
            fill="none"
            stroke={entry.color}
            strokeWidth="1.5"
            strokeDasharray={entry.dashed ? '5 3' : undefined}
          />
          {entry.apogee && (
            <circle cx={s.x(entry.apogee.apogeeS)} cy={s.y(entry.apogee.apogeeM)} r="3" fill={entry.color} stroke="#09090b" strokeWidth="1">
              <title>{`${entry.label} apogee ${entry.apogee.apogeeM.toFixed(1)} m @ ${entry.apogee.apogeeS.toFixed(1)} s`}</title>
            </circle>
          )}
        </g>
      ))}
      {props.cursorT !== null && props.cursorT >= s.minT && props.cursorT <= s.maxT && (
        <line x1={s.x(props.cursorT)} y1={8} x2={s.x(props.cursorT)} y2={h - 20} stroke="#e4e4e7" strokeWidth="1" strokeDasharray="2 2" />
      )}
    </svg>
  );
}

function CursorControl(props: {
  domain: { t0: number; t1: number; v0: number; v1: number };
  cursorT: number | null;
  onChange: (t: number | null) => void;
  series: Array<{ key: string; label: string; color: string; samples: AltitudeSample[] }>;
}): React.JSX.Element {
  const ct = props.cursorT;
  const t = ct ?? props.domain.t0;
  return (
    <div className="p-2.5 bg-zinc-900/90 rounded-lg border border-zinc-800/80 space-y-1.5">
      <label className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
        <Crosshair className="w-3 h-3 text-zinc-500" />
        <span className="font-semibold">Time cursor (shared across panes)</span>
        <input
          type="range"
          min={props.domain.t0}
          max={props.domain.t1}
          step={DISPLAY_DT_S}
          value={Math.max(props.domain.t0, Math.min(props.domain.t1, t))}
          onChange={(e) => props.onChange(Number(e.target.value))}
          aria-label="Overlay time cursor seconds"
          className="flex-1 accent-cyan-400"
        />
        <span className="text-zinc-200 w-16 text-right">{fmt(props.cursorT, 1)} s</span>
        <button onClick={() => props.onChange(null)} aria-label="Clear time cursor" className="text-zinc-500 hover:text-zinc-200 underline underline-offset-2 cursor-pointer">Clear</button>
      </label>
      {ct !== null && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono" aria-live="polite">
          {props.series.map((entry) => (
            <div key={entry.key} className="flex gap-1.5">
              <dt className="text-zinc-500">{entry.label}:</dt>
              <dd style={{ color: entry.color }}>{fmt(readAt(entry.samples, ct), 1)} m</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-[9px] text-zinc-600 font-mono">Cursor values are display-grid (0.1 s) interpolations. Click the plot to place the cursor.</p>
    </div>
  );
}

function CompareView(props: {
  result: CompareResult;
  cursorT: number | null;
  onPlotClick: (e: React.MouseEvent<SVGSVGElement>, s: Scales) => void;
  ootIndex: number;
  onGotoRegion: (i: number) => void;
}): React.JSX.Element {
  const { result } = props;
  const topH = 220;
  const botH = 140;
  const pts = useMemo(() => decimate(result.points, 1200), [result]);
  const compared = result.points.filter((p) => p.compared);
  const t0 = result.points.length > 0 ? result.points[0].t : 0;
  const t1 = result.points.length > 0 ? result.points[result.points.length - 1].t : 1;
  const vmax = Math.max(...compared.map((p) => Math.max(p.upper, p.compare, p.baseline)), 1);
  const top = makeScales(t0, t1, 0, vmax * 1.05, topH);
  const dmax = Math.max(1, ...compared.map((p) => Math.max(Math.abs(p.upper - p.baseline), Math.abs(p.lower - p.baseline), Math.abs(p.diff))));
  const bot = makeScales(t0, t1, -dmax * 1.15, dmax * 1.15, botH);
  const cell = pts.length > 1 ? (PLOT_W - 36) / pts.length : 1;

  const bandPath = pts.length > 0
    ? `${pathOf(pts.filter((p) => p.compared).map((p) => ({ t: p.t, v: p.upper })), top)} ${pathOf([...pts.filter((p) => p.compared)].reverse().map((p) => ({ t: p.t, v: p.lower })), top).replace(/^M/, 'L')} Z`
    : '';
  const diffBandPath = pts.length > 0
    ? `${pathOf(pts.filter((p) => p.compared).map((p) => ({ t: p.t, v: p.upper - p.baseline })), bot)} ${pathOf([...pts.filter((p) => p.compared)].reverse().map((p) => ({ t: p.t, v: p.lower - p.baseline })), bot).replace(/^M/, 'L')} Z`
    : '';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono" role="status" aria-live="polite">
        <span className={`px-2 py-0.5 rounded-full border ${result.aligned ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-amber-500/10 border-amber-500/40 text-amber-300'}`}>
          {result.aligned ? `Aligned · apogee-match +${result.timeOffsetS.toFixed(1)}s` : 'Unaligned — raw times, deltas withheld'}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200">
          {result.nMatch} Match / {result.nMismatch} Mismatch / {result.nNotCompared} Not compared
        </span>
        {result.aligned && (
          <>
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-cyan-300">Δapogee {fmt(result.apogeeDeltaM, 1)} m</span>
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-cyan-300">
              Δburnout {result.burnoutVelDeltaMs === null ? 'n/a (log has no velocity)' : `${result.burnoutVelDeltaMs.toFixed(1)} m/s`}
            </span>
          </>
        )}
      </div>

      <svg viewBox={`0 0 ${PLOT_W} ${topH}`} role="img" aria-label={`Compare plot: ${result.nMatch} match, ${result.nMismatch} mismatch`} onClick={(e) => props.onPlotClick(e, top)} className="w-full bg-zinc-900/80 rounded-lg border border-zinc-800 cursor-crosshair">
        <AxisLabels s={top} h={topH} unit="m" />
        {bandPath !== '' && bandPath !== '  Z' && <path d={bandPath} fill="#34d399" opacity="0.15" />}
        <path d={pathOf(pts.filter((p) => p.compared).map((p) => ({ t: p.t, v: p.baseline })), top)} fill="none" stroke={SIM_COLOR} strokeWidth="1.5" />
        <path d={pathOf(pts.filter((p) => p.compared).map((p) => ({ t: p.t, v: p.compare })), top)} fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="5 3" />
        {props.cursorT !== null && <line x1={top.x(props.cursorT)} y1={8} x2={top.x(props.cursorT)} y2={topH - 20} stroke="#e4e4e7" strokeWidth="1" strokeDasharray="2 2" />}
      </svg>

      <svg viewBox={`0 0 ${PLOT_W} ${botH}`} role="img" aria-label={`Signed difference: ${result.regions.length} out-of-tolerance regions`} onClick={(e) => props.onPlotClick(e, bot)} className="w-full bg-zinc-900/80 rounded-lg border border-zinc-800 cursor-crosshair">
        <AxisLabels s={bot} h={botH} unit="m" />
        <line x1={28} y1={bot.y(0)} x2={PLOT_W - 8} y2={bot.y(0)} stroke="#52525b" strokeWidth="1" />
        {diffBandPath !== '' && diffBandPath !== '  Z' && <path d={diffBandPath} fill="#34d399" opacity="0.12" />}
        {pts.map((p, i) => (
          p.compared
            ? <rect key={i} x={bot.x(p.t) - cell / 2} y={8} width={Math.max(cell, 0.5)} height={5} fill={p.pass ? '#34d399' : '#f43f5e'} opacity="0.9"><title>{`${p.pass ? 'pass' : 'fail'} @ ${p.t.toFixed(1)}s`}</title></rect>
            : null
        ))}
        <path d={pathOf(pts.filter((p) => p.compared).map((p) => ({ t: p.t, v: p.diff })), bot)} fill="none" stroke="#a78bfa" strokeWidth="1.5" />
        {props.cursorT !== null && <line x1={bot.x(props.cursorT)} y1={8} x2={bot.x(props.cursorT)} y2={botH - 20} stroke="#e4e4e7" strokeWidth="1" strokeDasharray="2 2" />}
      </svg>

      <div
        className="flex flex-wrap items-center gap-2 text-[10px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded-lg"
        tabIndex={0}
        role="group"
        aria-label="Out-of-tolerance region navigation (arrow keys step regions)"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') props.onGotoRegion(props.ootIndex + 1);
          if (e.key === 'ArrowLeft') props.onGotoRegion(props.ootIndex - 1);
        }}
      >
        <button
          onClick={() => props.onGotoRegion(props.ootIndex - 1)}
          disabled={result.regions.length === 0}
          aria-label="Previous out-of-tolerance region"
          className="min-h-8 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-3 h-3" />Prev OOT
        </button>
        <span role="status" className="text-zinc-300">
          {result.regions.length === 0 ? 'No out-of-tolerance regions' : `Region ${props.ootIndex + 1} of ${result.regions.length} (${result.regions[props.ootIndex].startT.toFixed(1)}–${result.regions[props.ootIndex].endT.toFixed(1)} s)`}
        </span>
        <button
          onClick={() => props.onGotoRegion(props.ootIndex + 1)}
          disabled={result.regions.length === 0}
          aria-label="Next out-of-tolerance region"
          className="min-h-8 px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1"
        >
          Next OOT<ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}