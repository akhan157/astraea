/**
 * C13 Reference-Frame & Units Explainer Content.
 *
 * Pure content: no UI. Explainer cards keyed by stable topic ids; the shell
 * (slice S7) renders a topic's sections when the user asks. Content is
 * grounded in Astraea's shipped conventions — see src/core/mass.ts
 * (nose-tip CG datum), src/aero/barrowman.ts + src/aero/stabilityBreakdown.ts
 * (caliber margin, 1.0/3.0 thresholds), src/sim/sixDofSimulator.ts (frame
 * manifest), src/formats/rasaero.ts (nose-tip exports).
 */

/** A heading plus body copy inside an explainer topic. */
export interface ExplainerSection {
  heading: string;
  paragraphs: readonly string[];
}

export interface ExplainerTopic {
  /** Stable machine id — the shell keys rendered cards on this. */
  id: string;
  /** Short human title. */
  title: string;
  /** One-sentence summary for cards and lists. */
  summary: string;
  /** Ordered body sections. */
  sections: readonly ExplainerSection[];
  /** Search keywords (lowercase; used by the S7 help/search surface). */
  keywords: readonly string[];
}

/**
 * Known confusion topics the onboarding pack must always explain (Forum T6:
 * CG-reference and stability-units confusion). Validate explains coverage by
 * default against this list, so deleting one of these cards fails the suite.
 */
export const REQUIRED_EXPLAINER_TOPIC_IDS: ReadonlySet<string> = new Set([
  'cg-datum-convention',
  'stability-margin-units',
]);

const topic = (
  id: string,
  title: string,
  summary: string,
  sections: readonly ExplainerSection[],
  keywords: readonly string[]
): ExplainerTopic => Object.freeze({ id, title, summary, sections: Object.freeze(sections), keywords: Object.freeze(keywords) });

const section = (heading: string, ...paragraphs: string[]): ExplainerSection =>
  Object.freeze({ heading, paragraphs: Object.freeze(paragraphs) });

