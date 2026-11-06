/**
 * Slice 1 I/O tests: format round trips, import size gate, adapter errors.
 *
 * Project JSON workspace and ledger round trip is covered in
 * projectJson.test.ts and is not duplicated here.
 */
import { describe, expect, it } from 'vitest';
import { exportToEng, parseRaspEng } from '../formats/engParser';
import { describeRktPreview } from '../formats/exportPreview';
import { exportRkt } from '../formats/rktExport';
import { parseRktString } from '../formats/rktParser';
import { CERTIFIED_MOTORS, integrateThrustCurve } from '../propulsion/motorDatabase';
import { PRESET_ESTES_ALPHA } from '../state/presets';
import type { RocketVehicle } from '../core/types';
import { describeImport, MAX_FOREIGN_IMPORT_BYTES, MAX_PROJECT_ARCHIVE_BYTES, OPEN_FILE_ACCEPT, projectArchiveBudget, projectFileName } from './files';
import { fetchWeatherLayers } from './net';

const SAMPLE_ENG = [
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

function failingFetch(): Promise<Response> {
  return Promise.reject(new Error('network down'));
}

describe('eng round trip', () => {
  it('parses and re-exports the RASP curve with the curve as authority', () => {
    const motor = parseRaspEng(SAMPLE_ENG);
    expect(motor.thrustCurve.length).toBeGreaterThan(2);
    const text = exportToEng(motor);
    const again = parseRaspEng(text);
    expect(again.thrustCurve).toEqual(motor.thrustCurve);
    expect(again.totalImpulse).toBeCloseTo(motor.totalImpulse, 9);
    expect(again.designation).toContain('C6');
  });

  it('round trips a certified record through export', () => {
    const motor = CERTIFIED_MOTORS.estes_c6;
    const text = exportToEng(motor);
    const again = parseRaspEng(text);
    expect(again.thrustCurve).toEqual(motor.thrustCurve);
    expect(again.totalImpulse).toBeCloseTo(integrateThrustCurve(motor, motor.burnTime), 9);
  });
});

describe('rkt parse and export omissions', () => {
  it('exports the preset with lossy-field notes and parses it back', () => {
    const preview = describeRktPreview(PRESET_ESTES_ALPHA);
    expect(preview.canExport).toBe(true);
    expect(preview.refused).toEqual([]);
    expect(preview.omissions.join('\n')).toMatch(/ids, materials/);
    const vehicle = parseRktString(exportRkt(PRESET_ESTES_ALPHA));
    expect(vehicle.components.length).toBe(PRESET_ESTES_ALPHA.components.length);
    expect(vehicle.name).toBe(PRESET_ESTES_ALPHA.name);
  });

  it('refuses elliptical fin sets instead of silently lossy export', () => {
    const vehicle: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      id: 'elliptical-io-fixture',
      name: 'Elliptical IO Fixture',
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
    };
    const preview = describeRktPreview(vehicle);
    expect(preview.canExport).toBe(false);
    expect(preview.refused.join(' ')).toMatch(/Elliptical Fins/);
  });
});

describe('describeImport size refusal', () => {
  it('keeps the 8 MB foreign-format budget', () => {
    for (const name of ['big.ork', 'big.rkt', 'big.eng', 'big.rse']) {
      const gated = describeImport({ name, size: MAX_FOREIGN_IMPORT_BYTES + 1 });
      expect(gated.ok, name).toBe(false);
      expect(gated.message).toMatch(/8 MB/);
    }
    expect(describeImport({ name: 'ok.ork', size: MAX_FOREIGN_IMPORT_BYTES }).ok).toBe(true);
  });

  it('applies the 64 MB native project budget to project files only', () => {
    const atForeignLimit = MAX_FOREIGN_IMPORT_BYTES + 1;
    const project = describeImport({ name: 'two-runs.astraea.json', size: atForeignLimit });
    expect(project.kind).toBe('json');
    expect(project.ok).toBe(true);
    expect(describeImport({ name: 'limit.astraea.json', size: MAX_PROJECT_ARCHIVE_BYTES }).ok).toBe(true);
    const oversized = describeImport({ name: 'huge.astraea.json', size: MAX_PROJECT_ARCHIVE_BYTES + 1 });
    expect(oversized.ok).toBe(false);
    expect(oversized.message).toMatch(/64 MB/);
    expect(oversized.message).toMatch(/were not read/);
  });

  it('measures serialized project text as UTF-8 bytes at the same budget', () => {
    const under = projectArchiveBudget('x'.repeat(MAX_PROJECT_ARCHIVE_BYTES));
    expect(under).toEqual({ ok: true, bytes: MAX_PROJECT_ARCHIVE_BYTES });
    const over = projectArchiveBudget('x'.repeat(MAX_PROJECT_ARCHIVE_BYTES + 1), 'huge.astraea.json');
    expect(over.ok).toBe(false);
    expect(over.ok === false && over.message).toMatch(/huge\.astraea\.json/);
    expect(over.ok === false && over.message).toMatch(/no file was written/);
    // Multibyte text is counted as bytes, not UTF-16 code units.
    const multibyte = projectArchiveBudget('é'.repeat(MAX_PROJECT_ARCHIVE_BYTES / 2 + 1));
    expect(multibyte.ok).toBe(false);
    expect(multibyte.bytes).toBeGreaterThan(MAX_PROJECT_ARCHIVE_BYTES);
  });

  it('accepts a small supported file', () => {
    const gated = describeImport({ name: 'alpha.rkt', size: 1024 });
    expect(gated.ok).toBe(true);
    expect(gated.kind).toBe('rkt');
  });

  it('no longer accepts the CDX1 dialect and lists the supported extensions', () => {
    const gated = describeImport({ name: 'Cal1sp1.CDX1', size: 2048 });
    expect(gated.ok).toBe(false);
    expect(gated.kind).toBe('unknown');
    expect(gated.message).toMatch(/unsupported type/);
    for (const ext of ['.ork', '.rkt', '.json', '.eng', '.rse']) expect(gated.message).toContain(ext);
  });

  it('accepts every project name Save can produce, including a bare .astraea', () => {
    for (const name of [projectFileName('NASA Student Launch Target Vehicle'), 'p1.astraea', 'p2.astraea.json', 'old.json', 'P3.ASTRAEA']) {
      const gated = describeImport({ name, size: 5000 });
      expect(gated.ok, name).toBe(true);
      expect(gated.kind, name).toBe('json');
    }
  });

  it('offers the same extensions in the Open picker as the import gate takes', () => {
    const offered = OPEN_FILE_ACCEPT.split(',').filter((entry) => entry.startsWith('.'));
    for (const ext of offered) expect(describeImport({ name: `file${ext}`, size: 10 }).ok, ext).toBe(true);
    for (const ext of ['.astraea', '.json', '.ork', '.rkt', '.eng', '.rse']) expect(offered).toContain(ext);
  });

  it('refuses unknown extensions', () => {
    const gated = describeImport({ name: 'notes.txt', size: 64 });
    expect(gated.ok).toBe(false);
  });
});

describe('adapter error surfacing', () => {
  it('fetchWeatherLayers rejects non-finite coordinates without fetching', async () => {
    const launch = new Date(Date.now() + 3600_000).toISOString();
    await expect(
      fetchWeatherLayers(Number.NaN, 8.0, launch, failingFetch),
    ).rejects.toThrow(TypeError);
  });
});
