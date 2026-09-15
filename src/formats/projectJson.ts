/**
 * Astraea Versioned JSON Project Envelope — engine side (adapter matrix rows
 * 1-2, S3-lite storage).
 *
 * The canonical on-disk project format (missing-cell #1 in docs/adapter-matrix.md,
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
} from '../core/types';
import {
  CERTIFIED_MOTORS,
  normalizeMotorId,
  validateMotorSpec,
  type MotorSpec,
} from '../propulsion/motorDatabase';
import type { WindLayer } from '../sim/weather';
import type { DispersionStatistics } from '../sim/monteCarlo';

/** Current project envelope schema version. */
export const PROJECT_SCHEMA_VERSION = '1.0.0';

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
  revision: number;
  vehicle: RocketVehicle;
  motorRecords: MotorRecord[];
  bindings: MotorMountBinding[];
  cases: SimCase[];
  snapshots: ProjectSnapshot[];
  evidenceRefs: EvidenceRef[];
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
}> = [{ from: null, to: PROJECT_SCHEMA_VERSION, migrate: migrateBareVehicleToV1 }];

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
function migrateBareVehicleToV1(doc: unknown): ProjectEnvelope {
  const vehicle = validateVehicle(doc);
  const motorRecords: MotorRecord[] = [];
  const recordsSeen = new Set<string>();
  const bindings: MotorMountBinding[] = [];
  for (const comp of vehicle.components) {
    const assigned = 'assignedMotorId' in comp ? comp.assignedMotorId : undefined;
    if (typeof assigned !== 'string' || assigned.length === 0) continue;
    const key = normalizeMotorId(assigned);
    const certified = CERTIFIED_MOTORS[key];
    if (!certified) continue;
    if (!recordsSeen.has(key)) {
      recordsSeen.add(key);
      motorRecords.push({ id: key, motor: certified, provenance: { source: 'certified' } });
    }
    bindings.push({ kind: 'motorMount', vehicleComponentId: comp.id, motorRecordId: key });
  }
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: INITIAL_REVISION,
    vehicle,
    motorRecords,
    bindings,
    cases: [],
    snapshots: [],
    evidenceRefs: [],
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
  return JSON.stringify(validateProject(project), null, 2);
}

/** Minimal durable backend contract for the revisioned store. */
export interface ProjectBackend {
  /** Raw stored document, or null when the store is empty. */
  read(): string | null;
  /** Persist one complete document (replaces the previous). */
  write(text: string): void;
}

/** In-memory backend for tests and ephemeral sessions. */
export function createMemoryBackend(): ProjectBackend {
  let text: string | null = null;
  return {
    read: () => text,
    write: (next: string) => {
      text = next;
    },
  };
}

/**
 * Revisioned project store (S3-lite): optimistic-concurrency saves over an
 * injectable backend. `save(project, expectedRevision)` re-reads the backend
 * so a concurrent commit is always visible, rejects with StaleRevisionError
 * when `expectedRevision` no longer matches the stored revision, then stamps
 * the next monotonic revision and persists. Corrupt stored bytes throw
 * InvalidProjectError on load/save rather than being silently overwritten.
 */
export interface ProjectStore {
  /** Current document, migrated + validated; null when the backend is empty. */
  load(): ProjectEnvelope | null;
  /** Commit an edit derived from `expectedRevision`; stale bases rejected. */
  save(project: ProjectEnvelope, expectedRevision: number): ProjectEnvelope;
}

export function createProjectStore(backend: ProjectBackend): ProjectStore {
  let cached: ProjectEnvelope | null = null;
  const refresh = (): void => {
    const text = backend.read();
    cached = text === null || text === undefined ? null : readProject(text);
  };
  return {
    load() {
      refresh();
      return cached;
    },
    save(project: ProjectEnvelope, expectedRevision: number): ProjectEnvelope {
      refresh();
      const storedRevision = cached === null ? 0 : cached.revision;
      if (expectedRevision !== storedRevision) {
        throw new StaleRevisionError(
          `stale write rejected: base revision ${expectedRevision} does not match stored revision ${storedRevision}`,
          expectedRevision,
          storedRevision,
        );
      }
      validateProject(project);
      const next: ProjectEnvelope = { ...project, revision: storedRevision + 1 };
      backend.write(writeProject(next));
      cached = next;
      return next;
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
  verifyUniqueIds(vehicle.components, 'component');
  return vehicle;
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
        isMotorMount: typeof comp.isMotorMount === 'boolean' ? comp.isMotorMount : undefined,
        assignedMotorId:
          typeof comp.assignedMotorId === 'string' && comp.assignedMotorId.length > 0
            ? comp.assignedMotorId
            : undefined,
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
        tipChord: requirePositive(comp.tipChord, `${ctx}.tipChord`),
        span: requirePositive(comp.span, `${ctx}.span`),
        sweepLength: requirePositive(comp.sweepLength, `${ctx}.sweepLength`),
        thickness: requirePositive(comp.thickness, `${ctx}.thickness`),
        crossSection: requireOneOf(comp.crossSection, FIN_CROSS_SECTIONS, `${ctx}.crossSection`),
        axialOffset: requireNonNegative(comp.axialOffset, `${ctx}.axialOffset`),
      };
    case 'ellipticalfinset':
      return {
        finCount: requireIntegerAtLeastOne(comp.finCount, `${ctx}.finCount`),
        rootChord: requirePositive(comp.rootChord, `${ctx}.rootChord`),
        span: requirePositive(comp.span, `${ctx}.span`),
        thickness: requirePositive(comp.thickness, `${ctx}.thickness`),
        axialOffset: requireNonNegative(comp.axialOffset, `${ctx}.axialOffset`),
      };
    case 'masscomponent':
      return {
        mass: requireNonNegative(comp.mass, `${ctx}.mass`),
        length: requireNonNegative(comp.length, `${ctx}.length`),
        axialOffset: requireNonNegative(comp.axialOffset, `${ctx}.axialOffset`),
      };
    case 'parachute':
      return {
        diameter: requirePositive(comp.diameter, `${ctx}.diameter`),
        cd: requirePositive(comp.cd, `${ctx}.cd`),
        mass: requireNonNegative(comp.mass, `${ctx}.mass`),
        axialOffset: requireNonNegative(comp.axialOffset, `${ctx}.axialOffset`),
      };
  }
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
  const evidenceRefs = validateEvidenceRefs(value.evidenceRefs);
  verifyUniqueIds(evidenceRefs, 'evidenceRef');
  return {
    schemaVersion,
    revision,
    vehicle,
    motorRecords,
    bindings,
    cases,
    snapshots,
    evidenceRefs,
  };
}
