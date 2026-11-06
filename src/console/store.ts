/**
 * Console shell store: a thin view over the unified application state.
 *
 * There is no second store here. Engineering content (vehicle, motor binding,
 * launch options, mission, fin shear override) lives in `useProjectStore`,
 * which owns the undo history, the staged drafts and the file status. UI-only
 * state (stage, selection, hover, units, confidence style, panel toggles,
 * onboarding step, selected gate) lives in `useSessionStore`. Run records
 * (flight, Monte Carlo) live in `useAnalysisStore`.
 *
 * `useWS()` is the single hook the shell reads: it mirrors the prototype's
 * `useWS()` so the stage components keep reading the same way.
 */
import { create } from 'zustand';
import { engineAvailable } from '../engine';
import { withWeatherProfile, type WeatherProfileKind } from '../application/weatherSnapshots';
import type { WindLayer } from '../sim/weather';
import { useCallback, useMemo } from 'react';
import type { RocketComponent } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { CERTIFIED_MOTORS, normalizeMotorId } from '../propulsion/motorDatabase';
import type { MotorRecord, ProjectEnvelope } from '../formats/projectJson';
import { preflight, snapshotCase, stableStringify } from '../application/caseResolver';
import { resolveCalibrationApplicability } from '../application/calibrationApplicability';
import type { LaunchCase, LaunchOptions, ResolvedCase } from '../application/caseResolver';
import type { Workspace } from '../application/workspace';
import type { DragCalibration } from '../application/dragCalibration';
import { captureRunInputs, captureCandidateRunInputs, type CandidateRunInputs, type RunInputs } from '../application/runInputs';
import { isCandidateFlightModel, resolveFlightModel, type CandidateFlightModelSelection, type FlightModelSelection } from '../application/flightModel';
import { candidatePreflight, candidateInputKey, candidateInvocationCanonical, declarationVehicleSha256, buildCandidateRequest, buildProfileInvocation, deriveMotorStation, isProfileInvocation, CANDIDATE_REFUSAL, type CandidateInvocation, type CandidateIssue } from '../application/candidate';
import { candidateResultFromReport, type CandidateResultArchive } from '../application/candidateResult';
import type { EngineIdentity } from '../engine/identity';
import { aggregateMassOf, simulateCandidateRecorded } from '../tauri/bridge';
import { useAnalysisStore } from '../state/analysis';
import { PRESET_DESIGNS, useProjectStore, type Mission, type PresetDesign } from '../state/project';
import { useSessionStore, type ConsoleStage, type SessionConsolePatch, type Units } from '../state/session';
import { addComponentOp, moveComponentOp, removeComponentOp, type ComponentOpResult } from '../state/componentOps';
import type { ComponentType } from '../core/types';
import { designOf, useDesign, useMotors, type Design } from './design';
import { partialDispersion, runFlight, runMonteCarlo, sixDofOptions } from './data/adapter';
import type { Dispersion, FlightRun, Job } from './data/contract';

export type { Design } from './design';
export type StageId = ConsoleStage;
export type { Units } from '../state/session';

export const STAGES: { id: StageId; label: string; key: string }[] = [
  { id: 'mission', label: 'Mission', key: '1' },
  { id: 'airframe', label: 'Airframe', key: '2' },
  { id: 'motor', label: 'Motor', key: '3' },
  { id: 'aero', label: 'Aero', key: '4' },
  { id: 'flight', label: 'Flight', key: '5' },
  { id: 'recovery', label: 'Recovery', key: '6' },
  { id: 'verify', label: 'Verify', key: '7' },
  { id: 'build', label: 'Build', key: '8' },
];

/** Starting templates offered in the rail, the palette and the Mission stage. */
export const PRESETS: ({ id: string; label: string } & Pick<PresetDesign, 'motorId' | 'mission'>)[] = Object.entries(PRESET_DESIGNS).map(
  ([id, preset]) => ({ id, label: preset.label, motorId: preset.motorId, mission: preset.mission }),
);

/** A completed run plus the design it ran against (the "committed" snapshot). */
export interface CommittedRun {
  design: Design;
  /** Present only for a legacy result. */
  run?: FlightRun;
  /** Present only for an explicit candidate result. */
  candidate?: CandidateResultArchive;
  /** Actual executable identity of the result, when the payload recorded it. */
  engineIdentity?: EngineIdentity;
}

/** Payload of the committed flight record in `useAnalysisStore`. */
export interface LegacyFlightPayload {
  model?: 'legacy';
  design: Design;
  run: FlightRun;
  previous: FlightRun | null;
}

export interface CandidateFlightPayload {
  model: 'candidate';
  design: Design;
  result: CandidateResultArchive;
  request: CandidateInvocation;
  engineIdentity: EngineIdentity;
  previous: null;
}

export type FlightPayload = LegacyFlightPayload | CandidateFlightPayload;

/* ───────────── run identity ───────────── */

/** Launch-case input for the current project: the canonical resolver shape. */
function launchCaseInput(project: ProjectEnvelope, design: Design): LaunchCase {
  const l = project.workspace.launch;
  const options: LaunchOptions = {
    railLengthM: l.railLengthM,
    railElevationDeg: l.railElevationDeg,
    railAzimuthDeg: l.railAzimuthDeg,
    windSpeedMps: l.windSpeedMps,
    windAzimuthDeg: l.windAzimuthDeg,
    finCantDeg: l.finCantDeg,
    mainDeployAltitudeM: l.mainDeployAltitudeM,
  };
  return {
    vehicle: design.vehicle,
    motorId: design.motorId,
    options,
    // The active (binding-compatible) calibration only: a retained incompatible
    // artifact must never join run identity or input keys.
    ...(design.dragCalibration === undefined ? {} : { dragCalibration: design.dragCalibration }),
  };
}

