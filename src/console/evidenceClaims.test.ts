import { describe, expect, it } from 'vitest';
import { BETA_ACCURACY_CLAIM } from './evidenceClaims';

/**
 * The claim is customer-facing evidence wording: any edit is a deliberate,
 * reviewed change to what the product asserts. Pinning the whole string keeps
 * the banner, the model status panel and the published copies from drifting.
 */
describe('BETA_ACCURACY_CLAIM', () => {
  it('pins the exact customer-facing accuracy claim', () => {
    expect(BETA_ACCURACY_CLAIM).toBe(
      'Default model: apogee error averaged 5.6% across 20 published rockets (18 of 20 within 10%) with site temperature set and the nozzle exit set where the design has one, 5.9% (16 of 20) with them blank. Development data: the model was chosen on these flights; blind test pending. Shapes it cannot model use legacy drag, which has no blind test on those shapes; on one small rocket with freeform fins it predicted about 26% low (10 flights, development comparison). Not flight approval.',
    );
  });
});
