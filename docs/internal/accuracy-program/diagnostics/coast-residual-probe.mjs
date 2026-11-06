// Compare the same already-seen observed coast points; no trajectory propagation.
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const root = process.cwd();
const prefix = 'docs/internal/accuracy-program/diagnostics/';
const prior = JSON.parse(await readFile(prefix + 'calibration-probe.json', 'utf8'));
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const [parser, coast, calibrator] = await Promise.all(['/src/evidence/altimetry.ts', '/src/evidence/coastWindow.ts', '/src/evidence/calibration.ts'].map(p => server.ssrLoadModule(p)));
  const log = parser.parseTrajectoryCsv(await readFile('docs/flight-validation/cosmic-cargo-2986-coast.csv', 'utf8')).samples;
  const d = coast.deriveCoastPoints(log, { massKg: prior.modelInputs.coastMassKg, refAreaM2: prior.modelInputs.refAreaM2, launchElevationM: 10 });
  const compare = points => {
    const predictions = { baselineCoastCd: prior.fit.modelCd, scaledBaselineCd: prior.fit.modelCd * prior.fit.scale, remeasuredCalibratedCd: prior.calibrated.coast.cd };
    return { n: points.length, minMs: Math.min(...points.map(p=>p.velocityMs)), maxMs: Math.max(...points.map(p=>p.velocityMs)), ...Object.fromEntries(Object.entries(predictions).map(([label, cd]) => {
      const residuals = points.map(p => .5 * p.density * p.velocityMs ** 2 * p.refAreaM2 * cd - p.massKg * p.accelMs2);
      return [label, { cd, rmseN: Math.sqrt(residuals.reduce((s,r)=>s+r*r,0)/points.length), meanResidualN: residuals.reduce((s,r)=>s+r,0)/points.length }];
    })) };
  };
  const out = { source: 'Same 385 extracted observed coast points as original fit; in-sample diagnostic only. Equivalent-coefficient predictions use measured v and density; no state restart or new simulation.', wholeWindow: compare(d.points), speedBands: [[5,25],[25,50],[50,75]].map(([lo,hi])=>({loMs:lo,hiMs:hi,...compare(d.points.filter(p=>p.velocityMs>=lo&&p.velocityMs<hi))})), fitted: calibrator.calibrateCd(d.points,{allowNegativeAccel:true}) };
  await writeFile(prefix + 'coast-residual-probe.json', JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify(out,null,2));
} finally { await server.close(); }
