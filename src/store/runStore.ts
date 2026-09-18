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
 */
import { create } from 'zustand';
import { qualifyResult, type QualifiedResult } from '../application/runDisplay';

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
  freshness: RunFreshness;
  gate: GateOutcome;
  label: string;
}

/** Minimal Q5 projection carried for legacy consumers. */
export interface LastSimRunView {
  telemetry: unknown[];
  events: unknown[];
  runKey: string;
}

interface RunStoreState {
  records: RunRecord[];
  /** Explicitly chosen completed run backing the `lastSimRun` view. */
  chosenRunId: string | null;
  recordAttempt: (record: RunRecord) => void;
  markStaleByKey: (currentRunKey: string) => void;
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
export function displayFor(record: RunRecord): { status: QualifiedResult } {
  return {
    status: qualifyResult({
      valid: record.valid,
      current: record.freshness === 'current',
      gate: record.gate,
      lifecycle: record.lifecycle,
    }),
  };
}
/** Test-only reset for the id allocator. */
export function resetRunIdCounter(): void {
  runCounter = 0;
}

export const useRunStore = create<RunStoreState>((set, get) => ({
  records: [],
  chosenRunId: null,
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
  markStaleByKey: (currentRunKey) =>
    set((state) => ({
      records: state.records.map((r) => (r.runKey === currentRunKey ? r : { ...r, freshness: 'stale' as RunFreshness })),
    })),
  chooseRun: (runId) => set({ chosenRunId: runId }),
  resetRuns: () => set({ records: [], chosenRunId: null }),
  lastSimRun: () => {
    const { records, chosenRunId } = get();
    const chosen = records.find((r) => r.runId === chosenRunId);
    if (!chosen || chosen.lifecycle !== 'completed' || !chosen.valid) return null;
    // Telemetry/events payloads arrive with the S4 job service; until then
    // the projection carries identity with empty series (never fabricated).
    return { telemetry: [], events: [], runKey: chosen.runKey };
  },
}));