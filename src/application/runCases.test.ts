import { describe, expect, it } from 'vitest';
import { readProject, writeProject } from '../formats/projectJson';
import { useProjectStore } from '../state/project';
import type { AnalysisRecord } from '../state/analysis';
import { withEvidenceRefs, withRunCases } from './runCases';
import { captureRunInputs } from './runInputs';
import { toFlightRun } from '../console/data/adapter';
import { flightResult } from '../console/testFixtures';
import { savedTelemetryFixture } from './savedTelemetry.fixture';
import { parseSavedFlightOutputs, SAVED_FLIGHT_OUTPUT_UNITS } from './savedFlightOutputs';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { Dispersion } from '../console/data/contract';

const result = (value: number, unit = 'm') => ({ value, unit, confidence: 'modeled' as const });

type Termination = { terminationReason?: 'touchdown' | 'timeout'; landingNominal?: boolean; events?: unknown[] };

function flightRecord(token: number, motorId = 'estes_c6', apogee = 534, end: Termination = {}): AnalysisRecord {
  return {
    kind: 'flight',
    status: 'completed',
    inputKey: `key-${token}`,
    startedAt: '2026-10-18T10:00:00.000Z',
    finishedAt: `2026-10-18T10:00:0${token}.000Z`,
    error: null,
    token,
    payload: {
      design: { motorId },
      run: {
        rev: 1,
        durationMs: 535,
        ...(end.terminationReason === undefined ? {} : { terminationReason: end.terminationReason }),
        ...(end.events === undefined ? {} : { events: end.events }),
        summary: {
          validity: 'PASS',
          enveloped: true,
          offNominalExcursion: false,
          landingNominal: end.landingNominal ?? true,
          apogee: result(apogee),
          apogeeTime: result(9.1, 's'),
          maxSpeed: result(98, 'm/s'),
          maxMach: result(0.29, '1'),
          maxAccelG: result(Number.NaN, 'g'),
          railExitSpeed: result(18.9, 'm/s'),
          drift: result(120),
          flightTime: result(80, 's'),
          landingSpeed: result(5.5, 'm/s'),
          landingEnergy: result(14.2, 'J'),
        },
      },
    },
  };
}

function ensembleRecord(token: number): AnalysisRecord {
  const landings = [
    { x: 0, y: 0 }, { x: 10, y: 4 }, { x: -6, y: 8 }, { x: 3, y: -9 },
  ];
  return {
    kind: 'ensemble',
    status: 'completed',
    inputKey: `mc-${token}`,
    startedAt: '2026-10-18T11:00:00.000Z',
    finishedAt: '2026-10-18T11:00:30.000Z',
    error: null,
    token,
    payload: {
      design: { motorId: 'estes_c6' },
      dispersion: { landings, mean: { x: 1.75, y: 0.75 }, sigma1: 8, sigma2: 6, thetaDeg: 10, r50: 7, r90: 11, r99: 12, ok: 4, failed: 0 },
    },
  };
}


function ensembleRecordWithIdentity(token: number, finInterferenceId: string | undefined): AnalysisRecord {
  const record = ensembleRecord(token);
  const payload = record.payload as { dispersion: Record<string, unknown> };
  payload.dispersion.normalLawId = 'published-supersonic-normal-v1';
  payload.dispersion.boattailPolicy = 'suppressed';
  if (finInterferenceId !== undefined) payload.dispersion.finInterferenceId = finInterferenceId;
  return record;
}

const base = () => useProjectStore.getState().project;

