/**
 * Desktop updates: the app checks the signed release feed once per launch
 * and offers the new version; nothing installs without the user's click.
 * In a browser (no Tauri updater global) this is inert.
 */
import { create } from 'zustand';

interface TauriUpdate {
  version: string;
  downloadAndInstall(onEvent?: (event: { event: string }) => void): Promise<void>;
}

interface TauriUpdaterGlobals {
  updater?: { check(): Promise<TauriUpdate | null> };
  process?: { relaunch(): Promise<void> };
}

function tauri(): TauriUpdaterGlobals | null {
  if (typeof window === 'undefined') return null;
  const scope = (window as unknown as { __TAURI__?: TauriUpdaterGlobals }).__TAURI__;
  return scope?.updater ? scope : null;
}

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'available'; version: string }
  | { kind: 'installing'; version: string }
  | { kind: 'restart-required'; version: string; restarting: boolean; message?: string }
  | { kind: 'error'; message: string }
  | { kind: 'dismissed' };

interface UpdateStore {
  state: UpdateState;
  update: TauriUpdate | null;
}

export const useUpdates = create<UpdateStore>(() => ({ state: { kind: 'idle' }, update: null }));

let checked = false;

/** Check the release feed once per launch (desktop only). Failures stay quiet unless the user acted. */
export async function checkForUpdates(): Promise<void> {
  const api = tauri();
  if (!api?.updater || checked) return;
  checked = true;
  try {
    const update = await api.updater.check();
    if (update) useUpdates.setState({ state: { kind: 'available', version: update.version }, update });
  } catch {
    // Offline or no published release yet: nothing to offer.
  }
}

export async function installUpdate(): Promise<void> {
  const { state, update } = useUpdates.getState();
  const api = tauri();
  if (!update || !api || (state.kind !== 'available' && state.kind !== 'error')) return;
  if (typeof api.process?.relaunch !== 'function') {
    useUpdates.setState({ state: { kind: 'error', message: 'Restart is unavailable. Update was not installed.' } });
    return;
  }
  // Set synchronously: another click or direct invocation must not start a second install.
  useUpdates.setState({ state: { kind: 'installing', version: update.version } });
  try {
    await update.downloadAndInstall();
  } catch (err) {
    useUpdates.setState({ state: { kind: 'error', message: err instanceof Error ? err.message : String(err) } });
    return;
  }
  // The payload has been applied. Any subsequent action must only retry restart.
  useUpdates.setState({ state: { kind: 'restart-required', version: update.version, restarting: false }, update: null });
  await restartUpdate();
}

export async function restartUpdate(): Promise<void> {
  const { state } = useUpdates.getState();
  if (state.kind !== 'restart-required' || state.restarting) return;
  const api = tauri();
  if (typeof api?.process?.relaunch !== 'function') {
    useUpdates.setState({ state: { ...state, message: 'Restart is unavailable. Close and reopen Astraea.' } });
    return;
  }
  useUpdates.setState({ state: { kind: 'restart-required', version: state.version, restarting: true } });
  try {
    await api.process.relaunch();
    // A resolved call is not proof of process exit; stay busy until native restart.
  } catch (err) {
    useUpdates.setState({ state: {
      kind: 'restart-required', version: state.version, restarting: false,
      message: err instanceof Error ? err.message : String(err),
    } });
  }
}

export function dismissUpdate(): void {
  const { state } = useUpdates.getState();
  if (state.kind === 'available' || state.kind === 'error') {
    useUpdates.setState({ state: { kind: 'dismissed' } });
  }
}

/** Test seam. */
export function resetUpdateCheck(): void {
  checked = false;
  useUpdates.setState({ state: { kind: 'idle' }, update: null });
}
