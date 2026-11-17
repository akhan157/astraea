/**
 * K3: the drag choice on the vehicle.
 *
 *  - absent        the default: built-up drag (and, when the design declares a
 *                  nozzle exit, the back-pressure option; spec Amendment 4)
 *  - 'calibrated'  the old explicit opt-in, unchanged (the nozzle option still
 *                  needs `nozzleBackPressureThrust`; a selection is still required)
 *  - 'legacy'      the explicit old choice: the legacy tables, no drag option
 *
 * Commit 1 pinned 'legacy' == absent (when absent still meant legacy). Commit 2
 * switches the default, so those equalities now hold between 'legacy' and the
 * pre-switch derivation, and absent is checked against the new default.
 */
import { describe, expect, it } from 'vitest';
import type { RocketVehicle } from '../core/types';
import { presetOf } from '../state/project';
import { createProjectEnvelope, readProject, writeProject } from '../formats/projectJson';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { captureRunInputs } from './runInputs';
import { effectiveFlightDragSource, flightRunOptions, physicsOptionsOf, preSwitchFlightRunOptions } from './caseResolver';
import { flightAdmissionRefusal, legacyAeroModelFlightRefusalText, builtUpDragRefusalText } from './flightAdmission';
import { AERO_MODEL_VERSION, type AeroModelSelection } from './aeroModel';
import { aeroConfidence, flightAeroConfidence } from '../console/data/adapter';
import { candidatePreflight } from './candidate';
import { CANDIDATE_VEHICLE, candidateMotorRecord, candidateProject, candidateSelection } from './candidate.fixture';

const SELECTION: AeroModelSelection = {
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION,
  terms: { transonic: 'legacy' },
};

function vehicleWith(choice: RocketVehicle['flightDragSource'], patch?: (v: RocketVehicle) => void): RocketVehicle {
  const vehicle = presetOf('estesAlpha')!.vehicle;
  vehicle.launchSite = { altitudeM: 400, temperatureC: 30 };
  if (choice !== undefined) vehicle.flightDragSource = choice;
  patch?.(vehicle);
  return vehicle;
}

describe('the default and the explicit drag choices', () => {
  it('derives the drag option from the choice', () => {
    expect(effectiveFlightDragSource(vehicleWith(undefined))).toBe('calibrated');
    expect(effectiveFlightDragSource(vehicleWith('calibrated'))).toBe('calibrated');
    expect(effectiveFlightDragSource(vehicleWith('legacy'))).toBeUndefined();
    expect(flightRunOptions(vehicleWith(undefined)).flightDragSource).toBe('calibrated');
    expect(flightRunOptions(vehicleWith('legacy'))).not.toHaveProperty('flightDragSource');
    expect(physicsOptionsOf(vehicleWith('legacy'))).toStrictEqual({ launchSiteTemperatureC: 30 });
    expect(physicsOptionsOf(vehicleWith(undefined))).toStrictEqual({ launchSiteTemperatureC: 30, flightDragSource: 'calibrated' });
  });

  it("'legacy' sends exactly what an absent field sent before the switch", () => {
    for (const patch of [undefined, (v: RocketVehicle) => { v.nozzleExitDiameter = 0.05; }]) {
      expect(flightRunOptions(vehicleWith('legacy', patch))).toStrictEqual(preSwitchFlightRunOptions(vehicleWith(undefined, patch)));
    }
  });

  it('carries a declared nozzle exit only under the default (spec Amendment 4), never for an explicit choice', () => {
    const nozzle = (v: RocketVehicle): void => { v.nozzleExitDiameter = 0.05; };
    expect(flightRunOptions(vehicleWith(undefined, nozzle)).nozzleExitDiameter).toBe(0.05);
    expect(flightRunOptions(vehicleWith(undefined)).nozzleExitDiameter).toBeUndefined();
    expect(flightRunOptions(vehicleWith('calibrated', nozzle)).nozzleExitDiameter).toBeUndefined();
    expect(flightRunOptions(vehicleWith('legacy', nozzle)).nozzleExitDiameter).toBeUndefined();
    // The back-pressure flag keeps working for every choice.
    const flagged = (v: RocketVehicle): void => { nozzle(v); v.nozzleBackPressureThrust = true; };
    for (const choice of [undefined, 'calibrated', 'legacy'] as const) {
      expect(flightRunOptions(vehicleWith(choice, flagged)).nozzleExitDiameter).toBe(0.05);
    }
  });

  it('blank inputs send nothing extra: no temperature, nozzle option or tip radius is invented', () => {
    const blank = presetOf('nasaStudent')!.vehicle;
    expect(flightRunOptions(blank)).toStrictEqual({ flightDragSource: 'calibrated' });
  });

  it('admission: the default needs no selection; the explicit choices keep their rules', () => {
    for (const selection of [undefined, SELECTION]) expect(flightAdmissionRefusal(vehicleWith(undefined), selection)).toBeNull();
    expect(flightAdmissionRefusal(vehicleWith('legacy'), undefined)).toBeNull();
    expect(flightAdmissionRefusal(vehicleWith('legacy'), SELECTION)).toBe(legacyAeroModelFlightRefusalText(SELECTION));
    expect(flightAdmissionRefusal(vehicleWith('calibrated'), undefined)).toBe(builtUpDragRefusalText(undefined));
    expect(flightAdmissionRefusal(vehicleWith('calibrated'), SELECTION)).toBeNull();
  });

  it('describes a legacy choice as legacy drag and the default as built-up drag', () => {
    expect(flightAeroConfidence(vehicleWith('legacy'), undefined, undefined, undefined))
      .toStrictEqual(aeroConfidence(undefined, undefined));
    expect(flightAeroConfidence(vehicleWith(undefined), undefined, undefined, undefined).reason).toContain('Built-up flight drag');
  });

  it('round-trips through the project file and rejects any other value', () => {
    const project = createProjectEnvelope({ vehicle: vehicleWith('legacy') });
    expect(readProject(writeProject(project)).vehicle.flightDragSource).toBe('legacy');
    // The default is the absent field: nothing new is written for it.
    expect(writeProject(createProjectEnvelope({ vehicle: vehicleWith(undefined) }))).not.toContain('flightDragSource');
    const doc = JSON.parse(writeProject(createProjectEnvelope({ vehicle: vehicleWith(undefined) }))) as { vehicle: Record<string, unknown> };
    doc.vehicle.flightDragSource = 'other';
    expect(() => readProject(JSON.stringify(doc))).toThrow(/flightDragSource must be 'calibrated' or 'legacy'/);
  });

  it('the candidate model refuses only the explicit opt-in, not the default or legacy', () => {
    const issues = (choice: RocketVehicle['flightDragSource']): string[] => {
      const vehicle = structuredClone(CANDIDATE_VEHICLE) as RocketVehicle;
      if (choice !== undefined) vehicle.flightDragSource = choice;
      return candidatePreflight(vehicle, candidateSelection(), candidateMotorRecord().motor, candidateProject().workspace.launch)
        .map((issue) => issue.message);
    };
    const refusal = 'The candidate model does not model built-up flight drag. Turn it off, or switch to the legacy flight model.';
    expect(issues('legacy')).not.toContain(refusal);
    expect(issues(undefined)).not.toContain(refusal);
    expect(issues('calibrated')).toContain(refusal);
  });
});

