import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';

function args(argv) {
  const out = { cases: [] };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--') continue;
    if (key === '--help' || key === '-h') { out.help = true; continue; }
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    if (key === '--case') out.cases.push(value);
    else if (['--data-root', '--out-dir', '--compare'].includes(key)) out[key.slice(2).replaceAll('-', '_')] = value;
    else throw new Error(`Unknown option ${key}`);
  }
  return out;
}

const usage = `Usage: pnpm benchmark:flight -- --data-root <external-folder> [--case <case-id>] [--out-dir <folder>] [--compare <baseline-report.json>]\n\nRaw inputs stay outside git. Development cases only; reserved holdouts are never selected.`;
const options = args(process.argv.slice(2));
if (options.help) { console.log(usage); process.exit(0); }
if (!options.data_root) { console.error(usage); process.exit(2); }
const dataRoot = resolve(options.data_root);
const outDir = resolve(options.out_dir ?? join(dataRoot, 'benchmark-reports'));
const root = resolve(new URL('..', import.meta.url).pathname);
const enginePath = join(root, 'src/engine/astraea_engine.wasm');
let server;
try {
  const engineBytes = new Uint8Array(await readFile(enginePath).catch(() => { throw new Error(`Production WASM is missing at ${enginePath}; run pnpm build:engine via ~/.local/bin/astraea-heavy first.`); }));
  const engineSha256 = createHash('sha256').update(engineBytes).digest('hex');
  const viteConfig = await createServer({ configFile: join(root, 'vite.config.ts'), root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  server = viteConfig;
  const api = await server.ssrLoadModule('/src/validation/development/benchmark.ts');
  const selected = options.cases.length ? options.cases : api.DEVELOPMENT_CASES.filter((x) => x.role === 'development').map((x) => x.id);
  if (options.compare && selected.length !== 1) throw new Error('--compare requires exactly one --case so the saved baseline identity is unambiguous');
  const unknown = selected.filter((id) => !api.DEVELOPMENT_CASES.some((x) => x.id === id && x.role === 'development'));
  if (unknown.length) throw new Error(`Unknown or non-development case(s): ${unknown.join(', ')}. Available: ${api.DEVELOPMENT_CASES.filter((x) => x.role === 'development').map((x) => x.id).join(', ')}`);
  await mkdir(outDir, { recursive: true });
  let compared = false;
  for (const id of selected) {
    const spec = api.DEVELOPMENT_CASES.find((x) => x.id === id);
    const report = await api.runDevelopmentCase(dataRoot, spec, engineBytes, engineSha256);
    const jsonPath = join(outDir, `${id}.json`);
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(join(outDir, `${id}.md`), api.renderHumanReport(report));
    const phases = report.trajectory.phases;
    console.log(`${id}: apogee ${report.metrics.signedApogeeError ? `${report.metrics.signedApogeeError.value.toFixed(2)} m signed error` : 'blocked'}; timing ${report.metrics.apogeeTimeError ? `${report.metrics.apogeeTimeError.value.toFixed(2)} s` : 'blocked'}; full-overlap RMSE ${report.trajectory.rmseM?.toFixed(2) ?? 'unavailable'} m; ascent coast RMSE ${phases.coastAscent?.rmseM?.toFixed(2) ?? 'unavailable'} m; descent RMSE ${phases.postApogeeDescent?.rmseM?.toFixed(2) ?? 'unavailable'} m; ${report.trajectory.sampleCount} residuals`);
    if (options.compare && !compared) {
      const baseline = JSON.parse(await readFile(resolve(options.compare), 'utf8'));
      console.log(`comparison: ${JSON.stringify(api.compareReports(baseline, report))}`);
      compared = true;
    }
  }
  console.log(`Reports: ${outDir}`);
} catch (error) {
  console.error(`benchmark:flight failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (server) await server.close();
}
