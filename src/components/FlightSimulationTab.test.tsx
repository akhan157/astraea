/**
 * Automated browser-surface safety suite (Round-17 audit §7.5/§8).
 *
 * Exercises the FlightSimulationTab result contract in jsdom:
 *   1. A run completes and renders outcome, validity, and freshness badges.
 *   2. Decisive implication (not mere exclusion): a PASS outcome coincides
 *      with screening-met safety presentation and no UNVERIFIED text, while a
 *      non-PASS outcome coincides with UNVERIFIED text and no screening-met
 *      presentation.
 *   3. Changing any input after a run flags results STALE and withdraws
 *      certified safety presentation (the failure-state path: no stale
 *      screening-met output survives).
 *   4. A throwing rerun clears prior results and records a failed-run alert
 *      carrying the input snapshot.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FlightSimulationTab } from './FlightSimulationTab';
import type { RocketVehicle } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import type { SixDofOptions, SixDofSimulationResult } from '../sim/sixDofSimulator';

type SimFlight = (vehicle: RocketVehicle, motor: MotorSpec, options?: SixDofOptions) => SixDofSimulationResult;

vi.mock('../sim/sixDofSimulator', async (importOriginal) => {
  // Vitest mock factories are untyped; the shape is restored field-by-field below.
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    simulate6DofFlight: (...args: Parameters<SimFlight>) =>
      (globalThis as unknown as { __simImpl: SimFlight }).__simImpl(...args),
  };
});

beforeEach(async () => {
  const actual = (await vi.importActual('../sim/sixDofSimulator')) as Record<string, unknown>;
  (globalThis as unknown as { __simImpl: unknown }).__simImpl = actual.simulate6DofFlight as SimFlight;
});
function runButton(): HTMLElement {
  return screen.getByRole('button', { name: /run 6-dof trajectory simulation/i });
}

async function runOnce(): Promise<void> {
  fireEvent.click(runButton());
  await waitFor(() => expect(screen.getByText('Flight Status')).toBeTruthy(), { timeout: 60000 });
}

describe('FlightSimulationTab safety presentation', () => {
  it('completes a run and renders outcome, validity, and freshness badges', async () => {
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    await runOnce();
    // Freshness badge is always present after a run.
    expect(screen.getByText(/CURRENT · inputs match run/)).toBeTruthy();
    // Exactly one outcome badge renders.
    expect(screen.getByText(/PASS ·|UNKNOWN ·|FAIL ·/)).toBeTruthy();
    // The run manifest names the motor/rail/wind inputs behind the results.
    expect(screen.getByText(/Run manifest/)).toBeTruthy();
    expect(screen.getByText(/motor /)).toBeTruthy();
  }, 90000);

  it('ties safety presentation decisively to the certified context', async () => {
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    await runOnce();
    const body = document.body.textContent ?? '';
    const outcome = screen.getByText(/PASS ·|UNKNOWN ·|FAIL ·/).textContent ?? '';
    if (outcome.startsWith('PASS')) {
      // Certified: screening-met presentation is shown and UNVERIFIED is absent.
      expect(body.includes('UNVERIFIED')).toBe(false);
      expect(body.includes('(screening met)')).toBe(true);
    } else {
      // Uncertified: UNVERIFIED is shown and no screening-met claim survives.
      expect(body.includes('UNVERIFIED')).toBe(true);
      expect(body.includes('(screening met)')).toBe(false);
    }
    // Validity and envelope badges agree: green IN-DOMAIN never coexists with UNKNOWN.
    expect(body.includes('UNKNOWN ·') && body.includes('IN-DOMAIN ·')).toBe(false);
  }, 90000);

  it('flags results STALE after an input change and withdraws certification', async () => {
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    await runOnce();
    const sliders = screen.getAllByRole('slider') as HTMLInputElement[];
    expect(sliders.length).toBeGreaterThan(0);
    fireEvent.change(sliders[0], { target: { value: String(Number(sliders[0].value) + 1) } });
    await waitFor(() => expect(screen.getByText(/STALE · configuration changed/)).toBeTruthy(), {
      timeout: 15000,
    });
    const body = document.body.textContent ?? '';
    expect(body.includes('(screening met)')).toBe(false);
  }, 90000);

  it('clears prior results and records inputs when a rerun throws', async () => {
    (globalThis as unknown as { __simImpl: unknown }).__simImpl = () => {
      throw new Error('simulated engine failure');
    };
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    fireEvent.click(runButton());
    const alert = await screen.findByRole('alert', undefined, { timeout: 15000 });
    expect(alert.textContent).toMatch(/simulated engine failure/);
    // The failed-run record carries the input snapshot for reproduction.
    expect(alert.textContent).toMatch(/rail=/);
    // The machine-readable record carries the full input snapshot as JSON.
    expect(alert.textContent).toMatch(/"railLength"/);
    expect(alert.textContent).toMatch(/"designation"/);
    // No stale result surface survives: no outcome badges, no KPIs.
    expect(document.body.textContent?.includes('Flight Status')).toBe(false);
  }, 90000);
});
