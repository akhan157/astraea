/**
 * Drag scale from a flight log: the effective Cd fitted to the logged coast,
 * divided by the model's own effective Cd fitted to its coast of the same
 * design with the same estimator (`deriveCoastPoints` + `calibrateCd`).
 *
 * Both sides use the same procedure; different sampling, smoothing windows,
 * trajectory support and sensor errors can bias the ratio. This effective
 * vertical-coast reconstruction assumes unpowered, approximately vertical, calm,
 * constant-mass flight without recovery in the filter support and ISA density.
 * It cannot identify mass and physical Cd separately or validate flight prediction.
 */
import type { TrajectorySample } from './altimetry';
import { calibrateCd } from './calibration';
import { coastWindowSummary, deriveCoastPoints, MIN_COAST_POINTS, type CoastDerivation, type CoastWindowSummary } from './coastWindow';
import { requireCalibrationEvents, type CalibrationEvidence, type CalibrationSideEvidence } from './calibrationEligibility';

/** Operational bounds for refusing a fit; crossing them does not identify the physical cause. */
export const DRAG_SCALE_MIN = 0.25;
export const DRAG_SCALE_MAX = 4;
/** Outside this range the scale is applied only with a visible warning. */
export const DRAG_SCALE_TYPICAL_MIN = 0.7;
export const DRAG_SCALE_TYPICAL_MAX = 1.4;

/** The model trajectory fields the model-side fit reads (a subset of the engine telemetry). */
export interface ModelTelemetryPoint {
  time: number;
  altitude: number;
  velocity: { z: number };
}

export interface DragFitInputs {
  /** Logged flight, AGL altitude, with the vertical-velocity column when the log has one. */
  log: ReadonlyArray<TrajectorySample>;
  /**
   * Mass after burnout, kg: committed design dry mass + motor casing. The SAME
   * mass is used on both sides, so it cancels for fixed input trajectories.
   * Modeled mass still affects the simulated trajectory and thus the scale.
   * The engine's rounded telemetry mass is not used.
   */
  coastMassKg: number;
  /** Reference area from the vehicle reference diameter, m^2. */
  refAreaM2: number;
  /** Launch-site elevation, m ASL. */
  launchElevationM: number;
  /** The model's flight of the same design with no drag scale applied. */
  modelTelemetry: ReadonlyArray<ModelTelemetryPoint>;
}

export interface DragFit {
  fittedCd: number;
  rmseN: number;
  modelCd: number;
  modelRmseN: number;
  /** fittedCd / modelCd: the factor on the airframe drag coefficient. */
  scale: number;
  logWindow: CoastDerivation;
  modelWindow: CoastDerivation;
  coastMassKg: number;
  refAreaM2: number;
  launchElevationM: number;
  /** Set when the scale is legal but unusual; shown beside the result. */
  warning: string | null;
  /** Absent means the original heuristic selection; never silently upgraded. */
  selection?: DragFitEventSelection;
}

export interface EventExclusions {
  burnoutOnly: number;
  recoveryOnly: number;
  both: number;
  /** Sum(x²) retained / original, x = rho*v²*A/2. */
  retainedLeverageFraction: number;
  /** Noncryptographic identity of all original centre/support triples. */
  originalSupportIdentity: string;
}

export interface DragFitEventSelection {
  policy: 'reviewed-events-v1';
  events: CalibrationEvidence;
  originalLogWindow: CoastWindowSummary;
  originalModelWindow: CoastWindowSummary;
  logExclusions: EventExclusions;
  modelExclusions: EventExclusions;
}

