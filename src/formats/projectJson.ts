/**
 * Astraea Versioned JSON Project Envelope — engine side (adapter matrix rows
 * 1-2, S3-lite storage).
 *
 * The canonical on-disk project format (missing-cell #1 in docs/internal/adapter-matrix.md,
 * "durable reload" prerequisite) is a schema-versioned envelope carrying the
 * SSOT vehicle plus every payload a project needs to reload with provenance:
 * motor records (curve + provenance), motor-mount bindings, simulation cases,
 * weather/dispersion snapshots, and evidence references.
 *
 * Reads fail closed. A document is either a versioned envelope or a LEGACY
 * bare vehicle — the exact shape Header.tsx historically wrote
 * (`JSON.parse(text)` of a plain `RocketVehicle`, no `schemaVersion`).
 * Legacy documents are pushed through an explicit migration chain; a document
 * with a string `schemaVersion` we have no migration for (typically a FUTURE
 * format) is rejected, never guessed at. Every structural violation —
 * unknown component type, dangling binding, unresolvable motor record,
 * malformed snapshot — throws `InvalidProjectError` instead of degrading.
 *
 * Writes are guarded against stale revisions (optimistic concurrency, S3
 * conditional-write semantics). `createProjectStore` tracks a monotonic,
 * durable per-project revision; `save(project, expectedRevision)` rejects
 * with `StaleRevisionError` when the caller's base revision no longer matches
 * the stored revision, so a write derived from an outdated read can never
 * silently clobber newer state. `writeProject` alone validates + serializes
 * (the store composes it), keeping the module pure and testable.
 */

import type {
  RocketVehicle,
  RocketComponent,
  ComponentType,
  NoseconeShape,
  FinCrossSection,
  FinPoint,
} from '../core/types';
import { SURFACE_FINISH_NAMES, AIRFOIL_SECTION_NAMES } from '../core/types';
import { validateFreeformPoints } from '../aero/finPlanform';
import { stringifyReportJson } from './reportJson';
import {
  CERTIFIED_MOTORS,
  normalizeMotorId,
  validateMotorSpec,
  type MotorSpec,
} from '../propulsion/motorDatabase';
import type { WindLayer } from '../sim/weather';
import type { DispersionStatistics } from '../sim/monteCarlo';
import { DEFAULT_WORKSPACE, parseWorkspace, type Workspace } from '../application/workspace';
import { DEFAULT_MISSION, parseMission, type Mission } from '../application/mission';
import { parseLedgerEntry, type LedgerEntry } from '../application/evidenceLedger';
import { parseDragCalibration, type DragCalibration } from '../application/dragCalibration';
import { parseAeroModelSelection, type AeroModelSelection } from '../application/aeroModel';
import type { RunInputs, CandidateRunInputs } from '../application/runInputs';
import { parseEngineIdentity, type EngineIdentity } from '../engine/identity';
import { stableStringify } from '../application/caseResolver';
import { parseFlightModel, parseLegacyFlightModel, parseCandidateFlightModel, resolveFlightModel, CANDIDATE_FLIGHT_MODEL, type FlightModelSelection, type CandidateFlightModelSelection, type LegacyFlightModelSelection } from '../application/flightModel';
import { parseCandidateResultArchive, type CandidateResultArchive } from '../application/candidateResult';
import { assertCandidateInvocationConsistent, parseCandidateInvocation, type CandidateInvocation, type CandidateMotorDerivation } from '../application/candidate';
import { parseMomentArmHistory, type MomentArmHistory } from '../application/momentArmHistory';
import { parseSavedFlightEvents } from '../application/flightEvents';
import { parseSavedTelemetry } from '../application/savedTelemetry';
import { parseSavedFlightOutputs, type SavedFlightOutputs } from '../application/savedFlightOutputs';
import type { FlightEvent } from '../console/data/contract';
import type { SixDofTelemetryPoint } from '../sim/sixDofSimulator';

/** Current project envelope schema version. */
export const PROJECT_SCHEMA_VERSION = '1.13.0';
/** 1.12.0 predates the aerodynamic-model selection on envelope and case inputs. */
export const PROJECT_SCHEMA_V1_12_0 = '1.12.0';
/** 1.11.0 predates explicit candidate selection and candidate case archives. */
export const PROJECT_SCHEMA_V1_11_0 = '1.11.0';
/** 1.10.0 predates the archived canonical flight output dictionary. */
export const PROJECT_SCHEMA_V1_10_0 = '1.10.0';
/** 1.9.0 predates retained bounded display telemetry. */
export const PROJECT_SCHEMA_V1_9_0 = '1.9.0';
/** 1.8.0 predates retained recorded flight events. */
export const PROJECT_SCHEMA_V1_8_0 = '1.8.0';
/** 1.7.0 predates retained sampled flight-model history. */
export const PROJECT_SCHEMA_V1_7_0 = '1.7.0';
/** 1.6.0 predates explicit project/run flight-model selection. */
export const PROJECT_SCHEMA_V1_6_0 = '1.6.0';
/** 1.5.0 predates complete dispatch-time case inputs. */
export const PROJECT_SCHEMA_V1_5_0 = '1.5.0';
/**
 * Previous envelope version, kept as a migration source. 1.0.0 documents come
 * in two vintages that share this version string: main-era and reverse-era
 * (which additionally carried surface finish, launch site and native-geometry
 * station fields). The reader validates them with the current vehicle
 * validator; fields the current engine does not carry are dropped on the way
 * through, exactly as an unknown field in a newer document is.
 */
export const PROJECT_SCHEMA_V1_0_0 = '1.0.0';
/** 1.1.0 carried the nose station under its first-generation field name. */
export const PROJECT_SCHEMA_V1_1_0 = '1.1.0';
/** 1.2.0 documents carry no mission (name, site label, target apogee) and no fin shear override. */
export const PROJECT_SCHEMA_V1_2_0 = '1.2.0';
/** 1.3.0 documents carry no drag calibration; every run uses the model's own drag. */
export const PROJECT_SCHEMA_V1_3_0 = '1.3.0';
/** 1.4.0 documents predate freeform fin sets; every component type they hold is still valid. */
export const PROJECT_SCHEMA_V1_4_0 = '1.4.0';

/** Revision every migrated/created envelope receives. */
export const INITIAL_REVISION = 1;

/** Thrown when a project document fails structural validation (read or write). */
export class InvalidProjectError extends Error {
  constructor(message: string) {
    super(`Invalid project: ${message}`);
    this.name = 'InvalidProjectError';
  }
}

/** Thrown when a write's base revision no longer matches the stored revision. */
export class StaleRevisionError extends Error {
  constructor(
    message: string,
    readonly expectedRevision: number,
    readonly storedRevision: number,
  ) {
    super(message);
    this.name = 'StaleRevisionError';
  }
}

// ---------------------------------------------------------------------------
// Envelope schema
// ---------------------------------------------------------------------------

/** Where a motor record's curve/data came from. */
export type MotorSource = 'certified' | 'import' | 'derived';

/** Provenance trail for one motor record (never silently re-labeled). */
export interface MotorProvenance {
  source: MotorSource;
  /** Original file name for imported records (.eng/.rse). */
  sourceFile?: string;
  /** sha256 hex of the original source bytes (raw preservation). */
  sourceSha256?: string;
  /** ISO-8601 acceptance timestamp for imported/derived records. */
  importedAt?: string;
  /** Free-form attribution (e.g. ThrustCurve.org profile URL). */
  note?: string;
}

/** A motor usable by the project: full validated spec plus provenance. */
export interface MotorRecord {
  /** Normalized motor id — unique across motorRecords. */
  id: string;
  motor: MotorSpec;
  provenance: MotorProvenance;
}

/** Formal link between the vehicle and a stored motor record. */
export interface MotorMountBinding {
  kind: 'motorMount';
  /** Vehicle component id (motor-mount body tube) seating the motor. */
  vehicleComponentId: string;
  /** Key into motorRecords — must resolve (fail-closed). */
  motorRecordId: string;
}

export type SimCaseKind = 'flight' | 'monteCarlo';

/** One executed simulation case: input identity + a flat scalar summary. */
export interface SimCase {
  id: string;
  kind: SimCaseKind;
  /** ISO-8601 execution timestamp. */
  createdAt: string;
  /** Motor record the case ran against. */
  motorRecordId: string;
  /** Weather snapshot the case consumed, when any. */
  weatherSnapshotId?: string;
  /** Flat scalar result summary (JSON-safe; nested payloads live in snapshots). */
  summary?: Record<string, number | string | boolean | null>;
  /** Absent on legacy summary-only records: unavailable, never reconstructed. */
  inputs?: RunInputs;
  /** Actual invocation identity; absent on older records means unknown. */
  engineIdentity?: EngineIdentity;
  /** Optional exact sampled output, bound to this case's inputs/runtime. */
  momentArmHistory?: MomentArmHistory;
  /** Flight only: the run's recorded event timeline; absent means not recorded. */
  events?: FlightEvent[];
  /** Exact bounded display samples; absent means unavailable, never reconstructed. */
  telemetry?: SixDofTelemetryPoint[];
  /** Canonical versioned output dictionary and run flags; absent before 1.11.0, never backfilled. */
  flightOutputs?: SavedFlightOutputs;
  /** Candidate-only archive (1.12.0); never present on a legacy case. */
  candidateResult?: CandidateResultArchive;
}

export type SnapshotKind = 'weather' | 'dispersion';

/** A frozen input/output snapshot: weather sounding or dispersion statistics. */
export interface ProjectSnapshot {
  id: string;
  kind: SnapshotKind;
  /** ISO-8601 capture timestamp. */
  createdAt: string;
  /** Attribution: 'open-meteo', 'manual', or a run id. */
  source: string;
  /** Weather: ISA-derived wind layers; dispersion: landing statistics. */
  data: WindLayer[] | DispersionStatistics;
}

