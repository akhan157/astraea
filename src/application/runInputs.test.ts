import { beforeEach, describe, expect, it } from 'vitest';
import { captureRunInputs, type LegacyRunInputs } from './runInputs';
import { withRunCases } from './runCases';
import { weatherLayers, withWeatherProfile } from './weatherSnapshots';
import { readProject, writeProject, type MotorRecord, type ProjectEnvelope } from '../formats/projectJson';
import { adoptProject, exportableProject, useProjectStore } from '../state/project';
import { useAnalysisStore, type AnalysisRecord } from '../state/analysis';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { toFlightRun } from '../console/data/adapter';
import { flightResult } from '../console/testFixtures';
import { designOf } from '../console/design';
import { LEGACY_FLIGHT_MODEL } from './flightModel';
import type { DragCalibration } from './dragCalibration';
import { activeCalibration, resolveCalibrationApplicability } from './calibrationApplicability';
import { resolveRun } from '../console/store';

const motorRecord = (): MotorRecord => ({ id: 'estes_c6', motor: structuredClone(CERTIFIED_MOTORS.estes_c6),
  provenance: { source: 'import', sourceFile: 'original.eng', sourceSha256: 'a'.repeat(64), importedAt: '2026-10-20T10:00:00.000Z', note: 'Source attribution' } });

function completed(inputs: LegacyRunInputs, token = 1): AnalysisRecord {
  return { kind: inputs.ensemble ? 'ensemble' : 'flight', status: 'completed', inputKey: inputs.inputKey,
    startedAt: inputs.capturedAt, finishedAt: '2026-10-25T12:00:00.000Z', error: null, token, runInputs: inputs,
    payload: inputs.ensemble ? { design: { motorId: inputs.motorRecord.id }, dispersion: { landings: [{ x: 1, y: 0 }, { x: 0, y: 1 }], ok: 2, failed: 0, sigma1: 1, sigma2: 0, r50: 1, r90: 1, r99: 1 } }
      : { design: { motorId: inputs.motorRecord.id }, run: { ...toFlightRun(flightResult(), inputs.vehicle, 'import', inputs.inputKey, 1, 1), engineIdentity: { kind: 'production-rust-wasm', sha256: 'b'.repeat(64) } } } };
}

let project: ProjectEnvelope;
beforeEach(() => {
  useProjectStore.getState().loadPreset('estesAlpha');
  useAnalysisStore.getState().reset();
  project = structuredClone(exportableProject());
});

