/** Exact sampled legacy observables, not geometry-only CP or a stability verdict.
 * Source/units: execution-runs/RMP10-flight-model-history/INTERFACE.md.
 * Parser checks software consistency, NOT authenticity or physical accuracy.
 */
import {
  BOATTAIL_POLICIES, FIN_INTERFERENCE_IDS,
  type BoattailPolicy, type FinInterferenceId, type NormalLawId,
} from './flightModel';

export const MOMENT_ARM_SCHEMA = 'astraea-flight-moment-arm-history/1.0.0';
export const MOMENT_ARM_MODEL = 'flight-signed-normal-plus-wind-drag-v1';
export const MOMENT_ARM_MECHANICS = 'legacy-primitive-mass-inertia/1.0.0';
export const MOMENT_ARM_BODY_FRAME = 'right-handed-+Y-noseward; rates=pitch,roll,yaw';
export const MOMENT_ARM_DATUM = 'meters-aft-of-nose; moments-about-instantaneous-combined-CG';
export const MOMENT_ARM_SAMPLING = 'committed-macro-through-motor-burn-time-plus-initial';
export const MAX_MOMENT_ARM_POINTS = 5000;

type Vector = { x: number; y: number; z: number };
export interface NormalMomentArm {
  cPerRad: number; jMPerRad: number; cpFromNoseM: number;
  armM: number; armCalibers: number; armPercentLength: number;
  /** J-C*CG (m/rad), NOT dM/dalpha or total restoring stiffness. */
  cnaWeightedArmMPerRad: number;
}
export interface MomentArmPoint {
  timeS: number; massKg: number; cgFromNoseM: number; mach: number;
  incidenceDeg: number; dynamicPressurePa: number;
  railBound: boolean; recovery: boolean; powered: boolean;
  domain: 'valid' | 'extrapolated' | 'unsupported';
  aeroForceBodyN: Vector; staticMomentBodyNm: Vector;
  dampingMomentBodyNm: Vector; totalMomentBodyNm: Vector;
  normalApplicability: 'active-airframe' | 'not-applicable-live-canopy';
  normal: NormalMomentArm | null;
}
export interface MomentArmHistory {
  schemaId: typeof MOMENT_ARM_SCHEMA; reportMomentArmHistory: true;
  modelId: typeof MOMENT_ARM_MODEL; mechanicalModelId: typeof MOMENT_ARM_MECHANICS;
  /** Present on runs written after the published normal law; absent on older archives. */
  normalLawId?: NormalLawId;
  boattailPolicy?: BoattailPolicy;
  /** Present on runs written after the P4 fin-station fix; absent on older archives. */
  finInterferenceId?: FinInterferenceId;
  bodyFrame: typeof MOMENT_ARM_BODY_FRAME; stationDatum: typeof MOMENT_ARM_DATUM;
  sampling: typeof MOMENT_ARM_SAMPLING;
  referenceAreaM2: number; referenceDiameterM: number; referenceLengthM: number;
  /** Declared motor duration, NOT independent observed/root-sample evidence. */
  burnoutTimeS: number; sampleCount: number; timeRangeS: [number, number];
  maxGapS: number; lastSampleToBurnoutS: number; exactBurnoutSampleExists: boolean;
  points: MomentArmPoint[];
}

