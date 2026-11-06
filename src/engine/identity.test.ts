import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareEngineIdentity, describeEngineIdentity, loadEngineModule, parseEngineIdentity } from './identity';

// Valid modules returning different values, not filenames or build-version fixtures.
const nativeCrypto = globalThis.crypto;
const wasm = (value = 41) => new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,7,9,1,5,118,97,108,117,101,0,0,10,6,1,4,0,65,value,11]);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const response = (bytes: Uint8Array) => new Response(new Uint8Array(bytes).buffer);

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('exact runtime WASM identity', () => {
  it('hashes the same buffer compiled, fetches once even when the next response differs, and executes those bytes', async () => {
    const first = wasm(41), later = wasm(42);
    const fetcher = vi.fn().mockResolvedValueOnce(response(first)).mockResolvedValue(response(later));
    vi.stubGlobal('fetch', fetcher);
    const digest = vi.fn((algorithm: string, bytes: BufferSource) => nativeCrypto.subtle.digest(algorithm, bytes as ArrayBuffer));
    vi.stubGlobal('crypto', { subtle: { digest } });
    const compile = vi.spyOn(WebAssembly, 'compile');
    const a = await loadEngineModule('/engine.wasm');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(digest.mock.calls[0][1]).toBe(compile.mock.calls[0][0]);
    expect(a.engineIdentity).toEqual({ kind: 'production-rust-wasm', sha256: sha(first) });
    const instance = await WebAssembly.instantiate(a.module);
    expect((instance.exports.value as () => number)()).toBe(41);
    const b = await loadEngineModule('/engine.wasm');
    expect(b.engineIdentity.sha256).toBe(sha(later));
    expect(compareEngineIdentity(a.engineIdentity, b.engineIdentity)).toBe('different');
    expect(Object.isFrozen(a.engineIdentity)).toBe(true);
  });

  it.each(['missing', 'rejecting'])('still compiles with an unknown checksum when WebCrypto is %s', async (mode) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(wasm())));
    vi.stubGlobal('crypto', mode === 'missing' ? undefined : { subtle: { digest: vi.fn().mockRejectedValue(new Error('disabled')) } });
    const loaded = await loadEngineModule('/engine.wasm');
    expect(loaded.module).toBeInstanceOf(WebAssembly.Module);
    expect(loaded.engineIdentity).toEqual({ kind: 'production-rust-wasm', sha256: null });
    expect(compareEngineIdentity(loaded.engineIdentity, loaded.engineIdentity)).toBe('unknown');
  });

  it('fails on fetch or invalid bytes without producing an identity or refetching', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('missing', { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(loadEngineModule('/missing')).rejects.toThrow(/404/);
    fetcher.mockResolvedValue(response(new Uint8Array([1,2,3])));
    await expect(loadEngineModule('/invalid')).rejects.toBeInstanceOf(WebAssembly.CompileError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps absent legacy identity unknown and strictly validates stored metadata', () => {
    const a = parseEngineIdentity({ kind: 'production-rust-wasm', sha256: 'a'.repeat(64) });
    expect(compareEngineIdentity(undefined, a)).toBe('unknown');
    expect(compareEngineIdentity(a, a)).toBe('same');
    expect(describeEngineIdentity(undefined)).toMatch(/unknown.*legacy/);
    expect(compareEngineIdentity(a, parseEngineIdentity({ kind: 'test-engine', sha256: null }))).toBe('different');
    for (const raw of [null, {}, {kind:'test-engine',sha256:'a'.repeat(64)}, {kind:'production-rust-wasm',sha256:'v1'}, {kind:'production-rust-wasm'}]) {
      expect(() => parseEngineIdentity(raw)).toThrow(/engineIdentity/);
    }
  });
});

class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  module?: WebAssembly.Module;
  call?: { id: number };
  terminated = false;
  constructor() { FakeWorker.all.push(this); }
  postMessage(msg: { type: string; module?: WebAssembly.Module; id: number }): void {
    if (msg.type === 'init') this.module = msg.module;
    else this.call = msg;
  }
  terminate(): void { this.terminated = true; }
  async reply(): Promise<void> {
    const instance = await WebAssembly.instantiate(this.module!);
    this.onmessage?.({ data: { id: this.call!.id, ok: (instance.exports.value as () => number)() } } as MessageEvent);
    this.call = undefined;
  }
}

describe('invocation-bound pool identity', () => {
  it('retains one fetched identity through replacement, concurrent workers, cancellation and test override changes', async () => {
    vi.resetModules();
    FakeWorker.all = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('crypto', nativeCrypto);
    const fetcher = vi.fn().mockResolvedValue(response(wasm(41)));
    vi.stubGlobal('fetch', fetcher);
    const engine = await import('./index');
    const abort = new AbortController();
    const cancelled = engine.engineInvokeRecorded('flight', {}, { signal: abort.signal });
    const rejected = expect(cancelled).rejects.toBeInstanceOf(engine.CancelledError);
    await vi.waitFor(() => expect(FakeWorker.all[0].module).toBeTruthy());
    abort.abort();
    await rejected;
    expect(FakeWorker.all[0].terminated).toBe(true);
    const real = engine.engineInvokeRecorded<number>('flight');
    const other = engine.engineInvokeRecorded<number>('stability');
    let finishTest: (value: unknown) => void = () => undefined;
    engine.setTestEngine((<T>() => new Promise<T>((resolve) => { finishTest = (value) => resolve(value as T); })) as typeof engine.engineInvoke);
    const test = engine.engineInvokeRecorded('test');
    expect(await engine.getEngineIdentity()).toEqual({ kind: 'test-engine', sha256: null });
    engine.setTestEngine(null);
    finishTest(99);
    expect((await test).engineIdentity).toEqual({ kind: 'test-engine', sha256: null });
    await vi.waitFor(() => expect(FakeWorker.all.filter((worker) => !worker.terminated && worker.module)).toHaveLength(2));
    await Promise.all(FakeWorker.all.filter((worker) => !worker.terminated).map((worker) => worker.reply()));
    const [a, b] = await Promise.all([real, other]);
    expect(a.value).toBe(41);
    expect(a.engineIdentity).toEqual({ kind: 'production-rust-wasm', sha256: sha(wasm(41)) });
    expect(b.engineIdentity).toBe(a.engineIdentity);
    expect(await engine.getEngineIdentity()).toBe(a.engineIdentity);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not invent identity when the runtime backend is unavailable', async () => {
    vi.resetModules();
    vi.stubGlobal('Worker', undefined);
    const engine = await import('./index');
    expect(await engine.getEngineIdentity()).toEqual({ kind: 'unavailable', sha256: null });
    await expect(engine.engineInvokeRecorded('flight')).rejects.toThrow(/no TypeScript fallback/);
  });
});
