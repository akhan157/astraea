/**
 * Explicit candidate application contract.
 *
 * This module owns the one translation from project state to the accepted
 * `simulate_candidate` request. It does not change the runtime, physical
 * support or numerical policy. A candidate selection is opt-in and every
 * physical declaration comes from the caller; nothing here invents an axial
 * source, a mount, a calibration or an empirical result.
 */
import type { RocketVehicle, RocketComponent } from '../core/types';
import type { VehicleMassRollup } from '../core/mass';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { hashHex, stableStringify, type LaunchOptions } from './caseResolver';
import {
  CANDIDATE_FLIGHT_MODEL,
  type CandidateFlightModelSelection,
} from './flightModel';
import { vehicleDto, motorDto, type VehicleDto } from '../tauri/dto';

/** Adapter/quadrature defaults are visible and editable; they are not physical claims. */
export const CANDIDATE_DEFAULTS = Object.freeze({
  quadrature: Object.freeze({ absoluteToleranceM3: 1e-14, relativeTolerance: 1e-10, maxPanels: 4096 }),
  horizonSeconds: 300,
  timeStepS: 0.01,
  curveMachs: Object.freeze([0.02, 0.05, 0.1, 0.2, 0.4, 0.6, 0.79]),
} as const);

export const CANDIDATE_REFUSAL = Object.freeze({
  mountTopology: 'motor-mount internal/external topology ambiguous: the accepted SB1 adapter refuses a flagged motor mount. No legacy model will be run.',
  preview: 'Live preview is not available for the experimental candidate model; it would require the legacy engine. Run the candidate case instead.',
  ensemble: 'Monte Carlo / ensembles are unsupported by the selected experimental candidate contract. No legacy ensemble was run.',
  legacyAero: 'The legacy drag preview and Barrowman stability assembly are not evaluated while the candidate model is selected.',
  copilot: 'Copilot flight and stability checks are not evaluated for the experimental candidate model. No legacy engine result is substituted.',
  calibration: 'The retained drag calibration is inactive: the candidate model does not transfer historical calibration, fit or CP-derived drag.',
  momentArm: 'Moment-arm history is a legacy flight readout and is not produced by the candidate model.',
  kml: 'KML export needs a current legacy telemetry run; candidate cases have no such record.',
  arbitraryQuery: 'Only the candidate run same-state query is presented; an arbitrary user state query is not offered.',
  modelChanged: 'The design or declaration changed after the candidate selection was acknowledged. Re-check the declarations and re-acknowledge before running.',
} as const);

export interface CandidateIssue {
  readonly code:
    | 'motor-unresolved'
    | 'mount-topology'
    | 'unsupported-kind'
    | 'freeform'
    | 'nose'
    | 'transition'
    | 'body-continuity'
    | 'body'
    | 'fins'
    | 'internal'
    | 'cant'
    | 'altitude'
    | 'profile'
    | 'declaration'
    | 'input';
  readonly message: string;
  readonly componentId?: string;
}

/** Exact request DTOs accepted by the merged runtime (camelCase, strict). */
export interface NativeCandidateRequest {
  vehicle: VehicleDto;
  motor: Record<string, unknown>;
  adapter: {
    sourceIdentity: string;
    declarations: {
      provenance: string;
      sharpPhysicalTip: true;
      circularAxisymmetricBody: true;
      smoothSlenderProfile: true;
      identicalEquallySpacedThinUncantedFins: true;
      noOtherExternalFeaturesOrUnmodeledInterferences: true;
      sourceRepresentsCompleteExternalGeometry: true;
    };
    transitionInterpretation: 'conical' | null;
    ogiveInterpretation: 'tangentOgive' | null;
    aftTermination: 'flatExposedBaseAtFinalStation';
    internalNonGeometryIds: string[];
    quadrature: { absoluteToleranceM3: number; relativeTolerance: number; maxPanels: number };
  };
  mechanicalSourceId: string;
  environmentSourceId: string;
  axial: { ca0: number; providerId: string; inputIdentity: string };
  environment: { launchAltitudeASL: number; windSpeedSurfaceMps: number; windAzimuthDeg: number };
  motorAftStationFromNoseM: number;
  launch: {
    railLengthM: number;
    railElevationDeg: number;
    railAzimuthDeg: number;
    mainDeployAltitudeAglM: number;
    timeStepS: number;
    dragCdScale: null;
    finCantAngleDeg: null;
  };
  horizonSeconds: number;
  curveMachs: number[];
  query: null;
}

