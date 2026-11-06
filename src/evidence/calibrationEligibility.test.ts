// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assessCalibrationEligibility, modelCalibrationEventEvidence, parseCalibrationEvidence, type CalibrationEvidence, type CalibrationSideEvidence } from './calibrationEligibility';
import { deriveCoastPoints } from './coastWindow';

const condition = { status: 'supported' as const, source: 'Controlled vertical constant-mass case' };
const side: CalibrationSideEvidence = {
  burnout: { earliestS: 0.9, latestS: 1, source: 'Declared final motor event in trajectory clock' },
  recovery: { kind: 'first-event', event: { earliestS: 4.2, latestS: 4.3, source: 'Declared first recovery event in trajectory clock' } },
  verticalMotion: condition, constantMass: condition,
};
const windows = { log: { supportStartS: 1, supportEndS: 4 }, model: { supportStartS: 1, supportEndS: 4 } };
const evidence = (log: CalibrationSideEvidence = side): CalibrationEvidence => ({ log, model: side });

describe('source-attributed calibration eligibility', () => {
  it('requires event and physical-condition evidence separately, and never promotes feature proxies', () => {
    const result = assessCalibrationEligibility(windows, { log: {}, model: {} });
    expect(result.status).toBe('unverified');
    expect(result.reasons).toHaveLength(8);
    expect(assessCalibrationEligibility(windows, evidence()).status).toBe('conditional');
    const { verticalMotion: _motion, ...missing } = side;
    expect(assessCalibrationEligibility(windows, evidence(missing)).status).toBe('unverified');
    expect(assessCalibrationEligibility(windows, evidence({ ...side, verticalMotion: { ...condition, status: 'unsupported' } })).status).toBe('unsupported');
  });

  it('checks conservative burnout bounds and first recovery against full raw filter support', () => {
    expect(assessCalibrationEligibility(windows, evidence({ ...side, burnout: { ...side.burnout!, latestS: 1.01 } })).status).toBe('unsupported');
    for (const earliestS of [3.99, 4]) {
      expect(assessCalibrationEligibility(windows, evidence({ ...side, recovery: { kind: 'first-event', event: { earliestS, latestS: 4.1, source: 'Uncertain recovery interval' } } })).status).toBe('unsupported');
    }
    expect(assessCalibrationEligibility(windows, evidence({ ...side, recovery: { kind: 'absent-through', throughS: 3.99, source: 'Partial observed record' } })).status).toBe('unverified');
    expect(assessCalibrationEligibility(windows, evidence({ ...side, recovery: { kind: 'absent-through', throughS: 4, source: 'Observed recovery-free through support end' } })).status).toBe('conditional');
  });

  it('refuses a recovery event after the last fit centre but inside its actual smoothing support', () => {
    // This controlled kinematic record is for filter/event mechanics, not flight validation.
    const samples = Array.from({ length: 351 }, (_, i) => {
      const timeS = i / 50;
      return { timeS, altitudeM: 100 + 80 * timeS - 6 * timeS ** 2, velocityMs: 80 - 12 * timeS };
    });
    const window = deriveCoastPoints(samples, { massKg: 1, refAreaM2: 0.01, launchElevationM: 0 });
    expect(window.supportStartS).toBe(samples[0].timeS);
    expect(window.supportEndS).toBeGreaterThan(window.windowEndS);
    expect(window.supportEndS).toBeLessThanOrEqual(window.windowEndS + window.halfWidthS);
    expect(window.velocityPeakAtBoundary).toBe(true);
    expect(window.altitudePeakAtBoundary).toBe(false);
    const recoveryS = (window.windowEndS + window.supportEndS) / 2;
    const reviewed = { ...side, burnout: { earliestS: -1, latestS: -1, source: 'Known before record' }, recovery: { kind: 'first-event' as const, event: { earliestS: recoveryS, latestS: recoveryS, source: 'Controlled deployment' } } };
    expect(assessCalibrationEligibility({ log: window, model: window }, { log: reviewed, model: reviewed }).status).toBe('unsupported');
    // It would pass the erroneous centre-only check.
    expect(recoveryS).toBeGreaterThan(window.windowEndS);
  });

  it('records actual discrete support and boundary truncation for altitude-only sparse samples', () => {
    const samples = Array.from({ length: 60 }, (_, i) => ({ timeS: 2 + i * 0.07, altitudeM: 100 + 80 * (i * 0.07) - 6 * (i * 0.07) ** 2 }));
    const window = deriveCoastPoints(samples, { massKg: 1, refAreaM2: 0.01, launchElevationM: 0 });
    expect(window.method).toBe('altitude-derivative');
    expect(window.altitudePeakAtBoundary).toBe(true);
    expect(window.supportEndS).toBe(samples.at(-1)!.timeS);
    expect(samples.some((sample) => sample.timeS === window.supportStartS)).toBe(true);
    expect(window.supportStartS).toBeGreaterThanOrEqual(window.sampleStartS);
    expect(window.supportEndS).toBeLessThan(window.windowEndS + window.halfWidthS);
  });

  it('uses final native burnout and earliest recovery; separation overrides constant-mass review', () => {
    const native = modelCalibrationEventEvidence([
      { name: 'velocity peak', time: 0 }, { name: 'Motor Burnout', time: 0.2 }, { name: 'Motor Burnout', time: 1 },
      { name: 'Main Parachute Deployment', time: 5 }, { name: 'Apogee & Drogue Deployment', time: 4.5 },
      { name: 'Stage Separation', time: 3 },
    ]);
    expect(native.burnout?.latestS).toBe(1);
    expect(native.recovery).toMatchObject({ kind: 'first-event', event: { earliestS: 4.5 } });
    expect(assessCalibrationEligibility(windows, { log: side, model: { ...native, verticalMotion: condition, constantMass: condition } }).status).toBe('unsupported');
    expect(modelCalibrationEventEvidence([{ name: 'velocity peak', time: 0 }]).burnout).toBeUndefined();
  });

  it('fails closed on reversed, nonfinite or unattributed evidence', () => {
    for (const burnout of [
      { earliestS: 2, latestS: 1, source: 'source' }, { earliestS: NaN, latestS: 1, source: 'source' },
      { earliestS: 0, latestS: 1, source: ' ' },
    ]) expect(() => parseCalibrationEvidence(evidence({ ...side, burnout }))).toThrow(/evidence/);
  });
});
