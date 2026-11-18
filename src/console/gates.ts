/**
 * Every check the console shows (Verify, the stage rail, the status bar and
 * Build's pre-export list): the live stability-at-liftoff check first (it
 * needs no flight, so it is there before any run and never goes stale), then
 * the committed run's flight checks.
 */
import { useMemo } from 'react';
import { useWS } from './store';
import { useProjectStore } from '../state/project';
import { useLiftoffStability } from './hooks';
import { stabilityGate } from './data/liftoffStability';
import type { Gate } from './data/contract';
import { isCandidateFlightModel, resolveFlightModel } from '../application/flightModel';

export function useGates(): Gate[] {
  const run = useWS((s) => s.committed?.run);
  const candidateSelected = useProjectStore((s) => isCandidateFlightModel(resolveFlightModel(s.project.flightModel)));
  const liftoff = useLiftoffStability();
  return useMemo(() => {
    if (candidateSelected) return [];
    const stability = liftoff ? [stabilityGate(liftoff)] : [];
    return [...stability, ...(run?.gates.filter((g) => g.id !== 'static_margin') ?? [])];
  }, [candidateSelected, liftoff, run]);
}
