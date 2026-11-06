# Independent coordinating review — first implementation

Reviewer: native OpenAI coordinator, independent of DeepSeek author family.
Source reviewed: `c240ea7c42243f102d9782e31dd48da3fb0a18fa`, source commits
`0e09a8e` / `aaac9e6` / `88bdd46` / `f1e480b` / `8d1689e`.
**REQUEST CHANGES. Not integrated, not accepted; no acceptance promotion.**

Read request/model/archive/input/store/lifecycle and changed consumer source,
proposal/gate/result/evidence; ran direct actual candidate archive parser probes
and opened the actual built UI in cached Chromium under production CSP. This is
not a repetition of an author-reported failure merely to confirm it.

## F1 — impossible or foreign candidate archives accepted (blocking)

`candidateResult.ts:558-718` validates many fields individually but omits
consumer-visible contract relationships and accepted identity/status domains.
Real parser applied to the author's actually saved synthetic case ACCEPTED:

- apogeeEvent at finalTimeS+10;
- event timestamp -1;
- static curve point at Mach 2;
- identities.environmentModelId = unsupported-weather-model;
- query.timeS = 0 while origin remains last-committed-sample of a 2 s run;
- supportPolicy.machUpperExclusive = 5.

Direct probe retained in
`../evidence-rmp07-candidate-app/coordinator-parser-probes.json`.
Changing requestedHorizonS from 2 to 3 also leaves CompletedRequestedHorizon
accepted (direct parser call observed); no check ties a result's requested
horizon/curve grid/source/environment/model to its archived request in
`projectJson.ts:1117-1130`. `candidateResultFromReport:795-799` manufactures the
accepted resultSchemaId instead of checking the actual report.resultSchemaId.

Fix the original promised strict contract, not an arbitrary new validation
policy: exact supported model/environment/mechanics/source-policy/status IDs;
nonnegative ordered event/sample/query/peak times inside the actual run;
CompletedRequestedHorizon reaches its requested horizon; apogee within run and
supported by its actual event; same-state query/reference/final time/state/flags
relationships; requested curves versus actual grid/reference and supported Mach;
mandatory retained first/final/peak/event context; and linkage of archived result
horizon/curves/composition/source/environment/geometry/axial declarations to the
archived request/selection where directly known. Unknown report result schemas
must be refused, not overwritten. Preserve legitimate null CP/flow/coefficient
and pure-couple semantics, actual finite-f64 representation and historical
schemas. Do not compare unrelated metadata or require an unavailable measured
proof. The archive is not cryptographically authenticated: do not claim a
64-hex digest validates user-edited file authenticity without the preimage.
Use meaningful failing-before/passing-after import/parse tests; real malformed
UI import must preserve the open document. No scientific thresholds change.

## F2 — run admission/cancellation starts too late (blocking)

`store.ts:542-598` checks running synchronously, then awaits SHA and mass rollup
BEFORE marking busy and assigning abort/token. Two Run activations can both
enter. In the actual production UI, two synchronous activations of the visible
header Run candidate control left it enabled immediately and dispatched TWO
aggregate_mass calls followed by TWO simulate_candidate calls (worker IDs
4/5 and 6/7). Both are actual production WASM calls, not mocked outputs.
Source/bytes: candidate lane; SHA
`da38461e247274f605b52abe06e71fad2c8eadbd76d55aa0ee31f069d0ce9ac6`,
1827192 bytes, exact production CSP, no browser runtime errors. Screenshot and
receipt: durable external `coordinator-duplicate-run.webp/.json`. Immediate
recording observed both calls; later in-page log capture was empty, retained
as a recording limitation, not hidden or attributed to a cause. Initial legacy
call entries in that log are NOT attributed to candidate selection.

An older completion/failure also unconditionally clears running/candidateAbort
and can clear another admission's state. Claim busy/admission token/abort before
first await; guard every continuation/failure/final cleanup by that token and
project epoch, and cancel during hashing/mass preparation as well as actual
engine dispatch. No cancelled/superseded preparation may dispatch later, no
late callback clears a newer job, and errors leave the prior project/result
preserved under existing rules. Use deterministic deferred-preparation behavioral
regressions plus bounded actual UI/worker proof; do not create huge requests
merely to make cancellation observable. No new pool/retry abstraction needed.

## F3 — secondary consumers can show old legacy outputs under candidate selection (blocking)

