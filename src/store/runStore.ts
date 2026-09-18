/**
 * RIVAL S2 — run store: append-only registry of run attempts behind a stable
 * identity (synthesis pattern 8 adapted: auto-invalidation with visible
 * reason; old results are kept, never silently rewritten).
 *
 * Records are append-only: input changes never rewrite a completed record, a
 * failed attempt never erases a prior success, and a late worker payload can
 * only publish when its identity still matches the destination (enforced in
 * S4; the guard shape lives here). Display qualification delegates to
 * application/runDisplay so stale or invalid results can never present an
 * unqualified pass.
 *
 * Freshness contract (Astra P0-1): the store carries the LATEST published
 * complete dependency snapshot (`publishSnapshot`, driven by TrajectoryStudio
 * as its inputs change). `displayFor` derives every record's freshness from
 * its captured snapshot against that current — not from an event like "a
 * newer run finished" — so an edit to wind/sigma/run-count/same-ID motor
 * content/sounding stales EVERY surface (card, run record, registry) at
 * once, with a reason. Historical payloads are preserved verbatim; nothing
 * already recorded is ever rewritten.
 */
import { create } from 'zustand';
import { qualifyResult, type QualifiedResult } from '../application/runDisplay';
import type { BadgeStatus } from '../components/ui/StatusBadge';
import {
  freshnessReasonLabel,
  snapshotDivergence,
  type RunSnapshot,
} from '../application/caseResolver';

export type RunLifecycle = 'idle' | 'running' | 'completed' | 'failed';
export type RunFreshness = 'current' | 'stale';
export type GateOutcome = 'pass' | 'fail' | 'unknown';

export interface RunRecord {
  runId: string;
  /** Content key of the resolved inputs this attempt ran (S1 snapshot key). */
  runKey: string;
  /** Case identity (vehicle revision + motor binding + options hash scope). */
  caseId: string;
  lifecycle: RunLifecycle;
  /** Validity of the inputs behind this record. */
  valid: boolean;
  /** Stored freshness marker at capture time; display freshness is derived. */
  freshness: RunFreshness;
  gate: GateOutcome;
  label: string;
  /** Immutable full-capture snapshot (vehicle/motor/options + ensemble). */
  snapshot?: RunSnapshot;
}

/** Minimal Q5 projection carried for legacy consumers. */
export interface LastSimRunView {
  telemetry: unknown[];
  events: unknown[];
  runKey: string;
}

/** One of the four always-displayed run-status fields. */
export interface RunStatusField {
  status: BadgeStatus;
  /** Full label, field-prefixed ("Freshness: Stale — wind inputs changed…"). */
  label: string;
}

/** Execution / validity / freshness / gate as four separate surfaces fields. */
export interface RunStatusFields {
  execution: RunStatusField;
  validity: RunStatusField;
  freshness: RunStatusField;
  gate: RunStatusField;
}

interface RunStoreState {
  records: RunRecord[];
  /** Explicitly chosen completed run backing the `lastSimRun` view. */
  chosenRunId: string | null;
  /**
   * Latest published complete dependency snapshot (TrajectoryStudio). Every
   * record's freshness derives against this; null before any publication.
   */
  currentSnapshot: RunSnapshot | null;
  recordAttempt: (record: RunRecord) => void;
  /** Publish the live complete dependency snapshot (inputs changed sense). */
  publishSnapshot: (snapshot: RunSnapshot) => void;
  chooseRun: (runId: string | null) => void;
  resetRuns: () => void;
  /** Derived Q5 view; null until a completed run is explicitly chosen. */
  lastSimRun: () => LastSimRunView | null;
}

let runCounter = 0;
export function nextRunId(): string {
  runCounter += 1;
  return `run-${Date.now().toString(36)}-${runCounter}`;
}

/**
 * Freshness of a record against the supplied current snapshot. Comparison
 * granularity is the intersection of captured dependencies: when BOTH the
 * stored record and the current capture carry an ensemble, freshness is the
 * full mcKey; when either side is case-only (FlightSim record, overlay
 * re-derivation), the case-level runKey attests everything that side
 * captured. Returns null when no current sense is available (falls back to
 * the stored freshness marker).
 */
