#!/usr/bin/env node
/**
 * Self-test for scripts/jev-triage.cjs — fetch is stubbed, no network calls.
 *
 * Covers the routing branches (PASS, FILE with label, ESCALATE on low
 * confidence, ESCALATE on needs_rerun band), the fail-closed missing-key
 * path, the HTTP header/payload contract, and per-call
 * latency_ms + cost extraction.
 *
 * Run: node scripts/jev-triage.test.cjs   (exit 0 = all pass)
 */

'use strict';

const assert = require('node:assert/strict');

const {
  API_URL,
  MODEL,
  HTTP_REFERER,
  X_TITLE,
  NEEDS_RERUN_STATEMENT,
  SEVERITY_LEVELS,
  PAGE_STATE_CRITERIA,
  buildQuestions,
  buildRequestBody,
  buildHeaders,
  route,
  callJev,
  run,
} = require('./jev-triage.cjs');

const STATE = {
  url: 'https://astraea.local/studio/main',
  studio: 'vega-s2',
  banners: ['warning: recovered from crash'],
  badges: ['staging'],
  consoleErrors: 3,
  overflow: { x: false, y: true },
};

function okResponse(answers, usage) {
  const body = JSON.stringify({ model: MODEL, answers, usage });
  return {
    ok: true,
    status: 200,
    text: async () => body,
  };
}

function stubFetch(response, recorder) {
  return async (url, init) => {
    if (recorder) { recorder.url = url; recorder.init = init; }
    return response;
  };
}

const answersFor = (choice, confidence, noul) => ({
  page_state: { type: 'choice', choice, probabilities: {}, confidence },
  needs_rerun: { type: 'noul', noul },
  severity: { type: 'score', score: 0, legend: {}, probabilities: {}, confidence: 0.5 },
});

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// --- request contract --------------------------------------------------------

test('buildQuestions declares exactly the three typed questions in one payload', () => {
  const q = buildQuestions();
  assert.deepEqual(Object.keys(q).sort(), ['needs_rerun', 'page_state', 'severity']);

  assert.equal(q.page_state.type, 'choice');
  const labels = Object.keys(q.page_state.criteria).sort();
  assert.deepEqual(labels, Object.keys(PAGE_STATE_CRITERIA).sort());
  assert.equal(labels.length, 5);
  for (const label of labels) {
    assert.equal(q.page_state.criteria[label], PAGE_STATE_CRITERIA[label]);
    assert.equal(typeof q.page_state.criteria[label], 'string');
    assert.ok(q.page_state.criteria[label].length > 0, `criterion for ${label} is a one-liner`);
  }

  assert.equal(q.needs_rerun.type, 'noul');
  assert.equal(q.needs_rerun.instructions, NEEDS_RERUN_STATEMENT);
  assert.equal(q.needs_rerun.instructions, 'This state requires a re-run before the engineer trusts any output');

  assert.equal(q.severity.type, 'score');
  assert.ok(Array.isArray(q.severity.criteria), 'score rubric is an ordered criteria array');
  assert.deepEqual(q.severity.criteria, SEVERITY_LEVELS);
  assert.equal(q.severity.criteria.length, 4);
  assert.ok(q.severity.criteria[0].startsWith('low'));
  assert.ok(q.severity.criteria[1].startsWith('medium'));
  assert.ok(q.severity.criteria[2].startsWith('high'));
  assert.ok(q.severity.criteria[3].startsWith('critical'));
});

test('buildRequestBody passes the model, normalized state, and all questions', () => {
  const body = buildRequestBody(STATE);
  assert.equal(body.model, 'typesafe/jev-1.13');
  assert.equal(body.state.url, STATE.url);
  assert.equal(body.state.studio, STATE.studio);
  assert.deepEqual(body.state.banners, STATE.banners);
  assert.deepEqual(body.state.badges, STATE.badges);
  assert.equal(body.state.consoleErrors, 3);
  assert.deepEqual(body.state.overflow, { x: false, y: true });
  assert.deepEqual(Object.keys(body.questions).sort(), ['needs_rerun', 'page_state', 'severity']);
});

