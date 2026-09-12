#!/usr/bin/env node
/**
 * Fail-closed behavior tests for scripts/emit-benchmark-metadata.cjs.
 *
 * Runs against synthetic fixture trees with injected git/build/vitest runners,
 * so no network, no pnpm, no real tests, and no repo mutation. Each case
 * asserts the observable contract:
 *   - gates green only from EXECUTED required-suite test-case results;
 *   - every legacy suite in source is independently mandatory;
 *   - missing required evidence or git failure => passed=false (exit 1);
 *   - vitest JSON parsed from `assertionResults` (not `f.assertions`);
 *   - counts are per-test-case (it/test), unknown statuses and
 *     reporter-aggregate disagreements fail;
 *   - installed deps measured from node_modules (YAML lockfile never read as
 *     JSON, but a lockfile must be present); dynamic VV inventory includes
 *     VV-014/VV-015;
 *   - pre/post source binding, reproducible self-hash, executed emitter
 *     self-tests.
 *
 * Dual execution: `node scripts/emit-benchmark-metadata.test.cjs` runs the
 * suite directly (exit 0 = all pass, and this is what the certified command
 * executes), while collection under Vitest registers every case as a real
 * test — never a container marker.
 *
 * Count binding (M2): every case below is declared with its own literal
 * `it` case token (open paren directly after the it identifier), plus one
 * cleanup case, so the emitter's source-case count of this file equals its
 * executed case count (44 + 1 = 45) exactly like every other collected
 * suite. Fixture test-file contents are built through helpers that never
 * spell out the it-token, so they cannot leak counted tokens into this
 * file's own source.
 */

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  computeEvidence,
  extractSourceSuites,
  parseVitestJson,
  verifyArtifactSelfHash,
} = require('./emit-benchmark-metadata.cjs');

// ---------------------------------------------------------------------------
// Dual-mode harness (deferred: direct node run vs Vitest collection)
// ---------------------------------------------------------------------------
// Under Vitest the real describe/it globals register the cases below as
// real tests. Under `node scripts/emit-benchmark-metadata.test.cjs` shims
// execute each case immediately and report (exit 0 = all pass, which is what
// the certified command requires). Every case is written with its own
// literal it-token, so this file's source case count is exactly its executed
// case count (44 cases + 1 cleanup = 45).
const inVitest = typeof process !== 'undefined' && !!process.env.VITEST;
if (!inVitest) {
  // Shims are inert unless this file is the entry script, so requiring it
  // as a module keeps zero side effects (matching the pre-harness behavior).
  const run = require.main === module;
  let runCount = 0;
  const failures = [];
  globalThis.describe = () => {};
  globalThis.it = (name, fn) => {
    if (!run) return;
    runCount += 1;
    try {
      fn();
      console.log(`ok - ${name}`);
    } catch (e) {
      failures.push(name);
      console.error(`FAIL - ${name}`);
      console.error(e && e.stack ? e.stack : e);
    }
  };
  if (run) {
    process.nextTick(() => {
      if (failures.length > 0) {
        console.error(`\n${failures.length} of ${runCount} tests FAILED`);
        process.exitCode = 1;
      } else {
        console.log(`\nall ${runCount} tests passed`);
      }
    });
  }
}

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

// Token-safe fixture builders: fixture suite content must carry real
// it-tokens when written to disk (the emitter counts them), but the literal
// token bytes must never appear in THIS file — its own source count must
// equal its 45 executed cases. The it identifier is spelled through a
// variable, so the emitted bytes are never it followed by an open paren.
const ITID = 'it';
const itCaseLine = (name, body) => `  ${ITID}('${name}', () => { ${body}; });`;
const specLine = (title, caseName) => `describe('${title}', () => { ${ITID}('${caseName}', () => {}); });\n`;

