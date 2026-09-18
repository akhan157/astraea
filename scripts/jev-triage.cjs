#!/usr/bin/env node
/**
 * Jev triage harness — routes captured Astraea page-state dumps to a verdict
 * (PASS / FILE / ESCALATE) using one parallel TypeSafe JEV decision call.
 *
 * Input: a JSON state dump — { url, studio, banners[], badges[],
 *   consoleErrors (count), overflow (bool or {x,y}) } — read from argv[1]
 *   or stdin when argv[1] is missing or "-". Bad input fails closed (exit 1).
 *
 * One POST to https://openrouter.ai/api/alpha/decisions, model
 * typesafe/jev-1.13, asking THREE questions in ONE parallel call:
 *   page_state  choice: clean / stale_mislabeled / stale_honest /
 *                       blank_canvas / overflow (one-line criterion each)
 *   needs_rerun noul:   probability that 'This state requires a re-run
 *                       before the engineer trusts any output' is true
 *   severity    score:  ordered levels low, medium, high, critical
 *
 * Routing rule (printed by every run, exactly what is implemented):
 *   confidence < 0.60                      -> ESCALATE (vision review)
 *   needs_rerun noul in [0.40, 0.60]       -> ESCALATE (vision review)
 *   page_state == clean                    -> PASS
 *   otherwise                              -> FILE (label = page_state)
 *
 * The API key comes ONLY from the OPENROUTER_API_KEY environment variable:
 * never hardcoded, never written to disk. A missing key fails closed with an
 * explicit message before any network I/O. Per-call latency_ms is measured
 * around the fetch; cost is taken from the response usage block only when the
 * API reports it (never fabricated).
 *
 * Usage:
 *   node scripts/jev-triage.cjs state.json
 *   cat state.json | node scripts/jev-triage.cjs -
 *   node scripts/jev-triage.cjs --dry-run state.json   # print rule + payload, no call
 * Self-test: node scripts/jev-triage.selftest.cjs          (stubs fetch; no network)
 */

'use strict';

const fs = require('node:fs');

const API_URL = 'https://openrouter.ai/api/alpha/decisions';
const MODEL = 'typesafe/jev-1.13';
const HTTP_REFERER = 'https://github.com/akhan157/astraea';
const X_TITLE = 'Astraea Jev triage';

const NEEDS_RERUN_STATEMENT =
  'This state requires a re-run before the engineer trusts any output';

const PAGE_STATE_CRITERIA = Object.freeze({
  clean:
    'The page rendered fully and correctly: expected UI present, no error banners, no console errors, no overflow.',
  stale_mislabeled:
    'The page is broken or stale but a banner or badge mislabels it as healthy (e.g. green status while data failed).',
  stale_honest:
    'The page is out of date or broken and says so honestly (e.g. an error banner or clearly marked partial data).',
  blank_canvas:
    'The page is blank or essentially empty: the main content area failed to render, with or without a fault banner.',
  overflow:
    'Content overflows its containers: elements clipped, overlapping, or pushed off-viewport.',
});

const SEVERITY_LEVELS = Object.freeze([
  'low: cosmetic issue only; page remains usable',
  'medium: degraded but recoverable; some content or a flow is broken',
  'high: significant functionality broken; engineer work is blocked',
  'critical: data loss, crash, or the state would actively mislead the engineer',
]);

// The routing contract. This string is printed by run() before every call.
const ROUTING_RULE =
  'confidence < 0.60 => ESCALATE; else needs_rerun noul in [0.40, 0.60] => ESCALATE; ' +
  'else page_state == clean => PASS; else FILE with label = page_state';

const CONFIDENCE_THRESHOLD = 0.6;
const RERUN_BAND = Object.freeze({ lo: 0.4, hi: 0.6 });

const fmtNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0).toFixed(3);

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

