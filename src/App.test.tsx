/**
 * Root mount: the Console workstation is the app, with window-wide drag and
 * drop routed through the project-import seam into the unified state.
 *
 * The 3-D viewport is stubbed because jsdom has no WebGL; everything else is
 * the real component tree.
 */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useThree: () => ({ camera: { position: { set: () => undefined }, projectionMatrix: {} }, size: { width: 1, height: 1 } }),
  useFrame: () => undefined,
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Grid: () => null,
  GizmoHelper: () => null,
  GizmoViewcube: () => null,
}));

import { App } from './App';
import { createProjectEnvelope, writeProject } from './formats/projectJson';
import { parseRaspEng } from './formats/engParser';
import { useProjectStore } from './state/project';
import { useProjectIo, resetProjectSlot } from './state/projectIo';
import { useSessionStore } from './state/session';
import { useAnalysisStore } from './state/analysis';
import { useConsoleJobs } from './console/store';
import { setTestEngine } from './engine';

/** A minimal valid project envelope for the drop path. */
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

/** The certified Estes C6 curve, in the RASP .eng layout. */
const SAMPLE_ENG = [
  '; Estes C6 certified thrust curve (RASP .eng layout)',
  'Estes C6 18 70 Estes 8.8 6.06 14.2 0.0125 0.0248',
  '0.00 0.0',
  '0.18 14.2',
  '0.50 4.8',
  '1.86 0.0',
  '',
].join('\n');

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

/** A file dropped anywhere in the window, as the shell's drop seam sees it. */
const dropFile = (file: File): void => {
  fireEvent.drop(window, { dataTransfer: { files: [file] } });
};

const banner = (): HTMLElement | null => document.querySelector('[data-drop-import-error]');

beforeEach(() => {
  // Mark the guided tour as seen so the coach card does not open over the
  // assertions; the tour itself is not what this file exercises.
  localStorage.clear();
  localStorage.setItem('astraea.workstation.toured', '1');
  useProjectStore.getState().newProject();
  useSessionStore.getState().setConsole({ stage: 'airframe', selectedId: null });
  useAnalysisStore.getState().reset();
  useConsoleJobs.setState({ jobs: { running: false, runError: null, mc: null }, mcAbort: null });
  useProjectIo.setState({ report: null, status: null });
  resetProjectSlot();
  setTestEngine(null);
});

