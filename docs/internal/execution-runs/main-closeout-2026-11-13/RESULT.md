# Main closeout — 2026-11-13 (control session on `main`)

Start: `main` @ `5c85b84`. End: `main` @ `6560dd7` (local, **not pushed**; pushing `main` deploys the website).
Orchestrator: Claude Opus 5.5 (control session). Lane authors: codex `gpt-6.1-terra`, reasoningEffort medium.
Every lane was reviewed by the orchestrator (different model family from the author). No author accepted its own work.

## Items and dispositions

| # | Item | Disposition | Evidence |
|---|---|---|---|
| 1 | Dispersion `axialDrag` raw render (REVIEW-GUARD-CLOSEOUT "Limitations") | **Fixed**: lane `fix-dispersion-drag-render`, merged `d5b0b48` | Falsifier reproduced by the reviewer: new tests 6 fail / 39 pass on base production files; 45/45 with the fix. SavedRuns already guarded (retention test added). |
| 2 | Full browser smoke on main | **PASS on `6560dd7`** (exit 0, full suite, Chromium, production CSP) after two defects it exposed were fixed (rows 6–7) | `pnpm test:browser` log lines below |
| 3a | Mission site editor 0–20,000 m + temperature | **Built-app verified** | 1e9 and −5 rejected with the range message; "abc" rejected; 1400 m / 22 °C accepted; 20,000 m boundary accepted; temperature kept after a later altitude-only edit (Flight summary "Site temperature 22 °C") |
| 3b | Help text "Set launch-site altitude and temperature in Mission" | **Built-app verified** | It renders in Mission's launch inspector (`LaunchInspector`, mounted at `Mission.tsx:102`), not on the Flight page |
| 3c | R8-F3 candidate flow on the NASA stack | **Built-app verified**: the t=0 "motor aft station" refusal is gone | Walkthrough repro: wind 3 m/s → honest incidence-envelope refusal at t=0; calm wind → flies to t≈10.33 s, then the candidate model's incidence ≤5° envelope refusal (speculative=true). This is a model-envelope limit, not a readiness/input mismatch |
| 3d | Motor R4-F1, R4-F2, R4b-F1, R4b-F2, R4c-F1, R4c-F2 | **Built-app verified** (all six) | "1550.0 N·s rated"; curve path 14 px inside its SVG; the calculators' note shows on three tools; BATES OD 1e9 → "Too many grain samples…"; imperial "⌀2.13 in in a ⌀5.71 in bore"; imported A8 shows in the card and is "In use." R4b-F1 was checked with a local test-only .eng file, **not** a live ThrustCurve search (no external contact); search import is unit-test-only |
| 4 | ARCAS benchmark `pnpm test:arcas-runtime` | **PASS** on `5c85b84` (2/2) | — |
| 5 | Tidy-ups | **Not done**: owner list (below) | — |
| 6 | NEW: 1280×800 Flight free region 186.8 px < 220 (smoke) | **Fixed**: lane `fix-flight-chrome-1280`, merged `160ca58`: 239.6 px, rocket 180.6 px | Causes measured against `10b619d`: chooser pill wrap from `5d5a07b` (−17.25 px); session-restore bar from `af43d61` (−25.5 px). Owner decision 2026-11-13: the smoke dismisses the restore bar before measuring; thresholds unchanged. R8-F5 candidate form still fits at 1280 (screenshot reviewed) |
| 7 | NEW: "Load saved inputs" on a certified motor, then reload or file open → Run disabled, "motor 'restored_…' is not in the catalog" | **Fixed**: lane `fix-restored-motor-reload`, merged `6560dd7` | `adoptProject` skipped every `certified` record, including content-pinned `restored_*` copies. Falsifier: 2 restore tests fail on `160ca58`. The reviewer narrowed the author's rule (`930559c`) so non-certified records keep their base behaviour |

## Final merged-tree checks (`6560dd7`, run by the orchestrator, serial)

- `pnpm build` (engine + tsc + vite): exit 0. Engine `dist/assets/astraea_engine-*.wasm` sha256 `4ff8af43…6635db316` (build-folder dependent; weak identity).
- `pnpm exec tsc --noEmit`: exit 0.
- `pnpm exec vitest run --maxWorkers=2`: 184 files / 2149 tests, exit 0.
- `pnpm test:browser`: exit 0. Includes "1280×800 Flight free region 239.6 px tall; rocket 180.6 px", the saved-input rerun, the accuracy journeys and share-flight.
- `ASTRAEA_ONLY_JOURNEYS=accuracy pnpm test:browser`: exit 0; default baseline 533 m.

## Known notes (not fixed here)

- **Coverage gap in the full smoke:** since `af43d61` (session restore), `accuracyBundleJourneys`' `page.goto` restores the previous journey's project, so its "default project" step runs on a non-default project (baseline 372 m in the full run vs 533 m fresh). It passes either way; the scoped run (`ASTRAEA_ONLY_JOURNEYS=accuracy`) still covers the true default. Changing the journey needs owner approval.
- `src/sim/monteCarlo.test.ts` "keeps every perturbed rail elevation inside the solver domain" took 391 s and hit its 300 s timeout under load (load avg ~14) in one full run; it passed alone (30/30, 308.8 s file). It runs close to its limit.
- The Mission site card shows elevation and wind only, not temperature (unchanged design; the Flight launch summary shows it).

