import { FIN_INTERFERENCE_ID } from '../aero/barrowman';

/**
 * Supported saved-project flight-model selection boundary.
 *
 * Two explicit selections exist:
 *  - the current legacy app contract (signed normal force + wind drag);
 *  - the explicit experimental native candidate composition exposed by
 *    `simulate_candidate`. It is opt-in, unqualified and carries the physical
 *    declarations and adapter settings the runtime requires.
 *
 * A selection is a caller declaration, not a content digest, exact executable
 * identity or qualification claim. Absent remains legacy. Unknown selections
 * never become legacy.
 */

export const LEGACY_FLIGHT_MODEL = Object.freeze({
  schemaId: 'astraea-flight-model-selection/1.0.0',
  modelId: 'flight-signed-normal-plus-wind-drag-v1',
  environmentId: 'legacy-isa1976-powerlaw-wind/1.0.0',
  mechanicalModelId: 'legacy-primitive-mass-inertia/1.0.0',
  calibrationPolicyId: 'legacy-global-airframe-cd-scale/1.0.0',
} as const);

export const CANDIDATE_FLIGHT_MODEL = Object.freeze({
  schemaId: 'astraea-flight-model-selection/2.0.0',
  modelId: 'native-candidate-static-rate/1.0.0',
  compositionId: 'candidate-static-rate-composition/1.0.0',
  staticProviderId: 'static-body-total-SB1/1.0.0',
  rateModelId: 'legacy-dimensional-rate-couple/1.0.0',
  environmentId: 'legacy-isa1976-powerlaw-wind/1.0.0',
  mechanicalModelId: 'legacy-primitive-mass-inertia/1.0.0',
  calibrationPolicyId: 'no-historical-calibration/1.0.0',
  adapterId: 'frontend-external-profile-SB1/1.0.0',
  projectionId: 'candidate-app-frontend-dto-projection/1.0.0',
} as const);

/**
 * Normal-force law identity carried by run outputs (run manifest and moment
 * arm history), distinct from the historical assembly id above.
 *
 * `LEGACY_FLIGHT_MODEL.modelId` is deliberately unchanged: saved projects and
 * calibration bindings written before this addition must keep parsing, and
 * the old id still names the signed-normal-plus-wind-drag assembly. The
 * normal-law keys below say which law actually evaluated the run.
 */
export const NORMAL_LAW_LEGACY = 'legacy-finsonly-degrade-v1' as const;
export const NORMAL_LAW_PUBLISHED = 'published-supersonic-normal-v1' as const;
export const BOATTAIL_POLICIES = ['suppressed', 'attached', 'not-applicable'] as const;
export type NormalLawId = typeof NORMAL_LAW_LEGACY | typeof NORMAL_LAW_PUBLISHED;
export type BoattailPolicy = (typeof BOATTAIL_POLICIES)[number];

/**
 * Fin-body interference station identity carried by run outputs. Separate
 * from the normal-law identity: the station rule changes the Barrowman fin
 * slope at every Mach. Absent on archives written before P4.
 */
export { FIN_INTERFERENCE_ID };
/** Current label first; the pre-fix-round P4 label is accepted on read. */
export const FIN_INTERFERENCE_IDS = ['fin-station-v1', FIN_INTERFERENCE_ID] as const;
export type FinInterferenceId = (typeof FIN_INTERFERENCE_IDS)[number];

export type LegacyFlightModelSelection = typeof LEGACY_FLIGHT_MODEL;

