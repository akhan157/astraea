# RMP07 candidate application and persistence — gate-1 proposal

Status: **read-only proposal.** No production edit, commit, dependency install, build,
test, formatter or browser run was executed for this document. The lane worktree is
clean apart from the untracked `docs/internal/execution-runs/RMP07-candidate-app/`
record directory, which contains this file and the coordinator's `ASSIGNMENT.md`.
The author cannot accept this proposal or the later implementation.

## Implementation outcome (post-approval correction)

The approved implementation was subsequently returned by independent review for
F1–F5 corrections. The current source adds stricter candidate archive
relationships and archived-request linkage; claims admission before the first
await with token/epoch guards; guards secondary consumers by selected and
recorded model; captures detached frozen inputs; and uses one exact canonical
invocation comparison for freshness. Project schema is the approved `1.12.0` with
identity-only `1.11.0 -> 1.12.0` migration; candidate fields are accepted at
1.12. The supplement returned the intermediate unapproved 1.13 bump; the
current source is back on 1.12 and historical 1.13 receipts remain external.
The actual correction checks, bytes and durable receipts are in `RESULT.md`
and `EVIDENCE.json`; the candidate archive/result schema IDs and bounded
unsupported-consumer matrix below remain the approved contract. This section
supersedes the gate-only status; the original proposal history is retained.
## 0. State and routing confirmation

| Item | Observed |
| --- | --- |
| cwd | this lane worktree (`.paseo` lane `rmp07-candidate-app`; `git rev-parse --show-toplevel` is the worktree root) |
| branch | `rmp07-candidate-app` |
| HEAD | `101e9e7afd4de70a75f3397738a6ace868acec0d` |
| HEAD subject | `merge(rmp12): accept actual-byte artifact identity disposition` (2026-10-28 22:43:06 -0400) |
| activation pin | `101e9e7afd4de70a75f3397738a6ace868acec0d` — **exact match** |
| worktree state | only `?? docs/internal/execution-runs/RMP07-candidate-app/`; no tracked modification |
| prepared base | `06952252ce937bdaabddbcc528ede8f3c6c427fd`; HEAD adds the accepted candidate runtime merge, the RMP12 disposition and their docs/checkers, with no application schema/UI change |

Routing evidence (read-only, no inference call made for discovery):

- lane session metadata records `model: deepseek/deepseek-flash`,
  `resolvedModelIsFallback: false`, and `thinkingLevel: max`;
- `omp models deepseek --json` resolves `deepseek/deepseek-flash` to catalog name
  **DeepSeek V4.1 Flash 1017**, `thinking: ["low","high","max"]`, provider
  `deepseek` (direct), no proxy fallback;
- no fallback request was made in this gate.

Host/toolchain read for the later build plan: 8.0 GiB available (`free -h`),
`rustc 1.99.1 (58cf8f9c3 2026-10-13)`, `cargo 1.99.1`, Node `v26.11.1`,
pnpm `12.14.0`. Build/browser work will re-check memory and stop below 2 GiB.

Records read: this lane ASSIGNMENT; `execution-package/{CONTROL-LOOP,DECISIONS,
INTERFACES,CHECKS,packets/RMP07.md}`; `session-handoff/coordination/TASKS.md`;
`RMP07-candidate-runtime/{REVIEW,RESULT,EVIDENCE,COORDINATOR-EVIDENCE}`;
`RMP12-runtime-artifacts/{PROPOSAL,RESULT,REVIEW}`; `RMP07-content-identity`,
`RMP07-project-identity` and `RMP10-qualified-output-archive` check dispositions
through the acceptance register; the relevant application/schema/engine sources
listed in §7. Historical provider/effort records were not rewritten.

## 1. Bounded goal and non-goals

Goal: one complete, explicit, opt-in journey:

> select the experimental candidate provider -> execute one actual supported
> candidate run on the accepted runtime -> present that run's supported query and
> static curves plus its honest statuses/absences -> save, undo/redo, reopen/import
> and load the archived inputs -> run again from the reopened inputs.

The increment stops at the coordinator gate before any schema or UI edit.

Non-goals and retained refusals: no default/provider switch, no candidate profile or
E1 dispatch, no candidate ensemble, no local inherited axial source, no new
calibration or transfer of an old fit, no empirical/numerical qualification, no
Rust runtime or build-script edit, no build receipt reuse, no acceptance-register or
package-manifest edit, no release/push/main merge/data access.

## 2. Accepted runtime contract consumed as-is

The app consumes exactly the merged `simulate_candidate` command. No engine module,
support rule, schema, and no `scripts/build-engine.mjs` change is requested.

- Dispatch: `engineInvokeRecorded('simulate_candidate', { request }, { lane:
  'interactive', signal })`. The wrapper key is `request`; the request root must not
  contain `schemaId` or `diagnosticNumerics` (the runtime refuses both, and refuses
  explicit `null` controls before typed parsing).
- Request: `NativeCandidateRequest` (`deny_unknown_fields` at its root and nested
  request structs). `vehicle`/`motor` are the existing DTO shapes (unknown fields are
  ignored by those two structs).
- Report: `astraea-native-candidate-report/2.0.0`; result
  `astraea-bounded-candidate-result/1.0.0`; status `experimental-unqualified`;
  `empiricalQualification: Unqualified`; `dynamicQualification: Unknown`;
  termination `TimeLimit`/`Touchdown`; landing only after an actual touchdown;
  apogee event only when qualified; observed-prefix peaks explicitly observed;
  `unavailable[]` reasons; `query.origin` `last-committed-sample` when no query is
  supplied; `curves.points` for the requested Machs plus the reference Mach when
  absent; `equivalence.queryMatchesReferenceSample` /
  `equivalence.curveMatchesReferenceSample`.
- Identities in the report (bound into the engine content identity):

| Field | Accepted ID |
| --- | --- |
| composition | `candidate-static-rate-composition/1.0.0` |
| static provider | `static-body-total-SB1/1.0.0` |
| rate model | `legacy-dimensional-rate-couple/1.0.0` |
| environment | `legacy-isa1976-powerlaw-wind/1.0.0` |
| mechanical | `legacy-primitive-mass-inertia/1.0.0` |
| support policy | `sb1-candidate-support/1.0.0` |
| calibration policy | `no-historical-calibration/1.0.0` |
| canopy | `declared-constant-canopy-drag/1.0.0` |
| adapter | `frontend-external-profile-SB1/1.0.0` |
| identity scheme/encoding | `native-candidate-input-model-sha256/1.0.0` / `astraea-typed-json-bits/1.0.0` |
| inherited numerical policy | `inherited-candidate-driver-numerics/2.0.0` |

