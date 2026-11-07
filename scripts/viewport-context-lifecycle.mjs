// Focused viewport WebGL lifecycle regression. Runs against the built app
// under its production CSP, so it exercises the same bytes the acceptance
// journeys do.
//
// The rule this pins: stage navigation, 2D/3D view switches and a lost-context
// restore must not create a WebGL context per canvas mount. The viewport owns
// one renderer for the page; a Restore creates exactly one replacement and no
// throwaway probe. WebKit keeps a lost context in its 16-slot active set until
// the context object is collected, so this count is what keeps the browser from
// recycling a context and logging the two CI errors.
//
// Usage: pnpm build && pnpm test:viewport-context
//        ASTRAEA_BROWSER=webkit pnpm test:viewport-context
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';
import { expect } from 'playwright/test';
import { preview } from 'vite';

const browserName = process.env.ASTRAEA_BROWSER ?? 'chromium';
const browserType = { chromium, firefox, webkit }[browserName];
assert.ok(browserType, `Unknown ASTRAEA_BROWSER: ${browserName}`);

const headers = await readFile(new URL('../dist/_headers', import.meta.url), 'utf8');
const csp = headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
assert.ok(csp, 'dist/_headers must carry the production Content-Security-Policy');

const server = await preview({
  preview: { host: '127.0.0.1', port: 0, open: false, headers: { 'Content-Security-Policy': csp } },
});
const origin = server.resolvedUrls.local[0];
const SWITCHES = 60;

