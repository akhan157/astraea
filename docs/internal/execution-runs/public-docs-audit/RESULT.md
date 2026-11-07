# Lane result: public-docs-audit

## State

- Pin: parent `759dbb0`; assignment commit `572e686` (`docs(public-docs-audit): lane assignment`).
- Lane branch: `public-docs-audit` (renamed from the T3 worktree branch `t3/public-docs-audit`).
- Implementation commit: `70ffa5a78f6936b74ef0736f1294178ae46ed3a0`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.
- Status: **in_progress — implemented and checked, awaiting coordinator review**. The author
  did not self-accept, push, merge, tag, release or publish.

## Scope delivered

Owner-approved items 1 and 2 from the assignment, plus item 3.

### Public-facing docs

| File | Change |
|---|---|
| `README.md:158-159` | Replaced the link to `docs/internal/execution-package/` with plain text: "Roadmap and acceptance records are internal engineering records under `docs/internal/`." |
| `CONTRIBUTING.md:19` | Removed "The repository is currently private; cloning requires access." |
| `CHANGELOG.md:3-4` | Replaced the link to `docs/internal/engineering-changelog.md` with plain text: "Detailed internal engineering notes live in `docs/internal/`." |
| `docs/flight-validation/README.md:3` | Replaced the link to `../internal/project-status.md` with plain text "recorded in the internal project-status notes". |
| `docs/road-to-1.0.md:72` | "internal desktop checklist" -> "desktop acceptance checklist" (same record, no link, no status change). |
| `index.html:199` | "private draft release" -> "unpublished draft release". |
| `index.html:238` | "Source repository private during preview." -> "Source on GitHub." linked to `https://github.com/akhan157/astraea`. |
| `.github/workflows/ci.yml:7` | Added `workflow_dispatch:` to the `on:` block; no other workflow change. |

No changes were needed in `SECURITY.md`, `docs/accuracy.md`, `docs/team-data-request.md` or
`.github/ISSUE_TEMPLATE/*`: they contain no private-repo wording or links into
`docs/internal/`; their links are external URLs or resolve in the tree (including
`CODE_OF_CONDUCT.md` and `LICENSE`).

### The 31 dangling handoff links

Each markdown link was replaced with plain text naming the record plus
"(private coordination notes)". Sentence meaning and the surrounding claims are unchanged.

