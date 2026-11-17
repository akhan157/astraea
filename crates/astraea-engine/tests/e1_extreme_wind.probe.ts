// Native JSON cannot represent NaN; native Rust tests cover it at the option boundary.
import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { instantiateEngine } from '../../../src/engine/core';
it('extreme wind returns errors and the same WASM instance remains usable', async () => {
  const entries = JSON.parse(readFileSync(process.env.ASTRAEA_E1_MANIFEST!, 'utf8')).entries;
  const e = entries.find((x: any) => x.slug === 'calisp1');
  const engine = await instantiateEngine(readFileSync(process.env.E1_WASM!));
  for (const speed of [1e9, 1e300, -1]) {
    let message = '';
    try { engine.call('simulate_flight', {vehicle:e.vehicle, motor:e.motor, options:{...e.options,windSpeedSurface:speed}}); }
    catch (err) { message = String(err); }
    expect(message).not.toContain('internal failure');
    expect(message).toMatch(speed < 0 ? /windSpeedSurface/ : /adaptive integrator/);
    const ok = engine.call<any>('simulate_flight', {vehicle:e.vehicle,motor:e.motor,options:e.options});
    expect(Number.isFinite(ok.apogeeAltitude)).toBe(true);
  }
}, 900000);
