/**
 * Run history and evidence references in the project envelope: each completed flight or Monte Carlo
 * run of the session becomes a `SimCase` with a flat scalar summary, and each
 * ensemble also leaves a dispersion snapshot. Cases already in the project
 * (from an opened file) are carried forward unchanged, so Save → Open → Save
 * never drops history.
 *
 * Cases are a record of what ran, not a cache: an opened case is never
 * re-presented as a current result. Freshness still comes from re-running
 * against the committed inputs.
 */

import type { EvidenceRef, MotorRecord, ProjectEnvelope, ProjectSnapshot, SimCase } from '../formats/projectJson';
import type { LedgerEntry } from './evidenceLedger';
import { CERTIFIED_MOTORS, normalizeMotorId } from '../propulsion/motorDatabase';
import { computeDispersionStatistics } from '../sim/monteCarlo';
import type { AnalysisRecord } from '../state/analysis';
import type { Dispersion, FlightEvent, FlightRun } from '../console/data/contract';
import { savedFlightOutputs } from '../console/data/recoveryResults';
import { parseSavedFlightEvents } from './flightEvents';
import { parseSavedTelemetry } from './savedTelemetry';
import type { RunInputs } from './runInputs';
import type { SixDofTelemetryPoint } from '../sim/sixDofSimulator';
import type { CandidateResultArchive } from './candidateResult';
import type { NativeCandidateRequest } from './candidate';
import type { EngineIdentity } from '../engine/identity';
import { CANDIDATE_FLIGHT_MODEL } from './flightModel';
import { hashHex, stableStringify } from './caseResolver';

type Scalar = number | string | boolean | null;