| File:line | Original target |
|---|---|
| `docs/internal/execution-package/packets/RMP02.md:21` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP02.md:23` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP03.md:20` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP03.md:22` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP04.md:20` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP04.md:22` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP05.md:21` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP05.md:23` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP11.md:16` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP11.md:18` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP14.md:16` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP14.md:18` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP15.md:48` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP15.md:50` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP15.md:52` | `../../session-handoff/coordination/RUN-20261025-REPRO.md` |
| `docs/internal/execution-package/packets/RMP16.md:16` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP16.md:18` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP16.md:22` | `../../session-handoff/coordination/assignments/platform.md` |
| `docs/internal/execution-package/packets/RMP17.md:16` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP17.md:18` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP17.md:22` | `../../session-handoff/coordination/assignments/workflows.md` |
| `docs/internal/execution-package/packets/RMP18.md:25` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/packets/RMP18.md:27` | `../../session-handoff/coordination/MODELS.md` |
| `docs/internal/execution-package/packets/RMP18.md:29` | `../../SESSION-HANDOFF.md` |
| `docs/internal/execution-package/STATE.md:41` | `../session-handoff/coordination/RUN-20261025.md` |
| `docs/internal/execution-package/STATE.md:53` | `../session-handoff/coordination/RUN-20261025-FIRST-BATCH.md` |
| `docs/internal/execution-package/STATE.md:54` | `../session-handoff/coordination/RUN-20261025-ACCURACY-PATH.md` |
| `docs/internal/execution-runs/RMP10-geometry-cp-support/GOAL-HANDOFF.md:50` | `../../session-handoff/coordination/ASTRAEA-GOAL.md` |
| `docs/internal/roadmap-to-collegiate-1.0-2026-10-26.md:576` | `session-handoff/coordination/MODELS.md` |
| `docs/internal/roadmap-to-collegiate-1.0-2026-10-26.md:602` | `session-handoff/coordination/TASKS.md` |
| `docs/internal/roadmap-to-collegiate-1.0-2026-10-26.md:603` | `session-handoff/coordination/RUN-20261026-FRICTION-PROVIDER.md` |

Residual non-link mentions of the excluded paths were deliberately left alone because the
assignment scopes item 2 to links: `docs/internal/execution-package/ARTIFACTS.md:12` (inline
code path), `docs/internal/execution-package/WIP-RECOVERY.md:47` (plain text),
`docs/internal/execution-runs/RMP07-candidate-app/PROPOSAL.md:50` (inline code path), and
`docs/internal/execution-runs/RMP10-geometry-cp-support/GOAL-HANDOFF.md:111` (inline code
path). `docs/internal/execution-runs/public-repo/RECORD.md` records the split itself and was
not rewritten.

## Checks

1. `pnpm install --frozen-lockfile` — pass (280 packages, lockfile policy verified, 302 ms).
2. `pnpm build:engine` — pass (release profile, `src/engine/astraea_engine.wasm` written).
3. `free -h` before the test run — 6.7 GiB available.
4. `npx vitest run --maxWorkers=2` — **pass: 165 test files, 1,947 tests, 257.80 s**.
   No test fixture under `docs/internal/` was moved or renamed.
5. Link check over the scoped files plus every changed file, against the public file set
   (this tree minus `docs/internal/session-handoff/` and `docs/internal/SESSION-HANDOFF.md`):
   - Before the edits: 31 broken links in 13 files, exactly the assignment's list.
   - After the edits: **0 broken; 150 links checked across 22 files**.
   - Checker: `/tmp/opencode/public-docs-linkcheck.mjs` (outside the repo). It accepts
     external URLs and same-page anchors, treats the two excluded paths as absent, accepts a
     relative directory target only if the directory exists, and resolves `index.html`
     root-relative and public-asset links through `public/` because Vite serves that folder
     at the site root (`/landing/*`, `/favicon.svg`, `./third-party-notices.txt`).
   - Command:
     `node /tmp/opencode/public-docs-linkcheck.mjs README.md CONTRIBUTING.md SECURITY.md CHANGELOG.md docs/accuracy.md docs/road-to-1.0.md docs/team-data-request.md docs/flight-validation/README.md index.html docs/internal/execution-package/STATE.md docs/internal/execution-package/packets/RMP02.md docs/internal/execution-package/packets/RMP03.md docs/internal/execution-package/packets/RMP04.md docs/internal/execution-package/packets/RMP05.md docs/internal/execution-package/packets/RMP11.md docs/internal/execution-package/packets/RMP14.md docs/internal/execution-package/packets/RMP15.md docs/internal/execution-package/packets/RMP16.md docs/internal/execution-package/packets/RMP17.md docs/internal/execution-package/packets/RMP18.md docs/internal/execution-runs/RMP10-geometry-cp-support/GOAL-HANDOFF.md docs/internal/roadmap-to-collegiate-1.0-2026-10-26.md`
6. `git diff --check` — clean.
7. Clone URL and public links checked by inspection against the public-repo record
   (`docs/internal/execution-runs/public-repo/RECORD.md`): `akhan157/astraea` is the public
   repo, so the README/CONTRIBUTING clone URL and the issue/security URLs are correct.

## Claims for owner review

Not modified, per the hard rule. Line numbers are after this lane's edits.

1. **Windows acceptance conflict.**
   - `README.md:146-148`: "**Windows** is verified in a Windows 11 VM (install, launch,
     production CSP, flight, persistence). **macOS** acceptance is still pending."
   - `docs/road-to-1.0.md:72` (status table dated 2026-10-22): "current Windows installers
     built and NSIS installed, but initial WebView is blank and feature acceptance remains
     open".
   These disagree on whether Windows acceptance is complete. A public reader sees both.
   Owner should confirm the current state and whether the roadmap row is a dated snapshot.
2. **Version wording.** `docs/road-to-1.0.md:3`: "Astraea 0.9 is a beta..." while
   `package.json` is `0.10.0`, `README.md:143-145` says "0.10 beta", and the badge says
   "0.10 beta". Looks outdated.
3. **Release plan wording.** `CHANGELOG.md:118-125`: the `0.9.0 — unreleased` section says
   "Planned first public release, as a **beta**", while `0.10.0 — unreleased` is listed
   above it and the current package is 0.10.0. Owner should say whether 0.9 or 0.10 is the
   intended first public release.
4. **Signed updates wording.** `CHANGELOG.md:315` (unpublished 1.0.0 release candidate)
   lists "Signed in-app updates for the desktop app", while `SECURITY.md:32-34` says the
   locally built Windows installer "is unsigned and its updater signatures use a fixture
   key; it is not a release." Historical section, but the two statements read as
   contradictory on signing.
5. **Development-flight number may predate a fix.** `docs/accuracy.md:43`: "Same airframe
   family, 11 G69N flights (development data) | +32 % | Found and fixed missing fin edge
   drag; remaining gap unexplained". The row does not say whether +32 % was measured before
   or after the fin-edge drag fix described in `CHANGELOG.md:202-205`; confirm the number is
   post-fix or label it pre-fix.
6. **Replay date.** `docs/flight-validation/README.md:13` heads the section "Current
   production replay (2026-10-20)", but the current numbers in that section are described as
   remeasured on 2026-10-21 after the fin drag terms were added. Minor date inconsistency.
7. **Landing-page platform list.** `index.html:37` says "Browser, Windows, macOS and Linux"
   while `README.md:146-148` says macOS acceptance is pending and the Linux desktop build
   needs WebKitGTK (browser app is the supported Linux path). The landing text may overstate
   desktop availability; draft-built installers exist but are unpublished.

## Deliberately not done

- No `src/`, `crates/`, `scripts/` or `public/` changes.
- No image or screenshot was opened, read or modified.
- No push, merge, tag, release, publish or external contact.
- No test assertions, schemas, thresholds or register/manifest/board/handoff files were
  edited.
