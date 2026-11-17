// B1 P9 performance A/B after the E1 merge (spec section 8 Q2). TESTS/PROBE ONLY.
//
//   B1_OUT=<dir> ./node_modules/.bin/vitest run --maxWorkers=2 \
//     --config docs/internal/execution-runs/B1-step3-benchmark/vitest.config.ts p9
//
// Provenance (asserted below, no fallback):
//   base      step-0 archived WASM bc19590b..., arm-A options = the manifest `options` only
//   cand      goal-path (E1) WASM 4c1ec4ed..., candidate-default options
//             `{ ...e.options, ...flightRunOptions(adapt(e)) }`, K3's construction
//   aa        arm-A options on a fresh instance of the baseline WASM, same session
// The A/B therefore differs in OPTIONS AND ENGINE. Before the E1 merge both WASMs were
// byte-identical and the A/B was options-only; that framing is no longer true.
//
// Design, declared before any timing run (nothing here is tuned):
//   - ROUNDS = 12 (>= 10), fixed unless B1_ROUNDS overrides it (still asserted >= 10).
//   - In each round every one of the 23 cohort entries is timed once per arm. The three
//     arm calls for a case are adjacent, with the arm order rotated by
//     (round + case index) % 3, so no arm keeps a fixed position.
//   - One untimed warm-up pass per arm precedes the rounds.
//   - Timed call: `engine.call('simulate_flight', { vehicle, motor, options })`, the same
//     call K3 makes, wall clock via performance.now(). Three separate instances.
//
// Statistics, declared before the run:
//   per-case median over rounds, per arm.
//   perCaseRatio[i]  = median_cand[i] / median_base[i]
//   ratioAB          = median over the 23 cases of perCaseRatio        (headline)
//   aggregateRatioAB = sum(median_cand) / sum(median_base)              (secondary)
//   aaSpread         = max(|median(perCaseRatioAA) - 1|, |aggregateRatioAA - 1|)
//                      (conservative: the worse of the two aggregate A/A estimators)
//   The per-case A/A ratios' own min/max and the per-round A/A range are reported as
//   descriptive noise, never used to relax the rule.
//
// Frozen rule (assignment re-dispatch): PASS iff EVERY per-case candidate median is
// <= 1.10 x its baseline median AND aaSpread < 0.10. Any per-case ratio > 1.10 is a
// slowdown and is reported FAIL. aaSpread >= 0.10 with no slowdown is UNDECIDABLE on
// this host. Never tune, never re-run to pick a better result.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadavg, cpus, totalmem, freemem } from 'node:os';
import { it, expect } from 'vitest';
import { instantiateEngine } from '../../../../src/engine/core';
import type { EngineInstance } from '../../../../src/engine/core';
import { loadCohort, candidateDefaultOptions, sha256 } from './cohort';

const BASELINE_WASM = '/home/ak/astraea-evidence/goal-collegiate-accuracy/step0/wasm/build1.wasm';
const BASELINE_SHA = 'bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff';
const CANDIDATE_WASM = '/home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/candidate-4c1ec4ed.wasm';
const CANDIDATE_SHA = '4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535';
const ROUNDS = Number(process.env.B1_ROUNDS || 12);
const ARM_ORDER = ['base', 'cand', 'aa'] as const;
type Arm = (typeof ARM_ORDER)[number];
interface FlightResult { apogeeAltitude: number }

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b); const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

