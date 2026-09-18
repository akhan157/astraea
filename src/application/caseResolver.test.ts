/**
 * UI2 S1 acceptance: shared case/run foundation.
 *
 * Pins the D02/D03 contract: content-addressed run identity (a same-ID
 * motor edit retires the old key), identical physical inputs sharing one
 * key across run paths, explicit unresolved-motor errors (no silent
 * fallback), and one consistent mount-repair path.
 */
import { describe, it, expect } from 'vitest';
import type { RocketVehicle } from '../core/types';
import { CERTIFIED_MOTORS, type MotorSpec } from '../propulsion/motorDatabase';
import {
  assessMounts,
  freshnessReasonLabel,
  isSnapshotStale,
  motorContentKey,
  preflight,
  reasonMotorExcluded,
  resolveMotor,
  snapshotCase,
  snapshotDivergence,
  type LaunchCase,
  type McEnsembleInput,
  type WindLayerSnapshot,
} from './caseResolver';

function mountTube(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'mount-1',
    name: 'Motor Mount',
    type: 'bodytube',
    length: 0.3,
    outerDiameter: 0.05,
    innerDiameter: 0.024,
    materialId: 'cardboard',
    isMotorMount: true,
    ...overrides,
  };
}

function vehicleWith(tubes: Array<Record<string, unknown>>): RocketVehicle {
  return {
    id: 's1-vehicle',
    name: 'S1 Case Vehicle',
    version: '1.0',
    author: 'S1',
    notes: '',
    components: [
      {
        id: 'nc-1',
        name: 'Nose',
        type: 'nosecone',
        shape: 'ogive',
        length: 0.2,
        baseDiameter: 0.05,
        wallThickness: 0.002,
        isHollow: true,
        materialId: 'cardboard',
      },
      ...(tubes as unknown as RocketVehicle['components']),
    ],
  };
}

function baseCase(vehicle: RocketVehicle, motorId = 'estes_c6'): LaunchCase {
  return {
    vehicle,
    motorId,
    options: {
      railLengthM: 2.4,
      railElevationDeg: 85,
      railAzimuthDeg: 0,
      windSpeedMps: 2,
      windAzimuthDeg: 90,
      finCantDeg: 0,
      mainDeployAltitudeM: 150,
    },
  };
}

/** TrajectoryStudio-style ensemble capture (studio defaults). */
function basicEnsemble(): McEnsembleInput {
  return {
    nRuns: 50,
    windAzimuthDegSigma: 5,
    railAngleDegSigma: 1,
    impulsePctSigma: 3,
    wind: {
      probeAltitudeM: 0,
      windRows: [{ altitudeM: 0, speedMs: 0, directionFromDeg: 0 }],
      soundingStatus: 'idle',
      soundingLayers: [],
    },
  };
}

/** A fetched-sounding pressure level (structural WindLayerSnapshot). */
function soundingLayer(overrides: Partial<WindLayerSnapshot> = {}): WindLayerSnapshot {
  return {
    altitudeM: 1000,
    speedMs: 3,
    directionFromDeg: 270,
    tempC: 15,
    pressureHpa: 900,
    ...overrides,
  };
}

describe('caseResolver motor binding', () => {
  it('resolves catalog motors and leaves unknown ids explicitly unresolved', () => {
    const resolved = resolveMotor('estes_c6', {});
    expect(resolved.status).toBe('resolved');

    const missing = resolveMotor('no_such_motor', {});
    expect(missing.status).toBe('unresolved');
    if (missing.status === 'unresolved') expect(missing.motorId).toBe('no_such_motor');
  });

  it('lets custom imports override certified records on id collision', () => {
    const edited: MotorSpec = { ...CERTIFIED_MOTORS.estes_c6, designation: 'Custom C6' };
    const resolved = resolveMotor('estes_c6', { estes_c6: edited });
    expect(resolved.status).toBe('resolved');
    if (resolved.status === 'resolved') expect(resolved.motor.designation).toBe('Custom C6');
  });

  it('changes the content key when a curve is edited under the same id', () => {
    const original = CERTIFIED_MOTORS.estes_c6;
    const edited: MotorSpec = {
      ...original,
      thrustCurve: original.thrustCurve.map((p) => ({ ...p, thrust: p.thrust * 1.01 })),
    };
    expect(motorContentKey(edited)).not.toBe(motorContentKey(original));
    expect(motorContentKey({ ...original })).toBe(motorContentKey(original));
  });
});