export type EvidenceKind = 'altimetry' | 'calibration' | 'gpsTrack';

/** Reference to an ingested physical-evidence record (raw bytes preserved). */
export interface EvidenceRef {
  id: string;
  kind: EvidenceKind;
  /** ISO-8601 ingestion timestamp. */
  createdAt: string;
  /** sha256 hex of the ingested raw source bytes. */
  checksumSha256?: string;
  /** Original source file name. */
  sourceFile?: string;
}

/**
 * The versioned project envelope. `revision` is the optimistic-concurrency
 * guard field: the store stamps it on every accepted save, and a save whose
 * base revision no longer matches the stored revision is rejected.
 */
export interface ProjectEnvelope {
  schemaVersion: string;
  /** Absent in old documents means the preserved legacy model, never candidate. */
  flightModel?: FlightModelSelection;
  revision: number;
  vehicle: RocketVehicle;
  motorRecords: MotorRecord[];
  bindings: MotorMountBinding[];
  cases: SimCase[];
  snapshots: ProjectSnapshot[];
  evidenceRefs: EvidenceRef[];
  /** Launcher, site, ensemble, aero-limit, and recovery settings. */
  workspace: Workspace;
  /** What the design is for: name, launch-site label and target apogee. */
  mission: Mission;
  /**
   * Fin shear-modulus override, Pa. Absent means the material default. It
   * changes the flutter result, so it is part of the run identity and must
   * travel with the project.
   */
  finShearModulusPa?: number;
  /**
   * Drag calibration fitted to a flight log of this rocket. Absent means the
   * model's own drag (scale 1). It changes every flight result, so it is part
   * of the run identity and must travel with the project.
   */
  dragCalibration?: DragCalibration;
  /**
   * Selected aerodynamic model for new runs (1.13.0). Absent means the legacy
   * path; the selection is recorded per run in the case inputs, so a saved
   * case replays with the model it actually used.
   */
  aeroModel?: AeroModelSelection;
  /** Flight-evidence ledger: immutable ingested records plus calibration candidates. */
  ledger: LedgerEntry[];
}

// ---------------------------------------------------------------------------
// Migration chain
// ---------------------------------------------------------------------------

/**
 * Ordered migration chain: each step moves an OLD document version to the
 * next. `from === null` is the LEGACY bare-vehicle shape (no schemaVersion).
 * Read walks the chain until the document reaches PROJECT_SCHEMA_VERSION.
 * Extend this array when a new schema version ships — never branch in the
 * readers.
 */
const MIGRATION_CHAIN: ReadonlyArray<{
  from: string | null;
  to: string;
  migrate: (doc: unknown) => unknown;
}> = [
  { from: null, to: PROJECT_SCHEMA_V1_0_0, migrate: migrateBareVehicleToV1_0_0 },
  { from: PROJECT_SCHEMA_V1_0_0, to: PROJECT_SCHEMA_V1_1_0, migrate: migrateV1_0_0ToV1_1_0 },
  { from: PROJECT_SCHEMA_V1_1_0, to: PROJECT_SCHEMA_V1_2_0, migrate: migrateV1_1_0ToV1_2_0 },
  { from: PROJECT_SCHEMA_V1_2_0, to: PROJECT_SCHEMA_V1_3_0, migrate: migrateV1_2_0ToV1_3_0 },
  { from: PROJECT_SCHEMA_V1_3_0, to: PROJECT_SCHEMA_V1_4_0, migrate: migrateV1_3_0ToV1_4_0 },
  { from: PROJECT_SCHEMA_V1_4_0, to: PROJECT_SCHEMA_V1_5_0, migrate: migrateV1_4_0ToV1_5_0 },
  { from: PROJECT_SCHEMA_V1_5_0, to: PROJECT_SCHEMA_V1_6_0, migrate: migrateV1_5_0ToV1_6_0 },
  { from: PROJECT_SCHEMA_V1_6_0, to: PROJECT_SCHEMA_V1_7_0, migrate: migrateV1_6_0ToV1_7_0 },
  { from: PROJECT_SCHEMA_V1_7_0, to: PROJECT_SCHEMA_V1_8_0, migrate: migrateV1_7_0ToV1_8_0 },
  { from: PROJECT_SCHEMA_V1_8_0, to: PROJECT_SCHEMA_V1_9_0, migrate: migrateV1_8_0ToV1_9_0 },
  { from: PROJECT_SCHEMA_V1_9_0, to: PROJECT_SCHEMA_V1_10_0, migrate: migrateV1_9_0ToV1_10_0 },
  { from: PROJECT_SCHEMA_V1_10_0, to: PROJECT_SCHEMA_V1_11_0, migrate: migrateV1_10_0ToV1_11_0 },
  { from: PROJECT_SCHEMA_V1_11_0, to: PROJECT_SCHEMA_V1_12_0, migrate: migrateV1_11_0ToV1_12_0 },
  { from: PROJECT_SCHEMA_V1_12_0, to: PROJECT_SCHEMA_VERSION, migrate: migrateV1_12_0ToV1_13_0 },
];

const MAX_MIGRATION_HOPS = 16;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function migrateToCurrent(doc: unknown): unknown {
  let current = doc;
  let version: string | null;
  if (isRecord(doc) && typeof doc.schemaVersion === 'string') {
    version = doc.schemaVersion;
  } else if (isRecord(doc) && Array.isArray(doc.components)) {
    version = null; // legacy bare vehicle
  } else {
    throw new InvalidProjectError(
      'document is neither a versioned project envelope nor a legacy bare vehicle',
    );
  }
  const cases = isRecord(doc) && Array.isArray(doc.cases) ? doc.cases.filter(isRecord) : [];
  const momentHistoryVersions: ReadonlyArray<string> = [PROJECT_SCHEMA_V1_8_0, PROJECT_SCHEMA_V1_9_0, PROJECT_SCHEMA_V1_10_0, PROJECT_SCHEMA_V1_11_0, PROJECT_SCHEMA_V1_12_0, PROJECT_SCHEMA_VERSION];
  if (!momentHistoryVersions.includes(String(version))
    && cases.some((entry) => Object.hasOwn(entry, 'momentArmHistory')
      || (isRecord(entry.inputs) && Object.hasOwn(entry.inputs, 'reportMomentArmHistory')))) {
    throw new InvalidProjectError('older project schema cannot declare new momentArmHistory/reportMomentArmHistory fields');
  }
  const eventVersions: ReadonlyArray<string> = [PROJECT_SCHEMA_V1_9_0, PROJECT_SCHEMA_V1_10_0, PROJECT_SCHEMA_V1_11_0, PROJECT_SCHEMA_V1_12_0, PROJECT_SCHEMA_VERSION];
  if (!eventVersions.includes(String(version)) && cases.some((entry) => Object.hasOwn(entry, 'events'))) {
    throw new InvalidProjectError(`schema version '${String(version)}' cannot declare case events (introduced in ${PROJECT_SCHEMA_V1_9_0})`);
  }
  const telemetryVersions: ReadonlyArray<string> = [PROJECT_SCHEMA_V1_10_0, PROJECT_SCHEMA_V1_11_0, PROJECT_SCHEMA_V1_12_0, PROJECT_SCHEMA_VERSION];
  if (!telemetryVersions.includes(String(version)) && cases.some((entry) => Object.hasOwn(entry, 'telemetry'))) {
    throw new InvalidProjectError(`schema version '${String(version)}' cannot declare case telemetry (introduced in ${PROJECT_SCHEMA_V1_10_0})`);
  }
  const flightOutputVersions: ReadonlyArray<string> = [PROJECT_SCHEMA_V1_11_0, PROJECT_SCHEMA_V1_12_0, PROJECT_SCHEMA_VERSION];
  if (!flightOutputVersions.includes(String(version)) && cases.some((entry) => Object.hasOwn(entry, 'flightOutputs'))) {
    throw new InvalidProjectError(`schema version '${String(version)}' cannot declare case flightOutputs (introduced in ${PROJECT_SCHEMA_V1_11_0})`);
  }
  const candidateVersions: ReadonlyArray<string> = [PROJECT_SCHEMA_V1_12_0, PROJECT_SCHEMA_VERSION];
  if (!candidateVersions.includes(String(version)) && isRecord(doc)
    && isRecord(doc.flightModel) && doc.flightModel.schemaId === CANDIDATE_FLIGHT_MODEL.schemaId) {
    throw new InvalidProjectError(`schema version '${String(version)}' cannot declare an explicit candidate selection (introduced in ${PROJECT_SCHEMA_V1_12_0})`);
  }
  if (!candidateVersions.includes(String(version)) && cases.some((entry) => Object.hasOwn(entry, 'candidateResult')
    || (isRecord(entry.inputs) && entry.inputs.version === 3))) {
    throw new InvalidProjectError(`schema version '${String(version)}' cannot declare candidate case inputs/results (introduced in ${PROJECT_SCHEMA_V1_12_0})`);
  }
  const aeroModelVersions: ReadonlyArray<string> = [PROJECT_SCHEMA_VERSION];
  // A bare legacy vehicle may carry a since-removed field of this name; only
  // versioned envelopes are held to the selection rule.
  if (version !== null && !aeroModelVersions.includes(String(version)) && (isRecord(doc) && Object.hasOwn(doc, 'aeroModel')
    || cases.some((entry) => isRecord(entry.inputs) && Object.hasOwn(entry.inputs, 'aeroModel')))) {
    throw new InvalidProjectError(`schema version '${String(version)}' cannot declare an aero-model selection (introduced in ${PROJECT_SCHEMA_VERSION})`);
  }
  let hops = 0;
  while (version !== PROJECT_SCHEMA_VERSION) {
    const step = MIGRATION_CHAIN.find((s) => (s.from === version));
    if (!step) {
      throw new InvalidProjectError(
        `schema version '${String(version)}' has no migration to '${PROJECT_SCHEMA_VERSION}' — unknown or newer format fails closed`,
      );
    }
    current = step.migrate(current);
    version = step.to;
    hops += 1;
    if (hops > MAX_MIGRATION_HOPS) {
      throw new InvalidProjectError('migration chain exceeds hop limit — cyclic migration');
    }
  }
  return current;
}