Support limits visible to the UI: forward flow, `0 <= M < 0.8`, incidence `<= 5 deg`,
near-unit attitude `| |q|-1 | <= 1e-6`, retained ISA-1976 at instantaneous
`0..20 km ASL`, canopy drag `M <= 1.0`, exactly-zero cant, omitted/1.0 drag scale,
one prepared object for trajectory/query/curves, and no post-stop evaluation.

The app must treat the report's `contentIdentity` as an **input/model digest** and
the recorded `EngineIdentity` as the **executed WASM bytes**. Neither substitutes for
the other. The report's `contentIdentity.runtimeIdentity` is `null`; the app must not
promote it.

## 3. Proposed application contract

Names below are proposals until the coordinator accepts them.

### 3.1 `flightModel` becomes an explicit union

`src/application/flightModel.ts` keeps the exact legacy descriptor and adds an exact
candidate descriptor. Absent remains legacy. Unknown/newer selections fail closed.

```ts
export type FlightModelSelection =
  | LegacyFlightModelSelection
  | CandidateFlightModelSelection;

export const LEGACY_FLIGHT_MODEL = Object.freeze({
  schemaId: 'astraea-flight-model-selection/1.0.0',
  modelId: 'flight-signed-normal-plus-wind-drag-v1',
  environmentId: 'legacy-isa1976-powerlaw-wind/1.0.0',
  mechanicalModelId: 'legacy-primitive-mass-inertia/1.0.0',
  calibrationPolicyId: 'legacy-global-airframe-cd-scale/1.0.0',
} as const);

export const CANDIDATE_FLIGHT_MODEL = Object.freeze({
  schemaId: 'astraea-flight-model-selection/2.0.0',
  modelId: 'native-candidate-static-rate/1.0.0',
  compositionId: 'candidate-static-rate-composition/1.0.0',
  staticProviderId: 'static-body-total-SB1/1.0.0',
  rateModelId: 'legacy-dimensional-rate-couple/1.0.0',
  environmentId: 'legacy-isa1976-powerlaw-wind/1.0.0',
  mechanicalModelId: 'legacy-primitive-mass-inertia/1.0.0',
  calibrationPolicyId: 'no-historical-calibration/1.0.0',
  adapterId: 'frontend-external-profile-SB1/1.0.0',
  projectionId: 'candidate-app-frontend-dto-projection/1.0.0',
} as const);

export interface CandidateFlightModelSelection {
  readonly schemaId: 'astraea-flight-model-selection/2.0.0';
  readonly modelId: 'native-candidate-static-rate/1.0.0';
  readonly compositionId: string;      // exact engine ID above
  readonly staticProviderId: string;
  readonly rateModelId: string;
  readonly environmentId: string;
  readonly mechanicalModelId: string;
  readonly calibrationPolicyId: string;
  readonly adapterId: string;
  readonly projectionId: string;
  readonly axial: {
    readonly ca0: number;              // finite, >= 0; explicit zero is valid
    readonly providerId: string;       // nonempty caller source label
    readonly inputIdentity: string;    // nonempty source + power-condition declaration
  };
  readonly declarations: {
    readonly provenance: string;       // nonempty; states no measurement implied
    readonly sharpPhysicalTip: true;
    readonly circularAxisymmetricBody: true;
    readonly smoothSlenderProfile: true;
    readonly identicalEquallySpacedThinUncantedFins: true;
    readonly noOtherExternalFeaturesOrUnmodeledInterferences: true;
    readonly sourceRepresentsCompleteExternalGeometry: true;
  };
  readonly ogiveInterpretation: 'tangentOgive' | null;
  readonly transitionInterpretation: 'conical' | null;
  readonly quadrature: {
    readonly absoluteToleranceM3: number;
    readonly relativeTolerance: number;
    readonly maxPanels: number;
  };
  /** SHA-256 of the candidate DTO projection of the vehicle at acknowledgment. */
  readonly declarationVehicleSha256: string;
  readonly declaredAt: string;         // ISO-8601
  readonly horizonSeconds: number;     // finite > 0
  readonly timeStepS: number;          // finite > 0
  readonly curveMachs: number[];       // sorted unique, 1..64, each 0 <= M < 0.8
}
```

`parseFlightModel` accepts only the exact legacy object or the exact candidate key
set/values (all declaration literals `true`, all IDs exact, finite numbers, nonempty
text, hex SHA-256, ISO timestamp). It returns a frozen accepted descriptor.
`parseLegacyFlightModel` and `parseCandidateFlightModel` are the archive-specific
entry points (see §3.4). `resolveFlightModel(undefined)` returns the legacy
descriptor; it never converts an unknown value.

`dragCalibration` binding comparison already compares schema/model/environment/
mechanical/calibration IDs; a legacy fit is therefore `incompatible` under the
candidate selection, is retained as history, and never reaches a candidate request.
`buildDragCalibration` will additionally refuse to create a fit while the candidate
model is selected.

### 3.2 Project schema 1.12.0

`PROJECT_SCHEMA_VERSION` becomes `1.12.0`. Add `PROJECT_SCHEMA_V1_11_0 = '1.11.0'`
and an identity-only migration `1.11.0 -> 1.12.0` (adds no field, rewrites no case).
Fix `migrateV1_10_0ToV1_11_0` to write the explicit `1.11.0` constant instead of the
current version, then add the next step.

Version gates must be widened, not merely bumped:

- `momentHistoryVersions`: add `1.11.0`, `1.12.0`.
- `eventVersions`: add `1.11.0`, `1.12.0`.
- `telemetryVersions`: add `1.11.0`, `1.12.0`.
- `flightOutputs`: allowed in `1.11.0` **and** `1.12.0` (a 1.11 document containing
  the accepted canonical dictionary must not be rejected during migration).
- Candidate selection / candidate cases / candidate results: allowed only in
  `1.12.0`; a 1.11 (or older) document declaring any of them fails before migration.

Old/no-provider projects keep `flightModel` absent and every legacy case byte-for-
byte. No candidate field or result is backfilled into an old case.

### 3.3 Candidate run inputs, archive version 3

A candidate case is a flight case with `inputs.version === 3`. Legacy archive v1/v2
validation is unchanged; v2 remains legacy-model-only.