/** Shipped explainer corpus. */
export const EXPLAINER_TOPICS: readonly ExplainerTopic[] = Object.freeze([
  topic(
    'cg-datum-convention',
    'CG and CP datum: measured from the nose tip',
    'Center of gravity and center of pressure are reported in meters from the very front of the nose — the nose tip — never from the base or the launch pad.',
    [
      section(
        'The Astraea datum: the nose tip',
        'Every axial station in Astraea is measured from x = 0 at the nose tip, positive toward the tail. A CG of 0.620 m means the center of gravity sits 620 mm behind the nose tip; a CP of 0.730 m means the aerodynamic center sits 730 mm behind it.',
        'Mass aggregation, the Barrowman aero analysis, the 6-DOF loads, blueprint stations, and RASAero export all use the same nose-tip chain, so a number means the same thing everywhere in the product.'
      ),
      section(
        'Why the datum is the usual source of confusion',
        'Other tools and textbooks use different reference points: the front of the body tube (excluding the nose), the base of the rocket, the overall center, or a percentage of length. A rocket does not have one CG number — it has a CG distance per reference point, and quoting the wrong one reads as a very different rocket.',
        'When comparing any value from outside Astraea, first ask what datum it was measured from. A CG that looks dangerously far forward under one convention can be entirely normal under another.'
      ),
      section(
        'CG and CP must share one frame',
        'Stability is the axial gap between CP and CG, so both must be measured from the same datum. Astraea derives the CG from the physical mass model and the CP from the aero model in the shared nose-tip frame; the product never mixes datums within an analysis.'
      ),
    ],
    ['center of gravity', 'cg', 'datum', 'origin', 'nose tip', 'cp', 'center of pressure', 'reference point']
  ),
  topic(
    'stability-margin-units',
    'Stability margin: calibers vs percent',
    'Static stability margin is expressed in calibers — the CP-minus-CG gap divided by one reference body diameter — and also as a percent of body length. Calibers are a dimensionless ratio, not a physical unit.',
    [
      section(
        'The margin is a gap',
        'Static margin = CP − CG: how far the aerodynamic center (CP) sits behind the center of gravity (CG). It is quoted in calibers because calibers travel across rocket sizes.'
      ),
      section(
        'One caliber = one reference diameter',
        'A caliber here is the reference body diameter (normally the body-tube diameter), and the margin in calibers is (CP − CG) ÷ reference diameter. It has no physical dimension: a 1.00-caliber margin means the CP is exactly one body diameter behind the CG.',
        'Astraea treats at least 1.00 caliber as the stable band and flags margins above 3.00 calibers as overstable (windcocking risk), matching the shipped linter thresholds.'
      ),
      section(
        'Calibers vs percent of body length',
        'The same gap can be written as percent of total body length — the stability panel shows both. On a long, skinny rocket a 1-caliber margin is a small fraction of length; on a short, fat rocket it is a large one.',
        'Switching between calibers and percent never changes the physics; it only changes the normalization of the same gap, so always read the label next to the number.'
      ),
    ],
    ['stability', 'margin', 'caliber', 'calibers', 'percent', 'static margin', 'stable', 'overstable']
  ),
  topic(
    'axial-coordinate-frame',
    'The axial coordinate frame',
    'The vehicle axis defines the primary structural frame: x = 0 at the nose tip, positive x toward the tail; stations, CG, CP, and exports all live on that chain.',
    [
      section(
        'Origin and positive direction',
        'Astraea lays the rocket on an axial chain with the nose tip at x = 0 and positive x pointing aft (toward the motor). Component positions, internal stations, CG, and CP are all distances along that axis; transverse measures are diameters at each station.'
      ),
      section(
        'One chain everywhere',
        'The mass rollup and the aerodynamic analysis walk the same component chain, so a component CG and the resultant CP land in the same coordinate frame. There is no second, hidden origin inside the simulation.'
      ),
      section(
        'Exports keep the origin',
        'Blueprint side views and RASAero outer-mold-line exports also place x = 0 at the nose tip (RASAero stations are quoted in inches from the nose tip), so what you inspect in the canvas is what leaves the product.'
      ),
    ],
    ['frame', 'axis', 'station', 'nose tip', 'coordinate system', 'x']
  ),
  topic(
    'ground-frame-enu',
    'The ground frame: local East–North–Up',
    'Ground-referenced output — landing dispersion, waiver geometry, and KML tracks — uses a local East–North–Up (ENU) frame anchored at the launch point, shown as E / N offsets in meters.',
    [
      section(
        'A local level frame',
        'ENU is a right-handed local tangent-plane frame: +x east, +y north, +z up, anchored at the launch point. A reading of "E 5.2 · N −1.3 m" means 5.2 m east and 1.3 m south of that anchor — not a position relative to the rocket.'
      ),
      section(
        'Frames are labeled, not assumed',
        'Body-frame forces and attitude live in the vehicle frame; ENU is where flight results touch the ground. Monte Carlo landing clouds, waiver polygons, and KML export all use the same local ENU anchor, and the 6-DOF run manifest declares frame and origin for every output quantity.'
      ),
      section(
        'North is stated',
        'Where a direction needs a north basis — rail azimuth, wind direction — the product labels true, magnetic, or grid north and states whether a wind direction is "from" or "toward".'
      ),
    ],
    ['enu', 'east', 'north', 'up', 'frame', 'ground', 'landing', 'waiver', 'kml', 'azimuth']
  ),
  topic(
    'body-frame-aero',
    'The body frame for aerodynamic loads',
    'Aerodynamic loads and attitude are expressed in the rocket body frame; the frame and its sign conventions are declared so imported or exported data is never silently reinterpreted.',
    [
      section(
        'The loads frame',
        'Normal-force slope and CP are computed in the body/axial frame as a function of angle of attack; the dynamics engine stamps each run with the navigation/body frames and origin conventions it used.'
      ),
      section(
        'Why the frame has to be explicit',
        'Mixing a load computed in the body frame with a displacement measured in a ground frame is a classic slip. Astraea keeps body-frame quantities and ENU ground quantities separate and labeled, and imports report which fields map to which convention.'
      ),
    ],
    ['body frame', 'frame', 'attitude', 'aero', 'loads', 'sign convention', 'angle of attack']
  ),
  topic(
    'angle-units',
    'Angles: degrees in the UI, radians in the math',
    'Angles are stated, not guessed: user-facing controls use degrees and internal aerodynamics use radians, with the unit shown next to every value.',
    [
      section(
        'Degrees at the controls',
        'Rail elevation, rail azimuth, fin cant, and wind direction are entered and displayed in degrees, with the unit adjacent to the field (deg).'
      ),
      section(
        'Radians in the math',
        'Aerodynamic slopes (CNα) are per radian; conversion happens at the model boundary, never silently inside a formula. If an imported file supplies angles, its unit is identified and mapped explicitly, and ambiguous inputs are reported rather than guessed.'
      ),
    ],
    ['angle', 'degrees', 'radians', 'deg', 'rad', 'elevation', 'azimuth', 'fin cant']
  ),
  topic(
    'units-conventions',
    'Units: canonical SI, display conversions',
    'Astraea stores and computes in SI — meters, kilograms, seconds, pascals — and converts only at display and file boundaries, never silently.',
    [
      section(
        'Canonical storage units',
        'Internal values are SI: length in meters (m), mass in kilograms (kg), time in seconds (s), pressure in pascals, impulse in newton-seconds, angle in radians, angular rate in radians per second. A value\u2019s stored meaning never changes because the display unit changes.'
      ),
      section(
        'Display policy',
        'Every numeric field shows its unit next to the value; ambiguous abbreviations are avoided; gauge pressure is distinguished from absolute pressure; engineering quantities carry their dimension and valid range alongside the number.'
      ),
    ],
    ['units', 'si', 'meter', 'kilogram', 'pascal', 'display units', 'conversion', 'newton-second']
  ),
]);