export interface CandidateFlightModelSelection {
  readonly schemaId: typeof CANDIDATE_FLIGHT_MODEL.schemaId;
  readonly modelId: typeof CANDIDATE_FLIGHT_MODEL.modelId;
  readonly compositionId: typeof CANDIDATE_FLIGHT_MODEL.compositionId;
  readonly staticProviderId: typeof CANDIDATE_FLIGHT_MODEL.staticProviderId;
  readonly rateModelId: typeof CANDIDATE_FLIGHT_MODEL.rateModelId;
  readonly environmentId: typeof CANDIDATE_FLIGHT_MODEL.environmentId;
  readonly mechanicalModelId: typeof CANDIDATE_FLIGHT_MODEL.mechanicalModelId;
  readonly calibrationPolicyId: typeof CANDIDATE_FLIGHT_MODEL.calibrationPolicyId;
  readonly adapterId: typeof CANDIDATE_FLIGHT_MODEL.adapterId;
  readonly projectionId: typeof CANDIDATE_FLIGHT_MODEL.projectionId;
  readonly axial: {
    /** Explicit prescribed total axial force coefficient; zero is a real declaration. */
    readonly ca0: number;
    readonly providerId: string;
    /** Source and power condition; never a measurement implied by the app. */
    readonly inputIdentity: string;
  };
  readonly declarations: {
    readonly provenance: string;
    readonly sharpPhysicalTip: true;
    readonly circularAxisymmetricBody: true;
    readonly smoothSlenderProfile: true;
    readonly identicalEquallySpacedThinUncantedFins: true;
    readonly noOtherExternalFeaturesOrUnmodeledInterferences: true;
    readonly sourceRepresentsCompleteExternalGeometry: true;
  };
  readonly ogiveInterpretation: 'tangentOgive' | null;
  readonly transitionInterpretation: 'conical' | null;
  readonly quadrature: {
    readonly absoluteToleranceM3: number;
    readonly relativeTolerance: number;
    readonly maxPanels: number;
  };
  /** SHA-256 of the candidate DTO vehicle at acknowledgment; a design-document hash. */
  readonly declarationVehicleSha256: string;
  readonly declaredAt: string;
  readonly horizonSeconds: number;
  readonly timeStepS: number;
  /** Sorted unique request Machs; each 0 <= M < 0.8. */
  readonly curveMachs: readonly number[];
}

export type FlightModelSelection =
  | LegacyFlightModelSelection
  | CandidateFlightModelSelection;

const CANDIDATE_KEYS = [
  'schemaId', 'modelId', 'compositionId', 'staticProviderId', 'rateModelId',
  'environmentId', 'mechanicalModelId', 'calibrationPolicyId', 'adapterId',
  'projectionId', 'axial', 'declarations', 'ogiveInterpretation',
  'transitionInterpretation', 'quadrature', 'declarationVehicleSha256',
  'declaredAt', 'horizonSeconds', 'timeStepS', 'curveMachs',
] as const;

const AXIAL_KEYS = ['ca0', 'providerId', 'inputIdentity'] as const;
const DECLARATION_KEYS = [
  'provenance', 'sharpPhysicalTip', 'circularAxisymmetricBody',
  'smoothSlenderProfile', 'identicalEquallySpacedThinUncantedFins',
  'noOtherExternalFeaturesOrUnmodeledInterferences',
  'sourceRepresentsCompleteExternalGeometry',
] as const;
const QUADRATURE_KEYS = ['absoluteToleranceM3', 'relativeTolerance', 'maxPanels'] as const;

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exact(raw: Record<string, unknown>, path: string, keys: readonly string[]): void {
  const actual = Object.keys(raw).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new Error(`${path} must declare exactly ${expected.join(', ')}`);
  }
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function exactValue(value: unknown, expected: string, path: string): void {
  if (value !== expected) throw new Error(`${path} must be '${expected}'`);
}

