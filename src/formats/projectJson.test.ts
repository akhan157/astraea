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
  createProjectEnvelope,
  createProjectStore,
  readProject,
  writeProject,
  type ProjectEnvelope,
} from './projectJson';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { DEFAULT_WORKSPACE } from '../application/workspace';
import { DEFAULT_MISSION } from '../application/mission';
import { savedTelemetryFixture } from '../application/savedTelemetry.fixture';
import { captureRunInputs } from '../application/runInputs';
// Frozen documents produced by each source line's OWN createProjectEnvelope +
// bundled preset (main `eb2f64e`, workbench-wip `2646daf`), not hand-invented
// shapes. Regenerate via a scratch worktree if the presets move.
import mainEraDoc from './__fixtures__/project-main-1.0.0.json';
import workbenchDoc from './__fixtures__/project-workbench-1.1.0.json';

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
    workspace: structuredClone(DEFAULT_WORKSPACE),
    mission: { ...DEFAULT_MISSION },
    ledger: [],
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
  it('stamps revision 1 on the initial save and reloads the committed envelope', async () => {
    const backend = createMemoryBackend();
    const store = createProjectStore(backend);
    expect(await store.load()).toBeNull();
    const committed = await store.save(envelope(), 0);
    expect(committed.revision).toBe(1);
    expect((await store.load())?.revision).toBe(1);
    expect(JSON.parse(((await backend.read()) as string) ?? '{}').schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
  });

  it('rejects a save whose base revision is stale and advances on the current one', async () => {
    const backend = createMemoryBackend();
    const first = createProjectStore(backend);
    const second = createProjectStore(backend);
    await first.save(envelope(), 0); // stored revision 1

    // The second writer still believes the store is empty (base revision 0).
    await expect(second.save(envelope(), 0)).rejects.toThrow(StaleRevisionError);
    await expect(second.save(envelope(), 0)).rejects.toThrow(/stale write/);

    // Rebasing onto the CURRENT revision is accepted; the store stamps 2.
    const advanced = await second.save(envelope(), 1);
    expect(advanced.revision).toBe(2);
    expect((await second.load())?.revision).toBe(2);
    expect((await first.load())?.revision).toBe(2);
  });

  it('fails closed on corrupt stored bytes instead of clobbering them', async () => {
    let text = '{ nope';
    const corrupt = { read: () => text, update: (next: (current: string | null) => string) => { text = next(text); } };
    const store = createProjectStore(corrupt);
    await expect(store.load()).rejects.toThrow(InvalidProjectError);
    await expect(store.save(envelope(), 0)).rejects.toThrow(InvalidProjectError);
    expect(text).toBe('{ nope');
  });
});

// ---------------------------------------------------------------------------
// Envelope construction (S3-lite UI export cutover)
// ---------------------------------------------------------------------------

describe('projectJson createProjectEnvelope', () => {
  it('derives certified records and mount bindings from the vehicle alone', () => {
    const project = createProjectEnvelope({ vehicle: LEGACY_VEHICLE });
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.revision).toBe(INITIAL_REVISION);
    expect(project.motorRecords.map((r) => r.id)).toEqual(['estes_c6']);
    expect(project.motorRecords[0].provenance).toEqual({ source: 'certified' });
    expect(project.bindings).toEqual([
      { kind: 'motorMount', vehicleComponentId: MOUNT_TUBE_ID, motorRecordId: 'estes_c6' },
    ]);
    // Round-trips through the fail-closed writer and reader unchanged.
    const reread = readProject(writeProject(project));
    expect(reread.vehicle).toEqual(LEGACY_VEHICLE);
    expect(reread.bindings).toEqual(project.bindings);
  });

  it('keeps a supplied record over the derived certified one, preserving its provenance', () => {
    const project = createProjectEnvelope({
      vehicle: LEGACY_VEHICLE,
      motorRecords: [
        {
          id: 'Estes C6',
          motor: CERTIFIED_MOTORS.estes_c6,
          provenance: { source: 'import', sourceFile: 'estes-c6.eng' },
        },
      ],
    });
    expect(project.motorRecords).toHaveLength(1);
    expect(project.motorRecords[0].id).toBe('estes_c6');
    expect(project.motorRecords[0].provenance).toEqual({
      source: 'import',
      sourceFile: 'estes-c6.eng',
    });
    expect(project.bindings).toHaveLength(1);
  });

  it('leaves an unknown assigned motor id unreferenced rather than fabricating a record', () => {
    const vehicle = {
      ...LEGACY_VEHICLE,
      components: [
        LEGACY_VEHICLE.components[0],
        { ...LEGACY_VEHICLE.components[1], assignedMotorId: 'session_custom_k550' },
      ],
    };
    const project = createProjectEnvelope({ vehicle });
    expect(project.motorRecords).toEqual([]);
    expect(project.bindings).toEqual([]);
    const reread = readProject(writeProject(project));
    const tube = reread.vehicle.components.find((c) => c.id === MOUNT_TUBE_ID);
    const assigned = tube && 'assignedMotorId' in tube ? tube.assignedMotorId : undefined;
    expect(assigned).toBe('session_custom_k550');
  });

  it('carries caller payloads and revision without dropping or inventing any', () => {
    const project = createProjectEnvelope({
      vehicle: LEGACY_VEHICLE,
      revision: 7,
      cases: [
        {
          id: 'case-1',
          kind: 'flight',
          createdAt: T,
          motorRecordId: 'estes_c6',
          summary: { apogeeM: 120.5 },
        },
      ],
      snapshots: [
        {
          id: 'snap-1',
          kind: 'weather',
          createdAt: T,
          source: 'manual',
          data: [{ altitudeM: 0, speedMs: 3, directionFromDeg: 270, tempC: 18, pressureHpa: 1013 }],
        },
      ],
      evidenceRefs: [{ id: 'ev-1', kind: 'altimetry', createdAt: T, checksumSha256: SHA }],
    });
    expect(project.revision).toBe(7);
    expect(project.cases).toHaveLength(1);
    expect(project.snapshots).toHaveLength(1);
    expect(project.evidenceRefs).toHaveLength(1);
    const reread = readProject(writeProject(project));
    expect(reread.revision).toBe(7);
    expect(reread.cases[0].summary).toEqual({ apogeeM: 120.5 });
    expect(reread.evidenceRefs[0].checksumSha256).toBe(SHA);
  });
});

