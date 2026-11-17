// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { captureWorkingSession, startWorkingSession, workingSessionSlot, WORKING_SESSION_KEY, WORKING_SESSION_MAX_BYTES, StaleWorkingSessionError, useRecoveryNote } from './workingSession';
import { adoptProject, exportableProject, useProjectStore } from './project';
import { useAnalysisStore } from './analysis';
import { createIndexedDbBackend, createDurableProject } from '../formats/projectStorage';
import { type ProjectBackend, writeProject } from '../formats/projectJson';
import { currentLoadedLog, rememberLoadedLog } from '../console/evidence/loadedLog';
import { useOverlayFlights } from './overlayFlights';
import { useSessionStore } from './session';
import { largeProject } from '../io/largeProject.fixture';
import { SimFlightOverlay } from '../console/evidence/SimFlightOverlay';
import { AltimetryCard } from '../console/evidence/AltimetryCard';
import { SavedRuns } from '../console/stages/SavedRuns';
import { WorkingSessionNote } from '../App';
import { captureRunInputs } from '../application/runInputs';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { toFlightRun } from '../console/data/adapter';
import { flightResult, pinLegacyFlightDrag } from '../console/testFixtures';
import { recordEvidence } from '../console/evidence/ProjectLedger';
import { buildLogProvenance } from '../evidence/logProvenance';

const csv = 'time_s,altitude_m\n0,0\n1,10\n2,0';
let factory: IDBFactory;
const controllers: Awaited<ReturnType<typeof startWorkingSession>>[] = [];
const backend = () => createIndexedDbBackend(WORKING_SESSION_KEY, factory);
const start = async (storage = backend(), delay = 500) => { const c = await startWorkingSession(storage, delay); controllers.push(c); return c; };
function complete() {
  const project = useProjectStore.getState().project;
  const motor = { id: 'estes_c6', motor: CERTIFIED_MOTORS.estes_c6, provenance: { source: 'certified' as const } };
  const inputs = captureRunInputs(project, motor, 'session-key', undefined);
  const store = useAnalysisStore.getState();
  const token = store.start('flight', inputs.inputKey, null, inputs);
  store.resolve('flight', token, { design: { motorId: motor.id, vehicle: inputs.vehicle }, run: { ...toFlightRun(flightResult(), inputs.vehicle, 'certified', inputs.inputKey, 1, 1), engineIdentity: { kind: 'production-rust-wasm', sha256: 'b'.repeat(64) } }, previous: null });
}
beforeEach(() => {
  factory = new IDBFactory(); useProjectStore.getState().newProject(); pinLegacyFlightDrag(); useAnalysisStore.getState().reset();
  useSessionStore.setState({ notices: [], history: [] }); useRecoveryNote.setState({ message: null });
});
afterEach(() => { controllers.splice(0).forEach(c => c.stop()); cleanup(); vi.useRealTimers(); });

