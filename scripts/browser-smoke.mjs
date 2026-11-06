import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { preview } from 'vite';
import { calibrationJourney, previewJourneys, shareFlightJourney } from './preview-journeys.mjs';
import { previewDepth } from './preview-depth.mjs';

// Vite preview does not apply Pages' _headers. Exercise the built app with
// the exact production CSP, including worker and WebAssembly restrictions.
const browserName = process.env.ASTRAEA_BROWSER ?? 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
assert.ok(browserType, `Unknown ASTRAEA_BROWSER: ${browserName}`);
const remote = process.env.ASTRAEA_PREVIEW_URL;
const headers = remote ? '' : await readFile(new URL('../dist/_headers', import.meta.url), 'utf8');
const csp = headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
if (!remote) assert.ok(csp, 'Built site must include its Cloudflare CSP');
const server = remote ? null : await preview({ preview: {
  host: '127.0.0.1', port: 0, open: false,
  headers: { 'Content-Security-Policy': csp },
} });
let browser;
try {
  browser = await browserType.launch(browserName === 'chromium' ? {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  } : {});
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const watch = (target) => {
    target.on('pageerror', (error) => errors.push(error.message));
    target.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  };
  watch(page);
  page.context().on('page', watch);
  const origin = remote ?? server.resolvedUrls.local[0];
  await page.addInitScript(() => localStorage.setItem('astraea.workstation.toured', '1'));
  const response = await page.goto(new URL('app/', origin).href);
  assert.equal(response.status(), 200);
  assert.ok(response.headers()['content-security-policy'], 'App must receive a CSP');
  await page.getByRole('banner').getByRole('button', { name: /Run simulation/ }).click({ timeout: 60_000 });
  const apogee = page.locator('[aria-label^="Apogee (committed run) "]');
  await apogee.waitFor({ timeout: 60_000 });
  const label = await apogee.getAttribute('aria-label');
  const meters = Number(label.match(/run\) ([\d,.]+) m/)[1].replaceAll(',', ''));
  // Regression pin from the packaged desktop NASA Student Launch baseline.
  // Rounded UI values: not an independent physical-validation claim.
  assert.ok(Math.abs(meters - 534) < 2, `Desktop baseline ~534 m; browser returned ${label}`);
  // A cold software-GL start can show the labeled WebGL fallback for a beat
  // before the first real context exists. Accept either signal, never the
  // absence of both.
  await page.locator('main canvas:visible, [data-webgl-fallback="true"]').first().waitFor({ timeout: 30_000 });
  const webglFallback = await page.locator('[data-webgl-fallback="true"]').count();
  assert.ok(webglFallback > 0 || await page.locator('main canvas:visible').count(), '3D viewport must render');
  console.log(`${browserName} smoke passed: ${label}; WebAssembly workers under production CSP`);
  await previewJourneys(page, origin);
  await previewDepth(page, origin);
  await calibrationJourney(page, origin);
  await shareFlightJourney(page, origin);
  assert.deepEqual(errors, [], 'Browser runtime / CSP errors');
} finally {
  await browser?.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
}
