#!/usr/bin/env node
/**
 * Fail-closed behavior tests for scripts/emit-benchmark-metadata.cjs.
 *
 * Runs against synthetic fixture trees with injected git/build/vitest runners,
 * so no network, no pnpm, no real tests, and no repo mutation. Each case
 * asserts the observable contract:
 *   - gates green only from EXECUTED required-suite assertion results;
 *   - missing required evidence or git failure => passed=false (exit 1);
 *   - vitest JSON parsed from `assertionResults` (not `f.assertions`);
 *   - installed deps measured from node_modules (YAML lockfile never read as
 *     JSON); dynamic VV inventory includes VV-014/VV-015.
 *
 * Usage: node scripts/emit-benchmark-metadata.test.cjs   (exit 0 = all pass)
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { computeEvidence, extractSourceSuites, parseVitestJson } = require('./emit-benchmark-metadata.cjs');

// The repo's vitest run collects this file (default include glob). Keep it
// inert-but-valid there: register one passing container test so the run is
// not polluted with a "no test suite found" failure. The real evidence tests
// execute only when run directly: `node scripts/emit-benchmark-metadata.test.cjs`.
if (process.env.VITEST) {
  const { describe, it, expect } = globalThis;
  describe('scripts/emit-benchmark-metadata.test.cjs (node evidence suite)', () => {
    it('container marker — run the suite directly via node', () => {
      expect(true).toBe(true);
    });
  });
} else if (require.main === module) {
  runSuite();
}

module.exports = { runSuite };

function runSuite() {
const HASH = '480ee408f6b7213518356a58c2cdf13ede6cc90e';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const roots = [];
function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astraea-emitter-test-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
  return root;
}

function cleanup() {
  for (const r of roots) {
    try {
      fs.rmSync(r, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

const BASE_PKG = JSON.stringify(
  {
    name: 'astraea-fixture',
    dependencies: { three: '^0.185.1' },
    devDependencies: { vitest: '^5.0.0' },
  },
  null,
  2
);

const BASE_SOURCE = [
  "describe('VV-004 Galilean Invariance of Aero Loads (production loads assembly)', () => {",
  "  it('loads are frame independent', () => { expect(Math.abs(x)).toBeLessThanOrEqual(1e-9); });",
  '});',
  "describe('VV-007 Production Solver Linkage', () => {",
  "  it('simulator executes', () => { expect(ok).toBe(true); });",
  '});',
  "describe('VV-010 Coupled Rotating-Body-Force RK4 Convergence (loadsAt)', () => {",
  "  it('converges fourth order', () => { expect(err).toBeLessThanOrEqual(1e-2); });",
  '});',
  "describe('VV-012 Production Event Localization', () => {",
  "  it('localizes crossing', () => { expect(Math.abs(t - tExact)).toBeLessThanOrEqual(1e-5); });",
  '});',
  "describe('VV-013 Gate 3 Variable-Inertia Term', () => {",
  "  it('conserves angular momentum', () => { expect(relErr).toBeLessThanOrEqual(5e-3); });",
  '});',
  "describe('VV-014 Adaptive Integrator Termination + Convergence', () => {",
  "  it('terminates stationary', () => { expect(Math.abs(r.x - 5)).toBeLessThanOrEqual(1e-8); });",
  '});',
  "describe('VV-015 Production Descent Validation', () => {",
  "  it('reaches touchdown', () => { expect(v).toBeLessThan(10.0); });",
  '});',
  '',
].join('\n');

function baseFixture(over = {}) {
  const files = {
    'package.json': BASE_PKG,
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n",
    'node_modules/three/package.json': JSON.stringify({ name: 'three', version: '0.185.5' }),
    'node_modules/vitest/package.json': JSON.stringify({ name: 'vitest', version: '5.1.0' }),
    'src/sim/vv-benchmarks.test.ts': BASE_SOURCE,
    'src/sim/sixDofSimulator.ts': 'export function simulate6DofFlight() { return null; }\n',
    'src/dynamics/rigidBody.ts': 'export function integrateRigidStep() {}\nexport function integrateRigidAdaptive() {}\n',
    'src/dynamics/loads.ts': 'export const inertiaDotB = true;\n',
    'src/dynamics/events.ts': 'export const detectEvents = () => [];\n',
    'src/dynamics/rigidBody.adaptive.test.ts': "describe('adaptive acceptance', () => { it('covers candidate attitude and rejection', () => {}); });\n",
    'src/dynamics/loads.repair.test.ts': "describe('loads acceptance', () => { it('covers combined CG and load validity', () => {}); });\n",
    'src/sim/event-restart.test.ts': "describe('event acceptance', () => { it('covers root restart and ordering', () => {}); });\n",
    'vite.config.ts': 'export default {};\n',
    'tsconfig.json': '{}',
    ...over,
  };
  return fixture(files);
}

const REQUIRED_IDS = ['004', '007', '010', '012', '013', '014', '015'];

/** Minimal but schema-realistic vitest JSON mirroring the installed reporter. */
function makeVitestJson({
  omitVv = [],
  skipVv = [],
  failVv = [],
  omitFile = [],
  skipFile = [],
  failFile = [],
} = {}) {
  const vvAssertions = [];
  for (const id of REQUIRED_IDS) {
    if (omitVv.includes(id)) continue;
    const status = failVv.includes(id) ? 'failed' : skipVv.includes(id) ? 'pending' : 'passed';
    vvAssertions.push({
      ancestorTitles: [`VV-${id} Benchmark`],
      fullName: `VV-${id} Benchmark asserts bound`,
      status,
      title: 'asserts bound',
      duration: 1,
      failureMessages: status === 'failed' ? [`expected 0.9 to be less than or equal 0.1 (VV-${id})`] : [],
      meta: {},
      tags: [],
      benchmarks: [],
    });
  }

  const acceptanceFiles = [
    'src/dynamics/rigidBody.adaptive.test.ts',
    'src/dynamics/loads.repair.test.ts',
    'src/sim/event-restart.test.ts',
  ];
  const fileResults = acceptanceFiles
    .filter((rel) => !omitFile.includes(rel))
    .map((rel) => {
      const status = failFile.includes(rel) ? 'failed' : skipFile.includes(rel) ? 'pending' : 'passed';
      const assertion = {
        ancestorTitles: ['acceptance'],
        fullName: `acceptance ${rel}`,
        status,
        title: rel,
        duration: 1,
        failureMessages: status === 'failed' ? [`acceptance failure in ${rel}`] : [],
        meta: {},
        tags: [],
        benchmarks: [],
      };
      return {
        assertionResults: [assertion],
        status: status === 'failed' ? 'failed' : 'passed',
        message: status === 'failed' ? 'boom' : '',
        startTime: 0,
        endTime: 1,
        name: `C:/repo/${rel}`,
      };
    });

  const vvFailed = vvAssertions.some((assertion) => assertion.status === 'failed');
  const results = [
    {
      assertionResults: vvAssertions,
      status: vvFailed ? 'failed' : 'passed',
      message: vvFailed ? 'boom' : '',
      startTime: 0,
      endTime: 10,
      name: 'C:/repo/src/sim/vv-benchmarks.test.ts',
    },
    ...fileResults,
  ];
  const allResults = results.flatMap((result) => result.assertionResults);
  const failed = allResults.filter((assertion) => assertion.status === 'failed').length;
  const pending = allResults.filter((assertion) => assertion.status === 'pending').length;
  return {
    numTotalTestSuites: results.length,
    numPassedTestSuites: results.filter((result) => result.status === 'passed').length,
    numFailedTestSuites: results.filter((result) => result.status === 'failed').length,
    numPendingTestSuites: pending > 0 ? 1 : 0,
    numTotalTests: allResults.length,
    numPassedTests: allResults.length - failed - pending,
    numFailedTests: failed,
    numPendingTests: pending,
    numTodoTests: 0,
    snapshot: {},
    startTime: 0,
    success: failed === 0 && pending === 0,
    testResults: results,
  };
}

