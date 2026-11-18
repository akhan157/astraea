#!/usr/bin/env node
// Release preflight: every place that names the app version must agree before
// a release is built, and the release notes come from CHANGELOG.md.
//
//   node scripts/release-preflight.mjs [--tag vX.Y.Z] [--notes-out FILE]
//
// Checks: package.json (the app version via tauri.conf.json), src-tauri/Cargo.toml,
// the astraea-workstation entry in src-tauri/Cargo.lock, the newest CHANGELOG.md
// heading, every README.md link to a versioned release, and --tag when given.
// Exits 1 listing every mismatch. --notes-out writes the CHANGELOG section of
// this version plus a fixed footer, for the GitHub release body.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const version = JSON.parse(read('package.json')).version;
const problems = [];
const expect = (where, found) => { if (found !== version) problems.push(`${where}: ${found ?? 'missing'} (package.json says ${version})`); };

const tauriConf = JSON.parse(read('src-tauri/tauri.conf.json'));
if (tauriConf.version !== '../package.json') expect('src-tauri/tauri.conf.json version', tauriConf.version);
expect('src-tauri/Cargo.toml [package] version', read('src-tauri/Cargo.toml').match(/^\[package\][^[]*?^version\s*=\s*"([^"]+)"/m)?.[1]);
expect('src-tauri/Cargo.lock astraea-workstation', read('src-tauri/Cargo.lock').match(/name = "astraea-workstation"\nversion = "([^"]+)"/)?.[1]);

const changelog = read('CHANGELOG.md');
const headings = [...changelog.matchAll(/^## (\d+\.\d+\.\d+)\b.*$/gm)];
expect('CHANGELOG.md newest heading', headings[0]?.[1]);

const readmeLinks = [...read('README.md').matchAll(/releases\/tag\/v(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
if (readmeLinks.length === 0) problems.push('README.md: no link to a versioned release');
for (const v of new Set(readmeLinks)) expect('README.md release link', v);
for (const m of read('README.md').matchAll(/\[v(\d+\.\d+\.\d+) release\]/g)) expect('README.md release link text', m[1]);
const minor = version.split('.').slice(0, 2).join('.');
for (const m of read('README.md').matchAll(/\b(\d+\.\d+) beta\b|status-(\d+\.\d+)%20beta/g)) {
  const found = m[1] ?? m[2];
  if (found !== minor) problems.push(`README.md beta label: ${found} (package.json says ${minor})`);
}

const tag = opt('--tag');
if (tag !== undefined && tag !== `v${version}`) problems.push(`tag ${tag} does not match package.json version v${version}`);

if (problems.length) {
  console.error(`Release preflight FAILED for ${version}:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

const notesOut = opt('--notes-out');
if (notesOut) {
  const start = headings[0].index + headings[0][0].length;
  const end = headings[1]?.index ?? changelog.length;
  const section = changelog.slice(start, end).trim();
  if (!section) { console.error(`CHANGELOG.md has an empty ${version} section`); process.exit(1); }
  if (section.includes('(write the user-facing changes here)')) { console.error(`CHANGELOG.md ${version} still has the bump-version placeholder`); process.exit(1); }
  writeFileSync(notesOut, `${section}\n\nNot flight approval. See [docs/accuracy.md](https://github.com/akhan157/astraea/blob/main/docs/accuracy.md) and [CHANGELOG.md](https://github.com/akhan157/astraea/blob/main/CHANGELOG.md).\n`);
}
console.log(`Release preflight passed: ${version} agrees across package.json, Cargo.toml, Cargo.lock, CHANGELOG.md and README.md${tag ? ` and tag ${tag}` : ''}.`);
