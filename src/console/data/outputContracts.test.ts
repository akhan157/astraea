import { describe, expect, it } from 'vitest';
import { useProjectStore } from '../../state/project';
import { momentArmHistoryFixture } from '../../application/momentArmHistory.fixture';
import { flightResult, stabilityAnalysis } from '../testFixtures';
import { marginGate, sixDofOptions, stabilityBreakdown, toFlightRun, type LaunchConfig } from './adapter';

const vehicle = useProjectStore.getState().project.vehicle;
const options: LaunchConfig = { railLength: 3.66, railElevationDeg: 85, railAzimuthDeg: 0, windSpeedSurface: 2, windAzimuthDeg: 0, finCantAngleDeg: 0, mainDeployAltitudeAGL: 100 };
const convert = (result = flightResult()) => toFlightRun(result, vehicle, undefined, 'key', 1, 0, undefined, undefined, options);

describe('console output scope and provenance', () => {
  it('preserves configured guide displacement and native rail decisions without claiming measured geometry', () => {
    expect(sixDofOptions(options).railLength).toBe(3.66);
    const run = convert(flightResult({ railExitVelocity: 27.5, isRailExitSafe: false }));
    expect(run.summary.railExitSpeed.value).toBe(27.5);
    expect(run.gates.find((g) => g.id === 'rail_exit')).toMatchObject({ status: 'fail', threshold: '>= 15 m/s' });
    expect(run.manifest.railTravel).toContain('3.66 m');
    expect(run.manifest.railTravel).toContain('provenance unavailable');
    expect(run.summary.railExitSpeed.reason).toContain('Ground-speed');
    // The departure claim stops at modeled full release: no first-rotational-freedom
    // or competition-compliance claim may be attached to this speed.
    expect(run.summary.railExitSpeed.reason).toMatch(/first rotational freedom are not resolved/);
    expect(run.manifest.railTravel).toMatch(/Physical rail length and first rotational freedom are not inferred/);
    for (const railGate of [run.gates, convert(flightResult()).gates].map((gates) => gates.find((g) => g.id === 'rail_exit')!)) {
      expect(railGate.reason).toMatch(/first rotational freedom and competition compliance are not assessed/);
    }
    expect(toFlightRun(flightResult(), vehicle, undefined, 'key', 1, 0).manifest.railTravel).toContain('value unavailable');
  });

  it('keeps landing energy as a lumped readout and gates speed on the cited Tripoli Level 1 limit', () => {
    const pass = convert(flightResult());
    expect(pass.summary.landingEnergy.value).toBe(14.2);
    expect(pass.summary.landingEnergy.reason).toMatch(/one lumped mass \(airframe plus remaining propellant\)/);
    expect(pass.summary.landingEnergy.reason).toMatch(/[Pp]er-section or suspended-section recovery energy is not computed/);
    expect(pass.summary.landingEnergy.reason).toMatch(/no standard landing-energy threshold is applied/);
    expect(pass.gates.find((g) => g.id === 'landing_energy')).toBeUndefined();

    const speed = pass.gates.find((g) => g.id === 'landing_speed')!;
    expect(speed).toMatchObject({ status: 'pass', threshold: '<= 10.67 m/s (35 ft/s)' });
    expect(speed.reason).toMatch(/Tripoli Level 1 certification limit is 35 ft\/s \(10\.67 m\/s\)/);
    expect(speed.reason).toContain('https://www.tripoli.org/Level1');
    expect(speed.reason).toMatch(/no standard threshold/);
    // The limit is a certification requirement, never presented as a regulation or rule.
    expect(speed.reason).not.toMatch(/regulation|NFPA|competition rule/i);

    // Status follows the recorded touchdown speed, not the engine's old
    // internal 6 m/s / 20 J convenience flags.
    const fast = convert(flightResult({ landingVelocity: 12, isLandingVelocitySafe: true, isLandingSafe: true }));
    expect(fast.gates.find((g) => g.id === 'landing_speed')?.status).toBe('fail');
    const slow = convert(flightResult({ landingVelocity: 10.6, isLandingVelocitySafe: false, isLandingSafe: false }));
    expect(slow.gates.find((g) => g.id === 'landing_speed')?.status).toBe('pass');
    // Kept for the energy value itself: it still reaches the summary and trace.
    expect(convert(flightResult({ landingKineticEnergy: 25 })).summary.landingEnergy.value).toBe(25);
  });

  it('keeps the declared contact datum and unsupported-scope disclosures visible to consumers', () => {
    const scope = ['multi-stage separation and staging events', 'non-flat terrain and terrain-relative deployment', 'rail tip-off dynamics and rail friction'];
    const run = convert(flightResult({ runManifest: { ...flightResult().runManifest, ground: 'flat z=0 AGL touchdown plane', unsupportedScope: scope } }));
    expect(run.manifest.ground).toBe('flat z=0 AGL touchdown plane');
    expect(run.manifest.unsupportedScope).toContain('terrain-relative deployment');
    expect(run.manifest.unsupportedScope).toContain('rail tip-off dynamics and rail friction');
    expect(run.manifest.unsupportedScope).not.toMatch(/button|lug/i);
  });

  it('marks the sampled moment-arm history as sampled-only in the exported manifest', () => {
    const run = toFlightRun(flightResult({ momentArmHistory: momentArmHistoryFixture(3.2) }), vehicle,
      undefined, 'key', 1, 0, undefined, undefined, undefined, { kind: 'test-engine', sha256: null });
    expect(run.manifest.momentArmHistory).toMatch(/raw committed-macro samples with instantaneous modeled CG/);
    expect(run.manifest.momentArmHistory).toMatch(/Sampled only, not a continuous minimum or dynamic\/competition stability assessment/);
  });

  it('converts the same geometry margin to percent of length and retains generic thresholds', () => {
    const analysis = stabilityAnalysis();
    const stab = stabilityBreakdown(analysis, vehicle);
    expect(stab.marginPercentLength?.value).toBeCloseTo(100 * stab.margin.value * analysis.referenceDiameter / analysis.totalLength);
    expect(stab.margin.reason).toContain('excludes selected motor');
    expect(marginGate({ value: 2, unit: 'cal', confidence: 'modeled' })).toMatchObject({ status: 'pass', threshold: '1-3 cal' });
    for (const totalLength of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stabilityBreakdown(stabilityAnalysis({ totalLength }), vehicle).marginPercentLength).toBeUndefined();
    }
  });

  it('retains the native off-nominal flag instead of dropping it or inventing a value', () => {
    expect(convert(flightResult({ offNominalExcursion: true })).summary.offNominalExcursion).toBe(true);
    expect(convert(flightResult()).summary.offNominalExcursion).toBe(false);
  });

  it('describes actual irregular sample gaps without claiming a continuous peak bound', () => {
    const run = convert();
    expect(run.summary.maxQ?.value).toBe(54000);
    expect(run.sampledMaxQ).toMatchObject({ time: 3.2, sampleCount: 6, validSampleCount: 6 });
    expect(run.sampledMaxQ?.maxObservedGapS).toBeCloseTo(77.9);
    expect(run.events.find((e) => e.kind === 'max_q')).toMatchObject({ t: 3.2, derived: true });
    expect(run.manifest.sampledMaxQ).toContain('No continuous-peak');
  });

  it('withholds missing statistics and qualifies malformed telemetry as unknown', () => {
    expect(convert(flightResult({ telemetry: [] })).summary.maxQ).toBeUndefined();
    expect(convert(flightResult({ telemetry: [] })).sampledMaxQ).toBeUndefined();
    const telemetry = flightResult().telemetry.slice(0, 1);
    expect(convert(flightResult({ telemetry })).sampledMaxQ?.maxObservedGapS).toBeUndefined();
    const invalid = flightResult().telemetry;
    invalid[0] = { ...invalid[0], dynamicPressure: Number.NaN };
    const run = convert(flightResult({ telemetry: invalid }));
    expect(run.summary.maxQ).toMatchObject({ value: 54000, confidence: 'unknown' });
    expect(run.sampledMaxQ?.validSampleCount).toBe(5);
    const unordered = [...flightResult().telemetry].reverse();
    const reversed = convert(flightResult({ telemetry: unordered }));
    expect(reversed.sampledMaxQ?.maxObservedGapS).toBeUndefined();
    expect(reversed.summary.maxQ?.confidence).toBe('unknown');
  });
});
