# W1 result — in progress, not self-accepted

Changed `index.html` and `src/console/evidenceClaims.ts` to the approved wording. This result file is also new.

Commands and exit codes:
- `pwd; git branch --show-current; git rev-parse HEAD`: 0; base `f4a41388749d415b0f48d888f4530cc7712af2cf`.
- `free -h`: 0; 9.3 GiB available.
- Assignment, source, package and status inspection (`cat`, `rg`, `sed`, `git status`): 0; `ls -ld node_modules src/engine/astraea_engine.wasm`: 2 (both absent).
- Python wording edit, dependency symlink, WASM copy, and `sha256sum`: 0; WASM hash `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff`.
- `./node_modules/.bin/tsc --noEmit`: 0.
- Initial focused vitest, full vitest and vite build: each failed (1), because the symlinked dependency directory is read-only for Vite's temporary config.
- `./node_modules/.bin/vitest run src/console/stageRendering.test.tsx --maxWorkers=2 --configLoader runner`: 0, one test passed.
- `./node_modules/.bin/vitest run --maxWorkers=2 --configLoader runner`: interrupted before completion; no verdict.
- `./node_modules/.bin/vite build --configLoader runner`: 0.

Screenshots: not captured. Production CSP browser verification, including the one-line banner at 1280 px, remains outstanding. The requested evidence directory is outside the writable sandbox. No server or browser was started. No push or network access. Independent review and acceptance remain outstanding.

## Orchestrator addendum (2026-11-15)

- **Commit:** made by the orchestrator, `9552599`, because the author's git index was read-only.
- **Checks:** tsc 0; full vitest 193/193 files and 2234/2234 tests; `vite build` 0.
- **Built app under the production CSP, 1280×800:**
  - The banner renders as one row, 24.9 px tall: "Beta · not flight approval · apogee error averaged 5.6% on 20 published rockets (development data)". Screenshot: `astraea-evidence/goal-collegiate-accuracy/W1/screenshots/app-banner-1280.png`.
  - The landing notice renders the approved text exactly. Screenshot: `landing-notice-1280.png`.
- **Smoke assertion:** `scripts/preview-journeys.mjs:130` checked the old headline ("6–10%") in the collapsed banner. The orchestrator updated it to the new headline: `5\.6%[\s\S]*development data`. It is checked to accept the new banner and reject the old one. The landing assertion (line 116) still matches unchanged.

## Review (claude-sonnet-5-5, high): ACCEPT WITH FINDINGS, and their disposition

| # | Finding | Disposition |
|---|---|---|
| 1 | The unit test pinned only the legacy figure | `stageRendering.test.tsx` now also asserts "apogee error averaged 5.6%" and "development data". It passes as written and fails when the figure is mutated to 9.9 % |
| 2 | Screenshot set incomplete | Added `app-banner-expanded-1280.png`. The model status panel uses the same `BETA_ACCURACY_CLAIM` constant, already pinned by the test |
| 3 | Possible gap in the landing screenshot | Not real. The landing markup has no break, so it is a capture artefact |
| 4 | "Shapes it cannot model use the legacy model" | Backed by K3: refused shapes fly legacy drag; the Spaceport template is unchanged; see `K3-improved-default/RESULT.md` |
| 4 | "Default model … 5.6 %" | Backed by K3 P1: the default sends arm B's inputs (Amendment 4 labelling) |
| 5 | `.github/workflows/release.yml:72` and `CHANGELOG.md:205` still use legacy-only wording | **Carried to the step-5 Release Readiness Report**, with `docs/accuracy.md` |