/** The engine's documented E1 profile envelope id (historical "native" wording). */
export const PROFILE_ENVELOPE_SCHEMA_ID = 'native-E1-profile-candidate-request/1.0.0';

/**
 * Explicit E1 environment selection, verbatim from the engine contract:
 * declared launch epoch, geometric-MSL altitude, vertical datum and the typed
 * profile (source identity, units, interpolation, validity window, knots).
 */
export interface EnvironmentSelection {
  launchTimeUtcUnixS: number;
  launchAltitudeGeometricMslM: number;
  verticalDatumIdentity: string;
  profile: Record<string, unknown>;
}

/** The exact dispatched envelope when an E1 profile supplies the atmosphere. */
export interface ProfileCandidateInvocation {
  schemaId: typeof PROFILE_ENVELOPE_SCHEMA_ID;
  candidate: NativeCandidateRequest;
  environmentSelection: EnvironmentSelection;
}

/** Archived-and-dispatched request: untagged, or the explicit profile envelope. */
export type CandidateInvocation = NativeCandidateRequest | ProfileCandidateInvocation;

export function isProfileInvocation(value: CandidateInvocation): value is ProfileCandidateInvocation {
  return 'schemaId' in value;
}

/** The airframe/launch request inside either invocation shape. */
export function invocationCandidate(value: CandidateInvocation): NativeCandidateRequest {
  return isProfileInvocation(value) ? value.candidate : value;
}

export interface CandidateMotorDerivation {
  readonly projectionId: string;
  readonly source: 'aggregate_mass';
  readonly mountComponentId: null;
  readonly mountStartM: null;
  readonly mountLengthM: null;
  readonly totalLengthM: number;
  readonly motorAftStationFromNoseM: number;
}

const ALLOWED_KINDS = new Set(['nosecone', 'bodytube', 'transition', 'trapezoidfinset', 'masscomponent', 'parachute']);
const INTERNAL_KINDS = new Set(['masscomponent', 'parachute']);

function isFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return isFinite(value) && value > 0;
}

function componentRadius(c: RocketComponent): number | null {
  if (c.type === 'nosecone') return c.baseDiameter / 2;
  if (c.type === 'bodytube') return c.outerDiameter / 2;
  if (c.type === 'transition') return c.foreDiameter / 2;
  return null;
}

function componentAftRadius(c: RocketComponent): number | null {
  if (c.type === 'nosecone') return c.baseDiameter / 2;
  if (c.type === 'bodytube') return c.outerDiameter / 2;
  if (c.type === 'transition') return c.aftDiameter / 2;
  return null;
}

/**
 * Coarse application preflight. The engine adapter remains the exact authority;
 * this gate makes the user-visible refusals explicit and refuses the accepted
 * adapter's known ambiguity (a flagged motor mount) before dispatch.
 */
