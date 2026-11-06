/**
 * Geometry-only CP support. The native `stability` command substitutes
 * CP = 2/3 × length when |ΣCNα| ≤ 1e-4 and always derives a margin and a
 * stable/overstable verdict from whatever CP it has. A CP position only means
 * something for stability when the summed normal-force slope is positive and
 * not a cancellation residue, so the app withholds CP, margin and verdict
 * otherwise and keeps every slope and contribution the engine returned.
 *
 * Flight support requires finite C ≥ 1e-4 and C > 64·ε·Σ|C_i|.
 * Geometry additionally requires C > 1e-4: at equality the native geometry
 * command still substitutes its stand-in rather than calculating the ratio.
 */
import type { StabilityAnalysis } from '../core/types';

/** Flight normal model's positive support floor for ΣCNα (per rad). */
export const NORMAL_SLOPE_SUPPORT_FLOOR = 1e-4;
const CONDITIONING_FACTOR = 64 * Number.EPSILON;

function unsupportedReason(analysis: StabilityAnalysis): string | undefined {
  const c = analysis.totalCNa;
  const slope = `total normal-force slope ${c} /rad`;
  if (!Number.isFinite(c)) return `The ${slope} is not finite, so no center of pressure is defined.`;
  if (c <= 0) return `The ${slope} is not a positive supported value; a CP position would not indicate a restoring moment, so no stability verdict is given.`;
  if (c <= NORMAL_SLOPE_SUPPORT_FLOOR) return `The ${slope} is below the supported geometry range (strictly above ${NORMAL_SLOPE_SUPPORT_FLOOR} /rad); the engine's 2/3-length stand-in is not a center of pressure, so no margin or verdict is given. Add fins or reduce the tail taper.`;
  const sumAbs = analysis.contributions.reduce((sum, part) => sum + Math.abs(part.cna ?? 0), 0);
  if (!Number.isFinite(sumAbs)) return `The parts' summed normal-force slope magnitude is not finite, so no center of pressure or stability verdict is defined.`;
  if (!(c > CONDITIONING_FACTOR * sumAbs)) return `The ${slope} cancels the parts' summed slope magnitude ${sumAbs} /rad to rounding level, so the CP ratio is not resolvable.`;
  return undefined;
}

/** Same values when the slope is supported; otherwise CP/margin/verdict withheld with a reason. */
export function qualifyGeometryStability(analysis: StabilityAnalysis): StabilityAnalysis {
  const reason = unsupportedReason(analysis);
  if (reason === undefined) return analysis;
  return { ...analysis, cp: Number.NaN, staticMarginCalibers: Number.NaN, isStable: false, isOverStable: false, cpUnavailable: reason };
}