```ts
export interface CandidateRunInputs {
  readonly version: 3;
  readonly flightModel: CandidateFlightModelSelection;
  readonly capturedAt: string;
  /** FNV-1a freshness key over the sync dispatch inputs; not a digest. */
  readonly inputKey: string;
  readonly vehicle: RocketVehicle;                 // project vehicle, unmodified
  readonly motorRecord: MotorRecord;               // content-pinned record
  readonly launch: LaunchOptions;                  // workspace launch values
  readonly candidateRequest: NativeCandidateRequest; // exact dispatched request
  readonly derivation: {
    readonly projectionId: string;
    readonly source: 'aggregate_mass';
    readonly mountComponentId: string | null;      // null = documented aft fallback
    readonly mountStartM: number | null;
    readonly mountLengthM: number | null;
    readonly totalLengthM: number;
    readonly motorAftStationFromNoseM: number;
  };
  readonly context: {
    readonly workspace: Workspace;
    readonly mission: Mission;
    readonly weather: ProjectSnapshot[];
  };
  readonly weatherModel: 'surface-power-law-only';
}
```

v3 deliberately has no `engineOptions`, `dragCalibration`, `finShearModulusPa`,
`ensemble`, `reportMomentArmHistory`; those fields fail v3 validation. The request is
the single dispatch authority; the legacy `engineOptions` projection is not duplicated.

Validation of a v3 case:

- `candidateRequest` re-projected from `vehicle`/`motorRecord`/`launch`/selection
  must equal the archived request for every derivable field; the exact request has no
  `schemaId`, `diagnosticNumerics`, `dragCdScale` other than `null`, or
  `finCantAngleDeg` other than `null`.
- `motorAftStationFromNoseM === derivation.motorAftStationFromNoseM`; the mount ID,
  when present, exists in `vehicle` and is a `bodytube` with `isMotorMount === true`;
  `mountStartM + mountLengthM === station` for a mount; `station === totalLengthM`
  for the aft fallback. The derivation values are archived, not recomputed on open.
- Environment equals `launchAltitudeASL = vehicle.launchSite?.altitudeM ?? 0` and the
  workspace surface wind; launch values equal the archived `launch`; horizon, step and
  curve Machs equal the selection.
- `axial`, `declarations`, `quadrature`, interpretations and adapter IDs equal the
  selection; `internalNonGeometryIds` equals exactly the projected
  `masscomponent`/`parachute` component IDs (no duplicates, no absent IDs).
- The case summary's `inputKey` equals `inputs.inputKey`; the case summary declares
  `archiveForm: 'candidate'` and `modelId: 'native-candidate-static-rate/1.0.0'`.
- `engineIdentity` is required; `candidateResult` is required and only on a flight
  case. Legacy `flightOutputs`, `telemetry`, `events`, `momentArmHistory` are refused
  on a candidate case.
- An archived candidate case is validated against its own archived selection/request,
  never against the live `project.flightModel`. The user may switch back to legacy or
  edit the design; the historical case remains readable and its result is not
  reinterpreted or marked current.

### 3.4 Candidate result archive

A separate strict, versioned dictionary. The legacy canonical output dictionary is
**not** reused: its IDs/units/landing-energy/gate claims are legacy-specific and
would mislabel candidate observations.

```ts
export type CandidateWrench = {
  cfBody: [number, number, number];
  cmBody: [number, number, number];
};
export type CandidateWind = { cdWind: number; clWind: number; cyWind: number };
export type CandidateNormalDerivatives = {
  cPerRad: number;
  jMPerRad: number;
  sumAbsCPerRad: number;
  sumAbsJMPerRad: number;
};
export type CandidateCp = {
  stationFromNoseM: number;
  kappaC: number;
  reason?: string;
};
export type CandidateNegligibility = {
  policyId: string;
  relativeBound: number;
  maxPossibleForceN: number;
  weightN: number;
  isNegligible: boolean;
};
export type CandidateUnavailable = { quantity: string; reason: string };

export interface CandidateResultArchive {
  readonly schemaId: 'astraea-candidate-result-archive/1.0.0';
  readonly reportSchemaId: 'astraea-native-candidate-report/2.0.0';
  readonly resultSchemaId: 'astraea-bounded-candidate-result/1.0.0';
  readonly compositionId: 'candidate-static-rate-composition/1.0.0';
  readonly status: 'experimental-unqualified';
  readonly termination: 'TimeLimit' | 'Touchdown';
  readonly computationalCompletion:
    | 'CompletedRequestedHorizon'
    | 'CompletedTouchdown';
  readonly empiricalQualification: 'Unqualified';
  readonly dynamicQualification: 'Unknown';
  readonly requestedHorizonS: number;
  readonly finalTimeS: number;
  readonly finalState: {
    positionM: [number, number, number];
    velocityMps: [number, number, number];
    quaternionWxyz: [number, number, number, number];
    omegaRadps: [number, number, number];
  };
  readonly finalFlags: {
    drogueDeployed: boolean;
    mainDeployed: boolean;
    railBound: boolean;
  };
  readonly landing?: {
    timeS: number;
    positionNM: [number, number, number];
    speedMps: number;
    massKg: number;
    eventDescription: string;
  };
  readonly apogeeEvent?: {
    timeS: number;
    altitudeAglM: number;
    velocityMps: number;
    description: string;
  };
  readonly observedPrefix: {
    samplingPolicyId: string;
    sampleCount: number;
    maxAltitudeAglM: number;
    maxAltitudeTimeS: number;
    maxAirspeedMps: number;
    maxAirspeedTimeS: number;
    maxDynamicPressurePa: number;
    maxDynamicPressureTimeS: number;
    note: string;
  };
  readonly events: Array<{
    timeS: number;
    name: string;
    altitudeAglM: number;
    velocityMps: number;
    description: string;
  }>;
  readonly query: {
    origin: 'last-committed-sample';
    timeS: number;
    flags: { drogueDeployed: boolean; mainDeployed: boolean; railBound: boolean };
    /** Engine enum spelling, e.g. AirframeStaticRateComposition. */
    applicability: string;
    /** Supported | ZeroSpeedStaticLoadsOnly | StaticLoadsBelowAeroNegligibility. */
    computationalStatus: string;
    state: {
      positionM: [number, number, number];
      velocityMps: [number, number, number];
      quaternionWxyz: [number, number, number, number];
      omegaRadps: [number, number, number];
    };
    mechanics: {
      massKg: number;
      cgFromNoseM: number;
      densityKgM3: number;
      speedOfSoundMps: number;
      airspeedMps: number;
      mach: number;
      dynamicPressurePa: number;
      thrustN: number;
      windNMps: [number, number, number];
      referenceAreaM2: number;
      referenceLengthM: number;
    };
    flow?: { alphaDeg: number; betaDeg: number; incidenceDeg: number };
    coefficients: { datum?: CandidateWrench; cg?: CandidateWrench };
    windCoefficients?: CandidateWind;
    normalDerivatives?: CandidateNormalDerivatives;
    cp?: CandidateCp;
    staticForceBodyN: [number, number, number];
    staticMomentCgBodyNm: [number, number, number];
    rateMomentBodyNm: [number, number, number];
    canopyDragBodyN?: [number, number, number];
    aeroForceBodyN: [number, number, number];
    aeroMomentCgBodyNm: [number, number, number];
    dragAlongWindN: number;
    aeroNegligibility: CandidateNegligibility;
    unavailable: CandidateUnavailable[];
  };
  readonly curves: {
    requestedMachs: number[];
    referenceMachAddedForEquivalence: boolean;
    points: Array<{
      mach: number;
      computationalStatus: string;
      dynamicPressurePa: number;
      flow?: { alphaDeg: number; betaDeg: number; incidenceDeg: number };
      coefficients: { datum?: CandidateWrench; cg?: CandidateWrench };
      windCoefficients?: CandidateWind;
      normalDerivatives?: CandidateNormalDerivatives;
      cp?: CandidateCp;
      staticForceBodyN: [number, number, number];
      staticMomentCgBodyNm: [number, number, number];
      aeroNegligibility: CandidateNegligibility;
      unavailable: CandidateUnavailable[];
    }>;
  };
  readonly equivalence: {
    referenceSampleTimeS: number;
    referenceMach: number;
    queryMatchesReferenceSample: boolean;
    curveMatchesReferenceSample: boolean;
    compared: string;
    note: string;
  };
  readonly model: {
    geometry: {
      identity: string;
      areaM2: number;
      lengthM: number;
      diameterM: number;
      bodyLengthM: number;
    };
    mechanical: {
      dryMassKg: number;
      cgFromNoseM: number;
      totalLengthM: number;
      referenceDiameterM: number;
      motorAftStationFromNoseM: number;
      motorDesignation: string;
      drogue: { diameterM: number; cd: number } | null;
      main: { diameterM: number; cd: number } | null;
    };
    environment: {
      launchAltitudeASL: number;
      windSpeedSurfaceMps: number;
      windAzimuthDeg: number;
      environmentSourceId: string;
    };
  };
  readonly identities: {
    compositionId: string;
    staticProviderId: string;
    rateModelId: string;
    environmentModelId: string;
    mechanicalModelId: string;
    supportPolicyId: string;
    calibrationPolicyId: string;
    canopyModelId: string;
    adapterId: string;
    callerSourceIdentity: string;
    geometryIdentity: string;
    axialProviderId: string;
    axialInputIdentity: string;
    mechanicalSourceId: string;
    environmentSourceId: string;
  };
  readonly supportPolicy: {
    machUpperExclusive: number;
    maxIncidenceDeg: number;
    notes: string[];
  };
  readonly limitations: string[];
  readonly sampleCount: number;
  readonly retainedSamples: Array<{
    timeS: number;
    positionM: [number, number, number];
    velocityMps: [number, number, number];
    flags: { drogueDeployed: boolean; mainDeployed: boolean; railBound: boolean };
    computationalStatus: string;
    mach: number;
    dynamicPressurePa: number;
    flow?: { alphaDeg: number; betaDeg: number; incidenceDeg: number };
    unavailable: Array<{ quantity: string; reason: string }>;
  }>;
  readonly sampleArchivePolicyId: 'candidate-archive-display-samples/1.0.0';
  readonly contentIdentity: {
    schemeId: 'native-candidate-input-model-sha256/1.0.0';
    encodingId: 'astraea-typed-json-bits/1.0.0';
    sha256: string; // 64 lowercase hex; the engine-reported input/model digest
  };
}
```