export function candidatePreflight(
  vehicle: RocketVehicle,
  selection: CandidateFlightModelSelection,
  motor: MotorSpec | null,
  launch: LaunchOptions,
  currentVehicleSha256?: string,
  profile: EnvironmentSelection | null = null,
): CandidateIssue[] {
  const issues: CandidateIssue[] = [];
  if (profile !== null) {
    // The engine refuses a profile combined with a retained surface wind and
    // requires the pad altitude to come from the declaration.
    if (launch.windSpeedMps !== 0) {
      issues.push({ code: 'profile', message: `The E1 profile supplies the wind field; set the surface wind to 0 m/s for this run (workspace has ${launch.windSpeedMps}).` });
    }
    if (launch.windAzimuthDeg !== 0) {
      issues.push({ code: 'profile', message: 'The E1 profile supplies the wind field; the workspace surface wind azimuth is not used and must be 0 degrees.' });
    }
  }
  if (motor === null) {
    issues.push({ code: 'motor-unresolved', message: 'Assign a resolved motor before using the candidate model.' });
  }
  if (launch.finCantDeg !== 0) {
    issues.push({ code: 'cant', message: `The candidate SB1 composition requires exactly 0 degrees fin cant; the workspace has ${launch.finCantDeg}.` });
  }
  const altitude = profile === null ? (vehicle.launchSite?.altitudeM ?? 0) : profile.launchAltitudeGeometricMslM;
  if (!Number.isFinite(altitude) || altitude < 0 || altitude > 20_000) {
    issues.push({ code: 'altitude', message: profile === null
      ? `The retained candidate atmosphere supports 0..20000 m ASL; the vehicle site is ${String(altitude)} m.`
      : `The E1 profile declares a pad altitude outside 0..20000 m (${String(altitude)} m).` });
  }
  if (currentVehicleSha256 !== undefined && currentVehicleSha256 !== selection.declarationVehicleSha256) {
    issues.push({ code: 'declaration', message: CANDIDATE_REFUSAL.modelChanged });
  }

  const components = vehicle.components;
  if (components.length === 0) issues.push({ code: 'input', message: 'The vehicle has no components.' });
  const noseIndex = components.findIndex((c) => c.type === 'nosecone');
  if (noseIndex !== 0) issues.push({ code: 'nose', message: 'The external chain must begin with exactly one nose cone.' });
  if (components.filter((c) => c.type === 'nosecone').length !== 1) {
    issues.push({ code: 'nose', message: 'Exactly one nose cone is required.' });
  }

  let previousRadius: number | null = null;
  let host: { id: string; start: number; end: number } | null = null;
  let station = 0;
  let finSets = 0;
  for (const [index, c] of components.entries()) {
    if (!ALLOWED_KINDS.has(c.type)) {
      issues.push({ code: 'unsupported-kind', componentId: c.id, message: `Unsupported candidate external component kind '${c.type}'.` });
      continue;
    }
    if (c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset' || c.type === 'freeformfinset') {
      // Elliptical/freeform are refused by the adapter; trapezoid is checked below.
    }
    if ('isMotorMount' in c && c.isMotorMount === true) {
      issues.push({ code: 'mount-topology', componentId: c.id, message: CANDIDATE_REFUSAL.mountTopology });
    }
    if (INTERNAL_KINDS.has(c.type)) continue;

    if (c.type === 'trapezoidfinset') {
      finSets += 1;
      if (finSets > 1) {
        issues.push({ code: 'fins', componentId: c.id, message: 'Exactly one trapezoidal fin set is supported.' });
        continue;
      }
      if (c.finCount !== 3 && c.finCount !== 4) {
        issues.push({ code: 'fins', componentId: c.id, message: 'Exactly three or four fins are required.' });
      }
      if (!host) {
        issues.push({ code: 'fins', componentId: c.id, message: 'Fins require a preceding external body tube.' });
        continue;
      }
      const offset = c.axialOffset ?? 0;
      if (![c.rootChord, c.tipChord, c.span, c.sweepLength, c.thickness, offset].every((v) => isFinite(v))) {
        issues.push({ code: 'fins', componentId: c.id, message: 'Fin dimensions and axialOffset must be finite.' });
      } else if (offset < 0 || host.start + offset < host.start || host.start + offset + c.rootChord > host.end) {
        issues.push({ code: 'fins', componentId: c.id, message: 'Fin root must lie wholly on its host body tube.' });
      }
      continue;
    }

    if (c.type === 'nosecone') {
      if (c.shape === 'conical') {
        // supported
      } else if (c.shape === 'ogive' && selection.ogiveInterpretation === 'tangentOgive') {
        // explicitly interpreted
      } else {
        issues.push({ code: 'nose', componentId: c.id, message: `Nose profile '${c.shape}' is unsupported; use conical or an acknowledged tangent ogive.` });
      }
      if (!positive(c.length) || !positive(c.baseDiameter)) {
        issues.push({ code: 'nose', componentId: c.id, message: 'Nose length and base diameter must be positive.' });
      }
    } else if (c.type === 'bodytube') {
      if (components.slice(0, index).every((p) => p.type !== 'nosecone')) {
        issues.push({ code: 'nose', componentId: c.id, message: 'A body tube requires a preceding nose cone.' });
      }
      if (!positive(c.length) || !positive(c.outerDiameter)) {
        issues.push({ code: 'body', componentId: c.id, message: 'Body tube length and outer diameter must be positive.' });
      }
    } else if (c.type === 'transition') {
      if (selection.transitionInterpretation !== 'conical') {
        issues.push({ code: 'transition', componentId: c.id, message: 'A transition requires the explicit conical interpretation.' });
      }
      if (!positive(c.length) || !positive(c.foreDiameter) || !positive(c.aftDiameter)) {
        issues.push({ code: 'transition', componentId: c.id, message: 'Transition length/fore/aft diameters must be positive.' });
      }
    } else {
      issues.push({ code: 'unsupported-kind', componentId: c.id, message: `Unsupported candidate geometry component '${c.type}'.` });
      continue;
    }

    const radius = componentRadius(c);
    const aft = componentAftRadius(c);
    if (previousRadius !== null && radius !== null && radius !== previousRadius) {
      issues.push({ code: 'body-continuity', componentId: c.id, message: `Profile radius ${radius} does not continue the previous ${previousRadius} m; gaps/discontinuities are unsupported.` });
    }
    if (c.type === 'bodytube') host = { id: c.id, start: station, end: station + c.length };
    station += c.length;
    previousRadius = aft;
  }
  if (finSets !== 1) issues.push({ code: 'fins', message: 'Exactly one trapezoidal fin set is required.' });
  if (!components.some((c) => c.type === 'nosecone')) issues.push({ code: 'nose', message: 'A nose cone is required.' });

  for (const c of components) {
    if (c.type === 'freeformfinset') issues.push({ code: 'freeform', componentId: c.id, message: 'Freeform fin points are unsupported.' });
    if (c.type === 'ellipticalfinset') issues.push({ code: 'fins', componentId: c.id, message: 'Elliptical fin sets are unsupported; use a trapezoidal set.' });
  }
  return issues;
}

