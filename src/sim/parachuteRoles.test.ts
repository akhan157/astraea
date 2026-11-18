/**
 * Plan #9: explicit parachute roles. The TS mirror must pick exactly what the
 * engine's `recovery_chutes` picks (crates/astraea-engine/src/models.rs, tested
 * there with the same cases), keep the list-order rule when no role is set, and
 * make a role change a new run identity while an absent role keeps old keys.
 */
import { describe, expect, it } from 'vitest';
import type { ParachuteComponent, RocketComponent, RocketVehicle } from '../core/types';
import { PRESET_ESTES_ALPHA, PRESET_NASA_STUDENT_LAUNCH } from '../state/presets';
import { chuteEvents, recoveryChutes, resolveRecoveryChutes } from './parachuteRoles';
import { simulateFlight } from './flightSimulator';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { hashHex, preflight, snapshotCase, stableStringify } from '../application/caseResolver';
import { createProjectEnvelope, readProject, writeProject } from '../formats/projectJson';
import { DEFAULT_WORKSPACE } from '../application/workspace';

const chute = (id: string, diameter: number, deployRole?: ParachuteComponent['deployRole']): ParachuteComponent => ({
  id, name: id, type: 'parachute', diameter, cd: 0.8, mass: 0.02, axialOffset: 0.05, materialId: 'cardboard',
  ...(deployRole === undefined ? {} : { deployRole }),
});
const TUBE: RocketComponent = { id: 'tube', name: 'Tube', type: 'bodytube', length: 0.5, outerDiameter: 0.05, innerDiameter: 0.047, materialId: 'cardboard' };
const picked = (components: RocketComponent[]) => {
  const r = recoveryChutes(components);
  return [r.drogue?.id ?? null, r.main?.id ?? null];
};

describe('recovery chute selection', () => {
  it('keeps the list-order rule when no chute declares a role', () => {
    expect(picked([TUBE, chute('a', 0.3), chute('b', 0.9)])).toEqual(['a', 'b']);
    expect(picked([TUBE, chute('a', 0.3)])).toEqual(['a', 'a']);
    expect(picked([TUBE])).toEqual([null, null]);
    // A third chute was never flown, and still is not.
    expect(picked([TUBE, chute('a', 0.3), chute('b', 0.9), chute('c', 1.2)])).toEqual(['a', 'b']);
  });

  it('lets a declared role win over list order', () => {
    expect(picked([TUBE, chute('big', 0.9, 'main'), chute('small', 0.3, 'drogue')])).toEqual(['small', 'big']);
    // One declared role: the other slot takes the automatic chute.
    expect(picked([TUBE, chute('a', 0.3), chute('b', 0.9, 'drogue')])).toEqual(['b', 'a']);
    expect(picked([TUBE, chute('a', 0.9, 'main'), chute('b', 0.3)])).toEqual(['b', 'a']);
    expect(picked([TUBE, chute('a', 0.3, 'drogue'), chute('b', 0.9)])).toEqual(['a', 'b']);
  });

  it('flies a lone declared chute only at its own event', () => {
    expect(picked([TUBE, chute('a', 0.3, 'main')])).toEqual([null, 'a']);
    expect(picked([TUBE, chute('a', 0.3, 'drogue')])).toEqual(['a', null]);
  });

  it('refuses two chutes in one role and an unknown role, with the engine wording', () => {
    expect(resolveRecoveryChutes([chute('a', 0.3, 'main'), chute('b', 0.9, 'main')])).toEqual({
      ok: false,
      reason: "parachutes 'a' and 'b' are both set as the main; a flight opens one main -- set one of them to the other role or to automatic",
      clash: { role: 'main', chutes: [chute('a', 0.3, 'main'), chute('b', 0.9, 'main')] },
    });
    expect(() => recoveryChutes([chute('a', 0.3, 'reserve' as never)])).toThrow("prepareVehicle: parachute 'a': deployRole 'reserve' is not 'drogue' or 'main'");
  });

  it('names the events each chute opens at', () => {
    const one = chute('a', 0.3);
    expect(chuteEvents(one, recoveryChutes([one]))).toEqual(['drogue', 'main']);
    const spare = chute('c', 1);
    const roles = recoveryChutes([chute('a', 0.3), chute('b', 0.9), spare]);
    expect(chuteEvents(spare, roles)).toEqual([]);
  });

  it('drives the legacy simulator: a declared main swaps the descent canopy', () => {
    // Alpha has one chute; add a second big one listed FIRST but declared main.
    const base = PRESET_ESTES_ALPHA;
    const small = base.components.find((c): c is ParachuteComponent => c.type === 'parachute');
    if (!small) throw new Error('alpha has no parachute');
    const others = base.components.filter((c) => c.type !== 'parachute');
    const big = chute('big', 1.2);
    const order = (a: ParachuteComponent, b: ParachuteComponent): RocketVehicle => ({ ...base, components: [...others, a, b] });
    const motor = CERTIFIED_MOTORS.estes_c6;
    const landing = (v: RocketVehicle) => {
      const run = simulateFlight(v, motor, { mainDeployAltitudeAGL: 1e4 });
      return run.telemetry[run.telemetry.length - 1].velocity;
    };
    // Main deploys immediately after apogee (deploy altitude above apogee), so
    // the landing speed is set by whichever chute is the main.
    const bigMainByOrder = landing(order(small, big));
    const bigMainByRole = landing(order({ ...big, deployRole: 'main' }, small));
    const smallMainByOrder = landing(order(big, small));
    expect(bigMainByRole).toBeCloseTo(bigMainByOrder, 9);
    expect(Math.abs(smallMainByOrder)).toBeGreaterThan(Math.abs(bigMainByOrder));
  });
});

