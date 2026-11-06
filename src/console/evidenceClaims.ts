/**
 * Customer-facing evidence claims, shared by the beta banner and the model
 * status panel so the wording cannot drift between surfaces. These restate
 * established documented facts only; never extend them without evidence.
 *
 * The blind-test result is historical evidence for the original legacy model.
 * It does not qualify the experimental candidate model.
 */

/**
 * The banner's one-line summary. It keeps the qualification and the accuracy
 * headline in the reading path; the full claim stays one toggle away and is
 * never truncated out of the DOM.
 */
export const BETA_BANNER_SHORT =
  'Beta · not flight approval · legacy model tested on one small subsonic rocket (6–10% high)';

/** The exact beta accuracy claim shown in the product banner and model status. */
export const BETA_ACCURACY_CLAIM =
  'Legacy model only. Apogee tested blind on one small subsonic rocket: predictions ran 6–10% high. ' +
  'That evidence does not cover the experimental candidate model. ' +
  'Other vehicles and supersonic flight are untested. Not flight approval.';
