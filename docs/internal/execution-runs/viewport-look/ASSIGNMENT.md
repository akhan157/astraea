# Lane: viewport-look

## Pin

- Branch `viewport-look`, created by T3 `delegate_task` (worktree isolation) from
  `frontend/design` at the commit that adds this file (parent `88db90a`).
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.

## Why this lane exists

In the 2026-11-03 coordinator review of the built app, the 3D view was item 6: a
functional but unfinished surface. On 2026-11-04 the owner asked what "3D view look"
meant and was shown a mockup comparing today's view with a proposal. They said
"go ahead and show", then delegated the deferred items to the coordinator ("u decide").
The coordinator decided to build the proposed look.

Reference mockup (open it in a browser; drag to rotate):
`.paseo/worktrees/3s8t98rp/evidence-viewport-look/viewport-mock.html`, with a still
image `viewport-mock.png`. **Match the "Proposed" panel** as closely as the real
scene allows. It was built with plain three.js at the NASA preset's real dimensions.

What is wrong today (`src/console/viewport/Vehicle3D.tsx`, `Viewport.tsx`):
1. Every part draws in one flat grey. `RocketComponent.color` exists in the design
   data (`src/core/types.ts:57`) and the presets set it (`src/state/presets.ts`),
   but the viewport ignores it.
2. The rocket fills about a third of the canvas, and the rest is empty grid.
3. The `GizmoViewcube` (`Viewport.tsx:119-121`) is large and reads as floating
   mid-canvas next to the live readout card.
4. Flat lighting: fins and nose read as a silhouette.

## Decided look (coordinator)

- **Part colour:** use `component.color` when the design sets one. Otherwise derive a
  neutral tone from `materialId` (fibreglass, aluminium, carbon fibre, cardboard, …)
  so imported designs without colours still show part boundaries. Add a material
  finish: clearcoat-like for composites, metallic for aluminium. Selection and hover
  keep the existing accent/emissive behaviour, and the selected part must stay
  clearly distinguishable on every base colour.
- **Seams:** a thin dark ring at each section joint, so part boundaries are visible.
- **Framing:** auto-fit so the whole rocket, including fins, fills about 80% of the
  canvas's limiting dimension at the default ISO view. Refit when the vehicle length
  changes or the canvas resizes (for example when the inspector auto-collapses). Keep
  the existing view presets (ISO/SIDE/NOSE/AFT) and the reset-view button.
- **Gizmo:** small (about 56–64 px), tucked in the top-right corner, never overlapping
  the live readout card. A compact axis gizmo or a small viewcube are both fine.
  Clicking it should still orient the view, as today, if the current gizmo supports that.
- **Lighting:** hemisphere fill, a key light with soft shadows onto an invisible
  shadow-catching floor, and a cool rim light. Use ACES tone mapping and a subtle
  vertical gradient backdrop in the app's dark palette. Keep or soften the grid. It
  must not dominate.
- **Flight stage:** the upright, attitude-posed rocket in Flight gets the same
  materials and lighting. The scrubber/attitude behaviour is unchanged.

## Non-negotiables

- **No numerical change.** Geometry still comes from the native stability `layout`.
  CG/CP marker positions, the ghost/compare overlay, the parachute and motor
  overlays, hover and click selection, keep-last-layout during drags
  (`layoutPersistence.test.tsx`) and the WebGL-loss fallback (`webgl.test.tsx`) all
  behave exactly as before. Existing viewport tests keep their meaning.
- **Performance:** the live-sizing drag must stay smooth. Shadow map at most 2048, and
  shadows only from the key light. Measure the frame time during a slider drag at
  1280×800, before and after, in Chromium (SwiftShader numbers are acceptable as a
  relative comparison). A regression above 25% must be reported, not hidden.
- Respect `prefers-reduced-motion`: no camera tween animation if you add one.
- The production CSP (`dist/_headers`) must still pass. No new runtime network loads
  (no remote HDR or environment files). Generate any environment or gradient procedurally.
- In scope: `src/console/viewport/*` and their tests, a small colour/material helper
  module if needed, the top section of `CHANGELOG.md`, and `scripts/preview-journeys.mjs`
  (add assertions only).
- Out of scope: engine, schema, presets' values, exports, the inspector/aero/stage
  files changed by `ui-polish-2`, README, `docs/screenshots/`, `public/landing/`
  (the coordinator decides on recapture after review), the register, manifest, board
  and handoff.
- The author cannot self-accept. Run `free -h` before heavy steps and stop below
  2 GiB available. Use `vitest --maxWorkers=2`, and kill servers and browsers when done.
  No subagents. No push, merge, release or publish.

## Gate 1 (before material edits)

Send a design note and **stop until the coordinator approves**:
- Material mapping: the colour source order, the material→tone and finish table, and
  how selection and hover stay legible.
- Framing math: what is fitted (bounding box or sphere, fins included), when it refits,
  and how it interacts with the user's orbit (does a refit fight a user who has rotated?
  Propose a rule).
- Gizmo choice and placement; lighting/shadow setup and its cost.
- Falsifiers: unit tests (for example, the colour resolver; framing fits a known
  vehicle to 75–85% of the width), plus a browser probe measuring the rocket's
  screen-space bounding box fraction and the gizmo's position, at base and after.

## Required evidence

Evidence goes in `.paseo/worktrees/3s8t98rp/evidence-viewport-look/`.
- `npx tsc --noEmit`, focused viewport tests, and the full suite
  `npx vitest run --maxWorkers=2` (tails).
- `pnpm build` and `pnpm test:browser` (tail).
- Screenshots at 1600×1000 and 1280×800 of Airframe (no selection, and with a fin
  selected), Aero and Flight (upright pose), before and after. One side-by-side
  image next to the mockup.
- Drag frame-time numbers, before and after.

## Report format

`docs/internal/execution-runs/viewport-look/RESULT.md` + `EVIDENCE.json`. Reply with
commit SHAs, files changed, exact commands and results, measured numbers, what was not
done, and open questions. Commit with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
