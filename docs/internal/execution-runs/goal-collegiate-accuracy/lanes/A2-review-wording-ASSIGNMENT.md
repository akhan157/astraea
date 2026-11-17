# Lane assignment: A2, physics re-review wording (N1, N6)

Status: **dispatched 2026-11-16.**

| | |
|---|---|
| Base | `goal/collegiate-accuracy` at the dispatch commit (after `7c0e999`) |
| Branch / worktree | `a2-review-wording`, `~/.paseo/worktrees/3s8t98rp/a2-review-wording` |
| Author | OMP `deepseek/deepseek-flash`, thinking max (owner routing, 2026-11-16) |
| Reviewer | claude-pool `claude-sonnet-5-5`, effort medium. A different family; the author cannot self-accept |
| Why | Physics re-review round 2, findings N1 and N6 ([`step4/PHYSICS-REVIEW-2.md`](../step4/PHYSICS-REVIEW-2.md)). Owner decisions, 2026-11-16: the recommended option on both |

## Exact texts (owner-approved; do not reword)

**N6, the full claim.** Five copies: `src/console/evidenceClaims.ts:20` (`BETA_ACCURACY_CLAIM`), `index.html:170`, `docs/accuracy.md:3`, the `README.md` blockquote and `.github/workflows/release.yml:72`. In each copy, replace

`with site temperature and nozzle exit set,`

with

`with site temperature set and the nozzle exit set where the design has one,`

Change nothing else. The banner (`BETA_BANNER_SHORT`) is unchanged.

**N1, the error line.** In `src/console/data/expectedError.ts:22`, the text becomes

`Average apogee error ±X % (dev. data, N rockets in this speed range; not a limit)`

where `N` is the number of airframes in the run's regime: 8 subsonic, 7 transonic, 5 supersonic.
- `N` must come from the same source as the value. Add the per-regime airframe count to the generated module: `generate.py` emits `"airframes": <count>` for each regime, from its own `groups` definition. Do not hard-code it in TypeScript.
- Regenerate with `python3 -I docs/internal/execution-runs/K4-expected-error-line/generate.py <manifest> /home/ak/astraea-evidence/goal-collegiate-accuracy/step3-e1/k4cohort/cand.json src/console/data/cohortError.generated.ts`. The manifest is `/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json`.
- The `mae` and `maximum` values must stay byte-identical. Show the diff of the module.
- The withheld messages are unchanged.

## Pins to update (exact strings; no loosened matchers)

- `expectedError.test.ts:11`
- `expectedError.integration.test.tsx:27,45`
- any test asserting the old claim fragment (`stageRendering.test.tsx`)
- `scripts/preview-journeys.mjs`, if it asserts the fragment

Grep the whole repo, excluding `docs/internal`, for `nozzle exit set` and `20 rockets`.

## Acceptance

- `free -h` first.
- tsc 0, focused tests, full vitest (`--maxWorkers=2`) and `vite build`.
- One production-CSP screenshot of the Flight screen showing the new error line with site temperature set (import `/home/ak/astraea-evidence/goal-collegiate-accuracy/K4/byrum.astraea.json`, expected `±5.5 % (dev. data, 8 rockets in this speed range; not a limit)`), plus the banner collapsed, to show the banner still fits one line.

## Rules

- No engine, `crates/` or WASM change. No threshold change. No K4 value change.
- Never open `R6-public-cohort/`, any book library, or `docs/flight-validation/round2-results.md`. Do not use Emerald Streak or Vulcanite data.
- No push, no network. Run long commands detached with logs.
- Do not edit GOAL-HANDOFF.md or the release report.