describe('caseResolver preflight', () => {
  it('passes a clean vehicle/motor/options case with zero issues', () => {
    const resolved = preflight(baseCase(vehicleWith([mountTube()])), {});
    expect(resolved.issues).toEqual([]);
    expect(resolved.runnable).toBe(true);
  });

  it('reports an unresolved motor instead of substituting a fallback', () => {
    const resolved = preflight(baseCase(vehicleWith([mountTube()]), 'ghost_motor'), {});
    expect(resolved.runnable).toBe(false);
    expect(resolved.issues.some((i) => i.code === 'motor-unresolved')).toBe(true);
  });

  it('rejects ambiguous mounts with one repair path', () => {
    const vehicle = vehicleWith([mountTube({ id: 'm1' }), mountTube({ id: 'm2', name: 'Mount 2' })]);
    const mounts = assessMounts(vehicle);
    expect(mounts.ambiguous).toBe(true);
    const resolved = preflight(baseCase(vehicle), {});
    expect(resolved.runnable).toBe(false);
    const issue = resolved.issues.find((i) => i.code === 'mount-ambiguous');
    expect(issue?.repair).toEqual({ studio: 'airframe', target: 'motor mount flag' });
  });

  it('rejects a solid mount tube and an oversized motor with reasons', () => {
    const solid = vehicleWith([mountTube({ innerDiameter: 0, outerDiameter: 0.002 })]);
    const solidRun = preflight(baseCase(solid), {});
    expect(solidRun.runnable).toBe(false);
    expect(solidRun.issues.some((i) => i.code === 'mount-solid')).toBe(true);

    const bigMotor: MotorSpec = { ...CERTIFIED_MOTORS.estes_c6, diameter: 0.05 };
    const mounts = assessMounts(vehicleWith([mountTube()]));
    expect(reasonMotorExcluded(mounts, bigMotor)).toMatch(/exceeds mount/);
    const excludedById = preflight(
      { ...baseCase(vehicleWith([mountTube()])), motorId: 'big_motor' },
      { big_motor: bigMotor }
    );
    expect(excludedById.runnable).toBe(false);
    expect(excludedById.issues.some((i) => i.code === 'motor-excluded')).toBe(true);
  });

  it('treats zero mounts as the aft-end fallback, not an error', () => {
    const nomount = vehicleWith([
      mountTube({ id: 'plain', name: 'Plain Tube', isMotorMount: false }),
    ]);
    const resolved = preflight(baseCase(nomount), {});
    expect(resolved.issues.filter((i) => i.code.startsWith('mount'))).toEqual([]);
    expect(resolved.runnable).toBe(true);
  });

  it('fails closed on nonfinite launch options', () => {
    const bad = baseCase(vehicleWith([mountTube()]));
    bad.options.railLengthM = Number.NaN;
    const resolved = preflight(bad, {});
    expect(resolved.runnable).toBe(false);
    const issue = resolved.issues.find((i) => i.code === 'input-nonfinite');
    expect(issue?.message).toMatch(/rail length/);
  });
});

