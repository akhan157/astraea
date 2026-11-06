import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseTrajectoryCsv, type TrajectorySample, type LogUnitBasis } from '../../evidence/altimetry';
import { simulateFlight } from '../../tauri/bridge';
import { instantiateEngine } from '../../engine/core';
import { setTestEngine, type EngineInvoke } from '../../engine';
import { CERTIFIED_MOTORS, type MotorSpec } from '../../propulsion/motorDatabase';
import { miniDx3 } from '../miniDx3/miniDx3-vehicle';
import { G69N } from '../miniDx3/motors';
import { cosmicCargoLike, COSMIC_CARGO_CONDITIONS, COSMIC_CARGO_RECORDED_APOGEE_M } from '../../evidence/cosmicCargoFixture';
import type { SixDofOptions, SixDofSimulationResult } from '../../sim/sixDofSimulator';
import { parseRaspEng } from '../../formats/engParser';
import { dofproVehicle, DOFPRO_DRY_AGGREGATES } from './dofproVehicles';
import { DOFPRO_DEVELOPMENT_CASES } from './dofproCases';
import type { RocketVehicle } from '../../core/types';

export type Qualification = { status: 'ready' | 'blocked'; reasons: string[] };
interface InputSource { path: string; url: string; sha256: string }
export interface DevelopmentCase {
  id: string;
  title: string;
  role: 'development' | 'reserved-holdout';
  path: string;
  format: 'raven-fip' | 'trajectory-csv';
  sourceUrl: string;
  expectedSourceSha256?: string;
  timeUnit: 's' | 'ms';
  altitudeUnit: 'm' | 'ft';
  timeUnitBasis: 'header' | 'declared';
  altitudeUnitBasis: 'header' | 'declared';
  altitudeReference: 'AGL' | 'ASL' | 'unknown';
  altitudeReferenceSource: string;
  launchTimeS: number;
  launchReferenceSource: string;
  altitudeChannel?: string;
  velocityChannel?: string;
  velocityUnit?: 'm/s' | 'ft/s';
  velocityChannelDescription?: string;
  pressureChannel?: 'Baro (Atm)';
  measuredApogeeM?: number;
  measuredApogeeTimeS?: number;
  measuredApogeeReference?: string;
  measuredBurnoutTimeS?: number;
  measuredBurnoutReference?: string;
  modelId: string;
  motorId: string;
  modelSource?: InputSource;
  motorSource?: InputSource;
  configuration: string;
  knownInputs: string[];
  assumedInputs: string[];
  limitations: string[];
}

export const DEVELOPMENT_CASES: readonly DevelopmentCase[] = [
  {
    id: 'mini-dx3-g69n-2017-06-30', title: 'Mini DX3 G69N, 30 Jun 2017', role: 'development',
    path: 'dofpro/G69_30JUN2017_G69N-P_1_FIP.csv', format: 'raven-fip',
    sourceUrl: 'DOFPro Raven FIP source record, see docs/flight-validation/mini-dx3-protocol.md',
    expectedSourceSha256: '9fa2c518448d18b553d0cb2e17b443e92a7fcf3beeacf95e1c90749f42d8da51',
    timeUnit: 's', altitudeUnit: 'ft', timeUnitBasis: 'declared', altitudeUnitBasis: 'declared',
    altitudeReference: 'AGL', launchTimeS: 0, launchReferenceSource: 'Raven run clock zero; protocol measurement reference',
    altitudeReferenceSource: 'Raven FIP channel name [Altitude (Baro-Ft-AGL)]',
    altitudeChannel: '[Altitude (Baro-Ft-AGL)]', velocityChannel: '[Velocity (Accel-Ft/Sec)]', velocityUnit: 'ft/s',
    velocityChannelDescription: 'Raven accelerometer-integrated velocity channel; retained as a sensor diagnostic, not an independent burnout event',
    modelId: 'mini-dx3-ork-derived-v1', motorId: 'G69N-certified-curve', configuration: 'MiniDX3MinDiamWAvionics.ork geometry; protocol mass/CG; nominal run',
    knownInputs: ['Mini DX3 ORK geometry', 'airframe 0.34471 kg, CG 0.508 m from nose tip', 'G69N certified thrust curve', 'Raven channel units and AGL label'],
    assumedInputs: ['ISA atmosphere from 915.76 hPa pad pressure', '20 °C page ambient', 'zero surface wind', '1.83 m rail and 88° elevation'],
    limitations: ['weather and launch-condition record is incomplete', 'per-flight airframe mass/CG was not measured for this individual flight'],
  },
  {
    id: 'cosmic-cargo-2986', title: 'Estes Cosmic Cargo, Altimeter Cloud 2986', role: 'development',
    path: 'cosmic-cargo-2986.csv', format: 'trajectory-csv',
    sourceUrl: 'https://www.altimetercloud.com/flightdata/6/2986.csv',
    expectedSourceSha256: 'adce6e39cf0fa9919c0349c83725ffe431b44a8b03db5ccbb71d6a7aad4066b8',
    timeUnit: 'ms', altitudeUnit: 'm', timeUnitBasis: 'header', altitudeUnitBasis: 'header',
    altitudeReference: 'AGL', launchTimeS: 0, launchReferenceSource: 'Altimeter Cloud flight clock zero; source log includes prelaunch samples',
    altitudeReferenceSource: 'Altimeter Cloud flight 2986 record; apogee is reported above launch ground level',
    measuredApogeeM: COSMIC_CARGO_RECORDED_APOGEE_M, measuredApogeeTimeS: 7.454,
    measuredApogeeReference: 'Altimeter Cloud full-log metadata: apogee time (s)',
    measuredBurnoutTimeS: 1.887, measuredBurnoutReference: 'Altimeter Cloud full-log metadata: refined burnout (ms)',
    velocityUnit: 'm/s',
    modelId: 'cosmic-cargo-estimated-geometry-v1', motorId: 'estes_c6', configuration: 'Existing estimated Cosmic Cargo fixture; certified Estes C6-7 curve',
    knownInputs: ['Altimeter Cloud flight 2986 full source log; header declares Time(ms) and Altitude(m)', 'recorded 10 m pad altitude', 'certified Estes C6-7 thrust curve'],
    assumedInputs: ['estimated fin planform', 'vehicle configuration and payload mass', '0 m/s wind', '0.91 m rail and recorded 88.84° rail angle'],
    limitations: ['flown all-up mass and molded fin geometry are uncertain', 'launch weather was not recorded'],
  },
  ...DOFPRO_DEVELOPMENT_CASES,
];

