/**
 * Candidate result archive and the one model-aware output projection.
 *
 * The accepted runtime report is the source of shape. Nullable flow,
 * coefficients, CP, landing, apogee and reason fields are preserved as null or
 * absent with their reason; they are never zero-filled or reconstructed. The
 * archive stores a curated lossless view of the quantities the app presents,
 * plus a bounded display-sample subset whose mandatory event/peak context is
 * never decimated away.
 */
import type { Confidence } from '../console/data/contract';
import type { LandingAvailability } from './flightLanding';
import { MAX_SAVED_TELEMETRY_POINTS } from './savedTelemetry';
import { stableStringify } from './caseResolver';
import { CANDIDATE_FLIGHT_MODEL, type CandidateFlightModelSelection } from './flightModel';
import {
  invocationCandidate, isProfileInvocation,
  type CandidateInvocation, type CandidateMotorDerivation, type EnvironmentSelection,
} from './candidate';

/** Current engine report. 2.0.0 archives stay readable; new runs require 3.0.0. */
export const CANDIDATE_REPORT_SCHEMA_ID = 'astraea-native-candidate-report/3.0.0';
/** The same report shape with an E1 profile supplying the atmosphere. */
export const CANDIDATE_PROFILE_REPORT_SCHEMA_ID = 'astraea-native-profile-candidate-report/3.0.0';
export const CANDIDATE_REPORT_SCHEMA_V2_ID = 'astraea-native-candidate-report/2.0.0';
export const CANDIDATE_RESULT_SCHEMA_ID = 'astraea-bounded-candidate-result/1.0.0';
/** Current archive. 1.0.0 records stay readable and are never rewritten. */
export const CANDIDATE_ARCHIVE_SCHEMA_ID = 'astraea-candidate-result-archive/2.0.0';
export const CANDIDATE_ARCHIVE_SCHEMA_V1_ID = 'astraea-candidate-result-archive/1.0.0';
/** Shared with the engine: the report-side retained subset policy, applied once. */
export const CANDIDATE_SAMPLE_POLICY_ID = 'candidate-archive-display-samples/1.0.0';
export const CANDIDATE_CURVE_APPLICABILITY_POLICY_ID = 'candidate-curve-applicability/1.0.0';
export const CANDIDATE_COLLECTION_CAP_ID = 'candidate-committed-sample-collection-cap/1.0.0';
export const CANDIDATE_COMPOSITION_ID = 'candidate-static-rate-composition/1.0.0';
/** The same composition when an explicit E1 profile supplies the atmosphere. */
export const CANDIDATE_PROFILE_COMPOSITION_ID = 'candidate-static-rate-profile-composition/1.0.0';
export const CANDIDATE_PROFILE_ENVIRONMENT_MODEL_ID = 'explicit-E1-profile-candidate-environment/1.0.0';
export const CANDIDATE_SUPPORT_POLICY_ID = 'sb1-candidate-support/1.0.0';
export const CANDIDATE_CANOPY_MODEL_ID = 'declared-constant-canopy-drag/1.0.0';
export const CANDIDATE_SUPPORT_MACH_EXCLUSIVE = 0.8;
export const CANDIDATE_SUPPORT_INCIDENCE_DEG = 5;

/** Request/selection/derivation that an archived result must still describe. */
export interface CandidateResultContext {
  request: CandidateInvocation;
  selection: CandidateFlightModelSelection;
  derivation: CandidateMotorDerivation;
}

const ALLOWED_COMPUTATIONAL_STATUS = new Set(['Supported', 'ZeroSpeedStaticLoadsOnly', 'StaticLoadsBelowAeroNegligibility']);
const ALLOWED_APPLICABILITY = new Set(['AirframeStaticRateComposition', 'CanopyRecoveryComposition']);

export type CandidateTermination = 'TimeLimit' | 'Touchdown';
export type CandidateCompletion = 'CompletedRequestedHorizon' | 'CompletedTouchdown';

export interface CandidateFlags {
  drogueDeployed: boolean;
  mainDeployed: boolean;
  railBound: boolean;
}

export interface CandidateState {
  positionM: [number, number, number];
  velocityMps: [number, number, number];
  quaternionWxyz: [number, number, number, number];
  omegaRadps: [number, number, number];
}

export interface CandidateWrench {
  cfBody: [number, number, number];
  cmBody: [number, number, number];
}

export interface CandidateWind {
  cdWind: number;
  clWind: number;
  cyWind: number;
}

export interface CandidateNormalDerivatives {
  cPerRad: number;
  jMPerRad: number;
  sumAbsCPerRad: number;
  sumAbsJMPerRad: number;
}

export interface CandidateCp {
  stationFromNoseM: number | null;
  kappaC: number | null;
  reason: string | null;
}

export interface CandidateNegligibility {
  policyId: string;
  relativeBound: number;
  maxPossibleForceN: number;
  weightN: number;
  isNegligible: boolean;
}

export interface CandidateUnavailable {
  quantity: string;
  reason: string;
}

export interface CandidateFlow {
  alphaRad: number;
  betaRad: number;
  alphaDeg: number;
  betaDeg: number;
  incidenceDeg: number;
}

export interface CandidateFlowDeg {
  alphaDeg: number;
  betaDeg: number;
  incidenceDeg: number;
}

export interface CandidateMechanics {
  massKg: number;
  cgFromNoseM: number;
  densityKgM3: number;
  speedOfSoundMps: number;
  airspeedMps: number;
  mach: number;
  dynamicPressurePa: number;
  thrustN: number;
  windNMps: [number, number, number];
  referenceAreaM2: number;
  referenceLengthM: number;
}

export interface CandidateQuery {
  origin: string;
  timeS: number;
  flags: CandidateFlags;
  applicability: string;
  computationalStatus: string;
  state: CandidateState;
  mechanics: CandidateMechanics;
  flow: CandidateFlow | null;
  coefficients: { datum: CandidateWrench | null; cg: CandidateWrench | null };
  windCoefficients: CandidateWind | null;
  normalDerivatives: CandidateNormalDerivatives | null;
  cp: CandidateCp | null;
  staticForceBodyN: [number, number, number];
  staticMomentCgBodyNm: [number, number, number];
  rateMomentBodyNm: [number, number, number];
  canopyDragBodyN: [number, number, number] | null;
  aeroForceBodyN: [number, number, number];
  aeroMomentCgBodyNm: [number, number, number];
  dragAlongWindN: number;
  aeroNegligibility: CandidateNegligibility;
  unavailable: CandidateUnavailable[];
}

export interface CandidateCurvePoint {
  mach: number;
  computationalStatus: string;
  dynamicPressurePa: number;
  flow: CandidateFlowDeg | null;
  coefficients: { datum: CandidateWrench | null; cg: CandidateWrench | null };
  windCoefficients: CandidateWind | null;
  normalDerivatives: CandidateNormalDerivatives | null;
  cp: CandidateCp | null;
  staticForceBodyN: [number, number, number];
  staticMomentCgBodyNm: [number, number, number];
  aeroNegligibility: CandidateNegligibility;
  unavailable: CandidateUnavailable[];
}

export interface CandidateObservedPrefix {
  samplingPolicyId: string;
  sampleCount: number;
  maxAltitudeAglM: number;
  maxAltitudeTimeS: number;
  maxAirspeedMps: number;
  maxAirspeedTimeS: number;
  maxDynamicPressurePa: number;
  maxDynamicPressureTimeS: number;
  note: string;
}

export interface CandidateRetainedSample {
  timeS: number;
  positionM: [number, number, number];
  velocityMps: [number, number, number];
  flags: CandidateFlags;
  computationalStatus: string;
  mach: number;
  dynamicPressurePa: number;
  flow: CandidateFlow | null;
  unavailable: CandidateUnavailable[];
}

/** Why static airframe curves cannot be evaluated at the recorded reference. */
export interface CandidateCurveNotApplicable {
  reasonId: string;
  reason: string;
  referenceTimeS: number;
  drogueDeployed: boolean;
  mainDeployed: boolean;
  referenceAirspeedMps: number;
  referenceMach: number;
}

/**
 * Legacy 1.0.0 curve record: computed points only, no applicability status.
 * Kept verbatim so reading and re-saving an old archive is byte-faithful.
 */
export interface CandidateCurvesLegacy {
  requestedMachs: number[];
  referenceMachAddedForEquivalence: boolean;
  points: CandidateCurvePoint[];
}

/** Report 3.0.0 curve record. `points` is null exactly when not applicable. */
export interface CandidateCurvesVersioned {
  status: 'computed' | 'notApplicable';
  policyId: string;
  requestedMachs: number[];
  referenceMachAddedForEquivalence: boolean;
  notApplicable: CandidateCurveNotApplicable | null;
  points: CandidateCurvePoint[] | null;
}

export type CandidateCurvesArchive = CandidateCurvesLegacy | CandidateCurvesVersioned;

export function isVersionedCurves(curves: CandidateCurvesArchive): curves is CandidateCurvesVersioned {
  return 'status' in curves;
}

/** Report 3.0.0 comparison outcome; `matchesReferenceSample` is null when N/A. */
export interface CandidateCurveComparison {
  status: 'compared' | 'not-applicable';
  matchesReferenceSample: boolean | null;
  reasonId: string | null;
}

/** What the E1 profile supplied, recorded with a profile run. */
export interface CandidateProfileEnvironmentArchive {
  environmentModelId: string;
  profileSourceIdentity: string;
  verticalDatumIdentity: string;
  launchTimeUtcUnixS: number;
  launchAltitudeGeometricMslM: number;
  axialSourceNote: string;
  queryObservationExact: boolean;
  curveSourceShared: boolean;
}

/** Engine-side collection/retention declaration recorded with the run. */
export interface CandidateRetention {
  policyId: string;
  mode: string;
  sampleCount: number;
  retainedSampleCount: number;
  collectionCapId: string;
  collectionCap: number;
}

export interface CandidateEquivalenceLegacy {
  referenceSampleTimeS: number;
  referenceMach: number;
  queryMatchesReferenceSample: boolean;
  curveMatchesReferenceSample: boolean;
  compared: string;
  note: string;
}

export interface CandidateEquivalenceVersioned {
  referenceSampleTimeS: number;
  referenceMach: number;
  queryMatchesReferenceSample: boolean;
  curveComparison: CandidateCurveComparison;
  compared: string;
  note: string;
}

export type CandidateEquivalence = CandidateEquivalenceLegacy | CandidateEquivalenceVersioned;

