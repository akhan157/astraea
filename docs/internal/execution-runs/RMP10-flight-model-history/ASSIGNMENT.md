# RMP10a — proposed result-bound flight-model history

Planning base `78d27f3130ccfb4bd22419b1ed5877675004619d`, existing intended
execute-rmp01-package-c80e7d3 / furry-fish worktree; .pi/ remains untracked.
Current author environment openai/gpt-6.1-sol/high. No other task owner/process
active at dispatch. RMP07f and RMP12c source/compute leases are released.

## Phase 1: source/observable contract, review before implementation

RMP10 early source/output-contract work is ready independently of missing
mission data. Read packet RMP10, control loop/checks/decisions, existing
collegiate-output-contract-audit.md, current kernel diagnostic/telemetry/driver,
engine DTO/commands and app adapter/contract/stability presentation. Reuse
accepted geometry-only labels and recorded-pressure-peak retention; do not
redo completed changes 29f7ba4/ad8448b. No raw flight outcomes or source search.

The production load evaluator already computes instantaneous motor+dry CG,
normal C/J/CP, actual static moment and rates at each evaluated state. The
geometry-only app stability command cannot substitute for this flight path.
Define a narrow sampled result-bound history using those actual evaluated
values before display rounding. No new physical law or governing CP choice,
no empirical/dynamic stability/competition/continuous-minimum assertion.

Writable now: this directory (ASSIGNMENT/CONTRACT/REVIEW and prospective record).
No runtime/source/WASM/native calls in phase 1. Independent read-only convention/
observational-contract review before material core/interface edits. A proposed
contract is not an implemented capability or accepted scientific result.

## Phase 2: implementation lease (historical; completed below)

Accepted contract checkpoint / implementation base:
`feb3c1aa5e18263a3b7592e9186bc29a65eed791`. Same source as planning base;
only prospective contract/coordination docs integrated. Author/coordinator owns
INTERFACE.md exact files in this worktree; no other source/reviewer process
active. One heavy task, target `/home/ak/.paseo/worktrees/3s8t98rp/target-rmp10`.
DO NOT use target-rmp01: sealed old binaries and studies stay untouched.
Routine exact lease extensions for integration: engine/tests/{freeform_fin_parity,
telemetry_parity}.rs (new internal flag=false literal only), console/testFixtures.ts and new
application/momentArmHistory.fixture.ts (explicit manufactured test data),
application/runComparison.ts/test (report request is invocation context),
new scripts/check-moment-arm-history-browser.mjs (synthetic-only actual built UI/
worker/byte/save/import/trace checks; no empirical fixture access). Browser helper
may observe/pass through Worker messages but must never stub or alter requests,
responses, executable identity or physics. Actual browser-2 caught signed-zero
loss in default JSON persistence/trace despite raw retention contract. Exact
lease extension: formats/reportJson.ts/test (plain JSON serializer preserving
-0.0), projectJson.ts writer and Build.tsx trace writers/regressions. No schema/
field/physics/default change; source-fix review required before acceptance.
Additional exact affected test lease: console/projectJobs.test.ts, whose deferred
success mocks must honor the captured reporting request (no production guard relaxation).
engine/momentArmHistory.test.ts: two ordinary real-WASM off/on calls on existing
synthetic input, exact old-result preservation + strict actual-history parser;
not a numerical reserve experiment or native/WASM broad parity qualification.
Regression-first ordinary synthetic tests are implementation verification, not a
rerun of the RMP12 numerical experiment/reserves or empirical qualification.

Expected lease, subject to reviewed design: core six_dof.rs/telemetry.rs and
focused tests (no force/integration changes), engine models.rs/commands.rs and
focused DTO/dispatch tests, TS sim type/bridge/adapter/contract and affected
Aero/result-history/export tests, archive reader/type/capture only if reporting
request must be persisted. New helper modules permitted if they prevent mixing
candidate and legacy semantics. Exact files/API/archive decisions must be pinned
before implementation, not guessed from this list.

Default existing API/ensemble behavior remains unchanged; reporting requested
explicitly. Candidate provider semantics are NOT substituted by legacy history.
Old documents/results/inputs remain untouched, absent history stays unavailable.
Any actual new offered WASM requires intentional rebuild, executed-byte evidence
and its own applicable checks; old browser/WASM logs cannot qualify a new asset.
No source identity/seal/hash from old studies rewritten or experiment reruns.

## Acceptance direction / boundaries

RMP10-C01/C02/C06/C07 progress only until actual source-to-wire-to-UI journeys
exist and review accepts the exact scope. Parent RMP10 stays partial; RMP09
measured mechanics/guide semantics and RMP05 budgets still gate decision claims.
Preserve null/N/A and classified errors; no green stability flag or competition
threshold. Sampling and source-model uncertainty are separate from implementation
correctness. No warnings used as a substitute for completing supported functions.

Resources: measure free -h before heavy work; one heavy task, max two compiler/
test workers, serial reviewers. Synthetic analytic/model-observer tests only
unless a separately frozen authorized numerical experiment is declared. No
holdout/scoring, outreach, push/main merge, deployment/release/default activation,
paid provisioning, automation restart or external team qualification.

## Phase 3: accepted implementation/checks; source/compute lease released

Local source commit6117ea161fc5c906ce7b57ebf4bbe0ff4789fd1a implements the exact
accepted current-legacy observer contract. Initial implementation and final
serializer-fix/software-runtime evidence reviews ACCEPT, scoped supplied-source/
data, no tools.191core/98engine/348frontend27files/tsc/build pass; actual built
b32e7b7c… WASM/CSP/worker/save/reopen/motor alternative/actual project+trace ZIP
pass. Raw failures and signed-zero fix retained. Saved-output-only sign witness
added, no new experiment; original RMP12 sealed binaries/data unchanged.

No task-owned reviewer/build/browser/server remains. Source/compute lease
released; records-only affected package/tracker validation/checkpoint follows.
C01/C02/C06/C07 in_progress only, parent partial; C03/C04/C05 not_run. No scientific,
full-provider/mechanics/peak/event/structural/platform/team/release closure.
New source work requires fresh exact-base assignment; do not reuse this lease.
