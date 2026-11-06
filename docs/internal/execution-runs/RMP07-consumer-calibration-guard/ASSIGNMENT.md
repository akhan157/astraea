# RMP07f — shared dispatch calibration-binding guard

- Exact dispatch base: `b3a4aef50d18d3124070ed1b6b8e9a6d8ab78f51`, existing
  execute-rmp01-package-c80e7d3 / furry-fish branch/worktree. Preserve .pi/.
- Owner: coordinator/author, current environment openai/gpt-6.1-sol/high.
  Fresh independent read-only software review after checks; record actual route.
  No other active source/review owner observed; RMP12c lane closed/released.
- Acceptance scope: bounded RMP07-C03/C04 non-leak guard at the existing shared
  flight/Monte Carlo adapter seam; not full candidate-consumer acceptance.

## Observed seam and design

The console already filters foreign-bound calibrations with activeDragCalibration.
The exported adapter's assertScaleMatchesCalibration, called before nominal
flight and before ensemble chunks, currently checks only numeric scale equality.
A direct caller can pass a calibration bound to a foreign model plus its matching
scale and reach the legacy bridge. Guard the shared seam with the existing
calibrationBindingStatus against the only executable app contract (legacy).
Foreign model/environment/mechanics/policy/schema bindings must refuse before
any bridge call/progress callback. Never silently strip/refit/activate them.

Unbound historical calibrations and explicit matching legacy bindings preserve
current behavior; no calibration preserves current behavior; scale mismatch
still refuses. Artifacts remain caller/project history and are not mutated.
No new model selection, identity/key/schema/physics/default/runtime changes.

## Exclusive writable files

- src/console/data/adapter.ts (existing guard/import only).
- CREATE src/console/data/calibrationBinding.test.ts.
- This run directory (ASSIGNMENT, later RESULT/REVIEW/EVIDENCE), external evidence
  under evidence-rmp07-consumer-calibration-guard/, affected package/checkpoint
  records after review. No other product files without a recorded scope reason.

Read-only: application calibration/model parser (already accepted), Rust/native
checkers/binaries, production WASM, historical run evidence, protected outcomes.
Read RMP07 brief/control loop/checks/decisions and the current shared guard,
flight/ensemble call sites, binding helper, existing adapter identity fixtures.

## Ordered verification/integration

1. Add focused direct-call negative tests for each of the five binding keys,
   both nominal flight and ensemble; assert no engine invocation or progress.
   Demonstrate the regression before changing the guard. Boundary fixtures may
   isolate binding fields; do not claim storage/provenance eligibility from them.
2. Add the shared existing-policy guard. Positive tests for no artifact,
   historical unbound fit and exact legacy binding; unchanged scale mismatch and
   caller artifacts. Test actual bridge argument capture with mocked engine
   results (software dispatch proof, not executed WASM/physics qualification).
3. Run focused and affected adapter/console/calibration/application suites,
   TypeScript, Vite build with existing identified WASM (no lifecycle rebuild).
   Independent read-only review; minimal rework; local source/evidence commit.
4. Record scoped C03/C04 progress only, preserving parent partial/candidate
   prerequisites. Refresh only packageFilesSha256; validate package separately.

Resources: check free -h before heavy work; ≤2 test/compiler workers; one heavy
job; serial reviewers. No browser required for this direct-call guard; existing
console filtering/persistence/browser evidence remains historical, not rerun or
new qualification. No push, release/deploy, outreach, paid provisioning,
protected outcomes, default activation or automation restart.
