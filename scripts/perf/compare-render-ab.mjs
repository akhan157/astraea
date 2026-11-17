// Interleaved render-cost probe for the 3D workstation: baseline dist vs a
// candidate worktree, in one browser and one time window.
//
// Alternates the variants so host drift (turbo/thermal/load) hits both instead
// of being mistaken for a regression. Measures an orbit drag (rAF frame rate,
// p50/p95 frame, main-thread task seconds from CDP Performance metrics, drawing
// buffer before/after) and then 3 s of Flight playback.
//
// Real-GPU numbers need a full Chromium passed via `--chromium`: the default is
// whatever `playwright` resolves for this host (often the headless shell build),
// which may render in software. The closing summary prints the WebGL renderer
// string per variant, so a SwiftShader/llvmpipe fallback is visible.
//
// Usage:
//   node scripts/perf/compare-render-ab.mjs \
//     --baseline-dist <baseline-dist> \
//     --after-root <lane-worktree> \
//     --runs 4 --out <evidence>/perf-3d-viewing/render-ab.json \
//     [--chromium <chromium-executable>]
//
// Raw output stays outside Git.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const baselineDist = arg('baseline-dist');
const afterRoot = arg('after-root');
const outPath = arg('out');
const chromiumPath = arg('chromium');
const runs = Number(arg('runs', '4'));
if (!baselineDist || !afterRoot || !outPath) throw new Error('Usage: compare-render-ab.mjs --baseline-dist <dist> --after-root <root> --out <json> [--runs 4] [--chromium <path>]');
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer; 1 round is the smoke minimum');
await mkdir(dirname(outPath), { recursive: true });

const headers = await readFile(join(afterRoot, 'dist/_headers'), 'utf8');
const csp = headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
if (!csp) throw new Error('after dist/_headers has no Content-Security-Policy; run pnpm build first');

const serve = (root, outDir) => preview({
  root,
  ...(outDir ? { build: { outDir } } : {}),
  preview: { host: '127.0.0.1', port: 0, headers: { 'Content-Security-Policy': csp } },
});
const baselineServer = await serve(dirname(baselineDist), basename(baselineDist));
const afterServer = await serve(afterRoot);
const urls = {
  baseline: new URL('app/', baselineServer.resolvedUrls.local[0]).href,
  after: new URL('app/', afterServer.resolvedUrls.local[0]).href,
};

