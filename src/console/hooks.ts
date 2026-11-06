/**
 * Console hooks over the unified stores and the native bridge.
 *
 * Live stability comes from the native `stability` command; the async result
 * is cached by vehicle content so the synchronous 3D/2D layout functions can
 * read it. Change tracking, staleness and freshness all derive from the
 * committed project and the committed analysis records.
 */
import { useEffect, useMemo, useState } from 'react';
import type { RocketVehicle } from '../core/types';
import { analysisFreshness, useAnalysisStore } from '../state/analysis';
import { qualifyResult, type GateOutcome, type QualifiedResult } from '../application/resultState';
import { useProjectStore } from '../state/project';
import { useSessionStore, type SessionConsolePatch } from '../state/session';
import { diffDesigns, staleReasons, type Change } from './diff';
import { candidateInvocationMatches, contentKeyOf, currentRunKey, engineIsAvailable, useCommittedRun, type Design, type StageId } from './store';
import { designOf } from './design';
import { stabilityOfVehicle } from './data/adapter';
import { aggregateMassOf } from '../tauri/bridge';
import type { VehicleMassRollup } from '../core/mass';
import type { StabilityBreakdown } from './data/contract';
import type { Freshness } from './kit/Status';
import { CANDIDATE_REFUSAL } from '../application/candidate';
import { aeroModelKey, type AeroModelSelection } from '../application/aeroModel';
import { isCandidateFlightModel, resolveFlightModel } from '../application/flightModel';

/* ───────────── window size ───────────── */

/**
 * Live media query. Browsers and the desktop shell all implement matchMedia;
 * the fallback keeps non-DOM runners (jsdom) on the full desktop layout rather
 * than inventing a narrow viewport the test did not ask for.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/* ───────────── native stability, cached by vehicle content ───────────── */

interface StabilityEntry {
  status: 'loading' | 'ready' | 'error';
  breakdown?: StabilityBreakdown;
  /**
   * Native geometry+mass rollup for the same vehicle, fetched only when the
   * selected model publishes no labelled breakdown. It owns no aerodynamics:
   * the layout may use it, the CG/CP markers may not.
   */
  geometry?: VehicleMassRollup;
  geometryError?: string;
  error?: string;
}

const stabilityCache = new Map<string, StabilityEntry>();
const stabilityListeners = new Set<() => void>();

/** Settled keys are kept bounded; active (rendered) and in-flight keys are never evicted. */
export const STABILITY_CACHE_LIMIT = 48;
/** Minimum spacing between native stability dispatches during a burst. */
export const STABILITY_COALESCE_MS = 120;

interface PendingStabilityRequest {
  key: string;
  vehicle: RocketVehicle;
  aeroModel?: AeroModelSelection;
}

const stabilityActiveKeys = new Map<string, number>();
/** One pending target per cache key; re-requesting moves it to the newest slot. */
const pendingStability = new Map<string, PendingStabilityRequest>();
let coalesceTimer: number | null = null;
let requestInFlight = false;
let lastDispatchAt = 0;

/** Cache key: vehicle content plus the aero model that produced the answer. */
function stabilityKeyOf(vehicle: RocketVehicle, aeroModel?: AeroModelSelection): string {
  return `${contentKeyOf(vehicle)}|${aeroModel === undefined ? 'legacy' : aeroModelKey(aeroModel)}`;
}

function touchStability(key: string): void {
  const entry = stabilityCache.get(key);
  if (entry === undefined) return;
  stabilityCache.delete(key);
  stabilityCache.set(key, entry);
}

function trimStabilityCache(): void {
  if (stabilityCache.size <= STABILITY_CACHE_LIMIT) return;
  for (const [key, entry] of stabilityCache) {
    if (stabilityCache.size <= STABILITY_CACHE_LIMIT) break;
    if (entry.status === 'loading') continue;
    if ((stabilityActiveKeys.get(key) ?? 0) > 0) continue;
    stabilityCache.delete(key);
  }
}

function notifyStability(): void {
  for (const listener of stabilityListeners) listener();
}

/**
 * Geometry is fetched once per provider result that has no labelled breakdown.
 * It rides the same content-keyed entry as the stability result, so it is
 * bounded by `STABILITY_CACHE_LIMIT`, coalesced by the stability pump (one
 * request per dispatched result, not per slider step), and dropped with the
 * entry. A failure is recorded but never turns the stability result into an
 * error: the layout keeps its last good shape (or stays empty).
 */
