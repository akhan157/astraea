/**
 * Astraea Propulsion Studio
 *
 * Self-contained panel (no store wiring, no vehicle assignment):
 *  1. Certified motor library — CERTIFIED_MOTORS browse: the <select> lists
 *     designation + total impulse, and the selected record shows peak and
 *     average thrust, burn time, and propellant mass.
 *  2. BATES grain regression calculator — mm numeric inputs (outer diameter,
 *     core diameter, length, web step) driving `regressBates`; an inline SVG
 *     burn-area-vs-burned-web sparkline and the equilibrium chamber pressure
 *     at the peak burn area, with c* from `apcpEquilibrium()`.
 *  3. ThrustCurve.org live motor search (searchMotors) and simfile import
 *     (downloadMotorSimfile -> parseRaspEng/parseRseXml -> store).
 *  4. APCP nozzle performance table — frozen-flow isentropics at the
 *     100-bar reference pressure, design exit pressure pe = 101325 Pa,
 *     vacuum and sea-level ambient columns.
 *
 * Fixed, disclosed ballistics constants of the standalone grain lane:
 * constant linear burn rate 4 mm/s (Saint-Robert n = 0 lane), APCP density
 * 1800 kg/m^3, nozzle throat area 1e-4 m^2, uninhibited end faces.
 * Fail-closed: any throwing computation degrades to a visible message
 * instead of crashing the surface (FlightSimulationTab audit §8 pattern).
 */
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useRocketStore } from '../store/rocketStore';
import { StudioHeader } from './ui/StudioHeader';
import { Download, Flame, Gauge, Layers, Search } from 'lucide-react';
import { CERTIFIED_MOTORS, type MotorSpec } from '../propulsion/motorDatabase';
import {
  searchMotors,
  downloadMotorSimfile,
  type FetchImpl,
  type MotorSummary,
} from '../propulsion/thrustcurveApi';
import { parseRaspEng, parseRseXml } from '../formats/engParser';
import {
  chamberPressure,
  regressBates,
  type GrainRegressionTrace,
} from '../propulsion/grainRegression';
import { APCP_REFERENCE_PRESSURE } from '../propulsion/nozzleChemistry';
import { solveChamber, nozzlePerformance, type NozzlePerformance } from '../tauri/bridge';

const MM = 1e-3;
const BURN_RATE_M_S = 0.004; // constant linear regression rate (n = 0 lane)
const PROPELLANT_DENSITY_KG_M3 = 1800; // APCP approximate
const THROAT_AREA_M2 = 1e-4; // nozzle throat for the pressure estimate
const PE_SEA_LEVEL_PA = 101_325; // design exit pressure, sea-level nozzle
const PA_SEA_LEVEL_PA = 101_325; // sea-level ambient
const PA_VACUUM_PA = 0; // vacuum ambient

/** Normalized viewBox points for the burn-area-vs-web sparkline polyline. */
function burnAreaPolyline(trace: GrainRegressionTrace): string {
  const W = 240;
  const H = 48;
  const PAD = 2;
  const maxWeb = Math.max(...trace.webBurned);
  const maxArea = Math.max(...trace.burnArea);
  if (!(maxWeb > 0) || !(maxArea > 0)) return '';
  const x = (web: number): number => PAD + (web / maxWeb) * (W - 2 * PAD);
  const y = (area: number): number => H - PAD - (area / maxArea) * (H - 2 * PAD);
  return trace.webBurned
    .map((web, i) => `${x(web).toFixed(2)},${y(trace.burnArea[i]).toFixed(2)}`)
    .join(' ');
}

/** Live ThrustCurve search state, driving the inline status + result markers. */
type ThrustCurveSearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; results: MotorSummary[] }
  | { kind: 'error'; message: string };

/** Inline import outcome: success names the motor + impulse, failure the API message. */
type ThrustCurveImportState = { kind: 'ok' | 'error'; message: string } | null;

