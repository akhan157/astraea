// BL1 step 1: qualification through the app's own ORK import path.
//   ./node_modules/.bin/vitest run --maxWorkers=2 --config docs/internal/execution-runs/BL1-blind-predictions/vitest.config.ts
// Writes out/qualify.json: import refusal, declared values, reconstruction, and
// the nominal flight on the app's bundled motors.
import { mkdirSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import {
  DESIGNS, APP_DEFAULT_LAUNCH, APP_DEFAULT_MC, engineChunk, ensembleRun, flightOptions,
  importAsOrk, loadEngine, readDesign, reconstructDesign, fly, type DesignKey,
} from './probe-lib';
import { vehicleDto } from '../../../../src/tauri/dto';

const OUT = new URL('./out/', import.meta.url);
const MOTORS_BY_DESIGN: Record<DesignKey, Array<'estes_c6'>> = { V001: ['estes_c6'], V002: [] };
const UNAVAILABLE_MOTORS: Record<DesignKey, string[]> = { V001: ['AeroTech D13-10W', 'Quest QC6-5'], V002: ['AeroTech HP-I140W', 'AeroTech HP-J270W'] };

it('qualifies the two sealed designs through the app import path', async () => {
  const { engine, sha256 } = await loadEngine();
  const rows: unknown[] = [];
  for (const key of Object.keys(DESIGNS) as DesignKey[]) {
    const design = readDesign(key);

    let appImportError: string | null = null;
    try {
      await importAsOrk(design.xml);
    } catch (err) {
      appImportError = err instanceof Error ? err.message : String(err);
    }
    expect(appImportError).toMatch(/Unsupported mass\/CG override/);

    const reconstruction = await reconstructDesign(engine, key);
    const options = flightOptions(reconstruction.vehicle);
    const stability = engine.call<Record<string, unknown>>('stability', { vehicle: vehicleDto(reconstruction.vehicle) });

    // What the app would fly if only the override refusal were lifted: the
    // fin `method="bottom"` attribute never reaches the importer, so the seats
    // collapse to 0 and the airframe is unstable. Recorded as a product finding.
    const importedStability = engine.call<Record<string, unknown>>('stability', { vehicle: vehicleDto(reconstruction.importedVehicle) });
    const importedFlight = key === 'V001'
      ? fly(engine, reconstruction.importedVehicle, 'estes_c6', flightOptions(reconstruction.importedVehicle))
      : null;

    const flights: Record<string, unknown> = {};
    for (const motorId of MOTORS_BY_DESIGN[key]) {
      const nominal = fly(engine, reconstruction.vehicle, motorId, options);
      const sample = Array.from({ length: 25 }, (_, i) => ensembleRun(engine, reconstruction.vehicle, motorId, options, APP_DEFAULT_MC, i));
      const chunk = engineChunk(engine, reconstruction.vehicle, motorId, options, APP_DEFAULT_MC, 0, 25);
      const landingErr = Math.max(...sample.map((run, i) => {
        const endpoint = chunk.runs.find((r) => r.runIndex === i)?.endpoint;
        return endpoint === null || endpoint === undefined
          ? Number.POSITIVE_INFINITY
          : Math.max(Math.abs(run.landing.x - endpoint.x), Math.abs(run.landing.y - endpoint.y));
      }));
      flights[motorId] = {
        nominal: {
          apogeeASL: nominal.apogeeAltitude,
          apogeeAGL: nominal.apogeeAltitude - (reconstruction.vehicle.launchSite?.altitudeM ?? 0),
          apogeeTime: nominal.apogeeTime,
          maxMach: nominal.maxMach,
          validity: nominal.validity,
          terminated: nominal.terminated,
          terminationReason: nominal.terminationReason,
        },
        axialDrag: nominal.runManifest.axialDrag,
        ensembleReplication: {
          runsChecked: sample.length,
          maxLandingDeltaM: landingErr,
          chunkAxialDrag: chunk.axialDrag,
          sampleApogees: sample.slice(0, 5).map((r) => r.apogeeASL),
        },
      };
    }

    rows.push({
      design: key,
      designPath: DESIGNS[key].path,
      designSha256: design.sha256,
      declaredStage: DESIGNS[key].declared,
      declaredOverrides: reconstruction.declaredOverrides,
      declaredFinSeats: reconstruction.declaredFinSeats,
      projectionRemoved: reconstruction.projectionRemoved,
      appImportError,
      imported: {
        components: reconstruction.importedVehicle.components.length,
        names: reconstruction.importedVehicle.components.map((c) => `${c.type}:${c.name}`),
        launchSite: reconstruction.importedVehicle.launchSite ?? null,
        nozzleExitDiameter: reconstruction.importedVehicle.nozzleExitDiameter ?? null,
      },
      declaredCgApplied: reconstruction.withDeclaredCg.applied,
      declaredSeatsApplied: reconstruction.withDeclaredFinSeats.applied,
      stagePointMass: reconstruction.stagePointMass,
      massRollupImporter: {
        totalMassKg: reconstruction.importerRollup.totalMass,
        cgM: reconstruction.importerRollup.cg,
        totalLengthM: reconstruction.importerRollup.totalLength,
        maxDiameterM: reconstruction.importerRollup.maxDiameter,
        referenceDiameterM: reconstruction.importerRollup.referenceDiameter,
      },
      massRollupFinal: {
        totalMassKg: reconstruction.finalRollup.totalMass,
        cgM: reconstruction.finalRollup.cg,
      },
      stability: { cg: stability.cg, cp: stability.cp, staticMarginCalibers: stability.staticMarginCalibers, totalMass: stability.totalMass },
      unreconstructed: {
        staticMarginCalibers: importedStability.staticMarginCalibers,
        cg: importedStability.cg,
        cp: importedStability.cp,
        apogeeAGL: importedFlight === null ? null : importedFlight.apogeeAltitude,
        maxMach: importedFlight === null ? null : importedFlight.maxMach,
      },
      motorsUnavailableInAppDatabase: UNAVAILABLE_MOTORS[key],
      launch: APP_DEFAULT_LAUNCH,
      ensemble: APP_DEFAULT_MC,
      engineOptions: options,
      flights,
    });
    // The reconstruction must be stable; an unstable airframe is a construction error.
    expect(Number(stability.staticMarginCalibers)).toBeGreaterThan(1);
    for (const motorId of MOTORS_BY_DESIGN[key]) {
      const flight = flights[motorId] as { ensembleReplication: { maxLandingDeltaM: number }, nominal: { apogeeAGL: number, maxMach: number } };
      // The per-run replication must be the engine's own ensemble run, run for run.
      expect(flight.ensembleReplication.maxLandingDeltaM).toBeLessThan(1e-9);
      expect(flight.nominal.apogeeAGL).toBeGreaterThan(10);
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL('qualify.json', OUT), JSON.stringify({ wasmSha256: sha256, rows }, null, 2));
});
