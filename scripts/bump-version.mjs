#!/usr/bin/env node
// Set the app version everywhere the release preflight checks:
//   node scripts/bump-version.mjs 0.11.2 [--date 2026-11-30]
// Updates package.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock and every
// README.md release link and "X.Y beta" label, and adds a CHANGELOG.md heading with a placeholder
// line when the version has none. The preflight refuses the placeholder, so the
// release cannot be built until the notes are written.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const NOTES_PLACEHOLDER = '- (write the user-facing changes here)';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const next = args[0];
if (!/^\d+\.\d+\.\d+$/.test(next ?? '')) {
  console.error('usage: node scripts/bump-version.mjs X.Y.Z [--date YYYY-MM-DD]');
  process.exit(2);
}
const dateIndex = args.indexOf('--date');
const date = dateIndex >= 0 ? args[dateIndex + 1] : new Date().toISOString().slice(0, 10);

const edit = (path, change) => {
  const file = resolve(root, path);
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  if (after !== before) writeFileSync(file, after);
  console.log(`${after === before ? 'unchanged' : 'updated  '} ${path}`);
};
const must = (text, pattern, what) => {
  if (!pattern.test(text)) throw new Error(`could not find ${what}`);
  return text.replace(pattern, (...m) => m[0].replace(m[1], next));
};

const current = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
edit('package.json', (t) => must(t, /"version":\s*"([^"]+)"/, 'package.json version'));
edit('src-tauri/Cargo.toml', (t) => must(t, /^\[package\][^[]*?^version\s*=\s*"([^"]+)"/m, 'Cargo.toml [package] version'));
edit('src-tauri/Cargo.lock', (t) => must(t, /name = "astraea-workstation"\nversion = "([^"]+)"/, 'Cargo.lock astraea-workstation'));
edit('README.md', (t) => t
  .replaceAll(/releases\/tag\/v\d+\.\d+\.\d+/g, `releases/tag/v${next}`)
  .replaceAll(/\[v\d+\.\d+\.\d+ release\]/g, `[v${next} release]`)
  // "0.11 beta" labels and the shields.io badge track major.minor.
  .replaceAll(/\b\d+\.\d+ beta\b/g, `${next.split('.').slice(0, 2).join('.')} beta`)
  .replaceAll(/status-\d+\.\d+%20beta/g, `status-${next.split('.').slice(0, 2).join('.')}%20beta`));
edit('CHANGELOG.md', (t) => {
  if (new RegExp(`^## ${next.replaceAll('.', '\\.')}\\b`, 'm').test(t)) return t;
  const first = t.search(/^## \d+\.\d+\.\d+/m);
  if (first < 0) throw new Error('CHANGELOG.md has no version heading');
  return `${t.slice(0, first)}## ${next} — ${date}\n\n${NOTES_PLACEHOLDER}\n\n${t.slice(first)}`;
});
console.log(`${current} -> ${next}. Write the CHANGELOG.md section, then: node scripts/release-preflight.mjs`);
