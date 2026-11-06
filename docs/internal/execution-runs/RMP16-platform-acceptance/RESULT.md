# RMP16 — Windows 11 x64 installed acceptance (partial)

Date: 2026-10-30. Source commit `0b5828b14dd9990543736fbd103a02d8d30695d0`
(branch `continue-task`). Disposable QEMU guest, Windows 11 Enterprise
Evaluation 10.0.26100, 2 vCPU, 3.9 GB, WebView2 156.0.4314.50. No author lane
worked on this; the coordinator ran every step. The independent reviewer
(`REVIEW.md`) rejected the first draft's save/offline/uninstall/MSI claims until
receipts were attached; this file records the corrected, receipted state.

## What the artifacts establish

- **The delivered source builds a real Windows desktop package.** The guest tree
  reconciles to the commit file by file: 1180 of 1181 tracked paths are
  byte-identical. The one difference is `src-tauri/gen/schemas/windows-schema.json`,
  a generated file the build refreshes: the committed copy is 117,263 B while the
  guest's regenerated copy is 407,362 B and equals the committed
  `desktop-schema.json`/`linux-schema.json` content. That is a stale generated
  artifact in the tree, not authored source.
- **Exact artifact identities** (`raw/bundle-hashes.txt`, `raw/build-transcript.log`):
  NSIS setup `8829782960d8…` (5,444,343 B), MSI `d3e4aaab72a1…` (6,901,760 B).
- **Both installers install and uninstall.** NSIS silent install exit 0 into
  `%LOCALAPPDATA%\Astraea Workstation`, installed exe `356948cb3ab5…`
  (16,525,312 B), uninstaller `89f7424aae1a…`, registry 0.9.0; uninstall exit 0,
  directory and registry entry gone (`raw/nsis-cycle.txt`). MSI silent install
  exit 0 into `C:\Program Files\Astraea Workstation`, product code
  `{E52C63AF-3564-4985-AF7D-B26CA43F2329}`; uninstall exit 0, directory and
  registry entry gone (`raw/msi-cycle.txt`, MSI logs retained).
- **Why the installed exe hash differs from the build-tree exe.** Exactly three
  bytes at offset 13,306,323: the NSIS bundler rewrites its own
  `__TAURI_BUNDLE_TYPE_VAR_UNK` marker to `…_NSS` in the packaged copy
  (`raw/exe-byte-diff.txt`). Nothing else differs.
- **The installed package starts and completes its startup flight under the
  production CSP.** Instrumented launch: window built 421 ms, page load finished
  702 ms, `DOMContentLoaded` 1,043 ms, `load` 1,495 ms, root populated by 5,552 ms;
  no CSP event was recorded by the instrumentation and the smoke records zero
  page errors (`raw/startup-trace-interactive.jsonl`,
  `raw/smoke-interactive.json`). Smoke: `ok: true`, `validity: PASS`, WASM worker
  pool started, apogee 533.076 m, 67.853 s, Mach 0.291, rail exit 18.899 m/s,
  touchdown. WebGL through ANGLE on the Microsoft Basic Render Driver.
- **Offline launch works with a recorded network block.** An enabled outbound
  block rule (`astraea-offline`, outbound, block) was active during the launch;
  its application filter was not captured, so the claim is "an outbound block
  rule was active", not "scoped to the exe". The app relaunched with exit 0 and
  identical numbers, and the rule was removed (0 remaining) — all in
  `raw/offline-firewall.txt`, `raw/offline-exit2.txt`, `raw/smoke-offline2.json`.
- **Native save/open works.** The Save As dialog received
  `C:\smoke\win-journey.astraea` (`raw/screen-w25-typed-save-path.jpg`); the app
  wrote 4,793,827 bytes, sha256 `2b3fc04a…`, schema 1.12.0, 7 components,
  2 motor records, revision 1, one `flight` case with flight outputs and
  telemetry (`raw/saved-project.txt`, `raw/saved-project-summary.txt`). In a fresh app session,
  Project → Open project file… imported it and reported
  'Opened project "NASA Student Launch Target Vehicle" (revision 1)'
  (`raw/screen-w29.jpg`); the stored flight case is retained as history, not
  re-run. "Save to this browser" stored revision 1 in the local slot
  (`raw/screen-w20-slot-status.jpg`).
- **Renderer loss and uninstall data behaviour are exercised.** A forced WebGL
  context loss on the installed app showed the labeled fallback while the tree
  and metrics stayed live, and "Restore viewport" brought the 3D view back (no
  edit/export was performed during the fallback). Uninstall left the user project
  file byte-identical and kept the app profile directory, and the local slot
  reopened as revision 1 after reinstall (`DATA-POLICY.md`,
  `raw/webgl-loss.json` is a step summary, `raw/retention-cycle.txt`). The
  no-hidden-copy statements are declared policy, not a filesystem search.
- **A real run works in the installed app**: a run triggered in the app produced
  "Committed r1 / Current / Valid run", gates 5/1, apogee 533 m
  (`raw/screen-w30.jpg`).

## Disclosures

- `raw/stderr-interactive.txt` and `raw/stderr-offline.txt` contain Chromium's
  benign `Failed to unregister class Chrome_WidgetWin_0. Error = 1412` at process
  exit. It is recorded so it is not mistaken for a page error.
- Starting the exe from the SSH session (a service, non-interactive window
  station) panics with WebView2 `Invalid window handle` (`0x80070578`). The same
  binary starts cleanly on the interactive desktop; WebView2 requires an
  interactive desktop. `raw/stderr-noninteractive-launch.txt` holds the panic.
  This is stated as a session observation; no raw file records the session id.
- The historical blank-WebView symptom (`2f28c65` package, 2026-10-24) was **not
  reproduced**: that package and the machine where it was observed are
  unavailable. The gap is retained rather than claimed as a failed reproduction,
  and no source change was made on a guess.
- `raw/build-transcript.log` is a short transcript (VS/link paths, fixture
  pubkey, bundle hashes). The build script is attached as
  `raw/build-script.ps1`; the artifact chain is anchored by the source manifest,
  the bundle hashes and the install manifests.

## What remains open

- **Signed upgrade** (RMP16-C03/C04): needs an owner-authorized signed B artifact
  and the production feed/key. The fixture key used here is not the production
  key; its password is redacted in the attached build script and the private key
  was never copied off the guest.
- ~~Renderer context loss~~: exercised on the installed app (test-only launch
  with the WebView2 DevTools endpoint). Forcing a context loss showed the
  labeled fallback with editing preserved, and "Restore viewport" brought the
  3D view back (`raw/webgl-loss.json`, `raw/screen-w32.jpg`,
  `raw/screen-w33.jpg`). The loss was forced in software WebGL; a hardware
  driver reset was not tested.
- ~~Declared uninstall data policy and post-uninstall user-project retention~~
  recorded: `DATA-POLICY.md` declares the behaviour, uninstall left the project
  file byte-identical and kept the app profile, and the local slot reopened as
  revision 1 after reinstall (`raw/retention-cycle.txt`,
  `raw/screen-w35.jpg`).
- macOS and hardware-GPU sessions, accessibility, migration/recovery flows.
- The package is unsigned and is **not** a release candidate.

## Build-environment notes

The first attempt was interrupted when the guest powered off during the 473-crate
compile; a second attempt thrashed at the final link on the 3.9 GB guest. Retrying
with `CARGO_BUILD_JOBS=1`, Defender exclusions for `C:\astraea`,
`C:\Users\ak\.cargo` and `C:\toolchain`, and sleep disabled completed the build
and both bundles in 4 minutes. This is a note about the disposable guest, not
about the product.