const BASE_SOURCE = [
  "describe('VV-001 Fixture Suite One', () => {",
  itCaseLine('first case', 'expect(a).toBeLessThanOrEqual(1)'),
  '});',
  "describe('VV-002 Fixture Suite Two', () => {",
  itCaseLine('second case', 'expect(b).toBeLessThanOrEqual(2)'),
  '});',
  "describe('VV-003 Fixture Suite Three', () => {",
  itCaseLine('third case', 'expect(c).toBeLessThanOrEqual(3)'),
  '});',
  "describe('VV-004 Galilean Invariance of Aero Loads (production loads assembly)', () => {",
  itCaseLine('loads are frame independent', 'expect(Math.abs(x)).toBeLessThanOrEqual(1e-9)'),
  '});',
  "describe('VV-005 Fixture Suite Five', () => {",
  itCaseLine('fifth case', 'expect(e).toBeLessThanOrEqual(5)'),
  '});',
  "describe('VV-006 Fixture Suite Six', () => {",
  itCaseLine('sixth case', 'expect(f).toBeLessThanOrEqual(6)'),
  '});',
  "describe('VV-007 Production Solver Linkage', () => {",
  itCaseLine('simulator executes', 'expect(ok).toBe(true)'),
  '});',
  "describe('VV-009 Fixture Suite Nine', () => {",
  itCaseLine('ninth case', 'expect(i).toBeLessThanOrEqual(9)'),
  '});',
  "describe('VV-010 Coupled Rotating-Body-Force RK4 Convergence (loadsAt)', () => {",
  itCaseLine('converges fourth order', 'expect(err).toBeLessThanOrEqual(1e-2)'),
  '});',
  "describe('VV-011 Fixture Suite Eleven', () => {",
  itCaseLine('eleventh case', 'expect(k).toBeLessThanOrEqual(11)'),
  '});',
  "describe('VV-012 Production Event Localization', () => {",
  itCaseLine('localizes crossing', 'expect(Math.abs(t - tExact)).toBeLessThanOrEqual(1e-5)'),
  '});',
  "describe('VV-013 Gate 3 Variable-Inertia Term', () => {",
  itCaseLine('conserves angular momentum', 'expect(relErr).toBeLessThanOrEqual(5e-3)'),
  '});',
  "describe('VV-014 Adaptive Integrator Termination + Convergence', () => {",
  itCaseLine('terminates stationary', 'expect(Math.abs(r.x - 5)).toBeLessThanOrEqual(1e-8)'),
  '});',
  "describe('VV-015 Production Descent Validation', () => {",
  itCaseLine('reaches touchdown', 'expect(v).toBeLessThan(10.0)'),
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
    'src/sim/sixDofSimulator.ts': 'export function simulate6DofFlight() { return null; }\nintegrateRigidAdaptive(null);\n',
    'src/sim/flightSimulator.ts': 'export const getAtmosphereAt = () => ({});\n',
    'src/dynamics/rigidBody.ts': 'export function integrateRigidStep() {}\nexport function integrateRigidAdaptive() {}\n',
    'src/dynamics/loads.ts': 'export const inertiaDotB = true;\n',
    'src/dynamics/events.ts': 'export const detectEvents = () => [];\n',
    'src/propulsion/motorDatabase.ts': 'export const CERTIFIED_MOTORS = {};\n',
    'src/aero/transonicAero.ts': 'export const computeAerodynamicCurves = () => [];\n',
    'src/aero/barrowman.ts': 'export const computeRocketStability = () => ({});\n',
    'src/core/mass.ts': 'export const aggregateVehicleMass = () => ({});\n',
    'src/core/types.ts': 'export const STANDARD_MATERIALS = {};\n',
    'src/store/rocketStore.ts': 'export const PRESET_ESTES_ALPHA = {};\n',
    'src/components/FlightSimulationTab.tsx': 'export const FlightSimulationTab = () => null;\n',
    'src/dynamics/rigidBody.adaptive.test.ts': specLine('adaptive acceptance', 'covers candidate attitude and rejection'),
    'src/dynamics/loads.repair.test.ts': specLine('loads acceptance', 'covers combined CG and load validity'),
    'src/sim/event-restart.test.ts': specLine('event acceptance', 'covers root restart and ordering'),
    'src/sim/sixDofSimulator.test.ts': specLine('production contracts', 'aligns touchdown at the root'),
    'src/propulsion/motorDatabase.test.ts': specLine('motor depletion', 'burns by impulse'),
    'scripts/emit-benchmark-metadata.cjs': 'module.exports = {};\n',
    'scripts/emit-benchmark-metadata.test.cjs': specLine('emitter evidence', 'fails closed'),
    'src/core/mass.test.ts': specLine('mass fidelity', 'places the cone centroid'),
    'src/components/FlightSimulationTab.test.tsx': specLine('safety presentation', 'renders badges'),
    'src/aero/transonicAero.test.ts': specLine('aero curves', 'tabulates drag'),
    'src/aero/barrowman.test.ts': specLine('stability analysis', 'places the neutral point'),
    'src/aero/finFlutter.test.ts': specLine('fin flutter', 'bounds divergence velocity'),
    'src/sim/flightSimulator.test.ts': specLine('legacy simulator', 'propagates descent'),
    'src/formats/orkParser.test.ts': specLine('ork format', 'parses components'),
    'src/formats/rktParser.test.ts': specLine('rkt format', 'parses motors'),
    'src/store/rocketStore.test.ts': specLine('vehicle store', 'holds presets'),
    'src/aero/protuberance.test.ts': specLine('protuberance drag', 'immerses lugs'),
    'src/sim/weather.test.ts': specLine('weather soundings', 'parses layers'),
    'src/sim/monteCarlo.test.ts': specLine('dispersion engine', 'scatters landings'),
    'src/formats/rasaero.test.ts': specLine('rasaero export', 'emits stations'),
    'src/propulsion/grainRegression.test.ts': specLine('grain regression', 'regresses bates'),
    'src/propulsion/nozzleChemistry.test.ts': specLine('nozzle chemistry', 'sizes performance'),
    'src/recovery/recovery.test.ts': specLine('recovery packing', 'sizes bays'),
    'src/evidence/evidence.test.ts': specLine('flight evidence', 'calibrates drag'),
    'src/aero/protuberance.ts': 'export const computeProtuberanceDrag = () => 0;\n',
    'src/sim/weather.ts': 'export const parseOpenMeteoSounding = () => [];\n',
    'src/sim/monteCarlo.ts': 'export const runMonteCarlo = () => ({});\n',
    'src/formats/rasaero.ts': 'export const exportCdx1 = () => "";\n',
    'src/propulsion/grainRegression.ts': 'export const regressBates = () => ({});\n',
    'src/propulsion/nozzleChemistry.ts': 'export const apcpEquilibrium = () => ({});\n',
    'src/recovery/packing.ts': 'export const bayVolume = () => 0;\n',
    'src/recovery/charges.ts': 'export const bpMass = () => 0;\n',
    'src/evidence/altimetry.ts': 'export const parseAltimeterCsv = () => [];\n',
    'src/evidence/calibration.ts': 'export const calibrateCd = () => ({});\n',
    'src/evidence/overlay.ts': 'export const buildOverlaySeries = () => ({});\n',
    'src/formats/engParser.test.ts': specLine('eng import', 'parses rasp'),
    'src/formats/blueprint.test.ts': specLine('blueprint export', 'draws side view'),
    'src/formats/engParser.ts': 'export const parseRaspEng = () => ({});\n',
    'src/formats/blueprint.ts': 'export const exportBlueprintSvg = () => "";\n',
    'src/components/EvidenceStudio.test.tsx': specLine('evidence studio', 'parses logs'),
    'src/components/InteropExportPanel.test.tsx': specLine('interop export', 'emits matrix'),
    'src/components/PropertyInspector.test.tsx': specLine('inspector mounts', 'toggles mount'),
    'src/evidence/overlay.test.ts': specLine('overlay model', 're-grids and aligns'),
    'src/components/TrajectoryOverlayChart.test.tsx': specLine('overlay chart', 'draws series'),
    'src/components/PropulsionStudio.test.tsx': specLine('propulsion studio', 'lists motors'),
    'src/components/TrajectoryStudio.test.tsx': specLine('trajectory studio', 'runs dispersion'),
    'src/components/PropulsionStudio.tsx': 'export const PropulsionStudio = () => null;\n',
    'src/components/TrajectoryStudio.tsx': 'export const TrajectoryStudio = () => null;\n',
    'src/components/EvidenceStudio.tsx': 'export const EvidenceStudio = () => null;\n',
    'src/components/InteropExportPanel.tsx': 'export const InteropExportPanel = () => null;\n',
    'src/components/PropertyInspector.tsx': 'export const PropertyInspector = () => null;\n',
    'src/components/TrajectoryOverlayChart.tsx': 'export const TrajectoryOverlayChart = () => null;\n',
    ...over,
  };
  for (const k of Object.keys(files)) {
    if (files[k] === null) delete files[k];
  }
  return fixture(files);
}

