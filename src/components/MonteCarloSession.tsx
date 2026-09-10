/**
 * Competition Monte Carlo session (plan §5, Q12).
 *
 * Hosts the 500–1000-run "competition ensemble" behind a Vite module worker:
 *   new Worker(new URL('../sim/monteCarloWorker.ts', import.meta.url), { type: 'module' })
 * with a main-thread chunked fallback when Worker is unavailable (jsdom,
 * locked-down embedded browsers). The worker computes ONE chunk of the
 * ensemble per request; this session drives absolute chunk indices
 * sequentially, so progress is real completed runs (no fake progress bar)
 * and Cancel stops at a safe chunk boundary. Partial ensembles are labeled
 * PARTIAL and reduced from completed chunks only — partial ≠ final, never
 * blurred (spec §6).
 *
 * Determinism: chunks derive per-run sub-seeds from the shared master seed
 * (subSeedOf), so any partition of the same (inputs, nRuns, seed) — worker
 * or main thread — reproduces the identical ensemble, identical to
 * runMonteCarlo. The FRESH/STALE badge folds the host's every-input key
 * plus this session's run count.
 */

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  accumulateMonteCarloChunks,
  computeDispersionStatistics,
  finalizeMonteCarloChunks,
  runMonteCarloChunk,
  DispersionResult,
  LandingPoint,
  MonteCarloChunkResult,
} from '../sim/monteCarlo';
import type { RocketVehicle } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import type { SixDofOptions } from '../sim/sixDofSimulator';
import { useRocketStore } from '../store/rocketStore';
import { AlertTriangle, CheckCircle2, Play, Square, Target } from 'lucide-react';

export interface MonteCarloSessionProps {
  vehicle: RocketVehicle;
  motor: MotorSpec;
  perturbations: { windAzimuthDegSigma: number; railAngleDegSigma: number; impulsePctSigma: number };
  seed: number;
  /** Surface wind feeding the sim's windSpeedSurface slot. */
  wind: { speedMs: number; directionFromDeg: number };
  /** Host-side every-input staleness key (vehicle, motor, sigmas, wind rows, probe, sounding). */
  staleKey: string;
  /** Runs per chunk. 8 ≈ a few hundred ms per worker round-trip. */
  chunkSize?: number;
}

/** Imperative handle so the host can trigger/cancel without owning state. */
export interface MonteCarloSessionHandle {
  run: () => void;
  cancel: () => void;
}

interface SessionState {
  status: 'idle' | 'running' | 'done';
  /** Absolute runs completed so far (successes + failures). */
  doneRuns: number;
  failedRuns: number;
  /** Completed or cancelled-partial ensemble stats; null before the first chunk. */
  result: DispersionResult | null;
  /** True when the shown result is a CANCELLED partial ensemble. */
  partial: boolean;
  error: string | null;
}

const COMPETITION_MIN_RUNS = 500;
const COMPETITION_MAX_RUNS = 1000;
const DEFAULT_CHUNK_SIZE = 8;

const clampCompetitionRuns = (raw: number): number =>
  Math.min(COMPETITION_MAX_RUNS, Math.max(COMPETITION_MIN_RUNS, Math.floor(raw)));

/** SixDofOptions mirroring the host's MC section (vertical rail, fixed deployment). */
function buildEnsembleOptions(wind: { speedMs: number; directionFromDeg: number }): SixDofOptions {
  return {
    railLength: 2.4,
    railElevationDeg: 90.0,
    railAzimuthDeg: 90.0,
    windSpeedSurface: wind.speedMs,
    windAzimuthDeg: wind.directionFromDeg,
    mainDeployAltitudeAGL: 250,
    finCantAngleDeg: 0.0,
  };
}

/** Deterministic 48-segment ellipse path about the mean for the 1σ/2σ rings. */
function ellipsePath(
  cx: number,
  cy: number,
  sigma1: number,
  sigma2: number,
  thetaDeg: number,
  factor: number,
  scale: number,
): string {
  const theta = (thetaDeg * Math.PI) / 180.0;
  const a = Math.max(0, sigma1) * factor * scale;
  const b = Math.max(0, sigma2) * factor * scale;
  const parts: string[] = [];
  const segments = 48;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2.0 * Math.PI;
    const x = cx + Math.cos(theta) * Math.cos(t) * a - Math.sin(theta) * Math.sin(t) * b;
    const y = cy + Math.sin(theta) * Math.cos(t) * a + Math.cos(theta) * Math.sin(t) * b;
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `${parts.join(' ')} Z`;
}

