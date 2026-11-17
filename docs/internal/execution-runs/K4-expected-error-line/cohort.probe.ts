// K3 candidate-default cohort probe (spec Amendment 4). A COPY of the L0 probe's
// shape, not an edit of it: L0 sent manifest DTOs straight to the engine; this
// maps each manifest vehicle the way the app holds it and sends the options the
// app's own `flightRunOptions` derives, so the candidate DEFAULT is what flies.
//
//   L0_WASM=<wasm> L0_WASM_SHA256=<sha256> K3_OUT=out/K3/cohort-c2 \
//     ./node_modules/.bin/vitest run --maxWorkers=2 --config docs/internal/execution-runs/K3-improved-default/vitest.config.ts
//
// Adapter (Amendment 4): launchSite.temperatureC = temperatureK - 273.15;
// nozzleExitDiameter and nose tipRadius copied as declared; no drag choice; no
// nozzleBackPressureThrust. Rows per flight (apogee, m AGL):
//   cand    the candidate default (full inputs)
//   cBlank  default, with temperature, nozzle exit and nose tip radius all blank
//   cArm    baseline arm-C semantics: explicit 'calibrated' (old opt-in), tip radius
//           and temperature removed, vehicle nozzle kept as a drag input only
//   bNoNoz  B's inputs without the nozzle option (explicit 'calibrated', no flag)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import { instantiateEngine } from '../../../../src/engine/core';
import { flightRunOptions } from '../../../../src/application/caseResolver';
import { vehicleDto } from '../../../../src/tauri/dto';
import type { RocketVehicle } from '../../../../src/core/types';

const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const MANIFEST = '/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json';
const BASELINE_WASM = '/home/ak/astraea-evidence/goal-collegiate-accuracy/step0/wasm/build1.wasm';
const BASELINE_SHA = 'bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff';

/** The manifest vehicle as an app vehicle (Amendment 4 adapter). */
function adapt(e: any, patch?: (v: RocketVehicle) => void): RocketVehicle {
  const vehicle = structuredClone(e.vehicle) as RocketVehicle & { launchSite: { altitudeM: number; temperatureK?: number; temperatureC?: number } };
  const site = e.vehicle.launchSite as { altitudeM: number; temperatureK: number };
  vehicle.launchSite = { altitudeM: site.altitudeM, temperatureC: site.temperatureK - 273.15 };
  patch?.(vehicle);
  return vehicle;
}

it('flies the frozen cohort through the candidate default', async () => {
  const mb = readFileSync(MANIFEST);
  expect(hash(mb)).toBe('3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5');
  const wasmPath = process.env.L0_WASM || BASELINE_WASM;
  const wb = readFileSync(wasmPath);
  const wasmSha = hash(wb);
  expect(wasmSha).toBe(process.env.L0_WASM_SHA256 || BASELINE_SHA);
  const engine = await instantiateEngine(wb);
  const fly = (e: any, vehicle: unknown, options: Record<string, unknown>) =>
    engine.call<any>('simulate_flight', { vehicle, motor: e.motor, options });
  const rows: any[] = [];
  for (const e of JSON.parse(mb.toString()).entries) {
    // Arm B's options, exactly as L0 built them.
    const optionsB: Record<string, unknown> = { ...e.options, flightDragSource: 'calibrated', launchSiteTemperatureC: (e.launch_site.temperature_f - 32) / 1.8 };
    if (e.vehicle.nozzleExitDiameter != null) optionsB.nozzleExitDiameter = e.vehicle.nozzleExitDiameter;

    // The candidate default: app vehicle -> app derivation. The engine DTO vehicle
    // is the manifest's, as in every L0 arm, so only the options differ.
    const v = adapt(e);
    const optionsCand = { ...e.options, ...flightRunOptions(v) } as Record<string, unknown>;
    const stripTip = (x: RocketVehicle) => { for (const c of x.components) if (c.type === 'nosecone') delete (c as { tipRadius?: number }).tipRadius; };

    const vBlank = adapt(e, (x) => { stripTip(x); delete x.nozzleExitDiameter; delete (x.launchSite as { temperatureC?: number }).temperatureC; });
    const optionsBlank = { ...e.options, ...flightRunOptions(vBlank) } as Record<string, unknown>;
    const dtoBlank = structuredClone(e.vehicle); stripTip(dtoBlank); delete dtoBlank.nozzleExitDiameter;

    const vArm = adapt(e, (x) => { stripTip(x); delete (x.launchSite as { temperatureC?: number }).temperatureC; x.flightDragSource = 'calibrated'; });
    const optionsArm = { ...e.options, ...flightRunOptions(vArm) } as Record<string, unknown>;
    const dtoArm = structuredClone(e.vehicle); stripTip(dtoArm);

    const vBNoNoz = adapt(e, (x) => { x.flightDragSource = 'calibrated'; });
    const optionsBNoNoz = { ...e.options, ...flightRunOptions(vBNoNoz) } as Record<string, unknown>;

    // Reported, not gated: does the app's own vehicle DTO equal the vehicle the L0
    // arms sent to the engine? (If so the app path and this probe fly one vehicle.)
    const appDto = vehicleDto(v) as any;
    const sameVehicle = JSON.stringify(appDto.components) === JSON.stringify(e.vehicle.components)
      && appDto.nozzleExitDiameter === e.vehicle.nozzleExitDiameter
      && appDto.surfaceFinish === e.vehicle.surfaceFinish && appDto.forceTurbulentFlow === e.vehicle.forceTurbulentFlow;

    rows.push({
      slug: e.slug,
      appDtoEqualsManifestVehicle: sameVehicle,
      cand: fly(e, e.vehicle, optionsCand),
      cBlank: fly(e, dtoBlank, optionsBlank),
      cArm: fly(e, dtoArm, optionsArm),
      bNoNoz: fly(e, e.vehicle, optionsBNoNoz),
      optionsCand, optionsB, optionsBlank, optionsArm, optionsBNoNoz,
    });
  }
  const out = '/home/ak/astraea-evidence/goal-collegiate-accuracy/K4';
  mkdirSync(out, { recursive: true });
  // Provenance travels with the rows so a candidate run cannot be read as the baseline.
  writeFileSync(`${out}/cand.json`, JSON.stringify({ wasm_path: wasmPath, wasm_sha256: wasmSha, manifest_sha256: hash(mb), rows }, null, 2));
});