/** SHA-256 of the exact candidate vehicle DTO at acknowledgment. */
export async function declarationVehicleSha256(vehicle: RocketVehicle): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(vehicleDto(vehicle)));
  if (!globalThis.crypto?.subtle) {
    throw new Error('Candidate selection needs SHA-256 to bind its declarations; this environment does not provide it.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Exact canonical invocation identity; not a cryptographic digest. */
export function candidateInvocationCanonical(
  vehicle: RocketVehicle,
  motor: MotorSpec,
  selection: CandidateFlightModelSelection,
  launch: LaunchOptions,
  profile: EnvironmentSelection | null = null,
): string {
  return stableStringify({
    flightModel: selection,
    vehicle: vehicleDto(vehicle),
    motor: motorDto(motor),
    launch,
    environment: profile === null ? {
      launchAltitudeASL: vehicle.launchSite?.altitudeM ?? 0,
      windSpeedSurfaceMps: launch.windSpeedMps,
      windAzimuthDeg: launch.windAzimuthDeg,
    } : {
      launchAltitudeASL: profile.launchAltitudeGeometricMslM,
      windSpeedSurfaceMps: 0,
      windAzimuthDeg: 0,
    },
    profileSelection: profile,
  });
}

export function candidateInputKey(
  vehicle: RocketVehicle,
  motor: MotorSpec,
  selection: CandidateFlightModelSelection,
  launch: LaunchOptions,
  profile: EnvironmentSelection | null = null,
): string {
  return `cand-${hashHex(candidateInvocationCanonical(vehicle, motor, selection, launch, profile))}`;
}

/**
 * Motor aft station from the actual engine mass rollup. The accepted adapter
 * refuses flagged mounts, so the supported candidate path uses the documented
 * vehicle-aft fallback; a flagged mount is never silently reinterpreted.
 */
export function deriveMotorStation(vehicle: RocketVehicle, rollup: VehicleMassRollup): CandidateMotorDerivation {
  const flagged = vehicle.components.filter((c) => 'isMotorMount' in c && c.isMotorMount === true);
  if (flagged.length > 0) {
    throw new Error(`${CANDIDATE_REFUSAL.mountTopology} Flagged: ${flagged.map((c) => c.id).join(', ')}.`);
  }
  if (!Number.isFinite(rollup.totalLength) || rollup.totalLength <= 0) {
    throw new Error('The engine mass rollup produced an invalid total length.');
  }
  return {
    projectionId: CANDIDATE_FLIGHT_MODEL.projectionId,
    source: 'aggregate_mass',
    mountComponentId: null,
    mountStartM: null,
    mountLengthM: null,
    totalLengthM: rollup.totalLength,
    motorAftStationFromNoseM: rollup.totalLength,
  };
}

function internalNonGeometryIds(vehicle: RocketVehicle): string[] {
  const ids = vehicle.components.filter((c) => INTERNAL_KINDS.has(c.type)).map((c) => c.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate internal non-geometry component IDs.');
  return ids;
}

/** The exact request consumed by the merged runtime. */
export function buildCandidateRequest(
  vehicle: RocketVehicle,
  motor: MotorSpec,
  selection: CandidateFlightModelSelection,
  launch: LaunchOptions,
  derivation: CandidateMotorDerivation,
  /**
   * A profile declares its own pad altitude, zero surface wind and its own
   * environment source identity (the engine requires the request to name the
   * actual E1 profile source).
   */
  environmentOverride?: {
    launchAltitudeASL: number;
    windSpeedSurfaceMps: number;
    windAzimuthDeg: number;
    /** The engine requires the request to name the actual E1 profile source. */
    sourceId?: string;
  },
): NativeCandidateRequest {
  const environment = environmentOverride === undefined ? {
    launchAltitudeASL: vehicle.launchSite?.altitudeM ?? 0,
    windSpeedSurfaceMps: launch.windSpeedMps,
    windAzimuthDeg: launch.windAzimuthDeg,
  } : {
    launchAltitudeASL: environmentOverride.launchAltitudeASL,
    windSpeedSurfaceMps: environmentOverride.windSpeedSurfaceMps,
    windAzimuthDeg: environmentOverride.windAzimuthDeg,
  };
  return {
    vehicle: vehicleDto(vehicle),
    motor: motorDto(motor),
    adapter: {
      sourceIdentity: `astraea-project-vehicle|design-sha256:${selection.declarationVehicleSha256}`,
      declarations: { ...selection.declarations },
      transitionInterpretation: selection.transitionInterpretation,
      ogiveInterpretation: selection.ogiveInterpretation,
      aftTermination: 'flatExposedBaseAtFinalStation',
      internalNonGeometryIds: internalNonGeometryIds(vehicle),
      quadrature: { ...selection.quadrature },
    },
    mechanicalSourceId: `astraea-project-mass-rollup|${selection.mechanicalModelId}`,
    environmentSourceId: environmentOverride?.sourceId ?? `astraea-project-site|${selection.environmentId}`,
    axial: { ...selection.axial },
    environment,
    motorAftStationFromNoseM: derivation.motorAftStationFromNoseM,
    launch: {
      railLengthM: launch.railLengthM,
      railElevationDeg: launch.railElevationDeg,
      railAzimuthDeg: launch.railAzimuthDeg,
      mainDeployAltitudeAglM: launch.mainDeployAltitudeM,
      timeStepS: selection.timeStepS,
      dragCdScale: null,
      finCantAngleDeg: null,
    },
    horizonSeconds: selection.horizonSeconds,
    curveMachs: [...selection.curveMachs],
    query: null,
  };
}

/** Strict archived-request parser; the runtime request is the source of shape. */
export function parseCandidateRequest(value: unknown): NativeCandidateRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('candidateRequest must be an object');
  }
  const raw = value as Record<string, unknown>;
  const keys = ['vehicle', 'motor', 'adapter', 'mechanicalSourceId', 'environmentSourceId',
    'axial', 'environment', 'motorAftStationFromNoseM', 'launch', 'horizonSeconds',
    'curveMachs', 'query'];
  const actual = Object.keys(raw).sort();
  if (actual.length !== keys.length || actual.some((key, i) => key !== [...keys].sort()[i])) {
    throw new Error(`candidateRequest must declare exactly ${keys.join(', ')}`);
  }
  if (raw.query !== null) throw new Error('candidateRequest.query must be null (no arbitrary query is offered)');
  const request = raw as unknown as NativeCandidateRequest;
  if (typeof request.vehicle !== 'object' || request.vehicle === null || !Array.isArray(request.vehicle.components)) {
    throw new Error('candidateRequest.vehicle.components must be an array');
  }
  if (typeof request.motor !== 'object' || request.motor === null || Array.isArray(request.motor)) {
    throw new Error('candidateRequest.motor must be an object');
  }
  if (typeof request.adapter !== 'object' || request.adapter === null) throw new Error('candidateRequest.adapter must be an object');
  if (typeof request.axial !== 'object' || request.axial === null) throw new Error('candidateRequest.axial must be an object');
  if (typeof request.environment !== 'object' || request.environment === null) throw new Error('candidateRequest.environment must be an object');
  if (typeof request.launch !== 'object' || request.launch === null) throw new Error('candidateRequest.launch must be an object');
  for (const key of ['mechanicalSourceId', 'environmentSourceId'] as const) {
    if (typeof request[key] !== 'string' || request[key].length === 0) throw new Error(`candidateRequest.${key} must be a non-empty string`);
  }
  if (!isFinite(request.motorAftStationFromNoseM) || request.motorAftStationFromNoseM <= 0) {
    throw new Error('candidateRequest.motorAftStationFromNoseM must be positive');
  }
  if (!isFinite(request.horizonSeconds) || request.horizonSeconds <= 0) throw new Error('candidateRequest.horizonSeconds must be positive');
  if (!Array.isArray(request.curveMachs) || request.curveMachs.length === 0 || request.curveMachs.length > 64
    || !request.curveMachs.every((m) => isFinite(m) && m >= 0 && m < 0.8)) {
    throw new Error('candidateRequest.curveMachs must contain 1..64 values in [0, 0.8)');
  }
  const adapter = request.adapter;
  const adapterKeys = ['sourceIdentity', 'declarations', 'transitionInterpretation', 'ogiveInterpretation', 'aftTermination', 'internalNonGeometryIds', 'quadrature'];
  if (Object.keys(adapter).sort().join('|') !== [...adapterKeys].sort().join('|')) throw new Error('candidateRequest.adapter has an unexpected key set');
  if (adapter.aftTermination !== 'flatExposedBaseAtFinalStation') throw new Error('candidateRequest.adapter.aftTermination is unsupported');
  if (adapter.ogiveInterpretation !== null && adapter.ogiveInterpretation !== 'tangentOgive') throw new Error('candidateRequest.adapter.ogiveInterpretation is unsupported');
  if (adapter.transitionInterpretation !== null && adapter.transitionInterpretation !== 'conical') throw new Error('candidateRequest.adapter.transitionInterpretation is unsupported');
  if (!Number.isFinite(adapter.quadrature.absoluteToleranceM3) || adapter.quadrature.absoluteToleranceM3 <= 0
    || !Number.isFinite(adapter.quadrature.relativeTolerance) || adapter.quadrature.relativeTolerance < 0
    || !Number.isInteger(adapter.quadrature.maxPanels) || adapter.quadrature.maxPanels <= 0) {
    throw new Error('candidateRequest.adapter.quadrature is invalid');
  }
  if (!Array.isArray(adapter.internalNonGeometryIds) || !adapter.internalNonGeometryIds.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new Error('candidateRequest.adapter.internalNonGeometryIds must be component IDs');
  }
  const launch = request.launch;
  if (launch.dragCdScale !== null || launch.finCantAngleDeg !== null) {
    throw new Error('candidateRequest.launch must not transfer a drag scale or nonzero cant');
  }
  for (const key of ['railLengthM', 'railElevationDeg', 'railAzimuthDeg', 'mainDeployAltitudeAglM', 'timeStepS'] as const) {
    if (!isFinite(launch[key])) throw new Error(`candidateRequest.launch.${key} must be finite`);
  }
  if (!(launch.railLengthM > 0) || !(launch.mainDeployAltitudeAglM > 0) || !(launch.timeStepS > 0)) {
    throw new Error('candidateRequest.launch dimensions/timeStep must be positive');
  }
  const environment = request.environment;
  for (const key of ['launchAltitudeASL', 'windSpeedSurfaceMps', 'windAzimuthDeg'] as const) {
    if (!isFinite(environment[key])) throw new Error(`candidateRequest.environment.${key} must be finite`);
  }
  if (environment.launchAltitudeASL < 0 || environment.launchAltitudeASL > 20_000) {
    throw new Error('candidateRequest.environment.launchAltitudeASL is outside candidate support');
  }
  const axial = request.axial;
  if (!isFinite(axial.ca0) || axial.ca0 < 0 || typeof axial.providerId !== 'string' || axial.providerId.length === 0
    || typeof axial.inputIdentity !== 'string' || axial.inputIdentity.length === 0) {
    throw new Error('candidateRequest.axial is invalid');
  }
  return request;
}

const SELECTION_KEYS = ['launchTimeUtcUnixS', 'launchAltitudeGeometricMslM', 'verticalDatumIdentity', 'profile'];
const PROFILE_KEYS = ['altitudeDatum', 'closureId', 'extrapolationPolicy', 'interpolationPolicy',
  'issueTimeUtcUnixS', 'knots', 'location', 'source', 'units', 'validity', 'verticalDatumIdentity'];

/**
 * Strict parser for the profile selection file. The engine remains the
 * authority on profile values (units, coverage, validity); this rejects shapes
 * it cannot dispatch at all, so a bad file fails at import instead of mid-run.
 */
export function parseEnvironmentSelection(value: unknown): EnvironmentSelection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('environment selection must be an object');
  }
  const raw = value as Record<string, unknown>;
  const actual = Object.keys(raw).sort();
  const expected = [...SELECTION_KEYS].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new Error(`environment selection must declare exactly ${SELECTION_KEYS.join(', ')}`);
  }
  if (!Number.isInteger(raw.launchTimeUtcUnixS)) throw new Error('environmentSelection.launchTimeUtcUnixS must be an integer epoch');
  if (typeof raw.launchAltitudeGeometricMslM !== 'number' || !Number.isFinite(raw.launchAltitudeGeometricMslM)
    || raw.launchAltitudeGeometricMslM < 0 || raw.launchAltitudeGeometricMslM > 20_000) {
    throw new Error('environmentSelection.launchAltitudeGeometricMslM must be finite within 0..20000 m');
  }
  if (typeof raw.verticalDatumIdentity !== 'string' || raw.verticalDatumIdentity.trim().length === 0) {
    throw new Error('environmentSelection.verticalDatumIdentity must be a non-empty identity');
  }
  const profile = raw.profile;
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) {
    throw new Error('environmentSelection.profile must be an object');
  }
  const p = profile as Record<string, unknown>;
  for (const key of PROFILE_KEYS) {
    if (!Object.hasOwn(p, key)) throw new Error(`environmentSelection.profile is missing '${key}'`);
  }
  if (!Array.isArray(p.knots) || p.knots.length === 0) throw new Error('environmentSelection.profile.knots must be a non-empty array');
  if (p.altitudeDatum !== 'geometricMsl') throw new Error('environmentSelection.profile.altitudeDatum must be geometricMsl');
  if (p.extrapolationPolicy !== 'reject') throw new Error('environmentSelection.profile.extrapolationPolicy must be reject');
  if (p.interpolationPolicy !== 'logPressureLinearTemperatureWind') {
    throw new Error('environmentSelection.profile.interpolationPolicy must be logPressureLinearTemperatureWind');
  }
  for (const key of ['validity', 'units', 'location', 'source'] as const) {
    if (typeof p[key] !== 'object' || p[key] === null || Array.isArray(p[key])) {
      throw new Error(`environmentSelection.profile.${key} must be an object`);
    }
  }
  const validity = p.validity as Record<string, unknown>;
  if (!Number.isInteger(validity.fromUtcUnixS) || !Number.isInteger(validity.untilUtcUnixS)
    || (validity.untilUtcUnixS as number) <= (validity.fromUtcUnixS as number)) {
    throw new Error('environmentSelection.profile.validity must declare an increasing integer UTC window');
  }
  if (typeof (p.source as Record<string, unknown>).identity !== 'string'
    || ((p.source as Record<string, unknown>).identity as string).trim().length === 0) {
    throw new Error('environmentSelection.profile.source.identity must be a non-empty identity');
  }
  return {
    launchTimeUtcUnixS: raw.launchTimeUtcUnixS as number,
    launchAltitudeGeometricMslM: raw.launchAltitudeGeometricMslM as number,
    verticalDatumIdentity: raw.verticalDatumIdentity as string,
    profile: { ...p },
  };
}

