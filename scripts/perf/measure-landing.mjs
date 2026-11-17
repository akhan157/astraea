// Public landing-page load probe for the perf lane.
//
// The landing entry must not execute the workstation's 3D/React stack: the
// page has zero canvases. This records what it actually fetches and executes,
// so a chunking change can be judged by bytes and main-thread work.
//
// Usage: pnpm build && node scripts/perf/measure-landing.mjs --out <dir> [--runs 3]
// Raw output stays outside Git.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const outDir = arg('out');
if (!outDir) throw new Error('Usage: node scripts/perf/measure-landing.mjs --out <dir> [--runs 3]');
const runs = Number(arg('runs', '3'));

const headers = await readFile(new URL('../../dist/_headers', import.meta.url), 'utf8');
const csp = headers.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
if (!csp) throw new Error('dist/_headers has no Content-Security-Policy; run pnpm build first');
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, open: false, headers: { 'Content-Security-Policy': csp } },
});
const url = server.resolvedUrls.local[0];
const out = join(outDir, 'landing');
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] });
const all = { url, runs: [] };
try {
  for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const perf = { longtasks: [] };
      window.__perf = perf;
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) perf.longtasks.push({ start: e.startTime, duration: e.duration });
        }).observe({ type: 'longtask', buffered: true });
      } catch { /* unsupported */ }
    });
    const cdp = await context.newCDPSession(page);
    if (run === 1) {
      await cdp.send('Profiler.enable').catch(() => undefined);
      await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true }).catch(() => undefined);
    }
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource').map((r) => ({
        name: r.name.split('/').pop(), type: r.initiatorType, transfer: r.transferSize, decoded: r.decodedBodySize,
      })).sort((a, b) => b.decoded - a.decoded);
      return {
        nav: nav ? { dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd } : null,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
        longtasks: window.__perf.longtasks,
        resources, canvases: document.querySelectorAll('canvas').length,
      };
    });
    let coverage = null;
    if (run === 1) {
      const cov = await cdp.send('Profiler.takePreciseCoverage').catch(() => null);
      if (cov) {
        coverage = cov.result.map((s) => {
          const total = s.functions.reduce((a, f) => a + f.ranges.reduce((x, r) => x + r.endOffset - r.startOffset, 0), 0);
          const used = s.functions.reduce((a, f) => a + f.ranges.reduce((x, r) => x + (r.count > 0 ? r.endOffset - r.startOffset : 0), 0), 0);
          return { script: (s.url || `(inline ${s.scriptId})`).split('/').pop(), total, used, usedPct: total ? Number((100 * used / total).toFixed(1)) : 0 };
        }).filter((s) => s.total > 10000).sort((a, b) => b.total - a.total);
      }
    }
    const js = perf.resources.filter((r) => r.name.endsWith('.js') || r.type === 'script');
    const jsDecoded = js.reduce((a, r) => a + r.decoded, 0);
    const jsTransfer = js.reduce((a, r) => a + r.transfer, 0);
    const longest = perf.longtasks.length ? Math.max(...perf.longtasks.map((l) => l.duration)) : 0;
    all.runs.push({ run, wallMs: Date.now() - t0, ...perf, jsDecoded, jsTransfer, coverage });
    console.log(`run ${run}: wall ${Date.now() - t0} ms, FCP ${perf.fcp?.toFixed(0)} ms, load ${perf.nav?.load?.toFixed(0)} ms, JS ${(jsDecoded / 1024).toFixed(1)} kB decoded / ${(jsTransfer / 1024).toFixed(1)} kB transfer, ${js.length} scripts, longtasks ${perf.longtasks.length}/${longest.toFixed(0)} ms, canvases ${perf.canvases}`);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
await writeFile(join(out, 'summary.json'), `${JSON.stringify(all, null, 2)}\n`);
console.log(`written ${out}/summary.json`);
