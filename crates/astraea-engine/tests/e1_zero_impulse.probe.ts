import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { instantiateEngine } from '../../../src/engine/core';
it('all legacy commands refuse zero impulse and the same instance flies again', async () => {
  const e = JSON.parse(readFileSync(process.env.ASTRAEA_E1_MANIFEST!, 'utf8')).entries.find((x: any) => x.slug === 'calisp1');
  const engine = await instantiateEngine(readFileSync(process.env.E1_WASM!));
  const motor = {...e.motor, thrustCurve:[{time:0,thrust:0},{time:1.88,thrust:0}], maxThrust:0};
  const args = {vehicle:e.vehicle, motor, options:e.options};
  const req = {...args, sigmas:{}, nRuns:1, seed:1, version:'per-run-v2', runStart:0, runEnd:1};
  for (const cmd of ['simulate_flight','flight_summary','run_ensemble','run_ensemble_classified','run_ensemble_chunk']) {
    let message = '';
    try { engine.call(cmd, cmd.startsWith('run_ensemble') ? {req} : args); } catch (err) { message = String(err); }
    expect(message, cmd).toContain('motor thrust curve must deliver a finite positive total impulse (got 0)');
    console.log(cmd, message);
  }
  const result = engine.call<any>('simulate_flight', {vehicle:e.vehicle,motor:e.motor,options:e.options});
  expect(Number.isFinite(result.apogeeAltitude)).toBe(true);
  console.log('subsequent apogee:', result.apogeeAltitude);
}, 900000);