describe('projectJson design inputs (surface finish, turbulence, nozzle, hardware, fin section)', () => {
  // These values are calibrated-method inputs: vehicle surface finish, forced
  // turbulence and nozzle exit diameter; body-tube rail/lug/shoe hardware; and
  // trapezoidal-fin section, bevels and leading-edge radius. They round-trip
  // by name/number; absent stays absent (the method's own defaults) so a
  // document that never set them is written byte-identically.
  const DESIGN_VEHICLE: RocketVehicle = {
    ...LEGACY_VEHICLE,
    surfaceFinish: 'Smooth Paint',
    forceTurbulentFlow: true,
    nozzleExitDiameter: 0.018,
    components: [
      LEGACY_VEHICLE.components[0],
      {
        ...MOUNT_TUBE,
        railGuideDiameter: 0.006,
        railGuideHeight: 0.004,
        launchLugDiameter: 0.008,
        launchShoeArea: 0.0009,
      },
      {
        id: 'fin-1',
        name: 'Fins',
        type: 'trapezoidfinset',
        materialId: 'balsa',
        finCount: 3,
        rootChord: 0.08,
        tipChord: 0.04,
        span: 0.05,
        sweepLength: 0.01,
        thickness: 0.003,
        crossSection: 'airfoil',
        axialOffset: 0.42,
        airfoilSection: 'Subsonic NACA',
        leadingEdgeBevel: 0.001,
        trailingEdgeBevel: 0.0005,
        leadingEdgeRadius: 0.0008,
      },
    ],
  };

  const designDoc = (vehiclePatch: Record<string, unknown> = {}): string =>
    JSON.stringify({ ...envelope(), vehicle: { ...DESIGN_VEHICLE, ...vehiclePatch } });

  const componentDoc = (kind: 'bodytube' | 'trapezoidfinset', patch: Record<string, unknown>): string =>
    JSON.stringify({
      ...envelope(),
      vehicle: {
        ...DESIGN_VEHICLE,
        components: DESIGN_VEHICLE.components.map((c) => (c.type === kind ? { ...c, ...patch } : c)),
      },
    });

  it('round-trips every design input through write and read', () => {
    const back = readProject(writeProject(createProjectEnvelope({ vehicle: DESIGN_VEHICLE })));
    expect(back.vehicle).toEqual(DESIGN_VEHICLE);
  });

  it('writes no design-input keys when the vehicle does not set them', () => {
    const once = writeProject(envelope());
    const doc = JSON.parse(once);
    expect('surfaceFinish' in doc.vehicle).toBe(false);
    expect('forceTurbulentFlow' in doc.vehicle).toBe(false);
    expect('nozzleExitDiameter' in doc.vehicle).toBe(false);
    for (const comp of doc.vehicle.components) {
      expect('railGuideDiameter' in comp).toBe(false);
      expect('railGuideHeight' in comp).toBe(false);
      expect('launchLugDiameter' in comp).toBe(false);
      expect('launchShoeArea' in comp).toBe(false);
      expect('airfoilSection' in comp).toBe(false);
      expect('leadingEdgeBevel' in comp).toBe(false);
      expect('trailingEdgeBevel' in comp).toBe(false);
      expect('leadingEdgeRadius' in comp).toBe(false);
    }
    expect(writeProject(readProject(once))).toBe(once);
  });

  it('preserves design inputs on a 1.0.0 document while dropping fields the schema does not define', () => {
    const doc = {
      schemaVersion: '1.0.0',
      revision: INITIAL_REVISION,
      vehicle: {
        ...DESIGN_VEHICLE,
        aeroModel: 'calibrated',
        launchSite: { altitudeM: 1143, temperatureK: 299.82 },
      },
      motorRecords: [],
      bindings: [],
      cases: [],
      snapshots: [],
      evidenceRefs: [],
    };
    const parsed = readProject(JSON.stringify(doc));
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.workspace).toEqual(DEFAULT_WORKSPACE);
    expect(parsed.ledger).toEqual([]);
    expect('aeroModel' in parsed.vehicle).toBe(false);
    expect(parsed.vehicle.surfaceFinish).toBe('Smooth Paint');
    expect(parsed.vehicle.forceTurbulentFlow).toBe(true);
    expect(parsed.vehicle.nozzleExitDiameter).toBe(0.018);
    expect(parsed.vehicle.launchSite).toEqual({ altitudeM: 1143 });
    const tube = parsed.vehicle.components.find((c) => c.type === 'bodytube');
    expect(tube).toMatchObject({
      railGuideDiameter: 0.006,
      railGuideHeight: 0.004,
      launchLugDiameter: 0.008,
      launchShoeArea: 0.0009,
    });
    const fins = parsed.vehicle.components.find((c) => c.type === 'trapezoidfinset');
    expect(fins).toMatchObject({
      airfoilSection: 'Subsonic NACA',
      leadingEdgeBevel: 0.001,
      trailingEdgeBevel: 0.0005,
      leadingEdgeRadius: 0.0008,
    });
  });

  it('keeps design inputs on a legacy bare vehicle', () => {
    const parsed = readProject(legacyBareJson(DESIGN_VEHICLE));
    expect(parsed.vehicle.surfaceFinish).toBe('Smooth Paint');
    expect(parsed.vehicle.forceTurbulentFlow).toBe(true);
    expect(parsed.vehicle.nozzleExitDiameter).toBe(0.018);
    const tube = parsed.vehicle.components.find((c) => c.type === 'bodytube');
    expect(tube).toMatchObject({ railGuideDiameter: 0.006, launchShoeArea: 0.0009 });
    const fins = parsed.vehicle.components.find((c) => c.type === 'trapezoidfinset');
    expect(fins).toMatchObject({ airfoilSection: 'Subsonic NACA', leadingEdgeBevel: 0.001 });
  });

  it('rejects a surface finish, airfoil section or turbulence flag outside the defined vocabulary', () => {
    expect(() => readProject(designDoc({ surfaceFinish: 'Matte' }))).toThrow(/surfaceFinish/);
    expect(() => readProject(designDoc({ forceTurbulentFlow: 'yes' }))).toThrow(/forceTurbulentFlow/);
    expect(() => readProject(componentDoc('trapezoidfinset', { airfoilSection: 'Wavy' }))).toThrow(
      /airfoilSection/,
    );
  });

  it('rejects negative dimensions and areas instead of clamping them', () => {
    expect(() => readProject(designDoc({ nozzleExitDiameter: -0.001 }))).toThrow(/nozzleExitDiameter/);
    expect(() => readProject(componentDoc('bodytube', { railGuideDiameter: -0.001 }))).toThrow(
      /railGuideDiameter/,
    );
    expect(() => readProject(componentDoc('bodytube', { railGuideHeight: Number.NaN }))).toThrow(
      /railGuideHeight/,
    );
    expect(() => readProject(componentDoc('bodytube', { launchLugDiameter: -0.001 }))).toThrow(
      /launchLugDiameter/,
    );
    expect(() => readProject(componentDoc('bodytube', { launchShoeArea: -1 }))).toThrow(
      /launchShoeArea/,
    );
    expect(() => readProject(componentDoc('trapezoidfinset', { leadingEdgeBevel: -0.001 }))).toThrow(
      /leadingEdgeBevel/,
    );
    expect(() => readProject(componentDoc('trapezoidfinset', { trailingEdgeBevel: -0.001 }))).toThrow(
      /trailingEdgeBevel/,
    );
    expect(() => readProject(componentDoc('trapezoidfinset', { leadingEdgeRadius: -0.001 }))).toThrow(
      /leadingEdgeRadius/,
    );
  });

  it('opens a legacy bare vehicle carrying the former aeroModel choice', () => {
    const parsed = readProject(legacyBareJson({ ...LEGACY_VEHICLE, aeroModel: 'astraea' }));
    expect(parsed.vehicle.name).toBe(LEGACY_VEHICLE.name);
    expect('aeroModel' in parsed.vehicle).toBe(false);
  });
});