Archive retention: all requested curve points and all events are retained; committed
trajectory samples are reduced to at most `MAX_SAVED_TELEMETRY_POINTS` (5000) by
`candidate-archive-display-samples/1.0.0` (first, last and event-adjacent samples,
then evenly spaced indices; original order, de-duplicated). Top-level `sampleCount`
is the committed `trajectory.samples.length`; `observedPrefix.sampleCount` is kept
separately inside the observed-prefix object. `sampleCount` and
`retainedSamples.length` are both stored; the UI states "retained X of Y committed
samples; a display subset, not the complete trajectory, no interpolation". The exact
request is the authority for reproduction; the engine `contentIdentity.envelope` and
`canonicalPreimage` are not duplicated into the archive (the engine recomputes them
from the stored request on an explicit run). Per-sample `identities` are omitted from
the query sample (the top-level identities are archived); `profileEnvironment` is
never present because no profile is dispatched. The `model` block is copied verbatim
from the report's `geometry`/`mechanical`/`environment` sections; the adapter
component-role table and `supportLimits` strings are not duplicated (the exact request
and prepared-model identities are retained, and the engine recomputes roles from the
request).

Strict parser rules: exact key sets, finite numbers, integer counts, 64-hex digest,
exact IDs, `landing` present iff `termination === 'Touchdown'` and
`landing.timeS === finalTimeS`, `apogeeEvent` optional but never synthesized from the
prefix, event times nondecreasing within `[0, finalTimeS]`, query origin exactly
`last-committed-sample`, query keys exactly the engine `sample_json` set minus
`identities`/`profileEnvironment`, curve point count equal to requested Machs plus the
reference when added, each curve Mach in `[0, 0.8)`, retained sample times
nondecreasing within `[0, finalTimeS]`, `retainedSamples.length <= sampleCount`, and
no unknown report schema. Missing/non-finite/`null`-for-absent values fail; nothing is
zero-filled, reconstructed or converted from legacy fields.

The session payload is a discriminated union, not a fake legacy `FlightRun`:

```ts
type FlightPayload =
  | { model: 'legacy'; design: Design; run: FlightRun; previous: FlightRun | null }
  | {
      model: 'candidate';
      design: Design;
      result: CandidateResultView;   // parsed report/archive view
      request: NativeCandidateRequest;
      engineIdentity: EngineIdentity;
      previous: null;                // no candidate/cross-model result deltas are supported
    };
```

`CommittedRun` exposes `run?: FlightRun` and `candidate?: CandidateResultView`.
Every legacy consumer requires `run`; when only `candidate` is present it renders the
explicit refusal/notice rather than reading a missing legacy summary. The candidate
view is the same object used to build the archive, so the Flight UI, Saved Runs and
the saved case do not parse the report three different ways.

### 3.5 Keys and identity separation

- `inputKey` (candidate): FNV-1a 32-bit over
  `{flightModel, vehicleProjection, motorContent, launch, environment,
  horizonSeconds, timeStepS, curveMachs}`. It is a session freshness key, explicitly
  labeled “not a digest”; exact freshness further compares the canonical request
  strings.
