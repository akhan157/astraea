/**
 * Astraea Main Application Layout
 * Full workstation layout integrating Header, ComponentTree, 3D Canvas, MetricHUD, and PropertyInspector.
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ComponentTree } from './components/ComponentTree';
import { RocketCanvas } from './viewport/RocketCanvas';
import { MetricHUD } from './components/MetricHUD';
import { PropertyInspector } from './components/PropertyInspector';
import { FlightSimulationTab } from './components/FlightSimulationTab';
import { useRocketStore } from './store/rocketStore';
import { parseOrkFile } from './formats/orkParser';
import { parseRktString } from './formats/rktParser';
import { UploadCloud } from 'lucide-react';

export const App: React.FC = () => {
  const setVehicle = useRocketStore((s) => s.setVehicle);
  const undo = useRocketStore((s) => s.undo);
  const redo = useRocketStore((s) => s.redo);
  const setViewMode = useRocketStore((s) => s.setViewMode);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isSimOpen, setIsSimOpen] = useState(false);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing when typing inside an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === '1') {
        setViewMode('solid');
      } else if (e.key === '2') {
        setViewMode('wireframe');
      } else if (e.key === '3') {
        setViewMode('xray');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, setViewMode]);

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
      {/* Top Header Bar */}
      <Header onOpenSim={() => setIsSimOpen(true)} />

      {/* Main Workstation Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Axial Assembly Sidebar */}
        <ComponentTree />

        {/* Center 3D Interactive Viewport with Floating Metric HUD */}
        <main className="flex-1 relative h-full">
          <MetricHUD />
          <RocketCanvas />
        </main>

        {/* Right Parametric Properties Inspector */}
        <PropertyInspector />
      </div>

      {/* Full-Screen Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 bg-cyan-950/80 backdrop-blur-md border-4 border-dashed border-cyan-400 z-50 flex flex-col items-center justify-center pointer-events-none">
          <UploadCloud className="w-16 h-16 text-cyan-400 animate-bounce mb-4" />
          <h2 className="text-2xl font-bold text-white tracking-tight">Drop OpenRocket (.ork), RockSim (.rkt), or Astraea JSON</h2>
          <p className="text-sm text-cyan-300/80 mt-1">Direct client-side file parsing and instant 3D CAD reconstruction</p>
        </div>
      )}

      {/* 6-DOF Flight Simulation & Transonic Aero Dashboard Modal */}
      <FlightSimulationTab isOpen={isSimOpen} onClose={() => setIsSimOpen(false)} />
    </div>
  );
};
