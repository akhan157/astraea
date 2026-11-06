import { useMemo, useState } from 'react';
import { FileUp } from 'lucide-react';
import type { MotorSpec } from '../../propulsion/motorDatabase';
import { impulseClassFor, normalizeMotorId, validateMotorSpec } from '../../propulsion/motorDatabase';
import { parseRaspEng, parseRseXml } from '../../formats/engParser';
import { assessMounts, reasonMotorExcluded, type MountAssessment } from '../../application/caseResolver';
import { motorProvenance, engineIsAvailable, useWS } from '../store';
import { useChanges } from '../hooks';
import { C } from '../kit/theme';
import { motorConfidence } from '../data/adapter';
import { ValueUnit, ConfidenceGlyph } from '../kit/Value';
import { Button, InspectorSection, Segmented } from '../kit/Fields';
import { DataTable, ImportFlow, Stat, type Parsed } from '../kit/Table';
import { TimeStack } from '../kit/Charts';
import { StageHeader } from './common';
import { useChamberState } from './motor/ChamberNozzlePanel';
import { ChamberNozzlePanel } from './motor/ChamberNozzlePanel';
import { BatesPanel } from './motor/BatesPanel';
import { PropellantRecipePanel } from './motor/PropellantRecipePanel';
import { ThrustCurvePanel } from './motor/ThrustCurvePanel';
import { CurveEditorPanel } from './motor/CurveEditorPanel';

type ToolId = 'thrustcurve' | 'editor' | 'chamber' | 'grain' | 'recipe';

const APCP_REFERENCE_PRESSURE_BAR = 100;

/**
 * Mount fit from the shared assessment. There is no silent fallback to the
 * last body tube: with no flagged mount the motor seats at the aft end (no
 * bore constraint), an ambiguous or solid set of mounts blocks seating, and a
 * motor wider than the bore is reported with the exact numbers.
 */
function fitOf(motor: MotorSpec | undefined, mounts: MountAssessment): { fits: boolean; label: string; title: string } {
  if (motor === undefined) return { fits: false, label: '—', title: 'motor record missing from the catalog' };
  if (mounts.ambiguous) {
    return { fits: false, label: 'check mount', title: `${mounts.mounts.length} tubes are flagged as motor mounts — flag exactly one` };
  }
  if (mounts.mounts.length === 0) {
    return { fits: true, label: 'aft seat', title: `no motor mount flagged — seats at the aft end of ${motor.designation}` };
  }
  if (mounts.solidMount || mounts.boreM === null) {
    return { fits: false, label: 'no bore', title: `mount '${mounts.mounts[0].name}' is a solid tube (no bore) — no motor can be seated` };
  }
  const reason = reasonMotorExcluded(mounts, motor);
  if (reason === null) {
    return { fits: true, label: 'fits', title: `⌀${(motor.diameter * 1000).toFixed(0)} mm in a ⌀${(mounts.boreM * 1000).toFixed(0)} mm bore` };
  }
  const tooWide = motor.diameter > mounts.boreM;
  return { fits: false, label: tooWide ? 'too wide' : 'too long', title: reason };
}

