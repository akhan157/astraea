// BL1 scenario set shared by the round-2 probes. Identical to the eight
// scenarios recorded in 02-ensemble.probe.ts for the first six flights; the two
// manufacturer-data impulse brackets are added only for the I140W/J270W.
import { APP_DEFAULT_LAUNCH, percentile } from './probe-lib';
import type { RocketVehicle } from '../../../../src/core/types';
import type { McRun } from './probe-lib';

export interface Scenario {
  id: string;
  why: string;
  launch: typeof APP_DEFAULT_LAUNCH;
  site?: { altitudeM: number; temperatureC?: number };
  stageMassDeltaKg: number;
  /** Base impulse multiplier before the app's own 5 % per-run sigma. */
  baseImpulseScale: number;
}

export const SCENARIOS: Scenario[] = [
  { id: 'app-default', why: 'the app new-design defaults: sea level, ISA, rail 3.0 m/85 deg, wind 3 m/s', launch: APP_DEFAULT_LAUNCH, stageMassDeltaKg: 0, baseImpulseScale: 1 },
  { id: 'site-400m-0C', why: 'unrecorded site: 400 m ASL, 0 degC', launch: APP_DEFAULT_LAUNCH, site: { altitudeM: 400, temperatureC: 0 }, stageMassDeltaKg: 0, baseImpulseScale: 1 },
  { id: 'site-400m-30C', why: 'unrecorded site: 400 m ASL, 30 degC', launch: APP_DEFAULT_LAUNCH, site: { altitudeM: 400, temperatureC: 30 }, stageMassDeltaKg: 0, baseImpulseScale: 1 },
  { id: 'wind-0', why: 'unrecorded weather: calm', launch: { ...APP_DEFAULT_LAUNCH, windSpeedSurface: 0 }, stageMassDeltaKg: 0, baseImpulseScale: 1 },
  { id: 'wind-5', why: 'unrecorded weather: 5 m/s surface wind', launch: { ...APP_DEFAULT_LAUNCH, windSpeedSurface: 5 }, stageMassDeltaKg: 0, baseImpulseScale: 1 },
  { id: 'rail-1.2m', why: 'unrecorded rail: 1.2 m rod', launch: { ...APP_DEFAULT_LAUNCH, railLength: 1.2 }, stageMassDeltaKg: 0, baseImpulseScale: 1 },
  { id: 'mass-plus-1g', why: 'page-vs-ORK mass gap, +1 g', launch: APP_DEFAULT_LAUNCH, stageMassDeltaKg: 0.001, baseImpulseScale: 1 },
  { id: 'mass-minus-1g', why: 'page-vs-ORK mass gap, -1 g', launch: APP_DEFAULT_LAUNCH, stageMassDeltaKg: -0.001, baseImpulseScale: 1 },
];

/**
 * Manufacturer curves are not certified static-test data: there is no NAR/TRA
 * certificate and no published batch tolerance behind them. The bracket below
 * is a declared assumption, not a measured distribution, and covers a 10 %
 * total-impulse difference each way on top of the app's own 5 % sigma.
 */
export const MANUFACTURER_IMPULSE_BRACKET: Scenario[] = [
  { id: 'mfr-impulse-plus-10pct', why: 'manufacturer data: base impulse +10 % (declared assumption, no cert data)', launch: APP_DEFAULT_LAUNCH, stageMassDeltaKg: 0, baseImpulseScale: 1.10 },
  { id: 'mfr-impulse-minus-10pct', why: 'manufacturer data: base impulse -10 % (declared assumption, no cert data)', launch: APP_DEFAULT_LAUNCH, stageMassDeltaKg: 0, baseImpulseScale: 0.90 },
];

export function withScenario(vehicle: RocketVehicle, scenario: Scenario): RocketVehicle {
  const components = vehicle.components.map((c) => {
    if (c.id === 'bl1-declared-stage-mass' && c.type === 'masscomponent') {
      return { ...c, mass: c.mass + scenario.stageMassDeltaKg };
    }
    return c;
  });
  return {
    ...vehicle,
    components,
    ...(scenario.site === undefined ? {} : { launchSite: scenario.site }),
  };
}

export interface ScenarioStats { n: number; p5: number; p50: number; p95: number; min: number; max: number; failed: number }

export function summarise(runs: McRun[]): ScenarioStats {
  const sorted = runs.map((r) => r.apogeeASL).sort((a, b) => a - b);
  return {
    n: sorted.length,
    p5: percentile(sorted, 5),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    failed: runs.filter((r) => !Number.isFinite(r.apogeeASL)).length,
  };
}
