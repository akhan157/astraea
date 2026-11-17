// BL1 round 2, step 2: Monte Carlo for the two Vulcanite flights.
//   ./node_modules/.bin/vitest run docs/internal/execution-runs/BL1-blind-predictions/02c-vulcanite.probe.ts --maxWorkers=1 --config docs/internal/execution-runs/BL1-blind-predictions/vitest.config.ts
// Writes out/ensemble-vulcanite.json. Same sampler, seed, sigmas and run count
// as the first six flights, plus the manufacturer-data impulse bracket
// (+/-10 % base impulse) because I140W and J270W are not certified curves.
import { mkdirSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import {
  APP_DEFAULT_MC, ensembleRunWithMotor, flightOptions, loadEngine, loadMotor,
  reconstructDesign, type DownloadedMotor, type McRun,
} from './probe-lib';
import { MANUFACTURER_IMPULSE_BRACKET, SCENARIOS, summarise, withScenario, type ScenarioStats } from './scenarios';

const OUT = new URL('./out/', import.meta.url);
const N_RUNS = Number(process.env.BL1_N_RUNS ?? APP_DEFAULT_MC.nRuns);

const MOTORS: Array<{ design: 'V002'; motor: DownloadedMotor; flights: string[] }> = [
  { design: 'V002', motor: 'i140w', flights: ['V002-01'] },
  { design: 'V002', motor: 'j270w', flights: ['V002-02'] },
];

const VULCANITE_SCENARIOS = [...SCENARIOS, ...MANUFACTURER_IMPULSE_BRACKET];

it('runs the app Monte Carlo for the two Vulcanite flights', async () => {
  const { engine, sha256 } = await loadEngine();
  const vehicle = (await reconstructDesign(engine, 'V002')).vehicle;
  const sets: unknown[] = [];
  for (const entry of MOTORS) {
    const loaded = loadMotor(entry.motor);
    const perScenario: Array<{ id: string; why: string; baseImpulseScale: number; stats: ScenarioStats }> = [];
    const all: McRun[] = [];
    for (const scenario of VULCANITE_SCENARIOS) {
      const scenarioVehicle = withScenario(vehicle, scenario);
      const options = flightOptions(scenarioVehicle, scenario.launch);
      const runs = Array.from({ length: N_RUNS }, (_, i) =>
        ensembleRunWithMotor(engine, scenarioVehicle, loaded.motor, options, APP_DEFAULT_MC, i, scenario.baseImpulseScale));
      perScenario.push({ id: scenario.id, why: scenario.why, baseImpulseScale: scenario.baseImpulseScale, stats: summarise(runs) });
      all.push(...runs);
    }
    sets.push({
      design: entry.design,
      motorKey: entry.motor,
      flights: entry.flights,
      motorFile: loaded.file,
      motorSha256: loaded.sha256,
      dataSource: loaded.source,
      nRunsPerScenario: N_RUNS,
      scenarios: VULCANITE_SCENARIOS.length,
      totalRuns: all.length,
      seed: APP_DEFAULT_MC.seed,
      sigmas: APP_DEFAULT_MC.sigmas,
      product: perScenario[0].stats,
      qualified: summarise(all),
      perScenario,
    });
    expect(perScenario[0].stats.p5).toBeGreaterThan(0);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL('ensemble-vulcanite.json', OUT), JSON.stringify({ wasmSha256: sha256, sets }, null, 2));
});
