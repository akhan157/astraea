// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import type { RocketVehicle } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { analysisFreshness, useAnalysisStore } from './analysis';
import {
  effectiveVehicle,
  effectiveWorkspace,
  resolveMotorSpec,
  serializeProject,
  stagedCount,
  totalStagedCount,
  useProjectStore,
} from './project';
import { readProject } from '../formats/projectJson';
import { DEFAULT_WORKSPACE } from '../application/workspace';

beforeEach(() => {
  useProjectStore.getState().newProject();
  useAnalysisStore.getState().reset();
});
describe('project store staged edits', () => {
  const noseId = (): string => {
    const comp = useProjectStore.getState().project.vehicle.components.find((c) => c.type === 'nosecone');
    if (!comp) throw new Error('preset has no nosecone');
    return comp.id;
  };
  const noseLengthOf = (vehicle: RocketVehicle): number => {
    const comp = vehicle.components.find((c) => c.type === 'nosecone');
    if (!comp || !('length' in comp)) throw new Error('preset has no nosecone length');
    return comp.length;
  };

  it('stages a component patch without touching committed state', () => {
    const id = noseId();
    const before = noseLengthOf(useProjectStore.getState().project.vehicle);
    let staged = false;
    act(() => {
      staged = useProjectStore.getState().stageComponents('airframe', id, { length: 0.5 });
    });
    expect(staged).toBe(true);
    expect(noseLengthOf(useProjectStore.getState().project.vehicle)).toBe(before);
    expect(noseLengthOf(effectiveVehicle('airframe'))).toBe(0.5);
    expect(noseLengthOf(effectiveVehicle('aero'))).toBe(before);
    expect(stagedCount('airframe')).toBe(1);
    expect(totalStagedCount()).toBe(1);
  });

  it('rejects non-finite staged values instead of clamping them', () => {
    let staged = true;
    act(() => {
      staged = useProjectStore.getState().stageComponents('airframe', noseId(), { length: NaN });
    });
    expect(staged).toBe(false);
    expect(stagedCount('airframe')).toBe(0);
  });

  it('applies a staged workspace edit as one undoable entry and reverts the rest', () => {
    // The undo baseline is whatever the seeded project carries (the store
    // opens on the NASA Student Launch template), not the bare default.
    const baselineRail = useProjectStore.getState().project.workspace.launch.railLengthM;
    const launchPatch = { ...DEFAULT_WORKSPACE.launch, railLengthM: 5 };
    act(() => {
      useProjectStore.getState().stageWorkspace('trajectory', { launch: launchPatch });
      useProjectStore.getState().applyStudio('trajectory');
    });
    expect(useProjectStore.getState().project.workspace.launch.railLengthM).toBe(5);
    expect(stagedCount('trajectory')).toBe(0);
    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.workspace.launch.railLengthM).toBe(baselineRail);
    act(() => {
      useProjectStore.getState().redo();
    });
    expect(useProjectStore.getState().project.workspace.launch.railLengthM).toBe(5);
  });

  it('reverts a studio draft without touching committed state', () => {
    act(() => {
      useProjectStore.getState().stageComponents('airframe', noseId(), { length: 0.9 });
      useProjectStore.getState().revertStudio('airframe');
    });
    expect(stagedCount('airframe')).toBe(0);
    expect(noseLengthOf(effectiveVehicle('airframe'))).not.toBe(0.9);
  });

  it('keeps per-studio drafts independent', () => {
    const launchPatch = { ...DEFAULT_WORKSPACE.launch, railLengthM: 5 };
    act(() => {
      useProjectStore.getState().stageComponents('airframe', noseId(), { length: 0.5 });
      useProjectStore.getState().stageWorkspace('trajectory', { launch: launchPatch });
      useProjectStore.getState().applyStudio('airframe');
    });
    expect(stagedCount('airframe')).toBe(0);
    expect(stagedCount('trajectory')).toBe(5);
    expect(effectiveWorkspace('trajectory').launch.railLengthM).toBe(5);
  });

  it('refuses to stage a patch for a component id the project does not carry', () => {
    let staged = true;
    act(() => {
      staged = useProjectStore.getState().stageComponents('airframe', 'no-such-component', { length: 0.5 });
    });
    expect(staged).toBe(false);
    expect(stagedCount('airframe')).toBe(0);
    expect(Object.keys(useProjectStore.getState().drafts.airframe.components)).toHaveLength(0);
  });

  it('stages a multi-component patch atomically and rejects the whole set when one entry is invalid', () => {
    const nose = noseId();
    const tube = useProjectStore.getState().project.vehicle.components.find((c) => c.type === 'bodytube');
    if (!tube) throw new Error('preset has no body tube');
    let staged = true;
    act(() => {
      staged = useProjectStore.getState().stageComponentPatches('airframe', [
        { id: nose, patch: { length: 0.5 } },
        { id: 'no-such-component', patch: { length: 0.2 } },
      ]);
    });
    expect(staged).toBe(false);
    expect(stagedCount('airframe')).toBe(0);
    expect(Object.keys(useProjectStore.getState().drafts.airframe.components)).toHaveLength(0);

    act(() => {
      staged = useProjectStore.getState().stageComponentPatches('airframe', [
        { id: nose, patch: { length: 0.5 } },
        { id: tube.id, patch: { length: NaN } },
      ]);
    });
    expect(staged).toBe(false);
    expect(stagedCount('airframe')).toBe(0);

    act(() => {
      staged = useProjectStore.getState().stageComponentPatches('airframe', [
        { id: nose, patch: { length: 0.5 } },
        { id: tube.id, patch: { length: 0.4 } },
      ]);
    });
    expect(staged).toBe(true);
    const stagedVehicle = effectiveVehicle('airframe');
    const stagedNose = stagedVehicle.components.find((c) => c.id === nose);
    const stagedTube = stagedVehicle.components.find((c) => c.id === tube.id);
    expect(stagedNose !== undefined && 'length' in stagedNose ? stagedNose.length : undefined).toBe(0.5);
    expect(stagedTube !== undefined && 'length' in stagedTube ? stagedTube.length : undefined).toBe(0.4);
  });

  it('drops a staged patch when its component is staged for removal instead of resurrecting it', () => {
    const id = noseId();
    act(() => {
      expect(useProjectStore.getState().stageComponents('airframe', id, { length: 0.5 })).toBe(true);
      expect(useProjectStore.getState().stageRemoveComponent('airframe', id)).toBe(true);
      useProjectStore.getState().applyStudio('airframe');
    });
    expect(useProjectStore.getState().project.vehicle.components.some((c) => c.id === id)).toBe(false);
    expect(effectiveVehicle('airframe').components.some((c) => c.id === id)).toBe(false);
    expect(stagedCount('airframe')).toBe(0);
    expect(useProjectStore.getState().past).toHaveLength(1);
  });

  it('drops a staged patch when the component was removed from the committed project', () => {
    const id = noseId();
    act(() => {
      expect(useProjectStore.getState().stageComponents('airframe', id, { length: 0.5 })).toBe(true);
      useProjectStore.getState().commitStructural('Remove part', (project) => ({
        ...project,
        vehicle: { ...project.vehicle, components: project.vehicle.components.filter((c) => c.id !== id) },
      }));
      useProjectStore.getState().applyStudio('airframe');
    });
    expect(useProjectStore.getState().project.vehicle.components.some((c) => c.id === id)).toBe(false);
    expect(effectiveVehicle('airframe').components.some((c) => c.id === id)).toBe(false);
    expect(stagedCount('airframe')).toBe(0);
  });
});