/** Strict archived-invocation parser: untagged request, or the profile envelope. */
export function parseCandidateInvocation(value: unknown): CandidateInvocation {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, 'schemaId')) {
    const raw = value as Record<string, unknown>;
    const keys = ['schemaId', 'candidate', 'environmentSelection'];
    const actual = Object.keys(raw).sort();
    if (actual.length !== keys.length || actual.some((key, i) => key !== [...keys].sort()[i])) {
      throw new Error(`candidate profile invocation must declare exactly ${keys.join(', ')}`);
    }
    if (raw.schemaId !== PROFILE_ENVELOPE_SCHEMA_ID) {
      throw new Error(`candidate profile invocation schemaId must be ${PROFILE_ENVELOPE_SCHEMA_ID}`);
    }
    const candidate = parseCandidateRequest(raw.candidate);
    const environmentSelection = parseEnvironmentSelection(raw.environmentSelection);
    if (candidate.environment.launchAltitudeASL !== environmentSelection.launchAltitudeGeometricMslM) {
      throw new Error('candidate profile invocation launch altitude disagrees with the profile selection');
    }
    if (candidate.environment.windSpeedSurfaceMps !== 0) {
      throw new Error('candidate profile invocation requires zero retained surface wind (the profile supplies wind)');
    }
    return { schemaId: PROFILE_ENVELOPE_SCHEMA_ID, candidate, environmentSelection };
  }
  return parseCandidateRequest(value);
}

