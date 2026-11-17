/**
 * Physics-option identity and dispatch goldens (accuracy bundle, Gate 1 §3).
 *
 * What this pins, and why it is engine-independent: the run key, the vehicle
 * key, the options key, the calibration fit key, the saved document bytes and
 * the dispatched request are all built by the app itself. `runKey`/`vehicleContentKey`/
 * `optionsKey`/`calibrationFitInputKey` and the saved-document hash below were
 * captured on the base commit (`9adfd96`) before this lane's first source edit;
 * the new-input rows were captured from this lane's own dispatch and are exact
 * canonical strings, not flight numbers, so an engine swap cannot move them.
 *
 * The request assertions compare the canonical JSON of the options object the
 * bridge handed the engine. A leaked key changes the string, so a default run
 * cannot silently start sending a new option.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { presetOf } from '../state/project';
import { createProjectEnvelope, writeProject } from '../formats/projectJson';
import { DEFAULT_WORKSPACE } from '../application/workspace';
import { designOf } from '../console/design';
import { sixDofOptions } from '../console/data/adapter';
import {
  flightRunOptions,
  hashHex,
  preflight,
  snapshotCase,
  stableStringify,
} from '../application/caseResolver';
import { setTestEngine, type EngineInvoke } from '../engine';
import { simulateFlight, previewFlight } from '../tauri/bridge';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { RocketVehicle } from '../core/types';

afterEach(() => setTestEngine(null));

/** The NASA Student Launch template as `loadPreset` opens it. */
function nasaProject() {
  const preset = presetOf('nasaStudent');
  if (preset === null) throw new Error('nasaStudent preset missing');
  const workspace = {
    ...DEFAULT_WORKSPACE,
    motorId: preset.motorId,
    launch: { ...DEFAULT_WORKSPACE.launch, ...preset.launch },
  };
  return createProjectEnvelope({ vehicle: preset.vehicle, workspace, mission: preset.mission });
}

function keysFor(patch: (vehicle: RocketVehicle) => void) {
  const project = nasaProject();
  patch(project.vehicle);
  const design = designOf(project, project.mission);
  const launch = {
    railLengthM: design.options.railLength,
    railElevationDeg: design.options.railElevationDeg,
    railAzimuthDeg: design.options.railAzimuthDeg,
    windSpeedMps: design.options.windSpeedSurface,
    windAzimuthDeg: design.options.windAzimuthDeg,
    finCantDeg: design.options.finCantAngleDeg,
    mainDeployAltitudeM: design.options.mainDeployAltitudeAGL,
  };
  const resolved = preflight(
    { vehicle: project.vehicle, motorId: design.motorId, options: launch },
    design.motors ?? {},
  );
  const snapshot = snapshotCase(resolved);
  return {
    runKey: snapshot.runKey,
    vehicleContentKey: snapshot.vehicleContentKey,
    optionsKey: snapshot.optionsKey,
    fitKey: design.calibrationFitInputKey,
    document: writeProject(project),
  };
}

const noop = (): void => {};

async function dispatched(vehicle: RocketVehicle): Promise<{ options: string; vehicle: Record<string, unknown> }> {
  const seen: Array<{ cmd: string; args: Record<string, unknown> }> = [];
  setTestEngine((async (cmd: string, args?: Record<string, unknown>) => {
    seen.push({ cmd, args: args ?? {} });
    return {
      apogeeAltitude: 1, apogeeTime: 1, apogeePosition: { x: 0, y: 0, z: 0 }, maxVelocity: 1, maxMach: 0.1,
      maxAccelerationG: 1, burnoutAltitude: 1, burnoutVelocity: 1, burnoutTime: 1, railExitVelocity: 1,
      isRailExitSafe: true, weathercockAngleDeg: 0, landingPosition: { x: 0, y: 0, z: 0 }, landingDistance: 0,
      landingVelocity: 1, landingKineticEnergy: 1, isLandingSafe: true, isLandingVelocitySafe: true,
      terminated: true, terminationReason: 'touchdown', touchdownNominal: true, unsupportedHandling: 'documented',
      runManifest: {}, landingMass: 1, flightDuration: 1, validity: 'PASS', enveloped: true,
      offNominalExcursion: false, events: [], telemetry: [],
    } as never;
  }) as EngineInvoke);
  const preset = presetOf('nasaStudent');
  if (preset === null) throw new Error('nasaStudent preset missing');
  const options = sixDofOptions(designOf(nasaProject(), preset.mission).options);
  await simulateFlight(vehicle, CERTIFIED_MOTORS[preset.motorId], options);
  await previewFlight(vehicle, CERTIFIED_MOTORS[preset.motorId], options);
  return {
    options: stableStringify(seen[0].args.options as object),
    vehicle: seen[0].args.vehicle as Record<string, unknown>,
  };
}