export interface PropulsionStudioProps {
  /**
   * Injected fetch for the ThrustCurve API client (search + simfile download).
   * Defaults to the global fetch so the app uses the network; tests pass a
   * vi.fn mock. Typed as the client's FetchImpl seam.
   */
  fetchImpl?: FetchImpl;
}

export function PropulsionStudio({ fetchImpl = globalThis.fetch }: PropulsionStudioProps = {}): JSX.Element {
  const customMotors = useRocketStore((s) => s.customMotors);
  // Shared flight-motor selection (Round-19): PropulsionStudio drives the
  // same store id that FlightSim and Trajectory read — one picker, one motor.
  const selectedMotorId = useRocketStore((s) => s.selectedMotorId);
  const selectMotor = useRocketStore((s) => s.selectMotor);
  const catalog: Record<string, MotorSpec> = { ...CERTIFIED_MOTORS, ...customMotors };
  // ThrustCurve live search + simfile import (engine in ../propulsion/thrustcurveApi).
  // All reporting is inline (no modal, no window.alert): search state drives the
  // data-thrustcurve-status marker, results the data-thrustcurve-results marker.
  const [searchQuery, setSearchQuery] = useState('');
  const [searchState, setSearchState] = useState<ThrustCurveSearchState>({ kind: 'idle' });
  const [importState, setImportState] = useState<ThrustCurveImportState>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const runSearch = async (): Promise<void> => {
    const query = searchQuery.trim();
    if (query.length === 0) {
      setImportState(null);
      setSearchState({ kind: 'error', message: 'Enter a motor designation or manufacturer before searching.' });
      return;
    }
    setImportState(null);
    setSearchState({ kind: 'loading' });
    try {
      // hasDataFiles keeps the list to motors whose curve can actually be
      // imported, so a result row never dead-ends at download time.
      const results = await searchMotors(
        { designation: query, hasDataFiles: true, maxResults: 25 },
        fetchImpl,
      );
      setSearchState({ kind: 'ok', results });
    } catch (err) {
      setSearchState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const importMotor = async (summary: MotorSummary): Promise<void> => {
    setImportingId(summary.id);
    setImportState(null);
    try {
      const text = await downloadMotorSimfile(summary.id, fetchImpl);
      // RASP .eng is the default; RockSim .rse is the fallback and arrives as XML.
      const motor = text.trim().startsWith('<') ? parseRseXml(text) : parseRaspEng(text);
      useRocketStore.getState().importCustomMotor(motor);
      setImportState({
        kind: 'ok',
        message: `Imported ${motor.designation} (${motor.totalImpulse.toFixed(1)} N·s total impulse) — now in the motor catalog.`,
      });
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      setImportState({ kind: 'error', message: `Import failed: ${why}` });
    } finally {
      setImportingId(null);
    }
  };
  const [outerDmm, setOuterDmm] = useState('54');
  const [coreDmm, setCoreDmm] = useState('18');
  const [lengthMm, setLengthMm] = useState('300');
  const [webStepMm, setWebStepMm] = useState('1');

  const motor: MotorSpec = catalog[selectedMotorId] ?? CERTIFIED_MOTORS.estes_c6;
  // Chamber equilibrium + nozzle isentropics come from the Rust core.
  // Grain regression stays TS-local (geometry, not an engine in scope).
  const [eqState, setEqState] = useState<
    { ok: true; Tc: number; gamma: number; molWeight: number } | { ok: false; message: string } | null
  >(null);
  useEffect(() => {
    let live = true;
    setEqState(null);
    void solveChamber(APCP_REFERENCE_PRESSURE)
      .then((eq) => { if (live) setEqState({ ok: true as const, Tc: eq.Tc, gamma: eq.gamma, molWeight: eq.molWeight }); })
      .catch((err: unknown) => { if (live) setEqState({ ok: false as const, message: err instanceof Error ? err.message : String(err) }); });
    return () => { live = false; };
  }, []);
  const [nozzlePerf, setNozzlePerf] = useState<
    { ok: true; vac: NozzlePerformance; sea: NozzlePerformance } | { ok: false; message: string } | null
  >(null);
  useEffect(() => {
    let live = true;
    setNozzlePerf(null);
    if (eqState === null) return () => { live = false; };
    if (!eqState.ok) {
      setNozzlePerf({ ok: false as const, message: eqState.message });
      return () => { live = false; };
    }
    void (async () => {
      try {
        const vac = await nozzlePerformance(
          eqState.Tc, eqState.gamma, eqState.molWeight, APCP_REFERENCE_PRESSURE, PE_SEA_LEVEL_PA, PA_VACUUM_PA,
        );
        const sea = await nozzlePerformance(
          eqState.Tc, eqState.gamma, eqState.molWeight, APCP_REFERENCE_PRESSURE, PE_SEA_LEVEL_PA, PA_SEA_LEVEL_PA,
        );
        if (live) setNozzlePerf({ ok: true as const, vac, sea });
      } catch (err: unknown) {
        if (live) setNozzlePerf({ ok: false as const, message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { live = false; };
  }, [eqState]);
  const grain = useMemo(() => {
    try {
      const outerDiameter = parseFloat(outerDmm) * MM;
      const coreDiameter = parseFloat(coreDmm) * MM;
      const length = parseFloat(lengthMm) * MM;
      const webStep = parseFloat(webStepMm) * MM;
      const trace = regressBates(
        { outerDiameter, coreDiameter, length, inhibitedEnds: false },
        webStep,
        BURN_RATE_M_S,
      );
      const peakBurnArea = Math.max(...trace.burnArea);
      if (eqState === null) return { ok: false as const, message: 'Chamber equilibrium loading from native core…' };
      if (!eqState.ok) return { ok: false as const, message: eqState.message };
      if (nozzlePerf === null) return { ok: false as const, message: 'Nozzle performance loading from native core…' };
      if (!nozzlePerf.ok) return { ok: false as const, message: nozzlePerf.message };
      // c* from the APCP chamber equilibrium at the 100-bar reference
      // pressure (frozen-flow isentropics, sea-level design exit).
      const cstar = nozzlePerf.vac.cstar;
      const peakPcPa = chamberPressure(
        peakBurnArea, BURN_RATE_M_S, PROPELLANT_DENSITY_KG_M3, cstar, THROAT_AREA_M2,
      );
      return { ok: true as const, trace, peakBurnArea, peakPcPa };
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
    }
  }, [outerDmm, coreDmm, lengthMm, webStepMm, eqState, nozzlePerf]);

  const nozzle = (() => {
    if (eqState === null || nozzlePerf === null) return null;
    if (!eqState.ok) return { ok: false as const, message: eqState.message };
    if (!nozzlePerf.ok) return { ok: false as const, message: nozzlePerf.message };
    return {
      ok: true as const,
      Tc: eqState.Tc,
      gamma: eqState.gamma,
      ispVac: nozzlePerf.vac.ispVac,
      ispSea: nozzlePerf.sea.ispSea,
      cstar: nozzlePerf.vac.cstar,
      cfVac: nozzlePerf.vac.cfVac,
      cfSea: nozzlePerf.sea.cfSea,
      exitMach: nozzlePerf.vac.exitMach,
    };
  })();
  return (
    <div className="rounded-lg border border-white/8 bg-[#0F1011] overflow-hidden select-none">
      <StudioHeader
        icon={<Flame className="w-5 h-5" />}
        title="Propulsion Studio"
        subtitle="Certified motor library, BATES grain regression, and APCP nozzle performance — self-contained panel, no vehicle wiring"
        chips={
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-zinc-300 border border-white/8">
            PROPULSION
          </span>
        }
        titleId="propulsion-studio-title"
      />

      <div className="p-5 space-y-5 text-xs text-zinc-200">
        {/* 1 — Certified motor library */}
        <section
          aria-label="Certified motor library"
          className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-[#08090A] rounded-lg border border-white/8"
        >
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-zinc-400" />
              <span>Certified Motor</span>
            </label>
            <select
              value={selectedMotorId}
              aria-label="Certified motor"
              onChange={(e) => selectMotor(e.target.value)}
              className="w-full min-h-11 bg-[#08090A] text-zinc-100 px-3 py-2 rounded-md border border-white/8 focus-visible:border-[#4C8DFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C8DFF] font-medium cursor-pointer"
            >
              {Object.values(catalog).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.designation} — {m.totalImpulse} N·s
                </option>
              ))}
            </select>
            <div className="text-[10px] font-mono text-zinc-500">
              {Object.keys(CERTIFIED_MOTORS).length} certified
              {Object.keys(customMotors).length > 0 &&
                ` + ${Object.keys(customMotors).length} imported`}
              {' '}records · RASP .eng thrust curves
            </div>
          </div>

          <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-[#08090A] rounded-lg border border-white/8">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Peak Thrust</div>
              <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                {motor.maxThrust.toFixed(1)} N
              </div>
            </div>
            <div className="p-3 bg-[#08090A] rounded-lg border border-white/8">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Average Thrust</div>
              <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                {motor.avgThrust.toFixed(1)} N
              </div>
            </div>
            <div className="p-3 bg-[#08090A] rounded-lg border border-white/8">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Burn Time</div>
              <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                {motor.burnTime.toFixed(2)} s
              </div>
            </div>
            <div className="p-3 bg-[#08090A] rounded-lg border border-white/8">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Propellant Mass</div>
              <div className="text-lg font-bold font-mono text-zinc-100 mt-1">
                {motor.propellantMass < 1
                  ? `${(motor.propellantMass * 1000).toFixed(1)} g`
                  : `${motor.propellantMass.toFixed(3)} kg`}
              </div>
            </div>
          </div>
        </section>

        {/* 2 — ThrustCurve live motor search & import (thrustcurve.org API) */}
        <section
          aria-label="ThrustCurve motor search"
          className="space-y-3 p-4 bg-[#08090A] rounded-lg border border-white/8"
        >
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-white/5 border border-white/8 text-zinc-300">
              <Search className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
              ThrustCurve Motor Search &amp; Import
            </h3>
            <span className="text-[10px] font-mono text-zinc-500 ml-auto">
              thrustcurve.org/api/v1 · certified curves
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={searchQuery}
              aria-label="ThrustCurve search query"
              placeholder="Designation or manufacturer, e.g. C6 or Aerotech"
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSearch();
              }}
              className="flex-1 min-h-11 bg-[#08090A] text-zinc-100 px-3 py-2 rounded-md border border-white/8 focus-visible:border-[#4C8DFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C8DFF]"
            />
            <button
              type="button"
              onClick={() => void runSearch()}
              className="inline-flex items-center justify-center gap-1.5 min-h-11 px-4 py-2 rounded-md bg-[#4C8DFF] text-white font-semibold hover:bg-[#3F7BEA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C8DFF] cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              Search
            </button>
          </div>

          <div
            role="status"
            data-thrustcurve-status={
              searchState.kind === 'error' ? 'error' : searchState.kind === 'ok' ? 'ok' : undefined
            }
            className={
              searchState.kind === 'error'
                ? 'p-2.5 rounded-md bg-rose-950/60 border border-rose-500/40 text-rose-300'
                : 'p-2.5 rounded-md bg-[#0F1011] border border-white/8 text-zinc-400'
            }
          >
            {searchState.kind === 'idle' && 'Search the ThrustCurve.org certified motor database, then import a curve.'}
            {searchState.kind === 'loading' && 'Searching ThrustCurve…'}
            {searchState.kind === 'ok' &&
              (searchState.results.length === 0
                ? 'No motors matched that query.'
                : `${searchState.results.length} motor${searchState.results.length === 1 ? '' : 's'} found.`)}
            {searchState.kind === 'error' && searchState.message}
          </div>

          {searchState.kind === 'ok' && searchState.results.length > 0 && (
            <ul
              aria-label="ThrustCurve search results"
              data-thrustcurve-results={searchState.results.length}
              className="divide-y divide-white/8 rounded-lg border border-white/8 overflow-hidden"
            >
              {searchState.results.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-[#0F1011]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-zinc-100 truncate">{m.designation}</div>
                    <div className="text-[10px] font-mono text-zinc-500 truncate">{m.manufacturer}</div>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-zinc-200">
                    <span>{m.totalImpulseNs.toFixed(1)} N·s</span>
                    <span className="text-zinc-400">{m.diameterMm.toFixed(0)} mm</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Import ${m.designation}`}
                    disabled={importingId === m.id}
                    onClick={() => void importMotor(m)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-9 px-3 py-1.5 rounded-md bg-white/5 border border-white/8 text-zinc-100 font-semibold hover:bg-white/10 disabled:opacity-50 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C8DFF] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {importingId === m.id ? 'Importing…' : 'Import'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {importState !== null && (
            <div
              role="status"
              data-thrustcurve-import={importState.kind}
              className={
                importState.kind === 'ok'
                  ? 'p-2.5 rounded-md bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                  : 'p-2.5 rounded-md bg-rose-950/60 border border-rose-500/40 text-rose-300'
              }
            >
              {importState.message}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* 3 — BATES grain regression */}
          <section
            aria-label="BATES grain calculator"
            className="space-y-4 p-4 bg-[#08090A] rounded-lg border border-white/8"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-white/5 border border-white/8 text-zinc-300">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                BATES Grain Regression (standalone)
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-zinc-400">Outer diameter (mm)</span>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={outerDmm}
                  aria-label="Grain outer diameter (mm)"
                  onChange={(e) => setOuterDmm(e.target.value)}
                  className="w-full min-h-9 bg-[#08090A] text-zinc-100 px-2 py-1.5 rounded-md border border-white/8 focus-visible:border-[#4C8DFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C8DFF] font-mono"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-zinc-400">Core diameter (mm)</span>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={coreDmm}
                  aria-label="Grain core diameter (mm)"
                  onChange={(e) => setCoreDmm(e.target.value)}
                  className="w-full min-h-9 bg-[#08090A] text-zinc-100 px-2 py-1.5 rounded-md border border-white/8 focus-visible:border-[#4C8DFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C8DFF] font-mono"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-zinc-400">Grain length (mm)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={lengthMm}
                  aria-label="Grain length (mm)"
                  onChange={(e) => setLengthMm(e.target.value)}
                  className="w-full min-h-9 bg-[#08090A] text-zinc-100 px-2 py-1.5 rounded-md border border-white/8 focus-visible:border-[#4C8DFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C8DFF] font-mono"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-zinc-400">Web step (mm)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={webStepMm}
                  aria-label="Web step (mm)"
                  onChange={(e) => setWebStepMm(e.target.value)}
                  className="w-full min-h-9 bg-[#08090A] text-zinc-100 px-2 py-1.5 rounded-md border border-white/8 focus-visible:border-[#4C8DFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4C8DFF] font-mono"
                />
              </label>
            </div>

            {grain.ok ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#08090A] rounded-lg border border-white/8">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Peak Burn Area</div>
                    <div className="text-base font-bold font-mono text-zinc-100 mt-1">
                      {grain.peakBurnArea.toFixed(4)} m²
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      {(grain.peakBurnArea * 1e4).toFixed(1)} cm²
                    </div>
                  </div>
                  <div className="p-3 bg-[#08090A] rounded-lg border border-white/8">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Pc @ Peak Burn Area</div>
                    <div
                      data-testid="peak-chamber-pressure"
                      className="text-base font-bold font-mono text-zinc-100 mt-1"
                    >
                      {(grain.peakPcPa / 1e6).toFixed(3)} MPa
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      {(grain.peakPcPa / 1e5).toFixed(1)} bar
                    </div>
                  </div>
                  <div className="p-3 bg-[#08090A] rounded-lg border border-white/8">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Regression Samples</div>
                    <div className="text-base font-bold font-mono text-zinc-100 mt-1">
                      {grain.trace.webBurned.length}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">webStep {webStepMm} mm</div>
                  </div>
                  <div className="p-3 bg-[#08090A] rounded-lg border border-white/8">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Linear Burn Rate</div>
                    <div className="text-base font-bold font-mono text-zinc-100 mt-1">
                      {(BURN_RATE_M_S * 1000).toFixed(1)} mm/s
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">fixed model constant</div>
                  </div>
                </div>

                <div className="p-3 bg-[#08090A] rounded-lg border border-white/8">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                      Burn Area vs Web Burned
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      peak @ {(grain.trace.webBurned[grain.trace.burnArea.indexOf(grain.peakBurnArea)]! * 1000).toFixed(1)} mm web
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 240 48"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Burn area versus burned web sparkline"
                    className="w-full h-16"
                  >
                    <polyline
                      data-testid="burn-area-sparkline"
                      points={burnAreaPolyline(grain.trace)}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </>
            ) : (
              <div
                className="p-3 bg-rose-950/60 rounded-lg border border-rose-500/40 text-rose-300 text-xs"
                role="alert"
              >
                Grain trace unavailable: {grain.message}
              </div>
            )}
          </section>

          {/* 4 — APCP nozzle performance */}
          <section
            aria-label="APCP nozzle performance"
            className="p-4 bg-[#08090A] rounded-lg border border-white/8"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-white/5 border border-white/8 text-zinc-300">
                <Gauge className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                Nozzle Performance — APCP 70/18/12
              </h3>
            </div>
            <div className="text-[10px] font-mono text-zinc-500 mb-3 mt-1">
              100 bar chamber · pe 101325 Pa · frozen-flow isentropic (nozzleChemistry)
            </div>

            {nozzle === null ? (
              <div className="p-3 bg-[#08090A] rounded-lg border border-white/8 text-zinc-400 text-xs">
                Nozzle performance loading from native core…
              </div>
            ) : nozzle.ok ? (
              <>
                <table
                  role="table"
                  aria-label="Nozzle performance table (APCP, 100 bar)"
                  className="w-full text-left"
                >
                  <thead>
                    <tr className="text-[10px] text-zinc-500 uppercase font-semibold">
                      <th className="py-1.5 pr-3">Isp vac (s)</th>
                      <th className="py-1.5 pr-3">Isp sea (s)</th>
                      <th className="py-1.5 pr-3">c* (m/s)</th>
                      <th className="py-1.5 pr-3">C<sub>f</sub> vac</th>
                      <th className="py-1.5 pr-3">C<sub>f</sub> sea</th>
                      <th className="py-1.5">Exit Mach</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="font-mono text-sm text-zinc-100">
                      <td className="py-1.5 pr-3">{nozzle.ispVac.toFixed(1)}</td>
                      <td className="py-1.5 pr-3">{nozzle.ispSea.toFixed(1)}</td>
                      <td className="py-1.5 pr-3">{nozzle.cstar.toFixed(1)}</td>
                      <td className="py-1.5 pr-3">{nozzle.cfVac.toFixed(3)}</td>
                      <td className="py-1.5 pr-3">{nozzle.cfSea.toFixed(3)}</td>
                      <td className="py-1.5">{nozzle.exitMach.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-2 text-[10px] font-mono text-zinc-500">
                  Tc {nozzle.Tc.toFixed(1)} K · γ {nozzle.gamma.toFixed(4)} · 70% AP / 18% Al / 12% HTPB by mass
                </div>
              </>
            ) : (
              <div
                className="p-3 bg-rose-950/60 rounded-lg border border-rose-500/40 text-rose-300 text-xs"
                role="alert"
              >
                Nozzle performance unavailable: {nozzle.message}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