describe('projectJson vehicle launchSite (W15)', () => {
  it('round-trips launchSite through write and read', () => {
    const project = envelope({
      vehicle: { ...LEGACY_VEHICLE, launchSite: { altitudeM: 1143 } },
    });
    const reread = readProject(writeProject(project));
    expect(reread.vehicle.launchSite).toEqual({ altitudeM: 1143 });
  });

  it('round-trips a vehicle without launchSite as absent (sea level, standard day)', () => {
    const reread = readProject(writeProject(envelope()));
    expect(reread.vehicle.launchSite).toBeUndefined();
  });

  it('migrates a legacy bare vehicle carrying launchSite', () => {
    const reread = readProject(legacyBareJson({ ...LEGACY_VEHICLE, launchSite: { altitudeM: 500 } }));
    expect(reread.vehicle.launchSite).toEqual({ altitudeM: 500 });
  });

  it('drops a legacy site temperature, which the schema no longer carries', () => {
    const reread = readProject(
      legacyBareJson({ ...LEGACY_VEHICLE, launchSite: { altitudeM: 500, temperatureK: 288.15 } }),
    );
    expect(reread.vehicle.launchSite).toEqual({ altitudeM: 500 });
  });

  const checkRejects = (launchSite: unknown): void => {
    const bad = envelope({
      vehicle: { ...LEGACY_VEHICLE, launchSite: launchSite as unknown as RocketVehicle['launchSite'] },
    });
    expect(() => readProject(writeProject(bad))).toThrow(InvalidProjectError);
    expect(() => readProject(legacyBareJson({ ...LEGACY_VEHICLE, launchSite }))).toThrow(
      InvalidProjectError,
    );
  };

  it('rejects non-object site', () => {
    checkRejects('high desert');
  });
  it('rejects NaN altitude', () => {
    checkRejects({ altitudeM: Number.NaN });
  });
  it('rejects missing altitude', () => {
    checkRejects({ temperatureK: 288.15 });
  });
  it('rejects a non-numeric altitude', () => {
    checkRejects({ altitudeM: '1143' });
  });
});

