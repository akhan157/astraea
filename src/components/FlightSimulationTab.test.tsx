/**
 * Automated browser-surface safety suite (Round-16 audit §7.5/§8).
 *
 * Exercises the FlightSimulationTab result contract in jsdom:
 *   1. A run completes and renders outcome, validity, and freshness badges.
 *   2. Safety labels never claim SAFE/GATE PASS outside a certified
 *      (validity-PASS + CURRENT) context — UNVERIFIED otherwise.
 *   3. Changing any input after a run flags results STALE and withdraws
 *      certified safety presentation (the failure-state path: no stale
 *      SAFE/PASS output survives).
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FlightSimulationTab } from './FlightSimulationTab';

function runButton(): HTMLElement {
  return screen.getByRole('button', { name: /run 6-dof trajectory simulation/i });
}

describe('FlightSimulationTab safety presentation', () => {
  it('completes a run and renders outcome, validity, and freshness badges', async () => {
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    fireEvent.click(runButton());
    await waitFor(
      () => {
        expect(screen.getByText('Flight Status')).toBeTruthy();
      },
      { timeout: 60000 }
    );
    // Freshness badge is always present after a run.
    expect(screen.getByText(/CURRENT · inputs match run/)).toBeTruthy();
    // Exactly one outcome badge renders.
    const outcome = screen.getByText(/PASS ·|UNKNOWN ·|FAIL ·/);
    expect(outcome).toBeTruthy();
  }, 90000);

  it('never presents SAFE/GATE PASS outside a certified context', async () => {
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    fireEvent.click(runButton());
    await waitFor(() => expect(screen.getByText('Flight Status')).toBeTruthy(), { timeout: 60000 });
    const body = document.body.textContent ?? '';
    const unverified = body.includes('UNVERIFIED');
    const claimsSafe = body.includes('(SAFE)') || body.includes('(GATE PASS)');
    // Certified context only: UNVERIFIED and SAFE/GATE PASS are mutually exclusive.
    expect(unverified && claimsSafe).toBe(false);
    // Validity and envelope badges agree: green IN-DOMAIN never coexists with UNKNOWN.
    const unknown = body.includes('UNKNOWN ·');
    const inDomain = body.includes('IN-DOMAIN ·');
    expect(unknown && inDomain).toBe(false);
  }, 90000);

  it('flags results STALE after an input change and withdraws certification', async () => {
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    fireEvent.click(runButton());
    await waitFor(() => expect(screen.getByText('Flight Status')).toBeTruthy(), { timeout: 60000 });
    const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
    expect(sliders.length).toBeGreaterThan(0);
    fireEvent.change(sliders[0], { target: { value: String(Number(sliders[0].value) + 1) } });
    await waitFor(() => expect(screen.getByText(/STALE · configuration changed/)).toBeTruthy(), {
      timeout: 15000,
    });
    const body = document.body.textContent ?? '';
    expect(body.includes('(SAFE)') || body.includes('(GATE PASS)')).toBe(false);
  }, 90000);
});
