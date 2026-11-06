import { describe, expect, it } from 'vitest';
import {
  assertCandidateRequestConsistent, buildCandidateRequest, candidateInputKey, candidatePreflight,
  declarationVehicleSha256, deriveMotorStation, parseCandidateRequest,
} from './candidate';
import {
  CANDIDATE_VEHICLE, candidateDerivation, candidateMotorRecord, candidateProject, candidateRequest,
  candidateRollup, candidateSelection,
} from './candidate.fixture';
import { parseCandidateFlightModel } from './flightModel';

const launch = candidateProject().workspace.launch;
const motor = candidateMotorRecord().motor;

describe('explicit candidate application contract', () => {
  it('accepts the synthetic supported geometry and refuses a flagged motor mount', () => {
    expect(candidatePreflight(CANDIDATE_VEHICLE, candidateSelection(), motor, launch)).toEqual([]);
    const flagged = structuredClone(CANDIDATE_VEHICLE);
    const flaggedMount = flagged.components.find((component) => component.id === 'syn-tube');
    if (!flaggedMount || flaggedMount.type !== 'bodytube') throw new Error('fixture mount missing');
    flaggedMount.isMotorMount = true;
    flaggedMount.assignedMotorId = 'estes_c6';
    // The refusal is only meaningful while the request still declares the flag:
    // dropping it from the DTO would silently change the engine's geometry.
    expect(buildCandidateRequest(flagged, motor, candidateSelection(), launch, candidateDerivation())
      .vehicle.components.find((component) => component.id === 'syn-tube')).toMatchObject({
      isMotorMount: true, assignedMotorId: 'estes_c6',
    });
    const issues = candidatePreflight(flagged, candidateSelection(), motor, launch);
    expect(issues.some((issue) => issue.code === 'mount-topology')).toBe(true);
  });

  it('refuses unsupported nose profiles and interpretations instead of simplifying them', () => {
    const ogive = structuredClone(CANDIDATE_VEHICLE);
    const nose = ogive.components.find((component) => component.id === 'syn-nose');
    if (!nose || nose.type !== 'nosecone') throw new Error('fixture nose missing');
    nose.shape = 'ogive';
    expect(candidatePreflight(ogive, candidateSelection(), motor, launch).some((issue) => issue.code === 'nose')).toBe(true);
    const tangent = parseCandidateFlightModel({ ...candidateSelection(), ogiveInterpretation: 'tangentOgive' });
    expect(candidatePreflight(ogive, tangent, motor, launch).some((issue) => issue.code === 'nose')).toBe(false);
  });

  it('rejects inconsistent launch inputs and unknown request fields', () => {
    const project = candidateProject();
    const derivation = candidateDerivation();
    const request = candidateRequest();
    const tampered = structuredClone(request);
    tampered.launch.timeStepS = 0.02;
    expect(() => assertCandidateRequestConsistent(tampered, project.vehicle, project.motorRecords[0].motor,
      candidateSelection(), launch, derivation)).toThrow(/launch disagrees/);
    const extra = structuredClone(request) as unknown as Record<string, unknown>;
    extra.schemaId = 'forbidden';
    expect(() => parseCandidateRequest(extra)).toThrow(/must declare exactly/);
  });

  it('refuses to derive a station for a flagged mount', () => {
    const flagged = structuredClone(CANDIDATE_VEHICLE);
    const mount = flagged.components.find((component) => component.id === 'syn-tube');
    if (!mount || mount.type !== 'bodytube') throw new Error('fixture mount missing');
    mount.isMotorMount = true;
    expect(() => deriveMotorStation(flagged, candidateRollup())).toThrow(/topology ambiguous/);
  });

  it('binds the declaration to the exact vehicle DTO and changes with the axial declaration', async () => {
    const first = await declarationVehicleSha256(CANDIDATE_VEHICLE);
    const changed = structuredClone(CANDIDATE_VEHICLE);
    changed.components[1].materialId = 'aluminum';
    const second = await declarationVehicleSha256(changed);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    const base = candidateInputKey(CANDIDATE_VEHICLE, motor, candidateSelection(), launch);
    const zero = parseCandidateFlightModel({ ...candidateSelection(), axial: { ...candidateSelection().axial, ca0: 0 } });
    expect(candidateInputKey(CANDIDATE_VEHICLE, motor, zero, launch)).not.toBe(base);
  });

});
