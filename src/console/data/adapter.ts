/**
 * Native engine -> contract adapter.
 *
 * Every number here comes from the native Rust core over the Tauri bridge
 * (`src/tauri/bridge.ts`): `simulate_flight` for 6-DOF runs,
 * `run_ensemble_chunk` for Monte Carlo, `stability` for the Barrowman
 * assembly, `aero_curves` for the drag preview, `aggregate_mass` for the mass
 * rollup. There is no mock layer and no TS engine fallback: when IPC is
 * unavailable the bridge throws and the error surfaces in the UI.
 *
 * Confidence levels are derived from what the native results actually say:
 *  - the engine's own `validity` and `enveloped` flags,
 *  - whether a mass or shear-modulus value is a user override,
 *  - whether the material has a shear-modulus table entry at all.
 * A quantity with no real basis is reported `unknown` with the factual
 * reason; nothing is invented.
 */
import type { EllipticalFinSetComponent, RocketComponent, RocketVehicle, StabilityAnalysis, TrapezoidFinSetComponent } from '../../core/types';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import type { SixDofSimulationResult, SixDofOptions } from '../../sim/sixDofSimulator';
import {
  computeDispersionStatistics,
  countOutcomes,
  eligibleIndexedEndpoints,
  finalizeClassifiedMonteCarloChunks,
  indexedEndpoints,
  type ClassifiedDispersionResult,
  type DispersionResult,
  type LandingPoint,
  type MonteCarloChunkResult,
  type MonteCarloRunOutcome,
  type PerturbationSigmas,
} from '../../sim/monteCarlo';
import { explainStabilityAnalysis } from '../../aero/stabilityBreakdown';
import { MATERIAL_SHEAR_MODULI, computeEllipticalFinFlutter, computeTrapezoidFinFlutter } from '../../aero/finFlutter';
import { getAtmosphereAt } from '../../sim/flightSimulator';
import { parseMomentArmHistory } from '../../application/momentArmHistory';
import { dispatchVehicle, effectiveFlightDragSource, hasPhysicsOptions, physicsOptionsOf } from '../../application/caseResolver';
import { builtUpDragStatus } from './builtUpDrag';
import { EVENT_LABEL } from '../../application/flightEvents';
import { describeDragCalibration, type DragCalibration } from '../../application/dragCalibration';
import { aeroModelDefect, isUsableAeroModel, type AeroModelSelection } from '../../application/aeroModel';
import { calibrationEngineStatus, flightModelBindingStatus } from '../../application/calibrationApplicability';
import { getEngineIdentity } from '../../engine';
import { runEnsembleChunkRecorded, simulateFlightRecorded, stabilityOf } from '../../tauri/bridge';
import { compareEngineIdentity, describeEngineIdentity, type EngineIdentity } from '../../engine/identity';
import type { ChannelId, Confidence, Dispersion, FlightEvent, FlightEventKind, FlightRun, FlutterHistory, FlutterPoint, Gate, Result, RunSummary, Series, StabilityBreakdown, Validity } from './contract';

export const FLUTTER_GATE = 1.5;
export const RAIL_EXIT_GATE = 15;
/** Tripoli Level 1 certification fails a flight landing in excess of 35 ft/s (10.668 m/s). */
export const LANDING_SPEED_GATE = 10.67;
export const TRIPOLI_LEVEL1_LANDING_URL = 'https://www.tripoli.org/Level1';
export const MARGIN_MIN = 1;
export const MARGIN_MAX = 3;
/** Runs per engine call: small enough to spread over the workers and report steady progress. */
export const MC_CHUNK_RUNS = 25;
export const MC_SEED = 20260909;

/** Flight inputs Console runs against; mirror of the workspace launch options. */
export interface LaunchConfig {
  /** Configured displacement along the guide to modeled full release; no guide geometry is inferred. */
  railLength: number;
  railElevationDeg: number;
  railAzimuthDeg: number;
  windSpeedSurface: number;
  windAzimuthDeg: number;
  finCantAngleDeg: number;
  mainDeployAltitudeAGL: number;
  /** Factor on the airframe drag coefficient from the project's drag calibration; absent = the model's own drag. */
  dragCdScale?: number;
}

/** Native flight options: never aero model, altitude, or temperature (vehicle-derived). */
export function sixDofOptions(o: LaunchConfig): SixDofOptions {
  return {
    railLength: o.railLength,
    railElevationDeg: o.railElevationDeg,
    railAzimuthDeg: o.railAzimuthDeg,
    windSpeedSurface: o.windSpeedSurface,
    windAzimuthDeg: o.windAzimuthDeg,
    finCantAngleDeg: o.finCantAngleDeg,
    mainDeployAltitudeAGL: o.mainDeployAltitudeAGL,
    ...(o.dragCdScale === undefined ? {} : { dragCdScale: o.dragCdScale }),
  };
}

/* ───────────── confidence from real signals ───────────── */

/**
 * How well the aerodynamics of a vehicle are established: one modeled
 * slender-body model, or, when the project carries a drag calibration, that
 * model with its airframe drag scaled to this rocket's own flight. A
 * calibration says the numbers were fitted to one logged flight; it never says
 * the model was validated.
 */
export function aeroConfidence(
  calibration?: DragCalibration,
  aeroModel?: AeroModelSelection,
): { confidence: Confidence; reason: string } {
  if (calibration !== undefined) {
    return {
      confidence: 'calibrated',
      reason: `Airframe drag scaled by ${calibration.scale.toFixed(3)}: ${describeDragCalibration(calibration)}. Fitted to one flight of this rocket, so a mass or geometry error in the design is absorbed into the scale; this is not a validation of the model.`,
    };
  }
  if (aeroModel !== undefined) {
    const defect = aeroModelDefect(aeroModel);
    if (defect !== null) return { confidence: 'unknown', reason: defect };
    if (!isUsableAeroModel(aeroModel)) {
      return {
        confidence: 'unknown',
        reason: `Aero model ${aeroModel.modelId} ${aeroModel.modelVersion} with term '${aeroModel.terms.transonic}' is not a valid pair; no result is produced.`,
      };
    }
    return {
      confidence: 'modeled',
      reason: `Hybrid aero model ${aeroModel.modelId} ${aeroModel.modelVersion}: the built-up method with Astraea's legacy drag override in Mach 0.80-1.20; not checked against your flights. Component breakdown unavailable inside the band.`,
    };
  }
  return {
    confidence: 'modeled',
    reason: 'Barrowman/Hoerner slender-body model with modeled transonic drag curves; not checked against your flights.',
  };
}

