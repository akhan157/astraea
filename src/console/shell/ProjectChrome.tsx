/**
 * Project chrome: the TopBar project menu, the editable vehicle name, the
 * inline import disclosure, the browser-preview notice, and the window-wide
 * drop target.
 *
 * Every message here is inline (role="alert" for a disclosure, role="status"
 * for a save/open outcome) and dismissible where the legacy header was; no
 * modal dialog is opened for a result or an error.
 */

import { useEffect, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { Upload, FolderOpen, Save, FileDown, FileUp, X } from 'lucide-react';
import { isEngineAvailable } from '../../io/backend';
import { OPEN_FILE_ACCEPT } from '../../io/files';
import { useProjectStore, type FileStatus } from '../../state/project';
import { useProjectIo, importProjectFile, openProjectFromFilePicker, openProjectFromSlot, saveProjectToFile, saveProjectToSlot } from '../../state/projectIo';
import { consoleActions, useWS } from '../store';
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

/** Inline import disclosure, dismissible; clears only this report. */
export function ImportReportBanner() {
  const report = useProjectIo((s) => s.report);
  const dismissReport = useProjectIo((s) => s.dismissReport);
  if (report === null) return null;
  return (
    <div
      role="alert"
      data-drop-import-error="true"
      className="flex shrink-0 items-start gap-3 px-3 py-2 text-[12px]"
      style={{ borderBottom: `1px solid ${C.bad}66`, background: 'rgba(74,14,24,.6)', color: '#F6B7C0' }}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{report.title}</p>
        <p className="whitespace-pre-line text-[11px] opacity-80">{report.message}</p>
      </div>
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
      if (file) void importProjectFile(file);
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
  if (file.kind === 'saved') return `local revision ${file.revision}`;
  if (file.kind === 'dirty-unsaved') return 'unsaved changes';
  if (file.kind === 'saving') return 'saving…';
  if (file.kind === 'error') return file.message;
  return 'local slot untouched this session';
}

/** Project menu: import, the durable browser slot, and project files. */
export function ProjectMenu() {
  const status = useProjectIo((s) => s.status);
  const file = useProjectStore((s) => s.file);
  const inputRef = useRef<HTMLInputElement>(null);
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
          className="z-50 w-[320px] rounded-lg p-2 shadow-2xl"
          style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}
        >
          <div className="px-2 pb-1 pt-1.5 text-[10.5px] uppercase tracking-wide" style={{ color: C.dim }}>
            Project
          </div>
          <MenuItem
            icon={<Upload size={13} />}
            label="Import vehicle or motor…"
            hint=".ork, .rkt, .json, .eng, .rse"
            hook="import"
            onClick={() => inputRef.current?.click()}
          />
          <MenuItem
            icon={<FileUp size={13} />}
            label="Open project file…"
            hint="Same readers, through the file picker"
            hook="open-file"
            onClick={() => void openProjectFromFilePicker()}
          />
          <div className="my-1 h-px" style={{ background: C.line }} />
          <div className="px-2 pb-1 pt-1.5 text-[10.5px] uppercase tracking-wide" style={{ color: C.dim }}>
            This browser
          </div>
          <MenuItem
            icon={<Save size={13} />}
            label="Save to this browser"
            hint="Revisioned; refuses to clobber a newer commit"
            hook="save"
            onClick={() => void saveProjectToSlot()}
          />
          <MenuItem
            icon={<FolderOpen size={13} />}
            label="Open saved project"
            hint="Restores the project stored in this browser"
            hook="open"
            onClick={() => void openProjectFromSlot()}
          />
          <MenuItem
            icon={<FileDown size={13} />}
            label="Save project file…"
            hint="Native save dialog, else a download"
            hook="save-file"
            onClick={() => void saveProjectToFile()}
          />
          <div className="mt-2 px-2 py-1.5 text-[11px]" style={{ borderTop: `1px solid ${C.line}`, color: C.muted }}>
            Local slot: {fileStateLabel(file)}
          </div>
          {status !== null && (
            <div
              role="status"
              data-project-status={status.kind}
              className="px-2 pb-1 text-[11.5px]"
              style={{ color: status.kind === 'error' ? C.bad : C.ok }}
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
          if (file) void importProjectFile(file);
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
