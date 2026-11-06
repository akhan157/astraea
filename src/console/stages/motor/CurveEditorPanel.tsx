/**
 * Thrust-curve editor ("make your own", decision C8), in the Motor stage.
 *
 * Starts from the motor selected in the catalog and edits a local copy of its
 * curve with the pure `propulsion/curveEditing` primitives. Every edit is
 * checked live: `validateCurve` lists RASP-convention violations, and
 * `deriveEditedMotor` recomputes impulse, class, burn time and peak thrust
 * from the curve itself (fail-closed through `validateMotorSpec`). Nothing is
 * written to the project until "Save as new motor", which registers a
 * `derived` record and binds it as one undoable step — the source motor,
 * certified or imported, is never modified.
 */
import { useMemo, useRef, useState } from 'react';
import { Plus, Redo2, Trash2, Undo2 } from 'lucide-react';
import type { MotorSpec, ThrustPoint } from '../../../propulsion/motorDatabase';
import { normalizeMotorId } from '../../../propulsion/motorDatabase';
import {
  deletePoint,
  deriveEditedMotor,
  insertPoint,
  makeCurveHistory,
  movePoint,
  validateCurve,
} from '../../../propulsion/curveEditing';
import { consoleActions } from '../../store';
import { C } from '../../kit/theme';
import { Button } from '../../kit/Fields';
import { Stat } from '../../kit/Table';
import { TimeStack } from '../../kit/Charts';

const FIELD = 'w-[86px] rounded px-2 py-1 font-geist-mono text-[12.5px] outline-none';
const FIELD_STYLE = { background: C.sunken, border: `1px solid ${C.line}`, color: C.fg } as const;

type Derived = { ok: true; motor: MotorSpec } | { ok: false; message: string };

