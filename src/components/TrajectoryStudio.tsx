/**
 * Trajectory Studio — trajectory + weather panel for the ACTIVE vehicle and
 * shared flight-motor selection (Round-19: reads the RocketStore directly,
 * takes no vehicle/motor props). App remounts the panel on vehicle.id so
 * preset switches reset studio state.
 *
 * Sections:
 *   1. Manual wind-shear table (rows of {altitudeM, speedMs, directionFromDeg})
 *      driving a live windAtAltitude/windToENU readout at a probe altitude
 *      (defaults to 0 m — surface semantics).
 *   2. Live Open-Meteo sounding fetch — layer count or error text (no API key).
 *   3. Monte Carlo dispersion over the authoritative 6-DOF simulator with a
 *      user nRuns (50 default, 200 cap) and perturbation sigmas. Wind
 *      precedence: a fetched sounding supplies the surface-wind slot
 *      (interpolated at the probe altitude); the manual table is the
 *      fallback. Results carry a FRESH/STALE badge keyed on every input.
 *   4. Boattail flow-separation and protuberance-drag advisories.
 */

import React, { useMemo, useState } from 'react';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { useRocketStore } from '../store/rocketStore';
import type { SixDofOptions } from '../sim/sixDofSimulator';
import type { DispersionResult } from '../sim/monteCarlo';
import { runMonteCarlo } from '../sim/monteCarlo';
import type { WindLayer } from '../sim/weather';
import { fetchSounding, windAtAltitude, windToENU } from '../sim/weather';
import { boattailSeparationCheck, computeProtuberanceDrag } from '../aero/protuberance';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  Navigation,
  Play,
  Plus,
  Wind,
  X,
} from 'lucide-react';

/** One editable row of the manual wind table (spec §1). */
interface WindRow {
  altitudeM: number;
  speedMs: number;
  directionFromDeg: number;
}

const NUMERIC_INPUT =
  'w-full min-w-0 bg-zinc-800 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-600/80 focus:border-cyan-500 focus:outline-none font-mono text-right';

const DEFAULT_WIND_ROWS: WindRow[] = [{ altitudeM: 0, speedMs: 0, directionFromDeg: 0 }];

/** Fixed PRNG seed: identical inputs ⇒ identical landings (determinism contract). */
const MC_SEED = 20260909;
const MC_NRUNS_DEFAULT = 50;
const MC_NRUNS_MAX = 200;
// Launch-rail elevation default: the simulator's declared domain is [70°, 90°].
// A vertical (90°) rail plus any nonzero rail-angle sigma sends ~half the
// Gaussian draws above 90° and the run is domain-rejected; 85° keeps the
// default 1σ perturbed cloud comfortably inside the domain. User-adjustable.
const MC_RAIL_ELEVATION_DEFAULT = 85.0;
const MC_RAIL_ELEVATION_MIN = 70.0;
const MC_RAIL_ELEVATION_MAX = 90.0;

const clampNRuns = (raw: number): number => Math.min(MC_NRUNS_MAX, Math.max(1, Math.floor(raw)));

/** Clamp a rail elevation into the simulator's declared [70°, 90°] domain. */
const clampRailElevation = (raw: number): number =>
  Number.isFinite(raw)
    ? Math.min(MC_RAIL_ELEVATION_MAX, Math.max(MC_RAIL_ELEVATION_MIN, raw))
    : MC_RAIL_ELEVATION_DEFAULT;

/**
 * TrajectoryStudio reads the ACTIVE vehicle and shared flight-motor selection
 * from the RocketStore (Round-19 coherence) — the caller passes no props.
 * App keys the panel on `vehicle.id` (`<TrajectoryStudio key={vehicle.id} />`)
 * so a preset/import switch remounts it and resets all studio-local state
 * (wind rows, probe, sounding, MC result) instead of silently reusing it.
 */
