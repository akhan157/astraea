# RMP13 — Grounded uncertainty and identifiable scoped calibration

## Purpose/status and prerequisites

Locally actionable provenance work is delivered (merge `b360c68`): C01, C03 and
C06 PASS. The unsupported per-class motor-impulse certification table was deleted
(not relabelled), the sampler contract now states independent draws and a declared
scenario scale, and the ensemble panel names the three sampled inputs, the fixed
remainder and that its percentages/radii are sample fractions rather than
probability or coverage; a fixed-request probe reproduced identical result-vector
digests. Remaining closure stays external: independently supported input
ranges/correlations, a defined development/scoring split with custody, and
approved budgets for probability meaning and the final freeze (owner/data
custodian plus statistical reviewer).

## Required reading

Proposed accuracy specification, source/eligibility ledger, calibration diagnosis/reviews; src/evidence/calibrationEligibility.ts and calibration.ts; application/dragCalibration/runInputs; ensemble worker/seed code.
Also read [control loop](../CONTROL-LOOP.md), [checks](../CHECKS.md) and
[decisions](../DECISIONS.md). Repository source paths above are reading targets,
not permission to open raw protected outcomes.

## Owner/files and frozen decisions

Author Sol/high for cross-file/numerical work; coordinator leases exact files
and repins base at dispatch. Independent scientific review for material model/
statistical choices. At most one allocated compute job in this lane.

Uncertainty/discrepancy/fit artifact schema and evaluator modules with explicit file leases, relevant UI/archives and statistical fixtures. No new holdout reads, universal percent targets or new physics fit by stealth.

Input, observation, model discrepancy and numerical uncertainty are distinct and may be correlated. A nominal manufacturer value is not a measured distribution. +/-1% sensitivity probes are not uncertainty estimates. Coast fits cannot establish powered correction or independent validation.

## Ordered subcommits / input-output contract

1. Build variable ledger: source, units, support, uncertainty family/range, confidence/measurement method, correlations and fixed-versus-estimated status.
2. Choose identifiable corrections/discrepancy conditional on output/regime, using development data only; diagnose confounding of impulse/mass/drag/weather/timebase.
3. Implement source-bound sampling/correlation and fit artifact/provenance, support checks and model/geometry/environment/filter/event selector invalidation.
4. Assess calibration residuals and predictive interval/region widths/coverage on development evidence with proper leakage/dependency controls.
5. Freeze final uncertainty/scoring choices before RMP14; expose missing uncertainty and failed/unsupported runs rather than displaying calibrated probability without evidence.

Each implementation commit records effective inputs, typed outputs, identities,
support/qualification and error/null semantics before dependent consumers change.
API names for future modules are proposals until the coordinator accepts a
source-specific contract; do not fill missing measurements/schema by guessing.

## Acceptance checks

- **RMP13-C01 — Input distributions:** Every assigned range/distribution/correlation has independent provenance or explicit scenario-only status; missing evidence stays unresolved.
- **RMP13-C02 — Identifiability:** Parameters/corrections have resolvable observation support; confounded fits are refused or constrained by justified independent information.
- **RMP13-C03 — Fit scope:** Model/geometry/source/environment/conditions/filter/event selection bound to artifact; incompatible changes mark it historical/inactive/stale.
- **RMP13-C04 — No leakage:** Development/scoring roles and splits enforced; no post-holdout offsets/variance tuning or double-counting derived sensor observations.
- **RMP13-C05 — Probability meaning:** Interval/footprint inclusion and useful width/area assessed together with source/vehicle dependence and finite-sample uncertainty.
- **RMP13-C06 — Failure handling:** Unsupported/failed runs remain denominator/ledger-visible under frozen rules; cancellation never returns stale partial results.
- **RMP13-C07 — Final freeze:** Budgets/model/discrepancy/sampling/metrics predeclared with final artifacts before unseen outcomes are authorized.

## Negative/failure cases

Same airframe repeated as independent vehicles, baro-derived velocity counted independently from baroaltitude, time shift to align peak, wrong-scale legacycalibration, extremely broad interval gaming coverage, missing weather correlation.

## Commands and portable evidence

Synthetic statistical/calibration/sampling fixtures and explicitly eligible development comparisons; targeted current tests. No automatic scoring commands. Use templates/decision-budget.json with null unresolved values until real agreement.

Use templates/RESULT.md and EVIDENCE.json. Save base/commit/source/runtime hashes,
input/assumption records, commands/logs, per-check pass/fail/blocked disposition,
failed attempts, independent review and exact remaining scope. Keep large/raw/
restricted artifacts separately inventoried; do not claim they are in Git.

## Stop/escalation and successor

An unidentifiable fit or absent physical distribution is an evidence blocker, not an invitation to choose convenient sigma. Owner/team acceptance budgets require recorded agreement before blind evaluation.

Successor: RMP14 controlled frozen scoring; RMP15/17 probability interpretation and usability.

## Ready-to-send assignment prompt

> Execute RMP13 in a pinned isolated worktree using this brief and its reading.
> Confirm concrete input/output/source contracts and exact file lease before edits.
> Deliver the ordered small increments, exercise every listed acceptance/failure
> case and return portable evidence plus limitations/review-ready commits. Preserve
> legacy behavior and no missing-data fabrication. Do not expand into unrelated
> science/DTO/default/release work, open new holdouts, push or contact outsiders.
> Stop only the blocked dependency and continue useful independent authorized work.
