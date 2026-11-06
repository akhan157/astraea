/**
 * Project store: the single committed project plus per-studio staged drafts.
 *
 * Committed state is the only input analyses ever run against. Drafts are
 * field-level patches keyed by studio; the UI merges them for preview, and
 * Apply commits one named undo entry while Revert drops them. Nothing here
 * touches the network or the native backend.
 */

import { create } from 'zustand';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { CERTIFIED_MOTORS, normalizeMotorId } from '../propulsion/motorDatabase';
import type { RocketComponent, RocketVehicle } from '../core/types';
import {
  createProjectEnvelope,
  readProject,
  writeProject,
  type MotorRecord,
  type ProjectEnvelope,
} from '../formats/projectJson';
import { caseId, withEvidenceRefs, withRunCases } from '../application/runCases';
import { restoreRunWeatherContext } from '../application/runInputs';
import { parseLegacyFlightModel, parseCandidateFlightModel, resolveFlightModel, type FlightModelSelection } from '../application/flightModel';
import { detachCurrentAnalysis, terminalAnalysisSnapshot, useAnalysisStore, type AnalysisSnapshot } from './analysis';
import { useSessionStore } from './session';
import { isProfileInvocation } from '../application/candidate';
import { DEFAULT_WORKSPACE, type Workspace } from '../application/workspace';
import { DEFAULT_MISSION, type Mission } from '../application/mission';
import { copyMotor, importMotorKey, mergeMotorRecords } from './motors';
import { hashHex, stableStringify } from '../application/caseResolver';
import type { LedgerEntry } from '../application/evidenceLedger';
import { PRESET_ESTES_ALPHA, PRESET_NASA_STUDENT_LAUNCH, PRESET_SPACEPORT_AMERICA } from './presets';

export type StudioId = 'airframe' | 'aero' | 'propulsion' | 'trajectory' | 'recovery';

export interface DesignExtras {
  mission: Mission;
  shearPa?: number;
}

export { DEFAULT_MISSION, type Mission };

export const STUDIO_ORDER: StudioId[] = ['airframe', 'aero', 'propulsion', 'trajectory', 'recovery'];

export interface PresetMeta {
  id: string;
  name: string;
  blurb: string;
}

export const PRESETS: Record<string, PresetMeta> = {
  estesAlpha: { id: 'estes-alpha-III', name: 'Estes Alpha III', blurb: 'Model rocket baseline' },
  nasaStudent: { id: 'nasa-sl-baseline', name: 'Student Launch baseline', blurb: 'Mid power reference' },
  spaceport: { id: 'spaceport-cup-30k', name: 'Spaceport America (practice)', blurb: 'High power practice reference' },
};

/** Everything a starting template carries beyond the vehicle itself. */
export interface PresetDesign {
  label: string;
  vehicle: RocketVehicle;
  motorId: string;
  /** Launch-option overrides on top of DEFAULT_WORKSPACE. */
  launch?: Partial<Workspace['launch']>;
  /** Site elevation the template flies from, m ASL (also written to vehicle.launchSite). */
  altitudeASLM?: number;
  mission: Mission;
}

/**
 * Starting templates, matching the Console prototype's three vehicles. The
 * spaceport template flies from 1400 m ASL, so the elevation is written to
 * both the workspace and `vehicle.launchSite` (the vehicle is the home of the
 * launch site the run layer derives the atmosphere's base altitude from).
 */
export const PRESET_DESIGNS: Record<string, PresetDesign> = {
  estesAlpha: {
    label: 'Estes Alpha III',
    vehicle: PRESET_ESTES_ALPHA,
    motorId: 'estes_c6',
    launch: { railLengthM: 1, mainDeployAltitudeM: 60 },
    mission: { name: 'Park flyer', site: 'Local field', targetApogeeM: 300 },
  },
  nasaStudent: {
    label: 'NASA Student Launch',
    vehicle: PRESET_NASA_STUDENT_LAUNCH,
    motorId: 'aerotech_k550w',
    launch: { railLengthM: 3.66, mainDeployAltitudeM: 213 },
    mission: { name: 'Student Launch 2027 · practice flight', site: 'Huntsville, AL', targetApogeeM: 550 },
  },
  spaceport: {
    label: 'Spaceport America (practice)',
    vehicle: PRESET_SPACEPORT_AMERICA,
    motorId: 'cesaroni_m1820',
    launch: { railLengthM: 5.2 },
    altitudeASLM: 1400,
    mission: { name: 'Spaceport America · practice flight', site: 'Spaceport America, NM', targetApogeeM: 5100 },
  },
};

