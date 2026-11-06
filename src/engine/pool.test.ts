import { describe, expect, it } from 'vitest';
import { CancelledError, EnginePool } from './pool';

/** A Worker stand-in: records calls; the test answers or crashes them. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  calls: Array<{ id: number; cmd: string }> = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: { type: string; id: number; cmd: string }): void {
    if (msg.type === 'call') this.calls.push({ id: msg.id, cmd: msg.cmd });
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(ok: unknown = 'done'): void {
    const call = this.calls.shift();
    if (!call) throw new Error('no call to answer');
    this.onmessage?.({ data: { type: 'reply', id: call.id, ok } } as MessageEvent);
  }
  crash(): void {
    this.onerror?.({ message: 'boom' } as ErrorEvent);
  }
}

function makePool(size: number): EnginePool {
  FakeWorker.all = [];
  return new EnginePool(size, () => new FakeWorker() as unknown as Worker, Promise.resolve({} as WebAssembly.Module));
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('engine pool', () => {
  it('never grows past its size and queues the rest', async () => {
    const pool = makePool(2);
    const results = [1, 2, 3].map((n) => pool.call('stability', { n }));
    await flush();
    expect(FakeWorker.all).toHaveLength(2);
    FakeWorker.all[0].reply('a');
    await flush();
    // The freed worker picks up the queued call.
    expect(FakeWorker.all[0].calls).toHaveLength(1);
    FakeWorker.all[0].reply('c');
    FakeWorker.all[1].reply('b');
    await expect(Promise.all(results)).resolves.toEqual(['a', 'b', 'c']);
  });

  it('keeps one worker for interactive calls while batch work saturates the rest', async () => {
    const pool = makePool(3);
    const batch = Array.from({ length: 6 }, (_, i) => pool.call('run_ensemble_chunk', { i }, { lane: 'batch' }));
    await flush();
    const busy = () => FakeWorker.all.filter((w) => w.calls.length > 0).length;
    expect(busy()).toBe(2);
    const live = pool.call('stability', {}, { lane: 'interactive' });
    await flush();
    expect(FakeWorker.all).toHaveLength(3);
    FakeWorker.all[2].reply('live');
    await expect(live).resolves.toBe('live');
    for (let i = 0; i < 6; i += 1) {
      const worker = FakeWorker.all.find((w) => w.calls.length > 0)!;
      worker.reply(i);
      await flush();
    }
    await expect(Promise.all(batch)).resolves.toHaveLength(6);
  });

  it('drops a cancelled queued call and terminates a cancelled running one', async () => {
    const pool = makePool(1);
    const running = new AbortController();
    const queued = new AbortController();
    const a = pool.call('simulate_flight', {}, { signal: running.signal });
    const b = pool.call('simulate_flight', {}, { signal: queued.signal });
    await flush();
    queued.abort();
    await expect(b).rejects.toBeInstanceOf(CancelledError);
    expect(FakeWorker.all[0].calls).toHaveLength(1);
    running.abort();
    await expect(a).rejects.toBeInstanceOf(CancelledError);
    expect(FakeWorker.all[0].terminated).toBe(true);
    // The pool replaces the terminated worker on the next call.
    const c = pool.call('stability');
    await flush();
    expect(FakeWorker.all).toHaveLength(2);
    FakeWorker.all[1].reply('fresh');
    await expect(c).resolves.toBe('fresh');
  });

  it('rejects an already-aborted call without starting work', async () => {
    const pool = makePool(1);
    const controller = new AbortController();
    controller.abort();
    await expect(pool.call('stability', {}, { signal: controller.signal })).rejects.toBeInstanceOf(CancelledError);
    expect(FakeWorker.all).toHaveLength(0);
  });

  it('fails the running call and recovers when a worker crashes', async () => {
    const pool = makePool(1);
    const doomed = pool.call('stability');
    await flush();
    FakeWorker.all[0].crash();
    await expect(doomed).rejects.toThrow(/engine worker failed: boom/);
    const next = pool.call('stability');
    await flush();
    FakeWorker.all[1].reply('ok');
    await expect(next).resolves.toBe('ok');
  });
});