/**
 * v0 -> v1: wrap a bare RocketVehicle in the envelope. The vehicle is
 * preserved verbatim; motor metadata is reconstructed ONLY from the bundled
 * certified library (the only authoritative source the legacy format can
 * reference). A legacy `assignedMotorId` that names a cert record becomes a
 * motorRecord with certified provenance plus a mount binding per component;
 * an unresolvable id (typically a custom motor whose curve the bare format
 * never stored) keeps the vehicle reference untouched and creates no record
 * and no binding — nothing is fabricated.
 */
function migrateBareVehicleToV1_0_0(doc: unknown): V1_0_0Envelope {
  return { schemaVersion: PROJECT_SCHEMA_V1_0_0, ...assembleBase({ vehicle: validateVehicle(doc) }) };
}

/** The 1.0.0 envelope shape: everything except workspace and ledger. */
type V1_0_0Envelope = Omit<ProjectEnvelope, 'workspace' | 'ledger' | 'mission' | 'finShearModulusPa' | 'dragCalibration' | 'aeroModel'>;

/**
 * v1.0.0 -> v1.1.0: attach the workspace settings and evidence ledger. A 1.0.0
 * document has no launcher, site, ensemble, aero-limit, recovery, or ledger
 * fields, so both land as documented defaults: the default workspace with the
 * migrated motor reference kept, and an empty ledger. Nothing is backfilled
 * from cases or snapshots; stale results re-derive on load. The vehicle is
 * carried through untouched and validated by `validateProject` afterwards —
 * main-era and reverse-era vehicles both survive; fields the current engine
 * does not carry are dropped by the validator.
 */
function migrateV1_0_0ToV1_1_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) {
    throw new InvalidProjectError('v1.0.0 document must be an object with a vehicle');
  }
  const workspace = structuredClone(DEFAULT_WORKSPACE);
  const components = Array.isArray(doc.vehicle.components) ? doc.vehicle.components : [];
  const assigned = components
    .map((c) => (isRecord(c) ? c.assignedMotorId : undefined))
    .find((id): id is string => typeof id === 'string' && id.length > 0);
  if (assigned !== undefined) workspace.motorId = normalizeMotorId(assigned);
  return {
    ...doc,
    schemaVersion: PROJECT_SCHEMA_V1_1_0,
    workspace,
    ledger: [],
  } as unknown as ProjectEnvelope;
}

/**
 * v1.1.0 -> v1.2.0: the nose-station rename this bump originally carried is
 * gone with the native-geometry import path, so nothing is renamed now; the
 * document is carried through untouched and validated afterwards.
 */
function migrateV1_1_0ToV1_2_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) {
    throw new InvalidProjectError('v1.1.0 document must be an object with a vehicle');
  }
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_2_0 } as unknown as ProjectEnvelope;
}

/**
 * v1.2.0 -> v1.3.0: attach the mission. Older documents never stored the
 * mission name, site label or target apogee (they were session-only), so
 * they get the documented default mission; nothing is guessed from the
 * vehicle. The fin shear override stays absent.
 */
function migrateV1_2_0ToV1_3_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) {
    throw new InvalidProjectError('v1.2.0 document must be an object with a vehicle');
  }
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_3_0, mission: { ...DEFAULT_MISSION } } as unknown as ProjectEnvelope;
}

/**
 * v1.3.0 -> v1.4.0: the drag calibration slot. Older documents never held one,
 * so none is created: every run keeps the model's own drag, exactly as before.
 */
function migrateV1_3_0ToV1_4_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) {
    throw new InvalidProjectError('v1.3.0 document must be an object with a vehicle');
  }
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_4_0 } as unknown as ProjectEnvelope;
}

/**
 * v1.4.0 -> v1.5.0: adds the `freeformfinset` component type. No older
 * document can hold one, so nothing is rewritten; only the version moves.
 */
function migrateV1_4_0ToV1_5_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) {
    throw new InvalidProjectError('v1.4.0 document must be an object with a vehicle');
  }
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_5_0 } as unknown as ProjectEnvelope;
}

/** Old summaries contain no reliable earlier inputs. Leave that information absent. */
function migrateV1_5_0ToV1_6_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) throw new InvalidProjectError('v1.5.0 document must be an object with a vehicle');
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_6_0 } as unknown as ProjectEnvelope;
}

/** Preserve original archives/results; absent model selection remains legacy. */
function migrateV1_6_0ToV1_7_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) throw new InvalidProjectError('v1.6.0 document must be an object with a vehicle');
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_7_0 } as unknown as ProjectEnvelope;
}

/** Preserve missing history/request as missing, never reconstruct old results. */
function migrateV1_7_0ToV1_8_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) throw new InvalidProjectError('v1.7.0 document must be an object with a vehicle');
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_8_0 } as unknown as ProjectEnvelope;
}

/** Old cases keep absent events; a timeline is never rebuilt from summaries. */
function migrateV1_8_0ToV1_9_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) throw new InvalidProjectError('v1.8.0 document must be an object with a vehicle');
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_9_0 } as unknown as ProjectEnvelope;
}

/** Identity-only: old cases keep telemetry absent and remain unreconstructable. */
function migrateV1_9_0ToV1_10_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) throw new InvalidProjectError('v1.9.0 document must be an object with a vehicle');
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_10_0 } as unknown as ProjectEnvelope;
}

/** Identity-only: old cases keep canonical outputs absent; no qualification is reconstructed. */
function migrateV1_10_0ToV1_11_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) throw new InvalidProjectError('v1.10.0 document must be an object with a vehicle');
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_11_0 } as unknown as ProjectEnvelope;
}

/** Identity-only: candidate fields are not backfilled into old documents. */
function migrateV1_11_0ToV1_12_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) throw new InvalidProjectError('v1.11.0 document must be an object with a vehicle');
  return { ...doc, schemaVersion: PROJECT_SCHEMA_V1_12_0 } as unknown as ProjectEnvelope;
}

/** 1.13.0 adds an optional aero-model selection; nothing to rewrite. */
function migrateV1_12_0ToV1_13_0(doc: unknown): ProjectEnvelope {
  if (!isRecord(doc) || !isRecord(doc.vehicle)) throw new InvalidProjectError('v1.12.0 document must be an object with a vehicle');
  return { ...doc, schemaVersion: PROJECT_SCHEMA_VERSION } as unknown as ProjectEnvelope;
}

/**
 * Assemble the envelope parts every schema version shares: vehicle, motor
 * records, mount bindings, and the simulation/evidence payloads.
 *
 * Motor records and mount bindings are derived from the vehicle's own
 * `assignedMotorId` references, exactly as the legacy migration does: a
 * bundled certified record resolves directly; an id the certified library does
 * not know (typically a session custom motor) is left as a vehicle reference
 * with no record and no binding — nothing is fabricated. Callers that DO hold
 * the motor spec (e.g. the store's custom-motor registry) pass it in
 * `motorRecords`; supplied records win over derived certified ones on id
 * collision, so an import's provenance is never silently relabeled.
 *
 * The result is validated through `writeProject` on serialize; this function
 * itself only assembles. Throws InvalidProjectError for a structurally invalid
 * vehicle, same as the reader.
 */
function assembleBase(seed: {
  vehicle: RocketVehicle;
  motorRecords?: ReadonlyArray<MotorRecord>;
  cases?: ReadonlyArray<SimCase>;
  snapshots?: ReadonlyArray<ProjectSnapshot>;
  evidenceRefs?: ReadonlyArray<EvidenceRef>;
  revision?: number;
}): Omit<V1_0_0Envelope, 'schemaVersion'> {
  const vehicle = validateVehicle(seed.vehicle);
  const motorRecords: MotorRecord[] = [];
  const byId = new Map<string, MotorRecord>();
  for (const rec of seed.motorRecords ?? []) {
    const id = normalizeMotorId(rec.id);
    if (byId.has(id)) continue; // first occurrence wins — caller order is authority
    const normalized: MotorRecord = { ...rec, id };
    byId.set(id, normalized);
    motorRecords.push(normalized);
  }
  const bindings: MotorMountBinding[] = [];
  for (const comp of vehicle.components) {
    const assigned = 'assignedMotorId' in comp ? comp.assignedMotorId : undefined;
    if (typeof assigned !== 'string' || assigned.length === 0) continue;
    const key = normalizeMotorId(assigned);
    if (!byId.has(key)) {
      const certified = CERTIFIED_MOTORS[key];
      if (!certified) continue; // unknown id: no record, no binding — nothing fabricated
      const derived: MotorRecord = { id: key, motor: certified, provenance: { source: 'certified' } };
      byId.set(key, derived);
      motorRecords.push(derived);
    }
    bindings.push({ kind: 'motorMount', vehicleComponentId: comp.id, motorRecordId: key });
  }
  return {
    revision: seed.revision ?? INITIAL_REVISION,
    vehicle,
    motorRecords,
    bindings,
    cases: [...(seed.cases ?? [])],
    snapshots: [...(seed.snapshots ?? [])],
    evidenceRefs: [...(seed.evidenceRefs ?? [])],
  };
}

/**
 * Build a current-schema envelope from live UI state (the S3-lite UI
 * cutover): the shared base plus the workspace settings and evidence ledger,
 * each defaulted when the caller omits it. The result is validated through
 * `writeProject` on serialize; this function itself only assembles.
 */
