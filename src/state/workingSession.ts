/** Independent recovery slot. Never loads/saves the explicit project handle. */
import { createIndexedDbBackend } from '../formats/projectStorage';
import { readProject, writeProject, type ProjectBackend, type ProjectEnvelope } from '../formats/projectJson';
import { adoptProject, exportableProject, useProjectStore } from './project';
import { useAnalysisStore } from './analysis';
import { currentLoadedLog, rememberLoadedLog, useLoadedLogStore, type LoadedLog } from '../console/evidence/loadedLog';
import { useOverlayFlights } from './overlayFlights';
import { useSessionStore } from './session';
import type { FlightLog } from '../console/evidence/SimFlightOverlay';
import { create } from 'zustand';

export const WORKING_SESSION_KEY = 'astraea.working-session.v1';
/** Hard UTF-8 storage/read cap. Oversize work stays in memory, never truncated. */
export const WORKING_SESSION_MAX_BYTES = 32 * 1024 * 1024;
export const useRecoveryNote = create<{ message: string | null; dismiss: () => void }>(set => ({
  message: null, dismiss: () => set({ message: null }),
}));
type StoredLog = Omit<LoadedLog, 'epoch' | 'log'> & { log: Omit<LoadedLog['log'], 'originalBytes'> & { originalBytes: number[] } };
export interface WorkingData { project: ProjectEnvelope; loaded: StoredLog | null; flights: FlightLog[] }
interface RecordV1 { version: 1; revision: number; at: string; project: string; loaded: StoredLog | null; flights: FlightLog[] }
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
function assert(ok: unknown): asserts ok { if (!ok) throw new Error('Invalid working session'); }
function samples(value: unknown): void {
  assert(Array.isArray(value) && value.length > 0);
  for (const point of value) assert(point && Number.isFinite(point.timeS) && Number.isFinite(point.altitudeM) && (point.velocityMs === undefined || Number.isFinite(point.velocityMs)));
}
function validateExtras(record: RecordV1): void {
  assert(Array.isArray(record.flights));
  const ids = new Set<string>();
  for (const flight of record.flights) {
    assert(flight && typeof flight.id === 'string' && !ids.has(flight.id) && typeof flight.name === 'string' && ['csv', 'gpx'].includes(flight.source) && typeof flight.sourceText === 'string' && Number.isFinite(flight.apogeeM) && Number.isFinite(flight.apogeeS));
    ids.add(flight.id); samples(flight.samples);
  }
  if (record.loaded !== null) {
    const entry = record.loaded;
    assert(entry && typeof entry.csvText === 'string' && (entry.sourceName === null || typeof entry.sourceName === 'string'));
    assert(entry.unitOverrides && typeof entry.unitOverrides === 'object' && !Array.isArray(entry.unitOverrides) && Object.keys(entry.unitOverrides).every(key => ['time', 'altitude'].includes(key)));
    const units = entry.unitOverrides as Record<string, unknown>;
    assert((units.time === undefined || ['s', 'ms'].includes(String(units.time))) && (units.altitude === undefined || ['m', 'ft'].includes(String(units.altitude))));
    assert(entry.log && typeof entry.log.hasVelocity === 'boolean'); samples(entry.log.samples);
    assert(Array.isArray(entry.log.originalBytes) && entry.log.originalBytes.every(b => Number.isInteger(b) && b >= 0 && b <= 255));
    const p = entry.log.provenance;
    assert(p && (p.sourceFileName === null || typeof p.sourceFileName === 'string') && /^(unavailable|[0-9a-f]{64})$/.test(p.sha256Hex) && Number.isInteger(p.rowCount) && p.rowCount >= 0 && Number.isInteger(p.skippedLineCount) && p.skippedLineCount >= 0 && ['altos-csv', 'generic-csv'].includes(p.dialect) && typeof p.timeUnitAssumption === 'string' && typeof p.altitudeUnitAssumption === 'string');
  }
}
function decode(text: string): { record: RecordV1; data: WorkingData } {
  assert(bytes(text) <= WORKING_SESSION_MAX_BYTES);
  const record = JSON.parse(text) as RecordV1;
  assert(record && record.version === 1 && Number.isSafeInteger(record.revision) && record.revision > 0 && typeof record.at === 'string' && Number.isFinite(Date.parse(record.at)) && typeof record.project === 'string');
  validateExtras(record);
  return { record, data: { project: readProject(record.project), loaded: record.loaded, flights: record.flights } };
}
export class StaleWorkingSessionError extends Error {}
/** The backend's atomic update prevents a stale tab overwriting newer work. */
export function workingSessionSlot(backend: ProjectBackend) {
  let observed: string | null = null;
  let revision = 0;
  return {
    async load() {
      observed = await backend.read();
      if (observed === null) return null;
      const decoded = decode(observed); revision = decoded.record.revision;
      return { ...decoded.data, at: decoded.record.at };
    },
    async save(data: WorkingData) {
      assert(Number.isSafeInteger(revision + 1));
      const next: RecordV1 = { version: 1, revision: revision + 1, at: new Date().toISOString(), project: writeProject(data.project), loaded: data.loaded, flights: data.flights };
      validateExtras(next);
      const text = JSON.stringify(next);
      if (bytes(text) > WORKING_SESSION_MAX_BYTES) throw new Error('Working session exceeds 32 MiB');
      await backend.update(current => {
        if (current !== observed) throw new StaleWorkingSessionError('A newer tab has saved this working session');
        return text;
      });
      observed = text; revision = next.revision;
    },
  };
}
export function captureWorkingSession(): WorkingData {
  const loaded = currentLoadedLog();
  return {
    // withRunCases in exportableProject uses step 2's compact saved-case projection.
    project: exportableProject(),
    loaded: loaded ? { csvText: loaded.csvText, sourceName: loaded.sourceName, unitOverrides: loaded.unitOverrides, log: { ...loaded.log, originalBytes: Array.from(loaded.log.originalBytes) } } : null,
    flights: useOverlayFlights.getState().logs,
  };
}
export function restoreWorkingSession(data: WorkingData): void {
  useAnalysisStore.getState().reset();
  adoptProject(data.project);
  // Cases stay in the project archive; no completed/current analysis is created.
  if (data.loaded) rememberLoadedLog({ ...data.loaded, log: { ...data.loaded.log, originalBytes: new Uint8Array(data.loaded.log.originalBytes) } });
  useOverlayFlights.setState({ logs: data.flights });
}
/** Await startup before mounting UI, so a late read cannot replace new user work. */
export async function startWorkingSession(backend: ProjectBackend = createIndexedDbBackend(WORKING_SESSION_KEY), delay = 500, canRestore: () => boolean = () => true) {
  const slot = workingSessionSlot(backend);
  const notified = new Set<string>();
  const notice = (key: string, message: string) => {
    if (notified.has(key)) return;
    notified.add(key); useSessionStore.getState().notify(message, key === 'restore' ? 'info' : 'error');
    useRecoveryNote.setState({ message });
  };
  try {
    const saved = await slot.load();
    if (saved && !canRestore()) {
      notice('late', 'Unsaved work from a previous session was found too late to restore safely; it was left untouched.');
    } else if (saved) {
      restoreWorkingSession(saved);
      notice('restore', `Restored unsaved work from ${new Date(saved.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`);
    }
  } catch {
    notice('read', 'Working session could not be restored. Your explicit project save is unchanged.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain = Promise.resolve();
  let stopped = false;
  let stale = false;
  const flush = () => {
    clearTimeout(timer);
    chain = chain.then(async () => {
      if (stopped || stale) return;
      try { await slot.save(captureWorkingSession()); }
      catch (error) {
        stale = error instanceof StaleWorkingSessionError;
        notice(stale ? 'stale' : 'write', stale
          ? 'A newer tab saved the working session. This tab’s work remains in memory; automatic recovery writes are paused.'
          : 'Working session could not be saved. Work remains in memory; recovery will retry on the next change.');
      }
    });
    return chain;
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void flush(); }, delay); };
  const subscriptions = [useProjectStore.subscribe(schedule), useAnalysisStore.subscribe((s, p) => { if (s.history !== p.history) schedule(); }), useLoadedLogStore.subscribe(schedule), useOverlayFlights.subscribe(schedule)];
  // Best effort for a normal reload; crashes can still lose the debounce window.
  const leaving = () => { void flush(); };
  globalThis.addEventListener?.('pagehide', leaving);
  return { flush, stop: () => {
    stopped = true; clearTimeout(timer); subscriptions.forEach(off => off());
    globalThis.removeEventListener?.('pagehide', leaving);
  } };

}