/**
 * Flight-specific Basis for committed flights: what the dispatched flight
 * actually flew, read from the recorded engine line. The panel Basis
 * (`aeroConfidence`, unchanged) describes the aero-model selection; a flight
 * that opted in to built-up axial drag must not claim the panel-only legacy
 * override, and a shape the engine refused must be described as refused rather
 * than as built-up drag flown. A fitted drag scale still applies on top of
 * whichever table flies, so its existing calibrated label and reason stay.
 */
export function flightAeroConfidence(
  vehicle: RocketVehicle,
  calibration: DragCalibration | undefined,
  aeroModel: AeroModelSelection | undefined,
  manifest: Record<string, string> | undefined,
): { confidence: Confidence; reason: string } {
  if (effectiveFlightDragSource(vehicle) === undefined) return aeroConfidence(calibration, aeroModel);
  const model = aeroModel === undefined
    ? 'Built-up flight drag'
    : `Built-up aero model ${aeroModel.modelId} ${aeroModel.modelVersion}`;
  const scale = calibration === undefined ? '' : ` ${aeroConfidence(calibration).reason}`;
  const status = builtUpDragStatus(manifest);
  if (status === 'unknown') return {
    confidence: 'unknown',
    reason: `${model}: built-up axial drag was requested, but the recorded engine drag source is unknown. No flight drag model or refusal can be established from this record.${scale}`,
  };
  const refused = status === 'refused';
  return {
    confidence: calibration === undefined ? 'modeled' : 'calibrated',
    reason: refused
      ? `${model}: built-up axial drag was requested, but the engine refused this shape and the flight used legacy drag; lift and stability in flight use the legacy model. Not checked against your flights; not a validated model.${scale}`
      : `${model}: flight axial drag comes from the built-up method at every Mach number, without the legacy override over Mach 0.80-1.20; lift and stability in flight use the legacy model. Not checked against your flights; not a validated model.${scale}`,
  };
}

/** Tabulated motor curves: certified library entries come from static-test data, derived/imported curves do not claim that. */
export function motorConfidence(provenance: string | undefined): { confidence: Confidence; reason: string } {
  return provenance === 'certified'
    ? { confidence: 'measured', reason: 'Tabulated curve from the certified motor library (static-test data).' }
    : { confidence: 'modeled', reason: 'Tabulated working curve, not a certified static-test record.' };
}

function r(value: number, unit: string, c: { confidence: Confidence; reason: string }): Result {
  return { value, unit, confidence: c.confidence, reason: c.reason };
}

/** A value the engine explicitly refuses to vouch for. */
const unknown = (value: number, unit: string, reason: string): Result => ({ value, unit, confidence: 'unknown', reason });

const INERTIAL: { confidence: Confidence; reason: string } = { confidence: 'modeled', reason: '6-DOF numeric integration of the modeled vehicle.' };

const MASS_MODELED: { confidence: Confidence; reason: string } = { confidence: 'modeled', reason: 'From material density and geometry.' };
const MASS_MEASURED: { confidence: Confidence; reason: string } = { confidence: 'measured', reason: 'Weighed part (mass override).' };
const MASS_MIXED: { confidence: Confidence; reason: string } = {
  confidence: 'modeled',
  reason: 'Sum of weighed overrides and material-derived part masses; some masses are still modeled.',
};
const MASS_SUM_MEASURED: { confidence: Confidence; reason: string } = {
  confidence: 'measured',
  reason: 'Sum of the user-declared weighed masses of every part.',
};
const CG_MODELED: { confidence: Confidence; reason: string } = {
  confidence: 'modeled',
  reason: 'Calculated from component mass, geometry, placement and CG inputs; not a balance measurement.',
};

const RECOVERY: { confidence: Confidence; reason: string } = {
  confidence: 'modeled',
  reason: 'Canopy drag with the declared empirical Cd; inflation and opening shock are not modeled.',
};

/**
 * Landing energy is one lumped whole-vehicle value, not a per-section energy.
 * The engine computes 0.5 * (dry mass + remaining propellant) * touchdown speed^2
 * (crates/astraea-core/src/six_dof.rs, landing_mass/landing_ke); no component or
 * suspended-section energy is resolved. It is a readout, not a gate: no standard
 * landing-energy threshold is applied here.
 */
const LANDING_ENERGY: { confidence: Confidence; reason: string } = {
  confidence: 'modeled',
  reason: 'Whole-vehicle kinetic energy at touchdown from one lumped mass (airframe plus remaining propellant) and the recorded touchdown speed. Per-section or suspended-section recovery energy is not computed, and no standard landing-energy threshold is applied.',
};

/**
 * The landing-speed gate is the Tripoli Level 1 certification limit, cited to
 * its primary text. It is a certification requirement, not a regulation. The
 * lumped whole-vehicle landing energy is a readout only: no standard energy
 * threshold exists and none is applied.
 */
const TRIPOLI_LANDING_LIMIT = `The Tripoli Level 1 certification limit is 35 ft/s (${LANDING_SPEED_GATE} m/s): landing in excess of 35 feet per second fails certification. Source: ${TRIPOLI_LEVEL1_LANDING_URL}.`;
const LANDING_ENERGY_NOTE = 'The lumped whole-vehicle landing energy shown elsewhere has no standard threshold and is not a pass/fail gate.';

const DRIFT_REASON = 'Power-law surface wind shear only: no sounding profile, so winds aloft are not represented. Monte Carlo samples the spread.';

/** Flight outcome as the engine reported it: a non-enveloped or non-valid run cannot carry a modeled level. */
function flightLevel(summary: { enveloped: boolean; validity: Validity }): { confidence: Confidence; reason: string } | null {
  if (!summary.enveloped) {
    return { confidence: 'unknown', reason: 'Part of the flight left the 6-DOF model\u2019s envelope (Mach 0-4, incidence <= 30 deg); results there are not modeled.' };
  }
  if (summary.validity === 'UNKNOWN' || summary.validity === 'NOT_APPLICABLE') {
    return { confidence: 'unknown', reason: `The engine reports validity ${summary.validity}; results are not vouched for.` };
  }
  return null;
}