export interface MetricValue { value: number; unit: string }
export interface DevelopmentReport {
  schema: 'astraea-development-benchmark-v1';
  caseId: string; title: string; role: DevelopmentCase['role'];
  source: { path: string; url: string; sha256: string; bytes: number; measurementIdentity: string };
  measurement: {
    time: { unit: 's' | 'ms'; basis: LogUnitBasis | 'declared'; source: string };
    altitude: { unit: 'm' | 'ft'; basis: LogUnitBasis | 'declared'; reference: DevelopmentCase['altitudeReference']; unitSource: string; referenceSource: string; channel?: string };
    launchReference: { timeS: number; source: string };
    observedApogee?: { timeS: number; source: string };
    observedBurnout?: { timeS: number; source: string };
    observedVelocity: { unit?: 'm/s' | 'ft/s'; basis: LogUnitBasis | 'declared'; source: string };
  };
  engine: { kind: 'production-rust-wasm'; sha256: string };
  model: {
    id: string; motorId: string; configuration: string; runManifest: SixDofSimulationResult['runManifest'];
    inputSources?: Array<InputSource & { bytes: number }>;
    reconstruction?: { dryMassKg: number; dryCgM: number; modeledMassScale: number; pressureSample: { timeS: number; pressurePa: number }; isaPressureAltitudeM: number };
  };
  qualification: Record<'absoluteApogee' | 'eventTiming' | 'altitudeCurve' | 'observedVelocity', Qualification>;
  assumptions: { known: string[]; assumed: string[]; limitations: string[] };
  metrics: {
    measuredApogee?: MetricValue; simulatedApogee?: MetricValue; signedApogeeError?: MetricValue;
    measuredApogeeTime?: MetricValue; simulatedApogeeTime?: MetricValue; apogeeTimeError?: MetricValue;
    simulatedMaxMach?: MetricValue;
  };
  trajectory: {
    overlapStartS: number; overlapEndS: number; sampleCount: number;
    residuals: Array<{ timeS: number; observedAltitudeM: number; simulatedAltitudeM: number; residualM: number }>;
    maeM?: number; rmseM?: number; maxAbsM?: number;
    phases: {
      poweredCoast: { status: 'ready' | 'blocked'; reason?: string };
      poweredAscent?: { intervalS: [number, number]; sampleCount: number; rmseM?: number };
      coastAscent?: { intervalS: [number, number]; sampleCount: number; rmseM?: number };
      postApogeeDescent?: { intervalS: [number, number]; sampleCount: number; rmseM?: number };
    };
  };
  observedVelocity: { available: boolean; description?: string; sampleCount: number; residualRmseMs?: number; residualSampleCount: number };
}

export interface CaseData {
  samples: TrajectorySample[]; velocitySamples?: TrajectorySample[]; apogeeM?: number;
  timeUnitBasis: LogUnitBasis | 'declared'; altitudeUnitBasis: LogUnitBasis | 'declared'; velocityUnitBasis: LogUnitBasis | 'declared'; sourceBytes: Uint8Array;
  pressureSample?: { timeS: number; pressurePa: number };
}

