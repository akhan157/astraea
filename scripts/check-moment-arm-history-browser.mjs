// RMP10a bounded synthetic-only software journey. Real built UI/worker/WASM,
// production CSP. No empirical logs/holdouts, mocks, app-store hooks or numerical
// accuracy reserves. Three explicit UI flights: preset, invented motor variant,
// then identical saved preset inputs. Existing Workstation boot flights on each
// page load are separately observed/accounted, never hidden. Preview always closes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from 'playwright/test';
import { preview } from 'vite';
import JSZip from 'jszip';
import { stringifyReportJson } from '../src/formats/reportJson.ts';

const output=process.argv[2];assert.ok(output,'Supply NEW external evidence directory');
await mkdir(output,{recursive:false});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const expectedSha=sha(await readFile(new URL('../src/engine/astraea_engine.wasm',import.meta.url)));
assert.notEqual(expectedSha,'b971b222d7e3df8c10ff268a3a540effc847adc209b6e52b8d5a0b2b08898337','RMP10 requires intentionally changed WASM');
const headers=await readFile(new URL('../dist/_headers',import.meta.url),'utf8');
const csp=headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];assert.ok(csp);
const server=await preview({preview:{host:'127.0.0.1',port:0,open:false,headers:{'Content-Security-Policy':csp}}});
let browser,page;
const errors=[],deniedExternal=[],fetchedWasm=[],checks=[];
const artifact=(name,value)=>writeFile(join(output,name),stringifyReportJson(value)+'\n');
try{
  browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--renderer-process-limit=2','--num-raster-threads=2','--js-flags=--wasm-num-compilation-tasks=2']});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  const origin=server.resolvedUrls.local[0];
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin)||/^(blob:|data:)/.test(url))return route.continue();
    deniedExternal.push(url);return route.abort();
  });
  await context.addInitScript(()=>{
    Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});
    localStorage.setItem('astraea.workstation.toured','1');
    // Exercise supported browser-download fallback, not an unattended OS picker.
    Object.defineProperty(window,'showSaveFilePicker',{value:undefined});
    // PASS THROUGH ONLY: observe real messages, never substitute runtime or data.
    const observed=window.__rmp10={requests:[],replies:[],cspViolations:[],commandCounts:{}};
    document.addEventListener('securitypolicyviolation',e=>observed.cspViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));
    const original=Worker.prototype.postMessage,seen=new WeakSet();
    Worker.prototype.postMessage=function(message,...rest){
      if(!seen.has(this)){
        seen.add(this);const flightIds=new Set();
        this.addEventListener('message',e=>{
          const m=e.data;
          if(m?.type==='reply'&&flightIds.has(m.id))observed.replies.push({id:m.id,error:m.error??null,
            history:structuredClone(m.ok?.momentArmHistory),burnoutTime:m.ok?.burnoutTime,flightTime:m.ok?.flightDuration});
        });
        this.__rmp10FlightIds=flightIds;
      }
      if(message?.type==='call')observed.commandCounts[message.cmd]=(observed.commandCounts[message.cmd]??0)+1;
      if(message?.type==='call'&&message.cmd==='simulate_flight'){
        this.__rmp10FlightIds.add(message.id);observed.requests.push(structuredClone(message));
      }
      return Reflect.apply(original,this,[message,...rest]);
    };
  });
  page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(new URL(r.url()).pathname.endsWith('.wasm'))fetchedWasm.push(r.body().then(sha));});
  const response=await page.goto(new URL('app/',origin).href);assert.equal(response.status(),200);assert.ok(response.headers()['content-security-policy']);
  const stage=name=>page.getByRole('navigation',{name:'Pipeline stages'}).getByRole('button',{name,exact:true}).click();
  const menu=async name=>{await page.getByRole('button',{name:'Project menu',exact:true}).click();await page.getByRole('button',{name:new RegExp(`^${name}`)}).click();};
  const save=async()=>{
    const status=page.locator('[data-project-status]');const before=await status.count()?await status.first().textContent():null;
    await menu('Save to this browser');await expect(status).toContainText(/Saved locally \(revision \d+\)/);
    if(before)await expect(status).not.toHaveText(before);await page.keyboard.press('Escape');
  };
  const stored=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('astraea',1);r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('projects','readonly'),get=tx.objectStore('projects').get('astraea.project.v1');
      get.onsuccess=()=>resolve(JSON.parse(get.result));get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};
  }));
  const observed=()=>page.evaluate(()=>window.__rmp10);
  const noCalls=async n=>assert.equal((await observed()).requests.length,n,'Views/edits/imports must not run additional committed simulate_flight beyond separately counted startup; ordinary preview flight_summary remains distinct');
  const bootstrap=async()=>{
    // Pre-existing Workstation.tsx mount behavior, not a history-view rerun.
    await expect.poll(async()=>(await observed()).replies.length,{timeout:60000}).toBe(1);
    const state=await observed();assert.equal(state.requests.length,1);assert.equal(state.replies[0].error,null);
    assert.equal(state.requests[0].args.reportMomentArmHistory,true);assert.ok(state.replies[0].history);
  };
  const run=async n=>{
    const button=page.getByRole('banner').getByRole('button',{name:/Run simulation/});
    await button.click({timeout:60000});await expect(button).toBeEnabled({timeout:60000});
    await expect.poll(async()=>(await observed()).replies.length,{timeout:60000}).toBe(n);
    const state=await observed();assert.equal(state.requests.length,n);assert.equal(state.replies[n-1].error,null);
    assert.equal(state.requests[n-1].args.reportMomentArmHistory,true);
    assert.equal(Object.hasOwn(state.requests[n-1].args.options,'reportMomentArmHistory'),false);
    assert.ok(state.replies[n-1].history);return state.replies[n-1];
  };
  const validateCase=(entry,reply)=>{
    const h=entry.momentArmHistory;
    assert.equal(entry.inputs.version,2);assert.equal(entry.inputs.reportMomentArmHistory,true);
    assert.deepEqual(entry.engineIdentity,{kind:'production-rust-wasm',sha256:expectedSha});
    assert.equal(h.schemaId,'astraea-flight-moment-arm-history/1.0.0');
    assert.deepEqual(h,reply.history,'Archive must preserve exact actual worker result, not reconstructed geometry/telemetry');
    assert.equal(h.burnoutTimeS,entry.inputs.motorRecord.motor.burnTime);assert.equal(h.burnoutTimeS,reply.burnoutTime);
    assert.equal(h.sampleCount,h.points.length);assert.ok(h.sampleCount>2&&h.sampleCount<=5000);
    assert.equal(h.points[0].timeS,0);assert.equal(typeof reply.flightTime,'number','Observer must bind actual wire flightDuration');assert.ok(h.points.at(-1).timeS<=reply.flightTime);
    assert.equal(h.lastSampleToBurnoutS,h.burnoutTimeS-h.points.at(-1).timeS);
    assert.equal(h.exactBurnoutSampleExists,h.points.some(p=>p.timeS===h.burnoutTimeS));
    for(const [i,p]of h.points.entries()){
      assert.ok(p.timeS<=h.burnoutTimeS);if(i)assert.ok(p.timeS>h.points[i-1].timeS);
      if(p.normal){const v=p.normal;assert.equal(v.cpFromNoseM,v.jMPerRad/v.cPerRad);assert.equal(v.armM,v.cpFromNoseM-p.cgFromNoseM);assert.equal(v.cnaWeightedArmMPerRad,v.jMPerRad-v.cPerRad*p.cgFromNoseM);}
      else assert.equal(p.recovery,true);
    }
    assert.equal(h.maxGapS,Math.max(0,...h.points.slice(1).map((p,i)=>p.timeS-h.points[i].timeS)));
  };
  const currentTrace=async()=>{
    await stage('Build');return JSON.parse(await page.locator('pre').filter({hasText:'"astraeaTrace": 1'}).innerText());
  };
  const readout=async(h,stale=false)=>{
    await stage('Aero');await page.getByRole('tab',{name:'Flight model history',exact:true}).click();
    const panel=page.getByRole('region',{name:'Sampled flight-model history',exact:true});
    await expect(panel).toBeVisible();await expect(panel.getByRole('img')).toHaveCount(2);
    await expect(panel.locator('[data-history-sampling]')).toContainText(`${h.sampleCount} raw committed-macro samples`);
    if(stale)await expect(panel.getByRole('status')).toContainText('Stale result');
    await panel.getByRole('slider',{name:'Recorded history point'}).press('End');
    await expect(panel.locator('[data-history-selected-time]')).toHaveAttribute('data-history-selected-time',String(h.points.at(-1).timeS));
    const selected=h.points.at(-1);
    const value=label=>panel.locator('dt').filter({hasText:new RegExp(`^${label}$`)}).locator('..').locator('dd');
    await expect(value('CG from nose')).toHaveText(`${selected.cgFromNoseM.toPrecision(8)} m`);
    await expect(value('Normal CP from nose')).toHaveText(`${selected.normal.cpFromNoseM.toPrecision(8)} m`);
  };
  const importProject=async(name,project)=>{
    await stage('Mission');await page.getByLabel('Import file',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  };
  await bootstrap();
  await stage('Mission');await page.getByRole('button',{name:/^Estes Alpha III/}).click();await noCalls(1);
  const firstReply=await run(2);await save();const first=await stored(),baseline=first.cases.at(-1);
  assert.equal(first.schemaVersion,'1.8.0');validateCase(baseline,firstReply);
  await artifact('baseline-project.json',first);await readout(baseline.momentArmHistory);await noCalls(2);
  await page.screenshot({path:join(output,'baseline-history.png')});
  checks.push('Actual requested native result retained bit-for-bit through strict parser/archive, selected-point plots/readout and sampling disclosures');

  // Invented software fixture, explicitly NOT a measured/certified flight motor.
  const eng='; RMP10 software workflow fixture, NOT measured or qualified\nRMP10VAR 18 70 0 0.014 0.030 SoftwareOnly\n0 0\n0.05 19\n0.20 12\n1.00 6\n1.86 0\n';
  await writeFile(join(output,'software-only-variant.eng'),eng);
  await stage('Motor');await page.getByRole('button',{name:'Import .eng / .rse',exact:true}).click();
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({name:'software-only-variant.eng',mimeType:'text/plain',buffer:Buffer.from(eng)});
  await page.getByRole('button',{name:'Add to catalog',exact:true}).click();
  // Existing addMotor action registers AND selects the imported record.
  await expect(page.getByText('Motor in use',{exact:true}).locator('..')).toContainText('RMP10VAR');
  await expect(page.getByText('In use.',{exact:true})).toBeVisible();
  await readout(baseline.momentArmHistory,true);
  const staleTrace=await currentTrace();assert.equal(staleTrace.simulation.current,false);
  assert.deepEqual(staleTrace.simulation.momentArmHistory,baseline.momentArmHistory);assert.deepEqual(staleTrace.simulation.engineIdentity,baseline.engineIdentity);await noCalls(2);
  await artifact('stale-baseline-trace.json',staleTrace);
  const variantReply=await run(3);await save();const second=await stored(),variant=second.cases.at(-1);
  assert.equal(second.cases.length,first.cases.length+1);assert.deepEqual(second.cases.slice(0,first.cases.length),first.cases);validateCase(variant,variantReply);
  assert.notEqual(variant.inputs.motorRecord.motor.id,baseline.inputs.motorRecord.motor.id);
  assert.notEqual(variant.momentArmHistory.points[0].cgFromNoseM,baseline.momentArmHistory.points[0].cgFromNoseM);
  assert.notDeepEqual(variant.momentArmHistory,baseline.momentArmHistory);
  const variantTrace=await currentTrace();assert.equal(variantTrace.simulation.current,true);
  assert.deepEqual(variantTrace.simulation.momentArmHistory,variant.momentArmHistory);assert.deepEqual(variantTrace.simulation.engineIdentity,variant.engineIdentity);
  await artifact('variant-project.json',second);await artifact('variant-trace.json',variantTrace);
  await page.getByRole('radio',{name:'On',exact:true}).click();
  await page.locator('[data-format="project"]').getByRole('button',{name:'Review export',exact:true}).click();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Confirm export',exact:true}).click();
  const download=await downloading;assert.ok(download.suggestedFilename().endsWith('.zip'));
  const zipPath=join(output,'variant-export.zip');await download.saveAs(zipPath);
  const zip=await JSZip.loadAsync(await readFile(zipPath));
  const projectName=Object.keys(zip.files).find(name=>name.endsWith('.astraea.json'));
  const traceName=Object.keys(zip.files).find(name=>name.endsWith('.trace.json'));
  assert.ok(projectName&&traceName);
  const exported=JSON.parse(await zip.file(projectName).async('string')),exportedTrace=JSON.parse(await zip.file(traceName).async('string'));
  assert.deepEqual(exported.cases,second.cases);assert.deepEqual(exportedTrace.simulation.momentArmHistory,variant.momentArmHistory);
  assert.deepEqual(exportedTrace.simulation.engineIdentity,variant.engineIdentity);await noCalls(3);
  await artifact('downloaded-trace.json',exportedTrace);await artifact('before-reload-worker-observations.json',await observed());
  checks.push('Actual browser-downloaded project/trace ZIP retains exact history including signed zero and same invocation identity');
  checks.push('Meaningful motor/mass alternative; stale baseline retains original samples/identity and explicit variant run updates trace without rewriting baseline');

  await page.reload();await bootstrap();await menu('Open saved project');await expect(page.locator('[data-project-status]')).toContainText('Opened saved project');await page.keyboard.press('Escape');
  await stage('Build');const cards=page.locator('[data-saved-run-id]');assert.equal(await cards.count(),second.cases.length);
  const baselineCard=page.locator(`[data-saved-run-id="${baseline.id}"]`);
  await baselineCard.getByText('Recorded flight-model history',{exact:true}).click();
  await expect(baselineCard.locator('[data-moment-arm-history]')).toContainText('Historical record — not a fresh simulation.');
  await expect(baselineCard.getByRole('img')).toHaveCount(2);await noCalls(1);
  const bad=structuredClone(second);bad.vehicle.name='MUST NOT REPLACE';bad.cases.find(c=>c.id===baseline.id).momentArmHistory.schemaId='unknown-future-history';
  await artifact('corrupt-import-fixture.json',bad);await importProject('corrupt-history.astraea.json',bad);
  await expect(page.getByText(/Invalid project:.*momentArmHistory/).first()).toBeVisible();await noCalls(1);await save();
  const retained=await stored();assert.equal(retained.vehicle.name,second.vehicle.name);assert.deepEqual(retained.cases,second.cases);
  checks.push('Save/reload/Open restores historical plots without implicit rerun; unknown history import refuses before project/case replacement');

  // Deliberately manufactured OLD fixture. Do not strip fields in real migration.
  const old=structuredClone(second);old.schemaVersion='1.7.0';
  for(const c of old.cases){delete c.momentArmHistory;delete c.inputs.reportMomentArmHistory;}
  await artifact('manufactured-old-1.7-fixture.json',old);await importProject('manufactured-old-1.7.astraea.json',old);
  await expect(page.getByText('Imported manufactured-old-1.7.astraea.json',{exact:true})).toBeVisible();await save();
  const migrated=await stored();assert.equal(migrated.schemaVersion,'1.8.0');assert.deepEqual(migrated.cases,old.cases);
  await stage('Build');const oldCard=page.locator(`[data-saved-run-id="${baseline.id}"]`);await oldCard.getByText('Recorded flight-model history',{exact:true}).click();
  await expect(oldCard).toContainText('History unavailable — not recorded for this run.');await noCalls(1);
  await oldCard.getByRole('button',{name:'Load saved inputs',exact:true}).click();await noCalls(1);
  const replayReply=await run(2);await save();const final=await stored(),replayed=final.cases.at(-1);
  assert.deepEqual(final.cases.slice(0,old.cases.length),old.cases);validateCase(replayed,replayReply);
  assert.deepEqual(replayed.momentArmHistory,baseline.momentArmHistory,'Identical archived inputs produce same raw history on same executable');
  await artifact('final-project.json',final);await artifact('after-reload-worker-observations.json',await observed());
  checks.push('Genuine old-format absence remains unavailable; explicit saved-input rerun reproduces history on exact same engine, never backfills old cases');
  const hashes=await Promise.all(fetchedWasm);assert.ok(hashes.length);assert.ok(hashes.every(h=>h===expectedSha));
  const finalObserved=await observed();assert.deepEqual(finalObserved.cspViolations,[]);assert.deepEqual(errors,[]);assert.deepEqual(deniedExternal,[]);
  const metrics={status:'pass',scope:'Synthetic application/observer/persistence/runtime-byte integrity only; NOT physical accuracy, numerical reserve/convergence, native-WASM full parity, team/platform/release qualification',browser:browser.version(),wasmSha256:expectedSha,fetchedWasmSha256:hashes,schemaVersion:final.schemaVersion,observedCommand:'simulate_flight',explicitUiSimulateFlightCalls:3,existingBootstrapSimulateFlightCalls:2,totalSimulateFlightCalls:5,otherCommandsIncludeUncommittedPreview:true,initialPageCommandCounts:JSON.parse(await readFile(join(output,'before-reload-worker-observations.json'),'utf8')).commandCounts,reloadedPageCommandCounts:finalObserved.commandCounts,checks,baselineSamples:baseline.momentArmHistory.sampleCount,variantSamples:variant.momentArmHistory.sampleCount,baselineInitialCgM:baseline.momentArmHistory.points[0].cgFromNoseM,variantInitialCgM:variant.momentArmHistory.points[0].cgFromNoseM,runtimeErrors:errors,cspViolations:finalObserved.cspViolations,externalRequests:deniedExternal};
  await artifact('metrics.json',metrics);console.log(JSON.stringify(metrics,null,2));
}catch(error){
  await artifact('failure.json',{message:String(error),stack:error.stack,checks,runtimeErrors:errors,externalRequests:deniedExternal});
  if(page){
    await artifact('worker-observations-at-failure.json',await page.evaluate(()=>window.__rmp10)).catch(()=>{});
    await page.screenshot({path:join(output,'failure.png')}).catch(()=>{});
  }
  throw error;
}finally{
  await browser?.close();await new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));
}
