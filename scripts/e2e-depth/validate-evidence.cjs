#!/usr/bin/env node
/**
 * Astrea E2E-depth evidence validator — deterministic, green, no network.
 *
 * Loads the per-area Jev state dumps captured by the E2E-depth run
 * (scripts/e2e-depth/evidence/area-*.json), checks the jev-triage schema
 * ({url, studio, banners[], badges[], consoleErrors, overflow}) and asserts
 * the per-area behavioral markers the run claims. Reruns may be executed
 * with `node scripts/e2e-depth/validate-evidence.cjs` — this file must stay
 * deterministic and pass on the committed dump set (see VERDICTS.md).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EVIDENCE_DIR = path.join(__dirname, 'evidence');

const REQUIRED_FIELDS = ['url', 'studio', 'banners', 'badges', 'consoleErrors', 'overflow'];

function loadDumps() {
  const files = fs.readdirSync(EVIDENCE_DIR).filter((f) => /^area-.*\.json$/.test(f)).sort();
  if (files.length === 0) throw new Error('no area-*.json dumps found in ' + EVIDENCE_DIR);
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(EVIDENCE_DIR, f), 'utf8');
    return { file: f, dump: JSON.parse(raw) };
  });
}

function schemaError(file, msg) {
  return `[schema] ${file}: ${msg}`;
}

function main() {
  const errors = [];
  const dumps = loadDumps();

  for (const { file, dump } of dumps) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in dump)) errors.push(schemaError(file, `missing "${field}"`));
    }
    if (typeof dump.url !== 'string' || !dump.url.startsWith('http')) {
      errors.push(schemaError(file, 'url must be an http(s) string'));
    }
    if (typeof dump.studio !== 'string' || dump.studio === '') {
      errors.push(schemaError(file, 'studio must be a non-empty string'));
    }
    for (const key of ['banners', 'badges']) {
      if (!Array.isArray(dump[key]) || dump[key].some((v) => typeof v !== 'string')) {
        errors.push(schemaError(file, `${key} must be a string array`));
      }
    }
    if (!Number.isInteger(dump.consoleErrors) || dump.consoleErrors < 0) {
      errors.push(schemaError(file, 'consoleErrors must be a non-negative integer'));
    }
    const ov = dump.overflow;
    if (!ov || typeof ov !== 'object' || typeof ov.x !== 'boolean' || typeof ov.y !== 'boolean') {
      errors.push(schemaError(file, 'overflow must be {x: bool, y: bool}'));
    }
  }

  const badgeAll = (dumps, re) => dumps.filter(({ dump }) => dump.badges.some((b) => re.test(b))).map(({ file }) => file);
  const bannerAll = (dumps, re) => dumps.filter(({ dump }) => dump.banners.some((b) => re.test(b))).map(({ file }) => file);

  // Per-area behavioral markers (the claims this run logs in VERDICTS.md).
  const checks = [
    ['area-1 staged draft badge', badgeAll(dumps, /pending edit — not committed/).length >= 1],
    ['area-2 valid import badge', badgeAll(dumps, /Flight 1 \(CSV\) \[current\]/).length >= 1],
    ['area-2 malformed honest banner', bannerAll(dumps, /unrecognized header row/).length >= 1],
    ['area-2 malformed preserves prior import', badgeAll(dumps, /preserved after failed ingest/).length >= 1],
    ['area-3 export defect recorded', badgeAll(dumps, /DEFECT: no download materialized/).length >= 1],
    ['area-4 compare basis tail badge', badgeAll(dumps, /basis followed history tail/).length >= 1],
    ['area-5 repair-not-surfaced defect recorded', badgeAll(dumps, /DEFECT: committed solid motor mount/).length >= 1],
    ['area-6 keyboard badges', badgeAll(dumps, /Ctrl\+Enter from Airframe/).length >= 1],
    ['area-7 zero overflow flagged clean', badgeAll(dumps, /no horizontal overflow, no horizontal scrollbar/).length >= 1],
    ['every dump reports overflow {x,y} as booleans', dumps.every(({ dump }) => typeof dump.overflow.x === 'boolean' && typeof dump.overflow.y === 'boolean')],
  ];

  for (const [label, ok] of checks) {
    if (!ok) errors.push(`[marker] ${label}: expected evidence marker not found`);
  }

  // Every dump must have a companion screenshot (webp) in evidence/ so FILE
  // and ESCALATE verdicts are always backed by a viewed capture.
  for (const { file } of dumps) {
    const base = file.replace(/\.json$/, '');
    const shot = path.join(EVIDENCE_DIR, base + '.webp');
    if (!fs.existsSync(shot) || fs.statSync(shot).size < 4096) {
      errors.push(`[evidence] ${file}: missing non-trivial screenshot ${base}.webp`);
    }
  }

  if (errors.length > 0) {
    for (const e of errors) console.error('FAIL', e);
    process.exit(1);
  }
  console.log(`OK: ${dumps.length} dumps validated, ${checks.length} behavioral markers asserted.`);
}

if (require.main === module) main();
module.exports = { loadDumps, main };