// ---------------------------------------------------------------------------
// Migration chain: 1.0.0 (main-era and reverse-era) -> 1.1.0
// ---------------------------------------------------------------------------

describe('projectJson v1.0.0 migration (main-era document)', () => {
  it('adds the default workspace and an empty ledger without touching the vehicle', () => {
    const parsed = readProject(JSON.stringify(mainEraDoc));
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.vehicle).toEqual(mainEraDoc.vehicle);
    expect(parsed.motorRecords).toEqual(mainEraDoc.motorRecords);
    expect(parsed.bindings).toEqual(mainEraDoc.bindings);
    expect(parsed.workspace).toEqual(DEFAULT_WORKSPACE);
    expect(parsed.ledger).toEqual([]);
  });

  it('keeps a migrated motor reference on the default workspace', () => {
    const oneZero: Record<string, unknown> = { ...envelope() };
    delete oneZero.workspace;
    delete oneZero.ledger;
    oneZero.schemaVersion = '1.0.0';
    const parsed = readProject(JSON.stringify(oneZero));
    expect(parsed.workspace).toEqual({ ...DEFAULT_WORKSPACE, motorId: 'estes_c6' });
    expect(parsed.ledger).toEqual([]);
  });
});

describe('projectJson workbench-era 1.1.0 document', () => {
  it('reads directly with the workspace and ledger preserved', () => {
    const parsed = readProject(JSON.stringify(workbenchDoc));
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.vehicle).toEqual(workbenchDoc.vehicle);
    expect(parsed.workspace).toEqual(workbenchDoc.workspace);
    expect(parsed.ledger).toEqual(workbenchDoc.ledger);
  });
});