/** The preset design for a key, with its vehicle cloned; null when unknown. */
export function presetOf(key: string): PresetDesign | null {
  const preset = PRESET_DESIGNS[key];
  if (!preset) return null;
  const vehicle = structuredClone(preset.vehicle);
  if (preset.altitudeASLM !== undefined) {
    vehicle.launchSite = { altitudeM: preset.altitudeASLM };
  }
  return { ...preset, vehicle, mission: { ...preset.mission } };
}

/** Template the store opens with (the Console prototype's default). */
export const SEED_PRESET_KEY = 'nasaStudent';

/** Which preset the vehicle matches by id, or null for custom/imported. */
export function presetKeyOf(vehicle: RocketVehicle): string | null {
  if (vehicle.id === PRESET_ESTES_ALPHA.id) return 'estesAlpha';
  if (vehicle.id === PRESET_NASA_STUDENT_LAUNCH.id) return 'nasaStudent';
  if (vehicle.id === PRESET_SPACEPORT_AMERICA.id) return 'spaceport';
  return null;
}

/** One committed undo entry: full project before a commit plus its label. */
interface UndoEntry {
  label: string;
  project: ProjectEnvelope;
  /** Registry overlay is part of the design, including curve edits and imports. */
  motors: Record<string, MotorRecord>;
  /** Present only for undoable project boundaries (preset replacement). */
  analysisContext?: AnalysisSnapshot;
  /**
   * Coalescing key: consecutive edits carrying the same key within
   * `EDIT_MERGE_MS` collapse into one entry, so dragging a field is one undo.
   */
  key?: string;
  /** Epoch milliseconds of the edit that produced this entry. */
  at?: number;
  /** Console design extras captured with the project (mission, fin shear override). */
  mission?: Mission;
  shearPa?: number;
}

/** Committed project identity for run keys and freshness. */
export interface ProjectIdentity {
  envelope: ProjectEnvelope;
  revision: number;
}

export type FileStatus =
  | { kind: 'clean' }
  | { kind: 'dirty-unsaved' }
  | { kind: 'saving' }
  | { kind: 'saved'; revision: number }
  | { kind: 'error'; message: string };

export interface ToastMsg {
  id: number;
  message: string;
  actionLabel?: string;
}

/** One component patch for an atomic multi-component stage. */
export interface ComponentPatchEntry {
  id: string;
  patch: Partial<RocketComponent>;
}

/**
 * Per-studio draft: component patches plus a workspace patch plus an
 * optional replaced thrust curve plus new ledger entries not yet committed.
 */
export interface StudioDraft {
  components: Record<string, Partial<RocketComponent>>;
  workspace: Partial<Workspace>;
  /** Full replacement thrust curves, motor id to points. */
  curves: Record<string, Array<{ time: number; thrust: number }>>;
  /** New ledger entries staged for commit. */
  ledger: LedgerEntry[];
  /** Added components staged for commit. */
  added: RocketComponent[];
  /** Removed component ids staged for commit. */
  removed: string[];
}

/**
 * Console view of the project: the committed envelope plus the design intent
 * the envelope does not carry yet. Undo entries capture both, so an undo step
 * is always complete.
 */
export interface ConsoleView {
  project: ProjectEnvelope;
  mission: Mission;
  shearPa?: number;
}

export interface ConsoleEdit {
  label: string;
  /** Coalescing key: repeated edits of one field merge into a single undo step. */
  key: string;
  project: ProjectEnvelope;
  mission?: Mission;
  /** Present (even as `undefined`) sets the override; absent leaves it unchanged. */
  shearPa?: number;
}

/** Consecutive edits of the same field inside this window are one undo step. */
export const EDIT_MERGE_MS = 800;

export const DEFAULT_SITE_TEMPERATURE_K = 288.15;

function emptyDraft(): StudioDraft {
  return { components: {}, workspace: {}, curves: {}, ledger: [], added: [], removed: [] };
}

function patchIsFinite(patch: Record<string, unknown>): boolean {
  return Object.values(patch).every((value) => typeof value !== 'number' || Number.isFinite(value));
}

function draftIsEmpty(d: StudioDraft): boolean {
  return (
    Object.keys(d.components).length === 0 &&
    Object.keys(d.workspace).length === 0 &&
    Object.keys(d.curves).length === 0 &&
    d.ledger.length === 0 &&
    d.added.length === 0 &&
    d.removed.length === 0
  );
}

