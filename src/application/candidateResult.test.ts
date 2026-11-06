import { describe, expect, it } from 'vitest';
import {
  candidateLandingAvailability, candidateOutputDictionary, candidateResultFromReport,
  isVersionedCurves, parseCandidateResultArchive, retainedFromEngineSample,
} from './candidateResult';
import { candidateReport, candidateResult } from './candidate.fixture';
import { candidateProfileReport, profileCandidateRequest, profileSelection,
  PROFILE_DATUM, PROFILE_SOURCE_IDENTITY } from './candidate.profile.fixture';
import { buildProfileInvocation, parseCandidateInvocation, parseEnvironmentSelection } from './candidate';
import { candidateDerivation, candidateRequest, candidateSelection } from './candidate.fixture';

/** Archived context for the untagged fixture report. */
const candidateResultContext = {
  request: candidateRequest(),
  selection: candidateSelection(),
  derivation: candidateDerivation(),
};

const flags = { drogueDeployed: false, mainDeployed: false, railBound: false };

describe('candidate result archive', () => {
  it('preserves null CP/flow/landing/apogee without zero filling or a legacy PASS', () => {
    const result = candidateResult();
    expect(result.status).toBe('experimental-unqualified');
    expect(result.empiricalQualification).toBe('Unqualified');
    expect(result.dynamicQualification).toBe('Unknown');
    expect(result.query.cp).toBeNull();
    expect(result.query.flow).toBeNull();
    expect(result.query.coefficients.datum).toBeNull();
    expect(result.landing).toBeNull();
    expect(result.apogeeEvent).toBeNull();
    expect(candidateLandingAvailability(result)).toMatchObject({ available: false, reason: /time limit|requested horizon|touchdown/i });
    const outputs = candidateOutputDictionary(result);
    expect(outputs.landingSpeed.available).toBe(false);
    expect(outputs.landingSpeed.value).toBeNull();
    expect(outputs.observedPrefixMaxAltitude.observed).toBe(true);
    expect(String(outputs.observedPrefixMaxAltitude.reason)).toContain('not a predicted final apogee');
    expect(outputs.termination.value).toBe('TimeLimit');
  });

  it('rejects a landing record on a time-limit result and a bad content digest', () => {
    const landing = candidateReport();
    const trajectory = landing.trajectory as Record<string, unknown>;
    trajectory.landing = { timeS: 0.1, positionNM: [0, 0, 0], speedMps: 1, massKg: 1, eventDescription: 'touchdown' };
    expect(() => candidateResultFromReport(landing)).toThrow(/touchdown/);

    const digest = candidateReport();
    (digest.contentIdentity as Record<string, unknown>).sha256 = 'not-a-digest';
    expect(() => candidateResultFromReport(digest)).toThrow(/contentIdentity/);

    const schema = candidateReport();
    schema.schemaId = 'astraea-native-candidate-report/9.9.9';
    expect(() => candidateResultFromReport(schema)).toThrow(/schema/);
  });

  it('retains a raw engine sample that nests state and mechanics', () => {
    // The first production journey failed here: the engine's committed samples
    // nest state/mechanics, so a flat-only reader dropped every sample.
    const raw = {
      timeS: 0.2, flags, computationalStatus: 'Supported', flow: null, unavailable: [],
      state: { positionM: [0, 0, 12], velocityMps: [0, 0, 21], quaternionWxyz: [1, 0, 0, 0], omegaRadps: [0, 0, 0] },
      mechanics: { mach: 0.06, dynamicPressurePa: 250 },
    };
    expect(retainedFromEngineSample(raw, 'samples[0]'))
      .toMatchObject({ timeS: 0.2, positionM: [0, 0, 12], mach: 0.06, dynamicPressurePa: 250 });
  });

  it('requires exact archive keys and refuses a legacy output dictionary on a candidate case', () => {
    const result = candidateResult();
    expect(() => parseCandidateResultArchive({ ...result, extra: 1 })).toThrow(/must declare exactly/);
    expect(() => parseCandidateResultArchive({ ...result, flightOutputs: {} })).toThrow(/must declare exactly/);
  });
});

