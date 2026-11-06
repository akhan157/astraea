/**
 * Project lifecycle: file import, the durable browser slot, and native project
 * files, with the inline report the chrome shows for each.
 *
 * Fail-closed posture, matching the format layer: a refused or failed
 * operation leaves the committed project — and any bytes already stored —
 * exactly as they were, and says why inline. No modal dialog is ever opened,
 * and no value the engine did not produce is fabricated.
 */

import { create } from 'zustand';
import { normalizeMotorId } from '../propulsion/motorDatabase';
import { writeProject, type MotorRecord, type ProjectEnvelope } from '../formats/projectJson';
import { createDurableProject, InvalidProjectError, StaleRevisionError, type DurableProject } from '../formats/projectStorage';
import {
  describeImport,
  importMotorFile,
  importVehicleFile,
  openProjectFromFile,
  projectArchiveBudget,
  projectFileName,
  saveProjectTo,
} from '../io/files';
import { adoptProject, exportableProject, useProjectStore } from './project';

/** Inline import disclosure: a loss note, or a failure with its reason. */
export interface ProjectReport {
  title: string;
  message: string;
}

/** Inline outcome of a save or open, shown in the project menu. */
export interface ProjectStatus {
  kind: 'ok' | 'error';
  message: string;
}

interface ProjectIoState {
  report: ProjectReport | null;
  status: ProjectStatus | null;
  dismissReport: () => void;
  setStatus: (status: ProjectStatus | null) => void;
}

export const useProjectIo = create<ProjectIoState>((set) => ({
  report: null,
  status: null,
  dismissReport: () => set({ report: null }),
  setStatus: (status) => set({ status }),
}));

function reasonOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The reason, then what is still safe and what the user can do next. */
function failure(prefix: 'Save failed' | 'Open failed', err: unknown, next: string): ProjectStatus {
  const reason = reasonOf(err).trim().replace(/\.$/, '');
  return { kind: 'error', message: `${prefix}${reason ? `: ${reason}` : ''}. ${next}` };
}

function slotSaveRecovery(err: unknown): string {
  if (err instanceof StaleRevisionError) return 'Another tab or window saved a newer revision. Your design is still open: use Save project file… to keep it, or Open saved project to load the newer one.';
  if (err instanceof InvalidProjectError) return 'The copy stored in this browser is unreadable and was left untouched. Your design is still open: use Save project file… to keep a copy.';
  return 'Nothing in this browser was changed and your design is still open. Use Save project file… to keep a copy.';
}

/**
 * The single durable slot. Module scope so the revision base survives
 * component remounts within a session; the handle re-reads storage on every
 * load/save, so a commit made in another tab is never clobbered.
 */
let slot: DurableProject | null = null;

/** Drop the cached slot handle (tests, or after the storage itself changed). */
export function resetProjectSlot(): void {
  slot = null;
}

// Sequence document requests separately from feedback: a Save must not cancel
// a pending Open, but its completion must not overwrite newer operation feedback.
let documentIntent = 0;
let feedbackIntent = 0;

function documentContent(includeResults: boolean): string {
  if (includeResults) return JSON.stringify(exportableProject());
  const { project, motors, mission, shearPa } = useProjectStore.getState();
  // An explicit load replaces session results. Background analysis completion
  // is not a user edit and must not cancel that load.
  return JSON.stringify({ project, motors, mission, shearPa });
}

function captureDocument(includeResults = false) {
  return { epoch: useProjectStore.getState().projectEpoch, content: documentContent(includeResults), includeResults };
}

function sameDocument(snapshot: ReturnType<typeof captureDocument>): boolean {
  return snapshot.epoch === useProjectStore.getState().projectEpoch && snapshot.content === documentContent(snapshot.includeResults);
}

function beginOpen() {
  return { document: ++documentIntent, feedback: ++feedbackIntent, snapshot: captureDocument() };
}

function canApply(request: ReturnType<typeof beginOpen>): boolean {
  return request.document === documentIntent && sameDocument(request.snapshot);
}

function canReport(request: ReturnType<typeof beginOpen>): boolean {
  return request.feedback === feedbackIntent && canApply(request);
}