- `declarationVehicleSha256`: SHA-256 over the candidate DTO projection of the
  vehicle at acknowledgment. It binds the user's physical declarations and CA0 to
  that design; any physical geometry/material/offset/override change changes the
  digest and **blocks candidate dispatch until the user re-acknowledges**. It is a
  design-document hash, not a computed geometry hash or engineering identity.
- `contentIdentity.sha256`: engine-reported typed-input/model digest. Stored as
  recorded; the app never recomputes or edits it. Re-running the same stored request
  on the same engine is expected to reproduce it and is the planned verify probe.
- `engineIdentity`: exact executed WASM identity captured by
  `engineInvokeRecorded` from the actual invocation. Old receipts are never transferred
  across a new build root; a new build gets a new receipt.
- No source label, model name or FNV key is presented as a cryptographic identity.

### 3.6 Candidate DTO projection (approval requested)

`candidate-app-frontend-dto-projection/1.0.0` maps the project vehicle to the engine
DTO by retaining exactly the fields the engine consumes: `id`, `name`, `type`,
`materialId`, geometry/shape fields, `axialOffset`, parachute `diameter`/`cd`/`mass`,
`massOverride`, `cgOverride`. It deliberately drops UI-only fields (`color`,
`comment`) and the internal binding fields (`isMotorMount`, `assignedMotorId`).

Why the drop is required: `sb1_geometry::adapt_frontend_vehicle` refuses any component
with `isMotorMount === true` as “motor-mount internal/external topology ambiguous”.
Keeping the flag makes every real rocket unusable; silently ignoring it in the engine
is not available (runtime read-only). The projection is therefore an explicit caller
declaration that the external profile, not the internal mount topology, is the SB1
source, covered by the user's `noOtherExternalFeaturesOrUnmodeledInterferences` and
`sourceRepresentsCompleteExternalGeometry` acknowledgments. The projection ID, the
original vehicle, the projected request and the derivation are all archived. The
alternative (refuse every vehicle with a flagged mount) is rejected as making the
increment unusable; adding an engine option is out of this lane's lease.

Motor projection uses exactly the `FrontendMotor` fields (`designation` optional,
diameter, length, burnTime, propellantMass, totalMass, dryMass, maxThrust,
thrustCurve); catalog/UI fields (`id`, manufacturer, impulseClass, avgThrust) are not
sent. The same builder is used by the browser path, Node tests and archive validation;
there is no second request mapping.

### 3.7 Exact request construction

At dispatch, after sync preflight and keying:

1. `aggregateMassOf(project.vehicle)` from the real engine (allowed; not a flight
   model) supplies the mount record. Derive
   `motorAftStationFromNoseM = mount.axialStart + mount.length` for exactly one
   flagged mount, else `totalLength` for the documented aft fallback. Record the
   derivation. This matches the accepted legacy resolver rule; the Estes Alpha fixture
   check is `0.476 m`.
2. Build the projected vehicle and motor; build `adapter` with
   `sourceIdentity = 'astraea-project-vehicle|design-sha256:<declarationVehicleSha256>'`,
   the six acknowledged declarations and provenance, explicit interpretations,
   `aftTermination = 'flatExposedBaseAtFinalStation'`, internal non-geometry IDs from
   the projection, and the recorded quadrature.
3. `mechanicalSourceId = 'astraea-project-mass-rollup|legacy-primitive-mass-inertia/1.0.0'`;
   `environmentSourceId = 'astraea-project-site|legacy-isa1976-powerlaw-wind/1.0.0'`.
4. `axial` from the selection; `environment.launchAltitudeASL` from the vehicle site;
   surface wind from the workspace launch; `launch` from the workspace with
   `dragCdScale: null`, `finCantAngleDeg: null`; `horizonSeconds`, `timeStepS`,
   `curveMachs` from the selection; `query: null`.
5. `simulate_candidate` (`{ request }`) with the exact object; capture the report and
   the invocation `EngineIdentity` in one `engineInvokeRecorded` call.

Preflight (sync, coarse; the engine remains authority) refuses before dispatch with
specific reasons: unsupported component kinds; `ellipticalfinset`/`freeformfinset`;
zero or multiple trapezoid fin sets; fin count not 3/4; nose absent/not first;
`vonkarman`/`parabolic`/`elliptical` nose; `ogive` without `tangentOgive`; transition
without `conical`; multiple/solid mounts; motor unresolved/invalid/excluded; nonzero
workspace fin cant; non-finite fields; launch altitude outside `0..20 km`; CA0
negative/non-finite; missing axial source text; curve Mach outside `[0, 0.8)` or
more than 64; invalid quadrature; declaration digest mismatch. The engine's exact
error is surfaced if preflight is less strict (e.g., root not wholly on its host).

## 4. Consumer matrix

Legend: **supported** = real candidate path, one exact request; **refused** = an
explicit visible refusal, no legacy dispatch and no fabricated value; **legacy** =
unchanged legacy path, only while the legacy/no-provider selection applies.

| Consumer | Engine command | Candidate selected | Legacy selected | Proof |
| --- | --- | --- | --- | --- |
| Flight run | `simulate_candidate` | supported: bounded trajectory, events, observed prefix, absent/present landing, query/curves in one report | unchanged `simulate_flight` | unit + actual-WASM Node + browser |
| Live preview | `flight_summary` | **refused** (“preview would require the legacy engine”) | unchanged | UI test, spy zero calls |
| Query | candidate report `query` (default last committed sample) | supported read-only; arbitrary user state **refused** | n/a | report/UI test |
| Curves | candidate report `curves` | supported read-only at requested Machs | legacy `aero_curves` unchanged | report/UI test |
| Ensemble / Monte Carlo | `run_ensemble`, `run_ensemble_chunk`, `run_ensemble_classified` | **refused** (no candidate ensemble) | unchanged | UI/action test, spy zero calls |
| Archive: project save/open/import | `writeProject`/`readProject` | supported: candidate selection, v3 inputs, strict result archive | unchanged | file + browser |
| Archive: saved-run compare | `SavedRuns` | candidate record display; result deltas withheld; archived input differences remain historical, not a cause/accuracy claim | unchanged | UI test |
| Export: project / trace | `writeProject`/report trace | project supported; trace carries candidate IDs/status, no legacy gates/outputs | unchanged | test + browser |
| Export: KML | `exportKml` | **refused** (no legacy telemetry/lifecycle) | unchanged | test |
| Design exports (rkt/ork/step/stl/svg/png/eng/rse) | format modules | design-only, unchanged | unchanged | existing tests |
| Drag calibration fit/apply | `simulate_flight` fit path | **refused**; retained artifact inactive, never transferred | unchanged | test, spy zero calls |
| Aero drag preview | `aero_curves` | **refused** while candidate selected | unchanged | UI test, spy |
| Static stability assembly | `stability` | **refused** while candidate selected (legacy Barrowman is not the candidate provider) | unchanged | UI test, spy |
| Copilot flight/stability checks | `simulate_flight`/`stability` | **refused** with “not evaluated”; non-engine answers remain | unchanged | copilot test, spy |
| Moment-arm history | `simulate_flight` option | **refused** (candidate does not produce it) | unchanged | parser/UI test |
| SimFlightOverlay “Sim” curve | committed record | **refused** for a candidate record; logs remain viewable | unchanged | UI test |
| Verify stage gates | legacy gates | **refused**: no legacy gates; candidate statuses live in Flight | unchanged | UI test |
| Weather panel | context only | surface wind consumed; E1 profile retained as context, never claimed consumed | unchanged | UI test |
| Mass rollup | `aggregate_mass` | allowed (motor-station derivation only; not a flight model) | unchanged | test |
| Chamber/nozzle/propellant | separate commands | unaffected | unchanged | existing tests |

