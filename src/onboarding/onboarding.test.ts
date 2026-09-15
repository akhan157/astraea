/**
 * C13/D14 Onboarding Content Pack — copy completeness, density mapping, and
 * schema validation for the shell-agnostic onboarding data modules
 * (src/onboarding/questionnaire.ts, guidance.ts, explainers.ts, tour.ts).
 *
 * Guidance only, never physical defaults: the guidance suites assert that
 * density lives in copy flags and no profile can smuggle a physical default.
 * No UI is exercised here — jsdom is not required (vitest environment: node).
 *
 * Tampered inputs are built by deep-clone + reassignment or Object.assign,
 * so the shipped frozen data is never mutated.
 */

import { describe, it, expect } from 'vitest';
import {
  EXPERIENCE_QUESTION_ID,
  EXPERIENCE_LEVELS,
  QUESTIONNAIRE,
  validateQuestionnaire,
  resolveExperienceLevel,
  type ExperienceLevel,
  type QuestionnaireQuestion,
} from './questionnaire';
import {
  EXPERIENCE_GUIDANCE,
  GUIDANCE_DENSITIES,
  GUIDANCE_DENSITY_RANK,
  validateGuidanceMapping,
  guidanceForLevel,
  type GuidanceProfile,
} from './guidance';
import {
  EXPLAINER_TOPICS,
  REQUIRED_EXPLAINER_TOPIC_IDS,
  validateExplainerTopics,
  explainerTopicById,
} from './explainers';
import { ONBOARDING_TOUR, validateTour } from './tour';

// --- questionnaire: copy completeness -------------------------------------