describe('projectJson mission and fin shear override (1.3.0)', () => {
  const mission = { name: 'Student Launch 2027 · practice flight', site: 'Huntsville, AL', targetApogeeM: 550 };

  it('round-trips the mission and the fin shear override', () => {
    const back = readProject(writeProject(envelope({ mission, finShearModulusPa: 9.5e9 })));
    expect(back.mission).toEqual(mission);
    expect(back.finShearModulusPa).toBe(9.5e9);
  });

  it('writes no shear field when there is no override', () => {
    expect(JSON.parse(writeProject(envelope({ mission }))).finShearModulusPa).toBeUndefined();
  });

  it('migrates a 1.2.0 document to the default mission without touching anything else', () => {
    const old: Record<string, unknown> = { ...workbenchDoc, schemaVersion: '1.2.0' };
    const parsed = readProject(JSON.stringify(old));
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.mission).toEqual(DEFAULT_MISSION);
    expect(parsed.finShearModulusPa).toBeUndefined();
    expect(parsed.vehicle).toEqual(workbenchDoc.vehicle);
    expect(parsed.workspace).toEqual(workbenchDoc.workspace);
  });

  it('refuses a current-schema document with a missing or malformed mission', () => {
    const noMission: Record<string, unknown> = { ...envelope() };
    delete noMission.mission;
    expect(() => readProject(JSON.stringify(noMission))).toThrow(/mission/);
    expect(() => readProject(JSON.stringify({ ...envelope(), mission: { ...mission, targetApogeeM: 0 } }))).toThrow(/targetApogeeM/);
    expect(() => readProject(JSON.stringify({ ...envelope(), mission: { ...mission, name: 7 } }))).toThrow(/mission\.name/);
    expect(() => readProject(JSON.stringify({ ...envelope(), finShearModulusPa: -1 }))).toThrow(/finShearModulusPa/);
  });
});

describe('projectJson drag calibration (1.4.0)', () => {
  const dragCalibration = {
    scale: 0.881,
    fittedCd: 0.4888,
    modelCd: 0.5545,
    rmseN: 0.117,
    coastMassKg: 0.0499,
    source: { fileName: 'cosmic-cargo-2986.csv', sha256Hex: 'c'.repeat(64), rowCount: 406 },
    window: { startS: 2.31, endS: 7.28, method: 'velocity-column' as const, pointsUsed: 385, pointsExcluded: 13 },
    appliedAt: '2026-10-21T12:00:00.000Z',
  };

  it('round-trips the calibration with its provenance', () => {
    const back = readProject(writeProject(envelope({ dragCalibration })));
    expect(back.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(back.dragCalibration).toEqual(dragCalibration);
  });

  it('writes no calibration field when there is none', () => {
    expect(JSON.parse(writeProject(envelope())).dragCalibration).toBeUndefined();
  });

  it('migrates a 1.3.0 document without inventing a calibration or touching anything else', () => {
    const v130: Record<string, unknown> = {
      ...JSON.parse(writeProject(envelope({ mission: { name: 'Student Launch', site: 'Huntsville', targetApogeeM: 1371 }, finShearModulusPa: 9.5e9 }))),
      schemaVersion: '1.3.0',
    };
    delete v130.dragCalibration;
    const parsed = readProject(JSON.stringify(v130));
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.dragCalibration).toBeUndefined();
    expect(parsed.mission).toEqual(v130.mission);
    expect(parsed.finShearModulusPa).toBe(9.5e9);
    expect(parsed.vehicle).toEqual(v130.vehicle);
    expect(parsed.workspace).toEqual(v130.workspace);
  });

  it('carries a document all the way from 1.0.0 to the calibration-capable schema', () => {
    const parsed = readProject(JSON.stringify(mainEraDoc));
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.dragCalibration).toBeUndefined();
  });

  it('validates a calibration found in an older document with the current rules', () => {
    const v130: Record<string, unknown> = { ...JSON.parse(writeProject(envelope())), schemaVersion: '1.3.0', dragCalibration };
    // Migration only moves the version; the migrated document is validated as 1.4.0, so the field is read strictly.
    expect(readProject(JSON.stringify(v130)).dragCalibration).toEqual(dragCalibration);
    const bad = { ...v130, dragCalibration: { ...dragCalibration, scale: 0 } };
    expect(() => readProject(JSON.stringify(bad))).toThrow(/scale/);
  });

  it('refuses a malformed calibration on a current-schema document', () => {
    expect(() => readProject(JSON.stringify({ ...envelope(), dragCalibration: { ...dragCalibration, scale: 50 } }))).toThrow(/scale/);
    expect(() => readProject(JSON.stringify({ ...envelope(), dragCalibration: 'scaled' }))).toThrow(/dragCalibration/);
    expect(() => readProject(JSON.stringify({ ...envelope(), dragCalibration: { ...dragCalibration, window: null } }))).toThrow(/window/);
  });
});

