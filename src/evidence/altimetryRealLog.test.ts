/**
 * Real-flight CSV ingestion regression (2026-09-28).
 *
 * The evidence parser was exercised against a genuine public flight log and
 * rejected it, which is exactly the class of defect synthetic fixtures miss:
 *
 *   Flight: Altimeter Cloud #2986 "Cosmic Cargo (2) flight 69"
 *   Page:   https://www.altimetercloud.com/flights/2986/
 *   File:   https://www.altimetercloud.com/flightdata/6/2986.csv (977,003 bytes,
 *           SHA-256 adce6e39cf0fa9919c0349c83725ffe431b44a8b03db5ccbb71d6a7aad4066b8)
 *   Motor:  Estes C6-7 (1 flight; certified curve published on ThrustCurve.org)
 *   Apogee: 291.74 m at 7.454 s, 10,059 samples (400 Hz hybrid)
 *
 * Two real-format traits broke the parser: the header is `Time(ms),Altitude(m),
 * …` (milliseconds, unspaced unit suffix) and it is preceded by ~15 metadata
 * rows, so the header is not the first content line.
 *
 * The committed fixture is a trimmed excerpt (metadata preamble + header + 60
 * data rows) so the repository stays small; the full file is downloadable from
 * the URL above and its digest is recorded here.
 */
import { describe, expect, it } from 'vitest';
import excerptCsv from '../../docs/flight-validation/cosmic-cargo-2986-excerpt.csv?raw';
import { parseAltimeterCsv } from './altimetry';
import { buildLogProvenance } from './logProvenance';

const EXCERPT = excerptCsv;

describe('parseAltimeterCsv real Altimeter Cloud log', () => {
  it('parses the metadata-prefixed millisecond log and scales ms to seconds', () => {
    const samples = parseAltimeterCsv(EXCERPT);
    // 59 data rows in the excerpt; the first real row is t = -8766 ms.
    expect(samples).toHaveLength(59);
    expect(samples[0]).toEqual({ timeS: -8.766, altitudeM: 0.012 });
    // Ascending after the sort inside the parser.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].timeS).toBeGreaterThanOrEqual(samples[i - 1].timeS);
    }
  });

  it('accepts unspaced-unit and millisecond header aliases directly', () => {
    expect(parseAltimeterCsv('Time(ms),Altitude(m)\n1000,5\n2000,9\n')).toEqual([
      { timeS: 1, altitudeM: 5 },
      { timeS: 2, altitudeM: 9 },
    ]);
    expect(parseAltimeterCsv('time_ms,alt_m\n500,3\n')).toEqual([{ timeS: 0.5, altitudeM: 3 }]);
  });

  it('skips a metadata preamble before a recognized header', () => {
    const csv = 'Apogee meters,291.74\nDevice,BECs Nano 2\nTime(ms),Altitude(m)\n0,1\n20,2\n';
    expect(parseAltimeterCsv(csv)).toEqual([
      { timeS: 0, altitudeM: 1 },
      { timeS: 0.02, altitudeM: 2 },
    ]);
  });

  it('still fails closed on an unrecognized header-like first line', () => {
    expect(() => parseAltimeterCsv('time,position\n0,10\n1,20\n')).toThrow(/unrecognized header/);
    expect(() => parseAltimeterCsv('sec,alt\n0,10\n')).toThrow(/unrecognized header/);
  });

  it('reports real provenance for the excerpt', async () => {
    const samples = parseAltimeterCsv(EXCERPT);
    const prov = await buildLogProvenance({
      rawText: EXCERPT,
      fileName: 'cosmic-cargo-2986-excerpt.csv',
      rowCount: samples.length,
    });
    expect(prov.dialect).toBe('generic-csv');
    expect(prov.rowCount).toBe(59);
    // 15 metadata rows + 1 header row are skipped.
    expect(prov.skippedLineCount).toBe(16);
  });
});