export function createProjectEnvelope(seed: {
  vehicle: RocketVehicle;
  flightModel?: FlightModelSelection;
  motorRecords?: ReadonlyArray<MotorRecord>;
  cases?: ReadonlyArray<SimCase>;
  snapshots?: ReadonlyArray<ProjectSnapshot>;
  evidenceRefs?: ReadonlyArray<EvidenceRef>;
  workspace?: Workspace;
  mission?: Mission;
  finShearModulusPa?: number;
  dragCalibration?: DragCalibration;
  aeroModel?: AeroModelSelection;
  ledger?: ReadonlyArray<LedgerEntry>;
  revision?: number;
}): ProjectEnvelope {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    flightModel: resolveFlightModel(seed.flightModel),
    ...assembleBase(seed),
    workspace: seed.workspace ?? structuredClone(DEFAULT_WORKSPACE),
    mission: seed.mission ?? { ...DEFAULT_MISSION },
    ...(seed.finShearModulusPa === undefined ? {} : { finShearModulusPa: seed.finShearModulusPa }),
    ...(seed.dragCalibration === undefined ? {} : { dragCalibration: seed.dragCalibration }),
    ...(seed.aeroModel === undefined ? {} : { aeroModel: seed.aeroModel }),
    ledger: [...(seed.ledger ?? [])],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse, migrate, and fail-closed validate a project document. Accepts the
 * current envelope schema or a legacy bare vehicle (migrated in); rejects
 * unknown versions, malformed structure, dangling references, and invalid
 * motor records. Throws InvalidProjectError on any violation.
 */
export function readProject(json: string): ProjectEnvelope {
  if (typeof json !== 'string') throw new InvalidProjectError('expected a JSON string');
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch (err) {
    throw new InvalidProjectError(`unparseable JSON: ${(err as Error).message}`);
  }
  return validateProject(migrateToCurrent(doc));
}

/**
 * Validate + serialize a project envelope (fail-closed on write). The
 * revision is serialized as carried; durable revision stamping is the
 * store's job (save) so the serializer stays a pure function.
 */
export function writeProject(project: ProjectEnvelope): string {
  return stringifyReportJson(validateProject(project));
}

/**
 * Minimal durable backend contract for the revisioned store. Either method
 * may be synchronous (memory, localStorage) or asynchronous (IndexedDB).
 */
export interface ProjectBackend {
  /** Raw stored document, or null when the store is empty. */
  read(): string | null | Promise<string | null>;
  /**
   * Replace the stored document atomically: `next` receives the current text
   * and returns the replacement, or throws to leave the store untouched. An
   * asynchronous backend runs read and write in one transaction, so a commit
   * from another tab can never land between the stale check and the write.
   */
  update(next: (current: string | null) => string): void | Promise<void>;
}

/** In-memory backend for tests and ephemeral sessions. */
export function createMemoryBackend(): ProjectBackend {
  let text: string | null = null;
  return {
    read: () => text,
    update: (next) => {
      text = next(text);
    },
  };
}

/**
 * Revisioned project store (S3-lite): optimistic-concurrency saves over an
 * injectable backend. `save(project, expectedRevision)` checks the stored
 * revision inside the backend's atomic update, rejects with
 * StaleRevisionError when `expectedRevision` no longer matches it, then
 * stamps the next monotonic revision and persists. Corrupt stored bytes throw
 * InvalidProjectError on load/save rather than being silently overwritten.
 */
export interface ProjectStore {
  /** Current document, migrated + validated; null when the backend is empty. */
  load(): Promise<ProjectEnvelope | null>;
  /** Commit an edit derived from `expectedRevision`; stale bases rejected. */
  save(project: ProjectEnvelope, expectedRevision: number): Promise<ProjectEnvelope>;
}

export function createProjectStore(backend: ProjectBackend): ProjectStore {
  return {
    async load() {
      const text = await backend.read();
      return text === null || text === undefined ? null : readProject(text);
    },
    async save(project: ProjectEnvelope, expectedRevision: number): Promise<ProjectEnvelope> {
      let committed: ProjectEnvelope | null = null;
      await backend.update((current) => {
        const stored = current === null || current === undefined ? null : readProject(current);
        const storedRevision = stored === null ? 0 : stored.revision;
        if (expectedRevision !== storedRevision) {
          throw new StaleRevisionError(
            `stale write rejected: base revision ${expectedRevision} does not match stored revision ${storedRevision}`,
            expectedRevision,
            storedRevision,
          );
        }
        validateProject(project);
        committed = { ...project, revision: storedRevision + 1 };
        return writeProject(committed);
      });
      if (committed === null) throw new Error('project store: the backend did not run the update');
      return committed;
    },
  };
}

// ---------------------------------------------------------------------------
// Fail-closed validation
// ---------------------------------------------------------------------------

const COMPONENT_TYPES: ReadonlyArray<ComponentType> = [
  'nosecone',
  'bodytube',
  'transition',
  'trapezoidfinset',
  'ellipticalfinset',
  'freeformfinset',
  'masscomponent',
  'parachute',
];

const NOSECONE_SHAPES: ReadonlyArray<NoseconeShape> = [
  'conical',
  'ogive',
  'parabolic',
  'vonkarman',
  'elliptical',
];

const FIN_CROSS_SECTIONS: ReadonlyArray<FinCrossSection> = [
  'square',
  'rounded',
  'double_wedge',
  'airfoil',
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidProjectError(`${what} must be a non-empty string`);
  }
  return value;
}

function requireFinite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidProjectError(`${what} must be a finite number`);
  }
  return value;
}

function requirePositive(value: unknown, what: string): number {
  const n = requireFinite(value, what);
  if (!(n > 0)) throw new InvalidProjectError(`${what} must be positive (got ${n})`);
  return n;
}

function requireNonNegative(value: unknown, what: string): number {
  const n = requireFinite(value, what);
  if (n < 0) throw new InvalidProjectError(`${what} must be non-negative (got ${n})`);
  return n;
}

function requireBoolean(value: unknown, what: string): boolean {
  if (typeof value !== 'boolean') throw new InvalidProjectError(`${what} must be a boolean`);
  return value;
}

function requireIntegerAtLeastOne(value: unknown, what: string): number {
  const n = requireFinite(value, what);
  if (!Number.isInteger(n) || n < 1) {
    throw new InvalidProjectError(`${what} must be a positive integer`);
  }
  return n;
}

function requireIso(value: unknown, what: string): string {
  const s = requireString(value, what);
  if (!ISO_RE.test(s) || !Number.isFinite(Date.parse(s))) {
    throw new InvalidProjectError(`${what} must be an ISO-8601 timestamp (got '${s}')`);
  }
  return s;
}

function requireSha256(value: unknown, what: string): string {
  const s = requireString(value, what);
  if (!/^[0-9a-f]{64}$/i.test(s)) {
    throw new InvalidProjectError(`${what} must be a sha256 hex digest (got '${s}')`);
  }
  return s;
}

function requireOneOf<T extends string>(value: unknown, allowed: ReadonlyArray<T>, what: string): T {
  if (typeof value !== 'string' || !(allowed as ReadonlyArray<string>).includes(value)) {
    throw new InvalidProjectError(
      `${what} must be one of ${allowed.join(', ')} (got '${String(value)}')`,
    );
  }
  return value as T;
}

function verifyUniqueIds(values: ReadonlyArray<{ id: string }>, what: string): void {
  const ids = new Set<string>();
  for (const rec of values) {
    if (ids.has(rec.id)) throw new InvalidProjectError(`duplicate ${what} id '${rec.id}'`);
    ids.add(rec.id);
  }
}

/** Structural + per-type numeric validation of a RocketVehicle (fail-closed). */
function validateVehicle(value: unknown): RocketVehicle {
  if (!isRecord(value)) throw new InvalidProjectError('vehicle must be an object');
  // Bare-vehicle migration normalizes away unknown fields. Never let a
  // selection-bearing bare or nested vehicle silently become legacy.
  if (Object.prototype.hasOwnProperty.call(value, 'flightModel')) {
    throw new InvalidProjectError('flightModel belongs on a versioned project envelope, not a bare or nested vehicle; no legacy fallback');
  }
  if (Object.hasOwn(value, 'momentArmHistory') || Object.hasOwn(value, 'reportMomentArmHistory')) {
    throw new InvalidProjectError('momentArmHistory/reportMomentArmHistory cannot be declared on a bare or nested vehicle');
  }
  if (!Array.isArray(value.components) || value.components.length === 0) {
    throw new InvalidProjectError('vehicle.components must be a non-empty array');
  }
  const vehicle: RocketVehicle = {
    id: requireString(value.id, 'vehicle.id'),
    name: requireString(value.name, 'vehicle.name'),
    version: requireString(value.version, 'vehicle.version'),
    author: requireString(value.author, 'vehicle.author'),
    components: value.components.map((comp, i) => validateComponent(comp, i)),
  };
  if (value.notes !== undefined) {
    if (typeof value.notes !== 'string') {
      throw new InvalidProjectError('vehicle.notes must be a string when present');
    }
    vehicle.notes = value.notes;
  }
  if (value.launchSite !== undefined) {
    vehicle.launchSite = validateLaunchSite(value.launchSite);
  }
  if (value.surfaceFinish !== undefined) {
    vehicle.surfaceFinish = requireOneOf(
      value.surfaceFinish,
      SURFACE_FINISH_NAMES,
      'vehicle.surfaceFinish',
    );
  }
  if (value.forceTurbulentFlow !== undefined) {
    vehicle.forceTurbulentFlow = requireBoolean(
      value.forceTurbulentFlow,
      'vehicle.forceTurbulentFlow',
    );
  }
  if (value.nozzleExitDiameter !== undefined) {
    vehicle.nozzleExitDiameter = requireNonNegative(
      value.nozzleExitDiameter,
      'vehicle.nozzleExitDiameter',
    );
  }
  verifyUniqueIds(vehicle.components, 'component');
  return vehicle;
}

