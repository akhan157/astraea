// BL1 round 2, step 1: qualify the four downloaded motor curves through the
// app's own RASP parser and fly the six remaining sealed flights nominally.
//   ./node_modules/.bin/vitest run docs/internal/execution-runs/BL1-blind-predictions/01b-extra-qualify.probe.ts --maxWorkers=2 --config docs/internal/execution-runs/BL1-blind-predictions/vitest.config.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { it, expect } from 'vitest';
import {
  APP_DEFAULT_LAUNCH, APP_DEFAULT_MC, applyDeclaredStageOverride, engineChunkWithMotor,
  ensembleRunWithMotor, flightOptions, flyWithMotor, loadEngine, loadMotor, reconstructDesign,
  DESIGNS, type DownloadedMotor,
} from './probe-lib';
import { vehicleDto } from '../../../../src/tauri/dto';

const OUT = new URL('./out/', import.meta.url);

const COMBOS: Array<{ design: 'V001' | 'V002'; motor: DownloadedMotor; flights: string[] }> = [
  { design: 'V001', motor: 'd13w', flights: ['V001-07'] },
  { design: 'V001', motor: 'questC6', flights: ['V001-08', 'V001-09', 'V001-10'] },
  { design: 'V002', motor: 'i140w', flights: ['V002-01'] },
  { design: 'V002', motor: 'j270w', flights: ['V002-02'] },
];

it('qualifies the remaining six flights with the downloaded curves', async () => {
  const { engine, sha256 } = await loadEngine();
  const vehicles = {
    V001: (await reconstructDesign(engine, 'V001')).vehicle,
    V002: (await reconstructDesign(engine, 'V002')).vehicle,
  };
  const stability = {
    V001: engine.call<Record<string, unknown>>('stability', { vehicle: vehicleDto(vehicles.V001) }),
    V002: engine.call<Record<string, unknown>>('stability', { vehicle: vehicleDto(vehicles.V002) }),
  };

  // Spec caveat: the Vulcanite page CG differs from the ORK CG by 34.9 mm.
  // Measured here, not tuned: the apogee sensitivity at 8.8 calibers.
  const v002Base = (await reconstructDesign(engine, 'V002')).withDeclaredFinSeats.vehicle;
  const v002Declared = DESIGNS.V002.declared;
  const v002Motor = loadMotor('i140w').motor;
  const v002CgSensitivity = [-0.0349, 0, 0.0349].map((deltaM) => {
    const shifted = applyDeclaredStageOverride(engine, v002Base, { ...v002Declared, cgM: v002Declared.cgM + deltaM }).vehicle;
    const flight = flyWithMotor(engine, shifted, v002Motor, flightOptions(shifted, APP_DEFAULT_LAUNCH));
    return { deltaM, cgM: v002Declared.cgM + deltaM, apogeeAGL: flight.apogeeAltitude, maxMach: flight.maxMach };
  });

  const rows: unknown[] = [];
  for (const combo of COMBOS) {
    const loaded = loadMotor(combo.motor);
    const vehicle = vehicles[combo.design];
    const options = flightOptions(vehicle, APP_DEFAULT_LAUNCH);
    const nominal = flyWithMotor(engine, vehicle, loaded.motor, options);

    const sample = Array.from({ length: 25 }, (_, i) =>
      ensembleRunWithMotor(engine, vehicle, loaded.motor, options, APP_DEFAULT_MC, i));
    const chunk = engineChunkWithMotor(engine, vehicle, loaded.motor, options, APP_DEFAULT_MC, 0, 25);
    const maxLandingDeltaM = Math.max(...sample.map((run, i) => {
      const endpoint = chunk.runs.find((r) => r.runIndex === i)?.endpoint;
      return endpoint === null || endpoint === undefined
        ? Number.POSITIVE_INFINITY
        : Math.max(Math.abs(run.landing.x - endpoint.x), Math.abs(run.landing.y - endpoint.y));
    }));

    const motor = loaded.motor;
    rows.push({
      design: combo.design,
      flights: combo.flights,
      motorKey: combo.motor,
      file: loaded.file,
      sha256: loaded.sha256,
      thrustcurveMotorId: loaded.motorId,
      dataSource: loaded.source,
      parsed: {
        id: motor.id,
        designation: motor.designation,
        manufacturer: motor.manufacturer,
        diameterM: motor.diameter,
        lengthM: motor.length,
        totalImpulseNs: motor.totalImpulse,
        burnTimeS: motor.burnTime,
        avgThrustN: motor.avgThrust,
        maxThrustN: motor.maxThrust,
        propellantMassKg: motor.propellantMass,
        totalMassKg: motor.totalMass,
        dryMassKg: motor.dryMass,
        points: motor.thrustCurve.length,
        first: motor.thrustCurve[0],
        last: motor.thrustCurve[motor.thrustCurve.length - 1],
      },
      declaredInDesign: combo.design === 'V001'
        ? { diameterM: 0.018, lengthM: 0.07 }
        : { diameterM: 0.038, lengthM: combo.motor === 'j270w' ? 0.3564 : 0.2027 },
      designMatchesDownloadedGeometry: combo.design === 'V001'
        ? Math.abs(motor.diameter - 0.018) < 1e-6 && Math.abs(motor.length - 0.07) < 1e-6
        : Math.abs(motor.diameter - 0.038) < 1e-6
          && Math.abs(motor.length - (combo.motor === 'j270w' ? 0.3564 : 0.2027)) < 1e-6,
      stability: combo.design === 'V001' ? stability.V001 : stability.V002,
      launch: APP_DEFAULT_LAUNCH,
      engineOptions: options,
      nominal: {
        apogeeASL: nominal.apogeeAltitude,
        apogeeAGL: nominal.apogeeAltitude - (vehicle.launchSite?.altitudeM ?? 0),
        apogeeTime: nominal.apogeeTime,
        maxMach: nominal.maxMach,
        validity: nominal.validity,
        terminated: nominal.terminated,
        terminationReason: nominal.terminationReason,
      },
      axialDrag: nominal.runManifest.axialDrag,
      ensembleReplication: {
        runsChecked: sample.length,
        maxLandingDeltaM,
        chunkAxialDrag: chunk.axialDrag,
      },
    });
    expect(maxLandingDeltaM).toBeLessThan(1e-9);
    expect(nominal.maxMach).toBeGreaterThan(0.05);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL('qualify-extra.json', OUT), JSON.stringify({ wasmSha256: sha256, v002CgSensitivity, rows }, null, 2));
});
