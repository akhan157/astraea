/** Bounded, dispatch-time inputs. Never embed a project, ledger, or run history. */
import type { RocketVehicle } from '../core/types';
import type { MotorRecord, ProjectEnvelope, ProjectSnapshot } from '../formats/projectJson';
import type { DragCalibration } from './dragCalibration';
import type { AeroModelSelection } from './aeroModel';
import { assertVehicleRunOptions, flightRunOptions, hashHex, stableStringify, withResolvedDragChoice, type LaunchOptions } from './caseResolver';
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
  /**
   * Complete console options, including the production defaults at capture.
   * The four optional physics inputs this bundle adds stay optional: an
   * archive written by a run that sent none carries none, byte for byte as
   * before.
   */
  engineOptions: ArchivedEngineOptions;
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

/**
 * Archived engine options: every option the console pins at dispatch, plus the
 * vehicle-owned physics inputs, which are optional because a run that sent none
 * must archive exactly the pre-bundle payload.
 */
export type ArchivedEngineOptions = Required<
  Omit<SixDofOptions, 'launchSiteTemperatureC' | 'nozzleExitDiameter' | 'flightDragSource'>
> &
  Pick<SixDofOptions, 'launchSiteTemperatureC' | 'nozzleExitDiameter' | 'flightDragSource'>;

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
  // K3: two vehicles, kept apart on purpose.
  //  - `declared` is the project's vehicle exactly as the user left it. THIS is what the archive stores, so
  //    "Load saved inputs" restores the user's own declaration: the restored vehicle keeps the fit key that a
  //    calibration's recorded `uncalibratedRunKey` was computed on, and the calibration stays active.
  //  - `vehicle` is the dispatch resolution: `calibration` is the ACTIVE calibration this run carries (never a
  //    retained inactive artifact, which is history), so a run whose scale rides it and which made no explicit
  //    drag choice flies the legacy tables the scale was fitted on. It drives the dispatched options only, and
  //    archive validation re-derives the same resolution from the archived declaration plus the archived
  //    calibration, so what was flown is always reproducible from the archive.
  const declared = project.vehicle;
  const vehicle = withResolvedDragChoice(declared, calibration);
  assertVehicleRunOptions('captureRunInputs', vehicle, dispatchedOptions ?? {});
  const launch = project.workspace.launch;
  // One derivation for the archive and the dispatch request: the vehicle owns
  // the launch-site inputs and the two physics opt-ins. A caller-supplied
  // value may not override them, so the archive cannot disagree with what the
  // bridge derives for this exact vehicle.
  const { launchAltitudeASL: derivedAltitude, ...derivedPhysics } = flightRunOptions(vehicle);
  const archive: RunInputs = structuredClone({
    version: 2 as const,
    flightModel,
    capturedAt: new Date().toISOString(),
    inputKey,
    vehicle: declared,
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
      // The physics opt-ins are vehicle-owned too: archive one only when the
      // vehicle derives one, so a default run's payload is unchanged.
      ...derivedPhysics,
      // The bridge derives altitude from the vehicle, never workspace.site;
      // the archive keeps pinning 0 for a site-less vehicle as it always has.
      launchAltitudeASL: derivedAltitude ?? 0,
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