describe('run cases', () => {
  it('records completed flights and ensembles and round-trips through the envelope', () => {
    const project = withRunCases(base(), [flightRecord(1), ensembleRecord(2)]);
    const reopened = readProject(writeProject(project));
    expect(reopened.cases.map((c) => c.kind)).toEqual(['flight', 'monteCarlo']);
    const flight = reopened.cases[0];
    expect(flight.motorRecordId).toBe('estes_c6');
    expect(flight.summary).toMatchObject({ apogeeM: 534, railExitSpeedMps: 18.9, validity: 'PASS', inputKey: 'key-1' });
    // A non-finite engine value is stored as null, never as NaN.
    expect(flight.summary?.maxAccelG).toBeNull();
    const mc = reopened.cases[1];
    expect(mc.summary).toMatchObject({ runsSucceeded: 4, runsFailed: 0, r90M: 11 });
    const snapId = mc.summary?.dispersionSnapshotId as string;
    expect(reopened.snapshots.find((s) => s.id === snapId)?.kind).toBe('dispersion');
  });

  it('retains exact source-bound display telemetry and refuses malformed samples', () => {
    const project = base();
    const motor = { id: 'estes_c6', motor: CERTIFIED_MOTORS.estes_c6, provenance: { source: 'certified' as const } };
    const inputs = captureRunInputs(project, motor, 'telemetry-key', undefined);
    const run = {
      ...toFlightRun(flightResult({ telemetry: savedTelemetryFixture() }), inputs.vehicle, 'certified', inputs.inputKey, 1, 1),
      engineIdentity: { kind: 'production-rust-wasm' as const, sha256: 'b'.repeat(64) },
    };
    const record: AnalysisRecord = {
      ...flightRecord(1), inputKey: inputs.inputKey, runInputs: inputs,
      payload: { design: { motorId: motor.id }, run },
    };
    const saved = withRunCases(project, [record]);
    expect(saved.cases[0].telemetry).toEqual(savedTelemetryFixture());
    expect(saved.cases[0].telemetry).not.toBe(run.telemetry);
    expect(saved.cases[0].engineIdentity).toEqual(run.engineIdentity);
    expect(saved.cases[0].summary?.inputKey).toBe(inputs.inputKey);
    const once = writeProject(saved);
    expect(writeProject(readProject(once))).toBe(once);

    const malformed = structuredClone(record);
    (malformed.payload as { run: { telemetry: unknown[] } }).run.telemetry = [{ time: Number.NaN }];
    expect(() => withRunCases(project, [malformed])).toThrow(/telemetry\[0\]/);
  });

  it('archives the canonical versioned output dictionary with qualification, flags and sampled-peak context', () => {
    const project = base();
    const motor = { id: 'estes_c6', motor: CERTIFIED_MOTORS.estes_c6, provenance: { source: 'certified' as const } };
    const inputs = captureRunInputs(project, motor, 'outputs-key', undefined);
    const run = {
      ...toFlightRun(flightResult(), inputs.vehicle, 'certified', inputs.inputKey, 1, 1),
      engineIdentity: { kind: 'production-rust-wasm' as const, sha256: 'b'.repeat(64) },
    };
    const record: AnalysisRecord = {
      ...flightRecord(1), inputKey: inputs.inputKey, runInputs: inputs,
      payload: { design: { motorId: motor.id }, run },
    };
    const saved = withRunCases(project, [record]);
    const archive = saved.cases[0].flightOutputs!;
    expect(archive.dictionaryRevision).toBe('RMP10-C06/2');
    expect(archive.flags).toEqual({ validity: 'PASS', enveloped: true, offNominalExcursion: false,
      landingNominal: true, terminationReason: 'touchdown' });
    expect(archive.sampledMaxQ).toEqual(run.sampledMaxQ);
    expect(archive.outputs.maxQ).toEqual({ value: 54000, unit: 'Pa', confidence: 'modeled',
      reason: run.summary.maxQ!.reason, available: true });
    expect(archive.outputs.burnoutAltitude).toMatchObject({ value: 480, unit: 'm', available: true });
    expect(archive.outputs.weathercockAngleDeg).toMatchObject({ value: 1.8, unit: 'deg', available: true });
    expect(archive.outputs.apogeeToTouchdown).toMatchObject({ value: 155.7, unit: 's', confidence: 'modeled', available: true });
    for (const [id, output] of Object.entries(archive.outputs)) {
      if (!output) continue;
      expect(output.unit).toBe(SAVED_FLIGHT_OUTPUT_UNITS[id as keyof typeof SAVED_FLIGHT_OUTPUT_UNITS]);
    }
    expect(() => parseSavedFlightOutputs(archive)).not.toThrow();
    const once = writeProject(saved);
    expect(writeProject(readProject(once))).toBe(once);
    expect(readProject(once).cases[0].flightOutputs).toEqual(archive);
  });

  it('archives unavailable landing outputs as null with the recorded reason instead of zero or a fresh value', () => {
    const project = base();
    const motor = { id: 'estes_c6', motor: CERTIFIED_MOTORS.estes_c6, provenance: { source: 'certified' as const } };
    const inputs = captureRunInputs(project, motor, 'non-nominal-key', undefined);
    const run = {
      ...toFlightRun(flightResult({ touchdownNominal: false, landingVelocity: 30, landingKineticEnergy: 900 }),
        inputs.vehicle, 'certified', inputs.inputKey, 1, 1),
      engineIdentity: { kind: 'production-rust-wasm' as const, sha256: 'b'.repeat(64) },
    };
    const record: AnalysisRecord = {
      ...flightRecord(1), inputKey: inputs.inputKey, runInputs: inputs,
      payload: { design: { motorId: motor.id }, run },
    };
    const reopened = readProject(writeProject(withRunCases(project, [record])));
    const outputs = reopened.cases[0].flightOutputs!;
    for (const id of ['landingSpeed', 'landingEnergy', 'apogeeToTouchdown'] as const) {
      expect(outputs.outputs[id]).toMatchObject({ value: null, available: false, unavailableReason: 'no nominal touchdown' });
    }
    expect(outputs.flags).toMatchObject({ offNominalExcursion: false, landingNominal: false, terminationReason: 'touchdown' });
  });

  it('never writes a downgraded false flag for a run the engine marked off-nominal', () => {
    const project = base();
    const motor = { id: 'estes_c6', motor: CERTIFIED_MOTORS.estes_c6, provenance: { source: 'certified' as const } };
    const inputs = captureRunInputs(project, motor, 'off-nominal-key', undefined);
    const run = {
      ...toFlightRun(flightResult({ offNominalExcursion: true, validity: 'UNKNOWN' }),
        inputs.vehicle, 'certified', inputs.inputKey, 1, 1),
      engineIdentity: { kind: 'production-rust-wasm' as const, sha256: 'b'.repeat(64) },
    };
    const record: AnalysisRecord = {
      ...flightRecord(1), inputKey: inputs.inputKey, runInputs: inputs,
      payload: { design: { motorId: motor.id }, run },
    };
    const reopened = readProject(writeProject(withRunCases(project, [record])));
    expect(reopened.cases[0].summary?.offNominalExcursion).toBe(true);
    expect(reopened.cases[0].flightOutputs?.flags.offNominalExcursion).toBe(true);
  });

  it('skips running and failed runs and other analysis kinds', () => {
    const failed: AnalysisRecord = { ...flightRecord(3), status: 'failed', error: 'boom' };
    const running: AnalysisRecord = { ...flightRecord(4), status: 'running', finishedAt: null };
    const mass: AnalysisRecord = { ...flightRecord(5), kind: 'mass' };
    expect(withRunCases(base(), [failed, running, mass]).cases).toEqual(base().cases);
  });

  it('retains landing energy and the recorded termination reason; absent reason stays absent', () => {
    const timedOut = flightRecord(6, 'estes_c6', 534, { terminationReason: 'timeout', landingNominal: false });
    const reopened = readProject(writeProject(withRunCases(base(), [flightRecord(1), timedOut])));
    expect(reopened.cases[0].summary).toMatchObject({ landingEnergyJ: 14.2, landingNominal: true });
    expect(reopened.cases[0].summary).not.toHaveProperty('terminationReason');
    expect(reopened.cases[1].summary).toMatchObject({ terminationReason: 'timeout', landingNominal: false, landingEnergyJ: 14.2 });
  });

  it('retains exact recorded events; malformed or absent events stay absent rather than repaired', () => {
    const events = [
      { t: 0, kind: 'ignition', label: 'Ignition', altitude: 0, velocity: 0 },
      { t: 2.5, kind: 'max_q', label: 'Sampled Max-Q', altitude: 80, velocity: 95, derived: true },
      { t: 80, kind: 'touchdown', label: 'Touchdown', altitude: 0, velocity: 5.5 },
    ];
    const malformed = [{ ...events[0], altitude: Number.NaN }];
    const reopened = readProject(writeProject(withRunCases(base(), [
      flightRecord(1, 'estes_c6', 534, { events }), flightRecord(2, 'estes_c6', 534, { events: malformed }), flightRecord(3)])));
    expect(reopened.cases[0].events).toEqual(events);
    expect(reopened.cases[1]).not.toHaveProperty('events');
    expect(reopened.cases[2]).not.toHaveProperty('events');
  });

  it('carries existing cases forward and never duplicates a run on re-save', () => {
    const once = withRunCases(base(), [flightRecord(1)]);
    const reopened = readProject(writeProject(once));
    const twice = withRunCases(reopened, [flightRecord(1), flightRecord(2)]);
    expect(twice.cases).toHaveLength(2);
    expect(twice.cases[0]).toEqual(once.cases[0]);
  });

  it('adds the certified record for a library motor the project does not list', () => {
    const project = withRunCases(base(), [flightRecord(1, 'aerotech_h128w')]);
    expect(project.motorRecords.some((r) => r.id === 'aerotech_h128w')).toBe(true);
    expect(() => readProject(writeProject(project))).not.toThrow();
  });

  it('leaves out a run whose motor cannot be resolved instead of writing an invalid case', () => {
    const project = withRunCases(base(), [flightRecord(1, 'no-such-motor')]);
    expect(project.cases).toEqual(base().cases);
    expect(() => readProject(writeProject(project))).not.toThrow();
  });

  it('archives classified counts, normal-law identity and only a supported-nominal dispersion snapshot', () => {
    const classified: Dispersion = {
      normalLawId: 'published-supersonic-normal-v1', boattailPolicy: 'suppressed',
      landings: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 99, y: 0 }],
      mean: { x: 0, y: 0 }, sigma1: 0, sigma2: 0, thetaDeg: 0, r50: 0, r90: 0, r99: 0,
      ok: 3, failed: 1,
      counts: {
        requested: 4, supportedNominalTerminal: 2, unsupportedNominalTouchdown: 0,
        nonNominalImpact: 0, timeLimitEndpoint: 1, computationalFailure: 1,
      },
      endpoints: [{ runIndex: 0, point: { x: 0, y: 0 } }, { runIndex: 1, point: { x: 10, y: 0 } }, { runIndex: 2, point: { x: 99, y: 0 } }],
      eligibleEndpoints: [{ runIndex: 0, point: { x: 0, y: 0 } }, { runIndex: 1, point: { x: 10, y: 0 } }],
      statisticsAvailable: true,
      statistics: { mean: { x: 5, y: 0 }, covariance: { xx: 50, xy: 0, yy: 0 }, sigma1: Math.sqrt(50), sigma2: 0, thetaDeg: 0, containmentRadii: { r50: 5, r90: 5, r99: 5 } },
      outcomePolicy: 'classified-v1',
    };
    const record: AnalysisRecord = { ...ensembleRecord(2), payload: { design: { motorId: 'estes_c6' }, dispersion: classified } };
    const project = withRunCases(base(), [record]);
    const mc = project.cases[0];
    expect(mc.summary).toMatchObject({
      runsSucceeded: 3, runsFailed: 1, runsRequested: 4, runsEligible: 2,
      runsTimeLimit: 1, runsComputationalFailure: 1, outcomePolicy: 'classified-v1', statisticsAvailable: true,
    });
    const roundTrip = readProject(writeProject(project));
    expect(roundTrip.cases[0].summary).toMatchObject({
      normalLawId: 'published-supersonic-normal-v1', boattailPolicy: 'suppressed',
    });
    const old = structuredClone(record);
    delete (old.payload as { dispersion: Dispersion }).dispersion.normalLawId;
    delete (old.payload as { dispersion: Dispersion }).dispersion.boattailPolicy;
    const oldRoundTrip = readProject(writeProject(withRunCases(base(), [old])));
    expect(oldRoundTrip.cases[0].summary).not.toHaveProperty('normalLawId');
    expect(oldRoundTrip.cases[0].summary).not.toHaveProperty('boattailPolicy');
    const snapId = mc.summary?.dispersionSnapshotId as string;
    expect(project.snapshots.find((s) => s.id === snapId)?.data).toMatchObject({ mean: { x: 5, y: 0 } });
    expect(() => readProject(writeProject(project))).not.toThrow();
  });

  it('does not fabricate a dispersion snapshot when no run is eligible', () => {
    const classified: Dispersion = {
      landings: [{ x: 99, y: 0 }],
      mean: { x: NaN, y: NaN }, sigma1: NaN, sigma2: NaN, thetaDeg: NaN, r50: NaN, r90: NaN, r99: NaN,
      ok: 1, failed: 0,
      counts: { requested: 1, supportedNominalTerminal: 0, unsupportedNominalTouchdown: 1, nonNominalImpact: 0, timeLimitEndpoint: 0, computationalFailure: 0 },
      endpoints: [{ runIndex: 0, point: { x: 99, y: 0 } }],
      eligibleEndpoints: [],
      statisticsAvailable: false,
      statistics: null,
      outcomePolicy: 'classified-v1',
    };
    const record: AnalysisRecord = { ...ensembleRecord(2), payload: { design: { motorId: 'estes_c6' }, dispersion: classified } };
    const project = withRunCases(base(), [record]);
    expect(project.cases[0].summary).toMatchObject({ runsEligible: 0, runsUnsupportedNominal: 1, statisticsAvailable: false });
    expect(project.cases[0].summary?.dispersionSnapshotId).toBeNull();
    expect(project.snapshots).toEqual(base().snapshots);
    expect(() => readProject(writeProject(project))).not.toThrow();
  });
});

