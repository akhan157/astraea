// Bounded, synthetic local sensitivities on the four already exposed cases.
// node --expose-gc scripts/diagnostics/accuracy-execution.mjs prepare|run OUT [DATA]
// run requires --approved-initial-20. No kernel/solver/model-law substitutions.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';

const [mode, output, data = '/workspace/astraea-data'] = process.argv.slice(2);
assert(['prepare', 'run'].includes(mode) && output, 'prepare|run OUT [DATA] [--approved-initial-20]');
if (mode === 'run') assert(process.argv.includes('--approved-initial-20'), 'Explicit coordinator lease/20-call approval required');
const root = process.cwd(), out = resolve(output), dataRoot = resolve(data);
assert.equal(dataRoot, '/workspace/astraea-data', 'Only frozen development root is admitted');
const ids = ['cosmic-cargo-2986', 'mini-dx3-g69n-2017-06-30', 'top-shot-e12-2017-12-14', 'adventurer-j510w-2021-04-17'];
const engineSha256 = 'c1a1a177d56b73e4f5862d29098743e0bc31f51499d1c7534776b34ba2e8c4fe';
const sha = b => createHash('sha256').update(b).digest('hex');
const canonical = x => JSON.stringify(x, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const digest = x => sha(canonical(x));
const clone = x => JSON.parse(JSON.stringify(x));
const close = (a, b) => assert(Math.abs(a - b) < 1e-10 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
const json = async (path, x) => { const bytes = JSON.stringify(x, null, 2) + '\n'; await writeFile(path, bytes); return sha(bytes); };
const changes = (a, b, path = '') => {
  if (canonical(a) === canonical(b)) return [];
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return [{ path, before: a ?? null, after: b ?? null }];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => changes(a[k], b[k], path ? `${path}.${k}` : k));
};
const curveImpulse = m => m.thrustCurve.slice(1).reduce((s, p, i) => s + (p.time - m.thrustCurve[i].time) * (p.thrust + m.thrustCurve[i].thrust) / 2, 0);
const sources = ['src/validation/development/benchmark.ts', 'src/tauri/bridge.ts', 'src/validation/miniDx3/motors.ts', 'src/evidence/cosmicCargoFixture.ts', 'src/propulsion/motorDatabase.ts', 'crates/astraea-engine/src/models.rs', 'crates/astraea-core/src/six_dof.rs', 'scripts/diagnostics/accuracy-execution.mjs'];
await mkdir(out, { recursive: true });
let captured;
const anchor = 'try { result = await simulateFlight(input.vehicle, input.motor, input.options); }';
globalThis.__accuracyExecutionCapture = (id, input, result, wire) => { captured = { id, input: clone(input), result, wire }; };
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', plugins: [{
  name: 'accuracy-execution-production-capture', enforce: 'pre', transform(source, id) {
    if (id !== resolve(root, 'src/validation/development/benchmark.ts')) return;
    assert.equal(source.split(anchor).length, 2, 'Production call capture anchor changed');
    return source.replace(anchor, 'try { let wire; setTestEngine((async (cmd,args) => { if(cmd === "simulate_flight") wire = args; return engine.call(cmd,args); }) as EngineInvoke); result = await simulateFlight(input.vehicle, input.motor, input.options); globalThis.__accuracyExecutionCapture(spec.id,input,result,wire); }');
  },
}] });
try {
  const api = await server.ssrLoadModule('/src/validation/development/benchmark.ts');
  const specs = ids.map(id => api.DEVELOPMENT_CASES.find(s => s.id === id));
  assert(specs.every(s => s?.role === 'development'));
  const provenance = { schema: 'accuracy-execution-v1', engineSha256, sourceSha256: Object.fromEntries(await Promise.all(sources.map(async p => [p, sha(await readFile(join(root, p)))]))), externalInputs: [] };
  // Enumerate declared development paths only; never glob the external root.
  for (const spec of specs) for (const s of [{ path: spec.path, sha256: spec.expectedSourceSha256 }, spec.modelSource, spec.motorSource].filter(Boolean)) {
    const bytes = await readFile(join(dataRoot, s.path));
    assert.equal(sha(bytes), s.sha256, `Frozen input mismatch: ${s.path}`);
    provenance.externalInputs.push({ path: s.path, sha256: s.sha256, bytes: bytes.length });
  }
  assert.equal(provenance.externalInputs.length, 8);
  const liveWasm = await readFile('/workspace/astraea/src/engine/astraea_engine.wasm');
  assert.equal(sha(liveWasm), engineSha256, 'Current WASM identity changed; reapprove experiment');
  const wasmPath = join(out, 'frozen.wasm');
  if (mode === 'prepare') {
    await writeFile(wasmPath, liveWasm, { flag: 'wx' });
    await json(join(out, 'provenance.json'), provenance);
    await json(join(out, 'plan.json'), { calls: 20, baselines: ids, macroStepsS: [0.005, 0.0025], sensitivityCases: ids.slice(0, 2), syntheticPerturbations: ['dry-mass-plus-1pct', 'impulse-plus-1pct', 'airframe-cd-plus-1pct', 'duration-plus-1pct-fixed-impulse'], scientificChanges: false });
    console.log(JSON.stringify({ prepared: out, engineSha256, inputs: 8, flightCalls: 0 }));
  } else {
    assert.equal(sha(await readFile(wasmPath)), engineSha256);
    const preparedProvenance = JSON.parse(await readFile(join(out, 'provenance.json')));
    const oldPhysics = clone(preparedProvenance), newPhysics = clone(provenance);
    delete oldPhysics.sourceSha256['scripts/diagnostics/accuracy-execution.mjs'];
    delete newPhysics.sourceSha256['scripts/diagnostics/accuracy-execution.mjs'];
    assert.deepEqual(oldPhysics, newPhysics, 'Prepared physics/source provenance changed');
    const resume = process.argv.includes('--resume-completed');
    if (!resume) assert.deepEqual(preparedProvenance, provenance, 'Prepared harness changed; prepare a new batch');
    const [{ instantiateEngine }, { setTestEngine }, bridge, mass, loads, motors] = await Promise.all([
      '/src/engine/core.ts', '/src/engine/index.ts', '/src/tauri/bridge.ts', '/src/core/mass.ts', '/src/dynamics/loads.ts', '/src/propulsion/motorDatabase.ts',
    ].map(p => server.ssrLoadModule(p)));
    const wasm = await readFile(wasmPath), previous = resume ? JSON.parse(await readFile(join(out,'results.json'))) : null;
    const rows = previous?.runs ?? [], baselines = new Map();
    let flightCalls = previous?.flightCalls ?? 0;
    const harnessHistory = [...(previous?.harnessHistory ?? [preparedProvenance]), provenance].filter((p,i,a) => a.findIndex(q => digest(q) === digest(p)) === i);
    const metrics = r => ({ apogeeM: r.apogeeAltitude, apogeeTimeS: r.apogeeTime, burnoutAltitudeM: r.burnoutAltitude, burnoutSpeedMs: r.burnoutVelocity, burnoutTimeS: r.burnoutTime, railExitSpeedMs: r.railExitVelocity, railExitTimeS: r.events.find(e => e.name === 'Launch Rail Departure')?.time ?? null, maxMach: r.maxMach });
    const validity = r => ({ terminationReason: r.terminationReason, validity: r.validity, offNominalExcursion: r.offNominalExcursion, unsupportedHandling: r.unsupportedHandling });
    const record = async (spec, name, input, result, wire, reference, report) => {
      const rawSha256 = await json(join(out, `${spec.id}.${name}.raw.json`), { input, wire, result, ...(report ? { report } : {}) });
      const aggregate = mass.aggregateVehicleMass(input.vehicle);
      motors.validateMotorSpec(input.motor);
      const p = loads.prepareVehicle(input.vehicle, input.motor);
      const changedPaths = reference ? changes(reference.input, input) : [];
      const wireChangedPaths = reference ? changes(reference.wire, wire) : [];
      const allowed = name.startsWith('macro-') ? /^options\.timeStep$/ : name === 'dry-mass-plus-1pct' ? /^vehicle\.components\.\d+\.(massOverride|mass|cgOverride)$/ : name === 'impulse-plus-1pct' ? /^motor\.(totalImpulse|avgThrust|maxThrust|thrustCurve\.\d+\.thrust)$/ : name === 'airframe-cd-plus-1pct' ? /^options\.dragCdScale$/ : /^motor\.(burnTime|avgThrust|maxThrust|thrustCurve\.\d+\.(time|thrust))$/;
      assert(changedPaths.every(c => allowed.test(c.path)), `Unexpected change: ${JSON.stringify(changedPaths)}`);
      assert(wireChangedPaths.every(c => allowed.test(c.path)), `Unexpected production DTO change: ${JSON.stringify(wireChangedPaths)}`);
      const unchanged = clone(input), original = reference?.input;
      if (original) for (const c of changedPaths) {
        const path = c.path.split('.'); let x = unchanged, old = original;
        for (const key of path.slice(0, -1)) { x = x[key]; old = old[key]; }
        const key = path.at(-1); if (Object.hasOwn(old, key)) x[key] = old[key]; else delete x[key];
      }
      if (original) assert.equal(digest(unchanged), digest(original), 'Untouched input changed');
      const row = { caseId: spec.id, experiment: name, synthetic: name.includes('pct'), inputSha256: digest(input), wireSha256: digest(wire), unchangedInputSha256: digest(unchanged), rawSha256, changedPaths, wireChangedPaths, inputSummary: { dryMassKg: aggregate.totalMass, liftoffMassKg: aggregate.totalMass + input.motor.totalMass, dryCgM: aggregate.cg, dryCylinderInertiaKgM2: [p.Ixx_dry, p.Iyy_dry, p.Iyy_dry], motorImpulseMetadataNs: input.motor.totalImpulse, integratedImpulseNs: curveImpulse(input.motor), motorBurnTimeS: input.motor.burnTime }, metrics: metrics(result), validity: validity(result), delta: reference ? Object.fromEntries(Object.entries(metrics(result)).map(([k,v]) => [k, v === null || reference.metrics[k] === null ? null : v - reference.metrics[k]])) : null, ...(report ? { observed: report.metrics, sourceQualification: report.qualification, measurement: report.measurement, assumptions: report.assumptions, trajectoryPhases: report.trajectory.phases } : {}) };
      rows.push(row);
      await json(join(out, 'results.json'), { provenance, harnessHistory, flightCalls, runs: rows });
      console.log(JSON.stringify({ flightCalls, caseId: spec.id, experiment: name, metrics: row.metrics, delta: row.delta, validity: row.validity }));
      return row;
    };
    for (const spec of specs) {
      const completed = rows.find(r => r.caseId === spec.id && r.experiment === 'baseline');
      if (completed) {
        const bytes = await readFile(join(out,`${spec.id}.baseline.raw.json`));
        assert.equal(sha(bytes),completed.rawSha256);
        const saved = JSON.parse(bytes); assert.equal(digest(saved.input),completed.inputSha256); assert.equal(digest(saved.wire),completed.wireSha256);
        baselines.set(spec.id,{...completed,input:saved.input,wire:saved.wire}); continue;
      }
      captured = null; flightCalls++;
      const report = await api.runDevelopmentCase(dataRoot, spec, wasm, engineSha256);
      assert(captured?.id === spec.id);
      const { input, result, wire } = captured;
      const prior = JSON.parse(await readFile(`/workspace/astraea-plan/evidence/2026-10-25/final-replay/${spec.id}.flight.json`));
      assert.equal(digest(input), digest(prior.input), 'Current baseline input differs from prior frozen replay');
      // Numerically identical full-flight metrics are expected despite binary metadata changes.
      assert.deepEqual(metrics(result), metrics(prior.coarse), 'Baseline reproduction differs; stop before perturbations');
      const row = await record(spec, 'baseline', input, result, wire, null, report);
      baselines.set(spec.id, { ...row, input, wire });
      captured = null; globalThis.gc?.();
    }
    for (const spec of specs) {
      const baseline = baselines.get(spec.id);
      const experiments = [0.005, 0.0025].map(dt => [`macro-${dt}`, input => { input.options.timeStep = dt; }]);
      if (ids.slice(0,2).includes(spec.id)) experiments.push(
        ['dry-mass-plus-1pct', input => {
          const before = mass.aggregateVehicleMass(input.vehicle);
          input.vehicle.components.forEach((c,i) => { const p = before.components[i]; if (['masscomponent','parachute'].includes(c.type)) c.mass = p.mass * 1.01; else { c.massOverride = p.mass * 1.01; c.cgOverride = p.localCG; } });
          const after = mass.aggregateVehicleMass(input.vehicle); close(after.totalMass, before.totalMass * 1.01); close(after.cg, before.cg);
          after.components.forEach((p,i) => { close(p.mass, before.components[i].mass * 1.01); close(p.globalCG, before.components[i].globalCG); });
          const a = loads.prepareVehicle(input.vehicle,input.motor), b = loads.prepareVehicle(baseline.input.vehicle,baseline.input.motor);
          close(a.Ixx_dry,b.Ixx_dry*1.01); close(a.Iyy_dry,b.Iyy_dry*1.01);
          // Curve DTO carries a CG-derived display margin: uniform scaling can
          // move that by one ulp. All physical coefficient fields stay exact.
          for (const key of ['aeroPowered','aeroCoasting']) {
            const differences = changes(a[key],b[key]);
            assert(differences.every(d => /^dragCurves\.\d+\.staticMarginCalibers$/.test(d.path)));
            differences.forEach(d => close(d.before,d.after));
          }
        }],
        ['impulse-plus-1pct', input => { for (const p of input.motor.thrustCurve) p.thrust *= 1.01; for (const k of ['totalImpulse','avgThrust','maxThrust']) input.motor[k] *= 1.01; close(curveImpulse(input.motor), curveImpulse(baseline.input.motor)*1.01); }],
        ['airframe-cd-plus-1pct', input => { input.options.dragCdScale = 1.01; }],
        ['duration-plus-1pct-fixed-impulse', input => { for (const p of input.motor.thrustCurve) { p.time *= 1.01; p.thrust /= 1.01; } input.motor.burnTime *= 1.01; input.motor.avgThrust /= 1.01; input.motor.maxThrust /= 1.01; close(curveImpulse(input.motor),curveImpulse(baseline.input.motor)); }],
      );
      for (const [name, mutate] of experiments) {
        const completed = rows.find(r => r.caseId === spec.id && r.experiment === name);
        if (completed) { assert.equal(sha(await readFile(join(out,`${spec.id}.${name}.raw.json`))),completed.rawSha256); continue; }
        const input = clone(baseline.input); mutate(input); motors.validateMotorSpec(input.motor);
        let wire; const engine = await instantiateEngine(wasm);
        setTestEngine(async (cmd,args) => { if (cmd === 'simulate_flight') { assert(++flightCalls <= 20); wire = clone(args); } return engine.call(cmd,args); });
        let result;
        try { result = await bridge.simulateFlight(input.vehicle,input.motor,input.options); } finally { setTestEngine(null); }
        assert.equal(result.terminationReason,'touchdown');
        await record(spec,name,input,result,wire,baseline);
        result = null; globalThis.gc?.();
      }
    }
    assert.equal(flightCalls,20);
    await json(join(out,'completion.json'),{flightCalls,completed:true,maxRssKiB:process.resourceUsage().maxRSS,engineSha256});
  }
} finally { await server.close(); delete globalThis.__accuracyExecutionCapture; }