No row may silently call a legacy flight/aero command while the candidate selection is
active. The universal rule is: *candidate selected -> only `simulate_candidate`,
`aggregate_mass` and non-flight design/export tools may dispatch; every other
flight-result consumer renders an explicit refusal.*

## 5. User journey (the complete bounded mechanism)

1. Open a project. Absent/legacy selection shows the existing legacy model and
   results. Model status is visible in Flight inspector and `ModelStatusPanel`.
2. Flight inspector -> “Flight model” -> “Use experimental candidate model”. A real
   panel (not a placeholder dropdown) shows the coarse preflight for the current
   design. Unsupported geometry lists exact component/reason rows and the enable
   button stays disabled. Example: the seeded NASA Student Launch nose is
   `vonkarman`; it is refused until the user selects `conical` (or an acknowledged
   tangent ogive) in the Airframe inspector.
3. The panel requires: prescribed CA0; axial provider ID; source/power-condition
   identity; horizon; time step; curve Machs; all six physical declaration
   acknowledgments with provenance; explicit ogive/transition interpretations; and
   the advanced quadrature values. Defaults (proposed, visible and editable):
   quadrature `1e-14` / `1e-10` / `4096` (the reviewed fixture values), horizon
   `300 s`, step `0.01 s`, curve Machs `[0.02,0.05,0.1,0.2,0.4,0.6,0.79]`.
4. “Enable candidate model” computes the declaration vehicle SHA-256 asynchronously,
   checks the design did not change during hashing, then commits one undoable
   `flightModel` change. Failure/cancellation leaves the legacy selection and the
   document unchanged. The descriptor, the selection time and the declaration digest
   are stored.
5. Flight now shows “Experimental · unqualified” plus the support limits. Preview,
   Monte Carlo, legacy drag/stability, copilot flight checks and calibration fit/apply
   render their refusals. No legacy flight can be started from this document.
6. “Run candidate” captures the sync input key, calls `aggregate_mass`, derives the
   motor station, builds the exact request, starts the analysis record, and dispatches
   `simulate_candidate` in the interactive lane with an `AbortSignal`. A visible
   Cancel action aborts it. On success the report is parsed strictly into the
   candidate view/archive; the invocation `EngineIdentity` is recorded; the case is
   appended only at save time, as with legacy runs.
7. The Flight result presents: status/computational completion, termination, final
   time/state/flags, events, observed-prefix peaks (explicitly observed, not a
   predicted apogee), landing absent or actual touchdown, query tab (origin, flow,
   coefficients, static/rate forces and moments, CP/unavailable reasons, same-state
   equality result), curves tab (per-Mach status, CD/CL, C/J, CP/unavailable), model/
   support IDs, limitations, the input/model digest and the executed WASM SHA
   separately. No green PASS, no gate verdict, no zero-filled missing quantity.
8. Save project file or browser slot. The case carries the v3 inputs (exact request,
   derivation, context), the strict result archive, the invocation identity and the
   content digest. The existing 64 MiB project / 8 MiB foreign budgets and revision
   guard are unchanged.
9. Undo the selection: the project returns to legacy, the candidate case remains in
   the archive/history, and the session candidate result is marked model-mismatched/
   stale (not shown as current legacy or as a valid candidate current run). Redo
   restores the selection. Undo never deletes an archived case.
10. Reload/reopen: the 1.12 document parses; the candidate selection, archived inputs
    and result/status render read-only; **no run is started**. A tampered/corrupt
    candidate document is refused and the open document is left intact.
11. “Load saved inputs” restores the archived vehicle, candidate selection, workspace
    and context as one undoable edit and detaches analysis; the user explicitly runs.
    A fresh run from the restored request reproduces the same input/model digest and
    the same observed prefix on the same executed WASM; a different engine SHA or a
    request mismatch is shown, not hidden.
12. Error path: unsupported design/CA0/cant/curve/preflight reason is shown inline;
    an engine refusal (for a request that passes the coarse preflight) is shown with
    the engine's exact message; no case is appended and the project remains saveable.
13. Cancellation path: Cancel aborts the pool call, terminates/replaces the worker,
    clears the job, records no case and leaves the previous project/result intact.
14. Concurrent path: two tabs share the durable slot. Tab A saves; Tab B's save is
    rejected as stale (base revision mismatch), with the existing recovery text; the
    document in B is unchanged and can be saved to a file.
15. Import path: download the candidate project, re-import it (same and tampered
    variants), and confirm strict parse/no legacy reinterpretation.

## 6. Invariants

- **Migration:** 1.11 -> 1.12 is identity-only; old cases retain absent candidate
  fields; a 1.11 canonical-dictionary case still parses; unknown/newer versions fail
  closed; candidate fields before 1.12 fail closed.
- **Undo/redo:** selection is one undo entry; archived cases are history and survive;
  result freshness is model-sensitive; no undo path silently converts a candidate
  result to legacy or vice versa.
- **Import:** parse/migrate/validate before adopt; corrupt/unknown candidate data
  replaces nothing; no partial case; oversized files are refused before reading.
- **Concurrent write:** existing `revision`/`StaleRevisionError` guard covers the
  candidate document; no merge or auto-rebase; the current document stays dirty so a
  file save remains possible.
- **Save failure:** quota/backend failure and budget refusal leave the document and
  dirty state intact; no truncated archive.
- **Staleness:** a design/motor/launch/selection/horizon/curve edit changes the
  candidate key; a physical design edit also invalidates the declaration digest and
  refuses dispatch until re-acknowledgment. A weather/profile context edit does not
  claim to change the candidate environment (surface wind/site do).
