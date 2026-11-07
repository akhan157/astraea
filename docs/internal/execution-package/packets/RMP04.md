# RMP04 — UP1d — disposable actual update apply/relaunch

## Purpose/status

Bounded new-host prerequisite/technical constraints independently reviewed at
`689c111`; [findings](../../execution-runs/RMP03-RMP04-prerequisites/RESULT.md).
Docker image inventory empty; inspected desktop/WebKit/frontend/plugin/bundler
inputs absent. No executable apply/build recipe approved, guard implemented,
keys/builds/containers started or acceptance check passed. C03 blocked; other
checks not_run. Reopen on concrete authorized offline inputs, not old cache assumptions.

## Prerequisites (closure versus early work)

- UP1a native transport and UP1c verified non-executable download are completed historical evidence; neither proves install/relaunch.
- Early work: inspect guarded fixture/source and produce a bounded reviewable plan with new-host capability inventory.
- Closure requires actual disposable A/B AppImages, reviewed guard/cleanup design and native UI/apply/relaunch execution in isolation.

## Required reading

- STOP/migration handoff (private coordination notes)
- [Full roadmap](../../roadmap-to-collegiate-1.0-2026-10-26.md)
- Model routing (private coordination notes)
- [UP1c proof and limits](../../delivery-review-2026-10-26-updater-download-verification.md)
- [Updater lifecycle review](../../delivery-review-2026-10-26-updater-lifecycle.md)
- [UP0 proposal and channel boundary](../../accuracy-program/first-batch-2026-10-26/UP0/plan.md)
- [Existing download-only driver](../../../../scripts/updater-fixture/driver.js)

## Files owned/prohibited/shared leases

