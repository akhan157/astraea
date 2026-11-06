/** Bounded, dispatch-time inputs. Never embed a project, ledger, or run history. */
import type { RocketVehicle } from '../core/types';
import type { MotorRecord, ProjectEnvelope, ProjectSnapshot } from '../formats/projectJson';
import type { DragCalibration } from './dragCalibration';
import type { AeroModelSelection } from './aeroModel';
import { hashHex, stableStringify, type LaunchOptions } from './caseResolver';
import { WEATHER_SNAPSHOT_IDS } from './weatherSnapshots';
import type { Workspace, EnsembleSettings } from './workspace';
import type { Mission } from './mission';
import type { SixDofOptions } from '../sim/sixDofSimulator';
import { resolveFlightModel, isCandidateFlightModel, type CandidateFlightModelSelection, type LegacyFlightModelSelection } from './flightModel';
import type { CandidateInvocation, CandidateMotorDerivation } from './candidate';
import { assertCandidateInvocationConsistent, invocationCandidate } from './candidate';
import { parseCandidateFlightModel } from './flightModel';

interface RunInputPayload {
  capturedAt: string;
  inputKey: string;
  vehicle: RocketVehicle;
  /** Original record identity and source metadata, independent of the live catalog. */
  motorRecord: MotorRecord;
  launch: LaunchOptions;
  /** Complete console options, including the production defaults at capture. */
  engineOptions: Required<SixDofOptions>;
  /** Actual command-level reporting request; absence on old captures stays absent. */
  reportMomentArmHistory?: boolean;
  finShearModulusPa?: number;
  dragCalibration?: DragCalibration;
  /** Aerodynamic model actually used; absent keeps the legacy path. */
  aeroModel?: AeroModelSelection;
  /** Actual executed sampler; requested settings remain in context.workspace. */
  ensemble?: EnsembleSettings;
  weatherModel: 'surface-power-law-only';
  /** Only active manual/forecast profiles; historical case pins stay at project level. */
  context: { workspace: Workspace; mission: Mission; weather: ProjectSnapshot[] };
}

/** Historical captures stay version1; version2 explicitly pins the legacy model. */
export type LegacyRunInputs = RunInputPayload & (
  | { version: 1; flightModel?: never }
  | { version: 2; flightModel: LegacyFlightModelSelection }
);

/** Candidate archive v3 owns the exact dispatched request and no legacy options. */
export interface CandidateRunInputs {
  version: 3;
  flightModel: CandidateFlightModelSelection;
  capturedAt: string;
  /** Candidate freshness key (FNV-1a); not the engine content digest. */
  inputKey: string;
  vehicle: RocketVehicle;
  motorRecord: MotorRecord;
  launch: LaunchOptions;
  /** Exactly what was dispatched: untagged request or the explicit profile envelope. */
  candidateRequest: CandidateInvocation;
  derivation: CandidateMotorDerivation;
  weatherModel: 'surface-power-law-only';
  context: { workspace: Workspace; mission: Mission; weather: ProjectSnapshot[] };
}

export type RunInputs = LegacyRunInputs | CandidateRunInputs;

export function captureRunInputs(
  project: ProjectEnvelope,
  motorRecord: MotorRecord,
  inputKey: string,
  /**
   * The calibration actually resolved for this dispatch: active for the
   * current model and fit inputs, or undefined when the retained artifact is
   * history. Never re-resolved here, so the archive cannot disagree with the
   * scale the run uses.
   */
  calibration: DragCalibration | undefined,
  finShearModulusPa?: number,
  ensemble?: EnsembleSettings,
  /** The same adapter translation passed to the bridge at this dispatch. */
  dispatchedOptions?: SixDofOptions,
  reportMomentArmHistory?: boolean,
): LegacyRunInputs {
  // Refuse unsupported selections before archiving or dispatching a scale.
  const flightModel = resolveFlightModel(project.flightModel);
  if (isCandidateFlightModel(flightModel)) {
    throw new Error('legacy run inputs cannot capture an explicit candidate model selection');
  }
  if (reportMomentArmHistory !== undefined && (typeof reportMomentArmHistory !== 'boolean' || ensemble !== undefined)) {
    throw new Error('reportMomentArmHistory is a boolean reporting request for flight only');
  }
  const dispatchScale = calibration?.scale ?? 1;
  if (dispatchedOptions?.dragCdScale !== undefined && dispatchedOptions.dragCdScale !== dispatchScale) {
    throw new Error(`captureRunInputs: dispatched drag scale ${String(dispatchedOptions.dragCdScale)} does not match the resolved active calibration ${String(dispatchScale)}`);
  }
  const launch = project.workspace.launch;
  const archive: RunInputs = structuredClone({
    version: 2 as const,
    flightModel,
    capturedAt: new Date().toISOString(),
    inputKey,
    vehicle: project.vehicle,
    motorRecord,
    launch,
    engineOptions: {
      railLength: launch.railLengthM, railElevationDeg: launch.railElevationDeg,
      railAzimuthDeg: launch.railAzimuthDeg, windSpeedSurface: launch.windSpeedMps,
      windAzimuthDeg: launch.windAzimuthDeg, finCantAngleDeg: launch.finCantDeg,
      mainDeployAltitudeAGL: launch.mainDeployAltitudeM,
      // Omitted console options use core six_dof::simulate_flight defaults.
      // Archive v1 pins those values instead of consulting a later project.
      timeStep: 0.01, dragCdScale: calibration?.scale ?? 1,
      ...dispatchedOptions,
      // The bridge derives altitude from the vehicle, never workspace.site.
      launchAltitudeASL: project.vehicle.launchSite?.altitudeM ?? 0,
    },
    ...(finShearModulusPa === undefined ? {} : { finShearModulusPa }),
    ...(calibration === undefined ? {} : { dragCalibration: calibration }),
    ...(project.aeroModel === undefined ? {} : { aeroModel: project.aeroModel }),
    ...(ensemble === undefined ? {} : { ensemble }),
    ...(reportMomentArmHistory === undefined ? {} : { reportMomentArmHistory }),
    weatherModel: 'surface-power-law-only' as const,
    context: { workspace: project.workspace, mission: project.mission, weather: activeWeather(project.snapshots) },
  });
  return freeze(archive);
}

