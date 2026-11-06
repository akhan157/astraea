/**
 * Synchronous access to one instance of the Astraea engine (Rust
 * `crates/astraea-engine` compiled to WebAssembly).
 *
 * The boundary is JSON text through linear memory: the host allocates two
 * buffers (command name, arguments), calls `engine_call`, and reads the reply
 * `{"ok": …}` or `{"error": "…"}`. An engine error rejects with the engine's
 * message; a WebAssembly trap (a Rust panic) poisons the instance, and the
 * caller must create a new one — `EngineInstance.poisoned` says so.
 *
 * Workers own one instance each; Node tests instantiate the same file
 * directly, so the bytes the app ships are the bytes the tests exercise.
 */

interface EngineExports {
  memory: WebAssembly.Memory;
  engine_alloc(len: number): number;
  engine_free(ptr: number, len: number): void;
  engine_call(cmdPtr: number, cmdLen: number, argsPtr: number, argsLen: number): void;
  engine_reply_ptr(): number;
  engine_reply_len(): number;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

export interface EngineInstance {
  call<T>(cmd: string, args?: Record<string, unknown>): T;
  /** True after a trap: the instance's memory may be inconsistent. */
  readonly poisoned: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function write(e: EngineExports, bytes: Uint8Array): number {
  const ptr = e.engine_alloc(bytes.length);
  new Uint8Array(e.memory.buffer, ptr, bytes.length).set(bytes);
  return ptr;
}

export function engineFromInstance(instance: WebAssembly.Instance): EngineInstance {
  const e = instance.exports as unknown as EngineExports;
  let poisoned = false;
  return {
    get poisoned() {
      return poisoned;
    },
    call<T>(cmd: string, args: Record<string, unknown> = {}): T {
      if (poisoned) throw new EngineError('engine: instance is unusable after an internal failure');
      const cmdBytes = encoder.encode(cmd);
      const argBytes = encoder.encode(JSON.stringify(args));
      let reply: { ok?: T; error?: string };
      try {
        const cmdPtr = write(e, cmdBytes);
        const argPtr = write(e, argBytes);
        e.engine_call(cmdPtr, cmdBytes.length, argPtr, argBytes.length);
        e.engine_free(cmdPtr, cmdBytes.length);
        e.engine_free(argPtr, argBytes.length);
        const text = decoder.decode(new Uint8Array(e.memory.buffer, e.engine_reply_ptr(), e.engine_reply_len()));
        reply = JSON.parse(text);
      } catch (err) {
        poisoned = true;
        throw new EngineError(`engine: internal failure in ${cmd}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (typeof reply.error === 'string') throw new EngineError(reply.error);
      return reply.ok as T;
    },
  };
}

export async function instantiateEngine(source: BufferSource | WebAssembly.Module): Promise<EngineInstance> {
  const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
  return engineFromInstance(await WebAssembly.instantiate(module, {}));
}