function fail(reason: string): never { throw new Error(`momentArmHistory: ${reason}`); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
  const out = value as Record<string, unknown>;
  if (Object.keys(out).sort().join('\0') !== [...keys].sort().join('\0')) fail('missing or unknown fields');
  return out;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('expected finite number');
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') fail('expected boolean');
  return value;
}
function equal(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) fail(`${label} disagrees with schema or recorded values`);
}
function vector(value: unknown): void {
  const v = object(value, ['x', 'y', 'z']); Object.values(v).forEach(number);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

/** Never fills defaults, drops declarations, rounds values, or consults live state. */
export function parseMomentArmHistory(value: unknown): MomentArmHistory {
  const baseKeys = ['schemaId','reportMomentArmHistory','modelId','mechanicalModelId',
    'bodyFrame','stationDatum','sampling','referenceAreaM2','referenceDiameterM','referenceLengthM',
    'burnoutTimeS','sampleCount','timeRangeS','maxGapS','lastSampleToBurnoutS','exactBurnoutSampleExists','points'];
  // New runs carry the normal-law identity; old archives do not. Accept both
  // shapes, but never silently half-declare it.
  const raw = value as Record<string, unknown>;
  const declaresNormalLaw = raw !== null && typeof raw === 'object'
    && (Object.hasOwn(raw, 'normalLawId') || Object.hasOwn(raw, 'boattailPolicy'));
  const declaresFinStation = raw !== null && typeof raw === 'object' && Object.hasOwn(raw, 'finInterferenceId');
  const keys = declaresNormalLaw ? [...baseKeys, 'normalLawId', 'boattailPolicy'] : [...baseKeys];
  if (declaresFinStation) keys.push('finInterferenceId');
  const h = object(value, keys);
  for (const [key, expected] of Object.entries({ schemaId: MOMENT_ARM_SCHEMA,
    reportMomentArmHistory: true, modelId: MOMENT_ARM_MODEL, mechanicalModelId: MOMENT_ARM_MECHANICS,
    bodyFrame: MOMENT_ARM_BODY_FRAME, stationDatum: MOMENT_ARM_DATUM, sampling: MOMENT_ARM_SAMPLING,
  })) equal(h[key], expected, key);
  if (declaresNormalLaw) {
    if (typeof h.normalLawId !== 'string'
      || !['legacy-finsonly-degrade-v1', 'published-supersonic-normal-v1'].includes(h.normalLawId)) {
      fail('unknown normalLawId');
    }
    if (typeof h.boattailPolicy !== 'string'
      || !(BOATTAIL_POLICIES as readonly string[]).includes(h.boattailPolicy)) {
      fail('unknown boattailPolicy');
    }
  }
  if (declaresFinStation
    && !(FIN_INTERFERENCE_IDS as readonly string[]).includes(h.finInterferenceId as string)) {
    fail('unknown finInterferenceId');
  }
  for (const key of ['referenceAreaM2','referenceDiameterM','referenceLengthM','burnoutTimeS']) {
    if (number(h[key]) <= 0) fail(`${key} must be positive`);
  }
  if (!Array.isArray(h.points) || h.points.length < 1 || h.points.length > MAX_MOMENT_ARM_POINTS) fail('expected 1..5000 samples');
  equal(h.sampleCount, h.points.length, 'sampleCount');
  let previous = -1; let maxGap = 0;
  const times: number[] = [];
  for (const raw of h.points) {
    const p = object(raw, ['timeS','massKg','cgFromNoseM','mach','incidenceDeg','dynamicPressurePa',
      'railBound','recovery','powered','domain','aeroForceBodyN','staticMomentBodyNm','dampingMomentBodyNm',
      'totalMomentBodyNm','normalApplicability','normal']);
    const t = number(p.timeS);
    if (t < 0 || t <= previous || t > (h.burnoutTimeS as number)) fail('invalid/unordered sample clock');
    if (previous >= 0) maxGap = Math.max(maxGap, t - previous);
    previous = t; times.push(t);
    if (number(p.massKg) <= 0 || number(p.mach) < 0 || number(p.dynamicPressurePa) < 0) fail('invalid mass/flow');
    number(p.cgFromNoseM); number(p.incidenceDeg);
    boolean(p.railBound); boolean(p.recovery); boolean(p.powered);
    equal(p.powered, t < (h.burnoutTimeS as number), 'powered flag');
    if (typeof p.domain !== 'string' || !['valid','extrapolated','unsupported'].includes(p.domain)) fail('unknown computational domain');
    for (const key of ['aeroForceBodyN','staticMomentBodyNm','dampingMomentBodyNm','totalMomentBodyNm']) vector(p[key]);
    equal(p.normalApplicability, p.recovery ? 'not-applicable-live-canopy' : 'active-airframe', 'applicability');
    if (p.recovery) { equal(p.normal, null, 'inactive airframe quantities'); continue; }
    const n = object(p.normal, ['cPerRad','jMPerRad','cpFromNoseM','armM','armCalibers','armPercentLength','cnaWeightedArmMPerRad']);
    Object.values(n).forEach(number);
    if ((n.cPerRad as number) < 1e-4) fail('legacy normal slope outside positive support');
    equal(n.cpFromNoseM, (n.jMPerRad as number) / (n.cPerRad as number), 'CP=J/C');
    const arm = (n.cpFromNoseM as number) - (p.cgFromNoseM as number);
    equal(n.armM, arm, 'arm');
    equal(n.armCalibers, arm / (h.referenceDiameterM as number), 'calibers');
    equal(n.armPercentLength, 100 * arm / (h.referenceLengthM as number), 'percent length');
    equal(n.cnaWeightedArmMPerRad, (n.jMPerRad as number) - (n.cPerRad as number) * (p.cgFromNoseM as number), 'J-C*CG');
  }
  equal(times[0], 0, 'initial time');
  if (!Array.isArray(h.timeRangeS) || h.timeRangeS.length !== 2) fail('invalid time range');
  equal(h.timeRangeS[0], times[0], 'first time'); equal(h.timeRangeS[1], previous, 'last time');
  equal(h.maxGapS, maxGap, 'maxGapS');
  equal(h.lastSampleToBurnoutS, (h.burnoutTimeS as number) - previous, 'lastSampleToBurnoutS');
  equal(h.exactBurnoutSampleExists, times.includes(h.burnoutTimeS as number), 'exactBurnoutSampleExists');
  return freeze(structuredClone(value)) as MomentArmHistory;
}
