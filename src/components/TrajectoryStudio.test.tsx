/**
 * TrajectoryStudio surface suite (jsdom).
 *
 * The panel reads the ACTIVE vehicle + shared flight-motor selection from
 * the RocketStore (Round-19 coherence — no vehicle/motor props). The store
 * is primed with an inline Estes Alpha-class vehicle before each render:
 *   1. All four sections render with the store vehicle/motor identity.
 *   2. The wind probe readout tracks the manual table (add/remove rows) and
 *      the altitude slider, via the real windAtAltitude/windToENU chain.
 *   3. Live sounding shows the layer count on a valid fetch and error text on
 *      a failing fetch (default fetch slot, no API key involved).
 *   4. Monte Carlo with nRuns=5 and zero sigmas completes synchronously and
 *      shows a pad-consistent mean landing with zero spread (85° default rail +
 *      zero-wind default field).
 *   5. A fetched sounding drives the MC wind (sounding > manual precedence)
 *      and drifts the mean landing away from the pad.
 *   6. MC results carry a FRESH/STALE badge keyed on every input change.
 *   7. Protuberance drag and boattail separation advisories react to inputs.
 *   8. The default MC config (85° rail, 5°/1°/3° sigmas, 50 runs) finishes
 *      with zero failed runs; pinning the user-adjustable rail to the 90°
 *      domain boundary rejects a share of the 1σ perturbed runs.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TrajectoryStudio } from './TrajectoryStudio';
import { useRocketStore } from '../store/rocketStore';
import { computeProtuberanceDrag } from '../aero/protuberance';
import type { RocketVehicle } from '../core/types';

/** Minimal Estes Alpha-class airframe: nose, BT-50 tube, 3 fins, chute. */
const ALPHA_CLASS_VEHICLE: RocketVehicle = {
  id: 'test-alpha',
  name: 'Estes Alpha Class',
  version: '1.0',
  author: 'Astraea Test',
  components: [
    {
      id: 'alpha-nc',
      name: 'Ogive Nosecone',
      type: 'nosecone',
      shape: 'ogive',
      length: 0.165,
      baseDiameter: 0.0248,
      wallThickness: 0.0015,
      isHollow: true,
      materialId: 'pla_3dprint',
      color: '#ef4444',
    },
    {
      id: 'alpha-bt',
      name: 'Main Body Tube (BT-50)',
      type: 'bodytube',
      length: 0.311,
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      isMotorMount: true,
      materialId: 'cardboard',
      color: '#ffffff',
    },
    {
      id: 'alpha-fins',
      name: 'Stabilizer Fins (3-Fin)',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.07,
      tipChord: 0.028,
      span: 0.051,
      sweepLength: 0.038,
      thickness: 0.002,
      crossSection: 'rounded',
      axialOffset: 0.241,
      materialId: 'pla_3dprint',
      color: '#ef4444',
    },
    {
      id: 'alpha-chute',
      name: '12" Parachute',
      type: 'parachute',
      diameter: 0.305,
      cd: 0.8,
      mass: 0.008,
      axialOffset: 0.05,
      materialId: 'cardboard',
    },
  ],
};

/** Prime the store with the alpha-class vehicle + the C6 flight motor. */
const renderStudio = () => {
  const store = useRocketStore.getState();
  store.resetStore();
  store.setVehicle(ALPHA_CLASS_VEHICLE);
  store.selectMotor('estes_c6');
  return render(<TrajectoryStudio key={ALPHA_CLASS_VEHICLE.id} />);
};

const runCountInput = () => screen.getByLabelText('Monte Carlo run count') as HTMLInputElement;
/** Four-field contract scoped to the MC result card (Astra P0-1). */
const cardFields = () => within(document.querySelector('[data-run-card-fields="true"]') as HTMLElement);
/** Four-field contract scoped to the latest-attempt run record line. */
const recordFields = () => within(document.querySelector('[data-run-record-fields="true"]') as HTMLElement);
const zeroSigmaRun = () => {
  fireEvent.change(runCountInput(), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Wind direction sigma (deg)'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Rail angle sigma (deg)'), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Impulse sigma (%)'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: /run monte carlo/i }));
};

