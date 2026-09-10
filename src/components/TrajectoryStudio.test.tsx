/**
 * TrajectoryStudio surface suite (jsdom).
 *
 * Exercises the exported TrajectoryStudio panel against an inline Estes
 * Alpha-class vehicle (no store dependency) and the certified Estes C6 motor:
 *   1. All four sections render with the passed vehicle/motor identity.
 *   2. The wind probe readout tracks the manual table (add/remove rows) and
 *      the altitude slider, via the real windAtAltitude/windToENU chain.
 *   3. Live sounding shows the layer count on a valid fetch and error text on
 *      a failing fetch (default fetch slot, no API key involved).
 *   4. Monte Carlo with nRuns=5 and zero sigmas completes synchronously and
 *      shows a pad-consistent mean landing with zero spread (vertical rail +
 *      zero-wind default field).
 *   5. Protuberance drag and boattail separation advisories react to inputs.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TrajectoryStudio } from './TrajectoryStudio';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
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

const renderStudio = () => render(<TrajectoryStudio vehicle={ALPHA_CLASS_VEHICLE} motor={CERTIFIED_MOTORS.estes_c6} />);

describe('TrajectoryStudio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders all four sections with the passed vehicle and motor', () => {
    renderStudio();
    expect(screen.getByText('Trajectory & Weather Studio')).toBeTruthy();
    expect(screen.getByText('Estes Alpha Class')).toBeTruthy();
    expect(screen.getByText('Estes C6')).toBeTruthy();
    expect(screen.getByText('Manual Wind Shear Table')).toBeTruthy();
    expect(screen.getByText('Live Sounding (Open-Meteo)')).toBeTruthy();
    expect(screen.getByText('Monte Carlo Dispersion')).toBeTruthy();
    expect(screen.getByText('Boattail Flow Separation')).toBeTruthy();
    expect(screen.getByText('Protuberance Drag')).toBeTruthy();
    // Defaults: 50 runs, 200 cap, single wind row.
    expect((screen.getByLabelText('Monte Carlo run count') as HTMLInputElement).value).toBe('50');
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
  });

  it('runs a zero-sigma Monte Carlo with nRuns=5 and shows a pad-consistent mean landing', async () => {
    renderStudio();
    fireEvent.change(screen.getByLabelText('Monte Carlo run count'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Wind direction sigma (deg)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Rail angle sigma (deg)'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Impulse sigma (%)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /run monte carlo/i }));

    // Synchronous run: block until the result panel renders (bounded by the
    // real 6-DOF simulator's runtime for 5 runs).
    await waitFor(
      () => expect(screen.getByText('5 succeeded · 0 failed')).toBeTruthy(),
      { timeout: 180000 },
    );
    // Zero sigma: every run is the unperturbed trajectory, so the cloud has
    // zero spread and (vertical rail, zero wind) lands at the pad.
    const mean = screen.getByLabelText('Mean landing (m)').textContent ?? '';
    expect(mean).toMatch(/E -?\d+(?:\.\d+)? · N -?\d+(?:\.\d+)? m/);
    const match = /E (-?\d+(?:\.\d+)?) · N (-?\d+(?:\.\d+)?)/.exec(mean);
    expect(match).toBeTruthy();
    const [east, north] = [Number(match![1]), Number(match![2])];
    expect(Math.hypot(east, north)).toBeLessThan(50);
    expect(screen.getByLabelText('Sigma 1 (m)').textContent).toBe('0.0 m');
    expect(screen.getByLabelText('Sigma 2 (m)').textContent).toBe('0.0 m');
    expect(screen.getByLabelText('r50 (m)').textContent).toBe('0 m');
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