const REQUIRED_IDS = ['001', '002', '003', '004', '005', '006', '007', '009', '010', '011', '012', '013', '014', '015'];

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

  // NOTE: motorDatabase/mass/FlightSimulationTab suites are gate-required;
  // transonicAero is collected-but-ungated (exercises the all-files rule).
  const acceptanceFiles = [
    'src/dynamics/rigidBody.adaptive.test.ts',
    'src/dynamics/loads.repair.test.ts',
    'src/sim/event-restart.test.ts',
    'src/sim/sixDofSimulator.test.ts',
    'src/propulsion/motorDatabase.test.ts',
    'src/core/mass.test.ts',
    'src/components/FlightSimulationTab.test.tsx',
    'src/aero/transonicAero.test.ts',
    'src/aero/barrowman.test.ts',
    'src/aero/finFlutter.test.ts',
    'src/sim/flightSimulator.test.ts',
    'src/formats/orkParser.test.ts',
    'src/formats/rktParser.test.ts',
    'src/store/rocketStore.test.ts',
    'src/aero/protuberance.test.ts',
    'src/sim/weather.test.ts',
    'src/sim/monteCarlo.test.ts',
    'src/formats/rasaero.test.ts',
    'src/propulsion/grainRegression.test.ts',
    'src/propulsion/nozzleChemistry.test.ts',
    'src/recovery/recovery.test.ts',
    'src/evidence/evidence.test.ts',
    'src/components/PropulsionStudio.test.tsx',
    'src/components/TrajectoryStudio.test.tsx',
    'src/components/EvidenceStudio.test.tsx',
    'src/components/InteropExportPanel.test.tsx',
    'src/components/PropertyInspector.test.tsx',
    'src/evidence/overlay.test.ts',
    'src/components/TrajectoryOverlayChart.test.tsx',
    'src/formats/engParser.test.ts',
    'src/formats/blueprint.test.ts',
    'scripts/emit-benchmark-metadata.test.cjs',
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

const HASH = '480ee408f6b7213518356a58c2cdf13ede6cc90e';

function gitStub({ hashOk = true, statusOut = '', statusOk = true } = {}) {
  return (cmd) => {
    if (cmd === 'git rev-parse HEAD') return { ok: hashOk, stdout: hashOk ? HASH : '' };
    if (cmd === 'git log -1 --format=%cI') return { ok: hashOk, stdout: hashOk ? '2026-09-09T00:00:00+00:00' : '' };
    if (cmd === 'git rev-parse --abbrev-ref HEAD') return { ok: hashOk, stdout: hashOk ? 'main' : '' };
    if (cmd === 'git status --porcelain') return { ok: statusOk, stdout: statusOut };
    return { ok: false, stdout: '' };
  };
}

function ctx(root, { run, runTests, runEmitterSelfTests, readFile, readBytes, vitestJson, buildOk = true, buildExit = 0 } = {}) {
  const json = vitestJson ?? {};
  return {
    root,
    run: run ?? gitStub(),
    runBuild: () => (buildOk ? { ok: true, exitCode: 0, error: null } : { ok: false, exitCode: buildExit, error: `build failed (exit ${buildExit})` }),
    runTests: runTests ?? (() => ({ ok: json.success === true, exitCode: json.success === true ? 0 : 1, json: vitestJson })),
    runEmitterSelfTests: runEmitterSelfTests ?? (() => ({ ok: true, exitCode: 0 })),
    ...(readFile ? { readFile } : {}),
    ...(readBytes ? { readBytes } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it('green path: all required suites executed+passed => passed, all gates true', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, true, `missing: ${JSON.stringify(missing)}`);
  assert.deepEqual(missing, []);
  assert.equal(evidence.passed, true);
  for (const g of Object.keys(require('./emit-benchmark-metadata.cjs').GATE_REQUIREMENTS)) {
    assert.equal(evidence.verification.gateCoverage[g], true, `gate ${g} should be green`);
  }
  assert.equal(evidence.verification.emitterSelfTests.ok, true);
  assert.equal(evidence.version, '2.1.0');
});

it('green path: artifact carries measured evidence fields', () => {
  const root = baseFixture();
  const { evidence } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(evidence.commit.known, true);
  assert.equal(evidence.commit.treeState, 'clean');
  // skips + failures measured
  assert.equal(evidence.verification.testSummary.testCasesFailed, 0);
  assert.equal(evidence.verification.testSummary.testCasesSkipped, 0);
  assert.equal(evidence.verification.testSummary.testCasesUnknown, 0);
  assert.equal(evidence.verification.testSummary.countSemantics, 'per-test-case (it/test) results, not individual expect() calls');
  // per-suite measured records: tolerances, counts, durations
  const v014 = evidence.verification.vvMeasurements['014'];
  assert.equal(v014.executed, true);
  assert.equal(v014.status, 'passed');
  assert.equal(v014.testCases.total, 1);
  assert.equal(v014.sourceTestCases, 1);
  assert.deepEqual(v014.tolerancesDeclared, [1e-8]);
  assert.equal(typeof v014.durationMs, 'number');
  assert.deepEqual(evidence.verification.vvSuiteInventory.executed, REQUIRED_IDS);
  // artifact hashes
  assert.match(evidence.hashes.artifactSelf, /^[0-9a-f]{64}$/);
  assert.match(evidence.hashes.files['src/sim/vv-benchmarks.test.ts'], /^[0-9a-f]{64}$/);
  assert.match(evidence.hashes.files['package.json'], /^[0-9a-f]{64}$/);
  assert.match(evidence.hashes.files['src/propulsion/motorDatabase.ts'], /^[0-9a-f]{64}$/);
  assert.match(evidence.hashes.files['scripts/emit-benchmark-metadata.cjs'], /^[0-9a-f]{64}$/);
  // installed deps measured from node_modules manifests
  assert.equal(evidence.dependencies.installed.three.installed, '0.185.5');
  assert.equal(evidence.dependencies.installedComplete, true);
  assert.equal(evidence.dependencies.lockfile.format, 'pnpm-yaml');
});

it('self-hash reproduces from the advertised basis; tampering breaks it', () => {
  const root = baseFixture();
  const { evidence } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(verifyArtifactSelfHash(evidence), true);
  assert.equal(verifyArtifactSelfHash({ ...evidence, passed: false }), false);
  assert.equal(verifyArtifactSelfHash({ ...evidence, hashes: { files: evidence.hashes.files } }), false);
});

it('decimal digits are captured from the digits position', () => {
  const digitsSource = BASE_SOURCE.replace(
    'expect(Math.abs(r.x - 5)).toBeLessThanOrEqual(1e-8);',
    'expect(Math.abs(r.x - 5)).toBeLessThanOrEqual(1e-8); expect(y).toBeCloseTo(1.5, 3);'
  );
  const root = baseFixture({ 'src/sim/vv-benchmarks.test.ts': digitsSource });
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, true, `missing: ${JSON.stringify(missing)}`);
  assert.deepEqual(evidence.verification.vvMeasurements['014'].decimalDigitsDeclared, [3]);
});

it('dynamic inventory: source AND executed include the adaptive and descent suites', () => {
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

it('every legacy suite is mandatory even when no gate requires it', () => {
  const extra = `${BASE_SOURCE}\n` + [
    "describe('VV-099 Extra Legacy Suite', () => {",
    itCaseLine('extra case', 'expect(1).toBeLessThanOrEqual(2)'),
    '});',
    '',
  ].join('\n');
  const root = baseFixture({ 'src/sim/vv-benchmarks.test.ts': extra });
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.equal(evidence.passed, false);
  assert.ok(evidence.verification.vvSuiteInventory.notExecuted.includes('099'));
  assert.ok(missing.some((m) => m.includes('VV-099') && m.includes('not executed')), `missing: ${missing}`);
});

it('missing required suite fails its gate (per-gate granularity), exit nonzero', () => {
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

it('skipped required evidence fails gate and reports skip counts', () => {
  const root = baseFixture();
  const { evidence, passed: ok } = computeEvidence(ctx(root, { vitestJson: makeVitestJson({ skipVv: ['013'] }) }));
  assert.equal(ok, false);
  assert.equal(evidence.verification.testSummary.testCasesSkipped, 1);
  assert.equal(evidence.verification.gateCoverage.GATE_3_VARIABLE_INERTIA, false);
  const reason = evidence.verification.gateDetails.GATE_3_VARIABLE_INERTIA.reasons.join('; ');
  assert.match(reason, /pending=1/);
});

it('failed required test case fails its gate and emits failure messages plus observed values', () => {
  const root = baseFixture();
  const { evidence, passed: ok } = computeEvidence(ctx(root, { vitestJson: makeVitestJson({ failVv: ['012'] }) }));
  assert.equal(ok, false);
  assert.equal(evidence.verification.testSummary.testCasesFailed, 1);
  assert.equal(evidence.verification.gateCoverage.GATE_4_P0_5_EVENT_LOCALIZATION, false);
  assert.equal(evidence.verification.vvMeasurements['012'].failures.length, 1);
  assert.match(evidence.verification.vvMeasurements['012'].failures[0].messages[0], /expected 0.9/);
  assert.ok(evidence.verification.vvMeasurements['012'].observedValues.includes(0.9));
});

it('unknown test-case status fails certification', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  json.testResults[0].assertionResults[0].status = 'mystery';
  json.numPassedTests -= 1;
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('unknown')), `missing: ${missing}`);
});

it('unknown file status fails certification', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  json.testResults[1].status = 'weird';
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('not a recognized outcome')), `missing: ${missing}`);
});