function deriveFreshness(
  record: RunRecord,
  current: RunSnapshot | null,
): { current: boolean; reason: string | null } | null {
  if (current === null) return null;
  const stored = record.snapshot;
  if (stored) {
    const bothCaptureEnsemble = stored.ensemble !== undefined && current.ensemble !== undefined;
    if (bothCaptureEnsemble) {
      if (stored.mcKey === current.mcKey) return { current: true, reason: null };
      return { current: false, reason: freshnessReasonLabel(snapshotDivergence(current, stored)) };
    }
    if (stored.runKey === current.runKey) return { current: true, reason: null };
    return { current: false, reason: freshnessReasonLabel(snapshotDivergence(current, stored)) };
  }
  // Legacy record without a captured snapshot: only the case key exists.
  if (record.runKey === current.runKey) return { current: true, reason: null };
  return { current: false, reason: 'stored inputs differ from the current case' };
}

const executionField = (lifecycle: RunLifecycle): RunStatusField => {
  switch (lifecycle) {
    case 'running':
      return { status: 'running', label: 'Execution: Running' };
    case 'failed':
      return { status: 'fail', label: 'Execution: Failed' };
    case 'idle':
      return { status: 'idle', label: 'Execution: Idle' };
    default:
      return { status: 'info', label: 'Execution: Executed' };
  }
};

const gateField = (gate: GateOutcome): RunStatusField => {
  if (gate === 'pass') return { status: 'pass', label: 'Gate: Pass' };
  if (gate === 'fail') return { status: 'fail', label: 'Gate: Fail' };
  return { status: 'unknown', label: 'Gate: unknown' };
};

export function displayFor(
  record: RunRecord,
  currentOverride?: RunSnapshot,
): { status: QualifiedResult; fields: RunStatusFields; staleReason: string | null } {
  const currentSnapshot = currentOverride ?? useRunStore.getState().currentSnapshot;
  const derived = deriveFreshness(record, currentSnapshot);
  const current = derived !== null ? derived.current : record.freshness === 'current';
  const staleReason = derived !== null && !derived.current ? derived.reason : null;
  return {
    status: qualifyResult({
      valid: record.valid,
      current,
      gate: record.gate,
      lifecycle: record.lifecycle,
    }),
    fields: {
      execution: executionField(record.lifecycle),
      validity: record.valid
        ? { status: 'pass', label: 'Validity: Valid' }
        : { status: 'invalid', label: 'Validity: Invalid' },
      freshness: current
        ? { status: 'pass', label: 'Freshness: Current' }
        : {
            status: 'stale',
            label: staleReason ? `Freshness: Stale — ${staleReason}` : 'Freshness: Stale',
          },
      gate: gateField(record.gate),
    },
    staleReason,
  };
}

/** Test-only reset for the id allocator. */
export function resetRunIdCounter(): void {
  runCounter = 0;
}

export const useRunStore = create<RunStoreState>((set, get) => ({
  records: [],
  chosenRunId: null,
  currentSnapshot: null,
  recordAttempt: (record) =>
    set((state) => {
      const records = [...state.records, record];
      // Auto-choose the first completed, valid run; never auto-switch away
      // from an explicit choice and never choose a failed attempt.
      let chosenRunId = state.chosenRunId;
      if (
        chosenRunId === null &&
        record.lifecycle === 'completed' &&
        record.valid &&
        record.freshness === 'current'
      ) {
        chosenRunId = record.runId;
      }
      return { records, chosenRunId };
    }),
  // Freshness is DERIVED at display time from this snapshot; records are
  // never rewritten (append-only identity, historical payloads preserved).
  publishSnapshot: (snapshot) => set({ currentSnapshot: snapshot }),
  chooseRun: (runId) => set({ chosenRunId: runId }),
  resetRuns: () => set({ records: [], chosenRunId: null, currentSnapshot: null }),
  lastSimRun: () => {
    const { records, chosenRunId } = get();
    const chosen = records.find((r) => r.runId === chosenRunId);
    if (!chosen || chosen.lifecycle !== 'completed' || !chosen.valid) return null;
    // Telemetry/events payloads arrive with the S4 job service; until then
    // the projection carries identity with empty series (never fabricated).
    return { telemetry: [], events: [], runKey: chosen.runKey };
  },
}));