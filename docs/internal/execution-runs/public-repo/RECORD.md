# Public repository split — 2026-11-06

Owner direction: merge, verify, then make the repo public. After reviewing the scan,
the owner chose a fresh public repo with private history ("go with what you think is
best").

## Result

| Repo | Visibility | Contents |
|---|---|---|
| `akhan157/astraea-dev` (renamed from `akhan157/astraea`) | private | Full history (562 commits), all 17 branches, draft v1.0.0 release, every SHA cited in these records |
| `akhan157/astraea` (new) | **public** | One commit `d74e046` = tree of dev `main@d732e14` minus `docs/internal/session-handoff/` and `docs/internal/SESSION-HANDOFF.md`; author `72093369+akhan157@users.noreply.github.com` |

## Checks before publishing

- Secret scan of all 562 remote commits: no keys, tokens or passwords (the one
  assignment hit is a redacted placeholder). Third-party data: only the public Estes
  Cosmic Cargo log (provenance recorded), plus synthetic fixtures.
- Export tree: tsc 0; vitest 165 files / 1947 tests; astraea-engine 151 tests; build 0.
  Source tree `main@d732e14`: astraea-core 269 tests; browser acceptance 38 journeys (`c172d75`).
- Before creating the new repo, `origin` (and `paseo-pr-1`) in both local stores
  (`/home/ak/astraeat3/.git`, `/home/ak/astraea/.git`) was repointed to `astraea-dev`,
  so no research or lane worktree can push to the public repo. The research session was told.

## Public repo settings

Actions enabled, but the `Website` workflow is disabled (Cloudflare deploy needs owner
authorization and secrets). CI, macOS smoke and Release are unchanged (Release only runs
on `v*` tags; no release published). Private vulnerability reporting, secret scanning
and push protection are on. Topics and description were copied.

## Fresh anonymous clone

1 commit, 1362 files, 1 branch, 0 tags, no Gmail address, no session-handoff folder.
README, accuracy, security-policy and issues URLs return 200; `astraea-dev` is 404 to the public.

## Going forward

Development continues in `astraea-dev`. Milestones are published to `astraea` as a clean
export: same exclusions, no-reply author, tests run on the export first, and a commit
message citing the dev SHA. The planned next step is moving to public-first development
(lanes on the public repo through PRs, coordination notes kept private).

Not done: no deploy, no release, no tag. The desktop updater feed
(`releases/latest/download/latest.json`) returns nothing until a release is published
on the public repo.
