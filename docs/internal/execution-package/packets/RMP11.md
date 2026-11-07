# RMP11 — Comparator normalization and bounded common-input comparisons

## Purpose/status

EARLY mapping can start; execution/closure depends on candidate/provider and available lawful comparator runtime.
This is a future dispatch brief. Current session is packaging only: no engineering, builds, simulations, outcome reads or automation restart.

## Prerequisites (closure versus early work)

- Use C1/C2/C3 distinctions now to define exact comparison question; do not start by ranking tools.
- Closure requires RMP01 candidate plus applicable RMP03/RMP06 input/source support and matched event/output contracts.
- Actual pinned runtime, lawful permitted fixtures and necessary nozzle/environment inputs must exist; no runtime/download assumption.

## Required reading

- STOP/migration handoff (private coordination notes)
- [Full roadmap](../../roadmap-to-collegiate-1.0-2026-10-26.md)
- Model routing (private coordination notes)
- [C1–C5 contract](../../accuracy-program/comparison-input-contract-v0.1.md)
- [Method/evidence limits](../../accuracy-program/reference-methods-and-evidence.md)
- [Pinned API/license findings](../../accuracy-program/execution-2026-10-25/alternative-paths.md)
- [Comparator sequence](../../accuracy-program/accuracy-execution-plan-2026-10-25.md)
- [Retained bounded numerical work](../../accuracy-program/diagnostics/N1-numerical-controls-2026-10-26.md)

## Files owned/prohibited/shared leases

- CREATE `scripts/comparison/` and `docs/internal/execution-package/evidence/RMP11/` for isolated input adapters and public synthetic records after dispatch.
- Existing `src/validation/development/` and source-specific engine adapters require shared leases; do not rewrite exposed flight protocols.
- Prohibited: engine replacement/default changes, vendor source copying, raw holdout reads, installation/download/service deployment without authority.
- All proposed CREATE paths require dispatch-time existence/ownership check; preserve unrelated dirty work and negotiate shared edits sequentially.

## Frozen decisions

- RocketPy 1.13.0 is first trajectory comparator; OpenRocket stable 24.12 is separate geometry/aero comparator, subject to actual availability.
- RASAero needs supported Windows/.NET runtime and lawful actual exports; powered comparison needs justified nozzle and pressure/thrust mapping.
- Same supplied-aero agreement is conditional numerical/model-contract evidence; it does not validate native aerodynamics or physical truth.
- GenericSurface has z-forward versus Astraea y-forward conventions and cn yaw moment; check one force application/datum shift and avoid double drag.

## Ordered implementation/review substeps and commit boundaries

1. Commit 1: declare C1 coefficient, C2 supplied-aero or C3 native-aero experiment with selected outputs and exact allowed interpretations.
2. Pin executable/library/license/tool/source identities and local availability; capture missing runtime as blocker instead of network acquisition.
3. Commit 2: explicit normalization ledger for geometry, motor, mass/inertia/depletion, atmosphere/gravity, rail and recovery/event semantics.
4. Implement only isolated adapters needed by first synthetic case; separately preserve native and supplied/calibrated source identities.
5. Commit 3: synthetic signed-force/pure-couple/analytic cases establish frame, scale, datum and event alignment before development inputs.
6. Run matched supplied inputs only when every relevant convention is representable; otherwise restrict question or mark blocked.
7. Commit 4: residual histories and event/peak tables with explanation of each asymmetry and numerical settings.
8. Independent reviewer checks conventions and allowed inference; hand numerical questions to RMP12 and physical questions to RMP08.

## Input/output contracts and source fields

- Input: experiment ID/mode, pinned source/runtime/OS hash, immutable input hashes, complete options and reproducible commands.
- Normalize S/L/axes/datum, powered/off curve provenance, Re/roughness/base/nozzle, inertia datum/depletion and environment/pressure definitions.
- Normalize ignition/liftoff/rail freedom/final release, event roots, canopy triggers/inflation, termination and sample/peak extraction.
- Output: units/datum/timebase-specific histories, event values and signed residuals, unsupported fields/reasons and retained failures.
- Clock offset must be independently defined; do not align apogee to judge time-to-apogee.

## Acceptance checks

| ID | Mechanism | Pass condition | Evidence |
| --- | --- | --- | --- |
| RMP11-C01 (Representability) | audit every comparison-contract field in both runtimes | asymmetries explicit; blocked if they defeat selected question | field mapping ledger |
| RMP11-C02 (Wrench mapping) | signed vector/pure couple/reference/datum fixtures | dimensional forces/moments invariant with exactly one shift/application | algebra and source review |
| RMP11-C03 (Synthetic trajectory) | run available analytic/common-input fixture | expected behavior and event definitions match declared question | runtime/settings/results hashes |
| RMP11-C04 (Attribution) | separate supplied/native/calibrated runs | no supplied agreement presented as native/empirical accuracy | mode-labeled report |
| RMP11-C05 (Residual honesty) | audit clocks/peaks/failed runs | no outcome-chosen alignment or hidden unsupported case | complete residual/exclusion table |

## Negative/failure cases

- Unknown nozzle area cannot be set to zero to obtain RASAero agreement; unsupported model input cannot silently disappear.
- Newer OpenRocket guide features are not assumed in stable24.12; RocketPy nonzero scalar GenericSurface requires verified API handling.

## Exact permitted checks or required prerequisites

- Future prerequisite: pinned runtime and dependencies are already available with permission, synthetic fixtures/source hashes frozen and domain compatible.
- No universal executable comparison command exists yet; author and review an exact adapter command after runtime discovery.
- Do not run `pnpm benchmark:flight` casually: it is an existing development lane with its own data/exposure scope, not this new common-input protocol.
- Retain N1 completed work; repeat only changed candidate cases justified by RMP12 numerical questions.
- Commands above are future resumed-work checks unless explicitly read-only packaging checks; this package records no new executions.

## Evidence to save

- Save runtime/license inventory, complete normalized-input ledger, exact commands and all output identities.
- Save synthetic invariance/event evidence, residuals, source dependencies and reviewer disposition with bounded conclusions.
- Record pinned base, owner/model/effort, exact commands/exit status, source/input/artifact hashes, review disposition, limitations and next action.
- Historical external logs/binaries may be unavailable; identify missing artifacts honestly and never count retained hashes as fresh execution.

## Escalation/stop decisions

- Stop if comparison requires hidden defaults, unavailable runtime or ambiguous force/datum conventions; provide smallest missing-input request locally.
- A larger discrepancy is an investigation ticket, not permission to tune shared inputs against measurements.
- Preserve defaults/main and stopped automation; no external contact, holdout access, paid/remote operation or publication is implied.

## Successor/ready-made agent assignment prompt

RMP12 consumes bounded numerical discrepancies; RMP13 tracks model dependencies; RMP18 uses accurately scoped comparator claims.

> Normalize one bounded synthetic/common-input comparator case using C1/C2/C3 contract and pinned available runtimes. Own isolated adapters, preserve every convention/asymmetry, test wrench/event mapping and distinguish numerical agreement from empirical aero validation. No default replacement or unseen outcomes.
> Before work pin current integration base, inspect dirty state/active runs, name exact leases and resource budget, and retain completed evidence. Independent material-science/convention review is required where applicable.
