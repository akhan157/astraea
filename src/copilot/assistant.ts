/**
 * Experimental copilot — tier-1 assistant entry point.
 *
 * `answer` turns a question into a structured reply the UI renders. Every
 * number in a reply comes from an engine call made here (or from engine
 * sentences in stabilityBreakdown); the assistant writes no numbers itself.
 * When the engine is unavailable it says so instead of answering.
 */
import type { RocketVehicle } from '../core/types';
import type { ExplainerTopic } from '../onboarding/explainers';
import { explainStabilityAnalysis } from '../aero/stabilityBreakdown';
import { DEFAULT_CHECK_PROFILE, runChecks, type CheckProfile, type CheckRun } from './checks';
import { errorText, stabilityQuantity, type CopilotEngine, type FlightCase } from './engine';
import { computeDescentFix, computeRailExitFix, computeStabilityFix } from './fixes';
import { matchIntent, type Intent } from './intents';
import type { CheckResult, FixOutcome, Quantity } from './types';

export interface CopilotContext {
  vehicle: RocketVehicle;
  engine: CopilotEngine;
  /** Selected motor + launch setup; null when none is chosen. */
  flightCase: FlightCase | null;
  profile?: CheckProfile;
}

export interface CopilotAnswer {
  intent: Intent['kind'];
  paragraphs: string[];
  quantities?: { label: string; value: Quantity }[];
  checks?: CheckResult[];
  fixes?: FixOutcome[];
  topic?: ExplainerTopic;
}

const CAPABILITIES = [
  'Check the design against your requirements (stability, rail exit, descent rate, apogee target). Try "check my rocket".',
  'Suggest fixes computed by the engine for failing checks. Try "how do I fix it".',
  'Explain the stability margin from the per-component breakdown. Try "why is my rocket overstable".',
  'Define terms such as static margin, rail exit velocity, descent rate or confidence levels. Try "what is rail exit velocity".',
];

/** Computes an engine-backed fix for one failing check, or says why it cannot. */
export async function computeFixFor(check: CheckResult, run: CheckRun, ctx: CopilotContext): Promise<FixOutcome> {
  const profile = ctx.profile ?? DEFAULT_CHECK_PROFILE;
  switch (check.id) {
    case 'stability-low':
    case 'stability-high':
      if (!run.stability) return { kind: 'no-fix', checkId: check.id, engineCalls: 0, reason: check.message };
      return computeStabilityFix(check.id, ctx.vehicle, run.stability, ctx.engine, profile, ctx.flightCase, run.flight);
    case 'descent-rate':
      if (!run.flight || !ctx.flightCase) return { kind: 'no-fix', checkId: check.id, engineCalls: 0, reason: check.message };
      return computeDescentFix(ctx.vehicle, run.flight, ctx.engine, profile, ctx.flightCase);
    case 'rail-exit':
      if (!run.flight || !ctx.flightCase) return { kind: 'no-fix', checkId: check.id, engineCalls: 0, reason: check.message };
      return computeRailExitFix(ctx.vehicle, run.flight, ctx.engine, profile, ctx.flightCase);
    case 'apogee-target':
      return {
        kind: 'no-fix',
        checkId: check.id,
        engineCalls: 0,
        reason:
          'The rule-based assistant does not compute apogee fixes yet: the usual levers (motor, ballast, drag) also change stability, so they need a multi-variable search.',
      };
  }
}

function summarizeChecks(results: CheckResult[]): string {
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'not-evaluated').length;
  const passed = results.length - failed - skipped;
  const parts = [`${passed} passed`, `${failed} failed`];
  if (skipped > 0) parts.push(`${skipped} not evaluated`);
  return `Checks: ${parts.join(', ')}.`;
}

export async function answer(question: string, ctx: CopilotContext): Promise<CopilotAnswer> {
  const intent = matchIntent(question);
  const profile = ctx.profile ?? DEFAULT_CHECK_PROFILE;

  switch (intent.kind) {
    case 'help':
      return { intent: 'help', paragraphs: ['I can:', ...CAPABILITIES] };

    case 'unknown':
      return {
        intent: 'unknown',
        paragraphs: ["I didn't understand that question. I'm the rule-based assistant, so I can only:", ...CAPABILITIES],
      };

    case 'define':
      return {
        intent: 'define',
        topic: intent.topic,
        paragraphs: [intent.topic.summary, ...intent.topic.sections.flatMap((s) => s.paragraphs)],
      };

    case 'explain-stability': {
      try {
        const analysis = await ctx.engine.stability(ctx.vehicle);
        const explained = explainStabilityAnalysis(ctx.vehicle, analysis);
        return {
          intent: 'explain-stability',
          paragraphs: explained.plainLanguage,
          quantities: [
            { label: 'Static margin', value: stabilityQuantity(analysis.staticMarginCalibers, 'cal') },
            { label: 'CG from nose tip', value: stabilityQuantity(analysis.cg, 'm') },
            { label: 'CP from nose tip', value: stabilityQuantity(analysis.cp, 'm') },
          ],
        };
      } catch (err) {
        return {
          intent: 'explain-stability',
          paragraphs: [`I can't explain stability right now: the engine is unavailable (${errorText(err)}).`],
        };
      }
    }

    case 'run-checks': {
      const run = await runChecks(ctx.vehicle, ctx.engine, ctx.flightCase, profile);
      return { intent: 'run-checks', paragraphs: [summarizeChecks(run.results)], checks: run.results };
    }

    case 'suggest-fixes': {
      const run = await runChecks(ctx.vehicle, ctx.engine, ctx.flightCase, profile);
      const failing = run.results.filter((r) => r.status === 'fail');
      if (failing.length === 0) {
        const skipped = run.results.some((r) => r.status === 'not-evaluated');
        return {
          intent: 'suggest-fixes',
          paragraphs: [
            summarizeChecks(run.results),
            skipped
              ? 'Nothing that was evaluated is failing, but some checks could not run, so I cannot call the design clean.'
              : 'Nothing is failing, so there is nothing to fix.',
          ],
          checks: run.results,
        };
      }
      // Sequential on purpose: each fix runs many engine calls.
      const fixes: FixOutcome[] = [];
      for (const check of failing) fixes.push(await computeFixFor(check, run, ctx));
      return {
        intent: 'suggest-fixes',
        paragraphs: [summarizeChecks(run.results), 'Nothing changes until you apply a suggestion.'],
        checks: run.results,
        fixes,
      };
    }
  }
}
