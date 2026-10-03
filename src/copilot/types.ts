/**
 * Experimental copilot — shared types (tier 1, rule-based).
 *
 * Hard rule 1: every number the copilot shows is an engine result. A
 * `Quantity` therefore always carries the confidence level and the engine
 * call it came from; the copilot never constructs a value of its own.
 *
 * PROVISIONAL: `docs/ui-data-contract.md` (owned by the engine branch) will
 * define the canonical result shapes and confidence semantics. Until it
 * lands, these shapes are local and the confidence mapping lives in one
 * place (`engine.ts`) so the switch is a single adapter change.
 */

/** Confidence ladder shared with the UI (see handoff hard rule 1). */
export type Confidence = 'Measured' | 'Calibrated' | 'Modeled' | 'Extrapolated' | 'Unknown';

/** An engine-produced value with its unit, confidence and provenance. */
export interface Quantity {
  value: number;
  unit: string;
  confidence: Confidence;
  /** Engine command that produced the value, e.g. `stability`, `simulate_flight`. */
  source: string;
  /** Why the confidence is what it is (shown next to the number). */
  confidenceReason: string;
}

export type CheckId = 'stability-low' | 'stability-high' | 'rail-exit' | 'descent-rate' | 'apogee-target';

export type CheckStatus = 'pass' | 'fail' | 'not-evaluated';

export interface CheckResult {
  id: CheckId;
  title: string;
  status: CheckStatus;
  /** The engine value the check judged; absent when not evaluated. */
  value?: Quantity;
  /** Human statement of the threshold, e.g. "≤ 3.0 cal". */
  threshold: string;
  /** One-line verdict or, for not-evaluated, the reason (fail closed). */
  message: string;
}

/** A vehicle edit a fix proposes; applied only on the user's click. */
export interface ProposedEdit {
  componentId: string;
  componentName: string;
  field: string;
  /** Committed value the fix was computed against (staleness guard). */
  before: number;
  after: number;
  unit: string;
}

/** One before → after line, both sides engine results. */
export interface FixDelta {
  label: string;
  before: Quantity;
  after: Quantity;
}

export type FixOutcome =
  | {
      kind: 'vehicle-edit';
      checkId: CheckId;
      summary: string;
      edit: ProposedEdit;
      deltas: FixDelta[];
      caveats: string[];
      /** Number of engine evaluations the search used. */
      engineCalls: number;
    }
  | {
      /** A launch-setup change the copilot cannot apply to the design. */
      kind: 'advice';
      checkId: CheckId;
      summary: string;
      deltas: FixDelta[];
      caveats: string[];
      engineCalls: number;
    }
  | {
      kind: 'no-fix';
      checkId: CheckId;
      reason: string;
      engineCalls: number;
    };
