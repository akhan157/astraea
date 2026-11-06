# Lane: screenshots-refresh

## Pin

- Branch: created by T3 `delegate_task` (worktree isolation) from `frontend/design` at
  the commit that adds this file. Rename it to `screenshots-refresh`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.

## Why

Three UI lanes changed the visible product since the README and landing images were
captured: `ui-polish-2` (inspector auto-collapse, Aero table), `viewport-look` (3D view
look) and `flight-layout` (Flight canvas room). See their `REVIEW.md` files. The
images in `docs/screenshots/*.webp` (README) and `public/landing/*.webp` (landing page)
are now stale. `scripts/capture-screenshots.mjs` crops to a fixed workspace rectangle
(`WORKSPACE = { x: 319, y: 44, width: 956, height: 928 }`) that assumes the inspector is
always open, which is no longer true on Airframe and Aero.

## Scope

1. Make `scripts/capture-screenshots.mjs` derive its crop rectangles from the DOM
   (the stage `<main>` region and the dock), not hardcoded pixels. It must work whether
   the inspector is open or collapsed.
2. Add a mode (for example a `--readme` flag, or a second output set) that captures the
   five README images with the same file names: `design.webp` (Airframe with live
   stability and the mass budget), `aero-inputs.webp` (Aero with the built-up aero
   inputs and the fin airfoil controls visible, so a fin is selected), `flight.webp`
   (Flight timeline), `verify.webp` (Verify gates including the landing limit) and
   `live-sizing.webp` (a fin-span or outer-diameter slider mid-drag with the 3D view
   showing a valid shape, as `live-sizing-fix` required). Use the NASA Student Launch
   preset at 1600×1000, deviceScaleFactor 2, WebP quality 82, matching the existing script.
3. Run both captures from a fresh `pnpm build` and commit the regenerated images.
4. Check that `README.md`'s alt text and captions still describe what each new image
   shows. Change only wording that has become wrong; keep the README short.

## Non-negotiables

- **No image reading.** Your model cannot read images, and reading one crashes the
  session. Never open .png/.jpg/.webp. Verify captures by numbers: file exists, pixel
  dimensions, byte size > 20 KB, and DOM assertions taken before each shot (the right
  stage is active, the expected panel/tab is visible, the rocket canvas is present).
  The coordinator inspects the images visually.
- No product source changes (`src/**`), no engine changes. Only `scripts/capture-screenshots.mjs`,
  the regenerated `.webp` files, minimal README caption fixes and the top section of `CHANGELOG.md`.
- The author cannot self-accept. Run `free -h` before builds and browser runs. Kill
  servers and browsers when done. No subagents. No push, merge, release or publish.

## Gate

No design gate; this is mechanical. Implement, then report: commit SHAs, the commands
run, the per-image numeric checks, and any README wording changed. Write
`docs/internal/execution-runs/screenshots-refresh/RESULT.md`, then stop for coordinator
review. Commit with `git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
