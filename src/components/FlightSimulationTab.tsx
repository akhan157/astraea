/**
 * Astraea Flight Simulation & Aerodynamics Telemetry Dashboard
 * Integrates 6-DOF flight dynamics, real motor thrust curves, transonic drag breakdown,
 * and collegiate competition safety verification (rail clearance & landing KE).
 */

import React, { useState, useMemo } from 'react';
import { useRocketStore } from '../store/rocketStore';
import { CERTIFIED_MOTORS, MotorSpec } from '../propulsion/motorDatabase';
import { simulateFlight, SimulationResult } from '../sim/flightSimulator';
import { computeAerodynamicCurves } from '../aero/transonicAero';
import {
  Rocket,
  Play,
  Flame,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';

interface FlightSimulationTabProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FlightSimulationTab: React.FC<FlightSimulationTabProps> = ({ isOpen, onClose }) => {
  const vehicle = useRocketStore((s) => s.vehicle);

  const [selectedMotorId, setSelectedMotorId] = useState<string>('estes_c6');
  const [railLength, setRailLength] = useState<number>(2.4); // meters
  const [mainDeployAlt, setMainDeployAlt] = useState<number>(250); // meters AGL
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);

  // Auto-select suitable default motor based on vehicle mass
  const activeMotor: MotorSpec = CERTIFIED_MOTORS[selectedMotorId] || CERTIFIED_MOTORS.estes_c6;

  // Precompute high-Mach aerodynamic curve
  const aeroCurves = useMemo(() => {
    return computeAerodynamicCurves(vehicle, false, 30);
  }, [vehicle]);

  const handleRunSimulation = () => {
    const res = simulateFlight(vehicle, activeMotor, {
      railLength,
      mainDeployAltitudeAGL: mainDeployAlt,
    });
    setSimResult(res);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
      <div className="w-full max-w-5xl max-h-[92vh] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Flight Dynamics & Aerodynamic Solver
              </h2>
              <p className="text-xs text-zinc-400">
                6-DOF Numerical Trajectory, High-Mach Drag Breakdown, and Competition Gates
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-zinc-200">
          {/* Top Configuration Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            {/* Motor Selection */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Rocket Motor Selection</span>
              </label>
              <select
                value={selectedMotorId}
                onChange={(e) => setSelectedMotorId(e.target.value)}
                className="w-full bg-zinc-800 text-zinc-100 px-3 py-2 rounded-lg border border-zinc-700 focus:border-cyan-500 focus:outline-none font-medium cursor-pointer"
              >
                {Object.values(CERTIFIED_MOTORS).map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.impulseClass}] {m.designation} — {m.totalImpulse} Ns (⌀{(m.diameter * 1000).toFixed(0)}mm)
                  </option>
                ))}
              </select>
            </div>

            {/* Launch Rail Length */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400 font-semibold">Launch Rail</span>
                <span className="font-mono text-cyan-400">{railLength.toFixed(1)} m ({(railLength * 3.28084).toFixed(1)} ft)</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.2"
                value={railLength}
                onChange={(e) => setRailLength(parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>

            {/* Main Chute Deploy Altitude */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-400 font-semibold">Main Deploy AGL</span>
                <span className="font-mono text-cyan-400">{mainDeployAlt} m</span>
              </div>
              <input
                type="range"
                min="100"
                max="500"
                step="25"
                value={mainDeployAlt}
                onChange={(e) => setMainDeployAlt(parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-center">
            <button
              onClick={handleRunSimulation}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-zinc-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Simulate Flight Trajectory</span>
            </button>
          </div>

          {/* Simulation Output KPIs */}
          {simResult && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Primary Flight Metrics Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Apogee Altitude</div>
                  <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                    {simResult.apogeeAltitude.toFixed(0)} m
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    {(simResult.apogeeAltitude * 3.28084).toFixed(0)} ft
                  </div>
                </div>

                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Max Velocity</div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                    {simResult.maxVelocity.toFixed(0)} m/s
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    Mach {simResult.maxMach.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Max Acceleration</div>
                  <div className="text-lg font-bold font-mono text-amber-400 mt-1">
                    {simResult.maxAccelerationG.toFixed(1)} G
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    {(simResult.maxAccelerationG * 9.81).toFixed(0)} m/s²
                  </div>
                </div>

                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Rail Exit Velocity</div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1 flex items-center gap-1">
                    {simResult.railExitVelocity.toFixed(1)} m/s
                    {simResult.isRailExitSafe ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono">
                    {simResult.isRailExitSafe ? '>= 15 m/s (SAFE)' : 'LOW CLEARANCE'}
                  </div>
                </div>

                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Touchdown Speed</div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                    {simResult.landingVelocity.toFixed(1)} m/s
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    Flight: {simResult.flightDuration.toFixed(1)} s
                  </div>
                </div>

                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Touchdown Energy</div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1 flex items-center gap-1">
                    {simResult.landingKineticEnergy.toFixed(1)} J
                    {simResult.isLandingSafe ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono">
                    {simResult.isLandingSafe ? '<= 20 J (CERTIFIED)' : 'HIGH IMPACT'}
                  </div>
                </div>
              </div>

              {/* Graphical Curves Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* SVG Flight Profile: Altitude & Velocity vs Time */}
                <div className="p-4 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-zinc-200">Flight Profile: Altitude (AGL) & Velocity</span>
                    <span className="text-[10px] font-mono text-zinc-500">Euler-Cromer ODE Integrator</span>
                  </div>
                  <div className="h-44 w-full bg-zinc-900/60 rounded-lg p-2 relative flex items-center justify-center">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 400 140">
                      {/* Grid Lines */}
                      <line x1="40" y1="20" x2="390" y2="20" stroke="#27272a" strokeDasharray="3" />
                      <line x1="40" y1="70" x2="390" y2="70" stroke="#27272a" strokeDasharray="3" />
                      <line x1="40" y1="120" x2="390" y2="120" stroke="#3f3f46" />
                      <line x1="40" y1="10" x2="40" y2="120" stroke="#3f3f46" />

                      {/* Altitude Curve (Cyan) */}
                      {(() => {
                        const pts = simResult.telemetry;
                        if (pts.length < 2) return null;
                        const maxT = simResult.flightDuration;
                        const maxAlt = Math.max(10, simResult.apogeeAltitude);
                        const pathD = pts
                          .map((p, i) => {
                            const x = 40 + (p.time / maxT) * 350;
                            const y = 120 - (p.altitude / maxAlt) * 100;
                            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                          })
                          .join(' ');

                        return <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" />;
                      })()}

                      {/* Labels */}
                      <text x="45" y="18" fill="#38bdf8" fontSize="9" fontFamily="monospace">
                        Apogee: {simResult.apogeeAltitude.toFixed(0)}m
                      </text>
                      <text x="350" y="132" fill="#71717a" fontSize="8" fontFamily="monospace">
                        {simResult.flightDuration.toFixed(0)}s
                      </text>
                    </svg>
                  </div>
                </div>

                {/* SVG Transonic Drag Breakdown Curve: Cd vs Mach */}
                <div className="p-4 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-zinc-200">High-Mach Drag Breakdown: Total Cd vs Mach</span>
                    <span className="text-[10px] font-mono text-zinc-500">Van Driest II + Ackeret Wave Drag</span>
                  </div>
                  <div className="h-44 w-full bg-zinc-900/60 rounded-lg p-2 relative flex items-center justify-center">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 400 140">
                      <line x1="40" y1="20" x2="390" y2="20" stroke="#27272a" strokeDasharray="3" />
                      <line x1="40" y1="70" x2="390" y2="70" stroke="#27272a" strokeDasharray="3" />
                      <line x1="40" y1="120" x2="390" y2="120" stroke="#3f3f46" />
                      <line x1="40" y1="10" x2="40" y2="120" stroke="#3f3f46" />

                      {/* Drag Curve (Amber) */}
                      {(() => {
                        const curves = aeroCurves.dragCurves;
                        const maxCd = Math.max(0.8, aeroCurves.maxTransonicCd * 1.15);
                        const pathD = curves
                          .map((d, i) => {
                            const x = 40 + (d.mach / 4.0) * 350;
                            const y = 120 - (d.totalCd / maxCd) * 100;
                            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                          })
                          .join(' ');

                        return <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2.5" />;
                      })()}

                      {/* Transonic Mach 1 line */}
                      <line x1="127.5" y1="15" x2="127.5" y2="120" stroke="#ef4444" strokeDasharray="2" />
                      <text x="132" y="30" fill="#ef4444" fontSize="8" fontFamily="monospace">
                        Mach 1.0 (Transonic Peak)
                      </text>

                      <text x="45" y="112" fill="#71717a" fontSize="8" fontFamily="monospace">
                        M=0
                      </text>
                      <text x="365" y="132" fill="#71717a" fontSize="8" fontFamily="monospace">
                        M=4.0
                      </text>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Event Timeline Sequence */}
              <div className="p-4 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-2">
                <span className="font-semibold text-xs text-zinc-200 block">Flight Sequence Timeline</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  {simResult.events.map((evt, idx) => (
                    <div key={idx} className="p-2.5 bg-zinc-900/90 rounded-lg border border-zinc-800/80 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-cyan-400">
                        <span>{evt.name}</span>
                        <span className="font-mono text-zinc-400">{evt.time.toFixed(2)}s</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-tight">{evt.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
