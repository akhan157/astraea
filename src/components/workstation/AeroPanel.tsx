/**
 * RIVAL S2 — AeroPanel: the aero studio's center surface.
 *
 * Binds the selected components to the shared stability computation (nose-tip
 * datum margin in calibers, CG/CP positions, over-stability advisory, and
 * per-component normal-force contributions). All numbers come from the shared
 * store computation; missing contributions render an explicit unknown, never
 * zero. The contribution chart is an accessible SVG with a matching data
 * table (no chart dependency).
 */
import React from 'react';
import { useRocketStore } from '../../store/rocketStore';
import { StatusBadge } from '../ui/StatusBadge';

export const AeroPanel: React.FC = () => {
  const stability = useRocketStore((s) => s.stability);
  const vehicle = useRocketStore((s) => s.vehicle);

  const contributions = stability.contributions ?? [];
  const maxCNa = contributions.reduce((m, c) => Math.max(m, Math.abs(c.cna ?? 0)), 0);
  const rows = contributions.map((c) => {
    const component = vehicle.components.find((k) => k.id === c.id);
    return [component?.name ?? c.name ?? c.id, (c.cna ?? NaN).toFixed(3), (c.cp ?? NaN).toFixed(3)];
  });

  return (
    <div className="flex flex-col gap-3 min-w-0" data-studio-panel="aero">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-zinc-100">Aerodynamics &amp; Flutter</h2>
        <StatusBadge
          status={stability.isStable ? 'pass' : 'fail'}
          label={stability.isStable ? `Stable — ${stability.staticMarginCalibers.toFixed(2)} cal` : 'Unstable — inspect contributions'}
          detail={`Static margin ${stability.staticMarginCalibers.toFixed(3)} calibers from the nose-tip datum; stable at ≥ 1.0.`}
        />
        {stability.isOverStable && (
          <StatusBadge
            status="stale"
            label="Over-stable — weathercocking risk"
            detail="Margin above 3 calibers: stable but prone to weathercocking. A trajectory check in the Trajectory studio quantifies drift."
          />
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        {[
          ['CG (nose-tip datum)', `${stability.cg.toFixed(3)} m`],
          ['CP (nose-tip datum)', `${stability.cp.toFixed(3)} m`],
          ['Static margin', `${stability.staticMarginCalibers.toFixed(2)} cal`],
          ['Total CNα', stability.totalCNa.toFixed(3)],
        ].map(([term, value]) => (
          <div key={term} className="rounded-md border border-zinc-700/60 bg-zinc-900/60 px-2 py-1.5">
            <dt className="text-zinc-500">{term}</dt>
            <dd className="font-mono text-zinc-100 text-xs">{value}</dd>
          </div>
        ))}
      </dl>

      <svg
        role="img"
        aria-label="Component normal-force contributions — CNα per component"
        viewBox={`0 0 ${Math.max(1, contributions.length) * 48 + 16} 96`}
        className="h-24 w-full"
      >
        {contributions.map((c, i) => {
          const h = maxCNa > 0 ? (Math.abs(c.cna ?? 0) / maxCNa) * 72 : 0;
          return (
            <rect
              key={c.id}
              x={8 + i * 48}
              y={88 - h}
              width={32}
              height={Math.max(1, h)}
              className="fill-cyan-500/70"
            >
              <title>{`${c.name ?? c.id}: CNα ${(c.cna ?? NaN).toFixed(3)}`}</title>
            </rect>
          );
        })}
      </svg>

      <table className="w-full text-left text-[11px]" aria-label="Component contributions table">
        <thead>
          <tr className="text-zinc-500">
            <th className="text-left px-1.5">Component</th>
            <th className="text-right px-1.5">CNα</th>
            <th className="text-right px-1.5">CP (m)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              <td className="px-1.5 truncate text-zinc-200">{row[0]}</td>
              <td className="px-1.5 text-right font-mono text-zinc-300">{row[1]}</td>
              <td className="px-1.5 text-right font-mono text-zinc-300">{row[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[11px] text-zinc-500">
        Fin flutter bounds and structural loads bind to the selected fin set here in S7; this panel reports the
        shared stability computation every other studio already uses. The chart and table show the same numbers
        (SVG with matching data table — no chart dependency).
      </p>
    </div>
  );
};