export interface CandidateResultArchive {
  schemaId: typeof CANDIDATE_ARCHIVE_SCHEMA_ID | typeof CANDIDATE_ARCHIVE_SCHEMA_V1_ID;
  reportSchemaId: typeof CANDIDATE_REPORT_SCHEMA_ID | typeof CANDIDATE_PROFILE_REPORT_SCHEMA_ID | typeof CANDIDATE_REPORT_SCHEMA_V2_ID;
  resultSchemaId: typeof CANDIDATE_RESULT_SCHEMA_ID;
  compositionId: typeof CANDIDATE_COMPOSITION_ID | typeof CANDIDATE_PROFILE_COMPOSITION_ID;
  status: 'experimental-unqualified';
  termination: CandidateTermination;
  computationalCompletion: CandidateCompletion;
  empiricalQualification: 'Unqualified';
  dynamicQualification: 'Unknown';
  requestedHorizonS: number;
  finalTimeS: number;
  finalState: CandidateState;
  finalFlags: CandidateFlags;
  landing: {
    timeS: number;
    positionNM: [number, number, number];
    speedMps: number;
    massKg: number;
    eventDescription: string;
  } | null;
  apogeeEvent: {
    timeS: number;
    altitudeAglM: number;
    velocityMps: number;
    description: string;
  } | null;
  observedPrefix: CandidateObservedPrefix;
  events: Array<{ timeS: number; name: string; altitudeAglM: number; velocityMps: number; description: string }>;
  query: CandidateQuery;
  curves: CandidateCurvesArchive;
  equivalence: CandidateEquivalence;
  /** Engine-declared collection/retention policy; absent on a legacy 1.0.0 archive. */
  retention?: CandidateRetention;
  /** Present exactly when an explicit E1 profile supplied the atmosphere. */
  profileEnvironment?: CandidateProfileEnvironmentArchive;
  model: {
    geometry: { identity: string; areaM2: number; lengthM: number; diameterM: number; bodyLengthM: number };
    mechanical: {
      dryMassKg: number;
      cgFromNoseM: number;
      totalLengthM: number;
      referenceDiameterM: number;
      motorAftStationFromNoseM: number;
      motorDesignation: string;
      drogue: { diameterM: number; cd: number } | null;
      main: { diameterM: number; cd: number } | null;
    };
    environment: {
      launchAltitudeASL: number;
      windSpeedSurfaceMps: number;
      windAzimuthDeg: number;
      environmentSourceId: string;
    };
  };
  identities: {
    compositionId: string;
    staticProviderId: string;
    rateModelId: string;
    environmentModelId: string;
    mechanicalModelId: string;
    supportPolicyId: string;
    calibrationPolicyId: string;
    canopyModelId: string;
    adapterId: string;
    callerSourceIdentity: string;
    geometryIdentity: string;
    axialProviderId: string;
    axialInputIdentity: string;
    mechanicalSourceId: string;
    environmentSourceId: string;
  };
  supportPolicy: { machUpperExclusive: number; maxIncidenceDeg: number; notes: string[] };
  limitations: string[];
  sampleCount: number;
  retainedSamples: CandidateRetainedSample[];
  sampleArchivePolicyId: typeof CANDIDATE_SAMPLE_POLICY_ID;
  contentIdentity: {
    schemeId: 'native-candidate-input-model-sha256/1.0.0';
    encodingId: 'astraea-typed-json-bits/1.0.0';
    sha256: string;
  };
}

type Raw = Record<string, unknown>;

function record(value: unknown, path: string): Raw {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Raw;
}

function exact(raw: Raw, path: string, keys: readonly string[]): void {
  const expected = [...keys].sort();
  const actual = Object.keys(raw).sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new Error(`${path} must declare exactly ${expected.join(', ')}`);
  }
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number`);
  return value;
}

function numOrNull(value: unknown, path: string): number | null {
  return value === null ? null : num(value, path);
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${path} must be a non-empty string`);
  return value;
}

function textOrNull(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}

function textAllowEmpty(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
}

function count(value: unknown, path: string): number {
  const n = num(value, path);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${path} must be a non-negative integer`);
  return n;
}

function vec3(value: unknown, path: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${path} must be three numbers`);
  return [num(value[0], `${path}[0]`), num(value[1], `${path}[1]`), num(value[2], `${path}[2]`)];
}

function vec4(value: unknown, path: string): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`${path} must be four numbers`);
  return [num(value[0], `${path}[0]`), num(value[1], `${path}[1]`), num(value[2], `${path}[2]`), num(value[3], `${path}[3]`)];
}

function strings(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) throw new Error(`${path} must be a string array`);
  return value as string[];
}

const FLAG_KEYS = ['drogueDeployed', 'mainDeployed', 'railBound'] as const;
const STATE_KEYS = ['positionM', 'velocityMps', 'quaternionWxyz', 'omegaRadps'] as const;
const WRENCH_KEYS = ['cfBody', 'cmBody'] as const;
const WIND_KEYS = ['cdWind', 'clWind', 'cyWind'] as const;
const NORMAL_KEYS = ['cPerRad', 'jMPerRad', 'sumAbsCPerRad', 'sumAbsJMPerRad'] as const;
const CP_KEYS = ['stationFromNoseM', 'kappaC', 'reason'] as const;
const NEGLIGIBILITY_KEYS = ['policyId', 'relativeBound', 'maxPossibleForceN', 'weightN', 'isNegligible'] as const;
const UNAVAILABLE_KEYS = ['quantity', 'reason'] as const;
const FLOW_KEYS = ['alphaRad', 'betaRad', 'alphaDeg', 'betaDeg', 'incidenceDeg'] as const;
const FLOW_DEG_KEYS = ['alphaDeg', 'betaDeg', 'incidenceDeg'] as const;
const MECHANICS_KEYS = ['massKg', 'cgFromNoseM', 'densityKgM3', 'speedOfSoundMps', 'airspeedMps',
  'mach', 'dynamicPressurePa', 'thrustN', 'windNMps', 'referenceAreaM2', 'referenceLengthM'] as const;
const QUERY_KEYS = ['origin', 'timeS', 'flags', 'applicability', 'computationalStatus', 'state',
  'mechanics', 'flow', 'coefficients', 'windCoefficients', 'normalDerivatives', 'cp',
  'staticForceBodyN', 'staticMomentCgBodyNm', 'rateMomentBodyNm', 'canopyDragBodyN',
  'aeroForceBodyN', 'aeroMomentCgBodyNm', 'dragAlongWindN', 'aeroNegligibility', 'unavailable'] as const;
const CURVE_KEYS = ['mach', 'computationalStatus', 'dynamicPressurePa', 'flow', 'coefficients',
  'windCoefficients', 'normalDerivatives', 'cp', 'staticForceBodyN', 'staticMomentCgBodyNm',
  'aeroNegligibility', 'unavailable'] as const;
const RETAINED_KEYS = ['timeS', 'positionM', 'velocityMps', 'flags', 'computationalStatus',
  'mach', 'dynamicPressurePa', 'flow', 'unavailable'] as const;

function flags(value: unknown, path: string): CandidateFlags {
  const raw = record(value, path);
  exact(raw, path, FLAG_KEYS);
  return { drogueDeployed: bool(raw.drogueDeployed, `${path}.drogueDeployed`),
    mainDeployed: bool(raw.mainDeployed, `${path}.mainDeployed`), railBound: bool(raw.railBound, `${path}.railBound`) };
}

function state(value: unknown, path: string): CandidateState {
  const raw = record(value, path);
  exact(raw, path, STATE_KEYS);
  return { positionM: vec3(raw.positionM, `${path}.positionM`),
    velocityMps: vec3(raw.velocityMps, `${path}.velocityMps`),
    quaternionWxyz: vec4(raw.quaternionWxyz, `${path}.quaternionWxyz`),
    omegaRadps: vec3(raw.omegaRadps, `${path}.omegaRadps`) };
}

function wrench(value: unknown, path: string): CandidateWrench {
  const raw = record(value, path);
  exact(raw, path, WRENCH_KEYS);
  return { cfBody: vec3(raw.cfBody, `${path}.cfBody`), cmBody: vec3(raw.cmBody, `${path}.cmBody`) };
}

function wrenchOrNull(value: unknown, path: string): CandidateWrench | null {
  return value === null ? null : wrench(value, path);
}

function coefficients(value: unknown, path: string): { datum: CandidateWrench | null; cg: CandidateWrench | null } {
  const raw = record(value, path);
  exact(raw, path, ['datum', 'cg']);
  return { datum: wrenchOrNull(raw.datum, `${path}.datum`), cg: wrenchOrNull(raw.cg, `${path}.cg`) };
}

function wind(value: unknown, path: string): CandidateWind {
  const raw = record(value, path);
  exact(raw, path, WIND_KEYS);
  return { cdWind: num(raw.cdWind, `${path}.cdWind`), clWind: num(raw.clWind, `${path}.clWind`), cyWind: num(raw.cyWind, `${path}.cyWind`) };
}

function normal(value: unknown, path: string): CandidateNormalDerivatives {
  const raw = record(value, path);
  exact(raw, path, NORMAL_KEYS);
  return { cPerRad: num(raw.cPerRad, `${path}.cPerRad`), jMPerRad: num(raw.jMPerRad, `${path}.jMPerRad`),
    sumAbsCPerRad: num(raw.sumAbsCPerRad, `${path}.sumAbsCPerRad`), sumAbsJMPerRad: num(raw.sumAbsJMPerRad, `${path}.sumAbsJMPerRad`) };
}

function cp(value: unknown, path: string): CandidateCp | null {
  if (value === null) return null;
  const raw = record(value, path);
  exact(raw, path, CP_KEYS);
  return { stationFromNoseM: numOrNull(raw.stationFromNoseM, `${path}.stationFromNoseM`),
    kappaC: numOrNull(raw.kappaC, `${path}.kappaC`), reason: textOrNull(raw.reason, `${path}.reason`) };
}

function negligibility(value: unknown, path: string): CandidateNegligibility {
  const raw = record(value, path);
  exact(raw, path, NEGLIGIBILITY_KEYS);
  return { policyId: text(raw.policyId, `${path}.policyId`), relativeBound: num(raw.relativeBound, `${path}.relativeBound`),
    maxPossibleForceN: num(raw.maxPossibleForceN, `${path}.maxPossibleForceN`),
    weightN: num(raw.weightN, `${path}.weightN`), isNegligible: bool(raw.isNegligible, `${path}.isNegligible`) };
}

function unavailable(value: unknown, path: string): CandidateUnavailable[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((entry, i) => {
    const raw = record(entry, `${path}[${i}]`);
    exact(raw, `${path}[${i}]`, UNAVAILABLE_KEYS);
    return { quantity: text(raw.quantity, `${path}[${i}].quantity`), reason: text(raw.reason, `${path}[${i}].reason`) };
  });
}

