import { useState } from 'react';
import { answer, type CopilotAnswer } from '../../copilot/assistant';
import { nativeEngine } from '../../copilot/engine';
import { applyFix } from '../../copilot/apply';
import { useProjectStore } from '../../state/project';
import { currentRunKey, useWS } from '../store';
import { C } from '../kit/theme';
import { CANDIDATE_REFUSAL } from '../../application/candidate';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';

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
        vehicle: s.design.vehicle, engine,
        flightCase: !candidateSelected && motor ? { motor, launch } : null,
      });
      setReply({ value, inputKey });
    } catch (err) { setStatus(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }}>
    <h3 className="text-[14px]">Rule-based engineering copilot</h3>
    <p style={{ color: C.muted }}>Checks and fixes use the Astraea engine. No design changes until you apply a suggestion; each accepted edit is undoable.</p>
    <label className="block">Question<input aria-label="Copilot question" value={question} onChange={(e) => setQuestion(e.target.value)} className="mt-1 w-full rounded p-2" style={{ background: C.sunken, border: `1px solid ${C.line}` }} /></label>
    <button type="submit" disabled={busy} className="rounded border px-3 py-2">{busy ? 'Evaluating…' : 'Ask copilot'}</button>
    {reply?.value.paragraphs.map((text, i) => <p key={i}>{text}</p>)}
    {reply?.value.quantities?.map((q) => <p key={q.label}>{q.label}: {Number.isFinite(q.value.value) ? q.value.value.toFixed(3) : 'N/A'} {q.value.unit} · {q.value.confidence}<br />{q.value.confidenceReason}</p>)}
    {reply?.value.checks?.map((check) => <p key={check.id}><strong>{check.title}: {check.status}</strong><br />{check.message}</p>)}
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
