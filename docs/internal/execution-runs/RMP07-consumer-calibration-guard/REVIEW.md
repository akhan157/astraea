# RMP07f independent source review — ACCEPT

Source `a22df9d253445fb145868038aed816da70235b4b`, base `b3a4aef`.
Scope: direct shared flight/ensemble adapter binding guard only, not full
C03/C04 acceptance. No candidate activation/physics/schema/key change.

Fresh no-history read-only reviewer explicitly routed through opencode-go /
mimo-v2.6-pro with requested thinking=medium for this bounded ordinary software
change. Current author environment openai / gpt-6.1-sol / high. No measured
cost/model-quality conclusion or scientific qualification follows from routing.

## Actual disposition: ACCEPT, no material findings

Reviewer checked the guard and both call sites, tests, binding helper/parser,
model contract, bridge signatures and supporting synthetic fixtures. Confirmed:
- Five-key binding comparison defaults to the only executable legacy contract;
  unbound and exact matching legacy pass; any foreign declaration refuses.
- The existing strict scale check is unchanged. Only error precedence changes
  when both binding and scale mismatch: binding refusal now comes first.
- Guard is before nominal dispatch and all ensemble chunks/callbacks.
- Negative tests use matching scales (the actual regression), test both
  consumers and zero dispatch/progress/cancel calls. Positive tests capture
  identical flight/ensemble options and unchanged artifacts.
- Partial provenance fixtures are explicitly binding-boundary-only, not
  persisted-fit parser/eligibility evidence. No scope/qualification overclaim.

Reviewer had `read` only: no tests/build/hash execution was performed by the
reviewer. The author/coordinator verification below remains distinct.

## Adopted non-blocking followups

Post-acceptance test-only additions: positive old provenance present without a
flightModelBinding (in addition to no provenance), and literal assertion of the
retained manifest calibration label. No production change after acceptance.
Final affected suite passes 244 tests/15 files (10 new guard tests); TypeScript
clean. Build log `build-1.log` is against the same production source before
those test-only additions; no new build is claimed for the test-only edit.

## Evidence chronology / availability

External-local-only:
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp07-consumer-calibration-guard/`:
- `before-guard.log`: five foreign-binding flight cases resolve rather than
  reject. The test stops at that assertion, so this log does not independently
  reproduce MC before the fix; later tests verify MC refusal directly.
- `focused-1.log`: 13 tests/2 files (9 initial guard +4 identity tests).
- `affected-1.log`: 243 tests/15 files, superseded by `affected-final.log`:
  **244 tests/15 files**, including 10 final guard tests.
- `tsc-1.log`, `tsc-final.log`: clean; `build-1.log`: Vite production build pass.
- `review-prompt.md`, `review.md/.err`: actual ACCEPT record; task-owned review
  PID 431516 exited. No other task-owned processes remain.

Existing production WASM hash unchanged (`b971b222…`). Vite build is not
invoked-WASM/physics/platform verification. Source/compute lease released.
Parent RMP07-C03/C04 remain in_progress; candidate consumers/migration and
actual runtime parity/status qualification remain unclosed. Nothing pushed.
