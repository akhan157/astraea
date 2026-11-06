# RMP01 / A1d-2 — actual native candidate trajectory, load query and curves

## Purpose/status and prerequisites

NEXT ENGINEERING PACKET. Ready for bounded native implementation on the completed
migration branch; candidate WIP is incomplete/unreviewed. Native-only means no
GUI/project/command selection or default activation. Dependencies from prior work
are satisfied: core static equation, real DTO/profile adapter and private driver.
Physical flight qualification remains open after this packet passes.

Read [STATE](../STATE.md), [WIP recovery](../WIP-RECOVERY.md),
[INTERFACES](../INTERFACES.md), [A1d design](../../accuracy-program/diagnostics/A1d-provider-integration-design-2026-10-26.md),
[P0](../../accuracy-program/first-batch-2026-10-26/P0-contract.md),
[latest review](../../accuracy-program/diagnostics/E1b-A1d1-integration-review-2026-10-26.md).

## Owner/files/resource lease

Author Sol/high; coordinator integrates; independent scientific reviewer for the
static/rate/recovery composition (Astra/high when needed by scientific difficulty).
One compute job in this lane, isolated Cargo target/evidence path; adjust to new
host capacity. No subdelegation without coordinator allocation.

Allowed: core `six_dof.rs` reviewed driver bridge only, `lib.rs` module registration,
new `flight_provider.rs`; engine new native helper/example/test/fixture and module
registration if necessary. Add an A1d2 method/source/limits note. Coordinate any
shared core/lib ownership before edit. Source locations are repository-relative.

Read-only: old core `aero.rs`, `aero_coefficients.rs`, engine `models.rs` and
`commands.rs`. No frontend/project schema/dispatch/WASM asset/desktop/config changes.
If a stronger refactor becomes essential, stop that part and propose exact scope,
parity evidence and reviewer before broad edits. Do not duplicate the complete RHS.

## Frozen decisions and first result shape

Use one immutable prepared object and core `evaluate_static` for trajectory, query
and curve sampler. Real synthetic FrontendVehicle -> existing adapter; explicit
mechanical carrier crosschecked against D/length and identified prescribed CA0.
No old stability or drag-table CP guard as prerequisite. Exact semantics and
inherited dimensional rate expressions are in INTERFACES, not left to guessing.
A partial horizon returns separate experimental data, never fake landing/PASS.
No content-hash/cache qualification is implied by caller source labels.

## Ordered subcommits

1. Record pinned base/lease and the WIP reuse-or-clean choice. Inspect actual source
   before changing visibility. Define typed PreparedProvider/query/composition/
   diagnostics/error contracts and immutable provenance. Review the contract.
2. Implement actual provider query using core static evaluator, independent CG
   moment translation and named rate composition; validate mechanical/motor/
   source bounds. Test query semantics before connecting the driver.
3. Add a narrow shared-driver bridge and candidate-only horizon/committed-sample
   handling. Retain old public wrapper/default operation/result semantics. Prove
   exact time/state at off-grid stop; propagate all stage/refine failures.
4. Implement a native helper/example taking actual DTO adapter output, explicit
   mechanical/axial provenance, and producing a bounded synthetic ascent plus
   plot-ready/query samples from the same prepared provider. Do not call it an
   as-flown/source-qualified rocket. No unused trait-only completion.
5. Test context/event/recovery/support boundaries and legacy preservation. Write
   source equations/identity/limits/prediction-delta evidence. Obtain independent
   physical review, rework precisely, then coordinator integrated checks.

## Acceptance matrix (all mandatory for this bounded increment)

