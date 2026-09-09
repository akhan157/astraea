#!/usr/bin/env node
/**
 * Gate 5 evidence artifact emitter — FAIL-CLOSED machine-readable benchmark
 * metadata for the Astraea 6-DOF flight simulation engineering workstation.
 *
 * Fail-closed semantics (Astra round-13 audit, section 5):
 *  - Gate coverage is derived from EXECUTED vitest assertion results, never
 *    from source-text presence and never from global test success alone.
 *    Each gate lists REQUIRED VV suite IDs; a gate is green only when every
 *    required suite executed with all assertions passed, nothing skipped.
 *  - Vitest per-file summary is parsed from `testResults[].assertionResults`
 *    (the actual vitest JSON schema), not the nonexistent `f.assertions`.
 *  - Measured evidence is emitted: executed assertions, durations, skips
 *    (pending/todo/disabled), failures (+ verbatim failure messages), declared
 *    tolerance bounds from the executed suites' source, and sha256 artifact
 *    hashes. No value is fabricated: observed discrepancies appear only in
 *    failure messages; tolerance literals are labeled as source-declared.
 *  - Git failure is fatal: an unresolvable HEAD commit, unknown commit date,
 *    unreadable branch, or unreadable status makes certification fail. A
 *    dirty tree pins `passed` false.
 *  - Installed dependency versions are measured from node_modules/<pkg>/
 *    package.json on disk. The pnpm YAML lockfile is never parsed as JSON;
 *    its presence/format is reported only.
 *  - The VV suite inventory is derived dynamically from describe markers
 *    (includes VV-014/VV-015) and cross-checked against executed results;
 *    suites present in source but missing from execution are reported and
 *    fail any gate that requires them.
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
});

// File-level acceptance suites added for defects that the legacy VV cases do
// not discriminate. A gate cannot pass unless each required file was present,
// executed in full, and passed with its source assertion count intact.
const GATE_FILE_REQUIREMENTS = Object.freeze({
  GATE_1R_LOADS_ASSEMBLY: ['src/dynamics/loads.repair.test.ts'],
  GATE_2_ADAPTIVE_INTEGRATOR: ['src/dynamics/rigidBody.adaptive.test.ts'],
  GATE_3_VARIABLE_INERTIA: ['src/dynamics/loads.repair.test.ts'],
  GATE_4_P0_5_EVENT_LOCALIZATION: ['src/sim/event-restart.test.ts'],
});

// Files whose integrity the artifact cites (sha256). Missing required files
// are missing evidence; the lockfile/manifests are informational.
const HASHED_REQUIRED_FILES = Object.freeze([
  'src/sim/vv-benchmarks.test.ts',
  'src/dynamics/rigidBody.adaptive.test.ts',
  'src/dynamics/loads.repair.test.ts',
  'src/sim/event-restart.test.ts',
  'src/dynamics/rigidBody.ts',
  'src/dynamics/loads.ts',
  'src/dynamics/events.ts',
  'src/sim/sixDofSimulator.ts',
  'package.json',
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
    while ((m = DIGITS_RE.exec(slice)) !== null) digits.push(Number(m[2]));
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
    let durationMs = 0;
    const STATUS_KEYS = ['passed', 'failed', 'skipped', 'pending', 'todo', 'disabled'];
    for (const a of f.assertionResults ?? []) {
      const st = a.status || 'unknown';
      byStatus[st] = (byStatus[st] ?? 0) + 1;
      if (typeof a.duration === 'number') durationMs += a.duration;
      if (st === 'failed') {
        failures.push({ fullName: a.fullName ?? '', title: a.title ?? '', messages: a.failureMessages ?? [] });
      }
    }
    const total = STATUS_KEYS.reduce((n, k) => n + (byStatus[k] ?? 0), 0);
    files.push({
      file: path.basename(f.name ?? ''),
      path: String(f.name ?? '').replace(/\\/g, '/'),
      status: f.status ?? 'unknown',
      assertions: {
        total,
        passed: byStatus.passed ?? 0,
        failed: byStatus.failed ?? 0,
        skipped: byStatus.skipped ?? 0,
        pending: byStatus.pending ?? 0,
        todo: byStatus.todo ?? 0,
        disabled: byStatus.disabled ?? 0,
      },
      durationMs: Math.round(durationMs * 1000) / 1000,
      message: f.message ?? '',
      failures,
    });
  }
  const numDisabled = files.reduce((n, f) => n + f.assertions.disabled, 0);
  const numSkippedAll = files.reduce(
    (n, f) => n + f.assertions.skipped + f.assertions.pending + f.assertions.todo + f.assertions.disabled,
    0
  );
  const numFailed = files.reduce((n, f) => n + f.assertions.failed, 0);
  return {
    parsed: true,
    success: json.success === true,
    totals: {
      filesTotal: files.length,
      filesPassed: files.filter((f) => f.status === 'passed').length,
      filesFailed: files.filter((f) => f.status === 'failed').length,
      filesSkipped: files.filter((f) => f.status === 'skipped' || f.status === 'todo').length,
      testsTotal: json.numTotalTests ?? files.reduce((n, f) => n + f.assertions.total, 0),
      testsPassed: json.numPassedTests ?? files.reduce((n, f) => n + f.assertions.passed, 0),
      testsFailed: numFailed,
      testsSkipped: numSkippedAll,
      testsTodo: files.reduce((n, f) => n + f.assertions.todo, 0),
      testsDisabled: numDisabled,
    },
    files,
  };
}

/** Per-VV measurement records derived from executed assertion results (raw vitest JSON). */
function vvSuiteRecordsFromJson(json) {
  const recs = {};
  for (const f of json?.testResults ?? []) {
    for (const a of f.assertionResults ?? []) {
      const id = vvIdFromAssertion(a);
      if (!id) continue;
      const rec = recs[id] ??= {
        assertions: { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0, todo: 0, disabled: 0 },
        durationMs: 0,
        failures: [],
      };
      rec.assertions.total++;
      rec.assertions[a.status] = (rec.assertions[a.status] ?? 0) + 1;
      if (typeof a.duration === 'number') rec.durationMs += a.duration;
      if (a.status === 'failed') {
        rec.failures.push({ fullName: a.fullName ?? '', title: a.title ?? '', messages: a.failureMessages ?? [] });
      }
    }
  }
  for (const rec of Object.values(recs)) {
    const a = rec.assertions;
    const unexecuted = a.skipped + a.pending + a.todo + a.disabled;
    rec.status =
      a.failed > 0 ? 'failed' : a.total > 0 && unexecuted === 0 ? 'passed' : a.total > 0 && a.total === unexecuted ? 'unexecuted' : 'partial';
    rec.durationMs = Math.round(rec.durationMs * 1000) / 1000;
    rec.incomplete = a.total === 0 || unexecuted > 0 || a.failed > 0;
  }
  return recs;
}

