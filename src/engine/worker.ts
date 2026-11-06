/**
 * Engine worker: one WebAssembly engine instance off the UI thread.
 *
 * Protocol (structured clone):
 *   in  { type: 'init', module: WebAssembly.Module }
 *   in  { type: 'call', id, cmd, args }
 *   out { type: 'reply', id, ok } | { type: 'reply', id, error }
 *
 * A trap poisons the instance; the worker rebuilds it from the same compiled
 * module before the next call, so one bad input never disables the engine.
 */
import { engineFromInstance, type EngineInstance } from './core';

let provideModule: (module: WebAssembly.Module) => void = () => undefined;
const module = new Promise<WebAssembly.Module>((resolve) => {
  provideModule = resolve;
});
let engine: EngineInstance | null = null;

async function ready(): Promise<EngineInstance> {
  if (!engine || engine.poisoned) engine = engineFromInstance(await WebAssembly.instantiate(await module, {}));
  return engine;
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as
    | { type: 'init'; module: WebAssembly.Module }
    | { type: 'call'; id: number; cmd: string; args: Record<string, unknown> };
  if (msg.type === 'init') {
    provideModule(msg.module);
    return;
  }
  try {
    const result = (await ready()).call(msg.cmd, msg.args);
    self.postMessage({ type: 'reply', id: msg.id, ok: result });
  } catch (err) {
    self.postMessage({ type: 'reply', id: msg.id, error: err instanceof Error ? err.message : String(err) });
  }
};
