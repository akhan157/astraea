// BL1 round 2, step 3: extend the frozen prediction to all 12 flights.
//   ./node_modules/.bin/vitest run docs/internal/execution-runs/BL1-blind-predictions/03b-freeze.probe.ts --maxWorkers=2 --config docs/internal/execution-runs/BL1-blind-predictions/vitest.config.ts
//
// The six round-1 flight rows are copied verbatim from the committed
// PREDICTIONS.json and asserted unchanged; this probe never recomputes them.
import { readFileSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { DESIGNS, MOTOR_DIR, MOTOR_FILES, WASM_PATH, WASM_SHA256, loadMotor, sha256, type DownloadedMotor } from './probe-lib';

const OUT = new URL('./out/', import.meta.url);
const TARGET = new URL('./PREDICTIONS.json', import.meta.url);
const SOURCE_SHA = 'f7a893489c5c7063653beaa810b81c84a3b1dcba';
const ROUND1_COMMIT = 'bee73292ade53a0ff25c3a26ab355391381ea103';

interface Stats { n: number; p5: number; p50: number; p95: number; min: number; max: number; failed: number }
interface ExtraRow {
  design: string;
  motorKey: string;
  flights: string[];
  file: string;
  sha256: string;
  thrustcurveMotorId: string;
  dataSource: string;
  parsed: {
    designation: string;
    diameterM: number;
    lengthM: number;
    totalImpulseNs: number;
    burnTimeS: number;
    avgThrustN: number;
    maxThrustN: number;
    propellantMassKg: number;
    totalMassKg: number;
    dryMassKg: number;
    points: number;
  };
  designMatchesDownloadedGeometry: boolean;
  nominal: { apogeeAGL: number; maxMach: number; validity: string };
  axialDrag: string;
}
interface EnsembleSet { design: string; motorKey: string; flights: string[]; motorFile: string; motorSha256: string; dataSource: string; nRunsPerScenario: number; scenarios: number; totalRuns: number; seed: number; sigmas: unknown; product: Stats; qualified: Stats; perScenario: Array<Record<string, unknown>> }

const hashFile = (path: string | URL) => sha256(readFileSync(path));
const NEW_MOTORS: DownloadedMotor[] = ['d13w', 'questC6', 'i140w', 'j270w'];

it('extends the frozen predictions to all 12 flights', () => {
  expect(sha256(readFileSync(WASM_PATH))).toBe(WASM_SHA256);
  for (const d of Object.values(DESIGNS)) expect(hashFile(d.path)).toBe(d.sha256);
  const sums = readFileSync(`${MOTOR_DIR}/SHA256SUMS`, 'utf8');
  for (const spec of Object.values(MOTOR_FILES)) expect(sums).toContain(spec.sha256);

  const old = JSON.parse(readFileSync(TARGET, 'utf8')) as {
    flights: Array<Record<string, unknown>>;
    sets: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  expect(old.flights).toHaveLength(12);
  const oldSix = old.flights.slice(0, 6);
  expect(oldSix.map((f) => f.id)).toEqual(['V001-01', 'V001-02', 'V001-03', 'V001-04', 'V001-05', 'V001-06']);

  const qualifyExtra = JSON.parse(readFileSync(new URL('qualify-extra.json', OUT), 'utf8')) as { wasmSha256: string; rows: ExtraRow[] };
  const emerald = JSON.parse(readFileSync(new URL('ensemble-emerald-extra.json', OUT), 'utf8')) as { wasmSha256: string; sets: EnsembleSet[] };
  const vulcanite = JSON.parse(readFileSync(new URL('ensemble-vulcanite.json', OUT), 'utf8')) as { wasmSha256: string; sets: EnsembleSet[] };
  expect(qualifyExtra.wasmSha256).toBe(WASM_SHA256);
  expect(emerald.wasmSha256).toBe(WASM_SHA256);
  expect(vulcanite.wasmSha256).toBe(WASM_SHA256);

  const q = new Map(qualifyExtra.rows.map((row) => [row.motorKey as string, row]));
  const sets = new Map<string, EnsembleSet>([...emerald.sets, ...vulcanite.sets].map((s) => [s.motorKey, s]));

  const MOTOR_LABEL: Record<DownloadedMotor, { flightIds: string[]; motor: string; prefix: string }> = {
    d13w: { flightIds: ['V001-07'], motor: 'AeroTech D13-10W', prefix: '331cb649' },
    questC6: { flightIds: ['V001-08', 'V001-09', 'V001-10'], motor: 'Quest QC6-5', prefix: '9be8158f' },
    i140w: { flightIds: ['V002-01'], motor: 'AeroTech HP-I140W-14', prefix: '0d43f917' },
    j270w: { flightIds: ['V002-02'], motor: 'AeroTech HP-J270W-14', prefix: 'bf706a9e' },
  };

  const newRows: Array<Record<string, unknown>> = [];
  for (const key of NEW_MOTORS) {
    const row = q.get(key);
    const set = sets.get(key);
    if (row === undefined || set === undefined) throw new Error(`missing round-2 sources for ${key}`);
    const parsed = row.parsed;
    for (const [index, id] of MOTOR_LABEL[key].flightIds.entries()) {
      const motorSha = key === 'questC6'
        ? ['9be8158f', '11f0326a', '09e271ff'][index]
        : MOTOR_LABEL[key].prefix;
      newRows.push({
        id,
        design: row.design,
        flown: row.design === 'V001' ? '2017-03-09' : (key === 'i140w' ? '2023-02-11' : '2023-07-08'),
        motor: MOTOR_LABEL[key].motor,
        motorSha256Prefix: motorSha,
        motorInAppDatabase: false,
        motorFile: row.file,
        motorFileSha256: row.sha256,
        motorDataSource: row.dataSource,
        thrustcurveMotorId: row.thrustcurveMotorId,
        motorParsed: {
          designation: parsed.designation,
          diameterM: parsed.diameterM,
          lengthM: parsed.lengthM,
          totalImpulseNs: parsed.totalImpulseNs,
          burnTimeS: parsed.burnTimeS,
          maxThrustN: parsed.maxThrustN,
          propellantMassKg: parsed.propellantMassKg,
          totalMassKg: parsed.totalMassKg,
          dryMassKg: parsed.dryMassKg,
          curvePoints: parsed.points,
        },
        dragModel: 'legacy 25-station Mach drag tables (calibrated refuses freeform fins)',
        nominalApogeeAGL_m: row.nominal.apogeeAGL,
        interval5to95AGL_m: [set.qualified.p5, set.qualified.p95],
        productInterval5to95AGL_m: [set.product.p5, set.product.p95],
        productMedianAGL_m: set.product.p50,
        qualification: 'qualified',
        ...(key === 'i140w' ? { extraction: 'GPS-only: max GPS altitude above the pad median; vertical uncertainty unstated (spec 6.4)' } : {}),
        ...(key === 'questC6' ? { motorCurveNote: 'Quest_C6.eng is the C6-0 curve; used for QC6-5 because apogee is delay-independent in this engine' } : {}),
        reason: row.dataSource === 'cert'
          ? 'downloaded NAR cert curve, imported through parseRaspEng; legacy drag; declared-design reconstruction'
          : 'downloaded manufacturer curve (no cert file), imported through parseRaspEng; impulse bracket +/-10 % added to the qualified interval; legacy drag; declared-design reconstruction',
      });
    }
  }
  expect(newRows).toHaveLength(6);

  const flights = [...oldSix, ...newRows];

  // The six old rows must be byte-for-byte the committed values.
  for (let i = 0; i < 6; i += 1) {
    expect(JSON.stringify(flights[i])).toBe(JSON.stringify(oldSix[i]));
  }

  const motors = NEW_MOTORS.map((key) => {
    const row = q.get(key) as ExtraRow;
    const direct = loadMotor(key);
    expect(direct.sha256).toBe(row.sha256);
    expect(direct.motor.totalImpulse).toBe(row.parsed.totalImpulseNs);
    return {
      key,
      file: row.file,
      path: `${MOTOR_DIR}/${row.file}`,
      sha256: row.sha256,
      thrustcurveMotorId: row.thrustcurveMotorId,
      dataSource: row.dataSource,
      parsed: row.parsed,
      designGeometryMatches: row.designMatchesDownloadedGeometry,
      certified: row.dataSource === 'cert',
      impulseBracket: row.dataSource === 'mfr' ? 'base impulse +/-10 % as a declared scenario bracket on top of the app 5 % sigma; no published cert tolerance' : 'none (cert curve, app 5 % sigma)',
    };
  });

  const prediction = {
    ...old,
    lane: 'BL1-blind-predictions',
    round: 2,
    phase: 1,
    status: 'frozen_before_opening',
    opened: false,
    sourceSha: SOURCE_SHA,
    wasm: { path: 'src/engine/astraea_engine.wasm', sha256: WASM_SHA256, bytes: readFileSync(WASM_PATH).length },
    previouslyFrozen: {
      commit: ROUND1_COMMIT,
      unchangedFlights: ['V001-01', 'V001-02', 'V001-03', 'V001-04', 'V001-05', 'V001-06'],
      verification: 'rows copied verbatim from the committed PREDICTIONS.json and asserted JSON-identical; not recomputed, no error found',
    },
    flights,
    motors,
    motorAvailability: {
      bundled: ['Estes C6', 'AeroTech H128W', 'Cesaroni I205', 'AeroTech K550W', 'Cesaroni M1820'],
      suppliedForSealedFlights: NEW_MOTORS.map((key) => ({ key, file: MOTOR_FILES[key].file, sha256: MOTOR_FILES[key].sha256, source: MOTOR_FILES[key].source })),
      missingForSealedFlights: [],
      ownerAuthorization: '2026-11-16, stop (b) question: download 4 motor curves (ThrustCurve.org API, downloaded by the orchestrator)',
    },
    motorDir: { path: MOTOR_DIR, sha256sumsFile: 'SHA256SUMS', sha256sumsSha256: hashFile(`${MOTOR_DIR}/SHA256SUMS`), provenanceSha256: hashFile(`${MOTOR_DIR}/PROVENANCE.json`) },
    // The round-1 V001 set has no motorKey; the four round-2 sets are added fresh.
    // Filtering by both keeps the probe idempotent after a second run.
    sets: [
      ...old.sets.filter((s) => (s as { motorKey?: string }).motorKey === undefined && (s as { design?: string }).design === 'V001'),
      ...emerald.sets,
      ...vulcanite.sets,
    ],
    assumptions: [
      ...(old.assumptions as string[]),
      'Round 2 curves: four ThrustCurve.org RASP files supplied under the owner authorization, hashes asserted against the folder SHA256SUMS and parsed with the app parseRaspEng. D13W and Quest C6 are cert-sourced; I140W and J270W are manufacturer-sourced (no cert file).',
      'Manufacturer curves have no published tolerance: the qualified interval for I140W and J270W adds a declared base-impulse bracket of +/-10 % to the app 5 % sigma. The product interval is unchanged at the app settings. The bracket is an assumption, not measured, and is not tuned to any outcome.',
      'V002 drag: both Vulcanite flights fly the legacy 25-station tables, not the built-up model; the calibrated method refuses the freeform fin set (confirmed from runManifest.axialDrag). The set therefore does NOT exercise the new built-up drag.',
      'The six round-1 rows are unchanged from commit bee7329; no error was found in them.',
      'The design motor designations and downloaded files share the declared diameter/length; the ORK motor digests are not ThrustCurve ids, so the curve identity rests on designation plus geometry plus the ThrustCurve records in PROVENANCE.json.',
    ],
    evidence: {
      ...(old.evidence as Record<string, { file: string; sha256: string }>),
      qualifyExtra: { file: 'BL1-blind-predictions/out/qualify-extra.json', sha256: hashFile(new URL('qualify-extra.json', OUT)) },
      ensembleEmeraldExtra: { file: 'BL1-blind-predictions/out/ensemble-emerald-extra.json', sha256: hashFile(new URL('ensemble-emerald-extra.json', OUT)) },
      ensembleVulcanite: { file: 'BL1-blind-predictions/out/ensemble-vulcanite.json', sha256: hashFile(new URL('ensemble-vulcanite.json', OUT)) },
      motorSha256sums: { file: 'step4-blind/motors/SHA256SUMS', sha256: hashFile(`${MOTOR_DIR}/SHA256SUMS`) },
    },
  };

  writeFileSync(TARGET, JSON.stringify(prediction, null, 2));

  const rows = flights.map((f) => {
    const interval = (f.interval5to95AGL_m as number[] | null) === null
      ? 'not qualified'
      : `${(f.interval5to95AGL_m as number[])[0].toFixed(1)}-${(f.interval5to95AGL_m as number[])[1].toFixed(1)} m`;
    const nominal = f.nominalApogeeAGL_m === null ? 'not qualified' : `${(f.nominalApogeeAGL_m as number).toFixed(1)} m`;
    const source = f.motorDataSource === 'mfr' ? 'legacy / mfr' : f.motorDataSource === 'cert' ? 'legacy / cert' : 'legacy';
    return `| ${f.id} | ${f.motor} | ${source} | ${nominal} | ${interval} | qualified |`;
  });
  writeFileSync(new URL('tables-round2.md', OUT), rows.join('\n') + '\n');

  const mcRows = [...sets.values()].map((set) => {
    const label = set.motorKey === 'estes_c6' ? 'Estes C6' : set.motorKey;
    return `| ${label} | ${set.flights.join(', ')} | ${set.scenarios} | ${set.totalRuns} | ${set.product.p5.toFixed(1)} | ${set.product.p50.toFixed(1)} | ${set.product.p95.toFixed(1)} | ${set.qualified.p5.toFixed(1)} | ${set.qualified.p95.toFixed(1)} |`;
  });
  writeFileSync(new URL('mc-round2.md', OUT), mcRows.join('\n') + '\n');
  expect(flights).toHaveLength(12);
  expect(flights.filter((f) => f.qualification === 'qualified')).toHaveLength(12);
});