/**
 * Launch-site validation (W15): finite altitude (m ASL, may be below sea
 * level). Any structural violation fails closed like every other vehicle
 * field; absent stays absent.
 */
function validateLaunchSite(value: unknown): RocketVehicle['launchSite'] {
  if (!isRecord(value)) throw new InvalidProjectError('vehicle.launchSite must be an object');
  return {
    altitudeM: requireFinite(value.altitudeM, 'vehicle.launchSite.altitudeM'),
  };
}

function validateComponent(value: unknown, index: number): RocketComponent {
  if (!isRecord(value)) throw new InvalidProjectError(`vehicle.components[${index}] must be an object`);
  const comp = value;
  const id = requireString(comp.id, `component[${index}].id`);
  const type = requireOneOf(comp.type, COMPONENT_TYPES, `component[${index}].type`);
  const common: Record<string, unknown> = {
    id,
    name: requireString(comp.name, `component[${index}].name`),
    type,
    materialId: requireString(comp.materialId, `component[${index}].materialId`),
  };
  if (comp.massOverride !== undefined) {
    common.massOverride = requireFinite(comp.massOverride, `${id}.massOverride`);
  }
  if (comp.cgOverride !== undefined) {
    common.cgOverride = requireFinite(comp.cgOverride, `${id}.cgOverride`);
  }
  if (comp.color !== undefined) {
    if (typeof comp.color !== 'string') {
      throw new InvalidProjectError(`${id}.color must be a string when present`);
    }
    common.color = comp.color;
  }
  if (comp.comment !== undefined) {
    if (typeof comp.comment !== 'string') {
      throw new InvalidProjectError(`${id}.comment must be a string when present`);
    }
    common.comment = comp.comment;
  }
  return { ...common, ...validateComponentGeometry(type, comp, id) } as unknown as RocketComponent;
}

/** Per-type required geometry: every field the physics engine consumes. */
function validateComponentGeometry(
  type: ComponentType,
  comp: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const ctx = `component '${id}'`;
  switch (type) {
    case 'nosecone':
      if (typeof comp.isHollow !== 'boolean') {
        throw new InvalidProjectError(`${ctx}.isHollow must be a boolean`);
      }
      return {
        shape: requireOneOf(comp.shape, NOSECONE_SHAPES, `${ctx}.shape`),
        length: requirePositive(comp.length, `${ctx}.length`),
        baseDiameter: requirePositive(comp.baseDiameter, `${ctx}.baseDiameter`),
        wallThickness: requirePositive(comp.wallThickness, `${ctx}.wallThickness`),
        isHollow: comp.isHollow,
      };
    case 'bodytube':
      return {
        length: requirePositive(comp.length, `${ctx}.length`),
        outerDiameter: requirePositive(comp.outerDiameter, `${ctx}.outerDiameter`),
        innerDiameter: requirePositive(comp.innerDiameter, `${ctx}.innerDiameter`),
        ...(comp.isMotorMount !== undefined
          ? { isMotorMount: requireBoolean(comp.isMotorMount, `${ctx}.isMotorMount`) }
          : {}),
        ...(comp.assignedMotorId !== undefined
          ? { assignedMotorId: requireString(comp.assignedMotorId, `${ctx}.assignedMotorId`) }
          : {}),
        ...(comp.railGuideDiameter !== undefined
          ? {
              railGuideDiameter: requireNonNegative(
                comp.railGuideDiameter,
                `${ctx}.railGuideDiameter`,
              ),
            }
          : {}),
        ...(comp.railGuideHeight !== undefined
          ? {
              railGuideHeight: requireNonNegative(
                comp.railGuideHeight,
                `${ctx}.railGuideHeight`,
              ),
            }
          : {}),
        ...(comp.launchLugDiameter !== undefined
          ? {
              launchLugDiameter: requireNonNegative(
                comp.launchLugDiameter,
                `${ctx}.launchLugDiameter`,
              ),
            }
          : {}),
        ...(comp.launchShoeArea !== undefined
          ? { launchShoeArea: requireNonNegative(comp.launchShoeArea, `${ctx}.launchShoeArea`) }
          : {}),
      };
    case 'transition':
      if (typeof comp.isHollow !== 'boolean') {
        throw new InvalidProjectError(`${ctx}.isHollow must be a boolean`);
      }
      return {
        length: requirePositive(comp.length, `${ctx}.length`),
        foreDiameter: requirePositive(comp.foreDiameter, `${ctx}.foreDiameter`),
        aftDiameter: requirePositive(comp.aftDiameter, `${ctx}.aftDiameter`),
        wallThickness: requirePositive(comp.wallThickness, `${ctx}.wallThickness`),
        isHollow: comp.isHollow,
      };
    case 'trapezoidfinset':
      return {
        finCount: requireIntegerAtLeastOne(comp.finCount, `${ctx}.finCount`),
        rootChord: requirePositive(comp.rootChord, `${ctx}.rootChord`),
        // A zero tip chord is a valid triangular fin, not missing geometry.
        tipChord: requireNonNegative(comp.tipChord, `${ctx}.tipChord`),
        span: requirePositive(comp.span, `${ctx}.span`),
        // Unswept and forward-swept fins have zero and negative sweep.
        sweepLength: requireFinite(comp.sweepLength, `${ctx}.sweepLength`),
        thickness: requirePositive(comp.thickness, `${ctx}.thickness`),
        crossSection: requireOneOf(comp.crossSection, FIN_CROSS_SECTIONS, `${ctx}.crossSection`),
        axialOffset: requireFinite(comp.axialOffset, `${ctx}.axialOffset`),
        ...(comp.airfoilSection !== undefined
          ? {
              airfoilSection: requireOneOf(
                comp.airfoilSection,
                AIRFOIL_SECTION_NAMES,
                `${ctx}.airfoilSection`,
              ),
            }
          : {}),
        ...(comp.leadingEdgeBevel !== undefined
          ? {
              leadingEdgeBevel: requireNonNegative(
                comp.leadingEdgeBevel,
                `${ctx}.leadingEdgeBevel`,
              ),
            }
          : {}),
        ...(comp.trailingEdgeBevel !== undefined
          ? {
              trailingEdgeBevel: requireNonNegative(
                comp.trailingEdgeBevel,
                `${ctx}.trailingEdgeBevel`,
              ),
            }
          : {}),
        ...(comp.leadingEdgeRadius !== undefined
          ? {
              leadingEdgeRadius: requireNonNegative(
                comp.leadingEdgeRadius,
                `${ctx}.leadingEdgeRadius`,
              ),
            }
          : {}),
      };
    case 'ellipticalfinset':
      return {
        finCount: requireIntegerAtLeastOne(comp.finCount, `${ctx}.finCount`),
        rootChord: requirePositive(comp.rootChord, `${ctx}.rootChord`),
        span: requirePositive(comp.span, `${ctx}.span`),
        thickness: requirePositive(comp.thickness, `${ctx}.thickness`),
        axialOffset: requireNonNegative(comp.axialOffset, `${ctx}.axialOffset`),
      };
    case 'freeformfinset':
      return {
        finCount: requireIntegerAtLeastOne(comp.finCount, `${ctx}.finCount`),
        points: requireFinPoints(comp.points, `${ctx}.points`),
        thickness: requirePositive(comp.thickness, `${ctx}.thickness`),
        crossSection: requireOneOf(comp.crossSection, FIN_CROSS_SECTIONS, `${ctx}.crossSection`),
        axialOffset: requireFinite(comp.axialOffset, `${ctx}.axialOffset`),
      };
    case 'masscomponent':
      return {
        mass: requireNonNegative(comp.mass, `${ctx}.mass`),
        length: requireNonNegative(comp.length, `${ctx}.length`),
        axialOffset: requireNonNegative(comp.axialOffset, `${ctx}.axialOffset`),
        ...(comp.widthM !== undefined
          ? { widthM: requirePositive(comp.widthM, `${ctx}.widthM`) }
          : {}),
        ...(comp.heightM !== undefined
          ? { heightM: requirePositive(comp.heightM, `${ctx}.heightM`) }
          : {}),
      };
    case 'parachute':
      return {
        diameter: requirePositive(comp.diameter, `${ctx}.diameter`),
        cd: requirePositive(comp.cd, `${ctx}.cd`),
        mass: requireNonNegative(comp.mass, `${ctx}.mass`),
        axialOffset: requireNonNegative(comp.axialOffset, `${ctx}.axialOffset`),
        ...(comp.packedLengthM !== undefined
          ? { packedLengthM: requirePositive(comp.packedLengthM, `${ctx}.packedLengthM`) }
          : {}),
        ...(comp.packedDiameterM !== undefined
          ? { packedDiameterM: requirePositive(comp.packedDiameterM, `${ctx}.packedDiameterM`) }
          : {}),
      };
  }
}

/** A freeform planform: structurally valid points, geometrically validated by the fin model. */
function requireFinPoints(value: unknown, ctx: string): FinPoint[] {
  if (!Array.isArray(value) || value.length < 3) {
    throw new InvalidProjectError(`${ctx} must be an array of at least 3 {x, y} points`);
  }
  const points = value.map((p, i) => {
    if (!isRecord(p)) throw new InvalidProjectError(`${ctx}[${i}] must be an {x, y} object`);
    return { x: requireFinite(p.x, `${ctx}[${i}].x`), y: requireFinite(p.y, `${ctx}[${i}].y`) };
  });
  try {
    validateFreeformPoints(points);
  } catch (e) {
    throw new InvalidProjectError(`${ctx}: ${(e as Error).message.replace(/^vehicle geometry: /, '')}`);
  }
  return points;
}

const MOTOR_SOURCES: ReadonlyArray<MotorSource> = ['certified', 'import', 'derived'];

function validateMotorRecords(value: unknown): MotorRecord[] {
  if (!Array.isArray(value)) throw new InvalidProjectError('motorRecords must be an array');
  return value.map((raw, i) => validateMotorRecord(raw, i));
}

