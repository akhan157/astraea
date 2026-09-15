/**
 * RIVAL S2 — result qualification: stale/invalid results never display an
 * unqualified pass (synthesis §4 criterion (b)/(c): the engineer can always
 * state which result they trust and why).
 *
 * A `pass` badge requires all of: the run is valid (inputs preflighted), its
 * inputs are current (the S1 snapshot key matches the present resolved case),
 * and the gate actually evaluated to pass. Anything else surfaces its own
 * qualified state — a stale result stays stale even when the old numbers
 * passed, and an invalid run never shows a gate outcome.
 */
import type { BadgeStatus } from '../components/ui/StatusBadge';

export interface QualifyInput {
  /** Preflight/validity outcome for the inputs behind the result. */
  valid: boolean;
  /** True when the stored run key equals the current resolved-input key. */
  current: boolean;
  /** Gate evaluation on this result, when one was actually evaluated. */
  gate: 'pass' | 'fail' | 'unknown';
  /** Execution lifecycle; non-terminal states keep their own badge. */
  lifecycle?: 'idle' | 'running' | 'completed' | 'failed';
}

export interface QualifiedResult {
  status: BadgeStatus;
  /** Badge label, always qualified (never a bare "Pass" on old inputs). */
  label: string;
  /** True only for a current, valid, gate-passing result. */
  isPass: boolean;
}

export function qualifyResult(input: QualifyInput): QualifiedResult {
  if (input.lifecycle === 'running') {
    return { status: 'running', label: 'Running', isPass: false };
  }
  if (input.lifecycle === 'failed') {
    return { status: 'fail', label: 'Run failed', isPass: false };
  }
  if (!input.valid) {
    return { status: 'invalid', label: 'Invalid — repair inputs', isPass: false };
  }
  if (!input.current) {
    return {
      status: 'stale',
      label: input.gate === 'pass' ? 'Stale — was passing, rerun required' : 'Stale — rerun required',
      isPass: false,
    };
  }
  if (input.gate === 'pass') {
    return { status: 'pass', label: 'Pass — current inputs', isPass: true };
  }
  if (input.gate === 'fail') {
    return { status: 'fail', label: 'Fail — current inputs', isPass: false };
  }
  return { status: 'unknown', label: 'No gate evaluated', isPass: false };
}