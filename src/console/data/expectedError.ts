import type { FlightRun } from './contract';
import { builtUpDragStatus } from './builtUpDrag';
import { cohortError, cohortErrorOption } from './cohortError.generated';

/** Describes only the recorded invocation, never the currently edited design. */
export function expectedErrorLine(run: FlightRun): string {
  if (run.dragCalibration !== undefined) return 'No error band: drag calibration applied.';
  const physics = run.physicsOptions;
  const drag = builtUpDragStatus(run.manifest);
  const axialDrag = run.manifest?.axialDrag;
  if (drag === 'refused' || (typeof axialDrag === 'string' && axialDrag.startsWith('legacy 25-station Mach drag tables') && physics?.flightDragSource === undefined)) return 'No error band for legacy drag.';
  if (drag !== 'used' || physics?.flightDragSource !== 'calibrated') return 'No error band for this flight.';
  const mach = run.summary.maxMach.value, apogee = run.summary.apogee.value;
  if (typeof mach !== 'number' || !Number.isFinite(mach) || mach < 0 || mach > cohortError.maxMach ||
      typeof apogee !== 'number' || !Number.isFinite(apogee) || apogee < 0 || apogee > cohortError.maxApogee) {
    return 'No error band: outside the tested range.';
  }
  if (!Number.isFinite(physics.launchSiteTemperatureC)) return 'No error band: site temperature not set.';
  const regime = mach < 0.8 ? 'subsonic' : mach < 1.5 ? 'transonic' : 'supersonic';
  const value = cohortError[regime][cohortErrorOption];
  const displayed = cohortErrorOption === 'maximum' ? Math.ceil(value * 10) / 10 : value;
  return `Average apogee error ±${displayed.toFixed(1)} % (dev. data, ${cohortError[regime].airframes} rockets in this speed range; not a limit)`;
}