function requestGeometry(key: string, vehicle: RocketVehicle): void {
  aggregateMassOf(vehicle)
    .then((geometry) => {
      const entry = stabilityCache.get(key);
      if (entry === undefined || entry.status !== 'ready') return;
      entry.geometry = geometry;
      notifyStability();
    })
    .catch((err: unknown) => {
      const entry = stabilityCache.get(key);
      if (entry === undefined || entry.status !== 'ready') return;
      entry.geometryError = err instanceof Error ? err.message : String(err);
      notifyStability();
    });
}

function dispatchStability(vehicle: RocketVehicle, aeroModel?: AeroModelSelection): void {
  const key = stabilityKeyOf(vehicle, aeroModel);
  if (stabilityCache.has(key)) return;
  stabilityCache.set(key, { status: 'loading' });
  requestInFlight = true;
  lastDispatchAt = Date.now();
  stabilityOfVehicle(vehicle, aeroModel)
    .then((breakdown) => {
      stabilityCache.set(key, { status: 'ready', breakdown });
      // The built-up provider publishes totals but no component extents, so
      // the layout needs the model-independent rollup. Legacy results carry
      // their own parts and never trigger a second call.
      if (breakdown.parts.length === 0) requestGeometry(key, vehicle);
    })
    .catch((err: unknown) => {
      stabilityCache.set(key, { status: 'error', error: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      requestInFlight = false;
      trimStabilityCache();
      notifyStability();
      pumpStability();
    });
}

/**
 * Leading + trailing dispatch: the first request of a burst starts at once,
 * later requests queue per cache key and run no faster than
 * `STABILITY_COALESCE_MS`, with at most one native call in flight. Pending
 * keys with no rendered consumer are dropped (intermediate drag steps); the
 * most recently requested subscribed key goes next, so a different slot
 * (committed run, ghost, other aero model) is never overwritten or starved.
 */
function pumpStability(): void {
  if (requestInFlight || coalesceTimer !== null) return;
  for (const key of Array.from(pendingStability.keys())) {
    if (stabilityCache.has(key) || (stabilityActiveKeys.get(key) ?? 0) === 0) pendingStability.delete(key);
  }
  if (pendingStability.size === 0) return;
  const elapsed = Date.now() - lastDispatchAt;
  const delay = lastDispatchAt === 0 ? 0 : Math.max(0, STABILITY_COALESCE_MS - elapsed);
  if (delay > 0) {
    coalesceTimer = setTimeout(() => {
      coalesceTimer = null;
      pumpStability();
    }, delay);
    return;
  }
  let target: PendingStabilityRequest | undefined;
  for (const candidate of pendingStability.values()) target = candidate;
  if (target === undefined) return;
  pendingStability.delete(target.key);
  dispatchStability(target.vehicle, target.aeroModel);
}

/** Kick off a native stability request for a vehicle, unless one is cached or pending. */
export function requestStability(vehicle: RocketVehicle, aeroModel?: AeroModelSelection): string {
  const key = stabilityKeyOf(vehicle, aeroModel);
  if (stabilityCache.has(key)) {
    touchStability(key);
    pendingStability.delete(key);
    return key;
  }
  pendingStability.delete(key);
  pendingStability.set(key, { key, vehicle, aeroModel });
  pumpStability();
  return key;
}

/** Cached native stability for a vehicle, requesting it when absent. */
export function useStabilityOf(vehicle: RocketVehicle | null | undefined, aeroModel?: AeroModelSelection): {
  breakdown: StabilityBreakdown | null;
  /** Geometry+mass rollup for a model that publishes no breakdown; null otherwise. */
  geometry: VehicleMassRollup | null;
  geometryError: string | null;
  error: string | null;
  loading: boolean;
} {
  const key = useMemo(
    () => (vehicle === null || vehicle === undefined ? null : stabilityKeyOf(vehicle, aeroModel)),
    [vehicle, aeroModel],
  );
  const candidateSelected = useProjectStore((s) => isCandidateFlightModel(resolveFlightModel(s.project.flightModel)));
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = (): void => setTick((t) => t + 1);
    stabilityListeners.add(listener);
    return () => {
      stabilityListeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    if (key === null) return;
    touchStability(key);
    stabilityActiveKeys.set(key, (stabilityActiveKeys.get(key) ?? 0) + 1);
    return () => {
      const remaining = (stabilityActiveKeys.get(key) ?? 1) - 1;
      if (remaining > 0) stabilityActiveKeys.set(key, remaining);
      else stabilityActiveKeys.delete(key);
      trimStabilityCache();
    };
  }, [key]);
  useEffect(() => {
    if (!candidateSelected && vehicle !== null && vehicle !== undefined) requestStability(vehicle, aeroModel);
  }, [vehicle, candidateSelected, aeroModel]);
  const entry = key === null ? undefined : stabilityCache.get(key);
  if (candidateSelected) {
    return { breakdown: null, geometry: null, geometryError: null, error: CANDIDATE_REFUSAL.legacyAero, loading: false };
  }
  return {
    breakdown: entry?.breakdown ?? null,
    geometry: entry?.geometry ?? null,
    geometryError: entry?.geometryError ?? null,
    error: entry?.error ?? null,
    loading: entry === undefined || entry.status === 'loading',
  };
}

/* ───────────── committed and preview designs ───────────── */

export function useCommittedDesign(): Design | null {
  return useCommittedRun()?.design ?? null;
}

/** Live stability for the current preview design. */
export function useStability(): StabilityBreakdown | null {
  const design = usePreviewDesign();
  return useStabilityOf(design.vehicle, design.aeroModel).breakdown;
}

/** Stability at the committed run, for deltas. */
export function useCommittedStability(): StabilityBreakdown | null {
  const committed = useCommittedRun();
  return useStabilityOf(committed?.design.vehicle ?? null, committed?.design.aeroModel).breakdown;
}

/** The airframe draft merged over the committed vehicle. */
export function usePreviewVehicle(): RocketVehicle {
  const project = useProjectStore((s) => s.project);
  const drafts = useProjectStore((s) => s.drafts);
  return useMemo(() => {
    const draft = drafts.airframe;
    const removed = new Set(draft.removed);
    const components = project.vehicle.components
      .filter((c) => !removed.has(c.id))
      .map((c) => {
        const patch = draft.components[c.id];
        return patch === undefined ? c : ({ ...c, ...patch } as RocketVehicle['components'][number]);
      });
    return { ...project.vehicle, components: [...components, ...draft.added] };
  }, [project, drafts]);
}

/** The design the Console shows: committed project plus the airframe draft. */
export function usePreviewDesign(): Design {
  const project = useProjectStore((s) => s.project);
  const mission = useProjectStore((s) => s.mission);
  const shearPa = useProjectStore((s) => s.shearPa);
  const vehicle = usePreviewVehicle();
  const records = useProjectStore((s) => s.motors);
  return useMemo(
    () => designOf(project, mission, shearPa, vehicle, records),
    [project, mission, shearPa, vehicle, records],
  );
}

/* ───────────── change tracking and freshness ───────────── */

export function useChanges(): Change[] {
  const design = usePreviewDesign();
  const committed = useCommittedDesign();
  return useMemo(() => (committed === null ? [] : diffDesigns(committed, design)), [design, committed]);
}

export function useChangedParts(): Set<string> {
  const changes = useChanges();
  return useMemo(
    () => new Set(changes.map((c) => c.partId).filter((id): id is string => id !== undefined)),
    [changes],
  );
}

/** Has this field of this part changed since the committed run? */
export function useFieldChanged(partId: string | null, field: string): boolean {
  const changes = useChanges();
  return changes.some((c) => (partId === null ? c.partId === undefined : c.partId === partId) && c.field === field);
}

const LIVE_STAGES: StageId[] = ['airframe', 'motor', 'aero', 'mission'];

export function useFreshness(stage: StageId): { state: Freshness; reasons: Change[] } {
  const changes = useChanges();
  const environmentProfile = useSessionStore((s) => s.environmentProfile);
  const committedRecord = useAnalysisStore((s) => s.completed.flight);
  const running = useAnalysisStore((s) => s.records.flight?.status === 'running');
  const failed = useAnalysisStore((s) => s.records.flight?.status === 'failed');
  const candidateSelected = useProjectStore((s) => isCandidateFlightModel(resolveFlightModel(s.project.flightModel)));
  return useMemo(() => {
    if (LIVE_STAGES.includes(stage)) return { state: 'live', reasons: [] };
    if (running) return { state: 'running', reasons: [] };
    if (failed) return { state: 'failed', reasons: [] };
    if (committedRecord === null) return { state: 'not-run', reasons: [] };
    if (candidateSelected) {
      const current = candidateInvocationMatches(committedRecord);
      return { state: current ? 'current' : 'stale', reasons: current ? [] : [{ id: 'candidate-inputs', field: 'selection', label: 'Candidate selection or inputs changed', from: null, to: null, input: 'launch' }] };
    }
    const reasons = staleReasons(stage, changes);
    return { state: reasons.length > 0 ? 'stale' : 'current', reasons };
  }, [stage, changes, running, failed, committedRecord, candidateSelected, environmentProfile]);
}

const FRESHNESS_STATE: Record<'unknown' | 'running' | 'failed' | 'stale' | 'current', Freshness> = {
  unknown: 'not-run',
  running: 'running',
  failed: 'failed',
  stale: 'stale',
  current: 'current',
};

/** Freshness of the committed flight record against the current run inputs. */
export function useAnalysisFreshness(): Freshness {
  const record = useAnalysisStore((s) => s.completed.flight);
  const project = useProjectStore((s) => s.project);
  const mission = useProjectStore((s) => s.mission);
  const shearPa = useProjectStore((s) => s.shearPa);
  const candidateSelected = useProjectStore((s) => isCandidateFlightModel(resolveFlightModel(s.project.flightModel)));
  return useMemo(() => {
    // The project identity is the trigger; the inputs are reread from it.
    void project;
    void mission;
    void shearPa;
    if (candidateSelected) return record === null ? 'not-run' : candidateInvocationMatches(record) ? 'current' : 'stale';
    return FRESHNESS_STATE[analysisFreshness(record, currentRunKey())];
  }, [record, project, mission, shearPa, candidateSelected]);
}

/**
 * The committed run through the shared qualification rule
 * (`qualifyResult`): a pass requires valid inputs, a current run key, a
 * reachable backend, and gates that actually evaluated to pass. Everything
 * else surfaces its own qualified state, so a stale or offline run never
 * reads as passing.
 */
export function useFlightQualification(): QualifiedResult {
  const record = useAnalysisStore((s) => s.completed.flight);
  const live = useAnalysisStore((s) => s.records.flight);
  const project = useProjectStore((s) => s.project);
  const mission = useProjectStore((s) => s.mission);
  const shearPa = useProjectStore((s) => s.shearPa);
  const environmentProfile = useSessionStore((s) => s.environmentProfile);
  const native = engineIsAvailable();
  return useMemo(() => {
    // The project identity is the trigger; the inputs are reread from it.
    void project;
    void mission;
    void shearPa;
    const payload = record?.payload as { model?: string; run?: { gates: { status: string }[] } } | undefined;
    const currentKey = currentRunKey();
    if (payload?.model === 'candidate') {
      if (live?.status === 'running') return { status: 'running', label: 'Candidate run running', isPass: false };
      if (live?.status === 'failed') return { status: 'fail', label: 'Candidate run failed', isPass: false };
      if (!native) return { status: 'offline', label: 'Offline: candidate engine unavailable', isPass: false };
      if (currentKey === null) return { status: 'invalid', label: 'Candidate selection invalid: repair inputs', isPass: false };
      if (record === null || !candidateInvocationMatches(record)) {
        return { status: 'stale', label: 'Candidate result stale: selection or inputs changed', isPass: false };
      }
      return { status: 'experimental', label: 'Experimental candidate · unqualified', isPass: false };
    }
    const gates = payload?.run?.gates ?? [];
    const gate: GateOutcome =
      gates.length === 0 ? 'unknown' : gates.some((g) => g.status === 'fail') ? 'fail' : gates.every((g) => g.status === 'pass') ? 'pass' : 'unknown';
    return qualifyResult({
      valid: currentKey !== null,
      current: record !== null && currentKey !== null && record.inputKey === currentKey,
      gate,
      lifecycle: live?.status === 'running' ? 'running' : live?.status === 'failed' ? 'failed' : 'completed',
      offline: !native,
    });
  }, [record, live, project, mission, shearPa, native, environmentProfile]);
}

/* ───────────── session ───────────── */

export function useUnits(): 'metric' | 'imperial' {
  return useSessionStore((s) => s.units);
}

export function setConsoleState(patch: SessionConsolePatch): void {
  useSessionStore.getState().setConsole(patch);
}
