/**
 * Astraea Motor Total-Impulse Variance Model
 *
 * Certification-grounded default total-impulse dispersion per NAR impulse
 * class (A–O) for Monte Carlo impulse perturbation (`runMonteCarlo`'s
 * `impulsePctSigma`). Engine-only: no UI coupling.
 *
 * PROVENANCE
 * - NFPA 1125 Ch. 8 (Testing and Certification, paraphrased at
 *   https://www.thrustcurve.org/info/certification.html): a certified batch
 *   of commercial model or high-power motors must show a total-impulse
 *   standard deviation of at most 6.7% of nominal across the tested
 *   samples. There is no tighter class-tiered σ requirement in the code —
 *   the certification ceiling is class-independent.
 * - The per-class defaults below read that certification practice as a
 *   "typical" band of roughly ±6–10% of stated total impulse that tapers
 *   with class: small model-rocket classes (A–E) at ±10%, mid classes
 *   (F–K) stepping 9% → 7%, and large high-power classes (L–O) at ±6%.
 *   This matches the drag-corrected flight-dispersion reading that batch
 *   variability shows up most strongly in small, cheap motors, while large
 *   high-power motors are produced to tighter implied control.
 * - thrustcurve.org on the same page: "most modern manufacturers hold
 *   tighter tolerances in production." The modeled 1σ is therefore set AT
 *   the certification bound — a conservative upper estimate, not a
 *   measured batch spread.
 *
 * Use `describeUncertaintyDisplay` when presenting these numbers: the
 * TYPICAL range is the certification tolerance; the ESTIMATE is the model
 * assumption (σ at the band edge).
 */

import { impulseClassFor, MotorSpec } from '../propulsion/motorDatabase';

/** Supported NAR impulse classes for the variance table (A through O). */
const CLASS_A_TO_O = 'ABCDEFGHIJKLMNO';

/**
 * Certification-band width, ±percent of stated total impulse, per NAR
 * class. Small classes (A–E) carry the full ±10% band; large high-power
 * classes (L–O) taper to ±6%. See the file header for provenance.
 */
const CLASS_TOLERANCE_PCT: Readonly<Record<string, number>> = {
  A: 10, B: 10, C: 10, D: 10, E: 10,
  F: 9, G: 9,
  H: 8, I: 8,
  J: 7, K: 7,
  L: 6, M: 6, N: 6, O: 6,
};

/** Certification-test σ ceiling (NFPA 1125 Ch. 8, via thrustcurve.org). */
const CERTIFIED_SIGMA_CEILING_PCT = 6.7;

/** Default total-impulse variance for one NAR impulse class (A–O). */
export interface ImpulseVariance {
  /**
   * 1σ total-impulse spread, percent of nominal — the model's conservative
   * default, set AT the certification-tolerance band edge (ESTIMATE).
   */
  sigmaPct: number;
  /**
   * Certification-tolerance band, ±percent of nominal (TYPICAL range):
   * `typicalRangePct[0]` is the negative edge, `[1]` the positive edge.
   */
  typicalRangePct: [number, number];
  /** Provenance: why this class carries these numbers. */
  note: string;
}

/**
 * Default total-impulse variance (1σ, percent of nominal) for NAR impulse
 * class `impulseClass` (single uppercase letter A through O). Classes
 * outside A–O — including the letters the engine's `impulseClassFor` can
 * still emit (P–Z) — throw: there is no certification-grounded default to
 * return, and silently extrapolating a variance would fake precision.
 */
export function sigmaForImpulseClass(impulseClass: string): ImpulseVariance {
  if (typeof impulseClass !== 'string' || !/^[A-O]$/.test(impulseClass)) {
    throw new Error(
      `sigmaForImpulseClass: unsupported impulse class ${JSON.stringify(impulseClass)} — expected a single uppercase letter A through O`
    );
  }
  const tolerance = CLASS_TOLERANCE_PCT[impulseClass];
  return {
    sigmaPct: tolerance,
    typicalRangePct: [-tolerance, tolerance],
    note:
      `±${tolerance}% of stated total impulse (NAR/Tripoli certification tolerance for ` +
      `class ${impulseClass}); 1σ default set at the band edge — conservative ` +
      `(certified batches hold total-impulse σ ≤ ${CERTIFIED_SIGMA_CEILING_PCT}%, NFPA 1125 Ch. 8)`,
  };
}

/**
 * Honest display strings for a class's total-impulse uncertainty: TYPICAL
 * names the certification-tolerance range; ESTIMATE names the model's 1σ
 * assumption and why it sits at the band edge rather than a measured
 * spread. Throw behavior matches `sigmaForImpulseClass`.
 */
export function describeUncertaintyDisplay(impulseClass: string): {
  typical: string;
  estimate: string;
} {
  const { sigmaPct, typicalRangePct, note } = sigmaForImpulseClass(impulseClass);
  return {
    typical:
      `TYPICAL range: class ${impulseClass} motors deliver within ` +
      `${typicalRangePct[0]}% to +${typicalRangePct[1]}% of stated total impulse ` +
      `(NAR/Tripoli commercial certification tolerance).`,
    estimate:
      `ESTIMATE: 1σ total-impulse spread modeled at ${sigmaPct}% of nominal — ` +
      `sigma set at the certification bound as a conservative Gaussian default ` +
      `(certified batches hold σ ≤ ${CERTIFIED_SIGMA_CEILING_PCT}%, and manufacturers ` +
      `usually run tighter; ${note}).`,
  };
}

/**
 * Certification-grounded 1σ total-impulse suggestion (percent of nominal)
 * for a concrete motor, derived from its stated `totalImpulse` via the
 * engine's own class convention (`impulseClassFor`). Drop the result into
 * `runMonteCarlo`'s `perturbations.impulsePctSigma` for a class-appropriate
 * default. Non-finite total impulse throws rather than guessing a class.
 */
export function defaultImpulseSigma(motor: MotorSpec): number {
  if (!Number.isFinite(motor.totalImpulse) || motor.totalImpulse <= 0) {
    throw new Error(
      `defaultImpulseSigma: motor ${JSON.stringify(motor.id)} has non-finite or ` +
        `nonpositive totalImpulse (${motor.totalImpulse})`
    );
  }
  return sigmaForImpulseClass(impulseClassFor(motor.totalImpulse)).sigmaPct;
}

// `CLASS_A_TO_O` doubles as the documented supported domain; export it for
// tests and any consumer that needs to enumerate supported classes.
export const SUPPORTED_IMPULSE_CLASSES: readonly string[] = CLASS_A_TO_O.split('');