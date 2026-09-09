/**
 * Astraea 6-DOF Flight Dynamics & High-Mach Aerodynamic Dashboard
 * Full 3D rigid body dynamics (position, velocity, quaternions, angular rates),
 * real motor thrust curves, transonic drag breakdown, and competition safety gates.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useRocketStore } from '../store/rocketStore';
import { CERTIFIED_MOTORS, MotorSpec } from '../propulsion/motorDatabase';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [selectedMotorId, setSelectedMotorId] = useState<string>('estes_c6');
  const [railLength, setRailLength] = useState<number>(2.4); // meters
  const [railElevation, setRailElevation] = useState<number>(85.0); // deg (85 deg off vertical)
  const [railAzimuth, setRailAzimuth] = useState<number>(90.0); // deg (East)
  const [windSpeed, setWindSpeed] = useState<number>(3.5); // m/s
  const [windAzimuth, setWindAzimuth] = useState<number>(270.0); // Wind from West
  const [finCant, setFinCant] = useState<number>(0.0); // deg
  const [mainDeployAlt, setMainDeployAlt] = useState<number>(250); // meters AGL
  const [simResult, setSimResult] = useState<SixDofSimulationResult | null>(null);
  const [lastRunInputKey, setLastRunInputKey] = useState<string | null>(null);
  const [simError, setSimError] = useState<{ message: string; inputs: string; at: string } | null>(null);

  const activeMotor: MotorSpec = CERTIFIED_MOTORS[selectedMotorId] || CERTIFIED_MOTORS.estes_c6;

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
  const handleRunSimulation = () => {
    // Fail-closed rerun (audit §8): a throwing rerun clears the previous
    // result and records a reproducible failed-run record — message, full
    // input snapshot (vehicle geometry/mass, motor data, options), and
    // timestamp. Stale SAFE/PASS output must never survive a failed rerun.
    const inputSummary = describeRunInputs();
    try {
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
    } catch (err) {
      setSimResult(null);
      setLastRunInputKey(null);
      setSimError({
        message: err instanceof Error ? err.message : String(err),
        inputs: inputSummary,
        at: new Date().toISOString(),
      });
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
                  <span>Certified Rocket Motor</span>
                </label>
                <select
                  value={selectedMotorId}
                  aria-label="Certified rocket motor"
                  onChange={(e) => setSelectedMotorId(e.target.value)}
                  className="w-full min-h-11 bg-zinc-800 text-zinc-100 px-3 py-2 rounded-lg border border-zinc-600 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 font-medium cursor-pointer"
                >
                  {Object.values(CERTIFIED_MOTORS).map((m) => (
                    <option key={m.id} value={m.id}>
                      [{m.impulseClass}] {m.designation} — {m.totalImpulse} Ns (⌀{(m.diameter * 1000).toFixed(0)}mm)
                    </option>
                  ))}
                </select>
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

          {/* Action Button */}
          <div className="flex justify-center">
            <button
              onClick={handleRunSimulation}
              className="min-h-11 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-zinc-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
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
            </div>
          )}
          {simResult && (
            <div className="space-y-6 animate-in fade-in duration-300">
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
                  // The envelope badge must agree with final validity AND the
                  // run context: abnormal termination and stale inputs also
                  // withdraw the in-domain presentation (audit §8).
                  const domainOk =
                    simResult.enveloped && !simResult.offNominalExcursion &&
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
                    {simResult.validity !== 'PASS' || resultsAreStale
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