describe('run identity and the project file carry the role', () => {
  const nasa = (): RocketVehicle => structuredClone(PRESET_NASA_STUDENT_LAUNCH);
  const keys = (vehicle: RocketVehicle) => {
    const resolved = preflight({
      vehicle,
      motorId: 'aerotech_k550w',
      options: {
        railLengthM: 3, railElevationDeg: 90, railAzimuthDeg: 0, windSpeedMps: 0, windAzimuthDeg: 0, finCantDeg: 0, mainDeployAltitudeM: 213,
      },
    }, CERTIFIED_MOTORS);
    expect(resolved.runnable).toBe(true);
    const snapshot = snapshotCase(resolved);
    return { runKey: snapshot.runKey, vehicleContentKey: snapshot.vehicleContentKey };
  };

  it('stales results on a role change and keeps old keys when the role is absent', () => {
    const plain = nasa();
    const before = keys(plain);
    // An explicit `undefined` (a cleared role) is the absent role: same keys.
    const cleared = nasa();
    cleared.components = cleared.components.map((c) => (c.type === 'parachute' ? { ...c, deployRole: undefined } : c));
    expect(keys(cleared)).toEqual(before);
    expect(hashHex(stableStringify(cleared))).toBe(hashHex(stableStringify(plain)));

    const declared = nasa();
    const firstChute = declared.components.findIndex((c) => c.type === 'parachute');
    declared.components[firstChute] = { ...(declared.components[firstChute] as ParachuteComponent), deployRole: 'drogue' };
    const after = keys(declared);
    expect(after.runKey).not.toBe(before.runKey);
    expect(after.vehicleContentKey).not.toBe(before.vehicleContentKey);
  });

  it('round-trips a declared role through the project file and refuses an unknown one', () => {
    const vehicle = nasa();
    const index = vehicle.components.findIndex((c) => c.type === 'parachute');
    vehicle.components[index] = { ...(vehicle.components[index] as ParachuteComponent), deployRole: 'main' };
    const text = writeProject(createProjectEnvelope({ vehicle, workspace: DEFAULT_WORKSPACE }));
    const back = readProject(text);
    expect(back.vehicle.components[index]).toMatchObject({ deployRole: 'main' });
    // No role written for the automatic chutes: old files and new files agree.
    const other = back.vehicle.components.find((c, i) => c.type === 'parachute' && i !== index);
    expect(other && 'deployRole' in other).toBe(false);

    const bad = JSON.parse(text);
    bad.vehicle.components[index].deployRole = 'reserve';
    expect(() => readProject(JSON.stringify(bad))).toThrow(/deployRole must be one of drogue, main/);
  });
});

describe('preflight', () => {
  it('blocks a run with a role clash before dispatch, naming the repair', () => {
    const vehicle = structuredClone(PRESET_NASA_STUDENT_LAUNCH);
    const options = { railLengthM: 3, railElevationDeg: 90, railAzimuthDeg: 0, windSpeedMps: 0, windAzimuthDeg: 0, finCantDeg: 0, mainDeployAltitudeM: 213 };
    expect(preflight({ vehicle, motorId: 'aerotech_k550w', options }, CERTIFIED_MOTORS).runnable).toBe(true);
    vehicle.components = vehicle.components.map((c) => (c.type === 'parachute' ? { ...c, deployRole: 'main' as const } : c));
    const blocked = preflight({ vehicle, motorId: 'aerotech_k550w', options }, CERTIFIED_MOTORS);
    expect(blocked.runnable).toBe(false);
    expect(blocked.issues).toEqual([{
      code: 'parachute-roles',
      severity: 'error',
      message: 'Drogue Parachute (Apogee) and Main Parachute (700ft AGL) are both set as the main parachute; a flight opens one main. Set one of them to the other role or to Automatic',
      repair: { studio: 'airframe', target: 'parachute roles' },
    }]);
  });
});
