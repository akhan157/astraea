/**
 * Shared landing-availability rule for retained flight records. It answers one
 * question only: does this record carry a nominal touchdown with no explicit
 * timeout, so landing and recorded-descent values may be presented as landing
 * results? It is not a landing-safety, flight-validity or approval claim.
 */
export type LandingAvailability = { available: true } | { available: false; reason: string };

export type LandingRecord = {
  summary: { landingNominal: boolean };
  terminationReason?: 'touchdown' | 'timeout';
};

/** Availability from the retained result, not a claim of parachute success or flight approval. */
export function landingAvailability(run: LandingRecord): LandingAvailability {
  if (run.terminationReason === 'timeout') return { available: false, reason: 'run stopped on its time limit' };
  if (run.summary.landingNominal !== true) return { available: false, reason: 'no nominal touchdown' };
  return { available: true };
}
