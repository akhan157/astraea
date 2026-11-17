// BL1 step 4: freeze the predictions into PREDICTIONS.json.
//   ./node_modules/.bin/vitest run --maxWorkers=2 --config docs/internal/execution-runs/BL1-blind-predictions/vitest.config.ts
// Reads the probe outputs in out/ and writes the committed PREDICTIONS.json plus
// the Markdown table rows used in PREDICTIONS.md (out/tables.md).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { APP_DEFAULT_LAUNCH, DESIGNS, WASM_PATH, WASM_SHA256, sha256 } from './probe-lib';

const OUT = new URL('./out/', import.meta.url);
const TARGET = new URL('./PREDICTIONS.json', import.meta.url);
const SOURCE_SHA = 'f7a893489c5c7063653beaa810b81c84a3b1dcba';

const SEALED_FLIGHTS = [
  { id: 'V001-01', design: 'V001', motor: 'Estes C6-5', motorId: 'estes_c6', motorSha: '013c6fd5', flown: '2017-03-09' },
  { id: 'V001-02', design: 'V001', motor: 'Estes C6-5', motorId: 'estes_c6', motorSha: 'cbb9fb42', flown: '2017-03-09' },
  { id: 'V001-03', design: 'V001', motor: 'Estes C6-5', motorId: 'estes_c6', motorSha: 'de709932', flown: '2017-03-09' },
  { id: 'V001-04', design: 'V001', motor: 'Estes C6-7', motorId: 'estes_c6', motorSha: '6069b319', flown: '2017-03-09' },
  { id: 'V001-05', design: 'V001', motor: 'Estes C6-7', motorId: 'estes_c6', motorSha: '70ca39f9', flown: '2017-03-09' },
  { id: 'V001-06', design: 'V001', motor: 'Estes C6-7', motorId: 'estes_c6', motorSha: '7bef1aff', flown: '2017-03-09' },
  { id: 'V001-07', design: 'V001', motor: 'AeroTech D13-10W', motorId: null, motorSha: '331cb649', flown: '2017-03-09' },
  { id: 'V001-08', design: 'V001', motor: 'Quest QC6-5', motorId: null, motorSha: '9be8158f', flown: '2017-03-09' },
  { id: 'V001-09', design: 'V001', motor: 'Quest QC6-5', motorId: null, motorSha: '11f0326a', flown: '2017-03-09' },
  { id: 'V001-10', design: 'V001', motor: 'Quest QC6-5', motorId: null, motorSha: '09e271ff', flown: '2017-03-09' },
  { id: 'V002-01', design: 'V002', motor: 'AeroTech HP-I140W-14', motorId: null, motorSha: '0d43f917', flown: '2023-02-11' },
  { id: 'V002-02', design: 'V002', motor: 'AeroTech HP-J270W-14', motorId: null, motorSha: 'bf706a9e', flown: '2023-07-08' },
] as const;

const EXCLUSION_RULES = [
  'E1 logger loss: no continuous sample through apogee (truncated file, ascent gap > 1 s, or unparsable)',
  'E2 CATO / no flight: apogee < 10 m AGL, ascent < 1 s, or no altitude step above the pad median + 6 sigma noise',
  'E3 recovery failure: ballistic descent (post-apogee vertical speed > 20 m/s below 50 m AGL) or missing impact sample',
  'E4 no usable altitude channel: no barometric channel, non-finite, outside -100..10000 m AGL, or not zeroed at the pad (GPS-only V002 I140W is exempt and uses E9)',
  'E5 multiple apogees: more than one local maximum above 50 m AGL (staging, second burn, two flights in one file)',
  'E6 pad reference unusable: fewer than 5 s pre-liftoff samples or the pre-liftoff median drifts more than 10 m',
  'E7 liftoff undefined: no ascent above 3 m/s for at least 0.2 s in the first 10 s',
  'E8 declared design mismatch: the log metadata names a different motor or airframe than the sealed record',
  'E9 GPS-only loss (V002 I140W only): fewer than 10 ascent GPS samples, no fix/quality flag, or the maximum is the last sample',
];

const EXTRACTION_RULES = {
  pressure: 'altitude above pad = sample - median(5 s before liftoff); apogee = max of a centred 5-sample running median; AGL',
  gpsOnly: 'max GPS altitude above the pad median, reported with "vertical uncertainty unstated" (V002 I140W only)',
};

