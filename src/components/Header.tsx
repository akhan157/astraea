/**
 * Astraea Header Bar
 * Top navigation with preset switcher, .ork file import/export, and undo/redo controls.
 */

import React, { useRef, useState } from 'react';
import { useRocketStore, PRESETS } from '../store/rocketStore';
import { parseOrkFile, exportToOrk } from '../formats/orkParser';
import { parseRktString } from '../formats/rktParser';
import { parseRaspEng, parseRseXml } from '../formats/engParser';
import {
  createProjectEnvelope,
  readProject,
  writeProject,
  type MotorRecord,
} from '../formats/projectJson';
import { createDurableProject } from '../formats/projectStorage';
import { InteropExportPanel } from './InteropExportPanel';
import {
  Upload,
  Download,
  RotateCcw,
  RotateCw,
  FolderOpen,
  FileCode,
  Flame,
  Rocket,
} from 'lucide-react';

interface HeaderProps {
  /** RIVAL S2: explicit Run — drives the inline trajectory ensemble, never a modal. */
  onRun?: () => void;
}

/**
 * The workstation's single durable project slot. Module scope so the revision
 * base survives component remounts within a session; the store re-reads the
 * backend on every load/save, so a commit made in another tab is never clobbered.
 */
const durableProject = createDurableProject();

