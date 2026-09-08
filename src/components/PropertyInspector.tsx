/**
 * Astraea Property Inspector Sidebar
 * Live parametric dimensions, material specifications, and physics contributions editor.
 */

import React from 'react';
import { useRocketStore } from '../store/rocketStore';
import {
  STANDARD_MATERIALS,
  NoseconeShape,
  FinCrossSection,
  NoseconeComponent,
  BodyTubeComponent,
  TransitionComponent,
  TrapezoidFinSetComponent,
  EllipticalFinSetComponent,
  ParachuteComponent,
  MassComponent,
} from '../core/types';
import { Sliders, Activity, Gauge } from 'lucide-react';
import { computeTrapezoidFinFlutter, computeEllipticalFinFlutter } from '../aero/finFlutter';

const COLOR_PRESETS = [
  '#ffffff', // White
  '#ef4444', // Red
  '#38bdf8', // Cyan
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#27272a', // Dark Zinc
  '#71717a', // Metallic Gray
];

export const PropertyInspector: React.FC = () => {
  const vehicle = useRocketStore((s) => s.vehicle);
  const selectedComponentId = useRocketStore((s) => s.selectedComponentId);
  const updateComponent = useRocketStore((s) => s.updateComponent);
  const stability = useRocketStore((s) => s.stability);

  const selectedComp = vehicle.components.find((c) => c.id === selectedComponentId);
  const contrib = stability.contributions.find((c) => c.id === selectedComponentId);

  if (!selectedComp) {
    return (
      <aside className="w-80 bg-zinc-900/90 border-l border-zinc-800 flex flex-col h-[calc(100vh-3.5rem)] z-20 p-6 items-center justify-center text-center text-zinc-500 backdrop-blur-md">
        <Sliders className="w-8 h-8 stroke-1 mb-2 opacity-40" />
        <p className="text-xs">Select a component from the 3D viewport or the assembly tree to edit properties.</p>
      </aside>
    );
  }

  const handleUpdate = (updates: Record<string, unknown>) => {
    updateComponent(selectedComp.id, updates);
  };

  return (
    <aside className="w-80 bg-zinc-900/90 border-l border-zinc-800 flex flex-col h-[calc(100vh-3.5rem)] z-20 backdrop-blur-md overflow-hidden select-none">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">Properties</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 font-mono text-cyan-400 uppercase">
          {selectedComp.type}
        </span>
      </div>

      {/* Inspector Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Component Name */}
        <div>
          <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Component Name</label>
          <input
            type="text"
            value={selectedComp.name}
            onChange={(e) => handleUpdate({ name: e.target.value })}
            className="w-full bg-zinc-800/80 text-zinc-100 px-2.5 py-1.5 rounded-lg border border-zinc-700/80 focus:border-cyan-500 focus:outline-none font-medium"
          />
        </div>

        {/* Material Selection */}
        <div>
          <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Airframe Material</label>
          <select
            value={selectedComp.materialId}
            onChange={(e) => handleUpdate({ materialId: e.target.value })}
            className="w-full bg-zinc-800/80 text-zinc-100 px-2.5 py-1.5 rounded-lg border border-zinc-700/80 focus:border-cyan-500 focus:outline-none font-medium cursor-pointer"
          >
            {Object.values(STANDARD_MATERIALS).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.density} kg/m³)
              </option>
            ))}
          </select>
        </div>

        {/* Color Styling */}
        <div>
          <label className="text-[11px] font-medium text-zinc-400 mb-1.5 block">Airframe Finish Color</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                onClick={() => handleUpdate({ color })}
                className={`w-6 h-6 rounded-full border transition ${
                  selectedComp.color === color ? 'border-cyan-400 ring-2 ring-cyan-400/30' : 'border-zinc-700 hover:scale-110'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
            <input
              type="color"
              value={selectedComp.color || '#ffffff'}
              onChange={(e) => handleUpdate({ color: e.target.value })}
              className="w-6 h-6 rounded-full border border-zinc-700 cursor-pointer bg-transparent"
              title="Custom Hex Color"
            />
          </div>
        </div>

        <div className="h-px bg-zinc-800 my-2" />

        {/* Component-Specific Parametric Geometry Controls */}
        {selectedComp.type === 'nosecone' && (
          <NoseconeControls
            comp={selectedComp as NoseconeComponent}
            onChange={handleUpdate}
          />
        )}

        {selectedComp.type === 'bodytube' && (
          <BodyTubeControls
            comp={selectedComp as BodyTubeComponent}
            onChange={handleUpdate}
          />
        )}

        {selectedComp.type === 'transition' && (
          <TransitionControls
            comp={selectedComp as TransitionComponent}
            onChange={handleUpdate}
          />
        )}

        {selectedComp.type === 'trapezoidfinset' && (
          <TrapezoidFinControls
            comp={selectedComp as TrapezoidFinSetComponent}
            onChange={handleUpdate}
          />
        )}

        {selectedComp.type === 'ellipticalfinset' && (
          <EllipticalFinControls
            comp={selectedComp as EllipticalFinSetComponent}
            onChange={handleUpdate}
          />
        )}

        {selectedComp.type === 'parachute' && (
          <ParachuteControls
            comp={selectedComp as ParachuteComponent}
            onChange={handleUpdate}
          />
        )}

        {selectedComp.type === 'masscomponent' && (
          <MassComponentControls
            comp={selectedComp as MassComponent}
            onChange={handleUpdate}
          />
        )}

        <div className="h-px bg-zinc-800 my-2" />

        {/* Mass Override */}
        <div className="p-3 bg-zinc-800/40 rounded-xl border border-zinc-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-300">Explicit Mass Override</span>
            <input
              type="checkbox"
              checked={selectedComp.massOverride !== undefined && selectedComp.massOverride > 0}
              onChange={(e) => {
                if (!e.target.checked) {
                  handleUpdate({ massOverride: undefined });
                } else {
                  handleUpdate({ massOverride: contrib ? contrib.mass : 0.05 });
                }
              }}
              className="rounded accent-cyan-500 cursor-pointer"
            />
          </div>
          {selectedComp.massOverride !== undefined && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span>Scale Measured Mass</span>
                <span className="font-mono text-cyan-400 font-bold">
                  {(selectedComp.massOverride * 1000).toFixed(1)} g
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="5000"
                step="1"
                value={selectedComp.massOverride * 1000}
                onChange={(e) => handleUpdate({ massOverride: parseFloat(e.target.value) / 1000 })}
                className="w-full accent-cyan-500"
              />
            </div>
          )}
        </div>

        {/* Live Physics Feedback Contribution Panel */}
        {contrib && (
          <div className="p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 space-y-1.5 font-mono text-[11px]">
            <div className="flex items-center gap-1.5 text-zinc-400 mb-1 font-sans font-semibold text-xs">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Calculated Component Physics</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Component Mass:</span>
              <span className="text-zinc-200 font-bold">
                {contrib.mass < 1 ? (contrib.mass * 1000).toFixed(1) + ' g' : contrib.mass.toFixed(3) + ' kg'}
              </span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Center of Gravity (CG):</span>
              <span className="text-zinc-200">{(contrib.cg * 1000).toFixed(1)} mm</span>
            </div>
            {contrib.cp !== undefined && (
              <div className="flex justify-between text-zinc-400">
                <span>Center of Pressure (CP):</span>
                <span className="text-zinc-200">{(contrib.cp * 1000).toFixed(1)} mm</span>
              </div>
            )}
            {contrib.cna !== undefined && (
              <div className="flex justify-between text-zinc-400">
                <span>Normal Force (CNa):</span>
                <span className="text-zinc-200">{contrib.cna.toFixed(2)} /rad</span>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

// Sub-components for property controls

interface ControlProps<T> {
  comp: T;
  onChange: (updates: Record<string, unknown>) => void;
}

const SliderInput: React.FC<{
  label: string;
  value: number; // in meters
  min: number;   // in mm
  max: number;   // in mm
  step?: number;
  onChange: (valInMeters: number) => void;
}> = ({ label, value, min, max, step = 1, onChange }) => {
  const mmVal = value * 1000;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400 font-medium">{label}</span>
        <div className="flex items-center gap-1 font-mono">
          <input
            type="number"
            value={mmVal.toFixed(1)}
            step={step}
            onChange={(e) => onChange(Math.max(0.001, parseFloat(e.target.value) || 0) / 1000)}
            className="w-16 bg-zinc-800 text-zinc-100 px-1.5 py-0.5 rounded text-right border border-zinc-700/80 focus:border-cyan-500 focus:outline-none"
          />
          <span className="text-zinc-500 text-[10px]">mm</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={mmVal}
        onChange={(e) => onChange(parseFloat(e.target.value) / 1000)}
        className="w-full accent-cyan-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
      />
    </div>
  );
};

const NoseconeControls: React.FC<ControlProps<NoseconeComponent>> = ({ comp, onChange }) => (
  <div className="space-y-3">
    <div>
      <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Aerodynamic Profile</label>
      <select
        value={comp.shape}
        onChange={(e) => onChange({ shape: e.target.value as NoseconeShape })}
        className="w-full bg-zinc-800/80 text-zinc-100 px-2.5 py-1.5 rounded-lg border border-zinc-700/80 focus:border-cyan-500 focus:outline-none font-medium cursor-pointer"
      >
        <option value="ogive">Tangent Ogive (Classic Subsonic)</option>
        <option value="vonkarman">Von Kármán (Supersonic Minimal Drag)</option>
        <option value="conical">Conical (High Mach Blunt)</option>
        <option value="parabolic">Parabolic (Low Transonic Wave Drag)</option>
        <option value="elliptical">Elliptical</option>
      </select>
    </div>

    <SliderInput
      label="Nosecone Length"
      value={comp.length}
      min={20}
      max={1200}
      onChange={(length) => onChange({ length })}
    />

    <SliderInput
      label="Base Diameter"
      value={comp.baseDiameter}
      min={10}
      max={300}
      onChange={(baseDiameter) => onChange({ baseDiameter })}
    />

    <SliderInput
      label="Wall Thickness"
      value={comp.wallThickness}
      min={0.5}
      max={15}
      step={0.5}
      onChange={(wallThickness) => onChange({ wallThickness })}
    />
  </div>
);

const BodyTubeControls: React.FC<ControlProps<BodyTubeComponent>> = ({ comp, onChange }) => (
  <div className="space-y-3">
    <SliderInput
      label="Tube Length"
      value={comp.length}
      min={50}
      max={3000}
      onChange={(length) => onChange({ length })}
    />

    <SliderInput
      label="Outer Diameter"
      value={comp.outerDiameter}
      min={10}
      max={300}
      onChange={(outerDiameter) => {
        const inner = Math.max(0.001, outerDiameter - 0.003);
        onChange({ outerDiameter, innerDiameter: inner });
      }}
    />

    <SliderInput
      label="Inner Diameter"
      value={comp.innerDiameter}
      min={8}
      max={298}
      onChange={(innerDiameter) => onChange({ innerDiameter })}
    />
  </div>
);

const TransitionControls: React.FC<ControlProps<TransitionComponent>> = ({ comp, onChange }) => (
  <div className="space-y-3">
    <SliderInput
      label="Transition Length"
      value={comp.length}
      min={10}
      max={500}
      onChange={(length) => onChange({ length })}
    />

    <SliderInput
      label="Fore Diameter"
      value={comp.foreDiameter}
      min={10}
      max={300}
      onChange={(foreDiameter) => onChange({ foreDiameter })}
    />

    <SliderInput
      label="Aft Diameter"
      value={comp.aftDiameter}
      min={10}
      max={300}
      onChange={(aftDiameter) => onChange({ aftDiameter })}
    />
  </div>
);

const TrapezoidFinControls: React.FC<ControlProps<TrapezoidFinSetComponent>> = ({ comp, onChange }) => {
  const flutter = computeTrapezoidFinFlutter(comp);

  return (
    <div className="space-y-3">
      {/* NACA TN 4197 Fin Flutter Boundary Card */}
      <div className="p-3 bg-zinc-950/70 rounded-xl border border-zinc-800/80 space-y-1.5 font-mono text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-zinc-300 font-sans font-semibold flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            <span>Flutter Limit (NACA 4197)</span>
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${
              flutter.isFlutterRiskSubsonic
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {flutter.isFlutterRiskSubsonic ? 'Subsonic Risk' : 'Flutter Safe'}
          </span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>Critical Speed (V_f):</span>
          <span className="text-zinc-100 font-bold">
            {flutter.flutterVelocity.toFixed(0)} m/s (M {flutter.flutterMach.toFixed(2)})
          </span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>Safe Speed (1.25x / 1.50x SF):</span>
          <span className="text-cyan-400 font-bold">
            {flutter.safeVelocity125.toFixed(0)} / {flutter.safeVelocity150.toFixed(0)} m/s
          </span>
        </div>
        <p className="text-[9px] text-zinc-500 font-sans leading-tight pt-1 border-t border-zinc-800/60">
          * Preliminary NACA TN 4197 boundary. Joint compliance & composite weave require physical testing.
        </p>
      </div>
    <div>
      <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Fin Count</label>
      <div className="grid grid-cols-3 gap-1.5">
        {[3, 4, 6].map((count) => (
          <button
            key={count}
            onClick={() => onChange({ finCount: count })}
            className={`py-1 rounded border text-xs font-mono font-bold transition ${
              comp.finCount === count
                ? 'bg-cyan-500 text-zinc-950 border-cyan-400 shadow-sm'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {count} Fins
          </button>
        ))}
      </div>
    </div>

    <div>
      <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Fin Cross-Section Foil</label>
      <select
        value={comp.crossSection}
        onChange={(e) => onChange({ crossSection: e.target.value as FinCrossSection })}
        className="w-full bg-zinc-800/80 text-zinc-100 px-2.5 py-1.5 rounded-lg border border-zinc-700/80 focus:border-cyan-500 focus:outline-none font-medium cursor-pointer"
      >
        <option value="square">Square / Flat Plate</option>
        <option value="rounded">Rounded Leading/Trailing Edges</option>
        <option value="airfoil">Streamlined Airfoil Profile</option>
        <option value="double_wedge">Double Wedge (Supersonic)</option>
      </select>
    </div>

    <SliderInput
      label="Root Chord (Cr)"
      value={comp.rootChord}
      min={20}
      max={500}
      onChange={(rootChord) => onChange({ rootChord })}
    />

    <SliderInput
      label="Tip Chord (Ct)"
      value={comp.tipChord}
      min={5}
      max={300}
      onChange={(tipChord) => onChange({ tipChord })}
    />

    <SliderInput
      label="Fin Semispan (Height)"
      value={comp.span}
      min={10}
      max={400}
      onChange={(span) => onChange({ span })}
    />

    <SliderInput
      label="Sweep Length"
      value={comp.sweepLength}
      min={0}
      max={400}
      onChange={(sweepLength) => onChange({ sweepLength })}
    />

    <SliderInput
      label="Fin Thickness"
      value={comp.thickness}
      min={1}
      max={15}
      step={0.5}
      onChange={(thickness) => onChange({ thickness })}
    />

    <SliderInput
      label="Axial Offset Along Parent Tube"
      value={comp.axialOffset}
      min={0}
      max={2000}
      onChange={(axialOffset) => onChange({ axialOffset })}
    />
    </div>
  );
};

