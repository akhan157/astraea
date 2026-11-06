/**
 * The flight log the user has imported in this session. It lives here, not in
 * the Altimetry card, so leaving Verify and coming back keeps it. It is
 * session state: never written to the project file, and dropped when the
 * whole project is replaced (open, new, preset). Edits to the open project do
 * not drop it.
 */
import { create } from 'zustand';
import type { LogUnitOverrides, TrajectorySample } from '../../evidence/altimetry';
import type { LogProvenance } from '../../evidence/logProvenance';
import { useProjectStore } from '../../state/project';

/** A log the user imported, as the calibration card and the share bundle consume it. */
export interface ImportedLog {
  samples: TrajectorySample[];
  hasVelocity: boolean;
  provenance: LogProvenance;
  /**
   * Exactly what was imported: the file's bytes, or the UTF-8 of pasted text.
   * `provenance.sha256Hex` is the checksum of these bytes.
   */
  originalBytes: Uint8Array;
}

/** The imported log plus what the Altimetry card needs to show it again. */
export interface LoadedLog {
  log: ImportedLog;
  csvText: string;
  sourceName: string | null;
  unitOverrides: LogUnitOverrides;
  /** `projectEpoch` the log was imported under. */
  epoch: number;
}

interface LoadedLogState {
  loaded: LoadedLog | null;
}

const useLoadedLogStore = create<LoadedLogState>(() => ({ loaded: null }));

/** Remember the log just imported for the open project. */
export function rememberLoadedLog(entry: Omit<LoadedLog, 'epoch'>): void {
  useLoadedLogStore.setState({ loaded: { ...entry, epoch: useProjectStore.getState().projectEpoch } });
}

/** Forget the log, e.g. between tests. */
export function forgetLoadedLog(): void {
  useLoadedLogStore.setState({ loaded: null });
}

/** The log imported for the open project, or null. */
export function currentLoadedLog(): LoadedLog | null {
  const { loaded } = useLoadedLogStore.getState();
  return loaded !== null && loaded.epoch === useProjectStore.getState().projectEpoch ? loaded : null;
}

/** The log imported for the open project, reactively. */
export function useLoadedLog(): LoadedLog | null {
  const loaded = useLoadedLogStore((s) => s.loaded);
  const epoch = useProjectStore((s) => s.projectEpoch);
  return loaded !== null && loaded.epoch === epoch ? loaded : null;
}
