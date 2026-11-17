/**
 * Customer-facing evidence claims, shared by the beta banner and the model
 * status panel so the wording cannot drift between surfaces. These restate
 * established documented facts only; never extend them without evidence.
 *
 * The default-model results are development data; the blind test is pending.
 * The historical blind-test result applies to the legacy model.
 */

/**
 * The banner's one-line summary. It keeps the qualification and the accuracy
 * headline in the reading path; the full claim stays one toggle away and is
 * never truncated out of the DOM.
 */
export const BETA_BANNER_SHORT =
  'Beta · not flight approval · apogee error averaged 5.6–5.9% on 20 published rockets (development data)';

/** The exact beta accuracy claim shown in the product banner and model status. */
export const BETA_ACCURACY_CLAIM =
  'Default model: apogee error averaged 5.6% across 20 published rockets (18 of 20 within 10%) with site temperature set and the nozzle exit set where the design has one, 5.9% (16 of 20) with them blank. Development data: the model was chosen on these flights; blind test pending. Shapes it cannot model use legacy drag, which has no blind test on those shapes; on one small rocket with freeform fins it predicted about 26% low (10 flights, development comparison). Not flight approval.';
