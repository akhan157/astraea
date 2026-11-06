/**
 * Build stage export path: the reviewed vehicle snapshot is handed to the
 * exporter, and the resulting file reaches the download seam with the design's
 * name.
 */
// @vitest-environment jsdom
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

import { BuildInspector, BuildStage } from './Build';
import { exportBlueprintSvg } from '../../formats/blueprint';
import { parseRaspEng } from '../../formats/engParser';
import { PROJECT_SCHEMA_VERSION } from '../../formats/projectJson';
import { adoptProject, useProjectStore } from '../../state/project';
import { largeProject } from '../../io/largeProject.fixture';
import { useAnalysisStore } from '../../state/analysis';
import { useSessionStore } from '../../state/session';
import { consoleActions, currentRunKey, designOf, type FlightPayload } from '../store';
import { toFlightRun } from '../data/adapter';
import { consoleJobStub, flightResult, stubEngine } from '../testFixtures';
import type { SixDofSimulationResult } from '../../sim/sixDofSimulator';
import type { DragCalibration } from '../../application/dragCalibration';
import { momentArmHistoryFixture } from '../../application/momentArmHistory.fixture';

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

interface Download {
  filename: string;
  blob: Blob;
}

/** Commit a native flight record for the current inputs, without a real run. */
function commitFlightRun(overrides: Partial<SixDofSimulationResult> = {}): void {
  const store = useProjectStore.getState();
  const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
  const inputKey = currentRunKey();
  if (inputKey === null) throw new Error('the preset case is not runnable');
  const token = useAnalysisStore.getState().start('flight', inputKey);
  const payload: FlightPayload = {
    design,
    run: toFlightRun(flightResult(overrides), design.vehicle, undefined, inputKey, store.project.revision, 1,
      undefined,undefined,undefined,{kind:'test-engine',sha256:null}),
    previous: null,
  };
  useAnalysisStore.getState().resolve('flight', token, payload);
}


const CALIBRATION: DragCalibration = {
  scale: 0.881,
  fittedCd: 0.4888,
  modelCd: 0.5545,
  rmseN: 0.117,
  coastMassKg: 0.0499,
  source: { fileName: 'cosmic-cargo-2986.csv', sha256Hex: 'e'.repeat(64), rowCount: 406 },
  window: { startS: 2.31, endS: 7.28, method: 'velocity-column', pointsUsed: 385, pointsExcluded: 13 },
  appliedAt: '2026-10-21T12:00:00.000Z',
};

/** Commit a flight record that was computed with `calibration` against the current inputs. */
function commitCalibratedRun(calibration: DragCalibration): void {
  const store = useProjectStore.getState();
  const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
  const inputKey = currentRunKey();
  if (inputKey === null) throw new Error('the preset case is not runnable');
  const token = useAnalysisStore.getState().start('flight', inputKey);
  const payload: FlightPayload = {
    design,
    run: toFlightRun(flightResult(), design.vehicle, undefined, inputKey, store.project.revision, 1, undefined, calibration),
    previous: null,
  };
  useAnalysisStore.getState().resolve('flight', token, payload);
}

/** The trace the Build inspector shows for the committed run. */
function shownTrace(): Record<string, unknown> {
  const { container } = render(<BuildInspector />);
  return JSON.parse(container.querySelector('pre')!.textContent ?? '{}') as Record<string, unknown>;
}

