/**
 * BATES grain regression and peak chamber pressure.
 *
 * Geometry is a local lane, not a native engine: `propulsion/grainRegression`
 * (`regressBates`, `chamberPressure`) runs in TypeScript exactly as the legacy
 * Propulsion Studio ran it. The c* the quasi-steady balance needs comes from
 * the native chamber equilibrium state the stage already loaded, so nothing is
 * invented when the core is unavailable. A degenerate grain (core >= outer)
 * surfaces the throwing geometry error in a visible `role="alert"`, and the
 * trace is withheld.
 *
 * Disclosed fixed constants, unchanged from the legacy standalone lane:
 * constant linear burn rate 4 mm/s (Saint-Robert n = 0), APCP density
 * 1800 kg/m³, nozzle throat area 1e-4 m², uninhibited end faces.
 */
import { useMemo, useState } from 'react';
import { chamberPressure, regressBates, type GrainRegressionTrace } from '../../../propulsion/grainRegression';
import { C } from '../../kit/theme';
import { Stat } from '../../kit/Table';
import type { ChamberState } from './ChamberNozzlePanel';

const MM = 1e-3;
const BURN_RATE_M_S = 0.004;
const PROPELLANT_DENSITY_KG_M3 = 1800;
const THROAT_AREA_M2 = 1e-4;

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
  return trace.webBurned.map((web, i) => `${x(web).toFixed(2)},${y(trace.burnArea[i]).toFixed(2)}`).join(' ');
}

type GrainResult =
  | { ok: true; trace: GrainRegressionTrace; peakBurnArea: number; peakPcPa: number }
  | { ok: false; message: string };

const FIELD = 'w-[86px] rounded px-2 py-1 font-geist-mono text-[12.5px] outline-none';
const FIELD_STYLE = { background: C.sunken, border: `1px solid ${C.line}`, color: C.fg } as const;

export function BatesPanel({ chamber }: { chamber: ChamberState }) {
  const [outerDmm, setOuterDmm] = useState('54');
  const [coreDmm, setCoreDmm] = useState('18');
  const [lengthMm, setLengthMm] = useState('300');
  const [webStepMm, setWebStepMm] = useState('1');

  const grain: GrainResult = useMemo(() => {
    try {
      const trace = regressBates(
        {
          outerDiameter: parseFloat(outerDmm) * MM,
          coreDiameter: parseFloat(coreDmm) * MM,
          length: parseFloat(lengthMm) * MM,
          inhibitedEnds: false,
        },
        parseFloat(webStepMm) * MM,
        BURN_RATE_M_S,
      );
      const peakBurnArea = Math.max(...trace.burnArea);
      if (chamber.kind === 'loading') return { ok: false, message: 'Chamber equilibrium loading from the engine…' };
      if (chamber.kind === 'error') return { ok: false, message: chamber.message ?? 'Chamber equilibrium unavailable.' };
      const cstar = chamber.vac?.cstar;
      if (cstar === undefined || !Number.isFinite(cstar)) {
        return { ok: false, message: 'Nozzle c* is not finite; the chamber pressure cannot be computed.' };
      }
      return {
        ok: true,
        trace,
        peakBurnArea,
        peakPcPa: chamberPressure(peakBurnArea, BURN_RATE_M_S, PROPELLANT_DENSITY_KG_M3, cstar, THROAT_AREA_M2),
      };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }, [outerDmm, coreDmm, lengthMm, webStepMm, chamber]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: C.muted }}>
          Outer diameter (mm)
          <input aria-label="Grain outer diameter (mm)" value={outerDmm} onChange={(e) => setOuterDmm(e.target.value)} className={FIELD} style={FIELD_STYLE} />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: C.muted }}>
          Core diameter (mm)
          <input aria-label="Grain core diameter (mm)" value={coreDmm} onChange={(e) => setCoreDmm(e.target.value)} className={FIELD} style={FIELD_STYLE} />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: C.muted }}>
          Grain length (mm)
          <input aria-label="Grain length (mm)" value={lengthMm} onChange={(e) => setLengthMm(e.target.value)} className={FIELD} style={FIELD_STYLE} />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: C.muted }}>
          Web step (mm)
          <input aria-label="Grain web step (mm)" value={webStepMm} onChange={(e) => setWebStepMm(e.target.value)} className={FIELD} style={FIELD_STYLE} />
        </label>
      </div>

      {grain.ok ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Peak burn area"><span className="font-geist-mono">{grain.peakBurnArea.toFixed(4)} m²</span></Stat>
            <Stat label="Pc @ peak burn area">
              <span data-testid="peak-chamber-pressure" className="font-geist-mono">
                {(grain.peakPcPa / 1e6).toFixed(3)} MPa
              </span>
            </Stat>
            <Stat label="Regression samples"><span className="font-geist-mono">{grain.trace.webBurned.length}</span></Stat>
            <Stat label="Linear burn rate"><span className="font-geist-mono">{(BURN_RATE_M_S * 1000).toFixed(1)} mm/s</span></Stat>
          </div>
          <div className="rounded p-2" style={{ background: C.sunken, border: `1px solid ${C.line}` }}>
            <div className="mb-1 flex items-baseline justify-between text-[10.5px]" style={{ color: C.dim }}>
              <span className="uppercase">Burn area vs web burned</span>
              <span className="font-geist-mono">peak @ {(grain.trace.webBurned[grain.trace.burnArea.indexOf(grain.peakBurnArea)] * 1000).toFixed(1)} mm web</span>
            </div>
            <svg viewBox="0 0 240 48" preserveAspectRatio="none" role="img" aria-label="Burn area versus burned web sparkline" className="h-16 w-full">
              <polyline data-testid="burn-area-sparkline" points={burnAreaPolyline(grain.trace)} fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinejoin="round" />

            </svg>
          </div>
          <div className="text-[10.5px]" style={{ color: C.dim }}>
            Fixed constants: 4 mm/s burn rate, 1800 kg/m³ propellant, 1e-4 m² throat, uninhibited ends. c* from the native APCP equilibrium.
          </div>
        </>
      ) : (
        <div role="alert" className="rounded p-2 text-[12px]" style={{ background: 'rgba(248,113,133,.08)', border: '1px solid rgba(248,113,133,.35)', color: C.bad }}>
          Grain trace unavailable: {grain.message}
        </div>
      )}
    </div>
  );
}
