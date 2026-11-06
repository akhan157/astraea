/**
 * Scripted smoke mode for the packaged desktop app (CI, macOS acceptance
 * smoke). It is inert unless the shell was launched with `ASTRAEA_SMOKE_OUT`:
 * only then does the shell inject `window.__ASTRAEA_SMOKE__` before the page
 * loads. The app then waits for its own startup flight, reports what it
 * measured to the shell's `smoke_report` command, and the shell writes the
 * file and exits. The shell refuses the command without the environment
 * variable, so setting the flag from page content achieves nothing.
 */
import { useAnalysisStore } from '../state/analysis';
import { committedRun } from '../console/store';
import { engineBackend } from '../engine';

/** The shell's smoke flag: page errors recorded since the page began loading. */
interface SmokeFlag {
  errors: string[];
}

interface SmokeScope {
  __ASTRAEA_SMOKE__?: SmokeFlag;
  __TAURI__?: {
    core?: { invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
    app?: { getVersion?: () => Promise<string> };
  };
}

export const SMOKE_TIMEOUT_MS = 180_000;

export interface WebGlProbe {
  available: boolean;
  renderer?: string;
  vendor?: string;
  version?: string;
}

export interface SmokeReport {
  ok: boolean;
  failures: string[];
  appVersion: string | null;
  apogeeM: number | null;
  maxMach: number | null;
  railExitSpeedMps: number | null;
  railExitTimeS: number | null;
  terminationReason: string | null;
  validity: string | null;
  flightDurationS: number | null;
  engine: ReturnType<typeof engineBackend>;
  webgl: WebGlProbe;
  pageErrors: string[];
  userAgent: string;
  elapsedMs: number;
}

/** The smoke flag and the invoke bridge, or null when smoke mode is not on. */
export function smokeSession(scope: SmokeScope): { flag: SmokeFlag; invoke: NonNullable<NonNullable<SmokeScope['__TAURI__']>['core']>['invoke'] } | null {
  const flag = scope.__ASTRAEA_SMOKE__;
  const invoke = scope.__TAURI__?.core?.invoke;
  if (flag === undefined || !Array.isArray(flag.errors) || typeof invoke !== 'function') return null;
  return { flag, invoke };
}

/** Whether a WebGL context can be created, and which renderer backs it. */
export function probeWebGl(doc: Document): WebGlProbe {
  try {
    const canvas = doc.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl === null) return { available: false };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      available: true,
      renderer: String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
      vendor: String(gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR)),
      version: String(gl.getParameter(gl.VERSION)),
    };
  } catch {
    return { available: false };
  }
}

type Settled = { kind: 'completed' } | { kind: 'failed'; error: string } | { kind: 'timeout' };

/** Resolve when the app's own startup flight completes or fails; never start one. */
function startupFlight(timeoutMs: number): Promise<Settled> {
  return new Promise((resolve) => {
    let unsubscribe = (): void => {};
    const timer = setTimeout(() => { unsubscribe(); resolve({ kind: 'timeout' }); }, timeoutMs);
    const check = (): boolean => {
      const state = useAnalysisStore.getState();
      const record = state.records.flight;
      const settled: Settled | null = record?.status === 'failed'
        ? { kind: 'failed', error: record.error ?? 'flight failed' }
        : committedRun() !== null && record?.status === 'completed' ? { kind: 'completed' } : null;
      if (settled === null) return false;
      clearTimeout(timer);
      unsubscribe();
      resolve(settled);
      return true;
    };
    if (!check()) unsubscribe = useAnalysisStore.subscribe(() => { check(); });
  });
}

/** Run the smoke when the shell enabled it; a no-op everywhere else. */
export async function runSmoke(scope: SmokeScope & { document?: Document; navigator?: Navigator } = window as unknown as SmokeScope, timeoutMs = SMOKE_TIMEOUT_MS): Promise<boolean> {
  const session = smokeSession(scope);
  if (session === null) return false;
  const started = performance.now();
  const settled = await startupFlight(timeoutMs);
  const run = committedRun()?.run ?? null;
  const failures: string[] = [];
  if (settled.kind === 'timeout') failures.push(`startup flight did not finish within ${timeoutMs} ms`);
  if (settled.kind === 'failed') failures.push(`startup flight failed: ${settled.error}`);
  const engine = engineBackend();
  if (engine.kind !== 'wasm-worker' || !engine.poolStarted) {
    failures.push(`engine backend was ${engine.kind} (pool started: ${engine.poolStarted}), expected the WASM worker pool`);
  }
  let appVersion: string | null = null;
  try { appVersion = (await scope.__TAURI__?.app?.getVersion?.()) ?? null; } catch { /* reported as null */ }
  const railExit = run?.events.find((event) => event.kind === 'rail_exit');
  const report: SmokeReport = {
    ok: failures.length === 0,
    failures,
    appVersion,
    apogeeM: run?.summary.apogee.value ?? null,
    maxMach: run?.summary.maxMach.value ?? null,
    railExitSpeedMps: run?.summary.railExitSpeed.value ?? null,
    railExitTimeS: railExit?.t ?? null,
    terminationReason: run?.terminationReason ?? null,
    validity: run?.summary.validity ?? null,
    flightDurationS: run?.summary.flightTime.value ?? null,
    engine,
    webgl: scope.document ? probeWebGl(scope.document) : { available: false },
    pageErrors: [...session.flag.errors],
    userAgent: scope.navigator?.userAgent ?? '',
    elapsedMs: Math.round(performance.now() - started),
  };
  try {
    await session.invoke?.('smoke_report', { report });
  } catch (error) {
    // The shell refused or failed to write; the process then never exits on
    // its own, so the caller's wait times out. Surface it in the console.
    console.error(`smoke report was not accepted: ${String(error)}`);
  }
  return true;
}
