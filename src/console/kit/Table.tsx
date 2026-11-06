import { Dialog } from 'radix-ui';
import { FileUp, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { C } from './theme';
import { cn } from './units';
import { Button } from './Fields';

/* ───────────── data table ───────────── */

export interface Column<T> { key: string; label: string; align?: 'left' | 'right'; width?: string; render: (row: T) => ReactNode }

/** A labelled run of rows. A divider row is drawn before every section after the first that has a label. */
export interface TableSection<T> { key: string; label?: ReactNode; rows: T[]; /** Dim the rows as a secondary group. */ quiet?: boolean }

export function DataTable<T>({ rows, sections, columns, rowKey, onRowHover, onRowClick, activeKey, dense }: {
  rows?: T[]; sections?: TableSection<T>[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowHover?: (k: string | null) => void; onRowClick?: (k: string) => void; activeKey?: string | null; dense?: boolean;
}) {
  const grid = columns.map((c) => c.width ?? '1fr').join(' ');
  const groups: TableSection<T>[] = sections ?? [{ key: 'all', rows: rows ?? [] }];
  return (
    <div role="table" className="text-[12.5px]">
      <div role="row" className="sticky top-0 z-10 grid gap-3 px-3 py-1.5 text-[10.5px] tracking-wide uppercase" style={{ gridTemplateColumns: grid, color: C.dim, background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        {columns.map((c) => <span role="columnheader" key={c.key} className={cn('whitespace-nowrap', c.align === 'right' && 'text-right')}>{c.label}</span>)}
      </div>
      {groups.map((group, groupIndex) => (
        <Fragment key={group.key}>
          {groupIndex > 0 && group.label !== undefined && (
            <div role="row" data-table-divider={group.key} className="grid items-center px-3 pt-2 pb-1 text-[10.5px] tracking-wide uppercase" style={{ color: C.dim }}>
              <span role="cell" aria-colspan={columns.length}>{group.label}</span>
            </div>
          )}
          {group.rows.map((r) => {
            const k = rowKey(r);
            return (
              <div role="row" key={k} onPointerEnter={() => onRowHover?.(k)} onPointerLeave={() => onRowHover?.(null)} onClick={() => onRowClick?.(k)}
                className={cn('grid items-center gap-3 px-3', dense ? 'py-1' : 'py-1.5', onRowClick && 'cursor-pointer', 'hover:bg-white/[0.03]', group.quiet && 'opacity-70 hover:opacity-100')}
                data-table-section={group.key}
                style={{ gridTemplateColumns: grid, borderBottom: `1px solid ${C.line}`, background: activeKey === k ? 'rgba(110,231,247,0.06)' : undefined }}>
                {columns.map((c) => <span role="cell" key={c.key} className={cn('min-w-0', c.align === 'right' && 'text-right')}>{c.render(r)}</span>)}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

/* ───────────── import flow: choose → preview with warnings → confirm ───────────── */

export interface Parsed<T> { value: T; preview: ReactNode; warnings: string[] }

export function ImportFlow<T>({ open, setOpen, title, accept, hint, parse, onConfirm, confirmLabel = 'Import' }: {
  open: boolean; setOpen: (o: boolean) => void; title: string; accept: string; hint: string; parse: (text: string, name: string) => Parsed<T>; onConfirm: (v: T) => void; confirmLabel?: string;
}) {
  const [parsed, setParsed] = useState<Parsed<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [over, setOver] = useState(false);
  const reset = () => { setParsed(null); setError(null); setName(''); };
  const read = async (f: File) => {
    setName(f.name); setError(null); setParsed(null);
    try { setParsed(parse(await f.text(), f.name)); } catch (e) { setError((e as Error).message); }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-2xl" style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
          <div className="flex items-center px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
            <Dialog.Title className="text-[14px] font-medium">{title}</Dialog.Title>
            <Dialog.Close className="ml-auto rounded p-1 hover:bg-white/5" aria-label="Close"><X size={14} /></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{hint}</Dialog.Description>
          <div className="space-y-3 p-4">
            {!parsed && (
              <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void read(f); }}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md py-10 text-center" style={{ border: `1px dashed ${over ? C.accent : C.lineStrong}`, background: over ? 'rgba(110,231,247,0.04)' : C.sunken }}>
                <FileUp size={20} color={C.dim} />
                <span className="text-[13px]">Drop a file or <span style={{ color: C.accent }}>choose one</span></span>
                <span className="text-[11.5px]" style={{ color: C.muted }}>{hint}</span>
                <input type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} />
              </label>
            )}
            {error && <div className="flex gap-2 rounded-md p-3 text-[12.5px]" style={{ border: `1px solid rgba(248,113,133,.35)`, color: C.fg }}><AlertTriangle size={14} color={C.bad} className="mt-0.5 shrink-0" /><div><div className="font-medium">Could not read {name}</div><div style={{ color: C.muted }}>{error}</div></div></div>}
            {parsed && (
              <>
                <div className="flex items-center gap-2 text-[12.5px]"><CheckCircle2 size={14} color={C.ok} />Read <span className="font-geist-mono">{name}</span><button onClick={reset} className="ml-auto text-[11.5px]" style={{ color: C.muted }}>Choose another</button></div>
                <div className="rounded-md" style={{ border: `1px solid ${C.line}` }}>{parsed.preview}</div>
                {parsed.warnings.map((w) => <div key={w} className="flex gap-2 text-[12px]" style={{ color: C.muted }}><AlertTriangle size={13} color={C.warn} className="mt-0.5 shrink-0" />{w}</div>)}
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: `1px solid ${C.line}` }}>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button primary disabled={!parsed} onClick={() => { if (parsed) { onConfirm(parsed.value); setOpen(false); reset(); } }}>{confirmLabel}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ───────────── panel chrome ───────────── */

export function PanelHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-[38px] items-center gap-3 px-3" style={{ borderBottom: `1px solid ${C.line}` }}>
      <span className="text-[12.5px] font-medium">{title}</span>
      {sub && <span className="text-[11.5px]" style={{ color: C.muted }}>{sub}</span>}
      <span className="ml-auto flex items-center gap-3">{right}</span>
    </div>
  );
}

export function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10.5px] tracking-wide uppercase" style={{ color: C.dim }}>{label}</div>
      <div>{children}</div>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  );
}
