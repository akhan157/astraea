# RMP07 — Provider identity, saved-run migration and experimental app exposure

## Purpose/status and prerequisites

Remaining work, not implemented by this package. RMP01 native provider, RMP03 import contracts and RMP06 source/environment composition for closure. Identity/schema design can start earlier against versioned placeholders without claiming a working runtime.

[RMP07g](../../execution-runs/RMP07-built-runtime/RESULT.md): built-site receipt — dist WASM =
served bytes = recorded result identity; asset-binding rule in CHECKS.md; review ACCEPT;
**RMP07-C08 PASS** for the browser build. [Evidence](../../execution-runs/RMP07-built-runtime/EVIDENCE.json).

Current bounded increment: [candidate runtime review](../../execution-runs/RMP07-candidate-runtime/REVIEW.md),
source `066960f`, merged `61367757`, and the [candidate application
acceptance](../../execution-runs/RMP07-candidate-app/ACCEPTANCE.md), merged
`6043a15` from `9aa3584`. Explicit `simulate_candidate` executes the existing
prescribed-CA0 bounded trajectory/query/curves on native and WASM, report
schemas 2.0.0. The Console now offers a real opt-in candidate selection with
schema `1.12.0`, v3 exact-dispatch archives, strict result parsing, one claimed
admission with cancellation, selected-vs-recorded consumer attribution, a
detached frozen capture and exact canonical freshness. Three review rounds
retained and closed real counterexamples (accepted contradictory archives,
duplicate dispatch during preparation, palette-refusal admission release,
legacy readouts under candidate selection, aliasing/freeze, FNV-only freshness,
an ungated empty schema step).

Dispositions: **C01, C03, C05, C06, C07, C08 PASS** for that scope; C02 retained.
C04 and RMP15-C01 remain in progress until the E1 profile provider is offered:
`rmp06-runtime-profile` must first deliver the native/WASM profile envelope, the
versioned curve-N/A contract, the reference-Mach coefficient reconciliation and
bounded sample/report retention, then a sequential app migration proves profile
dispatch identity. Candidate ensembles, arbitrary user-state queries and the
local all-stage axial source stay refused by contract; no legacy substitution.

Current C08 receipt: this build's served/executed WASM
`13da44d5a70af2bd4e8feee082f49277a4ce92e07fed97743d4d3aedf0022328`
(1,827,128 bytes), site asset `ba7be64f…`. The author worktree's different
root-dependent bytes remain that worktree's history.


## Required reading

P0 section6; delivery-review-2026-10-25-repro.md; src/application/{runInputs,runCases,caseResolver,dragCalibration}.ts; src/formats/projectJson.ts and projectStorage.ts; src/state/projectIo.ts; src/engine/{worker.ts} and bridge/source identity paths.
Also read [control loop](../CONTROL-LOOP.md), [checks](../CHECKS.md) and
[decisions](../DECISIONS.md). Repository source paths above are reading targets,
not permission to open raw protected outcomes.

## Owner/files and frozen decisions

Author Sol/high for cross-file/numerical work; coordinator leases exact files
and repins base at dispatch. Independent scientific review for material model/
statistical choices. At most one allocated compute job in this lane.

One lease for project schema/type changes and new identity/model-selection modules; lease existing application/runInputs/runCases/resolver/calibration and formats/projectJson tests. Runtime engine lib/models/commands and worker/bridge integration are sequential owned subcommits. No physical equation changes.

Absent provider remains legacy. Experimental opt-in can precede empirical qualification with UNKNOWN/unqualified status; default switch requires applicable RMP08–14 and release review. Existing provenance/archive machinery is extended, not replaced. Prior calibration never transfers automatically.

## Ordered subcommits / input-output contract

1. Inventory current schema1.6/run archive/actual-WASM identity boundaries and map new effective model/composition/source fields to one versioned content identity contract.
2. Define deterministic canonicalization (numeric representation, units, array order, null/missing, version, source content) and dependency graph; retain caller labels separately from computed hashes.
3. Implement identity/cache invalidation and migration retaining original documents/results. Unsupported legacy summaries stay unreconstructable; no invented historical inputs.
4. Add explicit candidate selection in a reviewed opt-in path across commands/queries/plots/ensembles; bind same provider and effective environment everywhere.
5. Implement stale/inactive calibration handling and difference reports, then UI/save/reopen/cancellation journeys against intentionally rebuilt exact WASM. Review default policy separately.

Each implementation commit records effective inputs, typed outputs, identities,
support/qualification and error/null semantics before dependent consumers change.
API names for future modules are proposals until the coordinator accepts a
source-specific contract; do not fill missing measurements/schema by guessing.

## Acceptance checks

- **RMP07-C01 — Canonical identity:** Same effective inputs yield same identity; each relevant geometry/coeff/table/environment/mechanics/policy/version change affects the intended key; source label alone is not sufficient.
- **RMP07-C02 — Old project behavior:** Open/save/reopen old/no-provider documents preserves legacy provider/inputs/results. Migration does not silently regenerate historical runs.
- **RMP07-C03 — Calibration:** Prior artifact retained as historical and inactive/stale on incompatible model/source/conditions; scale cannot leak through existing runInputs path.
- **RMP07-C04 — Consumer consistency:** Command/plot/load query/ensemble workers use identical resolved provider/input identity and actual invoked WASM buffer.
- **RMP07-C05 — Persistence boundaries:** Undo/redo, motor edits, two-tab stale saves, pending import/simulation and save failure preserve the document and correct dirty state.
- **RMP07-C06 — Migration failure:** Unknown schema/provider/source or corrupt/missing required provenance fails without replacement/loss; recovery path tested.
- **RMP07-C07 — App statuses:** Computational/domain/quantity qualification visible; missing rate/moment/source does not become green PASS or zero.
- **RMP07-C08 — Exact built runtime:** Newly offered build hashes match actual executed buffer; old frontend evidence is not claimed against a changed asset.

## Negative/failure cases

Same label/different content, reordered JSON, explicit zero versus missing, float/nonfinite values, stale table after geometry edit, changing weather during worker execution, undo restoring incompatible calibration, cross-tab save conflict.

## Commands and portable evidence

Focused tests: runInputs/runCases/caseResolver/dragCalibration, projectJson/projectStorage/projectIo and worker identity tests actually changed. Then TS check/build and built-browser journeys. See CHECKS for node/pnpm build side effects and safe command boundaries.

Use templates/RESULT.md and EVIDENCE.json. Save base/commit/source/runtime hashes,
input/assumption records, commands/logs, per-check pass/fail/blocked disposition,
failed attempts, independent review and exact remaining scope. Keep large/raw/
restricted artifacts separately inventoried; do not claim they are in Git.

## Stop/escalation and successor

Do not weaken compatibility or invent old inputs to simplify a migration. A changed default/provider promise or accepted scientific meaning needs explicit review; permission for routine reversible engineering already exists.

Successor: RMP12 production-WASM numerical check, RMP15 complete journeys and RMP14 final frozen predictions.

## Ready-to-send assignment prompt

> Execute RMP07 in a pinned isolated worktree using this brief and its reading.
> Confirm concrete input/output/source contracts and exact file lease before edits.
> Deliver the ordered small increments, exercise every listed acceptance/failure
> case and return portable evidence plus limitations/review-ready commits. Preserve
> legacy behavior and no missing-data fabrication. Do not expand into unrelated
> science/DTO/default/release work, open new holdouts, push or contact outsiders.
> Stop only the blocked dependency and continue useful independent authorized work.
