# UP1c native offer/defer and verified download

PASS, bounded local fixture at base `8815bcbf34b4b4b93a0eda005a5830a9898f9135`.
This extends the existing UP1a transport proof and UP1b lifecycle review with
actual native updater API calls through the real `window.__TAURI__.updater`
global, IPC and existing ACL. It does not establish user consent acceptance,
installation, executable replacement, relaunch, production release readiness,
or channel-policy enforcement.

| Case | Native result | Artifact requests |
| --- | --- | --- |
| Offer/defer, fixture 1.0.0 → 1.0.1 | Offer returned, resource closed; no download invoked | 0 |
| Valid signature, signed 1.0.1 | `download()` resolved after native verification | 1 × 65,536 bytes |
| Modified signature | `The signature verification failed` | 1 × 65,536 bytes |
| Modified payload byte | `The signature verification failed` | 1 × 65,536 bytes |
| Signed 1.0.1, announced 1.0.2 | Native signed-version mismatch error | 1 × 65,536 bytes |

Each downloaded case also reported exactly 65,536 received bytes through native
progress events. Every update's documented public `close()` call resolved. The
cached updater JS implementation closes the downloaded-byte resource before
closing the update resource. An external harness stopped the still-running app
with SIGTERM; that controlled stop is not application completion or relaunch.

Native updater 2.14.0 emits `Finished` when transport ends, then calls
`self.verify(&buffer)?` before returning bytes. `verify_signature` validates the
minisign artifact/global signature before trusting its version comment and
checking the announced version. All three negative cases emitted `Finished`
and then rejected. Only promise resolution counts as verified download here.
The source hashes and native success/error reports are in
[UP1c/manifest.json](accuracy-program/first-batch-2026-10-26/UP1c/manifest.json).

The new `updater-fixture` Cargo feature defaults off. Its command, handler entry,
guard and initialization script require both the feature and debug assertions;
default and release builds contain none of that fixture wiring. When enabled,
setup refuses before window construction unless the compile-time configuration
has the exact fixture identifier, version 1.0.0, single fixed loopback feed and
`requireSignedVersion: true`. There is no runtime endpoint argument. The report
command accepts only the main webview, an object under 128 KiB, and writes only
the fixed `/evidence/native-report.json` path. The initialization script has no
install or relaunch operation. Production updater/frontend/configuration,
permissions, feed, channel and signing material are unchanged.

Both server and app ran in the same cached image
`sha256:9c6c230e1d815013fa34fcb6b9174d9a6f9e2a9ec68920b93f345e547c723174`,
with `--network=none`, CPU 0, one CPU and 4 GiB. The only endpoint was
`http://127.0.0.1:18750/feed`; debug updater support permits this HTTP fixture.
No invalid-certificate/hostname or insecure-transport switches were enabled.
HOME stayed inherited, XDG paths were task-local, and `ASTRAEA_SMOKE_OUT` was
absent. An unheaded ordinary startup check received 204, preventing an unrelated
production UI offer. Offer/defer was exercised directly through the native-backed
API, without a UI offer interaction or Install click. The fixture's five checks
used distinct header values.

The 64 KiB deterministic payload is non-executable data outside Git. A new local
ephemeral key signed it with the cached Tauri CLI `signer sign --app-version
1.0.1`. The private directory is 0700; its key and output logs are 0600, outside
Git, and their values were not printed. Public fixture material and exact hashes
of source, configuration, all frontend files, executable, feeds, payloads,
signatures and public key are recorded in the manifest. The matching current
root frontend was copied without rebuilding and rechecked afterward.

The cached original debug executable was copied to a distinct inode before
compilation, and restored byte-for-byte after retaining the fixture binary at a
separate inode. The final build helper also restores its prebuild executable
through an EXIT trap. No Cargo fingerprints were edited. Both earlier successful
run evidence and the final guarded run are retained externally; the committed
packet contains the final public reports only.

Focused checks passed: default-feature offline `cargo check`; a unit test
covering valid and seven invalid guard configurations; feature debug build with
no bundle; JS/Python/shell syntax; diff whitespace; specific native crypto/version
errors and full response/native received-byte counts. The helper scripts are
under `scripts/updater-fixture`; preparation refuses to overwrite an existing
fixture key. `run-container.sh build` and `runtime` use fixed task paths and the
pinned offline image. Preserve the first-run external evidence before rerunning.

No update package/AppImage was built or executed. No apply, relaunch, actual
Install-click acceptance, private-key publication, external network access, paid work,
outreach, holdout exposure, push or deployment occurred.
