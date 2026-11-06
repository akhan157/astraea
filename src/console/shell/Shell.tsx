import { useState, type ReactNode } from 'react';
import { Popover, Dialog } from 'radix-ui';
import { Command } from 'cmdk';
import {
  Target, Box, Flame, Wind, Activity, Umbrella, ShieldCheck, Package, Undo2, Redo2, Search, Play, Loader2, PanelLeft, PanelRight, ChevronRight,
  Rows3, CircleDot, Keyboard, LayoutTemplate, X, Sparkles
} from 'lucide-react';
import type { RocketComponent } from '../../core/types';
import { useWS, STAGES, PRESETS, currentPreflight, currentCandidateReadiness, airframeDraftPending, type StageId } from '../store';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { useChanges, useFreshness, useStability, useCommittedStability } from '../hooks';
import { DEPENDS, RESULTS_OF, type Change } from '../diff';
import { C } from '../kit/theme';
import { show } from '../kit/units';
import { Kbd, Segmented } from '../kit/Fields';
import { ResultValue, DeltaChip } from '../kit/Value';
import { GateSummary, ValidityBadge } from '../kit/Status';
import { ProjectMenu, VehicleNameField } from './ProjectChrome';
import { CopilotPanel } from './CopilotPanel';

export const STAGE_ICON: Record<StageId, typeof Target> = { mission: Target, airframe: Box, motor: Flame, aero: Wind, flight: Activity, recovery: Umbrella, verify: ShieldCheck, build: Package };
import { PART_ICON } from './partsIcons';
import { shortcutLabel } from '../../lib/platform';
export { PART_ICON } from './partsIcons';

/* ───────────── top bar ───────────── */

export function TopBar({ onPalette, onToggleLeft, onToggleRight }: { onPalette: () => void; onToggleLeft?: () => void; onToggleRight?: () => void }) {
  const s = useWS();
  const toggleLeft = onToggleLeft ?? (() => s.set({ leftOpen: !s.leftOpen }));
  const toggleRight = onToggleRight ?? (() => s.set({ rightOpen: !s.rightOpen }));
  const changes = useChanges();
  const flightFreshness = useFreshness('flight');
  const readiness = currentPreflight();
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const candidateReadiness = candidateSelected ? currentCandidateReadiness() : null;
  const ready = candidateSelected
    ? candidateReadiness !== null && candidateReadiness.issues.length === 0 && !airframeDraftPending()
    : readiness.runnable && !airframeDraftPending();
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 px-3" style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
      <span className="flex items-center gap-2 pr-2 text-[13px] font-semibold tracking-tight"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M8 1 L13 14 L8 11 L3 14 Z" fill={C.accent} /></svg><span className="hidden xl:inline">Astraea</span></span>
      <button onClick={toggleLeft} aria-expanded={s.leftOpen} aria-label="Toggle parts panel" className="rounded p-1.5 hover:bg-white/5" title="Parts panel  ["><PanelLeft size={15} color={C.muted} /></button>
      <span className="hidden min-w-0 items-center gap-1.5 text-[12.5px] xl:flex" style={{ color: C.muted }}>
        <span className="truncate">{s.design.mission.name}</span><ChevronRight size={12} />
      </span>
      <VehicleNameField />
      <WhyStale trigger={
        <button className="ml-1 inline-flex max-w-[132px] shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] xl:ml-2 xl:max-w-[190px] xl:px-2.5" style={changes.length ? { color: C.changed, border: '1px solid rgba(245,181,68,.4)', background: 'rgba(245,181,68,.06)' } : { color: C.muted, border: `1px solid ${C.line}` }}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: changes.length ? C.changed : C.ok }} />
          <span className="truncate">{candidateSelected
            ? (s.committed?.candidate
              ? (flightFreshness.state === 'stale' ? 'Candidate result stale: selection or inputs changed' : 'Candidate result · experimental')
              : 'Candidate selection · not run')
            : s.committed
              ? (changes.length ? `${changes.length} change${changes.length > 1 ? 's' : ''} since run r${s.committed.run?.rev}` : `Committed · r${s.committed.run?.rev}`)
              : 'No run yet'}</span>
        </button>
      } />
      <span className="flex items-center">
        <button onClick={() => s.undo()} disabled={!s.canUndo} aria-label="Undo" title={s.canUndo ? `Undo  ${shortcutLabel('undo')}` : 'Nothing to undo'} className="rounded p-1.5 hover:bg-white/5 disabled:opacity-30"><Undo2 size={14} color={C.muted} /></button>
        <button onClick={() => s.redo()} disabled={!s.canRedo} aria-label="Redo" title={`Redo  ${shortcutLabel('redo')}`} className="rounded p-1.5 hover:bg-white/5 disabled:opacity-30"><Redo2 size={14} color={C.muted} /></button>
      </span>
      <ProjectMenu />
      <button onClick={onPalette} aria-label={`Command palette  ${shortcutLabel('search')}`} title={`Search, or type a value  ${shortcutLabel('search')}`} className="mx-auto flex w-auto shrink-0 items-center gap-2 rounded-md px-2 py-1 text-[12px] xl:w-[min(240px,22vw)] xl:px-2.5 2xl:w-[min(320px,26vw)]" style={{ background: C.sunken, border: `1px solid ${C.line}`, color: C.dim }}>
        <Search size={13} /><span className="hidden truncate xl:inline">Search<span className="hidden 2xl:inline">, or type <span className="font-geist-mono" style={{ color: C.muted }}>span 200</span></span></span><span className="ml-auto hidden xl:inline"><Kbd>{shortcutLabel('search')}</Kbd></span>
      </button>
      <button onClick={() => { s.set({ stage: 'flight' }); void s.run(); }} disabled={s.running || !ready || !s.native} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-[12.5px] font-medium whitespace-nowrap disabled:opacity-40" style={{ background: C.accent, color: '#06222A' }} title={!s.native ? `Run the ${candidateSelected ? 'candidate' : '6-DOF'} simulation and commit  ${shortcutLabel('run')} (this browser cannot run the engine)` : !ready ? `Run the ${candidateSelected ? 'candidate' : '6-DOF'} simulation and commit  ${shortcutLabel('run')} (${candidateSelected ? candidateReadiness?.issues[0]?.message ?? 'Apply or discard staged edits first' : readiness.issues[0]?.message ?? 'Apply or discard staged edits first'})` : `Run the ${candidateSelected ? 'candidate' : '6-DOF'} simulation and commit  ${shortcutLabel('run')}`}>
        {s.running ? <Loader2 size={13} className="animate-spin" /> : <Play size={12} fill="#06222A" />}{s.running ? 'Running…' : candidateSelected ? 'Run candidate' : 'Run simulation'}<span className="sr-only text-[10.5px] opacity-70 2xl:not-sr-only 2xl:inline">{shortcutLabel('run')}</span>
      </button>
      <CopilotSlot />
      <button onClick={toggleRight} aria-expanded={s.rightOpen} aria-label="Toggle inspector" className="rounded p-1.5 hover:bg-white/5" title="Inspector  ]"><PanelRight size={15} color={C.muted} /></button>
    </header>
  );
}

