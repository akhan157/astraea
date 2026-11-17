import { readFileSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createProjectEnvelope, writeProject } from '../../../../src/formats/projectJson';
import { DEFAULT_WORKSPACE } from '../../../../src/application/workspace';

it('creates private cohort projects for visual checks', () => {
 const bytes=readFileSync('/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json');
 expect(createHash('sha256').update(bytes).digest('hex')).toBe('3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5');
 const entries=JSON.parse(bytes.toString()).entries;
 for (const name of ['byrum','raven','proteus6']) {
  const e=entries.find((x:any)=>x.airframe_group===name);
  const vehicle=structuredClone(e.vehicle); vehicle.launchSite={altitudeM:e.vehicle.launchSite.altitudeM,temperatureC:e.vehicle.launchSite.temperatureK-273.15};
  const workspace=structuredClone(DEFAULT_WORKSPACE); workspace.motorId=e.motor.id;
  const p=createProjectEnvelope({vehicle,workspace,motorRecords:[{id:e.motor.id,motor:e.motor,provenance:{source:'import'}}] as never});
  writeFileSync(`/home/ak/astraea-evidence/goal-collegiate-accuracy/K4/${name}.astraea.json`,writeProject(p));
 }
});
