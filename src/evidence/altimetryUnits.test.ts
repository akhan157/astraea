import { describe, expect, it } from 'vitest';
import { parseAltimeterCsv, parseAltimeterCsvDetailed } from './altimetry';
import { buildLogProvenance, LOG_ALTITUDE_UNIT_ASSUMPTION, LOG_TIME_UNIT_ASSUMPTION } from './logProvenance';

describe('altimeter log units', () => {
  it('assumes seconds and meters for unlabeled columns', () => {
    const r = parseAltimeterCsvDetailed('time,altitude\n0,0\n1,100\n');
    expect(r.timeUnit).toEqual({ unit: 's', basis: 'assumed' });
    expect(r.altitudeUnit).toEqual({ unit: 'm', basis: 'assumed' });
    expect(r.samples[1]).toEqual({ timeS: 1, altitudeM: 100 });
  });

  it('converts a feet header to meters and says the unit came from the header', () => {
    const r = parseAltimeterCsvDetailed('time_ms,"altitude (ft)"\n0,0\n500,1000\n');
    expect(r.timeUnit).toEqual({ unit: 'ms', basis: 'header' });
    expect(r.altitudeUnit).toEqual({ unit: 'ft', basis: 'header' });
    expect(r.samples[1].timeS).toBeCloseTo(0.5, 12);
    expect(r.samples[1].altitudeM).toBeCloseTo(304.8, 9);
  });

  it('records explicit second and meter headers as header-sourced', () => {
    const r = parseAltimeterCsvDetailed('time_s,altitude_m\n0,0\n1,5\n');
    expect(r.timeUnit.basis).toBe('header');
    expect(r.altitudeUnit.basis).toBe('header');
  });

  it('lets the user override both units, including over the header', () => {
    const r = parseAltimeterCsvDetailed('time,altitude_m\n0,0\n2000,1000\n', { time: 'ms', altitude: 'ft' });
    expect(r.timeUnit).toEqual({ unit: 'ms', basis: 'override' });
    expect(r.altitudeUnit).toEqual({ unit: 'ft', basis: 'override' });
    expect(r.samples[1].timeS).toBeCloseTo(2, 12);
    expect(r.samples[1].altitudeM).toBeCloseTo(304.8, 9);
  });

  it('applies overrides to headerless numeric data', () => {
    expect(parseAltimeterCsv('0,0\n1,10\n', { altitude: 'ft' })[1].altitudeM).toBeCloseTo(3.048, 12);
  });

  it('states the resolved units in provenance, and the old assumption by default', async () => {
    const units = parseAltimeterCsvDetailed('time_ms,altitude_ft\n0,0\n1,1\n');
    const p = await buildLogProvenance({ rawText: 'x', fileName: null, rowCount: 2, units });
    expect(p.timeUnitAssumption).toBe('milliseconds (from header)');
    expect(p.altitudeUnitAssumption).toBe('feet (from header)');
    const d = await buildLogProvenance({ rawText: 'x', fileName: null, rowCount: 2 });
    expect(d.timeUnitAssumption).toBe(LOG_TIME_UNIT_ASSUMPTION);
    expect(d.altitudeUnitAssumption).toBe(LOG_ALTITUDE_UNIT_ASSUMPTION);
  });
});
