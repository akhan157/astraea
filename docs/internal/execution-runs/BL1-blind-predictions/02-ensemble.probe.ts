// BL1 step 3: nominal and 5-95 % apogee from the app's own Monte Carlo sampler.
//   ./node_modules/.bin/vitest run --maxWorkers=2 --config docs/internal/execution-runs/BL1-blind-predictions/vitest.config.ts
//
// The app's ensemble command returns landing points only (spec Amendment 2), so
// this probe replays the app's per-run draws (subSeedOf + mulberry32 + the
// engine's draw order) and reads apogee from the same engine flight. The replay
// is asserted against run_ensemble_chunk landings in 01-qualify.
//
// Scenarios carry the inputs the flights did not record (site, wind, rail,
// mass); each scenario is its own app ensemble with the app's default sigmas.
// The qualified interval is the union over scenarios.
import { mkdirSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import {
  APP_DEFAULT_LAUNCH, APP_DEFAULT_MC, DESIGNS, ensembleRun, flightOptions, loadEngine,
  percentile, reconstructDesign, type DesignKey, type McRun,
} from './probe-lib';
import type { RocketVehicle } from '../../../../src/core/types';

const OUT = new URL('./out/', import.meta.url);
const N_RUNS = APP_DEFAULT_MC.nRuns;

interface Scenario {
  id: string;
  why: string;
  launch: typeof APP_DEFAULT_LAUNCH;
  site?: { altitudeM: number; temperatureC?: number };
  stageMassDeltaKg: number;
}

const SCENARIOS: Scenario[] = [
  { id: 'app-default', why: 'the app new-design defaults: sea level, ISA, rail 3.0 m/85 deg, wind 3 m/s', launch: APP_DEFAULT_LAUNCH, stageMassDeltaKg: 0 },
  { id: 'site-400m-0C', why: 'unrecorded site: 400 m ASL, 0 degC', launch: APP_DEFAULT_LAUNCH, site: { altitudeM: 400, temperatureC: 0 }, stageMassDeltaKg: 0 },
  { id: 'site-400m-30C', why: 'unrecorded site: 400 m ASL, 30 degC', launch: APP_DEFAULT_LAUNCH, site: { altitudeM: 400, temperatureC: 30 }, stageMassDeltaKg: 0 },
  { id: 'wind-0', why: 'unrecorded weather: calm', launch: { ...APP_DEFAULT_LAUNCH, windSpeedSurface: 0 }, stageMassDeltaKg: 0 },
  { id: 'wind-5', why: 'unrecorded weather: 5 m/s surface wind', launch: { ...APP_DEFAULT_LAUNCH, windSpeedSurface: 5 }, stageMassDeltaKg: 0 },
  { id: 'rail-1.2m', why: 'unrecorded rail: 1.2 m rod', launch: { ...APP_DEFAULT_LAUNCH, railLength: 1.2 }, stageMassDeltaKg: 0 },
  { id: 'mass-plus-1g', why: 'page-vs-ORK mass gap, +1 g', launch: APP_DEFAULT_LAUNCH, stageMassDeltaKg: 0.001 },
  { id: 'mass-minus-1g', why: 'page-vs-ORK mass gap, -1 g', launch: APP_DEFAULT_LAUNCH, stageMassDeltaKg: -0.001 },
];

function withScenario(vehicle: RocketVehicle, scenario: Scenario): RocketVehicle {
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

interface ScenarioStats { n: number; p5: number; p50: number; p95: number; min: number; max: number; failed: number }

function summarise(runs: McRun[]): ScenarioStats {
  const apogees = runs.map((r) => r.apogeeASL);
  const sorted = [...apogees].sort((a, b) => a - b);
  return {
    n: runs.length,
    p5: percentile(sorted, 5),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    failed: runs.filter((r) => !Number.isFinite(r.apogeeASL)).length,
  };
}

it('runs the app Monte Carlo over the qualified scenarios', async () => {
  const { engine, sha256 } = await loadEngine();
  const sets: unknown[] = [];
  for (const key of Object.keys(DESIGNS) as DesignKey[]) {
    const reconstruction = await reconstructDesign(engine, key);
    const motorId = key === 'V001' ? 'estes_c6' : null;
    if (motorId === null) {
      sets.push({ design: key, reason: 'no bundled motor for either flight', scenarios: [] });
      continue;
    }
    const perScenario: Array<{ scenario: Scenario; options: Record<string, unknown>; stats: ScenarioStats }> = [];
    const all: McRun[] = [];
    for (const scenario of SCENARIOS) {
      const vehicle = withScenario(reconstruction.vehicle, scenario);
      const options = flightOptions(vehicle, scenario.launch);
      // A site without a temperature keeps the engine's ISA column.
      if (scenario.site === undefined) delete (options as { launchSiteTemperatureC?: number }).launchSiteTemperatureC;
      const runs: McRun[] = [];
      for (let i = 0; i < N_RUNS; i += 1) runs.push(ensembleRun(engine, vehicle, motorId, options, APP_DEFAULT_MC, i));
      perScenario.push({ scenario, options, stats: summarise(runs) });
      all.push(...runs);
    }
    const product = perScenario[0].stats;
    const qualified = summarise(all);
    sets.push({
      design: key,
      motorId,
      nRunsPerScenario: N_RUNS,
      scenarios: SCENARIOS.length,
      totalRuns: all.length,
      seed: APP_DEFAULT_MC.seed,
      sigmas: APP_DEFAULT_MC.sigmas,
      sampler: 'per-run-v2 (subSeedOf + mulberry32); engine draw order wind-azimuth -> folded rail-elevation -> impulse',
      product,
      qualified,
      perScenario: perScenario.map((row) => ({ id: row.scenario.id, why: row.scenario.why, launch: row.scenario.launch, site: row.scenario.site ?? null, stageMassDeltaKg: row.scenario.stageMassDeltaKg, options: row.options, stats: row.stats })),
    });
    expect(qualified.p5).toBeGreaterThan(0);
    expect(qualified.p95).toBeGreaterThan(qualified.p5);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL('ensemble.json', OUT), JSON.stringify({ wasmSha256: sha256, sets }, null, 2));
  writeFileSync(new URL('ensemble-meta.json', OUT), JSON.stringify({ nRuns: N_RUNS, seed: APP_DEFAULT_MC.seed, sigmas: APP_DEFAULT_MC.sigmas, scenarios: SCENARIOS.map((s) => ({ id: s.id, why: s.why, launch: s.launch, site: s.site ?? null, stageMassDeltaKg: s.stageMassDeltaKg })) }, null, 2));
});