describe('TrajectoryStudio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders all four sections with the store vehicle and motor', () => {
    renderStudio();
    expect(screen.getByText('Trajectory & Weather Studio')).toBeTruthy();
    expect(screen.getByText('Estes Alpha Class')).toBeTruthy();
    expect(screen.getByText('Estes C6')).toBeTruthy();
    expect(screen.getByText('Manual Wind Shear Table')).toBeTruthy();
    expect(screen.getByText('Live Sounding (Open-Meteo)')).toBeTruthy();
    expect(screen.getByText('Monte Carlo Dispersion')).toBeTruthy();
    expect(screen.getByText('Boattail Flow Separation')).toBeTruthy();
    expect(screen.getByText('Protuberance Drag')).toBeTruthy();
    // Defaults: 50 runs, 85° rail, single wind row, probe at 0 m (surface).
    expect(runCountInput().value).toBe('50');
    expect((screen.getByLabelText('Rail elevation (deg)') as HTMLInputElement).value).toBe('85');
    expect((screen.getByLabelText('Wind probe altitude (m)') as HTMLInputElement).value).toBe('0');
  });

  it('drives the wind probe readout from the manual table rows, add/remove, and altitude slider', () => {
    renderStudio();
    // Default single zero row: probe speed is 0 at any altitude.
    expect(screen.getByText('0.0 m/s')).toBeTruthy();

    // Add a second layer at 100 m with 10 m/s FROM east and move the probe there.
    fireEvent.click(screen.getByRole('button', { name: /add wind layer/i }));
    fireEvent.change(screen.getByLabelText('Wind layer 2 altitude (m)'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Wind layer 2 speed (m/s)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Wind layer 2 direction from (deg)'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Wind probe altitude (m)'), { target: { value: '100' } });
    expect(screen.getByText('10.0 m/s')).toBeTruthy();
    // FROM east (90°) blows toward west: east = -10, north ≈ 0 (IEEE cos(π)
    // residue surfaces as ±0.00 in the readout).
    expect(screen.getByLabelText('ENU east (m/s)').textContent).toBe('-10.00 m/s');
    expect(screen.getByLabelText('ENU north (m/s)').textContent).toMatch(/^-?0\.00 m\/s$/);

    // Removing the zero row leaves the 10 m/s layer driving the readout.
    fireEvent.click(screen.getByRole('button', { name: /remove wind layer 1/i }));
    expect(screen.getByText('10.0 m/s')).toBeTruthy();
  });

  it('shows the sounding layer count when a valid profile is fetched', async () => {
    renderStudio();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          hourly: {
            temperature_1000hPa: [20],
            wind_speed_1000hPa: [3],
            wind_direction_1000hPa: [270],
            temperature_850hPa: [10],
            wind_speed_850hPa: [5],
            wind_direction_850hPa: [250],
          },
        }),
      })),
    );
    fireEvent.click(screen.getByRole('button', { name: /fetch live sounding/i }));
    await waitFor(() => expect(screen.getByText('2 pressure levels fetched')).toBeTruthy(), { timeout: 5000 });
    // The MC wind source flips to the live sounding (precedence note).
    expect(screen.getByText(/live sounding, interpolated @ 0 m/)).toBeTruthy();
  });

  it('shows error text when the sounding fetch fails', async () => {
    renderStudio();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unavailable');
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /fetch live sounding/i }));
    await waitFor(
      () => expect(screen.getByText('Sounding failed: network unavailable')).toBeTruthy(),
      { timeout: 5000 },
    );
    // Manual table remains the MC wind source after a failed fetch.
    expect(screen.getByText('Wind for MC: manual wind table (surface probe)')).toBeTruthy();
  });

  it('runs a zero-sigma Monte Carlo with nRuns=5 and shows a pad-consistent mean landing', async () => {
    renderStudio();
    zeroSigmaRun();

    // Synchronous run: block until the result panel renders (bounded by the
    // real 6-DOF simulator's runtime for 5 runs).
    await waitFor(
      () => expect(screen.getByText('5 succeeded · 0 failed')).toBeTruthy(),
      { timeout: 180000 },
    );
    // Zero sigma: every run is the unperturbed trajectory, so the cloud has
    // zero spread and (85° default rail, zero wind) lands near the pad.
    const mean = screen.getByLabelText('Mean landing (m)').textContent ?? '';
    expect(mean).toMatch(/E -?\d+(?:\.\d+)? · N -?\d+(?:\.\d+)? m/);
    const match = /E (-?\d+(?:\.\d+)?) · N (-?\d+(?:\.\d+)?)/.exec(mean);
    expect(match).toBeTruthy();
    const [east, north] = [Number(match![1]), Number(match![2])];
    // The 85° default rail (5° off vertical) plus descent drift puts the
    // unperturbed touchdown ~60 m downrange — still a pad-local landing.
    expect(Math.hypot(east, north)).toBeLessThan(100);
    expect(screen.getByLabelText('Sigma 1 (m)').textContent).toBe('0.0 m');
    expect(screen.getByLabelText('Sigma 2 (m)').textContent).toBe('0.0 m');
    expect(screen.getByLabelText('r50 (m)').textContent).toBe('0 m');
    // Four separate status fields (Astra P0-1): execution / validity /
    // freshness / gate — freshness derives from the complete snapshot.
    expect(cardFields().getByText('Execution: Executed')).toBeTruthy();
    expect(cardFields().getByText('Validity: Valid')).toBeTruthy();
    expect(cardFields().getByText('Freshness: Current')).toBeTruthy();
    expect(cardFields().getByText('Gate: unknown')).toBeTruthy();
    // The run record line carries the same four fields.
    expect(recordFields().getByText('Execution: Executed')).toBeTruthy();
    expect(recordFields().getByText('Freshness: Current')).toBeTruthy();
  }, 300000);

  it('runs the default MC config (85° rail, 5°/1°/3° sigmas) with zero failed runs on the preset vehicle', async () => {
    renderStudio();
    // Defaults untouched: 50 runs, 85° rail, 5° wind / 1° rail / 3% impulse.
    expect((screen.getByLabelText('Rail elevation (deg)') as HTMLInputElement).value).toBe('85');
    fireEvent.click(screen.getByRole('button', { name: /run monte carlo/i }));
    await waitFor(
      () => expect(screen.getByText('50 succeeded · 0 failed')).toBeTruthy(),
      { timeout: 300000 },
    );
  }, 400000);

  it('lets the user pin the rail to 90°, where the 1σ rail perturbation domain-rejects runs', async () => {
    renderStudio();
    // Isolate the rail: zero wind/impulse sigmas, keep the default 1° rail
    // sigma, and move the user-adjustable rail to the 90° domain boundary.
    fireEvent.change(runCountInput(), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Rail elevation (deg)'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Wind direction sigma (deg)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Impulse sigma (%)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /run monte carlo/i }));
    // Positive Gaussian rail draws exceed 90° and are rejected; negative draws
    // stay in domain, so the control demonstrably feeds the simulator and the
    // run mix carries failures (the 85° default above carries none).
    await waitFor(
      () => expect(screen.getByText(/^\d+ succeeded · [1-9]\d* failed$/)).toBeTruthy(),
      { timeout: 300000 },
    );
  }, 400000);

  it('uses the fetched live sounding for MC wind (sounding > manual)', async () => {
    renderStudio();
    // Strong surface wind sounding (15 m/s FROM west at the 1000 hPa level):
    // probe altitude 0 clamps to the lowest layer, so MC flies a 15 m/s
    // westward-blow wind — nothing like the zero-wind manual table.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          hourly: {
            temperature_1000hPa: [20],
            wind_speed_1000hPa: [15],
            wind_direction_1000hPa: [270],
            temperature_850hPa: [10],
            wind_speed_850hPa: [20],
            wind_direction_850hPa: [250],
          },
        }),
      })),
    );
    fireEvent.click(screen.getByRole('button', { name: /fetch live sounding/i }));
    await waitFor(() => expect(screen.getByText('2 pressure levels fetched')).toBeTruthy(), {
      timeout: 5000,
    });

    zeroSigmaRun();
    await waitFor(
      () => expect(screen.getByText('5 succeeded · 0 failed')).toBeTruthy(),
      { timeout: 180000 },
    );
    // The sounding drives the surface wind: the cloud drifts east (wind FROM
    // 270° blows toward 90°/east) — decisively far from the manual-table pad.
    const mean = screen.getByLabelText('Mean landing (m)').textContent ?? '';
    const match = /E (-?\d+(?:\.\d+)?) · N (-?\d+(?:\.\d+)?)/.exec(mean);
    expect(match).toBeTruthy();
    const east = Number(match![1]);
    expect(east).toBeGreaterThan(50);
  }, 300000);

  it('stales the card AND the run record on wind/count/sigma edits with a reason; undo and rerun restore current', async () => {
    renderStudio();
    zeroSigmaRun();
    await waitFor(
      () => expect(screen.getByText('5 succeeded · 0 failed')).toBeTruthy(),
      { timeout: 180000 },
    );
    expect(cardFields().getByText('Freshness: Current')).toBeTruthy();
    expect(recordFields().getByText('Freshness: Current')).toBeTruthy();

    // Wind edit → EVERY surface stale with the same visible reason.
    fireEvent.change(screen.getByLabelText('Wind layer 1 speed (m/s)'), { target: { value: '5' } });
    const windReason = 'Freshness: Stale — wind inputs changed (manual table / probe / sounding)';
    expect(cardFields().getByText(windReason)).toBeTruthy();
    expect(recordFields().getByText(windReason)).toBeTruthy();

    // Undo-to-identical restores current WITHOUT a rerun (same full key).
    fireEvent.change(screen.getByLabelText('Wind layer 1 speed (m/s)'), { target: { value: '0' } });
    expect(cardFields().getByText('Freshness: Current')).toBeTruthy();
    expect(recordFields().getByText('Freshness: Current')).toBeTruthy();

    // Run-count edit → stale with the perturbation reason on every surface.
    fireEvent.change(runCountInput(), { target: { value: '10' } });
    const perturbationReason = 'Freshness: Stale — run count or sigma changed';
    expect(cardFields().getByText(perturbationReason)).toBeTruthy();
    expect(recordFields().getByText(perturbationReason)).toBeTruthy();

    // Sigma edit → stale with the same perturbation reason.
    fireEvent.change(screen.getByLabelText('Wind direction sigma (deg)'), { target: { value: '5' } });
    expect(cardFields().getByText(perturbationReason)).toBeTruthy();
    expect(recordFields().getByText(perturbationReason)).toBeTruthy();

    // A rerun at the new inputs refreshes every surface.
    fireEvent.click(screen.getByRole('button', { name: /run monte carlo/i }));
    await waitFor(() => expect(cardFields().getByText('Freshness: Current')).toBeTruthy(), {
      timeout: 180000,
    });
    expect(recordFields().getByText('Freshness: Current')).toBeTruthy();
  }, 300000);

  it('computes protuberance drag and flags boattail separation from the transition geometry', () => {
    renderStudio();
    // Defaults: lug 5e-5 m^2 / 2 mm over a 10 mm boundary layer on BT-50 ref area.
    const expectedCd = computeProtuberanceDrag({
      frontalArea: 0.00005,
      refArea: 0.0004839,
      lugHeight: 0.002,
      boundaryLayerThickness: 0.01,
    });
    expect(screen.getByLabelText('Protuberance drag coefficient').textContent).toBe(expectedCd.toFixed(4));

    // 24.8 → 20 mm over 50 mm ⇒ half-angle ≈ 2.7° ⇒ attached.
    expect(screen.getByText(/ATTACHED/)).toBeTruthy();
    // 24.8 → 2 mm over 50 mm ⇒ half-angle ≈ 12.8° > 10° ⇒ separated.
    fireEvent.change(screen.getByLabelText('Aft diameter (m)'), { target: { value: '0.002' } });
    expect(screen.getByText(/SEPARATED/)).toBeTruthy();
    expect(screen.getByText(/half-angle 12\.\d/)).toBeTruthy();
  });
});