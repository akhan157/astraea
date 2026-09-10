import { describe, it, expect, beforeEach } from 'vitest';
import { useRocketStore, PRESET_ESTES_ALPHA } from './rocketStore';
import { BodyTubeComponent, NoseconeComponent } from '../core/types';

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