function flow(value: unknown, path: string): CandidateFlow | null {
  if (value === null) return null;
  const raw = record(value, path);
  exact(raw, path, FLOW_KEYS);
  return { alphaRad: num(raw.alphaRad, `${path}.alphaRad`), betaRad: num(raw.betaRad, `${path}.betaRad`),
    alphaDeg: num(raw.alphaDeg, `${path}.alphaDeg`), betaDeg: num(raw.betaDeg, `${path}.betaDeg`),
    incidenceDeg: num(raw.incidenceDeg, `${path}.incidenceDeg`) };
}

function flowDeg(value: unknown, path: string): CandidateFlowDeg | null {
  if (value === null) return null;
  const raw = record(value, path);
  exact(raw, path, FLOW_DEG_KEYS);
  return { alphaDeg: num(raw.alphaDeg, `${path}.alphaDeg`), betaDeg: num(raw.betaDeg, `${path}.betaDeg`),
    incidenceDeg: num(raw.incidenceDeg, `${path}.incidenceDeg`) };
}

function mechanics(value: unknown, path: string): CandidateMechanics {
  const raw = record(value, path);
  exact(raw, path, MECHANICS_KEYS);
  return { massKg: num(raw.massKg, `${path}.massKg`), cgFromNoseM: num(raw.cgFromNoseM, `${path}.cgFromNoseM`),
    densityKgM3: num(raw.densityKgM3, `${path}.densityKgM3`), speedOfSoundMps: num(raw.speedOfSoundMps, `${path}.speedOfSoundMps`),
    airspeedMps: num(raw.airspeedMps, `${path}.airspeedMps`), mach: num(raw.mach, `${path}.mach`),
    dynamicPressurePa: num(raw.dynamicPressurePa, `${path}.dynamicPressurePa`), thrustN: num(raw.thrustN, `${path}.thrustN`),
    windNMps: vec3(raw.windNMps, `${path}.windNMps`), referenceAreaM2: num(raw.referenceAreaM2, `${path}.referenceAreaM2`),
    referenceLengthM: num(raw.referenceLengthM, `${path}.referenceLengthM`) };
}

function computationalStatus(value: unknown, path: string): string {
  const status = text(value, path);
  if (!ALLOWED_COMPUTATIONAL_STATUS.has(status)) throw new Error(`${path} is an unsupported candidate computational status`);
  return status;
}

function applicability(value: unknown, path: string): string {
  const label = text(value, path);
  if (!ALLOWED_APPLICABILITY.has(label)) throw new Error(`${path} is an unsupported candidate applicability`);
  return label;
}

function supportMach(value: unknown, path: string): number {
  const mach = num(value, path);
  if (mach < 0 || mach >= CANDIDATE_SUPPORT_MACH_EXCLUSIVE) throw new Error(`${path} is outside candidate Mach support`);
  return mach;
}

function query(value: unknown, path: string): CandidateQuery {
  const raw = record(value, path);
  exact(raw, path, QUERY_KEYS);
  return { origin: text(raw.origin, `${path}.origin`), timeS: num(raw.timeS, `${path}.timeS`),
    flags: flags(raw.flags, `${path}.flags`), applicability: applicability(raw.applicability, `${path}.applicability`),
    computationalStatus: computationalStatus(raw.computationalStatus, `${path}.computationalStatus`),
    state: state(raw.state, `${path}.state`), mechanics: mechanics(raw.mechanics, `${path}.mechanics`),
    flow: flow(raw.flow, `${path}.flow`), coefficients: coefficients(raw.coefficients, `${path}.coefficients`),
    windCoefficients: raw.windCoefficients === null ? null : wind(raw.windCoefficients, `${path}.windCoefficients`),
    normalDerivatives: raw.normalDerivatives === null ? null : normal(raw.normalDerivatives, `${path}.normalDerivatives`),
    cp: cp(raw.cp, `${path}.cp`),
    staticForceBodyN: vec3(raw.staticForceBodyN, `${path}.staticForceBodyN`),
    staticMomentCgBodyNm: vec3(raw.staticMomentCgBodyNm, `${path}.staticMomentCgBodyNm`),
    rateMomentBodyNm: vec3(raw.rateMomentBodyNm, `${path}.rateMomentBodyNm`),
    canopyDragBodyN: raw.canopyDragBodyN === null ? null : vec3(raw.canopyDragBodyN, `${path}.canopyDragBodyN`),
    aeroForceBodyN: vec3(raw.aeroForceBodyN, `${path}.aeroForceBodyN`),
    aeroMomentCgBodyNm: vec3(raw.aeroMomentCgBodyNm, `${path}.aeroMomentCgBodyNm`),
    dragAlongWindN: num(raw.dragAlongWindN, `${path}.dragAlongWindN`),
    aeroNegligibility: negligibility(raw.aeroNegligibility, `${path}.aeroNegligibility`),
    unavailable: unavailable(raw.unavailable, `${path}.unavailable`) };
}

function curvePoint(value: unknown, path: string): CandidateCurvePoint {
  const raw = record(value, path);
  exact(raw, path, CURVE_KEYS);
  return { mach: supportMach(raw.mach, `${path}.mach`), computationalStatus: computationalStatus(raw.computationalStatus, `${path}.computationalStatus`),
    dynamicPressurePa: num(raw.dynamicPressurePa, `${path}.dynamicPressurePa`), flow: flowDeg(raw.flow, `${path}.flow`),
    coefficients: coefficients(raw.coefficients, `${path}.coefficients`),
    windCoefficients: raw.windCoefficients === null ? null : wind(raw.windCoefficients, `${path}.windCoefficients`),
    normalDerivatives: raw.normalDerivatives === null ? null : normal(raw.normalDerivatives, `${path}.normalDerivatives`),
    cp: cp(raw.cp, `${path}.cp`), staticForceBodyN: vec3(raw.staticForceBodyN, `${path}.staticForceBodyN`),
    staticMomentCgBodyNm: vec3(raw.staticMomentCgBodyNm, `${path}.staticMomentCgBodyNm`),
    aeroNegligibility: negligibility(raw.aeroNegligibility, `${path}.aeroNegligibility`),
    unavailable: unavailable(raw.unavailable, `${path}.unavailable`) };
}

function retainedSample(value: unknown, path: string): CandidateRetainedSample {
  const raw = record(value, path);
  exact(raw, path, RETAINED_KEYS);
  return { timeS: num(raw.timeS, `${path}.timeS`), positionM: vec3(raw.positionM, `${path}.positionM`),
    velocityMps: vec3(raw.velocityMps, `${path}.velocityMps`), flags: flags(raw.flags, `${path}.flags`),
    computationalStatus: computationalStatus(raw.computationalStatus, `${path}.computationalStatus`),
    mach: supportMach(raw.mach, `${path}.mach`), dynamicPressurePa: num(raw.dynamicPressurePa, `${path}.dynamicPressurePa`),
    flow: flow(raw.flow, `${path}.flow`), unavailable: unavailable(raw.unavailable, `${path}.unavailable`) };
}

/** Actual runtime samples carry nested state/mechanics; project the display subset once. */
/** Project one engine-committed sample into the archived display shape. */
export function retainedFromEngineSample(value: unknown, path: string): CandidateRetainedSample {
  const raw = record(value, path);
  if (Object.hasOwn(raw, 'positionM')) {
    // A flat sample (fixtures, or a future report that flattens) is projected on
    // the same subset; report-only extras such as a profile observation are not
    // archived, they are run-level provenance.
    return retainedSample({
      timeS: raw.timeS, positionM: raw.positionM, velocityMps: raw.velocityMps, flags: raw.flags,
      computationalStatus: raw.computationalStatus, mach: raw.mach,
      dynamicPressurePa: raw.dynamicPressurePa, flow: raw.flow, unavailable: raw.unavailable,
    }, path);
  }
  const sampleState = record(raw.state, `${path}.state`);
  const sampleMechanics = record(raw.mechanics, `${path}.mechanics`);
  return retainedSample({
    timeS: raw.timeS,
    positionM: sampleState.positionM,
    velocityMps: sampleState.velocityMps,
    flags: raw.flags,
    computationalStatus: raw.computationalStatus,
    mach: sampleMechanics.mach,
    dynamicPressurePa: sampleMechanics.dynamicPressurePa,
    flow: raw.flow,
    unavailable: raw.unavailable,
  }, path);
}

function observedPrefix(value: unknown, path: string): CandidateObservedPrefix {
  const raw = record(value, path);
  const keys = ['samplingPolicyId', 'sampleCount', 'maxAltitudeAglM', 'maxAltitudeTimeS',
    'maxAirspeedMps', 'maxAirspeedTimeS', 'maxDynamicPressurePa', 'maxDynamicPressureTimeS', 'note'] as const;
  exact(raw, path, keys);
  return { samplingPolicyId: text(raw.samplingPolicyId, `${path}.samplingPolicyId`),
    sampleCount: count(raw.sampleCount, `${path}.sampleCount`),
    maxAltitudeAglM: num(raw.maxAltitudeAglM, `${path}.maxAltitudeAglM`),
    maxAltitudeTimeS: num(raw.maxAltitudeTimeS, `${path}.maxAltitudeTimeS`),
    maxAirspeedMps: num(raw.maxAirspeedMps, `${path}.maxAirspeedMps`),
    maxAirspeedTimeS: num(raw.maxAirspeedTimeS, `${path}.maxAirspeedTimeS`),
    maxDynamicPressurePa: num(raw.maxDynamicPressurePa, `${path}.maxDynamicPressurePa`),
    maxDynamicPressureTimeS: num(raw.maxDynamicPressureTimeS, `${path}.maxDynamicPressureTimeS`),
    note: text(raw.note, `${path}.note`) };
}

function landing(value: unknown, path: string): CandidateResultArchive['landing'] {
  if (value === null) return null;
  const raw = record(value, path);
  exact(raw, path, ['timeS', 'positionNM', 'speedMps', 'massKg', 'eventDescription']);
  return { timeS: num(raw.timeS, `${path}.timeS`), positionNM: vec3(raw.positionNM, `${path}.positionNM`),
    speedMps: num(raw.speedMps, `${path}.speedMps`), massKg: num(raw.massKg, `${path}.massKg`),
    eventDescription: textAllowEmpty(raw.eventDescription, `${path}.eventDescription`) };
}

function apogeeEvent(value: unknown, path: string): CandidateResultArchive['apogeeEvent'] {
  if (value === null) return null;
  const raw = record(value, path);
  exact(raw, path, ['timeS', 'altitudeAglM', 'velocityMps', 'description']);
  return { timeS: num(raw.timeS, `${path}.timeS`), altitudeAglM: num(raw.altitudeAglM, `${path}.altitudeAglM`),
    velocityMps: num(raw.velocityMps, `${path}.velocityMps`), description: textAllowEmpty(raw.description, `${path}.description`) };
}

