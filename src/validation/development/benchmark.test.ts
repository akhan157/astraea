import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compareReports, eventTimingError, interpolateWithin, parseRavenFip, qualifyDevelopmentMeasurements, summarizeTrajectoryPhases, runDevelopmentCase,
  type CaseData, type DevelopmentCase, type DevelopmentReport,
} from './benchmark';

const spec: DevelopmentCase = {
  id: 'synthetic-dev', title: 'Synthetic development flight', role: 'development', path: 'flight.csv', format: 'trajectory-csv',
  sourceUrl: 'synthetic fixture', timeUnit: 's', altitudeUnit: 'm', timeUnitBasis: 'header', altitudeUnitBasis: 'header',
  altitudeReference: 'AGL', altitudeReferenceSource: 'synthetic source record', launchTimeS: 0, launchReferenceSource: 'declared launch event', measuredApogeeM: 10,
  modelId: 'model-a', motorId: 'motor-a', configuration: 'fixed', knownInputs: [], assumedInputs: [], limitations: [],
};
const data = (patch: Partial<CaseData> = {}): CaseData => ({
  samples: [{ timeS: 0, altitudeM: 0 }, { timeS: 1, altitudeM: 10 }],
  timeUnitBasis: 'header', altitudeUnitBasis: 'header', velocityUnitBasis: 'assumed', sourceBytes: new Uint8Array([1]), ...patch,
});

function report(overrides: Partial<DevelopmentReport> = {}): DevelopmentReport {
  return {
    schema: 'astraea-development-benchmark-v1', caseId: spec.id, title: spec.title, role: 'development',
    source: { path: spec.path, url: spec.sourceUrl, sha256: 'abc', bytes: 1, measurementIdentity: 'identity-a' },
    measurement: {
      time: { unit: 's', basis: 'header', source: 'fixture header' },
      altitude: { unit: 'm', basis: 'header', reference: 'AGL', unitSource: 'fixture header', referenceSource: 'fixture source record' },
      launchReference: { timeS: 0, source: 'fixture launch marker' },
      observedVelocity: { basis: 'assumed', source: 'none' },
    },
    engine: { kind: 'production-rust-wasm', sha256: 'engine-a' },
    model: { id: spec.modelId, motorId: spec.motorId, configuration: spec.configuration, runManifest: { frames: '', ground: '', atmosphere: '', depletion: '', railContact: '', recovery: '', unsupportedHandling: '', unsupportedScope: [] } },
    qualification: {
      absoluteApogee: { status: 'ready', reasons: [] }, eventTiming: { status: 'ready', reasons: [] },
      altitudeCurve: { status: 'ready', reasons: [] }, observedVelocity: { status: 'blocked', reasons: ['absent'] },
    }, assumptions: { known: [], assumed: [], limitations: [] }, metrics: {},
    trajectory: { overlapStartS: 0, overlapEndS: 1, sampleCount: 0, residuals: [], phases: { poweredCoast: { status: 'blocked', reason: 'no measured burnout' } } }, observedVelocity: { available: false, sampleCount: 0, residualSampleCount: 0 },
    ...overrides,
  };
}

