/**
 * Chamber equilibrium and nozzle performance, computed by the native core
 * (`solve_chamber` / `nozzle_performance` through `tauri/bridge`) — the only
 * path. The engine's six performance columns render only when every value is
 * finite; a refused call or a non-finite answer is reported inline instead of
 * a table with invented numbers.
 */
import { useEffect, useState } from 'react';
import { APCP_REFERENCE_PRESSURE } from '../../../propulsion/nozzleChemistry';
import { nozzlePerformance, solveChamber, type NozzlePerformance } from '../../../tauri/bridge';
import { currentRunKey } from '../../store';
import { C } from '../../kit/theme';
import { Button } from '../../kit/Fields';
import { Stat } from '../../kit/Table';

export interface ChamberState {
  kind: 'loading' | 'ok' | 'error';
  eq?: { Tc: number; gamma: number; molWeight: number };
  vac?: NozzlePerformance;
  sea?: NozzlePerformance;
  message?: string;
}

const PE_SEA_LEVEL_PA = 101_325;
const PA_SEA_LEVEL_PA = 101_325;
const PA_VACUUM_PA = 0;
const DEFAULT_PC_PA = APCP_REFERENCE_PRESSURE;
const DEFAULT_PE_PA = PE_SEA_LEVEL_PA;
const DEFAULT_PA_PA = PA_SEA_LEVEL_PA;

const finite = (...values: number[]): boolean => values.every((v) => Number.isFinite(v));

/**
 * One chamber + nozzle computation per Motor stage: the equilibrium at the
 * chosen chamber pressure, then the vacuum and sea-level isentropic pair. The
 * BATES panel reuses this state so the stage loads the core once.
 *
 * `engineIsAvailable()` returning false (`offline`) is reported instead of
 * attempting a call that cannot succeed.
 */
export function useChamberState(
  pcPa: number,
  pePa: number,
  paPa: number,
  offline: boolean,
): ChamberState {
  const [state, setState] = useState<ChamberState>({ kind: 'loading' });
  useEffect(() => {
    if (offline) {
      setState({ kind: 'error', message: 'Chamber equilibrium and nozzle performance need the Astraea engine, and this browser cannot run it (it needs WebAssembly and Web Workers).' });
      return;
    }
    if (!finite(pcPa, pePa, paPa) || pcPa <= 0 || pePa <= 0) {
      setState({ kind: 'error', message: 'Chamber, exit and ambient pressures must be finite and positive.' });
      return;
    }
    let live = true;
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const eq = await solveChamber(pcPa);
        const vac = await nozzlePerformance(eq.Tc, eq.gamma, eq.molWeight, pcPa, pePa, PA_VACUUM_PA);
        const sea = await nozzlePerformance(eq.Tc, eq.gamma, eq.molWeight, pcPa, pePa, paPa);
        if (live) setState({ kind: 'ok', eq, vac, sea });
      } catch (err) {
        if (live) setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { live = false; };
  }, [pcPa, pePa, paPa, offline]);
  return state;
}

const NOZZLE_COLUMNS = [
  { key: 'ispVac', label: 'Isp vac (s)', digits: 1 },
  { key: 'ispSea', label: 'Isp sea (s)', digits: 1 },
  { key: 'cstar', label: 'c* (m/s)', digits: 1 },
  { key: 'cfVac', label: 'Cf vac', digits: 3 },
  { key: 'cfSea', label: 'Cf sea', digits: 3 },
  { key: 'exitMach', label: 'Exit Mach', digits: 2 }
] as const;

export interface ChamberInputs {
  pcMPa: string;
  peKPa: string;
  paKPa: string;
  setPcMPa: (v: string) => void;
  setPeKPa: (v: string) => void;
  setPaKPa: (v: string) => void;
}