function csvRow(line: string): string[] {
  const cells: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (line[i] === ',' && !quoted) { cells.push(cell); cell = ''; }
    else cell += line[i];
  }
  cells.push(cell); return cells;
}

/** Strict decoder for Raven's ragged per-channel (time,value,flag) rows. */
export function parseRavenFip(text: string, altitudeChannel: string, velocityChannel?: string, velocityUnit?: 'm/s' | 'ft/s', pressureChannel?: 'Baro (Atm)'): CaseData {
  const rows = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (!rows.length) throw new Error('Raven FIP is empty');
  const header = csvRow(rows[0]);
  const names: string[] = [];
  for (let i = 0; i < header.length; i++) if (header[i].startsWith('Time@')) {
    if (header[i + 1] === undefined || header[i + 2] !== 'bILBA') throw new Error(`Raven FIP malformed channel header at ${i}`);
    names.push(header[i + 1]);
  }
  if (!names.includes(altitudeChannel)) throw new Error(`Raven FIP missing declared altitude channel ${altitudeChannel}`);
  if (velocityChannel && !names.includes(velocityChannel)) throw new Error(`Raven FIP missing declared velocity channel ${velocityChannel}`);
  if (pressureChannel && !names.includes(pressureChannel)) throw new Error(`Raven FIP missing declared pressure channel ${pressureChannel}`);
  const series = new Map(names.map((name) => [name, [] as { t: number; v: number; flag: string }[]]));
  for (let line = 1; line < rows.length; line++) {
    const cells = csvRow(rows[line]); let i = 0;
    for (const name of names) {
      if (i >= cells.length) break;
      if (cells[i] === '') { if (cells[i + 1] && cells[i + 1] !== '') throw new Error(`Raven line ${line + 1}: value without time`); i += 2; continue; }
      const t = Number(cells[i]); const v = Number(cells[i + 1]); const flag = cells[i + 2];
      if (!Number.isFinite(t) || !Number.isFinite(v) || !flag?.startsWith('b')) throw new Error(`Raven line ${line + 1}: malformed ${name} channel`);
      const ch = series.get(name)!;
      if (ch.length && t <= ch[ch.length - 1].t) throw new Error(`Raven line ${line + 1}: ${name} timestamps are not increasing`);
      ch.push({ t, v, flag }); i += 3;
    }
    if (cells.slice(i).some((cell) => cell !== '')) throw new Error(`Raven line ${line + 1}: unconsumed cells`);
  }
  const altitude = series.get(altitudeChannel)!;
  const ft = 0.3048;
  const samples = altitude.filter((x) => Number.isFinite(x.v)).map((x) => ({ timeS: x.t, altitudeM: x.v * ft }));
  let velocitySamples: TrajectorySample[] | undefined;
  if (velocityChannel) {
    const scale = velocityUnit === 'ft/s' ? ft : 1;
    velocitySamples = series.get(velocityChannel)!.filter((x) => Number.isFinite(x.v)).map((x) => ({ timeS: x.t, altitudeM: 0, velocityMs: x.v * scale }));
  }
  const pressure = pressureChannel ? series.get(pressureChannel)?.[0] : undefined;
  if (pressureChannel && (!pressure || !(pressure.v > 0))) throw new Error('Raven FIP has no positive first recorded pressure sample');
  return {
    samples, velocitySamples, timeUnitBasis: 'declared', altitudeUnitBasis: 'declared', velocityUnitBasis: velocityChannel && velocityUnit ? 'declared' : 'assumed', sourceBytes: new TextEncoder().encode(text),
    ...(pressure ? { pressureSample: { timeS: pressure.t, pressurePa: pressure.v * 101325 } } : {}),
  };
}