const EllipticalFinControls: React.FC<ControlProps<EllipticalFinSetComponent>> = ({ comp, onChange }) => {
  const flutter = computeEllipticalFinFlutter(comp);

  return (
    <div className="space-y-3">
      {/* NACA TN 4197 Fin Flutter Boundary Card */}
      <div className="p-3 bg-zinc-950/70 rounded-xl border border-zinc-800/80 space-y-1.5 font-mono text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-zinc-300 font-sans font-semibold flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            <span>Flutter Limit (NACA 4197)</span>
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${
              flutter.isFlutterRiskSubsonic
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
            }`}
          >
            {flutter.isFlutterRiskSubsonic ? 'Subsonic Risk' : 'Flutter Safe'}
          </span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>Critical Speed (V_f):</span>
          <span className="text-zinc-100 font-bold">
            {flutter.flutterVelocity.toFixed(0)} m/s (M {flutter.flutterMach.toFixed(2)})
          </span>
        </div>
        <div className="flex justify-between text-zinc-400">
          <span>Safe Speed (1.25x / 1.50x SF):</span>
          <span className="text-cyan-400 font-bold">
            {flutter.safeVelocity125.toFixed(0)} / {flutter.safeVelocity150.toFixed(0)} m/s
          </span>
        </div>
        <p className="text-[9px] text-zinc-500 font-sans leading-tight pt-1 border-t border-zinc-800/60">
          * Preliminary NACA TN 4197 boundary. Joint compliance & composite weave require physical testing.
        </p>
      </div>
    <div>
      <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Fin Count</label>
      <div className="grid grid-cols-3 gap-1.5">
        {[3, 4, 6].map((count) => (
          <button
            key={count}
            onClick={() => onChange({ finCount: count })}
            className={`py-1 rounded border text-xs font-mono font-bold transition ${
              comp.finCount === count
                ? 'bg-cyan-500 text-zinc-950 border-cyan-400 shadow-sm'
                : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {count} Fins
          </button>
        ))}
      </div>
    </div>

    <SliderInput
      label="Root Chord"
      value={comp.rootChord}
      min={20}
      max={500}
      onChange={(rootChord) => onChange({ rootChord })}
    />

    <SliderInput
      label="Fin Span (Height)"
      value={comp.span}
      min={10}
      max={400}
      onChange={(span) => onChange({ span })}
    />

    <SliderInput
      label="Fin Thickness"
      value={comp.thickness}
      min={1}
      max={15}
      step={0.5}
      onChange={(thickness) => onChange({ thickness })}
    />

    <SliderInput
      label="Axial Offset Along Parent Tube"
      value={comp.axialOffset}
      min={0}
      max={2000}
      onChange={(axialOffset) => onChange({ axialOffset })}
    />
    </div>
  );
};

