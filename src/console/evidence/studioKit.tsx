/**
 * Shared pieces of the flight-evidence cards, in the Console theme: a card
 * frame, label/value rows, plain decimal inputs and small notices. Values the
 * tests read carry `data-value`; everything is styled from `C`.
 */
import type { CSSProperties, JSX, ReactNode } from 'react';
import { C } from '../kit/theme';
import { cn } from '../kit/units';

/** Wrap decimal text into a number; invalid/empty text is null. */
export function toNumber(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function fmt(value: number | null, digits: number, fallback = '—'): string {
  return value === null || !Number.isFinite(value) ? fallback : value.toFixed(digits);
}

export type Tone = 'fg' | 'muted' | 'dim' | 'ok' | 'warn' | 'bad' | 'accent';
const TONE: Record<Tone, string> = { fg: C.fg, muted: C.muted, dim: C.dim, ok: C.ok, warn: C.warn, bad: C.bad, accent: C.accent };
export const toneColor = (tone: Tone): string => TONE[tone];

export const FIELD_STYLE: CSSProperties = { background: C.sunken, border: `1px solid ${C.line}`, color: C.fg };

export function Card({ title, kicker, icon, right, children }: {
  title: string;
  kicker: ReactNode;
  icon: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-3 rounded-md p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <header className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" style={{ color: C.dim }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-medium">{title}</h3>
          <p className="text-[11.5px] leading-snug" style={{ color: C.muted }}>{kicker}</p>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

/** A sunken block that groups related rows. */
export function Well({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={cn('rounded-md p-2.5', className)} style={{ background: C.sunken, border: `1px solid ${C.line}` }}>{children}</div>;
}

export function KvRow({ label, value, unit, tone = 'fg' }: { label: string; value: string; unit?: string; tone?: Tone }): JSX.Element {
  return (
    <div className="flex justify-between gap-3 text-[12px]">
      <span className="text-[10.5px] tracking-wide uppercase" style={{ color: C.dim }}>{label}</span>
      <span className="font-geist-mono tnum text-right" style={{ color: toneColor(tone) }} data-value={value}>
        {value}
        {unit ? <span style={{ color: C.dim }}> {unit}</span> : null}
      </span>
    </div>
  );
}

export function PlainNumberField({ label, value, onChange, step = '0.01', min = '0', suffix }: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  step?: string;
  min?: string;
  suffix?: string;
}): JSX.Element {
  return (
    <div className="flex min-h-9 min-w-24 items-center gap-1.5">
      <label className="w-16 shrink-0 text-[9.5px] leading-tight font-medium uppercase" style={{ color: C.dim }}>{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        step={step}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-16 rounded px-1.5 py-1 font-geist-mono text-[11px] outline-none focus-visible:ring-1"
        style={FIELD_STYLE}
      />
      {suffix ? <span className="shrink-0 font-geist-mono text-[10px]" style={{ color: C.muted }}>{suffix}</span> : null}
    </div>
  );
}

/** A quiet note under a control or result. */
export function Note({ children, tone = 'dim', role }: { children: ReactNode; tone?: Tone; role?: 'status' }): JSX.Element {
  return <p role={role} aria-live={role === undefined ? undefined : 'polite'} className="text-[11px] leading-snug" style={{ color: toneColor(tone) }}>{children}</p>;
}

/** A boxed notice: errors (role=alert), warnings and information. */
export function Notice({ children, tone, role }: { children: ReactNode; tone: 'bad' | 'warn' | 'accent'; role?: 'alert' | 'status' }): JSX.Element {
  const color = toneColor(tone);
  return (
    <div role={role} className="rounded-md px-2.5 py-1.5 text-[11.5px] leading-snug" style={{ color, border: `1px solid ${color}55`, background: `${color}0d` }}>
      {children}
    </div>
  );
}