/** Wrap a built request with its E1 profile selection. */
export function buildProfileInvocation(
  candidate: NativeCandidateRequest,
  selection: EnvironmentSelection,
): ProfileCandidateInvocation {
  return { schemaId: PROFILE_ENVELOPE_SCHEMA_ID, candidate, environmentSelection: selection };
}

/**
 * Validate an archived invocation against its archived inputs. For a profile
 * envelope the declared pad altitude and zero surface wind are checked too, so a
 * tampered selection cannot claim a different atmosphere than the run used.
 */
export function assertCandidateInvocationConsistent(
  invocation: CandidateInvocation,
  vehicle: RocketVehicle,
  motor: MotorSpec,
  selection: CandidateFlightModelSelection,
  launch: LaunchOptions,
  derivation: CandidateMotorDerivation,
): void {
  const profileInvocation = isProfileInvocation(invocation) ? invocation : null;
  const profile = profileInvocation === null ? null : profileInvocation.environmentSelection;
  assertCandidateRequestConsistent(invocationCandidate(invocation), vehicle, motor, selection, launch, derivation,
    profile === null ? undefined : {
      launchAltitudeASL: profile.launchAltitudeGeometricMslM,
      windSpeedSurfaceMps: 0,
      windAzimuthDeg: 0,
    });
  if (profileInvocation === null || profile === null) return;
  const decl = profile;
  const request = profileInvocation.candidate;
  if (request.environment.launchAltitudeASL !== decl.launchAltitudeGeometricMslM) {
    throw new Error('candidate profile launch altitude disagrees with the archived request');
  }
  if (request.environment.windSpeedSurfaceMps !== 0 || request.environment.windAzimuthDeg !== 0) {
    throw new Error('candidate profile invocation must not retain a surface wind');
  }
  if (decl.verticalDatumIdentity !== decl.profile.verticalDatumIdentity) {
    throw new Error('candidate profile vertical datum disagrees with the profile document');
  }
  const profileValidity = decl.profile.validity as { fromUtcUnixS: number; untilUtcUnixS: number };
  if (decl.launchTimeUtcUnixS < profileValidity.fromUtcUnixS || decl.launchTimeUtcUnixS > profileValidity.untilUtcUnixS) {
    throw new Error('candidate profile launch time is outside the profile validity window');
  }
}

