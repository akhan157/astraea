// B1 S4 report-only rows (S4 RESULT.md orchestrator disposition). TESTS/PROBE ONLY.
//
//   B1_OUT=<dir> ./node_modules/.bin/vitest run --maxWorkers=2 \
//     --config docs/internal/execution-runs/B1-step3-benchmark/vitest.config.ts s4
//
// Frozen flight list (S4 RESULT.md; never added to or dropped from):
//   time to apogee n=4 : cosmic-cargo-2986, mini-dx3-g69n-2017-06-30 (G69N 30JUN2017 FIP 1),
//                        top-shot-e12-2017-12-14, adventurer-j510w-2021-04-17
//   max Mach       n=1 : Proteus 6 (measured 2.94, mean of two integrated accelerometers)
//
// Time-to-apogee flights go through the app's own development-case path
// (`runDevelopmentCase` -> bridge `simulateFlight`), which derives the candidate default
// options. Proteus 6 goes through the manifest DTO plus the same candidate-default options,
// as in P9. Both run on the final E1 WASM, whose hash is asserted. Every frozen flight is
// recorded, including failures; none is selected by agreement, no row is gated or tuned.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { instantiateEngine } from '../../../../src/engine/core';
import type { DevelopmentReport } from '../../../../src/validation/development/benchmark';
import { DEVELOPMENT_CASES, runDevelopmentCase } from '../../../../src/validation/development/benchmark';
import { loadCohort, candidateDefaultOptions, sha256 } from './cohort';

const CANDIDATE_WASM = '/home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/candidate-4c1ec4ed.wasm';
const CANDIDATE_SHA = '4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535';
const DATA_ROOT = '/home/ak/flight-data';
const FROZEN_IDS = ['cosmic-cargo-2986', 'mini-dx3-g69n-2017-06-30', 'top-shot-e12-2017-12-14', 'adventurer-j510w-2021-04-17'];

interface ApogeeRowBase { id: string; title: string }
interface ApogeeRowRan {
  status: 'ran';
  measuredApogeeTimeS: number | null;
  measuredApogeeTimeSource: string | null;
  measuredApogeeTimeDeclaredInCase: number | null;
  measuredClockDefinition: string;
  simulatedApogeeTimeS: number | null;
  simulatedClockDefinition: string;
  signedDifferenceS: number | null;
  signedDifferenceDefinition: 'simulated - measured';
  measuredApogeeM: number | null;
  simulatedApogeeM: number | null;
  signedApogeeErrorM: number | null;
  eventTimingQualification: DevelopmentReport['qualification']['eventTiming'];
  engineSha256: string;
  sourceSha256: string;
  axialDragLine: string | null;
  clockCaveat: string;
}
interface ApogeeRowFailed { status: 'FAILED'; error: string }
type ApogeeRow = ApogeeRowBase & (ApogeeRowRan | ApogeeRowFailed);

interface MachResult {
  maxMach: number;
  maxVelocity: number;
  apogeeAltitude: number;
  runManifest?: { axialDrag?: string };
}