describe('dispatch input archives', () => {
  it('pins the explicit supported model on new captures without changing legacy resolution or scale', () => {
    const record=motorRecord();
    const implicit={...project}; delete implicit.flightModel;
    const explicit={...project,flightModel:LEGACY_FLIGHT_MODEL};
    const a=captureRunInputs(implicit,record,'same',undefined);
    const b=captureRunInputs(explicit,record,'same',undefined);
    expect(a.version).toBe(2);
    expect(a.flightModel).toEqual(LEGACY_FLIGHT_MODEL);
    expect(Object.isFrozen(a.flightModel)).toBe(true);
    expect({...a,capturedAt:''}).toEqual({...b,capturedAt:''});
    const resolution=(p:ProjectEnvelope)=>resolveRun(p,{},designOf(p,p.mission));
    expect(resolution(implicit)?.inputKey).toBe(resolution(explicit)?.inputKey);
    expect(resolution(implicit)).not.toBeNull();
  });

  it('retains version1 archived inputs and summaries through 1.6 migration and saved-run undo/redo', () => {
    const saved=JSON.parse(writeProject(withRunCases(project,[completed(captureRunInputs(project,motorRecord(),'old-key',undefined))])));
    saved.schemaVersion='1.6.0'; delete saved.flightModel;
    const old=saved.cases[0].inputs; old.version=1; delete old.flightModel;
    delete saved.cases[0].engineIdentity;
    delete saved.cases[0].events; // a genuine 1.6 document could not record a timeline
    delete saved.cases[0].telemetry; // or retained display telemetry
    delete saved.cases[0].flightOutputs; // or the 1.11 canonical output dictionary
    const cases=structuredClone(saved.cases);
    const reopened=readProject(JSON.stringify(saved));
    expect(reopened.cases).toEqual(cases);
    expect(reopened.flightModel).toBeUndefined();
    expect(reopened.cases[0].engineIdentity).toBeUndefined();
    adoptProject({...reopened,flightModel:LEGACY_FLIGHT_MODEL});
    expect(useProjectStore.getState().loadSavedRun(cases[0].id)).toBe(true);
    expect(useProjectStore.getState().project.flightModel).toBeUndefined();
    expect(readProject(writeProject(exportableProject())).cases).toEqual(cases);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.flightModel).toEqual(LEGACY_FLIGHT_MODEL);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project.flightModel).toBeUndefined();
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
  });

  it.each(['missing','unknown-model','changed-environment','extra-source','version1-injected-model'] as const)(
    'refuses archive model provenance %s without replacing the current project', (scenario) => {
      const saved=JSON.parse(writeProject(withRunCases(project,[completed(captureRunInputs(project,motorRecord(),'key',undefined))])));
      const inputs=saved.cases[0].inputs;
      if(scenario==='missing') delete inputs.flightModel;
      if(scenario==='unknown-model') inputs.flightModel.modelId='candidate-sb1';
      if(scenario==='changed-environment') inputs.flightModel.environmentId='supplied-weather';
      if(scenario==='extra-source') inputs.flightModel.tableSource='same-label-different-table';
      if(scenario==='version1-injected-model') inputs.version=1;
      const before=useProjectStore.getState().project;
      expect(()=>adoptProject(readProject(JSON.stringify(saved)))).toThrow(/flightModel|version1/);
      expect(useProjectStore.getState().project).toBe(before);
    });

  it('refuses unsupported direct adoption and capture before any calibration can be dispatched', () => {
    const calibration={scale:1.2,fittedCd:0.6,modelCd:0.5,rmseN:0,coastMassKg:1,
      source:{fileName:null,sha256Hex:'unavailable',rowCount:10},
      window:{startS:1,endS:2,method:'velocity-column' as const,pointsUsed:8,pointsExcluded:0},appliedAt:'2026-10-26T12:00:00Z'};
    const calibrated={...project,dragCalibration:calibration};
    expect(captureRunInputs(calibrated,motorRecord(),'legacy',calibration).engineOptions.dragCdScale).toBe(1.2);
    expect(captureRunInputs(calibrated,motorRecord(),'retained-only',undefined).engineOptions.dragCdScale).toBe(1);
    const unsupported={...calibrated,flightModel:{...LEGACY_FLIGHT_MODEL,modelId:'candidate-not-app-enabled'}} as unknown as ProjectEnvelope;
    const before=useProjectStore.getState().project;
    expect(()=>adoptProject(unsupported)).toThrow(/flightModel/);
    expect(()=>captureRunInputs(unsupported,motorRecord(),'must-not-run',undefined)).toThrow(/flightModel/);
    expect(useProjectStore.getState().project).toBe(before);
  });

  it('captures immutable full inputs and bounded weather context without histories, raw logs or catalogs', () => {
    project = withWeatherProfile(project, 'forecast', [{ altitudeM: 12, speedMs: 8, directionFromDeg: 35, tempC: 18, pressureHpa: 1000 }], 'forecast-source', '2026-10-24T10:00:00.000Z');
    project.ledger = [{ id: 'log', rawText: 'PRIVATE_RAW_SENTINEL' } as never];
    project.cases = [{ id: 'old-history', summary: { private: 'HISTORY_SENTINEL' } } as never];
    const record = motorRecord();
    const archive = captureRunInputs(project, record, 'dispatch-key', undefined, 4e9);
    const original = structuredClone(archive);
    project.vehicle.name = 'Changed after dispatch';
    project.workspace.site.latDeg = 0;
    record.motor.thrustCurve[1].thrust += 30;
    expect(archive).toEqual(original);
    expect(Object.isFrozen(archive.motorRecord.motor.thrustCurve[1])).toBe(true);
    expect(archive.context.weather[0]).toMatchObject({ source: 'forecast-source', createdAt: '2026-10-24T10:00:00.000Z' });
    expect(archive.weatherModel).toBe('surface-power-law-only');
    expect(JSON.stringify(archive)).not.toMatch(/PRIVATE_RAW_SENTINEL|HISTORY_SENTINEL|motorRecords|"cases"|"ledger"/);
    expect(archive.engineOptions).toMatchObject({ timeStep: 0.01, dragCdScale: 1, launchAltitudeASL: 0 });
  });

  it('pins two same-ID custom curves independently and preserves original source metadata on reopen', () => {
    const first = motorRecord();
    const second = motorRecord();
    second.motor.thrustCurve[1].thrust += 1;
    second.provenance.sourceFile = 'edited.eng';
    const a = captureRunInputs(project, first, 'first', undefined);
    const b = captureRunInputs(project, second, 'second', undefined);
    const saved = withRunCases(project, [completed(a), completed(b, 2)]);
    const reopened = readProject(writeProject(saved));
    expect(reopened.cases[0].motorRecordId).not.toBe(reopened.cases[1].motorRecordId);
    expect(reopened.cases[0].inputs).toEqual(a);
    expect(reopened.cases[1].inputs).toEqual(b);
    expect(reopened.cases[0].engineIdentity).toEqual({ kind: 'production-rust-wasm', sha256: 'b'.repeat(64) });
    expect(reopened.motorRecords.find((m) => m.id === reopened.cases[0].motorRecordId)?.motor).toEqual(first.motor);
    expect(reopened.motorRecords.find((m) => m.id === 'estes_c6')?.provenance.source).toBe('certified');
    expect(writeProject(readProject(writeProject(reopened)))).toBe(writeProject(reopened));
  });

  it('keeps legacy summaries unavailable instead of inferring from today’s vehicle or motor', () => {
    project.cases = [{ id: 'legacy', kind: 'flight', createdAt: '2026-10-20T10:00:00Z', motorRecordId: 'estes_c6', summary: { inputKey: 'unrecoverable', apogeeM: 99 } }];
    const raw = { ...project, schemaVersion: '1.5.0' };
    const reopened = readProject(JSON.stringify(raw));
    expect(reopened.cases).toEqual(project.cases);
    expect(reopened.cases[0].inputs).toBeUndefined();
    expect(reopened.cases[0].engineIdentity).toBeUndefined();
    adoptProject(reopened);
    expect(useProjectStore.getState().loadSavedRun('legacy')).toBe(false);
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
  });

  it.each([
    ['unknown archive version', (p: any) => { p.cases[0].inputs.version = 99; }],
    ['nonfinite option', (p: any) => { p.cases[0].inputs.engineOptions.timeStep = null; }],
    ['inconsistent scale', (p: any) => { p.cases[0].inputs.engineOptions.dragCdScale = 2; }],
    ['inconsistent altitude', (p: any) => { p.cases[0].inputs.engineOptions.launchAltitudeASL = 500; }],
    ['mismatched pinned motor', (p: any) => { p.cases[0].inputs.motorRecord.motor.thrustCurve[1].thrust += 1; }],
    ['mismatched input identity', (p: any) => { p.cases[0].inputs.inputKey = 'different'; }],
    ['ensemble on nominal flight', (p: any) => { p.cases[0].inputs.ensemble = p.workspace.ensemble; }],
    ['non-weather context', (p: any) => { p.cases[0].inputs.context.weather = [{ kind: 'not-weather' }]; }],
  ])('refuses %s', (_label, mutate) => {
    const saved = JSON.parse(writeProject(withRunCases(project, [completed(captureRunInputs(project, motorRecord(), 'key', undefined))])));
    mutate(saved);
    expect(() => readProject(JSON.stringify(saved))).toThrow();
  });

  it('loads archived inputs explicitly and undo restores both project and motor catalog', () => {
    const record = motorRecord();
    const inputs = captureRunInputs(project, record, 'saved-key', undefined, 4e9);
    const saved = readProject(writeProject(withRunCases(project, [completed(inputs)])));
    saved.vehicle.name = 'Current variant';
    saved.workspace.launch.windSpeedMps = 15;
    adoptProject(saved);
    const beforeProject = useProjectStore.getState().project;
    const beforeMotors = useProjectStore.getState().motors;
    const id = saved.cases[0].id;
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    expect(useProjectStore.getState().loadSavedRun(id)).toBe(true);
    const restored = useProjectStore.getState();
    expect(restored.project.vehicle).toEqual(inputs.vehicle);
    expect(restored.project.flightModel).toEqual(inputs.flightModel);
    expect(restored.project.workspace.launch).toEqual(inputs.launch);
    expect(restored.shearPa).toBe(4e9);
    expect(restored.motors[restored.project.workspace.motorId].motor).toEqual(record.motor);
    expect(restored.project.motorRecords.find((r) => r.id === 'estes_c6')?.provenance.source).toBe('certified');
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    expect(() => writeProject(exportableProject())).not.toThrow();
    restored.undo();
    expect(useProjectStore.getState().project).toBe(beforeProject);
    expect(useProjectStore.getState().motors).toBe(beforeMotors);
  });

  it.each(['missing context', 'same ID with different content'])('preserves legacy case weather through load → Save/Open with %s', (scenario) => {
    const layers = (speedMs: number) => [{ altitudeM: 12, speedMs, directionFromDeg: 35, tempC: 18, pressureHpa: 1000 }];
    if (scenario !== 'missing context') project = withWeatherProfile(project, 'forecast', layers(2), 'earlier forecast');
    const inputs = captureRunInputs(project, motorRecord(), 'earlier', undefined);
    let saved = withRunCases(project, [completed(inputs)]);
    saved = withWeatherProfile(saved, 'forecast', layers(9), 'later forecast');
    const laterWeather = structuredClone(saved.snapshots.find((s) => s.id === 'weather-forecast')!);
    saved.cases.push({ id: 'legacy-weather-case', kind: 'flight', createdAt: '2026-10-25T12:00:00Z',
      motorRecordId: 'estes_c6', weatherSnapshotId: laterWeather.id });
    adoptProject(readProject(writeProject(saved)));
    expect(useProjectStore.getState().loadSavedRun(saved.cases[0].id)).toBe(true);
    const reopened = readProject(writeProject(exportableProject()));
    expect(weatherLayers(reopened, 'forecast')).toEqual(scenario === 'missing context' ? [] : layers(2));
    const legacy = reopened.cases.find((entry) => entry.id === 'legacy-weather-case')!;
    expect(legacy.weatherSnapshotId).not.toBe('weather-forecast');
    expect(reopened.snapshots.find((s) => s.id === legacy.weatherSnapshotId)).toEqual({ ...laterWeather, id: legacy.weatherSnapshotId });
    expect(reopened.cases[0].inputs).toEqual(inputs);
    expect(writeProject(readProject(writeProject(reopened)))).toBe(writeProject(reopened));
    useProjectStore.getState().undo();
    expect(exportableProject().cases.find((entry) => entry.id === legacy.id)?.weatherSnapshotId).toBe('weather-forecast');
  });

  it('keeps repeated captures bounded and reuses historical weather pins across load and reopen', () => {
    const layers = (speedMs: number) => [{ altitudeM: 12, speedMs, directionFromDeg: 35, tempC: 18, pressureHpa: 1000 }];
    project = withWeatherProfile(project, 'manual', layers(1), 'manual');
    project = withWeatherProfile(project, 'forecast', layers(2), 'earlier forecast');
    const inputs = captureRunInputs(project, motorRecord(), 'earlier', undefined);
    let saved = withRunCases(project, [completed(inputs)]);
    saved = withWeatherProfile(saved, 'forecast', layers(9), 'later forecast');
    saved.cases.push({ id: 'legacy-weather-case', kind: 'flight', createdAt: '2026-10-25T12:00:00Z',
      motorRecordId: 'estes_c6', weatherSnapshotId: 'weather-forecast' });
    const savedId = saved.cases[0].id;
    let pinId: string | undefined;
    let archiveSize: number | undefined;
    for (let i = 0; i < 12; i++) {
      adoptProject(readProject(writeProject(saved)));
      expect(useProjectStore.getState().loadSavedRun(savedId)).toBe(true);
      const state = useProjectStore.getState();
      const current = exportableProject();
      const legacy = current.cases.find((entry) => entry.id === 'legacy-weather-case')!;
      pinId ??= legacy.weatherSnapshotId;
      expect(legacy.weatherSnapshotId).toBe(pinId);
      expect(current.snapshots).toHaveLength(3);
      const capture = captureRunInputs(current, state.motors[current.workspace.motorId], 'rerun', undefined);
      expect(capture.context.weather).toEqual(inputs.context.weather);
      archiveSize ??= JSON.stringify(capture).length;
      expect(JSON.stringify(capture).length).toBe(archiveSize);
      saved = withRunCases(current, [completed(capture, i + 2)]);
      expect(saved.motorRecords.filter((entry) => entry.id.startsWith('archive_'))).toHaveLength(1);
    }
    expect(saved.cases).toHaveLength(14);
    expect(saved.cases.filter((entry) => entry.inputs).every((entry) => entry.inputs!.context.weather.length === 2)).toBe(true);
  });

  it('preserves both weather contents when a historical alias is already occupied', () => {
    const inputs = captureRunInputs(project, motorRecord(), 'earlier', undefined);
    let saved = withRunCases(project, [completed(inputs)]);
    saved = withWeatherProfile(saved, 'forecast', [{ altitudeM: 12, speedMs: 9, directionFromDeg: 35, tempC: 18, pressureHpa: 1000 }], 'later forecast');
    const laterWeather = structuredClone(saved.snapshots[0]);
    saved.cases.push({ id: 'legacy-weather-case', kind: 'flight', createdAt: '2026-10-25T12:00:00Z',
      motorRecordId: 'estes_c6', weatherSnapshotId: 'weather-forecast' });
    adoptProject(saved);
    expect(useProjectStore.getState().loadSavedRun(saved.cases[0].id)).toBe(true);
    const occupiedId = exportableProject().cases[1].weatherSnapshotId!;
    useProjectStore.getState().undo();
    saved = structuredClone(exportableProject());
    const occupied = { ...laterWeather, id: occupiedId, source: 'unrelated historical forecast' };
    saved.snapshots.push(occupied);
    saved.cases.push({ ...saved.cases[1], id: 'other-weather-case', weatherSnapshotId: occupiedId });
    adoptProject(readProject(writeProject(saved)));
    expect(useProjectStore.getState().loadSavedRun(saved.cases[0].id)).toBe(true);
    const reopened = readProject(writeProject(exportableProject()));
    const legacyId = reopened.cases[1].weatherSnapshotId!;
    expect(legacyId).not.toBe(occupiedId);
    expect(reopened.snapshots.find((snapshot) => snapshot.id === legacyId)).toEqual({ ...laterWeather, id: legacyId });
    expect(reopened.snapshots.find((snapshot) => snapshot.id === occupiedId)).toEqual(occupied);
    expect(reopened.cases[2].weatherSnapshotId).toBe(occupiedId);
    expect(useProjectStore.getState().loadSavedRun(saved.cases[0].id)).toBe(true);
    expect(readProject(writeProject(exportableProject())).snapshots).toEqual(reopened.snapshots);
  });

  it('refuses loading while drafts or engine work are outstanding', () => {
    const saved = withRunCases(project, [completed(captureRunInputs(project, motorRecord(), 'key', undefined))]);
    adoptProject(saved);
    useProjectStore.getState().stageWorkspace('trajectory', { launch: { ...project.workspace.launch, railLengthM: 9 } });
    expect(useProjectStore.getState().loadSavedRun(saved.cases[0].id)).toBe(false);
    useProjectStore.getState().revertStudio('trajectory');
    useAnalysisStore.getState().start('flight', 'pending');
    expect(useProjectStore.getState().loadSavedRun(saved.cases[0].id)).toBe(false);
  });

  it('allows editing a restored working curve without rewriting its archive and reuses stable pins', () => {
    const inputs = captureRunInputs(project, motorRecord(), 'key', undefined);
    const saved = withRunCases(project, [completed(inputs)]);
    adoptProject(saved);
    const caseId = saved.cases[0].id;
    const pinId = saved.cases[0].motorRecordId;
    expect(useProjectStore.getState().loadSavedRun(caseId)).toBe(true);
    let state = useProjectStore.getState();
    const workingId = state.project.workspace.motorId;
    expect(workingId).not.toBe(pinId);
    const catalog = designOf(state.project, state.mission, state.shearPa, undefined, state.motors).motors!;
    expect(catalog[pinId]).toBeUndefined();
    expect(catalog[workingId]).toBeDefined();
    const curve = structuredClone(state.motors[workingId].motor.thrustCurve);
    curve[1].thrust += 2;
    expect(state.stageCurve('propulsion', workingId, curve)).toBe(true);
    state.applyStudio('propulsion');
    const reopened = readProject(writeProject(exportableProject()));
    expect(reopened.cases[0].inputs).toEqual(inputs);
    expect(reopened.motorRecords.find((r) => r.id === pinId)?.motor.thrustCurve).toEqual(inputs.motorRecord.motor.thrustCurve);
    expect(reopened.motorRecords.find((r) => r.id === workingId)?.motor.thrustCurve).toEqual(curve);
    expect(useProjectStore.getState().loadSavedRun(caseId)).toBe(true);
    state = useProjectStore.getState();
    expect(state.project.workspace.motorId).not.toBe(workingId);
    const restored = state.motors[state.project.workspace.motorId];
    const samePhysicalInputs = captureRunInputs(state.project, restored, 'rerun', undefined);
    const again = withRunCases(exportableProject(), [completed(samePhysicalInputs, 2)]);
    expect(again.cases[1].motorRecordId).toBe(pinId);
    expect(again.motorRecords.filter((r) => r.id.startsWith('archive_'))).toHaveLength(1);
    expect(withRunCases(again, [completed(samePhysicalInputs, 2)])).toEqual(again);
  });

  it('refuses direct pin curve edits and imports a colliding pin ID as a separate working motor', () => {
    const inputs = captureRunInputs(project, motorRecord(), 'key', undefined);
    const saved = withRunCases(project, [completed(inputs)]);
    adoptProject(saved);
    const pinId = saved.cases[0].motorRecordId;
    const curve = structuredClone(inputs.motorRecord.motor.thrustCurve);
    curve[1].thrust += 2;
    expect(useProjectStore.getState().stageCurve('propulsion', pinId, curve)).toBe(false);
    const colliding = { ...structuredClone(inputs.motorRecord), id: pinId,
      motor: { ...structuredClone(inputs.motorRecord.motor), id: pinId, thrustCurve: curve } };
    const importedId = useProjectStore.getState().addMotorRecord(colliding, 'Import collision', true);
    expect(importedId).not.toBe(pinId);
    const reopened = readProject(writeProject(exportableProject()));
    expect(reopened.cases[0].inputs).toEqual(inputs);
    expect(reopened.motorRecords.find((entry) => entry.id === pinId)?.motor.thrustCurve).toEqual(inputs.motorRecord.motor.thrustCurve);
    expect(reopened.motorRecords.find((entry) => entry.id === importedId)?.motor.thrustCurve).toEqual(curve);
    const state = useProjectStore.getState();
    useProjectStore.setState({ motors: { ...state.motors, [pinId]: colliding } });
    expect(() => exportableProject()).toThrow(/Historical motor records cannot be overwritten/);
  });

  it('never dispatches or archives a binding-incompatible calibration', () => {
    const record = motorRecord();
    const foreign = {
      scale: 0.9,
      fitProvenance: { flightModelBinding: { schemaId: LEGACY_FLIGHT_MODEL.schemaId,
        modelId: 'candidate-future', environmentId: 'e', mechanicalModelId: 'm', calibrationPolicyId: 'c' } },
    } as unknown as DragCalibration;
    // The capture archives exactly the dispatch resolution: retained-but-inactive
    // artifacts contribute neither a scale nor an artifact.
    expect(activeCalibration(resolveCalibrationApplicability({ calibration: foreign, currentFitInputKey: 'key' }))).toBeUndefined();
    const withForeign = captureRunInputs({ ...project, dragCalibration: foreign }, record, 'key', undefined);
    expect(withForeign.engineOptions.dragCdScale).toBe(1);
    expect(withForeign.dragCalibration).toBeUndefined();
    const legacyFit = { scale: 0.8 } as unknown as DragCalibration;
    const withLegacy = captureRunInputs({ ...project, dragCalibration: legacyFit }, record, 'key', legacyFit);
    expect(withLegacy.engineOptions.dragCdScale).toBe(0.8);
    expect(withLegacy.dragCalibration).toEqual(legacyFit);
    expect(() => captureRunInputs(project, record, 'key', legacyFit)).not.toThrow();
    expect(() => captureRunInputs(project, record, 'key', undefined, undefined, undefined, { dragCdScale: 0.8 })).toThrow(/does not match/);
  });

});
