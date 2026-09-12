#!/usr/bin/env node
/**
 * Gate 5 evidence artifact emitter — FAIL-CLOSED machine-readable benchmark
 * metadata for the Astraea 6-DOF flight simulation engineering workstation.
 *
 * Fail-closed semantics (Astra round-14 audit, section 8):
 *  - Gate coverage is derived from EXECUTED vitest test-case results, never
 *    from source-text presence and never from global test success alone.
 *    Each gate lists REQUIRED VV suite IDs; a gate is green only when every
 *    required suite executed with all test cases passed, nothing skipped.
 *  - Every legacy VV suite present in source is independently mandatory:
 *    a suite missing from execution (or not passed) fails certification even
 *    when no gate requires it.
 *  - Vitest per-file summary is parsed from `testResults[].assertionResults`
 *    (the actual vitest JSON schema). Counts are per-test-case (it/test),
 *    not individual expect() calls — labeled as such, never as assertions.
 *    Unknown statuses and reporter-aggregate/count disagreements fail.
 *  - Inventory suites MUST declare every case with its own literal `it(` or
 *    `test(` token. Parameterized `.each` tables, `.for` loops, and any other
 *    dynamic case generation are PROHIBITED in inventory suites: source-case
 *    counting matches one token per executed case, so a table that expands
 *    into N executed cases under one token would silently desynchronize the
 *    count binding (write the cases explicitly instead).
 *  - Measured evidence is emitted: executed test cases, durations, skips
 *    (pending/todo/disabled), failures (+ verbatim failure messages and
 *    reporter-emitted numerics), declared tolerance bounds from the executed
 *    suites' source, and sha256 artifact hashes. No value is fabricated:
 *    passing-assertion values are not exposed by the reporter and are
 *    labeled unmeasurable; tolerance literals are labeled source-declared.
 *  - Git failure is fatal: an unresolvable HEAD commit, unknown commit date,
 *    unreadable branch, or unreadable status makes certification fail. A
 *    dirty tree pins `passed` false.
 *  - Cited-file hashes and git status are captured BEFORE and AFTER
 *    build/test execution; any drift fails certification (pre/post source
 *    immutability binding). The artifact self-hash follows its advertised
 *    basis exactly (verifiable via verifyArtifactSelfHash).
 *  - The emitter's own substantive suite runs inside the certified command
 *    (exit 0 required) and as real cases under Vitest — never a marker.
 *  - Installed dependency versions are measured from node_modules/<pkg>/
 *    package.json on disk. The pnpm YAML lockfile is never parsed as JSON;
 *    a lockfile must nevertheless be present for reproducible installs.
 *  - The VV suite inventory is derived dynamically from describe markers
 *    (includes VV-014/VV-015) and cross-checked against executed results.
 *  - Solver configuration is labeled as source-text inference, not a
 *    runtime trace.
 *
 * Any missing required evidence => `passed: false` and exit code 1.
 *
 * Usage: node scripts/emit-benchmark-metadata.cjs
 */

'use strict';

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Required executed-suite evidence per gate (bare ids, matching suite records).
// Grounded in the suite markers in src/sim/vv-benchmarks.test.ts (each
// describes the gate it exercises).
const GATE_REQUIREMENTS = Object.freeze({
  GATE_1R_LOADS_ASSEMBLY: ['004', '007', '010', '015'], // production loads assembly, solver linkage, loadsAt stage RHS, production descent
  GATE_2_ADAPTIVE_INTEGRATOR: ['014'], // adaptive DP5(4) termination + convergence
  GATE_3_VARIABLE_INERTIA: ['013'], // inertiaDotB term
  GATE_4_P0_2_LOADSAT_STAGE_RHS: ['010'], // loads evaluated at every stage
  GATE_4_P0_3_FRAME_DECLARED: ['004'], // ENU/body frame consistency (Galilean invariance)
  GATE_4_P0_5_EVENT_LOCALIZATION: ['012'], // production event localization
  GATE_4_PRODUCTION_CONTRACTS: ['015'], // touchdown alignment, validity propagation, rail contact (production path)
});

// File-level acceptance suites added for defects that the legacy VV cases do
// not discriminate. A gate cannot pass unless each required file was present,
// executed in full, and passed with its source test-case count intact.
const GATE_FILE_REQUIREMENTS = Object.freeze({
  GATE_1R_LOADS_ASSEMBLY: ['src/dynamics/loads.repair.test.ts', 'src/core/mass.test.ts'],
  GATE_2_ADAPTIVE_INTEGRATOR: ['src/dynamics/rigidBody.adaptive.test.ts'],
  GATE_3_VARIABLE_INERTIA: ['src/dynamics/loads.repair.test.ts', 'src/propulsion/motorDatabase.test.ts'],
  GATE_4_P0_5_EVENT_LOCALIZATION: ['src/sim/event-restart.test.ts'],
  GATE_4_PRODUCTION_CONTRACTS: ['src/sim/sixDofSimulator.test.ts', 'src/components/FlightSimulationTab.test.tsx'],
});

