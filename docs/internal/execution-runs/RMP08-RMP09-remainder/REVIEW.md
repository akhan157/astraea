# RMP08 / RMP09 bounded remainder — independent coordinator review

Reviewer: coordinating OpenAI GPT session, independent of the DeepSeek author
family. **ACCEPT** for the bounded increments below. No check becomes PASS.

## Independently verified

- Branch `rmp08-rmp09-remainder` at `80efb98`, base `58945a4`; merged as
  `6347060`. The only source change is **209 added lines inside
  `#[cfg(test)] mod tests`** in `crates/astraea-core/src/six_dof.rs`
  (hunk starts at line 3865, inside the test module at 3052). No production
  behaviour changed; no engine/WASM rebuild.
- Re-ran in the merged tree with an isolated target directory:
  `cargo test --offline -j2 --lib recovery_ -- --test-threads=2` →
  **7 passed, 0 failed, 212 filtered**.
- Declared source hashes in `EVIDENCE.json` all match the merged tree
  (`six_dof.rs`, `aero_coefficients.rs`, `flight_provider.rs`, `aero.rs`,
  `motorDatabase.ts`, the native candidate fixture).
- Mutation evidence is the substance of this increment: removing the
  `!is_main_deployed` guard fails the seeded-main test; removing the
  `is_apogee_reached` gate fails the pre-apogee test; disabling the
  touchdown forced-main block fails the failed-trigger test. All three were
  reverted and the worktree is clean.

## Dispositions (coordinator's, not the author's)

- **RMP09-C04 → in_progress, bounded.** Drogue→main ordering, duplicate
  suppression, main-at-apogee, delayed/low crossing, failed-trigger forced
  main and the seeded `already-deployed`/`apogee-reached` flags are verified for
  a single-body configuration. The check text also requires independent
  sections, which the model does not have, and trigger *latency* is not
  modelled. Not a PASS.
- **RMP08-C04 → in_progress, audit only.** The candidate path refuses Mach
  ≥ 0.8 and incidence > 5°/reverse flow and does not import the legacy
  `aero.rs` transonic/CP blends; those legacy fits remain unvalidated and are
  disclosed as legacy-only. The audit establishes the absence of blending in
  the candidate path; it does not bound the legacy fits, so the check cannot
  pass.
- **RMP09-C02 → in_progress, record only.** Curve provenance, mount anchors,
  clocks and the absence of ambient-pressure thrust correction are recorded.
  The record is not a qualification, and the identified fixture-provenance
  defect is left unfixed deliberately.
- **RMP08-C01, RMP08-C03, RMP08-C08, RMP09-C03, RMP09-C05, RMP09-C07** remain
  external/blocked with the citations in `RESULT.md`; C03/C05 and C02 have gap
  records but no pass.

## Flagged defect (owner decision required)

`crates/astraea-engine/src/native_candidate.rs:5-7` describes its 22-point curve
(integral 8.733 N·s) as "the certified Estes C6 thrust record"; the certified
record in `src/propulsion/motorDatabase.ts` has 25 points and integrates to
8.8172 N·s. The shipped app does **not** use the native fixture curve. The
fixture was deliberately not edited: changing engine-adjacent source without a
rebuild would break source↔shipped-WASM correspondence. Recorded as a
provenance defect; a future lane may correct the comment with an explicit
rebuild decision.

## Limits

No physics, default, tolerance, seed, schema, archive or budget change; no
downloads, measured data, team inputs or budgets; no browser work was needed
(Rust tests plus documentation only). Independent review was performed by this
coordinator, not by a second model family; RMP08-C08 still requires a truly
author-independent material review.