describe('App root', () => {
  it('imports a dropped RockSim .rkt file as one undoable edit', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<App />);
    const before = useProjectStore.getState().project.vehicle;

    dropFile(new File([SAMPLE_RKT], 'test.rkt', { type: 'application/xml' }));

    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Imported Test Rocket'));
    // The import (and its warnings) is disclosed in the banner; the wording is
    // product copy, so this pins that a report is shown, not what it says.
    expect(banner()).not.toBeNull();
    // The RockSim geometry itself arrived: the nose cone and the body tube.
    expect(useProjectStore.getState().project.vehicle.components.map((c) => c.type)).toEqual(
      expect.arrayContaining(['nosecone', 'bodytube']),
    );
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    // The replacement is one undoable Console edit: the prior design is recoverable.
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.vehicle).toBe(before);
    alertSpy.mockRestore();
  });

  it('refuses a malformed .rkt file without replacing the vehicle', async () => {
    render(<App />);
    const before = useProjectStore.getState().project.vehicle;

    dropFile(new File(['# not a RockSim document\n1, 2\n'], 'invalid.rkt'));

    await waitFor(() => expect(banner()).toBeTruthy());
    expect(useProjectStore.getState().project.vehicle).toBe(before);
  });

  it('reports a failed drop-import inline (role=alert banner), never window.alert or a dialog', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<App />);
    dropFile(new File(['{"broken": '], 'broken.json', { type: 'application/json' }));

    await waitFor(() => expect(banner()).toBeTruthy());
    expect(banner()?.textContent).toMatch(/Could not load broken\.json/);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    alertSpy.mockRestore();
  });

  it('refuses an unsupported file type with the gate message', async () => {
    render(<App />);
    dropFile(new File(['x'], 'notes.txt', { type: 'text/plain' }));

    await waitFor(() => expect(banner()).toBeTruthy());
    expect(banner()?.textContent).toMatch(/unsupported type/);
  });

  it('dismisses the disclosure banner and clears only that report', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<App />);
    dropFile(new File(['{"broken": '], 'broken.json', { type: 'application/json' }));

    await waitFor(() => expect(banner()).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Dismiss disclosure'));
    await waitFor(() => expect(banner()).toBeNull());
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('imports a dropped project envelope into the unified state', async () => {
    render(<App />);
    dropFile(new File([validEnvelopeJson('Envelope Dropped')], 'project.astraea.json', { type: 'application/json' }));

    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Envelope Dropped'));
    expect(useProjectStore.getState().project.vehicle.id).toBe('dropped-1');
    expect(banner()).toBeNull();
  });

  it('migrates a legacy bare-vehicle JSON dropped on the app', async () => {
    render(<App />);
    const legacy = {
      id: 'legacy-drop-1',
      name: 'Legacy Dropped',
      version: '1.0',
      author: 'Legacy Author',
      components: [
        {
          id: 'legacy-nc',
          name: 'Nosecone',
          type: 'nosecone',
          shape: 'ogive',
          length: 0.3,
          baseDiameter: 0.1,
          wallThickness: 0.002,
          isHollow: true,
          materialId: 'fiberglass',
        },
      ],
    };
    dropFile(new File([JSON.stringify(legacy)], 'legacy.json', { type: 'application/json' }));

    await waitFor(() => expect(useProjectStore.getState().project.vehicle.name).toBe('Legacy Dropped'));
    expect(banner()).toBeNull();
  });

  it('fails closed on a JSON document the envelope reader rejects (unknown schema version)', async () => {
    render(<App />);
    dropFile(
      new File([JSON.stringify({ schemaVersion: '99.0.0', vehicle: { components: [] } })], 'future.json', { type: 'application/json' }),
    );

    await waitFor(() => expect(banner()).toBeTruthy());
    expect(banner()?.textContent).toMatch(/no migration|neither a versioned project envelope/);
  });

  it('registers a dropped .eng motor in the project without rebinding the design', async () => {
    render(<App />);
    const bound = useProjectStore.getState().project.workspace.motorId;

    dropFile(new File([SAMPLE_ENG], 'estes-c6.eng', { type: 'text/plain' }));

    await waitFor(() => expect(useProjectStore.getState().motorRecords().find((r) => r.provenance.sourceFile === 'estes-c6.eng')?.motor.designation).toBe('Estes C6'));
    expect(useProjectStore.getState().motorRecords().find((r) => r.provenance.sourceFile === 'estes-c6.eng')?.id).not.toBe('estes_c6');
    expect(banner()?.textContent).toMatch(/registered in the catalog/);
    expect(useProjectStore.getState().project.workspace.motorId).toBe(bound);
  });

  it('restores the non-certified motor records a dropped envelope carries', async () => {
    render(<App />);
    const vehicle = useProjectStore.getState().project.vehicle;
    const custom = { ...parseRaspEng(SAMPLE_ENG), id: 'imported_c6', designation: 'Imported C6' };
    const json = writeProject(
      createProjectEnvelope({
        vehicle,
        motorRecords: [{ id: 'imported_c6', motor: custom, provenance: { source: 'import' } }],
      }),
    );

    dropFile(new File([json], 'with-motor.json', { type: 'application/json' }));

    await waitFor(() => expect(useProjectStore.getState().motors['imported_c6']).toBeTruthy());
    expect(useProjectStore.getState().project.motorRecords.some((r) => r.id === 'imported_c6')).toBe(true);
  });

  it('states up front when this browser cannot run the engine', () => {
    render(<App />);
    const notice = document.querySelector('[data-web-preview="true"]');
    expect(notice?.textContent).toMatch(/can't run the Astraea engine/);
    expect(notice?.textContent).toMatch(/needs WebAssembly and Web Workers/);
  });
});
