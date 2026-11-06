/**
 * Regression: the Spaceport America practice example must not be ballistic.
 *
 * Owner finding (2026-11-06): the preset declared no recovery hardware, so the
 * engine applied no canopy drag and the example landed at 184.3 m/s against the
 * Tripoli Level 1 limit of 10.67 m/s. The preset now carries an apogee drogue
 * and a main in the same convention as the NASA Student Launch preset.
 *
 * This runs the shipped WASM over the same adapter path the Console uses, so a
 * lost chute, a deploy altitude above apogee, or a canopy that stops being
 * attached all fail here rather than in a rendered run.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ParachuteComponent } from '../../core/types';
import { DEFAULT_WORKSPACE } from '../../application/workspace';
import { CERTIFIED_MOTORS } from '../../propulsion/motorDatabase';
import { presetOf } from '../../state/project';
import { instantiateEngine, type EngineInstance } from '../../engine/core';
import { setTestEngine } from '../../engine';
import { LANDING_SPEED_GATE, runFlight, type LaunchConfig } from './adapter';
import type { FlightRun } from './contract';

let engine: EngineInstance;

beforeAll(async () => {
  engine = await instantiateEngine(readFileSync(fileURLToPath(new URL('../../engine/astraea_engine.wasm', import.meta.url))));
  setTestEngine((async (cmd: string, args?: Record<string, unknown>) => engine.call(cmd, args)) as never);
});
afterAll(() => setTestEngine(null));

function spaceport() {
  const preset = presetOf('spaceport');
  if (preset === null) throw new Error('the Spaceport America preset is missing from the build');
  const motor = CERTIFIED_MOTORS[preset.motorId];
  if (motor === undefined) throw new Error(`the ${preset.motorId} cert motor is missing from the build`);
  // Same mapping the Console applies to workspace launch settings (design.ts).
  const launch = { ...DEFAULT_WORKSPACE.launch, ...preset.launch };
  const options: LaunchConfig = {
    railLength: launch.railLengthM,
    railElevationDeg: launch.railElevationDeg,
    railAzimuthDeg: launch.railAzimuthDeg,
    windSpeedSurface: launch.windSpeedMps,
    windAzimuthDeg: launch.windAzimuthDeg,
    finCantAngleDeg: launch.finCantDeg,
    mainDeployAltitudeAGL: launch.mainDeployAltitudeM,
  };
  return { preset, motor, options };
}

describe('Spaceport America practice preset recovery', () => {
  const { preset, motor, options } = spaceport();
  const chutes = preset.vehicle.components.filter((c): c is ParachuteComponent => c.type === 'parachute');

  it('declares an apogee drogue and a main in that order', () => {
    expect(chutes).toHaveLength(2);
    const [drogue, main] = chutes;
    expect(drogue.id).toBe('sac-drogue');
    expect(drogue.diameter).toBeCloseTo(0.46, 6);
    expect(drogue.cd).toBeCloseTo(1.2, 6);
    expect(main.id).toBe('sac-main');
    expect(main.diameter).toBeCloseTo(1.524, 6);
    expect(main.cd).toBeCloseTo(1.5, 6);
    expect(main.diameter).toBeGreaterThan(drogue.diameter);
  });

  it(`lands the practice flight at or below the ${LANDING_SPEED_GATE} m/s limit with the gate passing`, async () => {
    const run: FlightRun = await runFlight(preset.vehicle, motor, options, preset.motorId, 'spaceport-recovery', 1);
    // Recovery has to actually deploy, not just end below the limit by accident.
    const kinds = run.events.map((e) => e.kind);
    expect(kinds).toContain('apogee_drogue');
    expect(kinds).toContain('main');
    expect(run.summary.landingSpeed.value).toBeLessThanOrEqual(LANDING_SPEED_GATE);
    const gate = run.gates.find((g) => g.id === 'landing_speed');
    expect(gate?.status).toBe('pass');
  }, 60_000);
});