function validateMotorRecord(raw: unknown, index: number): MotorRecord {
  if (!isRecord(raw)) throw new InvalidProjectError(`motorRecords[${index}] must be an object`);
  const id = requireString(raw.id, `motorRecords[${index}].id`);
  const motorRaw = raw.motor;
  if (!isRecord(motorRaw)) {
    throw new InvalidProjectError(`motorRecords[${index}].motor must be an object`);
  }
  const motor = motorRaw as unknown as MotorSpec; // shape enforced by validateMotorSpec below
  try {
    validateMotorSpec(motor);
  } catch (err) {
    throw new InvalidProjectError(
      `motorRecords[${index}] (id '${id}') fails motor validation: ${(err as Error).message}`,
    );
  }
  const provRaw = raw.provenance;
  if (!isRecord(provRaw)) {
    throw new InvalidProjectError(`motorRecords[${index}].provenance must be an object`);
  }
  const provenance: MotorProvenance = {
    source: requireOneOf(provRaw.source, MOTOR_SOURCES, `motorRecords[${index}].provenance.source`),
  };
  if (provRaw.sourceFile !== undefined) {
    provenance.sourceFile = requireString(provRaw.sourceFile, `motorRecords[${index}].provenance.sourceFile`);
  }
  if (provRaw.sourceSha256 !== undefined) {
    provenance.sourceSha256 = requireSha256(provRaw.sourceSha256, `motorRecords[${index}].provenance.sourceSha256`);
  }
  if (provRaw.importedAt !== undefined) {
    provenance.importedAt = requireIso(provRaw.importedAt, `motorRecords[${index}].provenance.importedAt`);
  }
  if (provRaw.note !== undefined) {
    if (typeof provRaw.note !== 'string') {
      throw new InvalidProjectError(`motorRecords[${index}].provenance.note must be a string`);
    }
    provenance.note = provRaw.note;
  }
  return { id, motor, provenance };
}

function validateBindings(
  value: unknown,
  recordIds: ReadonlySet<string>,
  componentIds: ReadonlySet<string>,
): MotorMountBinding[] {
  if (!Array.isArray(value)) throw new InvalidProjectError('bindings must be an array');
  return value.map((raw, i) => {
    if (!isRecord(raw)) throw new InvalidProjectError(`bindings[${i}] must be an object`);
    const kind = requireOneOf(raw.kind, ['motorMount'] as const, `bindings[${i}].kind`);
    const vehicleComponentId = requireString(raw.vehicleComponentId, `bindings[${i}].vehicleComponentId`);
    const motorRecordId = requireString(raw.motorRecordId, `bindings[${i}].motorRecordId`);
    if (!componentIds.has(vehicleComponentId)) {
      throw new InvalidProjectError(
        `bindings[${i}] references unknown vehicle component '${vehicleComponentId}'`,
      );
    }
    if (!recordIds.has(motorRecordId)) {
      throw new InvalidProjectError(
        `bindings[${i}] references unknown motor record '${motorRecordId}' — dangling binding fails closed`,
      );
    }
    return { kind, vehicleComponentId, motorRecordId };
  });
}

function validateCases(
  value: unknown,
  recordIds: ReadonlySet<string>,
  snapshotIds: ReadonlySet<string>,
): SimCase[] {
  if (!Array.isArray(value)) throw new InvalidProjectError('cases must be an array');
  return value.map((raw, i) => {
    if (!isRecord(raw)) throw new InvalidProjectError(`cases[${i}] must be an object`);
    if (Object.hasOwn(raw, 'reportMomentArmHistory')) throw new InvalidProjectError('reportMomentArmHistory belongs in archived case inputs');
    const id = requireString(raw.id, `cases[${i}].id`);
    const motorRecordId = requireString(raw.motorRecordId, `cases[${i}].motorRecordId`);
    if (!recordIds.has(motorRecordId)) {
      throw new InvalidProjectError(`cases[${i}] references unknown motor record '${motorRecordId}'`);
    }
    const out: SimCase = {
      id,
      kind: requireOneOf(raw.kind, ['flight', 'monteCarlo'] as const, `cases[${i}].kind`),
      createdAt: requireIso(raw.createdAt, `cases[${i}].createdAt`),
      motorRecordId,
    };
    if (raw.inputs !== undefined) {
      out.inputs = validateRunInputs(raw.inputs);
      const legacy = out.inputs.version === 3 ? null : out.inputs;
      if (legacy !== null && (out.kind === 'monteCarlo') !== (legacy.ensemble !== undefined)) throw new InvalidProjectError(`cases[${i}] ensemble inputs disagree with case kind`);
      if (out.inputs.version === 3 && out.kind !== 'flight') throw new InvalidProjectError(`cases[${i}] candidate inputs are flight-only`);
      if (isRecord(raw.summary) && raw.summary.inputKey !== undefined && raw.summary.inputKey !== out.inputs.inputKey) throw new InvalidProjectError(`cases[${i}] input key disagrees with its archive`);
    }
    const legacyInputs = out.inputs !== undefined && out.inputs.version !== 3 ? out.inputs : null;
    const version2Inputs = legacyInputs?.version === 2 ? legacyInputs : null;
    const candidateInputs = out.inputs !== undefined && out.inputs.version === 3 ? out.inputs : null;
    if (raw.engineIdentity !== undefined) {
      try { out.engineIdentity = parseEngineIdentity(raw.engineIdentity); }
      catch (e) { throw new InvalidProjectError((e as Error).message); }
    }
    if (Object.hasOwn(raw, 'momentArmHistory')) {
      try { out.momentArmHistory = parseMomentArmHistory(raw.momentArmHistory); }
      catch (e) { throw new InvalidProjectError(`cases[${i}] ${(e as Error).message}`); }
      if (out.kind !== 'flight' || version2Inputs === null || version2Inputs.reportMomentArmHistory !== true
        || !out.engineIdentity || version2Inputs.flightModel.modelId !== out.momentArmHistory.modelId) {
        throw new InvalidProjectError(`cases[${i}] momentArmHistory needs matching flight inputs, actual request and recorded engine identity`);
      }
      if (out.momentArmHistory.burnoutTimeS !== out.inputs!.motorRecord.motor.burnTime) {
        throw new InvalidProjectError(`cases[${i}] momentArmHistory burn time disagrees with archived motor`);
      }
      if (isRecord(raw.summary) && typeof raw.summary.flightTimeS === 'number'
        && out.momentArmHistory.timeRangeS[1] > raw.summary.flightTimeS) {
        throw new InvalidProjectError(`cases[${i}] momentArmHistory contains post-stop samples`);
      }
    }
    if (legacyInputs?.reportMomentArmHistory === true && !out.momentArmHistory) {
      throw new InvalidProjectError(`cases[${i}] requested momentArmHistory is missing`);
    }
    if (out.kind !== 'flight' && legacyInputs && Object.hasOwn(legacyInputs, 'reportMomentArmHistory')) {
      throw new InvalidProjectError(`cases[${i}] ensemble cannot request momentArmHistory`);
    }
    if (Object.hasOwn(raw, 'events')) {
      if (out.kind !== 'flight') throw new InvalidProjectError(`cases[${i}] ensemble cannot carry flight events`);
      if (candidateInputs) throw new InvalidProjectError(`cases[${i}] candidate cases carry candidate events, not the legacy event archive`);
      try { out.events = parseSavedFlightEvents(raw.events); }
      catch (e) { throw new InvalidProjectError(`cases[${i}] ${(e as Error).message}`); }
    }
    if (Object.hasOwn(raw, 'telemetry')) {
      if (out.kind !== 'flight') throw new InvalidProjectError(`cases[${i}] ensemble cannot carry flight telemetry`);
      if (candidateInputs) throw new InvalidProjectError(`cases[${i}] candidate cases cannot carry legacy display telemetry`);
      if (!out.inputs || !out.engineIdentity || !isRecord(raw.summary) || raw.summary.inputKey !== out.inputs.inputKey) {
        throw new InvalidProjectError(`cases[${i}] telemetry needs matching archived input key and recorded engine identity`);
      }
      try { out.telemetry = parseSavedTelemetry(raw.telemetry); }
      catch (e) { throw new InvalidProjectError(`cases[${i}] ${(e as Error).message}`); }
    }
    if (Object.hasOwn(raw, 'flightOutputs')) {
      if (out.kind !== 'flight') throw new InvalidProjectError(`cases[${i}] ensemble cannot carry flight outputs`);
      if (candidateInputs) throw new InvalidProjectError(`cases[${i}] candidate cases cannot carry the legacy output dictionary`);
      try { out.flightOutputs = parseSavedFlightOutputs(raw.flightOutputs); }
      catch (e) { throw new InvalidProjectError(`cases[${i}] ${(e as Error).message}`); }
    }
    if (Object.hasOwn(raw, 'candidateResult')) {
      if (out.kind !== 'flight') throw new InvalidProjectError(`cases[${i}] ensemble cannot carry candidate results`);
      if (!candidateInputs) throw new InvalidProjectError(`cases[${i}] candidateResult requires archive version 3 inputs`);
      if (!out.engineIdentity) throw new InvalidProjectError(`cases[${i}] candidateResult requires the executed engine identity`);
      if (out.flightOutputs || out.telemetry || out.events || out.momentArmHistory) {
        throw new InvalidProjectError(`cases[${i}] candidate cases cannot mix legacy result archives`);
      }
      if (!isRecord(raw.summary) || raw.summary.inputKey !== candidateInputs.inputKey) {
        throw new InvalidProjectError(`cases[${i}] candidateResult needs a matching archived input key`);
      }
      try {
        out.candidateResult = parseCandidateResultArchive(raw.candidateResult, {
          request: candidateInputs.candidateRequest,
          selection: candidateInputs.flightModel,
          derivation: candidateInputs.derivation,
        });
      } catch (e) { throw new InvalidProjectError(`cases[${i}] ${(e as Error).message}`); }
    }
    if (candidateInputs && !out.candidateResult) throw new InvalidProjectError(`cases[${i}] candidate inputs require a candidateResult archive`);
    if (raw.weatherSnapshotId !== undefined) {
      const sid = requireString(raw.weatherSnapshotId, `cases[${i}].weatherSnapshotId`);
      if (!snapshotIds.has(sid)) {
        throw new InvalidProjectError(`cases[${i}] references unknown weather snapshot '${sid}'`);
      }
      out.weatherSnapshotId = sid;
    }
    if (raw.summary !== undefined) {
      if (!isRecord(raw.summary)) {
        throw new InvalidProjectError(`cases[${i}].summary must be an object`);
      }
      for (const [key, v] of Object.entries(raw.summary)) {
        const safeScalar =
          typeof v === 'string' ||
          typeof v === 'boolean' ||
          v === null ||
          (typeof v === 'number' && Number.isFinite(v));
        if (!safeScalar) {
          throw new InvalidProjectError(
            `cases[${i}].summary.${key} must be a finite scalar (string/number/boolean/null)`,
          );
        }
      }
      out.summary = raw.summary as SimCase['summary'];
    }
    return out;
  });
}

