/**
 * Global drop-import disclosure (B trust pass): a failed drop import
 * surfaces as an inline role=alert banner — the onReport disclosure path —
 * never window.alert(...) and never a dialog. Pins the no-modal acceptance
 * posture at every entry point (enterprise critique #6: rival App.tsx:55
 * was the only modal-style alert in either shell).
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App';
import { useRocketStore } from './store/rocketStore';
import { useWorkspaceStore } from './store/workspaceStore';
import { useRunStore } from './store/runStore';
import { useEditBufferStore } from './store/editBufferStore';

beforeEach(() => {
  useRocketStore.getState().resetStore();
  useWorkspaceStore.getState().selectStudio('airframe');
  useRunStore.getState().resetRuns();
  useEditBufferStore.getState().discardAll();
});

const dropBrokenJson = (root: HTMLElement) => {
  fireEvent.drop(root, {
    dataTransfer: { files: [new File(['{"broken": '], 'broken.json', { type: 'application/json' })] },
  });
};

const dropJson = (root: HTMLElement, body: string, name = 'project.astraea.json') => {
  fireEvent.drop(root, {
    dataTransfer: { files: [new File([body], name, { type: 'application/json' })] },
  });
};



/** A minimal validated envelope for the drop path (envelope reader contract). */
function validEnvelopeJson(name: string): string {
  return JSON.stringify({
    schemaVersion: '1.0.0',
    revision: 1,
    vehicle: {
      id: 'dropped-1',
      name,
      version: '1.0',
      author: 'Drop Test',
      components: [
        {
          id: 'nc-drop',
          name: 'Nosecone',
          type: 'nosecone',
          shape: 'vonkarman',
          length: 0.3,
          baseDiameter: 0.1,
          wallThickness: 0.002,
          isHollow: true,
          materialId: 'fiberglass',
        },
      ],
    },
    motorRecords: [],
    bindings: [],
    cases: [],
    snapshots: [],
    evidenceRefs: [],
  });
}

describe('App drop-import disclosure', () => {
  it('reports a failed drop-import inline (role=alert banner), never window.alert or a dialog', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { container } = render(<App />);
    dropBrokenJson(container.firstElementChild as HTMLElement);

    await waitFor(() => expect(document.querySelector('[data-drop-import-error]')).toBeTruthy());
    expect(document.querySelector('[data-drop-import-error]')?.textContent).toMatch(/Could not load broken\.json/);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dismisses the disclosure banner and clears only that report', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { container } = render(<App />);
    dropBrokenJson(container.firstElementChild as HTMLElement);

    await waitFor(() => expect(document.querySelector('[data-drop-import-error]')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Dismiss disclosure'));
    await waitFor(() => expect(document.querySelector('[data-drop-import-error]')).toBeNull());
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('loads a versioned envelope dropped as JSON into the vehicle store', async () => {
    const { container } = render(<App />);
    dropJson(container.firstElementChild as HTMLElement, validEnvelopeJson('Envelope Dropped'));

    await waitFor(() => expect(useRocketStore.getState().vehicle.name).toBe('Envelope Dropped'));
    expect(useRocketStore.getState().vehicle.id).toBe('dropped-1');
    expect(document.querySelector('[data-drop-import-error]')).toBeNull();
  });

  it('fails closed on a JSON document the envelope reader rejects (unknown schema version)', async () => {
    const { container } = render(<App />);
    dropJson(
      container.firstElementChild as HTMLElement,
      JSON.stringify({ schemaVersion: '99.0.0', vehicle: { components: [] } }),
    );

    await waitFor(() => expect(document.querySelector('[data-drop-import-error]')).toBeTruthy());
    expect(document.querySelector('[data-drop-import-error]')?.textContent).toMatch(
      /no migration|neither a versioned project envelope/,
    );
  });
});