describe('candidate result strict schema', () => {
  it('refuses unknown or missing identity/support fields', () => {
    const extraIdentity = candidateResult();
    (extraIdentity.identities as unknown as Record<string, unknown>).targetOutcome = { target: 'apogee' };
    expect(() => parseCandidateResultArchive(extraIdentity)).toThrow(/must declare exactly/);

    const missingCaller = candidateResult();
    delete (missingCaller.identities as unknown as Record<string, unknown>).callerSourceIdentity;
    expect(() => parseCandidateResultArchive(missingCaller)).toThrow(/must declare exactly/);

    const extraPolicy = candidateResult();
    (extraPolicy.supportPolicy as unknown as Record<string, unknown>).numericalNormalization = 'unspecified';
    expect(() => parseCandidateResultArchive(extraPolicy)).toThrow(/must declare exactly/);

    const unsupportedPolicy = candidateResult();
    unsupportedPolicy.supportPolicy.machUpperExclusive = 0.9;
    expect(() => parseCandidateResultArchive(unsupportedPolicy)).toThrow(/support policy limits are unsupported/);
  });

  it('refuses sample counts, sample order, and equivalence changes', () => {
    const count = candidateResult();
    count.sampleCount = count.sampleCount + 1;
    expect(() => parseCandidateResultArchive(count)).toThrow(/disagrees with its retention declaration/);

    const mismatched = candidateResult();
    mismatched.retention!.retainedSampleCount = 1;
    expect(() => parseCandidateResultArchive(mismatched)).toThrow(/retention declaration disagrees/);

    const order = candidateResult();
    order.retainedSamples.reverse();
    expect(() => parseCandidateResultArchive(order)).toThrow(/not ordered/);

    const equivalence = candidateResult();
    delete (equivalence.equivalence as unknown as Record<string, unknown>).compared;
    expect(() => parseCandidateResultArchive(equivalence)).toThrow(/must declare exactly/);
  });

  it('keeps not-applicable curves consistent with the comparison outcome', () => {
    const na = candidateResult();
    na.curves = { status: 'notApplicable', policyId: 'candidate-curve-applicability/1.0.0',
      requestedMachs: [0.1], referenceMachAddedForEquivalence: false,
      notApplicable: { reasonId: 'no-flow-direction-at-zero-airspeed/1.0.0',
        reason: 'no flow direction', referenceTimeS: 0.1, drogueDeployed: false, mainDeployed: false,
        referenceAirspeedMps: 0, referenceMach: 0 },
      points: null };
    na.equivalence = { ...na.equivalence, curveComparison: { status: 'not-applicable', matchesReferenceSample: null,
      reasonId: 'no-flow-direction-at-zero-airspeed/1.0.0' } } as typeof na.equivalence;
    expect(parseCandidateResultArchive(na).curves).toMatchObject({ status: 'notApplicable', points: null });

    const pointsWithNa = structuredClone(na);
    pointsWithNa.curves = { ...na.curves, points: [] } as typeof na.curves;
    expect(() => parseCandidateResultArchive(pointsWithNa)).toThrow(/must carry no points|must carry points/);

    const reasonMismatch = structuredClone(na);
    (reasonMismatch.equivalence as unknown as { curveComparison: { reasonId: string } }).curveComparison.reasonId
      = 'airframe-curves-not-applicable-canopy-live/1.0.0';
    expect(() => parseCandidateResultArchive(reasonMismatch)).toThrow(/disagrees with the curve applicability outcome/);

    const comparedButNa = structuredClone(na);
    (comparedButNa.equivalence as unknown as { curveComparison: { status: string; matchesReferenceSample: boolean; reasonId: string | null } })
      .curveComparison = { status: 'compared', matchesReferenceSample: true, reasonId: null };
    expect(() => parseCandidateResultArchive(comparedButNa)).toThrow(/compared curves must be computed/);
  });

  it('still reads a legacy 1.0.0 archive without inventing a status or retention block', () => {
    const legacy = structuredClone(candidateResult()) as unknown as Record<string, unknown>;
    legacy.schemaId = 'astraea-candidate-result-archive/1.0.0';
    legacy.reportSchemaId = 'astraea-native-candidate-report/2.0.0';
    delete legacy.retention;
    const archive = legacy as unknown as Record<string, unknown>;
    archive.curves = { requestedMachs: [0.1], referenceMachAddedForEquivalence: false,
      points: (candidateResult().curves as { points: unknown }).points };
    archive.equivalence = { referenceSampleTimeS: 0.1, referenceMach: 0.1,
      queryMatchesReferenceSample: true, curveMatchesReferenceSample: false,
      compared: 'wrenches', note: 'legacy' };
    const parsed = parseCandidateResultArchive(archive);
    expect(parsed.schemaId).toBe('astraea-candidate-result-archive/1.0.0');
    expect(parsed.retention).toBeUndefined();
    expect(isVersionedCurves(parsed.curves)).toBe(false);
    expect(parsed.equivalence).toMatchObject({ curveMatchesReferenceSample: false });
    // Re-serialising the parsed archive must reproduce the legacy wire shape.
    expect(Object.keys(parsed).sort()).not.toContain('retention');
    expect(Object.keys(parsed.curves).sort()).toEqual(['points', 'referenceMachAddedForEquivalence', 'requestedMachs']);
  });

  it('refuses an archive with the wrong schema version', () => {
    const old = candidateResult();
    old.schemaId = 'astraea-candidate-result-archive/0.9.0' as typeof old.schemaId;
    expect(() => parseCandidateResultArchive(old)).toThrow(/schemaId is unsupported/);
  });
});

