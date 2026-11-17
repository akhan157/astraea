/**
 * K3 review, blocking 2: run identity and freshness.
 *
 * A result computed before the built-up default existed has the same vehicle and options as the same
 * design today, so without the drag source in run identity it would read as current although it
 * flew other physics. The default (no drag choice) therefore joins the run key; nothing else moves:
 * an explicit choice already carries itself in the vehicle, and the calibration fit key
 * (`calibrationFitInputKey`) is computed without the marker, so recorded fit identities stay valid.
 */
import { describe, expect, it } from 'vitest';
import { presetOf } from '../state/project';
import { createProjectEnvelope } from '../formats/projectJson';
import { DEFAULT_WORKSPACE } from './workspace';
import { designOf } from '../console/design';
import { resolveRun } from '../console/store';
import { preflight, snapshotCase, snapshotDivergence, freshnessReasonLabel, type LaunchCase } from './caseResolver';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { RocketVehicle } from '../core/types';

function build(choice?: RocketVehicle['flightDragSource']) {
  const preset = presetOf('nasaStudent')!;
  const vehicle = { ...preset.vehicle, ...(choice === undefined ? {} : { flightDragSource: choice }) };
  const workspace = { ...DEFAULT_WORKSPACE, motorId: preset.motorId, launch: { ...DEFAULT_WORKSPACE.launch, ...preset.launch } };
  const project = createProjectEnvelope({ vehicle, workspace, mission: preset.mission });
  const design = designOf(project, preset.mission);
  return { project, design, preset };
}

/** The run key exactly as every build before the default computed it: the case with no marker. */
function keyWithoutMarker(design: ReturnType<typeof designOf>, project: ReturnType<typeof build>['project']): string {
  const l = project.workspace.launch;
  const launchCase: LaunchCase = {
    vehicle: design.vehicle, motorId: design.motorId,
    options: {
      railLengthM: l.railLengthM, railElevationDeg: l.railElevationDeg, railAzimuthDeg: l.railAzimuthDeg,
      windSpeedMps: l.windSpeedMps, windAzimuthDeg: l.windAzimuthDeg, finCantDeg: l.finCantDeg, mainDeployAltitudeM: l.mainDeployAltitudeM,
    },
  };
  return snapshotCase(preflight(launchCase, {})).runKey;
}

describe('the built-up default joins run identity', () => {
  it('a default design no longer has the key a pre-default result of the same design carries', () => {
    const { project, design } = build();
    const current = resolveRun(project, {}, design)!.inputKey;
    expect(current).not.toBe(keyWithoutMarker(design, project));
    // The same design with the default flown is stable run to run.
    expect(resolveRun(project, {}, designOf(project, project.mission))!.inputKey).toBe(current);
  });

  it("explicit 'legacy' and explicit 'calibrated' keys do not move (the vehicle already carries the choice)", () => {
    for (const choice of ['legacy', 'calibrated'] as const) {
      const { project, design } = build(choice);
      expect(resolveRun(project, {}, design)!.inputKey, choice).toBe(keyWithoutMarker(design, project));
    }
  });

  it('the three drag identities are distinct', () => {
    const keys = [undefined, 'legacy', 'calibrated'].map((choice) => {
      const { project, design } = build(choice as RocketVehicle['flightDragSource']);
      return resolveRun(project, {}, design)!.inputKey;
    });
    expect(new Set(keys).size).toBe(3);
  });

  it('the calibration fit identity is computed without the marker, so recorded fit keys stay valid', () => {
    const { project, design } = build();
    expect(design.calibrationFitInputKey).toBe(keyWithoutMarker(design, project));
  });

  it('the divergence names the drag source when only it changed', () => {
    const { project, design } = build();
    const l = project.workspace.launch;
    const launch: LaunchCase = {
      vehicle: design.vehicle, motorId: design.motorId,
      options: {
        railLengthM: l.railLengthM, railElevationDeg: l.railElevationDeg, railAzimuthDeg: l.railAzimuthDeg,
        windSpeedMps: l.windSpeedMps, windAzimuthDeg: l.windAzimuthDeg, finCantDeg: l.finCantDeg, mainDeployAltitudeM: l.mainDeployAltitudeM,
      },
    };
    const before = snapshotCase(preflight(launch, {}));
    const after = snapshotCase(preflight({ ...launch, defaultDragSource: 'built-up' }, {}));
    expect(before.defaultDragSource).toBeNull();
    expect(after.defaultDragSource).toBe('built-up');
    expect(after.mcKey).not.toBe(before.mcKey);
    expect(snapshotDivergence(after, before)).toBe('drag-source');
    expect(freshnessReasonLabel('drag-source')).toMatch(/drag model changed/);
    // Motor catalog sanity: the preset motor resolves from the certified library.
    expect(CERTIFIED_MOTORS[design.motorId]).toBeDefined();
  });
});

describe('K3 review (commit 4): the explicit nozzle off is its own run identity', () => {
  const keyOf = (patch: Partial<RocketVehicle>): string => {
    const preset = presetOf('nasaStudent')!;
    const vehicle = { ...preset.vehicle, nozzleExitDiameter: 0.05, ...patch };
    const workspace = { ...DEFAULT_WORKSPACE, motorId: preset.motorId, launch: { ...DEFAULT_WORKSPACE.launch, ...preset.launch } };
    const project = createProjectEnvelope({ vehicle, workspace, mission: preset.mission });
    return resolveRun(project, {}, designOf(project, preset.mission))!.inputKey;
  };

  it('automatic (absent), explicit off (false) and explicit on (true) are three different identities, each stable', () => {
    const automatic = keyOf({});
    const off = keyOf({ nozzleBackPressureThrust: false });
    const on = keyOf({ nozzleBackPressureThrust: true });
    expect(new Set([automatic, off, on]).size).toBe(3);
    expect(keyOf({ nozzleBackPressureThrust: false })).toBe(off);
    expect(keyOf({})).toBe(automatic);
  });

  it('under each explicit drag choice the flag states (absent, false, true) are distinct identities, and the choices differ from each other and from the default', () => {
    // the vehicle field keys the case, so even states that fly the same physics (absent and false send no nozzle
    // under an explicit choice) are different cases; `true` sends the nozzle, so it differs in physics too
    const states: Array<Partial<RocketVehicle>> = [{}, { nozzleBackPressureThrust: false }, { nozzleBackPressureThrust: true }];
    const all = new Set<string>();
    for (const choice of [undefined, 'legacy', 'calibrated'] as const) {
      const keys = states.map((flag) => keyOf({ ...flag, ...(choice === undefined ? {} : { flightDragSource: choice }) }));
      expect(new Set(keys).size, `flag states under ${String(choice)}`).toBe(3);
      for (const k of keys) all.add(k);
    }
    expect(all.size).toBe(9); // no key is shared between any drag choice and flag state
  });
});
