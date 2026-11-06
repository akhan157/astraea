import { useId } from 'react';
import { ArrowRight, ChevronRight, FlaskConical } from 'lucide-react';
import { useWS, type StageId } from '../store';
import { useProjectStore } from '../../state/project';
import { useSessionStore } from '../../state/session';
import { useFreshness, useStability } from '../hooks';
import { marginGate } from '../data/adapter';
import type { Gate } from '../data/contract';
import { C } from '../kit/theme';
import { ResultValue } from '../kit/Value';
import { Button, InspectorSection } from '../kit/Fields';
import { GateRow, GateSummary } from '../kit/Status';
import { StageHeader } from './common';
import { EvidenceStudio } from '../evidence/EvidenceStudio';
import { shortcutLabel } from '../../lib/platform';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { Note } from '../evidence/studioKit';

const GROUPS: { stage: Gate['stage']; label: string }[] = [{ stage: 'aero', label: 'Aero and structure' }, { stage: 'flight', label: 'Flight' }, { stage: 'recovery', label: 'Recovery' }];

/** Gates with the live stability gate swapped in (stability never goes stale). */
export function useGates(): Gate[] {
  const run = useWS((s) => s.committed?.run);
  const candidateSelected = useProjectStore((s) => isCandidateFlightModel(resolveFlightModel(s.project.flightModel)));
  const stab = useStability();
  if (candidateSelected || !run) return [];
  return run.gates.map((g) => (g.id === 'static_margin' && stab ? marginGate(stab.margin) : g));
}

export function VerifyStage() {
  const s = useWS();
  const gates = useGates();
  const fresh = useFreshness('verify');
  const candidateSelected = isCandidateFlightModel(resolveFlightModel(s.design.flightModel));
  const sel = s.selectedGate;
  const setSel = (id: string) => s.set({ selectedGate: id });
  const validationOpen = useSessionStore((state) => state.validationOpen);
  const setValidationOpen = useSessionStore((state) => state.setValidationOpen);
  const validationId = useId();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StageHeader stage="verify" title="Verify" sub="Generic model screens; review mission requirements separately." right={<GateSummary gates={gates} />} />
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4 thin-scroll">
        {candidateSelected && <Note tone="warn" role="status"><strong>Legacy gates not evaluated.</strong> The experimental candidate report has no legacy PASS/FAIL gates. Candidate computational/support statuses and observed-prefix readouts are in Flight.</Note>}
        {!candidateSelected && fresh.state === 'stale' && s.committed?.run && <div className="rounded-md px-3 py-2 text-[12px]" style={{ color: C.changed, border: '1px solid rgba(245,181,68,.35)', background: 'rgba(245,181,68,.05)' }}>Gates that depend on the flight are from run r{s.committed.run.rev} and are stale. Geometry static margin is live; powered-flight margins are unavailable. Press {shortcutLabel('run')} to re-check.</div>}
        {GROUPS.map((gr) => {
          const rows = gates.filter((g) => g.stage === gr.stage);
          if (!rows.length) return null;
          return (
            <section key={gr.stage}>
              <div className="mb-1.5 text-[10.5px] tracking-[0.12em] uppercase" style={{ color: C.dim }}>{gr.label}</div>
              <div className="rounded-md" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                {rows.map((g) => <div key={g.id} style={{ background: sel === g.id ? 'rgba(110,231,247,0.05)' : undefined }}><GateRow g={g} stale={fresh.state === 'stale' && g.id !== 'static_margin'} onOpen={() => { setSel(g.id); s.set({ selectedGate: g.id }); }} /></div>)}
              </div>
            </section>
          );
        })}
        {/* Validation is a different question from verification, so it looks different: model vs reality, not design vs requirement. */}
        <section className="rounded-md p-4" style={{ border: `1px solid ${C.line}`, background: 'linear-gradient(180deg, rgba(152,119,221,0.06), transparent)' }}>
          <button type="button" data-validation-toggle aria-expanded={validationOpen} aria-controls={validationId} onClick={() => setValidationOpen(!validationOpen)} className={`flex w-full items-center gap-2 text-left${validationOpen ? ' mb-2' : ''}`}>
            <ChevronRight size={11} aria-hidden="true" className={`shrink-0 transition-transform${validationOpen ? ' rotate-90' : ''}`} style={{ color: C.dim }} />
            <FlaskConical size={15} color={C.s3} /><span className="text-[13px] font-medium">Validation · does the model match reality?</span>
          </button>
          <div id={validationId} hidden={!validationOpen}>
            <p className="mb-3 max-w-[640px] text-[12px] leading-relaxed" style={{ color: C.muted }}>Verification above checks the design against requirements using the model. Validation checks the model against a real flight: load an altimeter or GPS log and compare apogee, velocity and descent rate. You can also fit your airframe’s drag to a log of your own rocket and apply it to this project; results computed with it read Calibrated. That says the numbers were fitted to one flight of this rocket, not that Astraea’s model was validated.</p>
            <EvidenceStudio />
          </div>
        </section>
      </div>
    </div>
  );
}

const FIX: Record<string, { stage: StageId; hint: string }> = {
  static_margin: { stage: 'airframe', hint: 'Move mass forward, or change fin span or position.' },
  rail_exit: { stage: 'mission', hint: 'Use a longer rail or a motor with higher initial thrust.' },
  flutter: { stage: 'aero', hint: 'Thicker fins, a stiffer material, a tested shear modulus, or less speed.' },
  envelope: { stage: 'flight', hint: 'Check where Mach or angle of attack left the modeled range.' },
  landing_speed: { stage: 'recovery', hint: 'A larger main parachute or a higher drag coefficient lowers touchdown speed.' },
  validity: { stage: 'flight', hint: 'The engine flagged this run; see the run manifest.' }
};

export function VerifyInspector() {
  const s = useWS();
  const gates = useGates();
  const g = gates.find((x) => x.id === s.selectedGate) ?? gates.find((x) => x.status === 'fail') ?? gates[0];
  if (!g) return <div className="p-4 text-[12.5px]" style={{ color: C.muted }}>No gates yet.</div>;
  const fix = FIX[g.id];
  return (
    <div className="flex h-full flex-col overflow-auto thin-scroll" style={{ background: C.panel }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}><div className="text-[11px]" style={{ color: C.dim }}>Gate</div><div className="text-[14px] font-medium">{g.label}</div></div>
      <InspectorSection title="Result">
        <div className="flex items-baseline justify-between"><ResultValue r={g.value} size="xl" label={g.label} /><span className="font-geist-mono text-[12px]" style={{ color: C.muted }}>{g.threshold}</span></div>
        <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>{g.reason}</p>
      </InspectorSection>
      {fix && (
        <InspectorSection title="Where to change it">
          <p className="mb-2 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>{fix.hint}</p>
          <Button small onClick={() => s.set({ stage: fix.stage })}>Go to {fix.stage[0].toUpperCase() + fix.stage.slice(1)} <ArrowRight size={12} /></Button>
        </InspectorSection>
      )}
    </div>
  );
}
