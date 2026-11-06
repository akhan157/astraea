/**
 * Motor stage contract: catalog browse and readouts, model-fit gating on the
 * shared mount assessment, the ThrustCurve search/import path over `io/net.ts`,
 * the native chamber/nozzle table, the local BATES lane, and the bridge-only
 * propellant recipe.
 *
 * Ported Keep items:
 *  - `components/PropulsionStudio.test.tsx`: certified catalog listing with
 *    designation + impulse; peak thrust, burn time and propellant mass for the
 *    selected motor; an empty ThrustCurve query is inline and fetches nothing;
 *    a mocked RASP simfile imports and registers in the catalog.
 *  - `components/FlightSimulationTab.test.tsx`: imported motors list and can be
 *    flown; a bore-exceeding motor is disabled with an explanatory title.
 *
 * The IPC seam is the only mock: components must await
 * the engine (`installTestEngine`) and the oracle values below are read-only.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { APCP_REFERENCE_PRESSURE } from '../../propulsion/nozzleChemistry';
import { CERTIFIED_MOTORS } from '../../propulsion/motorDatabase';
import { useProjectStore } from '../../state/project';
import { MotorStage } from './Motor';
import { setTestEngine } from '../../engine';
import { installTestEngine } from '../testFixtures';

const CHAMBER = { Tc: 3522.814668872915, gamma: 1.1817718046095134, molWeight: 24.60469503516949 };
const VAC = { ispVac: 306.93, ispSea: 306.93, cstar: 1691.67, cfVac: 1.75, cfSea: 1.75, exitMach: 3.6 };
const SEA = { ispVac: 285.53, ispSea: 285.53, cstar: 1691.67, cfVac: 1.65, cfSea: 1.65, exitMach: 3.6 };
const seen: Array<{ cmd: string; args: Record<string, unknown> }> = [];

// The certified records the stage lists, by their published designations.
const ESTES = 'Estes C6';
const CESARONI = 'Cesaroni Pro75 5G M1820';

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

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

/**
 * IPC stub covering the Motor stage's commands. `overrides` may throw to model
 * a refused call; returning `undefined` falls through to the defaults.
 */
function stubIpc(overrides: (cmd: string, args: Record<string, unknown>) => unknown | undefined = () => undefined): void {
  const invoke = vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    seen.push({ cmd, args });
    const custom = overrides(cmd, args);
    if (custom !== undefined) return custom;
    if (cmd === 'solve_chamber') {
      expect(args.pressure).toBe(APCP_REFERENCE_PRESSURE);
      return CHAMBER;
    }
    if (cmd === 'nozzle_performance') {
      expect(args.tc).toBeCloseTo(CHAMBER.Tc, 9);
      return args.pa === 0 ? VAC : SEA;
    }
    if (cmd === 'ingredient_library') {
      return [
        { id: 'ap', name: 'Ammonium perchlorate', formula: { H: 4, N: 1, Cl: 1, O: 4 }, hfJPerMol: -295000, density: 1950, source: 'test' },
        { id: 'al', name: 'Aluminium', formula: { Al: 1 }, hfJPerMol: 0, density: 2700, source: 'test' },
      ];
    }
    if (cmd === 'propellant_performance') {
      return {
        density: 1800,
        enthalpy: 0,
        equilibrium: { chamber: { temperature: 3300, gamma: 1.18, mach: 0, molWeight: 24 }, throat: { mach: 1 }, exit: { mach: 3.4 }, cstar: 1600, isp: 260, cf: 1.6, cfVac: 1.7, cfAmbient: 1.5 },
        frozen: { chamber: { temperature: 3300 }, throat: {}, exit: { mach: 3.4 }, cstar: 1580, isp: 250, cf: 1.5, cfVac: 1.6, cfAmbient: 1.4 },
        chamberSpecies: [{ name: 'H2O', moleFraction: 0.4 }, { name: 'CO', moleFraction: 0.3 }],
        exitSpecies: [{ name: 'H2O', moleFraction: 0.35 }, { name: 'CO', moleFraction: 0.3 }],
      };
    }
    throw new Error(`unexpected IPC command ${cmd}`);
  });
  installTestEngine(invoke);
}

const openTool = (label: string): void => {
  fireEvent.click(screen.getByRole('radio', { name: label }));
};

/**
 * Text of one readout in the selected-motor pane. Scoped by the pane's own
 * labels and taking the shortest match, so the table and the tool panels
 * cannot answer for it.
 */
const statText = (container: HTMLElement, label: string): string =>
  Array.from(container.querySelectorAll('div'))
    .map((d) => d.textContent ?? '')
    .filter((t) => t.includes(label) && t.includes('Total impulse') && t.includes('Propellant') && t.length < 300)
    .sort((a, b) => a.length - b.length)[0] ?? '';

const rowOf = (designation: string): HTMLElement => {
  const cell = screen.getAllByText(designation)[0];
  const row = cell.closest('[role="row"]');
  if (row === null) throw new Error(`no table row for ${designation}`);
  return row as HTMLElement;
};