function normalizeStateDump(dump) {
  if (
    dump === undefined || dump === null ||
    typeof dump !== 'object' || Array.isArray(dump)
  ) {
    throw new Error(
      'state dump must be a JSON object: { url, studio, banners, badges, consoleErrors, overflow }'
    );
  }
  if (typeof dump.url !== 'string' || dump.url.trim() === '') {
    throw new Error('state dump requires a non-empty string "url"');
  }
  if (typeof dump.studio !== 'string' || dump.studio.trim() === '') {
    throw new Error('state dump requires a non-empty string "studio"');
  }
  const banners = Array.isArray(dump.banners) ? dump.banners.map((b) => String(b)) : [];
  const badges = Array.isArray(dump.badges) ? dump.badges.map((b) => String(b)) : [];
  let consoleErrors = 0;
  if (dump.consoleErrors !== undefined && dump.consoleErrors !== null) {
    if (
      typeof dump.consoleErrors === 'number' && Number.isFinite(dump.consoleErrors) &&
      dump.consoleErrors >= 0
    ) {
      consoleErrors = dump.consoleErrors;
    } else if (
      typeof dump.consoleErrors === 'string' && /^[0-9]+$/.test(dump.consoleErrors)
    ) {
      consoleErrors = Number(dump.consoleErrors);
    } else {
      throw new Error('state dump "consoleErrors" must be a non-negative count');
    }
  }
  if (dump.overflow !== undefined && dump.overflow !== null &&
      typeof dump.overflow === 'object' && !Array.isArray(dump.overflow)) {
    // {x, y} boolean flags object: keep verbatim.
  }
  return {
    url: dump.url,
    studio: dump.studio,
    banners,
    badges,
    consoleErrors,
    overflow: dump.overflow === undefined ? false : dump.overflow,
  };
}

// ---------------------------------------------------------------------------
// Request construction
// ---------------------------------------------------------------------------

function buildQuestions() {
  return {
    page_state: {
      type: 'choice',
      instructions: 'Classify the captured Astraea studio page state into exactly one category.',
      criteria: { ...PAGE_STATE_CRITERIA },
    },
    needs_rerun: {
      type: 'noul',
      instructions: NEEDS_RERUN_STATEMENT,
    },
    severity: {
      type: 'score',
      instructions: 'Rate the severity of the most severe visible problem in this page state.',
      criteria: [...SEVERITY_LEVELS],
    },
  };
}

function buildRequestBody(stateDump) {
  return {
    model: MODEL,
    state: normalizeStateDump(stateDump),
    questions: buildQuestions(),
  };
}

function buildHeaders(apiKey) {
  if (typeof apiKey !== 'string' || apiKey === '') {
    throw new Error(
      'missing OPENROUTER_API_KEY: set it in the environment before running jev-triage (fail closed)'
    );
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': HTTP_REFERER,
    'X-Title': X_TITLE,
  };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * @param answers { page_state: {choice, confidence}, needs_rerun: {noul}, ... }
 * @returns { verdict: 'PASS'|'FILE'|'ESCALATE', label: string|null, reason: string }
 */
function route(answers) {
  const pageState = answers && answers.page_state;
  const needsRerun = answers && answers.needs_rerun;
  const choice = pageState && pageState.choice;
  const confidence = pageState && pageState.confidence;
  const noul = needsRerun && needsRerun.noul;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  if (typeof choice !== 'string' || !isNum(confidence) || !isNum(noul)) {
    throw new Error(
      'decision response malformed: expected page_state.choice (string), ' +
      'page_state.confidence (number) and needs_rerun.noul (number)'
    );
  }
  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      verdict: 'ESCALATE',
      label: null,
      reason: `low confidence ${fmtNum(confidence)} < ${CONFIDENCE_THRESHOLD}`,
    };
  }
  if (noul >= RERUN_BAND.lo && noul <= RERUN_BAND.hi) {
    return {
      verdict: 'ESCALATE',
      label: null,
      reason: `needs_rerun=${fmtNum(noul)} in [${RERUN_BAND.lo}, ${RERUN_BAND.hi}]`,
    };
  }
  if (choice === 'clean') {
    return { verdict: 'PASS', label: null, reason: `page_state=clean confidence=${fmtNum(confidence)}` };
  }
  return { verdict: 'FILE', label: choice, reason: `page_state=${choice} confidence=${fmtNum(confidence)}` };
}

// ---------------------------------------------------------------------------
// The decision call
// ---------------------------------------------------------------------------

function extractUsage(parsed) {
  const usage = (parsed && parsed.usage) || {};
  const costs = [];
  for (const key of ['cost', 'total_cost']) {
    if (typeof usage[key] === 'number' && Number.isFinite(usage[key])) costs.push(usage[key]);
  }
  return {
    input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? null,
    output_tokens: usage.output_tokens ?? usage.completion_tokens ?? null,
    cost: costs.length > 0 ? costs[0] : null,
  };
}

/**
 * POST the state dump to the JEV decisions endpoint once and measure it.
 * @param stateDump normalized input object
 * @param opts { fetchFn?, env?, now? } — injectable for tests
 * @returns { model, answers, latencyMs, usage }
 */
