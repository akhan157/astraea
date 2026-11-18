import { useState } from 'react';
import { answer, type CopilotAnswer } from '../../copilot/assistant';
import { nativeEngine } from '../../copilot/engine';
import { applyFix } from '../../copilot/apply';
import { useProjectStore } from '../../state/project';
import { currentRunKey, useWS } from '../store';
import { C } from '../kit/theme';
import { show } from '../kit/units';
import { CANDIDATE_REFUSAL } from '../../application/candidate';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { DEFAULT_CHECK_PROFILE, type CheckProfile } from '../../copilot/checks';
import type { CheckResult } from '../../copilot/types';
import { LANDING_SPEED_GATE, RAIL_EXIT_GATE, stabilityBreakdown } from '../data/adapter';
import { withLiftoffStability } from '../data/liftoffStability';

/**
 * Copilot judges the same design Verify does: liftoff stability with the
 * loaded motor, the mission's target apogee, and Verify's 1–3 cal band. Its
 * rail-exit and descent limits are stricter team requirements, so those
 * checks are labelled as advisories with Verify's own limit beside them.
 */
export function copilotProfile(targetApogeeM: number | undefined, units: 'metric' | 'imperial' = 'metric'): CheckProfile {
  return { ...DEFAULT_CHECK_PROFILE, units, ...(targetApogeeM !== undefined && targetApogeeM > 0 ? { targetApogeeM } : {}) };
}

const ADVISORY: Partial<Record<CheckResult['id'], string>> = {
  'rail-exit': `Copilot advisory: stricter than Verify's ${RAIL_EXIT_GATE} m/s (${(RAIL_EXIT_GATE * 3.28084).toFixed(0)} ft/s) screen.`,
  'descent-rate': `Copilot advisory: stricter than Verify's ${LANDING_SPEED_GATE} m/s (35 ft/s) landing limit.`,
  'apogee-target': 'From the mission target in Mission.',
  'boattail-separation': 'Copilot advisory: a drag-model limitation, not a safety check.',
  'stability-high': 'Copilot advisory: Verify shows this as a caution, not a failure. Too much stability is not a safety problem.',
};

const STATUS_TEXT: Record<CheckResult['status'], string> = { pass: 'Pass', fail: 'Failed', 'not-evaluated': 'Unknown' };

/** A Copilot quantity in the user's units: lengths and speeds convert; calibers and degrees do not. */
export function quantityText(value: number, unit: string, units: 'metric' | 'imperial'): string {
  if (!Number.isFinite(value)) return 'N/A';
  const kind = unit === 'm' ? 'len' : unit === 'm/s' ? 'speed' : null;
  if (kind === null) return `${Number(value.toPrecision(3))} ${unit}`.trim();
  const shown = show(value, kind, units);
  return `${shown.text} ${shown.unit}`.trim();
}

export function CopilotPanel() {
  const s = useWS();
  const [question, setQuestion] = useState('check my rocket');
  const [reply, setReply] = useState<{ value: CopilotAnswer; inputKey: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  return <form className="max-h-[70vh] space-y-3 overflow-auto text-[12px]" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setStatus('');
    const inputKey = currentRunKey();
    try {
      const motor = s.motor();
      const launch = useProjectStore.getState().project.workspace.launch;
      const candidateSelected = isCandidateFlightModel(resolveFlightModel(useProjectStore.getState().project.flightModel));
      const engine = candidateSelected
        ? {
            stability: () => Promise.reject(new Error(CANDIDATE_REFUSAL.copilot)),
            simulate: () => Promise.reject(new Error(CANDIDATE_REFUSAL.copilot)),
          }
        : nativeEngine;
      const value = await answer(question, {
        vehicle: s.design.vehicle,
        engine: candidateSelected ? engine : withLiftoffStability(engine, motor, stabilityBreakdown),
        flightCase: !candidateSelected && motor ? { motor, launch } : null,
        profile: copilotProfile(s.design.mission.targetApogeeM, s.units),
      });
      setReply({ value, inputKey });
    } catch (err) { setStatus(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }}>
    <h3 className="text-[14px]">Rule-based engineering copilot</h3>
    <p style={{ color: C.muted }}>Checks and fixes use the Astraea engine and the same design Verify checks: stability at liftoff with the motor loaded, and your mission's target apogee. No design changes until you apply a suggestion; each accepted edit is undoable.</p>
    <label className="block">Question<input aria-label="Copilot question" value={question} onChange={(e) => setQuestion(e.target.value)} className="mt-1 w-full rounded p-2" style={{ background: C.sunken, border: `1px solid ${C.line}` }} /></label>
    <button type="submit" disabled={busy} className="rounded border px-3 py-2">{busy ? 'Evaluating…' : 'Ask copilot'}</button>
    {reply?.value.paragraphs.map((text, i) => <p key={i}>{text}</p>)}
    {reply?.value.quantities?.map((q) => <p key={q.label}>{q.label}: {quantityText(q.value.value, q.value.unit, s.units)} · {q.value.confidence}<br />{q.value.confidenceReason}</p>)}
    {reply?.value.checks?.map((check) => <p key={check.id} data-copilot-check={check.id}><strong>{check.title}: {STATUS_TEXT[check.status]}</strong> <span style={{ color: C.dim }}>({check.threshold})</span><br />{check.message}{ADVISORY[check.id] && <><br /><span style={{ color: C.dim }}>{ADVISORY[check.id]}</span></>}</p>)}
    {reply?.value.fixes?.map((fix, i) => <section key={i} className="space-y-1 border-t border-white/10 pt-2">
      <p>{fix.kind === 'no-fix' ? fix.reason : fix.summary}</p>
      {fix.kind !== 'no-fix' && fix.caveats.map((text) => <p key={text}>{text}</p>)}
      {fix.kind === 'vehicle-edit' && <button type="button" disabled={busy} className="rounded border px-3 py-2" onClick={() => {
        const result = applyFix(fix, reply.inputKey);
        setStatus(result.ok ? 'Applied as one undoable edit. Re-run checks before applying another suggestion.' : result.reason);
      }}>Apply suggestion</button>}
    </section>)}
    {status && <p role="status">{status}</p>}
  </form>;
}
