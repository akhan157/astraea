// Read-only ENG-D1 diagnostic. No production code or reference outcome changes.
// Source /workspace/astraea-plan/env.sh first; use the existing node_modules.
// node scripts/diagnostics/engine-cp-convergence.mjs cp|convergence [output.json]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';

const root = process.cwd();
const mode = process.argv[2];
assert(['cp', 'convergence'].includes(mode), 'Choose cp or convergence');
const outPath = resolve(process.argv[3] ?? `docs/internal/accuracy-program/diagnostics/2026-10-25-engine-${mode}.json`);
const hash = x => createHash('sha256').update(x).digest('hex');
// Baseline diagnostic: use the preserved pre-repair artifact after the kernel changes.
const wasmPath = process.env.ASTRAEA_DIAGNOSTIC_WASM ?? '/workspace/astraea/src/engine/astraea_engine.wasm';
const wasm = await readFile(wasmPath);
assert.equal(hash(wasm), 'e4ab1b9d207f791734108c6a85e480da3660603a66fdb97101f9ff033efe0985');
const sourcePaths = [
  'crates/astraea-core/src/aero.rs', 'crates/astraea-core/src/six_dof.rs',
  'crates/astraea-engine/src/models.rs', 'src/dynamics/loads.ts',
  'src/state/presets.ts', 'src/validation/development/benchmark.ts',
  'src/evidence/cosmicCargoFixture.ts', 'src/validation/miniDx3/miniDx3-vehicle.ts',
  'src/validation/miniDx3/motors.ts', 'pnpm-lock.yaml',
];
const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async p => [p, hash(await readFile(resolve(root, p)))])));
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
assert.equal(commit.status, 0);
const meta = { schema: 'astraea-engine-diagnostic-v1', sourceCommit: commit.stdout.trim(), wasm: { path: wasmPath, sha256: hash(wasm) }, sources };
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
let temp;
try {
  const load = p => server.ssrLoadModule(p);
  const [core, engineApi, bridge] = await Promise.all(['/src/engine/core.ts', '/src/engine/index.ts', '/src/tauri/bridge.ts'].map(load));
  const engine = await core.instantiateEngine(wasm);
  engineApi.setTestEngine(async (cmd, args) => engine.call(cmd, args));
  let result;
  if (mode === 'cp') {
    const [presets, loads, motors, atmosphere] = await Promise.all(['/src/state/presets.ts', '/src/dynamics/loads.ts', '/src/propulsion/motorDatabase.ts', '/src/sim/flightSimulator.ts'].map(load));
    // Execute verbatim checked-in Rust scalar source, with a minimal data carrier.
    // This is an exact-source reconstruction, NOT production in-flight telemetry.
    const rustSource = await readFile(resolve(root, 'crates/astraea-core/src/six_dof.rs'), 'utf8');
    const start = rustSource.indexOf('fn normal_slope_at_mach(');
    const end = rustSource.indexOf('\n\nstruct Refined', start);
    assert(start >= 0 && end > start, 'Expected source extraction boundaries');
    const extractedFunction = rustSource.slice(start, end);
    temp = await mkdtemp(join(root, '.eng-d1-'));
    const harness = `struct Vehicle { cna_body: f64, cna_fins: f64, cp_body: f64, cp_fins: f64 }\n${extractedFunction}\nfn main() { let s=std::env::args().nth(1).unwrap(); for line in s.lines() { let n:Vec<f64>=line.split_whitespace().map(|x|x.parse().unwrap()).collect(); let v=Vehicle{cna_body:n[1],cna_fins:n[2],cp_body:n[3],cp_fins:n[4]}; let (cna,cp)=normal_slope_at_mach(n[0],&v); println!("{:.17} {:.17}",cna,cp); } }\n`;
    await writeFile(join(temp, 'probe.rs'), harness);
    const compiled = spawnSync('rustc', ['--edition=2021', join(temp, 'probe.rs'), '-o', join(temp, 'probe')], { encoding: 'utf8', timeout: 15000 });
    assert.equal(compiled.status, 0, compiled.stderr);
    const nominal = presets.PRESET_NASA_STUDENT_LAUNCH;
    const boattail = { ...nominal, id: 'diagnostic-nsl-boattail', components: nominal.components.map(c => c.type === 'transition' ? { ...c, aftDiameter: .12 } : c.id === 'nsl-bt2' ? { ...c, outerDiameter: .12, innerDiameter: .113 } : c) };
    const machs = [0, .3, .8, 1, 1.1, 1.2, 1.4, 1.5, 2, 3, 4];
    const alphaDegs = [0, 1, 5, 10, 15];
    const motor = motors.CERTIFIED_MOTORS.aerotech_k550w;
    const vehicles = [];
    let maxOracleCpDifferenceM = 0, maxOracleCnaDifference = 0, maxMomentIdentityResidualNm = 0;
    for (const vehicle of [nominal, boattail]) {
      const stability = engine.call('stability', { vehicle });
      const curves = engine.call('aero_curves', { vehicle, motorBurning: false });
      const positive = stability.contributions.filter(c => c.cna > 0 && Number.isFinite(c.cna));
      const isFin = c => ['trapezoidfinset', 'ellipticalfinset', 'freeformfinset'].includes(c.type);
      const split = group => {
        const cna = group.reduce((s, c) => s + c.cna, 0);
        return { cna, cp: cna > 0 ? group.reduce((s, c) => s + c.cna * (c.cp ?? stability.cg), 0) / cna : stability.cg };
      };
      const body = split(positive.filter(c => !isFin(c))), fins = split(positive.filter(isFin));
      const input = machs.map(m => [m, body.cna, fins.cna, body.cp, fins.cp].join(' ')).join('\n');
      const native = spawnSync(join(temp, 'probe'), [input], { encoding: 'utf8', timeout: 5000 });
      assert.equal(native.status, 0, native.error?.message ?? native.stderr);
      const scalar = native.stdout.trim().split('\n').map(l => l.split(' ').map(Number));
      const pv = loads.prepareVehicle(vehicle, motor);
      const cfg = { vehicle, motor, launchAltitudeASL: 0, windSpeedSurface: 0, windAzimuthDeg: 0, finCantRad: 0 };
      const air = atmosphere.getAtmosphereAt(0);
      const rows = machs.map((mach, i) => {
        const [flightCna, flightCpM] = scalar[i];
        const curve = curves.dragCurves.find(c => Math.abs(c.mach - mach) < 1e-12);
        assert(curve, `Missing exact native Mach grid point ${mach}`);
        const cases = alphaDegs.map(alphaDeg => {
          const alpha = alphaDeg * Math.PI / 180, v = mach * air.speedOfSound;
          const st = { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: v * Math.cos(alpha), z: v * Math.sin(alpha) }, q: { w: 1, x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 } };
          const l = loads.computeFlightLoads(motor.burnTime + 1, st, { drogueDeployed: false, mainDeployed: false }, cfg, pv);
          maxOracleCpDifferenceM = Math.max(maxOracleCpDifferenceM, Math.abs(l.kinematics.cp - flightCpM));
          if (mach > 0) maxOracleCnaDifference = Math.max(maxOracleCnaDifference, Math.abs(l.kinematics.cna - flightCna));
          const normalN = l.kinematics.qInf * pv.refArea * flightCna * Math.sin(alpha);
          const lateralDragN = l.kinematics.dragAxial * Math.sin(alpha);
          const momentNm = (flightCpM - l.combinedCg) * (normalN + lateralDragN);
          maxMomentIdentityResidualNm = Math.max(maxMomentIdentityResidualNm, Math.abs(momentNm - l.momentB.x));
          return { alphaDeg, actualMach: l.kinematics.mach, combinedCgM: l.combinedCg, normalN, lateralDragN, sourceMomentNm: momentNm, tsOracleMomentNm: l.momentB.x, cpOnlySubstitutionMomentNm: (curve.cp - l.combinedCg) * (normalN + lateralDragN), validity: l.loadValidity };
        });
        return { mach, curveCpM: curve.cp, flightCpM, curveMinusFlightM: curve.cp - flightCpM, curveMinusFlightCal: (curve.cp - flightCpM) / stability.referenceDiameter, flightCna, cases };
      });
      vehicles.push({ id: vehicle.id, vehicle, dryStability: stability, flightPreparation: { body, fins, excludedNonpositiveContributions: stability.contributions.filter(c => c.cna !== null && c.cna <= 0) }, rows });
    }
    assert(maxOracleCpDifferenceM < 1e-12);
    assert(maxOracleCnaDifference < 1e-12);
    assert(maxMomentIdentityResidualNm < 1e-8);
    result = { ...meta, method: 'Production-WASM stability/curve outputs; exact extracted Rust normal_slope_at_mach over reconstructed positive-only flight-preparation inputs; separate TS load oracle at matched states.', extractedFunction: { sha256: hash(extractedFunction), text: extractedFunction }, conventions: { cpDatum: 'meters aft of nose', atmosphere: 'ISA sea level', recovery: false, railBound: false, motorTimeS: motor.burnTime + 1, attitude: 'identity, body +Y longitudinal', angularRatesRadS: [0, 0, 0], motorId: motor.id, note: 'Mach/AoA states are controlled local conditions, not a simulated attainable trajectory; curves expose no AoA argument. CP-only moment substitution holds flight slope/drag/CG fixed and is not a replacement model.' }, checks: { maxOracleCpDifferenceM, maxOracleCnaDifference, maxMomentIdentityResidualNm }, vehicles };
  } else {
    const [fixture, motors, mini, miniMotors] = await Promise.all(['/src/evidence/cosmicCargoFixture.ts', '/src/propulsion/motorDatabase.ts', '/src/validation/miniDx3/miniDx3-vehicle.ts', '/src/validation/miniDx3/motors.ts'].map(load));
    // Match existing benchmark reconstruction exactly; do not reread any outcomes.
    const elevation = 44330.77 * (1 - Math.pow(915.76 / 1013.25, .190263));
    const definitions = [
      { id: 'cosmic-cargo-2986', vehicle: { ...fixture.cosmicCargoLike(), launchSite: { altitudeM: fixture.COSMIC_CARGO_CONDITIONS.launchAltitudeASL } }, motor: motors.CERTIFIED_MOTORS.estes_c6, options: { ...fixture.COSMIC_CARGO_CONDITIONS } },
      { id: 'mini-dx3-g69n-2017-06-30', vehicle: { ...mini.miniDx3({ mass: .34471, cg: .508 }, miniMotors.G69N.id), launchSite: { altitudeM: elevation } }, motor: miniMotors.G69N, options: { launchAltitudeASL: elevation, railLength: 1.83, railElevationDeg: 88, railAzimuthDeg: 0, windSpeedSurface: 0, windAzimuthDeg: 0, mainDeployAltitudeAGL: 150 } },
    ];
    const cases = [];
    for (const c of definitions) {
      const rows = [];
      for (const timeStep of [.02, .01, .005]) {
        const t = performance.now();
        const r = await bridge.simulateFlight(c.vehicle, c.motor, { ...c.options, timeStep });
        rows.push({ timeStepS: timeStep, elapsedMs: performance.now() - t, apogeeM: r.apogeeAltitude, apogeeS: r.apogeeTime, burnoutM: r.burnoutAltitude, burnoutMs: r.burnoutVelocity, burnoutS: r.burnoutTime, railExitMs: r.railExitVelocity, maxMach: r.maxMach, terminated: r.terminated, terminationReason: r.terminationReason, validity: r.validity, enveloped: r.enveloped, offNominalExcursion: r.offNominalExcursion, telemetryCount: r.telemetry.length, events: r.events.map(e => ({ name: e.name, time: e.time })), runManifest: r.runManifest });
      }
      cases.push({ ...c, rows });
    }
    result = { ...meta, method: 'Six sequential production-WASM full flights; only macro timeStep changes, adaptive tolerances unchanged; no coefficient/input fitting or new source outcomes.', cases };
  }
  await writeFile(outPath, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ outPath, mode, checks: result.checks, summaries: result.vehicles?.map(v => ({ id: v.id, rows: v.rows.map(({ mach, curveCpM, flightCpM, curveMinusFlightCal }) => ({ mach, curveCpM, flightCpM, curveMinusFlightCal })) })) ?? result.cases?.map(c => ({ id: c.id, rows: c.rows.map(({ timeStepS, apogeeM, apogeeS, burnoutM, burnoutMs, railExitMs }) => ({ timeStepS, apogeeM, apogeeS, burnoutM, burnoutMs, railExitMs })) })) }, null, 2));
  engineApi.setTestEngine(null);
} finally {
  await server.close();
  if (temp) await rm(temp, { recursive: true, force: true });
}