async function callJev(stateDump, opts = {}) {
  const env = opts.env !== undefined ? opts.env : process.env;
  const apiKey = env && env.OPENROUTER_API_KEY;
  if (typeof apiKey !== 'string' || apiKey === '') {
    throw new Error(
      'OPENROUTER_API_KEY is missing from the environment (fail closed): ' +
      'export OPENROUTER_API_KEY before running jev-triage'
    );
  }
  const fetchFn = opts.fetchFn !== undefined ? opts.fetchFn : fetch;
  const now = opts.now !== undefined ? opts.now : Date.now;
  const started = now();
  let res;
  try {
    res = await fetchFn(API_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey),
      body: JSON.stringify(buildRequestBody(stateDump)),
    });
  } catch (err) {
    throw new Error(`jev-triage request failed: ${err.message}`);
  }
  const latencyMs = now() - started;
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const snippet = text.length > 240 ? `${text.slice(0, 240)}...` : text;
    throw new Error(`jev-triage HTTP ${res.status} from decisions API: ${snippet}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`jev-triage response was not JSON: ${text.slice(0, 240)}`);
  }
  // Some proxies wrap the decisions envelope under "data".
  const envelope =
    parsed.data && typeof parsed.data === 'object' && parsed.data.answers ? parsed.data : parsed;
  if (!envelope.answers || typeof envelope.answers !== 'object') {
    throw new Error('jev-triage response missing "answers" object: ' + JSON.stringify(parsed).slice(0, 240));
  }
  return {
    model: typeof envelope.model === 'string' ? envelope.model : MODEL,
    answers: envelope.answers,
    latencyMs,
    cost: extractUsage(envelope).cost,
    usage: extractUsage(envelope),
  };
}

// ---------------------------------------------------------------------------
// Orchestration + CLI
// ---------------------------------------------------------------------------

async function run(stateDump, opts = {}) {
  const out = opts.out !== undefined ? opts.out : process.stdout;
  out.write(`RULE: ${ROUTING_RULE}\n`);
  const call = await callJev(stateDump, opts);
  const decision = route(call.answers);
  const result = {
    verdict: decision.verdict,
    label: decision.label,
    reason: decision.reason,
    answers: call.answers,
    model: call.model,
    latency_ms: call.latencyMs,
    cost: call.usage.cost,
    usage: call.usage,
  };
  out.write(`VERDICT=${decision.verdict} label=${decision.label ? JSON.stringify(decision.label) : '-'} reason=${JSON.stringify(decision.reason)}\n`);
  out.write(
    `page_state=${JSON.stringify(call.answers.page_state)} ` +
    `needs_rerun=${JSON.stringify(call.answers.needs_rerun)} ` +
    `severity=${JSON.stringify(call.answers.severity)}\n`
  );
  const costStr = call.usage.cost === null ? 'n/a (not reported by API)' : String(call.usage.cost);
  out.write(`latency_ms=${call.latencyMs} cost=${costStr} usage=${JSON.stringify(call.usage)}\n`);
  return result;
}

function fail(msg) {
  process.stderr.write(`jev-triage: ${msg}\n`);
  process.exitCode = 1;
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main(argv) {
  let dryRun = false;
  let fileArg = null;
  for (const arg of argv) {
    if (arg === '--dry-run') dryRun = true;
    else if (fileArg === null) fileArg = arg;
    else { fail(`unexpected extra argument: ${arg}`); return; }
  }
  let raw;
  try {
    if (fileArg !== null && fileArg !== '-') raw = fs.readFileSync(fileArg, 'utf8');
    else raw = await readStdin();
  } catch (err) {
    fail(`failed to read state input: ${err.message}`);
    return;
  }
  let dump;
  try {
    dump = JSON.parse(raw);
  } catch (err) {
    fail(`state input is not valid JSON: ${err.message}`);
    return;
  }
  if (dryRun) {
    try {
      const body = buildRequestBody(dump);
      process.stdout.write(JSON.stringify({
        api_url: API_URL,
        model: MODEL,
        routing_rule: ROUTING_RULE,
        request_body: body,
      }, null, 2) + '\n');
    } catch (err) {
      fail(`state dump rejected: ${err.message}`);
    }
    return;
  }
  try {
    const result = await run(dump, { env: process.env });
    process.stdout.write(`RESULT=${JSON.stringify(result)}\n`);
  } catch (err) {
    fail(err.message);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`jev-triage: ${err.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  API_URL,
  MODEL,
  HTTP_REFERER,
  X_TITLE,
  NEEDS_RERUN_STATEMENT,
  PAGE_STATE_CRITERIA,
  SEVERITY_LEVELS,
  ROUTING_RULE,
  CONFIDENCE_THRESHOLD,
  RERUN_BAND,
  normalizeStateDump,
  buildQuestions,
  buildRequestBody,
  buildHeaders,
  route,
  callJev,
  run,
  main,
};