it('reporter-aggregate disagreement fails certification', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  json.numTotalTests += 5;
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('numTotalTests') && m.includes('disagrees')), `missing: ${missing}`);
});

it('git failure => certification FAIL with unknown commit', () => {
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

it('dirty tree pins passed=false', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { run: gitStub({ statusOut: ' M docs/astra-round13-audit.md\n' }), vitestJson: makeVitestJson() })
  );
  assert.equal(ok, false);
  assert.equal(evidence.commit.treeState, 'dirty');
  assert.ok(missing.some((m) => m.includes('working tree is dirty')));
});

it('post-execution tree drift breaks pre/post source binding', () => {
  const root = baseFixture();
  let statusCalls = 0;
  const base = gitStub();
  const run = (cmd) => {
    if (cmd === 'git status --porcelain') {
      statusCalls += 1;
      return statusCalls > 1 ? { ok: true, stdout: ' M drifted.ts\n' } : { ok: true, stdout: '' };
    }
    return base(cmd);
  };
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { run, vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.equal(evidence.sourceBinding.prePostStatusMatch, false);
  assert.ok(missing.some((m) => m.includes('pre/post source binding violated')), `missing: ${missing}`);
});

it('post-execution file drift breaks pre/post source binding', () => {
  const root = baseFixture();
  const seen = new Set();
  const driftBytes = (rel) => {
    const full = path.join(root, ...rel.split('/'));
    const buf = fs.readFileSync(full);
    if (rel === 'src/dynamics/loads.ts') {
      if (seen.has(rel)) return Buffer.concat([buf, Buffer.from('\n// drift')]);
      seen.add(rel);
    }
    return buf;
  };
  const drifted = computeEvidence(ctx(root, { vitestJson: makeVitestJson(), readBytes: driftBytes }));
  assert.equal(drifted.passed, false);
  assert.equal(drifted.evidence.sourceBinding.prePostHashesMatch, false);
  assert.ok(drifted.missing.some((m) => m.includes('src/dynamics/loads.ts') && m.includes('pre/post source binding violated')), `missing: ${drifted.missing}`);
  const { evidence, passed: ok } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, true, 'control: stable reads stay green');
  assert.equal(evidence.sourceBinding.prePostHashesMatch, true);
});

