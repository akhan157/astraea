# RMP18 rights/security — result

Lane `rmp18-rights-security`, worktree at the accepted pin
`0f6f08eed60a06946d11306371dca1841a3f2e26`. Author route: OMP direct
`deepseek/deepseek-flash`, catalog DeepSeek V4.1 Flash 1017, max thinking, no
fallback. No self-acceptance: this record is input to the coordinator's review.

Commits (local, serial):

| Commit | Content |
| --- | --- |
| `165a3a943cbcd482008e73247222da704795c357` | A: remove `log_download`; B: deterministic notice generator, committed notices, rights inventory, panel link |
| `7e96b2a27a92a74fa5182fc15799a2ad2a9bd076` | C: legacy-model claim scoping; delete the wording/echo/href test block; landing footer notices link |
| `d1c7fc120e12713d5f2e50759898d9edee7c9c36` | docs/changelog: accuracy-page scope sentence, obsolete checklist row, changelog entries |

## Target A — native private URL/path logging removed

- `src-tauri/src/lib.rs`: `log_download` and the imports that became unused
  (`OpenOptions`, `Write`, `SystemTime`, `UNIX_EPOCH`, `DownloadEvent`) are gone.
  `Duration`, `Path`, `PathBuf`, `PermissionKind`, `PermissionResponse` remain in
  use. `.on_download(|_webview, _event| true)` keeps the hook and its privacy
  comment; `AutomaticDownloads => Allow` is unchanged, so later downloads behave
  as before. No file, URL or destination/path is recorded.
- Proof of deletion: `grep -n "log_download\|astraea-download\|OpenOptions\|
  DownloadEvent\|SystemTime\|UNIX_EPOCH" src-tauri/src/lib.rs` → no matches.
- `rustfmt --check` **could not run**: the component is not installed for the
  active toolchain (`rustup component list --installed` has no rustfmt;
  `rustfmt --version` errors). Installing it needs network, so it was not done.
  Substitute parse-level check: `rustc --edition 2021 --crate-type lib
  --emit=metadata src-tauri/src/lib.rs` reports only E0432/E0433 unresolved-crate
  errors (17 resolution errors, no syntax errors), saved as
  `native-parse.txt` in the external evidence directory.
- **The delete cannot be typechecked offline**: the local Cargo registry has 0 of
  the 473 crates in `src-tauri/Cargo.lock` (only 21 engine crates). No Cargo/Tauri
  build was attempted. The release build owner must compile it.
- Failing-before evidence (retained from the approved proposal, extracted-source
  proof, **not installed-Tauri acceptance**): exact 10-line function text
  (`974ed8fa…0eed25b`), isolated `TMPDIR`, rustc 1.99.1.
  - predictable `$TMPDIR/astraea-download.log`, mode `644`, 336 B containing
    `requested url=… dest="/home/example-user/…"` and `finished … path="…"`;
  - a pre-existing symlink at that path was followed and the two lines were
    appended into the linked user file (19 → 355 B);
  - 2,000 calls → 324,000 B with no cap.
  Evidence: `~/.paseo/worktrees/3s8t98rp/evidence-rmp18-rights-security/`
  (`REPRO.json`, `repro-*.log`, `log_download_exact.rs`, `repro-harness.rs`).
- After-fix limitation: there is no native runtime, OS-temp or multi-user proof;
  the change is source-level only. No installed-Tauri acceptance is claimed.

## Target B — bundled notices

- `public/third-party-notices.txt` (300,310 bytes, sha256
  `9f56d3cf4ed4f7335bdf17644552464e5a43cf9d5c8d3a4c598fafc7e1b8cd86`) with
  70 distinct JavaScript texts (153 packages), 2 font licence texts (verbatim,
  copyright lines included), 14 distinct engine-crate texts (21 crates), the
  first-party Apache-2.0 text, and an unresolved section naming exactly the 8
  packages without installed texts plus the native closure, NASA CEA data and
  motor-curve provenance. `webgl-constants` is recorded as “no SPDX field” with
  its shipped MIT text.
- `scripts/third-party-notices.mjs` reads only local packages/workspace, uses no
  new dependency and no network, and is deterministic: two consecutive runs
  produced the same sha256; all lists sorted by code unit; no timestamps,
  absolute paths, machine or user names (grep clean). `--check` exits 0 on the
  committed file and exited 1 with the first differing line after a deliberate
  append; the file was then restored and re-checked.
