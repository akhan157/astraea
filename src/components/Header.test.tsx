/**
 * Header durable-project controls (adapter matrix rows 1-2, S3-lite durable save).
 *
 * Pins the user-visible half of the durable slot: Save commits a validated
 * envelope to browser storage, Open restores it into the store, an empty slot
 * says so, corrupt bytes surface an inline alert instead of being clobbered,
 * and a commit based on a stale revision is refused with a visible reason.
 *
 * Each case begins by clearing the slot and clicking Open, which is exactly how
 * the session's revision base syncs to the stored document in the real app.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Header } from './Header';
import { useRocketStore, PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { createProjectEnvelope, writeProject } from '../formats/projectJson';
import { PROJECT_STORAGE_KEY } from '../formats/projectStorage';
import type { RocketVehicle } from '../core/types';

const OTHER_VEHICLE: RocketVehicle = {
  ...PRESET_ESTES_ALPHA,
  id: 'durable-header-1',
  name: 'Durable Header Rocket',
};

const statusText = (kind: 'ok' | 'error') =>
  document.querySelector(`[data-project-status="${kind}"]`)?.textContent ?? '';

const clickOpen = () => fireEvent.click(screen.getByTitle(/Open the project saved in this browser/));
const clickSave = () => fireEvent.click(screen.getByTitle(/Save the current project/));

beforeEach(() => {
  localStorage.clear();
  const store = useRocketStore.getState();
  store.resetStore();
  store.setVehicle(OTHER_VEHICLE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Header durable project controls', () => {
  it('saves the current vehicle to browser storage and reports the revision', async () => {
    render(<Header />);
    clickOpen(); // empty slot: base 0
    await waitFor(() => expect(statusText('ok')).toMatch(/No project saved/));

    clickSave();
    await waitFor(() => expect(statusText('ok')).toMatch(/Saved locally \(revision 1\)/));

    const stored = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) as string);
    expect(stored.schemaVersion).toBe('1.0.0');
    expect(stored.revision).toBe(1);
    expect(stored.vehicle.name).toBe('Durable Header Rocket');
    expect(statusText('error')).toBe('');
  });

  it('opens the stored project back into the vehicle store', async () => {
    render(<Header />);
    clickOpen();
    await waitFor(() => expect(statusText('ok')).toMatch(/No project saved/));
    clickSave();
    await waitFor(() => expect(statusText('ok')).toMatch(/Saved locally/));

    // Edit away from the saved state, then restore it from the durable slot.
    useRocketStore.getState().setVehicle({ ...OTHER_VEHICLE, name: 'Edited After Save' });
    clickOpen();

    await waitFor(() =>
      expect(useRocketStore.getState().vehicle.name).toBe('Durable Header Rocket'),
    );
    expect(statusText('ok')).toMatch(/Opened saved project \(revision 1\)/);
  });

  it('says the slot is empty instead of failing when nothing was saved', async () => {
    render(<Header />);
    clickOpen();
    await waitFor(() =>
      expect(statusText('ok')).toMatch(/No project saved in this browser yet/),
    );
    expect(statusText('error')).toBe('');
  });

  it('surfaces corrupt stored bytes as an inline alert and never overwrites them', async () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, '{ not a project');
    render(<Header />);

    clickOpen();
    await waitFor(() => expect(statusText('error')).toMatch(/Open failed: Invalid project/));

    clickSave();
    await waitFor(() => expect(statusText('error')).toMatch(/Save failed: Invalid project/));
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBe('{ not a project');
  });

  it('refuses a save whose base revision is behind a newer stored commit', async () => {
    render(<Header />);
    clickOpen(); // syncs the base to the (empty) slot
    await waitFor(() => expect(statusText('ok')).toMatch(/No project saved/));

    // Another session commits a far-future revision behind this window's back.
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      writeProject(createProjectEnvelope({ vehicle: OTHER_VEHICLE, revision: 999 })),
    );
    clickSave();

    await waitFor(() => expect(statusText('error')).toMatch(/Save failed: stale write rejected/));
    // The newer commit is untouched.
    expect(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) as string).revision).toBe(999);
  });
});