function gitStub({ hashOk = true, statusOut = '', statusOk = true } = {}) {
  return (cmd) => {
    if (cmd === 'git rev-parse HEAD') return { ok: hashOk, stdout: hashOk ? HASH : '' };
    if (cmd === 'git log -1 --format=%cI') return { ok: hashOk, stdout: hashOk ? '2026-09-09T00:00:00+00:00' : '' };
    if (cmd === 'git rev-parse --abbrev-ref HEAD') return { ok: hashOk, stdout: hashOk ? 'main' : '' };
    if (cmd === 'git status --porcelain') return { ok: statusOk, stdout: statusOut };
    return { ok: false, stdout: '' };
  };
}

function ctx(root, { run, runTests, vitestJson, buildOk = true, buildExit = 0 } = {}) {
  const json = vitestJson ?? {};
  return {
    root,
    run: run ?? gitStub(),
    runBuild: () => (buildOk ? { ok: true, exitCode: 0, error: null } : { ok: false, exitCode: buildExit, error: `build failed (exit ${buildExit})` }),
    runTests: runTests ?? (() => ({ ok: json.success === true, exitCode: json.success === true ? 0 : 1, json: vitestJson })),
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let passed = 0;
const failures = [];
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.error(`FAIL - ${name}`);
    console.error(e && e.stack ? e.stack : e);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

t('green path: all required suites executed+passed => passed, all gates true', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, true, `missing: ${JSON.stringify(missing)}`);
  assert.deepEqual(missing, []);
  assert.equal(evidence.passed, true);
  for (const g of Object.keys(require('./emit-benchmark-metadata.cjs').GATE_REQUIREMENTS)) {
    assert.equal(evidence.verification.gateCoverage[g], true, `gate ${g} should be green`);
  }
});