let browser;
try {
  browser = await browserType.launch(browserName === 'chromium' ? {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  } : {});
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });

  // Count real WebGL context creations, which canvas they belong to, and draw
  // calls. The availability probe creates a detached canvas, the viewport
  // renderer creates the marked one, and R3F's placeholder must never get a
  // context of its own.
  await page.addInitScript(() => {
    const probe = { created: [], placeholderCalls: 0, drawCalls: 0, lost: [], restored: [] };
    window.__ctxProbe = probe;
    const ids = new WeakMap();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const isGL = /^webgl/.test(String(type));
      if (isGL && this.isConnected && this.closest('main') && this.dataset.viewportCanvas !== 'true') {
        probe.placeholderCalls += 1;
      }
      const gl = original.call(this, type, ...rest);
      if (gl && isGL && !ids.has(this)) {
        const id = probe.created.length;
        ids.set(this, id);
        gl.__ctxId = id;
        this.dataset.ctxId = String(id);
        probe.created.push({
          id,
          type: String(type),
          shared: this.dataset.viewportCanvas === 'true',
          inMain: Boolean(this.closest('main')),
          connected: this.isConnected,
        });
      }
      return gl;
    };
    for (const proto of [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]) {
      if (!proto) continue;
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
        const fn = proto[name];
        if (typeof fn !== 'function' || fn.__ctxProbeWrapped) continue;
        proto[name] = function (...args) {
          probe.drawCalls += 1;
          return fn.apply(this, args);
        };
        proto[name].__ctxProbeWrapped = true;
      }
    }
    addEventListener('webglcontextlost', (event) => probe.lost.push(ids.get(event.target) ?? null), true);
    addEventListener('webglcontextrestored', (event) => probe.restored.push(ids.get(event.target) ?? null), true);
  });
  await page.addInitScript(() => localStorage.setItem('astraea.workstation.toured', '1'));

  const stage = (name) => page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name, exact: true }).click();
  const view = (name) => page.getByRole('radio', { name, exact: true }).click();
  const actualCanvas = () => page.locator('main canvas[data-viewport-canvas="true"]');
  const waitForActualCanvas = async () => {
    await actualCanvas().waitFor({ state: 'visible', timeout: 30_000 });
  };
  const waitForViewportSignal = async () => {
    await page.locator('main canvas:visible, [data-webgl-fallback="true"]').first().waitFor({ timeout: 30_000 });
  };

  const state = () => page.evaluate(() => {
    const shell = document.querySelector('[data-layout-state]');
    const attr = (name) => shell?.getAttribute(name) ?? null;
    const cannii = [...document.querySelectorAll('main canvas')];
    const visible = cannii.filter((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(canvas).visibility !== 'hidden';
    });
    const actual = document.querySelector('main canvas[data-viewport-canvas="true"]');
    const gl = actual ? (actual.getContext('webgl2') ?? actual.getContext('webgl')) : null;
    const rect = actual?.getBoundingClientRect();
    const nums = (text) => {
      const values = (text ?? '').split(',').filter((v) => v !== '').map(Number);
      return values.length > 0 && values.every(Number.isFinite) ? values : null;
    };
    return {
      created: window.__ctxProbe.created.map((entry) => ({ ...entry })),
      placeholderCalls: window.__ctxProbe.placeholderCalls,
      drawCalls: window.__ctxProbe.drawCalls,
      lostEvents: window.__ctxProbe.lost.length,
      restoredEvents: window.__ctxProbe.restored.length,
      cannii: cannii.map((canvas) => ({
        viewport: canvas.dataset.viewportCanvas === 'true',
        visibility: getComputedStyle(canvas).visibility,
        connected: canvas.isConnected,
        ctxId: canvas.dataset.ctxId ?? null,
      })),
      visible: visible.length,
      actual: actual ? {
        ctxId: actual.dataset.ctxId ? Number(actual.dataset.ctxId) : null,
        lost: gl ? gl.isContextLost() : null,
        rect: rect ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : null,
        buffer: { w: actual.width, h: actual.height },
        dpr: window.devicePixelRatio,
      } : null,
      fallback: document.querySelectorAll('[data-webgl-fallback="true"]').length,
      layoutState: attr('data-layout-state'),
      markers: attr('data-markers'),
      bbox: nums(attr('data-rocket-bbox')),
      hull: attr('data-rocket-hull') ?? '',
      orbitVersion: Number(attr('data-orbit-version') ?? '-1'),
      orbitTurned: Number(attr('data-orbit-turned') ?? '-1'),
      cameraDir: attr('data-camera-dir'),
      cameraAspect: Number(attr('data-camera-aspect') ?? 'NaN'),
      cameraPose: attr('data-camera-pose'),
      poseQ: attr('data-pose-q'),
      fit: Number(attr('data-fit-fraction') ?? 'NaN'),
      viewportSize: nums(attr('data-viewport-size')),
      gizmo: nums(attr('data-gizmo-rect')),
      hovered: attr('data-look-hovered'),
      selected: attr('data-look-selected'),
      selectedRows: [...document.querySelectorAll('[role="treeitem"][aria-selected="true"]')]
        .map((row) => row.getAttribute('data-component-id')),
      img2d: Boolean(document.querySelector('[role="img"][aria-label="Side and aft views with dimensions"]')),
    };
  });

  const expectOneVisibleCanvas = async (label) => {
    const s = await state();
    assert.equal(s.visible, 1, `${label}: exactly one visible canvas expected, got ${s.visible}`);
    assert.equal(s.cannii.filter((canvas) => canvas.viewport).length, 1, `${label}: the shared viewport canvas must be present`);
    assert.equal(s.fallback, 0, `${label}: the WebGL fallback must not be showing`);
    return s;
  };
  const expectDraws = async (label) => {
    const before = (await state()).drawCalls;
    await expect.poll(async () => (await state()).drawCalls, {
      message: `${label}: the viewport must keep drawing frames`,
      timeout: 10_000,
    }).toBeGreaterThan(before);
  };
  const expectNoNewContext = async (created, label) => {
    const s = await state();
    assert.equal(s.created.length, created, `${label}: navigation must not create a WebGL context (created ${s.created.length}, was ${created})`);
    assert.equal(s.placeholderCalls, 0, `${label}: R3F's contextless placeholder must never get a context`);
    return s;
  };
  const rocketPoint = async () => {
    const s = await state();
    assert.ok(s.actual && s.bbox, 'the viewport must report the rocket box');
    const [x0, y0, x1, y1] = s.bbox;
    return { x: s.actual.rect.x + (x0 + x1) / 2, y: s.actual.rect.y + (y0 + y1) / 2, state: s };
  };

  // ── Load, run, and settle on Airframe ─────────────────────────────────────
  const response = await page.goto(new URL('app/', origin).href);
  assert.equal(response?.status(), 200, 'app must load');
  await page.getByRole('banner').getByRole('button', { name: /Run simulation/ }).click({ timeout: 120_000 });
  await page.locator('[aria-label^="Apogee (committed run) "]').waitFor({ timeout: 120_000 });
  await waitForViewportSignal();
  await stage('Airframe');
  await waitForActualCanvas();
  await expectDraws('initial Airframe');

  const initial = await state();
  assert.ok(initial.created.length >= 1 && initial.created.length <= 2,
    `initial page must use at most two WebGL contexts (available probe + viewport renderer); got ${initial.created.length}`);
  assert.equal(initial.created.filter((entry) => entry.shared).length, 1, 'exactly one viewport renderer context expected');
  assert.equal(initial.placeholderCalls, 0, 'R3F placeholder got a WebGL context at startup');
  const placeholder = initial.cannii.find((canvas) => !canvas.viewport);
  assert.ok(placeholder, 'R3F placeholder canvas must still exist for measurement/events');
  assert.equal(placeholder.visibility, 'hidden', 'R3F placeholder must be hidden so one canvas is visible');
  assert.equal(initial.cannii.length, 2, 'one actual canvas plus one hidden placeholder expected');
  const initialCreated = initial.created.length;
  const sharedCtx = initial.actual.ctxId;
  assert.ok(sharedCtx !== null, 'the visible canvas must own the shared context');
  console.log(`lifecycle ${browserName}: initial contexts ${initialCreated}, visible canvases ${initial.visible}, placeholder contexts ${initial.placeholderCalls}`);

  // ── Camera fit follows resize; the shared canvas is the measured one ─────
  for (const [width, height] of [[1280, 800], [1600, 1000]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(async () => {
      const s = await state();
      if (!s.actual?.rect || !s.viewportSize) return false;
      return Math.abs(s.viewportSize[0] - s.actual.rect.w) <= 1.5
        && Math.abs(s.viewportSize[1] - s.actual.rect.h) <= 1.5
        && s.fit > 0.74 && s.fit < 0.86
        && Math.abs(s.cameraAspect - s.actual.rect.w / s.actual.rect.h) < 0.01;
    }, { message: `${width}×${height}: the fitted camera must follow the actual canvas size`, timeout: 20_000 }).toBe(true);
    await expectNoNewContext(initialCreated, `${width}×${height} resize`);
    await expectDraws(`${width}×${height} resize`);
  }

  // ── Presets, orbit drag and viewcube still drive the shared renderer ─────
  const isoDir = (await state()).cameraDir;
  assert.ok(isoDir, 'the viewport must report the initial camera direction');
  const resetIso = async () => {
    await page.getByRole('radio', { name: 'ISO', exact: true }).click();
    await expect.poll(async () => (await state()).cameraDir, { message: 'ISO must settle the camera', timeout: 10_000 }).toBe(isoDir);
    // A preset snap writes the fit immediately; OrbitControls damping can still
    // move the camera for a few frames. Wait until the camera stops turning so
    // the rocket box and the drawn pixels agree when the pointer is aimed.
    await expect.poll(async () => {
      const version = (await state()).orbitVersion;
      await page.waitForTimeout(120);
      return version === (await state()).orbitVersion;
    }, { message: 'the ISO camera must stop damping', timeout: 5_000 }).toBe(true);
  };
  await page.getByRole('radio', { name: 'SIDE', exact: true }).click();
  await expect.poll(async () => (await state()).cameraDir, { message: 'SIDE must re-orient the camera', timeout: 10_000 }).not.toBe(isoDir);
  await resetIso();

  let point = await rocketPoint();
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 70, point.y + 18, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await state()).orbitVersion, { message: 'a canvas drag must orbit the camera', timeout: 10_000 })
    .toBeGreaterThan(initial.orbitVersion);
  await resetIso();

  const cube = (await state()).gizmo;
  assert.ok(cube, 'the viewport must report the viewcube footprint');
  const cubePoint = { x: cube[0] + (cube[2] - cube[0]) / 2, y: cube[1] + (cube[3] - cube[1]) / 2 };
  const canvasRect = (await state()).actual.rect;
  const orbitBeforeCube = (await state()).orbitVersion;
  let cubeClicked = false;
  for (const [dx, dy] of [[18, -5], [-18, -5], [0, -29], [0, 18]]) {
    await page.mouse.click(canvasRect.x + cubePoint.x + dx, canvasRect.y + cubePoint.y + dy);
    try {
      await expect.poll(async () => (await state()).orbitVersion, { timeout: 3_000 }).toBeGreaterThan(orbitBeforeCube);
      cubeClicked = true;
      break;
    } catch {
      /* try the next face */
    }
  }
  assert.ok(cubeClicked, 'clicking the viewcube must turn the camera');
  await resetIso();

  // ── Picker and hover go through the shared canvas/event source ───────────
  point = await rocketPoint();
  // Enter the canvas from outside: a hover is a pointer entering the rocket,
  // not a value left behind by the previous toolbar/viewcube click.
  await page.mouse.move(20, 400);
  await page.mouse.move(point.x, point.y);
  await expect.poll(async () => (await state()).hovered, { message: 'hovering the rocket must reach the viewport picker', timeout: 10_000 })
    .not.toBe('');
  const hovered = (await state()).hovered;
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await state()).selected, { message: 'clicking the rocket must select a part', timeout: 10_000 })
    .not.toBe('');
  const selected = await state();
  assert.equal(selected.selected, hovered, 'the clicked part must be the hovered part');
  assert.deepEqual(selected.selectedRows, [hovered], 'the parts tree must show the picked part selected');

  // Selecting a part opens the inspector, which resizes the canvas. Close it
  // so the mode checks measure the same wide viewport as before.
  const inspector = page.getByRole('button', { name: 'Toggle inspector' });
  if (await inspector.getAttribute('aria-expanded') === 'true') await inspector.click();
  await expect.poll(async () => {
    const s = await state();
    return s.actual && Math.abs(s.viewportSize[0] - s.actual.rect.w) <= 1.5;
  }, { message: 'the canvas must settle after closing the inspector', timeout: 10_000 }).toBe(true);
  await expectNoNewContext(initialCreated, 'picker');

  // ── Airframe 3D / split / 2D, Aero and Flight on the same context ────────
  await view('2D');
  await expect(page.getByRole('img', { name: 'Side and aft views with dimensions' })).toBeVisible();
  await expect.poll(async () => (await state()).cannii.length, { message: '2D must unmount the 3D canvas', timeout: 10_000 }).toBe(0);
  await expectNoNewContext(initialCreated, '2D view');

  await view('3D + 2D');
  await waitForActualCanvas();
  await expect(page.getByRole('img', { name: 'Side and aft views with dimensions' })).toBeVisible();
  let split = await expectOneVisibleCanvas('split view');
  assert.equal(split.actual.ctxId, sharedCtx, 'split view must reuse the shared context');
  await expectNoNewContext(initialCreated, 'split view');
  await expectDraws('split view');

  await view('3D');
  await waitForActualCanvas();
  await expectOneVisibleCanvas('3D view');
  await expectNoNewContext(initialCreated, '3D view');
  await expectDraws('3D view');

  await stage('Aero');
  await waitForActualCanvas();
  const aero = await expectOneVisibleCanvas('Aero');
  assert.equal(aero.actual.ctxId, sharedCtx, 'Aero must reuse the shared context');
  await expect.poll(async () => (await state()).markers, { message: 'Aero must draw its markers on the shared renderer', timeout: 20_000 }).toBe('present');
  await expectNoNewContext(initialCreated, 'Aero');
  await expectDraws('Aero');
  await expect.poll(async () => (await state()).bbox, { message: 'Aero must report the rocket box', timeout: 10_000 }).not.toBeNull();

  await stage('Flight');
  await page.getByRole('tab', { name: 'Timeline', exact: true }).click();
  await waitForActualCanvas();
  const flight = await expectOneVisibleCanvas('Flight');
  assert.equal(flight.actual.ctxId, sharedCtx, 'Flight must reuse the shared context');
  assert.equal(flight.cameraPose, 'upright', 'Flight must use the attitude-posed camera');
  assert.ok(flight.poseQ, 'Flight must report the drawn pose');
  await expectNoNewContext(initialCreated, 'Flight');
  await expectDraws('Flight');
  const scrubber = page.locator('input[aria-label="Flight scrubber"]');
  const max = Number(await scrubber.getAttribute('max'));
  assert.ok(Number.isFinite(max) && max > 0, 'Flight scrubber must expose its range');
  const poseBefore = (await state()).poseQ;
  await scrubber.evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, max * 0.5);
  await expect.poll(async () => (await state()).poseQ, { message: 'the Flight scrubber must re-pose the rocket', timeout: 10_000 }).not.toBe(poseBefore);
  const posed = await state();
  assert.ok(posed.fit > 0.74 && posed.fit < 0.86, `Flight fit must stay near 80% (got ${posed.fit})`);
  const [bx0, by0, bx1, by1] = posed.bbox;
  assert.ok(bx0 >= -0.5 && by0 >= -0.5 && bx1 <= posed.actual.rect.w + 0.5 && by1 <= posed.actual.rect.h + 0.5,
    `Flight rocket must stay inside the canvas (box ${posed.bbox}, canvas ${[posed.actual.rect.w, posed.actual.rect.h]})`);

  await stage('Airframe');
  await waitForActualCanvas();
  await expectOneVisibleCanvas('Airframe return');
  await expectNoNewContext(initialCreated, 'Aero/Flight round trip');

  // ── The failure reproducer: many stage mounts must create nothing ───────
  for (let i = 0; i < SWITCHES; i += 1) {
    await stage('Mission');
    await expect.poll(async () => (await state()).cannii.length, {
      message: `switch ${i + 1}: the non-3D stage must unmount the canvas`,
      timeout: 10_000,
    }).toBe(0);
    await stage('Airframe');
    await waitForActualCanvas();
    const s = await state();
    assert.equal(s.created.length, initialCreated, `switch ${i + 1}: stage navigation created a new WebGL context`);
    assert.equal(s.actual.ctxId, sharedCtx, `switch ${i + 1}: the visible context must stay the shared one`);
    assert.equal(s.visible, 1, `switch ${i + 1}: exactly one visible canvas expected`);
    assert.equal(s.placeholderCalls, 0, `switch ${i + 1}: R3F placeholder got a context`);
  }
  await expectDraws('after 60 stage switches');
  console.log(`lifecycle ${browserName}: ${SWITCHES} stage switches, still ${initialCreated} contexts`);

  // ── Loss, fallback and restore: exactly one replacement context ─────────
  const beforeLoss = await state();
  const lost = await page.evaluate(() => {
    const canvas = document.querySelector('main canvas[data-viewport-canvas="true"]');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return gl.isContextLost();
  });
  assert.ok(lost, 'the browser must expose WEBGL_lose_context for the loss step');
  await page.locator('[data-webgl-fallback="true"]').waitFor({ state: 'visible', timeout: 30_000 });
  const lostState = await state();
  assert.equal(lostState.fallback, 1, 'the labeled fallback must show after context loss');
  assert.equal(lostState.cannii.length, 0, 'the lost canvas must be removed while the fallback shows');
  assert.ok(lostState.lostEvents >= 1, 'the viewport must observe the context-loss event');

  // A lost shared context can outlive the viewport that lost it. Leaving and
  // re-entering the stage must show the fallback again (not a blank canvas and
  // not a new context), and Restore must still work from there.
  await stage('Mission');
  await stage('Airframe');
  await page.locator('[data-webgl-fallback="true"]').waitFor({ state: 'visible', timeout: 30_000 });
  const remounted = await state();
  assert.equal(remounted.created.length, beforeLoss.created.length, 're-entering a stage with a lost shared context must not create a context');
  assert.equal(remounted.fallback, 1, 're-entering a stage with a lost shared context must show the fallback');
  assert.equal(remounted.cannii.length, 0, 're-entering a stage with a lost shared context must not mount a dead canvas');

  await page.getByRole('button', { name: 'Restore viewport', exact: true }).click();
  await waitForActualCanvas();
  await expect.poll(async () => (await state()).fallback, { message: 'restore must leave the fallback', timeout: 20_000 }).toBe(0);
  const restored = await expectOneVisibleCanvas('restored viewport');
  assert.equal(restored.created.length, beforeLoss.created.length + 1,
    `restore must create one replacement context, not a throwaway probe plus a renderer (created ${restored.created.length}, was ${beforeLoss.created.length})`);
  assert.notEqual(restored.actual.ctxId, beforeLoss.actual.ctxId, 'restore must replace the lost context');
  await expectDraws('restored viewport');
  await expect.poll(async () => {
    const value = (await state()).fit;
    return value > 0.74 && value < 0.86;
  }, { message: 'the restored fit must return to about 80%', timeout: 20_000 }).toBe(true);

  // Events must work on the replacement canvas too. Move onto the rocket,
  // away, and back so the new root demonstrably produces over/out, not a
  // stale store value from the pre-loss viewport.
  point = await rocketPoint();
  await page.mouse.move(20, 400);
  await page.mouse.move(point.x, point.y);
  await expect.poll(async () => (await state()).hovered, { message: 'hover must work after restore', timeout: 10_000 }).not.toBe('');
  await page.mouse.move(restored.actual.rect.x + 5, restored.actual.rect.y + 5);
  await expect.poll(async () => (await state()).hovered, { message: 'moving off the rocket clears hover after restore', timeout: 10_000 }).toBe('');
  await page.mouse.move(point.x, point.y);
  await expect.poll(async () => (await state()).hovered, { message: 'hover must re-enter after restore', timeout: 10_000 }).not.toBe('');
  await page.mouse.click(point.x, point.y);
  await expect.poll(async () => (await state()).selected, { message: 'picking must work after restore', timeout: 10_000 }).not.toBe('');

  // ── Final invariants ────────────────────────────────────────────────────
  const final = await state();
  assert.equal(final.created.length, beforeLoss.created.length + 1, 'no context may be created after the restore replacement');
  assert.equal(final.placeholderCalls, 0, 'R3F placeholder must never own a context');
  assert.equal(final.visible, 1, 'exactly one visible canvas must remain');
  assert.deepEqual(errors, [], 'Browser runtime / CSP errors');

  console.log(`Viewport context lifecycle passed (${browserName}): initial ${initialCreated} contexts, ${SWITCHES} switches, restore +1, placeholder contexts 0, console errors 0`);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close((error) => (error ? reject(error) : resolve())));
}