| ID | Mechanism and pass condition | Evidence |
| --- | --- | --- |
| RMP01-C01 |Real DTO->adapter->prepared object actually drives a finite native ascent, query and curve samples |Input/provenance, executable result, source hashes |
| RMP01-C02 |Same state/reference produces same static coefficients/CG loads in all three consumers |Focused native integration test; no second law |
| RMP01-C03 |Poison unused legacy slope/CP/drag carriers; candidate does not consult their guards/defaults |Native failure-path test; explicit mechanical bounds still checked |
| RMP01-C04 |Full off-axis moment/datum/reference invariance and a synthetic independent pure couple with C0/null CP survive |Core analytic fixture; label pure-couple assembly test if SB1 supported geometry cannot produce C0 |
| RMP01-C05 |Signed pitch/roll/yaw rate couples use recorded dimensional lengths and signs; static diagnostics remain static |Analytic native tests and independent equation review |
| RMP01-C06 |V0/omega0 zero loads with nullable flow; V0/nonzero omega refuses; nonfinite/invalid mechanics refuse before assertions |Boundary tests with reasons, no JSON NaN/null substitution |
| RMP01-C07 |M.8, incidence>5deg, reverse/lateral flow, unsupported geometry/cant and drag scale!=1 fail at every applicable stage |Query + actual driver error injection/fixture; rail/negligible forces give no waiver |
| RMP01-C08 |Live canopy bypasses airframe, labels coefficients N/A, retains declared canopy/rate model; no free-flight fallback |Direct branch/event tests, correct flags/order |
| RMP01-C09 |Off-grid/time0/short/exact-event horizons have matching final committed time/state; no planned query beyond stop |Driver clock/context trace and targeted tests |
| RMP01-C10 |Time limit has no landing/final-apogee/PASS fabrication; completed touchdown has actual event/landing evidence |Separate result schema tests; prefix quantities explicitly labeled |
| RMP01-C11 |Rejected adaptive trial, burnout/root/macro/rail/touchdown error propagates with model/phase/time/state and no fallback |Actual shared-driver path tests; reuse A1d1 coverage without rewriting integrator |
| RMP01-C12 |New candidate never transfers historical calibration; explicit source retained, incompatible scale refused |Native input/result provenance tests |
| RMP01-C13 |Existing legacy source/outputs remain compatible; changed primitives independently justified if extraction necessary |Relevant core/engine parity, source comparison, complete synthetic snapshot when warranted |
| RMP01-C14 |Independent reviewer accepts source math/units/references/rates/support/result semantics; limitations retained |Signed review disposition and resolved findings |

## Negative/failure cases

Boundary cases include dt not dividing horizon, initial crosswind outside support,
missing motor context, inconsistent carrier D/length, malformed finite references,
source identity omissions, canopy with unsupported environment and a domain failure
on a speculative path whose committed prefix was otherwise in support.

## Commands and evidence

At actual implementation: core `cargo test --offline --manifest-path
crates/astraea-core/Cargo.toml`; engine `cargo test --offline --locked
--manifest-path crates/astraea-engine/Cargo.toml --all-targets`, with one build job.
Use focused new test filters first, then integrated retained suites. Offline cache
absence is a setup issue; never claim tests ran. See CHECKS for portable commands.
Build/run the new native example only when it exists, in the isolated target; its
synthetic input and output/hash are required. No scoring commands/holdout access.

Save assignment/base, source hashes, request/composition, raw example outputs,
focused/full logs, before/after limits/deltas, test IDs, failures and independent
review in `<repo>/docs/internal/execution-runs/<run-id>/` (small portable summaries)
and an identified external artifact directory for large logs/binaries. Do not
commit private keys or unreviewed source datasets.

## Stop/escalation and successor

Stop scope expansion if explicit mechanics/rate/recovery semantics cannot be
implemented without altering legacy equations or product promises; record a
concrete design choice for coordinator/scientific review. No fit to apogee or
unsupported fallback. Accept only verified subcommits if interrupted; leave other
checks open. Successor RMP06 complete axial/environment and RMP07 identity/app
exposure use the resulting actual interfaces, not a guessed future schema.

## Ready-to-send assignment prompt

> Implement RMP01 from this brief and INTERFACES in a pinned isolated worktree.
> Inspect/preserve the interrupted WIP; record reuse versus clean implementation.
> Own only the listed core/native files. Deliver a real bounded candidate ascent,
> load query and curves using one prepared static evaluator, named inherited rate/
> canopy composition, honest partial/nullable results, no CP guard or fallback.
> Preserve legacy defaults; run C01–C14 and return evidence/review-ready commits.
> No frontend/dispatch/WASM/default/holdout/push/release changes. One compute job;
> coordinate any shared-file changes and obtain independent physical review.
