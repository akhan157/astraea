# Website publish — 2026-11-08

Owner goal: set up the website version and publish it (landing page + app), link it
from GitHub, up to date with the latest app release.

## Result

| Item | State |
|---|---|
| Production URL | https://astraea-5e2.pages.dev/ (landing), https://astraea-5e2.pages.dev/app/ (app) |
| Deployed from | `astraea-dev` `main@f70a0d0`, run 42504977114 (success) |
| Release parity | Latest release v0.10.0 = public `ee54b6e` = dev `0a7e8f0` (tree-identical minus private paths); the deploy adds copy/test changes only |
| GitHub link | README link row + "About" homepage on both `akhan157/astraea` and `astraea-dev` |
| Public export | `akhan157/astraea` `3599bc6` = dev `f70a0d0` minus `docs/internal/session-handoff/` and `SESSION-HANDOFF.md`, no-reply author |

## Changes

- `721e271` — landing download cards link the v0.10.0 pre-release (version from
  `package.json`); README links the live app and downloads; stale "unpublished" copy removed.
- `3ad4701` — `scripts/preview-journeys.mjs`: the old guard required zero release
  links (premise: installers unpublished). Replaced with an exact check: only the three
  OS cards, each linking to `releases/tag/v<package version>`. Old page and a stale
  version both fail it. First deploy of `f40ed00` (run 42503897611) was blocked by the
  old guard — production was not changed by that run.
- `Website` workflow re-enabled on `astraea-dev` (it had been `disabled_manually`).
  Still disabled on the public repo; deploys come from dev only.

## Checks run

- Local lane: `pnpm build`; `vitest src/landing` 5/5; `pnpm test:browser` exit 0.
- Built landing screenshot at 1280 and 390 px (Chromium).
- CI runs 42503674677 (`0a7e8f0`) and 42504977114 (`f70a0d0`): build + full
  browser acceptance + Cloudflare deploy, both success.
- Live: `ASTRAEA_PREVIEW_URL=https://astraea-5e2.pages.dev/ pnpm test:browser` —
  44 checks passed (production-CSP WASM flight 533 m, landing, all stages, presets,
  ensemble, imports/exports) then stopped at "Saved calibration identifies the exact
  production bytes": expected local wasm `3cab302e…`, live `f4d37535…`. Cause: the wasm
  embeds absolute build paths (21 `/home/ak`/cargo-registry strings), so bytes differ
  per machine even on the same rustc 1.99.1. CI ran that check on the deployed bytes
  and passed. Journeys after that step were not run against the live URL.

## Not done

- No custom domain (would need DNS / a domain purchase).
- Wasm not byte-reproducible across machines; `--remap-path-prefix` would fix it
  (separate lane if wanted).
- Draft v1.0.0 desktop release stays unpublished.
