/**
 * Propellant recipe editor.
 *
 * Bridge only: the ingredient table and the theoretical performance both come
 * from the native core (`ingredient_library` / `propellant_performance`). With
 * no Tauri shell the panel says so — there is no TypeScript fallback, so the
 * numbers on screen are always the engine's.
 */
import { useEffect, useMemo, useState } from 'react';
import { ingredientLibrary, propellantPerformance, type PropellantIngredient, type PropellantResult } from '../../../tauri/bridge';
import { C } from '../../kit/theme';
import { Button, SelectField } from '../../kit/Fields';
import { Stat } from '../../kit/Table';

interface RecipeLine { id: string; mass: number }

type PerfState = { kind: 'idle' | 'running' | 'error'; message?: string; result?: PropellantResult };

const FIELD = 'w-24 rounded px-2 py-1 font-geist-mono text-[12.5px] outline-none';
const FIELD_STYLE = { background: C.sunken, border: `1px solid ${C.line}`, color: C.fg } as const;

export function PropellantRecipePanel({ offline }: { offline: boolean }) {
  const [library, setLibrary] = useState<PropellantIngredient[] | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [lines, setLines] = useState<RecipeLine[]>([]);
  const [pick, setPick] = useState('');
  const [pcBar, setPcBar] = useState('100');
  const [perf, setPerf] = useState<PerfState>({ kind: 'idle' });

  useEffect(() => {
    if (offline) return;
    let live = true;
    void ingredientLibrary()
      .then((lib) => { if (live) setLibrary(lib); })
      .catch((err: unknown) => { if (live) setLibraryError(err instanceof Error ? err.message : String(err)); });
    return () => { live = false; };
  }, [offline]);

  const byId = useMemo(() => {
    const out = new Map<string, PropellantIngredient>();
    for (const ing of library ?? []) out.set(ing.id, ing);
    return out;
  }, [library]);
  const options = useMemo(() => (library ?? []).map((i) => ({ value: i.id, label: `${i.name} (${i.id})` })), [library]);

  const compute = async (): Promise<void> => {
    const pressure = parseFloat(pcBar) * 1e5;
    if (lines.length === 0) {
      setPerf({ kind: 'error', message: 'Add at least one ingredient line before computing.' });
      return;
    }
    if (!Number.isFinite(pressure) || pressure <= 0) {
      setPerf({ kind: 'error', message: 'Chamber pressure must be a finite, positive number in bar.' });
      return;
    }
    setPerf({ kind: 'running' });
    try {
      const result = await propellantPerformance({ recipe: lines.map((l) => ({ ingredientId: l.id, mass: l.mass })), chamberPressure: pressure });
      setPerf({ kind: 'idle', result });
    } catch (err) {
      setPerf({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  if (offline) {
    return (
      <div role="alert" className="m-3 rounded p-2.5 text-[12px]" style={{ background: 'rgba(248,113,133,.08)', border: '1px solid rgba(248,113,133,.35)', color: C.bad }}>
        Propellant recipes need the Astraea engine, and this browser cannot run it (it needs WebAssembly and Web Workers). No recipe can be computed here.
      </div>
    );
  }

  const total = lines.reduce((sum, l) => sum + l.mass, 0);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: C.muted }}>
          Add ingredient
          <SelectField value={pick} options={[{ value: '', label: 'Choose an ingredient…' }, ...options]} width={240} onChange={setPick} />
        </label>
        <Button small disabled={pick === ''} onClick={() => { setLines((prev) => [...prev, { id: pick, mass: 10 }]); setPick(''); }}>Add line</Button>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: C.muted }}>
          Chamber pressure (bar)
          <input aria-label="Recipe chamber pressure (bar)" value={pcBar} onChange={(e) => setPcBar(e.target.value)} className={FIELD} style={FIELD_STYLE} />
        </label>
        <Button primary small disabled={perf.kind === 'running'} onClick={() => void compute()}>Compute performance</Button>
      </div>

      {libraryError !== null && (
        <div role="alert" className="rounded p-2 text-[12px]" style={{ background: 'rgba(248,113,133,.08)', border: '1px solid rgba(248,113,133,.35)', color: C.bad }}>
          Ingredient library unavailable: {libraryError}
        </div>
      )}
      {library === null && libraryError === null && <div className="text-[12px]" style={{ color: C.muted }}>Loading the native ingredient library…</div>}

      {lines.length === 0 ? (
        <div className="text-[12px]" style={{ color: C.muted }}>No recipe lines yet.</div>
      ) : (
        <div className="flex flex-col gap-1">
          {lines.map((line, i) => {
            const ing = byId.get(line.id);
            const percent = total > 0 ? (line.mass / total) * 100 : 0;
            return (
              <div key={`${line.id}-${i}`} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-[12.5px]">{ing?.name ?? line.id}</span>
                <span className="font-geist-mono text-[11.5px]" style={{ color: C.muted }}>{ing ? `${ing.density.toFixed(0)} kg/m³` : '—'}</span>
                <input
                  aria-label={`Mass of ${ing?.name ?? line.id}`}
                  value={String(line.mass)}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, mass: Number.isFinite(value) ? value : 0 } : l)));
                  }}
                  className={FIELD}
                  style={FIELD_STYLE}
                />
                <span className="w-14 text-right font-geist-mono text-[11.5px]" style={{ color: C.dim }}>{percent.toFixed(1)}%</span>
                <Button small onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>Remove</Button>
              </div>
            );
          })}
        </div>
      )}

      {perf.kind === 'running' && <div className="text-[12px]" style={{ color: C.muted }}>Computing shifting-equilibrium performance in the engine…</div>}
      {perf.kind === 'error' && (
        <div role="alert" className="rounded p-2 text-[12px]" style={{ background: 'rgba(248,113,133,.08)', border: '1px solid rgba(248,113,133,.35)', color: C.bad }}>
          Propellant performance unavailable: {perf.message}
        </div>
      )}
      {perf.kind === 'idle' && perf.result !== undefined && <Performance result={perf.result} />}
    </div>
  );
}

