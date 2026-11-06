import { describe, expect, it } from 'vitest';
import { PROJECT_SCHEMA_VERSION, readProject, writeProject } from './projectJson';
import { captureCandidateRunInputs } from '../application/runInputs';
import { withRunCases } from '../application/runCases';
import { buildCandidateRequest, declarationVehicleSha256 } from '../application/candidate';
import { isCandidateFlightModel } from '../application/flightModel';
import {
  CANDIDATE_ENGINE_IDENTITY, CANDIDATE_VEHICLE, candidateDerivation, candidateProjectWithSha,
  candidateResult, candidateSelectionWithSha,
} from '../application/candidate.fixture';
import type { AnalysisRecord } from '../state/analysis';

function candidateCase(project = candidateProjectWithSha('a'.repeat(64))) {
  const model = project.flightModel;
  if (!model || !isCandidateFlightModel(model)) throw new Error('candidate fixture selection missing');
  const selection = candidateSelectionWithSha(model.declarationVehicleSha256);
  const motor = project.motorRecords[0];
  const request = buildCandidateRequest(project.vehicle, motor.motor, selection, project.workspace.launch, candidateDerivation());
  const inputs = captureCandidateRunInputs(project, motor, selection, 'cand-key', request, candidateDerivation());
  const result = candidateResult();
  const source = request.adapter.sourceIdentity;
  const geometryIdentity = `frontend-external-profile-SB1/1.0.0:${source}`;
  result.identities.callerSourceIdentity = source;
  result.identities.geometryIdentity = geometryIdentity;
  result.identities.mechanicalSourceId = request.mechanicalSourceId;
  result.identities.environmentSourceId = request.environmentSourceId;
  result.identities.axialProviderId = selection.axial.providerId;
  result.identities.axialInputIdentity = selection.axial.inputIdentity;
  result.model.geometry.identity = geometryIdentity;
  result.model.environment = { ...request.environment, environmentSourceId: request.environmentSourceId };
  const record: AnalysisRecord = {
    kind: 'flight', status: 'completed', inputKey: 'cand-key', startedAt: '2026-10-29T00:00:00.000Z',
    finishedAt: '2026-10-29T00:00:01.000Z', error: null, token: 1, runInputs: inputs,
    payload: { model: 'candidate', design: { motorId: 'estes_c6' }, result,
      request, engineIdentity: CANDIDATE_ENGINE_IDENTITY },
  };
  return { project, record, inputs, request };
}

