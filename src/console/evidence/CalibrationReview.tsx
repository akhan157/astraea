import type { JSX } from 'react';
import { assessCalibrationEligibility, requireCalibrationEvents, type CalibrationConditionEvidence, type CalibrationEvidence, type CalibrationSideEvidence } from '../../evidence/calibrationEligibility';
import type { DragFit } from '../../evidence/dragFit';
import { Note } from './studioKit';
import { Select } from '../kit/Controls';

type ConditionReview = 'unverified' | CalibrationConditionEvidence['status'];
export interface CalibrationReviewValues {
  burnoutEarliest: string;
  burnoutLatest: string;
  recoveryKind: 'unverified' | 'first-event' | 'absent-through';
  recoveryEarliest: string;
  recoveryLatest: string;
  recoveryThrough: string;
  eventSource: string;
  conditionSource: string;
  logMotion: ConditionReview;
  logMass: ConditionReview;
  modelMotion: ConditionReview;
  modelMass: ConditionReview;
}

export function emptyCalibrationReview(): CalibrationReviewValues {
  return {
    burnoutEarliest: '', burnoutLatest: '', recoveryKind: 'unverified', recoveryEarliest: '', recoveryLatest: '', recoveryThrough: '',
    eventSource: '', conditionSource: '', logMotion: 'unverified', logMass: 'unverified', modelMotion: 'unverified', modelMass: 'unverified',
  };
}

/** Form evidence stays explicitly user-declared; a velocity/altitude proxy supplies nothing. */
export function reviewedCalibrationEvidence(values: CalibrationReviewValues, nativeModel: CalibrationSideEvidence): CalibrationEvidence {
  const number = (s: string): number => {
    if (s.trim() === '' || !Number.isFinite(Number(s))) throw new Error('Event bounds must be finite seconds in the imported log clock.');
    return Number(s);
  };
  const log: CalibrationSideEvidence = {};
  const model: CalibrationSideEvidence = { ...nativeModel };
  const source = values.eventSource.trim();
  if (values.burnoutEarliest.trim() || values.burnoutLatest.trim()) {
    log.burnout = { earliestS: number(values.burnoutEarliest), latestS: number(values.burnoutLatest), source: `User-declared log event (imported log clock): ${source}` };
    if (!source) throw new Error('Name the source and clock basis for the log events.');
  }
  if (values.recoveryKind === 'first-event') {
    log.recovery = { kind: 'first-event', event: { earliestS: number(values.recoveryEarliest), latestS: number(values.recoveryLatest), source: `User-declared first recovery event (imported log clock): ${source}` } };
  } else if (values.recoveryKind === 'absent-through') {
    log.recovery = { kind: 'absent-through', throughS: number(values.recoveryThrough), source: `User-declared recovery-free coverage (imported log clock): ${source}` };
  }
  if (log.recovery !== undefined && !source) throw new Error('Name the source and clock basis for the log events.');
  for (const [key, side, condition] of [
    ['logMotion', log, 'verticalMotion'], ['logMass', log, 'constantMass'],
    ['modelMotion', model, 'verticalMotion'], ['modelMass', model, 'constantMass'],
  ] as const) {
    const status = values[key];
    if (status !== 'unverified') {
      if (!values.conditionSource.trim()) throw new Error('State the evidence for the motion and mass review.');
      side[condition] = { status, source: `User review: ${values.conditionSource.trim()}` };
    }
  }
  return { log, model };
}

export function calibrationReviewResult(values: CalibrationReviewValues, nativeModel: CalibrationSideEvidence, fit: DragFit) {
  try {
    const evidence = reviewedCalibrationEvidence(values, nativeModel);
    return { evidence, ...assessCalibrationEligibility({ log: fit.logWindow, model: fit.modelWindow }, evidence) };
  } catch (error) {
    return { evidence: null, status: 'unverified' as const, reasons: [error instanceof Error ? error.message : String(error)] };
  }
}

/** Event selection is independent of motion/mass declarations. */
export function reviewedCalibrationEvents(values: CalibrationReviewValues, nativeModel: CalibrationSideEvidence): CalibrationEvidence {
  return requireCalibrationEvents(reviewedCalibrationEvidence({
    ...values, logMotion: 'unverified', logMass: 'unverified', modelMotion: 'unverified', modelMass: 'unverified',
  }, nativeModel));
}

export function CalibrationReview({ values, onChange }: { values: CalibrationReviewValues; onChange: (values: CalibrationReviewValues) => void }): JSX.Element {
  const text = (key: keyof CalibrationReviewValues, label: string, type = 'text') => (
    <label className="flex flex-col gap-1 text-[12px]">{label}<input type={type} step={type === 'number' ? 'any' : undefined} aria-label={label} value={values[key]} onChange={(event) => onChange({ ...values, [key]: event.target.value })} className="rounded border bg-transparent px-2 py-1" /></label>
  );
  const condition = (key: 'logMotion' | 'logMass' | 'modelMotion' | 'modelMass', label: string) => (
    <label className="flex flex-col gap-1 text-[12px]">{label}<Select ariaLabel={label} value={values[key]} onChange={(value) => onChange({ ...values, [key]: value as ConditionReview })}>
      <option value="unverified">Unverified</option><option value="supported">Supported by stated evidence</option><option value="unsupported">Unsupported</option>
    </Select></label>
  );
  return <fieldset className="space-y-3 rounded border p-3">
    <legend className="text-[12px] font-medium">Review eligibility before applying</legend>
    <Note>Preview is analysis-only until both trajectories have source-attributed evidence for the entire retained raw filter support. Use the imported log’s time origin, not an apogee-aligned clock. Final burnout means thrust and propellant depletion are complete by the latest bound; first recovery means the first deployment affecting the reconstruction. Enter conservative bounds including clock/event uncertainty; exact events use the same time in both fields. Recovery-free “through” includes its endpoint. A velocity peak does not establish motor burnout.</Note>
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {text('burnoutEarliest', 'Log final burnout earliest (s)', 'number')}
      {text('burnoutLatest', 'Log final burnout latest (s)', 'number')}
      <label className="flex flex-col gap-1 text-[12px]">Log recovery evidence<Select ariaLabel="Log recovery evidence" value={values.recoveryKind} onChange={(value) => onChange({ ...values, recoveryKind: value as CalibrationReviewValues['recoveryKind'] })}><option value="unverified">Unverified</option><option value="first-event">First recovery deployment bounds</option><option value="absent-through">Source establishes no recovery through time</option></Select></label>
      {values.recoveryKind === 'first-event' && <>{text('recoveryEarliest', 'Log first recovery earliest (s)', 'number')}{text('recoveryLatest', 'Log first recovery latest (s)', 'number')}</>}
      {values.recoveryKind === 'absent-through' && text('recoveryThrough', 'Log recovery-free through (s)', 'number')}
      {text('eventSource', 'Log event source and clock basis')}
      {condition('logMotion', 'Log approximately vertical air-relative motion')}
      {condition('logMass', 'Log constant mass across filter support')}
      {condition('modelMotion', 'Model approximately vertical air-relative motion')}
      {condition('modelMass', 'Model constant mass across filter support')}
      {text('conditionSource', 'Motion and mass evidence note')}
    </div>
    <Note>Motion review includes wind and lateral aerodynamic effects; vertical velocity alone cannot establish it. Model event checks use native model time and cannot establish flown conditions. A supported declaration establishes conditional eligibility only, not verified accuracy. The multiplier also affects powered drag and other speed/Mach/attitude regimes, which this fit does not qualify.</Note>
  </fieldset>;
}