`Verify.useGates:19-23` returns the previous legacy run's gates whenever it
exists, even when current flightModel is candidate. Verify renders the no-legacy-
gates warning AND those legacy gate rows; the static_margin row explicitly
escapes stale styling at line46 even though useStability is refused.
`Mission.tsx:15-40` similarly renders Predicted apogee/target delta from the
previous legacy run; the candidate warning is conditional on !run. Mission is
always 'live' in useFreshness, so this is not a clearly qualified historical
candidate display. Merely adding a warning does not fulfill the refusal matrix.

Guard actual shared gate/readout consumers by selected model and recorded model,
not just existence of .run. No ordinary current candidate stage/sidebar/rule/
preview/export may reuse legacy results. Preserve old runs in clearly identified
history/Saved Runs, not by deleting them. Regression: complete a real legacy
run -> enable candidate without running -> inspect Mission/Verify/Aero/preview/
Build, then disable/undo/redo and inspect recorded model attribution; no hidden
legacy dispatch or gate/target prediction. Verify with real built UI after fix.

## F4 — immutable capture aliases/freeze caller state (required)

`captureCandidateRunInputs` calls freeze on an object containing original
project.vehicle/workspace/mission, motorRecord and exact request references.
Legacy capture correctly structuredClones before freezing. Reuse that detached
snapshot pattern; capture must not freeze/mutate the caller's live project or
shared motor catalog, nor change after caller-owned objects are edited. Exact
request that is dispatched and archived must still match. No duplicate runtime
mapping or schema change is needed.

## F5 — exact freshness promised but only FNV key implemented (required)

Proposal §3.5 promises an exact canonical request comparison in addition to the
32-bit freshness key. Current currentRunKey/useFlightQualification compare only
candidateInputKey's FNV32 and useFreshness uses generic design differences.
Complete collision-safe model/input freshness using the retained immutable
candidate invocation/context and a single canonical comparison at the shared
boundary; do not call FNV a cryptographic digest or add a second solver/cache.
Prove stale model/CA0/horizon/curve/environment edits across header/Flight/Build,
including when a test forces a freshness-key collision. Preserve original
keys/digests/cases and existing legacy convention; no historical rewrite.

## Evidence/test cleanup and residual separation

- `/tmp/rmp07-candidate-evidence` was copied intact by coordinator to durable
  `../evidence-rmp07-candidate-app`. Preserve original records as historical;
  add durable receipts/commands/hashes for rework rather than overwriting old
  observations. Keep model-route provenance precise; the parent's launch catalog
  text briefly showed DeepSeek-V4.1-Flash, while child says it independently
  verified 1017 and a fresh coordinating catalog again resolves the alias to
  DeepSeek V4.1 Flash 1017. No provider fallback is evidenced; do not fabricate
  a stronger server-version attestation than actual metadata.
- New tests copying DTO fields/mock values and pinning incidental wording/default
  constants are not permanent behavioral tests. In particular, replace pure
  projection-copy/sample-echo assertions with consumer-visible rejection or
  preservation invariants; delete wording-only assertions instead of re-pinning
  them. Keep genuine geometry/mount/identity/absence/lifecycle regressions.
- curveMatchesReferenceSample=false is an honest observed engine result, not an
  app display bug to suppress. Coordinator owns the queued engine investigation
  (including reconstruction at reference Mach and final-canopy curve N/A).
  Keep the false result and original scenario. App lane stays Rust-read-only.
- One-parachute plus nonzero-wind initial refusal must not be presented as proof
  that the parachute count caused it. Retain exact scenario/error and mark any
  causal inference unproved. Existing calm two-parachute supported fixture is
  legitimate bounded consumer evidence, not full-flight/physical qualification.

## Focused rework authorization

Same author/lane, no new proposal loop for these directly evidenced corrections.
Complete F1–F5, meaningful regressions and actual bounded production-CSP proof,
then return small source/record commits. Run final affected tests/typecheck/build
after coherent edits; retain failed-before evidence. Rust/build flags/numeric
models/defaults/budgets/IO caps stay frozen. No protected broad scoring or data
acquisition. Browser proof uses only retained declared synthetic inputs; no
new permanent broad browser suite. Stop temporary runtimes and remove throwaway
scaffolds after evidence capture. Coordinator will independently review and
verify/integrate; author cannot self-accept or edit register/manifest/TASKS/handoff.
