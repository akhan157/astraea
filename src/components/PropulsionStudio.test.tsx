/**
 * Propulsion Studio panel contract tests (jsdom).
 *
 * Acceptance:
 *  1. The certified motor <select> lists every CERTIFIED_MOTORS record as
 *     designation + total impulse — the Estes C6 is present.
 *  2. Selecting a motor renders peak/average thrust, burn time, and
 *     propellant mass for that record.
 *  3. Editing BATES grain inputs regenerates the burn-area trace (SVG
 *     sparkline polyline points change) and the equilibrium chamber
 *     pressure at the peak burn area.
 *  4. The APCP nozzle performance table renders finite positive values for
 *     all six columns, with vacuum beating sea level on Isp and Cf, and a
 *     supersonic exit Mach for the choked 100-bar / sea-level design point.
 *  5. Degenerate grain geometry degrades to a visible error instead of
 *     crashing the surface.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PropulsionStudio } from './PropulsionStudio';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { APCP_REFERENCE_PRESSURE } from '../propulsion/nozzleChemistry';

/**
 * IPC-boundary mock: the ONLY seam under test. Components must await
 * window.__TAURI__.core.invoke with the expected command names/payloads;
 * the oracle values below are read-only anchors (never computed in-test).
 */
const CHAMBER = { Tc: 3522.814668872915, gamma: 1.1817718046095134, molWeight: 24.60469503516949 };
const VAC = { ispVac: 306.93, ispSea: 306.93, cstar: 1691.67, cfVac: 1.75, cfSea: 1.75, exitMach: 3.6 };
const SEA = { ispVac: 285.53, ispSea: 285.53, cstar: 1691.67, cfVac: 1.65, cfSea: 1.65, exitMach: 3.6 };
const seen: Array<{ cmd: string; args: Record<string, unknown> }> = [];

beforeEach(() => {
  seen.length = 0;
  const invoke = vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    seen.push({ cmd, args });
    if (cmd === 'solve_chamber') {
      expect(args.pressure).toBe(APCP_REFERENCE_PRESSURE);
      return CHAMBER;
    }
    if (cmd === 'nozzle_performance') {
      expect(args.tc).toBeCloseTo(CHAMBER.Tc, 9);
      return args.pa === 0 ? VAC : SEA;
    }
    throw new Error(`unexpected IPC command ${cmd}`);
  });
  // Named-cast window seam: bridge reads window.__TAURI__.core.invoke.
  const win = window as unknown as { __TAURI__?: unknown };
  win.__TAURI__ = { core: { invoke } };
});

function sparklinePoints(): string {
  const polyline = screen.getByTestId('burn-area-sparkline');
  return polyline.getAttribute('points') ?? '';
}

function motorSelect(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Certified motor' });
}

describe('PropulsionStudio', () => {
  it('lists every certified motor with designation and total impulse', () => {
    render(<PropulsionStudio />);
    const options = Array.from(motorSelect().querySelectorAll('option'));
    expect(options.length).toBe(Object.keys(CERTIFIED_MOTORS).length);
    for (const motor of Object.values(CERTIFIED_MOTORS)) {
      const option = options.find((o) => o.textContent?.includes(motor.designation));
      expect(option, `option for ${motor.designation}`).toBeTruthy();
      expect(option?.textContent).toContain(String(motor.totalImpulse));
    }
    // Acceptance anchor: the Estes C6 option carries designation + impulse.
    const estes = options.find((o) => o.value === 'estes_c6');
    expect(estes?.textContent).toMatch(/Estes C6/);
    expect(estes?.textContent).toMatch(/8\.8/);
  });

  it('shows peak/average thrust, burn time, and propellant mass for the selected motor', () => {
    render(<PropulsionStudio />);
    // Default selection: Estes C6 record.
    expect(screen.getByText('14.2 N')).toBeTruthy(); // peak thrust (curve max)
    expect(screen.getByText('6.0 N')).toBeTruthy(); // average thrust
    expect(screen.getByText('1.86 s')).toBeTruthy(); // burn time
    expect(screen.getByText('12.5 g')).toBeTruthy(); // propellant mass (0.0125 kg)

    // Switching motors replaces all four readouts.
    fireEvent.change(motorSelect(), { target: { value: 'cesaroni_m1820' } });
    expect(screen.getByText('2450.0 N')).toBeTruthy();
    expect(screen.getByText('1820.0 N')).toBeTruthy();
    expect(screen.getByText('3.21 s')).toBeTruthy();
    expect(screen.getByText('2.850 kg')).toBeTruthy();
  });
  it('regenerates the burn-area trace and chamber pressure when grain inputs change', async () => {
    render(<PropulsionStudio />);
    await screen.findByTestId('burn-area-sparkline');
    const before = sparklinePoints();
    expect(before.length).toBeGreaterThan(0);

    const pcBefore = screen.getByTestId('peak-chamber-pressure').textContent ?? '';
    expect(Number.isFinite(parseFloat(pcBefore))).toBe(true);
    expect(parseFloat(pcBefore)).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/outer diameter/i), { target: { value: '70' } });

    const after = sparklinePoints();
    expect(after.length).toBeGreaterThan(0);
    expect(after).not.toBe(before);

    const pcAfter = screen.getByTestId('peak-chamber-pressure').textContent ?? '';
    expect(Number.isFinite(parseFloat(pcAfter))).toBe(true);
    expect(parseFloat(pcAfter)).toBeGreaterThan(0);
    expect(pcAfter).not.toBe(pcBefore);
    // IPC contract: chamber once, then vacuum + sea nozzle pair.
    const cmds = seen.map((s) => s.cmd);
    expect(cmds[0]).toBe('solve_chamber');
    expect(cmds.filter((c) => c === 'nozzle_performance').length).toBeGreaterThanOrEqual(2);
  });

  it('degrades to a visible error instead of crashing on degenerate grain geometry', () => {
    render(<PropulsionStudio />);
    fireEvent.change(screen.getByLabelText(/core diameter/i), { target: { value: '80' } });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/outerDiameter must exceed coreDiameter/);
  });

  it('renders finite APCP nozzle performance for all six columns', async () => {
    render(<PropulsionStudio />);
    const table = await screen.findByRole('table', { name: /nozzle performance/i });
    const cells = Array.from(table.querySelectorAll('td')).map((c) => c.textContent ?? '');
    expect(cells).toHaveLength(6);
    for (const cell of cells) {
      const value = parseFloat(cell);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    // Column order: Isp vac, Isp sea, c*, Cf vac, Cf sea, exit Mach.
    expect(parseFloat(cells[0]!)).toBeGreaterThan(parseFloat(cells[1]!)); // vacuum > sea
    expect(parseFloat(cells[3]!)).toBeGreaterThan(parseFloat(cells[4]!)); // Cf vac > Cf sea
    expect(parseFloat(cells[5]!)).toBeGreaterThan(1); // choked flow, supersonic exit
  });
});