/** Capture the exact candidate dispatch inputs; no legacy engine options are invented. */
export function captureCandidateRunInputs(
  project: ProjectEnvelope,
  motorRecord: MotorRecord,
  selection: CandidateFlightModelSelection,
  inputKey: string,
  request: CandidateInvocation,
  derivation: CandidateMotorDerivation,
  launch: LaunchOptions = project.workspace.launch,
): CandidateRunInputs {
  if (inputKey.length === 0) throw new Error('candidate inputKey is required');
  const parsed = parseCandidateFlightModel(selection);
  assertCandidateInvocationConsistent(request, project.vehicle, motorRecord.motor, parsed, launch, derivation);
  if (invocationCandidate(request).query !== null) throw new Error('candidate capture only supports the same-state query');
  return freeze(structuredClone({
    version: 3 as const,
    flightModel: parsed,
    capturedAt: new Date().toISOString(),
    inputKey,
    vehicle: project.vehicle,
    motorRecord,
    launch,
    candidateRequest: request,
    derivation,
    weatherModel: 'surface-power-law-only' as const,
    context: { workspace: project.workspace, mission: project.mission, weather: activeWeather(project.snapshots) },
  }));
}

const activeWeatherIds = new Set(Object.values(WEATHER_SNAPSHOT_IDS));

function activeWeather(snapshots: ReadonlyArray<ProjectSnapshot>): ProjectSnapshot[] {
  return snapshots.filter((snapshot) => snapshot.kind === 'weather' && activeWeatherIds.has(snapshot.id));
}

/** Restore editable profiles without changing the weather retained cases refer to. */
export function restoreRunWeatherContext(
  project: ProjectEnvelope,
  weather: ReadonlyArray<ProjectSnapshot>,
): Pick<ProjectEnvelope, 'snapshots' | 'cases'> {
  const snapshots = [
    ...project.snapshots.filter((snapshot) => snapshot.kind !== 'weather' || !activeWeatherIds.has(snapshot.id)),
    ...activeWeather(weather),
  ];
  // The full payload and attribution define a historical snapshot; its working
  // profile ID does not. Hash collisions still require a content comparison.
  const content = ({ id: _id, ...snapshot }: ProjectSnapshot) => stableStringify(snapshot);
  const remapped = new Map<string, string>();
  const cases = project.cases.map((entry) => {
    const prior = project.snapshots.find((snapshot) => snapshot.id === entry.weatherSnapshotId && snapshot.kind === 'weather');
    if (!prior) return entry;
    let id = remapped.get(prior.id);
    if (!id) {
      const payload = content(prior);
      // Reuse an existing historical copy even if it has a different alias.
      id = snapshots.find((snapshot) => snapshot.kind === 'weather' && !activeWeatherIds.has(snapshot.id) && content(snapshot) === payload)?.id;
      if (!id) {
        const stem = `weather-archive-${hashHex(payload)}`;
        id = stem;
        let suffix = 2;
        while (snapshots.some((snapshot) => snapshot.id === id)) id = `${stem}-${suffix++}`;
        snapshots.push({ ...structuredClone(prior), id });
      }
      remapped.set(prior.id, id);
    }
    return id === entry.weatherSnapshotId ? entry : { ...entry, weatherSnapshotId: id };
  });
  return { snapshots, cases };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
