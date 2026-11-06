/**
 * Verify → "Share this flight", in the Workstation with the stubbed native
 * bridge (jsdom has no WebGL): the imported log survives leaving Verify and
 * coming back, is dropped when the project is replaced, and the exported zip
 * holds the log's exact bytes. The required answers cannot be skipped.
 */
// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useThree: () => ({ camera: { position: { set: () => undefined } }, size: { width: 1, height: 1 }, controls: null }),
  useFrame: () => undefined,
}));
vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Grid: () => null,
  GizmoHelper: () => null,
  GizmoViewcube: () => null,
}));

import Workstation from '../Workstation';
import { consoleJobStub, resetConsoleState, stubEngine } from '../testFixtures';
import { useSessionStore, type ConsoleStage } from '../../state/session';
import { useProjectStore } from '../../state/project';
import { readProject } from '../../formats/projectJson';
import { parseRaspEng } from '../../formats/engParser';

// BOM + CRLF + a byte that is not valid UTF-8: text round-tripping would change this file.
const LOG_BYTES = new Uint8Array([
  0xef, 0xbb, 0xbf,
  ...new TextEncoder().encode('time_s,altitude_m\r\n0,0\r\n0.5,12.5\r\n1,40.1\r\n1.5,70\r\n'),
  ...new TextEncoder().encode('# caf'), 0xe9, ...new TextEncoder().encode('\r\n'),
]);
const LOG_SHA = createHash('sha256').update(LOG_BYTES).digest('hex');

const goTo = (stage: ConsoleStage): void => void act(() => useSessionStore.getState().setConsole({ stage }));

function readKvValue(label: string): string {
  const row = screen.getByText(label, { selector: 'span' }).closest('div') as HTMLElement;
  return Array.from(row.querySelectorAll('span')).find((s) => s.dataset.value !== undefined)?.getAttribute('data-value') ?? '';
}

async function importLog(): Promise<void> {
  const input = screen.getByLabelText('Flight log file') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([LOG_BYTES], 'my-flight.csv', { type: 'text/csv' })] } });
  await waitFor(() => expect(readKvValue('Source file')).toBe('my-flight.csv'));
}

const fill = (label: string, value: string): void => void fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } });

function installTauriSave(path: string) {
  const written = new Map<string, Uint8Array>();
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
    dialog: { save: async () => path },
    fs: { writeFile: async (p: string, data: Uint8Array) => void written.set(p, data) },
  };
  return written;
}

let teardown: () => void;

beforeEach(() => {
  localStorage.setItem('astraea.workstation.toured', '1');
  teardown = stubEngine().teardown;
  resetConsoleState();
  consoleJobStub();
  useSessionStore.getState().setConsole({ stage: 'verify' });
  // Verify's Validation card starts closed; these tests exercise the studio inside it.
  useSessionStore.getState().setValidationOpen(true);
});

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  teardown();
  cleanup();
});

describe('the imported flight log in the Workstation', () => {
  it('survives Verify → Flight → Verify, with the same checksum, and is gone once the project is replaced', async () => {
    render(<Workstation />);
    await importLog();
    expect(readKvValue('SHA-256')).toBe(LOG_SHA);

    goTo('flight');
    expect(screen.queryByLabelText('Flight log file')).toBeNull();
    goTo('verify');
    expect(readKvValue('Source file')).toBe('my-flight.csv');
    expect(readKvValue('SHA-256')).toBe(LOG_SHA);
    expect(screen.getByText(/exactly as imported/)).toBeTruthy();

    // Editing the open project keeps it; opening or creating another one does not.
    act(() => useProjectStore.getState().commitStructural('Touch', (p) => ({ ...p })));
    goTo('flight');
    goTo('verify');
    expect(readKvValue('SHA-256')).toBe(LOG_SHA);

    goTo('flight');
    act(() => useProjectStore.getState().newProject());
    goTo('verify');
    expect(screen.queryByText('Log provenance — what was received, not inferred')).toBeNull();
    expect(screen.getByText(/Import a flight log above first/)).toBeTruthy();
  });
});

describe('Share this flight', () => {
  it('will not export without a log, a measured mass, a date and consent, and writes nothing', async () => {
    const written = installTauriSave('/tmp/out.zip');
    render(<Workstation />);

    fireEvent.click(screen.getByRole('button', { name: /export flight bundle/i }));
    await screen.findByText(/there is nothing to share without it/i);

    await importLog();
    fireEvent.click(screen.getByRole('button', { name: /export flight bundle/i }));
    await screen.findByText(/Enter the measured liftoff mass/);
    expect(screen.getByText(/Enter the launch date/)).toBeTruthy();
    expect(screen.getByText(/Tick the box to agree/)).toBeTruthy();

    fill('Liftoff mass (g)', '95');
    fill('Launch date', '2026-10-18');
    fireEvent.click(screen.getByRole('button', { name: /export flight bundle/i }));
    await screen.findByText(/Tick the box to agree/);
    expect(written.size).toBe(0);
  });

  it('writes a zip with the log byte-identical to what was imported', async () => {
    const written = installTauriSave('/tmp/out.zip');
    render(<Workstation />);
    await importLog();

    fill('Liftoff mass (g)', '95');
    fill('Launch date', '2026-10-18');
    fill('Launch site', 'Black Rock');
    fill('Rail length (m)', '1.8');
    fireEvent.click(screen.getByLabelText(/I agree this data may be used to validate Astraea/));
    fireEvent.click(screen.getByRole('button', { name: /export flight bundle/i }));
    await waitFor(() => expect(written.size).toBe(1), { timeout: 10_000 });

    const zip = await JSZip.loadAsync(written.get('/tmp/out.zip') as Uint8Array);
    const names = Object.keys(zip.files);
    expect(names).toEqual(expect.arrayContaining(['README.txt', 'flight-info.json', 'flight-log/my-flight.csv', 'flight-log/provenance.json']));
    expect(Array.from(await zip.file('flight-log/my-flight.csv')!.async('uint8array'))).toEqual(Array.from(LOG_BYTES));
    expect(JSON.parse((await zip.file('flight-log/provenance.json')!.async('string')) as string).sha256).toBe(LOG_SHA);

    const info = JSON.parse((await zip.file('flight-info.json')!.async('string')) as string);
    expect(info).toMatchObject({ liftoffMassG: 95, launchDate: '2026-10-18', siteName: 'Black Rock', railLengthM: 1.8, consent: { agreed: true } });
    expect(info.astraeaVersion).toMatch(/^\d+\.\d+\.\d+$/);

    const project = readProject((await zip.file(names.find((n) => n.endsWith('.astraea.json'))!)!.async('string')) as string);
    expect(project.workspace.motorId).toBe(useProjectStore.getState().project.workspace.motorId);
    expect(parseRaspEng((await zip.file(names.find((n) => n.endsWith('.eng'))!)!.async('string')) as string).thrustCurve.length).toBeGreaterThan(2);
  });
});