/** Existing FNV-1a32 identity convention; not a source checksum or proof. */
function supportIdentity(window: CoastDerivation): string {
  const input = JSON.stringify(window.pointSupport);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Select whole pre-existing point fits; raw input, filters and proxies are frozen. */
function selectEventPoints(original: CoastDerivation, evidence: CalibrationSideEvidence, name: string): { window: CoastDerivation; exclusions: EventExclusions } {
  if (original.pointSupport.length !== original.points.length) throw new Error(`event refit: ${name} has inconsistent original point support`);
  const burnout = evidence.burnout!;
  const recovery = evidence.recovery!;
  const points: CoastDerivation['points'] = [];
  const pointSupport: CoastDerivation['pointSupport'] = [];
  let burnoutOnly = 0;
  let recoveryOnly = 0;
  let both = 0;
  let originalXX = 0;
  let retainedXX = 0;
  for (let i = 0; i < original.points.length; i++) {
    const support = original.pointSupport[i];
    const point = original.points[i];
    if (![support.timeS, support.supportStartS, support.supportEndS].every(Number.isFinite)
      || support.supportStartS > support.timeS || support.timeS > support.supportEndS
      || support.supportStartS < original.sampleStartS || support.supportEndS > original.sampleEndS) {
      throw new Error(`event refit: ${name} has invalid original raw point support`);
    }
    const beforeBurnout = support.supportStartS < burnout.latestS;
    const afterRecovery = recovery.kind === 'first-event'
      ? support.supportEndS >= recovery.event.earliestS : support.supportEndS > recovery.throughS;
    const x = point.density * point.velocityMs ** 2 * point.refAreaM2 / 2;
    originalXX += x * x;
    if (beforeBurnout || afterRecovery) {
      if (beforeBurnout && afterRecovery) both++;
      else if (beforeBurnout) burnoutOnly++;
      else recoveryOnly++;
      continue;
    }
    points.push(point);
    pointSupport.push(support);
    retainedXX += x * x;
  }
  if (points.length < MIN_COAST_POINTS) throw new Error(`event refit: ${name} has only ${points.length} qualified coast points; at least ${MIN_COAST_POINTS} are needed. Original preview retained.`);
  if (!(originalXX > 0) || !Number.isFinite(originalXX) || !Number.isFinite(retainedXX)) throw new Error(`event refit: ${name} has invalid regression leverage`);
  const window: CoastDerivation = {
    ...original,
    points, pointSupport,
    used: points.length,
    windowStartS: pointSupport[0].timeS,
    windowEndS: pointSupport[pointSupport.length - 1].timeS,
    supportStartS: Math.min(...pointSupport.map((s) => s.supportStartS)),
    supportEndS: Math.max(...pointSupport.map((s) => s.supportEndS)),
    minSpeedMs: Math.min(...points.map((p) => p.velocityMs)),
    maxSpeedMs: Math.max(...points.map((p) => p.velocityMs)),
    nonPositiveKept: points.filter((p) => !(p.accelMs2 > 0)).length,
    excluded: { lowSpeed: original.excluded.lowSpeed, event: burnoutOnly + recoveryOnly + both },
  };
  // Do not combine different mass regimes by deleting only separation neighborhoods.
  if (evidence.massChanges?.some((e) => e.earliestS <= window.supportEndS && e.latestS >= window.supportStartS)) {
    throw new Error(`event refit: ${name} has a known mass change across the retained support; constant-mass refit unsupported`);
  }
  return { window, exclusions: { burnoutOnly, recoveryOnly, both, retainedLeverageFraction: retainedXX / originalXX, originalSupportIdentity: supportIdentity(original) } };
}

/** Explicit conditional refit: no search over events, residuals, apogee or widths. */
export function refitDragScaleWithinEvents(original: DragFit, evidence: CalibrationEvidence): DragFit {
  if (original.selection !== undefined) throw new Error('event refit: start from the original heuristic preview, not a previous refit');
  const events = requireCalibrationEvents(evidence);
  const log = selectEventPoints(original.logWindow, events.log, 'log');
  const model = selectEventPoints(original.modelWindow, events.model, 'model');
  const logFit = calibrateCd(log.window.points, { allowNegativeAccel: true });
  const modelFit = calibrateCd(model.window.points, { allowNegativeAccel: true });
  const scale = logFit.cdCalibrated / modelFit.cdCalibrated;
  if (![logFit.cdCalibrated, modelFit.cdCalibrated, logFit.rmse, modelFit.rmse, scale].every(Number.isFinite)
    || !(logFit.cdCalibrated > 0) || !(modelFit.cdCalibrated > 0)) {
    throw new Error('event refit: signed OLS has a nonpositive or nonfinite effective Cd, residual or ratio; no usable scale');
  }
  if (scale < DRAG_SCALE_MIN || scale > DRAG_SCALE_MAX) throw new Error(`event refit: scale ${scale} is outside ${DRAG_SCALE_MIN}-${DRAG_SCALE_MAX}`);
  return {
    ...original,
    fittedCd: logFit.cdCalibrated, modelCd: modelFit.cdCalibrated,
    rmseN: logFit.rmse, modelRmseN: modelFit.rmse, scale,
    logWindow: log.window, modelWindow: model.window,
    warning: scale < DRAG_SCALE_TYPICAL_MIN || scale > DRAG_SCALE_TYPICAL_MAX
      ? `A scale of ${scale.toFixed(2)} is unusual (typical ${DRAG_SCALE_TYPICAL_MIN}-${DRAG_SCALE_TYPICAL_MAX}). Mass, geometry and sensor errors remain confounded.` : null,
    selection: { policy: 'reviewed-events-v1', events, originalLogWindow: coastWindowSummary(original.logWindow), originalModelWindow: coastWindowSummary(original.modelWindow), logExclusions: log.exclusions, modelExclusions: model.exclusions },
  };
}

export function fitDragScale(inputs: DragFitInputs): DragFit {
  if (!(inputs.coastMassKg > 0) || !Number.isFinite(inputs.coastMassKg)) {
    throw new Error('drag fit: the coast mass must be a positive number');
  }
  const logWindow = deriveCoastPoints(inputs.log, {
    massKg: inputs.coastMassKg,
    refAreaM2: inputs.refAreaM2,
    launchElevationM: inputs.launchElevationM,
  });
  const logFit = calibrateCd(logWindow.points, { allowNegativeAccel: true });

  const model = [...inputs.modelTelemetry].sort((a, b) => a.time - b.time);
  if (model.length === 0) throw new Error('drag fit: the model flight produced no telemetry');
  let modelWindow: CoastDerivation;
  try {
    modelWindow = deriveCoastPoints(
      model.map((p) => ({ timeS: p.time, altitudeM: p.altitude, velocityMs: p.velocity.z })),
      {
        massKg: inputs.coastMassKg,
        refAreaM2: inputs.refAreaM2,
        launchElevationM: inputs.launchElevationM,
      },
    );
  } catch (err) {
    throw new Error(`drag fit: the model's own coast could not be measured (${err instanceof Error ? err.message : String(err)})`);
  }
  const modelFit = calibrateCd(modelWindow.points, { allowNegativeAccel: true });
  if (!(modelFit.cdCalibrated > 0)) {
    throw new Error('drag fit: the model coast Cd is not positive');
  }

  const scale = logFit.cdCalibrated / modelFit.cdCalibrated;
  if (!Number.isFinite(scale) || scale < DRAG_SCALE_MIN || scale > DRAG_SCALE_MAX) {
    throw new Error(
      `drag fit: the scale ${Number.isFinite(scale) ? scale.toFixed(2) : String(scale)} is outside ` +
        `${DRAG_SCALE_MIN}-${DRAG_SCALE_MAX}. Check the mass, diameter, motor, launch elevation and log units before trusting a drag scale.`,
    );
  }
  return {
    fittedCd: logFit.cdCalibrated,
    rmseN: logFit.rmse,
    modelCd: modelFit.cdCalibrated,
    modelRmseN: modelFit.rmse,
    scale,
    logWindow,
    modelWindow,
    coastMassKg: inputs.coastMassKg,
    refAreaM2: inputs.refAreaM2,
    launchElevationM: inputs.launchElevationM,
    warning:
      scale < DRAG_SCALE_TYPICAL_MIN || scale > DRAG_SCALE_TYPICAL_MAX
        ? `A scale of ${scale.toFixed(2)} is unusual (typical ${DRAG_SCALE_TYPICAL_MIN}-${DRAG_SCALE_TYPICAL_MAX}). Part of it may be a mass or geometry error in the design, which the scale absorbs.`
        : null,
  };
}
