# UP0 controlled updater plan and channel contract

Plan only, source `00e768b2d2dcfc9913b2a9428040a67fd42d3d58`, 2026-10-25.
No key generation, downloads, package builds, tests or update installation were
performed in this packet. Root source is unchanged. Prior BG2 is not repeated.

## Intended channel contract for review

Production defaults to the stable channel: only a published, non-draft,
non-prerelease release may enter its feed. Preview 0.9 is explicitly opt-in and
uses a separate preview feed/build identity; it cannot silently replace the
production endpoint. Neither channel auto-installs: checking may offer a version,
but artifact download/install starts only after the install action. “Later” is
pre-install deferral, not cancellation of a running download.

Stable contract test cases:
- Stable1.0.0 -> published stable1.0.1: offer; no artifact GET before consent.
- Stable1.0.0 ->1.0.0 or0.9.0: no offer; no downgrade.
- Stable1.0.0 ->1.1.0-preview.1: refuse even though SemVer regards it as newer.
- Draft or prerelease publication record: excluded by the stable feed producer.
- Explicit preview fixture -> newer preview: offer from preview feed only.
- Network/unavailable feed: running app remains usable; no mutation/relaunch.
- Wrong platform, malformed manifest, invalid/missing signature, wrong key,
  truncated bytes or announced/signed-version mismatch: no install/relaunch;
  installed target hash unchanged. Last case requires signed-version enforcement.

Do not change production defaults before review. The contract above defines a
future change, not a claim the present app already enforces every row. Feed
publication status is not in ordinary Tauri static manifest JSON; it must be
validated by the channel/feed producer. Client stable SemVer filtering is an
additional guard against a contaminated endpoint, not a substitute.

## Current implementation and mismatches

- `src-tauri/tauri.conf.json`: one GitHub `/releases/latest/download/latest.json`
  endpoint, one public key, `createUpdaterArtifacts:true`; no channel choice,
  explicit `requireSignedVersion` or downgrade override.
- `.github/workflows/release.yml`: tag/manual builds always `releaseDraft:true`
  and `prerelease:true`, including a hypothetical1.0 tag. Publishing that
  prerelease alone will not populate GitHub's latest stable endpoint. No
  separately configured preview feed exists. Draft-first review is appropriate;
  the invariant prerelease flag is inconsistent with future stable publication.
- `src/desktop/updates.ts`: once-per-launch check; failures suppressed; install
  calls `downloadAndInstall()` then optional `process.relaunch()`. No channel
  filter, cancellation token, install-in-flight guard or explicit finished state.
- `UpdateBanner.tsx`: Install and restart / Later before install; no in-progress
  Cancel. Do not describe Later as download cancellation. Optional missing
  relaunch API currently leaves the UI installing after completed installation;
  missing relaunch and repeated invocation should receive focused coverage.
- `App.tsx` mounts UpdateBanner. `src-tauri/src/lib.rs` registers real updater and
  process plugins. `withGlobalTauri:true` plus the cached plugins' build.rs/
  api-iife.js genuinely provides `window.__TAURI__.updater` and `.process`.
  There is no need to add a JS plugin dependency merely to obtain that global.
- `src-tauri/capabilities/default.json` grants updater:default and
  process:allow-restart to main. Real ACL passage still needs native execution.
- Exactly three existing `src/desktop/updates.test.tsx` tests mock those globals:
  browser inertness; offer/explicit click/install/relaunch; no update and thrown
  install error. They prove UI orchestration with fakes, not transport/signature,
  ACL, executable replacement, restart, publication policy or native consent.

## Cached capabilities and relevant plugin behavior

Actual CLI2.12.3 supplies signer generate/sign, including --app-version. No new
signer dependency is needed. Locked native plugin is tauri-plugin-updater2.14.0.
Cached source is under
`/workspace/.toolchains/cargo/registry/src/index.crates.io-1949cf8c6b5b557f/tauri-plugin-updater-2.14.0`.
Its default comparator is `release.version > current_version`, so newer
prereleases are not independently excluded. Its config supports
`requireSignedVersion` (defaultfalse), `allowDowngrades` (defaultfalse), endpoint
and pubkey overrides. Signatures authenticate artifact bytes; the manifest is
not itself signed. `requireSignedVersion` binds the manifest version to the
signature trusted comment; enabling it for production requires compatible
previous-release inventory/re-signing review, not a silent flip here.

