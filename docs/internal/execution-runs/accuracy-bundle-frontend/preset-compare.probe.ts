// Orchestrator probe: default (no new option) flights of the three
// app presets on two engine builds, with exactly the inputs the app sends.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { it } from 'vitest';
import { PRESET_DESIGNS, presetOf } from '../../../../src/state/project';
import { DEFAULT_WORKSPACE } from '../../../../src/application/workspace';
import { createProjectEnvelope } from '../../../../src/formats/projectJson';
import { CERTIFIED_MOTORS, normalizeMotorId } from '../../../../src/propulsion/motorDatabase';
import { designOf } from '../../../../src/console/design';
import { sixDofOptions } from '../../../../src/console/data/adapter';
import { flightRunOptions } from '../../../../src/application/caseResolver';
import { motorDto, vehicleDto } from '../../../../src/tauri/dto';
import { instantiateEngine } from '../../../../src/engine/core';

const OUT = process.env.PROBE_OUT!;
const builds = { old: process.env.PROBE_OLD_WASM!, bundle: process.env.PROBE_NEW_WASM! };

it('compares default preset flights on both engines', async () => {
  const out: Record<string, unknown> = { wasm: {}, presets: {} };
  const engines: Record<string, Awaited<ReturnType<typeof instantiateEngine>>> = {};
  for (const [name, path] of Object.entries(builds)) {
    const bytes = readFileSync(path);
    (out.wasm as Record<string, unknown>)[name] = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    engines[name] = await instantiateEngine(bytes);
  }
  for (const key of Object.keys(PRESET_DESIGNS)) {
    const preset = presetOf(key)!;
    const motorKey = normalizeMotorId(preset.motorId);
    const motor = CERTIFIED_MOTORS[motorKey];
    const workspace = { ...DEFAULT_WORKSPACE, motorId: preset.motorId, launch: { ...DEFAULT_WORKSPACE.launch, ...preset.launch } };
    const project = createProjectEnvelope({ vehicle: preset.vehicle, workspace, mission: preset.mission,
      motorRecords: [{ id: motorKey, motor, provenance: { source: 'certified' } }] });
    const design = designOf(project as never, preset.mission);
    const options = { ...sixDofOptions(design.options), ...flightRunOptions(design.vehicle) };
    const args = { vehicle: vehicleDto(design.vehicle), motor: motorDto(motor), options };
    const row: Record<string, unknown> = { motor: motorKey, options };
    for (const name of Object.keys(builds)) {
      const f = engines[name].call<Record<string, any>>('simulate_flight', args);
      const st = engines[name].call<Record<string, any>>('stability', { vehicle: args.vehicle });
      const curvesOff = engines[name].call<Record<string, any>>('aero_curves', { vehicle: args.vehicle, motorBurning: false });
      const cdAt = (m: number) => { const i = curvesOff.machPoints.findIndex((x: number) => Math.abs(x - m) < 1e-9); return i < 0 ? null : (curvesOff.totalCd ?? curvesOff.cd ?? curvesOff.dragCoefficients ?? [])[i] ?? null; };
      row[name] = {
        apogeeAltitude: f.apogeeAltitude, maxVelocity: f.maxVelocity, maxMach: f.maxMach, flightDuration: f.flightDuration,
        landingVelocity: f.landingVelocity, railExitVelocity: f.railExitVelocity, validity: f.validity,
        runManifest: f.runManifest, staticMarginCal: st.staticMargin ?? st.stabilityMargin ?? null, cp: st.cp ?? st.centerOfPressure ?? null,
        curveKeys: Object.keys(curvesOff), cd03: cdAt(0.3), cd08: cdAt(0.8), cd10: cdAt(1.0), cd12: cdAt(1.2), maxTransonicCd: curvesOff.maxTransonicCd,
      };
    }
    (out.presets as Record<string, unknown>)[key] = row;
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
});
