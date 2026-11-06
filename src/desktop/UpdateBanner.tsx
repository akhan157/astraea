import { useEffect } from 'react';
import { checkForUpdates, dismissUpdate, installUpdate, restartUpdate, useUpdates } from './updates';

/** Offer a newer desktop version; renders nothing in a browser or when current. */
export function UpdateBanner() {
  const state = useUpdates((s) => s.state);
  useEffect(() => {
    void checkForUpdates();
  }, []);
  if (state.kind === 'idle' || state.kind === 'dismissed') return null;
  return (
    <div role="status" data-update-banner="true" className="flex shrink-0 items-center gap-3 px-3 py-2 text-[12px]"
      style={{ borderBottom: '1px solid rgba(110,231,247,.3)', background: 'rgba(10,40,48,.6)', color: '#BFF3FA' }}>
      {state.kind === 'available' && (
        <>
          <span>Astraea {state.version} is available.</span>
          <button className="rounded border px-2 py-0.5" onClick={() => void installUpdate()}>Install and restart</button>
          <button className="opacity-70" onClick={dismissUpdate}>Later</button>
        </>
      )}
      {state.kind === 'installing' && <span>Downloading Astraea {state.version}… the app restarts when it is installed.</span>}
      {state.kind === 'restart-required' && (
        <>
          <span>{state.restarting
            ? `Astraea ${state.version} is installed. Restarting…`
            : `Astraea ${state.version} is installed. Restart required.${state.message ? ` ${state.message}` : ''}`}</span>
          <button className="rounded border px-2 py-0.5" disabled={state.restarting} onClick={() => void restartUpdate()}>Restart app</button>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <span>Update failed: {state.message}</span>
          <button className="opacity-70" onClick={dismissUpdate}>Dismiss</button>
        </>
      )}
    </div>
  );
}