function customMotorsOf(records: Record<string, MotorRecord>): Record<string, MotorSpec> {
  const out: Record<string, MotorSpec> = {};
  for (const [id, rec] of Object.entries(records)) out[id] = rec.motor;
  return out;
}

/** The effective motor for an id: a project record first, then the certified library. */
export function motorOfId(id: string): MotorSpec | null {
  const key = normalizeMotorId(id);
  const store = useProjectStore.getState();
  const record = store.motorRecords().find((r) => r.id === key) ?? store.motors[key];
  if (record !== undefined) return record.motor;
  return CERTIFIED_MOTORS[key] ?? null;
}

export interface RunResolution {
  resolved: ResolvedCase;
  inputKey: string;
}

/**
 * Resolve the current inputs into a runnable case plus its content identity.
 * `null` when the case fails preflight (a nonfinite input cannot be keyed).
 */
export function resolveRun(
  project: ProjectEnvelope,
  motors: Record<string, MotorRecord>,
  design: Design,
  shearPa?: number,
): RunResolution | null {
  if (isCandidateFlightModel(resolveFlightModel(project.flightModel))) return null;
  const resolved = preflight(launchCaseInput(project, design), customMotorsOf(motors));
  if (!resolved.runnable) return null;
  let runKey: string;
  try {
    runKey = snapshotCase(resolved).runKey;
  } catch {
    return null;
  }
  // The fin shear-modulus override changes the flutter result without changing
  // the geometry/motor/launch case, so it joins the key explicitly.
  return { resolved, inputKey: shearPa === undefined ? runKey : `${runKey}|shear:${shearPa}` };
}

export interface CandidateReadiness {
  selection: CandidateFlightModelSelection;
  design: Design;
  motor: MotorSpec | null;
  motorRecord: MotorRecord | null;
  launch: LaunchOptions;
  issues: CandidateIssue[];
  inputKey: string | null;
}

/** Collision-safe freshness: compare the exact retained candidate invocation, not FNV alone. */
export function candidateInvocationMatches(record: { runInputs?: RunInputs } | null): boolean {
  const inputs = record?.runInputs;
  if (inputs === undefined || inputs.version !== 3) return false;
  const store = useProjectStore.getState();
  const selection = resolveFlightModel(store.project.flightModel);
  if (!isCandidateFlightModel(selection)) return false;
  const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
  const motor = motorOfId(design.motorId);
  if (motor === null) return false;
  const launch = launchCaseInput(store.project, design).options;
  // The archived side uses the profile recorded with the run, not the session's
  // current one: otherwise selecting a different atmosphere would look current.
  const profile = useSessionStore.getState().environmentProfile;
  const archivedProfile = isProfileInvocation(inputs.candidateRequest)
    ? inputs.candidateRequest.environmentSelection : null;
  return candidateInvocationCanonical(design.vehicle, motor, selection, launch, profile)
    === candidateInvocationCanonical(inputs.vehicle, inputs.motorRecord.motor, inputs.flightModel, inputs.launch, archivedProfile);
}

/** Sync candidate selection readiness; the declaration digest is verified at dispatch. */
export function currentCandidateReadiness(): CandidateReadiness | null {
  const store = useProjectStore.getState();
  const selection = resolveFlightModel(store.project.flightModel);
  if (!isCandidateFlightModel(selection)) return null;
  const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
  const motor = motorOfId(design.motorId);
  const normalized = normalizeMotorId(design.motorId);
  const motorRecord = store.motorRecords().find((r) => r.id === normalized)
    ?? (motor === null ? null : { id: normalized, motor, provenance: { source: 'certified' as const } });
  const launchCase = launchCaseInput(store.project, design);
  const profile = useSessionStore.getState().environmentProfile;
  const legacy = preflight(launchCase, customMotorsOf(store.motors));
  const issues: CandidateIssue[] = legacy.issues.map((issue) => ({ code: 'input', message: issue.message }));
  for (const issue of candidatePreflight(design.vehicle, selection, motor, launchCase.options, undefined, profile)) issues.push(issue);
  return {
    selection,
    design,
    motor,
    motorRecord,
    launch: launchCase.options,
    issues,
    inputKey: motor === null ? null : candidateInputKey(design.vehicle, motor, selection, launchCase.options, profile),
  };
}

/** Full readiness diagnostics for the committed case, including repair targets. */
export function currentPreflight(): ResolvedCase {
  const store = useProjectStore.getState();
  const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
  return preflight(launchCaseInput(store.project, design), customMotorsOf(store.motors));
}

export function airframeDraftPending(): boolean {
  const draft = useProjectStore.getState().drafts.airframe;
  return Object.keys(draft.components).length > 0 || draft.added.length > 0 || draft.removed.length > 0;
}

/** Read the current run resolution outside React, or null when not runnable. */
export function currentResolution(): RunResolution | null {
  const store = useProjectStore.getState();
  return resolveRun(
    store.project,
    store.motors,
    designOf(store.project, store.mission, store.shearPa, undefined, store.motors),
    store.shearPa,
  );
}

/**
 * Identity of the current inputs as if NO drag calibration were applied: what
 * a calibration fit's model-side flight depends on. Null when the case cannot
 * run. The fin shear override is deliberately excluded — it changes flutter,
 * not the fitted coast dynamics. A fit stays valid while this key is
 * unchanged, including after the calibration it produced is applied.
 */
export function uncalibratedRunKey(): string | null {
  const store = useProjectStore.getState();
  return designOf(store.project, store.mission, store.shearPa, undefined, store.motors).calibrationFitInputKey;
}

/** Content key of the current runnable inputs, or null when the case cannot be keyed. */
export function currentRunKey(): string | null {
  const project = useProjectStore.getState().project;
  if (isCandidateFlightModel(resolveFlightModel(project.flightModel))) {
    return currentCandidateReadiness()?.inputKey ?? null;
  }
  return currentResolution()?.inputKey ?? null;
}

