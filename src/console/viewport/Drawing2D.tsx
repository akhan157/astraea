/**
 * 2D side and aft views with dimensions, for exact numbers (the Quad concept's
 * idea, kept as an optional split). Drawn from the same engine layout as 3D.
 */
import type { RocketVehicle, TrapezoidFinSetComponent, EllipticalFinSetComponent, FreeformFinSetComponent } from '../../core/types';
import type { AeroModelSelection } from '../../application/aeroModel';
import { freeformExtents } from '../../aero/finPlanform';
import { noseR, useLayoutSnapshot } from './Vehicle3D';
import { useWS } from '../store';
import { C } from '../kit/theme';
import { show } from '../kit/units';

export function Drawing2D({ vehicle, aeroModel, selectedId, onPick }: { vehicle: RocketVehicle; aeroModel?: AeroModelSelection; selectedId: string | null; onPick: (id: string) => void }) {
  const units = useWS((s) => s.units);
  const snapshot = useLayoutSnapshot(vehicle, aeroModel);
  if (snapshot === null) return null;
  const lay = snapshot.layout;
  const drawn = snapshot.vehicle;
  const fin = drawn.components.find((c): c is TrapezoidFinSetComponent | EllipticalFinSetComponent | FreeformFinSetComponent => c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset' || c.type === 'freeformfinset');
  const finSpan = (f: NonNullable<typeof fin>) => (f.type === 'freeformfinset' ? freeformExtents(f.points).span : f.span);
  const finRoot = (f: NonNullable<typeof fin>) => (f.type === 'freeformfinset' ? freeformExtents(f.points).rootChord : f.rootChord);
  const maxSpan = fin ? finSpan(fin) : 0;
  const W = 1000, H = 300, pad = 60;
  const sc = (W - pad * 2 - 220) / lay.length;
  const cy = H / 2;
  const X = (x: number) => pad + x * sc;
  const R = (r: number) => r * sc;
  const dim = (v: number) => { const s = show(v, 'len', units); return `${s.text} ${s.unit}`; };
  const stroke = (id: string) => (selectedId === id ? C.accent : '#A9B0B8');

  const shapes = drawn.components.map((c) => {
    const p = lay.parts[c.id]; if (!p) return null;
    const common = { key: c.id, onClick: () => onPick(c.id), style: { cursor: 'pointer' }, fill: selectedId === c.id ? 'rgba(110,231,247,0.08)' : 'rgba(255,255,255,0.025)', stroke: stroke(c.id), strokeWidth: 1.25 };
    if (c.type === 'nosecone') {
      let d = '';
      for (let i = 0; i <= 40; i++) { const x = (i / 40) * c.length; d += `${i ? 'L' : 'M'}${X(p.start + x)} ${cy - R(noseR(c, x))}`; }
      for (let i = 40; i >= 0; i--) { const x = (i / 40) * c.length; d += `L${X(p.start + x)} ${cy + R(noseR(c, x))}`; }
      return <path {...common} d={d + 'Z'} />;
    }
    if (c.type === 'bodytube') return <rect {...common} x={X(p.start)} y={cy - R(c.outerDiameter / 2)} width={R(c.length)} height={R(c.outerDiameter)} />;
    if (c.type === 'transition') return <path {...common} d={`M${X(p.start)} ${cy - R(c.foreDiameter / 2)} L${X(p.end)} ${cy - R(c.aftDiameter / 2)} L${X(p.end)} ${cy + R(c.aftDiameter / 2)} L${X(p.start)} ${cy + R(c.foreDiameter / 2)} Z`} />;
    if (c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset' || c.type === 'freeformfinset') {
      const r0 = lay.radiusAt(p.start + 0.001);
      const pts = c.type === 'freeformfinset'
        ? c.points.map((q) => [q.x, q.y])
        : c.type === 'trapezoidfinset'
        ? [[0, 0], [c.sweepLength, c.span], [c.sweepLength + c.tipChord, c.span], [c.rootChord, 0]]
        : Array.from({ length: 25 }, (_, i) => { const a = (i / 24) * Math.PI; return [c.rootChord / 2 - (Math.cos(a) * c.rootChord) / 2, Math.sin(a) * c.span]; });
      const up = pts.map(([x, y]) => `${X(p.start + x)},${cy - R(r0 + y)}`).join(' ');
      const dn = pts.map(([x, y]) => `${X(p.start + x)},${cy + R(r0 + y)}`).join(' ');
      return <g key={c.id} onClick={() => onPick(c.id)} style={{ cursor: 'pointer' }}><polygon points={up} fill={common.fill} stroke={common.stroke} strokeWidth={1.25} /><polygon points={dn} fill={common.fill} stroke={common.stroke} strokeWidth={1.25} /></g>;
    }
    return null;
  });

  const finP = fin ? lay.parts[fin.id] : null;
  const r0 = finP ? lay.radiusAt(finP.start + 0.001) : lay.refR;
  const dimLine = (x1: number, y1: number, x2: number, y2: number, label: string, vertical = false) => (
    <g style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: 11 }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.muted} strokeWidth={0.8} markerStart="url(#arr)" markerEnd="url(#arr)" />
      <text x={(x1 + x2) / 2 + (vertical ? 6 : 0)} y={(y1 + y2) / 2 - (vertical ? 0 : 5)} textAnchor={vertical ? 'start' : 'middle'} fill={C.fg}>{label}</text>
    </g>
  );
  // Aft view: body circle and fins.
  const ax = W - 130, ay = cy, aR = 70 / Math.max(r0 + maxSpan, 0.0001);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Side and aft views with dimensions">
      <defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 2 L10 5 L0 8" fill="none" stroke={C.muted} /></marker></defs>
      <line x1={pad - 20} x2={X(lay.length) + 20} y1={cy} y2={cy} stroke={C.faint} strokeDasharray="10 4 2 4" />
      {shapes}
      {dimLine(X(0), cy + R(lay.refR) + R(maxSpan) + 34, X(lay.length), cy + R(lay.refR) + R(maxSpan) + 34, `L ${dim(lay.length)}`)}
      {dimLine(X(lay.length) + 18, cy - R(lay.refR), X(lay.length) + 18, cy + R(lay.refR), `Ø ${dim(lay.refR * 2)}`, true)}
      {fin && finP && dimLine(X(finP.start) - 14, cy - R(r0), X(finP.start) - 14, cy - R(r0 + finSpan(fin)), `s ${dim(finSpan(fin))}`, true)}
      {fin && finP && dimLine(X(finP.start), cy - R(r0 + maxSpan) - 18, X(finP.start + finRoot(fin)), cy - R(r0 + maxSpan) - 18, `cr ${dim(finRoot(fin))}`)}
      <text x={pad - 20} y={24} style={{ fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif", fontSize: 11, fill: C.dim, letterSpacing: '0.1em' }}>SIDE</text>
      <g>
        <text x={ax - 80} y={24} style={{ fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif", fontSize: 11, fill: C.dim, letterSpacing: '0.1em' }}>AFT</text>
        <circle cx={ax} cy={ay} r={r0 * aR} fill="rgba(255,255,255,0.025)" stroke="#A9B0B8" strokeWidth={1.25} />
        {fin && Array.from({ length: fin.finCount }).map((_, i) => {
          const a = (i / fin.finCount) * Math.PI * 2 - Math.PI / 2, t = Math.max(1.5, fin.thickness * aR);
          return <rect key={i} x={ax + r0 * aR} y={ay - t / 2} width={finSpan(fin) * aR} height={t} transform={`rotate(${(a * 180) / Math.PI} ${ax} ${ay})`} fill={selectedId === fin.id ? C.accent : '#A9B0B8'} onClick={() => onPick(fin.id)} style={{ cursor: 'pointer' }} />;
        })}
        {fin && <text x={ax} y={ay + (r0 + maxSpan) * aR + 22} textAnchor="middle" style={{ fontFamily: "'Geist Mono', ui-monospace, Menlo, monospace", fontSize: 11, fill: C.fg }}>{fin.finCount} × {dim(fin.thickness)}</text>}
      </g>
    </svg>
  );
}
