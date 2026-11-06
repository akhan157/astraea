/** Deterministic synthetic candidate fixture. Not a measured vehicle or result. */
import type { RocketVehicle } from '../core/types';
import type { VehicleMassRollup } from '../core/mass';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { MotorRecord } from '../formats/projectJson';
import { createProjectEnvelope } from '../formats/projectJson';
import { CANDIDATE_DEFAULTS, buildCandidateRequest, deriveMotorStation, type CandidateMotorDerivation, type NativeCandidateRequest } from './candidate';
import { CANDIDATE_FLIGHT_MODEL, parseCandidateFlightModel, type CandidateFlightModelSelection } from './flightModel';
import { candidateResultFromReport, type CandidateResultArchive } from './candidateResult';
import type { EngineIdentity } from '../engine/identity';

export const CANDIDATE_VEHICLE: RocketVehicle = {
  id: 'fixture-candidate', name: 'Synthetic candidate fixture (not as flown)', version: '1.0',
  author: 'synthetic fixture',
  components: [
    { id: 'syn-nose', name: 'Synthetic conical nose', type: 'nosecone', materialId: 'pla_3dprint',
      shape: 'conical', length: 0.3, baseDiameter: 0.1, wallThickness: 0.001, isHollow: true },
    { id: 'syn-tube', name: 'Synthetic body tube', type: 'bodytube', materialId: 'cardboard',
      length: 0.7, outerDiameter: 0.1, innerDiameter: 0.099 },
    { id: 'syn-fins', name: 'Synthetic four-fin set', type: 'trapezoidfinset', materialId: 'pla_3dprint',
      finCount: 4, rootChord: 0.2, tipChord: 0.1, span: 0.08, sweepLength: 0.05,
      thickness: 0.0008, crossSection: 'rounded', axialOffset: 0.4 },
    { id: 'syn-drogue', name: 'Synthetic drogue', type: 'parachute', materialId: 'cardboard',
      diameter: 0.3, cd: 0.8, mass: 0.008, axialOffset: 0.05 },
    { id: 'syn-main', name: 'Synthetic main', type: 'parachute', materialId: 'cardboard',
      diameter: 0.45, cd: 0.8, mass: 0.008, axialOffset: 0.08 },
  ],
};

export function candidateMotorRecord(): MotorRecord {
  return { id: 'estes_c6', motor: structuredClone(CERTIFIED_MOTORS.estes_c6), provenance: { source: 'import' } };
}

export function candidateRollup(): VehicleMassRollup {
  return {
    totalMass: 0.05, cg: 0.3, totalLength: 1, maxDiameter: 0.1, referenceDiameter: 0.1,
    components: [
      { id: 'syn-nose', mass: 0.01, localCG: 0.15, globalCG: 0.15, axialStart: 0, axialEnd: 0.3, length: 0.3 },
      { id: 'syn-tube', mass: 0.03, localCG: 0.35, globalCG: 0.65, axialStart: 0.3, axialEnd: 1, length: 0.7 },
      { id: 'syn-drogue', mass: 0.008, localCG: 0.025, globalCG: 0.375, axialStart: 0.35, axialEnd: 0.4, length: 0.05 },
    ],
  };
}

export function candidateSelection(): CandidateFlightModelSelection {
  return parseCandidateFlightModel({
    ...CANDIDATE_FLIGHT_MODEL,
    axial: { ca0: 0.35, providerId: 'fixture-prescribed-CA0', inputIdentity: 'coast; prescribed CA0 0.35; synthetic fixture declaration, not a source export' },
    declarations: {
      provenance: 'Synthetic candidate fixture declarations; no measurement implied.',
      sharpPhysicalTip: true, circularAxisymmetricBody: true, smoothSlenderProfile: true,
      identicalEquallySpacedThinUncantedFins: true, noOtherExternalFeaturesOrUnmodeledInterferences: true,
      sourceRepresentsCompleteExternalGeometry: true,
    },
    ogiveInterpretation: null,
    transitionInterpretation: null,
    quadrature: { ...CANDIDATE_DEFAULTS.quadrature },
    declarationVehicleSha256: 'a'.repeat(64),
    declaredAt: '2026-10-29T00:00:00.000Z',
    horizonSeconds: 0.1,
    timeStepS: 0.01,
    curveMachs: [0.1],
  });
}

