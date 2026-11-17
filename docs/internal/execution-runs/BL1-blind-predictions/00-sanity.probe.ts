// BL1 sanity: Alpha fixture with and without an explicit motor mount.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { instantiateEngine } from '../../../../src/engine/core';
import { vehicleDto, motorDto } from '../../../../src/tauri/dto';
import { CERTIFIED_MOTORS } from '../../../../src/propulsion/motorDatabase';
import type { RocketVehicle } from '../../../../src/core/types';
import { WASM_PATH, WASM_SHA256, sha256 } from './probe-lib';

it('flies the engine fixture', async () => {
  const bytes = readFileSync(WASM_PATH);
  if (sha256(bytes) !== WASM_SHA256) throw new Error('wasm hash');
  const engine = await instantiateEngine(bytes);
  const path = 'crates/astraea-engine/tests/fixtures/alpha-vehicle.json';
  const fx = JSON.parse(readFileSync(path, 'utf8')) as { vehicle?: RocketVehicle } & RocketVehicle;
  const base = fx.vehicle ?? fx;
  const out: Record<string, unknown> = {};
  const variants: Array<[string, RocketVehicle]> = [
    ['fixture', base],
    ['no-mount-flag', { ...base, components: base.components.map((c) => { const copy = { ...c } as Record<string, unknown>; delete copy.isMotorMount; return copy as unknown as RocketVehicle['components'][number]; }) }],
  ];
  for (const [label, vehicle] of variants) {
    const r = engine.call<Record<string, unknown>>('simulate_flight', { vehicle: vehicleDto(vehicle), motor: motorDto(CERTIFIED_MOTORS.estes_c6), options: {} });
    out[label] = { apogee: r.apogeeAltitude, maxMach: r.maxMach, events: (r.events as Array<Record<string, unknown>>).map((e) => [e.kind ?? e.name, e.time]) };
  }
  mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./out/sanity.json', import.meta.url), JSON.stringify(out, null, 2));
});
