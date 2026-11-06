/**
 * Review artifact: the console cannot import src/store or src/components, so
 * this documents the keeping of the console-only invariant while exercising
 * the design's motor-content key against a committed snapshot.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { MotorSpec } from '../../../propulsion/motorDatabase';
import { CERTIFIED_MOTORS } from '../../../propulsion/motorDatabase';
import { useProjectStore } from '../../../state/project';
import { designOf } from '../../design';
import { diffDesigns } from '../../diff';

const motor = (designation: string, maxThrust: number): MotorSpec => ({
  ...CERTIFIED_MOTORS.estes_c6,
  designation,
  maxThrust,
  thrustCurve: [
    { time: 0, thrust: 0 },
    { time: 1, thrust: maxThrust },
  ],
});

beforeEach(() => useProjectStore.getState().newProject());
afterEach(cleanup);

describe('motor content freshness (audit divergence 5)', () => {
  it('reports a change when a same-id motor is replaced with different content', () => {
    const key = 'estes_c6_2';
    const before = { id: key, motor: motor('Estes C6 clone', 20), provenance: { source: 'import' as const } };
    useProjectStore.setState((s) => ({
      motors: { ...s.motors, [key]: before },
      project: { ...s.project, workspace: { ...s.project.workspace, motorId: key } },
    }));

    const committed = useProjectStore.getState();
    const design = designOf(committed.project, committed.mission, committed.shearPa, undefined, committed.motors);

    // The same id now resolves to a replacement with a different curve.
    const replacement = motor('Estes C6 clone', 33);
    useProjectStore.setState((s) => ({ motors: { ...s.motors, [key]: { id: key, motor: replacement, provenance: { source: 'import' } } } }));
    const after = useProjectStore.getState();
    const next = designOf(after.project, after.mission, after.shearPa, undefined, after.motors);

    // Same id on both sides: the change is only visible through motor content.
    expect(design.motorId).toBe(next.motorId);
    expect(diffDesigns(design, next).some((c) => c.field === 'motorCurve' && c.input === 'motor')).toBe(true);
  });

  it('reports no motor change when the content is identical', () => {
    const store = useProjectStore.getState();
    const a = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
    const b = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
    expect(diffDesigns(a, b).some((c) => c.field === 'motorCurve')).toBe(false);
  });
});
