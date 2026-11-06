import { describe, expect, it } from 'vitest';
import { reportFailures } from './macos-smoke-check.mjs';

const good = {
  ok: true, failures: [], appVersion: '1.0.0', apogeeM: 533.2, maxMach: 0.62, railExitSpeedMps: 18.4,
  terminationReason: 'touchdown', engine: { kind: 'wasm-worker', poolStarted: true }, pageErrors: [],
};

describe('macOS smoke report assertions', () => {
  it('accepts the baseline flight', () => {
    expect(reportFailures(good, '1.0.0')).toEqual([]);
  });

  it.each([
    ['apogee drift', { apogeeM: 540 }],
    ['missing apogee', { apogeeM: null }],
    ['timeout termination', { terminationReason: 'timeout' }],
    ['a non-WASM engine', { engine: { kind: 'test-engine', poolStarted: true } }],
    ['an unstarted pool', { engine: { kind: 'wasm-worker', poolStarted: false } }],
    ['page errors', { pageErrors: ['boom'] }],
    ['an app-side failure', { ok: false, failures: ['x'] }],
    ['the wrong version', { appVersion: '0.10.0' }],
  ])('rejects %s', (_name, change) => {
    expect(reportFailures({ ...good, ...change }, '1.0.0')).not.toEqual([]);
  });

  it('rejects a non-object report', () => {
    expect(reportFailures(null)).not.toEqual([]);
  });
});
