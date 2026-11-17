// @vitest-environment jsdom
/** This same assertion runs on the pin: without recovery startup it loses both archives. */
import { IDBFactory } from 'fake-indexeddb';
import { expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SimFlightOverlay } from '../console/evidence/SimFlightOverlay';
import { useProjectStore } from './project';
import { createIndexedDbBackend } from '../formats/projectStorage';

// Optional discovery lets the exact reload assertion execute on the pre-feature pin.
const recovery = import.meta.glob('./workingSession.ts');
it('recovers pasted overlay flights and their ledger across a reload', async () => {
  const module = recovery['./workingSession.ts'] ? await recovery['./workingSession.ts']() as typeof import('./workingSession') : null;
  const factory = new IDBFactory();
  const storage = () => createIndexedDbBackend('astraea.working-session.v1', factory);
  useProjectStore.getState().newProject();
  const first = await module?.startWorkingSession(storage());
  try {
    render(<SimFlightOverlay />);
    fireEvent.change(screen.getByLabelText(/flight log data/i), { target: { value: 'time_s,altitude_m\n0,0\n1,5\n2,0' } });
    fireEvent.click(screen.getByRole('button', { name: /add flight log/i }));
    await screen.findByLabelText(/layer flight 1/i);
    // Ledger hashing is asynchronous; wait on its observable entry.
    const { waitFor } = await import('@testing-library/react');
    await waitFor(() => expect(useProjectStore.getState().project.ledger).toHaveLength(1));
    await first?.flush(); first?.stop(); cleanup();
    useProjectStore.getState().newProject();
    const second = await module?.startWorkingSession(storage());
    try {
      expect(useProjectStore.getState().project.ledger).toHaveLength(1);
      render(<SimFlightOverlay />);
      expect(screen.getByLabelText(/layer flight 1/i)).toBeTruthy();
    } finally { second?.stop(); }
  } finally { first?.stop(); cleanup(); }
});
