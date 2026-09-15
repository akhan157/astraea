/**
 * Astraea Main Application Layout
 * RIVAL S2 — precision/canvas-led workstation shell (five studios, precision
 * context bar, contextual panes) with global drag-drop import. Routine
 * simulation runs inline in Trajectory — no modal (the flight-sim modal
 * entry point is gone; FlightSimulationTab file is kept for S4).
 * Studio state lives in workspaceStore; selection lives in rocketStore and
 * is preserved across studio switches.
 */

import React, { useState } from 'react';
import { WorkstationShell } from './components/workstation/WorkstationShell';
import { useRocketStore } from './store/rocketStore';
import { parseOrkFile } from './formats/orkParser';
import { parseRktString } from './formats/rktParser';
import { UploadCloud } from 'lucide-react';
export const App: React.FC = () => {
  const setVehicle = useRocketStore((s) => s.setVehicle);

  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Global Drag & Drop File Handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFile(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);

    const file = e.dataTransfer.files?.[0];
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
      alert(`Could not load OpenRocket file: ${(err as Error).message}`);
    }
  };

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <WorkstationShell />

      {/* Full-Screen Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 bg-cyan-950/80 backdrop-blur-md border-4 border-dashed border-cyan-400 z-50 flex flex-col items-center justify-center pointer-events-none">
          <UploadCloud className="w-16 h-16 text-cyan-400 animate-bounce mb-4" />
          <h2 className="text-2xl font-bold text-white tracking-tight">Drop OpenRocket (.ork), RockSim (.rkt), or Astraea JSON</h2>
          <p className="text-sm text-cyan-300/80 mt-1">Direct client-side file parsing and instant 3D CAD reconstruction</p>
        </div>
      )}

      {/* Routine simulation runs inline in Trajectory (RIVAL S2); no modal remains. */}
    </div>
  );
};