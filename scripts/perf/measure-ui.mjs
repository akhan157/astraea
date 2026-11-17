// Profile-first UI/startup probe for the perf lane.
//
// Serves the built app (dist) under its production CSP, loads it in headless
// Chromium, and records the user-visible startup path: navigation/paint, time
// until the app's own on-load 6-DOF run commits, long tasks, stage-switch
// latency, canvas frame cadence, CPU profile, JS coverage and resource bytes.
//
// Usage: pnpm build && node scripts/perf/measure-ui.mjs --out <dir> [--runs 3] [--label baseline] [--gpu] [--no-webgl] [--browser webkit]
//
// --no-webgl forces the app's SVG 2D fallback, separating chart/CPU work from
// SwiftShader canvas cost in headless runs.
//
// Raw output stays outside Git. Headless Chromium uses SwiftShader, so frame
// numbers are relative (before/after), not GPU-absolute.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { preview } from 'vite';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const outDir = arg('out');
if (!outDir) throw new Error('Usage: node scripts/perf/measure-ui.mjs --out <dir> [--runs 3] [--label baseline]');
const runs = Number(arg('runs', '3'));
const label = arg('label', 'run');
const noWebgl = process.argv.includes('--no-webgl');
const useGpu = process.argv.includes('--gpu');
const browserName = arg('browser', 'chromium');
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unknown --browser ${browserName}`);

const headers = await readFile(new URL('../../dist/_headers', import.meta.url), 'utf8');
const csp = headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
if (!csp) throw new Error('dist/_headers has no Content-Security-Policy; run pnpm build first');
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, open: false, headers: { 'Content-Security-Policy': csp } },
});
const appUrl = new URL('app/', server.resolvedUrls.local[0]).href;
const out = join(outDir, label);
await mkdir(out, { recursive: true });
const glRenderer = useGpu ? 'gpu' : noWebgl ? 'none' : 'swiftshader';

const browser = await browserType.launch(browserName === 'chromium' ? {
  args: noWebgl
    ? ['--disable-webgl', '--disable-3d-apis']
    : useGpu
      ? ['--enable-gpu', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
} : {});
const all = { label, appUrl, browserName, glRenderer, runs: [] };
let cpuProfile = null;

async function newProfiledPage() {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const perf = { marks: [], longtasks: [], paints: [], resources: [] };
    window.__perf = perf;
    const rec = (name) => perf.marks.push({ name, t: performance.now() });
    rec('init');
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) perf.longtasks.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* longtask unsupported */ }
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) perf.paints.push({ name: e.name, start: e.startTime });
    }).observe({ type: 'paint', buffered: true });
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) perf.lcp = { start: e.startTime, size: e.size };
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* LCP unsupported */ }
    const watch = () => {
      const footer = document.querySelector('footer');
      if (!footer) return requestAnimationFrame(watch);
      const check = () => {
        const text = footer.textContent ?? '';
        if (!perf.sawRunning && text.includes('Running 6-DOF')) { perf.sawRunning = true; rec('run-start'); }
        if (!perf.runDone && /Committed · r\d+/.test(text)) { perf.runDone = true; rec('run-done'); }
        const ms = text.match(/·\s*(\d+)\s*ms/);
        if (ms) perf.engineMs = Number(ms[1]);
      };
      check();
      new MutationObserver(check).observe(footer, { subtree: true, childList: true, characterData: true });
    };
    document.addEventListener('DOMContentLoaded', watch);
  });
  return { context, page };
}

/** Click a stage rail button and time click → two animation frames (commit + paint). */
async function stageSwitch(page, stageLabel, rounds) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const sample = await page.evaluate(async (labelText) => {
      const buttons = [...document.querySelectorAll('nav[aria-label="Pipeline stages"] button')];
      const button = buttons.find((b) => (b.textContent ?? '').trim().startsWith(labelText));
      if (!button) throw new Error(`stage button ${labelText} not found`);
      const t = performance.now();
      button.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - t;
    }, stageLabel);
    samples.push(Number(sample.toFixed(2)));
  }
  return samples;
}

/** rAF deltas over `frames` frames on the current stage. */
async function frameCadence(page, frames = 120) {
  return page.evaluate((count) => new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    const step = (t) => {
      deltas.push(t - last);
      last = t;
      if (deltas.length < count) requestAnimationFrame(step);
      else resolve(deltas);
    };
    requestAnimationFrame(step);
  }), frames);
}

function summarizeFrames(deltas) {
  const sorted = [...deltas].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { frames: sorted.length, medianMs: q(0.5), p95Ms: q(0.95), maxMs: sorted[sorted.length - 1] };
}

/** Self time per function from a V8 CPU profile (sample interval 200 µs). */
function summarizeCpuProfile(profile, intervalUs) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (const node of profile.nodes) {
    if (!node.hitCount) continue;
    const cf = node.callFrame;
    const key = `${cf.functionName || '(anonymous)'} ${cf.url.replace(appUrl, '')}:${cf.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + node.hitCount * intervalUs / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  return {
    sampledMs: Number(total.toFixed(1)),
    top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)
      .map(([fn, ms]) => ({ fn, selfMs: Number(ms.toFixed(1)), pct: Number((100 * ms / total).toFixed(1)) })),
  };
}