beforeEach(() => {
  seen.length = 0;
  useProjectStore.getState().newProject();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Motor stage — catalog', () => {
  it('lists the certified motors with designation and total impulse', () => {
    render(<MotorStage />);
    const table = screen.getByRole('table');
    for (const motor of Object.values(CERTIFIED_MOTORS)) {
      expect(within(table).getAllByText(motor.designation).length, `row for ${motor.designation}`).toBeGreaterThan(0);
    }
    const row = rowOf(ESTES);
    // The impulse cell rounds to whole newtons; 8.8 N·s reads "9 N·s".
    expect(row.textContent).toMatch(/9 N·s/);
  });

  it('shows peak thrust, propellant mass and burn time for the selected motor', () => {
    const { container } = render(<MotorStage />);
    fireEvent.click(screen.getAllByText(ESTES)[0]);
    // The certified Estes C6 record: max 14.09 N, 8.8 N·s, 10.8 g, 1.86 s.
    expect(statText(container, 'Total impulse')).toMatch(/8\.8 N·s/);
    expect(statText(container, 'Max thrust')).toMatch(/14\.1\s*N/);
    expect(statText(container, 'Propellant')).toMatch(/0\.011\s*kg/);
    expect(rowOf(ESTES).textContent).toMatch(/1\.86s/); // burn time in the row
  });

  it('replaces the readouts when another catalog motor is selected', () => {
    const { container } = render(<MotorStage />);
    fireEvent.click(screen.getAllByText(CESARONI)[0]);
    expect(statText(container, 'Total impulse')).toMatch(/5850\.0 N·s/);
    expect(statText(container, 'Max thrust')).toMatch(/2,450\.0/);
    expect(statText(container, 'Propellant')).toMatch(/2\.85\s*kg/);
    expect(rowOf(CESARONI).textContent).toMatch(/3\.21s/);
  });
});