test('buildHeaders carry the exact contract and put the key only in Authorization', () => {
  const headers = buildHeaders('sk-test-123');
  assert.equal(headers.Authorization, 'Bearer sk-test-123');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['HTTP-Referer'], 'https://github.com/akhan157/astraea');
  assert.equal(headers['X-Title'], 'Astraea Jev triage');
  assert.equal(HTTP_REFERER, 'https://github.com/akhan157/astraea');
  assert.equal(X_TITLE, 'Astraea Jev triage');
});

test('normalizeStateDump rejects dumps missing url or studio', () => {
  for (const bad of [{ studio: 's' }, { url: 'https://x' }, {}, { url: '', studio: 's' }, 'nope', null]) {
    assert.throws(() => buildRequestBody(bad), /url|studio|must be a JSON object/);
  }
});

// --- routing branches --------------------------------------------------------

test('routing: high-confidence clean passes', () => {
  const d = route(answersFor('clean', 0.91, 0.02));
  assert.equal(d.verdict, 'PASS');
  assert.equal(d.label, null);
});

test('routing: high-confidence defect files with the page_state label', () => {
  const a = route(answersFor('stale_mislabeled', 0.88, 0.05));
  assert.equal(a.verdict, 'FILE');
  assert.equal(a.label, 'stale_mislabeled');

  const b = route(answersFor('blank_canvas', 0.85, 0.1));
  assert.equal(b.verdict, 'FILE');
  assert.equal(b.label, 'blank_canvas');

  const c = route(answersFor('overflow', 0.8, 0.1));
  assert.equal(c.verdict, 'FILE');
  assert.equal(c.label, 'overflow');

  const d = route(answersFor('stale_honest', 0.9, 0.1));
  assert.equal(d.verdict, 'FILE');
  assert.equal(d.label, 'stale_honest');
});

test('routing: confidence below 0.60 escalates even for clean', () => {
  assert.equal(route(answersFor('clean', 0.59, 0.1)).verdict, 'ESCALATE');
  assert.equal(route(answersFor('stale_honest', 0.3, 0.9)).verdict, 'ESCALATE');
});

test('routing: confidence threshold 0.60 is the pass/clean bound', () => {
  assert.equal(route(answersFor('clean', 0.6, 0.1)).verdict, 'PASS');
  assert.equal(route(answersFor('clean', 0.599999, 0.1)).verdict, 'ESCALATE');
});

test('routing: needs_rerun in [0.40, 0.60] escalates even when clean and confident', () => {
  for (const noul of [0.4, 0.5, 0.6]) {
    assert.equal(route(answersFor('clean', 0.95, noul)).verdict, 'ESCALATE', `noul=${noul}`);
  }
  // Just outside the band the escalation does not trigger.
  assert.equal(route(answersFor('clean', 0.95, 0.399)).verdict, 'PASS');
  assert.equal(route(answersFor('stale_honest', 0.95, 0.61)).verdict, 'FILE');
});

test('routing: malformed answers fail closed', () => {
  assert.throws(() => route({}), /malformed/);
  assert.throws(() => route(answersFor(1, 0.9, 0.5)), /malformed/);
});

// --- the call: latency, cost, fail-closed -------------------------------------

test('callJev posts to the decisions endpoint once and logs latency + cost from usage', async () => {
  const recorded = {};
  let t = 1000;
  const usage = { input_tokens: 312, output_tokens: 48, cost: 0.000042 };
  const res = await callJev(STATE, {
    env: { OPENROUTER_API_KEY: 'sk-test-123' },
    now: () => (t += 12),
    fetchFn: stubFetch(okResponse(answersFor('clean', 0.91, 0.02), usage), recorded),
  });
  assert.equal(recorded.url, 'https://openrouter.ai/api/alpha/decisions');
  assert.equal(recorded.url, API_URL);
  assert.equal(recorded.init.method, 'POST');
  assert.equal(recorded.init.headers.Authorization, 'Bearer sk-test-123');
  assert.equal(recorded.init.headers['HTTP-Referer'], 'https://github.com/akhan157/astraea');
  assert.equal(recorded.init.headers['X-Title'], 'Astraea Jev triage');
  assert.equal(recorded.init.headers['Content-Type'], 'application/json');
  const sent = JSON.parse(recorded.init.body);
  assert.equal(sent.model, MODEL);
  assert.deepEqual(Object.keys(sent.questions).sort(), ['needs_rerun', 'page_state', 'severity']);
  assert.equal(sent.state.url, STATE.url);
  assert.equal(res.latencyMs, 12);
  assert.equal(res.cost, 0.000042);
  assert.equal(res.answers.page_state.choice, 'clean');
  assert.equal(res.answers.needs_rerun.noul, 0.02);
});