/** Apply an aero-driven level, unless the run itself is unqualified. */
function aeroLevel(aero: { confidence: Confidence; reason: string }, summary: { enveloped: boolean; validity: Validity }): { confidence: Confidence; reason: string } {
  return flightLevel(summary) ?? aero;
}

/* ───────────── stability (native Barrowman assembly) ───────────── */

export function stabilityBreakdown(analysis: StabilityAnalysis, vehicle: RocketVehicle): StabilityBreakdown {
  const explained = explainStabilityAnalysis(vehicle, analysis);
  const anyOverride = vehicle.components.some((c) => c.massOverride !== undefined);
  const allOverridden = vehicle.components.length > 0 && vehicle.components.every((c) => c.massOverride !== undefined);
  const rows = explained.components.map((c) => {
    const comp = vehicle.components.find((x) => x.id === c.id);
    const mc = comp?.massOverride !== undefined ? MASS_MEASURED : MASS_MODELED;
    return {
      partId: c.id,
      name: c.name,
      type: c.type,
      mass: r(c.massKg, 'kg', mc),
      cg: r(c.cgM, 'm', CG_MODELED),
      cnAlpha: analysis.contributions.find((row) => row.id === c.id)?.cna == null
        ? unknown(0, '1/rad', 'The native engine did not publish a normal-force slope for this part.')
        : r(c.cnAlpha, '1/rad', { confidence: 'modeled', reason: 'Barrowman normal-force slope, subsonic.' }),
      cp: c.cpM == null ? undefined : r(c.cpM, 'm', { confidence: 'modeled', reason: 'Barrowman, subsonic.' }),
      contributionPct: c.contributionPct,
    };
  });
  return {
    rows,
    cg: r(explained.totalCgM, 'm', CG_MODELED),
    cp: analysis.cpUnavailable !== undefined
      ? unknown(Number.NaN, 'm', analysis.cpUnavailable)
      : r(explained.totalCpM, 'm', { confidence: 'modeled', reason: 'Geometry-only subsonic Barrowman CP; not the solver CP history.' }),
    margin: analysis.cpUnavailable !== undefined
      ? unknown(Number.NaN, 'cal', analysis.cpUnavailable)
      : r(explained.staticMarginCalibers, 'cal', {
        confidence: 'modeled',
        reason: `Geometry-only subsonic Barrowman CP against component-rollup CG${anyOverride ? ' including weighed parts' : ''}; excludes selected motor and depletion history.`,
      }),
    marginPercentLength: Number.isFinite(explained.staticMarginCalibers) && Number.isFinite(analysis.referenceDiameter) && analysis.referenceDiameter > 0 && Number.isFinite(analysis.totalLength) && analysis.totalLength > 0
      ? r(100 * explained.staticMarginCalibers * analysis.referenceDiameter / analysis.totalLength, '%', { confidence: 'modeled', reason: 'Geometry reference conversion: 100 × margin in calibers × reference diameter / total length. No powered-flight or competition assessment.' })
      : undefined,
    totalMass: r(analysis.totalMass, 'kg', allOverridden ? MASS_SUM_MEASURED : (anyOverride ? MASS_MIXED : MASS_MODELED)),
    length: analysis.totalLength,
    refDiameter: analysis.referenceDiameter,
    notes: explained.plainLanguage,
    parts: analysis.contributions.map((c) => ({ id: c.id, axialStart: c.axialStart, axialEnd: c.axialEnd, cg: c.cg, mass: c.mass })),
  };
}

/** Live stability for a vehicle, over the native `stability` command. */
export async function stabilityOfVehicle(vehicle: RocketVehicle, aeroModel?: import('../../application/aeroModel').AeroModelSelection): Promise<StabilityBreakdown> {
  const analysis = await stabilityOf(vehicle, aeroModel);
  return stabilityBreakdown(analysis, vehicle);
}

export function marginGate(m: Result): Gate {
  const v = m.value;
  const status = !Number.isFinite(v) ? 'unknown' : v < MARGIN_MIN ? 'fail' : v > MARGIN_MAX ? 'caution' : 'pass';
  return {
    id: 'static_margin',
    label: 'Geometry static margin',
    stage: 'aero',
    status,
    value: m,
    threshold: `${MARGIN_MIN}-${MARGIN_MAX} cal`,
    reason: !Number.isFinite(v)
      ? m.confidence === 'unknown' && m.reason ? `No geometry margin: ${m.reason}` : 'The engine returned no static margin for this vehicle.'
      : v < MARGIN_MIN
        ? 'Below the generic geometry screening band; selected-motor and powered-flight margins are not assessed.'
        : v > MARGIN_MAX
          ? 'Above the generic geometry screening band; weathercocking requires flight analysis.'
          : 'Inside the generic geometry screening band; no powered-flight or competition assessment.',
  };
}

/* ───────────── 6-DOF flight run ───────────── */

const EVENT_KIND: Record<string, FlightEventKind> = {
  'Ignition & Rail Guidance': 'ignition',
  'Launch Rail Departure': 'rail_exit',
  'Motor Burnout': 'burnout',
  'Apogee & Drogue Deployment': 'apogee_drogue',
  'Main Parachute Deployment': 'main',
  'Ground Touchdown': 'touchdown',
};
export const eventLabel = (k: FlightEventKind) => EVENT_LABEL[k];

/**
 * A drag scale reaches the engine only together with the calibration that
 * explains it: results are labelled from the calibration, so a bare scale (or
 * a calibration that was not applied) would produce an unlabelled or falsely
 * labelled number. This adapter executes only the supported legacy contract:
 * foreign-bound artifacts stay history, even when their numeric scale matches.
 * Legacy fits without a recorded engine identity retain their explicit policy.
 * Recorded identities, including missing hashes, are checked asynchronously
 * below before any flight or ensemble dispatch.
 */