/**
 * Validate an archived request against its archived inputs. The motor station
 * is archived (it came from the engine mass rollup) and is checked against the
 * recorded derivation; it is not re-derived on open.
 */
export function assertCandidateRequestConsistent(
  request: NativeCandidateRequest,
  vehicle: RocketVehicle,
  motor: MotorSpec,
  selection: CandidateFlightModelSelection,
  launch: LaunchOptions,
  derivation: CandidateMotorDerivation,
  /** A profile invocation declares its own pad altitude and zero surface wind. */
  environmentOverride?: { launchAltitudeASL: number; windSpeedSurfaceMps: number; windAzimuthDeg: number },
): void {
  if (stableStringify(request.vehicle) !== stableStringify(vehicleDto(vehicle))) {
    throw new Error('candidateRequest.vehicle disagrees with the archived project vehicle');
  }
  if (stableStringify(request.motor) !== stableStringify(motorDto(motor))) {
    throw new Error('candidateRequest.motor disagrees with the archived motor record');
  }
  if (stableStringify(request.axial) !== stableStringify(selection.axial)) {
    throw new Error('candidateRequest.axial disagrees with the candidate selection');
  }
  const expectedEnvironment = environmentOverride ?? {
    launchAltitudeASL: vehicle.launchSite?.altitudeM ?? 0,
    windSpeedSurfaceMps: launch.windSpeedMps,
    windAzimuthDeg: launch.windAzimuthDeg,
  };
  if (stableStringify(request.environment) !== stableStringify(expectedEnvironment)) {
    throw new Error('candidateRequest.environment disagrees with the archived site/wind');
  }
  const expectedLaunch = {
    railLengthM: launch.railLengthM,
    railElevationDeg: launch.railElevationDeg,
    railAzimuthDeg: launch.railAzimuthDeg,
    mainDeployAltitudeAglM: launch.mainDeployAltitudeM,
    timeStepS: selection.timeStepS,
    dragCdScale: null,
    finCantAngleDeg: null,
  };
  if (stableStringify(request.launch) !== stableStringify(expectedLaunch)) {
    throw new Error('candidateRequest.launch disagrees with the archived launch inputs');
  }
  if (request.horizonSeconds !== selection.horizonSeconds
    || stableStringify(request.curveMachs) !== stableStringify(selection.curveMachs)) {
    throw new Error('candidateRequest horizon/curves disagree with the candidate selection');
  }
  if (request.motorAftStationFromNoseM !== derivation.motorAftStationFromNoseM) {
    throw new Error('candidateRequest motor station disagrees with its recorded derivation');
  }
  const expectedAdapter = {
    sourceIdentity: `astraea-project-vehicle|design-sha256:${selection.declarationVehicleSha256}`,
    declarations: { ...selection.declarations },
    transitionInterpretation: selection.transitionInterpretation,
    ogiveInterpretation: selection.ogiveInterpretation,
    aftTermination: 'flatExposedBaseAtFinalStation',
    internalNonGeometryIds: internalNonGeometryIds(vehicle),
    quadrature: { ...selection.quadrature },
  };
  if (stableStringify(request.adapter) !== stableStringify(expectedAdapter)) {
    throw new Error('candidateRequest.adapter disagrees with the candidate selection/vehicle');
  }
}
