// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InteropExportPanel, buildAeroMatrixRows } from './InteropExportPanel';
import { renderBlueprintPng } from '../formats/blueprintPng';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { useRunStore } from '../store/runStore';

vi.mock('../formats/blueprintPng', () => ({
  renderBlueprintPng: vi.fn().mockResolvedValue(new Blob(['png-bytes'], { type: 'image/png' })),
}));

afterEach(() => {
  vi.restoreAllMocks();
  useRunStore.getState().resetRuns();
});

describe('buildAeroMatrixRows', () => {
  it('emits one row per Mach point with finite coefficients', () => {
    const rows = buildAeroMatrixRows(PRESET_ESTES_ALPHA);
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(Number.isFinite(row.cdPowerOff)).toBe(true);
      expect(Number.isFinite(row.cdPowerOn)).toBe(true);
      expect(Number.isFinite(row.cna)).toBe(true);
      expect(Number.isFinite(row.cpX)).toBe(true);
      expect(row.aoaDeg).toBe(0);
    }
    expect(rows[0].mach).toBeCloseTo(0, 10);
  });
});

describe('InteropExportPanel', () => {
  it('downloads a .cdx1 file with OML stations', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:cdx1');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
    fireEvent.click(screen.getByTitle(/\.cdx1/));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('text/plain');
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('downloads an aero .csv with the exact matrix header', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:csv');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
    fireEvent.click(screen.getByTitle(/\.csv/));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const text = await (createObjectURL.mock.calls[0][0]).text();
    expect(text.split('\n')[0]).toBe('Mach,AoA,CD_power_off,CD_power_on,CNa,CP');
    expect(text.trim().split('\n').length).toBeGreaterThan(10);
  });
  it('downloads a dimensioned blueprint .svg', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:svg');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
    fireEvent.click(screen.getByTitle(/\.svg/));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const text = await (createObjectURL.mock.calls[0][0]).text();
    expect(text).toContain('<svg');
  });

  it('downloads a print-ready blueprint .png via canvas.toBlob', async () => {
    const rasterize = vi.mocked(renderBlueprintPng);
    rasterize.mockClear();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:png');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
    fireEvent.click(screen.getByTitle(/\.png/));
    // handlePng awaits the rasterizer before downloading; flush the handler's
    // continuation so the download assertions observe an executed flow.
    await Promise.resolve();
    // The rasterizer is mocked at the module boundary: the panel hands it
    // the print-variant SVG and downloads the returned image/png Blob.
    expect(rasterize).toHaveBeenCalledTimes(1);
    expect(rasterize.mock.calls[0][0]).toContain('class="bp-light"');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('image/png');
    expect(await blob.text()).toBe('png-bytes');
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('InteropExportPanel row-6 export triggers', () => {
  function stubDownload(): { createObjectURL: Mock; click: Mock } {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:export');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    return { createObjectURL, click };
  }

  it('RKT trigger previews omissions, then downloads RockSim XML on confirm', async () => {
    const { createObjectURL, click } = stubDownload();
    render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
    fireEvent.click(screen.getByTitle(/\(\.rkt\)/));
    expect(screen.getByRole('dialog', { name: /RockSim.*preview/ }).textContent).toMatch(/ids, materials/);
    fireEvent.click(screen.getByTitle(/Confirm rkt download/));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const text = await (createObjectURL.mock.calls[0][0] as Blob).text();
    expect(text).toContain('<RockSimDocument>');
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('RKT trigger refuses elliptical fin sets with no download offered', () => {
    const { createObjectURL } = stubDownload();
    const vehicle = {
      ...PRESET_ESTES_ALPHA,
      id: 'elliptical-ui-fixture',
      name: 'Elliptical UI Fixture',
      components: [
        ...PRESET_ESTES_ALPHA.components.slice(0, 2),
        {
          id: 'efins',
          name: 'Elliptical Fins',
          type: 'ellipticalfinset',
          materialId: 'balsa',
          finCount: 3,
          rootChord: 0.08,
          span: 0.04,
          thickness: 0.003,
          axialOffset: 0.2,
        },
      ],
    } as typeof PRESET_ESTES_ALPHA;
    render(<InteropExportPanel vehicle={vehicle} />);
    fireEvent.click(screen.getByTitle(/\(\.rkt\)/));
    expect(screen.getByRole('dialog').textContent).toMatch(/Refused:.*Elliptical Fins/);
    expect((screen.getByTitle(/Confirm rkt download/) as HTMLButtonElement).disabled).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('ENG trigger previews motor omissions, then downloads RASP text on confirm', async () => {
    const { createObjectURL } = stubDownload();
    render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
    fireEvent.click(screen.getByTitle(/\(\.eng\)/));
    expect(screen.getByRole('dialog', { name: /RASP.*preview/ }).textContent).toMatch(/sole authority/);
    fireEvent.click(screen.getByTitle(/Confirm eng download/));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const text = await (createObjectURL.mock.calls[0][0] as Blob).text();
    expect(text.startsWith('Estes C6 ')).toBe(true);
  });

  it('KML trigger refuses without a committed run', () => {
    const { createObjectURL } = stubDownload();
    render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
    fireEvent.click(screen.getByTitle(/\(\.kml\)/));
    expect(screen.getByRole('dialog').textContent).toMatch(/run Flight Sim first/);
    expect((screen.getByTitle(/Confirm kml download/) as HTMLButtonElement).disabled).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('KML trigger refuses a committed run whose telemetry payload is not published', () => {
    const { createObjectURL } = stubDownload();
    // S2 run store: a completed current run is auto-chosen, but the
    // single-trajectory telemetry payload is published by the S4 job
    // service — the panel refuses rather than fabricating a file.
    useRunStore.getState().recordAttempt({
      runId: 'kml-ui-test',
      runKey: 'case-key',
      caseId: 'preset-estes-alpha::estes_c6',
      lifecycle: 'completed',
      valid: true,
      freshness: 'current',
      gate: 'unknown',
      label: 'MC 200 · C6',
    });
    try {
      render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
      fireEvent.click(screen.getByTitle(/\(\.kml\)/));
      expect(screen.getByRole('dialog').textContent).toMatch(/case-key/);
      expect(screen.getByRole('dialog').textContent).toMatch(/payload/);
      expect((screen.getByTitle(/Confirm kml download/) as HTMLButtonElement).disabled).toBe(true);
      expect(createObjectURL).not.toHaveBeenCalled();
    } finally {
      useRunStore.getState().resetRuns();
    }
  });

  it('STEP trigger previews OML-only skips, then downloads AP203 text on confirm', async () => {
    const { createObjectURL } = stubDownload();
    render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
    fireEvent.click(screen.getByTitle(/\(\.step\)/));
    expect(screen.getByRole('dialog').textContent).toMatch(/Outer mold line only/);
    fireEvent.click(screen.getByTitle(/Confirm step download/));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const text = await (createObjectURL.mock.calls[0][0] as Blob).text();
    expect(text).toContain('ISO-10303-21');
    expect(text).toContain('MANIFOLD_SOLID_BREP');
  });

  it('STL trigger previews unit caveats, then downloads binary STL on confirm', async () => {
    const { createObjectURL } = stubDownload();
    render(<InteropExportPanel vehicle={PRESET_ESTES_ALPHA} />);
    fireEvent.click(screen.getByTitle(/\(\.stl\)/));
    expect(screen.getByRole('dialog').textContent).toMatch(/SI metres/);
    fireEvent.click(screen.getByTitle(/Confirm stl download/));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('model/stl');
    expect(blob.size).toBeGreaterThan(84);
  });
});
