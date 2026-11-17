# Lane assignment: A3, legacy-fallback sentence (owner stop d condition)

Status: **dispatched 2026-11-16.** Owner approved the Release Readiness Report at stop (d): "Approve + add legacy sentence".

| | |
|---|---|
| Branch / worktree | `a3-legacy-sentence`, `~/.paseo/worktrees/3s8t98rp/a3-legacy-sentence` |
| Author | OMP `deepseek/deepseek-flash`, thinking max |
| Reviewer | claude-pool `claude-sonnet-5-5`, effort low. The author cannot self-accept |

## Exact change (owner-approved; do not reword)

In all five copies of the full claim, replace:

`Shapes it cannot model use legacy drag, which has no blind test on those shapes.`

with:

`Shapes it cannot model use legacy drag, which has no blind test on those shapes; on one small rocket with freeform fins it predicted about 26% low (10 flights, development comparison).`

The five copies are `src/console/evidenceClaims.ts` (`BETA_ACCURACY_CLAIM`), `index.html`, `docs/accuracy.md`, the `README.md` blockquote (wrapped like the surrounding text), and `.github/workflows/release.yml` (`releaseBody`). Change nothing else. The banner is unchanged.

Add one test that pins the full `BETA_ACCURACY_CLAIM` string. This also closes A2 review finding L1, where no test pinned the claim. Update any pin that breaks, with exact strings and no loosened matchers.

## Acceptance

- `free -h` first.
- tsc 0, the focused tests, the full vitest run (`--maxWorkers=2`) and `vite build` all pass.
- A grep shows the new sentence in all five copies.
- No engine, threshold or value change. No network or push. Run long commands detached with logs. Do not edit GOAL-HANDOFF.md or the release report.