describe('recorded runs are never rewritten (archive eras)', () => {
  const motorRecord = { id: 'estes_c6', motor: CERTIFIED_MOTORS.estes_c6, provenance: { source: 'certified' as const } };

  /** A saved flight whose inputs were captured from this vehicle by the CURRENT build. */
  function saved(vehicle: RocketVehicle, mutate?: (doc: Record<string, any>) => void): string {
    const project = createProjectEnvelope({ vehicle, motorRecords: [motorRecord] });
    const inputs = captureRunInputs(project, motorRecord, 'key', undefined);
    const doc = JSON.parse(writeProject(project)) as Record<string, any>;
    doc.cases = [{
      id: 'case-1', kind: 'flight', createdAt: '2026-11-15T00:00:00.000Z', motorRecordId: 'estes_c6',
      inputs: structuredClone(inputs), summary: { inputKey: 'key' },
    }];
    mutate?.(doc);
    return JSON.stringify(doc);
  }

  it("a 'legacy' run archives no drag option and no drag line", () => {
    const text = saved(vehicleWith('legacy'));
    expect(JSON.parse(text).cases[0].inputs.engineOptions).not.toHaveProperty('flightDragSource');
    expect(readProject(text).cases[0].inputs).toMatchObject({ vehicle: { flightDragSource: 'legacy' } });
    const withLine = saved(vehicleWith('legacy'), (d) => { d.cases[0].summary.axialDrag = 'legacy 25-station Mach drag tables'; });
    expect(() => readProject(withLine)).toThrow(/axialDrag requires archived inputs/);
  });

  it('a default-era run archives the option it sent and needs its drag line', () => {
    const line = 'calibrated build-up axial drag; not a validated model';
    const ok = saved(vehicleWith(undefined, (v) => { v.nozzleExitDiameter = 0.05; }), (d) => { d.cases[0].summary.axialDrag = line; });
    const inputs = readProject(ok).cases[0].inputs as any;
    expect(inputs.vehicle.flightDragSource).toBeUndefined();
    expect(inputs.engineOptions).toMatchObject({ flightDragSource: 'calibrated', nozzleExitDiameter: 0.05, launchSiteTemperatureC: 30 });
    expect(() => readProject(saved(vehicleWith(undefined)))).toThrow(/axialDrag is missing/);
    // Option and vehicle must still agree: a stripped nozzle option under a default-era run is refused.
    const stripped = saved(vehicleWith(undefined, (v) => { v.nozzleExitDiameter = 0.05; }), (d) => {
      d.cases[0].summary.axialDrag = line; delete d.cases[0].inputs.engineOptions.nozzleExitDiameter;
    });
    expect(() => readProject(stripped)).toThrow(/nozzleExitDiameter is missing/);
  });

  it('a pre-switch run (no drag option under an absent vehicle field) still loads exactly as recorded', () => {
    // What an earlier build archived: no drag option, and the nozzle option only with the flag.
    const old = vehicleWith(undefined, (v) => { v.nozzleExitDiameter = 0.05; });
    const text = saved(old, (d) => { delete d.cases[0].inputs.engineOptions.flightDragSource; delete d.cases[0].inputs.engineOptions.nozzleExitDiameter; });
    const inputs = readProject(text).cases[0].inputs as any;
    expect(inputs.engineOptions).not.toHaveProperty('flightDragSource');
    expect(inputs.engineOptions).not.toHaveProperty('nozzleExitDiameter');
    expect(readProject(text).cases[0].summary?.axialDrag).toBeUndefined();
    // ...but an option that no derivation produces is still refused.
    const bogus = saved(old, (d) => { delete d.cases[0].inputs.engineOptions.flightDragSource; d.cases[0].inputs.engineOptions.nozzleExitDiameter = 0.05; });
    expect(() => readProject(bogus)).toThrow(/nozzleExitDiameter is not derived/);
  });
});