/* ───────────── committed run ───────────── */

function payloadOf(record: { payload: unknown } | null): FlightPayload | null {
  if (record === null) return null;
  const payload = record.payload;
  if (typeof payload !== 'object' || payload === null) return null;
  const value = payload as {
    model?: 'legacy' | 'candidate'; design?: Design; run?: FlightRun;
    result?: CandidateResultArchive; request?: CandidateInvocation; engineIdentity?: EngineIdentity;
    previous?: FlightRun | null;
  };
  if (value.design === undefined) return null;
  if (value.model === 'candidate' && value.result !== undefined && value.request !== undefined && value.engineIdentity !== undefined) {
    return { model: 'candidate', design: value.design, result: value.result, request: value.request,
      engineIdentity: value.engineIdentity, previous: null };
  }
  if (value.run !== undefined) {
    return { model: 'legacy', design: value.design, run: value.run, previous: value.previous ?? null };
  }
  return null;
}

/** The committed flight record: the last completed run, kept across re-runs. */
export function useCommittedRun(): CommittedRun | null {
  const record = useAnalysisStore((s) => s.completed.flight);
  return useMemo(() => {
    const payload = payloadOf(record);
    if (payload === null) return null;
    return payload.model === 'candidate'
      ? { design: payload.design, candidate: payload.result, engineIdentity: payload.engineIdentity }
      : { design: payload.design, run: payload.run, engineIdentity: payload.run.engineIdentity };
  }, [record]);
}

export function committedRun(): CommittedRun | null {
  const payload = payloadOf(useAnalysisStore.getState().completed.flight);
  if (payload === null) return null;
  return payload.model === 'candidate'
    ? { design: payload.design, candidate: payload.result, engineIdentity: payload.engineIdentity }
    : { design: payload.design, run: payload.run, engineIdentity: payload.run.engineIdentity };
}

/** Provenance source of a motor in the catalog ('certified', 'import', 'derived'), or undefined. */
export function motorProvenance(id: string): string | undefined {
  const key = normalizeMotorId(id);
  const store = useProjectStore.getState();
  const record = store.motorRecords().find((r) => r.id === key) ?? store.motors[key];
  if (record !== undefined) return record.provenance.source;
  return CERTIFIED_MOTORS[key] === undefined ? undefined : 'certified';
}

export function previousRun(): FlightRun | null {
  return payloadOf(useAnalysisStore.getState().completed.flight)?.previous ?? null;
}

export function usePreviousRun(): FlightRun | null {
  const record = useAnalysisStore((s) => s.completed.flight);
  return useMemo(() => payloadOf(record)?.previous ?? null, [record]);
}

/* ───────────── actions ───────────── */

/** Apply a project patch as one undoable edit; repeated same-field edits merge. */
export function editProject(
  label: string,
  key: string,
  patch: (project: ProjectEnvelope) => ProjectEnvelope,
  extras: { mission?: Mission; shearPa?: number } = {},
): void {
  const store = useProjectStore.getState();
  store.editProject({ label, key, project: patch(store.project), ...extras });
}

/**
 * Structural edits never coalesce: a key that is unique per call keeps the
 * merge window from folding two add/remove/move steps into one.
 */
let structuralSeq = 0;
const structuralKey = (tag: string): string => `${tag}#${(structuralSeq += 1)}`;

