// Production-CSP browser journey for the hybrid aero model (1.1.0).
// Toggle on -> hybrid label + band note; run -> pre-run refusal; save/reload/
// reopen keeps the selection; toggle off -> legacy run.
// Requires a built app: `pnpm build` first.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';

const evidence = process.env.ASTRAEA_EVIDENCE ?? '/tmp/astraea-aero-beta-evidence';
await mkdir(evidence, { recursive: true });
const headers = await readFile(new URL('../dist/_headers', import.meta.url), 'utf8');
const csp = headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
assert.ok(csp, 'Built site must include its CSP');
const server = await preview({ preview: {
  host: '127.0.0.1', port: 0, open: false,
  headers: { 'Content-Security-Policy': csp },
} });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const origin = server.resolvedUrls.local[0];
  await page.addInitScript(() => localStorage.setItem('astraea.workstation.toured', '1'));
  const response = await page.goto(new URL('app/', origin).href);
  assert.equal(response.status(), 200);
  assert.ok(response.headers()['content-security-policy'], 'App must receive a CSP');

  // Supported-fin template: rounded fins (the default template's airfoil
  // section is refused by design and covered by the panel note).
  await page.getByRole('button', { name: 'Mission', exact: true }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: /Estes Alpha III/ }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Aero', exact: true }).click({ timeout: 60_000 });
  await page.getByRole('tab', { name: 'Aerodynamic inputs' }).click({ timeout: 60_000 });

  const toggle = page.getByRole('checkbox', { name: 'Use built-up aero model (beta)' });
  await toggle.waitFor({ timeout: 60_000 });
  assert.equal(await toggle.isChecked(), false, 'beta must default off');
  await toggle.check();
  await page.getByText(/Model: aero-buildup 1\.1\.0 \(hybrid\)/).waitFor({ timeout: 60_000 });
  await page.getByText(/Hybrid: the built-up method with Astraea's legacy drag override over Mach 0\.80-1\.20/).waitFor({ timeout: 60_000 });
  await page.getByText('component breakdown unavailable inside the band').first().waitFor({ timeout: 60_000 });
  await page.screenshot({ path: `${evidence}/1-hybrid-on.png`, fullPage: true });

  await page.getByRole('banner').getByRole('button', { name: /Run simulation/ }).click({ timeout: 60_000 });
  await page.getByText(/drives stability and aero panels in this build; flight coefficients still come from the legacy path/).waitFor({ timeout: 60_000 });
  assert.equal(await page.locator('[aria-label^="Apogee (committed run) "]').count(), 0, 'refused run must not commit a result');
  await page.screenshot({ path: `${evidence}/2-run-refused.png`, fullPage: true });

  // Save to the browser slot, reload, reopen: the selection survives.
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('button', { name: /^Save to this browser/ }).click();
  await page.locator('[data-project-status]').filter({ hasText: /Saved locally \(revision \d+\)/ }).waitFor({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('button', { name: /Open saved project/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Aero', exact: true }).click({ timeout: 60_000 });
  await page.getByRole('tab', { name: 'Aerodynamic inputs' }).click({ timeout: 60_000 });
  const reopened = page.getByRole('checkbox', { name: 'Use built-up aero model (beta)' });
  await reopened.waitFor({ timeout: 60_000 });
  assert.equal(await reopened.isChecked(), true, 'selection must survive save and reopen');
  await page.screenshot({ path: `${evidence}/3-persisted-after-reopen.png`, fullPage: true });

  // Provenance from the panel, then via the deep link.
  await page.getByRole('button', { name: 'Aero model provenance' }).click({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: /Aero model provenance/ });
  await dialog.waitFor({ timeout: 30_000 });
  assert.match(await dialog.innerText(), /Method-only engine parity/);
  assert.match(await dialog.innerText(), /does not apply to the hybrid/);
  await page.screenshot({ path: `${evidence}/5-provenance-panel.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached', timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.location.hash), '', 'closing must clear the hash');

  // Toggle off: hybrid label gone, legacy run commits.
  await reopened.uncheck();
  await page.getByText(/Model: aero-buildup/).waitFor({ state: 'detached', timeout: 60_000 });
  await page.getByRole('banner').getByRole('button', { name: /Run simulation/ }).click({ timeout: 60_000 });
  await page.locator('[aria-label^="Apogee (committed run) "]').waitFor({ timeout: 120_000 });
  await page.screenshot({ path: `${evidence}/4-beta-off-legacy-run.png`, fullPage: true });

  // Deep link: the same dialog opens with no selection required.
  await page.goto(new URL('app/#aero-model-provenance', origin).href);
  const deepDialog = page.getByRole('dialog', { name: /Aero model provenance/ });
  await deepDialog.waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${evidence}/6-provenance-hash.png`, fullPage: true });
  await page.getByRole('button', { name: 'Close aero model provenance' }).click({ timeout: 30_000 });
  await deepDialog.waitFor({ state: 'detached', timeout: 30_000 });
  assert.equal(await page.evaluate(() => window.location.hash), '', 'closing must clear the hash');
  await page.getByRole('button', { name: 'Aero', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Aerodynamic inputs' }).click({ timeout: 30_000 });
  await page.getByRole('checkbox', { name: 'Use built-up aero model (beta)' }).waitFor({ timeout: 30_000 });

  assert.deepEqual(errors, [], 'Browser runtime / CSP errors');
  console.log(`aero-model hybrid browser journey passed; screenshots in ${evidence}`);
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
