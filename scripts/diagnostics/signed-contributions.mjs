// Reproducible frozen-development/native-local-load evidence for ENG-D1 repair.
// prepare <evidence-dir> | replay <wasm> <out-dir> [data-root] | summarize <evidence-dir>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { spawnSync } from 'node:child_process';

const root = process.cwd(), mode = process.argv[2];
const hash = b => createHash('sha256').update(b).digest('hex');
const captured = new Map();
if (mode === 'summarize') {
  const dir = resolve(process.argv[3]);
  const cases = [];
  for (const id of ['cosmic-cargo-2986', 'mini-dx3-g69n-2017-06-30', 'top-shot-e12-2017-12-14', 'adventurer-j510w-2021-04-17']) {
    const a = JSON.parse(await readFile(join(dir, 'before', `${id}.json`)));
    const b = JSON.parse(await readFile(join(dir, 'after', `${id}.json`)));
    cases.push({ id, before: a.metrics, after: b.metrics, apogeeDeltaM: b.metrics.simulatedApogee.value - a.metrics.simulatedApogee.value,
      sourceSha256: a.source.sha256, sameRawSource: a.source.sha256 === b.source.sha256,
      beforeEngine: a.engine, afterEngine: b.engine });
  }
  console.log(JSON.stringify(cases, null, 2));
} else {
  assert(['prepare', 'replay', 'native-check'].includes(mode), 'Choose prepare, replay, native-check, or summarize');
  // Observation-only instrumentation of the existing benchmark caller: execute
  // the identical production simulateFlight call, then retain its returned DTO.
  // This avoids reimplementing private modelInputs or running a second flight.
  // The transform fails closed if its exact source anchor changes.
  const anchor = 'try { result = await simulateFlight(input.vehicle, input.motor, input.options); }';
  globalThis.__astraeaSignedCapture = (id,input,result,stability) => {
    const {telemetry,...coarse} = result;
    captured.set(id,{input,coarse,stability});
  };
  const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error',
    plugins:[{name:'capture-signed-diagnostic',enforce:'pre',transform(source,id) {
      if(id !== resolve(root,'src/validation/development/benchmark.ts')) return;
      assert.equal(source.split(anchor).length,2,'Benchmark capture anchor changed');
      return source.replace(anchor,'try { result = await simulateFlight(input.vehicle, input.motor, input.options); globalThis.__astraeaSignedCapture(spec.id,input,result,engine.call("stability",{vehicle:input.vehicle})); }');
    }}] });
  try {
    if (mode === 'prepare') {
      const dir = resolve(process.argv[3]);
      await mkdir(dir, { recursive: true });
      const baseline = await readFile('/workspace/astraea/src/engine/astraea_engine.wasm');
      assert.equal(hash(baseline), 'e4ab1b9d207f791734108c6a85e480da3660603a66fdb97101f9ff033efe0985');
      try { await writeFile(join(dir, 'before.wasm'), baseline, { flag: 'wx' }); }
      catch (e) { if (e.code !== 'EEXIST') throw e; assert.equal(hash(await readFile(join(dir, 'before.wasm'))), hash(baseline)); }
      const [motors, atmosphere] = await Promise.all(['/src/propulsion/motorDatabase.ts', '/src/sim/flightSimulator.ts'].map(p => server.ssrLoadModule(p)));
      const cp = JSON.parse(await readFile(resolve(root, 'docs/internal/accuracy-program/diagnostics/2026-10-25-engine-cp.json')));
      const motor = motors.CERTIFIED_MOTORS.aerotech_k550w;
      const speedOfSound = atmosphere.getAtmosphereAt(0).speedOfSound;
      for (const fixture of cp.vehicles) {
        const samples = [];
        for (const mach of [0, .3, .8, 1.4, 2, 4]) for (const alphaDeg of [-5, 0, 5]) for (const plane of ['pitch', 'yaw']) {
          const alpha = alphaDeg * Math.PI / 180, speed = mach * speedOfSound;
          samples.push({ state: { r: {x:0,y:0,z:0}, v: {x:plane==='yaw'?speed*Math.sin(alpha):0,y:speed*Math.cos(alpha),z:plane==='pitch'?speed*Math.sin(alpha):0}, q:{w:1,x:0,y:0,z:0}, w:{x:0,y:0,z:0} },
            time: motor.burnTime + 1, options: {launchAltitudeASL:0,windSpeedSurface:0,windAzimuthDeg:0,finCantAngleDeg:0}, diagnosticLabels:{mach,alphaDeg,plane} });
        }
        await writeFile(join(dir, `${fixture.id}.input.json`), JSON.stringify({ vehicle: fixture.vehicle, motor, samples }, null, 2)+'\n');
      }
      console.log(JSON.stringify({dir,beforeWasmSha256:hash(baseline),nativeFixtures:cp.vehicles.map(v=>v.id)}));
    } else if (mode === 'native-check') {
      const dir = resolve(process.argv[3]), exe = resolve(process.argv[4]);
      await mkdir(join(dir,'after'),{recursive:true});
      const loads = await server.ssrLoadModule('/src/dynamics/loads.ts');
      const checks = [];
      for (const id of ['preset-nasa-sl', 'diagnostic-nsl-boattail']) {
        const inputPath = join(dir, `${id}.input.json`), input = JSON.parse(await readFile(inputPath));
        const process = spawnSync(exe, [inputPath], { encoding:'utf8',timeout:20000 });
        assert.equal(process.status,0,process.stderr);
        const native = JSON.parse(process.stdout);
        await writeFile(join(dir,'after',`${id}.native.json`),process.stdout);
        const pv = loads.prepareVehicle(input.vehicle,input.motor);
        let cpDifferenceM=0,cnaDifference=0,forceDifferenceN=0,momentDifferenceNm=0;
        for (let i=0;i<input.samples.length;i++) {
          const s=input.samples[i],d=native.samples[i];
          assert(!d.error,d.error);
          assert.equal(d.powered,s.time<input.motor.burnTime,'Native/oracle powered phase differs');
          assert.equal(d.recovery,false);assert.equal(d.railBound,false);
          const l=loads.computeFlightLoads(s.time,s.state,{drogueDeployed:false,mainDeployed:false},
            {vehicle:input.vehicle,motor:input.motor,launchAltitudeASL:0,windSpeedSurface:0,windAzimuthDeg:0,finCantRad:0},pv);
          cpDifferenceM=Math.max(cpDifferenceM,Math.abs(l.kinematics.cp-d.cpM));
          if(d.mach>0)cnaDifference=Math.max(cnaDifference,Math.abs(l.kinematics.cna-d.cna));
          // Controlled states have identity attitude. Remove the actual RHS's
          // axial thrust and CG gravity to recover all three aero-force axes.
          forceDifferenceN=Math.max(forceDifferenceN,Math.abs(l.forceN.x-d.aeroForceBodyN.x),
            Math.abs(l.forceN.y-l.kinematics.thrust-d.aeroForceBodyN.y),Math.abs(l.forceN.z+l.mass*9.80665-d.aeroForceBodyN.z));
          for(const axis of ['x','y','z'])momentDifferenceNm=Math.max(momentDifferenceNm,Math.abs(l.momentB[axis]-d.totalMomentBodyNm[axis]));
        }
        assert(cpDifferenceM<1e-12);assert(cnaDifference<1e-12);assert(forceDifferenceN<1e-8);assert(momentDifferenceNm<1e-8);
        checks.push({id,samples:input.samples.length,cpDifferenceM,cnaDifference,forceDifferenceN,momentDifferenceNm});
      }
      await writeFile(join(dir,'native-parity.json'),JSON.stringify(checks,null,2)+'\n');
      console.log(JSON.stringify(checks,null,2));
    } else {
      const wasm = await readFile(resolve(process.argv[3])), engineSha = hash(wasm), outDir = resolve(process.argv[4]);
      await mkdir(outDir, { recursive: true });
      const api = await server.ssrLoadModule('/src/validation/development/benchmark.ts');
      const cases = api.DEVELOPMENT_CASES.filter(c => c.role === 'development');
      assert.equal(cases.length, 4);
      const manifest = [];
      for (const spec of cases) {
        const r = await api.runDevelopmentCase(resolve(process.argv[5] ?? '/workspace/astraea-data'), spec, wasm, engineSha);
        const bytes = JSON.stringify(r, null, 2)+'\n';
        await writeFile(join(outDir, `${spec.id}.json`), bytes);
        assert(captured.has(spec.id),'Production flight DTO was not captured');
        const capturedRun=captured.get(spec.id);
        await writeFile(join(outDir, `${spec.id}.flight.json`),JSON.stringify(capturedRun,null,2)+'\n');
        manifest.push({caseId:spec.id,sha256:hash(bytes),engineSha256:engineSha,metrics:r.metrics,model:r.model,qualification:r.qualification});
      }
      await writeFile(join(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
      console.log(JSON.stringify(manifest.map(m=>({caseId:m.caseId,metrics:m.metrics})),null,2));
    }
  } finally { await server.close(); delete globalThis.__astraeaSignedCapture; }
}
