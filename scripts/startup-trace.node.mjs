// Dependency-free contract checks for the before-app script; no main/App import.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const script = readFileSync(new URL('../src-tauri/src/startup_trace.js', import.meta.url), 'utf8');
function page({ bridge = true } = {}) {
  const listeners = new Map();
  const timeouts = [];
  const calls = [];
  let interval;
  let intervalActive = false;
  let rootChildren = 0;
  const scope = {
    document: { getElementById: () => ({ childElementCount: rootChildren }) },
    addEventListener: (name, callback) => {
      listeners.set(name, [...(listeners.get(name) || []), callback]);
    },
    setTimeout: (callback, ms) => { const id = { callback, ms, active: true }; timeouts.push(id); return id; },
    clearTimeout: (id) => { id.active = false; },
    setInterval: (callback) => { interval = callback; intervalActive = true; return 1; },
    clearInterval: () => { intervalActive = false; },
  };
  scope.window = scope;
  scope.top = scope;
  const enableBridge = (invoke = async (command, args) => { calls.push({ command, args }); }) => {
    scope.__TAURI__ = { core: { invoke } };
  };
  if (bridge) enableBridge();
  vm.runInNewContext(script, scope);
  return {
    calls, scope, enableBridge,
    dispatch: (name, event = {}) => { for (const fn of listeners.get(name) || []) fn(event); },
    timeout: (ms) => { for (const id of timeouts.filter((id) => id.ms === ms && id.active)) { id.active = false; id.callback(); } },
    root: (children) => { rootChildren = children; },
    tick: async (count = 1) => {
      for (let i = 0; i < count; i++) {
        if (intervalActive) interval();
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    intervalActive: () => intervalActive,
    pendingTimeouts: () => timeouts.filter((id) => id.active),
  };
}

test('early script resource/CSP/JS failures reach native without executing App', async () => {
  const p = page();
  // The before-app listener sees capture-phase resource errors even if main is missing.
  p.dispatch('error', { target: { tagName: 'SCRIPT' }, message: 'secret /user/rocket.json', filename: 'https://private/?token=secret' });
  p.dispatch('error', { target: p.scope, message: 'rocket coordinates secret' });
  p.dispatch('unhandledrejection', { reason: new Error('private project secret') });
  p.dispatch('securitypolicyviolation', { effectiveDirective: 'worker-src', blockedURI: 'https://private/secret' });
  p.timeout(5000);
  await p.tick(10);
  assert.deepEqual(p.calls.map((call) => call.args.event), [
    'document_init', 'script_resource_error', 'js_error', 'rejected_promise', 'csp_worker', 'root_empty_5s',
  ]);
  assert.ok(p.calls.every((call) => call.command === 'startup_trace_event' && Object.keys(call.args).join() === 'event'));
  assert.doesNotMatch(JSON.stringify(p.calls), /secret|private|rocket|https|message|filename/);
});

test('late bridge preserves observations and populated-root watchdog does not inspect text', async () => {
  const p = page({ bridge: false });
  p.dispatch('error', { target: { tagName: 'SCRIPT' } });
  await p.tick(5);
  assert.equal(p.calls.length, 0);
  p.enableBridge();
  p.root(1);
  p.timeout(15000);
  await p.tick(5);
  assert.deepEqual(p.calls.map((call) => call.args.event), ['document_init', 'script_resource_error', 'root_present_15s']);
});

test('error storms have bounded per-code counts and queue; retries/watchdogs stop at 240 s', async () => {
  const p = page({ bridge: false });
  const flood = () => {
    for (let i = 0; i < 100; i++) {
      for (const tagName of ['SCRIPT', 'LINK', 'IMG']) p.dispatch('error', { target: { tagName } });
      p.dispatch('error', { target: p.scope });
      p.dispatch('unhandledrejection');
      for (const effectiveDirective of ['script-src', 'style-src', 'connect-src', 'worker-src', 'img-src']) {
        p.dispatch('securitypolicyviolation', { effectiveDirective });
      }
    }
  };
  flood();
  p.enableBridge();
  await p.tick(100);
  assert.equal(p.calls.length, 32); // including init, queue never exceeds 32
  for (const event of new Set(p.calls.map((call) => call.args.event))) {
    assert.ok(p.calls.filter((call) => call.args.event === event).length <= 4);
  }
  flood();
  await p.tick(100);
  assert.ok(p.calls.length <= 64);
  p.timeout(240000);
  assert.equal(p.intervalActive(), false);
  assert.equal(p.pendingTimeouts().length, 0);
  const before = p.calls.length;
  p.dispatch('load');
  await p.tick(100);
  assert.equal(p.calls.length, before);
});

test('refused or throwing bridge does not propagate failures into page code', async () => {
  const p = page();
  let attempts = 0;
  p.enableBridge(() => { attempts++; throw new Error('bridge refused'); });
  p.dispatch('error', { target: { tagName: 'SCRIPT' } });
  await p.tick(10);
  assert.equal(attempts, 2);
  p.timeout(240000);
});
