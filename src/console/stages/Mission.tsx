import { PRESETS, presetKeyOf, useWS } from '../store';
import { useStability } from '../hooks';
import { C } from '../kit/theme';
import { ResultValue, ValueUnit } from '../kit/Value';
import { Button, FieldRow, InspectorSection, NumberField } from '../kit/Fields';
import { Stat } from '../kit/Table';
import { LaunchInspector } from './Flight';
import { StageHeader } from './common';
import { SiteEditor } from './SiteEditor';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { Note } from '../evidence/studioKit';

export function MissionStage() {
  const s = useWS();
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const run = candidateSelected ? undefined : s.committed?.run;
  const candidate = s.committed?.candidate;
  const stab = useStability();
  const site = s.design.vehicle.launchSite;
  const focusSite = () => {
    const input = document.getElementById('launch-site-altitude');
    input?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    input?.focus({ preventScroll: true });
  };
  const target = s.design.mission.targetApogeeM;
  const apo = run?.summary.apogee.value;
  const pct = apo !== undefined && target ? ((apo - target) / target) * 100 : 0;
  const delta = Math.abs(pct) < 0.05 ? 'On target' : pct > 0 ? `+${pct.toFixed(1)}% above target` : `−${Math.abs(pct).toFixed(1)}% below target`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StageHeader stage="mission" title="Mission" sub="What the rocket has to do, and where it flies." />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 thin-scroll">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <Card title="Target apogee">
            <ValueUnit value={target} kind="dist" size="xl" />
            {run && (
              <div className="mt-3">
                <div className="relative h-[6px] rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <span className="absolute -top-[4px] h-[14px] w-[2px]" style={{ left: '50%', background: C.muted }} title="Target" />
                  <span className="absolute -top-[4px] h-[14px] w-[3px] rounded" style={{ left: `${Math.max(0, Math.min(100, 50 + pct))}%`, background: C.accent }} title="Predicted" />
                </div>
                <div className="mt-2 flex items-baseline justify-between text-[12px]"><span style={{ color: C.muted }}>Predicted, run r{run.rev}</span><ResultValue r={run.summary.apogee} label="Predicted apogee" /></div>
                <div className="text-right font-geist-mono text-[11.5px]" style={{ color: Math.abs(pct) <= 5 ? C.ok : C.muted }}>{delta}</div>
              </div>
            )}
            {(candidateSelected || candidate !== undefined) && !run && (
              <Note tone="warn" role="status">{candidateSelected ? 'The candidate model has no legacy predicted apogee. Use the observed-prefix maximum in Flight; it is not a predicted apogee.' : 'The committed candidate result has no legacy predicted apogee.'}</Note>
            )}
          </Card>
          <Card title="Vehicle">
            <div className="text-[14px]">{s.design.vehicle.name}</div>
            <div className="mt-1 text-[12px]" style={{ color: C.muted }}>{s.design.vehicle.notes}</div>
            {stab && <div className="mt-3 grid grid-cols-2 gap-3"><Stat label="Length"><ValueUnit value={stab.length} kind="len" /></Stat><Stat label="Dry mass"><ResultValue r={stab.totalMass} label="Dry mass" /></Stat></div>}
          </Card>
          <Card title="Site" data-site-card>
            <div className="text-[14px]">{s.design.mission.site}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {site
                ? <Stat label="Elevation"><ValueUnit value={site.altitudeM} kind="dist" /></Stat>
                : <Stat label="Elevation"><span className="text-[13px]">Not set</span><div className="mt-0.5 text-[10.5px] leading-snug" style={{ color: C.dim }}>sea level standard day assumed</div></Stat>}
              <Stat label="Surface wind"><ValueUnit value={s.design.options.windSpeedSurface} kind="speed" /></Stat>
            </div>
            {!site && <div className="mt-2"><Button small onClick={focusSite}>Set launch site</Button></div>}
          </Card>
        </div>

        <section>
          <div className="mb-2 text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>Start from a popular example</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => s.loadPreset(p.id)} className="rounded-md p-3 text-left hover:bg-white/[0.03]" style={{ border: `1px solid ${presetKeyOf(s.design.vehicle) === p.id ? 'rgba(110,231,247,.4)' : C.line}`, background: C.panel }}>
                <div className="text-[13px]">{p.label}</div>
                <div className="mt-1 text-[11.5px] leading-snug" style={{ color: C.muted }}>{p.mission.name}</div>
                <div className="mt-2 font-geist-mono text-[11px]" style={{ color: C.dim }}>{s.motors[p.motorId]?.designation} · {p.mission.site}</div>
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11.5px]" style={{ color: C.dim }}>The bundled motor catalog is a small certified set; import a motor file (.eng or .rse) to fly other motors.</div>
          <div className="mt-1 text-[11.5px]" style={{ color: C.dim }}>Loading a template is undoable. Drop an OpenRocket (.ork), RockSim (.rkt) or Astraea project file anywhere in the window to import it.</div>
        </section>

        <SiteEditor />
      </div>
    </div>
  );
}

function Card({ title, children, ...rest }: { title: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className="rounded-md p-3.5" style={{ background: C.panel, border: `1px solid ${C.line}` }}><div className="mb-2 text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>{title}</div>{children}</div>;
}

export function MissionInspector() {
  const s = useWS();
  const m = s.design.mission;
  return (
    <div className="flex h-full flex-col overflow-auto thin-scroll" style={{ background: C.panel }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}><div className="text-[11px]" style={{ color: C.dim }}>Mission</div><div className="text-[14px] font-medium">{m.name}</div></div>
      <InspectorSection title="Goal">
        <FieldRow label="Target apogee"><NumberField value={m.targetApogeeM} kind="dist" min={10} max={50000} onChange={(v) => s.setMission({ targetApogeeM: v }, 'Target apogee')} /></FieldRow>
        <FieldRow label="Site"><input aria-label="Mission site" value={m.site} onChange={(e) => s.setMission({ site: e.target.value }, 'Site')} className="w-[150px] rounded px-2 py-1 text-[12.5px] outline-none" style={{ background: C.sunken, border: `1px solid ${C.line}`, color: C.fg }} /></FieldRow>
      </InspectorSection>
      <LaunchInspector />
    </div>
  );
}
