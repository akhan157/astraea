import { afterEach, expect, it } from 'vitest';
import { setTestEngine, type EngineInvoke } from '../engine';
import { simulateFlightRecorded } from './bridge';
import { PRESET_ESTES_ALPHA } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { flightResult, flightResultForRequest } from '../console/testFixtures';
const vehicle=PRESET_ESTES_ALPHA,motor=CERTIFIED_MOTORS.estes_c6;
afterEach(()=>setTestEngine(null));
it('sends reporting outside physics options only when explicitly supplied and preserves invocation identity',async()=>{
  const calls:Record<string,unknown>[]=[];
  setTestEngine((async (_cmd,args)=>{calls.push(args!);return flightResultForRequest(args);}) as EngineInvoke);
  const old=await simulateFlightRecorded(vehicle,motor,{});
  expect(calls[0]).not.toHaveProperty('reportMomentArmHistory');expect(old.value).not.toHaveProperty('momentArmHistory');
  const recorded=await simulateFlightRecorded(vehicle,motor,{},true);
  expect(calls[1].reportMomentArmHistory).toBe(true);
  expect(calls[1].options).not.toHaveProperty('reportMomentArmHistory');
  expect(recorded.engineIdentity).toEqual({kind:'test-engine',sha256:null});
  expect(recorded.value.momentArmHistory?.reportMomentArmHistory).toBe(true);
  expect(Object.isFrozen(recorded.value.momentArmHistory?.points)).toBe(true);
  const off=await simulateFlightRecorded(vehicle,motor,{},false);
  expect(calls[2].reportMomentArmHistory).toBe(false);expect(off.value).not.toHaveProperty('momentArmHistory');
});
it('fails a requested but missing history rather than accepting an old/mismatched runtime response',async()=>{
  setTestEngine((async ()=>flightResult()) as EngineInvoke);
  await expect(simulateFlightRecorded(vehicle,motor,{},true)).rejects.toThrow(/requested momentArmHistory missing/);
});
it('rejects malformed requests before engine dispatch and corrupt returned history without fallback',async()=>{
  let calls=0;
  setTestEngine((async (_cmd,args)=>{calls++;const r=flightResultForRequest(args);r.momentArmHistory!.schemaId='future' as any;return r;}) as EngineInvoke);
  await expect(simulateFlightRecorded(vehicle,motor,{},null as any)).rejects.toThrow(/must be boolean/);
  expect(calls).toBe(0);
  await expect(simulateFlightRecorded(vehicle,motor,{},true)).rejects.toThrow(/momentArmHistory/);
  expect(calls).toBe(1);
});
