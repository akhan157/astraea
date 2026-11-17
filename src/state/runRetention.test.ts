// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalysisStore, terminalAnalysisSnapshot, restoreAnalysisSnapshot } from './analysis';
import { useProjectStore, exportableProject, serializeProject } from './project';
import { captureRunInputs } from '../application/runInputs';
import { caseId } from '../application/runCases';
import { toFlightRun } from '../console/data/adapter';
import { flightResult, pinLegacyFlightDrag } from '../console/testFixtures';
import { savedTelemetryFixture } from '../application/savedTelemetry.fixture';
import { writeProject, readProject } from '../formats/projectJson';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

function complete() {
  const project = useProjectStore.getState().project;
  const motor = { id: 'estes_c6', motor: CERTIFIED_MOTORS.estes_c6, provenance: { source: 'certified' as const } };
  const inputs = captureRunInputs(project, motor, 'retained-key', undefined);
  const store = useAnalysisStore.getState();
  const token = store.start('flight', inputs.inputKey, null, inputs);
  const run = { ...toFlightRun(flightResult({ telemetry: savedTelemetryFixture() }), inputs.vehicle, 'certified', inputs.inputKey, 1, 1), engineIdentity: { kind: 'production-rust-wasm' as const, sha256: 'b'.repeat(64) } };
  store.resolve('flight', token, { design: { motorId: motor.id, vehicle: inputs.vehicle }, run, previous: null });
  return useAnalysisStore.getState().history.at(-1)!;
}

beforeEach(() => { useProjectStore.getState().newProject(); pinLegacyFlightDrag(); useAnalysisStore.getState().reset(); });
describe('bounded run retention', () => {
  it('keeps only three full payloads after thirty runs, including a fresh null previous', () => {
    for (let i = 0; i < 30; i++) complete();
    const history = useAnalysisStore.getState().history;
    expect(history).toHaveLength(30);
    expect(history.filter(r => r.payload !== null)).toHaveLength(3);
    expect((history.at(-1)!.payload as { previous: unknown }).previous).toBeNull();
  });
  it('keeps previous-run deltas without retaining previous telemetry or series', () => {
    const first = complete();
    const previous = (first.payload as { run: unknown }).run;
    const store = useAnalysisStore.getState();
    const token = store.start('flight', 'next');
    store.resolve('flight', token, { previous });
    const retained = (useAnalysisStore.getState().completed.flight!.payload as { previous: object }).previous;
    expect(retained).toEqual({ summary: (previous as { summary: unknown }).summary, rev: 1, terminationReason: 'touchdown' });
    expect(retained).not.toHaveProperty('telemetry');
    expect(retained).not.toHaveProperty('series');
  });
  it('retains two selected payloads, then evicts them when selection clears', () => {
    const a = complete(), b = complete();
    useAnalysisStore.getState().pinRuns('test', [a.token, b.token]);
    for (let i = 0; i < 10; i++) complete();
    expect(useAnalysisStore.getState().history.filter(r => r.payload !== null).map(r => r.token)).toContain(a.token);
    expect(useAnalysisStore.getState().history.filter(r => r.payload !== null)).toHaveLength(5);
    useAnalysisStore.getState().pinRuns('test', []);
    expect(useAnalysisStore.getState().history.filter(r => r.payload !== null)).toHaveLength(3);
  });
  it('does not retain an old ensemble through the latest-per-kind maps', () => {
    const store = useAnalysisStore.getState();
    const token = store.start('ensemble', 'ensemble-key');
    store.resolve('ensemble', token, { design: { motorId: 'estes_c6' }, dispersion: { landings: [], ok: 0, failed: 0 } });
    for (let i = 0; i < 4; i++) complete();
    expect(useAnalysisStore.getState().completed.ensemble!.payload).toBeNull();
    expect(useAnalysisStore.getState().records.ensemble!.payload).toBeNull();
  });
  it('keeps archived cases after an undo result has been collected, requiring an explicit rerun', () => {
    complete();
    const expected = readProject(serializeProject()).cases;
    const snapshot = terminalAnalysisSnapshot();
    const deref = vi.spyOn(WeakRef.prototype, 'deref').mockReturnValue(undefined);
    try { restoreAnalysisSnapshot(snapshot); } finally { deref.mockRestore(); }
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    expect(readProject(serializeProject()).cases).toEqual(expected);
  });
  it('does not repair an invalid old result or block project replacement while snapshotting it', () => {
    const record = complete();
    delete (record.payload as { run: { summary?: unknown } }).run.summary;
    expect(() => serializeProject()).toThrow(/validity/);
    expect(() => terminalAnalysisSnapshot()).not.toThrow();
    for (let i = 0; i < 4; i++) complete();
    expect(useAnalysisStore.getState().history[0].payload).toBeNull();
    expect(() => serializeProject()).toThrow(/validity/);
  });
  it('undo snapshots have no strongly reachable full payloads even for recent runs', () => {
    complete();
    const snapshot = terminalAnalysisSnapshot();
    expect(snapshot.history.every(r => r.payload === null)).toBe(true);
    expect(Object.values(snapshot.completed).every(r => r === null || r.payload === null)).toBe(true);
    expect(Object.values(snapshot.records).every(r => r === null || r.payload === null)).toBe(true);
  });
  it.each(['withRunCases/exportableProject', 'serializeProject/project save', 'loadSavedRun'])('%s preserves an evicted run exactly', consumer => {
    const first = complete();
    const expected = readProject(writeProject(exportableProject())).cases[0];
    for (let i = 0; i < 5; i++) complete();
    expect(useAnalysisStore.getState().history[0].payload).toBeNull();
    const project = consumer === 'serializeProject/project save' ? readProject(serializeProject()) : exportableProject();
    expect(project.cases.find(c => c.id === caseId(first))).toEqual(expected);
    if (consumer === 'loadSavedRun') {
      expect(useProjectStore.getState().loadSavedRun(expected.id)).toBe(true);
      expect(useProjectStore.getState().project.vehicle).toEqual(first.runInputs!.vehicle);
      expect(useAnalysisStore.getState().completed.flight).toBeNull();
    }
  });
});
