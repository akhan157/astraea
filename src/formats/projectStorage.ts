/**
 * Browser-durable project storage (adapter matrix rows 1-2, S3-lite durable save).
 *
 * `projectJson.ts` owns the envelope contract and the revisioned-save logic; it
 * takes any `ProjectBackend`. This module supplies the only durable backend the
 * workstation can use without a filesystem plugin — `window.localStorage` — and
 * a small handle that remembers the revision the session last saw, so a save is
 * always an optimistic-concurrency commit against a known base.
 *
 * Fail-closed posture, matching the rest of the format layer:
 *   - Storage access failures (disabled storage, security errors) throw a
 *     descriptive error instead of pretending the project was saved.
 *   - Stored bytes that do not validate throw `InvalidProjectError` on load and
 *     are NEVER silently overwritten by a subsequent save.
 *   - A save whose base revision is behind the stored revision throws
 *     `StaleRevisionError` (another session/tab committed first).
 */

import {
  InvalidProjectError,
  StaleRevisionError,
  createProjectStore,
  type ProjectBackend,
  type ProjectEnvelope,
} from './projectJson';

/** Storage key for the workstation's single durable project slot. */
export const PROJECT_STORAGE_KEY = 'astraea.project.v1';

/** The slice of the Storage API this backend needs (injectable for tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageOrThrow(): StorageLike {
  const candidate = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (!candidate) {
    throw new Error(
      'durable project storage is unavailable: this environment exposes no localStorage',
    );
  }
  return candidate;
}

/**
 * A `ProjectBackend` over `StorageLike`. Reads/writes propagate storage errors
 * (quota exceeded, storage disabled) as thrown errors so the caller reports
 * failure rather than losing work silently.
 */
export function createStorageBackend(
  key: string = PROJECT_STORAGE_KEY,
  storage?: StorageLike,
): ProjectBackend {
  const resolve = (): StorageLike => storage ?? storageOrThrow();
  return {
    read: () => resolve().getItem(key),
    write: (text: string) => {
      try {
        resolve().setItem(key, text);
      } catch (err) {
        throw new Error(`durable project storage write failed: ${(err as Error).message}`);
      }
    },
  };
}

/** Durable project handle the UI talks to (one slot per storage key). */
export interface DurableProject {
  /** Stored envelope (migrated + validated), or null when nothing is stored. */
  load(): ProjectEnvelope | null;
  /**
   * Commit `project` against the revision this handle last saw and return the
   * stamped envelope. Throws StaleRevisionError when another session committed
   * first, and InvalidProjectError when the stored bytes are corrupt.
   */
  save(project: ProjectEnvelope): ProjectEnvelope;
  /** Revision this handle would use as its save base (0 when nothing stored). */
  baseRevision(): number;
}

/**
 * Create a durable handle. The revision base starts at "nothing stored" and is
 * refreshed by every `load`/`save`, so a save always commits against the state
 * the user actually saw.
 */
export function createDurableProject(
  key: string = PROJECT_STORAGE_KEY,
  storage?: StorageLike,
): DurableProject {
  const store = createProjectStore(createStorageBackend(key, storage));
  let base = 0;
  return {
    load() {
      const current = store.load();
      base = current === null ? 0 : current.revision;
      return current;
    },
    save(project: ProjectEnvelope) {
      const committed = store.save(project, base);
      base = committed.revision;
      return committed;
    },
    baseRevision: () => base,
  };
}

export { InvalidProjectError, StaleRevisionError };