export async function loadCaseData(dataRoot: string, spec: DevelopmentCase): Promise<CaseData> {
  const path = join(dataRoot, spec.path);
  let sourceBytes: Uint8Array;
  try { sourceBytes = new Uint8Array(await readFile(path)); }
  catch { throw new Error(`Missing ${spec.title} source at ${path}. Provide the documented raw record under --data-root; no metrics were generated.`); }
  const text = new TextDecoder().decode(sourceBytes);
  if (spec.format === 'raven-fip') return { ...parseRavenFip(text, spec.altitudeChannel!, spec.velocityChannel, spec.velocityUnit, spec.pressureChannel), sourceBytes };
  const parsed = parseTrajectoryCsv(text);
  const velocitySamples = parsed.hasVelocity ? parsed.samples.filter((s) => s.velocityMs !== undefined) : undefined;
  const velocityHeader = text.split(/\r?\n/).find((line) => /\btime\s*\(?\s*(ms|s)\s*\)?\s*,/i.test(line) && /\baltitude\s*\(/i.test(line)) ?? '';
  const explicitVelocityUnit = /(?:velocity|vel)\s*(?:\(\s*m\s*\/\s*s\s*\)|_m_s|_ms)(?:,|$)/i.test(velocityHeader) || /(?:velocity|vel)\s*(?:\(\s*ft\s*\/\s*s\s*\)|_ft_s|_fps)(?:,|$)/i.test(velocityHeader);
  return { samples: parsed.samples, velocitySamples, timeUnitBasis: parsed.timeUnit.basis, altitudeUnitBasis: parsed.altitudeUnit.basis, velocityUnitBasis: velocitySamples?.length ? (explicitVelocityUnit ? 'header' : 'assumed') : 'assumed', sourceBytes };
}

export function qualifyDevelopmentMeasurements(spec: DevelopmentCase, data: CaseData): DevelopmentReport['qualification'] {
  const unitReasons = [data.timeUnitBasis === 'assumed' ? 'time unit was assumed, not declared by source/header or case declaration' : '', data.altitudeUnitBasis === 'assumed' ? 'altitude unit was assumed, not declared by source/header or case declaration' : ''].filter(Boolean);
  const altitudeUnitReasons = data.altitudeUnitBasis === 'assumed' ? ['altitude unit was assumed, not declared by source/header or case declaration'] : [];
  const refReasons = spec.altitudeReference === 'unknown' ? ['altitude reference (AGL/ASL) is unknown'] : [];
  const timeReasons = spec.launchReferenceSource ? [] : ['launch-time reference is not declared'];
  const seriesReasons = data.samples.length < 2 ? ['fewer than two measured altitude samples'] : [];
  const blocked = (...reasons: string[]): Qualification => ({ status: reasons.length ? 'blocked' : 'ready', reasons });
  return {
    absoluteApogee: blocked(...altitudeUnitReasons, ...refReasons, ...(data.apogeeM === undefined && !data.samples.length ? ['measured apogee is unavailable'] : [])),
    eventTiming: blocked(...unitReasons, ...refReasons, ...timeReasons, ...seriesReasons),
    altitudeCurve: blocked(...unitReasons, ...refReasons, ...timeReasons, ...seriesReasons),
    observedVelocity: data.velocitySamples?.length && data.velocitySamples.every((s) => s.velocityMs !== undefined) && data.timeUnitBasis !== 'assumed' && data.velocityUnitBasis !== 'assumed'
      ? { status: 'ready', reasons: [] }
      : { status: 'blocked', reasons: [data.timeUnitBasis === 'assumed' ? 'time unit was assumed, so velocity cannot be time-aligned' : data.velocityUnitBasis === 'assumed' ? 'velocity unit is not explicit in source/header or a case declaration' : 'no source-qualified observed vertical-velocity series is available'] },
  };
}

export function interpolateWithin(samples: readonly TrajectorySample[], timeS: number): number | null {
  if (timeS < samples[0].timeS || timeS > samples[samples.length - 1].timeS) return null;
  let lo = 0; let hi = samples.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].timeS <= timeS) lo = mid; else hi = mid; }
  if (timeS === samples[hi].timeS) return samples[hi].altitudeM;
  const a = samples[lo], b = samples[hi];
  if (b.timeS === a.timeS) return null;
  return a.altitudeM + (b.altitudeM - a.altitudeM) * (timeS - a.timeS) / (b.timeS - a.timeS);
}

export function eventTimingError(simulatedTimeS: number, observedTimeS: number): number {
  return simulatedTimeS - observedTimeS;
}

function rms(values: number[]): number | undefined {
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) : undefined;
}

type AltitudeResidual = { timeS: number; observedAltitudeM: number; simulatedAltitudeM: number; residualM: number };
type PhaseResult = { intervalS: [number, number]; sampleCount: number; rmseM?: number };

