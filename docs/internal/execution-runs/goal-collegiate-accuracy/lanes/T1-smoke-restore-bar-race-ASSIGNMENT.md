# Lane assignment: T1, browser-smoke restore-bar race (tests only)

Status: **drafted 2026-11-15.** It is dispatched after W1 merges, because both lanes touch `scripts/preview-journeys.mjs`.

| | |
|---|---|
| Base | `goal/collegiate-accuracy` at the dispatch commit |
| Author | codex `gpt-6.1-terra`, medium effort |
| Reviewer | a non-OpenAI family. No self-acceptance |

## Why

The full `node scripts/browser-smoke.mjs` fails intermittently at `scripts/preview-journeys.mjs:607`, with "the Flight free region must be at least 220 px tall (got 214.1 px)". The K3 lane diagnosed it (see `docs/internal/execution-runs/K3-improved-default/REVIEW.md` and GOAL-HANDOFF.md):

1. On the second app load, a stored working session restores and the "Restored unsaved work" bar (25.5 px) shows.
2. The journey dismisses the bar at `preview-journeys.mjs:544`.
3. The viewport's free-region attribute follows the new canvas size with a lag of 66–143 ms at 1× CPU, and up to about 1.6 s under load.
4. The free region is read roughly 0.8–1 s after the dismissal, so a slow update records the value with the bar still present: 239.6 − 25.5 = 214.1.

The base `d635726` also failed this way, in 1 of 7 runs. The race is pre-existing; K3 did not cause it.

## Fix (tests only)

After the dismissal, wait until the free-region measurement has settled before reading it. For example, poll until the attribute equals the live canvas-derived value, or until it is stable across two animation frames, with a bounded timeout. A timeout must fail loudly.

- Keep the **220 px rule** and every other assertion and threshold unchanged.
- Do not change app code.
- Do not add fixed sleeps as the fix.

## Acceptance

- The diff touches only `scripts/preview-journeys.mjs`, plus the lane's RESULT.md.
- **Regression capability:** show that the new wait still fails when the region truly is under 220 px. For example, inject a temporary CSS or JS change in a scratch build, and do not commit it.
- **Stability:** run the full `node scripts/browser-smoke.mjs` 3 times on the final build. Report each exit code, the passed count, the free-region values, and the load average.
- Run `free -h` first. Use two jobs. Kill every browser and server you start.
- RESULT.md goes in `docs/internal/execution-runs/T1-smoke-restore-bar-race/`.