it('build failure fails certification', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson(), buildOk: false, buildExit: 2 }));
  assert.equal(ok, false);
  assert.equal(evidence.verification.buildPass, false);
  assert.ok(missing.some((m) => m.includes('build:')));
});

it('failing emitter self-tests fail certification', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { vitestJson: makeVitestJson(), runEmitterSelfTests: () => ({ ok: false, exitCode: 2 }) })
  );
  assert.equal(ok, false);
  assert.equal(evidence.verification.emitterSelfTests.ok, false);
  assert.ok(missing.some((m) => m.includes('emitter self-tests failed')), `missing: ${missing}`);
});

it('missing lockfile fails certification', () => {
  const root = baseFixture({ 'pnpm-lock.yaml': null });
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.equal(evidence.dependencies.lockfile.present, false);
  assert.ok(missing.some((m) => m.includes('no lockfile present')), `missing: ${missing}`);
});

it('vitest per-file totals parsed from assertionResults, not f.assertions', () => {
  const json = makeVitestJson();
  assert.equal('assertions' in json.testResults[0], false, 'fixture must not carry the nonexistent f.assertions key');
  const parsed = parseVitestJson(json);
  assert.equal(parsed.files.length, 33);
  const vvFile = parsed.files.find((file) => file.file === 'vv-benchmarks.test.ts');
  assert.equal(vvFile.testCases.total, REQUIRED_IDS.length);
  assert.equal(vvFile.testCases.passed, REQUIRED_IDS.length);
  assert.equal(vvFile.testCases.failed, 0);
  assert.equal(vvFile.testCases.unknown, 0);
  assert.deepEqual(parsed.totals.testCasesPassed, REQUIRED_IDS.length + 32);
});

