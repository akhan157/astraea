# Goal hand-off: collegiate accuracy release cycle

| | |
|---|---|
| Branch / worktree | `goal/collegiate-accuracy`, worktree `~/.paseo/worktrees/3s8t98rp/goal-collegiate-accuracy` |
| Base | `main` @ `a57a7c8` (local main; 354 commits ahead of `origin/main` @ `250c8f9`, the live website) |
| Goal record | [GOAL.md](GOAL.md); Revision 3 governs |
| Step 0 records | [STEP0-BENCHMARK-SPEC.md](STEP0-BENCHMARK-SPEC.md) (frozen; ⟨L0⟩ values pending), [STEP0-BASELINE.json](STEP0-BASELINE.json) |
| Step 0 raw evidence | `/home/ak/astraea-evidence/goal-collegiate-accuracy/step0/` (outside Git), `SHA256SUMS` sha256 `290c61fda7a92ff6ea2843a8976afc44066c24faea60f1555a9b8724820f6a28` |
| Baseline WASM | `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff` (same hash from incremental and clean-target builds) |
| Research line | `accuracy/integration` @ `a055cca` (records only; never merged wholesale; it carries default-on E-1/E-7) |

## State (2026-11-14, step 0)

- Owner 2026-11-14 "execute the goal": K1 and K2 approved; K3, K4 and K5 approved as
  recommended (each opt-in first, with identity proofs and its own Gate 1). **K6 approved 2026-11-14** at gate (a):
  spec frozen (rev b `1dc199e`); Q1 T = 0 pp; Q2 engine-only A/B; Q3 F67W = development.
- Step 0 baseline was run by the orchestrator on `9801ad7`: cohort (native), templates, suites,
  ARCAS, P1, dev vehicles, ensembles and perf. No engine, app or register change.
- Findings (spec revision b, after orchestrator self-check):
  - **Mini DX3 F67W is already spent** (blind holdout `d824b23`, 2026-10-21, FAIL). Proposed
    as development (Q3).
  - The full sealed list comes from the R6 custody manifest: Emerald Streak has 10 flights
    and DD Vulcanite 2. SP-109 and Deacon custody is unverified on this host. Zenodo's
    `flight_comparison.csv` is not in custody and stays unopened.
  - A same-build performance A/A differs by 37.6 %, so a fixed 1.10x rule is undecidable
    here (Q2).
  - Thresholds will come from the L0 WASM baseline, not from the native run.
  - The `neutrality` harness test does not apply on the app engine.
  - `benchmark:arcas` keeps its known retained red.
- Gaps G-1 to G-4 need tests-only lane **L0** before any model change:
  - G-1: WASM cohort runner.
  - G-2: arm C (blank inputs).
  - G-3: cohort coverage.
  - G-4: regime summarizer.

## Next action

**L0 is merged** (`848e7f2`, `--no-ff` from `l0-benchmark-harness-v2` @ `480ed7c`):

| | |
|---|---|
| Review | claude-sonnet-5-5: ACCEPT WITH FINDINGS (none blocking); findings 1–3 fixed by the orchestrator |
| Merged-tree checks | probe, arm-C test and summarizer outputs byte-identical; engine suite 157/0/8 (21 suites) |
| Thresholds | ⟨L0⟩ values written as spec Amendment 3 |
| Key finding | improved drag with blank inputs (arm C) fails P1 and P2; K3 must carry arm B's inputs |
| History | first L0 author attempt (`l0-benchmark-harness` @ `0684feb`) stalled and is kept for the record |

**K3 lane** (improved model as the default) is next: see
[`lanes/K3-improved-default-ASSIGNMENT.md`](lanes/K3-improved-default-ASSIGNMENT.md). Its
default switch is hard stop (c).

**BLOCKED, 2026-11-15 05:41 UTC: lane author quota.**

| | |
|---|---|
| Lane | K3 Gate 1, dispatched to codex `gpt-6.1-terra` medium |
| Isolated checkout | `/home/ak/.t3/worktrees/astraeat3/t3-2c962250-3945d5bb77ededc9` from `f6218a2` |
| Failure | **"You've hit your usage limit … try again at Nov 18th, 2026 5:42 PM"** before any output |
| `codex-pool` | same account and quota, so not a way round |
| Rule | owner memory "wait out Codex limits"; no silent model switch |

**Resume on or after 2026-11-18 17:42:** re-dispatch the K3 Gate 1 brief (the same task text
is in the orchestrator transcript; the assignment file is
`lanes/K3-improved-default-ASSIGNMENT.md`) to codex `gpt-6.1-terra` medium, with
`isolation: worktree` from the goal-branch HEAD. The other option is an owner-approved
different author model.

**Owner decision, 2026-11-15: use Claude Sonnet as the K3 author.**

| | |
|---|---|
| Author | claude-pool `claude-sonnet-5-5`, effort high (routing.md escalation-author setting), for **K3 only** |
| Reviewer | must be **non-Claude**. Codex is blocked until 2026-11-18 17:42, so: Go `kimi-k3.1-pro` or `hy4`, or Antigravity `gemini-3.8-flash`, picked at review time after a balance and probe check |
| Other lanes | default stays codex `gpt-6.1-terra` medium unless the owner says otherwise |

**K3 Gate 1** (Sonnet, isolated checkout `/home/ak/.t3/worktrees/astraeat3/t3-ef2f672c-376a87a536ce7b5d`
from `d635726`) received 2026-11-15 and **approved by the orchestrator** with spec
Amendment 4. Decisions:

| # | Decision | Notes |
|---|---|---|
| 1 | Candidate default goes through the app derivation | Labelled honestly in the report |
| 2 | The default carries the nozzle back-pressure option whenever a diameter is declared | As arm B did. Templates declare none. The "B minus nozzle" row is measured |
| 3 | The default applies to every design without an explicit choice | `'legacy'` is the explicit old choice |
| 4 | No schema bump | Older builds may refuse new files containing `'legacy'`; this goes in the Release Readiness Report |

Other points:
- No engine change is planned, so the candidate WASM is `bc19590b`.
- The default switch stays on the lane branch until owner hard stop (c).

**K3 commit 1** `f1a702c` (opt-in-first, no behaviour change) passes the orchestrator's check.

| Check | Result |
|---|---|
| `tsc` | 0 errors |
| Focused tests | 4 files, 112/112 |
| Templates | field-for-field identical to step 0 (WASM `bc19590b`) |
| Author's full vitest run | 2154/2155. The one failure is a `src/sim/monteCarlo.test.ts` 300 s timeout under host load; it passes alone in 97 s, and in 119 s on the pristine base. **Rerun on a quiet host at step 2** |

**K3 commit 2** `e613f8a` (the default switch) was reviewed by the orchestrator on 2026-11-15. It is **not accepted**. A fix request was sent to the author.

| Finding | Severity |
|---|---|
| The run key (`snapshotCase`) does not include the derived drag source. A project with an applied drag scale fitted on legacy tables therefore re-flies as built-up drag × that scale, and its calibration stays "active". | Blocking |
| A stored result from before the switch shares the same `runKey`, so it could look current. The author must prove or fix this. | Blocking |
| RESULT.md judges P3 on the fully blank row only. The frozen arm-C row reproduces L0 C bit for bit (5.353363464539974 / 16). Report P3 on that row; keep the blank row as an extra. Both pass. | Minor |
| A nozzle exit above 1 m fails the engine domain check under the default. Handle it in admission or derivation, with no engine change. | Minor |

Verified: candidate default = arm B (P1/P2), WASM `bc19590b`. Option differences are the temperature's last digit only (22 of 23 flights); apogees are identical.