Global API check() returns a native-backed resource exposing download(),
install(), downloadAndInstall(), close() and version/currentVersion. No abort
API is promised by this app wrapper. UpdaterBuilder can override endpoints,
pubkey and comparator. Debug builds allow HTTP endpoints with a warning;
production release builds reject HTTP by default. Use debug-only loopback HTTP
inside network=none for this fixture; do not set production dangerous transport,
invalid-cert or invalid-hostname flags. A future release-mode fixture should
instead provide trusted loopback TLS without disabling certificate verification.

Linux install_appimage checks payload type/signature and replaces its selected
AppImage path, backing up on the same filesystem. UpdaterExt uses Tauri's
captured APPIMAGE environment when present. It restores the old file on handled
write/extraction errors. This is an implementation observation, not a crash/power
loss atomicity guarantee. The Linux path must be a disposable fixture AppImage,
not BG2's preserved original, the source target or a production installation.

## First execution gate UP1a: minimal native bridge / HTTP204 proof

Run this smaller gate before creating keys or implementing any apply/relaunch
fixture. No application code change is needed if it passes. Global registration
is established statically by both plugins' build.rs global_api_script_path and
api-iife.js, but a native request proves initialization plus ACL/invoke behavior.

A reviewed external bridge-config.json must contain exactly the fixed loopback
endpoint http://127.0.0.1:18749/bridge204, fixture-only identifier, updater
artifacts disabled and beforeBuildCommand empty. It is a compile-time overlay
for this named debug fixture, never an arbitrary runtime endpoint/environment
input and never a production config edit. Use a clean isolated worktree at
00e768b and the exact matching already-built production dist; preserve its
previous dist and verify every asset hash. Debug plugin source explicitly
permits HTTP; release configurations keep their existing HTTPS requirement.
Retain existing public key for this no-update check; no key material is needed.

The proposed command (inside the pinned offline native container) is:

```bash
node /workspace/astraea/node_modules/@tauri-apps/cli/tauri.js build \
  --debug --no-bundle --config /evidence/bridge-config.json \
  -- --locked --offline -j 1
```

Use a separate UP1a target directory or preserve/re-hash the original debug
binary; this config rebuild must not overwrite the preserved BG2 source binary.
There is no package build, new frontend build, signing, update offer or apply.
With shared cached dependencies, native config recompilation should be small;
stop if cache/tool setup requires an unexpected broad rebuild or acquisition.

Add an external loopback harness scripts/updater-bridge204.py in evidence (not
product source). It starts Python HTTPServer bound127.0.0.1:18749 in the same
network=none container, serves only /bridge204 with status204 and logs method,
path and timestamps. Launch the fixture binary under dbus-run-session/Xvfb,
HOME untouched, task-specific XDG directories, software context and a bounded
startup trace. Do not set ASTRAEA_SMOKE_OUT: that separate flight driver is not
this test. After one matching native request and root_present_5s, terminate only
this fixture process cleanly and close the server. Expected controlled stop is
recorded distinctly from native success/failure, never labeled app completion.

Pass: at least one exact /bridge204 GET from this app, endpoint log correlates
to its launch, correct app/config hashes, no artifact request, no installed-byte
change, bounded startup-root trace. Record request count; investigate unexpected
repeated checks without assuming plugin internals are one HTTP request. A
missing request is a failure requiring diagnosis of native global injection,
ACL/invoke or config initialization before proceeding to keys/apply. This gate
proves real native check transport only; it does not prove offer UI, signatures,
download, installation or relaunch. It should not add a product test seam merely
to prove a working bridge. Approval of UP1a is separate from the larger fixture
below, which remains a later reviewed packet.

## Proposed execution packet UP1: source ownership and entry seam

Implement only after review, in a new isolated worktree from the then-approved
integration head. Reserve:
- src/desktop/updates.ts + updates.test.tsx: channel adapter/filter, deterministic
  lifecycle injection and focused error/dismiss/double-click/missing-relaunch
  tests. Keep normal public API behavior until review of the contract change.
- src/desktop/UpdateBanner.tsx only if a reviewed lifecycle message changes.
- New src/desktop/updateFixture.ts: opt-in scripted native test driver that uses
  the *real* updater globals and clicks the actual banner buttons; no fake global.
