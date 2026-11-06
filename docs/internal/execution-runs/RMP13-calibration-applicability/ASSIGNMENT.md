# RMP13-C03 / RMP07-C03 assignment — provenance-bound calibration applicability

- Packet/subpacket and acceptance IDs: RMP13-C03 (fit scope bound to artifact;
  incompatible changes historical/inactive/stale), RMP07-C03 (prior artifact
  retained but inactive on incompatible model/source/conditions; scale cannot
  leak through runInputs).
- Exact integration base: `1edea79239666755f3f16da8db4b1bf703f94841`, branch
  `rmp13-calibration-applicability`, worktree
  `/home/ak/.paseo/worktrees/3s8t98rp/rmp13-calibration-applicability`. Clean
  at dispatch; no dirty user work present.
- Owner/model/effort: coordinator-owned DeepSeek V4.1 Flash 1017 author (OMP /
  OpenRouter), high reasoning; no subdelegation. Coordinator owns independent
  review, integration and acceptance.
- Isolated lane; only this worktree may be edited.
- Availability: source + tests present; LSP works; supplied raw probe and
  `before.json` under `/home/ak/.paseo/worktrees/3s8t98rp/evidence-calibration-applicability/`.
  Source runtime WASM `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b`
  is not rebuilt. No new outcome/holdout data, no release/push/outreach.
- Owned files: `src/application/dragCalibration.ts` and tests; new shared
  `src/application/calibrationApplicability.ts` (+ tests); `src/application/runInputs.ts`
  and capture tests; `src/console/design.ts`, `src/console/store.ts`,
  `src/console/evidence/CalibrationCard.tsx`, `CalibrationChip.tsx`,
  `ModelStatusPanel.tsx` and their existing tests; `src/console/data/adapter.ts`
  only for the async engine-identity dispatch guard; this run directory.
- Prohibited: Rust/physics/engine/default changes; project schema version change
  (1.11.0 stays); canonical archive parser, 64 MiB native / 8 MiB foreign
  budgets; first-lane saved-output parser/presentation internals; other
  worktrees; register/manifest/packet-index/TASKS/handoff (coordinator).
- Invariants: archived historical inputs stay byte-identical; retained artifacts
  are never mutated or deleted; legacy records without fit provenance keep the
  explicit existing legacy policy; no invented engine hash or fit key.
- Required reading: CONTROL-LOOP, DECISIONS, CHECKS, packets/RMP07, RMP13.
- First increment: shared applicability resolver + design/runInputs/store
  cutover so a wind/motor/geometry/site/rail/deploy/model mismatch excludes the
  retained scale from options, run identity and archive; undo re-enables it.
- Evidence: supplied probe before fix; post-fix probe on real resolved options
  and archive; real-browser synthetic fit + wind edit + undo + reopen;
  focused affected tests with `--maxWorkers=2`, `tsc`, Vite-only build.
- Resource: check `free -h` before heavy work; stop runtimes; max two workers.
- Reviewer: coordinator-owned independent review after author RESULT/EVIDENCE.
- Stop/escalation: exact engine-identity unknown policy and the removal of the
  shear suffix from fit identity are sent to the coordinator before material
  edits. No self-acceptance.