/** A finite number, or null: the envelope summary refuses NaN and infinities. */
function finite(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface RunPayload {
  model?: 'legacy' | 'candidate';
  design?: { motorId?: string };
  run?: FlightRun;
  dispersion?: Dispersion;
  result?: CandidateResultArchive;
  request?: NativeCandidateRequest;
  engineIdentity?: EngineIdentity;
}

function candidateSummary(result: CandidateResultArchive, inputKey: string): Record<string, Scalar> {
  return {
    inputKey,
    archiveForm: 'candidate',
    modelId: CANDIDATE_FLIGHT_MODEL.modelId,
    status: result.status,
    termination: result.termination,
    computationalCompletion: result.computationalCompletion,
    finalTimeS: finite(result.finalTimeS),
    observedPrefixMaxAltitudeM: finite(result.observedPrefix.maxAltitudeAglM),
    observedPrefixMaxAltitudeTimeS: finite(result.observedPrefix.maxAltitudeTimeS),
    observedPrefixMaxAirspeedMps: finite(result.observedPrefix.maxAirspeedMps),
    observedPrefixMaxDynamicPressurePa: finite(result.observedPrefix.maxDynamicPressurePa),
    sampleCount: finite(result.sampleCount),
    retainedSampleCount: finite(result.retainedSamples.length),
    eventCount: finite(result.events.length),
    candidateLandingAvailable: result.landing !== null,
    contentIdentitySha256: result.contentIdentity.sha256,
  };
}

export function caseId(record: AnalysisRecord): string {
  return `${record.kind}-${record.finishedAt ?? record.startedAt}-${record.token}`;
}

function flightSummary(run: FlightRun, inputKey: string): Record<string, Scalar> {
  const s = run.summary;
  return {
    inputKey,
    projectRevision: finite(run.rev),
    validity: String(s.validity),
    landingNominal: s.landingNominal,
    offNominalExcursion: s.offNominalExcursion,
    apogeeM: finite(s.apogee.value),
    apogeeTimeS: finite(s.apogeeTime.value),
    maxSpeedMps: finite(s.maxSpeed.value),
    maxMach: finite(s.maxMach.value),
    maxAccelG: finite(s.maxAccelG.value),
    railExitSpeedMps: finite(s.railExitSpeed.value),
    driftM: finite(s.drift.value),
    flightTimeS: finite(s.flightTime.value),
    landingSpeedMps: finite(s.landingSpeed.value),
    landingEnergyJ: finite(s.landingEnergy.value),
    durationMs: finite(run.durationMs),
    // Absent on runs that never recorded how the loop ended; not invented.
    ...(run.terminationReason === undefined ? {} : { terminationReason: run.terminationReason }),
  };
}

function dispersionSnapshot(id: string, createdAt: string, dispersion: Dispersion): ProjectSnapshot | null {
  // classified-v1: the snapshot is the strict supported-nominal footprint.
  // Zero eligible samples are absent, never a fabricated zero-valued cloud;
  // a single sample keeps the existing no-snapshot rule.
  if (dispersion.statisticsAvailable === false) return null;
  const sampleCount = dispersion.eligibleEndpoints?.length ?? dispersion.landings.length;
  if (sampleCount < 2) return null;
  let stats = dispersion.statistics ?? null;
  if (stats === null) {
    try {
      stats = computeDispersionStatistics(dispersion.landings);
    } catch {
      return null;
    }
  }
  const values = [
    stats.mean.x, stats.mean.y, stats.covariance.xx, stats.covariance.xy, stats.covariance.yy,
    stats.sigma1, stats.sigma2, stats.thetaDeg,
    stats.containmentRadii.r50, stats.containmentRadii.r90, stats.containmentRadii.r99,
  ];
  if (!values.every(Number.isFinite)) return null;
  return { id, kind: 'dispersion', createdAt, source: id.replace(/^dispersion-/, ''), data: stats };
}

/**
 * The project with the session's completed runs appended as cases (and
 * ensemble dispersion snapshots). A run whose motor has no record in the
 * project gets its certified library record added; a run whose motor cannot
 * be resolved at all is left out, since the envelope refuses a case that
 * names an unknown motor record.
 */
export function withRunCases(project: ProjectEnvelope, history: ReadonlyArray<AnalysisRecord>): ProjectEnvelope {
  const cases: SimCase[] = [...project.cases];
  const snapshots: ProjectSnapshot[] = [...project.snapshots];
  const motorRecords: MotorRecord[] = [...project.motorRecords];
  const caseIds = new Set(cases.map((c) => c.id));
  const snapshotIds = new Set(snapshots.map((s) => s.id));
  const recordIds = new Set(motorRecords.map((r) => normalizeMotorId(r.id)));

  for (const record of history) {
    if (record.status !== 'completed' || (record.kind !== 'flight' && record.kind !== 'ensemble')) continue;
    const id = caseId(record);
    if (caseIds.has(id)) continue;
    const payload = (record.payload ?? {}) as RunPayload;
    const inputs = record.runInputs;
    // A dedicated record preserves the old curve when a live same-ID motor changes.
    // Include provenance in the alias identity as it is part of this saved record.
    let motorId = inputs ? `archive_${hashHex(stableStringify({ motor: inputs.motorRecord.motor, provenance: inputs.motorRecord.provenance }))}`
      : payload.design?.motorId ? normalizeMotorId(payload.design.motorId) : null;
    if (!motorId) continue;
    if (inputs) {
      const pin = { ...structuredClone(inputs.motorRecord), id: motorId };
      const stem = motorId;
      let suffix = 2;
      while (recordIds.has(motorId) && stableStringify(motorRecords.find((r) => r.id === motorId)) !== stableStringify({ ...pin, id: motorId })) motorId = `${stem}_${suffix++}`;
      if (!recordIds.has(motorId)) {
        motorRecords.push({ ...pin, id: motorId });
        recordIds.add(motorId);
      }
    }
    if (!recordIds.has(motorId)) {
      const certified = CERTIFIED_MOTORS[motorId];
      if (!certified) continue;
      motorRecords.push({ id: motorId, motor: certified, provenance: { source: 'certified' } });
      recordIds.add(motorId);
    }
    const createdAt = record.finishedAt ?? record.startedAt;
    if (record.kind === 'flight' && (payload.model === 'candidate' || payload.result !== undefined)) {
      const result = payload.result;
      const engineIdentity = payload.engineIdentity;
      if (!result || !engineIdentity || !inputs || inputs.version !== 3) continue;
      if (inputs.inputKey !== record.inputKey) {
        throw new Error('saved candidate input key disagrees with its archived run');
      }
      cases.push({
        id,
        kind: 'flight',
        createdAt,
        motorRecordId: motorId,
        summary: candidateSummary(result, record.inputKey),
        inputs: structuredClone(inputs),
        engineIdentity: structuredClone(engineIdentity),
        candidateResult: structuredClone(result),
      });
      caseIds.add(id);
      continue;
    }
    let summary: Record<string, Scalar>;
    if (record.kind === 'flight') {
      if (!payload.run) continue;
      summary = flightSummary(payload.run, record.inputKey);
    } else {
      const dispersion = payload.dispersion;
      if (!dispersion) continue;
      summary = {
        inputKey: record.inputKey,
        // Legacy meanings preserved: succeeded = finite endpoints, failed = computational failures.
        ...(dispersion.normalLawId === undefined ? {} : { normalLawId: dispersion.normalLawId }),
        ...(dispersion.boattailPolicy === undefined ? {} : { boattailPolicy: dispersion.boattailPolicy }),
        ...(dispersion.finInterferenceId === undefined ? {} : { finInterferenceId: dispersion.finInterferenceId }),
        runsSucceeded: finite(dispersion.ok),
        runsFailed: finite(dispersion.failed),
        sigma1M: finite(dispersion.sigma1),
        sigma2M: finite(dispersion.sigma2),
        r50M: finite(dispersion.r50),
        r90M: finite(dispersion.r90),
        r99M: finite(dispersion.r99),
        ...(dispersion.counts === undefined ? {} : {
          runsRequested: finite(dispersion.counts.requested),
          runsEligible: finite(dispersion.counts.supportedNominalTerminal),
          runsUnsupportedNominal: finite(dispersion.counts.unsupportedNominalTouchdown),
          runsNonNominal: finite(dispersion.counts.nonNominalImpact),
          runsTimeLimit: finite(dispersion.counts.timeLimitEndpoint),
          runsComputationalFailure: finite(dispersion.counts.computationalFailure),
          outcomePolicy: dispersion.outcomePolicy ?? 'classified-v1',
          statisticsAvailable: dispersion.statisticsAvailable ?? false,
        }),
        dispersionSnapshotId: null,
      };
      const snapId = `dispersion-${id}`;
      const snapshot = snapshotIds.has(snapId) ? null : dispersionSnapshot(snapId, createdAt, dispersion);
      if (snapshot) {
        snapshots.push(snapshot);
        snapshotIds.add(snapId);
        summary.dispersionSnapshotId = snapId;
      }
    }
    const engineIdentity = record.kind === 'flight' ? payload.run?.engineIdentity : payload.dispersion?.engineIdentity;
    const events = record.kind === 'flight' ? recordedEvents(payload.run) : undefined;
    const telemetry = record.kind === 'flight' ? recordedTelemetry(payload.run, inputs, record.inputKey) : undefined;
    const flightOutputs = record.kind === 'flight' && payload.run ? savedFlightOutputs(payload.run) : undefined;
    cases.push({ id, kind: record.kind === 'flight' ? 'flight' : 'monteCarlo', createdAt, motorRecordId: motorId, summary,
      ...(inputs === undefined ? {} : { inputs: structuredClone(inputs) }),
      ...(engineIdentity === undefined ? {} : { engineIdentity: structuredClone(engineIdentity) }),
      ...(flightOutputs === undefined ? {} : { flightOutputs }),
      ...(record.kind === 'flight' && payload.run?.momentArmHistory
        ? { momentArmHistory: structuredClone(payload.run.momentArmHistory) } : {}),
      ...(events === undefined ? {} : { events }),
      ...(telemetry === undefined ? {} : { telemetry }),
    });
    caseIds.add(id);
  }
  return { ...project, cases, snapshots, motorRecords };
}

/** The run's exact timeline, or absent when it would not pass the saved-case parser; never repaired. */
function recordedEvents(run: FlightRun | undefined): FlightEvent[] | undefined {
  if (!run) return undefined;
  try { return parseSavedFlightEvents(run.events); } catch { return undefined; }
}

/**
 * Prospective source-bound samples only. Missing legacy source bindings stay absent;
 * malformed bound samples fail the save rather than being dropped or truncated.
 */
function recordedTelemetry(run: FlightRun | undefined, inputs: RunInputs | undefined, inputKey: string): SixDofTelemetryPoint[] | undefined {
  if (!run || run.telemetry === undefined || !inputs || !run.engineIdentity) return undefined;
  if (run.inputKey !== inputKey || inputs.inputKey !== inputKey) {
    throw new Error('saved telemetry input key disagrees with its archived run');
  }
  return parseSavedTelemetry(run.telemetry);
}

const EVIDENCE_KIND_OF: Readonly<Record<LedgerEntry['kind'], EvidenceRef['kind'] | null>> = {
  'altimeter-csv': 'altimetry',
  'gps-gpx': 'gpsTrack',
  calibration: 'calibration',
  note: null,
};

/**
 * The project with `evidenceRefs` indexed from its ledger: one reference per
 * altimetry, GPS or calibration entry, carrying the checksum and file name
 * only when the ledger recorded them. The ledger stays the record of the raw
 * bytes; references from an opened file are kept.
 */
export function withEvidenceRefs(project: ProjectEnvelope): ProjectEnvelope {
  const refs: EvidenceRef[] = [...project.evidenceRefs];
  const ids = new Set(refs.map((r) => r.id));
  for (const entry of project.ledger) {
    const kind = EVIDENCE_KIND_OF[entry.kind];
    if (!kind || ids.has(entry.id)) continue;
    const ref: EvidenceRef = { id: entry.id, kind, createdAt: entry.createdAt };
    if (/^[0-9a-f]{64}$/i.test(entry.sha256Hex)) ref.checksumSha256 = entry.sha256Hex;
    if (entry.sourceFileName) ref.sourceFile = entry.sourceFileName;
    refs.push(ref);
    ids.add(entry.id);
  }
  return { ...project, evidenceRefs: refs };
}
