# Lane: fin-aft-anchor

## Pin

- Worktree: `.paseo/worktrees/3s8t98rp/fin-aft-anchor`, branch `fin-aft-anchor`
- Base: `10f0cf691f612cade167291efc3e2817aba05550` (`frontend/design` after the
  live-sizing-fix merges)
- Author model: OMP `deepseek/deepseek-flash` (catalog label "DeepSeek-V4.1-Flash"), effort `max`.

## Owner decision (2026-11-02)

Asked: "What should happen to fins (and other attached parts) when you shorten a
tube?" Owner chose **"Move with aft end"**: fins stay attached at the tube's back
end and slide forward as it shortens, like on a real rocket; existing files keep
their numbers.

## Why this lane exists

After `live-sizing-fix`, a child part can't overhang its parent tube, so the
tube-length minimum is the largest child end. On the NASA Student Launch example
(fins `axialOffset` 1.10 m + root chord 0.32 m on a 1.45 m booster,
`src/state/presets.ts`) the booster length slider floors at 1420 mm, so
shortening the tube is effectively blocked (coordinator probe on the built app).
Bounds code: `src/console/shell/partBounds.ts` (`parentTubeOf`,
`childAxialExtent`, `tubeChildEnds`); inspector caps in
`src/console/shell/Inspector.tsx` (`fieldMin`/`fieldMax`).

## Intended behavior (coordinator default; Gate 1 may refine)

- When the user changes a body tube's `length` in the inspector (typed field,
  unit scrub, arrow nudge, slider), every **fin set** (trapezoid, elliptical,
  freeform) whose parent is that tube keeps its distance from the tube's **aft
  end**: stage `axialOffset += Δlength` in the same staged edit as the length.
- **No schema or file-format change.** `axialOffset` keeps its stored meaning
  (meters from parent tube front). Saved/loaded files keep their numbers; only the
  edit gesture moves the fins.
- Parachutes and mass items stay front-anchored (payload/recovery bays are
  positioned from the front). They remain capped by the existing child-end rule;
  if they block a shortening, the tube's inspector already names them.
- New tube-length floor = largest end among remaining front-anchored children,
  and for fins: their root chord must still fit (length ≥ root chord when the
  offset would reach 0). Define the exact clamp in Gate 1.
- Undo/revert: reverting the tube length must restore the fins too (one staged
  change set). "Discard staged edits" already restores both.
- During a drag the shift is computed from the length at **gesture start**, not
  accumulated per step, so no drift from rounding.

## Out of scope

Engine/`crates/`/`src-tauri/`, aero/physics, presets' values, schema, file
format, gates, thresholds. No change to how the engine reads `axialOffset`.
Reordering parts, transitions, nose cone. `TASKS`/register/manifest/handoff.

## Non-negotiables

Same as `live-sizing-fix/ASSIGNMENT.md`: author cannot self-accept; no relaxed or
deleted tests; typed entry/scrub/nudge/revert keep working; sliders stage, runs
use committed inputs; `free -h` before builds/browser runs (stop < 2 GiB);
`vitest --maxWorkers=2`; kill servers/browsers after each check; no subagents;
no push/merge/release. Build needs `PATH=$HOME/.cargo/bin:$PATH` and
`pnpm --config.verify-deps-before-run=false build` (node_modules is a symlink).

## Gate 1 (before material edits)

Short design note: where the shift is applied (one place used by every length
edit path), how gesture-start length is captured for slider and scrub, exact
tube-length floor formula, how revert of a single field behaves (reverting
`length` alone vs the fins), multi-fin-set and freeform cases, and the falsifier
tests.

## Required evidence

Raw logs to `.paseo/worktrees/3s8t98rp/evidence-fin-aft-anchor/`.
- `npx tsc --noEmit`; `npx vitest run --maxWorkers=2 src/console`.
- New tests failing at base `10f0cf6`: shortening NSL booster 1.45 → 1.00 m moves
  fins 1.10 → 0.65 m and keeps fin aft end at the tube aft end; parachute/mass
  offsets unchanged; slider drag from 1450 to 1000 ends with exact offsets (no
  drift); revert/discard restores both.
- Built-surface Chromium probe: drag the booster length slider (start on the
  track) down to ~1000 mm; screenshots before/mid/after showing fins attached at
  the aft end; record offsets before/after.

## Report format

`RESULT.md` + `EVIDENCE.json` in this folder; reply with commit SHAs, files split
production/tests/docs, exact commands and results, what was not done, open
questions. Commit with `git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
