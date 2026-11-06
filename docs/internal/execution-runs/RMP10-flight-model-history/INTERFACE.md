# RMP10a concrete observable / interface contract — revision 1

Base `78d27f3130ccfb4bd22419b1ed5877675004619d`; prospectively written
before runtime edits or new native calls. This supersedes open choices in
CONTRACT.md, not historical source/qualification evidence. Independent design
review accepted the direction; concrete interface review ACCEPT (see REVIEW.md).
Frozen before implementation; subsequent changes require explicit record/review.
No release, primary-model/default change, or prediction-accuracy claim.

## Decision record and output dictionary

Selected: report the existing legacy model's exact committed-macro diagnostics,
not a second evaluator, alternative CP, or stability decision flag. A time-linked
view helps inspect motor/geometry changes without confusing geometry-only CP/CG
with the actual modeled flight. Mission/decision matrix and accuracy specification
remain proposed; numerical budgets and real team qualification remain open.

- **Reporting request**: `reportMomentArmHistory?: boolean`, sibling of `options`
  on `simulate_flight` only. Absent/false off, true on; own null/nonboolean errors.
  Refuse this key on other commands (including inside ensemble `req`); existing
  FlightOptionsDto continues deny_unknown_fields. Preserve public three-argument
  commands::simulate_flight as off wrapper; dispatch uses a new explicit wrapper.
  Internal core `record_moment_arm_history: bool` defaults false. No ensemble,
  preview or candidate-provider history added; never insert it in physics options.
- **Response**: optional `momentArmHistory`, OMITTED when off, never null on
  requested successful result. Any solver/load/history/cap/finite-value failure
  returns a command error, no partial successful history. Ordinary off calls keep
  old serialized outputs/numerical semantics. Requested-data refusal is not a
  qualified prediction and must not replace a prior result/project.
- **Schema**: `astraea-flight-moment-arm-history/1.0.0`.
  `reportMomentArmHistory: true` echoes actual request.
  `modelId: flight-signed-normal-plus-wind-drag-v1` from actual diagnostic;
  `mechanicalModelId: legacy-primitive-mass-inertia/1.0.0` describes the existing
  declared-input/primitive mechanics, NOT measured inertia.
- **Frames**: `bodyFrame: right-handed-+Y-noseward; rates=pitch,roll,yaw`;
  `stationDatum: meters-aft-of-nose; moments-about-instantaneous-combined-CG`.
  These literals identify schema conventions, not executable hashes.
- **Reference**: `referenceAreaM2`, `referenceDiameterM`, `referenceLengthM` from
  the actual prepared vehicle (`ref_area()`, `ref_diameter`, `total_length`).
  Positive finite. Length is metadata; no changed damping or force arithmetic.
- **Scope**: `sampling: committed-macro-through-motor-burn-time-plus-initial`.
  Every sample is an existing LoadPhase::MacroSample at the committed state,
  with `t <= motor.burn_time` (closed interval) plus initial t=0. Do NOT record
  speculative/root/probe reads, add RHS calls, interpolate root states, or use
  rounded/decimated telemetry. This slightly refines the direction review's
  powered==true suggestion: exact-boundary macro samples are retained even when
  powered has become false; initial/closed-interval semantics are explicit.
- `burnoutTimeS` is the RESULT'S `burnout_time` = declared motor burn duration,
  NOT an independently observed burnout, nor proof of a refined root sample.
  `sampleCount`, `timeRangeS: [first,last]`, `maxGapS`,
  `lastSampleToBurnoutS = burnoutTimeS-last`, `exactBurnoutSampleExists` (exact
  timestamp equality only) derive from the raw returned array. No continuous
  minimum, rate, convergence/error bound or full-interval qualification claim.
  Exact committed burnout state is not required in this sampled increment.
- **Bound**: max 5,000 samples, checked BEFORE push; overflow errors naming the
  requested report/cap. No silent truncation/decimation or post-cap growth.
  This cap is a resource bound, not a physical burn-duration support statement.

`points[]` contains RAW UNROUNDED finite f64 values (rounding only for display):

