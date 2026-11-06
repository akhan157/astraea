/**
 * Flight-evidence studio, end to end in the UI with the shipped WebAssembly
 * engine and the real Cosmic Cargo flight (Altimeter Cloud #2986).
 *
 * Acceptance contract:
 *   1. A pasted flight-log CSV parses, resamples onto the dt grid, and shows
 *      sample counts plus the apogee altitude, with its provenance.
 *   2. Importing a log with a coast phase and pressing Fit derives the coast
 *      from that log, fits it against the model's own coast, and shows the
 *      window, the used/excluded counts, both Cds, the RMSE and the scale.
 *   3. Real-log previews cannot be applied without physical eligibility;
 *      a retained legacy adjustment stays explicitly unverified and removable.
 *   4. Any change to the log, design or site invalidates a fit into a visible
 *      stale state with no numbers.
 *   5. No demo rows: the manual table starts empty and its result stays
 *      analysis-only.
 *   6. The recovery card is not part of this studio.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import coastCsv from '../../../docs/flight-validation/cosmic-cargo-2986-coast.csv?raw';
import { EvidenceStudio } from './EvidenceStudio';
import { consoleActions } from '../store';
import { instantiateEngine } from '../../engine/core';
import { setTestEngine, type EngineInvoke } from '../../engine';
import { adoptProject, useProjectStore } from '../../state/project';
import { createProjectEnvelope } from '../../formats/projectJson';
import { DEFAULT_WORKSPACE } from '../../application/workspace';
import { parseTrajectoryCsv } from '../../evidence/altimetry';
import { cosmicCargoLike, COSMIC_CARGO_CONDITIONS } from '../../evidence/cosmicCargoFixture';
import { resetConsoleState } from '../testFixtures';
import type { DragCalibration } from '../../application/dragCalibration';

/** Historical adjustment fixture, with no claim of reviewed physical eligibility. */
const LEGACY_ADJUSTMENT: DragCalibration = {
  scale: 0.881, fittedCd: 0.4888, modelCd: 0.5545, rmseN: 0.117, coastMassKg: 0.0499,
  source: { fileName: 'legacy-unverified.csv', sha256Hex: 'unavailable', rowCount: 406 },
  window: { startS: 2.31, endS: 7.28, method: 'velocity-column', pointsUsed: 385, pointsExcluded: 13 },
  appliedAt: '2026-10-21T12:00:00.000Z',
};

const FLIGHT_CSV = [
  '"time_s","altitude_m"',
  '0,18.2',
  '0.5,35.4',
  '1,58.9',
  '1.5,88.1',
  '2,123.6',
  '2.5,165.2',
  '3,214.2',
  '3.5,213.5',
  '4,190.4',
  '4.5,151.8',
  '5,113.2',
  '5.5,83.5',
  '6,61.2',
].join('\n');

function readKv(valueLabel: string): HTMLElement {
  const label = screen.getByText(valueLabel, { selector: 'span' });
  const row = label.closest('div') as HTMLElement;
  const value = Array.from(row.querySelectorAll('span')).find((s) => s.dataset.value !== undefined);
  if (value === undefined) {
    throw new Error(`no value span for ${valueLabel}`);
  }
  return value;
}

function readKvValue(valueLabel: string): string {
  return readKv(valueLabel).getAttribute('data-value') ?? '';
}

/** Number at the start of a readout such as "0.4888" or "0.117 N". */
const numberOf = (valueLabel: string): number => Number.parseFloat(readKvValue(valueLabel));