- src-tauri/Cargo.toml: explicit non-default `updater-fixture` feature.
- src-tauri/src/lib.rs: feature-gated pre-page fixture instruction/report seam,
  bounded local report IPC and relaunch-receipt handling. Keep it separate from
  ASTRAEA_SMOKE_OUT, whose baseline driver currently exits and would race this
  fixture. Disabled builds must expose no test command, flag or endpoint override.
- New scripts/updater-fixture.mjs + narrowly scoped tests: feed construction,
  request log, orchestration, assertions and cleanup. It must reject any artifact
  target outside its own fixture directory and bind only127.0.0.1.
- External-only fixture config/version JSON and evidence; no production-key or
  endpoint edit. Production workflow/channel implementation is a separate review.

Configuration overlays can supply fixture endpoint/public key/version/identifier;
no general runtime production endpoint override is needed. The native-only
fixture driver gets bounded action instructions from the feature-gated native
injection. It observes real banner states, records events through report IPC,
and clicks Later or Install according to the chosen scenario. Log an explicit
`scripted_install_click` milestone: this is automated consent-path exercise,
not a human interactive acceptance witness.

Build A version0.9.0-updater-fixture.1 and B version0.9.0-updater-fixture.2 from
identical approved app source, with fixture identifier `com.astraea.updaterfixture`,
public key and loopback endpoint. Actual version must be compiled into each
native app. Re-labeling the old BG2 bytes as a newer manifest version is invalid.
A narrowly scoped build for changed config/fixture entry is necessary; it may
reuse cached dependencies/frontend/WASM and must not rerun broad science suites.
Do not use --no-binary-patching here unless the chosen AppImage bundle-type path
is independently proven; preserve source binaries and record any bundle patches.

## Concrete commands to implement/execute after approval

Commands below are the intended exact interface; updater-fixture.mjs and native
feature do not exist yet and must be implemented/reviewed first. `UP1_ROOT` and
`UP1_WT` are task-specific variables; never assign HOME.

```bash
UP1_ROOT=/workspace/astraea-plan/evidence/accuracy-first-batch-20261025/UP1
UP1_WT=/workspace/astraea-worktrees/updater-fixture-20261025
node /workspace/astraea/node_modules/@tauri-apps/cli/tauri.js --version
node /workspace/astraea/node_modules/vitest/vitest.mjs run src/desktop/updates.test.tsx
```

The focused tests run with cwd UP1_WT and the existing verified read-only CLI/
frontend dependency mounts, not pnpm install. Build execution uses the BG2
pinned image `sha256:9c6c230e1d815013fa34fcb6b9174d9a6f9e2a9ec68920b93f345e547c723174`,
locked official tool caches/runtime and one CPU/4GiB. The runner must emit its
complete Docker invocation and config/command hashes before execution.

```bash
umask 077
mkdir -p "$UP1_ROOT/private"
node /workspace/astraea/node_modules/@tauri-apps/cli/tauri.js signer generate \
  --ci --password '' --write-keys "$UP1_ROOT/private/fixture.key" \
  > "$UP1_ROOT/private/signer-generation.log" 2>&1
node "$UP1_WT/scripts/updater-fixture.mjs" prepare \
  --root "$UP1_ROOT" --public-key "$UP1_ROOT/private/fixture.key.pub" \
  --version-a 0.9.0-updater-fixture.1 --version-b 0.9.0-updater-fixture.2 \
  --bind 127.0.0.1 --port 18749
```

Prepare must write config-a.json/config-b.json with native versions, fixture
identifier, fixture-only public key and `http://127.0.0.1:18749/latest.json`,
requireSignedVersion:true, allowDowngrades:false, no dangerous TLS switches.
The fixture native build commands, each inside the offline container, are:

```bash
node /workspace/astraea/node_modules/@tauri-apps/cli/tauri.js build \
  --debug --no-bundle --features updater-fixture \
  --config "$UP1_ROOT/config-a.json" -- --locked --offline -j 1
node /workspace/astraea/node_modules/@tauri-apps/cli/tauri.js bundle \
  --debug --bundles appimage --no-sign --features updater-fixture \
  --config "$UP1_ROOT/config-a.json"
```