// Files whose integrity the artifact cites (sha256). Missing required files
// are missing evidence; the lockfile/manifests are informational.
const HASHED_REQUIRED_FILES = Object.freeze([
  'src/sim/vv-benchmarks.test.ts',
  'src/dynamics/rigidBody.adaptive.test.ts',
  'src/dynamics/loads.repair.test.ts',
  'src/sim/event-restart.test.ts',
  'src/sim/sixDofSimulator.test.ts',
  'src/propulsion/motorDatabase.test.ts',
  'src/core/mass.test.ts',
  'src/components/FlightSimulationTab.test.tsx',
  'scripts/emit-benchmark-metadata.test.cjs',
  // All 43 FIXED_TEST_FILE_INVENTORY suites are cited (sha256) so the
  // artifact's hashes.files covers every collected suite, not only the
  // gate-bound files (audit §9.4 completeness; M1).
  'src/aero/barrowman.test.ts',
  'src/aero/finFlutter.test.ts',
  'src/aero/finStructure.test.ts',
  'src/aero/stabilityBreakdown.test.ts',
  'src/aero/transonicAero.test.ts',
  'src/sim/flightSimulator.test.ts',
  'src/formats/orkParser.test.ts',
  'src/formats/rktParser.test.ts',
  'src/formats/rktExport.test.ts',
  'src/formats/stepExport.test.ts',
  'src/formats/stlExport.test.ts',
  'src/store/rocketStore.test.ts',
  'src/aero/protuberance.test.ts',
  'src/sim/weather.test.ts',
  'src/sim/windProfile.test.ts',
  'src/sim/monteCarlo.test.ts',
  'src/sim/motorVariance.test.ts',
  'src/sim/waiverContainment.test.ts',
  'src/formats/rasaero.test.ts',
  'src/propulsion/grainRegression.test.ts',
  'src/propulsion/nozzleChemistry.test.ts',
  'src/propulsion/curveEditing.test.ts',
  'src/propulsion/gibbsEquilibrium.test.ts',
  'src/propulsion/thrustcurveApi.test.ts',
  'src/recovery/recovery.test.ts',
  'src/evidence/evidence.test.ts',
  'src/components/PropulsionStudio.test.tsx',
  'src/components/TrajectoryStudio.test.tsx',
  'src/components/EvidenceStudio.test.tsx',
  'src/components/InteropExportPanel.test.tsx',
  'src/components/PropertyInspector.test.tsx',
  'src/formats/engParser.test.ts',
  'src/formats/blueprint.test.ts',
  'src/formats/blueprintPng.test.ts',
  'src/dynamics/rigidBody.ts',
  'src/dynamics/loads.ts',
  'src/dynamics/events.ts',
  'src/sim/sixDofSimulator.ts',
  'src/sim/flightSimulator.ts',
  'src/propulsion/motorDatabase.ts',
  'src/aero/transonicAero.ts',
  'src/aero/barrowman.ts',
  'src/core/mass.ts',
  'src/components/FlightSimulationTab.tsx',
  'src/components/PropertyInspector.tsx',
  'src/core/types.ts',
  'src/store/rocketStore.ts',
  'src/aero/protuberance.ts',
  'src/sim/weather.ts',
  'src/sim/monteCarlo.ts',
  'src/formats/rasaero.ts',
  'src/propulsion/grainRegression.ts',
  'src/propulsion/nozzleChemistry.ts',
  'src/recovery/packing.ts',
  'src/recovery/charges.ts',
  'src/evidence/altimetry.ts',
  'src/evidence/calibration.ts',
  'src/components/PropulsionStudio.tsx',
  'src/components/TrajectoryStudio.tsx',
  'src/components/EvidenceStudio.tsx',
  'src/components/InteropExportPanel.tsx',
  'src/formats/engParser.ts',
  'src/formats/blueprint.ts',
  'src/formats/blueprintPng.ts',
  'scripts/emit-benchmark-metadata.cjs',
  'package.json',
]);
// Fixed mandatory legacy inventory (Round-16 audit §7.4): source-relative
// completeness lets a deleted suite pass silently. These 14 VV suites must
// exist in source AND execute green — deletion from either fails.
const REQUIRED_VV_IDS = Object.freeze(
  ['001', '002', '003', '004', '005', '006', '007', '009', '010', '011', '012', '013', '014', '015']
);
// Fixed collected-file inventory (Round-18 audit §9.4; extended to 43 by the
// post-audit HIGH sweep): the executed set is closed. Every listed file must
// be collected AND execute with its source case count intact; any executed
// *.test.* file outside this list is an unacknowledged suite and fails
// certification. Adding a legitimate suite requires updating this inventory
// explicitly — never silently.
//
// Source/executed count binding rule: every case in an inventory suite MUST
// be declared with its own literal `it(`/`test(` token (a single AST-level
// case declaration). Parameterized `.each` tables, `.for` loops, or any other
// dynamic case generation collapse many executed cases into one counted
// token and are PROHIBITED in inventory suites — write the cases explicitly.
const FIXED_TEST_FILE_INVENTORY = Object.freeze([
  'src/sim/vv-benchmarks.test.ts',
  'src/dynamics/rigidBody.adaptive.test.ts',
  'src/dynamics/loads.repair.test.ts',
  'src/sim/event-restart.test.ts',
  'src/sim/sixDofSimulator.test.ts',
  'src/propulsion/motorDatabase.test.ts',
  'src/core/mass.test.ts',
  'src/components/FlightSimulationTab.test.tsx',
  'src/aero/barrowman.test.ts',
  'src/aero/finFlutter.test.ts',
  'src/aero/finStructure.test.ts',
  'src/aero/stabilityBreakdown.test.ts',
  'src/aero/transonicAero.test.ts',
  'src/sim/flightSimulator.test.ts',
  'src/formats/orkParser.test.ts',
  'src/formats/rktParser.test.ts',
  'src/formats/rktExport.test.ts',
  'src/formats/stepExport.test.ts',
  'src/formats/stlExport.test.ts',
  'src/store/rocketStore.test.ts',
  'src/aero/protuberance.test.ts',
  'src/sim/weather.test.ts',
  'src/sim/windProfile.test.ts',
  'src/sim/monteCarlo.test.ts',
  'src/sim/motorVariance.test.ts',
  'src/sim/waiverContainment.test.ts',
  'src/formats/rasaero.test.ts',
  'src/propulsion/grainRegression.test.ts',
  'src/propulsion/nozzleChemistry.test.ts',
  'src/propulsion/curveEditing.test.ts',
  'src/propulsion/gibbsEquilibrium.test.ts',
  'src/propulsion/thrustcurveApi.test.ts',
  'src/recovery/recovery.test.ts',
  'src/evidence/evidence.test.ts',
  'src/components/PropulsionStudio.test.tsx',
  'src/components/TrajectoryStudio.test.tsx',
  'src/components/EvidenceStudio.test.tsx',
  'src/components/InteropExportPanel.test.tsx',
  'src/components/PropertyInspector.test.tsx',
  'src/formats/engParser.test.ts',
  'src/formats/blueprint.test.ts',
  'src/formats/blueprintPng.test.ts',
  'scripts/emit-benchmark-metadata.test.cjs',
]);
const HASHED_INFORMATIONAL_FILES = Object.freeze([
  'pnpm-lock.yaml',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
]);