/** Returns the explainer topic with the given id; fails closed on unknown ids. */
export function explainerTopicById(id: string): ExplainerTopic {
  const found = EXPLAINER_TOPICS.find((topicItem) => topicItem.id === id);
  if (found === undefined) {
    throw new Error(`explainer query: unknown topic id '${id}'`);
  }
  return found;
}

/**
 * Fail-closed schema check for an explainer corpus: unique nonempty topics,
 * nonempty title/summary, at least one section with nonempty heading and
 * paragraphs, nonempty keywords, and coverage of every required topic id.
 * Throws on the first issue.
 */
export function validateExplainerTopics(
  topics: readonly ExplainerTopic[],
  requiredIds: ReadonlySet<string> = REQUIRED_EXPLAINER_TOPIC_IDS
): void {
  const what = 'explainer validation';
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error(`${what}: topics must be a nonempty array`);
  }
  const seenIds = new Set<string>();
  for (const topicItem of topics) {
    const id = topicItem?.id ?? '';
    if (seenIds.has(id)) {
      throw new Error(`${what}: duplicate topic id '${id}'`);
    }
    seenIds.add(id);
    const text = (value: unknown, name: string): void => {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${what}: topic '${id}' ${name} must be a nonempty string`);
      }
    };
    text(topicItem?.title, 'title');
    text(topicItem?.summary, 'summary');
    if (!Array.isArray(topicItem?.sections) || topicItem.sections.length === 0) {
      throw new Error(`${what}: topic '${id}' needs at least one section`);
    }
    for (const sec of topicItem.sections) {
      text(sec?.heading, `section heading`);
      if (!Array.isArray(sec?.paragraphs) || sec.paragraphs.length === 0) {
        throw new Error(`${what}: topic '${id}' section '${sec?.heading ?? ''}' needs at least one paragraph`);
      }
      for (const paragraph of sec.paragraphs) {
        text(paragraph, `section paragraph`);
      }
    }
    if (!Array.isArray(topicItem?.keywords) || topicItem.keywords.length === 0) {
      throw new Error(`${what}: topic '${id}' needs at least one keyword`);
    }
    for (const keyword of topicItem.keywords) {
      text(keyword, `keyword`);
    }
  }
  for (const requiredId of requiredIds) {
    if (!seenIds.has(requiredId)) {
      throw new Error(`${what}: required topic '${requiredId}' is missing from the corpus`);
    }
  }
}