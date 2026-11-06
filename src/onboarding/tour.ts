/**
 * C13 Optional Guided Tour — step schema and shipped tour.
 *
 * Pure content: no UI, no shell. Each step names a stable target control id
 * (a data-testid-style anchor) plus the copy shown for that step. Shell
 * wiring — spotlight/dim-screen rendering, progress persistence, "skip
 * tour" — is deferred to slice S7; this module is what S7 renders.
 *
 * Target ids reference the shipped shell surfaces (studio tabs in
 * src/components/Header.tsx, canvas/tree/inspector/HUD in src/App.tsx and the
 * studio components) so the anchors stay stable until S7 lands them.
 */

export interface TourStep {
  /** Stable step id; also the shell's progress key for resume/skip. */
  id: string;
  /** 1-based ordinal — steps must be exactly 1..n with no gaps or duplicates. */
  order: number;
  /** data-testid anchor of the spotlighted control (single token). */
  targetControlId: string;
  /** Short step title (tooltip and tour menu). */
  title: string;
  /** Step copy shown in the tour callout. */
  body: string;
}

const step = (id: string, order: number, targetControlId: string, title: string, body: string): TourStep =>
  Object.freeze({ id, order, targetControlId, title, body });

/** Shipped tour, in walkthrough order. */
export const ONBOARDING_TOUR: readonly TourStep[] = Object.freeze([
  step(
    'load-a-vehicle',
    1,
    'vehicle-preset',
    'Start from a known-good rocket',
    'Load a preset (Estes Alpha) or drop in an OpenRocket (.ork) or RockSim (.rkt) file. You can build from scratch too — starting from a complete vehicle just makes the next steps easier to follow.'
  ),
  step(
    'assembly-canvas',
    2,
    '3d-canvas',
    'The assembly canvas',
    'The center canvas shows the live 3D rocket. Drag the shape sliders and watch the airframe update in real time, with CG and CP markers drawn on the vehicle.'
  ),
  step(
    'component-tree',
    3,
    'component-tree',
    'The component tree',
    'The left rail lists the axial assembly — nose cone, body tube, transitions, fins. Select a component to edit it, or drag rows to reorder the stack.'
  ),
  step(
    'property-inspector',
    4,
    'property-inspector',
    'The property inspector',
    'The right panel edits the selected component: dimensions, materials, mass override. Every field shows its unit next to the value, and stations are measured from the nose tip.'
  ),
  step(
    'stability-status',
    5,
    'stability-hud',
    'Read the stability status',
    'The status banner keeps static margin — in calibers and percent of body length — plus CG, CP, and airframe dimensions live as you edit. At least 1.00 caliber is stable; more than 3.00 is flagged overstable.'
  ),
  step(
    'certified-motors',
    6,
    'propulsion-studio',
    'Give it a certified motor',
    'The Propulsion studio searches the certified motor library, plots thrust curves, and plays back propellant depletion. Switch studios with the tabs in the header.'
  ),
  step(
    'fly-the-mission',
    7,
    'trajectory-studio',
    'Fly the mission',
    'The Trajectory studio adds weather soundings and a Monte Carlo dispersion run: landing clouds, sigma ellipses, and waiver containment are reported in the local ENU ground frame.'
  ),
  step(
    'close-the-loop',
    8,
    'evidence-studio',
    'Close the loop with flight data',
    'Drop in an altimeter CSV or a GPX track to overlay measured flight against prediction and calibrate aerodynamic coefficients in the Evidence studio.'
  ),
]);

const CONTROL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;

/**
 * Fail-closed schema check for a tour: nonempty step list, unique step ids,
 * orders exactly 1..n, one distinct control per step, and a single
 * data-testid-style target token, plus nonempty title/body copy. Throws on
 * the first issue.
 */
export function validateTour(steps: readonly TourStep[]): void {
  const what = 'tour validation';
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`${what}: steps must be a nonempty array`);
  }
  const seenIds = new Set<string>();
  const seenTargets = new Set<string>();
  for (let i = 0; i < steps.length; i++) {
    const current = steps[i];
    const id = current?.id ?? '';
    if (seenIds.has(id)) {
      throw new Error(`${what}: duplicate step id '${id}'`);
    }
    seenIds.add(id);
    if (current.order !== i + 1) {
      throw new Error(`${what}: step ${i + 1} has order ${current.order} — orders must be exactly 1..n with no gaps`);
    }
    const target = current.targetControlId ?? '';
    if (typeof target !== 'string' || !CONTROL_ID_RE.test(target)) {
      throw new Error(
        `${what}: step '${id}' targetControlId must be a single data-testid token, got '${String(target)}'`
      );
    }
    if (seenTargets.has(target)) {
      throw new Error(`${what}: step '${id}' reuses targetControlId '${target}' — each step targets a distinct control`);
    }
    seenTargets.add(target);
    const text = (value: unknown, name: string): void => {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${what}: step '${id}' ${name} must be a nonempty string`);
      }
    };
    text(current.title, 'title');
    text(current.body, 'body');
  }
}