## Not done

- No push, tag, release or deploy (a `main` push deploys the website: owner OK required).
- Physical-accuracy register untouched (128 = 67 pass + 59 blocked + 1 n/a + 1 not_run, on `accuracy/integration`).
- Tidy-ups awaiting owner OK: root `RESULT.md` holds several appended lane reports; the root `ASSIGNMENT.md` is a tracked stale `perf-render-probe` assignment; merged branches/worktrees could be deleted (`integrate/main-closeout`, `integrate/main-closeout-2`, `integrate/engine-float-port`, `fix-*` lanes incl. today's three, `t3/app-walkthrough-test-plan`); untracked `option-compare.*` probes in `/home/ak/astraeat3` left alone.

Evidence outside the repo: `~/astraea-walkthroughs-2026-11-12/main-checks-2026-11-13/` (check scripts, screenshots, `results.json`, `recheck.json`, `logs/` with every build/test/smoke log, `flight-chrome/` lane screenshots and smoke logs).

## Tidy-up (2026-11-14, owner-approved)

- Root `RESULT.md` was split verbatim into `docs/internal/execution-runs/<lane>/RESULT.md` for `perf-render-probe`, `fix-number-field`, `fix-blueprint-export`, `fix-motor-polish`, `fix-polish-a`, `fix-polish-b` and `fix-run-persistence`. The stale root `ASSIGNMENT.md` and `REVIEW.md` moved to `perf-render-probe/`, and `REPAIR-DESIGN-RETURN-1.md` moved to `accuracy-bundle-frontend/`. Commit `276b23d`; a line-level check confirmed no text was lost.
- Deleted 13 merged local branches with `git branch -d`, which refuses unmerged branches: `integrate/main-closeout`, `integrate/main-closeout-2`, `integrate/engine-float-port`, `fix-dispersion-drag-render`, `fix-flight-chrome-1280`, `fix-restored-motor-reload`, `fix-blueprint-export`, `fix-motor-polish`, `fix-number-field`, `fix-polish-a`, `fix-polish-b`, `fix-run-persistence` and `t3/app-walkthrough-test-plan`.
- Removed their 10 worktrees. The uncommitted lane assignment and gate notes were first saved to `/home/ak/astraea-evidence/lane-records-saved-2026-11-14/`.
- Kept, because they are not merged into `main`: `fix-candidate-readiness` (a diagnosis record) and `fix-engine-float-roundtrip` (its commits are on `accuracy/integration`). No remote branches were touched.

## Follow-up lane and deploy (2026-11-15)

- **Coverage gap closed:** lane `fix-smoke-default-project` merged `32183fd` (records in `docs/internal/execution-runs/fix-smoke-default-project/`). The accuracy journey now clears only the persisted project and working session, reloads, and pins the default baseline at 534 ± 2 m. Falsifier: the pre-reset code fails at 372 m. The 1280×800 layout check waits for the restore notice to close and fails clearly if it reappears; thresholds unchanged. Authors: codex `gpt-6.1-terra` medium, then claude-pool `claude-sonnet-5-5` medium after the Codex usage limit (owner rule 2026-11-15). Independent reviewer: `omp` / `deepseek/deepseek-flash` thinking max: ACCEPT WITH NOTES. Kimi (Go out of funds) and Antigravity Gemini (account disabled) produced no verdict.
- **Pre-push checks on `32183fd`:** `tsc --noEmit` exit 0; `vitest run --maxWorkers=2` 184 files / 2149 tests exit 0; `pnpm build` exit 0. Full `pnpm test:browser` exit 0 on lane `0560805`, which has the same scripts as the merge (logs `prepush-32183fd*.log`, `smoke-default-project-orch-0560805-run2.log`).
- **Push and deploy (owner OK 2026-11-15, "ok go"):** `origin/main` `250c8f9..32183fd`. Website run 43775660743 attempt 1 failed in CI `pnpm test:browser` at `preview-journeys.mjs:871` (undo: Length still 660, expected 650, after 5 s). It passed in all 7 local runs on the same code. Attempt 2 (rerun of the failed job) passed and deployed. Live `astraea-5e2.pages.dev/app/` serves `app-BM0l4sS1.js` (previously `app-C8bQlmac.js`), HTTP 200.

## Known notes (open, not part of this goal)

- Browser-smoke steps this work did not touch time out at 5–30 s under host load (local load 15–19): `preview-journeys.mjs:111`, `:137`, `:889`, `:935`, `:1240`, `preview-depth.mjs:46`, plus the one CI undo failure at `:871` [INFERENCE: timing, not a product defect; unproven]. Candidate lane: diagnose each step and replace fixed waits with condition waits; any timeout change only with a recorded reason.
- The default-project pin catches a failed reset only because the prior project flies 372 m; a direct default-identity assertion would make it order-independent.
- Providers: OpenCode Go needs a top-up; the Antigravity account reports a Terms-of-Service suspension (owner appeal needed); Codex resets 2026-11-18 17:42.