function events(value: unknown, path: string): CandidateResultArchive['events'] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value.map((entry, i) => {
    const raw = record(entry, `${path}[${i}]`);
    exact(raw, `${path}[${i}]`, ['timeS', 'name', 'altitudeAglM', 'velocityMps', 'description']);
    return { timeS: num(raw.timeS, `${path}[${i}].timeS`), name: text(raw.name, `${path}[${i}].name`),
      altitudeAglM: num(raw.altitudeAglM, `${path}[${i}].altitudeAglM`),
      velocityMps: num(raw.velocityMps, `${path}[${i}].velocityMps`),
      description: textAllowEmpty(raw.description, `${path}[${i}].description`) };
  });
}

const PROFILE_ENV_KEYS = ['environmentModelId', 'profileSourceIdentity', 'verticalDatumIdentity',
  'launchTimeUtcUnixS', 'launchAltitudeGeometricMslM', 'axialSourceNote',
  'queryObservationExact', 'curveSourceShared'] as const;

function profileEnvironment(value: unknown, path: string): CandidateProfileEnvironmentArchive {
  const raw = record(value, path);
  exact(raw, path, PROFILE_ENV_KEYS);
  if (!Number.isInteger(raw.launchTimeUtcUnixS)) throw new Error(`${path}.launchTimeUtcUnixS must be an integer epoch`);
  return {
    environmentModelId: text(raw.environmentModelId, `${path}.environmentModelId`),
    profileSourceIdentity: text(raw.profileSourceIdentity, `${path}.profileSourceIdentity`),
    verticalDatumIdentity: text(raw.verticalDatumIdentity, `${path}.verticalDatumIdentity`),
    launchTimeUtcUnixS: raw.launchTimeUtcUnixS as number,
    launchAltitudeGeometricMslM: num(raw.launchAltitudeGeometricMslM, `${path}.launchAltitudeGeometricMslM`),
    axialSourceNote: textAllowEmpty(raw.axialSourceNote, `${path}.axialSourceNote`),
    queryObservationExact: bool(raw.queryObservationExact, `${path}.queryObservationExact`),
    curveSourceShared: bool(raw.curveSourceShared, `${path}.curveSourceShared`),
  };
}

const ARCHIVE_KEYS_V1 = ['schemaId', 'reportSchemaId', 'resultSchemaId', 'compositionId', 'status',
  'termination', 'computationalCompletion', 'empiricalQualification', 'dynamicQualification',
  'requestedHorizonS', 'finalTimeS', 'finalState', 'finalFlags', 'landing', 'apogeeEvent',
  'observedPrefix', 'events', 'query', 'curves', 'equivalence', 'model', 'identities',
  'supportPolicy', 'limitations', 'sampleCount', 'retainedSamples', 'sampleArchivePolicyId',
  'contentIdentity'] as const;
/** 2.0.0 adds the engine-declared retention block and moves the comparison outcome. */
const ARCHIVE_KEYS_V2 = [...ARCHIVE_KEYS_V1, 'retention'] as const;

