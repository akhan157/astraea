// Bounded RMP07b synthetic-only built-browser journey. Does not open the older
// empirical calibration fixtures used by the broad browser acceptance script.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from 'playwright/test';
import { preview } from 'vite';

const output = process.argv[2];
assert.ok(output, 'Supply a new external evidence directory');
await mkdir(output, { recursive: false });
const headers = await readFile(new URL('../dist/_headers', import.meta.url), 'utf8');
const csp = headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
assert.ok(csp);
const expectedSha = createHash('sha256').update(await readFile(new URL('../src/engine/astraea_engine.wasm', import.meta.url))).digest('hex');
const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false, headers: { 'Content-Security-Policy': csp } } });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [], wasmResponses = [], deniedExternal = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('.wasm')) wasmResponses.push(response.body().then(bytes => createHash('sha256').update(bytes).digest('hex')));
  });
  const origin = server.resolvedUrls.local[0];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin) || /^(blob:|data:)/.test(url)) return route.continue();
    deniedExternal.push(url); return route.abort();
  });
  await page.addInitScript(() => localStorage.setItem('astraea.workstation.toured', '1'));
  const response = await page.goto(new URL('app/', origin).href);
  assert.equal(response.status(), 200);
  assert.ok(response.headers()['content-security-policy']);
  const stage = name => page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name, exact: true }).click();
  const menu = async name => {
    await page.getByRole('button', { name: 'Project menu', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  };
  const save = async () => {
    const status = page.locator('[data-project-status]');
    const before = await status.count() ? await status.first().textContent() : null;
    await menu('Save to this browser');
    await expect(status).toContainText(/Saved locally \(revision \d+\)/);
    if (before) await expect(status).not.toHaveText(before);
    await page.keyboard.press('Escape');
  };
  const stored = () => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('astraea', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('projects', 'readonly');
      const get = tx.objectStore('projects').get('astraea.project.v1');
      get.onsuccess = () => resolve(JSON.parse(get.result));
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
    };
  }));
  const run = async () => {
    const button = page.getByRole('banner').getByRole('button', { name: /Run simulation/ });
    await button.click({ timeout: 60_000 });
    await expect(button).toBeEnabled({ timeout: 60_000 });
    const apogee = page.locator('[aria-label^="Apogee (committed run) "]');
    await apogee.waitFor({ timeout: 60_000 });
    return apogee.getAttribute('aria-label');
  };
  const firstResult = await run();
  await save();
  const first = await stored();
  assert.equal(first.schemaVersion, '1.7.0');
  assert.equal(first.flightModel.modelId, 'flight-signed-normal-plus-wind-drag-v1');
  const originalCase = first.cases.at(-1);
  assert.equal(originalCase.inputs.version, 2);
  assert.deepEqual(originalCase.inputs.flightModel, first.flightModel);
  assert.deepEqual(originalCase.engineIdentity, { kind: 'production-rust-wasm', sha256: expectedSha });
  await writeFile(join(output, 'first-project.json'), JSON.stringify(first, null, 2));
  await page.reload();
  await menu('Open saved project');
  await expect(page.locator('[data-project-status]')).toContainText('Opened saved project');
  await page.keyboard.press('Escape');
  assert.equal(await run(), firstResult);
  await save();
  const reopened = await stored();
  assert.deepEqual(reopened.cases.find(c => c.id === originalCase.id), originalCase);
  assert.equal(reopened.cases.length, first.cases.length + 1);

  await stage('Mission');
  const bad = { ...reopened, vehicle: { ...reopened.vehicle, name: 'MUST NOT LOAD' }, flightModel: { ...reopened.flightModel, modelId: 'native-candidate-not-app-enabled' } };
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: 'unsupported.astraea.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.getByText(/unsupported flightModel selection/)).toBeVisible();
  const bareBad = { ...bad.vehicle, flightModel: bad.flightModel };
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: 'unsupported-bare.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bareBad)) });
  await expect(page.getByText(/flightModel belongs on a versioned project envelope/)).toBeVisible();
  await save();
  const retained = await stored();
  assert.equal(retained.vehicle.name, reopened.vehicle.name);
  assert.deepEqual(retained.cases, reopened.cases);

  // Synthetic 1.6/Version1 compatibility: do not fabricate historical model
  // descriptors or rewrite its known runtime hashes/results.
  const old = structuredClone(reopened); old.schemaVersion = '1.6.0'; delete old.flightModel;
  for (const c of old.cases) { c.inputs.version = 1; delete c.inputs.flightModel; }
  await page.getByLabel('Import file', { exact: true }).setInputFiles({ name: 'synthetic-old-1.6.astraea.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  // Import completion is disclosed inline; the status row lives in the menu.
  await expect(page.getByText('Imported synthetic-old-1.6.astraea.json', { exact: true })).toBeVisible();
  await stage('Build');
  await page.getByRole('button', { name: 'Load saved inputs', exact: true }).first().click();
  await expect(page.getByText(/Loaded .*Run a flight/)).toBeVisible();
  await save();
  const restored = await stored();
  assert.equal(restored.schemaVersion, '1.7.0');
  assert.equal(restored.flightModel, undefined);
  assert.deepEqual(restored.cases, old.cases);
  assert.equal(await run(), firstResult);
  await save();
  const final = await stored();
  assert.deepEqual(final.cases.slice(0, old.cases.length), old.cases);
  assert.equal(final.cases.at(-1).inputs.version, 2);
  assert.equal(final.cases.at(-1).inputs.flightModel.modelId, 'flight-signed-normal-plus-wind-drag-v1');
  assert.deepEqual(final.cases.at(-1).engineIdentity, { kind: 'production-rust-wasm', sha256: expectedSha });
  await stage('Build');
  const cards = page.locator('[data-saved-run-id]');
  await cards.first().getByText('Archived assumptions', { exact: true }).click();
  await expect(cards.first().getByText('Legacy model implied by archive v1; original selection not recorded.', { exact: true })).toBeVisible();
  await cards.last().getByText('Archived assumptions', { exact: true }).click();
  await expect(cards.last().getByText('Explicit recorded legacy model selection; not physical qualification.', { exact: true })).toBeVisible();
  await expect(cards.last().locator('[data-archived-assumptions]')).toContainText('legacy global powered/coast airframe adjustment');
  await page.getByLabel('Saved baseline', { exact: true }).selectOption(old.cases[0].id);
  await page.getByLabel('Saved variant', { exact: true }).selectOption(final.cases.at(-1).id);
  const comparison = page.getByRole('region', { name: 'Saved input comparison' });
  await expect(comparison).toContainText('not a cause attribution or accuracy test');
  await comparison.locator('summary').filter({ hasText: /^Recorded model declaration ·/ }).click();
  await expect(comparison.getByRole('table', { name: /Recorded model declaration/ })).toContainText('flight-signed-normal-plus-wind-drag-v1');
  assert.deepEqual(await stored(), final);
  const hashes = await Promise.all(wasmResponses);
  assert.ok(hashes.length > 0); assert.ok(hashes.every(sha => sha === expectedSha));
  assert.deepEqual(errors, []);
  assert.deepEqual(deniedExternal, []);
  await writeFile(join(output, 'final-project.json'), JSON.stringify(final, null, 2));
  const metrics = { status: 'pass', scope: 'synthetic legacy model/archive compatibility in actual built Chromium/CSP; no physical/numerical/team/native-platform qualification', browser: browser.version(), schemaVersion: final.schemaVersion, wasmSha256: expectedSha, fetchedWasmSha256: hashes, cases: ['new explicit model capture', 'Save/reload/Open/rerun', 'unsupported envelope and bare-file refusals preserve project', '1.6/version1 migration', 'load saved inputs retains old case', 'fresh run creates version2 without rewriting version1', 'read-only archived assumptions and model-declaration difference view'], runtimeErrors: errors, externalRequests: deniedExternal };
  await writeFile(join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log(JSON.stringify(metrics, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
