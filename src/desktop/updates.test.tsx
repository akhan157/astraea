// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UpdateBanner } from './UpdateBanner';
import { checkForUpdates, dismissUpdate, installUpdate, resetUpdateCheck, restartUpdate, useUpdates } from './updates';

type Scope = { __TAURI__?: unknown };

function fakeTauri(
  update: { version: string } | null,
  install: () => Promise<void> = async () => undefined,
  relaunch: () => Promise<void> = async () => undefined,
) {
  const log: string[] = [];
  (window as unknown as Scope).__TAURI__ = {
    updater: {
      check: async () => {
        log.push('check');
        return update && { ...update, downloadAndInstall: async () => { log.push('install'); await install(); } };
      },
    },
    process: { relaunch: async () => { log.push('relaunch'); await relaunch(); } },
  };
  return log;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as Scope).__TAURI__;
  resetUpdateCheck();
});

describe('desktop updates', () => {
  it('does nothing in a browser', async () => {
    const { container } = render(<UpdateBanner />);
    await Promise.resolve();
    expect(container.innerHTML).toBe('');
    expect(useUpdates.getState().state.kind).toBe('idle');
  });

  it('offers a newer version and installs only on request', async () => {
    const log = fakeTauri({ version: '1.0.1' });
    render(<UpdateBanner />);
    expect(await screen.findByText('Astraea 1.0.1 is available.')).toBeTruthy();
    expect(log).toEqual(['check']);
    fireEvent.click(screen.getByRole('button', { name: 'Install and restart' }));
    await waitFor(() => expect(log).toEqual(['check', 'install', 'relaunch']));
  });

  it('stays quiet when already current, and reports a failed install', async () => {
    fakeTauri(null);
    const { container } = render(<UpdateBanner />);
    await waitFor(() => expect(useUpdates.getState().state.kind).toBe('idle'));
    expect(container.innerHTML).toBe('');
    cleanup();
    resetUpdateCheck();
    const log = fakeTauri({ version: '1.0.2' }, async () => { throw new Error('signature mismatch'); });
    render(<UpdateBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install and restart' }));
    expect(await screen.findByText('Update failed: signature mismatch')).toBeTruthy();
    expect(log).toEqual(['check', 'install']);
  });

  it('stays quiet on an offline check and checks only once', async () => {
    let checks = 0;
    (window as unknown as Scope).__TAURI__ = { updater: { check: async () => {
      checks++;
      throw new Error('offline');
    } } };
    const { container } = render(<UpdateBanner />);
    await act(async () => { await checkForUpdates(); });
    expect(checks).toBe(1);
    expect(container.innerHTML).toBe('');
    expect(useUpdates.getState().state.kind).toBe('idle');
  });

  it('defers before installation', async () => {
    const log = fakeTauri({ version: '1.0.1' });
    render(<UpdateBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Later' }));
    expect(log).toEqual(['check']);
    expect(useUpdates.getState().state.kind).toBe('dismissed');
    await act(async () => { await installUpdate(); });
    expect(log).toEqual(['check']);
  });

  it('guards concurrent install calls and dismissal while installation is pending', async () => {
    const pending = deferred();
    const log = fakeTauri({ version: '1.0.1' }, () => pending.promise);
    await checkForUpdates();
    const first = installUpdate();
    dismissUpdate();
    await installUpdate();
    expect(useUpdates.getState().state.kind).toBe('installing');
    expect(log).toEqual(['check', 'install']);
    pending.resolve();
    await first;
    await installUpdate();
    expect(log).toEqual(['check', 'install', 'relaunch']);
    expect(useUpdates.getState().update).toBeNull();
  });

  it.each([undefined, {}, { relaunch: 'not callable' }])('refuses installation without a callable restart API (%j)', async (process) => {
    const log = fakeTauri({ version: '1.0.1' });
    const scope = (window as unknown as { __TAURI__: { process: unknown } }).__TAURI__;
    scope.process = process;
    render(<UpdateBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install and restart' }));
    expect(await screen.findByText('Update failed: Restart is unavailable. Update was not installed.')).toBeTruthy();
    expect(log).toEqual(['check']);
  });

  it('reports an applied update after restart failure and retries only restart', async () => {
    const pendingRestart = deferred();
    let attempts = 0;
    const log = fakeTauri({ version: '1.0.1' }, async () => undefined, async () => {
      if (++attempts === 1) throw new Error('restart denied');
      await pendingRestart.promise;
    });
    render(<UpdateBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install and restart' }));
    expect(await screen.findByText('Astraea 1.0.1 is installed. Restart required. restart denied')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install and restart' })).toBeNull();
    expect(useUpdates.getState().update).toBeNull();
    await act(async () => { await installUpdate(); });
    expect(log).toEqual(['check', 'install', 'relaunch']);
    fireEvent.click(screen.getByRole('button', { name: 'Restart app' }));
    await act(async () => {
      dismissUpdate();
      await restartUpdate();
      await installUpdate();
    });
    expect(log).toEqual(['check', 'install', 'relaunch', 'relaunch']);
    expect((screen.getByRole('button', { name: 'Restart app' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Astraea 1.0.1 is installed. Restarting…')).toBeTruthy();
    await act(async () => { pendingRestart.resolve(); });
    expect(useUpdates.getState().state).toEqual({ kind: 'restart-required', version: '1.0.1', restarting: true });
  });

  it('preserves restart-required when the restart API disappears after installation', async () => {
    const log = fakeTauri({ version: '1.0.1' }, async () => {
      delete (window as unknown as { __TAURI__: { process?: unknown } }).__TAURI__.process;
    });
    await checkForUpdates();
    await installUpdate();
    expect(log).toEqual(['check', 'install']);
    expect(useUpdates.getState().state).toEqual({
      kind: 'restart-required', version: '1.0.1', restarting: false,
      message: 'Restart is unavailable. Close and reopen Astraea.',
    });
    await installUpdate();
    expect(log).toEqual(['check', 'install']);
  });

});