it('P9: candidate default vs arm-A A/B (options + engine), 23 cohort entries', async () => {
  expect(ROUNDS).toBeGreaterThanOrEqual(10);

  const { entries, sha256: manifestSha } = loadCohort();
  expect(entries.length).toBe(23);

  const basePath = process.env.B1_BASE_WASM || BASELINE_WASM;
  const candPath = process.env.B1_CAND_WASM || CANDIDATE_WASM;
  const baseBytes = readFileSync(basePath);
  const candBytes = readFileSync(candPath);
  const baseSha = sha256(baseBytes), candSha = sha256(candBytes);
  expect(baseSha).toBe(BASELINE_SHA);
  expect(candSha).toBe(CANDIDATE_SHA);
  expect(candSha).not.toBe(baseSha);

  const eng: Record<Arm, EngineInstance> = {
    base: await instantiateEngine(baseBytes),
    cand: await instantiateEngine(candBytes),
    aa: await instantiateEngine(baseBytes),
  };

  const cases = entries.map((e) => {
    const optionsA: Record<string, unknown> = { ...e.options };
    return {
      e,
      opts: { base: optionsA, cand: candidateDefaultOptions(e), aa: { ...optionsA } },
    };
  });
  const call = (arm: Arm, c: (typeof cases)[number]) => {
    const t0 = performance.now();
    const r = eng[arm].call<FlightResult>('simulate_flight', { vehicle: c.e.vehicle, motor: c.e.motor, options: c.opts[arm] });
    const ms = performance.now() - t0;
    return { ms, apogee: r.apogeeAltitude };
  };

  // Untimed warm-up, one pass per arm.
  const apogee: Record<Arm, Record<string, number>> = { base: {}, cand: {}, aa: {} };
  for (const arm of ARM_ORDER) for (const c of cases) apogee[arm][c.e.slug] = call(arm, c).apogee;

  const load0 = loadavg();
  const free0 = freemem();
  const times: Record<Arm, number[][]> = { base: cases.map(() => []), cand: cases.map(() => []), aa: cases.map(() => []) };
  const roundTotals: Record<Arm, number[]> = { base: [], cand: [], aa: [] };
  const roundLoad: number[][] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const tot: Record<Arm, number> = { base: 0, cand: 0, aa: 0 };
    cases.forEach((c, i) => {
      for (let k = 0; k < 3; k++) {
        const arm = ARM_ORDER[(r + i + k) % 3];
        const { ms } = call(arm, c);
        times[arm][i].push(ms);
        tot[arm] += ms;
      }
    });
    for (const arm of ARM_ORDER) roundTotals[arm].push(tot[arm]);
    roundLoad.push(loadavg());
  }
  const load1 = loadavg();
  const free1 = freemem();

  const mBase = cases.map((_, i) => median(times.base[i]));
  const mCand = cases.map((_, i) => median(times.cand[i]));
  const mAA = cases.map((_, i) => median(times.aa[i]));
  const ratios = (x: number[], y: number[]) => {
    const perCase = x.map((v, i) => v / y[i]);
    return {
      perCase,
      ratio: median(perCase),
      aggregateRatio: x.reduce((a, b) => a + b, 0) / y.reduce((a, b) => a + b, 0),
    };
  };
  const ab = ratios(mCand, mBase), aa = ratios(mAA, mBase);
  const perRoundAB = roundTotals.cand.map((v, i) => v / roundTotals.base[i]);
  const perRoundAA = roundTotals.aa.map((v, i) => v / roundTotals.base[i]);
  const aaSpread = Math.max(Math.abs(aa.ratio - 1), Math.abs(aa.aggregateRatio - 1));
  const maxPerCaseAB = Math.max(...ab.perCase);
  const failCases = cases.map((c, i) => ({ slug: c.e.slug, ratio: ab.perCase[i] })).filter((x) => x.ratio > 1.10);
  const slowdown = maxPerCaseAB > 1.10 || ab.ratio > 1.10;
  const verdict = slowdown ? 'FAIL' : aaSpread >= 0.10 ? 'UNDECIDABLE' : 'PASS';

  const out = process.env.B1_OUT || 'out/B1/p9';
  mkdirSync(out, { recursive: true });
  const summary = {
    rule: 'PASS iff every per-case candidate median <= 1.10 x baseline median AND aaSpread < 0.10; any per-case ratio > 1.10 => FAIL; aaSpread >= 0.10 (no slowdown) => UNDECIDABLE',
    abDiffersIn: 'options AND engine (baseline bc19590b step-0 WASM, candidate 4c1ec4ed E1 goal-path WASM)',
    verdict, rounds: ROUNDS, cases: cases.length,
    baseWasm: { path: basePath, sha256: baseSha },
    candWasm: { path: candPath, sha256: candSha },
    manifest: { path: '/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json', sha256: manifestSha },
    ratioAB: ab.ratio, aggregateRatioAB: ab.aggregateRatio, maxPerCaseRatioAB: maxPerCaseAB,
    failCases,
    ratioAA: aa.ratio, aggregateRatioAA: aa.aggregateRatio, aaSpread,
    aaPerCaseRatioRange: [Math.min(...aa.perCase), Math.max(...aa.perCase)],
    perRoundRatioAB: perRoundAB, perRoundRatioAA: perRoundAA,
    perRoundRatioAB_range: [Math.min(...perRoundAB), Math.max(...perRoundAB)],
    perRoundRatioAA_range: [Math.min(...perRoundAA), Math.max(...perRoundAA)],
    sumMedianMs: {
      base: mBase.reduce((a, b) => a + b, 0),
      cand: mCand.reduce((a, b) => a + b, 0),
      aa: mAA.reduce((a, b) => a + b, 0),
    },
    loadavgStart: load0, loadavgEnd: load1, loadavgPerRound: roundLoad,
    freeMemBytesStart: free0, freeMemBytesEnd: free1,
    host: { cpuCount: cpus().length, cpuModel: cpus()[0]?.model ?? null, totalMemBytes: totalmem() },
    perCase: cases.map((c, i) => ({
      slug: c.e.slug,
      baseMedianMs: mBase[i], candMedianMs: mCand[i], aaMedianMs: mAA[i],
      ratioAB: ab.perCase[i], ratioAA: aa.perCase[i],
      apogeeBase: apogee.base[c.e.slug], apogeeCand: apogee.cand[c.e.slug], apogeeAA: apogee.aa[c.e.slug],
    })),
  };
  writeFileSync(`${out}/p9-summary.json`, JSON.stringify(summary, null, 2));
  writeFileSync(`${out}/p9-raw-ms.json`, JSON.stringify({ slugs: cases.map((c) => c.e.slug), times, roundTotals }, null, 2));

  // Same inputs on the same bytes: the base and A/A arms must agree exactly.
  for (const c of cases) expect(apogee.aa[c.e.slug]).toBe(apogee.base[c.e.slug]);
}, 3_600_000);
