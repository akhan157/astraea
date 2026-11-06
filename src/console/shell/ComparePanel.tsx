import { useMemo } from 'react';
import type { RocketVehicle } from '../../core/types';
import type { Design } from '../design';
import { diffDesigns } from '../diff';
import { C } from '../kit/theme';
import { Range } from '../kit/Controls';

export function ComparePanel({ design, checkpoint, checkpointNumber, blend, onBlend, onClose }: {
  design: Design; checkpoint: RocketVehicle | null; checkpointNumber: number;
  blend: number; onBlend: (value: number) => void; onClose: () => void;
}) {
  const changes = useMemo(() => checkpoint ? diffDesigns({ ...design, vehicle: checkpoint }, design) : [], [checkpoint, design]);
  const count = (kind: 'added' | 'removed' | 'modified'): number => new Set(changes.filter((change) => kind === 'modified' ? change.field !== 'added' && change.field !== 'removed' : change.field === kind).map((change) => change.partId ?? change.id)).size;
  const show = (value: unknown): string => value === undefined ? 'unset' : JSON.stringify(value);
  return <section aria-label="Revision comparison" className="max-h-48 shrink-0 overflow-auto px-4 py-3 text-[11.5px]" style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
    <div className="flex items-center gap-3"><strong>Prior edit checkpoint {checkpointNumber || '—'}</strong><button className="ml-auto rounded border px-2 py-1" onClick={onClose}>Close comparison</button></div>
    {!checkpoint ? <p style={{ color: C.muted }}>No prior revision exists yet. No comparison overlay is drawn.</p> : <>
      <p>{count('added')} added · {count('removed')} removed · {count('modified')} modified</p>
      <label className="flex items-center gap-3">Checkpoint <Range ariaLabel="Comparison blend" className="min-w-32 flex-1" min={0} max={100} value={blend} onChange={(value) => onBlend(Math.max(0, Math.min(100, value)))} /> Current {blend}%</label>
      {changes.length === 0 ? <p>No differences from this checkpoint.</p> : <ul className="mt-2 space-y-1">{changes.map((change) => <li key={change.id}><span>{change.label}</span>: <code style={{ color: C.muted }}>{show(change.from)}</code> → <code>{show(change.to)}</code></li>)}</ul>}
    </>}
  </section>;
}