describe('caseResolver snapshots', () => {
  it('shares one key for identical inputs and retires it on a same-ID motor edit', () => {
    const vehicle = vehicleWith([mountTube()]);
    const first = preflight(baseCase(vehicle), {});
    const edited: MotorSpec = {
      ...CERTIFIED_MOTORS.estes_c6,
      // Q6-consistent edit: scale the curve and re-derive the declared
      // peak with it, so validation accepts the record and the key change
      // under test comes from content — not from a validity rejection.
      maxThrust: Math.max(...CERTIFIED_MOTORS.estes_c6.thrustCurve.map((p) => p.thrust)) * 1.05,
      thrustCurve: CERTIFIED_MOTORS.estes_c6.thrustCurve.map((p) => ({
        ...p,
        thrust: p.thrust * 1.05,
      })),
    };
    const afterEdit = preflight(baseCase(vehicle), { estes_c6: edited });
    const identical = preflight(baseCase(structuredClone(vehicle)), {});
    expect(first.runnable).toBe(true);
    expect(afterEdit.runnable).toBe(true);
    expect(isSnapshotStale(snapshotCase(first), afterEdit)).toBe(true);
    expect(isSnapshotStale(snapshotCase(first), identical)).toBe(false);
  });

  it('freezes snapshots against later mutation', () => {
    const resolved = preflight(baseCase(vehicleWith([mountTube()])), {});
    const snapshot = snapshotCase(resolved);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.options)).toBe(true);
  });

  it('captures the ensemble into mcKey but keeps runKey case-level (Astra P0-1)', () => {
    const vehicle = vehicleWith([mountTube()]);
    const base = baseCase(vehicle);
    const caseSnap = snapshotCase(preflight(base, {}));
    const ensSnap = snapshotCase(preflight({ ...base, ensemble: basicEnsemble() }, {}));
    // The case-level identity is ensemble-free; the FULL identity includes it.
    expect(ensSnap.runKey).toBe(caseSnap.runKey);
    expect(ensSnap.mcKey).not.toBe(caseSnap.mcKey);
    expect(ensSnap.ensembleWindKey).toBeTruthy();
    expect(ensSnap.ensemblePerturbationKey).toBeTruthy();
    expect(ensSnap.mcCanonical).toBeTruthy();

    const snapshotAt = (
      opts: { ensemble?: Partial<Omit<McEnsembleInput, 'wind'>>; wind?: Partial<McEnsembleInput['wind']> } = {},
    ) => {
      const baseEnsemble = basicEnsemble();
      const wind: McEnsembleInput['wind'] = {
        probeAltitudeM: baseEnsemble.wind.probeAltitudeM,
        windRows: baseEnsemble.wind.windRows,
        soundingStatus: baseEnsemble.wind.soundingStatus,
        soundingLayers: baseEnsemble.wind.soundingLayers,
        ...(opts.wind ?? {}),
      };
      const ensemble: McEnsembleInput = {
        nRuns: baseEnsemble.nRuns,
        windAzimuthDegSigma: baseEnsemble.windAzimuthDegSigma,
        railAngleDegSigma: baseEnsemble.railAngleDegSigma,
        impulsePctSigma: baseEnsemble.impulsePctSigma,
        ...(opts.ensemble ?? {}),
        wind,
      };
      return snapshotCase(preflight({ ...base, ensemble }, {}));
    };

    // Run count, each sigma axis, a manual wind-row edit, a probe move, and
    // the sounding profile each change the FULL identity...
    expect(snapshotAt({ ensemble: { nRuns: 200 } }).mcKey).not.toBe(ensSnap.mcKey);
    expect(snapshotAt({ ensemble: { windAzimuthDegSigma: 7 } }).mcKey).not.toBe(ensSnap.mcKey);
    expect(snapshotAt({ ensemble: { railAngleDegSigma: 2 } }).mcKey).not.toBe(ensSnap.mcKey);
    expect(snapshotAt({ ensemble: { impulsePctSigma: 5 } }).mcKey).not.toBe(ensSnap.mcKey);
    expect(
      snapshotAt({ wind: { windRows: [{ altitudeM: 0, speedMs: 4, directionFromDeg: 90 }] } }).mcKey,
    ).not.toBe(ensSnap.mcKey);
    expect(snapshotAt({ wind: { probeAltitudeM: 300 } }).mcKey).not.toBe(ensSnap.mcKey);
    expect(
      snapshotAt({ wind: { soundingStatus: 'ok', soundingLayers: [soundingLayer()] } }).mcKey,
    ).not.toBe(ensSnap.mcKey);
    // ...but never the CASE identity (the overlay's re-derivation scope).
    expect(snapshotAt({ ensemble: { nRuns: 200 } }).runKey).toBe(ensSnap.runKey);
    // Identical captures share one mcKey deterministically.
    expect(snapshotAt({}).mcKey).toBe(ensSnap.mcKey);
  });

  it('names the changed dependency section — the WHY a result went stale', () => {
    const vehicle = vehicleWith([mountTube()]);
    const base = baseCase(vehicle);
    const ens = basicEnsemble();
    const stored = snapshotCase(preflight({ ...base, ensemble: ens }, {}));
    const at = (
      opts: { ensemble?: Partial<Omit<McEnsembleInput, 'wind'>>; wind?: Partial<McEnsembleInput['wind']> } = {},
    ) => {
      const wind: McEnsembleInput['wind'] = {
        probeAltitudeM: ens.wind.probeAltitudeM,
        windRows: ens.wind.windRows,
        soundingStatus: ens.wind.soundingStatus,
        soundingLayers: ens.wind.soundingLayers,
        ...(opts.wind ?? {}),
      };
      return snapshotCase(
        preflight(
          {
            ...base,
            ensemble: {
              nRuns: ens.nRuns,
              windAzimuthDegSigma: ens.windAzimuthDegSigma,
              railAngleDegSigma: ens.railAngleDegSigma,
              impulsePctSigma: ens.impulsePctSigma,
              ...(opts.ensemble ?? {}),
              wind,
            },
          },
          {},
        ),
      );
    };

    // Wind dependency (manual rows / probe / sounding) is reported before the
    // derived options slot it flows into.
    expect(snapshotDivergence(at({ wind: { windRows: [{ altitudeM: 0, speedMs: 9, directionFromDeg: 0 }] } }), stored)).toBe('ensemble-wind');
    expect(freshnessReasonLabel('ensemble-wind')).toMatch(/wind inputs changed/);
    expect(snapshotDivergence(at({ wind: { soundingStatus: 'ok', soundingLayers: [soundingLayer()] } }), stored)).toBe('ensemble-wind');

    // Run count / sigmas share the perturbation section.
    expect(snapshotDivergence(at({ ensemble: { nRuns: 200 } }), stored)).toBe('ensemble-perturbation');
    expect(snapshotDivergence(at({ ensemble: { windAzimuthDegSigma: 7 } }), stored)).toBe('ensemble-perturbation');
    expect(freshnessReasonLabel('ensemble-perturbation')).toMatch(/run count or sigma/);

    // A same-ID motor content edit reports the motor section.
    const editedMotor: MotorSpec = { ...CERTIFIED_MOTORS.estes_c6, designation: 'Edited C6' };
    const motorEdited = snapshotCase(preflight({ ...base, motorId: 'estes_c6' }, { estes_c6: editedMotor }));
    expect(snapshotDivergence(motorEdited, stored)).toBe('motor');
    expect(freshnessReasonLabel('motor')).toMatch(/motor content/);

    // A vehicle geometry edit reports the vehicle section.
    const editedVehicle = vehicleWith([mountTube({ id: 'mount-2', length: 0.4 })]);
    const vehicleEdited = snapshotCase(preflight({ ...base, vehicle: editedVehicle }, {}));
    expect(snapshotDivergence(vehicleEdited, stored)).toBe('vehicle');

    // Identical captures diverge on nothing.
    expect(snapshotDivergence(stored, stored)).toBeNull();
    expect(freshnessReasonLabel(null)).toBeNull();
  });
});