function loadCancellation(request: ReturnType<typeof beginOpen>): ProjectStatus {
  return {
    kind: 'ok',
    message: request.document === documentIntent && request.snapshot.epoch === useProjectStore.getState().projectEpoch
      ? 'Load cancelled — the current document changed while loading. Try opening it again.'
      : 'Open superseded — nothing was loaded.',
  };
}

function applyOrReportChange(request: ReturnType<typeof beginOpen>): boolean {
  if (canApply(request)) return true;
  // A different document or newer request must never receive stale feedback.
  if (request.document === documentIntent && request.feedback === feedbackIntent && request.snapshot.epoch === useProjectStore.getState().projectEpoch) {
    useProjectIo.setState({ status: loadCancellation(request) });
  }
  return false;
}

/**
 * Import a dropped or picked file into the project. The vehicle or project is
 * replaced only after parsing succeeds and the request still targets the current
 * document. Obsolete requests cannot replace newer content or feedback.
 */
export async function importProjectFile(file: File): Promise<void> {
  await importRequestedFile(file, beginOpen());
}

/**
 * Import refusals happen before any document mutation: parse and gate fail
 * first, and adoptProject only throws in resolveFlightModel before its single
 * replaceProject state update (state/project.ts), so the guidance holds.
 */
function couldNotLoad(file: File, reason: string, next = 'Your current design was not changed.'): ProjectReport {
  const why = reason.trim().replace(/\.$/, '');
  return { title: `Could not load ${file.name}`, message: why ? `${why}. ${next}` : next };
}

async function importRequestedFile(file: File, request: ReturnType<typeof beginOpen>): Promise<void> {
  if (!applyOrReportChange(request)) return;
  const gate = describeImport({ name: file.name, size: file.size });
  if (!gate.ok) {
    useProjectIo.setState({ report: couldNotLoad(file, gate.message) });
    return;
  }
  if (gate.kind === 'eng' || gate.kind === 'rse') {
    try {
      const motor = await importMotorFile(file);
      if (!applyOrReportChange(request)) return;
      const record: MotorRecord = {
        id: normalizeMotorId(motor.id),
        motor,
        provenance: { source: 'import', sourceFile: file.name, importedAt: new Date().toISOString() },
      };
      useProjectStore.getState().addMotorRecord(record, `Import motor ${motor.designation}`, false);
      if (request.feedback === feedbackIntent) useProjectIo.setState({
        report: {
          title: `Imported ${file.name}`,
          message:
            `Motor ${motor.designation} (${motor.totalImpulse.toFixed(1)} N·s) is registered in the ` +
            'catalog; bind it in the Motor stage.',
        },
      });
    } catch (err) {
      if (applyOrReportChange(request) && canReport(request)) useProjectIo.setState({ report: couldNotLoad(file, reasonOf(err), 'No motor was added and your current design was not changed.') });
    }
    return;
  }
  try {
    const imported = await importVehicleFile(file);
    if (!applyOrReportChange(request)) return;
    if (imported.envelope) {
      // A whole project: the envelope carries the vehicle, workspace, ledger
      // and motor records, so the document replaces the current one.
      const adopted = adoptProject(imported.envelope);
      if (request.feedback === feedbackIntent) useProjectIo.setState({
        status: { kind: 'ok', message: `Opened project "${adopted.name}" (revision ${adopted.revision})` },
      });
    } else {
      // Geometry-only formats: the vehicle is replaced as one undoable edit,
      // so the workspace, motor records, ledger and history stay intact.
      const store = useProjectStore.getState();
      store.editProject({
        label: `Import ${file.name}`,
        key: `import:${file.name}`,
        project: { ...store.project, vehicle: imported.vehicle },
      });
    }
    if (request.feedback === feedbackIntent) useProjectIo.setState({
      report:
        imported.warnings.length > 0
          ? { title: `Imported ${file.name}`, message: imported.warnings.join('\n') }
          : null,
    });
  } catch (err) {
    if (applyOrReportChange(request) && canReport(request)) useProjectIo.setState({ report: couldNotLoad(file, reasonOf(err)) });
  }
}

