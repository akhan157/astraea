/**
 * C13 Experience → Guidance-Density Mapping.
 *
 * Guidance ONLY — never physical defaults. Selecting an experience level in
 * the first-run questionnaire changes how much explanatory copy Astraea shows
 * (explainer cards, step-by-step labels, contextual notes). It never changes
 * units, datums, physics, or any numerical default: a beginner's rocket and
 * an expert's rocket compute identically. The validator enforces this by
 * refusing any profile field outside the documented presentation set — a
 * field like `defaultMarginCalibers` is a policy violation, not a typo.
 */

import { EXPERIENCE_LEVELS, ExperienceLevel } from './questionnaire';

/** Ordered guidance intensity: full shows the most copy, minimal the least. */
export type GuidanceDensity = 'full' | 'standard' | 'minimal';

export const GUIDANCE_DENSITIES: readonly GuidanceDensity[] = Object.freeze(['full', 'standard', 'minimal']);

/** Ordinal rank used to pin monotonic density across experience levels. */
export const GUIDANCE_DENSITY_RANK: Readonly<Record<GuidanceDensity, number>> = Object.freeze({
  full: 2,
  standard: 1,
  minimal: 0,
});

/** Presentation surface a level's guidance profile controls. */
export interface GuidanceProfile {
  /** Intensity tier driving how much guidance copy the shell renders. */
  density: GuidanceDensity;
  /** One-line summary shown wherever the level is displayed. */
  summary: string;
  /** Body copy: what guidance the user will see at this density. */
  body: string;
  /** Show inline explainer cards (frames, units) on first use. */
  showExplainers: boolean;
  /** Show step-by-step labels on panel actions. */
  stepByStepLabels: boolean;
  /** Show contextual unit/frame clarification notes inline. */
  contextualNotes: boolean;
}

/** Closed set of guidance-presentation fields; nothing physical may join it. */
const GUIDANCE_PROFILE_FIELDS: Readonly<Record<string, true>> = Object.freeze({
  density: true,
  summary: true,
  body: true,
  showExplainers: true,
  stepByStepLabels: true,
  contextualNotes: true,
});

/** Shipped mapping of experience level → guidance profile. */
export const EXPERIENCE_GUIDANCE: Readonly<Record<string, GuidanceProfile>> = Object.freeze({
  beginner: Object.freeze({
    density: 'full',
    summary: 'Full guidance — every concept explained as it appears.',
    body: 'Show explainer cards for stability, reference frames, and units; label every step; add contextual notes wherever a number could be misread.',
    showExplainers: true,
    stepByStepLabels: true,
    contextualNotes: true,
  }),
  intermediate: Object.freeze({
    density: 'standard',
    summary: 'Standard guidance — explanations for the concepts that commonly trip people up.',
    body: 'Show explainer cards for the datum and unit-convention topics; keep contextual notes only where a value depends on a convention (calibers, nose-tip datum).',
    showExplainers: true,
    stepByStepLabels: false,
    contextualNotes: true,
  }),
  advanced: Object.freeze({
    density: 'minimal',
    summary: 'Minimal guidance — numbers on their own.',
    body: 'Hide explainer cards and step labels. Every quantity still shows its unit and datum as shipped — no extra guidance copy is added on top.',
    showExplainers: false,
    stepByStepLabels: false,
    contextualNotes: false,
  }),
});

function validateProfile(level: ExperienceLevel, profile: GuidanceProfile): void {
  const what = `guidance validation: profile for '${level}'`;
  if (!profile || typeof profile !== 'object') {
    throw new Error(`${what} must be a record`);
  }
  for (const field of Object.keys(profile)) {
    if (!(field in GUIDANCE_PROFILE_FIELDS)) {
      throw new Error(
        `${what} carries field '${field}' outside the guidance presentation set — guidance must never carry physical defaults`
      );
    }
  }
  if (!GUIDANCE_DENSITIES.includes(profile.density)) {
    throw new Error(`${what} has unknown density '${String(profile.density)}'`);
  }
  const text = (value: unknown, name: string): void => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${what} ${name} must be a nonempty string`);
    }
  };
  text(profile.summary, 'summary');
  text(profile.body, 'body');
  for (const flag of ['showExplainers', 'stepByStepLabels', 'contextualNotes'] as const) {
    if (typeof profile[flag] !== 'boolean') {
      throw new Error(`${what} ${flag} must be a boolean`);
    }
  }
}

/**
 * Fail-closed schema check for the experience→guidance mapping: domain
 * totality (no level missing, no unknown level), profile shape, and a
 * strictly decreasing density rank across the documented level order.
 * Throws on the first issue.
 */
export function validateGuidanceMapping(mapping: Readonly<Record<string, GuidanceProfile>>): void {
  const what = 'guidance validation';
  if (!mapping || typeof mapping !== 'object') {
    throw new Error(`${what}: mapping must be a record`);
  }
  for (const level of EXPERIENCE_LEVELS) {
    if (!(level in mapping)) {
      throw new Error(`${what}: experience level '${level}' has no guidance profile`);
    }
    validateProfile(level, mapping[level]);
  }
  for (const key of Object.keys(mapping)) {
    if (!EXPERIENCE_LEVELS.includes(key as ExperienceLevel)) {
      throw new Error(`${what}: mapping carries unknown experience level '${key}'`);
    }
  }
  for (let i = 1; i < EXPERIENCE_LEVELS.length; i++) {
    const prevLevel = EXPERIENCE_LEVELS[i - 1];
    const level = EXPERIENCE_LEVELS[i];
    const prevRank = GUIDANCE_DENSITY_RANK[mapping[prevLevel].density];
    const rank = GUIDANCE_DENSITY_RANK[mapping[level].density];
    if (!(prevRank > rank)) {
      throw new Error(
        `${what}: density must strictly decrease from '${prevLevel}' (${mapping[prevLevel].density}) to '${level}' (${mapping[level].density})`
      );
    }
  }
}

/**
 * Returns the guidance profile for an experience level. Pure data query for
 * the S7 shell; fails closed on an unknown level.
 */
export function guidanceForLevel(level: ExperienceLevel): GuidanceProfile {
  const profile = EXPERIENCE_GUIDANCE[level];
  if (profile === undefined) {
    throw new Error(`guidance query: unknown experience level '${level}'`);
  }
  return profile;
}