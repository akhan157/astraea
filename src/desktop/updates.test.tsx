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

  it('reminds to save first and links the release notes with the offer', async () => {
    fakeTauri({ version: '1.0.5' });
    render(<UpdateBanner />);
    expect(await screen.findByText('Astraea 1.0.5 is available.')).toBeTruthy();
    expect(screen.getByText('Save your project first: the app restarts to install it.')).toBeTruthy();
    expect(screen.getByRole('link', { name: "What's new" }).getAttribute('href')).toBe('https://github.com/akhan157/astraea/releases/tag/v1.0.5');
  });

  it('shows download progress as whole percents while installing', async () => {
    const gate = deferred();
    (window as unknown as Scope).__TAURI__ = {
      updater: { check: async () => ({ version: '1.0.3', downloadAndInstall: async (onEvent?: (e: unknown) => void) => {
        onEvent?.({ event: 'Started', data: { contentLength: 1000 } });
        onEvent?.({ event: 'Progress', data: { chunkLength: 250 } });
        onEvent?.({ event: 'Progress', data: { chunkLength: 1 } });
        await gate.promise;
      } }) },
      process: { relaunch: async () => undefined },
    };
    render(<UpdateBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install and restart' }));
    expect(await screen.findByText('Downloading Astraea 1.0.3… 25 %. The app restarts when it is installed.')).toBeTruthy();
    gate.resolve();
    await waitFor(() => expect(useUpdates.getState().state.kind).toBe('restart-required'));
  });

  it('keeps the plain downloading text when the size is unknown', async () => {
    const gate = deferred();
    (window as unknown as Scope).__TAURI__ = {
      updater: { check: async () => ({ version: '1.0.4', downloadAndInstall: async (onEvent?: (e: unknown) => void) => {
        onEvent?.({ event: 'Started', data: {} });
        onEvent?.({ event: 'Progress', data: { chunkLength: 500 } });
        await gate.promise;
      } }) },
      process: { relaunch: async () => undefined },
    };
    render(<UpdateBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install and restart' }));
    expect(await screen.findByText('Downloading Astraea 1.0.4… the app restarts when it is installed.')).toBeTruthy();
    gate.resolve();
    await waitFor(() => expect(useUpdates.getState().state.kind).toBe('restart-required'));
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
