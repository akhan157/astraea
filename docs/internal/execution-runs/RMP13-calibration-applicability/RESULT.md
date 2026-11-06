# RMP13-C03 / RMP07-C03 result — provenance-bound calibration applicability

- Packet/scope completed: shared applicability resolution; dispatch/preview/
  ensemble/archive/UI cutover; historical shear-key recognition; actual
  vehicle-derived launch altitude in design/fit; strict recorded-engine
  dispatch (different OR unknown refuses). Coordinator independent review and
  real production-CSP browser verification accepted the bounded increment after
  rework `3a8a6cd`; see REVIEW.md. Full acceptance checks remain in progress.
- Owner/model: OMP OpenRouter DeepSeek V4.1 Flash 1017, high reasoning; no
  subdelegation. Coordinator owns review/acceptance.
- Base `1edea79239666755f3f16da8db4b1bf703f94841`; branch
  `rmp13-calibration-applicability`; local commit
  `RMP13-C03: bind calibration applicability to fit inputs and engine identity`
  (exact SHA in the handoff). Clean worktree except ignored `dist/` and the
  copied engine asset (both untracked/ignored).
- Behavior: a provenance-bound artifact is active only for the supported
  flight-model binding, the recorded uncalibrated case identity, and — at the
  async dispatch boundary — an exact recorded engine identity. Input mismatch
  or unkeyable inputs exclude its scale from design options, run identity and
  the archive while the artifact stays byte-identical in the project. Undo of
  the exact inputs re-enables it. A recorded engine identity that differs OR
  cannot be verified (missing SHA-256) refuses the calibrated dispatch with
  distinct messages. No recorded identity keeps the explicit legacy policy and
  is never called a match. Legacy artifacts without `fitProvenance` stay active
  under the supported model with unverified eligibility.
- Source identities: WASM `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b`
  (not rebuilt); project schema stays `1.11.0`; archive parser and 64 MiB/8 MiB
  budgets untouched.
- Acceptance mechanisms:
  - RMP13-C03 / RMP07-C03: `src/application/calibrationApplicability.test.ts`
    (input scope changes, undo, model binding, legacy, engine comparison,
    historical shear suffix, arbitrary suffix refusal); console
    `dragCalibration.test.tsx` (input change → inactive + archive scale 1 + undo
    active; historical shear compatibility; vehicle-site altitude rule);
    `runInputs.test.ts` (archive takes the resolved artifact; contradiction
    fails); `calibrationBinding.test.ts` (foreign binding, different engine,
    unknown engine refused before dispatch); UI tests (pending engine states);
    post-fix probes `after.json` / `site-after.json` outside Git.
- Checks run (no rerun of unaffected suites): `tsc --noEmit` clean; focused
  54/54 (applicability, adapter binding, chips/panel, preview, console
  calibration); affected application/format/io 420/420; final altitude-focused
  104/104; Vite-only build OK.
- Failed attempts preserved: first browser import double-encoded UTF-8 (em dash)
  and produced a different key; corrected with byte import. Synthetic value
  writes needed focus+blur to commit. First slot save failed with base revision
  0 vs stored 1 until `Open saved project` established the slot base; then
  revision 2/3/4 saved normally.
- Browser proof (real UI, synthetic witness): active at wind 3 with recorded
  engine `same`; wind 13 → `active-bound` applicability becomes
  `inactive-fit-inputs`, stored scale not applied; committed run archived
  `dragCdScale: 1`, no artifact, wind 13, inputKey `48da622c`; undo wind → active
  with `0.9968644859450916`; save/reload/Open saved project → active, artifact
  retained, archived case preserved (scale 1).
- Limits: entirely synthetic controlled-coast witness prepared by the
  coordinator; no flight data, physical accuracy, qualification or release
  claim. Engine-unknown policy means test-engine provenance fits cannot dispatch
  by design; production proofs use the shipped SHA.
- Review rework: `livePreview` preview identity now includes the retained
  calibration artifact, so a same-scale/same-options provenance change to an
  unknown or different engine re-runs the guard and leaves `current === false`
  (and a return to a compatible artifact dispatches a fresh preview); the
  post-identity abort check prevents dispatch after cancellation. Focused
  transition test added; 7/7 preview, 46/46 affected preview/console/stage/
  build tests, Vite rebuild unchanged WASM.
- Not run/available: Rust rebuild, RMP12 reruns, other worktrees, outcome data.
- Next: coordinator integrates the accepted bounded source and records progress
  without promoting the full source/physical eligibility checks.
