/**
 * Project chrome: the TopBar project menu, the editable vehicle name, the
 * inline import disclosure, the browser-preview notice, and the window-wide
 * drop target.
 *
 * Every message here is inline and dismissible where the legacy header was;
 * no modal dialog is opened for a result or an error. A failed import is a
 * red role="alert"; a successful one is a neutral role="status" that names
 * what did not carry over and where the motor came from, with Undo while the
 * import is still the latest edit. Save and open outcomes are role="status"
 * in the menu: green for done, neutral for cancelled or nothing to do, red
 * for failed.
 */

import { useEffect, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { Upload, FolderOpen, Save, FileDown, FileUp, X, Bug, CheckCircle2, AlertTriangle, Undo2 } from 'lucide-react';
import { reportProblemUrl } from '../../lib/links';
import { isDesktop, openExternal } from '../../desktop/external';
import { isEngineAvailable } from '../../io/backend';
import { OPEN_FILE_ACCEPT } from '../../io/files';
import { useProjectStore, type FileStatus } from '../../state/project';
import {
  useProjectIo,
  importProjectFile,
  openProjectFromFilePicker,
  openProjectFromSlot,
  saveProjectToFile,
  saveProjectToSlot,
  undoImport,
  OPEN_FROM_BROWSER,
  SAVE_COPY_AS_FILE,
  SAVE_IN_BROWSER,
  type ProjectStatus,
} from '../../state/projectIo';
import { consoleActions, useWS } from '../store';
import { hasUnsavedEdits, replaceDesign } from './StartChooser';
import { C } from '../kit/theme';

/** Desktop bundles for Linux, Windows and macOS are attached to each release. */
export const DESKTOP_DOWNLOAD_URL = 'https://github.com/akhan157/astraea/releases';

/** Shown only where the engine cannot run (no WebAssembly or Web Workers). */
export function BrowserPreviewBanner() {
  if (isEngineAvailable()) return null;
  return (
    <div
      role="status"
      data-web-preview="true"
      className="shrink-0 px-3 py-2 text-[11px]"
      style={{ borderBottom: `1px solid rgba(245,181,68,.3)`, background: 'rgba(69,45,10,.4)', color: '#F0C674' }}
    >
      This browser can't run the Astraea engine (it needs WebAssembly and Web Workers), so
      simulation, Monte Carlo, stability and aero curves are unavailable here. Editing, imports,
      exports and project files still work. Use a current browser or{' '}
      <a href={DESKTOP_DOWNLOAD_URL} target="_blank" rel="noreferrer" className="underline">
        the desktop app
      </a>
      .
    </div>
  );
}

/**
 * Inline import disclosure, dismissible; clears only this report. Success is
 * a neutral status (the answer, then what did not carry over, then the
 * motor's source, then Undo); a refusal is a red alert with the reason.
 */
export function ImportReportBanner() {
  const report = useProjectIo((s) => s.report);
  const dismissReport = useProjectIo((s) => s.dismissReport);
  // Undo is offered only while the import is still the latest edit, so the
  // button can never revert something else.
  const undoable = useProjectStore((s) => report?.undoLabel !== undefined && s.past[s.past.length - 1]?.label === report.undoLabel);
  if (report === null) return null;
  const failed = report.kind === 'error';
  return (
    <div
      role={failed ? 'alert' : 'status'}
      data-import-report={report.kind}
      className="flex shrink-0 items-start gap-3 px-3 py-2 text-[12px]"
      style={failed
        ? { borderBottom: `1px solid ${C.bad}66`, background: 'rgba(74,14,24,.6)', color: '#F6B7C0' }
        : { borderBottom: `1px solid ${C.ok}40`, background: 'rgba(16,46,34,.55)', color: C.fg }}
    >
      <span className="mt-0.5 shrink-0">{failed ? <AlertTriangle size={13} color={C.bad} /> : <CheckCircle2 size={13} color={C.ok} />}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{report.title}</p>
        <p className="whitespace-pre-line text-[11.5px]" style={{ opacity: failed ? 0.8 : 1 }}>{report.message}</p>
        {report.motorNote !== undefined && (
          <p data-import-motor-note="true" className="mt-0.5 text-[11.5px]" style={{ color: C.warn }}>{report.motorNote}</p>
        )}
        {report.details !== undefined && report.details.length > 0 && (
          <div className="mt-1">
            <p className="text-[11px]" style={{ color: C.muted }}>Not carried over</p>
            <ul data-import-details="true" className="list-disc space-y-0.5 pl-4 text-[11px]" style={{ color: C.muted }}>
              {report.details.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        )}
      </div>
      {undoable && (
        <button
          type="button"
          onClick={undoImport}
          className="shrink-0 rounded px-2 py-0.5 text-[11px]"
          style={{ border: `1px solid ${C.lineStrong}`, color: C.fg }}
        >
          <Undo2 size={11} className="inline" /> Undo import
        </button>
      )}
      <button
        type="button"
        onClick={dismissReport}
        aria-label="Dismiss disclosure"
        className="shrink-0 rounded px-2 py-0.5 text-[11px]"
        style={{ border: '1px solid currentColor', opacity: 0.85 }}
      >
        <X size={11} className="inline" /> Dismiss
      </button>
    </div>
  );
}

/**
 * Window-wide drop target for project and motor files. Drops land on the
 * unified project state through the same path as the menu's import entry; a
 * refused file is disclosed inline and leaves the project untouched.
 */
/**
 * Import a file, asking first when it would replace a design with unsaved
 * edits. A motor file (.eng/.rse) only adds a motor, so it never asks.
 */
export function importReplacing(file: File): void {
  if (/\.(eng|rse)$/i.test(file.name)) { void importProjectFile(file); return; }
  replaceDesign(file.name, () => void importProjectFile(file));
}

export function useProjectDrop(): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const over = (e: DragEvent): void => {
      e.preventDefault();
      setDragging(true);
    };
    const leave = (e: DragEvent): void => {
      // Leaving the window clears the overlay; moving between elements does not.
      if (e.relatedTarget === null) setDragging(false);
    };
    const drop = (e: DragEvent): void => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) importReplacing(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return { dragging };
}

/** Full-screen drop hint while a file is over the window. */
export function DropOverlay() {
  return (
    <div
      data-drop-overlay="true"
      className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center gap-1"
      style={{ background: 'rgba(6,32,38,.85)', border: `4px dashed ${C.accent}` }}
    >
      <Upload size={48} color={C.accent} />
      <h2 className="text-[15px] font-semibold" style={{ color: C.fg }}>
        Drop a vehicle, project, or motor file
      </h2>
      <p className="text-[11.5px]" style={{ color: C.muted }}>
        OpenRocket .ork, RockSim .rkt, Astraea .json, or a RASP .eng / RockSim .rse motor
      </p>
    </div>
  );
}

/** Vehicle name, editable here; it drives every export filename. */
export function VehicleNameField() {
  const name = useWS((s) => s.design.vehicle.name);
  const lastNamed = useRef(name);
  const rename = (next: string): void => consoleActions.setVehicle({ name: next }, 'Rename vehicle');
  return (
    <input
      type="text"
      aria-label="Vehicle name"
      title="Vehicle name (drives export filenames)"
      placeholder="Vehicle name"
      value={name}
      onChange={(e) => {
        const next = e.target.value;
        if (next.trim().length > 0) lastNamed.current = next;
        rename(next);
      }}
      onBlur={() => {
        // An empty name would make every export filename meaningless: restore
        // the last one the user actually typed.
        if (name.trim().length === 0) rename(lastNamed.current);
      }}
      className="w-[96px] rounded px-2 py-1 text-[12.5px] outline-none xl:w-[150px]"
      style={{ background: C.sunken, border: `1px solid ${C.line}`, color: C.fg }}
    />
  );
}

function fileStateLabel(file: FileStatus): string {
  if (file.kind === 'saved') return `saved (revision ${file.revision})`;
  if (file.kind === 'dirty-unsaved') return 'changes not saved here yet';
  if (file.kind === 'saving') return 'saving…';
  if (file.kind === 'error') return file.message;
  return 'nothing saved here this session';
}

const STATUS_COLOR: Record<ProjectStatus['kind'], string> = { ok: C.ok, info: C.muted, cancelled: C.muted, error: C.bad };

/**
 * Project menu: open or import, the browser's own copy, and a file copy. The
 * browser slot and a file are different places with different lifetimes, so
 * each is named for where it puts the project, never a bare "Save".
 */
export function ProjectMenu() {
  const status = useProjectIo((s) => s.status);
  const file = useProjectStore((s) => s.file);
  const inputRef = useRef<HTMLInputElement>(null);
  // Replacing a design with unsaved edits asks first, inline, so the outcome
  // still lands in this menu once it runs.
  const [pendingReplace, setPendingReplace] = useState<{ label: string; run: () => void } | null>(null);
  const askReplace = (label: string, run: () => void): void => {
    if (!hasUnsavedEdits()) { run(); return; }
    setPendingReplace({ label, run });
  };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          aria-label="Project menu"
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[12px] hover:bg-white/5"
          style={{ border: `1px solid ${C.line}`, color: C.fg }}
        >
          <FolderOpen size={13} color={C.muted} /> Project
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-50 w-[330px] rounded-lg p-2 shadow-2xl"
          style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}
        >
          {pendingReplace && (
            <div role="alertdialog" aria-label="Replace the current design?" className="mb-2 rounded-md p-2.5 text-[12px]" style={{ border: `1px solid ${C.warn}66`, background: `${C.warn}0d` }}>
              <p>Replace your design with {pendingReplace.label}? It has edits that aren't saved to a file.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="rounded px-2.5 py-1 text-[12px] font-medium" style={{ background: C.accent, color: '#06222A' }} onClick={() => { const run = pendingReplace.run; setPendingReplace(null); run(); }}>Replace</button>
                <button type="button" className="rounded px-2.5 py-1 text-[12px]" style={{ border: `1px solid ${C.line}` }} onClick={() => setPendingReplace(null)}>Keep my design</button>
              </div>
            </div>
          )}
          <div className="px-2 pb-1 pt-1.5 text-[10.5px] uppercase tracking-wide" style={{ color: C.dim }}>
            Open
          </div>
          <MenuItem
            icon={<Upload size={13} />}
            label="Import vehicle or motor…"
            hint=".ork, .rkt, .json, .eng, .rse; also works by dropping a file on the window"
            hook="import"
            onClick={() => inputRef.current?.click()}
          />
          <MenuItem
            icon={<FileUp size={13} />}
            label="Open project file…"
            hint="An .astraea.json project, through the file picker"
            hook="open-file"
            onClick={() => askReplace('a project file', () => void openProjectFromFilePicker())}
          />
          <div className="my-1 h-px" style={{ background: C.line }} />
          <div className="px-2 pb-1 pt-1.5 text-[10.5px] uppercase tracking-wide" style={{ color: C.dim }}>
            This browser
          </div>
          <MenuItem
            icon={<Save size={13} />}
            label={SAVE_IN_BROWSER}
            hint="One copy in this browser’s storage, with revisions. Clearing site data deletes it."
            hook="save"
            onClick={() => void saveProjectToSlot()}
          />
          <MenuItem
            icon={<FolderOpen size={13} />}
            label={OPEN_FROM_BROWSER}
            hint="Replaces the open project with the copy saved in this browser"
            hook="open"
            onClick={() => askReplace('the copy saved in this browser', () => void openProjectFromSlot())}
          />
          <div className="my-1 h-px" style={{ background: C.line }} />
          <div className="px-2 pb-1 pt-1.5 text-[10.5px] uppercase tracking-wide" style={{ color: C.dim }}>
            Files
          </div>
          <MenuItem
            icon={<FileDown size={13} />}
            label={SAVE_COPY_AS_FILE}
            hint="An .astraea.json file to keep, share or open on another computer"
            hook="save-file"
            onClick={() => void saveProjectToFile()}
          />
          <div className="my-1 h-px" style={{ background: C.line }} />
          <MenuItem
            icon={<Bug size={13} />}
            label="Report a problem…"
            hint="Opens a GitHub issue with the app version filled in; nothing else is sent"
            hook="report-problem"
            onClick={() => void openExternal(reportProblemUrl(__APP_VERSION__, isDesktop(), navigator.userAgent))}
          />
          <div className="mt-2 px-2 py-1.5 text-[11px]" style={{ borderTop: `1px solid ${C.line}`, color: C.muted }}>
            In this browser: {fileStateLabel(file)}
          </div>
          {status !== null && (
            <div
              role="status"
              data-project-status={status.kind}
              className="px-2 pb-1 text-[11.5px]"
              style={{ color: STATUS_COLOR[status.kind] }}
            >
              {status.message}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
      <input
        ref={inputRef}
        type="file"
        aria-label="Import file"
        accept={OPEN_FILE_ACCEPT}
        data-project-input="true"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // The file picker closes this menu, so a confirmation here uses the window-level dialog.
          if (file) importReplacing(file);
          e.target.value = '';
        }}
      />
    </Popover.Root>
  );
}

function MenuItem({ icon, label, hint, hook, onClick }: { icon: React.ReactNode; label: string; hint: string; hook: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      data-project={hook}
      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-white/5"
    >
      <span className="mt-0.5" style={{ color: C.muted }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px]">{label}</span>
        <span className="block text-[10.5px]" style={{ color: C.dim }}>
          {hint}
        </span>
      </span>
    </button>
  );
}
