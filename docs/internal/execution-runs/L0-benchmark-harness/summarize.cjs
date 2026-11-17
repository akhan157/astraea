const fs=require('fs');
const crypto=require('crypto');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const must=(ok,msg)=>{if(!ok){console.error('L0 summarize FAILED: '+msg);process.exit(1);}};
const read=p=>JSON.parse(fs.readFileSync(p));
const MANIFEST='/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json';
const NATIVE='/home/ak/astraea-evidence/goal-collegiate-accuracy/step0/cohort-native/cohort.json';
must(sha(MANIFEST)==='3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5','manifest hash');
must(sha(NATIVE)==='1fd734bd2f2bc2deb4c8569d0dd35e1c7418994d55b598eaa7ca08e8cdde0139','native baseline cohort.json hash');
const manifest=read(MANIFEST).entries;
const baseline=read(NATIVE).flights;
const wasmDoc=read('out/L0/wasm.json'), nativeC=read('out/L0/native-c.json');
must(wasmDoc.manifest_sha256==='3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5','wasm.json manifest provenance');
const wasm=wasmDoc.rows;
const groups={subsonic:'byrum calisp1 calisp2 calisp3 cancerdescending ezi65 gibb thunder-lightning',transonic:'blister calisp4 calisp5 iondrive rabia raven torrent',supersonic:'dontdebatethis full-metal-jacket kinsel l500roc proteus6'};
for(const k in groups) groups[k]=groups[k].split(' ');
const median=a=>{a.sort((x,y)=>x-y);let n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2};
const flights=manifest.map(e=>{let b=baseline.find(x=>x.slug===e.slug),w=wasm.find(x=>x.slug===e.slug),c=nativeC.find(x=>x.slug===e.slug); if(!b||!w||!c) throw Error(e.slug); return {slug:e.slug,airframe:e.airframe_group,measured:e.measured_altitude_m,native:{A:b.b0_apogee_agl_m,B:b.bundle_apogee_agl_m,C:c.apogee},wasm:{A:w.A,B:w.B,C:w.C},relative:Object.fromEntries(['A','B','C'].map(a=>[a,Math.abs((w[a]-(a==='C'?c.apogee:a==='A'?b.b0_apogee_agl_m:b.bundle_apogee_agl_m))/(a==='C'?c.apogee:a==='A'?b.b0_apogee_agl_m:b.bundle_apogee_agl_m))]))}});
let summaries={}; for(const source of ['native','wasm']) for(const arm of ['A','B','C']) {let by={}; for(const f of flights) (by[f.airframe]??=[]).push((f[source][arm]-f.measured)/f.measured*100); let med=Object.fromEntries(Object.entries(by).map(([k,v])=>[k,median(v)])); let result={airframes:med,qu8k:med.qu8k}; for(const [name,names] of Object.entries({...groups,all:Object.values(groups).flat()})){let vals=names.map(n=>{if(!(n in med)) throw Error(n); return med[n]}); result[name]={n:vals.length,mae:vals.reduce((a,b)=>a+Math.abs(b),0)/vals.length,within10:vals.filter(x=>Math.abs(x)<=10).length,bias:vals.reduce((a,b)=>a+b,0)/vals.length};} summaries[`${source}-${arm}`]=result; }
let max=Object.fromEntries(['A','B','C'].map(a=>[a,Math.max(...flights.map(f=>f.relative[a]))]));
// Invariants (spec §5 G-1, G-4): WASM vs native within 1e-12; native A/B reproduce the full-precision step-0 baseline to 1e-9 pp.
for(const a of ['A','B','C']) must(max[a]<=1e-12,`WASM-vs-native max relative difference ${a}=${max[a]} > 1e-12`);
const BASE=read(__dirname+'/../goal-collegiate-accuracy/STEP0-BASELINE.json').cohort.regime_table;
const MAP={subsonic:'subsonic_lt_0.8',transonic:'transonic_0.8_to_1.5',supersonic:'supersonic_ge_1.5',all:'all_primary_20'};
for(const a of ['A','B']) for(const [k,v] of Object.entries(MAP)){const got=summaries[`native-${a}`][k],want=BASE[v][a];
 must(Math.abs(got.mae-want.mae_pct)<=1e-9&&got.within10===want.within_10&&got.n===want.n,`G-4 ${a} ${k} does not reproduce STEP0-BASELINE`);}
fs.mkdirSync('out/L0',{recursive:true});
fs.writeFileSync('out/L0/summary.json',JSON.stringify({wasm_sha256:wasmDoc.wasm_sha256,wasm_path:wasmDoc.wasm_path,flights,max,summaries},null,2));
console.log(JSON.stringify({max,summaries},null,2));