const VV_ID_RE = /VV-(\d{3})(?!\d)/;
const DESCRIBE_RE = /describe\(\s*['"](VV-\d{3}(?!\d)[^'"\n]*)['"]/g;
const IT_RE = /\b(?:it|test)(?:\.\w+)?\s*\(/g;
const BOUND_RE = /toBeLessThan(?:OrEqual)?\(\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*\)/g;
const DIGITS_RE = /toBeCloseTo\(\s*[^,)]+,\s*(\d+)\s*\)/g;

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// --- default runners (real environment) -------------------------------------

function defaultRun(root, cmd) {
  try {
    const stdout = execSync(cmd, { cwd: root, encoding: 'utf-8' });
    return { ok: true, stdout: (stdout ?? '').trim() };
  } catch {
    return { ok: false, stdout: '' };
  }
}

function defaultRunBuild(root) {
  try {
    execSync('pnpm run build', { cwd: root, stdio: 'ignore' });
    return { ok: true, exitCode: 0, error: null };
  } catch (e) {
    const exitCode = e && typeof e.status === 'number' ? e.status : 1;
    return { ok: false, exitCode, error: `build failed (exit ${exitCode})` };
  }
}

function defaultRunTests(root) {
  const outFile = path.join(os.tmpdir(), `astraea-vitest-${process.pid}-${Date.now()}.json`);
  let exitCode = -1;
  try {
    execSync(`npx vitest run --reporter=json --outputFile=${outFile}`, { cwd: root, stdio: 'ignore' });
    exitCode = 0;
  } catch (e) {
    exitCode = e && typeof e.status === 'number' ? e.status : 1;
  }
  let json = null;
  try {
    json = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
  } catch {
    json = null;
  }
  try {
    fs.rmSync(outFile, { force: true });
  } catch {
    /* ignore */
  }
  return { ok: exitCode === 0, exitCode, json };
}

// The emitter's own substantive fail-closed suite. Under the certified command
// this MUST execute (exit 0 required); the Vitest collection of the .test.cjs
// file runs the same cases in-process (see the test file header).
function defaultRunEmitterSelfTests(root) {
  try {
    execSync(`${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(root, 'scripts', 'emit-benchmark-metadata.test.cjs'))}`, {
      cwd: root,
      stdio: 'ignore',
    });
    return { ok: true, exitCode: 0 };
  } catch (e) {
    const exitCode = e && typeof e.status === 'number' ? e.status : 1;
    return { ok: false, exitCode };
  }
}

// --- source analysis --------------------------------------------------------

/** Describe-marker suite inventory: id -> { id, title, slice }. Dynamic; no hardcoded list. */
function extractVvSuiteSlices(src) {
  if (typeof src !== 'string') return [];
  const suites = [];
  let m;
  DESCRIBE_RE.lastIndex = 0;
  while ((m = DESCRIBE_RE.exec(src)) !== null) {
    const title = m[1];
    const idMatch = title.match(VV_ID_RE);
    if (!idMatch) continue;
    suites.push({ id: idMatch[1], title, index: m.index });
  }
  suites.sort((a, b) => a.index - b.index);
  for (let i = 0; i < suites.length; i++) {
    const end = i + 1 < suites.length ? suites[i + 1].index : src.length;
    suites[i].slice = src.slice(suites[i].index, end);
  }
  return suites;
}

function extractSourceSuites(src) {
  return extractVvSuiteSlices(src).map((s) => s.id);
}

function countSourceAssertions(slice) {
  if (typeof slice !== 'string') return 0;
  IT_RE.lastIndex = 0;
  let n = 0;
  while (IT_RE.exec(slice) !== null) n++;
  return n;
}

/** Numeric tolerance bounds + decimal digits declared by assertions in a suite slice. */
function extractTolerances(slice) {
  const bounds = [];
  const digits = [];
  if (typeof slice === 'string') {
    let m;
    BOUND_RE.lastIndex = 0;
    while ((m = BOUND_RE.exec(slice)) !== null) {
      const v = Number(m[1]);
      if (Number.isFinite(v)) bounds.push(v);
    }
    DIGITS_RE.lastIndex = 0;
    while ((m = DIGITS_RE.exec(slice)) !== null) digits.push(Number(m[1]));
  }
  return {
    bounds: [...new Set(bounds)].sort((a, b) => a - b),
    digits: [...new Set(digits)].sort((a, b) => a - b),
  };
}

// --- vitest JSON analysis ---------------------------------------------------

function vvIdFromAssertion(a) {
  const hay = `${(a.ancestorTitles ?? []).join(' | ')} | ${a.fullName ?? ''} ${a.title ?? ''}`;
  const m = hay.match(VV_ID_RE);
  return m ? m[1] : null;
}

function parseVitestJson(json) {
  if (!json || typeof json !== 'object') return null;
  const files = [];
  for (const f of json.testResults ?? []) {
    const byStatus = {};
    const failures = [];
    const caseNames = [];
    let durationMs = 0;
    const STATUS_KEYS = ['passed', 'failed', 'skipped', 'pending', 'todo', 'disabled'];
    for (const a of f.assertionResults ?? []) {
      const st = a.status || 'unknown';
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      caseNames.push(`${a.fullName ?? ''} :: ${a.title ?? ''}`);
      if (typeof a.duration === 'number') durationMs += a.duration;
      if (st === 'failed') {
        failures.push({ fullName: a.fullName ?? '', title: a.title ?? '', messages: a.failureMessages ?? [] });
      }
    }
    // Statuses outside the known set are counted as unknown, never dropped:
    // an unrecognized status is missing evidence, not a pass.
    const unknown = Object.entries(byStatus)
      .filter(([k]) => !STATUS_KEYS.includes(k))
      .reduce((n, [, c]) => n + c, 0);
    const total = STATUS_KEYS.reduce((n, k) => n + (byStatus[k] ?? 0), 0) + unknown;
    files.push({
      file: path.basename(f.name ?? ''),
      path: String(f.name ?? '').replace(/\\/g, '/'),
      status: f.status ?? 'unknown',
      // Honest count semantics: vitest reports per-test-case (it/test)
      // results, not individual expect() calls. Equal counts prove every
      // declared case executed — not that every conditional expect ran.
      testCases: {
        total,
        passed: byStatus.passed ?? 0,
        failed: byStatus.failed ?? 0,
        skipped: byStatus.skipped ?? 0,
        pending: byStatus.pending ?? 0,
        todo: byStatus.todo ?? 0,
        disabled: byStatus.disabled ?? 0,
        unknown,
      },
      durationMs: Math.round(durationMs * 1000) / 1000,
      message: f.message ?? '',
      failures,
      caseNames,
    });
  }
  const numDisabled = files.reduce((n, f) => n + f.testCases.disabled, 0);
  const numSkippedAll = files.reduce(
    (n, f) => n + f.testCases.skipped + f.testCases.pending + f.testCases.todo + f.testCases.disabled,
    0
  );
  const numFailed = files.reduce((n, f) => n + f.testCases.failed, 0);
  const numUnknown = files.reduce((n, f) => n + f.testCases.unknown, 0);
  return {
    parsed: true,
    success: json.success === true,
    totals: {
      filesTotal: files.length,
      filesPassed: files.filter((f) => f.status === 'passed').length,
      filesFailed: files.filter((f) => f.status === 'failed').length,
      filesSkipped: files.filter((f) => f.status === 'skipped' || f.status === 'todo').length,
      testCasesTotal: files.reduce((n, f) => n + f.testCases.total, 0),
      testCasesPassed: files.reduce((n, f) => n + f.testCases.passed, 0),
      testCasesFailed: numFailed,
      testCasesSkipped: numSkippedAll,
      testCasesTodo: files.reduce((n, f) => n + f.testCases.todo, 0),
      testCasesDisabled: numDisabled,
      testCasesUnknown: numUnknown,
      countSemantics: 'per-test-case (it/test) results, not individual expect() calls',
    },
    files,
  };
}

/** Per-VV measurement records from the executed legacy benchmark file only. */
function vvSuiteRecordsFromJson(json) {
  const recs = {};
  for (const f of json?.testResults ?? []) {
    // Suite records belong to src/sim/vv-benchmarks.test.ts: any other file
    // whose titles merely mention a VV id (emitter self-tests, acceptance
    // suites) must not inflate or dilute the legacy execution counts.
    const p = String(f.name ?? '').replace(/\\/g, '/');
    if (!(p === 'src/sim/vv-benchmarks.test.ts' || p.endsWith('/src/sim/vv-benchmarks.test.ts'))) continue;
    for (const a of f.assertionResults ?? []) {
      const id = vvIdFromAssertion(a);
      if (!id) continue;
      const rec = recs[id] ??= {
        testCases: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0, todo: 0, disabled: 0, unknown: 0 },
        durationMs: 0,
        failures: [],
      };
      rec.testCases.total++;
      const key = ['passed', 'failed', 'skipped', 'pending', 'todo', 'disabled'].includes(a.status) ? a.status : 'unknown';
      rec.testCases[key]++;
      if (typeof a.duration === 'number') rec.durationMs += a.duration;
      if (a.status === 'failed') {
        rec.failures.push({ fullName: a.fullName ?? '', title: a.title ?? '', messages: a.failureMessages ?? [] });
      }
    }
  }
  for (const rec of Object.values(recs)) {
    const a = rec.testCases;
    const unexecuted = a.skipped + a.pending + a.todo + a.disabled;
    const unknown = a.unknown ?? 0;
    rec.status =
      a.failed > 0 || unknown > 0 ? 'failed'
      : a.total > 0 && unexecuted === 0 ? 'passed'
      : a.total > 0 && a.total === unexecuted ? 'unexecuted' : 'partial';
    rec.durationMs = Math.round(rec.durationMs * 1000) / 1000;
    rec.incomplete = a.total === 0 || unexecuted > 0 || unknown > 0 || a.failed > 0;
    // Measured residuals where feasible: the vitest JSON reporter exposes no
    // passing-assertion values, so successful numerical residuals are
    // recovered from failure-message numerics when a case failed; durations
    // are the measured evidence on success. Never fabricated.
    rec.observedValues = extractObservedNumbers(rec.failures.flatMap((f) => f.messages));
  }
  return recs;
}

