/**
 * Collapsed caveat: a one-line summary that stays in the reading path, with
 * the full qualification one click away. The full text is always in the DOM
 * (hidden until opened) so assistive tech and text search still find it.
 *
 * `OverflowFold` applies the same pattern to a long single line and only
 * offers "More" when that line actually overflows.
 */
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { C } from './theme';
import { cn } from './units';

/** True when a one-line element is wider than its box, so an ellipsis hides text. */
export function isOverflowing(el: { scrollWidth: number; clientWidth: number } | null): boolean {
  return el !== null && el.scrollWidth > el.clientWidth + 1;
}

/** The kit's one More/Less control: underlined, muted, 11 px, keyboard-native. */
export function FoldButton({ open, controls, onClick, isolate, className }: {
  open: boolean;
  controls?: string;
  onClick: () => void;
  /** Keep the toggle out of a parent click/key handler (used inside clickable gate rows). */
  isolate?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-fold-toggle
      className={cn('text-[11px] underline decoration-dotted underline-offset-2', className)}
      style={{ color: C.muted }}
      aria-expanded={open}
      aria-controls={controls}
      onClick={(event) => { if (isolate === true) event.stopPropagation(); onClick(); }}
      onKeyDown={isolate === true ? (event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); } : undefined}
    >
      {open ? 'Less' : 'More'}
    </button>
  );
}

export type FoldTextProps = {
  'data-gate-reason'?: string;
  title?: string;
};

/**
 * One-line fold for long text. Collapsed, `text` renders on a single
 * ellipsized line; "More" swaps in `expanded` (or the same text wrapped).
 * The control appears when the collapsed line overflows, or always when
 * `always` is set. A ResizeObserver re-decides on width changes; while open
 * the collapsed decision is kept so the control does not vanish.
 */
export function OverflowFold({ text, expanded, always = false, className, style, textProps, isolateToggle }: {
  text: ReactNode;
  expanded?: ReactNode;
  always?: boolean;
  className?: string;
  style?: CSSProperties;
  textProps?: FoldTextProps;
  isolateToggle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(always);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    if (always) {
      setOverflowing(true);
      return;
    }
    // Expanded text wraps, so measuring it would lose the collapsed decision.
    if (open) return;
    const measure = (): void => setOverflowing(isOverflowing(el));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [always, open]);
  const canFold = always || overflowing;
  return (
    <div data-fold data-fold-state={open ? 'open' : 'closed'} className={cn('flex min-w-0 items-baseline gap-1.5', className)} style={style}>
      <div ref={ref} id={id} data-fold-text className={cn('min-w-0', open ? 'break-words' : 'truncate')} {...textProps}>
        {open ? (expanded ?? text) : text}
      </div>
      {canFold && <FoldButton open={open} controls={id} onClick={() => setOpen((value) => !value)} isolate={isolateToggle} className="shrink-0" />}
    </div>
  );
}

export function Caveat({ summary, children, tone = 'dim', defaultOpen = false }: {
  summary: ReactNode;
  children: ReactNode;
  tone?: 'dim' | 'warn';
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const color = tone === 'warn' ? C.warn : C.dim;
  return (
    <div className="text-[11px] leading-[1.45]" style={{ color }} data-caveat>
      <span>{summary}</span>{' '}
      <FoldButton open={open} controls={id} onClick={() => setOpen((value) => !value)} />
      <div id={id} hidden={!open} className="mt-1">{children}</div>
    </div>
  );
}
