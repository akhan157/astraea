import { Tooltip } from 'radix-ui';
import type { ReactNode } from 'react';
import type { Confidence, Result } from '../data/contract';
import { useSessionStore } from '../../state/session';
import { C } from './theme';
import { cn, kindOf, show, type Kind } from './units';

/* ───────────── plain value with unit ───────────── */

export function ValueUnit({ value, kind, digits, size = 'md', className }: { value: number; kind: Kind; digits?: number; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const units = useSessionStore((s) => s.units);
  const v = show(value, kind, units, digits);
  const big = { sm: 'text-[12px]', md: 'text-[13px]', lg: 'text-[18px]', xl: 'text-[26px] leading-none' }[size];
  return (
    <span className={cn('font-geist-mono tnum whitespace-nowrap', big, className)}>
      {v.text}
      {v.unit && <span className="ml-1 text-[0.78em]" style={{ color: C.dim }}>{v.unit}</span>}
    </span>
  );
}

/* ───────────── confidence ───────────── */

export const CONF_LABEL: Record<Confidence, string> = { measured: 'Measured', calibrated: 'Calibrated', modeled: 'Modeled', extrapolated: 'Extrapolated', unknown: 'Unknown' };
export const CONF_ORDER: Confidence[] = ['measured', 'calibrated', 'modeled', 'extrapolated', 'unknown'];
/** Short tags for style B. */
const CONF_TAG: Record<Confidence, string> = { measured: 'MEAS', calibrated: 'CAL', modeled: '', extrapolated: 'EXTRAP', unknown: 'UNKN' };

/** A tiny glyph per level, shared by both styles' tooltips and the legend. */
export function ConfidenceGlyph({ c, size = 6 }: { c: Confidence; size?: number }) {
  const s = size;
  if (c === 'measured') return <svg width={s} height={s} aria-hidden><circle cx={s / 2} cy={s / 2} r={s / 2} fill={C.fg} /></svg>;
  if (c === 'calibrated') return <svg width={s} height={s} aria-hidden><circle cx={s / 2} cy={s / 2} r={s / 2 - 0.75} fill="none" stroke={C.fg} strokeWidth={1.5} /></svg>;
  if (c === 'extrapolated') return <svg width={s + 2} height={s} aria-hidden><path d={`M0 ${s - 0.5} L${(s + 2) / 2} 0.5 L${s + 2} ${s - 0.5} Z`} fill={C.warn} /></svg>;
  if (c === 'unknown') return <span aria-hidden className="font-geist-mono text-[9px] font-semibold leading-none" style={{ color: C.unknown }}>?</span>;
  return <svg width={s} height={s} aria-hidden><line x1={0} y1={s / 2} x2={s} y2={s / 2} stroke={C.dim} strokeWidth={1.5} /></svg>;
}

function ConfidenceTip({ r, children, label }: { r: Result<unknown>; children: ReactNode; label?: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="top" sideOffset={6} className="z-50 max-w-[300px] rounded-md px-3 py-2 text-[12px] shadow-xl" style={{ background: C.raised, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
          {label && <div className="mb-1 text-[11px]" style={{ color: C.muted }}>{label}</div>}
          <div className="flex items-center gap-2 font-medium"><ConfidenceGlyph c={r.confidence} size={7} />{CONF_LABEL[r.confidence]}</div>
          {r.reason && <div className="mt-1 leading-snug" style={{ color: C.muted }}>{r.reason}</div>}
          <Tooltip.Arrow style={{ fill: C.raised }} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/**
 * A result value with its confidence, shown subtly.
 *  A · "marks on the number": modeled is plain; measured/calibrated get a small dot or ring after the
 *      number; extrapolated gets a dotted amber underline; unknown dims the number and adds "?".
 *  B · "gutter + tag": the number is never decorated; a 2px rule to its left encodes the level
 *      (solid = measured/calibrated, none = modeled, dashed amber = extrapolated, dotted gray = unknown)
 *      and only extrapolated/unknown get a small-caps tag after the unit.
 */
export function ResultValue({ r, kind, digits, size = 'md', label, className, changed, forceStyle }: { r: Result; kind?: Kind; digits?: number; size?: 'sm' | 'md' | 'lg' | 'xl'; label?: string; className?: string; changed?: boolean; forceStyle?: 'A' | 'B' }) {
  const globalStyle = useSessionStore((s) => s.confidenceStyle);
  const style = forceStyle ?? globalStyle;
  const units = useSessionStore((s) => s.units);
  const k = kind ?? kindOf(r.unit);
  const v = show(r.value, k, units, digits);
  const big = { sm: 'text-[12px]', md: 'text-[13px]', lg: 'text-[18px]', xl: 'text-[26px] leading-none' }[size];
  const c = r.confidence;
  const numColor = changed ? C.changed : c === 'unknown' ? C.unknown : C.fg;
  const tipTitle = `${CONF_LABEL[c]}${r.reason ? ` — ${r.reason}` : ''}`;

  if (style === 'A') {
    return (
      <ConfidenceTip r={r} label={label}>
        <span tabIndex={0} title={tipTitle} className={cn('inline-flex cursor-help items-baseline gap-1 font-geist-mono tnum whitespace-nowrap outline-none', big, className)} aria-label={`${label ?? ''} ${v.text} ${v.unit}, ${CONF_LABEL[c]}`}>
          <span style={{
            color: numColor, opacity: c === 'unknown' ? 0.75 : 1,
            textDecoration: c === 'extrapolated' ? `underline dotted ${C.warn}` : undefined, textUnderlineOffset: 3, textDecorationThickness: 1.5
          }}>{v.text}</span>
          {v.unit && <span className="text-[0.78em]" style={{ color: C.dim }}>{v.unit}</span>}
          {(c === 'measured' || c === 'calibrated') && <span className="self-start pt-[0.15em]"><ConfidenceGlyph c={c} size={5} /></span>}
          {c === 'unknown' && <span className="self-start"><ConfidenceGlyph c={c} /></span>}
        </span>
      </ConfidenceTip>
    );
  }
  const rule = c === 'measured' || c === 'calibrated' ? `2px solid ${C.muted}` : c === 'extrapolated' ? `2px dashed ${C.warn}` : c === 'unknown' ? `2px dotted ${C.unknown}` : '2px solid transparent';
  return (
    <ConfidenceTip r={r} label={label}>
      <span tabIndex={0} title={tipTitle} className={cn('inline-flex cursor-help items-baseline gap-1 pl-1.5 font-geist-mono tnum whitespace-nowrap outline-none', big, className)} style={{ borderLeft: rule }} aria-label={`${label ?? ''} ${v.text} ${v.unit}, ${CONF_LABEL[c]}`}>
        <span style={{ color: numColor }}>{v.text}</span>
        {v.unit && <span className="text-[0.78em]" style={{ color: C.dim }}>{v.unit}</span>}
        {CONF_TAG[c] && (c === 'extrapolated' || c === 'unknown') && <span className="ml-0.5 self-center rounded-sm px-1 text-[8.5px] font-semibold tracking-wider" style={{ color: c === 'extrapolated' ? C.warn : C.unknown, background: 'rgba(255,255,255,0.04)' }}>{CONF_TAG[c]}</span>}
      </span>
    </ConfidenceTip>
  );
}

/** One line for a panel header: "2 extrapolated · 1 unknown". Silent when everything is modeled or better. */
export function ConfidenceSummary({ results }: { results: Result<unknown>[] }) {
  const ex = results.filter((r) => r.confidence === 'extrapolated').length;
  const un = results.filter((r) => r.confidence === 'unknown').length;
  if (!ex && !un) return null;
  return (
    <span className="inline-flex items-center gap-2 text-[11px]" style={{ color: C.muted }}>
      {ex > 0 && <span className="inline-flex items-center gap-1"><ConfidenceGlyph c="extrapolated" />{ex} extrapolated</span>}
      {un > 0 && <span className="inline-flex items-center gap-1"><ConfidenceGlyph c="unknown" />{un} unknown</span>}
    </span>
  );
}

/* ───────────── delta vs committed run ───────────── */

/** Change against the last committed run. `better` says which direction is good (or 'none' for neutral). */
export function DeltaChip({ now, was, kind, better = 'none', digits, pct }: { now: number; was: number; kind: Kind; better?: 'up' | 'down' | 'none'; digits?: number; pct?: boolean }) {
  const units = useSessionStore((s) => s.units);
  const d = now - was;
  if (!Number.isFinite(d) || Math.abs(d) < 1e-9 || (was !== 0 && Math.abs(d / was) < 0.0005)) return null;
  const good = better === 'none' ? null : (better === 'up') === d > 0;
  const color = good === null ? C.changed : good ? C.ok : C.bad;
  const text = pct && was ? `${d > 0 ? '+' : ''}${((d / was) * 100).toFixed(1)}%` : (() => { const v = show(Math.abs(d), kind, units, digits); return `${d > 0 ? '+' : '−'}${v.text}${v.unit ? ' ' + v.unit : ''}`; })();
  return <span className="font-geist-mono tnum text-[11px] whitespace-nowrap" style={{ color }} title="Change since the committed run">{text}</span>;
}