const browser = await chromium.launch({
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  args: ['--enable-gpu', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'],
});
const metric = (m, n) => m.metrics.find((x) => x.name === n)?.value ?? 0;

async function startFrames(page) {
  await page.evaluate(() => {
    window.__frames = { deltas: [], on: true };
    let last = performance.now();
    const tick = (t) => {
      const f = window.__frames;
      if (!f || !f.on) return;
      f.deltas.push(t - last);
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopFrames(page) {
  return page.evaluate(() => {
    window.__frames.on = false;
    const d = window.__frames.deltas;
    const sorted = [...d].sort((a, b) => a - b);
    const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
    const total = d.reduce((a, b) => a + b, 0);
    return { count: d.length, totalMs: total, p50Ms: q(0.5), p95Ms: q(0.95), maxMs: sorted[sorted.length - 1] ?? null };
  });
}
const results = { baseline: [], after: [] };

async function canvasInfo(page) {
  return page.evaluate(() => {
    const c = document.querySelector('main canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
      buffer: [c.width, c.height],
      css: [Math.round(r.width), Math.round(r.height)],
      dpr: devicePixelRatio,
    };
  });
}

async function measure(variant, round) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  await page.addInitScript(() => localStorage.setItem('astraea.workstation.toured', '1'));
  await page.goto(urls[variant], { waitUntil: 'load', timeout: 60000 });
  await page.locator('[data-layout-state="ready"]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const settled = await canvasInfo(page);

  // Sustained orbit drag: every pointer move invalidates under frameloop=demand.
  await startFrames(page);
  const m0 = await cdp.send('Performance.getMetrics');
  const t0 = Date.now();
  await page.mouse.move(830, 380);
  await page.mouse.down();
  for (let i = 0; i < 260; i++) {
    const a = (i / 40) * Math.PI;
    await page.mouse.move(830 + Math.cos(a) * 60, 380 + Math.sin(a) * 26);
  }
  await page.mouse.up();
  const orbitRaf = await stopFrames(page);
  const orbitSeconds = (Date.now() - t0) / 1000;
  const m1 = await cdp.send('Performance.getMetrics');
  const afterOrbit = await canvasInfo(page);

  // Flight playback: the scrubber advances, the whole stage re-renders per tick.
  await page.getByRole('navigation', { name: 'Pipeline stages' }).getByRole('button', { name: /^Flight/ }).click();
  const slider = page.locator('[role="slider"][aria-label="Flight time"]');
  await slider.waitFor({ timeout: 60000 });
  const canvas = page.locator('main canvas:visible').first();
  await canvas.waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  const sliderStart = Number(await slider.getAttribute('aria-valuenow'));
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await startFrames(page);
  const m2 = await cdp.send('Performance.getMetrics');
  const t2 = Date.now();
  await play.click();
  await page.waitForTimeout(3000);
  const playRaf = await stopFrames(page);
  const m3 = await cdp.send('Performance.getMetrics');
  const playSeconds = (Date.now() - t2) / 1000;
  const sliderEnd = Number(await slider.getAttribute('aria-valuenow'));
  await page.getByRole('button', { name: 'Pause', exact: true }).click().catch(() => undefined);
  const playing = Number.isFinite(sliderStart) && Number.isFinite(sliderEnd) && sliderEnd > sliderStart;

  const result = {
    variant, round,
    settled, afterOrbit,
    orbit: {
      seconds: Number(orbitSeconds.toFixed(2)),
      frames: metric(m1, 'Frames') - metric(m0, 'Frames'),
      fps: Number(((metric(m1, 'Frames') - metric(m0, 'Frames')) / orbitSeconds).toFixed(1)),
      taskSeconds: Number((metric(m1, 'TaskDuration') - metric(m0, 'TaskDuration')).toFixed(3)),
      rafFrames: orbitRaf.count,
      rafFps: orbitRaf.totalMs > 0 ? Number((orbitRaf.count / (orbitRaf.totalMs / 1000)).toFixed(1)) : null,
      rafP50Ms: orbitRaf.p50Ms, rafP95Ms: orbitRaf.p95Ms, rafMaxMs: orbitRaf.maxMs,
    },
    playback: {
      seconds: Number(playSeconds.toFixed(2)),
      frames: metric(m3, 'Frames') - metric(m2, 'Frames'),
      fps: Number(((metric(m3, 'Frames') - metric(m2, 'Frames')) / playSeconds).toFixed(1)),
      rafFrames: playRaf.count,
      rafFps: playRaf.totalMs > 0 ? Number((playRaf.count / (playRaf.totalMs / 1000)).toFixed(1)) : null,
      rafP50Ms: playRaf.p50Ms, rafP95Ms: playRaf.p95Ms, rafMaxMs: playRaf.maxMs,
      sliderStart, sliderEnd, playing,
    },
    glRenderer: await page.evaluate(() => {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') ?? c.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null;
    }),
    errors,
  };
  await context.close();
  console.log(`${round} ${variant}: orbit raf ${result.orbit.rafFps} fps (${result.orbit.rafFrames} frames, p50 ${result.orbit.rafP50Ms} p95 ${result.orbit.rafP95Ms}, task ${result.orbit.taskSeconds}s, buffer ${settled?.buffer.join('x')}->${afterOrbit?.buffer.join('x')}); playback raf ${result.playback.rafFps} fps (${result.playback.rafFrames} frames, p50 ${result.playback.rafP50Ms}, ${sliderStart}->${sliderEnd}s)`);
  return result;
}

const median = (xs) => {
  const s = [...xs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const fixed = (x, digits = 1) => (x === null ? 'n/a' : x.toFixed(digits));

function summarize() {
  const summary = {};
  for (const variant of ['baseline', 'after']) {
    const r = results[variant];
    summary[variant] = {
      rounds: r.length,
      glRenderer: r[0]?.glRenderer ?? null,
      orbitRafFpsMedian: median(r.map((x) => x.orbit.rafFps)),
      orbitFpsMedian: median(r.map((x) => x.orbit.fps)),
      orbitTaskSecondsMedian: median(r.map((x) => x.orbit.taskSeconds)),
      orbitRafP50MsMedian: median(r.map((x) => x.orbit.rafP50Ms)),
      orbitRafP95MsMedian: median(r.map((x) => x.orbit.rafP95Ms)),
      playbackRafFpsMedian: median(r.map((x) => x.playback.rafFps)),
      playbackFpsMedian: median(r.map((x) => x.playback.fps)),
      settledBuffer: r[0]?.settled?.buffer ?? null,
      afterOrbitBuffer: r[0]?.afterOrbit?.buffer ?? null,
    };
  }
  // Paired delta: same-round after minus baseline, so each round cancels host drift.
  const paired = { orbitRafFps: [], orbitTaskSeconds: [], playbackRafFps: [] };
  for (let i = 0; i < Math.min(results.baseline.length, results.after.length); i++) {
    const b = results.baseline[i];
    const a = results.after[i];
    paired.orbitRafFps.push(a.orbit.rafFps - b.orbit.rafFps);
    paired.orbitTaskSeconds.push(a.orbit.taskSeconds - b.orbit.taskSeconds);
    paired.playbackRafFps.push(a.playback.rafFps - b.playback.rafFps);
  }
  summary.pairedMedianDelta = {
    orbitRafFps: median(paired.orbitRafFps),
    orbitRafFpsPct: median(paired.orbitRafFps.map((d, i) => (results.baseline[i].orbit.rafFps ? Number((100 * d / results.baseline[i].orbit.rafFps).toFixed(1)) : null))),
    orbitTaskSeconds: median(paired.orbitTaskSeconds),
    playbackRafFps: median(paired.playbackRafFps),
    playbackRafFpsPct: median(paired.playbackRafFps.map((d, i) => (results.baseline[i].playback.rafFps ? Number((100 * d / results.baseline[i].playback.rafFps).toFixed(1)) : null))),
  };
  return summary;
}

let summary;
try {
  for (let round = 1; round <= runs; round++) {
    const order = round % 2 === 1 ? ['baseline', 'after'] : ['after', 'baseline'];
    for (const variant of order) results[variant].push(await measure(variant, round));
  }
} finally {
  summary = summarize();
  await writeFile(outPath, `${JSON.stringify({ urls, summary, results }, null, 2)}\n`);
  await browser.close();
  await baselineServer.close();
  await afterServer.close();
}

console.log('');
console.log(`glRenderer baseline ${JSON.stringify(summary.baseline.glRenderer)} (${summary.baseline.settledBuffer?.join('x')} -> ${summary.baseline.afterOrbitBuffer?.join('x')})`);
console.log(`glRenderer after    ${JSON.stringify(summary.after.glRenderer)} (${summary.after.settledBuffer?.join('x')} -> ${summary.after.afterOrbitBuffer?.join('x')})`);
console.log(`orbit rAF fps       baseline ${fixed(summary.baseline.orbitRafFpsMedian)}  after ${fixed(summary.after.orbitRafFpsMedian)}  paired ${fixed(summary.pairedMedianDelta.orbitRafFps)} (${fixed(summary.pairedMedianDelta.orbitRafFpsPct)}%)`);
console.log(`orbit task seconds  baseline ${fixed(summary.baseline.orbitTaskSecondsMedian, 3)}  after ${fixed(summary.after.orbitTaskSecondsMedian, 3)}  paired ${fixed(summary.pairedMedianDelta.orbitTaskSeconds, 3)}`);
console.log(`playback rAF fps    baseline ${fixed(summary.baseline.playbackRafFpsMedian)}  after ${fixed(summary.after.playbackRafFpsMedian)}  paired ${fixed(summary.pairedMedianDelta.playbackRafFps)} (${fixed(summary.pairedMedianDelta.playbackRafFpsPct)}%)`);
console.log(`written ${outPath}`);
