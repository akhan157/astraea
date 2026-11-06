import { useMemo, useState } from 'react';
import { Columns2, ScanEye, Box } from 'lucide-react';
import { useWS, undoHistory } from '../store';
import { useChangedParts, useCommittedStability, useStability, useChanges, usePreviewVehicle } from '../hooks';
import { Viewport } from '../viewport/Viewport';
import { Drawing2D } from '../viewport/Drawing2D';
import { useLayout } from '../viewport/Vehicle3D';
import { C } from '../kit/theme';
import { OverflowFold } from '../kit/Caveat';
import { Segmented } from '../kit/Fields';
import { ResultValue, DeltaChip, ValueUnit } from '../kit/Value';
import { DataTable } from '../kit/Table';
import { ShareBar } from '../kit/Charts';
import { WithDock, StageHeader } from './common';
import { STAGE_ICON } from '../shell/Shell';
import { useProjectStore } from '../../state/project';
import { ComparePanel } from '../shell/ComparePanel';
import { LivePreview } from './LivePreview';
import { shortcutLabel } from '../../lib/platform';

export function StabilityStrip() {
  const stab = useStability();
  const cStab = useCommittedStability();
  if (!stab) return null;
  const m = stab.margin.value;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / 5) * 100))}%`;
  const overStable = m > 3;
  const amber = 'Above generic geometry band (>3 cal). Weathercocking requires flight analysis.';
  const rollup = 'Component rollup only; selected motor and powered-flight margin history unavailable.';
  return (
    <div role="region" aria-label="Live stability and flight preview" className="rounded-md p-3 text-[11px]" style={{ background: 'rgba(16,18,21,0.92)', border: `1px solid ${C.line}` }}>
      <div className="flex items-baseline justify-between"><span style={{ color: C.muted }}>Geometry margin <span style={{ color: C.dim }}>· live</span></span><span className="flex items-baseline gap-2">{cStab && <DeltaChip now={m} was={cStab.margin.value} kind="cal" />}<ResultValue r={stab.margin} size="lg" label="Geometry static margin" /></span></div>
      <div className="relative mt-2 h-[6px] rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <span className="absolute inset-y-0 rounded-full" style={{ left: pct(1), width: `${(2 / 5) * 100}%`, background: 'rgba(61,214,140,0.35)' }} />
        {cStab && <span className="absolute -top-[3px] h-[12px] w-[2px] rounded" style={{ left: pct(cStab.margin.value), background: C.changed, opacity: 0.7 }} title="Committed run" />}
        {Number.isFinite(m) && <span className="absolute -top-[4px] h-[14px] w-[3px] rounded" style={{ left: pct(m), background: m < 1 || m > 3 ? C.bad : C.fg }} />}
      </div>
      <div className="mt-1 flex justify-between font-geist-mono text-[10px]" style={{ color: C.dim }}><span>0</span><span>1</span><span>3</span><span>5 cal</span></div>
      <div className="mt-2 flex justify-between"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: C.cg }} />CG <ResultValue r={stab.cg} kind="len" size="sm" label="CG from nose" /></span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: C.cp }} />CP <ResultValue r={stab.cp} kind="len" size="sm" label="CP from nose" /></span></div>
      {!Number.isFinite(m) && stab.margin.confidence === 'unknown' && <div className="mt-1.5 text-[10.5px]" style={{ color: C.unknown }} data-margin-unavailable="true">No geometry margin or verdict: {stab.margin.reason}</div>}
      {overStable
        ? <OverflowFold
          always
          className="mt-1.5 text-[10.5px]"
          text={<><span data-fold-part="amber" data-over-stable="true" style={{ color: C.changed }}>{amber}</span>{' '}<span data-fold-part="grey" style={{ color: C.dim }}>{rollup}</span></>}
          expanded={<><span data-fold-part="amber" data-over-stable="true" className="block" style={{ color: C.changed }}>{amber}</span><span data-fold-part="grey" className="block" style={{ color: C.dim }}>{rollup}</span></>}
        />
        : <div className="mt-1.5 text-[10.5px]" style={{ color: C.dim }}>{rollup}</div>}
      <LivePreview />
    </div>
  );
}

export function AirframeStage() {
  const current = useWS();
  const vehicle = usePreviewVehicle();
  const s = { ...current, design: { ...current.design, vehicle } };
  const past = useProjectStore((state) => state.past);
  const checkpoint = past.at(-1)?.project.vehicle ?? null;
  const [compareOpen, setCompareOpen] = useState(false);
  const [blend, setBlend] = useState(50);
  const changedParts = useChangedParts();
  const changes = useChanges();
  const [view, setView] = useState<'3d' | 'split' | '2d'>('3d');
  const [xray, setXray] = useState(false);
  const ghost = compareOpen ? checkpoint : changes.some((c) => c.input === 'geometry') ? s.committed?.design.vehicle : null;
  const vp = (
    <Viewport vehicle={s.design.vehicle} aeroModel={s.design.aeroModel} ghostAeroModel={compareOpen ? s.design.aeroModel : s.committed?.design.aeroModel} motor={s.motor() ?? undefined} ghost={ghost} markers
      look={{ selected: s.selectedId, hovered: s.hoverId, xray, changedParts, opacity: compareOpen && checkpoint ? blend / 100 : 1 }}
      ghostOpacity={compareOpen && checkpoint ? (100 - blend) / 100 : undefined} ghostLabel={compareOpen ? 'prior edit checkpoint' : 'committed run'}
      onPick={(id) => s.set({ selectedId: id || s.selectedId })} onHover={(id) => s.set({ hoverId: id })}
      toolbar={<button onClick={() => setXray(!xray)} aria-pressed={xray} title="X-ray: show internal parts" className="rounded p-1.5" style={{ background: xray ? 'rgba(110,231,247,0.12)' : C.sunken, border: `1px solid ${C.line}` }}><ScanEye size={13} color={xray ? C.accent : C.muted} /></button>}
      readout={<StabilityStrip />} />
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StageHeader stage="airframe" title="Airframe" sub="The part tree is the source of truth; the 3D view is derived from it."
        right={<><button className="shrink-0 rounded border px-2 py-1 text-[11px] whitespace-nowrap" aria-pressed={compareOpen} onClick={() => setCompareOpen(!compareOpen)}>Compare revision</button><Segmented size="sm" value={view} onChange={setView} options={[{ value: '3d', label: <Box size={12} />, title: '3D' }, { value: 'split', label: <Columns2 size={12} />, title: '3D + 2D' }, { value: '2d', label: '2D', title: '2D drawing' }]} /></>} />
      {compareOpen && <ComparePanel design={s.design} checkpoint={checkpoint} checkpointNumber={past.length} blend={blend} onBlend={setBlend} onClose={() => setCompareOpen(false)} />}
      <WithDock storageKey="airframe"
        main={
          view === '3d' ? vp
            : view === '2d' ? <div className="h-full p-4" style={{ background: C.bg }}><Drawing2D vehicle={s.design.vehicle} aeroModel={s.design.aeroModel} selectedId={s.selectedId} onPick={(id) => s.set({ selectedId: id })} /></div>
              : <div className="grid h-full grid-rows-2"><div className="min-h-0">{vp}</div><div className="min-h-0 p-3" style={{ borderTop: `1px solid ${C.line}`, background: C.bg }}><Drawing2D vehicle={s.design.vehicle} aeroModel={s.design.aeroModel} selectedId={s.selectedId} onPick={(id) => s.set({ selectedId: id })} /></div></div>
        }
        tabs={[
          { id: 'mass', label: 'Mass budget', body: <MassBudget /> },
          { id: 'history', label: <>History <span className="ml-1 font-geist-mono text-[10.5px]" style={{ color: C.dim }}>{s.past}</span></>, body: <HistoryList /> }
        ]} />
    </div>
  );
}

function MassBudget() {
  const s = useWS();
  const stab = useStability();
  const cStab = useCommittedStability();
  const lay = useLayout(s.design.vehicle, s.design.aeroModel);
  if (!stab || !lay) return null;
  const motor = s.motor();
  if (motor === null) return null;
  const total = stab.totalMass.value;
  const rows = [...stab.rows].sort((a, b) => b.mass.value - a.mass.value);
  return (
    <div>
      <DataTable rows={rows} rowKey={(r) => r.partId} activeKey={s.selectedId} onRowHover={(k) => s.set({ hoverId: k })} onRowClick={(k) => s.set({ selectedId: k })} dense
        columns={[
          { key: 'name', label: 'Part', width: 'minmax(170px,1.4fr)', render: (r) => <span data-part-name className="flex min-w-0 items-center gap-2 leading-tight" title={r.name}>{r.name}</span> },
          { key: 'share', label: 'Share of dry mass', width: '2fr', render: (r) => <ShareBar pct={(r.mass.value / total) * 100} color={C.s1} /> },
          { key: 'mass', label: 'Mass', align: 'right', width: '96px', render: (r) => <ResultValue r={r.mass} label={`${r.name} mass`} /> },
          { key: 'cg', label: 'CG from nose', align: 'right', width: '108px', render: (r) => <ResultValue r={r.cg} kind="len" label={`${r.name} CG`} /> },
          { key: 'd', label: 'Δ run', align: 'right', width: '68px', render: (r) => { const was = cStab?.rows.find((x) => x.partId === r.partId); return was ? <DeltaChip now={r.mass.value} was={was.mass.value} kind="mass" /> : null; } }
        ]} />
      <div className="flex items-center gap-6 px-3 py-2 text-[12px]" style={{ color: C.muted }}>
        <span>Dry total <ResultValue r={stab.totalMass} /></span>
        <span>Motor at liftoff <ValueUnit value={motor.totalMass} kind="mass" /> <span style={{ color: C.dim }}>({motor.designation}, catalog)</span></span>
        <span>Liftoff mass <ValueUnit value={total + motor.totalMass} kind="mass" /></span>
        <span>Fineness L/D <span className="font-geist-mono tnum" style={{ color: C.fg }}>{stab.refDiameter > 0 ? (stab.length / stab.refDiameter).toFixed(1) : '—'}</span> <span style={{ color: C.dim }}>({stab.length.toFixed(3)} m / ⌀{stab.refDiameter.toFixed(3)} m)</span></span>
      </div>
    </div>
  );
}

function HistoryList() {
  const pastCount = useWS((s) => s.past);
  const futureCount = useWS((s) => s.future);
  const history = useMemo(() => undoHistory(), [pastCount, futureCount]);
  const I = STAGE_ICON.airframe;
  if (history.past.length === 0 && history.future.length === 0) {
    return <div className="p-4 text-[12px]" style={{ color: C.muted }}>No edits yet. Every edit lands here and can be undone with {shortcutLabel('undo')}.</div>;
  }
  return (
    <div className="py-1 text-[12px]">
      {history.past.map((h, i) => (
        <div key={`p${i}`} className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <I size={12} color={C.dim} /><span>{h.label}</span><span className="ml-auto font-geist-mono text-[11px]" style={{ color: C.dim }}>{new Date(h.at).toLocaleTimeString()}</span>
        </div>
      ))}
      {history.future.map((h, i) => <div key={`f${i}`} className="flex items-center gap-2 px-3 py-1.5 line-through" style={{ color: C.dim, borderBottom: `1px solid ${C.line}` }}>{h.label}<span className="ml-auto text-[11px] no-underline">undone</span></div>)}
    </div>
  );
}