export const consoleActions = {
  /** Append a component of `type`; one undo step; the new part is selected. */
  addComponent: (type: ComponentType, referenceDiameterM = 0.05): ComponentOpResult => {
    const store = useProjectStore.getState();
    const op = addComponentOp(store.project.vehicle.components, type, referenceDiameterM);
    if (!op.ok) return op;
    editProject(`Add ${type}`, structuralKey('add'), (project) => ({
      ...project,
      vehicle: { ...project.vehicle, components: op.components },
    }));
    useSessionStore.getState().setSelectedId(op.selectId);
    return op;
  },

  /** Remove a part; one undo step; the last remaining part is refused. */
  removeComponent: (id: string): ComponentOpResult => {
    const store = useProjectStore.getState();
    const op = removeComponentOp(store.project.vehicle.components, id, useSessionStore.getState().selectedId);
    if (!op.ok) return op;
    editProject(`Remove part`, structuralKey('remove'), (project) => ({
      ...project,
      vehicle: { ...project.vehicle, components: op.components },
    }));
    useSessionStore.getState().setSelectedId(op.selectId);
    return op;
  },

  /** Move a part one step toward the nose (-1) or the tail (+1). */
  moveComponent: (id: string, delta: -1 | 1): ComponentOpResult => {
    const store = useProjectStore.getState();
    const op = moveComponentOp(store.project.vehicle.components, id, delta);
    if (!op.ok) return op;
    editProject(`${delta < 0 ? 'Move part forward' : 'Move part aft'}`, structuralKey('move'), (project) => ({
      ...project,
      vehicle: { ...project.vehicle, components: op.components },
    }));
    return op;
  },

  /**
   * Remove an optional field from a component (a cleared input). One undo
   * step; the key is deleted, not set to undefined.
   */
  clearComponentField: (id: string, field: string, label: string): void =>
    editProject(label, structuralKey(`clear-${id}-${field}`), (project) => ({
      ...project,
      vehicle: {
        ...project.vehicle,
        components: project.vehicle.components.map((c) => {
          if (c.id !== id) return c;
          const next: Record<string, unknown> = { ...c };
          delete next[field];
          return next as unknown as RocketComponent;
        }),
      },
    })),

  setComponent: (id: string, patch: Partial<RocketComponent>, label: string): void =>
    editProject(label, `${id}:${Object.keys(patch).sort().join(',')}`, (project) => ({
      ...project,
      vehicle: {
        ...project.vehicle,
        components: project.vehicle.components.map((c) => (c.id === id ? ({ ...c, ...patch } as RocketComponent) : c)),
      },
    })),

  setOptions: (patch: Partial<Design['options']>, label: string): void =>
    editProject(label, `opt:${Object.keys(patch).sort().join(',')}`, (project) => {
      const l = project.workspace.launch;
      const altitudeM = patch.launchAltitudeASL ?? project.vehicle.launchSite?.altitudeM ?? project.workspace.site.altitudeASLM;
      return {
        ...project,
        vehicle: patch.launchAltitudeASL === undefined
          ? project.vehicle
          : { ...project.vehicle, launchSite: { altitudeM } },
        workspace: {
          ...project.workspace,
          launch: {
            railLengthM: patch.railLength ?? l.railLengthM,
            railElevationDeg: patch.railElevationDeg ?? l.railElevationDeg,
            railAzimuthDeg: patch.railAzimuthDeg ?? l.railAzimuthDeg,
            windSpeedMps: patch.windSpeedSurface ?? l.windSpeedMps,
            windAzimuthDeg: patch.windAzimuthDeg ?? l.windAzimuthDeg,
            finCantDeg: patch.finCantAngleDeg ?? l.finCantDeg,
            mainDeployAltitudeM: patch.mainDeployAltitudeAGL ?? l.mainDeployAltitudeM,
          },
          site: { ...project.workspace.site, altitudeASLM: altitudeM },
        },
      };
    }),

  /** Site elevation in metres ASL; the vehicle launch site is the run layer's source. */
  setLaunchAltitude: (altitudeM: number, label: string): void => {
    editProject(label, 'opt:launchAltitudeASL', (project) => ({
      ...project,
      vehicle: { ...project.vehicle, launchSite: { altitudeM } },
      workspace: { ...project.workspace, site: { ...project.workspace.site, altitudeASLM: altitudeM } },
    }));
  },

  setMotor: (id: string): void => {
    const motor = motorOfId(id);
    editProject(motor?.designation ?? id, 'motor', (project) => ({
      ...project,
      workspace: { ...project.workspace, motorId: id },
    }));
  },

  /**
   * Store (or, with `undefined`, remove) the project's drag calibration as one
   * undoable change. Every result computed without it goes stale: the
   * calibration is part of the run identity.
   */
  setDragCalibration: (calibration: DragCalibration | undefined, label: string): void => {
    if (calibration !== undefined) {
      const state = useProjectStore.getState();
      const design = designOf(state.project, state.mission, state.shearPa, undefined, state.motors);
      const applicability = resolveCalibrationApplicability({
        calibration,
        flightModel: state.project.flightModel,
        currentFitInputKey: design.calibrationFitInputKey,
      });
      if (applicability.status === 'inactive') {
        throw new Error(applicability.reason === 'flight-model'
          ? 'drag calibration is bound to a different flight model; it is retained as history but cannot be applied to this model'
          : 'drag calibration was fitted to different design, motor, site or launch inputs; it is retained as history but cannot be applied to the current inputs');
      }
    }
    editProject(label, structuralKey('drag-calibration'), (project) => {
      const { dragCalibration: _previous, ...rest } = project;
      return calibration === undefined ? rest : { ...rest, dragCalibration: calibration };
    });
  },

  setShear: (pa: number | undefined): void => {
    const store = useProjectStore.getState();
    store.editProject({
      label: pa === undefined ? 'Clear fin shear modulus' : 'Fin shear modulus',
      key: 'shear',
      project: store.project,
      shearPa: pa,
    });
  },

  /** One undoable model-selection change; archived cases are not rewritten. */
  setFlightModel: (selection: FlightModelSelection, label: string): void => {
    const store = useProjectStore.getState();
    store.editProject({ label, key: 'flight-model', project: { ...store.project, flightModel: selection } });
  },

  setMission: (patch: Partial<Mission>, label: string): void => {
    const store = useProjectStore.getState();
    store.editProject({
      label,
      key: `mission:${Object.keys(patch).sort().join(',')}`,
      project: store.project,
      mission: { ...store.mission, ...patch },
    });
  },

  setVehicle: (patch: Partial<ProjectEnvelope['vehicle']>, label: string): void =>
    editProject(label, `vehicle:${Object.keys(patch).sort().join(',')}`, (project) => {
      const vehicle = { ...project.vehicle, ...patch };
      for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
        if (patch[key] === undefined) delete vehicle[key];
      }
      return { ...project, vehicle };
    }),

  setWorkspace: (patch: Partial<Workspace>, label: string): void =>
    editProject(label, `ws:${Object.keys(patch).sort().join(',')}`, (project) => ({
      ...project,
      workspace: { ...project.workspace, ...patch },
    })),

  /**
   * Store one wind profile (manual table or fetched sounding) as the project's
   * weather snapshot of that kind; an empty profile removes it. Profiles are
   * inspection data and are not part of the run key.
   */
  setWeatherProfile: (kind: WeatherProfileKind, layers: ReadonlyArray<WindLayer>, source: string, label: string): void =>
    editProject(label, `weather:${kind}`, (project) => withWeatherProfile(project, kind, layers, source)),

  /**
   * Register a motor record and bind it, as one undoable project change.
   * Returns the key the record landed on (the shared import policy suffixes a
   * colliding id rather than overwriting the motor already there).
   */
  addMotor: (motor: MotorSpec, provenance: MotorRecord['provenance']): string =>
    useProjectStore
      .getState()
      .addMotorRecord({ id: normalizeMotorId(motor.id), motor, provenance }, `Import motor ${motor.designation}`),

  loadPreset: (id: string): void => useProjectStore.getState().loadPreset(id),
  undo: (): void => useProjectStore.getState().undo(),
  redo: (): void => useProjectStore.getState().redo(),
};

