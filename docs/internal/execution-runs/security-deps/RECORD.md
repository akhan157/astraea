# Security check and dependency fixes — 2026-11-08

Owner: "run security check on repo", then "fix all then push". Orchestrator-authored
(mechanical lockfile/CI edits); verified in CI, not self-approved.

## Check (on dev `main@edb3261`)

| Area | Finding |
|---|---|
| Secrets, 1,472 commits / all branches | None (GitHub/AWS/Anthropic/OpenAI/Cloudflare/Google/Slack tokens, private keys, signing keys, owner Gmail) |
| Shipped web deps (`pnpm audit --prod`) | 0 |
| Dev tooling (`pnpm audit`) | 17 (6 high): vite, vitest mocker, undici via jsdom, source-map-js |
| Rust (OSV, 472 crates) | src-tauri: zip 4.6.1 (7), rustls-webpki 0.103.15, webpki-root-certs 1.0.9, glib 0.18.5, proc-macro-error (unmaintained) |
| Live headers | CSP, frame-ancestors none, nosniff, permissions-policy; `.dev` is HSTS-preloaded |
| Tauri capabilities | fs write only to dialog-picked paths (no static fs scope) |
| Workflows | no pull_request_target; third-party actions tag-pinned |
| GitHub | Dependabot alerts off on both repos; secret scanning on (public) / off (private) |

## Fixes (merged `aeb288b`; public export `fc11c56`)

- `673bf09` tauri-plugin-updater 2.14.1 (zip 9.4.2), rustls-webpki 0.103.16, webpki-root-certs 1.0.11.
- `a3e741e` vite 8.3.6, vitest 5.1.0, jsdom 30.1.3 (undici 8.12.4), source-map-js 1.2.2.
- `38c5484` all third-party actions pinned to commit SHAs (version in a comment).
- Dependabot alerts enabled on `astraea` and `astraea-dev` (API 204).

## Evidence

- Lane: tsc 0; `pnpm build` 0; vitest 168 files / 1967 tests; `pnpm test:browser` exit 0.
- Local desktop compile impossible (no WebKitGTK on this host).
- Dev CI 42507126700 on `38c5484` (CI enabled for this run, then disabled again): desktop
  `cargo check`, astraea-core, engine parity, Chromium/Firefox/WebKit acceptance — all success.
- After merge: `pnpm audit` clean; OSV 475 crates → only glib 0.18.5 and proc-macro-error.
  Dependabot open alerts: 1 per repo (glib).
- Website run 42508332533 deployed `aeb288b`; `/` and `/app/` 200.
- Public CI 42508374043 on `fc11c56`: rust success; frontend failed once at
  `scripts/viewport-context-lifecycle.mjs:335` (`cameraPose` null, read without polling right
  after the Timeline click) — same tree passed this step in dev CI; re-run of the failed job passed (frontend + rust success) — flaky test, not a regression.

## Remaining

- glib 0.18 (RUSTSEC-2024-0429) / proc-macro-error: Tauri GTK3 stack on Linux; external
  (needs Tauri on gtk4). Our code does not call the affected glib iterators.
- Installed v0.10.0 apps are offered 0.10.1 through the update feed (see below).
- Flaky `cameraPose` read should poll like its neighbours (separate lane).

## 0.10.1 release (owner approved "Ok", 2026-11-08)

- Dev `1f09603` (lane `release-0.10.1`, version bump in package.json + 3 crates, CHANGELOG, README
  links). Local: tsc 0, build 0, vitest 1966/1967 (ShareFlightCard missed once under the full
  parallel run, 3/3 in isolation), `pnpm test:browser` exit 0.
- Public `c068ea1`, annotated tag `v0.10.1`. Release 42513087544: Windows, Linux, macOS arm64 and
  x64 bundles success; macOS smoke 42513087546 arm64 + Intel success; CI 42513085610 success.
- Draft checked before publishing: 17 assets; `latest.json` version 0.10.1, 11 platforms, every
  URL under `v0.10.1/`, all signatures key id `fa7c047b724303d2` = app pubkey = 0.10.0's key.
- Published as pre-release; update-feed run 42514392662 success; the app's first endpoint
  (`update-feed/latest.json`) now returns 0.10.1.
- Website run 42514451056 deployed `1f09603`; landing shows Beta 0.10.1 and links v0.10.1.
- Not verified: an actual in-app update from an installed 0.10.0 on a real machine.