- **Calibration:** no old fit, scale or CP-derived table enters a candidate request;
  legacy fits remain historical and become applicable again only under the legacy
  selection and their existing binding/engine/input rules.
- **Runtime identity:** input/model digest and executed-WASM SHA are displayed and
  stored separately; a result is never attributed to a different build root or a
  refetched asset.
- **Absence:** missing landing, apogee, flow, coefficient, CP or rate moment remains
  absent with reason; never zero and never PASS.

## 7. Exact file changes (proposed subcommits)

Commit 1 — schema/selection (no UI run path yet):

- `src/application/flightModel.ts`, `flightModel.test.ts`: union, exact parsers,
  legacy-only archive parser, frozen candidates.
- `src/formats/projectJson.ts`, `projectJson.test.ts`: schema 1.12, migration/gates,
  v3 inputs, candidate selection/result validation, strict archive.
- `src/application/runInputs.ts`, `runInputs.test.ts`: `captureCandidateRunInputs`
  (v3), legacy capture unchanged, refusals for ensemble/shear/history/calibration.
- `src/application/dragCalibration.ts` (+ test): refuse candidate fit creation; keep
  stored fit parsing/binding unchanged.
- `src/application/calibrationApplicability.ts` (+ test): type widening and candidate
  incompatibility text; no rule change.

Commit 2 — request/derivation/identity:

- new `src/application/candidate.ts` (+ `candidate.test.ts`): projection, preflight,
  SHA-256 declaration binding, sync freshness key, exact request builder, result
  parser/view, archive sampler.
- `src/tauri/bridge.ts`, `bridge.test.ts`: `simulateCandidateRecorded`; export the
  shared DTO projection helper (move/export; no legacy mapping change).
- `src/application/runCases.ts`, `runCases.test.ts`: candidate case assembly, no
  legacy outputs/telemetry/events.
- `src/application/runComparison.ts`, `runComparison.test.ts`: candidate input
  summary/compare; cross-model withholding.

Commit 3 — dispatch/presentation/refusals:

- `src/tauri/bridge.ts` candidate call; `src/console/data/adapter.ts` candidate run
  and view mapping.
- `src/console/store.ts`, `store.test.tsx`: model-aware resolution/key, run/cancel,
  analysis payload union, ensemble/preview guards, candidate selection actions.
- `src/state/analysis.ts` (payload typing only), `src/console/hooks.ts`,
  `livePreview.ts` and tests: candidate freshness/qualification/refusals.
- `src/console/stages/Flight.tsx`, new candidate panel/result/query/curve components;
  `src/console/stages/{Aero,Verify,LivePreview,Mission,Recovery,Build}.tsx`,
  `src/console/shell/{Shell,CopilotPanel}.tsx`,
  `src/console/evidence/{ModelStatusPanel,CalibrationCard,SimFlightOverlay}.tsx`
  (+ focused tests): explicit refusals/statuses, no `committed.run` assumption.
- `src/copilot/{engine,checks}.ts` (+ tests): candidate refusal of flight/stability
  paths; no silent legacy call.

Commit 4 — persistence/reopen proof:

- `src/state/project.ts`, `projectIo.ts` (+ `projectIo.test.ts`,
  `projectBoundary.test.ts`, `stores.test.ts`, `openRunIdentity.test.ts`):
  `loadSavedRun` v3, undo/redo, import/save failure/stale revision, pending run.
- `src/console/stages/SavedRuns.tsx`, `SavedRuns.test.tsx`: candidate archive,
  content/engine identity display, deltas withheld.
- `src/console/stages/Build.tsx`, `buildExport.test.tsx`: candidate trace, KML
  refusal, no legacy gates/outputs.
- `scripts/preview-journeys.mjs`, `scripts/browser-smoke.mjs`: candidate journey.
- `docs/internal/engineering-changelog.md`; lane `RESULT.md`, `EVIDENCE.json`,
  review-pending note. Coordinator owns `REVIEW.md`, register, manifest, TASKS and
  handoff.

Read-only in this lane: all `crates/**`, `scripts/build-engine.mjs`, acceptance
register/manifest/TASKS/GOAL-HANDOFF, protected data, historical identities.

## 8. Planned tests and falsifying checks

| Area | Planned test | Falsifier it must catch |
| --- | --- | --- |
| Selection parse | exact candidate/legacy objects; unknown/missing key; non-true declaration; bad IDs; CA0 NaN/(-1)/missing; zero accepted; bad SHA/timestamp; unknown model fails | any silent coercion/fallback |
| Preflight | vonkarman nose, ogive without interpretation, transition without conical, elliptical/freeform, 0/2 fin sets, multiple/solid mounts, missing motor, cant, altitude, curve >=0.8, >64 | a design that should be refused reaching dispatch |
| Projection | exact field diff legacy vs candidate DTO; `isMotorMount`/`assignedMotorId`/color/comment removed; mass/CG overrides preserved | an engine refusal caused by projection drift or hidden physical field loss |
| Request | all derived fields, station 0.476 for Estes Alpha, null scale/cant/query, no `schemaId`/controls, internal IDs, identity IDs | a second mapping or a leaked legacy field |
| Key/staleness | same inputs same key; CA0/horizon/curves/quadrature/declaration/vehicle/motor changes change it; reordered JSON does not; nonfinite refuses | stale result claimed current |
| Archive | strict round-trip; time-limit landing absent; touchdown landing present; apogee only when reported; unavailable preserved; sample cap/count disclosure; tamper fails | zero-fill, reconstruction, truncation disguised as complete |
| Schema 1.12 | 1.11->1.12; 1.11 canonical dictionary still parses; candidate fields only 1.12; unknown version fails; old cases unchanged | migration regression or retro-filled candidate data |
| Dispatch | spy: candidate run sends exactly one `simulate_candidate` with the archived request; zero `simulate_flight`; cancel no case; engine error no case; edit during run stale | silent legacy dispatch or fabricated result |
| Refusals | preview/ensemble/aero/stability/copilot/calibration/overlay/KML/moment-arm: visible reason, spy zero legacy calls | a secondary consumer dispatching legacy |
| Persistence | save/reopen/import candidate; undo/redo selection; load v3 inputs no auto-run; two-tab stale; save failure; pending import/replacement | document loss, auto-run, stale acceptance |
| Identity | re-run restored request -> same content digest/observed prefix on same WASM; different engine SHA shown; digest kept separate from executable | identity substitution |
| UI | Flight statuses/query/curves/absence; no PASS; Verify/Build candidate branch; SavedRuns candidate record | green PASS or crash on missing legacy run |