/* ───────────── run jobs ───────────── */

interface ConsoleJobs {
  running: boolean;
  runError: string | null;
  mc: Job<Dispersion> | null;
}

interface ConsoleJobState {
  jobs: ConsoleJobs;
  mcAbort: AbortController | null;
  candidateAbort: AbortController | null;
  runToken: number | null;
  run: () => Promise<void>;
  runMonteCarlo: (n: number) => void;
  cancelRun: () => void;
  cancelMonteCarlo: () => void;
  dismissMonteCarlo: () => void;
}

let runAdmission = 0;

/**
 * A flight must never carry a built-up aero identity while consuming the
 * legacy coefficient path (1b wires the panels only). Refuse before any case,
 * archive, analysis record or engine invocation exists.
 */
function aeroModelFlightRefusal(selection: Design['aeroModel']): string | null {
  if (selection === undefined) return null;
  return `${selection.modelId} ${selection.modelVersion} drives stability and aero panels in this build; `
    + 'flight coefficients still come from the legacy path. Turn the beta aero model off to fly.';
}

export const useConsoleJobs = create<ConsoleJobState>((set, get) => ({
  jobs: { running: false, runError: null, mc: null },
  mcAbort: null,
  candidateAbort: null,
  runToken: null,

  run: async () => {
    if (get().jobs.running) return;
    if (airframeDraftPending()) {
      set({ jobs: { ...get().jobs, runError: 'Apply or discard staged airframe edits before running.' } });
      return;
    }
    const store = useProjectStore.getState();
    const epoch = store.projectEpoch;
    const admission = ++runAdmission;
    const abort = new AbortController();
    const selection = resolveFlightModel(store.project.flightModel);
    const superseded = (): boolean => get().runToken !== admission || useProjectStore.getState().projectEpoch !== epoch;
    const finish = (runError: string | null = null): void => {
      if (get().runToken !== admission) return;
      set({ jobs: { ...get().jobs, running: false, runError }, candidateAbort: null, runToken: null });
    };
    set({ jobs: { ...get().jobs, running: true, runError: null }, candidateAbort: isCandidateFlightModel(selection) ? abort : null, runToken: admission });
    if (isCandidateFlightModel(selection)) {
      const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
      const fail = (message: string, key = 'candidate-invalid'): void => {
        if (superseded()) return;
        const analysis = useAnalysisStore.getState();
        const token = analysis.start('flight', key, { model: 'candidate', design });
        analysis.reject('flight', token, message);
        finish(message);
      };
      if (!engineAvailable()) return fail('The candidate run needs WebAssembly and Web Workers; this browser cannot run the engine.');
      const motor = motorOfId(design.motorId);
      const normalized = normalizeMotorId(design.motorId);
      const motorRecord = store.motorRecords().find((r) => r.id === normalized)
        ?? (motor === null ? null : { id: normalized, motor, provenance: { source: 'certified' as const } });
      if (motor === null || motorRecord === null) return fail(`motor '${design.motorId}' is not in the project catalog`);
      const launchCase = launchCaseInput(store.project, design);
      const profile = useSessionStore.getState().environmentProfile;
      const issues = [
        ...preflight(launchCase, customMotorsOf(store.motors)).issues.map((issue) => issue.message),
        ...candidatePreflight(design.vehicle, selection, motor, launchCase.options, undefined, profile)
          .map((issue) => issue.message),
      ];
      if (issues.length > 0) return fail(issues.join('; '));
      let declarationSha: string;
      try {
        declarationSha = await declarationVehicleSha256(design.vehicle);
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
      if (superseded() || abort.signal.aborted) return;
      const current = resolveFlightModel(useProjectStore.getState().project.flightModel);
      if (!isCandidateFlightModel(current) || stableStringify(current) !== stableStringify(selection)) {
        return fail('The candidate selection changed while preparing the run; nothing was dispatched.');
      }
      if (declarationSha !== selection.declarationVehicleSha256) return fail(CANDIDATE_REFUSAL.modelChanged);
      const inputKey = candidateInputKey(design.vehicle, motor, selection, launchCase.options, profile);
      let request: CandidateInvocation;
      let inputs: CandidateRunInputs;
      let derivation: ReturnType<typeof deriveMotorStation>;
      try {
        const rollup = await aggregateMassOf(design.vehicle);
        derivation = deriveMotorStation(design.vehicle, rollup);
        // A profile supplies the atmosphere: its declared pad altitude replaces the
        // vehicle site altitude and the surface wind must be zero (preflight above).
        const built = profile === null
          ? buildCandidateRequest(design.vehicle, motor, selection, launchCase.options, derivation)
          : buildCandidateRequest(design.vehicle, motor, selection, launchCase.options, derivation, {
              launchAltitudeASL: profile.launchAltitudeGeometricMslM,
              windSpeedSurfaceMps: 0,
              windAzimuthDeg: 0,
              sourceId: (profile.profile.source as { identity?: string }).identity,
            });
        request = profile === null ? built : buildProfileInvocation(built, profile);
        inputs = captureCandidateRunInputs(store.project, motorRecord, selection, inputKey, request, derivation, launchCase.options);
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err), inputKey);
      }
      if (superseded() || abort.signal.aborted) return;
      const analysis = useAnalysisStore.getState();
      const token = analysis.start('flight', inputKey, { model: 'candidate', design }, inputs);
      try {
        const recorded = await simulateCandidateRecorded(request, abort.signal);
        if (superseded()) {
          if (abort.signal.aborted) useAnalysisStore.getState().reject('flight', token, 'Cancelled — no result recorded.');
          return;
        }
        if (abort.signal.aborted) throw new Error('Cancelled — no result recorded.');
        const result = candidateResultFromReport(recorded.value, { request, selection, derivation });
        if (superseded()) return;
        useAnalysisStore.getState().resolve('flight', token, {
          model: 'candidate', design, result, request, engineIdentity: recorded.engineIdentity, previous: null,
        } satisfies FlightPayload);
        finish();
      } catch (err) {
        if (abort.signal.aborted) {
          useAnalysisStore.getState().reject('flight', token, 'Cancelled — no result recorded.');
          if (!superseded()) finish('Cancelled — no result recorded.');
          return;
        }
        if (superseded()) return;
        const message = err instanceof Error ? err.message : String(err);
        useAnalysisStore.getState().reject('flight', token, message);
        finish(message);
      }
      return;
    }
    const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
    const refusal = aeroModelFlightRefusal(design.aeroModel);
    if (refusal !== null) {
      set({ jobs: { ...get().jobs, running: false, runError: refusal } });
      return;
    }
    const motor = motorOfId(design.motorId);
    const resolution = resolveRun(store.project, store.motors, design, design.shearPa);
    if (resolution === null || motor === null) {
      const issues = resolution === null ? preflight(launchCaseInput(store.project, design), customMotorsOf(store.motors)).issues : [];
      const message = issues.length > 0 ? issues.map((issue) => issue.message).join('; ') : `motor '${design.motorId}' is not in the project catalog`;
      const token = useAnalysisStore.getState().start('flight', 'unkeyable-invalid-inputs', { design });
      useAnalysisStore.getState().reject('flight', token, message);
      set({
        jobs: {
          ...get().jobs,
          running: false,
          runError: message,
        },
      });
      return;
    }
    const analysis = useAnalysisStore.getState();
    const record = store.motorRecords().find((r) => r.id === normalizeMotorId(design.motorId))
      ?? { id: normalizeMotorId(design.motorId), motor, provenance: { source: 'certified' as const } };
    const runInputs = captureRunInputs({ ...store.project, mission: store.mission }, record, resolution.inputKey, design.dragCalibration, design.shearPa, undefined, sixDofOptions(design.options), true);
    if (superseded()) return;
    const token = analysis.start('flight', resolution.inputKey, { design }, runInputs);
    try {
      const run = await runFlight(
        runInputs.vehicle,
        runInputs.motorRecord.motor,
        { ...design.options },
        runInputs.motorRecord.provenance.source,
        resolution.inputKey,
        store.project.revision,
        runInputs.finShearModulusPa,
        runInputs.dragCalibration,
        runInputs.reportMomentArmHistory,
        design.aeroModel,
      );
      if (superseded()) return;
      useAnalysisStore.getState().resolve('flight', token, { design, run, previous: previousRun() } satisfies FlightPayload);
      finish();
    } catch (err) {
      if (superseded()) return;
      const message = err instanceof Error ? err.message : String(err);
      useAnalysisStore.getState().reject('flight', token, message);
      finish(message);
    }
  },

  cancelRun: () => {
    const abort = get().candidateAbort;
    if (abort === null) return;
    set({ candidateAbort: null, runToken: null, jobs: { ...get().jobs, running: false, runError: 'Cancelled — no result recorded.' } });
    abort.abort();
  },

  runMonteCarlo: (n) => {
    const store = useProjectStore.getState();
    const model = resolveFlightModel(store.project.flightModel);
    if (isCandidateFlightModel(model)) {
      // A refused secondary consumer must not release an in-flight candidate
      // admission or its cancellation handle. Preserve busy/token/abort and
      // expose the unsupported-contract refusal on the existing state.
      set({ jobs: { ...get().jobs, runError: CANDIDATE_REFUSAL.ensemble } });
      return;
    }
    get().mcAbort?.abort();
    const epoch = store.projectEpoch;
    const design = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
    const mcRefusal = aeroModelFlightRefusal(design.aeroModel);
    if (mcRefusal !== null) {
      set({ jobs: { ...get().jobs, runError: mcRefusal } });
      return;
    }
    const motor = motorOfId(design.motorId);
    const abort = new AbortController();
    const total = Math.max(1, Math.min(1000, Math.floor(n)));
    const config = store.project.workspace.ensemble;
    const resolution = resolveRun(store.project, store.motors, design, design.shearPa);
    const inputKey = `${resolution?.inputKey ?? 'invalid'}|ensemble:${stableStringify({ ...config, nRuns: total })}`;
    const analysis = useAnalysisStore.getState();
    const record = motor === null ? null : store.motorRecords().find((r) => r.id === normalizeMotorId(design.motorId))
      ?? { id: normalizeMotorId(design.motorId), motor: motor!, provenance: { source: 'certified' as const } };
    const runInputs = motor && resolution && Number.isFinite(n) && !airframeDraftPending()
      ? captureRunInputs({ ...store.project, mission: store.mission }, record!, inputKey, design.dragCalibration, design.shearPa, { ...config, nRuns: total, version: 'per-run-v2' }, sixDofOptions(design.options))
      : undefined;
    const token = analysis.start('ensemble', inputKey, { design }, runInputs);
    const job: Job<Dispersion> = {
      id: `mc-${token}`,
      label: `Monte Carlo \u00b7 ${total} runs`,
      state: 'running',
      progress: 0,
      done: 0,
      total,
      startedAt: Date.now(),
    };
    if (motor === null || resolution === null || !Number.isFinite(n) || airframeDraftPending()) {
      analysis.reject('ensemble', token, 'Inputs fail preflight; repair the motor, mount or launch setup.');
      set({
        mcAbort: null,
        jobs: { ...get().jobs, mc: { ...job, state: 'failed', error: `motor '${design.motorId}' is not in the project catalog` } },
      });
      return;
    }
    set({ mcAbort: abort, jobs: { ...get().jobs, mc: job } });
    const withJob = (patch: Partial<Job<Dispersion>>): void =>
      set((s) => (useProjectStore.getState().projectEpoch === epoch && s.jobs.mc?.id === job.id ? { jobs: { ...s.jobs, mc: { ...s.jobs.mc, ...patch } } } : {}));
    runMonteCarlo(
      { vehicle: runInputs!.vehicle, motor: runInputs!.motorRecord.motor, options: { ...design.options }, nRuns: total, seed: runInputs!.ensemble!.seed, sigmas: { windAzimuthDegSigma: config.windAzimuthDegSigma, railAngleDegSigma: config.railAngleDegSigma, impulsePctSigma: config.impulsePctSigma }, dragCalibration: runInputs!.dragCalibration },
      abort.signal,
      {
        onProgress: (done, landings, failed, runs) => withJob({ done, progress: done / total, partial: partialDispersion(landings, failed, design.dragCalibration, runs, total) }),
        onCancelled: (done) => {
          withJob({ state: 'cancelled', done, partial: undefined });
          set((state) => state.mcAbort === abort ? { mcAbort: null } : {});
        },
      },
    )
      .then((dispersion) => {
        if (useProjectStore.getState().projectEpoch !== epoch) return;
        if (abort.signal.aborted) throw new Error('Cancelled — no result recorded.');
        useAnalysisStore.getState().resolve('ensemble', token, { design, dispersion });
        withJob({ state: 'done', done: total, progress: 1, partial: dispersion });
        set((state) => state.mcAbort === abort ? { mcAbort: null } : {});
      })
      .catch((err: unknown) => {
        if (useProjectStore.getState().projectEpoch !== epoch) return;
        const message = err instanceof Error ? err.message : String(err);
        const cancelled = abort.signal.aborted;
        useAnalysisStore.getState().reject('ensemble', token, message);
        withJob(cancelled ? { state: 'cancelled', error: undefined, partial: undefined } : { state: 'failed', error: message, partial: undefined });
        set((state) => state.mcAbort === abort ? { mcAbort: null } : {});
      });
  },

  cancelMonteCarlo: () => get().mcAbort?.abort(),
  dismissMonteCarlo: () => set((s) => ({ jobs: { ...s.jobs, mc: null } })),
}));

