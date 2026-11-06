# RMP12a independent review

Separate serial read-only Codex/OpenAI gpt-6.1-sol/high session (runtime header confirmed). Same-model independence, not different-model consensus. No native calls/tests/builds were performed by reviewer. Raw prompts/transcripts external sibling evidence-rmp12-native-reference.

## Contract

**ACCEPT bounded preimplementation contract** at `40fb607e8c0f50c09f1b35e599b6839434061754`. No consequential contract defect or required correction found.

Reviewed `docs/internal/execution-runs/RMP12-native-reference/{ASSIGNMENT.md,EXPERIMENT.json}`, `docs/internal/execution-package/packets/RMP12.md`, prior N1 evidence, and relevant source:

- `crates/astraea-core/src/six_dof.rs`
- `crates/astraea-core/src/flight_provider.rs`
- `crates/astraea-core/src/flight_provider/profile.rs`
- `crates/astraea-core/src/{environment,aero_coefficients}.rs`
- `crates/astraea-engine/src/{profile_candidate,native_candidate}.rs`

The proposed reduction is coherent. Exact delivered impulse matches native propellant depletion, including consumption while contact holds. The first thrust–instantaneous-weight crossing defines liftoff for this fixture. Vertical launch, zero wind and symmetry support constant attitude and zero transverse motion/rates; prescribed CA0 supplies axial resistance using density at launch MSL plus AGL.

This is meaningful new-path work: an independently integrated trajectory reference for the supplied-profile candidate, with contact, rail exit, burnout and exact off-grid termination. It adds evidence beyond the previous profile arithmetic checks and unchanged legacy N1 study.

The boundaries are appropriate:

- Two reference resolutions, analytic oracle checks and split discontinuities provide useful numerical controls without claiming certified global error.
- Rail brackets and refinement residuals must remain distinguishable from proven root-error bounds.
- The negligible-aero substitution’s pointwise acceleration bound does not establish a propagated trajectory bound.
- Expected refusals should verify failure phase/context, including speculative-stage status, rather than merely matching an error substring.
- Frozen carrier values establish consistency only; they do not independently validate mass rollup.

Exactly nine planned native attempts, preserved failures, fixed provisional reserves and the stated C01–C07 limitations safely bound the work. Implementation and result acceptance remain pending.

Read-only review only: no edits, builds, tests/scripts, native calls, delegation, network access or protected-outcome access. Core/engine source differences against `cfdded2` were empty. Independent same-model review; no consensus claim.
## Implementation/results

**ACCEPT the RMP12a experiment/report at source `46e74e633c9e5f890ca9f1be64960b8703453ec0`, including the retained overall diagnostic FAIL.** No consequential harness defect or required correction found. This accepts the experiment’s integrity and interpretation; numerical qualification remains open.

- The independent vertical ODE/RK4 implementation is coherent with native impulse-based depletion, contact/liftoff, E1 density, prescribed axial drag and vertical symmetry. The analytic controls exercise both RK4 and the dimensional RHS. State errors compare matched times; event scalar comparisons are appropriate for this ascending vertical fixture.
- Accounting is consistent with nine planned native attempts executed once: six comparison runs, one byte-identical repeat and two expected refusals. Saved input/output/error hashes match the records. Negative cases verify actual endpoint phase, speculative status and elapsed time. Exact horizons, burnout and bounded-prefix qualification/null semantics are preserved.
- Both 20 ms cases correctly retain **105.0167304 µs > 100 µs** rail-estimate error. The 10/5 ms selected metrics pass, with approximately **17.1255 µs** rail error. Neither tiny reference-refinement residuals nor the roughly 100 µs interpolation bracket certify an exact root-error bound.
- The unsplit-thrust-corner/inherited-tolerance explanation is properly tentative. Saved errors show trajectory bias accumulating near corners and exceeding local rail overshoot; the report explicitly leaves adaptive-trial causation unisolated.
- Source/default preservation is supported. Adaptive-tolerance convergence, full 6D, continuous peaks, native/WASM parity, physical accuracy and owner-budget closure remain unclaimed.

The proposed dispositions are appropriate: **C01 pass; C02 fail for this provisional selected-native experiment; C03/C04 not_run; C05 in_progress for one byte-repeat; C06 blocked; C07 pass for unchanged source/default identities only. Parent RMP12 remains partial.**

Independent same-model read-only review, not consensus. The reported nine oracle and 34 combined diagnostic passes were not independently rerun. No native calls, tests/scripts/builds, edits, network, delegation or protected-outcome access occurred.
