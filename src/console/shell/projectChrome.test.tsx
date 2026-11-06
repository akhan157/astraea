/**
 * Project chrome: the TopBar project menu (import, the durable browser slot,
 * project files), the editable vehicle name, the browser-preview notice, and
 * the WebGL fallback with the editing surfaces still live.
 *
 * Pins the legacy Header/App behaviors the Console now owns: a RockSim (.rkt)
 * upload persists through save/open, a malformed one is reported
 * inline and changes nothing, save reports the revision, open restores the
 * stored project, an empty slot is not an error, corrupt bytes are never
 * overwritten, and a stale save is refused with the newer commit untouched.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

import { App } from '../../App';
import { createProjectEnvelope, writeProject, PROJECT_SCHEMA_VERSION } from '../../formats/projectJson';
import { PROJECT_STORAGE_KEY } from '../../formats/projectStorage';
import { useProjectStore } from '../../state/project';
import { useProjectIo, resetProjectSlot } from '../../state/projectIo';
import { useSessionStore } from '../../state/session';
import { useAnalysisStore } from '../../state/analysis';
import { setTestEngine } from '../../engine';
import { consoleJobStub, installTestEngine, resetConsoleState, stubEngine } from '../testFixtures';

/** A minimal valid RockSim (.rkt) document: one nose cone and one body tube. */
const SAMPLE_RKT = `<?xml version="1.0" encoding="utf-8"?>
<RockSimDocument>
  <FileVersion>4</FileVersion>
  <DesignInformation>
    <RocketDesign>
      <Name>Imported Test Rocket</Name>
      <Designer>Test Rig</Designer>
      <Stage3Parts>
        <NoseCone>
          <PartName>Ogive Nose Cone</PartName>
          <ShapeCode>1</ShapeCode>
          <Len>180.0</Len>
          <AftDia>29.0</AftDia>
          <WallThickness>1.5</WallThickness>
        </NoseCone>
        <BodyTube>
          <PartName>29mm Fuselage</PartName>
          <Len>600.0</Len>
          <OD>29.0</OD>
          <ID>27.0</ID>
        </BodyTube>
      </Stage3Parts>
    </RocketDesign>
  </DesignInformation>
</RockSimDocument>`;

const OTHER_NAME = 'Chrome Test Rocket';

const openMenu = (): void => {
  fireEvent.click(screen.getByLabelText('Project menu'));
};

async function clickItem(hook: string): Promise<void> {
  await waitFor(() => expect(document.querySelector(`[data-project="${hook}"]`)).toBeTruthy());
  fireEvent.click(document.querySelector(`[data-project="${hook}"]`) as HTMLElement);
}

const statusEl = (): HTMLElement | null => document.querySelector('[data-project-status]');
const statusText = (): string => statusEl()?.textContent ?? '';
const statusKind = (): string | null => statusEl()?.getAttribute('data-project-status') ?? null;
const banner = (): HTMLElement | null => document.querySelector('[data-drop-import-error]');
const fileInput = (): HTMLInputElement => document.querySelector('[data-project-input]') as HTMLInputElement;
const vehicleNameField = (): HTMLInputElement => screen.getByLabelText('Vehicle name') as HTMLInputElement;

let teardown: (() => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('astraea.workstation.toured', '1');
  // jsdom's default width would auto-collapse the parts panel (the shell does
  // that below 1100 px); this file drives the panels, so keep them open.
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
  const stub = stubEngine();
  teardown = stub.teardown;
  resetConsoleState();
  consoleJobStub();
  useProjectIo.setState({ report: null, status: null });
  resetProjectSlot();
  useSessionStore.getState().setConsole({ stage: 'airframe', selectedId: null });
  useAnalysisStore.getState().reset();
  useProjectStore.getState().editProject({
    label: 'Test fixture name',
    key: 'fixture-name',
    project: { ...useProjectStore.getState().project, vehicle: { ...useProjectStore.getState().project.vehicle, name: OTHER_NAME } },
  });
});

afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
  vi.restoreAllMocks();
});