| Wire field | Exact source / meaning | Unit / absence |
|---|---|---|
| timeS | committed driver t | s |
| massKg | macro_detail.loads.mass | kg, positive |
| cgFromNoseM | diagnostic.combined_cg | m aft of nose |
| mach | diagnostic.mach | dimensionless, nonnegative |
| incidenceDeg | diagnostic.alpha_total_deg, NOT envelope_alpha_deg | degree |
| dynamicPressurePa | diagnostic.q_inf | Pa, nonnegative |
| railBound, recovery, powered | actual diagnostic flags | booleans, powered means t<burn duration, NOT thrust>0 |
| domain | diagnostic.validity | valid/extrapolated/unsupported, computational only |
| aeroForceBodyN | diagnostic.aero_force_body {x,y,z} | body N |
| staticMomentBodyNm | diagnostic.static_moment_body | body N*m about combined CG; x/z include wind-axis-drag-coupled arm, y is fin-cant roll torque |
| dampingMomentBodyNm | diagnostic.damping_moment_body | body N*m; existing dimensional rate model, not rate-qualified |
| totalMomentBodyNm | diagnostic.total_moment_body | body N*m, distinct from static/rate pieces |
| normalApplicability | recovery ? not-applicable-live-canopy : active-airframe | explicit per-sample mask |
| normal | null ONLY for live canopy; otherwise object below | no fabricated zero |

`normal` fields: `cPerRad = diagnostic.cna` (1/rad),
`jMPerRad = diagnostic.first_moment` (m/rad about nose station),
`cpFromNoseM = diagnostic.cp` (m),
`armM = CP-CG`, `armCalibers = armM/referenceDiameterM`,
`armPercentLength = 100*armM/referenceLengthM`,
`cnaWeightedArmMPerRad = J-C*CG` (m/rad).
Positive weighted arm means CP aft of CG under the existing positive-C legacy
support; it is NOT dM/dalpha or a total finite-incidence/dynamic stability sign.
q*S, wind-axis drag and rates are excluded from this algebraic measure.
No green/red stable classification or competition threshold is introduced.

Under a canopy these coefficients are still computed by the old evaluator but
are not the active static branch: null + explicit applicability reason is a
report policy. The original positive/conditioned-C errors STILL fail the run,
even under a canopy. No guard weakening or new successful cancellation history.
Candidate C/J/free-couple semantics remain separate, not legacy fallback.

## Runtime attribution / persistence (concrete choices)

Rust/WASM cannot honestly supply its own invoked-buffer checksum. Keep existing
`engineInvokeRecorded` binding: history belongs to its enclosing native flight
result; adapter pairs it with the same invocation-bound engineIdentity and
inputKey. FlightRun/SimCase store it next to that identity/inputs, not a newly
queried current identity or duplicate unverified nested checksum. Native output
without the host identity is model-source metadata, not runtime attribution.

- `simulateFlightRecorded` gains optional fourth reporting argument, default
  absent; bridge sends sibling key only when supplied. `runFlight` gains final
  optional boolean, default absent. Existing direct callers stay off. Console
  committed-flight action explicitly passes true, and captures the SAME true
  request in `RunInputs.reportMomentArmHistory` before dispatch. No added user
  mode or hidden physics/default switch. Preview/ensemble do not request it.
- RunInputs version2 gains optional reporting sibling; absent remains absent,
  false stays false; v1 refuses injected reporting declarations. Request flag
  is invocation/report context, not a physical-key or calibration-model change.
- `SixDofSimulationResult`, `FlightRun`, `SimCase` gain optional typed
  momentArmHistory. New history-bearing SimCase must be flight, have v2 inputs
  explicitly requesting true, matching legacy model, and recorded engineIdentity.
  History's burn duration must equal the archived motor duration. All sample
  times must lie within recorded flight duration when available: no post-stop
  points. An abnormal stop can precede declared burnout; retain that fact and
  the positive last-to-burnout gap, never invent a completed burnout event.
  Validate native->adapter and project read/write with the same strict TS parser:
  exact schema/literals/key set, finite/domain/applicability/algebra/time/cap and
  array-derived disclosure consistency. Unknown/corrupt history refuses BEFORE
  replacement. Raw arrays remain immutable copies; no deriving from live state.