/** Apply a workspace patch to a committed workspace. */
export function mergeWorkspace(base: Workspace, patch: Partial<Workspace>): Workspace {
  return {
    ...base,
    ...patch,
    launch: { ...base.launch, ...(patch.launch ?? {}) },
    site: { ...base.site, ...(patch.site ?? {}) },
    ensemble: { ...base.ensemble, ...(patch.ensemble ?? {}) },
    aeroLimits: { ...base.aeroLimits, ...(patch.aeroLimits ?? {}) },
    recovery: { ...base.recovery, ...(patch.recovery ?? {}) },
  };
}

/** Effective motor record: library overlay wins over certified. */
export function resolveMotorRecord(
  motorId: string,
  customs: Record<string, MotorRecord>,
): MotorRecord | null {
  const key = normalizeMotorId(motorId);
  const custom = customs[key];
  if (custom) return custom;
  const certified = CERTIFIED_MOTORS[key];
  if (certified) return { id: key, motor: certified, provenance: { source: 'certified' } };
  return null;
}

/** Effective motor spec, or null when the id resolves to nothing. */
export function resolveMotorSpec(
  motorId: string,
  customs: Record<string, MotorRecord>,
): MotorSpec | null {
  return resolveMotorRecord(motorId, customs)?.motor ?? null;
}

interface ProjectState {
  project: ProjectEnvelope;
  /** Custom and derived motor records, keyed by normalized id. */
  motors: Record<string, MotorRecord>;
  /** Console design intent the envelope does not carry yet. */
  mission: Mission;
  /** Console fin shear-modulus override, Pa (from a test). */
  shearPa?: number;
  drafts: Record<StudioId, StudioDraft>;
  past: UndoEntry[];
  future: UndoEntry[];
  file: FileStatus;
  toasts: ToastMsg[];
  /** Last destructive commit, for the undo toast action. */
  lastDestructive: { label: string } | null;
  /**
   * Bumped whenever the whole project is replaced (open, new, preset), never by
   * an edit. Session state that belongs to one project (the imported flight
   * log) is dropped when this moves.
   */
  projectEpoch: number;

  stageComponents: (studio: StudioId, id: string, patch: Partial<RocketComponent>) => boolean;
  /**
   * Stage several component patches in one write. All-or-nothing: an invalid
   * entry stages nothing and returns false, so a caller moving coupled parts
   * (a tube length with its fins) can never expose a half-applied draft.
   */
  stageComponentPatches: (studio: StudioId, entries: readonly ComponentPatchEntry[]) => boolean;
  stageWorkspace: (studio: StudioId, patch: Partial<Workspace>) => boolean;
  stageCurve: (studio: StudioId, motorId: string, curve: Array<{ time: number; thrust: number }>) => boolean;
  stageLedger: (studio: StudioId, entry: LedgerEntry) => void;
  stageAddComponent: (studio: StudioId, component: RocketComponent) => boolean;
  stageRemoveComponent: (studio: StudioId, id: string) => boolean;
  revertStudio: (studio: StudioId) => void;
  applyStudio: (studio: StudioId) => void;
  /** Direct structural commits: one undo entry each. */
  commitStructural: (label: string, fn: (p: ProjectEnvelope) => ProjectEnvelope) => void;
  /**
   * Console edits: commit a whole project (and optionally the mission or fin
   * shear override) as one undoable step. Consecutive edits with the same
   * `key` inside `EDIT_MERGE_MS` merge, so a field drag is one undo.
   */
  editProject: (edit: ConsoleEdit) => void;
  /**
   * Register a motor (import, derived curve), optionally binding it, as one undoable
   * project change. Returns the key the record landed on: the normalized id
   * when free (or already holding the same designation), otherwise the next
   * `_2`/`_3` suffix so a different motor of the same id is never overwritten.
   */
  addMotorRecord: (record: MotorRecord, label: string, bind?: boolean) => string;
  undo: () => void;
  redo: () => void;
  dismissToast: (id: number) => void;
  clearDestructive: () => void;
  setFile: (file: FileStatus) => void;
  /** Replace the whole project (open, import, preset): clears drafts and history. */
  replaceProject: (project: ProjectEnvelope, motors: Record<string, MotorRecord>) => void;
  /** New empty project from the bundled baseline vehicle. */
  newProject: () => void;
  loadPreset: (key: string) => void;
  /** Snapshot of the committed project plus the console extras. */
  consoleView: () => ConsoleView;
  /** The effective certificate/import/derived records: envelope over registry. */
  motorRecords: () => MotorRecord[];
  /** Explicitly load a saved case's inputs as one undoable edit; never runs it. */
  loadSavedRun: (id: string) => boolean;
}

