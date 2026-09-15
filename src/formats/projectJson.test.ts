/**
 * Versioned JSON project envelope engine (adapter matrix rows 1-2, S3-lite):
 * readProject/writeProject with the legacy bare-vehicle migration chain, the
 * stale-write guard, and fail-closed validation on read and write.
 *
 * Case-token contract: every case below registers exactly one literal
 * case token, so the emitter's source count for this file equals its
 * executed count (see scripts/emit-benchmark-metadata.cjs M2 binding).
 */

import { describe, it, expect } from 'vitest';
import type { RocketVehicle, BodyTubeComponent } from '../core/types';
import {
  PROJECT_SCHEMA_VERSION,
  INITIAL_REVISION,
  InvalidProjectError,
  StaleRevisionError,
  createMemoryBackend,
  createProjectStore,
  readProject,
  writeProject,
  type ProjectEnvelope,
} from './projectJson';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOUNT_TUBE_ID = 'bt-mount';

const MOUNT_TUBE: BodyTubeComponent = {
  id: MOUNT_TUBE_ID,
  name: 'Booster',
  type: 'bodytube',
  length: 1.0,
  outerDiameter: 0.1,
  innerDiameter: 0.095,
  isMotorMount: true,
  assignedMotorId: 'estes_c6',
  materialId: 'cardboard',
};

/** Minimal structurally complete vehicle in the exact shape Header writes. */
const LEGACY_VEHICLE: RocketVehicle = {
  id: 'legacy-1',
  name: 'Legacy Rocket',
  version: '1.0',
  author: 'Test Rig',
  notes: 'written as a bare vehicle, no schema version',
  components: [
    {
      id: 'nc-1',
      name: 'Nosecone',
      type: 'nosecone',
      shape: 'vonkarman',
      length: 0.3,
      baseDiameter: 0.1,
      wallThickness: 0.002,
      isHollow: true,
      materialId: 'fiberglass',
    },
    MOUNT_TUBE,
  ],
};

const T = '2026-09-14T12:00:00.000Z';
const SHA = 'a'.repeat(64);
const SHA2 = 'b'.repeat(64);

function envelope(over?: Partial<ProjectEnvelope>): ProjectEnvelope {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: INITIAL_REVISION,
    vehicle: LEGACY_VEHICLE,
    motorRecords: [
      {
        id: 'estes_c6',
        motor: CERTIFIED_MOTORS.estes_c6,
        provenance: { source: 'certified' },
      },
    ],
    bindings: [{ kind: 'motorMount', vehicleComponentId: MOUNT_TUBE_ID, motorRecordId: 'estes_c6' }],
    cases: [],
    snapshots: [],
    evidenceRefs: [],
    ...over,
  };
}

function legacyBareJson(vehicle: unknown): string {
  return JSON.stringify(vehicle);
}

// ---------------------------------------------------------------------------
// Migration: legacy bare vehicle -> v1 envelope
// ---------------------------------------------------------------------------

