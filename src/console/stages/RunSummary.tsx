/**
 * After a run, the answer first: predicted apogee against the mission target
 * and the difference, then the first check that still needs attention with
 * what to do about it. Everything else stays one click away (Verify, the
 * results table).
 */
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { runName, useWS } from '../store';
import { useGates } from '../gates';
import { fixOf } from './Verify';
import { C } from '../kit/theme';
import { ResultValue, ValueUnit } from '../kit/Value';
import { GateStatusText } from '../kit/Status';
import type { FlightRun, Gate } from '../data/contract';

const ORDER: Gate['status'][] = ['fail', 'invalid', 'unknown', 'caution'];

/** The first check that still needs attention: failures, then invalid-run checks, then unknowns, then cautions. */
export function firstOpenFinding(gates: Gate[]): Gate | null {
  for (const status of ORDER) {
    const hit = gates.find((g) => g.status === status);
    if (hit) return hit;
  }
  return null;
}

export function RunSummaryStrip({ run, stale }: { run: FlightRun; stale: boolean }) {
  const s = useWS();
  const gates = useGates();
  const target = s.design.mission.targetApogeeM;
  const apogee = run.summary.apogee.value;
  const pct = target > 0 && Number.isFinite(apogee) ? ((apogee - target) / target) * 100 : null;
  const finding = firstOpenFinding(gates);
  const fix = finding ? fixOf(finding) : null;
  const passed = gates.filter((g) => g.status === 'pass').length;
  return (
    <section aria-label="Run summary" data-run-summary className="flex min-w-0 flex-nowrap items-center gap-x-4 overflow-hidden text-[12.5px] whitespace-nowrap" style={{ opacity: stale ? 0.7 : 1 }}>
      <span className="shrink-0 font-medium">{runName(run)}{stale && <span className="ml-1 text-[11px] font-normal" style={{ color: C.changed }}>· design changed since</span>}</span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        Apogee <ResultValue r={run.summary.apogee} label="Predicted apogee" />
        <span style={{ color: C.dim }}>vs target</span> <ValueUnit value={target} kind="dist" />
        {pct !== null && <span className="font-geist-mono text-[11.5px]" style={{ color: Math.abs(pct) <= 5 ? C.ok : C.changed }}>({pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%{Math.abs(pct) <= 5 ? ', within 5%' : ''})</span>}
      </span>
      {finding ? (
        <span className="flex min-w-0 flex-1 items-center gap-2" data-first-finding={finding.id}>
          <span className="shrink-0" style={{ color: C.dim }}>{finding.status === 'caution' ? 'Worth a look:' : 'First to fix:'}</span>
          <span className="shrink-0 font-medium">{finding.label}</span><GateStatusText status={finding.status} />
          {fix && <button type="button" onClick={() => s.set({ stage: fix.stage })} className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11.5px] hover:bg-white/5" style={{ border: `1px solid ${C.line}`, color: C.accent }}>Go to {fix.stage[0].toUpperCase() + fix.stage.slice(1)} <ArrowRight size={11} /></button>}
          {fix && <span className="min-w-0 truncate" style={{ color: C.muted }} title={fix.hint}>{fix.hint}</span>}
        </span>
      ) : gates.length > 0 ? (
        <span className="inline-flex items-center gap-1.5" style={{ color: C.ok }}><CheckCircle2 size={13} aria-hidden="true" />All {passed} checks passed</span>
      ) : null}
    </section>
  );
}