export function candidateSelectionWithSha(sha256: string): CandidateFlightModelSelection {
  return parseCandidateFlightModel({ ...candidateSelection(), declarationVehicleSha256: sha256 });
}

export function candidateProject() {
  return createProjectEnvelope({
    vehicle: structuredClone(CANDIDATE_VEHICLE),
    flightModel: candidateSelection(),
    motorRecords: [candidateMotorRecord()],
  });
}

export function candidateProjectWithSha(sha256: string) {
  return createProjectEnvelope({
    vehicle: structuredClone(CANDIDATE_VEHICLE),
    flightModel: candidateSelectionWithSha(sha256),
    motorRecords: [candidateMotorRecord()],
  });
}

export function candidateDerivation(): CandidateMotorDerivation {
  return deriveMotorStation(CANDIDATE_VEHICLE, candidateRollup());
}

export function candidateRequest(): NativeCandidateRequest {
  const project = candidateProject();
  return buildCandidateRequest(project.vehicle, project.motorRecords[0].motor, candidateSelection(), project.workspace.launch, candidateDerivation());
}

export const CANDIDATE_ENGINE_IDENTITY: EngineIdentity = Object.freeze({ kind: 'production-rust-wasm', sha256: 'e'.repeat(64) });

const FLAGS = { drogueDeployed: false, mainDeployed: false, railBound: false };
const STATE = { positionM: [0, 0, 10], velocityMps: [0, 0, 20], quaternionWxyz: [1, 0, 0, 0], omegaRadps: [0, 0, 0] };
const MECHANICS = { massKg: 0.05, cgFromNoseM: 0.3, densityKgM3: 1.2, speedOfSoundMps: 340, airspeedMps: 20,
  mach: 0.1, dynamicPressurePa: 240, thrustN: 0, windNMps: [0, 0, 0], referenceAreaM2: 0.007853981633974483,
  referenceLengthM: 0.1 };
const NEGLIGIBILITY = { policyId: 'candidate-aero-negligibility/1.0.0', relativeBound: 1e-6, maxPossibleForceN: 0,
  weightN: 0.4903325, isNegligible: true };