test('callJev: cost absent from usage is logged as null, never fabricated', async () => {
  const usage = { input_tokens: 200, output_tokens: 30 };
  const res = await callJev(STATE, {
    env: { OPENROUTER_API_KEY: 'sk-test-123' },
    now: () => 5,
    fetchFn: stubFetch(okResponse(answersFor('clean', 0.9, 0.02), usage)),
  });
  assert.equal(res.cost, null);
  assert.equal(res.usage.cost, null);
  assert.equal(res.usage.input_tokens, 200);
  assert.equal(res.usage.output_tokens, 30);
});

test('callJev: missing key fails closed before any fetch', async () => {
  let called = false;
  const fetchFn = async () => { called = true; throw new Error('should not be reached'); };
  try {
    await callJev(STATE, { env: {}, fetchFn });
    assert.fail('expected a missing-key error');
  } catch (err) {
    assert.match(String(err.message), /OPENROUTER_API_KEY/);
    assert.match(String(err.message), /environment/);
  }
  assert.equal(called, false);
  assert.throws(() => buildHeaders(''), /OPENROUTER_API_KEY/);
});

test('callJev: HTTP errors surface status and body snippet', async () => {
  const errRes = {
    ok: false,
    status: 401,
    text: async () => '{"error":{"message":"bad key"}}',
  };
  try {
    await callJev(STATE, { env: { OPENROUTER_API_KEY: 'sk-wrong' }, fetchFn: stubFetch(errRes) });
    assert.fail('expected an HTTP error');
  } catch (err) {
    assert.match(String(err.message), /HTTP 401/);
    assert.match(String(err.message), /bad key/);
  }
});

test('callJev: proxy-wrapped {data:...} envelope is unwrapped', async () => {
  const inner = { model: MODEL, answers: answersFor('clean', 0.9, 0.02), usage: { cost: 0.00001 } };
  const wrapped = { ok: true, status: 200, text: async () => JSON.stringify({ data: inner }) };
  const res = await callJev(STATE, { env: { OPENROUTER_API_KEY: 'sk-test-123' }, fetchFn: stubFetch(wrapped) });
  assert.equal(res.answers.page_state.choice, 'clean');
  assert.equal(res.cost, 0.00001);
});

test('callJev: response without answers fails closed', async () => {
  const bad = { ok: true, status: 200, text: async () => JSON.stringify({ model: MODEL, usage: {} }) };
  try {
    await callJev(STATE, { env: { OPENROUTER_API_KEY: 'sk-test-123' }, fetchFn: stubFetch(bad) });
    assert.fail('expected a missing-answers error');
  } catch (err) {
    assert.match(String(err.message), /answers/);
  }
});

test('run() end-to-end with stubbed fetch returns verdict and prints rule + telemetry', async () => {
  const lines = [];
  const sink = { write: (s) => lines.push(s) };
  const result = await run(STATE, {
    env: { OPENROUTER_API_KEY: 'sk-test-123' },
    now: () => 42,
    fetchFn: stubFetch(okResponse(answersFor('stale_mislabeled', 0.9, 0.1), { input_tokens: 1, output_tokens: 1, cost: 0.000015 })),
    out: sink,
  });
  assert.equal(result.verdict, 'FILE');
  assert.equal(result.label, 'stale_mislabeled');
  assert.equal(result.latency_ms, 0);
  assert.equal(result.cost, 0.000015);
  assert.ok(lines.some((l) => l.startsWith('RULE: ')), 'prints the routing rule before the call');
  assert.ok(lines.some((l) => l.startsWith('VERDICT=FILE')), 'prints the verdict line');
});

// --- runner -------------------------------------------------------------------

async function runSuite() {
  let passed = 0;
  const failures = [];
  for (const [name, fn] of tests) {
    try {
      const ret = fn();
      if (ret && typeof ret.then === 'function') await ret;
      passed += 1;
    } catch (err) {
      failures.push(`FAIL ${name}\n  ${err.message}`);
    }
  }
  process.stdout.write(`jev-triage.test.cjs: ${passed}/${tests.length} cases passed\n`);
  if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exitCode = 1;
  }
}

runSuite();