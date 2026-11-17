// Per-case timing for the development flight benchmark.
//
// Uses the same module and inputs as `pnpm benchmark:flight` (Vite SSR +
// production WASM bytes), but times each `runDevelopmentCase` call separately
// so the report covers parse + simulate + residuals per case rather than one
// whole-command wall time.
//
// Usage: node scripts/perf/measure-flight.mjs --data-root <dir> --out <dir> [--runs 3]
// Raw output stays outside Git.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const dataRoot = resolve(arg('data-root'));
const outDir = arg('out');
const runs = Number(arg('runs', '3'));
if (!outDir) throw new Error('Usage: node scripts/perf/measure-flight.mjs --data-root <dir> --out <dir> [--runs 3]');

const root = resolve(new URL('../..', import.meta.url).pathname);
const engineBytes = new Uint8Array(await readFile(join(root, 'src/engine/astraea_engine.wasm')));
const engineSha256 = createHash('sha256').update(engineBytes).digest('hex');
const server = await createServer({ configFile: join(root, 'vite.config.ts'), root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const all = { dataRoot, engineSha256, runs: [] };
try {
  const api = await server.ssrLoadModule('/src/validation/development/benchmark.ts');
  const cases = api.DEVELOPMENT_CASES.filter((x) => x.role === 'development');
  for (let run = 1; run <= runs; run++) {
    const records = [];
    for (const spec of cases) {
      const t0 = performance.now();
      const report = await api.runDevelopmentCase(dataRoot, spec, engineBytes, engineSha256);
      const wallMs = Number((performance.now() - t0).toFixed(1));
      records.push({
        caseId: spec.id, wallMs, samples: report.trajectory.sampleCount,
        rmseM: report.trajectory.rmseM ?? null,
      });
      console.log(`run ${run} ${spec.id}: ${wallMs} ms, ${report.trajectory.sampleCount} residuals`);
    }
    all.runs.push({ run, cases: records });
  }
} finally {
  await server.close();
}
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'flight-per-case.json'), `${JSON.stringify(all, null, 2)}\n`);
console.log(`engine ${engineSha256}; written ${join(outDir, 'flight-per-case.json')}`);
