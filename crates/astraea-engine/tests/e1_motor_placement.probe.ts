import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { instantiateEngine } from '../../../src/engine/core';
it('rejects an overlong motor and flies again in the same instance', async () => {
  const e = JSON.parse(readFileSync(process.env.ASTRAEA_E1_MANIFEST!, 'utf8')).entries.find((x: any) => x.slug === 'calisp1');
  const engine = await instantiateEngine(readFileSync(process.env.E1_WASM!));
  let message = '';
  try { engine.call('simulate_flight', {vehicle:e.vehicle, motor:{...e.motor,length:1.55}, options:e.options}); }
  catch (err) { message = String(err); }
  expect(message).toMatch(/motor forward end.*outside the vehicle/);
  console.log('refusal:', message);
  const result = engine.call<any>('simulate_flight', {vehicle:e.vehicle,motor:e.motor,options:e.options});
  expect(Number.isFinite(result.apogeeAltitude)).toBe(true);
  console.log('subsequent apogee:', result.apogeeAltitude);
}, 900000);