/** Strict archive/case parser. Nullable serializer fields stay null; nothing is repaired. */
export function parseCandidateResultArchive(value: unknown, context?: CandidateResultContext): CandidateResultArchive {
  const raw = record(value, 'candidateResult');
  const archiveV2 = raw.schemaId === CANDIDATE_ARCHIVE_SCHEMA_ID;
  const archiveV1 = raw.schemaId === CANDIDATE_ARCHIVE_SCHEMA_V1_ID;
  if (!archiveV2 && !archiveV1) throw new Error('candidateResult.schemaId is unsupported');
  const hasProfileRecord = archiveV2 && Object.hasOwn(raw, 'profileEnvironment');
  exact(raw, 'candidateResult', archiveV2
    ? (hasProfileRecord ? [...ARCHIVE_KEYS_V2, 'profileEnvironment'] : ARCHIVE_KEYS_V2)
    : ARCHIVE_KEYS_V1);
  // A report and an archive shape must agree: no cross-version mixing.
  const profileArchive = raw.reportSchemaId === CANDIDATE_PROFILE_REPORT_SCHEMA_ID;
  if (archiveV2 && !profileArchive && raw.reportSchemaId !== CANDIDATE_REPORT_SCHEMA_ID) {
    throw new Error('candidateResult.reportSchemaId is unsupported');
  }
  if (archiveV1 && raw.reportSchemaId !== CANDIDATE_REPORT_SCHEMA_V2_ID) throw new Error('candidateResult.reportSchemaId is unsupported');
  if (raw.resultSchemaId !== CANDIDATE_RESULT_SCHEMA_ID) throw new Error('candidateResult.resultSchemaId is unsupported');
  if (raw.compositionId !== CANDIDATE_COMPOSITION_ID && raw.compositionId !== CANDIDATE_PROFILE_COMPOSITION_ID) {
    throw new Error('candidateResult.compositionId is unsupported');
  }
  if (raw.status !== 'experimental-unqualified') throw new Error('candidateResult.status is unsupported');
  const termination = raw.termination;
  if (termination !== 'TimeLimit' && termination !== 'Touchdown') throw new Error('candidateResult.termination is unsupported');
  const completion = raw.computationalCompletion;
  if (completion !== 'CompletedRequestedHorizon' && completion !== 'CompletedTouchdown') throw new Error('candidateResult.computationalCompletion is unsupported');
  if ((termination === 'TimeLimit') !== (completion === 'CompletedRequestedHorizon')) throw new Error('candidateResult termination/completion disagree');
  if (raw.empiricalQualification !== 'Unqualified') throw new Error('candidateResult.empiricalQualification is unsupported');
  if (raw.dynamicQualification !== 'Unknown') throw new Error('candidateResult.dynamicQualification is unsupported');
  const requestedHorizonS = num(raw.requestedHorizonS, 'candidateResult.requestedHorizonS');
  const finalTimeS = num(raw.finalTimeS, 'candidateResult.finalTimeS');
  if (requestedHorizonS <= 0 || finalTimeS < 0 || finalTimeS > requestedHorizonS) throw new Error('candidateResult final time is outside the requested horizon');
  if (completion === 'CompletedRequestedHorizon' && finalTimeS !== requestedHorizonS) {
    throw new Error('candidateResult CompletedRequestedHorizon did not reach the requested horizon');
  }
  const finalState = state(raw.finalState, 'candidateResult.finalState');
  const finalFlags = flags(raw.finalFlags, 'candidateResult.finalFlags');
  const landingValue = landing(raw.landing, 'candidateResult.landing');
  const apogeeValue = apogeeEvent(raw.apogeeEvent, 'candidateResult.apogeeEvent');
  if (landingValue !== null && (termination !== 'Touchdown' || landingValue.timeS !== finalTimeS)) {
    throw new Error('candidateResult landing requires touchdown termination at the final time');
  }
  if (landingValue === null && termination === 'Touchdown') throw new Error('candidateResult touchdown is missing its landing record');
  const prefix = observedPrefix(raw.observedPrefix, 'candidateResult.observedPrefix');
  if (prefix.maxAltitudeTimeS < 0 || prefix.maxAirspeedTimeS < 0 || prefix.maxDynamicPressureTimeS < 0
    || prefix.maxAltitudeTimeS > finalTimeS || prefix.maxAirspeedTimeS > finalTimeS || prefix.maxDynamicPressureTimeS > finalTimeS) {
    throw new Error('candidateResult observed-prefix time is outside the run');
  }
  const eventList = events(raw.events, 'candidateResult.events');
  let previousEvent = -Infinity;
  for (const event of eventList) {
    if (event.timeS < 0 || event.timeS < previousEvent || event.timeS > finalTimeS) throw new Error('candidateResult events are not ordered within the run');
    previousEvent = event.timeS;
  }
  const apogeeEvents = eventList.filter((event) => event.name === 'Apogee & Drogue Deployment');
  if (apogeeValue !== null) {
    if (apogeeValue.timeS < 0 || apogeeValue.timeS > finalTimeS) throw new Error('candidateResult apogee time is outside the run');
    if (apogeeEvents.length !== 1) throw new Error('candidateResult apogee event is not supported by exactly one recorded apogee event');
    const event = apogeeEvents[0];
    if (event.timeS !== apogeeValue.timeS || event.altitudeAglM !== apogeeValue.altitudeAglM
      || event.velocityMps !== apogeeValue.velocityMps) {
      throw new Error('candidateResult apogee values disagree with the recorded apogee event');
    }
  } else if (apogeeEvents.length > 0) {
    throw new Error('candidateResult recorded an apogee event without an apogee result');
  }
  const queryValue = query(raw.query, 'candidateResult.query');
  if (queryValue.origin !== 'last-committed-sample') throw new Error('candidateResult query origin is unsupported');
  if (queryValue.timeS < 0 || queryValue.timeS > finalTimeS) throw new Error('candidateResult query time is outside the run');

  const curvesRaw = record(raw.curves, 'candidateResult.curves');
  let curves: CandidateCurvesArchive;
  if (archiveV2) {
    exact(curvesRaw, 'candidateResult.curves', ['status', 'policyId', 'requestedMachs',
      'referenceMachAddedForEquivalence', 'notApplicable', 'points']);
    if (curvesRaw.status !== 'computed' && curvesRaw.status !== 'notApplicable') {
      throw new Error('candidateResult.curves.status is unsupported');
    }
    if (curvesRaw.policyId !== CANDIDATE_CURVE_APPLICABILITY_POLICY_ID) {
      throw new Error('candidateResult.curves.policyId is unsupported');
    }
    if (!Array.isArray(curvesRaw.requestedMachs) || curvesRaw.requestedMachs.length === 0 || curvesRaw.requestedMachs.length > 64
      || !curvesRaw.requestedMachs.every((m) => typeof m === 'number' && Number.isFinite(m) && m >= 0 && m < 0.8)) {
      throw new Error('candidateResult.curves.requestedMachs is invalid');
    }
    const machs = curvesRaw.requestedMachs as number[];
    if (machs.some((mach, i) => i > 0 && mach <= machs[i - 1])) throw new Error('candidateResult requested curve Machs are not strictly increasing');
    const added = bool(curvesRaw.referenceMachAddedForEquivalence, 'candidateResult.curves.referenceMachAddedForEquivalence');
    if (curvesRaw.status === 'computed') {
      if (curvesRaw.notApplicable !== null || !Array.isArray(curvesRaw.points)) {
        throw new Error('candidateResult computed curves must carry points and no notApplicable reason');
      }
      const pts = curvesRaw.points.map((p, i) => curvePoint(p, `candidateResult.curves.points[${i}]`));
      if (pts.length !== machs.length + (added ? 1 : 0)) throw new Error('candidateResult curve count disagrees with its request');
      curves = { status: 'computed', policyId: CANDIDATE_CURVE_APPLICABILITY_POLICY_ID,
        requestedMachs: machs, referenceMachAddedForEquivalence: added, notApplicable: null, points: pts };
    } else {
      if (curvesRaw.points !== null || added) {
        throw new Error('candidateResult not-applicable curves must carry no points and no added-reference flag');
      }
      const na = record(curvesRaw.notApplicable, 'candidateResult.curves.notApplicable');
      exact(na, 'candidateResult.curves.notApplicable', ['reasonId', 'reason', 'referenceTimeS',
        'drogueDeployed', 'mainDeployed', 'referenceAirspeedMps', 'referenceMach']);
      const reasonId = text(na.reasonId, 'candidateResult.curves.notApplicable.reasonId');
      if (reasonId !== 'airframe-curves-not-applicable-canopy-live/1.0.0'
        && reasonId !== 'no-flow-direction-at-zero-airspeed/1.0.0') {
        throw new Error('candidateResult.curves.notApplicable.reasonId is unsupported');
      }
      curves = { status: 'notApplicable', policyId: CANDIDATE_CURVE_APPLICABILITY_POLICY_ID,
        requestedMachs: machs, referenceMachAddedForEquivalence: false,
        notApplicable: { reasonId, reason: text(na.reason, 'candidateResult.curves.notApplicable.reason'),
          referenceTimeS: num(na.referenceTimeS, 'candidateResult.curves.notApplicable.referenceTimeS'),
          drogueDeployed: bool(na.drogueDeployed, 'candidateResult.curves.notApplicable.drogueDeployed'),
          mainDeployed: bool(na.mainDeployed, 'candidateResult.curves.notApplicable.mainDeployed'),
          referenceAirspeedMps: num(na.referenceAirspeedMps, 'candidateResult.curves.notApplicable.referenceAirspeedMps'),
          referenceMach: num(na.referenceMach, 'candidateResult.curves.notApplicable.referenceMach') },
        points: null };
    }
  } else {
    exact(curvesRaw, 'candidateResult.curves', ['requestedMachs', 'referenceMachAddedForEquivalence', 'points']);
    if (!Array.isArray(curvesRaw.requestedMachs) || curvesRaw.requestedMachs.length === 0 || curvesRaw.requestedMachs.length > 64
      || !curvesRaw.requestedMachs.every((m) => typeof m === 'number' && Number.isFinite(m) && m >= 0 && m < 0.8)) {
      throw new Error('candidateResult.curves.requestedMachs is invalid');
    }
    const machs = curvesRaw.requestedMachs as number[];
    if (machs.some((mach, i) => i > 0 && mach <= machs[i - 1])) throw new Error('candidateResult requested curve Machs are not strictly increasing');
    const added = bool(curvesRaw.referenceMachAddedForEquivalence, 'candidateResult.curves.referenceMachAddedForEquivalence');
    if (!Array.isArray(curvesRaw.points)) throw new Error('candidateResult.curves.points must be an array');
    const pts = curvesRaw.points.map((p, i) => curvePoint(p, `candidateResult.curves.points[${i}]`));
    if (pts.length !== machs.length + (added ? 1 : 0)) throw new Error('candidateResult curve count disagrees with its request');
    curves = { requestedMachs: machs, referenceMachAddedForEquivalence: added, points: pts };
  }
  const requestedMachs = curves.requestedMachs;
  const points = curves.points;
  const versionedCurves = isVersionedCurves(curves) ? curves : null;
  if (versionedCurves?.notApplicable != null && versionedCurves.notApplicable.referenceTimeS !== finalTimeS) {
    throw new Error('candidateResult not-applicable curves are not at the final committed state');
  }

  const eqRaw = record(raw.equivalence, 'candidateResult.equivalence');
  let equivalence: CandidateResultArchive['equivalence'];
  if (archiveV2) {
    exact(eqRaw, 'candidateResult.equivalence', ['referenceSampleTimeS', 'referenceMach',
      'queryMatchesReferenceSample', 'curveComparison', 'compared', 'note']);
    const cmpRaw = record(eqRaw.curveComparison, 'candidateResult.equivalence.curveComparison');
    exact(cmpRaw, 'candidateResult.equivalence.curveComparison', ['status', 'matchesReferenceSample', 'reasonId']);
    if (cmpRaw.status !== 'compared' && cmpRaw.status !== 'not-applicable') {
      throw new Error('candidateResult.equivalence.curveComparison.status is unsupported');
    }
    const comparison: CandidateCurveComparison = cmpRaw.status === 'compared'
      ? { status: 'compared', matchesReferenceSample: bool(cmpRaw.matchesReferenceSample, 'candidateResult.equivalence.curveComparison.matchesReferenceSample'), reasonId: null }
      : { status: 'not-applicable', matchesReferenceSample: null, reasonId: text(cmpRaw.reasonId, 'candidateResult.equivalence.curveComparison.reasonId') };
    if (versionedCurves === null) throw new Error('candidateResult versioned comparison requires versioned curves');
    if (comparison.status === 'compared' && versionedCurves.status !== 'computed') {
      throw new Error('candidateResult compared curves must be computed');
    }
    if (comparison.status === 'not-applicable' && (versionedCurves.status !== 'notApplicable'
      || comparison.reasonId !== versionedCurves.notApplicable?.reasonId)) {
      throw new Error('candidateResult curve comparison disagrees with the curve applicability outcome');
    }
    equivalence = { referenceSampleTimeS: num(eqRaw.referenceSampleTimeS, 'candidateResult.equivalence.referenceSampleTimeS'),
      referenceMach: num(eqRaw.referenceMach, 'candidateResult.equivalence.referenceMach'),
      queryMatchesReferenceSample: bool(eqRaw.queryMatchesReferenceSample, 'candidateResult.equivalence.queryMatchesReferenceSample'),
      curveComparison: comparison,
      compared: text(eqRaw.compared, 'candidateResult.equivalence.compared'),
      note: text(eqRaw.note, 'candidateResult.equivalence.note') };
  } else {
    exact(eqRaw, 'candidateResult.equivalence', ['referenceSampleTimeS', 'referenceMach', 'queryMatchesReferenceSample', 'curveMatchesReferenceSample', 'compared', 'note']);
    equivalence = { referenceSampleTimeS: num(eqRaw.referenceSampleTimeS, 'candidateResult.equivalence.referenceSampleTimeS'),
      referenceMach: num(eqRaw.referenceMach, 'candidateResult.equivalence.referenceMach'),
      queryMatchesReferenceSample: bool(eqRaw.queryMatchesReferenceSample, 'candidateResult.equivalence.queryMatchesReferenceSample'),
      curveMatchesReferenceSample: bool(eqRaw.curveMatchesReferenceSample, 'candidateResult.equivalence.curveMatchesReferenceSample'),
      compared: text(eqRaw.compared, 'candidateResult.equivalence.compared'),
      note: text(eqRaw.note, 'candidateResult.equivalence.note') };
  }
  if (equivalence.referenceSampleTimeS < 0 || equivalence.referenceSampleTimeS > finalTimeS) throw new Error('candidateResult reference sample time is outside the run');
  supportMach(equivalence.referenceMach, 'candidateResult.equivalence.referenceMach');
  if (equivalence.referenceSampleTimeS !== finalTimeS) throw new Error('candidateResult reference sample is not the final committed state');
  if (queryValue.timeS !== equivalence.referenceSampleTimeS) throw new Error('candidateResult last-committed query is not at the reference sample');
  if (queryValue.mechanics.mach !== equivalence.referenceMach) throw new Error('candidateResult query Mach disagrees with the reference Mach');
  if (stableStringify(queryValue.state) !== stableStringify(finalState) || stableStringify(queryValue.flags) !== stableStringify(finalFlags)) {
    throw new Error('candidateResult query state/flags disagree with the final committed state');
  }
  if (points !== null) {
    const curveMachs = points.map((point) => point.mach);
    if (stableStringify(curveMachs.slice(0, requestedMachs.length)) !== stableStringify(requestedMachs)) {
      throw new Error('candidateResult curve grid is not the requested grid plus reference');
    }
    if (curves.referenceMachAddedForEquivalence) {
      if (curveMachs.length !== requestedMachs.length + 1 || curveMachs[curveMachs.length - 1] !== equivalence.referenceMach) {
        throw new Error('candidateResult added-reference curve point is missing or misplaced');
      }
    } else if (!requestedMachs.some((mach) => mach === equivalence.referenceMach)) {
      throw new Error('candidateResult reference Mach is absent from the requested curve grid');
    }
  }

  const modelRaw = record(raw.model, 'candidateResult.model');
  exact(modelRaw, 'candidateResult.model', ['geometry', 'mechanical', 'environment']);
  const geometryRaw = record(modelRaw.geometry, 'candidateResult.model.geometry');
  exact(geometryRaw, 'candidateResult.model.geometry', ['identity', 'areaM2', 'lengthM', 'diameterM', 'bodyLengthM']);
  const mechanicalRaw = record(modelRaw.mechanical, 'candidateResult.model.mechanical');
  exact(mechanicalRaw, 'candidateResult.model.mechanical', ['dryMassKg', 'cgFromNoseM', 'totalLengthM', 'referenceDiameterM', 'motorAftStationFromNoseM', 'motorDesignation', 'drogue', 'main']);
  const drag = (v: unknown, path: string) => {
    if (v === null) return null;
    const r = record(v, path); exact(r, path, ['diameterM', 'cd']);
    return { diameterM: num(r.diameterM, `${path}.diameterM`), cd: num(r.cd, `${path}.cd`) };
  };
  const environmentRaw = record(modelRaw.environment, 'candidateResult.model.environment');
  exact(environmentRaw, 'candidateResult.model.environment', ['launchAltitudeASL', 'windSpeedSurfaceMps', 'windAzimuthDeg', 'environmentSourceId']);
  const model = {
    geometry: { identity: text(geometryRaw.identity, 'candidateResult.model.geometry.identity'),
      areaM2: num(geometryRaw.areaM2, 'candidateResult.model.geometry.areaM2'),
      lengthM: num(geometryRaw.lengthM, 'candidateResult.model.geometry.lengthM'),
      diameterM: num(geometryRaw.diameterM, 'candidateResult.model.geometry.diameterM'),
      bodyLengthM: num(geometryRaw.bodyLengthM, 'candidateResult.model.geometry.bodyLengthM') },
    mechanical: { dryMassKg: num(mechanicalRaw.dryMassKg, 'candidateResult.model.mechanical.dryMassKg'),
      cgFromNoseM: num(mechanicalRaw.cgFromNoseM, 'candidateResult.model.mechanical.cgFromNoseM'),
      totalLengthM: num(mechanicalRaw.totalLengthM, 'candidateResult.model.mechanical.totalLengthM'),
      referenceDiameterM: num(mechanicalRaw.referenceDiameterM, 'candidateResult.model.mechanical.referenceDiameterM'),
      motorAftStationFromNoseM: num(mechanicalRaw.motorAftStationFromNoseM, 'candidateResult.model.mechanical.motorAftStationFromNoseM'),
      motorDesignation: textAllowEmpty(mechanicalRaw.motorDesignation, 'candidateResult.model.mechanical.motorDesignation'),
      drogue: drag(mechanicalRaw.drogue, 'candidateResult.model.mechanical.drogue'),
      main: drag(mechanicalRaw.main, 'candidateResult.model.mechanical.main') },
    environment: { launchAltitudeASL: num(environmentRaw.launchAltitudeASL, 'candidateResult.model.environment.launchAltitudeASL'),
      windSpeedSurfaceMps: num(environmentRaw.windSpeedSurfaceMps, 'candidateResult.model.environment.windSpeedSurfaceMps'),
      windAzimuthDeg: num(environmentRaw.windAzimuthDeg, 'candidateResult.model.environment.windAzimuthDeg'),
      environmentSourceId: text(environmentRaw.environmentSourceId, 'candidateResult.model.environment.environmentSourceId') },
  };

  const identitiesRaw = record(raw.identities, 'candidateResult.identities');
  const identityKeys = ['compositionId', 'staticProviderId', 'rateModelId', 'environmentModelId', 'mechanicalModelId',
    'supportPolicyId', 'calibrationPolicyId', 'canopyModelId', 'adapterId', 'callerSourceIdentity',
    'geometryIdentity', 'axialProviderId', 'axialInputIdentity', 'mechanicalSourceId', 'environmentSourceId'] as const;
  exact(identitiesRaw, 'candidateResult.identities', identityKeys);
  const identities = Object.fromEntries(identityKeys.map((key) => [key, text(identitiesRaw[key], `candidateResult.identities.${key}`)])) as CandidateResultArchive['identities'];
  const expectedIdentities: Record<string, string> = {
    staticProviderId: CANDIDATE_FLIGHT_MODEL.staticProviderId,
    rateModelId: CANDIDATE_FLIGHT_MODEL.rateModelId,
    mechanicalModelId: CANDIDATE_FLIGHT_MODEL.mechanicalModelId,
    supportPolicyId: CANDIDATE_SUPPORT_POLICY_ID,
    calibrationPolicyId: CANDIDATE_FLIGHT_MODEL.calibrationPolicyId,
    canopyModelId: CANDIDATE_CANOPY_MODEL_ID,
    adapterId: CANDIDATE_FLIGHT_MODEL.adapterId,
  };
  for (const [key, expected] of Object.entries(expectedIdentities)) {
    if (identities[key as keyof CandidateResultArchive['identities']] !== expected) {
      throw new Error(`candidateResult.identities.${key} is unsupported`);
    }
  }
  // The composition and environment model must be one consistent pair: either
  // the retained-atmosphere composition or the explicit-profile one. Without an
  // archived context this pairing is the strongest check available.
  const profileComposition = identities.compositionId === CANDIDATE_PROFILE_COMPOSITION_ID;
  if (raw.compositionId !== identities.compositionId) throw new Error('candidateResult compositionId disagrees with its identities');
  if (profileArchive !== profileComposition) throw new Error('candidateResult report schema disagrees with its composition');
  if (!profileComposition && identities.compositionId !== CANDIDATE_COMPOSITION_ID) {
    throw new Error('candidateResult.identities.compositionId is unsupported');
  }
  const expectedEnvironmentModel = profileComposition ? CANDIDATE_PROFILE_ENVIRONMENT_MODEL_ID : CANDIDATE_FLIGHT_MODEL.environmentId;
  if (identities.environmentModelId !== expectedEnvironmentModel) {
    throw new Error('candidateResult.identities.environmentModelId is unsupported for its composition');
  }

  const supportRaw = record(raw.supportPolicy, 'candidateResult.supportPolicy');
  exact(supportRaw, 'candidateResult.supportPolicy', ['machUpperExclusive', 'maxIncidenceDeg', 'notes']);
  const supportPolicy = { machUpperExclusive: num(supportRaw.machUpperExclusive, 'candidateResult.supportPolicy.machUpperExclusive'),
    maxIncidenceDeg: num(supportRaw.maxIncidenceDeg, 'candidateResult.supportPolicy.maxIncidenceDeg'),
    notes: strings(supportRaw.notes, 'candidateResult.supportPolicy.notes') };
  if (supportPolicy.machUpperExclusive !== CANDIDATE_SUPPORT_MACH_EXCLUSIVE
    || supportPolicy.maxIncidenceDeg !== CANDIDATE_SUPPORT_INCIDENCE_DEG) {
    throw new Error('candidateResult support policy limits are unsupported');
  }
  const limitations = strings(raw.limitations, 'candidateResult.limitations');

  if (archiveV2 && profileArchive !== hasProfileRecord) {
    throw new Error('candidateResult profile report and profile environment record disagree');
  }
  const parsedProfile: CandidateProfileEnvironmentArchive | null = hasProfileRecord
    ? profileEnvironment(raw.profileEnvironment, 'candidateResult.profileEnvironment') : null;
  let retention: CandidateRetention | null = null;
  if (archiveV2) {
    const retentionRaw = record(raw.retention, 'candidateResult.retention');
    exact(retentionRaw, 'candidateResult.retention', ['policyId', 'mode', 'sampleCount',
      'retainedSampleCount', 'collectionCapId', 'collectionCap']);
    retention = { policyId: text(retentionRaw.policyId, 'candidateResult.retention.policyId'),
      mode: text(retentionRaw.mode, 'candidateResult.retention.mode'),
      sampleCount: count(retentionRaw.sampleCount, 'candidateResult.retention.sampleCount'),
      retainedSampleCount: count(retentionRaw.retainedSampleCount, 'candidateResult.retention.retainedSampleCount'),
      collectionCapId: text(retentionRaw.collectionCapId, 'candidateResult.retention.collectionCapId'),
      collectionCap: count(retentionRaw.collectionCap, 'candidateResult.retention.collectionCap') };
    if (retention.policyId !== CANDIDATE_SAMPLE_POLICY_ID) throw new Error('candidateResult retention policy is unsupported');
    if (retention.mode !== 'reportBounded') throw new Error('candidateResult retention mode must be reportBounded for a saved run');
    if (retention.collectionCapId !== CANDIDATE_COLLECTION_CAP_ID || retention.collectionCap <= 0) {
      throw new Error('candidateResult collection cap declaration is unsupported');
    }
  }
  const sampleCount = retention === null ? count(raw.sampleCount, 'candidateResult.sampleCount') : retention.sampleCount;
  if (sampleCount === 0) throw new Error('candidateResult.sampleCount must be positive');
  if (retention !== null && retention.sampleCount !== count(raw.sampleCount, 'candidateResult.sampleCount')) {
    throw new Error('candidateResult sample count disagrees with its retention declaration');
  }
  if (!Array.isArray(raw.retainedSamples)) throw new Error('candidateResult.retainedSamples must be an array');
  const retainedSamples = raw.retainedSamples.map((s, i) => retainedSample(s, `candidateResult.retainedSamples[${i}]`));
  if (retainedSamples.length === 0 || retainedSamples.length > MAX_SAVED_TELEMETRY_POINTS || retainedSamples.length > sampleCount) {
    throw new Error('candidateResult retained sample count is invalid');
  }
  const declaredRetainedCount = Math.min(sampleCount, MAX_SAVED_TELEMETRY_POINTS);
  if (retainedSamples.length !== declaredRetainedCount) {
    throw new Error('candidateResult retained sample count disagrees with its declared retention policy');
  }
  if (retention !== null && retention.retainedSampleCount !== retainedSamples.length) {
    throw new Error('candidateResult retention declaration disagrees with the retained samples');
  }
  let previousSample = -Infinity;
  for (const sample of retainedSamples) {
    if (sample.timeS < previousSample || sample.timeS > finalTimeS) throw new Error('candidateResult retained samples are not ordered within the run');
    previousSample = sample.timeS;
  }
  if (raw.sampleArchivePolicyId !== CANDIDATE_SAMPLE_POLICY_ID) throw new Error('candidateResult sample policy is unsupported');
  if (prefix.sampleCount !== sampleCount) throw new Error('candidateResult observed-prefix sample count disagrees with the committed samples');
  if (retainedSamples[0].timeS !== 0 || retainedSamples[retainedSamples.length - 1].timeS !== finalTimeS) {
    throw new Error('candidateResult retained samples do not include the actual first and final sample');
  }
  const finalRetained = retainedSamples[retainedSamples.length - 1];
  if (stableStringify(finalRetained.positionM) !== stableStringify(finalState.positionM)
    || stableStringify(finalRetained.velocityMps) !== stableStringify(finalState.velocityMps)
    || stableStringify(finalRetained.flags) !== stableStringify(finalFlags)) {
    throw new Error('candidateResult retained final sample disagrees with the final state/flags');
  }
  for (const peakTime of [prefix.maxAltitudeTimeS, prefix.maxAirspeedTimeS, prefix.maxDynamicPressureTimeS]) {
    if (!retainedSamples.some((sample) => sample.timeS === peakTime)) {
      throw new Error('candidateResult retained samples lost an observed-prefix peak sample');
    }
  }
  // For decimated archives, nearest-neighbor event context is a writer property
  // not recoverable from the retained subset. The checkable import invariants
  // are the exact declared count, first/final samples, observed-prefix peaks,
  // and the final sample's state/flags. Do not claim adjacency from first/last alone.

  if (context !== undefined) {
    const invocation = context.request;
    const request = invocationCandidate(invocation);
    const profile = isProfileInvocation(invocation) ? invocation.environmentSelection : null;
    const selection = context.selection;
    if (request.query !== null) throw new Error('candidateResult context request must not carry an arbitrary query');
    if (requestedHorizonS !== request.horizonSeconds) throw new Error('candidateResult horizon disagrees with the archived request');
    if (stableStringify(requestedMachs) !== stableStringify(request.curveMachs)) throw new Error('candidateResult curve grid disagrees with the archived request');
    if (identities.callerSourceIdentity !== request.adapter.sourceIdentity) throw new Error('candidateResult source identity disagrees with the archived request');
    const expectedGeometry = `${CANDIDATE_FLIGHT_MODEL.adapterId}:${request.adapter.sourceIdentity}`;
    if (model.geometry.identity !== expectedGeometry) throw new Error('candidateResult geometry identity disagrees with the archived request');
    if (identities.geometryIdentity !== expectedGeometry) throw new Error('candidateResult geometry source disagrees with the archived request');
    if (identities.axialProviderId !== selection.axial.providerId || identities.axialInputIdentity !== selection.axial.inputIdentity) {
      throw new Error('candidateResult axial source disagrees with the archived selection');
    }
    if (identities.mechanicalSourceId !== request.mechanicalSourceId) throw new Error('candidateResult mechanical source disagrees with the archived request');
    if (profileComposition !== (profile !== null)) {
      throw new Error('candidateResult composition disagrees with the archived invocation kind');
    }
    if (profile === null) {
      if (identities.environmentSourceId !== request.environmentSourceId) throw new Error('candidateResult environment source disagrees with the archived request');
      if (model.environment.launchAltitudeASL !== request.environment.launchAltitudeASL
        || model.environment.windSpeedSurfaceMps !== request.environment.windSpeedSurfaceMps
        || model.environment.windAzimuthDeg !== request.environment.windAzimuthDeg
        || model.environment.environmentSourceId !== request.environmentSourceId) {
        throw new Error('candidateResult environment disagrees with the archived request');
      }
    } else {
      // The profile supplies the atmosphere, so the recorded environment is the
      // declared pad altitude, zero surface wind and the profile's source.
      const profileSource = (profile.profile.source as { identity?: unknown }).identity;
      if (typeof profileSource !== 'string' || identities.environmentSourceId !== profileSource) {
        throw new Error('candidateResult environment source disagrees with the archived profile');
      }
      if (model.environment.launchAltitudeASL !== profile.launchAltitudeGeometricMslM
        || model.environment.windSpeedSurfaceMps !== 0
        || model.environment.windAzimuthDeg !== 0
        || model.environment.environmentSourceId !== profileSource) {
        throw new Error('candidateResult environment disagrees with the archived profile selection');
      }
      if (parsedProfile === null) throw new Error('candidateResult profile run is missing its profile environment record');
    }
    if (model.mechanical.motorAftStationFromNoseM !== request.motorAftStationFromNoseM
      || model.mechanical.totalLengthM !== context.derivation.totalLengthM
      || request.motorAftStationFromNoseM !== context.derivation.motorAftStationFromNoseM) {
      throw new Error('candidateResult mechanical geometry/motor station disagrees with the archived derivation');
    }
  }

  const contentRaw = record(raw.contentIdentity, 'candidateResult.contentIdentity');
  exact(contentRaw, 'candidateResult.contentIdentity', ['schemeId', 'encodingId', 'sha256']);
  if (contentRaw.schemeId !== 'native-candidate-input-model-sha256/1.0.0'
    || contentRaw.encodingId !== 'astraea-typed-json-bits/1.0.0'
    || typeof contentRaw.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(contentRaw.sha256)) {
    throw new Error('candidateResult.contentIdentity is invalid');
  }

  return {
    schemaId: archiveV2 ? CANDIDATE_ARCHIVE_SCHEMA_ID : CANDIDATE_ARCHIVE_SCHEMA_V1_ID,
    reportSchemaId: archiveV2
      ? (profileArchive ? CANDIDATE_PROFILE_REPORT_SCHEMA_ID : CANDIDATE_REPORT_SCHEMA_ID)
      : CANDIDATE_REPORT_SCHEMA_V2_ID,
    resultSchemaId: CANDIDATE_RESULT_SCHEMA_ID,
    compositionId: raw.compositionId as CandidateResultArchive['compositionId'],
    status: 'experimental-unqualified',
    termination,
    computationalCompletion: completion,
    empiricalQualification: 'Unqualified',
    dynamicQualification: 'Unknown',
    requestedHorizonS,
    finalTimeS,
    finalState,
    finalFlags,
    landing: landingValue,
    apogeeEvent: apogeeValue,
    observedPrefix: prefix,
    events: eventList,
    query: queryValue,
    curves,
    equivalence,
    ...(archiveV2 && retention !== null ? { retention } : {}),
    ...(parsedProfile !== null ? { profileEnvironment: parsedProfile } : {}),
    model,
    identities,
    supportPolicy,
    limitations,
    sampleCount,
    retainedSamples,
    sampleArchivePolicyId: CANDIDATE_SAMPLE_POLICY_ID,
    contentIdentity: { schemeId: 'native-candidate-input-model-sha256/1.0.0',
      encodingId: 'astraea-typed-json-bits/1.0.0', sha256: contentRaw.sha256 },
  };
}

