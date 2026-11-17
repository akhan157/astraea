/**
 * Built-up flight drag against the shipped WebAssembly engine (accuracy bundle).
 *
 * What this pins, without committing a flight number: the opt-in reaches the
 * engine as `options.flightDragSource`, a supported shape's result moves in the
 * measured direction, and a shape the method refuses is bit-identical to its own
 * legacy flight and is reported by the one permitted prose check. An engine
 * swap with the same option contract keeps every assertion meaningful: the
 * baseline is flown inside this test on the same engine.
 */
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { instantiateEngine, type EngineInstance } from '../../engine/core';
import { setTestEngine, type EngineInvoke } from '../../engine';
import { simulateFlight } from '../../tauri/bridge';
import { CERTIFIED_MOTORS } from '../../propulsion/motorDatabase';
import { presetOf } from '../../state/project';
import { createProjectEnvelope } from '../../formats/projectJson';
import { DEFAULT_WORKSPACE } from '../../application/workspace';
import { designOf } from '../design';
import { sixDofOptions } from '../data/adapter';
import { physicsOptionsOf } from '../../application/caseResolver';
import { AERO_MODEL_VERSION, type AeroModelSelection } from '../../application/aeroModel';
import { builtUpDragWasRefused } from './builtUpDrag';
import type { RocketVehicle } from '../../core/types';
import type { SixDofSimulationResult } from '../../sim/sixDofSimulator';

let engine: EngineInstance;

beforeAll(async () => {
  const bytes = readFileSync(fileURLToPath(new URL('../../engine/astraea_engine.wasm', import.meta.url)));
  engine = await instantiateEngine(bytes);
  setTestEngine((async (cmd: string, args?: Record<string, unknown>) => engine.call(cmd, args)) as EngineInvoke);
});

afterAll(() => setTestEngine(null));

// K3: `false` is the explicit legacy choice (the pre-switch flight), `true` the old explicit opt-in,
// and `'default'` the template with no drag choice at all.
function template(key: 'nasaStudent' | 'spaceport', optIn: boolean | 'default') {
  const preset = presetOf(key);
  if (preset === null) throw new Error(`${key} preset missing`);
  const workspace = {
    ...DEFAULT_WORKSPACE,
    motorId: preset.motorId,
    launch: { ...DEFAULT_WORKSPACE.launch, ...preset.launch },
    site: { ...DEFAULT_WORKSPACE.site, altitudeASLM: preset.altitudeASLM ?? DEFAULT_WORKSPACE.site.altitudeASLM },
  };
  const project = createProjectEnvelope({ vehicle: preset.vehicle, workspace, mission: preset.mission });
  if (optIn !== 'default') (project.vehicle as RocketVehicle).flightDragSource = optIn ? 'calibrated' : 'legacy';
  const design = designOf(project, preset.mission);
  return {
    vehicle: design.vehicle,
    motor: CERTIFIED_MOTORS[design.motorId],
    options: sixDofOptions(design.options),
  };
}

async function flight(key: 'nasaStudent' | 'spaceport', optIn: boolean | 'default'): Promise<SixDofSimulationResult & { manifest: Record<string, string> }> {
  const c = template(key, optIn);
  // A committed flight that carries the drag opt-in needs a usable built-up
  // selection (the same admission rule the store and bridge apply). The
  // selection is app-side only; the engine still receives the drag option.
  const selection: AeroModelSelection | undefined = optIn === true
    ? { modelId: 'aero-buildup', modelVersion: AERO_MODEL_VERSION, terms: { transonic: 'legacy' } }
    : undefined;
  const result = await simulateFlight(c.vehicle, c.motor, c.options, selection);
  // The engine always emits these manifest lines; the TS DTO type is the
  // oracle's older shape, so read them as a plain record here.
  return { ...result, manifest: result.runManifest as unknown as Record<string, string> };
}