t('green path: artifact carries measured evidence fields', () => {
  const root = baseFixture();
  const { evidence } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(evidence.version, '2.0.0');
  assert.equal(evidence.commit.known, true);
  assert.equal(evidence.commit.treeState, 'clean');
  // skips + failures measured
  assert.equal(evidence.verification.testSummary.testsFailed, 0);
  assert.equal(evidence.verification.testSummary.testsSkipped, 0);
  // per-suite measured records: tolerances, counts, durations
  const v014 = evidence.verification.vvMeasurements['014'];
  assert.equal(v014.executed, true);
  assert.equal(v014.status, 'passed');
  assert.equal(v014.assertions.total, 1);
  assert.deepEqual(v014.tolerancesDeclared, [1e-8]);
  assert.equal(typeof v014.durationMs, 'number');
  assert.deepEqual(evidence.verification.vvSuiteInventory.executed, REQUIRED_IDS);
  // artifact hashes
  assert.match(evidence.hashes.artifactSelf, /^[0-9a-f]{64}$/);
  assert.match(evidence.hashes.files['src/sim/vv-benchmarks.test.ts'], /^[0-9a-f]{64}$/);
  assert.match(evidence.hashes.files['package.json'], /^[0-9a-f]{64}$/);
  // installed deps measured from node_modules manifests
  assert.equal(evidence.dependencies.installed.three.installed, '0.185.5');
  assert.equal(evidence.dependencies.installedComplete, true);
  assert.equal(evidence.dependencies.lockfile.format, 'pnpm-yaml');
});

t('dynamic inventory: source AND executed include VV-014/VV-015', () => {
  const src = BASE_SOURCE;
  const ids = extractSourceSuites(src);
  assert.ok(ids.includes('014'), 'VV-014 must be in source inventory');
  assert.ok(ids.includes('015'), 'VV-015 must be in source inventory');
  const root = baseFixture();
  const { evidence } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.ok(evidence.verification.vvSuiteInventory.source.includes('014'));
  assert.ok(evidence.verification.vvSuiteInventory.source.includes('015'));
  assert.deepEqual(evidence.verification.vvSuiteInventory.notExecuted, []);
});

t('missing required suite fails its gate (per-gate granularity), exit nonzero', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson({ omitVv: ['014'] }) }));
  assert.equal(ok, false);
  assert.equal(evidence.passed, false);
  assert.equal(evidence.verification.gateCoverage.GATE_2_ADAPTIVE_INTEGRATOR, false);
  assert.equal(evidence.verification.gateCoverage.GATE_3_VARIABLE_INERTIA, true, 'unaffected gate must stay green');
  assert.ok(evidence.verification.vvSuiteInventory.notExecuted.includes('014'), 'unexecuted suite must be reported');
  assert.ok(missing.some((m) => m.includes('GATE_2_ADAPTIVE_INTEGRATOR') && m.includes('014')), `missing: ${missing}`);
  const reason = evidence.verification.gateDetails.GATE_2_ADAPTIVE_INTEGRATOR.reasons.join('; ');
  assert.match(reason, /required 014 not executed/);
});

t('skipped required evidence fails gate and reports skip counts', () => {
  const root = baseFixture();
  const { evidence, passed: ok } = computeEvidence(ctx(root, { vitestJson: makeVitestJson({ skipVv: ['013'] }) }));
  assert.equal(ok, false);
  assert.equal(evidence.verification.testSummary.testsSkipped, 1);
  assert.equal(evidence.verification.gateCoverage.GATE_3_VARIABLE_INERTIA, false);
  const reason = evidence.verification.gateDetails.GATE_3_VARIABLE_INERTIA.reasons.join('; ');
  assert.match(reason, /pending=1/);
});

t('failed required assertion fails its gate and emits failure messages', () => {
  const root = baseFixture();
  const { evidence, passed: ok } = computeEvidence(ctx(root, { vitestJson: makeVitestJson({ failVv: ['012'] }) }));
  assert.equal(ok, false);
  assert.equal(evidence.verification.testSummary.testsFailed, 1);
  assert.equal(evidence.verification.gateCoverage.GATE_4_P0_5_EVENT_LOCALIZATION, false);
  assert.equal(evidence.verification.vvMeasurements['012'].failures.length, 1);
  assert.match(evidence.verification.vvMeasurements['012'].failures[0].messages[0], /expected 0.9/);
});

