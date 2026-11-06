# Lane: spaceport-landing

## Pin

- Branch: created by T3 `delegate_task` (worktree isolation) from `frontend/design` at the
  commit that adds this file. Rename it to `spaceport-landing`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.

## Why

The built-in "Spaceport America (practice)" example fails its Verify landing-speed gate:
touchdown at **184.3 m/s**, against a limit of 10.67 m/s. The other gates pass: apogee
5,126 m, Max Mach 1.68, margin 4.38 cal. The pre-research build `3685d91` fails it the
same way (5,130 m, 4.26 cal), so this is pre-existing and not caused by the P1/P2/P4
engine fixes (`docs/internal/execution-runs/viewport-env-restore/REVIEW.md`). A built-in
example that visibly fails a recovery gate blocks calling the frontend merge-ready. A
184 m/s touchdown reads as recovery never deploying or never slowing the vehicle.

## Gate 1: diagnose only (stop for approval)

Find the cause with evidence, then classify it:
- **(a) Preset data:** for example, a missing main or drogue, a deploy altitude above
  apogee, a parachute that is not attached, too small, or has the wrong Cd.
- **(b) App/engine defect:** recovery not triggered, or deployment suppressed above some
  Mach or altitude, or events dropped for supersonic or tall flights.
- **(c) Intended:** the preset deliberately lands ballistic, which is unlikely.

Cite code and data (`src/state/presets.ts`, the recovery events in the run, engine
recovery logic). Report the run's recovery events (times, altitudes, speeds) from the
Recovery stage or the run data, and compare with NASA Student Launch, which lands at
6.0 m/s.

Propose a fix with a recommendation:
- If **(a)**: the smallest preset change that gives a physically plausible recovery, with
  the source or reasoning for any value. A preset change shifts that example's results
  and is an owner-visible default. List the before/after numbers (apogee, landing speed,
  drift) so the coordinator can take it to the owner.
- If **(b)**: stop. Engine work belongs to the research session (`accuracy/integration`).
  Report the exact defect so the coordinator can hand it over. Do not edit `crates/`.

## Non-negotiables

- **No image reading.** Your model cannot read images, and reading one crashes the
  session. Use DOM, JSON and numbers only.
- No source edits before Gate 1 approval. No engine or physics edits in this lane at all.
- The author cannot self-accept. Run `free -h` first; `vitest --maxWorkers=2`. No
  subagents. No push or merge. Leave the `vite preview` on port 4173 alone.

## Report

Gate 1 note into `docs/internal/execution-runs/spaceport-landing/GATE1.md` (commit it),
evidence in `.paseo/worktrees/3s8t98rp/evidence-spaceport-landing/`.