export function ChamberNozzlePanel({ chamber, inputs }: { chamber: ChamberState; inputs: ChamberInputs }) {
  const { pcMPa, peKPa, paKPa, setPcMPa, setPeKPa, setPaKPa } = inputs;
  // A run key read keeps this panel anchored to the project's own inputs.
  const runKey = currentRunKey();

  const cells = chamber.kind === 'ok' && chamber.vac !== undefined && chamber.sea !== undefined
    ? [chamber.vac.ispVac, chamber.sea.ispSea, chamber.vac.cstar, chamber.vac.cfVac, chamber.sea.cfSea, chamber.vac.exitMach]
    : null;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: C.muted }}>
          Chamber pressure (MPa)
          <input aria-label="Chamber pressure (MPa)" value={pcMPa} onChange={(e) => setPcMPa(e.target.value)}
            className="w-24 rounded px-2 py-1 font-geist-mono text-[12.5px] outline-none" style={{ background: C.sunken, border: `1px solid ${C.line}`, color: C.fg }} />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: C.muted }}>
          Exit pressure (kPa)
          <input aria-label="Exit pressure (kPa)" value={peKPa} onChange={(e) => setPeKPa(e.target.value)}
            className="w-24 rounded px-2 py-1 font-geist-mono text-[12.5px] outline-none" style={{ background: C.sunken, border: `1px solid ${C.line}`, color: C.fg }} />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: C.muted }}>
          Ambient pressure (kPa)
          <input aria-label="Ambient pressure (kPa)" value={paKPa} onChange={(e) => setPaKPa(e.target.value)}
            className="w-24 rounded px-2 py-1 font-geist-mono text-[12.5px] outline-none" style={{ background: C.sunken, border: `1px solid ${C.line}`, color: C.fg }} />
        </label>
        <Button small onClick={() => { setPcMPa((DEFAULT_PC_PA / 1e6).toFixed(1)); setPeKPa((DEFAULT_PE_PA / 1e3).toFixed(0)); setPaKPa((DEFAULT_PA_PA / 1e3).toFixed(0)); }}>
          Reset to APCP reference
        </Button>
        {runKey !== null && <span className="text-[10.5px]" style={{ color: C.dim }}>Run identity: {runKey.slice(0, 12)}…</span>}
      </div>

      {chamber.kind === 'loading' && <div className="rounded p-2 text-[12px]" style={{ background: C.sunken, border: `1px solid ${C.line}`, color: C.muted }}>Loading chamber equilibrium and nozzle performance from the engine…</div>}
      {chamber.kind === 'error' && <div role="alert" className="rounded p-2 text-[12px]" style={{ background: 'rgba(248,113,133,.08)', border: '1px solid rgba(248,113,133,.35)', color: C.bad }}>Chamber/nozzle unavailable: {chamber.message}</div>}

      {chamber.kind === 'ok' && cells !== null && finite(...cells) && chamber.eq !== undefined && (
        <>
          <div role="table" aria-label="Nozzle performance table">
            <div role="row" className="grid grid-cols-6 gap-2 text-[10.5px] uppercase" style={{ color: C.dim }}>
              {NOZZLE_COLUMNS.map((c) => <div key={c.key}>{c.label}</div>)}
            </div>
            <div role="row" className="grid grid-cols-6 gap-2 font-geist-mono text-[13px]" style={{ color: C.fg }}>
              {NOZZLE_COLUMNS.map((c, i) => <div key={c.key} data-testid={`nozzle-${c.key}`}>{cells[i].toFixed(c.digits)}</div>)}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Tc"><span className="font-geist-mono">{chamber.eq.Tc.toFixed(1)} K</span></Stat>
            <Stat label="γ"><span className="font-geist-mono">{chamber.eq.gamma.toFixed(4)}</span></Stat>
            <Stat label="Molar mass"><span className="font-geist-mono">{chamber.eq.molWeight.toFixed(2)} kg/kmol</span></Stat>
          </div>
          <div className="text-[10.5px]" style={{ color: C.dim }}>Frozen-flow isentropics at the entered chamber pressure; exit at pe, vacuum and sea-level ambient columns.</div>
        </>
      )}
    </div>
  );
}