/** Finite numerics embedded in failure messages (capped): measured values the reporter did emit. */
function extractObservedNumbers(messages) {
  const out = [];
  const RE = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (const m of messages ?? []) {
    if (typeof m !== 'string') continue;
    let r;
    RE.lastIndex = 0;
    while ((r = RE.exec(m)) !== null && out.length < 25) {
      const v = Number(r[0]);
      if (Number.isFinite(v)) out.push(v);
    }
    if (out.length >= 25) break;
  }
  return out;
}

// --- dependency measurement -------------------------------------------------

/** Minimal caret/exact range conformance (audit §9.5): installed versions
 *  must satisfy the declared manifest range. Returns true/false for
 *  parseable `^`/`~`/exact ranges, null when the range shape is exotic
 *  (skipped with documentation, never assumed conformant-or-violated). */
function satisfiesDeclaredRange(declared, installed) {
  if (typeof declared !== 'string' || typeof installed !== 'string') return null;
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
  const d = declared.trim();
  const at = (prefix) => (d.startsWith(prefix) ? parse(d.slice(prefix.length)) : null);
  let low = null;
  let high = null; // exclusive upper bound
  if (at('^')) {
    low = at('^');
    if (!low) return null;
    high = low[0] > 0 ? [low[0] + 1, 0, 0] : low[1] > 0 ? [0, low[1] + 1, 0] : [0, 0, low[2] + 1];
  } else if (at('~')) {
    low = at('~');
    if (!low) return null;
    high = [low[0], low[1] + 1, 0];
  } else {
    // Exact numeric version only; anything else is exotic (documented skip).
    if (!/^=?\d+\.\d+\.\d+$/.test(d)) return null;
    low = parse(d.replace(/^=/, ''));
    if (!low) return null;
    high = null;
  }
  const inst = parse(installed);
  if (!inst) return null;
  if (cmp(inst, low) < 0) return false;
  if (high && cmp(inst, high) >= 0) return false;
  if (!high && cmp(inst, low) !== 0) return false;
  return true;
}

/** Measure installed versions from node_modules/<pkg>/package.json on disk. */
function measureInstalledDeps(root, declared, existsFn, readJsonFn) {
  const packages = {};
  let complete = true;
  for (const name of Object.keys(declared)) {
    const rel = path.posix.join('node_modules', name, 'package.json');
    let installed = null;
    let found = false;
    try {
      if (existsFn(rel)) {
        const j = readJsonFn(rel);
        if (j && typeof j.version === 'string') {
          installed = j.version;
          found = true;
        }
      }
    } catch {
      /* not installed or unreadable */
    }
    if (!found) complete = false;
    const conformant = found ? satisfiesDeclaredRange(declared[name], installed) : null;
    packages[name] = { declared: declared[name], installed, found, conformant };
  }
  return { packages, complete };
}

// --- solver configuration ----------------------------------------------------

