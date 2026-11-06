# RMP08 — Required geometry, Mach/incidence and rate physics coverage

## Purpose/status and prerequisites

Partial: bounded existing SB1 equation verification (C02), explicitly selected inherited dimensional-rate semantics (C05) and typed geometry refusal (C06) are independently accepted at `39d944c`. See [result](../../execution-runs/RMP08-equations-rates/RESULT.md) and [evidence](../../execution-runs/RMP08-equations-rates/EVIDENCE.json). C07 remains in progress; source match, joint measured force/moment, regime extension and broader independent acceptance remain open. No empirical/dynamic or transonic qualification. RMP01 actual native path and RMP02 eligible coefficient/configuration ledger remain prerequisites; actual RMP05 mission/decision records govern required expansion, not convenient subsonic cases alone.

## Required reading

P0, A1b reference eligibility, execution-2026-10-25/model-path.md and data-path-transonic.md; actual core aero_coefficients/aero_profiles and supplied_aero interfaces; packet RMP02.
Also read [control loop](../CONTROL-LOOP.md), [checks](../CHECKS.md) and
[decisions](../DECISIONS.md). Repository source paths above are reading targets,
not permission to open raw protected outcomes.

## Owner/files and frozen decisions

Author Sol/high for cross-file/numerical work; coordinator leases exact files
and repins base at dispatch. Independent scientific review for material model/
statistical choices. At most one allocated compute job in this lane.

Separate new source-defined model/geometry/rate modules and development fixtures; material shared core/provider changes require leases. No isolated patch to legacy aero prefactor/CP law without whole-model review. No vendor/GPL source copying into runtime.

Force and independent moment must be assessed together. Continuous-looking interpolation is not transonic qualification. Static derivative CP, finite-force station and dynamics are different quantities. Missing rates do not mean zero damping. Native or supplied routes may cover different reviewed regimes.

## Ordered subcommits / input-output contract

1. Write exact coverage gaps against mission outputs: geometry, Mach/Re/incidence/roll/power/rates and relevant interactions. Map every gap to eligible source data or explicit missing evidence.
2. Compare bounded alternatives (published native engineering law, configuration-specific supplied coefficients, targeted CFD for disputed terms). Choose by inspectable applicability and evidence, not apogee fit.
3. Transcribe/source-map equations and symbols independently; define domain/interpolation/transition/error policies, limiting cases and independent-moment representation.
4. Implement one chosen bounded expansion, run force/moment development comparisons including extraction uncertainty and failures, then independent scientific review.
5. Integrate only accepted support; retain unsupported conditions. Record qualification by quantity/regime and reopen thresholds if source/geometry changes.

Each implementation commit records effective inputs, typed outputs, identities,
support/qualification and error/null semantics before dependent consumers change.
API names for future modules are proposals until the coordinator accepts a
source-specific contract; do not fill missing measurements/schema by guessing.

## Acceptance checks

- **RMP08-C01 — Source match:** Geometry/features/axes/refs/Re/roll/power/base conventions fit actual source; substitutions disclosed with uncertainty, not called exact.
- **RMP08-C02 — Equation verification:** Units, signs, references, symbol definitions and limits independently checked; analytic component/symmetry/pure-couple cases pass.
- **RMP08-C03 — Joint force/moment:** CN/CA/Cm trends and residuals assessed together over stated conditions with source uncertainty; CP-only pass rejected.
- **RMP08-C04 — Regime transitions:** Any blend is source-justified and bounded; unsupported gaps remain unsupported; no smoothing across absent transonic evidence.
- **RMP08-C05 — Rates:** Derivative ordering/length/factor/velocity point and static-subtracted rate definition explicit; pure couples and source normalization preserved.
- **RMP08-C06 — Geometry refusal:** Multiple/unsupported fin sets, unknown profiles, attachments and numerical nonconvergence reject without mutating a project.
- **RMP08-C07 — Development limits:** Failed/excluded points and numerical budgets retained; no post-holdout parameter selection or apogee-only correction.
- **RMP08-C08 — Independent acceptance:** Author-independent material scientific review accepts selected scope before default/primary claim or extension of qualification.

## Negative/failure cases

Normal-force cancellation, near-zero denominator, finite-angle free couple, roll cross-coupling, table gap, source base mismatch, beyond-Mach endpoint, unknown finite-tip geometry, state outside rate normalization domain.

## Commands and portable evidence

Analytic/core/provider tests and predeclared eligible coefficient development comparisons; targeted CFD only with actual tools/mesh/boundary/convergence/source review. No new flight scoring or broad source-search rerun without a concrete missing question.

Use templates/RESULT.md and EVIDENCE.json. Save base/commit/source/runtime hashes,
input/assumption records, commands/logs, per-check pass/fail/blocked disposition,
failed attempts, independent review and exact remaining scope. Keep large/raw/
restricted artifacts separately inventoried; do not claim they are in Git.

## Stop/escalation and successor

If relevant measurements/tools unavailable, freeze the gap and continue another packet. Do not shrink collegiate mission scope or claim imported data validates native generation.

Successor: RMP09 claim-required mechanics/recovery, RMP12 candidate numerical budgets, RMP13 development discrepancy.

## Ready-to-send assignment prompt

> Execute RMP08 in a pinned isolated worktree using this brief and its reading.
> Confirm concrete input/output/source contracts and exact file lease before edits.
> Deliver the ordered small increments, exercise every listed acceptance/failure
> case and return portable evidence plus limitations/review-ready commits. Preserve
> legacy behavior and no missing-data fabrication. Do not expand into unrelated
> science/DTO/default/release work, open new holdouts, push or contact outsiders.
> Stop only the blocked dependency and continue useful independent authorized work.
