import { create } from 'zustand';
import { useMemo } from 'react';
import { DEFAULT_DESIGN, analyze, gates, simulate, type Design } from './model';

export interface HistoryEntry { design: Design; label: string; at: number; keys: string }

interface DesignStore {
  design: Design;
  /** Design revision the last committed simulation ran against. */
  simRev: number;
  /** Snapshot of the design at the last committed simulation. */
  simDesign: Design;
  rev: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
  set: (patch: Partial<Design>, label?: string) => void;
  reset: () => void;
  commitSim: () => void;
  undo: () => void;
  redo: () => void;
  jumpTo: (index: number) => void;
}

const LABELS: Partial<Record<keyof Design, string>> = {
  noseShape: 'Nose profile', noseLength: 'Nose length', diameter: 'Diameter', bodyLength: 'Body length', finCount: 'Fin count', finRoot: 'Root chord',
  finTip: 'Tip chord', finSpan: 'Fin span', finSweep: 'Fin sweep', finThickness: 'Fin thickness', material: 'Material', payload: 'Payload', motorId: 'Motor',
  mainChute: 'Main chute', drogueChute: 'Drogue', mainDeploy: 'Main deploy', launchAngle: 'Launch angle', railLength: 'Rail length', wind: 'Wind', targetApogee: 'Target apogee'
};

export const useDesignStore = create<DesignStore>((set) => ({
  design: DEFAULT_DESIGN,
  simDesign: DEFAULT_DESIGN,
  rev: 14,
  simRev: 14,
  past: [],
  future: [],
  set: (patch, label) => set((s) => {
    const keys = Object.keys(patch).sort().join(',');
    if (!keys) return {};
    const now = Date.now();
    const last = s.past[s.past.length - 1];
    // Coalesce continuous drags of the same field into one undo step.
    const merge = last && last.keys === keys && now - last.at < 800;
    const entry: HistoryEntry = { design: s.design, label: label ?? keys.split(',').map((k) => LABELS[k as keyof Design] ?? k).join(', '), at: now, keys };
    const past = merge ? [...s.past.slice(0, -1), { ...last, at: now }] : [...s.past, entry].slice(-100);
    return { design: { ...s.design, ...patch }, rev: s.rev + 1, past, future: [] };
  }),
  reset: () => set((s) => ({ design: DEFAULT_DESIGN, rev: s.rev + 1, past: [...s.past, { design: s.design, label: 'Reset to baseline', at: Date.now(), keys: '*' }], future: [] })),
  commitSim: () => set((s) => ({ simRev: s.rev, simDesign: s.design })),
  undo: () => set((s) => {
    const last = s.past[s.past.length - 1]; if (!last) return {};
    return { design: last.design, rev: s.rev + 1, past: s.past.slice(0, -1), future: [{ ...last, design: s.design }, ...s.future] };
  }),
  redo: () => set((s) => {
    const next = s.future[0]; if (!next) return {};
    return { design: next.design, rev: s.rev + 1, past: [...s.past, { ...next, design: s.design }], future: s.future.slice(1) };
  }),
  jumpTo: (index) => set((s) => {
    // Restore the state *before* past[index] was applied.
    const target = s.past[index]; if (!target) return {};
    const undone = s.past.slice(index);
    const future = undone.map((e, i) => ({ ...e, design: i + 1 < undone.length ? undone[i + 1].design : s.design })).concat(s.future);
    return { design: target.design, rev: s.rev + 1, past: s.past.slice(0, index), future };
  })
}));

/** Live derived engineering values for the current design. */
export function useEngineering() {
  const design = useDesignStore((s) => s.design);
  const rev = useDesignStore((s) => s.rev);
  const simRev = useDesignStore((s) => s.simRev);
  return useMemo(() => {
    const a = analyze(design);
    const r = simulate(design, a);
    return { design, a, r, gates: gates(design, a, r), stale: rev !== simRev, rev };
  }, [design, rev, simRev]);
}

/** Engineering values at the last committed simulation, for deltas and ghosts. */
export function useCommitted() {
  const simDesign = useDesignStore((s) => s.simDesign);
  return useMemo(() => {
    const a = analyze(simDesign);
    return { design: simDesign, a, r: simulate(simDesign, a) };
  }, [simDesign]);
}