- Access: landing footer link and `ModelStatusPanel` validation-row link
  (`../third-party-notices.txt`), both present in the built output.
- `docs/internal/third-party-notices-inventory.md` records surface counts, the
  known/unverified split, responsible roles and reopening conditions, and states
  that the JSZip `MIT OR GPL-3.0-or-later` election under MIT is a licence
  choice, not legal sign-off.
- Coverage caveat: the notice file covers the production dependency closure, a
  superset of any tree-shaken bundle. It is not a legal audit and does not
  enumerate the native closure.

## Target C — claim scoping

- Shared claim now reads: `Legacy model only. Apogee tested blind on one small
  subsonic rocket: predictions ran 6–10% high. That evidence does not cover the
  experimental candidate model. Other vehicles and supersonic flight are
  untested. Not flight approval.` The original sentence, values and provenance
  are unchanged.
- Rendered in the Workstation banner, `ModelStatusPanel` validation row and the
  landing beta notice; the linked `docs/accuracy.md` carries one scope sentence.
- Deleted `ModelStatusPanel.test.tsx` block that pinned the wording, echoed the
  constant and asserted a static href, with its now-unused import. No repin, no
  new text test. Other tests and the existing browser wording checks still pass.
- Gates unchanged: the blind test remains a fail under its own rule; G4 is not
  met; the candidate model is unqualified. No protected flight was accessed.

## Checks actually run

| Command | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| `node node_modules/vitest/vitest.mjs run src/console/evidence/ModelStatusPanel.test.tsx src/console/stageRendering.test.tsx --maxWorkers=1` | 2 files, 5 tests passed |
| `node node_modules/vite/bin/vite.js build` (Vite only; no engine rebuild) | exit 0, built in 2.76 s; `src/engine/astraea_engine.wasm` and `dist/assets/astraea_engine-hYBby-qG.wasm` both `13da44d5…f0022328` before and after |
| `node scripts/third-party-notices.mjs --check` | exit 0 |
| determinism / stale probe | same sha on two runs; `--check` exit 1 on a deliberate append, then restored |
| `node scripts/browser-smoke.mjs` | engine run under production CSP passed (533 m); **suite then failed at a pre-existing selector** — see below |
| throwaway Playwright probe against `dist/` with the production CSP | passed: notices fetched `200 text/plain`, banner/panel scoped, candidate project imported (`native-candidate-static-rate/1.0.0`) with the same scoped claim, two panel links, zero page errors, zero CSP violations |

Built output identity: `dist/index.html` `a5c37c6e…c05d9c`,
`dist/assets/app-CqUrGN6r.js` `dfb4c8a9…b6a63f`,
`dist/assets/vendor-DPSsl3MV.js` `44a11b49…334fbd`.

## Retained failures

1. **Pre-existing browser-suite failure, not caused by this lane.**
   `scripts/preview-journeys.mjs:40` locates the palette button by accessible name
   `/Search, or type/`, but `src/console/shell/Shell.tsx:63` gives it
   `aria-label="Command palette  Ctrl+K"` (introduced in `bc24da7`; the locator
   predates it in `ac9cec7`). The smoke run and the landing-disclosure journey
   passed first; the suite aborted before the later journeys. Neither file was
   modified here. Full log: external `browser-suite-failure.log`.
2. **Default-preset candidate enable refused by its own preflight.**
   The NASA Student Launch preset cannot enable the candidate model: nose profile
   `vonkarman` unsupported and a flagged motor mount is refused by the accepted
   adapter (`probe-form-refusal.json`, `import-debug.png`). Candidate-selected
   claim coverage was therefore proven by importing the accepted saved candidate
   project (`candidate-project-saved.astraea.json`, model
   `native-candidate-static-rate/1.0.0`), not by editing the preset.

## Residuals / not done

- No native compile, link, installer or runtime acceptance; `rustfmt` unavailable.
- No legal review or sign-off; 8 JS packages lack installed licence texts; the
  472-crate native closure is not enumerated; NASA CEA data, manufacturer thrust
  curves and landing-image provenance remain unverified with named owners.
- No engine rebuild, no WASM/identity change, no capability/CSP/dependency/lock/
  updater/schema/register/TASKS/handoff/historical-evidence change, and no
  `rmp13` ensemble/sampler surface touched.
- The pre-existing browser-suite selector failure is left for the coordinator; it
  is outside this lease and would otherwise mask later journeys in the merged
  re-run.