const ARCHIVE_CURVE_KEYS = ['mach', 'computationalStatus', 'dynamicPressurePa', 'flow',
  'coefficients', 'windCoefficients', 'normalDerivatives', 'cp', 'staticForceBodyN',
  'staticMomentCgBodyNm', 'aeroNegligibility', 'unavailable'] as const;

/** Report curve point -> archived point (per-point profile observations are run-level). */
function projectCurvePoint(value: unknown, path: string): Record<string, unknown> {
  const raw = record(value, path);
  const picked: Record<string, unknown> = {};
  for (const key of ARCHIVE_CURVE_KEYS) {
    if (!Object.hasOwn(raw, key)) throw new Error(`${path} is missing '${key}'`);
    picked[key] = raw[key];
  }
  return picked;
}

/** Keep the archive-equivalence shape; profile-only notes move to the profile record. */
function projectEquivalence(value: unknown): Record<string, unknown> {
  const raw = record(value, 'report.equivalence');
  const picked: Record<string, unknown> = {};
  for (const key of ['referenceSampleTimeS', 'referenceMach', 'queryMatchesReferenceSample', 'curveComparison', 'compared', 'note']) {
    if (!Object.hasOwn(raw, key)) throw new Error(`report.equivalence is missing '${key}'`);
    picked[key] = raw[key];
  }
  return picked;
}