describe('candidate result coordinator-probe regressions', () => {
  it('rejects out-of-run apogee, negative events, unsupported curve Mach, and query drift', () => {
    const apogee = candidateResult();
    apogee.apogeeEvent = { timeS: 0.2, altitudeAglM: 10, velocityMps: 0, description: 'late' };
    expect(() => parseCandidateResultArchive(apogee)).toThrow(/apogee time is outside|apogee event.*exactly one/);

    const event = candidateResult();
    event.events[0].timeS = -1;
    expect(() => parseCandidateResultArchive(event)).toThrow(/events are not ordered/);

    const curve = candidateResult();
    curve.curves.points![0].mach = 2;
    expect(() => parseCandidateResultArchive(curve)).toThrow(/outside candidate Mach support/);

    const query = candidateResult();
    query.query.timeS = 0;
    expect(() => parseCandidateResultArchive(query)).toThrow(/not at the reference sample/);
  });

  it('rejects an unsupported environment identity, forged archive result schema, and short completion', () => {
    const environment = candidateResult();
    environment.identities.environmentModelId = 'unsupported-weather-model';
    expect(() => parseCandidateResultArchive(environment)).toThrow(/environmentModelId is unsupported/);

    const archiveSchema = candidateResult();
    (archiveSchema as unknown as Record<string, unknown>).resultSchemaId = 'astraea-bounded-candidate-result/9.9.9';
    expect(() => parseCandidateResultArchive(archiveSchema)).toThrow(/resultSchemaId is unsupported/);

    const short = candidateResult();
    short.requestedHorizonS = 3;
    expect(() => parseCandidateResultArchive(short)).toThrow(/did not reach the requested horizon/);

    const report = candidateReport();
    report.resultSchemaId = 'astraea-bounded-candidate-result/9.9.9';
    expect(() => candidateResultFromReport(report)).toThrow(/report result schema/);
  });
});

describe('candidate retained archive self-consistency', () => {
  it('rejects a retained final sample that disagrees with the final state/flags', () => {
    const position = candidateResult();
    position.retainedSamples[position.retainedSamples.length - 1].positionM[2] += 1;
    expect(() => parseCandidateResultArchive(position)).toThrow(/retained final sample disagrees/);

    const flags = candidateResult();
    flags.retainedSamples[flags.retainedSamples.length - 1].flags.drogueDeployed = true;
    expect(() => parseCandidateResultArchive(flags)).toThrow(/retained final sample disagrees/);
  });

  it('rejects a subset below the declared below-cap retention policy', () => {
    const omitted = candidateResult();
    omitted.retainedSamples.pop();
    expect(() => parseCandidateResultArchive(omitted)).toThrow(/declared retention policy/);
  });

});