describe('working session recovery', () => {
  it('reloads runs, ledger, exact imported bytes and overlay through the UI without making a fresh result', async () => {
    const c = await start(); complete();
    render(<><AltimetryCard /><SimFlightOverlay /></>);
    fireEvent.change(screen.getByLabelText(/flight log data/i), { target: { value: csv } });
    fireEvent.click(screen.getByRole('button', { name: /add flight log/i }));
    await vi.waitFor(() => expect(useProjectStore.getState().project.ledger).toHaveLength(1));
    const originalBytes = new Uint8Array([239, 187, 191, ...new TextEncoder().encode(csv)]);
    rememberLoadedLog({ csvText: csv, sourceName: 'launch.csv', unitOverrides: {}, log: {
      samples: [{ timeS: 0, altitudeM: 0 }, { timeS: 1, altitudeM: 10 }, { timeS: 2, altitudeM: 0 }], hasVelocity: false, originalBytes,
      provenance: await buildLogProvenance({ rawText: csv, rawBytes: originalBytes, fileName: 'launch.csv', rowCount: 3 }),
    } });
    const expected = writeProject(exportableProject());
    await c.flush(); c.stop(); cleanup();
    useProjectStore.getState().newProject(); useAnalysisStore.getState().reset();
    await start();
    expect(writeProject(exportableProject())).toBe(expected);
    expect(currentLoadedLog()?.log.originalBytes).toEqual(originalBytes);
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    expect(useAnalysisStore.getState().history).toEqual([]);
    render(<><SavedRuns /><SimFlightOverlay /><WorkingSessionNote /></>);
    expect(screen.getByText(/Restored unsaved work from/)).toBeTruthy();
    expect(screen.getByText(/Inputs archived/)).toBeTruthy();
    expect(screen.getByLabelText(/layer flight 1/i)).toBeTruthy();
    expect(useProjectStore.getState().project.cases).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss working session notice' }));
    expect(screen.queryByText(/Restored unsaved work from/)).toBeNull();
  });
  it('uses a separate slot and rejects an actually concurrent stale tab atomically', async () => {
    const explicit = createDurableProject(createIndexedDbBackend(undefined, factory));
    await explicit.save(exportableProject());
    const a = workingSessionSlot(backend()), b = workingSessionSlot(backend());
    await Promise.all([a.load(), b.load()]);
    const results = await Promise.allSettled([a.save(captureWorkingSession()), b.save(captureWorkingSession())]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(StaleWorkingSessionError);
    expect((await explicit.load())?.revision).toBe(1);
  });
  it.each(['broken JSON', '{"version":99}', '{"version":1,"revision":1,"at":"2026-01-01","project":"{}","flights":[],"loaded":null}'])('ignores invalid recovery (%s) with one notice and leaves explicit save alone', async raw => {
    const explicit = createDurableProject(createIndexedDbBackend(undefined, factory));
    await explicit.save(exportableProject()); const expected = await explicit.load();
    await backend().update(() => raw);
    const before = exportableProject(); await start();
    expect(exportableProject()).toEqual(before);
    expect(useSessionStore.getState().notices).toHaveLength(1);
    expect((await explicit.load())).toEqual(expected);
  });
  it('keeps work on quota failure, reports once and retries on a later change', async () => {
    let text: string | null = null, fail = true, writes = 0;
    const storage: ProjectBackend = { read: () => text, update: next => {
      writes++; if (fail) throw new Error('QuotaExceededError'); text = next(text);
    } };
    vi.useFakeTimers(); const c = await start(storage, 20); complete();
    await c.flush(); await c.flush();
    expect(useProjectStore.getState().project.cases).toHaveLength(0);
    expect(useAnalysisStore.getState().history).toHaveLength(1);
    expect(useSessionStore.getState().notices).toHaveLength(1);
    fail = false; complete(); await vi.advanceTimersByTimeAsync(20);
    expect(writes).toBe(3); expect(text).not.toBeNull();
    expect((await workingSessionSlot(storage).load())?.project.cases).toHaveLength(2);
  });
  it('replaces recovery on project switch without leaking old logs, evidence or runs', async () => {
    const c = await start(); complete();
    useOverlayFlights.setState({ logs: [{ id: 'flight-9', name: 'old', source: 'csv', sourceText: csv, samples: [{ timeS: 0, altitudeM: 0 }], apogeeM: 0, apogeeS: 0 }] });
    await c.flush();
    const next = largeProject(0); next.vehicle.name = 'Different project';
    adoptProject(next); await c.flush(); c.stop();
    useProjectStore.getState().newProject(); await start();
    expect(exportableProject().vehicle.name).toBe('Different project');
    expect(exportableProject().cases).toEqual([]); expect(exportableProject().ledger).toEqual([]);
    expect(currentLoadedLog()).toBeNull(); expect(useOverlayFlights.getState().logs).toEqual([]);
  });
  it('drops a pending evidence import when the project changes during hashing', async () => {
    const pending = recordEvidence(csv, 'altimeter-csv', 'old.csv', 3);
    useProjectStore.getState().newProject();
    await pending;
    expect(exportableProject().ledger).toEqual([]);
  });
  it('pauses a stale running tab with one notice and never refreshes its save base silently', async () => {
    const c = await start();
    const newer = workingSessionSlot(backend()); await newer.load();
    await newer.save(captureWorkingSession());
    const expected = await backend().read();
    complete(); await c.flush(); complete(); await c.flush();
    expect(await backend().read()).toBe(expected);
    expect(useSessionStore.getState().notices).toHaveLength(1);
    expect(useSessionStore.getState().notices[0].message).toMatch(/newer tab/);
    expect(useAnalysisStore.getState().history).toHaveLength(2);
  });
  it('accepts the 13 MB fixture and refuses oversize data without replacing stored work', async () => {
    const data = { project: largeProject(6), loaded: null, flights: [] };
    expect(new TextEncoder().encode(writeProject(data.project)).byteLength).toBeGreaterThan(13_000_000);
    const slot = workingSessionSlot(backend()); await slot.load(); await slot.save(data);
    const text = await backend().read();
    expect(new TextEncoder().encode(text!).byteLength).toBeLessThan(WORKING_SESSION_MAX_BYTES);
    expect((await workingSessionSlot(backend()).load())?.project.cases).toEqual(data.project.cases);
    const tooBig = { ...data, project: { ...data.project, vehicle: { ...data.project.vehicle, name: 'x'.repeat(WORKING_SESSION_MAX_BYTES) } } };
    await expect(slot.save(tooBig)).rejects.toThrow(/32 MiB/);
    expect(await backend().read()).toBe(text);
  }, 20000);
  it('debounces bursts and serializes writes, including changes during a write', async () => {
    vi.useFakeTimers(); let text: string | null = null; let release: (() => void) | undefined; let active = 0, peak = 0, count = 0;
    const storage: ProjectBackend = { read: () => text, update: async next => {
      active++; peak = Math.max(peak, active); count++;
      await new Promise<void>(resolve => { release = resolve; }); text = next(text); active--;
    } };
    await start(storage, 20); complete(); complete(); complete();
    await vi.advanceTimersByTimeAsync(19); expect(count).toBe(0);
    await vi.advanceTimersByTimeAsync(1); expect(count).toBe(1);
    complete(); await vi.advanceTimersByTimeAsync(20); expect(count).toBe(1);
    release!(); await vi.advanceTimersByTimeAsync(0); expect(count).toBe(2);
    release!(); await vi.advanceTimersByTimeAsync(0);
    expect(peak).toBe(1);
  });
});

describe('late recovery after the UI mounted', () => {
  it('does not restore a record that arrives after mount', async () => {
    const { startWorkingSession, workingSessionSlot, captureWorkingSession } = await import('./workingSession');
    const { useOverlayFlights } = await import('./overlayFlights');
    let stored: string | null = null;
    const backend = { read: async () => stored, update: async (fn: (c: string | null) => string) => { stored = fn(stored); } } as never;
    const flight = { id: 'flight-late', name: 'Late', source: 'csv', sourceText: 't,a\n0,0\n1,10', samples: [{ timeS: 0, altitudeM: 0 }, { timeS: 1, altitudeM: 10 }], apogeeM: 10, apogeeS: 1 };
    await workingSessionSlot(backend).save({ ...captureWorkingSession(), flights: [flight] as never });
    useOverlayFlights.setState({ logs: [] });
    const skipped = await startWorkingSession(backend, 10_000, () => false);
    expect(useOverlayFlights.getState().logs).toEqual([]);
    skipped.stop();
    const applied = await startWorkingSession(backend, 10_000, () => true);
    expect(useOverlayFlights.getState().logs.map((f) => f.id)).toEqual(['flight-late']);
    applied.stop();
  });
});