const ParachuteControls: React.FC<ControlProps<ParachuteComponent>> = ({ comp, onChange }) => (
  <div className="space-y-3">
    <SliderInput
      label="Canopy Diameter"
      value={comp.diameter}
      min={100}
      max={3000}
      step={25}
      onChange={(diameter) => onChange({ diameter })}
    />

    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400 font-medium">Drag Coefficient (Cd)</span>
        <span className="font-mono text-zinc-200">{comp.cd.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min="0.5"
        max="2.2"
        step="0.05"
        value={comp.cd}
        onChange={(e) => onChange({ cd: parseFloat(e.target.value) })}
        className="w-full accent-cyan-500"
      />
    </div>

    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400 font-medium">Packed Mass</span>
        <span className="font-mono text-zinc-200">{(comp.mass * 1000).toFixed(0)} g</span>
      </div>
      <input
        type="range"
        min="5"
        max="1500"
        step="5"
        value={comp.mass * 1000}
        onChange={(e) => onChange({ mass: parseFloat(e.target.value) / 1000 })}
        className="w-full accent-cyan-500"
      />
    </div>

    <SliderInput
      label="Axial Packing Position"
      value={comp.axialOffset}
      min={0}
      max={1000}
      onChange={(axialOffset) => onChange({ axialOffset })}
    />
  </div>
);

const MassComponentControls: React.FC<ControlProps<MassComponent>> = ({ comp, onChange }) => (
  <div className="space-y-3">
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400 font-medium">Component Mass</span>
        <span className="font-mono text-zinc-200">{(comp.mass * 1000).toFixed(1)} g</span>
      </div>
      <input
        type="range"
        min="1"
        max="2500"
        step="1"
        value={comp.mass * 1000}
        onChange={(e) => onChange({ mass: parseFloat(e.target.value) / 1000 })}
        className="w-full accent-cyan-500"
      />
    </div>

    <SliderInput
      label="Physical Length"
      value={comp.length}
      min={10}
      max={300}
      onChange={(length) => onChange({ length })}
    />

    <SliderInput
      label="Axial Offset Along Parent Tube"
      value={comp.axialOffset}
      min={0}
      max={1500}
      onChange={(axialOffset) => onChange({ axialOffset })}
    />
  </div>
);