Use separate task-specific target directories or copy A's resulting package
before B; repeat with config-b.json. Both overlays skip beforeBuildCommand only
when their matching reviewed fixture frontend has already been built. Their
bundle.createUpdaterArtifacts=false avoids accidental environment signing;
sign the exact completed B file explicitly:

```bash
node /workspace/astraea/node_modules/@tauri-apps/cli/tauri.js signer sign \
  --private-key-path "$UP1_ROOT/private/fixture.key" --password '' \
  --app-version 0.9.0-updater-fixture.2 "$UP1_ROOT/packages/B.AppImage" \
  > "$UP1_ROOT/private/signer-signing.log" 2>&1
node "$UP1_WT/scripts/updater-fixture.mjs" run \
  --root "$UP1_ROOT" --scenarios defer,valid,bad-signature,tampered-payload,offline,signed-version-mismatch \
  --bind 127.0.0.1 --port 18749 --timeout-seconds 120
node "$UP1_WT/scripts/updater-fixture.mjs" verify --root "$UP1_ROOT"
```

No secret output enters normal logs/manifests. Private files0700/0600 remain
outside Git; preserve only public key/signatures and public hashes in the final
report. Destroy only this packet's ephemeral private key after approved fixture
completion. Never inspect existing production keys/secrets.

Run server and app in the *same* network=none container so loopback works with
no port publishing. Server logs exact manifest/artifact GET counts and bytes.
Static feed shape is `{version,notes,pub_date,platforms:{"linux-x86_64":{url,
signature}}}` (also verify plugin target selection in the actual run).
Serve B.AppImage as raw bytes with its exact signature; no tar variant ambiguity.

To avoid FUSE, launch disposable `installed/AstraeaFixture.AppImage` with its own
`--appimage-extract-and-run`, APPIMAGE_EXTRACT_AND_RUN=1, Xvfb/software context,
read-only passwd/group lookup and task-specific XDG directories. Verify native
captured APPIMAGE points at that disposable installed file *before enabling
install*. Plain extracted AppRun without correct captured APPIMAGE cannot count
as an AppImage update test. A post-update fresh process must report native
getVersion()==B and own executable/package hash==B, not merely echo the feed.
First prove byte replacement+fresh launch, then separately exercise the actual
process.relaunch path and observe the new PID/version receipt; do not infer
relaunch acceptance from a mocked Promise or manual launch alone.

## Evidence, success, failure and rollback

For every scenario record app source/feature diff, config and public-key hashes,
A/B compiled versions and package hashes, signer/runtime/tool image IDs, request
log, native reports, package hashes before/after, real PID transitions, versions
reported by fresh processes and exit codes. Preserve failed/unscorable runs.

Success requires deferred path has zero artifact requests and unchanged A;
valid path has explicit scripted install click, real native signature success,
installed file equals B, old app exits/restarts as observed, new process reports
B, and saved fixture project survives. Invalid signature/tampering/version
binding failures must leave A byte-identical, show failure, not relaunch and
still permit the fixture app to run. A second check from B offers nothing.
Offline feed failure stays quiet and leaves normal app interactions usable.

“Cancel” closes only pre-install Later semantics until an actual cancellation
API/product contract is implemented; stopping/killing the process is not a pass.
Do not claim a power-loss rollback guarantee from plugin unit tests.

Rollback is local fixture recovery: stop only this packet's app/server; preserve
logs and failed installed bytes; copy the hashed original A backup to its
*disposable* install path and relaunch it. Never downgrade through production
feed/config or overwrite BG2 artifacts. A failed same-filesystem rename/write
scenario should validate plugin's handled rollback separately if a controlled
fixture can inject it safely; do not manufacture it with host filesystem changes.

Stop on first diagnosed external/setup failure after one focused rework. No
production keys/feed, network policy, host packages, paid infrastructure,
publication or outreach. Native Linux fixture success would qualify real local
signature/download/apply/relaunch for that fixture only; it would not qualify
production release transport, actual Windows/macOS installers, human interaction,
hardware GPU or flight accuracy.

## Feasibility / disposition

Local execution is feasible with cached signer/native/plugin and BG2 toolchain.
Outstanding work is a reviewed, narrowly gated app entry/report driver plus two
real compiled versions and deterministic loopback runner. Existing mocks alone
cannot close this gate. Stable/preview production channel and signed-version
migration need explicit configuration/workflow review; defaults remain unchanged
in UP0. All commands above are proposed and unexecuted.
