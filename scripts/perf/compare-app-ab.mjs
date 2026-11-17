// Interleaved A/B startup probe for the workstation entry.
//
// Alternates loads of a baseline dist and a candidate dist in one browser and
// one time window, so host drift (turbo/thermal/load) hits both variants
// instead of being mistaken for a regression. Records shell visibility,
// committed-run wall time, the app's own run duration and FCP.
//
// Usage:
//   node scripts/perf/compare-app-ab.mjs \
//     --baseline-dist <baseline-dist> \
//     --after-root <lane-worktree> \
//     --runs 6 --out <evidence>/perf-optimize/after/app-ab.json
//
// Raw output stays outside Git.
import { readFile, writeFile } from 'node:fs/promises';
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
const runs = Number(arg('runs', '6'));
if (!baselineDist || !afterRoot || !outPath) throw new Error('Usage: compare-app-ab.mjs --baseline-dist <dir> --after-root <dir> --out <json> [--runs 6]');

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

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] });
const results = { baseline: [], after: [] };
try {
  for (let i = 0; i < runs; i++) {
    const order = i % 2 === 0 ? ['baseline', 'after'] : ['after', 'baseline'];
    for (const variant of order) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const perf = { runDone: false };
        window.__perf = perf;
        const watch = () => {
          const footer = document.querySelector('footer');
          if (!footer) return requestAnimationFrame(watch);
          const check = () => {
            const text = footer.textContent ?? '';
            if (!perf.runDone && /Committed · r\d+/.test(text)) perf.runDone = true;
            const ms = text.match(/·\s*(\d+)\s*ms/);
            if (ms) perf.engineMs = Number(ms[1]);
          };
          check();
          new MutationObserver(check).observe(footer, { subtree: true, childList: true, characterData: true });
        };
        document.addEventListener('DOMContentLoaded', watch);
      });
      const t0 = Date.now();
      await page.goto(urls[variant], { waitUntil: 'load' });
      await page.locator('nav[aria-label="Pipeline stages"]').waitFor({ state: 'visible', timeout: 30000 });
      const shellMs = Date.now() - t0;
      await page.waitForFunction(() => window.__perf?.runDone === true, undefined, { timeout: 90000 });
      const runDoneMs = Date.now() - t0;
      const perf = await page.evaluate(() => ({
        engineMs: window.__perf.engineMs ?? null,
        fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      }));
      results[variant].push({ run: i + 1, shellMs, runDoneMs, ...perf });
      console.log(`${String(i + 1).padStart(2)} ${variant.padEnd(8)} shell ${String(shellMs).padStart(4)} ms  committed ${String(runDoneMs).padStart(4)} ms  engine ${String(perf.engineMs).padStart(4)} ms  FCP ${perf.fcp?.toFixed(0)}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await baselineServer.close();
  await afterServer.close();
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const summary = {};
for (const variant of ['baseline', 'after']) {
  const r = results[variant];
  summary[variant] = {
    committedMedianMs: median(r.map((x) => x.runDoneMs)),
    engineMedianMs: median(r.map((x) => x.engineMs)),
    committedMs: r.map((x) => x.runDoneMs),
  };
}
summary.changePct = Number((100 * (summary.after.committedMedianMs - summary.baseline.committedMedianMs) / summary.baseline.committedMedianMs).toFixed(1));
await writeFile(outPath, `${JSON.stringify({ urls, summary, results }, null, 2)}\n`);
console.log(`baseline committed median ${summary.baseline.committedMedianMs} ms, after ${summary.after.committedMedianMs} ms (${summary.changePct >= 0 ? '+' : ''}${summary.changePct}%), engine ${summary.baseline.engineMedianMs} vs ${summary.after.engineMedianMs} ms`);
console.log(`written ${outPath}`);
