import { ChevronDown, RotateCcw } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSessionStore } from '../../state/session';
import { C } from './theme';
import { cn, show, toSI, type Kind } from './units';
import { Range, Select } from './Controls';

/* ───────────── inspector section ───────────── */

export function InspectorSection({ title, children, defaultOpen = true, right }: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ borderBottom: `1px solid ${C.line}` }}>
      <div className="flex items-center px-4 pt-3 pb-1.5">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex flex-1 items-center gap-1.5 text-left text-[10.5px] font-medium tracking-[0.12em] uppercase" style={{ color: C.dim }}>
          <ChevronDown size={11} style={{ transform: open ? undefined : 'rotate(-90deg)', transition: 'transform .12s' }} />{title}
        </button>
        {right}
      </div>
      {open && <div className="px-4 pb-3">{children}</div>}
    </section>
  );
}

/* ───────────── field row ───────────── */

export function FieldRow({ label, changed, onRevert, children, hint, below }: { label: string; changed?: boolean; onRevert?: () => void; children: ReactNode; hint?: string; below?: ReactNode }) {
  return (
    <div className="group flex min-h-[30px] flex-col gap-1 py-0.5" title={hint}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]" style={{ color: changed ? C.fg : C.muted }}>
          {changed && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.changed }} title="Changed since the committed run" />}
          <span className="truncate">{label}</span>
          {changed && onRevert && <button onClick={onRevert} aria-label={`Revert ${label}`} className="opacity-0 transition-opacity group-hover:opacity-100" title="Revert to the committed value"><RotateCcw size={11} color={C.dim} /></button>}
        </span>
        {children}
      </div>
      {below}
    </div>
  );
}

/**
 * Numeric input in display units. Drag the unit label to scrub; type to set;
 * ↑/↓ nudge (shift = ×10). Values round-trip through SI.
 */
export function NumberField({ value, kind, onChange, min, max, step, digits, width = 92, onGestureStart, onGestureEnd }: { value: number; kind: Kind; onChange: (si: number) => void; min?: number; max?: number; step?: number; digits?: number; width?: number; onGestureStart?: () => void; onGestureEnd?: () => void }) {
  const units = useSessionStore((s) => s.units);
  const shown = show(value, kind, units, digits);
  const [text, setText] = useState(shown.text);
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(shown.text); }, [shown.text, focus]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const commit = (t: string) => {
    const n = parseFloat(t.replace(/,/g, ''));
    if (!Number.isFinite(n)) { setText(shown.text); return; }
    // Blur must not rewrite a value the user never edited, even when a
    // cross-field cap now sits below it.
    if (n === shown.value) return;
    const next = clamp(toSI(n, kind, units));
    if (next !== value) onChange(next);
  };
  const dispStep = step ?? (kind === 'len' ? (units === 'metric' ? 1 : 0.05) : 1);
  const drag = useRef<{ x: number; v: number } | null>(null);
  return (
    <span className="flex items-center rounded" style={{ background: C.sunken, border: `1px solid ${focus ? 'rgba(110,231,247,.5)' : C.line}`, width }}>
      <input
        value={text}
        inputMode="decimal"
        onFocus={(e) => { setFocus(true); e.target.select(); }}
        onBlur={() => { setFocus(false); commit(text); }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setText(shown.text); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const displayValue = parseFloat(text.replace(/,/g, '')) + (e.key === 'ArrowUp' ? 1 : -1) * dispStep * (e.shiftKey ? 10 : 1);
            const nextSI = clamp(toSI(displayValue, kind, units));
            setText(show(nextSI, kind, units, digits).text);
            if (nextSI !== value) onChange(nextSI);
          }
        }}
        className="w-full min-w-0 bg-transparent px-2 py-1 text-right font-geist-mono tnum text-[12.5px] outline-none"
        style={{ color: C.fg }}
      />
      {shown.unit && (
        <span
          className="cursor-ew-resize select-none pr-2 text-[10.5px]"
          style={{ color: C.dim }}
          title="Drag to scrub"
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, v: parseFloat(text.replace(/,/g, '')) }; onGestureStart?.(); }}
          onPointerMove={(e) => { if (!drag.current) return; const n = drag.current.v + Math.round((e.clientX - drag.current.x) / 4) * dispStep; onChange(clamp(toSI(n, kind, units))); }}
          onPointerUp={() => { if (!drag.current) return; drag.current = null; onGestureEnd?.(); }}
          onPointerCancel={() => { if (!drag.current) return; drag.current = null; onGestureEnd?.(); }}
        >{shown.unit}</span>
      )}
    </span>
  );
}