it('vitest JSON unparseable => certification fails', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { runTests: () => ({ ok: true, exitCode: 0, json: null }) })
  );
  assert.equal(ok, false);
  assert.equal(evidence.verification.testJsonParsed, false);
  assert.ok(missing.some((m) => m.includes('vitest JSON output missing')));
});

it('installed deps measured from node_modules, pnpm YAML lockfile never read as JSON', () => {
  const root = baseFixture(); // pnpm-lock.yaml is YAML text: JSON.parse would throw
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, true, `missing: ${missing}`);
  assert.equal(evidence.dependencies.installed.three.installed, '0.185.5');
  assert.equal(evidence.dependencies.lockfile.format, 'pnpm-yaml');
  assert.equal(evidence.dependencies.lockfile.present, true);
});

it('declared dep missing from node_modules => installed measurement incomplete => fail', () => {
  const root = baseFixture({
    'package.json': JSON.stringify({ name: 'x', dependencies: { three: '^0.185.1', ghost: '^1.0.0' } }, null, 2),
  });
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.equal(evidence.dependencies.installed.ghost.found, false);
  assert.equal(evidence.dependencies.installedComplete, false);
  assert.ok(missing.some((m) => m.includes('installed measurement incomplete')));
});

it('test run exit code nonzero => fail even if JSON looks green', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { runTests: () => ({ ok: false, exitCode: 3, json }) })
  );
  assert.equal(ok, false);
  assert.equal(evidence.verification.testExitCode, 3);
  assert.ok(missing.some((m) => m.includes('vitest exited nonzero')));
});

it('suite with source test cases but zero executed cases fails the gate', () => {
  const root = baseFixture();
  const json = makeVitestJson({ omitVv: ['010'] });
  const { evidence, passed: ok } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.equal(evidence.verification.gateCoverage.GATE_4_P0_2_LOADSAT_STAGE_RHS, false);
  assert.equal(evidence.verification.gateCoverage.GATE_1R_LOADS_ASSEMBLY, false);
});

it('missing discriminating acceptance file fails its bound gate', () => {
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

it('missing production-contracts acceptance file fails its gate', () => {
  const rel = 'src/sim/sixDofSimulator.test.ts';
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(
    ctx(root, { vitestJson: makeVitestJson({ omitFile: [rel] }) })
  );
  assert.equal(ok, false);
  assert.equal(evidence.verification.gateCoverage.GATE_4_PRODUCTION_CONTRACTS, false);
  assert.equal(evidence.verification.gateCoverage.GATE_4_P0_5_EVENT_LOCALIZATION, true);
  assert.ok(missing.some((reason) => reason.includes(rel) && reason.includes('not executed')));
});

it('deleting a mandatory legacy suite from source fails certification', () => {
  // Fixed inventory (audit §7.4): silent retirement must not pass. Drop the
  // VV-005 describe from source while execution stays green otherwise.
  const pruned = BASE_SOURCE.replace(/describe\('VV-005[^]*?\n\}\);\n/, '');
  assert.ok(!pruned.includes('VV-005'), 'fixture must actually drop VV-005');
  const root = baseFixture({ 'src/sim/vv-benchmarks.test.ts': pruned });
  const json = makeVitestJson();
  json.testResults[0].assertionResults = json.testResults[0].assertionResults.filter(
    (a) => !(a.ancestorTitles[0] || '').includes('VV-005')
  );
  json.numTotalTests = json.testResults.flatMap((r) => r.assertionResults).length;
  json.numPassedTests = json.numTotalTests;
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('VV-005') && m.includes('missing from source')), `missing: ${missing}`);
});

it('HEAD changing during execution breaks commit binding', () => {
  const root = baseFixture();
  let headCalls = 0;
  const base = gitStub();
  const run = (cmd) => {
    if (cmd === 'git rev-parse HEAD') {
      headCalls += 1;
      return headCalls > 1 ? { ok: true, stdout: 'deadbee'.padEnd(40, '0') } : base(cmd);
    }
    return base(cmd);
  };
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { run, vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.equal(evidence.sourceBinding.prePostHeadMatch, false);
  assert.ok(missing.some((m) => m.includes('HEAD changed during build/test')), `missing: ${missing}`);
});

it('suite count below collected files fails certification', () => {
  // numTotalTestSuites counts describe-blocks, not files: the honest check is
  // a sanity floor (every file contributes at least one suite).
  const root = baseFixture();
  const json = makeVitestJson();
  json.numTotalTestSuites = 1;
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('numTotalTestSuites') && m.includes('below collected files')), `missing: ${missing}`);
});

it('duplicate case identities fail certification', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  json.testResults[1].assertionResults.push({ ...json.testResults[1].assertionResults[0] });
  json.numTotalTests += 1;
  json.numPassedTests += 1;
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('duplicate case identity')), `missing: ${missing}`);
});