function literalTrue(value: unknown, path: string): true {
  if (value !== true) throw new Error(`${path} must be the literal true (explicit declaration)`);
  return true;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** The immutable legacy descriptor, or a refusal. */
export function parseLegacyFlightModel(value: unknown): LegacyFlightModelSelection {
  const raw = record(value, 'flightModel');
  const keys = Object.keys(LEGACY_FLIGHT_MODEL) as Array<keyof LegacyFlightModelSelection>;
  if (Object.keys(raw).length !== keys.length
    || keys.some((key) => !Object.prototype.hasOwnProperty.call(raw, key) || raw[key] !== LEGACY_FLIGHT_MODEL[key])) {
    throw new Error('unsupported legacy flightModel selection/version/environment/mechanics/calibration policy; no fallback');
  }
  return LEGACY_FLIGHT_MODEL;
}

/** The immutable candidate descriptor, or a refusal. */
export function parseCandidateFlightModel(value: unknown): CandidateFlightModelSelection {
  const raw = record(value, 'flightModel');
  exact(raw, 'flightModel', CANDIDATE_KEYS);
  for (const key of ['schemaId', 'modelId', 'compositionId', 'staticProviderId',
    'rateModelId', 'environmentId', 'mechanicalModelId', 'calibrationPolicyId',
    'adapterId', 'projectionId'] as const) {
    exactValue(raw[key], CANDIDATE_FLIGHT_MODEL[key], `flightModel.${key}`);
  }

  const axialRaw = record(raw.axial, 'flightModel.axial');
  exact(axialRaw, 'flightModel.axial', AXIAL_KEYS);
  const ca0 = finite(axialRaw.ca0, 'flightModel.axial.ca0');
  if (ca0 < 0) throw new Error('flightModel.axial.ca0 must be nonnegative');
  const providerId = text(axialRaw.providerId, 'flightModel.axial.providerId');
  const inputIdentity = text(axialRaw.inputIdentity, 'flightModel.axial.inputIdentity');

  const declarationsRaw = record(raw.declarations, 'flightModel.declarations');
  exact(declarationsRaw, 'flightModel.declarations', DECLARATION_KEYS);
  const declarations = {
    provenance: text(declarationsRaw.provenance, 'flightModel.declarations.provenance'),
    sharpPhysicalTip: literalTrue(declarationsRaw.sharpPhysicalTip, 'flightModel.declarations.sharpPhysicalTip'),
    circularAxisymmetricBody: literalTrue(declarationsRaw.circularAxisymmetricBody, 'flightModel.declarations.circularAxisymmetricBody'),
    smoothSlenderProfile: literalTrue(declarationsRaw.smoothSlenderProfile, 'flightModel.declarations.smoothSlenderProfile'),
    identicalEquallySpacedThinUncantedFins: literalTrue(declarationsRaw.identicalEquallySpacedThinUncantedFins, 'flightModel.declarations.identicalEquallySpacedThinUncantedFins'),
    noOtherExternalFeaturesOrUnmodeledInterferences: literalTrue(declarationsRaw.noOtherExternalFeaturesOrUnmodeledInterferences, 'flightModel.declarations.noOtherExternalFeaturesOrUnmodeledInterferences'),
    sourceRepresentsCompleteExternalGeometry: literalTrue(declarationsRaw.sourceRepresentsCompleteExternalGeometry, 'flightModel.declarations.sourceRepresentsCompleteExternalGeometry'),
  } as const;

  const ogive = raw.ogiveInterpretation;
  if (ogive !== null && ogive !== 'tangentOgive') {
    throw new Error("flightModel.ogiveInterpretation must be 'tangentOgive' or null");
  }
  const transition = raw.transitionInterpretation;
  if (transition !== null && transition !== 'conical') {
    throw new Error("flightModel.transitionInterpretation must be 'conical' or null");
  }

  const quadRaw = record(raw.quadrature, 'flightModel.quadrature');
  exact(quadRaw, 'flightModel.quadrature', QUADRATURE_KEYS);
  const absoluteToleranceM3 = finite(quadRaw.absoluteToleranceM3, 'flightModel.quadrature.absoluteToleranceM3');
  const relativeTolerance = finite(quadRaw.relativeTolerance, 'flightModel.quadrature.relativeTolerance');
  if (absoluteToleranceM3 <= 0 || relativeTolerance < 0 || relativeTolerance >= 1) {
    throw new Error('flightModel.quadrature tolerances must be positive (relative < 1)');
  }
  const maxPanels = finite(quadRaw.maxPanels, 'flightModel.quadrature.maxPanels');
  if (!Number.isInteger(maxPanels) || maxPanels <= 0) {
    throw new Error('flightModel.quadrature.maxPanels must be a positive integer');
  }

  const declarationVehicleSha256 = raw.declarationVehicleSha256;
  if (typeof declarationVehicleSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(declarationVehicleSha256)) {
    throw new Error('flightModel.declarationVehicleSha256 must be 64 lowercase hex characters');
  }
  const declaredAt = raw.declaredAt;
  if (typeof declaredAt !== 'string' || Number.isNaN(Date.parse(declaredAt))
    || new Date(declaredAt).toISOString() !== declaredAt) {
    throw new Error('flightModel.declaredAt must be a canonical ISO-8601 timestamp');
  }

  const horizonSeconds = finite(raw.horizonSeconds, 'flightModel.horizonSeconds');
  if (horizonSeconds <= 0) throw new Error('flightModel.horizonSeconds must be positive');
  const timeStepS = finite(raw.timeStepS, 'flightModel.timeStepS');
  if (timeStepS <= 0) throw new Error('flightModel.timeStepS must be positive');

  if (!Array.isArray(raw.curveMachs) || raw.curveMachs.length === 0 || raw.curveMachs.length > 64) {
    throw new Error('flightModel.curveMachs must contain 1..64 Mach values');
  }
  const curveMachs: number[] = [];
  for (const [i, entry] of raw.curveMachs.entries()) {
    const value = finite(entry, `flightModel.curveMachs[${i}]`);
    if (value < 0 || value >= 0.8) throw new Error(`flightModel.curveMachs[${i}] must satisfy 0 <= M < 0.8`);
    if (i > 0 && value <= curveMachs[i - 1]) throw new Error('flightModel.curveMachs must be strictly increasing');
    curveMachs.push(value);
  }

  return deepFreeze({
    schemaId: CANDIDATE_FLIGHT_MODEL.schemaId,
    modelId: CANDIDATE_FLIGHT_MODEL.modelId,
    compositionId: CANDIDATE_FLIGHT_MODEL.compositionId,
    staticProviderId: CANDIDATE_FLIGHT_MODEL.staticProviderId,
    rateModelId: CANDIDATE_FLIGHT_MODEL.rateModelId,
    environmentId: CANDIDATE_FLIGHT_MODEL.environmentId,
    mechanicalModelId: CANDIDATE_FLIGHT_MODEL.mechanicalModelId,
    calibrationPolicyId: CANDIDATE_FLIGHT_MODEL.calibrationPolicyId,
    adapterId: CANDIDATE_FLIGHT_MODEL.adapterId,
    projectionId: CANDIDATE_FLIGHT_MODEL.projectionId,
    axial: { ca0, providerId, inputIdentity },
    declarations,
    ogiveInterpretation: ogive,
    transitionInterpretation: transition,
    quadrature: { absoluteToleranceM3, relativeTolerance, maxPanels },
    declarationVehicleSha256,
    declaredAt,
    horizonSeconds,
    timeStepS,
    curveMachs: Object.freeze(curveMachs),
  });
}

/** No unknown provider/source/policy may silently become legacy on load. */
export function parseFlightModel(value: unknown): FlightModelSelection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('flightModel must be a supported explicit selection object');
  }
  const schemaId = (value as Record<string, unknown>).schemaId;
  if (schemaId === LEGACY_FLIGHT_MODEL.schemaId) return parseLegacyFlightModel(value);
  if (schemaId === CANDIDATE_FLIGHT_MODEL.schemaId) return parseCandidateFlightModel(value);
  throw new Error('unsupported flightModel selection/version/environment/mechanics/calibration policy; no fallback');
}

/** Old/no-selection documents remain legacy, without rewriting their history. */
export function resolveFlightModel(value: unknown): FlightModelSelection {
  return value === undefined ? LEGACY_FLIGHT_MODEL : parseFlightModel(value);
}

export function isCandidateFlightModel(value: FlightModelSelection): value is CandidateFlightModelSelection {
  return value.schemaId === CANDIDATE_FLIGHT_MODEL.schemaId;
}