function LandingScatter(props: {
  landings: LandingPoint[];
  mean: LandingPoint;
  sigma1: number;
  sigma2: number;
  thetaDeg: number;
}): React.JSX.Element {
  const { landings, mean, sigma1, sigma2, thetaDeg } = props;
  const width = 300;
  const height = 220;
  const pad = 18;

  const { scale, extent } = useMemo(() => {
    let extent = 5; // never collapse to a dot on a pad landing
    for (const p of landings) {
      extent = Math.max(extent, Math.abs(p.x - mean.x), Math.abs(p.y - mean.y));
    }
    extent = Math.max(extent, 2.4 * Math.max(sigma1, sigma2));
    const scale = Math.min((width - 2 * pad) / (2 * extent), (height - 2 * pad) / (2 * extent));
    return { scale, extent };
  }, [landings, mean, sigma1, sigma2]);

  const cx = width / 2;
  const cy = height / 2;
  const toX = (x: number): number => cx + (x - mean.x) * scale;
  const toY = (y: number): number => cy - (y - mean.y) * scale; // North up
  const ring1 = ellipsePath(cx, cy, sigma1, sigma2, thetaDeg, 1, scale);
  const ring2 = ellipsePath(cx, cy, sigma1, sigma2, thetaDeg, 2, scale);
  const points = landings.map((p, i) => (
    <circle key={i} cx={toX(p.x)} cy={toY(p.y)} r={1.4} fill="#a78bfa" fillOpacity="0.55" />
  ));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto bg-zinc-950/80 rounded-lg border border-zinc-800"
      role="img"
      aria-label={`Landing scatter: ${landings.length} runs, 1σ and 2σ containment rings, mean E ${mean.x.toFixed(0)} m N ${mean.y.toFixed(0)} m`}
    >
      <line x1={pad} y1={cy} x2={width - pad} y2={cy} stroke="#1e293b" strokeWidth="0.5" />
      <line x1={cx} y1={pad} x2={cx} y2={height - pad} stroke="#1e293b" strokeWidth="0.5" />
      <path d={ring2} fill="none" stroke="#22d3ee" strokeOpacity="0.45" strokeWidth="1" strokeDasharray="4 3" />
      <path d={ring1} fill="none" stroke="#22d3ee" strokeOpacity="0.85" strokeWidth="1.2" />
      {points}
      <circle cx={cx} cy={cy} r={2.4} fill="#22d3ee" />
      <line x1={cx - 4} y1={cy} x2={cx + 4} y2={cy} stroke="#22d3ee" strokeWidth="1" />
      <line x1={cx} y1={cy - 4} x2={cx} y2={cy + 4} stroke="#22d3ee" strokeWidth="1" />
      <text x={pad + 2} y={height - 6} fill="#71717a" fontSize="8" fontFamily="monospace">
        1σ / 2σ rings · extent ±{extent.toFixed(0)} m
      </text>
    </svg>
  );
}

/** Merge + reduce chunk landings without touching chunk order (run-ordered). */
function resultFromChunks(chunks: readonly MonteCarloChunkResult[]): DispersionResult {
  const acc = accumulateMonteCarloChunks(chunks);
  const stats = computeDispersionStatistics(acc.landings);
  return {
    ...stats,
    landings: acc.landings,
    successfulRuns: acc.landings.length,
    failedRuns: acc.failedRuns,
  };
}

/**
 * MonteCarloSession — forwardRef exposes run/cancel so the host keeps its
 * existing buttons and input controls; the session owns ensemble state.
 */