it('non-required file that did not cleanly pass fails certification', () => {
  // transonicAero.test.ts is collected but bound to no gate: the all-files
  // rule (not a gate requirement) must reject its unclean pass.
  const root = baseFixture();
  const json = makeVitestJson();
  const target = json.testResults.find((r) => r.name.endsWith('transonicAero.test.ts'));
  assert.ok(target, 'fixture must collect the ungated file');
  target.status = 'failed';
  target.message = 'unhandled error with zero failed cases';
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('did not cleanly pass')), `missing: ${missing}`);
});

it('executed file with zero cases proves nothing', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  const target = json.testResults.find((r) => r.name.endsWith('transonicAero.test.ts'));
  assert.ok(target, 'fixture must collect the ungated file');
  target.assertionResults = [];
  target.status = 'passed';
  json.numTotalTests -= 1;
  json.numPassedTests -= 1;
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('zero test cases')), `missing: ${missing}`);
});

it('missing aggregate counter fails certification', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  delete json.numFailedTests;
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('numFailedTests') && m.includes('missing or nonfinite')), `missing: ${missing}`);
});

it('installed version violating its declared range fails certification', () => {
  const root = baseFixture({
    'node_modules/three/package.json': JSON.stringify({ name: 'three', version: '0.100.0' }),
  });
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('three@0.100.0') && m.includes('does not satisfy')), `missing: ${missing}`);
});

it('new acceptance suites are required and hashed', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, true, `missing: ${JSON.stringify(missing)}`);
  for (const rel of [
    'src/propulsion/motorDatabase.test.ts',
    'src/core/mass.test.ts',
    'src/components/FlightSimulationTab.test.tsx',
    'scripts/emit-benchmark-metadata.test.cjs',
  ]) {
    assert.match(evidence.hashes.files[rel], /^[0-9a-f]{64}$/, `${rel} must be hashed`);
  }
  // Dropping a required new suite fails its gate.
  const dropped = computeEvidence(
    ctx(root, { vitestJson: makeVitestJson({ omitFile: ['src/core/mass.test.ts'] }) })
  );
  assert.equal(dropped.passed, false);
  assert.equal(dropped.evidence.verification.gateCoverage.GATE_1R_LOADS_ASSEMBLY, false);
});

it('M1: every collected suite in the fixed inventory is cited in hashes.files', () => {
  const { FIXED_TEST_FILE_INVENTORY } = require('./emit-benchmark-metadata.cjs');
  assert.equal(FIXED_TEST_FILE_INVENTORY.length, 33, 'acceptance list must stay at 33');
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, true, `missing: ${JSON.stringify(missing)}`);
  const citedTestFiles = Object.keys(evidence.hashes.files).filter((rel) => /\.test\.[cm]?[jt]sx?$/.exec(rel) !== null);
  for (const rel of FIXED_TEST_FILE_INVENTORY) {
    assert.ok(rel in evidence.hashes.files, `${rel} must be cited (hashed)`);
  }
  assert.equal(citedTestFiles.length, 33, `all ${FIXED_TEST_FILE_INVENTORY.length} suites must be hashed, got ${citedTestFiles.length}`);
});

it('M2: emitter suite executed count binds to its source case count', () => {
  const root = baseFixture();
  const { evidence, passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, true, `missing: ${JSON.stringify(missing)}`);
  // The emitter's own file is counted like every other suite: the fixture's
  // 1-case emitter file must match its 1 executed case (no special-case
  // bypass remains for the emitter suite).
  const emitterFile = evidence.verification.testSummary.files.find(
    (f) => f.file === 'emit-benchmark-metadata.test.cjs'
  );
  assert.equal(emitterFile.testCases.total, 1);
});

it('M2 negative: emitter suite count mismatch fails certification', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  const emitterFile = json.testResults.find((r) => r.name.endsWith('emit-benchmark-metadata.test.cjs'));
  assert.ok(emitterFile, 'fixture must collect the emitter suite');
  // Report 2 executed cases for the 1-case fixture source: exact-count
  // binding must reject the mismatch instead of special-casing this file.
  emitterFile.assertionResults.push({
    ...emitterFile.assertionResults[0],
    fullName: 'emitter extra',
    title: 'extra',
  });
  json.numTotalTests += 1;
  json.numPassedTests += 1;
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(
    missing.some((m) => m.includes('emit-benchmark-metadata.test.cjs') && m.includes('test-case-count mismatch')),
    `missing: ${missing}`
  );
});

