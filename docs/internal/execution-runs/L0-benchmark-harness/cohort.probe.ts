import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import { instantiateEngine } from '../../../../src/engine/core';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
it('flies frozen cohort', async()=>{
 const mb=readFileSync('/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json');
 expect(hash(mb)).toBe('3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5');
 const wasmPath=process.env.L0_WASM || '/home/ak/astraea-evidence/goal-collegiate-accuracy/step0/wasm/build1.wasm';
 const wb=readFileSync(wasmPath); const wasmSha=hash(wb);
 expect(wasmSha).toBe(process.env.L0_WASM_SHA256 || 'bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff');
 const engine=await instantiateEngine(wb); const rows=[];
 for(const e of JSON.parse(mb.toString()).entries){
  const values:Record<string,number>={};
  for(const arm of ['A','B','C']) {
   const vehicle=structuredClone(e.vehicle); const options={...e.options};
   if(arm==='C') for(const c of vehicle.components) if(c.type==='nosecone') delete c.tipRadius;
   if(arm!=='A') options.flightDragSource='calibrated';
   if(arm==='B'){options.launchSiteTemperatureC=(e.launch_site.temperature_f-32)/1.8; if(e.vehicle.nozzleExitDiameter!=null) options.nozzleExitDiameter=e.vehicle.nozzleExitDiameter;}
   values[arm]=engine.call<any>('simulate_flight',{vehicle,motor:e.motor,options}).apogeeAltitude;
  }
  rows.push({slug:e.slug,...values});
 }
 mkdirSync('out/L0',{recursive:true});
 // Provenance travels with the rows so a candidate run cannot be read as the baseline.
 writeFileSync('out/L0/wasm.json',JSON.stringify({wasm_path:wasmPath,wasm_sha256:wasmSha,manifest_sha256:hash(mb),rows},null,2));
});
