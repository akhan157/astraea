import { beforeEach, describe, expect, it } from 'vitest';
import { parseMomentArmHistory } from './momentArmHistory';
import { momentArmHistoryFixture } from './momentArmHistory.fixture';
import { captureRunInputs, type LegacyRunInputs } from './runInputs';
import { readProject, writeProject, type ProjectEnvelope } from '../formats/projectJson';
import { exportableProject, useProjectStore } from '../state/project';
import { useAnalysisStore } from '../state/analysis';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { withRunCases } from './runCases';
import { compareRunInputs } from './runComparison';
import { toFlightRun } from '../console/data/adapter';
import { flightResultForRequest } from '../console/testFixtures';

let project: ProjectEnvelope;
beforeEach(() => {
  useProjectStore.getState().loadPreset('estesAlpha'); useAnalysisStore.getState().reset();
  project = structuredClone(exportableProject());
});
function archived(): any {
  const raw = JSON.parse(writeProject(project));
  const motorRecord = {id:'estes_c6',motor:structuredClone(CERTIFIED_MOTORS.estes_c6),provenance:{source:'certified' as const}};
  const inputs: any = structuredClone(captureRunInputs(project,motorRecord,'original-input-key',undefined));
  inputs.reportMomentArmHistory = true;
  raw.motorRecords = raw.motorRecords.filter((r: {id:string}) => r.id !== motorRecord.id);
  raw.motorRecords.push(motorRecord);
  raw.cases = [{id:'history-case',kind:'flight',createdAt:'2026-10-27T10:00:00.000Z',motorRecordId:motorRecord.id,
    inputs,engineIdentity:{kind:'production-rust-wasm',sha256:'b'.repeat(64)},
    summary:{inputKey:inputs.inputKey,flightTimeS:10},momentArmHistory:momentArmHistoryFixture(motorRecord.motor.burnTime)}];
  return raw;
}