/** The certified library record for a preset's motor, so a fresh project carries its binding. */
function certifiedRecord(motorId: string): MotorRecord[] {
  const key = normalizeMotorId(motorId);
  const motor = CERTIFIED_MOTORS[key];
  if (motor === undefined) throw new Error(`certifiedRecord: no certified motor '${key}' for the preset`);
  return [{ id: key, motor, provenance: { source: 'certified' } }];
}

function initialProject(): { project: ProjectEnvelope; motors: Record<string, MotorRecord>; mission: Mission } {
  const preset = presetOf(SEED_PRESET_KEY);
  if (!preset) throw new Error('initialProject: the built-in Student Launch template is missing');
  const workspace: Workspace = {
    ...DEFAULT_WORKSPACE,
    motorId: preset.motorId,
    launch: { ...DEFAULT_WORKSPACE.launch, ...preset.launch },
  };
  const project = createProjectEnvelope({
    vehicle: preset.vehicle,
    workspace,
    mission: preset.mission,
    motorRecords: certifiedRecord(preset.motorId),
  });
  return { project, motors: {}, mission: preset.mission };
}

let toastCounter = 0;

export const useProjectStore = create<ProjectState>((set, get) => {
  const seed = initialProject();
  const blankDrafts = (): Record<StudioId, StudioDraft> => ({
    airframe: emptyDraft(),
    aero: emptyDraft(),
    propulsion: emptyDraft(),
    trajectory: emptyDraft(),
    recovery: emptyDraft(),
  });

  /** Current console extras, for undo entries and project replacement. */
  const extrasOf = (): DesignExtras => ({ mission: get().mission, shearPa: get().shearPa });

  /** Undo entry capturing the whole current view, extras included. */
  const entryOf = (label: string, key?: string): UndoEntry => ({ label, key, at: Date.now(), project: get().project, motors: get().motors, ...extrasOf() });

  /** Undoable project commit with same-key merging inside the merge window. */
  const commitConsole = (edit: ConsoleEdit): void => {
    const { past, project } = get();
    const now = Date.now();
    const last = past[past.length - 1];
    const merge = last !== undefined && last.key !== undefined && last.key === edit.key && now - (last.at ?? 0) < EDIT_MERGE_MS;
    const entry: UndoEntry = {
      label: edit.label,
      key: edit.key,
      at: now,
      project: merge ? last.project : project,
      motors: merge ? last.motors : get().motors,
      mission: merge ? last.mission : get().mission,
      shearPa: merge ? last.shearPa : get().shearPa,
    };
    set({
      project: edit.project,
      mission: edit.mission ?? get().mission,
      shearPa: 'shearPa' in edit ? edit.shearPa : get().shearPa,
      past: (merge ? [...past.slice(0, -1), entry] : [...past, entry]).slice(-200),
      future: [],
      file: { kind: 'dirty-unsaved' },
    });
  };

  const commitDraft = (studio: StudioId, label: string): void => {
    const { project, drafts } = get();
    const draft = drafts[studio];
    if (draftIsEmpty(draft)) return;
    const workspace = mergeWorkspace(project.workspace, draft.workspace);
    const removedIds: Record<string, true> = {};
    for (const id of draft.removed) removedIds[id] = true;
    const components = project.vehicle.components
      .filter((c) => removedIds[c.id] !== true)
      .map((c) => {
        const patch = draft.components[c.id];
        if (!patch) return c;
        const next = { ...c, ...patch } as unknown as Record<string, unknown>;
        for (const field of Object.keys(patch)) if (next[field] === undefined) delete next[field];
        return next as unknown as RocketComponent;
      });
    const motors = { ...get().motors };
    for (const [motorId, curve] of Object.entries(draft.curves)) {
      const rec = resolveMotorRecord(motorId, motors);
      if (!rec) continue;
      const motor: MotorSpec = { ...rec.motor, thrustCurve: curve.map((p) => ({ ...p })) };
      const key = normalizeMotorId(motorId);
      motors[key] = {
        id: key,
        motor,
        provenance:
          rec.provenance.source === 'certified'
            ? { source: 'derived', note: `edited from certified ${rec.motor.designation}` }
            : rec.provenance,
      };
    }
    const next: ProjectEnvelope = {
      ...project,
      vehicle: { ...project.vehicle, components },
      workspace,
      ledger: [...project.ledger, ...draft.ledger],
    };
    set({
      project: next,
      motors,
      past: [...get().past, entryOf(label)].slice(-100),
      future: [],
      drafts: { ...drafts, [studio]: emptyDraft() },
      file: { kind: 'dirty-unsaved' },
    });
  };

  return {
    project: seed.project,
    motors: seed.motors,
    mission: seed.mission,
    shearPa: undefined,
    drafts: blankDrafts(),
    past: [],
    future: [],
    file: { kind: 'clean' },
    toasts: [],
    lastDestructive: null,
    projectEpoch: 0,

    stageComponents: (studio, id, patch) => get().stageComponentPatches(studio, [{ id, patch }]),

    stageComponentPatches: (studio, entries) => {
      if (entries.length === 0) return false;
      const { project, drafts } = get();
      const draft = drafts[studio];
      const merged: Record<string, Partial<RocketComponent>> = {};
      for (const { id, patch } of entries) {
        if (!patch || Object.keys(patch).length === 0) return false;
        if (!patchIsFinite(patch as Record<string, unknown>)) return false;
        if (draft.removed.includes(id)) return false;
        const existing =
          project.vehicle.components.find((c) => c.id === id) ?? draft.added.find((c) => c.id === id);
        if (!existing) return false;
        merged[id] = { ...merged[id], ...patch };
      }
      const components = { ...draft.components };
      for (const [id, patch] of Object.entries(merged)) {
        components[id] = { ...components[id], ...patch };
      }
      set({ drafts: { ...drafts, [studio]: { ...draft, components } } });
      return true;
    },

    stageWorkspace: (studio, patch) => {
      if (!patch || Object.keys(patch).length === 0) return false;
      const flat: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          for (const [sk, sv] of Object.entries(v as unknown as Record<string, unknown>)) flat[`${k}.${sk}`] = sv;
        } else {
          flat[k] = v;
        }
      }
      if (!patchIsFinite(flat)) return false;
      const { drafts } = get();
      const draft = drafts[studio];
      set({
        drafts: {
          ...drafts,
          [studio]: { ...draft, workspace: mergeWorkspace(draft.workspace as Workspace, patch) },
        },
      });
      return true;
    },

    stageCurve: (studio, motorId, curve) => {
      if (get().project.cases.some((entry) => entry.inputs !== undefined && entry.motorRecordId === normalizeMotorId(motorId))) return false;
      if (curve.length < 2) return false;
      for (const p of curve) {
        if (!Number.isFinite(p.time) || !Number.isFinite(p.thrust)) return false;
      }
      for (let i = 1; i < curve.length; i += 1) {
        if (curve[i].time <= curve[i - 1].time) return false;
      }
      const { drafts } = get();
      const draft = drafts[studio];
      set({
        drafts: { ...drafts, [studio]: { ...draft, curves: { ...draft.curves, [motorId]: curve } } },
      });
      return true;
    },

    stageLedger: (studio, entry) => {
      const { drafts } = get();
      const draft = drafts[studio];
      set({ drafts: { ...drafts, [studio]: { ...draft, ledger: [...draft.ledger, entry] } } });
    },

    stageAddComponent: (studio, component) => {
      const { project, drafts } = get();
      const draft = drafts[studio];
      if (project.vehicle.components.some((c) => c.id === component.id)) return false;
      if (draft.added.some((c) => c.id === component.id)) return false;
      set({ drafts: { ...drafts, [studio]: { ...draft, added: [...draft.added, component] } } });
      return true;
    },

    stageRemoveComponent: (studio, id) => {
      const { project, drafts } = get();
      const draft = drafts[studio];
      const addedIdx = draft.added.findIndex((c) => c.id === id);
      if (addedIdx >= 0) {
        const added = draft.added.filter((c) => c.id !== id);
        const components = { ...draft.components };
        delete components[id];
        set({ drafts: { ...drafts, [studio]: { ...draft, added, components } } });
        return true;
      }
      if (!project.vehicle.components.some((c) => c.id === id)) return false;
      if (draft.removed.includes(id)) return false;
      set({ drafts: { ...drafts, [studio]: { ...draft, removed: [...draft.removed, id] } } });
      return true;
    },

    revertStudio: (studio) => {
      const { drafts } = get();
      if (draftIsEmpty(drafts[studio])) return;
      set({ drafts: { ...drafts, [studio]: emptyDraft() } });
    },

    applyStudio: (studio) => commitDraft(studio, `Apply ${studio} edits`),

    commitStructural: (label, fn) => {
      const { project } = get();
      const next = fn(project);
      set({
        project: next,
        past: [...get().past, entryOf(label)].slice(-100),
        future: [],
        file: { kind: 'dirty-unsaved' },
      });
    },

    editProject: (edit) => commitConsole(edit),

    addMotorRecord: (record, label, bind = true) => {
      const { project, motors } = get();
      const existing = mergeMotorRecords(project.motorRecords, motors);
      const pinnedIds = new Set(project.cases.filter((entry) => entry.inputs !== undefined).map((entry) => entry.motorRecordId));
      // Treat historical pins as occupied even when their designation matches.
      const occupied = existing.map((entry) => pinnedIds.has(entry.id)
        ? { ...entry, provenance: { ...entry.provenance, source: 'certified' as const } } : entry);
      const key = importMotorKey(record.motor, occupied);
      const stored: MotorRecord = { ...record, id: key, motor: copyMotor(record.motor) };
      const rest = existing.filter((r) => r.id !== key);
      set({
        project: {
          ...project,
          motorRecords: [...rest, stored],
          workspace: bind ? { ...project.workspace, motorId: key } : project.workspace,
        },
        motors: { ...motors, [key]: stored },
        past: [...get().past, entryOf(label)].slice(-100),
        future: [],
        file: { kind: 'dirty-unsaved' },
      });
      return key;
    },

    undo: () => {
      const { past, project, motors, future, mission, shearPa } = get();
      const last = past[past.length - 1];
      if (!last) return;
      const analysisContext = last.analysisContext ? terminalAnalysisSnapshot() : undefined;
      if (last.analysisContext) useAnalysisStore.setState(last.analysisContext);
      set({
        project: last.project,
        motors: last.motors,
        mission: last.mission ?? mission,
        shearPa: 'shearPa' in last ? last.shearPa : shearPa,
        past: past.slice(0, -1),
        future: [...future, { label: last.label, project, motors, mission, shearPa, analysisContext }],
        ...(last.analysisContext ? { projectEpoch: get().projectEpoch + 1 } : {}),
        file: { kind: 'dirty-unsaved' },
        lastDestructive: null,
      });
    },

    redo: () => {
      const { past, project, motors, future, mission, shearPa } = get();
      const next = future[future.length - 1];
      if (!next) return;
      const analysisContext = next.analysisContext ? terminalAnalysisSnapshot() : undefined;
      if (next.analysisContext) useAnalysisStore.setState(next.analysisContext);
      set({
        project: next.project,
        motors: next.motors,
        mission: next.mission ?? mission,
        shearPa: 'shearPa' in next ? next.shearPa : shearPa,
        past: [...past, { label: next.label, project, motors, mission, shearPa, analysisContext }],
        ...(next.analysisContext ? { projectEpoch: get().projectEpoch + 1 } : {}),
        future: future.slice(0, -1),
        file: { kind: 'dirty-unsaved' },
      });
    },

    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

    clearDestructive: () => set({ lastDestructive: null }),

    setFile: (file) => set({ file }),

    replaceProject: (project, motors) => {
      const cases = new Map(project.cases.map((entry) => [entry.id, entry.summary?.inputKey]));
      useAnalysisStore.setState(terminalAnalysisSnapshot((record) =>
        record.status === 'completed' && cases.get(caseId(record)) === record.inputKey,
      ));
      set({
        project,
        motors,
        mission: project.mission,
        shearPa: project.finShearModulusPa,
        drafts: blankDrafts(),
        past: [],
        future: [],
        file: { kind: 'dirty-unsaved' },
        lastDestructive: null,
        projectEpoch: get().projectEpoch + 1,
      });
    },

    loadSavedRun: (id) => {
      if (Object.values(get().drafts).some((draft) => !draftIsEmpty(draft))) return false;
      if (Object.values(useAnalysisStore.getState().records).some((record) => record?.status === 'running')) return false;
      const project = exportableProject();
      const saved = project.cases.find((entry) => entry.id === id);
      const inputs = saved?.inputs;
      if (!saved || !inputs) return false;
      let flightModel: FlightModelSelection | undefined;
      try {
        flightModel = inputs.version === 2 ? parseLegacyFlightModel(inputs.flightModel)
          : inputs.version === 3 ? parseCandidateFlightModel(inputs.flightModel) : undefined;
      } catch { return false; }
      // Use the content-pinned catalog key. An existing same-ID motor, and any
      // legacy case referencing it, must never be silently overwritten.
      const pinned = project.motorRecords.find((entry) => entry.id === saved.motorRecordId);
      if (!pinned) return false;
      const sameMotor = (other: MotorRecord) => stableStringify({ motor: other.motor, provenance: other.provenance }) === stableStringify({ motor: pinned.motor, provenance: pinned.provenance });
      const stem = `restored_${hashHex(stableStringify({ motor: pinned.motor, provenance: pinned.provenance }))}`;
      let key = stem;
      let suffix = 2;
      const catalog = mergeMotorRecords(project.motorRecords, get().motors);
      while (catalog.some((record) => record.id === key && !sameMotor(record))) key = `${stem}_${suffix++}`;
      const record = { ...structuredClone(pinned), id: key };
      const clone = structuredClone(inputs);
      const legacy = clone.version === 3 ? null : clone;
      const { dragCalibration: _calibration, finShearModulusPa: _shear, flightModel: _model, ...rest } = project;
      const next: ProjectEnvelope = {
        ...rest,
        ...(flightModel === undefined ? {} : { flightModel }),
        vehicle: clone.vehicle,
        motorRecords: [...project.motorRecords.filter((entry) => entry.id !== record.id), record],
        workspace: { ...clone.context.workspace, launch: clone.launch, motorId: record.id,
          ...(legacy === null || legacy.ensemble === undefined ? {} : { ensemble: legacy.ensemble }) },
        mission: clone.context.mission,
        ...restoreRunWeatherContext(project, clone.context.weather),
        bindings: clone.vehicle.components.filter((component) => component.type === 'bodytube' && component.isMotorMount)
          .map((component) => ({ kind: 'motorMount' as const, vehicleComponentId: component.id, motorRecordId: record.id })),
        ...(legacy === null || legacy.dragCalibration === undefined ? {} : { dragCalibration: legacy.dragCalibration }),
        ...(legacy === null || legacy.finShearModulusPa === undefined ? {} : { finShearModulusPa: legacy.finShearModulusPa }),
      };
      const undoEntry = { ...entryOf(`Load saved run ${saved.createdAt}`), analysisContext: terminalAnalysisSnapshot() };
      detachCurrentAnalysis();
      // A profile-supplied run restores its session-scoped atmosphere document;
      // an untagged run clears any profile so the restored inputs match exactly.
      const restoredRequest = clone.version === 3 ? clone.candidateRequest : null;
      useSessionStore.getState().setEnvironmentProfile(
        restoredRequest !== null && isProfileInvocation(restoredRequest) ? restoredRequest.environmentSelection : null);
      set({ project: next, motors: { ...get().motors, [record.id]: structuredClone(record) },
        mission: next.mission, shearPa: legacy?.finShearModulusPa,
        past: [...get().past, undoEntry].slice(-100), future: [],
        // Saved inputs replace the active run context, including Console job
        // displays. Undo/redo already cross the same terminal-state boundary.
        projectEpoch: get().projectEpoch + 1,
        drafts: blankDrafts(), file: { kind: 'dirty-unsaved' },
      });
      return true;
    },

    newProject: () => {
      const seed = initialProject();
      useAnalysisStore.getState().reset();
      set({
        project: { ...seed.project, mission: DEFAULT_MISSION },
        motors: seed.motors,
        mission: DEFAULT_MISSION,
        shearPa: undefined,
        drafts: blankDrafts(),
        past: [],
        future: [],
        file: { kind: 'dirty-unsaved' },
        lastDestructive: null,
        projectEpoch: get().projectEpoch + 1,
      });
    },

    loadPreset: (key) => {
      const preset = presetOf(key);
      if (!preset) return;
      const workspace: Workspace = {
        ...DEFAULT_WORKSPACE,
        motorId: preset.motorId,
        launch: { ...DEFAULT_WORKSPACE.launch, ...preset.launch },
        site: { ...DEFAULT_WORKSPACE.site, altitudeASLM: preset.altitudeASLM ?? DEFAULT_WORKSPACE.site.altitudeASLM },
      };
      const project = createProjectEnvelope({
        vehicle: preset.vehicle,
        workspace,
        mission: preset.mission,
        motorRecords: certifiedRecord(preset.motorId),
      });
      const entry = { ...entryOf(`Load preset ${preset.label}`), analysisContext: terminalAnalysisSnapshot() };
      useAnalysisStore.getState().reset();
      toastCounter += 1;
      set({
        project,
        motors: get().motors,
        mission: preset.mission,
        shearPa: undefined,
        drafts: blankDrafts(),
        past: [...get().past, entry].slice(-100),
        future: [],
        file: { kind: 'dirty-unsaved' },
        toasts: [...get().toasts, { id: toastCounter, message: `Preset loaded: ${preset.label}` }],
        projectEpoch: get().projectEpoch + 1,
      });
    },

    motorRecords: () => mergeMotorRecords(get().project.motorRecords, get().motors),
    consoleView: () => ({ project: get().project, mission: get().mission, shearPa: get().shearPa }),
  };
});

