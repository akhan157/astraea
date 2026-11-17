// Test-only WASM built with --features e1-test-hooks; never enable in release.
import { readFileSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import { instantiateEngine } from '../../../src/engine/core';
it('returns the trial-limit error and retains the same WASM instance', async () => {
  const m = JSON.parse(readFileSync(process.env.ASTRAEA_E1_MANIFEST!, 'utf8'));
  const e = m.entries.find((x: any) => x.slug === 'calisp1');
  const engine = await instantiateEngine(readFileSync(process.env.E1_HOOK_WASM!));
  const args = {vehicle:e.vehicle, motor:e.motor, options:e.options};
  engine.call('e1_test_set_trial_limit', {limit:1});
  let message = '';
  try { engine.call('simulate_flight', args); } catch (err) { message = String(err); }
  expect(message).toContain('adaptive integrator: exceeded total trial limit');
  engine.call('e1_test_set_trial_limit', {limit:5000});
  const result = engine.call<any>('simulate_flight', args);
  expect(Number.isFinite(result.apogeeAltitude)).toBe(true);
  writeFileSync(process.env.E1_HOOK_OUT!, JSON.stringify({message, subsequentApogee:result.apogeeAltitude}, null, 2));
}, 900000);
