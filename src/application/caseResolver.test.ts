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
  isSnapshotStale,
  motorContentKey,
  preflight,
  reasonMotorExcluded,
  resolveMotor,
  snapshotCase,
  type LaunchCase,
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
});
