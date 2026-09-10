/**
 * Astraea 6-DOF Flight Dynamics & High-Mach Aerodynamic Dashboard
 * Full 3D rigid body dynamics (position, velocity, quaternions, angular rates),
 * real motor thrust curves, transonic drag breakdown, and competition safety gates.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useRocketStore } from '../store/rocketStore';
import { CERTIFIED_MOTORS, MotorSpec } from '../propulsion/motorDatabase';
import type { BodyTubeComponent } from '../core/types';
import { aggregateVehicleMass } from '../core/mass';
import { simulate6DofFlight, SixDofSimulationResult } from '../sim/sixDofSimulator';
import { computeAerodynamicCurves } from '../aero/transonicAero';
import {
  Rocket,
  Play,
  Flame,
  CheckCircle2,
  AlertTriangle,
  X,
  Compass,
  Wind,
  Navigation,
} from 'lucide-react';

interface FlightSimulationTabProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FlightSimulationTab: React.FC<FlightSimulationTabProps> = ({ isOpen, onClose }) => {
  const vehicle = useRocketStore((s) => s.vehicle);
  // Shared flight-motor selection: one store id drives FlightSim,
  // PropulsionStudio, and TrajectoryStudio (Round-19 coherence).
  const selectedMotorId = useRocketStore((s) => s.selectedMotorId);
  const selectMotor = useRocketStore((s) => s.selectMotor);
  const customMotors = useRocketStore((s) => s.customMotors);
  const setLastSimRun = useRocketStore((s) => s.setLastSimRun);
  const setActiveRun = useRocketStore((s) => s.setActiveRun);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [railLength, setRailLength] = useState<number>(2.4); // meters
  const [railElevation, setRailElevation] = useState<number>(85.0); // deg (85 deg off vertical)
  const [railAzimuth, setRailAzimuth] = useState<number>(90.0); // deg (East)
  const [windSpeed, setWindSpeed] = useState<number>(3.5); // m/s
  const [windAzimuth, setWindAzimuth] = useState<number>(270.0); // Wind from West
  const [finCant, setFinCant] = useState<number>(0.0); // deg
  const [mainDeployAlt, setMainDeployAlt] = useState<number>(250); // meters AGL
  const [simResult, setSimResult] = useState<SixDofSimulationResult | null>(null);
  const [lastRunInputKey, setLastRunInputKey] = useState<string | null>(null);
  const [simError, setSimError] = useState<{ message: string; inputs: string; snapshot: string; at: string } | null>(null);
  const catalog: Record<string, MotorSpec> = { ...CERTIFIED_MOTORS, ...customMotors };
  const activeMotor: MotorSpec = catalog[selectedMotorId] || CERTIFIED_MOTORS.estes_c6;

  // Motor-mount prefilter (Round-19): a run that simulate6DofFlight would
  // reject on hardware grounds is never offered. The mount bore mirrors
  // resolveMotorCentroid's true-bore rule (innerDiameter, else outer - 3 mm);
  // zero mounts = aft-end fallback (no constraint), 2+ mounts = ambiguity
  // (prepareVehicle throws), solid tube = no motor can seat.
  const mountAssessment = useMemo(() => {
    const mounts = vehicle.components.filter(
      (c): c is BodyTubeComponent => c.type === 'bodytube' && c.isMotorMount === true,
    );
    if (mounts.length === 1) {
      const bore = mounts[0].innerDiameter ?? Math.max(0, mounts[0].outerDiameter - 0.003);
      return { mounts, boreM: bore > 0 ? bore : null, solidMount: bore <= 0, ambiguous: false };
    }
    return { mounts, boreM: null, solidMount: false, ambiguous: mounts.length > 1 };
  }, [vehicle]);
  /** Why motor `m` cannot physically seat on this vehicle, or null if it can. */
  const reasonMotorExcluded = (m: MotorSpec): string | null => {
    if (mountAssessment.ambiguous) return null; // handled by the global ambiguity banner
    const mount = mountAssessment.mounts[0];
    if (!mount) return null; // aft-end fallback: no bore constraint
    const bore = mountAssessment.boreM;
    if (bore === null) return `mount '${mount.name}' is a solid tube (no bore) — no motor can be seated`;
    if (m.diameter > bore) {
      return `motor ⌀${(m.diameter * 1000).toFixed(0)} mm exceeds mount '${mount.name}' bore ⌀${(bore * 1000).toFixed(0)} mm`;
    }
    const overlap = Math.min(m.length, mount.length);
    if (overlap < 0.5 * m.length) {
      return `motor length ${(m.length * 1000).toFixed(0)} mm is not retained by mount '${mount.name}' (needs >= 50% of ${(mount.length * 1000).toFixed(0)} mm)`;
    }
    return null;
  };
  const activeMotorExcludedReason =
    mountAssessment.ambiguous ? null : reasonMotorExcluded(activeMotor);
  const runEligible =
    !mountAssessment.ambiguous && activeMotorExcludedReason === null;

  const simulationInputKey = useMemo(
    () =>
      JSON.stringify({
        vehicle,
        selectedMotorId,
        railLength,
        railElevation,
        railAzimuth,
        windSpeed,
        windAzimuth,
        finCant,
        mainDeployAlt,
      }),
    [
      vehicle,
      selectedMotorId,
      railLength,
      railElevation,
      railAzimuth,
      windSpeed,
      windAzimuth,
      finCant,
      mainDeployAlt,
    ],
  );
  const resultsAreStale = simResult !== null && lastRunInputKey !== simulationInputKey;

  // Precompute high-Mach aerodynamic curve. Render-time failures must not
  // crash the surface (audit §8): a throwing preview degrades to a message.
  const aeroCurves = useMemo(() => {
    try {
      return { ok: true as const, value: computeAerodynamicCurves(vehicle, false, 30) };
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
    }
  }, [vehicle]);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);
  // Reproducible failed-run input snapshot (audit §8): vehicle identity and
  // dry mass, full motor record, and every simulation option. Never throws:
  // each probe is individually guarded so snapshot construction cannot mask
  // the original simulation failure.
  const describeRunInputs = (): string => {
    const parts: string[] = [];
    try {
      parts.push(`vehicle=${vehicle.id}:${vehicle.name}`);
      parts.push(`components=${vehicle.components.length}`);
    } catch {
      parts.push('vehicle=<unreadable>');
    }
    try {
      parts.push(`dryMassKg=${aggregateVehicleMass(vehicle).totalMass.toFixed(4)}`);
    } catch (err) {
      parts.push(`dryMassKg=<error:${err instanceof Error ? err.message : String(err)}>`);
    }
    try {
      parts.push(
        `motor=${activeMotor.designation}[${activeMotor.id}] ` +
        `impulse=${activeMotor.totalImpulse}Ns burn=${activeMotor.burnTime}s ` +
        `prop=${activeMotor.propellantMass}kg wet=${activeMotor.totalMass}kg dry=${activeMotor.dryMass}kg ` +
        `dia=${activeMotor.diameter}m len=${activeMotor.length}m`
      );
    } catch {
      parts.push('motor=<unreadable>');
    }
    parts.push(
      `rail=${railLength}m@${railElevation}deg/${railAzimuth}deg ` +
      `wind=${windSpeed}m/s@${windAzimuth}deg cant=${finCant}deg mainAlt=${mainDeployAlt}m`
    );
    return parts.join(' ');
  };
  // Full machine-readable failed-run record (audit §8.9): the complete
  // vehicle geometry, motor record, and options as JSON for reproduction.
  // Guarded per section so snapshot construction never masks the failure.
  const snapshotRunInputs = (): string => {
    const snap: Record<string, unknown> = {};
    try { snap.vehicle = vehicle; } catch { snap.vehicle = '<unreadable>'; }
    try { snap.motor = activeMotor; } catch { snap.motor = '<unreadable>'; }
    snap.options = {
      railLength, railElevationDeg: railElevation, railAzimuthDeg: railAzimuth,
      windSpeedSurface: windSpeed, windAzimuthDeg: windAzimuth,
      finCantAngleDeg: finCant, mainDeployAltitudeAGL: mainDeployAlt,
    };
    try { snap.dryMassKg = aggregateVehicleMass(vehicle).totalMass; } catch { snap.dryMassKg = '<error>'; }
    return JSON.stringify(snap);
  };
  const handleRunSimulation = () => {
    // Fail-closed rerun (audit §8): a throwing rerun clears the previous
    // result and records a reproducible failed-run record — message, full
    // input snapshot (vehicle geometry/mass, motor data, options), and
    // timestamp. Stale SAFE/PASS output must never survive a failed rerun.
    const inputSummary = describeRunInputs();
    // Round-19 motor-mount prefilter: never start a run the simulator would
    // reject on hardware grounds (multi-mount ambiguity, bore exceed,
    // retention). The Run button is disabled in these states; this guard
    // keeps the invariant under programmatic calls.
    if (!runEligible) {
      const reason = mountAssessment.ambiguous
        ? `multiple motor mounts flagged (${mountAssessment.mounts.map((m) => m.name).join(', ')}) — motor assignment must be unique`
        : activeMotorExcludedReason ?? 'selected motor cannot seat in this mount';
      setSimResult(null);
      setLastRunInputKey(null);
      setSimError({
        message: `Motor-mount prefilter: ${reason}`,
        inputs: inputSummary,
        snapshot: snapshotRunInputs(),
        at: new Date().toISOString(),
      });
      return;
    }
    try {
      setActiveRun({ kind: 'sim', label: '6-DOF simulation', progress: Number.NaN });
      const res = simulate6DofFlight(vehicle, activeMotor, {
        railLength,
        railElevationDeg: railElevation,
        railAzimuthDeg: railAzimuth,
        windSpeedSurface: windSpeed,
        windAzimuthDeg: windAzimuth,
        finCantAngleDeg: finCant,
        mainDeployAltitudeAGL: mainDeployAlt,
      });
      setSimError(null);
      setSimResult(res);
      setLastRunInputKey(simulationInputKey);
      // Q5: commit the run to the store so the mission rail and evidence
      // overlay see it without re-running the sim.
      setLastSimRun({
        vehicleId: vehicle.id,
        motorId: selectedMotorId,
        apogeeAltitude: res.apogeeAltitude,
        terminated: res.terminated,
        validity: res.validity,
        recordedAt: Date.now(),
        telemetry: res.telemetry,
        events: res.events,
        runKey: simulationInputKey,
      });
    } catch (err) {
      setSimResult(null);
      setLastRunInputKey(null);
      setSimError({
        message: err instanceof Error ? err.message : String(err),
        inputs: inputSummary,
        snapshot: snapshotRunInputs(),
        at: new Date().toISOString(),
      });
    } finally {
      setActiveRun(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-md">
      <div
        className="w-full max-w-5xl max-h-[92vh] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden select-none animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby="flight-simulation-title"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="flight-simulation-title"
                  className="text-sm font-bold text-white uppercase tracking-wider font-mono"
                >
                  6-DOF Flight Dynamics & Aerodynamics Engine
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono font-bold">
                  RIGID BODY 6-DOF
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Quaternion Kinematics, Wind Shear, Aero Restoring Moments, and Screening Thresholds (preview — not competition gates)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close flight simulation"
            className="min-w-11 min-h-11 p-2.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 transition cursor-pointer"
            ref={closeButtonRef}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-zinc-200">
          {/* Top Configuration Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            {/* Column 1: Propulsion */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Rocket Motor (Certified + Imported)</span>
                </label>
                <select
                  value={selectedMotorId}
                  aria-label="Rocket motor"
                  onChange={(e) => selectMotor(e.target.value)}
                  className="w-full min-h-11 bg-zinc-800 text-zinc-100 px-3 py-2 rounded-lg border border-zinc-600 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 font-medium cursor-pointer"
                >
                  {Object.values(catalog).map((m) => {
                    const excludedReason = mountAssessment.ambiguous ? null : reasonMotorExcluded(m);
                    return (
                      <option
                        key={m.id}
                        value={m.id}
                        disabled={excludedReason !== null}
                        title={excludedReason ?? undefined}
                      >
                        [{m.impulseClass}] {m.designation} — {m.totalImpulse} Ns (⌀{(m.diameter * 1000).toFixed(0)}mm)
                        {excludedReason !== null ? ' — cannot fit this mount' : ''}
                      </option>
                    );
                  })}
                </select>
                {mountAssessment.mounts.length === 1 && !mountAssessment.ambiguous && (
                  <div className="text-[10px] font-mono text-zinc-500">
                    {mountAssessment.boreM === null
                      ? `Mount '${mountAssessment.mounts[0].name}' is a solid tube — no motor can be seated.`
                      : `Motor-mount bore ⌀${(mountAssessment.boreM * 1000).toFixed(0)}mm · ` +
                        `${Object.values(catalog).filter((m) => reasonMotorExcluded(m) !== null).length} of ${Object.values(catalog).length} motors excluded (bore/length)`}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-semibold">Main Parachute AGL</span>
                  <span className="font-mono text-cyan-400">{mainDeployAlt} m</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="500"
                  step="25"
                  value={mainDeployAlt}
                  aria-label="Main parachute deployment altitude in meters above ground level"
                  onChange={(e) => setMainDeployAlt(parseFloat(e.target.value))}
                  className="w-full min-h-11 accent-cyan-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
              </div>
            </div>

            {/* Column 2: Launch Rail Setup (Elevation & Azimuth) */}
            <div className="space-y-3 border-t md:border-t-0 md:border-l border-zinc-800 pt-3 md:pt-0 md:pl-4">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-semibold flex items-center gap-1">
                    <Navigation className="w-3 h-3 text-cyan-400" /> Rail Elevation
                  </span>
                  <span className="font-mono text-cyan-400">{railElevation.toFixed(1)}° ({90 - railElevation}° off vert)</span>
                </div>
                <input
                  type="range"
                  min="75"
                  max="90"
                  step="0.5"
                  value={railElevation}
                  aria-label="Launch rail elevation in degrees"
                  onChange={(e) => setRailElevation(parseFloat(e.target.value))}
                  className="w-full min-h-11 accent-cyan-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-semibold flex items-center gap-1">
                    <Compass className="w-3 h-3 text-cyan-400" /> Rail Azimuth (Aim)
                  </span>
                  <span className="font-mono text-cyan-400">{railAzimuth.toFixed(0)}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={railAzimuth}
                  aria-label="Launch rail azimuth in degrees"
                  onChange={(e) => setRailAzimuth(parseFloat(e.target.value))}
                  className="w-full min-h-11 accent-cyan-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-semibold">Rail Length</span>
                  <span className="font-mono text-cyan-400">{railLength.toFixed(1)} m</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="5.0"
                  step="0.2"
                  value={railLength}
                  aria-label="Launch rail length in meters"
                  onChange={(e) => setRailLength(parseFloat(e.target.value))}
                  className="w-full min-h-11 accent-cyan-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
              </div>
            </div>

            {/* Column 3: Atmospheric Wind & Fin Cant */}
            <div className="space-y-3 border-t md:border-t-0 md:border-l border-zinc-800 pt-3 md:pt-0 md:pl-4">
              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-semibold flex items-center gap-1">
                    <Wind className="w-3 h-3 text-amber-400" /> Surface Crosswind
                  </span>
                  <span className="font-mono text-amber-400">{windSpeed.toFixed(1)} m/s ({(windSpeed * 2.23694).toFixed(1)} mph)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="0.5"
                  value={windSpeed}
                  aria-label="Surface crosswind speed in meters per second"
                  onChange={(e) => setWindSpeed(parseFloat(e.target.value))}
                  className="w-full min-h-11 accent-amber-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-semibold">Wind Direction (From)</span>
                  <span className="font-mono text-amber-400">{windAzimuth.toFixed(0)}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="10"
                  value={windAzimuth}
                  aria-label="Wind direction from in degrees"
                  onChange={(e) => setWindAzimuth(parseFloat(e.target.value))}
                  className="w-full min-h-11 accent-amber-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-zinc-400 font-semibold">Fin Cant Spin Angle</span>
                  <span className="font-mono text-cyan-400">{finCant.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.1"
                  value={finCant}
                  aria-label="Fin cant spin angle in degrees"
                  onChange={(e) => setFinCant(parseFloat(e.target.value))}
                  className="w-full min-h-11 accent-cyan-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
              </div>
            </div>
          </div>

          {/* Mount-state advisories (Round-19): hardware states that change
              the simulation contract are surfaced BEFORE the run — zero-mount
              aft fallback, multi-mount ambiguity (run disabled), solid/too-
              tight mount (run disabled). Never offer a run that is
              guaranteed to throw. */}
          {mountAssessment.ambiguous && (
            <div
              className="p-3 bg-rose-950/60 rounded-xl border border-rose-500/40 text-rose-300 text-xs font-mono"
              role="status"
            >
              <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1.5" />
              Multiple motor mounts flagged ({mountAssessment.mounts.map((m) => m.name).join(', ')}) — motor assignment must be unique
              (prepareVehicle would reject this vehicle). Simulation is disabled. Clear stray “Is Motor Mount” flags in the Properties inspector.
            </div>
          )}
          {!mountAssessment.ambiguous && mountAssessment.mounts.length === 0 && (
            <div
              className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/40 text-amber-300 text-xs"
              role="status"
            >
              <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1.5" />
              No motor mount flagged — the motor seats at the vehicle aft end (documented fallback placement).
              Mark a body tube as “Is Motor Mount” in Properties to apply bore-fit screening.
            </div>
          )}
          {!mountAssessment.ambiguous && !runEligible && (
            <div
              className="p-3 bg-rose-950/60 rounded-xl border border-rose-500/40 text-rose-300 text-xs font-mono"
              role="status"
            >
              <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1.5" />
              {activeMotorExcludedReason} — select a fitting motor to enable the run.
            </div>
          )}

          {/* Action Button */}
          <div className="flex justify-center">
            <button
              onClick={handleRunSimulation}
              disabled={!runEligible}
              className="min-h-11 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-zinc-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed enabled:pointer-events-auto"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Run 6-DOF Trajectory Simulation</span>
            </button>
          </div>

          {/* Simulation Output KPIs */}
          {simError && (
            <div
              className="p-3 bg-rose-950/60 rounded-xl border border-rose-500/40 text-rose-300 text-xs font-mono"
              role="alert"
            >
              Simulation failed at {simError.at}: {simError.message}. Inputs: {simError.inputs}. Previous results were cleared — no stale output is shown.
              <details className="mt-2">
                <summary className="cursor-pointer text-rose-200 hover:text-rose-100">Full input snapshot (JSON, for reproduction)</summary>
                <pre className="mt-1 p-2 bg-zinc-950/80 rounded-lg overflow-x-auto text-[10px] text-zinc-300 whitespace-pre-wrap break-all">{simError.snapshot}</pre>
              </details>
            </div>
          )}
          {simResult && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Run manifest: the input snapshot these results were computed
                  from (audit §8.9). Values reflect current controls; results
                  are only trustworthy while the FRESH badge holds. */}
              <div className="px-3 py-2 bg-zinc-950/60 rounded-xl border border-zinc-800 text-[10px] font-mono text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
                <span className="uppercase font-semibold text-zinc-500">Run manifest</span>
                <span>motor {activeMotor.designation}</span>
                <span>rail {railLength.toFixed(1)} m @ {railElevation.toFixed(1)}°/{railAzimuth.toFixed(0)}°</span>
                <span>wind {windSpeed.toFixed(1)} m/s @ {windAzimuth.toFixed(0)}°</span>
                <span>cant {finCant.toFixed(1)}° main {mainDeployAlt.toFixed(0)} m</span>
                <span className={resultsAreStale ? 'text-amber-400' : 'text-emerald-400'}>
                  {resultsAreStale ? 'STALE — inputs changed since run' : 'FRESH — matches current inputs'}
                </span>
              </div>
              {/* Outcome, model validity, and freshness are independent (§2.6). */}
              <div
                className="min-h-9 p-3 bg-zinc-950/80 rounded-xl border border-zinc-700 flex flex-wrap items-center gap-2"
                role="status"
                aria-live="polite"
              >
                <span className="text-[10px] text-zinc-400 uppercase font-semibold mr-1">Flight Status</span>
                {(() => {
                  // Outcome, model-domain validity, and limit compliance are
                  // separate claims (audit §8): PASS requires touchdown under
                  // a nominal model; FAIL distinguishes timeout from other
                  // non-completion; UNKNOWN is a model-domain statement.
                  const v = simResult.validity;
                  const badge =
                    v === 'PASS'
                      ? {
                          c: resultsAreStale
                            ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                            : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
                          icon: resultsAreStale
                            ? <AlertTriangle className="w-3.5 h-3.5" />
                            : <CheckCircle2 className="w-3.5 h-3.5" />,
                          label: resultsAreStale ? 'PASS · prior run (stale)' : 'PASS · touchdown, nominal model',
                        }
                      : v === 'UNKNOWN'
                        ? {
                            c: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
                            icon: <AlertTriangle className="w-3.5 h-3.5" />,
                            label: !simResult.terminated
                              ? 'UNKNOWN · no touchdown, outside model'
                              : simResult.touchdownNominal
                                ? 'UNKNOWN · outside validated model'
                                : 'UNKNOWN · abnormal impact, outside model',
                          }
                        : v === 'FAIL'
                          ? {
                              c: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
                              icon: <X className="w-3.5 h-3.5" />,
                              label: simResult.terminationReason === 'timeout'
                                ? 'FAIL · no touchdown before time limit'
                                : 'FAIL · run did not complete',
                            }
                          : {
                              c: 'text-zinc-300 bg-zinc-700/20 border-zinc-600/40',
                              icon: <X className="w-3.5 h-3.5" />,
                              label: 'N/A · criterion excluded',
                            };
                  return (
                    <span className={`px-2 py-1 rounded border text-[10px] font-mono font-bold inline-flex items-center gap-1 ${badge.c}`}>
                      {badge.icon}
                      {badge.label}
                    </span>
                  );
                })()}
                {(() => {
                  // The envelope badge requires final validity PASS explicitly
                  // (audit §8): coherence of related fields is not a substitute
                  // for the validity verdict itself.
                  const domainOk =
                    simResult.validity === 'PASS' && simResult.enveloped && !simResult.offNominalExcursion &&
                    simResult.touchdownNominal && simResult.terminated && !resultsAreStale;
                  return (
                    <span
                      className={`text-[10px] px-2 py-1 rounded border font-mono ${
                        domainOk
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                          : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                      }`}
                    >
                      {domainOk ? 'IN-DOMAIN · M∈[0,4], α≤30°, no excursions' : 'OFF-DOMAIN · not certifiable'}
                    </span>
                  );
                })()}
                <span
                  className={`text-[10px] px-2 py-1 rounded border font-mono ${
                    resultsAreStale
                      ? 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                      : 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30'
                  }`}
                >
                  {resultsAreStale ? 'STALE · configuration changed' : 'CURRENT · inputs match run'}
                </span>
              </div>

              {/* Airframe/Status gates */}
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
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Rail Exit Velocity</div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1 flex items-center gap-1">
                    {simResult.railExitVelocity.toFixed(1)} m/s
                    {simResult.isRailExitSafe && !resultsAreStale ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono">
                    {simResult.validity !== 'PASS' || resultsAreStale
                      ? 'UNVERIFIED · not certifiable'
                      : simResult.isRailExitSafe ? '>= 15 m/s (screening met)' : 'LOW CLEARANCE'}
                  </div>
                </div>

                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Rail-Exit Incidence</div>
                  <div className="text-lg font-bold font-mono text-amber-400 mt-1">
                    {simResult.weathercockAngleDeg.toFixed(1)}°
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    Total incidence at rail exit
                  </div>
                </div>

                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Landing Drift</div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                    {simResult.landingDistance.toFixed(0)} m
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono">
                    [{simResult.landingPosition.x.toFixed(0)}E, {simResult.landingPosition.y.toFixed(0)}N]
                    {!simResult.terminated ? ' · NO TOUCHDOWN, end-of-run position' : ''}
                  </div>
                </div>

                <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">Touchdown Energy</div>
                  <div className="text-lg font-bold font-mono text-zinc-100 mt-1 flex items-center gap-1">
                    {simResult.landingKineticEnergy.toFixed(1)} J
                    {simResult.isLandingSafe && !resultsAreStale ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    )}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono">
                    {!simResult.terminated
                      ? 'NO TOUCHDOWN · end-of-run energy, not a touchdown metric'
                      : simResult.validity !== 'PASS' || resultsAreStale
                        ? 'UNVERIFIED · not certifiable'
                        : simResult.isLandingSafe ? '<= 20 J (screening met)' : 'EXCEEDS 20 J LIMIT'}
                  </div>
                </div>
              </div>

              {/* Graphical Curves Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* SVG 3D Flight Profile: Altitude & Velocity vs Time */}
                <div className="p-4 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-zinc-200">6-DOF Altitude Trajectory & Parachute Descent</span>
                    <span className="text-[10px] font-mono text-cyan-400">Euler-Poinsot Quaternion ODE</span>
                  </div>
                  <div className="h-44 w-full bg-zinc-900/60 rounded-lg p-2 relative flex items-center justify-center">
                    <svg
                      className="w-full h-full overflow-visible"
                      viewBox="0 0 400 140"
                      role="img"
                      aria-label={`Altitude trajectory from launch to ${simResult.apogeeAltitude.toFixed(0)} meters over ${simResult.flightDuration.toFixed(0)} seconds`}
                    >
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

                      <text x="45" y="18" fill="#38bdf8" fontSize="9" fontFamily="monospace">
                        Apogee: {simResult.apogeeAltitude.toFixed(0)}m ({(simResult.apogeeAltitude * 3.28084).toFixed(0)}ft)
                      </text>
                      <text x="350" y="132" fill="#71717a" fontSize="8" fontFamily="monospace">
                        {simResult.flightDuration.toFixed(0)}s
                      </text>
                    </svg>
                  </div>
                </div>

                {/* SVG Transonic Drag Breakdown: Cd vs Mach */}
                <div className="p-4 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-zinc-200">High-Mach Drag Breakdown: Total Cd vs Mach</span>
                    <span className="text-[10px] font-mono text-amber-400">Van Driest II + Ackeret Wave Drag</span>
                  </div>
                  <div className="h-44 w-full bg-zinc-900/60 rounded-lg p-2 relative flex items-center justify-center">
                    <svg
                      className="w-full h-full overflow-visible"
                      viewBox="0 0 400 140"
                      role="img"
                      aria-label="Total drag coefficient from Mach zero to Mach four with the transonic region marked"
                    >
                      <line x1="40" y1="20" x2="390" y2="20" stroke="#27272a" strokeDasharray="3" />
                      <line x1="40" y1="70" x2="390" y2="70" stroke="#27272a" strokeDasharray="3" />
                      <line x1="40" y1="120" x2="390" y2="120" stroke="#3f3f46" />
                      <line x1="40" y1="10" x2="40" y2="120" stroke="#3f3f46" />

                      {(() => {
                        if (!aeroCurves.ok) {
                          return (
                            <text x="45" y="70" fill="#71717a" fontSize="9" fontFamily="monospace">
                              Aero preview unavailable: {aeroCurves.message}
                            </text>
                          );
                        }
                        const curves = aeroCurves.value.dragCurves;
                        const maxCd = Math.max(0.8, aeroCurves.value.maxTransonicCd * 1.15);
                        const pathD = curves
                          .map((d, i) => {
                            const x = 40 + (d.mach / 4.0) * 350;
                            const y = 120 - (d.totalCd / maxCd) * 100;
                            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                          })
                          .join(' ');

                        return <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2.5" />;
                      })()}

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
                <span className="font-semibold text-xs text-zinc-200 block">6-DOF Flight Sequence Timeline</span>
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