/** Project the report curve block into the archived shape. */
function projectCurves(value: unknown): Record<string, unknown> {
  const raw = record(value, 'report.curves');
  exact(raw, 'report.curves', ['status', 'policyId', 'requestedMachs', 'referenceMachAddedForEquivalence', 'notApplicable', 'points']);
  return {
    status: raw.status,
    policyId: raw.policyId,
    requestedMachs: raw.requestedMachs,
    referenceMachAddedForEquivalence: raw.referenceMachAddedForEquivalence,
    notApplicable: raw.notApplicable,
    points: raw.points === null ? null
      : (raw.points as unknown[]).map((point, i) => projectCurvePoint(point, `report.curves.points[${i}]`)),
  };
}

/** Build the archive from the exact engine report. */
export function candidateResultFromReport(value: unknown, context?: CandidateResultContext): CandidateResultArchive {
  const report = record(value, 'report');
  const profileReport = report.schemaId === CANDIDATE_PROFILE_REPORT_SCHEMA_ID;
  if (!profileReport && report.schemaId !== CANDIDATE_REPORT_SCHEMA_ID) throw new Error('candidate report schema is unsupported');
  if (profileReport && context === undefined) throw new Error('a profile candidate report requires its archived invocation');
  if (profileReport && (context === undefined || !isProfileInvocation(context.request))) {
    throw new Error('a profile candidate report must be archived with a profile invocation');
  }
  if (!profileReport && context !== undefined && isProfileInvocation(context.request)) {
    throw new Error('a profile invocation must produce the profile candidate report schema');
  }
  if (report.resultSchemaId !== CANDIDATE_RESULT_SCHEMA_ID) throw new Error('candidate report result schema is unsupported');
  if (report.status !== 'experimental-unqualified') throw new Error('candidate report status is unsupported');
  const expectedComposition = profileReport ? CANDIDATE_PROFILE_COMPOSITION_ID : CANDIDATE_COMPOSITION_ID;
  if (report.compositionId !== expectedComposition) throw new Error('candidate report composition is unsupported');
  const trajectory = record(report.trajectory, 'report.trajectory');
  if (trajectory.schemaId !== CANDIDATE_RESULT_SCHEMA_ID) throw new Error('candidate report trajectory result schema is unsupported');
  if (trajectory.empiricalQualification !== 'Unqualified' || trajectory.dynamicQualification !== 'Unknown') {
    throw new Error('candidate report qualification is unsupported');
  }
  // Report 3.0.0 already applies the shared display-sample policy in the engine,
  // so the app stores what the engine declared instead of decimating a second
  // time (two implementations would drift). The declaration is still validated
  // against the samples that actually arrived.
  const retentionRaw = record(trajectory.retention, 'report.trajectory.retention');
  const declaredRetention: CandidateRetention = {
    policyId: text(retentionRaw.policyId, 'report.trajectory.retention.policyId'),
    mode: text(retentionRaw.mode, 'report.trajectory.retention.mode'),
    sampleCount: count(retentionRaw.sampleCount, 'report.trajectory.retention.sampleCount'),
    retainedSampleCount: count(retentionRaw.retainedSampleCount, 'report.trajectory.retention.retainedSampleCount'),
    collectionCapId: text(retentionRaw.collectionCapId, 'report.trajectory.retention.collectionCapId'),
    collectionCap: count(retentionRaw.collectionCap, 'report.trajectory.retention.collectionCap'),
  };
  if (declaredRetention.policyId !== CANDIDATE_SAMPLE_POLICY_ID) throw new Error('candidate report retention policy is unsupported');
  if (declaredRetention.mode !== 'reportBounded') throw new Error('candidate report retention mode is unsupported');
  if (declaredRetention.collectionCapId !== CANDIDATE_COLLECTION_CAP_ID) throw new Error('candidate report collection cap is unsupported');
  if (!Array.isArray(trajectory.samples) || trajectory.samples.length === 0) throw new Error('candidate report samples are missing');
  if (trajectory.samples.length !== declaredRetention.retainedSampleCount) {
    throw new Error('candidate report retained sample count disagrees with its declaration');
  }
  const retained = {
    sampleCount: declaredRetention.sampleCount,
    retainedSamples: (trajectory.samples as Record<string, unknown>[])
      .map((entry, i) => retainedFromEngineSample(entry, `report.trajectory.samples[${i}]`)),
  };
  const profileInvocation = profileReport && context !== undefined && isProfileInvocation(context.request)
    ? context.request : null;
  const profileSelection = (): EnvironmentSelection => {
    if (profileInvocation === null) throw new Error('profile selection is unavailable');
    return profileInvocation.environmentSelection;
  };
  const profileSourceIdentity = (): string => {
    const identity = environmentRaw.profileSourceIdentity;
    if (typeof identity === 'string') return identity;
    const fromIdentities = (report.identities as Record<string, unknown> | undefined)?.environmentSourceId;
    if (typeof fromIdentities === 'string') return fromIdentities;
    throw new Error('profile report is missing its source identity');
  };
  const queryRaw = record(report.query, 'report.query');
  const sample = record(queryRaw.sample, 'report.query.sample');
  const curvesRaw = record(report.curves, 'report.curves');
  const geometryRaw = record(report.geometry, 'report.geometry');
  const mechanicalRaw = record(report.mechanical, 'report.mechanical');
  const environmentRaw = record(report.environment, 'report.environment');
  const contentRaw = record(report.contentIdentity, 'report.contentIdentity');
  return parseCandidateResultArchive({
    schemaId: CANDIDATE_ARCHIVE_SCHEMA_ID,
    reportSchemaId: profileReport ? CANDIDATE_PROFILE_REPORT_SCHEMA_ID : CANDIDATE_REPORT_SCHEMA_ID,
    resultSchemaId: CANDIDATE_RESULT_SCHEMA_ID,
    compositionId: profileReport ? CANDIDATE_PROFILE_COMPOSITION_ID : CANDIDATE_COMPOSITION_ID,
    status: 'experimental-unqualified',
    termination: trajectory.termination,
    computationalCompletion: trajectory.computationalCompletion,
    empiricalQualification: 'Unqualified',
    dynamicQualification: 'Unknown',
    requestedHorizonS: trajectory.requestedHorizonS,
    finalTimeS: trajectory.finalTimeS,
    finalState: trajectory.finalState,
    finalFlags: trajectory.finalFlags,
    landing: trajectory.landing,
    apogeeEvent: trajectory.apogeeEvent,
    observedPrefix: trajectory.observedPrefix,
    events: report.events,
    query: { origin: queryRaw.origin, timeS: queryRaw.timeS,
      flags: sample.flags,
      applicability: sample.applicability,
      computationalStatus: sample.computationalStatus,
      state: sample.state,
      mechanics: sample.mechanics,
      flow: sample.flow,
      coefficients: sample.coefficients,
      windCoefficients: sample.windCoefficients,
      normalDerivatives: sample.normalDerivatives,
      cp: sample.cp,
      staticForceBodyN: sample.staticForceBodyN,
      staticMomentCgBodyNm: sample.staticMomentCgBodyNm,
      rateMomentBodyNm: sample.rateMomentBodyNm,
      canopyDragBodyN: sample.canopyDragBodyN,
      aeroForceBodyN: sample.aeroForceBodyN,
      aeroMomentCgBodyNm: sample.aeroMomentCgBodyNm,
      dragAlongWindN: sample.dragAlongWindN,
      aeroNegligibility: sample.aeroNegligibility,
      unavailable: sample.unavailable },
    curves: projectCurves(curvesRaw),
    equivalence: projectEquivalence(report.equivalence),
    model: {
      geometry: { identity: geometryRaw.identity, areaM2: geometryRaw.areaM2, lengthM: geometryRaw.lengthM,
        diameterM: geometryRaw.diameterM, bodyLengthM: geometryRaw.bodyLengthM },
      mechanical: { dryMassKg: mechanicalRaw.dryMassKg, cgFromNoseM: mechanicalRaw.cgFromNoseM,
        totalLengthM: mechanicalRaw.totalLengthM, referenceDiameterM: mechanicalRaw.referenceDiameterM,
        motorAftStationFromNoseM: mechanicalRaw.motorAftStationFromNoseM,
        motorDesignation: mechanicalRaw.motorDesignation, drogue: mechanicalRaw.drogue, main: mechanicalRaw.main },
      environment: profileReport
        ? {
            launchAltitudeASL: profileSelection().launchAltitudeGeometricMslM,
            windSpeedSurfaceMps: 0,
            windAzimuthDeg: 0,
            environmentSourceId: profileSourceIdentity(),
          }
        : { launchAltitudeASL: environmentRaw.launchAltitudeASL,
            windSpeedSurfaceMps: environmentRaw.windSpeedSurfaceMps,
            windAzimuthDeg: environmentRaw.windAzimuthDeg,
            environmentSourceId: environmentRaw.environmentSourceId },
    },
    ...(profileReport ? { profileEnvironment: {
      environmentModelId: text(environmentRaw.environmentModelId, 'report.environment.environmentModelId'),
      profileSourceIdentity: profileSourceIdentity(),
      verticalDatumIdentity: text(environmentRaw.verticalDatumIdentity, 'report.environment.verticalDatumIdentity'),
      launchTimeUtcUnixS: profileSelection().launchTimeUtcUnixS,
      launchAltitudeGeometricMslM: profileSelection().launchAltitudeGeometricMslM,
      axialSourceNote: textAllowEmpty(environmentRaw.axialSourceNote, 'report.environment.axialSourceNote'),
      queryObservationExact: bool((report.equivalence as Record<string, unknown>).profileObservationQueryExact,
        'report.equivalence.profileObservationQueryExact'),
      curveSourceShared: bool((report.equivalence as Record<string, unknown>).profileSourceSharedByCurve,
        'report.equivalence.profileSourceSharedByCurve'),
    } } : {}),
    identities: report.identities,
    supportPolicy: report.supportPolicy,
    limitations: report.limitations,
    sampleCount: retained.sampleCount,
    retainedSamples: retained.retainedSamples,
    retention: declaredRetention,
    sampleArchivePolicyId: CANDIDATE_SAMPLE_POLICY_ID,
    contentIdentity: { schemeId: contentRaw.schemeId, encodingId: contentRaw.encodingId, sha256: contentRaw.sha256 },
  }, context);
}