const ASSUMPTIONS = [
  'Both designs are flown as declared; the app import refuses the stage mass/CG overrides, so fin seats, component CG overrides and stage mass/CG are re-applied from the design XML (probe-lib.ts).',
  'Launch site is not recorded: sea level (engine default), standard-day temperature (no launchSiteTemperatureC), site 0-400 m ASL and 0-30 degC in the scenario set.',
  'Rail and wind are not recorded: app defaults 3.0 m / 85 deg rail and 3.0 m/s surface wind, with 1.2-3.0 m rail and 0-5 m/s wind in the scenario set (rail angle stays 85 deg plus the 1 deg MC sigma); the app MC perturbs rail angle by 1 deg sigma and wind azimuth by 10 deg sigma.',
  'Structural mass uncertainty is +/-1 g (spec page-vs-ORK gap), applied as a stage point-mass delta in the scenario set.',
  'The app Monte Carlo has no site, temperature, rail-length or mass sigma; those enter only through the scenario set, and the qualified interval is the union over scenarios.',
  'Drag is the legacy 25-station table for both airframes (calibrated drag refuses freeform fins), confirmed from each flight runManifest.axialDrag.',
  'The Estes C6 is the app bundled record (8.8 N*s, 24-point NAR cert curve); the design names the same motor but no curve is in the ORK.',
  'Ejection delay does not enter apogee: deployment is altitude/apogee-driven in this engine, so C6-5 and C6-7 share one trajectory.',
  'Predictions are AGL; launch altitude ASL is 0 in the product default.',
  'The app importer drops the innertube motor mount; the engine seats the motor at the airframe aft end (prepare_flight_vehicle fallback). The design mount is aft-seated, so the motor station differs by at most about 20 mm and the apogee effect is below the interval resolution.',
  'V001 CG is the app computed value 0.314814 m; the design stage overridecg 0.31496 is inert with overridesubcomponentscg=false. The 0.02 m difference is carried as CG uncertainty and does not move apogee materially.',
  'No app, engine, threshold or fixture was changed; the only product code used is the released WASM and the app modules imported read-only by the probes.',
];

interface Stats { n: number; p5: number; p50: number; p95: number; min: number; max: number; failed: number }
interface SetRow { design: string; motorId: string | null; nRunsPerScenario?: number; scenarios?: number; totalRuns?: number; seed?: number; sigmas?: unknown; sampler?: string; product?: Stats; qualified?: Stats; perScenario?: Array<Record<string, unknown>>; reason?: string }

const hashFile = (path: string | URL) => sha256(readFileSync(path));