describe('Motor stage — mount fit', () => {
  /** Set the flagged mount's bore so the fit gate can be exercised directly. */
  const setBore = (innerDiameter: number): void => {
    const project = useProjectStore.getState().project;
    const mount = project.vehicle.components.find((c) => c.type === 'bodytube' && c.isMotorMount === true);
    if (mount === undefined) throw new Error('the seed vehicle has no motor mount');
    act(() => {
      useProjectStore.getState().editProject({
        label: 'Test mount bore',
        key: 'test:mountBore',
        project: {
          ...project,
          vehicle: {
            ...project.vehicle,
            components: project.vehicle.components.map((c) => (c.id === mount.id ? { ...c, innerDiameter } : c)),
          },
        },
      });
    });
  };

  it('disables Use for a motor wider than the mount bore with an explanatory title', () => {
    setBore(0.054);
    render(<MotorStage />);
    fireEvent.click(screen.getAllByText(CESARONI)[0]);
    const use = screen.getByRole('button', { name: new RegExp(`Use ${CESARONI}`) }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    expect(use.getAttribute('title')).toMatch(/exceeds mount|bore/);
    expect(rowOf(CESARONI).textContent).toMatch(/too wide/);
  });

  it('offers a motor that fits the bore', () => {
    setBore(0.145);
    render(<MotorStage />);
    // Estes C6 is not the seed motor, so its pane carries the Use button.
    fireEvent.click(screen.getAllByText(ESTES)[0]);
    const use = screen.getByRole('button', { name: /Use Estes C6/ }) as HTMLButtonElement;
    expect(use.disabled).toBe(false);
    expect(rowOf(ESTES).textContent).toMatch(/fits/);
  });
});

describe('Motor stage — ThrustCurve', () => {
  it('reports an empty query inline and calls no fetch', () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    stubIpc();
    render(<MotorStage />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(document.querySelector('[data-thrustcurve-status="error"]')?.textContent).toMatch(/Enter a motor designation or manufacturer/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('surfaces a transport failure inline with no fabricated results', async () => {
    stubIpc();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    render(<MotorStage />);
    fireEvent.change(screen.getByLabelText('ThrustCurve search query'), { target: { value: 'C6 offline' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const status = await screen.findByText(/motor search is unavailable/);
    expect(status.textContent).toMatch(/fetch failed/);
    expect(document.querySelector('[data-thrustcurve-results]')).toBeNull();
  });

  it('imports a mocked RASP simfile and registers the motor in the catalog', async () => {
    stubIpc();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/search.json')) {
        return jsonResponse({ results: [{ motorId: 'tc-c6-import', manufacturer: 'Estes Industries', designation: 'C6', diameter: 18, length: 70, avgThrustN: 6.06, totImpulseNs: 8.8, burnTimeS: 1.86, dataFiles: 3 }] });
      }
      if (url.endsWith('/download.json')) {
        return jsonResponse({ results: [{ motorId: 'tc-c6-import', simfileId: 'sim1', format: 'RASP', source: 'cert', data: b64(SAMPLE_ENG) }] });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    render(<MotorStage />);
    fireEvent.change(screen.getByLabelText('ThrustCurve search query'), { target: { value: 'C6 import' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import C6' }));
    expect(await screen.findByText(/Imported Estes C6 \(8\.9 N·s total impulse\)/)).toBeTruthy();
    expect(document.querySelector('[data-thrustcurve-import="ok"]')).toBeTruthy();
    // Registered in the project catalog (as an import, never shadowing a certified id) and selected.
    const imported = useProjectStore.getState().motorRecords().find((r) => r.motor.designation === 'Estes C6' && r.provenance.source === 'import');
    expect(imported).toBeDefined();
    expect(useProjectStore.getState().project.workspace.motorId).toBe(imported?.id);
  });

  it('shows the offline state instead of attempting a search', () => {
    stubIpc();
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    render(<MotorStage />);
    expect(screen.getByText(/Offline: the search and simfile download need a network connection/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Search' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Motor stage — chamber and nozzle', () => {
  it('renders six finite nozzle columns from the native core', async () => {
    stubIpc();
    render(<MotorStage />);
    openTool('Chamber & nozzle');
    await screen.findByTestId('nozzle-ispVac');
    const cells = ['ispVac', 'ispSea', 'cstar', 'cfVac', 'cfSea', 'exitMach'].map((k) => screen.getByTestId(`nozzle-${k}`).textContent ?? '');
    for (const cell of cells) expect(Number.isFinite(parseFloat(cell))).toBe(true);
    // Column contract: vacuum beats sea level; the exit flow is supersonic.
    expect(parseFloat(cells[0])).toBeGreaterThan(parseFloat(cells[1]));
    expect(parseFloat(cells[3])).toBeGreaterThan(parseFloat(cells[4]));
    expect(parseFloat(cells[5])).toBeGreaterThan(1);
    const cmds = seen.map((s) => s.cmd);
    expect(cmds[0]).toBe('solve_chamber');
    expect(cmds.filter((c) => c === 'nozzle_performance').length).toBeGreaterThanOrEqual(2);
  });

  it('reports the chamber call failure inline instead of fabricating a table', async () => {
    stubIpc((cmd) => {
      if (cmd === 'solve_chamber') throw new Error('core refused the pressure');
      return undefined;
    });
    render(<MotorStage />);
    openTool('Chamber & nozzle');
    expect(await screen.findByText(/Chamber\/nozzle unavailable: core refused the pressure/)).toBeTruthy();
    expect(screen.queryByTestId('nozzle-ispVac')).toBeNull();
  });
});

describe('Motor stage — BATES grain', () => {
  it('regenerates the burn-area trace and peak chamber pressure when a grain input changes', async () => {
    stubIpc();
    render(<MotorStage />);
    openTool('BATES grain');
    const spark = await screen.findByTestId('burn-area-sparkline');
    const before = spark.getAttribute('points') ?? '';
    expect(before.length).toBeGreaterThan(0);
    const pcBefore = screen.getByTestId('peak-chamber-pressure').textContent ?? '';
    expect(parseFloat(pcBefore)).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Grain outer diameter (mm)'), { target: { value: '70' } });
    await waitFor(() => {
      expect(screen.getByTestId('burn-area-sparkline').getAttribute('points')).not.toBe(before);
    });
    const pcAfter = screen.getByTestId('peak-chamber-pressure').textContent ?? '';
    expect(parseFloat(pcAfter)).toBeGreaterThan(0);
    expect(pcAfter).not.toBe(pcBefore);
  });

  it('degrades to a visible error on degenerate grain geometry', async () => {
    stubIpc();
    render(<MotorStage />);
    openTool('BATES grain');
    await screen.findByTestId('burn-area-sparkline');
    fireEvent.change(screen.getByLabelText('Grain core diameter (mm)'), { target: { value: '80' } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/outerDiameter must exceed coreDiameter/);
    expect(screen.queryByTestId('burn-area-sparkline')).toBeNull();
  });
});

describe('Motor stage — propellant recipe', () => {
  it('computes a recipe through the bridge and shows Tc, c*, Isp, gamma and products', async () => {
    stubIpc();
    render(<MotorStage />);
    openTool('Propellant recipe');
    const picker = await screen.findByRole('combobox');
    fireEvent.change(picker, { target: { value: 'ap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
    fireEvent.click(screen.getByRole('button', { name: 'Compute performance' }));
    await waitFor(() => {
      expect(screen.getByText('c* (equilibrium)').parentElement?.textContent).toMatch(/1600\.0/);
    });
    expect(screen.getByText('Tc').parentElement?.textContent).toMatch(/3300\.0/);
    expect(screen.getByText('Isp (equilibrium)').parentElement?.textContent).toMatch(/260\.00/);
    expect(screen.getByText('γ (chamber)').parentElement?.textContent).toMatch(/1\.1800/);
    expect(screen.getByRole('table', { name: 'Product species' })).toBeTruthy();
    expect(seen.some((s) => s.cmd === 'propellant_performance')).toBe(true);
  });

  it('states the offline unavailability with no TypeScript fallback', () => {
    stubIpc();
    // The engine disappeared after mount, so the bridge cannot be reached.
    setTestEngine(null);
    render(<MotorStage />);
    openTool('Propellant recipe');
    expect(screen.getByText(/Propellant recipes need the Astraea engine/)).toBeTruthy();
  });
});
