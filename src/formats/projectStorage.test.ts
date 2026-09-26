/**
 * Durable project storage (adapter matrix rows 1-2, S3-lite durable save).
 *
 * Pins the browser backend contract: revision stamping across saves, the
 * stale-base refusal when another session committed first, and fail-closed
 * behavior on corrupt stored bytes and on missing storage.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createDurableProject, createStorageBackend, PROJECT_STORAGE_KEY } from './projectStorage';
import { createProjectEnvelope, InvalidProjectError, StaleRevisionError } from './projectJson';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import type { RocketVehicle } from '../core/types';

const VEHICLE: RocketVehicle = { ...PRESET_ESTES_ALPHA, id: 'durable-1', name: 'Durable Rocket' };

beforeEach(() => {
  localStorage.clear();
});

describe('createStorageBackend', () => {
  it('reads and writes the raw document under the given key', () => {
    const backend = createStorageBackend('test.slot');
    expect(backend.read()).toBeNull();
    backend.write('{"hello":1}');
    expect(backend.read()).toBe('{"hello":1}');
    expect(localStorage.getItem('test.slot')).toBe('{"hello":1}');
  });

  it('surfaces a storage write failure instead of pretending the save succeeded', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const backend = createStorageBackend('test.slot', failing);
    expect(() => backend.write('x')).toThrow(/durable project storage write failed: QuotaExceededError/);
  });

  it('reports missing storage rather than returning an empty project', () => {
    const backend = createStorageBackend('test.slot', undefined);
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    // Simulate an environment without storage (the module reads it lazily).
    delete (globalThis as { localStorage?: unknown }).localStorage;
    try {
      expect(() => backend.read()).toThrow(/no localStorage/);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });
});

describe('createDurableProject', () => {
  it('reports an empty slot and stamps revision 1 on the first save', () => {
    const project = createDurableProject();
    expect(project.load()).toBeNull();
    expect(project.baseRevision()).toBe(0);

    const committed = project.save(createProjectEnvelope({ vehicle: VEHICLE }));
    expect(committed.revision).toBe(1);
    expect(project.baseRevision()).toBe(1);

    const reloaded = project.load();
    expect(reloaded?.revision).toBe(1);
    expect(reloaded?.vehicle.name).toBe('Durable Rocket');
  });

  it('advances the revision on each commit and keeps the vehicle', () => {
    const project = createDurableProject();
    project.save(createProjectEnvelope({ vehicle: VEHICLE }));
    const second = project.save(
      createProjectEnvelope({ vehicle: { ...VEHICLE, name: 'Renamed Rocket' } }),
    );
    expect(second.revision).toBe(2);
    expect(project.load()?.vehicle.name).toBe('Renamed Rocket');
  });

  it('refuses a save whose base revision is behind another session commit', () => {
    const mine = createDurableProject();
    const otherTab = createDurableProject();
    mine.load(); // base 0
    otherTab.save(createProjectEnvelope({ vehicle: VEHICLE })); // stored revision 1

    // My base is still 0, so my commit must be rejected, never silently merged.
    expect(() => mine.save(createProjectEnvelope({ vehicle: VEHICLE }))).toThrow(StaleRevisionError);
    expect(otherTab.load()?.vehicle.name).toBe(VEHICLE.name);
  });

  it('fails closed on corrupt stored bytes instead of overwriting them', () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, '{ not a project');
    const project = createDurableProject();
    expect(() => project.load()).toThrow(InvalidProjectError);
    expect(() => project.save(createProjectEnvelope({ vehicle: VEHICLE }))).toThrow(
      InvalidProjectError,
    );
    // The corrupt bytes are still there — nothing was clobbered.
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBe('{ not a project');
  });
});