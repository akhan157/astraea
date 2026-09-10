// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InteropExportPanel, buildAeroMatrixRows } from './InteropExportPanel';
import { renderBlueprintPng } from '../formats/blueprintPng';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';

vi.mock('../formats/blueprintPng', () => ({
  renderBlueprintPng: vi.fn().mockResolvedValue(new Blob(['png-bytes'], { type: 'image/png' })),
}));

afterEach(() => {
  vi.restoreAllMocks();
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
