/**
 * Astraea Header Bar
 * Top navigation with preset switcher, .ork file import/export, and undo/redo controls.
 */

import React, { useRef } from 'react';
import { useRocketStore, PRESETS } from '../store/rocketStore';
import { parseOrkFile, exportToOrk } from '../formats/orkParser';
import { parseRktString } from '../formats/rktParser';
import { InteropExportPanel } from './InteropExportPanel';
import {
  Upload,
  Download,
  RotateCcw,
  RotateCw,
  FolderOpen,
  FileCode,
  Flame,
} from 'lucide-react';

export type StudioId = 'cad' | 'propulsion' | 'trajectory' | 'evidence';

interface HeaderProps {
  onOpenSim?: () => void;
  studio?: StudioId;
  onStudioChange?: (studio: StudioId) => void;
}

const STUDIO_TABS: Array<{ id: StudioId; label: string; title: string }> = [
  { id: 'cad', label: 'CAD', title: 'Airframe CAD studio' },
  { id: 'propulsion', label: 'Propulsion', title: 'Propulsion & motor studio' },
  { id: 'trajectory', label: 'Trajectory', title: 'Trajectory & weather studio' },
  { id: 'evidence', label: 'Evidence', title: 'Recovery & flight evidence studio' },
];

export const Header: React.FC<HeaderProps> = ({ onOpenSim, studio = 'cad', onStudioChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vehicle = useRocketStore((s) => s.vehicle);
  const setVehicle = useRocketStore((s) => s.setVehicle);
  const loadPreset = useRocketStore((s) => s.loadPreset);
  const undo = useRocketStore((s) => s.undo);
  const redo = useRocketStore((s) => s.redo);
  const historyLen = useRocketStore((s) => s.history.length);
  const futureLen = useRocketStore((s) => s.future.length);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      if (file.name.endsWith('.rkt')) {
        const text = new TextDecoder().decode(buffer);
        const imported = parseRktString(text);
        setVehicle(imported);
      } else if (file.name.endsWith('.json')) {
        const text = new TextDecoder().decode(buffer);
        const parsed = JSON.parse(text);
        setVehicle(parsed);
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
    const jsonStr = JSON.stringify(vehicle, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${vehicle.name.toLowerCase().replace(/\s+/g, '-')}.astraea.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="h-14 bg-zinc-900/90 border-b border-zinc-800 px-4 flex items-center justify-between z-30 select-none backdrop-blur-md">
      {/* Brand & Project Name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold shadow-sm">
            🚀
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white font-mono text-base">ASTRAEA</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                v0.1.0-alpha
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">Unified Rocket Engineering Environment</p>
          </div>
        </div>

        <div className="h-5 w-px bg-zinc-800 mx-1 hidden md:block" />

        {/* Vehicle Name Input */}
        <div className="hidden md:flex items-center gap-1.5">
          <input
            type="text"
            value={vehicle.name}
            onChange={(e) => useRocketStore.getState().updateVehicleName(e.target.value)}
            className="bg-zinc-800/60 hover:bg-zinc-800 text-zinc-100 text-xs px-2.5 py-1 rounded border border-zinc-700/60 focus:border-cyan-500 focus:outline-none transition font-medium w-48"
            placeholder="Vehicle Name"
          />
        </div>
      </div>

      {/* Center Presets Dropdown */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-zinc-800/60 p-1 rounded-lg border border-zinc-700/60 text-xs text-zinc-300">
          <FolderOpen className="w-3.5 h-3.5 text-zinc-400 ml-1.5" />
          <span className="text-[11px] text-zinc-400">Preset:</span>
          <select
            onChange={(e) => loadPreset(e.target.value)}
            className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer pr-2 font-medium"
            defaultValue="estes_alpha"
          >
            {Object.entries(PRESETS).map(([key, p]) => (
              <option key={key} value={key} className="bg-zinc-900 text-zinc-200">
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {/* Studio mode switcher */}
        <div className="flex items-center gap-0.5 ml-2 bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-700/60" role="tablist" aria-label="Studio modes">
          {STUDIO_TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={studio === tab.id}
              onClick={() => onStudioChange?.(tab.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition ${
                studio === tab.id
                  ? 'bg-cyan-500/25 text-cyan-200'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60'
              }`}
              title={tab.title}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-1 ml-2 bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-700/60">
          <button
            onClick={undo}
            disabled={historyLen === 0}
            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={futureLen === 0}
            className="p-1.5 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="Redo (Ctrl+Y)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right Action Buttons */}
        {onOpenSim && (
          <button
            onClick={onOpenSim}
            className="px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 text-xs font-semibold rounded-lg border border-amber-500/40 transition flex items-center gap-1.5 shadow-sm hover:scale-105 active:scale-95 cursor-pointer"
            title="Run 6-DOF Flight Trajectory Simulation & High-Mach Aerodynamic Analysis"
          >
            <Flame className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />
            <span>Flight Sim</span>
          </button>
        )}

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".ork,.rkt,.json"
          onChange={handleFileUpload}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 transition flex items-center gap-1.5 shadow-sm"
          title="Import OpenRocket (.ork), RockSim (.rkt), or Astraea JSON"
        >
          <Upload className="w-3.5 h-3.5 text-zinc-400" />
          <span className="hidden sm:inline">Import .ork / .rkt</span>
        </button>
        <InteropExportPanel vehicle={vehicle} />

        <div className="flex items-center rounded-lg border border-cyan-500/30 overflow-hidden shadow-sm">
          <button
            onClick={handleExportOrk}
            className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-medium transition flex items-center gap-1.5"
            title="Export to OpenRocket (.ork) Archive"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export .ork</span>
          </button>
          <button
            onClick={handleExportJson}
            className="px-2 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs border-l border-cyan-500/30 transition"
            title="Export Astraea JSON Specification"
          >
            <FileCode className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
