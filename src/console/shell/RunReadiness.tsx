import { useProjectStore } from '../../state/project';
import { airframeDraftPending, runPreflight, stagedAirframeEdits, useWS } from '../store';
import { C } from '../kit/theme';
import { NoParachuteNote } from './NoParachuteNote';
import { useLiftoffStability } from '../hooks';
import { marginText, stabilityGate } from '../data/liftoffStability';
import { MARGIN_MIN } from '../data/adapter';

/**
 * Whether the run has every input it needs ("Inputs complete"), kept apart
 * from design findings: a complete, runnable design can still be unstable, and
 * that is said separately rather than folded into "ready". `inline` is the
 * short-window form: the stage puts it in the same row as the flight-model
 * chooser, so it takes the remaining width instead of its own full-width row.
 */
export function RunReadiness({ inline = false, findings = true }: { inline?: boolean; findings?: boolean } = {}) {
  const s = useWS();
  useProjectStore((state) => state.drafts.airframe);
  const liftoff = useLiftoffStability();
  // Judged on the design Run will fly: staged airframe edits are applied by Run itself.
  const readiness = runPreflight();
  const pending = airframeDraftPending();
  const staged = pending ? stagedAirframeEdits() : [];
  const complete = readiness.runnable;
  const stability = liftoff ? stabilityGate(liftoff) : null;
  // After a run, Flight's run summary already leads with the first finding.
  const finding = findings && stability !== null && stability.status === 'fail' ? stability : null;
  return <section aria-label="Run inputs" className={`${inline ? 'min-w-0 flex-1 border-l' : 'shrink-0'} px-4 py-2 text-[11.5px]`} style={{ borderBottom: `1px solid ${C.line}`, borderLeftColor: C.line, color: complete ? C.muted : C.changed }}>
    <strong>{complete ? 'Inputs complete' : 'Inputs incomplete'}</strong>
    {complete && <span> · ready to simulate</span>}
    {pending && <p>{staged.length} staged edit{staged.length === 1 ? '' : 's'} ({staged.slice(0, 3).join(', ')}{staged.length > 3 ? ', …' : ''}). Run applies them first, or <button className="underline" onClick={() => s.set({ stage: 'airframe', rightOpen: true })}>review them in the inspector</button>.</p>}
    <NoParachuteNote components={s.design.vehicle.components} />
    {readiness.mounts.mounts.length === 0 && <p>No motor mount is flagged; the motor uses aft-end seating.</p>}
    {readiness.issues.map((issue) => <p key={issue.code}>{issue.message} <button className="underline" onClick={() => {
      const stage = issue.repair.studio === 'propulsion' ? 'motor' : issue.repair.studio === 'trajectory' ? 'flight' : 'airframe';
      const mount = readiness.mounts.mounts[0];
      s.set({ stage, rightOpen: true, ...(stage === 'airframe' && mount ? { selectedId: mount.id } : {}) });
    }}>Repair {issue.repair.target}</button></p>)}
    {finding && <p data-design-finding="stability" style={{ color: C.bad }}>Design finding: stability at liftoff is {marginText(finding.value.value)}, {finding.value.value < MARGIN_MIN ? 'below' : 'above'} the {finding.threshold} target. {finding.advice} <button className="underline" onClick={() => s.set({ stage: 'airframe' })}>Fix in Airframe</button></p>}
  </section>;
}
