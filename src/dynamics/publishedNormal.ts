/**
 * Published supersonic normal-force law (P1 Option B) — the TypeScript twin of
 * `astraea_core::six_dof::flight_normal_groups`.
 *
 * Subsonic domain (`M <= 0.8`): the legacy Barrowman groups, unchanged
 * (`cna_body`, `cna_fins`, first moments). The blend (`0.8 < M < 1.2`) moves
 * each fin set's published ratio and the body group from their legacy value at
 * M = 0.8 to their supersonic value anchored at M = 1.2 with monotone Hermite
 * interpolation (C1 at joins where derivative limiting is inactive),
 * so the M = 1 linear-theory singularity is never evaluated.
 *
 * Supersonic domain (`M >= 1.2`): per fin set
 *   CNa(M) = cna_subsonic * r(M),
 *   r(M) = finite-wing slope / incompressible finite-wing slope
 * with the swept-normal Mach (Prandtl NACA 116, Ackeret NACA TM 317, Glauert
 * 1927), and the body term is the positive area growth (nose + diameter
 * increases; telescopes to 2·(dmax/dref)²). A contracting afterbody is one
 * named parameter: `suppressed` (default) or `attached` (legacy slender-body
 * dS/dx term retained).
 *
 * `suppressed` is an explicitly qualified INTERIM model-form assumption, not
 * a validated separation model and not a conservative stability bound. A
 * separated base wake does not establish zero pressure-derived normal force
 * over the whole boattail; MIL-HDBK-762 §5-3.1.2 (printed p. 5-12) retains
 * negative boattail loading and directs supersonic estimates to component
 * data. No source supporting zero lift for every supersonic boattail was
 * established, so the original source-supported-suppression condition is
 * literally unmet. The better ARCAS total CP does not isolate the mechanism.
 *
 * Stability fix; supersonic CP not validated to the ARCAS band. ARCAS CP/CNα gate remains FAIL. Supersonic boattail lift is suppressed as an interim approximation; the attached sensitivity arm is retained.
 *
 * CP is always recomputed from the weighted group moments — never an
 * independently prescribed shift.
 */
import {
  publishedFinLiftSlopeRatio,
  publishedFinLiftSlopeRatioDerivative,
} from '../aero/transonicAero';

export type BoattailLift = 'suppressed' | 'attached';

export interface PublishedFinSet {
  /** Signed subsonic Barrowman fin-group slope for this set, per radian. */
  cna: number;
  /** CP station from the nose, meters. */
  cp: number;
  aspectRatio: number;
  /** cos of the leading-edge sweep angle. */
  leadingEdgeCos: number;
}

export interface PublishedNormalParams {
  finSets: readonly PublishedFinSet[];
  bodyPositiveCna: number;
  bodyPositiveMoment: number;
  bodyPositiveAbsCna: number;
  bodyAttachedCna: number;
  bodyAttachedMoment: number;
  bodyAttachedAbsCna: number;
  boattailLift: BoattailLift;
}

export interface NormalGroups {
  cna: number;
  moment: number;
  absCna: number;
}

export interface NormalLawResult extends NormalGroups {
  cp: number;
}

export const NORMAL_LEGACY_FULL_MACH = 0.8;
export const NORMAL_SUPERSONIC_FULL_MACH = 1.2;

/**
 * Fritsch & Carlson, "Monotone Piecewise Cubic Interpolation", SIAM J.
 * Numer. Anal. 17(2), 238–246 (1980), doi:10.1137/0717021.
 * Zero tangents opposing the secant; project (alpha, beta) into the radius-3
 * circle. Each group stays within its endpoints. Unmodified tangents retain
 * C1 joins; limited tangents need not match the exterior derivative/cusp.
 * Keep arithmetic/branch order identical to six_dof.rs::hermite.
 */
function hermite(t: number, q0: number, q1: number, m0: number, m1: number, width: number): number {
  const secant = (q1 - q0) / width;
  if (secant === 0) return q0;
  let alpha = m0 / secant;
  let beta = m1 / secant;
  if (alpha < 0) {
    m0 = 0;
    alpha = 0;
  }
  if (beta < 0) {
    m1 = 0;
    beta = 0;
  }
  const radius = Math.sqrt(alpha * alpha + beta * beta);
  if (radius > 3) {
    const tau = 3 / radius;
    m0 = tau * alpha * secant;
    m1 = tau * beta * secant;
  }
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const value = h00 * q0 + h10 * width * m0 + h01 * q1 + h11 * width * m1;
  // Roundoff guard only: the limited polynomial is analytically monotone.
  return Math.max(Math.min(q0, q1), Math.min(Math.max(q0, q1), value));
}