describe('development benchmark qualification and comparisons', () => {
  it('blocks only metrics that depend on assumed units while preserving valid partial altitude comparison', () => {
    const q = qualifyDevelopmentMeasurements(spec, data({ altitudeUnitBasis: 'assumed' }));
    expect(q.absoluteApogee.status).toBe('blocked');
    expect(q.eventTiming.status).toBe('blocked');
    expect(q.altitudeCurve.status).toBe('blocked');
    expect(q.observedVelocity.status).toBe('blocked');

    const partial = qualifyDevelopmentMeasurements(spec, data());
    expect(partial.absoluteApogee.status).toBe('ready');
    expect(partial.eventTiming.status).toBe('ready');
    expect(partial.altitudeCurve.status).toBe('ready');
    expect(partial.observedVelocity.status).toBe('blocked');
  });

  it('blocks altitude-dependent metrics when the vertical reference is unknown', () => {
    const unknownReference = qualifyDevelopmentMeasurements({ ...spec, altitudeReference: 'unknown' }, data());
    expect(unknownReference.absoluteApogee.status).toBe('blocked');
    expect(unknownReference.eventTiming.status).toBe('blocked');
    expect(unknownReference.altitudeCurve.status).toBe('blocked');
    expect(unknownReference.observedVelocity.status).toBe('blocked');
  });

  it('does not qualify velocity with an assumed velocity unit', () => {
    const q = qualifyDevelopmentMeasurements(spec, data({ velocitySamples: [{ timeS: 0, altitudeM: 0, velocityMs: 1 }] }));
    expect(q.observedVelocity.status).toBe('blocked');
    expect(q.observedVelocity.reasons[0]).toMatch(/velocity unit is not explicit/);
  });

  it('keeps the declared clock offset visible and never extrapolates residual support', () => {
    const observedApogeeTime = 8.4;
    const simulatedApogeeTime = 10.1;
    expect(eventTimingError(simulatedApogeeTime, observedApogeeTime)).toBeCloseTo(1.7);
    const sim = [{ timeS: 0, altitudeM: 0 }, { timeS: 1, altitudeM: 10 }];
    expect(interpolateWithin(sim, -0.001)).toBeNull();
    expect(interpolateWithin(sim, 1.001)).toBeNull();
    expect(interpolateWithin(sim, 0.5)).toBe(5);
  });

  it('keeps a simulated descent error out of the measured powered and coast diagnostics', () => {
    const residuals = [0, 1, 2, 3, 4, 5].map((timeS) => ({ timeS, observedAltitudeM: 100 - timeS, simulatedAltitudeM: 100 - timeS + (timeS > 3 ? 100 : 0), residualM: timeS > 3 ? 100 : 0 }));
    const phases = summarizeTrajectoryPhases(residuals, 0, 5, 2, 3);
    expect(phases.poweredCoast.status).toBe('ready');
    expect(phases.poweredAscent).toMatchObject({ sampleCount: 3, rmseM: 0 });
    expect(phases.coastAscent).toMatchObject({ sampleCount: 1, rmseM: 0 });
    expect(phases.postApogeeDescent).toMatchObject({ sampleCount: 2, rmseM: 100 });
    const withoutMeasuredBurnout = summarizeTrajectoryPhases(residuals, 0, 5, undefined, 3);
    expect(withoutMeasuredBurnout.poweredCoast.status).toBe('blocked');
    expect(withoutMeasuredBurnout.poweredAscent).toBeUndefined();
    expect(withoutMeasuredBurnout.coastAscent).toBeUndefined();
    expect(withoutMeasuredBurnout.postApogeeDescent?.rmseM).toBe(100);
  });

  it('refuses baseline/candidate comparisons with different measurement identities', () => {
    expect(() => compareReports(report(), report({ source: { ...report().source, measurementIdentity: 'identity-b' } })))
      .toThrow(/measurement identity\/reference differs/);
    const same = compareReports(report({ metrics: { signedApogeeError: { value: 4, unit: 'm' } }, trajectory: { overlapStartS: 0, overlapEndS: 1, sampleCount: 2, residuals: [], phases: { poweredCoast: { status: 'blocked', reason: 'none' } }, rmseM: 5 } }),
      report({ metrics: { signedApogeeError: { value: 2, unit: 'm' } }, trajectory: { overlapStartS: 0, overlapEndS: 1, sampleCount: 2, residuals: [], phases: { poweredCoast: { status: 'blocked', reason: 'none' } }, rmseM: 3 } }));
    expect(same.signedApogeeErrorDeltaM).toBe(-2);
    expect(same.altitudeRmseDeltaM).toBe(-2);
    expect(() => compareReports(report(), report({ trajectory: { overlapStartS: 0, overlapEndS: 0.9, sampleCount: 0, residuals: [], phases: { poweredCoast: { status: 'blocked', reason: 'none' } } } })))
      .toThrow(/different observation times/);
  });

  it('retains independent Raven channel clocks and rejects malformed ragged rows', () => {
    const csv = [
      'Time@Altitude,Altitude,bILBA,Time@Velocity,Velocity,bILBA',
      '0,0,b0000,0.1,10,b0000',
      '1,10,b0000,,',
    ].join('\n');
    const parsed = parseRavenFip(csv, 'Altitude', 'Velocity', 'm/s');
    expect(parsed.samples.map((s) => s.timeS)).toEqual([0, 1]);
    expect(parsed.velocitySamples?.map((s) => s.timeS)).toEqual([0.1]);
    expect(() => parseRavenFip(csv.replace('1,10,b0000,,', '1,10,invalid,,'), 'Altitude')).toThrow(/malformed/);
  });

  it('uses the first declared pressure sample with its own clock, not a lower in-flight pressure', () => {
    const csv = [
      'Time@Altitude,Altitude,bILBA,Time@Baro (Atm),Baro (Atm),bILBA',
      '0,0,b0000,0.05,0.95,b0000',
      '1,400,b0000,2,0.8,b0000',
    ].join('\n');
    const parsed = parseRavenFip(csv, 'Altitude', undefined, undefined, 'Baro (Atm)');
    expect(parsed.pressureSample?.timeS).toBe(0.05);
    expect(parsed.pressureSample?.pressurePa).toBeCloseTo(0.95 * 101325, 9);
    expect(parsed.samples[1].altitudeM).toBeCloseTo(121.92, 9);
    expect(() => parseRavenFip(csv.replaceAll('Baro (Atm)', 'Other'), 'Altitude', undefined, undefined, 'Baro (Atm)')).toThrow(/missing declared pressure channel/);
  });

  it('refuses changed declared model bytes before reading flight outcomes or invoking the engine', async () => {
    const root = await mkdtemp(join(tmpdir(), 'astraea-development-source-'));
    try {
      await writeFile(join(root, 'model.ork'), 'changed model bytes');
      const sha256 = createHash('sha256').update(new TextEncoder().encode('original model bytes')).digest('hex');
      await expect(runDevelopmentCase(root, {
        ...spec, modelSource: { path: 'model.ork', url: 'https://example.invalid/model.ork', sha256 },
      }, new Uint8Array(), 'unused-engine')).rejects.toThrow(/source SHA-256.*does not match declared source/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('refuses a missing declared motor source instead of substituting another motor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'astraea-development-motor-'));
    try {
      await expect(runDevelopmentCase(root, {
        ...spec, motorSource: { path: 'missing.rasp', url: 'https://example.invalid/motor.rasp', sha256: 'unavailable' },
      }, new Uint8Array(), 'unused-engine')).rejects.toThrow(/Missing declared model\/motor source.*missing\.rasp/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('refuses an unknown model identity rather than simulating Cosmic Cargo under another name', async () => {
    const root = await mkdtemp(join(tmpdir(), 'astraea-development-identity-'));
    try {
      await writeFile(join(root, 'flight.csv'), 'Time (s),Altitude(m)\n0,0\n1,10\n');
      await expect(runDevelopmentCase(root, spec, new Uint8Array(), 'unused-engine')).rejects.toThrow(/unknown development model model-a/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
