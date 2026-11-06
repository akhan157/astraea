import { useMemo } from 'react';
import type { TrapezoidFinSetComponent, EllipticalFinSetComponent } from '../../core/types';
import { computeTrapezoidFinFlutter, computeEllipticalFinFlutter, MATERIAL_SHEAR_MODULI } from '../../aero/finFlutter';
import { useWS } from '../store';
import { useProjectStore } from '../../state/project';
import { useStability, useCommittedStability, useChanges, useFreshness, usePreviewDesign } from '../hooks';
import { FLUTTER_GATE, aeroConfidence, shearConfidence } from '../data/adapter';
import { Viewport } from '../viewport/Viewport';
import { C } from '../kit/theme';
import { ResultValue, DeltaChip, ConfidenceSummary } from '../kit/Value';
import { DataTable, type TableSection } from '../kit/Table';
import { ShareBar } from '../kit/Charts';
import { FieldRow, InspectorSection, NumberField } from '../kit/Fields';
import { GateRow, EmptyState } from '../kit/Status';
import { OverflowFold } from '../kit/Caveat';
import { StabilityStrip } from './Airframe';
import { WithDock, StageHeader } from './common';
import { AeroControls } from './AeroControls';
import { MomentArmHistoryPanel } from '../evidence/MomentArmHistoryPanel';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { aeroModelDefect } from '../../application/aeroModel';
import { CANDIDATE_REFUSAL } from '../../application/candidate';
import { CandidateRefusalNotice } from './Candidate';
import { classifyBreakdownRows, NON_LIFTING_DIVIDER, NON_LIFTING_FOOTNOTE, unknownRowSentence } from './aeroBreakdownText';
import type { StabilityRow } from '../data/contract';

export function AeroStage() {
  const s = useWS();
  const preview = usePreviewDesign();
  const vehicle = preview.vehicle;
  const stab = useStability();
  const fresh = useFreshness('flight');
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const run = candidateSelected ? undefined : s.committed?.run;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StageHeader
        stage="aero"
        title="Aero"
        sub={s.design.aeroModel === undefined
          ? 'Stability and aerodynamic coefficients, live as you edit. Hover a row to find the part.'
          : aeroModelDefect(s.design.aeroModel) !== null
            ? 'Built-up aero model selection is defective; choose a current model in Aerodynamic inputs.'
            : `Built-up aero model ${s.design.aeroModel.modelId} ${s.design.aeroModel.modelVersion} (hybrid: Astraea legacy drag override Mach 0.80-1.20).`}
        right={stab && <ConfidenceSummary results={[stab.margin, stab.cp, stab.cg]} />}
      />
      {candidateSelected && <div className="px-3 py-2"><CandidateRefusalNotice title="Legacy aero preview not evaluated" message={CANDIDATE_REFUSAL.legacyAero} /></div>}
      <WithDock storageKey="aero" initial={320}
        main={<Viewport vehicle={vehicle} aeroModel={preview.aeroModel} motor={s.motor() ?? undefined} markers look={{ selected: s.selectedId, hovered: s.hoverId }} onPick={(id) => s.set({ selectedId: id || s.selectedId })} onHover={(id) => s.set({ hoverId: id })} readout={<StabilityStrip />} />}
        tabs={[
          { id: 'breakdown', label: 'Stability breakdown', body: <Breakdown /> },
          { id: 'history', label: 'Flight model history', body: <MomentArmHistoryPanel history={run?.momentArmHistory} engineIdentity={run?.engineIdentity} inputKey={run?.inputKey} stale={!!run && fresh.state !== 'current'} /> },
          { id: 'flutter', label: 'Fin flutter', body: <FlutterPanel /> },
          { id: 'inputs', label: 'Aerodynamic inputs', body: <AeroControls /> }
        ]} />
    </div>
  );
}

type BreakdownEntry = { row: StabilityRow; secondary: boolean };
const DASH = <span style={{ color: C.dim }}>—</span>;

