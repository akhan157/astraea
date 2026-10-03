/**
 * Experimental copilot — glossary topics for terms the onboarding explainers
 * (src/onboarding/explainers.ts) do not cover. Same shape, so the copilot
 * searches both corpora alike. Content is original to Astraea; thresholds
 * mentioned are the copilot's editable defaults, not engine verdicts.
 */
import type { ExplainerSection, ExplainerTopic } from '../onboarding/explainers';
import { EXPLAINER_TOPICS } from '../onboarding/explainers';

const section = (heading: string, ...paragraphs: string[]): ExplainerSection => ({ heading, paragraphs });

export const COPILOT_TOPICS: readonly ExplainerTopic[] = [
  {
    id: 'overstability',
    title: 'Overstable and understable rockets',
    summary:
      'An understable rocket (CP too close to or ahead of the CG) can tumble; an overstable one (CP far behind the CG) turns hard into crosswinds.',
    sections: [
      section(
        'Two ways to be wrong',
        'Below the minimum margin, a gust that tilts the rocket is not corrected quickly enough, or at all, and the flight can go unstable.',
        'Far above the maximum margin, the fins act like a strong weathervane: in a crosswind off the rail the rocket pitches into the wind, which costs altitude and moves the landing point upwind.',
      ),
      section(
        'Which way to change the design',
        'Larger or further-aft fins move the CP aft and raise the margin; nose weight moves the CG forward and also raises it. Smaller fins or tail weight lower it.',
        'The copilot computes a fin-span change with the engine and shows the before and after margin; it never edits the design until you click.',
      ),
    ],
    keywords: ['overstable', 'over stable', 'understable', 'under stable', 'unstable', 'weathercock', 'weathercocking', 'tumble'],
  },
  {
    id: 'rail-exit-velocity',
    title: 'Rail exit velocity',
    summary: 'The speed at the moment the rocket leaves the launch rail, when the fins must take over guidance.',
    sections: [
      section(
        'Why it matters',
        'On the rail, the rail holds the rocket straight. After it leaves, only aerodynamic force from the fins keeps it pointed, and that force grows with the square of speed. Leaving too slowly lets wind turn the rocket before the fins can respond.',
      ),
      section(
        'How to raise it',
        'A longer rail gives the motor more distance to accelerate the rocket. A motor with a higher initial thrust, or a lighter vehicle, raises it too. The copilot can compute the rail length that meets your requirement.',
      ),
    ],
    keywords: ['rail exit', 'rail exit velocity', 'off the rail', 'rail speed', 'launch rail', 'rail length', 'rail'],
  },
  {
    id: 'descent-rate',
    title: 'Descent rate and touchdown speed',
    summary: 'How fast the rocket falls under its parachute when it reaches the ground.',
    sections: [
      section(
        'What sets it',
        'Under a parachute, the rocket falls at the speed where drag balances weight. Drag grows with parachute area and drag coefficient, so a larger parachute or a higher Cd lands slower.',
        'Astraea reports touchdown speed from the 6-DOF flight. With two parachutes, the second one in the component tree is the main; with one, it serves for the whole descent.',
      ),
      section(
        'The trade-off',
        'Slower landing reduces damage but increases how far the wind carries the rocket. Check the drift against the size of your recovery area.',
      ),
    ],
    keywords: ['descent', 'descent rate', 'touchdown', 'landing speed', 'landing velocity', 'parachute', 'chute', 'main'],
  },
  {
    id: 'apogee',
    title: 'Apogee',
    summary: 'The highest altitude of the flight, measured above the launch site (AGL).',
    sections: [
      section(
        'What changes it',
        'Motor impulse, vehicle mass and drag. More impulse or less mass raises apogee; more drag lowers it. Weathercocking into a crosswind also lowers it.',
        'Many competitions score against a declared target, so the copilot can check the simulated apogee against a target and tolerance you set.',
      ),
    ],
    keywords: ['apogee', 'altitude', 'max altitude', 'peak', 'target altitude', 'how high'],
  },
  {
    id: 'confidence-levels',
    title: 'Confidence levels',
    summary:
      'Every number Astraea shows carries one of five confidence levels: Measured, Calibrated, Modeled, Extrapolated or Unknown.',
    sections: [
      section(
        'What each level means',
        'Measured: read from flight or test data. Calibrated: a model tuned against measurements. Modeled: computed from a physics model inside its intended range, not yet checked against your flights. Extrapolated: the model was used outside that range. Unknown: the engine could not establish validity.',
        'Until your own flight logs are imported and compared, simulated results are at best Modeled.',
      ),
    ],
    keywords: ['confidence', 'measured', 'calibrated', 'modeled', 'extrapolated', 'unknown', 'how sure', 'accurate', 'accuracy'],
  },
];

/** Every topic the copilot can define: onboarding explainers plus copilot topics. */
export const ALL_TOPICS: readonly ExplainerTopic[] = [...EXPLAINER_TOPICS, ...COPILOT_TOPICS];
