/**
 * ThrustCurve panel outcomes: a manufacturer typed in any case is searched
 * as a manufacturer (the API refuses "Aerotech" but accepts "AeroTech"), an
 * answered search with nothing found reads "No motors … match", and a search
 * that never got an answer reads as a failure, never as "no matches".
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThrustCurvePanel } from './ThrustCurvePanel';
import { useProjectStore } from '../../../state/project';

vi.mock('../../../io/backend', () => ({ isNetworkOnline: () => true }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const status = () => document.querySelector('[data-thrustcurve-status]');
const search = (text: string) => {
  fireEvent.change(screen.getByLabelText('ThrustCurve search query'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Search/ }));
};

beforeEach(() => useProjectStore.getState().newProject());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ThrustCurve panel', () => {
  it('searches a manufacturer typed in lower case by its listed name', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/metadata.json')) return json({ manufacturers: [{ name: 'AeroTech', abbrev: 'AeroTech' }] });
      bodies.push(JSON.parse(String(init?.body)));
      return json({ matches: 1, results: [{ motorId: 'panel-k550w', manufacturer: 'AeroTech', designation: 'K550W', diameter: 54, length: 410, avgThrustN: 397, totImpulseNs: 1500, burnTimeS: 3.6, dataFiles: 2 }] });
    });
    render(<ThrustCurvePanel />);
    // A manufacturer plus a designation: one combined search.
    search('aerotech K550W');
    await screen.findByRole('button', { name: 'Import K550W' });
    expect(bodies[0]).toMatchObject({ manufacturer: 'AeroTech', designation: 'K550W' });
    // The manufacturer alone: a manufacturer search, with no designation sent.
    search('aerotech');
    await waitFor(() => expect(bodies.some((b) => b.manufacturer === 'AeroTech' && b.designation === undefined)).toBe(true));
  });

  it('says "no matches" only when every search answered', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ matches: 0, results: [] }));
    render(<ThrustCurvePanel />);
    search('Z9001');
    await waitFor(() => expect(status()?.getAttribute('data-thrustcurve-status')).toBe('empty'));
    expect(status()?.textContent).toMatch(/^No motors on ThrustCurve\.org match “Z9001” \(searched by designation/);
  });

  it('reports a failed request as a failure, not as no matches', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('busy', { status: 503, statusText: 'Service Unavailable' }));
    render(<ThrustCurvePanel />);
    search('Z9002');
    await waitFor(() => expect(status()?.getAttribute('data-thrustcurve-status')).toBe('error'));
    expect(status()?.textContent).toMatch(/Search failed, so this is not a “no matches” answer\./);
    expect(status()?.textContent).toMatch(/HTTP 503/);
    expect(status()?.textContent).not.toMatch(/No motors/);
  });
});