export interface SliderWindow { lo: number; hi: number }

/** Snap a displayed bound inward to the step grid, preserving hard caps. */
function snapToStep(value: number, step: number, direction: 'up' | 'down'): number {
  if (!(step > 0)) return value;
  const text = String(step);
  const decimals = text.includes('.') ? text.split('.')[1].length : 0;
  const units = value / step;
  const snapped = direction === 'up' ? Math.ceil(units - 1e-9) : Math.floor(units + 1e-9);
  return Number((snapped * step).toFixed(decimals));
}

/**
 * Range window around the current display value: [v/2, 2v], widened to a
 * readable minimum span and clamped to the field's hard range. A fixed range
 * over a ~300 px slider is too coarse for long tubes or heavy masses; the
 * window moves with the value instead.
 */
export function sliderWindow(value: number, hardLo: number, hardHi: number, minSpan: number): SliderWindow {
  if (!(hardHi > hardLo)) return { lo: hardLo, hi: hardLo };
  const v = Math.min(hardHi, Math.max(hardLo, value));
  let lo = Math.max(hardLo, v / 2);
  let hi = Math.min(hardHi, v * 2);
  if (hi - lo < minSpan) {
    const span = Math.min(minSpan, hardHi - hardLo);
    lo = Math.max(hardLo, v - span / 2);
    hi = Math.min(hardHi, lo + span);
    lo = Math.max(hardLo, hi - span);
  }
  return { lo, hi };
}

/**
 * Slider in display units for live sizing. `min`/`max` are SI, `step` is in
 * display units; the value round-trips through SI like NumberField. The
 * window freezes on pointerdown or keyboard focus so the thumb never jumps
 * mid-gesture, and is recomputed after release or when the value moves in
 * from somewhere else.
 */