- Existing `scripts/updater-fixture/` and updater fixture-only tests; proposed CREATE `scripts/updater-fixture/apply/` after review.
- Shared lease: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src/desktop/updates.ts`, `src/desktop/UpdateBanner.tsx`; coordinate desktop owner.
- Prohibited: production key/feed/config edits, release workflow publication, existing cached package overwrite, host install or arbitrary executable target.
- All proposed CREATE paths require dispatch-time existence/ownership check; preserve unrelated dirty work and negotiate shared edits sequentially.

## Frozen decisions

- Exact interrupted pending proposal: fixture identifier `com.astraea.fixture.updater-apply`; compiled versions `1.0.0` and `1.0.1`; loopback `18751/feed`.
- It proposes an ephemeral fixture key, signed-version enforcement, strict executable path, default-off debug guards and isolated installed directory/container.
- It proposes existing Install/restart UI calling actual native `downloadAndInstall`/relaunch, with no mocked globals/API.
- This is a proposal requiring review, not an approved build recipe; older UP0 names/ports/versions are not substitutions for it.
- Old cached Docker image, binaries, frontend, toolchains and signing keys may be absent; retained hashes are not locally executable artifacts.

## Ordered implementation/review substeps and commit boundaries

1. Commit 1: inventory new OS/tool/cache availability; review pending proposal against actual plugin/config/UP1c code; do not start builds/keys first.
2. Specify fixture-only executable target validation before install: canonical path/parent, symlink handling, compiled app identity/version and captured APPIMAGE.
3. Commit 2: implement bounded default-off/debug-only report/action guard, distinct from flight smoke; review absence in ordinary/release builds.
4. Review A/B build inputs and immutable frontend/WASM/source identities; then prepare separate actual compiled packages and a newly generated ephemeral key.
5. Commit 3: implement fixture harness with same-container loopback isolation, bounded timeouts, exact artifact request/bytes and cleanup.
6. First exercise Later: zero artifact request, unchanged A, running UI. Preserve failing evidence before repeat.
7. Exercise actual existing Install/restart action: native verification/apply, A exit, new PID receipt, native B version and installed package SHA.
8. Commit 4: signature/key/payload/version/channel/offline and interruption scenarios; independent desktop review then RMP16 handoff.

## Input/output contracts and source fields

- Inputs: approved plan hash, exact source/tool/image inventory, A/B compiled version and package hash, fixture config/public-key hash, captured install path.
- Private ephemeral key remains outside Git/logs with restrictive permissions; production keys are never inspected or reused.
- Output: scripted UI click milestone, native promise resolution/error, request logs, A exit/new PID, native getVersion B and installed-byte SHA.
- Manual launch of B, API mocks, feed echo, transport Finished or a changed file alone cannot establish real relaunch.
- Stable/preview policy remains separately reviewed: stable excludes prerelease/draft and no downgrade; signed-version migration cannot silently flip defaults.

## Acceptance checks

| ID | Mechanism | Pass condition | Evidence |
| --- | --- | --- | --- |
| RMP04-C01 (Guard) | exercise allowed and forbidden identity/version/path/key/config combinations | only exact disposable target accepted; ordinary/release fixture wiring absent | guard matrix and build-config review |
| RMP04-C02 (Consent/defer) | run real banner Later and observe requests/target | no artifact GET or mutation/relaunch before Install | UI/native/request/hash trace |
| RMP04-C03 (Actual apply) | click actual Install/restart against real signed B | A exits; distinct process reports native B and installed file matches B SHA | correlated PID/version/package evidence |
| RMP04-C04 (Authenticity) | wrong key/signature/tamper/signed-version mismatch | no apply/relaunch; A unchanged and usable | negative native errors and hashes |
| RMP04-C05 (Recovery limits) | controlled failed write/interruption only when safely injectable | handled behavior and preserved bytes documented without crash/power-loss guarantee | failure/restore record |

## Negative/failure cases

- Wrong target, symlink escape, missing APPIMAGE capture, absent runtime/image or broad rebuild surprise stops execution for focused plan revision.
- Later is pre-install deferral, not running-download cancellation; killing A or manually starting B cannot satisfy restart.

## Exact permitted checks or required prerequisites

- No current approved apply/build recipe: first review actual new-host capabilities, exact overlay, guard target and pending proposal. Coordinator technical acceptance then permits the bounded disposable local test within existing engineering authority; do not ask the owner to reconfirm routine reversible work. Production/spending/access changes remain separate.
- Existing `scripts/updater-fixture/run-container.sh` encodes old cached-image/task paths; inspect before use and do not execute it as a portable recipe.
- After locked dependencies exist, focused UI regression is `node node_modules/vitest/vitest.mjs run src/desktop/updates.test.tsx`; it remains mock orchestration evidence.
- Capture actual native runner/build commands after coordinator technical review. Guarded disposable local execution then proceeds under the existing engineering authority; this document grants no production/paid/external-contact operation. Respect the new host network policy and isolate the local test feed.
- Commands above are future resumed-work checks unless explicitly read-only packaging checks; this package records no new executions.

## Evidence to save

- Save reviewed plan, guard matrix, complete public source/config/A/B/tool identities and exact commands; keep all failed/unscorable attempts.
- Save A backup/restoration hash, path validation, request/native/UI/PID receipts and saved-project round trip; redact secrets.
- Record pinned base, owner/model/effort, exact commands/exit status, source/input/artifact hashes, review disposition, limitations and next action.
- Historical external logs/binaries may be unavailable; identify missing artifacts honestly and never count retained hashes as fresh execution.

## Escalation/stop decisions

- Rollback restores hashed A only to this packet disposable install path after stopping its own processes and preserving failed bytes/logs.
- No production downgrade/feed rollback, no BG2 overwrite, no general atomicity/power-loss claim; escalate production/channel policy separately.
- Preserve defaults/main and stopped automation; no external contact, holdout access, paid/remote operation or publication is implied.

## Successor/ready-made agent assignment prompt

RMP16 repeats applicable real installed-OS behavior; RMP18 reconciles channel/signature policy without executing publication.

> Review the unapproved UP1d proposal before execution: exact com.astraea.fixture.updater-apply, 1.0.0/1.0.1, loopback 18751/feed, ephemeral key and strict disposable target. Prove actual UI/native apply plus A-exit/new-PID/B-version/package-SHA, preserve defaults and rollback limits; assume no old caches.
> Before work pin current integration base, inspect dirty state/active runs, name exact leases and resource budget, and retain completed evidence. Independent material-science/convention review is required where applicable.