for (let run = 1; run <= runs; run++) {
  const { context, page } = await newProfiledPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

  const cdp = await context.newCDPSession(page);
  const profileThisRun = run === 1;
  if (profileThisRun) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true }).catch(() => undefined);

  const t0 = Date.now();
  const response = await page.goto(appUrl, { waitUntil: 'load' });
  if (!response?.headers()['content-security-policy']) throw new Error('app served without production CSP');
  await page.locator('nav[aria-label="Pipeline stages"]').waitFor({ state: 'visible', timeout: 30000 });
  const shellReadyMs = Date.now() - t0;
  await page.waitForFunction(() => window.__perf?.runDone === true, undefined, { timeout: 90000 });
  const runDoneMs = Date.now() - t0;
  await page.waitForTimeout(500);

  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return n ? {
      ttfb: n.responseStart, domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd,
      transferSize: n.transferSize, encodedBodySize: n.encodedBodySize,
    } : null;
  });
  const perf = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource').map((r) => ({
      name: r.name.split('/').pop(), type: r.initiatorType, transfer: r.transferSize, decoded: r.decodedBodySize, duration: r.duration,
    })).sort((a, b) => b.transfer - a.transfer);
    return {
      marks: window.__perf.marks, longtasks: window.__perf.longtasks, paints: window.__perf.paints,
      lcp: window.__perf.lcp, engineMs: window.__perf.engineMs, resources,
      stageRows: document.querySelectorAll('[role="table"] [role="row"][data-table-section]').length,
    };
  });

  // Startup profile ends here: everything after this point is interaction.
  let coverage = null;
  if (profileThisRun) {
    const { profile } = await cdp.send('Profiler.stop');
    cpuProfile = summarizeCpuProfile(profile, 200);
    await writeFile(join(out, 'cpuprofile-startup.json'), `${JSON.stringify(profile)}\n`);
    const cov = await cdp.send('Profiler.takePreciseCoverage').catch(() => null);
    if (cov) {
      const scripts = cov.result.map((s) => {
        const url = s.url || `(inline ${s.scriptId})`;
        const total = s.functions.reduce((a, f) => a + f.ranges.reduce((x, r) => x + r.endOffset - r.startOffset, 0), 0);
        const used = s.functions.reduce((a, f) => a + f.ranges.reduce((x, r) => x + (r.count > 0 ? r.endOffset - r.startOffset : 0), 0), 0);
        return { script: url.split('/').pop(), total, used, usedPct: total ? Number((100 * used / total).toFixed(1)) : 0 };
      }).filter((s) => s.total > 20000).sort((a, b) => b.total - a.total);
      coverage = { scripts };
    }
  }

  // Main-thread wasm compile cost with the same bytes the app ships.
  const wasmBench = profileThisRun ? await page.evaluate(async () => {
    const entry = performance.getEntriesByType('resource').find((r) => /astraea_engine.*\.wasm/.test(r.name));
    if (!entry) return null;
    const out = { url: entry.name.split('/').pop(), bytes: entry.decodedBodySize, compileMs: [], compileStreamingMs: [] };
    for (let i = 0; i < 3; i++) {
      const bytes = await (await fetch(entry.name, { cache: 'no-store' })).arrayBuffer();
      const a = performance.now();
      await WebAssembly.compile(bytes);
      out.compileMs.push(Number((performance.now() - a).toFixed(1)));
      const b = performance.now();
      await WebAssembly.compileStreaming(fetch(entry.name, { cache: 'no-store' }));
      out.compileStreamingMs.push(Number((performance.now() - b).toFixed(1)));
    }
    return out;
  }) : null;

  // Warm re-run: same pool/worker, so this isolates engine math from first-call
  // module compile, worker spawn and identity hashing.
  const revBefore = await page.locator('footer').textContent();
  const warmStart = Date.now();
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction((before) => {
    const text = document.querySelector('footer')?.textContent ?? '';
    return /Committed · r\d+/.test(text) && text !== before;
  }, revBefore, { timeout: 90000 }).catch(() => undefined);
  const warmRerunMs = Date.now() - warmStart;
  const warmFooter = (await page.locator('footer').textContent()) ?? '';
  const warmEngineMs = Number(warmFooter.match(/·\s*(\d+)\s*ms/)?.[1] ?? NaN);

  // Interactive: measure stage switches and canvas cadence on the settled app.
  const switches = {};
  for (const stageLabel of ['Aero', 'Flight', 'Verify', 'Airframe']) {
    switches[stageLabel] = await stageSwitch(page, stageLabel, 5);
  }
  const framesAirframe = summarizeFrames(await frameCadence(page, 120));
  await stageSwitch(page, 'Flight', 1);
  const flightTableRows = await page.locator('[role="table"] [role="row"][data-table-section]').count();
  const framesFlight = summarizeFrames(await frameCadence(page, 120));

  // Scrub drag over the flight timeline: the cursor updates the whole chart on
  // every pointer move, so this is the telemetry-render interaction probe.
  const chartPoints = await page.evaluate(() => {
    const path = [...document.querySelectorAll('svg path[d]')].map((p) => (p.getAttribute('d') ?? '').split('L').length - 1);
    return path.length ? Math.max(...path) : 0;
  });
  let scrub = null;
  let scrubProfile = null;
  const slider = page.locator('[role="slider"][aria-label="Flight time"]');
  if (await slider.count()) {
    if (profileThisRun) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    await page.evaluate(() => {
      window.__scrub = { deltas: [], on: true, longtasks: [] };
      let last = performance.now();
      const tick = (t) => {
        if (!window.__scrub.on) return;
        window.__scrub.deltas.push(t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__scrub.longtasks.push(e.duration);
      }).observe({ type: 'longtask' });
    });
    const box = await slider.boundingBox();
    if (box) {
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + 6, y);
      await page.mouse.down();
      for (let step = 1; step <= 40; step++) {
        await page.mouse.move(box.x + 6 + (box.width - 12) * step / 40, y);
      }
      await page.mouse.up();
    }
    const raw = await page.evaluate(() => { window.__scrub.on = false; return window.__scrub; });
    if (profileThisRun) {
      const { profile } = await cdp.send('Profiler.stop');
      scrubProfile = summarizeCpuProfile(profile, 200);
      await writeFile(join(out, 'cpuprofile-scrub.json'), `${JSON.stringify(profile)}\n`);
    }
    scrub = {
      moves: 40,
      points: chartPoints,
      frames: summarizeFrames(raw.deltas),
      longTasks: raw.longtasks.length,
      longestTaskMs: raw.longtasks.length ? Number(Math.max(...raw.longtasks).toFixed(1)) : 0,
    };
  }

  await page.screenshot({ path: join(out, `run-${run}.png`) });

  const longtasks = perf.longtasks;
  const longest = longtasks.length ? Math.max(...longtasks.map((l) => l.duration)) : 0;
  const blocking = longtasks.reduce((a, l) => a + Math.max(0, l.duration - 50), 0);
  const fcp = perf.paints.find((p) => p.name === 'first-contentful-paint')?.start ?? null;
  // TTI proxy: first moment after DOMContentLoaded followed by 500 ms with no long task.
  let tti = nav?.domContentLoaded ?? null;
  if (tti !== null) {
    for (const l of [...longtasks].sort((a, b) => a.start - b.start)) {
      if (l.start <= tti + 500) tti = Math.max(tti, l.start + l.duration);
    }
    if (fcp !== null) tti = Math.max(tti, fcp);
    tti = Number(tti.toFixed(1));
  }

  all.runs.push({
    run, shellReadyMs, runDoneMs, engineMs: perf.engineMs ?? null,
    navigation: nav, glRenderer: renderer, fcp, lcp: perf.lcp ?? null, tti,
    warmRerun: { wallMs: warmRerunMs, engineMs: Number.isFinite(warmEngineMs) ? warmEngineMs : null },
    longTasks: { count: longtasks.length, longestMs: Number(longest.toFixed(1)), totalBlockingMs: Number(blocking.toFixed(1)) },
    marks: perf.marks, resources: perf.resources, wasmBench,
    switches, framesAirframe, framesFlight, flightTableRows, chartPoints, scrub, scrubProfile, coverage, errors,
  });
  console.log(`run ${run}: shell ${shellReadyMs} ms, committed run ${runDoneMs} ms, engine ${perf.engineMs ?? '?'} ms, warm re-run ${warmRerunMs} ms (engine ${warmEngineMs || '?'} ms), FCP ${fcp?.toFixed(0)} ms, longtasks ${longtasks.length}/${longest.toFixed(0)} ms, TTI ${tti} ms`);
  if (scrub) console.log(`  scrub: ${scrub.points} chart points, frames median ${scrub.frames.medianMs.toFixed(1)} ms p95 ${scrub.frames.p95Ms.toFixed(1)} ms, longtasks ${scrub.longTasks}/${scrub.longestTaskMs} ms`);
  await context.close();
}

await writeFile(join(out, 'summary.json'), `${JSON.stringify(all, null, 2)}\n`);
await writeFile(join(out, 'cpu-hotspots.json'), `${JSON.stringify(cpuProfile, null, 2)}\n`);
console.log(`written: ${out}/summary.json, cpu-hotspots.json`);
await browser.close();
await server.close();