export function CurveEditorPanel({ base }: { base: MotorSpec }) {
  const history = useRef(makeCurveHistory());
  const [curve, setCurve] = useState<ThrustPoint[]>(() => {
    const seed = base.thrustCurve.map((p) => ({ time: p.time, thrust: p.thrust }));
    history.current.push(seed);
    return seed;
  });
  const [name, setName] = useState(`${base.designation} (edited)`);
  const [propellantG, setPropellantG] = useState(String(+(base.propellantMass * 1000).toFixed(2)));
  const [totalG, setTotalG] = useState(String(+(base.totalMass * 1000).toFixed(2)));
  const [editError, setEditError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const apply = (edit: () => ThrustPoint[]): void => {
    try {
      const next = edit();
      history.current.push(next);
      setCurve(next);
      setEditError(null);
      setSaved(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    }
  };

  const step = (which: 'undo' | 'redo'): void => {
    const next = which === 'undo' ? history.current.undo() : history.current.redo();
    if (next) {
      setCurve(next);
      setEditError(null);
      setSaved(null);
    }
  };

  const validation = useMemo(() => validateCurve(curve), [curve]);
  const derived: Derived = useMemo(() => {
    if (!validation.ok) return { ok: false, message: 'Fix the curve issues listed above.' };
    try {
      const motor = deriveEditedMotor(base, curve, parseFloat(propellantG) / 1000, parseFloat(totalG) / 1000);
      return { ok: true, motor };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }, [base, curve, propellantG, totalG, validation.ok]);

  const addPoint = (): void =>
    apply(() => {
      // Halfway between the last two points, at the interpolated thrust.
      const a = curve[curve.length - 2];
      const b = curve[curve.length - 1];
      return insertPoint(curve, (a.time + b.time) / 2, (a.thrust + b.thrust) / 2);
    });

  const save = (): void => {
    if (!derived.ok) return;
    const designation = name.trim();
    if (designation.length === 0) {
      setEditError('Name the new motor before saving.');
      return;
    }
    const motor: MotorSpec = { ...derived.motor, id: normalizeMotorId(designation), designation };
    const key = consoleActions.addMotor(motor, {
      source: 'derived',
      note: `edited from ${base.designation}`,
      importedAt: new Date().toISOString(),
    });
    setSaved(`Saved ${designation} as ${key} and selected it for this vehicle. Undo reverts the save.`);
  };

  return (
    <div className="space-y-3 p-3 text-[12px]">
      <p style={{ color: C.muted }}>
        Edit a copy of <span className="font-geist-mono">{base.designation}</span>. Impulse, class, burn time and peak thrust
        are recomputed from the curve. Saving adds a new derived motor; the original is unchanged.
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button small onClick={addPoint}><Plus size={12} />Add point</Button>
            <Button small onClick={() => step('undo')}><Undo2 size={12} />Undo</Button>
            <Button small onClick={() => step('redo')}><Redo2 size={12} />Redo</Button>
          </div>
          <table className="w-full text-left" aria-label="Thrust curve points">
            <thead style={{ color: C.dim }}>
              <tr><th className="font-normal">#</th><th className="font-normal">Time (s)</th><th className="font-normal">Thrust (N)</th><th /></tr>
            </thead>
            <tbody>
              {curve.map((p, i) => (
                <tr key={i}>
                  <td className="pr-2 font-geist-mono" style={{ color: C.dim }}>{i}</td>
                  <td className="py-0.5 pr-2">
                    <input type="number" step="0.01" aria-label={`Point ${i} time`} disabled={i === 0} defaultValue={p.time} key={`t-${i}-${p.time}`}
                      onBlur={(e) => { const t = e.target.valueAsNumber; if (t !== p.time) apply(() => movePoint(curve, i, t, p.thrust)); }}
                      className={FIELD} style={FIELD_STYLE} />
                  </td>
                  <td className="py-0.5 pr-2">
                    <input type="number" step="0.1" aria-label={`Point ${i} thrust`} defaultValue={p.thrust} key={`f-${i}-${p.thrust}`}
                      onBlur={(e) => { const f = e.target.valueAsNumber; if (f !== p.thrust) apply(() => movePoint(curve, i, p.time, f)); }}
                      className={FIELD} style={FIELD_STYLE} />
                  </td>
                  <td>
                    <button aria-label={`Delete point ${i}`} disabled={curve.length <= 2} onClick={() => apply(() => deletePoint(curve, i))} style={{ color: C.dim }}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editError && <p role="alert" style={{ color: C.bad }}>{editError}</p>}
          {!validation.ok && (
            <ul aria-label="Curve issues" className="list-disc pl-4" style={{ color: C.warn }}>
              {validation.violations.map((v, i) => <li key={i}>{v.message}</li>)}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <TimeStack t={curve.map((p) => p.time)} panes={[{ id: 'thrust', label: 'Thrust', kind: 'force', values: curve.map((p) => p.thrust), color: C.s2 }]} cursor={null} onCursor={() => undefined} paneHeight={120} />
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5">Propellant (g)<input type="number" aria-label="Edited propellant mass" value={propellantG} onChange={(e) => setPropellantG(e.target.value)} className={FIELD} style={FIELD_STYLE} /></label>
            <label className="flex items-center gap-1.5">Loaded (g)<input type="number" aria-label="Edited loaded mass" value={totalG} onChange={(e) => setTotalG(e.target.value)} className={FIELD} style={FIELD_STYLE} /></label>
          </div>
          {derived.ok ? (
            <div className="grid grid-cols-4 gap-3" aria-label="Derived motor">
              <Stat label="Total impulse"><span className="font-geist-mono">{derived.motor.totalImpulse.toFixed(2)} N·s</span></Stat>
              <Stat label="Class"><span className="font-geist-mono">{derived.motor.impulseClass}</span></Stat>
              <Stat label="Burn"><span className="font-geist-mono">{derived.motor.burnTime.toFixed(2)} s</span></Stat>
              <Stat label="Peak"><span className="font-geist-mono">{derived.motor.maxThrust.toFixed(1)} N</span></Stat>
            </div>
          ) : (
            <p role="status" style={{ color: C.muted }}>Not a valid motor yet: {derived.message}</p>
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">Name<input aria-label="Edited motor name" value={name} onChange={(e) => setName(e.target.value)} className="w-[180px] rounded px-2 py-1 font-geist-mono text-[12.5px] outline-none" style={FIELD_STYLE} /></label>
            <Button primary small disabled={!derived.ok} onClick={save}>Save as new motor</Button>
          </div>
          {saved && <p role="status" style={{ color: C.ok }}>{saved}</p>}
        </div>
      </div>
    </div>
  );
}
