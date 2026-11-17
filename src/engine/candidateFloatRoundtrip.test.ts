/** Real app request/JSON boundary regression; synthetic declarations, not flight evidence. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { instantiateEngine } from './core';
import { PRESET_NASA_STUDENT_LAUNCH } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { vehicleDto } from '../tauri/dto';
import { buildCandidateRequest, candidatePreflight, deriveMotorStation } from '../application/candidate';
import { candidateProject, candidateSelection } from '../application/candidate.fixture';
import type { VehicleMassRollup } from '../core/mass';

it('roundtrips the NASA stack aft fallback through aggregate_mass and simulate_candidate', async () => {
  const engine = await instantiateEngine(readFileSync(fileURLToPath(new URL('./astraea_engine.wasm', import.meta.url))));
  const vehicle = structuredClone(PRESET_NASA_STUDENT_LAUNCH);
  // The unchanged preset is intentionally unsupported. Make the same explicit
  // supported-design edits as a user: conical nose and no flagged mount.
  // Keep all four external lengths unchanged (0.65 + 0.75 + 0.12 + 1.45).
  for (const c of vehicle.components) {
    if (c.type === 'nosecone') c.shape = 'conical';
    if (c.type === 'bodytube') c.isMotorMount = false;
  }
  const selection = candidateSelection();
  // Calm launch keeps the bounded candidate inside its supported incidence domain.
  const launch = { ...candidateProject().workspace.launch, windSpeedMps: 0 };
  const motor = CERTIFIED_MOTORS.aerotech_k550w;
  expect(candidatePreflight(vehicle, selection, motor, launch)).toEqual([]);
  const rollup = engine.call<VehicleMassRollup>('aggregate_mass', { vehicle: vehicleDto(vehicle) });
  const request = buildCandidateRequest(vehicle, motor, selection, launch, deriveMotorStation(vehicle, rollup));
  expect(request.motorAftStationFromNoseM).toBe(0.65 + 0.75 + 0.12 + 1.45);
  const nativeEnvelope = JSON.parse(new TextDecoder().decode(readFileSync(fileURLToPath(new URL('../../crates/astraea-engine/tests/fixtures/nasa-stack-candidate-envelope.json', import.meta.url)))));
  if (!process.env.FLOAT_ROUNDTRIP_CAPTURE) expect(request).toEqual(nativeEnvelope.request);
  // Optional capture for native replay and before/after measurement. Never rewrite goldens.
  if (process.env.FLOAT_ROUNDTRIP_CAPTURE) writeFileSync(process.env.FLOAT_ROUNDTRIP_CAPTURE, JSON.stringify({ request }));
  const report = engine.call<{ trajectory: { finalTimeS: number } }>('simulate_candidate', { request });
  expect(report.trajectory.finalTimeS).toBe(selection.horizonSeconds);
});