describe('E1 profile invocation and archive', () => {
  const invocation = () => buildProfileInvocation(
    parseCandidateInvocation(profileCandidateRequest()) as ReturnType<typeof parseCandidateInvocation> extends infer T
      ? Extract<T, { vehicle: unknown }> : never,
    profileSelection());
  const context = () => ({
    request: invocation(),
    selection: candidateResultContext.selection,
    derivation: candidateResultContext.derivation,
  });

  it('parses the profile selection strictly and refuses the shapes the engine cannot dispatch', () => {
    const selection = profileSelection();
    expect(parseEnvironmentSelection(selection)).toMatchObject({ launchAltitudeGeometricMslM: 120, verticalDatumIdentity: PROFILE_DATUM });
    expect(() => parseEnvironmentSelection({ ...selection, extra: 1 })).toThrow(/exactly/);
    expect(() => parseEnvironmentSelection({ ...selection, launchTimeUtcUnixS: 1.5 })).toThrow(/integer epoch/);
    expect(() => parseEnvironmentSelection({ ...selection, launchAltitudeGeometricMslM: 30_000 })).toThrow(/0\.\.20000/);
    expect(() => parseEnvironmentSelection({ ...selection, profile: { ...selection.profile, extrapolationPolicy: 'clamp' } }))
      .toThrow(/extrapolationPolicy/);
    expect(() => parseEnvironmentSelection({ ...selection, profile: { ...selection.profile, knots: [] } })).toThrow(/knots/);
    expect(() => parseEnvironmentSelection({ ...selection, profile: { ...selection.profile, altitudeDatum: 'pressureAltitude' } }))
      .toThrow(/altitudeDatum/);
  });

  it('refuses an envelope whose launch altitude or wind disagrees with the selection', () => {
    const candidate = profileCandidateRequest() as Record<string, unknown>;
    const envelope = { schemaId: 'native-E1-profile-candidate-request/1.0.0', candidate, environmentSelection: profileSelection() };
    expect(parseCandidateInvocation(envelope)).toMatchObject({ schemaId: 'native-E1-profile-candidate-request/1.0.0' });

    const wrongAltitude = structuredClone(envelope);
    (wrongAltitude.candidate as Record<string, unknown>).environment = { launchAltitudeASL: 300, windSpeedSurfaceMps: 0, windAzimuthDeg: 0 };
    expect(() => parseCandidateInvocation(wrongAltitude)).toThrow(/launch altitude disagrees/);

    const windy = structuredClone(envelope);
    (windy.candidate as Record<string, unknown>).environment = { launchAltitudeASL: 120, windSpeedSurfaceMps: 3, windAzimuthDeg: 0 };
    expect(() => parseCandidateInvocation(windy)).toThrow(/zero retained surface wind/);

    const wrongSchema = structuredClone(envelope);
    wrongSchema.schemaId = 'native-E1-profile-candidate-request/9.9.9';
    expect(() => parseCandidateInvocation(wrongSchema)).toThrow(/schemaId must be/);
  });

  it('archives a profile run with its selection and profile provenance, and rejects tampering', () => {
    const archive = candidateResultFromReport(candidateProfileReport(), context());
    expect(archive.profileEnvironment).toMatchObject({
      profileSourceIdentity: PROFILE_SOURCE_IDENTITY, verticalDatumIdentity: PROFILE_DATUM,
      launchAltitudeGeometricMslM: 120, queryObservationExact: true, curveSourceShared: true,
    });
    expect(archive.identities.compositionId).toBe('candidate-static-rate-profile-composition/1.0.0');
    expect(archive.identities.environmentModelId).toBe('explicit-E1-profile-candidate-environment/1.0.0');
    expect(archive.model.environment).toMatchObject({ launchAltitudeASL: 120, windSpeedSurfaceMps: 0, environmentSourceId: PROFILE_SOURCE_IDENTITY });
    // The archived curve points drop the per-point observation; provenance is run-level.
    expect(Object.keys((archive.curves.points ?? [])[0] ?? {})).not.toContain('profileEnvironment');

    // Round trip: re-parsing the archive against the same invocation succeeds.
    expect(parseCandidateResultArchive(archive, context()).profileEnvironment?.profileSourceIdentity).toBe(PROFILE_SOURCE_IDENTITY);

    // A profile archive cannot be paired with the untagged invocation.
    expect(() => parseCandidateResultArchive(archive, { ...context(), request: candidateResultContext.request }))
      .toThrow(/composition disagrees/);

    // Nor may a profile run claim the retained-atmosphere composition.
    const wrongComposition = structuredClone(archive);
    (wrongComposition.identities as Record<string, unknown>).compositionId = 'candidate-static-rate-composition/1.0.0';
    expect(() => parseCandidateResultArchive(wrongComposition, context())).toThrow(/compositionId disagrees|environmentModelId is unsupported/);

    // A plain 3.0.0 report cannot be archived against a profile invocation.
    expect(() => candidateResultFromReport(candidateReport(), context())).toThrow(/profile candidate report schema/);
  });

  it('keeps the untagged path unchanged when no profile is selected', () => {
    const archive = candidateResultFromReport(candidateReport(), candidateResultContext);
    expect(archive.profileEnvironment).toBeUndefined();
    expect(archive.identities.compositionId).toBe('candidate-static-rate-composition/1.0.0');
  });
});
