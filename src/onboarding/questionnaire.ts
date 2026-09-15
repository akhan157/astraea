/**
 * C13 First-Run Experience Questionnaire — data model and shipped questions.
 *
 * Pure content: no UI. The first-run questionnaire lets the user state their
 * experience level; guidance.ts maps that level to a guidance density.
 * Guidance is copy density only — the questionnaire never changes units,
 * datums, physics, or any numerical default (see the rule in guidance.ts).
 * Shell wiring (question flow, persistence, resume) is deferred to slice S7.
 */

/** Stable experience levels the questionnaire can select from, least to most experienced. */
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = Object.freeze(['beginner', 'intermediate', 'advanced']);

/** One selectable answer to a questionnaire question. */
export interface QuestionnaireOption {
  /** Stable machine id — the value the shell persists when this option is chosen. */
  id: string;
  /** Human-readable label shown to the user. */
  label: string;
}

export interface QuestionnaireQuestion {
  /** Stable machine id. */
  id: string;
  /** Prompt copy shown above the options. */
  prompt: string;
  /** Options in display order. */
  options: readonly QuestionnaireOption[];
  /**
   * Present on exactly one question: maps every option id of that question to
   * the experience level the choice selects. Guidance density is derived from
   * the selected level via guidance.ts; the questionnaire itself never changes
   * physics or any numerical default.
   */
  experienceLevels?: Readonly<Record<string, ExperienceLevel>>;
}

export interface Questionnaire {
  /** Questions in display order. */
  questions: readonly QuestionnaireQuestion[];
}

/** Stable id of the question that selects the experience level. */
export const EXPERIENCE_QUESTION_ID = 'experience-level';

function freezeOptions(options: readonly QuestionnaireOption[]): readonly QuestionnaireOption[] {
  return Object.freeze(options.map((option) => Object.freeze({ ...option })));
}

function freezeQuestion(question: QuestionnaireQuestion): QuestionnaireQuestion {
  const frozen: QuestionnaireQuestion = {
    id: question.id,
    prompt: question.prompt,
    options: freezeOptions(question.options),
  };
  if (question.experienceLevels !== undefined) {
    frozen.experienceLevels = Object.freeze({ ...question.experienceLevels });
  }
  return Object.freeze(frozen);
}

/**
 * Shipped questionnaire. The experience question drives guidance density; the
 * primary-goal question is contextual only (it carries no level mapping).
 */
export const QUESTIONNAIRE: Questionnaire = Object.freeze({
  questions: Object.freeze([
    freezeQuestion({
      id: EXPERIENCE_QUESTION_ID,
      prompt: 'How much rocket design work have you done?',
      options: [
        { id: 'kits-and-flights', label: 'I have built and flown kits, but never designed my own rocket' },
        { id: 'some-design', label: 'I have designed or modified simple rockets (tubes, nose cones, fins)' },
        { id: 'regular-design', label: 'I design and build my own rockets and run simulations' },
        { id: 'mentor-team', label: 'I mentor or lead a team that designs rockets' },
      ],
      experienceLevels: {
        'kits-and-flights': 'beginner',
        'some-design': 'intermediate',
        'regular-design': 'advanced',
        'mentor-team': 'advanced',
      },
    }),
    freezeQuestion({
      id: 'primary-goal',
      prompt: 'What do you most want to do with Astraea?',
      options: [
        { id: 'understand-stability', label: 'Understand why a rocket is stable' },
        { id: 'predict-flight', label: 'Predict altitude, speed, and drift before launch' },
        { id: 'design-build', label: 'Design and build a custom rocket' },
        { id: 'cross-check', label: 'Cross-check results against other simulators' },
      ],
    }),
  ]),
});

const trimNonEmpty = (value: unknown, what: string): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return `${what} must be a nonempty string`;
  }
  return null;
};

/**
 * Fail-closed schema check for questionnaire content. Throws on the first
 * issue, matching the motor-record validator pattern; tests call this on the
 * shipped data and on deliberately malformed inputs.
 */
