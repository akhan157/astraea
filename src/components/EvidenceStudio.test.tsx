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
import { render, screen, fireEvent } from '@testing-library/react';
import { EvidenceStudio } from './EvidenceStudio';

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

  it('reads out a positive BP charge mass and an advisory badge for the bay density', () => {
    // Defaults: 0.9 m bay, 0.1 m inner diameter, 320 g chute, 4-40 pins, 4 pins.
    const bp = Number.parseFloat(readKvValue('BP mass'));
    expect(bp).toBeGreaterThan(0);

    const volume = Number.parseFloat(readKvValue('Bay volume'));
    const density = Number.parseFloat(readKvValue('Packed density'));
    // Display rounds to 4 decimals; density is derived from the displayed volume.
    expect(volume).toBeCloseTo(0.0071, 4);
    expect(density).toBeCloseTo(320 / (volume * 1e6), 3);
    // 4.53e-2 g/cm³ sits below the 0.25 floor -> under-packed badge.
    expect(screen.getByText('LOOSE')).toBeTruthy();
    expect(screen.getByText(/under-packed/)).toBeTruthy();
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
});