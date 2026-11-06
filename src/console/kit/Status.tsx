import { AlertTriangle, CheckCircle2, CircleHelp, Construction, Inbox, Loader2, MinusCircle, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Gate, GateStatus, Job, Validity } from '../data/contract';
import { C } from './theme';
import { ResultValue } from './Value';
import { cn } from './units';
import { OverflowFold } from './Caveat';

/* ───────────── freshness ───────────── */

export type Freshness = 'current' | 'stale' | 'running' | 'not-run' | 'failed' | 'live';
const FRESH: Record<Freshness, { label: string; color: string }> = {
  current: { label: 'Current', color: C.ok },
  live: { label: 'Live', color: C.accent },
  stale: { label: 'Stale', color: C.changed },
  running: { label: 'Running', color: C.accent },
  'not-run': { label: 'Not run', color: C.dim },
  failed: { label: 'Run failed', color: C.bad }
};
export function FreshnessBadge({ state, detail, onClick }: { state: Freshness; detail?: string; onClick?: () => void }) {
  const f = FRESH[state];
  const El = onClick ? 'button' : 'span';
  return (
    <El onClick={onClick} className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px]', onClick && 'hover:bg-white/5')} style={{ color: state === 'current' ? C.muted : f.color, border: `1px solid ${state === 'stale' ? 'rgba(245,181,68,.35)' : C.line}` }}>
      {state === 'running' ? <Loader2 size={10} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: f.color }} />}
      {f.label}{detail && <span style={{ color: C.dim }}>· {detail}</span>}
    </El>
  );
}

/* ───────────── run validity (engine's four-state) ───────────── */

export function ValidityBadge({ v, enveloped }: { v: Validity; enveloped: boolean }) {
  const map = { PASS: { c: C.ok, t: 'Valid run' }, FAIL: { c: C.bad, t: 'Invalid run' }, UNKNOWN: { c: C.unknown, t: 'Validity unknown' }, NOT_APPLICABLE: { c: C.dim, t: 'N/A' } }[v];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: C.muted }} title="The engine's own run validity and envelope check">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: map.c }} />{map.t}
      {!enveloped && <span style={{ color: C.unknown }}>· left envelope</span>}
    </span>
  );
}

/* ───────────── gates ───────────── */

const GATE_ICON: Record<GateStatus, { I: typeof CheckCircle2; c: string; t: string }> = {
  pass: { I: CheckCircle2, c: C.ok, t: 'Pass' },
  fail: { I: XCircle, c: C.bad, t: 'Fail' },
  unknown: { I: CircleHelp, c: C.unknown, t: 'Unknown' },
  'n/a': { I: MinusCircle, c: C.dim, t: 'N/A' }
};
/**
 * A gate's reason. Only a passing (or not-applicable) gate folds to one
 * ellipsized line with a More control, and only when that line overflows.
 * A failure or an unknown result always shows its reason in full.
 */
function GateReason({ reason, fold }: { reason: string; fold: boolean }) {
  if (!fold) {
    return <div data-gate-reason className="break-words text-[11.5px] leading-snug" style={{ color: C.muted }} title={reason}>{reason}</div>;
  }
  return (
    <OverflowFold
      text={reason}
      className="text-[11.5px] leading-snug"
      style={{ color: C.muted }}
      textProps={{ 'data-gate-reason': '', title: reason }}
      isolateToggle
    />
  );
}

export function GateRow({ g, stale, onOpen, compact }: { g: Gate; stale?: boolean; onOpen?: () => void; compact?: boolean }) {
  const { I, c, t } = GATE_ICON[g.status];
  return (
    <div role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen?.()}
      className={cn('grid items-center gap-3 px-3', compact ? 'grid-cols-[16px_1fr_auto] py-1.5' : 'grid-cols-[16px_minmax(0,1fr)_auto_auto] py-2.5', onOpen && 'cursor-pointer hover:bg-white/[0.03]')}
      style={{ borderBottom: `1px solid ${C.line}`, opacity: stale ? 0.6 : 1 }}>
      <I size={15} color={c} aria-label={t} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[13px]">{g.label}{stale && <span className="text-[10.5px]" style={{ color: C.changed }}>stale</span>}</div>
        {!compact && <GateReason reason={g.reason} fold={g.status === 'pass' || g.status === 'n/a'} />}
      </div>
      {!compact && <span className="max-w-[130px] text-right font-geist-mono text-[11.5px]" style={{ color: C.dim }}>{g.threshold}</span>}
      <span className="min-w-[72px] text-right">{Number.isFinite(g.value.value) ? <ResultValue r={g.value} label={g.label} /> : <span style={{ color: C.dim }}>—</span>}</span>
    </div>
  );
}

