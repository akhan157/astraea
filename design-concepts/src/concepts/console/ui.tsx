import { useRef, useState, type ReactNode } from 'react';
import { Slider, Tooltip } from 'radix-ui';
import { cn } from '../../shared/format';

/** Blender-style numeric field: drag the label horizontally to scrub, click the value to type. */
export function ScrubField({
  label, value, onChange, min, max, step, unit, scale = 1, digits = 0, hint
}: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string; scale?: number; digits?: number; hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const start = useRef<{ x: number; v: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const shown = (value * scale).toFixed(digits);

  return (
    <div className="group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 py-1.5">
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            className="cursor-ew-resize select-none truncate text-[12px] text-[#8A9099] hover:text-[#E6E8EB]"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { x: e.clientX, v: value }; }}
            onPointerMove={(e) => { if (!start.current) return; const dx = e.clientX - start.current.x; onChange(clamp(start.current.v + dx * step * (e.shiftKey ? 0.2 : 1))); }}
            onPointerUp={() => (start.current = null)}
          >
            {label}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side="left" sideOffset={6} className="z-50 max-w-56 rounded-md border border-white/10 bg-[#1A1D22] px-2 py-1.5 font-geist text-[11px] text-[#C9CDD3] shadow-xl">
            {hint ?? 'Drag to scrub · Shift for fine'}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
      {editing ? (
        <input
          autoFocus
          aria-label={label}
          className="w-24 rounded border border-[#67E8F9]/50 bg-[#0A0B0D] px-1.5 py-0.5 text-right font-geist-mono text-[12px] text-[#E6E8EB] outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { const n = parseFloat(draft); if (!isNaN(n)) onChange(clamp(n / scale)); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
        />
      ) : (
        <button
          className="tnum w-24 rounded border border-transparent px-1.5 py-0.5 text-right font-geist-mono text-[12px] text-[#E6E8EB] hover:border-white/10 hover:bg-white/[0.03]"
          onClick={() => { setDraft(shown); setEditing(true); }}
        >
          {shown}<span className="ml-1 text-[#5D636C]">{unit}</span>
        </button>
      )}
      <Slider.Root className="rs-root col-span-2" value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label}>
        <Slider.Track className="rs-track bg-white/[0.07]">
          <Slider.Range className="rs-range bg-[#67E8F9]/70" />
        </Slider.Track>
        <Slider.Thumb className="rs-thumb border-2 border-[#67E8F9] bg-[#0A0B0D] shadow-[0_0_0_4px_rgba(103,232,249,0.12)] focus-visible:shadow-[0_0_0_5px_rgba(103,232,249,0.3)]" />
      </Slider.Root>
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] px-4 py-3">
      <header className="mb-1 flex items-center justify-between">
        <h3 className="text-[11px] font-medium tracking-[0.08em] text-[#5D636C] uppercase">{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border border-white/[0.07] bg-[#0A0B0D] p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('flex-1 rounded px-2 py-1 text-[11.5px] transition-colors', value === o.value ? 'bg-white/[0.09] text-[#E6E8EB]' : 'text-[#7A808A] hover:text-[#C9CDD3]')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-white/10 bg-white/[0.04] px-1 font-geist-mono text-[10px] text-[#8A9099]">{children}</kbd>;
}

export const STATE_COLOR = { pass: '#34D399', warn: '#FBBF24', fail: '#FB7185' } as const;