function Breakdown() {
  const s = useWS();
  const stab = useStability();
  const cStab = useCommittedStability();
  if (!stab) return <EmptyState title="Stability unavailable" body="No native stability result is available for these inputs. Check the backend status and aerodynamic inputs." />;
  const groups = classifyBreakdownRows(stab.rows, (id) => s.design.vehicle.components.find((component) => component.id === id)?.type);
  const lifting: BreakdownEntry[] = groups.lifting.map((row) => ({ row, secondary: false }));
  const secondary: BreakdownEntry[] = groups.secondary.map((row) => ({ row, secondary: true }));
  const sections: TableSection<BreakdownEntry>[] = [
    { key: 'lifting', rows: lifting },
    ...(secondary.length > 0 ? [{ key: 'secondary', label: NON_LIFTING_DIVIDER, rows: secondary, quiet: true }] : []),
  ];
  return (
    <div>
      <div>
        <OverflowFold
          className="px-3 py-2 text-[12px]"
          style={{ color: C.muted }}
          text="Subsonic component geometry and mass rollup; excludes the selected motor and depletion history. Pad all-up, burnout and powered-flight minimum margins are unavailable here."
        />
        {stab.marginPercentLength && <div className="px-3 pb-2 text-[12px]">Geometry margin as % of length: <ResultValue r={stab.marginPercentLength} label="Geometry margin as percent of length" /> <span style={{ color: C.dim }}>Reference conversion only; no competition assessment.</span></div>}
        <DataTable sections={sections} rowKey={(e) => e.row.partId} activeKey={s.selectedId} onRowHover={(k) => s.set({ hoverId: k })} onRowClick={(k) => s.set({ selectedId: k })}
          columns={[
            { key: 'name', label: 'Part', width: 'minmax(170px,1.3fr)', render: (e) => <span data-breakdown-name={e.secondary ? 'secondary' : 'lifting'} className="block min-w-0 leading-tight" title={e.row.name}>{e.row.name}</span> },
            { key: 'share', label: 'Share of CNα', width: '1.6fr', render: (e) => e.secondary ? DASH : <span className="flex items-center gap-2"><ShareBar pct={e.row.contributionPct} color={e.row.contributionPct < 0 ? C.s2 : C.s1} /><span className="w-12 text-right font-geist-mono text-[11.5px]">{e.row.contributionPct.toFixed(1)}%</span></span> },
            { key: 'cna', label: 'CNα', align: 'right', width: '90px', render: (e) => e.row.cnAlpha.confidence === 'unknown' ? DASH : <ResultValue r={e.row.cnAlpha} label={`${e.row.name} CNα`} /> },
            { key: 'cp', label: 'CP from nose', align: 'right', width: '120px', render: (e) => e.secondary ? DASH : e.row.cp ? <ResultValue r={e.row.cp} kind="len" label={`${e.row.name} CP`} /> : 'N/A' },
            { key: 'd', label: 'Δ run', align: 'right', width: '80px', render: (e) => { if (e.secondary) return DASH; const was = cStab?.rows.find((x) => x.partId === e.row.partId); return was ? <DeltaChip now={e.row.contributionPct} was={was.contributionPct} kind="raw" digits={1} /> : null; } }
          ]} />
        {secondary.length > 0 && <p data-non-lifting-footnote className="px-3 py-2 text-[11.5px]" style={{ color: C.dim }}>{NON_LIFTING_FOOTNOTE}</p>}
        {groups.warnings.map((row) => <p key={row.partId} data-unknown-row className="px-3 py-1 text-[12px]" style={{ color: C.muted }}>{unknownRowSentence(row)}</p>)}
      </div>
      <div className="px-3 pt-1 pb-3" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="mt-2 mb-2 text-[10.5px] tracking-wide uppercase" style={{ color: C.dim }}>In plain words · from the engine</div>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-x-6 gap-y-1.5 text-[12.5px] leading-relaxed">
          {stab.notes.map((n) => <li key={n} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full" style={{ background: n.startsWith('Overstable') || n.startsWith('Understable') ? C.warn : C.dim }} />{n}</li>)}
        </ul>
      </div>
    </div>
  );
}

/** Live single-point flutter for the selected design (sea level), straight from the engine. */
export function useLiveFlutter() {
  const vehicle = useWS((s) => s.design.vehicle);
  const shearPa = useWS((s) => s.design.shearPa);
  return useMemo(() => {
    const fin = vehicle.components.find((c): c is TrapezoidFinSetComponent | EllipticalFinSetComponent => c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset');
    if (!fin) return null;
    try {
      const f = fin.type === 'trapezoidfinset' ? computeTrapezoidFinFlutter(fin, shearPa) : computeEllipticalFinFlutter(fin, shearPa);
      return { fin, f };
    } catch { return null; }
  }, [vehicle, shearPa]);
}

function FlutterPanel() {
  const s = useWS();
  const candidateSelected = useProjectStore((state) => isCandidateFlightModel(resolveFlightModel(state.project.flightModel)));
  const run = candidateSelected ? undefined : s.committed?.run;
  const fresh = useFreshness('flight');
  const fl = run?.flutter;
  const freeform = useWS((st) => st.design.vehicle.components.some((c) => c.type === 'freeformfinset'));
  if (!fl && freeform) return <EmptyState title="Flutter unavailable for freeform fins" body="NACA TN-4197 flutter speed is defined for a trapezoidal planform. A freeform outline has no honest equivalent trapezoid here, so no flutter margin is reported; check fin flutter another way before flying it." />;
  if (!fl) return <EmptyState title="No fin set, or no run yet" body="Flutter margin over the flight needs a fin set and a committed 6-DOF run." />;
  const gate = run!.gates.find((g) => g.id === 'flutter');
  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1.8fr)_minmax(260px,1fr)]">
      <div className="py-2 pr-2" style={{ borderRight: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2 px-3 pb-1 text-[11.5px]" style={{ color: C.muted }}>
          Flutter margin at native display samples, {fl.finSetName}
        </div>
        <DataTable rows={fl.points} rowKey={(p) => String(p.t)} dense
          columns={[
            { key: 't', label: 'Event time', width: '90px', render: (p) => <span className="font-geist-mono">{p.t.toFixed(2)} s</span> },
            { key: 'v', label: 'Airspeed', align: 'right', width: '1fr', render: (p) => <span className="font-geist-mono">{p.airspeed.toFixed(0)} m/s</span> },
            { key: 'vf', label: 'Flutter speed', align: 'right', width: '1fr', render: (p) => <span className="font-geist-mono">{p.flutterSpeed.toFixed(0)} m/s</span> },
            { key: 'm', label: 'Margin', align: 'right', width: '90px', render: (p) => <span className="font-geist-mono" style={{ color: p.margin >= FLUTTER_GATE ? C.ok : C.bad }}>{p.margin.toFixed(2)}×</span> }
          ]} />
        <div className="px-3 pt-2 text-[11.5px]" style={{ color: C.dim }}>{fl.provenance}</div>
      </div>
      <div className="space-y-3 p-3 text-[12.5px]">
        {gate && <div className="rounded-md" style={{ border: `1px solid ${C.line}` }}><GateRow g={gate} compact stale={fresh.state === 'stale'} /></div>}
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-[10.5px]" style={{ color: C.dim }}>Worst margin</div><ResultValue r={fl.worst.margin} size="lg" label="Worst flutter margin" /><div className="text-[11px]" style={{ color: C.dim }}>at t = {fl.worst.t.toFixed(1)} s</div></div>
          <div><div className="text-[10.5px]" style={{ color: C.dim }}>Shear modulus G</div><ResultValue r={fl.shearModulus} kind="modulus" size="lg" label="Fin shear modulus" /></div>
        </div>
        <p className="leading-relaxed" style={{ color: C.muted }}>NACA TN-4197 flutter speed scales with √G, so G drives this result. A tested G for your layup firms it up; set it in the fin inspector.</p>
        <p className="text-[11.5px] leading-relaxed" style={{ color: C.dim }}>{fl.disclaimer}</p>
        <p className="text-[11px]" style={{ color: C.dim }}>{fl.provenance}</p>
      </div>
    </div>
  );
}

/** Fin inspector section: live sea-level flutter, worst-case from the run, and the G override. */
export function FlutterInspector() {
  const s = useWS();
  const live = useLiveFlutter();
  const changes = useChanges();
  const candidateSelected = useProjectStore((state) => isCandidateFlightModel(resolveFlightModel(state.project.flightModel)));
  const run = candidateSelected ? undefined : s.committed?.run;
  if (!live) return null;
  const custom = s.design.shearPa !== undefined;
  const aero = aeroConfidence(undefined, s.design.aeroModel);
  const sc = shearConfidence(custom, live.fin.materialId, aero);
  const tableG = MATERIAL_SHEAR_MODULI[live.fin.materialId] ?? MATERIAL_SHEAR_MODULI.plywood;
  const stale = changes.some((c) => c.partId === live.fin.id || c.field === 'shearPa');
  return (
    <InspectorSection title="Flutter">
      <FieldRow label="Shear modulus G" changed={changes.some((c) => c.field === 'shearPa')} onRevert={() => s.setShear(s.committed?.design.shearPa)} hint="From the material table unless you enter a tested value.">
        {custom
          ? <span className="flex items-center gap-1"><NumberField value={s.design.shearPa!} kind="modulus" min={1e8} max={2e11} digits={1} step={0.5} onChange={(v) => s.setShear(v)} /><button onClick={() => s.setShear(undefined)} className="text-[11px]" style={{ color: C.dim }} title="Use the material table">×</button></span>
          : <button onClick={() => s.setShear(tableG)} className="rounded px-2 py-1 font-geist-mono text-[11.5px] hover:bg-white/5" style={{ border: `1px solid ${C.line}`, color: C.muted }} title="Enter a tested value">{(tableG / 1e9).toFixed(1)} GPa · table</button>}
      </FieldRow>
      <div className="mt-2 grid grid-cols-2 gap-3 rounded-md p-2.5" style={{ background: C.sunken }}>
        <div><div className="text-[10.5px]" style={{ color: C.dim }}>Flutter speed, sea level</div><ResultValue r={{ value: live.f.flutterVelocity, unit: 'm/s', confidence: sc.confidence, reason: sc.reason }} label="Flutter speed (live)" /></div>
        <div><div className="text-[10.5px]" style={{ color: C.dim }}>Worst margin in flight</div>{run?.flutter ? <span className="flex items-baseline gap-1.5" style={{ opacity: stale ? 0.55 : 1 }}><ResultValue r={run.flutter.worst.margin} label="Worst flutter margin" />{stale && <span className="text-[10.5px]" style={{ color: C.changed }}>stale</span>}</span> : <span style={{ color: C.dim }}>run needed</span>}</div>
      </div>
      <div className="mt-1.5 text-[11px] leading-snug" style={{ color: C.dim }}>Gate: worst margin ≥ {FLUTTER_GATE}× flight airspeed.</div>
    </InspectorSection>
  );
}