// A replaced document releases the Console immediately. Old callbacks are
// epoch-guarded above, and an ensemble's engine work is cancelled where supported.
useProjectStore.subscribe((state, previous) => {
  if (state.projectEpoch === previous.projectEpoch) return;
  const abort = useConsoleJobs.getState().mcAbort;
  const candidate = useConsoleJobs.getState().candidateAbort;
  useConsoleJobs.setState({ jobs: { running: false, runError: null, mc: null }, mcAbort: null, candidateAbort: null, runToken: null });
  abort?.abort();
  candidate?.abort();
});

/* ───────────── the single hook the shell reads ───────────── */

/** Stage-node chrome state, selected one field at a time. */
export interface ConsoleSessionView {
  stage: StageId;
  selectedId: string | null;
  hoverId: string | null;
  units: Units;
  confidenceStyle: 'A' | 'B';
  scrubT: number | null;
  leftOpen: boolean;
  rightOpen: boolean;
  onboarding: number | null;
  selectedGate: string | null;
  /** Session-scoped E1 profile; part of the view so freshness re-renders on change. */
  environmentProfile: unknown;
  set: (patch: SessionConsolePatch) => void;
  setUnits: (units: Units) => void;
  setConfidenceStyle: (style: 'A' | 'B') => void;
}