export function GateSummary({ gates }: { gates: Gate[] }) {
  const n = (s: GateStatus) => gates.filter((g) => g.status === s).length;
  return (
    <span className="inline-flex items-center gap-2.5 font-geist-mono text-[11px]">
      <span className="inline-flex items-center gap-1" style={{ color: C.ok }}><CheckCircle2 size={11} />{n('pass')}</span>
      <span className="inline-flex items-center gap-1" style={{ color: n('fail') ? C.bad : C.dim }}><XCircle size={11} />{n('fail')}</span>
      {n('unknown') > 0 && <span className="inline-flex items-center gap-1" style={{ color: C.unknown }}><CircleHelp size={11} />{n('unknown')}</span>}
    </span>
  );
}

/* ───────────── empty / not available ───────────── */

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-2 p-6 text-center">
      <div style={{ color: C.faint }}>{icon ?? <Inbox size={22} />}</div>
      <div className="text-[13px]" style={{ color: C.fg }}>{title}</div>
      {body && <div className="max-w-[340px] text-[12px] leading-relaxed" style={{ color: C.muted }}>{body}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** A labeled slot for a feature that is still being decided. Says what it will be and who owns it. */
export function NotAvailableYet({ title, what, owner, compact }: { title: string; what: string; owner: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-start rounded-md', compact ? 'gap-1.5 p-3' : 'gap-3 p-5')} style={{ border: `1px dashed ${C.lineStrong}`, background: 'repeating-linear-gradient(135deg, transparent 0 9px, rgba(255,255,255,0.018) 9px 10px)' }}>
      <div className="flex items-center gap-2"><Construction size={15} color={C.dim} /><span className="text-[13px] font-medium">{title}</span><span className="rounded px-1.5 py-0.5 text-[10px] tracking-wide" style={{ color: C.muted, border: `1px solid ${C.line}` }}>NOT AVAILABLE YET</span></div>
      <div className="text-[12px] leading-relaxed" style={{ color: C.muted }}>{what}</div>
      {!compact && <div className="text-[11px]" style={{ color: C.dim }}>Owner: {owner}</div>}
    </div>
  );
}

/* ───────────── long-running job ───────────── */

export function JobProgress<T>({ job, onCancel, onDismiss }: { job: Job<T>; onCancel?: () => void; onDismiss?: () => void }) {
  const elapsed = (Date.now() - job.startedAt) / 1000;
  const eta = job.progress > 0.02 && job.state === 'running' ? elapsed / job.progress - elapsed : null;
  const color = job.state === 'failed' ? C.bad : job.state === 'cancelled' ? C.dim : job.state === 'done' ? C.ok : C.accent;
  return (
    <div className="rounded-md p-3" style={{ background: C.raised, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-2 text-[12.5px]">
        {job.state === 'running' ? <Loader2 size={13} className="animate-spin" color={C.accent} /> : job.state === 'failed' ? <AlertTriangle size={13} color={C.bad} /> : job.state === 'done' ? <CheckCircle2 size={13} color={C.ok} /> : <MinusCircle size={13} color={C.dim} />}
        <span>{job.label}</span>
        <span className="ml-auto font-geist-mono tnum text-[11.5px]" style={{ color: C.muted }}>{job.done}/{job.total}{eta !== null && ` · ~${Math.ceil(eta)} s left`}</span>
        {job.state === 'running' && onCancel && <button onClick={onCancel} className="rounded px-2 py-0.5 text-[11.5px] hover:bg-white/5" style={{ border: `1px solid ${C.line}` }}>Cancel</button>}
        {job.state !== 'running' && onDismiss && <button onClick={onDismiss} aria-label="Dismiss" className="rounded p-0.5 hover:bg-white/5"><X size={12} /></button>}
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${job.progress * 100}%`, background: color }} />
      </div>
      {job.state === 'cancelled' && <div className="mt-1.5 text-[11.5px]" style={{ color: C.muted }}>Cancelled after {job.done} of {job.total} runs. The partial ensemble was discarded; no result was recorded.</div>}
      {job.error && <div className="mt-1.5 text-[11.5px]" style={{ color: C.bad }}>{job.error}</div>}
    </div>
  );
}
