// Dev-server cold-start probe: `pnpm dev` (engine build + Vite) to first
// usable workstation, N page loads against one server.
//
// Usage: node scripts/perf/measure-dev.mjs --out <dir> [--runs 3] [--port 5199] [--gpu]
// Raw output stays outside Git.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const outDir = arg('out');
if (!outDir) throw new Error('Usage: node scripts/perf/measure-dev.mjs --out <dir> [--runs 3] [--port 5199] [--gpu]');
const runs = Number(arg('runs', '3'));
const port = Number(arg('port', '5199'));
const useGpu = process.argv.includes('--gpu');
const out = join(outDir, 'dev');
await mkdir(out, { recursive: true });

const serverStart = Date.now();
const dev = spawn('pnpm', ['dev', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
  cwd: new URL('../..', import.meta.url).pathname,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
  env: { ...process.env, CARGO_BUILD_JOBS: '2' },
});
const stopDev = () => { try { process.kill(-dev.pid, 'SIGTERM'); } catch { /* already gone */ } };
let log = '';
dev.stdout.on('data', (d) => { log += d; });
dev.stderr.on('data', (d) => { log += d; });
const url = `http://127.0.0.1:${port}/app/`;
const deadline = Date.now() + 120000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(url);
    if (res.ok) { ready = true; break; }
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 200));
}
const serverReadyMs = Date.now() - serverStart;
if (!ready) {
  stopDev();
  throw new Error(`dev server did not answer within 120 s; log:\n${log.slice(-3000)}`);
}

const browser = await chromium.launch({
  args: useGpu
    ? ['--enable-gpu', '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const all = { serverReadyMs, url, runs: [] };
try {
  for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const perf = { marks: [] };
      window.__perf = perf;
      const rec = (name) => perf.marks.push({ name, t: performance.now() });
      rec('init');
      const watch = () => {
        const footer = document.querySelector('footer');
        if (!footer) return requestAnimationFrame(watch);
        const check = () => {
          const text = footer.textContent ?? '';
          if (!perf.runDone && /Committed · r\d+/.test(text)) { perf.runDone = true; rec('run-done'); }
          const ms = text.match(/·\s*(\d+)\s*ms/);
          if (ms) perf.engineMs = Number(ms[1]);
        };
        check();
        new MutationObserver(check).observe(footer, { subtree: true, childList: true, characterData: true });
      };
      document.addEventListener('DOMContentLoaded', watch);
    });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'load' });
    await page.locator('nav[aria-label="Pipeline stages"]').waitFor({ state: 'visible', timeout: 60000 });
    const shellReadyMs = Date.now() - t0;
    await page.waitForFunction(() => window.__perf?.runDone === true, undefined, { timeout: 120000 });
    const runDoneMs = Date.now() - t0;
    const perf = await page.evaluate(() => ({
      marks: window.__perf.marks,
      engineMs: window.__perf.engineMs,
      fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      resources: performance.getEntriesByType('resource').length,
    }));
    all.runs.push({ run, shellReadyMs, runDoneMs, ...perf });
    console.log(`run ${run}: shell ${shellReadyMs} ms, committed ${runDoneMs} ms, engine ${perf.engineMs} ms, FCP ${perf.fcp?.toFixed(0)} ms, ${perf.resources} module requests`);
    await context.close();
  }
} finally {
  await browser.close();
  stopDev();
  await new Promise((r) => setTimeout(r, 500));
}
await writeFile(join(out, 'summary.json'), `${JSON.stringify(all, null, 2)}\n`);
await writeFile(join(out, 'dev-server.log'), log);
console.log(`server ready ${serverReadyMs} ms; written ${out}/summary.json`);