t('git failure => certification FAIL with unknown commit', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { run: gitStub({ hashOk: false, statusOk: false }), vitestJson: makeVitestJson() })
  );
  assert.equal(ok, false);
  assert.equal(evidence.commit.known, false);
  assert.equal(evidence.commit.hash, null);
  assert.equal(evidence.commit.treeState, 'unknown');
  assert.ok(missing.some((m) => m.includes('git: HEAD commit identity unknown')), `missing: ${missing}`);
});

t('dirty tree pins passed=false', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { run: gitStub({ statusOut: ' M docs/astra-round13-audit.md\n' }), vitestJson: makeVitestJson() })
  );
  assert.equal(ok, false);
  assert.equal(evidence.commit.treeState, 'dirty');
  assert.ok(missing.some((m) => m.includes('working tree is dirty')));
});

t('build failure fails certification', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson(), buildOk: false, buildExit: 2 }));
  assert.equal(ok, false);
  assert.equal(evidence.verification.buildPass, false);
  assert.ok(missing.some((m) => m.includes('build:')));
});

t('vitest per-file totals parsed from assertionResults, not f.assertions', () => {
  const json = makeVitestJson();
  assert.equal('assertions' in json.testResults[0], false, 'fixture must not carry the nonexistent f.assertions key');
  const parsed = parseVitestJson(json);
  assert.equal(parsed.files.length, 4);
  const vvFile = parsed.files.find((file) => file.file === 'vv-benchmarks.test.ts');
  assert.equal(vvFile.assertions.total, REQUIRED_IDS.length);
  assert.equal(vvFile.assertions.passed, REQUIRED_IDS.length);
  assert.equal(vvFile.assertions.failed, 0);
  assert.deepEqual(parsed.totals.testsPassed, REQUIRED_IDS.length + 3);
});

t('vitest JSON unparseable => certification fails', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { runTests: () => ({ ok: true, exitCode: 0, json: null }) })
  );
  assert.equal(ok, false);
  assert.equal(evidence.verification.testJsonParsed, false);
  assert.ok(missing.some((m) => m.includes('vitest JSON output missing')));
});

t('installed deps measured from node_modules, pnpm YAML lockfile never read as JSON', () => {
  const root = baseFixture(); // pnpm-lock.yaml is YAML text: JSON.parse would throw
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, true, `missing: ${missing}`);
  assert.equal(evidence.dependencies.installed.three.installed, '0.185.5');
  assert.equal(evidence.dependencies.lockfile.format, 'pnpm-yaml');
  assert.equal(evidence.dependencies.lockfile.present, true);
});

t('declared dep missing from node_modules => installed measurement incomplete => fail', () => {
  const root = baseFixture({
    'package.json': JSON.stringify({ name: 'x', dependencies: { three: '^0.185.1', ghost: '^1.0.0' } }, null, 2),
  });
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.equal(evidence.dependencies.installed.ghost.found, false);
  assert.equal(evidence.dependencies.installedComplete, false);
  assert.ok(missing.some((m) => m.includes('installed measurement incomplete')));
});

t('test run exit code nonzero => fail even if JSON looks green', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { runTests: () => ({ ok: false, exitCode: 3, json }) })
  );
  assert.equal(ok, false);
  assert.equal(evidence.verification.testExitCode, 3);
  assert.ok(missing.some((m) => m.includes('vitest exited nonzero')));
});

t('suite with source assertions but zero executed assertions fails the gate', () => {
  const root = baseFixture();
  const json = makeVitestJson({ omitVv: ['010'] });
  const { evidence, passed: ok } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.equal(evidence.verification.gateCoverage.GATE_4_P0_2_LOADSAT_STAGE_RHS, false);
  assert.equal(evidence.verification.gateCoverage.GATE_1R_LOADS_ASSEMBLY, false);
});

t('missing discriminating acceptance file fails its bound gate', () => {
  const rel = 'src/dynamics/rigidBody.adaptive.test.ts';
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { vitestJson: makeVitestJson({ omitFile: [rel] }) })
  );
  assert.equal(ok, false);
  assert.equal(evidence.verification.gateCoverage.GATE_2_ADAPTIVE_INTEGRATOR, false);
  assert.equal(evidence.verification.gateCoverage.GATE_3_VARIABLE_INERTIA, true);
  assert.ok(missing.some((reason) => reason.includes(rel) && reason.includes('not executed')));
});

// ---------------------------------------------------------------------------

try {
  cleanup();
} finally {
  if (failures.length > 0) {
    console.error(`\n${failures.length} of ${passed + failures.length} tests FAILED`);
    process.exitCode = 1;
  } else {
    console.log(`\nall ${passed} tests passed`);
  }
}
}