/** Segment residuals by measured event times; parachute descent never enters coast. */
export function summarizeTrajectoryPhases(
  residuals: readonly AltitudeResidual[],
  overlapStartS: number,
  overlapEndS: number,
  measuredBurnoutS?: number,
  measuredApogeeS?: number,
): DevelopmentReport['trajectory']['phases'] {
  const phase = (samples: readonly AltitudeResidual[], startS: number, endS: number): PhaseResult => ({
    intervalS: [startS, endS], sampleCount: samples.length, ...(rms(samples.map((r) => r.residualM)) === undefined ? {} : { rmseM: rms(samples.map((r) => r.residualM)) }),
  });
  const result: DevelopmentReport['trajectory']['phases'] = {
    poweredCoast: measuredBurnoutS === undefined || measuredApogeeS === undefined
      ? { status: 'blocked', reason: measuredBurnoutS === undefined ? 'no source-qualified measured burnout time' : 'no source-qualified measured apogee time' }
      : { status: 'ready' },
  };
  if (measuredApogeeS !== undefined) {
    const ascentEnd = Math.min(measuredApogeeS, overlapEndS);
    if (measuredBurnoutS !== undefined) {
      const powered = residuals.filter((r) => r.timeS <= measuredBurnoutS);
      const coast = residuals.filter((r) => r.timeS > measuredBurnoutS && r.timeS <= measuredApogeeS);
      result.poweredAscent = phase(powered, overlapStartS, Math.min(measuredBurnoutS, overlapEndS));
      result.coastAscent = phase(coast, Math.max(measuredBurnoutS, overlapStartS), ascentEnd);
    }
    const descent = residuals.filter((r) => r.timeS > measuredApogeeS);
    result.postApogeeDescent = phase(descent, Math.max(measuredApogeeS, overlapStartS), overlapEndS);
  }
  return result;
}

interface LoadedInputSource { identity: InputSource & { bytes: number }; data: Uint8Array }

async function loadInputSource(dataRoot: string, source: InputSource): Promise<LoadedInputSource> {
  const path = join(dataRoot, source.path);
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await readFile(path)); }
  catch { throw new Error(`Missing declared model/motor source at ${path}. Obtain ${source.url}; no simulation was run.`); }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== source.sha256) throw new Error(`${source.path}: source SHA-256 ${sha256} does not match declared source ${source.sha256}`);
  return { identity: { ...source, bytes: bytes.length }, data: bytes };
}

interface ModelInputs {
  vehicle: RocketVehicle; motor: MotorSpec; options: SixDofOptions;
  reconstruction?: DevelopmentReport['model']['reconstruction'];
}

function modelInputs(spec: DevelopmentCase, data: CaseData, motorSource?: LoadedInputSource): ModelInputs {
  if (spec.modelId === 'mini-dx3-ork-derived-v1') {
    const hPa = 915.76; const elevation = 44330.77 * (1 - (hPa / 1013.25) ** 0.190263);
    const vehicle = { ...miniDx3({ mass: 0.34471, cg: 0.508 }, G69N.id), launchSite: { altitudeM: elevation } };
    return { vehicle, motor: G69N, options: { launchAltitudeASL: elevation, railLength: 1.83, railElevationDeg: 88, railAzimuthDeg: 0, windSpeedSurface: 0, windAzimuthDeg: 0, mainDeployAltitudeAGL: 150 } };
  }
  if (spec.modelId === 'cosmic-cargo-estimated-geometry-v1') {
    return { vehicle: { ...cosmicCargoLike(), launchSite: { altitudeM: COSMIC_CARGO_CONDITIONS.launchAltitudeASL } }, motor: CERTIFIED_MOTORS.estes_c6, options: { ...COSMIC_CARGO_CONDITIONS } };
  }
  if (spec.modelId === 'dofpro-top-shot-aggregate-v1' || spec.modelId === 'dofpro-adventurer-aggregate-v1') {
    if (!spec.modelSource || !motorSource || !data.pressureSample) throw new Error(`${spec.id}: reconstruction requires declared model/motor sources and recorded pressure`);
    const kind = spec.modelId === 'dofpro-top-shot-aggregate-v1' ? 'top-shot' : 'adventurer';
    const motor = parseRaspEng(new TextDecoder().decode(motorSource.data));
    if (motor.id !== spec.motorId) throw new Error(`${spec.id}: source motor ${motor.id} does not match declared motor ${spec.motorId}`);
    const elevation = 44330.77 * (1 - (data.pressureSample.pressurePa / 101325) ** 0.190263);
    const reconstructed = dofproVehicle(kind, motor.id);
    const vehicle = { ...reconstructed.vehicle, launchSite: { altitudeM: elevation } };
    const target = DOFPRO_DRY_AGGREGATES[kind];
    return {
      vehicle, motor, options: { railLength: 1.83, railElevationDeg: 88, railAzimuthDeg: 0, windSpeedSurface: 0, windAzimuthDeg: 0, mainDeployAltitudeAGL: 150 },
      reconstruction: { dryMassKg: target.massKg, dryCgM: target.cgM, modeledMassScale: reconstructed.modeledMassScale, pressureSample: data.pressureSample, isaPressureAltitudeM: elevation },
    };
  }
  throw new Error(`${spec.id}: unknown development model ${spec.modelId}; no substitute vehicle was run`);
}