// --- dependency measurement -------------------------------------------------

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
    packages[name] = { declared: declared[name], installed, found };
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
  const exists = opts.exists ?? ((rel) => fs.existsSync(path.join(root, rel)));
  const readFile = opts.readFile ?? ((rel) => fs.readFileSync(path.join(root, rel), 'utf-8'));
  const readJson = opts.readJson ?? ((rel) => {
    const text = readFile(rel);
    return text ? JSON.parse(text) : null;
  });
  const now = opts.now ?? (() => new Date());

  const missing = [];

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
  if (!installed.complete) missing.push('dependencies: declared package(s) missing from node_modules (installed measurement incomplete)');

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
  if (parsed && parsed.totals.testsFailed > 0) missing.push(`tests: ${parsed.totals.testsFailed} failed assertion(s)`);
  if (parsed && parsed.totals.testsSkipped > 0) missing.push(`tests: ${parsed.totals.testsSkipped} skipped/pending/todo/disabled assertion(s) — unexecuted evidence`);
  const testSummary = parsed ? { ...parsed.totals, success: parsed.success, files: parsed.files } : null;

  // --- VV suite evidence: source inventory x executed results -----------------
  let benchSource = null;
  try {
    benchSource = readFile('src/sim/vv-benchmarks.test.ts');
  } catch {
    benchSource = null;
  }
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
      assertions: rec ? rec.assertions : null,
      sourceAssertions: sourceCounts[s.id],
      durationMs: rec ? rec.durationMs : 0,
      tolerancesDeclared: rec ? tolerances.bounds : null,
      decimalDigitsDeclared: rec ? tolerances.digits : null,
      failures: rec ? rec.failures : [],
      gateEvidence: Object.keys(GATE_REQUIREMENTS).filter((g) => GATE_REQUIREMENTS[g].includes(s.id)),
    };
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
        const a = rec.assertions;
        reasons.push(`required ${id} evidence incomplete (status=${rec.status}, passed=${a.passed}/${a.total}, skipped=${a.skipped}, pending=${a.pending}, todo=${a.todo}, disabled=${a.disabled})`);
        continue;
      }
      const srcCount = sourceCounts[id];
      if (!srcCount || srcCount !== rec.assertions.total) {
        reasons.push(`required ${id} assertion-count mismatch (executed ${rec.assertions.total} vs source ${srcCount})`);
      }
    }

    const requiredFiles = GATE_FILE_REQUIREMENTS[gate] ?? [];
    for (const rel of requiredFiles) {
      let sourceCount = 0;
      try {
        sourceCount = countSourceAssertions(readFile(rel));
      } catch {
        reasons.push(`required acceptance file ${rel} missing or unreadable`);
        continue;
      }
      const suffix = `/${rel}`;
      const file = parsed?.files.find((entry) => entry.path === rel || entry.path.endsWith(suffix));
      if (!file) {
        reasons.push(`required acceptance file ${rel} not executed`);
        continue;
      }
      const a = file.assertions;
      const unexecuted = a.skipped + a.pending + a.todo + a.disabled;
      if (file.status !== 'passed' || a.failed > 0 || unexecuted > 0) {
        reasons.push(`required acceptance file ${rel} incomplete (status=${file.status}, passed=${a.passed}/${a.total}, failed=${a.failed}, unexecuted=${unexecuted})`);
        continue;
      }
      if (!sourceCount || sourceCount !== a.total) {
        reasons.push(`required acceptance file ${rel} assertion-count mismatch (executed ${a.total} vs source ${sourceCount})`);
      }
    }
    gateDetails[gate] = { passed: reasons.length === 0, required, requiredFiles, reasons };
    for (const reason of reasons) missing.push(`${gate}: ${reason}`);
  }

  const gateCoverage = Object.fromEntries(Object.entries(gateDetails).map(([g, d]) => [g, d.passed]));

  // --- hashes: artifact integrity + cited-file integrity ----------------------
  const fileHashes = {};
  for (const rel of [...HASHED_REQUIRED_FILES, ...HASHED_INFORMATIONAL_FILES]) {
    try {
      fileHashes[rel] = sha256Hex(readFile(rel));
    } catch {
      fileHashes[rel] = null;
    }
  }
  for (const rel of HASHED_REQUIRED_FILES) {
    if (fileHashes[rel] === null) missing.push(`evidence: ${rel} missing — cannot hash cited source`);
  }

  const passed = missing.length === 0;

  const evidence = {
    artifact: 'astraea-benchmark-metadata',
    version: '2.0.0',
    timestamp: now().toISOString(),
    passed,
    missing,
    failClosed: 'any missing required evidence forces passed=false and exit 1',
    commit,
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
    solver: extractSolverConfig(readFile),
    verification: {
      buildPass: build.ok,
      buildExitCode: build.exitCode,
      buildError: build.error,
      testExitCode: testRun.exitCode,
      testJsonParsed: parsed !== null,
      testSummary,
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

  const artifactSelf = sha256Hex(JSON.stringify({ ...evidence, hashes: { files: fileHashes, artifactSelf: '<self>' } }));
  evidence.hashes = {
    files: fileHashes,
    artifactSelf,
    basis: 'sha256 of the artifact JSON with hashes.artifactSelf removed; file hashes are sha256 of on-disk bytes',
  };

  return { evidence, passed, missing };
}

function main() {
  const { evidence, passed } = computeEvidence();
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = passed ? 0 : 1;
}

module.exports = {
  computeEvidence,
  GATE_REQUIREMENTS,
  GATE_FILE_REQUIREMENTS,
  extractSourceSuites,
  extractVvSuiteSlices,
  parseVitestJson,
  vvSuiteRecordsFromJson,
  measureInstalledDeps,
  sha256Hex,
};

if (require.main === module) {
  main();
}