/* ───────────── why is this stale (read-only dependency view) ───────────── */

function fmtVal(c: Change, v: unknown, units: 'metric' | 'imperial', motors: Record<string, { designation: string }>): string {
  if (v === undefined || v === null) return '—';
  if (c.field === 'motorId') return motors[String(v)]?.designation ?? String(v);
  if (typeof v !== 'number') return String(v);
  const k = ['railElevationDeg', 'railAzimuthDeg', 'windAzimuthDeg'].includes(c.field) ? 'angle' : c.field === 'windSpeedSurface' ? 'speed' : ['launchAltitudeASL', 'mainDeployAltitudeAGL', 'railLength'].includes(c.field) ? 'dist'
    : ['finCount'].includes(c.field) ? 'raw' : c.field === 'cd' ? 'raw' : c.field === 'mass' || c.field === 'massOverride' ? 'mass' : c.field === 'shearPa' ? 'modulus' : 'len';
  const s = show(v, k, units, k === 'raw' ? 0 : undefined);
  return `${s.text}${s.unit ? ' ' + s.unit : ''}`;
}

export function WhyStale({ trigger }: { trigger: ReactNode }) {
  const changes = useChanges();
  const units = useWS((s) => s.units);
  const motors = useWS((s) => s.motors);
  const set = useWS((s) => s.set);
  const committed = useWS((s) => s.committed);
  const stages: StageId[] = ['flight', 'recovery', 'verify', 'build'];
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} align="start" className="z-50 w-[440px] rounded-lg shadow-2xl" style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
          <div className="px-4 pt-3 pb-2">
            <div className="text-[13px] font-medium">What changed since the committed run</div>
            <div className="text-[11.5px]" style={{ color: C.muted }}>{committed ? (committed.candidate ? 'Experimental candidate result committed. Read-only: this explains staleness, it does not change anything.' : `Run r${committed.run?.rev ?? '?'}, ${committed.run ? new Date(committed.run.at).toLocaleTimeString() : 'time unknown'}. Read-only: this explains staleness, it does not change anything.`) : 'No committed run yet.'}</div>
          </div>
          <div className="max-h-[200px] overflow-auto px-2 thin-scroll">
            {changes.length === 0 && <div className="px-2 py-3 text-[12px]" style={{ color: C.muted }}>Nothing. All results match the design.</div>}
            {changes.map((c) => (
              <button key={c.id} onClick={() => c.partId && set({ selectedId: c.partId, stage: 'airframe' })} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded px-2 py-1.5 text-left text-[12px] hover:bg-white/[0.04]">
                <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: C.changed }} />{c.label}<span className="text-[10.5px]" style={{ color: C.dim }}>{c.input}</span></span>
                <span className="font-geist-mono text-[11.5px]" style={{ color: C.muted }}>{fmtVal(c, c.from, units, motors)} → <span style={{ color: C.changed }}>{fmtVal(c, c.to, units, motors)}</span></span>
              </button>
            ))}
          </div>
          <div className="mt-1 px-4 py-3" style={{ borderTop: `1px solid ${C.line}` }}>
            <div className="mb-2 text-[10.5px] tracking-wide uppercase" style={{ color: C.dim }}>Depends on</div>
            {stages.map((st) => {
              const deps = DEPENDS[st]!;
              const hit = new Set(changes.filter((c) => deps.includes(c.input)).map((c) => c.input));
              return (
                <div key={st} className="grid grid-cols-[86px_1fr] items-start gap-2 py-1 text-[12px]">
                  <span className="flex items-center gap-1.5" style={{ color: hit.size ? C.changed : C.muted }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: hit.size ? C.changed : C.ok }} />{STAGES.find((s) => s.id === st)!.label}</span>
                  <span className="flex flex-wrap gap-1">
                    {deps.map((d) => <span key={d} className="rounded px-1.5 text-[10.5px]" style={{ color: hit.has(d) ? C.changed : C.dim, border: `1px solid ${hit.has(d) ? 'rgba(245,181,68,.4)' : C.line}` }}>{d}</span>)}
                    <span className="w-full text-[11px]" style={{ color: C.dim }}>{RESULTS_OF[st]}</span>
                  </span>
                </div>
              );
            })}
            <div className="mt-1 text-[11px]" style={{ color: C.dim }}>Airframe, Motor and Aero results update live and are never stale.</div>
          </div>
          <Popover.Arrow style={{ fill: C.panel }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* ───────────── stage rail ───────────── */

export function StageRail() {
  const stage = useWS((s) => s.stage);
  const set = useWS((s) => s.set);
  return (
    <nav aria-label="Pipeline stages" className="flex w-[64px] shrink-0 flex-col items-stretch py-1.5" style={{ borderRight: `1px solid ${C.line}`, background: C.panel }}>
      {STAGES.map((st) => <RailItem key={st.id} id={st.id} label={st.label} k={st.key} active={stage === st.id} onClick={() => set({ stage: st.id })} />)}
    </nav>
  );
}
function RailItem({ id, label, k, active, onClick }: { id: StageId; label: string; k: string; active: boolean; onClick: () => void }) {
  const { state } = useFreshness(id);
  const gates = useWS((s) => isCandidateFlightModel(resolveFlightModel(s.design.flightModel)) ? undefined : s.committed?.run?.gates);
  const failing = id === 'verify' && gates?.some((g) => g.status === 'fail');
  const I = STAGE_ICON[id];
  const dot = state === 'stale' ? C.changed : state === 'failed' || failing ? C.bad : state === 'running' ? C.accent : null;
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} title={`${label}  ${k}${state === 'stale' ? ' · stale' : ''}`}
      className="relative mx-1.5 my-0.5 flex flex-col items-center gap-1 rounded-md py-2 text-[10px]" style={{ background: active ? 'rgba(110,231,247,0.08)' : undefined, color: active ? C.fg : C.dim }}>
      {active && <span className="absolute top-2 bottom-2 -left-1.5 w-[2px] rounded-full" style={{ background: C.accent }} />}
      <I size={16} strokeWidth={1.6} color={active ? C.accent : undefined} />
      {label}
      {dot && <span className="absolute top-1.5 right-2.5 h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
    </button>
  );
}