describe('questionnaire content', () => {
  it('shipped questionnaire is valid and carries exactly one experience-level question', () => {
    expect(() => validateQuestionnaire(QUESTIONNAIRE)).not.toThrow();
    const levelQuestions = QUESTIONNAIRE.questions.filter((question) => question.experienceLevels !== undefined);
    expect(levelQuestions.length).toBe(1);
    expect(levelQuestions[0].id).toBe(EXPERIENCE_QUESTION_ID);
  });

  it('every question has a prompt and at least two labeled options', () => {
    for (const question of QUESTIONNAIRE.questions) {
      expect(question.prompt.trim().length).toBeGreaterThan(0);
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      for (const option of question.options) {
        expect(option.id.trim().length).toBeGreaterThan(0);
        expect(option.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('the experience question maps every option to a known, reachable level', () => {
    const experience = QUESTIONNAIRE.questions.find((question) => question.id === EXPERIENCE_QUESTION_ID);
    expect(experience).toBeDefined();
    expect(experience?.options.length).toBe(experience && Object.keys(experience.experienceLevels ?? {}).length);
    const reachable = new Set<ExperienceLevel>();
    for (const option of experience?.options ?? []) {
      const level = experience?.experienceLevels?.[option.id];
      expect(EXPERIENCE_LEVELS).toContain(level);
      if (level) reachable.add(level);
    }
    for (const level of EXPERIENCE_LEVELS) {
      expect(reachable).toContain(level);
    }
  });

  it('resolveExperienceLevel resolves every shipped option to its documented level', () => {
    expect(resolveExperienceLevel(QUESTIONNAIRE, 'kits-and-flights')).toBe('beginner');
    expect(resolveExperienceLevel(QUESTIONNAIRE, 'some-design')).toBe('intermediate');
    expect(resolveExperienceLevel(QUESTIONNAIRE, 'regular-design')).toBe('advanced');
    expect(resolveExperienceLevel(QUESTIONNAIRE, 'mentor-team')).toBe('advanced');
  });
});

// --- questionnaire: schema validation -------------------------------------

describe('questionnaire schema validation', () => {
  it('rejects an empty question list', () => {
    expect(() => validateQuestionnaire({ questions: [] })).toThrow(/nonempty array/);
  });

  it('rejects duplicate question ids and empty prompts', () => {
    const base = structuredClone(QUESTIONNAIRE);
    expect(() => validateQuestionnaire({ questions: [...base.questions, base.questions[0]] })).toThrow(
      /duplicate question id/
    );
    const blank = structuredClone(QUESTIONNAIRE);
    blank.questions[0].prompt = '   ';
    expect(() => validateQuestionnaire(blank)).toThrow(/prompt must be a nonempty string/);
  });

  it('rejects single-option questions, duplicate option ids, and empty option labels', () => {
    const single = structuredClone(QUESTIONNAIRE);
    single.questions[0].options = single.questions[0].options.slice(0, 1);
    expect(() => validateQuestionnaire(single)).toThrow(/needs at least two options/);
    const dupOption = structuredClone(QUESTIONNAIRE);
    dupOption.questions[1].options = [...dupOption.questions[1].options, dupOption.questions[1].options[0]];
    expect(() => validateQuestionnaire(dupOption)).toThrow(/duplicate option id/);
    const blankLabel = structuredClone(QUESTIONNAIRE);
    blankLabel.questions[1].options[0].label = ' ';
    expect(() => validateQuestionnaire(blankLabel)).toThrow(/label must be a nonempty string/);
  });

  it('rejects experience maps that reference unknown options or unmapped options', () => {
    const unknownRef = structuredClone(QUESTIONNAIRE);
    Object.assign(unknownRef.questions[0], {
      experienceLevels: { ghost: 'beginner', 'kits-and-flights': 'beginner', 'some-design': 'intermediate', 'regular-design': 'advanced', 'mentor-team': 'advanced' },
    });
    expect(() => validateQuestionnaire(unknownRef)).toThrow(/references unknown option 'ghost'/);
    const unmapped = structuredClone(QUESTIONNAIRE);
    Object.assign(unmapped.questions[0], {
      experienceLevels: { 'kits-and-flights': 'beginner', 'some-design': 'intermediate', 'regular-design': 'advanced' },
    });
    expect(() => validateQuestionnaire(unmapped)).toThrow(/option 'mentor-team' has no experience level/);
  });

  it('rejects unknown level values and level sets that miss a level', () => {
    const badLevel = structuredClone(QUESTIONNAIRE);
    Object.assign(badLevel.questions[0], {
      experienceLevels: { 'kits-and-flights': 'expert', 'some-design': 'intermediate', 'regular-design': 'advanced', 'mentor-team': 'advanced' },
    });
    expect(() => validateQuestionnaire(badLevel)).toThrow(/unknown experience level 'expert'/);
    const unreachable = structuredClone(QUESTIONNAIRE);
    Object.assign(unreachable.questions[0], {
      experienceLevels: { 'kits-and-flights': 'intermediate', 'some-design': 'intermediate', 'regular-design': 'advanced', 'mentor-team': 'advanced' },
    });
    expect(() => validateQuestionnaire(unreachable)).toThrow(/experience level 'beginner' is not reachable/);
  });

  it('rejects questionnaires with zero or multiple experience questions', () => {
    const none = structuredClone(QUESTIONNAIRE);
    expect(() => validateQuestionnaire({ questions: [none.questions[1]] })).toThrow(/exactly one question must map/);
    const secondLevel: QuestionnaireQuestion = {
      ...structuredClone(QUESTIONNAIRE).questions[0],
      id: 'experience-level-2',
      experienceLevels: { 'kits-and-flights': 'beginner', 'some-design': 'intermediate', 'regular-design': 'advanced', 'mentor-team': 'advanced' },
    };
    expect(() => validateQuestionnaire({ questions: [none.questions[0], secondLevel] })).toThrow(/found 2/);
  });

  it('resolveExperienceLevel fails closed on unknown options and malformed questionnaires', () => {
    expect(() => resolveExperienceLevel(QUESTIONNAIRE, 'no-such-option')).toThrow(/selects no known experience level/);
    expect(() => resolveExperienceLevel({ questions: [] }, 'kits-and-flights')).toThrow(/exactly one question/);
  });
});

// --- guidance: copy completeness ------------------------------------------

describe('guidance density mapping', () => {
  it('shipped mapping is valid and total over the experience levels', () => {
    expect(() => validateGuidanceMapping(EXPERIENCE_GUIDANCE)).not.toThrow();
    for (const level of EXPERIENCE_LEVELS) {
      expect(guidanceForLevel(level)).toBe(EXPERIENCE_GUIDANCE[level]);
      const profile = EXPERIENCE_GUIDANCE[level];
      expect(profile.summary.trim().length).toBeGreaterThan(0);
      expect(profile.body.trim().length).toBeGreaterThan(0);
      expect(GUIDANCE_DENSITIES).toContain(profile.density);
    }
  });

  it('maps beginner to full guidance and advanced to minimal — both endpoints', () => {
    expect(guidanceForLevel('beginner').density).toBe('full');
    expect(guidanceForLevel('advanced').density).toBe('minimal');
  });

  it('density strictly decreases across the documented level order', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const level of EXPERIENCE_LEVELS) {
      const rank = GUIDANCE_DENSITY_RANK[guidanceForLevel(level).density];
      expect(rank).toBeLessThan(previous);
      previous = rank;
    }
  });

  it('guidance is copy only — no profile carries any physical default', () => {
    for (const level of EXPERIENCE_LEVELS) {
      const profile = EXPERIENCE_GUIDANCE[level];
      for (const field of Object.keys(profile)) {
        expect(['density', 'summary', 'body', 'showExplainers', 'stepByStepLabels', 'contextualNotes']).toContain(field);
        expect(field.startsWith('default')).toBe(false);
      }
      expect(profile.showExplainers).toBe(level !== 'advanced');
      expect(profile.stepByStepLabels).toBe(level === 'beginner');
      expect(typeof profile.summary).toBe('string');
      expect(typeof profile.body).toBe('string');
    }
  });

  it('guidanceForLevel fails closed on an unknown level', () => {
    const unknownLevel: string = 'expert';
    expect(() => guidanceForLevel(unknownLevel as ExperienceLevel)).toThrow(/unknown experience level/);
  });
});

// --- guidance: schema validation ------------------------------------------

describe('guidance schema validation', () => {
  it('rejects a missing level and an unknown level key', () => {
    const missing: Record<string, GuidanceProfile> = {
      intermediate: EXPERIENCE_GUIDANCE.intermediate,
      advanced: EXPERIENCE_GUIDANCE.advanced,
    };
    expect(() => validateGuidanceMapping(missing)).toThrow(/level 'beginner' has no guidance profile/);
    const extra: Record<string, GuidanceProfile> = { ...EXPERIENCE_GUIDANCE, expert: EXPERIENCE_GUIDANCE.beginner };
    expect(() => validateGuidanceMapping(extra)).toThrow(/unknown experience level 'expert'/);
  });

  it('rejects a non-monotonic density mapping', () => {
    const swapped: Record<string, GuidanceProfile> = {
      beginner: EXPERIENCE_GUIDANCE.advanced,
      intermediate: EXPERIENCE_GUIDANCE.intermediate,
      advanced: EXPERIENCE_GUIDANCE.beginner,
    };
    expect(() => validateGuidanceMapping(swapped)).toThrow(/strictly decrease/);
  });

  it('rejects an unknown density and non-boolean guidance flags', () => {
    const badDensity = structuredClone(EXPERIENCE_GUIDANCE);
    Object.assign(badDensity.beginner, { density: 'verbose' });
    expect(() => validateGuidanceMapping(badDensity)).toThrow(/unknown density 'verbose'/);
    const badFlag = structuredClone(EXPERIENCE_GUIDANCE);
    Object.assign(badFlag.intermediate, { showExplainers: 'yes' });
    expect(() => validateGuidanceMapping(badFlag)).toThrow(/showExplainers must be a boolean/);
  });

  it('rejects empty guidance copy', () => {
    const blank = structuredClone(EXPERIENCE_GUIDANCE);
    blank.advanced.summary = ' ';
    expect(() => validateGuidanceMapping(blank)).toThrow(/summary must be a nonempty string/);
  });

  it('rejects a physical default smuggled into a profile', () => {
    const tampered = structuredClone(EXPERIENCE_GUIDANCE);
    Object.assign(tampered.beginner, { defaultMarginCalibers: 1.5 });
    expect(() => validateGuidanceMapping(tampered)).toThrow(/outside the guidance presentation set/);
  });
});

// --- explainers: copy completeness ----------------------------------------

describe('explainer content', () => {
  it('shipped corpus is valid and covers every required confusion topic', () => {
    expect(() => validateExplainerTopics(EXPLAINER_TOPICS)).not.toThrow();
    for (const requiredId of REQUIRED_EXPLAINER_TOPIC_IDS) {
      expect(EXPLAINER_TOPICS.some((topic) => topic.id === requiredId)).toBe(true);
    }
    for (const topic of EXPLAINER_TOPICS) {
      expect(topic.title.trim().length).toBeGreaterThan(0);
      expect(topic.summary.trim().length).toBeGreaterThan(0);
      expect(topic.sections.length).toBeGreaterThan(0);
      expect(topic.keywords.length).toBeGreaterThan(0);
    }
  });

  it('CG datum topic explains the nose-tip datum and why datums disagree', () => {
    const cgDatum = explainerTopicById('cg-datum-convention');
    const copy = [cgDatum.summary, ...cgDatum.sections.flatMap((s) => [s.heading, ...s.paragraphs])].join(' ');
    expect(copy).toMatch(/nose tip/);
    expect(copy).toMatch(/datum/);
    expect(copy).toMatch(/x = 0/);
    expect(copy).toMatch(/share one frame/);
  });

  it('stability margin topic distinguishes calibers from percent of body length', () => {
    const margin = explainerTopicById('stability-margin-units');
    const copy = [margin.summary, ...margin.sections.flatMap((s) => s.paragraphs)].join(' ');
    expect(copy).toMatch(/caliber/);
    expect(copy).toMatch(/percent of body length/);
    expect(copy).toMatch(/1\.00/);
    expect(copy).toMatch(/3\.00/);
  });

  it('exposes every topic by id and fails closed on unknowns', () => {
    for (const topic of EXPLAINER_TOPICS) {
      expect(explainerTopicById(topic.id)).toBe(topic);
    }
    expect(() => explainerTopicById('no-such-topic')).toThrow(/unknown topic id/);
  });
});

// --- explainers: schema validation ----------------------------------------

describe('explainer schema validation', () => {
  it('rejects empty corpora and duplicate topic ids', () => {
    expect(() => validateExplainerTopics([])).toThrow(/nonempty array/);
    const duplicate = [structuredClone(EXPLAINER_TOPICS[0]), structuredClone(EXPLAINER_TOPICS[0])];
    expect(() => validateExplainerTopics(duplicate)).toThrow(/duplicate topic id/);
  });

  it('rejects empty titles, summaries, sections, paragraphs, and keywords', () => {
    const blankTitle = structuredClone(EXPLAINER_TOPICS[2]);
    blankTitle.title = ' ';
    expect(() => validateExplainerTopics([blankTitle])).toThrow(/title must be a nonempty string/);
    const noSections = structuredClone(EXPLAINER_TOPICS[2]);
    noSections.sections = [];
    expect(() => validateExplainerTopics([noSections])).toThrow(/at least one section/);
    const blankParagraph = structuredClone(EXPLAINER_TOPICS[2]);
    blankParagraph.sections[0].paragraphs = ['  '];
    expect(() => validateExplainerTopics([blankParagraph])).toThrow(/paragraph must be a nonempty string/);
    const noKeywords = structuredClone(EXPLAINER_TOPICS[2]);
    noKeywords.keywords = [];
    expect(() => validateExplainerTopics([noKeywords])).toThrow(/at least one keyword/);
  });

  it('rejects a corpus missing a required confusion topic', () => {
    const withoutMargin = EXPLAINER_TOPICS.filter((topic) => topic.id !== 'stability-margin-units');
    expect(() => validateExplainerTopics(withoutMargin)).toThrow(/required topic 'stability-margin-units' is missing/);
  });
});

// --- tour: copy completeness ----------------------------------------------

describe('tour schema', () => {
  it('shipped tour is valid, ordered 1..n, and every step carries copy and a target', () => {
    expect(() => validateTour(ONBOARDING_TOUR)).not.toThrow();
    expect(ONBOARDING_TOUR.length).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < ONBOARDING_TOUR.length; i++) {
      const current = ONBOARDING_TOUR[i];
      expect(current.order).toBe(i + 1);
      expect(current.title.trim().length).toBeGreaterThan(0);
      expect(current.body.trim().length).toBeGreaterThan(0);
      expect(current.targetControlId).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/);
    }
    const ids = ONBOARDING_TOUR.map((current) => current.id);
    expect(new Set(ids).size).toBe(ids.length);
    const targets = ONBOARDING_TOUR.map((current) => current.targetControlId);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

// --- tour: schema validation ----------------------------------------------

describe('tour schema validation', () => {
  it('rejects an empty tour and non-sequential orders', () => {
    expect(() => validateTour([])).toThrow(/nonempty array/);
    const gap = structuredClone(ONBOARDING_TOUR);
    gap[3].order = 9;
    expect(() => validateTour(gap)).toThrow(/orders must be exactly 1\.\.n/);
  });

  it('rejects duplicate step ids and duplicated target controls', () => {
    const dupId = structuredClone(ONBOARDING_TOUR);
    dupId[1].id = dupId[0].id;
    expect(() => validateTour(dupId)).toThrow(/duplicate step id/);
    const dupTarget = structuredClone(ONBOARDING_TOUR);
    dupTarget[2].targetControlId = dupTarget[1].targetControlId;
    expect(() => validateTour(dupTarget)).toThrow(/each step targets a distinct control/);
  });

  it('rejects malformed targets and empty step copy', () => {
    const badTarget = structuredClone(ONBOARDING_TOUR);
    badTarget[0].targetControlId = 'has spaces';
    expect(() => validateTour(badTarget)).toThrow(/single data-testid token/);
    const blankBody = structuredClone(ONBOARDING_TOUR);
    blankBody[4].body = '';
    expect(() => validateTour(blankBody)).toThrow(/body must be a nonempty string/);
  });
});