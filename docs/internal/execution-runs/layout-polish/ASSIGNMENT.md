# Lane: layout-polish

## Pin

- Branch: created by T3 `delegate_task` (worktree isolation) from `frontend/design` at the
  commit that adds this file (parent `208aa5f`). Rename it to `layout-polish`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.
- Approval: the owner queued UI items 6c–6e via the input session (thread c8b84f3d), 2026-11-06/07.

## Owner rule: minimal change

Keep the layout, labels, wording, colours and components as they are. Only resize,
refit or reflow. No new UI elements, no restyling, no relabelling. (The owner rejected a
redesign that "changed the UI and labeling more than needed".)

## Items

- **6c. Monte Carlo panel at 1600×1000.** In Flight → Monte Carlo after a run, the panel
  (scatter, ring legend, stats) does not fit the Flight dock's default height (about 298 px);
  the screenshot script has to drag the dock to 720 px. Make the landing scatter scale to
  the available height, so the plot, its ring legend, the Run button and the outcome
  counts are visible at the default dock height without scrolling at 1600×1000 and
  1280×800. Smaller text is not an acceptable fix.
- **6d. Flight at 800×600** (the app's minimum size). The 3D canvas is 161 px and the
  posed rocket about 78 px tall. Improve it if possible without breaking the
  `flight-layout` guarantees (1280 free region ≥ 220 px, Monte Carlo controls fully
  visible at 1280×800, RMP15-C05 header fit at 800×600). If no improvement is possible
  without a trade-off, report the trade-off and do nothing.
- **6e. Mass-budget names at 1280×800** with the inspector open. Long part names
  ("High-Power Clipped Delta Fins", "Main Parachute (700ft AGL)") wrap to two lines. Keep
  each name on one line where the table width allows, by letting the name column take
  width from the share bar. No truncation that hides text: if a name still cannot fit,
  wrapping stays.

## Non-negotiables

- **No image reading.** Your model cannot read images, and reading one crashes the
  session. Verify with DOM rects and numbers; the coordinator does the visual checks.
- No engine, physics, schema, preset or export changes. No relaxed or removed
  assertions. Add journey assertions only.
- The author cannot self-accept. Run `free -h` first; `vitest --maxWorkers=2`; long
  commands in the foreground. No subagents. No push or merge.

## Gate 1 (stop for approval)

Measure at base: the Monte Carlo panel's needed vs available height at 1600×1000 and
1280×800; the 800×600 canvas and rocket heights; mass-name line counts at 1280×800
inspector-open. Propose the exact change per item, with expected numbers and a
falsifier (an assertion that fails at base).

## Report

`docs/internal/execution-runs/layout-polish/RESULT.md` + `EVIDENCE.json`; evidence in
`.paseo/worktrees/3s8t98rp/evidence-layout-polish/`. Run tsc, the full vitest suite,
`pnpm build` and `pnpm test:browser`. Commit with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
