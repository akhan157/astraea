// Measures the built WebAssembly engine's aero-model command path.
// Usage: node scripts/measure-aero-model-wasm.mjs
// Reports microseconds per evaluation (aero_curves = 41 grid evaluations).
import { readFile } from 'node:fs/promises';

const wasm = await WebAssembly.instantiate(
  await readFile(new URL('../src/engine/astraea_engine.wasm', import.meta.url)),
  {},
);
const { exports } = wasm.instance;
const memory = exports.memory;
const enc = new TextEncoder();
const dec = new TextDecoder();

function call(cmd, args) {
  const cmdBytes = enc.encode(cmd);
  const argText = JSON.stringify(args);
  const argBytes = enc.encode(argText);
  const cmdPtr = exports.engine_alloc(cmdBytes.length);
  const argPtr = exports.engine_alloc(argBytes.length);
  new Uint8Array(memory.buffer, cmdPtr, cmdBytes.length).set(cmdBytes);
  new Uint8Array(memory.buffer, argPtr, argBytes.length).set(argBytes);
  exports.engine_call(cmdPtr, cmdBytes.length, argPtr, argBytes.length);
  const replyPtr = exports.engine_reply_ptr();
  const replyLen = exports.engine_reply_len();
  const text = dec.decode(new Uint8Array(memory.buffer, replyPtr, replyLen));
  exports.engine_free(cmdPtr, cmdBytes.length);
  exports.engine_free(argPtr, argBytes.length);
  const parsed = JSON.parse(text);
  if (parsed.error) throw new Error(parsed.error);
  return parsed.ok;
}

const vehicle = JSON.parse(await readFile(new URL('../crates/astraea-engine/tests/fixtures/alpha-vehicle.json', import.meta.url), 'utf8'));
const selection = { modelId: 'aero-buildup', modelVersion: '1.0.0', terms: { transonic: 'legacy' } };

for (let i = 0; i < 5; i += 1) call('aero_curves', { vehicle, motorBurning: false, aeroModel: selection });
const N = 300;
let t = performance.now();
for (let i = 0; i < N; i += 1) call('aero_curves', { vehicle, motorBurning: false, aeroModel: selection });
let dt = performance.now() - t;
console.log(`provider aero_curves: ${(dt * 1000 / N).toFixed(1)} us/call = ${(dt * 1000 / N / 41).toFixed(3)} us/evaluation (n=${N}, 41-grid)`);

for (let i = 0; i < 50; i += 1) call('stability', { vehicle, aeroModel: selection });
t = performance.now();
const M = 2000;
for (let i = 0; i < M; i += 1) call('stability', { vehicle, aeroModel: selection });
dt = performance.now() - t;
console.log(`provider stability:   ${(dt * 1000 / M).toFixed(2)} us/call (n=${M})`);

// Legacy comparison: same commands without the selection.
for (let i = 0; i < 5; i += 1) call('aero_curves', { vehicle, motorBurning: false });
t = performance.now();
for (let i = 0; i < N; i += 1) call('aero_curves', { vehicle, motorBurning: false });
dt = performance.now() - t;
console.log(`legacy aero_curves:   ${(dt * 1000 / N).toFixed(1)} us/call (n=${N})`);
