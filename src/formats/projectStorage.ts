/**
 * Browser-durable project storage (adapter matrix rows 1-2, S3-lite durable save).
 *
 * `projectJson.ts` owns the envelope contract and the revisioned-save logic; it
 * takes any `ProjectBackend`. This module supplies the durable backends and a
 * small handle that remembers the revision the session last saw, so a save is
 * always an optimistic-concurrency commit against a known base.
 *
 * Backends, in order of preference:
 *   - IndexedDB (`createIndexedDbBackend`): hundreds of MB, so projects that
 *     carry flight-log evidence fit; read-check-write runs in one transaction.
 *   - localStorage (`createStorageBackend`): the original ~5 MB slot, used only
 *     where IndexedDB is missing. A project saved there before the move is
 *     still read (and carried into IndexedDB by the next save).
 *
 * Fail-closed posture, matching the rest of the format layer:
 *   - Storage access failures (disabled storage, quota, security errors)
 *     reject with a descriptive error instead of pretending the project was
 *     saved.
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
    update: (next) => {
      const storage = resolve();
      const text = next(storage.getItem(key));
      try {
        storage.setItem(key, text);
      } catch (err) {
        throw new Error(`durable project storage write failed: ${(err as Error).message}`);
      }
    },
  };
}

/** IndexedDB database and object store holding the project slots. */
export const PROJECT_DB_NAME = 'astraea';
const PROJECT_DB_STORE = 'projects';

function openProjectDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(PROJECT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROJECT_DB_STORE)) {
        request.result.createObjectStore(PROJECT_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`durable project storage unavailable: ${request.error?.message ?? 'IndexedDB open failed'}`));
    request.onblocked = () => reject(new Error('durable project storage unavailable: IndexedDB open was blocked'));
  });
}

/**
 * A `ProjectBackend` over IndexedDB. `update` reads, runs `next`, and writes
 * inside one readwrite transaction; if `next` throws (stale revision, corrupt
 * bytes) the transaction aborts and the stored document is untouched.
 * `legacy`, when given, supplies the document while the slot is still empty
 * (a project saved to the old localStorage slot).
 */
export function createIndexedDbBackend(
  key: string = PROJECT_STORAGE_KEY,
  factory?: IDBFactory,
  legacy?: () => string | null,
): ProjectBackend {
  let db: Promise<IDBDatabase> | null = null;
  const database = (): Promise<IDBDatabase> => {
    const idb = factory ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!idb) return Promise.reject(new Error('durable project storage is unavailable: this environment exposes no IndexedDB'));
    return (db ??= openProjectDb(idb));
  };
  const fallback = (text: unknown): string | null =>
    typeof text === 'string' ? text : legacy ? legacy() : null;
  return {
    async read() {
      const tx = (await database()).transaction(PROJECT_DB_STORE, 'readonly');
      const request = tx.objectStore(PROJECT_DB_STORE).get(key);
      return new Promise<string | null>((resolve, reject) => {
        request.onsuccess = () => resolve(fallback(request.result));
        request.onerror = () => reject(new Error(`durable project storage read failed: ${request.error?.message}`));
      });
    },
    async update(next) {
      const tx = (await database()).transaction(PROJECT_DB_STORE, 'readwrite');
      const store = tx.objectStore(PROJECT_DB_STORE);
      let failure: unknown = null;
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () =>
          reject(failure ?? new Error(`durable project storage write failed: ${tx.error?.message ?? 'transaction aborted'}`));
      });
      const get = store.get(key);
      get.onsuccess = () => {
        try {
          store.put(next(fallback(get.result)), key);
        } catch (err) {
          failure = err;
          tx.abort();
        }
      };
      await done;
    },
  };
}

/**
 * The durable backend for this environment: IndexedDB when present (reading
 * an older localStorage save until the first IndexedDB save), else
 * localStorage. Requests persistent storage so the browser does not evict
 * the project under storage pressure (best effort).
 */
export function defaultProjectBackend(key: string = PROJECT_STORAGE_KEY): ProjectBackend {
  const scope = globalThis as { indexedDB?: IDBFactory; localStorage?: StorageLike; navigator?: Navigator };
  if (!scope.indexedDB) return createStorageBackend(key);
  void scope.navigator?.storage?.persist?.().catch(() => undefined);
  const legacy = (): string | null => {
    try {
      return scope.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  return createIndexedDbBackend(key, scope.indexedDB, legacy);
}

/** Durable project handle the UI talks to (one slot per storage key). */
export interface DurableProject {
  /** Stored envelope (migrated + validated), or null when nothing is stored. */
  load(): Promise<ProjectEnvelope | null>;
  /**
   * Commit `project` against the revision this handle last saw and return the
   * stamped envelope. Throws StaleRevisionError when another session committed
   * first, and InvalidProjectError when the stored bytes are corrupt.
   */
  save(project: ProjectEnvelope): Promise<ProjectEnvelope>;
  /** Revision this handle would use as its save base (0 when nothing stored). */
  baseRevision(): number;
}

/**
 * Create a durable handle. The revision base starts at "nothing stored" and is
 * refreshed by every `load`/`save`, so a save always commits against the state
 * the user actually saw.
 */
export function createDurableProject(backend: ProjectBackend = defaultProjectBackend()): DurableProject {
  const store = createProjectStore(backend);
  let base = 0;
  return {
    async load() {
      const current = await store.load();
      base = current === null ? 0 : current.revision;
      return current;
    },
    async save(project: ProjectEnvelope) {
      const committed = await store.save(project, base);
      base = committed.revision;
      return committed;
    },
    baseRevision: () => base,
  };
}

export { InvalidProjectError, StaleRevisionError };