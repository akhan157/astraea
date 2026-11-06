# Current-source Linux embedded smoke — 2026-10-25

## Subsequent local package check

The same verified executable and frontend now also produce an **unsigned debug
AppImage** using a pinned derivative of the verification image. Official tool
assets and exact Debian snapshot packages were locked and SHA-256 checked;
bundling ran offline with one CPU/4 GiB, signing and binary patching disabled.
The native executable remained byte-identical. No host packages were changed.

The package is 164,760,056 bytes, SHA-256
`e5d921c11872273d882023fd41d126294193dd0f70cfb8e403aa548720350ade`.
The original executable retains `d5938bc6…`; linuxdeploy adjusts ELF paths in its
deployed copy, whose extracted SHA-256 is
`c675f3c273fb4c6488b9ace1ca19b84281c72b89429249854af1f0e627f1c904`.
The derivative image is
`sha256:9c6c230e1d815013fa34fcb6b9174d9a6f9e2a9ec68920b93f345e547c723174`.
The [package manifest](delivery-review-2026-10-25-native-package.json) records
source identity, locks, reports and exit codes.

Its own AppRun payload was extracted without FUSE and launched offline under
Xvfb. The packaged WASM-worker flight reached touchdown with apogee
533.076171 m, maximum Mach 0.291179, rail departure 18.898937 m/s and no page
errors. Native process and report checker both passed; report elapsed time was
3,578 ms. The checker says macOS and renderer says Apple GPU; this is Linux
software-context evidence, not hardware or macOS acceptance.

The first packaging attempts are retained. Verbose diagnosis showed that the
AppImage plugin attempted to download a missing type2 runtime despite the
otherwise populated cache. The focused rework locked the official runtime
asset/digest and supplied it through the inspected local-runtime option; final
bundling stayed offline. This is package/extracted-runtime smoke, not an actual
desktop installation, production release/signature or updater acceptance.

Exact source/tool/package/image locks, commands, hashes, failures and reports:
`/workspace/astraea-plan/evidence/background-release-20261025/packaging-preflight/bg2/`.

## Original embedded-runtime check

Source `761d6c3fd80ba7188e00603dee741719ef1a41c5` now has a fresh Linux
native debug compilation with the current production frontend embedded. The
isolated native worktree was clean before fast-forwarding; its previous ignored
frontend bundle was preserved. Every copied frontend file matches the root
production bundle by SHA-256. No dependency installation or frontend rebuild
was performed in this lane.

The direct Node Tauri CLI used the normal `frontendDist`, skipped only the
already-completed frontend build command, and passed `--locked --offline -j 1`
to Cargo. Compilation passed in 4.59 s. The cached Linux verification image is
`sha256:dd164847fef80a117724f17125d06a39ed778cd2c99d53e02eeed68b1236fb03`.
The container had no network, one CPU and a 4 GiB memory limit.

An actual Xvfb/software-context launch completed the embedded WebAssembly worker
flight through touchdown: apogee 533.076171 m, maximum Mach 0.291179 and rail-exit
speed 18.898937 m/s, with no page errors. Both the native process and existing
report checker exited zero. The checker filename/output says macOS; this run is
Linux. Its renderer label is not evidence of a hardware GPU.

The debug executable SHA-256 is
`d5938bc6a5ee9201695cd67f5f3702b28eccf9641d6eef51d463b5f08873ccfd`.
The embedded frontend's WASM asset matches current source WASM, SHA-256
`c1a1a177d56b73e4f5862d29098743e0bc31f51499d1c7534776b34ba2e8c4fe`.
Desktop Rust sources are unchanged since the prior native checkpoint `637f067`;
its 12 passing desktop unit tests remain applicable and were not rerun or counted
as new tests. The changed frontend is the reason for this fresh compilation and
embedded runtime check.

The first runtime attempt exited 127 before application startup because D-Bus
could not resolve the container's task UID. Read-only account database mounts
supply that lookup. The final launch uses task-specific XDG writable paths and
preserves HOME. Earlier failed and superseded attempts remain in evidence.

This closes the current-source embedded Linux smoke gap. Installer installation,
native file/dialog/export interactions, hardware GPU and accessibility checks,
Windows installed-app diagnosis, interactive macOS acceptance, signing and
controlled updater installation remain open. External historical package/VM
reports are still unavailable locally. No source publication, release, deployment,
signing operation or external contact occurred. This is software/runtime evidence,
not independent flight validation.

A source review also confirms an unresolved updater delivery gate: the configured
GitHub `/releases/latest/download/latest.json` endpoint is paired with a workflow
that creates draft prereleases. Publishing a prerelease alone does not make it
the latest stable release. The intended stable/prerelease channel and a controlled
signed local update test still need resolution; this smoke neither changes that
policy nor claims updater acceptance.

Commands, exit codes, the complete frontend hash inventory, native report,
startup trace and artifact manifest are retained under
`/workspace/astraea-plan/evidence/background-release-20261025/`.