function useConsoleSession(): ConsoleSessionView {
  const stage = useSessionStore((s) => s.stage);
  const selectedId = useSessionStore((s) => s.selectedId);
  const hoverId = useSessionStore((s) => s.hoverId);
  const units = useSessionStore((s) => s.units);
  const confidenceStyle = useSessionStore((s) => s.confidenceStyle);
  const scrubT = useSessionStore((s) => s.scrubT);
  const leftOpen = useSessionStore((s) => s.leftOpen);
  const rightOpen = useSessionStore((s) => s.rightOpen);
  const onboarding = useSessionStore((s) => s.onboarding);
  const selectedGate = useSessionStore((s) => s.selectedGate);
  const environmentProfile = useSessionStore((s) => s.environmentProfile);
  const set = useSessionStore((s) => s.setConsole);
  const setUnits = useSessionStore((s) => s.setUnits);
  const setConfidenceStyle = useSessionStore((s) => s.setConfidenceStyle);
  return useMemo(
    () => ({ stage, selectedId, hoverId, units, confidenceStyle, scrubT, leftOpen, rightOpen, onboarding, selectedGate, environmentProfile, set, setUnits, setConfidenceStyle }),
    [stage, selectedId, hoverId, units, confidenceStyle, scrubT, leftOpen, rightOpen, onboarding, selectedGate, environmentProfile, set, setUnits, setConfidenceStyle],
  );
}

export interface WSView extends ConsoleSessionView {
  design: Design;
  motors: Record<string, MotorSpec>;
  motor: () => MotorSpec | null;
  rev: number;
  past: number;
  future: number;
  committed: CommittedRun | null;
  previous: FlightRun | null;
  running: boolean;
  runError: string | null;
  mc: Job<Dispersion> | null;
  native: boolean;
  canUndo: boolean;
  canRedo: boolean;
  setComponent: typeof consoleActions.setComponent;
  clearComponentField: typeof consoleActions.clearComponentField;
  addComponent: typeof consoleActions.addComponent;
  removeComponent: typeof consoleActions.removeComponent;
  moveComponent: typeof consoleActions.moveComponent;
  setOptions: typeof consoleActions.setOptions;
  setLaunchAltitude: typeof consoleActions.setLaunchAltitude;
  setMission: typeof consoleActions.setMission;
  setMotor: typeof consoleActions.setMotor;
  setShear: typeof consoleActions.setShear;
  setFlightModel: typeof consoleActions.setFlightModel;
  setDragCalibration: typeof consoleActions.setDragCalibration;
  setVehicle: typeof consoleActions.setVehicle;
  addMotor: (motor: MotorSpec, provenance: MotorRecord['provenance']) => string;
  loadPreset: (id: string) => void;
  undo: () => void;
  redo: () => void;
  run: () => Promise<void>;
  cancelRun: () => void;
  runMonteCarlo: (n: number) => void;
  cancelMonteCarlo: () => void;
  dismissMonteCarlo: () => void;
}