/** Minimal exact report shape; null CP/flow/landing are deliberate. */
export function candidateReport(): Record<string, unknown> {
  const request = candidateRequest();
  const sample = {
    origin: 'last-committed-sample', timeS: 0.1, flags: FLAGS,
    applicability: 'AirframeStaticRateComposition', computationalStatus: 'Supported',
    state: STATE, mechanics: MECHANICS, flow: null,
    coefficients: { datum: null, cg: null }, windCoefficients: null, normalDerivatives: null, cp: null,
    staticForceBodyN: [0, 0, 0], staticMomentCgBodyNm: [0, 0, 0], rateMomentBodyNm: [0, 0, 0],
    canopyDragBodyN: null, aeroForceBodyN: [0, 0, 0], aeroMomentCgBodyNm: [0, 0, 0],
    dragAlongWindN: 0, aeroNegligibility: NEGLIGIBILITY,
    unavailable: [{ quantity: 'flow_angles', reason: 'undefined at exactly zero airspeed' }],
  };
  const curve = {
    mach: 0.1, computationalStatus: 'Supported', dynamicPressurePa: 240, flow: null,
    coefficients: { datum: null, cg: null }, windCoefficients: null, normalDerivatives: null, cp: null,
    staticForceBodyN: [0, 0, 0], staticMomentCgBodyNm: [0, 0, 0], aeroNegligibility: NEGLIGIBILITY, unavailable: [],
  };
  const retained = {
    timeS: 0.1, positionM: [0, 0, 10], velocityMps: [0, 0, 20], flags: FLAGS,
    computationalStatus: 'Supported', mach: 0.058823529411764705, dynamicPressurePa: 240, flow: null, unavailable: [],
  };
  return {
    schemaId: 'astraea-native-candidate-report/3.0.0',
    status: 'experimental-unqualified',
    resultSchemaId: 'astraea-bounded-candidate-result/1.0.0',
    compositionId: 'candidate-static-rate-composition/1.0.0',
    trajectory: {
      schemaId: 'astraea-bounded-candidate-result/1.0.0',
      termination: 'TimeLimit', computationalCompletion: 'CompletedRequestedHorizon',
      empiricalQualification: 'Unqualified', dynamicQualification: 'Unknown',
      requestedHorizonS: 0.1, finalTimeS: 0.1, finalState: STATE, finalFlags: FLAGS,
      landing: null, apogeeEvent: null,
      observedPrefix: { samplingPolicyId: 'committed-macro-samples/1.0.0', sampleCount: 2,
        maxAltitudeAglM: 10, maxAltitudeTimeS: 0.1, maxAirspeedMps: 20, maxAirspeedTimeS: 0.1,
        maxDynamicPressurePa: 240, maxDynamicPressureTimeS: 0.1, note: 'observed prefix only; not a predicted apogee' },
      samples: [{ ...retained, timeS: 0, positionM: [0, 0, 0], velocityMps: [0, 0, 0], mach: 0, dynamicPressurePa: 0, flow: null }, retained],
      retention: { policyId: 'candidate-archive-display-samples/1.0.0', mode: 'reportBounded',
        sampleCount: 2, retainedSampleCount: 2,
        collectionCapId: 'candidate-committed-sample-collection-cap/1.0.0', collectionCap: 50000 },
    },
    query: { origin: 'last-committed-sample', timeS: 0.1, sample },
    curves: { status: 'computed', policyId: 'candidate-curve-applicability/1.0.0',
      requestedMachs: [0.1], referenceMachAddedForEquivalence: false, notApplicable: null, points: [curve] },
    equivalence: { referenceSampleTimeS: 0.1, referenceMach: 0.1,
      queryMatchesReferenceSample: true,
      curveComparison: { status: 'compared', matchesReferenceSample: true, reasonId: null },
      compared: 'static coefficient wrenches at datum and CG (f64 bits)', note: 'same prepared object' },
    geometry: { identity: `frontend-external-profile-SB1/1.0.0:${request.adapter.sourceIdentity}`, areaM2: 0.007853981633974483,
      lengthM: 0.1, diameterM: 0.1, bodyLengthM: 1 },
    mechanical: { dryMassKg: 0.05, cgFromNoseM: 0.3, totalLengthM: 1, referenceDiameterM: 0.1,
      motorAftStationFromNoseM: 1, motorDesignation: 'Estes C6', drogue: null, main: null,
      legacyCarrierFields: 'NaN-poisoned; not consulted' },
    environment: { launchAltitudeASL: request.environment.launchAltitudeASL,
      windSpeedSurfaceMps: request.environment.windSpeedSurfaceMps,
      windAzimuthDeg: request.environment.windAzimuthDeg,
      environmentSourceId: request.environmentSourceId },
    identities: {
      compositionId: 'candidate-static-rate-composition/1.0.0', staticProviderId: 'static-body-total-SB1/1.0.0',
      rateModelId: 'legacy-dimensional-rate-couple/1.0.0', environmentModelId: 'legacy-isa1976-powerlaw-wind/1.0.0',
      mechanicalModelId: 'legacy-primitive-mass-inertia/1.0.0', supportPolicyId: 'sb1-candidate-support/1.0.0',
      calibrationPolicyId: 'no-historical-calibration/1.0.0', canopyModelId: 'declared-constant-canopy-drag/1.0.0',
      adapterId: 'frontend-external-profile-SB1/1.0.0', callerSourceIdentity: request.adapter.sourceIdentity,
      geometryIdentity: `frontend-external-profile-SB1/1.0.0:${request.adapter.sourceIdentity}`,
      axialProviderId: request.axial.providerId,
      axialInputIdentity: request.axial.inputIdentity, mechanicalSourceId: request.mechanicalSourceId,
      environmentSourceId: request.environmentSourceId,
    },
    supportPolicy: { machUpperExclusive: 0.8, maxIncidenceDeg: 5, notes: ['Forward flow required.'] },
    events: [{ timeS: 0.1, name: 'Ignition', altitudeAglM: 0, velocityMps: 20, description: 'fixture event' }],
    limitations: ['Fixture limitation'],
    contentIdentity: { schemeId: 'native-candidate-input-model-sha256/1.0.0',
      encodingId: 'astraea-typed-json-bits/1.0.0', sha256: 'd'.repeat(64), runtimeIdentity: null },
  };
}

export function candidateResult(): CandidateResultArchive {
  return candidateResultFromReport(candidateReport());
}