it('executed file outside the fixed inventory fails certification', () => {
  const root = baseFixture({
    'src/sim/sneaky.test.ts': specLine('sneaky', 'runs'),
  });
  const json = makeVitestJson();
  json.testResults.push({
    assertionResults: [{ ancestorTitles: ['sneaky'], fullName: 'sneaky runs', status: 'passed', title: 'runs', duration: 1, failureMessages: [], meta: {}, tags: [], benchmarks: [] }],
    status: 'passed',
    message: '',
    startTime: 0,
    endTime: 1,
    name: 'C:/repo/src/sim/sneaky.test.ts',
  });
  json.numTotalTests += 1;
  json.numPassedTests += 1;
  json.numTotalTestSuites += 1;
  json.numPassedTestSuites += 1;
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('sneaky.test.ts') && m.includes('outside the fixed test-file inventory')), `missing: ${missing}`);
});

it('inventory file missing from collection fails certification', () => {
  const root = baseFixture();
  const { passed: ok, missing } = computeEvidence(
    ctx(root, { vitestJson: makeVitestJson({ omitFile: ['src/store/rocketStore.test.ts'] }) })
  );
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('src/store/rocketStore.test.ts') && m.includes('not collected')), `missing: ${missing}`);
});

it('inventory source/executed count mismatch fails certification', () => {
  const root = baseFixture({
    'src/store/rocketStore.test.ts': `describe('vehicle store', () => { ${ITID}('holds presets', () => {}); ${ITID}('holds materials', () => {}); });\n`,
  });
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('src/store/rocketStore.test.ts') && m.includes('test-case-count mismatch')), `missing: ${missing}`);
});

it('empty inventory source fails certification', () => {
  const root = baseFixture({ 'src/store/rocketStore.test.ts': '// retired suite\n' });
  const json = makeVitestJson({ omitFile: ['src/store/rocketStore.test.ts'] });
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('src/store/rocketStore.test.ts')), `missing: ${missing}`);
});

it('exotic declared range fails certification', () => {
  const root = baseFixture({
    'package.json': JSON.stringify({ name: 'x', dependencies: { three: '>=0.185.1 <1.0.0' } }, null, 2),
  });
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('three') && m.includes('exotic range')), `missing: ${missing}`);
});

it('nonfinite file duration fails certification', () => {
  const root = baseFixture();
  const json = makeVitestJson();
  const target = json.testResults.find((r) => r.name.endsWith('transonicAero.test.ts'));
  target.assertionResults[0].duration = NaN; // typeof NaN is 'number': sums to a NaN aggregate
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: json }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('transonicAero.test.ts') && m.includes('nonfinite duration')), `missing: ${missing}`);
});

it('residuals sidecar: valid ingested, malformed fails, absent labeled', () => {
  const records = [{ suite: 'VV-014', case: 'terminates stationary', value: 1e-9 }];
  const good = baseFixture({ 'scripts/astraea-residuals.json': JSON.stringify({ records }) });
  const goodRes = computeEvidence(ctx(good, { vitestJson: makeVitestJson() }));
  assert.equal(goodRes.passed, true, `missing: ${JSON.stringify(goodRes.missing)}`);
  assert.equal(goodRes.evidence.residualsSidecar.present, true);
  assert.equal(goodRes.evidence.residualsSidecar.valid, true);
  assert.match(goodRes.evidence.residualsSidecar.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(goodRes.evidence.residualsSidecar.records, records);
  const bad = baseFixture({ 'scripts/astraea-residuals.json': JSON.stringify({ records: [{ suite: 'VV-014', case: 'x', value: 'NaN!' }] }) });
  const badRes = computeEvidence(ctx(bad, { vitestJson: makeVitestJson() }));
  assert.equal(badRes.passed, false);
  assert.ok(badRes.missing.some((m) => m.includes('residuals sidecar') && m.includes('invalid')), `missing: ${badRes.missing}`);
  const absent = baseFixture();
  const absentRes = computeEvidence(ctx(absent, { vitestJson: makeVitestJson() }));
  assert.equal(absentRes.passed, true, `missing: ${JSON.stringify(absentRes.missing)}`);
  assert.equal(absentRes.evidence.residualsSidecar.present, false);
});

it('unreadable solver pre-capture fails certification', () => {
  const root = baseFixture({ 'src/dynamics/loads.ts': null });
  const { passed: ok, missing } = computeEvidence(ctx(root, { vitestJson: makeVitestJson() }));
  assert.equal(ok, false);
  assert.ok(missing.some((m) => m.includes('solver-config sources unreadable')), `missing: ${missing}`);
});
// Final cleanup case: runs last in both modes, so fixture trees created by
// the cases above are removed before the process/Vitest finishes.
it('cleanup fixture trees', () => {
  cleanup();
});

module.exports = {};