/** The four headline results plus the chamber/exit product composition. */
function Performance({ result }: { result: PropellantResult }) {
  const { chamber, exit } = result.equilibrium;
  const frozen = result.frozen;
  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Tc"><span className="font-geist-mono">{chamber.temperature.toFixed(1)} K</span></Stat>
        <Stat label="c* (equilibrium)"><span className="font-geist-mono">{result.equilibrium.cstar.toFixed(1)} m/s</span></Stat>
        <Stat label="Isp (equilibrium)"><span className="font-geist-mono">{result.equilibrium.isp.toFixed(2)} s</span></Stat>
        <Stat label="γ (chamber)"><span className="font-geist-mono">{chamber.gamma.toFixed(4)}</span></Stat>
      </div>
      <div className="text-[10.5px]" style={{ color: C.dim }}>
        Frozen expansion c* {frozen.cstar.toFixed(1)} m/s · exit Mach {exit.mach.toFixed(2)} · chamber density {result.density.toFixed(1)} kg/m³
      </div>
      <table role="table" aria-label="Product species" className="w-full text-left">
        <thead>
          <tr className="text-[10.5px] uppercase" style={{ color: C.dim }}>
            <th className="py-1 pr-3 font-normal">Species</th>
            <th className="py-1 pr-3 font-normal">Chamber mole fraction</th>
            <th className="py-1 font-normal">Exit mole fraction</th>
          </tr>
        </thead>
        <tbody className="font-geist-mono text-[12px]">
          {result.chamberSpecies.map((p) => {
            const atExit = result.exitSpecies.find((e) => e.name === p.name);
            return (
              <tr key={p.name}>
                <td className="py-0.5 pr-3">{p.name}</td>
                <td className="py-0.5 pr-3">{(p.moleFraction * 100).toFixed(2)}%</td>
                <td className="py-0.5">{atExit === undefined ? '—' : `${(atExit.moleFraction * 100).toFixed(2)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