function validateRunInputs(raw: unknown): RunInputs {
  if (isRecord(raw) && raw.version === 3) return validateCandidateRunInputs(raw);
  if (!isRecord(raw) || (raw.version !== 1 && raw.version !== 2)) throw new InvalidProjectError('case inputs must use archive version 1, 2 or 3');
  let model: { version: 1 } | { version: 2; flightModel: LegacyFlightModelSelection };
  try {
    if (raw.version === 1) {
      if (raw.flightModel !== undefined) throw new Error('archive version1 cannot declare a flightModel selection');
      model = { version: 1 };
    } else {
      model = { version: 2, flightModel: parseLegacyFlightModel(raw.flightModel) };
    }
  } catch (e) { throw new InvalidProjectError((e as Error).message); }
  if (Object.hasOwn(raw, 'reportMomentArmHistory') && (raw.version !== 2 || typeof raw.reportMomentArmHistory !== 'boolean')) {
    throw new InvalidProjectError('reportMomentArmHistory must be an explicit boolean on archive version2 only');
  }
  if (!isRecord(raw.context) || !isRecord(raw.engineOptions)) throw new InvalidProjectError('case inputs need context and engineOptions');
  let workspace: Workspace;
  let mission: Mission;
  let dragCalibration: DragCalibration | undefined;
  let aeroModel: AeroModelSelection | undefined;
  let ensemble: Workspace['ensemble'] | undefined;
  let launch: RunInputs['launch'];
  try {
    workspace = parseWorkspace(raw.context.workspace);
    mission = parseMission(raw.context.mission);
    launch = parseWorkspace({ ...workspace, launch: raw.launch }).launch;
    if (raw.dragCalibration !== undefined) dragCalibration = parseDragCalibration(raw.dragCalibration);
    if (raw.aeroModel !== undefined) aeroModel = parseAeroModelSelection(raw.aeroModel, 'inputs.aeroModel');
    if (raw.ensemble !== undefined) {
      ensemble = parseWorkspace({ ...workspace, ensemble: raw.ensemble }).ensemble;
      if (ensemble.version !== 'per-run-v2') throw new Error('case inputs sampler must be per-run-v2');
    }
  } catch (e) { throw new InvalidProjectError((e as Error).message); }
  const vehicle = validateVehicle(raw.vehicle);
  const options = raw.engineOptions;
  if (Object.hasOwn(raw, 'momentArmHistory') || Object.hasOwn(options, 'reportMomentArmHistory') || Object.hasOwn(options, 'momentArmHistory')) {
    throw new InvalidProjectError('momentArmHistory belongs on the case; reportMomentArmHistory is not a physics option');
  }
  const engineOptions = {
    railLength: requirePositive(options.railLength, 'inputs.engineOptions.railLength'),
    railElevationDeg: requireFinite(options.railElevationDeg, 'inputs.engineOptions.railElevationDeg'),
    railAzimuthDeg: requireFinite(options.railAzimuthDeg, 'inputs.engineOptions.railAzimuthDeg'),
    windSpeedSurface: requireNonNegative(options.windSpeedSurface, 'inputs.engineOptions.windSpeedSurface'),
    windAzimuthDeg: requireFinite(options.windAzimuthDeg, 'inputs.engineOptions.windAzimuthDeg'),
    finCantAngleDeg: requireFinite(options.finCantAngleDeg, 'inputs.engineOptions.finCantAngleDeg'),
    mainDeployAltitudeAGL: requirePositive(options.mainDeployAltitudeAGL, 'inputs.engineOptions.mainDeployAltitudeAGL'),
    launchAltitudeASL: requireFinite(options.launchAltitudeASL, 'inputs.engineOptions.launchAltitudeASL'),
    timeStep: requirePositive(options.timeStep, 'inputs.engineOptions.timeStep'),
    dragCdScale: requirePositive(options.dragCdScale, 'inputs.engineOptions.dragCdScale'),
  };
  const expected = [launch.railLengthM, launch.railElevationDeg, launch.railAzimuthDeg, launch.windSpeedMps, launch.windAzimuthDeg, launch.finCantDeg, launch.mainDeployAltitudeM, vehicle.launchSite?.altitudeM ?? 0, 0.01, dragCalibration?.scale ?? 1];
  if (Object.values(engineOptions).some((value, i) => value !== expected[i])) throw new InvalidProjectError('case inputs engine options disagree with console inputs/defaults');
  const weather = validateSnapshots(raw.context.weather);
  if (weather.some((s) => s.kind !== 'weather')) throw new InvalidProjectError('case input context contains non-weather snapshots');
  verifyUniqueIds(weather, 'case weather snapshot');
  return {
    ...model,
    capturedAt: requireIso(raw.capturedAt, 'inputs.capturedAt'),
    inputKey: requireString(raw.inputKey, 'inputs.inputKey'),
    vehicle, motorRecord: validateMotorRecord(raw.motorRecord, 0), launch, engineOptions,
    ...(Object.hasOwn(raw, 'reportMomentArmHistory') ? { reportMomentArmHistory: raw.reportMomentArmHistory as boolean } : {}),
    weatherModel: requireOneOf(raw.weatherModel, ['surface-power-law-only'] as const, 'inputs.weatherModel'),
    context: { workspace, mission, weather },
    ...(raw.finShearModulusPa === undefined ? {} : { finShearModulusPa: requirePositive(raw.finShearModulusPa, 'inputs.finShearModulusPa') }),
    ...(dragCalibration === undefined ? {} : { dragCalibration }),
    ...(aeroModel === undefined ? {} : { aeroModel }),
    ...(ensemble === undefined ? {} : { ensemble }),
  };
}

function validateCandidateRunInputs(raw: Record<string, unknown>): CandidateRunInputs {
  const keys = ['version', 'flightModel', 'capturedAt', 'inputKey', 'vehicle', 'motorRecord',
    'launch', 'candidateRequest', 'derivation', 'weatherModel', 'context'] as const;
  const expected = [...keys].sort();
  const actual = Object.keys(raw).sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new InvalidProjectError(`candidate inputs must declare exactly ${expected.join(', ')}`);
  }
  if (raw.version !== 3) throw new InvalidProjectError('candidate inputs must use archive version 3');
  let flightModel: CandidateFlightModelSelection;
  let request: CandidateInvocation;
  try {
    flightModel = parseCandidateFlightModel(raw.flightModel);
    request = parseCandidateInvocation(raw.candidateRequest);
  } catch (e) { throw new InvalidProjectError((e as Error).message); }
  const vehicle = validateVehicle(raw.vehicle);
  const motorRecord = validateMotorRecord(raw.motorRecord, 0);
  if (!isRecord(raw.context) || !isRecord(raw.launch)) throw new InvalidProjectError('candidate inputs need context and launch');
  let workspace: Workspace;
  let mission: Mission;
  let launch: RunInputs['launch'];
  try {
    workspace = parseWorkspace(raw.context.workspace);
    mission = parseMission(raw.context.mission);
    launch = parseWorkspace({ ...workspace, launch: raw.launch }).launch;
  } catch (e) { throw new InvalidProjectError((e as Error).message); }
  const weather = validateSnapshots(raw.context.weather);
  if (weather.some((s) => s.kind !== 'weather')) throw new InvalidProjectError('candidate input context contains non-weather snapshots');
  verifyUniqueIds(weather, 'candidate weather snapshot');

  const derivationRaw = isRecord(raw.derivation) ? raw.derivation : null;
  if (derivationRaw === null) throw new InvalidProjectError('candidate inputs need a motor derivation');
  const derivationKeys = ['projectionId', 'source', 'mountComponentId', 'mountStartM', 'mountLengthM', 'totalLengthM', 'motorAftStationFromNoseM'] as const;
  const expectedDerivation = [...derivationKeys].sort();
  const actualDerivation = Object.keys(derivationRaw).sort();
  if (actualDerivation.length !== expectedDerivation.length || actualDerivation.some((key, i) => key !== expectedDerivation[i])) {
    throw new InvalidProjectError(`candidate derivation must declare exactly ${expectedDerivation.join(', ')}`);
  }
  if (derivationRaw.projectionId !== CANDIDATE_FLIGHT_MODEL.projectionId) throw new InvalidProjectError('candidate derivation projection is unsupported');
  if (derivationRaw.source !== 'aggregate_mass') throw new InvalidProjectError('candidate derivation source is unsupported');
  if (derivationRaw.mountComponentId !== null || derivationRaw.mountStartM !== null || derivationRaw.mountLengthM !== null) {
    throw new InvalidProjectError('candidate derivation must use the supported aft-fallback (no flagged mount)');
  }
  const totalLengthM = requirePositive(derivationRaw.totalLengthM, 'inputs.derivation.totalLengthM');
  const motorAftStationFromNoseM = requirePositive(derivationRaw.motorAftStationFromNoseM, 'inputs.derivation.motorAftStationFromNoseM');
  if (motorAftStationFromNoseM !== totalLengthM) throw new InvalidProjectError('candidate aft-fallback station disagrees with total length');
  const derivation: CandidateMotorDerivation = { projectionId: CANDIDATE_FLIGHT_MODEL.projectionId, source: 'aggregate_mass',
    mountComponentId: null, mountStartM: null, mountLengthM: null, totalLengthM, motorAftStationFromNoseM };
  try {
    assertCandidateInvocationConsistent(request, vehicle, motorRecord.motor, flightModel, launch, derivation);
  } catch (e) { throw new InvalidProjectError((e as Error).message); }
  return {
    version: 3,
    flightModel,
    capturedAt: requireIso(raw.capturedAt, 'inputs.capturedAt'),
    inputKey: requireString(raw.inputKey, 'inputs.inputKey'),
    vehicle,
    motorRecord,
    launch,
    candidateRequest: request,
    derivation,
    weatherModel: requireOneOf(raw.weatherModel, ['surface-power-law-only'] as const, 'inputs.weatherModel'),
    context: { workspace, mission, weather },
  };
}

