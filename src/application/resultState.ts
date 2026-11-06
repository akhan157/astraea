/**
 * Result qualification: the single rule that keeps missing, stale, invalid,
 * or offline results from ever rendering as passing.
 *
 * A pass requires all of: inputs preflight clean (valid), the stored input
 * key matching current committed inputs (current), the native backend
 * reachable at run time (not offline), and a gate that actually evaluated
 * to pass. Everything else surfaces its own qualified state. Labels use
 * plain hyphens, never em-dashes.
 */

export type BadgeStatus =
  | 'pass'
  | 'caution'
  | 'fail'
  | 'unknown'
  | 'stale'
  | 'invalid'
  | 'running'
  | 'idle'
  | 'offline'
  | 'experimental';

export type GateOutcome = 'pass' | 'fail' | 'unknown';

export interface QualifyInput {
  /** Preflight/validity outcome for the inputs behind the result. */
  valid: boolean;
  /** True when the stored run key equals the current committed-input key. */
  current: boolean;
  /** Gate evaluation on this result, when one was actually evaluated. */
  gate: GateOutcome;
  /** Execution lifecycle; non-terminal states keep their own badge. */
  lifecycle?: 'idle' | 'running' | 'completed' | 'failed';
  /** True when the native backend was unreachable for this analysis. */
  offline?: boolean;
}

export interface QualifiedResult {
  status: BadgeStatus;
  /** Badge label, always qualified (never a bare pass on old inputs). */
  label: string;
  /** True only for a current, valid, online, gate-passing result. */
  isPass: boolean;
}

export function qualifyResult(input: QualifyInput): QualifiedResult {
  if (input.lifecycle === 'running') {
    return { status: 'running', label: 'Running', isPass: false };
  }
  if (input.lifecycle === 'failed') {
    return { status: 'fail', label: 'Run failed', isPass: false };
  }
  if (input.offline === true) {
    return { status: 'offline', label: 'Offline: native backend unavailable', isPass: false };
  }
  if (!input.valid) {
    return { status: 'invalid', label: 'Invalid: repair inputs', isPass: false };
  }
  if (!input.current) {
    return {
      status: 'stale',
      label: input.gate === 'pass' ? 'Stale: was passing, rerun required' : 'Stale: rerun required',
      isPass: false,
    };
  }
  if (input.gate === 'pass') {
    return { status: 'pass', label: 'Pass: current inputs', isPass: true };
  }
  if (input.gate === 'fail') {
    return { status: 'fail', label: 'Fail: current inputs', isPass: false };
  }
  return { status: 'unknown', label: 'No gate evaluated', isPass: false };
}
