// Capture product screenshots of the real app.
//
//   pnpm build && CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-screenshots.mjs [outDir]
//   pnpm build && CHROMIUM_PATH=/usr/bin/chromium node scripts/capture-screenshots.mjs --readme [outDir]
//
// Drives the built web app (WebAssembly engine, NASA Student Launch preset)
// through its stages at 2x scale and saves WebP files (quality 82). Feature
// images crop to the stage <main> region measured from the DOM, so the crop
// follows the inspector whether it is open or collapsed, and the Monte Carlo
// image crops from the dock separator down. Without a mode the landing-page set
// goes to public/landing/; --readme writes the five README images to
// docs/screenshots/. Every capture is checked by numbers (PNG dimensions, WebP
// bytes), so nobody has to look at the files to know they are right.
import { mkdir, readFile, stat } from 'node:fs/promises';
import { unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { preview } from 'vite';

const VIEWPORT = { width: 1600, height: 1000 };
const SCALE = 2;
const QUALITY = 82;
/** A blank or failed capture is a few hundred bytes; a real workspace is not. */
const MIN_BYTES = 20 * 1024;

const args = process.argv.slice(2);
const readme = args.includes('--readme');
const out = (args.find((arg) => !arg.startsWith('--'))
  ?? new URL(readme ? '../docs/screenshots/' : '../public/landing/', import.meta.url).pathname).replace(/\/+$/, '');

/** PNG -> WebP through ImageMagick (`magick`), keeping the repo free of image deps. */
async function sharpless(png, dest) {
  const tmp = `${dest}.png`;
  writeFileSync(tmp, png);
  execFileSync('magick', [tmp, '-quality', String(QUALITY), dest]);
  unlinkSync(tmp);
}

/** PNG pixel dimensions from the IHDR chunk: verify a capture without opening it. */
function pngSize(png) {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) throw new Error('Screenshot is not a PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Whole CSS pixels, rounded out, so the PNG size is exactly clip × scale. */
function rect(box, label) {
  if (!box || box.width <= 0 || box.height <= 0) throw new Error(`No layout box for ${label}`);
  const x = Math.floor(box.x);
  const y = Math.floor(box.y);
  return { x, y, width: Math.ceil(box.x + box.width) - x, height: Math.ceil(box.y + box.height) - y };
}

await mkdir(out, { recursive: true });
// Capture the deployed surface: serve dist with the site's own CSP, as
// `pnpm test:browser` does. Vite preview does not read `_headers` itself.
const headers = await readFile(new URL('../dist/_headers', import.meta.url), 'utf8');
const csp = headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
if (!csp) throw new Error('dist/_headers has no Content-Security-Policy; run pnpm build first');
const server = await preview({ preview: { host: '127.0.0.1', port: 0, open: false, headers: { 'Content-Security-Policy': csp } } });
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
  await page.addInitScript(() => localStorage.setItem('astraea.workstation.toured', '1'));
  const response = await page.goto(new URL('app/', server.resolvedUrls.local[0]).href);
  if (!response?.headers()['content-security-policy']) throw new Error('The app was served without its CSP');

  /* ───────────── geometry from the DOM ───────────── */

  /** The stage workspace: the <main> column between the parts tree and the inspector. */
  const stageClip = async () => rect(await page.locator('main').boundingBox(), 'main');

  /**
   * The stage workspace plus the inspector, for a shot whose subject is an
   * inspector control. The panel animates its width over 160 ms, so measure the
   * settled box and fail loudly rather than crop a collapsed panel.
   */
  const stageAndInspectorClip = async () => {
    const panel = page.locator('[data-inspector-panel]');
    let settled = null;
    for (let i = 0; i < 30; i++) {
      const box = await panel.boundingBox();
      if (settled && box && settled.x === box.x && settled.width === box.width) break;
      settled = box;
      await page.waitForTimeout(100);
    }
    if (!settled || settled.width < 2) throw new Error('The inspector is collapsed; this capture needs it open');
    const main = await stageClip();
    return { x: main.x, y: main.y, width: Math.ceil(settled.x + settled.width) - main.x, height: main.height };
  };

  /** The dock: its horizontal separator down to the bottom of the stage workspace. */
  const dockClip = async () => {
    const main = await stageClip();
    const separator = rect(await page.locator('main [role="separator"][aria-orientation="horizontal"]').boundingBox(), 'the dock separator');
    return { x: main.x, y: separator.y, width: main.width, height: main.y + main.height - separator.y };
  };

  /**
   * Raise the dock by dragging its separator, as a user would, so a panel that
   * is taller than the first-use height is fully in the shot.
   */
  const raiseDock = async (target) => {
    const main = await stageClip();
    const separator = page.locator('main [role="separator"][aria-orientation="horizontal"]');
    const box = await separator.boundingBox();
    if (!box) throw new Error('The dock separator is not visible');
    const dy = Math.max(0, Math.min(target - (main.y + main.height - box.y), 400));
    if (dy < 20) return;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(x, y - (dy * i) / 10);
      await page.waitForTimeout(24);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
  };

  /* ───────────── checks that need no eyes ───────────── */

  function inside(clip, box, label) {
    const slack = 1; // sub-pixel rounding only
    if (box.x < clip.x - slack || box.y < clip.y - slack
      || box.x + box.width > clip.x + clip.width + slack
      || box.y + box.height > clip.y + clip.height + slack) {
      throw new Error(`${label} at ${JSON.stringify(box)} is outside the crop ${JSON.stringify(clip)}`);
    }
  }

  /** A control that scrolls with its panel only has to reach into the crop. */
  function overlaps(clip, box, label) {
    if (box.x >= clip.x + clip.width || box.x + box.width <= clip.x
      || box.y >= clip.y + clip.height || box.y + box.height <= clip.y) {
      throw new Error(`${label} at ${JSON.stringify(box)} does not reach the crop ${JSON.stringify(clip)}`);
    }
  }

  async function seen(locator, label, clip, { partial = false } = {}) {
    await locator.first().waitFor({ state: 'visible', timeout: 30_000 });
    if (!clip) return;
    const box = rect(await locator.first().boundingBox(), label);
    if (partial) overlaps(clip, box, label);
    else inside(clip, box, label);
  }

  /** The rail's current stage, so a capture cannot silently show the wrong one. */
  async function expectStage(name) {
    const current = await page.getByRole('navigation', { name: 'Pipeline stages' })
      .getByRole('button', { name: new RegExp(`^${name}`) }).getAttribute('aria-current');
    if (current !== 'page') throw new Error(`Expected the ${name} stage, the rail says ${current}`);
  }

  /**
   * The 3D view holds a solved shape: `ready` for the current geometry, or
   * `stale` for the last solved one while the next result lands. `empty` (never
   * drawn) and the WebGL fallback are both failures.
   */
  async function solvedViewport({ markers = false } = {}) {
    await page.waitForFunction((wantMarkers) => {
      const el = document.querySelector('main [data-layout-state]');
      if (el === null) return false;
      const state = el.getAttribute('data-layout-state');
      // > 1 m: `layoutFrom` falls back to 1 when the breakdown carries no
      // parts, so a length of exactly 1 is the empty scene that blanks the view.
      return (state === 'ready' || state === 'stale')
        && Number(el.getAttribute('data-layout-length')) > 1
        && (!wantMarkers || el.getAttribute('data-markers') === 'present');
    }, markers, { timeout: 60_000 });
    if (await page.locator('[data-webgl-fallback="true"]').count() > 0) throw new Error('The viewport fell back to the WebGL fallback');
    const el = page.locator('main [data-layout-state]').first();
    return {
      state: await el.getAttribute('data-layout-state'),
      length: Number(await el.getAttribute('data-layout-length')),
      markers: await el.getAttribute('data-markers'),
    };
  }

  /* ───────────── capture ───────────── */

  const shots = [];
  /**
   * Wait for the stage to settle, measure the crop, run the shot's checks, then
   * save and verify. `area` is a rectangle or a function measured after the
   * settle; `check` runs against that rectangle before the shutter.
   */
  const capture = async (name, area, check) => {
    await page.waitForTimeout(1200);
    const clip = typeof area === 'function' ? await area() : area;
    if (check) await check(clip);
    const png = await page.screenshot(clip ? { clip } : {});
    const { width, height } = pngSize(png);
    const want = clip
      ? { width: clip.width * SCALE, height: clip.height * SCALE }
      : { width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE };
    if (width !== want.width || height !== want.height) {
      throw new Error(`${name}: PNG is ${width}x${height}, expected ${want.width}x${want.height}`);
    }
    const dest = `${out}/${name}.webp`;
    await sharpless(png, dest);
    const { size } = await stat(dest);
    if (size < MIN_BYTES) throw new Error(`${dest} is ${size} bytes; captures must exceed ${MIN_BYTES}`);
    shots.push({ name, width, height, size });
    console.log(`captured ${dest} ${width}x${height} ${size} B clip=${clip ? JSON.stringify(clip) : 'window'}`);
  };

  const stage = (name) => page.getByRole('navigation', { name: 'Pipeline stages' })
    .getByRole('button', { name: new RegExp(`^${name}`) }).click();
  const tab = (name) => page.getByRole('tab', { name, exact: true });

  await page.locator('[aria-label^="Apogee (committed run) "]').waitFor({ timeout: 60_000 });
  await page.locator('[data-preview-status="ready"]').waitFor({ timeout: 60_000 });

  if (readme) {
    /* ───────────── README set ───────────── */

    // design: the Airframe workspace, live stability and the mass budget dock.
    await expectStage('Airframe');
    await capture('design', stageClip, async (clip) => {
      const view = await solvedViewport({ markers: true });
      await seen(page.getByRole('region', { name: 'Live stability and flight preview' }), 'live stability strip', clip);
      const massTab = page.getByRole('tab', { name: /^Mass budget/ });
      await seen(massTab, 'mass budget tab', clip);
      if (await massTab.getAttribute('aria-selected') !== 'true') throw new Error('The mass budget tab is not selected');
      const rows = await page.locator('main [data-part-name]').count();
      if (rows < 5) throw new Error(`The mass budget shows ${rows} rows`);
      console.log(`  design: ${rows} mass rows, viewport ${JSON.stringify(view)}`);
    });

    // flight: the 6-DOF timeline in the dock under the flight pose.
    await stage('Flight');
    await expectStage('Flight');
    await capture('flight', stageClip, async (clip) => {
      const timeline = tab('Timeline');
      await seen(timeline, 'timeline tab', clip);
      if (await timeline.getAttribute('aria-selected') !== 'true') throw new Error('The Timeline tab is not selected');
      await seen(page.getByRole('slider', { name: 'Flight time' }), 'flight time scrubber');
      if (await page.locator('main svg').count() < 1) throw new Error('The timeline has no chart');
      await seen(page.locator('main svg').first(), 'timeline chart', clip, { partial: true });
      const view = await solvedViewport();
      console.log(`  flight: timeline selected, viewport ${JSON.stringify(view)}`);
    });

    // verify: the gates, including the Tripoli landing limit.
    await stage('Verify');
    await expectStage('Verify');
    await capture('verify', stageClip, async (clip) => {
      const gates = page.locator('main [data-gate-reason]');
      const count = await gates.count();
      if (count < 5) throw new Error(`Verify shows ${count} gate reasons`);
      const landing = page.locator('main div[role="button"]').filter({ hasText: 'Landing speed' }).first();
      await seen(landing, 'landing speed gate', clip);
      if (!/35 ft\/s/.test(await landing.innerText())) throw new Error('The landing gate does not cite the 35 ft/s limit');
      console.log(`  verify: ${count} gates, landing speed row ${JSON.stringify(await landing.boundingBox())}`);
    });

    // aero-inputs: the aero inputs tab plus the selected fin's airfoil controls.
    await stage('Aero');
    await expectStage('Aero');
    const fin = page.locator('[data-component-id]').filter({ hasText: /fins?/i }).first();
    if (await fin.count() === 0) throw new Error('No fin set in the parts tree');
    await fin.click();
    await seen(page.getByLabel('Airfoil section'), 'fin airfoil controls');
    await tab('Aerodynamic inputs').click();
    const builtUp = page.getByRole('checkbox', { name: /built-up aero model/ });
    await seen(builtUp, 'built-up aero model toggle');
    await capture('aero-inputs', stageAndInspectorClip, async (clip) => {
      await expectStage('Aero');
      // The legacy model stays selected. The built-up selection returns a
      // stability DTO with no component contributions, so the viewport would
      // draw no rocket; the inputs it reads are the same rows either way.
      if (await builtUp.isChecked()) throw new Error('The built-up beta is on; its stability result carries no part layout');
      await seen(builtUp, 'built-up aero model toggle', clip);
      await seen(page.getByRole('region', { name: 'Vehicle aero inputs' }), 'vehicle aero inputs', clip);
      await seen(page.getByLabel('Airfoil section'), 'fin airfoil controls', clip);
      const view = await solvedViewport({ markers: true });
      console.log(`  aero-inputs: fin selected, airfoil controls in crop, viewport ${JSON.stringify(view)}`);
    });

    // live-sizing: the fin span slider held mid-drag while the viewport keeps a solved shape.
    await stage('Airframe');
    await expectStage('Airframe');
    const span = page.getByLabel('Span slider');
    await seen(span, 'fin span slider');
    const box = await span.boundingBox();
    const before = Number(await span.inputValue());
    const min = Number(await span.getAttribute('min'));
    const max = Number(await span.getAttribute('max'));
    // Native range thumb: centred in the track, 14 px narrower than the input box.
    const thumbX = box.x + 7 + ((before - min) / (max - min)) * (box.width - 14);
    const y = box.y + box.height / 2;
    await page.mouse.move(thumbX, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(thumbX + i * 5, y);
      await page.waitForTimeout(24);
    }
    await capture('live-sizing', stageAndInspectorClip, async (clip) => {
      const value = Number(await span.inputValue());
      if (value === before) throw new Error('The span slider did not move during the drag');
      await seen(span, 'fin span slider', clip);
      const view = await solvedViewport({ markers: true });
      console.log(`  live-sizing: span ${before} -> ${value} mm mid-drag, viewport ${JSON.stringify(view)}`);
    });
    await page.mouse.up();
  } else {
    /* ───────────── landing-page set ───────────── */

    await expectStage('Airframe');
    await capture('airframe', stageClip, async (clip) => {
      const view = await solvedViewport({ markers: true });
      await seen(page.getByRole('region', { name: 'Live stability and flight preview' }), 'live stability strip', clip);
      console.log(`  airframe: viewport ${JSON.stringify(view)}`);
    });

    await stage('Aero');
    await expectStage('Aero');
    await capture('hero', null, async () => {
      const view = await solvedViewport({ markers: true });
      await seen(page.getByRole('region', { name: 'Live stability and flight preview' }), 'live stability strip');
      console.log(`  hero: viewport ${JSON.stringify(view)}`);
    });

    for (const name of ['Motor', 'Flight', 'Verify']) {
      await stage(name);
      await expectStage(name);
      await capture(name.toLowerCase(), stageClip);
    }

    await stage('Flight');
    await expectStage('Flight');
    await tab('Monte Carlo').click();
    const runFlights = page.getByRole('button', { name: /^Run \d+ flights$/ });
    await seen(runFlights, 'Monte Carlo run button');
    const requested = Number((await runFlights.innerText()).match(/(\d+)/)[1]);
    await runFlights.click();
    // The outcome ledger appears with the partial result; the spinner leaves
    // when the ensemble has finished. Every requested run stays counted.
    await page.locator('[data-mc-outcome-counts]').waitFor({ timeout: 240_000 });
    await page.waitForFunction(() => document.querySelectorAll('main .animate-spin').length === 0, undefined, { timeout: 240_000 });
    await raiseDock(720);
    // The legend can sit a few pixels below the dock's visible area; scroll it in.
    await page.getByText(/99% of samples within/).scrollIntoViewIfNeeded();
    await capture('montecarlo', dockClip, async (clip) => {
      await seen(tab('Monte Carlo'), 'Monte Carlo tab', clip);
      if (await tab('Monte Carlo').getAttribute('aria-selected') !== 'true') throw new Error('The Monte Carlo tab is not selected');
      const counts = await page.locator('[data-mc-outcome-counts]').innerText();
      const requestedShown = Number(counts.match(/Requested\s+(\d+)/)?.[1]);
      const nominal = Number(counts.match(/Supported nominal\s+(\d+)/)?.[1]);
      if (requestedShown !== requested) throw new Error(`${requestedShown} runs were requested, expected ${requested}`);
      const scatter = page.locator('main [role="img"][aria-label*="simulated landing points"]');
      const landingCount = Number((await scatter.getAttribute('aria-label')).match(/^(\d+)/)[1]);
      if (landingCount < 1) throw new Error('No landing points were plotted');
      await seen(scatter, 'landing scatter', clip);
      await seen(page.getByText('Sample 50% radius', { exact: true }), 'containment radii', clip);
      // The ring legend sits under the scatter; a crop that cuts it reads as a broken image.
      await seen(page.getByText(/99% of samples within/), 'ring legend', clip);
      console.log(`  montecarlo: ${requestedShown} runs, ${nominal} supported nominal, ${landingCount} plotted`);
    });
  }

  console.log(JSON.stringify({ out, images: shots }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
