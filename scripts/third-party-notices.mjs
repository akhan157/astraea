#!/usr/bin/env node
/**
 * Generate `public/third-party-notices.txt` from dependencies installed in
 * `node_modules` and the license texts shipped with this workspace.
 *
 * Deterministic by construction: everything is sorted, and the output contains
 * no timestamps, dates, absolute paths, machine names or user names.
 * Reads only the local checkout and local package/Cargo caches. No network, no
 * new dependency, no license-scanner service.
 *
 * Usage:
 *   node scripts/third-party-notices.mjs           # write the notice file
 *   node scripts/third-party-notices.mjs --check   # exit 1 if it is stale
 *
 * Regeneration requires the production dependency closure (`pnpm list`) and the
 * local Cargo registry source for `crates/astraea-engine/Cargo.lock`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public/third-party-notices.txt');
const checkOnly = process.argv.includes('--check');

const fail = (message) => {
  console.error(`third-party-notices: ${message}`);
  process.exit(2);
};

/** Deterministic code-unit sort (locale-independent). */
const byLabel = (a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
const byName = (a, b) => ((a.name + a.version) < (b.name + b.version) ? -1 : (a.name + a.version) > (b.name + b.version) ? 1 : 0);

/** Normalise the `license` field npm allows (string, object or array). */
function licenseId(pkg) {
  const value = pkg.license ?? pkg.licenses;
  if (value === undefined) return 'no SPDX field';
  if (Array.isArray(value)) return value.map((entry) => (typeof entry === 'string' ? entry : entry?.type ?? 'unknown')).join(' OR ');
  if (typeof value === 'object' && value !== null) return value.type ?? 'unknown';
  return String(value);
}

/** Candidate license-text files in a package directory, in a stable order. */
function licenseFiles(dir) {
  return readdirSync(dir)
    .filter((name) => /^(licen[cs]e|copying)/i.test(name))
    .filter((name) => {
      try { return statSync(join(dir, name)).isFile(); } catch { return false; }
    })
    .sort();
}

/** Read every license file for a package; null when the package ships none. */
function readLicenseText(dir) {
  const files = licenseFiles(dir);
  if (files.length === 0) return null;
  return files.map((name) => `--- ${name} ---\n\n${readFileSync(join(dir, name), 'utf8')}`).join('\n');
}

/** Production dependency closure as reported by the installed packages. */
function frontendPackages() {
  let raw;
  try {
    raw = execFileSync('pnpm', ['list', '--prod', '--depth', '100', '--json'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    fail(`pnpm list failed (${error.status ?? 'spawn error'})`);
  }
  const projects = JSON.parse(raw);
  const entries = new Map();
  const walk = (node) => {
    for (const [name, value] of Object.entries(node.dependencies ?? {})) {
      const key = `${name}@${value.version}`;
      // Type declarations ship no runtime code, but some list runtime packages
      // as dependencies; traverse them and only leave the declarations out.
      if (!name.startsWith('@types/') && !entries.has(key)) {
        entries.set(key, { name, version: value.version, dir: value.path, dependencies: value.dependencies });
      }
      walk(value);
    }
  };
  walk(projects[0]);
  return [...entries.values()].sort(byName);
}

/** Non-workspace crates linked or built for the WASM engine. */
function engineCrates() {
  const lock = readFileSync(join(root, 'crates/astraea-engine/Cargo.lock'), 'utf8');
  const crates = lock.split('[[package]]').slice(1).map((block) => ({
    name: block.match(/name = "([^"]+)"/)[1],
    version: block.match(/version = "([^"]+)"/)[1],
  })).filter((crate) => crate.name !== 'astraea-core' && crate.name !== 'astraea-engine');
  return crates.sort(byName);
}

/** The `license` field of a crate's Cargo.toml, without a TOML dependency. */
function cargoLicense(dir) {
  const toml = readFileSync(join(dir, 'Cargo.toml'), 'utf8');
  const match = toml.match(/^license\s*=\s*"([^"]+)"/m);
  return match ? match[1] : 'no SPDX field';
}