export function MotorStage() {
  const s = useWS();
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<string>(s.design.motorId);
  const [tool, setTool] = useState<ToolId>('thrustcurve');
  const [pcMPa, setPcMPa] = useState(String(APCP_REFERENCE_PRESSURE_BAR / 10));
  const [peKPa, setPeKPa] = useState('101');
  const [paKPa, setPaKPa] = useState('101');

  const current = s.motor();
  const motorsById = s.motors;
  const shown = motorsById[preview] ?? current;
  const mounts = assessMounts(s.design.vehicle);
  const motors = useMemo(() => Object.values(s.motors).sort((a, b) => a.totalImpulse - b.totalImpulse), [s.motors]);
  const changes = useChanges();
  const motorChanged = changes.some((c) => c.field === 'motorId' || c.field === 'motorCurve');
  const motorLevel = shown === null ? null : motorConfidence(motorProvenance(shown.id));
  const offline = !engineIsAvailable();
  const chamber = useChamberState(parseFloat(pcMPa) * 1e6, parseFloat(peKPa) * 1e3, parseFloat(paKPa) * 1e3, offline);
  const shownFit = fitOf(shown ?? undefined, mounts);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StageHeader stage="motor" title="Motor" sub="Pick from the catalog, import a thrust curve, or size a chamber, grain and recipe."
        right={<Button small onClick={() => setImportOpen(true)}><FileUp size={12} />Import .eng / .rse</Button>} />
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
        <div className="grid min-h-0 grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
          <div className="min-h-0 overflow-auto thin-scroll" style={{ borderRight: `1px solid ${C.line}` }}>
            <DataTable rows={motors} rowKey={(m) => m.id} activeKey={preview} onRowClick={setPreview}
              columns={[
                { key: 'sel', label: '', width: '14px', render: (m) => m.id === s.design.motorId ? <span className="block h-2 w-2 rounded-full" style={{ background: motorChanged ? C.changed : C.accent }} title="In use" /> : null },
                { key: 'd', label: 'Motor', width: 'minmax(110px,1fr)', render: (m) => <span className="block min-w-0"><span className="block truncate font-geist-mono">{m.designation}</span><span className="block truncate text-[11px]" style={{ color: C.dim }}>{m.manufacturer} · class {m.impulseClass}</span></span> },
                { key: 'i', label: 'Impulse', align: 'right', width: '78px', render: (m) => <span className="font-geist-mono">{m.totalImpulse.toFixed(0)}<span className="text-[10.5px]" style={{ color: C.dim }}> N·s</span></span> },
                { key: 'b', label: 'Burn', align: 'right', width: '58px', render: (m) => <ValueUnit value={m.burnTime} kind="time" digits={2} /> },
                { key: 'dia', label: 'Dia', align: 'right', width: '62px', render: (m) => <ValueUnit value={m.diameter} kind="len" /> },
                { key: 'fit', label: 'Mount', width: '74px', render: (m) => { const f = fitOf(m, mounts); return <span title={f.title} style={{ color: f.fits ? C.muted : C.bad }}>{f.label}</span>; } }
              ]} />
          </div>
          <div className="min-h-0 overflow-auto p-3 thin-scroll">
            {shown === null ? (
              <div className="text-[12.5px]" style={{ color: C.muted }}>No motor in the catalog matches this project's motor reference.</div>
            ) : (
              <>
                <div className="flex items-baseline gap-2"><span className="font-geist-mono text-[16px]">{shown.designation}</span><span className="text-[12px]" style={{ color: C.muted }}>{shown.manufacturer}</span>
                  {motorLevel !== null && <span className="ml-auto inline-flex items-center gap-1.5 text-[11px]" style={{ color: C.muted }} title={motorLevel.reason}><ConfidenceGlyph c={motorLevel.confidence} />{motorLevel.confidence === 'measured' ? 'Certified curve' : 'Working curve'}</span>}
                </div>
                <div className="-mx-1 mt-2">
                  <TimeStack t={shown.thrustCurve.map((p) => p.time)} panes={[{ id: 'thrust', label: 'Thrust', kind: 'force', values: shown.thrustCurve.map((p) => p.thrust), color: C.s2 }]} cursor={null} onCursor={() => undefined} paneHeight={150} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  <Stat label="Total impulse"><span className="font-geist-mono">{shown.totalImpulse.toFixed(1)} N·s</span></Stat>
                  <Stat label="Max thrust"><ValueUnit value={shown.maxThrust} kind="force" digits={1} /></Stat>
                  <Stat label="Propellant"><ValueUnit value={shown.propellantMass} kind="mass" /></Stat>
                  <Stat label="Loaded mass"><ValueUnit value={shown.totalMass} kind="mass" /></Stat>
                  <Stat label="Length"><ValueUnit value={shown.length} kind="len" /></Stat>
                  <Stat label="Diameter"><ValueUnit value={shown.diameter} kind="len" /></Stat>
                </div>
                <div className="mt-2 text-[11.5px]" style={{ color: shownFit.fits ? C.muted : C.bad }} title={shownFit.title}>
                  Mount: {shownFit.label} — {shownFit.title}
                </div>
                <div className="mt-3">
                  {shown.id === s.design.motorId
                    ? <span className="text-[12px]" style={{ color: C.muted }}>In use.</span>
                    : <Button primary small disabled={!shownFit.fits} title={shownFit.fits ? `Use ${shown.designation}` : shownFit.title} onClick={() => s.setMotor(shown.id)}>Use {shown.designation}</Button>}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-col" style={{ borderTop: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-3 px-3 pt-2">
            <Segmented value={tool} onChange={setTool} size="sm" options={[
              { value: 'thrustcurve', label: 'ThrustCurve' },
              { value: 'editor', label: 'Curve editor' },
              { value: 'chamber', label: 'Chamber & nozzle' },
              { value: 'grain', label: 'BATES grain' },
              { value: 'recipe', label: 'Propellant recipe' }
            ] satisfies { value: ToolId; label: string }[]} />
            <span className="hidden text-[10.5px] 2xl:inline" style={{ color: C.dim }}>Computed by the engine from the curve or design you enter.</span>
          </div>
          <div className="min-h-0 max-h-[46vh] overflow-auto thin-scroll">
            {tool === 'thrustcurve' && <ThrustCurvePanel />}
            {tool === 'editor' && (shown
              ? <CurveEditorPanel key={shown.id} base={shown} />
              : <p className="p-3 text-[12px]" style={{ color: C.muted }}>Select a motor in the catalog to edit a copy of its curve.</p>)}
            {tool === 'chamber' && <ChamberNozzlePanel chamber={chamber} inputs={{ pcMPa, peKPa, paKPa, setPcMPa, setPeKPa, setPaKPa }} />}
            {tool === 'grain' && <BatesPanel chamber={chamber} />}
            {tool === 'recipe' && <PropellantRecipePanel offline={offline} />}
          </div>
        </div>
      </div>
      <ImportFlow<MotorSpec> open={importOpen} setOpen={setImportOpen} title="Import a thrust curve" accept=".eng,.rse,.xml" hint="RASP .eng or RockSim .rse files, as published on ThrustCurve.org."
        parse={(text, name): Parsed<MotorSpec> => {
          const m = /\.rse$|\.xml$/i.test(name) || text.trim().startsWith('<') ? parseRseXml(text) : parseRaspEng(text);
          validateMotorSpec(m);
          const warnings: string[] = [];
          const cls = impulseClassFor(m.totalImpulse);
          if (m.impulseClass && cls !== m.impulseClass) warnings.push(`Declared class ${m.impulseClass}, but the curve integrates to ${m.totalImpulse.toFixed(1)} N·s (class ${cls}).`);
          if (mounts.boreM !== null && m.diameter > mounts.boreM + 1e-6) warnings.push(`At ${(m.diameter * 1000).toFixed(0)} mm it is wider than the motor mount (${(mounts.boreM * 1000).toFixed(0)} mm inner).`);
          if (motorsById[normalizeMotorId(m.id)]) warnings.push('A motor with this id is already loaded; importing registers the new curve under the next free id instead of replacing it.');
          return {
            value: m, warnings,
            preview: <div className="grid grid-cols-3 gap-3 p-3 text-[12.5px]">
              <Stat label="Motor"><span className="font-geist-mono">{m.designation}</span></Stat><Stat label="Maker">{m.manufacturer}</Stat><Stat label="Class"><span className="font-geist-mono">{cls}</span></Stat>
              <Stat label="Impulse"><span className="font-geist-mono">{m.totalImpulse.toFixed(1)} N·s</span></Stat><Stat label="Burn"><ValueUnit value={m.burnTime} kind="time" digits={2} /></Stat><Stat label="Curve points"><span className="font-geist-mono">{m.thrustCurve.length}</span></Stat>
            </div>
          };
        }}
        onConfirm={(m) => { setPreview(s.addMotor(m, { source: 'import' })); }} confirmLabel="Add to catalog" />
    </div>
  );
}

export function MotorInspector() {
  const s = useWS();
  const m = s.motor();
  if (m === null) return <div className="p-4 text-[12.5px]" style={{ color: C.muted }}>No motor in the catalog matches this project's motor reference.</div>;
  return (
    <div className="flex h-full flex-col overflow-auto thin-scroll" style={{ background: C.panel }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}><div className="text-[11px]" style={{ color: C.dim }}>Motor in use</div><div className="font-geist-mono text-[14px]">{m.designation}</div></div>
      <InspectorSection title="Mass at liftoff">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Loaded"><ValueUnit value={m.totalMass} kind="mass" /></Stat>
          <Stat label="Burnout"><ValueUnit value={m.dryMass} kind="mass" /></Stat>
        </div>
      </InspectorSection>
      <InspectorSection title="Where it sits">
        <div className="text-[12px] leading-relaxed" style={{ color: C.muted }}>Seated in the flagged motor-mount tube; with no mount flagged it seats at the aft end. Mark a different tube as the mount in Airframe.</div>
      </InspectorSection>
    </div>
  );
}
