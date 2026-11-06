// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightRun } from '../console/data/contract';
import { useAnalysisStore } from '../state/analysis';
import { probeWebGl, runSmoke, smokeSession } from './smoke';

const backend = vi.hoisted(() => ({ kind: 'wasm-worker' as string, poolStarted: true }));
vi.mock('../engine', () => ({ engineBackend: () => ({ ...backend }) }));

const result = (value: number) => ({ value, unit: '', confidence: 'modeled', reason: '' });
const run = {
  summary: {
    validity: 'PASS',
    apogee: result(533.2),
    maxMach: result(0.62),
    railExitSpeed: result(18.4),
    flightTime: result(88.1),
  },
  terminationReason: 'touchdown',
  events: [{ t: 0.31, kind: 'rail_exit', label: 'Rail exit', altitude: 3, velocity: 18 }],
} as unknown as FlightRun;

function completeFlight(): void {
  const token = useAnalysisStore.getState().start('flight', 'key', { design: {} });
  useAnalysisStore.getState().resolve('flight', token, { design: {}, run, previous: null });
}

// jsdom has no canvas: a document whose canvases never yield a context.
const noGlDocument = { createElement: () => ({ getContext: () => null }) } as unknown as Document;

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function scope(opts: { flag?: boolean; invoke?: Invoke; errors?: string[] }) {
  return {
    ...(opts.flag ? { __ASTRAEA_SMOKE__: { errors: opts.errors ?? [] } } : {}),
    __TAURI__: { core: opts.invoke ? { invoke: opts.invoke } : {}, app: { getVersion: async () => '1.0.0' } },
    document: noGlDocument,
    navigator,
  };
}

beforeEach(() => {
  backend.kind = 'wasm-worker';
  backend.poolStarted = true;
  useAnalysisStore.getState().reset();
});
afterEach(() => vi.useRealTimers());

describe('desktop smoke mode gating', () => {
  it('takes no report path without the shell flag, even with a Tauri bridge', async () => {
    const invoke = vi.fn<Invoke>(async () => undefined);
    completeFlight();
    expect(smokeSession(scope({ invoke }))).toBeNull();
    expect(await runSmoke(scope({ invoke }), 10)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('takes no report path with the flag but no Tauri bridge (a plain browser)', async () => {
    expect(smokeSession(scope({ flag: true }))).toBeNull();
    expect(await runSmoke(scope({ flag: true }), 10)).toBe(false);
  });

  it('rejects a malformed flag', () => {
    const bad = { ...scope({ invoke: async () => undefined }), __ASTRAEA_SMOKE__: { errors: 'nope' } };
    expect(smokeSession(bad as never)).toBeNull();
  });
});

describe('desktop smoke report', () => {
  it('reports the startup flight to the shell when the flag is present', async () => {
    const invoke = vi.fn<Invoke>(async () => undefined);
    completeFlight();
    expect(await runSmoke(scope({ flag: true, invoke, errors: [] }), 1000)).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, args] = invoke.mock.calls[0];
    expect(command).toBe('smoke_report');
    expect(args?.report).toMatchObject({
      ok: true,
      failures: [],
      appVersion: '1.0.0',
      apogeeM: 533.2,
      maxMach: 0.62,
      railExitSpeedMps: 18.4,
      railExitTimeS: 0.31,
      terminationReason: 'touchdown',
      engine: { kind: 'wasm-worker', poolStarted: true },
      pageErrors: [],
    });
  });

  it('waits for the app\'s own flight instead of starting one', async () => {
    const invoke = vi.fn<Invoke>(async () => undefined);
    const done = runSmoke(scope({ flag: true, invoke }), 5000);
    await Promise.resolve();
    expect(invoke).not.toHaveBeenCalled();
    completeFlight();
    await done;
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('fails the report on timeout instead of hanging', async () => {
    const invoke = vi.fn<Invoke>(async () => undefined);
    await runSmoke(scope({ flag: true, invoke }), 20);
    const report = invoke.mock.calls[0][1]?.report as { ok: boolean; failures: string[]; apogeeM: unknown };
    expect(report.ok).toBe(false);
    expect(report.failures[0]).toMatch(/did not finish/);
    expect(report.apogeeM).toBeNull();
  });

  it('fails the report when the flight fails', async () => {
    const invoke = vi.fn<Invoke>(async () => undefined);
    const token = useAnalysisStore.getState().start('flight', 'key', { design: {} });
    useAnalysisStore.getState().reject('flight', token, 'engine exploded');
    await runSmoke(scope({ flag: true, invoke }), 1000);
    const report = invoke.mock.calls[0][1]?.report as { ok: boolean; failures: string[] };
    expect(report.ok).toBe(false);
    expect(report.failures.join()).toContain('engine exploded');
  });

  it.each([
    ['test-engine', true],
    ['unavailable', false],
    ['wasm-worker', false],
  ])('does not pass a %s backend (pool started: %s)', async (kind, poolStarted) => {
    backend.kind = kind;
    backend.poolStarted = poolStarted;
    const invoke = vi.fn<Invoke>(async () => undefined);
    completeFlight();
    await runSmoke(scope({ flag: true, invoke }), 1000);
    expect((invoke.mock.calls[0][1]?.report as { ok: boolean }).ok).toBe(false);
  });

  it('carries recorded page errors into the report without failing on them itself', async () => {
    const invoke = vi.fn<Invoke>(async () => undefined);
    completeFlight();
    await runSmoke(scope({ flag: true, invoke, errors: ['boom'] }), 1000);
    expect(invoke.mock.calls[0][1]?.report).toMatchObject({ pageErrors: ['boom'] });
  });

  it('records WebGL as unavailable where no context exists', () => {
    expect(probeWebGl(noGlDocument)).toEqual({ available: false });
  });
});