export function assertScaleMatchesCalibration(runLabel: string, options: LaunchConfig, calibration: DragCalibration | undefined): void {
  if (calibration !== undefined && flightModelBindingStatus(calibration) === 'incompatible') {
    throw new Error(`${runLabel}: incompatible flight-model binding; retained calibration cannot be applied to the legacy engine`);
  }
  if (options.dragCdScale !== calibration?.scale) {
    throw new Error(`${runLabel}: options.dragCdScale (${String(options.dragCdScale)}) does not match the drag calibration (${String(calibration?.scale)}); a drag scale is only run together with its calibration`);
  }
}

/**
 * Engine identity is only knowable asynchronously (the WASM bytes are hashed
 * when the pool loads), so the exact comparison happens here at the existing
 * dispatch boundary. When the fit recorded an engine identity, only an exact
 * match dispatches: a different engine and an unverifiable (missing-hash)
 * identity both refuse, with distinct reasons. Legacy fits with no recorded
 * identity keep their established policy.
 */
async function assertCalibrationEngine(runLabel: string, calibration: DragCalibration | undefined): Promise<void> {
  if (calibration === undefined) return;
  const status = calibrationEngineStatus(calibration, await getEngineIdentity());
  if (status === 'different') {
    throw new Error(`${runLabel}: the drag calibration was fitted with a different engine; it is retained as history but cannot be dispatched to this engine`);
  }
  if (status === 'unknown') {
    throw new Error(`${runLabel}: the drag calibration's fit engine cannot be verified (a SHA-256 is unavailable); a recorded engine identity must match exactly before the scale is dispatched`);
  }
}

/** One native 6-DOF run, converted for the UI. `inputKey` identifies the inputs it ran against. */
export async function runFlight(
  vehicle: RocketVehicle,
  motor: MotorSpec,
  options: LaunchConfig,
  motorProvenance: string | undefined,
  inputKey: string,
  rev: number,
  shearOverridePa?: number,
  calibration?: DragCalibration,
  reportMomentArmHistory?: boolean,
  aeroModel?: AeroModelSelection,
): Promise<FlightRun> {
  const t0 = performance.now();
  assertScaleMatchesCalibration('runFlight', options, calibration);
  await assertCalibrationEngine('runFlight', calibration);
  // The vehicle this run flies, resolved once: the bridge request, its admission rule and the
  // recorded metadata (physics options, confidence text) all use it, so they cannot disagree.
  const flown = dispatchVehicle(vehicle, sixDofOptions(options), calibration);
  const { value: res, engineIdentity } = await simulateFlightRecorded(flown, motor, sixDofOptions(options), reportMomentArmHistory, aeroModel);
  const durationMs = performance.now() - t0;
  return toFlightRun(res, flown, motorProvenance, inputKey, rev, durationMs, shearOverridePa, calibration, options, engineIdentity, aeroModel);
}

