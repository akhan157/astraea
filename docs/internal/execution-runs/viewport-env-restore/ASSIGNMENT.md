# Lane: viewport-env-restore

## Pin

- Branch: created by T3 `delegate_task` (worktree isolation) from `frontend/design` at the
  commit that adds this file. Rename it to `viewport-env-restore`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.

## Owner direction (2026-11-05)

"I liked that you fixed bugs of the 3D view but I like the design of the previous 3D
view more. When I say the 3D view I'm talking about the space around the rocket and the
cube, the CAD-like cube. Keep the rocket-related changes."

## Restore exactly as at `ac805fc` (before `viewport-look`), in `src/console/viewport/Viewport.tsx`

- **Backdrop:** the container background
  `radial-gradient(ellipse at 50% 40%, #14171B 0%, #0B0C0E 70%)`, replacing the vertical
  linear gradient.
- **Grid:** the original `Grid` props: cellThickness 0.5, cellColor `#1C2025`,
  sectionThickness 0.8, sectionColor `#262B31`, fadeDistance `length * 4 + 4`. Keep the
  grid's position consistent with the current framing, so the rocket still sits above it.
- **No floor shadow:** remove the shadow-catcher mesh, the `castShadow` key light, the
  shadow map setup, the `ShadowRefresh` machinery and its `data-shadow-updates` probe,
  and `shadows` on the Canvas. Also remove the `castShadow` props added in `Vehicle3D.tsx`.
- **Cube:** restore `GizmoHelper alignment="bottom-right" margin={[64, 64]}` with
  `GizmoViewcube color="#16191D" textColor="#8B9199" strokeColor="#3D4249"
  hoverColor="#22414A" opacity={0.95}`. Remove `AxisGizmo` and its dynamic margin logic.
  Clicking a cube face must still orient the view.

## Keep (do not touch)

Everything rocket-related from `viewport-look` and later lanes:
- part colours and finishes (`appearance.ts`), section seams, the selection highlight and dim;
- auto-framing (`framing.ts`), including the Flight safe-region fit from `flight-layout`;
- the beta-aero geometry layout (`beta-aero-layout`);
- keep-last-layout and every other bug fix.

Lighting that shapes the rocket (hemisphere, key, rim and fill lights, and ACES tone
mapping) stays, minus shadow casting. If the old lighting
(`ambientLight 0.55` + two directional lights) is needed for the rocket to look as it
does now, say so in Gate 1.

## Watch out for

- The Flight safe-region fit currently assumes a top-right gizmo. With the cube back
  at bottom-right, the free region must exclude the cube's footprint (about 128×128 px at
  64-px margins), so the posed rocket never slides under it. The `flight-layout` and
  `viewport-look` browser assertions (free region ≥ 220 px at 1280×800, rocket ≥ 120 px,
  pose inside the free region, auto-frame 0.800) must keep passing. If one cannot,
  stop and report; do not weaken it.
- Remove only the shadow-specific browser assertion ("Flight playback refreshes the
  shadow map"), because the feature is removed. Replace it with an assertion that the
  viewcube is present at the bottom-right of the canvas and no shadow-catcher exists.
  Edit nothing else in the journeys.

## Non-negotiables

- **No image reading.** Your model cannot read images, and reading one crashes the
  session. Verify with DOM and numbers. The coordinator does the visual checks.
- No engine, physics, schema, preset or export changes. Change only `src/console/viewport/*`,
  their tests, `scripts/preview-journeys.mjs` (as described above) and `CHANGELOG.md`.
- The author cannot self-accept. Run `free -h` first. Use `vitest --maxWorkers=2`.
  No subagents. No push, merge or release. Leave the `vite preview` on port 4173 alone.

## Gate 1

Before editing, send: the exact list of code to remove or restore (file:line), what
stays, the plan for the cube in the Flight free region, and any lighting decision.
Then stop for approval.

## Report

`docs/internal/execution-runs/viewport-env-restore/RESULT.md` + `EVIDENCE.json`. Run tsc, the
full vitest suite, `pnpm build` and `pnpm test:browser`. Commit with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