/** The shared landing-availability question for a candidate record. */
export function candidateLandingAvailability(result: CandidateResultArchive): LandingAvailability {
  if (result.landing !== null) return { available: true };
  return { available: false, reason: result.termination === 'TimeLimit'
    ? 'run stopped at the requested horizon; no touchdown was produced'
    : 'no touchdown record was produced' };
}

export const CANDIDATE_OUTPUT_IDS = [
  'termination', 'computationalCompletion', 'finalTime', 'finalAltitude',
  'observedPrefixMaxAltitude', 'observedPrefixMaxAltitudeTime',
  'observedPrefixMaxAirspeed', 'observedPrefixMaxAirspeedTime',
  'observedPrefixMaxDynamicPressure', 'observedPrefixMaxDynamicPressureTime',
  'landingSpeed', 'landingMass', 'eventCount', 'committedSampleCount', 'retainedSampleCount',
] as const;
export type CandidateOutputId = (typeof CANDIDATE_OUTPUT_IDS)[number];

export const CANDIDATE_OUTPUT_LABELS: Readonly<Record<CandidateOutputId, string>> = {
  termination: 'Termination',
  computationalCompletion: 'Computational completion',
  finalTime: 'Final time (requested stop)',
  finalAltitude: 'Final altitude AGL',
  observedPrefixMaxAltitude: 'Observed prefix max altitude (not apogee)',
  observedPrefixMaxAltitudeTime: 'Observed prefix max altitude time',
  observedPrefixMaxAirspeed: 'Observed prefix max airspeed',
  observedPrefixMaxAirspeedTime: 'Observed prefix max airspeed time',
  observedPrefixMaxDynamicPressure: 'Observed prefix max dynamic pressure',
  observedPrefixMaxDynamicPressureTime: 'Observed prefix max dynamic pressure time',
  landingSpeed: 'Landing speed (actual touchdown)',
  landingMass: 'Landing mass (actual touchdown)',
  eventCount: 'Recorded event count',
  committedSampleCount: 'Committed sample count',
  retainedSampleCount: 'Retained display sample count',
};

export interface CandidateOutput {
  value: number | string | null;
  unit: string;
  confidence: Confidence;
  available: boolean;
  reason?: string;
  unavailableReason?: string;
  observed: boolean;
}

const UNQUALIFIED = 'Experimental candidate observation; unqualified and not a measured or released model result.';
const OBSERVED = 'Observed prefix statistic defined by the engine sampling policy; not a predicted final apogee or maximum.';

/** One candidate numeric/status projection used by live, saved and trace readouts. */
export function candidateOutputDictionary(result: CandidateResultArchive): Record<CandidateOutputId, CandidateOutput> {
  const landing = candidateLandingAvailability(result);
  const landingRecord = result.landing;
  const numeric = (value: number, unit: string, observed: boolean, reason = UNQUALIFIED): CandidateOutput => ({
    value, unit, confidence: 'unknown', available: true, reason, observed,
  });
  const unavailable = (unit: string, reason: string, observed: boolean): CandidateOutput => ({
    value: null, unit, confidence: 'unknown', available: false, unavailableReason: reason, observed,
  });
  return {
    termination: { value: result.termination, unit: '', confidence: 'unknown', available: true, reason: UNQUALIFIED, observed: false },
    computationalCompletion: { value: result.computationalCompletion, unit: '', confidence: 'unknown', available: true, reason: UNQUALIFIED, observed: false },
    finalTime: numeric(result.finalTimeS, 's', false),
    finalAltitude: numeric(result.finalState.positionM[2], 'm', false),
    observedPrefixMaxAltitude: numeric(result.observedPrefix.maxAltitudeAglM, 'm', true, OBSERVED),
    observedPrefixMaxAltitudeTime: numeric(result.observedPrefix.maxAltitudeTimeS, 's', true, OBSERVED),
    observedPrefixMaxAirspeed: numeric(result.observedPrefix.maxAirspeedMps, 'm/s', true, OBSERVED),
    observedPrefixMaxAirspeedTime: numeric(result.observedPrefix.maxAirspeedTimeS, 's', true, OBSERVED),
    observedPrefixMaxDynamicPressure: numeric(result.observedPrefix.maxDynamicPressurePa, 'Pa', true, OBSERVED),
    observedPrefixMaxDynamicPressureTime: numeric(result.observedPrefix.maxDynamicPressureTimeS, 's', true, OBSERVED),
    landingSpeed: landingRecord ? numeric(landingRecord.speedMps, 'm/s', false) : unavailable('m/s', landing.available ? 'no landing record' : landing.reason, false),
    landingMass: landingRecord ? numeric(landingRecord.massKg, 'kg', false) : unavailable('kg', landing.available ? 'no landing record' : landing.reason, false),
    eventCount: numeric(result.events.length, '', false),
    committedSampleCount: numeric(result.sampleCount, '', false),
    retainedSampleCount: numeric(result.retainedSamples.length, '', false),
  };
}
