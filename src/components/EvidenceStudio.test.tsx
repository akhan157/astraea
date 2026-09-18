/**
 * EvidenceStudio surface suite — evidence ingestion, drag calibration, and
 * recovery packing/charge sizing.
 *
 * Acceptance contract:
 *   1. A pasted flight-log CSV parses, resamples onto the dt grid, and shows
 *      sample counts plus the apogee altitude.
 *   2. The 3-point calibration preset returns a finite, positive Cd + RMSE.
 *   3. Recovery sizing reads out a positive BP charge mass and an advisory
 *      badge for the bay density.
 *   4. Dropping below 3 usable coast points surfaces the fitter's error and
 *      withholds any result readout.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EvidenceStudio } from './EvidenceStudio';
import { useRocketStore } from '../store/rocketStore';

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

describe('EvidenceStudio', () => {
  beforeEach(() => {
    render(<EvidenceStudio />);
  });

  it('parses a pasted flight-log CSV, resamples at dt, and shows apogee', () => {
    const textarea = screen.getByLabelText('Altimeter CSV data');
    fireEvent.change(textarea, { target: { value: FLIGHT_CSV } });

    fireEvent.click(screen.getByRole('button', { name: /parse/i }));

    expect(readKvValue('Samples parsed')).toBe('13');
    fireEvent.click(screen.getByRole('button', { name: /^resample$/i }));
    expect(readKvValue('Samples @ dt')).toBe('13');
    // Apogee of the resampled series: 214.2 m at 3.0 s, the raw max.
    expect(readKvValue('Apogee altitude')).toBe('214.2 m');
    expect(readKvValue('Apogee at')).toBe('3.0 s');
  });

  it('returns a finite Cd + RMSE for the 3-point calibration preset', () => {
    fireEvent.click(screen.getByRole('button', { name: /calibrate cd/i }));

    const cd = Number.parseFloat(readKvValue('Cd calibrated'));
    const rmse = Number.parseFloat(readKvValue('Fit RMSE'));
    expect(Number.isFinite(cd)).toBe(true);
    expect(cd).toBeGreaterThan(0);
    expect(Number.isFinite(rmse)).toBe(true);
    expect(rmse).toBeGreaterThan(0);
  });

  it('derives the default bay from the vehicle tube and reads out charge mass plus advisories', () => {
    // Default vehicle (Estes Alpha): 0.311 m tube, 24.1 mm bore, 8 g chute
    // with no packed dims. Derived contract, not manual scratch values.
    expect(readKvValue('Bay volume')).toBe('0.0001');
    expect(readKvValue('Packed density')).toBe('0.056');
    // 8 g in a 0.142 L bay sits below the 0.25 floor -> under-packed badge.
    expect(screen.getByText('LOOSE')).toBeTruthy();
    expect(screen.getByText(/under-packed/)).toBeTruthy();
    const bp = Number.parseFloat(readKvValue('BP mass'));
    expect(bp).toBeGreaterThan(0);
    // Chute has no packed length: clearance covers the empty stack and the
    // exclusion is explicit.
    expect(readKvValue('Clearance')).toBe('FITS · 311 mm spare');
    expect(screen.getByText(/1 item excluded from clearance — packed length missing/)).toBeTruthy();
  });

  it('surfaces the fitter error when fewer than 3 usable points remain', () => {
    // Repeated low-velocity edits leave only one usable point.
    for (const row of [2, 1, 3]) {
      fireEvent.change(screen.getByLabelText(`Row ${row} velocity m s`), { target: { value: '1.0' } });
    }
    fireEvent.click(screen.getByRole('button', { name: /calibrate cd/i }));

    expect(screen.getByText(/need at least 3 usable coast points/i)).toBeTruthy();
    // No result readout is shown for the failed fit.
    expect(screen.queryByText('Cd calibrated')).toBeNull();
  });

  it('renders the dimensioned strip with entered/assumed/missing provenance', () => {
    // Strip SVG is present and labeled with its construction. The default
    // chute has no packed length, so 0 of 1 items are placed (fits vacuous).
    expect(screen.getByRole('img', { name: /Bay strip: .*311\.0 mm.*0 placed.*fits/ })).toBeTruthy();
    // Bay dims entered from the tree; chute diameter assumed bore; chute
    // length missing (never guessed).
    expect(screen.getAllByText('ENTERED').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('ASSUMED')).toBeTruthy();
    expect(screen.getByText('MISSING')).toBeTruthy();
    expect(readKvValue('Bay length')).toBe('311.0 mm');
    expect(readKvValue('Bay bore')).toBe('⌀24.1 mm');
    // Fit + density are geometry-only: the reliability disclaimer is shown.
    expect(screen.getByText(/packing geometry only — not deployment reliability/)).toBeTruthy();
  });

  it('manual entry keeps scratch dims with entered provenance', () => {
    fireEvent.change(screen.getByLabelText('Recovery bay'), { target: { value: 'manual' } });
    // Manual inputs return; the strip notes the manual source.
    fireEvent.change(screen.getByLabelText('Bay length m'), { target: { value: '1.000' } });
    expect(screen.getByRole('img', { name: /Bay strip: manual entry/ })).toBeTruthy();
    expect(readKvValue('Bay volume')).toBe('0.0079');
    expect(screen.getByText('LOOSE')).toBeTruthy();
  });

  it('surfaces duplicate-chute ambiguity instead of guessing an order', () => {
    const store = useRocketStore.getState();
    const vehicle = structuredClone(store.vehicle);
    const chute = vehicle.components.find((c) => c.type === 'parachute');
    if (chute === undefined) throw new Error('default vehicle must carry a chute');
    vehicle.components.push({ ...chute, id: 'second-chute', name: 'Second chute' });
    act(() => {
      store.setVehicle(vehicle);
    });
    try {
      expect(screen.getByText(/2 chutes share this tube/)).toBeTruthy();
      expect(screen.getByText(/stacking order is list order \(assumed\)/)).toBeTruthy();
    } finally {
      store.resetStore();
    }
  });
});