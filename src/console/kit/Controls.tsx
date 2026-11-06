import { Check, ChevronDown } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { C } from './theme';
import { cn } from './units';

/** Themed native select. The closed control is ours; the option popup stays OS-drawn. */
export function Select({ value, onChange, ariaLabel, id, width, className, style, children, disabled }: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  id?: string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  disabled?: boolean;
}) {
  const widthStyle = width === undefined ? undefined : { width: typeof width === 'number' ? `${width}px` : width };
  return (
    <span className="relative inline-flex min-w-0" style={widthStyle}>
      <select
        id={id}
        data-kit-select
        value={value}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn('w-full appearance-none rounded px-2 py-1 pr-6 text-[12.5px] outline-none focus-visible:ring-1 focus-visible:ring-con-accent disabled:opacity-40', className)}
        style={{ background: C.sunken, border: `1px solid ${C.line}`, color: C.fg, ...style }}
      >
        {children}
      </select>
      <ChevronDown size={11} aria-hidden="true" className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2" style={{ color: C.dim }} />
    </span>
  );
}

/**
 * Themed checkbox. The native input stays the control (role, name, keyboard,
 * form semantics); the visible box is a sibling so it can carry the accent and
 * focus ring. `children` is the optional inline label text.
 */
export function Checkbox({ checked, onChange, ariaLabel, children, className, disabled, invalid, style }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  style?: CSSProperties;
}) {
  const body = (
    <>
      <span className="relative mt-[1px] grid h-3.5 w-3.5 shrink-0 place-items-center">
        <input
          type="checkbox"
          data-kit-checkbox
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none grid h-3.5 w-3.5 place-items-center rounded-[3px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-con-accent peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-con-panel"
          style={checked
            ? { borderColor: C.accent, background: C.accent, color: '#06222A' }
            : { borderColor: invalid ? C.bad : C.lineStrong, background: C.sunken }}
        >
          {checked && <Check size={10} strokeWidth={3} />}
        </span>
      </span>
      {children}
    </>
  );
  const classes = cn('inline-flex items-start gap-2 text-[11.5px]', className);
  const styles = { color: C.fg, ...style };
  // With inline text, a real label supplies the accessible name. Without it,
  // the caller owns the label/aria-label and a span avoids nested labels.
  return children === undefined
    ? <span className={classes} style={styles}>{body}</span>
    : <label className={classes} style={styles}>{body}</label>;
}

/**
 * Themed range. The native input remains the slider (role, name, arrow keys,
 * value semantics); a sibling track and thumb draw the control so no browser
 * native accent leaks through.
 */
export function Range({ value, min, max, step, onChange, ariaLabel, className, disabled, onFocus, onBlur, onPointerDown, onPointerUp, onPointerCancel }: {
  value: number;
  min: number;
  max: number;
  step?: number | string;
  onChange: (value: number) => void;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
}) {
  const span = max - min;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((value - min) / span) * 100)) : 0;
  return (
    <span className={cn('relative flex h-4 w-full items-center', className)}>
      <input
        type="range"
        data-kit-range
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        onFocus={onFocus}
        onBlur={onBlur}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="peer relative z-10 h-4 w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full"
        style={{ background: `linear-gradient(to right, ${C.accent} 0 ${pct}%, rgba(255,255,255,0.12) ${pct}% 100%)` }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-3.5 w-3.5 rounded-full border-2 transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-con-accent peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-con-panel"
        style={{ left: `calc(${pct}% - 7px)`, background: C.accent, borderColor: C.panel }}
      />
    </span>
  );
}