/** The Tauri shell's global, as it appears on `window` at runtime. */
export interface WindowWithTauri {
  __TAURI__?: { core?: { invoke?: unknown }; invoke?: unknown };
}

/** The app's window typed for the Tauri global (the only unchecked hop). */
export const appWindow = (): WindowWithTauri => window as unknown as WindowWithTauri;

/** Engine availability (WebAssembly workers, or a test engine). */
export function engineIsAvailable(): boolean {
  return engineAvailable();
}

/**
 * One hook for the shell: engineering state, chrome state and the run actions.
 * Callable bare, as the prototype's `useWS()` was, or with a selector.
 */
export function useWS(): WSView;
export function useWS<T>(selector: (view: WSView) => T): T;
export function useWS<T>(selector?: (view: WSView) => T): WSView | T {
  const session = useConsoleSession();
  const design = useDesign();
  const motors = useMotors();
  const committed = useCommittedRun();
  const previous = usePreviousRun();
  const jobs = useConsoleJobs((s) => s.jobs);
  const run = useConsoleJobs((s) => s.run);
  const cancelRun = useConsoleJobs((s) => s.cancelRun);
  const runMonteCarloJob = useConsoleJobs((s) => s.runMonteCarlo);
  const cancelMonteCarlo = useConsoleJobs((s) => s.cancelMonteCarlo);
  const dismissMonteCarlo = useConsoleJobs((s) => s.dismissMonteCarlo);
  const rev = useProjectStore((s) => s.project.revision);
  const pastCount = useProjectStore((s) => s.past.length);
  const futureCount = useProjectStore((s) => s.future.length);
  const native = useMemo(engineIsAvailable, []);
  const motor = useCallback(() => motorOfId(design.motorId), [design.motorId]);
  const view = useMemo(
    () => ({
      ...session,
      design,
      motors,
      motor,
      rev,
      past: pastCount,
      future: futureCount,
      committed,
      previous,
      running: jobs.running,
      runError: jobs.runError,
      mc: jobs.mc,
      native,
      canUndo: pastCount > 0,
      canRedo: futureCount > 0,
      setComponent: consoleActions.setComponent,
      clearComponentField: consoleActions.clearComponentField,
      addComponent: consoleActions.addComponent,
      removeComponent: consoleActions.removeComponent,
      moveComponent: consoleActions.moveComponent,
      setOptions: consoleActions.setOptions,
      setLaunchAltitude: consoleActions.setLaunchAltitude,
      setMission: consoleActions.setMission,
      setMotor: consoleActions.setMotor,
      setShear: consoleActions.setShear,
      setFlightModel: consoleActions.setFlightModel,
      setDragCalibration: consoleActions.setDragCalibration,
      setVehicle: consoleActions.setVehicle,
      addMotor: consoleActions.addMotor,
      loadPreset: consoleActions.loadPreset,
      undo: consoleActions.undo,
      redo: consoleActions.redo,
      run,
      cancelRun,
      runMonteCarlo: runMonteCarloJob,
      cancelMonteCarlo,
      dismissMonteCarlo,
    }),
    [session, design, motors, motor, rev, pastCount, futureCount, committed, previous, jobs, native, run, cancelRun, runMonteCarloJob, cancelMonteCarlo, dismissMonteCarlo],
  );
  return selector === undefined ? view : selector(view);
}

/** One undo/redo step, for the History tab (labels only; no engine state leaves the store). */
export interface UndoStep {
  label: string;
  at: string;
}

/** Undo history read outside React, newest first, plus the redo stack. */
export function undoHistory(): { past: UndoStep[]; future: UndoStep[] } {
  const store = useProjectStore.getState();
  return {
    past: [...store.past].reverse().map((e) => ({ label: e.label, at: new Date(e.at ?? 0).toISOString() })),
    future: store.future.map((e) => ({ label: e.label, at: new Date(e.at ?? 0).toISOString() })),
  };
}

/** Session + actions read outside React (keyboard handlers), without a render subscription. */
export function consoleSessionState(): {
  stage: StageId;
  leftOpen: boolean;
  rightOpen: boolean;
  set: (patch: SessionConsolePatch) => void;
  undo: () => void;
  redo: () => void;
  run: () => Promise<void>;
} {
  const session = useSessionStore.getState();
  return {
    stage: session.stage,
    leftOpen: session.leftOpen,
    rightOpen: session.rightOpen,
    set: session.setConsole,
    undo: consoleActions.undo,
    redo: consoleActions.redo,
    run: useConsoleJobs.getState().run,
  };
}

/**
 * Content key for an arbitrary project-shaped value, for cheap change
 * detection. Values the keyer refuses (nonfinite numbers) hash by reference
 * identity, which misses the cache rather than throwing at render time.
 */
export function contentKeyOf(value: unknown): string {
  try {
    return stableStringify(value);
  } catch {
    return `unkeyable:${String(unkeyableCounter++)}`;
  }
}

let unkeyableCounter = 0;

/** The committed project envelope as it stands, for save and export. */
export function currentEnvelope(): ProjectEnvelope {
  return useProjectStore.getState().project;
}

/** Which template the current vehicle came from, or null for a custom/imported one. */
export { presetKeyOf } from '../state/project';

export { useSessionStore, useProjectStore, useAnalysisStore };
export { useDesign, useMotors, designOf } from './design';
