// BL1 round 2, verification: the long Monte Carlo artifacts are complete and
// their nominals reproduce on the released WASM.
//   ./node_modules/.bin/vitest run docs/internal/execution-runs/BL1-blind-predictions/04-verify.probe.ts --maxWorkers=2 --config docs/internal/execution-runs/BL1-blind-predictions/vitest.config.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import {
  APP_DEFAULT_LAUNCH, APP_DEFAULT_MC, DESIGNS, flightOptions, flyWithMotor, loadEngine,
  loadMotor, reconstructDesign, WASM_PATH, WASM_SHA256, sha256, type DownloadedMotor,
} from './probe-lib';

const OUT = new URL('./out/', import.meta.url);
const KEYS: DownloadedMotor[] = ['d13w', 'questC6', 'i140w', 'j270w'];

interface Stats { n: number; p5: number; p50: number; p95: number; failed: number }
interface Set { motorKey: string; nRunsPerScenario: number; scenarios: number; totalRuns: number; seed: number; product: Stats; qualified: Stats }
interface ExtraRow { motorKey: string; nominal: { apogeeAGL: number } }

it('verifies the round-2 Monte Carlo artifacts', async () => {
  const bytes = readFileSync(WASM_PATH);
  expect(sha256(bytes)).toBe(WASM_SHA256);
  for (const d of Object.values(DESIGNS)) expect(sha256(readFileSync(d.path))).toBe(d.sha256);

  const emerald = JSON.parse(readFileSync(new URL('ensemble-emerald-extra.json', OUT), 'utf8')) as { wasmSha256: string; sets: Set[] };
  const vulcanite = JSON.parse(readFileSync(new URL('ensemble-vulcanite.json', OUT), 'utf8')) as { wasmSha256: string; sets: Set[] };
  const qualify = JSON.parse(readFileSync(new URL('qualify-extra.json', OUT), 'utf8')) as { wasmSha256: string; rows: ExtraRow[] };
  expect(emerald.wasmSha256).toBe(WASM_SHA256);
  expect(vulcanite.wasmSha256).toBe(WASM_SHA256);
  expect(qualify.wasmSha256).toBe(WASM_SHA256);

  const all = [...emerald.sets, ...vulcanite.sets];
  expect(all.map((s) => s.motorKey)).toEqual(KEYS);

  const { engine } = await loadEngine();
  const vehicles = {
    V001: (await reconstructDesign(engine, 'V001')).vehicle,
    V002: (await reconstructDesign(engine, 'V002')).vehicle,
  };
  const rows: unknown[] = [];
  for (const set of all) {
    expect(set.nRunsPerScenario).toBe(APP_DEFAULT_MC.nRuns);
    expect(set.seed).toBe(APP_DEFAULT_MC.seed);
    expect(set.totalRuns).toBe(set.nRunsPerScenario * set.scenarios);
    expect(set.scenarios).toBe(set.motorKey === 'i140w' || set.motorKey === 'j270w' ? 10 : 8);
    expect(set.qualified.n).toBe(set.totalRuns);
    expect(set.qualified.failed).toBe(0);
    expect(set.qualified.p5).toBeGreaterThan(0);
    expect(set.qualified.p95).toBeGreaterThan(set.qualified.p5);

    const motor = loadMotor(set.motorKey as DownloadedMotor).motor;
    const design = set.motorKey === 'd13w' || set.motorKey === 'questC6' ? 'V001' : 'V002';
    const flight = flyWithMotor(engine, vehicles[design], motor, flightOptions(vehicles[design], APP_DEFAULT_LAUNCH));
    const recorded = qualify.rows.find((r) => r.motorKey === set.motorKey)?.nominal.apogeeAGL;
    expect(recorded).toBeCloseTo(flight.apogeeAltitude, 9);
    expect(set.qualified.p5).toBeLessThan(flight.apogeeAltitude);
    expect(set.qualified.p95).toBeGreaterThan(flight.apogeeAltitude);
    rows.push({ motorKey: set.motorKey, nominalAGL: flight.apogeeAltitude, p5: set.qualified.p5, p95: set.qualified.p95, totalRuns: set.totalRuns, failed: set.qualified.failed });
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL('verify.json', OUT), JSON.stringify({ wasmSha256: WASM_SHA256, rows }, null, 2));
});
