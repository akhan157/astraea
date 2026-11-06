/**
 * Durable project storage (adapter matrix rows 1-2, S3-lite durable save).
 *
 * Pins both backends: IndexedDB (the default, read-check-write in one
 * transaction) and localStorage (fallback where IndexedDB is missing).
 * Contract for each: revision stamping across saves, the stale-base refusal
 * when another session committed first, and fail-closed behavior on corrupt
 * stored bytes and on missing storage. Also pins reading an older
 * localStorage save through the IndexedDB backend.
 */
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDurableProject,
  createIndexedDbBackend,
  createStorageBackend,
  defaultProjectBackend,
  PROJECT_STORAGE_KEY,
} from './projectStorage';
import { createProjectEnvelope, InvalidProjectError, StaleRevisionError, writeProject, type ProjectBackend } from './projectJson';
import { PRESET_ESTES_ALPHA } from '../state/presets';
import type { RocketVehicle } from '../core/types';

const VEHICLE: RocketVehicle = { ...PRESET_ESTES_ALPHA, id: 'durable-1', name: 'Durable Rocket' };

let idb: IDBFactory;

beforeEach(() => {
  localStorage.clear();
  idb = new IDBFactory();
});

describe('createStorageBackend (localStorage)', () => {
  it('reads and writes the raw document under the given key', async () => {
    const backend = createStorageBackend('test.slot');
    expect(await backend.read()).toBeNull();
    await backend.update(() => '{"hello":1}');
    expect(await backend.read()).toBe('{"hello":1}');
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
    expect(() => backend.update(() => 'x')).toThrow(/durable project storage write failed: QuotaExceededError/);
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

describe('createIndexedDbBackend', () => {
  it('stores a document far beyond the localStorage quota', async () => {
    const backend = createIndexedDbBackend('big', idb);
    const big = 'x'.repeat(20_000_000);
    await backend.update(() => big);
    expect(((await backend.read()) as string).length).toBe(big.length);
  });

  it('leaves the stored document untouched when the update throws', async () => {
    const backend = createIndexedDbBackend('slot', idb);
    await backend.update(() => 'kept');
    await expect(
      backend.update(() => {
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');
    expect(await backend.read()).toBe('kept');
  });

  it('reports a missing IndexedDB rather than an empty project', async () => {
    const original = (globalThis as { indexedDB?: unknown }).indexedDB;
    delete (globalThis as { indexedDB?: unknown }).indexedDB;
    try {
      await expect(createIndexedDbBackend('slot').read()).rejects.toThrow(/no IndexedDB/);
    } finally {
      (globalThis as { indexedDB?: unknown }).indexedDB = original;
    }
  });

  it('reads an older localStorage save until the first IndexedDB save carries it over', async () => {
    const legacy = writeProject(createProjectEnvelope({ vehicle: VEHICLE, revision: 4 }));
    localStorage.setItem(PROJECT_STORAGE_KEY, legacy);
    const project = createDurableProject(createIndexedDbBackend(PROJECT_STORAGE_KEY, idb, () => localStorage.getItem(PROJECT_STORAGE_KEY)));
    const opened = await project.load();
    expect(opened?.revision).toBe(4);
    expect(opened?.vehicle.name).toBe('Durable Rocket');
    const saved = await project.save(createProjectEnvelope({ vehicle: { ...VEHICLE, name: 'Moved' } }));
    expect(saved.revision).toBe(5);
    // Later reads come from IndexedDB; the old slot is left as it was.
    expect((await project.load())?.vehicle.name).toBe('Moved');
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBe(legacy);
  });

  it('is the default backend wherever IndexedDB exists', async () => {
    await createDurableProject(defaultProjectBackend('default.slot')).save(createProjectEnvelope({ vehicle: VEHICLE }));
    expect(localStorage.getItem('default.slot')).toBeNull();
    expect((await createDurableProject(defaultProjectBackend('default.slot')).load())?.revision).toBe(1);
  });
});

describe.each([
  ['IndexedDB', () => createIndexedDbBackend(PROJECT_STORAGE_KEY, idb)],
  ['localStorage', () => createStorageBackend(PROJECT_STORAGE_KEY)],
] as Array<[string, () => ProjectBackend]>)('createDurableProject over %s', (_name, backend) => {
  it('reports an empty slot and stamps revision 1 on the first save', async () => {
    const project = createDurableProject(backend());
    expect(await project.load()).toBeNull();
    expect(project.baseRevision()).toBe(0);

    const committed = await project.save(createProjectEnvelope({ vehicle: VEHICLE }));
    expect(committed.revision).toBe(1);
    expect(project.baseRevision()).toBe(1);

    const reloaded = await project.load();
    expect(reloaded?.revision).toBe(1);
    expect(reloaded?.vehicle.name).toBe('Durable Rocket');
  });

  it('advances the revision on each commit and keeps the vehicle', async () => {
    const project = createDurableProject(backend());
    await project.save(createProjectEnvelope({ vehicle: VEHICLE }));
    const second = await project.save(createProjectEnvelope({ vehicle: { ...VEHICLE, name: 'Renamed Rocket' } }));
    expect(second.revision).toBe(2);
    expect((await project.load())?.vehicle.name).toBe('Renamed Rocket');
  });

  it('refuses a save whose base revision is behind another session commit', async () => {
    const mine = createDurableProject(backend());
    const otherTab = createDurableProject(backend());
    await mine.load(); // base 0
    await otherTab.save(createProjectEnvelope({ vehicle: VEHICLE })); // stored revision 1

    // My base is still 0, so my commit must be rejected, never silently merged.
    await expect(mine.save(createProjectEnvelope({ vehicle: { ...VEHICLE, name: 'Mine' } }))).rejects.toThrow(StaleRevisionError);
    expect((await otherTab.load())?.vehicle.name).toBe(VEHICLE.name);
  });

  it('fails closed on corrupt stored bytes instead of overwriting them', async () => {
    const b = backend();
    await b.update(() => '{ not a project');
    const project = createDurableProject(b);
    await expect(project.load()).rejects.toThrow(InvalidProjectError);
    await expect(project.save(createProjectEnvelope({ vehicle: VEHICLE }))).rejects.toThrow(InvalidProjectError);
    // The corrupt bytes are still there — nothing was clobbered.
    expect(await b.read()).toBe('{ not a project');
  });
});
