/**
 * RIVAL S2 — run store freshness contract (Astra P0-1).
 *
 * Pins the unified four-field display (execution / validity / freshness /
 * gate) and the derived-freshness rule: a record's freshness comes from its
 * captured complete snapshot against the store's published current — never
 * from a stored marker and never from "a newer run finished". Historical
 * payloads are preserved: records are never rewritten by staleness.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { RocketVehicle } from '../core/types';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import {
  preflight,
  snapshotCase,
  type LaunchCase,
  type McEnsembleInput,
  type RunSnapshot,
} from '../application/caseResolver';
import { displayFor, nextRunId, resetRunIdCounter, useRunStore, type RunRecord } from './runStore';

function mountTube(): Record<string, unknown> {
  return {
    id: 'mount-1',
    name: 'Motor Mount',
    type: 'bodytube',
    length: 0.3,
    outerDiameter: 0.05,
    innerDiameter: 0.024,
    materialId: 'cardboard',
    isMotorMount: true,
  };
}

function vehicle(): RocketVehicle {
  return {
    id: 's2-vehicle',
    name: 'S2 Store Vehicle',
    version: '1.0',
    author: 'S2',
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
      mountTube() as unknown as RocketVehicle['components'][number],
    ],
  };
}

function caseWith(ensemble: McEnsembleInput | undefined): LaunchCase {
  return {
    vehicle: vehicle(),
    motorId: 'estes_c6',
    options: {
      railLengthM: 2.4,
      railElevationDeg: 85,
      railAzimuthDeg: 0,
      // The studio derives the sim wind slot from the captured wind table.
      windSpeedMps: ensemble?.wind.windRows[0]?.speedMs ?? 0,
      windAzimuthDeg: ensemble?.wind.windRows[0]?.directionFromDeg ?? 0,
      finCantDeg: 0,
      mainDeployAltitudeM: 150,
    },
    ...(ensemble ? { ensemble } : {}),
  };
}

function ensemble(windSpeedMs = 0): McEnsembleInput {
  return {
    nRuns: 50,
    windAzimuthDegSigma: 5,
    railAngleDegSigma: 1,
    impulsePctSigma: 3,
    wind: {
      probeAltitudeM: 0,
      windRows: [{ altitudeM: 0, speedMs: windSpeedMs, directionFromDeg: 0 }],
      soundingStatus: 'idle',
      soundingLayers: [],
    },
  };
}

function snapshotOf(ens: McEnsembleInput | undefined): RunSnapshot {
  return snapshotCase(preflight(caseWith(ens), { estes_c6: CERTIFIED_MOTORS.estes_c6 }));
}

function record(snapshot?: RunSnapshot, freshness: 'current' | 'stale' = 'current'): RunRecord {
  return {
    runId: nextRunId(),
    runKey: snapshot?.runKey ?? 'legacy-key',
    caseId: 's2-vehicle::estes_c6',
    lifecycle: 'completed',
    valid: true,
    freshness,
    gate: 'unknown',
    label: 'MC 50 · estes_c6',
    ...(snapshot ? { snapshot } : {}),
  };
}

beforeEach(() => {
  useRunStore.getState().resetRuns();
  resetRunIdCounter();
});

describe('runStore displayFor — four separate fields', () => {
  it('labels execution / validity / freshness / gate as four fields', () => {
    const out = displayFor(record());
    expect(out.fields.execution).toEqual({ status: 'info', label: 'Execution: Executed' });
    expect(out.fields.validity).toEqual({ status: 'pass', label: 'Validity: Valid' });
    expect(out.fields.freshness).toEqual({ status: 'pass', label: 'Freshness: Current' });
    expect(out.fields.gate).toEqual({ status: 'unknown', label: 'Gate: unknown' });
    expect(out.staleReason).toBeNull();
  });

  it('keeps an invalid record invalid and a failed execution failed', () => {
    const invalid = displayFor({ ...record(), valid: false });
    const failed = displayFor({ ...record(), lifecycle: 'failed' });
    expect(invalid.fields.validity.label).toBe('Validity: Invalid');
    expect(failed.fields.execution.label).toBe('Execution: Failed');
    expect(failed.status.status).toBe('fail');
    expect(failed.status.isPass).toBe(false);
  });

  it('falls back to the stored freshness marker only when nothing is published', () => {
    expect(displayFor(record(undefined, 'stale')).fields.freshness.label).toBe(
      'Freshness: Stale',
    );
  });

  it('reflects gate outcomes distinctly', () => {
    expect(displayFor({ ...record(), gate: 'pass' }).fields.gate.label).toBe('Gate: Pass');
    expect(displayFor({ ...record(), gate: 'fail' }).fields.gate.label).toBe('Gate: Fail');
  });
});

describe('runStore displayFor — derived freshness from the published snapshot', () => {
  it('stales on a full-snapshot edit and restores on undo-to-identical', () => {
    const fresh = snapshotOf(ensemble(0));
    const windEdited = snapshotOf(ensemble(6));
    useRunStore.getState().publishSnapshot(fresh);
    const committed = record(fresh);
    useRunStore.getState().recordAttempt(committed);

    expect(displayFor(committed).fields.freshness.label).toBe('Freshness: Current');
    // MC records carry no gate evaluation: qualifies as unknown, not pass.
    expect(displayFor(committed).status.label).toBe('No gate evaluated');

    // Wind edit: EVERY display of this record turns stale with a reason —
    // no rerun required, no record rewrite.
    useRunStore.getState().publishSnapshot(windEdited);
    const stale = displayFor(committed);
    expect(stale.fields.freshness.label).toBe(
      'Freshness: Stale — wind inputs changed (manual table / probe / sounding)',
    );
    expect(stale.status.status).toBe('stale');
    expect(stale.status.isPass).toBe(false);
    // The historical payload was preserved verbatim.
    expect(useRunStore.getState().records[0].snapshot).toBe(committed.snapshot);

    // Undo-to-identical: the original full key is current again.
    useRunStore.getState().publishSnapshot(fresh);
    expect(displayFor(committed).fields.freshness.label).toBe('Freshness: Current');
  });

  it('reports run-count and sigma edits as the perturbation reason', () => {
    const base = snapshotOf(ensemble(0));
    useRunStore.getState().publishSnapshot(base);
    const committed = record(base);
    useRunStore.getState().recordAttempt(committed);

    useRunStore.getState().publishSnapshot(snapshotOf({ ...ensemble(), nRuns: 200 }));
    expect(displayFor(committed).staleReason).toBe('run count or sigma changed');

    useRunStore.getState().publishSnapshot(snapshotOf({ ...ensemble(), windAzimuthDegSigma: 9 }));
    expect(displayFor(committed).staleReason).toBe('run count or sigma changed');
  });

  it('compares legacy records (no captured snapshot) at the case key level', () => {
    const current = snapshotOf(ensemble(0));
    // A FlightSim/legacy record carries only the case-level runKey.
    const legacy = { ...record(), runKey: current.runKey, snapshot: undefined };
    useRunStore.getState().publishSnapshot(current);
    expect(displayFor(legacy).fields.freshness.label).toBe('Freshness: Current');

    const edited = snapshotOf(ensemble(6)); // derived wind changed ⇒ case key too
    useRunStore.getState().publishSnapshot(edited);
    expect(displayFor(legacy).fields.freshness.label).toBe(
      'Freshness: Stale — stored inputs differ from the current case',
    );
    expect(displayFor(legacy).staleReason).toBe('stored inputs differ from the current case');
  });

  it('an explicit current override beats the published snapshot', () => {
    const a = snapshotOf(ensemble(0));
    const b = snapshotOf(ensemble(6));
    useRunStore.getState().publishSnapshot(b);
    const committed = record(a);
    useRunStore.getState().recordAttempt(committed);
    expect(displayFor(committed, a).fields.freshness.label).toBe('Freshness: Current');
    expect(displayFor(committed).fields.freshness.label).toContain('Stale');
  });

  it('resetRuns clears the published current sense', () => {
    useRunStore.getState().publishSnapshot(snapshotOf(ensemble(0)));
    expect(useRunStore.getState().currentSnapshot).not.toBeNull();
    useRunStore.getState().resetRuns();
    expect(useRunStore.getState().currentSnapshot).toBeNull();
  });
});