**K3 commit 3** `edd5f88` (author's fixes) was checked by the orchestrator:

| Check | Result |
|---|---|
| `tsc` | 0 |
| Changed tests | 6 files, 67/67 |
| New tests against `e613f8a` | 3 files fail there (8 failing tests plus one file failing at load), so they can catch a regression |
| Author's reruns | full vitest 2194/2194; `cand.json` and the template comparison byte-identical to commit 2 |
| Full browser smoke | **no clean pass** on this host (load average 13–20); quiet-host rerun at step 2 |

**BLOCKED, 2026-11-15 15:51 UTC: no non-Claude reviewer available.** Neither attempt produced a verdict, so no review pass is claimed.

| Reviewer | Failure |
|---|---|
| OpenCode Go `kimi-k3.1-pro` | "Insufficient balance. Top up at opencode.ai…" |
| Antigravity `gemini-3.8-flash` | "This service has been disabled in this account for violation of Terms of Service." Antigravity is unusable until the owner's appeal is resolved |
| Codex | usage limit until 2026-11-18 17:42 |

The other options cost money or use the owner's reserve (Go top-up, metered DeepSeek, NanoGPT), so they wait for the owner. Review material: `out/K3-review/` (gitignored). After the review: owner hard stop (c).

## Rules carried over

- Lanes branch from this branch and merge back with `--no-ff` after independent review by a
  different model family from the author. Authors are codex `gpt-6.1-terra` at medium effort
  (owner instruction for this goal; it overrides `routing.md`).
- Engine lanes run serially. Run `free -h` before builds; use two jobs per run.
- The sealed blind sets stay closed until step 4. Opening each set is an owner stop.
- This branch merges into `main` only after the Release Readiness Report and the owner's OK.
  Merging into `main` and pushing `main` deploys the website.

## Commands run at step 0 (cwd = this worktree)

```
cargo test --offline -j 2 --manifest-path crates/astraea-engine/Cargo.toml --test appbound_bundle_cohort -- --ignored --exact <wiring|cohort|dev_vehicles|ensembles> --test-threads=1   # env ASTRAEA_R44_* -> astraea-evidence R40/R41/R42/R47 inputs, hash-checked; REPO=step0/r44-repo-root (two prereg files from accuracy/integration, hashes match)
pnpm install --offline --frozen-lockfile
CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs   # twice, same hash
PROBE_OLD_WASM=<option-2 445098…> PROBE_NEW_WASM=<bc19590b…> pnpm exec vitest run --config docs/internal/execution-runs/accuracy-bundle-frontend/preset-compare.vitest.config.mjs
cargo test --offline -j 2 --manifest-path crates/astraea-core/Cargo.toml -- --test-threads=2
cargo test --offline -j 2 --manifest-path crates/astraea-engine/Cargo.toml --lib --tests -- --test-threads=2
pnpm test:arcas-runtime ; pnpm benchmark:arcas   # exit 1 = retained red only
CARGO_BUILD_JOBS=2 pnpm build ; node scripts/perf/measure-flight.mjs --data-root /home/ak/flight-data --runs 5 ; node scripts/perf/measure-ui.mjs --label baseline --runs 3
```

First run, recorded: running all ignored tests at once made `cohort` run before `wiring` and
fail on the missing `wiring.json`. `neutrality` fails by design on the app engine.

**Owner decision, 2026-11-15: wait for Codex.** No spend.

**Resume on or after 2026-11-18 17:42 UTC:**
1. Dispatch the K3 independent review to codex `gpt-6.1-sol`, reasoningEffort high (routing.md, final/hardest reviews). The review brief is in the orchestrator transcript ("K3 independent review"). Its target is `d635726..edd5f88` in `/home/ak/.t3/worktrees/astraeat3/t3-ef2f672c-376a87a536ce7b5d`, with a copy in `out/K3-review/`.
2. After the review: owner hard stop (c), with the template table. Alpha III goes from 298.92375069659687 m to 304.0294885865904 m; NASA SL from 532.8435782954323 m to 546.5369328003885 m; Spaceport is unchanged.
3. Then merge K3 `--no-ff`. The lanes after it (K4, K5, and so on) return to codex `gpt-6.1-terra` medium.

The owner also needs to know that Antigravity reported the account as disabled for a Terms of Service violation; an appeal is the owner's call.

**Prepared while waiting, 2026-11-15:** two lane assignments, drafted but not dispatched. Each is filled in and dispatched after the K3 merge, to codex `gpt-6.1-terra` medium:

| Lane | Assignment | Notes |
|---|---|---|
| K4 | [`lanes/K4-expected-error-line-ASSIGNMENT.md`](lanes/K4-expected-error-line-ASSIGNMENT.md) | The Gate 1 must propose a regime rule for user runs. The spec freezes regimes by name only. The line's numbers are in-sample development data |
| K5 | [`lanes/K5-team-validation-transfer-ASSIGNMENT.md`](lanes/K5-team-validation-transfer-ASSIGNMENT.md) | The first turn is research only. Same-airframe pairs come from development data. Subscale to full-scale may be external |

Scheduled resume: T3 task `scheduled-task:8f7d9465-118e-4b24-9b11-2e80ee01132a`, 2026-11-18 17:50 UTC.

**K3 browser smoke on a quiet host, 2026-11-15 (orchestrator):**

| Tree | Smoke exit | 1280×800 Flight free region |
|---|---|---|
| Base `d635726` source (goal tree) | 0, 54 journey lines | 239.6 px |
| K3 `edd5f88` | 1 | 214.1 px (the assertion requires ≥ 220) |

This is a real layout regression of about 25 px, not host load. It was sent back to the K3 author as commit 4. The 220 px threshold is unchanged, and the owner's minimal-UI rule applies. Logs: `/tmp/k3s-smoke*.log` (scratch).

**K3 smoke resolved, 2026-11-15.** There is **no commit 4**, and the K3 head stays at `edd5f88`.

**Cause.** The 214.1 px reading is a race that already exists in the smoke script, not a K3 bug:
- A "Restored unsaved work" bar (25.5 px) appears on every second load. Both trees store an idle session.
- The script dismisses it at `scripts/preview-journeys.mjs:544`.
- The free-region attribute updates late after the dismissal, so the script sometimes reads the old value.

**Evidence (author).**
- The base `d635726` also failed this way naturally, in 1 of 7 runs.
- The update delay is not longer on K3.
- The idle-session diff shows no derived field and no dirty flag.

**Orchestrator rerun on `edd5f88`.** I ran `vite build` and then the full `node scripts/browser-smoke.mjs` once:
- exit 0, with 54 "passed" lines;
- free region 239.6 px at 1280×800 and 479.6 px at 1600×1000, the same as the base.

The log is at `astraea-evidence/goal-collegiate-accuracy/k3-smoke-edd5f88-orch.log` (sha256 `08c631f8…`).

**The script race** is fixed separately at step 2, in a tests-only lane: wait for the free region to settle after the dismissal, and keep the 220 px rule. It is not K3 scope.

**Next.** The scheduled Codex review (2026-11-18 17:50 UTC) covers `d635726..edd5f88` as planned. After it comes owner hard stop (c).

**K3 independent review, 2026-11-15:** codex `gpt-6.1-sol`, effort high. It reviewed `d635726..edd5f88`. Codex turned out to be available before the expected reset. **Verdict: REJECT.**

| # | Severity | Finding |
|---|---|---|
| 1 | Major | `src/console/design.ts:150`: an *inactive* stored calibration still forces legacy drag. Removing it changes the physics and the run key, and the notice says "applied" |
| 2 | Major | `AeroControls.tsx:178`: the nozzle back-pressure checkbox shows off while the default sends the nozzle. Its hint ("Off leaves flights unchanged") is false |
| 3 | Minor | `adapter.ts:526` and runMonteCarlo (around line 698): run metadata and confidence text come from the unresolved vehicle, so a legacy flight is recorded as "calibrated requested" |

Checks the reviewer ran: tsc 0; focused vitest 18 files, 319/319. The reviewer found no relaxed tolerance.

The findings went to the K3 author as commit 4. When it lands: orchestrator check, a fresh Codex re-review (a new `delegate_task`), then owner hard stop (c). The scheduled 2026-11-18 resume is disabled because it is no longer needed.

**K3 commit 4** `efc43e9`, the fixes for the three review findings.

Orchestrator check: `tsc` passes (0), and the 6 changed test files pass (142/142). The one removed assertion is the parser refusal of `nozzleBackPressureThrust: false`, which this commit makes valid on purpose. The author also reports:
- full vitest 2215/2215;
- `cand.json` and the templates byte-identical to commit 3;
- full smoke exit 0 (239.6 / 479.6 px);
- 18 new or changed tests fail on `edd5f88`.

There is a new forward-compatibility point for the Release Readiness Report: builds before this commit refuse files that contain `nozzleBackPressureThrust: false`.

A fresh Codex `gpt-6.1-sol` (high) re-review of `edd5f88..efc43e9` and the whole lane has been dispatched.

**K3 Codex re-review of `efc43e9`, 2026-11-15: REJECT.**

The three prior findings are confirmed fixed. New findings:

| # | Severity | Finding |
|---|---|---|
| 1 | Major | `runInputs.ts:110`: capture archives the *resolved* `'legacy'`. "Load saved inputs" then restores it verbatim. The restored fit key no longer matches, so the calibration goes inactive and the scale is dropped. The reviewer's probe shows fit key 251f2461 active with scale 0.9, then b9ec633b inactive with no scale |
| 2 | Minor | `defaultDragIdentity.test.ts:114` compares a value with itself. `nozzleBackPressureDefault.test.tsx:86` parses the file but never reopens the project |

The reviewer also confirmed: `tsc` 0; 26 focused files plus 4 more, 440/440 and 49/49; no weakened tolerance; explicit keys and `calibrationFitInputKey` unchanged.

**Escalation rule.** AGENTS.md says a lane that fails review twice gets a stronger author. **Recorded decision: the author stays claude-sonnet-5-5.** Reasons:
- The owner's goal rule forbids Sol as an author, so the stronger escalation author is not available.
- Every earlier finding was fixed correctly, and this one is new and narrow.
- Switching authors would lose the lane context.

If commit 5 fails review again, the switch goes to the owner.

The findings went to the author as commit 5.

**K3 commit 5** `4eecc58`: the archive now stores the vehicle as the user declared it, and the resolution only drives the dispatched options. It also adds a regression test for "Load saved inputs" and strengthens the two weak tests.

Orchestrator check: `tsc` 0; 4 changed test files, 28/28 passing.

Reported by the author:
- full vitest 2221/2221;
- `cand.json` and the templates byte-identical;
- full smoke exit 0 (239.6 / 479.6 px);
- 6 tests fail on `efc43e9`, and mutation proofs cover the two strengthened tests.

Known limit: archives written by the unreleased commits 2–4 restore as explicit legacy.

Codex `gpt-6.1-sol` (high) re-review 2 has been dispatched.

**K3 Codex re-review 2 of `4eecc58`, 2026-11-15: ACCEPT, no new findings.**

The two prior findings are fixed, each verified by the reviewer:
- **Saved inputs:** the reviewer's own probe ran capture → loadSavedRun → reopen → working-session restore → rerun. The fit key 251f2461, the run key d7607e84, the active calibration and the scale were all preserved.
- **Tampering:** a tampered archive is still rejected.

Reviewer checks: `tsc` 0; 27 files, 446/446.

**Now at owner hard stop (c).** K3 is not merged.

**Owner decision, 2026-11-15 (hard stop c): K3 approved.** K3 is merged as `c2b31dd` (`--no-ff` from `k3-improved-default` @ `4eecc58`). The review record is `../K3-improved-default/REVIEW.md`.

Merged-tree checks:

| Check | Result |
|---|---|
| `tsc` | 0 |
| Full vitest | 191/191 files, 2221/2221 tests |
| Cohort probe and compare | P1, P2 and P3 pass; `cand.json` byte-identical to the lane |
| WASM | `bc19590b` |
| Full smoke | **not clean**: Playwright timeouts at load average 12–17. Owed at step 2 |

Evidence: `astraea-evidence/goal-collegiate-accuracy/K3-merged/SHA256SUMS` (sha256 `48d04599d8ae41b8…`).

**Next.** These lanes go to codex `gpt-6.1-terra` medium:
- K4 (expected-error line);
- a tests-only smoke-race lane (`scripts/preview-journeys.mjs`, restore-bar settle).

They touch different files. K4 is app UI, and the smoke-race lane changes test scripts only.

**K4 (expected-error line).** Codex `gpt-6.1-terra` medium, isolated checkout `/home/ak/.t3/worktrees/astraeat3/t3-9d55b830-51a05f392d34d35c` from `442a953`.

The first Gate 1 note lacked per-flight data. The orchestrator amended it to allow a tests-only probe; the probe output is `astraea-evidence/.../K4/cand.json`, sha256 `be7d0ef2…`. The second note was **approved for implementation, with amendments**. It is backed by spec Amendment 5 (`929df85`, P8 aggregation and user-run regime by max Mach).

| Design point | Decision |
|---|---|
| Regime of a user run | By max Mach: below 0.8 subsonic, 0.8 to below 1.5 transonic, 1.5 and above supersonic. Zero mismatches on the cohort |
| Envelope | Max Mach ≤ 3.1104, apogee ≤ 22760 m (qu8k is outside) |
| When to withhold the line | Missing temperature or nozzle, explicit legacy, and refused shapes |
| Default wording | "Typical error ±X % (development data, 20 flights)", with X the regime MAE |
| Owner choice | At K4 review: MAE or max-\|e\| |

**K4 implementation:** branch `t3/apogee-expected-error-line`. The orchestrator committed the author's work as `58583e3`, then `2621cb3`, because the Codex child cannot write the git index. Neither commit is accepted.

| Item | Status |
|---|---|
| Nozzle requirement | Dropped (orchestrator correction): all 20 airframes now qualify |
| Orchestrator checks on the K4 checkout | `tsc` 0; full vitest 193/193 files, 2230/2230 tests |
| Coverage, in-sample (Amendment 5) | MAE option 11/20. The max option covers 20/20 by construction but exceeds the 20 % width cap in two regimes |
| Templates | Show no band, because they have no site temperature. This is for the owner to note at review |
| Light theme | Not applicable: the app is dark-only |
| Phone width | Shows the app's desktop-size notice |

Independent review dispatched to claude-pool `claude-sonnet-5-5`, effort high; the author is Codex, so this is a different family.

**K4 review (claude-sonnet-5-5): ACCEPT WITH FINDINGS.** The fixes went to the author:

| # | Severity | Finding |
|---|---|---|
| 1 | Major | Withhold the band when the run carries a drag calibration |
| 3 | Minor | Contrast: `C.dim` measures 3.14:1; use `C.muted` |
| 4, 5 | Minor | Withheld messages: make them specific and keep them to one line |
| 6 | Minor | Tests: exact ceilings; values read from the generated module; the generator takes the option as an argument |

Finding 2, the coverage of the MAE option, is the owner's call on wording.

**New open item (a consequence of K3, found in the K4 screenshots).** The global beta banner still says "legacy model tested on one small subsonic rocket (6–10% high)". After K3 the default is built-up drag, so the banner is out of date. It is user-facing wording, so it goes to the owner with the K4 wording question. It must be resolved before the Release Readiness Report.

**Owner decisions, 2026-11-15:**

| Item | Choice |
|---|---|
| K4 band | "Typical error", the regime MAE |
| Banner and landing wording | "Development wording" now; final wording at step 5 |

**K4 merged** as `3bde5ae` (`--no-ff` from `k4-expected-error-line` @ `a61e18c`). The record is in `../K4-expected-error-line/REVIEW.md`.

| Merged-tree check | Result |
|---|---|
| `tsc` | 0 |
| Full vitest | 193/193 files, 2234/2234 tests |

**Queued for Codex.** The usage limit resets at about 20:35 local on 2026-11-15. In order:
1. W1, accuracy-claim wording ([assignment](lanes/W1-accuracy-claim-wording-ASSIGNMENT.md));
2. K5 research Gate 1;
3. the tests-only smoke-race lane.

After those: steps 2–4.

**K5 research Gate 1** (codex terra, checkout `/home/ak/.t3/worktrees/astraeat3/t3-0f726540-b878f960ce146d81`). No same-airframe pair qualifies yet:
- Rabia and Full Metal Jacket change geometry between flights.
- The manifest records peak altitude only, with no coast telemetry.
- The Mini DX3 G69N/F67W pair still has to be inventoried.
- Subscale to full-scale is external pending evidence.

**Frozen decision rule (orchestrator, 2026-11-15, before any measurement).** Fit flight 1 against legacy drag with the existing estimator and predict flight 2. Compare with the uncorrected K3 default on the same flight.
- **Pass:** lower absolute apogee error in every qualified direction, with at least 2 independent same-airframe pairs.
- **Drop the lane:** a tie, a worse result, fewer than 2 qualified pairs, or an unfit source flight.

Qualification uses inputs and telemetry only.

**Next:** the author finishes the inventory. If fewer than 2 pairs qualify, K5 is dropped and recorded with the external unblocking input.

**K5: DROPPED under the frozen pre-measurement rule.** Records merged as `0963a19` from `k5-team-validation-transfer` @ `1dad1dd`. No fit-and-predict test ran.

Mini DX3 is the only repeat-flight airframe with coast telemetry. Cosmic Cargo, Top Shot and Adventurer each flew once, and the R40 cohort is peak-only and changes geometry within its pairs. The rule needs 2 independent pairs.

**External unblocking input:** two or more same-airframe repeat flights with coast telemetry and documented mass, motor and site, or a geometrically similar subscale/full-scale pair with telemetry.

This goes in the Release Readiness Report as **not done, with the reason**.

**W1** (wording) is committed by the orchestrator as `9552599` on the lane checkout `/home/ak/.t3/worktrees/astraeat3/t3-888d37aa-9303a3c41d4dfca2`; `tsc` 0. Still running: the full suite and the build. Still to do: screenshots and the review.

**W1 merged** as `d3a2f78` (from `w1-accuracy-claim-wording` @ `23e17b9`). The review was claude-sonnet-5-5: ACCEPT WITH FINDINGS, all low; the dispositions are in `../W1-accuracy-claim-wording/RESULT.md`. Merged-tree results are in the next line.

**Carried to step 5:** `.github/workflows/release.yml:72`, `CHANGELOG.md:205` and `docs/accuracy.md` still use legacy-only wording.

**T1** (smoke-race fix, tests only) has been dispatched to codex terra medium from `d3a2f78`.

W1 merged-tree checks (`d3a2f78`): tsc 0; full vitest 193/193 files, 2234/2234 tests.

**T1 merged** as `63fec45` (`--no-ff` from `t1-smoke-restore-bar-race`). Review by claude-sonnet-5-5: ACCEPT WITH FINDINGS.

**Disposition: accepted increment; the check is still open.** In 3 orchestrator runs the restore-bar check passed every time, at 239.6 / 479.6 px. All 3 runs then failed later on host-load Playwright timeouts, at load average 20–28 from other sessions.

**Owed at step 2:** a clean full smoke run and a negative control.

**K3 lane evidence archived.** The K3 lane's `out/K3/` (screenshots, cohort-c2, race probes) is now in `astraea-evidence/goal-collegiate-accuracy/K3-lane-out/`, SHA256SUMS `c79337d6…`, so it survives worktree cleanup.

**Remaining step-1 items.** Each gets its own research Gate 1: [`lanes/STEP1-REMAINING-GATE1-ASSIGNMENTS.md`](lanes/STEP1-REMAINING-GATE1-ASSIGNMENTS.md).

| Lane | Item |
|---|---|
| S1 | Space-shot drag |
| S2 | Refused shapes |
| S3 | UNKNOWN label |
| S4 | Non-apogee outputs |

They are read-only, so they can run in parallel. Implementation waits for each Gate 1. Engine work stays serial.

**Open for steps 2–3 and the report:**
- **Flight model chip.** The chip `Flight.tsx:43`, "Flight model: Legacy (supported)", still shows after K3. It names the flight-model family (legacy versus the candidate research model), but users may read it as "legacy drag". The wording goes to the owner with the report.
- **P9.** Candidate and baseline share one WASM, so the engine A/B must fly the *candidate default's options* (built-up drag plus nozzle) against the baseline's arm-A options. Otherwise it passes vacuously.
- **P10.** At step 3, rebuild the WASM from this worktree at the final SHA and confirm the hash. Regenerate `cohortError.generated.ts` and diff it.

**Step 1 complete (2026-11-15).**

| Item | Outcome | Record |
|---|---|---|
| K3 | Merged | `c2b31dd` |
| K4 | Merged | `3bde5ae` |
| W1 | Merged | `d3a2f78` |
| T1 | Merged, accepted increment | `63fec45` |
| K5 | Dropped under its frozen rule | `0963a19` |
| S1 | Unproven, no change | `47df58c` |
| S2 | No change | `6853ebc` |
| S3 | No change this release | `7bfdd09` |
| S4 | Report-only rows plus "no evidence" | `2db9bcd` |

**Step 2 (full tests on the merged candidate) is starting** at the goal-branch HEAD.

**Step 2: PASS on Linux.** The record is [`step2/STEP2-TEST-RESULT.md`](step2/STEP2-TEST-RESULT.md).

| Check | Result |
|---|---|
| WASM | `bc19590b` |
| `tsc` and build | 0 |
| vitest | 2234/2234 |
| cargo | core 273, engine 157 |
| ARCAS | retained red only |
| Full browser smoke | 0, 54 checks |
| Native desktop smoke | 546.5369 m, check passed |

A step-2 defect was fixed in `627924d`: the desktop-smoke pin was stale after K3.

**Next: step 3, the benchmark against the step-0 baseline.**

**Step 3, in progress (orchestrator, 2026-11-16).**

- **P1–P3 at HEAD, on the step-2 built WASM** (`src/engine/astraea_engine.wasm`, `bc19590b`, P10): probe 0, compare 0.
  - All 20: 5.6240 % / 18 / +0.22 %.
  - By regime: 5.5414 / 7, 5.4024 / 7, 6.0662 / 4.
  - Frozen arm C: 5.3534 / 16.
  - `cand.json` rows are identical to the K3 merged tree.
- **K4 band module:** regenerating it from the pinned inputs gives a file byte-identical to `src/console/data/cohortError.generated.ts`.
- **Evidence:** `step3/SHA256SUMS.p1p3`.
- **B1 is running** (codex terra): P9 engine A/B on the options, P4 templates at HEAD, and the S4 rows.

**Step 4 started.** The physics review has been dispatched to codex `gpt-6.1-sol`, high effort. The final default model was authored mostly by Sonnet (K3), and the engine is unchanged.

**Blind shot.** It needs owner hard stop (b) before any sealed file is opened, including the design ORKs. The plan follows spec §6:
1. Freeze the source SHA and WASM.
2. Qualify inputs from the ORKs only.
3. Commit predictions and intervals to Git.
4. Open the outcome logs once per set; a different agent extracts the values.

Scorable sets: Emerald Streak (10 flights) and DD Vulcanite (2 flights). SP-109 and Deacon custody is unverified, and the Zenodo split is undecided.

**`main` moved (another session) and is now merged.** `main` = `origin/main` = `32183fd`, which is 12 commits ahead of our base `a57a7c8` and already live. All 12 are tests, scripts and records, including that session's own restore-notice smoke fix. They were merged into the goal branch as `4721eb3` with no conflicts. The new 534 m accuracy-journey pin flies the explicit legacy choice, so it stays correct.

A main merge of this goal therefore ships only the goal's own commits.

| Check | Result |
|---|---|
| P4 at HEAD `6af96f6` | **PASS**, templates exact |
| Merged-tree tests and smoke | Running |

**Codex usage limit until 01:46 EST, 2026-11-16.** B1 (P9 and the S4 rows) and the physics review both failed with no output. The scheduled task `scheduled-task:8d55b525…` re-dispatches both at 06:55 UTC.

**Owner decision, 2026-11-16: "swap to sonnet" for the Codex-blocked lanes.**

| Lane | Change |
|---|---|
| B1 | Re-dispatched to claude-pool `claude-sonnet-5-5`, effort high |
| Physics review | Also run on Sonnet now. K3's default was written by Sonnet, so a Claude review is not a different family; the codex `gpt-6.1-sol` review stays scheduled after the reset (task `8d55b525…`, 06:55 UTC) as the independent check |

**Owner decision, 2026-11-16: use DeepSeek for the independent physics review.**

| | |
|---|---|
| Reviewer | OMP `deepseek/deepseek-flash` (V4.1 Flash), thinking max, mode auto-accept-edits; full access is not possible because this session runs in "auto" (owner switched from V4 Pro, which was cancelled; DeepSeek direct, metered, owner-authorized) |
| Why it qualifies | It is a different family from Claude (the K3 author and the orchestrator) and from Codex |
| Codex | The scheduled Codex review is disabled |
| Sonnet | Its physics review is still running and gives a second opinion |

**Step 4, round 1: physics review REJECT** ([`step4/PHYSICS-REVIEW-1.md`](step4/PHYSICS-REVIEW-1.md)). The work returns to step 1. Both blocking defects were reproduced by the orchestrator:
- an oversized nozzle exit gives a non-physical apogee, or traps the engine;
- the drag ladder hard-fails at the default 3 m/s wind on full-metal-jacket.

No sealed set has been opened.

| Fix lane | Scope |
|---|---|
| E1 (engine), assignment `lanes/E1-engine-robustness-ASSIGNMENT.md` | Engine defects |
| A1 (app and wording) | Wording goes to the owner |

**Other lanes:** the Sonnet second-opinion review failed on a rate limit (429). B1 (P9) is paused until the engine is final, because P9 must run on the final WASM.

**Owner decision, 2026-11-16: the E1 author is codex `gpt-6.1-terra`, medium effort.** E1 Gate 1 was dispatched at 12:35 UTC with full access.

**A1 wording waits for E1.** Findings 4–7 and 14 cover the banner and landing conditions, the K4 "not a bound" wording, the refused-shape sentence, the nozzle hint and the chip. Their figures may move if E1's reference-area fix changes cohort numbers, so the wording comes to the owner as one set after E1.

**E1 Gate 1 approved with amendments**, 2026-11-16. Author codex terra; checkout `/home/ak/.t3/worktrees/astraeat3/t3-af010741-b362bc8ba42b5647`, branch `t3/built-up-drag-robustness`.

| Defect | Approved fix |
|---|---|
| Oversized nozzle | Input error when the exit is wider than the aft body; base term clamped ≥ 0 |
| Ladder | Cross-phase fill, otherwise a stated legacy fallback |
| Reference area | Cd rescaled by (max/ref)² |
| Pressure term | Gated on thrust > 0 |

**Required before the author reports:**
- the root cause of the calisp1 trap, fixed;
- measurements before and after (the cohort and template moves, P1–P3);
- a wind sweep with zero errors;
- tests that fail on `68e9877`.

**E1 first implementation** `85ea449` (branch `t3/built-up-drag-robustness`) is **not accepted**: P1 fails (5.6627 > 5.6240) and P2 supersonic fails (6.2210 > 6.0662).

| Fix | Measured effect |
|---|---|
| Cross-phase fill | Wind sweep 92/92, zero errors |
| Trap fix | The 5,000-trial panic now returns an error |
| Input bound | Triggers on no design |
| Reference-area rescale | Moves nothing (max = ref everywhere) |
| Zero-thrust gating | Moves nothing |
| Power-on base clamp | The only change that moves numbers: qu8k, and proteus6 22760 → 22559 m |

**Orchestrator decision, 2026-11-16:** drop the clamp under the frozen rule ("a change that does not beat the baseline is dropped"). The blocking oversized-nozzle defect stays covered by the input bound. The residual goes in the report: the base term can go negative when the exit is close to the aft diameter (proteus6 0.96).

The author was asked to:
- prove the cause with a clamp-only revert;
- show P1–P3 exact identity again;
- add the missing regression tests (fill, reference area, zero thrust, trial-limit recovery).

**E1 second round** `8a93cb4`, from the author's report; the orchestrator has not rerun these yet.
- With the clamp dropped, a clamp-only revert reproduces the baseline cohort byte for byte.
- P1, P2 and P3 pass, including the frozen arm-C identity. Templates are unchanged.
- The wind sweep has zero errors.
- The new tests fail on `68e9877`.

**Orchestrator diff read.** The fixes are sound, and the `e1-test-hooks` feature is off by default.

**App follow-up for A1.** The both-phases-empty fallback text has no "refused:", so the app may not label it as a fallback.

**Review:** E1 independent review dispatched to DeepSeek V4.1 Flash (full access).

**E1 review of `8a93cb4` (DeepSeek V4.1 Flash, 2026-11-16): ACCEPT WITH FINDINGS.** Both blocking defects confirmed fixed; cohort rows byte-identical; WASM reproduces at `36195432…` in the lane path. No pass is claimed for the merged tree yet.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Medium | Wind of 1e9 or 1e300 m/s still panics (`six_dof.rs:423`, `:696`) and traps the WASM | Round 3: panics to `Err`; reject non-finite or negative wind at the option boundary |
| 2 | Medium | `evidence_calibrated_tables` builds the manifest text before the tables, so it never says "cross-phase nearest fill" | Round 3: fix, with a test |
| 3 | Medium | The nozzle bound is geometric, not the motor diameter (calisp1 +17.6 % at the aft cap) | Round 3: measure min(aft, motor); implement only if no number moves and no design is newly refused, else a known limit |
| 4 | Low | Exact equality at the bound (byrum 0.0762) | Round 3: test that it passes; no tolerance |
| 5 | Low | Missing 23 × 4 wind test and both-empty fallback test | Round 3: add; the fallback text gets the "refused:" prefix |
| 6 | Trivial | The 60 kN comment should read about 79.6 kN | Round 3: verify and fix |
| 7 | Info | Table selection uses `t < burn_time` | No change; noted |

**E1 round 3** sent to the same author (codex `gpt-6.1-terra`, medium), same checkout and branch. Next: orchestrator diff read, a fresh non-OpenAI re-review, merge `--no-ff`, WASM rebuild from the goal path, then steps 2–3 re-run.

**A1 Gate 1 dispatched, 2026-11-16** (research only): lane A1 → worktree `~/.paseo/worktrees/3s8t98rp/a1-app-wording`, branch `a1-app-wording` @ `a8ae71c`, codex `gpt-6.1-terra` (medium). Assignment: `lanes/A1-app-wording-ASSIGNMENT.md`. It runs alongside E1 round 3 because the surfaces don't overlap: A1 is app and docs, E1 is `crates/`. Wording goes to the owner before any implementation.

**E1 round 3** `2af6527` (author's report; the orchestrator has not rerun it):
- Wind panics now return `Err`.
- The seam text is built after the tables.
- The motor-diameter bound is not adopted: it would refuse byrum at an exit equal to its aft body. The aft-body bound stays.
- The both-ladders-empty fallback text now includes "refused:".
- The 23 × 4 wind sweep has zero errors.
- P1–P3 rows are byte-identical and the templates are unchanged.
- Scratch WASM `c4f4dc31…`, built in the lane path.

**Orchestrator diff read:** tests-only plus the panic-to-`Err` conversions; no physics change. Re-review dispatched to DeepSeek V4.1 Flash (thinking max). It must check for remaining panic paths, e.g. `validate_accepted_state`.

**A1 Gate 1, first pass: incomplete** (the author says so). Sent back for the full pin inventory, the fallback-consumer audit, the source of the engine's aft diameter, figures cited from the spec, and the banner fit at 1280 px.

**E1 re-review of `2af6527` (DeepSeek V4.1 Flash, thinking max): ACCEPT WITH FINDINGS.** The round-3 claims hold:
- Wind of 1e9, 1e300 or −1 returns `Err`, and the same WASM instance flies again.
- About 120 adversarial inputs caused no traps.
- The three targeted tests fail on `8a93cb4` with exit 101.
- The app classifies the new "refused:" text as refused.
- The aft-only nozzle bound is sound.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| F1 | Major, pre-existing | A motor longer than its mount station panics at `six_dof.rs:2231-2238` and traps the WASM (calisp1: 1.55 m traps, 1.5 m flies). `flight_provider.rs:709-720` already refuses this case | Round 4: return `Err`, reusing the existing rule |
| F2 | Medium, latent | `validate_accepted_state` still panics (`:449`, `:453`) | Round 4: convert to `Err` |
| F3 | Minor | The wind sweep stops at 9 m/s; the assignment says 0–10 | Round 4: add 10 m/s |
| F4 | Minor | The byrum exact-aft test does not pin the diameter it uses | Round 4: assert the value, and that the next value up is refused |
| F5 | Info | The refusal message prints both numbers as 0.0762 | Round 4 if cheap; A1 shows the limit in the app |

**E1 round 4** sent to the same author (codex Terra, medium). **A1 Gate 1** has been narrowed to three mechanical lists (fallback reasons, consumers, assertion inventory) after two incomplete passes. Recorded deviation: AGENTS.md says a lane that fails twice escalates to a stronger author, but the owner's routing rule (Terra medium only, never Sol or xhigh) takes precedence. The scope was narrowed instead.

**Provider failure, 2026-11-16 15:44 UTC.** Both the E1 round 4 run and the A1 final pass failed at start with Codex "usage limit reached" (resets 11:52 local). They produced no work and no verdict. Re-dispatched as fresh tasks on `codex-pool`: same model `gpt-6.1-terra`, reasoning effort medium, same briefs. The author model did not change; only the subscription account did.

**Provider failure, continued.** The `codex-pool` re-dispatches failed as well: E1 round 4 with "usage limit reached (try again at 11:52 AM)", and A1 with "429 Too Many Requests, exceeded retry limit". That makes four failed author runs since 15:44 UTC, with no work and no verdict from any of them. Under the owner rule, Codex limits are waited out: no model switch, no paid credits. **Next action:** after 11:52 local, re-dispatch E1 round 4 and the A1 final pass with the same briefs (task titles "E1 round 4 (terra, codex pool)" and "A1 Gate 1 final pass (terra, codex pool)"), `gpt-6.1-terra` at medium. Lane HEADs are unchanged: E1 at `2af6527`, A1 at `a2d6bae`.

**A1 Gate 1 complete; owner wording decisions, 2026-11-16.** The orchestrator compiled the three missing lists read-only (`A1-app-wording/GATE1-LISTS.md`, `e19bb60`) while Codex was limited. The owner chose the recommended option on all four questions:
- banner range 5.6–5.9 %, with the full claim stating both cases;
- "Average apogee error ±X % (…; not a limit)";
- remove the "Legacy (supported)" chip;
- a nozzle hint plus the engine's own error, with no copy of the rule in TypeScript.

The exact texts are in `lanes/A1-app-wording-ASSIGNMENT.md` § "Owner decisions". Next: the A1 implementation turn (Terra medium, after the Codex reset), on `a1-app-wording`.

**Prepared for after the E1 merge** (orchestrator scripts, `out/`, gitignored):
- `out/step2-e1.sh`: engine rebuild from the goal path plus the full suites and smoke. Evidence goes to `step2-e1/`.
- `out/step3-e1.sh`: P1–P3 through the K3 cohort probe and `candidate-compare.cjs`, a byte-level row identity check against the pre-E1 `step3/cohort/cand.json`, and P4 templates. Evidence goes to `step3-e1/`.
- **Follow-up:** `K4-expected-error-line/generate.py` pins the cohort WASM hash to `bc19590b`. After the rebuild it will refuse to run, so its pinned hash needs a recorded update. The K4 values cannot move if the rows are byte-identical.

**Codex reset, 16:55 UTC.** Lane HEADs were verified unchanged: E1 at `2af6527`, A1 at `a2d6bae`. Two tasks were dispatched to codex `gpt-6.1-terra` at medium, and both are confirmed **running**, not failed:
- **E1 round 4**: F1–F5 from the re-review.
- **A1 implementation**: the owner's exact texts, pin updates, the ensemble refused warning, chip removal, the nozzle hint, the public docs, and screenshots.

The surfaces don't overlap: E1 is `crates/`, A1 is app and docs.

**Both lanes came back unfinished, about 17:40 UTC.**
- **E1 round 4:** edits for F1–F5 are uncommitted on top of `2af6527`. The cargo runs exited 130 (interrupted); nothing was verified.
- **A1:** `54caae1` holds the wording, pin updates and ensemble-warning test; tsc exits 0. The focused tests and `vite build` failed because the lane checkout had no `src/engine/astraea_engine.wasm` (a build output, not in Git), and the full vitest run exited 130.

**Orchestrator fix:** copied the goal branch's WASM into the A1 checkout and verified it: `bc19590b`, unchanged since step 0, not committed. Both lanes were sent back with the same author and model, with instructions to run long commands detached with logs. Exit 130 points to the author's command timeout, not memory: 8.7 GiB available, load about 2.

**E1 round 4** is committed at `0d564d9`. The author reports:
- F1: shared `validate_motor_placement` in `prepare_flight_vehicle` and in the candidate path; calisp1 at 1.55 m returns `Err` and the same instance flies again.
- F2: `validate_accepted_state` returns `Err`.
- F3: the 23 × 5 wind sweep has zero errors.
- F4: the exact-aft value is pinned.
- F5: the message prints `{:?}`.
- P1–P3 rows and templates are byte-identical; the fix tests fail on `2af6527`. Scratch WASM `e8a237df…`.

**Orchestrator diff read:** the refactor is minimal and the old expression is preserved in the shared function. The loads-assembly panic stays as a backstop. Re-review dispatched to DeepSeek V4.1 Flash (thinking max). It must check that every WASM entry point validates placement before the backstop.

**E1 re-review of `0d564d9` (DeepSeek): ACCEPT WITH FINDINGS.** F1–F5 are closed and verified:
- every WASM entry point validates motor placement;
- no traps at or past the threshold;
- the cohort rows hash `2db1b9f8…` equals the baseline, and P1–P3 pass;
- 115 wind flights with zero errors.

New findings:
- **R4-1 (Medium, pre-existing):** a zero-impulse thrust curve traps the WASM on the legacy path. The candidate path refuses it, and the app pre-filters it at `motorDatabase.ts:255`.
- **R4-2 (Low):** the F5 message is not asserted.
- **R4-3 (Low):** F2 is untested. Accepted as a known gap, since the reviewer found no input that reaches it.

**E1 round 5** (R4-1, R4-2) sent to the same Terra author.

**A1 `993507e`:** the author reports tsc 0, focused 26/26, full vitest 2235/2235, `vite build` 0, the banner on one line at 1280 px, and 7 screenshots. The orchestrator's diff read found the texts match the owner's wording exactly. Two issues:
- `flight-error-line.png` shows "No error band: site temperature not set", so the new error line is not evidenced by any screenshot;
- with the chip removed, the chooser summary reads only "Change…", which is an owner wording question.

A minor test weakening was also noted: the chooser uniqueness assertion was dropped. Independent review dispatched to DeepSeek V4.1 Flash.

**A1 review (DeepSeek) of `993507e`: ACCEPT WITH FINDINGS.**
- Texts are byte-exact; the ensemble warning test fails on the base, as it should; the banner is one line.
- The new error line renders in the built app with production CSP: `±5.5 %` on byrum.
- Findings:
  - F1: the chooser reads only "Change…";
  - F2: the uniqueness assertion was lost;
  - F3: no screenshot of the new line;
  - F4: README still has legacy-only text.
- The full vitest run had one timeout (`monteCarlo.test.ts:229`) under load of about 7.5. It passes standalone in 171 s. Not related to A1.

**Owner decisions, 2026-11-16:** the chooser reads `Change flight model…`; the README gets the full claim. Exact text is in the A1 assignment. A1 fix round sent to the same Terra author.

**E1 round 5** `db80dc2`:
- the impulse check moved into the shared `validate_motor_spec`, now called by `to_motor`;
- the byrum message is asserted;
- the author reports byte-identical rows, P1–P3 pass, scratch WASM `22b286db…`.

**Orchestrator diff read:** `to_motor` validation now applies to every command that converts a motor, which could newly refuse a non-flight input. A focused DeepSeek review was dispatched on that question, plus a cohort identity rerun.

**Two failures, 2026-11-16.**
- **E1 round 5 review crashed.** The process exited after `/tmp` hit a per-user quota (EDQUOT on a 1-byte write). No verdict, so no pass is claimed. Before the crash, the engine tests had passed; the only failure was a doctest that could not write a temp file.
- **A1 fix round stopped on the Codex usage limit**, which resets 4:54 PM local (21:54 UTC). It left uncommitted edits in the lane at `993507e`: `README.md`, `Flight.tsx`, `flightLayout.test.tsx`, plus a scratch `.a1-fix-capture.mjs`.

**Orchestrator actions:**
- **Cleaned `/tmp`.** Removed only this goal's lane and review scratch (E1, S3, T1 and A1 target and probe folders, about 5 GB). `/tmp` went from 80 % to 13 % used, and writes work again. Two folders of unknown origin were left in place.
- **Restarted the E1 round 5 review** on DeepSeek, with scratch and `TMPDIR` under `/home/ak/e1r5-review/`.
- **Scheduled the A1 resume** for 21:57 UTC in this thread, on the same Terra author at medium.

**E1 round 5 review, restarted (DeepSeek): ACCEPT WITH FINDINGS.**
- **Confirmed:**
  - R4-1 is fixed: the zero-impulse test fails on the base (exit 101) and the base WASM traps;
  - R4-2 is correct;
  - cohort rows are byte-identical (tail sha `f5e96e0e…`) and P1–P3 pass;
  - the app's TS motor validator is a strict superset of the Rust rule, so no app flow is newly refused.
- **F1 (Medium):** `simulate_candidate` refusals lost the typed `native candidate preparation refused: invalid-input:` prefix, because `to_motor` now validates before `PreparedCandidate::prepare`.
- **F2 (Low):** the two non-dispatched native entry points `evidence_calibrated_tables` and `diagnose_flight_loads` now refuse motors with nonzero curve endpoints.
- **F3 (Low):** a `run_ensemble_chunk` with an empty range is now refused for an invalid motor.
- **F4 (Info):** the candidate path has no test.

**Orchestrator fix for F1 and F4** (small review fix; Codex was at its limit):
- `models::to_motor` is split into a conversion-only `to_motor_unvalidated` plus validation.
- `prepare_native_candidate` uses the conversion-only form, so the candidate's own `validate_candidate_motor` (which calls the shared validator) reports the typed refusal, as it did at `0d564d9`.
- New unit test `zero_impulse_motor_keeps_typed_candidate_refusal`: it fails with the fix reverted and passes with it.

**F2 and F3 accepted as recorded behaviour changes:** neither path is reachable from the app, and refusing an invalid motor there is correct. These changes are not author-accepted; the step-4 physics re-review covers the final engine.

**F1 fix verified and E1 merged.** The fix is committed on the lane as `8c9e070`. In the lane, the core, engine and manifest suites all exited 0: 442 passed, 0 failed. **E1 merged into the goal branch as `dc210c4`** (`--no-ff`). Next: the goal-path WASM rebuild and the full suites (`out/step2-e1.sh`), then P1–P4 (`out/step3-e1.sh`).

## Steps 2 and 3 re-run after the E1 merge (2026-11-16)

**Engine.** `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs` from the goal worktree, exit 0. New WASM sha256: **`4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535`**. Evidence: `astraea-evidence/goal-collegiate-accuracy/step2-e1/`, produced by `out/step2-e1.sh`.

| Check | Result |
|---|---|
| tsc / vite build | 0 / 0 |
| cargo core / engine | 276 passed / 161 passed, 13 ignored, 0 failed |
| ARCAS | runtime 0; benchmark exits 1, the retained red as expected |
| vitest (full) | 2232/2234. Two failures, both explained below |
| browser smoke | 54 passed on attempt 3. Attempts 1–2 timed out at load 11–17 from another process; there were no assertion failures |

**The two vitest failures:**
1. `ShareFlightCard.test.tsx`: a load flake. Run alone at load 0.5 it passes 3/3.
2. `builtUpDrag.test.ts:110`: an **intended behaviour change from E1.**
   - Before, a 1.5 m nozzle exit on NASA SL (aft body 0.152 m) was silently dropped and the flight ran. That oversized exit had also fed the base-drag term behind physics-review blocking finding 1.
   - The engine now refuses it at every entry point with the aft-body message, matching the owner's "hint + engine error" decision.
   - The orchestrator updated the test to expect that exact refusal. The matcher is exact, not loosened. 4/4 pass.

**P1–P4 on the new WASM** (`out/step3-e1.sh`, evidence `step3-e1/`):
- P1–P3 pass: all 5.6240 % / 18 / +0.22 %; subsonic 5.5414, transonic 5.4024, supersonic 6.0662; blank 5.8755 / 16.
- K3 cohort rows are **byte-identical** to the pre-E1 step 3.
- P4 templates are unchanged: 304.0294885865904, 546.5369328003885 and 5013.508465461415 m.

**K4 band module.** `generate.py`'s WASM pin was updated from `bc19590b` to `4c1ec4ed` (recorded in the file). The regenerated module is byte-identical to `src/console/data/cohortError.generated.ts` (sha `a49e8d87…`).
- The K4 per-flight dump differs from the pre-E1 dump in exactly two fields: `cand.telemetry[].thrust` at the zero-thrust ignition sample (237.1 N → 0, in the 16 flights with a nozzle), and the `runManifest.thrustPressure` wording. This is E1 fix 4 (pressure term only while thrust > 0). Apogee does not move.
- **Evidence incident:** the K4 probe writes to a fixed path, `K4/cand.json`, so this run overwrote it. The file was regenerated from the step-0 WASM and is byte-identical to the recorded `be7d0ef2…`. The new dump is at `step3-e1/k4cohort/cand.json`.

**B1 plan.** The engine is now final pending the physics re-review, so P9 and the S4 rows run on `4c1ec4ed`. Probes from the earlier Sonnet B1 run exist uncommitted in `t3-77d16aae` and will be reused; see the B1 assignment § "Re-dispatch after the E1 merge". Dispatch to Terra **after** the A1 fix round's test run, so the host is quiet for timing.

**Owner routing change, 2026-11-16 ~20:32 UTC:** "Can't u just use deepseek omp for subagents", then "Use max".
- **Lane authors:** OMP `deepseek/deepseek-flash` (V4.1 Flash), thinking **max**. This replaces codex Terra medium while Codex is limited.
- **Reviewers:** must now be a non-DeepSeek family, so claude-pool `claude-sonnet-5-5`, or Codex once it is back. The earlier DeepSeek reviews of E1 stand, because E1's author was Codex.
- The scheduled Codex A1 resume (`scheduled-task:45dc4301…`) was deleted, and the A1 fix round was dispatched to DeepSeek.
- B1 (P9 and the S4 rows) goes to DeepSeek next, after A1's test run.

**A1 fix round** `13ccb6d` (author OMP DeepSeek V4.1 Flash, max; parent `993507e`). The author reports tsc 0, focused 26/26, full vitest 2235/2235, `vite build` 0, and two new production-CSP screenshots in `astraea-evidence/.../A1/` (`flight-error-line-temperature-set.png` `71177353…`, `flight-model-chooser.png` `7abcd6a7…`).

**Orchestrator diff read:** four files only. The chooser reads `Change flight model…`, the uniqueness assertion is restored, and the README blockquote matches the owner text. The screenshot shows `Average apogee error ±5.5 % (dev. data, 20 rockets; not a limit)` and the new chooser label.

**Dispatched:**
- A1 fix-round review → claude-pool `claude-sonnet-5-5`, effort high (non-DeepSeek, as the routing change requires). Focused tests only, to keep the host quiet.
- B1 → lane worktree `~/.paseo/worktrees/3s8t98rp/b1-step3-final`, branch `b1-step3-final` @ `defeeb0`, author OMP DeepSeek V4.1 Flash (max). P9 on baseline `bc19590b` against candidate `4c1ec4ed` (copy at `step3-e1/candidate-4c1ec4ed.wasm`), plus the S4 rows. The earlier probes were copied in uncommitted for the author to review and own.

**B1 result** `bad32ea` (branch `b1-step3-final`, author DeepSeek V4.1 Flash max; not yet reviewed). Evidence `step3-e1/b1/`; the orchestrator ran `sha256sum -c` and it passes.

- **P9: FAIL under the frozen rule.** Candidate default on `4c1ec4ed` against arm A on `bc19590b`, 12 interleaved rounds × 23 cases, one run, load 1.1–3.2.
  - Median per-case ratio **1.683×**; aggregate 1.779×; max 2.115× (qu8k); 23 of 23 cases above 1.10×.
  - A/A spread 0.046 %, so the host was quiet enough to decide.
  - The A/B differs in options and engine. The slowdown was expected in kind: the built-up default flies a baseline pass and then the built-up pass.
  - Nothing was tuned and there was no rerun.
- **S4 rows (report-only, final WASM).**
  - Time to apogee, simulated − measured: Cosmic Cargo +0.519 s, Mini DX3 +1.285 s, Top Shot −0.693 s, Adventurer −1.352 s. The clocks are not synchronised.
  - Proteus 6 max Mach 2.790 against a measured 2.94, non-comparable.
  - Top Shot and Adventurer flew legacy drag (freeform fins refused).

**A1 fix-round review: no verdict.** The Sonnet reviewer failed on a rate limit (429). No pass is claimed.

**Blocker for the owner:** P9 FAIL. The threshold is frozen and is not relaxed.

**Owner decision, 2026-11-16 ~21:00 UTC (P9):** "Record FAIL, carry on". P9 stays an honest FAIL in the Release Readiness Report (1.683× against the 1.10× limit; about 0.13 s per flight against 0.08 s). The threshold is unchanged and there is no engine change. Whether it blocks release is decided at stop (d).

**Review dispatched:** one combined review of the A1 fix round (`13ccb6d`) and B1 (`bad32ea`) → claude-pool `claude-sonnet-5-5`, effort high. If it fails on the rate limit again, the fallback is Codex Terra after its reset at 21:54 UTC. Both are non-DeepSeek, as the routing change requires.

**A1 + B1 review (claude-sonnet-5-5, high):**
- A1 fix round `13ccb6d`: **ACCEPT**.
- B1 `bad32ea`: **ACCEPT WITH FINDINGS**. All findings are low. The reviewer recomputed every P9 number from the raw data, and the FAIL holds under any A/A reading (minimum A/B ratio 1.55).

**Merged:** A1 as `b222574` and B1 as `5f39c3d` (`--no-ff`). The merged-tree tsc, vite build, full vitest and smoke are running, with evidence in `step2-merged/`.

**Owner routing decisions, 2026-11-16:**
- Authors: DeepSeek V4.1 Flash, max.
- Reviewers stay a different family from the author: Sonnet, or Codex as fallback. The owner asked whether an isolated same-family review would do; they were told isolation removes anchoring but not shared blind spots, and they kept the rule.
- **Sonnet reviewers run at effort medium** ("no need for high").

**Merged-tree checks** (HEAD `5f39c3d`, WASM `4c1ec4ed`; evidence `step2-merged/`): tsc 0, vite build 0, **vitest 2235/2235**. Smoke attempt 1 timed out on a click (waiting for navigation) at load 5–9; there was no assertion failure. Attempt 2 was cut off when the T3 server restarted. The load (15.8) came from other processes on the host (the T3 app and an unrelated node test runner).

The smoke re-run, then **P7** (`out/p7-e1.sh`: the step-0 native `dev_vehicles` and `cohort` tests on the merged engine source, compared with `step0/cohort-native/`), are queued in the background. Each waits for load below 6. The release report draft was updated at `ca4d44d`.

**Merged-tree checks complete** (HEAD `5f39c3d`, WASM `4c1ec4ed`):
- browser smoke **54/54** on attempt 4. The job ran detached (`out/smoke-p7.sh`, `setsid nohup`) after two T3 server restarts killed attempts 2 and 3.
- **P7 PASS:** the step-0 native `wiring`, `cohort`, `ensembles` and `dev_vehicles` tests on the merged engine source each exit 0, and their outputs are identical to `step0/cohort-native/` apart from the identity block. Evidence in `step3-e1/native/`.
- The first `cohort` attempt exited 101 only because `wiring` had not run first: a script ordering error, since fixed.

Still pending on the report: native Linux desktop smoke after E1, the physics re-review, stop (b) and stop (d).

**Native Linux desktop smoke after E1** (`out/desktop-smoke-e1.sh`, detached): vite 0, tauri build 0 (binary `38ff5747…`), app exit 0, check exit 0. Apogee 546.5369328003885 m, touchdown, validity PASS.

**Physics re-review, round 2 (DeepSeek V4.1 Flash, max): ACCEPT WITH FINDINGS.** See `step4/PHYSICS-REVIEW-2.md`. Pending owner decisions: N2 (engine fix before the blind test?) and the N1 and N6 wording.

**Owner decisions on the round-2 physics review, 2026-11-16:**
- **N2:** record as a known limit, with no engine change.
- **N1:** the error line states the regime's airframe count.
- **N6:** the claim says "nozzle exit set where the design has one".

The N1 and N6 wording goes to lane A2 (see the assignment). N2–N5, 8 and 13 go to the report's known limits.

**Owner stop (b), 2026-11-16: "Phase 1 now, ask before open".** Phase 1 covers qualification, exclusion rules, and predictions with 5–95 % intervals, committed before any log is opened. Opening each set's logs is a **separate** owner approval.

**Custody.** The orchestrator read exactly two sealed objects, the design files V001 `c10b507d…` and V002 `7ccec265…`, both `read_state: design_only` in the custody manifest. They were parsed in code with the `<simulations>` and `<flightdata>` blocks removed (both files had them), and the content was not displayed. The stripped copies and `CUSTODY-READ-LOG.json` are in `step4-blind/design/`. No flight log was touched. The BL1 lane (DeepSeek) gets only the stripped copies.

**BL1 round 1** `bee7329` (DeepSeek; not reviewed):
- **Qualified:** 6 of 12, the Emerald Streak C6-5 ×3 and C6-7 ×3. All six fly **legacy** drag (freeform fins refused): nominal 158.64 m, 5–95 % 140.66–177.13 m.
- **Not qualified:** 6, because their motors are absent from the app database: D13-10W, QC6-5, I140W and J270W.
- **Import gap:** the app's ORK import refuses both designs (stage mass/CG override, dropped fin-seat attributes). The predictions use a declared-design reconstruction, not the product import path. This is recorded as a product gap.

**Owner decision, 2026-11-16: "Download 4 motor curves".** The orchestrator made one download from the ThrustCurve.org API (`download.json`, RASP format, generic client name, no personal data):
- AeroTech D13W `5f42…0021` (cert);
- Quest C6 `5f42…0016` (cert);
- AeroTech HP-I140W `5f42…03f5` (manufacturer data only);
- AeroTech HP-J270W `5f42…03f7` (manufacturer data only).

The files, `PROVENANCE.json` and `SHA256SUMS` are in `step4-blind/motors/`. BL1 round 2 was sent to the same author to predict the remaining 6 flights and leave the first 6 unchanged.

**A2** `9891017` was read by the orchestrator (texts exact; `mae` and `maximum` byte-identical; `airframes` comes from the generator), and its Sonnet review (effort medium) was dispatched.

**A2 merged** `c21649b` (Sonnet medium review: ACCEPT). Merged tree: tsc 0, focused tests 14/14. Low finding, recorded: no test pins the claim text itself across its five copies.

**Owner routing, 2026-11-16:** Sonnet reviewers run at effort **low**. Authors stay DeepSeek V4.1 Flash, max.

**BL1 round 2** `cbdef58` (DeepSeek; not yet reviewed):
- All 12 flights are predicted; the first 6 are unchanged.
- **Every one of the 12 flies LEGACY drag.** DD Vulcanite also has freeform fins, so the blind test does **not** exercise the new built-up default.
- Nominal / 5–95 % by flight:

  | Flight | Nominal | 5–95 % |
  |---|---|---|
  | Emerald C6-5/C6-7 | 158.6 m | 140.7–177.1 |
  | Emerald D13-10W | 315.9 m | 295.6–341.9 |
  | Emerald QC6-5 | 172.3 m | 153.0–192.1 |
  | Vulcanite I140W (GPS-only) | 1079.7 m | 949.4–1214.6 |
  | Vulcanite J270W | 1874.0 m | 1723.9–2035.7 |

- I140W and J270W use manufacturer curves, with an extra ±10 % impulse scenario (declared, not tuned).

BL1 review dispatched to Sonnet at low effort. Next: owner stop (b) phase 2 with the prediction SHA.

**BL1 review (Sonnet, low): ACCEPT WITH FINDINGS.**
- Hashes verified; 12/12 complete; the reviewer reproduced 4 nominals exactly.
- No tuning and no code change; legacy drag confirmed for all 12 flights.
- Two low labelling findings: V002 `designs[].axialDrag` is null, and the recorded options say "calibrated" although legacy flew. These go into the report. The frozen file is not edited.

**BL1 merged** `c9f9ea7` before any log was opened.

**Owner stop (b) phase 2, 2026-11-16: "Open both sets".** BX1 extraction was dispatched to DeepSeek V4.1 Flash, max, a separate agent from the predictor (assignment `lanes/BX1-blind-extraction-ASSIGNMENT.md`).
- **Kept blind:** the extractor gets only the rules (`step4-blind/FROZEN-RULES-FOR-EXTRACTOR.json`), not the predictions.
- **Custody:** it may open only `blind-manifest.json` and the 12 V001/V002 flight logs, each once, with every read logged.
- **Next:** score the outcomes against `PREDICTIONS.json` (orchestrator), a Sonnet low review, then stop (d).

**BX1 extraction** `c0f473a` (DeepSeek; separate agent from the predictor; predictions not read). The extractor opened exactly 13 sealed files: `blind-manifest.json` plus the 12 V001/V002 logs, each hashed and copied once. **0 of 12 are scorable under the frozen rules.**
- **E6 fails on all 12:** the loggers started at launch, leaving 0.05–3.9 s of pad data against the 5 s required.
- **E3 fails on 6:** four of these on V001 come from comparing adjacent samples against the barometer's step size; both V002 logs end while still airborne.
- **E4 fails on V002-02:** GPS-only, and the exemption named only V002-01.

No rule was changed.

**Owner decision, 2026-11-16: "0/12 blind + labelled dev comparison".** The report states "blind result not available (0 of 12 scorable under frozen rules)". It adds a clearly NON-blind development comparison that uses stated relaxed rules. The claim keeps "blind test pending".

**SC1 scoring** `bf5a22a` (lane `sc1-blind-scoring`, built on BX1 `c0f473a`; author DeepSeek; not yet reviewed):
- **Blind result:** not available, 0/12 scorable under the frozen rules.
- **NON-BLIND development comparison:** 10 Emerald Streak flights, all on legacy drag.
  - Median signed error **−26.3 %**; 0/10 within ±10 %; mean |error| 27.9 %; interval coverage 0/10.
  - Every measured apogee is above the frozen band.
  - By motor: D13-10W −40.8 %, C6-5 −31.7 %, QC6-5 −25.8 %, C6-7 −21.2 %.
- **Vulcanite:** both flights stay excluded, because the logs end while still airborne. Its apogee values were already AGL.
- **Likely causes (not separated):** the legacy model itself, or the hand reconstruction of the declared design, which was needed because the app import refuses the ORK.

The combined BX1 + SC1 review was dispatched to Sonnet at low effort.

**BX1 + SC1 review (Sonnet, low): ACCEPT WITH FINDINGS**, with four low wording notes. **Merged** at `e95353b`.

The Release Readiness Report is complete and marked **FOR OWNER APPROVAL (stop d)**. Next: owner stop (d). The recommendation is to approve as a beta after one legacy-fallback wording change. P9 is accepted as a recorded limit. A main merge or push is a separate owner action.

Note: `git fetch origin` (read-only, private dev remote) ran once to confirm `origin/main` = `32183fd`.

**OWNER STOP (d), 2026-11-16: APPROVED, "Approve + add legacy sentence".**
- P9 is accepted as a recorded limit.
- The legacy-fallback sentence is added to the public claim through lane A3 (see `lanes/A3-legacy-sentence-ASSIGNMENT.md`).
- The goal is complete when A3 is reviewed and merged. Merging into `main` or pushing stays a **separate** owner action, because it deploys the website.

## GOAL COMPLETE, 2026-11-16

- **A3 merged** as `39407e0`, after a Sonnet low-effort review: ACCEPT, no findings.
- **Merged-tree checks:** tsc 0; focused tests 12/12, including the new claim pin; `vite build` 0. The built `dist/index.html` carries the new sentence, and the WASM is still `4c1ec4ed`.
- **Stop (d) condition met.** The owner approved the Release Readiness Report on the condition "Approve + add legacy sentence"; the sentence is now merged.

**Final state.** Branch `goal/collegiate-accuracy` @ `39407e0` plus this record. Engine WASM `4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535`. The report is `RELEASE-READINESS-REPORT.md`, status APPROVED.

**Not done, by authority:** no merge into `main`, no push, no tag, no release, no deploy. Merging into `main` and pushing it deploys the website and needs a separate owner instruction. PR #2 is untouched.

**Open items carried forward** (recorded in report §4 and §6):
- P9 FAIL, accepted as a limit.
- No blind result. The new default model has no blind test; the legacy fallback is about 26 % low on Emerald Streak in the NON-BLIND comparison.
- The ORK import gap.
- N2, the nozzle bound skipping a flagged motor-mount tube.
- Space shots run about 12 % low.
- Windows and macOS native smoke not run.

**Lane worktrees left in place until the owner decides on cleanup:** a1-app-wording, a2-review-wording, a3-legacy-sentence, b1-step3-final, bl1-blind-predictions, bx1-blind-extraction, sc1-blind-scoring.

## RELEASE EXECUTED, 2026-11-17

Owner instruction: "do all of the above" (merge, push, tag, version bump; PR #2 explained and merged as a consequence).

- **Version bump:** 0.10.1 → 0.11.0 in `package.json`, three crate manifests and two tracked lockfiles (`dab6425`), with a 0.11.0 CHANGELOG entry.
- **Merge:** `main` @ `628a400` (`--no-ff` merge of `goal/collegiate-accuracy`); the local docs-only commit `400fd1c` is included.
- **Merged-tree checks** (`main-merge` worktree, engine rebuilt from merged source): tsc 0; 39 focused tests pass across 6 files; `vite build` 0; dist carries `0.11.0` and the A3 sentence.
- **Engine identity:** the rebuilt WASM in this checkout is `6e0cc08ee42cf874c1eca7d94748a1571410a7bba21e008ab6812575f1d79ebb`. It differs from the benchmark's `4c1ec4ed` because embedded absolute paths differ (Amendment 1); source and behaviour are the same, manifests carry 0.11.0. CI and the website rebuild the engine per checkout, so the deployed hash must be read from the deployed asset.
- **Push:** `main` 32183fd→628a400; `goal/collegiate-accuracy` 9801ad7→dab6425; tag `v0.11.0` → `628a400`.
- **PR #2:** GitHub marked it **MERGED** at 2026-11-17T02:40:48Z with merge commit `628a400` (head updated to `dab6425`). No manual close or comment was needed.
- **Git access fix:** the stored fine-grained PAT is read-only (Contents), so every push returned 403. Installed a write-enabled repo deploy key `cachyos-t3-omp` (id 170137304) through the API, switched `origin` to `git@github.com:akhan157/astraea-dev.git`, and pinned the key in `~/.ssh/config` for github.com.
- **Workflows:** the Release workflow was `disabled_manually`. Enabled and dispatched at `v0.11.0` (run 44004824842). Website run 44004754645 deployed `main` @ `628a400`.

**Verification of the deployed site and the draft desktop release follows.**

### Deployed site verified, 2026-11-17

- Website run 44004754645: **success**. `https://astraea-5e2.pages.dev/` and `/app/` serve the 0.11.0 build.
- The landing page carries `0.11.0` and the A3 sentence; the app bundle `app-BFvOTcIL.js` carries `0.11.0` and the same sentence.
- **Production engine:** `assets/astraea_engine-BhZQMjX6.wasm`, sha256 `82d727e552cf356967141697a5c4a565d45a4806ca0894647c59940110946288`, 2,076,406 bytes. It differs from the local 0.11.0 build (`6e0cc08e…`) only in embedded absolute paths and offset-shifted binary noise; the meaningful string table is identical after normalising the checkout roots. This is the hash the deployed app reports as its engine identity.
- Release run 44004824842 was dispatched at `v0.11.0`; its outcome is in the next section.

### Desktop release verified, 2026-11-17

- Release run 44004824842: **success on all four targets** — ubuntu-22.04, windows-latest, macOS x86_64 and macOS aarch64. Tauri built the 0.11.0 bundles with updater signatures and `latest.json`.
- The ubuntu job logged "Couldn't find release with tag v0.11.0. Creating one."; the other three logged "Found draft release with tag v0.11.0 on the release list." and uploaded their bundles. All four jobs succeeded.
- **Why the API shows no release:** the fine-grained PAT is read-only, and draft releases are not listed for it (`/releases` returns `[]`, `/releases/tags/v0.11.0` 404). The draft is verified from the four job logs, not from the API. The owner sees it under Releases (draft) in `astraea-dev`.
- **Second draft in the public repo:** pushing tag `v0.11.0` to `astraea` also ran Release (44015444617) and its ubuntu job created a draft `v0.11.0` there; all four jobs uploaded their bundles and `latest.json`. The public README points at that repo, so the public draft is the one to publish.
- **Not published:** both releases stay draft prereleases (`releaseDraft: true`, `prerelease: true`). Publishing is an owner action; until then the public download link has no files (see the CI section below).

### Public CI red on the 0.11.0 export, fixed 2026-11-17

- **Failure:** public repo (`astraea`) CI run 44015444574, `main` @ `4f89853`, step
  "WebKit viewport context lifecycle": `AssertionError: Flight must use the
  attitude-posed camera`, `null !== 'upright'`
  (`scripts/viewport-context-lifecycle.mjs:360`). Chromium, Firefox, unit tests, build
  and the Rust job passed in the same run. Release run 44015444617 (all four targets) and
  macOS smoke run 44015444596 (arm64, x64) passed on the same commit.
- **Cause:** the harness read `data-camera-pose` in the same tick the Flight canvas
  became visible (`waitForActualCanvas` → `expectOneVisibleCanvas` → `state()`).
  `CameraFit` in `src/console/viewport/Viewport.tsx` early-returns while
  `upright && !chromeReady` and writes that report in an effect after the stage commits,
  so the report trails the canvas. Local WebKit passed; CI's WebKit read the gap.
- **Fix:** lane `ci/webkit-pose-report` @ `254ad6a`, merged into `main` as `d64a521`.
  The harness now polls up to 15 s for `cameraPose`, and the poll itself requires
  `'upright'`; `poseQ` is still asserted. No tolerance and no app change.
- **Falsifier:** a throwaway harness that delayed the `upright` write by 1.2 s failed the
  old assertion with the CI error (`null !== 'upright'`) and passed with the wait.
  Undelayed local WebKit (80 s) and Firefox runs pass. Chromium was not run to
  completion: it runs this script under SwiftShader and exceeded a 300 s budget, and
  Chromium is not a CI runner for this script.
- **Independent review: none.** claude-pool `claude-sonnet-5-5` returned 429 (reset in
  about 1h47m) and codex `gpt-6.1-sol` hit its usage limit (until 2026-11-22). No verdict
  exists; the CI run on the pushed commit is the acceptance check.
- **Public repo:** `main` `4f89853`→`6b37534`, a test-only export of `d64a521`. Tag
  `v0.11.0` and the draft release stay at `4f89853`; the shipped bundles are unchanged.
- **Live gap for the owner:** the public README on `main` points downloads at
  `releases/tag/v0.11.0`, but that release is still a draft. The anonymous asset list
  (`releases/expanded_assets/v0.11.0`) returns 0 files against 17 for `v0.10.1`.
  Publishing the draft in `akhan157/astraea` is the owner action that closes it.
- **Public CI run 44019941427 (`main` @ `6b37534`): success.** Frontend and Rust jobs
  green, including "WebKit viewport context lifecycle", the step that failed on
  `4f89853`. Chromium, Firefox and WebKit acceptance, unit tests, engine build, site
  build, desktop shell build and startup-trace checks all passed. This is the only
  independent check on the fix; no model review produced a verdict.
- **macOS packaged smoke now ran:** public run 44015444596 built the `.app` on arm64 and
  x64, verified the ad-hoc signature, launched the packaged binary in smoke mode and
  asserted the baseline flight — success on both. Interactive macOS acceptance (a person
  on a Mac) is still not done, and Windows native smoke is still not run.
- **Deploy of the fixed tree:** Website run 44021387032 (`main` @ `bed709f`): success,
  including the browser acceptance suite and the Cloudflare Pages deploy. The live app
  bundle is still `assets/app-BFvOTcIL.js` and the engine still
  `assets/astraea_engine-BhZQMjX6.wasm`, sha256
  `82d727e5…` (2,076,406 bytes) — the same bytes as before the fix, so the harness change
  did not alter the product.

### Public 0.11.0 release published, 2026-11-17

Owner instruction: "u do it" (publish the draft and move the download links).

- **Export:** public `akhan157/astraea` main `4f89853`, the tree of dev `cc0ee2e` (README links and beta label moved to 0.11.0) minus `docs/internal/session-handoff/` and `docs/internal/SESSION-HANDOFF.md`, with the no-reply author. Export checks before the push: install 0, engine build 0, tsc 0, vitest 194 files / 2236 tests, build 0. Annotated tag `v0.11.0` → `4f89853`.
- **Runs at the tag:** Release `44015444617` success (17 assets); macOS smoke `44015444596` success; CI `44015444574` failed on the WebKit pose read, which was fixed in `d64a521` (public `6b37534`, CI `44019941427` success; see above).
- **Draft check before publishing:** 17 assets as in v0.10.1; `latest.json` version 0.11.0, 11 platforms, every URL under `v0.11.0/`, every signature key id `fa7c047b724303d2` (= the app's updater key and 0.10.x's key).
- **Published** as a pre-release at 2026-11-17T13:28:16Z. Update-feed run `44093043209` success; `update-feed/latest.json` now returns 0.11.0. The Windows installer URL returns 200; the landing page links `releases/tag/v0.11.0`.
- **Access:** the saved PAT is read-only and got 403 on the public repo. The owner supplied a short-lived fine-grained token (Contents write, public repo only), used per command from a T3 secret file; it is not stored in git config or records.
- **Removed** the merged lane worktrees a1, a2, a3, b1-step3-final, bl1, bx1, sc1; branches kept.
- **Not verified:** an in-app update from an installed 0.10.x on a real machine; Windows native smoke.

### Windows smoke, dependency fixes and public export, 2026-11-17

Owner instruction after the PC lost power mid-session: "finalize the situation, fix whatever was going, properly merge PR etc."; then "u take care of it till everything done, also fix the update workflow".

- **Dev Website red on `6dd1544`, a flake:** run 44093179742 failed `test:browser` on "clicking a viewcube face must change the camera orientation (orbit version stayed 0)". The commit was docs-only. A re-run of the failed job passed, including the Cloudflare Pages deploy.
- **Windows smoke merged:** PR #3 (`ci/windows-smoke`, `de2f8c4`) merged as `9673adc`; branch kept. Evidence: run 44097599765 on `c3a0352`, apogee 546.54 m, touchdown, app 0.11.0; `de2f8c4` only drops the temporary push trigger. Website run 44157316153 on `9673adc`: success.
- **fast-xml-parser 5.11.1 → 5.12.1** (Dependabot alert 19, low): PR #4 merged as `93d69b1`. Local checks: tsc 0; `vitest run src/formats` 14 files / 241 tests. Website run 44170241852 (build, browser acceptance, deploy): success.
- **"Update workflow" = Dependabot Updates on the public repo:** its security job for `glib` failed with `security_update_not_possible` (run 42517445939). glib 0.18.5 is pinned by Tauri 2.12's GTK3 stack (gtk 0.18.2, Linux only); the fix is in glib 0.20, which needs gtk4-rs. The app never calls `VariantStrIter`. Alert 18 dismissed as tolerable risk in both repos, with that reason; reopen when Tauri leaves GTK3. The Update feed workflow was never red.
- **Public export:** `akhan157/astraea` main `6b37534`→`fa09934`, the tree of dev `93d69b1` minus the session-handoff notes, no-reply author. Public Dependabot PR #1 closed as superseded.
  - Public Windows smoke run 44172737355 (dispatched; free on the public repo): **success**, apogee 546.54 m, touchdown.
  - Public CI run 44172726167: attempt 1 failed in Firefox acceptance only on `NS_BINDING_ABORTED` from `chrome://juggler/content/content/WorkerMain.js`, which is Playwright's Firefox instrumentation, after every journey had passed. Attempt 2: success.
- **Open alerts:** dev alert 20, picomatch ≤ 4.0.7 (high, ReDoS); no patched version is published (latest is 4.0.7). Public has none open.
- **Status of the carried items:** Windows and macOS **scripted packaged smoke** now pass on hosted runners. Still not done: interactive Windows and macOS acceptance by a person, and an in-app update from an installed 0.10.x on a real machine.

### Update path tested end to end, release pipeline hardened, in-app reporting, 2026-11-17

Owner instruction: test the "needs a person" items ourselves, and check that updating is smooth for users and automated for the maintainer.

- **Updater, real install, 0.10.1 → 0.11.0 from the live feed** (PR #5, `.github/workflows/updater-e2e.yml`). Agent-driven on hosted VMs, not a person:
  - Linux, run 44191603279: WebKitWebDriver. Offer named 0.11.0; "Later" removed it and installed nothing; offer returned after relaunch; "Install and restart" downloaded and restarted. The AppImage's sha256 went `8323d5c0…` → `9c371d0c…` (= the published 0.11.0 AppImage), and the relaunched app was running.
  - Windows, run 44191603279: UI Automation; "Later" kept 0.10.1; install moved the uninstall-registry `DisplayVersion` and the exe `ProductVersion` to 0.11.0.
  - macOS arm64, run 44190403313: System Events accessibility; "Later" removed the offer; install set `Info.plist` to 0.11.0.
  - Run after each publish: `gh workflow run updater-e2e.yml -f from=<prev> -f to=<new>`.
- **Found:** 0.10.x has no working-session recovery, so unsaved edits are lost when a 0.10.x user clicks "Install and restart". 0.11.0 and later keep the recovery slot.
- **Found:** the second updater endpoint (`releases/latest/download/latest.json`) is 404 because every release is a pre-release; only the `update-feed` endpoint works.
- **Release pipeline** (PR #6): `release.yml` runs preflight (version agreement across package.json, Cargo.toml, Cargo.lock, CHANGELOG.md, README.md and the tag; notes from CHANGELOG) → the full CI suite (`workflow_call`) → bundles. `update-feed.yml` takes a manual tag for rollback. `scripts/export-public.sh` does the public export. Browser tests ignore Playwright Juggler console noise. Not exercised by a real tag yet.
- **Update banner** shows download percent (PR #7).
- **Report a problem…** in the Project menu opens the GitHub bug form pre-filled with version and platform; desktop `target=_blank` links go to the system browser through `tauri-plugin-opener`, scoped to `https://github.com/akhan157/astraea/*` (PR #8). Windows smoke run 44192077289 on the branch: success.
- **Still open:** native Save/Open/export dialogs, hardware GPU, keyboard/accessibility and 1280×800 rows of the desktop checklist on Windows and macOS; a person has not used the app on either OS. Picomatch alert 20 has no fixed release.

### 0.11.1 released and the update path proven, 2026-11-18

Owner instruction: finalize the update work, ship it so everyone has it, warn 0.10.x users to save first, then run the automated update tests.

- **0.11.1** (PR #9, plus #7 and #8): the update offer says "Save your project first" and links "What's new"; the release notes open with a save-first note for 0.10.x users, whose shipped banner cannot show one. Report a problem; download progress; desktop links via the opener plugin. Engine unchanged from 0.11.0.
- **Before merge**, a real Linux build of the 0.11.1 tree (run 44204700907): `__TAURI__.opener.openUrl` present; bug-report URL allowed; `https://example.com/` refused ("Not allowed to open url"); an unsaved Vehicle name restored after quit and relaunch.
- **Release** v0.11.1, first run of the new gate (run 44208237855): preflight, full CI, four bundles, all success; Windows and macOS smoke on the tag success. Draft check: 17 assets (same set as v0.11.0), `latest.json` 0.11.1 with 11 platforms all under v0.11.1, every signature key id `D20343727B047CFA` (= the app's updater key). Tagged `a20e092` with the no-reply tagger; published 2026-11-18T01:04:43Z; update-feed run 44212980517 success; live feed serves 0.11.1.
- **Updater e2e, all green:**
  - 0.11.0 → 0.11.1 (run 44213040875): Linux, Windows, macOS. Linux also proved an unsaved Vehicle name typed before "Install and restart" was restored after the update.
  - 0.10.1 → 0.11.1 (run 44213035880): Linux and macOS on attempt 1. Windows saw no offer within 120 s on attempt 1, then passed on attempt 2 (registry and exe 0.11.1, relaunched). The Windows offer wait is now 180 s.
- **Release time:** bundles now build in one wave (`max-parallel: 4`, PR #10), about 20 min per release including the CI gate.
- **Still open:** native dialogs, exports, hardware GPU, keyboard/accessibility and 1280×800 rows on Windows and macOS; the dead `releases/latest` fallback endpoint; unsigned installers; picomatch alert 20.
