# Author; not self-accepted

Lane `fix-smoke-default-project`, branch from `a57a7c8`. Nothing here is accepted; the orchestrator reviews.

**Author switch:** codex `gpt-6.1-terra` hit its Codex usage limit after `1905432` and `f7ddabc`. This evidence pass was done by claude-sonnet-5-5, started at HEAD `7337298`. No script or product code was changed in this pass.

## Code in the lane (scripts only)
- `6bf3478` — baseline assertion `Math.abs(nasaBaseline - 534) < 2` in `accuracyBundleJourneys`.
- `1905432` — layout wait after dismissing the restore notice (`scripts/preview-journeys.mjs`).
- `f7ddabc` — `resetAccuracyProject`: removes `astraea.working-session.v1` and `astraea.project.v1` from localStorage and from the IndexedDB `astraea`/`projects` store, reloads, asserts no "Restored unsaved work" status.

## 1. Falsifier (assertion + layout wait, no reset)
Detached worktree at `1905432`, fresh `pnpm install --frozen-lockfile`, `CARGO_BUILD_JOBS=2 pnpm build` (exit 0), then `pnpm test:browser`, exit 1 on the first attempt:

    AssertionError [ERR_ASSERTION]: Desktop baseline ~534 m; browser returned 372 m
        at accuracyBundleJourneys (scripts/preview-depth.mjs:216:10)

In that run the 1280×800 check passed first (239.6 px), so the 372 m failure is the first failure. This proves the restored project gives 372 m in the full run and the assertion catches it. Worktree removed afterwards.

## 2. Diagnosis of "Flight free region 214.1 px < 220 px"
Probe: `logs/smoke-default-project-author2-probe.mjs` (outside the repo). It runs a flight, waits for the session debounce, reloads, resizes to 1280×800, and samples notice presence, canvas height and safe-region height every ~15 ms; then clicks Dismiss and samples again. Output: `logs/smoke-default-project-author2-probe.log`.

- The notice is 25.5 px tall (canvas 382.1 → 356.6 px). 239.6 − 25.5 = 214.1 px, which is exactly the failing number. So the failure is a measurement taken while the notice was still shrinking the canvas.
- After clicking Dismiss, the canvas height and the safe region both returned to 382.1 within 40–60 ms of the notice being removed (rounds 2 and 3), and they moved in the same sample. The dismiss-then-resize lag is therefore small, not the cause by itself.
- The notice itself can appear late: in round 2 the first sample after reload had no notice and no canvas; the notice appeared at +9.6 s (host under load, software GL). In round 1 no notice appeared in the sampled window.
- [INFERENCE] The 214.1 px case at `6bf3478` is the notice present at measurement time. The old code checked `count()` once, clicked, and measured immediately. It cannot be separated from the late-notice case with this probe alone, because both leave the notice in place. I did not reproduce 214.1 itself.

**Does the current wait miss a case?** Yes, in principle: if the notice is absent when `notice.count()` is read and appears afterwards, the wait is skipped and the final `toHaveCount(0)` has already passed. I did not see this happen in the real suite (all full-suite 1280 measurements on lane code read 239.6 px). Because I could not demonstrate a miss in the suite, I have **not** changed the code. Proposed fix, for the orchestrator to approve (no threshold change): re-assert `await expect(notice).toHaveCount(0)` immediately after the free-region measurement (before the 220 px assert), so a late notice fails with a clear message instead of a misleading 214.1 px. Not committed.

## 3. Runs on lane HEAD `7337298` (code unchanged since `f7ddabc`)
Logs in `~/astraea-walkthroughs-2026-11-12/main-checks-2026-11-13/logs/`, prefix `smoke-default-project-author2-`.

| Run | Command | Exit | Notes |
|---|---|---|---|
| full run 1 | `pnpm test:browser` | 1 | unrelated: `preview-journeys.mjs:137` `toContainText('Ctrl+Enter')` on Run simulation button, "element(s) not found", 5000 ms (before this lane's code) |
| full run 2 | `pnpm test:browser` | **0** | 1280×800 free region 239.6 px; `Accuracy bundle default journey passed: no new line on the default project (baseline 533 m)`; site-temperature 533→541, nozzle 533→535, built-up drag 533→549 |
| scoped run 1 | `ASTRAEA_ONLY_JOURNEYS=accuracy pnpm test:browser` | 1 | unrelated: `page.goto` 30000 ms load timeout at `preview-depth.mjs:235` (the first `goto` in the journey, before the reset) |
| scoped run 2 | `ASTRAEA_ONLY_JOURNEYS=accuracy pnpm test:browser` | **0** | `Accuracy bundle default journey passed ... (baseline 533 m)` |

The two failures are timing/load failures at points this lane does not change (the scoped one is a plain navigation timeout). I did not edit those journeys. [INFERENCE] they are host-load related; not proven.

`node --check scripts/preview-depth.mjs` exit 0; `node --check scripts/preview-journeys.mjs` exit 0.

## Not done / left
- The late-notice guard above is proposed, not applied.
- The unrelated suite flakiness (line 137 button lookup, share-flight/goto timeouts, freeform import) needs its own lane on suite timing under load.
- Independent review and acceptance by the orchestrator.