export async function runDevelopmentCase(dataRoot: string, spec: DevelopmentCase, engineBytes: Uint8Array, engineSha256: string): Promise<DevelopmentReport> {
  if (spec.role !== 'development') throw new Error(`${spec.id} is reserved holdout and cannot run in the development command`);
  const modelSource = spec.modelSource ? await loadInputSource(dataRoot, spec.modelSource) : undefined;
  const motorSource = spec.motorSource ? await loadInputSource(dataRoot, spec.motorSource) : undefined;
  const data = await loadCaseData(dataRoot, spec);
  const sourceSha256 = createHash('sha256').update(data.sourceBytes).digest('hex');
  if (spec.expectedSourceSha256 && sourceSha256 !== spec.expectedSourceSha256) {
    throw new Error(`${spec.id}: source SHA-256 ${sourceSha256} does not match declared source ${spec.expectedSourceSha256}`);
  }
  const input = modelInputs(spec, data, motorSource);
  const engine = await instantiateEngine(engineBytes);
  setTestEngine((async (cmd, args) => engine.call(cmd, args)) as EngineInvoke);
  let result: SixDofSimulationResult;
  try { result = await simulateFlight(input.vehicle, input.motor, input.options); }
  finally { setTestEngine(null); }
  if (result.terminationReason !== 'touchdown') throw new Error(`${spec.id}: production engine did not reach touchdown`);
  const measured = data.samples.map((s) => ({ timeS: s.timeS - spec.launchTimeS, altitudeM: s.altitudeM }));
  const maxSample = measured.reduce((a, s) => s.altitudeM > a.altitudeM ? s : a, measured[0]);
  const measuredApogee = spec.measuredApogeeM ?? data.apogeeM ?? maxSample?.altitudeM;
  const measuredApogeeTime = spec.measuredApogeeTimeS ?? maxSample?.timeS;
  const qualification = qualifyDevelopmentMeasurements(spec, data);
  if (data.timeUnitBasis === 'assumed' || data.altitudeUnitBasis === 'assumed') qualification.absoluteApogee = { status: 'blocked', reasons: [...new Set([...qualification.absoluteApogee.reasons, 'units include an assumption'])] };
  const sim = result.telemetry.map((s) => ({ timeS: s.time, altitudeM: s.altitude }));
  const simVelocity = result.telemetry.map((s) => ({ timeS: s.time, altitudeM: s.velocity.z }));
  const startS = Math.max(measured[0]?.timeS ?? 0, sim[0]?.timeS ?? 0);
  const endS = Math.min(measured.at(-1)?.timeS ?? 0, sim.at(-1)?.timeS ?? 0);
  const residuals = qualification.altitudeCurve.status === 'ready' ? measured.filter((s) => s.timeS >= startS && s.timeS <= endS).flatMap((s) => {
    const h = interpolateWithin(sim, s.timeS); return h === null ? [] : [{ timeS: s.timeS, observedAltitudeM: s.altitudeM, simulatedAltitudeM: h, residualM: h - s.altitudeM }];
  }) : [];
  const errors = residuals.map((r) => r.residualM);
  const velocityResiduals = qualification.observedVelocity.status === 'ready' ? data.velocitySamples?.flatMap((s) => {
    const timeS = s.timeS - spec.launchTimeS;
    if (timeS < startS || timeS > endS || s.velocityMs === undefined) return [];
    const modelMs = interpolateWithin(simVelocity, timeS);
    return modelMs === null ? [] : [modelMs - s.velocityMs];
  }) ?? [] : [];
  if (!residuals.length && qualification.altitudeCurve.status === 'ready') qualification.altitudeCurve = { status: 'blocked', reasons: ['measurement and simulation have no sampled time overlap'] };
  if (spec.measuredApogeeM === undefined && qualification.absoluteApogee.status === 'ready' && measuredApogee === undefined) qualification.absoluteApogee = { status: 'blocked', reasons: ['measured apogee is unavailable'] };
  const reportedApogee = qualification.absoluteApogee.status === 'ready' ? measuredApogee : undefined;
  const timingReady = qualification.eventTiming.status === 'ready';
  const phaseSummary = summarizeTrajectoryPhases(residuals, startS, endS, spec.measuredBurnoutTimeS, measuredApogeeTime);
  return {
    schema: 'astraea-development-benchmark-v1', caseId: spec.id, title: spec.title, role: spec.role,
    source: { path: spec.path, url: spec.sourceUrl, sha256: sourceSha256, bytes: data.sourceBytes.length, measurementIdentity: `${spec.id}:${sourceSha256}:${spec.format}:${spec.altitudeChannel ?? 'Time(ms)/Altitude(m)'}:${spec.timeUnit}/${spec.altitudeUnit}:${spec.altitudeReference}:launch@${spec.launchTimeS}s:${spec.launchReferenceSource}` },
    measurement: {
      time: { unit: spec.timeUnit, basis: data.timeUnitBasis, source: spec.format === 'trajectory-csv' ? `source header Time(${spec.timeUnit})` : 'Raven FIP per-channel source timestamps; protocol unit declaration' },
      altitude: {
        unit: spec.altitudeUnit, basis: data.altitudeUnitBasis, reference: spec.altitudeReference,
        unitSource: spec.altitudeUnitBasis === 'header' ? `source altitude column header (${spec.altitudeUnit})` : 'Raven FIP source/protocol channel declaration (ft)',
        referenceSource: spec.altitudeReferenceSource,
        ...(spec.altitudeChannel ? { channel: spec.altitudeChannel } : {}),
      },
      launchReference: { timeS: spec.launchTimeS, source: spec.launchReferenceSource },
      ...(measuredApogeeTime !== undefined ? { observedApogee: { timeS: measuredApogeeTime, source: spec.measuredApogeeReference ?? `maximum sampled altitude in ${spec.altitudeChannel ?? 'declared altitude column'}` } } : {}),
      ...(spec.measuredBurnoutTimeS !== undefined ? { observedBurnout: { timeS: spec.measuredBurnoutTimeS, source: spec.measuredBurnoutReference ?? 'case declaration' } } : {}),
      observedVelocity: { ...(spec.velocityUnit ? { unit: spec.velocityUnit } : (data.velocitySamples?.length ? { unit: 'm/s' as const } : {})), basis: data.velocityUnitBasis, source: spec.velocityChannelDescription ?? (data.velocitySamples?.length ? 'source velocity column' : 'not recorded') },
    },
    engine: { kind: 'production-rust-wasm', sha256: engineSha256 },
    model: {
      id: spec.modelId, motorId: spec.motorId, configuration: spec.configuration, runManifest: result.runManifest,
      ...((modelSource || motorSource) ? { inputSources: [modelSource, motorSource].filter((source): source is LoadedInputSource => source !== undefined).map((source) => source.identity) } : {}),
      ...(input.reconstruction ? { reconstruction: input.reconstruction } : {}),
    },
    qualification,
    assumptions: { known: spec.knownInputs, assumed: spec.assumedInputs, limitations: spec.limitations },
    metrics: {
      simulatedMaxMach: { value: result.maxMach, unit: 'Mach' },
      ...(reportedApogee !== undefined ? { measuredApogee: { value: reportedApogee, unit: 'm AGL' }, simulatedApogee: { value: result.apogeeAltitude, unit: 'm AGL' }, signedApogeeError: { value: result.apogeeAltitude - reportedApogee, unit: 'm' } } : {}),
      ...(timingReady && measuredApogeeTime !== undefined ? { measuredApogeeTime: { value: measuredApogeeTime, unit: 's after declared launch reference' }, simulatedApogeeTime: { value: result.apogeeTime, unit: 's after declared launch reference' }, apogeeTimeError: { value: eventTimingError(result.apogeeTime, measuredApogeeTime), unit: 's' } } : {}),
    },
    trajectory: { overlapStartS: startS, overlapEndS: endS, sampleCount: residuals.length, residuals, ...(errors.length ? { maeM: errors.reduce((s, x) => s + Math.abs(x), 0) / errors.length, rmseM: rms(errors), maxAbsM: Math.max(...errors.map(Math.abs)) } : {}), phases: phaseSummary },
    observedVelocity: { available: Boolean(data.velocitySamples?.length), ...(spec.velocityChannelDescription ? { description: spec.velocityChannelDescription } : {}), sampleCount: data.velocitySamples?.length ?? 0, residualRmseMs: rms(velocityResiduals), residualSampleCount: velocityResiduals.length },
  };
}

