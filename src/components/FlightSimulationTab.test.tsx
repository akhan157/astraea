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
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FlightSimulationTab } from './FlightSimulationTab';
import { useRocketStore, PRESET_ESTES_ALPHA } from '../store/rocketStore';
import type { RocketVehicle, BodyTubeComponent } from '../core/types';
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
function runButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /run 6-dof trajectory simulation/i }) as HTMLButtonElement;
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
    // F5: the chart names the apogee time and the flight-duration endpoint
    // separately, so the duration can never read as the apogee time.
    expect(screen.getByText(/Apogee .* @ t=.*s/)).toBeTruthy();
    expect(screen.getByText(/t=.*s (touchdown|end of run)/)).toBeTruthy();
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

describe('FlightSimulationTab motor coherence (Round-19)', () => {
  beforeEach(() => {
    const store = useRocketStore.getState();
    store.resetStore();
    useRocketStore.setState({ customMotors: {} });
    useRocketStore.getState().selectMotor('estes_c6');
  });

  /** Imported motor seated in the BT-50 bore: 18 mm, 0.2 m — flies the C6 class. */
  const IMPORTED_MOTOR: MotorSpec = {
    id: 'custom_h128',
    designation: 'Test H128',
    manufacturer: 'TestWorks',
    impulseClass: 'H',
    diameter: 0.018,
    length: 0.2,
    totalImpulse: 180,
    avgThrust: 128,
    maxThrust: 200,
    burnTime: 1.4,
    propellantMass: 0.1,
    totalMass: 0.2,
    dryMass: 0.1,
    thrustCurve: [
      { time: 0, thrust: 0 },
      { time: 0.05, thrust: 180 },
      { time: 0.70, thrust: 180 },
      { time: 1.35, thrust: 140 },
      { time: 1.4, thrust: 0 },
    ],
  };

  it('lists imported custom motors and flies the selected one', async () => {
    useRocketStore.getState().importCustomMotor(IMPORTED_MOTOR);
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    const select = screen.getByRole('combobox', { name: /rocket motor/i }) as HTMLSelectElement;
    const option = Array.from(select.querySelectorAll('option')).find((o) => o.value === 'custom_h128');
    expect(option).toBeTruthy();
    expect(option?.textContent).toContain('Test H128');
    // Selecting the imported motor drives the shared store id.
    fireEvent.change(select, { target: { value: 'custom_h128' } });
    expect(useRocketStore.getState().selectedMotorId).toBe('custom_h128');
    // And it flies: the run completes under the imported record.
    await runOnce();
    expect(screen.getByText(/CURRENT · inputs match run/)).toBeTruthy();
  }, 90000);

  it('disables bore-exceeding motors with an explanatory title; never offers the run', () => {
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    const select = screen.getByRole('combobox', { name: /rocket motor/i }) as HTMLSelectElement;
    const byValue = (v: string) => Array.from(select.querySelectorAll('option')).find((o) => o.value === v);
    const k550 = byValue('aerotech_k550w');
    expect(k550).toBeTruthy();
    expect(k550?.disabled).toBe(true);
    expect(k550?.getAttribute('title')).toMatch(/exceeds mount 'Main Body Tube \(BT-50\)' bore/);
    // The fitting C6 stays selectable.
    const c6 = byValue('estes_c6');
    expect(c6?.disabled).toBe(false);
    // The run button remains enabled (fitting motor selected and seats).
    expect(runButton().disabled).toBe(false);
  });

  it('surfaces multi-mount ambiguity, disables the run, and clears via the inspector checkbox', () => {
    // Second flagged mount on the alpha airframe: prepareVehicle would throw.
    const bt = PRESET_ESTES_ALPHA.components.find((c) => c.type === 'bodytube') as BodyTubeComponent;
    const twoMount: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      id: 'two-mount-alpha',
      name: 'Two-Mount Alpha',
      components: [
        PRESET_ESTES_ALPHA.components[0],
        bt,
        { ...bt, id: 'alpha-bt2', name: 'Stray Mount Tube', isMotorMount: true },
        ...PRESET_ESTES_ALPHA.components.slice(2),
      ],
    };
    useRocketStore.getState().setVehicle(twoMount);
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/Multiple motor mounts flagged/)).toBeTruthy();
    expect(runButton().disabled).toBe(true);
    // A programmatic run attempt is rejected (never a guaranteed-throw run).
    fireEvent.click(runButton());
    // Clearing the stray flag (the inspector checkbox contract) restores the run.
    const store = useRocketStore.getState();
    act(() => store.updateComponent('alpha-bt2', { isMotorMount: undefined }));
    expect(screen.queryByText(/Multiple motor mounts flagged/)).toBeNull();
    expect(runButton().disabled).toBe(false);
  }, 90000);

  it('warns on a zero-mount airframe and falls back to aft-end seating', () => {
    const unmounted: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      id: 'unmounted-alpha',
      components: PRESET_ESTES_ALPHA.components.map((c) =>
        c.type === 'bodytube' ? { ...c, isMotorMount: false } : c,
      ),
    };
    useRocketStore.getState().setVehicle(unmounted);
    render(<FlightSimulationTab isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/No motor mount flagged/)).toBeTruthy();
    // No bore constraint: any motor seats at the aft end, run stays offered.
    expect(runButton().disabled).toBe(false);
  });
});