describe('projectJson unknown schema version', () => {
  it('rejects a future 9.9.9 document instead of guessing', () => {
    const future = { ...envelope(), schemaVersion: '9.9.9' };
    expect(() => readProject(JSON.stringify(future))).toThrow(/9\.9\.9/);
  });
});

// ---------------------------------------------------------------------------
// Every optional field round-trips unchanged (1.1.0)
// ---------------------------------------------------------------------------

describe('projectJson every optional field round trip', () => {
  it('returns every optional vehicle and component field unchanged', () => {
    const full: RocketVehicle = {
      id: 'full-1',
      name: 'Fully Specified',
      version: '2.0',
      author: 'Test Rig',
      notes: 'every optional field set',
      launchSite: { altitudeM: -30 },
      components: [
        {
          id: 'c-nc',
          name: 'Nose',
          type: 'nosecone',
          materialId: 'fiberglass',
          color: '#112233',
          comment: 'nose',
          massOverride: 0.1,
          cgOverride: 0.02,
          shape: 'vonkarman',
          length: 0.4,
          baseDiameter: 0.1,
          wallThickness: 0.002,
          isHollow: true,
        },
        {
          id: 'c-bt',
          name: 'Tube',
          type: 'bodytube',
          materialId: 'cardboard',
          isMotorMount: true,
          assignedMotorId: 'estes_c6',
          length: 0.5,
          outerDiameter: 0.1,
          innerDiameter: 0.095,
        },
        {
          id: 'c-tr',
          name: 'Transition',
          type: 'transition',
          materialId: 'plywood',
          length: 0.05,
          foreDiameter: 0.1,
          aftDiameter: 0.08,
          wallThickness: 0.002,
          isHollow: false,
        },
        {
          id: 'c-tf',
          name: 'Fins',
          type: 'trapezoidfinset',
          materialId: 'balsa',
          finCount: 4,
          rootChord: 0.08,
          tipChord: 0,
          span: 0.05,
          sweepLength: -0.01,
          thickness: 0.003,
          crossSection: 'airfoil',
          axialOffset: 0,
        },
        {
          id: 'c-ef',
          name: 'Elliptical',
          type: 'ellipticalfinset',
          materialId: 'balsa',
          finCount: 3,
          rootChord: 0.07,
          span: 0.04,
          thickness: 0.002,
          axialOffset: 0.01,
        },
        {
          id: 'c-ms',
          name: 'Ballast',
          type: 'masscomponent',
          materialId: 'aluminum',
          mass: 0.2,
          length: 0.06,
          axialOffset: 0.02,
          widthM: 0.03,
          heightM: 0.04,
        },
        {
          id: 'c-pc',
          name: 'Chute',
          type: 'parachute',
          materialId: 'cardboard',
          diameter: 0.3,
          cd: 0.9,
          mass: 0.01,
          axialOffset: 0.05,
          packedLengthM: 0.08,
          packedDiameterM: 0.05,
        },
      ],
    };
    const back = readProject(writeProject(createProjectEnvelope({ vehicle: full })));
    expect(back.vehicle).toEqual(full);

    const ballast = back.vehicle.components.find((c) => c.type === 'masscomponent');
    expect(ballast).toMatchObject({ widthM: 0.03, heightM: 0.04 });
    const chute = back.vehicle.components.find((c) => c.type === 'parachute');
    expect(chute).toMatchObject({ packedLengthM: 0.08, packedDiameterM: 0.05 });
  });
});

