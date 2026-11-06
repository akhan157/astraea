# RMP12 — Changed-model numerical qualification on native and actual WASM

## Purpose/status and prerequisites

PARTIAL: C01/C05/C07 PASS; C02/C03/C06 blocked on approved budgets and broader
reference data; **C04 PASS on the delivered bytes** (native `bfab6d8c…` versus
WASM `1ccea732…`: 115,039 numeric fields per case within 1e-9 scaled precision,
15,000 Euler fields agreeing, zero lock exemptions). The attitude lane
(`ce20542`) also corrected a real presentation defect: the shipped extraction was
not a decomposition of the shipped matrix (yaw exact, pitch/roll exchanging the
asin/atan2 forms); the corrected Z-X-Y convention reconstructs the attitude to
2.3e-14 rad and recovers composed angles to 2.7e-15 rad. RMP12a
[native vertical reference](../../execution-runs/RMP12-native-reference/RESULT.md)
was independently reviewed at `46e74e6`, exactly 9/9 attempts once.
The frozen provisional20ms rail timing reserve **failed** (105.0167us>100us);
10/5ms selected checks,one byte repeat andtwo expected speculative refusals pass.
C01/C07 pass only frozen reporting/unchanged-source scope; C02 selected diagnostic fail.
No adaptive-tolerance/full6D/production-WASM/physical qualification follows.
Final applicable RMP01/06/08/09/10 implementations and RMP05 decision allocations
remain prerequisites for parent closure. No production defaults/tolerances changed.

Later accepted bounded evidence:
- [RMP12b controls](../../execution-runs/RMP12-candidate-controls/RESULT.md):
  inherited/hundredth tolerance × no-split/knot-split; exactly8 attempts once.
  Split arms pass this fixture's provisional reserves; tolerance-only does not.
- [RMP12c regime expansion](../../execution-runs/RMP12c-regime-expansion/RESULT.md):
  paired no-split/split at20/10/5ms; exactly7 attempts once. Both20ms request/stdout
  anchors and legacy bytes reproduce. Rail error A20=105.014us FAIL, A10/A5=17.123us,
  C20/C10/C5=2.401us. All three split settings reduce errors in this one fixture;
  finer-step/default-controls passes never waive the retained20ms failure or
  recommend a macro-step/default change. Trial/call totals and final candidate
  refinement brackets unavailable; sample/event confounds explicitly retained.
  Contract/implementation/results ACCEPT; source/compute lease released. Parent
  qualification/parity/approved-budget gates remain open; C02 remains FAIL.

[RMP12d](../../execution-runs/RMP12-ensemble-determinism/RESULT.md): bit-level ensemble
determinism and cancellation tests on shipped WASM; review ACCEPT; **RMP12-C05
PASS** for the current legacy per-run-v2 path. Not a study rerun; C02 FAIL retained.
[Evidence](../../execution-runs/RMP12-ensemble-determinism/EVIDENCE.json).

Current default-policy update: [RMP12 knot split](../../execution-runs/RMP12-knot-split/REVIEW.md)
is independently accepted after owner authorization of C1+C3: thrust-knot
clipping plus a 1e-7 s midpoint event root. Six merged-tree diagnostic outputs
reproduce the sealed author run byte-for-byte. A20 rail error is 3.2806 us,
max sampled position error 0.150254 mm; split-off under the new root policy
returns 113.6749 us, while the retained old binary reproduces 105.0140 us.
Earlier 2.401/8.08 us split estimates are superseded, not silently reinterpreted.
C02 is now **in_progress**: the current fixture clears the provisional reserve,
but approved budgets and broader state/attitude/regime coverage remain open.
Ordinary production WASM was rebuilt and exercised in Chromium under CSP;
its exact merged hash is recorded in
[coordinator evidence](../../execution-runs/RMP12-knot-split/COORDINATOR-EVIDENCE.json).
C04 now has an explicit two-case matched native/WASM experiment
([evidence](../../execution-runs/RMP12-knot-split/MATCHED-RUNTIME-EVIDENCE.json)):
non-singular fields meet the standing 1e-9 precision. Strict wind-3 Euler-display
parity fails at quaternion roundoff singularities under the existing rule;
failures are retained, not hidden. C04 stays **in_progress**, not PASS.
Old archives/engine hashes remain historical; mismatched-SHA fits are not
rewritten or implicitly reused.


## Required reading

