// Assert the report written by the packaged desktop app in smoke mode
// (ASTRAEA_SMOKE_OUT; see src/desktop/smoke.ts and docs/internal/hosting.md).
//   node scripts/macos-smoke-check.mjs <report.json> [expected-app-version]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// NASA Student Launch baseline, the default project. Regression pin of the
// engine's own output (not independent validation); see CHANGELOG 2026-10-21.
export const BASELINE_APOGEE_M = 533;
export const APOGEE_TOLERANCE_M = 2;

/** Every reason this report does not prove a good baseline flight. */
export function reportFailures(report, expectedVersion) {
  const failures = [];
  if (report === null || typeof report !== 'object') return ['report is not a JSON object'];
  if (report.ok !== true) failures.push(`app reported ok=${report.ok}: ${(report.failures ?? []).join('; ')}`);
  if (report.terminationReason !== 'touchdown') failures.push(`termination was ${report.terminationReason}, expected touchdown`);
  if (!Number.isFinite(report.apogeeM) || Math.abs(report.apogeeM - BASELINE_APOGEE_M) > APOGEE_TOLERANCE_M) {
    failures.push(`apogee ${report.apogeeM} m is not ${BASELINE_APOGEE_M} +/- ${APOGEE_TOLERANCE_M} m`);
  }
  if (!(report.maxMach > 0)) failures.push(`max Mach ${report.maxMach} is not a positive number`);
  if (!(report.railExitSpeedMps > 0)) failures.push(`rail exit speed ${report.railExitSpeedMps} is not a positive number`);
  if (report.engine?.kind !== 'wasm-worker' || report.engine?.poolStarted !== true) {
    failures.push(`engine was ${JSON.stringify(report.engine)}, expected the started WASM worker pool`);
  }
  if (!Array.isArray(report.pageErrors) || report.pageErrors.length > 0) {
    failures.push(`page errors: ${JSON.stringify(report.pageErrors)}`);
  }
  if (expectedVersion && report.appVersion !== expectedVersion) {
    failures.push(`app version ${report.appVersion} is not ${expectedVersion}`);
  }
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, version] = process.argv.slice(2);
  if (!file) {
    console.error('usage: macos-smoke-check.mjs <report.json> [expected-app-version]');
    process.exit(2);
  }
  let report;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`cannot read smoke report ${file}: ${error.message}`);
    process.exit(1);
  }
  const failures = reportFailures(report, version);
  console.log(JSON.stringify({
    apogeeM: report.apogeeM, maxMach: report.maxMach, railExitSpeedMps: report.railExitSpeedMps,
    terminationReason: report.terminationReason, engine: report.engine, webgl: report.webgl,
    appVersion: report.appVersion, elapsedMs: report.elapsedMs,
  }));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exit(1);
  }
  console.log('macOS smoke assertions passed');
}