/** Commit the committed project to the durable browser slot. */
export async function saveProjectToSlot(): Promise<ProjectStatus> {
  const feedback = ++feedbackIntent;
  const snapshot = captureDocument(true);
  const publish = (status: ProjectStatus): ProjectStatus => {
    if (feedback === feedbackIntent && snapshot.epoch === useProjectStore.getState().projectEpoch) useProjectIo.setState({ status });
    return status;
  };
  let committed: ProjectEnvelope;
  // Only the storage call can leave "nothing changed" true; guidance is scoped to it.
  try {
    committed = await (slot ??= createDurableProject()).save(exportableProject());
  } catch (err) {
    return publish(failure('Save failed', err, slotSaveRecovery(err)));
  }
  if (feedback === feedbackIntent && sameDocument(snapshot)) {
    useProjectStore.getState().setFile({ kind: 'saved', revision: committed.revision });
    return publish({ kind: 'ok', message: `Saved locally (revision ${committed.revision})` });
  }
  return publish({ kind: 'ok', message: sameDocument(snapshot)
    ? `Saved snapshot locally (revision ${committed.revision})`
    : `Saved earlier snapshot locally (revision ${committed.revision}); current changes remain unsaved.` });
}

/** Replace the project with the durable slot's contents, or say why not. */
export async function openProjectFromSlot(): Promise<ProjectStatus> {
  const request = beginOpen();
  let status: ProjectStatus;
  let stored: ProjectEnvelope | null;
  try {
    stored = await (slot ??= createDurableProject()).load();
  } catch (err) {
    // Nothing was adopted: the read itself failed.
    status = failure('Open failed', err, 'Your current design was not replaced.');
    if (!applyOrReportChange(request)) return loadCancellation(request);
    if (canReport(request)) useProjectIo.setState({ status });
    return status;
  }
  if (!applyOrReportChange(request)) return loadCancellation(request);
  if (stored === null) {
    status = { kind: 'ok', message: 'No project saved in this browser yet' };
  } else {
    try {
      adoptProject(stored);
      useProjectStore.getState().setFile({ kind: 'saved', revision: stored.revision });
      status = { kind: 'ok', message: `Opened saved project (revision ${stored.revision})` };
    } catch (err) {
      // adoptProject refuses before replacing state (see couldNotLoad).
      status = failure('Open failed', err, 'Your current design was not replaced.');
    }
  }
  if (request.feedback === feedbackIntent) useProjectIo.setState({ status });
  return status;
}

/** Write the project through the Tauri save dialog, else a browser download. */
export async function saveProjectToFile(): Promise<ProjectStatus> {
  const feedback = ++feedbackIntent;
  const epoch = useProjectStore.getState().projectEpoch;
  let status: ProjectStatus;
  try {
    const project = exportableProject();
    const name = projectFileName(project.vehicle.name);
    const text = writeProject(project);
    const budget = projectArchiveBudget(text, name);
    if (!budget.ok) {
      status = failure('Save failed', budget.message,
        'Your current design remains open. Save to this browser is a separate quota-bound option, not a guaranteed backup.');
    } else {
      const saved = await saveProjectTo(name, text, 'application/json');
      // Name what was written (the user may have renamed it in the dialog), not what was suggested.
      status =
        saved.via === 'cancelled'
          ? { kind: 'ok', message: 'Save cancelled — nothing was written.' }
          : { kind: 'ok', message: `Saved ${saved.name}${saved.via === 'browser' ? ' to your downloads' : ''}` };
    }
  } catch (err) {
    status = failure('Save failed', err, 'Your design is still open; try again, or use Save to this browser (a separate quota-bound option, not a guaranteed backup).');
  }
  if (feedback === feedbackIntent && epoch === useProjectStore.getState().projectEpoch) useProjectIo.setState({ status });
  return status;
}

/** Pick a project-grade file and import it through the same path as a drop. */
export async function openProjectFromFilePicker(): Promise<void> {
  const request = beginOpen();
  const file = await openProjectFromFile();
  if (!applyOrReportChange(request)) return;
  if (file === null) {
    if (canReport(request)) useProjectIo.setState({ status: { kind: 'ok', message: 'Open cancelled — nothing was loaded.' } });
    return;
  }
  await importRequestedFile(file, request);
}
