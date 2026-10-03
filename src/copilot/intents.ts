/**
 * Experimental copilot — tier-1 intent matching (no language model).
 *
 * A question is normalized and scored against fixed phrase lists. Ties or
 * weak matches return `unknown` rather than a guess, and the assistant then
 * lists what it can do.
 */
import type { ExplainerTopic } from '../onboarding/explainers';
import { ALL_TOPICS } from './glossary';

export type Intent =
  | { kind: 'run-checks' }
  | { kind: 'suggest-fixes' }
  | { kind: 'explain-stability' }
  | { kind: 'define'; topic: ExplainerTopic }
  | { kind: 'help' }
  | { kind: 'unknown' };

export function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()} `;
}

const has = (q: string, phrase: string) => q.includes(` ${phrase} `);
const countHits = (q: string, phrases: readonly string[]) => phrases.filter((p) => has(q, p)).length;

const HELP = ['help', 'what can you do', 'how do you work', 'commands'];
const FIX = ['fix', 'fixes', 'how do i fix', 'how to fix', 'how can i fix', 'make it pass', 'what should i change', 'suggest', 'improve'];
const CHECK = [
  'check', 'checks', 'verify', 'review', 'whats wrong', 'what is wrong', 'any problems', 'problems', 'issues',
  'is it safe', 'safe to fly', 'ready to fly', 'ready', 'pass', 'fail', 'failing',
];
const STABILITY = [
  'stability', 'stable', 'overstable', 'over stable', 'understable', 'under stable', 'unstable',
  'margin', 'static margin', 'cp', 'cg', 'calibers', 'caliber',
];
const DEFINE = ['what is', 'whats', 'what are', 'define', 'meaning of', 'what does', 'explain what'];
const WHY = ['why', 'how come', 'explain', 'what makes', 'whats causing', 'what is causing'];

/** Best glossary topic by keyword hits (longest phrase breaks ties); null if none or tied. */
export function matchTopic(q: string): ExplainerTopic | null {
  let best: { topic: ExplainerTopic; score: number; longest: number } | null = null;
  let tied = false;
  for (const topic of ALL_TOPICS) {
    const hits = topic.keywords.filter((k) => has(q, normalize(k).trim()));
    if (hits.length === 0) continue;
    const score = hits.length;
    const longest = Math.max(...hits.map((h) => h.length));
    if (!best || score > best.score || (score === best.score && longest > best.longest)) {
      best = { topic, score, longest };
      tied = false;
    } else if (score === best.score && longest === best.longest) {
      tied = true;
    }
  }
  return best && !tied ? best.topic : null;
}

export function matchIntent(question: string): Intent {
  const q = normalize(question);
  if (q.trim().length === 0) return { kind: 'unknown' };
  if (countHits(q, HELP) > 0) return { kind: 'help' };

  const asksDefinition = countHits(q, DEFINE) > 0 && countHits(q, WHY) === 0;
  const stabilityHits = countHits(q, STABILITY);

  if (countHits(q, FIX) > 0) return { kind: 'suggest-fixes' };
  if (asksDefinition) {
    const topic = matchTopic(q);
    if (topic) return { kind: 'define', topic };
  }
  if (stabilityHits > 0 && !asksDefinition) return { kind: 'explain-stability' };
  if (countHits(q, CHECK) > 0) return { kind: 'run-checks' };

  const topic = matchTopic(q);
  if (topic) return { kind: 'define', topic };
  return { kind: 'unknown' };
}