describe('strict sampled moment-arm history', () => {
  it('retains raw unrounded values in an independent frozen copy', () => {
    const raw=momentArmHistoryFixture(); const parsed=parseMomentArmHistory(raw);
    expect(parsed).toEqual(raw); expect(parsed).not.toBe(raw);
    expect(parsed.points[1].incidenceDeg).toBe(12.3456789);
    expect(Object.isFrozen(parsed.points[1].normal)).toBe(true);
    raw.points[1].cgFromNoseM=.8; expect(parsed.points[1].cgFromNoseM).toBe(.3);
  });
  it.each([
    (h:any)=>{h.schemaId='future';}, (h:any)=>{h.extra='unknown';},
    (h:any)=>{h.points[0].incidenceDeg=NaN;}, (h:any)=>{h.points[1].timeS=0;},
    (h:any)=>{h.sampleCount=1;}, (h:any)=>{h.maxGapS=0;}, (h:any)=>{h.exactBurnoutSampleExists=true;},
    (h:any)=>{h.points[1].normal.cpFromNoseM=.7;},
    (h:any)=>{h.points[1].normal.cnaWeightedArmMPerRad=0;},
    (h:any)=>{h.points[1].normal=null;}, (h:any)=>{h.points[1].powered=false;},
    (h:any)=>{h.points[1].recovery=true;}, (h:any)=>{h.points[1].domain='qualified';},
    (h:any)=>{h.points=Array(5001).fill(h.points[0]);h.sampleCount=5001;},
  ])('refuses corrupt/inconsistent records without normalization (%#)', mutate => {
    const h=momentArmHistoryFixture(); mutate(h); expect(()=>parseMomentArmHistory(h)).toThrow(/momentArmHistory/);
  });
  it('keeps mechanical/flow data when live-canopy airframe quantities are N/A', () => {
    const h=momentArmHistoryFixture(); const p=h.points[1];
    p.recovery=true;p.normalApplicability='not-applicable-live-canopy';p.normal=null;
    const parsed=parseMomentArmHistory(h); expect(parsed.points[1].normal).toBeNull();
    expect(parsed.points[1].cgFromNoseM).toBe(.3);expect(parsed.points[1].massKg).toBe(.1);
  });
  it('permits only genuine exact-boundary data for an exact-burnout disclosure', () => {
    const h=momentArmHistoryFixture();h.points[1].timeS=h.burnoutTimeS;h.points[1].powered=false;
    h.timeRangeS[1]=h.burnoutTimeS;h.maxGapS=h.burnoutTimeS;h.lastSampleToBurnoutS=0;h.exactBurnoutSampleExists=true;
    expect(parseMomentArmHistory(h).exactBurnoutSampleExists).toBe(true);
  });
  it('archive fixture without new fields is a valid legacy record (non-vacuity)', () => {
    const raw=archived(); delete raw.cases[0].momentArmHistory; delete raw.cases[0].inputs.reportMomentArmHistory;
    expect(readProject(JSON.stringify(raw)).cases[0].id).toBe('history-case');
  });
  it('unknown history must not be silently stripped by the project reader', () => {
    const raw=archived();raw.cases[0].momentArmHistory.schemaId='future';
    expect(()=>readProject(JSON.stringify(raw))).toThrow();
  });
  it('old schema declarations must not silently strip injected new history', () => {
    const raw=archived();raw.schemaVersion='1.7.0';
    expect(()=>readProject(JSON.stringify(raw))).toThrow();
  });
  it('roundtrips a new history and preserves old absent history/request through migration',()=>{
    const raw=archived();const saved=readProject(writeProject(readProject(JSON.stringify(raw))));
    expect(saved.schemaVersion).toBe('1.13.0');
    expect(saved.cases[0].momentArmHistory).toEqual(raw.cases[0].momentArmHistory);
    expect((saved.cases[0].inputs as LegacyRunInputs | undefined)?.reportMomentArmHistory).toBe(true);
    delete raw.cases[0].momentArmHistory;delete raw.cases[0].inputs.reportMomentArmHistory;raw.schemaVersion='1.7.0';
    const migrated=readProject(writeProject(readProject(JSON.stringify(raw))));
    expect(migrated.cases[0]).not.toHaveProperty('momentArmHistory');
    expect(migrated.cases[0].inputs).not.toHaveProperty('reportMomentArmHistory');
    expect(migrated.cases[0].engineIdentity).toEqual(raw.cases[0].engineIdentity);
  });
  it.each([
    (entry:any)=>{delete entry.engineIdentity;},
    (entry:any)=>{delete entry.inputs.reportMomentArmHistory;},
    (entry:any)=>{entry.inputs.reportMomentArmHistory=false;},
    (entry:any)=>{entry.inputs.reportMomentArmHistory=null;},
    (entry:any)=>{delete entry.momentArmHistory;},
    (entry:any)=>{entry.momentArmHistory=null;},
    (entry:any)=>{entry.momentArmHistory=momentArmHistoryFixture(.5);},
    (entry:any)=>{entry.summary.flightTimeS=.1;},
    (entry:any)=>{entry.inputs.version=1;delete entry.inputs.flightModel;},
  ])('refuses broken case/request/runtime/time bindings (%#)',mutate=>{
    const raw=archived();mutate(raw.cases[0]);const before=useProjectStore.getState().project;
    expect(()=>readProject(JSON.stringify(raw))).toThrow();
    expect(useProjectStore.getState().project).toBe(before);
  });
  it('reports request absence/false/true as exact invocation context without changing physical options',()=>{
    const record=archived().cases[0].inputs.motorRecord;
    const old=captureRunInputs(project,record,'same',undefined);
    const recorded=captureRunInputs(project,record,'same',undefined,undefined,undefined,undefined,true);
    expect(recorded.engineOptions).toEqual(old.engineOptions);expect(recorded.inputKey).toBe(old.inputKey);
    expect(old).not.toHaveProperty('reportMomentArmHistory');
    const group=compareRunInputs(old,recorded)![0];
    expect(group.rows).toEqual([{path:'["reportMomentArmHistory"]',baseline:'absent (not zero or null)',variant:'true'}]);
  });
  it('preserves signed-zero bits in actual retained history across project JSON save/reopen',()=>{
    const raw=archived();raw.cases[0].momentArmHistory.points[0].dampingMomentBodyNm.x=-0;
    const saved=writeProject(raw),reopened=readProject(saved);
    expect(Object.is(reopened.cases[0].momentArmHistory!.points[0].dampingMomentBodyNm.x,-0)).toBe(true);
  });
  it.each(['project','vehicle','case','inputs','options'] as const)('refuses known history/report metadata at wrong placement (%s)',placement=>{
    const raw=archived(), entry=raw.cases[0], history=entry.momentArmHistory;
    delete entry.momentArmHistory;delete entry.inputs.reportMomentArmHistory;
    if(placement==='project')raw.momentArmHistory=history;
    if(placement==='vehicle')raw.vehicle.momentArmHistory=history;
    if(placement==='case')entry.reportMomentArmHistory=false;
    if(placement==='inputs')entry.inputs.momentArmHistory=history;
    if(placement==='options')entry.inputs.engineOptions.reportMomentArmHistory=false;
    expect(()=>readProject(JSON.stringify(raw))).toThrow(/momentArmHistory|reportMomentArmHistory/);
  });
  it.each([['running',null],['failed','cancelled'],['failed','requested history missing']] as const)('never archives requested inputs from %s flight (%s)',(status,error)=>{
    const inputs=captureRunInputs(project,archived().cases[0].inputs.motorRecord,'failed-input-key',undefined,undefined,undefined,undefined,true);
    const exported=withRunCases(project,[{kind:'flight',status,inputKey:inputs.inputKey,
      startedAt:inputs.capturedAt,finishedAt:status==='running'?null:inputs.capturedAt,error,token:10,runInputs:inputs,payload:null}]);
    expect(exported.cases).toEqual(project.cases);expect(exported.motorRecords).toEqual(project.motorRecords);
    expect(readProject(writeProject(exported)).cases).toEqual(project.cases);
  });
  it('captures the same requested report and saves its actual run identity, not current defaults',()=>{
    const original=archived().cases[0];
    const inputs=captureRunInputs(project,original.inputs.motorRecord,'input-key',undefined,undefined,undefined,undefined,true);
    const native=flightResultForRequest({reportMomentArmHistory:true,motor:inputs.motorRecord.motor});
    const identity={kind:'production-rust-wasm' as const,sha256:'c'.repeat(64)};
    const run=toFlightRun(native,inputs.vehicle,'certified',inputs.inputKey,1,1,undefined,undefined,undefined,identity);
    const result=withRunCases(project,[{kind:'flight',status:'completed',inputKey:inputs.inputKey,
      startedAt:inputs.capturedAt,finishedAt:inputs.capturedAt,error:null,token:1,runInputs:inputs,payload:{run}}]);
    const saved=readProject(writeProject(result));
    expect(saved.cases[0].momentArmHistory).toEqual(native.momentArmHistory);
    expect(saved.cases[0].engineIdentity).toEqual(identity);
    expect((saved.cases[0].inputs as LegacyRunInputs | undefined)?.reportMomentArmHistory).toBe(true);
    expect(saved.cases[0].momentArmHistory).not.toBe(run.momentArmHistory);
  });
});