describe('projectJson 1.10 retained display telemetry', () => {
  const doc = (version: string, extra: Record<string, unknown> = {}) => ({
    ...JSON.parse(writeProject(envelope())), schemaVersion: version,
    cases: [{
      id: 'flight-1', kind: 'flight', createdAt: T, motorRecordId: 'estes_c6',
      summary: { inputKey: 'key-1', apogeeM: 100 },
      inputs: captureRunInputs(envelope(), envelope().motorRecords[0], 'key-1', undefined),
      engineIdentity: { kind: 'production-rust-wasm', sha256: SHA },
      ...extra,
    }],
  });

  it('round-trips retained samples and save-open-save bytes exactly', () => {
    expect(PROJECT_SCHEMA_VERSION).toBe('1.13.0');
    const text = JSON.stringify(doc('1.10.0', { telemetry: savedTelemetryFixture() }))
      .replace('"telemetry":[{"time":0', '"telemetry":[{"time":-0.0');
    const project = readProject(text);
    expect(project.cases[0].telemetry).toEqual(savedTelemetryFixture());
    expect(Object.is(project.cases[0].telemetry![0].time, -0)).toBe(true);
    const once = writeProject(project);
    // Signed zero survives the writer as the JSON token -0.0, not only the parser.
    expect(once).toMatch(/"time":\s*-0\.0/);
    expect(writeProject(readProject(once))).toBe(once);
  });

  it('migrates a 1.9.0 case identity-only and never backfills telemetry', () => {
    const old = doc('1.9.0', { events: [
      { t: 0, kind: 'ignition', label: 'Ignition', altitude: 0, velocity: 0 },
    ] });
    const back = readProject(JSON.stringify(old));
    expect(back.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(back.cases[0]).not.toHaveProperty('telemetry');
    expect({ ...back, schemaVersion: '1.9.0' }).toEqual(old);
  });

  it('refuses telemetry injected into an older schema', () => {
    expect(() => readProject(JSON.stringify(doc('1.9.0', { telemetry: savedTelemetryFixture() }))))
      .toThrow(/schema version '1\.9\.0' cannot declare case telemetry/);
  });
});

describe('projectJson 1.9 retained flight events', () => {
  const events = () => [
    { t: 0, kind: 'ignition', label: 'Ignition', altitude: 0, velocity: -0 },
    { t: 0.3, kind: 'rail_exit', label: 'Rail exit', altitude: 3, velocity: 18.9 },
    { t: 1.2, kind: 'max_q', label: 'Sampled Max-Q', altitude: 60, velocity: 90, derived: true },
    { t: 30, kind: 'touchdown', label: 'Touchdown', altitude: 0, velocity: 5.9 },
  ];
  const doc = (version: string, extra: Record<string, unknown> = {}) => ({
    ...JSON.parse(writeProject(envelope())), schemaVersion: version,
    cases: [{ id: 'flight-1', kind: 'flight', createdAt: T, motorRecordId: 'estes_c6', summary: { apogeeM: 100 }, ...extra }],
  });

  it('writes 1.9.0 and round-trips exact events including signed zero', () => {
    expect(PROJECT_SCHEMA_VERSION).toBe('1.13.0');
    const text = JSON.stringify(doc('1.9.0', { events: events() })).replace('"velocity":0}', '"velocity":-0.0}');
    const back = readProject(writeProject(readProject(text)));
    expect(back.cases[0].events).toEqual(events());
    expect(Object.is(back.cases[0].events![0].velocity, -0)).toBe(true);
  });

  it('migrates a 1.8.0 case unchanged and never backfills events', () => {
    const back = readProject(JSON.stringify(doc('1.8.0')));
    expect(back.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(back.cases[0]).not.toHaveProperty('events');
  });

  it('refuses events declared by an older schema instead of stripping them', () => {
    expect(() => readProject(JSON.stringify(doc('1.8.0', { events: events() })))).toThrow(/schema version '1\.8\.0' cannot declare case events/);
    expect(() => readProject(JSON.stringify(doc('1.9.0', { events: events() })))).not.toThrow();
  });

  it('refuses malformed or ensemble events', () => {
    const bad = events(); bad[1].label = 'Liftoff';
    expect(() => readProject(JSON.stringify(doc('1.9.0', { events: bad })))).toThrow(/cases\[0\] events\[1\]\.label must be 'Rail exit'/);
    expect(() => readProject(JSON.stringify(doc('1.9.0', { events: null })))).toThrow(/cases\[0\] events must be an array/);
    expect(() => readProject(JSON.stringify(doc('1.9.0', { kind: 'monteCarlo', events: events() })))).toThrow(/cases\[0\] ensemble cannot carry flight events/);
  });
});

describe('projectJson 1.11 archived canonical outputs', () => {
  const outputs = () => ({
    dictionaryRevision: 'RMP10-C06/2',
    outputs: {
      apogee: { value: 1371, unit: 'm', confidence: 'modeled', reason: 'airframe model', available: true },
      landingEnergy: { value: 0, unit: 'J', confidence: 'modeled', available: true },
      landingSpeed: { value: null, unit: 'm/s', confidence: 'modeled', available: false, unavailableReason: 'recorded value is not finite' },
    },
    flags: { validity: 'PASS', enveloped: true, offNominalExcursion: true, landingNominal: true, terminationReason: 'touchdown' },
    sampledMaxQ: { time: 3.2, sampleCount: 6, validSampleCount: 6 },
  });
  const doc = (version: string, extra: Record<string, unknown> = {}) => ({
    ...JSON.parse(writeProject(envelope())), schemaVersion: version,
    cases: [{
      id: 'flight-1', kind: 'flight', createdAt: T, motorRecordId: 'estes_c6',
      summary: { inputKey: 'key-1', apogeeM: 1371 },
      inputs: captureRunInputs(envelope(), envelope().motorRecords[0], 'key-1', undefined),
      engineIdentity: { kind: 'production-rust-wasm', sha256: SHA },
      ...extra,
    }],
  });

  it('round-trips the versioned dictionary with null/zero availability intact and save-open-save bytes exact', () => {
    expect(PROJECT_SCHEMA_VERSION).toBe('1.13.0');
    const text = JSON.stringify(doc('1.11.0', { flightOutputs: outputs() }));
    const parsed = readProject(text);
    expect(parsed.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(parsed.cases[0].flightOutputs).toEqual(outputs());
    expect(parsed.cases[0].flightOutputs?.outputs.landingEnergy?.value).toBe(0);
    expect(parsed.cases[0].flightOutputs?.outputs.landingSpeed).toMatchObject({ value: null, available: false });
    const once = writeProject(parsed);
    expect(writeProject(readProject(once))).toBe(once);
  });

  it('migrates a 1.10.0 document identity-only and never backfills output qualification', () => {
    const old = doc('1.10.0', { telemetry: savedTelemetryFixture() });
    const back = readProject(JSON.stringify(old));
    expect(back.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(back.cases[0]).not.toHaveProperty('flightOutputs');
    expect(back.cases[0].telemetry).toEqual(JSON.parse(JSON.stringify(savedTelemetryFixture())));
    expect({ ...back, schemaVersion: '1.10.0' }).toEqual(JSON.parse(JSON.stringify(old)));
  });

  it('refuses canonical outputs injected into an older schema or attached to an ensemble', () => {
    expect(() => readProject(JSON.stringify(doc('1.10.0', { flightOutputs: outputs() }))))
      .toThrow(/schema version '1\.10\.0' cannot declare case flightOutputs/);
    const ensemble = doc('1.11.0', { kind: 'monteCarlo', flightOutputs: outputs() }) as { cases: Array<Record<string, unknown>> };
    delete ensemble.cases[0].inputs;
    expect(() => readProject(JSON.stringify(ensemble)))
      .toThrow(/ensemble cannot carry flight outputs/);
  });

  it('refuses unknown or contradictory fields instead of accepting an injected dictionary', () => {
    const unknown = outputs() as Record<string, unknown>;
    unknown.extra = 1;
    expect(() => readProject(JSON.stringify(doc('1.11.0', { flightOutputs: unknown }))))
      .toThrow(/flightOutputs must have exactly/);
    const contradictory = outputs();
    contradictory.outputs.apogee.available = false;
    expect(() => readProject(JSON.stringify(doc('1.11.0', { flightOutputs: contradictory }))))
      .toThrow(/unavailable output must carry a null value/);
    const ensemble = doc('1.11.0', { kind: 'monteCarlo', flightOutputs: outputs() }) as { cases: Array<Record<string, unknown>> };
    delete ensemble.cases[0].inputs;
    expect(() => readProject(JSON.stringify(ensemble)))
      .toThrow(/ensemble cannot carry flight outputs/);
  });
});

describe('projectJson 1.13 aero-model selection', () => {
  const selection = {
    modelId: 'aero-buildup',
    modelVersion: '1.0.0',
    terms: { transonic: 'legacy' },
  } as const;

  it('round-trips the envelope and the case-pinned selection byte-exactly', () => {
    const env = envelope({ aeroModel: selection });
    const inputs = captureRunInputs(env, env.motorRecords[0], 'key-1', undefined);
    expect(inputs.aeroModel).toEqual(selection);
    const withCase: ProjectEnvelope = {
      ...env,
      cases: [{
        id: 'flight-1', kind: 'flight', createdAt: T, motorRecordId: 'estes_c6',
        summary: { apogeeM: 100 }, inputs,
      }],
    };
    const text = writeProject(withCase);
    const back = readProject(text);
    expect(back.aeroModel).toEqual(selection);
    const pinned = back.cases[0].inputs as { aeroModel?: unknown } | undefined;
    expect(pinned?.aeroModel).toEqual(selection);
    expect(writeProject(back)).toBe(text);
  });

  it('refuses the selection in a 1.12 document and migrates 1.12 without it', () => {
    const doc = JSON.parse(writeProject(envelope({ aeroModel: selection }))) as Record<string, unknown>;
    doc.schemaVersion = '1.12.0';
    expect(() => readProject(JSON.stringify(doc))).toThrow(/cannot declare an aero-model selection/);
    delete doc.aeroModel;
    const migrated = readProject(JSON.stringify(doc));
    expect(migrated.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(migrated).not.toHaveProperty('aeroModel');
  });

  it('refuses an unknown model version instead of substituting', () => {
    const env = envelope({ aeroModel: { ...selection, modelVersion: '9.9.9' } });
    expect(() => writeProject(env)).toThrow(/unknown to this build/);
  });
});
