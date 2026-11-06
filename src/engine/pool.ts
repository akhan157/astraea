/**
 * Pool of engine workers, one WebAssembly instance each.
 *
 * - The module is compiled once and shared with every worker.
 * - Two lanes: `interactive` calls (stability, a single flight) jump the queue
 *   and always have one worker reserved for them, so a running Monte Carlo
 *   never delays live feedback; `batch` calls (ensemble chunks) use the rest.
 * - Cancelling a queued call drops it; cancelling a running call terminates
 *   its worker and starts a fresh one, so stale work never keeps a core busy.
 */

export type Lane = 'interactive' | 'batch';

export interface CallOptions {
  signal?: AbortSignal;
  lane?: Lane;
}

interface Job {
  id: number;
  cmd: string;
  args: Record<string, unknown>;
  lane: Lane;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface Slot {
  worker: Worker;
  job: Job | null;
}

export class CancelledError extends Error {
  constructor(cmd: string) {
    super(`${cmd}: cancelled`);
    this.name = 'CancelledError';
  }
}

export class EnginePool {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private nextId = 1;

  constructor(
    private readonly size: number,
    private readonly makeWorker: () => Worker,
    private readonly module: Promise<WebAssembly.Module>,
  ) {}

  call<T>(cmd: string, args: Record<string, unknown> = {}, options: CallOptions = {}): Promise<T> {
    const { signal, lane = 'interactive' } = options;
    if (signal?.aborted) return Promise.reject(new CancelledError(cmd));
    return new Promise<T>((resolve, reject) => {
      const job: Job = { id: this.nextId++, cmd, args, lane, resolve: resolve as (v: unknown) => void, reject, signal };
      if (signal) {
        job.onAbort = () => this.cancel(job);
        signal.addEventListener('abort', job.onAbort, { once: true });
      }
      if (lane === 'interactive') this.queue.unshift(job);
      else this.queue.push(job);
      this.pump();
    });
  }

  /** Stop every worker (page unload, tests). */
  dispose(): void {
    for (const slot of this.slots) slot.worker.terminate();
    this.slots = [];
    for (const job of this.queue) job.reject(new CancelledError(job.cmd));
    this.queue = [];
  }

  private spawn(): Slot {
    const worker = this.makeWorker();
    // The worker holds calls until its module arrives, so spawning stays
    // synchronous and the pool can never overshoot its size.
    void this.module.then(
      (module) => worker.postMessage({ type: 'init', module }),
      (err: unknown) => this.fail(slot, err instanceof Error ? err : new Error(String(err))),
    );
    const slot: Slot = { worker, job: null };
    worker.onmessage = (event: MessageEvent) => this.settle(slot, event.data);
    worker.onerror = (event: ErrorEvent) => this.fail(slot, new Error(`engine worker failed: ${event.message}`));
    this.slots.push(slot);
    return slot;
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const batchBusy = this.slots.filter((s) => s.job?.lane === 'batch').length;
      const batchLimit = Math.max(1, this.size - 1);
      const index = this.queue.findIndex((j) => j.lane === 'interactive' || batchBusy < batchLimit);
      if (index === -1) return;
      let slot = this.slots.find((s) => s.job === null);
      if (!slot) {
        if (this.slots.length >= this.size) return;
        slot = this.spawn();
      }
      const [job] = this.queue.splice(index, 1);
      if (!job) return;
      slot.job = job;
      slot.worker.postMessage({ type: 'call', id: job.id, cmd: job.cmd, args: job.args });
    }
  }

  private finish(slot: Slot): Job | null {
    const job = slot.job;
    slot.job = null;
    if (job?.signal && job.onAbort) job.signal.removeEventListener('abort', job.onAbort);
    return job;
  }

  private settle(slot: Slot, msg: { id: number; ok?: unknown; error?: string }): void {
    if (slot.job?.id !== msg.id) return;
    const job = this.finish(slot);
    if (job) {
      if (msg.error !== undefined) job.reject(new Error(msg.error));
      else job.resolve(msg.ok);
    }
    this.pump();
  }

  private fail(slot: Slot, error: Error): void {
    const job = this.finish(slot);
    this.replace(slot);
    job?.reject(error);
    this.pump();
  }

  private replace(slot: Slot): void {
    slot.worker.terminate();
    this.slots = this.slots.filter((s) => s !== slot);
  }

  private cancel(job: Job): void {
    const queued = this.queue.indexOf(job);
    if (queued !== -1) {
      this.queue.splice(queued, 1);
    } else {
      const slot = this.slots.find((s) => s.job === job);
      if (!slot) return;
      this.finish(slot);
      this.replace(slot);
    }
    job.reject(new CancelledError(job.cmd));
    this.pump();
  }
}