describe('candidate project archive 1.12', () => {
  it('round-trips the candidate selection, v3 request and strict result without legacy fields', async () => {
    const sha = await declarationVehicleSha256(CANDIDATE_VEHICLE);
    const { project, record } = candidateCase(candidateProjectWithSha(sha));
    const withCases = withRunCases(project, [record]);
    expect(PROJECT_SCHEMA_VERSION).toBe('1.13.0');
    const parsed = readProject(writeProject(withCases));
    expect(parsed.flightModel?.modelId).toBe('native-candidate-static-rate/1.0.0');
    const entry = parsed.cases[0];
    expect(entry.candidateResult?.contentIdentity.sha256).toBe('d'.repeat(64));
    expect(entry.inputs?.version).toBe(3);
    expect(entry.engineIdentity?.sha256).toBe('e'.repeat(64));
    expect(entry).not.toHaveProperty('flightOutputs');
    expect(entry).not.toHaveProperty('telemetry');
    expect(entry).not.toHaveProperty('events');
    expect(entry).not.toHaveProperty('momentArmHistory');
    expect(entry.summary).toMatchObject({ archiveForm: 'candidate', modelId: 'native-candidate-static-rate/1.0.0' });
  });

  it('keeps the approved 1.12 candidate envelope and migrates 1.11 identity-only', async () => {
    const sha = await declarationVehicleSha256(CANDIDATE_VEHICLE);
    const { project, record } = candidateCase(candidateProjectWithSha(sha));
    const withCases = withRunCases(project, [record]);
    const doc = JSON.parse(writeProject(withCases)) as Record<string, unknown>;
    expect(doc.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    doc.schemaVersion = '1.11.0';
    expect(() => readProject(JSON.stringify(doc))).toThrow(/cannot declare an explicit candidate selection/);
    delete doc.flightModel;
    doc.cases = [];
    const migrated = readProject(JSON.stringify(doc));
    expect(migrated.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated.cases).toEqual([]);
  });

  it('rejects an archive whose source identity disagrees with the archived request', async () => {
    const sha = await declarationVehicleSha256(CANDIDATE_VEHICLE);
    const { project, record } = candidateCase(candidateProjectWithSha(sha));
    const withCases = withRunCases(project, [record]);
    withCases.cases[0].candidateResult!.identities.callerSourceIdentity = 'foreign-source';
    expect(() => writeProject(withCases)).toThrow(/source identity disagrees/);
  });

  it('detaches and freezes only the captured candidate snapshot', () => {
    const { project, inputs } = candidateCase();
    expect(Object.isFrozen(project)).toBe(false);
    expect(Object.isFrozen(project.workspace)).toBe(false);
    expect(Object.isFrozen(project.vehicle)).toBe(false);
    const originalName = inputs.vehicle.name;
    const originalWind = inputs.launch.windSpeedMps;
    project.vehicle.name = 'edited after capture';
    project.workspace.launch.windSpeedMps = originalWind + 1;
    expect(inputs.vehicle.name).toBe(originalName);
    expect(inputs.launch.windSpeedMps).toBe(originalWind);
    expect(Object.isFrozen(inputs)).toBe(true);
  });

  it('refuses an injected landing on a time-limit candidate result', async () => {
    const sha = await declarationVehicleSha256(CANDIDATE_VEHICLE);
    const { project, record } = candidateCase(candidateProjectWithSha(sha));
    const withCases = withRunCases(project, [record]);
    const entry = withCases.cases[0];
    entry.candidateResult = {
      ...entry.candidateResult!,
      landing: { timeS: 0.1, positionNM: [0, 0, 0], speedMps: 1, massKg: 1, eventDescription: 'touchdown' },
    };
    expect(() => readProject(writeProject(withCases))).toThrow(/landing requires touchdown/);
  });

  it('refuses a candidate selection or v3 inputs in an older schema', async () => {
    const sha = await declarationVehicleSha256(CANDIDATE_VEHICLE);
    const { project, record } = candidateCase(candidateProjectWithSha(sha));
    const withCases = withRunCases(project, [record]);
    const doc = JSON.parse(writeProject(withCases)) as Record<string, unknown>;
    doc.schemaVersion = '1.11.0';
    expect(() => readProject(JSON.stringify(doc))).toThrow(/cannot declare an explicit candidate selection/);
    doc.schemaVersion = '1.12.0';
    const cases = doc.cases as Array<Record<string, unknown>>;
    const entry = cases[0];
    const entryInputs = entry.inputs as Record<string, unknown>;
    entry.inputs = { ...entryInputs, version: 3 };
    delete doc.flightModel;
    doc.schemaVersion = '1.11.0';
    expect(() => readProject(JSON.stringify(doc))).toThrow(/cannot declare candidate case inputs/);
  });

  it('keeps a legacy 1.11 canonical dictionary readable through 1.12 migration', () => {
    const legacy = { value: 10, unit: 'm', confidence: 'modeled', available: true };
    const outputs = { dictionaryRevision: 'RMP10-C06/2',
      outputs: { apogee: legacy },
      flags: { validity: 'PASS', enveloped: true, offNominalExcursion: false, landingNominal: true },
      sampledMaxQ: { time: 1, sampleCount: 2, validSampleCount: 2 } };
    const seed = candidateProjectWithSha('a'.repeat(64));
    const doc = JSON.parse(writeProject(seed)) as Record<string, unknown>;
    delete doc.flightModel;
    doc.schemaVersion = '1.11.0';
    doc.cases = [{ id: 'old', kind: 'flight', createdAt: '2026-10-29T00:00:00.000Z',
      motorRecordId: 'estes_c6', summary: { inputKey: 'k' }, flightOutputs: outputs }];
    const parsed = readProject(JSON.stringify(doc));
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.cases[0].flightOutputs?.outputs.apogee?.value).toBe(10);
  });
});