export const MonteCarloSession = forwardRef<MonteCarloSessionHandle, MonteCarloSessionProps>(
  function MonteCarloSession(
    { vehicle, motor, perturbations, seed, wind, staleKey, chunkSize = DEFAULT_CHUNK_SIZE },
    ref,
  ) {
    const setActiveRun = useRocketStore((s) => s.setActiveRun);
    const [nRuns, setNRuns] = useState<number>(COMPETITION_MIN_RUNS);
    const [state, setState] = useState<SessionState>({
      status: 'idle',
      doneRuns: 0,
      failedRuns: 0,
      result: null,
      partial: false,
      error: null,
    });

    const workerRef = useRef<Worker | null>(null);
    const chunksRef = useRef<MonteCarloChunkResult[]>([]);
    const runIdRef = useRef<number>(0);
    const cancelledRef = useRef<boolean>(false);
    const lastKeyRef = useRef<string | null>(null);

    const effectiveKey = `${staleKey}|runs=${nRuns}`;
    const resultsAreStale =
      state.result !== null && state.status === 'done' && !state.partial && lastKeyRef.current !== effectiveKey;

    // Cancel + teardown on unmount (host remounts on vehicle change): stop
    // the worker and clear the rail's run badge, never touch React state.
    useEffect(() => {
      return () => {
        cancelledRef.current = true;
        runIdRef.current += 1;
        workerRef.current?.terminate();
        workerRef.current = null;
        useRocketStore.getState().setActiveRun(null);
      };
    }, []);

    const finish = (cancelled: boolean, runId: number, chunks: MonteCarloChunkResult[]): void => {
      if (runIdRef.current !== runId) return; // superseded by a newer run/unmount
      workerRef.current?.terminate();
      workerRef.current = null;
      setActiveRun(null);
      const doneRuns = chunks.length > 0 ? chunks[chunks.length - 1].runEnd : 0;
      if (cancelled) {
        // Partial: stats come from completed chunks only. finalize would
        // reduce the same landings, but the all-failed throw must not fire
        // for a deliberate early stop — and the label must say PARTIAL.
        setState((s) => ({ ...s, status: 'done', doneRuns, result: resultFromChunks(chunks), partial: true, error: null }));
        return;
      }
      try {
        const final = finalizeMonteCarloChunks(chunks, nRuns);
        setState((s) => ({ ...s, status: 'done', doneRuns, result: final, partial: false, error: null }));
        lastKeyRef.current = effectiveKey;
      } catch (err) {
        setState((s) => ({
          ...s,
          status: 'done',
          doneRuns,
          result: null,
          partial: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    };

    const applyChunk = (runId: number, runEnd: number, chunk: MonteCarloChunkResult): void => {
      if (runIdRef.current !== runId || cancelledRef.current) return;
      chunksRef.current.push(chunk);
      const chunks = chunksRef.current;
      const acc = accumulateMonteCarloChunks(chunks);
      const doneRuns = runEnd;
      setState((s) => ({ ...s, status: 'running', doneRuns, failedRuns: acc.failedRuns, result: resultFromChunks(chunks) }));
      // Label carries identity only; the rail composes the percent from progress.
      setActiveRun({ kind: 'montecarlo', label: 'Monte Carlo', progress: doneRuns / nRuns });
      if (runIdRef.current !== runId || cancelledRef.current) return;
      if (runEnd >= nRuns) {
        finish(false, runId, chunks);
        return;
      }
      const nextIndex = chunks.length;
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'montecarlo:run',
          id: runId,
          request: {
            baseInput: { vehicle, motor, options: buildEnsembleOptions(wind) },
            perturbations,
            nRuns,
            seed,
            chunkIndex: nextIndex,
            chunkSize,
          },
        });
        return;
      }
      // Main-thread fallback: compute the next chunk after a yield so the UI
      // can paint progress and honor Cancel between chunks.
      setTimeout(() => {
        if (runIdRef.current !== runId || cancelledRef.current) return;
        const next = runMonteCarloChunk(
          { vehicle, motor, options: buildEnsembleOptions(wind) },
          perturbations,
          nRuns,
          seed,
          nextIndex,
          chunkSize,
        );
        applyChunk(runId, next.runEnd, next);
      }, 0);
    };

    const run = (): void => {
      if (state.status === 'running') return;
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      cancelledRef.current = false;
      chunksRef.current = [];
      setState((s) => ({ ...s, status: 'running', doneRuns: 0, failedRuns: 0, result: null, partial: false, error: null }));

      const baseInput = { vehicle, motor, options: buildEnsembleOptions(wind) };
      const startWithChunk = (chunkIndex: number): void => {
        if (runIdRef.current !== runId || cancelledRef.current) return;
        const first = runMonteCarloChunk(baseInput, perturbations, nRuns, seed, chunkIndex, chunkSize);
        applyChunk(runId, first.runEnd, first);
      };

      if (typeof Worker !== 'undefined') {
        try {
          const worker = new Worker(new URL('../sim/monteCarloWorker.ts', import.meta.url), { type: 'module' });
          workerRef.current = worker;
          worker.onmessage = (event: MessageEvent) => {
            const message = event.data;
            if (!message || message.type !== 'montecarlo:chunk' || message.id !== runId) return;
            if (cancelledRef.current || runIdRef.current !== runId) return;
            applyChunk(runId, message.result.runEnd, message.result);
          };
          worker.postMessage({
            type: 'montecarlo:run',
            id: runId,
            request: { baseInput, perturbations, nRuns, seed, chunkIndex: 0, chunkSize },
          });
          return;
        } catch {
          workerRef.current = null;
        }
      }
      // Fallback: no Worker constructor or construction failed.
      startWithChunk(0);
    };

    const cancel = (): void => {
      if (state.status !== 'running') return;
      cancelledRef.current = true;
      finish(true, runIdRef.current, chunksRef.current);
    };

    useImperativeHandle(ref, () => ({ run, cancel }));

    return (
      <div className="bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
          <Target className="w-3.5 h-3.5 text-violet-400" />
          <span>Competition Ensemble</span>
          <span className="text-[10px] text-zinc-500 font-normal">
            {COMPETITION_MIN_RUNS}–{COMPETITION_MAX_RUNS} runs · background worker · fixed seed
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap items-end gap-2">
          <label className="text-[10px] text-zinc-500 uppercase font-semibold">
            Runs ({COMPETITION_MIN_RUNS}–{COMPETITION_MAX_RUNS})
            <input
              type="number"
              min={COMPETITION_MIN_RUNS}
              max={COMPETITION_MAX_RUNS}
              step="25"
              value={nRuns}
              aria-label="Competition run count"
              disabled={state.status === 'running'}
              onChange={(e) => setNRuns(clampCompetitionRuns(parseFloat(e.target.value) || COMPETITION_MIN_RUNS))}
              className="mt-1 w-28 min-w-0 bg-zinc-800 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-600/80 focus:border-cyan-500 focus:outline-none font-mono text-right disabled:opacity-40"
            />
          </label>
          <button
            onClick={run}
            disabled={state.status === 'running'}
            aria-label="Run competition ensemble"
            className="min-h-9 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-400 hover:to-purple-500 text-zinc-950 font-bold text-xs shadow-lg shadow-violet-500/20 transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {state.status === 'running' ? 'Running…' : 'Run Ensemble'}
          </button>
          <button
            onClick={cancel}
            disabled={state.status !== 'running'}
            aria-label="Cancel competition ensemble"
            className="min-h-9 px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 font-bold text-xs transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            Cancel
          </button>
        </div>

        {/* Live chunk progress — real completed runs, not a fake bar. */}
        {state.status === 'running' && (
          <div
            className="mt-2.5"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={nRuns}
            aria-valuenow={state.doneRuns}
            aria-valuetext={`${state.doneRuns} of ${nRuns} runs completed`}
          >
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-violet-300">
                {state.doneRuns} / {nRuns} runs · {state.failedRuns} failed
              </span>
              <span className="text-zinc-400">{Math.round((state.doneRuns / nRuns) * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-[width] duration-150"
                style={{ width: `${(state.doneRuns / nRuns) * 100}%` }}
              />
            </div>
          </div>
        )}

        {state.error && (
          <div className="mt-2 p-2.5 bg-rose-950/40 rounded-lg border border-rose-500/40 text-rose-300 text-[11px] font-mono" role="alert">
            <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1.5" />
            Competition ensemble failed: {state.error}
          </div>
        )}

        {state.result && (
          <div className="mt-2.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-mono" role="status" aria-live="polite">
              {state.partial ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span className={state.partial ? 'text-amber-400' : 'text-emerald-400'}>
                {state.partial ? `PARTIAL — ${state.doneRuns}/${nRuns} runs before cancel; reduced from completed chunks only` : `${state.result.successfulRuns} succeeded · ${state.result.failedRuns} failed`}
              </span>
              {!state.partial && (
                <span
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${
                    resultsAreStale
                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                      : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                  }`}
                >
                  {resultsAreStale ? 'STALE — inputs changed since run' : 'FRESH — matches current inputs'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="grid grid-cols-2 gap-2 content-start">
                <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Mean Landing</div>
                  <div className="font-mono text-emerald-300" aria-label="Ensemble mean landing (m)">
                    E {state.result.mean.x.toFixed(1)} · N {state.result.mean.y.toFixed(1)} m
                  </div>
                </div>
                <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Sigma 1</div>
                  <div className="font-mono text-violet-300" aria-label="Ensemble sigma 1 (m)">
                    {state.result.sigma1.toFixed(1)} m
                  </div>
                </div>
                <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Sigma 2</div>
                  <div className="font-mono text-violet-300" aria-label="Ensemble sigma 2 (m)">
                    {state.result.sigma2.toFixed(1)} m
                  </div>
                </div>
                <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">r90</div>
                  <div className="font-mono text-zinc-100" aria-label="Ensemble r90 (m)">
                    {Number.isFinite(state.result.containmentRadii.r90) ? state.result.containmentRadii.r90.toFixed(0) : '—'} m
                  </div>
                </div>
              </div>
              <LandingScatter
                landings={state.result.landings}
                mean={state.result.mean}
                sigma1={state.result.sigma1}
                sigma2={state.result.sigma2}
                thetaDeg={state.result.thetaDeg}
              />
            </div>
          </div>
        )}
      </div>
    );
  },
);