describe('projectJson legacy bare-vehicle migration', () => {
  it('migrates a legacy bare vehicle into a v1 envelope with a certified motor record and mount binding', () => {
    const parsed = readProject(legacyBareJson(LEGACY_VEHICLE));
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.revision).toBe(INITIAL_REVISION);
    expect(parsed.vehicle).toEqual(LEGACY_VEHICLE);
    expect(parsed.motorRecords).toHaveLength(1);
    expect(parsed.motorRecords[0].id).toBe('estes_c6');
    expect(parsed.motorRecords[0].motor.designation).toBe('Estes C6');
    expect(parsed.motorRecords[0].provenance).toEqual({ source: 'certified' });
    expect(parsed.bindings).toEqual([{ kind: 'motorMount', vehicleComponentId: MOUNT_TUBE_ID, motorRecordId: 'estes_c6' }]);
    expect(parsed.cases).toEqual([]);
    expect(parsed.snapshots).toEqual([]);
    expect(parsed.evidenceRefs).toEqual([]);
  });

  it('keeps a legacy vehicle with no motor reference as an empty-record envelope', () => {
    const bare = { ...LEGACY_VEHICLE, components: [LEGACY_VEHICLE.components[0]] };
    const parsed = readProject(legacyBareJson(bare));
    expect(parsed.vehicle).toEqual(bare);
    expect(parsed.motorRecords).toEqual([]);
    expect(parsed.bindings).toEqual([]);
  });

  it('keeps an unresolvable legacy motor id on the vehicle without fabricating a record', () => {
    const withCustom = {
      ...LEGACY_VEHICLE,
      components: [
        LEGACY_VEHICLE.components[0],
        { ...LEGACY_VEHICLE.components[1], assignedMotorId: 'my_custom_k550' },
      ],
    };
    const parsed = readProject(legacyBareJson(withCustom));
    const tube = parsed.vehicle.components.find((c) => c.id === MOUNT_TUBE_ID);
    const assigned = tube && 'assignedMotorId' in tube ? tube.assignedMotorId : undefined;
    expect(assigned).toBe('my_custom_k550');
    expect(parsed.motorRecords).toEqual([]);
    expect(parsed.bindings).toEqual([]);
  });

  it('rejects an unknown schema version on read without guessing', () => {
    const future = { ...envelope(), schemaVersion: '99.0.0' };
    expect(() => readProject(JSON.stringify(future))).toThrow(/no migration to/);
    expect(() => readProject(JSON.stringify(future))).toThrow(InvalidProjectError);
  });

  it('rejects unparseable or empty documents', () => {
    expect(() => readProject('{ not json')).toThrow(InvalidProjectError);
    expect(() => readProject('')).toThrow(InvalidProjectError);
    expect(() => readProject('[1,2,3]')).toThrow(InvalidProjectError);
  });

  it('rejects a malformed vehicle document', () => {
    expect(() => readProject(legacyBareJson({ ...LEGACY_VEHICLE, components: [] }))).toThrow(
      /non-empty array/,
    );
    expect(() => readProject(legacyBareJson({ ...LEGACY_VEHICLE, name: 12 }))).toThrow(
      InvalidProjectError,
    );
  });

  it('rejects a duplicate component id at read', () => {
    const dup = {
      ...LEGACY_VEHICLE,
      components: [LEGACY_VEHICLE.components[0], LEGACY_VEHICLE.components[0]],
    };
    expect(() => readProject(legacyBareJson(dup))).toThrow(/duplicate component id/);
  });

  it('rejects a dangling motor binding on read', () => {
    const bad = envelope({
      bindings: [{ kind: 'motorMount', vehicleComponentId: MOUNT_TUBE_ID, motorRecordId: 'no_such_record' }],
    });
    expect(() => readProject(JSON.stringify(bad))).toThrow(/unknown motor record/);
  });
});

// ---------------------------------------------------------------------------
// Envelope round-trip
// ---------------------------------------------------------------------------