/* ───────────── parts tree ───────────── */

export { PartsTree } from './PartsTree';

/* ───────────── status bar ───────────── */

export function StatusBar() {
  const s = useWS();
  const stab = useStability();
  const cStab = useCommittedStability();
  const changes = useChanges();
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const run = candidateSelected ? undefined : s.committed?.run;
  const candidate = s.committed?.candidate;
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 overflow-hidden px-3 text-[11px] whitespace-nowrap xl:gap-4" style={{ borderTop: `1px solid ${C.line}`, background: C.panel, color: C.muted }}>
      <span className="flex items-center gap-1.5" style={{ color: changes.length ? C.changed : C.muted }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.running ? C.accent : changes.length ? C.changed : C.ok }} />
        {s.running ? 'Running 6-DOF…' : candidate ? 'Candidate result · experimental' : changes.length ? 'Preview · not committed' : run ? `Committed · r${run.rev}` : 'No run'}
      </span>
      {s.runError && <span className="max-w-[38vw] truncate" style={{ color: C.bad }} title={s.runError}>Run failed: {s.runError}</span>}
      {stab ? (
        <span className="flex items-center gap-1.5">Margin <ResultValue r={stab.margin} size="sm" label="Static margin (live)" />{cStab && <DeltaChip now={stab.margin.value} was={cStab.margin.value} kind="cal" />}</span>
      ) : (
        <span style={{ color: C.muted }} title="The native stability command has not answered for this design">Stability unavailable</span>
      )}
      {run && <>
        <span className="hidden items-center gap-1.5 md:flex" style={{ opacity: changes.length ? 0.55 : 1 }}>Apogee <ResultValue r={run.summary.apogee} size="sm" label="Apogee (committed run)" /></span>
        <span className="hidden items-center gap-1.5 xl:flex" style={{ opacity: changes.length ? 0.55 : 1 }}>Max <ResultValue r={run.summary.maxMach} size="sm" label="Max Mach" /></span>
        <span className="hidden items-center gap-1.5 xl:flex" style={{ opacity: changes.length ? 0.55 : 1 }}>Rail exit <ResultValue r={run.summary.railExitSpeed} size="sm" label="Rail exit speed" /></span>
        <button onClick={() => s.set({ stage: 'verify' })} className="hidden items-center gap-1.5 hover:text-white md:flex">Gates <GateSummary gates={run.gates} /></button>
        <ValidityBadge v={run.summary.validity} enveloped={run.summary.enveloped} />
      </>}
      <span className="ml-auto flex items-center gap-3">
        <span className="hidden items-center gap-1.5 xl:flex" title="Confidence style: A marks the number, B uses a gutter rule and tag">Confidence <Segmented size="sm" value={s.confidenceStyle} onChange={(v) => s.setConfidenceStyle(v)} options={[{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }]} /></span>
        <Segmented size="sm" value={s.units} onChange={(v) => s.set({ units: v })} options={[{ value: 'metric', label: 'mm · m' }, { value: 'imperial', label: 'in · ft' }]} />
        <span className="hidden min-[1400px]:inline" style={{ color: C.dim }}>{s.native ? 'Astraea engine · 6-DOF' : 'Engine unavailable in this browser'}{run && ` · ${run.durationMs.toFixed(0)} ms`}</span>
        <button onClick={() => window.dispatchEvent(new CustomEvent('ws:shortcuts'))} aria-label="Keyboard shortcuts" className="hidden hover:text-white md:inline-flex"><Keyboard size={12} /></button>
      </span>
    </footer>
  );
}