export const Header: React.FC<HeaderProps> = ({ onRun }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vehicle = useRocketStore((s) => s.vehicle);
  const setVehicle = useRocketStore((s) => s.setVehicle);
  const loadPreset = useRocketStore((s) => s.loadPreset);
  // Controlled preset select (Round-19): the displayed key is DERIVED from
  // the current vehicle by id, so every vehicle source — preset load, .ork/
  // .rkt/.json import, drag-drop, undo/redo — reflects itself. A preset
  // switch replaces the vehicle and thereby resets downstream state: App
  // remounts TrajectoryStudio (key={vehicle.id}, clearing wind rows, probe,
  // sounding, and MC results) and FlightSim results go STALE (the vehicle is
  // part of the simulation input key). A stale preset name is never shown
  // for a vehicle that is no longer that preset.
  const currentPresetKey = Object.keys(PRESETS).find((key) => PRESETS[key].id === vehicle.id) ?? '';
  const importCustomMotor = useRocketStore((s) => s.importCustomMotor);
  const undo = useRocketStore((s) => s.undo);
  const redo = useRocketStore((s) => s.redo);
  const historyLen = useRocketStore((s) => s.history.length);
  const futureLen = useRocketStore((s) => s.future.length);

  /**
   * Session custom motors as envelope motor records. The store's only
   * production writer is this header's `.eng`/`.rse` import path, so the
   * honest provenance label is 'import' — no other origin is claimed.
   */
  const customMotorRecords = (): MotorRecord[] =>
    Object.values(useRocketStore.getState().customMotors).map((motor) => ({
      id: motor.id,
      motor,
      provenance: { source: 'import' as const },
    }));

  /**
   * Re-register an imported envelope's non-certified motor records so a
   * reloaded project's bound custom motors stay usable. Certified records are
   * already in the bundled library and are skipped. If a restored id collides
   * with a different designation the store suffixes it, in which case the
   * vehicle reference is left dangling (visible as unresolvable) rather than
   * being silently rebound to the wrong motor.
   */
  const restoreMotorRecords = (records: MotorRecord[]) => {
    for (const rec of records) {
      if (rec.provenance.source === 'certified') continue;
      importCustomMotor(rec.motor);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      if (file.name.endsWith('.eng')) {
        const motor = parseRaspEng(new TextDecoder().decode(buffer));
        importCustomMotor(motor);
        alert(`Imported motor ${motor.designation} (${motor.totalImpulse.toFixed(1)} N·s) — see Propulsion studio`);
      } else if (file.name.endsWith('.rse')) {
        const motor = parseRseXml(new TextDecoder().decode(buffer));
        importCustomMotor(motor);
        alert(`Imported motor ${motor.designation} (${motor.totalImpulse.toFixed(1)} N·s) — see Propulsion studio`);
      } else if (file.name.endsWith('.rkt')) {
        const text = new TextDecoder().decode(buffer);
        const imported = parseRktString(text);
        setVehicle(imported);
      } else if (file.name.endsWith('.json')) {
        const text = new TextDecoder().decode(buffer);
        // S3-lite cutover: the versioned envelope reader validates and migrates
        // (legacy bare vehicle included) and fails closed on unknown versions
        // or structural violations, instead of an unchecked JSON.parse.
        const project = readProject(text);
        setVehicle(project.vehicle);
        restoreMotorRecords(project.motorRecords);
      } else {
        const imported = await parseOrkFile(buffer);
        setVehicle(imported);
      }
    } catch (err) {
      alert(`Failed to load file: ${(err as Error).message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportOrk = async () => {
    try {
      const bytes = await exportToOrk(vehicle);
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${vehicle.name.toLowerCase().replace(/\s+/g, '-')}.ork`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${(err as Error).message}`);
    }
  };

  const handleExportJson = () => {
    try {
      // Export the versioned envelope (vehicle + motor records + bindings)
      // rather than the bare vehicle, so a reload keeps custom motors usable.
      const project = createProjectEnvelope({ vehicle, motorRecords: customMotorRecords() });
      const jsonStr = writeProject(project);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${vehicle.name.toLowerCase().replace(/\s+/g, '-')}.astraea.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${(err as Error).message}`);
    }
  };

  const [projectStatus, setProjectStatus] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  /** Commit the current vehicle + session motors to the durable local slot. */
  const handleSaveProject = () => {
    try {
      const project = createProjectEnvelope({ vehicle, motorRecords: customMotorRecords() });
      const committed = durableProject.save(project);
      setProjectError(null);
      setProjectStatus(`Saved locally (revision ${committed.revision})`);
    } catch (err) {
      setProjectStatus(null);
      setProjectError(`Save failed: ${(err as Error).message}`);
    }
  };

  /** Replace the workspace with the durable local project, or report why not. */
  const handleOpenProject = () => {
    try {
      const stored = durableProject.load();
      if (stored === null) {
        setProjectError(null);
        setProjectStatus('No project saved in this browser yet');
        return;
      }
      setVehicle(stored.vehicle);
      restoreMotorRecords(stored.motorRecords);
      setProjectError(null);
      setProjectStatus(`Opened saved project (revision ${stored.revision})`);
    } catch (err) {
      setProjectStatus(null);
      setProjectError(`Open failed: ${(err as Error).message}`);
    }
  };

  return (
    <header className="h-14 bg-[#08090A] border-b border-white/8 px-4 flex items-center justify-between z-30 select-none">
      {/* Brand & Project Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center text-zinc-200">
            <Rocket className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-base">ASTRAEA</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-zinc-400 border border-white/8">
                v0.1.0-alpha
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">Unified Rocket Engineering Environment</p>
          </div>
        </div>

        <div className="h-5 w-px bg-white/8 mx-1 hidden md:block" />

        {/* Vehicle Name Input */}
        <div className="hidden md:flex items-center gap-1.5">
          <input
            type="text"
            value={vehicle.name}
            onChange={(e) => useRocketStore.getState().updateVehicleName(e.target.value)}
            className="bg-white/5 hover:bg-white/10 text-zinc-100 text-xs px-2.5 py-1 rounded-md border border-white/8 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4C8DFF] transition-colors font-medium w-48"
            placeholder="Vehicle Name"
          />
        </div>
      </div>

      {/* Center Presets Dropdown */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-md border border-white/8 text-xs text-zinc-300">
          <FolderOpen className="w-3.5 h-3.5 text-zinc-400 ml-1.5" />
          <span className="text-[11px] text-zinc-400">Preset:</span>
          <select
            value={currentPresetKey}
            onChange={(e) => loadPreset(e.target.value)}
            aria-label="Vehicle preset"
            className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer pr-2 font-medium"
          >
            <option value="" disabled className="bg-zinc-900 text-zinc-500">
              Custom / imported
            </option>
            {Object.entries(PRESETS).map(([key, p]) => (
              <option key={key} value={key} className="bg-zinc-900 text-zinc-200">
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {/* Undo / Redo */}
        <div className="flex items-center gap-1 ml-2 bg-white/5 p-0.5 rounded-md border border-white/8">
          <button
            onClick={undo}
            disabled={historyLen === 0}
            className="p-1.5 rounded-md hover:bg-white/10 text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={futureLen === 0}
            className="p-1.5 rounded-md hover:bg-white/10 text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="Redo (Ctrl+Y)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right Action Buttons: routine simulation runs inline in Trajectory
          (RIVAL S2 replaces the flight modal — no modal entry point remains). */}
      {onRun && (
        <button
          type="button"
          onClick={onRun}
          data-run-inline="true"
          className="px-3 py-1.5 bg-white hover:bg-zinc-200 text-black text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
          title="Run routine simulation inline in Trajectory (Ctrl+Enter)"
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Run ⏎</span>
        </button>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".ork,.rkt,.json,.eng,.rse"
          onChange={handleFileUpload}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-medium rounded-md border border-white/8 transition-colors flex items-center gap-1.5"
          title="Import OpenRocket (.ork), RockSim (.rkt), or Astraea JSON"
        >
          <Upload className="w-3.5 h-3.5 text-zinc-400" />
          <span className="hidden sm:inline">Import .ork / .rkt</span>
        </button>
        <InteropExportPanel vehicle={vehicle} />

        <div className="flex items-center rounded-md border border-white/8 overflow-hidden">
          <button
            onClick={handleSaveProject}
            data-project-save="true"
            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-medium transition-colors"
            title="Save the current project to this browser (revisioned; refuses to clobber a newer commit)"
          >
            Save
          </button>
          <button
            onClick={handleOpenProject}
            data-project-open="true"
            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-medium border-l border-white/8 transition-colors"
            title="Open the project saved in this browser"
          >
            Open
          </button>
        </div>

        {(projectStatus || projectError) && (
          <span
            role={projectError ? 'alert' : 'status'}
            data-project-status={projectError ? 'error' : 'ok'}
            className={`max-w-[14rem] truncate text-[11px] ${projectError ? 'text-rose-300' : 'text-zinc-400'}`}
            title={projectError ?? projectStatus ?? undefined}
          >
            {projectError ?? projectStatus}
          </span>
        )}

        <div className="flex items-center rounded-md border border-white/8 overflow-hidden">
          <button
            onClick={handleExportOrk}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Export to OpenRocket (.ork) Archive"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .ork</span>
          </button>
          <button
            onClick={handleExportJson}
            className="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-200 text-xs border-l border-white/8 transition-colors"
            title="Export Astraea JSON Specification"
          >
            <FileCode className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