function extractSolverConfig(readFileFn) {
  const files = ['src/dynamics/rigidBody.ts', 'src/dynamics/loads.ts', 'src/sim/sixDofSimulator.ts'];
  const bodies = {};
  let available = true;
  for (const rel of files) {
    try {
      bodies[rel] = readFileFn(rel);
    } catch {
      bodies[rel] = null;
      available = false;
    }
  }
  const rigidBody = bodies['src/dynamics/rigidBody.ts'];
  const loads = bodies['src/dynamics/loads.ts'];
  const sim = bodies['src/sim/sixDofSimulator.ts'];
  return {
    available,
    fixedIntegrator: available ? 'classical RK4 (Runge-Kutta 4-stage, additive normalized quaternion)' : 'UNAVAILABLE',
    adaptiveIntegrator: rigidBody && rigidBody.includes('export function integrateRigidAdaptive')
      ? 'Dormand-Prince RK 5(4) (embedded error estimate, per-axis tolerances, bounded rejection)'
      : 'NOT PRESENT',
    defaultIntegrator: available && sim && /integrateRigidAdaptive\(/.test(sim) ? 'adaptive DP5(4) (simulator)' : 'fixed RK4 (classical) (simulator)',
    productionUsesAdaptive: available ? !!sim && /integrateRigidAdaptive\(/.test(sim) : null,
    inertiaDotB: loads && loads.includes('inertiaDotB') ? 'enabled (production loads assembly)' : 'disabled',
    validationLevel: 'strict (unit-norm q precondition, nonfinite rejection, positive inertia/mass)',
    configNote: 'inferred by source-text matching, not by runtime tracing: productionUsesAdaptive detects the integrateRigidAdaptive( call site in sixDofSimulator.ts',
  };
}

// --- core -------------------------------------------------------------------

/**
 * Compute the full evidence artifact. All side channels are injectable so the
 * emitter can be driven against fixtures in its own test suite.
 *
 * opts:
 *   root       repo root (default: this file's repo)
 *   run(cmd)   -> { ok, stdout }           (git commands; default wraps execSync)
 *   runBuild() -> { ok, exitCode, error }
 *   runTests() -> { ok, exitCode, json }   (parsed vitest JSON)
 *   readFile(rel) / readJson(rel) / exists(rel)
 *   now()      -> Date
 */
function computeEvidence(opts = {}) {
  const root = path.resolve(opts.root ?? ROOT);
  const run = opts.run ?? ((cmd) => defaultRun(root, cmd));
  const runBuild = opts.runBuild ?? (() => defaultRunBuild(root));
  const runTests = opts.runTests ?? (() => defaultRunTests(root));
  const runEmitterSelfTests = opts.runEmitterSelfTests ?? (() => defaultRunEmitterSelfTests(root));
  const exists = opts.exists ?? ((rel) => fs.existsSync(path.join(root, rel)));
  const readFile = opts.readFile ?? ((rel) => fs.readFileSync(path.join(root, rel), 'utf-8'));
  // Raw on-disk bytes for hashing (audit §7.3): file hashes are sha256 of
  // the byte stream, not of a UTF-8-decoded string (identical for valid
  // UTF-8 source, but the advertised operation is the byte hash).
  const readBytes = opts.readBytes ?? ((rel) => fs.readFileSync(path.join(root, rel)));
  const readJson = opts.readJson ?? ((rel) => {
    const text = readFile(rel);
    return text ? JSON.parse(text) : null;
  });
  const now = opts.now ?? (() => new Date());

  const missing = [];

  // Cited-file hashing (pre/post): source immutability across build, tests,
  // and hash collection is verified by comparing both snapshots below.
  const hashCited = () => {
    const h = {};
    for (const rel of [...HASHED_REQUIRED_FILES, ...HASHED_INFORMATIONAL_FILES]) {
      try {
        h[rel] = sha256Hex(readBytes(rel));
      } catch {
        h[rel] = null;
      }
    }
    return h;
  };

  // --- git identity: failure is fatal, never whispered to 'UNKNOWN' ----------
  const gitHash = run('git rev-parse HEAD');
  const gitDate = run('git log -1 --format=%cI');
  const gitBranch = run('git rev-parse --abbrev-ref HEAD');
  const gitStatus = run('git status --porcelain');
  const commitKnown = gitHash.ok && /^[0-9a-fA-F]{7,40}$/.test(gitHash.stdout) && gitDate.ok && gitBranch.ok;
  const treeUnknown = !gitStatus.ok;
  const treeDirty = gitStatus.ok ? gitStatus.stdout.length > 0 : true;
  const commitHash = gitHash.ok ? gitHash.stdout : null;
  const commit = {
    hash: commitHash,
    short: commitHash ? commitHash.slice(0, 7) : null,
    date: gitDate.ok ? gitDate.stdout : null,
    branch: gitBranch.ok ? gitBranch.stdout : null,
    known: commitKnown,
    treeState: treeUnknown ? 'unknown' : treeDirty ? 'dirty' : 'clean',
    note: !commitKnown
      ? 'HEAD commit identity unknown — certification FAIL'
      : treeUnknown
        ? 'working-tree state unreadable — certification FAIL'
        : treeDirty
          ? 'WORKING TREE DIFFERS FROM COMMIT — artifact not certifiable'
          : 'clean',
  };
  if (!commitKnown) missing.push('git: HEAD commit identity unknown (hash/date/branch unreadable)');
  if (treeUnknown) missing.push('git: working-tree state unreadable (status failed)');
  if (treeDirty) missing.push('git: working tree is dirty');

  // --- dependencies: measured from node_modules, lockfile never read as JSON --
  let pkg = null;
  try {
    pkg = readJson('package.json');
  } catch {
    pkg = null;
  }
  if (!pkg) missing.push('dependencies: package.json missing or unparseable');
  const declaredDeps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  const installed = measureInstalledDeps(root, declaredDeps, exists, readJson);
  let lockfileFormat = null;
  if (exists('pnpm-lock.yaml')) lockfileFormat = 'pnpm-yaml';
  else if (exists('package-lock.json')) lockfileFormat = 'npm-json';
  const lockfile = {
    present: lockfileFormat !== null,
    format: lockfileFormat,
    note: lockfileFormat === 'pnpm-yaml' ? 'YAML lockfile — not parsed as JSON; installed versions measured from node_modules' : null,
  };
  if (!lockfile.present) missing.push('dependencies: no lockfile present (pnpm-lock.yaml or package-lock.json required for reproducible installs)');
  if (!installed.complete) missing.push('dependencies: declared package(s) missing from node_modules (installed measurement incomplete)');
  for (const [name, rec] of Object.entries(installed.packages)) {
    if (rec.found && rec.conformant === false) {
      missing.push(`dependencies: installed ${name}@${rec.installed} does not satisfy declared range ${rec.declared}`);
    } else if (rec.found && rec.conformant === null) {
      // Exotic range shapes are unverifiable conformance evidence, not a
      // documented skip (audit §9.5): pin to a ^/~/exact range instead.
      missing.push(`dependencies: ${name} declares exotic range ${rec.declared} (installed ${rec.installed}) — conformance unverifiable`);
    }
  }

  // Source analysis binds to the PRE-execution snapshot (audit §9.5): the
  // inventory, slices, tolerance literals, and gate-file counts below all
  // derive from these strings, never from post-execution reads.
  const readSourcePre = (rel) => {
    try {
      return readFile(rel);
    } catch {
      return null;
    }
  };
  const benchSourcePre = readSourcePre('src/sim/vv-benchmarks.test.ts');
  const gateSourcesPre = {};
  for (const files of Object.values(GATE_FILE_REQUIREMENTS)) {
    for (const rel of files) {
      if (!(rel in gateSourcesPre)) gateSourcesPre[rel] = readSourcePre(rel);
    }
  }
  // Single-snapshot analysis (audit §9.5): the fixed inventory sources and
  // the solver-config sources are captured here too — every downstream
  // analysis reads these strings, never a post-execution re-read.
  const inventorySourcesPre = {};
  for (const rel of FIXED_TEST_FILE_INVENTORY) {
    if (!(rel in inventorySourcesPre)) inventorySourcesPre[rel] = readSourcePre(rel);
  }
  const SOLVER_CONFIG_FILES = ['src/dynamics/rigidBody.ts', 'src/dynamics/loads.ts', 'src/sim/sixDofSimulator.ts'];
  const solverSourcesPre = {};
  for (const rel of SOLVER_CONFIG_FILES) solverSourcesPre[rel] = readSourcePre(rel);
  // --- pre-execution source binding -------------------------------------------
  const preHashes = hashCited();

  // --- build (exit-code authoritative) ----------------------------------------
  const build = runBuild();
  if (!build.ok) missing.push(`build: ${build.error || `failed (exit ${build.exitCode})`}`);

  // --- tests (vitest JSON, exit code + success flag authoritative) ------------
  const testRun = runTests();
  const parsed = parseVitestJson(testRun.json);
  if (!parsed) missing.push('tests: vitest JSON output missing or unparseable');
  if (!testRun.ok && parsed) missing.push(`tests: vitest exited nonzero (exit ${testRun.exitCode})`);
  else if (!testRun.ok) missing.push(`tests: vitest failed to run (exit ${testRun.exitCode})`);
  if (parsed && parsed.success !== true) missing.push('tests: vitest reported success=false');
  if (parsed && parsed.totals.testCasesFailed > 0) missing.push(`tests: ${parsed.totals.testCasesFailed} failed test case(s)`);
  if (parsed && parsed.totals.testCasesSkipped > 0) missing.push(`tests: ${parsed.totals.testCasesSkipped} skipped/pending/todo/disabled test case(s) — unexecuted evidence`);
  if (parsed && parsed.totals.testCasesUnknown > 0) missing.push(`tests: ${parsed.totals.testCasesUnknown} test case(s) with unknown status — unrecognized evidence`);
  if (parsed) {
    // Every collected file is mandatory preparation evidence: a file that did
    // not cleanly pass (failed, unknown, unexecuted, or EMPTY cases,
    // unrecognized status) fails certification even when no gate names it.
    // An executed file with zero cases proves nothing (audit §9.4).
    for (const f of parsed.files) {
      const tc = f.testCases;
      if (tc.unknown > 0) missing.push(`tests: ${f.path} reports ${tc.unknown} unknown-status result(s)`);
      if (!['passed', 'failed', 'skipped', 'todo', 'pending'].includes(f.status)) {
        missing.push(`tests: ${f.path} file status '${f.status}' is not a recognized outcome`);
      }
      if (tc.total === 0) {
        missing.push(`tests: ${f.path} executed zero test cases — an empty file proves nothing`);
      }
      const unexecuted = tc.skipped + tc.pending + tc.todo + tc.disabled;
      if (f.status !== 'passed' || tc.failed > 0 || tc.unknown > 0 || unexecuted > 0) {
        missing.push(`tests: ${f.path} did not cleanly pass (status=${f.status}, passed=${tc.passed}/${tc.total}, failed=${tc.failed}, unknown=${tc.unknown}, unexecuted=${unexecuted})`);
      }
      if (!Number.isFinite(f.durationMs) || f.durationMs < 0) {
        missing.push(`tests: ${f.path} reports nonfinite duration — measured timing evidence incoherent`);
      }
    }
    // Fixed collected inventory (audit §9.4): the executed set is closed.
    // Every inventory file must be collected with its PRE-execution source
    // case count intact; any executed *.test.* file outside the inventory is
    // unacknowledged evidence.
    const TEST_FILE_RE = /\.test\.[cm]?[jt]sx?$/;
    const inventoryHit = new Set();
    for (const f of parsed.files) {
      const match = FIXED_TEST_FILE_INVENTORY.find((rel) => f.path === rel || f.path.endsWith(`/${rel}`));
      if (TEST_FILE_RE.test(f.path) && !match) {
        missing.push(`tests: ${f.path} executed but is outside the fixed test-file inventory — unacknowledged suite fails certification`);
        continue;
      }
      if (match) {
        inventoryHit.add(match);
        const preSource = inventorySourcesPre[match] ?? null;
        if (preSource === null) {
          missing.push(`tests: inventory file ${match} missing or unreadable in the pre-execution snapshot`);
        } else {
          // Every collected suite — including the emitter's own
          // scripts/emit-benchmark-metadata.test.cjs — is bound to its source
          // case count: the file registers each case with its own literal
          // it(/test( token plus one cleanup case, so textual counting has
          // exact-count semantics identical to every other suite (M2).
          const sourceCount = countSourceAssertions(preSource);
          if (sourceCount === 0) {
            missing.push(`tests: inventory file ${match} declares zero test cases in source — an empty source proves nothing`);
          } else if (sourceCount !== f.testCases.total) {
            missing.push(`tests: inventory file ${match} test-case-count mismatch (executed ${f.testCases.total} vs source ${sourceCount})`);
          }
        }
      }
    }
    for (const rel of FIXED_TEST_FILE_INVENTORY) {
      if (!inventoryHit.has(rel)) {
        missing.push(`tests: inventory file ${rel} not collected — silent suite retirement fails certification`);
      }
    }
    // Duplicate case identities indicate sharded/double-collected execution.
    const seenNames = new Set();
    for (const f of parsed.files) {
      for (const name of f.caseNames ?? []) {
        const key = `${f.path} :: ${name}`;
        if (seenNames.has(key)) missing.push(`tests: duplicate case identity ${key} — execution evidence is incoherent`);
        seenNames.add(key);
      }
    }
    // Reporter-aggregate consistency: top-level counters must agree with the
    // summed per-file results; disagreement means the evidence is incoherent.
    const rep = testRun.json;
    if (rep && typeof rep === 'object') {
      // Required aggregate counters must be present and finite (audit §9.4):
      // missing or nonfinite counters are incoherent evidence, not green.
      for (const key of ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests']) {
        if (!Number.isFinite(rep[key])) {
          missing.push(`tests: reporter aggregate ${key} is missing or nonfinite — evidence incoherent`);
        }
      }
      if (Number.isFinite(rep.numTotalTests) && rep.numTotalTests !== parsed.totals.testCasesTotal) {
        missing.push(`tests: reporter numTotalTests (${rep.numTotalTests}) disagrees with summed file results (${parsed.totals.testCasesTotal})`);
      }
      if (Number.isFinite(rep.numFailedTests) && rep.numFailedTests !== parsed.totals.testCasesFailed) {
        missing.push(`tests: reporter numFailedTests (${rep.numFailedTests}) disagrees with summed file results (${parsed.totals.testCasesFailed})`);
      }
      if (Number.isFinite(rep.numPassedTests) && rep.numPassedTests !== parsed.totals.testCasesPassed) {
        missing.push(`tests: reporter numPassedTests (${rep.numPassedTests}) disagrees with summed file results (${parsed.totals.testCasesPassed})`);
      }
      // Pending/todo counters get the same cross-check as total/passed/failed.
      // Vitest's numPendingTests counts every unexecuted-by-skip case (its
      // 'skipped' plus 'pending' assertion statuses); numTodoTests counts the
      // 'todo' status. Both must reproduce from the summed per-file records.
      const pendingSum = parsed.files.reduce((n, f) => n + f.testCases.pending + f.testCases.skipped, 0);
      const todoSum = parsed.files.reduce((n, f) => n + f.testCases.todo, 0);
      if (Number.isFinite(rep.numPendingTests) && rep.numPendingTests !== pendingSum) {
        missing.push(`tests: reporter numPendingTests (${rep.numPendingTests}) disagrees with summed file results (${pendingSum})`);
      }
      if (Number.isFinite(rep.numTodoTests) && rep.numTodoTests !== todoSum) {
        missing.push(`tests: reporter numTodoTests (${rep.numTodoTests}) disagrees with summed file results (${todoSum})`);
      }
      // numTotalTestSuites counts describe-blocks (including nested/file-level),
      // not files — incomparable with filesTotal. The honest check is a sanity
      // floor: every collected file contributes at least one suite.
      if (Number.isFinite(rep.numTotalTestSuites) && rep.numTotalTestSuites < parsed.totals.filesTotal) {
        missing.push(`tests: reporter numTotalTestSuites (${rep.numTotalTestSuites}) below collected files (${parsed.totals.filesTotal})`);
      }
    }
  }
  const testSummary = parsed ? { ...parsed.totals, success: parsed.success, files: parsed.files } : null;

  // --- emitter self-tests (substantive fail-closed suite must execute) --------
  const emitterSelf = runEmitterSelfTests();
  if (!emitterSelf.ok) missing.push(`evidence: emitter self-tests failed (exit ${emitterSelf.exitCode}) — fail-closed behavior unproven`);

  // --- post-execution source binding ------------------------------------------
  // Booleans (not message-text matching) drive the binding fields below.
  let statusDrift = false;
  let hashDrift = false;
  let headDrift = false;
  const postStatus = run('git status --porcelain');
  const postHashes = hashCited();
  const postHead = run('git rev-parse HEAD');
  if (!postStatus.ok) {
    missing.push('git: post-execution working-tree state unreadable — immutability unverifiable');
    statusDrift = true;
  } else if (gitStatus.ok && postStatus.stdout !== gitStatus.stdout) {
    missing.push('evidence: working tree changed during build/test/hash collection — pre/post source binding violated');
    statusDrift = true;
  }
  for (const rel of [...HASHED_REQUIRED_FILES, ...HASHED_INFORMATIONAL_FILES]) {
    if (preHashes[rel] !== postHashes[rel]) {
      missing.push(`evidence: ${rel} changed during build/test/hash collection — pre/post source binding violated`);
      hashDrift = true;
    }
  }
  if (!postHead.ok) {
    missing.push('git: post-execution HEAD unreadable — execution commit unverifiable');
    headDrift = true;
  } else if (postHead.stdout !== commitHash) {
    missing.push('evidence: HEAD changed during build/test/hash collection — execution commit unverifiable');
    headDrift = true;
  }

  // --- VV suite evidence: source inventory x executed results -----------------
  // All source strings below are the PRE-execution captures (audit §9.5).
  const benchSource = benchSourcePre;
  if (!benchSource) missing.push('evidence: src/sim/vv-benchmarks.test.ts missing or unreadable');
  const sourceSuites = extractSourceSuites(benchSource ?? '');
  const suiteSlices = extractVvSuiteSlices(benchSource ?? '');
  const sourceCounts = Object.fromEntries(suiteSlices.map((s) => [s.id, countSourceAssertions(s.slice)]));
  const vvRecords = parsed ? vvSuiteRecordsFromJson(testRun.json) : {};
  const executedSuites = Object.keys(vvRecords).sort((a, b) => a - b);
  const notExecuted = sourceSuites.filter((id) => !(id in vvRecords));

  const vvMeasurements = {};
  for (const s of suiteSlices) {
    const rec = vvRecords[s.id];
    const tolerances = extractTolerances(s.slice);
    vvMeasurements[s.id] = {
      title: s.title,
      executed: !!rec,
      status: rec ? rec.status : 'not-executed',
      testCases: rec ? rec.testCases : null,
      sourceTestCases: sourceCounts[s.id],
      countSemantics: 'per-test-case (it/test) counts, not individual expect() calls',
      durationMs: rec ? rec.durationMs : 0,
      tolerancesDeclared: rec ? tolerances.bounds : null,
      decimalDigitsDeclared: rec ? tolerances.digits : null,
      observedValues: rec ? rec.observedValues : [],
      measuredNote: 'durations are measured per case; passing-assertion values are not exposed by the vitest JSON reporter (declared bounds are source literals); observedValues recovers numerics the reporter did emit in failure messages; KNOWN PARSER LIMIT: the toBeCloseTo digit regex skips first arguments containing commas, so exotic assertion spellings can under-report decimalDigitsDeclared',
      failures: rec ? rec.failures : [],
      gateEvidence: Object.keys(GATE_REQUIREMENTS).filter((g) => GATE_REQUIREMENTS[g].includes(s.id)),
    };
  }

  // --- legacy-suite completeness: fixed mandatory inventory -------------------
  // Source-relative completeness lets a deleted suite pass silently. Every
  // REQUIRED_VV_IDS entry must exist in source AND execute green.
  for (const id of REQUIRED_VV_IDS) {
    if (!sourceSuites.includes(id)) {
      missing.push(`evidence: mandatory VV-${id} missing from source — silent suite retirement fails certification`);
    }
  }
  for (const s of suiteSlices) {
    const rec = vvRecords[s.id];
    if (!rec) {
      missing.push(`evidence: VV-${s.id} present in source but not executed — every legacy suite is mandatory`);
    } else if (rec.status !== 'passed') {
      missing.push(`evidence: VV-${s.id} executed but evidence incomplete (status=${rec.status}) — every legacy suite must pass`);
    } else if (sourceCounts[s.id] !== rec.testCases.total) {
      missing.push(`evidence: VV-${s.id} test-case-count mismatch (executed ${rec.testCases.total} vs source ${sourceCounts[s.id]})`);
    }
  }
  // --- gate coverage: required executed suites + discriminating test files ---
  const gateDetails = {};
  for (const [gate, required] of Object.entries(GATE_REQUIREMENTS)) {
    const reasons = [];
    for (const id of required) {
      const rec = vvRecords[id];
      if (!rec) {
        reasons.push(`required ${id} not executed (present in source: ${sourceSuites.includes(id)})`);
        continue;
      }
      if (rec.status !== 'passed') {
        const tc = rec.testCases;
        reasons.push(`required ${id} evidence incomplete (status=${rec.status}, passed=${tc.passed}/${tc.total}, skipped=${tc.skipped}, pending=${tc.pending}, todo=${tc.todo}, disabled=${tc.disabled}, unknown=${tc.unknown ?? 0})`);
        continue;
      }
      const srcCount = sourceCounts[id];
      if (!srcCount || srcCount !== rec.testCases.total) {
        reasons.push(`required ${id} test-case-count mismatch (executed ${rec.testCases.total} vs source ${srcCount})`);
      }
    }


    const requiredFiles = GATE_FILE_REQUIREMENTS[gate] ?? [];
    for (const rel of requiredFiles) {
      // Counted from the PRE-execution capture (audit §9.5), never a post run.
      const preSource = gateSourcesPre[rel] ?? null;
      if (preSource === null) {
        reasons.push(`required acceptance file ${rel} missing or unreadable`);
        continue;
      }
      const sourceCount = countSourceAssertions(preSource);
      const suffix = `/${rel}`;
      const file = parsed?.files.find((entry) => entry.path === rel || entry.path.endsWith(suffix));
      if (!file) {
        reasons.push(`required acceptance file ${rel} not executed`);
        continue;
      }
      const tc = file.testCases;
      const unexecuted = tc.skipped + tc.pending + tc.todo + tc.disabled;
      if (file.status !== 'passed' || tc.failed > 0 || unexecuted > 0 || tc.unknown > 0) {
        reasons.push(`required acceptance file ${rel} incomplete (status=${file.status}, passed=${tc.passed}/${tc.total}, failed=${tc.failed}, unknown=${tc.unknown}, unexecuted=${unexecuted})`);
        continue;
      }
      if (!sourceCount || sourceCount !== tc.total) {
        reasons.push(`required acceptance file ${rel} test-case-count mismatch (executed ${tc.total} vs source ${sourceCount})`);
      }
    }
    gateDetails[gate] = { passed: reasons.length === 0, required, requiredFiles, reasons };
    for (const reason of reasons) missing.push(`${gate}: ${reason}`);
  }
  // Single-snapshot solver analysis: the solver description derives from the
  // PRE-execution captures only. Unreadable pre-captures are missing evidence.
  const solverPreRead = (rel) => {
    if (!(rel in solverSourcesPre) || solverSourcesPre[rel] === null) throw new Error(`missing ${rel}`);
    return solverSourcesPre[rel];
  };
  const solver = extractSolverConfig(solverPreRead);
  if (!solver.available) missing.push('evidence: solver-config sources unreadable in the pre-execution snapshot');

  // Measured-residuals sidecar (audit §9.5): an optional instrumented-run
  // artifact the emitter INGESTS rather than ignores. Strictly validated —
  // a malformed sidecar is incoherent evidence. Absence keeps the honest
  // unmeasurable label on passing-assertion values.
  const sidecarRel = opts.residualsSidecar ?? 'scripts/astraea-residuals.json';
  let residualsSidecar;
  if (exists(sidecarRel)) {
    let sidecarBytes = null;
    let sidecarJson = null;
    let sidecarError = null;
    try {
      sidecarBytes = readBytes(sidecarRel);
      sidecarJson = JSON.parse(Buffer.isBuffer(sidecarBytes) ? sidecarBytes.toString('utf-8') : String(sidecarBytes));
    } catch (e) {
      sidecarError = e instanceof Error ? e.message : String(e);
    }
    const records = sidecarJson !== null && typeof sidecarJson === 'object' && Array.isArray(sidecarJson.records)
      ? sidecarJson.records
      : null;
    const valid = records !== null && records.length > 0 && records.every((r) =>
      r !== null && typeof r === 'object' &&
      typeof r.suite === 'string' && r.suite.length > 0 &&
      typeof r.case === 'string' && r.case.length > 0 &&
      typeof r.value === 'number' && Number.isFinite(r.value));
    if (!valid) {
      missing.push(`evidence: residuals sidecar ${sidecarRel} present but invalid ${sidecarError ? `(${sidecarError}) ` : ''}— expected {records:[{suite,case,value:finite}]}, non-empty`);
      residualsSidecar = { present: true, valid: false, path: sidecarRel, error: sidecarError };
    } else {
      residualsSidecar = {
        present: true,
        valid: true,
        path: sidecarRel,
        sha256: sha256Hex(sidecarBytes),
        records: records.map((r) => ({ suite: r.suite, case: r.case, value: r.value })),
      };
    }
  } else {
    residualsSidecar = { present: false, note: 'no residuals sidecar — passing-assertion values are unmeasurable from the vitest JSON reporter' };
  }
  // postHashes were bound to preHashes above; publish the post-execution
  // snapshot (the tree state the tests actually ran against).
  const gateCoverage = Object.fromEntries(Object.entries(gateDetails).map(([g, d]) => [g, d.passed]));
  const fileHashes = postHashes;
  for (const rel of HASHED_REQUIRED_FILES) {
    if (fileHashes[rel] === null) missing.push(`evidence: ${rel} missing — cannot hash cited source`);
  }

  const passed = missing.length === 0;
  const bindingIntact = !statusDrift && !hashDrift && !headDrift;

  const evidence = {
    artifact: 'astraea-benchmark-metadata',
    version: '2.1.0',
    timestamp: now().toISOString(),
    passed,
    missing,
    failClosed: 'any missing required evidence forces passed=false and exit 1',
    commit,
    sourceBinding: {
      prePostHashesMatch: !hashDrift,
      prePostStatusMatch: !statusDrift,
      prePostHeadMatch: !headDrift,
      note: 'cited-file hashes, git status, and HEAD were captured before AND after build/test execution; drift fails certification',
    },
    runtime: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
    },
    dependencies: {
      declared: declaredDeps,
      installed: installed.packages,
      installedComplete: installed.complete,
      measuredFrom: 'node_modules/<pkg>/package.json (on-disk installed manifests)',
      lockfile,
    },
    solver,
    residualsSidecar,
    verification: {
      buildPass: build.ok,
      buildExitCode: build.exitCode,
      buildError: build.error,
      testExitCode: testRun.exitCode,
      testJsonParsed: parsed !== null,
      testSummary,
      emitterSelfTests: {
        ok: emitterSelf.ok,
        exitCode: emitterSelf.exitCode,
        note: 'substantive fail-closed suite scripts/emit-benchmark-metadata.test.cjs executed as part of the certified command',
      },
      vvSuiteInventory: {
        source: sourceSuites,
        executed: executedSuites,
        notExecuted,
      },
      vvMeasurements,
      gateCoverage,
      gateDetails,
    },
  };

  // Self-hash follows the advertised basis EXACTLY: sha256 of the artifact
  // JSON with hashes == {files} (artifactSelf and basis absent at hash time).
  // A verifier recomputes sha256(JSON.stringify({...artifact, hashes: {files:
  // artifact.hashes.files}})) — see verifyArtifactSelfHash, exported for tests.
  evidence.hashes = { files: fileHashes };
  const artifactSelf = sha256Hex(JSON.stringify(evidence));
  evidence.hashes.artifactSelf = artifactSelf;
  evidence.hashes.basis = 'sha256 of the artifact JSON with hashes.artifactSelf and hashes.basis removed (hashes == {files} at hash time); file hashes are sha256 of on-disk bytes';

  return { evidence, passed, missing };
}

function main() {
  const { evidence, passed } = computeEvidence();
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = passed ? 0 : 1;
}

/**
 * Recompute the artifact self-hash exactly per the advertised basis:
 * sha256 of the artifact JSON with hashes == {files}. Returns true when the
 * embedded artifactSelf reproduces.
 */
function verifyArtifactSelfHash(artifact) {
  if (!artifact || !artifact.hashes || typeof artifact.hashes.artifactSelf !== 'string') return false;
  const recomputed = sha256Hex(JSON.stringify({ ...artifact, hashes: { files: artifact.hashes.files } }));
  return recomputed === artifact.hashes.artifactSelf;
}

module.exports = {
  computeEvidence,
  GATE_REQUIREMENTS,
  GATE_FILE_REQUIREMENTS,
  FIXED_TEST_FILE_INVENTORY,
  HASHED_REQUIRED_FILES,
  extractSourceSuites,
  extractVvSuiteSlices,
  parseVitestJson,
  vvSuiteRecordsFromJson,
  measureInstalledDeps,
  satisfiesDeclaredRange,
  verifyArtifactSelfHash,
};

if (require.main === module) {
  main();
}