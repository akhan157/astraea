import type { FinPoint } from '../../core/types';
import { validateFreeformPoints } from '../../aero/finPlanform';
import { C } from '../kit/theme';
import { NumberField } from '../kit/Fields';

/**
 * Numeric table for a freeform fin outline. Point 1 is the root leading edge
 * (0, 0) and the last point the root trailing edge (rootChord, 0); both stay
 * on the body, only the last x moves. Every edit is validated with the same
 * rules the engine enforces, and the reason is shown instead of silently
 * clamping: a runs-refused outline must say why.
 */
export function FreeformPointsEditor({ points, onChange }: { points: FinPoint[]; onChange: (next: FinPoint[]) => void }) {
  let problem: string | null = null;
  try {
    validateFreeformPoints(points);
  } catch (e) {
    problem = (e as Error).message.replace(/^vehicle geometry: /, '');
  }
  const last = points.length - 1;
  const set = (i: number, patch: Partial<FinPoint>) => onChange(points.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const split = (i: number) => {
    const a = points[i];
    const b = points[i + 1];
    onChange([...points.slice(0, i + 1), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ...points.slice(i + 1)]);
  };
  const remove = (i: number) => onChange(points.filter((_, k) => k !== i));
  const btn = 'rounded px-1.5 py-0.5 text-[11px] hover:bg-white/5';
  return (
    <div data-testid="freeform-points">
      <div className="mb-1.5 text-[11px]" style={{ color: C.dim }}>
        x runs aft from the root leading edge, y outward from the body. Point 1 and the last point sit on the body.
      </div>
      <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: C.dim }}>
            <th className="w-6 text-left font-normal">#</th>
            <th className="text-right font-normal">x</th>
            <th className="text-right font-normal">y</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => {
            const edge = i === 0 || i === last;
            return (
              <tr key={i} data-testid={`freeform-point-${i + 1}`}>
                <td style={{ color: C.dim }}>{i + 1}</td>
                <td className="py-0.5 text-right">
                  {i === 0 ? <span className="font-geist-mono" style={{ color: C.dim }}>0 (root LE)</span> : <NumberField width={86} value={p.x} kind="len" min={-3} max={3} onChange={(v) => set(i, { x: v })} />}
                </td>
                <td className="py-0.5 text-right">
                  {edge ? <span className="font-geist-mono" style={{ color: C.dim }}>0</span> : <NumberField width={86} value={p.y} kind="len" min={0} max={3} onChange={(v) => set(i, { y: v })} />}
                </td>
                <td className="text-right whitespace-nowrap">
                  {i < last && <button className={btn} style={{ color: C.muted }} title="Insert a point on the edge to the next point" aria-label={`Insert point after point ${i + 1}`} onClick={() => split(i)}>+</button>}
                  {!edge && <button className={btn} style={{ color: C.muted }} disabled={points.length <= 3} title="Remove this point" aria-label={`Remove point ${i + 1}`} onClick={() => remove(i)}>×</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {problem && (
        <div role="alert" className="mt-2 text-[11.5px] leading-snug" style={{ color: C.bad }}>
          Outline refused: {problem}. Runs and exports stay blocked until this is fixed.
        </div>
      )}
    </div>
  );
}