export function compareReports(baseline: DevelopmentReport, candidate: DevelopmentReport) {
  if (baseline.schema !== candidate.schema || baseline.caseId !== candidate.caseId || baseline.source.measurementIdentity !== candidate.source.measurementIdentity) {
    throw new Error('Cannot compare reports: case, schema, or measurement identity/reference differs');
  }
  const baselineTimes = baseline.trajectory.residuals.map((r) => r.timeS);
  const candidateTimes = candidate.trajectory.residuals.map((r) => r.timeS);
  if (baseline.trajectory.overlapStartS !== candidate.trajectory.overlapStartS || baseline.trajectory.overlapEndS !== candidate.trajectory.overlapEndS || baselineTimes.length !== candidateTimes.length || baselineTimes.some((time, i) => time !== candidateTimes[i])) {
    throw new Error('Cannot compare reports: altitude residuals cover different observation times');
  }
  const delta = (a?: MetricValue, b?: MetricValue) => a && b && a.unit === b.unit ? b.value - a.value : undefined;
  return { caseId: baseline.caseId, measurementIdentity: baseline.source.measurementIdentity,
    signedApogeeErrorDeltaM: delta(baseline.metrics.signedApogeeError, candidate.metrics.signedApogeeError),
    apogeeTimeErrorDeltaS: delta(baseline.metrics.apogeeTimeError, candidate.metrics.apogeeTimeError),
    altitudeRmseDeltaM: baseline.trajectory.rmseM !== undefined && candidate.trajectory.rmseM !== undefined ? candidate.trajectory.rmseM - baseline.trajectory.rmseM : undefined,
  };
}