it('freezes the predictions', () => {
  const wasmBytes = readFileSync(WASM_PATH);
  expect(sha256(wasmBytes)).toBe(WASM_SHA256);
  for (const d of Object.values(DESIGNS)) {
    const digest = hashFile(d.path);
    expect(digest).toBe(d.sha256);
  }

  const qualify = JSON.parse(readFileSync(new URL('qualify.json', OUT), 'utf8')) as { wasmSha256: string; rows: Array<Record<string, unknown>> };
  const ensemble = JSON.parse(readFileSync(new URL('ensemble.json', OUT), 'utf8')) as { wasmSha256: string; sets: SetRow[] };
  const meta = JSON.parse(readFileSync(new URL('ensemble-meta.json', OUT), 'utf8')) as Record<string, unknown>;
  expect(qualify.wasmSha256).toBe(WASM_SHA256);
  expect(ensemble.wasmSha256).toBe(WASM_SHA256);

  const byDesign = new Map(qualify.rows.map((row) => [String(row.design), row]));
  const setByDesign = new Map(ensemble.sets.map((row) => [row.design, row]));

  const flights = SEALED_FLIGHTS.map((flight) => {
    const set = setByDesign.get(flight.design);
    const qualified = flight.motorId === null ? null : set?.qualified ?? null;
    const product = flight.motorId === null ? null : set?.product ?? null;
    const nominal = flight.motorId === null
      ? null
      : (byDesign.get(flight.design)?.flights as Record<string, { nominal: { apogeeAGL: number } }> | undefined)?.[flight.motorId]?.nominal.apogeeAGL ?? null;
    return {
      id: flight.id,
      design: flight.design,
      flown: flight.flown,
      motor: flight.motor,
      motorSha256Prefix: flight.motorSha,
      motorInAppDatabase: flight.motorId !== null,
      dragModel: flight.motorId === null ? null : 'legacy 25-station Mach drag tables (calibrated refuses freeform fins)',
      nominalApogeeAGL_m: nominal,
      interval5to95AGL_m: qualified === null ? null : [qualified.p5, qualified.p95],
      productInterval5to95AGL_m: product === null ? null : [product.p5, product.p95],
      productMedianAGL_m: product === null ? null : product.p50,
      qualification: flight.motorId === null ? 'not_qualified' : 'qualified',
      reason: flight.motorId === null
        ? `${flight.motor} is not in the app's bundled motor database (CERTIFIED_MOTORS: Estes C6, AeroTech H128W, Cesaroni I205, K550W, M1820); no download was made`
        : 'app bundled Estes C6; legacy drag; declared-design reconstruction',
    };
  });

  const prediction = {
    lane: 'BL1-blind-predictions',
    phase: 1,
    status: 'frozen_before_opening',
    opened: false,
    sourceSha: SOURCE_SHA,
    wasm: { path: 'src/engine/astraea_engine.wasm', sha256: WASM_SHA256, bytes: wasmBytes.length },
    designs: Object.entries(DESIGNS).map(([key, d]) => ({
      key,
      path: d.path,
      sha256: d.sha256,
      declaredStage: d.declared,
      appImportRefusal: (byDesign.get(key)?.appImportError as string | undefined) ?? null,
      reconstruction: {
        projectionRemoved: byDesign.get(key)?.projectionRemoved ?? [],
        finSeatsApplied: byDesign.get(key)?.declaredSeatsApplied ?? [],
        componentCgApplied: byDesign.get(key)?.declaredCgApplied ?? [],
        stagePointMass: byDesign.get(key)?.stagePointMass ?? null,
        finalMassKg: (byDesign.get(key)?.massRollupFinal as { totalMassKg?: number } | undefined)?.totalMassKg ?? null,
        finalCgM: (byDesign.get(key)?.massRollupFinal as { cgM?: number } | undefined)?.cgM ?? null,
        staticMarginCalibers: (byDesign.get(key)?.stability as { staticMarginCalibers?: number } | undefined)?.staticMarginCalibers ?? null,
        unreconstructed: byDesign.get(key)?.unreconstructed ?? null,
      },
      axialDrag: (() => {
        const flightsByMotor = byDesign.get(key)?.flights as Record<string, { axialDrag: string }> | undefined;
        return flightsByMotor?.estes_c6?.axialDrag ?? null;
      })(),
    })),
    appDefaults: {
      launch: APP_DEFAULT_LAUNCH,
      monteCarlo: { seed: meta.seed, sigmas: meta.sigmas, nRunsPerScenario: meta.nRuns },
    },
    scenarios: meta.scenarios,
    intervalMethod: 'nearest-rank p5/p95 over the union of all scenario runs (ceil(p/100*n)-1), the engine\'s own percentile rule; the qualified interval is the union over the scenario set, the product interval is the app-default scenario alone',
    flights,
    motorAvailability: {
      bundled: ['Estes C6', 'AeroTech H128W', 'Cesaroni I205', 'AeroTech K550W', 'Cesaroni M1820'],
      missingForSealedFlights: ['AeroTech D13-10W', 'Quest QC6-5', 'AeroTech HP-I140W-14', 'AeroTech HP-J270W-14'],
    },
    sets: ensemble.sets,
    exclusionRules: EXCLUSION_RULES,
    extractionRules: EXTRACTION_RULES,
    assumptions: ASSUMPTIONS,
    evidence: {
      qualify: { file: 'BL1-blind-predictions/out/qualify.json', sha256: hashFile(new URL('qualify.json', OUT)) },
      ensemble: { file: 'BL1-blind-predictions/out/ensemble.json', sha256: hashFile(new URL('ensemble.json', OUT)) },
      ensembleMeta: { file: 'BL1-blind-predictions/out/ensemble-meta.json', sha256: hashFile(new URL('ensemble-meta.json', OUT)) },
    },
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(TARGET, JSON.stringify(prediction, null, 2));

  const rows = flights.map((f) => {
    const interval = f.interval5to95AGL_m === null ? 'not qualified' : `${f.interval5to95AGL_m[0].toFixed(1)}-${f.interval5to95AGL_m[1].toFixed(1)} m`;
    const nominal = f.nominalApogeeAGL_m === null ? 'not qualified' : `${f.nominalApogeeAGL_m.toFixed(1)} m`;
    const drag = f.dragModel === null ? 'not flown' : 'legacy';
    return `| ${f.id} | ${f.motor} | ${drag} | ${nominal} | ${interval} | ${f.qualification === 'qualified' ? 'qualified' : 'not qualified (motor absent)'} |`;
  });
  writeFileSync(new URL('tables.md', OUT), rows.join('\n') + '\n');
  expect(flights.filter((f) => f.qualification === 'qualified').length).toBe(6);
});