Named failing mutations to run against the tests: remove the `isMotorMount` drop;
remove `dragCdScale: null`; allow `parseFlightModel` to accept any object; allow
candidate fields on 1.11; treat a time-limit landing as zero; derive apogee from the
observed prefix; let `runMonteCarlo`/preview fall back to legacy; omit
`engineIdentity`; skip the declaration digest check. Each must fail its test.

## 9. Actual rebuilt bytes and production-CSP browser proof

After approval only:

```sh
free -h                                  # stop below 2 GiB available
CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=<lane-specific target> pnpm build
sha256sum src/engine/astraea_engine.wasm
find dist -name '*.wasm' -exec sha256sum {} +
node node_modules/vitest/vitest.mjs run <focused paths> --maxWorkers=2
node node_modules/typescript/bin/tsc --noEmit
node scripts/browser-smoke.mjs           # Chromium, production CSP, includes candidate journey
```

The build script is unchanged. The rebuilt WASM gets a new SHA-256/byte count for this
build root; the previous `13da44d5…`/`307f585c…` receipts remain historical and are
not cited for the new bytes. The proof records source commit, toolchain, exact
commands, target dir, dist WASM SHA/bytes, the app-recorded invocation SHA from the
saved project, and confirms the fetched bytes equal the dist bytes.

Browser journey assertions (real UI, no mocked engine/application store):

1. Attempt candidate selection on the seeded NASA Student Launch design: refusal
   listing the unsupported `vonkarman` nose; no selection committed.
2. Load the Estes Alpha preset, Airframe -> nose profile supported (`ogive` with the
   explicit tangent interpretation). Enter CA0 `0.35` (an explicit unqualified test
   declaration, not a measured value), axial provider/source text, horizon 30 s,
   step 0.01 s, declarations; enable. Assert one undo step, candidate status,
   preview/MC/aero/copilot/calibration refusals.
3. Run. Assert: no legacy flight; header experimental/unqualified; computational
   completion/termination; observed-prefix label; landing absent or actual; query tab
   equality true and unavailable reasons; curves at 7 requested Machs plus reference
   when added; no PASS/gate/zero fill; engine SHA and content digest separate.
4. Save project file; parse the downloaded JSON: v3 inputs, exact request, derivation
   station `0.476`, candidate result, engine SHA equals the dist WASM SHA, digest
   64-hex, landing/termination consistent, sample retention counts.
5. Reload -> open saved project (durable slot) and import the downloaded file;
   assert selection/inputs/result/status survive read-only with no run.
6. Load saved inputs; run explicitly; download a second project; assert the same
   input/model digest, observed prefix and termination on the same WASM.
7. Undo the selection: legacy selection restored, candidate case still archived,
   candidate result not shown as current; redo restores. Save again.
8. Import a tampered copy (e.g. landing on a time-limit result or a bad digest):
   refusal with no document replacement.
9. Set a workspace fin cant / unsupported field and attempt run: visible error, no
   case, document still saveable. Engine-refusal propagation is additionally proven
   by a Node test on the actual WASM.
10. Cancellation: start a deliberately long request (large horizon / small step),
    click Cancel; assert idle, no case. Record whether the worker returned first; if so
    record the failed cancellation attempt and repeat with a smaller step. The
    deterministic abort/no-case path is also covered by the pool/action unit test.
11. Two tabs: save in A, save in B -> stale-revision refusal, B's document intact.
12. Zero page/console errors; workers/browser/preview closed in `finally`.

Retained limits for the receipt: no candidate ensemble/profile/local axial source; no
empirical or broader numerical qualification; no cross-root byte equality or
cross-machine claim; long-horizon/tiny-step request size remains a runtime risk (the
engine has no response cap); the browser cancellation timing is not a physical
guarantee.

## 10. Acceptance mapping (author cannot mark PASS)

| Check | This increment can supply | Remains open |
| --- | --- | --- |
| RMP07-C01 | app stores the exact typed request, engine content digest, declaration design hash and separates executable identity | full canonical identity/graph and all consumers |
| RMP07-C02 | retained PASS: old/no-provider projects and legacy cases unchanged; 1.11 migration regression proof | no C02 promotion; this lane must not regress the existing PASS |
| RMP07-C03 | candidate refuses calibration; old fit inactive, never transferred | full calibration applicability/qualification |
| RMP07-C04 | one prepared-object candidate report for run/query/curves; every legacy consumer refuses under candidate | candidate ensembles/other workers; full C04 |
| RMP07-C05 | candidate save/reopen/undo/import/two-tab/save-failure/pending-run paths | full persistence matrix |
| RMP07-C06 | candidate unknown schema/provider/result/tamper fails closed without loss | full corrupt/missing-provenance matrix |
| RMP07-C07 | candidate computational/domain/quantity statuses visible; absent landing/apogee/CP never zero/PASS | full cross-surface status coverage |
| RMP07-C08 | new actual-byte build receipt for this lane's new bytes; prior C08 receipt is not cited for them | coordinator verifies/accepts the new receipt; no register promotion by this lane |
| RMP15-C01 | candidate saved/reopened inputs and result/status journey | full journey matrix |

No register promotion, release/default switch or “all checks complete” claim is made.

## 11. Decisions requested at this gate

1. Approve `flightModel` union, exact candidate descriptor IDs and schema **1.12.0**
   with the widened version gates (including 1.11 `flightOutputs`).
2. Approve the candidate DTO projection, specifically dropping internal
   `isMotorMount`/`assignedMotorId` with the named projection ID, archived original
   vehicle and explicit declaration acknowledgment. Reject/amend if the coordinator
   requires a different engine-visible treatment.
3. Approve the visible, editable defaults: quadrature `1e-14`/`1e-10`/`4096`, horizon
   `300 s`, step `0.01 s`, seven curve Machs; all are recorded per run and in the
   selection. No hidden numerical policy is introduced.
4. Approve the separate strict candidate result archive and the bounded display-sample
   policy (`<= 5000`, explicit retained/dropped counts); the legacy output dictionary
   is not repurposed.
5. Approve the refusal scope in §4 (preview, ensemble, legacy aero/stability, copilot
   flight/stability, calibration fit, moment-arm, KML, arbitrary query). Amend any row
   the coordinator wants implemented instead of refused.
6. Approve the test/falsifier list and the actual-byte browser journey, including the
   new build SHA rather than any historical receipt.
7. Confirm the coordinator retains independent review/merge/acceptance; this lane will
   stop at the gate and will not edit the register, manifest, TASKS or handoff.

## 12. Gate stop

No production file, schema, engine, build script or artifact was changed. This
proposal is the complete first delivery. Implementation waits for coordinator approval
or amendment.
