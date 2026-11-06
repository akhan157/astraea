// Verify retained raw hashes and emit a compact, raw-free research artifact.
// node scripts/diagnostics/accuracy-execution-summarize.mjs EVIDENCE OUTPUT_JSON
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
const [directory, destination] = process.argv.slice(2);
assert(directory && destination, 'EVIDENCE OUTPUT_JSON');
const dir = resolve(directory), sha = b => createHash('sha256').update(b).digest('hex');
const bytes = await readFile(join(dir,'results.json')), source = JSON.parse(bytes);
const completion = JSON.parse(await readFile(join(dir,'completion.json')));
assert.equal(completion.flightCalls,20); assert(completion.completed); assert.equal(source.runs.length,20);
assert.equal(new Set(source.runs.map(r=>`${r.caseId}:${r.experiment}`)).size,20);
const interpolate = (samples,t,key) => {
  for(let i=1;i<samples.length;i++) if(samples[i-1].timeS <= t && samples[i].timeS >= t) {
    const a=samples[i-1],b=samples[i];return a[key]+(b[key]-a[key])*(t-a.timeS)/(b.timeS-a.timeS);
  }
  return null;
};
const runs = [];
for(const row of source.runs) {
  const rawBytes = await readFile(join(dir,`${row.caseId}.${row.experiment}.raw.json`));
  assert.equal(sha(rawBytes),row.rawSha256,'Raw artifact changed');
  const raw = JSON.parse(rawBytes), baseline = source.runs.find(r=>r.caseId===row.caseId&&r.experiment==='baseline');
  assert.equal(row.unchangedInputSha256,baseline.inputSha256,'Unexpected unchanged-input identity');
  const output = { ...row, changedPaths: row.changedPaths.map(c=>c.path), wireChangedPaths: row.wireChangedPaths.map(c=>c.path) };
  if(raw.report) {
    const r=raw.report, residuals=r.trajectory.residuals, observedApogeeS=r.measurement.observedApogee.timeS;
    const ascent=residuals.filter(x=>x.timeS<=observedApogeeS);
    output.timingDiagnostic = {
      observedApogeeS, modeledApogeeS:raw.result.apogeeTime, apogeeDeltaS:raw.result.apogeeTime-observedApogeeS,
      altitudeResidualAtObservedApogeeM:interpolate(residuals,observedApogeeS,'residualM'),
      ascentToObservedApogeeRmseM:Math.sqrt(ascent.reduce((s,x)=>s+x.residualM**2,0)/ascent.length),
      ascentToObservedApogeeSamples:ascent.length,
      ...(r.measurement.observedBurnout ? {
        observedBurnoutS:r.measurement.observedBurnout.timeS,
        modeledBurnoutS:raw.result.burnoutTime,
        burnoutDeltaS:raw.result.burnoutTime-r.measurement.observedBurnout.timeS,
        observedCoastIntervalS:observedApogeeS-r.measurement.observedBurnout.timeS,
        modeledCoastIntervalS:raw.result.apogeeTime-raw.result.burnoutTime,
        coastIntervalDeltaS:(raw.result.apogeeTime-raw.result.burnoutTime)-(observedApogeeS-r.measurement.observedBurnout.timeS),
        altitudeResidualAtObservedBurnoutM:interpolate(residuals,r.measurement.observedBurnout.timeS,'residualM'),
      } : { poweredCoastStatus:'blocked: no source-qualified observed burnout; no inferred burnout from integrated velocity' }),
    };
  }
  runs.push(output);
}
const rankings = [...new Set(runs.filter(r=>r.synthetic).map(r=>r.caseId))].map(caseId=>({caseId,absoluteLocalDeltaRanking:Object.fromEntries(['apogeeM','apogeeTimeS','burnoutAltitudeM','burnoutSpeedMs','railExitTimeS','railExitSpeedMs'].map(metric=>[metric,runs.filter(r=>r.caseId===caseId&&r.synthetic).map(r=>({experiment:r.experiment,delta:r.delta[metric]})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))]))}));
const result={ schema:'accuracy-execution-summary-v1', evidenceDirectory:dir, originalResultsSha256:sha(bytes), provenance:source.provenance, harnessHistory:source.harnessHistory, callCount:20, resources:[JSON.parse(await readFile(join(dir,'resource.json'))),JSON.parse(await readFile(join(dir,'remaining14-resource.json')))], completion, runs, rankings };
await writeFile(resolve(destination),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({verifiedRawArtifacts:runs.length,output:resolve(destination),bytes:Buffer.byteLength(JSON.stringify(result,null,2)+'\n')}));