describe('project menu durable slot', () => {
  it('saves the current project to this browser and reports the revision', async () => {
    render(<App />);
    openMenu();
    await clickItem('save');

    await waitFor(() => expect(statusText()).toMatch(/Saved locally \(revision 1\)/));
    expect(statusKind()).toBe('ok');
    const stored = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) as string);
    expect(stored.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(stored.revision).toBe(1);
    expect(stored.vehicle.name).toBe(OTHER_NAME);
    expect(document.querySelector('[data-project-status="error"]')).toBeNull();
  });

  it('opens the stored project back into the design', async () => {
    render(<App />);
    openMenu();
    await clickItem('save');
    await waitFor(() => expect(statusText()).toMatch(/Saved locally/));

    // Edit away from the saved state, then restore it from the durable slot.
    fireEvent.change(vehicleNameField(), { target: { value: 'Edited After Save' } });
    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Edited After Save'));

    await clickItem('open');
    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe(OTHER_NAME));
    expect(statusText()).toMatch(/Opened saved project \(revision 1\)/);
  });

  it('says the slot is empty instead of failing when nothing was saved', async () => {
    render(<App />);
    openMenu();
    await clickItem('open');

    await waitFor(() => expect(statusText()).toMatch(/No project saved in this browser yet/));
    expect(statusKind()).toBe('ok');
    expect(document.querySelector('[data-project-status="error"]')).toBeNull();
  });

  it('surfaces corrupt stored bytes inline and never overwrites them', async () => {
    localStorage.setItem(PROJECT_STORAGE_KEY, '{ not a project');
    render(<App />);
    openMenu();

    await clickItem('open');
    await waitFor(() => expect(statusText()).toMatch(/Open failed: Invalid project/));
    expect(statusKind()).toBe('error');

    await clickItem('save');
    await waitFor(() => expect(statusText()).toMatch(/Save failed: Invalid project/));
    expect(localStorage.getItem(PROJECT_STORAGE_KEY)).toBe('{ not a project');
  });

  it('refuses a save whose base revision is behind a newer stored commit', async () => {
    render(<App />);
    openMenu();
    await clickItem('open'); // syncs the revision base to the empty slot
    await waitFor(() => expect(statusText()).toMatch(/No project saved/));

    // Another session commits a far-future revision behind this window's back.
    localStorage.setItem(
      PROJECT_STORAGE_KEY,
      writeProject(createProjectEnvelope({ vehicle: useProjectStore.getState().project.vehicle, revision: 999 })),
    );
    await clickItem('save');

    await waitFor(() => expect(statusText()).toMatch(/Save failed: stale write rejected/));
    expect(JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY) as string).revision).toBe(999);
  });

  it('reports a project outcome inline, never through window.alert or a confirm', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    render(<App />);
    openMenu();
    await clickItem('open');

    await waitFor(() => expect(statusText()).toMatch(/No project saved/));
    // The only dialog on screen is the project menu popover itself; nothing
    // was raised to report the outcome.
    expect(screen.queryAllByRole('dialog').length).toBeLessThanOrEqual(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('project menu import', () => {
  it('persists a RockSim .rkt upload through save and open', async () => {
    const { container } = render(<App />);
    expect(fileInput().accept).toContain('.rkt');
    expect(fileInput().accept).not.toContain('.cdx1');

    fireEvent.change(fileInput(), { target: { files: [new File([SAMPLE_RKT], 'test.rkt', { type: 'application/xml' })] } });

    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Imported Test Rocket'));
    expect(banner()).not.toBeNull();
    expect(useProjectStore.getState().project.vehicle.components.map((c) => c.type)).toEqual(
      expect.arrayContaining(['nosecone', 'bodytube']),
    );

    openMenu();
    await clickItem('save');
    await waitFor(() => expect(statusText()).toMatch(/Saved locally/));

    fireEvent.change(vehicleNameField(), { target: { value: 'Renamed After Import' } });
    await clickItem('open');

    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Imported Test Rocket'));
    expect(useProjectStore.getState().project.vehicle.components.map((c) => c.type)).toEqual(
      expect.arrayContaining(['nosecone', 'bodytube']),
    );
    expect(container.querySelector('[data-project-input]')).toBeTruthy();
  });

  it('reports a malformed .rkt inline and leaves the existing project untouched', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<App />);
    const before = useProjectStore.getState().project.vehicle;

    fireEvent.change(fileInput(), { target: { files: [new File(['1, 2\n'], 'fake.rkt')] } });

    await waitFor(() => expect(banner()).toBeTruthy());
    expect(useProjectStore.getState().project.vehicle).toBe(before);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('window drop target', () => {
  it('hints while a file is over the window and imports it on drop', async () => {
    render(<App />);
    expect(document.querySelector('[data-drop-overlay="true"]')).toBeNull();

    fireEvent.dragOver(window, { dataTransfer: { files: [] } });
    expect(document.querySelector('[data-drop-overlay="true"]')).toBeTruthy();

    fireEvent.drop(window, { dataTransfer: { files: [new File([SAMPLE_RKT], 'test.rkt')] } });
    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Imported Test Rocket'));
    expect(document.querySelector('[data-drop-overlay="true"]')).toBeNull();
    expect(banner()?.textContent).toMatch(/geometry.only/i);
  });
});

describe('vehicle name', () => {
  it('is editable in the TopBar and drives the design', async () => {
    render(<App />);
    fireEvent.change(vehicleNameField(), { target: { value: 'Night Hawk' } });

    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Night Hawk'));
    expect(vehicleNameField().value).toBe('Night Hawk');

    // One undo step for the rename.
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.vehicle.name).toBe(OTHER_NAME);

    // An empty name is never kept: blur restores the last name the user typed.
    fireEvent.change(vehicleNameField(), { target: { value: 'Night Hawk' } });
    fireEvent.change(vehicleNameField(), { target: { value: '' } });
    fireEvent.blur(vehicleNameField());
    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Night Hawk'));
  });
});

describe('keyboard and persistence', () => {
  it('never fires stage keys inside editable contexts', async () => {
    render(<App />);
    fireEvent.keyDown(document.body, { key: '3' });
    expect(useSessionStore.getState().stage).toBe('motor');

    fireEvent.keyDown(vehicleNameField(), { key: '5' });
    expect(useSessionStore.getState().stage).toBe('motor');

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Filter parts by name' }), { key: '1' });
    expect(useSessionStore.getState().stage).toBe('motor');
  });

  it('keeps the edited case input across stage switches', async () => {
    render(<App />);
    fireEvent.change(vehicleNameField(), { target: { value: 'Persisted Case' } });
    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Persisted Case'));

    fireEvent.keyDown(document.body, { key: '6' });
    expect(useSessionStore.getState().stage).toBe('recovery');
    fireEvent.keyDown(document.body, { key: '1' });

    expect(useSessionStore.getState().stage).toBe('mission');
    expect(vehicleNameField().value).toBe('Persisted Case');
  });
});

describe('browser preview and WebGL', () => {
  it('warns only when this browser cannot run the engine', () => {
    // jsdom has no Web Workers, so with no test engine the engine is unavailable.
    setTestEngine(null);
    const plain = render(<App />);
    const notice = plain.container.querySelector('[data-web-preview="true"]');
    expect(notice?.textContent).toMatch(/can't run the Astraea engine/);
    expect(notice?.textContent).toMatch(/Editing, imports,\s+exports and project files still work/);

    // The notice is a render-time fact: it disappears once an engine exists.
    const { teardown } = installTestEngine(async () => ({}));
    const withEngine = render(<App />);
    expect(withEngine.container.querySelector('[data-web-preview="true"]')).toBeNull();
    teardown();
  });

  it('keeps every editing surface live when no WebGL context exists', async () => {
    render(<App />);
    // jsdom provides no WebGL: the labeled fallback replaces the canvas.
    expect(screen.getByText('3D viewport unavailable — editing preserved')).toBeTruthy();
    expect(screen.getByRole('button', { name: /restore viewport/i })).toBeTruthy();

    // The editing surfaces stay live: the parts tree, the filter, the stage
    // rail and the run action all still respond.
    expect(screen.getByRole('tree')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Filter parts by name' }), { target: { value: 'nose' } });
    expect((screen.getByRole('textbox', { name: 'Filter parts by name' }) as HTMLInputElement).value).toBe('nose');
    fireEvent.keyDown(document.body, { key: '8' });
    expect(useSessionStore.getState().stage).toBe('build');
    expect(screen.getByTitle(/Run the 6-DOF simulation/)).toBeTruthy();
  });
});