/** Locate a crate in the local Cargo source cache; error is name-only. */
function crateDir(crate) {
  const cargoHome = process.env.CARGO_HOME || join(homedir(), '.cargo');
  const registry = join(cargoHome, 'registry', 'src');
  const indexDirs = existsSync(registry) ? readdirSync(registry).sort() : [];
  for (const index of indexDirs) {
    const dir = join(registry, index, `${crate.name}-${crate.version}`);
    if (existsSync(dir)) return dir;
  }
  return null;
}

/** Group texts by exact content so identical licence files appear once. */
function groupByText(items) {
  const groups = new Map();
  for (const item of items) {
    const hash = createHash('sha256').update(item.text).digest('hex');
    if (!groups.has(hash)) groups.set(hash, { text: item.text, entries: [] });
    groups.get(hash).entries.push(item);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      entries: group.entries.sort(byLabel),
    }))
    .sort((a, b) => (a.entries[0].label < b.entries[0].label ? -1 : a.entries[0].label > b.entries[0].label ? 1 : 0));
}

function packageSection(entries) {
  return entries.map((entry) => `  ${entry.label}\n    declared: ${entry.license}`).join('\n');
}

const firstParty = readFileSync(join(root, 'LICENSE'), 'utf8').trimEnd();
if (!firstParty.startsWith('                                 Apache License')) {
  fail('root LICENSE does not look like the Apache-2.0 text');
}

const packages = frontendPackages();
const fontPackages = packages.filter((pkg) => pkg.name.startsWith('@fontsource/'));
const otherPackages = packages.filter((pkg) => !pkg.name.startsWith('@fontsource/'));

const fontEntries = fontPackages.map((pkg) => {
  const text = readLicenseText(pkg.dir);
  if (text === null) fail(`${pkg.name}@${pkg.version} has no local license text`);
  return { label: `${pkg.name}@${pkg.version}`, license: licenseId(readJSON(join(pkg.dir, 'package.json'))), text };
});

const missing = [];
const jsItems = [];
for (const pkg of otherPackages) {
  const meta = readJSON(join(pkg.dir, 'package.json'));
  const text = readLicenseText(pkg.dir);
  const label = `${pkg.name}@${pkg.version}`;
  if (text === null) { missing.push({ label, license: licenseId(meta) }); continue; }
  jsItems.push({ label, license: licenseId(meta), text });
}

const crateItems = engineCrates().map((crate) => {
  const dir = crateDir(crate);
  if (dir === null) {
    fail(`no local Cargo source for ${crate.name} ${crate.version}; cannot generate complete notices offline`);
  }
  const text = readLicenseText(dir);
  if (text === null) fail(`no license text in local source for ${crate.name} ${crate.version}`);
  return { label: `${crate.name} ${crate.version}`, license: cargoLicense(dir), text };
});

const jsGroups = groupByText(jsItems);
const crateGroups = groupByText(crateItems);
const nativeCrateCount = readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8')
  .split('[[package]]').length - 2; // remove the workspace package itself
const thermoBytes = readFileSync(join(root, 'crates/astraea-core/data/thermo-propellant.inp')).length;

const fontGroups = groupByText(fontEntries);

const out = [];
out.push('THIRD-PARTY NOTICES');
out.push('===================');
out.push('');
out.push('Astraea Workstation bundles first-party code, fonts, JavaScript libraries and a');
out.push('WebAssembly engine. This file reproduces the licence texts for that material.');
out.push('');
out.push('Generated by scripts/third-party-notices.mjs from this workspace and the');
out.push('locally installed packages. Do not edit by hand.');
out.push('  Regenerate: node scripts/third-party-notices.mjs');
out.push('  Verify:     node scripts/third-party-notices.mjs --check');
out.push('');
out.push('Scope: the production dependency closure reported by the package manager.');
out.push('A build may tree-shake some of these packages out of an individual bundle, so');
out.push('this file is a superset; every distinct licence text shipped by a build is');
out.push('included. Package paths, versions and licence texts are reproduced verbatim.');
out.push('');
out.push('1. FIRST-PARTY LICENCE — Apache-2.0');
out.push('=====================================');
out.push('');
out.push('Astraea Workstation and its first-party source are licensed under the Apache');
out.push('License, Version 2.0. The full text follows.');
out.push('');
out.push(firstParty);
out.push('');

