import { describe, expect, it } from 'vitest';
import { expectedErrorLine } from './expectedError';
import { cohortError, cohortErrorOption } from './cohortError.generated';
import type { FlightRun } from './contract';

function flight(mach = 0.5): FlightRun {
  return { summary: { maxMach: { value: mach }, apogee: { value: 2000 } }, physicsOptions: { flightDragSource: 'calibrated', launchSiteTemperatureC: 20 }, manifest: { axialDrag: 'calibrated build-up axial drag (alpha = 0)' } } as unknown as FlightRun;
}
const airframes = { subsonic: 8, transonic: 7, supersonic: 5 } as const;
function line(regime: 'subsonic' | 'transonic' | 'supersonic') {
  const value = cohortError[regime][cohortErrorOption];
  return `Average apogee error ±${(cohortErrorOption === 'maximum' ? Math.ceil(value * 10) / 10 : value).toFixed(1)} % (dev. data, ${airframes[regime]} rockets in this speed range; not a limit)`;
}
describe('recorded flight error line', () => {
  it.each([[0.7999, 'subsonic'], [0.8, 'transonic'], [1.4999, 'transonic'], [1.5, 'supersonic']] as const)('classifies Mach %s', (mach, regime) => expect(expectedErrorLine(flight(mach))).toBe(line(regime)));
  it('includes the exact Mach and apogee ceilings, and excludes values above each', () => {
    const r = flight(cohortError.maxMach); r.summary.apogee.value = cohortError.maxApogee;
    expect(expectedErrorLine(r)).toBe(line('supersonic'));
    r.summary.maxMach.value = cohortError.maxMach + 1e-10;
    expect(expectedErrorLine(r)).toBe('No error band: outside the tested range.');
    r.summary.maxMach.value = cohortError.maxMach; r.summary.apogee.value = cohortError.maxApogee + 1e-8;
    expect(expectedErrorLine(r)).toBe('No error band: outside the tested range.');
  });
  it('withholds legacy and refused drag', () => {
    const r = flight(); r.physicsOptions = undefined; r.manifest.axialDrag = 'legacy 25-station Mach drag tables';
    expect(expectedErrorLine(r)).toBe('No error band for legacy drag.');
    r.physicsOptions = { flightDragSource: 'calibrated' }; r.manifest.axialDrag += '; legacy drag used (refused: fins)';
    expect(expectedErrorLine(r)).toBe('No error band for legacy drag.');
  });
  it('withholds for unknown drag provenance', () => { const r = flight(); r.manifest.axialDrag = 'unknown'; expect(expectedErrorLine(r)).toBe('No error band for this flight.'); });
  it('withholds when site temperature is missing', () => { const r = flight(); delete r.physicsOptions!.launchSiteTemperatureC; expect(expectedErrorLine(r)).toBe('No error band: site temperature not set.'); });
  it('withholds for an applied calibration even with explicit built-up drag', () => { const r = flight(); r.dragCalibration = {} as NonNullable<FlightRun['dragCalibration']>; expect(expectedErrorLine(r)).toBe('No error band: drag calibration applied.'); });
  it('retains the band without a nozzle exit', () => expect(expectedErrorLine(flight())).toBe(line('subsonic')));
});
