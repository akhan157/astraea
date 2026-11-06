# RMP16 — Exact installed-platform acceptance

## Purpose/status

ACCESS-DEPENDENT; planning/source diagnosis can proceed, installed-OS closure requires real systems/artifacts.
This is a future dispatch brief. Current session is packaging only: no engineering, builds, simulations, outcome reads or automation restart.

## Prerequisites (closure versus early work)

- Read retained Windows startup records before changing code; do not assume the failure has the same cause on another machine.
- Closure requires exact intended Windows/macOS/Linux packages and architectures, actual supported hardware/OS access and applicable signing credentials.
- Real update acceptance depends on reviewed RMP04 fixture and production channel policy; Linux extracted smoke is completed narrower evidence.

## Required reading

- [STOP/migration handoff](../../SESSION-HANDOFF.md)
- [Full roadmap](../../roadmap-to-collegiate-1.0-2026-10-26.md)
- [Model routing](../../session-handoff/coordination/MODELS.md)
- [Completed Linux embedded/extracted smoke](../../delivery-review-2026-10-25-native.md)
- [Historical package manifest](../../delivery-review-2026-10-25-native-package.json)
- [Readiness gaps](../../preview-readiness.md)
- [Portable platform assignment](../../session-handoff/coordination/assignments/platform.md)
- [Existing startup instrumentation](../../../../src-tauri/src/startup_trace.rs)

## Files owned/prohibited/shared leases

- CREATE `docs/internal/execution-package/evidence/RMP16/` for platform/artifact/architecture matrix and sanitized receipts.
- Existing startup diagnostics, package metadata and native boundaries require narrow per-file lease after diagnosis; no speculative broad rewrite.
- Shared lease with RMP04 updater/native files and RMP18 final metadata; prohibit production signing/publication/feed operations or host-wide changes.
- All proposed CREATE paths require dispatch-time existence/ownership check; preserve unrelated dirty work and negotiate shared edits sequentially.

## Frozen decisions

- A successful build or Linux software/Xvfb/extracted payload is not installed Windows/macOS, hardware GPU or interactive acceptance.
- WebKit on Linux does not certify native Safari; actual Windows Edge/native and macOS workflows need their own evidence.
- Old toolchains/images/raw logs/packages may be unavailable; manifests retain hashes, not artifacts.
- No repeat of unchanged Linux smoke absent changed source/artifact or unresolved concern; run affected checks on changed exact packages.

## Ordered implementation/review substeps and commit boundaries

1. Commit 1: inventory offered OS/architecture/package formats and access/credential blockers, using actual available machines.
2. Reconcile Windows startup trace stages/errors and exact failed source/package; choose one evidence-based diagnostic hypothesis.
3. Commit 2: minimal focused diagnostic/repair only if reproducible cause warrants; preserve original failure logs and artifact identity.
4. Produce exact candidate packages through reviewed locked toolchain; hash source/frontend/WASM/package and applicable metadata/signatures.
5. On each real supported OS run fresh install/upgrade, offline launch, native open/save, permission failure, migration/recovery and error/log flows.
6. Exercise actual real updater/relaunch per applicable package/OS, including interrupted path and saved-data survival; fixture Linux evidence alone cannot substitute.
7. Commit 3: record GPU/context loss/renderer fallback, accessibility, uninstall/data behavior and architecture-specific evidence.
8. Independent platform review distinguishes actual passes, unsupported offerings and blocked external access; deliver exact artifact matrix to RMP18.

## Input/output contracts and source fields

- Input: offered OS/version/architecture/package, exact source/frontend/WASM hashes, signing/notarization metadata when applicable and installed target identity.
- Run record: real machine/OS/browser/webview/runtime, installer/action sequence, permissions/offline/GPU state, logs and start/exit/update receipts.
- Output: per workflow PASS/FAIL/BLOCKED/NOT OFFERED with artifact-specific evidence and unresolved defect IDs.
- Uninstall data policy is declared before testing; protect user projects and use disposable install/user data locations.
- Signing keys/credentials stay outside artifacts/logs; absence is a blocker rather than permission to substitute unsigned public release.

## Acceptance checks

| ID | Mechanism | Pass condition | Evidence |
| --- | --- | --- | --- |
| RMP16-C01 (Artifact identity) | hash installed package/assets and reconcile build source | tested exact package matches candidate and architecture | source/build/install manifest |
| RMP16-C02 (Startup diagnosis) | correlate Windows instrumentation stages with reproduction | cause supported or exact external gap retained; no guessed fix | startup trace and focused review |
| RMP16-C03 (Installed journeys) | execute install/offline/dialog/save/upgrade on actual OS | all offered workflows work without data loss or explicit unresolved blocker | OS-specific receipt matrix |
| RMP16-C04 (Update/recovery) | real OS apply/relaunch/error/interruption exercise | expected target/PID/version and data survival; failures honest | native updater and restoration logs |
| RMP16-C05 (Renderer/data behavior) | context loss/fallback/uninstall policy checks | recoverable usable UI and declared project retention behavior | platform traces and user-data checks |

## Negative/failure cases

- Missing OS/hardware/credentials cannot be solved by a stronger reasoning model or relabeled Linux run.
- Do not alter host filesystem/permissions broadly to manufacture interruption; use reviewed disposable cases.

## Exact permitted checks or required prerequisites

- No cross-platform one-line acceptance command exists: first obtain actual OS/package/architecture and reviewed disposable test paths.
- Inspect existing `scripts/macos-smoke-check.mjs` and startup tooling for scope; filenames/renderer labels do not establish OS.
- Future build/install commands depend on selected OS SDK, locked caches, credentials and package format; capture exact reviewed commands per machine.
- Do not run Docker/image downloads, install packages or invoke historical cached scripts from this documentation task.
- Commands above are future resumed-work checks unless explicitly read-only packaging checks; this package records no new executions.

## Evidence to save

- Save platform availability/support matrix, original Windows failure trace and minimal diagnosis, exact packages/source/assets identities.
- Save actual OS workflow/PID/version/error/data receipts, signing/notarization verification when authorized and reviewer limitations.
- Record pinned base, owner/model/effort, exact commands/exit status, source/input/artifact hashes, review disposition, limitations and next action.
- Historical external logs/binaries may be unavailable; identify missing artifacts honestly and never count retained hashes as fresh execution.

## Escalation/stop decisions

- Stop installing on any path outside declared disposable target or on user-data risk; preserve evidence and request focused recovery decision.
- Park missing system/hardware/credential access; do not publish an untested platform promise or change signing/feed production settings.
- Preserve defaults/main and stopped automation; no external contact, holdout access, paid/remote operation or publication is implied.

## Successor/ready-made agent assignment prompt

RMP18 consumes exact offered-platform readiness; RMP17 consumes usable available platform artifacts.

> Perform exact installed-platform acceptance on actual offered OS/architectures with disposable data. Diagnose retained Windows startup evidence first; reuse unchanged Linux smoke. Record real install/dialog/offline/update/recovery/GPU/uninstall behavior and artifact identities; park missing hardware/credentials honestly.
> Before work pin current integration base, inspect dirty state/active runs, name exact leases and resource budget, and retain completed evidence. Independent material-science/convention review is required where applicable.