describe('normal-law identity on moment-arm histories', () => {
  it('accepts the identity on new runs and preserves it', () => {
    const raw: any = momentArmHistoryFixture();
    raw.normalLawId = 'published-supersonic-normal-v1';
    raw.boattailPolicy = 'suppressed';
    raw.finInterferenceId = 'fin-station-v2';
    const parsed = parseMomentArmHistory(raw);
    expect(parsed.normalLawId).toBe('published-supersonic-normal-v1');
    expect(parsed.boattailPolicy).toBe('suppressed');
    expect(parsed.finInterferenceId).toBe('fin-station-v2');
  });

  it('keeps old archives without the identity parseable', () => {
    const raw: any = momentArmHistoryFixture();
    expect('normalLawId' in raw).toBe(false);
    const parsed = parseMomentArmHistory(raw);
    expect(parsed.normalLawId).toBeUndefined();
    expect(parsed.boattailPolicy).toBeUndefined();
    expect(parsed.finInterferenceId).toBeUndefined();
  });

  it('rejects an unknown normal law or a half-declared identity', () => {
    const bad: any = momentArmHistoryFixture();
    bad.normalLawId = 'not-a-law';
    bad.boattailPolicy = 'suppressed';
    expect(() => parseMomentArmHistory(bad)).toThrow(/normalLawId/);
    const half: any = momentArmHistoryFixture();
    half.normalLawId = 'published-supersonic-normal-v1';
    expect(() => parseMomentArmHistory(half)).toThrow(/missing or unknown fields/);
    const badFin: any = momentArmHistoryFixture();
    badFin.finInterferenceId = 'not-a-station';
    expect(() => parseMomentArmHistory(badFin)).toThrow(/finInterferenceId/);
    // The pre-fix-round P4 label stays readable.
    const v1: any = momentArmHistoryFixture();
    v1.finInterferenceId = 'fin-station-v1';
    expect(parseMomentArmHistory(v1).finInterferenceId).toBe('fin-station-v1');
  });

  it('accepts a P1-era archive without the fin-station key and never invents it', () => {
    const raw: any = momentArmHistoryFixture();
    raw.normalLawId = 'published-supersonic-normal-v1';
    raw.boattailPolicy = 'suppressed';
    const parsed = parseMomentArmHistory(raw);
    expect(parsed.finInterferenceId).toBeUndefined();
    expect('finInterferenceId' in parsed).toBe(false);
  });
});
