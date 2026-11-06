/**
 * Guided first run (the six steps from the Launch concept), as a small coach
 * card over the real workstation rather than a separate mode.
 */
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useWS, type StageId } from '../store';
import { C } from '../kit/theme';
import { Button } from '../kit/Fields';
import { shortcutLabel } from '../../lib/platform';

/** Where the "already toured" flag lives. Every dismissal writes it; {@link hasToured} reads it. */
export const TOURED_KEY = 'astraea.workstation.toured';

/**
 * Whether the tour has been completed or dismissed. If storage is unavailable
 * we cannot know, so treat it as toured: a broken storage backend must not
 * make the coach card reopen on every load.
 */
export function hasToured(): boolean {
  try { return window.localStorage.getItem(TOURED_KEY) !== null; } catch { return true; }
}

const STEPS: { stage: StageId; title: string; body: string; select?: (ids: string[]) => string | undefined }[] = [
  { stage: 'mission', title: 'Start from an example', body: 'Pick a template close to what you want to fly, and set a target altitude. Everything after this is a tweak.' },
  { stage: 'airframe', title: 'Shape the airframe', body: 'Select a part in the tree or the 3D view and change its numbers in the inspector. Changed fields turn amber until you re-run.', select: (ids) => ids.find((i) => i.includes('fin')) },
  { stage: 'motor', title: 'Choose a motor', body: 'Compare thrust curves and check that the motor fits the mount. You can import any .eng or .rse file.' },
  { stage: 'aero', title: 'Check stability', body: 'The static margin updates live. Aim for 1 to 3 calibers. The breakdown shows which parts move the centre of pressure.' },
  { stage: 'flight', title: 'Fly it', get body() { return `Press Run (${shortcutLabel('run')}) for a full 6-DOF flight: events, apogee, validity and every gate come from the engine. Monte Carlo re-flies the design for a landing spread.`; } },
  { stage: 'verify', title: 'Verify, then export', body: 'Every gate should pass before you build. Build exports the design with a trace of what was checked.' }
];

export function Onboarding() {
  const step = useWS((s) => s.onboarding);
  const set = useWS((s) => s.set);
  const components = useWS((s) => s.design.vehicle.components);
  const ids = components.map((c) => c.id);
  // The flight stage has no time scrubber on the native engine, so the tour
  // promises only what the engine computes.

  // Close, Skip, Done and the X all land here: every dismissal is persisted.
  const finish = () => { set({ onboarding: null }); try { window.localStorage.setItem(TOURED_KEY, '1'); } catch { /* storage unavailable */ } };
  const goTo = (i: number) => {
    const st = STEPS[i];
    const sel = st.select?.(ids);
    set({ onboarding: i, stage: st.stage, ...(sel ? { selectedId: sel } : {}) });
  };
  return (
    <AnimatePresence>
      {step !== null && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}
          role="dialog" aria-label="Guided tour" className="absolute right-3 bottom-3 z-10 w-[340px] rounded-lg p-4 shadow-2xl" style={{ maxWidth: 'calc(100% - 24px)', background: C.raised, border: `1px solid ${C.lineStrong}` }}>
          <div className="mb-2 flex items-center gap-2">
            <span className="font-geist-mono text-[11px]" style={{ color: C.accent }}>{step + 1} / {STEPS.length}</span>
            <div className="flex flex-1 gap-1">{STEPS.map((_, i) => <button key={i} onClick={() => goTo(i)} aria-label={`Step ${i + 1}`} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? C.accent : 'rgba(255,255,255,0.1)' }} />)}</div>
            <button onClick={finish} aria-label="Close tour" className="rounded p-0.5 hover:bg-white/5"><X size={13} color={C.dim} /></button>
          </div>
          <div className="text-[14px] font-medium">{STEPS[step].title}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: C.muted }}>{STEPS[step].body}</p>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={finish} className="text-[12px]" style={{ color: C.dim }}>Skip tour</button>
            <span className="ml-auto" />
            {step > 0 && <Button small onClick={() => goTo(step - 1)}>Back</Button>}
            {step < STEPS.length - 1 ? <Button small primary onClick={() => goTo(step + 1)}>Next</Button> : <Button small primary onClick={finish}>Done</Button>}
          </div>
          {step === 0 && <div className="mt-2 text-[11px]" style={{ color: C.dim }}>Reopen any time from {shortcutLabel('search')} → “Start the guided tour”.</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
