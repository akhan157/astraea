/**
 * Motor record policy: the import/upsert rules the legacy
 * `store/rocketStore.ts` tests pinned, now shared by every Console path.
 * Ported from `store/rocketStore.test.ts` (custom motor upsert & import).
 */
import { describe, expect, it } from 'vitest';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { MotorRecord } from '../formats/projectJson';
import { copyMotor, importMotorKey, mergeMotorRecords } from './motors';

const motorWith = (id: string, designation: string): MotorSpec => ({
  id,
  designation,
  manufacturer: 'TestWorks',
  impulseClass: 'H',
  diameter: 0.029,
  length: 0.2,
  totalImpulse: 180,
  avgThrust: 128,
  maxThrust: 200,
  burnTime: 1.4,
  propellantMass: 0.1,
  totalMass: 0.2,
  dryMass: 0.1,
  thrustCurve: [
    { time: 0, thrust: 0 },
    { time: 1.4, thrust: 0 },
  ],
});

const record = (motor: MotorSpec, source: MotorRecord['provenance']['source'] = 'import'): MotorRecord => ({
  id: motor.id,
  motor,
  provenance: { source },
});

describe('importMotorKey', () => {
  it('normalizes the id when the key is free', () => {
    expect(importMotorKey(motorWith('Custom H128!', 'Custom H128'), [])).toBe('custom_h128');
  });

  it('falls back to imported_motor for a blank id', () => {
    expect(importMotorKey(motorWith('', 'Blank Id'), [])).toBe('imported_motor');
  });

  it('suffixes _2/_3 on an id collision with a different designation', () => {
    const base = motorWith('Test H128', 'Test H128');
    const records = [record(base)];
    expect(importMotorKey(motorWith('Test H128', 'Test H128 v2'), records)).toBe('test_h128_2');
    const withTwo = [...records, record(motorWith('test_h128_2', 'Test H128 v2'))];
    expect(importMotorKey(motorWith('Test H128', 'Test H128 v3'), withTwo)).toBe('test_h128_3');
  });

  it('is idempotent: re-importing a suffixed motor replaces it in place', () => {
    // Records already land on normalized keys, as the allocator minted them.
    const records = [
      record(motorWith('idem_h128', 'Idem H128')),
      record(motorWith('idem_h128_2', 'Idem H128 v2')),
    ];
    expect(importMotorKey(motorWith('Idem H128', 'Idem H128 v2'), records)).toBe('idem_h128_2');
    expect(importMotorKey(motorWith('Idem H128', 'Idem H128'), records)).toBe('idem_h128');
    // A genuinely new designation still allocates the next suffix.
    expect(importMotorKey(motorWith('Idem H128', 'Idem H128 v3'), records)).toBe('idem_h128_3');
  });

  it('applies the suffix policy to normalized ids', () => {
    const records = [record(motorWith('added_custom', 'Added Custom'))];
    // 'Added.Custom_' normalizes onto the taken key, different designation.
    expect(importMotorKey(motorWith('Added.Custom_', 'Added Custom v2'), records)).toBe('added_custom_2');
  });

  it('never lands an import on a certified id', () => {
    // A simfile whose designation collides with a certified record must not
    // shadow it: the import takes the next free suffix instead.
    const collision = motorWith('estes_c6', 'Estes C6');
    expect(importMotorKey(collision, [])).toBe('estes_c6_2');
    expect(CERTIFIED_MOTORS.estes_c6?.designation).toBe('Estes C6');
  });
});

describe('copyMotor', () => {
  it('stores a copy of the caller record, never an alias', () => {
    const m = motorWith('upsert_copy', 'Copy Test');
    const stored = copyMotor(m);
    m.designation = 'Mutated After Upsert';
    m.thrustCurve[0].thrust = 99;
    expect(stored.designation).toBe('Copy Test');
    expect(stored.thrustCurve[0].thrust).toBe(0);
    expect(stored).not.toBe(m);
  });
});

describe('mergeMotorRecords', () => {
  it('lets the project overlay win on a shared normalized id', () => {
    const base = [record(motorWith('shared', 'Certified'), 'certified')];
    const overlay = { shared: record(motorWith('shared', 'Imported')) };
    const merged = mergeMotorRecords(base, overlay);
    expect(merged).toHaveLength(1);
    expect(merged[0].motor.designation).toBe('Imported');
  });
});