/** The Cosmic Cargo model as the flight-validation record flies it, in the project store. */
function loadCosmicCargo(): void {
  const workspace = structuredClone(DEFAULT_WORKSPACE);
  workspace.motorId = 'estes_c6';
  workspace.launch = {
    railLengthM: COSMIC_CARGO_CONDITIONS.railLength,
    railElevationDeg: COSMIC_CARGO_CONDITIONS.railElevationDeg,
    railAzimuthDeg: 0,
    windSpeedMps: COSMIC_CARGO_CONDITIONS.windSpeedSurface,
    windAzimuthDeg: 0,
    finCantDeg: 0,
    mainDeployAltitudeM: COSMIC_CARGO_CONDITIONS.mainDeployAltitudeAGL,
  };
  workspace.site.altitudeASLM = COSMIC_CARGO_CONDITIONS.launchAltitudeASL;
  act(() => {
    adoptProject(
      createProjectEnvelope({
        vehicle: { ...cosmicCargoLike(), launchSite: { altitudeM: COSMIC_CARGO_CONDITIONS.launchAltitudeASL } },
        workspace,
      }),
    );
  });
}

async function importFile(name: string, text: string): Promise<void> {
  const input = screen.getByLabelText('Flight log file') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File([text], name, { type: 'text/csv' })] } });
  await waitFor(() => expect(readKvValue('Source file')).toBe(name));
}

