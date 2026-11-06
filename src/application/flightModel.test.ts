import { describe, expect, it } from 'vitest';
import { LEGACY_FLIGHT_MODEL, parseFlightModel, resolveFlightModel } from './flightModel';
import { createMemoryBackend, createProjectEnvelope, createProjectStore, readProject, writeProject, PROJECT_SCHEMA_VERSION } from '../formats/projectJson';
import oldDocument from '../formats/__fixtures__/project-main-1.0.0.json';

function project() { return readProject(JSON.stringify(oldDocument)); }

describe('supported flight-model selection boundary', () => {
  it('resolves absent/explicit legacy identically without trusting a mutable caller object', () => {
    const declared = { ...LEGACY_FLIGHT_MODEL };
    expect(resolveFlightModel(undefined)).toBe(LEGACY_FLIGHT_MODEL);
    expect(parseFlightModel(declared)).toBe(LEGACY_FLIGHT_MODEL);
    expect(Object.isFrozen(parseFlightModel(declared))).toBe(true);
    expect(createProjectEnvelope({ vehicle: project().vehicle }).flightModel).toEqual(LEGACY_FLIGHT_MODEL);
  });

  it.each([
    null, 'legacy', [], {},
    { ...LEGACY_FLIGHT_MODEL, schemaId: 'future/99' },
    { ...LEGACY_FLIGHT_MODEL, modelId: 'static-body-total-SB1/1.0.0' },
    { ...LEGACY_FLIGHT_MODEL, environmentId: 'supplied-profile' },
    { ...LEGACY_FLIGHT_MODEL, mechanicalModelId: 'different-mass-model' },
    { ...LEGACY_FLIGHT_MODEL, calibrationPolicyId: 'candidate-no-calibration' },
    { ...LEGACY_FLIGHT_MODEL, source: { ca0: 0.3 } },
  ])('refuses malformed/unsupported selection without a legacy fallback: %j', (raw) => {
    expect(() => parseFlightModel(raw)).toThrow(/flightModel/);
    const value = { ...project(), flightModel: raw };
    expect(() => readProject(JSON.stringify(value))).toThrow(/flightModel/);
    expect(() => readProject(JSON.stringify({ ...value, schemaVersion: '1.6.0' }))).toThrow(/flightModel/);
  });

  it.each([LEGACY_FLIGHT_MODEL, {...LEGACY_FLIGHT_MODEL,modelId:'candidate'}, null, {}])('refuses model metadata on bare or nested vehicles without dropping it: %j', (selection) => {
    const plain=project();
    expect(readProject(JSON.stringify(plain.vehicle)).vehicle).toEqual(plain.vehicle);
    expect(()=>readProject(JSON.stringify({...plain.vehicle,flightModel:selection}))).toThrow(/flightModel/);
    expect(()=>readProject(JSON.stringify({...plain,vehicle:{...plain.vehicle,flightModel:selection}}))).toThrow(/flightModel/);
  });

  it('preserves explicit selection through Save/Open/Save without changing design or history', () => {
    const input = { ...project(), flightModel: LEGACY_FLIGHT_MODEL };
    const text = writeProject(input);
    const reopened = readProject(text);
    expect(reopened.flightModel).toEqual(LEGACY_FLIGHT_MODEL);
    expect(reopened.vehicle).toEqual(input.vehicle);
    expect(reopened.cases).toEqual(input.cases);
    expect(writeProject(reopened)).toBe(text);
  });

  it('migrates 1.6 without inventing a selection, run inputs or runtime hashes', () => {
    const current = project();
    const old = { ...current, schemaVersion: '1.6.0' };
    delete old.flightModel;
    const reopened = readProject(JSON.stringify(old));
    expect(reopened.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(reopened.flightModel).toBeUndefined();
    expect(reopened.cases).toEqual(old.cases);
    expect(reopened.motorRecords).toEqual(old.motorRecords);
    expect(readProject(writeProject(reopened))).toEqual(reopened);
  });

  it('refuses unsupported stored selections without overwriting the original bytes', async () => {
    const text = JSON.stringify({ ...project(), flightModel: { ...LEGACY_FLIGHT_MODEL, modelId: 'unknown-candidate' } });
    const backend = createMemoryBackend();
    await backend.update(() => text);
    const store = createProjectStore(backend);
    await expect(store.load()).rejects.toThrow(/flightModel/);
    await expect(store.save(project(), 0)).rejects.toThrow(/flightModel/);
    expect(await backend.read()).toBe(text);
  });
});