out.push('2. BUNDLED FONTS — SIL Open Font License 1.1');
out.push('=============================================');
out.push('');
let section = 1;
for (const group of fontGroups) {
  out.push(`2.${section} Font packages covered by this text`);
  out.push('');
  out.push(group.entries.map((entry) => `  ${entry.label}`).join('\n'));
  out.push('');
  out.push(group.text.trimEnd());
  out.push('');
  section += 1;
}

out.push('3. JAVASCRIPT DEPENDENCIES');
out.push('==========================');
out.push('');
out.push('Each entry below is the exact licence text from the installed package, with');
out.push('the packages that ship it. Entries are grouped by identical text and sorted.');
out.push('');
section = 1;
for (const group of jsGroups) {
  out.push(`3.${section} Licence text`);
  out.push('');
  out.push(packageSection(group.entries));
  out.push('');
  out.push(group.text.trimEnd());
  out.push('');
  section += 1;
}

out.push('4. WEBASSEMBLY ENGINE CRATES');
out.push('============================');
out.push('');
out.push('The engine WebAssembly is built from the workspace crates (Apache-2.0) and the');
out.push('Rust crates below. Each entry states its declared licence identifier, and the');
out.push('full text for that identifier follows. Some entries are build-only; including');
out.push('them is a harmless superset of the linked code.');
out.push('');
section = 1;
for (const group of crateGroups) {
  out.push(`4.${section} Licence text`);
  out.push('');
  out.push(packageSection(group.entries));
  out.push('');
  out.push(group.text.trimEnd());
  out.push('');
  section += 1;
}

out.push('5. UNRESOLVED LICENCE AND DATA EVIDENCE');
out.push('=======================================');
out.push('');
out.push('These items are recorded as unresolved, not as granted rights. No permission');
out.push('is asserted for any of them.');
out.push('');
out.push('5.1 JavaScript packages with no licence text in the installed package');
out.push('');
if (missing.length === 0) {
  out.push('  None.');
} else {
  for (const entry of missing.sort(byLabel)) {
    out.push(`  ${entry.label} — declared ${entry.license}; no licence file is present in the package as installed.`);
  }
}
out.push('');
out.push('5.2 Desktop native dependency closure');
out.push('');
out.push(`  The desktop shell links ${nativeCrateCount} crates from src-tauri/Cargo.lock.`);
out.push('  Their licence texts are not available in this offline workspace and are not');
out.push('  enumerated here. No desktop installer is published. A future installer must');
out.push('  ship an enumeration before distribution.');
out.push('');
out.push('5.3 NASA CEA thermodynamic data');
out.push('');
out.push('  crates/astraea-core/data/thermo-propellant.inp (a NASA/TP-2002-211556 subset,');
out.push(`  ${thermoBytes} bytes) is compiled into the WebAssembly engine. Its redistribution`);
out.push('  terms are not established in this repository.');
out.push('');
out.push('5.4 Validation motor curves');
out.push('');
out.push('  src/validation/round2/motorSources.generated.ts carries a RocketPy MIT header but');
out.push('  is not part of the browser bundle. Rights in the underlying manufacturer thrust');
out.push('  curves are not established in this repository.');
out.push('');
out.push('END OF NOTICES');
out.push('');

const output = out.join('\n');

if (checkOnly) {
  if (!existsSync(target)) fail('public/third-party-notices.txt is missing; run without --check');
  const committed = readFileSync(target, 'utf8');
  if (committed === output) {
    console.log('third-party-notices: up to date');
    process.exit(0);
  }
  const committedLines = committed.split('\n');
  const generatedLines = output.split('\n');
  const at = committedLines.findIndex((line, index) => line !== generatedLines[index]);
  console.error(`third-party-notices: STALE at line ${at + 1}`);
  console.error(`  committed: ${committedLines[at] ?? '<end of file>'}`);
  console.error(`  generated: ${generatedLines[at] ?? '<end of file>'}`);
  console.error('Regenerate with: node scripts/third-party-notices.mjs');
  process.exit(1);
}

writeFileSync(target, output);
console.log(`third-party-notices: wrote ${target.slice(root.length + 1)} (${Buffer.byteLength(output)} bytes)`);

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