/** Commit a named destructive action with an undo toast. Caller removes first. */
export function commitDestructive(label: string, fn: (p: ProjectEnvelope) => ProjectEnvelope): void {
  const store = useProjectStore.getState();
  store.commitStructural(label, fn);
  toastCounter += 1;
  useProjectStore.setState({
    toasts: [...useProjectStore.getState().toasts, { id: toastCounter, message: label, actionLabel: 'Undo' }],
    lastDestructive: { label },
  });
}

/**
 * The committed project with every motor record the session holds, for save
 * and export. The project's own records keep their order (the envelope
 * builder takes the first occurrence on an id collision); the store's
 * registry overrides them by id, so an imported or curve-edited record is
 * never silently replaced by an older copy of itself.
 */
export function exportableProject(): ProjectEnvelope {
  const { motors, mission, shearPa } = useProjectStore.getState();
  // The session's completed runs travel with the project as cases, and the
  // ledger's evidence is indexed into evidenceRefs.
  const project = withEvidenceRefs(withRunCases(useProjectStore.getState().project, useAnalysisStore.getState().history));
  const byId = new Map<string, MotorRecord>();
  const order: string[] = [];
  const add = (rec: MotorRecord): void => {
    const id = normalizeMotorId(rec.id);
    if (!byId.has(id)) order.push(id);
    byId.set(id, { ...rec, id });
  };
  for (const rec of project.motorRecords) add(rec);
  const pinnedIds = new Set(project.cases.filter((entry) => entry.inputs !== undefined).map((entry) => entry.motorRecordId));
  for (const rec of Object.values(motors)) {
    if (pinnedIds.has(rec.id) && stableStringify(byId.get(rec.id)) !== stableStringify(rec)) {
      throw new Error('Historical motor records cannot be overwritten. Load saved inputs to edit a working copy.');
    }
    add(rec);
  }
  const { finShearModulusPa: _stale, ...rest } = project;
  // The live mission and fin shear override are the authority: the envelope the
  // store holds only carries the values it was opened or created with.
  return {
    ...rest,
    mission: { ...mission },
    ...(shearPa === undefined ? {} : { finShearModulusPa: shearPa }),
    motorRecords: order.map((id) => byId.get(id) as MotorRecord),
  };
}