function bodyGroups(p: PublishedNormalParams): NormalGroups {
  return p.boattailLift === 'attached'
    ? { cna: p.bodyAttachedCna, moment: p.bodyAttachedMoment, absCna: p.bodyAttachedAbsCna }
    : { cna: p.bodyPositiveCna, moment: p.bodyPositiveMoment, absCna: p.bodyPositiveAbsCna };
}

function finGroupsAt(mach: number, sets: readonly PublishedFinSet[]): NormalGroups {
  let cna = 0;
  let moment = 0;
  let absCna = 0;
  for (const set of sets) {
    const c = set.cna * publishedFinLiftSlopeRatio(mach, set.aspectRatio, set.leadingEdgeCos);
    cna += c;
    moment += c * set.cp;
    absCna += Math.abs(c);
  }
  return { cna, moment, absCna };
}

function finGroupsBlended(sets: readonly PublishedFinSet[], t: number): NormalGroups {
  const width = NORMAL_SUPERSONIC_FULL_MACH - NORMAL_LEGACY_FULL_MACH;
  let cna = 0;
  let moment = 0;
  let absCna = 0;
  for (const set of sets) {
    const r1 = publishedFinLiftSlopeRatio(NORMAL_SUPERSONIC_FULL_MACH, set.aspectRatio, set.leadingEdgeCos);
    const dr1 = publishedFinLiftSlopeRatioDerivative(
      NORMAL_SUPERSONIC_FULL_MACH,
      set.aspectRatio,
      set.leadingEdgeCos,
    );
    // Legacy fin law is constant for M <= 1, so the left slope is zero.
    const c = hermite(t, set.cna, set.cna * r1, 0, set.cna * dr1, width);
    cna += c;
    moment += c * set.cp;
    absCna += Math.abs(c);
  }
  return { cna, moment, absCna };
}

/** Force/moment groups at one Mach. Throws on a nonfinite prepared parameter. */
export function publishedNormalGroupsAt(mach: number, p: PublishedNormalParams): NormalGroups {
  const legacy: NormalGroups = {
    cna: p.bodyAttachedCna,
    moment: p.bodyAttachedMoment,
    absCna: p.bodyAttachedAbsCna,
  };
  // Legacy fin ratio is 1 in the subsonic/blend domain.
  const legacyFins = p.finSets.reduce(
    (acc, set) => {
      acc.cna += set.cna;
      acc.moment += set.cna * set.cp;
      acc.absCna += Math.abs(set.cna);
      return acc;
    },
    { cna: 0, moment: 0, absCna: 0 },
  );
  if (!Number.isFinite(mach) || mach <= NORMAL_LEGACY_FULL_MACH) {
    return {
      cna: legacy.cna + legacyFins.cna,
      moment: legacy.moment + legacyFins.moment,
      absCna: legacy.absCna + legacyFins.absCna,
    };
  }
  const finite =
    p.finSets.every(
      (s) =>
        Number.isFinite(s.cna) &&
        Number.isFinite(s.cp) &&
        Number.isFinite(s.aspectRatio) &&
        s.aspectRatio > 0 &&
        Number.isFinite(s.leadingEdgeCos),
    ) &&
    [
      p.bodyPositiveCna,
      p.bodyPositiveMoment,
      p.bodyPositiveAbsCna,
      p.bodyAttachedCna,
      p.bodyAttachedMoment,
      p.bodyAttachedAbsCna,
    ].every(Number.isFinite);
  if (!finite) throw new Error('flight normal model: nonfinite published supersonic parameters');
  const bodySup = bodyGroups(p);
  let body: NormalGroups;
  let fin: NormalGroups;
  if (mach >= NORMAL_SUPERSONIC_FULL_MACH) {
    body = bodySup;
    fin = finGroupsAt(mach, p.finSets);
  } else {
    const width = NORMAL_SUPERSONIC_FULL_MACH - NORMAL_LEGACY_FULL_MACH;
    const t = (mach - NORMAL_LEGACY_FULL_MACH) / width;
    // Zero endpoint slopes: the legacy body is constant on the left, the
    // exterior body is constant on the right.
    body = {
      cna: hermite(t, legacy.cna, bodySup.cna, 0, 0, width),
      moment: hermite(t, legacy.moment, bodySup.moment, 0, 0, width),
      absCna: hermite(t, legacy.absCna, bodySup.absCna, 0, 0, width),
    };
    fin = finGroupsBlended(p.finSets, t);
  }
  return {
    cna: body.cna + fin.cna,
    moment: body.moment + fin.moment,
    absCna: body.absCna + fin.absCna,
  };
}

/** Groups plus the derived CP (moment / CNalpha). */
export function publishedNormalAtMach(mach: number, p: PublishedNormalParams): NormalLawResult {
  const groups = publishedNormalGroupsAt(mach, p);
  return { ...groups, cp: groups.moment / groups.cna };
}
