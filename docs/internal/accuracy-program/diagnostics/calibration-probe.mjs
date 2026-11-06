// Read-only diagnostic; imports the pinned production implementation and WASM.
// Run from repository root: node docs/internal/accuracy-program/diagnostics/calibration-probe.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { resolve } from 'node:path';

const root = process.cwd();
const outPath = resolve(root, 'docs/internal/accuracy-program/diagnostics/calibration-probe.json');
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const load = (path) => server.ssrLoadModule(path);
  const [core, engineApi, bridge, fixture, motors, parser, coast, fitter, calibration, atmosphere] = await Promise.all([
    '/src/engine/core.ts', '/src/engine/index.ts', '/src/tauri/bridge.ts', '/src/evidence/cosmicCargoFixture.ts',
    '/src/propulsion/motorDatabase.ts', '/src/evidence/altimetry.ts', '/src/evidence/coastWindow.ts',
    '/src/evidence/dragFit.ts', '/src/evidence/calibration.ts', '/src/sim/flightSimulator.ts',
  ].map(load));
  const wasmPath = '/workspace/astraea/src/engine/astraea_engine.wasm';
  const bytes = await readFile(wasmPath);
  const instance = await core.instantiateEngine(bytes);
  engineApi.setTestEngine(async (cmd, args) => instance.call(cmd, args));
  const csv = await readFile(resolve(root, 'docs/flight-validation/cosmic-cargo-2986-coast.csv'), 'utf8');
  const parsed = parser.parseTrajectoryCsv(csv);
  const log = parsed.samples;
  const vehicle = { ...fixture.cosmicCargoLike(), launchSite: { altitudeM: 10 } };
  const motor = motors.CERTIFIED_MOTORS.estes_c6;
  const analysis = await bridge.stabilityOf(vehicle);
  const mass = analysis.totalMass + motor.dryMass;
  const area = Math.PI * analysis.referenceDiameter ** 2 / 4;
  const fly = (scale) => bridge.simulateFlight(vehicle, motor, { ...fixture.COSMIC_CARGO_CONDITIONS, ...(scale === undefined ? {} : { dragCdScale: scale }) });
  const baseline = await fly();
  const inputs = { log, coastMassKg: mass, refAreaM2: area, launchElevationM: 10, modelTelemetry: baseline.telemetry };
  const fit = fitter.fitDragScale(inputs);
  const fitted = await fly(fit.scale);
  const historicalScale = 0.4526 / 0.5533;
  const historical = await fly(historicalScale);
  const fitSummary = (x) => {
    const { points, ...summary } = x;
    return { ...summary, cd: calibration.calibrateCd(points, { allowNegativeAccel: true }).cdCalibrated };
  };
  const summary = (r) => ({
    apogeeM: r.apogeeAltitude, apogeeS: r.apogeeTime, burnoutS: r.burnoutTime,
    burnoutM: r.burnoutAltitude, burnoutMs: r.burnoutVelocity,
    coast: fitSummary(coast.deriveCoastPoints(r.telemetry.map(p => ({ timeS: p.time, altitudeM: p.altitude, velocityMs: p.velocity.z })), { massKg: mass, refAreaM2: area, launchElevationM: 10 })),
  });
  const central = (halfSpan, massKg, startS = -Infinity, endS = Infinity) => {
    let xx = 0, xy = 0, n = 0;
    for (let i = halfSpan; i < log.length - halfSpan; i++) {
      const p = log[i];
      if (p.timeS < startS || p.timeS > endS || p.velocityMs < 5) continue;
      const dvdt = (log[i + halfSpan].velocityMs - log[i - halfSpan].velocityMs) / (log[i + halfSpan].timeS - log[i - halfSpan].timeS);
      const x = .5 * atmosphere.getAtmosphereAt(10 + p.altitudeM).density * p.velocityMs ** 2 * area;
      xx += x*x; xy += x * massKg * (-dvdt - 9.80665); n++;
    }
    return { cd: xy / xx, n };
  };
  const interpolate = (time, field) => {
    const rows = baseline.telemetry;
    const i = rows.findIndex(p => p.time >= time);
    if (i === 0) return field(rows[0]);
    const a = rows[i - 1], b = rows[i];
    return field(a) + (field(b) - field(a)) * (time - a.time) / (b.time - a.time);
  };
  const matchedModelLog = log.map(p => ({ timeS: p.timeS, altitudeM: interpolate(p.timeS, x => x.altitude), velocityMs: interpolate(p.timeS, x => x.velocity.z) }));
  const out = {
    sourceCommit: '1745adb7265b642c6a7ecfd12e1418b51f159bcb',
    wasm: { path: wasmPath, sha256: createHash('sha256').update(bytes).digest('hex') },
    log: { sha256: createHash('sha256').update(csv).digest('hex'), rows: log.length, first: log[0], last: log.at(-1), timeUnit: parsed.timeUnit, altitudeUnit: parsed.altitudeUnit },
    modelInputs: { designMassKg: analysis.totalMass, casingMassKg: motor.dryMass, coastMassKg: mass, refAreaM2: area, referenceDiameterM: analysis.referenceDiameter },
    fit: { scale: fit.scale, fittedCd: fit.fittedCd, modelCd: fit.modelCd, rmseN: fit.rmseN, log: fitSummary(fit.logWindow), model: fitSummary(fit.modelWindow) },
    massCancellation: [0.035, .047, .0499].map(m => ({ massKg: m, scale: fitter.fitDragScale({ ...inputs, coastMassKg: m }).scale })),
    sameCoastWindowAt47g: fitSummary(coast.deriveCoastPoints(log, { massKg: .047, refAreaM2: area, launchElevationM: 10 })),
    centralDifferences: [1, 3, 8, 15].map(k => ({ halfSpan: k, at47g: central(k, .047), atModelMass: central(k, mass), atWindowAndModelMass: central(k, mass, fit.logWindow.windowStartS, fit.logWindow.windowEndS) })),
    altitudeOnly: fitSummary(coast.deriveCoastPoints(log.map(({timeS,altitudeM})=>({timeS,altitudeM})), { massKg: mass, refAreaM2: area, launchElevationM: 10 })),
    modelResampledOnLogTimes: fitSummary(coast.deriveCoastPoints(matchedModelLog, { massKg: mass, refAreaM2: area, launchElevationM: 10 })),
    baseline: summary(baseline), calibrated: summary(fitted), historicalScaleReplay: { scale: historicalScale, ...summary(historical) },
    coastStartConditions: [1.887, 2.2, fit.logWindow.windowStartS].map(timeS=>({ timeS, modelM: interpolate(timeS,x=>x.altitude), modelMs: interpolate(timeS,x=>x.velocity.z), observedAtOrAfter: log.find(p=>p.timeS>=timeS) })),
  };
  await writeFile(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ outPath, scale: out.fit.scale, mass: out.modelInputs, baseline: out.baseline, calibrated: out.calibrated, historical: out.historicalScaleReplay }, null, 2));
  engineApi.setTestEngine(null);
} finally { await server.close(); }
