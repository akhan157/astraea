import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { instantiateEngine } from './core';
import { parseMomentArmHistory } from '../application/momentArmHistory';
import type { SixDofSimulationResult } from '../sim/sixDofSimulator';

it('actual offered WASM observes history without changing any old result value (including signed zero)',async()=>{
  // Ordinary synthetic SOFTWARE preservation test, not a numerical experiment.
  const bytes=readFileSync(fileURLToPath(new URL('./astraea_engine.wasm',import.meta.url)));
  console.info('RMP10 tested WASM SHA-256:',createHash('sha256').update(bytes).digest('hex'));
  const engine=await instantiateEngine(bytes);
  const args=JSON.parse(new TextDecoder().decode(readFileSync(fileURLToPath(new URL('../../docs/internal/execution-runs/RMP12c-regime-expansion/LEGACY-INPUT.json',import.meta.url)))));
  const off=engine.call<SixDofSimulationResult>('simulate_flight',args);
  const on=engine.call<SixDofSimulationResult>('simulate_flight',{...args,reportMomentArmHistory:true});
  const {momentArmHistory,...oldFields}=on;
  expect(off).not.toHaveProperty('momentArmHistory');expect(oldFields).toStrictEqual(off);
  const history=parseMomentArmHistory(momentArmHistory);
  expect(history.burnoutTimeS).toBe(on.burnoutTime);expect(history.points.length).toBeGreaterThan(1);
  expect(engine.poisoned).toBe(false);
});