it('S4: time to apogee (n=4) and max Mach (n=1) on the candidate default', async () => {
  expect(FROZEN_IDS.length).toBe(4);
  const { entries, sha256: manifestSha } = loadCohort();
  const wasmPath = process.env.B1_CAND_WASM || CANDIDATE_WASM;
  const wasmBytes = readFileSync(wasmPath);
  const wasmSha = sha256(wasmBytes);
  expect(wasmSha).toBe(CANDIDATE_SHA);

  const apogeeRows: ApogeeRow[] = [];
  for (const id of FROZEN_IDS) {
    const spec = DEVELOPMENT_CASES.find((c) => c.id === id);
    if (!spec) throw new Error(`frozen flight ${id} is missing from DEVELOPMENT_CASES`);
    try {
      const report = await runDevelopmentCase(DATA_ROOT, spec, wasmBytes, wasmSha);
      expect(report.engine.sha256).toBe(CANDIDATE_SHA);
      // The Rust run manifest carries axialDrag (crates/astraea-engine/src/models.rs:1529);
      // the TS SixDofRunManifest interface does not declare it yet.
      const runManifest = report.model.runManifest as unknown as { axialDrag?: string };
      const m = report.metrics;
      apogeeRows.push({
        id, title: spec.title, status: 'ran',
        measuredApogeeTimeS: m.measuredApogeeTime?.value ?? null,
        measuredApogeeTimeSource: report.measurement.observedApogee?.source ?? null,
        measuredApogeeTimeDeclaredInCase: spec.measuredApogeeTimeS ?? null,
        measuredClockDefinition: report.measurement.launchReference.source,
        simulatedApogeeTimeS: m.simulatedApogeeTime?.value ?? null,
        simulatedClockDefinition: 'engine apogeeTime: seconds after simulated ignition (t = 0)',
        signedDifferenceS: m.apogeeTimeError?.value ?? null,
        signedDifferenceDefinition: 'simulated - measured',
        measuredApogeeM: m.measuredApogee?.value ?? null,
        simulatedApogeeM: m.simulatedApogee?.value ?? null,
        signedApogeeErrorM: m.signedApogeeError?.value ?? null,
        eventTimingQualification: report.qualification.eventTiming,
        engineSha256: report.engine.sha256,
        sourceSha256: report.source.sha256,
        axialDragLine: runManifest.axialDrag ?? null,
        clockCaveat: spec.format === 'trajectory-csv'
          ? 'measured time uses the source log clock; its zero relative to ignition is not established'
          : 'measured time uses the unshifted Raven record clock (elapsed from liftoff detection, which may lag first motion); no ignition-to-recorder offset is established',
      });
    } catch (err) {
      apogeeRows.push({ id, title: spec.title, status: 'FAILED', error: String((err as Error).message ?? err) });
    }
  }

  const proteus = entries.find((x) => x.slug === 'proteus6');
  if (!proteus) throw new Error('proteus6 is missing from the cohort manifest');
  const engine = await instantiateEngine(wasmBytes);
  const optionsCandidate = candidateDefaultOptions(proteus);
  const optionsA: Record<string, unknown> = { ...proteus.options };
  const fly = (options: Record<string, unknown>) =>
    engine.call<MachResult>('simulate_flight', { vehicle: proteus.vehicle, motor: proteus.motor, options });
  const rc = fly(optionsCandidate), ra = fly(optionsA);
  const mach = {
    id: 'proteus6',
    measuredMaxMach: 2.94,
    measuredMaxVelocityFts: 3201,
    measuredSource: 'R40 cohort manifest, Proteus 6 notes: maximum velocity 3201 ft/s (Mach 2.94), integrated accelerometer, mean of the two',
    measuredMachDefinition: 'not stated by the source; it reports integrated (ground/axial) velocity and a Mach number without an air-relative definition or atmosphere',
    candidateMaxMach: rc.maxMach,
    candidateMaxVelocityMs: rc.maxVelocity,
    candidateMachDefinition: 'macro-sampled air-relative Mach (docs/internal/output-dictionary.md)',
    signedDifferenceMach: rc.maxMach - 2.94,
    label: 'NON-COMPARABLE unless the source Mach definition is established',
    candidateAxialDragLine: rc.runManifest?.axialDrag ?? null,
    armAMaxMach: ra.maxMach,
    armAAxialDragLine: ra.runManifest?.axialDrag ?? null,
    optionsCandidate,
    engineSha256: wasmSha,
  };

  const out = process.env.B1_OUT || 'out/B1/s4';
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/s4-rows.json`, JSON.stringify({
    wasm: { path: wasmPath, sha256: wasmSha },
    manifest: { path: '/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json', sha256: manifestSha },
    frozenList: FROZEN_IDS,
    apogeeRules: {
      measuredApogeeTime: 'case-declared metadata time when present, else the maximum sampled barometric AGL altitude',
      simulatedApogeeTime: 'engine apogeeTime, seconds after simulated ignition',
      signedDifference: 'simulated - measured; clocks are not synchronized',
    },
    apogeeRows,
    mach,
  }, null, 2));
}, 1_800_000);
