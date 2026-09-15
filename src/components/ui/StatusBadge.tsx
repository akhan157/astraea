/**
 * RIVAL S2 — StatusBadge: shared labeled status with a secondary (non-color)
 * encoding, so meaning never rides on color alone.
 *
 * `pass` is only rendered when the caller has already qualified the result as
 * current and valid (see application/runDisplay); this component never
 * upgrades a stale/invalid state itself.
 */
import React from 'react';

export type BadgeStatus =
  | 'pass'
  | 'fail'
  | 'stale'
  | 'invalid'
  | 'unknown'
  | 'running'
  | 'idle'
  | 'info';

const GLYPH: Record<BadgeStatus, string> = {
  pass: '●',
  fail: '■',
  stale: '▲',
  invalid: '✕',
  unknown: '?',
  running: '◌',
  idle: '○',
  info: 'ℹ',
};

const TONE: Record<BadgeStatus, string> = {
  pass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
  fail: 'bg-red-500/10 text-red-300 border-red-500/40',
  stale: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
  invalid: 'bg-red-500/10 text-red-300 border-red-500/40',
  unknown: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/40',
  running: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40',
  idle: 'bg-zinc-500/10 text-zinc-400 border-zinc-600/60',
  info: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40',
};

export interface StatusBadgeProps {
  status: BadgeStatus;
  /** Human-readable label, e.g. "Stale — motor edited". Always rendered. */
  label: string;
  /** Optional longer explanation for title/aria. */
  detail?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, detail }) => (
  <span
    role="status"
    aria-label={`${status}: ${label}`}
    title={detail ?? label}
    data-status={status}
    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium whitespace-nowrap ${TONE[status]}`}
  >
    <span aria-hidden="true" className="font-mono">
      {GLYPH[status]}
    </span>
    <span>{label}</span>
  </span>
);