describe('built-up flight drag through the real engine', () => {
  it('default: a template with no drag choice flies exactly as the explicit opt-in does (no selection needed)', async () => {
    for (const key of ['nasaStudent', 'spaceport'] as const) {
      const byDefault = await flight(key, 'default');
      const explicit = await flight(key, true);
      expect(byDefault.manifest.axialDrag).toBe(explicit.manifest.axialDrag);
      expect(byDefault.apogeeAltitude).toBe(explicit.apogeeAltitude);
      expect(byDefault.maxMach).toBe(explicit.maxMach);
    }
    const nasa = await flight('nasaStudent', 'default');
    expect(nasa.manifest.axialDrag).toMatch(/^calibrated /);
    expect(builtUpDragWasRefused(physicsOptionsOf(template('nasaStudent', 'default').vehicle), nasa.manifest)).toBe(false);
    // Spaceport's fins sit on the boattail: the default falls back to its legacy tables and says why.
    const spaceport = await flight('spaceport', 'default');
    expect(spaceport.manifest.axialDrag).toContain('legacy drag used (refused: ');
    expect(builtUpDragWasRefused(physicsOptionsOf(template('spaceport', 'default').vehicle), spaceport.manifest)).toBe(true);
    expect(spaceport.apogeeAltitude).toBe((await flight('spaceport', false)).apogeeAltitude);
  });

  it('names the drag source it used and moves a supported flight', async () => {
    const legacy = await flight('nasaStudent', false);
    const built = await flight('nasaStudent', true);

    expect(legacy.manifest.axialDrag).toMatch(/^legacy /);
    expect(built.manifest.axialDrag).toMatch(/^calibrated /);

    const sent = physicsOptionsOf(template('nasaStudent', true).vehicle);
    expect(sent).toEqual({ flightDragSource: 'calibrated' });
    expect(builtUpDragWasRefused(sent, built.manifest)).toBe(false);

    // Direction, not magnitude: the built-up axial drag lowers drag on this
    // vehicle, so its apogee rises. The baseline is flown here, on this engine.
    expect(built.apogeeAltitude).toBeGreaterThan(legacy.apogeeAltitude);
  });

  it('default: a declared nozzle exit wider than the aft body is refused by the engine (real engine)', async () => {
    // E1 (step-4 physics review, blocking finding 1): an exit wider than the aft body
    // fed the power-on base-drag term and gave non-physical apogees. The engine now
    // refuses it at every entry point with the aft-body bound; the app shows that error.
    const c = template('nasaStudent', 'default');
    const big = { ...c.vehicle, nozzleExitDiameter: 1.5 };
    expect(physicsOptionsOf(big)).toEqual({ flightDragSource: 'calibrated' });
    await expect(simulateFlight(big, c.motor, c.options))
      .rejects.toThrow(/vehicle\.nozzleExitDiameter 1\.5 m must be finite and within 0\.\.=0\.152 m \(aft-body diameter\)/);
    await expect(simulateFlight({ ...big, flightDragSource: 'legacy', nozzleBackPressureThrust: true }, c.motor, c.options))
      .rejects.toThrow(/nozzleExitDiameter 1\.5 m must be finite and within 0\.\.=0\.152 m \(aft-body diameter\)/);
  });

  it('refuses a shape by flying its own legacy tables and saying so', async () => {
    // Spaceport America as shipped: its fins sit on the boattail transition.
    const legacy = await flight('spaceport', false);
    const requested = await flight('spaceport', true);

    expect(requested.manifest.axialDrag).not.toMatch(/^calibrated /);
    expect(requested.manifest.axialDrag).toContain('legacy drag used (refused: ');
    expect(builtUpDragWasRefused(physicsOptionsOf(template('spaceport', true).vehicle), requested.manifest)).toBe(true);
    // A refused shape is bit-identical to its own flight without the opt-in.
    expect(requested.apogeeAltitude).toBe(legacy.apogeeAltitude);
    expect(requested.maxMach).toBe(legacy.maxMach);
  });
});