async function fit(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /fit drag to this log/i }));
  await waitFor(() => {
    expect((screen.getByRole('button', { name: /fit drag to this log/i }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector('[data-drag-fit]')).not.toBeNull();
  }, { timeout: 20_000 });
}

describe('EvidenceStudio', () => {
  beforeAll(async () => {
    // jsdom's import.meta.url is not a file URL; vitest runs from the repository root.
    const bytes = readFileSync('src/engine/astraea_engine.wasm');
    const engine = await instantiateEngine(bytes);
    setTestEngine((async (command, args) => engine.call(command, args)) as EngineInvoke);
  });
  afterAll(() => setTestEngine(null));

  beforeEach(() => {
    resetConsoleState();
    useProjectStore.getState().loadPreset('estesAlpha');
    render(<EvidenceStudio />);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('parses a pasted flight-log CSV, resamples at dt, and shows apogee', async () => {
    const textarea = screen.getByLabelText('Altimeter CSV data');
    fireEvent.change(textarea, { target: { value: FLIGHT_CSV } });

    fireEvent.click(screen.getByRole('button', { name: /parse/i }));
    await screen.findByText('Log provenance — what was received, not inferred');

    expect(readKvValue('Samples parsed')).toBe('13');
    fireEvent.click(screen.getByRole('button', { name: /^resample$/i }));
    expect(readKvValue('Samples @ dt')).toBe('13');
    // Apogee of the resampled series: 214.2 m at 3.0 s, the raw max.
    expect(readKvValue('Apogee altitude')).toBe('214.2 m');
    expect(readKvValue('Apogee at')).toBe('3.0 s');
  });

  it('shows the provenance record after a paste: name, checksum, rows, dialect, units', async () => {
    fireEvent.change(screen.getByLabelText('Altimeter CSV data'), { target: { value: FLIGHT_CSV } });
    fireEvent.click(screen.getByRole('button', { name: /parse/i }));
    await screen.findByText('Log provenance — what was received, not inferred');

    expect(readKvValue('Source file')).toBe('pasted text');
    expect(readKvValue('Rows parsed')).toBe('13');
    expect(readKvValue('Dialect')).toBe('generic-csv');
    expect(readKvValue('Time unit')).toMatch(/seconds/);
    expect(readKvValue('Altitude unit')).toMatch(/meters/);
    // Header + 13 data rows, no blanks: nothing skipped.
    expect(readKvValue('Skipped lines')).toBe('0');
    // Real SubtleCrypto digest: 64 lowercase hex chars, not a placeholder.
    expect(readKvValue('SHA-256')).toMatch(/^[0-9a-f]{64}$/);
    // Inspectable block with per-field attributes.
    const record = document.querySelector('[data-log-provenance="record"]');
    expect(record).not.toBeNull();
    for (const key of ['source', 'checksum', 'rows', 'dialect', 'units', 'skipped']) {
      expect(record!.querySelector(`[data-log-provenance="${key}"]`)).not.toBeNull();
    }
  });

  it('imports a picked file under its file name and checksum', async () => {
    const csv = 'time,alt\n0,10\n1,20\n';
    const file = new File([csv], 'flight-log.csv', { type: 'text/csv' });
    const input = screen.getByLabelText('Flight log file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText('Log provenance — what was received, not inferred');

    expect(readKvValue('Source file')).toBe('flight-log.csv');
    expect(readKvValue('Rows parsed')).toBe('2');
    expect(readKvValue('Skipped lines')).toBe('1');
  });

  it("reports 'checksum unavailable' instead of fabricating when hashing fails", async () => {
    vi.stubGlobal('crypto', undefined);
    fireEvent.change(screen.getByLabelText('Altimeter CSV data'), { target: { value: FLIGHT_CSV } });
    fireEvent.click(screen.getByRole('button', { name: /parse/i }));
    await screen.findByText('Log provenance — what was received, not inferred');

    expect(readKvValue('SHA-256')).toBe('checksum unavailable');
    // Nothing fabricated: source stays honest pasted-text, rows stay exact.
    expect(readKvValue('Source file')).toBe('pasted text');
    expect(readKvValue('Rows parsed')).toBe('13');
  });

  it('keeps the prior provenance record when a later paste fails', async () => {
    const textarea = screen.getByLabelText('Altimeter CSV data');
    fireEvent.change(textarea, { target: { value: FLIGHT_CSV } });
    fireEvent.click(screen.getByRole('button', { name: /parse/i }));
    await screen.findByText('Log provenance — what was received, not inferred');
    const before = readKvValue('SHA-256');
    expect(before).toMatch(/^[0-9a-f]{64}$/);

    fireEvent.change(textarea, { target: { value: 'garbage header\n0,1' } });
    fireEvent.click(screen.getByRole('button', { name: /parse/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/parseAltimeterCsv/i));

    expect(readKvValue('SHA-256')).toBe(before);
    expect(readKvValue('Rows parsed')).toBe('13');
  });

  it('keeps the last successful import labeled separately when a parse fails', () => {
    const textarea = screen.getByLabelText('Altimeter CSV data');
    fireEvent.change(textarea, { target: { value: FLIGHT_CSV } });
    fireEvent.click(screen.getByRole('button', { name: /parse/i }));
    expect(readKvValue('Samples parsed')).toBe('13');

    fireEvent.change(textarea, { target: { value: 'garbage header\n0,1' } });
    fireEvent.click(screen.getByRole('button', { name: /parse/i }));

    // The prior import survives and is labeled separately from the failure.
    expect(screen.getByRole('alert').textContent).toMatch(/parseAltimeterCsv/i);
    expect(readKvValue('Samples parsed')).toBe('13');
    expect(screen.getByText(/last successful import/i)).toBeTruthy();
  });

  it('does not mount the recovery card', () => {
    expect(screen.queryByLabelText('Recovery bay')).toBeNull();
    expect(screen.queryByLabelText('Shear pin count')).toBeNull();
  });

  describe('drag calibration from the imported log', () => {
    beforeEach(() => loadCosmicCargo());

    it('cannot fit without a log, and says why', () => {
      const button = screen.getByRole('button', { name: /fit drag to this log/i }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.title).toMatch(/import a flight log/i);
    });

    it('derives the coast from the log, fits it against the model, and shows every number it used', async () => {
      await importFile('cosmic-cargo-2986-coast.csv', coastCsv);
      expect(screen.getByText(/assumes unpowered ascent/i)).toBeTruthy();
      const methodDetails = screen.getByText('Fit method and limits').closest('details');
      expect(methodDetails).not.toBeNull();
      expect(methodDetails!.open).toBe(false);
      expect(methodDetails!.textContent).toMatch(/Common assumed mass cancels only for fixed input trajectories/);
      await fit();
      expect(readKvValue('Velocity peak → highest recorded altitude')).toMatch(/^2\.20 s → 7\.44 s$/);
      expect(readKvValue('Smoothing half-width')).toBe('±0.10 s');
      expect(readKvValue('Model smoothing half-width')).toBe('±0.25 s');
      expect(readKvValue('Selected speed range')).toMatch(/m\/s$/);
      expect(readKvValue('Model selected speed range')).toMatch(/m\/s$/);

      // Heuristic window opens one smoothing half-width after the velocity-peak proxy.
      const window = readKvValue('Data window');
      const [start, end] = window.split('–').map((t) => Number.parseFloat(t));
      expect(start).toBeGreaterThan(2.2);
      expect(start).toBeLessThan(2.45);
      expect(end).toBeGreaterThan(7.0);
      expect(end).toBeLessThanOrEqual(7.45);
      expect(readKvValue('Method')).toBe('velocity column');

      // Counts: used + excluded accounts for every candidate, and the log has 406 samples.
      const used = numberOf('Points used');
      const excluded = numberOf('Points excluded');
      expect(used).toBeGreaterThan(300);
      expect(used + excluded).toBeLessThanOrEqual(406);
      expect(excluded).toBeGreaterThan(0);

      // Both sides use the committed design dry mass plus motor casing.
      const fitted = numberOf('Fitted effective Cd');
      const model = numberOf('Model coast Cd');
      const scale = numberOf('Drag scale');
      expect(fitted).toBeGreaterThan(0.47);
      expect(fitted).toBeLessThan(0.51);
      expect(model).toBeGreaterThan(0.54);
      expect(model).toBeLessThan(0.57);
      expect(scale).toBeCloseTo(fitted / model, 2);
      expect(numberOf('In-sample equivalent-force RMSE')).toBeGreaterThan(0);
      // The log's own apogee next to the uncalibrated model apogee: the model flies ~27 % high.
      expect(readKvValue('Highest logged altitude / model apogee')).toMatch(/^291\.\d m \/ 37\d\.\d m$/);
      // The mass used is stated with its parts.
      expect(readKvValue('Coast mass')).toMatch(/^\d+\.\d g$/);
    });

    it('retains the real-log preview and refuses application even after event refit without motion/mass evidence', async () => {
      await importFile('cosmic-cargo-2986-coast.csv', coastCsv);
      await fit();
      expect(useProjectStore.getState().project.dragCalibration).toBeUndefined();
      const apply = () => screen.getByRole<HTMLButtonElement>('button', { name: /apply to this project/i });
      expect(numberOf('Drag scale')).toBeGreaterThan(0.8);
      expect(numberOf('Drag scale')).toBeLessThan(1);
      expect(apply().disabled).toBe(true);
      fireEvent.click(apply());
      expect(useProjectStore.getState().project.dragCalibration).toBeUndefined();

      const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
      change('Log final burnout earliest (s)', '1.887');
      change('Log final burnout latest (s)', '1.887');
      change('Log recovery evidence', 'first-event');
      change('Log first recovery earliest (s)', '7.205');
      change('Log first recovery latest (s)', '7.205');
      change('Log event source and clock basis', 'Tracked Cosmic Cargo coast CSV preamble; source log clock');
      expect(document.querySelector('[data-calibration-eligibility]')?.getAttribute('data-calibration-eligibility')).toBe('unsupported');
      expect(apply().disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Refit within reviewed events' }));
      expect(document.querySelector('[data-coast-selection]')?.getAttribute('data-coast-selection')).toBe('reviewed-events-v1');
      expect(document.querySelector('[data-calibration-eligibility]')?.getAttribute('data-calibration-eligibility')).toBe('unverified');
      expect(numberOf('Drag scale')).toBeGreaterThan(0.8);
      expect(numberOf('Drag scale')).toBeLessThan(1);
      expect(apply().disabled).toBe(true);
      fireEvent.click(apply());
      expect(useProjectStore.getState().project.dragCalibration).toBeUndefined();
      expect(document.querySelector('[data-drag-calibration-applied]')).toBeNull();
    });

    it('retains a legacy adjustment as unverified and allows its removal', () => {
      act(() => consoleActions.setDragCalibration(LEGACY_ADJUSTMENT, 'Load historical unverified adjustment'));
      expect(useProjectStore.getState().project.dragCalibration).toEqual(LEGACY_ADJUSTMENT);
      expect(readKvValue('Log file')).toBe('legacy-unverified.csv');
      expect(readKvValue('Log SHA-256')).toBe('checksum unavailable');
      expect(document.querySelector('[data-drag-calibration-applied]')).not.toBeNull();
      expect(screen.getByText(/Legacy adjustment retained.*eligibility.*unverified/i)).toBeTruthy();
      expect(screen.getByText(/Calibrated means adjustment applied, not verified accuracy/i)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /remove calibration/i }));
      expect(useProjectStore.getState().project.dragCalibration).toBeUndefined();
      expect(document.querySelector('[data-drag-calibration-applied]')).toBeNull();
    });

    it('measures the model without any applied calibration, so re-fitting gives the same numbers', async () => {
      await importFile('cosmic-cargo-2986-coast.csv', coastCsv);
      await fit();
      const first = { scale: readKvValue('Drag scale'), model: readKvValue('Model coast Cd') };
      act(() => consoleActions.setDragCalibration(LEGACY_ADJUSTMENT, 'Load historical unverified adjustment'));
      await fit();
      expect(useProjectStore.getState().project.dragCalibration).toEqual(LEGACY_ADJUSTMENT);
      expect(readKvValue('Drag scale')).toBe(first.scale);
      expect(readKvValue('Model coast Cd')).toBe(first.model);
    });

    it('derives the same scale from altitude alone when the log has no velocity column', async () => {
      await importFile('cosmic-cargo-2986-coast.csv', coastCsv);
      await fit();
      const withVelocity = numberOf('Drag scale');

      const altitudeOnly = ['time_s,altitude_m', ...parseTrajectoryCsv(coastCsv).samples.map((s) => `${s.timeS},${s.altitudeM}`)].join('\n');
      await importFile('altitude-only.csv', altitudeOnly);
      expect(screen.queryByText(/result is stale/i)).not.toBeNull();
      await fit();
      expect(readKvValue('Method')).toBe('altitude derivative');
      expect(Math.abs(numberOf('Drag scale') / withVelocity - 1)).toBeLessThan(0.03);
    });

    it('marks the fit stale and hides its numbers when the log changes', async () => {
      await importFile('cosmic-cargo-2986-coast.csv', coastCsv);
      await fit();
      expect(document.querySelector('[data-drag-fit]')).not.toBeNull();

      await importFile('again.csv', coastCsv.replace('Device tag,BECs Nano 2', 'Device tag,BECs Nano 3'));
      expect(document.querySelector('[data-drag-fit]')).toBeNull();
      expect(screen.getByText(/result is stale.*fit again/i)).toBeTruthy();
      expect(screen.queryByText('Drag scale')).toBeNull();
    });

    it('marks the fit stale when the design, the motor or the site changes', async () => {
      await importFile('cosmic-cargo-2986-coast.csv', coastCsv);
      for (const edit of [
        () => consoleActions.setComponent('cc-bt', { length: 0.3 }, 'Lengthen body'),
        () => consoleActions.setLaunchAltitude(250, 'Move site'),
        () => consoleActions.setMotor('estes_c11'),
      ]) {
        await fit();
        expect(document.querySelector('[data-drag-fit]')).not.toBeNull();
        act(() => edit());
        expect(document.querySelector('[data-drag-fit]')).toBeNull();
        expect(screen.getByText(/result is stale.*fit again/i)).toBeTruthy();
      }
    });

    it('refuses a log that has no coast phase and shows the reason', async () => {
      const climbing = ['time_s,altitude_m,velocity_m_s', ...Array.from({ length: 80 }, (_, i) => `${i * 0.1},${i * 2},20`)].join('\n');
      await importFile('climb.csv', climbing);
      fireEvent.click(screen.getByRole('button', { name: /fit drag to this log/i }));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/coast|burnout/i);
      expect(document.querySelector('[data-drag-fit]')).toBeNull();
    });
  });

  describe('manual coast points (advanced)', () => {
    const open = (): void => {
      (document.querySelector('details') as HTMLDetailsElement).open = true;
    };

    it('starts with no rows and no demo data', () => {
      open();
      expect(screen.queryByLabelText('Row 1 velocity m s')).toBeNull();
      expect(screen.queryByText('PRESET')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /calibrate cd/i }));
      expect(screen.queryByText('Cd candidate')).toBeNull();
    });

    it('fits entered points into an analysis-only candidate that cannot be applied', () => {
      open();
      const rows = [
        { v: '60', a: '36', m: '1.4', area: '0.0045' },
        { v: '45', a: '21.5', m: '1.4', area: '0.0045' },
        { v: '30', a: '12.4', m: '1.4', area: '0.0045' },
      ];
      rows.forEach((row, i) => {
        fireEvent.click(screen.getByRole('button', { name: /\+ add row/i }));
        fireEvent.change(screen.getByLabelText(`Row ${i + 1} velocity m s`), { target: { value: row.v } });
        fireEvent.change(screen.getByLabelText(`Row ${i + 1} accel m s2`), { target: { value: row.a } });
        fireEvent.change(screen.getByLabelText(`Row ${i + 1} mass kg`), { target: { value: row.m } });
        fireEvent.change(screen.getByLabelText(`Row ${i + 1} area m2`), { target: { value: row.area } });
      });
      fireEvent.click(screen.getByRole('button', { name: /calibrate cd/i }));

      const cd = Number.parseFloat(readKvValue('Cd candidate'));
      expect(cd).toBeGreaterThan(0);
      expect(screen.getByText(/analysis-only candidate.*not tied to a flight log/i)).toBeTruthy();
      // Nothing was applied to the project.
      expect(useProjectStore.getState().project.dragCalibration).toBeUndefined();
    });

    it('prefills only the air density of a new row, from the site', () => {
      open();
      fireEvent.click(screen.getByRole('button', { name: /\+ add row/i }));
      expect((screen.getByLabelText('Row 1 density kg m3') as HTMLInputElement).value).toMatch(/^1\.\d{4}$/);
      expect((screen.getByLabelText('Row 1 velocity m s') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Row 1 mass kg') as HTMLInputElement).value).toBe('');
    });

    it('surfaces the fitter error when fewer than 3 usable points remain', () => {
      open();
      fireEvent.click(screen.getByRole('button', { name: /\+ add row/i }));
      fireEvent.change(screen.getByLabelText('Row 1 velocity m s'), { target: { value: '1.0' } });
      fireEvent.change(screen.getByLabelText('Row 1 accel m s2'), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText('Row 1 mass kg'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('Row 1 area m2'), { target: { value: '0.004' } });
      fireEvent.click(screen.getByRole('button', { name: /calibrate cd/i }));

      expect(screen.getByText(/need at least 3 usable coast points/i)).toBeTruthy();
      expect(screen.queryByText('Cd candidate')).toBeNull();
    });

    it('edits, additions and removals invalidate a previous fit into a stale state', () => {
      open();
      for (let i = 1; i <= 4; i++) {
        fireEvent.click(screen.getByRole('button', { name: /\+ add row/i }));
        fireEvent.change(screen.getByLabelText(`Row ${i} velocity m s`), { target: { value: String(20 + i * 10) } });
        fireEvent.change(screen.getByLabelText(`Row ${i} accel m s2`), { target: { value: String(5 + i * 4) } });
        fireEvent.change(screen.getByLabelText(`Row ${i} mass kg`), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText(`Row ${i} area m2`), { target: { value: '0.004' } });
      }
      for (const change of [
        () => fireEvent.change(screen.getByLabelText('Row 1 velocity m s'), { target: { value: '35' } }),
        () => fireEvent.click(screen.getByRole('button', { name: /remove coast point row 4/i })),
        () => fireEvent.click(screen.getByRole('button', { name: /\+ add row/i })),
      ]) {
        fireEvent.click(screen.getByRole('button', { name: /calibrate cd/i }));
        expect(readKvValue('Cd candidate')).not.toBe('—');
        change();
        expect(screen.queryByText('Cd candidate')).toBeNull();
        expect(screen.getByText(/result is stale.*recalibrate/i)).toBeTruthy();
      }
    });
  });
});