describe('project store motor records', () => {
  const spec = (id: string, designation: string): MotorSpec => ({
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
      { time: 0.7, thrust: 200 },
      { time: 1.4, thrust: 0 },
    ],
  });

  it('registers a motor and binds it without touching vehicle history', () => {
    const historyLen = useProjectStore.getState().past.length;
    let key = '';
    act(() => {
      key = useProjectStore.getState().addMotorRecord(
        { id: 'test_custom_h128', motor: spec('test_custom_h128', 'Test H128'), provenance: { source: 'import' } },
        'Import motor Test H128',
      );
    });
    const st = useProjectStore.getState();
    expect(key).toBe('test_custom_h128');
    expect(st.project.workspace.motorId).toBe('test_custom_h128');
    expect(st.motors['test_custom_h128']?.motor.designation).toBe('Test H128');
    expect(st.past.length).toBe(historyLen + 1);
  });

  it('suffixes a colliding designation instead of overwriting the record', () => {
    act(() => {
      useProjectStore.getState().addMotorRecord(
        { id: 'Test H128', motor: spec('Test H128', 'Test H128'), provenance: { source: 'import' } },
        'Import motor Test H128',
      );
      useProjectStore.getState().addMotorRecord(
        { id: 'Test H128', motor: spec('Test H128', 'Test H128 v2'), provenance: { source: 'import' } },
        'Import motor Test H128 v2',
      );
    });
    const st = useProjectStore.getState();
    expect(st.motors['test_h128']?.motor.designation).toBe('Test H128');
    expect(st.motors['test_h128_2']?.motor.designation).toBe('Test H128 v2');
    expect(st.project.workspace.motorId).toBe('test_h128_2');
    // Re-importing the v2 record replaces it in place, no `_3` leak.
    act(() => {
      useProjectStore.getState().addMotorRecord(
        { id: 'Test H128', motor: { ...spec('Test H128', 'Test H128 v2'), manufacturer: 'TestWorks2' }, provenance: { source: 'import' } },
        'Import motor Test H128 v2',
      );
    });
    const after = useProjectStore.getState();
    expect(after.motors['test_h128_2']?.motor.manufacturer).toBe('TestWorks2');
    expect(after.motors['test_h128_3']).toBeUndefined();
  });

  it('stores a copy of the imported motor, never an alias', () => {
    const motor = spec('alias_check', 'Alias Check');
    act(() => {
      useProjectStore.getState().addMotorRecord({ id: 'alias_check', motor, provenance: { source: 'import' } }, 'Import');
    });
    motor.designation = 'Mutated After Import';
    expect(useProjectStore.getState().motors['alias_check']?.motor.designation).toBe('Alias Check');
  });

  it('undoes the registration and its binding together', () => {
    const before = useProjectStore.getState().project.workspace.motorId;
    act(() => {
      useProjectStore.getState().addMotorRecord(
        { id: 'undo_check', motor: spec('undo_check', 'Undo Check'), provenance: { source: 'import' } },
        'Import motor Undo Check',
      );
    });
    expect(useProjectStore.getState().project.workspace.motorId).toBe('undo_check');
    act(() => {
      useProjectStore.getState().undo();
    });
    expect(useProjectStore.getState().project.workspace.motorId).toBe(before);
    expect(useProjectStore.getState().motorRecords().some((r) => r.id === 'undo_check')).toBe(false);
    expect(readProject(serializeProject()).motorRecords.some((r) => r.id === 'undo_check')).toBe(false);
    act(() => {
      useProjectStore.getState().redo();
    });
    expect(useProjectStore.getState().project.workspace.motorId).toBe('undo_check');
    expect(useProjectStore.getState().motorRecords().some((r) => r.id === 'undo_check')).toBe(true);
  });

  it('restores the effective and saved thrust curve through undo and redo', () => {
    const motorId = useProjectStore.getState().project.workspace.motorId;
    const effective = () => resolveMotorSpec(motorId, useProjectStore.getState().motors);
    const saved = () => readProject(serializeProject()).motorRecords.find((r) => r.id === motorId)?.motor;
    const original = structuredClone(effective()!.thrustCurve);
    const changed = original.map((point) => ({ ...point, thrust: point.thrust * 0.9 }));

    useProjectStore.getState().stageCurve('propulsion', motorId, changed);
    useProjectStore.getState().applyStudio('propulsion');
    expect(effective()?.thrustCurve).toEqual(changed);
    expect(saved()?.thrustCurve).toEqual(changed);

    useProjectStore.getState().undo();
    expect(effective()?.thrustCurve).toEqual(original);
    expect(saved()?.thrustCurve).toEqual(original);
    useProjectStore.getState().redo();
    expect(effective()?.thrustCurve).toEqual(changed);
    expect(saved()?.thrustCurve).toEqual(changed);
  });

  it('undoes a same-designation motor replacement before saving and restores it on redo', () => {
    const original = spec('replace_check', 'Replace Check');
    const replacement = { ...original, manufacturer: 'Updated Manufacturer' };
    useProjectStore.getState().addMotorRecord({ id: original.id, motor: original, provenance: { source: 'import' } }, 'Import');
    useProjectStore.getState().addMotorRecord({ id: original.id, motor: replacement, provenance: { source: 'import' } }, 'Replace');
    const saved = () => readProject(serializeProject()).motorRecords.find((r) => r.id === original.id)?.motor;
    expect(saved()?.manufacturer).toBe(replacement.manufacturer);
    useProjectStore.getState().undo();
    expect(resolveMotorSpec(original.id, useProjectStore.getState().motors)?.manufacturer).toBe(original.manufacturer);
    expect(saved()?.manufacturer).toBe(original.manufacturer);
    useProjectStore.getState().redo();
    expect(saved()?.manufacturer).toBe(replacement.manufacturer);
  });

  it('exposes the effective records (project envelope overlaid with the registry)', () => {
    act(() => {
      useProjectStore.getState().addMotorRecord(
        { id: 'visible_check', motor: spec('visible_check', 'Visible Check'), provenance: { source: 'import' } },
        'Import',
      );
    });
    expect(useProjectStore.getState().motorRecords().some((r) => r.id === 'visible_check')).toBe(true);
  });
});