describe('evidence refs', () => {
  const entry = (id: string, kind: 'altimeter-csv' | 'gps-gpx' | 'calibration' | 'note', sha: string, file: string | null) => ({
    id, kind, title: id, createdAt: '2026-10-18T12:00:00.000Z', sourceFileName: file, sha256Hex: sha,
    rawText: 'time,alt\n0,0\n', sampleCount: 1, unitsNote: 'assumed', processingSteps: [],
    review: 'unreviewed' as const, linkedRunKey: null, note: null,
  });

  it('indexes the ledger into evidenceRefs and round-trips', () => {
    const sha = 'a'.repeat(64);
    const project = withEvidenceRefs({
      ...base(),
      ledger: [entry('e1', 'altimeter-csv', sha, 'flight.csv'), entry('e2', 'gps-gpx', 'unavailable', null), entry('e3', 'note', sha, null)],
    });
    const reopened = readProject(writeProject(project));
    expect(reopened.evidenceRefs).toEqual([
      { id: 'e1', kind: 'altimetry', createdAt: '2026-10-18T12:00:00.000Z', checksumSha256: sha, sourceFile: 'flight.csv' },
      { id: 'e2', kind: 'gpsTrack', createdAt: '2026-10-18T12:00:00.000Z' },
    ]);
    expect(withEvidenceRefs(reopened).evidenceRefs).toHaveLength(2);
  });
  it('carries the declared fin-interference identity through Save -> Open', () => {
    const project = withRunCases(base(), [ensembleRecordWithIdentity(7, 'fin-station-v2')]);
    const reopened = readProject(writeProject(project));
    const summary = reopened.cases.at(-1)?.summary as Record<string, unknown> | undefined;
    expect(summary?.finInterferenceId).toBe('fin-station-v2');
    expect(summary?.normalLawId).toBe('published-supersonic-normal-v1');
  });

  it('opens saved projects whose summaries predate the fin-interference key', () => {
    const project = withRunCases(base(), [ensembleRecord(8)]);
    const reopened = readProject(writeProject(project));
    const summary = reopened.cases.at(-1)?.summary as Record<string, unknown> | undefined;
    expect(summary && 'finInterferenceId' in summary).toBe(false);
  });

});