/** Serialize the committed project (motor records included) for save or export. */
export function serializeProject(): string {
  return writeProject(exportableProject());
}

/**
 * Adopt a parsed envelope as the whole project: the vehicle, the workspace,
 * the ledger and the motor records it carries. Non-certified records are
 * re-registered so a reloaded project's bound custom motors stay usable;
 * certified records are already in the bundled library.
 */
export function adoptProject(project: ProjectEnvelope): { name: string; revision: number } {
  // Guard direct typed callers too, before clearing history or replacing state.
  resolveFlightModel(project.flightModel);
  const motors: Record<string, MotorRecord> = {};
  for (const rec of project.motorRecords) {
    if (rec.provenance.source === 'certified') continue;
    motors[normalizeMotorId(rec.id)] = rec;
  }
  useProjectStore.getState().replaceProject(project, motors);
  return { name: project.vehicle.name, revision: project.revision };
}

/** Parse and replace the project; throws InvalidProjectError on bad input. */
export function openProjectJson(json: string): { name: string; revision: number } {
  return adoptProject(readProject(json));
}

/** Effective vehicle for a studio: committed plus that studio's staged edits. */
export function effectiveVehicle(studio: StudioId): RocketVehicle {
  const { project, drafts } = useProjectStore.getState();
  const draft = drafts[studio];
  if (draftIsEmpty(draft)) return project.vehicle;
  const removed = new Set(draft.removed);
  const components = project.vehicle.components
    .filter((c) => !removed.has(c.id))
    .map((c) => {
      const patch = draft.components[c.id];
      return patch ? ({ ...c, ...patch } as RocketComponent) : c;
    });
  return { ...project.vehicle, components: [...components, ...draft.added] };
}

/** Effective workspace for a studio: committed plus that studio's staged edits. */
export function effectiveWorkspace(studio: StudioId): Workspace {
  const { project, drafts } = useProjectStore.getState();
  return mergeWorkspace(project.workspace, drafts[studio].workspace);
}

/** Staged field count for a studio, for pills and the cross-studio tray. */
export function stagedCount(studio: StudioId): number {
  const draft = useProjectStore.getState().drafts[studio];
  return (
    Object.keys(draft.components).length +
    Object.keys(draft.workspace).length +
    Object.keys(draft.curves).length +
    draft.ledger.length +
    draft.added.length +
    draft.removed.length
  );
}

/** Total staged edits across all studios. */
export function totalStagedCount(): number {
  return STUDIO_ORDER.reduce((n, s) => n + stagedCount(s), 0);
}