describe('analysis store freshness', () => {
  it('marks a record stale when committed inputs change under it', () => {
    let token = 0;
    act(() => {
      token = useAnalysisStore.getState().start('flight', 'key-1');
      useAnalysisStore.getState().resolve('flight', token, { apogee: 100 });
    });
    const record = useAnalysisStore.getState().records.flight;
    expect(analysisFreshness(record, 'key-1')).toBe('current');
    expect(analysisFreshness(record, 'key-2')).toBe('stale');
  });

  it('discards a late response that lost the token race', () => {
    let first = 0;
    let second = 0;
    act(() => {
      first = useAnalysisStore.getState().start('flight', 'key-1');
      second = useAnalysisStore.getState().start('flight', 'key-2');
      useAnalysisStore.getState().resolve('flight', first, { apogee: 1 });
    });
    const record = useAnalysisStore.getState().records.flight;
    expect(record?.token).toBe(second);
    expect(record?.payload).toBeNull();
    act(() => {
      useAnalysisStore.getState().resolve('flight', second, { apogee: 2 });
    });
    expect(useAnalysisStore.getState().records.flight?.payload).toEqual({ apogee: 2 });
  });

  it('reports unknown with no record and running while active', () => {
    expect(analysisFreshness(null, 'key-1')).toBe('unknown');
    let token = 0;
    act(() => {
      token = useAnalysisStore.getState().start('ensemble', 'key-1');
    });
    expect(analysisFreshness(useAnalysisStore.getState().records.ensemble, 'key-1')).toBe('running');
    act(() => {
      useAnalysisStore.getState().reject('ensemble', token, 'backend down');
    });
    expect(analysisFreshness(useAnalysisStore.getState().records.ensemble, 'key-1')).toBe('failed');
  });
});
