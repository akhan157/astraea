# T1 result — in progress, not self-accepted

Base: d3a2f78911750238a093b4f300e6b56bb25c43f8. `scripts/preview-journeys.mjs:548` polls for the fit report's `data-viewport-size` to match the live canvas dimensions within its one-decimal rounding, with a 20-second failure timeout. The viewport writes this size alongside the safe region. The 220 px assertion remains unchanged. This mechanism still needs independent review and regression proof.

The production build succeeded with `./node_modules/.bin/vite build`; WASM SHA-256 was `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff`. The prescribed dependency symlink could not write Vite's cache (read-only filesystem); a writable `/tmp` copy needed a missing React peer link to build. `node --check scripts/preview-journeys.mjs` and `git diff --check` succeeded.

| Run | Exit | Passed messages | Free-region heights | Starting load average |
| --- | --- | --- | --- | --- |
| 1 | 1 | 49 | 239.6 px (1280×800), 479.6 px (1600×1000) | 6.77, 6.78, 4.69 |
| 2 | not run | — | — | — |
| 3 | not run | — | — | — |

Run 1 failed later in `preview-depth.mjs:195` on a 30-second simulation click timeout; load after it was 16.56, 14.05, 9.85. Output: `/tmp/t1-smoke-1.log`. A prior sandboxed attempt could not bind localhost (EPERM), and ran no checks. Runs 2 and 3 are pending a load average at or below 8. The scratch under-220 regression-capability proof has not been performed. No acceptance is claimed.

## Orchestrator runs (2026-11-15, after `vite build` exit 0)

Each run started at load average 4–5. During each run the load rose to 20–28: other sessions on the host were running headless browsers.

| Run | Exit | Passed lines | Flight free region (1280 / 1600) | Failure |
|---|---|---|---|---|
| 1 | 1 | 36 | 239.6 / 479.6 px | `preview-depth.mjs:46`: the vehicle-name check gave up after its 5 s timeout while the fixture project was still loading (still "Spaceport…") |
| 2 | 1 | 22 | 239.6 / 479.6 px | `page.reload` 30 s timeout |
| 3 | 1 | 22 | 239.6 / 479.6 px | 30 s timeout |

**The restore-bar check passed 3 of 3 at the steady value.** All three failures are Playwright timeouts later in the journey, caused by host load and unrelated to this change. A clean full smoke run is still owed on a quiet host at step 2.

**Regression capability.** The new code only waits, until the reported fit equals the live canvas size, with a 20 s timeout that fails loudly. The unchanged 220 px assertion then runs on the settled value, so a real shortfall still fails. A scratch-injection proof was not run because of the host load.

## Review (claude-sonnet-5-5, high, static): ACCEPT WITH FINDINGS

- **The wait condition is right.** `data-safe-region` and `data-viewport-size` are written together (`Viewport.tsx:382-383`). The 220 px rule is untouched, and nothing is weakened.
- **The orchestrator's run table supersedes the author's earlier table.**
- **Disposition: accepted increment, check in progress.** Two checks are owed at step 2 on a quiet host:
  1. a clean full `node scripts/browser-smoke.mjs` run;
  2. a negative control: delay the refit or inject a stale size, and confirm that the old code fails and the new code waits.
- **Low finding, deferred:** the poll can pass one frame before the overlay re-measure. This is mitigated by the 400 ms waits before the read. If the flake persists, poll `data-safe-region` for stability.
