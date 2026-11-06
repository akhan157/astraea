/**
 * The app's one engine entry: Rust `astraea-engine` as WebAssembly, run in a
 * pool of background workers. The website and the desktop shell use this
 * same path, so both compute identical results.
 *
 * Tests replace the engine with `setTestEngine`; with no test engine and no
 * Worker/WebAssembly support (plain Node, jsdom), calls fail closed with a
 * clear message — there is no TypeScript fallback.
 */
import { EnginePool, type CallOptions } from './pool';
import { loadEngineModule, type EngineIdentity } from './identity';
export { compareEngineIdentity, describeEngineIdentity, parseEngineIdentity, type EngineIdentity } from './identity';

export type EngineInvoke = <T>(cmd: string, args?: Record<string, unknown>, options?: CallOptions) => Promise<T>;

export { CancelledError, type CallOptions, type Lane } from './pool';

let testEngine: EngineInvoke | null = null;
let pool: EnginePool | null = null;
let poolIdentity: Promise<EngineIdentity> | null = null;

export interface RecordedEngineResult<T> { value: T; engineIdentity: EngineIdentity }

/** Replace the engine (tests). `null` restores the real engine. */
export function setTestEngine(engine: EngineInvoke | null): void {
  testEngine = engine;
}

function supported(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

/** True when engine calls can run here. */
export function engineAvailable(): boolean {
  return testEngine !== null || supported();
}

/**
 * Which engine backend calls use: `wasm-worker` is the production path (the
 * Rust engine as WebAssembly in a worker pool); `poolStarted` is true once a
 * call or identity request has initialized the shared runtime.
 */
export function engineBackend(): { kind: 'test-engine' | 'wasm-worker' | 'unavailable'; poolStarted: boolean } {
  const kind = testEngine !== null ? 'test-engine' : supported() ? 'wasm-worker' : 'unavailable';
  return { kind, poolStarted: pool !== null };
}

/** Worker count: the cores minus one for the UI thread, at least two, at most eight. */
export function poolSize(cores: number | undefined): number {
  const n = Number.isFinite(cores) && cores ? cores : 4;
  return Math.min(8, Math.max(2, n - 1));
}

function getPool(): EnginePool {
  if (pool) return pool;
  const artifact = import('./astraea_engine.wasm?url').then(({ default: url }) => loadEngineModule(url));
  const module = artifact.then((loaded) => loaded.module);
  void module.catch(() => undefined);
  poolIdentity = artifact.then((loaded) => loaded.engineIdentity);
  // A normal (unrecorded) call need not await identity separately.
  void poolIdentity.catch(() => undefined);
  pool = new EnginePool(
    poolSize(typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined),
    () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
    module,
  );
  return pool;
}

/** Current backend only: never use this to attribute an already completed run. */
export function getEngineIdentity(): Promise<EngineIdentity> {
  if (testEngine) return Promise.resolve(Object.freeze({ kind: 'test-engine', sha256: null }));
  if (!supported()) return Promise.resolve(Object.freeze({ kind: 'unavailable', sha256: null }));
  getPool();
  return poolIdentity!;
}

/** Capture the selected backend before dispatch; changing test mode cannot relabel it. */
export function engineInvokeRecorded<T>(cmd: string, args?: Record<string, unknown>, options?: CallOptions): Promise<RecordedEngineResult<T>> {
  const selectedTestEngine = testEngine;
  if (selectedTestEngine) {
    const engineIdentity: EngineIdentity = Object.freeze({ kind: 'test-engine', sha256: null });
    return selectedTestEngine<T>(cmd, args, options).then((value) => ({ value, engineIdentity }));
  }
  if (!supported()) return engineInvoke<T>(cmd, args, options).then((value) => ({ value, engineIdentity: Object.freeze({ kind: 'unavailable', sha256: null }) }));
  const selectedPool = getPool();
  const identity = poolIdentity!;
  // Queue immediately, including its abort listener; do not wait on hashing first.
  return Promise.all([selectedPool.call<T>(cmd, args, options), identity]).then(([value, engineIdentity]) => ({ value, engineIdentity }));
}

/** Run one engine command. */
export const engineInvoke: EngineInvoke = (cmd, args, options) => {
  if (testEngine) return testEngine(cmd, args, options);
  if (!supported()) {
    return Promise.reject(
      new Error(
        `Astraea engine: ${cmd} needs WebAssembly and Web Workers, which this environment lacks. ` +
          'There is no TypeScript fallback.',
      ),
    );
  }
  return getPool().call(cmd, args, options);
};
