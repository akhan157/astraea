# RMP07a — accepted native content identity and lossless diagnostic replay

Base `bbac580f28fa2ef1add701240a343f212f9eb922`; source
`f5bf3c5b201d12c93fb15c316ee50f7aafb7c26f`. Existing intended isolated worktree and
branch preserved. This advances the existing Version 1 reproducibility goal;
it neither replaces the roadmap nor completes RMP07/1.0.

## Implemented

Successful actual native candidate and E1-profile candidate reports now carry a
SHA-256 identity over normalized typed inputs, actual prepared composition/model
identities, active support/presentation/time policies and versioned numerical
contract. All caller declarations remain declarations, conservatively included;
a same-label geometry/motor/CA/profile change cannot preserve the input key.
Arrays retain order; missing optional values normalize to typed null, not zero;
SI units and frames retain existing strict parsing. Exact i64 epochs above 2^53
are never routed through f64. Typed nonfinite values are refused before ordinary
JSON serialization could turn them into null.

The full canonical preimage retains exact finite binary64 bits (signed zero
normalizes to +0). Native `replay_report_json` and `replay_candidate_report`
reconstruct inputs from this preimage, verify canonical/digest boundaries and
require the current diagnostic's computed input/model/policy identity to match.
This avoids one-ULP decimal archive parsing drift without changing shared
production JSON parsing. The decimal envelope is a readable view, not the
lossless replay source. Raw profile effectiveInputs remain backward-compatible;
the hash uses the normalized typed profile actually consumed.

**Input/model equality is not executable equality, result equality, authenticated
origin, physical accuracy or numerical qualification.** Runtime binding is
explicitly Unknown. External exact executable hashes remain necessary and are
recorded for these probes. No production dispatch/model selection was added.

## Fresh verification

- **86 engine tests pass**, including 13 new identity/replay tests (5 unit,
  8 integration). All-target commands used two compiler jobs/two test threads.
- wasm32 library `cargo check --offline --locked` passes. This is a compile
  check only, not a newly built/offered/consumed production-WASM artifact.
- Python independently reconstructs the declared canonical bytes and SHA-256;
  five recorded CLI calls cover native/profile reports, one serialized replay
  each, and the preserved synthetic legacy flight. Native/profile prior outputs
  are unchanged after removing only additive identity metadata. Legacy serialized
  output is byte-identical, SHA256
  `f37d195fc903e3599603706a9e3f6b95b152d7a79b4639a31f50fa4f64972249`.
- RMP12's nine-attempt numerical experiment was NOT rerun; its ~105us versus
  100us provisional rail failure remains failed and its production/default
  restrictions unchanged. Ordinary synthetic boundary tests are not a new
  numerical study or empirical scoring.
- Independent read-only review initially requested lossless serialized replay
  and binding additional active policies; both were fixed and re-reviewed
  **ACCEPT**. [Review](REVIEW.md) preserves those findings and routing.
- Core physical source, driver/defaults, frontend/Tauri/public source remain
  unchanged. sha2 is native-only; lock changes add its dependencies, not parser
  features. No generated production WASM exists at the expected source path in
  this checkout; no fresh production-WASM hash or runtime claim is made.

## Failures retained / limitations

The first integration test altered wet motor mass without updating its dry/
propellant identity and correctly failed the existing physical consistency
guard. The test was corrected to change dry and wet mass consistently; no guard
was relaxed. Initial review REQUEST_CHANGES and final ACCEPT are both retained.
The first unit compilation had an unused former profile helper warning; the
obsolete helper was removed. Rustfmt is not installed; no formatting success
or system tool installation is claimed. Git author was not configured, so local
commits use explicit command-local `Pi coding agent <pi@localhost>` identity,
without changing global or repository user configuration.

RMP07-C01 is **in_progress**, supported only for this native diagnostic increment.
C02–C08 remain not_run: project/schema migration, calibration binding, opt-in
worker/UI/ensemble use, persistence/cancellation and exact built browser/WASM
journeys are not implemented or established here. RMP03 source-specific imports
and RMP06 local axial startup/source coverage remain separate closure concerns.
Existing permissive DTO metadata parsing is not claimed to be hardened; ignored
fields are excluded from consumed typed input identity. No caller label is
promoted to source eligibility.

## Evidence, resources and next action

Portable: [EVIDENCE](EVIDENCE.json), [native metrics](native-checks.json),
[assignment](ASSIGNMENT.md), [review](REVIEW.md) and tracked synthetic fixtures,
checker and tests. Raw stdout/stderr, binaries, command logs and reviewer
transcripts remain local at
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp07-content-identity/` and the measured
Cargo target path. Availability/hashes are explicit; raw artifacts are not
claimed to be in Git. About 10GiB RAM available was checked before heavy work;
reviewers ran serially. All commands/reviewers ended, no task server/watcher/
browser/build remains, file/compute lease released.

Next useful increment: map this accepted native identity boundary onto existing
saved-run/provider schema and calibration compatibility, with explicit legacy
preservation and no default activation. Read the existing RMP07 required schema/
archive/migration sources and inspect actual frontend dependency availability
before promising browser execution. Missing mission/team data blocks affected
accuracy claims, not this independent product engineering. No push/release,
external contact, protected outcome access, paid capacity or automation restart.