describe('Build stage export', () => {
  let teardown: () => void;
  let downloads: Download[];

  beforeEach(() => {
    localStorage.setItem('astraea.workstation.toured', '1');
    const stub = stubEngine();
    teardown = stub.teardown;
    useProjectStore.getState().loadPreset('estesAlpha');
    useAnalysisStore.getState().reset();
    useSessionStore.getState().setConsole({ stage: 'build' });
    consoleJobStub();

    downloads = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      downloads.push({ filename: '', blob: blob as Blob });
      return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    // jsdom has no navigation: the anchor click is captured, not followed.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function capture(this: HTMLAnchorElement) {
      const last = downloads[downloads.length - 1];
      if (last !== undefined) last.filename = this.download;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    teardown();
    cleanup();
  });

  it('keeps the session motor records in the Astraea project export', async () => {
    const motor = { ...parseRaspEng(SAMPLE_ENG), id: 'exported_c6', designation: 'Exported C6' };
    useProjectStore.getState().addMotorRecord(
      { id: 'exported_c6', motor, provenance: { source: 'import', sourceFile: 'exported.eng' } },
      'Import motor Exported C6',
    );

    const { container } = render(<BuildStage />);
    // Save through the browser download: the Tauri save dialog is not part of
    // this test, and the trace bundle is covered by io's own tests.
    teardown();
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    const row = container.querySelector('[data-format="project"]');
    expect(row).not.toBeNull();
    fireEvent.click(row!.querySelector('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm export' }));

    await waitFor(() => expect(downloads.length).toBeGreaterThan(0));
    const download = downloads[downloads.length - 1];
    expect(download.filename.endsWith('.astraea.json')).toBe(true);
    const doc = JSON.parse(await download.blob.text());
    expect(doc.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(doc.motorRecords.map((r: { id: string }) => r.id)).toContain('exported_c6');
    expect(doc.motorRecords.find((r: { id: string }) => r.id === 'exported_c6').provenance.sourceFile).toBe('exported.eng');
  });

  it('exports the exact retained history and recorded identity after inputs change',()=>{
    const history=momentArmHistoryFixture(3.2);
    history.points[0].dampingMomentBodyNm.x=-0;
    commitFlightRun({momentArmHistory:history});
    act(()=>consoleActions.setOptions({railLength:8},'Later inputs'));
    const trace=shownTrace() as {simulation:{current:boolean;momentArmHistory:unknown;engineIdentity:unknown;inputKey:string}};
    expect(trace.simulation.current).toBe(false);
    expect(trace.simulation.momentArmHistory).toEqual(history);
    expect(trace.simulation.engineIdentity).toEqual({kind:'test-engine',sha256:null});
    expect(trace.simulation.inputKey).toBeTruthy();
  });

  it('keeps a failed safety gate distinct from run freshness and withdraws freshness on an input change', () => {
    commitFlightRun({ landingVelocity: 12, isLandingVelocitySafe: true, isLandingSafe: true });
    const { container } = render(<BuildInspector />);
    const trace = () => JSON.parse(container.querySelector('pre')!.textContent ?? '{}') as {
      simulation: { current: boolean };
      gates: Array<{ id: string; status: string }>;
      checks: Array<{ check: string; state: string }>;
    };
    const current = trace();
    expect(current.simulation.current).toBe(true);
    expect(current.gates.find((g) => g.id === 'landing_speed')?.status).toBe('fail');
    expect(current.gates.find((g) => g.id === 'landing_energy')).toBeUndefined();
    expect(current.checks.find((c) => c.check === 'Simulation matches the design')?.state).toBe('ok');
    expect(current.checks.find((c) => c.check === 'Flight qualification')?.state).toBe('bad');

    const rail = useProjectStore.getState().project.workspace.launch.railLengthM;
    act(() => consoleActions.setOptions({ railLength: rail + 1 }, 'Rail length'));
    expect(trace().simulation.current).toBe(false);
  });

  it('carries the drag calibration of the committed run in the export trace', () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    commitCalibratedRun(CALIBRATION);
    const trace = shownTrace() as { dragCalibration: { appliedToResults: Record<string, unknown>; stillApplied: boolean; note: string }; changesSinceRun: unknown[] };
    expect(trace.changesSinceRun).toEqual([]);
    expect(trace.dragCalibration.appliedToResults).toMatchObject({
      scale: 0.881,
      logFile: 'cosmic-cargo-2986.csv',
      logSha256: 'e'.repeat(64),
      window: { startS: 2.31, endS: 7.28 },
    });
    expect(trace.dragCalibration.stillApplied).toBe(true);
  });

  it('says in the trace when the calibration the results used is no longer on the project', () => {
    act(() => consoleActions.setDragCalibration(CALIBRATION, 'Apply drag calibration'));
    commitCalibratedRun(CALIBRATION);
    act(() => consoleActions.setDragCalibration(undefined, 'Remove drag calibration'));
    const trace = shownTrace() as { dragCalibration: { stillApplied: boolean }; simulation: { current: boolean }; changesSinceRun: Array<{ what: string }> };
    expect(trace.simulation.current).toBe(false);
    expect(trace.dragCalibration.stillApplied).toBe(false);
  });

  it('has no calibration entry in the trace of an uncalibrated run', () => {
    commitFlightRun();
    expect((shownTrace() as { dragCalibration: unknown }).dragCalibration).toBeNull();
  });

  it('refuses the KML export with no committed native flight and starts no download', () => {
    const { container } = render(<BuildStage />);
    const row = container.querySelector('[data-format="kml"]');
    expect(row).not.toBeNull();
    const button = row!.querySelector('button');
    expect(button!.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button!);
    expect(screen.queryByRole('button', { name: 'Confirm export' })).toBeNull();
    expect(downloads).toHaveLength(0);
  });

  it('refuses the KML export when the committed run carries no telemetry', () => {
    commitFlightRun({ telemetry: [] });
    const { container } = render(<BuildStage />);
    const row = container.querySelector('[data-format="kml"]');
    expect(row!.querySelector('button')!.hasAttribute('disabled')).toBe(true);
    expect(downloads).toHaveLength(0);
  });

  it('refuses the KML export once a design edit makes the committed run stale', () => {
    commitFlightRun();
    const { container } = render(<BuildStage />);
    const row = () => {
      const found = container.querySelector('[data-format="kml"]');
      if (found === null) throw new Error('KML export row is missing');
      return found;
    };
    expect(row().querySelector('button')!.hasAttribute('disabled')).toBe(false);
    const rail = useProjectStore.getState().project.workspace.launch.railLengthM;
    act(() => consoleActions.setOptions({ railLength: rail + 1 }, 'Rail length'));
    expect(row().querySelector('button')!.hasAttribute('disabled')).toBe(true);
    expect(downloads).toHaveLength(0);
  });

  it('refuses the KML export when the committed run did not pass validity', () => {
    commitFlightRun({ validity: 'FAIL' });
    const { container } = render(<BuildStage />);
    const row = container.querySelector('[data-format="kml"]');
    expect(row!.querySelector('button')!.hasAttribute('disabled')).toBe(true);
    expect(downloads).toHaveLength(0);
  });

  it.each([
    ['timeout', { terminationReason: 'timeout', touchdownNominal: false }],
    ['abnormal touchdown', { terminationReason: 'touchdown', touchdownNominal: false }],
    ['missing terminal evidence', { terminationReason: undefined, touchdownNominal: true }],
    ['contradictory timeout', { terminationReason: 'timeout', touchdownNominal: true }],
  ] as const)('refuses to export the %s endpoint as a landing despite PASS validity', (_label, terminal) => {
    commitFlightRun({ validity: 'PASS', ...terminal });
    const { container } = render(<BuildStage />);
    const button = container.querySelector('[data-format="kml"] button')!;
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(screen.queryByRole('button', { name: 'Confirm export' })).toBeNull();
    expect(downloads).toEqual([]);
    expect(screen.getByText(/A recorded nominal touchdown is required/)).toBeTruthy();
  });

  it('exports the reviewed snapshot bytes even after the live vehicle is edited', async () => {
    const tube = useProjectStore.getState().project.vehicle.components.find((c) => c.id === 'alpha-bt');
    if (!tube || !('length' in tube)) throw new Error('preset has no body tube length');
    const reviewed = useProjectStore.getState().project.vehicle;
    const expected = exportBlueprintSvg(reviewed);

    const { container } = render(<BuildStage />);
    // Save through the browser download: the Tauri save dialog is not part of
    // this test, and a half-stubbed dialog would fail the export by design.
    teardown();
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    const row = container.querySelector('[data-format="svg"]');
    fireEvent.click(row!.querySelector('button')!);

    // The review is open: the live vehicle changes before the export runs.
    act(() => consoleActions.setComponent('alpha-bt', { length: tube.length + 0.05 }, 'Body tube length'));
    const live = useProjectStore.getState().project.vehicle;
    expect(exportBlueprintSvg(live)).not.toBe(expected);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm export' }));
    await waitFor(() => expect(downloads.length).toBeGreaterThan(0));
    const download = downloads[downloads.length - 1];
    expect(await download.blob.text()).toBe(expected);
    expect(download.filename.endsWith('.svg')).toBe(true);
  });

  it('refuses a project export over the archive budget before any file write', async () => {
    adoptProject(largeProject(18));
    const { container } = render(<BuildStage />);
    const row = container.querySelector('[data-format="project"]');
    fireEvent.click(row!.querySelector('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm export' }));
    await waitFor(() => expect(screen.getByText(/Export failed: .*64 MB/)).toBeTruthy(), { timeout: 60_000 });
    expect(screen.getByText(/no file was written/)).toBeTruthy();
    expect(downloads).toHaveLength(0);
  }, 180_000);
});
