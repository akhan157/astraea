import { describe, it, expect, beforeEach } from 'vitest';
import { useRocketStore, PRESET_ESTES_ALPHA } from './rocketStore';
import { BodyTubeComponent, NoseconeComponent } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';

describe('RocketStore (Zustand & History)', () => {
  beforeEach(() => {
    useRocketStore.getState().resetStore();
  });

  it('initializes with default vehicle and valid stability analysis', () => {
    const state = useRocketStore.getState();
    expect(state.vehicle.name).toBe('Estes Alpha III Replica');
    expect(state.stability.totalLength).toBeGreaterThan(0.4);
    expect(state.stability.isStable).toBe(true);
    expect(state.history.length).toBe(0);
    expect(state.future.length).toBe(0);
  });

  it('updates a component dimension and recalculates stability', () => {
    const state = useRocketStore.getState();
    const ncId = state.vehicle.components[0].id;
    const originalLength = state.stability.totalLength;

    // Extend nosecone length by 100mm
    state.updateComponent(ncId, { length: 0.265 });

    const updatedState = useRocketStore.getState();
    expect(updatedState.stability.totalLength).toBeCloseTo(originalLength + 0.1, 3);
    expect(updatedState.history.length).toBe(1);
  });

  it('handles undo and redo correctly', () => {
    const state = useRocketStore.getState();
    const ncId = state.vehicle.components[0].id;

    // Step 1: Update
    state.updateComponent(ncId, { length: 0.25 });
    expect((useRocketStore.getState().vehicle.components[0] as NoseconeComponent).length).toBe(0.25);
    expect(useRocketStore.getState().history.length).toBe(1);

    // Step 2: Undo
    useRocketStore.getState().undo();
    expect((useRocketStore.getState().vehicle.components[0] as NoseconeComponent).length).toBe(
      (PRESET_ESTES_ALPHA.components[0] as NoseconeComponent).length
    );
    expect(useRocketStore.getState().future.length).toBe(1);

    // Step 3: Redo
    useRocketStore.getState().redo();
    expect((useRocketStore.getState().vehicle.components[0] as NoseconeComponent).length).toBe(0.25);
  });

  it('selects the shared flight motor by id and resets it to the C6 default', () => {
    const state = useRocketStore.getState();
    expect(state.selectedMotorId).toBe('estes_c6');
    state.selectMotor('cesaroni_i205');
    expect(useRocketStore.getState().selectedMotorId).toBe('cesaroni_i205');
    useRocketStore.getState().resetStore();
    expect(useRocketStore.getState().selectedMotorId).toBe('estes_c6');
  });

  it('registers imported custom motors by id without touching vehicle history', () => {
    const state = useRocketStore.getState();
    const historyLen = state.history.length;
    state.importCustomMotor({
      id: 'test_custom_h128',
      designation: 'Test H128',
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
    const updated = useRocketStore.getState();
    expect(updated.customMotors['test_custom_h128']?.designation).toBe('Test H128');
    expect(updated.history.length).toBe(historyLen);
  });

  it('re-importing an id with a different designation suffixes _2/_3 instead of overwriting', () => {
    const state = useRocketStore.getState();
    const base = {
      id: 'test_custom_h128',
      designation: 'Test H128',
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
    };
    state.importCustomMotor(base);
    // Same id, different designation: must NOT overwrite the original.
    state.importCustomMotor({ ...base, designation: 'Test H128 v2' });
    let st = useRocketStore.getState();
    expect(st.customMotors['test_custom_h128']?.designation).toBe('Test H128');
    expect(st.customMotors['test_custom_h128_2']?.designation).toBe('Test H128 v2');
    // Third distinct designation walks to _3.
    state.importCustomMotor({ ...base, designation: 'Test H128 v3' });
    st = useRocketStore.getState();
    expect(st.customMotors['test_custom_h128']?.designation).toBe('Test H128');
    expect(st.customMotors['test_custom_h128_2']?.designation).toBe('Test H128 v2');
    expect(st.customMotors['test_custom_h128_3']?.designation).toBe('Test H128 v3');
    expect(Object.keys(st.customMotors).length).toBe(3);
    // Same id + same designation replaces in place (identical re-import).
    state.importCustomMotor({ ...base, designation: 'Test H128', manufacturer: 'TestWorks2' });
    st = useRocketStore.getState();
    expect(st.customMotors['test_custom_h128']?.manufacturer).toBe('TestWorks2');
    expect(Object.keys(st.customMotors).length).toBe(3);
    expect(st.history.length).toBe(0);
  });

  it('adds and removes components properly', () => {
    const state = useRocketStore.getState();
    const initialCount = state.vehicle.components.length;

    const newTube: BodyTubeComponent = {
      id: 'extra-tube',
      name: 'Payload Extension',
      type: 'bodytube',
      length: 0.20,
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      materialId: 'cardboard',
    };

    state.addComponent(newTube);
    expect(useRocketStore.getState().vehicle.components.length).toBe(initialCount + 1);

    state.removeComponent('extra-tube');
    expect(useRocketStore.getState().vehicle.components.length).toBe(initialCount);
  });
});

describe('custom motor upsert & import (C8)', () => {
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

  it('upserts by normalized id without touching vehicle history', () => {
    const state = useRocketStore.getState();
    const historyLen = state.history.length;
    state.upsertCustomMotor(motorWith('Custom H128!', 'Custom H128'));
    const st = useRocketStore.getState();
    expect(st.customMotors['custom_h128']?.designation).toBe('Custom H128');
    expect(st.customMotors['custom_h128']?.id).toBe('custom_h128');
    expect(Object.keys(st.customMotors)).not.toContain('Custom H128!');
    expect(st.history.length).toBe(historyLen);
  });

  it('replaces the same normalized-key record even with a different designation (no _2 suffix)', () => {
    const state = useRocketStore.getState();
    state.upsertCustomMotor(motorWith('upsert_same', 'First'));
    state.upsertCustomMotor(motorWith('Upsert.Same!', 'Replacement'));
    const st = useRocketStore.getState();
    expect(st.customMotors['upsert_same']?.designation).toBe('Replacement');
    expect(st.customMotors['upsert_same_2']).toBeUndefined();
  });

  it('stores a copy of the caller record, never an alias', () => {
    const state = useRocketStore.getState();
    const m = motorWith('upsert_copy', 'Copy Test');
    state.upsertCustomMotor(m);
    m.designation = 'Mutated After Upsert';
    expect(useRocketStore.getState().customMotors['upsert_copy']?.designation).toBe('Copy Test');
  });

  it('normalizes an empty/blank id to the imported_motor fallback', () => {
    const state = useRocketStore.getState();
    state.upsertCustomMotor(motorWith('', 'Blank Id'));
    expect(useRocketStore.getState().customMotors['imported_motor']?.designation).toBe('Blank Id');
  });

  it('importCustomMotor applies the suffix policy on normalized ids and keeps import behavior', () => {
    const state = useRocketStore.getState();
    state.importCustomMotor(motorWith('Added Custom!', 'Added Custom'));
    state.importCustomMotor(motorWith('Added.Custom_', 'Added Custom v2'));
    let st = useRocketStore.getState();
    expect(st.customMotors['added_custom']?.designation).toBe('Added Custom');
    expect(st.customMotors['added_custom_2']?.designation).toBe('Added Custom v2');
    // Same normalized id + same designation replaces in place.
    state.importCustomMotor(motorWith('Added Custom!', 'Added Custom'));
    st = useRocketStore.getState();
    expect(Object.keys(st.customMotors).filter((k) => k.startsWith('added_custom')).length).toBe(2);
  });
});