/* ───────────── shortcuts ───────────── */

export function Shortcuts({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const rows: [string, string][] = [[shortcutLabel('search'), 'Command palette and typed commands'], [shortcutLabel('run'), 'Run simulation and commit'], [`${shortcutLabel('undo')} / ${shortcutLabel('redo')}`, 'Undo / redo'], ['1 – 8', 'Go to stage'], ['[  ]', 'Toggle parts panel / inspector'], ['← →', 'Step the flight scrubber (⇧ = 1 s)'], ['?', 'This list']];
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg p-4 shadow-2xl" style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
          <div className="mb-2 flex items-center"><Dialog.Title className="text-[14px] font-medium">Keyboard</Dialog.Title><Dialog.Close className="ml-auto rounded p-1 hover:bg-white/5" aria-label="Close"><X size={14} /></Dialog.Close></div>
          <Dialog.Description className="sr-only">Keyboard shortcuts</Dialog.Description>
          {rows.map(([k, d]) => <div key={k} className="flex items-center justify-between py-1.5 text-[12.5px]" style={{ borderBottom: `1px solid ${C.line}` }}><span style={{ color: C.muted }}>{d}</span><Kbd>{k}</Kbd></div>)}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ───────────── command palette with typed commands ───────────── */

const TYPED: { words: string[]; field: string; types: RocketComponent['type'][]; label: string }[] = [
  { words: ['span', 'height'], field: 'span', types: ['trapezoidfinset', 'ellipticalfinset'], label: 'Span' },
  { words: ['root', 'chord'], field: 'rootChord', types: ['trapezoidfinset', 'ellipticalfinset'], label: 'Root chord' },
  { words: ['tip'], field: 'tipChord', types: ['trapezoidfinset'], label: 'Tip chord' },
  { words: ['sweep'], field: 'sweepLength', types: ['trapezoidfinset'], label: 'Sweep' },
  { words: ['thick', 'thickness'], field: 'thickness', types: ['trapezoidfinset', 'ellipticalfinset', 'freeformfinset'], label: 'Thickness' },
  { words: ['count', 'fins'], field: 'finCount', types: ['trapezoidfinset', 'ellipticalfinset', 'freeformfinset'], label: 'Fin count' },
  { words: ['length', 'len'], field: 'length', types: ['nosecone', 'bodytube', 'transition', 'masscomponent'], label: 'Length' },
  { words: ['chute', 'diameter'], field: 'diameter', types: ['parachute'], label: 'Diameter' }
];

export function parseTyped(q: string, ctx: { selected: RocketComponent | undefined; components: RocketComponent[]; units: 'metric' | 'imperial' }) {
  const m = q.trim().toLowerCase().match(/^([a-z]+)\s+(-?[\d.]+)$/);
  if (!m) return null;
  const spec = TYPED.find((t) => t.words.includes(m[1]));
  if (!spec) return null;
  const target = ctx.selected && spec.types.includes(ctx.selected.type) ? ctx.selected : ctx.components.find((c) => spec.types.includes(c.type));
  if (!target) return null;
  const n = parseFloat(m[2]);
  const si = spec.field === 'finCount' ? Math.round(n) : ctx.units === 'metric' ? n / 1000 : n / 39.3701;
  const unit = spec.field === 'finCount' ? '' : ctx.units === 'metric' ? ' mm' : ' in';
  return { target, field: spec.field, si, text: `${target.name} · ${spec.label} → ${n}${unit}` };
}

export function Palette({ open, setOpen, openShortcuts }: { open: boolean; setOpen: (o: boolean) => void; openShortcuts: () => void }) {
  const s = useWS();
  const [q, setQ] = useState('');
  const selected = s.design.vehicle.components.find((c) => c.id === s.selectedId);
  const typed = parseTyped(q, { selected, components: s.design.vehicle.components, units: s.units });
  const motorHit = Object.values(s.motors).filter((m) => q.length >= 2 && m.designation.toLowerCase().includes(q.trim().toLowerCase()));
  const close = () => { setOpen(false); setQ(''); };
  const item = 'flex cursor-pointer items-center gap-2.5 rounded px-2.5 py-1.5 text-[12.5px] data-[selected=true]:bg-white/[0.06]';
  const group = '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-[#5E646D]';
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed top-[14vh] left-1/2 z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-lg shadow-2xl" style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search commands, stages, parts and motors, or type a command such as span 200.</Dialog.Description>
          <Command shouldFilter={!typed} loop>
            <div className="flex items-center gap-2 px-3" style={{ borderBottom: `1px solid ${C.line}` }}>
              <Search size={14} color={C.dim} />
              <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Search, or type: span 200 · count 3 · K550W" className="h-11 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[#5E646D]" />
            </div>
            <Command.List className="max-h-[380px] overflow-auto p-1.5 thin-scroll">
              <Command.Empty className="px-3 py-6 text-center text-[12.5px]" style={{ color: C.muted }}>No match. Try “span 200”, a stage name, or a motor.</Command.Empty>
              {typed && (
                <Command.Group heading="Set value" className={group}>
                  <Command.Item value={`typed ${q}`} className={item} onSelect={() => { s.setComponent(typed.target.id, { [typed.field]: typed.si } as Partial<RocketComponent>, typed.text); s.set({ selectedId: typed.target.id }); close(); }}>
                    <CircleDot size={13} color={C.accent} />{typed.text}<span className="ml-auto"><Kbd>↵</Kbd></span>
                  </Command.Item>
                </Command.Group>
              )}
              {motorHit.length > 0 && (
                <Command.Group heading="Motor" className={group}>
                  {motorHit.slice(0, 6).map((m) => (
                    <Command.Item key={m.id} value={`motor ${m.designation} ${m.manufacturer}`} className={item} onSelect={() => { s.setMotor(m.id); close(); }}>
                      <Flame size={13} color={C.dim} />Use {m.manufacturer} {m.designation}<span className="ml-auto font-geist-mono text-[11px]" style={{ color: C.dim }}>{m.totalImpulse.toFixed(0)} N·s</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {!typed && <>
                <Command.Group heading="Commands" className={group}>
                  <Command.Item className={item} onSelect={() => { void s.run(); close(); }}><Play size={13} color={C.dim} />Run simulation<span className="ml-auto"><Kbd>{shortcutLabel('run')}</Kbd></span></Command.Item>
                  <Command.Item className={item} onSelect={() => { s.set({ stage: 'flight' }); s.runMonteCarlo(100); close(); }}><Activity size={13} color={C.dim} />Run Monte Carlo · 100 flights</Command.Item>
                  <Command.Item className={item} onSelect={() => { s.undo(); close(); }}><Undo2 size={13} color={C.dim} />Undo<span className="ml-auto"><Kbd>{shortcutLabel('undo')}</Kbd></span></Command.Item>
                  <Command.Item className={item} onSelect={() => { s.redo(); close(); }}><Redo2 size={13} color={C.dim} />Redo</Command.Item>
                  <Command.Item className={item} onSelect={() => { s.setUnits(s.units === 'metric' ? 'imperial' : 'metric'); close(); }}><Rows3 size={13} color={C.dim} />Switch units to {s.units === 'metric' ? 'in · ft' : 'mm · m'}</Command.Item>
                  <Command.Item className={item} onSelect={() => { s.setConfidenceStyle(s.confidenceStyle === 'A' ? 'B' : 'A'); close(); }}><CircleDot size={13} color={C.dim} />Confidence style {s.confidenceStyle === 'A' ? 'B' : 'A'}</Command.Item>
                  <Command.Item className={item} onSelect={() => { s.set({ onboarding: 0 }); close(); }}><Target size={13} color={C.dim} />Start the guided tour</Command.Item>
                  <Command.Item className={item} onSelect={() => { close(); openShortcuts(); }}><Keyboard size={13} color={C.dim} />Keyboard shortcuts<span className="ml-auto"><Kbd>?</Kbd></span></Command.Item>
                </Command.Group>
                <Command.Group heading="Stages" className={group}>
                  {STAGES.map((st) => { const I = STAGE_ICON[st.id]; return <Command.Item key={st.id} value={`stage ${st.label}`} className={item} onSelect={() => { s.set({ stage: st.id }); close(); }}><I size={13} color={C.dim} />{st.label}<span className="ml-auto"><Kbd>{st.key}</Kbd></span></Command.Item>; })}
                </Command.Group>
                <Command.Group heading="Parts" className={group}>
                  {s.design.vehicle.components.map((c) => { const I = PART_ICON[c.type]; return <Command.Item key={c.id} value={`part ${c.name}`} className={item} onSelect={() => { s.set({ selectedId: c.id, stage: 'airframe' }); close(); }}><I size={13} color={C.dim} />{c.name}</Command.Item>; })}
                </Command.Group>
                <Command.Group heading="Templates" className={group}>
                  {PRESETS.map((p) => <Command.Item key={p.id} value={`template ${p.label}`} className={item} onSelect={() => { s.loadPreset(p.id); close(); }}><LayoutTemplate size={13} color={C.dim} />Start from {p.label}</Command.Item>)}
                </Command.Group>
              </>}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


/* ───────────── copilot panel placement (behaviour is defined on the copilot branch) ───────────── */

function CopilotSlot() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button aria-label="Copilot" title="Copilot" className="rounded p-1.5 hover:bg-white/5"><Sparkles size={15} color={C.muted} /></button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="end" sideOffset={8} className="z-50 w-[360px] rounded-lg p-3 shadow-2xl" style={{ background: C.panel, border: `1px solid ${C.lineStrong}`, color: C.fg }}>
          <CopilotPanel />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
