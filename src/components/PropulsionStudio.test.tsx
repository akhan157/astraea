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
import { useRocketStore } from '../store/rocketStore';
import type { FetchImpl } from '../propulsion/thrustcurveApi';

/** Minimal valid RASP .eng the download endpoint hands back (Estes C6 curve). */
const SAMPLE_ENG = [
  '; Estes C6 certified thrust curve (RASP .eng layout)',
  'Estes C6 18 70 Estes 8.8 6.06 14.2 0.0125 0.0248',
  '0.00 0.0',
  '0.08 4.5',
  '0.18 14.2',
  '0.28 8.5',
  '0.50 4.8',
  '1.00 4.4',
  '1.50 4.2',
  '1.86 0.0',
  '',
].join('\n');

const b64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

/**
 * Mock Response shaped like the ThrustCurve client's needs (ok/status/json;
 * statusText + headers are only read on the non-2xx path).
 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

/** Injected fetch: dispatches on the endpoint URL so tests stay deterministic. */
function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): FetchImpl {
  return vi.fn(async (url: string, init: RequestInit) => handler(url, init));
}

function thrustCurveStatus(): string | null {
  return (
    document.querySelector('[data-thrustcurve-status]')?.getAttribute('data-thrustcurve-status') ?? null
  );
}

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

  it('reports an empty ThrustCurve query inline and calls no fetch', () => {
    const fetchImpl = vi.fn() as unknown as FetchImpl;
    render(<PropulsionStudio fetchImpl={fetchImpl} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(thrustCurveStatus()).toBe('error');
    expect(document.querySelector('[data-thrustcurve-status="error"]')?.textContent).toMatch(
      /Enter a motor designation or manufacturer/i,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('renders mocked ThrustCurve search results with designation, maker, impulse, and diameter', async () => {
    const fetchImpl = mockFetch(() =>
      jsonResponse({
        results: [
          {
            motorId: 'tc-c6',
            manufacturer: 'Estes Industries',
            designation: 'C6',
            diameter: 18,
            length: 70,
            avgThrustN: 6.06,
            totImpulseNs: 8.8,
            burnTimeS: 1.86,
          },
        ],
      }),
    );
    render(<PropulsionStudio fetchImpl={fetchImpl} />);
    fireEvent.change(screen.getByLabelText('ThrustCurve search query'), { target: { value: 'C6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('C6')).toBeTruthy();
    expect(screen.getByText('Estes Industries')).toBeTruthy();
    expect(screen.getByText('8.8 N·s')).toBeTruthy();
    expect(screen.getByText('18 mm')).toBeTruthy();
    expect(thrustCurveStatus()).toBe('ok');
    expect(
      document.querySelector('[data-thrustcurve-results]')?.getAttribute('data-thrustcurve-results'),
    ).toBe('1');
    // POSTs to the search endpoint with the trimmed query.
    const call = (fetchImpl as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0]!;
    expect(call[0]).toContain('/search.json');
    expect(JSON.parse(String(call[1].body))).toMatchObject({ designation: 'C6' });
  });

  it('surfaces a mocked ThrustCurve search error message inline', async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ error: 'Invalid designation "ZZZ9".' }));
    render(<PropulsionStudio fetchImpl={fetchImpl} />);
    fireEvent.change(screen.getByLabelText('ThrustCurve search query'), { target: { value: 'ZZZ9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const status = await screen.findByText(/Invalid designation "ZZZ9"\./);
    expect(status.textContent).toMatch(/ThrustCurve search failed/);
    expect(thrustCurveStatus()).toBe('error');
  });

  it('imports a mocked RASP simfile and registers the motor in the catalog', async () => {
    const motorId = 'tc-c6-import';
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith('/search.json')) {
        return jsonResponse({
          results: [
            {
              motorId,
              manufacturer: 'Estes Industries',
              designation: 'C6',
              diameter: 18,
              length: 70,
              avgThrustN: 6.06,
              totImpulseNs: 8.8,
              burnTimeS: 1.86,
            },
          ],
        });
      }
      if (url.endsWith('/download.json')) {
        return jsonResponse({
          results: [{ motorId, simfileId: 'sim1', format: 'RASP', source: 'cert', data: b64(SAMPLE_ENG) }],
        });
      }
      throw new Error(`unexpected URL ${url}`);
    });

    render(<PropulsionStudio fetchImpl={fetchImpl} />);
    fireEvent.change(screen.getByLabelText('ThrustCurve search query'), {
      target: { value: 'C6 import' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import C6' }));

    // Success is reported inline, naming the motor and its total impulse.
    expect(await screen.findByText(/Imported Estes C6 \(8\.9 N·s total impulse\)/)).toBeTruthy();
    expect(document.querySelector('[data-thrustcurve-import="ok"]')).toBeTruthy();

    // The parsed motor is registered in the store and shows up in the catalog/selection.
    const imported = Object.values(useRocketStore.getState().customMotors);
    expect(imported).toHaveLength(1);
    expect(imported[0]!.designation).toBe('Estes C6');
    expect(imported[0]!.totalImpulse).toBeCloseTo(8.919, 2);
    // The store key the import landed on is now selectable in the motor catalog.
    const customKey = Object.keys(useRocketStore.getState().customMotors)[0]!;
    const option = Array.from(motorSelect().querySelectorAll('option')).find((o) => o.value === customKey);
    expect(option, `option for imported key ${customKey}`).toBeTruthy();
    expect(option?.textContent).toContain('Estes C6');
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