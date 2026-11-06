/**
 * Profile-envelope fixture, modelled on the real 3.0.0 profile report captured
 * from the shipped engine (see the lane evidence). It is small on purpose: the
 * 1 MB real report is verified by an uncommitted probe, not committed. The
 * fields that matter to the parser — schema ids, composition/environment
 * identities, the environment block, per-sample profile observation, the three
 * profile equivalence notes and the retention block — match the engine.
 */
import type { EnvironmentSelection } from './candidate';
import { candidateReport, candidateRequest } from './candidate.fixture';

export const CANDIDATE_PROFILE_COMPOSITION = 'candidate-static-rate-profile-composition/1.0.0';
export const CANDIDATE_PROFILE_ENVIRONMENT_MODEL = 'explicit-E1-profile-candidate-environment/1.0.0';
export const PROFILE_SOURCE_IDENTITY = 'fixture-profile-wind-v1';
export const PROFILE_DATUM = 'fixture-MSL-no-geoid-model';

export function profileSelection(): EnvironmentSelection {
  return {
    launchTimeUtcUnixS: 1792965600,
    launchAltitudeGeometricMslM: 120,
    verticalDatumIdentity: PROFILE_DATUM,
    profile: {
      altitudeDatum: 'geometricMsl',
      closureId: 'dry-ideal-air-sutherland/1.0.0',
      extrapolationPolicy: 'reject',
      interpolationPolicy: 'logPressureLinearTemperatureWind',
      issueTimeUtcUnixS: 1792965600,
      knots: [
        { altitudeM: 0, pressurePa: 101325, temperatureK: 288.15, windTowardEnuMps: { east: 0, north: 0, up: 0 } },
        { altitudeM: 500, pressurePa: 95460, temperatureK: 284.9, windTowardEnuMps: { east: 4, north: 0, up: 0 } },
      ],
      location: { horizontalDatumIdentity: 'fixture', identity: 'fixture-site', latitudeDeg: 42, longitudeDeg: -75 },
      source: { description: 'fixture profile; not measured', evidenceClass: 'synthetic', identity: PROFILE_SOURCE_IDENTITY },
      units: { altitude: 'm', pressure: 'Pa', temperature: 'K', time: 'UTC Unix seconds', wind: 'm/s' },
      validity: { fromUtcUnixS: 1792962000, untilUtcUnixS: 1793000000 },
      verticalDatumIdentity: PROFILE_DATUM,
    },
  };
}

/** The untagged request adjusted to the profile's declared environment. */
export function profileCandidateRequest(): Record<string, unknown> {
  const selection = profileSelection();
  return {
    ...(candidateRequest() as unknown as Record<string, unknown>),
    environmentSourceId: PROFILE_SOURCE_IDENTITY,
    environment: {
      launchAltitudeASL: selection.launchAltitudeGeometricMslM,
      windSpeedSurfaceMps: 0,
      windAzimuthDeg: 0,
    },
  };
}

function profileObservation(): Record<string, unknown> {
  return {
    environmentModelId: CANDIDATE_PROFILE_ENVIRONMENT_MODEL,
    timePolicyId: 'integer-epoch-plus-fractional-elapsed/1.0.0',
    profileSourceIdentity: PROFILE_SOURCE_IDENTITY,
    verticalDatumIdentity: PROFILE_DATUM,
    altitudeGeometricMslM: 120,
    launchTimeUtcUnixS: 1792965600,
    elapsedS: 0.1,
    sampledFloorEpochS: 1792965600,
    fractionalSecond: 0.1,
    pressurePa: 101000,
    temperatureK: 288,
    densityKgM3: 1.21,
    soundSpeedMps: 340,
    dynamicViscosityPaS: 1.8e-5,
    windTowardEnuMps: [3, 0, 0],
    airRelativeVelocityEnuMps: [0, 0, 20],
    airspeedMps: 20,
    mach: 0.0588,
    dynamicPressurePa: 242,
    reynoldsPerM: 1.3e6,
  };
}

/** A 3.0.0 profile report: the untagged report with the profile deltas applied. */
export function candidateProfileReport(): Record<string, unknown> {
  const base = candidateReport();
  const observation = profileObservation();
  const trajectory = base.trajectory as Record<string, unknown>;
  const query = base.query as Record<string, unknown>;
  const curves = base.curves as Record<string, unknown>;
  return {
    ...base,
    schemaId: 'astraea-native-profile-candidate-report/3.0.0',
    compositionId: CANDIDATE_PROFILE_COMPOSITION,
    identities: {
      ...(base.identities as Record<string, unknown>),
      compositionId: CANDIDATE_PROFILE_COMPOSITION,
      environmentModelId: CANDIDATE_PROFILE_ENVIRONMENT_MODEL,
      environmentSourceId: PROFILE_SOURCE_IDENTITY,
    },
    environment: {
      axialSourceNote: 'prescribed CA0 only',
      environmentModelId: CANDIDATE_PROFILE_ENVIRONMENT_MODEL,
      launchAltitudeGeometricMslM: 120,
      launchTimeUtcUnixS: 1792965600,
      profileSourceIdentity: PROFILE_SOURCE_IDENTITY,
      verticalDatumIdentity: PROFILE_DATUM,
    },
    equivalence: {
      ...(base.equivalence as Record<string, unknown>),
      profileCurveRoundoffNote: 'fixture: profile curve reconstruction note',
      profileObservationQueryExact: true,
      profileSourceSharedByCurve: true,
    },
    trajectory: {
      ...trajectory,
      identities: {
        ...(trajectory.identities as Record<string, unknown>),
        compositionId: CANDIDATE_PROFILE_COMPOSITION,
        environmentModelId: CANDIDATE_PROFILE_ENVIRONMENT_MODEL,
        environmentSourceId: PROFILE_SOURCE_IDENTITY,
      },
      samples: (trajectory.samples as Array<Record<string, unknown>>)
        .map((sample) => ({ ...sample, profileEnvironment: observation })),
    },
    query: {
      ...query,
      sample: { ...(query.sample as Record<string, unknown>), profileEnvironment: observation },
    },
    curves: {
      ...curves,
      points: (curves.points as Array<Record<string, unknown>>)
        .map((point) => ({ ...point, profileEnvironment: observation })),
    },
  };
}
