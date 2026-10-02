import { create } from 'zustand';
import { useMemo } from 'react';
import { DEFAULT_DESIGN, analyze, gates, simulate, type Design } from './model';

interface DesignStore {
  design: Design;
  /** Design revision the last committed simulation ran against. */
  simRev: number;
  rev: number;
  set: (patch: Partial<Design>) => void;
  reset: () => void;
  commitSim: () => void;
}

export const useDesignStore = create<DesignStore>((set) => ({
  design: DEFAULT_DESIGN,
  rev: 14,
  simRev: 14,
  set: (patch) => set((s) => ({ design: { ...s.design, ...patch }, rev: s.rev + 1 })),
  reset: () => set((s) => ({ design: DEFAULT_DESIGN, rev: s.rev + 1 })),
  commitSim: () => set((s) => ({ simRev: s.rev }))
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