describe('physics-option identity goldens', () => {
  it('keeps the base keys, the base document and the base request byte-identical with no new input', async () => {
    const baseline = keysFor(noop);
    // Captured on 9adfd96 through the app's own launch-case shape (Gate 1 §3.2
    // corrected: the run key equals the fit key when no calibration/aero model
    // is applied, and the probe's options shape does not change it).
    expect(baseline.runKey).toBe('251f2461');
    expect(baseline.vehicleContentKey).toBe('796df073');
    expect(baseline.optionsKey).toBe('bca5dc93');
    expect(baseline.fitKey).toBe('251f2461');
    expect(hashHex(baseline.document)).toBe('cc6cd1ce');
    expect(baseline.document).toHaveLength(3723);

    // K3: the base request is now the one the explicit legacy choice sends; the golden
    // string and hash are unchanged. (An absent field now means the built-up default.)
    const request = await dispatched({ ...nasaProject().vehicle, flightDragSource: 'legacy' });
    expect(request.options).toBe(
      '{"finCantAngleDeg":0,"mainDeployAltitudeAGL":213,"railAzimuthDeg":0,"railElevationDeg":85,'
      + '"railLength":3.66,"windAzimuthDeg":0,"windSpeedSurface":3}',
    );
    expect(hashHex(request.options)).toBe('cbdf481f');
    // The vehicle DTO carries no app-side opt-in (amendment 1).
    expect(request.vehicle).not.toHaveProperty('nozzleBackPressureThrust');
    expect(request.vehicle).not.toHaveProperty('flightDragSource');
  });

  it('default: the same template with no drag choice adds exactly one option, the built-up drag source', async () => {
    const request = await dispatched(nasaProject().vehicle);
    expect(request.options).toBe(
      '{"finCantAngleDeg":0,"flightDragSource":"calibrated","mainDeployAltitudeAGL":213,"railAzimuthDeg":0,'
      + '"railElevationDeg":85,"railLength":3.66,"windAzimuthDeg":0,"windSpeedSurface":3}',
    );
    // The saved document of the unchanged template is byte-identical: the default writes nothing new.
    expect(hashHex(keysFor(noop).document)).toBe('cc6cd1ce');
    expect(request.vehicle).not.toHaveProperty('flightDragSource');
  });

  it('moves the run, vehicle and fit keys for a site temperature and leaves the options key alone', () => {
    const k = keysFor((v) => { v.launchSite = { altitudeM: 0, temperatureC: 30 }; });
    // Gate 1 §3.2 (vehicle/fit columns) with the run-key column corrected to
    // the app's launch-case shape; all captured on 9adfd96 with the fields cast in.
    expect(k.runKey).toBe('6ed98594');
    expect(k.vehicleContentKey).toBe('4d9d968a');
    expect(k.optionsKey).toBe('bca5dc93');
    expect(k.fitKey).toBe('6ed98594');
    // K3: the old expectation holds for the explicit legacy choice; the default adds the drag option.
    const site = { altitudeM: 0, temperatureC: 30 };
    expect(flightRunOptions({ ...nasaProject().vehicle, flightDragSource: 'legacy', launchSite: site }))
      .toEqual({ launchAltitudeASL: 0, launchSiteTemperatureC: 30 });
    expect(flightRunOptions({ ...nasaProject().vehicle, launchSite: site }))
      .toEqual({ launchAltitudeASL: 0, launchSiteTemperatureC: 30, flightDragSource: 'calibrated' });
  });

  it('keeps a nozzle declared for the aero method out of the flight request', async () => {
    // K3: "kept out of the request" now holds for an explicit drag choice; under the
    // default a declared nozzle exit is carried (spec Amendment 4), asserted below.
    const vehicle = { ...nasaProject().vehicle, nozzleExitDiameter: 0.05, flightDragSource: 'legacy' as const };
    const k = keysFor(noop);
    expect(k.runKey).toBe('251f2461');
    // Declaring a nozzle already moves the vehicle key (pre-existing behaviour, Gate 1 §3.2 row 3).
    const nozzleOnly = keysFor((v) => { v.nozzleExitDiameter = 0.05; });
    expect(nozzleOnly.runKey).toBe('20eb9b51');
    expect(nozzleOnly.vehicleContentKey).toBe('c24474d3');
    expect(nozzleOnly.fitKey).toBe('20eb9b51');
    const request = await dispatched(vehicle);
    expect(request.options).not.toContain('nozzleExitDiameter');
    expect(request.vehicle.nozzleExitDiameter).toBe(0.05);
  });

  it('default: a declared nozzle exit is sent as the back-pressure option', async () => {
    const request = await dispatched({ ...nasaProject().vehicle, nozzleExitDiameter: 0.05 });
    expect(request.options).toBe(
      '{"finCantAngleDeg":0,"flightDragSource":"calibrated","mainDeployAltitudeAGL":213,"nozzleExitDiameter":0.05,'
      + '"railAzimuthDeg":0,"railElevationDeg":85,"railLength":3.66,"windAzimuthDeg":0,"windSpeedSurface":3}',
    );
  });

  it('moves the keys for the back-pressure opt-in without changing the flight request shape elsewhere', () => {
    const k = keysFor((v) => { v.nozzleExitDiameter = 0.05; v.nozzleBackPressureThrust = true; });
    expect(k.runKey).toBe('0fd48d2d');
    expect(k.vehicleContentKey).toBe('cd944177');
    expect(k.fitKey).toBe('0fd48d2d');
  });

  it('sends the back-pressure diameter with the explicit opt-in (explicit legacy choice, as before the K3 switch)', async () => {
    const request = await dispatched({
      ...nasaProject().vehicle,
      flightDragSource: 'legacy',
      nozzleExitDiameter: 0.05,
      nozzleBackPressureThrust: true,
    });
    expect(request.options).toBe(
      '{"finCantAngleDeg":0,"mainDeployAltitudeAGL":213,"nozzleExitDiameter":0.05,"railAzimuthDeg":0,'
      + '"railElevationDeg":85,"railLength":3.66,"windAzimuthDeg":0,"windSpeedSurface":3}',
    );
  });
});
