# RMP10 — Powered stability, peak resolution and decision-output contracts

## Purpose/status and prerequisites

Partial. [RMP10a source/runtime records](../../execution-runs/RMP10-flight-model-history/RESULT.md)
accept a bounded sampled observer of the **existing legacy evaluator**, not a
future unified-provider interface or new law. Source6117ea1: actual committed
CG/C/J/CP/moments → strict wire/parser → Aero/SavedRuns → project1.8/actual trace
ZIP, including raw signed-zero retention, independently reviewed/tested. C01/C02/
C04/C06/C07 progress only, no PASS; C03/C05 still not_run. Full RMP01 unified
provider and RMP09 actual mechanics/guide/recovery remain closure prerequisites;
measurements/approved budgets and structural/peak/event work are not waived.
Early source/report engineering used a prospective source-specific contract,
unchanged forces/solver/defaults/keys and original source refusals. No candidate
activation or physical/decision/release acceptance. See [evidence](../../execution-runs/RMP10-flight-model-history/EVIDENCE.json).

[RMP10b](../../execution-runs/RMP10-recovery-readouts/RESULT.md), source add2c70,
corrects recorded apogee-to-touchdown interval (not delayed drogue marker) and
withholds invalid landing deltas on either non-nominal/timeout record. Missing/
inconsistent clocks explicit unavailable; shared reasons. Rework rereview ACCEPT,
79affected tests/typecheck/Vite3 pass; no native/physics/clock/schema/default change.
C04 progress is interval semantics ONLY, not guide/section/measurement closure;
other-consumer duplicate-interval/dictionary audit OPEN. [Records](../../execution-runs/RMP10-recovery-readouts/EVIDENCE.json).

[RMP10c](../../execution-runs/RMP10-geometry-cp-support/RESULT.md), source
49b07ad plus WIP ancestor 27c1b05: geometry CP/margin/verdict withheld for
unsupported/ill-conditioned slopes, including the native equality fallback.
Copilot Unknown/reason and native coefficient-preview baseline gate accepted
after owner-authorized resume of two failed consumer-coverage reviews. Actual
build proves TS transonic CP functions absent from production. Shipped WASM
unchanged. Final affected 73 pass, tsc/Vite and built Chromium copilot/coefficients
smoke pass. C02 remains in_progress: Mach-specific, unified-provider and full
force/moment/free-couple semantics unqualified. No acceptance PASS.

[Qualified archive correction](../../execution-runs/RMP10-qualified-output-archive/RESULT.md),
source `f082b67`, reviewed in `6e5cae4`, integrated after built-browser proof:
off-nominal flag retained; canonical output dictionary/qualification/availability
archived in schema 1.11; saved unit conversions/deltas share live presentation.
Strict units and shared timeout/non-nominal availability guard prevent false
landing values/deltas; old archives stay historical. Real two-flight 9,584,081-byte
file save/open/save is byte-exact; actual three-flight ZIP values/flag/input key
agree with the trace under production CSP. Native save/open/export budget is
64 MiB; foreign imports retain 8 MiB, with safe refusal and no sample truncation.
Bounded software increment ACCEPT; C06 stays in progress for broader
provider/output/rule/qualification scope.

## Required reading

Mission/decision matrix, proposed accuracy spec, output-contract audit; core telemetry.rs/six_dof.rs, src/aero/stabilityBreakdown.ts, finStructure.ts and finFlutter.ts; current Aero/Flight/Recovery UI.
Also read [control loop](../CONTROL-LOOP.md), [checks](../CHECKS.md) and
[decisions](../DECISIONS.md). Repository source paths above are reading targets,
not permission to open raw protected outcomes.

## Owner/files and frozen decisions

Author Sol/high for cross-file/numerical work; coordinator leases exact files
and repins base at dispatch. Independent scientific review for material model/
statistical choices. At most one allocated compute job in this lane.

Output adapters/types, core peak/event/derivative sampling and focused UI/export paths under leases. New method/source record. Do not change physics or competition thresholds inside display formatting.

Static geometry margin is not powered/dynamic stability. CP derivative/finite-force equivalent point/restoring measure distinct. Sampled max-Q stays sampled until a justified peak method exists. Structural/flutter estimates require material/joint evidence for structural decisions.

## Ordered subcommits / input-output contract

1. Create output dictionary: formula, event/time/datum, units, source, support, qualification, resolution and downstream rule/decision.
2. Produce authoritative time/history data from actual provider plus changing CG; preserve null/unavailable CP and stable/unstable restoring signs.
3. Specify and implement peak/event extraction with error/resolution policy separate from display decimation/rounding.
4. Propagate definitions/limits consistently through readouts, plots, archives and exports; version applicable rule references.
5. Run independent numerical peak/event/translation tests and relevant measured/structural review before enabling decision claims.

Each implementation commit records effective inputs, typed outputs, identities,
support/qualification and error/null semantics before dependent consumers change.
API names for future modules are proposals until the coordinator accepts a
source-specific contract; do not fill missing measurements/schema by guessing.

## Acceptance checks

- **RMP10-C01 — Powered history:** CG/coeff/margin reference same state/time/model; pad-only or geometry-only output not labeled through-burnout qualification.
- **RMP10-C02 — CP semantics:** Unavailable/ill-conditioned ratio retains force/moment/C/J and reason; no stable classification from mere CP existence.
- **RMP10-C03 — Peak evidence:** Sample retention and independent refinement/analytic cases support claimed resolution; display peak not called continuous bound without proof.
- **RMP10-C04 — Event agreement:** Rail speed/recovery energy/events use the correct button/contact/section definitions and units.
- **RMP10-C05 — Structural scope:** Material geometry/attachment assumptions and comparison evidence bound stiffness/flutter claims; unsupported transient/shock unavailable.
- **RMP10-C06 — UI/export consistency:** Same data/model/timebase across readouts/plots/export, honest units/precision/qualification and applicable rule revision.
- **RMP10-C07 — Regression:** Decimation/cancellation/stale-result cases do not lose selected event/peak context or resurrect old model results.

## Negative/failure cases

Near-zero CN, large cancellation, between-sample narrow q peak, event exactly at step boundary, simultaneous recovery events, sensor aliasing, different CP reference length, unsupported composite/joint assumptions.

## Commands and portable evidence

Focused core analytic peak/event/telemetry tests plus touched TS unit tests and built-browser readout/export journey. Physical validation needs qualified instrumentation bandwidth/material evidence; no arbitrary universal percent tolerance.

Use templates/RESULT.md and EVIDENCE.json. Save base/commit/source/runtime hashes,
input/assumption records, commands/logs, per-check pass/fail/blocked disposition,
failed attempts, independent review and exact remaining scope. Keep large/raw/
restricted artifacts separately inventoried; do not claim they are in Git.

## Stop/escalation and successor

Output accuracy unknown remains unknown even if the vehicle margin appears large. Scope optional engineering estimates separately from primary trajectory claims.

Successor: RMP12 numerical output budgets, RMP15 product journeys, RMP14/17 decision evidence.

## Ready-to-send assignment prompt

> Execute RMP10 in a pinned isolated worktree using this brief and its reading.
> Confirm concrete input/output/source contracts and exact file lease before edits.
> Deliver the ordered small increments, exercise every listed acceptance/failure
> case and return portable evidence plus limitations/review-ready commits. Preserve
> legacy behavior and no missing-data fabrication. Do not expand into unrelated
> science/DTO/default/release work, open new holdouts, push or contact outsiders.
> Stop only the blocked dependency and continue useful independent authorized work.
