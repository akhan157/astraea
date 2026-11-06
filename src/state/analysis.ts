/**
 * Analysis store: latest record per analysis kind, keyed to the committed
 * inputs it ran against. Freshness is derived in the component by comparing
 * the record's input key to the current committed-input key: equal means
 * current, different means stale. A stale record keeps its qualified stale
 * badge; it never re-presents as passing.
 *
 * Only the latest issued request may resolve: each run gets a token, and a
 * late response with an older token is discarded, never written over newer
 * committed state.
 */

import { create } from 'zustand';
import type { RunInputs } from '../application/runInputs';

export type AnalysisKind =
  | 'mass'
  | 'stability'
  | 'aero-curves'
  | 'flight'
  | 'ensemble'
  | 'chamber'
  | 'nozzle';

export type AnalysisStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface AnalysisRecord {
  kind: AnalysisKind;
  status: AnalysisStatus;
  /** Content key of the committed inputs this record ran against. */
  inputKey: string;
  /** ISO-8601 start timestamp. */
  startedAt: string;
  /** ISO-8601 completion timestamp, when terminal. */
  finishedAt: string | null;
  /** Native error message, when failed. */
  error: string | null;
  /** Request token: only the latest token for a kind may resolve. */
  token: number;
  /** Opaque result payload, stored for the studio that owns the kind. */
  payload: unknown;
  /** Immutable inputs captured before dispatch; resolve never replaces them. */
  runInputs?: RunInputs;
}

interface AnalysisState {
  records: Record<AnalysisKind, AnalysisRecord | null>;
  /**
   * Last completed record per kind, kept across re-runs so a stage can keep
   * showing the committed result while a fresh run is in flight.
   */
  completed: Record<AnalysisKind, AnalysisRecord | null>;
  history: AnalysisRecord[];
  /** Begin a run; returns its token. Overwrites any prior record for the kind. */
  start: (kind: AnalysisKind, inputKey: string, payload?: unknown, runInputs?: RunInputs) => number;
  /** Resolve the run when the token is still latest; drops stale tokens. */
  resolve: (kind: AnalysisKind, token: number, payload: unknown) => void;
  /** Fail the run when the token is still latest; drops stale tokens. */
  reject: (kind: AnalysisKind, token: number, error: string) => void;
  /** Clear every record (project replace). */
  reset: () => void;
}

/** Session-only analysis context; pending work never crosses a project boundary. */
export type AnalysisSnapshot = Pick<AnalysisState, 'records' | 'completed' | 'history'>;

const KINDS: AnalysisKind[] = ['mass', 'stability', 'aero-curves', 'flight', 'ensemble', 'chamber', 'nozzle'];

function blankRecords(): Record<AnalysisKind, AnalysisRecord | null> {
  return { mass: null, stability: null, 'aero-curves': null, flight: null, ensemble: null, chamber: null, nozzle: null };
}

let tokenCounter = 0;

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  records: blankRecords(),
  completed: blankRecords(),
  history: [],

  start: (kind, inputKey, payload = null, runInputs) => {
    tokenCounter += 1;
    const token = tokenCounter;
    const now = new Date().toISOString();
    set({
      records: {
        ...get().records,
        [kind]: {
          kind,
          status: 'running',
          inputKey,
          startedAt: now,
          finishedAt: null,
          error: null,
          token,
          payload,
          ...(runInputs === undefined ? {} : { runInputs }),
        },
      },
    });
    return token;
  },

  resolve: (kind, token, payload) => {
    const current = get().records[kind];
    if (!current || current.token !== token || current.status !== 'running') return;
    const record: AnalysisRecord = {
      ...current,
      status: 'completed',
      finishedAt: new Date().toISOString(),
      payload,
    };
    set({
      records: { ...get().records, [kind]: record },
      completed: { ...get().completed, [kind]: record },
      history: [...get().history, record],
    });
  },

  reject: (kind, token, error) => {
    const current = get().records[kind];
    if (!current || current.token !== token || current.status !== 'running') return;
    set({
      completed: { ...get().completed, [kind]: null },
      history: [...get().history, { ...current, status: 'failed', finishedAt: new Date().toISOString(), error }],
      records: {
        ...get().records,
        [kind]: { ...current, status: 'failed', finishedAt: new Date().toISOString(), error },
      },
    });
  },

  reset: () => set({ records: blankRecords(), completed: blankRecords(), history: [] }),
}));

/** Capture terminal state only, optionally restricted to runs present in an opened file. */
export function terminalAnalysisSnapshot(keep: (record: AnalysisRecord) => boolean = () => true): AnalysisSnapshot {
  const state = useAnalysisStore.getState();
  const records = blankRecords();
  const completed = blankRecords();
  for (const kind of KINDS) {
    const done = state.completed[kind];
    if (done?.status === 'completed' && keep(done)) completed[kind] = done;
    const current = state.records[kind];
    records[kind] = current && (current.status === 'completed' || current.status === 'failed') && keep(current) ? current : completed[kind];
  }
  return { records, completed, history: state.history.filter((record) => (record.status === 'completed' || record.status === 'failed') && keep(record)) };
}

/** Loading archived inputs keeps history but requires an explicit new computation. */
export function detachCurrentAnalysis(): void {
  useAnalysisStore.setState({ records: blankRecords(), completed: blankRecords() });
}

/**
 * Freshness of a record against the current committed-input key. A missing
 * record is unknown, a running record is running, a failed record is failed,
 * a key mismatch is stale, and only a completed record on the current key is
 * current. Test seam: pure function over the record and key.
 */
export function analysisFreshness(
  record: AnalysisRecord | null,
  currentInputKey: string | null,
): 'unknown' | 'running' | 'failed' | 'stale' | 'current' {
  if (!record) return 'unknown';
  if (record.status === 'running') return 'running';
  if (record.status === 'failed') return 'failed';
  if (currentInputKey === null) return 'unknown';
  if (record.inputKey !== currentInputKey) return 'stale';
  return 'current';
}

/** True when the kind has no record yet or its record is stale or failed. */
export function analysisNeedsRun(record: AnalysisRecord | null, currentInputKey: string | null): boolean {
  const freshness = analysisFreshness(record, currentInputKey);
  return freshness === 'unknown' || freshness === 'stale' || freshness === 'failed';
}

export { KINDS };