function validateWindLayers(value: unknown): WindLayer[] {
  if (!Array.isArray(value)) {
    throw new InvalidProjectError('weather snapshot data must be an array of wind layers');
  }
  return value.map((raw, i) => {
    if (!isRecord(raw)) throw new InvalidProjectError(`weather layer[${i}] must be an object`);
    return {
      altitudeM: requireFinite(raw.altitudeM, `layer[${i}].altitudeM`),
      speedMs: requireFinite(raw.speedMs, `layer[${i}].speedMs`),
      directionFromDeg: requireFinite(raw.directionFromDeg, `layer[${i}].directionFromDeg`),
      tempC: requireFinite(raw.tempC, `layer[${i}].tempC`),
      pressureHpa: requireFinite(raw.pressureHpa, `layer[${i}].pressureHpa`),
    } as WindLayer;
  });
}

function validateDispersion(value: unknown): DispersionStatistics {
  if (!isRecord(value)) throw new InvalidProjectError('dispersion snapshot data must be an object');
  const mean = isRecord(value.mean) ? value.mean : null;
  const covariance = isRecord(value.covariance) ? value.covariance : null;
  const radii = isRecord(value.containmentRadii) ? value.containmentRadii : null;
  return {
    mean: {
      x: requireFinite(mean?.x, 'dispersion.mean.x'),
      y: requireFinite(mean?.y, 'dispersion.mean.y'),
    },
    covariance: {
      xx: requireFinite(covariance?.xx, 'dispersion.covariance.xx'),
      xy: requireFinite(covariance?.xy, 'dispersion.covariance.xy'),
      yy: requireFinite(covariance?.yy, 'dispersion.covariance.yy'),
    },
    sigma1: requireFinite(value.sigma1, 'dispersion.sigma1'),
    sigma2: requireFinite(value.sigma2, 'dispersion.sigma2'),
    thetaDeg: requireFinite(value.thetaDeg, 'dispersion.thetaDeg'),
    containmentRadii: {
      r50: requireFinite(radii?.r50, 'dispersion.containmentRadii.r50'),
      r90: requireFinite(radii?.r90, 'dispersion.containmentRadii.r90'),
      r99: requireFinite(radii?.r99, 'dispersion.containmentRadii.r99'),
    },
  } as DispersionStatistics;
}

function validateSnapshots(value: unknown): ProjectSnapshot[] {
  if (!Array.isArray(value)) throw new InvalidProjectError('snapshots must be an array');
  return value.map((raw, i) => {
    if (!isRecord(raw)) throw new InvalidProjectError(`snapshots[${i}] must be an object`);
    const kind = requireOneOf(raw.kind, ['weather', 'dispersion'] as const, `snapshots[${i}].kind`);
    return {
      id: requireString(raw.id, `snapshots[${i}].id`),
      kind,
      createdAt: requireIso(raw.createdAt, `snapshots[${i}].createdAt`),
      source: requireString(raw.source, `snapshots[${i}].source`),
      data: kind === 'weather' ? validateWindLayers(raw.data) : validateDispersion(raw.data),
    } as ProjectSnapshot;
  });
}

const EVIDENCE_KINDS: ReadonlyArray<EvidenceKind> = ['altimetry', 'calibration', 'gpsTrack'];

function validateEvidenceRefs(value: unknown): EvidenceRef[] {
  if (!Array.isArray(value)) throw new InvalidProjectError('evidenceRefs must be an array');
  return value.map((raw, i) => {
    if (!isRecord(raw)) throw new InvalidProjectError(`evidenceRefs[${i}] must be an object`);
    const out: EvidenceRef = {
      id: requireString(raw.id, `evidenceRefs[${i}].id`),
      kind: requireOneOf(raw.kind, EVIDENCE_KINDS, `evidenceRefs[${i}].kind`),
      createdAt: requireIso(raw.createdAt, `evidenceRefs[${i}].createdAt`),
    };
    if (raw.checksumSha256 !== undefined) {
      out.checksumSha256 = requireSha256(raw.checksumSha256, `evidenceRefs[${i}].checksumSha256`);
    }
    if (raw.sourceFile !== undefined) {
      out.sourceFile = requireString(raw.sourceFile, `evidenceRefs[${i}].sourceFile`);
    }
    return out;
  });
}

function validateProject(value: unknown): ProjectEnvelope {
  if (!isRecord(value)) throw new InvalidProjectError('project must be an object');
  if (Object.hasOwn(value, 'momentArmHistory') || Object.hasOwn(value, 'reportMomentArmHistory')) {
    throw new InvalidProjectError('momentArmHistory/reportMomentArmHistory belong on a recorded case, not the live project');
  }
  const schemaVersion = requireString(value.schemaVersion, 'schemaVersion');
  if (schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new InvalidProjectError(
      `schemaVersion must be '${PROJECT_SCHEMA_VERSION}' (got '${schemaVersion}')`,
    );
  }
  const revision = requireFinite(value.revision, 'revision');
  if (!Number.isInteger(revision) || revision < 1) {
    throw new InvalidProjectError('revision must be a positive integer');
  }
  const vehicle = validateVehicle(value.vehicle);
  const motorRecords = validateMotorRecords(value.motorRecords);
  verifyUniqueIds(motorRecords, 'motorRecord');
  const recordIds = new Set(motorRecords.map((r) => r.id));
  const snapshots = validateSnapshots(value.snapshots);
  verifyUniqueIds(snapshots, 'snapshot');
  const snapshotIds = new Set(snapshots.map((s) => s.id));
  const bindings = validateBindings(
    value.bindings,
    recordIds,
    new Set(vehicle.components.map((c) => c.id)),
  );
  const mountIds = new Set<string>();
  for (const binding of bindings) {
    if (mountIds.has(binding.vehicleComponentId)) {
      throw new InvalidProjectError(
        `duplicate binding for vehicle component '${binding.vehicleComponentId}' — one motor per mount`,
      );
    }
    mountIds.add(binding.vehicleComponentId);
  }
  const cases = validateCases(value.cases, recordIds, snapshotIds);
  verifyUniqueIds(cases, 'case');
  for (const entry of cases) {
    if (!entry.inputs) continue;
    const pinned = motorRecords.find((record) => record.id === entry.motorRecordId)!;
    if (stableStringify(pinned.motor) !== stableStringify(entry.inputs.motorRecord.motor)
      || stableStringify(pinned.provenance) !== stableStringify(entry.inputs.motorRecord.provenance)) {
      throw new InvalidProjectError(`case '${entry.id}' motor archive disagrees with its pinned record`);
    }
  }
  const evidenceRefs = validateEvidenceRefs(value.evidenceRefs);
  verifyUniqueIds(evidenceRefs, 'evidenceRef');
  let workspace: Workspace;
  let mission: Mission;
  let finShearModulusPa: number | undefined;
  let dragCalibration: DragCalibration | undefined;
  let aeroModel: AeroModelSelection | undefined;
  let ledger: LedgerEntry[];
  let flightModel: FlightModelSelection | undefined;
  try {
    if (value.flightModel !== undefined) flightModel = parseFlightModel(value.flightModel);
    workspace = parseWorkspace(value.workspace);
    mission = parseMission(value.mission);
    if (value.finShearModulusPa !== undefined) {
      const pa = value.finShearModulusPa;
      if (typeof pa !== 'number' || !Number.isFinite(pa) || pa <= 0) {
        throw new Error('finShearModulusPa must be a positive finite number');
      }
      finShearModulusPa = pa;
    }
    if (value.dragCalibration !== undefined) dragCalibration = parseDragCalibration(value.dragCalibration);
    if (value.aeroModel !== undefined) aeroModel = parseAeroModelSelection(value.aeroModel);
    if (!Array.isArray(value.ledger)) throw new Error('ledger must be an array');
    ledger = value.ledger.map((entry) => parseLedgerEntry(entry));
  } catch (err) {
    throw new InvalidProjectError((err as Error).message);
  }
  verifyUniqueIds(ledger, 'ledger');
  return {
    schemaVersion,
    ...(flightModel === undefined ? {} : { flightModel }),
    revision,
    vehicle,
    motorRecords,
    bindings,
    cases,
    snapshots,
    evidenceRefs,
    workspace,
    mission,
    ...(finShearModulusPa === undefined ? {} : { finShearModulusPa }),
    ...(dragCalibration === undefined ? {} : { dragCalibration }),
    ...(aeroModel === undefined ? {} : { aeroModel }),
    ledger,
  };
}
