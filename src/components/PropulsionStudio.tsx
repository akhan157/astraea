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
 *  3. APCP nozzle performance table — frozen-flow isentropics at the
 *     100-bar reference pressure, design exit pressure pe = 101325 Pa,
 *     vacuum and sea-level ambient columns.
 *
 * Fixed, disclosed ballistics constants of the standalone grain lane:
 * constant linear burn rate 4 mm/s (Saint-Robert n = 0 lane), APCP density
 * 1800 kg/m^3, nozzle throat area 1e-4 m^2, uninhibited end faces.
 * Fail-closed: any throwing computation degrades to a visible message
 * instead of crashing the surface (FlightSimulationTab audit §8 pattern).
 */
import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Flame, Gauge, Layers } from 'lucide-react';
import { CERTIFIED_MOTORS, type MotorSpec } from '../propulsion/motorDatabase';
import {
  chamberPressure,
  regressBates,
  type GrainRegressionTrace,
} from '../propulsion/grainRegression';
import {
  APCP_REFERENCE_PRESSURE,
  apcpEquilibrium,
  performance,
} from '../propulsion/nozzleChemistry';

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

export function PropulsionStudio({}: {}): JSX.Element {
  const [selectedMotorId, setSelectedMotorId] = useState<string>('estes_c6');
  const [outerDmm, setOuterDmm] = useState('54');
  const [coreDmm, setCoreDmm] = useState('18');
  const [lengthMm, setLengthMm] = useState('300');
  const [webStepMm, setWebStepMm] = useState('1');

  const motor: MotorSpec = CERTIFIED_MOTORS[selectedMotorId] ?? CERTIFIED_MOTORS.estes_c6;

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
      // c* from the APCP chamber equilibrium at the 100-bar reference
      // pressure (frozen-flow isentropics, sea-level design exit).
      const eq = apcpEquilibrium();
      const cstar = performance(
        eq.Tc, eq.gamma, eq.molWeight, APCP_REFERENCE_PRESSURE, PE_SEA_LEVEL_PA, PA_VACUUM_PA,
      ).cstar;
      const peakPcPa = chamberPressure(
        peakBurnArea, BURN_RATE_M_S, PROPELLANT_DENSITY_KG_M3, cstar, THROAT_AREA_M2,
      );
      return { ok: true as const, trace, peakBurnArea, peakPcPa };
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
    }
  }, [outerDmm, coreDmm, lengthMm, webStepMm]);

  const nozzle = useMemo(() => {
    try {
      const eq = apcpEquilibrium();
      const vac = performance(
        eq.Tc, eq.gamma, eq.molWeight, APCP_REFERENCE_PRESSURE, PE_SEA_LEVEL_PA, PA_VACUUM_PA,
      );
      const sea = performance(
        eq.Tc, eq.gamma, eq.molWeight, APCP_REFERENCE_PRESSURE, PE_SEA_LEVEL_PA, PA_SEA_LEVEL_PA,
      );
      return {
        ok: true as const,
        Tc: eq.Tc,
        gamma: eq.gamma,
        ispVac: vac.ispVac,
        ispSea: sea.ispSea,
        cstar: vac.cstar,
        cfVac: vac.cfVac,
        cfSea: sea.cfSea,
        exitMach: vac.exitMach,
      };
    } catch (err) {
      return { ok: false as const, message: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const peakIdx = grain.ok ? grain.trace.burnArea.indexOf(grain.peakBurnArea) : -1;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 overflow-hidden select-none">
      {/* Panel header — FlightSimulationTab modal-header styling */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="propulsion-studio-title"
              className="text-sm font-bold text-white uppercase tracking-wider font-mono"
            >
              Propulsion Studio
            </h2>
            <p className="text-xs text-zinc-400">
              Certified motor library, BATES grain regression, and APCP nozzle performance — self-contained panel, no vehicle wiring
            </p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono font-bold">
          PROPULSION
        </span>
      </div>

      <div className="p-5 space-y-5 text-xs text-zinc-200">
        {/* 1 — Certified motor library */}
        <section
          aria-label="Certified motor library"
          className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80"
        >
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Certified Motor</span>
            </label>
            <select
              value={selectedMotorId}
              aria-label="Certified motor"
              onChange={(e) => setSelectedMotorId(e.target.value)}
              className="w-full min-h-11 bg-zinc-800 text-zinc-100 px-3 py-2 rounded-lg border border-zinc-600 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 font-medium cursor-pointer"
            >
              {Object.values(CERTIFIED_MOTORS).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.designation} — {m.totalImpulse} N·s
                </option>
              ))}
            </select>
            <div className="text-[10px] font-mono text-zinc-500">
              {Object.keys(CERTIFIED_MOTORS).length} certified records · RASP .eng thrust curves
            </div>
          </div>

          <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Peak Thrust</div>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                {motor.maxThrust.toFixed(1)} N
              </div>
            </div>
            <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Average Thrust</div>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                {motor.avgThrust.toFixed(1)} N
              </div>
            </div>
            <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Burn Time</div>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                {motor.burnTime.toFixed(2)} s
              </div>
            </div>
            <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Propellant Mass</div>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
                {motor.propellantMass < 1
                  ? `${(motor.propellantMass * 1000).toFixed(1)} g`
                  : `${motor.propellantMass.toFixed(3)} kg`}
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* 2 — BATES grain regression */}
          <section
            aria-label="BATES grain calculator"
            className="space-y-4 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
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
                  className="w-full min-h-9 bg-zinc-800 text-zinc-100 px-2 py-1.5 rounded-lg border border-zinc-600 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 font-mono"
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
                  className="w-full min-h-9 bg-zinc-800 text-zinc-100 px-2 py-1.5 rounded-lg border border-zinc-600 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 font-mono"
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
                  className="w-full min-h-9 bg-zinc-800 text-zinc-100 px-2 py-1.5 rounded-lg border border-zinc-600 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 font-mono"
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
                  className="w-full min-h-9 bg-zinc-800 text-zinc-100 px-2 py-1.5 rounded-lg border border-zinc-600 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 font-mono"
                />
              </label>
            </div>

            {grain.ok ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Peak Burn Area</div>
                    <div className="text-base font-bold font-mono text-cyan-400 mt-1">
                      {grain.peakBurnArea.toFixed(4)} m²
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      {(grain.peakBurnArea * 1e4).toFixed(1)} cm²
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Pc @ Peak Burn Area</div>
                    <div
                      data-testid="peak-chamber-pressure"
                      className="text-base font-bold font-mono text-amber-400 mt-1"
                    >
                      {(grain.peakPcPa / 1e6).toFixed(3)} MPa
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">
                      {(grain.peakPcPa / 1e5).toFixed(1)} bar
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Regression Samples</div>
                    <div className="text-base font-bold font-mono text-zinc-100 mt-1">
                      {grain.trace.webBurned.length}
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">webStep {webStepMm} mm</div>
                  </div>
                  <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Linear Burn Rate</div>
                    <div className="text-base font-bold font-mono text-zinc-100 mt-1">
                      {(BURN_RATE_M_S * 1000).toFixed(1)} mm/s
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono">fixed model constant</div>
                  </div>
                </div>

                <div className="p-3 bg-zinc-900/70 rounded-lg border border-zinc-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">
                      Burn Area vs Web Burned
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      peak @ {(grain.trace.webBurned[peakIdx] * 1000).toFixed(1)} mm web
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
                className="p-3 bg-rose-950/60 rounded-xl border border-rose-500/40 text-rose-300 text-xs font-mono"
                role="alert"
              >
                Grain trace unavailable: {grain.message}
              </div>
            )}
          </section>

          {/* 3 — APCP nozzle performance */}
          <section
            aria-label="APCP nozzle performance"
            className="p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Gauge className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
                Nozzle Performance — APCP 70/18/12
              </h3>
            </div>
            <div className="text-[10px] font-mono text-zinc-500 mb-3 mt-1">
              100 bar chamber · pe 101325 Pa · frozen-flow isentropic (nozzleChemistry)
            </div>

            {nozzle.ok ? (
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
                    <tr className="font-mono text-sm text-cyan-300">
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
                className="p-3 bg-rose-950/60 rounded-xl border border-rose-500/40 text-rose-300 text-xs font-mono"
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