- **Project schema1.8.0**, with preserving migration from1.7.0: add no missing
  history/request/model declaration. Version1.7 readers otherwise silently drop
  unknown case fields: a bump prevents destructive old-app round-trips. This
  intentionally rejects the direction review's optional no-bump suggestion on
  repository-specific preservation grounds. Older schema declarations carrying
  new reporting/history fields refuse, not normalize/discard them. Existing
  archive2 payloads remain supported; no archive3 or invented past request.
- SavedRuns displays retained history without rerunning; old absence reads
  'History unavailable — not recorded for this run'. New result history survives
  save/open/save, motor/geometry edits, undo and stale/current-engine changes.
  Same component receives current-result or historical data + recorded identity;
  historical data is never adopted as current solver output.
- Build trace export carries the same retained history + recorded engineIdentity
  with existing stale-run attribution; no live recomputation or fitted physics.

## Minimal complete UI

Aero adds a 'Flight model history' panel for the committed result. Show CG/CP
stations vs time and arm (calibers/% length), selected exact recorded-point values
including C/J/weighted arm, mass, actual Mach/incidence/q and domain/applicability;
include all source/frame/moment definitions and recorded engine attribution.
An accessible point-index selector/readout avoids rendering5,000 table rows.
Plot connecting lines are visual guides between samples, not evaluated interiors;
N/A points break CP/arm paths. No interpolation or continuous-minimum readout.
Always disclose modeled-not-measured, N/range/max-gap/last-to-burnout/exact-sample
state and existing qualification limits. Stale badge follows current run
freshness; do not relabel arrays when inputs or engine change. Historical cases
reuse this panel under a details disclosure. Old geometry-only output remains
separate, unchanged. No measured-data or rule-compliance claim.

## Implementation lease / prospective checks

Author/coordinator owns this existing worktree, serial edits, base above.
Core: six_dof.rs, flight_provider.rs (new absent metadata member ONLY), new
moment_arm_history.rs + lib.rs export and focused tests.
Engine: commands.rs/models.rs/lib.rs, new moment_arm_history.rs + focused tests.
TS: new application/momentArmHistory.ts/tests; sim/sixDofSimulator.ts (types only),
tauri/bridge.ts/tests, console/data/adapter.ts/contract.ts/tests, console/store.ts,
application/runInputs.ts/runCases.ts/tests, formats/projectJson.ts/tests,
console/stages/Aero.tsx/SavedRuns.tsx/Build.tsx and focused tests; new reusable
console/evidence/MomentArmHistoryPanel.tsx/test. Intentional generated WASM build
only after source checks/review; bounded synthetic browser script when needed.
This directory, coordination/checkpoint, affected package/tracker metadata only.
No other physics/source/provider/default changes. Repin if HEAD changes.

First regression: current dispatch true-request silently omits a history (prove
failure before code), malformed request null is silently ignored, old schema
reader strips new case payload. Preserve this failing evidence. Then core/engine
analytic observer on/off, same-diagnostic exact point mapping, two-mass/depletion,
zero-propellant, strict-C/error, canopy mask, cap, timing (including exact/off-grid
burnout), raw precision, requested-error/no partial history. Scoped TS provenance,
strict parser/import no-replacement, archival roundtrip/stale/old absence and
UI exact literals/units/point selection. Affected suites <=2 workers; independent
implementation review before integration, intentional WASM build+bounded synthetic
browser save/open/motor-alternative journey with actual invoked-byte identity.
No outcome/scoring/physics-accuracy experiments. Logs remain external-local-only;
software/package PASS is not numerical/physical/mission/release acceptance.

RMP10-C01/C02/C06/C07 partial only until the full packet's provider, undefined
CP, peak/event, structural and scientific obligations are met; do not award a
parent PASS for this legacy sampled reporting increment.