export function SliderField({ value, kind, min, max, step, digits, onChange, ariaLabel, onGestureStart, onGestureEnd }: {
  value: number; kind: Kind; min: number; max: number; step?: number; digits?: number;
  onChange: (si: number) => void; ariaLabel: string;
  onGestureStart?: () => void; onGestureEnd?: () => void;
}) {
  const units = useSessionStore((s) => s.units);
  const shown = show(value, kind, units, digits);
  const hardLo = show(min, kind, units, digits).value;
  const hardHi = Math.max(show(max, kind, units, digits).value, hardLo);
  const displayStep = step ?? (kind === 'len' ? (units === 'metric' ? 1 : 0.05) : kind === 'mass' ? (units === 'metric' ? 0.005 : 0.01) : 1);
  const minSpan = kind === 'len' ? (units === 'metric' ? 50 : 2) : kind === 'mass' ? (units === 'metric' ? 0.1 : 0.22) : Math.max(hardHi - hardLo, displayStep);
  const fresh = sliderWindow(shown.value, hardLo, hardHi, minSpan);
  const [frozen, setFrozen] = useState<SliderWindow | null>(null);
  const frozenRef = useRef<SliderWindow | null>(null);
  // Last window computed while no gesture was active. A press on the track can
  // change the value before React renders, so the freeze must use this window,
  // never one recomputed around the pressed value.
  const preGesture = useRef<SliderWindow>(fresh);
  useLayoutEffect(() => {
    if (frozenRef.current === null) preGesture.current = fresh;
  });
  const freeze = (): void => {
    if (frozenRef.current !== null) return;
    frozenRef.current = preGesture.current;
    setFrozen(preGesture.current);
    onGestureStart?.();
  };
  const unfreeze = (): void => {
    if (frozenRef.current === null) return;
    frozenRef.current = null;
    setFrozen(null);
    onGestureEnd?.();
  };
  const inWindow = frozen !== null && shown.value >= frozen.lo - 1e-9 && shown.value <= frozen.hi + 1e-9;
  const view = inWindow ? frozen : fresh;
  const lo = snapToStep(view.lo, displayStep, 'up');
  const hi = Math.max(snapToStep(view.hi, displayStep, 'down'), lo);
  const thumb = Math.min(hi, Math.max(lo, shown.value));
  return (
    <Range
      ariaLabel={ariaLabel}
      min={lo}
      max={hi}
      step={displayStep}
      value={thumb}
      onChange={(value) => onChange(toSI(value, kind, units))}
      onFocus={freeze}
      onBlur={unfreeze}
      onPointerDown={freeze}
      onPointerUp={unfreeze}
      onPointerCancel={unfreeze}
    />
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, size = 'md' }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <span role="radiogroup" className="inline-flex rounded p-0.5" style={{ background: C.sunken, border: `1px solid ${C.line}` }}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} title={o.title} onClick={() => onChange(o.value)}
          className={cn('rounded-[3px] font-geist-mono', size === 'sm' ? 'px-1.5 py-0 text-[10.5px]' : 'px-2 py-0.5 text-[11.5px]')}
          style={{ background: o.value === value ? C.raised : 'transparent', color: o.value === value ? C.fg : C.dim, boxShadow: o.value === value ? `inset 0 0 0 1px ${C.lineStrong}` : undefined }}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function SelectField({ value, options, onChange, width = 160, ariaLabel }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; width?: number; ariaLabel?: string }) {
  return (
    <Select value={value} ariaLabel={ariaLabel} onChange={onChange} width={width}>
      {options.map((o) => <option key={o.value} value={o.value} style={{ background: C.panel }}>{o.label}</option>)}
    </Select>
  );
}

/** Compact text field in the inspector's sunken/bordered pattern. */
export function TextField({ value, onChange, ariaLabel, id, width = 120, inputMode = 'decimal', invalid, placeholder, onFocus, onBlur }: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  id?: string;
  width?: number;
  inputMode?: 'text' | 'decimal' | 'numeric';
  invalid?: boolean;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <span className="flex items-center rounded" style={{ background: C.sunken, border: `1px solid ${invalid ? C.bad : focus ? 'rgba(110,231,247,.5)' : C.line}`, width }}>
      <input
        id={id}
        value={value}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        inputMode={inputMode}
        placeholder={placeholder}
        onFocus={() => { setFocus(true); onFocus?.(); }}
        onBlur={() => { setFocus(false); onBlur?.(); }}
        onChange={(event) => onChange(event.target.value)}
        className="w-full min-w-0 bg-transparent px-2 py-1 text-right font-geist-mono tnum text-[12.5px] outline-none"
        style={{ color: C.fg }}
      />
    </span>
  );
}

export function Button({ children, onClick, primary, disabled, title, small, type = 'button' }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; title?: string; small?: boolean; type?: 'button' | 'submit' | 'reset' }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={cn('inline-flex items-center gap-1.5 rounded font-medium transition-colors disabled:opacity-40', small ? 'px-2 py-0.5 text-[11.5px]' : 'px-3 py-1.5 text-[12.5px]', !primary && 'hover:bg-white/5')}
      style={primary ? { background: C.accent, color: '#06222A' } : { border: `1px solid ${C.line}`, color: C.fg }}>
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded px-1 font-geist-mono text-[10px]" style={{ border: `1px solid ${C.line}`, color: C.dim }}>{children}</kbd>;
}
