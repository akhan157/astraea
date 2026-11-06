// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RocketVehicle } from '../../core/types';
import { instantiateEngine } from '../../engine/core';
import { setTestEngine, type EngineInvoke } from '../../engine';
import { presetOf } from '../../state/project';
import { stabilityOfVehicle } from './adapter';

beforeAll(async () => {
  const bytes = readFileSync(fileURLToPath(new URL('../../engine/astraea_engine.wasm', import.meta.url)));
  const engine = await instantiateEngine(bytes);
  // The WASM dispatcher preserves command/result pairing that the generic test hook cannot infer.
  const invoke = (async (command, args) => engine.call(command, args)) as EngineInvoke;
  setTestEngine(invoke);
});

afterAll(() => setTestEngine(null));

function vehicleWithWeighedParts(count: number | 'all'): RocketVehicle {
  const preset = presetOf('nasaStudent');
  if (preset === null) throw new Error('Student Launch preset unavailable');
  return {
    ...preset.vehicle,
    components: preset.vehicle.components.map((original, index) => {
      const part = { ...original };
      delete part.massOverride;
      delete part.cgOverride;
      if (count === 'all' || index < count) part.massOverride = 0.1 + index * 0.01;
      return part;
    }),
  };
}

describe('stability measurement confidence through the production engine', () => {
  it('keeps a mixed weighed and computed mass total modeled', async () => {
    const vehicle = vehicleWithWeighedParts(1);
    const result = await stabilityOfVehicle(vehicle);
    const weighedPart = result.rows.find((part) => part.partId === vehicle.components[0].id);

    expect(weighedPart?.mass.confidence).toBe('measured');
    expect(result.rows.some((part) => part.mass.confidence === 'modeled')).toBe(true);
    expect(result.totalMass.confidence).toBe('modeled');
    expect(weighedPart?.cg.confidence).toBe('modeled');
    expect(result.cg.confidence).toBe('modeled');
  });

  it('does not treat weighed part masses as a measurement of component or assembled CG', async () => {
    const result = await stabilityOfVehicle(vehicleWithWeighedParts('all'));

    expect(result.rows.every((part) => part.mass.confidence === 'measured')).toBe(true);
    expect(result.totalMass.confidence).toBe('measured');
    expect(result.rows.every((part) => part.cg.confidence === 'modeled')).toBe(true);
    expect(result.cg.confidence).toBe('modeled');
  });

  it('leaves an entirely geometry-derived mass and CG modeled', async () => {
    const result = await stabilityOfVehicle(vehicleWithWeighedParts(0));

    expect(result.rows.every((part) => part.mass.confidence === 'modeled')).toBe(true);
    expect(result.totalMass.confidence).toBe('modeled');
    expect(result.cg.confidence).toBe('modeled');
  });
});