export function toFlightRun(
  res: SixDofSimulationResult,
  vehicle: RocketVehicle,
  motorProvenance: string | undefined,
  inputKey: string,
  rev: number,
  durationMs: number,
  shearOverridePa?: number,
  calibration?: DragCalibration,
  options?: LaunchConfig,
  engineIdentity?: EngineIdentity,
  aeroModel?: AeroModelSelection,
): FlightRun {
  const momentArmHistory = Object.hasOwn(res, 'momentArmHistory') ? parseMomentArmHistory(res.momentArmHistory) : undefined;
  if (momentArmHistory && (!engineIdentity || momentArmHistory.burnoutTimeS !== res.burnoutTime
    || momentArmHistory.timeRangeS[1] > res.flightDuration)) {
    throw new Error('momentArmHistory: missing invocation identity or inconsistent flight clock');
  }
  const aero = flightAeroConfidence(vehicle, calibration, aeroModel, res.runManifest as unknown as Record<string, string>);
  const summaryLevel = flightLevel(res);
  const aero2 = aeroLevel(aero, res);

  const events: FlightEvent[] = res.events
    .map((e) => ({ kind: EVENT_KIND[e.name], e }))
    .filter((x): x is { kind: FlightEventKind; e: (typeof res.events)[number] } => x.kind !== undefined)
    .map(({ kind, e }) => ({ t: e.time, kind, label: EVENT_LABEL[kind], altitude: e.altitude, velocity: e.velocity }))
    .sort((a, b) => a.t - b.t);
  const telemetry = res.telemetry ?? [];
  // Native display samples are bounded/rounded; reject malformed q/time values
  // instead of letting a NaN first sample silently hide every later maximum.
  const validQ = telemetry.filter((p) => Number.isFinite(p.time) && p.time >= 0 && Number.isFinite(p.dynamicPressure) && p.dynamicPressure >= 0);
  const peak = validQ.reduce<(typeof telemetry)[number] | undefined>((best, p) => !best || p.dynamicPressure > best.dynamicPressure ? p : best, undefined);
  const orderedTimes = telemetry.every((p, i) => Number.isFinite(p.time) && p.time >= 0 && (i === 0 || p.time >= telemetry[i - 1].time));
  const maxObservedGapS = telemetry.length > 1 && orderedTimes
    ? telemetry.slice(1).reduce((gap, p, i) => Math.max(gap, p.time - telemetry[i].time), 0)
    : undefined;
  const sampledMaxQ = peak ? { time: peak.time, sampleCount: telemetry.length, validSampleCount: validQ.length, maxObservedGapS } : undefined;
  if (peak) {
    events.push({ t: peak.time, kind: 'max_q', label: EVENT_LABEL.max_q, altitude: peak.altitude, velocity: peak.speed, derived: true });
    events.sort((a, b) => a.t - b.t);
  }
  const channel = (unit: string, field: (point: (typeof telemetry)[number]) => number, level = aero2): Result<number[]> => ({
    value: telemetry.map(field), unit, ...level,
  });
  const channels: Record<ChannelId, Result<number[]>> = {
    altitude: channel('m', (p) => p.altitude),
    airspeed: channel('m/s', (p) => p.speed),
    mach: channel('1', (p) => p.mach),
    aoa: channel('deg', (p) => p.angleOfAttackDeg),
    q: channel('Pa', (p) => p.dynamicPressure),
    accel: channel('m/s²', (p) => p.acceleration, INERTIAL),
    thrust: channel('N', (p) => p.thrust, motorConfidence(motorProvenance)),
    drag: channel('N', (p) => p.drag),
    mass: channel('kg', (p) => p.mass, MASS_MODELED),
  };
  const series: Series = { t: telemetry.map((p) => p.time), channels, attitude: telemetry.map((p) => p.q), position: telemetry.map((p) => p.position) };

  const summary: RunSummary = {
    validity: res.validity as Validity,
    enveloped: res.enveloped,
    offNominalExcursion: res.offNominalExcursion,
    apogee: r(res.apogeeAltitude, 'm', aero2),
    apogeeTime: r(res.apogeeTime, 's', INERTIAL),
    maxSpeed: r(res.maxVelocity, 'm/s', aero2),
    maxMach: r(res.maxMach, '1', aero2),
    maxAccelG: r(res.maxAccelerationG, 'g', INERTIAL),
    maxQ: peak ? r(peak.dynamicPressure, 'Pa', { ...aero2, ...(validQ.length === telemetry.length && orderedTimes ? {} : { confidence: 'unknown' as const }), reason: 'Peak of finite nonnegative q/time display samples. Sampling and decimation can miss the continuous-time peak by an unbounded amount; nonterminal integer-Pa rounding can also make the displayed peak exceed it. No continuous-peak magnitude or timing error bound is established.' }) : undefined,
    railExitSpeed: r(res.railExitVelocity, 'm/s', { ...aero2, reason: 'Ground-speed magnitude at modeled full release after the configured guide travel; guide geometry and first rotational freedom are not resolved.' }),
    burnoutAltitude: r(res.burnoutAltitude, 'm', aero2),
    landingSpeed: r(res.landingVelocity, 'm/s', summaryLevel ?? RECOVERY),
    landingEnergy: r(res.landingKineticEnergy, 'J', summaryLevel ?? LANDING_ENERGY),
    drift: r(res.landingDistance, 'm', summaryLevel ?? { confidence: 'extrapolated', reason: DRIFT_REASON }),
    flightTime: r(res.flightDuration, 's', INERTIAL),
    weathercockAngleDeg: r(res.weathercockAngleDeg, 'deg', aero2),
    landingNominal: res.touchdownNominal,
  };

  const flutter = flutterHistory(vehicle, telemetry.map((p) => ({ t: p.time, speed: p.speed, altitude: p.altitude })), aero, shearOverridePa, vehicle.launchSite?.altitudeM ?? 0);
  const validity = res.validity as Validity;
  const why = validityExplanation(res);
  const gates: Gate[] = flightGates(res, summary, flutter, vehicle, validity, why);

  // The physics options this run actually sent, derived from the same vehicle
  // the bridge derived them from. Absent when none, so a default run adds no
  // field and no display row.
  const physicsOptions = physicsOptionsOf(vehicle);
  const sentPhysicsOptions = hasPhysicsOptions(physicsOptions) ? physicsOptions : undefined;
  const manifest: Record<string, string> = {};
  for (const [key, value] of Object.entries(res.runManifest ?? {})) {
    manifest[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  manifest.engineIdentity = describeEngineIdentity(engineIdentity);
  manifest.railTravel = `User-configured guide-travel scalar${options ? `: ${options.railLength} m` : ': value unavailable in this stored run'}. Displacement from initial position to modeled full release; surveyed geometry provenance unavailable. Physical rail length and first rotational freedom are not inferred; partial guide constraints and tip-off are not modeled.`;
  manifest.sampledMaxQ = `Peak from bounded native display samples. Sampling and decimation can miss the continuous-time peak by an unbounded amount; nonterminal integer-Pa rounding can also make the displayed peak exceed it. ${telemetry.length} samples, ${validQ.length} finite nonnegative q/time samples. Maximum observed timestamp gap: ${maxObservedGapS === undefined ? 'unavailable' : `${maxObservedGapS} s`}. No continuous-peak magnitude or timing error bound.`;
  if (momentArmHistory) manifest.momentArmHistory = `${momentArmHistory.modelId}; raw committed-macro samples with instantaneous modeled CG. Sampled only, not a continuous minimum or dynamic/competition stability assessment.`;
  manifest.motorCurve = motorConfidence(motorProvenance).reason;
  if (calibration !== undefined) manifest.dragCalibration = describeDragCalibration(calibration);

  return {
    rev, at: Date.now(), inputKey, ...(engineIdentity === undefined ? {} : { engineIdentity }), summary, terminationReason: res.terminationReason, events, telemetry, series, sampledMaxQ, flutter, gates, manifest,
    ...(sentPhysicsOptions === undefined ? {} : { physicsOptions: sentPhysicsOptions }), durationMs,
    ...(calibration === undefined ? {} : { dragCalibration: calibration }),
    ...(momentArmHistory === undefined ? {} : { momentArmHistory }),
  };
}

/* \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 flight checks: one rule, four outcomes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

/** Plain-language reason the engine gave a run its validity. */
export function validityExplanation(res: Pick<SixDofSimulationResult, 'validity' | 'enveloped' | 'offNominalExcursion' | 'touchdownNominal' | 'terminationReason'>): string {
  if (res.validity === 'PASS') return 'The engine vouches for this run: it stayed inside its modeled range and landed normally.';
  if (res.validity === 'FAIL') {
    return res.terminationReason === 'timeout'
      ? 'The engine marked this run invalid: it stopped on its time limit before touchdown.'
      : 'The engine marked this run invalid: it ended without a finite landing.';
  }
  if (res.validity === 'NOT_APPLICABLE') return 'The engine reports that validity does not apply to this run.';
  const causes: string[] = [];
  if (!res.enveloped) causes.push('part of the flight left the modeled range (Mach 0\u20134, angle of attack up to 30\u00b0)');
  if (res.offNominalExcursion) causes.push('part of the flight used extrapolated or unsupported model data');
  if (!res.touchdownNominal) causes.push('it did not land normally under recovery');
  return `The engine does not vouch for this run${causes.length ? `: ${causes.join('; ')}` : ''}.`;
}

/**
 * Qualify a check's raw verdict by the run's validity. A value that already
 * fails its limit stays a failure (a known constraint proves it); a pass is
 * only a pass when the engine vouches for the run; an invalid run cannot pass.
 */
export function qualifyByValidity(raw: 'pass' | 'fail' | 'unknown' | 'n/a', validity: Validity): Gate['status'] {
  if (raw === 'fail' || raw === 'n/a') return raw;
  if (validity === 'FAIL') return 'invalid';
  if (raw === 'pass' && validity !== 'PASS') return 'unknown';
  return raw;
}

const VALIDITY_DISPLAY: Record<Validity, string> = { PASS: 'Valid', FAIL: 'Invalid', UNKNOWN: 'Unknown', NOT_APPLICABLE: 'N/A' };

function flightGates(
  res: SixDofSimulationResult,
  summary: RunSummary,
  flutter: FlutterHistory | undefined,
  vehicle: RocketVehicle,
  validity: Validity,
  why: string,
): Gate[] {
  const notVouched = (status: Gate['status'], judged: string): string =>
    status === 'invalid' ? `Not judged: ${why}` : status === 'unknown' && validity !== 'PASS' ? `${judged} ${why} So this check is not confirmed.` : judged;
  const validityFix = { fixStage: 'flight' as const, advice: 'See Run validity: the engine flagged this run, so fix that first.' };

  const rail = res.railExitVelocity;
  // The engine's own decision is `certified && speed >= 15`. Split it: the
  // speed is judged against the limit, and the certification part is the
  // run's validity, applied by `qualifyByValidity`. A valid run the engine
  // still refused keeps the engine's refusal.
  const engineRefusedValid = validity === 'PASS' && !res.isRailExitSafe;
  const railRaw = !Number.isFinite(rail) ? 'unknown' : rail < RAIL_EXIT_GATE || engineRefusedValid ? 'fail' : 'pass';
  const railStatus = qualifyByValidity(railRaw, validity);
  const railSpeed = Number.isFinite(rail) ? `${rail.toFixed(1)} m/s` : 'unknown';
  const railJudged = railRaw === 'pass'
    ? `Leaves the rail at ${railSpeed}, at or above the ${RAIL_EXIT_GATE} m/s minimum.`
    : railRaw === 'fail'
      ? rail < RAIL_EXIT_GATE
        ? `Leaves the rail at ${railSpeed}, below the ${RAIL_EXIT_GATE} m/s minimum: the fins may not steer it yet.`
        : `The engine's rail-exit screen did not pass this run (speed at release ${railSpeed}).`
      : 'The run reported no rail exit speed.';
  const railScope = ' Generic screen at modeled release; first rotational freedom and competition compliance are not assessed.';

  const flutterGate: Gate = flutter
    ? (() => {
        const m = flutter.worst.margin.value;
        const raw = !Number.isFinite(m) ? 'unknown' : m >= FLUTTER_GATE ? 'pass' : 'fail';
        const status = qualifyByValidity(raw, validity);
        const judged = `Worst at t = ${flutter.worst.t.toFixed(1)} s: flutter speed ${flutter.worst.flutterSpeed.toFixed(0)} m/s vs airspeed ${flutter.worst.airspeed.toFixed(0)} m/s.`;
        return {
          id: 'flutter', label: 'Fin flutter margin', stage: 'aero', status, value: flutter.worst.margin,
          threshold: `\u2265 ${FLUTTER_GATE}\u00d7`,
          reason: notVouched(status, judged),
          ...(status === 'fail' ? { advice: 'Thicker fins, a stiffer material, a tested shear modulus, or less speed.' } : status === 'invalid' ? validityFix : {}),
        } satisfies Gate;
      })()
    : {
        id: 'flutter', label: 'Fin flutter margin', stage: 'aero', status: 'n/a',
        value: unknown(NaN, '\u00d7', 'No fin set on this vehicle.'),
        threshold: `\u2265 ${FLUTTER_GATE}\u00d7`,
        reason: 'No fin set on this vehicle.',
      };

  const envelopeStatus: Gate['status'] = validity === 'FAIL' ? 'invalid' : res.enveloped ? 'pass' : 'unknown';
  const hasChute = vehicle.components.some((c) => c.type === 'parachute');
  const landingRaw = !res.touchdownNominal || !Number.isFinite(res.landingVelocity) ? 'unknown' : res.landingVelocity <= LANDING_SPEED_GATE ? 'pass' : 'fail';
  const landingStatus = qualifyByValidity(landingRaw, validity);
  const landingJudged = landingRaw === 'unknown'
    ? 'No normal touchdown, so landing speed is not checked.'
    : landingRaw === 'pass'
      ? `Touches down at ${res.landingVelocity.toFixed(1)} m/s, at or below the limit.`
      : `Touches down at ${res.landingVelocity.toFixed(1)} m/s, above the limit.`;

  return [
    {
      id: 'rail_exit',
      label: 'Rail exit speed',
      stage: 'flight',
      status: railStatus,
      value: summary.railExitSpeed,
      threshold: `\u2265 ${RAIL_EXIT_GATE} m/s`,
      reason: notVouched(railStatus, railJudged) + railScope,
      ...(railStatus === 'fail' ? { advice: 'Use a longer rail, or a motor with more thrust at liftoff.', fixStage: 'mission' as const }
        : railStatus === 'invalid' || railStatus === 'unknown' ? validityFix : {}),
    },
    flutterGate,
    {
      id: 'envelope',
      label: 'Inside engine envelope',
      stage: 'flight',
      status: envelopeStatus,
      value: summary.maxMach,
      threshold: 'Mach 0\u20134, angle of attack \u2264 30\u00b0',
      reason: envelopeStatus === 'invalid'
        ? `Not judged: ${why}`
        : res.enveloped
          ? 'The whole flight stayed inside the range the 6-DOF model covers.'
          : 'Part of the flight left the modeled range; results there are unknown.',
      ...(envelopeStatus === 'unknown' ? { advice: 'Check where Mach or angle of attack left the modeled range.' } : envelopeStatus === 'invalid' ? validityFix : {}),
    },
    {
      id: 'landing_speed',
      label: 'Landing speed',
      stage: 'recovery',
      status: landingStatus,
      value: summary.landingSpeed,
      threshold: `\u2264 ${LANDING_SPEED_GATE} m/s (35 ft/s)`,
      reason: `${notVouched(landingStatus, landingJudged)} ${TRIPOLI_LANDING_LIMIT} ${LANDING_ENERGY_NOTE}`,
      ...(landingStatus === 'fail'
        ? { advice: hasChute ? 'Use a larger main parachute or one with a higher drag coefficient.' : 'Add a parachute.' }
        : landingStatus === 'invalid' || (landingStatus === 'unknown' && validity !== 'PASS') ? validityFix : {}),
    },
    {
      id: 'validity',
      label: 'Run validity',
      stage: 'flight',
      status: validity === 'PASS' ? 'pass' : validity === 'FAIL' ? 'invalid' : validity === 'UNKNOWN' ? 'unknown' : 'n/a',
      value: r(res.flightDuration, 's', INERTIAL),
      display: VALIDITY_DISPLAY[validity],
      threshold: 'Must be valid',
      reason: why,
      ...(validity === 'PASS' ? {} : { advice: 'Open the run manifest in Flight to see what the engine flagged.' }),
    },
  ];
}

/* ───────────── flutter along the flight ───────────── */

type FinSet = TrapezoidFinSetComponent | EllipticalFinSetComponent;
const isFinSet = (c: RocketComponent): c is FinSet => c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset';

/** Flutter at each bounded native display sample, using its altitude and airspeed. */
export function flutterHistory(
  vehicle: RocketVehicle,
  points: { t: number; speed: number; altitude?: number }[],
  aero: { confidence: Confidence; reason: string },
  shearOverridePa?: number,
  siteAltitudeM = 0,
): FlutterHistory | undefined {
  const fin = vehicle.components.find(isFinSet);
  if (!fin) return undefined;
  const at = (a: number, p: number) =>
    fin.type === 'trapezoidfinset' ? computeTrapezoidFinFlutter(fin, shearOverridePa, a, p) : computeEllipticalFinFlutter(fin, shearOverridePa, a, p);
  const sea = at(340.3, 101325);
  const sc = shearConfidence(shearOverridePa !== undefined, fin.materialId, aero);
  const sampled: FlutterPoint[] = [];
  for (const p of points) {
    if (!(p.speed >= 5)) continue;
    const atm = getAtmosphereAt(siteAltitudeM + (p.altitude ?? 0));
    const vf = at(atm.speedOfSound, atm.pressure).flutterVelocity;
    sampled.push({ t: p.t, airspeed: p.speed, flutterSpeed: vf, margin: vf / p.speed });
  }
  const worst = sampled.reduce<FlutterPoint | null>((w, p) => (w === null || p.margin < w.margin ? p : w), null);
  const fallback: FlutterPoint = { t: 0, airspeed: 0, flutterSpeed: sea.flutterVelocity, margin: NaN };
  const w = worst ?? fallback;
  return {
    finSetId: fin.id,
    finSetName: fin.name,
    points: sampled,
    worst: {
      t: w.t,
      airspeed: w.airspeed,
      flutterSpeed: w.flutterSpeed,
      margin: Number.isFinite(w.margin)
        ? r(w.margin, '\u00d7', { confidence: sc.confidence, reason: `Depends on the shear modulus. ${sc.reason}` })
        : unknown(NaN, '\u00d7', 'No native sample fast enough to evaluate flutter.'),
    },
    seaLevelFlutterSpeed: r(sea.flutterVelocity, 'm/s', sc),
    shearModulus: r(sea.shearModulus, 'Pa', sc),
    disclaimer: sea.disclaimer,
    provenance: 'NACA TN-4197 evaluated at the native display samples and each sample’s ISA altitude. The sampled minimum is not a continuous-time bound.',
  };
}

/** Shear modulus: a user override is the measured value; a table entry is modeled; no entry at all is unknown. */
export function shearConfidence(custom: boolean, materialId: string, aero: { confidence: Confidence; reason: string }): { confidence: Confidence; reason: string } {
  if (custom) return { confidence: 'measured', reason: 'User-entered shear modulus (from a test).' };
  if (MATERIAL_SHEAR_MODULI[materialId] === undefined) {
    return {
      confidence: 'unknown',
      reason: `No shear-modulus entry for material '${materialId}'; the engine substitutes a generic timber value, which is not this material.`,
    };
  }
  return {
    confidence: 'modeled',
    reason: `Isotropic table value for '${materialId}'; real layups vary. ${aero.reason}`,
  };
}

/* ───────────── Monte Carlo dispersion ───────────── */

export interface McRunInput {
  vehicle: RocketVehicle;
  motor: MotorSpec;
  options: LaunchConfig;
  nRuns: number;
  seed?: number;
  sigmas?: PerturbationSigmas;
  /** The calibration the options' `dragCdScale` came from, recorded on the result. */
  dragCalibration?: DragCalibration;
  /**
   * The aero-model selection the committed ensemble is admitted against. It is
   * an app-side admission input only (never a wire option); the bridge applies
   * the shared selection × drag opt-in rule to every chunk.
   */
  aeroModel?: AeroModelSelection;
}

export interface McCallbacks {
  onProgress?: (done: number, landings: LandingPoint[], failed: number, runs: MonteCarloRunOutcome[]) => void;
  onCancelled?: (done: number) => void;
}

/**
 * Chunked Monte Carlo host: absolute ranges of a `per-run-v2` ensemble, so the
 * accumulated cloud is identical to a whole-ensemble call. Cancellation stops
 * before the next chunk and discards the partial cloud — a cancelled ensemble
 * records no result rather than a partial one dressed up as complete.
 */
export async function runMonteCarlo(input: McRunInput, signal: AbortSignal, cb: McCallbacks = {}): Promise<Dispersion> {
  assertScaleMatchesCalibration('runMonteCarlo', input.options, input.dragCalibration);
  await assertCalibrationEngine('runMonteCarlo', input.dragCalibration);
  const nRuns = Math.max(1, Math.floor(input.nRuns));
  const seed = input.seed ?? MC_SEED;
  const sigmas = input.sigmas ?? { windAzimuthDegSigma: 20, railAngleDegSigma: 1, impulsePctSigma: 3 };
  // Resolved once: every chunk, its admission and the recorded physics options use this vehicle.
  const flown = dispatchVehicle(input.vehicle, sixDofOptions(input.options), input.dragCalibration);
  const base = { vehicle: flown, motor: input.motor, options: sixDofOptions(input.options) };
  // Every chunk goes to the engine pool at once, so the ensemble spreads over
  // the worker cores. Chunks are absolute run ranges of a per-run-v2 ensemble,
  // so completion order never changes the numbers; they are re-sorted before
  // the final statistics.
  const chunks: MonteCarloChunkResult[] = [];
  const identities: EngineIdentity[] = [];
  let done = 0;
  const pending: Promise<void>[] = [];
  for (let start = 0; start < nRuns; start += MC_CHUNK_RUNS) {
    const end = Math.min(nRuns, start + MC_CHUNK_RUNS);
    pending.push(
      runEnsembleChunkRecorded(base, sigmas, nRuns, seed, start, end, 'per-run-v2', signal, input.aeroModel).then(({ value: chunk, engineIdentity }) => {
        if (signal.aborted) return;
        if (identities.some((identity) => compareEngineIdentity(identity, engineIdentity) === 'different')) {
          throw new Error('ensemble chunks used different engines; no combined result recorded');
        }
        identities.push(engineIdentity);
        chunks.push(chunk);
        done += chunk.runEnd - chunk.runStart;
        const runs = [...chunks]
          .sort((a, b) => a.runStart - b.runStart)
          .flatMap((c) => c.runs ?? []);
        cb.onProgress?.(
          done,
          chunks.flatMap((c) => c.landings),
          chunks.reduce((sum, c) => sum + c.failedRuns, 0),
          runs,
        );
      }),
    );
  }
  try {
    await Promise.all(pending);
  } catch (err) {
    if (!signal.aborted) throw err;
  }
  if (signal.aborted) {
    cb.onCancelled?.(done);
    throw new Error(`cancelled after ${done} of ${nRuns} runs - no result recorded`);
  }
  chunks.sort((a, b) => a.runStart - b.runStart);
  // Exactly-once absolute-index coverage is required before a complete result
  // exists; otherwise finalize throws and no archive/result is recorded.
  const dispersion = dispersionOf(finalizeClassifiedMonteCarloChunks(chunks, nRuns));
  // All calls were dispatched synchronously to one backend. Missing hashes stay unknown.
  if (identities.length > 0) {
    const first = identities[0];
    dispersion.engineIdentity = identities.some((identity) => identity.sha256 === null)
      ? Object.freeze({ kind: first.kind, sha256: null }) : first;
  }
  // What this ensemble actually sent, derived from the same vehicle as the bridge.
  const physics = physicsOptionsOf(flown);
  if (hasPhysicsOptions(physics)) dispersion.physicsOptions = physics;
  return input.dragCalibration === undefined ? dispersion : { ...dispersion, dragCalibration: input.dragCalibration };
}

export function dispersionOf(result: DispersionResult | ClassifiedDispersionResult): Dispersion {
  return {
    ...(result.normalLawId === undefined ? {} : { normalLawId: result.normalLawId }),
    ...(result.boattailPolicy === undefined ? {} : { boattailPolicy: result.boattailPolicy }),
    ...(result.finInterferenceId === undefined ? {} : { finInterferenceId: result.finInterferenceId }),
    ...(result.axialDrag === undefined ? {} : { axialDrag: result.axialDrag }),
    landings: result.landings,
    mean: result.mean,
    sigma1: result.sigma1,
    sigma2: result.sigma2,
    thetaDeg: result.thetaDeg,
    r50: result.containmentRadii.r50,
    r90: result.containmentRadii.r90,
    r99: result.containmentRadii.r99,
    ok: result.successfulRuns,
    failed: result.failedRuns,
    ...(result.runs === undefined ? {} : { runs: result.runs }),
    ...(result.counts === undefined ? {} : { counts: result.counts }),
    ...(result.endpoints === undefined ? {} : { endpoints: result.endpoints }),
    ...(result.eligibleEndpoints === undefined ? {} : { eligibleEndpoints: result.eligibleEndpoints }),
    ...(result.statisticsAvailable === undefined ? {} : { statisticsAvailable: result.statisticsAvailable }),
    ...(result.statistics === undefined ? {} : { statistics: result.statistics }),
    ...(result.outcomePolicy === undefined ? {} : { outcomePolicy: result.outcomePolicy }),
  };
}

/**
 * Running display for a partial classified cloud. Statistics still use only
 * supported nominal terminals, so a partial all-timeout/unsupported cloud
 * shows no fabricated rings. `landings` keeps the legacy finite-endpoint set.
 */
export function partialDispersion(
  landings: LandingPoint[],
  failed: number,
  dragCalibration?: DragCalibration,
  runs?: MonteCarloRunOutcome[],
  requested?: number,
): Dispersion {
  const eligible = runs === undefined ? null : eligibleIndexedEndpoints(runs);
  const source = eligible === null ? landings : eligible.map((entry) => entry.point);
  const statistics = source.length === 0 ? null : computeDispersionStatistics(source);
  const mean = statistics?.mean ?? { x: NaN, y: NaN };
  return {
    landings,
    mean,
    sigma1: statistics?.sigma1 ?? NaN,
    sigma2: statistics?.sigma2 ?? NaN,
    thetaDeg: statistics?.thetaDeg ?? NaN,
    r50: statistics?.containmentRadii.r50 ?? NaN,
    r90: statistics?.containmentRadii.r90 ?? NaN,
    r99: statistics?.containmentRadii.r99 ?? NaN,
    ok: landings.length,
    failed,
    ...(runs === undefined ? {} : {
      runs,
      counts: countOutcomes(runs, requested ?? runs.length),
      endpoints: indexedEndpoints(runs),
      eligibleEndpoints: eligible!,
      statisticsAvailable: statistics !== null,
      statistics,
      outcomePolicy: 'classified-v1' as const,
    }),
    ...(dragCalibration === undefined ? {} : { dragCalibration }),
  };
}