export function validateQuestionnaire(q: Questionnaire): void {
  const what = 'questionnaire validation';
  if (!q || typeof q !== 'object' || !Array.isArray(q.questions)) {
    throw new Error(`${what}: questions must be a nonempty array`);
  }
  if (q.questions.length === 0) {
    throw new Error(`${what}: questions must be a nonempty array`);
  }

  const seenQuestionIds = new Set<string>();
  const levelQuestionIds: string[] = [];
  for (const question of q.questions) {
    const qid = question?.id ?? '';
    if (seenQuestionIds.has(qid)) {
      throw new Error(`${what}: duplicate question id '${qid}'`);
    }
    seenQuestionIds.add(qid);
    const promptIssue = trimNonEmpty(question?.prompt, `question '${qid}' prompt`);
    if (promptIssue !== null) {
      throw new Error(`${what}: ${promptIssue}`);
    }
    if (!Array.isArray(question?.options) || question.options.length < 2) {
      throw new Error(`${what}: question '${qid}' needs at least two options`);
    }
    const seenOptionIds = new Set<string>();
    for (const option of question.options) {
      const oid = option?.id ?? '';
      if (seenOptionIds.has(oid)) {
        throw new Error(`${what}: duplicate option id '${oid}' in question '${qid}'`);
      }
      seenOptionIds.add(oid);
      const labelIssue = trimNonEmpty(option?.label, `option '${qid}/${oid}' label`);
      if (labelIssue !== null) {
        throw new Error(`${what}: ${labelIssue}`);
      }
    }
    if (question.experienceLevels !== undefined) {
      levelQuestionIds.push(qid);
    }
  }

  if (levelQuestionIds.length !== 1) {
    throw new Error(
      `${what}: exactly one question must map options to experience levels (found ${levelQuestionIds.length})`
    );
  }
  const levelQuestion = q.questions.find((question) => question.id === levelQuestionIds[0]);
  if (levelQuestion === undefined) {
    throw new Error(`${what}: experience question '${levelQuestionIds[0]}' missing from questions`);
  }
  const mapping = levelQuestion.experienceLevels;
  if (typeof mapping !== 'object' || mapping === null) {
    throw new Error(`${what}: question '${levelQuestion.id}' experienceLevels must be a record`);
  }
  for (const option of levelQuestion.options) {
    if (!(option.id in mapping)) {
      throw new Error(`${what}: question '${levelQuestion.id}' option '${option.id}' has no experience level mapped`);
    }
    const level = mapping[option.id];
    if (!EXPERIENCE_LEVELS.includes(level as ExperienceLevel)) {
      throw new Error(
        `${what}: question '${levelQuestion.id}' maps option '${option.id}' to unknown experience level '${level}'`
      );
    }
  }
  const reachable = new Set<string>();
  for (const optionId of Object.keys(mapping)) {
    if (!levelQuestion.options.some((option: QuestionnaireOption) => option.id === optionId)) {
      throw new Error(`${what}: question '${levelQuestion.id}' experienceLevels references unknown option '${optionId}'`);
    }
    reachable.add(mapping[optionId]);
  }
  for (const level of EXPERIENCE_LEVELS) {
    if (!reachable.has(level)) {
      throw new Error(`${what}: experience level '${level}' is not reachable from any option`);
    }
  }
}

/**
 * Resolves the experience level an answer selects. Pure data query for the
 * S7 shell; fails closed on a malformed questionnaire or unknown option.
 */
export function resolveExperienceLevel(q: Questionnaire, optionId: string): ExperienceLevel {
  const what = 'questionnaire query';
  if (!q || typeof q !== 'object' || !Array.isArray(q.questions)) {
    throw new Error(`${what}: questionnaire must be a record with questions`);
  }
  const levelQuestions = q.questions.filter((question) => question.experienceLevels !== undefined);
  if (levelQuestions.length !== 1) {
    throw new Error(`${what}: exactly one question maps options to experience levels (found ${levelQuestions.length})`);
  }
  const level = levelQuestions[0].experienceLevels?.[optionId];
  if (!EXPERIENCE_LEVELS.includes(level as ExperienceLevel)) {
    throw new Error(`${what}: option '${optionId}' selects no known experience level`);
  }
  return level;
}