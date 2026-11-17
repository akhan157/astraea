// Landing-entry budget: fail the build check if the public page regresses to
// shipping the workstation's 3D/React stack.
//
// Reads the actual built graph (dist/index.html + dist/.vite/manifest.json) and
// asserts:
//   1. No landing modulepreload/script points at a three/react/vendor chunk.
//   2. The landing entry's recursive static-import JS is under 10 kB.
//   3. The app entry still imports three, React and vendor chunks.
//   4. The shipped engine wasm is present, ~2 MB, and validates (see note below).
//
// Usage: pnpm build && node scripts/perf/check-landing-budget.mjs
// Exit 0 only when every assertion holds. This is a budget check, not a test of
// behaviour; the behavioural suites still run separately.
// Engine byte identity is path-dependent: the wasm embeds absolute source
// paths (/crates/astraea-*/src/*.rs, 13 sites), so a fresh build in a
// different checkout path differs by a few dozen bytes with zero source
// changes (perf-optimize build 6dc1b10b... 2,003,935 B vs main-merge build
// d64ed1a7... 2,003,861 B; `git diff` on crates/ is empty). No engine change
// is proven by source diff + engine tests, not by a byte hash. This check
// asserts the wasm is present, ~2 MB, and validates.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const root = new URL('../..', import.meta.url).pathname;
const dist = arg('dist', join(root, 'dist'));
const manifestPath = join(dist, '.vite/manifest.json');
const LANDING_JS_BUDGET = 10 * 1024;
const ENGINE_MIN_BYTES = 1_800_000;
const ENGINE_MAX_BYTES = 2_200_000;

const failures = [];
const fail = (message) => failures.push(message);
const assert = (ok, message) => { if (!ok) fail(message); };

const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => {
  fail(`missing ${manifestPath}; run pnpm build (manifest: true)`);
  return '{}';
}));
const html = await readFile(join(dist, 'index.html'), 'utf8');
const entry = manifest['index.html'];
const appEntry = manifest['app/index.html'];
assert(entry?.isEntry === true, 'manifest has no index.html entry');
assert(appEntry?.isEntry === true, 'manifest has no app/index.html entry');

/** Follow a manifest entry's static imports to the set of JS files it loads. */
function jsGraph(key) {
  const seen = new Set();
  const visit = (k) => {
    if (seen.has(k)) return;
    const record = manifest[k];
    if (!record) return;
    if (record.file) seen.add(record.file);
    for (const imported of record.imports ?? []) visit(imported);
  };
  visit(key);
  return [...seen].filter((file) => file.endsWith('.js'));
}

const isForbidden = (name) => /(^|\/)(three|react|vendor)[~-]/.test(name) || /\/(three|react)-/.test(name);
const landingJs = entry ? jsGraph('index.html') : [];
const appJs = appEntry ? jsGraph('app/index.html') : [];

for (const file of landingJs) {
  assert(!isForbidden(file), `landing entry loads forbidden chunk ${file}`);
}
assert(!/<link[^>]+rel="modulepreload"[^>]+href="[^"]*(three|react|vendor)[^"]*"/i.test(html),
  'dist/index.html still modulepreloads a three/react/vendor chunk');
assert(!/<script[^>]+src="[^"]*(three|react|vendor)[^"]*"/i.test(html),
  'dist/index.html still has a three/react/vendor script');

let landingBytes = 0;
for (const file of landingJs) {
  const info = await stat(join(dist, file)).catch(() => null);
  assert(info !== null, `landing JS asset missing: ${file}`);
  if (info) landingBytes += info.size;
}
assert(landingBytes > 0, 'landing entry has no JS (entry graph is empty)');
assert(landingBytes < LANDING_JS_BUDGET, `landing JS ${landingBytes} B exceeds ${LANDING_JS_BUDGET} B`);

assert(appJs.some((file) => /three/.test(file)), 'app entry no longer imports a three chunk');
assert(appJs.some((file) => /react/.test(file)), 'app entry no longer imports a React chunk');
assert(appJs.some((file) => /vendor/.test(file)), 'app entry no longer imports a vendor chunk');
assert(appJs.length > 3, 'app entry JS graph looks empty');

const wasm = (await readdir(join(dist, 'assets'))).find((file) => /^astraea_engine-.*\.wasm$/.test(file));
assert(wasm !== undefined, 'shipped engine wasm is missing');
if (wasm) {
  const bytes = await readFile(join(dist, 'assets', wasm));
  assert(bytes.length > ENGINE_MIN_BYTES && bytes.length < ENGINE_MAX_BYTES,
    `engine wasm is ${bytes.length} B, expected ${ENGINE_MIN_BYTES}–${ENGINE_MAX_BYTES} B`);
  assert(WebAssembly.validate(bytes), 'engine wasm does not validate');
}

if (failures.length > 0) {
  console.error('landing budget FAILED:');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log(`landing budget OK: ${landingJs.length} JS asset(s), ${landingBytes} B < ${LANDING_JS_BUDGET} B; app keeps three/React/vendor; engine wasm ${wasm} present and valid`);
