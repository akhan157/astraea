/**
 * Per-project drag calibration: one factor on the airframe drag coefficient,
 * fitted to a flight log of THIS rocket, with the provenance of the fit.
 *
 * It records an effective vertical-coast fit, not a validation of aerodynamics
 * or physical eligibility. Mass, geometry and sensor errors remain confounded;
 * common assumed mass cancels only for fixed input trajectories. The persisted
 * legacy window alone does not retain both sides' smoothing/regime provenance.
 * The record lives in the project document, joins the run identity (see
 * `caseResolver`), and is passed to the engine as `dragCdScale`.
 * Removing it restores a scale of 1.
 */
import { describeEngineIdentity, parseEngineIdentity, type EngineIdentity } from '../engine/identity';
import type { FlightModelSelection } from './flightModel';
import type { DragFit, DragFitEventSelection, EventExclusions } from '../evidence/dragFit';
import type { LogProvenance } from '../evidence/logProvenance';
import { DRAG_SCALE_MAX, DRAG_SCALE_MIN } from '../evidence/dragFit';
import type { CoastMethod, CoastWindowSummary } from '../evidence/coastWindow';
import { coastWindowSummary, MIN_COAST_POINTS } from '../evidence/coastWindow';
import { assessCalibrationEligibility, calibrationEventEvidence, parseCalibrationEvidence, requireCalibrationEvents, type CalibrationEvidence } from '../evidence/calibrationEligibility';

export type CalibrationWindowProvenance = CoastWindowSummary;

/**
 * Fit-time flight-model selection declaration. Stored bindings are parsed as
 * declarations only: a binding naming an unsupported model keeps its artifact
 * loadable and retained as history, never executable or activatable.
 */
export interface FlightModelBinding {
  schemaId: string;
  modelId: string;
  environmentId: string;
  mechanicalModelId: string;
  calibrationPolicyId: string;
}

export interface DragFitProvenance {
  /** Exact model-side runtime identity; absent on legacy fits. */
  engineIdentity?: EngineIdentity;
  /** Fit-time flight-model binding; absent on legacy fits (binding unverified). */
  flightModelBinding?: FlightModelBinding;
  version: 1;
  estimator: 'vertical-coast-ols-v1';
  atmosphere: 'ISA-1976';
  launchElevationM: number;
  refAreaM2: number;
  modelRmseN: number;
  /** Exact uncalibrated design/motor/site identity reviewed at fit time. */
  uncalibratedRunKey: string;
  /** FNV-1a32 identity of all normalized samples; not a cryptographic checksum. */
  normalizedLogKey: string;
  logUnits: { time: string; altitude: string };
  logWindow: CalibrationWindowProvenance;
  modelWindow: CalibrationWindowProvenance;
  evidence: CalibrationEvidence;
  /** Conditional on source declarations; never an independent verification. */
  eligibility: 'conditional';
  /** Absent preserves the original CAL-E1 heuristic policy. */
  selection?: DragFitEventSelection;
}

