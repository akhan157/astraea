/**
 * Quantity formatting: every engineering number renders with units, and
 * missing values render as Unknown, never zero.
 *
 * Canonical storage is always SI. Display conversion here is presentation
 * only and never mutates stored values.
 */

export type UnitSystem = 'metric' | 'imperial';

export const UNKNOWN = 'Unknown';

function isPresent(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const FT_PER_M = 3.280839895;
const LB_PER_KG = 2.204622622;
const LBF_PER_N = 0.224808943;
const PSI_PER_PA = 0.000145037738;

export function formatLength(meters: number | null | undefined, units: UnitSystem): string {
  if (!isPresent(meters)) return UNKNOWN;
  if (units === 'imperial') return `${(meters * FT_PER_M).toFixed(3)} ft`;
  if (Math.abs(meters) < 0.01) return `${(meters * 1000).toFixed(1)} mm`;
  return `${meters.toFixed(3)} m`;
}

export function formatMass(kg: number | null | undefined, units: UnitSystem): string {
  if (!isPresent(kg)) return UNKNOWN;
  if (units === 'imperial') return `${(kg * LB_PER_KG).toFixed(3)} lb`;
  if (Math.abs(kg) < 1) return `${(kg * 1000).toFixed(1)} g`;
  return `${kg.toFixed(3)} kg`;
}

export function formatForce(newtons: number | null | undefined, units: UnitSystem): string {
  if (!isPresent(newtons)) return UNKNOWN;
  if (units === 'imperial') return `${(newtons * LBF_PER_N).toFixed(2)} lbf`;
  return `${newtons.toFixed(2)} N`;
}

export function formatImpulse(newtonSeconds: number | null | undefined, units: UnitSystem): string {
  if (!isPresent(newtonSeconds)) return UNKNOWN;
  if (units === 'imperial') return `${(newtonSeconds * LBF_PER_N).toFixed(2)} lbf s`;
  return `${newtonSeconds.toFixed(2)} N s`;
}

export function formatVelocity(mps: number | null | undefined, units: UnitSystem): string {
  if (!isPresent(mps)) return UNKNOWN;
  if (units === 'imperial') return `${(mps * FT_PER_M).toFixed(1)} ft/s`;
  return `${mps.toFixed(2)} m/s`;
}

export function formatPressure(pa: number | null | undefined, units: UnitSystem): string {
  if (!isPresent(pa)) return UNKNOWN;
  if (units === 'imperial') return `${(pa * PSI_PER_PA).toFixed(2)} psi`;
  if (Math.abs(pa) >= 1000) return `${(pa / 1000).toFixed(2)} kPa`;
  return `${pa.toFixed(1)} Pa`;
}

export function formatAngleDeg(deg: number | null | undefined): string {
  if (!isPresent(deg)) return UNKNOWN;
  return `${deg.toFixed(2)} deg`;
}

export function formatMach(mach: number | null | undefined): string {
  if (!isPresent(mach)) return UNKNOWN;
  return `Mach ${mach.toFixed(2)}`;
}

export function formatScalar(
  value: number | null | undefined,
  unit: string,
  digits = 2,
): string {
  if (!isPresent(value)) return UNKNOWN;
  return `${value.toFixed(digits)} ${unit}`;
}

export function formatCount(value: number | null | undefined, unit: string): string {
  if (!isPresent(value)) return UNKNOWN;
  return `${Math.round(value)} ${unit}`;
}

/**
 * A labeled engineering value with frame and provenance, for inspector rows
 * and plot readouts. Value null means missing: callers render UNKNOWN.
 */
export interface QuantityView {
  label: string;
  text: string;
  /** e.g. "body frame, nose-tip datum" or "local ENU". Omit when N/A. */
  frame?: string;
  /** e.g. "native core stability v1" or "imported .eng file". */
  provenance?: string;
}
