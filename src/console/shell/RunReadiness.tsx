import { useProjectStore } from '../../state/project';
import { airframeDraftPending, currentPreflight, useWS } from '../store';
import { C } from '../kit/theme';

/**
 * Whole-design readiness. `inline` is the short-window form: the stage puts it
 * in the same row as the flight-model chooser, so it takes the remaining width
 * instead of its own full-width row. The text, repair buttons and accessible
 * name are the same in both forms.
 */
export function RunReadiness({ inline = false }: { inline?: boolean } = {}) {
  const s = useWS();
  useProjectStore((state) => state.drafts.airframe);
  const readiness = currentPreflight();
  const pending = airframeDraftPending();
  return <section aria-label="Run readiness" className={`${inline ? 'min-w-0 flex-1 border-l' : 'shrink-0'} px-4 py-2 text-[11.5px]`} style={{ borderBottom: `1px solid ${C.line}`, borderLeftColor: C.line, color: readiness.runnable && !pending ? C.muted : C.changed }}>
    <strong>Whole-design readiness</strong>
    {pending && <p>Staged airframe edits are not run inputs. <button className="underline" onClick={() => s.set({ stage: 'airframe', rightOpen: true })}>Apply or discard in the inspector</button></p>}
    {readiness.runnable && !pending && <span> · ready to run</span>}
    {readiness.mounts.mounts.length === 0 && <p>No motor mount is flagged; the motor uses aft-end seating.</p>}
    {readiness.issues.map((issue) => <p key={issue.code}>{issue.message} <button className="underline" onClick={() => {
      const stage = issue.repair.studio === 'propulsion' ? 'motor' : issue.repair.studio === 'trajectory' ? 'flight' : 'airframe';
      const mount = readiness.mounts.mounts[0];
      s.set({ stage, rightOpen: true, ...(stage === 'airframe' && mount ? { selectedId: mount.id } : {}) });
    }}>Repair {issue.repair.target}</button></p>)}
  </section>;
}