export interface DragCalibration {
  /** Factor on the airframe drag coefficient (fitted Cd / the model's own coast Cd). */
  scale: number;
  /** Effective Cd fitted to the logged coast. */
  fittedCd: number;
  /** The model's own effective coast Cd for this design, same estimator. */
  modelCd: number;
  /** In-sample equivalent-force RMS residual of the log fit, N. */
  rmseN: number;
  /** Mass after burnout used for both fits, kg. */
  coastMassKg: number;
  source: {
    /** Log file name; null for pasted text. */
    fileName: string | null;
    /** SHA-256 of the log bytes, or 'unavailable'. */
    sha256Hex: string;
    rowCount: number;
  };
  window: {
    startS: number;
    endS: number;
    method: CoastMethod;
    pointsUsed: number;
    pointsExcluded: number;
  };
  /** ISO-8601 time the calibration was applied to the project. */
  appliedAt: string;
  /** Absent on legacy applied records: retain their scale, eligibility unverified. */
  fitProvenance?: DragFitProvenance;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const SHA_RE = /^[0-9a-f]{64}$/;

/** The record to store for a fit and the log it came from. */
export function buildDragCalibration(
  fit: DragFit, log: LogProvenance, appliedAt: string,
  flightModelBinding: FlightModelSelection,
  evidence: CalibrationEvidence = { log: {}, model: {} },
  uncalibratedRunKey = '',
  normalizedLogKey = '',
  engineIdentity?: EngineIdentity,
): DragCalibration {
  const reviewed = parseCalibrationEvidence(evidence);
  const eligibility = assessCalibrationEligibility({ log: fit.logWindow, model: fit.modelWindow }, reviewed);
  if (eligibility.status !== 'conditional') {
    throw new Error(`drag calibration is analysis-only (${eligibility.status}): ${eligibility.reasons.join('; ')}`);
  }
  const result: DragCalibration = {
    scale: fit.scale,
    fittedCd: fit.fittedCd,
    modelCd: fit.modelCd,
    rmseN: fit.rmseN,
    coastMassKg: fit.coastMassKg,
    source: { fileName: log.sourceFileName, sha256Hex: log.sha256Hex, rowCount: log.rowCount },
    window: {
      startS: fit.logWindow.windowStartS,
      endS: fit.logWindow.windowEndS,
      method: fit.logWindow.method,
      pointsUsed: fit.logWindow.used,
      pointsExcluded: fit.logWindow.excluded.lowSpeed + (fit.logWindow.excluded.event ?? 0),
    },
    appliedAt,
    fitProvenance: {
      version: 1,
      estimator: 'vertical-coast-ols-v1',
      ...(engineIdentity === undefined ? {} : { engineIdentity }),
      flightModelBinding: { ...flightModelBinding },
      atmosphere: 'ISA-1976',
      launchElevationM: fit.launchElevationM,
      refAreaM2: fit.refAreaM2,
      modelRmseN: fit.modelRmseN,
      uncalibratedRunKey,
      normalizedLogKey,
      logUnits: { time: log.timeUnitAssumption, altitude: log.altitudeUnitAssumption },
      logWindow: coastWindowSummary(fit.logWindow),
      modelWindow: coastWindowSummary(fit.modelWindow),
      evidence: reviewed,
      eligibility: 'conditional',
      ...(fit.selection === undefined ? {} : { selection: fit.selection }),
    },
  };
  // Apply exactly the same consistency checks as a reopened project.
  return parseDragCalibration(result);
}

function strictObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function finite(raw: Record<string, unknown>, path: string, key: string, positive = false): number {
  const v = raw[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || (positive && !(v > 0))) {
    throw new Error(`${path}.${key} must be a${positive ? ' positive' : ''} finite number`);
  }
  return v;
}

function nonNegativeInt(raw: Record<string, unknown>, path: string, key: string): number {
  const v = finite(raw, path, key);
  if (!Number.isInteger(v) || v < 0) throw new Error(`${path}.${key} must be a non-negative integer`);
  return v;
}

function nonNegative(raw: Record<string, unknown>, path: string, key: string): number {
  const n = finite(raw, path, key);
  if (n < 0) throw new Error(`${path}.${key} must be non-negative`);
  return n;
}

function parseWindowProvenance(value: unknown, path: string, eventSelected = false): CalibrationWindowProvenance {
  const raw = strictObject(value, path);
  if (raw.method !== 'velocity-column' && raw.method !== 'altitude-derivative') throw new Error(`${path}.method is invalid`);
  const bool = (key: string): boolean => {
    if (typeof raw[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean`);
    return raw[key];
  };
  const excluded = strictObject(raw.excluded, `${path}.excluded`);
  const result: CalibrationWindowProvenance = {
    method: raw.method,
    halfWidthS: finite(raw, path, 'halfWidthS', true),
    supportStartS: finite(raw, path, 'supportStartS'),
    supportEndS: finite(raw, path, 'supportEndS'),
    sampleStartS: finite(raw, path, 'sampleStartS'),
    sampleEndS: finite(raw, path, 'sampleEndS'),
    velocityPeakAtBoundary: bool('velocityPeakAtBoundary'),
    altitudePeakAtBoundary: bool('altitudePeakAtBoundary'),
    burnoutS: finite(raw, path, 'burnoutS'),
    apogeeS: finite(raw, path, 'apogeeS'),
    windowStartS: finite(raw, path, 'windowStartS'),
    windowEndS: finite(raw, path, 'windowEndS'),
    minSpeedMs: finite(raw, path, 'minSpeedMs', true),
    maxSpeedMs: finite(raw, path, 'maxSpeedMs', true),
    candidates: nonNegativeInt(raw, path, 'candidates'),
    used: nonNegativeInt(raw, path, 'used'),
    excluded: {
      lowSpeed: nonNegativeInt(excluded, `${path}.excluded`, 'lowSpeed'),
      ...(eventSelected ? { event: nonNegativeInt(excluded, `${path}.excluded`, 'event') } : {}),
    },
    nonPositiveKept: nonNegativeInt(raw, path, 'nonPositiveKept'),
  };
  if (!(result.sampleStartS <= result.supportStartS && result.supportStartS <= result.windowStartS
    && result.windowStartS < result.windowEndS && result.windowEndS <= result.supportEndS
    && result.supportEndS <= result.apogeeS && result.apogeeS <= result.sampleEndS
    && result.sampleStartS <= result.burnoutS && result.burnoutS <= result.windowStartS)
    || result.maxSpeedMs < result.minSpeedMs || result.used < MIN_COAST_POINTS
    || result.candidates !== result.used + result.excluded.lowSpeed + (result.excluded.event ?? 0) || result.nonPositiveKept > result.used
    || (!eventSelected && excluded.event !== undefined)
    || result.velocityPeakAtBoundary !== (result.burnoutS === result.sampleStartS || result.burnoutS === result.sampleEndS)
    || result.altitudePeakAtBoundary !== (result.apogeeS === result.sampleStartS || result.apogeeS === result.sampleEndS)) {
    throw new Error(`${path} has inconsistent window/support provenance`);
  }
  return result;
}

function parseEventSelection(value: unknown, log: CoastWindowSummary, model: CoastWindowSummary, evidence: CalibrationEvidence): DragFitEventSelection {
  const path = 'dragCalibration.fitProvenance.selection';
  const raw = strictObject(value, path);
  if (raw.policy !== 'reviewed-events-v1') throw new Error(`${path}.policy is unsupported`);
  const events = requireCalibrationEvents(parseCalibrationEvidence(raw.events));
  if (JSON.stringify(events) !== JSON.stringify(calibrationEventEvidence(evidence))) throw new Error(`${path} event snapshot differs from the applied evidence`);
  const originalLogWindow = parseWindowProvenance(raw.originalLogWindow, `${path}.originalLogWindow`);
  const originalModelWindow = parseWindowProvenance(raw.originalModelWindow, `${path}.originalModelWindow`);
  const exclusions = (value: unknown, original: CoastWindowSummary, selected: CoastWindowSummary, name: string): EventExclusions => {
    const p = `${path}.${name}`;
    const e = strictObject(value, p);
    const burnoutOnly = nonNegativeInt(e, p, 'burnoutOnly');
    const recoveryOnly = nonNegativeInt(e, p, 'recoveryOnly');
    const both = nonNegativeInt(e, p, 'both');
    const retainedLeverageFraction = nonNegative(e, p, 'retainedLeverageFraction');
    if (typeof e.originalSupportIdentity !== 'string' || !/^fnv1a32:[0-9a-f]{8}$/.test(e.originalSupportIdentity)) throw new Error(`${p}.originalSupportIdentity must identify original point support`);
    if (selected.excluded.event !== burnoutOnly + recoveryOnly + both || original.used !== selected.used + selected.excluded.event
      || original.candidates !== selected.candidates || original.excluded.lowSpeed !== selected.excluded.lowSpeed
      || original.method !== selected.method || original.halfWidthS !== selected.halfWidthS
      || original.sampleStartS !== selected.sampleStartS || original.sampleEndS !== selected.sampleEndS
      || original.burnoutS !== selected.burnoutS || original.apogeeS !== selected.apogeeS
      || original.velocityPeakAtBoundary !== selected.velocityPeakAtBoundary || original.altitudePeakAtBoundary !== selected.altitudePeakAtBoundary
      || selected.windowStartS < original.windowStartS || selected.windowEndS > original.windowEndS
      || selected.supportStartS < original.supportStartS || selected.supportEndS > original.supportEndS
      || selected.minSpeedMs < original.minSpeedMs || selected.maxSpeedMs > original.maxSpeedMs
      || selected.nonPositiveKept > original.nonPositiveKept || retainedLeverageFraction > 1 || !(retainedLeverageFraction > 0)) {
      throw new Error(`${p} has inconsistent original/retained selection provenance`);
    }
    return { burnoutOnly, recoveryOnly, both, retainedLeverageFraction, originalSupportIdentity: e.originalSupportIdentity };
  };
  return {
    policy: raw.policy, events, originalLogWindow, originalModelWindow,
    logExclusions: exclusions(raw.logExclusions, originalLogWindow, log, 'logExclusions'),
    modelExclusions: exclusions(raw.modelExclusions, originalModelWindow, model, 'modelExclusions'),
  };
}

function parseFlightModelBinding(value: unknown, path: string): FlightModelBinding {
  const raw = strictObject(value, `${path}.flightModelBinding`);
  const keys = ['schemaId', 'modelId', 'environmentId', 'mechanicalModelId', 'calibrationPolicyId'] as const;
  if (Object.keys(raw).length !== keys.length
    || keys.some((key) => typeof raw[key] !== 'string' || !(raw[key] as string).trim())) {
    throw new Error(`${path}.flightModelBinding must declare exactly ${keys.join(', ')} as non-empty strings`);
  }
  return { schemaId: raw.schemaId as string, modelId: raw.modelId as string,
    environmentId: raw.environmentId as string, mechanicalModelId: raw.mechanicalModelId as string,
    calibrationPolicyId: raw.calibrationPolicyId as string };
}

function parseFitProvenance(value: unknown, calibration: DragCalibration): DragFitProvenance {
  const path = 'dragCalibration.fitProvenance';
  const raw = strictObject(value, path);
  if (raw.version !== 1 || raw.estimator !== 'vertical-coast-ols-v1' || raw.atmosphere !== 'ISA-1976') {
    throw new Error(`${path} version, estimator or atmosphere is unsupported`);
  }
  const logWindow = parseWindowProvenance(raw.logWindow, `${path}.logWindow`, raw.selection !== undefined);
  const modelWindow = parseWindowProvenance(raw.modelWindow, `${path}.modelWindow`, raw.selection !== undefined);
  const evidence = parseCalibrationEvidence(raw.evidence);
  if (raw.eligibility !== 'conditional'
    || assessCalibrationEligibility({ log: logWindow, model: modelWindow }, evidence).status !== 'conditional') {
    throw new Error(`${path}.eligibility is inconsistent with its evidence`);
  }
  if (calibration.window.startS !== logWindow.windowStartS || calibration.window.endS !== logWindow.windowEndS
    || calibration.window.method !== logWindow.method || calibration.window.pointsUsed !== logWindow.used
    || calibration.window.pointsExcluded !== logWindow.excluded.lowSpeed + (logWindow.excluded.event ?? 0)
    || calibration.source.rowCount < logWindow.candidates
    || Math.abs(calibration.scale - calibration.fittedCd / calibration.modelCd) > 1e-12 * Math.max(1, calibration.scale)) {
    throw new Error(`${path} is inconsistent with the applied calibration`);
  }
  const units = strictObject(raw.logUnits, `${path}.logUnits`);
  if (typeof raw.uncalibratedRunKey !== 'string' || !raw.uncalibratedRunKey.trim()) {
    throw new Error(`${path}.uncalibratedRunKey must identify the fitted inputs`);
  }
  if (typeof raw.normalizedLogKey !== 'string' || !/^fnv1a32:[0-9a-f]{8}$/.test(raw.normalizedLogKey)) {
    throw new Error(`${path}.normalizedLogKey must identify all normalized log samples`);
  }
  if (typeof units.time !== 'string' || !units.time.trim() || typeof units.altitude !== 'string' || !units.altitude.trim()) {
    throw new Error(`${path}.logUnits must state the imported units`);
  }
  return {
    version: 1, estimator: raw.estimator, atmosphere: raw.atmosphere,
    launchElevationM: finite(raw, path, 'launchElevationM'),
    refAreaM2: finite(raw, path, 'refAreaM2', true),
    modelRmseN: nonNegative(raw, path, 'modelRmseN'),
    uncalibratedRunKey: raw.uncalibratedRunKey,
    normalizedLogKey: raw.normalizedLogKey,
    ...(raw.engineIdentity === undefined ? {} : { engineIdentity: parseEngineIdentity(raw.engineIdentity) }),
    ...(raw.flightModelBinding === undefined ? {} : { flightModelBinding: parseFlightModelBinding(raw.flightModelBinding, path) }),
    logUnits: { time: units.time, altitude: units.altitude },
    logWindow, modelWindow, evidence, eligibility: 'conditional',
    ...(raw.selection === undefined ? {} : { selection: parseEventSelection(raw.selection, logWindow, modelWindow, evidence) }),
  };
}

/** Fail-closed reader for a stored calibration: every field present and typed, scale within bounds. */
export function parseDragCalibration(value: unknown): DragCalibration {
  const raw = strictObject(value, 'dragCalibration');
  const scale = finite(raw, 'dragCalibration', 'scale', true);
  if (scale < DRAG_SCALE_MIN || scale > DRAG_SCALE_MAX) {
    throw new Error(`dragCalibration.scale must be within ${DRAG_SCALE_MIN} to ${DRAG_SCALE_MAX}`);
  }
  const source = strictObject(raw.source, 'dragCalibration.source');
  const fileName = source.fileName;
  if (fileName !== null && typeof fileName !== 'string') {
    throw new Error('dragCalibration.source.fileName must be a string or null');
  }
  const sha = source.sha256Hex;
  if (typeof sha !== 'string' || (sha !== 'unavailable' && !SHA_RE.test(sha))) {
    throw new Error("dragCalibration.source.sha256Hex must be a 64-character hex digest or 'unavailable'");
  }
  const window = strictObject(raw.window, 'dragCalibration.window');
  if (window.method !== 'velocity-column' && window.method !== 'altitude-derivative') {
    throw new Error("dragCalibration.window.method must be 'velocity-column' or 'altitude-derivative'");
  }
  const startS = finite(window, 'dragCalibration.window', 'startS');
  const endS = finite(window, 'dragCalibration.window', 'endS');
  if (!(endS > startS)) throw new Error('dragCalibration.window must end after it starts');
  if (typeof raw.appliedAt !== 'string' || !ISO_RE.test(raw.appliedAt)) {
    throw new Error('dragCalibration.appliedAt must be an ISO-8601 timestamp');
  }
  const result: DragCalibration = {
    scale,
    fittedCd: finite(raw, 'dragCalibration', 'fittedCd', true),
    modelCd: finite(raw, 'dragCalibration', 'modelCd', true),
    rmseN: nonNegative(raw, 'dragCalibration', 'rmseN'),
    coastMassKg: finite(raw, 'dragCalibration', 'coastMassKg', true),
    source: { fileName, sha256Hex: sha, rowCount: nonNegativeInt(source, 'dragCalibration.source', 'rowCount') },
    window: {
      startS,
      endS,
      method: window.method,
      pointsUsed: nonNegativeInt(window, 'dragCalibration.window', 'pointsUsed'),
      pointsExcluded: nonNegativeInt(window, 'dragCalibration.window', 'pointsExcluded'),
    },
    appliedAt: raw.appliedAt,
  };
  if (raw.fitProvenance !== undefined) result.fitProvenance = parseFitProvenance(raw.fitProvenance, result);
  return result;
}

/** One-line statement of what a calibrated result was calibrated against; used in labels and traces. */
export function describeDragCalibration(c: DragCalibration): string {
  const file = c.source.fileName ?? 'pasted log';
  const eligibility = c.fitProvenance === undefined ? 'legacy adjustment; eligibility unverified' : 'fit-time conditional eligibility from declared evidence; not independently verified';
  const selection = c.fitProvenance?.selection === undefined ? '' : '; explicit reviewed-events-v1 selection';
  return `drag scale ${c.scale.toFixed(3)} fitted to ${file} (coast ${c.window.startS.toFixed(1)}-${c.window.endS.toFixed(1)} s; ${eligibility}${selection}; ${describeEngineIdentity(c.fitProvenance?.engineIdentity)})`;
}
