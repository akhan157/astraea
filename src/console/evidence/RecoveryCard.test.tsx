/**
 * RecoveryCard surface suite — derived-bay packing strip and shear-pin /
 * black-powder charge sizing (mounted in the Recovery stage).
 *
 *   1. The default bay derives from the vehicle tube; charge mass and the
 *      packing advisory read out with their provenance.
 *   2. Manual entry keeps scratch dimensions with entered provenance.
 *   3. Two chutes in one tube surface as an ambiguity rather than a guess.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { RecoveryCard } from './RecoveryCard';
import { consoleActions } from '../store';
import { useProjectStore } from '../../state/project';
import { resetConsoleState } from '../testFixtures';

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

describe('RecoveryCard', () => {
  beforeEach(() => {
    resetConsoleState();
    useProjectStore.getState().loadPreset('estesAlpha');
    render(<RecoveryCard />);
  });

  afterEach(() => cleanup());

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
    const vehicle = structuredClone(useProjectStore.getState().project.vehicle);
    const chute = vehicle.components.find((c) => c.type === 'parachute');
    if (chute === undefined) throw new Error('default vehicle must carry a chute');
    vehicle.components.push({ ...chute, id: 'second-chute', name: 'Second chute' });
    act(() => {
      consoleActions.setVehicle(vehicle, 'Duplicate chute');
    });
    try {
      expect(screen.getByText(/2 chutes share this tube/)).toBeTruthy();
      expect(screen.getByText(/stacking order is list order \(assumed\)/)).toBeTruthy();
    } finally {
      act(() => resetConsoleState());
    }
  });
});
