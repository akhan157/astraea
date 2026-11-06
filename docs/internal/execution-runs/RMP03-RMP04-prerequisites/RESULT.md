# RMP03/RMP04 prerequisite findings and bounded technical plan

Base `8b935f20e0cefabba3b09ece103a0c86c0ce5541`; lease `3dc013e`. Inspection only, no implementation, dependency acquisition, builds, keys, containers/browsers, updates or protected outcomes. These records unblock dispatch decisions, not acceptance checks.

## RMP03 actual source profile

| Source | Retained verifiable evidence | Actual local export/runtime | Consequence |
|---|---|---|---|
| RASAero II1.0.2.0 | Prior official manual/export finding: AeroPlots Mach/Alpha/CD/power-on/off CA/CL/CN/CN Potential; maximum-body area; actual CSV schema and independent Cm not verified | No vendor export among engine fixtures; no Wine executable found | No exact-header parser or units inferred from screenshot; real source/export required for C01 |
| RocketPy1.13.0 GenericSurface | Prior pinned source/API profile, alpha/beta radians, separate lift/side/drag/pitch/yaw/roll definitions; `cn` means yaw moment, not RASAero normal CN; natural extrapolation not a qualified extension | `importlib.util.find_spec('rocketpy')` returns None; no actual source-specific CSV fixture | No guessed normalization/schema; missing components/rates unavailable |
| OpenRocket24.12 | Prior pinned Java source describes coefficient API; moment assembled through CN/CP, not independent physical moment evidence | No actual source-specific export among engine fixtures | Documentation/API and a synthetic canonical table are not a preserved actual vendor export |
| NASA D1 retained partial slices | RMP02a source/geometry/convention exclusions explicitly retained | Provisional CN/Cm readings, CA unextracted/unselected; no completed P0 sign/datum/base normalization | Cannot promote unresolved measurements into canonical full-load data |

`crates/astraea-engine/tests/fixtures/` contains synthetic canonical/environment/native/telemetry fixtures, not an evidenced RASAero/RocketPy/OpenRocket export. Scope is this repository's focused fixture inventory, not a claim about every file on the host. Original bytes/version/rights/geometry/headers/units must be frozen before a vendor module is written. No runtime/dependency download or distribution authorized/inferred here.

T1a strict complete-total-static semantics remain unchanged: every CF/CM component at each node, fixed explicit conditions and reject-outside-grid. No case folding CN/cn, zero filling, independent moment from drag/CP, hidden body-drag addition, or rectangular-grid-as-physical-coverage claim. Early generic capability design remains possible, but repeating T1a's existing missing-load tests is not a new real-schema adapter. C01 blocked; C02–C05 not newly executed, no pass recorded. Parent RMP03 remains open on actual permitted export.

## RMP04 new-host availability (2026-10-26 UTC)

| Capability check | Actual result |
|---|---|
| OS | Linux7.2.11-1-cachyos x86_64 GNU/Linux |
| Cargo | 1.99.1 after adding existing ~/.cargo/bin to PATH; core/engine offline cache usable, not a full desktop cache claim |
| Docker image inventory | `docker image ls --format '{{.ID}} {{.Repository}}:{{.Tag}}'`: exit0,empty; old pinned image absent |
| WebKit desktop development library | `pkg-config --exists webkit2gtk-4.1`: exit1 |
| Frontend dependencies | No node_modules in current checkout or the two inspected root/development-bench paths; no dependency symlink invented |
| Cached updater plugin source | No `tauri-plugin-updater-*` directory under current ~/.cargo/registry/src inspection |
| AppImage bundling helpers | No linuxdeploy/appimagetool on PATH or in inspected ~/.cache depth2 |
| Headless display | Existing Xvfb/xvfb-run available; no display/browser launched |
| Existing UP1c source | Defaults-off debug-only `updater-fixture`, fixed updater-verify identifier/version/feed18750, download-only driver; no install/relaunch operation |

Host-build prerequisites and the old offline container are unavailable. Cached Cargo for small core tests does not supply WebKit, signer/frontend, bundler or executable AppImages. Do not run the old hard-coded `/workspace` build/container scripts, generate keys first, install host packages or silently turn this into a broad image/runtime acquisition. No actual build/apply recipe is approved by this inspection.

## Reviewed-next technical conditions (not executable commands yet)

1. **Identity/guard:** separate default-off/debug-only apply feature, no extension of the existing download fixture into an installer. Exact `com.astraea.fixture.updater-apply`, compiled1.0.0/1.0.1 and only `http://127.0.0.1:18751/feed`, requireSignedVersion true, downgrades false, distinct ephemeral public-key overlay. Normal/release fixture wiring absent; no production config/key/feed/workflow edits.
2. **Disposable target:** task-owned0700 root, fixed captured APPIMAGE, canonical install-parent and basename, no symlink/hardlink escape/alias to a cached/shared/source package; A/B/backup distinct inodes. Check path/identity/version before exposing the scripted action and again immediately before install. Reject missing/changed capture. Server cannot write installation targets. Preserve failure evidence; any state/path ambiguity stops the run. This is fixture isolation, not a claimed adversarial atomicity guarantee.
3. **Build inputs:** acquire no runtime here. Once an authorized existing offline desktop image/cache is supplied, inspect exact locked plugin/signer/bundler sources and freeze actual command/image/dependency/frontend/WASM/config hashes. Use one Cargo command, <=2 jobs and fresh memory check. Independent guard/build review before compilation; no reuse of unrelated frontend/source by filename alone.
4. **A/B/signing:** build real separately versioned disposable AppImages from identical reviewed source, ephemeral key outside Git/logs with0700/0600 permissions, no overwrite of old binaries; sign exact B with trusted-version comment. Preserve A backup/hash and public receipts. No relabeling non-executable UP1c payload or old binary as B.
5. **Consent and apply:** network=none same-container loopback feed/app, bounded external process/request observer, isolated XDG without changing HOME, flight-smoke seam off. Real UI Later first must produce zero artifact GET and unchanged running A. Then actual Install/restart UI invokes native downloadAndInstall and real relaunch; no mocked API/global or manual B launch counts.
6. **Independent receipts:** scripted-click milestone, native promise/error, A exit, distinct native B PID/getVersion and exact installed-package SHA, correlated with observer times/requests. A fulfilled relaunch promise, transport Finished, feed echo or file replacement alone is insufficient. Save full source/config/tool/package/input identities.
7. **Failures/recovery:** wrong key/signature/tamper/signed-version mismatch must preserve usable A with no apply/relaunch. Later is not in-progress cancellation. Double action/restart-only retry and offline/permission/interruption cases need controlled safe injection and truthful platform-specific limits, not power-loss/atomic rollback promises. Stop only task-owned processes; restore hashed backup only to disposable install path, never production or shared cached package.
8. **Channel policy:** stable excludes prerelease/draft and downgrade; no preview-to-stable or signed-version migration default flip without separate policy/release inventory review. Fixture success does not close production-channel, installed Windows/macOS or human acceptance gates.

All RMP04 acceptance checks remain unexecuted; C03 actual apply is blocked by unavailable local runtime/build inputs. Plan/source review may accept these constraints **without approving an executable recipe or marking guard/apply passed**. Reopen on concrete authorized artifacts/dependency availability, not repeated identical cache probes.

## Next unblocked work

Park only these absent-source/runtime subscopes. Continue RMP12 labeled synthetic native numerical references for the new candidate/profile bridge, with frozen experiments and no production-WASM/default changes. RMP02/RMP06 physical/startup and RMP05 owner/custodian decision-budget/as-flown inputs remain separate.