Prior N1 checkpoint/result without rerunning unchanged study; core adaptive/event/telemetry/profile code, build-engine.mjs, actual engine identity/runInputs path, candidate method/support records.
Also read [control loop](../CONTROL-LOOP.md), [checks](../CHECKS.md) and
[decisions](../DECISIONS.md). Repository source paths above are reading targets,
not permission to open raw protected outcomes.

## Owner/files and frozen decisions

Author Sol/high for cross-file/numerical work; coordinator leases exact files
and repins base at dispatch. Independent scientific review for material model/
statistical choices. At most one allocated compute job in this lane.

Focused numerical harnesses/fixtures and documented configurations; no production tolerance/source law changes without justified separate review. Build artifact/identity verification is intentional, not accidental from pnpm scripts.

Macro timestep refinement is not adaptive convergence. Sampled peaks are not continuous bounds. Oracle/simulator/native parity is not measured physical accuracy. Preserve failed trials/domain aborts and exact artifact identity.

## Ordered subcommits / input-output contract

1. List changed-model questions and outputs: adaptive state tolerances, macro step, event root, quadrature, table/cache interpolation and peak extraction. Reuse prior evidence for unchanged paths.
2. Freeze bounded experiment inputs/support, configurations, comparison metrics and numerical budgets before running; choose qualified analytic/reference cases plus identified development inputs.
3. Run focused native comparisons, then exact production-WASM build/invoked-buffer verification for offered behavior. Distinguish local build success from executed artifact.
4. Analyze error floors/couplings/root/sample effects and independent references. Change defaults only if evidence justifies it and new configuration is reviewed.
5. Publish portable result/table/config/source hashes, exclusions/failures and budget disposition; feed remaining numerical uncertainty to RMP13.

Each implementation commit records effective inputs, typed outputs, identities,
support/qualification and error/null semantics before dependent consumers change.
API names for future modules are proposals until the coordinator accepts a
source-specific contract; do not fill missing measurements/schema by guessing.

## Acceptance checks

- **RMP12-C01 — Experiment integrity:** Input/config/model/source and error definitions frozen; all planned runs/failures reported, no selected favorable cases.
- **RMP12-C02 — Integrator/event:** State/attitude/root timing errors against independent reference/controlled refinement fit budgets in supported regimes; speculative errors preserved.
- **RMP12-C03 — Interpolation/peaks:** Geometry/table/cache/peak errors separated from time integration; adequate selected resolution supported by actual checks.
- **RMP12-C04 — Native/WASM:** Actual invoked bytes and schema match checked source; matched inputs/options yield declared precision agreement, not stale old WASM.
- **RMP12-C05 — Determinism:** Seeds/chunk partitions/cancellation maintain expected results and no partial cloud survives cancellation under new identities.
- **RMP12-C06 — Budget conclusion:** Numerical contributions are small enough for selected output reserves and uncertainty treatment; unknown budgets remain open, not a universal PASS.
- **RMP12-C07 — Default preservation:** Existing accepted legacy behavior/source identities retained; intentional changed tolerances documented with evidence and review.

## Negative/failure cases

Off-grid horizon, steep transonic/interpolation transition, rail/burnout root, near-apogee direction change outside support, small/large state scales, rejected adaptive trial, dense-output peak between macro samples.

## Commands and portable evidence

Bounded new harnesses with synthetic/eligible development inputs; core/engine and intentional native/WASM checks from CHECKS. Do not rerun N1 prepare/20-call study or flight scoring merely because a new session started.

Use templates/RESULT.md and EVIDENCE.json. Save base/commit/source/runtime hashes,
input/assumption records, commands/logs, per-check pass/fail/blocked disposition,
failed attempts, independent review and exact remaining scope. Keep large/raw/
restricted artifacts separately inventoried; do not claim they are in Git.

## Stop/escalation and successor

Absent reference/data or unresolved numerical error is a scoped blocker. More runs cannot justify a physical model; do not widen uncertainty after holdouts to hide numeric defects.

Successor: RMP13 numerical uncertainty input and RMP14 final frozen artifact/protocol.

## Ready-to-send assignment prompt

> Execute RMP12 in a pinned isolated worktree using this brief and its reading.
> Confirm concrete input/output/source contracts and exact file lease before edits.
> Deliver the ordered small increments, exercise every listed acceptance/failure
> case and return portable evidence plus limitations/review-ready commits. Preserve
> legacy behavior and no missing-data fabrication. Do not expand into unrelated
> science/DTO/default/release work, open new holdouts, push or contact outsiders.
> Stop only the blocked dependency and continue useful independent authorized work.