export function renderHumanReport(report: DevelopmentReport): string {
  const q = (name: string, x: Qualification) => `${name}: ${x.status}${x.reasons.length ? ` — ${x.reasons.join('; ')}` : ''}`;
  const metrics = Object.entries(report.metrics).map(([k, v]) => `- ${k}: ${(v as MetricValue).value.toFixed(3)} ${(v as MetricValue).unit}`).join('\n') || '- No qualified scalar metrics';
  const phaseLine = (name: string, phase?: PhaseResult) => phase
    ? `- ${name} ${phase.intervalS[0].toFixed(3)}–${phase.intervalS[1].toFixed(3)} s; n=${phase.sampleCount}; RMSE ${phase.rmseM?.toFixed(3) ?? 'unavailable'} m`
    : `- ${name}: unavailable`;
  const phases = report.trajectory.phases;
  const apogeeEvent = report.measurement.observedApogee ? `${report.measurement.observedApogee.timeS.toFixed(3)} s (${report.measurement.observedApogee.source})` : 'unavailable';
  const burnoutEvent = report.measurement.observedBurnout ? `${report.measurement.observedBurnout.timeS.toFixed(3)} s (${report.measurement.observedBurnout.source})` : 'unavailable';
  return `# ${report.title}\n\nRole: development / exploratory. This is not independent validation.\n\n- Source SHA-256: \`${report.source.sha256}\` (${report.source.bytes} bytes)\n- Production Rust/WASM SHA-256: \`${report.engine.sha256}\`\n- Model: ${report.model.id}; motor: ${report.model.motorId}\n- Time: ${report.measurement.time.unit} (${report.measurement.time.basis}; ${report.measurement.time.source})\n- Altitude: ${report.measurement.altitude.unit} ${report.measurement.altitude.reference} (unit: ${report.measurement.altitude.basis}; ${report.measurement.altitude.unitSource}; reference: ${report.measurement.altitude.referenceSource})\n- Launch reference: ${report.measurement.launchReference.timeS} s — ${report.measurement.launchReference.source}; no apogee alignment or time warping\n\n## Qualification\n\n${Object.entries(report.qualification).map(([k, v]) => `- ${q(k, v)}`).join('\n')}\n\n## Metrics\n\n${metrics}\n\n## Trajectory residuals\n\nFull overlap ${report.trajectory.overlapStartS.toFixed(3)}–${report.trajectory.overlapEndS.toFixed(3)} s; ${report.trajectory.sampleCount} observed samples interpolated only inside overlap. Full-overlap MAE ${report.trajectory.maeM?.toFixed(3) ?? 'unavailable'} m; RMSE ${report.trajectory.rmseM?.toFixed(3) ?? 'unavailable'} m; max |residual| ${report.trajectory.maxAbsM?.toFixed(3) ?? 'unavailable'} m. This full-overlap score includes post-apogee descent and its recovery-model limitations. Residual is model minus observed altitude.\n\nMeasured burnout boundary: ${burnoutEvent}. Measured apogee boundary: ${apogeeEvent}. Phase times retain the original launch reference:\n\n${phaseLine('Powered ascent', phases.poweredAscent)}\n${phaseLine('Unpowered ascent/coast', phases.coastAscent)}\n${phaseLine('Post-apogee descent', phases.postApogeeDescent)}\n\nPowered/coast qualification: ${phases.poweredCoast.status}${phases.poweredCoast.reason ? ` — ${phases.poweredCoast.reason}` : ''}.\n\n## Inputs and limits\n\nKnown: ${report.assumptions.known.join('; ')}.\n\nAssumed: ${report.assumptions.assumed.join('; ')}.\n\nLimitations: ${report.assumptions.limitations.join('; ')}.\n\nObserved velocity: ${report.observedVelocity.available ? `${report.observedVelocity.sampleCount} source samples (${report.observedVelocity.description ?? 'unit-qualified series'}); vertical-velocity RMSE ${report.observedVelocity.residualRmseMs?.toFixed(3) ?? 'unavailable'} m/s across ${report.observedVelocity.residualSampleCount} overlapping points` : 'unavailable'}; no burnout event is inferred from a velocity peak.\n`;
}