describe('projectJson envelope round-trip', () => {
  it('round-trips a full envelope through write and read with revision preserved', () => {
    const full = envelope({
      revision: 3,
      motorRecords: [
        { id: 'estes_c6', motor: CERTIFIED_MOTORS.estes_c6, provenance: { source: 'certified' } },
        {
          id: 'aerotech_h128w',
          motor: CERTIFIED_MOTORS.aerotech_h128w,
          provenance: { source: 'import', sourceFile: 'h128w.eng', sourceSha256: SHA, importedAt: T },
        },
      ],
      bindings: [
        { kind: 'motorMount', vehicleComponentId: MOUNT_TUBE_ID, motorRecordId: 'estes_c6' },
      ],
      cases: [
        {
          id: 'case-1',
          kind: 'flight',
          createdAt: T,
          motorRecordId: 'estes_c6',
          weatherSnapshotId: 'wx-1',
          summary: { apogeeM: 1200.5, isStable: true, note: 'nominal' },
        },
      ],
      snapshots: [
        {
          id: 'wx-1',
          kind: 'weather',
          createdAt: T,
          source: 'open-meteo',
          data: [{ altitudeM: 0, speedMs: 3.2, directionFromDeg: 270, tempC: 15, pressureHpa: 1013.25 }],
        },
        {
          id: 'disp-1',
          kind: 'dispersion',
          createdAt: T,
          source: 'monte-carlo:legacy-1:estes_c6',
          data: {
            mean: { x: 12.5, y: -3.0 },
            covariance: { xx: 40.0, xy: 0.0, yy: 25.0 },
            sigma1: 6.4,
            sigma2: 5.0,
            thetaDeg: 10.0,
            containmentRadii: { r50: 5.0, r90: 9.0, r99: 12.0 },
          },
        },
      ],
      evidenceRefs: [
        { id: 'ev-1', kind: 'altimetry', createdAt: T, checksumSha256: SHA2, sourceFile: 'flight1.csv' },
      ],
    });
    const json = writeProject(full);
    const back = readProject(json);
    expect(back).toEqual(full);
    expect(back.revision).toBe(3);
    expect(back.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
  });

  it('rejects an invalid envelope at write', () => {
    expect(() => writeProject(envelope({ revision: 0 }))).toThrow(/positive integer/);
    const badMotor = envelope({
      motorRecords: [
        {
          id: 'broken',
          motor: { ...CERTIFIED_MOTORS.estes_c6, thrustCurve: [{ time: 1, thrust: 1 }] },
          provenance: { source: 'derived' },
        },
      ],
    });
    expect(() => writeProject(badMotor)).toThrow(InvalidProjectError);
  });

  it('rejects a case referencing a missing weather snapshot at write', () => {
    const bad = envelope({
      cases: [
        {
          id: 'case-x',
          kind: 'monteCarlo',
          createdAt: T,
          motorRecordId: 'estes_c6',
          weatherSnapshotId: 'no-such-snapshot',
        },
      ],
    });
    expect(() => writeProject(bad)).toThrow(/unknown weather snapshot/);
  });
});

// ---------------------------------------------------------------------------
// Stale-write guard (revisioned store, S3-lite)
// ---------------------------------------------------------------------------

describe('projectJson stale-write guard', () => {
  it('stamps revision 1 on the initial save and reloads the committed envelope', () => {
    const backend = createMemoryBackend();
    const store = createProjectStore(backend);
    expect(store.load()).toBeNull();
    const committed = store.save(envelope(), 0);
    expect(committed.revision).toBe(1);
    expect(store.load()?.revision).toBe(1);
    expect(JSON.parse(backend.read() ?? '{}').schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
  });

  it('rejects a save whose base revision is stale and advances on the current one', () => {
    const backend = createMemoryBackend();
    const first = createProjectStore(backend);
    const second = createProjectStore(backend);
    first.save(envelope(), 0); // stored revision 1

    // The second writer still believes the store is empty (base revision 0).
    expect(() => second.save(envelope(), 0)).toThrow(StaleRevisionError);
    expect(() => second.save(envelope(), 0)).toThrow(/stale write/);

    // Rebasing onto the CURRENT revision is accepted; the store stamps 2.
    const advanced = second.save(envelope(), 1);
    expect(advanced.revision).toBe(2);
    expect(second.load()?.revision).toBe(2);
    expect(first.load()?.revision).toBe(2);
  });

  it('fails closed on corrupt stored bytes instead of clobbering them', () => {
    const corrupt = { read: () => '{ nope', write: () => undefined };
    const store = createProjectStore(corrupt);
    expect(() => store.load()).toThrow(InvalidProjectError);
    expect(() => store.save(envelope(), 0)).toThrow(InvalidProjectError);
  });
});