export function TrajectoryStudio(): React.JSX.Element {
  const vehicle = useRocketStore((s) => s.vehicle);
  const selectedMotorId = useRocketStore((s) => s.selectedMotorId);
  const customMotors = useRocketStore((s) => s.customMotors);
  const catalog: Record<string, MotorSpec> = { ...CERTIFIED_MOTORS, ...customMotors };
  const motor: MotorSpec = catalog[selectedMotorId] ?? CERTIFIED_MOTORS.estes_c6;

  // --- 1. Manual wind shear table + probe readout ---
  const [windRows, setWindRows] = useState<WindRow[]>(DEFAULT_WIND_ROWS);
  // Probe defaults to 0 m: surface semantics for the surface-wind slot the
  // 6-DOF simulator consumes (power-law shear is applied above it).
  const [probeAltitudeM, setProbeAltitudeM] = useState<number>(0);

  // WindLayer fills in atmosphere fields the interpolation never reads so
  // the manual {altitude, speed, from} triple can drive windAtAltitude.
  const windLayers = useMemo(
    () =>
      windRows.map((row) => ({
        altitudeM: row.altitudeM,
        speedMs: row.speedMs,
        directionFromDeg: row.directionFromDeg,
        tempC: 15,
        pressureHpa: 1013.25,
      })),
    [windRows],
  );
  const probeWind = useMemo(() => {
    try {
      return windAtAltitude(windLayers, probeAltitudeM);
    } catch {
      return null; // empty table: no layers to interpolate
    }
  }, [windLayers, probeAltitudeM]);
  const probeENU = useMemo(() => {
    if (!probeWind) return null;
    try {
      return windToENU(probeWind.speedMs, probeWind.directionFromDeg);
    } catch {
      return null; // non-finite/negative speed from a hand-edited row
    }
  }, [probeWind]);

  const updateWindRow = (index: number, field: keyof WindRow, value: number) => {
    setWindRows(
      windRows.map((row, i) => {
        if (i !== index) return row;
        const next: WindRow = { ...row };
        next[field] = value;
        return next;
      }),
    );
  };

  // --- 2. Live sounding (Open-Meteo, default fetch, no API key) ---
  const [soundingLat, setSoundingLat] = useState<string>('35.6762');
  const [soundingLon, setSoundingLon] = useState<string>('-105.2716');
  const [soundingStatus, setSoundingStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [soundingLayers, setSoundingLayers] = useState<WindLayer[]>([]);
  const [soundingError, setSoundingError] = useState<string | null>(null);

  const handleFetchSounding = async () => {
    setSoundingStatus('loading');
    setSoundingError(null);
    setSoundingLayers([]);
    try {
      const layers = await fetchSounding(parseFloat(soundingLat), parseFloat(soundingLon));
      setSoundingLayers(layers);
      setSoundingStatus('ok');
    } catch (err) {
      setSoundingError(err instanceof Error ? err.message : String(err));
      setSoundingStatus('error');
    }
  };

  // --- 3. Monte Carlo dispersion ---
  const [mcNRuns, setMcNRuns] = useState<number>(MC_NRUNS_DEFAULT);
  const [mcRailElevationDeg, setMcRailElevationDeg] = useState<number>(MC_RAIL_ELEVATION_DEFAULT);
  const [mcWindSigmaDeg, setMcWindSigmaDeg] = useState<number>(5.0);
  const [mcRailSigmaDeg, setMcRailSigmaDeg] = useState<number>(1.0);
  const [mcImpulseSigmaPct, setMcImpulseSigmaPct] = useState<number>(3.0);
  const [mcRunning, setMcRunning] = useState<boolean>(false);
  const [mcResult, setMcResult] = useState<DispersionResult | null>(null);
  const [lastMcInputKey, setLastMcInputKey] = useState<string | null>(null);
  const [mcError, setMcError] = useState<string | null>(null);

  // FRESH/STALE contract (shared with FlightSim): every dispersion-relevant
  // input — vehicle, shared motor, run count, sigmas, probe altitude, wind
  // rows, AND the sounding profile — folds into one key. Any change after a
  // run flags the results stale; only a rerun refreshes the badge.
  const mcInputKey = useMemo(
    () =>
      JSON.stringify({
        vehicle,
        motorId: motor.id,
        nRuns: clampNRuns(mcNRuns),
        railElevation: mcRailElevationDeg,
        windSigma: mcWindSigmaDeg,
        railSigma: mcRailSigmaDeg,
        impulseSigma: mcImpulseSigmaPct,
        probeAltitudeM,
        windRows,
        soundingStatus,
        soundingLayers,
      }),
    [
      vehicle,
      motor.id,
      mcNRuns,
      mcRailElevationDeg,
      mcWindSigmaDeg,
      mcRailSigmaDeg,
      mcImpulseSigmaPct,
      probeAltitudeM,
      windRows,
      soundingStatus,
      soundingLayers,
    ],
  );
  const mcResultsAreStale = mcResult !== null && lastMcInputKey !== mcInputKey;

  // Wind precedence (Round-19): a live sounding, once fetched, supplies the
  // wind the MC consumes — interpolated at the probe altitude into the
  // simulator's surface-wind slot (the sim applies its own power-law shear
  // above it). The manual table is the fallback when no sounding is loaded
  // or the interpolation fails (degenerate profile). Sounding > manual.
  const soundingOk = soundingStatus === 'ok' && soundingLayers.length > 0;
  const mcSurfaceWind = useMemo(() => {
    if (soundingOk) {
      try {
        return windAtAltitude(soundingLayers, probeAltitudeM);
      } catch {
        // Degenerate sounding profile: fall back to the manual table.
        return probeWind ?? { speedMs: 0, directionFromDeg: 0 };
      }
    }
    return probeWind ?? { speedMs: 0, directionFromDeg: 0 };
  }, [soundingOk, soundingLayers, probeAltitudeM, probeWind]);

  const handleRunMonteCarlo = () => {
    if (mcRunning) return;
    // Surface wind feeds the simulator's windSpeedSurface slot. Rail elevation
    // defaults to 85° (5° off vertical) so the default rail-angle sigma keeps
    // the perturbed cloud inside the simulator's [70°, 90°] domain.
    const options: SixDofOptions = {
      railLength: 2.4,
      railElevationDeg: mcRailElevationDeg,
      railAzimuthDeg: 90.0,
      windSpeedSurface: mcSurfaceWind.speedMs,
      windAzimuthDeg: mcSurfaceWind.directionFromDeg,
      mainDeployAltitudeAGL: 250,
      finCantAngleDeg: 0.0,
    };
    setMcRunning(true);
    setMcError(null);
    try {
      const result = runMonteCarlo(
        { vehicle, motor, options },
        {
          windAzimuthDegSigma: mcWindSigmaDeg,
          railAngleDegSigma: mcRailSigmaDeg,
          impulsePctSigma: mcImpulseSigmaPct,
        },
        clampNRuns(mcNRuns),
        MC_SEED,
      );
      setMcResult(result);
      setLastMcInputKey(mcInputKey);
    } catch (err) {
      setMcResult(null);
      setLastMcInputKey(null);
      setMcError(err instanceof Error ? err.message : String(err));
    } finally {
      setMcRunning(false);
    }
  };

  // --- 4. Protuberance drag + boattail separation advisories ---
  const [lugFrontalAreaM2, setLugFrontalAreaM2] = useState<number>(0.00005);
  const [lugHeightM, setLugHeightM] = useState<number>(0.002);
  const [refAreaM2, setRefAreaM2] = useState<number>(0.0004839); // π/4·(BT-50)²
  const [boundaryLayerThicknessM, setBoundaryLayerThicknessM] = useState<number>(0.01);
  const [btForeDiameterM, setBtForeDiameterM] = useState<number>(0.0248);
  const [btAftDiameterM, setBtAftDiameterM] = useState<number>(0.02);
  const [btLengthM, setBtLengthM] = useState<number>(0.05);

  const lugCd = computeProtuberanceDrag({
    frontalArea: lugFrontalAreaM2,
    refArea: refAreaM2,
    lugHeight: lugHeightM,
    boundaryLayerThickness: boundaryLayerThicknessM,
  });
  const boattail = boattailSeparationCheck(btForeDiameterM, btAftDiameterM, btLengthM);

  const sectionHeader = (icon: React.ReactNode, title: string, hint?: string) => (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
      {icon}
      <span>{title}</span>
      {hint ? <span className="text-[10px] text-zinc-500 font-normal">{hint}</span> : null}
    </div>
  );

  return (
    <div
      className="rounded-2xl border border-zinc-700/80 bg-zinc-900 p-5 space-y-5 text-xs text-zinc-200"
      role="region"
      aria-label="Trajectory and weather studio"
    >
      {/* Panel header: caller-owned vehicle + motor identity */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Wind className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              Trajectory & Weather Studio
            </h2>
            <p className="text-[10px] text-zinc-400">
              Wind shear, live sounding, Monte Carlo dispersion, and aero advisories
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
          <span className="px-2 py-1 rounded bg-zinc-800/80 border border-zinc-700/60 text-cyan-300">
            {vehicle.name}
          </span>
          <span className="px-2 py-1 rounded bg-zinc-800/80 border border-zinc-700/60 text-amber-300">
            {motor.designation}
          </span>
        </div>
      </div>

      {/* --- Section 1: manual wind table + probe readout --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-4">
          {sectionHeader(
            <Wind className="w-3.5 h-3.5 text-cyan-400" />,
            'Manual Wind Shear Table',
            'wind blows FROM the direction column',
          )}
          <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-[10px] text-zinc-500 font-mono uppercase">
            <span>Alt (m)</span>
            <span>Speed (m/s)</span>
            <span>From (°)</span>
            <span />
          </div>
          {windRows.map((row, i) => (
            <div key={i} className="grid grid-cols-4 gap-1.5 mt-1">
              <input
                type="number"
                step="any"
                value={row.altitudeM}
                aria-label={`Wind layer ${i + 1} altitude (m)`}
                onChange={(e) => updateWindRow(i, 'altitudeM', parseFloat(e.target.value) || 0)}
                className={NUMERIC_INPUT}
              />
              <input
                type="number"
                step="any"
                value={row.speedMs}
                aria-label={`Wind layer ${i + 1} speed (m/s)`}
                onChange={(e) => updateWindRow(i, 'speedMs', parseFloat(e.target.value) || 0)}
                className={NUMERIC_INPUT}
              />
              <input
                type="number"
                step="any"
                value={row.directionFromDeg}
                aria-label={`Wind layer ${i + 1} direction from (deg)`}
                onChange={(e) => updateWindRow(i, 'directionFromDeg', parseFloat(e.target.value) || 0)}
                className={NUMERIC_INPUT}
              />
              <button
                onClick={() => setWindRows(windRows.filter((_, ri) => ri !== i))}
                aria-label={`Remove wind layer ${i + 1}`}
                className="min-w-8 h-8 rounded-md border border-zinc-700/50 text-rose-300 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5 mx-auto" />
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              setWindRows([
                ...windRows,
                // New row starts +100 m above the last layer so rows stay monotonic.
                {
                  altitudeM: (windRows.length > 0 ? windRows[windRows.length - 1].altitudeM : 0) + 100,
                  speedMs: 0,
                  directionFromDeg: 0,
                },
              ])
            }
            className="mt-2 min-h-8 px-2.5 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 cursor-pointer inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Wind Layer
          </button>
        </div>

        <div className="bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-4">
          {sectionHeader(
            <Compass className="w-3.5 h-3.5 text-cyan-400" />,
            'Probe Wind @ Altitude',
            probeWind ? undefined : 'no layers — add rows to the left',
          )}
          <div className="mt-2 flex justify-between text-[11px]">
            <span className="text-zinc-400 font-semibold">Probe Altitude</span>
            <span className="font-mono text-cyan-400">{probeAltitudeM} m</span>
          </div>
          <input
            type="range"
            min="0"
            max="6000"
            step="10"
            value={probeAltitudeM}
            aria-label="Wind probe altitude (m)"
            onChange={(e) => setProbeAltitudeM(parseFloat(e.target.value))}
            className="w-full min-h-11 accent-cyan-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          />
          {probeWind && probeENU ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <div className="p-2 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Speed</div>
                <div className="font-mono text-cyan-300">{probeWind.speedMs.toFixed(1)} m/s</div>
              </div>
              <div className="p-2 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">From</div>
                <div className="font-mono text-cyan-300">{probeWind.directionFromDeg.toFixed(0)}°</div>
              </div>
              <div className="p-2 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">ENU East</div>
                <div className="font-mono text-cyan-300" aria-label="ENU east (m/s)">
                  {probeENU.east.toFixed(2)} m/s
                </div>
              </div>
              <div className="p-2 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">ENU North</div>
                <div className="font-mono text-cyan-300" aria-label="ENU north (m/s)">
                  {probeENU.north.toFixed(2)} m/s
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-amber-300 text-[11px]">
              No wind layers — add at least one row to see the probe readout.
            </div>
          )}
        </div>
      </div>

      {/* --- Section 2: live sounding --- */}
      <div className="bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-4">
        {sectionHeader(
          <Wind className="w-3.5 h-3.5 text-amber-400" />,
          'Live Sounding (Open-Meteo)',
          'no API key required',
        )}
        <div className="mt-2.5 flex items-end gap-2">
          <label className="flex-1 text-[10px] text-zinc-500 uppercase font-semibold">
            Latitude
            <input
              type="number"
              step="any"
              value={soundingLat}
              aria-label="Sounding latitude"
              onChange={(e) => setSoundingLat(e.target.value)}
              className={`${NUMERIC_INPUT} mt-1`}
            />
          </label>
          <label className="flex-1 text-[10px] text-zinc-500 uppercase font-semibold">
            Longitude
            <input
              type="number"
              step="any"
              value={soundingLon}
              aria-label="Sounding longitude"
              onChange={(e) => setSoundingLon(e.target.value)}
              className={`${NUMERIC_INPUT} mt-1`}
            />
          </label>
          <button
            onClick={handleFetchSounding}
            disabled={soundingStatus === 'loading'}
            className="min-h-9 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-zinc-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            {soundingStatus === 'loading' ? 'Fetching…' : 'Fetch Live Sounding'}
          </button>
        </div>
        <div className="mt-2 text-[11px] font-mono" role="status" aria-live="polite">
          {soundingStatus === 'idle' ? (
            <span className="text-zinc-500">Ready — set coordinates and fetch a pressure-level profile.</span>
          ) : soundingStatus === 'loading' ? (
            <span className="text-amber-400">Fetching live sounding…</span>
          ) : soundingStatus === 'ok' ? (
            <span className="text-emerald-400">{soundingLayers.length} pressure levels fetched</span>
          ) : (
            <span className="text-rose-400">Sounding failed: {soundingError}</span>
          )}
        </div>
      </div>

      {/* --- Section 3: Monte Carlo dispersion --- */}
      <div className="bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-4">
        {sectionHeader(
          <Navigation className="w-3.5 h-3.5 text-cyan-400" />,
          'Monte Carlo Dispersion',
          `fixed seed — deterministic per input set`,
        )}
        <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2">
          <label className="text-[10px] text-zinc-500 uppercase font-semibold">
            Runs (1–200)
            <input
              type="number"
              min="1"
              max={MC_NRUNS_MAX}
              step="1"
              value={clampNRuns(mcNRuns)}
              aria-label="Monte Carlo run count"
              onChange={(e) => setMcNRuns(clampNRuns(parseFloat(e.target.value) || 1))}
              className={`${NUMERIC_INPUT} mt-1`}
            />
          </label>
          <label className="text-[10px] text-zinc-500 uppercase font-semibold">
            Rail Elev. (°)
            <input
              type="number"
              min={MC_RAIL_ELEVATION_MIN}
              max={MC_RAIL_ELEVATION_MAX}
              step="0.5"
              value={mcRailElevationDeg}
              aria-label="Rail elevation (deg)"
              onChange={(e) => {
                const raw = parseFloat(e.target.value);
                if (Number.isFinite(raw)) setMcRailElevationDeg(clampRailElevation(raw));
              }}
              className={`${NUMERIC_INPUT} mt-1`}
            />
          </label>
          <label className="text-[10px] text-zinc-500 uppercase font-semibold">
            Wind σ (°)
            <input
              type="number"
              min="0"
              max="40"
              step="0.5"
              value={mcWindSigmaDeg}
              aria-label="Wind direction sigma (deg)"
              onChange={(e) => setMcWindSigmaDeg(parseFloat(e.target.value) || 0)}
              className={`${NUMERIC_INPUT} mt-1`}
            />
          </label>
          <label className="text-[10px] text-zinc-500 uppercase font-semibold">
            Rail σ (°)
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={mcRailSigmaDeg}
              aria-label="Rail angle sigma (deg)"
              onChange={(e) => setMcRailSigmaDeg(parseFloat(e.target.value) || 0)}
              className={`${NUMERIC_INPUT} mt-1`}
            />
          </label>
          <label className="text-[10px] text-zinc-500 uppercase font-semibold">
            Impulse σ (%)
            <input
              type="number"
              min="0"
              max="30"
              step="0.5"
              value={mcImpulseSigmaPct}
              aria-label="Impulse sigma (%)"
              onChange={(e) => setMcImpulseSigmaPct(parseFloat(e.target.value) || 0)}
              className={`${NUMERIC_INPUT} mt-1`}
            />
          </label>
        </div>
        <div className="mt-1.5 text-[10px] font-mono text-zinc-500" role="status">
          Wind for MC: {soundingOk
            ? `live sounding, interpolated @ ${probeAltitudeM} m (sounding takes precedence over the manual table)`
            : 'manual wind table (surface probe)'}
        </div>
        <div className="mt-2.5">
          <button
            onClick={handleRunMonteCarlo}
            disabled={mcRunning}
            className="min-h-11 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-zinc-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition inline-flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            <Play className="w-4 h-4 fill-current" />
            {mcRunning ? `Running Monte Carlo (${clampNRuns(mcNRuns)} runs)…` : 'Run Monte Carlo'}
          </button>
        </div>
        {mcError && (
          <div className="mt-2 p-2.5 bg-rose-950/40 rounded-lg border border-rose-500/40 text-rose-300 text-[11px] font-mono" role="alert">
            <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1.5" />
            Monte Carlo failed: {mcError}
          </div>
        )}
        {mcResult && (
          <div className="mt-2.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[11px] font-mono" role="status" aria-live="polite">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">{mcResult.successfulRuns} succeeded · {mcResult.failedRuns} failed</span>
              <span
                className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${
                  mcResultsAreStale
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                    : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                }`}
              >
                {mcResultsAreStale ? 'STALE — inputs changed since run' : 'FRESH — matches current inputs'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Mean Landing</div>
                <div className="font-mono text-emerald-300" aria-label="Mean landing (m)">
                  E {mcResult.mean.x.toFixed(1)} · N {mcResult.mean.y.toFixed(1)} m
                </div>
              </div>
              <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Sigma 1</div>
                <div className="font-mono text-cyan-300" aria-label="Sigma 1 (m)">
                  {mcResult.sigma1.toFixed(1)} m
                </div>
              </div>
              <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">Sigma 2</div>
                <div className="font-mono text-cyan-300" aria-label="Sigma 2 (m)">
                  {mcResult.sigma2.toFixed(1)} m
                </div>
              </div>
              <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">r50</div>
                <div className="font-mono text-zinc-100" aria-label="r50 (m)">
                  {mcResult.containmentRadii.r50.toFixed(0)} m
                </div>
              </div>
              <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">r90</div>
                <div className="font-mono text-zinc-100" aria-label="r90 (m)">
                  {mcResult.containmentRadii.r90.toFixed(0)} m
                </div>
              </div>
              <div className="p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase font-semibold">r99</div>
                <div className="font-mono text-zinc-100" aria-label="r99 (m)">
                  {mcResult.containmentRadii.r99.toFixed(0)} m
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- Section 4: boattail + protuberance advisories --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-4">
          {sectionHeader(
            <Wind className="w-3.5 h-3.5 text-rose-400" />,
            'Protuberance Drag',
            'Hoerner parasitic drag, referenced to ref area',
          )}
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <label className="text-[10px] text-zinc-500 uppercase font-semibold">
              Lug Frontal Area (m²)
              <input
                type="number"
                min="0"
                step="any"
                value={lugFrontalAreaM2}
                aria-label="Lug frontal area (m²)"
                onChange={(e) => setLugFrontalAreaM2(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`${NUMERIC_INPUT} mt-1`}
              />
            </label>
            <label className="text-[10px] text-zinc-500 uppercase font-semibold">
              Lug Height (m)
              <input
                type="number"
                min="0"
                step="any"
                value={lugHeightM}
                aria-label="Lug height (m)"
                onChange={(e) => setLugHeightM(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`${NUMERIC_INPUT} mt-1`}
              />
            </label>
            <label className="text-[10px] text-zinc-500 uppercase font-semibold">
              Ref Area (m²)
              <input
                type="number"
                min="0"
                step="any"
                value={refAreaM2}
                aria-label="Ref area (m²)"
                onChange={(e) => setRefAreaM2(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`${NUMERIC_INPUT} mt-1`}
              />
            </label>
            <label className="text-[10px] text-zinc-500 uppercase font-semibold">
              Boundary Layer (m)
              <input
                type="number"
                min="0"
                step="any"
                value={boundaryLayerThicknessM}
                aria-label="Boundary layer thickness (m)"
                onChange={(e) => setBoundaryLayerThicknessM(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`${NUMERIC_INPUT} mt-1`}
              />
            </label>
          </div>
          <div className="mt-2.5 p-2.5 bg-zinc-950/80 rounded-lg border border-zinc-800">
            <div className="text-[10px] text-zinc-500 uppercase font-semibold">Lug Drag Coefficient</div>
            <div className="font-mono text-cyan-300" aria-label="Protuberance drag coefficient">
              {lugCd.toFixed(4)}
            </div>
          </div>
        </div>

        <div className="bg-zinc-950/60 rounded-xl border border-zinc-800/80 p-4">
          {sectionHeader(
            <Navigation className="w-3.5 h-3.5 text-rose-400" />,
            'Boattail Flow Separation',
            '10° half-angle threshold',
          )}
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <label className="text-[10px] text-zinc-500 uppercase font-semibold">
              Fore Dia (m)
              <input
                type="number"
                min="0"
                step="any"
                value={btForeDiameterM}
                aria-label="Fore diameter (m)"
                onChange={(e) => setBtForeDiameterM(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`${NUMERIC_INPUT} mt-1`}
              />
            </label>
            <label className="text-[10px] text-zinc-500 uppercase font-semibold">
              Aft Dia (m)
              <input
                type="number"
                min="0"
                step="any"
                value={btAftDiameterM}
                aria-label="Aft diameter (m)"
                onChange={(e) => setBtAftDiameterM(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`${NUMERIC_INPUT} mt-1`}
              />
            </label>
            <label className="text-[10px] text-zinc-500 uppercase font-semibold">
              Length (m)
              <input
                type="number"
                min="0"
                step="any"
                value={btLengthM}
                aria-label="Transition length (m)"
                onChange={(e) => setBtLengthM(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`${NUMERIC_INPUT} mt-1`}
              />
            </label>
          </div>
          <div
            className={`mt-2.5 p-2.5 rounded-lg border text-[11px] font-mono inline-flex items-center gap-1.5 ${
              boattail.separated
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
            }`}
          >
            {boattail.separated ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            <span aria-label="Transition advisory">
              {boattail.separated ? 'SEPARATED' : 'ATTACHED'} · half-angle {boattail.halfAngleDeg.toFixed(1)}° (
              {btForeDiameterM} → {btAftDiameterM} m over {btLengthM} m)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}